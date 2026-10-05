import { calculateOpportunityPriorityScore, rankMarketOpportunities } from './opportunityDiscoveryEngine';
import { Signal, SignalDirection, SignalStatus, TargetLevel } from '../src/types/crypto';

console.log('=== RUNNING PHASE 6.2 DETERMINISTIC RANKING REGRESSION SUITE ===\n');

function createMockSignal(overrides: Partial<Signal>): Signal {
  const defaultTargets: TargetLevel[] = [
    { id: 'TP1', label: 'TP1', price: 105, percentage: 5, hit: false, structuralBasis: 'SWING_HIGH' },
    { id: 'TP2', label: 'TP2', price: 110, percentage: 10, hit: false, structuralBasis: 'ORDER_BLOCK' },
    { id: 'TP3', label: 'TP3', price: 115, percentage: 15, hit: false, structuralBasis: 'FAIR_VALUE_GAP' }
  ];

  return {
    id: `sig-${Math.random().toString(36).substring(2, 9)}`,
    symbol: 'TESTUSDT',
    baseAsset: 'TEST',
    quoteAsset: 'USDT',
    direction: 'LONG',
    timeframe: '1h',
    status: 'ACTIVE',
    moonScore: 88,
    confidence: 88,
    entryPrice: 100,
    stopLoss: 95,
    targets: defaultTargets,
    tp1: 105,
    tp2: 110,
    tp3: 115,
    riskRewardRatio: 3.0,
    currentPrice: 100,
    priceChange24h: 2.5,
    volume24h: 50000000,
    confluences: [],
    pattern: 'Bullish Orderblock Retest',
    qualityGrade: 'A',
    entryStatus: 'ENTRY_NOW',
    actionablePriority: 'ENTRY_NOW',
    timestamp: Date.now(),
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    ...overrides
  };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

// TEST 1: Grade Hierarchy (A+ > A > B > C)
{
  const sigAPlus = createMockSignal({ symbol: 'APLUS', qualityGrade: 'A+' });
  const sigA = createMockSignal({ symbol: 'A', qualityGrade: 'A' });
  const sigB = createMockSignal({ symbol: 'B', qualityGrade: 'B' });
  const sigC = createMockSignal({ symbol: 'C', qualityGrade: 'C' });

  const scoreAPlus = calculateOpportunityPriorityScore(sigAPlus);
  const scoreA = calculateOpportunityPriorityScore(sigA);
  const scoreB = calculateOpportunityPriorityScore(sigB);
  const scoreC = calculateOpportunityPriorityScore(sigC);

  assert(
    scoreAPlus.priorityScore > scoreA.priorityScore &&
    scoreA.priorityScore > scoreB.priorityScore &&
    scoreB.priorityScore > scoreC.priorityScore,
    'Quality Grade score tiering: A+ > A > B > C',
    `APlus: ${scoreAPlus.priorityScore}, A: ${scoreA.priorityScore}, B: ${scoreB.priorityScore}, C: ${scoreC.priorityScore}`
  );
}

// TEST 2: Genuine vs Fabricated TP Levels (Rule: More TP levels alone must NEVER increase quality)
{
  const genuine3TP = createMockSignal({
    symbol: 'GEN3',
    qualityGrade: 'A',
    targets: [
      { id: 'TP1', label: 'TP1', price: 105, percentage: 5, hit: false, structuralBasis: 'SWING_HIGH' },
      { id: 'TP2', label: 'TP2', price: 110, percentage: 10, hit: false, structuralBasis: 'ORDER_BLOCK' },
      { id: 'TP3', label: 'TP3', price: 115, percentage: 15, hit: false, structuralBasis: 'FAIR_VALUE_GAP' }
    ]
  });

  const inflatedFakeTP = createMockSignal({
    symbol: 'FAKE8',
    qualityGrade: 'A',
    targets: [
      { id: 'TP1', label: 'TP1', price: 105, percentage: 5, hit: false, structuralBasis: 'SWING_HIGH' },
      { id: 'TP2', label: 'TP2', price: 110, percentage: 10, hit: false, structuralBasis: 'ORDER_BLOCK' },
      { id: 'TP3', label: 'TP3', price: 115, percentage: 15, hit: false, structuralBasis: 'FAIR_VALUE_GAP' },
      { id: 'TP4', label: 'TP4', price: 120, percentage: 20, hit: false, structuralBasis: 'NONE' },
      { id: 'TP5', label: 'TP5', price: 125, percentage: 25, hit: false, structuralBasis: 'NONE' },
      { id: 'TP6', label: 'TP6', price: 130, percentage: 30, hit: false, structuralBasis: 'NONE' },
      { id: 'TP7', label: 'TP7', price: 135, percentage: 35, hit: false, structuralBasis: 'NONE' },
      { id: 'TP8', label: 'TP8', price: 140, percentage: 40, hit: false, structuralBasis: 'NONE' }
    ]
  });

  const scoreGenuine = calculateOpportunityPriorityScore(genuine3TP);
  const scoreFake = calculateOpportunityPriorityScore(inflatedFakeTP);

  assert(
    scoreGenuine.genuineTpCount === 3 && scoreFake.genuineTpCount === 3,
    'Genuine TP count filters out unverified non-structural targets',
    `Genuine: ${scoreGenuine.genuineTpCount}, Fake: ${scoreFake.genuineTpCount}`
  );
  assert(
    scoreGenuine.scoreBreakdown.structuralTpScore === scoreFake.scoreBreakdown.structuralTpScore,
    'Fabricated targets do NOT artificially inflate structuralTpScore',
    `Genuine TP Score: ${scoreGenuine.scoreBreakdown.structuralTpScore}, Fake TP Score: ${scoreFake.scoreBreakdown.structuralTpScore}`
  );
}

// TEST 3: Pump Exhaustion / Dump Risk Penalty
{
  const cleanSignal = createMockSignal({
    symbol: 'CLEAN',
    qualityGrade: 'A',
    pumpDump: {
      dumpRisk: 'LOW',
      pumpProbability: 10,
      dumpProbability: 5,
      isPumpExhausted: false,
      reasons: []
    } as any
  });

  const exhaustedSignal = createMockSignal({
    symbol: 'EXHAUST',
    qualityGrade: 'A',
    pumpDump: {
      dumpRisk: 'CRITICAL',
      pumpProbability: 90,
      dumpProbability: 85,
      isPumpExhausted: true,
      climaxDetected: true,
      reasons: ['Climax buying volume at resistance', 'Bearish CVD divergence']
    } as any
  });

  const cleanScore = calculateOpportunityPriorityScore(cleanSignal);
  const exhaustedScore = calculateOpportunityPriorityScore(exhaustedSignal);

  assert(
    exhaustedScore.scoreBreakdown.dumpRiskPenalty > 0,
    'Dump risk triggers substantial score deduction',
    `Penalty: -${exhaustedScore.scoreBreakdown.dumpRiskPenalty} pts`
  );
  assert(
    cleanScore.priorityScore > exhaustedScore.priorityScore,
    'Clean setup strictly outranks pump-exhausted setup with identical grade',
    `Clean: ${cleanScore.priorityScore}, Exhausted: ${exhaustedScore.priorityScore}`
  );
}

// TEST 4: Deterministic Ranking Invariant (No random shifts or ties)
{
  const setA = createMockSignal({ symbol: 'SOL', qualityGrade: 'A+', moonScore: 95, riskRewardRatio: 3.5 });
  const setB = createMockSignal({ symbol: 'AVAX', qualityGrade: 'A', moonScore: 88, riskRewardRatio: 2.8 });
  const setC = createMockSignal({ symbol: 'ETH', qualityGrade: 'A+', moonScore: 92, riskRewardRatio: 3.0 });
  const setD = createMockSignal({ symbol: 'DOGE', qualityGrade: 'B', moonScore: 78, riskRewardRatio: 2.0 });

  const list = [setB, setD, setA, setC];
  
  const ranked1 = rankMarketOpportunities(list);
  const ranked2 = rankMarketOpportunities(list);

  const symbols1 = ranked1.topRankedOpportunities?.map(s => s.symbol).join(',');
  const symbols2 = ranked2.topRankedOpportunities?.map(s => s.symbol).join(',');

  assert(
    symbols1 === symbols2,
    'Opportunity ranking is 100% deterministic across repeated runs',
    `Run 1: ${symbols1} | Run 2: ${symbols2}`
  );
  assert(
    ranked1.topRankedOpportunities?.[0].symbol === 'SOL',
    'Highest conviction A+ setup (SOL) ranks #1',
    `Rank 1: ${ranked1.topRankedOpportunities?.[0].symbol}`
  );
}

// TEST 5: Stopped Out / Invalidated Demoted to Bottom
{
  const activeSignal = createMockSignal({ symbol: 'ACTIVE1', status: 'ACTIVE', qualityGrade: 'B' });
  const stoppedSignal = createMockSignal({ symbol: 'STOP1', status: 'STOPPED_OUT', qualityGrade: 'A+' });
  const cancelledSignal = createMockSignal({ symbol: 'CANC1', status: 'CANCELLED', qualityGrade: 'A+' });

  const activeScore = calculateOpportunityPriorityScore(activeSignal);
  const stoppedScore = calculateOpportunityPriorityScore(stoppedSignal);
  const cancelledScore = calculateOpportunityPriorityScore(cancelledSignal);

  assert(
    activeScore.priorityScore > stoppedScore.priorityScore &&
    activeScore.priorityScore > cancelledScore.priorityScore,
    'Invalidated / Stopped Out signals receive massive penalty and rank below active setups',
    `Active: ${activeScore.priorityScore}, Stopped: ${stoppedScore.priorityScore}, Cancelled: ${cancelledScore.priorityScore}`
  );
}

console.log(`\n=== TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED ===\n`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL PHASE 6.2 RANKING INVARIANTS VERIFIED SUCCESSFULLY.');
}
