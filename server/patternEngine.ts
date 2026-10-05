import { Candle } from './cryptoService';
import { calculateEMA, calculateATR, calculateRVOL } from './technicalAnalysis';

export type PatternCategory =
  | 'REVERSAL'
  | 'TRIANGLES'
  | 'WEDGES'
  | 'CONTINUATION'
  | 'CHANNELS'
  | 'ADVANCED'
  | 'MOMENTUM';

export type PatternBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export type BreakoutStatus = 'NONE' | 'TESTING' | 'BROKEN_OUT' | 'CONFIRMED' | 'FAILED';

export type RetestStatus = 'UNKNOWN' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'NONE';

export interface SwingPoint {
  index: number;
  price: number;
  type: 'HIGH' | 'LOW';
  timestamp: number;
}

export interface PatternKeyLevels {
  neckline?: number;
  support?: number;
  resistance?: number;
  upperBoundary?: number;
  lowerBoundary?: number;
  breakoutLevel?: number;
  invalidationLevel?: number;
  measuredTarget?: number;
  targets?: number[]; // Dynamic TP compatibility (Step 17)
}

export interface PatternDetectionResult {
  detected: boolean;
  name: string;
  category: PatternCategory;
  type: PatternBias;
  confidence: number; // 0 - 100 quality score
  breakoutPrice?: number;
  breakoutTimestamp?: number;
  breakoutStatus: BreakoutStatus;
  retestStatus: RetestStatus;
  volumeConfirmation: boolean;
  volumeRatio?: number;
  invalidationPrice?: number;
  keyLevels: PatternKeyLevels;
  description: string;
  evidence: string[];
  swings?: SwingPoint[];
}

/**
 * Linear Regression helper for trendline & boundary geometry fitting
 */
export function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y || 0, r2: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
    sumYY += p.y * p.y;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Compute R-squared
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;

  for (const p of points) {
    const predictedY = slope * p.x + intercept;
    ssTot += Math.pow(p.y - meanY, 2);
    ssRes += Math.pow(p.y - predictedY, 2);
  }

  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
}

/**
 * Step 7: Swing & Pivot Foundation Engine
 * Identifies local fractal swing highs and lows with configurable left and right bar strength
 */
export function findSwingPoints(candles: Candle[], leftStrength: number = 3, rightStrength: number = 2): SwingPoint[] {
  const swings: SwingPoint[] = [];
  const len = candles.length;

  for (let i = leftStrength; i < len - rightStrength; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;

    // Check Swing High
    let isHigh = true;
    for (let l = 1; l <= leftStrength; l++) {
      if (candles[i - l].high >= currentHigh) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) {
      for (let r = 1; r <= rightStrength; r++) {
        if (candles[i + r].high > currentHigh) {
          isHigh = false;
          break;
        }
      }
    }

    if (isHigh) {
      swings.push({
        index: i,
        price: currentHigh,
        type: 'HIGH',
        timestamp: candles[i].timestamp,
      });
    }

    // Check Swing Low
    let isLow = true;
    for (let l = 1; l <= leftStrength; l++) {
      if (candles[i - l].low <= currentLow) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      for (let r = 1; r <= rightStrength; r++) {
        if (candles[i + r].low < currentLow) {
          isLow = false;
          break;
        }
      }
    }

    if (isLow) {
      swings.push({
        index: i,
        price: currentLow,
        type: 'LOW',
        timestamp: candles[i].timestamp,
      });
    }
  }

  return swings;
}

/**
 * Step 9, 10, 11: Breakout, Retest & Volume Validator
 */
export function evaluateBreakoutAndRetest(
  candles: Candle[],
  breakoutLevel: number,
  bias: PatternBias,
  invalidationLevel: number,
  atr: number
): {
  breakoutStatus: BreakoutStatus;
  retestStatus: RetestStatus;
  breakoutIndex: number;
  volumeConfirmation: boolean;
  volumeRatio: number;
  evidence: string[];
} {
  const len = candles.length;
  const latest = candles[len - 1];
  const volumes = candles.map((c) => c.volume);
  const avgVol = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 19 || 1;
  const evidence: string[] = [];

  let breakoutIndex = -1;
  let breakoutStatus: BreakoutStatus = 'NONE';
  let retestStatus: RetestStatus = 'NONE';

  const minBreakoutDist = Math.max(atr * 0.25, breakoutLevel * 0.002);
  const isBullish = bias === 'BULLISH';

  // Search recent candles for breakout occurrence
  for (let i = Math.max(0, len - 15); i < len; i++) {
    const c = candles[i];
    if (isBullish && c.close > breakoutLevel + minBreakoutDist) {
      breakoutIndex = i;
      break;
    } else if (!isBullish && c.close < breakoutLevel - minBreakoutDist) {
      breakoutIndex = i;
      break;
    }
  }

  if (breakoutIndex === -1) {
    // Check if current candle is testing or hovering at breakout level
    const distToLevel = Math.abs(latest.close - breakoutLevel);
    if (distToLevel <= atr * 0.6) {
      breakoutStatus = 'TESTING';
      evidence.push(`Price testing key breakout level at ${breakoutLevel.toFixed(2)}`);
    } else {
      breakoutStatus = 'NONE';
    }
    return {
      breakoutStatus,
      retestStatus: 'NONE',
      breakoutIndex: -1,
      volumeConfirmation: false,
      volumeRatio: 1.0,
      evidence,
    };
  }

  // Breakout occurred
  const breakoutCandle = candles[breakoutIndex];
  const breakoutVolRatio = Number((breakoutCandle.volume / avgVol).toFixed(2));
  const volumeConfirmation = breakoutVolRatio >= 1.25;

  if (volumeConfirmation) {
    evidence.push(`Breakout confirmed with ${breakoutVolRatio}x above-average volume`);
  }

  breakoutStatus = 'BROKEN_OUT';

  // Evaluate Retest after breakoutIndex
  const candlesSinceBreakout = len - 1 - breakoutIndex;
  if (candlesSinceBreakout === 0) {
    // Breakout is happening on the live/latest candle
    breakoutStatus = volumeConfirmation ? 'CONFIRMED' : 'BROKEN_OUT';
    retestStatus = 'NONE';
    evidence.push(`Fresh breakout candle closed beyond ${breakoutLevel.toFixed(2)}`);
  } else if (candlesSinceBreakout > 0) {
    // Check subsequent candles for retest of the broken level
    let touchedLevel = false;
    let failedInvalidation = false;

    for (let k = breakoutIndex + 1; k < len; k++) {
      const subCandle = candles[k];
      if (isBullish) {
        // Retest: low approaches breakout level from above
        if (subCandle.low <= breakoutLevel + atr * 0.6 && subCandle.close >= invalidationLevel) {
          touchedLevel = true;
        }
        if (subCandle.close < invalidationLevel) {
          failedInvalidation = true;
        }
      } else {
        // Retest: high approaches breakout level from below
        if (subCandle.high >= breakoutLevel - atr * 0.6 && subCandle.close <= invalidationLevel) {
          touchedLevel = true;
        }
        if (subCandle.close > invalidationLevel) {
          failedInvalidation = true;
        }
      }
    }

    if (failedInvalidation) {
      breakoutStatus = 'FAILED';
      retestStatus = 'FAILED';
      evidence.push(`Retest failed: candle closed beyond invalidation level ${invalidationLevel.toFixed(2)}`);
    } else if (touchedLevel) {
      // If latest candle rejected the level and closed favorably
      const isRejectionConfirmed = isBullish
        ? latest.close > breakoutLevel && latest.close > latest.open
        : latest.close < breakoutLevel && latest.close < latest.open;

      if (isRejectionConfirmed) {
        breakoutStatus = 'CONFIRMED';
        retestStatus = 'CONFIRMED';
        evidence.push(`Successful structural retest of broken level at ${breakoutLevel.toFixed(2)}`);
      } else {
        retestStatus = 'PENDING';
        evidence.push(`Price currently retesting breakout level at ${breakoutLevel.toFixed(2)}`);
      }
    } else {
      retestStatus = 'UNKNOWN';
    }
  }

  return {
    breakoutStatus,
    retestStatus,
    breakoutIndex,
    volumeConfirmation,
    volumeRatio: breakoutVolRatio,
    evidence,
  };
}

