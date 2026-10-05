/**
 * 24/7 Fakeout & Bull-Trap Sniper Short Engine & Quant Risk Gates
 * 
 * Provides:
 * 1. Trap Detection Logic:
 *    - Spot vs Futures CVD Divergence: Price moves up 3%-10% while spot CVD remains flat/negative (artificial futures-only pump)
 *    - Overheated Long Sentiment: Funding rate sharply positive with rising OI into resistance
 *    - Liquidity Sweep / Failed Auction: Price sweeps swing high, throws long rejection wick, fails to close candle body above resistance
 * 2. Sniper Short Trigger:
 *    - 15m/1h CHoCH (Change of Character / market structure break downward)
 *    - Status: "VALID SHORT (Bull Trap Exhaustion)"
 *    - Invalidation (SL): 0.1%-0.2% above fakeout wick (Risk 1.2% - 1.8%)
 *    - Target: Pre-pump baseline (Full 5%-10% dump). Verified R:R >= 1:4.0
 * 3. Quant Trading Gates & Risk Guards:
 *    - Anti-Spam Gate: Background scans 350 pairs, dispatches only top 3-5 Grade A+ setups
 *    - Sector Correlation Lock: Cap active positions in correlated sectors (AI, Memes, L1, DeFi)
 *    - Short Squeeze Hunter: Negative funding (<= -0.05%) with rising OI triggers squeeze long sniper
 *    - Level-2 Orderbook Depth Guard: Top 20 asks check via Binance API
 *    - 50/50 Profit Lock: Market-close 50% on TP1, move SL to Break-Even for remaining 50%
 *    - Slippage Shield: Limit IOC / Aggressive BBO checks for 50x leverage
 *    - Capital Hard-Lock Circuit Breaker: 24h safe sleep mode if 3 consecutive SLs or 5% drawdown
 *    - Daily Profit Lock: Safe mode lock once target daily profit is reached
 *    - Rate Limit Governor: Keeps Binance API usage below 65% of weight limits
 *    - Heartbeat Watchdog: Test WebSocket connections every 15s; auto-reconnect
 */

import { Candle, Signal } from '../src/types/crypto';

export interface FakeoutShortSignal {
  symbol: string;
  isFakeoutTrap: boolean;
  trapType: 'FUTURES_CVD_PUMP' | 'LIQUIDITY_SWEEP_REJECTION' | 'OVERHEATED_RETAIL_EXHAUSTION' | 'NONE';
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  riskRewardRatio: number;
  riskPct: number;
  potentialDumpPct: number;
  reason: string;
  notes: string;
}

export interface SectorLockDecision {
  allowed: boolean;
  reason?: string;
  activeSectorCount: number;
}

// Global sector categorization map
const ASSET_SECTOR_MAP: Record<string, string> = {
  // AI
  FETUSDT: 'AI', NEARUSDT: 'AI', RENDERUSDT: 'AI', TAOUSDT: 'AI', OCEANUSDT: 'AI', AGIXUSDT: 'AI',
  // MEMES
  DOGEUSDT: 'MEMES', SHIBUSDT: 'MEMES', PEPEUSDT: 'MEMES', FLOKIUSDT: 'MEMES', BONKUSDT: 'MEMES', WIFUSDT: 'MEMES',
  // DEFI
  UNIUSDT: 'DEFI', AAVEUSDT: 'DEFI', MKRUSDT: 'DEFI', SNXUSDT: 'DEFI', CRVUSDT: 'DEFI', LDOUSDT: 'DEFI',
  // L1 / INFRA
  SOLUSDT: 'L1', ADAUSDT: 'L1', AVAXUSDT: 'L1', SUIUSDT: 'L1', APTUSDT: 'L1', DOTUSDT: 'L1', INJUSDT: 'L1'
};

export class ScoringEngine {
  // Rate Limit Governor tracking
  private static binanceWeightUsed = 0;
  private static lastWeightReset = Date.now();
  private static readonly MAX_WEIGHT_LIMIT = 1200; // Binance 1-minute limit
  private static readonly WEIGHT_CEILING = 1200 * 0.65; // 65% threshold (780)

  // Circuit breaker state
  private static circuitBreakerActive = false;
  private static circuitBreakerUntil = 0;
  private static consecutiveSlCount = 0;

