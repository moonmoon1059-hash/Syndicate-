/**
 * BTC Sentinel & Macro Firewall Engine
 * 
 * Provides:
 * 1. Live BTC health status:
 *    - Price, 24h change %, 15m/1h trend (BULLISH, BEARISH, RANGING)
 *    - Dump alert status (suppresses LONG signals when BTC flashes sharp dump > 1.5% in 15m)
 * 2. Altseason Index proxy (BTC dominance & Altcoin momentum ratio)
 * 3. Directional bias filter for signal generation
 */

import { get24hTicker, getKlines } from './cryptoService';

export interface BtcSentinelStatus {
  price: number;
  change24h: number;
  trend1h: 'BULLISH' | 'BEARISH' | 'RANGING';
  trend15m: 'BULLISH' | 'BEARISH' | 'RANGING';
  isFlashDump: boolean;
  dumpSeverityPct: number;
  altseasonIndex: number; // 0 - 100
  altseasonState: 'BITCOIN_SEASON' | 'BALANCED' | 'ALT_SEASON';
  directionalBias: 'FAVOR_LONGS' | 'FAVOR_SHORTS' | 'SELECTIVE';
  updatedAt: number;
}

let cachedStatus: BtcSentinelStatus = {
  price: 0,
  change24h: 0,
  trend1h: 'RANGING',
  trend15m: 'RANGING',
  isFlashDump: false,
  dumpSeverityPct: 0,
  altseasonIndex: 58,
  altseasonState: 'BALANCED',
  directionalBias: 'SELECTIVE',
  updatedAt: 0
};

let lastFetchTime = 0;
const CACHE_TTL_MS = 3_000; // 3 seconds real-time polling cache

/**
 * Fetches and analyzes current BTC regime and altcoin environment
 */
