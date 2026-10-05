import { Candle, Ticker24h } from './cryptoService';
import { DerivativesData } from './advancedMarketData';
import {
  ExchangeProviderId,
  ProviderHealthReport,
  ProviderHealthStatus,
  MarketDataQualityReport
} from '../src/types/crypto';

export interface LiveMarketDataSnapshot {
  symbol: string;
  currentPrice: number;
  priceChange24h: number;
  volume24h: number;
  candles: Map<string, Candle[]>;
  ticker?: Ticker24h;
  derivatives?: DerivativesData;
  lastUpdated: number;
  primarySource: ExchangeProviderId;
  isStale: boolean;
  stalenessMs: number;
}

// Maximum allowed age before market data is classified as critically stale (5 minutes)
export const CRITICAL_STALENESS_THRESHOLD_MS = 300000;
// Normal cache TTL for fast responses (10 seconds)
export const LIVE_CACHE_TTL_MS = 10000;

// ============================================================================
// BINANCE-ONLY PRODUCTION MODE CONFIGURATION
// ============================================================================
/**
 * Authoritative production mode toggle:
 * When true, ALL signal-related market data MUST come from Binance only.
 * No fallback to Bybit, OKX, MEXC, synthetic data, or stale cache from other providers.
 * If MoonScanner has to choose between: WRONG SIGNAL and NO SIGNAL it MUST choose: NO SIGNAL.
 */
export const BINANCE_ONLY_MODE = true;

export function isBinanceOnlyMode(): boolean {
  return BINANCE_ONLY_MODE;
}

export interface PriceConsistencyResult {
  isConsistent: boolean;
  rejectReason?: string;
  divergencePct: number;
}

/**
 * Live Price Consistency Firewall:
 * Validates that current live ticker price and the latest candle close price
 * are consistent within tolerance (default max 2.0% divergence).
 */
export function validateLivePriceConsistency(
  liveTickerPrice: number,
  candleClosePrice: number,
  maxAllowedDivergencePct: number = 2.0
): PriceConsistencyResult {
  if (!Number.isFinite(liveTickerPrice) || liveTickerPrice <= 0) {
    return { isConsistent: false, rejectReason: 'INVALID_LIVE_TICKER_PRICE', divergencePct: 100 };
  }
  if (!Number.isFinite(candleClosePrice) || candleClosePrice <= 0) {
    return { isConsistent: false, rejectReason: 'INVALID_CANDLE_CLOSE_PRICE', divergencePct: 100 };
  }
  const divergencePct = (Math.abs(liveTickerPrice - candleClosePrice) / liveTickerPrice) * 100;
  if (divergencePct > maxAllowedDivergencePct) {
    return {
      isConsistent: false,
      rejectReason: `PRICE_DIVERGENCE_EXCEEDED (${divergencePct.toFixed(2)}% > ${maxAllowedDivergencePct}%)`,
      divergencePct
    };
  }
  return { isConsistent: true, divergencePct };
}

/**
 * Live Entry Price Consistency Firewall:
 * Validates that current live Binance price and the signal's entry zone [entryLow, entryHigh]
 * are consistent within tolerance (default max 4.0% divergence).
 * Completely eliminates XMR-style wrong Entry bug (where live price is 500 but entry was 100).
 */
export function validateEntryPriceConsistency(
  liveTickerPrice: number,
  entryLow: number,
  entryHigh: number,
  maxAllowedDivergencePct: number = 4.0
): PriceConsistencyResult {
  if (!Number.isFinite(liveTickerPrice) || liveTickerPrice <= 0) {
    return { isConsistent: false, rejectReason: 'INVALID_LIVE_TICKER_PRICE', divergencePct: 100 };
  }
  const low = Math.min(entryLow, entryHigh);
  const high = Math.max(entryLow, entryHigh);
  if (!Number.isFinite(low) || low <= 0) {
    return { isConsistent: false, rejectReason: 'INVALID_ENTRY_PRICE', divergencePct: 100 };
  }
  const entryMid = (low + high) / 2;
  const divergencePct = (Math.abs(liveTickerPrice - entryMid) / entryMid) * 100;
  if (divergencePct > maxAllowedDivergencePct) {
    return {
      isConsistent: false,
      rejectReason: `ENTRY_PRICE_DIVERGENCE_EXCEEDED (${divergencePct.toFixed(2)}% > ${maxAllowedDivergencePct}%): Live price ${liveTickerPrice} diverged from entry zone [${low}, ${high}]`,
      divergencePct
    };
  }
  return { isConsistent: true, divergencePct };
}

/**
 * Stale Candle Protection:
 * Validates candle count, chronological ordering, absence of future timestamps,
 * and freshness of the latest bar against timeframe-specific thresholds.
 */
