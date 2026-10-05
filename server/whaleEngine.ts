import { getBangladeshTimeString } from './telegramService';

export type MoonScannerTier = 'VALID' | 'CONFLUENCE' | 'OBSERVE';
export type MoonScannerDirection = 'LONG' | 'SHORT';
export type MoonScannerExecutionMode =
  | '🚀 IMPULSE EXECUTION (NO RETEST)'
  | '⚡ ENTRY NOW'
  | '⏳ WAIT FOR RETEST'
  | '⏳ WAIT FOR RETEST / PULLBACK'
  | '✅ RETEST CONFIRMED'
  | '⏳ PULLBACK RELIEF (WAIT FOR REJECTION WICK)'
  | '🎯 BUY THE RETEST DIP'
  | '🔥 SFP RECLAIM (LIQUIDITY HUNT COMPLETED)';

export interface MoonScannerCandidate {
  id: string;
  symbol: string;
  baseAsset: string;
  direction: MoonScannerDirection;
  markPrice: number;
  score: number; // e.g. 109, 95, 83
  tier: MoonScannerTier;
  executionMode: MoonScannerExecutionMode;
  executionLabel: string; // e.g. '🚀 IMPULSE ENTRY' | '⚡ ENTRY NOW' | '⏳ WAIT FOR RETEST' | '✅ RETEST CONFIRMED'
  executionGuidance: string;
  entryZone: string; // e.g. '$1.3140 - $1.3271 (+1.0%)'
  pullbackShelfPrice?: number;
  volMultiplier: number; // e.g. 4.12
  change15m: number; // e.g. +1.98
  change1h: number; // e.g. +13.79
  change24h: number; // e.g. +18.40
  fundingFeePct: number; // e.g. -0.0054
  supportDistPct: number; // e.g. 20.11
  resistDistPct: number; // e.g. 0.00
  oiDeltaPct: number; // e.g. +18.4
  takerBuyRatio: number; // e.g. 64.2
  slPrice: number; // structural invalidation floor price e.g. 0.5890
  slPercent: number; // structural invalidation distance % e.g. 2.15
  recLeverage: string; // e.g. "8x - 10x (Tight Structural Base)"
  leverageBadge: string; // e.g. "⚡ Lev: 8x-10x" | "🛡️ Lev: 5x" | "⚠️ Lev: 3x"
  swingBase: number; // anchor swing price (swingLow or swingHigh)
  atrBuffer: number; // calculated 0.5x ATR cushion
  target1?: { price: number; percent: number }; // Dynamic Minimum Expansion Target
  target2?: { price: number; percent: number }; // Dynamic Macro Runner Target
  target1Price?: number;
  target1Percent?: number;
  target2Price?: number;
  target2Percent?: number;
  btcMacroSafe: boolean; // whether BTC dump shield allows longs
  btcRsi15m: number; // BTC 15m RSI
  high24h: number;
  low24h: number;
  quoteVolume24h: number;
  reasons: string[];
  timestamp: number;
  scanTimeFormatted: string;
  binanceUrl: string;
}

export interface MoonEngineTelemetry {
  lastScanTimestamp: number;
  lastScanFormatted: string;
  totalMonitored: number;
  validCount: number;
  confluenceCount: number;
  observeCount: number;
  scanDurationMs: number;
  isScanning: boolean;
  btcDumpShieldActive: boolean;
  btcRsi15m: number;
}

// Global in-memory cache of scanned candidates
let cachedMoonScannerCandidates: MoonScannerCandidate[] = [];
let lastScanTimestamp = 0;
let isScanInProgress = false;
let scanDurationMs = 0;

// Per-symbol cooldown for Telegram alerts (strict 30-minute anti-spam cooldown)
const telegramAlertCooldownMap = new Map<string, number>();
const TELEGRAM_ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

export function isSymbolInMoonScannerTelegramCooldown(symbol: string): boolean {
  const clean = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const lastTime = telegramAlertCooldownMap.get(clean);
  if (!lastTime) return false;
  return Date.now() - lastTime < TELEGRAM_ALERT_COOLDOWN_MS;
}

export function markSymbolMoonScannerDispatched(symbol: string): void {
  const clean = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  telegramAlertCooldownMap.set(clean, Date.now());
}

// ============================================================================
// PERMANENT BLACKLIST: SYNTHETIC EQUITIES, COMMODITIES & STABLECOINS
// ============================================================================
const PERMANENT_BLACKLIST = new Set([
  'MSTRUSDT', 'SKHYNIXUSDT', 'CRCLUSDT', 'TSLAUSDT', 'NVDAUSDT', 'AAPLUSDT',
  'XAUUSDT', 'XAGUSDT', 'PAXGUSDT', 'EURUSDT', 'USDCUSDT', 'FDUSDUSDT',
  'BUSDUSDT', 'DAIUSDT', 'TUSDUSDT', 'USDPUSDT', 'USTCUSDT', 'SUSDUSDT',
  'XAUTUSDT', 'COPPERUSDT', 'PLATINUMUSDT', 'PALLADIUMUSDT', 'AEURUSDT',
  'USDEUSDT', 'USDUSDT', 'BTCDOMUSDT', 'DEFIUSDT'
]);

export function isBlacklistedAsset(symbol: string): boolean {
  const sym = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (PERMANENT_BLACKLIST.has(sym)) return true;
  // Ban equity synthetics
  if (
    sym.startsWith('MSTR') || sym.startsWith('SKHYNIX') || sym.startsWith('CRCL') ||
    sym.startsWith('TSLA') || sym.startsWith('NVDA') || sym.startsWith('AAPL') ||
    sym.startsWith('AMZN') || sym.startsWith('GOOG') || sym.startsWith('MSFT')
  ) {
    return true;
  }
  // Ban commodities and metals
  if (sym.startsWith('XAU') || sym.startsWith('XAG') || sym.startsWith('PAXG') || sym.startsWith('XAUT')) {
    return true;
  }
  // Ban stablecoins and pegged fiat
  if (
    sym.startsWith('USDC') || sym.startsWith('FDUSD') || sym.startsWith('TUSD') ||
    sym.startsWith('BUSD') || sym.startsWith('DAI') || sym.startsWith('USDP') ||
    sym.startsWith('USTC') || sym.startsWith('SUSD')
  ) {
    return true;
  }
  if (sym.startsWith('EUR') || sym.startsWith('AEUR')) return true;
  return false;
}

// ============================================================================
// DIRECTION LATCHING & PERSISTENT 60-MINUTE LOCK ENGINE
// ============================================================================
interface DirectionLockRecord {
  direction: MoonScannerDirection;
  lockedAt: number;
  invalidationPrice: number;
  lockedPrice: number;
}

const symbolDirectionLockMap = new Map<string, DirectionLockRecord>();
const DIRECTION_LOCK_DURATION_MS = 60 * 60 * 1000; // Minimum 60 minutes persistent direction lock

function getOrLockDirection(params: {
  symbol: string;
  markPrice: number;
  high24h: number;
  low24h: number;
  change1h: number;
  change15m: number;
  change24h: number;
}): MoonScannerDirection {
  const cleanSym = params.symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const now = Date.now();
  const existingLock = symbolDirectionLockMap.get(cleanSym);

  // 0. SWEEP_WATCH EXCEPTION (SFP Spring Setup):
  // When an asset is actively monitored in SWEEP_WATCH, DO NOT flip to bottom-chasing SHORT!
  if (sweepWatchMap.has(cleanSym)) {
    return 'LONG';
  }

  // 1. ABSOLUTE DIRECTION RULES (ZERO EXCEPTIONS):
  // Rule A: If 1h change is negative (< 0), it is FORBIDDEN from ever being tagged as LONG, regardless of 15m bounce!
  if (params.change1h < 0) {
    const invalidationPrice = params.high24h > 0 ? Math.max(params.high24h, params.markPrice * 1.04) : params.markPrice * 1.05;
    symbolDirectionLockMap.set(cleanSym, {
      direction: 'SHORT',
      lockedAt: existingLock && existingLock.direction === 'SHORT' ? existingLock.lockedAt : now,
      invalidationPrice: existingLock && existingLock.direction === 'SHORT' ? existingLock.invalidationPrice : invalidationPrice,
      lockedPrice: existingLock && existingLock.direction === 'SHORT' ? existingLock.lockedPrice : params.markPrice
    });
    return 'SHORT';
  }

  // Rule B: If 1h change is positive (> 0), it is FORBIDDEN from ever being tagged as SHORT!
  if (params.change1h > 0) {
    const invalidationPrice = params.low24h > 0 ? Math.min(params.low24h, params.markPrice * 0.96) : params.markPrice * 0.95;
    symbolDirectionLockMap.set(cleanSym, {
      direction: 'LONG',
      lockedAt: existingLock && existingLock.direction === 'LONG' ? existingLock.lockedAt : now,
      invalidationPrice: existingLock && existingLock.direction === 'LONG' ? existingLock.invalidationPrice : invalidationPrice,
      lockedPrice: existingLock && existingLock.direction === 'LONG' ? existingLock.lockedPrice : params.markPrice
    });
    return 'LONG';
  }

  // 2. If 1h is exactly 0.0% (neutral): Check persistent direction lock
  if (existingLock) {
    const isLockExpired = now - existingLock.lockedAt >= DIRECTION_LOCK_DURATION_MS;
    const isCompletelyFlat = Math.abs(params.change1h) < 0.5 && Math.abs(params.change15m) < 0.5;

    // Check if structural invalidation floor was decisively broken
    const isInvalidated = existingLock.direction === 'LONG'
      ? params.markPrice < existingLock.invalidationPrice
      : params.markPrice > existingLock.invalidationPrice;

    // A direction can only be cleared if the asset breaks its structural invalidation floor or goes completely flat (< 0.5%)
    if (!isLockExpired && !isInvalidated && !isCompletelyFlat) {
      return existingLock.direction;
    }
  }

  // Fallback if 1h is 0.0% and no active lock
  const fallbackDir: MoonScannerDirection = params.change15m >= 0 ? 'LONG' : 'SHORT';
  const invalidationPrice = fallbackDir === 'LONG'
    ? (params.low24h > 0 ? Math.min(params.low24h, params.markPrice * 0.96) : params.markPrice * 0.95)
    : (params.high24h > 0 ? Math.max(params.high24h, params.markPrice * 1.04) : params.markPrice * 1.05);

  symbolDirectionLockMap.set(cleanSym, {
    direction: fallbackDir,
    lockedAt: now,
    invalidationPrice,
    lockedPrice: params.markPrice
  });

  return fallbackDir;
}

// ============================================================================
// STICKY VALID SIGNAL LATCH & RETEST RETENTION REGISTRY
// ============================================================================
export interface ActiveValidSignalRecord {
  symbol: string;
  direction: MoonScannerDirection;
  entryPrice: number;
  slPrice: number;
  slPercent: number;
  recLeverage?: string;
  leverageBadge?: string;
  swingBase?: number;
  atrBuffer?: number;
  target1?: { price: number; percent: number };
  target2?: { price: number; percent: number };
  peakScore: number;
  triggeredAt: number;
  status: 'VALID' | 'INVALIDATED';
  invalidatedAt?: number;
}

