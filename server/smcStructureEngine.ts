import { Candle } from './cryptoService';
import {
  FairValueGap,
  OrderBlock,
  BreakerBlock,
  JudasSwingAnalysis,
  SMCStructureReport
} from '../src/types/crypto';

/**
 * SMC / ICT Market Structure Engine
 * Deterministic detection of Fair Value Gaps (FVG), Order Blocks (OB), Breaker Blocks (BB),
 * BOS / CHOCH, session Judas swings, and multi-timeframe structural confluence.
 */
export function analyzeSMCStructure(
  candles: Candle[],
  timeframe: string = '1h',
  multiTimeframeCandles?: { [tf: string]: Candle[] }
): SMCStructureReport {
  if (!candles || candles.length < 10) {
    return {
      structureType: 'NONE',
      structureBias: 'NEUTRAL',
      fvgs: [],
      orderBlocks: [],
      breakerBlocks: [],
      bosCount: 0,
      chochCount: 0,
      judasSwing: {
        detected: false,
        session: 'NONE',
        sessionName: 'None',
        sweepDirection: 'NONE',
        sweepLevel: 0,
        bias: 'NEUTRAL',
        details: 'Insufficient candle data for SMC analysis.'
      },
      multiTimeframeAligned: false,
      confluenceSummary: 'Insufficient data for market structure analysis.'
    };
  }

  const currentPrice = candles[candles.length - 1].close;

  // 1. Detect Fair Value Gaps (FVGs)
  const fvgs: FairValueGap[] = [];
  for (let i = 2; i < candles.length; i++) {
    const cPrev = candles[i - 2];
    const cMid = candles[i - 1];
    const cCurr = candles[i];

    // Bullish FVG: Low of candle i > High of candle i - 2
    if (cCurr.low > cPrev.high && cMid.close > cMid.open) {
      const top = cCurr.low;
      const bottom = cPrev.high;
      const midpoint = (top + bottom) / 2;

      // Check subsequent mitigation
      let status: 'UNMITIGATED' | 'PARTIALLY_MITIGATED' | 'MITIGATED' = 'UNMITIGATED';
      let lowestPost = top;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low < lowestPost) lowestPost = candles[j].low;
      }

      if (lowestPost <= bottom) {
        status = 'MITIGATED';
      } else if (lowestPost < top) {
        status = 'PARTIALLY_MITIGATED';
      }

      fvgs.push({
        id: `fvg_bull_${i}_${timeframe}`,
        type: 'BULLISH',
        top,
        bottom,
        midpoint,
        status,
        candleIndex: i - 1,
        timeframe,
        mitigationPercentage: status === 'MITIGATED' ? 100 : status === 'PARTIALLY_MITIGATED' ? ((top - lowestPost) / (top - bottom)) * 100 : 0
      });
    }

    // Bearish FVG: High of candle i < Low of candle i - 2
    if (cCurr.high < cPrev.low && cMid.close < cMid.open) {
      const top = cPrev.low;
      const bottom = cCurr.high;
      const midpoint = (top + bottom) / 2;

      let status: 'UNMITIGATED' | 'PARTIALLY_MITIGATED' | 'MITIGATED' = 'UNMITIGATED';
      let highestPost = bottom;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].high > highestPost) highestPost = candles[j].high;
      }

      if (highestPost >= top) {
        status = 'MITIGATED';
      } else if (highestPost > bottom) {
        status = 'PARTIALLY_MITIGATED';
      }

      fvgs.push({
        id: `fvg_bear_${i}_${timeframe}`,
        type: 'BEARISH',
        top,
        bottom,
        midpoint,
        status,
        candleIndex: i - 1,
        timeframe,
        mitigationPercentage: status === 'MITIGATED' ? 100 : status === 'PARTIALLY_MITIGATED' ? ((highestPost - bottom) / (top - bottom)) * 100 : 0
      });
    }
  }

  // 2. Identify Swing Pivots & BOS / CHOCH (Displacement-Filtered)
  const swingHighs: { index: number; price: number }[] = [];
  const swingLows: { index: number; price: number }[] = [];
  const pivotPeriod = candles.length >= 25 ? 5 : 3;

  for (let i = pivotPeriod; i < candles.length - pivotPeriod; i++) {
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= pivotPeriod; k++) {
      if (candles[i - k].high >= candles[i].high || candles[i + k].high >= candles[i].high) isHigh = false;
      if (candles[i - k].low <= candles[i].low || candles[i + k].low <= candles[i].low) isLow = false;
    }
    if (isHigh) swingHighs.push({ index: i, price: candles[i].high });
    if (isLow) swingLows.push({ index: i, price: candles[i].low });
  }

  let bosCount = 0;
  let chochCount = 0;
  let structureType: 'BOS' | 'CHOCH' | 'RANGING' | 'EXPANSION' | 'NONE' = 'NONE';
  let structureBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';

  // Check recent break of swing points with mandatory structural displacement (not minor noise)
  if (swingHighs.length > 0 && swingLows.length > 0) {
    const lastSwingHigh = swingHighs[swingHighs.length - 1];
    const lastSwingLow = swingLows[swingLows.length - 1];
    const prevSwingHigh = swingHighs.length > 1 ? swingHighs[swingHighs.length - 2] : null;
    const prevSwingLow = swingLows.length > 1 ? swingLows[swingLows.length - 2] : null;
    const lastCandle = candles[candles.length - 1];
    const minDisplacement = currentPrice * 0.003; // Minimum 0.3% displacement beyond swing level

    if (currentPrice > lastSwingHigh.price + minDisplacement && lastCandle.close > lastSwingHigh.price) {
      if (prevSwingHigh && lastSwingHigh.price > prevSwingHigh.price) {
        structureType = 'BOS';
        structureBias = 'BULLISH';
        bosCount++;
      } else {
        structureType = 'CHOCH';
        structureBias = 'BULLISH';
        chochCount++;
      }
    } else if (currentPrice < lastSwingLow.price - minDisplacement && lastCandle.close < lastSwingLow.price) {
      if (prevSwingLow && lastSwingLow.price < prevSwingLow.price) {
        structureType = 'BOS';
        structureBias = 'BEARISH';
        bosCount++;
      } else {
        structureType = 'CHOCH';
        structureBias = 'BEARISH';
        chochCount++;
      }
    } else {
      structureType = 'RANGING';
      structureBias = 'NEUTRAL';
    }
  } else if (candles.length >= 5) {
    const firstClose = candles[0].close;
    const lastClose = candles[candles.length - 1].close;
    if (lastClose > firstClose * 1.01) {
      structureType = 'EXPANSION';
      structureBias = 'BULLISH';
    } else if (lastClose < firstClose * 0.99) {
      structureType = 'EXPANSION';
      structureBias = 'BEARISH';
    } else {
      structureType = 'RANGING';
      structureBias = 'NEUTRAL';
    }
  }

  // 3. Detect Order Blocks (OB) & Breaker Blocks (BB)
  const orderBlocks: OrderBlock[] = [];
  const breakerBlocks: BreakerBlock[] = [];

  for (let i = 3; i < candles.length - 3; i++) {
    const c = candles[i];
    const next1 = candles[i + 1];
    const next2 = candles[i + 2];

    // Bullish OB: Bearish candle followed by strong upward impulse
    if (c.close < c.open && next1.close > next1.open && next2.close > next2.open) {
      const displacement = (next2.close - c.low) / c.low;
      if (displacement >= 0.015) {
        const top = Math.max(c.open, c.close);
        const bottom = c.low;
        let status: 'ACTIVE' | 'TESTED' | 'INVALIDATED' = 'ACTIVE';

        for (let j = i + 3; j < candles.length; j++) {
          if (candles[j].close < bottom) {
            status = 'INVALIDATED';
            // When a Bullish OB is invalidated to the downside, it becomes a Bearish Breaker Block
            breakerBlocks.push({
              id: `bb_bear_${i}_${timeframe}`,
              type: 'BEARISH',
              top: c.high,
              bottom: c.low,
              originOBPrice: (top + bottom) / 2,
              status: currentPrice > c.high ? 'MITIGATED' : 'ACTIVE',
              timeframe
            });
            break;
          } else if (candles[j].low <= top) {
            status = 'TESTED';
          }
        }

        if (status !== 'INVALIDATED') {
          orderBlocks.push({
            id: `ob_bull_${i}_${timeframe}`,
            type: 'BULLISH',
            top,
            bottom,
            midpoint: (top + bottom) / 2,
            status,
            strength: Math.min(100, Math.round(displacement * 2000)),
            candleIndex: i,
            timeframe,
            volume: c.volume
          });
        }
      }
    }

    // Bearish OB: Bullish candle followed by strong downward impulse
    if (c.close > c.open && next1.close < next1.open && next2.close < next2.open) {
      const displacement = (c.high - next2.close) / c.high;
      if (displacement >= 0.015) {
        const top = c.high;
        const bottom = Math.min(c.open, c.close);
        let status: 'ACTIVE' | 'TESTED' | 'INVALIDATED' = 'ACTIVE';

        for (let j = i + 3; j < candles.length; j++) {
          if (candles[j].close > top) {
            status = 'INVALIDATED';
            // When a Bearish OB is invalidated upwards, it becomes a Bullish Breaker Block
            breakerBlocks.push({
              id: `bb_bull_${i}_${timeframe}`,
              type: 'BULLISH',
              top: c.high,
              bottom: c.low,
              originOBPrice: (top + bottom) / 2,
              status: currentPrice < c.low ? 'MITIGATED' : 'ACTIVE',
              timeframe
            });
            break;
          } else if (candles[j].high >= bottom) {
            status = 'TESTED';
          }
        }

        if (status !== 'INVALIDATED') {
          orderBlocks.push({
            id: `ob_bear_${i}_${timeframe}`,
            type: 'BEARISH',
            top,
            bottom,
            midpoint: (top + bottom) / 2,
            status,
            strength: Math.min(100, Math.round(displacement * 2000)),
            candleIndex: i,
            timeframe,
            volume: c.volume
          });
        }
      }
    }
  }

  // Find nearest active FVG, OB, and Breaker Block
  const activeFvgs = fvgs.filter(f => f.status !== 'MITIGATED');
  const activeObs = orderBlocks.filter(o => o.status !== 'INVALIDATED');
  const activeBbs = breakerBlocks.filter(b => b.status === 'ACTIVE');

  const nearestFvg = activeFvgs.length > 0
    ? activeFvgs.reduce((prev, curr) => Math.abs(curr.midpoint - currentPrice) < Math.abs(prev.midpoint - currentPrice) ? curr : prev)
    : undefined;

  const nearestOrderBlock = activeObs.length > 0
    ? activeObs.reduce((prev, curr) => Math.abs(curr.midpoint - currentPrice) < Math.abs(prev.midpoint - currentPrice) ? curr : prev)
    : undefined;

  const nearestBreakerBlock = activeBbs.length > 0
    ? activeBbs.reduce((prev, curr) => Math.abs(((curr.top + curr.bottom) / 2) - currentPrice) < Math.abs(((prev.top + prev.bottom) / 2) - currentPrice) ? curr : prev)
    : undefined;

  // 4. London / New York Session Manipulation & Judas Swing Detection
  const judasSwing = detectJudasSwing(candles);

  // 5. Multi-Timeframe Structural Validation
  let multiTimeframeAligned = false;
  if (multiTimeframeCandles && (multiTimeframeCandles['4h'] || multiTimeframeCandles['1d'])) {
    const higherTfCandles = multiTimeframeCandles['4h'] || multiTimeframeCandles['1d'];
    if (higherTfCandles && higherTfCandles.length >= 10) {
      const higherLast = higherTfCandles[higherTfCandles.length - 1].close;
      const higherPrev = higherTfCandles[higherTfCandles.length - 5].close;
      const higherBullish = higherLast > higherPrev;
      const higherBearish = higherLast < higherPrev;

      if ((structureBias === 'BULLISH' && higherBullish) || (structureBias === 'BEARISH' && higherBearish)) {
        multiTimeframeAligned = true;
      }
    }
  }

  // Construct readable confluence summary
  const summaryParts: string[] = [];
  if (structureType !== 'NONE') {
    summaryParts.push(`${structureType} (${structureBias})`);
  }
  if (nearestOrderBlock) {
    summaryParts.push(`Nearest ${nearestOrderBlock.type} OB @ $${nearestOrderBlock.midpoint.toFixed(2)} (${nearestOrderBlock.status})`);
  }
  if (nearestFvg) {
    summaryParts.push(`${nearestFvg.type} FVG @ $${nearestFvg.midpoint.toFixed(2)} (${nearestFvg.status})`);
  }
  if (nearestBreakerBlock) {
    summaryParts.push(`${nearestBreakerBlock.type} Breaker Block @ $${((nearestBreakerBlock.top + nearestBreakerBlock.bottom) / 2).toFixed(2)}`);
  }
  if (judasSwing.detected) {
    summaryParts.push(`${judasSwing.sessionName} Judas Swing Sweep detected`);
  }

  const confluenceSummary = summaryParts.length > 0
    ? summaryParts.join(' | ')
    : 'No clear institutional market structure confluence.';

  return {
    structureType,
    structureBias,
    fvgs,
    nearestFvg,
    orderBlocks,
    nearestOrderBlock,
    breakerBlocks,
    nearestBreakerBlock,
    bosCount,
    chochCount,
    judasSwing,
    multiTimeframeAligned,
    confluenceSummary
  };
}

