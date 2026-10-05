import { Candle } from './cryptoService';
import { BreakoutStage, BreakoutClassification } from '../src/types/crypto';

export interface BreakoutEvaluation {
  stage: BreakoutStage;
  classification: BreakoutClassification;
  levelPrice: number;
  levelType: 'RESISTANCE' | 'SUPPORT';
  isConfirmed: boolean;
  breakoutDistancePct: number;
  volumeConfirmed: boolean;
  qualityScore: number; // 0 - 100
  details: string;
}

/**
 * Evaluates breakout quality across multiple lifecycle stages:
 * PRE_BREAKOUT -> BREAKOUT -> BREAKOUT_CONFIRMED -> RETEST -> RETEST_CONFIRMED -> CONTINUATION / FAILED_BREAKOUT
 * Also classifies: GENUINE_BREAKOUT | POTENTIAL_BREAKOUT | FAKE_BREAKOUT | FAILED_BREAKOUT | BREAKOUT_RETEST | CONFIRMED_CONTINUATION
 */
export function evaluateBreakoutQuality(
  candles: Candle[],
  keyLevel: number,
  type: 'RESISTANCE' | 'SUPPORT',
  rvol: number = 1.0,
  priceDecimals: number = 2
): BreakoutEvaluation {
  const safeKeyLevel = (typeof keyLevel === 'number' && !isNaN(keyLevel) && keyLevel > 0)
    ? keyLevel
    : 0;

  if (!candles || candles.length < 5 || safeKeyLevel <= 0) {
    return {
      stage: 'PRE_BREAKOUT',
      classification: 'POTENTIAL_BREAKOUT',
      levelPrice: safeKeyLevel,
      levelType: type,
      isConfirmed: false,
      breakoutDistancePct: 0,
      volumeConfirmed: false,
      qualityScore: 50,
      details: 'No breakout level specified'
    };
  }


  const len = candles.length;
  const currentCandle = candles[len - 1];
  const prevCandle = candles[len - 2];
  const priorCandles = candles.slice(Math.max(0, len - 6), len - 2);

  const currentPrice = currentCandle.close;
  const isResistance = type === 'RESISTANCE';
  const breakoutDistancePct = isResistance
    ? ((currentPrice - safeKeyLevel) / safeKeyLevel) * 100
    : ((safeKeyLevel - currentPrice) / safeKeyLevel) * 100;

  const volumeConfirmed = rvol >= 1.15;

  // Real volatility buffer derived from actual candle ranges rather than arbitrary static multipliers
  const recentRanges = candles.slice(-10).map(c => Math.abs(c.high - c.low));
  const avgRange = recentRanges.reduce((a, b) => a + b, 0) / (recentRanges.length || 1);
  const structuralBuffer = Math.max(avgRange * 0.15, safeKeyLevel * 0.0015);
  const retestBuffer = structuralBuffer * 1.6;

  if (isResistance) {
    // 1. Failed Breakout Check (Reversion back inside range)
    if (prevCandle.close > safeKeyLevel && currentCandle.close < safeKeyLevel - structuralBuffer) {
      return {
        stage: 'FAILED_BREAKOUT',
        classification: 'FAILED_BREAKOUT',
        levelPrice: safeKeyLevel,
        levelType: type,
        isConfirmed: false,
        breakoutDistancePct,
        volumeConfirmed,
        qualityScore: 15,
        details: `Failed Breakout: Previous candle broke above ${safeKeyLevel.toFixed(priceDecimals)}, but current candle fell back inside range`
      };
    }

    // 2. Fake Breakout / Wick Fakeout (Wicked above resistance but closed back below with upper shadow)
    const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
    const body = Math.abs(currentCandle.close - currentCandle.open);
    if (currentCandle.high > safeKeyLevel + structuralBuffer && currentCandle.close < safeKeyLevel && upperWick >= body * 0.6) {
      return {
        stage: 'FAILED_BREAKOUT',
        classification: 'FAKE_BREAKOUT',
        levelPrice: safeKeyLevel,
        levelType: type,
        isConfirmed: false,
        breakoutDistancePct,
        volumeConfirmed,
        qualityScore: 20,
        details: `Fake Breakout (Bull Trap): Price wicked above ${safeKeyLevel.toFixed(priceDecimals)} but rejected heavily back below`
      };
    }


    // 3. Retest Confirmed Check (Prior closed above, tested level as support and closed green/neutral above)
    if (
      priorCandles.some(c => c.close > safeKeyLevel) &&
      currentCandle.low <= safeKeyLevel + retestBuffer &&
      currentCandle.low >= safeKeyLevel - retestBuffer &&
      currentCandle.close > safeKeyLevel &&
      currentCandle.close >= currentCandle.open
    ) {
      const qScore = Math.min(95, 75 + (volumeConfirmed ? 15 : 5));
      return {
        stage: 'RETEST_CONFIRMED',
        classification: 'BREAKOUT_RETEST',
        levelPrice: safeKeyLevel,
        levelType: type,
        isConfirmed: true,
        breakoutDistancePct,
        volumeConfirmed,
        qualityScore: qScore,
        details: `Retest Confirmed: Price successfully retested broken resistance at ${safeKeyLevel.toFixed(priceDecimals)} as new support`
      };
    }

    // 4. In-Progress Retest
    if (
      prevCandle.close > safeKeyLevel &&
      currentCandle.low <= safeKeyLevel + retestBuffer &&
      currentCandle.close >= safeKeyLevel - structuralBuffer
    ) {
      return {
        stage: 'RETEST',
        classification: 'BREAKOUT_RETEST',
        levelPrice: safeKeyLevel,
        levelType: type,
        isConfirmed: false,
        breakoutDistancePct,
        volumeConfirmed,
        qualityScore: 60,
        details: `Retest in Progress: Price testing previous resistance at ${safeKeyLevel.toFixed(priceDecimals)}`
      };
    }

    // 5. Continuation Check (Expanding further above prior highs)
    const recentHighs = candles.slice(len - 5, len - 1).map(c => c.high);
    const maxRecentHigh = Math.max(...recentHighs);
    if (currentPrice > maxRecentHigh && currentPrice > safeKeyLevel + structuralBuffer * 2.5) {
      const qScore = Math.min(98, 80 + (volumeConfirmed ? 15 : 5));
      return {
        stage: 'CONTINUATION',
        classification: 'CONFIRMED_CONTINUATION',
        levelPrice: safeKeyLevel,
        levelType: type,
        isConfirmed: true,
        breakoutDistancePct,
        volumeConfirmed,
        qualityScore: qScore,
        details: `Continuation: Bullish expansion continuing beyond ${safeKeyLevel.toFixed(priceDecimals)} (+${breakoutDistancePct.toFixed(2)}%)`
      };
    }

    // 6. Breakout Confirmed (Decisive body close above level with volume/bullish conviction)
    if (currentCandle.close > safeKeyLevel + structuralBuffer && (currentCandle.close > currentCandle.open || volumeConfirmed)) {
      const qScore = Math.min(92, 70 + (volumeConfirmed ? 20 : 5));
      return {
        stage: 'BREAKOUT_CONFIRMED',
        classification: 'GENUINE_BREAKOUT',
        levelPrice: safeKeyLevel,
        levelType: type,
        isConfirmed: true,
        breakoutDistancePct,
        volumeConfirmed,
        qualityScore: qScore,
        details: `Breakout Confirmed: Candle closed above resistance ${safeKeyLevel.toFixed(priceDecimals)} with conviction`
      };
    }

    // 7. Breakout (Wick or initial breach, but close is right at the boundary)
    if (currentCandle.high > safeKeyLevel && currentCandle.close >= safeKeyLevel - (structuralBuffer * 0.3)) {
      return {
        stage: 'BREAKOUT',
        classification: 'POTENTIAL_BREAKOUT',
        levelPrice: safeKeyLevel,
        levelType: type,
        isConfirmed: false,
        breakoutDistancePct,
        volumeConfirmed,
        qualityScore: 50,
        details: `Breakout in progress: Testing through resistance level ${safeKeyLevel.toFixed(priceDecimals)}`
      };
    }

    // 8. Pre-breakout compression
    return {
      stage: 'PRE_BREAKOUT',
      classification: 'POTENTIAL_BREAKOUT',
      levelPrice: safeKeyLevel,
      levelType: type,
      isConfirmed: false,
      breakoutDistancePct,
      volumeConfirmed,
      qualityScore: 40,
      details: `Pre-breakout: Consolidating beneath resistance ${safeKeyLevel.toFixed(priceDecimals)}`
    };
  } else {
    // SUPPORT / BREAKDOWN LOGIC
    // 1. Failed Breakdown Check
    if (prevCandle.close < safeKeyLevel && currentCandle.close > safeKeyLevel + structuralBuffer) {
      return {
        stage: 'FAILED_BREAKOUT',
        classification: 'FAILED_BREAKOUT',
        levelPrice: safeKeyLevel,
        levelType: type,
        isConfirmed: false,
        breakoutDistancePct,
        volumeConfirmed,
        qualityScore: 15,
        details: `Failed Breakdown: Prior bar broke below ${safeKeyLevel.toFixed(priceDecimals)}, but price immediately reclaimed support`
      };
    }

    // 2. Fake Breakdown / Bear Trap (Wicked below support but closed back above with lower shadow)
    const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
    const body = Math.abs(currentCandle.close - currentCandle.open);
    if (currentCandle.low < safeKeyLevel - structuralBuffer && currentCandle.close > safeKeyLevel && lowerWick >= body * 0.6) {
      return {

        stage: 'FAILED_BREAKOUT',
        classification: 'FAKE_BREAKOUT',
        levelPrice: safeKeyLevel,
        levelType: type,
        isConfirmed: false,
        breakoutDistancePct,
        volumeConfirmed,
        qualityScore: 20,
        details: `Fake Breakdown (Bear Trap): Price wicked below ${safeKeyLevel.toFixed(priceDecimals)} but absorbed heavily back above`
      };
    }


    // 3. Retest Confirmed Check
    if (
      priorCandles.some(c => c.close < safeKeyLevel) &&
      currentCandle.high >= safeKeyLevel - retestBuffer &&
      currentCandle.high <= safeKeyLevel + retestBuffer &&
      currentCandle.close < safeKeyLevel &&
      currentCandle.close <= currentCandle.open
    ) {
      const qScore = Math.min(95, 75 + (volumeConfirmed ? 15 : 5));
      return {
        stage: 'RETEST_CONFIRMED',
        classification: 'BREAKOUT_RETEST',
        levelPrice: safeKeyLevel,
        levelType: type,
        isConfirmed: true,
        breakoutDistancePct,
        volumeConfirmed,
        qualityScore: qScore,
        details: `Retest Confirmed: Price rejected broken support at ${safeKeyLevel.toFixed(priceDecimals)} as new resistance`
      };
    }

    // 4. Retest in progress
    if (
      prevCandle.close < safeKeyLevel &&
      currentCandle.high >= safeKeyLevel - retestBuffer &&
      currentCandle.close <= safeKeyLevel + structuralBuffer
    ) {
      return {
        stage: 'RETEST',
        classification: 'BREAKOUT_RETEST',
        levelPrice: safeKeyLevel,
        levelType: type,
        isConfirmed: false,
        breakoutDistancePct,
        volumeConfirmed,
        qualityScore: 60,
        details: `Retest in Progress: Price testing previous support at ${safeKeyLevel.toFixed(priceDecimals)}`
      };
    }

    // 5. Continuation
    const recentLows = candles.slice(len - 5, len - 1).map(c => c.low);
    const minRecentLow = Math.min(...recentLows);
    if (currentPrice < minRecentLow && currentPrice < safeKeyLevel - structuralBuffer * 2.5) {
      const qScore = Math.min(98, 80 + (volumeConfirmed ? 15 : 5));
      return {
        stage: 'CONTINUATION',
        classification: 'CONFIRMED_CONTINUATION',
        levelPrice: safeKeyLevel,
        levelType: type,
        isConfirmed: true,
        breakoutDistancePct,
        volumeConfirmed,
        qualityScore: qScore,
        details: `Continuation: Bearish breakdown continuing below ${safeKeyLevel.toFixed(priceDecimals)} (-${breakoutDistancePct.toFixed(2)}%)`
      };
    }

    // 6. Breakout Confirmed
    if (currentCandle.close < safeKeyLevel - structuralBuffer && (currentCandle.close < currentCandle.open || volumeConfirmed)) {
      const qScore = Math.min(92, 70 + (volumeConfirmed ? 20 : 5));
      return {
        stage: 'BREAKOUT_CONFIRMED',
        classification: 'GENUINE_BREAKOUT',
        levelPrice: safeKeyLevel,
        levelType: type,
        isConfirmed: true,
        breakoutDistancePct,
        volumeConfirmed,
        qualityScore: qScore,
        details: `Breakdown Confirmed: Candle closed below support ${safeKeyLevel.toFixed(priceDecimals)} with conviction`
      };
    }

    // 7. Breakout
    if (currentCandle.low < safeKeyLevel && currentCandle.close <= safeKeyLevel + (structuralBuffer * 0.3)) {
      return {
        stage: 'BREAKOUT',
        classification: 'POTENTIAL_BREAKOUT',
        levelPrice: safeKeyLevel,
        levelType: type,
        isConfirmed: false,
        breakoutDistancePct,
        volumeConfirmed,
        qualityScore: 50,
        details: `Breakdown in progress: Piercing support level ${safeKeyLevel.toFixed(priceDecimals)}`
      };
    }

    // 8. Pre-breakout
    return {
      stage: 'PRE_BREAKOUT',
      classification: 'POTENTIAL_BREAKOUT',
      levelPrice: safeKeyLevel,
      levelType: type,
      isConfirmed: false,
      breakoutDistancePct,
      volumeConfirmed,
      qualityScore: 40,
      details: `Pre-breakdown: Consolidating above support ${safeKeyLevel.toFixed(priceDecimals)}`
    };
  }
}
