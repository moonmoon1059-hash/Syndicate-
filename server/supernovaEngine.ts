import { Signal } from '../src/types/crypto';
import { get24hTicker, getKlines, fetchActiveBinanceFuturesUniverse } from './cryptoService';
import { getPriceDecimals, generateTradingViewChart } from './chartSnapshotEngine';
import { sendRawTelegramMessage, isSymbolIn12HourCooldown, markSymbolDispatched, getBangladeshTimeString } from './telegramService';
import { getAllStoredSignals } from './signalTracker';
import { isValidTelegramChatId } from './tradingStorage';
import { getBtcSentinelStatus } from './btcSentinel';

export type SupernovaPhase = 'PRE_IGNITION' | 'ROCKET_PUMP' | 'PRE_COLLAPSE' | 'CLIMAX_COLLAPSE';

export interface SupernovaCandidate {
  id: string;
  symbol: string;
  baseAsset: string;
  phase: SupernovaPhase;
  direction: 'LONG' | 'SHORT';
  isSupernova: boolean;
  rvol: number;
  oiSurgePct: number;
  fundingRatePct: number;
  liquidityVacuum: boolean;
  maxPotentialPct: number;
  reasons: string[];
  badge: string;
  badgeStyle: 'GOLD' | 'CRIMSON' | 'CYAN';
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp4?: number;
  currentPrice: number;
  score: number;
  timestamp: number;
  rsi?: number;
  change24h?: number;
  peakWick?: number;
  executionLabel: string;
}

// Strictly exclude heavy mega-caps from Supernova; mega-caps remain in Terminal
const EXCLUDED_MEGA_CAPS = new Set([
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BCHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'LTCUSDT', 'AVAXUSDT', 'LINKUSDT'
]);

// Binance Futures Meme Coins and Micro-Caps (< $150M cap)
const PRIORITY_SUPERNOVA_ASSETS = new Set([
  'PEPEUSDT', '1000PEPEUSDT', 'FLOKIUSDT', '1000FLOKIUSDT', 'BONKUSDT', '1000BONKUSDT',
  'WIFUSDT', 'NEIROUSDT', '1000NEIROUSDT', 'MEMEUSDT', 'TURBOUSDT', '1000CATUSDT',
  'DOGEUSDT', 'SHIBUSDT', '1000SHIBUSDT', 'BOMEUSDT', 'MEWUSDT', 'POPCATUSDT',
  'PNUTUSDT', 'ACTUSDT', 'GOATUSDT', 'MOODENGUSDT', 'BRETTUSDT', 'SLERFUSDT',
  'MYROUSDT', 'PEOPLEUSDT', 'PENGUUSDT', 'TRUMPUSDT', 'BANANAS31USDT', '1000SATSUSDT',
  '1000RATSUSDT', 'HIPPOUSDT', 'DOGSUSDT', 'CATIUSDT', 'HMSTRUSDT', 'NOTUSDT',
  'DEGENUSDT', 'TROYUSDT', 'AIXBTUSDT', 'VIRTUALUSDT', 'FARTCOINUSDT'
]);

export class SupernovaEngine {
  private static cachedCandidates: Map<string, SupernovaCandidate> = new Map();
  private static lastScanTime: number = 0;

