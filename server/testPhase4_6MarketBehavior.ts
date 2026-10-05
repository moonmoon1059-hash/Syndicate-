import { Candle } from './cryptoService';
import {
  evaluateMarketWithCoreIntelligence,
  generateMarketJustifiedTargets,
  evaluateEntryReadiness,
  evaluateDataQuality,
  detectMomentumExhaustion,
  evaluatePriceExtension,
  evaluateAnalyticalEntryQuality,
  classifyMarketBehavior,
  getCanonicalTargets,
  calculateDynamicStopLoss,
  calculateTradeWindow
} from './coreIntelligenceEngine';
import {
  analyzeLiquidityStructure,
  mapLiquidityZones,
  calculateLiquidityAsymmetry,
  checkStructureCollision,
  LiquidityStructureAnalysis
} from './liquidityEngine';
import { evaluateBreakoutQuality } from './breakoutEngine';
import { formatBangladeshTime, formatPrice, formatPercent } from '../src/utils/formatters';

// ============================================================================
// FIXTURES
// ============================================================================

function createSyntheticCandles(count: number = 60, basePrice: number = 60000, trendDelta: number = 50): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  const baseTime = 1700000000000;
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 3) * 15;
    const open = price;
    const high = open + Math.max(0, trendDelta) + 25 + (wave > 0 ? wave : 5);
    const low = open + Math.min(0, trendDelta) - 25 - (wave < 0 ? -wave : 5);
    const close = open + trendDelta + wave;
    candles.push({
      timestamp: baseTime + i * 3600000,
      open,
      high,
      low,
      close,
      volume: 1000 + i * 10
    });
    price = close;
  }
  return candles;
}


// ============================================================================
// TEST RUNNER
// ============================================================================

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failedCount++;
    console.error(`  ✗ FAIL: ${testName} ${details ? `(${details})` : ''}`);
  }
}

