import { Candle } from './cryptoService';
import { calculateEMA, calculateRSI, calculateATR, calculateRVOL } from './technicalAnalysis';
import {
  MarketCycleType,
  MarketCycleTransition,
  MarketCycleAnalysis,
  WyckoffEventRecord,
  EffortVsResultAnalysis,
  EffortVsResultClassification,
  CycleTransitionRecord,
  MultiTimeframeCycleContext
} from '../src/types/crypto';

export interface MarketCycleContextOptions {
  multiTimeframeCandles?: { [tf: string]: Candle[] };
  smcReport?: any;
  liquidityZones?: any[];
  marketRegime?: any;
  sectorRotation?: any;
  btcDominance?: any;
  derivatives?: any;
  evaluationTimestamp?: number;
}

/**
 * Deterministic Effort vs Result (Wyckoff Volume-Spread Analysis / VSA)
 * Strictly measures volume effort relative to price progress/spread without hindsight.
 */
export function evaluateEffortVsResult(candles: Candle[], windowLen: number = 20): EffortVsResultAnalysis {
  if (!candles || candles.length < 5) {
    return {
      classification: 'UNKNOWN',
      volumeRatio: 1.0,
      spreadRatio: 1.0,
      effortScore: 50,
      resultScore: 50,
      interpretation: 'Insufficient bars to evaluate effort vs result.',
      details: ['Candle count below minimum threshold for VSA evaluation']
    };
  }

  const n = candles.length;
  const current = candles[n - 1];
  const prior = candles[n - 2];

  // Calculate moving averages for volume and range (excluding the current candle to avoid dilution)
  const baselineCandles = candles.slice(Math.max(0, n - windowLen - 1), n - 1);
  const avgVol = (baselineCandles.reduce((sum, c) => sum + c.volume, 0) / (baselineCandles.length || 1)) || 1;
  const spreads = baselineCandles.map(c => Math.abs(c.high - c.low));
  const avgSpread = (spreads.reduce((sum, s) => sum + s, 0) / (spreads.length || 1)) || 1;

  const currentSpread = Math.abs(current.high - current.low);
  const currentBody = Math.abs(current.close - current.open);
  const volumeRatio = Number((current.volume / avgVol).toFixed(2));
  const spreadRatio = Number((currentSpread / avgSpread).toFixed(2));
  const bodyRatio = currentSpread > 0 ? currentBody / currentSpread : 0.5;

  const isUpClose = current.close >= prior.close;
  const upperWick = current.high - Math.max(current.open, current.close);
  const lowerWick = Math.min(current.open, current.close) - current.low;
  const upperWickPct = currentSpread > 0 ? upperWick / currentSpread : 0;
  const lowerWickPct = currentSpread > 0 ? lowerWick / currentSpread : 0;

  let classification: EffortVsResultClassification = 'NORMAL_EFFORT_RESULT';
  let interpretation = 'Volume effort is commensurate with price spread expansion.';
  const details: string[] = [];

  const effortScore = Math.min(100, Math.round(volumeRatio * 50));
  const resultScore = Math.min(100, Math.round(spreadRatio * 50));

  // 1. ABSORPTION: High volume with narrow spread (Effort without immediate price result)
  if (volumeRatio >= 1.4 && spreadRatio <= 0.85) {
    classification = 'ABSORPTION';
    interpretation = isUpClose
      ? 'High volume with compressed price spread indicates professional supply absorption near support/resistance.'
      : 'Heavy down-volume with small downward spread indicates passive buying absorbing selling pressure.';
    details.push(`High Effort (Volume ${volumeRatio}x avg) vs Low Result (Spread ${spreadRatio}x avg)`);
    details.push('Institutional absorption characteristic: Order book liquidity containing price expansion');
  }
  // 2. CLIMAX EXHAUSTION: Extreme volume with wide spread or rejection wick
  else if (volumeRatio >= 1.8 && (spreadRatio >= 1.4 || upperWickPct > 0.35 || lowerWickPct > 0.35)) {
    classification = 'CLIMAX_EXHAUSTION';
    interpretation = isUpClose
      ? 'Ultra-high climactic volume with upper wick indicates buying climax and exhaustion of aggressive demand.'
      : 'Panic selling volume with long lower rejection wick indicates selling climax exhaustion.';
    details.push(`Climactic Effort (Volume ${volumeRatio}x avg) with exhaustion spread characteristics`);
  }
  // 3. NO SUPPLY PULLBACK: Low volume on a downward retracement
  else if (!isUpClose && volumeRatio <= 0.75 && spreadRatio <= 1.25) {
    classification = 'NO_SUPPLY_PULLBACK';
    interpretation = 'Low-volume downward retracement demonstrates lack of active seller interest (No Supply).';
    details.push(`Low Effort (Volume ${volumeRatio}x avg) during downward pullback indicates lack of genuine selling pressure`);
  }
  // 4. NO DEMAND BOUNCE: Low volume on an upward bounce
  else if (isUpClose && volumeRatio <= 0.75 && spreadRatio <= 1.25) {
    classification = 'NO_DEMAND_BOUNCE';
    interpretation = 'Low-volume upward reaction demonstrates lack of active buyer interest (No Demand).';
    details.push(`Low Effort (Volume ${volumeRatio}x avg) during upward bounce indicates lack of genuine institutional demand`);
  }
  // 5. EFFORT REWARDED: High volume with proportional wide spread expansion in direction of move
  else if (volumeRatio >= 1.3 && spreadRatio >= 1.3 && bodyRatio >= 0.5) {
    classification = 'EFFORT_REWARDED';
    interpretation = isUpClose
      ? 'High-volume bullish impulse with wide body demonstrates decisive buying control.'
      : 'High-volume bearish impulse with wide body demonstrates decisive selling control.';
    details.push(`Effort matched by Result: Volume ${volumeRatio}x avg accompanied by ${spreadRatio}x spread expansion`);
  } else {
    details.push(`Standard equilibrium: Volume ${volumeRatio}x avg, Spread ${spreadRatio}x avg`);
  }

  return {
    classification,
    volumeRatio,
    spreadRatio,
    effortScore,
    resultScore,
    interpretation,
    details
  };
}

