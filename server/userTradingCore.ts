import crypto from 'crypto';
import {
  tradingStorage,
  StoredTradingSettings,
  StoredPosition,
  StoredTradeRecord
} from './tradingStorage';
import { UserRiskEngine } from './userRiskEngine';
import { ExchangeAdapterHub } from './exchangeAdapterHub';
import { getAllStoredSignals } from './signalTracker';
import { rankMarketOpportunities } from './signalEngine';
import { get24hTicker } from './cryptoService';
import { Top5ActionableSignal } from '../src/types/trading';
import { Signal } from '../src/types/crypto';
import { validateAntiChaseSlippage, AutoTradeEngine } from './autotradeEngine';
import { dispatchTelegramLifecycleAlert } from './telegramService';

export class UserTradingCore {
  private static activeExecutionLocks = new Set<string>();
  private static executedFingerprints = new Map<string, number>();

  /**
   * Retrieves the current Top 5 ranked signals from MoonScanner Core Intelligence
   * and annotates them with user-specific AI Trading Core evaluation.
   */
  public static async getTop5ActionableSignals(userId: string): Promise<Top5ActionableSignal[]> {
    const allSignals = getAllStoredSignals();
    if (!allSignals || allSignals.length === 0) {
      return [];
    }

    // Step 1: Filter signals using the authoritative Elite Opportunity qualification logic:
    // - Grade must be A+ or A
    // - Must have valid Entry, Structural SL, and valid structural targets
    // - Expected move >= 30% OR genuine Pre-Move with coil score >= 35
    // - Anti-chase protection: must not be chase-exhausted or extended
    // - Favorable R:R >= 1.5:1
    // FULL-AUTO must NEVER execute an ordinary signal merely because it ranks in generic Top-5
    const qualifiedSignals = allSignals.filter(s => {
      if (!s || s.entryPrice <= 0 || (s.direction as any) === 'WAIT') return false;
      if (s.qualityGrade !== 'A+' && s.qualityGrade !== 'A') return false;

      const isLong = s.direction === 'LONG';
      const isSlValid = isLong
        ? (s.stopLoss > 0 && s.stopLoss < s.entryPrice)
        : (s.stopLoss > 0 && s.stopLoss > s.entryPrice);
      if (!isSlValid) return false;

      const validTargets = (s.targets || []).filter(
        t => typeof t.price === 'number' && t.price > 0 && t.status !== 'INVALIDATED'
      );
      if (validTargets.length === 0) return false;

      const movePct = isLong
        ? Math.max(...validTargets.map(t => ((t.price - s.entryPrice) / s.entryPrice) * 100))
        : Math.max(...validTargets.map(t => ((s.entryPrice - t.price) / s.entryPrice) * 100));

      const isPreMove = Boolean(s.preMoveReport && s.preMoveReport.coilScore >= 35);
      if (movePct < 30.0 && !isPreMove) return false;

      const curPrice = s.currentPrice || s.entryPrice;
      const isChaseExhausted = Boolean(
        s.largeMoveIntelligence?.isAlreadyExtended ||
        s.largeMoveIntelligence?.antiChaseActive ||
        s.entryStatus === 'ENTRY_MISSED' ||
        (s.preMoveReport && s.preMoveReport.noChaseLevel > 0 && (isLong ? curPrice > s.preMoveReport.noChaseLevel : curPrice < s.preMoveReport.noChaseLevel))
      );
      if (isChaseExhausted) return false;

      const effectiveRisk = Math.abs(s.entryPrice - s.stopLoss);
      const rr = s.riskRewardRatio || (effectiveRisk > 0 ? Math.abs(validTargets[0].price - s.entryPrice) / effectiveRisk : 0);
      if (rr < 1.5) return false;

      return true;
    });

    if (qualifiedSignals.length === 0) {
      return [];
    }

    // Sort strictly by conviction: moonScore + preMove coilScore
    qualifiedSignals.sort((a, b) => {
      const scoreA = (a.moonScore || 0) + (a.preMoveReport?.coilScore || 0);
      const scoreB = (b.moonScore || 0) + (b.preMoveReport?.coilScore || 0);
      return scoreB - scoreA;
    });

    // Deduplicate same coin: keep only the single highest-scoring setup for each coin
    const processedCoins = new Set<string>();
    const top5Signals: Signal[] = [];
    for (const sig of qualifiedSignals) {
      const normSym = sig.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
      if (!processedCoins.has(normSym)) {
        processedCoins.add(normSym);
        top5Signals.push(sig);
        if (top5Signals.length >= 5) break;
      }
    }

    // Step 2: Retrieve user settings & isolation context
    const settings = tradingStorage.getUserSettings(userId);
    const openPositions = tradingStorage.getOpenPositions(userId);
    const todayLoss = tradingStorage.getTodayRealizedLoss(userId);

    // Get balance context
    let equity = settings.paperBalanceUsd;
    let available = settings.paperBalanceUsd;
    let liveAvailable = true;

    if (settings.tradingMode === 'SEMI-AUTO' || settings.tradingMode === 'FULL-AUTO') {
      const creds = tradingStorage.getDecryptedExchangeCredentials(userId);
      if (creds) {
        try {
          const exBalance = await ExchangeAdapterHub.getAccountBalance(creds);
          equity = exBalance.totalEquity;
          available = exBalance.availableBalance;
        } catch (e: any) {
          console.warn(`[UserTradingCore] Live exchange balance check failed for ${userId}:`, e.message);
          equity = 0;
          available = 0;
          liveAvailable = false;
        }
      } else {
        equity = 0;
        available = 0;
        liveAvailable = false;
      }
    }

    const recentTrades = tradingStorage.getUserTrades(userId);

    // Step 3: Evaluate each Top 5 signal against user-specific risk rules
    return top5Signals.map(sig => {
      const entryP = sig.entryPrice || sig.currentPrice;
      const formattedTargets = (sig.targets || []).map((t, idx) => ({
        index: idx + 1,
        price: typeof t === 'object' && (t as any).price ? (t as any).price : Number(t),
        rMultiple: typeof t === 'object' && (t as any).rMultiple ? (t as any).rMultiple : idx * 1.5 + 1.5
      }));

      // Calculate maximum move potential
      const maxTargetPrice = formattedTargets.length > 0 ? formattedTargets[formattedTargets.length - 1].price : 0;
      const movePotentialPct = (maxTargetPrice > 0 && entryP > 0)
        ? (sig.direction === 'LONG'
            ? ((maxTargetPrice - entryP) / entryP) * 100
            : ((entryP - maxTargetPrice) / entryP) * 100)
        : 0;

      const lastTrade = recentTrades.find(
        t => t.symbol.toUpperCase() === sig.symbol.toUpperCase()
      );

      const riskValidation = UserRiskEngine.validateTradeExecution({
        settings,
        openPositions,
        todayRealizedLoss: todayLoss,
        accountEquity: equity,
        availableBalance: available,
        signal: {
          symbol: sig.symbol,
          direction: sig.direction,
          entryPrice: entryP,
          currentPrice: sig.currentPrice,
          stopLoss: typeof sig.stopLoss === 'object' && (sig.stopLoss as any).price ? (sig.stopLoss as any).price : Number(sig.stopLoss),
          targets: formattedTargets,
          moonScore: sig.moonScore,
          qualityGrade: sig.qualityGrade,
          source: 'TOP_5',
          movePotentialPct
        },
        recentTradesForSymbol: lastTrade ? lastTrade.closedAt : undefined
      });

      let actionType: Top5ActionableSignal['evaluation']['actionType'] = 'BLOCKED_BY_MODE';
      let rejectionReason = riskValidation.rejectionReason;
      let rejectionCode = riskValidation.rejectionCode;

      if (!liveAvailable && (settings.tradingMode === 'SEMI-AUTO' || settings.tradingMode === 'FULL-AUTO')) {
        actionType = 'BLOCKED_BY_RISK';
        rejectionCode = 'LIVE_EXCHANGE_UNAVAILABLE';
        rejectionReason = `LIVE UNAVAILABLE, EXECUTION BLOCKED: Unable to connect to ${settings.activeExchange || 'configured exchange'}. Check API credentials.`;
      } else if (riskValidation.rejectionCode === 'DUPLICATE_POSITION_PROHIBITED') {
        actionType = 'ALREADY_IN_POSITION';
      } else if (!riskValidation.passed) {
        actionType = 'BLOCKED_BY_RISK';
      } else if (settings.tradingMode === 'FULL-AUTO') {
        actionType = 'READY_FULL_AUTO';
      } else if (settings.tradingMode === 'SEMI-AUTO') {
        actionType = 'READY_SEMI_AUTO';
      } else {
        actionType = 'READY_MANUAL';
      }

      return {
        signalId: sig.id,
        symbol: sig.symbol,
        direction: sig.direction,
        moonScore: sig.moonScore,
        qualityGrade: sig.qualityGrade || 'A',
        currentPrice: sig.currentPrice,
        entryPrice: sig.entryPrice || sig.currentPrice,
        stopLoss: typeof sig.stopLoss === 'object' && (sig.stopLoss as any).price ? (sig.stopLoss as any).price : Number(sig.stopLoss),
        targets: formattedTargets,
        timeframe: sig.timeframe || '1h',
        pattern: sig.pattern || 'Algorithmic Confluence Breakout',
        evaluation: {
          canExecute: liveAvailable && riskValidation.passed,
          rejectionReason,
          rejectionCode,
          actionType,
          calculatedSize: riskValidation.sizing
            ? {
                units: riskValidation.sizing.units,
                notionalUsd: riskValidation.sizing.notionalUsd,
                marginUsd: riskValidation.sizing.marginUsd,
                leverage: riskValidation.sizing.leverage,
                riskUsd: riskValidation.sizing.riskUsd || riskValidation.sizing.riskAmountUsd
              }
            : undefined
        }
      };
    });
  }