/**
 * Detects Session Manipulation / Judas Swing
 * Checks if price swept the Asian Range during London Open (07:00-10:00 UTC) or NY Open (13:00-16:00 UTC)
 * and immediately triggered sharp displacement in the opposite direction.
 */
function detectJudasSwing(candles: Candle[]): JudasSwingAnalysis {
  if (candles.length < 15) {
    return {
      detected: false,
      session: 'NONE',
      sessionName: 'None',
      sweepDirection: 'NONE',
      sweepLevel: 0,
      bias: 'NEUTRAL',
      details: 'Insufficient candle volume to establish session ranges.'
    };
  }

  const lastCandle = candles[candles.length - 1];
  const date = new Date(lastCandle.timestamp);
  const hour = date.getUTCHours();

  let session: 'LONDON' | 'NEW_YORK' | 'NONE' = 'NONE';
  let sessionName = 'None';

  if (hour >= 7 && hour <= 10) {
    session = 'LONDON';
    sessionName = 'London Open';
  } else if (hour >= 13 && hour <= 16) {
    session = 'NEW_YORK';
    sessionName = 'New York Open';
  }

  if (session === 'NONE') {
    return {
      detected: false,
      session: 'NONE',
      sessionName: 'Off-Session',
      sweepDirection: 'NONE',
      sweepLevel: 0,
      bias: 'NEUTRAL',
      details: 'Current time is outside standard London/NY opening manipulation windows.'
    };
  }

  // Find Asian Session Range (00:00 - 07:00 UTC of recent day)
  const asianCandles = candles.filter(c => {
    const h = new Date(c.timestamp).getUTCHours();
    return h >= 0 && h < 7;
  });

  if (asianCandles.length < 3) {
    return {
      detected: false,
      session,
      sessionName,
      sweepDirection: 'NONE',
      sweepLevel: 0,
      bias: 'NEUTRAL',
      details: 'Asian session range not reliably established.'
    };
  }

  const asianHigh = Math.max(...asianCandles.map(c => c.high));
  const asianLow = Math.min(...asianCandles.map(c => c.low));

  // Check recent 3 candles in the active session
  const recent3 = candles.slice(-3);
  const maxHighRecent = Math.max(...recent3.map(c => c.high));
  const minLowRecent = Math.min(...recent3.map(c => c.low));
  const currentClose = lastCandle.close;

  // Bullish Judas Swing (Bear Trap): Swept Asian Low and closed back above Asian Low with strong green candle
  if (minLowRecent < asianLow && currentClose > asianLow && lastCandle.close > lastCandle.open) {
    return {
      detected: true,
      session,
      sessionName,
      sweepDirection: 'LOW_SWEEP_REVERSAL_LONG',
      sweepLevel: asianLow,
      bias: 'BULLISH',
      details: `${sessionName} Judas Swing: Swept Asian Session Low ($${asianLow.toFixed(2)}) with immediate displacement upward.`
    };
  }

  // Bearish Judas Swing (Bull Trap): Swept Asian High and closed back below Asian High with strong red candle
  if (maxHighRecent > asianHigh && currentClose < asianHigh && lastCandle.close < lastCandle.open) {
    return {
      detected: true,
      session,
      sessionName,
      sweepDirection: 'HIGH_SWEEP_REVERSAL_SHORT',
      sweepLevel: asianHigh,
      bias: 'BEARISH',
      details: `${sessionName} Judas Swing: Swept Asian Session High ($${asianHigh.toFixed(2)}) with immediate displacement downward.`
    };
  }

  return {
    detected: false,
    session,
    sessionName,
    sweepDirection: 'NONE',
    sweepLevel: 0,
    bias: 'NEUTRAL',
    details: `${sessionName} active; no liquidity sweep reversal detected.`
  };
}