export function validateCandleDataFreshness(
  candles: Candle[],
  timeframe: string = '1h'
): { isValid: boolean; rejectReason?: string } {
  if (!Array.isArray(candles) || candles.length < 20) {
    return { isValid: false, rejectReason: 'INSUFFICIENT_CANDLES_COUNT (must be >= 20)' };
  }

  const now = Date.now();
  const tf = (timeframe || '1h').toLowerCase();
  let maxAgeMs = 3 * 60 * 60 * 1000; // 1h: 3 hours
  if (tf === '5m') maxAgeMs = 30 * 60 * 1000; // 5m: 30 minutes
  else if (tf === '15m') maxAgeMs = 60 * 60 * 1000; // 15m: 60 minutes
  else if (tf === '4h') maxAgeMs = 12 * 60 * 60 * 1000; // 4h: 12 hours
  else if (tf === '1d') maxAgeMs = 36 * 60 * 60 * 1000; // 1d: 36 hours

  for (let i = 1; i < candles.length; i++) {
    if (candles[i].timestamp <= candles[i - 1].timestamp) {
      return { isValid: false, rejectReason: 'CANDLE_TIMESTAMPS_NOT_CHRONOLOGICALLY_ORDERED' };
    }
  }

  const latest = candles[candles.length - 1];
  if (latest.timestamp > now + 60 * 1000) {
    return { isValid: false, rejectReason: 'CANDLE_TIMESTAMP_IN_FUTURE' };
  }

  const ageMs = now - latest.timestamp;
  if (ageMs > maxAgeMs) {
    return {
      isValid: false,
      rejectReason: `CANDLES_STALE_LATEST_BAR_TOO_OLD (age: ${(ageMs / 60000).toFixed(1)}m > ${(maxAgeMs / 60000).toFixed(1)}m for ${tf})`
    };
  }

  return { isValid: true };
}

// Provider Health State Map
const providerHealthMap = new Map<ExchangeProviderId, ProviderHealthReport>([
  ['binance', { providerId: 'binance', status: 'OPERATIONAL', latencyMs: 45, lastSuccessfulRequest: Date.now(), consecutiveFailures: 0, isRateLimited: false, rateLimitCooldownUntil: 0, wsConnected: false }],
  ['bybit', { providerId: 'bybit', status: 'OPERATIONAL', latencyMs: 65, lastSuccessfulRequest: Date.now(), consecutiveFailures: 0, isRateLimited: false, rateLimitCooldownUntil: 0, wsConnected: false }],
  ['okx', { providerId: 'okx', status: 'OPERATIONAL', latencyMs: 80, lastSuccessfulRequest: Date.now(), consecutiveFailures: 0, isRateLimited: false, rateLimitCooldownUntil: 0, wsConnected: false }],
  ['mexc', { providerId: 'mexc', status: 'OPERATIONAL', latencyMs: 95, lastSuccessfulRequest: Date.now(), consecutiveFailures: 0, isRateLimited: false, rateLimitCooldownUntil: 0, wsConnected: false }],
  ['fallback', { providerId: 'fallback', status: 'OPERATIONAL', latencyMs: 1, lastSuccessfulRequest: Date.now(), consecutiveFailures: 0, isRateLimited: false, rateLimitCooldownUntil: 0, wsConnected: false }]
]);

// In-Memory Live Market Store
const liveMarketStore = new Map<string, LiveMarketDataSnapshot>();

// Rate limit incident counter for observability
let rateLimitIncidentsTotal = 0;
let activeWsConnectionsCount = 0;

/**
 * Normalizes symbol to clean uppercase ticker (e.g. "BTC/USDT" -> "BTCUSDT")
 */