  /**
   * Executes a trade for a specific user (Manual, Semi-Auto, or Full-Auto).
   * Verifies Cross Margin and strict Risk Engine bounds.
   */
  public static async executeTradeForUser(
    userId: string,
    signalId: string,
    options?: { forceManual?: boolean; margin?: number; leverage?: number; marginType?: 'CROSS' | 'ISOLATED' }
  ): Promise<StoredPosition> {
    const user = tradingStorage.getUserById(userId);
    if (!user) throw new Error('User not found.');

    // Approval gate: Only Super Admin approved accounts may execute trades
    if (!tradingStorage.isUserApproved(userId)) {
      throw new Error('Account access is pending Super Admin approval. Trade execution blocked.');
    }

    const rawSettings = tradingStorage.getUserSettings(userId);
    const settings = {
      ...rawSettings,
      ...(options?.margin && options.margin > 0 ? { marginPerTrade: Number(options.margin) } : {}),
      ...(options?.leverage && options.leverage > 0 ? { leverage: Number(options.leverage), maxLeverage: Number(options.leverage) } : {}),
      ...(options?.marginType ? { marginType: options.marginType } : {})
    };
    if (settings.emergencyStop) {
      throw new Error('Emergency Stop is active. Execution blocked.');
    }

    // Invariant: If mode is DISABLED and not a manual override, reject
    if (settings.tradingMode === 'DISABLED' && !options?.forceManual) {
      throw new Error('Trading mode is currently DISABLED. Enable PAPER or AUTO trading in Trading Settings.');
    }

    const allSignals = getAllStoredSignals();
    const signal = allSignals.find(s => s.id === signalId);
    if (!signal) {
      throw new Error(`Signal ${signalId} not found in Core Intelligence signal registry.`);
    }

    const lockKey = `${userId}:${signal.symbol}`;
    if (this.activeExecutionLocks.has(lockKey)) {
      throw new Error(`Trade execution already in progress for ${signal.symbol}. Concurrency lock active to prevent duplicate orders.`);
    }

    // Idempotency fingerprint check (prevent double orders from polling, retries, or rapid clicks)
    const fingerprint = `${userId}:${signal.symbol}`;
    const lastExec = this.executedFingerprints.get(fingerprint);
    if (lastExec && Date.now() - lastExec < 60000) {
      throw new Error(`Duplicate order rejected: Order for ${signal.symbol} was already placed within the last 60 seconds (Idempotency Lock).`);
    }

    this.activeExecutionLocks.add(lockKey);

    try {
      const isPaper = settings.tradingMode === 'PAPER' || (settings.tradingMode === 'DISABLED' && options?.forceManual);
      const openPositions = tradingStorage.getOpenPositions(userId);

      // Duplicate position block: prohibited from opening duplicate position on same symbol
      const existingOpen = openPositions.find(p => p.symbol.toUpperCase() === signal.symbol.toUpperCase());
      if (existingOpen) {
        throw new Error(`Duplicate entry blocked: An open position already exists for ${signal.symbol}.`);
      }

      const todayLoss = tradingStorage.getTodayRealizedLoss(userId);

    const formattedTargets = (signal.targets || []).map((t, idx) => ({
      index: idx + 1,
      price: typeof t === 'object' && (t as any).price ? (t as any).price : Number(t),
      rMultiple: typeof t === 'object' && (t as any).rMultiple ? (t as any).rMultiple : idx * 1.5 + 1.5,
      hit: false,
      closedQty: 0
    }));

    const rawStopLoss = typeof signal.stopLoss === 'object' && (signal.stopLoss as any).price
      ? (signal.stopLoss as any).price
      : Number(signal.stopLoss);

    const entryPrice = signal.entryPrice || signal.currentPrice;

    // Anti-Chase Slippage Guard: Revalidate live ticker price
    const currentTicker = await get24hTicker(signal.symbol);
    const livePrice = currentTicker?.lastPrice || signal.currentPrice || entryPrice;

    // Strict Anti-Chase check: abort immediately if abs(currentPrice - entryPrice) / entryPrice > 0.3%
    const slippageCheck = validateAntiChaseSlippage(livePrice, entryPrice, 0.003);
    if (!slippageCheck.allowed) {
      const rejectReason = slippageCheck.log || 'ABORT_CHASE: Price deviated >0.3%';
      tradingStorage.recordTradeRejection(userId, {
        symbol: signal.symbol,
        signalId: signal.id,
        reason: rejectReason,
        rejectionCode: 'SLIPPAGE_GUARD_ABORT'
      });
      throw new Error(`Execution aborted: ${rejectReason}`);
    }

    const zoneHigh = signal.entryZoneHigh || (entryPrice * 1.002);
    const zoneLow = signal.entryZoneLow || (entryPrice * 0.998);

    if (signal.direction === 'LONG' && livePrice > zoneHigh * 1.003) {
      tradingStorage.recordTradeRejection(userId, {
        symbol: signal.symbol,
        signalId: signal.id,
        reason: `ANTI-CHASE GUARD: Current live price ($${livePrice}) has moved >0.3% above Entry Zone ($${zoneHigh}). Entry aborted.`,
        rejectionCode: 'SLIPPAGE_GUARD_ABORT'
      });
      throw new Error(`Execution aborted: Price ($${livePrice}) has moved >0.3% above Entry Zone ($${zoneHigh}). Anti-chase protection triggered.`);
    }

    if (signal.direction === 'SHORT' && livePrice < zoneLow * 0.997) {
      tradingStorage.recordTradeRejection(userId, {
        symbol: signal.symbol,
        signalId: signal.id,
        reason: `ANTI-CHASE GUARD: Current live price ($${livePrice}) has moved >0.3% below Entry Zone ($${zoneLow}). Entry aborted.`,
        rejectionCode: 'SLIPPAGE_GUARD_ABORT'
      });
      throw new Error(`Execution aborted: Price ($${livePrice}) has moved >0.3% below Entry Zone ($${zoneLow}). Anti-chase protection triggered.`);
    }

    // Get equity and available balance
    let equity = settings.paperBalanceUsd;
    let available = settings.paperBalanceUsd;
    let creds: any = null;

    if (!isPaper) {
      creds = tradingStorage.getDecryptedExchangeCredentials(userId);
      if (!creds) {
        tradingStorage.recordTradeRejection(userId, {
          symbol: signal.symbol,
          signalId: signal.id,
          reason: `LIVE UNAVAILABLE: No API credentials configured for ${settings.activeExchange || 'selected exchange'}`,
          rejectionCode: 'LIVE_EXCHANGE_NOT_CONFIGURED'
        });
        throw new Error(`LIVE UNAVAILABLE, EXECUTION BLOCKED: No API credentials configured for ${settings.activeExchange || 'selected exchange'}. Please configure your exchange keys in Settings.`);
      }

      try {
        const exBalance = await ExchangeAdapterHub.getAccountBalance(creds);
        equity = exBalance.totalEquity;
        available = exBalance.availableBalance;
      } catch (exErr: any) {
        tradingStorage.recordTradeRejection(userId, {
          symbol: signal.symbol,
          signalId: signal.id,
          reason: `LIVE UNAVAILABLE: Connection to ${creds.exchange} failed (${exErr.message})`,
          rejectionCode: 'LIVE_CONNECTION_FAILED'
        });
        throw new Error(`LIVE UNAVAILABLE, EXECUTION BLOCKED: Could not connect to ${creds.exchange} (${exErr.message}). Execution halted to protect account.`);
      }
    }

    // Run Hard Risk Engine Validation
    const recentTrades = tradingStorage.getUserTrades(userId);
    const lastTrade = recentTrades.find(t => t.symbol.toUpperCase() === signal.symbol.toUpperCase());

    // Calculate maximum move potential
    const maxTargetPrice = formattedTargets.length > 0 ? formattedTargets[formattedTargets.length - 1].price : 0;
    const movePotentialPct = (maxTargetPrice > 0 && entryPrice > 0)
      ? (signal.direction === 'LONG'
          ? ((maxTargetPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - maxTargetPrice) / entryPrice) * 100)
      : 0;

    const riskValidation = UserRiskEngine.validateTradeExecution({
      settings,
      openPositions,
      todayRealizedLoss: todayLoss,
      accountEquity: equity,
      availableBalance: available,
      signal: {
        symbol: signal.symbol,
        direction: signal.direction,
        entryPrice,
        currentPrice: signal.currentPrice,
        stopLoss: rawStopLoss,
        targets: formattedTargets,
        moonScore: signal.moonScore,
        qualityGrade: signal.qualityGrade,
        source: 'TOP_5',
        movePotentialPct
      },
      recentTradesForSymbol: lastTrade ? lastTrade.closedAt : undefined
    });

    if (!riskValidation.passed || !riskValidation.sizing) {
      tradingStorage.recordTradeRejection(userId, {
        symbol: signal.symbol,
        signalId: signal.id,
        reason: riskValidation.rejectionReason || 'Risk check failed',
        rejectionCode: riskValidation.rejectionCode || 'RISK_REJECTION'
      });
      tradingStorage.recordExecutionAudit(userId, {
        exchange: isPaper ? 'PAPER' : (settings.activeExchange || 'binance'),
        symbol: signal.symbol,
        signalId: signal.id,
        direction: signal.direction,
        entryPrice,
        quantity: 0,
        leverage: settings.maxLeverage,
        stopLoss: rawStopLoss,
        tpTargets: formattedTargets.map(t => t.price),
        executionStatus: 'REJECTED',
        rejectionReason: riskValidation.rejectionReason || 'Risk check failed'
      });
      throw new Error(`Risk Engine Rejection [${riskValidation.rejectionCode}]: ${riskValidation.rejectionReason}`);
    }

    const { units, notionalUsd, marginUsd, leverage } = riskValidation.sizing;

    // Real Execution vs Paper Execution
    let executedPrice = entryPrice;
    let executedUnits = units;
    let placedSlOrderId: string | undefined;
    let placedTpOrderId: string | undefined;

    if (!isPaper) {
      // 1. Enforce and verify CROSS margin mode
      await ExchangeAdapterHub.verifyAndEnforceCrossMargin(creds, signal.symbol);

      // 2. Set user leverage on exchange
      await ExchangeAdapterHub.setLeverage(creds, signal.symbol, leverage);

      // 3. Place Market Order on exchange
      const orderSide = signal.direction === 'LONG' ? 'BUY' : 'SELL';
      const orderRes = await ExchangeAdapterHub.placeMarketOrder(
        creds,
        signal.symbol,
        orderSide,
        units
      );

      // Verify exchange order confirmation
      if (orderRes.status && !['FILLED', 'PARTIALLY_FILLED', 'NEW'].includes(orderRes.status)) {
        throw new Error(`Order placement rejected by ${creds.exchange} with status: ${orderRes.status}`);
      }
      if (!orderRes.orderId) {
        throw new Error(`Exchange order confirmation failed: No orderId returned by ${creds.exchange}.`);
      }

      executedPrice = orderRes.avgPrice > 0 ? orderRes.avgPrice : entryPrice;
      executedUnits = orderRes.executedQty > 0 ? orderRes.executedQty : units;

      // 4. Place Stop Loss on exchange — HARD SAFETY RULE:
      // If required SL cannot be placed on exchange:
      // DO NOT enter position. Or if filled, immediately close position with emergency market order.
      const slSide = signal.direction === 'LONG' ? 'SELL' : 'BUY';
      try {
        const slRes = await ExchangeAdapterHub.placeStopMarketOrder(
          creds,
          signal.symbol,
          slSide,
          rawStopLoss,
          executedUnits
        );
        placedSlOrderId = slRes.orderId;
      } catch (slErr: any) {
        console.error(`[UserTradingCore] CRITICAL: Stop Loss placement rejected on ${creds.exchange}! Executing immediate emergency market liquidation:`, slErr.message);
        try {
          await ExchangeAdapterHub.closePositionMarket(
            creds,
            signal.symbol,
            signal.direction,
            executedUnits
          );
        } catch (emergencyErr: any) {
          console.error(`[UserTradingCore] EMERGENCY CLOSE FAILED:`, emergencyErr.message);
        }
        tradingStorage.recordTradeRejection(userId, {
          symbol: signal.symbol,
          signalId: signal.id,
          reason: `Emergency liquidation triggered: Stop Loss order failed on exchange (${slErr.message})`,
          rejectionCode: 'SL_PLACEMENT_FAILED_EMERGENCY_EXIT'
        });
        tradingStorage.recordExecutionAudit(userId, {
          exchange: creds.exchange,
          symbol: signal.symbol,
          signalId: signal.id,
          direction: signal.direction,
          entryPrice: executedPrice,
          quantity: executedUnits,
          leverage,
          stopLoss: rawStopLoss,
          tpTargets: formattedTargets.map(t => t.price),
          executionStatus: 'EMERGENCY_LIQUIDATED',
          rejectionReason: `SL placement failed on exchange: ${slErr.message}`
        });
        throw new Error(`CRITICAL SAFETY HALT: Stop loss could not be placed on ${creds.exchange} (${slErr.message}). Position was immediately liquidated with an emergency market order to protect capital.`);
      }

      // 5. Place TP1 and TP2 bracket orders on exchange
      const tpSide = signal.direction === 'LONG' ? 'SELL' : 'BUY';
      const tp1 = formattedTargets[0];
      const tp2 = formattedTargets[1];

      if (tp1 && tp1.price > 0) {
        try {
          const tp1Qty = Number((executedUnits * 0.5).toFixed(4));
          if (tp1Qty > 0) {
            const tp1Res = await ExchangeAdapterHub.placeTakeProfitOrder(
              creds,
              signal.symbol,
              tpSide,
              tp1.price,
              tp1Qty
            );
            placedTpOrderId = tp1Res.orderId;
            console.log(`[UserTradingCore] TP1 bracket order placed on ${creds.exchange} at $${tp1.price} (Qty: ${tp1Qty}, orderId: ${placedTpOrderId})`);
          }
        } catch (tp1Err: any) {
          console.warn(`[UserTradingCore] Warning: Failed to place TP1 order on ${creds.exchange}:`, tp1Err.message);
        }
      }

      if (tp2 && tp2.price > 0) {
        try {
          const tp2Qty = Number((executedUnits * 0.5).toFixed(4));
          if (tp2Qty > 0) {
            await ExchangeAdapterHub.placeTakeProfitOrder(
              creds,
              signal.symbol,
              tpSide,
              tp2.price,
              tp2Qty
            );
            console.log(`[UserTradingCore] TP2 bracket order placed on ${creds.exchange} at $${tp2.price} (Qty: ${tp2Qty})`);
          }
        } catch (tp2Err: any) {
          console.warn(`[UserTradingCore] Warning: Failed to place TP2 order on ${creds.exchange}:`, tp2Err.message);
        }
      }

      this.executedFingerprints.set(fingerprint, Date.now());
      tradingStorage.recordExecutionAudit(userId, {
        exchange: creds.exchange,
        symbol: signal.symbol,
        signalId: signal.id,
        direction: signal.direction,
        entryPrice: executedPrice,
        quantity: executedUnits,
        leverage,
        stopLoss: rawStopLoss,
        tpTargets: formattedTargets.map(t => t.price),
        orderId: orderRes.orderId,
        executionStatus: 'CONFIRMED'
      });
    } else {
      // Paper execution: deduct margin from paper balance
      settings.paperBalanceUsd = Math.max(0, settings.paperBalanceUsd - marginUsd);
      tradingStorage.updateUserSettings(userId, { paperBalanceUsd: settings.paperBalanceUsd });

      this.executedFingerprints.set(fingerprint, Date.now());
      tradingStorage.recordExecutionAudit(userId, {
        exchange: 'PAPER',
        symbol: signal.symbol,
        signalId: signal.id,
        direction: signal.direction,
        entryPrice: executedPrice,
        quantity: executedUnits,
        leverage,
        stopLoss: rawStopLoss,
        tpTargets: formattedTargets.map(t => t.price),
        orderId: `paper-${Date.now().toString(36)}`,
        executionStatus: 'CONFIRMED'
      });
    }

    const positionId = crypto.randomUUID();
    const position: StoredPosition = {
      id: positionId,
      userId,
      symbol: signal.symbol,
      direction: signal.direction,
      entryPrice: executedPrice,
      currentPrice: executedPrice,
      quantity: executedUnits,
      notionalUsd,
      marginUsd,
      leverage,
      marginType: 'CROSS',
      stopLoss: rawStopLoss,
      originalStopLoss: rawStopLoss,
      highestPriceReached: executedPrice,
      lowestPriceReached: executedPrice,
      tpTargets: formattedTargets,
      currentTpStep: 0,
      realizedPnL: 0,
      unrealizedPnL: 0,
      unrealizedPnLPct: 0,
      status: 'OPEN',
      isPaper,
      slOrderId: placedSlOrderId,
      tpOrderId: placedTpOrderId,
      trailedToBreakEven: false,
      openedAt: Date.now(),
      updatedAt: Date.now()
    };

      tradingStorage.addPosition(userId, position);
      return position;
    } finally {
      this.activeExecutionLocks.delete(lockKey);
    }
  }

