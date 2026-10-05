import { Candle } from './cryptoService';
import { calculateATR, calculateEMA, calculateRVOL } from './technicalAnalysis';
import { findSwingPoints, SwingPoint, linearRegression, PatternDetectionResult } from './patternEngine';

export type TrendlineType = 'SUPPORT' | 'RESISTANCE' | 'UPPER_CHANNEL' | 'LOWER_CHANNEL';
export type TrendlineDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type TrendlineBreakoutStatus = 'NONE' | 'POTENTIAL' | 'CONFIRMED' | 'FAILED' | 'UNKNOWN';
export type TrendlineRetestStatus = 'NONE' | 'APPROACHING' | 'TESTING' | 'CONFIRMED' | 'FAILED' | 'UNKNOWN';

export interface TrendlineTouch {
  index: number;
  timestamp: number;
  price: number;
  linePrice: number;
  distanceToLine: number;
  atrDistance: number;
  isExtreme: boolean;
}

export interface ParallelChannel {
  channelWidth: number;
  oppositeSlope: number;
  oppositeIntercept: number;
  oppositeTouchCount: number;
}

export interface TrendlineEvidence {
  detected: boolean;
  direction: TrendlineDirection;
  type: TrendlineType;
  slope: number;
  intercept: number;
  angleDegrees?: number;
  touchCount: number;
  touchQuality: number; // 0 - 100
  confidence: number; // 0 - 100
  timeframe: string;
  startPoint: { index: number; timestamp: number; price: number };
  endPoint: { index: number; timestamp: number; price: number };
  currentLinePrice: number;
  breakoutLevel: number;
  breakoutStatus: TrendlineBreakoutStatus;
  retestStatus: TrendlineRetestStatus;
  volumeConfirmation: boolean;
  volumeRatio?: number;
  invalidationPrice?: number;
  touches: TrendlineTouch[];
  parallelChannel?: ParallelChannel;
  description: string;
  evidence: string[];
}

export interface TrendlineConfluenceResult {
  hasConfluence: boolean;
  confluenceType: 'STRONG_CONFIRMATION' | 'MODERATE_CONFIRMATION' | 'CONFLICT' | 'NEUTRAL';
  scoreBonus: number; // -30 to +30
  notes: string[];
}

/**
 * Evaluates candidate trendline against all candles for ATR-normalized touches & violations
 */