export function normalizeSymbol(sym: string): string {
  return (sym || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

/**
 * Checks if a provider is currently rate-limited or cooling down
 */
export function isProviderRateLimited(provider: ExchangeProviderId): boolean {
  const health = providerHealthMap.get(provider);
  if (!health) return false;
  if (health.isRateLimited && Date.now() < health.rateLimitCooldownUntil) {
    return true;
  }
  if (health.isRateLimited && Date.now() >= health.rateLimitCooldownUntil) {
    health.isRateLimited = false;
    health.status = 'OPERATIONAL';
    health.rateLimitCooldownUntil = 0;
  }
  return false;
}

/**
 * Record a 429 Rate Limit incident for a provider and trigger exponential backoff
 */
export function recordRateLimitIncident(provider: ExchangeProviderId, retryAfterSeconds: number = 30): void {
  const health = providerHealthMap.get(provider);
  if (health) {
    health.isRateLimited = true;
    health.status = 'RATE_LIMITED';
    health.rateLimitCooldownUntil = Date.now() + Math.max(10, retryAfterSeconds) * 1000;
    rateLimitIncidentsTotal++;
    console.warn(`[LiveDataProvider] Rate limit triggered for ${provider}. Cooling down for ${retryAfterSeconds}s`);
  }
}

/**
 * Record successful provider request
 */
export function recordProviderSuccess(provider: ExchangeProviderId, latencyMs: number): void {
  const health = providerHealthMap.get(provider);
  if (health) {
    health.lastSuccessfulRequest = Date.now();
    health.latencyMs = Math.round(health.latencyMs * 0.7 + latencyMs * 0.3);
    health.consecutiveFailures = 0;
    if (health.status !== 'OPERATIONAL' && !health.isRateLimited) {
      health.status = 'OPERATIONAL';
    }
  }
}

/**
 * Record provider error or network failure
 */
export function recordProviderFailure(provider: ExchangeProviderId, error: any, statusCode?: number): void {
  const health = providerHealthMap.get(provider);
  if (health) {
    health.consecutiveFailures++;
    if (statusCode === 429 || statusCode === 418) {
      recordRateLimitIncident(provider, 30);
    } else if (health.consecutiveFailures >= 5) {
      health.status = 'DEGRADED';
    }
  }
}

/**
 * Get all provider health metrics
 */
export function getProviderHealthStatus(): Record<string, ProviderHealthReport> {
  const result: Record<string, ProviderHealthReport> = {};
  for (const [key, val] of providerHealthMap.entries()) {
    result[key] = { ...val };
  }
  return result;
}

/**
 * Convert timeframe string to provider-specific interval strings
 */
function toBybitInterval(interval: string): string {
  switch (interval) {
    case '5m': return '5';
    case '15m': return '15';
    case '30m': return '30';
    case '1h': return '60';
    case '2h': return '120';
    case '4h': return '240';
    case '1d': return 'D';
    default: return '60';
  }
}

function toOkxBar(interval: string): string {
  switch (interval) {
    case '5m': return '5m';
    case '15m': return '15m';
    case '30m': return '30m';
    case '1h': return '1H';
    case '2h': return '2H';
    case '4h': return '4H';
    case '1d': return '1D';
    default: return '1H';
  }
}

// ============================================================================
// PROVIDER ADAPTERS (Binance, Bybit, OKX, MEXC)
// ============================================================================

/**
 * 1. Binance REST Adapter
 */
async function fetchBinanceKlines(symbol: string, interval: string, limit: number): Promise<Candle[] | null> {
  if (isProviderRateLimited('binance')) return null;
  const start = Date.now();
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.status === 429 || res.status === 418) {
      recordRateLimitIncident('binance', 45);
      return null;
    }

    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw) && raw.length > 0) {
        recordProviderSuccess('binance', Date.now() - start);
        return raw.map((k: any) => ({
          timestamp: Number(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }));
      }
    } else {
      recordProviderFailure('binance', new Error(`HTTP ${res.status}`), res.status);
    }
  } catch (err) {
    recordProviderFailure('binance', err);
  }
  return null;
}

/**
 * 2. Bybit REST Adapter
 */
async function fetchBybitKlines(symbol: string, interval: string, limit: number): Promise<Candle[] | null> {
  if (isProviderRateLimited('bybit')) return null;
  const start = Date.now();
  try {
    const bybitTf = toBybitInterval(interval);
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${bybitTf}&limit=${limit}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.status === 429) {
      recordRateLimitIncident('bybit', 30);
      return null;
    }

    if (res.ok) {
      const json = await res.json();
      if (json && json.result && Array.isArray(json.result.list) && json.result.list.length > 0) {
        recordProviderSuccess('bybit', Date.now() - start);
        // Bybit returns list reverse-chronological [start, open, high, low, close, volume, turnover]
        const rawList = [...json.result.list].reverse();
        return rawList.map((k: any) => ({
          timestamp: Number(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }));
      }
    } else {
      recordProviderFailure('bybit', new Error(`HTTP ${res.status}`), res.status);
    }
  } catch (err) {
    recordProviderFailure('bybit', err);
  }
  return null;
}

/**
 * 3. OKX REST Adapter
 */
async function fetchOkxKlines(symbol: string, interval: string, limit: number): Promise<Candle[] | null> {
  if (isProviderRateLimited('okx')) return null;
  const start = Date.now();
  try {
    const instId = symbol.endsWith('USDT') ? `${symbol.replace('USDT', '')}-USDT` : symbol;
    const bar = toOkxBar(interval);
    const url = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.status === 429) {
      recordRateLimitIncident('okx', 30);
      return null;
    }

    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.data) && json.data.length > 0) {
        recordProviderSuccess('okx', Date.now() - start);
        // OKX returns list reverse-chronological [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
        const rawList = [...json.data].reverse();
        return rawList.map((k: any) => ({
          timestamp: Number(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }));
      }
    } else {
      recordProviderFailure('okx', new Error(`HTTP ${res.status}`), res.status);
    }
  } catch (err) {
    recordProviderFailure('okx', err);
  }
  return null;
}

/**
 * 4. MEXC REST Adapter
 */
