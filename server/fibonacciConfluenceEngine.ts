import { Candle } from './cryptoService';
import { FibonacciConfluenceReport } from '../src/types/crypto';

/**
 * Fibonacci Confluence Engine
 * Deterministically calculates Golden Pocket (0.618 - 0.65) retracement zones
 * and Fibonacci Extension targets (1.272, 1.618, 2.618) anchored on structural swing points.
 */
export function calculateFibonacciConfluence(candles: Candle[]): FibonacciConfluenceReport {
  if (!candles || candles.length < 15) {
    return {
      anchorHigh: 0,
      anchorLow: 0,
      trendDirection: 'UP',
      goldenPocket: { min: 0, max: 0, inZone: false },
      extension1272: 0,
      extension1618: 0,
      extension2618: 0,
      confluentTargets: [],
      status: 'NO_SWING_FOUND',
      summary: 'Insufficient candle history for swing anchor detection.'
    };
  }

  const currentPrice = candles[candles.length - 1].close;

  // 1. Find the most prominent recent swing high and swing low
  const lookback = Math.min(60, candles.length);
  const subset = candles.slice(-lookback);

  let maxHigh = subset[0].high;
  let maxHighIndex = 0;
  let minLow = subset[0].low;
  let minLowIndex = 0;

  for (let i = 0; i < subset.length; i++) {
    if (subset[i].high > maxHigh) {
      maxHigh = subset[i].high;
      maxHighIndex = i;
    }
    if (subset[i].low < minLow) {
      minLow = subset[i].low;
      minLowIndex = i;
    }
  }

  const priceRange = maxHigh - minLow;
  if (priceRange <= 0 || (priceRange / minLow) < 0.01) {
    return {
      anchorHigh: maxHigh,
      anchorLow: minLow,
      trendDirection: 'UP',
      goldenPocket: { min: minLow, max: maxHigh, inZone: false },
      extension1272: maxHigh,
      extension1618: maxHigh,
      extension2618: maxHigh,
      confluentTargets: [],
      status: 'NO_SWING_FOUND',
      summary: 'Swing range too tight for Fibonacci projection.'
    };
  }

  // Determine trend direction based on order of extreme swings
  // If minLow occurred before maxHigh, it's an UP impulse (bullish Fibonacci)
  // If maxHigh occurred before minLow, it's a DOWN impulse (bearish Fibonacci)
  const isUpImpulse = minLowIndex <= maxHighIndex;
  const trendDirection: 'UP' | 'DOWN' = isUpImpulse ? 'UP' : 'DOWN';

  let goldenPocketMin: number;
  let goldenPocketMax: number;
  let ext1272: number;
  let ext1618: number;
  let ext2618: number;
  const confluentTargets: { level: number; price: number; type: string }[] = [];

  if (isUpImpulse) {
    // Retracement from maxHigh down towards minLow
    // 0.618 retracement = maxHigh - (priceRange * 0.618)
    // 0.650 retracement = maxHigh - (priceRange * 0.650)
    goldenPocketMin = maxHigh - priceRange * 0.65;
    goldenPocketMax = maxHigh - priceRange * 0.618;

    // Upward Extensions from high
    ext1272 = maxHigh + priceRange * 0.272;
    ext1618 = maxHigh + priceRange * 0.618;
    ext2618 = maxHigh + priceRange * 1.618;

    confluentTargets.push(
      { level: 1.272, price: ext1272, type: 'FIB_EXT_1272' },
      { level: 1.618, price: ext1618, type: 'FIB_EXT_1618' },
      { level: 2.618, price: ext2618, type: 'FIB_EXT_2618' }
    );
  } else {
    // Retracement from minLow up towards maxHigh
    goldenPocketMin = minLow + priceRange * 0.618;
    goldenPocketMax = minLow + priceRange * 0.65;

    // Downward Extensions from low
    ext1272 = minLow - priceRange * 0.272;
    ext1618 = minLow - priceRange * 0.618;
    ext2618 = minLow - priceRange * 1.618;

    confluentTargets.push(
      { level: 1.272, price: ext1272, type: 'FIB_EXT_1272' },
      { level: 1.618, price: ext1618, type: 'FIB_EXT_1618' },
      { level: 2.618, price: ext2618, type: 'FIB_EXT_2618' }
    );
  }

  const inZone = currentPrice >= goldenPocketMin && currentPrice <= goldenPocketMax;

  const summary = `Fib ${trendDirection} Impulse: GP 0.618-0.65 [$${goldenPocketMin.toFixed(2)} - $${goldenPocketMax.toFixed(2)}] ${inZone ? '[PRICE IN GP ZONE]' : ''} | Ext 1.272: $${ext1272.toFixed(2)} | Ext 1.618: $${ext1618.toFixed(2)}`;

  return {
    anchorHigh: maxHigh,
    anchorLow: minLow,
    trendDirection,
    goldenPocket: {
      min: goldenPocketMin,
      max: goldenPocketMax,
      inZone
    },
    extension1272: ext1272,
    extension1618: ext1618,
    extension2618: ext2618,
    confluentTargets,
    status: 'VALID_SWING',
    summary
  };
}