  /**
   * Manually close an open position for a specific user
   */
  public static async closePositionForUser(
    userId: string,
    positionId: string,
    reason: string = 'MANUAL_CLOSE'
  ): Promise<StoredTradeRecord> {
    const openPositions = tradingStorage.getOpenPositions(userId);
    const pos = openPositions.find(p => p.id === positionId);
    if (!pos) throw new Error(`Open position ${positionId} not found for user.`);

    const ticker = await get24hTicker(pos.symbol);
    const exitPrice = ticker?.lastPrice || pos.currentPrice;

    // Calculate final realized PnL
    const priceDiff = pos.direction === 'LONG' ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
    const finalPnL = priceDiff * pos.quantity + pos.realizedPnL;
    const finalPnLPct = (priceDiff / pos.entryPrice) * 100 * pos.leverage;

    if (!pos.isPaper) {
      const creds = tradingStorage.getDecryptedExchangeCredentials(userId);
      if (creds) {
        try {
          await ExchangeAdapterHub.closePositionMarket(
            creds,
            pos.symbol,
            pos.direction,
            pos.quantity
          );
        } catch (e: any) {
          console.warn(`[UserTradingCore] Real ${creds.exchange} close error:`, e.message);
        }
      }
    } else {
      // Paper: restore margin + realized PnL to paper balance
      const settings = tradingStorage.getUserSettings(userId);
      settings.paperBalanceUsd = Math.max(0, settings.paperBalanceUsd + pos.marginUsd + finalPnL);
      tradingStorage.updateUserSettings(userId, { paperBalanceUsd: settings.paperBalanceUsd });
    }

    // Update position
    tradingStorage.updatePosition(userId, positionId, {
      status: 'CLOSED',
      currentPrice: exitPrice,
      closedAt: Date.now(),
      closeReason: reason,
      realizedPnL: Number(finalPnL.toFixed(2)),
      unrealizedPnL: 0,
      unrealizedPnLPct: 0
    });

    // Record trade
    const tradeRecord: StoredTradeRecord = {
      id: crypto.randomUUID(),
      userId,
      positionId,
      symbol: pos.symbol,
      direction: pos.direction,
      entryPrice: pos.entryPrice,
      exitPrice,
      quantity: pos.quantity,
      realizedPnL: Number(finalPnL.toFixed(2)),
      realizedPnLPct: Number(finalPnLPct.toFixed(2)),
      exitReason: reason,
      isPaper: pos.isPaper,
      openedAt: pos.openedAt,
      closedAt: Date.now()
    };

    tradingStorage.recordTrade(userId, tradeRecord);
    return tradeRecord;
  }