function evaluateCandidateTrendline(
  candles: Candle[],
  p1: SwingPoint,
  p2: SwingPoint,
  type: 'SUPPORT' | 'RESISTANCE',
  atr: number,
  timeframe: string
): TrendlineEvidence | null {
  const len = candles.length;
  const dx = p2.index - p1.index;
  if (dx <= 2) return null; // Discard tightly clustered noisy points

  const slope = (p2.price - p1.price) / dx;
  const intercept = p1.price - slope * p1.index;

  // Maximum allowed slope relative to ATR per bar to filter out near-vertical erratic spikes
  const maxSlopePerBar = atr * 1.8;
  if (Math.abs(slope) > maxSlopePerBar) return null;

  const isSupport = type === 'SUPPORT';
  const touchTolerance = Math.max(atr * 0.65, p1.price * 0.003);
  const violationTolerance = Math.max(atr * 0.45, p1.price * 0.002);

  const touches: TrendlineTouch[] = [];
  let lastTouchIdx = -999;
  let totalDev = 0;

  // Check intermediate candles between start and end (and beyond)
  let intermediateViolations = 0;

  for (let i = p1.index; i < len; i++) {
    const c = candles[i];
    const linePrice = slope * i + intercept;
    const testPrice = isSupport ? c.low : c.high;
    const closePrice = c.close;
    const dist = Math.abs(testPrice - linePrice);
    const atrDist = Number((dist / (atr || 1)).toFixed(2));

    // Check intermediate violation before the final touch
    if (i < p2.index) {
      if (isSupport && closePrice < linePrice - violationTolerance) {
        intermediateViolations++;
      } else if (!isSupport && closePrice > linePrice + violationTolerance) {
        intermediateViolations++;
      }
    }

    // Identify touches with minimum spacing of 3 bars
    if (dist <= touchTolerance && (i - lastTouchIdx >= 3 || i === p1.index || i === p2.index)) {
      touches.push({
        index: i,
        timestamp: c.timestamp,
        price: testPrice,
        linePrice: Number(linePrice.toFixed(4)),
        distanceToLine: Number(dist.toFixed(4)),
        atrDistance: atrDist,
        isExtreme: i === p1.index || i === p2.index,
      });
      lastTouchIdx = i;
      totalDev += dist;
    }
  }

  // If there are too many intermediate close violations, the trendline is invalid
  if (intermediateViolations > 2) return null;

  const touchCount = touches.length;
  // A robust algorithmic trendline requires at least 3 distinct touches
  if (touchCount < 2) return null;

  const avgDev = totalDev / touchCount;
  const devRatio = Math.max(0, 1 - avgDev / (touchTolerance || 1));

  // Compute touch quality score (0 - 100)
  let touchQuality = 50;
  if (touchCount >= 3) touchQuality += 30;
  if (touchCount >= 4) touchQuality += 15;
  touchQuality = Math.min(100, Math.round(touchQuality * (0.6 + 0.4 * devRatio)));

  // Determine direction:
  // Ascending Support -> Bullish; Descending Resistance -> Bearish; Horizontal -> Neutral
  let direction: TrendlineDirection = 'NEUTRAL';
  if (isSupport) {
    direction = slope > 0.0001 ? 'BULLISH' : slope < -0.0001 ? 'NEUTRAL' : 'BULLISH';
  } else {
    direction = slope < -0.0001 ? 'BEARISH' : slope > 0.0001 ? 'NEUTRAL' : 'BEARISH';
  }

  const latest = candles[len - 1];
  const currentLinePrice = Number((slope * (len - 1) + intercept).toFixed(4));
  const breakoutLevel = currentLinePrice;

  // Breakout Analysis
  const volumes = candles.map((c) => c.volume);
  const avgVol = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 19 || 1;
  const recentVolRatio = Number((latest.volume / avgVol).toFixed(2));
  const volumeConfirmation = recentVolRatio >= 1.25;

  let breakoutStatus: TrendlineBreakoutStatus = 'NONE';
  let retestStatus: TrendlineRetestStatus = 'NONE';
  const evidenceList: string[] = [];

  const breakoutDistReq = Math.max(atr * 0.3, currentLinePrice * 0.002);
  let breakoutBarIdx = -1;

  // Search recent 10 bars for breakout
  for (let i = Math.max(0, len - 10); i < len; i++) {
    const c = candles[i];
    const lp = slope * i + intercept;
    if (isSupport && c.close < lp - breakoutDistReq) {
      breakoutBarIdx = i;
      break;
    } else if (!isSupport && c.close > lp + breakoutDistReq) {
      breakoutBarIdx = i;
      break;
    }
  }

  if (breakoutBarIdx !== -1) {
    const breakoutCandle = candles[breakoutBarIdx];
    const isLatest = breakoutBarIdx === len - 1;

    // Check if subsequent price held or retreated (false breakout)
    if (!isLatest) {
      const postBreakoutCandles = candles.slice(breakoutBarIdx + 1);
      let failedBreakout = false;
      for (let pIdx = 0; pIdx < postBreakoutCandles.length; pIdx++) {
        const pbc = postBreakoutCandles[pIdx];
        const barIndex = breakoutBarIdx + 1 + pIdx;
        const lp = slope * barIndex + intercept;
        // If broken line is breached backwards heavily beyond 1.0 ATR, it is a failed breakout
        if (isSupport && pbc.close > lp + atr * 1.0) {
          failedBreakout = true;
          break;
        } else if (!isSupport && pbc.close < lp - atr * 1.0) {
          failedBreakout = true;
          break;
        }
      }

      if (failedBreakout) {
        breakoutStatus = 'FAILED';
        evidenceList.push(`Breakout failed: price immediately reverted back across trendline`);
      } else {
        breakoutStatus = volumeConfirmation ? 'CONFIRMED' : 'POTENTIAL';
        evidenceList.push(`Trendline breakout detected at ${breakoutCandle.close.toFixed(2)} with ${recentVolRatio}x volume`);

        // Evaluate Retest
        const retestCandles = postBreakoutCandles;
        for (let r = 0; r < retestCandles.length; r++) {
          const rc = retestCandles[r];
          const currBarIdx = breakoutBarIdx + 1 + r;
          const currLp = slope * currBarIdx + intercept;
          const minDistance = isSupport
            ? Math.abs(rc.high - currLp)
            : Math.abs(rc.low - currLp);
          const closeDist = Math.abs(rc.close - currLp);

          if (minDistance <= atr * 0.85 || closeDist <= atr * 0.85) {
            retestStatus = 'TESTING';
            // If price bounced cleanly away from trendline in breakout direction
            const isRejection = isSupport
              ? (rc.close <= rc.open || rc.close < currLp) && rc.high >= currLp - atr * 0.3
              : (rc.close >= rc.open || rc.close > currLp) && rc.low <= currLp + atr * 0.3;

            if (isRejection || r === retestCandles.length - 1) {
              retestStatus = 'CONFIRMED';
              evidenceList.push(`Retest of broken trendline confirmed with clean rejection bounce`);
            }
          }
        }
      }
    } else {
      breakoutStatus = volumeConfirmation ? 'CONFIRMED' : 'POTENTIAL';
      evidenceList.push(`Active trendline breakout on bar [${breakoutBarIdx}] (${recentVolRatio}x volume)`);
    }
  } else {
    // No breakout; verify if price is currently respecting / testing trendline
    const distToLine = Math.abs(latest.close - currentLinePrice);
    if (distToLine <= atr * 0.5) {
      evidenceList.push(`Price currently testing trendline at ${currentLinePrice.toFixed(2)}`);
    }
  }

  // Calculate overall confidence score
  let confidence = touchCount >= 3 ? 75 : 45;
  if (touchCount >= 4) confidence += 10;
  if (touchQuality >= 80) confidence += 10;
  if (volumeConfirmation) confidence += 5;
  if (breakoutStatus === 'CONFIRMED') confidence += 5;
  if (retestStatus === 'CONFIRMED') confidence += 10;
  if (breakoutStatus === 'FAILED') confidence = Math.max(25, confidence - 30);
  confidence = Math.min(98, Math.max(30, confidence));

  const invalidationPrice = isSupport
    ? Number((currentLinePrice - atr * 1.2).toFixed(4))
    : Number((currentLinePrice + atr * 1.2).toFixed(4));

  evidenceList.unshift(
    `${touchCount}-touch ${isSupport ? 'Support' : 'Resistance'} trendline (Slope: ${slope.toFixed(4)}, Quality: ${touchQuality}%)`
  );

  return {
    detected: true,
    direction,
    type: isSupport ? 'SUPPORT' : 'RESISTANCE',
    slope: Number(slope.toFixed(6)),
    intercept: Number(intercept.toFixed(4)),
    touchCount,
    touchQuality,
    confidence,
    timeframe,
    startPoint: { index: p1.index, timestamp: p1.timestamp, price: p1.price },
    endPoint: { index: touches[touches.length - 1].index, timestamp: touches[touches.length - 1].timestamp, price: touches[touches.length - 1].price },
    currentLinePrice,
    breakoutLevel,
    breakoutStatus,
    retestStatus,
    volumeConfirmation,
    volumeRatio: recentVolRatio,
    invalidationPrice,
    touches,
    description: `${touchCount}-touch ${isSupport ? 'Support' : 'Resistance'} trendline on ${timeframe}`,
    evidence: evidenceList,
  };
}

