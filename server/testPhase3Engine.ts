import { Candle } from './cryptoService';
import { calculateATR } from './technicalAnalysis';
import {
  detectTrendlines,
  evaluatePatternTrendlineConfluence,
  TrendlineEvidence
} from './trendlineEngine';
import {
  fuseMarketEvidence,
  buildTimeframeEvidence,
  buildDerivativesEvidence,
  buildNewsEvidence,
  UnifiedMarketEvidence
} from './multiTimeframeEngine';
import { PatternDetectionResult } from './patternEngine';
import { generateDeterministicSignalId } from './signalEngine';

function makeCandle(close: number, high?: number, low?: number, volume: number = 1000, timestamp: number = 1000000): Candle {
  const h = high !== undefined ? high : close + 1;
  const l = low !== undefined ? low : close - 1;
  return {
    timestamp,
    open: close,
    high: Math.max(h, close, close),
    low: Math.min(l, close, close),
    close,
    volume,
  };
}

function makeCandles(prices: number[], baseVol: number = 1000, startTime: number = 1000000): Candle[] {
  return prices.map((p, idx) => ({
    timestamp: startTime + idx * 60000,
    open: p,
    high: p + 1.2,
    low: p - 1.2,
    close: p,
    volume: baseVol,
  }));
}

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function runTest(name: string, fn: () => { passed: boolean; details?: string }) {
  try {
    const res = fn();
    results.push({ name, passed: res.passed, details: res.details });
  } catch (err: any) {
    results.push({ name, passed: false, details: `Exception: ${err.message}` });
  }
}

console.log('=== MOONSCANNER PHASE 3: MULTI-TOUCH TRENDLINE & UNIFIED MULTI-TIMEFRAME TEST SUITE ===\n');

// 1. 3-Touch Bullish Support Trendline
runTest('1. 3-Touch Bullish Support Trendline', () => {
  // Ascending support touches at low = 100, 106, 112 with spaced pivots
  const candles: Candle[] = [];
  let t = 1000;
  // Pivot 1 Low at 100 (bar 5)
  for (let i = 0; i < 5; i++) candles.push(makeCandle(105 - i, 106, 104 - i, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 101, high: 102, low: 100, close: 101, volume: 1000 }); // Swing Low 1
  for (let i = 0; i < 6; i++) candles.push(makeCandle(102 + i * 2, 104 + i * 2, 101 + i * 2, 1000, t += 60000)); // peak 114

  // Pivot 2 Low at 106 (bar 16)
  for (let i = 0; i < 4; i++) candles.push(makeCandle(114 - i * 2, 115 - i * 2, 113 - i * 2, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 107, high: 108, low: 106, close: 107, volume: 1000 }); // Swing Low 2
  for (let i = 0; i < 6; i++) candles.push(makeCandle(108 + i * 2, 110 + i * 2, 107 + i * 2, 1000, t += 60000)); // peak 120

  // Pivot 3 Low at 112 (bar 27)
  for (let i = 0; i < 4; i++) candles.push(makeCandle(120 - i * 2, 121 - i * 2, 119 - i * 2, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 113, high: 114, low: 112, close: 113, volume: 1000 }); // Swing Low 3
  for (let i = 0; i < 5; i++) candles.push(makeCandle(114 + i * 2, 116 + i * 2, 113 + i * 2, 1000, t += 60000));

  const tl = detectTrendlines(candles, '1h');
  const passed = !!tl && tl.detected && tl.type === 'SUPPORT' && tl.touchCount >= 3 && tl.direction === 'BULLISH';
  return { passed, details: `Detected: ${tl?.type}, touches: ${tl?.touchCount}, direction: ${tl?.direction}` };
});