  /**
   * Position Lifecycle & Progressive TP1-TP10 / Trailing SL Engine
   * Executes periodically to advance protective SLs and close profitable fractions.
   */
  public static async evaluateOpenPositionsForUser(userId: string): Promise<void> {
    const openPositions = tradingStorage.getOpenPositions(userId);
    if (openPositions.length === 0) return;

    const settings = tradingStorage.getUserSettings(userId);
    const isEmergency = settings.emergencyStop;

    for (const pos of openPositions) {
      try {
        // Note: Emergency stop halts new entries and automated opens, but open positions remain
        // visible, manageable, and can be manually closed or closed via explicit emergency-close-all action.

        const ticker = await get24hTicker(pos.symbol);
        if (!ticker || !ticker.lastPrice) continue;

        const currentPrice = ticker.lastPrice;
        pos.currentPrice = currentPrice;
        pos.highestPriceReached = Math.max(pos.highestPriceReached, currentPrice);
        pos.lowestPriceReached = Math.min(pos.lowestPriceReached, currentPrice);

        // Update unrealized PnL
        const priceDiff = pos.direction === 'LONG' ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice;
        pos.unrealizedPnL = Number((priceDiff * pos.quantity).toFixed(2));
        pos.unrealizedPnLPct = Number(((priceDiff / pos.entryPrice) * 100 * pos.leverage).toFixed(2));

        const isLong = pos.direction === 'LONG';

        // 1. Check Stop Loss Hit
        const isStopLossHit = isLong ? currentPrice <= pos.stopLoss : currentPrice >= pos.stopLoss;
        if (isStopLossHit) {
          await this.closePositionForUser(userId, pos.id, `Stop Loss Triggered at $${currentPrice}`);
          continue;
        }

        // 2. Dynamic TP Progression (TP1 through TP10)
        // TP1 -> partial close (default 10%) -> SL moves to Entry
        // TP2 -> partial close -> SL moves to TP1
        // TP3 -> partial close -> SL moves to TP2
        // TP4..TP10 -> continue progressive protection
        // Invariant: Never move SL backwards!
        const partialClosePct = (settings.tpPartialClosePct || 10) / 100;

        for (let i = 0; i < pos.tpTargets.length; i++) {
          const target = pos.tpTargets[i];
          if (target.hit || target.price <= 0) continue;

          const isTargetReached = isLong ? pos.highestPriceReached >= target.price : pos.lowestPriceReached <= target.price;

          if (isTargetReached) {
            target.hit = true;
            pos.currentTpStep = target.index;

            // Compute partial close quantity
            const partialQty = Number((pos.quantity * partialClosePct).toFixed(4));
            target.closedQty = partialQty;

            // Realized PnL for partial close
            const targetDiff = isLong ? target.price - pos.entryPrice : pos.entryPrice - target.price;
            const partialPnL = targetDiff * partialQty;
            pos.realizedPnL += partialPnL;

            let newStopLoss = pos.stopLoss;

            if (target.index === 1) {
              // After TP1 -> SL moves to Entry (Break-Even) with +0.05% buffer for exchange fees
              const decimals = pos.entryPrice < 1 ? 4 : 2;
              const feeBufferPct = 0.0005; // 0.05% fee buffer
              newStopLoss = isLong
                ? Number((pos.entryPrice * (1 + feeBufferPct)).toFixed(decimals))
                : Number((pos.entryPrice * (1 - feeBufferPct)).toFixed(decimals));
              pos.trailedToBreakEven = true;
              pos.breakEvenPrice = newStopLoss;
            } else if (target.index === 2) {
              // After TP2 -> SL moves to TP1
              const tp1 = pos.tpTargets[0];
              if (tp1 && tp1.price > 0) {
                newStopLoss = tp1.price;
              }
            } else if (target.index >= 3) {
              // After TP(N) -> SL moves to TP(N-1)
              const prevTarget = pos.tpTargets[target.index - 2];
              if (prevTarget && prevTarget.price > 0) {
                newStopLoss = prevTarget.price;
              }
            }

            // Invariant Safety Check: Never move a LONG SL downwards, never move a SHORT SL upwards!
            if (isLong) {
              if (newStopLoss > pos.stopLoss) {
                pos.stopLoss = newStopLoss;
              }
            } else {
              if (newStopLoss < pos.stopLoss) {
                pos.stopLoss = newStopLoss;
              }
            }

            console.log(`[UserTradingCore] User ${userId} Position ${pos.symbol}: TP${target.index} hit. SL advanced to ${pos.stopLoss}`);

            // If on exchange, update real SL order
            if (!pos.isPaper) {
              const creds = tradingStorage.getDecryptedExchangeCredentials(userId);
              if (creds) {
                try {
                  // Cancel initial SL before placing new trailed SL
                  if (pos.slOrderId && creds.exchange?.toLowerCase() === 'binance') {
                    await ExchangeAdapterHub.cancelOrder(creds, pos.symbol, pos.slOrderId).catch(() => {});
                  }

                  const slSide = isLong ? 'SELL' : 'BUY';
                  const newSlRes = await ExchangeAdapterHub.placeStopMarketOrder(
                    creds,
                    pos.symbol,
                    slSide,
                    pos.stopLoss,
                    pos.quantity
                  );
                  if (newSlRes?.orderId) {
                    pos.slOrderId = newSlRes.orderId;
                  }

                  // If TP1 hit and TP2 exists, move next TP order to TP2
                  if (target.index === 1 && pos.tpTargets[1] && pos.tpTargets[1].price > 0) {
                    const tpSide = isLong ? 'SELL' : 'BUY';
                    const nextTpRes = await ExchangeAdapterHub.placeTakeProfitOrder(
                      creds,
                      pos.symbol,
                      tpSide,
                      pos.tpTargets[1].price,
                      pos.quantity
                    ).catch(() => null);
                    if (nextTpRes?.orderId) {
                      pos.tpOrderId = nextTpRes.orderId;
                    }
                  }
                } catch (e: any) {
                  console.warn(`[UserTradingCore] Error updating ${creds.exchange} SL order:`, e.message);
                }
              }
            }
          }
        }

        // Check if all targets achieved
        const allHit = pos.tpTargets.length > 0 && pos.tpTargets.every(t => t.hit);
        if (allHit) {
          await this.closePositionForUser(userId, pos.id, 'All Structural Profit Targets Achieved');
          continue;
        }

        // Save position updates
        tradingStorage.updatePosition(userId, pos.id, pos);
      } catch (err: any) {
        console.warn(`[UserTradingCore] Error evaluating position for user ${userId}:`, err.message);
      }
    }
  }