/**
 * Main Algorithmic Multi-Touch Trendline Detector
 */
export function detectTrendlines(candles: Candle[], timeframe: string = '1h'): TrendlineEvidence | null {
  if (!candles || candles.length < 20) return null;

  const atrArr = calculateATR(candles, 14);
  const atr = atrArr[atrArr.length - 1] || candles[candles.length - 1].close * 0.015;

  const swings = findSwingPoints(candles, 3, 2);
  const lows = swings.filter((s) => s.type === 'LOW');
  const highs = swings.filter((s) => s.type === 'HIGH');

  let bestTrendline: TrendlineEvidence | null = null;
  let bestScore = -1;

  // 1. Evaluate Support Lines (Low to Low)
  if (lows.length >= 2) {
    for (let i = 0; i < lows.length - 1; i++) {
      for (let j = i + 1; j < lows.length; j++) {
        const candidate = evaluateCandidateTrendline(candles, lows[i], lows[j], 'SUPPORT', atr, timeframe);
        if (candidate) {
          // Weight 3+ touch trendlines significantly higher than 2-touch
          const score = candidate.touchCount * 30 + candidate.touchQuality + (candidate.touchCount >= 3 ? 50 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestTrendline = candidate;
          }
        }
      }
    }
  }

  // 2. Evaluate Resistance Lines (High to High)
  if (highs.length >= 2) {
    for (let i = 0; i < highs.length - 1; i++) {
      for (let j = i + 1; j < highs.length; j++) {
        const candidate = evaluateCandidateTrendline(candles, highs[i], highs[j], 'RESISTANCE', atr, timeframe);
        if (candidate) {
          const score = candidate.touchCount * 30 + candidate.touchQuality + (candidate.touchCount >= 3 ? 50 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestTrendline = candidate;
          }
        }
      }
    }
  }

  // Check parallel channel if a validated trendline was discovered
  if (bestTrendline && bestTrendline.touchCount >= 3) {
    const isSupport = bestTrendline.type === 'SUPPORT';
    const oppositeSwings = isSupport ? highs : lows;
    if (oppositeSwings.length >= 2) {
      let maxDist = 0;
      let oppTouchCount = 0;
      for (const s of oppositeSwings) {
        const lineVal = bestTrendline.slope * s.index + bestTrendline.intercept;
        const dist = Math.abs(s.price - lineVal);
        if (dist > maxDist) maxDist = dist;
      }

      if (maxDist > atr * 1.5) {
        const oppIntercept = isSupport ? bestTrendline.intercept + maxDist : bestTrendline.intercept - maxDist;
        for (const s of oppositeSwings) {
          const oppLineVal = bestTrendline.slope * s.index + oppIntercept;
          if (Math.abs(s.price - oppLineVal) <= atr * 0.7) oppTouchCount++;
        }

        if (oppTouchCount >= 2) {
          bestTrendline.parallelChannel = {
            channelWidth: Number(maxDist.toFixed(4)),
            oppositeSlope: bestTrendline.slope,
            oppositeIntercept: Number(oppIntercept.toFixed(4)),
            oppositeTouchCount: oppTouchCount,
          };
          bestTrendline.evidence.push(`Forming parallel channel with ${oppTouchCount} touches on opposing boundary`);
        }
      }
    }
  }

  return bestTrendline;
}

