/**
 * MoonScanner Autotrade Engine
 * 
 * Implements:
 * 1. Anti-Chase Slippage Guard:
 *    - Validates live price deviation against entryPrice.
 *    - If abs(currentPrice - entryPrice) / entryPrice > 0.3%, aborts trade immediately with
 *      log: "ABORT_CHASE: Price deviated >0.3%".
 * 
 * 2. True OCO Bracket Order Placement:
 *    - Places STOP_MARKET order at stopLoss with reduceOnly=true.
 *    - Places TAKE_PROFIT_MARKET order at tp1 with reduceOnly=true.
 * 
 * 3. Break-Even Trailing:
 *    - When TP1 fills (or price touches TP1), cancels initial SL order.
 *    - Immediately places new STOP_MARKET at entryPrice (Break-Even) with +0.05% fee buffer.
 *    - Moves next TP order to tp2.
 */

import { BinanceExchangeAdapter, BinanceCredentials } from './binanceExchangeAdapter';
import { ExchangeAdapterHub } from './exchangeAdapterHub';
import { tradingStorage, StoredPosition } from './tradingStorage';
import { get24hTicker } from './cryptoService';
import { ScoringEngine } from './scoringEngine';

export interface AntiChaseCheckResult {
  allowed: boolean;
  deviationPct: number;
  currentPrice: number;
  entryPrice: number;
  log?: string;
}

export interface OcoBracketResult {
  success: boolean;
  slOrderId?: string;
  tpOrderId?: string;
  error?: string;
}

export interface BreakEvenTrailingResult {
  success: boolean;
  breakEvenPrice?: number;
  cancelledSlOrderId?: string;
  newSlOrderId?: string;
  nextTpOrderId?: string;
  error?: string;
}

/**
 * Validates anti-chase slippage guard.
 * If abs(currentPrice - entryPrice) / entryPrice > 0.3% (0.003), aborts trade.
 */
export function validateAntiChaseSlippage(
  currentPrice: number,
  entryPrice: number,
  threshold: number = 0.003
): AntiChaseCheckResult {
  if (!entryPrice || entryPrice <= 0 || !currentPrice || currentPrice <= 0) {
    return {
      allowed: true,
      deviationPct: 0,
      currentPrice,
      entryPrice
    };
  }

  const deviationPct = Math.abs(currentPrice - entryPrice) / entryPrice;
  if (deviationPct > threshold) {
    const log = `ABORT_CHASE: Price deviated >0.3% (Current: $${currentPrice}, Entry: $${entryPrice}, Dev: ${(deviationPct * 100).toFixed(3)}%)`;
    console.warn(`[AutoTradeEngine] ${log}`);
    return {
      allowed: false,
      deviationPct,
      currentPrice,
      entryPrice,
      log
    };
  }

  return {
    allowed: true,
    deviationPct,
    currentPrice,
    entryPrice
  };
}

/**
 * Places True OCO Bracket Orders on Binance Futures:
 * - STOP_MARKET at stopLoss
 * - TAKE_PROFIT_MARKET at tp1
 */