/**
 * Deterministic Wyckoff Accumulation & Distribution Event Detectors
 */
export function detectWyckoffEvents(
  candles: Candle[],
  rangeHigh: number,
  rangeLow: number,
  rvol: number
): {
  accumulation: Record<string, WyckoffEventRecord>;
  distribution: Record<string, WyckoffEventRecord>;
  activeEvent?: WyckoffEventRecord;
} {
  const n = candles.length;
  const current = candles[n - 1];
  const prior = n > 1 ? candles[n - 2] : current;

  // Default empty event records
  const accumulation: Record<string, WyckoffEventRecord> = {
    PS: { eventType: 'PS', name: 'Preliminary Support', category: 'ACCUMULATION', status: 'NOT_DETECTED', detected: false, confidence: 0, isConfirmed: false, evidence: 'No PS detected' },
    SC: { eventType: 'SC', name: 'Selling Climax', category: 'ACCUMULATION', status: 'NOT_DETECTED', detected: false, confidence: 0, isConfirmed: false, evidence: 'No SC detected' },
    AR: { eventType: 'AR', name: 'Automatic Rally', category: 'ACCUMULATION', status: 'NOT_DETECTED', detected: false, confidence: 0, isConfirmed: false, evidence: 'No AR detected' },
    ST: { eventType: 'ST', name: 'Secondary Test', category: 'ACCUMULATION', status: 'NOT_DETECTED', detected: false, confidence: 0, isConfirmed: false, evidence: 'No ST detected' },
    SPRING: { eventType: 'SPRING', name: 'Spring / Shakeout', category: 'ACCUMULATION', status: 'NOT_DETECTED', detected: false, confidence: 0, isConfirmed: false, evidence: 'No Spring detected' },
    SOS: { eventType: 'SOS', name: 'Sign of Strength', category: 'ACCUMULATION', status: 'NOT_DETECTED', detected: false, confidence: 0, isConfirmed: false, evidence: 'No SOS detected' },
    LPS: { eventType: 'LPS', name: 'Last Point of Support', category: 'ACCUMULATION', status: 'NOT_DETECTED', detected: false, confidence: 0, isConfirmed: false, evidence: 'No LPS detected' }
  };

  const distribution: Record<string, WyckoffEventRecord> = {
    PSY: { eventType: 'PSY', name: 'Preliminary Supply', category: 'DISTRIBUTION', status: 'NOT_DETECTED', detected: false, confidence: 0, isConfirmed: false, evidence: 'No PSY detected' },
    BC: { eventType: 'BC', name: 'Buying Climax', category: 'DISTRIBUTION', status: 'NOT_DETECTED', detected: false, confidence: 0, isConfirmed: false, evidence: 'No BC detected' },
    AR: { eventType: 'AR', name: 'Automatic Reaction', category: 'DISTRIBUTION', status: 'NOT_DETECTED', detected: false, confidence: 0, isConfirmed: false, evidence: 'No AR detected' },
    ST: { eventType: 'ST', name: 'Secondary Test', category: 'DISTRIBUTION', status: 'NOT_DETECTED', detected: false, confidence: 0, isConfirmed: false, evidence: 'No ST detected' },
    UTAD: { eventType: 'UTAD', name: 'Upthrust / UTAD', category: 'DISTRIBUTION', status: 'NOT_DETECTED', detected: false, confidence: 0, isConfirmed: false, evidence: 'No UTAD detected' },
    SOW: { eventType: 'SOW', name: 'Sign of Weakness', category: 'DISTRIBUTION', status: 'NOT_DETECTED', detected: false, confidence: 0, isConfirmed: false, evidence: 'No SOW detected' },
    LPSY: { eventType: 'LPSY', name: 'Last Point of Supply', category: 'DISTRIBUTION', status: 'NOT_DETECTED', detected: false, confidence: 0, isConfirmed: false, evidence: 'No LPSY detected' }
  };

  if (!candles || candles.length < 15) {
    return { accumulation, distribution };
  }

  // Calculate established baseline range from earlier bars in the window (excluding the last 3 bars)
  const baselineWindow = candles.slice(Math.max(0, n - 25), Math.max(5, n - 3));
  const establishedRangeHigh = baselineWindow.length > 0 ? Math.max(...baselineWindow.map(c => c.high)) : rangeHigh;
  const establishedRangeLow = baselineWindow.length > 0 ? Math.min(...baselineWindow.map(c => c.low)) : rangeLow;
  const rangeSpan = Math.max(0.0001, establishedRangeHigh - establishedRangeLow);

  let activeEvent: WyckoffEventRecord | undefined;

  // Scan recent window (last 15 bars) for structural events
  const windowLen = Math.min(15, n);
  const recentBars = candles.slice(n - windowLen);
  const avgVol = candles.reduce((acc, c) => acc + c.volume, 0) / candles.length || 1;

  for (let i = 0; i < recentBars.length; i++) {
    const bar = recentBars[i];
    const barRvol = bar.volume / avgVol;
    const barSpread = Math.abs(bar.high - bar.low);
    const lowerWickPct = barSpread > 0 ? (Math.min(bar.open, bar.close) - bar.low) / barSpread : 0;
    const upperWickPct = barSpread > 0 ? (bar.high - Math.max(bar.open, bar.close)) / barSpread : 0;

    // 1. SPRING / SHAKEOUT: Pierced established range low and closed back above within 1-2 bars
    if ((bar.low < establishedRangeLow * 0.999 || (bar.low <= rangeLow && lowerWickPct >= 0.3)) && bar.close >= establishedRangeLow * 0.995 && lowerWickPct >= 0.25) {
      accumulation.SPRING = {
        eventType: 'SPRING',
        name: 'Spring / Terminal Shakeout',
        category: 'ACCUMULATION',
        status: 'DETECTED',
        detected: true,
        timestamp: bar.timestamp,
        price: bar.low,
        volumeRatio: Number(barRvol.toFixed(2)),
        confidence: 88,
        isConfirmed: current.close >= establishedRangeLow * 0.995,
        evidence: `Price dipped below range base (${establishedRangeLow.toFixed(4)}) to ${bar.low.toFixed(4)} and reclaimed with strong lower rejection wick.`
      };
      if (!activeEvent || i === recentBars.length - 1) activeEvent = accumulation.SPRING;
    }

    // 2. SELLING CLIMAX (SC): Heavy volume spike at range low with long wick
    if (bar.low <= establishedRangeLow * 1.008 && barRvol >= 1.6 && lowerWickPct >= 0.25) {
      accumulation.SC = {
        eventType: 'SC',
        name: 'Selling Climax',
        category: 'ACCUMULATION',
        status: 'DETECTED',
        detected: true,
        timestamp: bar.timestamp,
        price: bar.low,
        volumeRatio: Number(barRvol.toFixed(2)),
        confidence: 85,
        isConfirmed: true,
        evidence: `Massive volume spike (${barRvol.toFixed(1)}x RVOL) at low boundary (${bar.low.toFixed(4)}) establishing initial climax support.`
      };
    }

    // 3. SIGN OF STRENGTH (SOS): Strong high-volume bullish candle breaking towards or above range high
    if (bar.close > establishedRangeLow + rangeSpan * 0.65 && bar.close > bar.open && barRvol >= 1.25) {
      accumulation.SOS = {
        eventType: 'SOS',
        name: 'Sign of Strength',
        category: 'ACCUMULATION',
        status: 'DETECTED',
        detected: true,
        timestamp: bar.timestamp,
        price: bar.close,
        volumeRatio: Number(barRvol.toFixed(2)),
        confidence: 82,
        isConfirmed: true,
        evidence: `Decisive expansion bar towards range high on expanding volume (${barRvol.toFixed(1)}x RVOL).`
      };
      if (!activeEvent || i === recentBars.length - 1) activeEvent = accumulation.SOS;
    }

    // 4. LAST POINT OF SUPPORT (LPS): Low volume pullback holding above range midpoint
    if (bar.low >= establishedRangeLow + rangeSpan * 0.3 && bar.low < establishedRangeHigh && barRvol <= 0.85 && current.close > bar.low) {
      accumulation.LPS = {
        eventType: 'LPS',
        name: 'Last Point of Support',
        category: 'ACCUMULATION',
        status: 'DETECTED',
        detected: true,
        timestamp: bar.timestamp,
        price: bar.low,
        volumeRatio: Number(barRvol.toFixed(2)),
        confidence: 80,
        isConfirmed: true,
        evidence: `Shallow, low-volume pullback (${barRvol.toFixed(1)}x RVOL) holding well above accumulation base.`
      };
    }

    // 5. UPTHRUST / UTAD: Pierced established range high and closed back below
    if ((bar.high > establishedRangeHigh * 1.001 || (bar.high >= rangeHigh && upperWickPct >= 0.3)) && bar.close <= establishedRangeHigh * 1.005 && upperWickPct >= 0.25) {
      distribution.UTAD = {
        eventType: 'UTAD',
        name: 'Upthrust After Distribution',
        category: 'DISTRIBUTION',
        status: 'DETECTED',
        detected: true,
        timestamp: bar.timestamp,
        price: bar.high,
        volumeRatio: Number(barRvol.toFixed(2)),
        confidence: 88,
        isConfirmed: current.close <= establishedRangeHigh * 1.005,
        evidence: `Price thrust above range ceiling (${establishedRangeHigh.toFixed(4)}) to ${bar.high.toFixed(4)} and failed, leaving an upper rejection wick.`
      };
      if (!activeEvent || i === recentBars.length - 1) activeEvent = distribution.UTAD;
    }

    // 6. BUYING CLIMAX (BC): Massive volume surge at the extreme top of the range
    if (bar.high >= establishedRangeHigh * 0.992 && barRvol >= 1.6 && upperWickPct >= 0.25) {
      distribution.BC = {
        eventType: 'BC',
        name: 'Buying Climax',
        category: 'DISTRIBUTION',
        status: 'DETECTED',
        detected: true,
        timestamp: bar.timestamp,
        price: bar.high,
        volumeRatio: Number(barRvol.toFixed(2)),
        confidence: 85,
        isConfirmed: true,
        evidence: `Climactic volume burst (${barRvol.toFixed(1)}x RVOL) at range ceiling (${bar.high.toFixed(4)}) indicating speculative exhaustion.`
      };
    }

    // 7. SIGN OF WEAKNESS (SOW): Strong down candle breaking towards or through range floor
    if (bar.close < establishedRangeLow + rangeSpan * 0.35 && bar.close < bar.open && barRvol >= 1.25) {
      distribution.SOW = {
        eventType: 'SOW',
        name: 'Sign of Weakness',
        category: 'DISTRIBUTION',
        status: 'DETECTED',
        detected: true,
        timestamp: bar.timestamp,
        price: bar.close,
        volumeRatio: Number(barRvol.toFixed(2)),
        confidence: 82,
        isConfirmed: true,
        evidence: `Aggressive selling expansion bar towards range floor on heavy volume (${barRvol.toFixed(1)}x RVOL).`
      };
      if (!activeEvent || i === recentBars.length - 1) activeEvent = distribution.SOW;
    }

    // 8. LAST POINT OF SUPPLY (LPSY): Weak low-volume relief bounce failing below range midpoint
    if (bar.high <= establishedRangeHigh - rangeSpan * 0.3 && bar.high > establishedRangeLow && barRvol <= 0.85 && current.close < bar.high) {
      distribution.LPSY = {
        eventType: 'LPSY',
        name: 'Last Point of Supply',
        category: 'DISTRIBUTION',
        status: 'DETECTED',
        detected: true,
        timestamp: bar.timestamp,
        price: bar.high,
        volumeRatio: Number(barRvol.toFixed(2)),
        confidence: 80,
        isConfirmed: true,
        evidence: `Weak relief bounce on low volume (${barRvol.toFixed(1)}x RVOL) failing to recover broken resistance.`
      };
    }
  }

  return { accumulation, distribution, activeEvent };
}