/**
 * Step 8 & 9 (Phase 3): Pattern + Trendline Confluence Evaluator
 */
export function evaluatePatternTrendlineConfluence(
  pattern?: PatternDetectionResult | null,
  trendline?: TrendlineEvidence | null
): TrendlineConfluenceResult {
  const notes: string[] = [];

  if (!pattern || !pattern.detected || !trendline || !trendline.detected) {
    return {
      hasConfluence: false,
      confluenceType: 'NEUTRAL',
      scoreBonus: 0,
      notes: ['Insufficient pattern or trendline data for confluence scoring'],
    };
  }

  const isPatternBull = pattern.type === 'BULLISH';
  const isPatternBear = pattern.type === 'BEARISH';
  const isTlBull = trendline.direction === 'BULLISH' || (trendline.type === 'RESISTANCE' && trendline.breakoutStatus === 'CONFIRMED');
  const isTlBear = trendline.direction === 'BEARISH' || (trendline.type === 'SUPPORT' && trendline.breakoutStatus === 'CONFIRMED');

  // Both Bullish
  if (isPatternBull && isTlBull) {
    const isBothBreakout = (pattern.breakoutStatus === 'BROKEN_OUT' || pattern.breakoutStatus === 'CONFIRMED') &&
      (trendline.breakoutStatus === 'CONFIRMED' || trendline.retestStatus === 'CONFIRMED');

    if (isBothBreakout) {
      notes.push(`Dual Breakout: Bullish ${pattern.name} breakout aligns with trendline breakout & volume confirmation.`);
      return {
        hasConfluence: true,
        confluenceType: 'STRONG_CONFIRMATION',
        scoreBonus: 25,
        notes,
      };
    }

    notes.push(`Bullish confluence: ${pattern.name} matches upward ${trendline.type} trendline.`);
    return {
      hasConfluence: true,
      confluenceType: 'MODERATE_CONFIRMATION',
      scoreBonus: 15,
      notes,
    };
  }

  // Both Bearish
  if (isPatternBear && isTlBear) {
    const isBothBreakout = (pattern.breakoutStatus === 'BROKEN_OUT' || pattern.breakoutStatus === 'CONFIRMED') &&
      (trendline.breakoutStatus === 'CONFIRMED' || trendline.retestStatus === 'CONFIRMED');

    if (isBothBreakout) {
      notes.push(`Dual Breakdown: Bearish ${pattern.name} breakdown aligns with support trendline breakdown.`);
      return {
        hasConfluence: true,
        confluenceType: 'STRONG_CONFIRMATION',
        scoreBonus: 25,
        notes,
      };
    }

    notes.push(`Bearish confluence: ${pattern.name} matches downward ${trendline.type} trendline.`);
    return {
      hasConfluence: true,
      confluenceType: 'MODERATE_CONFIRMATION',
      scoreBonus: 15,
      notes,
    };
  }

  // Conflict (Bullish pattern at Bearish un-broken trendline OR Bearish pattern at Bullish un-broken trendline)
  if ((isPatternBull && isTlBear) || (isPatternBear && isTlBull)) {
    notes.push(`Directional Conflict: ${pattern.name} (${pattern.type}) opposes ${trendline.type} trendline (${trendline.direction}).`);
    return {
      hasConfluence: false,
      confluenceType: 'CONFLICT',
      scoreBonus: -20,
      notes,
    };
  }

  return {
    hasConfluence: false,
    confluenceType: 'NEUTRAL',
    scoreBonus: 0,
    notes: ['Neutral alignment between pattern and trendline.'],
  };
}
