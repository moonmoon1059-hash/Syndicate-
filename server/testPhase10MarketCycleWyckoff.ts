import {
  analyzeMarketCycle,
  evaluateEffortVsResult,
  detectWyckoffEvents,
  evaluateMultiTimeframeCycle
} from './marketCycleEngine';
import { evaluateMarketWithCoreIntelligence } from './coreIntelligenceEngine';
import { Candle, TargetLevel } from '../src/types/crypto';

function generateCandles(
  count: number,
  basePrice: number,
  patternType: 'ACCUMULATION' | 'MARKUP' | 'RE_ACCUMULATION' | 'DISTRIBUTION' | 'RE_DISTRIBUTION' | 'MARKDOWN' | 'SPRING' | 'UTAD' | 'RANDOM',
  volProfile: 'NORMAL' | 'CLIMACTIC' | 'DRYING_UP' | 'SURGING' = 'NORMAL'
): Candle[] {
  const candles: Candle[] = [];
  let current = basePrice;
  const now = 1700000000000;

  for (let i = 0; i < count; i++) {
    const timestamp = now - (count - i) * 3600000;
    let change = 0;
    let vol = 100000;

    if (patternType === 'MARKUP') {
      change = (0.008 + (i / count) * 0.006) * current;
      vol = 120000 + (i % 3 === 0 ? 80000 : 20000);
    } else if (patternType === 'MARKDOWN') {
      change = -(0.008 + (i / count) * 0.006) * current;
      vol = 120000 + (i % 3 === 0 ? 80000 : 20000);
    } else if (patternType === 'ACCUMULATION') {
      // Bottom consolidation range with low volatility
      change = Math.sin(i * 0.7) * current * 0.0015;
      vol = 60000 + (change > 0 ? 30000 : 0);
    } else if (patternType === 'RE_ACCUMULATION') {
      // First half strong markup, second half shallow sideways consolidation holding base
      if (i < Math.floor(count * 0.5)) {
        change = 0.006 * current;
        vol = 140000;
      } else {
        change = Math.sin(i * 0.8) * current * 0.001;
        vol = 80000 + (change > 0 ? 40000 : 0);
      }
    } else if (patternType === 'DISTRIBUTION') {
      // Topping consolidation range with elevated volatility, heavy down-volume dominance and topping churn
      change = Math.sin(i * 0.7) * current * 0.002;
      vol = 120000 + (change < 0 ? 150000 : 0);
    } else if (patternType === 'RE_DISTRIBUTION') {
      // First half strong markdown, second half sideways pause failing to recover
      if (i < Math.floor(count * 0.5)) {
        change = -0.006 * current;
        vol = 140000;
      } else {
        change = Math.sin(i * 0.8) * current * 0.001;
        vol = 80000 + (change < 0 ? 40000 : 0);
      }
    } else if (patternType === 'SPRING') {
      if (i === count - 3) {
        // Piercing low with long lower wick and strong volume
        change = -0.004 * current;
        vol = 300000;
      } else if (i >= count - 2) {
        // Immediate reclaim back into range
        change = 0.008 * current;
        vol = 180000;
      } else {
        change = Math.sin(i * 0.6) * current * 0.002;
        vol = 60000;
      }
    } else if (patternType === 'UTAD') {
      if (i === count - 3) {
        // Thrust above high with long upper wick
        change = 0.004 * current;
        vol = 300000;
      } else if (i >= count - 2) {
        // Immediate rejection back below range ceiling
        change = -0.008 * current;
        vol = 180000;
      } else {
        change = Math.sin(i * 0.6) * current * 0.002;
        vol = 60000;
      }
    } else {
      change = (Math.random() - 0.5) * current * 0.004;
      vol = 80000;
    }

    if (volProfile === 'CLIMACTIC' && i === count - 1) vol *= 3.5;
    if (volProfile === 'DRYING_UP' && i >= count - 5) vol *= 0.4;
    if (volProfile === 'SURGING') vol *= 1.8;

    const open = current;
    const close = current + change;
    let high = Math.max(open, close) + Math.abs(current * 0.002);
    let low = Math.min(open, close) - Math.abs(current * 0.002);

    if (patternType === 'SPRING' && i === count - 3) {
      low = Math.min(open, close) - Math.abs(current * 0.025); // Deep sweep with long lower wick
    }
    if (patternType === 'UTAD' && i === count - 3) {
      high = Math.max(open, close) + Math.abs(current * 0.025); // High thrust with long upper wick
    }

    candles.push({
      timestamp,
      time: timestamp,
      open,
      high,
      low,
      close,
      volume: vol
    });
    current = close;
  }

  return candles;
}