/**
 * Multi-Timeframe Cycle Context Evaluator
 */
export function evaluateMultiTimeframeCycle(
  timeframeCandlesMap?: { [tf: string]: Candle[] },
  primaryTimeframe: string = '1h'
): MultiTimeframeCycleContext {
  if (!timeframeCandlesMap || Object.keys(timeframeCandlesMap).length === 0) {
    return {
      alignment: 'UNKNOWN',
      confluenceSummary: 'Multi-timeframe candle data unavailable; cycle evaluated on primary timeframe.',
      conflicts: []
    };
  }

  const localTf = timeframeCandlesMap['5m'] || timeframeCandlesMap['15m'];
  const interTf = timeframeCandlesMap['1h'] || timeframeCandlesMap['30m'] || timeframeCandlesMap[primaryTimeframe];
  const macroTf = timeframeCandlesMap['4h'] || timeframeCandlesMap['1d'];

  const localAnalysis = localTf && localTf.length >= 20 ? analyzeMarketCycle(localTf, '15m') : undefined;
  const interAnalysis = interTf && interTf.length >= 20 ? analyzeMarketCycle(interTf, '1h') : undefined;
  const macroAnalysis = macroTf && macroTf.length >= 20 ? analyzeMarketCycle(macroTf, '4h') : undefined;

  const localCycle = localAnalysis
    ? { timeframe: '15m', phase: localAnalysis.cycle, stage: localAnalysis.stage, confidence: localAnalysis.cycleConfidence }
    : undefined;
  const intermediateCycle = interAnalysis
    ? { timeframe: '1h', phase: interAnalysis.cycle, stage: interAnalysis.stage, confidence: interAnalysis.cycleConfidence }
    : undefined;
  const macroCycle = macroAnalysis
    ? { timeframe: '4h', phase: macroAnalysis.cycle, stage: macroAnalysis.stage, confidence: macroAnalysis.cycleConfidence }
    : undefined;

  const conflicts: string[] = [];
  let alignment: 'ALIGNED_BULLISH' | 'ALIGNED_BEARISH' | 'TRANSITIONAL_CONFLUENCE' | 'CONFLICTING' | 'UNKNOWN' = 'UNKNOWN';

  const isBullishPhase = (p?: MarketCycleType) => p === 'MARKUP' || p === 'ACCUMULATION' || p === 'RE_ACCUMULATION';
  const isBearishPhase = (p?: MarketCycleType) => p === 'MARKDOWN' || p === 'DISTRIBUTION' || p === 'RE_DISTRIBUTION';

  const localBull = isBullishPhase(localCycle?.phase);
  const interBull = isBullishPhase(intermediateCycle?.phase);
  const macroBull = isBullishPhase(macroCycle?.phase);

  const localBear = isBearishPhase(localCycle?.phase);
  const interBear = isBearishPhase(intermediateCycle?.phase);
  const macroBear = isBearishPhase(macroCycle?.phase);

  if (interBull && macroBull) {
    alignment = localBull ? 'ALIGNED_BULLISH' : 'TRANSITIONAL_CONFLUENCE';
  } else if (interBear && macroBear) {
    alignment = localBear ? 'ALIGNED_BEARISH' : 'TRANSITIONAL_CONFLUENCE';
  } else if (macroCycle && intermediateCycle && macroBull !== interBull && macroCycle.phase !== 'TRANSITION' && intermediateCycle.phase !== 'TRANSITION') {
    alignment = 'CONFLICTING';
    conflicts.push(`Macro cycle (${macroCycle.timeframe}: ${macroCycle.phase}) opposes intermediate cycle (${intermediateCycle.timeframe}: ${intermediateCycle.phase})`);
  } else if (localCycle || intermediateCycle || macroCycle) {
    alignment = 'TRANSITIONAL_CONFLUENCE';
  }

  const confluenceSummary = `MTF Alignment: ${alignment} | Macro: ${macroCycle?.phase || 'N/A'}, Intermediate: ${intermediateCycle?.phase || 'N/A'}, Local: ${localCycle?.phase || 'N/A'}`;

  return {
    localCycle,
    intermediateCycle,
    macroCycle,
    alignment,
    confluenceSummary,
    conflicts
  };
}