/**
 * Generates dynamic multi-tier targets for pattern-derived measured moves (Step 17)
 */
export function generatePatternDynamicTargets(
  entry: number,
  measuredMoveDist: number,
  bias: PatternBias
): { measuredTarget: number; targets: number[] } {
  const isBullish = bias === 'BULLISH';
  const primaryTarget = isBullish ? entry + measuredMoveDist : entry - measuredMoveDist;
  
  // Extension tiers supporting flexible targets (TP1..TP4+)
  const targets = isBullish
    ? [
        Number((entry + measuredMoveDist * 0.618).toFixed(4)),
        Number((entry + measuredMoveDist * 1.0).toFixed(4)),
        Number((entry + measuredMoveDist * 1.618).toFixed(4)),
        Number((entry + measuredMoveDist * 2.618).toFixed(4)),
      ]
    : [
        Number((entry - measuredMoveDist * 0.618).toFixed(4)),
        Number((entry - measuredMoveDist * 1.0).toFixed(4)),
        Number((entry - measuredMoveDist * 1.618).toFixed(4)),
        Number((entry - measuredMoveDist * 2.618).toFixed(4)),
      ];

  return {
    measuredTarget: Number(primaryTarget.toFixed(4)),
    targets,
  };
}

/* =========================================================================================
 * GROUP A — REVERSAL PATTERNS
 * ========================================================================================= */

/**
 * 1. Double Bottom (W Formation)
 */
export function detectDoubleBottom(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const lows = swings.filter((s) => s.type === 'LOW').slice(-4);
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-4);
  if (lows.length < 2) return null;

  const L1 = lows[lows.length - 2];
  const L2 = lows[lows.length - 1];

  // Geometric validation: separation & price similarity
  const barSeparation = L2.index - L1.index;
  if (barSeparation < 4 || barSeparation > 35) return null;

  const priceDiff = Math.abs(L1.price - L2.price);
  if (priceDiff > atr * 1.3) return null;

  // Intervening peak (neckline)
  const middleHighs = highs.filter((h) => h.index > L1.index && h.index < L2.index);
  if (middleHighs.length === 0) return null;
  const peak = middleHighs.reduce((max, h) => (h.price > max.price ? h : max), middleHighs[0]);

  const neckline = peak.price;
  const patternDepth = neckline - Math.min(L1.price, L2.price);
  if (patternDepth < atr * 1.2) return null;

  const latest = candles[candles.length - 1];
  const invalidation = Math.min(L1.price, L2.price) - atr * 0.5;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    neckline,
    'BULLISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, patternDepth, 'BULLISH');

  let confidence = 75;
  if (priceDiff <= atr * 0.5) confidence += 8;
  if (volumeConfirmation) confidence += 8;
  if (retestStatus === 'CONFIRMED') confidence += 7;

  return {
    detected: true,
    name: 'DOUBLE_BOTTOM',
    category: 'REVERSAL',
    type: 'BULLISH',
    confidence: Math.min(95, confidence),
    breakoutPrice: neckline,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      neckline,
      support: Math.min(L1.price, L2.price),
      resistance: neckline,
      breakoutLevel: neckline,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Confirmed Double Bottom (W-formation) support test near ${Math.min(L1.price, L2.price).toFixed(2)} with neckline at ${neckline.toFixed(2)}`,
    evidence: [
      `Twin swing lows separated by ${barSeparation} candles`,
      `Intervening peak established neckline at ${neckline.toFixed(2)}`,
      ...evidence,
    ],
    swings: [L1, peak, L2],
  };
}

/**
 * 2. Double Top (M Formation)
 */
export function detectDoubleTop(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-4);
  const lows = swings.filter((s) => s.type === 'LOW').slice(-4);
  if (highs.length < 2) return null;

  const H1 = highs[highs.length - 2];
  const H2 = highs[highs.length - 1];

  const barSeparation = H2.index - H1.index;
  if (barSeparation < 4 || barSeparation > 35) return null;

  const priceDiff = Math.abs(H1.price - H2.price);
  if (priceDiff > atr * 1.3) return null;

  // Intervening valley (neckline)
  const middleLows = lows.filter((l) => l.index > H1.index && l.index < H2.index);
  if (middleLows.length === 0) return null;
  const valley = middleLows.reduce((min, l) => (l.price < min.price ? l : min), middleLows[0]);

  const neckline = valley.price;
  const patternHeight = Math.max(H1.price, H2.price) - neckline;
  if (patternHeight < atr * 1.2) return null;

  const latest = candles[candles.length - 1];
  const invalidation = Math.max(H1.price, H2.price) + atr * 0.5;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    neckline,
    'BEARISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, patternHeight, 'BEARISH');

  let confidence = 75;
  if (priceDiff <= atr * 0.5) confidence += 8;
  if (volumeConfirmation) confidence += 8;
  if (retestStatus === 'CONFIRMED') confidence += 7;

  return {
    detected: true,
    name: 'DOUBLE_TOP',
    category: 'REVERSAL',
    type: 'BEARISH',
    confidence: Math.min(95, confidence),
    breakoutPrice: neckline,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      neckline,
      support: neckline,
      resistance: Math.max(H1.price, H2.price),
      breakoutLevel: neckline,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Confirmed Double Top (M-formation) resistance rejection near ${Math.max(H1.price, H2.price).toFixed(2)} with neckline at ${neckline.toFixed(2)}`,
    evidence: [
      `Twin swing highs separated by ${barSeparation} candles`,
      `Intervening trough established neckline at ${neckline.toFixed(2)}`,
      ...evidence,
    ],
    swings: [H1, valley, H2],
  };
}

/**
 * 3. Triple Top
 */
export function detectTripleTop(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-5);
  const lows = swings.filter((s) => s.type === 'LOW').slice(-5);
  if (highs.length < 3) return null;

  const H1 = highs[highs.length - 3];
  const H2 = highs[highs.length - 2];
  const H3 = highs[highs.length - 1];

  const maxDiff = Math.max(Math.abs(H1.price - H2.price), Math.abs(H2.price - H3.price), Math.abs(H1.price - H3.price));
  if (maxDiff > atr * 1.5) return null;

  const valleys = lows.filter((l) => l.index > H1.index && l.index < H3.index);
  if (valleys.length < 2) return null;

  const neckline = Math.min(...valleys.map((v) => v.price));
  const patternHeight = Math.max(H1.price, H2.price, H3.price) - neckline;
  if (patternHeight < atr * 1.5) return null;

  const latest = candles[candles.length - 1];
  const invalidation = Math.max(H1.price, H2.price, H3.price) + atr * 0.5;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    neckline,
    'BEARISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, patternHeight, 'BEARISH');

  return {
    detected: true,
    name: 'TRIPLE_TOP',
    category: 'REVERSAL',
    type: 'BEARISH',
    confidence: 84,
    breakoutPrice: neckline,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      neckline,
      support: neckline,
      resistance: Math.max(H1.price, H2.price, H3.price),
      breakoutLevel: neckline,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Triple Top distribution barrier with 3 peak rejections near ${H2.price.toFixed(2)}`,
    evidence: [`Three validated peaks at ${H1.price.toFixed(2)}, ${H2.price.toFixed(2)}, ${H3.price.toFixed(2)}`, ...evidence],
    swings: [H1, H2, H3],
  };
}

/**
 * 4. Triple Bottom
 */
export function detectTripleBottom(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const lows = swings.filter((s) => s.type === 'LOW').slice(-5);
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-5);
  if (lows.length < 3) return null;

  const L1 = lows[lows.length - 3];
  const L2 = lows[lows.length - 2];
  const L3 = lows[lows.length - 1];

  const maxDiff = Math.max(Math.abs(L1.price - L2.price), Math.abs(L2.price - L3.price), Math.abs(L1.price - L3.price));
  if (maxDiff > atr * 1.5) return null;

  const peaks = highs.filter((h) => h.index >= L1.index && h.index <= L3.index);
  if (peaks.length < 1) return null;

  const neckline = Math.max(...peaks.map((p) => p.price));
  const patternDepth = neckline - Math.min(L1.price, L2.price, L3.price);
  if (patternDepth < atr * 1.2) return null;

  const latest = candles[candles.length - 1];
  const invalidation = Math.min(L1.price, L2.price, L3.price) - atr * 0.5;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    neckline,
    'BULLISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, patternDepth, 'BULLISH');

  return {
    detected: true,
    name: 'TRIPLE_BOTTOM',
    category: 'REVERSAL',
    type: 'BULLISH',
    confidence: 84,
    breakoutPrice: neckline,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      neckline,
      support: Math.min(L1.price, L2.price, L3.price),
      resistance: neckline,
      breakoutLevel: neckline,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Triple Bottom accumulation floor with 3 trough rejections near ${L2.price.toFixed(2)}`,
    evidence: [`Three validated troughs at ${L1.price.toFixed(2)}, ${L2.price.toFixed(2)}, ${L3.price.toFixed(2)}`, ...evidence],
    swings: [L1, L2, L3],
  };
}

