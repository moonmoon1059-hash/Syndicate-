import { validateTargetLadder, generateDynamicTargets } from './tradeManagementEngine';
import {
  qualifyAndBuildPreMoveSignal,
  storeAuthoritativePreMoveSignal,
  getAuthoritativePreMoveSignals,
  removeAuthoritativePreMoveSignal,
  clearAuthoritativePreMoveSignals,
  checkAndUpdateExistingPreMoveSignal
} from './preMoveEngine';
import {
  qualifyTelegramCandidate,
  calculateOpportunityFingerprint,
  classifyOpportunityState,
  silentlySeedTelegramLedger,
  resetTelegramAlertEngineState
} from './telegramAlertEngine';
import { Signal, PreMoveReport, Candle } from '../src/types/crypto';

console.log('================================================================');
console.log('⚡ MOONSCANNER 22-TEST MASTER PRODUCTION REGRESSION SUITE');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS ${totalTests}/22] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL ${totalTests}/22] ${testName}`);
    if (details) console.error(`   Details: ${details}`);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------
// TEST 1: TP Uniqueness (TP1 != TP2 != TP3)
// -----------------------------------------------------------------------------
const duplicateTpTest = validateTargetLadder({
  entryPrice: 100,
  stopLoss: 95,
  direction: 'LONG',
  targets: [105, 105, 110] // Contains duplicate 105
});
assert(
  duplicateTpTest.validatedTargets.length === 2 &&
  duplicateTpTest.validatedTargets[0].price !== duplicateTpTest.validatedTargets[1].price,
  'TP Uniqueness: Deduplicates identical target levels (TP1 != TP2)',
  `Validated count: ${duplicateTpTest.validatedTargets.length}`
);

// -----------------------------------------------------------------------------
// TEST 2: Long Directional Ordering (Entry < TP1 < TP2 < TP3)
// -----------------------------------------------------------------------------
const longOrderingTest = validateTargetLadder({
  entryPrice: 100,
  stopLoss: 95,
  direction: 'LONG',
  targets: [115, 105, 120, 98] // Out of order and below entry
});
const longPrices = longOrderingTest.validatedTargets.map(t => t.price);
const isAscending = longPrices.every((p, idx) => idx === 0 ? p > 100 : p > longPrices[idx - 1]);
assert(
  isAscending && longPrices.length > 0,
  'Long Directional Ordering: Enforces Entry < TP1 < TP2 < TP3 strictly ascending',
  `Prices: ${longPrices.join(', ')}`
);

// -----------------------------------------------------------------------------
// TEST 3: Short Directional Ordering (Entry > TP1 > TP2 > TP3)
// -----------------------------------------------------------------------------
const shortOrderingTest = validateTargetLadder({
  entryPrice: 100,
  stopLoss: 105,
  direction: 'SHORT',
  targets: [85, 95, 80, 102] // Out of order and above entry
});
const shortPrices = shortOrderingTest.validatedTargets.map(t => t.price);
const isDescending = shortPrices.every((p, idx) => idx === 0 ? p < 100 : p < shortPrices[idx - 1]);
assert(
  isDescending && shortPrices.length > 0,
  'Short Directional Ordering: Enforces Entry > TP1 > TP2 > TP3 strictly descending',
  `Prices: ${shortPrices.join(', ')}`
);

// -----------------------------------------------------------------------------
// TEST 4: Minimum TP Separation (Drops Crammed / Fractional Levels)
// -----------------------------------------------------------------------------
const crammedTpTest = validateTargetLadder({
  entryPrice: 1000,
  stopLoss: 980,
  direction: 'LONG',
  targets: [1001, 1002, 1050], // 1001 and 1002 are 0.1% away from each other (<0.3% min)
  minSeparationPct: 0.3
});
assert(
  crammedTpTest.validatedTargets.length === 2 &&
  crammedTpTest.validatedTargets[0].price === 1001 &&
  crammedTpTest.validatedTargets[1].price === 1050,
  'Minimum TP Separation: Drops targets spaced closer than minimum separation threshold',
  `Validated count: ${crammedTpTest.validatedTargets.length}`
);

// -----------------------------------------------------------------------------
// TEST 5: Zero Fake Targets (Rejects Signal If No Genuine Structural Levels)
// -----------------------------------------------------------------------------
const fakeTargetsTest = validateTargetLadder({
  entryPrice: 100,
  stopLoss: 95,
  direction: 'LONG',
  targets: [] // Zero structural levels provided
});
assert(
  fakeTargetsTest.isValid === false && fakeTargetsTest.validatedTargets.length === 0,
  'Zero Fake Targets: Rejects signal if no genuine structural targets exist (no fabrication)',
  `isValid: ${fakeTargetsTest.isValid}, Target count: ${fakeTargetsTest.validatedTargets.length}`
);

// -----------------------------------------------------------------------------
// TEST 6: Stop Loss Invariant (No Inverted Risk Direction)
// -----------------------------------------------------------------------------
const invertedSlTest = validateTargetLadder({
  entryPrice: 100,
  stopLoss: 105, // Inverted: SL > Entry on a LONG trade!
  direction: 'LONG',
  targets: [110, 120]
});
assert(
  invertedSlTest.isValid === false && (invertedSlTest.rejectionReason?.includes('INVERTED_STOP_LOSS') || invertedSlTest.reason?.includes('INVERTED_STOP_LOSS')),
  'Stop Loss Invariant: Rejects directionally inverted stop loss (SL >= Entry on Long)',
  `Reason: ${invertedSlTest.reason}`
);

// -----------------------------------------------------------------------------
// TEST 7: Pre-Move Qualification (Coiling Candidate with Genuine Levels)
// -----------------------------------------------------------------------------
clearAuthoritativePreMoveSignals();

const mockPreMoveReport: any = {
  symbol: 'TESTUSDT',
  coilScore: 80,
  compressionRatio: 70,
  volatilitySqueeze: true,
  rangeHigh: 105,
  rangeLow: 98,
  coilSpanPct: 7,
  projectedDirection: 'BULLISH',
  confidenceScore: 85,
  breakoutImminence: 'IMMINENT_1H_4H',
  keyTriggerLevel: 106,
  invalidationPrice: 97,
  smartEntryTiming: {
    recommendedAction: 'ENTER_BREAKOUT',
    optimalEntryZone: { low: 100, high: 102 },
    stopLossPrice: 96,
    maxChasePrice: 108,
    timingState: 'OPTIMAL_BASE',
    invalidationReason: 'Range breakdown below 97'
  },
  setupStage: 'READY_TO_BREAK',
  noChaseLevel: 108,
  historicalEvidence: [],
  coilingDurationBars: 24
};

const mockCandles: any[] = Array.from({ length: 60 }, (_, i) => ({
  timestamp: Date.now() - (60 - i) * 3600000,
  openTime: Date.now() - (60 - i) * 3600000,
  closeTime: Date.now() - (59 - i) * 3600000,
  open: 100 + Math.sin(i / 5) * 2,
  high: 102 + Math.sin(i / 5) * 2,
  low: 99 + Math.sin(i / 5) * 2,
  close: 100.5 + Math.sin(i / 5) * 2,
  volume: 1000000,
  quoteVolume: 100000000
}));

const preMoveSig = qualifyAndBuildPreMoveSignal({
  preMoveReport: mockPreMoveReport,
  candles: mockCandles,
  currentPrice: 100.5,
  timeframe: '1h',
  priceDecimals: 2
});

assert(
  preMoveSig !== null &&
  preMoveSig.isPreMove === true &&
  preMoveSig.targets.length > 0 &&
  preMoveSig.stopLoss < preMoveSig.entryPrice,
  'Pre-Move Qualification: Qualifies coiling candidate with genuine levels',
  `PreMove Signal: ${preMoveSig !== null ? preMoveSig.symbol : 'null'}`
);

// -----------------------------------------------------------------------------
// TEST 8: Pre-Move Anti-Resurrection Guard (Tombstone Invalidation)
// -----------------------------------------------------------------------------
if (preMoveSig) {
  storeAuthoritativePreMoveSignal(preMoveSig);
}
removeAuthoritativePreMoveSignal('TESTUSDT', 'STOP_LOSS_BREACHED');

const revivedSig = qualifyAndBuildPreMoveSignal({
  preMoveReport: mockPreMoveReport,
  candles: mockCandles,
  currentPrice: 100.5,
  timeframe: '1h',
  priceDecimals: 2
});
assert(
  revivedSig === null,
  'Pre-Move Tombstone: Anti-resurrection guard prevents revived signal after invalidation',
  `Revived result: ${revivedSig === null ? 'null (Blocked)' : 'Revived (Leak)'}`
);

// -----------------------------------------------------------------------------
// TEST 9: Pre-Move Recovery after Tombstone Clear
// -----------------------------------------------------------------------------
clearAuthoritativePreMoveSignals();
const clearedSig = qualifyAndBuildPreMoveSignal({
  preMoveReport: mockPreMoveReport,
  candles: mockCandles,
  currentPrice: 101,
  timeframe: '1h',
  priceDecimals: 2
});
assert(
  clearedSig !== null,
  'Pre-Move Recovery: Cleared tombstone allows legitimate new setup formation',
  `Cleared result: ${clearedSig !== null}`
);

// -----------------------------------------------------------------------------
// TEST 10: Pre-Move Independent Evaluation (Authoritative Setup)
// -----------------------------------------------------------------------------
const independentPreMove = qualifyAndBuildPreMoveSignal({
  preMoveReport: mockPreMoveReport,
  candles: mockCandles,
  currentPrice: 100.5,
  timeframe: '1h',
  priceDecimals: 2
});
assert(
  independentPreMove !== null && independentPreMove.isPreMove === true,
  'Independent Pre-Move Evaluation: Generates authoritative setup without needing core scanner signal',
  `isPreMove: ${independentPreMove?.isPreMove}`
);

// -----------------------------------------------------------------------------
// TEST 11: Pre-Move Pipeline Delivery (Registry to Consumer)
// -----------------------------------------------------------------------------
clearAuthoritativePreMoveSignals();
if (independentPreMove) {
  storeAuthoritativePreMoveSignal(independentPreMove);
}
const activePreMoves = getAuthoritativePreMoveSignals();
assert(
  activePreMoves.length === 1 && activePreMoves[0].symbol === 'TESTUSDT',
  'Pre-Move Pipeline Delivery: Registry retains and delivers active candidates for UI and API consumption',
  `Count: ${activePreMoves.length}`
);

// -----------------------------------------------------------------------------
// TEST 12: Pre-Move Stage Progression & Anti-Chase Enforcement
// -----------------------------------------------------------------------------
// Trigger level is 106, noChase is 108. At 106.5, checkAndUpdate transitions it to TRIGGERED
checkAndUpdateExistingPreMoveSignal('TESTUSDT', 106.5);
const updatedPreMoves = getAuthoritativePreMoveSignals();
const stageTransitioned = updatedPreMoves.length === 1 && updatedPreMoves[0].preMoveReport?.setupStage === 'TRIGGERED';

// At 109, price exceeds no-chase limit (108) and is pruned
checkAndUpdateExistingPreMoveSignal('TESTUSDT', 109);
const postChaseSignals = getAuthoritativePreMoveSignals();
const antiChaseEnforced = postChaseSignals.length === 0;

assert(
  stageTransitioned && antiChaseEnforced,
  'Pre-Move Stage Progression & Anti-Chase: Transitions to TRIGGERED on breakout and prunes on chase limit breach',
  `Transitioned: ${stageTransitioned}, Pruned: ${antiChaseEnforced}`
);

// -----------------------------------------------------------------------------
// TEST 13: Telegram Hard Firewall - Blocks Ordinary Scanner Signals
// -----------------------------------------------------------------------------
resetTelegramAlertEngineState();
const normalOrdinarySignal: Signal = {
  id: 'sig-ordinary-1',
  symbol: 'ETHUSDT',
  baseAsset: 'ETH',
  quoteAsset: 'USDT',
  direction: 'LONG',
  timeframe: '1h',
  currentPrice: 3000,
  entryPrice: 3000,
  stopLoss: 2950,
  tp1: 3050,
  tp2: 3100,
  tp3: 3150,
  targets: [
    { id: 'TP1', label: 'TP1', price: 3050, percentage: 1.67, hit: false },
    { id: 'TP2', label: 'TP2', price: 3100, percentage: 3.33, hit: false },
    { id: 'TP3', label: 'TP3', price: 3150, percentage: 5.0, hit: false }
  ],
  qualityGrade: 'A',
  actionablePriority: 'ENTRY_NOW',
  status: 'ACTIVE',
  riskRewardRatio: 3.0,
  confidence: 80,
  createdAt: Date.now()
} as Signal;

const qualOrdinary = qualifyTelegramCandidate(normalOrdinarySignal);
assert(
  !qualOrdinary.qualified && qualOrdinary.reason === 'FIREWALL_BLOCKED_NORMAL_CORE_SIGNAL',
  'Telegram Hard Firewall: Normal/core scanner signal is strictly blocked from Telegram dispatch',
  `Qualified: ${qualOrdinary.qualified}, Reason: ${qualOrdinary.reason}`
);

// -----------------------------------------------------------------------------
// TEST 14: Telegram Hard Firewall - 100 Ordinary Signals -> 0 Dispatched
// -----------------------------------------------------------------------------
const ordinary100: Signal[] = Array.from({ length: 100 }, (_, i) => ({
  ...normalOrdinarySignal,
  id: `sig-ord-${i}`,
  symbol: `COIN${i}USDT`
}));
const bulk100Qual = ordinary100.filter(s => qualifyTelegramCandidate(s).qualified);
assert(
  bulk100Qual.length === 0,
  'Telegram Invariant (100 Ordinary -> 0 Telegram): Blocks bulk normal signals with zero leakage',
  `Passed: ${bulk100Qual.length} / 100`
);

// -----------------------------------------------------------------------------
// TEST 15: Telegram Low-Frequency Sniper - Zero Dispatches is a Valid Result
// -----------------------------------------------------------------------------
assert(
  bulk100Qual.length === 0,
  'Telegram Sniper Principle: Zero dispatches is a normal, healthy, and expected state (Silence > Bad Signal)',
  'Zero alerts qualified without errors'
);

// -----------------------------------------------------------------------------
// TEST 16: Telegram Qualification - Big Move Hunter Passes
// -----------------------------------------------------------------------------
const bigMoveSignal: Signal = {
  id: 'sig-bigmove-1',
  symbol: 'SOLUSDT',
  baseAsset: 'SOL',
  quoteAsset: 'USDT',
  direction: 'LONG',
  timeframe: '1h',
  currentPrice: 150,
  entryPrice: 150,
  stopLoss: 140,
  tp1: 180,
  tp2: 210,
  tp3: 240,
  targets: [
    { id: 'TP1', label: 'TP1', price: 180, percentage: 20, hit: false },
    { id: 'TP2', label: 'TP2', price: 210, percentage: 40, hit: false },
    { id: 'TP3', label: 'TP3', price: 240, percentage: 60, hit: false }
  ],
  qualityGrade: 'A+',
  actionablePriority: 'ENTRY_NOW',
  status: 'ACTIVE',
  riskRewardRatio: 9.0,
  confidence: 95,
  bigMoveHunter: {
    symbol: 'SOLUSDT',
    stage: 'EXPLOSIVE',
    score: 90,
    directionalBias: 'BULLISH',
    triggerPrice: 150,
    expectedMovePct: 60,
    urgency: 'HIGH',
    invalidationPrice: 140,
    primaryDriver: 'Volume breakout expansion',
    confluenceFactors: ['RVOL > 4.0', 'Compression breakout'],
    timestamp: Date.now()
  } as any,
  createdAt: Date.now()
} as Signal;

const qualBigMove = qualifyTelegramCandidate(bigMoveSignal);
assert(
  qualBigMove.qualified === true && (qualBigMove.alertType === 'EXTREME_MOVE' || qualBigMove.alertType === 'MAJOR_MOVE'),
  'Telegram Qualification: Big Move Hunter with EXPLOSIVE stage passes the Hard Firewall',
  `Qualified: ${qualBigMove.qualified}, Type: ${qualBigMove.alertType}, Score: ${qualBigMove.score}`
);

// -----------------------------------------------------------------------------
// TEST 17: Telegram Qualification - Big Dump Hunter Passes
// -----------------------------------------------------------------------------
const bigDumpSignal: Signal = {
  id: 'sig-bigdump-1',
  symbol: 'AVAXUSDT',
  baseAsset: 'AVAX',
  quoteAsset: 'USDT',
  direction: 'SHORT',
  timeframe: '1h',
  currentPrice: 30,
  entryPrice: 30,
  stopLoss: 33,
  tp1: 25,
  tp2: 20,
  tp3: 15,
  targets: [
    { id: 'TP1', label: 'TP1', price: 25, percentage: 16.6, hit: false },
    { id: 'TP2', label: 'TP2', price: 20, percentage: 33.3, hit: false },
    { id: 'TP3', label: 'TP3', price: 15, percentage: 50.0, hit: false }
  ],
  qualityGrade: 'A+',
  actionablePriority: 'ENTRY_NOW',
  status: 'ACTIVE',
  riskRewardRatio: 5.0,
  confidence: 90,
  dumpHunter: {
    symbol: 'AVAXUSDT',
    stage: 'DUMP_TRIGGERED',
    actionableShort: true,
    dumpProbability: 85,
    expectedDumpPct: 50,
    timestamp: Date.now()
  } as any,
  createdAt: Date.now()
} as Signal;

const qualBigDump = qualifyTelegramCandidate(bigDumpSignal);
assert(
  qualBigDump.qualified === true && qualBigDump.alertType === 'PRE_DUMP',
  'Telegram Qualification: Big Dump Hunter with DUMP_TRIGGERED passes the Hard Firewall',
  `Qualified: ${qualBigDump.qualified}, Type: ${qualBigDump.alertType}, Score: ${qualBigDump.score}`
);

// -----------------------------------------------------------------------------
// TEST 18: Telegram Qualification - Exceptional Pre-Move Warning Passes
// -----------------------------------------------------------------------------
const exceptionalPreMoveSignal: Signal = {
  id: 'PREMOVE-LINKUSDT-1h-BULLISH',
  symbol: 'LINKUSDT',
  baseAsset: 'LINK',
  quoteAsset: 'USDT',
  direction: 'LONG',
  timeframe: '1h',
  currentPrice: 15,
  entryPrice: 15,
  stopLoss: 14.2,
  tp1: 17.5,
  tp2: 20.0,
  tp3: 24.0,
  targets: [
    { id: 'TP1', label: 'TP1', price: 17.5, percentage: 16.6, hit: false },
    { id: 'TP2', label: 'TP2', price: 20.0, percentage: 33.3, hit: false },
    { id: 'TP3', label: 'TP3', price: 24.0, percentage: 60.0, hit: false }
  ],
  qualityGrade: 'A',
  actionablePriority: 'ENTRY_NOW',
  status: 'ACTIVE',
  riskRewardRatio: 11.25,
  confidence: 92,
  isPreMove: true,
  preMoveReport: {
    symbol: 'LINKUSDT',
    coilScore: 85,
    compressionRatio: 65,
    volatilitySqueeze: true,
    rangeHigh: 15.2,
    rangeLow: 14.3,
    coilSpanPct: 6,
    projectedDirection: 'BULLISH',
    confidenceScore: 90,
    breakoutImminence: 'IMMINENT_1H_4H',
    keyTriggerLevel: 15.3,
    invalidationPrice: 14.1,
    setupStage: 'READY_TO_BREAK',
    recommendedAction: 'PREPARE_BREAKOUT_LONG',
    noChaseLevel: 15.8,
    historicalEvidence: [],
    coilingDurationBars: 36
  } as any,
  createdAt: Date.now()
} as Signal;

const qualPreMove = qualifyTelegramCandidate(exceptionalPreMoveSignal);
assert(
  qualPreMove.qualified === true && qualPreMove.alertType === 'PRE_PUMP',
  'Telegram Qualification: Exceptional Pre-Move warning with READY_TO_BREAK stage passes',
  `Qualified: ${qualPreMove.qualified}, Type: ${qualPreMove.alertType}, Score: ${qualPreMove.score}`
);

// -----------------------------------------------------------------------------
// TEST 19: Telegram Qualification - Exceptional New Listing Base Breakout Passes
// -----------------------------------------------------------------------------
const newListingSignal: Signal = {
  id: 'sig-newlist-1',
  symbol: 'NEWCOINUSDT',
  baseAsset: 'NEWCOIN',
  quoteAsset: 'USDT',
  direction: 'LONG',
  timeframe: '1h',
  currentPrice: 1.0,
  entryPrice: 1.0,
  stopLoss: 0.90,
  tp1: 1.25,
  tp2: 1.50,
  tp3: 2.00,
  targets: [
    { id: 'TP1', label: 'TP1', price: 1.25, percentage: 25, hit: false },
    { id: 'TP2', label: 'TP2', price: 1.50, percentage: 50, hit: false },
    { id: 'TP3', label: 'TP3', price: 2.00, percentage: 100, hit: false }
  ],
  qualityGrade: 'A+',
  actionablePriority: 'ENTRY_NOW',
  status: 'ACTIVE',
  riskRewardRatio: 10.0,
  confidence: 95,
  newListingIntelligence: {
    symbol: 'NEWCOINUSDT',
    isNewListing: true,
    launchStatus: 'LISTING_LIVE',
    exchange: 'Binance',
    listingTime: Date.now() - 3600000 * 24,
    listingTimeAvailable: true,
    listingAgeHours: 24,
    discoveryStage: 'ESTABLISHING_RANGE',
    volatilityState: 'COMPRESSION',
    initialVolatilityPct: 15,
    liquidityStatus: 'HEALTHY',
    volumeAvailable: true,
    volume24hUsd: 50000000,
    rvol: 3.5,
    marketStructure: 'ACCUMULATION_BASE',
    structureAction: 'BREAKOUT_PENDING',
    setupViability: 'ACTIONABLE_BASE',
    hasStructuralLevels: true,
    antiChaseWarning: false,
    pumpDumpRisk: 'LOW',
    technicalAlignment: 'SUPPORTS_LONG',
    confluenceReason: 'Multi-hour base with rising volume',
    invalidation: 'Break below base support at 0.90'
  } as any,
  createdAt: Date.now()
} as Signal;

const qualNewListing = qualifyTelegramCandidate(newListingSignal);
assert(
  qualNewListing.qualified === true && qualNewListing.isExceptionalNewListing === true,
  'Telegram Qualification: Verified New Listing with ACTIONABLE_BASE passes the Hard Firewall',
  `Qualified: ${qualNewListing.qualified}, isNewListing: ${qualNewListing.isExceptionalNewListing}`
);

// -----------------------------------------------------------------------------
// TEST 20: Telegram News Catalyst Rule - News Alone NEVER Sends
// -----------------------------------------------------------------------------
const newsOnlySignal: Signal = {
  ...normalOrdinarySignal,
  id: 'sig-news-only',
  symbol: 'NEWSUSDT',
  newsImpactReport: {
    symbol: 'NEWSUSDT',
    isConfirmedCatalyst: true,
    impactScore: 90,
    technicalAlignment: 'SUPPORTS_LONG',
    headline: 'Major Protocol Upgrade Announced'
  } as any
};

const qualNewsOnly = qualifyTelegramCandidate(newsOnlySignal);
assert(
  !qualNewsOnly.qualified && qualNewsOnly.reason === 'FIREWALL_BLOCKED_NORMAL_CORE_SIGNAL',
  'Telegram News Catalyst Rule (Requirement 24): News catalyst alone NEVER triggers Telegram dispatch without technical setup',
  `Qualified: ${qualNewsOnly.qualified}, Reason: ${qualNewsOnly.reason}`
);

// -----------------------------------------------------------------------------
// TEST 21: LSK-Style Massive Range Expansion Detection
// -----------------------------------------------------------------------------
const lskStyleSignal: Signal = {
  id: 'sig-lsk-expansion',
  symbol: 'LSKUSDT',
  baseAsset: 'LSK',
  quoteAsset: 'USDT',
  direction: 'LONG',
  timeframe: '1h',
  currentPrice: 1.20,
  entryPrice: 1.20,
  stopLoss: 1.05,
  tp1: 1.80,
  tp2: 2.40,
  tp3: 3.50,
  targets: [
    { id: 'TP1', label: 'TP1', price: 1.80, percentage: 50, hit: false },
    { id: 'TP2', label: 'TP2', price: 2.40, percentage: 100, hit: false },
    { id: 'TP3', label: 'TP3', price: 3.50, percentage: 191.6, hit: false }
  ],
  qualityGrade: 'A+',
  actionablePriority: 'ENTRY_NOW',
  status: 'ACTIVE',
  riskRewardRatio: 15.3,
  confidence: 96,
  bigMoveHunter: {
    symbol: 'LSKUSDT',
    stage: 'EXTREME',
    score: 95,
    directionalBias: 'BULLISH',
    triggerPrice: 1.20,
    expectedMovePct: 150,
    rangeExpansion: {
      consecutiveExpansions: 3,
      expansionMultiplier: 4.5
    },
    volumeSurge: {
      rvol: 8.5
    },
    confluenceFactors: ['Triple ATR range expansion', 'RVOL 8.5x', 'Massive open interest expansion']
  } as any,
  createdAt: Date.now()
} as Signal;

const qualLsk = qualifyTelegramCandidate(lskStyleSignal);
assert(
  qualLsk.qualified === true && qualLsk.alertType === 'EXTREME_MOVE',
  'LSK Expansion Detection: Classifies massive multi-expansion opportunity as EXTREME_MOVE',
  `Qualified: ${qualLsk.qualified}, Alert type: ${qualLsk.alertType}, Score: ${qualLsk.score}`
);

// -----------------------------------------------------------------------------
// TEST 22: Telegram Deduplication & Cooldown Window Enforcement
// -----------------------------------------------------------------------------
silentlySeedTelegramLedger([lskStyleSignal]);
const fingerprintLsk = calculateOpportunityFingerprint({
  symbol: lskStyleSignal.symbol,
  direction: lskStyleSignal.direction,
  entryPrice: lskStyleSignal.entryPrice,
  entryLow: lskStyleSignal.entryPrice,
  entryHigh: lskStyleSignal.entryPrice,
  stopLoss: lskStyleSignal.stopLoss,
  targets: lskStyleSignal.targets,
  qualityGrade: lskStyleSignal.qualityGrade
});

const duplicateCheck = classifyOpportunityState({
  fingerprint: fingerprintLsk,
  normSym: 'LSKUSDT',
  direction: 'LONG',
  entryPrice: 1.20,
  stopLoss: 1.05,
  qualityGrade: 'A+',
  expectedMovePct: 150
});

assert(
  duplicateCheck.state === 'UNCHANGED_OPPORTUNITY',
  'Telegram Deduplication & Cooldown: Prevents duplicate dispatches within 4-hour cooldown window',
  `State: ${duplicateCheck.state}, Reason: ${duplicateCheck.reason}`
);

// -----------------------------------------------------------------------------
// FINAL SUMMARY
// -----------------------------------------------------------------------------
console.log('\n================================================================');
if (passedTests === 22) {
  console.log(`🎉 MASTER REGRESSION SUITE COMPLETE: ALL 22/22 TESTS PASSED!`);
} else {
  console.error(`⚠️ MASTER REGRESSION SUITE FAILED: ${passedTests}/22 PASSED`);
}
console.log('================================================================');