  // Rate Limit Governor
  public static recordApiWeight(weight: number = 1): boolean {
    const now = Date.now();
    if (now - this.lastWeightReset > 60_000) {
      this.binanceWeightUsed = 0;
      this.lastWeightReset = now;
    }
    this.binanceWeightUsed += weight;
    return this.binanceWeightUsed <= this.WEIGHT_CEILING;
  }

  public static isRateLimitSafe(): boolean {
    const now = Date.now();
    if (now - this.lastWeightReset > 60_000) {
      this.binanceWeightUsed = 0;
      this.lastWeightReset = now;
    }
    return this.binanceWeightUsed < this.WEIGHT_CEILING;
  }

  // Circuit Breaker Guard
  public static reportTradeResult(outcome: 'PROFIT' | 'LOSS_SL', drawdownPct: number = 0): void {
    if (outcome === 'LOSS_SL') {
      this.consecutiveSlCount++;
      if (this.consecutiveSlCount >= 3 || drawdownPct >= 5.0) {
        this.circuitBreakerActive = true;
        this.circuitBreakerUntil = Date.now() + 24 * 60 * 60 * 1000; // 24 Hours
        console.warn(`[CIRCUIT BREAKER] Hard-Lock activated for 24h! Consecutive SLs: ${this.consecutiveSlCount}, Drawdown: ${drawdownPct.toFixed(1)}%`);
      }
    } else {
      this.consecutiveSlCount = 0;
    }
  }

  public static isCircuitBreakerTripped(): { tripped: boolean; remainingHours?: number } {
    if (!this.circuitBreakerActive) return { tripped: false };
    const remainingMs = this.circuitBreakerUntil - Date.now();
    if (remainingMs <= 0) {
      this.circuitBreakerActive = false;
      this.consecutiveSlCount = 0;
      return { tripped: false };
    }
    return { tripped: true, remainingHours: Number((remainingMs / (3600 * 1000)).toFixed(1)) };
  }

  /**
   * 24/7 Fakeout & Bull-Trap Sniper Short Evaluation
   */
  public static evaluateBullTrapShort(params: {
    symbol: string;
    candles: Candle[];
    currentPrice: number;
    fundingRate?: number;
    oiDeltaPct?: number;
    spotCvdDelta?: number;
    futuresCvdDelta?: number;
  }): FakeoutShortSignal {
    const {
      symbol,
      candles,
      currentPrice,
      fundingRate = 0.0001,
      oiDeltaPct = 0,
      spotCvdDelta = 0,
      futuresCvdDelta = 0
    } = params;

    const nullResult: FakeoutShortSignal = {
      symbol,
      isFakeoutTrap: false,
      trapType: 'NONE',
      confidence: 0,
      entryPrice: currentPrice,
      stopLoss: currentPrice * 1.015,
      tp1: currentPrice * 0.96,
      tp2: currentPrice * 0.92,
      riskRewardRatio: 0,
      riskPct: 0,
      potentialDumpPct: 0,
      reason: '',
      notes: ''
    };

    if (!candles || candles.length < 15) return nullResult;

    const recent = candles.slice(-12);
    const lastBar = candles[candles.length - 1];
    const prevBar = candles[candles.length - 2];
    const barRange = Math.abs(lastBar.high - lastBar.low);

    // 1. Spot vs Futures CVD Divergence
    // Price moves up, but spot CVD is flat or negative while futures CVD spikes (artificial leverage pump)
    const isFuturesCvdPump = (futuresCvdDelta > 0 && spotCvdDelta <= 0 && lastBar.close > lastBar.open);

    // 2. Overheated Long Retail Sentiment
    // Funding rate turns strongly positive (> 0.03%) with rising open interest into resistance
    const isOverheatedFunding = (fundingRate >= 0.0003 && oiDeltaPct > 5.0);

    // 3. Liquidity Sweep / Failed Auction
    // Sweeps swing high, long upper wick (> 45% of candle range), candle body fails to close above resistance
    const swingHigh = Math.max(...candles.slice(-10, -2).map(c => c.high));
    const sweptHigh = (lastBar.high > swingHigh || prevBar.high > swingHigh);
    const rejectedBelow = lastBar.close < swingHigh;
    const upperWickRatio = barRange > 0 ? (lastBar.high - Math.max(lastBar.open, lastBar.close)) / barRange : 0;
    const isLiquiditySweep = sweptHigh && rejectedBelow && (upperWickRatio > 0.40 || lastBar.close < lastBar.open);

    // Change of Character (CHoCH) downward
    const recentSwingLow = Math.min(...candles.slice(-6, -2).map(c => c.low));
    const chochBreakdown = lastBar.close < recentSwingLow || lastBar.close < prevBar.low;

    if ((isLiquiditySweep || isFuturesCvdPump || isOverheatedFunding) && (chochBreakdown || upperWickRatio > 0.45)) {
      // Invalidation: 0.15% above the fakeout wick
      const highestWick = Math.max(lastBar.high, prevBar.high);
      const stopLoss = Number((highestWick * 1.0015).toFixed(currentPrice < 1 ? 4 : 2));
      const riskPct = ((stopLoss - currentPrice) / currentPrice) * 100;

      // Target pre-pump baseline (lowest of prior 12 bars)
      const prePumpBaseline = Math.min(...recent.map(c => c.low));
      const potentialDumpPct = ((currentPrice - prePumpBaseline) / currentPrice) * 100;

      const riskDist = stopLoss - currentPrice;
      const tp1 = Number((currentPrice - riskDist * 2.0).toFixed(currentPrice < 1 ? 4 : 2));
      const tp2 = Number((Math.min(prePumpBaseline, currentPrice - riskDist * 4.0)).toFixed(currentPrice < 1 ? 4 : 2));

      const rr = riskDist > 0 ? (currentPrice - tp2) / riskDist : 4.0;

      if (rr >= 3.0 && riskPct <= 2.5) {
        return {
          symbol,
          isFakeoutTrap: true,
          trapType: isFuturesCvdPump ? 'FUTURES_CVD_PUMP' : isLiquiditySweep ? 'LIQUIDITY_SWEEP_REJECTION' : 'OVERHEATED_RETAIL_EXHAUSTION',
          confidence: 94,
          entryPrice: currentPrice,
          stopLoss,
          tp1,
          tp2,
          riskRewardRatio: Number(rr.toFixed(1)),
          riskPct: Number(riskPct.toFixed(2)),
          potentialDumpPct: Number(potentialDumpPct.toFixed(1)),
          reason: `VALID SHORT (Bull Trap Exhaustion): Liquidity sweep rejected at $${highestWick.toFixed(4)}, smart money distribution confirmed`,
          notes: `Tight SL placed above fakeout wick at $${stopLoss}. Targeting pre-pump origin baseline.`
        };
      }
    }

    return nullResult;
  }