/**
 * 5. Head & Shoulders
 */
export function detectHeadAndShoulders(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-5);
  const lows = swings.filter((s) => s.type === 'LOW').slice(-5);
  if (highs.length < 3) return null;

  const LS = highs[highs.length - 3]; // Left Shoulder
  const Head = highs[highs.length - 2]; // Head
  const RS = highs[highs.length - 1]; // Right Shoulder

  // Head must be significantly higher than both shoulders
  if (Head.price <= LS.price + atr * 0.8 || Head.price <= RS.price + atr * 0.8) return null;

  // Shoulders should have reasonable symmetry
  const shoulderDiff = Math.abs(LS.price - RS.price);
  if (shoulderDiff > atr * 1.5) return null;

  // Troughs between shoulders and head
  const T1List = lows.filter((l) => l.index > LS.index && l.index < Head.index);
  const T2List = lows.filter((l) => l.index > Head.index && l.index < RS.index);
  if (T1List.length === 0 || T2List.length === 0) return null;

  const T1 = T1List[0];
  const T2 = T2List[0];
  const neckline = (T1.price + T2.price) / 2;

  const patternHeight = Head.price - neckline;
  if (patternHeight < atr * 1.5) return null;

  const latest = candles[candles.length - 1];
  const invalidation = RS.price + atr * 0.5;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    neckline,
    'BEARISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, patternHeight, 'BEARISH');

  let confidence = 80;
  if (shoulderDiff <= atr * 0.6) confidence += 8;
  if (volumeConfirmation) confidence += 6;
  if (retestStatus === 'CONFIRMED') confidence += 6;

  return {
    detected: true,
    name: 'HEAD_AND_SHOULDERS',
    category: 'REVERSAL',
    type: 'BEARISH',
    confidence: Math.min(96, confidence),
    breakoutPrice: neckline,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      neckline,
      support: neckline,
      resistance: Head.price,
      breakoutLevel: neckline,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Major Head & Shoulders topping reversal pattern. Head at ${Head.price.toFixed(2)}, Neckline at ${neckline.toFixed(2)}`,
    evidence: [
      `Left Shoulder at ${LS.price.toFixed(2)}, Head at ${Head.price.toFixed(2)}, Right Shoulder at ${RS.price.toFixed(2)}`,
      `Neckline anchored at ${neckline.toFixed(2)}`,
      ...evidence,
    ],
    swings: [LS, T1, Head, T2, RS],
  };
}

/**
 * 6. Inverse Head & Shoulders
 */
export function detectInverseHeadAndShoulders(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const lows = swings.filter((s) => s.type === 'LOW').slice(-5);
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-5);
  if (lows.length < 3) return null;

  const LS = lows[lows.length - 3];
  const Head = lows[lows.length - 2];
  const RS = lows[lows.length - 1];

  // Head must be significantly lower than both shoulders
  if (Head.price >= LS.price - atr * 0.8 || Head.price >= RS.price - atr * 0.8) return null;

  // Shoulders symmetry
  const shoulderDiff = Math.abs(LS.price - RS.price);
  if (shoulderDiff > atr * 1.5) return null;

  // Crests between shoulders and head
  const C1List = highs.filter((h) => h.index > LS.index && h.index < Head.index);
  const C2List = highs.filter((h) => h.index > Head.index && h.index < RS.index);
  if (C1List.length === 0 || C2List.length === 0) return null;

  const C1 = C1List[0];
  const C2 = C2List[0];
  const neckline = (C1.price + C2.price) / 2;

  const patternDepth = neckline - Head.price;
  if (patternDepth < atr * 1.5) return null;

  const latest = candles[candles.length - 1];
  const invalidation = RS.price - atr * 0.5;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    neckline,
    'BULLISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, patternDepth, 'BULLISH');

  let confidence = 80;
  if (shoulderDiff <= atr * 0.6) confidence += 8;
  if (volumeConfirmation) confidence += 6;
  if (retestStatus === 'CONFIRMED') confidence += 6;

  return {
    detected: true,
    name: 'INVERSE_HEAD_AND_SHOULDERS',
    category: 'REVERSAL',
    type: 'BULLISH',
    confidence: Math.min(96, confidence),
    breakoutPrice: neckline,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      neckline,
      support: Head.price,
      resistance: neckline,
      breakoutLevel: neckline,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Bullish Inverse Head & Shoulders bottom formation. Head at ${Head.price.toFixed(2)}, Neckline at ${neckline.toFixed(2)}`,
    evidence: [
      `Left Shoulder at ${LS.price.toFixed(2)}, Head at ${Head.price.toFixed(2)}, Right Shoulder at ${RS.price.toFixed(2)}`,
      `Neckline breakout level at ${neckline.toFixed(2)}`,
      ...evidence,
    ],
    swings: [LS, C1, Head, C2, RS],
  };
}

/**
 * 7. Rounding Bottom / Saucer
 */
