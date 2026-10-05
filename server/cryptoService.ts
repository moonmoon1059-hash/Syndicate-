import { CANONICAL_MARKET_REGISTRY } from './marketUniverseService';
import {
  getKlinesWithMultiExchangeFallback,
  getTickerWithMultiExchangeFallback,
  assessMarketDataQuality,
  isDataCriticallyStale
} from './liveDataProvider';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker24h {
  symbol: string;
  priceChange: number;
  priceChangePercent: number;
  lastPrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}

export const MONITORED_SYMBOLS = Object.keys(CANONICAL_MARKET_REGISTRY);

/**
 * Fetch OHLCV Klines with Multi-Exchange automatic fallback & resilience
 */
export async function getKlines(symbol: string, interval: string = '1h', limit: number = 100): Promise<Candle[]> {
  try {
    const res = await getKlinesWithMultiExchangeFallback(symbol, interval, limit);
    return res.candles;
  } catch (err) {
    return [];
  }
}

/**
 * Fetch 24hr ticker data with Multi-Exchange automatic fallback & resilience
 */
export async function get24hTicker(symbol: string): Promise<Ticker24h | null> {
  try {
    const res = await getTickerWithMultiExchangeFallback(symbol);
    return res.ticker;
  } catch (err) {
    return null;
  }
}

/**
 * Dynamically pulls all active USDT-M Perpetual pairs from Binance API (/fapi/v1/exchangeInfo)
 * and filters out pairs with 24h volume under 5,000,000 USDT to avoid illiquid tokens.
 */
let cachedFuturesUniverse: string[] = [];
let lastFuturesUniverseFetch = 0;
const FUTURES_UNIVERSE_CACHE_TTL_MS = 180000; // 3 minutes

export async function fetchActiveBinanceFuturesUniverse(minVolumeUsdt: number = 5_000_000): Promise<string[]> {
  const now = Date.now();
  if (cachedFuturesUniverse.length > 0 && now - lastFuturesUniverseFetch < FUTURES_UNIVERSE_CACHE_TTL_MS) {
    return cachedFuturesUniverse;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const [infoRes, tickerRes] = await Promise.all([
      fetch('https://fapi.binance.com/fapi/v1/exchangeInfo', { signal: controller.signal }),
      fetch('https://fapi.binance.com/fapi/v1/ticker/24hr', { signal: controller.signal })
    ]);
    clearTimeout(timeout);

    if (!infoRes.ok || !tickerRes.ok) {
      throw new Error(`Binance Futures API error: info=${infoRes.status}, ticker=${tickerRes.status}`);
    }

    const info: any = await infoRes.json();
    const tickers: any[] = await tickerRes.json();

    const activePerpSet = new Set<string>();
    if (info && Array.isArray(info.symbols)) {
      for (const s of info.symbols) {
        if (s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT') {
          activePerpSet.add(s.symbol);
        }
      }
    }

    const qualified: string[] = [];
    if (Array.isArray(tickers)) {
      for (const t of tickers) {
        if (activePerpSet.has(t.symbol)) {
          const qVol = parseFloat(t.quoteVolume);
          if (!isNaN(qVol) && qVol >= minVolumeUsdt) {
            qualified.push(t.symbol);
          }
        }
      }
    }

    if (qualified.length > 0) {
      cachedFuturesUniverse = qualified;
      lastFuturesUniverseFetch = now;
      return qualified;
    }
  } catch (err: any) {
    console.warn('[CryptoService] fetchActiveBinanceFuturesUniverse fallback:', err?.message);
  }

  if (cachedFuturesUniverse.length > 0) {
    return cachedFuturesUniverse;
  }
  return MONITORED_SYMBOLS;
}

export { assessMarketDataQuality, isDataCriticallyStale };