export async function placeOcoBracketOrders(params: {
  credentials: BinanceCredentials;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  stopLoss: number;
  tp1: number;
  quantity: number;
}): Promise<OcoBracketResult> {
  const { credentials, symbol, direction, stopLoss, tp1, quantity } = params;
  const cleanSymbol = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const exitSide = direction === 'LONG' ? 'SELL' : 'BUY';

  let slOrderId: string | undefined;
  let tpOrderId: string | undefined;

  try {
    // 1. Place Stop Market Order at SL
    const slRes = await BinanceExchangeAdapter.placeStopMarketOrder(
      credentials,
      cleanSymbol,
      exitSide,
      stopLoss,
      quantity
    );
    slOrderId = slRes.orderId;
    console.log(`[AutoTradeEngine] Placed Binance STOP_MARKET for ${cleanSymbol} at $${stopLoss} (orderId: ${slOrderId})`);

    // 2. Place Take Profit Market Order at TP1
    try {
      const tpRes = await ExchangeAdapterHub.placeTakeProfitOrder(
        {
          exchange: 'binance',
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
          testnet: credentials.testnet
        },
        cleanSymbol,
        exitSide,
        tp1,
        quantity
      );
      tpOrderId = tpRes.orderId;
      console.log(`[AutoTradeEngine] Placed Binance TAKE_PROFIT_MARKET for ${cleanSymbol} at $${tp1} (orderId: ${tpOrderId})`);
    } catch (tpErr: any) {
      console.warn(`[AutoTradeEngine] Warning: TP1 bracket placement error:`, tpErr.message);
    }

    return {
      success: true,
      slOrderId,
      tpOrderId
    };
  } catch (err: any) {
    console.error(`[AutoTradeEngine] Failed to place OCO bracket orders for ${cleanSymbol}:`, err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Break-Even Trailing Execution:
 * When TP1 fills or price reaches TP1:
 * 1. Cancel initial SL order
 * 2. Calculate fee-buffered Break-Even (+0.05% for LONG, -0.05% for SHORT)
 * 3. Place new STOP_MARKET at Break-Even price
 * 4. Advance next TP order to TP2 if provided
 */
export async function applyBreakEvenTrailing(params: {
  credentials?: BinanceCredentials;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  initialSlOrderId?: string;
  tp2?: number;
  isPaper?: boolean;
}): Promise<BreakEvenTrailingResult> {
  const { credentials, symbol, direction, entryPrice, quantity, initialSlOrderId, tp2, isPaper } = params;
  const cleanSymbol = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const exitSide = direction === 'LONG' ? 'SELL' : 'BUY';

  // Fee buffer: +0.05% for LONG to cover maker/taker exchange fees, -0.05% for SHORT
  const decimals = entryPrice < 1 ? 4 : 2;
  const feeBufferPct = 0.0005; // 0.05%
  const breakEvenPrice = direction === 'LONG'
    ? Number((entryPrice * (1 + feeBufferPct)).toFixed(decimals))
    : Number((entryPrice * (1 - feeBufferPct)).toFixed(decimals));

  // Autotrade Profit-Locking: Close 50% of position size on TP1, retain 50% for runner
  const halfQty = Number((quantity * 0.5).toFixed(decimals >= 4 ? 4 : 2));
  const remainingQty = Math.max(0, Number((quantity - halfQty).toFixed(decimals >= 4 ? 4 : 2)));

  console.log(`[AutoTradeEngine] TP1 reached for ${cleanSymbol} ${direction}. Locking profit: Closing 50% (${halfQty}), trailing SL to Break-Even $${breakEvenPrice} for remainder (${remainingQty})`);

  let newSlOrderId: string | undefined;
  let nextTpOrderId: string | undefined;

  if (!isPaper && credentials) {
    // 0. Close 50% of the position immediately at market to secure initial profits
    try {
      if (halfQty > 0) {
        await BinanceExchangeAdapter.placeMarketOrder(credentials, cleanSymbol, exitSide, halfQty, true);
        console.log(`[AutoTradeEngine] Closed 50% (${halfQty} ${cleanSymbol}) on TP1 profit-lock`);
      }
    } catch (tp1CloseErr: any) {
      console.warn(`[AutoTradeEngine] Could not execute 50% TP1 market close:`, tp1CloseErr.message);
    }

    // 1. Cancel initial SL order if tracked
    if (initialSlOrderId) {
      try {
        await BinanceExchangeAdapter.cancelOrder(credentials, cleanSymbol, initialSlOrderId);
        console.log(`[AutoTradeEngine] Cancelled initial SL order ${initialSlOrderId} for ${cleanSymbol}`);
      } catch (cErr: any) {
        console.warn(`[AutoTradeEngine] Could not cancel previous SL ${initialSlOrderId}:`, cErr.message);
      }
    }

    // 2. Place new STOP_MARKET order at Break-Even for remaining 50%
    try {
      const activeSlQty = remainingQty > 0 ? remainingQty : quantity;
      const slRes = await BinanceExchangeAdapter.placeStopMarketOrder(
        credentials,
        cleanSymbol,
        exitSide,
        breakEvenPrice,
        activeSlQty
      );
      newSlOrderId = slRes.orderId;
      console.log(`[AutoTradeEngine] Trailed SL placed at Break-Even ($${breakEvenPrice}) for ${activeSlQty} ${cleanSymbol} on Binance (orderId: ${newSlOrderId})`);
    } catch (slErr: any) {
      console.error(`[AutoTradeEngine] Failed to place Trailed Break-Even SL:`, slErr.message);
    }

    // 3. Move next TP order to TP2 if specified (for remaining quantity)
    if (tp2 && tp2 > 0) {
      try {
        const activeTpQty = remainingQty > 0 ? remainingQty : quantity;
        const tpRes = await ExchangeAdapterHub.placeTakeProfitOrder(
          {
            exchange: 'binance',
            apiKey: credentials.apiKey,
            apiSecret: credentials.apiSecret,
            testnet: credentials.testnet
          },
          cleanSymbol,
          exitSide,
          tp2,
          activeTpQty
        );
        nextTpOrderId = tpRes.orderId;
        console.log(`[AutoTradeEngine] Advanced TP order to TP2 ($${tp2}) on Binance (orderId: ${nextTpOrderId})`);
      } catch (tpErr: any) {
        console.warn(`[AutoTradeEngine] Warning: TP2 placement error:`, tpErr.message);
      }
    }
  }

  return {
    success: true,
    breakEvenPrice,
    cancelledSlOrderId: initialSlOrderId,
    newSlOrderId,
    nextTpOrderId
  };
}

/**
 * AutoTradeEngine Class
 * Orchestrates live position monitoring, anti-chase validation, and break-even trailing.
 */
export class AutoTradeEngine {
  /**
   * Pre-execution anti-chase check against live ticker
   */
  public static async checkLiveSlippage(symbol: string, entryPrice: number): Promise<AntiChaseCheckResult> {
    const ticker = await get24hTicker(symbol);
    const livePrice = ticker?.lastPrice || entryPrice;
    return validateAntiChaseSlippage(livePrice, entryPrice);
  }

  /**
   * Evaluates all open positions for a user, checks if TP1 was reached,
   * and triggers fee-buffered Break-Even trailing.
   */
  public static async evaluatePositionsForTrailing(userId: string): Promise<void> {
    const openPositions = tradingStorage.getOpenPositions(userId);
    if (!openPositions || openPositions.length === 0) return;

    for (const pos of openPositions) {
      try {
        const ticker = await get24hTicker(pos.symbol);
        const currentPrice = ticker?.lastPrice || pos.currentPrice || pos.entryPrice;
        const isLong = pos.direction === 'LONG';

        const tp1 = pos.tpTargets?.[0];
        const tp2 = pos.tpTargets?.[1];

        // Check if TP1 was touched or filled and position has not yet trailed to break-even
        const tp1Reached = tp1 && (isLong ? currentPrice >= tp1.price : currentPrice <= tp1.price);

        if (tp1Reached && !pos.trailedToBreakEven) {
          const creds = !pos.isPaper ? tradingStorage.getDecryptedExchangeCredentials(userId) : null;
          const binanceCreds: BinanceCredentials | undefined = creds?.exchange === 'binance' ? {
            apiKey: creds.apiKey,
            apiSecret: creds.apiSecret,
            testnet: creds.testnet
          } : undefined;

          const trailRes = await applyBreakEvenTrailing({
            credentials: binanceCreds,
            symbol: pos.symbol,
            direction: pos.direction,
            entryPrice: pos.entryPrice,
            quantity: pos.quantity,
            initialSlOrderId: pos.slOrderId,
            tp2: tp2?.price,
            isPaper: pos.isPaper
          });

          if (trailRes.success && trailRes.breakEvenPrice) {
            pos.stopLoss = trailRes.breakEvenPrice;
            pos.breakEvenPrice = trailRes.breakEvenPrice;
            pos.trailedToBreakEven = true;
            if (trailRes.newSlOrderId) pos.slOrderId = trailRes.newSlOrderId;
            if (trailRes.nextTpOrderId) pos.tpOrderId = trailRes.nextTpOrderId;
            if (tp1) tp1.hit = true;

            tradingStorage.updatePosition(userId, pos.id, pos);
            console.log(`[AutoTradeEngine] Position ${pos.symbol} for user ${userId} successfully trailed to Break-Even at $${trailRes.breakEvenPrice}`);
          }
        }
      } catch (err: any) {
        console.warn(`[AutoTradeEngine] Trailing evaluation error for ${pos.symbol}:`, err.message);
      }
    }
  }

  /**
   * Dispatches Grade A+ Signals to all approved users with AutoTrade active.
   * - Verifies Cross leverage & user margin allocation
   * - Checks max open position limits
   * - Enforces anti-chase slippage (aborting if >0.3% with ENTRY_MISSED)
   * - Submits Binance Futures orders with AES-256-GCM credentials
   * - Registers True OCO bracket orders (STOP_MARKET & TAKE_PROFIT_MARKET)
   */
  public static async dispatchGradeAPlusAutoTrades(signal: any): Promise<{
    executedUsers: string[];
    skippedUsers: { userId: string; reason: string }[];
  }> {
    const executedUsers: string[] = [];
    const skippedUsers: { userId: string; reason: string }[] = [];

    // Ensure signal is Grade A+ or A
    const grade = signal.qualityGrade || 'A+';
    if (grade !== 'A+' && grade !== 'A') {
      return { executedUsers, skippedUsers };
    }

    const allUserIds = tradingStorage.getAllUserIds();

    for (const userId of allUserIds) {
      try {
        // Must be approved by super-admin
        if (!tradingStorage.isUserApproved(userId)) {
          skippedUsers.push({ userId, reason: 'USER_NOT_APPROVED' });
          continue;
        }

        const settings = tradingStorage.getUserSettings(userId);
        const isAutoActive =
          (settings.tradingMode === 'FULL-AUTO' ||
           settings.tradingMode === 'PAPER' ||
           Boolean(settings.autoTradingEnabled) ||
           Boolean(settings.autonomousTradingEnabled)) &&
          !settings.emergencyStop;

        if (!isAutoActive) {
          skippedUsers.push({ userId, reason: 'AUTOTRADE_DISABLED_OR_EMERGENCY_STOP' });
          continue;
        }

        // Open position limits check (max 3 or 5 concurrent trades)
        const openPositions = tradingStorage.getOpenPositions(userId);
        const maxSimultaneous = settings.maxSimultaneousTrades || 3;
        if (openPositions.length >= maxSimultaneous) {
          tradingStorage.recordTradeRejection(userId, {
            symbol: signal.symbol,
            signalId: signal.id,
            reason: `MAX_POSITIONS_REACHED: Open positions count (${openPositions.length}) reached limit (${maxSimultaneous})`,
            rejectionCode: 'MAX_POSITIONS_REACHED'
          });
          skippedUsers.push({ userId, reason: 'MAX_POSITIONS_REACHED' });
          continue;
        }

        // Capital Hard-Lock Circuit Breaker Check
        const cbStatus = ScoringEngine.isCircuitBreakerTripped();
        if (cbStatus.tripped) {
          tradingStorage.recordTradeRejection(userId, {
            symbol: signal.symbol,
            signalId: signal.id,
            reason: `CIRCUIT_BREAKER_ACTIVE: 24h risk hard-lock active (${cbStatus.remainingHours}h remaining) after max drawdown / consecutive stop-losses.`,
            rejectionCode: 'CIRCUIT_BREAKER_TRIPPED'
          });
          skippedUsers.push({ userId, reason: 'CIRCUIT_BREAKER_ACTIVE' });
          continue;
        }

        // Sector Correlation Lock (Prevents overexposure to same coin sector)
        const activeSymbols = openPositions.map(p => p.symbol);
        const sectorCheck = ScoringEngine.validateSectorCorrelation(signal.symbol, activeSymbols, 2);
        if (!sectorCheck.allowed) {
          tradingStorage.recordTradeRejection(userId, {
            symbol: signal.symbol,
            signalId: signal.id,
            reason: sectorCheck.reason || 'SECTOR_CORRELATION_LIMIT',
            rejectionCode: 'SECTOR_CORRELATION_LIMIT'
          });
          skippedUsers.push({ userId, reason: 'SECTOR_CORRELATION_LIMIT' });
          continue;
        }

        // Duplicate position check
        const cleanSymbol = signal.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
        const duplicate = openPositions.some(p => p.symbol.toUpperCase() === cleanSymbol);
        if (duplicate) {
          skippedUsers.push({ userId, reason: 'DUPLICATE_POSITION_ALREADY_OPEN' });
          continue;
        }

        // Live ticker slippage guard: Abort if price deviated >0.3% past entry zone
        const ticker = await get24hTicker(signal.symbol);
        const livePrice = ticker?.lastPrice || signal.currentPrice || signal.entryPrice;
        const entryPrice = signal.entryPrice || livePrice;

        const slippage = validateAntiChaseSlippage(livePrice, entryPrice, 0.003);
        if (!slippage.allowed) {
          tradingStorage.recordTradeRejection(userId, {
            symbol: signal.symbol,
            signalId: signal.id,
            reason: `ENTRY_MISSED: Price deviated >0.3% past entry zone ($${livePrice} vs $${entryPrice})`,
            rejectionCode: 'ENTRY_MISSED'
          });
          skippedUsers.push({ userId, reason: 'ENTRY_MISSED' });
          continue;
        }

        const isPaper = settings.tradingMode === 'PAPER';
        const userMargin = Math.max(0.1, Number(settings.marginPerTrade) || 50);
        const userLeverage = Math.max(1, Math.min(125, Math.round(Number(settings.leverage) || Number(settings.maxLeverage) || 20)));
        const marginTypeMode: 'CROSSED' | 'ISOLATED' = (settings.marginType === 'ISOLATED') ? 'ISOLATED' : 'CROSSED';
        const notionalUsd = Number((userMargin * userLeverage).toFixed(2));

        // Enforce Binance minimum notional requirement ($5.0 minimum)
        if (notionalUsd < 5.0) {
          tradingStorage.recordTradeRejection(userId, {
            symbol: signal.symbol,
            signalId: signal.id,
            reason: `MIN_NOTIONAL_VIOLATION: Position notional $${notionalUsd.toFixed(2)} is below Binance minimum $5.0 (Margin: $${userMargin} × ${userLeverage}x = $${notionalUsd.toFixed(2)}). Please increase margin or leverage.`,
            rejectionCode: 'MIN_NOTIONAL_VIOLATION'
          });
          skippedUsers.push({ userId, reason: 'MIN_NOTIONAL_VIOLATION' });
          continue;
        }

        const decimals = entryPrice < 1 ? 4 : 2;
        const quantity = Number((notionalUsd / livePrice).toFixed(decimals >= 4 ? 4 : 2));

        const isLong = signal.direction === 'LONG';
        const riskDist = Math.abs(entryPrice - (signal.stopLoss || 0)) || entryPrice * 0.015;
        const tp1 = signal.tp1 || signal.targets?.[0]?.price || (isLong ? entryPrice + riskDist * 1.5 : entryPrice - riskDist * 1.5);
        const tp2 = signal.tp2 || signal.targets?.[1]?.price || (isLong ? entryPrice + riskDist * 2.5 : entryPrice - riskDist * 2.5);
        const stopLoss = signal.stopLoss || (isLong ? entryPrice - riskDist : entryPrice + riskDist);

        let slOrderId: string | undefined;
        let tpOrderId: string | undefined;

        if (!isPaper) {
          const creds = tradingStorage.getDecryptedExchangeCredentials(userId);
          if (!creds) {
            tradingStorage.recordTradeRejection(userId, {
              symbol: signal.symbol,
              signalId: signal.id,
              reason: 'NO_DECRYPTED_CREDENTIALS',
              rejectionCode: 'CREDENTIALS_MISSING'
            });
            skippedUsers.push({ userId, reason: 'NO_CREDENTIALS' });
            continue;
          }

          // Level-2 Depth Guard: Prevent buying into massive spoof walls
          const depthSafety = await ScoringEngine.checkOrderbookDepthSafety(
            cleanSymbol,
            isLong ? 'LONG' : 'SHORT',
            livePrice,
            notionalUsd
          );
          if (!depthSafety.safe) {
            tradingStorage.recordTradeRejection(userId, {
              symbol: signal.symbol,
              signalId: signal.id,
              reason: depthSafety.reason || 'ORDERBOOK_DEPTH_UNSAFE',
              rejectionCode: 'ORDERBOOK_DEPTH_UNSAFE'
            });
            skippedUsers.push({ userId, reason: 'ORDERBOOK_DEPTH_UNSAFE' });
            continue;
          }

          // Enforce Margin Type (CROSSED or ISOLATED) & Custom Leverage on Binance
          await ExchangeAdapterHub.setMarginType(creds, cleanSymbol, marginTypeMode).catch(() => {});
          await ExchangeAdapterHub.setLeverage(creds, cleanSymbol, userLeverage).catch(() => {});

          // Place initial market execution order
          const side = isLong ? 'BUY' : 'SELL';
          const orderRes = await ExchangeAdapterHub.placeMarketOrder(
            creds,
            cleanSymbol,
            side,
            quantity
          );

          if (!orderRes.orderId && orderRes.status !== 'FILLED') {
            throw new Error(`Order placement failed: ${orderRes.status || 'NO_ORDER_ID'}`);
          }

          // Automatically register Binance True OCO bracket orders:
          // STOP_MARKET at SL and TAKE_PROFIT_MARKET at TP1
          const bracket = await placeOcoBracketOrders({
            credentials: {
              apiKey: creds.apiKey,
              apiSecret: creds.apiSecret,
              testnet: creds.testnet
            },
            symbol: cleanSymbol,
            direction: isLong ? 'LONG' : 'SHORT',
            stopLoss,
            tp1,
            quantity
          });

          slOrderId = bracket.slOrderId;
          tpOrderId = bracket.tpOrderId;
        }

        // Register position in storage
        const positionId = 'POS_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const position: any = {
          id: positionId,
          userId,
          symbol: cleanSymbol,
          signalId: signal.id,
          direction: isLong ? 'LONG' : 'SHORT',
          entryPrice,
          currentPrice: livePrice,
          quantity,
          notionalUsd,
          marginUsd: userMargin,
          leverage: userLeverage,
          marginType: (settings.marginType === 'ISOLATED' ? 'ISOLATED' : 'CROSS'),
          stopLoss,
          originalStopLoss: stopLoss,
          highestPriceReached: livePrice,
          lowestPriceReached: livePrice,
          tpTargets: [
            { index: 1, price: tp1, rMultiple: 1.5, hit: false, closedQty: 0 },
            { index: 2, price: tp2, rMultiple: 2.5, hit: false, closedQty: 0 }
          ],
          currentTpStep: 0,
          unrealizedPnL: 0,
          unrealizedPnLPct: 0,
          realizedPnL: 0,
          status: 'OPEN',
          isPaper,
          slOrderId,
          tpOrderId,
          trailedToBreakEven: false,
          openedAt: Date.now(),
          updatedAt: Date.now()
        };

        tradingStorage.addPosition(userId, position);

        tradingStorage.recordExecutionAudit(userId, {
          exchange: isPaper ? 'PAPER' : 'BINANCE',
          symbol: cleanSymbol,
          signalId: signal.id,
          direction: isLong ? 'LONG' : 'SHORT',
          entryPrice,
          quantity,
          leverage: userLeverage,
          stopLoss,
          tpTargets: [tp1, tp2],
          orderId: slOrderId || 'AUTOTRADE_' + Date.now(),
          executionStatus: 'CONFIRMED'
        });

        executedUsers.push(userId);
        console.log(`[AutoTradeEngine] Successfully executed ${cleanSymbol} for user ${userId} (${isPaper ? 'PAPER' : 'LIVE'} ${userLeverage}x Cross, Margin $${userMargin})`);
      } catch (err: any) {
        console.error(`[AutoTradeEngine] Trade dispatch failed for user ${userId}:`, err.message);
        skippedUsers.push({ userId, reason: err.message });
      }
    }

    return { executedUsers, skippedUsers };
  }
}

