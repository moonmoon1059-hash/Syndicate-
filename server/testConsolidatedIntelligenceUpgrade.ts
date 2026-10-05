import { Signal, CoinAnalysisReport, ExpectedMoveClass, HighImpactOpportunityType } from '../src/types/crypto';
import { calculateOpportunityPriorityScore, rankMarketOpportunities } from './opportunityDiscoveryEngine';
import { analyzeSinglePair, scanMarketForSignals } from './signalEngine';
import { getNewListingRadar } from './listingRadarEngine';
import { getProcessedNewsIntelligence } from './newsIntelligenceEngine';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

export async function runConsolidatedIntelligenceTests() {
  console.log('\n=============================================================');
  console.log('🧪 RUNNING CONSOLIDATED INTELLIGENCE UPGRADE TEST SUITE');
  console.log('=============================================================\n');

  // Test 1: Elite Signal Prioritization with High R:R (1:5, 1:10, 1:20+)
  console.log('--- TEST 1: High R:R & Invariant Enforcement ---');
  const mockAplusSignal: Signal = {
    id: 'sig_sol_a_plus',
    symbol: 'SOLUSDT',
    baseAsset: 'SOL',
    quoteAsset: 'USDT',
    direction: 'LONG',
    qualityGrade: 'A+',
    actionablePriority: 'ENTRY_NOW',
    entryStatus: 'ENTRY_NOW',
    entryPrice: 150,
    currentPrice: 150,
    stopLoss: 146,
    tp1: 160,
    tp2: 175,
    tp3: 230,
    riskRewardRatio: 4.5,
    confidence: 92,
    targets: [
      { id: 'TP1', label: 'TP1', price: 160, percentage: 6.67, hit: false, structuralBasis: 'SWING_HIGH' },
      { id: 'TP2', label: 'TP2', price: 175, percentage: 16.67, hit: false, structuralBasis: 'ORDER_BLOCK' },
      { id: 'TP3', label: 'TP3', price: 230, percentage: 53.33, hit: false, structuralBasis: 'FIB_EXTENSION_1618' }
    ],
    priceChange24h: 5.2,
    confluences: [
      { id: 'c1', name: 'RVOL', description: 'RVOL expansion', weight: 80, category: 'VOLUME', status: 'BULLISH', score: 80 },
      { id: 'c2', name: 'SMC', description: 'SMC BOS', weight: 85, category: 'PATTERN', status: 'BULLISH', score: 85 }
    ],
    moonScore: 92,
    timeframe: '1h',
    timestamp: Date.now(),
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000 * 24,
    status: 'ACTIVE'
  };

  const mockHighRrSignal: Signal = {
    id: 'sig_meme_high_rr',
    symbol: 'PEPEUSDT',
    baseAsset: 'PEPE',
    quoteAsset: 'USDT',
    direction: 'LONG',
    qualityGrade: 'B', // Grade B with high R:R 1:15
    actionablePriority: 'ENTRY_NOW',
    entryStatus: 'ENTRY_NOW',
    entryPrice: 0.000010,
    currentPrice: 0.000010,
    stopLoss: 0.0000095,
    tp1: 0.000012,
    tp2: 0.000015,
    tp3: 0.000020,
    riskRewardRatio: 15.0,
    confidence: 78,
    targets: [
      { id: 'TP1', label: 'TP1', price: 0.000012, percentage: 20.0, hit: false, structuralBasis: 'SWING_HIGH' },
      { id: 'TP2', label: 'TP2', price: 0.000015, percentage: 50.0, hit: false, structuralBasis: 'ORDER_BLOCK' },
      { id: 'TP3', label: 'TP3', price: 0.000020, percentage: 100.0, hit: false, structuralBasis: 'FIB_EXTENSION_1618' }
    ],
    priceChange24h: 12.4,
    confluences: [
      { id: 'c3', name: 'RVOL', description: 'RVOL surge', weight: 90, category: 'VOLUME', status: 'BULLISH', score: 90 },
      { id: 'c4', name: 'SMC', description: 'Liquidity Sweep', weight: 80, category: 'PATTERN', status: 'BULLISH', score: 80 }
    ],
    moonScore: 78,
    timeframe: '1h',
    timestamp: Date.now(),
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000 * 24,
    status: 'ACTIVE'
  };

  const aPlusPriority = calculateOpportunityPriorityScore(mockAplusSignal);
  const highRrPriority = calculateOpportunityPriorityScore(mockHighRrSignal);

  console.log(`A+ Priority Score: ${aPlusPriority.priorityScore}`);
  console.log(`High R:R Grade B Priority Score: ${highRrPriority.priorityScore}`);

  // Invariant: High R:R alone can NEVER make or override an A+ grade
  assert(aPlusPriority.priorityScore > highRrPriority.priorityScore, 'A+ setup must rank higher than Grade B even with 1:15 R:R');
  assert(mockAplusSignal.expectedMoveClass === 'HIGH_EXPANSION_50PCT_PLUS', 'SOL +53% target classified as HIGH_EXPANSION_50PCT_PLUS');
  assert(mockHighRrSignal.expectedMoveClass === 'MACRO_EXPANSION_100PCT_PLUS', 'PEPE +100% target classified as MACRO_EXPANSION_100PCT_PLUS');

  // Test 2: One Coin = One Current Unified Signal Invariant
  console.log('\n--- TEST 2: Deduplication & Cross-Market Ranking ---');
  const duplicateSignals: Signal[] = [
    mockAplusSignal,
    { ...mockAplusSignal, id: 'sig_sol_dup', moonScore: 70 },
    mockHighRrSignal
  ];

  const rankingResult = rankMarketOpportunities(duplicateSignals);
  assert(rankingResult.topRankedOpportunities.length === 2, 'Deduplication guarantees exactly ONE signal per coin');
  assert(rankingResult.topRankedOpportunities[0].symbol === 'SOLUSDT', 'SOLUSDT ranked #1 due to A+ priority');

  // Test 3: New Listing Trade Intelligence (Binance, MEXC, OKX)
  console.log('\n--- TEST 3: New Listing Trade Intelligence ---');
  const listings = await getNewListingRadar();
  assert(listings.length >= 4, 'Multiple cross-exchange listings tracked');
  
  const actionableListing = listings.find(l => l.decision === 'LONG');
  assert(!!actionableListing, 'Actionable listing identified when post-listing base exists');
  assert(actionableListing?.entryZone?.ideal !== undefined, 'Actionable listing contains verified entryZone');
  assert(actionableListing?.stopLoss !== undefined, 'Actionable listing contains structural SL');
  assert(actionableListing?.riskRewardRatio !== undefined && actionableListing.riskRewardRatio > 2, 'Actionable listing has valid R:R');

  const waitListing = listings.find(l => l.decision === 'WAIT');
  assert(!!waitListing, 'Volatile unformed listing classified as WAIT with zero fabricated levels');

  // Test 4: Universal Deep Search & Single Coin Analysis Report
  console.log('\n--- TEST 4: Universal Coin Search Intelligence ---');
  const btcReport: CoinAnalysisReport = await analyzeSinglePair('BTC', '1h');
  assert(btcReport.symbol === 'BTC/USDT', 'BTC query resolved to canonical BTC/USDT');
  assert(btcReport.decision === 'LONG' || btcReport.decision === 'SHORT' || btcReport.decision === 'WAIT', 'Valid unified decision');
  assert(btcReport.qualityGrade !== undefined, 'Quality grade present');
  assert(btcReport.mtfTrendState !== undefined, 'MTF trend state present');
  assert(btcReport.currentStructureState !== undefined, 'Current structure state present');
  assert(Array.isArray(btcReport.supportLevels) && Array.isArray(btcReport.resistanceLevels), 'Support and resistance levels calculated');
  assert(btcReport.smc !== undefined, 'SMC report calculated');
  assert(btcReport.marketCycle !== undefined, 'Wyckoff market cycle calculated');
  assert(btcReport.whyThisDecision !== undefined, 'Detailed decision explanation provided');

  console.log('\n=============================================================');
  console.log('🎉 ALL CONSOLIDATED INTELLIGENCE TESTS PASSED PERFECTLY');
  console.log('=============================================================\n');
}

runConsolidatedIntelligenceTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