export const activeValidSignalsMap = new Map<string, ActiveValidSignalRecord>();
const VALID_SIGNAL_LIFESPAN_MS = 2 * 60 * 60 * 1000; // 2 hours max lifespan

/**
 * Persistent cache set to strictly enforce ONE-SHOT invalidation broadcasts and prevent spam loops
 */
export const dispatchedInvalidations = new Set<string>();

// ============================================================================
// LIQUIDITY SWEEP & RECLAIM (SFP / WYCKOFF SPRING) WATCH REGISTRY
// ============================================================================
export interface SweepWatchRecord {
  symbol: string;
  originalSlPrice: number;
  sweptAt: number;
  lowestSweepLow: number;
  priorPeakScore: number;
  entryPrice: number;
}

export const sweepWatchMap = new Map<string, SweepWatchRecord>();
const SWEEP_WATCH_TTL_MS = 60 * 60 * 1000; // Watch for SFP reclaim for up to 60 minutes after sweep

// ============================================================================
// BTC MACRO ALIGNMENT DUMP SHIELD
// ============================================================================
interface BtcMacroStatus {
  rsi15m: number;
  change15m: number;
  change1h: number;
  isDumpShieldActive: boolean;
  checkedAt: number;
}

let cachedBtcMacro: BtcMacroStatus = {
  rsi15m: 52,
  change15m: 0,
  change1h: 0,
  isDumpShieldActive: false,
  checkedAt: 0
};

async function getBtcMacroDumpShieldStatus(): Promise<BtcMacroStatus> {
  const now = Date.now();
  if (now - cachedBtcMacro.checkedAt < 160000) {
    return cachedBtcMacro;
  }

  try {
    const res = await fetch('https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=15m&limit=20', {
      signal: AbortSignal.timeout(3500)
    });
    if (!res.ok) return cachedBtcMacro;
    const data: any[] = (await (async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch(e) { return null; } })(res));
    if (!Array.isArray(data) || data.length < 15) return cachedBtcMacro;

    const closes = data.map(d => parseFloat(d[4]));
    let gains = 0;
    let losses = 0;
    for (let i = closes.length - 14; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi15m = Number((100 - (100 / (1 + rs))).toFixed(1));

    const currentClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const fourAgoClose = closes[Math.max(0, closes.length - 5)];

    const change15m = prevClose > 0 ? Number((((currentClose - prevClose) / prevClose) * 100).toFixed(2)) : 0;
    const change1h = fourAgoClose > 0 ? Number((((currentClose - fourAgoClose) / fourAgoClose) * 100).toFixed(2)) : 0;

    // BTC Dump Shield Criteria:
    // If BTC 15m RSI < 40 or BTC is currently dropping aggressively (change15m < -1.0% or change1h < -2.0%)
    const isDumpShieldActive = rsi15m < 40 || change15m < -1.0 || change1h < -2.0;

    cachedBtcMacro = {
      rsi15m,
      change15m,
      change1h,
      isDumpShieldActive,
      checkedAt: now
    };
    return cachedBtcMacro;
  } catch {
    return cachedBtcMacro;
  }
}

// ============================================================================
// OPEN INTEREST (OI) DELTA ENGINE
// ============================================================================
interface OpenInterestCacheRecord {
  oiDeltaPct: number;
  cachedAt: number;
}
const openInterestCache = new Map<string, OpenInterestCacheRecord>();
const OI_CACHE_TTL_MS = 60000; // 60 seconds

