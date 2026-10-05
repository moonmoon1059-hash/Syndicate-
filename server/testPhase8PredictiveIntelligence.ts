import { analyzeMarketRegime } from './marketRegimeEngine';
import { analyzeSectorRotation } from './sectorRotationEngine';
import { evaluatePredictiveOpportunity } from './predictiveOpportunityEngine';
import { calculateOpportunityPriorityScore, rankMarketOpportunities } from './opportunityDiscoveryEngine';
import { Candle, Signal, SignalQualityGrade, TargetLevel } from '../src/types/crypto';

function generateMockCandles(count: number, basePrice: number, trend: 'UP' | 'DOWN' | 'RANGE' | 'COMPRESSED'): Candle[] {
  const candles: Candle[] = [];
  let current = basePrice;
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * 3600000;
    let change = 0;
    if (trend === 'UP') change = (Math.random() * 0.02 + 0.005) * current;
    else if (trend === 'DOWN') change = -(Math.random() * 0.02 + 0.005) * current;
    else if (trend === 'RANGE') change = (Math.random() - 0.5) * 0.015 * current;
    else if (trend === 'COMPRESSED') change = (Math.random() - 0.5) * 0.003 * current;

    const open = current;
    const close = current + change;
    const high = Math.max(open, close) + Math.random() * 0.004 * current;
    const low = Math.min(open, close) - Math.random() * 0.004 * current;
    const volume = 100000 + Math.random() * 50000;

    candles.push({ timestamp: time, time, open, high, low, close, volume });
    current = close;
  }
  return candles;
}