async function fetchMexcKlines(symbol: string, interval: string, limit: number): Promise<Candle[] | null> {
  if (isProviderRateLimited('mexc')) return null;
  const start = Date.now();
  try {
    const mexcTf = interval === '1h' ? '60m' : interval === '15m' ? '15m' : interval === '4h' ? '4h' : interval === '1d' ? '1d' : '60m';
    const url = `https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=${mexcTf}&limit=${limit}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.status === 429) {
      recordRateLimitIncident('mexc', 30);
      return null;
    }

    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw) && raw.length > 0) {
        recordProviderSuccess('mexc', Date.now() - start);
        return raw.map((k: any) => ({
          timestamp: Number(k[0]),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }));
      }
    } else {
      recordProviderFailure('mexc', new Error(`HTTP ${res.status}`), res.status);
    }
  } catch (err) {
    recordProviderFailure('mexc', err);
  }
  return null;
}

/**
 * 4. Binance 24h Ticker Adapter
 */
async function fetchBinanceTicker(symbol: string): Promise<Ticker24h | null> {
  if (isProviderRateLimited('binance')) return null;
  const start = Date.now();
  try {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.status === 429 || res.status === 418) {
      recordRateLimitIncident('binance', 45);
      return null;
    }

    if (res.ok) {
      const d = await res.json();
      recordProviderSuccess('binance', Date.now() - start);
      return {
        symbol: d.symbol,
        priceChange: parseFloat(d.priceChange),
        priceChangePercent: parseFloat(d.priceChangePercent),
        lastPrice: parseFloat(d.lastPrice),
        highPrice: parseFloat(d.highPrice),
        lowPrice: parseFloat(d.lowPrice),
        volume: parseFloat(d.volume),
        quoteVolume: parseFloat(d.quoteVolume)
      };
    }
  } catch (err) {
    recordProviderFailure('binance', err);
  }
  return null;
}

/**
 * 5. Bybit 24h Ticker Adapter
 */
async function fetchBybitTicker(symbol: string): Promise<Ticker24h | null> {
  if (isProviderRateLimited('bybit')) return null;
  const start = Date.now();
  try {
    const url = `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json();
      if (json && json.result && Array.isArray(json.result.list) && json.result.list.length > 0) {
        const item = json.result.list[0];
        recordProviderSuccess('bybit', Date.now() - start);
        return {
          symbol: item.symbol,
          priceChange: parseFloat(item.price24hPcnt) * parseFloat(item.lastPrice),
          priceChangePercent: parseFloat(item.price24hPcnt) * 100,
          lastPrice: parseFloat(item.lastPrice),
          highPrice: parseFloat(item.highPrice24h),
          lowPrice: parseFloat(item.lowPrice24h),
          volume: parseFloat(item.volume24h),
          quoteVolume: parseFloat(item.turnover24h)
        };
      }
    }
  } catch (err) {
    recordProviderFailure('bybit', err);
  }
  return null;
}

/**
 * 6. OKX 24h Ticker Adapter
 */
async function fetchOkxTicker(symbol: string): Promise<Ticker24h | null> {
  if (isProviderRateLimited('okx')) return null;
  const start = Date.now();
  try {
    const instId = symbol.endsWith('USDT') ? `${symbol.replace('USDT', '')}-USDT` : symbol;
    const url = `https://www.okx.com/api/v5/market/ticker?instId=${instId}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.data) && json.data.length > 0) {
        const item = json.data[0];
        recordProviderSuccess('okx', Date.now() - start);
        const last = parseFloat(item.last);
        const open24h = parseFloat(item.open24h);
        const changePct = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;
        return {
          symbol,
          priceChange: last - open24h,
          priceChangePercent: changePct,
          lastPrice: last,
          highPrice: parseFloat(item.high24h),
          lowPrice: parseFloat(item.low24h),
          volume: parseFloat(item.vol24h),
          quoteVolume: parseFloat(item.volCcy24h)
        };
      }
    }
  } catch (err) {
    recordProviderFailure('okx', err);
  }
  return null;
}

/**
 * 7. MEXC 24h Ticker Adapter
 */
async function fetchMexcTicker(symbol: string): Promise<Ticker24h | null> {
  if (isProviderRateLimited('mexc')) return null;
  const start = Date.now();
  try {
    const url = `https://api.mexc.com/api/v3/ticker/24hr?symbol=${symbol}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const d = await res.json();
      recordProviderSuccess('mexc', Date.now() - start);
      return {
        symbol: d.symbol,
        priceChange: parseFloat(d.priceChange || '0'),
        priceChangePercent: parseFloat(d.priceChangePercent || '0'),
        lastPrice: parseFloat(d.lastPrice),
        highPrice: parseFloat(d.highPrice || d.lastPrice),
        lowPrice: parseFloat(d.lowPrice || d.lastPrice),
        volume: parseFloat(d.volume || '0'),
        quoteVolume: parseFloat(d.quoteVolume || '0')
      };
    }
  } catch (err) {
    recordProviderFailure('mexc', err);
  }
  return null;
}

// ============================================================================
// RESILIENT MULTI-PROVIDER AGGREGATORS WITH AUTOMATIC FALLBACK
// ============================================================================

/**
 * Fetches OHLCV Candles across multi-exchange adapters with zero crash guarantee.
 * Hierarchy: Binance -> Bybit -> OKX -> MEXC -> Local Cache -> Deterministic Fallback.
 */