export function runPhase4_6Tests() {
  console.log('============================================================');
  console.log('MOONSCANNER PHASE 4.6 — ADAPTIVE MARKET BEHAVIOR & INTELLIGENCE TEST SUITE');
  console.log('============================================================\n');

  // --------------------------------------------------------------------------
  // SUITE 1: LIQUIDITY STRUCTURE & ASYMMETRY (Tests 1 - 9)
  // --------------------------------------------------------------------------
  console.log('--- SUITE 1: LIQUIDITY STRUCTURE & ASYMMETRY ---');
  
  // Test 1: Equal Highs detection
  const eqHighCandles = createSyntheticCandles(30, 50000, 0);
  eqHighCandles[10].high = 51000;
  eqHighCandles[20].high = 51010; // within 0.35% tolerance
  const liqZones = mapLiquidityZones(eqHighCandles, 50500, 2);
  const hasEqHigh = liqZones.some(z => z.type === 'EQUAL_HIGHS');
  assert(hasEqHigh, 'Test 1: Equal Highs liquidity pool mapping detected');

  // Test 2: Equal Lows detection
  const eqLowCandles = createSyntheticCandles(30, 50000, 0);
  eqLowCandles[10].low = 49000;
  eqLowCandles[20].low = 49010;
  const liqLowZones = mapLiquidityZones(eqLowCandles, 49500, 2);
  const hasEqLow = liqLowZones.some(z => z.type === 'EQUAL_LOWS');
  assert(hasEqLow, 'Test 2: Equal Lows liquidity pool mapping detected');

  // Test 3: Bearish Liquidity Sweep (High swept and rejected)
  const bearSweepCandles = createSyntheticCandles(30, 50000, 10);
  bearSweepCandles[28].high = 51000;
  bearSweepCandles[28].close = 50800;
  bearSweepCandles[29].high = 51050;
  bearSweepCandles[29].open = 50850;
  bearSweepCandles[29].close = 50600; // wicked above 51000 and closed below open
  const bearSweepAnalysis = analyzeLiquidityStructure(bearSweepCandles, 2);
  assert(
    bearSweepAnalysis.liquiditySweep.detected && bearSweepAnalysis.liquiditySweep.type === 'BEARISH_SWEEP',
    'Test 3: Bearish liquidity sweep sequence detected'
  );

  // Test 4: Bullish Liquidity Sweep (Low swept and reclaimed)
  const bullSweepCandles = createSyntheticCandles(30, 50000, -10);
  bullSweepCandles[28].low = 49000;
  bullSweepCandles[28].close = 49200;
  bullSweepCandles[29].low = 48950;
  bullSweepCandles[29].open = 49150;
  bullSweepCandles[29].close = 49400; // wicked below 49000 and closed strong above
  const bullSweepAnalysis = analyzeLiquidityStructure(bullSweepCandles, 2);
  assert(
    bullSweepAnalysis.liquiditySweep.detected && bullSweepAnalysis.liquiditySweep.type === 'BULLISH_SWEEP',
    'Test 4: Bullish liquidity sweep sequence detected'
  );

  // Test 5: Swing High / Low Mapping
  const waveCandles = createSyntheticCandles(60, 50000, 100);
  const waveZones = mapLiquidityZones(waveCandles, 53000, null, null, 53000, 2);
  assert(waveZones.length > 0 && waveZones.some(z => z.type === 'SWING_HIGH' || z.type === 'SWING_LOW' || z.type === 'RANGE_HIGH' || z.type === 'RANGE_LOW' || z.type === 'EQUAL_HIGHS'), 'Test 5: Swing pivot liquidity mapping');


  // Test 6: Liquidity Asymmetry Calculation (Bullish skew)
  const asymBull = calculateLiquidityAsymmetry(liqZones, 50000);
  assert(typeof asymBull.ratio === 'number' && asymBull.bias !== undefined, 'Test 6: Liquidity asymmetry calculation');

  // Test 7: Liquidity Asymmetry Skew Output
  assert(asymBull.description.length > 5, 'Test 7: Liquidity asymmetry description generated');

  // Test 8: Resistance Structure Collision (< 0.85% away)
  const collisionRes = checkStructureCollision(50000, 'LONG', [50200, 52000], 500);
  assert(collisionRes.detected && collisionRes.distancePct < 0.85, 'Test 8: Resistance structure collision detected');

  // Test 9: Support Structure Collision (< 0.85% away)
  const collisionSup = checkStructureCollision(50000, 'SHORT', [49800, 48000], 500);
  assert(collisionSup.detected && collisionSup.distancePct < 0.85, 'Test 9: Support structure collision detected');


  // --------------------------------------------------------------------------
  // SUITE 2: BREAKOUT CLASSIFICATION & PROGRESSION (Tests 10 - 18)
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 2: BREAKOUT CLASSIFICATION & PROGRESSION ---');

  // Test 10: Genuine Breakout
  const boCandles = createSyntheticCandles(30, 50000, 20);
  boCandles[29].close = 51200;
  boCandles[29].open = 50800;
  const genBO = evaluateBreakoutQuality(boCandles, 50900, 'RESISTANCE', 1.5);
  assert(genBO.stage === 'BREAKOUT_CONFIRMED' && genBO.classification === 'GENUINE_BREAKOUT', 'Test 10: Genuine breakout confirmed');

  // Test 11: Fake Breakout (Bull Trap)
  const fakeBOCandles = createSyntheticCandles(30, 50000, 10);
  fakeBOCandles[29].high = 51300;
  fakeBOCandles[29].open = 50800;
  fakeBOCandles[29].close = 50850; // High broke 51000 but rejected with upper shadow
  const fakeBO = evaluateBreakoutQuality(fakeBOCandles, 51000, 'RESISTANCE', 0.9);
  assert(fakeBO.classification === 'FAKE_BREAKOUT' || fakeBO.stage === 'FAILED_BREAKOUT', 'Test 11: Fake breakout (Bull Trap) detected');

  // Test 12: Failed Breakout (Close back below)
  const failedBOCandles = createSyntheticCandles(30, 50000, 10);
  failedBOCandles[28].close = 51100;
  failedBOCandles[29].close = 50800;
  const failedBO = evaluateBreakoutQuality(failedBOCandles, 51000, 'RESISTANCE', 1.0);
  assert(failedBO.stage === 'FAILED_BREAKOUT' && failedBO.classification === 'FAILED_BREAKOUT', 'Test 12: Failed breakout detected');

  // Test 13: Retest in progress
  const retestCandles = createSyntheticCandles(30, 50000, 10);
  retestCandles[28].close = 51200;
  retestCandles[29].low = 51010;
  retestCandles[29].close = 51050;
  const retestEval = evaluateBreakoutQuality(retestCandles, 51000, 'RESISTANCE', 1.0);
  assert(retestEval.stage === 'RETEST' || retestEval.stage === 'RETEST_CONFIRMED', 'Test 13: Retest evaluation detected');

  // Test 14: Retest Confirmed
  const retestConfCandles = createSyntheticCandles(30, 50000, 10);
  retestConfCandles[25].close = 51200;
  retestConfCandles[29].low = 51000;
  retestConfCandles[29].open = 51020;
  retestConfCandles[29].close = 51150;
  const retestConf = evaluateBreakoutQuality(retestConfCandles, 51000, 'RESISTANCE', 1.3);
  assert(retestConf.stage === 'RETEST_CONFIRMED' && retestConf.isConfirmed, 'Test 14: Retest confirmed with quality support');

  // Test 15: Confirmed Continuation
  const contCandles = createSyntheticCandles(30, 50000, 50);
  contCandles[29].close = 53000;
  const contEval = evaluateBreakoutQuality(contCandles, 51000, 'RESISTANCE', 1.4);
  assert(contEval.stage === 'CONTINUATION' && contEval.classification === 'CONFIRMED_CONTINUATION', 'Test 15: Confirmed continuation detected');

  // Test 16: Genuine Breakdown
  const bdCandles = createSyntheticCandles(30, 50000, -20);
  bdCandles[29].close = 48800;
  bdCandles[29].open = 49200;
  const genBD = evaluateBreakoutQuality(bdCandles, 49100, 'SUPPORT', 1.4);
  assert(genBD.stage === 'BREAKOUT_CONFIRMED' && genBD.classification === 'GENUINE_BREAKOUT', 'Test 16: Genuine breakdown confirmed');

  // Test 17: Fake Breakdown (Bear Trap)
  const fakeBDCandles = createSyntheticCandles(30, 50000, -10);
  fakeBDCandles[29].low = 48700;
  fakeBDCandles[29].open = 49200;
  fakeBDCandles[29].close = 49150;
  const fakeBD = evaluateBreakoutQuality(fakeBDCandles, 49000, 'SUPPORT', 0.9);
  assert(fakeBD.classification === 'FAKE_BREAKOUT' || fakeBD.stage === 'FAILED_BREAKOUT', 'Test 17: Fake breakdown (Bear Trap) detected');

  // Test 18: Breakout Progression Quality Score
  assert(genBO.qualityScore > fakeBO.qualityScore, 'Test 18: Genuine breakout has higher progression quality score than fakeout');

  // --------------------------------------------------------------------------
  // SUITE 3: MOMENTUM EXHAUSTION ENGINE (Tests 19 - 23)
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 3: MOMENTUM EXHAUSTION ENGINE ---');

  // Test 19: Extreme RSI Overbought (> 75)
  const exh1 = detectMomentumExhaustion(boCandles, 78, 50000, 49000, 400);
  assert(exh1.score >= 35 && exh1.details.some(d => d.includes('Overbought')), 'Test 19: Extreme RSI overbought detected');

  // Test 20: Extreme RSI Oversold (< 25)
  const exh2 = detectMomentumExhaustion(bdCandles, 22, 50000, 51000, 400);
  assert(exh2.score >= 35 && exh2.details.some(d => d.includes('Oversold')), 'Test 20: Extreme RSI oversold detected');

  // Test 21: Diminishing Volume on Consecutive Pushes
  const decVolCandles = createSyntheticCandles(20, 50000, 20);
  decVolCandles[17].volume = 3000;
  decVolCandles[18].volume = 2000;
  decVolCandles[19].volume = 1000;
  const exh3 = detectMomentumExhaustion(decVolCandles, 65, 50000, 49000, 400);
  assert(exh3.details.some(d => d.includes('Diminishing volume')), 'Test 21: Diminishing volume decay detected');

  // Test 22: Repeated wicks at local highs
  const wickCandles = createSyntheticCandles(20, 50000, 20);
  wickCandles[18].high = 51500; wickCandles[18].open = 50800; wickCandles[18].close = 50850;
  wickCandles[19].high = 51550; wickCandles[19].open = 50850; wickCandles[19].close = 50900;
  const exh4 = detectMomentumExhaustion(wickCandles, 68, 50500, 49000, 400);
  assert(exh4.details.some(d => d.includes('upper shadow')), 'Test 22: Repeated upper shadow rejections detected');

  // Test 23: High Exhaustion Classification
  const highExh = detectMomentumExhaustion(wickCandles, 78, 48000, 47000, 300);
  assert(highExh.level === 'HIGH_EXHAUSTION' && highExh.isExhausted, 'Test 23: High exhaustion classification');

  // --------------------------------------------------------------------------
  // SUITE 4: PRICE EXTENSION & CHASE PROTECTION (Tests 24 - 30)
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 4: PRICE EXTENSION & CHASE PROTECTION ---');

  // Test 24: Optimal Price Extension
  const extOptimal = evaluatePriceExtension(50100, 50000, 49800, 400);
  assert(extOptimal.level === 'OPTIMAL', 'Test 24: Optimal price extension');

  // Test 25: Moderate Price Extension
  const extModerate = evaluatePriceExtension(50800, 50000, 49500, 400);
  assert(extModerate.level === 'EXTENDED', 'Test 25: Moderate price extension');

  // Test 26: Severe Price Extension
  const extSevere = evaluatePriceExtension(52000, 50000, 49000, 400);
  assert(extSevere.level === 'SEVERELY_EXTENDED', 'Test 26: Severe price extension');

  // Test 27: Entry Quality: OPTIMAL_ENTRY
  const exhLow = detectMomentumExhaustion(boCandles, 52, 50000, 49800, 400);
  const eqOptimal = evaluateAnalyticalEntryQuality(50020, 50000, 49900, 50100, 49200, 'LONG', extOptimal, exhLow, genBO, 1.2);
  assert(eqOptimal === 'OPTIMAL_ENTRY' || eqOptimal === 'GOOD_ENTRY', 'Test 27: Optimal/Good entry quality');

  // Test 28: Entry Quality: CHASE_RISK
  const eqChase = evaluateAnalyticalEntryQuality(52500, 50000, 49900, 50100, 49200, 'LONG', extSevere, highExh, genBO, 1.2);
  assert(eqChase === 'CHASE_RISK', 'Test 28: Chase risk on severe extension');

  // Test 29: Chase Protection: WAIT_FOR_ENTRY
  const readinessWait = evaluateEntryReadiness(50450, 50000, 49900, 50100, 49200, 'LONG', 1.0, false, 51500);
  assert(readinessWait === 'WAIT_FOR_ENTRY', 'Test 29: Chase protection returns WAIT_FOR_ENTRY on extended price');

  // Test 30: Chase Protection: ENTRY_MISSED (50%+ move towards TP1)
  const readinessMissed = evaluateEntryReadiness(51000, 50000, 49900, 50100, 49200, 'LONG', 1.0, false, 51500);
  assert(readinessMissed === 'ENTRY_MISSED', 'Test 30: Entry missed when price covered >50% distance to TP1');

  // --------------------------------------------------------------------------
  // SUITE 5: MARKET BEHAVIOR CLASSIFICATION (Tests 31 - 35)
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 5: MARKET BEHAVIOR CLASSIFICATION ---');

  const cleanLiquidityAnalysis: LiquidityStructureAnalysis = {
    equalHighs: null,
    equalLows: null,
    sweepSequence: 'NONE',
    possibleStopHunt: false,
    liquiditySweep: { detected: false, type: 'NONE', sweepLevel: 0, reclaimPrice: 0, candleIndex: 0, description: '' },
    failedBreakout: false,
    liquidityZones: [],
    asymmetry: asymBull,
    classification: 'CLEAN_STRUCTURE',
    resistanceCollision: { detected: false, distancePct: 999, level: 0, details: '' },
    supportCollision: { detected: false, distancePct: 999, level: 0, details: '' },
    details: [],
    keyResistanceLevels: [],
    keySupportLevels: []
  };


  // Test 31: TRENDING_UP
  const neutralBO: any = { stage: 'NO_BREAKOUT', classification: 'NO_BREAKOUT', isConfirmed: false, qualityScore: 50 };
  const mb1 = classifyMarketBehavior({ regime: 'STRONG_BULL', bias: 'BULLISH', volatilityIndex: 40, details: '' }, neutralBO, cleanLiquidityAnalysis, 65, 1.2, 2.0);
  assert(mb1 === 'TRENDING_UP', 'Test 31: TRENDING_UP market behavior');

  // Test 32: TRENDING_DOWN
  const mb2 = classifyMarketBehavior({ regime: 'STRONG_BEAR', bias: 'BEARISH', volatilityIndex: 40, details: '' }, neutralBO, cleanLiquidityAnalysis, 35, 1.2, 2.0);
  assert(mb2 === 'TRENDING_DOWN', 'Test 32: TRENDING_DOWN market behavior');

  // Test 33: BREAKOUT_EXPANSION
  const mb3 = classifyMarketBehavior({ regime: 'BULL', bias: 'BULLISH', volatilityIndex: 40, details: '' }, contEval, cleanLiquidityAnalysis, 60, 1.4, 2.0);
  assert(mb3 === 'BREAKOUT_EXPANSION', 'Test 33: BREAKOUT_EXPANSION market behavior');

  // Test 34: BREAKOUT_RETEST
  const mb4 = classifyMarketBehavior({ regime: 'BULL', bias: 'BULLISH', volatilityIndex: 40, details: '' }, retestConf, cleanLiquidityAnalysis, 55, 1.0, 2.0);
  assert(mb4 === 'BREAKOUT_RETEST', 'Test 34: BREAKOUT_RETEST market behavior');

  // Test 35: LIQUIDITY_SWEEP
  const mb5 = classifyMarketBehavior({ regime: 'NEUTRAL', bias: 'NEUTRAL', volatilityIndex: 40, details: '' }, genBO, bearSweepAnalysis, 50, 1.0, 2.0);
  assert(mb5 === 'LIQUIDITY_SWEEP', 'Test 35: LIQUIDITY_SWEEP market behavior');


  // --------------------------------------------------------------------------
  // SUITE 6: UNIFIED MARKET DECISION & ADVERSARIAL AUDIT (Test 36)
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 6: END-TO-END UNIFIED DECISION & ADVERSARIAL AUDIT ---');

  const fullBullCandles = createSyntheticCandles(60, 50000, 60);
  const tfMap = {
    '1h': fullBullCandles,
    '4h': createSyntheticCandles(60, 48000, 120),
    '15m': createSyntheticCandles(60, 53000, 15)
  };

  const result = evaluateMarketWithCoreIntelligence({
    symbol: 'BTCUSDT',
    primaryCandles: fullBullCandles,
    timeframeCandlesMap: tfMap
  });

  assert(
    result.marketBehavior !== undefined &&
    result.entryQualityRating !== undefined &&
    result.liquidityAsymmetry !== undefined &&
    result.exhaustionReport !== undefined &&
    result.priceExtension !== undefined &&
    result.liquidityReason.length > 0 &&
    result.regimeReason.length > 0 &&
    result.breakoutReason.length > 0,
    'Test 36: Complete Phase 4.6 Core Intelligence output with structured reasons and metadata'
  );

  console.log('\n============================================================');
  console.log(`PHASE 4.6 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('============================================================');

  if (failedCount > 0) {
    throw new Error(`${failedCount} tests failed in Phase 4.6 test suite`);
  }
}

// Auto-run
runPhase4_6Tests();
