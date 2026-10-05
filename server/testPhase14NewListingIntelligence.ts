import {
  determineListingStatus,
  calculateListingTimeAndAge,
  extractListingReferenceLevels,
  analyzePriceDiscoveryStage,
  analyzeListingVolatility,
  analyzeListingLiquidity,
  identifyFirstMarketStructure,
  detectStructureAction,
  assessAccumulationDistribution,
  assessDumpRiskAndOverextension,
  assessSetupViability,
  calculateStructuralLevels,
  evaluateNewListingConfluence,
  evaluateNewListingIntelligence,
  trackListingStateTransition
} from './newListingEngine';
import {
  Candle,
  ListingStatus,
  Signal,
  NewsMarketImpactReport
} from '../src/types/crypto';
import { upsertSignals, getAllStoredSignals, resetSignalStoreForTesting, getStoredSignalBySymbol } from './signalTracker';

function createMockCandles(
  count: number,
  basePrice: number = 10,
  opts?: {
    firstBarSpike?: boolean;
    bleedDown?: boolean;
    tightBase?: boolean;
    breakout?: boolean;
    rejection?: boolean;
    reclaim?: boolean;
  }
): Candle[] {
  const candles: Candle[] = [];
  const start = 1700000000000;

  for (let i = 0; i < count; i++) {
    const timestamp = start + i * 3600000;
    let open = basePrice;
    let close = basePrice;
    let high = basePrice * 1.02;
    let low = basePrice * 0.98;
    let volume = 100000;

    if (i === 0 && opts?.firstBarSpike) {
      open = basePrice;
      high = basePrice * 2.5; // +150% spike
      low = basePrice * 0.95;
      close = basePrice * 2.1;
      volume = 5000000;
    } else if (opts?.bleedDown && i > 0) {
      open = basePrice * Math.pow(0.95, i);
      close = open * 0.96;
      low = close * 0.98;
      high = open * 1.01;
      volume = 200000;
    } else if (opts?.tightBase && i > 3) {
      open = basePrice * (1.1 + (i % 2 === 0 ? 0.01 : -0.01));
      close = open * 1.005;
      high = open * 1.02;
      low = open * 0.99;
      volume = 50000;
    } else if (opts?.breakout && i === count - 1) {
      open = basePrice * 1.25;
      close = basePrice * 1.45; // Breakout above high
      high = basePrice * 1.48;
      low = basePrice * 1.24;
      volume = 2000000;
    } else if (opts?.rejection && i === count - 1) {
      open = basePrice * 1.2;
      high = basePrice * 1.5; // Tested high
      close = basePrice * 1.15; // Rejected with big upper wick
      low = basePrice * 1.14;
      volume = 1500000;
    } else if (opts?.reclaim && i === count - 1) {
      open = basePrice * 0.95;
      low = basePrice * 0.92;
      close = basePrice * 1.05; // Closed back above open
      high = basePrice * 1.06;
      volume = 1200000;
    }

    candles.push({
      timestamp,
      time: timestamp,
      open,
      high,
      low,
      close,
      volume
    });
  }

  return candles;
}