export function detectRoundingBottom(candles: Candle[], atr: number): PatternDetectionResult | null {
  if (candles.length < 35) return null;
  const slice = candles.slice(-35);
  const closes = slice.map((c) => c.close);

  const leftRim = closes.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
  const bottom = Math.min(...closes.slice(10, 25));
  const rightRim = closes.slice(-7).reduce((a, b) => a + b, 0) / 7;

  const rimDiff = Math.abs(leftRim - rightRim);
  const depth = ((leftRim + rightRim) / 2) - bottom;

  if (rimDiff > atr * 1.5 || depth < atr * 2.0) return null;

  // Arc curvature check: middle values must smoothly sit lower than rims
  const middleMean = closes.slice(12, 22).reduce((a, b) => a + b, 0) / 10;
  if (middleMean > bottom + depth * 0.5) return null;

  const neckline = Math.max(leftRim, rightRim);
  const latest = candles[candles.length - 1];
  const invalidation = bottom + depth * 0.3;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    neckline,
    'BULLISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, depth, 'BULLISH');

  return {
    detected: true,
    name: 'ROUNDING_BOTTOM',
    category: 'REVERSAL',
    type: 'BULLISH',
    confidence: 82,
    breakoutPrice: neckline,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      neckline,
      support: bottom,
      resistance: neckline,
      breakoutLevel: neckline,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Rounding Bottom (Saucer) structural accumulation with resistance rim at ${neckline.toFixed(2)}`,
    evidence: [`Smooth U-shaped accumulation over 35 candles`, `Rim resistance level established at ${neckline.toFixed(2)}`, ...evidence],
  };
}

/**
 * 8. Rounding Top
 */
export function detectRoundingTop(candles: Candle[], atr: number): PatternDetectionResult | null {
  if (candles.length < 35) return null;
  const slice = candles.slice(-35);
  const closes = slice.map((c) => c.close);

  const leftBase = closes.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
  const top = Math.max(...closes.slice(10, 25));
  const rightBase = closes.slice(-7).reduce((a, b) => a + b, 0) / 7;

  const baseDiff = Math.abs(leftBase - rightBase);
  const height = top - ((leftBase + rightBase) / 2);

  if (baseDiff > atr * 1.5 || height < atr * 2.0) return null;

  const middleMean = closes.slice(12, 22).reduce((a, b) => a + b, 0) / 10;
  if (middleMean < top - height * 0.5) return null;

  const neckline = Math.min(leftBase, rightBase);
  const latest = candles[candles.length - 1];
  const invalidation = top - height * 0.3;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    neckline,
    'BEARISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, height, 'BEARISH');

  return {
    detected: true,
    name: 'ROUNDING_TOP',
    category: 'REVERSAL',
    type: 'BEARISH',
    confidence: 82,
    breakoutPrice: neckline,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      neckline,
      support: neckline,
      resistance: top,
      breakoutLevel: neckline,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Rounding Top inverted saucer distribution with baseline support breakdown at ${neckline.toFixed(2)}`,
    evidence: [`Smooth inverted arc over 35 candles`, `Baseline support established at ${neckline.toFixed(2)}`, ...evidence],
  };
}

/* =========================================================================================
 * GROUP B — TRIANGLES
 * ========================================================================================= */

/**
 * 9. Ascending Triangle
 */
export function detectAscendingTriangle(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-4);
  const lows = swings.filter((s) => s.type === 'LOW').slice(-4);
  if (highs.length < 2 || lows.length < 2) return null;

  // Highs must be nearly flat (horizontal resistance)
  const highPoints = highs.map((h) => ({ x: h.index, y: h.price }));
  const highReg = linearRegression(highPoints);
  const highDiff = Math.abs(highs[0].price - highs[highs.length - 1].price);
  if (highDiff > atr * 1.1) return null;

  // Lows must be rising (positive slope)
  const lowPoints = lows.map((l) => ({ x: l.index, y: l.price }));
  const lowReg = linearRegression(lowPoints);
  if (lowReg.slope <= 0.0001 || lowReg.r2 < 0.6) return null;

  const resistance = (highs[0].price + highs[highs.length - 1].price) / 2;
  const initialLow = lows[0].price;
  const triangleHeight = resistance - initialLow;
  if (triangleHeight < atr * 1.5) return null;

  const latest = candles[candles.length - 1];
  const invalidation = lows[lows.length - 1].price - atr * 0.4;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    resistance,
    'BULLISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, triangleHeight, 'BULLISH');

  return {
    detected: true,
    name: 'ASCENDING_TRIANGLE',
    category: 'TRIANGLES',
    type: 'BULLISH',
    confidence: 85,
    breakoutPrice: resistance,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      resistance,
      support: lows[lows.length - 1].price,
      breakoutLevel: resistance,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Ascending Triangle with horizontal roof at ${resistance.toFixed(2)} and ascending higher lows`,
    evidence: [
      `Horizontal resistance tested ${highs.length} times`,
      `Ascending support trendline (Slope: +${lowReg.slope.toFixed(4)}, R²: ${lowReg.r2.toFixed(2)})`,
      ...evidence,
    ],
    swings: [...highs, ...lows],
  };
}

/**
 * 10. Descending Triangle
 */
export function detectDescendingTriangle(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-4);
  const lows = swings.filter((s) => s.type === 'LOW').slice(-4);
  if (highs.length < 2 || lows.length < 2) return null;

  // Lows must be nearly flat (horizontal support)
  const lowPoints = lows.map((l) => ({ x: l.index, y: l.price }));
  const lowDiff = Math.abs(lows[0].price - lows[lows.length - 1].price);
  if (lowDiff > atr * 1.1) return null;

  // Highs must be falling (negative slope)
  const highPoints = highs.map((h) => ({ x: h.index, y: h.price }));
  const highReg = linearRegression(highPoints);
  if (highReg.slope >= -0.0001 || highReg.r2 < 0.6) return null;

  const support = (lows[0].price + lows[lows.length - 1].price) / 2;
  const initialHigh = highs[0].price;
  const triangleHeight = initialHigh - support;
  if (triangleHeight < atr * 1.5) return null;

  const latest = candles[candles.length - 1];
  const invalidation = highs[highs.length - 1].price + atr * 0.4;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    support,
    'BEARISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, triangleHeight, 'BEARISH');

  return {
    detected: true,
    name: 'DESCENDING_TRIANGLE',
    category: 'TRIANGLES',
    type: 'BEARISH',
    confidence: 85,
    breakoutPrice: support,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      support,
      resistance: highs[highs.length - 1].price,
      breakoutLevel: support,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Descending Triangle with horizontal floor at ${support.toFixed(2)} and descending lower highs`,
    evidence: [
      `Horizontal support tested ${lows.length} times`,
      `Descending resistance trendline (Slope: ${highReg.slope.toFixed(4)}, R²: ${highReg.r2.toFixed(2)})`,
      ...evidence,
    ],
    swings: [...highs, ...lows],
  };
}

/**
 * 11. Symmetrical Triangle
 */
export function detectSymmetricalTriangle(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-4);
  const lows = swings.filter((s) => s.type === 'LOW').slice(-4);
  if (highs.length < 2 || lows.length < 2) return null;

  const highPoints = highs.map((h) => ({ x: h.index, y: h.price }));
  const lowPoints = lows.map((l) => ({ x: l.index, y: l.price }));

  const highReg = linearRegression(highPoints);
  const lowReg = linearRegression(lowPoints);

  // Upper boundary falling, lower boundary rising
  if (highReg.slope >= 0 || lowReg.slope <= 0) return null;
  if (highReg.r2 < 0.5 || lowReg.r2 < 0.5) return null;

  const latest = candles[candles.length - 1];
  const upperProj = highReg.slope * (candles.length - 1) + highReg.intercept;
  const lowerProj = lowReg.slope * (candles.length - 1) + lowReg.intercept;

  const triangleRange = highs[0].price - lows[0].price;
  if (triangleRange < atr * 1.5) return null;

  // Determine direction based on breakout or price position relative to apex midpoint
  const midPoint = (upperProj + lowerProj) / 2;
  const isBullish = latest.close >= midPoint;
  const bias: PatternBias = isBullish ? 'BULLISH' : 'BEARISH';
  const breakoutLevel = isBullish ? upperProj : lowerProj;
  const invalidation = isBullish ? lowerProj - atr * 0.4 : upperProj + atr * 0.4;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    breakoutLevel,
    bias,
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, triangleRange, bias);

  return {
    detected: true,
    name: 'SYMMETRICAL_TRIANGLE',
    category: 'TRIANGLES',
    type: bias,
    confidence: 80,
    breakoutPrice: breakoutLevel,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      upperBoundary: upperProj,
      lowerBoundary: lowerProj,
      breakoutLevel,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Symmetrical Triangle coiling apex compression with ${bias} directional resolution`,
    evidence: [
      `Converging resistance (Slope: ${highReg.slope.toFixed(4)}) and support (Slope: +${lowReg.slope.toFixed(4)})`,
      `Range compression from ${triangleRange.toFixed(2)} down to ${(upperProj - lowerProj).toFixed(2)}`,
      ...evidence,
    ],
    swings: [...highs, ...lows],
  };
}

/* =========================================================================================
 * GROUP C — WEDGES
 * ========================================================================================= */

/**
 * 12. Rising Wedge (Bearish Reversal / Continuation)
 */
export function detectRisingWedge(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-4);
  const lows = swings.filter((s) => s.type === 'LOW').slice(-4);
  if (highs.length < 2 || lows.length < 2) return null;

  const highPoints = highs.map((h) => ({ x: h.index, y: h.price }));
  const lowPoints = lows.map((l) => ({ x: l.index, y: l.price }));

  const highReg = linearRegression(highPoints);
  const lowReg = linearRegression(lowPoints);

  // Both boundaries must be ascending
  if (highReg.slope <= 0 || lowReg.slope <= 0) return null;

  // Wedge height from first pair of swings
  const wedgeHeight = Math.abs(highs[0].price - lows[0].price);
  if (wedgeHeight < atr * 1.0) return null;

  const latest = candles[candles.length - 1];
  const lowerProj = lowReg.slope * (candles.length - 1) + lowReg.intercept;
  const invalidation = Math.max(...highs.map((h) => h.price)) + atr * 0.4;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    lowerProj,
    'BEARISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, wedgeHeight, 'BEARISH');

  return {
    detected: true,
    name: 'RISING_WEDGE',
    category: 'WEDGES',
    type: 'BEARISH',
    confidence: 83,
    breakoutPrice: lowerProj,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      lowerBoundary: lowerProj,
      breakoutLevel: lowerProj,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Rising Wedge exhaustion pattern with converging ascending boundaries`,
    evidence: [
      `Ascending resistance (Slope: +${highReg.slope.toFixed(4)}) and ascending support (Slope: +${lowReg.slope.toFixed(4)})`,
      `Impending bearish breakdown below lower trendline`,
      ...evidence,
    ],
    swings: [...highs, ...lows],
  };
}