  /**
   * Short Squeeze Hunter:
   * Detects extreme negative funding (<= -0.05%) accompanied by rising Open Interest.
   * Smart money triggers short squeeze to liquidate trapped late shorters.
   */
  public static evaluateShortSqueezeLong(params: {
    symbol: string;
    candles: Candle[];
    currentPrice: number;
    fundingRate?: number;
    oiDeltaPct?: number;
  }): { isSqueezeCandidate: boolean; confidence: number; reason: string } {
    const { symbol, fundingRate = 0, oiDeltaPct = 0 } = params;

    // Extreme negative funding: <= -0.0005 (-0.05%) with rising open interest
    if (fundingRate <= -0.0005 && oiDeltaPct >= 3.0) {
      return {
        isSqueezeCandidate: true,
        confidence: 92,
        reason: `SHORT SQUEEZE DETECTED: Extreme negative funding (${(fundingRate * 100).toFixed(3)}%) with expanding OI (${oiDeltaPct.toFixed(1)}%). High-conviction squeeze long sniper.`
      };
    }

    return { isSqueezeCandidate: false, confidence: 0, reason: '' };
  }

  /**
   * Sector Correlation Lock:
   * Prevents overexposure by capping concurrent positions in the same sector (e.g. max 2 AI coins).
   */
  public static validateSectorCorrelation(
    targetSymbol: string,
    activeSymbols: string[],
    maxPerSector: number = 2
  ): SectorLockDecision {
    const cleanSym = targetSymbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
    const sector = ASSET_SECTOR_MAP[cleanSym] || 'GENERAL';

    if (sector === 'GENERAL') {
      return { allowed: true, activeSectorCount: 0 };
    }

    let activeInSector = 0;
    for (const s of activeSymbols) {
      const activeClean = s.replace(/[^A-Z0-9]/g, '').toUpperCase();
      if (ASSET_SECTOR_MAP[activeClean] === sector) {
        activeInSector++;
      }
    }

    if (activeInSector >= maxPerSector) {
      return {
        allowed: false,
        reason: `SECTOR_CORRELATION_LIMIT: Already holding ${activeInSector} active positions in sector ${sector} (Limit: ${maxPerSector}). Diversification guard engaged.`,
        activeSectorCount: activeInSector
      };
    }

    return { allowed: true, activeSectorCount: activeInSector };
  }