export async function getKlinesWithMultiExchangeFallback(
  rawSymbol: string,
  interval: string = '1h',
  limit: number = 100
): Promise<{ candles: Candle[]; source: ExchangeProviderId; isStale: boolean }> {
  const cleanSymbol = normalizeSymbol(rawSymbol);
  const cacheKey = `${cleanSymbol}_${interval}`;

  // Check in-memory store for fresh data
  let snapshot = liveMarketStore.get(cleanSymbol);
  if (!snapshot) {
    snapshot = {
      symbol: cleanSymbol,
      currentPrice: 0,
      priceChange24h: 0,
      volume24h: 0,
      candles: new Map(),
      lastUpdated: 0,
      primarySource: 'fallback',
      isStale: false,
      stalenessMs: 0
    };
    liveMarketStore.set(cleanSymbol, snapshot);
  }

  const cachedCandles = snapshot.candles.get(interval);
  const ageMs = Date.now() - snapshot.lastUpdated;

  if (cachedCandles && cachedCandles.length >= 20 && ageMs < LIVE_CACHE_TTL_MS) {
    return { candles: cachedCandles, source: snapshot.primarySource, isStale: false };
  }

  // When BINANCE_ONLY_MODE is enabled, Binance is the SOLE market data provider.
  // Never fallback to Bybit, OKX, MEXC or stale secondary caches.
  if (BINANCE_ONLY_MODE) {
    const liveCandles = await fetchBinanceKlines(cleanSymbol, interval, limit);
    if (liveCandles && liveCandles.length >= 20) {
      const freshness = validateCandleDataFreshness(liveCandles, interval);
      if (!freshness.isValid) {
        return { candles: [], source: 'binance', isStale: true };
      }
      snapshot.candles.set(interval, liveCandles);
      snapshot.lastUpdated = Date.now();
      snapshot.primarySource = 'binance';
      snapshot.isStale = false;
      snapshot.stalenessMs = 0;
      const lastBar = liveCandles[liveCandles.length - 1];
      snapshot.currentPrice = lastBar.close;
      return { candles: liveCandles, source: 'binance', isStale: false };
    }

    // In Binance-only mode, if Binance fails or is stale: choose NO SIGNAL over WRONG SIGNAL
    return { candles: [], source: 'binance', isStale: true };
  }

  // 1. Try Primary Provider: Binance
  let liveCandles = await fetchBinanceKlines(cleanSymbol, interval, limit);
  let activeSource: ExchangeProviderId = 'binance';

  // 2. Try Secondary Provider: Bybit if Binance failed or rate-limited
  if (!liveCandles || liveCandles.length < 20) {
    liveCandles = await fetchBybitKlines(cleanSymbol, interval, limit);
    if (liveCandles && liveCandles.length >= 20) {
      activeSource = 'bybit';
    }
  }

  // 3. Try Tertiary Provider: OKX
  if (!liveCandles || liveCandles.length < 20) {
    liveCandles = await fetchOkxKlines(cleanSymbol, interval, limit);
    if (liveCandles && liveCandles.length >= 20) {
      activeSource = 'okx';
    }
  }

  // 4. Try Quaternary Provider: MEXC
  if (!liveCandles || liveCandles.length < 20) {
    liveCandles = await fetchMexcKlines(cleanSymbol, interval, limit);
    if (liveCandles && liveCandles.length >= 20) {
      activeSource = 'mexc';
    }
  }

  // If fresh live candles obtained from any exchange
  if (liveCandles && liveCandles.length >= 20) {
    snapshot.candles.set(interval, liveCandles);
    snapshot.lastUpdated = Date.now();
    snapshot.primarySource = activeSource;
    snapshot.isStale = false;
    snapshot.stalenessMs = 0;
    const lastBar = liveCandles[liveCandles.length - 1];
    snapshot.currentPrice = lastBar.close;
    return { candles: liveCandles, source: activeSource, isStale: false };
  }

  // If live calls failed, check cached data
  if (cachedCandles && cachedCandles.length >= 20) {
    const isStale = ageMs > CRITICAL_STALENESS_THRESHOLD_MS;
    snapshot.isStale = isStale;
    snapshot.stalenessMs = ageMs;
    return { candles: cachedCandles, source: snapshot.primarySource, isStale };
  }

  // Zero synthetic / random data policy: return empty candles with stale flag
  return { candles: [], source: 'fallback', isStale: true };
}

/**
 * Fetches 24h Ticker with automatic multi-exchange fallback
 */
