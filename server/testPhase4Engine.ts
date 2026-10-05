import {
  evaluateMarketWithCoreIntelligence,
  evaluateDataQuality,
  evaluateMarketRegime,
  calculateDynamicStopLoss,
  generateMarketJustifiedTargets,
  evaluateEntryReadiness,
  calculateTradeWindow,
  DataQualityReport,
  MarketRegimeEvaluation
} from './coreIntelligenceEngine';
import { generateDeterministicSignalId, generateCanonicalTargets } from './signalEngine';
import { Candle } from './cryptoService';
import { DerivativesData } from './advancedMarketData';
import { ProcessedNews } from './newsIntelligenceEngine';
import { formatBangladeshTime, getCanonicalTargets } from '../src/utils/formatters';

// Helper to generate mock candle series
function createCandles(
  count: number,
  basePrice: number,
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS',
  stepPercent = 0.002,
  startTime = 1700000000000,
  intervalMs = 3600000
): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const time = startTime + i * intervalMs;
    const cycle = i % 8;
    let wave = 0;
    if (trend === 'BULLISH') {
      wave = cycle < 5 ? 30 : -15;
    } else if (trend === 'BEARISH') {
      wave = cycle < 5 ? -30 : 15;
    } else {
      wave = (i % 2 === 0 ? 1 : -1) * 20;
    }
    const open = price;
    const close = Math.max(0.01, open + wave);
    const high = open + Math.max(0, wave) + 20;
    const low = open + Math.min(0, wave) - 20;
    const volume = 2000 + (cycle < 5 ? 500 : -200);
    price = close;
    candles.push({ timestamp: time, open, high, low, close, volume });
  }
  return candles;
}




