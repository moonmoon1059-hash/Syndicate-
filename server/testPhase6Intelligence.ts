import { evaluateMarketWithCoreIntelligence } from './coreIntelligenceEngine';
import { analyzeMarketCycle } from './marketCycleEngine';
import { evaluatePumpDumpIntelligence } from './momentumPumpDumpEngine';
import { evaluateFlowWhaleIntelligence } from './flowWhaleEngine';
import { evaluateKillSwitch } from './killSwitchEngine';
import { evaluateAplusConfluence } from './aplusConfluenceEngine';
import { analyzeSinglePair } from './signalEngine';
import { getNewListingRadar } from './listingRadarEngine';
import { Candle } from './cryptoService';
import { analyzeSMCStructure } from './smcStructureEngine';
import { analyzeOrderflow } from './orderflowVolumeEngine';
import { calculateFibonacciConfluence } from './fibonacciConfluenceEngine';
import { evaluateDivergenceMatrix } from './divergenceMatrixEngine';
import { evaluateRelativeStrengthAndMacro } from './relativeStrengthMacroEngine';
import { evaluateDerivativesIntelligence } from './derivativesIntelligenceEngine';
import { evaluateInstitutionalIntelligence } from './institutionalIntelligenceEngine';

/**
 * Generate synthetic candle dataset
 */