async function fetchOpenInterestDelta(symbol: string): Promise<number> {
  const cleanSym = symbol.replace(/[^A-Z0-9]/g, '');
  const now = Date.now();
  const cached = openInterestCache.get(cleanSym);
  if (cached && now - cached.cachedAt < OI_CACHE_TTL_MS) {
    return cached.oiDeltaPct;
  }

  try {
    const res = await fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${cleanSym}&period=1h&limit=2`, {
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) {
      return cached ? cached.oiDeltaPct : 0;
    }
    const data: any[] = (await (async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch(e) { return null; } })(res));
    if (!Array.isArray(data) || data.length < 2) {
      return cached ? cached.oiDeltaPct : 0;
    }

    const prevOi = parseFloat(data[0].sumOpenInterest);
    const latestOi = parseFloat(data[1].sumOpenInterest);

    let deltaPct = 0;
    if (prevOi > 0 && latestOi > 0) {
      deltaPct = Number((((latestOi - prevOi) / prevOi) * 100).toFixed(1));
    }

    openInterestCache.set(cleanSym, { oiDeltaPct: deltaPct, cachedAt: now });
    return deltaPct;
  } catch {
    return cached ? cached.oiDeltaPct : 0;
  }
}

// ============================================================================
// 15M KLINE METRICS: VOLUME MA, TAKER FLOW & STRUCTURAL SL FLOOR
// ============================================================================
interface CandleMetricsCache {
  symbol: string;
  volMultiplier: number;
  change15m: number;
  change1h: number;
  takerBuyRatio: number;
  slPrice: number;
  slPercent: number;
  riskDisqualified: boolean;
  recentBounce: boolean;
  pivotShelf: number;
  swingBase: number;
  atrBuffer: number;
  atr14: number;
  recLeverage: string;
  leverageBadge: string;
  lowestRecentLow: number;
  isAbsorptionWick: boolean;
  cachedAt: number;
}
const candleMetricsCache = new Map<string, CandleMetricsCache>();
const CANDLE_CACHE_TTL_MS = 460000; // 45 seconds

/**
 * Flushes all stale active signals, watches, and caches to wipe corrupt candidates on deployment
 */
export function purgeStaleEngineState(): void {
  activeValidSignalsMap.clear();
  sweepWatchMap.clear();
  candleMetricsCache.clear();
  dispatchedInvalidations.clear();
  console.log('[MoonEngine] 🧹 Flushed all in-memory active signals, sweep watches, and candle cache cleanly.');
}

// Automatically wipe corrupt in-memory state on deployment/startup
purgeStaleEngineState();

export function formatPrice(p: number): string {
  if (!p || isNaN(p)) return '0.00';
  if (p < 0.0001) return p.toFixed(8);
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  if (p < 10) return p.toFixed(3);
  if (p < 1000) return p.toFixed(2);
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRange(low: number, high: number): string {
  return `$${formatPrice(Math.min(low, high))} - $${formatPrice(Math.max(low, high))}`;
}

/**
 * Adaptive Volatility Categorization (Supporting natural 6%-12% volatility with safe leverage):
 * - slPercent <= 4.0%: 7x - 10x (Tight Structural Base)
 * - slPercent 4.1% - 7.5%: 4x - 5x (Standard Altcoin Base)
 * - slPercent 7.6% - 13.0%: 2x - 3x (Meme / High Beta Base)
 * - slPercent 13.1% - 14.0%: 1x - 2x (Ultra Volatile Base)
 * - slPercent > 14.0%: Disqualified (Absolute Sanity Floor Exceeded)
 */
export function computeRiskAdaptiveLeverage(slPercent: number): {
  recLeverage: string;
  leverageBadge: string;
  tierColor: 'emerald' | 'amber' | 'purple' | 'rose';
} {
  if (slPercent <= 4.0) {
    return {
      recLeverage: '7x - 10x (Tight Structural Base)',
      leverageBadge: '⚡ Lev: 7x-10x',
      tierColor: 'emerald'
    };
  } else if (slPercent <= 7.5) {
    return {
      recLeverage: '4x - 5x (Standard Altcoin Base)',
      leverageBadge: '🛡️ Lev: 4x-5x',
      tierColor: 'amber'
    };
  } else if (slPercent <= 13.0) {
    return {
      recLeverage: '2x - 3x (Meme / High Beta Base)',
      leverageBadge: '⚠️ Lev: 2x-3x',
      tierColor: 'purple'
    };
  } else if (slPercent <= 14.0) {
    return {
      recLeverage: '1x - 2x (Ultra Volatile Base)',
      leverageBadge: '⚠️ Lev: 1x-2x',
      tierColor: 'purple'
    };
  } else {
    return {
      recLeverage: '🛑 Risk Exceeds 14.0% (Disqualified)',
      leverageBadge: '🛑 Risk > 14%',
      tierColor: 'rose'
    };
  }
}

async function fetch15mCandleMetrics(symbol: string, currentPrice: number, direction: MoonScannerDirection): Promise<{
  volMultiplier: number;
  change15m: number;
  change1h: number;
  takerBuyRatio: number;
  slPrice: number;
  slPercent: number;
  riskDisqualified: boolean;
  recentBounce: boolean;
  pivotShelf: number;
  swingBase: number;
  atrBuffer: number;
  atr14: number;
  recLeverage: string;
  leverageBadge: string;
  lowestRecentLow: number;
  isAbsorptionWick: boolean;
}> {
  const cleanSym = symbol.replace(/[^A-Z0-9]/g, '');
  const now = Date.now();
  const cached = candleMetricsCache.get(cleanSym);
  if (cached && now - cached.cachedAt < CANDLE_CACHE_TTL_MS) {
    return {
      volMultiplier: cached.volMultiplier,
      change15m: cached.change15m,
      change1h: cached.change1h,
      takerBuyRatio: cached.takerBuyRatio,
      slPrice: cached.slPrice,
      slPercent: cached.slPercent,
      riskDisqualified: cached.riskDisqualified,
      recentBounce: cached.recentBounce,
      pivotShelf: cached.pivotShelf,
      swingBase: cached.swingBase,
      atrBuffer: cached.atrBuffer,
      atr14: cached.atr14,
      recLeverage: cached.recLeverage,
      leverageBadge: cached.leverageBadge,
      lowestRecentLow: cached.lowestRecentLow,
      isAbsorptionWick: cached.isAbsorptionWick
    };
  }

  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${cleanSym}&interval=15m&limit=21`, {
      signal: AbortSignal.timeout(3500)
    });

    if (!res.ok) {
      throw new Error(`Klines error ${res.status}`);
    }

    const data: any[] = (await (async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch(e) { return null; } })(res));
    if (!Array.isArray(data) || data.length < 5) {
      const fallbackLev = computeRiskAdaptiveLeverage(2.0);
      return {
        volMultiplier: 1.0,
        change15m: 0,
        change1h: 0,
        takerBuyRatio: 50.0,
        slPrice: currentPrice * (direction === 'LONG' ? 0.98 : 1.02),
        slPercent: 2.0,
        riskDisqualified: false,
        recentBounce: false,
        pivotShelf: currentPrice,
        swingBase: currentPrice * (direction === 'LONG' ? 0.985 : 1.015),
        atrBuffer: currentPrice * 0.006,
        atr14: currentPrice * 0.012,
        recLeverage: fallbackLev.recLeverage,
        leverageBadge: fallbackLev.leverageBadge,
        lowestRecentLow: currentPrice * 0.98,
        isAbsorptionWick: false
      };
    }

    const candles = data.map(d => ({
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
      quoteVolume: parseFloat(d[7]),
      takerBuyQuoteVolume: parseFloat(d[10])
    }));

    const currentCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];

    // 20-period Volume MA
    const historicalCandles = candles.slice(0, candles.length - 1);
    const sumVol = historicalCandles.reduce((acc, c) => acc + (c.quoteVolume || c.volume), 0);
    const avgVol = historicalCandles.length > 0 ? sumVol / historicalCandles.length : 1;

    const currentVol = currentCandle.quoteVolume || currentCandle.volume;
    let volMultiplier = avgVol > 0 ? currentVol / avgVol : 1.0;
    volMultiplier = Math.max(0.5, Math.min(15.0, Number(volMultiplier.toFixed(2))));

    // 15m price change %
    const change15m = prevCandle.close > 0
      ? Number((((currentPrice || currentCandle.close) - prevCandle.close) / prevCandle.close * 100).toFixed(2))
      : 0;

    // 1h price change %
    const fourBarsAgoCandle = candles[Math.max(0, candles.length - 5)];
    const change1h = fourBarsAgoCandle && fourBarsAgoCandle.close > 0
      ? Number((((currentPrice || currentCandle.close) - fourBarsAgoCandle.close) / fourBarsAgoCandle.close * 100).toFixed(2))
      : change15m;

    // Taker Buy Volume Ratio (% of quote volume initiated as market buys)
    const quoteVol = currentCandle.quoteVolume > 0 ? currentCandle.quoteVolume : 1;
    const takerQuote = currentCandle.takerBuyQuoteVolume || (quoteVol * 0.5);
    const takerBuyRatio = Number(((takerQuote / quoteVol) * 100).toFixed(1));

    // 5) TRUE STRUCTURAL INVALIDATION ENGINE (SWING LOW/HIGH + ATR BUFFER)
    // Calculate 14-period True Range and ATR
    let atr14 = currentPrice * 0.012; // safe fallback (1.2% of price)
    if (candles.length >= 5) {
      const trValues: number[] = [];
      for (let i = 1; i < candles.length; i++) {
        const cCurr = candles[i];
        const cPrev = candles[i - 1];
        const tr = Math.max(
          cCurr.high - cCurr.low,
          Math.abs(cCurr.high - cPrev.close),
          Math.abs(cCurr.low - cPrev.close)
        );
        trValues.push(tr);
      }
      const recentTrs = trValues.slice(-14);
      if (recentTrs.length > 0) {
        atr14 = recentTrs.reduce((acc, val) => acc + val, 0) / recentTrs.length;
      }
    }

    // Liquidity Sweep Buffer: 0.4x ATR (14-period)
    const atrBuffer = atr14 * 0.4;

    let slPrice = currentPrice * (direction === 'LONG' ? 0.94 : 1.06);
    let slPercent = 6.0;
    let swingBase = currentPrice * (direction === 'LONG' ? 0.985 : 1.015);

    // Pivot shelf detection (highest high of bars 2-8 for long, lowest low for short)
    const priorBars = candles.slice(-8, -1);
    const pivotShelfLong = priorBars.length > 0 ? Math.max(...priorBars.map(c => c.high)) : currentPrice;
    const pivotShelfShort = priorBars.length > 0 ? Math.min(...priorBars.map(c => c.low)) : currentPrice;
    const pivotShelf = direction === 'LONG' ? pivotShelfLong : pivotShelfShort;

    // Detect if current or previous candle touched shelf and bounced with wick
    const recentMinLow = Math.min(...candles.slice(-3).map(c => c.low));
    const recentMaxHigh = Math.max(...candles.slice(-3).map(c => c.high));
    const recentBounce = direction === 'LONG'
      ? recentMinLow <= pivotShelf * 1.012 && currentPrice > pivotShelf && change15m >= 0.2
      : recentMaxHigh >= pivotShelf * 0.988 && currentPrice < pivotShelf && change15m <= -0.2;

    const priceDecimals = currentPrice < 1 ? (currentPrice < 0.001 ? 8 : 6) : (currentPrice < 10 ? 4 : 2);

    if (direction === 'LONG') {
      // 1. For 🟢 LONG SIGNALS: Stop Loss MUST ALWAYS be strictly LESS than Mark Price (slPrice < markPrice)
      // Calculation: Identify genuine swing low of consolidation base (last 12 candles):
      const consolidationBars = candles.slice(-12);
      const baseLow = Math.min(...consolidationBars.map(c => c.low));
      let calculatedSl = baseLow - (atr14 * 0.4);
      if (calculatedSl >= currentPrice || isNaN(calculatedSl) || calculatedSl <= 0) {
        calculatedSl = currentPrice * 0.94; // Safety fallback 6% below
      }
      slPrice = Number(calculatedSl.toFixed(priceDecimals));
      // Re-verify strictly less than currentPrice
      if (slPrice >= currentPrice) {
        slPrice = Number((currentPrice * 0.94).toFixed(priceDecimals));
      }
      slPercent = Number((((currentPrice - slPrice) / currentPrice) * 100).toFixed(2));
      swingBase = baseLow > 0 && baseLow < currentPrice ? baseLow : currentPrice * 0.985;
    } else {
      // 1. For 🔴 SHORT SIGNALS: Stop Loss MUST ALWAYS be strictly GREATER than Mark Price (slPrice > markPrice)
      // Calculation: Identify distribution swing high (last 12 candles):
      const distributionBars = candles.slice(-12);
      const baseHigh = Math.max(...distributionBars.map(c => c.high));
      let calculatedSl = baseHigh + (atr14 * 0.4);
      if (calculatedSl <= currentPrice || isNaN(calculatedSl)) {
        calculatedSl = currentPrice * 1.06; // Safety fallback 6% above
      }
      slPrice = Number(calculatedSl.toFixed(priceDecimals));
      // Re-verify strictly greater than currentPrice
      if (slPrice <= currentPrice) {
        slPrice = Number((currentPrice * 1.06).toFixed(priceDecimals));
      }
      slPercent = Number((((slPrice - currentPrice) / currentPrice) * 100).toFixed(2));
      swingBase = baseHigh > 0 && baseHigh > currentPrice ? baseHigh : currentPrice * 1.015;
    }

    // Absolute Sanity Floor: Disqualify any candidate only if natural SL exceeds 14.0%
    const riskDisqualified = slPercent > 14.0;

    const lev = computeRiskAdaptiveLeverage(slPercent);
    const currentRange = currentCandle.high - currentCandle.low;
    const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
    const isAbsorptionWick = currentRange > 0 && (lowerWick / currentRange) >= 0.35;

    const result = {
      volMultiplier,
      change15m,
      change1h,
      takerBuyRatio,
      slPrice,
      slPercent,
      riskDisqualified,
      recentBounce,
      pivotShelf,
      swingBase,
      atrBuffer,
      atr14,
      recLeverage: lev.recLeverage,
      leverageBadge: lev.leverageBadge,
      lowestRecentLow: recentMinLow,
      isAbsorptionWick
    };

    candleMetricsCache.set(cleanSym, { ...result, symbol: cleanSym, cachedAt: now });
    return result;
  } catch {
    const fallbackLev = computeRiskAdaptiveLeverage(2.0);
    return {
      volMultiplier: 1.2,
      change15m: 0,
      change1h: 0,
      takerBuyRatio: 50.0,
      slPrice: currentPrice * (direction === 'LONG' ? 0.98 : 1.02),
      slPercent: 2.0,
      riskDisqualified: false,
      recentBounce: false,
      pivotShelf: currentPrice,
      swingBase: currentPrice * (direction === 'LONG' ? 0.985 : 1.015),
      atrBuffer: currentPrice * 0.006,
      atr14: currentPrice * 0.012,
      recLeverage: fallbackLev.recLeverage,
      leverageBadge: fallbackLev.leverageBadge,
      lowestRecentLow: currentPrice * 0.98,
      isAbsorptionWick: false
    };
  }
}

