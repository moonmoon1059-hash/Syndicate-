import {
  evaluatePrimarySetupCategory,
  CategoryEvaluationInput
} from './categoryIntelligenceEngine';
import {
  Candle,
  PrimarySetupCategory,
  LongSetupCategory,
  ShortSetupCategory
} from '../src/types/crypto';
import { upsertSignals, getAllStoredSignals, resetSignalStoreForTesting } from './signalTracker';

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

export async function runPhase12CategoryIntelligenceTests(): Promise<{ passed: number; failed: number; total: number }> {
  console.log('================================================================');
  console.log('🧪 MOONSCANNER PHASE 12: CATEGORY INTELLIGENCE TEST SUITE');
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

  // --------------------------------------------------------------------------
  // TEST 1: Insufficient Candle Depth (< 15 bars) -> UNKNOWN (Zero Fabrication)
  // --------------------------------------------------------------------------
  try {
    const shortCandles = generateCandles(10, 100);
    const rep = evaluatePrimarySetupCategory({
      symbol: 'BTCUSDT',
      direction: 'LONG',
      candles: shortCandles,
      currentPrice: 100,
      entryPrice: 100
    });
    assert('T1.1: Shallow candles (< 15 bars) return UNKNOWN', rep.primaryCategory === 'UNKNOWN');
    assert('T1.2: Shallow candles confidence is 0', rep.confidence === 0);
  } catch (e: any) {
    assert('T1: Exception', false, e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Direction is WAIT -> Primary Category is WAIT
  // --------------------------------------------------------------------------
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'SOLUSDT',
      direction: 'WAIT',
      decision: 'WAIT',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100
    });
    assert('T2.1: Direction WAIT yields primaryCategory WAIT', rep.primaryCategory === 'WAIT');
    assert('T2.2: Direction WAIT confidence is 0', rep.confidence === 0);
  } catch (e: any) {
    assert('T2: Exception', false, e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: LONG Category Family Verification
  // --------------------------------------------------------------------------
  // 3A: SPRING_LONG
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'ETHUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      marketCycle: {
        cycle: 'ACCUMULATION',
        wyckoffEvents: { accumulation: { SPRING: { detected: true } } }
      } as any
    });
    assert('T3A: SPRING_LONG detected from Wyckoff Spring', rep.primaryCategory === 'SPRING_LONG');
  } catch (e: any) {
    assert('T3A: Exception', false, e.message);
  }

  // 3B: LIQUIDITY_RECLAIM_LONG
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'AVAXUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      smcStructureReport: { structureType: 'LIQUIDITY_GRAB_LOW' }
    });
    assert('T3B: LIQUIDITY_RECLAIM_LONG detected from liquidity grab low', rep.primaryCategory === 'LIQUIDITY_RECLAIM_LONG');
  } catch (e: any) {
    assert('T3B: Exception', false, e.message);
  }

  // 3C: BREAKOUT_RETEST_LONG
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'LINKUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 101,
      entryPrice: 101,
      retestLevel: 100,
      entryStatus: 'WAIT_FOR_RETEST'
    });
    assert('T3C: BREAKOUT_RETEST_LONG detected', rep.primaryCategory === 'BREAKOUT_RETEST_LONG');
  } catch (e: any) {
    assert('T3C: Exception', false, e.message);
  }

  // 3D: BREAKOUT_LONG
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'NEARUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 105,
      entryPrice: 105,
      breakoutEvaluation: { isBreakout: true },
      rvol: 2.2
    });
    assert('T3D: BREAKOUT_LONG detected', rep.primaryCategory === 'BREAKOUT_LONG');
  } catch (e: any) {
    assert('T3D: Exception', false, e.message);
  }

  // 3E: PULLBACK_LONG
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'DOTUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 99,
      entryPrice: 100,
      entryStatus: 'WAIT_FOR_PULLBACK',
      pullbackZone: { isInside: true }
    });
    assert('T3E: PULLBACK_LONG detected', rep.primaryCategory === 'PULLBACK_LONG');
  } catch (e: any) {
    assert('T3E: Exception', false, e.message);
  }

  // 3F: ACCUMULATION_LONG
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'ADAUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      marketCycle: { cycle: 'ACCUMULATION', stage: 'STAGE_1_ACCUMULATION' } as any
    });
    assert('T3F: ACCUMULATION_LONG detected', rep.primaryCategory === 'ACCUMULATION_LONG');
  } catch (e: any) {
    assert('T3F: Exception', false, e.message);
  }

  // 3G: TREND_CONTINUATION_LONG
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'SUIUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      marketCycle: { cycle: 'RE_ACCUMULATION', stage: 'STAGE_2_MARKUP' } as any
    });
    assert('T3G: TREND_CONTINUATION_LONG detected', rep.primaryCategory === 'TREND_CONTINUATION_LONG');
  } catch (e: any) {
    assert('T3G: Exception', false, e.message);
  }

  // 3H: MOMENTUM_EXPANSION_LONG
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'APTUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      rvol: 2.8,
      priceChange24h: 8.5
    });
    assert('T3H: MOMENTUM_EXPANSION_LONG detected with high RVOL', rep.primaryCategory === 'MOMENTUM_EXPANSION_LONG');
  } catch (e: any) {
    assert('T3H: Exception', false, e.message);
  }

  // 3I: CATALYST_LONG
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'OPUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      earlyCatalyst: { impactDirection: 'BULLISH', reactionState: 'CONFIRMED' } as any
    });
    assert('T3I: CATALYST_LONG detected from bullish early catalyst', rep.primaryCategory === 'CATALYST_LONG');
  } catch (e: any) {
    assert('T3I: Exception', false, e.message);
  }

  // 3J: RELATIVE_STRENGTH_LONG
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'INJUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      rsScoreVsBtc: 82,
      relativeStrengthReport: { leadershipState: 'LEADER' }
    });
    assert('T3J: RELATIVE_STRENGTH_LONG detected', rep.primaryCategory === 'RELATIVE_STRENGTH_LONG');
  } catch (e: any) {
    assert('T3J: Exception', false, e.message);
  }

  // 3K: HIGH_ASYMMETRY_LONG
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'TIAUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      riskRewardRatio: 4.5
    });
    assert('T3K: HIGH_ASYMMETRY_LONG detected from R:R 4.5', rep.primaryCategory === 'HIGH_ASYMMETRY_LONG');
  } catch (e: any) {
    assert('T3K: Exception', false, e.message);
  }

  // 3L: EARLY_LONG
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'SEIUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      setupMaturity: 'SETUP_FORMING'
    });
    assert('T3L: EARLY_LONG detected for forming setup', rep.primaryCategory === 'EARLY_LONG');
  } catch (e: any) {
    assert('T3L: Exception', false, e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 4: SHORT Category Family Verification
  // --------------------------------------------------------------------------
  // 4A: UTAD_SHORT
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'BNBUSDT',
      direction: 'SHORT',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      marketCycle: {
        cycle: 'DISTRIBUTION',
        wyckoffEvents: { distribution: { UTAD: { detected: true } } }
      } as any
    });
    assert('T4A: UTAD_SHORT detected from Wyckoff UTAD', rep.primaryCategory === 'UTAD_SHORT');
  } catch (e: any) {
    assert('T4A: Exception', false, e.message);
  }

  // 4B: LIQUIDITY_REJECTION_SHORT
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'XRPUSDT',
      direction: 'SHORT',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      smcStructureReport: { structureType: 'LIQUIDITY_GRAB_HIGH' }
    });
    assert('T4B: LIQUIDITY_REJECTION_SHORT detected', rep.primaryCategory === 'LIQUIDITY_REJECTION_SHORT');
  } catch (e: any) {
    assert('T4B: Exception', false, e.message);
  }

  // 4C: BREAKDOWN_RETEST_SHORT
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'DOGEUSDT',
      direction: 'SHORT',
      candles: baseCandles,
      currentPrice: 99,
      entryPrice: 99,
      retestLevel: 100,
      entryStatus: 'WAIT_FOR_RETEST'
    });
    assert('T4C: BREAKDOWN_RETEST_SHORT detected', rep.primaryCategory === 'BREAKDOWN_RETEST_SHORT');
  } catch (e: any) {
    assert('T4C: Exception', false, e.message);
  }

  // 4D: BREAKDOWN_SHORT
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'LTCUSDT',
      direction: 'SHORT',
      candles: baseCandles,
      currentPrice: 95,
      entryPrice: 95,
      smcStructureReport: { structureType: 'BOS_DOWN' },
      rvol: 2.1,
      priceChange24h: -3.5
    });
    assert('T4D: BREAKDOWN_SHORT detected', rep.primaryCategory === 'BREAKDOWN_SHORT');
  } catch (e: any) {
    assert('T4D: Exception', false, e.message);
  }

  // 4E: PULLBACK_SHORT
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'BCHUSDT',
      direction: 'SHORT',
      candles: baseCandles,
      currentPrice: 101,
      entryPrice: 100,
      entryStatus: 'WAIT_FOR_PULLBACK',
      pullbackZone: { isInside: true }
    });
    assert('T4E: PULLBACK_SHORT detected', rep.primaryCategory === 'PULLBACK_SHORT');
  } catch (e: any) {
    assert('T4E: Exception', false, e.message);
  }

  // 4F: DISTRIBUTION_SHORT
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'ATOMUSDT',
      direction: 'SHORT',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      marketCycle: { cycle: 'DISTRIBUTION', stage: 'STAGE_3_DISTRIBUTION' } as any
    });
    assert('T4F: DISTRIBUTION_SHORT detected', rep.primaryCategory === 'DISTRIBUTION_SHORT');
  } catch (e: any) {
    assert('T4F: Exception', false, e.message);
  }

  // 4G: TREND_CONTINUATION_SHORT
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'FTMUSDT',
      direction: 'SHORT',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      marketCycle: { cycle: 'RE_DISTRIBUTION', stage: 'STAGE_4_MARKDOWN' } as any
    });
    assert('T4G: TREND_CONTINUATION_SHORT detected', rep.primaryCategory === 'TREND_CONTINUATION_SHORT');
  } catch (e: any) {
    assert('T4G: Exception', false, e.message);
  }

  // 4H: MOMENTUM_EXPANSION_SHORT
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'ALGOUSDT',
      direction: 'SHORT',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      rvol: 2.5,
      earlyMoveReport: { classification: 'UNUSUAL_VOLUME' } as any
    });
    assert('T4H: MOMENTUM_EXPANSION_SHORT detected', rep.primaryCategory === 'MOMENTUM_EXPANSION_SHORT');
  } catch (e: any) {
    assert('T4H: Exception', false, e.message);
  }

  // 4I: CATALYST_DUMP_SHORT
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'SANDUSDT',
      direction: 'SHORT',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      earlyCatalyst: { impactDirection: 'BEARISH' } as any
    });
    assert('T4I: CATALYST_DUMP_SHORT detected', rep.primaryCategory === 'CATALYST_DUMP_SHORT');
  } catch (e: any) {
    assert('T4I: Exception', false, e.message);
  }

  // 4J: RELATIVE_WEAKNESS_SHORT
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'MANAUSDT',
      direction: 'SHORT',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      rsScoreVsBtc: 24,
      relativeStrengthReport: { leadershipState: 'LAGGING' }
    });
    assert('T4J: RELATIVE_WEAKNESS_SHORT detected', rep.primaryCategory === 'RELATIVE_WEAKNESS_SHORT');
  } catch (e: any) {
    assert('T4J: Exception', false, e.message);
  }

  // 4K: HIGH_ASYMMETRY_SHORT
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'KASUSDT',
      direction: 'SHORT',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      riskRewardRatio: 3.8
    });
    assert('T4K: HIGH_ASYMMETRY_SHORT detected', rep.primaryCategory === 'HIGH_ASYMMETRY_SHORT');
  } catch (e: any) {
    assert('T4K: Exception', false, e.message);
  }

  // 4L: EARLY_SHORT
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'PEPEUSDT',
      direction: 'SHORT',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      setupMaturity: 'EARLY_SETUP'
    });
    assert('T4L: EARLY_SHORT detected', rep.primaryCategory === 'EARLY_SHORT');
  } catch (e: any) {
    assert('T4L: Exception', false, e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Deterministic Priority & Confluences
  // --------------------------------------------------------------------------
  // When multiple evidences exist (e.g. Wyckoff Spring + R:R 4.0 + High RVOL),
  // SPRING_LONG must win as primary, while HIGH_ASYMMETRY_LONG & MOMENTUM_EXPANSION_LONG become confluences.
  try {
    const rep = evaluatePrimarySetupCategory({
      symbol: 'SOLUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 100,
      entryPrice: 100,
      riskRewardRatio: 4.0,
      rvol: 2.5,
      marketCycle: {
        cycle: 'ACCUMULATION',
        wyckoffEvents: { accumulation: { SPRING: { detected: true } } }
      } as any
    });
    assert('T5.1: SPRING_LONG wins primary priority over generic asymmetry/rvol', rep.primaryCategory === 'SPRING_LONG');
    assert('T5.2: Confluences list contains secondary candidate setups', rep.categoryConfluences.length >= 2);
    assert('T5.3: Confluences include HIGH_ASYMMETRY_LONG', rep.categoryConfluences.includes('HIGH_ASYMMETRY_LONG'));
    assert('T5.4: Confluences include MOMENTUM_EXPANSION_LONG', rep.categoryConfluences.includes('MOMENTUM_EXPANSION_LONG'));
  } catch (e: any) {
    assert('T5: Exception', false, e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Category Transitions for the SAME Opportunity (No Duplicate Signals)
  // --------------------------------------------------------------------------
  try {
    resetSignalStoreForTesting();

    // Step 1: Coin first detected in EARLY_LONG
    const rep1 = evaluatePrimarySetupCategory({
      symbol: 'SUIUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 1.50,
      entryPrice: 1.50,
      setupMaturity: 'EARLY_SETUP'
    });
    assert('T6.1: Initial evaluation is EARLY_LONG', rep1.primaryCategory === 'EARLY_LONG');

    const baseSignal: any = {
      id: 'SUIUSDT-1h-LONG-12345',
      symbol: 'SUIUSDT',
      timeframe: '1h',
      direction: 'LONG',
      status: 'NEW',
      qualityGrade: 'A',
      currentPrice: 1.50,
      entryPrice: 1.50,
      primaryCategory: rep1.primaryCategory,
      categoryConfluences: rep1.categoryConfluences,
      categoryIntelligence: rep1,
      createdAt: Date.now()
    };

    upsertSignals([baseSignal]);
    let stored = getAllStoredSignals();
    assert('T6.2: Exactly 1 signal in store for SUIUSDT', stored.length === 1 && stored[0].symbol === 'SUIUSDT');

    // Step 2: Same coin breaks out -> BREAKOUT_LONG transition
    const rep2 = evaluatePrimarySetupCategory({
      symbol: 'SUIUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 1.58,
      entryPrice: 1.55,
      breakoutEvaluation: { isBreakout: true },
      previousCategory: rep1.primaryCategory,
      categoryTransitionHistory: rep1.transitionHistory
    });
    assert('T6.3: Next evaluation is BREAKOUT_LONG', rep2.primaryCategory === 'BREAKOUT_LONG');
    assert('T6.4: Transition recorded in history', rep2.transitionHistory.length === 1);
    assert('T6.5: Transition from EARLY_LONG to BREAKOUT_LONG',
      rep2.transitionHistory[0].fromCategory === 'EARLY_LONG' &&
      rep2.transitionHistory[0].toCategory === 'BREAKOUT_LONG'
    );

    const updatedSignal1: any = {
      ...baseSignal,
      currentPrice: 1.58,
      primaryCategory: rep2.primaryCategory,
      previousCategory: rep2.previousCategory,
      categoryTransitionHistory: rep2.transitionHistory
    };

    upsertSignals([updatedSignal1]);
    stored = getAllStoredSignals();
    assert('T6.6: Still exactly 1 signal stored for SUIUSDT (no duplication invariant)', stored.length === 1);
    assert('T6.7: Stored signal updated to BREAKOUT_LONG', stored[0].primaryCategory === 'BREAKOUT_LONG');

    // Step 3: Same coin retests broken resistance -> BREAKOUT_RETEST_LONG transition
    const rep3 = evaluatePrimarySetupCategory({
      symbol: 'SUIUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 1.56,
      entryPrice: 1.55,
      entryStatus: 'WAIT_FOR_RETEST',
      retestLevel: 1.55,
      previousCategory: rep2.primaryCategory,
      categoryTransitionHistory: rep2.transitionHistory
    });
    assert('T6.8: Next evaluation is BREAKOUT_RETEST_LONG', rep3.primaryCategory === 'BREAKOUT_RETEST_LONG');
    assert('T6.9: History contains 2 chained transitions', rep3.transitionHistory.length === 2);
    assert('T6.10: Second transition is BREAKOUT_LONG -> BREAKOUT_RETEST_LONG',
      rep3.transitionHistory[1].fromCategory === 'BREAKOUT_LONG' &&
      rep3.transitionHistory[1].toCategory === 'BREAKOUT_RETEST_LONG'
    );

    const updatedSignal2: any = {
      ...baseSignal,
      currentPrice: 1.56,
      primaryCategory: rep3.primaryCategory,
      previousCategory: rep3.previousCategory,
      categoryTransitionHistory: rep3.transitionHistory
    };

    upsertSignals([updatedSignal2]);
    stored = getAllStoredSignals();
    assert('T6.11: Still exactly 1 signal in store after 2 transitions', stored.length === 1);
    assert('T6.12: Final stored primaryCategory is BREAKOUT_RETEST_LONG', stored[0].primaryCategory === 'BREAKOUT_RETEST_LONG');
    assert('T6.13: Final stored categoryTransitionHistory has 2 entries', stored[0].categoryTransitionHistory?.length === 2);
  } catch (e: any) {
    assert('T6: Exception', false, e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Anti-Chase & Invalidation Preservation
  // --------------------------------------------------------------------------
  // Verifies that assigning a category does not bypass anti-chase or invalidation
  try {
    const repExtended = evaluatePrimarySetupCategory({
      symbol: 'SOLUSDT',
      direction: 'LONG',
      candles: baseCandles,
      currentPrice: 110,
      entryPrice: 100,
      breakoutEvaluation: { isBreakout: true },
      entryStatus: 'ENTRY_MISSED',
      setupMaturity: 'EXTENDED'
    });
    assert('T7.1: Category is classified as BREAKOUT_LONG even when extended', repExtended.primaryCategory === 'BREAKOUT_LONG');
    assert('T7.2: Execution alignment preserves ENTRY_MISSED', repExtended.executionAlignment === 'ENTRY_MISSED');
    assert('T7.3: Is confirmed is false when extended / entry missed', repExtended.isConfirmed === false);
  } catch (e: any) {
    assert('T7: Exception', false, e.message);
  }

  console.log('================================================================');
  console.log(`📊 PHASE 12 TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================');

  return { passed, failed, total: passed + failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPhase12CategoryIntelligenceTests().then((res) => {
    if (res.failed > 0) {
      process.exit(1);
    }
  });
}