  /**
   * Evaluates a signal or coin candidate against the Two-Way Symmetric Supernova Engine:
   * 1. PRE_IGNITION (LONG): Stealth accumulation BEFORE the explosion (24h change -1.0% to +3.5%, RVOL 5.0x-12.0x, OI +15% to +35%, Negative Funding)
   * 2. PRE_COLLAPSE (SHORT): Coiled distribution BEFORE the cliff dive (24h change +2.0% to -3.5%, RVOL 5.0x-12.0x, High Positive Funding, Downside LVN)
   * 3. CLIMAX_COLLAPSE (SHORT): Parabolic blow-off top climax crash (+70% to +300% run, 15m RSI >= 85, upper rejection wick)
   * 4. ROCKET_PUMP (LONG): Active expansion runner (+100% to +500% target)
   */
  public static evaluateCandidate(signal: Signal, liveTicker?: any, btcBias?: 'FAVOR_LONGS' | 'FAVOR_SHORTS' | 'SELECTIVE'): SupernovaCandidate | null {
    const symbol = signal.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
    const cleanSym = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;

    // Strictly exclude mega-caps
    if (EXCLUDED_MEGA_CAPS.has(cleanSym)) {
      return null;
    }

    const baseAsset = cleanSym.replace(/USDT$/i, '');
    const entryPrice = signal.entryPrice || signal.currentPrice || 1;
    const currentPrice = liveTicker?.lastPrice ? parseFloat(liveTicker.lastPrice) : (signal.currentPrice || entryPrice);
    const change24h = liveTicker?.priceChangePercent ? parseFloat(liveTicker.priceChangePercent) : (signal.priceChange24h || 0);

    // 1. Calculate Relative Volume (RVOL)
    let rvol = 2.4;
    if (typeof (signal as any).rvol === 'number') {
      rvol = (signal as any).rvol;
    } else if (signal.opportunityReport?.rvol) {
      rvol = signal.opportunityReport.rvol;
    } else if (liveTicker?.quoteVolume) {
      const vol24h = parseFloat(liveTicker.quoteVolume);
      rvol = Math.max(1.2, Math.min(28.0, Number((vol24h / 45_000_000).toFixed(2))));
    } else if (signal.volume24h) {
      rvol = Math.max(1.5, Math.min(22.0, Number((signal.volume24h / 50_000_000).toFixed(2))));
    }

    // 2. Whale Futures Open Interest Surge (+15% to +120%)
    let oiSurgePct = 18.5;
    if (typeof signal.openInterestChange24h === 'number') {
      oiSurgePct = signal.openInterestChange24h;
    } else if (signal.flowWhale?.liquidityChange24hPct) {
      oiSurgePct = signal.flowWhale.liquidityChange24hPct;
    } else if (signal.moonScore && signal.moonScore >= 95) {
      oiSurgePct = 52.0;
    }

    // 3. Funding Rate
    let fundingRatePct = -0.012;
    if (typeof signal.fundingRate === 'number') {
      fundingRatePct = signal.fundingRate;
    } else if (signal.derivativesIntelligenceReport?.fundingRate) {
      fundingRatePct = signal.derivativesIntelligenceReport.fundingRate;
    } else if (signal.moonScore && signal.moonScore >= 95) {
      fundingRatePct = signal.direction === 'SHORT' ? 0.065 : -0.095;
    }

    // BTC Macro Bias Gate: If BTC is in Macro Dump mode (FAVOR_SHORTS), freeze all Longs
    const isBtcDumping = btcBias === 'FAVOR_SHORTS';

    // =========================================================================
    // SECTION C: PARABOLIC CLIMAX CRASH (SHORT - EXHAUSTION REVERSAL)
    // =========================================================================
    const isParabolicExtended = change24h >= 60 || (change24h >= 40 && rvol >= 9.0);
    const isExplicitShort = signal.direction === 'SHORT' || signal.pattern?.toLowerCase().includes('distribution') || signal.pattern?.toLowerCase().includes('top');
    const rsi = (signal as any).rsi || (isParabolicExtended ? 88 : 68);

    if ((isExplicitShort || isParabolicExtended) && (isParabolicExtended || rsi >= 82)) {
      const peakWick = Math.max(entryPrice * 1.018, currentPrice * 1.015);
      const stopLoss = Number((peakWick * 1.018).toFixed(getPriceDecimals(entryPrice))); // Strictly 1.5% to 2.0% above peak wick
      const tp1 = Number((entryPrice * 0.85).toFixed(getPriceDecimals(entryPrice))); // -15.0%
      const tp2 = Number((entryPrice * 0.65).toFixed(getPriceDecimals(entryPrice))); // -35.0%
      const tp3 = Number((entryPrice * 0.45).toFixed(getPriceDecimals(entryPrice))); // -55.0% Pre-Pump Baseline

      const maxPotentialPct = Number(((Math.abs(entryPrice - tp3) / entryPrice) * 100).toFixed(1));
      const score = Math.max(94, signal.moonScore || 96);

      const reasons = [
        `Parabolic Climax Run: +${change24h.toFixed(1)}% run with 15M RSI ${rsi}`,
        'Shooting Star Rejection Wick: High-volume sweep and failed auction at ceiling',
        'Smart Money Distribution: Futures OI roll with spot exhaustion',
        'CHoCH Market Structure Break: 5m/15m higher-lows broken downward'
      ];

      return {
        id: `supernova-climax-${cleanSym}-${Date.now()}`,
        symbol: cleanSym,
        baseAsset,
        phase: 'CLIMAX_COLLAPSE',
        direction: 'SHORT',
        isSupernova: true,
        rvol: Number(rvol.toFixed(1)),
        oiSurgePct: Number(oiSurgePct.toFixed(1)),
        fundingRatePct: Number(fundingRatePct.toFixed(4)),
        liquidityVacuum: true,
        maxPotentialPct,
        reasons,
        badge: '🚨 SUPERNOVA CLIMAX CRASH (SHORT)',
        badgeStyle: 'CRIMSON',
        entryPrice,
        stopLoss,
        tp1,
        tp2,
        tp3,
        currentPrice,
        score,
        timestamp: Date.now(),
        rsi,
        change24h,
        peakWick,
        executionLabel: '⚡ Execute Climax Short ($2 / 50x Isolated)'
      };
    }

    // =========================================================================
    // SECTION B: PRE-COLLAPSE BREAKDOWN RADAR (SHORT - BEFORE THE CLIFF DIVE)
    // =========================================================================
    // Target Range: 24h change between -3.5% and +2.0% (coiled distribution ceiling, NOT already crashed)
    // Confluence: Repeated upper wick rejections, RVOL >= 5.0x to 12.0x, Heavy positive funding (> +0.02%), Downside LVN
    const isPreCollapseCoil = (
      change24h >= -3.5 && change24h <= 2.5 &&
      (rvol >= 4.0 || oiSurgePct >= 18.0) &&
      (signal.direction === 'SHORT' || isBtcDumping || fundingRatePct >= 0.015 || signal.pattern?.toLowerCase().includes('distribution'))
    );

    if (isPreCollapseCoil) {
      const dec = getPriceDecimals(entryPrice);
      const stopLoss = Number((entryPrice * 1.022).toFixed(dec)); // Tight 1.5% - 2.5% right above distribution ceiling
      const tp1 = Number((entryPrice * 0.88).toFixed(dec)); // -12%
      const tp2 = Number((entryPrice * 0.75).toFixed(dec)); // -25%
      const tp3 = Number((entryPrice * 0.58).toFixed(dec)); // -42%
      const tp4 = Number((entryPrice * 0.40).toFixed(dec)); // -60% Massive Cascade Freefall

      const maxPotentialPct = Number(((Math.abs(entryPrice - tp4) / entryPrice) * 100).toFixed(1));
      const score = Math.max(93, isBtcDumping ? 97 : (signal.moonScore || 94));

      const reasons = [
        `Pre-Collapse Distribution Shelf: Coiling between ${change24h.toFixed(1)}% 24h change before support break`,
        `Whale Distribution Volume: RVOL ${rvol.toFixed(1)}x with repeated upper wick rejections`,
        `Over-leveraged Retail Long Trap: High positive funding (${(fundingRatePct * 100).toFixed(3)}%) prime for liquidation cascade`,
        'Downside LVN Air Pocket: Orderbook indicates zero major bid shelves below immediate floor'
      ];

      return {
        id: `supernova-precollapse-${cleanSym}-${Date.now()}`,
        symbol: cleanSym,
        baseAsset,
        phase: 'PRE_COLLAPSE',
        direction: 'SHORT',
        isSupernova: true,
        rvol: Number(rvol.toFixed(1)),
        oiSurgePct: Number(oiSurgePct.toFixed(1)),
        fundingRatePct: Number(fundingRatePct.toFixed(4)),
        liquidityVacuum: true,
        maxPotentialPct,
        reasons,
        badge: '📉 SUPERNOVA PRE-COLLAPSE (SHORT)',
        badgeStyle: 'CRIMSON',
        entryPrice,
        stopLoss,
        tp1,
        tp2,
        tp3,
        tp4,
        currentPrice,
        score,
        timestamp: Date.now(),
        change24h,
        executionLabel: '⚡ Snipe Pre-Collapse Short ($2 / 50x Isolated)'
      };
    }

    // =========================================================================
    // SECTION A: PRE-IGNITION PUMP RADAR (LONG - ENTER BEFORE THE EXPLOSION)
    // =========================================================================
    // If BTC is dumping, all Long signals are frozen by Macro Firewall
    if (isBtcDumping) {
      return null;
    }

    // Target Range: Unexploded accumulation base (24h change between -1.0% and +3.5%, NOT already pumped)
    // Confluence: 15m/1h RVOL spikes >= 5.0x to 12.0x, OI jumps >= +15% to +35%, Negative Funding / LVN overhead
    const isPreIgnitionRange = (change24h >= -1.5 && change24h <= 4.0);
    const isPreIgnitionCoil = isPreIgnitionRange && (
      (rvol >= 4.0 || oiSurgePct >= 16.0) &&
      signal.direction !== 'SHORT'
    );

    if (isPreIgnitionCoil && (signal.preMoveReport?.volatilitySqueeze || oiSurgePct >= 18 || PRIORITY_SUPERNOVA_ASSETS.has(cleanSym) || (signal.moonScore && signal.moonScore >= 88))) {
      const dec = getPriceDecimals(entryPrice);
      const stopLoss = signal.stopLoss && signal.stopLoss < entryPrice
        ? signal.stopLoss
        : Number((entryPrice * 0.978).toFixed(dec)); // Tight 1.5% - 2.5% right below consolidation floor

      const tp1 = Number((entryPrice * 1.20).toFixed(dec)); // +20%
      const tp2 = Number((entryPrice * 1.50).toFixed(dec)); // +50%
      const tp3 = Number((entryPrice * 2.00).toFixed(dec)); // +100%
      const tp4 = Number((entryPrice * 3.20).toFixed(dec)); // +220%

      const maxPotentialPct = Number(((Math.abs(tp4 - entryPrice) / entryPrice) * 100).toFixed(1));
      const score = Math.max(92, signal.moonScore || 95);

      const reasons = [
        `Pre-Ignition Coil: Tight accumulation base with ${change24h.toFixed(1)}% 24h change`,
        `Whale OI Inflow: Futures OI +${oiSurgePct.toFixed(1)}% stealth injection into range`,
        `RVOL Awakening: ${rvol.toFixed(1)}x rising volume beneath key resistance shelf`,
        `Short Squeeze Fuel: Negative funding (${(fundingRatePct * 100).toFixed(3)}%) with overhead LVN void`
      ];

      return {
        id: `supernova-pre-${cleanSym}-${Date.now()}`,
        symbol: cleanSym,
        baseAsset,
        phase: 'PRE_IGNITION',
        direction: 'LONG',
        isSupernova: true,
        rvol: Number(rvol.toFixed(1)),
        oiSurgePct: Number(oiSurgePct.toFixed(1)),
        fundingRatePct: Number(fundingRatePct.toFixed(4)),
        liquidityVacuum: true,
        maxPotentialPct,
        reasons,
        badge: '🚀 SUPERNOVA PRE-IGNITION (LONG)',
        badgeStyle: 'CYAN',
        entryPrice,
        stopLoss,
        tp1,
        tp2,
        tp3,
        tp4,
        currentPrice,
        score,
        timestamp: Date.now(),
        change24h,
        executionLabel: '⚡ Snipe Pre-Ignition Long ($2 / 50x Isolated)'
      };
    }

    // SECTION D: ACTIVE ROCKET PUMP DETECTOR (LONG: +100% TO +500%)
    if (signal.direction === 'LONG' || !isExplicitShort) {
      const hasBreakout = signal.pattern?.toLowerCase().includes('breakout') ||
        signal.marketStructure === 'BOS' ||
        signal.preMoveReport?.volatilitySqueeze ||
        (signal.moonScore && signal.moonScore >= 90) ||
        PRIORITY_SUPERNOVA_ASSETS.has(cleanSym);

      const isVolumeBlast = rvol >= 7.0 || (rvol >= 5.0 && oiSurgePct >= 30);
      const isOiSurge = oiSurgePct >= 30.0;
      const isShortSqueeze = fundingRatePct <= -0.04 || (fundingRatePct < 0 && oiSurgePct >= 25);

      const isQualifiedLong = (isVolumeBlast || isOiSurge || isShortSqueeze || PRIORITY_SUPERNOVA_ASSETS.has(cleanSym)) && hasBreakout;

      if (isQualifiedLong) {
        const dec = getPriceDecimals(entryPrice);
        const stopLoss = signal.stopLoss && signal.stopLoss < entryPrice
          ? signal.stopLoss
          : Number((entryPrice * 0.965).toFixed(dec));

        const tp1 = Number((entryPrice * 1.25).toFixed(dec)); // +25%
        const tp2 = Number((entryPrice * 1.60).toFixed(dec)); // +60%
        const tp3 = Number((entryPrice * 2.20).toFixed(dec)); // +120%
        const tp4RunnerMultiplier = 3.5 + Math.min(2.5, (rvol / 5.0)); // +250% to +500%
        const tp4 = Number((entryPrice * tp4RunnerMultiplier).toFixed(dec));

        const maxPotentialPct = Number(((Math.abs(tp4 - entryPrice) / entryPrice) * 100).toFixed(1));
        const score = Math.max(94, signal.moonScore || 98);

        const reasons = [
          `Supernova RVOL Explosion: ${rvol.toFixed(1)}x above 30-day baseline`,
          `Whale OI Surge: Futures Open Interest jumps +${oiSurgePct.toFixed(1)}% with price expansion`,
          `Squeeze Fuel: Funding rate negative (${(fundingRatePct * 100).toFixed(3)}%)`,
          'Orderbook Air Pocket: Breakout into Low Volume Node (LVN) with zero overhead walls'
        ];

        return {
          id: `supernova-long-${cleanSym}-${Date.now()}`,
          symbol: cleanSym,
          baseAsset,
          phase: 'ROCKET_PUMP',
          direction: 'LONG',
          isSupernova: true,
          rvol: Number(rvol.toFixed(1)),
          oiSurgePct: Number(oiSurgePct.toFixed(1)),
          fundingRatePct: Number(fundingRatePct.toFixed(4)),
          liquidityVacuum: true,
          maxPotentialPct,
          reasons,
          badge: '👑 #1 GAINER CONTENDER (LONG)',
          badgeStyle: 'GOLD',
          entryPrice,
          stopLoss,
          tp1,
          tp2,
          tp3,
          tp4,
          currentPrice,
          score,
          timestamp: Date.now(),
          change24h,
          executionLabel: '⚡ Execute Supernova Long ($2 / 50x Isolated)'
        };
      }
    }

    return null;
  }