// ============================================================================
// DUAL-MODE SMART ENTRY ENGINE: IMPULSE VS RETEST
// ============================================================================
function evaluateExecutionMode(params: {
  direction: MoonScannerDirection;
  markPrice: number;
  volMultiplier: number;
  takerBuyRatio: number;
  oiDeltaPct: number;
  change1h: number;
  change15m: number;
  resistDistPct: number;
  supportDistPct: number;
  pivotShelf: number;
  swingBase?: number;
  recentBounce: boolean;
  tier: MoonScannerTier;
}): {
  mode: MoonScannerExecutionMode;
  label: string;
  guidance: string;
  entryZone: string;
  pullbackShelfPrice?: number;
} {
  const {
    direction,
    markPrice,
    volMultiplier,
    takerBuyRatio,
    oiDeltaPct,
    change1h,
    change15m,
    resistDistPct,
    supportDistPct,
    pivotShelf,
    swingBase,
    recentBounce
  } = params;

  if (direction === 'LONG') {
    // Breakout / Support Base Anchor: genuine structural base
    const baseBreakout = (pivotShelf > 0 && pivotShelf < markPrice)
      ? pivotShelf
      : (swingBase && swingBase > 0 && swingBase < markPrice ? swingBase : markPrice * 0.98);
    const distFromBase = baseBreakout > 0 ? ((markPrice - baseBreakout) / baseBreakout) * 100 : 0;
    const isDirectBreakout = resistDistPct <= 0.8;

    // Conflicting / Choppy Condition: 1h is positive, but 15m is dipping / pulling back
    if (change15m <= 0) {
      return {
        mode: '⏳ PULLBACK RELIEF (WAIT FOR REJECTION WICK)',
        label: '⏳ PULLBACK RELIEF',
        guidance: 'Pullback dip within 1h macro uptrend: Do not enter prematurely. Wait for buyer support absorption wick.',
        entryZone: `${formatRange(baseBreakout, markPrice)} (Dip Zone)`,
        pullbackShelfPrice: baseBreakout
      };
    }

    // 1) PREVENT TOP-WICK FOMO & PREMATURE ENTRY SIGNALS:
    // If price has already expanded > 5.5% away from its breakout base on the current 15m candle without consolidation,
    // FORCE execution mode to: ⏳ WAIT FOR RETEST / PULLBACK.
    // Define Limit Buy Shelf at the key retest zone: [baseBreakout * 0.995, baseBreakout * 1.01].
    if (distFromBase > 5.5 || (change15m > 5.5 && volMultiplier < 5.5)) {
      const limitBuyLow = baseBreakout * 0.995;
      const limitBuyHigh = baseBreakout * 1.01;
      return {
        mode: '⏳ WAIT FOR RETEST / PULLBACK',
        label: '⏳ WAIT FOR RETEST / PULLBACK',
        guidance: 'Overextended green candle (>5.5% expansion from base): High risk of top-wick FOMO. Wait for throwback into Limit Buy Shelf.',
        entryZone: `${formatRange(limitBuyLow, limitBuyHigh)} (Limit Buy Shelf)`,
        pullbackShelfPrice: Number(baseBreakout.toFixed(baseBreakout < 1 ? 6 : 2))
      };
    }

    // 2) 🚀 IMPULSE ENTRY (Extreme institutional surge runner without pullback):
    const isImpulse =
      volMultiplier >= 5.5 &&
      takerBuyRatio >= 68.0 &&
      oiDeltaPct >= 18.0 &&
      isDirectBreakout;

    if (isImpulse) {
      return {
        mode: '🚀 IMPULSE EXECUTION (NO RETEST)',
        label: '🚀 IMPULSE ENTRY',
        guidance: 'Extreme Institutional Absorption: High probability of direct continuation without pullback. Direct momentum entry recommended.',
        entryZone: `${formatRange(markPrice, markPrice * 1.01)} (+1.0%)`,
        pullbackShelfPrice: baseBreakout
      };
    }

    // 3) ✅ RETEST CONFIRMED (PULLBACK BOUNCE):
    if (recentBounce) {
      return {
        mode: '✅ RETEST CONFIRMED',
        label: '✅ RETEST CONFIRMED',
        guidance: 'Pullback retest verified: Support shelf held with buyer wick absorption. High-conviction entry.',
        entryZone: `${formatRange(baseBreakout, markPrice)} (Bounce Shelf)`,
        pullbackShelfPrice: baseBreakout
      };
    }

    // 4) ⚡ ENTRY NOW: Only mark as ⚡ ENTRY NOW if price is actively within 1.5% of the support base
    if (distFromBase <= 1.5) {
      return {
        mode: '⚡ ENTRY NOW',
        label: '⚡ ENTRY NOW',
        guidance: 'Within Accumulation Shelf: Price actively coiling within 1.5% of support base. Optimal spot-on execution.',
        entryZone: `${formatRange(markPrice * 0.995, markPrice * 1.005)} (Support Base Shelf)`,
        pullbackShelfPrice: baseBreakout
      };
    }

    // 5) Default: ⏳ WAIT FOR RETEST (coiling between 1.5% and 5.5%)
    const limitBuyLow = baseBreakout * 0.995;
    const limitBuyHigh = baseBreakout * 1.01;
    return {
      mode: '⏳ WAIT FOR RETEST',
      label: '⏳ WAIT FOR RETEST',
      guidance: 'Expanded beyond tight base: High probability of throwback retest. Wait for pullback into Limit Buy Shelf.',
      entryZone: `${formatRange(limitBuyLow, limitBuyHigh)} (Limit Buy Shelf)`,
      pullbackShelfPrice: Number(baseBreakout.toFixed(baseBreakout < 1 ? 6 : 2))
    };
  } else {
    // SHORT DIRECTION
    const baseBreakdown = (pivotShelf > 0 && pivotShelf > markPrice)
      ? pivotShelf
      : (swingBase && swingBase > 0 && swingBase > markPrice ? swingBase : markPrice * 1.02);
    const distFromCeiling = baseBreakdown > 0 ? ((baseBreakdown - markPrice) / baseBreakdown) * 100 : 0;
    const isDirectBreakdown = supportDistPct <= 0.8;
    const takerSellRatio = 100 - takerBuyRatio;

    // Conflicting / Choppy Condition: 1h is negative, but 15m is bouncing
    if (change15m >= 0) {
      return {
        mode: '⏳ PULLBACK RELIEF (WAIT FOR REJECTION WICK)',
        label: '⏳ PULLBACK RELIEF',
        guidance: 'Counter-trend relief bounce against 1h macro downtrend: Do not enter long. Wait for rejection wick into resistance to short.',
        entryZone: `${formatRange(markPrice, baseBreakdown)} (Relief Zone)`,
        pullbackShelfPrice: baseBreakdown
      };
    }

    // 1) PREVENT BOTTOM-WICK FOMO:
    // If price has already dumped > 5.5% away from breakdown ceiling on current 15m candle without consolidation:
    if (distFromCeiling > 5.5 || (change15m < -5.5 && volMultiplier < 5.5)) {
      const limitSellLow = baseBreakdown * 0.99;
      const limitSellHigh = baseBreakdown * 1.005;
      return {
        mode: '⏳ WAIT FOR RETEST / PULLBACK',
        label: '⏳ WAIT FOR RETEST / PULLBACK',
        guidance: 'Overextended red candle (>5.5% drop from ceiling): High risk of bear bounce. Wait for relief into Limit Sell Shelf.',
        entryZone: `${formatRange(limitSellLow, limitSellHigh)} (Limit Sell Shelf)`,
        pullbackShelfPrice: Number(baseBreakdown.toFixed(baseBreakdown < 1 ? 6 : 2))
      };
    }

    // 2) 🚀 IMPULSE ENTRY (NO RETEST - SHORT):
    const isImpulse =
      volMultiplier >= 5.5 &&
      takerSellRatio >= 68.0 &&
      (oiDeltaPct >= 18.0 || oiDeltaPct <= -18.0) &&
      isDirectBreakdown;

    if (isImpulse) {
      return {
        mode: '🚀 IMPULSE EXECUTION (NO RETEST)',
        label: '🚀 IMPULSE ENTRY',
        guidance: 'Extreme Institutional Absorption: High probability of direct breakdown continuation without pullback. Direct momentum short recommended.',
        entryZone: `${formatRange(markPrice * 0.99, markPrice)} (-1.0%)`,
        pullbackShelfPrice: baseBreakdown
      };
    }

    // 3) ✅ RETEST CONFIRMED (SHORT):
    if (recentBounce) {
      return {
        mode: '✅ RETEST CONFIRMED',
        label: '✅ RETEST CONFIRMED',
        guidance: 'Breakdown retest verified: Resistance ceiling held with seller rejection. High-conviction short.',
        entryZone: `${formatRange(markPrice, baseBreakdown)} (Ceiling Rejection)`,
        pullbackShelfPrice: baseBreakdown
      };
    }

    // 4) ⚡ ENTRY NOW (SHORT): Only mark as ⚡ ENTRY NOW if price is actively within 1.5% of the breakdown ceiling
    if (distFromCeiling <= 1.5) {
      return {
        mode: '⚡ ENTRY NOW',
        label: '⚡ ENTRY NOW',
        guidance: 'Within Distribution Shelf: Price actively coiling within 1.5% of breakdown ceiling. Optimal spot-on execution.',
        entryZone: `${formatRange(markPrice * 0.995, markPrice * 1.005)} (Floor Shelf)`,
        pullbackShelfPrice: baseBreakdown
      };
    }

    // 5) Default: ⏳ WAIT FOR RETEST (SHORT)
    const limitSellLow = baseBreakdown * 0.99;
    const limitSellHigh = baseBreakdown * 1.005;
    return {
      mode: '⏳ WAIT FOR RETEST',
      label: '⏳ WAIT FOR RETEST',
      guidance: 'Expanded below breakdown ceiling: High probability of bear bounce retest. Wait for relief into Limit Sell Shelf.',
      entryZone: `${formatRange(limitSellLow, limitSellHigh)} (Relief Ceiling)`,
      pullbackShelfPrice: Number(baseBreakdown.toFixed(baseBreakdown < 1 ? 6 : 2))
    };
  }
}

/**
 * Evaluates candidate metrics and assigns Score, Tier, and Smart Entry Mode strictly matching
 * the 5-Layer Institutional Confluence Gate specification.
 */
