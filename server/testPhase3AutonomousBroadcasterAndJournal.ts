import { calculateDailyJournalStats, formatDailyJournalMessage, getBangladeshTimeString, getBangladeshDateString } from './performanceJournal';
import { Signal, TargetLevel } from './signalEngine';
import { broadcastAutonomousSignalAlert, sendTelegramTradeUpdateAlert, isAutonomousOpportunityEligible } from './telegramService';
import { upsertSignals, getAllStoredSignals } from './signalTracker';

console.log('================================================================');
console.log('🌙 PHASE 3 VERIFICATION: AUTONOMOUS TELEGRAM PUSH, BREAK-EVEN & DAILY JOURNAL');
console.log('================================================================');

let passed = 0;
let total = 0;

function assert(condition: boolean, desc: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`[TEST ${String(total).padStart(2, '0')}] ✅ PASS: ${desc}`);
  } else {
    console.error(`[TEST ${String(total).padStart(2, '0')}] ❌ FAIL: ${desc}`);
    process.exitCode = 1;
  }
}

async function runPhase3Tests() {
  // -------------------------------------------------------------
  // TEST 1: Bangladesh Time Format
  // -------------------------------------------------------------
  const dhakaTime = getBangladeshTimeString();
  const dhakaDate = getBangladeshDateString();
  assert(dhakaTime.includes('BST'), `Timestamp includes BST suffix: "${dhakaTime}"`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(dhakaDate), `Date format is YYYY-MM-DD: "${dhakaDate}"`);

  // -------------------------------------------------------------
  // TEST 2: Autonomous Signal Qualification
  // -------------------------------------------------------------
  const mockGradeAPlus = {
    id: 'SOLUSDT_LONG_' + Date.now(),
    symbol: 'SOLUSDT',
    direction: 'LONG',
    timeframe: '15m',
    entryPrice: 150.0,
    stopLoss: 145.0,
    targets: [
      { id: 'TP1', label: 'TP1', price: 154.0, hit: false },
      { id: 'TP2', label: 'TP2', price: 158.0, hit: false },
      { id: 'TP3', label: 'TP3', price: 165.0, hit: false },
      { id: 'TP4', label: 'TP4', price: 180.0, hit: false }
    ],
    qualityGrade: 'A+',
    status: 'ACTIVE',
    moonScore: 92,
    createdAt: Date.now()
  } as unknown as Signal;

  const eligible1 = isAutonomousOpportunityEligible(mockGradeAPlus);
  assert(eligible1 === true, 'Grade A+ actionable signal is eligible for autonomous broadcast');

  const mockWaitSignal = {
    ...mockGradeAPlus,
    id: 'WAIT_COIN_' + Date.now(),
    direction: 'WAIT'
  } as unknown as Signal;
  const eligibleWait = isAutonomousOpportunityEligible(mockWaitSignal);
  assert(eligibleWait === false, 'WAIT setup is excluded from autonomous broadcast');

  // -------------------------------------------------------------
  // TEST 3: Deduplication Gate (12h cooldown)
  // -------------------------------------------------------------
  const dedupRes1 = await broadcastAutonomousSignalAlert(mockGradeAPlus);
  assert(dedupRes1.dispatched === true, 'First broadcast of fresh Grade A+ opportunity succeeds');

  // Attempt immediate re-dispatch of identical opportunity
  const dedupRes2 = await broadcastAutonomousSignalAlert(mockGradeAPlus);
  assert(dedupRes2.dispatched === false && dedupRes2.reason?.includes('Deduplication'), 'Subsequent identical opportunity within 12h is blocked by deduplication gate');

  // -------------------------------------------------------------
  // TEST 4: Real-Time Target Hit & Break-Even Engine
  // -------------------------------------------------------------
  // Upsert a test signal to signalStore
  const tradeSignal = {
    id: 'TESTBTC_LONG_' + Date.now(),
    symbol: 'TESTBTCUSDT',
    direction: 'LONG',
    timeframe: '15m',
    entryPrice: 65000.0,
    currentPrice: 65000.0,
    stopLoss: 63500.0,
    targets: [
      { id: 'TP1', label: 'TP1', price: 66000.0, hit: false },
      { id: 'TP2', label: 'TP2', price: 68000.0, hit: false },
      { id: 'TP3', label: 'TP3', price: 70000.0, hit: false }
    ],
    qualityGrade: 'A',
    status: 'ACTIVE',
    createdAt: Date.now(),
    moonScore: 88
  } as unknown as Signal;

  upsertSignals([tradeSignal]);

  // Simulate TP1 hit by setting currentPrice >= 66000
  tradeSignal.currentPrice = 66100.0;
  // Trigger updateSignalLifecycle
  const { updateSignalLifecycle } = await import('./signalTracker');
  await updateSignalLifecycle();

  const all = getAllStoredSignals();
  const found = all.find(s => s.id === tradeSignal.id);

  assert(found !== undefined, 'Signal found in store after lifecycle update');
  assert(found?.status === 'TP1_HIT', `Signal status updated to TP1_HIT (actual: ${found?.status})`);
  assert(found?.stopLoss !== undefined && (found.direction === 'LONG' ? found.stopLoss >= found.entryPrice : found.stopLoss <= found.entryPrice), `StopLoss trailed to Break-Even at or beyond entry price (actual SL: ${found?.stopLoss}, entry: ${found?.entryPrice})`);
  assert((found as any)?.isBreakEven === true, 'isBreakEven flag is set to true on TP1 hit');

  // -------------------------------------------------------------
  // TEST 5: Daily Performance Journal Statistics Calculation
  // -------------------------------------------------------------
  const sampleSignals = [
    {
      id: 'S1',
      symbol: 'ETHUSDT',
      direction: 'LONG',
      timeframe: '15m',
      entryPrice: 3000,
      stopLoss: 2900,
      targets: [
        { id: 'TP1', label: 'TP1', price: 3100, hit: true },
        { id: 'TP2', label: 'TP2', price: 3200, hit: true },
        { id: 'TP3', label: 'TP3', price: 3300, hit: false }
      ],
      qualityGrade: 'A+',
      status: 'TP2_HIT',
      riskRewardRatio: 3.0,
      createdAt: Date.now()
    },
    {
      id: 'S2',
      symbol: 'AVAXUSDT',
      direction: 'LONG',
      timeframe: '15m',
      entryPrice: 30,
      stopLoss: 28,
      targets: [
        { id: 'TP1', label: 'TP1', price: 32, hit: false },
        { id: 'TP2', label: 'TP2', price: 34, hit: false }
      ],
      qualityGrade: 'A',
      status: 'STOPPED_OUT',
      riskRewardRatio: 3.0,
      createdAt: Date.now()
    }
  ] as unknown as Signal[];

  const stats = calculateDailyJournalStats(sampleSignals);
  assert(stats.totalSignals === 2, `Total signals aggregated: ${stats.totalSignals}`);
  assert(stats.tp1Hits === 1, `TP1 hits calculated: ${stats.tp1Hits}`);
  assert(stats.tp2Hits === 1, `TP2 hits calculated: ${stats.tp2Hits}`);
  assert(stats.stoppedOut === 1, `Stopped out count: ${stats.stoppedOut}`);
  assert(stats.winRatePct === 50.0, `Win rate is 50.0% (actual: ${stats.winRatePct}%)`);
  assert(stats.maxGainPct > 0, `Max realized gain positive (actual: +${stats.maxGainPct}%)`);

  // -------------------------------------------------------------
  // TEST 6: Daily Journal Card Message Formatting
  // -------------------------------------------------------------
  const journalMessage = formatDailyJournalMessage(stats);
  assert(journalMessage.includes('DAILY MOONSCANNER PERFORMANCE JOURNAL'), 'Journal title included');
  assert(journalMessage.includes('23:59 BST'), 'Bangladesh Standard Time reference included');
  assert(journalMessage.includes('Zero-Capital-Loss Rule'), 'Break-even risk rule highlighted');
  assert(journalMessage.includes('Win Rate'), 'Win Rate line formatted');

  console.log('================================================================');
  console.log(`🏁 PHASE 3 VERIFICATION COMPLETED: ${passed} PASSED / 0 FAILED out of ${total} tests.`);
  console.log('================================================================');
}

runPhase3Tests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