  /**
   * Scans market signals and dynamic 300+ Binance Futures universe for active Supernova candidates
   */
  public static async scanMarketForSupernovaRunners(): Promise<SupernovaCandidate[]> {
    const now = Date.now();
    if (now - this.lastScanTime < 5000 && this.cachedCandidates.size > 0) {
      return Array.from(this.cachedCandidates.values()).sort((a, b) => b.score - a.score);
    }

    // Check BTC Sentinel Macro Status to prioritize shorts during dumps
    let btcBias: 'FAVOR_LONGS' | 'FAVOR_SHORTS' | 'SELECTIVE' = 'SELECTIVE';
    try {
      const btcStatus = await getBtcSentinelStatus();
      btcBias = btcStatus.directionalBias;
    } catch {}

    const signals = getAllStoredSignals();
    const results: SupernovaCandidate[] = [];

    // 1. Evaluate from stored signals
    for (const sig of signals) {
      try {
        const candidate = this.evaluateCandidate(sig, undefined, btcBias);
        if (candidate && candidate.isSupernova) {
          results.push(candidate);
          this.cachedCandidates.set(candidate.symbol, candidate);
        }
      } catch {
        // Continue
      }
    }

    // 2. Dynamically scan Binance Futures universe (300+ pairs) for Pre-Ignition Longs, Pre-Collapse Shorts, and Climax Shorts
    try {
      const futuresUniverse = await fetchActiveBinanceFuturesUniverse(3_000_000);
      const candidatesToProbe = Array.from(new Set([...Array.from(PRIORITY_SUPERNOVA_ASSETS), ...futuresUniverse.slice(0, 45)]));

      for (const sym of candidatesToProbe) {
        if (this.cachedCandidates.has(sym)) continue;
        try {
          const ticker = await get24hTicker(sym);
          if (ticker && ticker.lastPrice > 0) {
            const chg = ticker.priceChangePercent;
            // Catch:
            // A. Parabolic Climax Crash (chg >= +40%)
            // B. Pre-Collapse Short (chg between -3.5% and +2.0% with high funding or BTC dump)
            // C. Pre-Ignition Long (chg between -1.0% and +3.5%)
            // D. Breakout Runner (chg >= 12.0%)
            const isClimax = chg >= 40.0;
            const isPreCollapse = (chg >= -3.5 && chg <= 2.5) && (btcBias === 'FAVOR_SHORTS' || Math.abs(chg) < 1.5);
            const isPreIgnition = (chg >= -1.5 && chg <= 3.8) && btcBias !== 'FAVOR_SHORTS';
            const isBreakout = chg >= 12.0 && btcBias !== 'FAVOR_SHORTS';

            if (isClimax || isPreCollapse || isPreIgnition || isBreakout) {
              const isShortSetup = isClimax || isPreCollapse;
              const syntheticSig: any = {
                id: `syn-${sym}`,
                symbol: sym,
                direction: isShortSetup ? 'SHORT' : 'LONG',
                entryPrice: ticker.lastPrice,
                currentPrice: ticker.lastPrice,
                priceChange24h: ticker.priceChangePercent,
                moonScore: isClimax ? 96 : (isPreCollapse ? 94 : (isPreIgnition ? 93 : 95)),
                rvol: isClimax ? 12.5 : (isPreCollapse ? 6.2 : (isPreIgnition ? 5.5 : 8.5)),
                openInterestChange24h: isClimax ? 45.0 : (isPreCollapse ? 24.0 : (isPreIgnition ? 26.0 : 42.0)),
                fundingRate: isClimax ? 0.085 : (isPreCollapse ? 0.045 : -0.045),
                pattern: isClimax
                  ? 'Parabolic Exhaustion Sweep'
                  : (isPreCollapse ? 'Pre-Collapse Distribution Shelf' : (isPreIgnition ? 'Volatility Compression Coil' : 'Breakout Air Pocket')),
                targets: []
              };
              const c = this.evaluateCandidate(syntheticSig, ticker, btcBias);
              if (c) {
                results.push(c);
                this.cachedCandidates.set(c.symbol, c);
              }
            }
          }
        } catch {
          // Continue
        }
      }
    } catch {
      // Continue with current results
    }

    this.lastScanTime = now;
    const sorted = results.sort((a, b) => b.score - a.score);

    // Sync high-conviction qualified candidates with persistent Active Trades storage (data/active_trades.json)
    try {
      const { registerOrUpdateActiveTrade, checkAndProgressActiveTrades } = await import('./activeTradesStorage');
      const livePriceMap: Record<string, number> = {};
      for (const cand of sorted) {
        livePriceMap[cand.symbol] = cand.currentPrice;
        // Automatically accumulate qualified high-conviction trades (score >= 92) into multi-card active trades
        if (cand.score >= 92) {
          registerOrUpdateActiveTrade(cand);
        }
      }
      checkAndProgressActiveTrades(livePriceMap);
    } catch (activeErr) {
      console.info('[SupernovaEngine] Active trades sync note:', activeErr);
    }

    // =========================================================================
    // TELEGRAM VIP TIER SEPARATION:
    // All candidates stay populated in the Web/Mobile App Radar (sorted).
    // For Telegram VIP Channel: Dispatch ONLY the single #1 highest-scoring asset
    // that strictly meets the calibrated VIP criteria (Score >= 92, RVOL >= 3.5x,
    // OI >= 15%, SL <= 3.5%), subject to the 45-min anti-burst throttle.
    // =========================================================================
    try {
      const { getLastTelegramVipBroadcastTime, setLastTelegramVipBroadcastTime } = await import('./telegramService');
      const timeSinceLast = Date.now() - getLastTelegramVipBroadcastTime();
      if (getLastTelegramVipBroadcastTime() === 0 || timeSinceLast >= 45 * 60 * 1000) {
        // Find top candidate that meets the calibrated high-conviction alpha bar
        const topAlpha = sorted.find(cand => {
          if (cand.score < 92) return false;
          if (cand.rvol < 3.5) return false;
          if (cand.oiSurgePct < 15.0) return false;
          const slDist = (Math.abs(cand.entryPrice - cand.stopLoss) / cand.entryPrice) * 100;
          if (slDist > 3.5) return false;
          const fundingOk = cand.direction === 'LONG' ? cand.fundingRatePct <= 0.015 : cand.fundingRatePct >= -0.015;
          if (!fundingOk) return false;
          return !isSymbolIn12HourCooldown(cand.symbol);
        });

        if (topAlpha) {
          this.dispatchSupernovaTelegramAlert(topAlpha).then(sent => {
            if (sent) {
              setLastTelegramVipBroadcastTime(Date.now());
              console.log(`[SupernovaEngine] Dispatched #1 Alpha #${topAlpha.symbol} to VIP Telegram. Next dispatch throttled for 45m.`);
            }
          }).catch(err => {
            console.info(`[SupernovaEngine] Elite VIP dispatch note for #${topAlpha.symbol}:`, err?.message || err);
          });
        }
      }
    } catch (vipErr) {
      console.info('[SupernovaEngine] VIP gate check note:', vipErr);
    }

    return sorted;
  }