function evaluateMoonScannerCandidate(params: {
  symbol: string;
  markPrice: number;
  high24h: number;
  low24h: number;
  quoteVolume24h: number;
  fundingFeePct: number;
  change24h: number;
  change15m: number;
  change1h: number;
  volMultiplier: number;
  oiDeltaPct: number;
  takerBuyRatio: number;
  slPrice: number;
  slPercent: number;
  riskDisqualified: boolean;
  recentBounce: boolean;
  pivotShelf: number;
  swingBase?: number;
  atrBuffer?: number;
  atr14?: number;
  recLeverage?: string;
  leverageBadge?: string;
  lowestRecentLow?: number;
  isAbsorptionWick?: boolean;
  btcMacro: BtcMacroStatus;
}): MoonScannerCandidate {
  const {
    symbol,
    markPrice,
    high24h,
    low24h,
    quoteVolume24h,
    fundingFeePct,
    change24h,
    change15m,
    change1h,
    volMultiplier,
    oiDeltaPct,
    takerBuyRatio,
    slPrice,
    slPercent,
    riskDisqualified,
    recentBounce,
    pivotShelf,
    swingBase,
    atrBuffer,
    recLeverage,
    leverageBadge,
    lowestRecentLow,
    isAbsorptionWick,
    btcMacro
  } = params;

  const baseAsset = symbol.replace('USDT', '');
  const reasons: string[] = [];

  // 1. DIRECTION LATCHING & HYSTERESIS
  const direction = getOrLockDirection({
    symbol,
    markPrice,
    high24h,
    low24h,
    change1h,
    change15m,
    change24h
  });

  // 1b. STICKY VALID SIGNAL LATCH & RETEST RETENTION CHECK
  const cleanSym = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const now = Date.now();
  const existingActiveValid = activeValidSignalsMap.get(cleanSym);

  let isStickyValid = false;
  if (existingActiveValid) {
    // Exit Condition A: Clean breach of Invalidation Floor (SL)
    const isBreached = existingActiveValid.direction === 'LONG'
      ? markPrice <= existingActiveValid.slPrice
      : markPrice >= existingActiveValid.slPrice;

    // Exit Condition B: Max lifespan of 2 hours elapsed
    const isExpired = now - existingActiveValid.triggeredAt >= VALID_SIGNAL_LIFESPAN_MS;

    if (isBreached) {
      if (existingActiveValid.direction === 'LONG') {
        // Move asset into SWEEP_WATCH mode instead of blind discard or bottom-chasing!
        sweepWatchMap.set(cleanSym, {
          symbol: cleanSym,
          originalSlPrice: existingActiveValid.slPrice,
          sweptAt: now,
          lowestSweepLow: Math.min(markPrice, existingActiveValid.slPrice * 0.995),
          priorPeakScore: existingActiveValid.peakScore,
          entryPrice: existingActiveValid.entryPrice
        });
        console.log(`[MoonEngine] #${cleanSym} breached Invalidation Floor ($${existingActiveValid.slPrice}) -> Armed SWEEP_WATCH (Liquidity Hunt & SFP Spring Watch active)`);
      }
      // Immediately purge the coin from active tracking
      activeValidSignalsMap.delete(cleanSym);

      // STRICT ONE-SHOT GATE: NEVER REPEAT OR LOOP
      if (!dispatchedInvalidations.has(cleanSym)) {
        dispatchedInvalidations.add(cleanSym);
        import('./telegramService').then(srv => {
          srv.dispatchMoonScannerInvalidationAlert({
            symbol: cleanSym,
            slPrice: existingActiveValid.slPrice
          });
        }).catch(() => {});
        console.log(`[MoonEngine] #${cleanSym} breached Invalidation Floor ($${existingActiveValid.slPrice}). Trade setup closed (One-Shot Alert Dispatched).`);
      } else {
        console.log(`[MoonEngine] #${cleanSym} breached Invalidation Floor ($${existingActiveValid.slPrice}), duplicate notification suppressed.`);
      }
    } else if (isExpired) {
      activeValidSignalsMap.delete(cleanSym);
      console.log(`[MoonEngine] #${cleanSym} expired after 2h max lifespan.`);
    } else {
      // Asset is within 2h lifespan and holding above SL floor: STRICT RETENTION!
      isStickyValid = true;
    }
  }

  // 1c. INSTITUTIONAL SFP RECLAIM DETECTION (THE "SPRING" SETUP)
  const sweepWatch = sweepWatchMap.get(cleanSym);
  if (sweepWatch) {
    if (now - sweepWatch.sweptAt >= SWEEP_WATCH_TTL_MS) {
      sweepWatchMap.delete(cleanSym);
    } else {
      sweepWatch.lowestSweepLow = Math.min(sweepWatch.lowestSweepLow, markPrice, lowestRecentLow || markPrice);
    }
  }

  let isSfpReclaim = false;
  let sfpSlPrice = 0;
  let sfpSlPercent = 0;
  let sfpSweepLow = 0;

  if (sweepWatch && markPrice > sweepWatch.originalSlPrice) {
    const isWickAbsorption = !!isAbsorptionWick || (markPrice > sweepWatch.lowestSweepLow * 1.006);
    // SFP Reclaim strictly requires buyer volume (volumeMultiplier >= 2.2 and takerBuyRatio >= 52.0% or 15m surge >= 2.0% with taker >= 52.0%)
    const hasBuyerVolume = (volMultiplier >= 2.2 && takerBuyRatio >= 52.0) || (change15m >= 2.0 && takerBuyRatio >= 52.0);

    if (isWickAbsorption && hasBuyerVolume) {
      isSfpReclaim = true;
      sfpSweepLow = sweepWatch.lowestSweepLow;

      // Invalidation Floor (SL): Anchor tightly right below lowest sweep wick (strictly capped between 1.5% and 13.0%)
      const rawSfpSl = Math.min(sfpSweepLow, markPrice * 0.98) - (atrBuffer * 0.4);
      let candidateSfpSl = rawSfpSl;
      if (candidateSfpSl >= markPrice || candidateSfpSl <= 0 || isNaN(candidateSfpSl)) {
        candidateSfpSl = markPrice * 0.94;
      }
      let rawDist = ((markPrice - candidateSfpSl) / markPrice) * 100;
      sfpSlPercent = Number(Math.max(1.5, Math.min(13.0, rawDist)).toFixed(2));
      sfpSlPrice = Number((markPrice * (1 - sfpSlPercent / 100)).toFixed(markPrice < 1 ? (markPrice < 0.001 ? 8 : 6) : 4));

      symbolDirectionLockMap.delete(cleanSym);
      sweepWatchMap.delete(cleanSym);
      console.log(`[MoonEngine] 🔥 SFP RECLAIM TRIGGERED for #${cleanSym}! Swept Floor: $${sweepWatch.originalSlPrice}, Lowest Sweep: $${sfpSweepLow}, Reclaimed: $${markPrice}, New SL: $${sfpSlPrice} (-${sfpSlPercent}%)`);
    }
  }

  // Multi-Timeframe Trend Dominance Direction
  const finalDirection: MoonScannerDirection = isSfpReclaim
    ? 'LONG'
    : isStickyValid && existingActiveValid
    ? existingActiveValid.direction
    : (change1h < 0 ? 'SHORT' : change1h > 0 ? 'LONG' : direction);

  let effectiveSlPrice = isSfpReclaim ? sfpSlPrice : slPrice;
  let effectiveSlPercent = isSfpReclaim ? sfpSlPercent : slPercent;

  if (isStickyValid && existingActiveValid) {
    effectiveSlPrice = existingActiveValid.slPrice;
    effectiveSlPercent = Number((Math.abs((markPrice - effectiveSlPrice) / markPrice) * 100).toFixed(2));
  }

  // STRICT DIRECTIONAL MATH LAW ENFORCEMENT:
  // For LONG: slPrice MUST ALWAYS be strictly LESS than markPrice. Fallback 6% below if inverted.
  if (finalDirection === 'LONG') {
    if (effectiveSlPrice >= markPrice || isNaN(effectiveSlPrice) || effectiveSlPrice <= 0) {
      effectiveSlPrice = Number((markPrice * 0.94).toFixed(markPrice < 1 ? (markPrice < 0.001 ? 8 : 6) : 4));
      effectiveSlPercent = 6.0;
    }
  } else {
    // For SHORT: slPrice MUST ALWAYS be strictly GREATER than markPrice. Fallback 6% above if inverted.
    if (effectiveSlPrice <= markPrice || isNaN(effectiveSlPrice)) {
      effectiveSlPrice = Number((markPrice * 1.06).toFixed(markPrice < 1 ? (markPrice < 0.001 ? 8 : 6) : 4));
      effectiveSlPercent = 6.0;
    }
  }

  // =========================================================================
  // HARD RISK CEILING CHECK (ABSOLUTE SANITY FLOOR: 14.0%)
  // =========================================================================
  const isRiskExceeded = effectiveSlPercent > 14.0 || (riskDisqualified && !isSfpReclaim);

  // Dynamic Risk-Adaptive Leverage Guidance
  const lev = computeRiskAdaptiveLeverage(effectiveSlPercent);
  const effectiveRecLeverage = lev.recLeverage;
  const effectiveLeverageBadge = lev.leverageBadge;
  const effectiveSwingBase = isSfpReclaim
    ? sfpSweepLow
    : isStickyValid && existingActiveValid?.swingBase
    ? existingActiveValid.swingBase
    : (swingBase || (finalDirection === 'LONG' ? markPrice * 0.985 : markPrice * 1.015));
  const effectiveAtrBuffer = isStickyValid && existingActiveValid?.atrBuffer
    ? existingActiveValid.atrBuffer
    : (atrBuffer || markPrice * 0.006);

  // 2. Structural Proximity
  let supportDistPct = 0;
  let resistDistPct = 0;

  if (direction === 'LONG') {
    if (high24h > 0) {
      if (markPrice >= high24h * 0.998) {
        resistDistPct = 0;
      } else {
        resistDistPct = Number((((high24h - markPrice) / markPrice) * 100).toFixed(2));
      }
    }
    if (low24h > 0 && markPrice >= low24h) {
      supportDistPct = Number((((markPrice - low24h) / low24h) * 100).toFixed(2));
    } else {
      supportDistPct = 5.0;
    }
  } else {
    if (low24h > 0) {
      if (markPrice <= low24h * 1.002) {
        supportDistPct = 0;
      } else {
        supportDistPct = Number((((markPrice - low24h) / markPrice) * 100).toFixed(2));
      }
    }
    if (high24h > 0 && high24h >= markPrice) {
      resistDistPct = Number((((high24h - markPrice) / markPrice) * 100).toFixed(2));
    } else {
      resistDistPct = 5.0;
    }
  }

  // =========================================================================
  // CRITICAL ENGINE UNLOCK: STRICT MULTI-TIMEFRAME TREND DOMINANCE
  // =========================================================================
  const isConflictingPullback = !isStickyValid && !isSfpReclaim && ((finalDirection === 'SHORT' && change15m > 0) || (finalDirection === 'LONG' && change15m < 0));

  // Strict Rule on Bottom-Chasing:
  // The engine is STRICTLY FORBIDDEN from generating a SHORT signal on an asset immediately after it has dumped into an oversold support sweep.
  // Shorts require clear rejection under resistance.
  const isBottomChasingShort =
    sweepWatchMap.has(cleanSym) ||
    supportDistPct <= 1.5 ||
    (finalDirection === 'SHORT' && change15m <= -2.5 && supportDistPct <= 2.5 && resistDistPct > 4.5);

  const isLong = finalDirection === 'LONG';
  const takerSellRatio = Number((100 - takerBuyRatio).toFixed(1));

  // =========================================================================
  // HARD GATING FOR 🟢 VALID (ALL 3 MUST PASS, ZERO EXCEPTIONS)
  // 1) Whale Volume Surge: volumeMultiplier >= 2.2x (Reject anything below 2.2x)
  // 2) Taker Dominance: Long >= 52.0%, Short takerSellRatio >= 52.0%
  // 3) Macro Velocity: 1h price change >= +2.5% (Long) or <= -2.5% (Short)
  // =========================================================================
  const meetsWhaleVolumeGate = volMultiplier >= 2.2;
  const meetsTakerDominanceGate = isLong ? takerBuyRatio >= 52.0 : takerSellRatio >= 52.0;
  const meetsMacroVelocityGate = isLong ? change1h >= 2.5 : change1h <= -2.5;
  const passesWhaleValidationGate = meetsWhaleVolumeGate && meetsTakerDominanceGate && meetsMacroVelocityGate;

  // A. 🟢 VALID LONG TRIGGER (PUMP ANOMALY):
  const isPumpAnomaly =
    !isRiskExceeded &&
    passesWhaleValidationGate &&
    !isConflictingPullback &&
    finalDirection === 'LONG' &&
    change1h >= 2.5 &&
    change15m > 0.0 &&
    volMultiplier >= 2.2 &&
    takerBuyRatio >= 52.0;

  // B. 🔴 VALID SHORT TRIGGER (DUMP ANOMALY):
  const isDumpAnomaly =
    !isRiskExceeded &&
    passesWhaleValidationGate &&
    !isBottomChasingShort &&
    !isConflictingPullback &&
    finalDirection === 'SHORT' &&
    change1h <= -2.5 &&
    change15m < 0.0 &&
    volMultiplier >= 2.2 &&
    takerSellRatio >= 52.0;

  let score = 50;
  let tier: MoonScannerTier = 'OBSERVE';

  if (isSfpReclaim && !isRiskExceeded) {
    // 🔥 INSTITUTIONAL SFP RECLAIM (WYCKOFF SPRING): Top conviction alpha
    score = Math.max(94, Math.min(99, (sweepWatch?.priorPeakScore || 90) + 4));
    tier = 'VALID';
    reasons.unshift(
      `🔥 SFP RECLAIM: Whale stop-hunt completed at $${formatPrice(sfpSweepLow)}. Structural floor ($${formatPrice(sweepWatch!.originalSlPrice)}) decisively reclaimed!`,
      `Whale stop-hunt confirmed. Retail sellers trapped. High-conviction structural reclaim active.`
    );
  } else if (isPumpAnomaly) {
    // 🟢 VALID PUMP ANOMALY: Score 85 - 100 based on velocity
    score = 85;
    if (volMultiplier >= 5.0) score += 6;
    else if (volMultiplier >= 3.5) score += 4;
    else if (volMultiplier >= 2.8) score += 2;

    if (change1h >= 7.0 || change15m >= 4.5) score += 5;
    else if (change1h >= 5.0 || change15m >= 3.0) score += 3;
    else if (change1h >= 3.5 || change15m >= 2.0) score += 1;

    // Confluence bonus for OI & Taker if available
    if (oiDeltaPct >= 8.0) score += 2;
    if (takerBuyRatio >= 56.0) score += 2;

    score = Math.min(100, Math.max(85, score));
    tier = 'VALID';
    reasons.push(`🚀 PUMP ANOMALY: Volume ${volMultiplier.toFixed(2)}x with rapid upward velocity (${change1h >= 3.5 ? '+' + change1h.toFixed(2) + '% 1h' : '+' + change15m.toFixed(2) + '% 15m'})`);
  } else if (isDumpAnomaly) {
    // 🔴 VALID DUMP ANOMALY: Score 85 - 100 based on velocity
    score = 85;
    if (volMultiplier >= 5.0) score += 6;
    else if (volMultiplier >= 3.5) score += 4;
    else if (volMultiplier >= 2.8) score += 2;

    if (change1h <= -7.0 || change15m <= -4.5) score += 5;
    else if (change1h <= -5.0 || change15m <= -3.0) score += 3;
    else if (change1h <= -3.5 || change15m <= -2.0) score += 1;

    // Confluence bonus for OI & Taker if available
    if (oiDeltaPct <= -6.0 || oiDeltaPct >= 10.0) score += 2;
    if (takerBuyRatio <= 44.0) score += 2;

    score = Math.min(100, Math.max(85, score));
    tier = 'VALID';
    reasons.push(`🔴 DUMP ANOMALY: Selling volume ${volMultiplier.toFixed(2)}x with rapid breakdown velocity (${change1h <= -3.5 ? change1h.toFixed(2) + '% 1h' : change15m.toFixed(2) + '% 15m'})`);
  } else if (
    !isConflictingPullback &&
    ((volMultiplier >= 1.8 && (Math.abs(change1h) >= 1.5 || Math.abs(change15m) >= 1.0)) ||
    Math.abs(change1h) >= 2.5)
  ) {
    // 🟡 CONFLUENCE: Score 75 - 84 (Building momentum)
    score = 75;
    if (volMultiplier >= 2.2) score += 3;
    if (Math.abs(change1h) >= 2.5) score += 3;
    if (takerBuyRatio >= 55.0 || takerBuyRatio <= 45.0) score += 2;
    if (Math.abs(oiDeltaPct) >= 5.0) score += 1;

    score = Math.min(84, Math.max(75, score));
    tier = 'CONFLUENCE';
    reasons.push(`🟡 Building Momentum: Volume ${volMultiplier.toFixed(2)}x with 1h move ${change1h >= 0 ? '+' : ''}${change1h.toFixed(2)}%`);
  } else {
    // 🔴 OBSERVE: Score < 75 (Normal baseline)
    score = 45;
    if (volMultiplier >= 1.4) score += 10;
    if (Math.abs(change1h) >= 1.0) score += 10;
    if (Math.abs(change15m) >= 0.5) score += 5;

    score = Math.min(74, Math.max(40, score));
    tier = 'OBSERVE';
    reasons.push(`Normal Baseline: 1h momentum ${change1h >= 0 ? '+' : ''}${change1h.toFixed(2)}% | Vol ${volMultiplier.toFixed(2)}x`);
  }

  // =========================================================================
  // DYNAMIC VELOCITY BOOSTER (HIGH-MOMENTUM CONFLUENCE ELEVATION)
  // Strictly respects hard risk ceiling and whale validation gate
  // =========================================================================
  const isHighVelocityLong = !isRiskExceeded && passesWhaleValidationGate && !isConflictingPullback && finalDirection === 'LONG' && change1h >= 7.0 && change15m > 0.0 && resistDistPct <= 2.5;
  const isHighVelocityShort = !isRiskExceeded && passesWhaleValidationGate && !isConflictingPullback && finalDirection === 'SHORT' && change1h <= -7.0 && change15m < 0.0 && supportDistPct <= 2.5;

  if (isHighVelocityLong || isHighVelocityShort) {
    score += 15;
    score = Math.min(100, score);
    if (score >= 85) {
      tier = 'VALID';
      if (isHighVelocityLong) {
        reasons.unshift(`🚀 HIGH-VELOCITY BREAKOUT: +${change1h.toFixed(2)}% 1h expansion within ${resistDistPct.toFixed(2)}% of 24h high (+15 score booster)`);
      } else {
        reasons.unshift(`🔴 HIGH-VELOCITY BREAKDOWN: ${change1h.toFixed(2)}% 1h collapse within ${supportDistPct.toFixed(2)}% of 24h low (+15 score booster)`);
      }
    }
  }

  // C. CONFLICTING / CHOPPY CONDITIONS (for non-sticky assets):
  if (isConflictingPullback) {
    score = Math.min(68, score);
    tier = 'OBSERVE';
    reasons.unshift(finalDirection === 'SHORT'
      ? `⏳ PULLBACK RELIEF: 15m bounce (+${change15m.toFixed(2)}%) fighting 1h macro downtrend (${change1h.toFixed(2)}%) - Score capped at ${score} (<75)`
      : `⏳ PULLBACK RELIEF: 15m dip (${change15m.toFixed(2)}%) within 1h macro uptrend (+${change1h.toFixed(2)}%) - Score capped at ${score} (<75)`);
  }

  // =========================================================================
  // STICKY VALID RETENTION & SCORE PRESERVATION
  // =========================================================================
  // Once an asset is marked VALID, it CANNOT be demoted to OBSERVE during a routine pullback!
  // Lock score at >= 90 and keep tier as VALID holding above SL
  if (isStickyValid && existingActiveValid) {
    if (isRiskExceeded) {
      activeValidSignalsMap.delete(cleanSym);
      isStickyValid = false;
    } else {
      tier = 'VALID';
      score = Math.max(90, Math.min(100, Math.max(existingActiveValid.peakScore, score)));
      existingActiveValid.peakScore = Math.max(existingActiveValid.peakScore, score);
    }
  }

  // =========================================================================
  // ABSOLUTE INSTITUTIONAL VALID GATING & HARD RISK FILTER (ZERO EXCEPTIONS)
  // =========================================================================
  if (isRiskExceeded) {
    tier = 'OBSERVE';
    score = Math.min(50, score);
    activeValidSignalsMap.delete(cleanSym);
    reasons.unshift(`🛑 RISK DISQUALIFIED: Risk Exceeds 14.0% Safe Threshold (-${effectiveSlPercent.toFixed(2)}% SL rejected)`);
  } else if (!isStickyValid && tier === 'VALID') {
    // Non-sticky candidates MUST strictly pass all 3 baseline validation gates
    if (!passesWhaleValidationGate && !isSfpReclaim) {
      tier = 'OBSERVE';
      score = Math.min(74, score);
      const gateFails: string[] = [];
      if (!meetsWhaleVolumeGate) gateFails.push(`Vol ${volMultiplier.toFixed(2)}x < 2.2x`);
      if (!meetsTakerDominanceGate) gateFails.push(isLong ? `Taker Buy ${takerBuyRatio.toFixed(1)}% < 52.0%` : `Taker Sell ${takerSellRatio.toFixed(1)}% < 52.0%`);
      if (!meetsMacroVelocityGate) gateFails.push(`1h ${change1h.toFixed(2)}% fails ±2.5%`);
      reasons.unshift(`🔴 VALID DISQUALIFIED: Baseline Gate Failed (${gateFails.join(', ')})`);
    }
  }

  // =========================================================================
  // DYNAMIC EXPANSION TARGET ENGINE (MINIMUM TARGET & MACRO RUNNER PROJECTIONS)
  // =========================================================================
  const priceDecimals = markPrice < 1 ? (markPrice < 0.001 ? 8 : 6) : (markPrice < 10 ? 4 : 2);
  const effectiveAtr = params.atr14 || (effectiveAtrBuffer ? effectiveAtrBuffer / 0.4 : markPrice * 0.012);

  let target1Price = 0;
  let target1Percent = 0;
  let target2Price = 0;
  let target2Percent = 0;

  if (finalDirection === 'LONG') {
    // Primary Target (Minimum Expansion / Conservative Base):
    // Targets the nearest major structural swing high / liquidity shelf or 1.8x the structural risk.
    target1Price = markPrice + Math.max(effectiveAtr * 2.5, (markPrice - effectiveSlPrice) * 1.8);
    target1Price = Number(target1Price.toFixed(priceDecimals));
    target1Percent = Number((((target1Price - markPrice) / markPrice) * 100).toFixed(2));

    // Macro Target (Whale Expansion Runner):
    // Projected high-timeframe liquidity sweep extension for strong momentum runners.
    target2Price = markPrice + Math.max(effectiveAtr * 5.0, (markPrice - effectiveSlPrice) * 3.5);
    target2Price = Number(target2Price.toFixed(priceDecimals));
    target2Percent = Number((((target2Price - markPrice) / markPrice) * 100).toFixed(2));
  } else {
    // Primary Target (Minimum Breakdown / Support Sweep):
    // Targets the nearest structural support floor or 1.8x structural risk down.
    const rawT1 = markPrice - Math.max(effectiveAtr * 2.5, (effectiveSlPrice - markPrice) * 1.8);
    target1Price = rawT1 > 0 ? Number(rawT1.toFixed(priceDecimals)) : Number((markPrice * 0.9).toFixed(priceDecimals));
    target1Percent = Number((((markPrice - target1Price) / markPrice) * 100).toFixed(2));

    // Macro Target (Whale Liquidation Flush):
    // Deep flush target down into high-timeframe demand zones.
    const rawT2 = markPrice - Math.max(effectiveAtr * 5.0, (effectiveSlPrice - markPrice) * 3.5);
    target2Price = rawT2 > 0 ? Number(rawT2.toFixed(priceDecimals)) : Number((markPrice * 0.75).toFixed(priceDecimals));
    target2Percent = Number((((markPrice - target2Price) / markPrice) * 100).toFixed(2));
  }

  const target1 = { price: target1Price, percent: target1Percent };
  const target2 = { price: target2Price, percent: target2Percent };

  // Register in activeValidSignalsMap on qualifying as VALID
  if (tier === 'VALID' && score >= 85 && !isRiskExceeded) {
    const existing = activeValidSignalsMap.get(cleanSym);
    if (!existing) {
      dispatchedInvalidations.delete(cleanSym); // Reset invalidation one-shot latch for newly signaled pair
      activeValidSignalsMap.set(cleanSym, {
        symbol: cleanSym,
        direction: finalDirection,
        entryPrice: markPrice,
        slPrice: effectiveSlPrice,
        slPercent: effectiveSlPercent,
        recLeverage: effectiveRecLeverage,
        leverageBadge: effectiveLeverageBadge,
        swingBase: effectiveSwingBase,
        atrBuffer: effectiveAtrBuffer,
        target1,
        target2,
        peakScore: score,
        triggeredAt: now,
        status: 'VALID'
      });
      console.log(`[MoonEngine] Registered Sticky VALID Signal Latch for #${cleanSym} (${finalDirection}) at $${markPrice}, SL: $${effectiveSlPrice} (-${effectiveSlPercent}%) [${effectiveLeverageBadge}]`);
    } else {
      existing.peakScore = Math.max(existing.peakScore, score);
      existing.target1 = target1;
      existing.target2 = target2;
    }
  } else {
    // If not VALID or risk exceeded, remove from active signals
    if (activeValidSignalsMap.has(cleanSym) && isRiskExceeded) {
      activeValidSignalsMap.delete(cleanSym);
    }
  }

  // Structural Invalidation Floor (SL) Attached
  reasons.push(`Structural Invalidation: $${formatPrice(effectiveSlPrice)} (-${effectiveSlPercent}%) [${effectiveLeverageBadge}]`);
  reasons.push(`🎯 Targets: Primary $${formatPrice(target1Price)} (${finalDirection === 'LONG' ? '+' : '-'}${target1Percent.toFixed(1)}%) | Macro $${formatPrice(target2Price)} (${finalDirection === 'LONG' ? '+' : '-'}${target2Percent.toFixed(1)}%)`);

  if (oiDeltaPct !== 0) {
    reasons.push(`Whale OI Delta: ${oiDeltaPct >= 0 ? '+' : ''}${oiDeltaPct.toFixed(1)}%`);
  }
  if (takerBuyRatio !== 50.0) {
    reasons.push(`Taker CVD: ${takerBuyRatio.toFixed(1)}% ${takerBuyRatio >= 50 ? 'Buyer Dominant' : 'Seller Dominant'}`);
  }

  // BTC Dump Shield Reason
  if (btcMacro.isDumpShieldActive && finalDirection === 'LONG') {
    reasons.push(`BTC Macro Dump Shield Active (BTC 15m RSI: ${btcMacro.rsi15m})`);
  }

  // Execution Mode Calculation: DYNAMIC PULLBACK DIP GUIDANCE & SFP RECLAIM
  let executionMode: MoonScannerExecutionMode;
  let executionLabel: string;
  let executionGuidance: string;
  let entryZone: string;
  let pullbackShelfPrice: number | undefined;

  if (isSfpReclaim) {
    executionMode = '🔥 SFP RECLAIM (LIQUIDITY HUNT COMPLETED)';
    executionLabel = '🔥 SFP RECLAIM (LIQUIDITY HUNT COMPLETED)';
    executionGuidance = 'Whale stop-hunt confirmed. Retail sellers trapped. High-conviction structural reclaim active.';
    entryZone = `${formatRange(effectiveSlPrice * 1.008, markPrice * 1.004)} (SFP Reclaim Zone)`;
    pullbackShelfPrice = sfpSweepLow;
  } else if (isStickyValid && existingActiveValid) {
    if (existingActiveValid.direction === 'LONG' && change15m < 0) {
      // Pullback dip on LONG: Retest retention! e.g. RESOLVUSDT at -3.12%
      executionMode = '🎯 BUY THE RETEST DIP';
      executionLabel = '🎯 BUY THE RETEST DIP';
      executionGuidance = `💎 Institutional Throwback: Holding Above SL $${formatPrice(effectiveSlPrice)} — Discount Entry Zone`;
      entryZone = `${formatRange(effectiveSlPrice * 1.005, markPrice)} (Discount Dip)`;
      pullbackShelfPrice = effectiveSlPrice;
      reasons.unshift(`🎯 RETEST DIP: Healthy 15m pullback (${change15m.toFixed(2)}%) holding firmly above SL $${formatPrice(effectiveSlPrice)}`);
    } else if (existingActiveValid.direction === 'SHORT' && change15m > 0) {
      // Relief bounce on SHORT: Retest retention!
      executionMode = '🎯 BUY THE RETEST DIP';
      executionLabel = '🎯 SELL THE RETEST DIP';
      executionGuidance = `💎 Institutional Relief Throwback: Holding Below SL $${formatPrice(effectiveSlPrice)} — Premium Short Zone`;
      entryZone = `${formatRange(markPrice, effectiveSlPrice * 0.995)} (Relief Short)`;
      pullbackShelfPrice = effectiveSlPrice;
      reasons.unshift(`🎯 RETEST DIP: Healthy 15m relief bounce (+${change15m.toFixed(2)}%) holding below SL $${formatPrice(effectiveSlPrice)}`);
    } else {
      const exec = evaluateExecutionMode({
        direction: finalDirection,
        markPrice,
        volMultiplier,
        takerBuyRatio,
        oiDeltaPct,
        change1h,
        change15m,
        resistDistPct,
        supportDistPct,
        pivotShelf,
        swingBase: effectiveSwingBase,
        recentBounce,
        tier
      });
      executionMode = exec.mode;
      executionLabel = exec.label;
      executionGuidance = exec.guidance;
      entryZone = exec.entryZone;
      pullbackShelfPrice = exec.pullbackShelfPrice;
    }
  } else {
    const exec = evaluateExecutionMode({
      direction: finalDirection,
      markPrice,
      volMultiplier,
      takerBuyRatio,
      oiDeltaPct,
      change1h,
      change15m,
      resistDistPct,
      supportDistPct,
      pivotShelf,
      swingBase: effectiveSwingBase,
      recentBounce,
      tier
    });
    executionMode = exec.mode;
    executionLabel = exec.label;
    executionGuidance = exec.guidance;
    entryZone = exec.entryZone;
    pullbackShelfPrice = exec.pullbackShelfPrice;
  }

  return {
    id: `syn-${symbol}-${now}`,
    symbol,
    baseAsset,
    direction: finalDirection,
    markPrice,
    score,
    tier,
    executionMode,
    executionLabel,
    executionGuidance,
    entryZone,
    pullbackShelfPrice,
    volMultiplier,
    change15m,
    change1h,
    change24h,
    fundingFeePct,
    supportDistPct,
    resistDistPct,
    oiDeltaPct,
    takerBuyRatio,
    slPrice: effectiveSlPrice,
    slPercent: effectiveSlPercent,
    recLeverage: effectiveRecLeverage,
    leverageBadge: effectiveLeverageBadge,
    swingBase: effectiveSwingBase,
    atrBuffer: effectiveAtrBuffer,
    target1,
    target2,
    target1Price,
    target1Percent,
    target2Price,
    target2Percent,
    btcMacroSafe: !btcMacro.isDumpShieldActive,
    btcRsi15m: btcMacro.rsi15m,
    high24h,
    low24h,
    quoteVolume24h,
    reasons,
    timestamp: now,
    scanTimeFormatted: new Date(now).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }),
    binanceUrl: `https://www.binance.com/en/futures/${symbol}`
  };
}