/**
 * 13. Falling Wedge (Bullish Reversal / Continuation)
 */
export function detectFallingWedge(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-4);
  const lows = swings.filter((s) => s.type === 'LOW').slice(-4);
  if (highs.length < 2 || lows.length < 2) return null;

  const highPoints = highs.map((h) => ({ x: h.index, y: h.price }));
  const lowPoints = lows.map((l) => ({ x: l.index, y: l.price }));

  const highReg = linearRegression(highPoints);
  const lowReg = linearRegression(lowPoints);

  // Both boundaries must be descending
  if (highReg.slope >= -0.0001 || lowReg.slope >= -0.0001) return null;

  // Upper line should be steeper downwards than lower line (converging downwards)
  if (Math.abs(highReg.slope) <= Math.abs(lowReg.slope) * 0.9) return null;

  const latest = candles[candles.length - 1];
  const upperProj = highReg.slope * (candles.length - 1) + highReg.intercept;
  const wedgeHeight = highs[0].price - lows[0].price;
  const invalidation = Math.min(...lows.map((l) => l.price)) - atr * 0.4;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    upperProj,
    'BULLISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, wedgeHeight, 'BULLISH');

  return {
    detected: true,
    name: 'FALLING_WEDGE',
    category: 'WEDGES',
    type: 'BULLISH',
    confidence: 83,
    breakoutPrice: upperProj,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      upperBoundary: upperProj,
      breakoutLevel: upperProj,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Falling Wedge bullish reversal with converging descending boundaries`,
    evidence: [
      `Descending support and steeper descending resistance trendline`,
      `Bullish breakout anticipated above upper trendline`,
      ...evidence,
    ],
    swings: [...highs, ...lows],
  };
}

/* =========================================================================================
 * GROUP D — CONTINUATION PATTERNS
 * ========================================================================================= */

/**
 * 14. Bull Flag
 */
export function detectBullFlag(candles: Candle[], atr: number): PatternDetectionResult | null {
  if (candles.length < 20) return null;
  const len = candles.length;

  // 1. Preceding Bullish Pole: search back 12 to 25 bars for strong impulse
  const poleStart = Math.max(0, len - 20);
  const poleEnd = len - 6;
  const minPrice = Math.min(...candles.slice(poleStart, poleEnd - 2).map((c) => c.low));
  const polePeak = Math.max(...candles.slice(poleStart + 2, poleEnd + 1).map((c) => c.high));
  const poleGain = polePeak - minPrice;

  if (poleGain < atr * 2.0) return null;

  // 2. Flag Consolidation: consolidation bars between peak and latest
  const flagSlice = candles.slice(poleEnd);
  const flagConsolidationSlice = flagSlice.slice(0, -1);
  const flagHighs = flagConsolidationSlice.map((c) => c.high);
  const flagLows = flagConsolidationSlice.map((c) => c.low);
  const flagChannelRange = Math.max(...flagHighs) - Math.min(...flagLows);

  // Flag channel should not retrace more than 60% of pole
  if (flagChannelRange > poleGain * 0.60) return null;

  const flagResistance = Math.max(...flagHighs);
  const latest = candles[len - 1];
  const invalidation = Math.min(...flagLows) - atr * 0.3;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    flagResistance,
    'BULLISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, poleGain, 'BULLISH');

  return {
    detected: true,
    name: 'BULL_FLAG',
    category: 'CONTINUATION',
    type: 'BULLISH',
    confidence: 86,
    breakoutPrice: flagResistance,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      resistance: flagResistance,
      support: Math.min(...flagLows),
      breakoutLevel: flagResistance,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Ascending trend continuation Bull Flag with +${poleGain.toFixed(2)} pole thrust`,
    evidence: [
      `Impulsive flagpole of ${poleGain.toFixed(2)} (${(poleGain / atr).toFixed(1)}x ATR)`,
      `Tight orderly consolidation channel retracing ${(flagChannelRange / poleGain * 100).toFixed(0)}%`,
      ...evidence,
    ],
  };
}

/**
 * 15. Bear Flag
 */