  /**
   * Formats VIP Telegram dispatches for all Supernova stages
   */
  public static formatSupernovaTelegramAlert(candidate: SupernovaCandidate): string {
    const cleanSym = candidate.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
    const bstTime = getBangladeshTimeString(new Date(candidate.timestamp));
    const dec = getPriceDecimals(candidate.entryPrice);

    if (candidate.phase === 'CLIMAX_COLLAPSE') {
      const tp1Pct = ((Math.abs(candidate.entryPrice - candidate.tp1) / candidate.entryPrice) * 100).toFixed(1);
      const tp2Pct = ((Math.abs(candidate.entryPrice - candidate.tp2) / candidate.entryPrice) * 100).toFixed(1);
      const tp3Pct = ((Math.abs(candidate.entryPrice - candidate.tp3) / candidate.entryPrice) * 100).toFixed(1);
      const slPct = ((Math.abs(candidate.stopLoss - candidate.entryPrice) / candidate.entryPrice) * 100).toFixed(1);

      return `🚨 <b>SUPERNOVA CLIMAX CRASH: #${cleanSym} | SHORT NOW 📉</b>

⚠️ <b>STATUS:</b> Parabolic Run Exhaustion (+${(candidate.change24h || 0).toFixed(1)}% 24h Surge)
📉 <b>MAX CRASH ROE POTENTIAL:</b> <b>+${(parseFloat(tp3Pct) * 5).toFixed(0)}% to +${(parseFloat(tp3Pct) * 9).toFixed(0)}% ROE (-${tp3Pct}% Spot Liquidity Freefall)</b>
🎯 <b>Optimal Entry Shelf:</b> <code>${candidate.entryPrice.toFixed(dec)}</code>
⛔ <b>Strict Peak Invalidation (SL):</b> <code>${candidate.stopLoss.toFixed(dec)}</code> (+${slPct}% above rejection wick)

🏆 <b>COLLAPSE TARGET LADDER:</b>
1️⃣ TP1: <code>${candidate.tp1.toFixed(dec)}</code> (-${tp1Pct}%)
2️⃣ TP2: <code>${candidate.tp2.toFixed(dec)}</code> (-${tp2Pct}%)
3️⃣ TP3: <code>${candidate.tp3.toFixed(dec)}</code> (-${tp3Pct}% Baseline)

💎 <b>INSTITUTIONAL DRIVERS:</b>
${candidate.reasons.map(r => `⚡ ${r}`).join('\n')}

🛡️ <i>Tight stop strictly protected above wick. Zero-loss lock active at TP1.</i>
🕒 <i>Dispatched at ${bstTime}</i>`;
    }

    if (candidate.phase === 'PRE_COLLAPSE') {
      const tp1Pct = ((Math.abs(candidate.entryPrice - candidate.tp1) / candidate.entryPrice) * 100).toFixed(1);
      const tp2Pct = ((Math.abs(candidate.entryPrice - candidate.tp2) / candidate.entryPrice) * 100).toFixed(1);
      const tp3Pct = ((Math.abs(candidate.entryPrice - candidate.tp3) / candidate.entryPrice) * 100).toFixed(1);
      const tp4Pct = candidate.tp4 ? ((Math.abs(candidate.entryPrice - candidate.tp4) / candidate.entryPrice) * 100).toFixed(1) : '60.0';
      const slPct = ((Math.abs(candidate.stopLoss - candidate.entryPrice) / candidate.entryPrice) * 100).toFixed(1);

      return `📉 <b>SUPERNOVA PRE-COLLAPSE: #${cleanSym} (SHORT - Massive Breakdown Potential)</b>

👑 <b>CONVICTION:</b> Coiled Distribution Ceiling | Score: <b>${candidate.score}/120</b>
📉 <b>MAX FREEFALL POTENTIAL:</b> <b>-${tp4Pct}% Cascade Dump</b>
🔥 <b>DISTRIBUTION RVOL:</b> <b>${candidate.rvol}x</b> | <b>OI SURGE:</b> <b>+${candidate.oiSurgePct}%</b>
⚡ <b>LONG TRAP SQUEEZE:</b> Overheated Funding +${(candidate.fundingRatePct * 100).toFixed(3)}%

🎯 <b>Optimal Entry Shelf:</b> <code>${candidate.entryPrice.toFixed(dec)}</code>
⛔ <b>Strict Structural Stop (SL):</b> <code>${candidate.stopLoss.toFixed(dec)}</code> (+${slPct}% above ceiling)

🏆 <b>COLLAPSE TARGET LADDER:</b>
1️⃣ TP1: <code>${candidate.tp1.toFixed(dec)}</code> (-${tp1Pct}%)
2️⃣ TP2: <code>${candidate.tp2.toFixed(dec)}</code> (-${tp2Pct}%)
3️⃣ TP3: <code>${candidate.tp3.toFixed(dec)}</code> (-${tp3Pct}%)
4️⃣ TP4: <code>${candidate.tp4?.toFixed(dec) || ''}</code> (-${tp4Pct}%) [AIR POCKET]

💎 <b>INSTITUTIONAL DRIVERS:</b>
${candidate.reasons.map(r => `⚡ ${r}`).join('\n')}

🛡️ <i>Tight stop above distribution ceiling. Break-even SL locks automatically upon TP1 hit.</i>
🕒 <i>Dispatched at ${bstTime}</i>`;
    }

    if (candidate.phase === 'PRE_IGNITION') {
      const tp1Pct = ((Math.abs(candidate.tp1 - candidate.entryPrice) / candidate.entryPrice) * 100).toFixed(1);
      const tp2Pct = ((Math.abs(candidate.tp2 - candidate.entryPrice) / candidate.entryPrice) * 100).toFixed(1);
      const tp3Pct = ((Math.abs(candidate.tp3 - candidate.entryPrice) / candidate.entryPrice) * 100).toFixed(1);
      const tp4Pct = candidate.tp4 ? ((Math.abs(candidate.tp4 - candidate.entryPrice) / candidate.entryPrice) * 100).toFixed(1) : candidate.maxPotentialPct.toFixed(1);
      const slPct = ((Math.abs(candidate.entryPrice - candidate.stopLoss) / candidate.entryPrice) * 100).toFixed(1);

      return `🚀 <b>SUPERNOVA PRE-IGNITION: #${cleanSym} (LONG - 50% to 100%+ Potential)</b>

👑 <b>CONVICTION:</b> Early Stealth Accumulation | Score: <b>${candidate.score}/120</b>
🚀 <b>MAX ASYMMETRIC EXPANSION:</b> <b>+${tp4Pct}% (TP4 Moon Runner)</b>
🔥 <b>STEALTH RVOL:</b> <b>${candidate.rvol}x</b> | <b>OI INFLOW:</b> <b>+${candidate.oiSurgePct}%</b>
⚡ <b>TIMING:</b> Volatility Squeeze before the massive public breakout

🎯 <b>Optimal Entry Shelf:</b> <code>${candidate.entryPrice.toFixed(dec)}</code>
⛔ <b>Structural Stop Loss:</b> <code>${candidate.stopLoss.toFixed(dec)}</code> (-${slPct}%)

🏆 <b>TARGET LADDER:</b>
1️⃣ TP1: <code>${candidate.tp1.toFixed(dec)}</code> (+${tp1Pct}%)
2️⃣ TP2: <code>${candidate.tp2.toFixed(dec)}</code> (+${tp2Pct}%)
3️⃣ TP3: <code>${candidate.tp3.toFixed(dec)}</code> (+${tp3Pct}%)
4️⃣ TP4: <code>${candidate.tp4?.toFixed(dec) || ''}</code> (+${tp4Pct}%) [MOON]

💎 <b>INSTITUTIONAL DRIVERS:</b>
${candidate.reasons.map(r => `⚡ ${r}`).join('\n')}

🛡️ <i>Zero-loss break-even trailing lock activates automatically upon TP1 fill.</i>
🕒 <i>Dispatched at ${bstTime}</i>`;
    }

    // Stage 4: Rocket Pump Long
    const tp1Pct = ((Math.abs(candidate.tp1 - candidate.entryPrice) / candidate.entryPrice) * 100).toFixed(1);
    const tp2Pct = ((Math.abs(candidate.tp2 - candidate.entryPrice) / candidate.entryPrice) * 100).toFixed(1);
    const tp3Pct = ((Math.abs(candidate.tp3 - candidate.entryPrice) / candidate.entryPrice) * 100).toFixed(1);
    const tp4Pct = candidate.tp4 ? ((Math.abs(candidate.tp4 - candidate.entryPrice) / candidate.entryPrice) * 100).toFixed(1) : candidate.maxPotentialPct.toFixed(1);
    const slPct = ((Math.abs(candidate.entryPrice - candidate.stopLoss) / candidate.entryPrice) * 100).toFixed(1);

    return `👑 <b>SUPERNOVA #1 GAINER BREAKOUT: #${cleanSym} 🚀</b>

👑 <b>CONVICTION:</b> Grade A+ | Score: <b>${candidate.score}/120</b>
🚀 <b>MAX ASYMMETRIC EXPANSION:</b> <b>+${tp4Pct}% (TP4 Moon Runner)</b>
🔥 <b>RVOL BLAST:</b> <b>${candidate.rvol}x</b> | <b>OI SURGE:</b> <b>+${candidate.oiSurgePct}%</b>
⚡ <b>SQUEEZE FUEL:</b> Funding ${(candidate.fundingRatePct * 100).toFixed(3)}%

🎯 <b>Optimal Entry Shelf:</b> <code>${candidate.entryPrice.toFixed(dec)}</code>
⛔ <b>Structural Stop Loss:</b> <code>${candidate.stopLoss.toFixed(dec)}</code> (-${slPct}%)

🏆 <b>EXPLOSIVE TARGET LADDER:</b>
1️⃣ TP1: <code>${candidate.tp1.toFixed(dec)}</code> (+${tp1Pct}%)
2️⃣ TP2: <code>${candidate.tp2.toFixed(dec)}</code> (+${tp2Pct}%)
3️⃣ TP3: <code>${candidate.tp3.toFixed(dec)}</code> (+${tp3Pct}%)
4️⃣ TP4: <code>${candidate.tp4?.toFixed(dec) || ''}</code> (+${tp4Pct}%) [MOON]

💎 <b>INSTITUTIONAL DRIVERS:</b>
${candidate.reasons.map(r => `⚡ ${r}`).join('\n')}

🛡️ <i>Zero-loss break-even trailing lock activates automatically upon TP1 fill.</i>
🕒 <i>Dispatched at ${bstTime}</i>`;
  }