  /**
   * Autonomous Full-Auto Execution Loop
   * Runs for all users with FULL-AUTO enabled.
   */
  public static async runAutonomousExecutionLoop(): Promise<void> {
    const userIds = tradingStorage.getAllUserIds();

    for (const userId of userIds) {
      try {
        // Enforce Super Admin approval: Only approved users may trade autonomously
        if (!tradingStorage.isUserApproved(userId)) {
          continue;
        }

        const settings = tradingStorage.getUserSettings(userId);
        const isAutoActive = (settings.tradingMode === 'FULL-AUTO' || (settings.tradingMode === 'PAPER' && (settings.autoTradingEnabled || settings.autonomousTradingEnabled))) &&
          (settings.autoTradingEnabled || settings.autonomousTradingEnabled) &&
          !settings.emergencyStop;

        if (!isAutoActive) {
          continue;
        }

        const actionable = await this.getTop5ActionableSignals(userId);
        for (const sig of actionable) {
          const isEligible = sig.evaluation.canExecute && (
            sig.evaluation.actionType === 'READY_FULL_AUTO' ||
            (settings.tradingMode === 'PAPER' && sig.evaluation.actionType === 'READY_MANUAL')
          );
          if (isEligible) {
            console.log(`[UserTradingCore] AUTO-TRADE: Executing ${sig.symbol} for user ${userId} (Mode: ${settings.tradingMode})`);
            await this.executeTradeForUser(userId, sig.signalId);
          }
        }
      } catch (err: any) {
        console.warn(`[UserTradingCore] Autonomous loop error for user ${userId}:`, err.message);
      }
    }
  }

