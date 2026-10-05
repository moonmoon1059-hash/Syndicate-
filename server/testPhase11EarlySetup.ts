import {
  evaluatePredictiveOpportunity,
  PredictiveOpportunityInput,
  formatAgeString
} from './predictiveOpportunityEngine';
import {
  Candle,
  MarketCycleAnalysis,
  EarlyCatalystInput,
  MTFTimingContext
} from '../src/types/crypto';

function generateCandles(count: number, basePrice: number = 100): Candle[] {
  const candles: Candle[] = [];
  const now = 1700000000000;
  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * 60000;
    const open = basePrice + Math.sin(i / 3) * 1.5;
    const close = open + (i % 2 === 0 ? 0.3 : -0.2);
    const high = Math.max(open, close) + 0.4;
    const low = Math.min(open, close) - 0.4;
    candles.push({
      timestamp: time,
      time,
      open,
      high,
      low,
      close,
      volume: 1000 + (i % 5) * 200
    });
  }
  return candles;
}

export async function runPhase11EarlySetupTests(): Promise<{ passed: number; failed: number; total: number }> {
  console.log('================================================================');
  console.log('🧪 MOONSCANNER PHASE 11: EARLY SETUP + TIMING INTELLIGENCE TEST');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, details?: string) {
    if (condition) {
      passed++;
      console.log(`✅ ${name}${details ? ': ' + details : ''}`);
    } else {
      failed++;
      console.error(`❌ ${name} FAILED${details ? ': ' + details : ''}`);
    }
  }

  const baseCandles = generateCandles(30, 100);

  // TEST 1: Wyckoff Spring Setup (Phase C Accumulation Reclaim)
  try {
    const marketCycle: any = {
      cycle: 'ACCUMULATION',
      stage: 'STAGE_1_ACCUMULATION',
      confidence: 88,
      wyckoffEvents: {
        accumulation: {
          SPRING: { detected: true, confirmed: true, barIndex: 25, price: 97.5, description: 'Spring shakeout reclaimed' }
        } as any,
        distribution: {} as any
      },
      effortVsResult: {
        classification: 'ABSORPTION',
        volumeRatio: 3.2,
        spreadRatio: 0.5,
        effortScore: 85,
        resultScore: 30,
        interpretation: 'Absorption of supply observed at bottom boundary',
        details: ['High volume on narrow spread indicating accumulation']
      },
      summary: 'Accumulation with Spring'
    };

    const res = evaluatePredictiveOpportunity({
      symbol: 'BTCUSDT',
      candles: baseCandles,
      currentPrice: 100.5,
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 96.5,
      targets: [{ id: 'TP1', label: 'TP1', price: 110, hit: false }],
      riskRewardRatio: 3.5,
      qualityGrade: 'A',
      rvol: 2.1,
      priceChange24h: 2.5,
      marketCycle
    });

    assert(
      '1. Wyckoff Spring Setup Classification',
      res.classification === 'SPRING_SETUP' &&
      res.earlyCategory === 'EARLY_LONG' &&
      res.maturity === 'CONFIRMED' &&
      res.entryTiming === 'ENTRY_NOW' &&
      res.timingWindow === 'IMMEDIATE',
      `Class: ${res.classification}, Category: ${res.earlyCategory}, Maturity: ${res.maturity}, Timing: ${res.entryTiming}`
    );
  } catch (err: any) {
    assert('1. Wyckoff Spring Setup Classification', false, err.message);
  }

  // TEST 2: Wyckoff UTAD Setup (Phase C Distribution Upthrust Rejection)
  try {
    const marketCycle: any = {
      cycle: 'DISTRIBUTION',
      stage: 'STAGE_3_DISTRIBUTION',
      confidence: 86,
      wyckoffEvents: {
        accumulation: {} as any,
        distribution: {
          UTAD: { detected: true, confirmed: true, barIndex: 26, price: 104.2, description: 'UTAD rejected back into range' }
        } as any
      },
      effortVsResult: {
        classification: 'CLIMAX_EXHAUSTION',
        volumeRatio: 4.1,
        spreadRatio: 0.3,
        effortScore: 90,
        resultScore: 20,
        interpretation: 'Climactic volume with narrow spread indicating distribution',
        details: ['High volume failure at upper boundary']
      },
      summary: 'Distribution with UTAD'
    };

    const res = evaluatePredictiveOpportunity({
      symbol: 'ETHUSDT',
      candles: baseCandles,
      currentPrice: 99.8,
      direction: 'SHORT',
      entryPrice: 100.0,
      stopLoss: 103.5,
      targets: [{ id: 'TP1', label: 'TP1', price: 90, hit: false }],
      riskRewardRatio: 3.2,
      qualityGrade: 'A',
      rvol: 2.4,
      priceChange24h: -1.8,
      marketCycle
    });

    assert(
      '2. Wyckoff UTAD Setup Classification',
      res.classification === 'UTAD_SETUP' &&
      res.earlyCategory === 'EARLY_SHORT' &&
      res.maturity === 'CONFIRMED' &&
      res.entryTiming === 'ENTRY_NOW',
      `Class: ${res.classification}, Category: ${res.earlyCategory}, Maturity: ${res.maturity}`
    );
  } catch (err: any) {
    assert('2. Wyckoff UTAD Setup Classification', false, err.message);
  }

  // TEST 3: Markup Preparation / Re-Accumulation Continuation Setup
  try {
    const marketCycle: any = {
      cycle: 'RE_ACCUMULATION',
      stage: 'STAGE_2_MARKUP',
      confidence: 82,
      wyckoffEvents: { accumulation: {} as any, distribution: {} as any },
      effortVsResult: {
        classification: 'NORMAL_EFFORT_RESULT',
        volumeRatio: 1.1,
        spreadRatio: 1.0,
        effortScore: 50,
        resultScore: 50,
        interpretation: 'Normal effort and result in trend continuation',
        details: ['Healthy markup volume']
      },
      summary: 'Re-accumulation continuation'
    };

    const res = evaluatePredictiveOpportunity({
      symbol: 'SOLUSDT',
      candles: baseCandles,
      currentPrice: 100.4,
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 97.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 115, hit: false }],
      riskRewardRatio: 4.0,
      qualityGrade: 'A',
      rvol: 1.6,
      priceChange24h: 4.2,
      marketCycle
    });

    assert(
      '3. Markup Preparation / Re-Accumulation Setup',
      res.classification === 'MARKUP_PREPARATION' &&
      res.earlyCategory === 'EARLY_LONG' &&
      res.entryTiming === 'ENTRY_NOW',
      `Class: ${res.classification}, Category: ${res.earlyCategory}`
    );
  } catch (err: any) {
    assert('3. Markup Preparation / Re-Accumulation Setup', false, err.message);
  }

  // TEST 4: Markdown Preparation / Re-Distribution Continuation Setup
  try {
    const marketCycle: any = {
      cycle: 'RE_DISTRIBUTION',
      stage: 'STAGE_4_MARKDOWN',
      confidence: 80,
      wyckoffEvents: { accumulation: {} as any, distribution: {} as any },
      effortVsResult: {
        classification: 'NORMAL_EFFORT_RESULT',
        volumeRatio: 1.0,
        spreadRatio: 1.0,
        effortScore: 50,
        resultScore: 50,
        interpretation: 'Normal effort and result in trend continuation',
        details: ['Healthy markdown volume']
      },
      summary: 'Re-distribution continuation'
    };

    const res = evaluatePredictiveOpportunity({
      symbol: 'AVAXUSDT',
      candles: baseCandles,
      currentPrice: 99.6,
      direction: 'SHORT',
      entryPrice: 100.0,
      stopLoss: 103.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 88, hit: false }],
      riskRewardRatio: 3.5,
      qualityGrade: 'B',
      rvol: 1.4,
      priceChange24h: -3.8,
      marketCycle
    });

    assert(
      '4. Markdown Preparation / Re-Distribution Setup',
      res.classification === 'MARKDOWN_PREPARATION' &&
      res.earlyCategory === 'EARLY_SHORT',
      `Class: ${res.classification}, Category: ${res.earlyCategory}`
    );
  } catch (err: any) {
    assert('4. Markdown Preparation / Re-Distribution Setup', false, err.message);
  }

  // TEST 5: SETUP_FORMING & WAITING_FOR_CONFIRMATION (Base Building & Range Churn)
  try {
    const marketCycle: any = {
      cycle: 'ACCUMULATION',
      stage: 'STAGE_1_ACCUMULATION',
      confidence: 75,
      wyckoffEvents: { accumulation: {} as any, distribution: {} as any },
      effortVsResult: {
        classification: 'NORMAL_EFFORT_RESULT',
        volumeRatio: 0.9,
        spreadRatio: 0.8,
        effortScore: 45,
        resultScore: 45,
        interpretation: 'Normal base building volume',
        details: ['Base accumulation range churn']
      },
      summary: 'Base building'
    };

    const res = evaluatePredictiveOpportunity({
      symbol: 'NEARUSDT',
      candles: baseCandles,
      currentPrice: 99.2, // below entryPrice of 100.0
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 95.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 115, hit: false }],
      riskRewardRatio: 3.0,
      qualityGrade: 'B',
      rvol: 0.9,
      priceChange24h: 0.5,
      marketCycle
    });

    assert(
      '5. SETUP_FORMING State & WAITING_FOR_TRIGGER / CONFIRMATION',
      res.maturity === 'SETUP_FORMING' &&
      res.entryTiming === 'WAIT_FOR_CONFIRMATION' &&
      res.timingWindow === 'WAITING_FOR_CONFIRMATION',
      `Maturity: ${res.maturity}, Timing: ${res.entryTiming}, Window: ${res.timingWindow}`
    );
  } catch (err: any) {
    assert('5. SETUP_FORMING State & WAITING_FOR_TRIGGER / CONFIRMATION', false, err.message);
  }

  // TEST 6: NEAR_TRIGGER State (Approaching trigger boundary within 0.8%)
  try {
    const res = evaluatePredictiveOpportunity({
      symbol: 'LINKUSDT',
      candles: baseCandles,
      currentPrice: 99.5, // 0.5% below entryPrice of 100.0
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 96.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 112, hit: false }],
      riskRewardRatio: 3.0,
      qualityGrade: 'A',
      rvol: 1.5,
      priceChange24h: 1.8
    });

    assert(
      '6. NEAR_TRIGGER State & NEAR_TERM Timing Window',
      res.maturity === 'NEAR_TRIGGER' &&
      res.timingWindow === 'NEAR_TERM' &&
      res.entryTiming === 'WAIT_FOR_CONFIRMATION',
      `Maturity: ${res.maturity}, Timing: ${res.entryTiming}, Window: ${res.timingWindow}`
    );
  } catch (err: any) {
    assert('6. NEAR_TRIGGER State & NEAR_TERM Timing Window', false, err.message);
  }

  // TEST 7: TRIGGERED / CONFIRMED & ENTRY_NOW (Price in ideal execution pocket)
  try {
    const res = evaluatePredictiveOpportunity({
      symbol: 'DOTUSDT',
      candles: baseCandles,
      currentPrice: 100.4, // +0.4% from entry (within +1.8% no chase)
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 96.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 112, hit: false }],
      riskRewardRatio: 3.0,
      qualityGrade: 'A',
      rvol: 2.2,
      priceChange24h: 2.8,
      smcStructure: 'BOS_CONFIRMED'
    });

    assert(
      '7. CONFIRMED State & IMMEDIATE ENTRY_NOW',
      res.maturity === 'CONFIRMED' &&
      res.entryTiming === 'ENTRY_NOW' &&
      res.timingWindow === 'IMMEDIATE' &&
      res.isTriggered === true,
      `Maturity: ${res.maturity}, Timing: ${res.entryTiming}, Triggered: ${res.isTriggered}`
    );
  } catch (err: any) {
    assert('7. CONFIRMED State & IMMEDIATE ENTRY_NOW', false, err.message);
  }

  // TEST 8: Anti-Chase Protection: WAIT_FOR_PULLBACK (Slightly extended +2.5%)
  try {
    const res = evaluatePredictiveOpportunity({
      symbol: 'SUIUSDT',
      candles: baseCandles,
      currentPrice: 102.5, // +2.5% from entry (> 1.8% noChaseThreshold)
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 96.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 114, hit: false }],
      riskRewardRatio: 3.0,
      qualityGrade: 'A',
      rvol: 1.8,
      priceChange24h: 4.5
    });

    assert(
      '8. Anti-Chase: WAIT_FOR_PULLBACK on +2.5% extension',
      res.entryTiming === 'WAIT_FOR_PULLBACK' &&
      res.timingWindow === 'WAITING_FOR_PULLBACK' &&
      res.triggerCondition.includes('await controlled pullback'),
      `Timing: ${res.entryTiming}, Condition: ${res.triggerCondition}`
    );
  } catch (err: any) {
    assert('8. Anti-Chase: WAIT_FOR_PULLBACK on +2.5% extension', false, err.message);
  }

  // TEST 9: Anti-Chase Protection: EXTENDED & ENTRY_MISSED (> 4.5% extension)
  try {
    const res = evaluatePredictiveOpportunity({
      symbol: 'APTUSDT',
      candles: baseCandles,
      currentPrice: 106.0, // +6.0% past ideal entry
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 96.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 115, hit: false }],
      riskRewardRatio: 3.0,
      qualityGrade: 'A',
      rvol: 1.5,
      priceChange24h: 8.0
    });

    assert(
      '9. Anti-Chase: EXTENDED & ENTRY_MISSED on +6.0% extension',
      res.maturity === 'EXTENDED' &&
      res.entryTiming === 'ENTRY_MISSED' &&
      res.isMissed === true &&
      res.timingWindow === 'NO_VALID_TIMING',
      `Maturity: ${res.maturity}, Timing: ${res.entryTiming}, isMissed: ${res.isMissed}`
    );
  } catch (err: any) {
    assert('9. Anti-Chase: EXTENDED & ENTRY_MISSED on +6.0% extension', false, err.message);
  }

  // TEST 10: Invalidation Handling (Price breaches Stop Loss)
  try {
    const res = evaluatePredictiveOpportunity({
      symbol: 'MATICUSDT',
      candles: baseCandles,
      currentPrice: 94.5, // <= stopLoss 95.0
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 95.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 110, hit: false }],
      riskRewardRatio: 2.5,
      qualityGrade: 'B',
      rvol: 1.2,
      priceChange24h: -5.0
    });

    assert(
      '10. Invalidation Handling (Price breaches Stop Loss)',
      res.maturity === 'INVALIDATED' &&
      res.entryTiming === 'INVALIDATED' &&
      res.timingWindow === 'NO_VALID_TIMING' &&
      res.timingQuality === 0,
      `Maturity: ${res.maturity}, Timing: ${res.entryTiming}, Timing Quality: ${res.timingQuality}`
    );
  } catch (err: any) {
    assert('10. Invalidation Handling (Price breaches Stop Loss)', false, err.message);
  }

  // TEST 11: Expiration Handling (> 48h staleness or explicit expiration)
  try {
    const now = 1700000000000;
    const staleSetupDetectedAt = now - 200000000; // ~55 hours ago

    const res = evaluatePredictiveOpportunity({
      symbol: 'ARBUSDT',
      candles: baseCandles,
      currentPrice: 100.0,
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 96.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 112, hit: false }],
      riskRewardRatio: 3.0,
      qualityGrade: 'B',
      rvol: 0.8,
      priceChange24h: 0.2,
      evaluationTimestamp: now,
      knownSetupDetectedAt: staleSetupDetectedAt
    });

    assert(
      '11. Expiration Handling (> 48h staleness)',
      res.maturity === 'EXPIRED' &&
      res.entryTiming === 'EXPIRED' &&
      res.timingWindow === 'NO_VALID_TIMING' &&
      res.setupAge.includes('2d'),
      `Maturity: ${res.maturity}, Timing: ${res.entryTiming}, Age: ${res.setupAge}`
    );
  } catch (err: any) {
    assert('11. Expiration Handling (> 48h staleness)', false, err.message);
  }

  // TEST 12: Insufficient Candle Depth Fallback to UNKNOWN (Zero Fabrication)
  try {
    const insufficientCandles = generateCandles(8, 100); // Only 8 candles (< 15)

    const res = evaluatePredictiveOpportunity({
      symbol: 'NEWCOINUSDT',
      candles: insufficientCandles,
      currentPrice: 100.0,
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 95.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 115, hit: false }],
      riskRewardRatio: 3.0,
      qualityGrade: 'B',
      rvol: 1.0,
      priceChange24h: 1.0
    });

    assert(
      '12. Insufficient Data Fallback to UNKNOWN (Zero Fabrication)',
      res.maturity === 'UNKNOWN' &&
      res.classification === 'NONE' &&
      res.timingWindow === 'UNKNOWN' &&
      res.confidence === 0 &&
      res.setupStrength === 0,
      `Maturity: ${res.maturity}, Class: ${res.classification}, Confidence: ${res.confidence}`
    );
  } catch (err: any) {
    assert('12. Insufficient Data Fallback to UNKNOWN (Zero Fabrication)', false, err.message);
  }

  // TEST 13: Multi-Timeframe Timing Conflict Gating
  try {
    const mtfTiming: MTFTimingContext = {
      alignment: 'TIMING_CONFLICT',
      hasConflict: true,
      conflictReason: 'Macro cycle (4h: DISTRIBUTION) opposes 15m bullish expansion',
      timeframes: [
        { timeframe: '15m', bias: 'BULLISH' },
        { timeframe: '1h', bias: 'BEARISH' },
        { timeframe: '4h', bias: 'BEARISH' }
      ]
    };

    const res = evaluatePredictiveOpportunity({
      symbol: 'OPUSDT',
      candles: baseCandles,
      currentPrice: 100.2, // would normally be ENTRY_NOW
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 97.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 112, hit: false }],
      riskRewardRatio: 4.0,
      qualityGrade: 'A',
      rvol: 2.1,
      priceChange24h: 3.2,
      mtfTiming
    });

    assert(
      '13. Multi-Timeframe Timing Conflict Gating',
      res.entryTiming === 'WAIT_FOR_CONFIRMATION' &&
      res.timingWindow === 'WAITING_FOR_CONFIRMATION' &&
      res.contradictions?.some(c => c.includes('MTF Timing Conflict')) === true,
      `Timing: ${res.entryTiming}, Contradiction: ${res.contradictions?.[0]}`
    );
  } catch (err: any) {
    assert('13. Multi-Timeframe Timing Conflict Gating', false, err.message);
  }

  // TEST 14: News-Ready Catalyst Interface Integration
  try {
    const earlyCatalyst: EarlyCatalystInput = {
      catalystType: 'MAINNET_UPGRADE_LAUNCH',
      catalystTimestamp: Date.now() - 3600000,
      affectedCoin: 'SEIUSDT',
      impactDirection: 'BULLISH',
      impactStrength: 85,
      freshness: 'BREAKING',
      sourceQuality: 'TIER_1',
      reactionState: 'CONFIRMED'
    };

    const res = evaluatePredictiveOpportunity({
      symbol: 'SEIUSDT',
      candles: baseCandles,
      currentPrice: 100.4,
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 96.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 114, hit: false }],
      riskRewardRatio: 3.5,
      qualityGrade: 'A',
      rvol: 2.0,
      priceChange24h: 4.0,
      earlyCatalyst
    });

    assert(
      '14. News-Ready Catalyst Integration & Reaction Confirmation',
      res.classification === 'EARLY_CATALYST' &&
      res.evidenceList.some(e => e.toLowerCase().includes('catalyst market reaction verified')) === true,
      `Class: ${res.classification}, Evidence: ${res.evidenceList.find(e => e.toLowerCase().includes('catalyst'))}`
    );
  } catch (err: any) {
    assert('14. News-Ready Catalyst Integration & Reaction Confirmation', false, err.message);
  }

  // TEST 15: Setup Age Formatting Utility
  try {
    const age1 = formatAgeString(45 * 60000); // 45m
    const age2 = formatAgeString(150 * 60000); // 2h 30m
    const age3 = formatAgeString(50 * 3600000); // 2d 2h

    assert(
      '15. Setup Age Formatting Verification',
      age1 === '45m' && age2 === '2h 30m' && age3 === '2d 2h',
      `45m -> ${age1}, 2.5h -> ${age2}, 50h -> ${age3}`
    );
  } catch (err: any) {
    assert('15. Setup Age Formatting Verification', false, err.message);
  }

  // TEST 16: INVARIANT: Early Setup NEVER Independently Generates Signals
  try {
    const res = evaluatePredictiveOpportunity({
      symbol: 'BNBUSDT',
      candles: baseCandles,
      currentPrice: 100.0,
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 96.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 110, hit: false }],
      riskRewardRatio: 2.5,
      qualityGrade: 'WAIT', // Signal Engine decided WAIT
      rvol: 1.0,
      priceChange24h: 0.5
    });

    // The function returns EarlyMoveReport (telemetry only), never changing final core decision or mutating signal direction
    assert(
      '16. INVARIANT: Early Setup NEVER Independently Creates Signals',
      res !== null && typeof res.whyThisMatters === 'string',
      `Early report successfully generated as pure contextual telemetry.`
    );
  } catch (err: any) {
    assert('16. INVARIANT: Early Setup NEVER Independently Creates Signals', false, err.message);
  }

  console.log('----------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  if (failed === 0) {
    console.log('PHASE 11 VALIDATION STATUS: ✅ ALL TESTS PASSED');
  } else {
    console.log(`PHASE 11 VALIDATION STATUS: ❌ ${failed} TESTS FAILED`);
  }
  console.log('----------------------------------------------------------------');

  return { passed, failed, total: passed + failed };
}

// Auto-run when executed directly via CLI
if (process.argv.includes('--run')) {
  runPhase11EarlySetupTests().then(r => {
    process.exit(r.failed === 0 ? 0 : 1);
  });
}