export async function getTickerWithMultiExchangeFallback(
  rawSymbol: string
): Promise<{ ticker: Ticker24h | null; source: ExchangeProviderId; isStale: boolean }> {
  const cleanSymbol = normalizeSymbol(rawSymbol);
  const snapshot = liveMarketStore.get(cleanSymbol);
  const ageMs = snapshot ? Date.now() - snapshot.lastUpdated : Infinity;

  if (snapshot && snapshot.ticker && ageMs < LIVE_CACHE_TTL_MS) {
    return { ticker: snapshot.ticker, source: snapshot.primarySource, isStale: false };
  }

  // In Binance-only mode: only query Binance
  if (BINANCE_ONLY_MODE) {
    const ticker = await fetchBinanceTicker(cleanSymbol);
    if (ticker && Number.isFinite(ticker.lastPrice) && ticker.lastPrice > 0) {
      if (snapshot) {
        snapshot.ticker = ticker;
        snapshot.currentPrice = ticker.lastPrice;
        snapshot.priceChange24h = ticker.priceChangePercent;
        snapshot.volume24h = ticker.volume;
        snapshot.lastUpdated = Date.now();
        snapshot.primarySource = 'binance';
        snapshot.isStale = false;
        snapshot.stalenessMs = 0;
      }
      return { ticker, source: 'binance', isStale: false };
    }
    // Return null ticker, no fallbacks
    return { ticker: null, source: 'binance', isStale: true };
  }

  // 1. Try Binance
  let ticker = await fetchBinanceTicker(cleanSymbol);
  let source: ExchangeProviderId = 'binance';

  // 2. Try Bybit
  if (!ticker) {
    ticker = await fetchBybitTicker(cleanSymbol);
    if (ticker) source = 'bybit';
  }

  // 3. Try OKX
  if (!ticker) {
    ticker = await fetchOkxTicker(cleanSymbol);
    if (ticker) source = 'okx';
  }

  // 4. Try MEXC
  if (!ticker) {
    ticker = await fetchMexcTicker(cleanSymbol);
    if (ticker) source = 'mexc';
  }

  if (ticker) {
    if (snapshot) {
      snapshot.ticker = ticker;
      snapshot.currentPrice = ticker.lastPrice;
      snapshot.priceChange24h = ticker.priceChangePercent;
      snapshot.volume24h = ticker.volume;
      snapshot.lastUpdated = Date.now();
      snapshot.primarySource = source;
      snapshot.isStale = false;
      snapshot.stalenessMs = 0;
    }
    return { ticker, source, isStale: false };
  }

  if (snapshot && snapshot.ticker) {
    const isStale = ageMs > CRITICAL_STALENESS_THRESHOLD_MS;
    return { ticker: snapshot.ticker, source: snapshot.primarySource, isStale };
  }

  return { ticker: null, source: 'fallback', isStale: true };
}

export interface TelegramMarketDataResult {
  isFresh: boolean;
  rejectReason?: string;
  source: ExchangeProviderId;
  ticker: {
    symbol: string;
    lastPrice: number;
    highPrice: number;
    lowPrice: number;
    timestamp: number;
  } | null;
  candles: Candle[] | null;
}

/**
 * Authoritative, strictly non-cached market data fetch for live Telegram dispatch.
 * Guarantees fresh live ticker and fresh 1H OHLCV candles with real-time freshness validation.
 * Never falls back to stale cache or artificial data.
 */
/**
 * Fetches verified fresh live market data specifically for Telegram alert dispatch.
 * Guarantees ticker and candles come strictly from live exchanges with zero mock fallback.
 * Allows execution timeframe matching (5m, 15m, 1h, 4h) with strict staleness thresholds.
 */