  /**
   * Synchronizes MoonScanner positions with actual exchange state.
   * If an order/position was closed on exchange, updates local state and logs PnL.
   */
  public static async syncPositionsWithExchange(userId: string): Promise<{ syncedCount: number; closedCount: number }> {
    const settings = tradingStorage.getUserSettings(userId);
    const openPositions = tradingStorage.getOpenPositions(userId);
    const livePositions = openPositions.filter(p => !p.isPaper);

    if (livePositions.length === 0) {
      return { syncedCount: openPositions.length, closedCount: 0 };
    }

    const creds = tradingStorage.getDecryptedExchangeCredentials(userId);
    if (!creds) {
      return { syncedCount: 0, closedCount: 0 };
    }

    let closedCount = 0;
    try {
      const exPositions = await ExchangeAdapterHub.getExchangePositions(creds);
      const exSymbolsWithOpen = new Set(
        exPositions.filter(p => Math.abs(p.positionAmt) > 0).map(p => p.symbol.toUpperCase())
      );

      for (const pos of livePositions) {
        const sym = pos.symbol.toUpperCase();
        // If exchange returned position data and this symbol is no longer in open positions
        if (exPositions.length > 0 && !exSymbolsWithOpen.has(sym)) {
          console.log(`[UserTradingCore] Exchange sync: Position ${pos.symbol} was closed on ${creds.exchange}. Updating local state.`);
          await this.closePositionForUser(userId, pos.id, `Closed on ${creds.exchange.toUpperCase()}`);
          closedCount++;
        }
      }
    } catch (e: any) {
      console.warn(`[UserTradingCore] Exchange position sync error for user ${userId}:`, e.message);
    }

    return { syncedCount: openPositions.length - closedCount, closedCount };
  }
}