export async function runPhase10ValidationSuite(): Promise<{
  passed: boolean;
  testResults: { name: string; status: 'PASS' | 'FAIL'; details?: string }[];
}> {
  const results: { name: string; status: 'PASS' | 'FAIL'; details?: string }[] = [];

  console.log('\n================================================================');
  console.log('🧪 MOONSCANNER PHASE 10: MARKET CYCLE + WYCKOFF TEST SUITE');
  console.log('================================================================\n');

  // TEST 1: Primary Cycle Phase Recognition — Accumulation, Markup, Distribution, Markdown
  try {
    const accumCandles = generateCandles(50, 100, 'ACCUMULATION');
    const markupCandles = generateCandles(50, 100, 'MARKUP');
    const distCandles = generateCandles(50, 100, 'DISTRIBUTION');
    const markdownCandles = generateCandles(50, 100, 'MARKDOWN');

    const accum = analyzeMarketCycle(accumCandles, '1h');
    const markup = analyzeMarketCycle(markupCandles, '1h');
    const dist = analyzeMarketCycle(distCandles, '1h');
    const markdown = analyzeMarketCycle(markdownCandles, '1h');

    const pass =
      accum.cycle === 'ACCUMULATION' &&
      markup.cycle === 'MARKUP' &&
      dist.cycle === 'DISTRIBUTION' &&
      markdown.cycle === 'MARKDOWN';

    results.push({
      name: '1. Primary Market Cycle Recognition (Accumulation, Markup, Distribution, Markdown)',
      status: pass ? 'PASS' : 'FAIL',
      details: `Accum: ${accum.cycle}, Markup: ${markup.cycle}, Dist: ${dist.cycle}, Markdown: ${markdown.cycle} (Dist details: ${dist.details.join(' | ')})`
    });
  } catch (e: any) {
    results.push({ name: '1. Primary Market Cycle Recognition', status: 'FAIL', details: e.message });
  }

  // TEST 2: Re-Accumulation & Re-Distribution Continuation Detection
  try {
    const reAccumCandles = generateCandles(60, 100, 'RE_ACCUMULATION');
    const reDistCandles = generateCandles(60, 100, 'RE_DISTRIBUTION');

    const reAccum = analyzeMarketCycle(reAccumCandles, '1h');
    const reDist = analyzeMarketCycle(reDistCandles, '1h');

    const pass = reAccum.cycle === 'RE_ACCUMULATION' && reDist.cycle === 'RE_DISTRIBUTION';

    results.push({
      name: '2. Re-Accumulation & Re-Distribution Continuation Detection',
      status: pass ? 'PASS' : 'FAIL',
      details: `Re-Accum: ${reAccum.cycle} (${reAccum.details.join(' | ')}), Re-Dist: ${reDist.cycle} (${reDist.details.join(' | ')})`
    });
  } catch (e: any) {
    results.push({ name: '2. Re-Accumulation & Re-Distribution Continuation Detection', status: 'FAIL', details: e.message });
  }

  // TEST 3: Wyckoff Spring / Terminal Shakeout Event Detection
  try {
    const springCandles = generateCandles(50, 100, 'SPRING');
    const cycle = analyzeMarketCycle(springCandles, '1h');

    const springDetected = cycle.wyckoffEvents?.accumulation?.SPRING?.detected === true;
    const isConfirmed = cycle.wyckoffEvents?.accumulation?.SPRING?.isConfirmed === true;

    results.push({
      name: '3. Wyckoff Spring / Terminal Shakeout Event Detection',
      status: springDetected && isConfirmed ? 'PASS' : 'FAIL',
      details: `Spring detected: ${springDetected}, Confirmed: ${isConfirmed}, Confidence: ${cycle.wyckoffEvents?.accumulation?.SPRING?.confidence}%`
    });
  } catch (e: any) {
    results.push({ name: '3. Wyckoff Spring / Terminal Shakeout Event Detection', status: 'FAIL', details: e.message });
  }

  // TEST 4: Wyckoff UTAD (Upthrust After Distribution) Event Detection
  try {
    const utadCandles = generateCandles(50, 100, 'UTAD');
    const cycle = analyzeMarketCycle(utadCandles, '1h');

    const utadDetected = cycle.wyckoffEvents?.distribution?.UTAD?.detected === true;
    const isConfirmed = cycle.wyckoffEvents?.distribution?.UTAD?.isConfirmed === true;

    results.push({
      name: '4. Wyckoff UTAD (Upthrust After Distribution) Event Detection',
      status: utadDetected && isConfirmed ? 'PASS' : 'FAIL',
      details: `UTAD detected: ${utadDetected}, Confirmed: ${isConfirmed}, Confidence: ${cycle.wyckoffEvents?.distribution?.UTAD?.confidence}%`
    });
  } catch (e: any) {
    results.push({ name: '4. Wyckoff UTAD (Upthrust After Distribution) Event Detection', status: 'FAIL', details: e.message });
  }

  // TEST 5: Effort vs Result (VSA Engine) — Absorption Detection
  try {
    const candles = generateCandles(30, 100, 'ACCUMULATION');
    // Modify last candle to have massive volume and narrow spread (absorption)
    const last = candles[candles.length - 1];
    last.volume = 400000;
    last.high = last.open + 0.02;
    last.low = last.open - 0.02;
    last.close = last.open + 0.01;

    const vsa = evaluateEffortVsResult(candles);
    const pass = vsa.classification === 'ABSORPTION' && vsa.volumeRatio >= 1.4;

    results.push({
      name: '5. Effort vs Result (VSA Engine) — Absorption Detection',
      status: pass ? 'PASS' : 'FAIL',
      details: `VSA Classification: ${vsa.classification}, VolRatio: ${vsa.volumeRatio}x, SpreadRatio: ${vsa.spreadRatio}x`
    });
  } catch (e: any) {
    results.push({ name: '5. Effort vs Result (VSA Engine) — Absorption Detection', status: 'FAIL', details: e.message });
  }

  // TEST 6: Effort vs Result (VSA Engine) — No Supply Pullback & Climactic Exhaustion
  try {
    const candles1 = generateCandles(30, 100, 'MARKUP');
    // Low volume pullback
    const last1 = candles1[candles1.length - 1];
    const prior1 = candles1[candles1.length - 2];
    last1.volume = 20000;
    last1.open = prior1.close - 0.1;
    last1.close = prior1.close - 0.4; // Down close relative to prior
    last1.high = last1.open + 0.1;
    last1.low = last1.close - 0.1;

    const vsa1 = evaluateEffortVsResult(candles1);

    const candles2 = generateCandles(30, 100, 'MARKUP');
    const last2 = candles2[candles2.length - 1];
    last2.volume = 500000;
    last2.close = last2.open + 2.5;
    last2.high = last2.close + 2.0; // Upper rejection wick
    last2.low = last2.open - 0.2;

    const vsa2 = evaluateEffortVsResult(candles2);

    const pass = vsa1.classification === 'NO_SUPPLY_PULLBACK' && vsa2.classification === 'CLIMAX_EXHAUSTION';

    results.push({
      name: '6. Effort vs Result (VSA Engine) — No Supply & Climax Detection',
      status: pass ? 'PASS' : 'FAIL',
      details: `Pullback VSA: ${vsa1.classification}, Climax VSA: ${vsa2.classification}`
    });
  } catch (e: any) {
    results.push({ name: '6. Effort vs Result (VSA Engine) — No Supply & Climax Detection', status: 'FAIL', details: e.message });
  }

  // TEST 7: Multi-Timeframe Cycle Context & Alignment Matrix
  try {
    const tf15m = generateCandles(40, 100, 'MARKUP');
    const tf1h = generateCandles(50, 100, 'RE_ACCUMULATION');
    const tf4h = generateCandles(50, 100, 'MARKUP');

    const mtf = evaluateMultiTimeframeCycle({ '15m': tf15m, '1h': tf1h, '4h': tf4h }, '1h');
    const pass = mtf.alignment === 'ALIGNED_BULLISH' || mtf.alignment === 'TRANSITIONAL_CONFLUENCE';

    results.push({
      name: '7. Multi-Timeframe Cycle Context & Alignment Matrix',
      status: pass ? 'PASS' : 'FAIL',
      details: `Alignment: ${mtf.alignment}, Summary: ${mtf.confluenceSummary}`
    });
  } catch (e: any) {
    results.push({ name: '7. Multi-Timeframe Cycle Context & Alignment Matrix', status: 'FAIL', details: e.message });
  }

  // TEST 8: Multi-Timeframe Cycle Conflict Detection
  try {
    const tf1h = generateCandles(50, 100, 'MARKUP');
    const tf4h = generateCandles(50, 100, 'DISTRIBUTION');

    const mtf = evaluateMultiTimeframeCycle({ '1h': tf1h, '4h': tf4h }, '1h');
    const pass = mtf.alignment === 'CONFLICTING' && mtf.conflicts.length > 0;

    results.push({
      name: '8. Multi-Timeframe Cycle Conflict Detection',
      status: pass ? 'PASS' : 'FAIL',
      details: `Alignment: ${mtf.alignment}, Conflicts: ${mtf.conflicts.join('; ')}`
    });
  } catch (e: any) {
    results.push({ name: '8. Multi-Timeframe Cycle Conflict Detection', status: 'FAIL', details: e.message });
  }

  // TEST 9: Cycle Transitions Tracking & Confidence
  try {
    const candles = generateCandles(50, 100, 'ACCUMULATION');
    // Modify last bar to cross above EMA cluster with surging volume
    const last = candles[candles.length - 1];
    last.close = last.open + 2.5;
    last.volume = 300000;

    const cycle = analyzeMarketCycle(candles, '1h');
    const pass = cycle.transition !== undefined && cycle.transition.currentPhase === cycle.cycle;

    results.push({
      name: '9. Cycle Transitions Tracking & State Audit',
      status: pass ? 'PASS' : 'FAIL',
      details: `TransitionState: ${cycle.transitionState}, Confidence: ${cycle.transition?.transitionConfidence}%, Prev: ${cycle.transition?.previousPhase}`
    });
  } catch (e: any) {
    results.push({ name: '9. Cycle Transitions Tracking & State Audit', status: 'FAIL', details: e.message });
  }

  // TEST 10: Anti-Hindsight Protection (Strict Timestamp Bounding)
  try {
    const fullCandles = generateCandles(60, 100, 'MARKUP');
    const cutoffTimestamp = fullCandles[30].timestamp;

    const cycleWithFilter = analyzeMarketCycle(fullCandles, '1h', {
      evaluationTimestamp: cutoffTimestamp
    });

    const pass = cycleWithFilter.cycleDurationBars <= 31;

    results.push({
      name: '10. Anti-Hindsight Protection (Evaluation Timestamp Cutoff)',
      status: pass ? 'PASS' : 'FAIL',
      details: `Evaluated bars: ${cycleWithFilter.cycleDurationBars} (restricted to <= ${cutoffTimestamp})`
    });
  } catch (e: any) {
    results.push({ name: '10. Anti-Hindsight Protection', status: 'FAIL', details: e.message });
  }

  // TEST 11: Insufficient Data / Missing Data Fallback to UNKNOWN
  try {
    const shortCandles = generateCandles(10, 100, 'MARKUP');
    const cycle = analyzeMarketCycle(shortCandles, '1h');

    const pass = cycle.cycle === 'UNKNOWN' && cycle.cycleConfidence === 0 && cycle.stage === 'INSUFFICIENT_DATA';

    results.push({
      name: '11. Insufficient Data Fallback to UNKNOWN (No Data Fabrication)',
      status: pass ? 'PASS' : 'FAIL',
      details: `Cycle: ${cycle.cycle}, Stage: ${cycle.stage}, Confidence: ${cycle.cycleConfidence}`
    });
  } catch (e: any) {
    results.push({ name: '11. Insufficient Data Fallback', status: 'FAIL', details: e.message });
  }

  // TEST 12: CRITICAL INVARIANT: Market Cycle Never Independently Generates Signals
  try {
    const accumCandles = generateCandles(50, 100, 'ACCUMULATION');
    const distCandles = generateCandles(50, 100, 'DISTRIBUTION');

    // Feed to core intelligence without pattern/breakout triggers
    const resAccum = evaluateMarketWithCoreIntelligence({
      symbol: 'BTCUSDT',
      primaryCandles: accumCandles,
      baseTimeframe: '1h',
      timeframeCandlesMap: { '1h': accumCandles }
    });

    const resDist = evaluateMarketWithCoreIntelligence({
      symbol: 'BTCUSDT',
      primaryCandles: distCandles,
      baseTimeframe: '1h',
      timeframeCandlesMap: { '1h': distCandles }
    });

    // Both should yield WAIT because Accumulation / Distribution alone cannot force LONG or SHORT
    const pass = resAccum.decision === 'WAIT' && resDist.decision === 'WAIT';

    results.push({
      name: '12. INVARIANT: Market Cycle NEVER Independently Generates Signals',
      status: pass ? 'PASS' : 'FAIL',
      details: `Accumulation decision: ${resAccum.decision}, Distribution decision: ${resDist.decision} (Confluence only)`
    });
  } catch (e: any) {
    results.push({ name: '12. INVARIANT: Market Cycle NEVER Independently Generates Signals', status: 'FAIL', details: e.message });
  }

  // TEST 13: Deterministic Wyckoff Event Record Structure
  try {
    const candles = generateCandles(50, 100, 'ACCUMULATION');
    const events = detectWyckoffEvents(candles, 102, 98, 1.1);

    const hasAllAccum = ['PS', 'SC', 'AR', 'ST', 'SPRING', 'SOS', 'LPS'].every(k => events.accumulation[k] !== undefined);
    const hasAllDist = ['PSY', 'BC', 'AR', 'ST', 'UTAD', 'SOW', 'LPSY'].every(k => events.distribution[k] !== undefined);

    const pass = hasAllAccum && hasAllDist;

    results.push({
      name: '13. Deterministic Wyckoff Event Record Structure (7 Accum + 7 Dist)',
      status: pass ? 'PASS' : 'FAIL',
      details: `Accum keys present: ${hasAllAccum}, Dist keys present: ${hasAllDist}`
    });
  } catch (e: any) {
    results.push({ name: '13. Deterministic Wyckoff Event Record Structure', status: 'FAIL', details: e.message });
  }

  // TEST 14: Phase 10 Integration in Core Intelligence Output
  try {
    const markupCandles = generateCandles(60, 100, 'MARKUP');
    const result = evaluateMarketWithCoreIntelligence({
      symbol: 'ETHUSDT',
      primaryCandles: markupCandles,
      baseTimeframe: '1h',
      timeframeCandlesMap: { '1h': markupCandles, '4h': markupCandles }
    });

    const cycleReport = (result as any).coreIntelligence?.marketCycle || (result as any).marketCycle;
    const pass =
      cycleReport !== undefined &&
      cycleReport.cycle !== undefined &&
      cycleReport.effortVsResult !== undefined &&
      cycleReport.wyckoffEvents !== undefined;

    results.push({
      name: '14. Core Intelligence Integration (Signal & Metadata Attachment)',
      status: pass ? 'PASS' : 'FAIL',
      details: `Cycle attached: ${cycleReport?.cycle}, VSA attached: ${cycleReport?.effortVsResult?.classification}`
    });
  } catch (e: any) {
    results.push({ name: '14. Core Intelligence Integration', status: 'FAIL', details: e.message });
  }

  // TEST 15: Confluence & Contradiction Audit with Existing Intelligence
  try {
    const markupCandles = generateCandles(50, 100, 'MARKUP');
    const cycle = analyzeMarketCycle(markupCandles, '1h');

    const hasConfluence = cycle.confluenceNotes && cycle.confluenceNotes.length > 0;
    const isConfluent = cycle.isConfluentWithSignal === true;

    results.push({
      name: '15. Confluence & Contradiction Context Export',
      status: hasConfluence && isConfluent ? 'PASS' : 'FAIL',
      details: `Confluence notes: ${cycle.confluenceNotes?.join('; ')}`
    });
  } catch (e: any) {
    results.push({ name: '15. Confluence & Contradiction Context Export', status: 'FAIL', details: e.message });
  }

  // Summary
  console.log('\n----------------------------------------------------------------');
  results.forEach(r => {
    console.log(`${r.status === 'PASS' ? '✅' : '❌'} ${r.name}: ${r.details || ''}`);
  });
  console.log('----------------------------------------------------------------');
  const allPassed = results.every(r => r.status === 'PASS');
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.filter(r => r.status === 'PASS').length} | FAILED: ${results.filter(r => r.status === 'FAIL').length}`);
  console.log(`PHASE 10 VALIDATION STATUS: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log('----------------------------------------------------------------\n');

  return {
    passed: allPassed,
    testResults: results
  };
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv.includes('--run')) {
  runPhase10ValidationSuite().then(res => {
    if (!res.passed) {
      process.exit(1);
    }
  });
}