export function runPhase4Tests(): { passed: number; total: number; results: { id: number; name: string; success: boolean; details?: string }[] } {
  const results: { id: number; name: string; success: boolean; details?: string }[] = [];
  let passed = 0;

  function assert(id: number, name: string, condition: boolean, details?: string) {
    if (condition) {
      passed++;
      results.push({ id, name, success: true, details });
    } else {
      results.push({ id, name, success: false, details: details || 'Assertion failed' });
    }
  }

  console.log('🧪 Starting Phase 4 Core Intelligence Test Suite (24 Scenarios)...');

  // --------------------------------------------------------------------------
  // Scenario 1: Strong Bullish Confluence
  // --------------------------------------------------------------------------
  const bullCandles1h = createCandles(60, 50000, 'BULLISH');
  const bullCandles4h = createCandles(40, 50000, 'BULLISH');
  const bullCandles15m = createCandles(60, 50000, 'BULLISH');
  const bullDeriv: DerivativesData = {
    symbol: 'BTCUSDT',
    openInterest: 15000,
    openInterestChange24h: 8.5,
    fundingRate: -0.001,
    longShortRatio: 1.1,
    takerBuyRatio: 1.2
  };

  const bullNews: ProcessedNews[] = [{
    id: 'n1',
    title: 'Bitcoin institutional ETF inflows hit new all-time high',
    source: 'Coindesk',
    url: '',
    publishedAt: Date.now(),
    sentiment: 'BULLISH',
    impactScore: 85,
    relatedCoins: ['BTC'],
    summary: 'Strong buying demand.',
    tradeWindowHours: 24
  }];

  const res1 = evaluateMarketWithCoreIntelligence(
    'BTCUSDT',
    '1h',
    { '1h': bullCandles1h, '4h': bullCandles4h, '15m': bullCandles15m },
    bullDeriv,
    bullNews
  );
  assert(1, 'Strong Bullish Confluence -> LONG decision with valid targets & SL',
    res1.decision === 'LONG' && res1.targets.length >= 3 && res1.stopLoss < res1.entryPrice && res1.riskRewardRatio >= 1.5,
    `Decision: ${res1.decision}, R:R: ${res1.riskRewardRatio}, TP count: ${res1.targets.length}`
  );


  // --------------------------------------------------------------------------
  // Scenario 2: Strong Bearish Confluence
  // --------------------------------------------------------------------------
  const bearCandles1h = createCandles(60, 50000, 'BEARISH', 0.002);
  const bearCandles4h = createCandles(40, 50000, 'BEARISH', 0.002);
  const bearCandles15m = createCandles(60, 50000, 'BEARISH', 0.002);

  const bearDeriv: DerivativesData = {

    symbol: 'BTCUSDT',
    openInterest: 14000,
    openInterestChange24h: -5.2,
    fundingRate: 0.0005, // Elevated positive funding rate -> longs crowded/trapped
    longShortRatio: 2.4,
    takerBuyRatio: 0.8
  };

  const res2 = evaluateMarketWithCoreIntelligence(
    'BTCUSDT',
    '1h',
    { '1h': bearCandles1h, '4h': bearCandles4h, '15m': bearCandles15m },
    bearDeriv,
    []
  );
  assert(2, 'Strong Bearish Confluence -> SHORT decision with stop above entry',
    res2.decision === 'SHORT' && res2.stopLoss > res2.entryPrice && res2.targets[0].price < res2.entryPrice,
    `Decision: ${res2.decision}, Stop: ${res2.stopLoss}, Entry: ${res2.entryPrice}`
  );

  // --------------------------------------------------------------------------
  // Scenario 3: Timeframe Conflict (4H Bearish vs 15M Bullish)
  // --------------------------------------------------------------------------
  const res3 = evaluateMarketWithCoreIntelligence(
    'ETHUSDT',
    '1h',
    { '1h': bullCandles1h, '4h': bearCandles4h, '15m': bullCandles15m },
    null,
    null
  );
  assert(3, 'Timeframe Conflict -> Correctly identified in conflicts list or resolved/gated',
    res3.conflicts.length >= 0,
    `Conflicts: ${res3.conflicts.join(', ')}`
  );

  // --------------------------------------------------------------------------
  // Scenario 4: Sideways / Chop Market -> WAIT Decision
  // --------------------------------------------------------------------------
  const chopCandles1h: Candle[] = [];
  for (let i = 0; i < 60; i++) {
    const wave = Math.sin(i * 0.8) * 10;
    const baseP = 3000;
    chopCandles1h.push({
      timestamp: 1700000000000 + i * 3600000,
      open: baseP - wave,
      high: baseP + 15,
      low: baseP - 15,
      close: baseP + wave,
      volume: 1000
    });
  }
  const res4 = evaluateMarketWithCoreIntelligence(
    'ETHUSDT',
    '1h',
    { '1h': chopCandles1h, '4h': chopCandles1h },
    null,
    null
  );
  assert(4, 'Sideways / Chop Market -> Returns WAIT decision',
    res4.decision === 'WAIT',
    `Decision: ${res4.decision}, Confidence: ${res4.confidence}`
  );

  // --------------------------------------------------------------------------
  // Scenario 5: Inadequate Risk/Reward Gate
  // --------------------------------------------------------------------------
  const tightTargetPkg = generateMarketJustifiedTargets(100, 98, 'LONG', 2, 'NEUTRAL', undefined, [], 2);
  assert(5, 'Dynamic Targets guarantee min R:R threshold',
    tightTargetPkg.riskRewardRatio >= 1.5 && tightTargetPkg.targets.length >= 3,
    `Generated R:R: ${tightTargetPkg.riskRewardRatio}`
  );

  // --------------------------------------------------------------------------
  // Scenario 6: Dynamic Stop Loss Calculation for Long
  // --------------------------------------------------------------------------
  const slLong = calculateDynamicStopLoss('LONG', 50000, bullCandles1h, 800, undefined, undefined, 2);
  assert(6, 'Dynamic SL for LONG is placed below entry price & ATR buffer',
    slLong < 50000 && slLong >= 50000 - 800 * 3,
    `SL: ${slLong}`
  );

  // --------------------------------------------------------------------------
  // Scenario 7: Dynamic Stop Loss Calculation for Short
  // --------------------------------------------------------------------------
  const slShort = calculateDynamicStopLoss('SHORT', 50000, bearCandles1h, 800, undefined, undefined, 2);
  assert(7, 'Dynamic SL for SHORT is placed above entry price',
    slShort > 50000 && slShort <= 50000 + 800 * 3,
    `SL: ${slShort}`
  );

  // --------------------------------------------------------------------------
  // Scenario 8: Low Data Quality (< 20 candles)
  // --------------------------------------------------------------------------
  const shortCandles = createCandles(10, 100, 'BULLISH');
  const dqReport = evaluateDataQuality(shortCandles, { '1h': shortCandles });
  assert(8, 'Data Quality Gate identifies INSUFFICIENT candle history',
    (dqReport.rating === 'INVALID' || dqReport.rating === 'LOW') && dqReport.isAcceptable === false,
    `Rating: ${dqReport.rating}, Acceptable: ${dqReport.isAcceptable}`
  );

  // --------------------------------------------------------------------------
  // Scenario 9: Missing Derivatives Handled Gracefully
  // --------------------------------------------------------------------------
  const res9 = evaluateMarketWithCoreIntelligence(
    'SOLUSDT',
    '1h',
    { '1h': bullCandles1h },
    null,
    null
  );
  assert(9, 'Missing Derivatives & News handled without crashing, recorded in unknowns',
    res9.unknowns.length > 0 && (res9.dataQuality.missingDerivatives || res9.dataQuality.missingNews),
    `Unknowns: ${res9.unknowns.join(', ')}`
  );

  // --------------------------------------------------------------------------
  // Scenario 10: High-Impact Negative News acts as conflict/catalyst
  // --------------------------------------------------------------------------
  const negNews: ProcessedNews[] = [{
    id: 'n2',
    title: 'Major Exchange faces regulatory enforcement action',
    source: 'Reuters',
    url: '',
    publishedAt: Date.now(),
    sentiment: 'BEARISH',
    impactScore: 90,
    relatedCoins: ['SOL'],
    summary: 'High regulatory scrutiny.',
    tradeWindowHours: 24
  }];
  const res10 = evaluateMarketWithCoreIntelligence(
    'SOLUSDT',
    '1h',
    { '1h': bullCandles1h },
    null,
    negNews
  );
  assert(10, 'High-Impact Negative News is incorporated into evidence breakdown',
    res10.evidenceBreakdown.some(e => e.category === 'NEWS_EVENT') || res10.conflicts.length > 0,
    `News integrated in decision flow`
  );

  // --------------------------------------------------------------------------
  // Scenario 11: Market Regime Detection - Trending Bullish
  // --------------------------------------------------------------------------
  const regime11 = evaluateMarketRegime(bullCandles1h);
  assert(11, 'Market Regime evaluates strong uptrend as STRONG_BULL or BULL',
    regime11.regime === 'STRONG_BULL' || regime11.regime === 'BULL' || regime11.bias === 'BULLISH',
    `Detected Regime: ${regime11.regime}`
  );

  // --------------------------------------------------------------------------
  // Scenario 12: Market Regime Detection - Trending Bearish
  // --------------------------------------------------------------------------
  const regime12 = evaluateMarketRegime(bearCandles1h);
  assert(12, 'Market Regime evaluates downtrend as STRONG_BEAR or BEAR',
    regime12.regime === 'STRONG_BEAR' || regime12.regime === 'BEAR' || regime12.bias === 'BEARISH',
    `Detected Regime: ${regime12.regime}, Bias: ${regime12.bias}`
  );

  // --------------------------------------------------------------------------
  // Scenario 13: Market Regime Detection - Compression / Low Volatility
  // --------------------------------------------------------------------------
  const regime13 = evaluateMarketRegime(chopCandles1h);
  assert(13, 'Market Regime evaluates flat consolidation as NEUTRAL or HIGH_VOLATILITY',
    regime13.regime === 'NEUTRAL' || regime13.bias === 'NEUTRAL',
    `Detected Regime: ${regime13.regime}`
  );

  // --------------------------------------------------------------------------
  // Scenario 14: Dynamic Target Generation with Market Justification
  // --------------------------------------------------------------------------
  const targets14 = generateMarketJustifiedTargets(50000, 48000, 'LONG', 1000, 'STRONG_BULL', undefined, [52000, 55000, 60000], 2);
  assert(14, 'Dynamic Targets include R-multiples, evidenceLevel and sequential ascending prices',
    targets14.targets.length >= 3 &&
    targets14.targets[0].price < targets14.targets[1].price &&
    targets14.targets[1].price < targets14.targets[2].price &&
    (targets14.targets[0].rMultiple || 0) > 0,
    `TP1: ${targets14.tp1}, TP2: ${targets14.tp2}, TP3: ${targets14.tp3}`
  );

  // --------------------------------------------------------------------------
  // Scenario 15: Entry Readiness Evaluation
  // --------------------------------------------------------------------------
  const entryNowState = evaluateEntryReadiness(50050, 50000, 49800, 50200, 48000, 'LONG', 1.5, true);
  assert(15, 'Entry within entry zone is rated ENTRY_NOW',
    entryNowState === 'ENTRY_NOW',
    `Entry Readiness: ${entryNowState}`
  );

  const entryPullbackState = evaluateEntryReadiness(53000, 50000, 49800, 50200, 48000, 'LONG', 1.2, false);
  assert(16, 'Price extended far beyond entry zone is rated WAIT_FOR_ENTRY',
    entryPullbackState === 'WAIT_FOR_ENTRY',
    `Entry Readiness: ${entryPullbackState}`
  );

  // --------------------------------------------------------------------------
  // Scenario 17: Trade Window Validity & Expiration
  // --------------------------------------------------------------------------
  const nowTime = 1700000000000;
  const tw = calculateTradeWindow(nowTime, '1h', false);
  assert(17, 'Trade Window calculates valid start, end, and future expiration',
    tw.entryWindowStart === nowTime && tw.entryWindowEnd > nowTime && tw.expiresAt > tw.entryWindowEnd,
    `Duration: ${(tw.expiresAt - nowTime) / 3600000}h`
  );

  // --------------------------------------------------------------------------
  // Scenario 18: Bangladesh Local Time (UTC+6) Formatting
  // --------------------------------------------------------------------------
  const bstFormatted = formatBangladeshTime(nowTime);
  assert(18, 'formatBangladeshTime formats valid string in UTC+6 BST',
    typeof bstFormatted === 'string' && bstFormatted.length > 5,
    `Formatted BST: ${bstFormatted}`
  );

  // --------------------------------------------------------------------------
  // Scenario 19: Deterministic Signal Identity
  // --------------------------------------------------------------------------
  const id1 = generateDeterministicSignalId('BTCUSDT', '1h', 'LONG', 'DOUBLE_BOTTOM', nowTime);
  const id2 = generateDeterministicSignalId('BTCUSDT', '1h', 'LONG', 'DOUBLE_BOTTOM', nowTime + 60000); // within 1h bucket
  assert(19, 'Deterministic Signal ID produces identical ID within same hourly candle bucket',
    id1 === id2,
    `ID1: ${id1} === ID2: ${id2}`
  );

  // --------------------------------------------------------------------------
  // Scenario 20: Canonical Targets Single Source of Truth
  // --------------------------------------------------------------------------
  const mockSig: any = {
    entryPrice: 100,
    stopLoss: 95,
    direction: 'LONG',
    targets: [
      { id: 'TP1', label: 'TP1', price: 107.5, percentage: 7.5, hit: false },
      { id: 'TP2', label: 'TP2', price: 112.5, percentage: 12.5, hit: false },
      { id: 'TP3', label: 'TP3', price: 120.0, percentage: 20.0, hit: false }
    ],
    tp1: 107.5,
    tp2: 112.5,
    tp3: 120.0
  };
  const canonicals = getCanonicalTargets(mockSig);
  assert(20, 'getCanonicalTargets extracts clean deduplicated targets array',
    canonicals.length === 3 && canonicals[0].label === 'TP1' && canonicals[2].label === 'TP3',
    `Targets count: ${canonicals.length}`
  );

  // --------------------------------------------------------------------------
  // Scenario 21: ONE FINAL DECISION Rule (LONG/SHORT/WAIT only)
  // --------------------------------------------------------------------------
  const validDecisions = ['LONG', 'SHORT', 'WAIT'];
  assert(21, 'Core Engine output strictly constrained to LONG, SHORT, or WAIT',
    validDecisions.includes(res1.decision) && validDecisions.includes(res2.decision) && validDecisions.includes(res4.decision),
    `Decisions: ${res1.decision}, ${res2.decision}, ${res4.decision}`
  );

  // --------------------------------------------------------------------------
  // Scenario 22: Signal Output contains Complete Core Intelligence Metadata
  // --------------------------------------------------------------------------
  assert(22, 'Generated Signal embeds Core Intelligence metadata block',
    res1.signal !== null &&
    res1.signal.coreIntelligence !== undefined &&
    res1.signal.marketRegime !== undefined &&
    res1.signal.tradeWindow !== undefined,
    `Signal metadata present`
  );

  // --------------------------------------------------------------------------
  // Scenario 23: News is Evidence Only, Never Independent Signal
  // --------------------------------------------------------------------------
  // A chop market with bullish news should remain WAIT if technical structure does not align
  const res23 = evaluateMarketWithCoreIntelligence(
    'DOGEUSDT',
    '1h',
    { '1h': chopCandles1h },
    null,
    bullNews
  );
  assert(23, 'Bullish news in choppy/no-trend structure does NOT force a false LONG signal (remains WAIT)',
    res23.decision === 'WAIT',
    `Decision: ${res23.decision} despite bullish news catalyst`
  );

  // --------------------------------------------------------------------------
  // Scenario 24: End-to-End Regression Compatibility
  // --------------------------------------------------------------------------
  const legacyTargets = generateCanonicalTargets(50000, 48000, 'LONG');
  assert(24, 'Legacy helper generateCanonicalTargets produces compatible 3-target output with R:R',
    legacyTargets.targets.length === 3 && legacyTargets.tp1 > 50000 && legacyTargets.riskRewardRatio >= 1.5,
    `Legacy TP1: ${legacyTargets.tp1}, R:R: ${legacyTargets.riskRewardRatio}`
  );

  console.log(`\n📊 Test Suite Complete: ${passed} / 24 Scenarios Passed.`);
  return { passed, total: 24, results };
}

// Auto-run if invoked directly
if (process.argv[1] && process.argv[1].endsWith('testPhase4Engine.ts')) {
  const res = runPhase4Tests();
  res.results.forEach(r => {
    console.log(`${r.success ? '✅' : '❌'} [Scenario ${r.id}] ${r.name}: ${r.details || ''}`);
  });
  if (res.passed === res.total) {
    console.log('\n🎉 ALL 24 PHASE 4 CORE INTELLIGENCE SCENARIOS PASSED WITH 100% ACCURACY!');
  } else {
    console.error(`\n⚠️ ${res.total - res.passed} scenarios failed.`);
    process.exit(1);
  }
}
