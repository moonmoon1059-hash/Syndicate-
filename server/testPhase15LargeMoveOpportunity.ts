import {
  analyzeDerivativesCrowding,
  detectExhaustionReversal,
  classifyLargeMovePotential,
  evaluateLargeMoveOpportunity
} from './largeMoveOpportunityEngine';
import {
  Candle,
  LargeMoveClass,
  DerivativesCrowdingState,
  PumpDumpExhaustionState,
  Signal,
  TargetLevel
} from '../src/types/crypto';
import { upsertSignals, getAllStoredSignals, resetSignalStoreForTesting, getStoredSignalBySymbol } from './signalTracker';
import { DerivativesData } from './advancedMarketData';

let testsPassed = 0;
let testsFailed = 0;

function assert(description: string, condition: boolean) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${description}`);
  } else {
    testsFailed++;
    console.error(`  ✗ FAIL: ${description}`);
  }
}

// Helper to generate candles
function generateMockCandles(
  count: number,
  basePrice: number = 100,
  opts?: {
    parabolicPump?: boolean;
    waterfallDump?: boolean;
    consolidationBase?: boolean;
    sweepRejection?: boolean;
    sweepReclaim?: boolean;
    strongTrendNoReversal?: boolean;
  }
): Candle[] {
  const candles: Candle[] = [];
  const start = 1700000000000;

  for (let i = 0; i < count; i++) {
    const timestamp = start + i * 3600000;
    let open = basePrice;
    let close = basePrice;
    let high = basePrice * 1.01;
    let low = basePrice * 0.99;
    let volume = 100000;

    if (opts?.parabolicPump) {
      // 20-bar run from 100 up to 160 (+60%), then upper wick rejection on last bar
      const progress = i / count;
      open = basePrice * (1 + progress * 0.6);
      close = open * 1.02;
      high = close * 1.03;
      low = open * 0.99;
      volume = 150000 * (1 - progress * 0.4); // Volume declining on highs (volume divergence)

      if (i === count - 1) {
        // Last bar: upper wick rejection and bearish close below prior low
        high = close * 1.10;
        open = close * 1.01;
        close = open * 0.93; // Deep bearish drop
        low = close * 0.99;
        volume = 300000;
      }
    } else if (opts?.waterfallDump) {
      // 20-bar dump from 100 down to 60 (-40%), then lower wick absorption on last bar
      const progress = i / count;
      open = basePrice * (1 - progress * 0.4);
      close = open * 0.98;
      high = open * 1.01;
      low = close * 0.97;
      volume = 150000 * (1 - progress * 0.5); // Selling dry-up

      if (i === count - 1) {
        // Last bar: lower wick absorption and strong bullish reclaim close
        low = close * 0.90;
        open = close * 0.98;
        close = open * 1.08; // Bullish reclaim
        high = close * 1.02;
        volume = 350000;
      }
    } else if (opts?.strongTrendNoReversal) {
      // Powerful trend continuation without any rejection or structure breakdown
      const progress = i / count;
      open = basePrice * (1 + progress * 0.5);
      close = open * 1.03; // Consistently closing near high of bar
      high = close * 1.01;
      low = open * 0.99;
      volume = 200000 * (1 + progress * 0.5); // Volume expanding with trend
    } else if (opts?.sweepRejection) {
      // Swings around 100, then bar before last probes 110, last bar closes 98
      if (i < count - 2) {
        open = 100 + (i % 3);
        close = 100 - (i % 2);
        high = 104;
        low = 96;
      } else if (i === count - 2) {
        open = 101;
        high = 112; // Sweep above prior highs (104)
        close = 103;
        low = 100;
      } else {
        open = 103;
        high = 104;
        close = 96; // Closes deep below swing high with structure breakdown
        low = 95;
      }
    } else if (opts?.sweepReclaim) {
      // Swings around 100, then bar before last drops to 88, last bar reclaims 103
      if (i < count - 2) {
        open = 100 + (i % 3);
        close = 100 - (i % 2);
        high = 104;
        low = 96;
      } else if (i === count - 2) {
        open = 97;
        low = 88; // Sweep below prior lows (96)
        close = 95;
        high = 98;
      } else {
        open = 95;
        low = 94;
        close = 103; // Reclaims back above prior lows
        high = 104;
      }
    } else {
      // Default neutral/consolidation
      open = basePrice * (1 + (i % 5) * 0.005);
      close = open * 1.002;
      high = close * 1.01;
      low = open * 0.99;
    }

    candles.push({ timestamp, open, high, low, close, volume });
  }

  return candles;
}

console.log('================================================================');
console.log('RUNNING PHASE 15 TEST SUITE: LARGE MOVE & ASYMMETRY INTELLIGENCE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Test 1: Zero Data Fabrication & Unavailable Data Handling
// -----------------------------------------------------------------------------
console.log('TEST GROUP 1: Zero Data Fabrication & Missing Data Handling');
{
  const missingDerivReport = analyzeDerivativesCrowding(null, null, null, null, null);
  assert('Missing derivatives returns UNAVAILABLE crowding state', missingDerivReport.crowdingState === 'UNAVAILABLE');
  assert('Missing derivatives leaves fundingRate as null (no fabrication)', missingDerivReport.fundingRate === null);
  assert('Missing derivatives leaves openInterestUsd as null', missingDerivReport.openInterestUsd === null);
  assert('Missing derivatives marks fundingExtremity as UNKNOWN', missingDerivReport.fundingExtremity === 'UNKNOWN');
  assert('Missing derivatives marks oiState as UNKNOWN', missingDerivReport.oiState === 'UNKNOWN');

  const emptyCandlesReport = evaluateLargeMoveOpportunity({
    symbol: 'EMPTY/USDT',
    candles: [],
    currentPrice: 0,
    coreDecision: 'WAIT'
  });
  assert('Empty candles returns UNKNOWN move class', emptyCandlesReport.moveClass === 'UNKNOWN');
  assert('Empty candles returns null estimatedMovePct (no fabricated targets)', emptyCandlesReport.estimatedMovePct === null);
  assert('Zero fabricated data flag is strictly true', emptyCandlesReport.zeroFabricatedData === true);
  assert('Confluence alignment is NEUTRAL for empty input', emptyCandlesReport.confluenceAlignment === 'NEUTRAL');
}

// -----------------------------------------------------------------------------
// Test 2: Funding Rate Extremes & Rapid Funding Velocity
// -----------------------------------------------------------------------------
console.log('\nTEST GROUP 2: Funding Rate Extremes & Rapid Change');
{
  // Extreme positive funding (> 0.08% / 8h)
  const extremeLongDeriv = analyzeDerivativesCrowding(null, 0.0012, 50000000, 15.0, 0.0006);
  assert('0.12% funding rate classified as EXTREME_POSITIVE', extremeLongDeriv.fundingExtremity === 'EXTREME_POSITIVE');
  assert('High positive funding + expanding OI classifies as LONG_CROWDED', extremeLongDeriv.crowdingState === 'LONG_CROWDED');
  assert('Rapid funding change (+0.06%) detected in evidence', extremeLongDeriv.evidence.some(e => e.includes('Rapid funding acceleration')));

  // Extreme negative funding (< -0.08% / 8h)
  const extremeShortDeriv = analyzeDerivativesCrowding(null, -0.0010, 45000000, 12.0, -0.0005);
  assert('-0.10% funding rate classified as EXTREME_NEGATIVE', extremeShortDeriv.fundingExtremity === 'EXTREME_NEGATIVE');
  assert('High negative funding + expanding OI classifies as SHORT_CROWDED', extremeShortDeriv.crowdingState === 'SHORT_CROWDED');
  assert('Rapid negative funding collapse detected', extremeShortDeriv.evidence.some(e => e.includes('Rapid funding collapse')));

  // Neutral funding
  const neutralDeriv = analyzeDerivativesCrowding(null, 0.0001, 20000000, 2.0, 0);
  assert('Baseline 0.01% funding is NEUTRAL', neutralDeriv.fundingExtremity === 'NEUTRAL');
  assert('Balanced OI and funding results in BALANCED crowding state', neutralDeriv.crowdingState === 'BALANCED');
}

// -----------------------------------------------------------------------------
// Test 3: Open Interest Expansion & Contraction / Unwinding
// -----------------------------------------------------------------------------
console.log('\nTEST GROUP 3: Open Interest Velocity & Leverage Unwinding');
{
  const rapidOiExpansion = analyzeDerivativesCrowding(null, 0.0004, 80000000, 25.0);
  assert('OI change +25% classified as RAPID_EXPANSION', rapidOiExpansion.oiState === 'RAPID_EXPANSION');

  const moderateOiExpansion = analyzeDerivativesCrowding(null, 0.0002, 30000000, 10.0);
  assert('OI change +10% classified as MODERATE_EXPANSION', moderateOiExpansion.oiState === 'MODERATE_EXPANSION');

  const oiContraction = analyzeDerivativesCrowding(null, 0.0001, 25000000, -15.0);
  assert('OI drop -15% classified as CONTRACTION', oiContraction.oiState === 'CONTRACTION');
  assert('OI contraction classifies crowding as UNWINDING', oiContraction.crowdingState === 'UNWINDING');
}

// -----------------------------------------------------------------------------
// Test 4: Pump Exhaustion & Bearish Structure Confirmation
// -----------------------------------------------------------------------------
console.log('\nTEST GROUP 4: Pump Exhaustion & Bearish Structure Confirmation');
{
  const pumpCandles = generateMockCandles(25, 100, { parabolicPump: true });
  const exhaustionResult = detectExhaustionReversal(pumpCandles);

  assert('Parabolic pump flags isAlreadyExtended as true', exhaustionResult.isAlreadyExtended === true);
  assert('Anti-chase protocol is actively triggered', exhaustionResult.antiChaseActive === true);
  assert('Momentum weakening detected on upper wick / divergence', exhaustionResult.momentumWeakening === true);
  assert('Volume divergence detected on pump exhaustion', exhaustionResult.volumeDivergence === true);
  assert('Structural breakdown confirmed by candle close below prior swing', exhaustionResult.structuralConfirmation === true);
  assert('Exhaustion state is PUMP_EXHAUSTION', exhaustionResult.exhaustionState === 'PUMP_EXHAUSTION');
}

// -----------------------------------------------------------------------------
// Test 5: Dump Exhaustion & Bullish Structure Confirmation
// -----------------------------------------------------------------------------
console.log('\nTEST GROUP 5: Dump Exhaustion & Bullish Reclaim Confirmation');
{
  const dumpCandles = generateMockCandles(25, 100, { waterfallDump: true });
  const dumpExhaustionResult = detectExhaustionReversal(dumpCandles);

  assert('Deep selloff with selling dry-up detects volume divergence', dumpExhaustionResult.volumeDivergence === true);
  assert('Bullish structure reclaim confirmed on absorption candle', dumpExhaustionResult.structuralConfirmation === true);
  assert('Exhaustion state is DUMP_EXHAUSTION', dumpExhaustionResult.exhaustionState === 'DUMP_EXHAUSTION');
}

// -----------------------------------------------------------------------------
// Test 6: Crowding False Positives (Crowding WITHOUT Reversal Structure)
// -----------------------------------------------------------------------------
console.log('\nTEST GROUP 6: Crowding False Positive Invariants');
{
  // Strong markup trend continuing without rejection or structure failure
  const strongTrendCandles = generateMockCandles(25, 100, { strongTrendNoReversal: true });
  const strongTrendExhaustion = detectExhaustionReversal(strongTrendCandles);

  assert('Strong trend continuation does NOT falsely trigger structural confirmation', strongTrendExhaustion.structuralConfirmation === false);
  assert('Strong trend continuation does NOT trigger PUMP_EXHAUSTION (do not short every pump)', strongTrendExhaustion.exhaustionState === 'NONE');

  // Even with long crowding present, if structure is not confirmed, NEVER support short!
  const fullEval = evaluateLargeMoveOpportunity({
    symbol: 'TREND/USDT',
    candles: strongTrendCandles,
    currentPrice: strongTrendCandles[strongTrendCandles.length - 1].close,
    coreDecision: 'WAIT',
    fundingRate: 0.0015, // extreme positive funding
    openInterest: 90000000,
    oiChange24h: 30.0 // rapid OI expansion
  });

  assert('Long crowding is accurately detected', fullEval.crowdingState === 'LONG_CROWDED');
  assert('Structural confirmation is FALSE during strong continuation', fullEval.structuralConfirmation === false);
  assert('Unified decision authority WAIT guarantees confluence is strictly NEUTRAL', fullEval.confluenceAlignment === 'NEUTRAL');
}

// -----------------------------------------------------------------------------
// Test 7: Liquidity Sweeps (Sweep Rejection vs Sweep Reclaim)
// -----------------------------------------------------------------------------
console.log('\nTEST GROUP 7: Liquidity Action Telemetry');
{
  const sweepRejectionCandles = generateMockCandles(25, 100, { sweepRejection: true });
  const sweepRejResult = detectExhaustionReversal(sweepRejectionCandles);
  assert('Sweep above prior highs followed by close below detects SWEEP_REJECTION', sweepRejResult.liquidityAction === 'SWEEP_REJECTION');

  const sweepReclaimCandles = generateMockCandles(25, 100, { sweepReclaim: true });
  const sweepRecResult = detectExhaustionReversal(sweepReclaimCandles);
  assert('Sweep below prior lows followed by reclaim detects SWEEP_RECLAIM', sweepRecResult.liquidityAction === 'SWEEP_RECLAIM');
}

// -----------------------------------------------------------------------------
// Test 8: Large-Move Classifications (10%+, 20%+, 50%+, 100%+, EXTREME_ASYMMETRY, NORMAL)
// -----------------------------------------------------------------------------
console.log('\nTEST GROUP 8: Deterministic Large-Move Classifications');
{
  const normalCandles = generateMockCandles(25, 100);

  // 10%+ Class
  const targets10: TargetLevel[] = [{ id: 'TP1', label: 'TP1', price: 112, hit: false }];
  const eval10 = evaluateLargeMoveOpportunity({
    symbol: 'COIN10/USDT',
    candles: normalCandles,
    currentPrice: 100,
    entryPrice: 100,
    targets: targets10,
    riskRewardRatio: 1.8,
    coreDecision: 'LONG'
  });
  assert('12% structural target classified as 10_PERCENT_PLUS', eval10.moveClass === '10_PERCENT_PLUS');
  assert('Estimated move is 12%', eval10.estimatedMovePct === 12);

  // 20%+ Class
  const targets20: TargetLevel[] = [{ id: 'TP2', label: 'TP2', price: 125, hit: false }];
  const eval20 = evaluateLargeMoveOpportunity({
    symbol: 'COIN20/USDT',
    candles: normalCandles,
    currentPrice: 100,
    entryPrice: 100,
    targets: targets20,
    riskRewardRatio: 2.2,
    coreDecision: 'LONG'
  });
  assert('25% target classified as 20_PERCENT_PLUS', eval20.moveClass === '20_PERCENT_PLUS');

  // 50%+ Class
  const targets50: TargetLevel[] = [{ id: 'TP3', label: 'TP3', price: 160, hit: false }];
  const eval50 = evaluateLargeMoveOpportunity({
    symbol: 'COIN50/USDT',
    candles: normalCandles,
    currentPrice: 100,
    entryPrice: 100,
    targets: targets50,
    riskRewardRatio: 2.8,
    coreDecision: 'LONG'
  });
  assert('60% target classified as 50_PERCENT_PLUS', eval50.moveClass === '50_PERCENT_PLUS');

  // 100%+ Class
  const targets100: TargetLevel[] = [{ id: 'TP3', label: 'TP3', price: 210, hit: false }];
  const eval100 = evaluateLargeMoveOpportunity({
    symbol: 'COIN100/USDT',
    candles: normalCandles,
    currentPrice: 100,
    entryPrice: 100,
    targets: targets100,
    riskRewardRatio: 3.5,
    coreDecision: 'LONG'
  });
  assert('110% macro target classified as 100_PERCENT_PLUS', eval100.moveClass === '100_PERCENT_PLUS');

  // EXTREME_ASYMMETRY Class (R:R >= 5.0 with move >= 20%)
  const targetsAsym: TargetLevel[] = [{ id: 'TP3', label: 'TP3', price: 135, hit: false }];
  const evalAsym = evaluateLargeMoveOpportunity({
    symbol: 'ASYM/USDT',
    candles: normalCandles,
    currentPrice: 100,
    entryPrice: 100,
    targets: targetsAsym,
    riskRewardRatio: 6.5, // 1:6.5 R:R
    coreDecision: 'LONG'
  });
  assert('1:6.5 R:R with 35% target classified as EXTREME_ASYMMETRY', evalAsym.moveClass === 'EXTREME_ASYMMETRY');
  assert('Asymmetry score is high (>= 75)', evalAsym.asymmetryScore >= 75);

  // NORMAL Class (< 10%)
  const targetsNormal: TargetLevel[] = [{ id: 'TP1', label: 'TP1', price: 104, hit: false }];
  const evalNormal = evaluateLargeMoveOpportunity({
    symbol: 'NORM/USDT',
    candles: normalCandles,
    currentPrice: 100,
    entryPrice: 100,
    targets: targetsNormal,
    riskRewardRatio: 1.5,
    coreDecision: 'LONG'
  });
  assert('4% target classified as NORMAL', evalNormal.moveClass === 'NORMAL');
}

// -----------------------------------------------------------------------------
// Test 9: Anti-Chase Rule: Extended/Parabolic Moves CANNOT Be Early Opportunities
// -----------------------------------------------------------------------------
console.log('\nTEST GROUP 9: Anti-Chase & Overextension Invariants');
{
  const parabolicCandles = generateMockCandles(25, 100, { parabolicPump: true });
  // Parabolic asset with large targets proposed
  const targetsBig: TargetLevel[] = [{ id: 'TP3', label: 'TP3', price: 300, hit: false }];

  const evalParabolic = evaluateLargeMoveOpportunity({
    symbol: 'PUMPED/USDT',
    candles: parabolicCandles,
    currentPrice: parabolicCandles[parabolicCandles.length - 1].close,
    entryPrice: parabolicCandles[parabolicCandles.length - 1].close,
    targets: targetsBig,
    riskRewardRatio: 4.0,
    coreDecision: 'LONG'
  });

  assert('Anti-chase invariant active for already extended asset', evalParabolic.antiChaseActive === true);
  assert('Extended asset moveClass is restricted to NORMAL (cannot be labeled early large-move opportunity)', evalParabolic.moveClass === 'NORMAL');
  assert('Asymmetry score is penalized due to overextension', evalParabolic.asymmetryScore < 60);
  assert('Risk warnings include anti-chase guardrail', evalParabolic.riskWarnings.some(w => w.includes('Anti-chase')));
}

// -----------------------------------------------------------------------------
// Test 10: Unified Decision Authority (Funding/OI Alone Never Creates Direction)
// -----------------------------------------------------------------------------
console.log('\nTEST GROUP 10: Unified Decision Authority & Confluence Alignment');
{
  const normalCandles = generateMockCandles(25, 100);

  // When core decision is WAIT, even with extreme funding and crowding, confluence MUST BE NEUTRAL
  const waitEval = evaluateLargeMoveOpportunity({
    symbol: 'WAITCOIN/USDT',
    candles: normalCandles,
    currentPrice: 100,
    coreDecision: 'WAIT',
    fundingRate: 0.0020, // massive funding
    openInterest: 100000000,
    oiChange24h: 40.0
  });

  assert('Unified decision authority WAIT forces confluence to NEUTRAL', waitEval.confluenceAlignment === 'NEUTRAL');
  assert('Zero fabricated directional signal emitted', waitEval.confluenceAlignment !== 'SUPPORTS_LONG' && waitEval.confluenceAlignment !== 'SUPPORTS_SHORT');

  // When core decision is SHORT and long crowding + pump exhaustion confirm it:
  const pumpCandles = generateMockCandles(25, 100, { parabolicPump: true });
  const shortEval = evaluateLargeMoveOpportunity({
    symbol: 'SHORTCOIN/USDT',
    candles: pumpCandles,
    currentPrice: pumpCandles[pumpCandles.length - 1].close,
    coreDecision: 'SHORT',
    fundingRate: 0.0015,
    openInterest: 80000000,
    oiChange24h: 20.0
  });

  assert('Long crowding + pump exhaustion reinforces SHORT thesis (SUPPORTS_SHORT)', shortEval.confluenceAlignment === 'SUPPORTS_SHORT');

  // When core decision is LONG but asset is long-crowded and overextended:
  const longContradictionEval = evaluateLargeMoveOpportunity({
    symbol: 'OVERLONG/USDT',
    candles: pumpCandles,
    currentPrice: pumpCandles[pumpCandles.length - 1].close,
    coreDecision: 'LONG',
    fundingRate: 0.0015,
    openInterest: 80000000,
    oiChange24h: 20.0
  });

  assert('Entering long into extreme crowding and overextension flags CONTRADICTS_SETUP', longContradictionEval.confluenceAlignment === 'CONTRADICTS_SETUP');
}

// -----------------------------------------------------------------------------
// Test 11: Phase 10-14 Integration (Wyckoff, News, New Listing Interplay)
// -----------------------------------------------------------------------------
console.log('\nTEST GROUP 11: Integration with Phases 10-14 Context');
{
  const normalCandles = generateMockCandles(25, 100);

  // Wyckoff Accumulation integration
  const wyckoffEval = evaluateLargeMoveOpportunity({
    symbol: 'WYCKOFF/USDT',
    candles: normalCandles,
    currentPrice: 100,
    coreDecision: 'LONG',
    marketCycle: {
      cycle: 'ACCUMULATION',
      confidence: 85,
      wyckoffPhase: 'PHASE_C_TEST',
      wyckoffSpring: { detected: true, confirmed: true, price: 92, candleIndex: 20, volumeSpike: true, reclaimPrice: 100 },
      evidence: ['Wyckoff Spring shakeout confirmed']
    } as any
  });

  assert('Wyckoff Spring confirms liquidity action as SWEEP_RECLAIM', wyckoffEval.liquidityAction === 'SWEEP_RECLAIM');
  assert('Wyckoff accumulation structural base supports 20%+ swing projection', wyckoffEval.moveClass === '20_PERCENT_PLUS');

  // New Listing Base Building integration
  const listingEval = evaluateLargeMoveOpportunity({
    symbol: 'NEWLIST/USDT',
    candles: normalCandles,
    currentPrice: 100,
    coreDecision: 'LONG',
    newListingIntelligence: {
      isNewListing: true,
      discoveryStage: 'BASE_BUILDING',
      setupViability: 'ACTIONABLE_BASE'
    } as any
  });

  assert('New listing base building supports 20%+ large move class', listingEval.moveClass === '20_PERCENT_PLUS');
}

// -----------------------------------------------------------------------------
// Test 12: Invariant: ONE COIN = ONE CURRENT UNIFIED SIGNAL
// -----------------------------------------------------------------------------
console.log('\nTEST GROUP 12: ONE COIN = ONE CURRENT UNIFIED SIGNAL Invariant');
{
  resetSignalStoreForTesting();

  const normalCandles = generateMockCandles(25, 100);
  const largeMoveIntel = evaluateLargeMoveOpportunity({
    symbol: 'SOL/USDT',
    candles: normalCandles,
    currentPrice: 100,
    coreDecision: 'LONG',
    targets: [{ id: 'TP2', label: 'TP2', price: 125, hit: false }],
    riskRewardRatio: 3.0
  });

  const baseSignal: any = {
    id: 'sig_sol_001',
    symbol: 'SOL/USDT',
    direction: 'LONG',
    status: 'ACTIVE',
    entryStatus: 'ACTIVE_ENTERED',
    timeframe: '1h',
    entryPrice: 100,
    currentPrice: 100,
    stopLoss: 95,
    tp1: 110,
    tp2: 125,
    tp3: 140,
    targets: [{ id: 'TP1', label: 'TP1', price: 110 }, { id: 'TP2', label: 'TP2', price: 125 }],
    riskRewardRatio: 3.0,
    moonScore: 82,
    confidence: 85,
    qualityGrade: 'A',
    actionablePriority: 'A_PLUS_IMMEDIATE',
    timestamp: Date.now(),
    createdAt: Date.now(),
    primaryCategory: 'BREAKOUT_LONG',
    largeMoveIntelligence: largeMoveIntel
  };

  upsertSignals([baseSignal]);

  let allStored = getAllStoredSignals();
  assert('Store has exactly 1 signal after initial upsert', allStored.length === 1);
  assert('Stored signal contains largeMoveIntelligence', allStored[0].largeMoveIntelligence?.moveClass === '20_PERCENT_PLUS');

  // Second update for same coin with updated funding / move telemetry
  const updatedLargeMoveIntel = evaluateLargeMoveOpportunity({
    symbol: 'SOL/USDT',
    candles: normalCandles,
    currentPrice: 108,
    entryPrice: 100,
    coreDecision: 'LONG',
    targets: [{ id: 'TP3', label: 'TP3', price: 160, hit: false }],
    riskRewardRatio: 4.5
  });

  const updatedSignal: any = {
    ...baseSignal,
    currentPrice: 108,
    largeMoveIntelligence: updatedLargeMoveIntel
  };

  upsertSignals([updatedSignal]);

  allStored = getAllStoredSignals();
  assert('Store STILL has exactly 1 signal for SOL/USDT (zero duplicates)', allStored.length === 1);
  assert('Signal ID remains identical', allStored[0].id === 'sig_sol_001');
  assert('Updated signal reflects updated largeMoveIntelligence (50%+ move class)', allStored[0].largeMoveIntelligence?.moveClass === '50_PERCENT_PLUS');
}

console.log('\n================================================================');
console.log(`PHASE 15 TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
console.log('================================================================\n');

if (testsFailed > 0) {
  process.exit(1);
}