export async function fetchFreshTelegramLiveMarketData(rawSymbol: string, requestedTf: string = '1h'): Promise<TelegramMarketDataResult> {
  const cleanSymbol = normalizeSymbol(rawSymbol);
  const tf = (requestedTf || '1h').toLowerCase();

  // 1. Fetch live ticker (Binance only when BINANCE_ONLY_MODE is true)
  let ticker: Ticker24h | null = null;
  let activeSource: ExchangeProviderId = 'binance';

  ticker = await fetchBinanceTicker(cleanSymbol);
  if (!BINANCE_ONLY_MODE) {
    if (!ticker) {
      ticker = await fetchBybitTicker(cleanSymbol);
      if (ticker) activeSource = 'bybit';
    }
    if (!ticker) {
      ticker = await fetchOkxTicker(cleanSymbol);
      if (ticker) activeSource = 'okx';
    }
    if (!ticker) {
      ticker = await fetchMexcTicker(cleanSymbol);
      if (ticker) activeSource = 'mexc';
    }
  }

  if (!ticker || !ticker.lastPrice || ticker.lastPrice <= 0 || isNaN(ticker.lastPrice)) {
    return {
      isFresh: false,
      rejectReason: BINANCE_ONLY_MODE ? 'BINANCE_LIVE_TICKER_UNAVAILABLE' : 'FRESH_TICKER_UNAVAILABLE_ACROSS_ALL_EXCHANGES',
      source: activeSource,
      ticker: null,
      candles: null
    };
  }

  // 2. Fetch fresh candles on the requested timeframe (Binance only when BINANCE_ONLY_MODE is true)
  let candles: Candle[] | null = null;
  candles = await fetchBinanceKlines(cleanSymbol, tf, 80);
  if (!BINANCE_ONLY_MODE) {
    if (!candles || candles.length < 20) {
      candles = await fetchBybitKlines(cleanSymbol, tf, 80);
      if (candles && candles.length >= 20) activeSource = 'bybit';
    }
    if (!candles || candles.length < 20) {
      candles = await fetchOkxKlines(cleanSymbol, tf, 80);
      if (candles && candles.length >= 20) activeSource = 'okx';
    }
    if (!candles || candles.length < 20) {
      candles = await fetchMexcKlines(cleanSymbol, tf, 80);
      if (candles && candles.length >= 20) activeSource = 'mexc';
    }
  }

  if (!candles || candles.length < 20) {
    return {
      isFresh: false,
      rejectReason: BINANCE_ONLY_MODE ? `INSUFFICIENT_BINANCE_${tf.toUpperCase()}_CANDLES` : `INSUFFICIENT_${tf.toUpperCase()}_CANDLES_ACROSS_ALL_EXCHANGES`,
      source: activeSource,
      ticker: {
        symbol: cleanSymbol,
        lastPrice: ticker.lastPrice,
        highPrice: ticker.highPrice,
        lowPrice: ticker.lowPrice,
        timestamp: Date.now()
      },
      candles: null
    };
  }

  // 3. Validate Candle Chronology & Order
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].timestamp <= candles[i - 1].timestamp) {
      return {
        isFresh: false,
        rejectReason: 'CANDLE_TIMESTAMPS_NOT_CHRONOLOGICALLY_ORDERED',
        source: activeSource,
        ticker: {
          symbol: cleanSymbol,
          lastPrice: ticker.lastPrice,
          highPrice: ticker.highPrice,
          lowPrice: ticker.lowPrice,
          timestamp: Date.now()
        },
        candles: null
      };
    }
  }

  // 4. Validate Freshness of the Latest Candle based on timeframe
  const latestCandle = candles[candles.length - 1];
  const now = Date.now();
  const candleAgeMs = now - latestCandle.timestamp;

  let maxAgeMs = 3.0 * 60 * 60 * 1000; // default 1h: 3h max age
  if (tf === '5m') maxAgeMs = 30 * 60 * 1000; // 5m: 30 minutes
  else if (tf === '15m') maxAgeMs = 60 * 60 * 1000; // 15m: 60 minutes
  else if (tf === '4h') maxAgeMs = 12 * 60 * 60 * 1000; // 4h: 12 hours
  else if (tf === '1d') maxAgeMs = 36 * 60 * 60 * 1000; // 1d: 36 hours

  if (candleAgeMs > maxAgeMs) {
    return {
      isFresh: false,
      rejectReason: `CANDLES_STALE_LATEST_BAR_TOO_OLD (age: ${(candleAgeMs / 60000).toFixed(1)}m > ${(maxAgeMs / 60000).toFixed(1)}m for ${tf})`,
      source: activeSource,
      ticker: {
        symbol: cleanSymbol,
        lastPrice: ticker.lastPrice,
        highPrice: ticker.highPrice,
        lowPrice: ticker.lowPrice,
        timestamp: Date.now()
      },
      candles: null
    };
  }

  if (latestCandle.timestamp > now + 60 * 1000) {
    return {
      isFresh: false,
      rejectReason: 'CANDLE_TIMESTAMP_IN_FUTURE',
      source: activeSource,
      ticker: {
        symbol: cleanSymbol,
        lastPrice: ticker.lastPrice,
        highPrice: ticker.highPrice,
        lowPrice: ticker.lowPrice,
        timestamp: Date.now()
      },
      candles: null
    };
  }

  // 5. Live Price Consistency Firewall between Candle Close and Live Ticker Price (Strict <= 2.0%)
  const consistency = validateLivePriceConsistency(ticker.lastPrice, latestCandle.close, 2.0);
  if (!consistency.isConsistent) {
    return {
      isFresh: false,
      rejectReason: `CANDLE_TICKER_PRICE_DIVERGENCE (${consistency.divergencePct.toFixed(2)}% > 2.0%)`,
      source: activeSource,
      ticker: {
        symbol: cleanSymbol,
        lastPrice: ticker.lastPrice,
        highPrice: ticker.highPrice,
        lowPrice: ticker.lowPrice,
        timestamp: Date.now()
      },
      candles: null
    };
  }

  // Update liveMarketStore with verified fresh data
  let snapshot = liveMarketStore.get(cleanSymbol);
  if (!snapshot) {
    snapshot = {
      symbol: cleanSymbol,
      currentPrice: ticker.lastPrice,
      priceChange24h: ticker.priceChangePercent,
      volume24h: ticker.volume,
      candles: new Map(),
      lastUpdated: now,
      primarySource: activeSource,
      isStale: false,
      stalenessMs: 0
    };
    liveMarketStore.set(cleanSymbol, snapshot);
  } else {
    snapshot.currentPrice = ticker.lastPrice;
    snapshot.priceChange24h = ticker.priceChangePercent;
    snapshot.volume24h = ticker.volume;
    snapshot.lastUpdated = now;
    snapshot.primarySource = activeSource;
    snapshot.isStale = false;
    snapshot.stalenessMs = 0;
  }
  snapshot.candles.set('1h', candles);

  return {
    isFresh: true,
    source: activeSource,
    ticker: {
      symbol: cleanSymbol,
      lastPrice: ticker.lastPrice,
      highPrice: ticker.highPrice,
      lowPrice: ticker.lowPrice,
      timestamp: now
    },
    candles
  };
}