/**
 * Universal comparator strictly enforcing Dynamic Strength-Based Sorting:
 * 1. Primary Tier: VALID first, then CONFLUENCE, then OBSERVE
 * 2. Secondary (within same tier): Descending by Volume Multiplier (e.g. 9.5x above 4.2x)
 * 3. Tertiary tie-breaker: Descending by Whale OI Surge & 1h Momentum
 * Result: Card #1 is ALWAYS the market's single most explosive whale-backed runner!
 */
export function sortMoonScannerCandidates(list: MoonScannerCandidate[]): MoonScannerCandidate[] {
  return [...list].sort((a, b) => {
    // 1. Primary: Tier
    const tierScore = (t: MoonScannerTier) => (t === 'VALID' ? 3 : t === 'CONFLUENCE' ? 2 : 1);
    const tierDiff = tierScore(b.tier) - tierScore(a.tier);
    if (tierDiff !== 0) return tierDiff;

    // 2. Secondary within same tier: Volume Multiplier descending
    const volDiff = b.volMultiplier - a.volMultiplier;
    if (Math.abs(volDiff) >= 0.1) return volDiff;

    // 3. Tertiary: Whale OI Surge + 1h Momentum composite strength
    const strengthA = (a.oiDeltaPct * 1.5) + Math.abs(a.change1h);
    const strengthB = (b.oiDeltaPct * 1.5) + Math.abs(b.change1h);
    return strengthB - strengthA;
  });
}

