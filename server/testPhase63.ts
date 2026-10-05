import { Signal, CryptoCandle } from '../src/types/crypto';
import { calculateOpportunityPriorityScore, rankMarketOpportunities } from './opportunityDiscoveryEngine';
import { rankAndSortSignals } from '../src/utils/priorityRanking';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[Assertion Failure] ${msg}`);
  }
}

function mockSignal(overrides: Partial<Signal>): Signal {
  return {
    id: `sig-${Math.random().toString(36).substring(7)}`,
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    direction: 'LONG',
    timeframe: '1h',
    entryPrice: 60000,
    currentPrice: 60500,
    stopLoss: 59000,
    tp1: 63500,
    tp2: 67000,
    tp3: 72000,
    riskRewardRatio: 3.5,
    targets: [
      { id: '1', label: 'TP1', price: 63500, percentage: 5.8, hit: false },
      { id: '2', label: 'TP2', price: 67000, percentage: 11.6, hit: false }
    ],
    qualityGrade: 'A',
    actionablePriority: 'HIGH_PRIORITY',
    entryStatus: 'ENTRY_NOW',
    status: 'ACTIVE',
    confidence: 85,
    moonScore: 85,
    marketRegime: 'BULL',
    confluences: [
      { id: 'c1', name: 'SMC Order Block', description: 'Bullish order block', weight: 80, category: 'PATTERN', status: 'BULLISH', score: 80 },
      { id: 'c2', name: 'Bullish CVD', description: 'CVD delta rising', weight: 75, category: 'VOLUME', status: 'BULLISH', score: 75 }
    ],
    confirmations: ['Break of Structure', 'Volume Expansion'],
    timestamp: Date.now(),
    expiresAt: Date.now() + 86400000,
    createdAt: Date.now(),
    priceChange24h: 3.2,
    ...overrides
  };
}

async function runPhase63Verification() {
  console.log('--- STARTING PHASE 6.3 ELITE OPPORTUNITY & TRADE SETUP ENGINE VERIFICATION ---');

  // TEST 1: Strict Invariant - A+ > A > B > C ranking
  console.log('\n[Test 1] Deterministic Grade Ranking: A+ > A > B > C');
  const sigAPlus = mockSignal({ symbol: 'SOLUSDT', qualityGrade: 'A+', riskRewardRatio: 4.0, moonScore: 92 });
  const sigA = mockSignal({ symbol: 'ETHUSDT', qualityGrade: 'A', riskRewardRatio: 12.0, moonScore: 95 }); // Higher R:R but Grade A
  const sigB = mockSignal({ symbol: 'AVAXUSDT', qualityGrade: 'B', riskRewardRatio: 15.0, moonScore: 88 });
  const sigC = mockSignal({ symbol: 'DOGEUSDT', qualityGrade: 'C', riskRewardRatio: 20.0, moonScore: 70 });

  const ranked = rankAndSortSignals([sigC, sigA, sigB, sigAPlus]);
  assert(ranked[0].qualityGrade === 'A+', 'Grade A+ must rank #1 even if lower grades have higher nominal R:R');
  assert(ranked[1].qualityGrade === 'A', 'Grade A must rank above B and C');
  assert(ranked[2].qualityGrade === 'B', 'Grade B must rank above C');
  assert(ranked[3].qualityGrade === 'C', 'Grade C must rank last');
  console.log('✓ Grade tier hierarchy strictly preserved without distortion.');

  // TEST 2: High R:R Prioritization within same grade
  console.log('\n[Test 2] R:R Prioritization within Grade A+ (1:15 vs 1:3)');
  const sigAPlusModestRR = mockSignal({ symbol: 'SOLUSDT', qualityGrade: 'A+', riskRewardRatio: 3.0, actionablePriority: 'HIGH_PRIORITY' });
  const sigAPlusEliteRR = mockSignal({ symbol: 'NEARUSDT', qualityGrade: 'A+', riskRewardRatio: 12.5, actionablePriority: 'HIGH_PRIORITY' });

  const rankedAPlus = rankAndSortSignals([sigAPlusModestRR, sigAPlusEliteRR]);
  assert(rankedAPlus[0].symbol === 'NEARUSDT', 'Between two A+ signals, the 1:12.5 R:R setup must outrank the 1:3.0 R:R setup');
  console.log('✓ Elite R:R appropriately elevates setups within the same quality grade.');

  // TEST 3: High R:R alone can NEVER manufacture A+ grade
  console.log('\n[Test 3] High R:R alone cannot forge an A+ grade');
  const fakeHighRR = mockSignal({
    symbol: 'JUNKUSDT',
    qualityGrade: 'C',
    riskRewardRatio: 25.0, // High R:R
    moonScore: 50,
    actionablePriority: 'WAIT'
  });
  const priorityResult = calculateOpportunityPriorityScore(fakeHighRR);
  assert(priorityResult.rankingTier === 'TIER_5_WAIT_CHOP', 'Grade C with high R:R must remain in Tier 5 (Wait/Chop)');
  assert(priorityResult.rankingTier !== 'TIER_1_A_PLUS_ELITE', 'Grade C can never be promoted to Tier 1 A+');
  console.log('✓ High R:R cannot forge an unearned A+ grade.');

  // TEST 4: Move-class potential & High-Impact Opportunity Engine
  console.log('\n[Test 4] Move-class classification (50%+ and 100%+)');
  const macroMoveSig = mockSignal({
    symbol: 'SUIUSDT',
    qualityGrade: 'A+',
    expectedMoveClass: 'MACRO_EXPANSION_100PCT_PLUS',
    highImpactType: 'EARLY_CATALYST_SETUP',
    riskRewardRatio: 10.0
  });
  const macroPriority = calculateOpportunityPriorityScore(macroMoveSig);
  assert(macroPriority.priorityScore >= 95, 'Macro 100%+ move setups with A+ grade must score exceptionally high');
  console.log('✓ Move-class potential verified.');

  // TEST 5: Post-Pump Exhaustion Warning Invariant
  console.log('\n[Test 5] Post-Pump Exhaustion Protection');
  const healthySigA = mockSignal({ symbol: 'AVAXUSDT', qualityGrade: 'A' });
  const exhaustedSig = mockSignal({
    symbol: 'PEPEUSDT',
    qualityGrade: 'A',
    opportunityReport: {
      symbol: 'PEPEUSDT',
      category: 'MEME_HIGH_BETA',
      opportunityScore: 70,
      detectedPatterns: [],
      rvol: 3.5,
      priceVelocityScore: 90,
      compressionScore: 20,
      rsScoreVsBtc: 15,
      smcStructure: 'NONE',
      earlySetupType: 'NONE',
      postPumpDumpRisk: 'CRITICAL',
      summary: 'Extreme volume climax with upper wick exhaustion',
      evidenceList: ['Volume climax detected'],
      rankingBucket: 'WATCH_OPPORTUNITY'
    }
  });
  const healthyPriority = calculateOpportunityPriorityScore(healthySigA);
  const exhPriority = calculateOpportunityPriorityScore(exhaustedSig);
  
  // Signals with critical dump risk receive penalties
  assert(exhPriority.priorityScore < healthyPriority.priorityScore, 'Critical post-pump dump risk must reduce score vs healthy setup');
  assert(exhPriority.scoreBreakdown.dumpRiskPenalty >= 140, 'Must apply dump risk penalty of >= 140 points');
  console.log('✓ Post-pump exhaustion penalty active.');

  // TEST 6: Universal Discovery & Market Ranking Engine Integrity
  console.log('\n[Test 6] Universal Discovery & Market Ranking without fabrication');
  const discovery = rankMarketOpportunities([sigAPlus, sigA, sigB]);
  assert(Array.isArray(discovery.strongestAPlus), 'Discovery must return strongestAPlus array');
  assert(Array.isArray(discovery.earlyOpportunities), 'Discovery must return earlyOpportunities array');
  assert(Array.isArray(discovery.topRankedOpportunities), 'Discovery must return topRankedOpportunities array');
  console.log('✓ Universal discovery structure verified.');

  console.log('\n======================================================');
  console.log('✅ ALL PHASE 6.3 INVARIANTS AND SPECIFICATIONS VERIFIED PASSING!');
  console.log('======================================================\n');
}

runPhase63Verification().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