export function detectBearFlag(candles: Candle[], atr: number): PatternDetectionResult | null {
  if (candles.length < 20) return null;
  const len = candles.length;

  const poleStart = Math.max(0, len - 20);
  const poleEnd = len - 6;
  const maxPrice = Math.max(...candles.slice(poleStart, poleEnd - 2).map((c) => c.high));
  const poleTrough = Math.min(...candles.slice(poleStart + 2, poleEnd + 1).map((c) => c.low));
  const poleDrop = maxPrice - poleTrough;

  if (poleDrop < atr * 2.0) return null;

  const flagSlice = candles.slice(poleEnd);
  const flagConsolidationSlice = flagSlice.slice(0, -1);
  const flagHighs = flagConsolidationSlice.map((c) => c.high);
  const flagLows = flagConsolidationSlice.map((c) => c.low);
  const flagChannelRange = Math.max(...flagHighs) - Math.min(...flagLows);

  if (flagChannelRange > poleDrop * 0.60) return null;

  const flagSupport = Math.min(...flagLows);
  const latest = candles[len - 1];
  const invalidation = Math.max(...flagHighs) + atr * 0.3;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    flagSupport,
    'BEARISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, poleDrop, 'BEARISH');

  return {
    detected: true,
    name: 'BEAR_FLAG',
    category: 'CONTINUATION',
    type: 'BEARISH',
    confidence: 86,
    breakoutPrice: flagSupport,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      support: flagSupport,
      resistance: Math.max(...flagHighs),
      breakoutLevel: flagSupport,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Descending trend continuation Bear Flag with -${poleDrop.toFixed(2)} pole drop`,
    evidence: [
      `Impulsive flagpole dump of ${poleDrop.toFixed(2)} (${(poleDrop / atr).toFixed(1)}x ATR)`,
      `Consolidation bounce retracing ${(flagChannelRange / poleDrop * 100).toFixed(0)}%`,
      ...evidence,
    ],
  };
}

/**
 * 16. Bull Pennant
 */
export function detectBullPennant(candles: Candle[], atr: number): PatternDetectionResult | null {
  if (candles.length < 22) return null;
  const len = candles.length;

  // Anti-Waterfall Dump Gate:
  // Requires an initial upward impulse pole (gain >= 8% in last 10-25 bars)
  // and consolidation depth <= 50% of the pole.
  const searchStart = Math.max(0, len - 25);
  const consolidationLen = Math.min(8, Math.max(4, Math.floor((len - searchStart) * 0.35)));
  const poleEndIdx = len - consolidationLen;

  let poleStartLow = Infinity;
  let poleStartIdx = searchStart;
  for (let i = searchStart; i < poleEndIdx - 3; i++) {
    if (candles[i].low < poleStartLow) {
      poleStartLow = candles[i].low;
      poleStartIdx = i;
    }
  }

  let poleEndHigh = -Infinity;
  for (let i = poleStartIdx + 1; i <= poleEndIdx; i++) {
    if (candles[i].high > poleEndHigh) {
      poleEndHigh = candles[i].high;
    }
  }

  const poleGain = poleEndHigh - poleStartLow;
  const poleGainPct = poleStartLow > 0 ? (poleGain / poleStartLow) * 100 : 0;

  // Hard Gate 1: Impulse pole must achieve gain >= 8% in last 10-25 bars
  if (poleGainPct < 8.0 || poleGain < atr * 2.5) return null;

  const pennantSlice = candles.slice(poleEndIdx);
  if (pennantSlice.length < 3) return null;

  // Hard Gate 2: Consolidation depth must be <= 50% of the impulse pole
  const lowestInConsolidation = Math.min(...pennantSlice.map(c => c.low));
  const consolidationDepth = poleEndHigh - lowestInConsolidation;
  const consolidationDepthRatio = poleGain > 0 ? consolidationDepth / poleGain : 1.0;
  if (consolidationDepthRatio > 0.50) return null; // Waterfall dump detected -> reject

  const pennantHighs = pennantSlice.map((c, i) => ({ x: i, y: c.high }));
  const pennantLows = pennantSlice.map((c, i) => ({ x: i, y: c.low }));

  const highReg = linearRegression(pennantHighs);
  const lowReg = linearRegression(pennantLows);

  // Pennant converging boundaries
  if (highReg.slope >= 0 || lowReg.slope <= 0) return null;

  const breakoutLevel = pennantSlice[0].high;
  const latest = candles[len - 1];
  const invalidation = pennantSlice[0].low - atr * 0.3;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    breakoutLevel,
    'BULLISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, poleGain, 'BULLISH');

  return {
    detected: true,
    name: 'BULL_PENNANT',
    category: 'CONTINUATION',
    type: 'BULLISH',
    confidence: 84,
    breakoutPrice: breakoutLevel,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      breakoutLevel,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Bull Pennant symmetrical micro-apex continuation after +${poleGain.toFixed(2)} thrust`,
    evidence: [`Preceding mast: +${poleGain.toFixed(2)}`, `Converging pennant boundaries`, ...evidence],
  };
}

/**
 * 17. Bear Pennant
 */
export function detectBearPennant(candles: Candle[], atr: number): PatternDetectionResult | null {
  if (candles.length < 22) return null;
  const len = candles.length;

  const poleStart = len - 18;
  const poleEnd = len - 8;
  const poleDrop = candles[poleStart].high - candles[poleEnd].low;
  if (poleDrop < atr * 2.8) return null;

  const pennantSlice = candles.slice(poleEnd);
  const pennantHighs = pennantSlice.map((c, i) => ({ x: i, y: c.high }));
  const pennantLows = pennantSlice.map((c, i) => ({ x: i, y: c.low }));

  const highReg = linearRegression(pennantHighs);
  const lowReg = linearRegression(pennantLows);

  if (highReg.slope >= 0 || lowReg.slope <= 0) return null;

  const breakoutLevel = pennantSlice[0].low;
  const latest = candles[len - 1];
  const invalidation = pennantSlice[0].high + atr * 0.3;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    breakoutLevel,
    'BEARISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, poleDrop, 'BEARISH');

  return {
    detected: true,
    name: 'BEAR_PENNANT',
    category: 'CONTINUATION',
    type: 'BEARISH',
    confidence: 84,
    breakoutPrice: breakoutLevel,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      breakoutLevel,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Bear Pennant micro-consolidation following -${poleDrop.toFixed(2)} dump`,
    evidence: [`Preceding mast drop: -${poleDrop.toFixed(2)}`, `Converging pennant apex`, ...evidence],
  };
}

/**
 * 18. Rectangle Consolidation
 */
export function detectRectangle(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-4);
  const lows = swings.filter((s) => s.type === 'LOW').slice(-4);
  if (highs.length < 2 || lows.length < 2) return null;

  const highDiff = Math.abs(highs[0].price - highs[highs.length - 1].price);
  const lowDiff = Math.abs(lows[0].price - lows[lows.length - 1].price);

  // Both upper and lower bounds must be horizontal
  if (highDiff > atr * 1.0 || lowDiff > atr * 1.0) return null;

  const resistance = (highs[0].price + highs[highs.length - 1].price) / 2;
  const support = (lows[0].price + lows[lows.length - 1].price) / 2;
  const boxHeight = resistance - support;
  if (boxHeight < atr * 1.5) return null;

  const latest = candles[candles.length - 1];
  const isBullish = latest.close >= (resistance + support) / 2;
  const bias: PatternBias = isBullish ? 'BULLISH' : 'BEARISH';
  const breakoutLevel = isBullish ? resistance : support;
  const invalidation = isBullish ? support - atr * 0.3 : resistance + atr * 0.3;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    breakoutLevel,
    bias,
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, boxHeight, bias);

  return {
    detected: true,
    name: 'RECTANGLE',
    category: 'CONTINUATION',
    type: bias,
    confidence: 81,
    breakoutPrice: breakoutLevel,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      resistance,
      support,
      breakoutLevel,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Horizontal Rectangle Range Box with boundary support at ${support.toFixed(2)} and resistance at ${resistance.toFixed(2)}`,
    evidence: [`Horizontal boundary box height of ${boxHeight.toFixed(2)}`, ...evidence],
    swings: [...highs, ...lows],
  };
}

/* =========================================================================================
 * GROUP E — CHANNELS
 * ========================================================================================= */

/**
 * 19. Rising Channel
 */
