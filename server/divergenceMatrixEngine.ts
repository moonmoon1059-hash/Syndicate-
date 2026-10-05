import { Candle } from './cryptoService';
import { calculateRSI, calculateMACD } from './technicalAnalysis';
import { DivergenceMatrixReport, SingleDivergence } from '../src/types/crypto';

/**
 * Multi-Timeframe Divergence Matrix Engine
 * Evaluates Regular & Hidden RSI and MACD divergences across timeframes.
 * Acts strictly as supporting evidence and never generates independent trade bias.
 */
export function evaluateDivergenceMatrix(
  candles: Candle[],
  timeframe: string = '1h',
  multiTimeframeCandles?: { [tf: string]: Candle[] }
): DivergenceMatrixReport {
  if (!candles || candles.length < 20) {
    const emptyDiv: SingleDivergence = {
      detected: false,
      type: 'NONE',
      timeframe,
      description: 'Insufficient candles for divergence detection.'
    };
    return {
      rsiDivergence: emptyDiv,
      macdDivergence: emptyDiv,
      mtfConfluenceCount: 0,
      isConfirmed: false,
      summary: 'No divergence detected.'
    };
  }

  const rsiDiv = detectRsiDivergence(candles, timeframe);
  const macdDiv = detectMacdDivergence(candles, timeframe);

  let mtfConfluenceCount = 0;
  if (rsiDiv.detected) mtfConfluenceCount++;
  if (macdDiv.detected) mtfConfluenceCount++;

  // Check additional timeframes if provided
  if (multiTimeframeCandles) {
    for (const [tf, tfCandles] of Object.entries(multiTimeframeCandles)) {
      if (tf !== timeframe && tfCandles.length >= 20) {
        const otherRsi = detectRsiDivergence(tfCandles, tf);
        if (otherRsi.detected) mtfConfluenceCount++;
      }
    }
  }

  const isConfirmed = mtfConfluenceCount >= 2;
  const summaryParts: string[] = [];
  if (rsiDiv.detected) summaryParts.push(`RSI ${rsiDiv.type.replace(/_/g, ' ')} (${rsiDiv.timeframe})`);
  if (macdDiv.detected) summaryParts.push(`MACD ${macdDiv.type.replace(/_/g, ' ')} (${macdDiv.timeframe})`);

  const summary = summaryParts.length > 0
    ? `Divergence Matrix: ${summaryParts.join(' + ')} [Confluences: ${mtfConfluenceCount}]`
    : 'Divergence Matrix: No active RSI or MACD divergences.';

  return {
    rsiDivergence: rsiDiv,
    macdDivergence: macdDiv,
    mtfConfluenceCount,
    isConfirmed,
    summary
  };
}