// 2. 3-Touch Bearish Resistance Trendline
runTest('2. 3-Touch Bearish Resistance Trendline', () => {
  // Descending resistance touches at high = 200, 192, 184
  const candles: Candle[] = [];
  let t = 1000;
  // Pivot 1 High at 200
  for (let i = 0; i < 5; i++) candles.push(makeCandle(190 + i * 2, 191 + i * 2, 189 + i * 2, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 199, high: 200, low: 198, close: 199, volume: 1000 }); // Swing High 1
  for (let i = 0; i < 6; i++) candles.push(makeCandle(198 - i * 2, 199 - i * 2, 196 - i * 2, 1000, t += 60000)); // valley 186

  // Pivot 2 High at 192
  for (let i = 0; i < 4; i++) candles.push(makeCandle(186 + i * 1.5, 187 + i * 1.5, 185 + i * 1.5, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 191, high: 192, low: 190, close: 191, volume: 1000 }); // Swing High 2
  for (let i = 0; i < 6; i++) candles.push(makeCandle(190 - i * 2, 191 - i * 2, 188 - i * 2, 1000, t += 60000)); // valley 178

  // Pivot 3 High at 184
  for (let i = 0; i < 4; i++) candles.push(makeCandle(178 + i * 1.5, 179 + i * 1.5, 177 + i * 1.5, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 183, high: 184, low: 182, close: 183, volume: 1000 }); // Swing High 3
  for (let i = 0; i < 5; i++) candles.push(makeCandle(182 - i * 2, 183 - i * 2, 180 - i * 2, 1000, t += 60000));

  const tl = detectTrendlines(candles, '1h');
  const passed = !!tl && tl.detected && tl.type === 'RESISTANCE' && tl.touchCount >= 3 && tl.direction === 'BEARISH';
  return { passed, details: `Detected: ${tl?.type}, touches: ${tl?.touchCount}, direction: ${tl?.direction}` };
});

// 3. Invalid 2-Point Noisy Trendline (Filter Rejection or Low Quality)
runTest('3. Invalid 2-Point Noisy Trendline', () => {
  // Only 2 points very close together (noise)
  const prices = [100, 101, 100.5, 102, 101.5, 102.5, 102, 103, 102.5, 103.5];
  const candles = makeCandles(prices, 1000, 1000);
  const tl = detectTrendlines(candles, '1h');
  const passed = !tl || tl.touchCount < 3 || tl.touchQuality < 70;
  return { passed, details: `Result: ${tl ? `Touches: ${tl.touchCount}, Quality: ${tl.touchQuality}%` : 'Null (Correctly rejected)'}` };
});

// 4. Confirmed Breakout
runTest('4. Confirmed Breakout Beyond Trendline', () => {
  // Descending resistance trendline with a strong breakout bar + volume spike (2500 vs 1000)
  const candles: Candle[] = [];
  let t = 1000;
  // Pivot 1 High at 150
  for (let i = 0; i < 4; i++) candles.push(makeCandle(140 + i * 2, 141 + i * 2, 139 + i * 2, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 149, high: 150, low: 148, close: 149, volume: 1000 });
  for (let i = 0; i < 5; i++) candles.push(makeCandle(148 - i * 2, 149 - i * 2, 146 - i * 2, 1000, t += 60000));

  // Pivot 2 High at 144
  for (let i = 0; i < 3; i++) candles.push(makeCandle(140 + i * 1.3, 141 + i * 1.3, 139 + i * 1.3, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 143, high: 144, low: 142, close: 143, volume: 1000 });
  for (let i = 0; i < 5; i++) candles.push(makeCandle(142 - i * 2, 143 - i * 2, 140 - i * 2, 1000, t += 60000));

  // Pivot 3 High at 138
  for (let i = 0; i < 3; i++) candles.push(makeCandle(134 + i * 1.3, 135 + i * 1.3, 133 + i * 1.3, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 137, high: 138, low: 136, close: 137, volume: 1000 });

  // Breakout bar blasting through projected line (approx 134) to 146 with 3x volume
  candles.push({ timestamp: t += 60000, open: 135, high: 147, low: 134, close: 146, volume: 3000 });

  const tl = detectTrendlines(candles, '1h');
  const passed = !!tl && (tl.breakoutStatus === 'CONFIRMED' || tl.breakoutStatus === 'POTENTIAL') && tl.volumeConfirmation;
  return { passed, details: `BreakoutStatus: ${tl?.breakoutStatus}, VolumeConfirmation: ${tl?.volumeConfirmation}` };
});