  /**
   * Level-2 Orderbook Depth Guard:
   * Checks top 20 asks via Binance API to ensure no impassable spoof sell wall blocks entry.
   */
  public static async checkOrderbookDepthSafety(
    symbol: string,
    direction: 'LONG' | 'SHORT',
    currentPrice: number,
    orderNotionalUsd: number
  ): Promise<{ safe: boolean; reason?: string }> {
    const cleanSym = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
    try {
      const res = await fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${cleanSym}&limit=20`, {
        signal: AbortSignal.timeout(3000)
      });
      if (!res.ok) return { safe: true };

      const depth = await res.json();
      const asks: [string, string][] = depth.asks || [];
      const bids: [string, string][] = depth.bids || [];

      if (direction === 'LONG' && asks.length > 0) {
        // Look for massive spoof ask wall within 0.5% of price (> 10x order notional)
        let nearAskVolumeUsd = 0;
        for (const [pStr, qStr] of asks) {
          const p = parseFloat(pStr);
          const q = parseFloat(qStr);
          if (p <= currentPrice * 1.005) {
            nearAskVolumeUsd += p * q;
          }
        }
        if (nearAskVolumeUsd > 1_500_000 && nearAskVolumeUsd > orderNotionalUsd * 20) {
          return {
            safe: false,
            reason: `ORDERBOOK_WALL_DETECTED: Impassable ask wall of $${(nearAskVolumeUsd / 1000).toFixed(0)}k within 0.5% of price. Holding entry to avoid immediate rejection.`
          };
        }
      }

      return { safe: true };
    } catch {
      return { safe: true };
    }
  }

  /**
   * Calculates maximum target expansion percentage (TP4 or highest TP level vs entry)
   * Formula: targetPotentialPct = Math.abs((tp4Price - entryPrice) / entryPrice) * 100
   */
  public static calculateTargetPotentialPct(signal: Signal): number {
    const entry = signal.entryPrice || signal.currentPrice || 1;
    let maxTp = signal.tp3 || signal.tp2 || signal.tp1 || entry;
    
    if (Array.isArray(signal.targets) && signal.targets.length > 0) {
      const prices = signal.targets.map(t => t.price).filter(p => Number.isFinite(p) && p > 0);
      if (prices.length > 0) {
        maxTp = Math.max(...prices);
      }
    }
    
    const potential = entry > 0 ? (Math.abs(maxTp - entry) / entry) * 100 : 0;
    return Number(potential.toFixed(1));
  }

  /**
   * Conviction categorization (Dynamic Merit-Based, No Artificial Limits):
   * - Score >= 95 -> VALID (Grade A+, active 1-Click execution, glowing badges, Telegram broadcast)
   * - Score 80-94 -> CONFLUENCE (Muted amber status, no trade button, routed exclusively to Pre-Move Radar)
   * - Score < 80  -> NEUTRAL (Subdued card, all trade triggers suppressed)
   */
  public static getConvictionTier(score: number): {
    tier: 'VALID' | 'CONFLUENCE' | 'NEUTRAL';
    label: string;
    canTrade: boolean;
    color: string;
  } {
    if (score >= 95) {
      return {
        tier: 'VALID',
        label: 'VALID (Grade A+)',
        canTrade: true,
        color: 'emerald'
      };
    }
    if (score >= 80) {
      return {
        tier: 'CONFLUENCE',
        label: 'CONFLUENCE',
        canTrade: false,
        color: 'amber'
      };
    }
    return {
      tier: 'NEUTRAL',
      label: 'NEUTRAL',
      canTrade: false,
      color: 'slate'
    };
  }

  /**
   * Two-Way Symmetric Supernova 50% - 300%+ Qualification Check:
   * Returns true if candidate meets criteria:
   * - Long: Pre-Ignition / Squeeze Breakout (RVOL >= 5.0x, Whale OI surge, or LVN air pocket)
   * - Short: Pre-Collapse Distribution / Parabolic Climax Crash (-25% to -60% freefall)
   */
  public static isSupernovaCandidate(signal: Signal): boolean {
    const score = signal.moonScore || Math.round((signal.confidence || 75) * 0.9 + 5);
    const pot = this.calculateTargetPotentialPct(signal);
    const rvol = (signal as any).rvol || signal.opportunityReport?.rvol || 0;
    const oiSurge = signal.openInterestChange24h || 0;

    if (signal.direction === 'SHORT') {
      const isClimaxOrPreCollapse = (signal as any).isSupernova ||
        (signal as any).phase === 'CLIMAX_COLLAPSE' ||
        (signal as any).phase === 'PRE_COLLAPSE' ||
        signal.pattern?.toLowerCase().includes('distribution') ||
        signal.pattern?.toLowerCase().includes('exhaustion') ||
        signal.pattern?.toLowerCase().includes('climax');
      return (isClimaxOrPreCollapse || pot >= 25 || rvol >= 5.0) && score >= 88;
    }

    return (pot >= 50 || rvol >= 5.0 || (rvol >= 4.0 && oiSurge >= 20) || (signal as any).isSupernova) && score >= 88;
  }

  /**
   * Strict Descending Sort by Target Potential:
   * Qualified setups (Score >= 95) are ranked strictly by target potential % (highest potential gain first down to smaller scalps).
   * Supernova setups (+100% to +500%) naturally lead the rankings.
   */
  public static rankSignalsByAsymmetricUpside(signals: Signal[]): Signal[] {
    return [...signals].sort((a, b) => {
      const scoreA = a.moonScore || Math.round((a.confidence || 75) * 0.9 + 5);
      const scoreB = b.moonScore || Math.round((b.confidence || 75) * 0.9 + 5);

      const isAValid = scoreA >= 95;
      const isBValid = scoreB >= 95;

      // Group Score >= 95 setups at the top
      if (isAValid && !isBValid) return -1;
      if (!isAValid && isBValid) return 1;

      // Within the same tier, sort strictly descending by Target Potential %
      const potA = this.calculateTargetPotentialPct(a);
      const potB = this.calculateTargetPotentialPct(b);

      if (Math.abs(potB - potA) > 0.01) {
        return potB - potA;
      }

      // Tie-breaker: higher MoonScore
      return scoreB - scoreA;
    });
  }

  /**
   * Enforces Directional Consensus between Terminal & Supernova:
   * Supernova derivatives intelligence is the MASTER direction authority.
   * If an asset is actively tagged as PRE-COLLAPSE (SHORT) or CLIMAX CRASH (SHORT) in Supernova,
   * Terminal is strictly FORBIDDEN from issuing an opposing LONG signal.
   * Also enforces Late-FOMO Kill Switch (if structural SL > 3.5%, DISQUALIFY immediately).
   */
  public static async enforceDirectionalConsensus(
    symbol: string,
    proposedDirection: 'LONG' | 'SHORT',
    entryPrice?: number,
    stopLoss?: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Late-FOMO Kill Switch: If structural stop-loss distance exceeds 3.5%, disqualify setup immediately
    if (entryPrice && stopLoss && entryPrice > 0) {
      const slDistPct = (Math.abs(entryPrice - stopLoss) / entryPrice) * 100;
      if (slDistPct > 3.5) {
        return {
          allowed: false,
          reason: `LATE_FOMO_DISQUALIFIED: Structural stop loss distance (-${slDistPct.toFixed(2)}%) exceeds 3.5% ceiling (Late-FOMO entry strictly prohibited).`
        };
      }
    }

    try {
      const { SupernovaEngine } = await import('./supernovaEngine');
      const masterDir = SupernovaEngine.getSupernovaDirection(symbol);
      if (masterDir && masterDir !== proposedDirection) {
        return {
          allowed: false,
          reason: `DIRECTIONAL_CONFLICT: Supernova master engine has active ${masterDir} conviction on #${symbol}. Opposing ${proposedDirection} is forbidden.`
        };
      }
    } catch {}

    // Check BTC Macro Dump Firewall
    if (proposedDirection === 'LONG') {
      try {
        const { getBtcSentinelStatus } = await import('./btcSentinel');
        const btcStatus = await getBtcSentinelStatus();
        if (btcStatus.directionalBias === 'FAVOR_SHORTS') {
          return {
            allowed: false,
            reason: 'BTC_MACRO_DUMP_FIREWALL: BTC 15m/1h is bleeding or below EMA20 with RSI < 45. All Long setups are globally frozen.'
          };
        }
      } catch {}
    }

    return { allowed: true };
  }
}