function detectRsiDivergence(candles: Candle[], timeframe: string): SingleDivergence {
  const closes = candles.map(c => c.close);
  const rsiValues = calculateRSI(closes, 14);
  if (rsiValues.length < 20) {
    return { detected: false, type: 'NONE', timeframe, description: 'RSI calculation unavailable.' };
  }

  // Find recent 2 pivot lows and pivot highs
  const lookback = Math.min(40, candles.length);
  const subsetCandles = candles.slice(-lookback);
  const subsetRsi = rsiValues.slice(-lookback);

  const pivotLows: { index: number; price: number; rsi: number }[] = [];
  const pivotHighs: { index: number; price: number; rsi: number }[] = [];

  for (let i = 2; i < subsetCandles.length - 2; i++) {
    if (subsetCandles[i].low <= subsetCandles[i - 1].low && subsetCandles[i].low <= subsetCandles[i - 2].low &&
        subsetCandles[i].low <= subsetCandles[i + 1].low && subsetCandles[i].low <= subsetCandles[i + 2].low) {
      pivotLows.push({ index: i, price: subsetCandles[i].low, rsi: subsetRsi[i] });
    }
    if (subsetCandles[i].high >= subsetCandles[i - 1].high && subsetCandles[i].high >= subsetCandles[i - 2].high &&
        subsetCandles[i].high >= subsetCandles[i + 1].high && subsetCandles[i].high >= subsetCandles[i + 2].high) {
      pivotHighs.push({ index: i, price: subsetCandles[i].high, rsi: subsetRsi[i] });
    }
  }

  if (pivotLows.length >= 2) {
    const prevLow = pivotLows[pivotLows.length - 2];
    const currLow = pivotLows[pivotLows.length - 1];

    // Regular Bullish: Price Lower Low, RSI Higher Low
    if (currLow.price < prevLow.price * 0.998 && currLow.rsi > prevLow.rsi + 1.5) {
      return {
        detected: true,
        type: 'REGULAR_BULLISH',
        timeframe,
        description: `Regular Bullish RSI Divergence on ${timeframe}: Price Lower Low ($${currLow.price.toFixed(2)}) vs RSI Higher Low (${currLow.rsi.toFixed(1)} vs ${prevLow.rsi.toFixed(1)}).`
      };
    }

    // Hidden Bullish: Price Higher Low, RSI Lower Low (Bullish Continuation)
    if (currLow.price > prevLow.price * 1.002 && currLow.rsi < prevLow.rsi - 1.5) {
      return {
        detected: true,
        type: 'HIDDEN_BULLISH',
        timeframe,
        description: `Hidden Bullish RSI Divergence on ${timeframe}: Price Higher Low ($${currLow.price.toFixed(2)}) vs RSI Lower Low (${currLow.rsi.toFixed(1)} vs ${prevLow.rsi.toFixed(1)}).`
      };
    }
  }

  if (pivotHighs.length >= 2) {
    const prevHigh = pivotHighs[pivotHighs.length - 2];
    const currHigh = pivotHighs[pivotHighs.length - 1];

    // Regular Bearish: Price Higher High, RSI Lower High
    if (currHigh.price > prevHigh.price * 1.002 && currHigh.rsi < prevHigh.rsi - 1.5) {
      return {
        detected: true,
        type: 'REGULAR_BEARISH',
        timeframe,
        description: `Regular Bearish RSI Divergence on ${timeframe}: Price Higher High ($${currHigh.price.toFixed(2)}) vs RSI Lower High (${currHigh.rsi.toFixed(1)} vs ${prevHigh.rsi.toFixed(1)}).`
      };
    }

    // Hidden Bearish: Price Lower High, RSI Higher High (Bearish Continuation)
    if (currHigh.price < prevHigh.price * 0.998 && currHigh.rsi > prevHigh.rsi + 1.5) {
      return {
        detected: true,
        type: 'HIDDEN_BEARISH',
        timeframe,
        description: `Hidden Bearish RSI Divergence on ${timeframe}: Price Lower High ($${currHigh.price.toFixed(2)}) vs RSI Higher High (${currHigh.rsi.toFixed(1)} vs ${prevHigh.rsi.toFixed(1)}).`
      };
    }
  }

  return { detected: false, type: 'NONE', timeframe, description: 'No RSI divergence detected.' };
}

function detectMacdDivergence(candles: Candle[], timeframe: string): SingleDivergence {
  if (candles.length < 20) {
    return { detected: false, type: 'NONE', timeframe, description: 'MACD calculation unavailable.' };
  }

  const closes = candles.map(c => c.close);
  const macdResults = calculateMACD(closes);
  if (!macdResults || !macdResults.histogram || macdResults.histogram.length < 20) {
    return { detected: false, type: 'NONE', timeframe, description: 'MACD calculation unavailable.' };
  }

  const lookback = Math.min(30, candles.length);
  const subsetCandles = candles.slice(-lookback);
  const subsetHist = macdResults.histogram.slice(-lookback);

  const firstPrice = subsetCandles[0].close;
  const lastPrice = subsetCandles[subsetCandles.length - 1].close;
  const firstHist = subsetHist[0];
  const lastHist = subsetHist[subsetHist.length - 1];

  if (lastPrice < firstPrice * 0.98 && lastHist > firstHist && lastHist > -0.5) {
    return {
      detected: true,
      type: 'REGULAR_BULLISH',
      timeframe,
      description: `Regular Bullish MACD Divergence on ${timeframe}: Histogram contracting towards zero while price depressed.`
    };
  }

  if (lastPrice > firstPrice * 1.02 && lastHist < firstHist && lastHist < 0.5) {
    return {
      detected: true,
      type: 'REGULAR_BEARISH',
      timeframe,
      description: `Regular Bearish MACD Divergence on ${timeframe}: Momentum decelerating while price pushed to fresh highs.`
    };
  }

  return { detected: false, type: 'NONE', timeframe, description: 'No MACD divergence detected.' };
}