/**
 * Universal Real-Time Coin Inspector:
 * Inspects ANY Binance USDT-M Perpetual pair on-demand in real-time,
 * evaluates orderflow, CVD, OI, and returns complete MoonScanner Candidate!
 */
export async function inspectSinglePair(rawSymbol: string): Promise<MoonScannerCandidate | null> {
  const clean = rawSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return null;
  const symCandidates = [
    clean.endsWith('USDT') ? clean : `${clean}USDT`,
    clean.startsWith('1000') ? (clean.endsWith('USDT') ? clean : `${clean}USDT`) : `1000${clean.replace(/USDT$/, '')}USDT`
  ];

  for (const sym of symCandidates) {
    if (isBlacklistedAsset(sym)) continue;

    try {
      const [tickerRes, premiumRes, btcMacro] = await Promise.all([
        fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}`, { signal: AbortSignal.timeout(4500) }),
        fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`, { signal: AbortSignal.timeout(4500) }),
        getBtcMacroDumpShieldStatus()
      ]);

      if (!tickerRes.ok || !premiumRes.ok) {
        continue;
      }

      const t = (await (async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch(e) { return null; } })(tickerRes));
      const p = (await (async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch(e) { return null; } })(premiumRes));

      const lastRate = parseFloat(p.lastFundingRate);
      const fundingFeePct = isNaN(lastRate) ? 0.01 : Number((lastRate * 100).toFixed(4));
      const markPrice = parseFloat(p.markPrice) || parseFloat(t.lastPrice) || 0;
      const high24h = parseFloat(t.highPrice) || 0;
      const low24h = parseFloat(t.lowPrice) || 0;
      const change24h = parseFloat(t.priceChangePercent) || 0;
      const quoteVol = parseFloat(t.quoteVolume) || 0;

      const approxDirection: MoonScannerDirection = change24h >= 0 ? 'LONG' : 'SHORT';

      const [metrics, oiDeltaPct] = await Promise.all([
        fetch15mCandleMetrics(sym, markPrice, approxDirection),
        fetchOpenInterestDelta(sym)
      ]);

      const candidate = evaluateMoonScannerCandidate({
        symbol: sym,
        markPrice,
        high24h,
        low24h,
        quoteVolume24h: quoteVol,
        fundingFeePct,
        change24h,
        change15m: metrics.change15m,
        change1h: metrics.change1h,
        volMultiplier: metrics.volMultiplier,
        oiDeltaPct,
        takerBuyRatio: metrics.takerBuyRatio,
        slPrice: metrics.slPrice,
        slPercent: metrics.slPercent,
        riskDisqualified: metrics.riskDisqualified,
        recentBounce: metrics.recentBounce,
        pivotShelf: metrics.pivotShelf,
        swingBase: metrics.swingBase,
        atrBuffer: metrics.atrBuffer,
        recLeverage: metrics.recLeverage,
        leverageBadge: metrics.leverageBadge,
        lowestRecentLow: metrics.lowestRecentLow,
        isAbsorptionWick: metrics.isAbsorptionWick,
        btcMacro
      });

      // Merge or update in global memory
      const existingIdx = cachedMoonScannerCandidates.findIndex(c => c.symbol === sym);
      if (existingIdx >= 0) {
        cachedMoonScannerCandidates[existingIdx] = candidate;
      } else {
        cachedMoonScannerCandidates.unshift(candidate);
      }
      cachedMoonScannerCandidates = sortMoonScannerCandidates(cachedMoonScannerCandidates);

      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Runs a complete market scan across Binance Futures USDT-M Perpetuals
 */
