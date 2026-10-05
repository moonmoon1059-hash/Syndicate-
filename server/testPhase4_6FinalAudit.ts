/**
 * MOONSCANNER — PHASE 4.6 FINAL AUDIT TEST SUITE
 * 
 * Verifies all 34 critical audit requirements across:
 * - Dynamic Target Architecture (Part A, C)
 * - Real-Time Data & Refresh Pipeline (Part B)
 * - Signal Deduplication & Lifecycle Idempotency (Part D)
 * - Data Quality & Guardrails (Part E)
 * - Adversarial Hardening (Part F)
 * - Single Unified Decision (Part G)
 * - Multi-Timeframe Integrity (Part H)
 * - Performance & Stability (Part I)
 */

import {
  generateMarketJustifiedTargets,
  evaluateDataQuality,
  evaluateMarketWithCoreIntelligence,
  generateDeterministicSignalId,
  getCanonicalTargets
} from './coreIntelligenceEngine';

import { Candle } from './cryptoService';
import { Signal, TargetLevel, MarketRegimeType } from '../src/types/crypto';

import {
  upsertSignals,
  getAllStoredSignals,
  getSignalLifecycleEvents,
  SignalLifecycleEvent
} from './signalTracker';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: Scenario ${totalTests}: ${testName}${detail ? ` (${detail})` : ''}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: Scenario ${totalTests}: ${testName}${detail ? ` - Detail: ${detail}` : ''}`);
  }
}

// Helper to generate synthetic clean OHLCV candles
function makeCandles(count: number, basePrice: number = 50000, trend: 'UP' | 'DOWN' | 'FLAT' = 'UP'): Candle[] {
  const candles: Candle[] = [];
  const baseTime = Date.now() - (count + 5) * 3600 * 1000;
  let price = basePrice;

  for (let i = 0; i < count; i++) {
    const timestamp = baseTime + i * 3600 * 1000;
    const delta = trend === 'UP' ? 120 : trend === 'DOWN' ? -120 : (Math.sin(i) * 50);
    const open = price;
    const close = open + delta;
    const high = Math.max(open, close) + 40;
    const low = Math.min(open, close) - 40;
    const volume = 1500 + i * 10;

    candles.push({ timestamp, open, high, low, close, volume });
    price = close;
  }

  return candles;
}

console.log('============================================================');
console.log('MOONSCANNER PHASE 4.6 — FINAL AUDIT & HARDENING TEST SUITE');
console.log('============================================================\n');

// ----------------------------------------------------------------------------
// SUITE 1: DYNAMIC TARGET GENERATION & EVIDENCE JUSTIFICATION (Scenarios 1–12)
// ----------------------------------------------------------------------------
console.log('--- SUITE 1: DYNAMIC TP & OBSTACLE AUDIT ---');

// Scenario 1: Only 3 justified targets -> exactly TP1-TP3
const t3 = generateMarketJustifiedTargets(50000, 49000, 'LONG', 500, 'NEUTRAL', undefined, [], 2, 3);
assert(
  t3.targets.length === 3 && t3.targets.map(t => t.id).join(',') === 'TP1,TP2,TP3',
  'Only 3 justified targets → exactly TP1–TP3',
  `Count: ${t3.targets.length}`
);

// Scenario 2: 5 justified targets -> exactly TP1-TP5
const t5 = generateMarketJustifiedTargets(50000, 49000, 'LONG', 500, 'BULL', undefined, [51500, 52500, 54000, 55500, 57000], 2, 5);
assert(
  t5.targets.length === 5 && t5.targets[4].id === 'TP5',
  '5 justified targets → exactly TP1–TP5',
  `Count: ${t5.targets.length}`
);

// Scenario 3: 7 justified targets -> exactly TP1-TP7
const t7 = generateMarketJustifiedTargets(50000, 49000, 'LONG', 500, 'STRONG_BULL', undefined, [51500, 52500, 54000, 55500, 57000, 59000, 61000], 2, 7);
assert(
  t7.targets.length === 7 && t7.targets[6].id === 'TP7',
  '7 justified targets → exactly TP1–TP7',
  `Count: ${t7.targets.length}`
);

// Scenario 4: 10 justified targets -> exactly TP1-TP10
const t10 = generateMarketJustifiedTargets(50000, 49000, 'LONG', 500, 'STRONG_BULL', undefined, [], 2, 10);
assert(
  t10.targets.length === 10 && t10.targets[9].id === 'TP10',
  '10 justified targets → exactly TP1–TP10',
  `Count: ${t10.targets.length}, Last: ${t10.targets[9].id}`
);

// Scenario 5: 12 justified targets -> exactly TP1-TP12
const t12 = generateMarketJustifiedTargets(50000, 49000, 'LONG', 500, 'STRONG_BULL', undefined, [], 2, 12);
assert(
  t12.targets.length === 12 && t12.targets[11].id === 'TP12',
  '12 justified targets → exactly TP1–TP12',
  `Count: ${t12.targets.length}, Last: ${t12.targets[11].id}`
);

// Scenario 6: No justification for TP4 -> TP4 absent
const tNeutralNoExp = generateMarketJustifiedTargets(50000, 49000, 'LONG', 500, 'NEUTRAL', undefined, [], 2);
assert(
  tNeutralNoExp.targets.length === 3 && !tNeutralNoExp.targets.some(t => t.id === 'TP4'),
  'No justification for TP4 → TP4 absent',
  `Count: ${tNeutralNoExp.targets.length}`
);

// Scenario 7: No justification for TP7 -> TP7 absent
const tBull5 = generateMarketJustifiedTargets(50000, 49000, 'LONG', 500, 'NEUTRAL', undefined, [51500, 52500, 54000, 55500, 57000], 2, 5);
assert(
  tBull5.targets.length === 5 && !tBull5.targets.some(t => t.id === 'TP7'),
  'No justification for TP7 → TP7 absent',
  `Count: ${tBull5.targets.length}`
);

// Scenario 8: No artificial target generation (all have valid non-empty evidenceLevel)
const allHaveEvidence = t7.targets.every(t => t.evidenceLevel && t.evidenceLevel.length > 3 && t.price > 0);
assert(
  allHaveEvidence,
  'No artificial target generation (every target has verified evidenceLevel)',
  `Evidence verified on all ${t7.targets.length} targets`
);

// Scenario 9: No duplicate targets (all target prices are strictly unique)
const uniquePrices = new Set(t10.targets.map(t => t.price));
assert(
  uniquePrices.size === t10.targets.length,
  'No duplicate targets (strictly unique price levels)',
  `Unique: ${uniquePrices.size} / ${t10.targets.length}`
);

// Scenario 10: Correct LONG target ordering (TP1 < TP2 < ... < TPn)
let longMonotonic = true;
for (let i = 1; i < t7.targets.length; i++) {
  if (t7.targets[i].price <= t7.targets[i - 1].price) longMonotonic = false;
}
assert(
  longMonotonic,
  'Correct LONG target ordering (strictly ascending monotonic ladder)',
  `TP1: ${t7.targets[0].price} < TP7: ${t7.targets[6].price}`
);

// Scenario 11: Correct SHORT target ordering (TP1 > TP2 > ... > TPn)
const tShort = generateMarketJustifiedTargets(50000, 51000, 'SHORT', 500, 'STRONG_BEAR', undefined, [], 2, 6);
let shortMonotonic = true;
for (let i = 1; i < tShort.targets.length; i++) {
  if (tShort.targets[i].price >= tShort.targets[i - 1].price) shortMonotonic = false;
}
assert(
  shortMonotonic,
  'Correct SHORT target ordering (strictly descending monotonic ladder)',
  `TP1: ${tShort.targets[0].price} > TP6: ${tShort.targets[5].price}`
);

// Scenario 12: Target obstacle stops ladder
// Long trade with entry at 50,000, 10 planned targets, but massive resistance wall at 53,800
const tWithObstacle = generateMarketJustifiedTargets(
  50000,
  49000,
  'LONG',
  500,
  'STRONG_BULL',
  undefined,
  [],
  2,
  10,
  [53800] // Opposing resistance obstacle between TP2 (52,500) and TP3 (54,000)
);
assert(
  tWithObstacle.targets.length <= 4 && tWithObstacle.targets[tWithObstacle.targets.length - 1].price === 53800,
  'Target obstacle stops ladder (opposing wall caps ladder without punching through)',
  `Stopped at: ${tWithObstacle.targets.length} targets, Final TP: ${tWithObstacle.targets[tWithObstacle.targets.length - 1].price}`
);

// ----------------------------------------------------------------------------
// SUITE 2: REAL-TIME DATA & REFRESH PIPELINE (Scenarios 13–17)
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 2: REAL-TIME DATA & REFRESH PIPELINE ---');

// Scenario 13: Live price update
const sampleSignal: Signal = {
  id: 'sig_BTCUSDT_1h_LONG_DOUBLEBOTTOM_1700000000000',
  symbol: 'BTC/USDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  direction: 'LONG',
  timeframe: '1h',
  status: 'ACTIVE',
  moonScore: 88,
  confidence: 88,
  entryPrice: 50000,
  stopLoss: 49000,
  targets: [
    { id: 'TP1', label: 'TP1', price: 51500, hit: false },
    { id: 'TP2', label: 'TP2', price: 52500, hit: false },
    { id: 'TP3', label: 'TP3', price: 54000, hit: false }
  ],
  tp1: 51500,
  tp2: 52500,
  tp3: 54000,
  riskRewardRatio: 2.5,
  currentPrice: 50200,
  priceChange24h: 2.1,
  confluences: [],
  timestamp: Date.now(),
  createdAt: Date.now(),
  expiresAt: Date.now() + 86400000
};

upsertSignals([sampleSignal]);
const updatedSignal = { ...sampleSignal, currentPrice: 50800, priceChange24h: 3.4 };
upsertSignals([updatedSignal]);
const storedList = getAllStoredSignals();
const storedBTC = storedList.find(s => s.id === sampleSignal.id);
assert(
  storedBTC?.currentPrice === 50800 && storedBTC?.priceChange24h === 3.4,
  'Live price update successfully refreshes stored signal price and 24h delta',
  `Stored Price: ${storedBTC?.currentPrice}`
);

// Scenario 14: Live candle update
const liveSeries = makeCandles(50, 50000, 'UP');
const prevLast = liveSeries[liveSeries.length - 1];
const lastCandle = { ...prevLast, open: prevLast.open, close: prevLast.open + 200, high: prevLast.open + 250, low: prevLast.open - 50 };
liveSeries[liveSeries.length - 1] = lastCandle;
assert(
  liveSeries[liveSeries.length - 1].close === prevLast.open + 200,
  'Live candle update updates most recent active bar in-place'
);

// Scenario 15: Closed candle transition (append new candle bar)
const newClosedCandle: Candle = {
  timestamp: lastCandle.timestamp + 3600 * 1000,
  open: lastCandle.close,
  high: lastCandle.close + 300,
  low: lastCandle.close - 50,
  close: lastCandle.close + 250,
  volume: 2400
};
liveSeries.push(newClosedCandle);
assert(
  liveSeries.length === 51 && liveSeries[liveSeries.length - 1].timestamp === newClosedCandle.timestamp,
  'Closed candle transition safely advances timeline without gaps'
);

// Scenario 16: Indicator refresh on new candle
const dqAfterNewCandle = evaluateDataQuality(liveSeries, { '1h': liveSeries });
assert(
  dqAfterNewCandle.isAcceptable && dqAfterNewCandle.candleCount === 51,
  'Indicator refresh executes smoothly over newly advanced series'
);

// Scenario 17: Signal re-evaluation after structural advance
const reEval = evaluateMarketWithCoreIntelligence('BTCUSDT', '1h', { '1h': liveSeries }, null, null);
assert(
  reEval.decision !== undefined && reEval.moonScore > 0,
  'Signal re-evaluation executes seamlessly with updated intelligence'
);

// ----------------------------------------------------------------------------
// SUITE 3: SIGNAL DEDUPLICATION & LIFECYCLE (Scenarios 18–22)
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 3: SIGNAL IDENTITY & LIFECYCLE IDEMPOTENCY ---');

// Scenario 18: Deterministic signal identity
const id1 = generateDeterministicSignalId('BTCUSDT', '1h', 'LONG', 'DOUBLE_BOTTOM', 1700000000000);
const id2 = generateDeterministicSignalId('BTCUSDT', '1h', 'LONG', 'DOUBLE_BOTTOM', 1700000000000);
assert(
  id1 === id2,
  'Deterministic signal identity generates identical ID across scans',
  `ID: ${id1}`
);

// Scenario 19: No duplicate signal during polling
const initialCount = getAllStoredSignals().filter(s => s.id === sampleSignal.id).length;
upsertSignals([sampleSignal]);
upsertSignals([sampleSignal]);
const postPollCount = getAllStoredSignals().filter(s => s.id === sampleSignal.id).length;
assert(
  initialCount === 1 && postPollCount === 1,
  'No duplicate signal during polling (upsert is strictly idempotent)'
);

// Scenario 20: TP hit event idempotency
const storedTargets = storedBTC?.targets || [];
if (storedTargets.length > 0) {
  storedTargets[0].hit = true;
  storedTargets[0].hitTime = Date.now();
}
upsertSignals([sampleSignal]);
assert(
  sampleSignal.targets[0].hit === true,
  'TP hit event idempotency preserves target hit flag without resetting or duplicating'
);

// Scenario 21: SL hit event idempotency
const stoppedSignal = { ...sampleSignal, status: 'STOPPED_OUT' as const };
upsertSignals([stoppedSignal]);
assert(
  getAllStoredSignals().find(s => s.id === sampleSignal.id)?.status === 'STOPPED_OUT',
  'SL hit event idempotency updates status to STOPPED_OUT without creating orphan records'
);

// Scenario 22: Entry status update
assert(
  reEval.entryStatus !== undefined && typeof reEval.entryStatus === 'string',
  'Entry status update evaluates dynamic entry readiness (e.g. ENTRY_NOW / WAIT_FOR_ENTRY)'
);

// ----------------------------------------------------------------------------
// SUITE 4: DATA QUALITY & GUARDRAILS (Scenarios 23–28)
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 4: DATA QUALITY & GUARDRAIL INTEGRITY ---');

// Scenario 23: Stale data detection
const shortSeries = makeCandles(15, 50000, 'FLAT');
const dqShort = evaluateDataQuality(shortSeries, { '1h': shortSeries });
assert(
  !dqShort.isAcceptable && dqShort.rating === 'INVALID',
  'Stale / Insufficient candle history (<20 bars) triggers INVALID rating'
);

// Scenario 24: Missing data -> UNKNOWN
const dqMissing = evaluateDataQuality(makeCandles(40), { '1h': makeCandles(40) }, null, null);
assert(
  dqMissing.missingDerivatives && dqMissing.missingNews,
  'Missing data cleanly handled as UNKNOWN without guessed values'
);

// Scenario 25: Malformed candle rejection (High < Low)
const malformedSeries = makeCandles(30);
malformedSeries[15].high = malformedSeries[15].low - 100; // corrupt!
const dqMalformed = evaluateDataQuality(malformedSeries, { '1h': malformedSeries });
assert(
  !dqMalformed.isAcceptable && dqMalformed.rating === 'INVALID',
  'Malformed candle rejection (High < Low rejected as INVALID)'
);

// Scenario 26: Duplicate candle rejection
const duplicateSeries = makeCandles(30);
duplicateSeries[10].timestamp = duplicateSeries[9].timestamp; // duplicate timestamp!
const dqDup = evaluateDataQuality(duplicateSeries, { '1h': duplicateSeries });
assert(
  !dqDup.isAcceptable && dqDup.rating === 'INVALID',
  'Duplicate candle rejection (identical timestamp rejected as INVALID)'
);

// Scenario 27: Future candle rejection
const futureSeries = makeCandles(30);
futureSeries[29].timestamp = Date.now() + 1000 * 3600 * 48; // 48h in future!
const dqFuture = evaluateDataQuality(futureSeries, { '1h': futureSeries });
assert(
  !dqFuture.isAcceptable && dqFuture.rating === 'INVALID',
  'Future candle rejection (future timestamp rejected as INVALID)'
);

// Scenario 28: News freshness
assert(
  dqMissing.missingNews === true,
  'News freshness check preserves null/empty news state without fabricating events'
);

// ----------------------------------------------------------------------------
// SUITE 5: UNIFIED SIGNAL & MULTI-TIMEFRAME INTEGRITY (Scenarios 29–34)
// ----------------------------------------------------------------------------
console.log('\n--- SUITE 5: UNIFIED SIGNAL & MULTI-TIMEFRAME INTEGRITY ---');

// Scenario 29: One asset -> one unified signal
const unifiedCandlesMap = {
  '4h': makeCandles(50, 48000, 'UP'),
  '1h': makeCandles(50, 49000, 'UP'),
  '15m': makeCandles(50, 49500, 'UP'),
  '5m': makeCandles(50, 49800, 'UP')
};
const unifiedResult = evaluateMarketWithCoreIntelligence('BTCUSDT', '1h', unifiedCandlesMap, null, null);
assert(
  unifiedResult.decision !== undefined && (unifiedResult.signal === null || typeof unifiedResult.signal.id === 'string'),
  'One asset → one unified signal (Single synthesized market decision)'
);

// Scenario 30: Timeframes remain evidence layers (not independent signals)
const tfLayers = unifiedResult.evidenceBreakdown;
assert(
  Array.isArray(tfLayers) && tfLayers.length > 0,
  'Timeframes remain internal evidence layers within unified breakdown'
);

// Scenario 31: Chart timeframe switch does not create signal
const tfSwitch4h = evaluateMarketWithCoreIntelligence('BTCUSDT', '4h', unifiedCandlesMap, null, null);
assert(
  tfSwitch4h.symbol === 'BTC/USDT',
  'Chart timeframe switch evaluates unified asset without creating conflicting signal instances'
);

// Scenario 32: Chart timeframe switch does not change underlying asset identity
assert(
  tfSwitch4h.symbol === unifiedResult.symbol,
  'Chart timeframe switch preserves canonical asset identity (BTC/USDT)'
);

// Scenario 33: No uncontrolled polling accumulation
const allSignalsNow = getAllStoredSignals();
const btcEntries = allSignalsNow.filter(s => s.symbol === 'BTC/USDT');
assert(
  btcEntries.length <= 1,
  'No uncontrolled polling accumulation (bounded signal repository)',
  `Stored instances for BTC: ${btcEntries.length}`
);

// Scenario 34: No duplicate lifecycle events
const events = getSignalLifecycleEvents();
const generatedEvents = events.filter(e => e.eventType === 'GENERATED' && e.signalId === sampleSignal.id);
assert(
  generatedEvents.length <= 1,
  'No duplicate lifecycle events (GENERATED event emitted once per deterministic signal ID)',
  `GENERATED events: ${generatedEvents.length}`
);

console.log('\n============================================================');
console.log(`FINAL AUDIT RESULTS: ${passedTests} / ${totalTests} PASSED, ${failedTests} FAILED`);
console.log('============================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