export async function getBtcSentinelStatus(): Promise<BtcSentinelStatus> {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_TTL_MS && cachedStatus.price > 0 && Math.abs(cachedStatus.change24h) > 0.0001) {
    return cachedStatus;
  }

  try {
    let price = 0;
    let change24h = 0;

    // 1. Direct 3-second REST polling targeting https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT
    try {
      const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT', {
        signal: AbortSignal.timeout(2500)
      });
      if (res.ok) {
        const item = await res.json();
        price = parseFloat(item.lastPrice);
        change24h = parseFloat(item.priceChangePercent);
      }
    } catch {
      // Fallback to spot ticker
      const ticker = await get24hTicker('BTCUSDT');
      if (ticker) {
        price = ticker.lastPrice;
        change24h = ticker.priceChangePercent;
      }
    }

    if (!price || price <= 0) {
      price = cachedStatus.price || 85450;
    }
    if (change24h === 0 && cachedStatus.change24h !== 0) {
      change24h = cachedStatus.change24h;
    }

    const klines15m = await getKlines('BTCUSDT', '15m', 24).catch(() => []);

    let isFlashDump = false;
    let dumpSeverityPct = 0;
    let trend15m: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
    let trend1h: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
    let currentClose = price;

    if (klines15m && klines15m.length >= 4) {
      const recent4 = klines15m.slice(-4);
      const high4 = Math.max(...recent4.map(k => k.high));
      currentClose = recent4[recent4.length - 1].close;
      const dropFromHigh = high4 > 0 ? ((high4 - currentClose) / high4) * 100 : 0;

      // Flash dump condition: sudden >= 1.5% drop in last 4 15m candles (1h)
      if (dropFromHigh >= 1.5) {
        isFlashDump = true;
        dumpSeverityPct = Number(dropFromHigh.toFixed(2));
      }

      const first15 = klines15m[klines15m.length - 2];
      const last15 = klines15m[klines15m.length - 1];
      if (last15.close > first15.open * 1.002) {
        trend15m = 'BULLISH';
      } else if (last15.close < first15.open * 0.998) {
        trend15m = 'BEARISH';
      }

      const open1h = klines15m[0].open;
      if (currentClose > open1h * 1.005) {
        trend1h = 'BULLISH';
      } else if (currentClose < open1h * 0.995) {
        trend1h = 'BEARISH';
      }
    }

    // Calculate EMA20 and RSI for 15m candles to assess bearish trend
    let isBelowEma20 = false;
    let rsi15m = 50;
    if (klines15m && klines15m.length >= 20) {
      const closes = klines15m.map(k => k.close);
      const k = 2 / (20 + 1);
      let ema = closes[0];
      for (let i = 1; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
      }
      isBelowEma20 = currentClose < ema;

      // 14-period RSI
      const diffs: number[] = [];
      for (let i = 1; i < closes.length; i++) {
        diffs.push(closes[i] - closes[i - 1]);
      }
      const gains = diffs.slice(-14).map(d => d > 0 ? d : 0);
      const losses = diffs.slice(-14).map(d => d < 0 ? Math.abs(d) : 0);
      const avgGain = gains.reduce((a, b) => a + b, 0) / 14;
      const avgLoss = losses.reduce((a, b) => a + b, 0) / 14;
      if (avgLoss === 0) rsi15m = 100;
      else {
        const rs = avgGain / avgLoss;
        rsi15m = 100 - (100 / (1 + rs));
      }
    }

    // Altseason Index proxy calculation (estimated from 24h market momentum)
    let altIndex = 55;
    if (change24h > 4) {
      altIndex = 42; // BTC absorbing liquidity
    } else if (change24h < -3) {
      altIndex = 35; // BTC dump dragging market
    } else if (trend1h === 'BULLISH' && change24h >= 0 && change24h <= 3) {
      altIndex = 68; // BTC stable upward, altcoins thrive
    } else if (trend1h === 'RANGING') {
      altIndex = 62;
    }

    let altseasonState: 'BITCOIN_SEASON' | 'BALANCED' | 'ALT_SEASON' = 'BALANCED';
    if (altIndex >= 65) altseasonState = 'ALT_SEASON';
    else if (altIndex <= 45) altseasonState = 'BITCOIN_SEASON';

    const isBtcDumpingOrBleeding = isFlashDump || (isBelowEma20 && rsi15m < 45) || (change24h <= -2.5 && trend15m === 'BEARISH');

    let directionalBias: 'FAVOR_LONGS' | 'FAVOR_SHORTS' | 'SELECTIVE' = 'SELECTIVE';
    if (isBtcDumpingOrBleeding || trend1h === 'BEARISH') {
      directionalBias = 'FAVOR_SHORTS';
    } else if (trend1h === 'BULLISH' && !isBtcDumpingOrBleeding) {
      directionalBias = 'FAVOR_LONGS';
    }

    cachedStatus = {
      price,
      change24h,
      trend1h,
      trend15m,
      isFlashDump: isFlashDump || isBtcDumpingOrBleeding,
      dumpSeverityPct: isFlashDump ? dumpSeverityPct : (change24h < 0 ? Math.abs(change24h) : 0),
      altseasonIndex: altIndex,
      altseasonState,
      directionalBias,
      updatedAt: now
    };
    lastFetchTime = now;
  } catch (err: any) {
    console.warn('[BtcSentinel] Update error:', err.message);
  }

  return cachedStatus;
}

/**
 * Firewall Check: Should LONG signals be suppressed due to BTC crash/dump?
 */
export async function isLongSignalBlockedByBtcFirewall(): Promise<{ blocked: boolean; reason?: string }> {
  const status = await getBtcSentinelStatus();
  if (status.isFlashDump || status.directionalBias === 'FAVOR_SHORTS') {
    return {
      blocked: true,
      reason: `BTC MACRO DUMP FIREWALL: BTC is Bearish/Dumping (15m below EMA20, RSI < 45 or drop -${status.dumpSeverityPct}%). Longs frozen; Pre-Collapse Shorts prioritized.`
    };
  }
  return { blocked: false };
}