export async function runMoonScannerScan(): Promise<MoonScannerCandidate[]> {
  if (isScanInProgress) {
    return cachedMoonScannerCandidates;
  }

  isScanInProgress = true;
  const startTime = Date.now();

  try {
    // 1. Concurrently fetch Tickers, Premium Index, and BTC Macro Shield status
    const [tickerRes, premiumRes, btcMacro] = await Promise.all([
      fetch('https://fapi.binance.com/fapi/v1/ticker/24hr', { signal: AbortSignal.timeout(65000) }),
      fetch('https://fapi.binance.com/fapi/v1/premiumIndex', { signal: AbortSignal.timeout(65000) }),
      getBtcMacroDumpShieldStatus()
    ]);

    if (!tickerRes.ok || !premiumRes.ok) {
      throw new Error(`Binance API error: ticker=${tickerRes.status}, premium=${premiumRes.status}`);
    }

    const tickers: any[] = (await (async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch(e) { return null; } })(tickerRes));
    const premiumData: any[] = (await (async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch(e) { return null; } })(premiumRes));

    if (!Array.isArray(tickers) || !Array.isArray(premiumData)) {
      throw new Error('Invalid response structure from Binance Futures');
    }

    // Map funding rate by symbol
    const fundingMap = new Map<string, { fundingFeePct: number; markPrice: number }>();
    for (const p of premiumData) {
      if (p.symbol && p.symbol.endsWith('USDT')) {
        const lastRate = parseFloat(p.lastFundingRate);
        const mark = parseFloat(p.markPrice);
        fundingMap.set(p.symbol, {
          fundingFeePct: isNaN(lastRate) ? 0 : Number((lastRate * 100).toFixed(4)),
          markPrice: isNaN(mark) ? 0 : mark
        });
      }
    }

    // Filter USDT perpetuals and strictly purge all blacklisted synthetics/commodities/pegged
    const validTickers = tickers.filter(t => {
      if (!t.symbol || !t.symbol.endsWith('USDT')) return false;
      if (isBlacklistedAsset(t.symbol)) return false;
      const qVol = parseFloat(t.quoteVolume);
      return !isNaN(qVol) && qVol >= 8_000_000;
    });

    // Sort by quote volume / volatility to prioritize high-action pairs
    validTickers.sort((a, b) => {
      const volA = Math.abs(parseFloat(a.priceChangePercent) || 0) * (parseFloat(a.quoteVolume) || 0);
      const volB = Math.abs(parseFloat(b.priceChangePercent) || 0) * (parseFloat(b.quoteVolume) || 0);
      return volB - volA;
    });

    // Limit active scan pool to top 60 pairs for instant sub-second refresh
    const scanPool = validTickers;

    const evaluatedCandidates: MoonScannerCandidate[] = [];
    const batchSize = 10;

    for (let i = 0; i < scanPool.length; i += batchSize) {
      const batch = scanPool.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (t) => {
          const sym = t.symbol;
          const fundInfo = fundingMap.get(sym);
          const markPrice = fundInfo?.markPrice || parseFloat(t.lastPrice) || 0;
          const high24h = parseFloat(t.highPrice) || 0;
          const low24h = parseFloat(t.lowPrice) || 0;
          const change24h = parseFloat(t.priceChangePercent) || 0;
          const quoteVol = parseFloat(t.quoteVolume) || 0;
          const fundingFeePct = fundInfo?.fundingFeePct ?? 0.01;

          // Tentative direction to guide candle SL search
          const approxDirection: MoonScannerDirection = change24h >= 0 ? 'LONG' : 'SHORT';

          // Parallel fetch: 15M candle metrics (Vol, Taker CVD, SL, Bounces) + Open Interest Delta
          const [metrics, oiDeltaPct] = await Promise.all([
            fetch15mCandleMetrics(sym, markPrice, approxDirection),
            fetchOpenInterestDelta(sym)
          ]);

          return evaluateMoonScannerCandidate({
            symbol: sym,
            markPrice,
            high24h,
            low24h,
            quoteVolume24h: quoteVol,
            fundingFeePct,
            change24h,
            change15m: metrics.change15m,
            change1h: metrics.change1h,
            volMultiplier: metrics.volMultiplier,
            oiDeltaPct,
            takerBuyRatio: metrics.takerBuyRatio,
            slPrice: metrics.slPrice,
            slPercent: metrics.slPercent,
            riskDisqualified: metrics.riskDisqualified,
            recentBounce: metrics.recentBounce,
            pivotShelf: metrics.pivotShelf,
            swingBase: metrics.swingBase,
            atrBuffer: metrics.atrBuffer,
            atr14: metrics.atr14,
            recLeverage: metrics.recLeverage,
            leverageBadge: metrics.leverageBadge,
            lowestRecentLow: metrics.lowestRecentLow,
            isAbsorptionWick: metrics.isAbsorptionWick,
            btcMacro
          });
        })
      );

      evaluatedCandidates.push(...batchResults);
    }

    // Dynamic strength-based card sorting
    const sorted = sortMoonScannerCandidates(evaluatedCandidates);

    cachedMoonScannerCandidates = sorted;
    lastScanTimestamp = Date.now();
    scanDurationMs = Date.now() - startTime;

    // Check for VALID candidates eligible for Telegram dispatch
    await checkAndDispatchMoonScannerAlerts(sorted);

    return sorted;
  } catch (err: any) {
    console.error('[MoonEngine] Scan error:', err?.message || err);
    return cachedMoonScannerCandidates;
  } finally {
    isScanInProgress = false;
  }
}

/**
 * Checks for VALID candidates and triggers Telegram VIP Alert
 * Alert gate: Any asset reaching Score >= 85 with 🟢 VALID LONG or 🔴 VALID SHORT
 * Strictly enforces 5.0% SL risk ceiling and 3 baseline validation gates.
 * Respects BTC dump shield for LONGs, dispatches high-conviction SHORTs.
 */
async function checkAndDispatchMoonScannerAlerts(candidates: MoonScannerCandidate[]): Promise<void> {
  const validCandidates = candidates.filter(
    c => c.tier === 'VALID' &&
      c.score >= 85 &&
      c.slPercent !== undefined &&
      c.slPercent >= 1.0 &&
      c.slPercent <= 14.0 && // Absolute Sanity Floor: Disqualify any SL > 14.0%
      (
        c.executionLabel?.includes('SFP RECLAIM') ||
        c.executionMode?.includes('SFP RECLAIM') ||
        (
          c.volMultiplier >= 2.2 && // STRICT 2.2x MIN VOLUME
          (
            (c.direction === 'LONG' && c.change1h >= 2.5 && c.change15m > 0 && c.takerBuyRatio >= 52.0 && c.btcMacroSafe) ||
            (c.direction === 'SHORT' && c.change1h <= -2.5 && c.change15m < 0 && (100 - c.takerBuyRatio) >= 52.0)
          )
        )
      )
  );

  if (validCandidates.length === 0) return;

  // SFP Reclaims are prioritized as highest conviction institutional alpha
  const topAlpha = validCandidates.find(c => c.executionLabel?.includes('SFP RECLAIM')) || validCandidates[0];
  if (!isSymbolInMoonScannerTelegramCooldown(topAlpha.symbol)) {
    try {
      const { dispatchMoonScannerTelegramAlert } = await import('./telegramService');
      const res = await dispatchMoonScannerTelegramAlert(topAlpha);
      if (res.success) {
        markSymbolMoonScannerDispatched(topAlpha.symbol);
        console.log(`[MoonEngine] Dispatched VALID ${topAlpha.direction} alert for #${topAlpha.symbol} (${topAlpha.executionLabel || topAlpha.executionMode}) - Score: ${topAlpha.score}, SL: ${topAlpha.slPercent}%`);
      }
    } catch (e: any) {
      console.warn('[MoonEngine] Telegram dispatch error:', e?.message || e);
    }
  }
}

export function getMoonScannerCandidates(): MoonScannerCandidate[] {
  return cachedMoonScannerCandidates;
}

export function getMoonScannerTelemetry(): MoonEngineTelemetry {
  const total = cachedMoonScannerCandidates.length;
  const valid = cachedMoonScannerCandidates.filter(c => c.tier === 'VALID').length;
  const confluence = cachedMoonScannerCandidates.filter(c => c.tier === 'CONFLUENCE').length;
  const observe = total - valid - confluence;

  return {
    lastScanTimestamp,
    lastScanFormatted: lastScanTimestamp > 0 ? getBangladeshTimeString(new Date(lastScanTimestamp)) : 'Pending first scan',
    totalMonitored: total,
    validCount: valid,
    confluenceCount: confluence,
    observeCount: Math.max(0, observe),
    scanDurationMs,
    isScanning: isScanInProgress,
    btcDumpShieldActive: cachedBtcMacro.isDumpShieldActive,
    btcRsi15m: cachedBtcMacro.rsi15m
  };
}

let scanIntervalHandle: NodeJS.Timeout | null = null;

export function startMoonScannerScanner(): void {
  if (scanIntervalHandle) return;

  // Flush stale state on initialization
  purgeStaleEngineState();

  console.log('[MoonEngine] Starting continuous institutional MoonScanner Pro scanner (Dual-Mode Smart Entry + Confluence)...');
  runMoonScannerScan().catch(() => {});

  scanIntervalHandle = setInterval(() => {
    runMoonScannerScan().catch(() => {});
  }, 65000);
}

export function stopMoonScannerScanner(): void {
  if (scanIntervalHandle) {
    clearInterval(scanIntervalHandle);
    scanIntervalHandle = null;
  }
}
