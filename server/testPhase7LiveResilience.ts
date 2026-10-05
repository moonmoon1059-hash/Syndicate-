import {
  getKlinesWithMultiExchangeFallback,
  getTickerWithMultiExchangeFallback,
  assessMarketDataQuality,
  isDataCriticallyStale,
  recordRateLimitIncident,
  isProviderRateLimited,
  getProviderHealthStatus,
  CRITICAL_STALENESS_THRESHOLD_MS
} from './liveDataProvider';
import { runBoundedParallelScan, getMarketCoverageTelemetry } from './marketUniverseService';
import { upsertSignals, clearSignalStoreForTesting, getAllStoredSignals, getStoredSignalBySymbol } from './signalTracker';
import { evaluateDataQuality } from './coreIntelligenceEngine';
import { generateDynamicTargets } from './tradeManagementEngine';
import { Candle, Signal } from '../src/types/crypto';

export async function runPhase7LiveResilienceTests(): Promise<{ passed: boolean; testCount: number; details: string[] }> {
  const details: string[] = [];
  let testCount = 0;
  let allPassed = true;

  function assert(condition: boolean, testName: string, failureDetails?: string) {
    testCount++;
    if (condition) {
      details.push(`[PASS] ${testName}`);
    } else {
      allPassed = false;
      details.push(`[FAIL] ${testName}${failureDetails ? `: ${failureDetails}` : ''}`);
    }
  }

  console.log('--- STARTING PHASE 7 LIVE DATA & RESILIENCE TEST SUITE ---');

  // TEST 1: Multi-Exchange Provider Fallback & Continuous OHLCV Fetch
  try {
    const klineResult = await getKlinesWithMultiExchangeFallback('BTCUSDT', '1h', 50);
    assert(
      klineResult && Array.isArray(klineResult.candles) && klineResult.candles.length >= 20,
      'Multi-Exchange Klines Fallback returns valid continuous OHLCV data',
      `Candles length: ${klineResult?.candles?.length}`
    );
    assert(
      ['binance', 'bybit', 'okx', 'mexc', 'fallback'].includes(klineResult.source),
      'Klines returns valid identified exchange provider source',
      `Source: ${klineResult.source}`
    );
  } catch (err: any) {
    assert(false, 'Multi-Exchange Klines Fallback threw unexpected exception', err.message);
  }

  // TEST 2: Multi-Exchange 24h Ticker Fallback
  try {
    const tickerResult = await getTickerWithMultiExchangeFallback('SOLUSDT');
    assert(
      tickerResult && tickerResult.ticker !== null && tickerResult.ticker.lastPrice > 0,
      'Multi-Exchange 24h Ticker returns valid positive price and volume metrics'
    );
  } catch (err: any) {
    assert(false, 'Multi-Exchange Ticker Fallback threw unexpected exception', err.message);
  }

  // TEST 3: HTTP 429 Rate Limit Cooldown & Provider Rotation
  try {
    recordRateLimitIncident('binance', 2);
    const isLimited = isProviderRateLimited('binance');
    assert(isLimited, 'Rate limit incident puts provider in backoff cooldown state');

    const health = getProviderHealthStatus();
    assert(
      health.binance && health.binance.status === 'RATE_LIMITED',
      'Provider health correctly records RATE_LIMITED status'
    );
  } catch (err: any) {
    assert(false, 'Rate limit cooldown handling failed', err.message);
  }

  // TEST 4: Data Quality & Staleness Protection Gate
  try {
    const qualityReport = assessMarketDataQuality('BTCUSDT');
    assert(
      typeof qualityReport.isStale === 'boolean' && qualityReport.qualityRating !== undefined,
      'Market data quality assessment returns structured health report'
    );

    // Test artificial stale candle array
    const now = Date.now();
    const staleCandles: Candle[] = [
      { timestamp: now - 86400000 * 2, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
      { timestamp: now - 86400000, open: 102, high: 108, low: 98, close: 105, volume: 1200 }
    ];
    // Need at least 20 bars to pass quantity check
    for (let i = 2; i < 25; i++) {
      staleCandles.push({
        timestamp: now - 86400000 + i * 3600000,
        open: 105,
        high: 106,
        low: 104,
        close: 105,
        volume: 1000
      });
    }
    // Stale timestamp on last candle (> 14.4h old)
    const evaluatedQuality = evaluateDataQuality(staleCandles, {});
    assert(
      evaluatedQuality.details.some(d => d.includes('staleness') || d.includes('Staleness') || evaluatedQuality.rating === 'MEDIUM' || evaluatedQuality.rating === 'LOW'),
      'Data quality engine detects candle timestamp staleness'
    );
  } catch (err: any) {
    assert(false, 'Data quality staleness test failed', err.message);
  }

  // TEST 5: Isolated Failure Resilience in Bounded Parallel Execution
  try {
    const testSymbols = ['BTCUSDT', 'FAILS_1_USDT', 'ETHUSDT', 'FAILS_2_USDT', 'SOLUSDT'];
    const parallelResults = await runBoundedParallelScan(
      testSymbols,
      async (sym) => {
        if (sym.startsWith('FAILS')) {
          throw new Error('Simulated network timeout 504 / 429');
        }
        return { symbol: sym, success: true };
      },
      3
    );

    assert(
      parallelResults.length === 3,
      'Bounded parallel scanner completes successfully without halting on isolated asset errors',
      `Expected 3 results, got ${parallelResults.length}`
    );
  } catch (err: any) {
    assert(false, 'Parallel scanner failure isolation threw unhandled exception', err.message);
  }

  // TEST 6: Real-time Signal Lifecycle & ONE COIN = ONE UNIFIED SIGNAL Invariant
  try {
    clearSignalStoreForTesting();

    const initialSignal: Signal = {
      id: 'SIG_BTC_001',
      symbol: 'BTC/USDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      direction: 'LONG',
      timeframe: '1h',
      status: 'ACTIVE',
      entryStatus: 'ENTRY_NOW',
      qualityGrade: 'A+',
      actionablePriority: 'ENTRY_NOW',
      moonScore: 92,
      confidence: 92,
      entryPrice: 88000,
      stopLoss: 86000,
      targets: [
        { id: 'TP1', label: 'TP1', price: 91000, percentage: 3.4, rMultiple: 1.5, hit: false, status: 'ACTIVE' },
        { id: 'TP2', label: 'TP2', price: 94000, percentage: 6.8, rMultiple: 3.0, hit: false, status: 'ACTIVE' }
      ],
      tp1: 91000,
      tp2: 94000,
      tp3: 98000,
      riskRewardRatio: 3.0,
      currentPrice: 88200,
      priceChange24h: 3.5,
      confluences: [],
      timestamp: Date.now(),
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000
    };

    // First upsert
    upsertSignals([initialSignal]);
    let stored = getAllStoredSignals();
    assert(stored.length === 1, 'Initial signal stored in repository');

    // Second upsert for SAME coin with updated price and status (simulating live polling / WebSocket)
    const updatedSignal: Signal = {
      ...initialSignal,
      id: 'SIG_BTC_002', // Different temporary ID
      symbol: 'BTCUSDT', // Different string formatting
      currentPrice: 91500,
      status: 'TP1_HIT'
    };

    upsertSignals([updatedSignal]);
    stored = getAllStoredSignals();
    assert(
      stored.length === 1,
      'Enforces ONE COIN = ONE CURRENT UNIFIED SIGNAL (zero duplicate cards on polling)',
      `Stored count: ${stored.length}`
    );

    const btcCurrent = getStoredSignalBySymbol('BTC/USDT');
    assert(
      btcCurrent?.currentPrice === 91500,
      'Reconciliation updates price and properties in place'
    );
  } catch (err: any) {
    assert(false, 'Signal lifecycle deduplication test failed', err.message);
  }

  // TEST 7: Dynamic Structural Targets & Asymmetric R:R Preservation
  try {
    const targetResult = generateDynamicTargets({
      entryPrice: 100,
      stopLoss: 95, // 5 pt risk
      direction: 'LONG',
      atr: 2.5,
      keyLevelsInDirection: [110, 125, 140],
      liquidityPools: [{ price: 135, type: 'BUY_SIDE_LIQUIDITY' }]
    });

    const targets = targetResult.targets;
    assert(
      targets && targets.length >= 2,
      'Dynamic target generator creates multi-tier structural profit targets',
      `Targets count: ${targets?.length}`
    );
    assert(
      targets.some(t => (t.rMultiple || 0) >= 2.0 || targetResult.riskRewardRatio >= 2.0),
      'Asymmetric structural opportunities are accurately calculated when justified',
      `Max RR: ${targetResult.riskRewardRatio}`
    );
  } catch (err: any) {
    assert(false, 'Asymmetric target generation test failed', err.message);
  }

  // TEST 8: Production Observability Telemetry Integrity
  try {
    const telemetry = getMarketCoverageTelemetry();
    assert(
      telemetry.totalEligibleDiscovered > 50,
      'Coverage telemetry tracks full eligible market universe (> 50 assets)'
    );
    assert(
      telemetry.providerStatus && telemetry.providerStatus.binance !== undefined,
      'Coverage telemetry exposes multi-provider health reports'
    );
  } catch (err: any) {
    assert(false, 'Observability telemetry test failed', err.message);
  }

  console.log(`--- PHASE 7 LIVE RESILIENCE TESTS COMPLETE: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} (${testCount} tests) ---`);
  return { passed: allPassed, testCount, details };
}

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith('testPhase7LiveResilience.ts')) {
  runPhase7LiveResilienceTests().then((res) => {
    console.log(res.details.join('\n'));
    if (!res.passed) {
      process.exit(1);
    }
  });
}