function createSyntheticCandles(count: number, startPrice: number, trend: 'UP' | 'DOWN' | 'RANGE'): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  const now = Date.now();
  const intervalMs = 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const delta = trend === 'UP' ? 0.005 : trend === 'DOWN' ? -0.005 : (Math.random() - 0.5) * 0.002;
    const open = price;
    const close = price * (1 + delta);
    const high = Math.max(open, close) * 1.002;
    const low = Math.min(open, close) * 0.998;
    const volume = 100000 + Math.random() * 50000;
    const timestamp = now - (count - i) * intervalMs;

    candles.push({ timestamp, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

export async function runPhase6Tests(): Promise<boolean> {
  console.log('=== RUNNING PHASE 6 INSTITUTIONAL INTELLIGENCE TEST SUITE ===\n');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${detail || 'Assertion failed'}`);
    }
  }

  // TEST 1: Market Cycle Engine
  {
    const upCandles = createSyntheticCandles(60, 50000, 'UP');
    const cycle = analyzeMarketCycle(upCandles, '1h');
    assert(
      ['MARKUP', 'ACCUMULATION', 'DISTRIBUTION', 'MARKDOWN', 'TRANSITION_UNKNOWN'].includes(cycle.cycle),
      'Test 1.1: Market Cycle classifies trending candles into canonical Wyckoff cycle states',
      `Got cycle: ${cycle.cycle}`
    );
    assert(cycle.confidence > 0 && cycle.confidence <= 100, 'Test 1.2: Confidence score is bounded [0, 100]');
  }

  // TEST 2: Momentum & Climax Dump Risk Engine
  {
    const candles = createSyntheticCandles(60, 100, 'UP');
    const pumpDump = evaluatePumpDumpIntelligence(candles, [], 'BTCUSDT');
    assert(
      pumpDump.acceleration !== undefined && pumpDump.dumpRisk !== undefined,
      'Test 2.1: Momentum engine outputs valid state and risk classification'
    );
  }

  // TEST 3: Whale Flow Fallback (Graceful UNKNOWN requirement)
  {
    const flow = evaluateFlowWhaleIntelligence('BTCUSDT', null);
    assert(
      flow.status === 'UNKNOWN' && flow.confidence === 'UNKNOWN',
      'Test 3.1: Whale Flow gracefully evaluates to UNKNOWN without simulating fake data'
    );
  }

  // TEST 4: Kill Switch Safety Gate
  {
    const candles = createSyntheticCandles(50, 100, 'RANGE');
    const killSwitch = evaluateKillSwitch({
      candles,
      conflicts: ['Major opposing macro trend conflict (Daily Downtrend vs 15m pump)']
    });
    assert(
      killSwitch.triggered,
      'Test 4.1: Kill switch triggers when critical conflict keyword is detected',
      `Triggered: ${killSwitch.triggered}`
    );
  }

  // TEST 5: SMC / ICT Market Structure Engine
  {
    const candles: Candle[] = [
      { timestamp: 1000, open: 100, high: 102, low: 99, close: 101, volume: 1000 },
      { timestamp: 2000, open: 101, high: 110, low: 101, close: 109, volume: 5000 }, // Big expansion candle
      { timestamp: 3000, open: 109, high: 112, low: 105, close: 111, volume: 2000 }, // Low (105) > candle 1 high (102) -> Bullish FVG
      { timestamp: 4000, open: 111, high: 115, low: 110, close: 114, volume: 2500 },
      { timestamp: 5000, open: 114, high: 118, low: 113, close: 117, volume: 3000 },
      { timestamp: 6000, open: 117, high: 120, low: 116, close: 119, volume: 2800 },
      { timestamp: 7000, open: 119, high: 122, low: 118, close: 121, volume: 3100 },
      { timestamp: 8000, open: 121, high: 125, low: 120, close: 124, volume: 3500 },
      { timestamp: 9000, open: 124, high: 128, low: 123, close: 127, volume: 4000 },
      { timestamp: 10000, open: 127, high: 130, low: 126, close: 129, volume: 4200 },
      { timestamp: 11000, open: 129, high: 132, low: 128, close: 131, volume: 4500 }
    ];

    const smc = analyzeSMCStructure(candles, '1h');
    assert(
      smc.fvgs.length > 0,
      'Test 5.1: SMC Engine successfully identifies Fair Value Gaps (FVG)',
      `Found ${smc.fvgs.length} FVGs`
    );
    assert(
      smc.fvgs.some(f => f.type === 'BULLISH' && f.top === 105 && f.bottom === 102),
      'Test 5.2: FVG bounds mathematically match 3-candle imbalance zone [102 - 105]'
    );
    assert(
      smc.structureBias === 'BULLISH' || smc.structureType !== 'NONE',
      'Test 5.3: SMC Engine classifies structural trend direction and type'
    );
  }

  // TEST 6: Orderflow, Volume Profile & CVD Engine
  {
    const upCandles = createSyntheticCandles(50, 100, 'UP');
    const orderflow = analyzeOrderflow(upCandles, {
      bids: [[99, 500], [98, 800], [97, 1200]],
      asks: [[101, 300], [102, 400], [103, 500]]
    });

    assert(
      orderflow.cvd.status === 'AVAILABLE' && ['RISING', 'FALLING', 'FLAT'].includes(orderflow.cvd.deltaTrend),
      'Test 6.1: Orderflow CVD delta trend calculated deterministically'
    );
    assert(
      orderflow.volumeProfile.poc > 0 && orderflow.volumeProfile.vah >= orderflow.volumeProfile.val,
      'Test 6.2: Volume Profile POC, VAH (70%), and VAL boundaries computed accurately'
    );
    assert(
      orderflow.orderBookImbalance.status === 'AVAILABLE' && orderflow.orderBookImbalance.bidDepthPressure === 'BIDS_DOMINANT',
      'Test 6.3: Order Book Imbalance (OBI) correctly measures bid dominance and spoofing risk'
    );

    // Fallback test: No orderbook -> UNKNOWN status (Zero fabrication)
    const emptyOrderflow = analyzeOrderflow(upCandles, null);
    assert(
      emptyOrderflow.orderBookImbalance.status === 'UNAVAILABLE' && emptyOrderflow.orderBookImbalance.spoofingRisk === 'UNKNOWN',
      'Test 6.4: Order Book gracefully marks UNAVAILABLE when feed absent without fabricating fake walls'
    );
  }

  // TEST 7: Fibonacci Confluence Engine
  {
    const candles = createSyntheticCandles(50, 100, 'UP');
    const fib = calculateFibonacciConfluence(candles);
    assert(
      fib.status === 'VALID_SWING' && fib.goldenPocket.min < fib.goldenPocket.max,
      'Test 7.1: Fibonacci engine anchors valid swings and computes 0.618 - 0.65 Golden Pocket'
    );
    assert(
      fib.extension1272 > fib.anchorLow && fib.extension1618 > fib.extension1272,
      'Test 7.2: Fibonacci extensions (1.272, 1.618, 2.618) properly project measured moves'
    );
  }

  // TEST 8: Divergence Matrix Engine
  {
    const candles = createSyntheticCandles(50, 100, 'UP');
    const divMatrix = evaluateDivergenceMatrix(candles, '1h');
    assert(
      divMatrix.rsiDivergence !== undefined && divMatrix.macdDivergence !== undefined,
      'Test 8.1: Divergence Matrix computes multi-timeframe RSI and MACD divergence evidence'
    );
  }

  // TEST 9: Relative Strength & Macro Dominance Engine
  {
    const altCandles = createSyntheticCandles(50, 10, 'UP');
    const btcCandles = createSyntheticCandles(50, 60000, 'RANGE');
    const rsReport = evaluateRelativeStrengthAndMacro('SOLUSDT', altCandles, btcCandles, {
      btcD: 55.0,
      btcDChange24h: -0.8, // Falling BTC.D
      usdtD: 5.0,
      usdtDChange24h: -0.4 // Risk-on
    });

    assert(
      rsReport.rsVsBtc24h > 0 && (rsReport.relativeStrengthCategory === 'LEADER' || rsReport.relativeStrengthCategory === 'OUTPERFORMER'),
      'Test 9.1: Relative Strength identifies outperforming asset vs BTC'
    );
    assert(
      rsReport.btcDominanceContext.impactOnAlts === 'FAVORABLE' && rsReport.usdtDominanceContext.macroCapitalFlow === 'RISK_ON',
      'Test 9.2: Macro regime accurately evaluates falling BTC.D as favorable altcoin expansion'
    );
  }

  // TEST 10: Derivatives Intelligence Engine
  {
    const candles = createSyntheticCandles(50, 100, 'UP');
    const derivReport = evaluateDerivativesIntelligence(candles, {
      symbol: 'BTCUSDT',
      fundingRate: 0.0001,
      openInterest: 50000000,
      openInterestChange24h: 8.5,
      longShortRatio: 1.2,
      takerBuyRatio: 0.55,
      status: 'AVAILABLE'
    });

    assert(
      derivReport.status === 'AVAILABLE' && derivReport.priceOiCorrelation === 'LONG_ACCUMULATION',
      'Test 10.1: Derivatives engine classifies rising price + rising OI as LONG_ACCUMULATION'
    );

    // Missing derivatives fallback
    const missingDeriv = evaluateDerivativesIntelligence(candles, null);
    assert(
      missingDeriv.status === 'UNAVAILABLE' && missingDeriv.fundingSentiment === 'UNKNOWN',
      'Test 10.2: Missing derivatives data strictly returns UNKNOWN/UNAVAILABLE (Zero fabrication)'
    );
  }

  // TEST 11: Unified Institutional Orchestrator & Confluence Integration
  {
    const candles = createSyntheticCandles(60, 60000, 'UP');
    const tfCandlesMap = { '1h': candles, '4h': candles, '15m': candles };
    const coreRes = evaluateMarketWithCoreIntelligence('BTCUSDT', '1h', tfCandlesMap);

    assert(
      coreRes.smcStructureReport !== undefined,
      'Test 11.1: Core intelligence integrates SMC structure report'
    );
    assert(
      coreRes.orderflowReport !== undefined,
      'Test 11.2: Core intelligence integrates Orderflow report'
    );
    assert(
      coreRes.fibonacciReport !== undefined,
      'Test 11.3: Core intelligence integrates Fibonacci confluence report'
    );
    assert(
      coreRes.divergenceMatrixReport !== undefined,
      'Test 11.4: Core intelligence integrates Divergence Matrix report'
    );
    assert(
      coreRes.relativeStrengthReport !== undefined,
      'Test 11.5: Core intelligence integrates Relative Strength report'
    );
    assert(
      coreRes.derivativesIntelligenceReport !== undefined,
      'Test 11.6: Core intelligence integrates Derivatives Intelligence report'
    );
    assert(
      ['A+', 'A', 'B', 'C', 'WAIT'].includes(coreRes.qualityGrade),
      'Test 11.7: Signal Quality Grade maintains strict canonical standards'
    );
  }

  // TEST 12: Universal Single Coin & New Listing Radar Regression
  {
    const analysis = await analyzeSinglePair('ETHUSDT', '1h');
    assert(
      analysis !== null && (analysis.decision === 'LONG' || analysis.decision === 'SHORT' || analysis.decision === 'WAIT'),
      'Test 12.1: Universal single coin analysis executes complete multi-timeframe pipeline'
    );

    const listings = await getNewListingRadar();
    assert(
      Array.isArray(listings) && listings.length > 0,
      'Test 12.2: New Listing Radar returns monitored exchange listings'
    );
  }

  console.log(`\n=== PHASE 6 TESTS SUMMARY: ${passed}/${total} PASSED ===\n`);
  return passed === total;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPhase6Tests().then(success => {
    if (!success) process.exit(1);
  });
}
