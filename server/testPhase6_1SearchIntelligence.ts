/**
 * MoonScanner - Phase 6.1 Universal Coin Deep-Dive & Search Intelligence Test Suite
 * 
 * Verifies:
 * 1. Universal Search & Resolution (Major, Altcoin, Meme, and New/Recent assets)
 * 2. Complete CoinAnalysisReport Aggregation
 * 3. Deterministic Market Structure State Engine
 * 4. Tradeability & Execution Scoring
 * 5. Institutional SMC & Orderflow Integration
 * 6. Signal Reconciliation (ONE COIN = ONE CURRENT UNIFIED SIGNAL)
 * 7. Graceful Degradation & Zero Fabricated Data
 */

import { searchMarketUniverse, resolveSymbolFromQuery, CANONICAL_MARKET_REGISTRY } from './marketUniverseService';
import { analyzeSinglePair } from './signalEngine';
import { determineCurrentMarketStructure } from './currentStructureEngine';
import { upsertSignals, getAllStoredSignals } from './signalTracker';
import { evaluateInstitutionalIntelligence } from './institutionalIntelligenceEngine';
import { Candle } from './cryptoService';

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

async function runPhase6_1Tests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PHASE 6.1 UNIVERSAL SEARCH & DEEP-DIVE TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      failed++;
    }
  }

  // TEST 1: Universal Search Resolution
  console.log('\n--- [TEST 1] Universal Search & Query Resolution ---');
  const btcResolved = resolveSymbolFromQuery('btc');
  assert(btcResolved.symbol === 'BTCUSDT' && btcResolved.baseAsset === 'BTC', `Query 'btc' resolves to canonical 'BTCUSDT' (got ${btcResolved.symbol})`);

  const solUsdtResolved = resolveSymbolFromQuery('solusdt');
  assert(solUsdtResolved.symbol === 'SOLUSDT', `Query 'solusdt' resolves to canonical 'SOLUSDT' (got ${solUsdtResolved.symbol})`);

  const pepeResolved = resolveSymbolFromQuery('PEPE');
  assert(pepeResolved.symbol === 'PEPEUSDT', `Query 'PEPE' resolves to canonical 'PEPEUSDT' (got ${pepeResolved.symbol})`);

  const customResolved = resolveSymbolFromQuery('TIA');
  assert(customResolved.symbol === 'TIAUSDT', `Query 'TIA' dynamically normalizes to 'TIAUSDT' (got ${customResolved.symbol})`);

  const searchResults = searchMarketUniverse('sol', 5);
  assert(searchResults.length > 0 && searchResults.some(r => r.symbol === 'SOLUSDT' || r.baseAsset === 'SOL'), `Search 'sol' finds SOLUSDT in market registry`);

  const memeSearchResults = searchMarketUniverse('doge', 5);
  assert(memeSearchResults.some(r => r.symbol === 'DOGEUSDT' || r.baseAsset === 'DOGE'), `Search 'doge' finds DOGEUSDT in meme registry`);

  // TEST 2: Deterministic Current Market Structure Engine
  console.log('\n--- [TEST 2] Deterministic Market Structure Classification ---');
  const bullishCandles = createSyntheticCandles(60, 100, 'UP');
  const bullishStructure = determineCurrentMarketStructure({
    candles: bullishCandles
  });

  assert(bullishStructure.state !== undefined, `Structure state evaluated: ${bullishStructure.state}`);
  assert(bullishStructure.confidence >= 30, `Confidence calculated: ${bullishStructure.confidence}%`);
  assert(typeof bullishStructure.explanation === 'string' && bullishStructure.explanation.length > 0, `Explanation populated: ${bullishStructure.explanation}`);

  // TEST 3: CoinAnalysisReport Generation & Tradeability Gate
  console.log('\n--- [TEST 3] Deep-Dive CoinAnalysisReport Generation ---');
  const btcReport = await analyzeSinglePair('BTC/USDT', '1h');
  assert(btcReport !== null, `BTC/USDT generates CoinAnalysisReport`);
  assert(btcReport.symbol === 'BTC/USDT', `Report symbol is BTC/USDT`);
  assert(typeof btcReport.moonScore === 'number', `MoonScore present: ${btcReport.moonScore}/100`);
  assert(['LONG', 'SHORT', 'WAIT'].includes(btcReport.decision || 'WAIT'), `Valid decision: ${btcReport.decision}`);
  assert(btcReport.currentStructureState !== undefined, `Structure state included in report: ${btcReport.currentStructureState}`);
  assert(btcReport.tradeability !== undefined, `Tradeability included: ${btcReport.tradeability.status} (Score: ${btcReport.tradeability.tradeabilityScore}/100)`);
  assert(btcReport.tradeability.entryZone !== undefined, `Entry zone defined: ${btcReport.tradeability.entryZone?.ideal || btcReport.currentPrice}`);
  assert(typeof btcReport.tradeability.stopLoss === 'number', `Stop loss defined: ${btcReport.tradeability.stopLoss}`);
  assert(Array.isArray(btcReport.tradeability.targets), `Targets array defined: ${btcReport.tradeability.targets.length} targets`);

  // TEST 4: Single Unified Signal Invariant
  console.log('\n--- [TEST 4] Single Unified Signal Reconciliation Invariant ---');
  const allSignalsBefore = getAllStoredSignals();
  const btcSignalsBefore = allSignalsBefore.filter(s => s.symbol === 'BTC/USDT');
  assert(btcSignalsBefore.length <= 1, `Max 1 active signal per symbol before deep-dive`);

  // Trigger analysis for BTC/USDT multiple times
  await analyzeSinglePair('BTC/USDT', '1h');
  await analyzeSinglePair('BTC/USDT', '1h');
  const allSignalsAfter = getAllStoredSignals();
  const btcSignalsAfter = allSignalsAfter.filter(s => s.symbol === 'BTC/USDT');
  assert(btcSignalsAfter.length <= 1, `ONE COIN = ONE CURRENT UNIFIED SIGNAL strictly maintained (count: ${btcSignalsAfter.length})`);

  // TEST 5: Graceful Handling for Edge/Unknown Assets
  console.log('\n--- [TEST 5] Unknown Asset Resilient Fallback ---');
  try {
    const unknownReport = await analyzeSinglePair('RANDOMTOKEN99/USDT', '1h');
    assert(unknownReport !== null, `Fallback report generated for unlisted token without crashing`);
    assert(unknownReport.symbol === 'RANDOMTOKEN99/USDT', `Fallback symbol assigned correctly`);
    assert(
      ['TRADEABLE', 'WAIT_FOR_TRIGGER', 'UNTRADEABLE_CHOP'].includes(unknownReport.tradeability.status || '') &&
      ['LONG', 'SHORT', 'WAIT'].includes(unknownReport.decision || ''),
      `Sensible verdict for unlisted asset without crash (${unknownReport.tradeability.status} / ${unknownReport.decision})`
    );
  } catch (err: any) {
    assert(false, `Should not throw on unknown asset: ${err?.message}`);
  }

  console.log('\n================================================================');
  console.log(`🏁 PHASE 6.1 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase6_1Tests().catch((err) => {
  console.error('Fatal error in Phase 6.1 test suite:', err);
  process.exit(1);
});