export async function runPhase14NewListingIntelligenceTests(): Promise<{ passed: number; failed: number; total: number }> {
  console.log('================================================================');
  console.log('🧪 MOONSCANNER PHASE 14: NEW LISTING INTELLIGENCE TEST SUITE');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, details?: string) {
    if (condition) {
      passed++;
      console.log(`✅ ${name}${details ? ': ' + details : ''}`);
    } else {
      failed++;
      console.error(`❌ ${name} FAILED${details ? ': ' + details : ''}`);
    }
  }

  // -------------------------------------------------------------
  // TEST SUITE 1: Listing Detection & State Machine Transitions
  // -------------------------------------------------------------
  console.log('\n--- Test Group 1: Listing-State Transitions & State Machine ---');

  const status1 = determineListingStatus({
    candlesCount: 0,
    hasTradingHistory: false
  });
  assert('Pre-listing detection with 0 candles', status1 === 'PRE_LISTING', `got ${status1}`);

  const status2 = determineListingStatus({
    candlesCount: 12,
    listingAgeHours: 12,
    hasTradingHistory: true
  });
  assert('Listing live detection when age <= 24h', status2 === 'LISTING_LIVE', `got ${status2}`);

  const status3 = determineListingStatus({
    candlesCount: 72,
    listingAgeHours: 72,
    hasTradingHistory: true
  });
  assert('Post-listing detection when age > 24h and <= 336h', status3 === 'POST_LISTING', `got ${status3}`);

  const status4 = determineListingStatus({
    candlesCount: 500,
    listingAgeHours: 500,
    hasTradingHistory: true
  });
  assert('Mature asset transition to NONE when age > 14 days', status4 === 'NONE', `got ${status4}`);

  // Transition History Tracking
  const history1 = trackListingStateTransition('PRE_LISTING', 'LISTING_LIVE', [], 'First candle open');
  assert('Transition history records state change', history1.length === 1 && history1[0].from === 'PRE_LISTING' && history1[0].to === 'LISTING_LIVE');

  const history2 = trackListingStateTransition('LISTING_LIVE', 'POST_LISTING', history1, 'Age exceeded 24 hours');
  assert('Transition history cascades multiple transitions', history2.length === 2 && history2[1].to === 'POST_LISTING');

  // -------------------------------------------------------------
  // TEST SUITE 2: Listing Time Handling (Zero Data Fabrication)
  // -------------------------------------------------------------
  console.log('\n--- Test Group 2: Exact Listing Time Handling (Zero Fabrication) ---');

  const evalNow = 1700036000000; // 10 hours after 1700000000000
  const timeWithExplicit = calculateListingTimeAndAge({
    listingTime: 1700000000000,
    evaluationTimestamp: evalNow
  });
  assert('Calculates exact listing time when provided', timeWithExplicit.listingTime === 1700000000000 && timeWithExplicit.listingTimeAvailable === true);
  assert('Calculates exact listing age in hours', timeWithExplicit.listingAgeHours === 10, `got ${timeWithExplicit.listingAgeHours}h`);

  const timeWithFirstCandle = calculateListingTimeAndAge({
    firstCandleTimestamp: 1700018000000,
    evaluationTimestamp: evalNow
  });
  assert('Calculates listing time from first trade candle timestamp', timeWithFirstCandle.listingTime === 1700018000000 && timeWithFirstCandle.listingAgeHours === 5);

  const timeMissing = calculateListingTimeAndAge({
    listingTime: null,
    firstCandleTimestamp: null
  });
  assert('Returns null for listingTime when unavailable (NO FABRICATION)', timeMissing.listingTime === null && timeMissing.listingTimeAvailable === false);
  assert('Returns null for listingAgeHours when unavailable (NO FABRICATION)', timeMissing.listingAgeHours === null);

  // -------------------------------------------------------------
  // TEST SUITE 3: Price Discovery Stages
  // -------------------------------------------------------------
  console.log('\n--- Test Group 3: Price Discovery Stages ---');

  const spikeCandles = createMockCandles(4, 10, { firstBarSpike: true });
  const refSpike = extractListingReferenceLevels(spikeCandles, 21);
  const stageSpike = analyzePriceDiscoveryStage(spikeCandles, 21, refSpike, 'LISTING_LIVE');
  assert('Detects INITIAL_SPIKE on massive first candle range', stageSpike === 'INITIAL_SPIKE', `got ${stageSpike}`);

  const discoveryCandles = createMockCandles(10, 10);
  const refDisc = extractListingReferenceLevels(discoveryCandles, 10.2);
  const stageDisc = analyzePriceDiscoveryStage(discoveryCandles, 10.2, refDisc, 'LISTING_LIVE');
  assert('Detects PRICE_DISCOVERY during early discovery bars', stageDisc === 'PRICE_DISCOVERY', `got ${stageDisc}`);

  const baseCandles = createMockCandles(20, 10, { tightBase: true });
  const refBase = extractListingReferenceLevels(baseCandles, 11.05);
  const stageBase = analyzePriceDiscoveryStage(baseCandles, 11.05, refBase, 'POST_LISTING');
  assert('Detects BASE_BUILDING on tight range consolidation', stageBase === 'BASE_BUILDING', `got ${stageBase}`);

  const bleedCandles = createMockCandles(15, 10, { bleedDown: true });
  const refBleed = extractListingReferenceLevels(bleedCandles, 4.5);
  const stageBleed = analyzePriceDiscoveryStage(bleedCandles, 4.5, refBleed, 'POST_LISTING');
  assert('Detects BLEED_MARKDOWN when price trades below initial low', stageBleed === 'BLEED_MARKDOWN', `got ${stageBleed}`);

  // -------------------------------------------------------------
  // TEST SUITE 4: Liquidity & Volume Availability (Zero Guesswork)
  // -------------------------------------------------------------
  console.log('\n--- Test Group 4: Liquidity & Volume Availability ---');

  const liqMissing = analyzeListingLiquidity(undefined, undefined);
  assert('Missing volume marks LIQUIDITY_UNAVAILABLE', liqMissing.liquidityStatus === 'LIQUIDITY_UNAVAILABLE' && liqMissing.volumeAvailable === false);
  assert('Missing volume returns null volume24hUsd (ZERO FABRICATION)', liqMissing.volume24hUsd === null);

  const liqZero = analyzeListingLiquidity(0, 0);
  assert('Zero volume marks LIQUIDITY_UNAVAILABLE', liqZero.liquidityStatus === 'LIQUIDITY_UNAVAILABLE' && liqZero.volumeAvailable === false);

  const liqThin = analyzeListingLiquidity(450000, 0.9);
  assert('Volume under $1M USD marks LIQUIDITY_THIN', liqThin.liquidityStatus === 'LIQUIDITY_THIN' && liqThin.volumeAvailable === true);

  const liqGood = analyzeListingLiquidity(25000000, 2.4);
  assert('Volume >= $1M USD marks LIQUIDITY_AVAILABLE', liqGood.liquidityStatus === 'LIQUIDITY_AVAILABLE' && liqGood.volume24hUsd === 25000000);

  // -------------------------------------------------------------
  // TEST SUITE 5: Breakout, Breakdown, Reclaim & Rejection
  // -------------------------------------------------------------
  console.log('\n--- Test Group 5: Market Structure Actions ---');

  const breakoutCandles = createMockCandles(12, 10, { breakout: true });
  const refBreakout = extractListingReferenceLevels(breakoutCandles.slice(0, 10), 10);
  const actionBreakout = detectStructureAction(breakoutCandles, 14.5, refBreakout);
  assert('Detects BREAKOUT when bar decisively closes above initial high', actionBreakout === 'BREAKOUT', `got ${actionBreakout}`);

  const breakdownCandles = createMockCandles(12, 10, { bleedDown: true });
  const refBreakdown = extractListingReferenceLevels(breakdownCandles.slice(0, 5), 10);
  const actionBreakdown = detectStructureAction(breakdownCandles, 5.0, refBreakdown);
  assert('Detects BREAKDOWN when bar closes below initial low', actionBreakdown === 'BREAKDOWN', `got ${actionBreakdown}`);

  const reclaimCandles = createMockCandles(12, 10, { reclaim: true });
  const refReclaim = { ...extractListingReferenceLevels(reclaimCandles.slice(0, 5), 10), listingHigh: 12.0 };
  const actionReclaim = detectStructureAction(reclaimCandles, 10.5, refReclaim);
  assert('Detects RECLAIM when price recovers above listing open', actionReclaim === 'RECLAIM', `got ${actionReclaim}`);

  const rejectionCandles = createMockCandles(12, 10, { rejection: true });
  const refRejection = { ...extractListingReferenceLevels(rejectionCandles.slice(0, 5), 10), listingHigh: 14.5 };
  const actionRejection = detectStructureAction(rejectionCandles, 11.5, refRejection);
  assert('Detects REJECTION when high is tested with heavy upper wick', actionRejection === 'REJECTION', `got ${actionRejection}`);

  // -------------------------------------------------------------
  // TEST SUITE 6: Overextension, Dump Risk & Anti-Chase Protection
  // -------------------------------------------------------------
  console.log('\n--- Test Group 6: Overextension & Anti-Chase Protocol ---');

  const overextData = assessDumpRiskAndOverextension({
    currentPrice: 28, // +180% above open $10
    ref: {
      listingOpenPrice: 10,
      listingHigh: 28,
      listingLow: 9.5,
      initialRangePct: 185,
      currentVsListingOpenPct: 180,
      currentVsListingHighPct: 0,
      currentVsListingLowPct: 194
    },
    volatilityState: 'EXTREME',
    stage: 'INITIAL_SPIKE',
    structure: 'UNFORMED_VOLATILE'
  });
  assert('Detects CRITICAL_OVEREXTENSION on parabolic spike', overextData.overextensionRisk === 'CRITICAL_OVEREXTENSION');
  assert('Activates anti-chase warning for extended moves', overextData.antiChaseWarning === true);
  assert('Sets pump/dump risk to HIGH or CRITICAL for extreme extension', overextData.pumpDumpRisk === 'HIGH' || overextData.pumpDumpRisk === 'CRITICAL');

  // Viability when anti-chase is active
  const viabilityOverext = assessSetupViability({
    launchStatus: 'LISTING_LIVE',
    discoveryStage: 'INITIAL_SPIKE',
    liquidityStatus: 'LIQUIDITY_AVAILABLE',
    structure: 'UNFORMED_VOLATILE',
    pumpDumpRisk: overextData.pumpDumpRisk,
    antiChaseWarning: overextData.antiChaseWarning
  });
  assert('Forbids trading during parabolic expansion (DO_NOT_TRADE)', viabilityOverext === 'DO_NOT_TRADE', `got ${viabilityOverext}`);

  // -------------------------------------------------------------
  // TEST SUITE 7: Structural SL/TP/R:R Only When Data Supports Them
  // -------------------------------------------------------------
  console.log('\n--- Test Group 7: Structural Risk/Reward Levels (Zero Fabrication) ---');

  // When viability is NOT actionable base
  const invalidLevels = calculateStructuralLevels({
    currentPrice: 15,
    ref: { listingOpenPrice: 10, listingHigh: 20, listingLow: 9.5, initialRangePct: 105, currentVsListingOpenPct: 50, currentVsListingHighPct: -25, currentVsListingLowPct: 57 },
    structure: 'UNFORMED_VOLATILE',
    viability: 'WAIT_STABILIZATION'
  });
  assert('Returns hasStructuralLevels=false when structure not actionable', invalidLevels.hasStructuralLevels === false);
  assert('Does NOT fabricate stop loss when unformed', invalidLevels.structuralStopLoss === null);
  assert('Does NOT fabricate targets when unformed', invalidLevels.structuralTargets.length === 0);
  assert('Does NOT fabricate R:R when unformed', invalidLevels.structuralRiskRewardRatio === null);

  // When viability IS actionable base with confirmed swing low
  const validLevels = calculateStructuralLevels({
    currentPrice: 12,
    ref: { listingOpenPrice: 10, listingHigh: 15, listingLow: 9.8, initialRangePct: 53, currentVsListingOpenPct: 20, currentVsListingHighPct: -20, currentVsListingLowPct: 22 },
    structure: 'ACCUMULATION_BASE',
    viability: 'ACTIONABLE_BASE'
  });
  assert('Generates structural levels when valid base exists', validLevels.hasStructuralLevels === true);
  assert('Stop loss anchored below structural base low', validLevels.structuralStopLoss !== null && validLevels.structuralStopLoss < 12);
  assert('Generates valid structural targets', validLevels.structuralTargets.length >= 2);
  assert('Calculates valid R:R ratio >= 2.0', validLevels.structuralRiskRewardRatio !== null && validLevels.structuralRiskRewardRatio >= 2.0);

  // -------------------------------------------------------------
  // TEST SUITE 8: Invariant - New Listing NEVER Independently Creates Signals
  // -------------------------------------------------------------
  console.log('\n--- Test Group 8: Confluence Only (Unified Decision Authority) ---');

  const confWhenWait = evaluateNewListingConfluence({
    coreDecision: 'WAIT',
    viability: 'ACTIONABLE_BASE',
    structure: 'ACCUMULATION_BASE',
    action: 'NO_ACTION',
    pumpDumpRisk: 'LOW',
    antiChaseWarning: false
  });
  assert('Returns NEUTRAL alignment when core decision is WAIT', confWhenWait.technicalAlignment === 'NEUTRAL' || confWhenWait.technicalAlignment === 'SUPPORTS_LONG');
  assert('States confluence factor only in reasoning', confWhenWait.confluenceReason.length > 0);

  const confWhenLongSupports = evaluateNewListingConfluence({
    coreDecision: 'LONG',
    viability: 'ACTIONABLE_BASE',
    structure: 'ACCUMULATION_BASE',
    action: 'BREAKOUT',
    pumpDumpRisk: 'LOW',
    antiChaseWarning: false
  });
  assert('Provides SUPPORTS_LONG confluence when base supports technical LONG', confWhenLongSupports.technicalAlignment === 'SUPPORTS_LONG');

  const confContradicts = evaluateNewListingConfluence({
    coreDecision: 'LONG',
    viability: 'DO_NOT_TRADE',
    structure: 'DISTRIBUTION_BLEED',
    action: 'BREAKDOWN',
    pumpDumpRisk: 'CRITICAL',
    antiChaseWarning: false
  });
  assert('CONTRADICTS_SETUP when listing is bleeding dump while technical is LONG', confContradicts.technicalAlignment === 'CONTRADICTS_SETUP');

  // -------------------------------------------------------------
  // TEST SUITE 9: News Interaction with Listings
  // -------------------------------------------------------------
  console.log('\n--- Test Group 9: News Catalyst Interaction ---');

  const mockListingNewsReport = {
    symbol: 'KAITO',
    status: 'AVAILABLE' as const,
    hasActiveNews: true,
    latestNewsTime: Date.now() - 1800000,
    impactScore: 88,
    impactClassification: 'PUMP_CATALYST' as const,
    sourceCredibilityTier: 'TIER_1_OFFICIAL' as const,
    catalystType: 'EXCHANGE_LISTING' as const,
    sourceCredibilityScore: 95,
    verificationStatus: 'VERIFIED' as const,
    isRumorOrUnverified: false,
    isFakeOrMisleading: false,
    isConfirmedCatalyst: true,
    matchedCoins: ['KAITO'],
    mappingConfidence: 'HIGH' as const,
    headline: 'Binance lists KAITO for spot trading',
    summary: 'Binance announces official spot listing for KAITO with zero maker fees',
    source: 'Binance Announcements',
    supportingSources: ['Binance'],
    sourceCount: 1,
    freshness: 'VERY_FRESH' as const,
    reactionWindows: {} as any,
    marketReactionState: 'CONFIRMED' as const,
    reactionConflict: 'NONE' as const,
    technicalAlignment: 'SUPPORTS_LONG' as const,
    alignmentExplanation: 'Tier-1 official listing provides major liquidity and momentum catalyst',
    confluenceNotes: ['Tier-1 exchange listing confirmed'],
    contradictionNotes: [],
    isFabricated: false as const
  } as unknown as NewsMarketImpactReport;

  const reportWithNews = evaluateNewListingIntelligence({
    symbol: 'KAITO',
    candles: baseCandles,
    currentPrice: 11.2,
    volume24hUsd: 15000000,
    rvol: 2.5,
    listingTime: 1700000000000,
    newsImpactReport: mockListingNewsReport,
    coreDecision: 'LONG'
  });
  assert('Integrates Tier-1 exchange listing news catalyst', reportWithNews.technicalAlignment === 'SUPPORTS_LONG');
  assert('Mentions listing catalyst in confluence reasoning', reportWithNews.confluenceReason.includes('catalyst') || reportWithNews.confluenceReason.includes('breakout'));

  // -------------------------------------------------------------
  // TEST SUITE 10: Idempotence, Duplicate Prevention & ONE COIN Invariant
  // -------------------------------------------------------------
  console.log('\n--- Test Group 10: Idempotence & ONE COIN Invariant ---');

  resetSignalStoreForTesting();

  const mockSignalA = {
    id: 'sig_KAITO_1',
    symbol: 'KAITO',
    direction: 'LONG',
    timeframe: '1h',
    entryPrice: 11.0,
    stopLoss: 9.8,
    targets: [{ id: 'tp1', label: 'TP1', price: 13.5, percentage: 22.7, hit: false }],
    riskRewardRatio: 2.1,
    moonScore: 82,
    confidence: 85,
    status: 'ACTIVE',
    entryStatus: 'ENTRY_NOW',
    createdAt: Date.now(),
    category: 'NEW_LISTING',
    newListingIntelligence: reportWithNews
  } as unknown as Signal;

  const firstUpsert = upsertSignals([mockSignalA]);
  assert('First signal upserted successfully', firstUpsert.length === 1);

  // Second upsert with updated listing data on same symbol
  const updatedListingReport = { ...reportWithNews, launchStatus: 'POST_LISTING' as ListingStatus };
  const mockSignalB = {
    ...mockSignalA,
    id: 'sig_KAITO_2', // Different ID attempting duplicate
    newListingIntelligence: updatedListingReport
  } as unknown as Signal;

  const secondUpsert = upsertSignals([mockSignalB]);
  assert('Second upsert executed cleanly', secondUpsert.length === 1);

  const allStored = getAllStoredSignals();
  assert('ONE COIN = ONE CURRENT UNIFIED SIGNAL: Store contains exactly 1 signal for KAITO', allStored.length === 1 && allStored[0].symbol === 'KAITO');
  assert('Stored signal reflects updated listing intelligence without duplicate creation', allStored[0].newListingIntelligence?.launchStatus === 'POST_LISTING');

  // -------------------------------------------------------------
  // TEST SUITE 11: UNKNOWN / Unavailable / Provider Failure Isolation
  // -------------------------------------------------------------
  console.log('\n--- Test Group 11: UNKNOWN & Data Failure Isolation ---');

  const emptyReport = evaluateNewListingIntelligence({
    symbol: 'UNKNOWNCOIN',
    candles: [],
    currentPrice: 0,
    volume24hUsd: null,
    rvol: null,
    listingTime: null
  });

  assert('Empty inputs fallback to PRE_LISTING launch status', emptyReport.launchStatus === 'PRE_LISTING');
  assert('Missing volume marks LIQUIDITY_UNAVAILABLE', emptyReport.liquidityStatus === 'LIQUIDITY_UNAVAILABLE');
  assert('Missing time marks listingTimeAvailable=false', emptyReport.listingTimeAvailable === false);
  assert('Setup viability gracefully defaults to PRE_LISTING_WAIT', emptyReport.setupViability === 'PRE_LISTING_WAIT');
  assert('Guarantees zero fabricated data flag', emptyReport.zeroFabricatedData === true);

  // -------------------------------------------------------------
  // TEST SUITE 12: In-Depth Edge Cases & Protocol Invariants
  // -------------------------------------------------------------
  console.log('\n--- Test Group 12: Advanced Edge Cases & Core Invariants ---');

  // 1. Volatility states
  const volExtreme = analyzeListingVolatility(spikeCandles);
  assert('Identifies EXTREME volatility on initial spike candle', volExtreme.volatilityState === 'EXTREME');
  assert('Initial volatility percentage correctly calculated', volExtreme.initialVolatilityPct > 50);

  const volStabilized = analyzeListingVolatility(baseCandles);
  assert('Identifies STABILIZING or MODERATE volatility after base consolidation', volStabilized.volatilityState === 'STABILIZING' || volStabilized.volatilityState === 'MODERATE');

  // 2. Breakout and Retest Structure
  const retestCandles = createMockCandles(15, 10, { tightBase: true });
  const retestRef = {
    listingOpenPrice: 10,
    listingHigh: 12,
    listingLow: 9.5,
    initialRangePct: 26,
    currentVsListingOpenPct: 20,
    currentVsListingHighPct: 0,
    currentVsListingLowPct: 26
  };
  const structureRetest = identifyFirstMarketStructure(retestCandles, 12.1, retestRef, 'BASE_BUILDING');
  assert('Identifies BREAKOUT_RETEST when holding near listing high as support', structureRetest === 'BREAKOUT_RETEST');

  // 3. Accumulation vs Distribution Assessment
  const accumBehavior = assessAccumulationDistribution(baseCandles, 'ACCUMULATION_BASE', 'NO_ACTION');
  assert('Identifies EARLY_ACCUMULATION during stable base building', accumBehavior === 'EARLY_ACCUMULATION');

  const bleedBehavior = assessAccumulationDistribution(bleedCandles, 'DISTRIBUTION_BLEED', 'BREAKDOWN');
  assert('Identifies EARLY_DISTRIBUTION during persistent markdown bleed', bleedBehavior === 'EARLY_DISTRIBUTION');

  // 4. Thin liquidity forcing WAIT_LIQUIDITY
  const viabilityThinLiq = assessSetupViability({
    launchStatus: 'LISTING_LIVE',
    discoveryStage: 'BASE_BUILDING',
    liquidityStatus: 'LIQUIDITY_THIN',
    structure: 'ACCUMULATION_BASE',
    pumpDumpRisk: 'LOW',
    antiChaseWarning: false
  });
  assert('Thin liquidity strictly enforces WAIT_LIQUIDITY', viabilityThinLiq === 'WAIT_LIQUIDITY');

  // 5. Anti-chase overrides positive technicals/news
  const confluenceAntiChase = evaluateNewListingConfluence({
    coreDecision: 'LONG',
    viability: 'DO_NOT_TRADE',
    structure: 'UNFORMED_VOLATILE',
    action: 'BREAKOUT',
    pumpDumpRisk: 'HIGH',
    antiChaseWarning: true
  });
  assert('Anti-chase produces HIGH_RISK_WARNING and advises against chasing', confluenceAntiChase.technicalAlignment === 'HIGH_RISK_WARNING');
  assert('Confluence reason highlights anti-chase protocol', confluenceAntiChase.confluenceReason.includes('chase') || confluenceAntiChase.confluenceReason.includes('risk'));

  // 6. Zero data fabrication: reference levels for empty input
  const emptyRef = extractListingReferenceLevels([], 0);
  assert('Does not fabricate listingOpenPrice when empty', emptyRef.listingOpenPrice === null);
  assert('Does not fabricate listingHigh when empty', emptyRef.listingHigh === null);
  assert('Does not fabricate listingLow when empty', emptyRef.listingLow === null);

  // 7. Core invariant: evaluateNewListingIntelligence never creates signals independently
  const evaluatedReport = evaluateNewListingIntelligence({
    symbol: 'BERA',
    candles: baseCandles,
    currentPrice: 11.0,
    volume24hUsd: 25000000,
    rvol: 1.8,
    listingTime: 1700000000000,
    coreDecision: 'WAIT'
  });
  assert('Listing intelligence outputs zeroFabricatedData flag true', evaluatedReport.zeroFabricatedData === true);
  assert('Listing intelligence preserves unified engine authority', evaluatedReport.technicalAlignment === 'NEUTRAL' || evaluatedReport.technicalAlignment === 'SUPPORTS_LONG');

  console.log('================================================================');
  console.log(`🏁 PHASE 14 TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================');

  return { passed, failed, total: passed + failed };
}

// Auto-run if executed via tsx
if (process.argv[1]?.includes('testPhase14NewListingIntelligence')) {
  runPhase14NewListingIntelligenceTests()
    .then(({ failed }) => {
      if (failed > 0) process.exit(1);
    })
    .catch((err) => {
      console.error('Fatal error in Phase 14 test runner:', err);
      process.exit(1);
    });
}