// 5. Failed Breakout (Fakeout)
runTest('5. Failed Breakout (Fakeout Reversion)', () => {
  const candles: Candle[] = [];
  let t = 1000;
  // Pivot 1 Low 100
  for (let i = 0; i < 4; i++) candles.push(makeCandle(105 - i, 106, 104 - i, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 101, high: 102, low: 100, close: 101, volume: 1000 });
  for (let i = 0; i < 5; i++) candles.push(makeCandle(102 + i * 2, 104 + i * 2, 101 + i * 2, 1000, t += 60000));

  // Pivot 2 Low 106
  for (let i = 0; i < 3; i++) candles.push(makeCandle(112 - i * 2, 113 - i * 2, 111 - i * 2, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 107, high: 108, low: 106, close: 107, volume: 1000 });
  for (let i = 0; i < 5; i++) candles.push(makeCandle(108 + i * 2, 110 + i * 2, 107 + i * 2, 1000, t += 60000));

  // Pivot 3 Low 112
  candles.push({ timestamp: t += 60000, open: 113, high: 114, low: 112, close: 113, volume: 1000 });

  // Breakdown bar below line to 108
  candles.push({ timestamp: t += 60000, open: 112, high: 113, low: 107, close: 108, volume: 800 });
  // Subsequent bar aggressively closes back up at 116 inside trendline
  candles.push({ timestamp: t += 60000, open: 108, high: 117, low: 108, close: 116, volume: 1200 });

  const tl = detectTrendlines(candles, '1h');
  const passed = !!tl && (tl.breakoutStatus === 'FAILED' || tl.breakoutStatus === 'NONE');
  return { passed, details: `BreakoutStatus: ${tl?.breakoutStatus}` };
});

// 6. Confirmed Retest
runTest('6. Confirmed Retest After Breakout', () => {
  const candles: Candle[] = [];
  let t = 1000;
  // Pivot 1 High at 150
  for (let i = 0; i < 4; i++) candles.push(makeCandle(140 + i * 2, 141 + i * 2, 139 + i * 2, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 149, high: 150, low: 148, close: 149, volume: 1000 });
  for (let i = 0; i < 5; i++) candles.push(makeCandle(148 - i * 2, 149 - i * 2, 146 - i * 2, 1000, t += 60000));

  // Pivot 2 High at 144
  for (let i = 0; i < 3; i++) candles.push(makeCandle(140 + i * 1.3, 141 + i * 1.3, 139 + i * 1.3, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 143, high: 144, low: 142, close: 143, volume: 1000 });
  for (let i = 0; i < 5; i++) candles.push(makeCandle(142 - i * 2, 143 - i * 2, 140 - i * 2, 1000, t += 60000));

  // Pivot 3 High at 138
  for (let i = 0; i < 3; i++) candles.push(makeCandle(134 + i * 1.3, 135 + i * 1.3, 133 + i * 1.3, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 137, high: 138, low: 136, close: 137, volume: 1000 });

  // Breakout to 144 with volume
  candles.push({ timestamp: t += 60000, open: 136, high: 145, low: 135, close: 144, volume: 2500 });
  // Retest bar pulling back to broken line at 134, bouncing up to 140
  candles.push({ timestamp: t += 60000, open: 144, high: 144, low: 134, close: 140, volume: 1400 });

  const tl = detectTrendlines(candles, '1h');
  const passed = !!tl && (tl.retestStatus === 'CONFIRMED' || tl.retestStatus === 'TESTING');
  return { passed, details: `RetestStatus: ${tl?.retestStatus}` };
});

// 7. Failed Retest
runTest('7. Failed Retest (Line Collapse)', () => {
  const candles: Candle[] = [];
  let t = 1000;
  // Pivot 1 High at 150
  for (let i = 0; i < 4; i++) candles.push(makeCandle(140 + i * 2, 141 + i * 2, 139 + i * 2, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 149, high: 150, low: 148, close: 149, volume: 1000 });
  for (let i = 0; i < 5; i++) candles.push(makeCandle(148 - i * 2, 149 - i * 2, 146 - i * 2, 1000, t += 60000));

  // Pivot 2 High at 144
  for (let i = 0; i < 3; i++) candles.push(makeCandle(140 + i * 1.3, 141 + i * 1.3, 139 + i * 1.3, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 143, high: 144, low: 142, close: 143, volume: 1000 });
  for (let i = 0; i < 5; i++) candles.push(makeCandle(142 - i * 2, 143 - i * 2, 140 - i * 2, 1000, t += 60000));

  // Pivot 3 High at 138
  for (let i = 0; i < 3; i++) candles.push(makeCandle(134 + i * 1.3, 135 + i * 1.3, 133 + i * 1.3, 1000, t += 60000));
  candles.push({ timestamp: t += 60000, open: 137, high: 138, low: 136, close: 137, volume: 1000 });

  // Minor breakout poke to 139
  candles.push({ timestamp: t += 60000, open: 136, high: 139, low: 135, close: 139, volume: 1100 });
  // Total collapse deep back below the line to 125
  candles.push({ timestamp: t += 60000, open: 138, high: 138, low: 124, close: 125, volume: 2000 });

  const tl = detectTrendlines(candles, '1h');
  const passed = !!tl && (tl.breakoutStatus === 'FAILED' || tl.retestStatus === 'NONE' || tl.retestStatus === 'FAILED');
  return { passed, details: `Breakout: ${tl?.breakoutStatus}, Retest: ${tl?.retestStatus}` };
});

