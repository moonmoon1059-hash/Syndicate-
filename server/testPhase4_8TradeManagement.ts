import {
  generateDynamicTargets,
  evaluateTradeManagement
} from './tradeManagementEngine';
import { evaluateMarketWithCoreIntelligence } from './coreIntelligenceEngine';
import { upsertSignals, updateSignalLifecycle, getAllStoredSignals } from './signalTracker';
import { TargetLevel } from '../src/types/crypto';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    results.push({ name, passed: true });
    console.log(`✅ PASS: ${name}`);
  } else {
    results.push({ name, passed: false, details });
    console.error(`❌ FAIL: ${name} - ${details || 'Assertion failed'}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('PHASE 4.8 TRADE MANAGEMENT INTELLIGENCE SUITE');
  console.log('================================================================\n');

  // Test 1: Dynamic Target Generation (Monotonic Ascending for LONG)
  const longTargets = generateDynamicTargets({
    entryPrice: 100,
    stopLoss: 95,
    direction: 'LONG',
    atr: 2.5,
    regime: 'BULL',
    keyLevelsInDirection: [108, 115, 125]
  });

  assert(
    longTargets.targets.length >= 3,
    'Dynamic Target Count >= 3 for trending regime',
    `Found ${longTargets.targets.length} targets`
  );

  let isStrictlyAscending = true;
  for (let i = 1; i < longTargets.targets.length; i++) {
    if (longTargets.targets[i].price <= longTargets.targets[i - 1].price) {
      isStrictlyAscending = false;
      break;
    }
  }
  assert(
    isStrictlyAscending,
    'LONG Targets are strictly ascending in price',
    `Target prices: ${longTargets.targets.map(t => t.price).join(', ')}`
  );

  // Test 2: Dynamic Target Generation (Monotonic Descending for SHORT)
  const shortTargets = generateDynamicTargets({
    entryPrice: 100,
    stopLoss: 105,
    direction: 'SHORT',
    atr: 2.5,
    regime: 'BEAR',
    keyLevelsInDirection: [92, 85, 75]
  });

  let isStrictlyDescending = true;
  for (let i = 1; i < shortTargets.targets.length; i++) {
    if (shortTargets.targets[i].price >= shortTargets.targets[i - 1].price) {
      isStrictlyDescending = false;
      break;
    }
  }
  assert(
    isStrictlyDescending,
    'SHORT Targets are strictly descending in price',
    `Target prices: ${shortTargets.targets.map(t => t.price).join(', ')}`
  );

  // Test 3: Opposing Obstacle Detection & Wall Halting
  const blockedTargets = generateDynamicTargets({
    entryPrice: 100,
    stopLoss: 95,
    direction: 'LONG',
    atr: 2.5,
    regime: 'BULL',
    opposingObstacles: [112.5], // Obstacle at 112.5 stops expansion beyond it
    explicitTargetCount: 6
  });

  assert(
    blockedTargets.targets.length > 0 && blockedTargets.targets[blockedTargets.targets.length - 1].price <= 113,
    'Opposing obstacle stops or clamps target ladder',
    `Final target: ${blockedTargets.targets[blockedTargets.targets.length - 1]?.price}`
  );

  // Test 4: Confluence Clustering (Pattern Measured Move + S/R confluence)
  const clusteredTargets = generateDynamicTargets({
    entryPrice: 100,
    stopLoss: 95,
    direction: 'LONG',
    atr: 2.5,
    regime: 'BULL',
    patternMeasuredMove: 107.5,
    keyLevelsInDirection: [107.6, 115],
    explicitTargetCount: 4
  });

  assert(
    clusteredTargets.targets.some(t => t.isClustered || (t.confluentCount && t.confluentCount > 1)),
    'Close structural levels are merged into confluent high-conviction targets',
    `Targets: ${JSON.stringify(clusteredTargets.targets.map(t => ({ p: t.price, clustered: t.isClustered })))}`
  );

  // Test 5: Trade Management Before TP1 (Protection Mode = ORIGINAL_SL)
  const initialMgmt = evaluateTradeManagement({
    entryPrice: 100,
    stopLoss: 95,
    currentPrice: 102,
    direction: 'LONG',
    targets: longTargets.targets,
    atr: 2.5,
    marketRegime: 'BULL',
    rsi: 55
  });

  assert(
    initialMgmt.protectionMode === 'ORIGINAL_SL',
    'Pre-TP1 trade protection mode is ORIGINAL_SL',
    `Protection mode was ${initialMgmt.protectionMode}`
  );
  assert(
    initialMgmt.recommendedStopLoss === 95,
    'Pre-TP1 recommended stop loss preserves original risk',
    `Recommended SL was ${initialMgmt.recommendedStopLoss}`
  );

  // Test 6: Trade Management After TP1 Hit (Protection Mode = BREAK_EVEN or STRUCTURAL_TRAILING)
  const tp1HitTargets = longTargets.targets.map((t, idx) => idx === 0 ? { ...t, hit: true, status: 'HIT' as const } : t);
  const postTp1Mgmt = evaluateTradeManagement({
    entryPrice: 100,
    stopLoss: 95,
    currentPrice: 105,
    direction: 'LONG',
    targets: tp1HitTargets,
    atr: 2.5,
    marketRegime: 'BULL',
    rsi: 60
  });

  assert(
    postTp1Mgmt.protectionMode === 'BREAK_EVEN' || postTp1Mgmt.protectionMode === 'STRUCTURAL_TRAILING',
    'Post-TP1 protection moves to BREAK_EVEN or STRUCTURAL_TRAILING',
    `Protection mode was ${postTp1Mgmt.protectionMode}`
  );
  assert(
    postTp1Mgmt.recommendedStopLoss >= 100,
    'Post-TP1 recommended stop loss is at or above entry price (risk eliminated)',
    `Recommended SL: ${postTp1Mgmt.recommendedStopLoss}`
  );

  // Test 7: Trade Management After TP2 Hit (PROFIT_LOCKED)
  const tp2HitTargets = longTargets.targets.map((t, idx) => idx <= 1 ? { ...t, hit: true, status: 'HIT' as const } : t);
  const postTp2Mgmt = evaluateTradeManagement({
    entryPrice: 100,
    stopLoss: 95,
    currentPrice: 116,
    direction: 'LONG',
    targets: tp2HitTargets,
    atr: 2.5,
    marketRegime: 'BULL',
    rsi: 65
  });

  assert(
    postTp2Mgmt.protectionMode === 'PROFIT_LOCKED' || postTp2Mgmt.protectionMode === 'STRUCTURAL_TRAILING',
    'Post-TP2 locks profit or structural trail above TP1',
    `Protection mode: ${postTp2Mgmt.protectionMode}, SL: ${postTp2Mgmt.recommendedStopLoss}`
  );
  assert(
    postTp2Mgmt.recommendedStopLoss > 100,
    'Post-TP2 SL strictly locks positive profit',
    `Recommended SL: ${postTp2Mgmt.recommendedStopLoss}`
  );

  // Test 8: Parabolic Protection Defense
  const parabolicMgmt = evaluateTradeManagement({
    entryPrice: 100,
    stopLoss: 95,
    currentPrice: 135,
    direction: 'LONG',
    targets: tp2HitTargets,
    atr: 2.5,
    marketRegime: 'BULL',
    rsi: 84, // Extreme overbought parabolic
    rvol: 3.8
  });

  assert(
    parabolicMgmt.parabolicProtection?.detected === true,
    'Parabolic move detected on extreme RSI & RVOL extension',
    `Parabolic details: ${parabolicMgmt.parabolicProtection?.action}`
  );
  assert(
    parabolicMgmt.recommendedStopLoss >= 120,
    'Parabolic defense tightens stop loss aggressively to lock gains',
    `Parabolic tightened SL: ${parabolicMgmt.recommendedStopLoss}`
  );

  // Test 9: Invariant Check: Recommended Stop Loss NEVER widens risk
  const shortMgmt = evaluateTradeManagement({
    entryPrice: 100,
    stopLoss: 105,
    currentPrice: 94,
    direction: 'SHORT',
    targets: shortTargets.targets.map((t, idx) => idx === 0 ? { ...t, hit: true } : t),
    atr: 2.5,
    marketRegime: 'BEAR',
    rsi: 40
  });

  assert(
    shortMgmt.recommendedStopLoss <= 100,
    'SHORT protection moves stop down and never above original SL',
    `SHORT recommended SL: ${shortMgmt.recommendedStopLoss}`
  );

  // Test 10: Integration with evaluateMarketWithCoreIntelligence
  const mockCandles = Array.from({ length: 60 }, (_, i) => ({
    timestamp: Date.now() - (60 - i) * 3600 * 1000,
    open: 100 + i * 0.5,
    high: 101 + i * 0.5,
    low: 99.5 + i * 0.5,
    close: 100.8 + i * 0.5,
    volume: 10000 + i * 100
  }));

  const coreResult = evaluateMarketWithCoreIntelligence({
    symbol: 'BTC/USDT',
    primaryCandles: mockCandles,
    timeframeCandlesMap: { '1h': mockCandles },
    baseTimeframe: '1h'
  });

  assert(
    coreResult !== undefined && typeof coreResult.decision === 'string',
    'evaluateMarketWithCoreIntelligence executes with trade management integrated',
    `Decision was ${coreResult.decision}`
  );

  if (coreResult.decision !== 'WAIT') {
    assert(
      coreResult.tradeManagement !== undefined,
      'Actionable decision includes tradeManagement analysis',
      `Trade management mode: ${coreResult.tradeManagement?.protectionMode}`
    );
    assert(
      coreResult.signal?.tradeManagement !== undefined,
      'Signal object includes tradeManagement field',
      `Signal trade management present`
    );
  }

  // Summary
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  console.log('\n================================================================');
  console.log(`RESULTS: ${passedCount}/${totalCount} TESTS PASSED`);
  console.log('================================================================');

  if (passedCount < totalCount) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