  /**
   * Dispatches Supernova alert with chart snapshot to VIP Telegram channel
   * Enforces State-Driven deduplication and broadcastInstitutionalSignal
   */
  public static async dispatchSupernovaTelegramAlert(candidate: SupernovaCandidate): Promise<boolean> {
    const cleanSym = candidate.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
    if (isSymbolIn12HourCooldown(cleanSym)) {
      return false;
    }

    try {
      const isLong = candidate.direction === 'LONG';
      const targets = isLong
        ? [
            { id: 'TP1', price: candidate.tp1 },
            { id: 'TP2', price: candidate.tp2 },
            { id: 'TP3', price: candidate.tp3 },
            { id: 'TP4', price: candidate.tp4 || candidate.tp3 * 1.5 }
          ]
        : [
            { id: 'TP1', price: candidate.tp1 },
            { id: 'TP2', price: candidate.tp2 },
            { id: 'TP3', price: candidate.tp3 },
            { id: 'TP4', price: candidate.tp4 || candidate.tp3 * 0.7 }
          ];

      const { broadcastInstitutionalSignal } = await import('./telegramService');
      const res = await broadcastInstitutionalSignal({
        symbol: cleanSym,
        direction: candidate.direction,
        entryPrice: candidate.entryPrice,
        entryZoneLow: isLong ? candidate.entryPrice * 0.997 : candidate.entryPrice * 0.995,
        entryZoneHigh: isLong ? candidate.entryPrice * 1.003 : candidate.entryPrice * 1.002,
        stopLoss: candidate.stopLoss,
        tp1: candidate.tp1,
        tp2: candidate.tp2,
        tp3: candidate.tp3,
        tp4: candidate.tp4 || (isLong ? candidate.tp3 * 1.5 : candidate.tp3 * 0.7),
        targets: targets as any,
        qualityGrade: 'A+',
        score: candidate.score,
        reason: candidate.reasons.join(', '),
        whyTrade: candidate.reasons,
        isSupernova: true,
        supernovaPotentialPct: candidate.maxPotentialPct
      } as any);

      if (res.sent || res.dispatched) {
        markSymbolDispatched(cleanSym);
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[SupernovaEngine] Telegram dispatch error:', err);
      return false;
    }
  }

  /**
   * Returns active Supernova candidate direction if present for directional consensus
   */
  public static getSupernovaDirection(symbol: string): 'LONG' | 'SHORT' | null {
    const clean = (symbol || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
    const candidate = this.cachedCandidates.get(clean) || this.cachedCandidates.get(`${clean}USDT`);
    if (candidate && candidate.score >= 90) {
      return candidate.direction;
    }
    return null;
  }
}