// 8. Pattern + Trendline Bullish Confluence
runTest('8. Pattern + Trendline Bullish Confluence', () => {
  const mockPattern: PatternDetectionResult = {
    detected: true,
    name: 'Bull Flag',
    category: 'CONTINUATION',
    type: 'BULLISH',
    confidence: 88,
    breakoutStatus: 'BROKEN_OUT',
    retestStatus: 'NONE',
    volumeConfirmation: true,
    keyLevels: { breakoutLevel: 105, measuredTarget: 120 },
    description: 'Bullish flag breakout',
    evidence: ['Strong flagpole'],
  };

  const mockTrendline: TrendlineEvidence = {
    detected: true,
    direction: 'BULLISH',
    type: 'SUPPORT',
    slope: 0.5,
    intercept: 90,
    touchCount: 3,
    touchQuality: 85,
    confidence: 85,
    timeframe: '1h',
    startPoint: { index: 0, timestamp: 1000, price: 90 },
    endPoint: { index: 20, timestamp: 2000, price: 100 },
    currentLinePrice: 102,
    breakoutLevel: 102,
    breakoutStatus: 'NONE',
    retestStatus: 'NONE',
    volumeConfirmation: true,
    touches: [],
    description: '3-touch Support trendline',
    evidence: [],
  };

  const confluence = evaluatePatternTrendlineConfluence(mockPattern, mockTrendline);
  const passed = confluence.hasConfluence && confluence.scoreBonus > 0 && confluence.confluenceType.includes('CONFIRMATION');
  return { passed, details: `ConfluenceType: ${confluence.confluenceType}, Bonus: +${confluence.scoreBonus}` };
});

// 9. Pattern + Trendline Directional Conflict
runTest('9. Pattern + Trendline Directional Conflict', () => {
  const mockPattern: PatternDetectionResult = {
    detected: true,
    name: 'Double Bottom',
    category: 'REVERSAL',
    type: 'BULLISH',
    confidence: 80,
    breakoutStatus: 'NONE',
    retestStatus: 'NONE',
    volumeConfirmation: false,
    keyLevels: {},
    description: 'Bullish Double Bottom',
    evidence: [],
  };

  const mockBearTrendline: TrendlineEvidence = {
    detected: true,
    direction: 'BEARISH',
    type: 'RESISTANCE',
    slope: -0.8,
    intercept: 150,
    touchCount: 3,
    touchQuality: 90,
    confidence: 88,
    timeframe: '1h',
    startPoint: { index: 0, timestamp: 1000, price: 150 },
    endPoint: { index: 20, timestamp: 2000, price: 134 },
    currentLinePrice: 130,
    breakoutLevel: 130,
    breakoutStatus: 'NONE',
    retestStatus: 'NONE',
    volumeConfirmation: false,
    touches: [],
    description: '3-touch Resistance trendline',
    evidence: [],
  };

  const confluence = evaluatePatternTrendlineConfluence(mockPattern, mockBearTrendline);
  const passed = !confluence.hasConfluence && confluence.confluenceType === 'CONFLICT' && confluence.scoreBonus < 0;
  return { passed, details: `ConfluenceType: ${confluence.confluenceType}, ScoreBonus: ${confluence.scoreBonus}` };
});