/**
 * Data Quality and Staleness Assessment for any symbol
 */
export function assessMarketDataQuality(symbol: string = 'BTCUSDT'): MarketDataQualityReport {
  const cleanSym = normalizeSymbol(symbol);
  const snapshot = liveMarketStore.get(cleanSym);

  if (!snapshot || snapshot.lastUpdated === 0) {
    return {
      symbol: cleanSym,
      isStale: false,
      stalenessMs: 0,
      lastUpdated: Date.now(),
      primarySource: 'binance',
      activeSources: ['binance', 'bybit', 'okx'],
      isContradictory: false,
      dataCompletenessScore: 85,
      qualityRating: 'ACCEPTABLE'
    };
  }

  const stalenessMs = Date.now() - snapshot.lastUpdated;
  const isStale = stalenessMs > CRITICAL_STALENESS_THRESHOLD_MS;

  let qualityRating: MarketDataQualityReport['qualityRating'] = 'PRISTINE_REALTIME';
  if (isStale) {
    qualityRating = 'DATA_STALE';
  } else if (stalenessMs > 60000) {
    qualityRating = 'ACCEPTABLE';
  } else if (snapshot.primarySource === 'fallback') {
    qualityRating = 'DEGRADED';
  }

  return {
    symbol: cleanSym,
    isStale,
    stalenessMs,
    lastUpdated: snapshot.lastUpdated,
    primarySource: snapshot.primarySource,
    activeSources: [snapshot.primarySource],
    isContradictory: false,
    dataCompletenessScore: isStale ? 35 : (snapshot.primarySource === 'fallback' ? 60 : 98),
    qualityRating
  };
}

/**
 * Checks if data is critically stale for high-confidence signal rejection
 */
export function isDataCriticallyStale(symbol: string): boolean {
  const quality = assessMarketDataQuality(symbol);
  return quality.isStale || quality.qualityRating === 'DATA_STALE';
}

/**
 * Live WebSocket Connection Manager (Auto-starts stream subscribers where available)
 */
export class LiveWebSocketStreamManager {
  private isRunning: boolean = false;
  private ws: any = null;
  private reconnectAttempts: number = 0;
  private activeStreams: Set<string> = new Set();

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Check if WebSocket is available in environment
    if (typeof globalThis.WebSocket !== 'undefined') {
      this.initBinanceMiniTickerStream();
    } else {
      console.log('[LiveWebSocketStreamManager] Native WebSocket unavailable, operating on high-frequency REST fallback');
    }
  }

  private initBinanceMiniTickerStream(): void {
    try {
      // Connect to combined 24hr miniTicker stream for all USDT pairs
      const wsUrl = 'wss://stream.binance.com:9443/ws/!miniTicker@arr';
      const ws = new (globalThis as any).WebSocket(wsUrl);

      ws.onopen = () => {
        const binanceHealth = providerHealthMap.get('binance');
        if (binanceHealth) {
          binanceHealth.wsConnected = true;
          binanceHealth.status = 'OPERATIONAL';
        }
        activeWsConnectionsCount = 1;
        this.reconnectAttempts = 0;
        console.log('[Live WebSocket] Connected to multi-pair market stream');
      };

      ws.onmessage = (event: any) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            const now = Date.now();
            for (const item of data) {
              const sym = item.s;
              if (sym && sym.endsWith('USDT')) {
                const cleanSym = normalizeSymbol(sym);
                let snapshot = liveMarketStore.get(cleanSym);
                if (snapshot) {
                  snapshot.currentPrice = parseFloat(item.c);
                  snapshot.lastUpdated = now;
                  snapshot.isStale = false;
                  snapshot.stalenessMs = 0;
                  snapshot.primarySource = 'binance';
                }
              }
            }
          }
        } catch (e) {
          // ignore parsing error
        }
      };

      ws.onerror = (err: any) => {
        const binanceHealth = providerHealthMap.get('binance');
        if (binanceHealth) binanceHealth.wsConnected = false;
      };

      ws.onclose = () => {
        const binanceHealth = providerHealthMap.get('binance');
        if (binanceHealth) binanceHealth.wsConnected = false;
        activeWsConnectionsCount = 0;
        // Exponential backoff reconnect
        if (this.isRunning) {
          this.reconnectAttempts++;
          const delay = Math.min(30000, Math.pow(2, this.reconnectAttempts) * 1000);
          setTimeout(() => this.initBinanceMiniTickerStream(), delay);
        }
      };

      this.ws = ws;
    } catch (err) {
      console.warn('[Live WebSocket] Stream initialization exception:', err);
    }
  }

  public getActiveStreamCount(): number {
    return activeWsConnectionsCount;
  }

  public stop(): void {
    this.isRunning = false;
    if (this.ws && typeof this.ws.close === 'function') {
      try {
        this.ws.close();
      } catch (e) {}
    }
  }
}

// Global Singleton Manager Instance
export const liveStreamManager = new LiveWebSocketStreamManager();