export async function runPhase8ValidationSuite(): Promise<{ passed: boolean; testResults: { name: string; status: 'PASS' | 'FAIL'; details?: string }[] }> {
  const results: { name: string; status: 'PASS' | 'FAIL'; details?: string }[] = [];

  console.log('\n======================================================');
  console.log('🧪 MOONSCANNER PHASE 8: PREDICTIVE INTELLIGENCE TEST SUITE');
  console.log('======================================================\n');

  // TEST 1: Market Regime Engine
  try {
    const bullCandles = generateMockCandles(60, 60000, 'UP');
    const bearCandles = generateMockCandles(60, 60000, 'DOWN');
    const rangeCandles = generateMockCandles(60, 60000, 'RANGE');

    const bullRegime = analyzeMarketRegime(bullCandles, 75);
    const bearRegime = analyzeMarketRegime(bearCandles, 25);
    const rangeRegime = analyzeMarketRegime(rangeCandles, 50);

    const passBull = bullRegime.regime === 'BULL' && bullRegime.btcTrend === 'BULLISH';
    const passBear = bearRegime.regime === 'BEAR' && bearRegime.btcTrend === 'BEARISH';
    const passRange = rangeRegime.regime === 'RANGE' || rangeRegime.regime === 'TRANSITION';

    if (passBull && passBear && passRange) {
      results.push({ name: '1. Market Regime Classification', status: 'PASS', details: `Bull: ${bullRegime.regime}, Bear: ${bearRegime.regime}, Range: ${rangeRegime.regime}` });
    } else {
      results.push({ name: '1. Market Regime Classification', status: 'FAIL', details: `Bull: ${bullRegime.regime}, Bear: ${bearRegime.regime}, Range: ${rangeRegime.regime}` });
    }
  } catch (e: any) {
    results.push({ name: '1. Market Regime Classification', status: 'FAIL', details: e.message });
  }

  // TEST 2: Sector Rotation & Zero-Bias Capital Flow Engine
  try {
    const assets = [
      { symbol: 'BTCUSDT', priceChange24h: 2.1, volume24h: 5000000, rvol: 1.2 },
      { symbol: 'ETHUSDT', priceChange24h: 1.8, volume24h: 3000000, rvol: 1.1 },
      { symbol: 'SOLUSDT', priceChange24h: 4.5, volume24h: 4000000, rvol: 1.5 },
      { symbol: 'DOGEUSDT', priceChange24h: 14.2, volume24h: 3500000, rvol: 2.8 },
      { symbol: 'PEPEUSDT', priceChange24h: 18.5, volume24h: 2800000, rvol: 3.1 },
      { symbol: 'WIFUSDT', priceChange24h: 12.0, volume24h: 1500000, rvol: 2.4 },
      { symbol: 'UNIUSDT', priceChange24h: 0.5, volume24h: 800000, rvol: 0.9 },
      { symbol: 'AAVEUSDT', priceChange24h: -1.2, volume24h: 600000, rvol: 0.8 },
      { symbol: 'MOVEUSDT', priceChange24h: 9.5, volume24h: 1200000, rvol: 2.2 }
    ];

    const rotation = analyzeSectorRotation(assets);
    const memeSector = rotation.sectors.find(s => s.sector === 'MEMES');
    const isMemeLeading = rotation.activeRotationLeader === 'MEMES';
    const isMemeMania = rotation.btcToAltFlowState === 'MEME_MANIA';

    if (isMemeLeading && isMemeMania && memeSector && memeSector.flowDirection === 'INFLOW_ACCELERATING') {
      results.push({ name: '2. Sector Rotation & Zero-Bias Flow', status: 'PASS', details: `Leader: ${rotation.activeRotationLeader}, Flow State: ${rotation.btcToAltFlowState}` });
    } else {
      results.push({ name: '2. Sector Rotation & Zero-Bias Flow', status: 'FAIL', details: `Expected MEMES leader and MEME_MANIA flow, got: ${rotation.activeRotationLeader}, ${rotation.btcToAltFlowState}` });
    }
  } catch (e: any) {
    results.push({ name: '2. Sector Rotation & Zero-Bias Flow', status: 'FAIL', details: e.message });
  }

  // TEST 3: Compression Breakout Early-Move Detection
  try {
    const compressedCandles = generateMockCandles(40, 100, 'COMPRESSED');
    // Add breakout trigger bar
    const lastBar = compressedCandles[compressedCandles.length - 1];
    lastBar.close = 103.5;
    lastBar.high = 104.0;
    lastBar.volume = 350000; // Surge

    const result = evaluatePredictiveOpportunity({
      symbol: 'TESTUSDT',
      candles: compressedCandles,
      currentPrice: 103.5,
      direction: 'LONG',
      entryPrice: 103.0,
      stopLoss: 99.5,
      targets: [{ id: 'TP1', label: 'TP1', price: 110.0, percentage: 6.8, hit: false }],
      riskRewardRatio: 2.0,
      qualityGrade: 'A',
      rvol: 2.2,
      priceChange24h: 3.5
    });

    if (result.classification === 'COMPRESSION_BREAKOUT' && result.volatilityCompressionScore >= 70) {
      results.push({ name: '3. Compression Breakout Detection', status: 'PASS', details: `Classified: ${result.classification}, Compression Score: ${result.volatilityCompressionScore}` });
    } else {
      results.push({ name: '3. Compression Breakout Detection', status: 'FAIL', details: `Classification: ${result.classification}, Compression Score: ${result.volatilityCompressionScore}` });
    }
  } catch (e: any) {
    results.push({ name: '3. Compression Breakout Detection', status: 'FAIL', details: e.message });
  }

  // TEST 4: Smart Entry Timing & No-Chase Rule
  try {
    const candles = generateMockCandles(30, 50, 'RANGE');
    
    // Case A: Exact ideal entry zone
    const entryNowResult = evaluatePredictiveOpportunity({
      symbol: 'SOLUSDT',
      candles,
      currentPrice: 100.2,
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 96.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 112.0, hit: false }],
      riskRewardRatio: 3.0,
      qualityGrade: 'A',
      rvol: 1.5,
      priceChange24h: 2.0
    });

    // Case B: Extended beyond no-chase threshold (+3.5%)
    const waitPullbackResult = evaluatePredictiveOpportunity({
      symbol: 'SOLUSDT',
      candles,
      currentPrice: 103.5,
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 96.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 112.0, hit: false }],
      riskRewardRatio: 3.0,
      qualityGrade: 'A',
      rvol: 1.5,
      priceChange24h: 5.5
    });

    // Case C: Severely missed (+6%)
    const missedResult = evaluatePredictiveOpportunity({
      symbol: 'SOLUSDT',
      candles,
      currentPrice: 106.0,
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 96.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 112.0, hit: false }],
      riskRewardRatio: 3.0,
      qualityGrade: 'A',
      rvol: 1.5,
      priceChange24h: 8.0
    });

    // Case D: Invalidated below stop loss
    const invalidatedResult = evaluatePredictiveOpportunity({
      symbol: 'SOLUSDT',
      candles,
      currentPrice: 95.0,
      direction: 'LONG',
      entryPrice: 100.0,
      stopLoss: 96.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 112.0, hit: false }],
      riskRewardRatio: 3.0,
      qualityGrade: 'A',
      rvol: 1.5,
      priceChange24h: -5.0
    });

    const passA = entryNowResult.entryTiming === 'ENTRY_NOW';
    const passB = waitPullbackResult.entryTiming === 'WAIT_FOR_PULLBACK';
    const passC = missedResult.entryTiming === 'ENTRY_MISSED';
    const passD = invalidatedResult.entryTiming === 'INVALIDATED';

    if (passA && passB && passC && passD) {
      results.push({ name: '4. Smart Entry Timing & No-Chase Protection', status: 'PASS', details: 'All 4 timing states (ENTRY_NOW, WAIT_FOR_PULLBACK, ENTRY_MISSED, INVALIDATED) verified' });
    } else {
      results.push({ name: '4. Smart Entry Timing & No-Chase Protection', status: 'FAIL', details: `A:${entryNowResult.entryTiming}, B:${waitPullbackResult.entryTiming}, C:${missedResult.entryTiming}, D:${invalidatedResult.entryTiming}` });
    }
  } catch (e: any) {
    results.push({ name: '4. Smart Entry Timing & No-Chase Protection', status: 'FAIL', details: e.message });
  }

  // TEST 5: Cross-Asset Confirmation & Contradiction Detection
  try {
    const candles = generateMockCandles(30, 50, 'RANGE');
    const bearRegime = analyzeMarketRegime(generateMockCandles(50, 60000, 'DOWN'), 20);

    // Contradicted: Long signal during Bear regime with rising USDT dominance and crowded funding
    const contradictedResult = evaluatePredictiveOpportunity({
      symbol: 'AVAXUSDT',
      candles,
      currentPrice: 30.0,
      direction: 'LONG',
      entryPrice: 30.0,
      stopLoss: 28.5,
      targets: [{ id: 'TP1', label: 'TP1', price: 34.5, hit: false }],
      riskRewardRatio: 3.0,
      qualityGrade: 'B',
      rvol: 1.2,
      priceChange24h: 1.0,
      marketRegime: bearRegime,
      derivativesFunding: 0.08 // +8% funding (crowded)
    });

    if (contradictedResult.crossAssetConfirmation.isContradicted && contradictedResult.crossAssetConfirmation.contradictions.length >= 2) {
      results.push({ name: '5. Cross-Asset Confirmation & Contradiction Gating', status: 'PASS', details: `Contradictions caught: ${contradictedResult.crossAssetConfirmation.contradictions.length}` });
    } else {
      results.push({ name: '5. Cross-Asset Confirmation & Contradiction Gating', status: 'FAIL', details: `Expected contradiction, score was ${contradictedResult.crossAssetConfirmation.crossAssetScore}` });
    }
  } catch (e: any) {
    results.push({ name: '5. Cross-Asset Confirmation & Contradiction Gating', status: 'FAIL', details: e.message });
  }

  // TEST 6: Asymmetric 1:5, 1:10, 1:15, 1:20+ R:R Setup Ranking
  try {
    const targets10R: TargetLevel[] = [
      { id: 'TP1', label: 'TP1', price: 110, percentage: 10, hit: false },
      { id: 'TP2', label: 'TP2', price: 130, percentage: 30, hit: false },
      { id: 'TP3', label: 'TP3', price: 160, percentage: 60, hit: false },
      { id: 'TP4', label: 'TP4', price: 200, percentage: 100, hit: false }
    ];

    const signalAPlusAsymmetric: Partial<Signal> = {
      id: 'SIG-APLUS',
      symbol: 'SUIUSDT',
      direction: 'LONG',
      entryPrice: 100,
      stopLoss: 90, // 10% risk, TP4 at 200 is 100% upside = 1:10 RR
      targets: targets10R,
      riskRewardRatio: 10.0,
      qualityGrade: 'A+',
      actionablePriority: 'ENTRY_NOW',
      entryStatus: 'ENTRY_NOW',
      status: 'ACTIVE',
      moonScore: 92
    };

    const signalAStandard: Partial<Signal> = {
      id: 'SIG-A',
      symbol: 'ETHUSDT',
      direction: 'LONG',
      entryPrice: 3000,
      stopLoss: 2900,
      targets: [{ id: 'TP1', label: 'TP1', price: 3200, percentage: 6.6, hit: false }],
      riskRewardRatio: 2.0,
      qualityGrade: 'A',
      actionablePriority: 'ENTRY_NOW',
      entryStatus: 'ENTRY_NOW',
      status: 'ACTIVE',
      moonScore: 88
    };

    const scoreAPlus = calculateOpportunityPriorityScore(signalAPlusAsymmetric as Signal);
    const scoreA = calculateOpportunityPriorityScore(signalAStandard as Signal);

    const rankings = rankMarketOpportunities([signalAStandard as Signal, signalAPlusAsymmetric as Signal]);
    const topCoin = rankings.topRankedOpportunities[0].symbol;

    if (scoreAPlus.priorityScore > scoreA.priorityScore && topCoin === 'SUIUSDT') {
      results.push({ name: '6. Asymmetric R:R Structural Ranking', status: 'PASS', details: `A+ 1:10 RR Score: ${scoreAPlus.priorityScore} vs A 1:2 RR Score: ${scoreA.priorityScore}` });
    } else {
      results.push({ name: '6. Asymmetric R:R Structural Ranking', status: 'FAIL', details: `Top coin: ${topCoin}, A+ score: ${scoreAPlus.priorityScore}, A score: ${scoreA.priorityScore}` });
    }
  } catch (e: any) {
    results.push({ name: '6. Asymmetric R:R Structural Ranking', status: 'FAIL', details: e.message });
  }

  // TEST 7: Anti-Hindsight & Extended Parabolic Protection
  try {
    const candles = generateMockCandles(30, 50, 'UP');
    const exhaustedResult = evaluatePredictiveOpportunity({
      symbol: 'PUMPUSDT',
      candles,
      currentPrice: 85.0,
      direction: 'LONG',
      entryPrice: 80.0,
      stopLoss: 75.0,
      targets: [{ id: 'TP1', label: 'TP1', price: 95.0, hit: false }],
      riskRewardRatio: 3.0,
      qualityGrade: 'B',
      rvol: 3.5,
      priceChange24h: 35.0 // >20% extended
    });

    if (exhaustedResult.expansionStage === 'EXTENDED_EXHAUSTED' && exhaustedResult.crossAssetConfirmation.isContradicted) {
      results.push({ name: '7. Anti-Hindsight & Parabolic Protection', status: 'PASS', details: `Classified as ${exhaustedResult.expansionStage} with dump warning` });
    } else {
      results.push({ name: '7. Anti-Hindsight & Parabolic Protection', status: 'FAIL', details: `Stage: ${exhaustedResult.expansionStage}` });
    }
  } catch (e: any) {
    results.push({ name: '7. Anti-Hindsight & Parabolic Protection', status: 'FAIL', details: e.message });
  }

  // Print Summary
  const allPassed = results.every(r => r.status === 'PASS');
  console.log('\n--- PHASE 8 TEST SUMMARY ---');
  results.forEach(r => {
    console.log(`${r.status === 'PASS' ? '✅' : '❌'} ${r.name}: ${r.status} ${r.details ? `(${r.details})` : ''}`);
  });
  console.log(`\nOverall Result: ${allPassed ? 'ALL PHASE 8 TESTS PASSED' : 'SOME TESTS FAILED'}\n`);

  return { passed: allPassed, testResults: results };
}

// Execute standalone if executed directly
if (process.argv[1]?.includes('testPhase8PredictiveIntelligence')) {
  runPhase8ValidationSuite().then(res => {
    if (!res.passed) {
      process.exit(1);
    }
  });
}
