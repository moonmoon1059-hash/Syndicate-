import { qualifyTelegramCandidate, validateTelegramSignalActionability, generateOpportunityChartBuffer } from '../server/telegramAlertEngine';
import { Signal, PreMoveReport } from '../src/types/crypto';

async function runRegressionTests() {
  console.log('================================================================');
  console.log('MOONSCANNER TELEGRAM FIREWALL & PRE-MOVE EXTREME REGRESSION TEST');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(title: string, condition: boolean, details?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ [PASS ${total}] ${title}${details ? ` -> ${details}` : ''}`);
    } else {
      console.error(`❌ [FAIL ${total}] ${title}${details ? ` -> ${details}` : ''}`);
    }
  }

  // TEST 1: TFUEL-style ordinary small-move signal (movePct ~2.5%, targets 1-3%)
  console.log('\n--- TEST 1: Ordinary small move (TFUEL style 2.5% move) ---');
  const tfuelSignal = {
    id: 'sig_TFUELUSDT_1h_LONG_1234567890',
    symbol: 'TFUELUSDT',
    direction: 'LONG',
    timeframe: '1h',
    entryPrice: 0.0500,
    currentPrice: 0.0500,
    stopLoss: 0.0485,
    targets: [
      { id: 'tp1', label: 'TP1', price: 0.0506, percentage: 1.2 },
      { id: 'tp2', label: 'TP2', price: 0.0513, percentage: 2.6 }
    ],
    qualityGrade: 'A',
    confidence: 82,
    riskRewardRatio: 2.0,
    timestamp: Date.now()
  } as any as Signal;

  const tfuelResult = qualifyTelegramCandidate(tfuelSignal);
  assert(
    'TFUEL ordinary signal blocked by Telegram firewall',
    !tfuelResult.qualified,
    `Reason: ${tfuelResult.reason}`
  );
  assert(
    'TFUEL rejection reason is ordinary small move',
    Boolean(tfuelResult.reason?.includes('FIREWALL_BLOCKED_ORDINARY_SMALL_MOVE') || tfuelResult.reason?.includes('FIREWALL_BLOCKED_BELOW_30_PERCENT_RULE')),
    `Reason: ${tfuelResult.reason}`
  );

  // TEST 2: STEEM-style ordinary 15% move signal (below 30% rule)
  console.log('\n--- TEST 2: STEEM-style ordinary 15% move (below 30% threshold) ---');
  const steemSignal = {
    id: 'sig_STEEMUSDT_1h_LONG_1234567890',
    symbol: 'STEEMUSDT',
    direction: 'LONG',
    timeframe: '1h',
    entryPrice: 0.2000,
    currentPrice: 0.2000,
    stopLoss: 0.1900,
    targets: [
      { id: 'tp1', label: 'TP1', price: 0.2100, percentage: 5.0 },
      { id: 'tp2', label: 'TP2', price: 0.2200, percentage: 10.0 },
      { id: 'tp3', label: 'TP3', price: 0.2300, percentage: 15.0 }
    ],
    qualityGrade: 'A',
    confidence: 85,
    riskRewardRatio: 3.0,
    timestamp: Date.now(),
    bigMoveHunter: {
      score: 70,
      stage: 'EARLY_EXPANSION',
      majorMoveClass: 'NORMAL',
      projectedMovePct: 15.0
    }
  } as any as Signal;

  const steemResult = qualifyTelegramCandidate(steemSignal);
  assert(
    'STEEM ordinary 15% move blocked by Telegram firewall',
    !steemResult.qualified,
    `Reason: ${steemResult.reason}`
  );

  // TEST 3: Pre-Move with non-extreme potential (e.g. 5% or 10% expected move)
  console.log('\n--- TEST 3: Non-extreme Pre-Move (10% move, no extreme classification) ---');
  const nonExtremePreMoveReport = {
    symbol: 'COILUSDT',
    coilScore: 50,
    volatilitySqueeze: true,
    compressionRatio: 40,
    breakoutPressureScore: 55,
    volumeDivergence: false,
    orderflowAbsorption: { detected: false, type: 'NONE', absorptionStrength: 0 },
    fakeoutSweep: { detected: false, sweepSide: 'NONE', reclaimed: false },
    setupStage: 'COILING',
    expectedMovePct: 10.0,
    largeMoveClass: 'NORMAL',
    largeMovePotentialLabel: 'INSUFFICIENT EVIDENCE',
    isExtremeCandidate: false,
    entryZone: { low: 1.0, high: 1.02, optimal: 1.01 },
    invalidationPrice: 0.97,
    targets: [{ id: 'tp1', label: 'TP1', price: 1.05, percentage: 5.0 }, { id: 'tp2', label: 'TP2', price: 1.10, percentage: 10.0 }],
    riskRewardRatio: 2.5,
    noChaseLevel: 1.03,
    catalystConfidence: 'LOW',
    recommendedAction: 'MONITOR_COIL'
  } as any as PreMoveReport;

  const nonExtremePreMoveSignal = {
    id: 'sig_COILUSDT_1h_LONG_PREMOVE_1234567890',
    symbol: 'COILUSDT',
    direction: 'LONG',
    timeframe: '1h',
    entryPrice: 1.01,
    currentPrice: 1.01,
    stopLoss: 0.97,
    targets: [{ id: 'tp1', label: 'TP1', price: 1.05, percentage: 5.0 }, { id: 'tp2', label: 'TP2', price: 1.10, percentage: 10.0 }],
    qualityGrade: 'A',
    confidence: 75,
    riskRewardRatio: 2.5,
    timestamp: Date.now(),
    isPreMove: true,
    preMoveReport: nonExtremePreMoveReport,
    isExtremeCandidate: false,
    largeMoveClass: 'NORMAL'
  } as any as Signal;

  const nonExtremePreMoveResult = qualifyTelegramCandidate(nonExtremePreMoveSignal);
  assert(
    'Non-extreme Pre-Move blocked by Telegram firewall',
    !nonExtremePreMoveResult.qualified,
    `Reason: ${nonExtremePreMoveResult.reason}`
  );

  // TEST 4: Genuine EXTREME Pre-Move (100%+ potential, extreme candidate confirmed)
  console.log('\n--- TEST 4: Genuine EXTREME Pre-Move (100%+ expansion evidence) ---');
  const extremePreMoveReport = {
    symbol: 'SUPERCOILUSDT',
    coilScore: 88,
    volatilitySqueeze: true,
    compressionRatio: 65,
    breakoutPressureScore: 85,
    volumeDivergence: true,
    orderflowAbsorption: { detected: true, type: 'PASSIVE_BID_ABSORPTION', absorptionStrength: 85 },
    fakeoutSweep: { detected: true, sweepSide: 'LIQUIDITY_RUN_LOW', reclaimed: true },
    setupStage: 'TRIGGERED',
    expectedMovePct: 100.0,
    largeMoveClass: 'EXTREME_100_PLUS',
    largeMovePotentialLabel: 'EXTREME 100+ POTENTIAL',
    isExtremeCandidate: true,
    projectedDirection: 'BULLISH',
    directionalWarning: 'BIG_MOVE_COMING',
    detailedState: 'BIG_MOVE_COMING',
    entryZone: { low: 1.00, high: 1.03, optimal: 1.01 },
    invalidationPrice: 0.94,
    targets: [
      { id: 'tp1', label: 'TP1 (Base Expansion)', price: 1.30, percentage: 30.0 },
      { id: 'tp2', label: 'TP2 (Structural Breakout)', price: 1.60, percentage: 60.0 },
      { id: 'tp3', label: 'TP3 (Full Expansion 100%+)', price: 2.02, percentage: 100.0 }
    ],
    riskRewardRatio: 5.0,
    noChaseLevel: 1.05,
    catalystConfidence: 'HIGH',
    recommendedAction: 'PREPARE_BREAKOUT_LIMIT'
  } as any as PreMoveReport;

  const extremePreMoveSignal = {
    id: 'sig_SUPERCOILUSDT_1h_LONG_PREMOVE_1234567890',
    symbol: 'SUPERCOILUSDT',
    direction: 'LONG',
    timeframe: '1h',
    entryPrice: 1.01,
    currentPrice: 1.01,
    stopLoss: 0.94,
    targets: [
      { id: 'tp1', label: 'TP1 (Base Expansion)', price: 1.30, percentage: 30.0 },
      { id: 'tp2', label: 'TP2 (Structural Breakout)', price: 1.60, percentage: 60.0 },
      { id: 'tp3', label: 'TP3 (Full Expansion 100%+)', price: 2.02, percentage: 100.0 }
    ],
    qualityGrade: 'A+',
    confidence: 92,
    riskRewardRatio: 5.0,
    timestamp: Date.now(),
    isPreMove: true,
    preMoveReport: extremePreMoveReport,
    isExtremeCandidate: true,
    largeMoveClass: 'EXTREME_100_PLUS',
    largeMovePotentialLabel: 'EXTREME 100+ POTENTIAL'
  } as any as Signal;

  const extremePreMoveResult = qualifyTelegramCandidate(extremePreMoveSignal);
  assert(
    'Extreme 100%+ Pre-Move successfully passes Telegram firewall',
    extremePreMoveResult.qualified,
    `Alert Type: ${extremePreMoveResult.alertType}, Source: ${extremePreMoveResult.sourceType}`
  );
  assert(
    'Alert type is PRE_PUMP',
    extremePreMoveResult.alertType === 'PRE_PUMP',
    `Type: ${extremePreMoveResult.alertType}`
  );

  // TEST 5: Genuine Big Move Hunter (LONG >= 30%)
  console.log('\n--- TEST 5: Genuine Big Move Hunter (LONG >= 30%) ---');
  const bigMoveSignal = {
    id: 'sig_ALPHAUSDT_1h_LONG_1234567890',
    symbol: 'ALPHAUSDT',
    direction: 'LONG',
    timeframe: '1h',
    entryPrice: 10.0,
    currentPrice: 10.1,
    stopLoss: 9.3,
    targets: [
      { id: 'tp1', label: 'TP1', price: 11.5, percentage: 15.0 },
      { id: 'tp2', label: 'TP2', price: 13.5, percentage: 35.0 }
    ],
    qualityGrade: 'A',
    confidence: 88,
    riskRewardRatio: 4.3,
    timestamp: Date.now(),
    majorMovePotentialPct: 35.0,
    largeMoveClass: 'HIGH_IMPACT',
    bigMoveHunter: {
      score: 90,
      stage: 'EXPLOSIVE',
      majorMoveClass: 'MAJOR_MOVE',
      projectedMovePct: 35.0
    }
  } as any as Signal;

  const bigMoveResult = qualifyTelegramCandidate(bigMoveSignal);
  assert(
    'Big Move Hunter (35%) successfully passes Telegram firewall',
    bigMoveResult.qualified,
    `Alert Type: ${bigMoveResult.alertType}, Source: ${bigMoveResult.sourceType}`
  );

  // TEST 6: Genuine Big Dump Hunter (SHORT >= 30%)
  console.log('\n--- TEST 6: Genuine Big Dump Hunter (SHORT >= 30%) ---');
  const bigDumpSignal = {
    id: 'sig_BETAUSDT_1h_SHORT_1234567890',
    symbol: 'BETAUSDT',
    direction: 'SHORT',
    timeframe: '1h',
    entryPrice: 50.0,
    currentPrice: 49.8,
    stopLoss: 53.0,
    targets: [
      { id: 'tp1', label: 'TP1', price: 42.0, percentage: 16.0 },
      { id: 'tp2', label: 'TP2', price: 34.0, percentage: 32.0 }
    ],
    qualityGrade: 'A',
    confidence: 89,
    riskRewardRatio: 5.3,
    timestamp: Date.now(),
    majorMovePotentialPct: 32.0,
    largeMoveClass: 'HIGH_IMPACT',
    dumpHunter: {
      score: 88,
      stage: 'DUMP_EXPANSION',
      actionableShort: true,
      majorMoveClass: 'MAJOR_MOVE',
      projectedMovePct: 32.0
    }
  } as any as Signal;

  const bigDumpResult = qualifyTelegramCandidate(bigDumpSignal);
  assert(
    'Big Dump Hunter (32%) successfully passes Telegram firewall',
    bigDumpResult.qualified,
    `Alert Type: ${bigDumpResult.alertType}, Source: ${bigDumpResult.sourceType}`
  );

  // TEST 7: Telegram Chart Generator produces clean image buffer
  console.log('\n--- TEST 7: Telegram Chart Generation ---');
  const chartBuffer = await generateOpportunityChartBuffer({
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entryLow: 60000,
    entryHigh: 61000,
    currentPrice: 60500,
    stopLoss: 58500,
    targets: [
      { label: 'TP1 (Base Breakout)', price: 65000, percentage: 7.4 },
      { label: 'TP2 (Range Expansion)', price: 72000, percentage: 19.0 },
      { label: 'TP3 (Major Move)', price: 82000, percentage: 35.5 }
    ],
    setupType: 'PRE-PUMP EXECUTION',
    keyTriggerLevel: 61200,
    noChaseLevel: 61800
  });

  assert(
    'Telegram Execution Chart generates valid PNG buffer',
    chartBuffer !== null && chartBuffer.length > 500,
    `Buffer length: ${chartBuffer?.length || 0} bytes`
  );

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${total} TESTS PASSED (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('================================================================\n');

  if (passed === total) {
    console.log('🎉 ALL TELEGRAM FIREWALL & PRE-MOVE REGRESSION TESTS PASSED CLEANLY.');
    process.exit(0);
  } else {
    console.error('❌ SOME REGRESSION TESTS FAILED.');
    process.exit(1);
  }
}

runRegressionTests().catch((err) => {
  console.error('Test execution failed with error:', err);
  process.exit(1);
});
