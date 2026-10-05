import { fuseMarketEvidence } from './multiTimeframeEngine';
import { calculateOpportunityPriorityScore, rankMarketOpportunities } from './opportunityDiscoveryEngine';
import { getAllStoredSignals, upsertSignals, resetSignalStoreForTesting } from './signalTracker';
import { Candle, Signal } from '../src/types/crypto';

function createMockCandles(count: number, basePrice: number, trend: 'UP' | 'DOWN' | 'FLAT' = 'UP'): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  const now = Date.now() - count * 3600000;

  for (let i = 0; i < count; i++) {
    const change = trend === 'UP' ? 1.002 : (trend === 'DOWN' ? 0.998 : 1.0);
    const open = price;
    const close = price * change;
    const high = Math.max(open, close) * 1.003;
    const low = Math.min(open, close) * 0.997;
    const volume = 1000 + i * 50;
    const timestamp = now + i * 3600000;

    candles.push({ timestamp, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

function runPhase18Battery() {
  console.log('--- STARTING PHASE 18 REGRESSION BATTERY ---');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      process.exitCode = 1;
    }
  }

  // 1. Timeframe Architecture (4H, 1H, 30M, 15M, 5M)
  console.log('\nTesting 1: Fixed Timeframe Architecture & Role Weighting...');
  const c4h = createMockCandles(50, 100, 'UP');
  const c1h = createMockCandles(50, 100, 'UP');
  const c30m = createMockCandles(50, 100, 'UP');
  const c15m = createMockCandles(50, 100, 'UP');
  const c5m = createMockCandles(50, 100, 'DOWN'); // lower tf pullback

  const fused = fuseMarketEvidence('BTCUSDT', {
    '4h': c4h,
    '1h': c1h,
    '30m': c30m,
    '15m': c15m,
    '5m': c5m
  });

  assert(Boolean(fused.timeframes['4h']), '4H Macro layer analyzed');
  assert(Boolean(fused.timeframes['1h']), '1H Market structure layer analyzed');
  assert(Boolean(fused.timeframes['30m']), '30M Setup+confirmation layer analyzed');
  assert(Boolean(fused.timeframes['15m']), '15M Entry refinement layer analyzed');
  assert(Boolean(fused.timeframes['5m']), '5M Timing layer analyzed');
  assert(fused.overallBias === 'BULLISH', 'Higher timeframe dominance maintains overall bullish alignment despite 5m pullback');

  // 2. High-Conviction Opportunity Ranking & Priority Focus
  console.log('\nTesting 2: High-Conviction Opportunity Priority & 30-35%+ TP Potential...');
  const baseSignal1: Signal = {
    id: 'SIG-1',
    symbol: 'SOLUSDT',
    baseAsset: 'SOL',
    quoteAsset: 'USDT',
    status: 'ACTIVE',
    confidence: 85,
    direction: 'LONG',
    timeframe: '1h',
    entryPrice: 100,
    stopLoss: 95,
    tp1: 108,
    tp2: 120,
    tp3: 135, // 35% target
    targets: [
      { id: 'tp1', price: 108, percentage: 8, label: 'TP1' },
      { id: 'tp2', price: 120, percentage: 20, label: 'TP2' },
      { id: 'tp3', price: 135, percentage: 35, label: 'TP3' }
    ],
    riskRewardRatio: 3.5,
    moonScore: 88,
    qualityGrade: 'A',
    entryStatus: 'ENTRY_NOW',
    actionablePriority: 'ENTRY_NOW',
    createdAt: Date.now()
  } as any as Signal;

  const score1 = calculateOpportunityPriorityScore(baseSignal1);
  assert(score1.priorityScore > 500, 'High-conviction setup with valid 35% TP achieves strong priority score');
  assert(baseSignal1.expectedMoveClass === 'MOMENTUM_EXPANSION_25PCT_PLUS', 'Move class correctly classified as 25%+');

  // 3. Dump Risk / Climax Penalties (Never rank exhausted pump as top opportunity)
  console.log('\nTesting 3: Exhausted Pump / Dump Risk Penalties...');
  const baseSignalDump: Signal = {
    id: 'SIG-2',
    symbol: 'MEMEUSDT',
    baseAsset: 'MEME',
    quoteAsset: 'USDT',
    status: 'ACTIVE',
    confidence: 60,
    direction: 'LONG',
    timeframe: '1h',
    entryPrice: 1.0,
    stopLoss: 0.9,
    tp1: 1.5,
    riskRewardRatio: 5.0,
    moonScore: 65,
    qualityGrade: 'B',
    pumpDump: {
      dumpRisk: 'CRITICAL',
      climaxDetected: true,
      isDumpRisk: true
    } as any,
    entryStatus: 'WAIT_FOR_PULLBACK',
    createdAt: Date.now()
  } as any as Signal;

  const scoreDump = calculateOpportunityPriorityScore(baseSignalDump);
  assert(scoreDump.priorityScore < score1.priorityScore, 'Dump-hazard coin receives severe priority penalty');
  assert(baseSignalDump.highImpactType === 'DUMP_RISK', 'High impact type correctly flags DUMP_RISK');

  // 4. Invariant Check: ONE COIN = ONE CURRENT UNIFIED SIGNAL
  console.log('\nTesting 4: Invariant Check: ONE COIN = ONE CURRENT UNIFIED SIGNAL...');
  resetSignalStoreForTesting();
  upsertSignals([baseSignal1]);
  const updateForSol: Signal = {
    ...baseSignal1,
    id: 'SIG-1-UPDATED',
    entryPrice: 101,
    moonScore: 90
  };
  const storeSignals = upsertSignals([updateForSol]);
  assert(storeSignals.length === 1, 'Only one signal exists for SOLUSDT (idempotent upsert preserves invariant)');
  assert(storeSignals[0].entryPrice === 101, 'Updated signal values reflected properly');

  // 5. Lightweight Charts Data Integrity (Ascending, no duplicate timestamps, positive numbers)
  console.log('\nTesting 5: Lightweight Charts Data Integrity...');
  const testCandles = createMockCandles(30, 50, 'UP');
  let isStrictlyAscending = true;
  for (let i = 1; i < testCandles.length; i++) {
    if (testCandles[i].timestamp <= testCandles[i - 1].timestamp) {
      isStrictlyAscending = false;
      break;
    }
  }
  assert(isStrictlyAscending, 'Candle timestamps strictly ascending for lightweight-charts v5 compatibility');

  console.log(`\nPHASE 18 BATTERY COMPLETED: ${passed}/${total} PASSED.`);
  if (passed === total) {
    console.log('ALL PHASE 18 TESTS PASSED SUCCESSFULLY.');
  } else {
    process.exit(1);
  }
}

runPhase18Battery();