export function detectRisingChannel(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-4);
  const lows = swings.filter((s) => s.type === 'LOW').slice(-4);
  if (highs.length < 2 || lows.length < 2) return null;

  const highReg = linearRegression(highs.map((h) => ({ x: h.index, y: h.price })));
  const lowReg = linearRegression(lows.map((l) => ({ x: l.index, y: l.price })));

  // Both parallel ascending
  if (highReg.slope <= 0.0001 || lowReg.slope <= 0.0001) return null;
  if (highReg.r2 < 0.6 || lowReg.r2 < 0.6) return null;

  // Slopes should be comparable
  const slopeRatio = highReg.slope / lowReg.slope;
  if (slopeRatio < 0.6 || slopeRatio > 1.6) return null;

  const latest = candles[candles.length - 1];
  const upperProj = highReg.slope * (candles.length - 1) + highReg.intercept;
  const lowerProj = lowReg.slope * (candles.length - 1) + lowReg.intercept;
  const channelWidth = upperProj - lowerProj;

  // Bullish trend continuation inside channel
  const bias: PatternBias = 'BULLISH';
  const invalidation = lowerProj - atr * 0.5;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    upperProj,
    bias,
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, channelWidth, bias);

  return {
    detected: true,
    name: 'RISING_CHANNEL',
    category: 'CHANNELS',
    type: 'BULLISH',
    confidence: 82,
    breakoutPrice: upperProj,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      upperBoundary: upperProj,
      lowerBoundary: lowerProj,
      breakoutLevel: upperProj,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Ascending Trendline Corridor with parallel trend channels`,
    evidence: [`Parallel ascending trend corridor (Slope: +${highReg.slope.toFixed(4)})`, ...evidence],
    swings: [...highs, ...lows],
  };
}

/**
 * 20. Falling Channel
 */
export function detectFallingChannel(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-4);
  const lows = swings.filter((s) => s.type === 'LOW').slice(-4);
  if (highs.length < 2 || lows.length < 2) return null;

  const highReg = linearRegression(highs.map((h) => ({ x: h.index, y: h.price })));
  const lowReg = linearRegression(lows.map((l) => ({ x: l.index, y: l.price })));

  if (highReg.slope >= -0.0001 || lowReg.slope >= -0.0001) return null;
  if (highReg.r2 < 0.6 || lowReg.r2 < 0.6) return null;

  const slopeRatio = highReg.slope / lowReg.slope;
  if (slopeRatio < 0.6 || slopeRatio > 1.6) return null;

  const latest = candles[candles.length - 1];
  const upperProj = highReg.slope * (candles.length - 1) + highReg.intercept;
  const lowerProj = lowReg.slope * (candles.length - 1) + lowReg.intercept;
  const channelWidth = upperProj - lowerProj;

  // Bearish trend continuation or upper breakout
  const bias: PatternBias = 'BEARISH';
  const invalidation = upperProj + atr * 0.5;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    lowerProj,
    bias,
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, channelWidth, bias);

  return {
    detected: true,
    name: 'FALLING_CHANNEL',
    category: 'CHANNELS',
    type: 'BEARISH',
    confidence: 82,
    breakoutPrice: lowerProj,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      upperBoundary: upperProj,
      lowerBoundary: lowerProj,
      breakoutLevel: lowerProj,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Descending Trendline Corridor with parallel downtrend rails`,
    evidence: [`Parallel descending trend corridor (Slope: ${highReg.slope.toFixed(4)})`, ...evidence],
    swings: [...highs, ...lows],
  };
}

/* =========================================================================================
 * GROUP F — ADVANCED PATTERNS
 * ========================================================================================= */

/**
 * 21. Cup & Handle
 */
export function detectCupAndHandle(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  if (candles.length < 26) return null;
  const sampleLen = Math.min(candles.length, 45);
  const slice = candles.slice(-sampleLen);
  const closes = slice.map((c) => c.close);

  const cupBarCount = Math.floor(sampleLen * 0.75);
  const cupSlice = closes.slice(0, cupBarCount);
  const leftRim = Math.max(...cupSlice.slice(0, Math.floor(cupBarCount * 0.3)));
  const bottom = Math.min(...cupSlice.slice(Math.floor(cupBarCount * 0.25), Math.floor(cupBarCount * 0.75)));
  const rightRim = Math.max(...cupSlice.slice(Math.floor(cupBarCount * 0.7)));

  const rimDiff = Math.abs(leftRim - rightRim);
  const cupDepth = Math.min(leftRim, rightRim) - bottom;

  if (rimDiff > atr * 1.8 || cupDepth < atr * 1.5) return null;

  // Handle: Last ~25% bars (minor pullback retracing < 55% of cup depth)
  const handleSlice = closes.slice(cupBarCount);
  const handleLow = Math.min(...handleSlice);
  const handlePullback = rightRim - handleLow;

  if (handlePullback > cupDepth * 0.55) return null;

  const rim = Math.max(leftRim, rightRim);
  const latest = candles[candles.length - 1];
  const invalidation = handleLow - atr * 0.4;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    rim,
    'BULLISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, cupDepth, 'BULLISH');

  return {
    detected: true,
    name: 'CUP_AND_HANDLE',
    category: 'ADVANCED',
    type: 'BULLISH',
    confidence: 88,
    breakoutPrice: rim,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      resistance: rim,
      support: handleLow,
      breakoutLevel: rim,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Classic Cup & Handle continuation pattern with rim level at ${rim.toFixed(2)} and shallow handle pullback`,
    evidence: [
      `Rounded accumulation cup with depth of ${cupDepth.toFixed(2)}`,
      `Orderly handle consolidation retracing only ${((handlePullback / cupDepth) * 100).toFixed(0)}% of cup depth`,
      ...evidence,
    ],
  };
}

/**
 * 22. Inverse Cup & Handle
 */
export function detectInverseCupAndHandle(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  if (candles.length < 40) return null;
  const slice = candles.slice(-40);
  const closes = slice.map((c) => c.close);

  const domeSlice = closes.slice(0, 30);
  const leftRim = Math.min(...domeSlice.slice(0, 8));
  const domeTop = Math.max(...domeSlice.slice(8, 22));
  const rightRim = Math.min(...domeSlice.slice(22, 30));

  const rimDiff = Math.abs(leftRim - rightRim);
  const domeHeight = domeTop - Math.max(leftRim, rightRim);

  if (rimDiff > atr * 1.5 || domeHeight < atr * 2.5) return null;

  // Handle: upward retracement < 50% of dome height
  const handleSlice = closes.slice(30);
  const handleHigh = Math.max(...handleSlice);
  const handlePullback = handleHigh - rightRim;

  if (handlePullback > domeHeight * 0.5 || handlePullback < atr * 0.3) return null;

  const rim = Math.min(leftRim, rightRim);
  const latest = candles[candles.length - 1];
  const invalidation = handleHigh + atr * 0.4;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    rim,
    'BEARISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, domeHeight, 'BEARISH');

  return {
    detected: true,
    name: 'INVERSE_CUP_AND_HANDLE',
    category: 'ADVANCED',
    type: 'BEARISH',
    confidence: 88,
    breakoutPrice: rim,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      support: rim,
      resistance: handleHigh,
      breakoutLevel: rim,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Inverse Cup & Handle distribution topping formation with support baseline at ${rim.toFixed(2)}`,
    evidence: [`Inverted dome top with height ${domeHeight.toFixed(2)}`, ...evidence],
  };
}

/**
 * 23. Broadening Formation (Megaphone)
 */
export function detectBroadeningFormation(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-4);
  const lows = swings.filter((s) => s.type === 'LOW').slice(-4);
  if (highs.length < 2 || lows.length < 2) return null;

  const highReg = linearRegression(highs.map((h) => ({ x: h.index, y: h.price })));
  const lowReg = linearRegression(lows.map((l) => ({ x: l.index, y: l.price })));

  // Highs rising, Lows falling (expanding volatility megaphone)
  if (highReg.slope <= 0.0001 || lowReg.slope >= -0.0001) return null;

  const latest = candles[candles.length - 1];
  const upperProj = highReg.slope * (candles.length - 1) + highReg.intercept;
  const lowerProj = lowReg.slope * (candles.length - 1) + lowReg.intercept;

  const bias: PatternBias = latest.close >= (upperProj + lowerProj) / 2 ? 'BULLISH' : 'BEARISH';
  const breakoutLevel = bias === 'BULLISH' ? upperProj : lowerProj;
  const invalidation = bias === 'BULLISH' ? lowerProj - atr * 0.5 : upperProj + atr * 0.5;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    breakoutLevel,
    bias,
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, upperProj - lowerProj, bias);

  return {
    detected: true,
    name: 'BROADENING_FORMATION',
    category: 'ADVANCED',
    type: bias,
    confidence: 79,
    breakoutPrice: breakoutLevel,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      upperBoundary: upperProj,
      lowerBoundary: lowerProj,
      breakoutLevel,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Broadening Formation (Megaphone) expanding volatility structure`,
    evidence: [`Expanding highs (Slope: +${highReg.slope.toFixed(4)}) and expanding lows (Slope: ${lowReg.slope.toFixed(4)})`, ...evidence],
    swings: [...highs, ...lows],
  };
}

/**
 * 24. Diamond Top
 */
export function detectDiamondTop(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  if (candles.length < 35 || swings.length < 6) return null;
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-4);
  const lows = swings.filter((s) => s.type === 'LOW').slice(-4);
  if (highs.length < 3 || lows.length < 3) return null;

  // Phase 1: broadening (H2 > H1, L2 < L1), Phase 2: contracting (H3 < H2, L3 > L2)
  const H1 = highs[highs.length - 3];
  const H2 = highs[highs.length - 2];
  const H3 = highs[highs.length - 1];

  const L1 = lows[lows.length - 3];
  const L2 = lows[lows.length - 2];
  const L3 = lows[lows.length - 1];

  const isBroadening = H2.price > H1.price && L2.price < L1.price;
  const isContracting = H3.price < H2.price && L3.price > L2.price;

  if (!isBroadening || !isContracting) return null;

  const latest = candles[candles.length - 1];
  const breakoutLevel = L3.price;
  const invalidation = H2.price + atr * 0.4;
  const diamondHeight = H2.price - L2.price;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    breakoutLevel,
    'BEARISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, diamondHeight, 'BEARISH');

  return {
    detected: true,
    name: 'DIAMOND_TOP',
    category: 'ADVANCED',
    type: 'BEARISH',
    confidence: 86,
    breakoutPrice: breakoutLevel,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      resistance: H2.price,
      support: L3.price,
      breakoutLevel,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Diamond Top structural reversal topping structure`,
    evidence: [`Broadening apex transition followed by compression`, ...evidence],
    swings: [H1, L1, H2, L2, H3, L3],
  };
}