/**
 * Market Cycle Intelligence Engine (Phase 10 Deterministic Wyckoff/Market Phase Engine)
 * Supported primary phases:
 * - ACCUMULATION
 * - MARKUP
 * - RE_ACCUMULATION
 * - DISTRIBUTION
 * - RE_DISTRIBUTION
 * - MARKDOWN
 * - TRANSITION / TRANSITION_UNKNOWN
 * - UNKNOWN
 *
 * CRITICAL PERMANENT INVARIANT:
 * Cycle/Wyckoff intelligence must NEVER independently create a LONG or SHORT signal.
 * It provides strict contextual/confluence intelligence only.
 */
export function analyzeMarketCycle(
  candles: Candle[],
  timeframe: string = '1h',
  contextOptions?: MarketCycleContextOptions
): MarketCycleAnalysis {
  if (!candles || candles.length < 20) {
    return {
      cycle: 'UNKNOWN',
      stage: 'INSUFFICIENT_DATA',
      cycleConfidence: 0,
      confidence: 0,
      transitionState: 'NONE',
      volumeCharacteristic: 'UNKNOWN',
      cycleDurationBars: candles ? candles.length : 0,
      description: 'Insufficient historical bars to determine deterministic market cycle phase.',
      details: ['Candle count below minimum threshold (20 bars) for reliable phase identification']
    };
  }

  // Anti-hindsight timestamp bounding
  const evalTs = contextOptions?.evaluationTimestamp;
  const filteredCandles = evalTs
    ? candles.filter(c => c.timestamp <= evalTs)
    : candles;

  if (filteredCandles.length < 20) {
    return {
      cycle: 'UNKNOWN',
      stage: 'INSUFFICIENT_DATA',
      cycleConfidence: 0,
      confidence: 0,
      transitionState: 'NONE',
      volumeCharacteristic: 'UNKNOWN',
      cycleDurationBars: filteredCandles.length,
      description: 'Insufficient historical bars before evaluation timestamp.',
      details: ['Candle count below threshold after anti-hindsight timestamp filter']
    };
  }

  const closes = filteredCandles.map(c => c.close);
  const highs = filteredCandles.map(c => c.high);
  const lows = filteredCandles.map(c => c.low);
  const volumes = filteredCandles.map(c => c.volume);
  const n = filteredCandles.length;
  const current = closes[n - 1];

  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, Math.min(200, Math.floor(n * 0.9)));
  const currentEma20 = ema20[ema20.length - 1] || current;
  const currentEma50 = ema50[ema50.length - 1] || current;
  const currentEma200 = ema200[ema200.length - 1] || currentEma50;
  
  const rsi = calculateRSI(closes, 14);
  const currentRsi = rsi[rsi.length - 1] || 50;
  const rvol = calculateRVOL(volumes, 20);
  const atrArr = calculateATR(filteredCandles, 14);
  const currentAtr = (Array.isArray(atrArr) ? atrArr[atrArr.length - 1] : atrArr) || current * 0.02;

  // Windowed range analysis over the last 30 bars (or all available)
  const windowLen = Math.min(30, n);
  const windowCloses = closes.slice(n - windowLen);
  const windowHighs = highs.slice(n - windowLen);
  const windowLows = lows.slice(n - windowLen);
  const windowVolumes = volumes.slice(n - windowLen);

  const highestPrice = Math.max(...windowHighs);
  const lowestPrice = Math.min(...windowLows);
  const priceRange = highestPrice - lowestPrice;
  const priceRangePct = lowestPrice > 0 ? (priceRange / lowestPrice) * 100 : 0;

  // Linear trend slope over window
  const firstHalfAvg = windowCloses.slice(0, Math.floor(windowLen / 2)).reduce((a, b) => a + b, 0) / Math.floor(windowLen / 2);
  const secondHalfAvg = windowCloses.slice(Math.floor(windowLen / 2)).reduce((a, b) => a + b, 0) / Math.ceil(windowLen / 2);
  const slopePct = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;

  // Prior structural slope (bars n-windowLen*2 to n-windowLen) to detect prior trend for RE_ACCUMULATION / RE_DISTRIBUTION
  let priorSlopePct = 0;
  if (n >= 40) {
    const priorWindowCloses = closes.slice(Math.max(0, n - windowLen * 2), n - windowLen);
    if (priorWindowCloses.length >= 10) {
      const pFirst = priorWindowCloses.slice(0, Math.floor(priorWindowCloses.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(priorWindowCloses.length / 2);
      const pSecond = priorWindowCloses.slice(Math.floor(priorWindowCloses.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(priorWindowCloses.length / 2);
      priorSlopePct = pFirst > 0 ? ((pSecond - pFirst) / pFirst) * 100 : 0;
    }
  }

  // Up vs Down Volume ratio
  let upVol = 0;
  let downVol = 0;
  for (let i = n - windowLen + 1; i < n; i++) {
    if (closes[i] >= closes[i - 1]) {
      upVol += volumes[i];
    } else {
      downVol += volumes[i];
    }
  }
  const totalVol = upVol + downVol;
  const upVolRatio = totalVol > 0 ? upVol / totalVol : 0.5;

  // Volume Characteristic
  let volumeChar: 'EXPANDING' | 'CONTRACTING' | 'CLIMACTIC' | 'NORMAL' | 'UNKNOWN' = 'NORMAL';
  if (rvol >= 2.5) volumeChar = 'CLIMACTIC';
  else if (rvol >= 1.3) volumeChar = 'EXPANDING';
  else if (rvol <= 0.7) volumeChar = 'CONTRACTING';

  // EMA alignment
  const isBullStack = (currentEma20 >= currentEma50 || n < 50) && current >= currentEma20 && slopePct > 0.8;
  const isBearStack = (currentEma20 <= currentEma50 || n < 50) && current <= currentEma20 && slopePct < -0.8;
  const isEmaCompressed = Math.abs(currentEma20 - currentEma50) / current < 0.008;

  // Effort vs Result evaluation
  const effortVsResult = evaluateEffortVsResult(filteredCandles, windowLen);

  // Wyckoff Event Detection
  const wyckoffEvents = detectWyckoffEvents(filteredCandles, highestPrice, lowestPrice, rvol);

  // Multi-Timeframe Cycle Context
  const multiTimeframeCycle = evaluateMultiTimeframeCycle(contextOptions?.multiTimeframeCandles, timeframe);

  let cycle: MarketCycleType = 'TRANSITION_UNKNOWN';
  let stage = 'STAGE_1_BASE';
  let cycleConfidence = 70;
  let previousPhase: MarketCycleType = 'UNKNOWN';
  let transitionState: MarketCycleTransition = 'NONE';
  const details: string[] = [];
  const confluenceNotes: string[] = [];

  // --------------------------------------------------------------------------
  // DETERMINISTIC MARKET CYCLE CLASSIFICATION
  // --------------------------------------------------------------------------

  // 1. MARKUP: Stage 2 Expansion Trend (Active directional expansion)
  if (isBullStack && slopePct > 1.0 && currentRsi >= 40) {
    cycle = 'MARKUP';
    stage = slopePct > 7.0 ? 'STAGE_2_EXPANSION_PARABOLIC' : 'STAGE_2_MARKUP_TREND';
    previousPhase = 'ACCUMULATION';
    cycleConfidence = Math.min(95, 75 + Math.round(upVolRatio * 20));
    details.push(`Bullish EMA Stack with positive trajectory (+${slopePct.toFixed(1)}%)`);
    details.push(`Up-volume dominance (${(upVolRatio * 100).toFixed(0)}%) confirming institutional participation`);

    // Check for transition to distribution (exhaustion climax at top)
    if (currentRsi > 76 && rvol > 2.2 && (effortVsResult.classification === 'CLIMAX_EXHAUSTION' || wyckoffEvents.distribution.BC.detected)) {
      transitionState = 'MARKUP_TO_DISTRIBUTION';
      details.push('Buying Climax / VSA Exhaustion detected: Transitioning to Stage 3 Distribution');
    } else if (volumeChar === 'CONTRACTING' && Math.abs(slopePct) < 2.0) {
      transitionState = 'MARKUP_TO_RE_ACCUMULATION';
      details.push('Momentum slowing into consolidation: Transitioning to Re-accumulation');
    }
  }
  // 2. MARKDOWN: Stage 4 Capitulation / Bleed Trend (Active directional decline)
  else if (isBearStack && slopePct < -1.0 && currentRsi <= 60) {
    cycle = 'MARKDOWN';
    stage = slopePct < -7.0 ? 'STAGE_4_CAPITULATION' : 'STAGE_4_MARKDOWN_TREND';
    previousPhase = 'DISTRIBUTION';
    cycleConfidence = Math.min(95, 75 + Math.round((1 - upVolRatio) * 20));
    details.push(`Bearish EMA Stack with downward trajectory (${slopePct.toFixed(1)}%)`);
    details.push(`Down-volume dominance (${((1 - upVolRatio) * 100).toFixed(0)}%) confirming seller control`);

    // Check for transition to accumulation (panic capitulation + absorption bottom)
    if (currentRsi < 28 && rvol > 2.2 && (effortVsResult.classification === 'CLIMAX_EXHAUSTION' || wyckoffEvents.accumulation.SC.detected)) {
      transitionState = 'MARKDOWN_TO_ACCUMULATION';
      details.push('Selling Climax / Extreme oversold exhaustion: Transitioning to Stage 1 Accumulation');
    } else if (volumeChar === 'CONTRACTING' && Math.abs(slopePct) < 2.0) {
      transitionState = 'MARKDOWN_TO_RE_DISTRIBUTION';
      details.push('Momentum pausing into consolidation: Transitioning to Re-distribution');
    }
  }
  // 3. RE_ACCUMULATION: Prior markup trend + consolidation range + supply absorption
  else if (
    (priorSlopePct >= 2.5 || (currentEma50 > currentEma200 && current > currentEma50)) &&
    priceRangePct < 25.0 &&
    Math.abs(slopePct) <= 6.0 &&
    currentRsi >= 25
  ) {
    cycle = 'RE_ACCUMULATION';
    stage = 'STAGE_2_RE_ACCUMULATION_PAUSE';
    previousPhase = 'MARKUP';
    cycleConfidence = 84;
    details.push(`Consolidation within established uptrend (prior slope +${priorSlopePct.toFixed(1)}%, EMA50 > EMA200)`);
    details.push(`Supply absorption confirmed: Range ${priceRangePct.toFixed(1)}% with ${effortVsResult.classification}`);
    if (wyckoffEvents.accumulation.SPRING.detected || wyckoffEvents.accumulation.LPS.detected) {
      cycleConfidence = Math.min(96, cycleConfidence + 8);
      details.push('Wyckoff Re-accumulation confirmation: Spring / LPS structure holding above base');
    }
    if (current > currentEma20 && rvol >= 1.2) {
      transitionState = 'RE_ACCUMULATION_TO_MARKUP';
      details.push('Continuation breakout ignition: Resuming Stage 2 Markup');
    }
  }
  // 4. RE_DISTRIBUTION: Prior markdown trend + consolidation range + supply persistence
  else if (
    (priorSlopePct <= -2.5 || (currentEma50 < currentEma200 && current < currentEma50)) &&
    priceRangePct < 25.0 &&
    Math.abs(slopePct) <= 6.0 &&
    currentRsi <= 75
  ) {
    cycle = 'RE_DISTRIBUTION';
    stage = 'STAGE_4_RE_DISTRIBUTION_PAUSE';
    previousPhase = 'MARKDOWN';
    cycleConfidence = 84;
    details.push(`Consolidation within established downtrend (prior slope ${priorSlopePct.toFixed(1)}%, EMA50 < EMA200)`);
    details.push(`Supply persistence: Weak bounces with down-volume dominance (${((1 - upVolRatio) * 100).toFixed(0)}%)`);
    if (wyckoffEvents.distribution.UTAD.detected || wyckoffEvents.distribution.LPSY.detected) {
      cycleConfidence = Math.min(96, cycleConfidence + 8);
      details.push('Wyckoff Re-distribution confirmation: UTAD / LPSY failure at range ceiling');
    }
    if (current < currentEma20 && isBearStack) {
      transitionState = 'RE_DISTRIBUTION_TO_MARKDOWN';
      details.push('Continuation breakdown ignition: Resuming Stage 4 Markdown');
    }
  }
  // 5. DISTRIBUTION: Stage 3 Topping Range
  else if (
    Math.abs(slopePct) <= 6.0 &&
    priceRangePct < 25.0 &&
    (downVol >= upVol * 1.05 || wyckoffEvents.distribution.UTAD.detected || (currentRsi >= 65 && downVol > upVol))
  ) {
    cycle = 'DISTRIBUTION';
    stage = 'STAGE_3_DISTRIBUTION_TOP';
    previousPhase = 'MARKUP';
    cycleConfidence = 78;
    details.push(`Topping structure near range ceiling (${highestPrice.toFixed(4)}) with volume churn`);
    details.push(`Downside volume dominance (${((1 - upVolRatio) * 100).toFixed(0)}%) confirming distribution`);

    if (wyckoffEvents.distribution.UTAD.detected) {
      cycleConfidence = 88;
      details.push('⚡ Wyckoff UTAD detected: False breakout above range ceiling followed by rejection');
    }

    if (current < currentEma20 && isBearStack) {
      transitionState = 'DISTRIBUTION_TO_MARKDOWN';
      details.push('Distribution breakdown: Crossing below EMA cluster into Stage 4 Markdown');
    }
  }
  // 6. ACCUMULATION: Stage 1 Base Building after decline
  else if (priceRangePct < 25.0 && Math.abs(slopePct) <= 6.0 && currentRsi >= 20 && currentRsi <= 70) {
    cycle = 'ACCUMULATION';
    stage = 'STAGE_1_ACCUMULATION_BASE';
    previousPhase = 'MARKDOWN';
    cycleConfidence = 80;
    details.push(`Range contraction (${priceRangePct.toFixed(1)}%) forming horizontal Wyckoff accumulation base`);
    details.push(`Volume characteristic: ${volumeChar} with neutral balanced RSI (${currentRsi.toFixed(0)})`);

    if (wyckoffEvents.accumulation.SPRING.detected) {
      cycleConfidence = 90;
      details.push('⚡ Wyckoff Spring detected: Liquidity sweep below range low followed by quick reclaim');
    }

    if (current > currentEma20 && currentEma20 >= currentEma50 && rvol >= 1.2) {
      transitionState = 'ACCUMULATION_TO_MARKUP';
      details.push('Accumulation completion: Ignition above EMA cluster into Stage 2 Markup');
    }
  }
  // 7. TRANSITION / UNCERTAIN
  else {
    cycle = 'TRANSITION';
    stage = 'TRANSITION_EQUILIBRIUM';
    previousPhase = 'UNKNOWN';
    cycleConfidence = 60;
    details.push(`Mixed structural signals in ${timeframe} timeframe; price trading within transitional consolidation`);
  }

  // Build Transition Record
  const transition: CycleTransitionRecord = {
    previousPhase,
    currentPhase: cycle,
    transitionConfidence: transitionState !== 'NONE' ? Math.min(90, cycleConfidence + 5) : 50,
    transitionTimestamp: filteredCandles[n - 1].timestamp,
    transitionState,
    evidence: [...details]
  };

  // Confluence notes
  if (cycle === 'ACCUMULATION' || cycle === 'MARKUP' || cycle === 'RE_ACCUMULATION') {
    confluenceNotes.push(`Bullish cycle context (${cycle}) reinforces demand absorption & upside expansion`);
  } else if (cycle === 'DISTRIBUTION' || cycle === 'MARKDOWN' || cycle === 'RE_DISTRIBUTION') {
    confluenceNotes.push(`Bearish cycle context (${cycle}) reinforces supply distribution & downside progression`);
  }

  const description = `${cycle} (${stage.replace(/_/g, ' ')}) | VSA: ${effortVsResult.classification} | Transition: ${transitionState !== 'NONE' ? transitionState : 'STABLE'}`;

  return {
    cycle,
    stage,
    cycleConfidence,
    confidence: cycleConfidence,
    transitionState,
    transition,
    volumeCharacteristic: volumeChar,
    effortVsResult,
    wyckoffEvents: {
      accumulation: wyckoffEvents.accumulation,
      distribution: wyckoffEvents.distribution
    },
    activeWyckoffEvent: wyckoffEvents.activeEvent,
    multiTimeframeCycle,
    cycleDurationBars: windowLen,
    description,
    details,
    isConfluentWithSignal: true,
    confluenceNotes
  };
}