// 10. 4 Timeframe Evidence Aggregation
runTest('10. 4 Timeframe Evidence Aggregation (4H, 1H, 15M, 5M)', () => {
  // Uptrending candles
  const p4h = [80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 185];
  const p1h = [150, 152, 155, 158, 160, 163, 166, 170, 172, 175, 178, 180, 182, 185];
  const p15m = [175, 176, 178, 179, 181, 182, 183, 184, 185];
  const p5m = [182, 183, 184, 183.5, 184.5, 185];

  const c4h = makeCandles(p4h, 5000);
  const c1h = makeCandles(p1h, 2000);
  const c15m = makeCandles(p15m, 1000);
  const c5m = makeCandles(p5m, 500);

  const fused = fuseMarketEvidence('BTCUSDT', { '4h': c4h, '1h': c1h, '15m': c15m, '5m': c5m });
  const passed = fused.overallBias === 'BULLISH' && fused.moonScore >= 65 && Object.keys(fused.timeframes).length === 4;
  return { passed, details: `OverallBias: ${fused.overallBias}, MoonScore: ${fused.moonScore}, Timeframes: ${Object.keys(fused.timeframes).length}` };
});

// 11. Repeated Aggregation Produces Identical Result (Idempotency)
runTest('11. Repeated Aggregation Produces Identical Result', () => {
  const p1h = [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128, 130];
  const c1h = makeCandles(p1h, 1500);

  const fused1 = fuseMarketEvidence('ETHUSDT', { '1h': c1h });
  const fused2 = fuseMarketEvidence('ETHUSDT', { '1h': c1h });

  const passed =
    fused1.moonScore === fused2.moonScore &&
    fused1.overallBias === fused2.overallBias &&
    fused1.suggestedDecision === fused2.suggestedDecision &&
    fused1.confluence.confluenceScore === fused2.confluence.confluenceScore;
  return { passed, details: `Run1 Score: ${fused1.moonScore}, Run2 Score: ${fused2.moonScore}` };
});

// 12. No Duplicate Signal From Timeframe Aggregation
runTest('12. No Duplicate Signal From Timeframe Aggregation', () => {
  const t = 1700000000000;
  // Multi-timeframe setup for BTCUSDT
  const id1 = generateDeterministicSignalId('BTCUSDT', '1h', 'LONG', 'Double Bottom', t);
  const id2 = generateDeterministicSignalId('BTCUSDT', '1h', 'LONG', 'Double Bottom', t);

  const passed = id1 === id2 && !id1.includes('5m_15m_4h');
  return { passed, details: `Unified ID: ${id1}` };
});

// 13. Missing Timeframe Data (Graceful Handling)
runTest('13. Missing Timeframe Data Handled Safely', () => {
  // Only 1h provided; 4h, 15m, 5m omitted
  const c1h = makeCandles([100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160], 1000);
  const fused = fuseMarketEvidence('SOLUSDT', { '1h': c1h });

  const passed = !!fused && fused.timeframes['1h'] !== undefined && fused.timeframes['4h'] === undefined && fused.moonScore > 0;
  return { passed, details: `Timeframes populated: ${Object.keys(fused.timeframes).join(', ')}` };
});

// 14. Missing Derivatives Data Handled as UNKNOWN
runTest('14. Missing Derivatives Data Handled as UNKNOWN', () => {
  const derivEvidence = buildDerivativesEvidence(null);
  const passed = derivEvidence.isMissing && derivEvidence.bias === 'UNKNOWN' && derivEvidence.fundingBias === 'UNKNOWN';
  return { passed, details: `isMissing: ${derivEvidence.isMissing}, bias: ${derivEvidence.bias}` };
});

// 15. Missing News Data Handled as UNKNOWN
runTest('15. Missing News Data Handled as UNKNOWN', () => {
  const newsEvidence = buildNewsEvidence([], 'AVAX');
  const passed = newsEvidence.isMissing && newsEvidence.bias === 'UNKNOWN' && newsEvidence.matchedCount === 0;
  return { passed, details: `isMissing: ${newsEvidence.isMissing}, bias: ${newsEvidence.bias}` };
});

// Report Test Results
console.log('--------------------------------------------------');
let passedCount = 0;
for (const r of results) {
  if (r.passed) {
    passedCount++;
    console.log(`✓ [PASS] ${r.name}`);
  } else {
    console.log(`✗ [FAIL] ${r.name} - Details: ${r.details}`);
  }
}
console.log('==================================================');
console.log(`TEST RESULTS: ${passedCount} / ${results.length} TESTS PASSED`);
console.log('==================================================\n');

if (passedCount < results.length) {
  process.exit(1);
} else {
  process.exit(0);
}