/**
 * 25. Diamond Bottom
 */
export function detectDiamondBottom(candles: Candle[], swings: SwingPoint[], atr: number): PatternDetectionResult | null {
  if (candles.length < 35 || swings.length < 6) return null;
  const highs = swings.filter((s) => s.type === 'HIGH').slice(-4);
  const lows = swings.filter((s) => s.type === 'LOW').slice(-4);
  if (highs.length < 3 || lows.length < 3) return null;

  const H1 = highs[highs.length - 3];
  const H2 = highs[highs.length - 2];
  const H3 = highs[highs.length - 1];

  const L1 = lows[lows.length - 3];
  const L2 = lows[lows.length - 2];
  const L3 = lows[lows.length - 1];

  const isBroadening = L2.price < L1.price && H2.price > H1.price;
  const isContracting = L3.price > L2.price && H3.price < H2.price;

  if (!isBroadening || !isContracting) return null;

  const latest = candles[candles.length - 1];
  const breakoutLevel = H3.price;
  const invalidation = L2.price - atr * 0.4;
  const diamondHeight = H2.price - L2.price;

  const { breakoutStatus, retestStatus, volumeConfirmation, volumeRatio, evidence } = evaluateBreakoutAndRetest(
    candles,
    breakoutLevel,
    'BULLISH',
    invalidation,
    atr
  );

  const { measuredTarget, targets } = generatePatternDynamicTargets(latest.close, diamondHeight, 'BULLISH');

  return {
    detected: true,
    name: 'DIAMOND_BOTTOM',
    category: 'ADVANCED',
    type: 'BULLISH',
    confidence: 86,
    breakoutPrice: breakoutLevel,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio,
    invalidationPrice: Number(invalidation.toFixed(4)),
    keyLevels: {
      resistance: H3.price,
      support: L2.price,
      breakoutLevel,
      invalidationLevel: Number(invalidation.toFixed(4)),
      measuredTarget,
      targets,
    },
    description: `Diamond Bottom structural accumulation bottom reversal`,
    evidence: [`Inverted broadening apex followed by consolidation breakout`, ...evidence],
    swings: [H1, L1, H2, L2, H3, L3],
  };
}

/**
 * Master Chart Pattern Engine
 * Executes all pattern detectors in prioritized sequence and returns highest quality pattern evidence
 */
export function runComprehensivePatternEngine(candles: Candle[], timeframe: string = '1h'): PatternDetectionResult {
  if (!candles || candles.length < 25) {
    return {
      detected: false,
      name: 'NONE',
      category: 'MOMENTUM',
      type: 'NEUTRAL',
      confidence: 0,
      breakoutStatus: 'NONE',
      retestStatus: 'UNKNOWN',
      volumeConfirmation: false,
      keyLevels: {},
      description: 'Insufficient candle data for chart pattern detection',
      evidence: [],
    };
  }

  const atrArr = calculateATR(candles, 14);
  const atr = atrArr[atrArr.length - 1] || candles[candles.length - 1].close * 0.015;
  const swings = findSwingPoints(candles, 3, 2);

  const candidateDetectors: Array<() => PatternDetectionResult | null> = [
    // GROUP A: REVERSALS
    () => detectHeadAndShoulders(candles, swings, atr),
    () => detectInverseHeadAndShoulders(candles, swings, atr),
    () => detectDoubleBottom(candles, swings, atr),
    () => detectDoubleTop(candles, swings, atr),
    () => detectTripleTop(candles, swings, atr),
    () => detectTripleBottom(candles, swings, atr),
    () => detectRoundingBottom(candles, atr),
    () => detectRoundingTop(candles, atr),

    // GROUP B: TRIANGLES
    () => detectAscendingTriangle(candles, swings, atr),
    () => detectDescendingTriangle(candles, swings, atr),
    () => detectSymmetricalTriangle(candles, swings, atr),

    // GROUP C: WEDGES
    () => detectFallingWedge(candles, swings, atr),
    () => detectRisingWedge(candles, swings, atr),

    // GROUP D: CONTINUATION
    () => detectBullFlag(candles, atr),
    () => detectBearFlag(candles, atr),
    () => detectBullPennant(candles, atr),
    () => detectBearPennant(candles, atr),
    () => detectRectangle(candles, swings, atr),

    // GROUP E: CHANNELS
    () => detectRisingChannel(candles, swings, atr),
    () => detectFallingChannel(candles, swings, atr),

    // GROUP F: ADVANCED
    () => detectCupAndHandle(candles, swings, atr),
    () => detectInverseCupAndHandle(candles, swings, atr),
    () => detectDiamondTop(candles, swings, atr),
    () => detectDiamondBottom(candles, swings, atr),
    () => detectBroadeningFormation(candles, swings, atr),
  ];

  const detectedPatterns: PatternDetectionResult[] = [];

  for (const detector of candidateDetectors) {
    try {
      const res = detector();
      if (res && res.detected) {
        detectedPatterns.push(res);
      }
    } catch {
      // Ignore individual detector errors and continue
    }
  }

  if (detectedPatterns.length > 0) {
    // Sort by confidence score descending and pick the strongest evidence
    detectedPatterns.sort((a, b) => b.confidence - a.confidence);
    return detectedPatterns[0];
  }

  // Fallback: Momentum / Trend baseline (preserving existing behavior)
  const len = candles.length;
  const latest = candles[len - 1];
  const ema20Arr = calculateEMA(candles.map((c) => c.close), 20);
  const ema20 = ema20Arr[ema20Arr.length - 1];
  const isBullish = latest.close >= ema20;

  return {
    detected: false,
    name: 'TREND_MOMENTUM',
    category: 'MOMENTUM',
    type: isBullish ? 'BULLISH' : 'BEARISH',
    confidence: 60,
    breakoutPrice: latest.close,
    breakoutTimestamp: latest.timestamp,
    breakoutStatus: 'NONE',
    retestStatus: 'UNKNOWN',
    volumeConfirmation: false,
    keyLevels: {
      support: isBullish ? ema20 - atr : latest.close - atr * 1.5,
      resistance: isBullish ? latest.close + atr * 1.5 : ema20 + atr,
      breakoutLevel: latest.close,
      invalidationLevel: isBullish ? ema20 - atr * 0.8 : ema20 + atr * 0.8,
    },
    description: `Dynamic ${isBullish ? 'bullish' : 'bearish'} momentum expansion above/below key moving averages`,
    evidence: [`Price tracking ${isBullish ? 'above' : 'below'} 20 EMA`],
  };
}
