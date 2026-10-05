import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  CANONICAL_MARKET_REGISTRY,
  discoverUniversalMarket,
  getAssetCategory,
  runBoundedParallelScan,
  getMarketCoverageTelemetry
} from './marketUniverseService';
import {
  evaluateOpportunityDiscovery,
  rankMarketOpportunities
} from './opportunityDiscoveryEngine';
import { Signal, MarketCategory, CryptoCandle } from '../src/types/crypto';

console.log('=== RUNNING PHASE 5.5 UNIVERSAL MARKET COVERAGE & OPPORTUNITY DISCOVERY TEST SUITE ===');

describe('Phase 5.5: Universal Market Universe & Registry', () => {
  it('covers expanded market categories without hard-coded Top-15 restrictions', async () => {
    const symbols = await discoverUniversalMarket();
    assert(Array.isArray(symbols), 'Must return an array of symbols');
    assert(symbols.length >= 50, `Expected total eligible >= 50, got ${symbols.length}`);
    assert(symbols.includes('BTCUSDT') || symbols.includes('BTC/USDT'), 'Must include BTC');
    assert(symbols.includes('ETHUSDT') || symbols.includes('ETH/USDT'), 'Must include ETH');
    assert(symbols.includes('NYLOUSDT') || symbols.includes('NYLO/USDT') || symbols.includes('SKYAIUSDT') || symbols.includes('SKYAI/USDT'), 'Must include new/small projects like NYLO or SKYAI');
    assert(symbols.includes('BONKUSDT') || symbols.includes('BONK/USDT') || symbols.includes('WIFUSDT') || symbols.includes('WIF/USDT'), 'Must include meme coins');
  });

  it('correctly maps symbols to logical categories without creating quality bias', () => {
    assert.strictEqual(getAssetCategory('BTCUSDT'), 'MAJOR');
    assert.strictEqual(getAssetCategory('ETHUSDT'), 'MAJOR');
    assert.strictEqual(getAssetCategory('INJUSDT'), 'ALTCOIN');
    assert.strictEqual(getAssetCategory('DOGEUSDT'), 'MEME_HIGH_BETA');
    assert.strictEqual(getAssetCategory('PEPEUSDT'), 'MEME_HIGH_BETA');
    assert.strictEqual(getAssetCategory('NYLOUSDT'), 'NEW_LISTING');
    assert.strictEqual(getAssetCategory('SKYAIUSDT'), 'NEW_LISTING');
  });

  it('reports live market coverage telemetry with non-zero category counts and provider status', () => {
    const telemetry = getMarketCoverageTelemetry();
    assert(telemetry.totalEligibleDiscovered >= 50);
    assert(telemetry.categoryDistribution.major > 0);
    assert(telemetry.categoryDistribution.altcoin > 0);
    assert(telemetry.categoryDistribution.memeHighBeta > 0);
    assert(telemetry.categoryDistribution.newListing > 0);
    assert(telemetry.providerStatus.binance === 'OPERATIONAL');
  });
});

describe('Phase 5.5: Bounded Parallel Scanner & Failure Isolation', () => {
  it('executes bounded parallel scan and isolates single coin errors without breaking the rest of the universe', async () => {
    const symbols = ['BTCUSDT', 'INVALID_TEST_COIN', 'ETHUSDT', 'ERROR_PRONE_COIN', 'SOLUSDT'];
    
    const results = await runBoundedParallelScan(
      symbols,
      async (sym) => {
        if (sym.includes('INVALID') || sym.includes('ERROR')) {
          throw new Error(`Simulated fetch failure on ${sym}`);
        }
        return {
          symbol: sym,
          score: 85,
          status: 'SUCCESS'
        };
      },
      3
    );

    assert.strictEqual(results.length, 3, 'Must return all 3 successful coins');
    const returnedSymbols = results.map(r => r.symbol);
    assert(returnedSymbols.includes('BTCUSDT'));
    assert(returnedSymbols.includes('ETHUSDT'));
    assert(returnedSymbols.includes('SOLUSDT'));
    assert(!returnedSymbols.includes('INVALID_TEST_COIN'));
  });
});

describe('Phase 5.5: Universal Opportunity Discovery Layer', () => {
  it('detects early volume acceleration & RVOL surge without requiring price to have already exploded', () => {
    // Generate base candles with compression + sudden volume surge on tight candle
    const candles: CryptoCandle[] = [];
    const now = Date.now();
    for (let i = 40; i >= 0; i--) {
      const isLast = i === 0;
      const isPrev = i === 1;
      candles.push({
        timestamp: now - i * 3600000,
        open: 1.0,
        high: isLast ? 1.015 : (isPrev ? 1.008 : 1.02),
        low: isLast ? 0.998 : (isPrev ? 0.996 : 0.98),
        close: isLast ? 1.012 : (isPrev ? 1.002 : 1.00),
        volume: isLast ? 500000 : 100000 // 5x volume surge on tight body
      });
    }

    const report = evaluateOpportunityDiscovery({
      symbol: 'NYLOUSDT',
      candles,
      qualityGrade: 'A',
      moonScore: 88,
      direction: 'LONG'
    });

    assert(report.opportunityScore >= 70, `Expected opportunityScore >= 70, got ${report.opportunityScore}`);
    assert(report.rvol >= 2.0, `Expected rvol >= 2.0, got ${report.rvol}`);
    assert(
      report.earlySetupType === 'EARLY_MOMENTUM_SETUP' || 
      report.earlySetupType === 'COMPRESSION_BREAKOUT' ||
      report.earlySetupType === 'EARLY_CATALYST_SETUP',
      `Setup type was ${report.earlySetupType}`
    );
  });

  it('triggers anti-hindsight / post-pump exhaustion dump warning when coin is extended with massive selling wick', () => {
    const candles: CryptoCandle[] = [];
    const now = Date.now();
    // 35 normal candles, then 5 candles that pumped 60% with huge upper wick
    for (let i = 40; i >= 0; i--) {
      const isLate = i <= 2;
      candles.push({
        timestamp: now - i * 3600000,
        open: isLate ? 1.45 : 1.0,
        high: isLate ? 1.70 : 1.02,
        low: isLate ? 1.38 : 0.98,
        close: isLate ? 1.42 : 1.00, // closed far below high -> massive selling wick
        volume: isLate ? 800000 : 100000
      });
    }

    const report = evaluateOpportunityDiscovery({
      symbol: 'DOGEUSDT',
      candles,
      qualityGrade: 'C',
      moonScore: 55,
      direction: 'LONG'
    });

    assert(
      report.postPumpDumpRisk === 'CRITICAL' || report.postPumpDumpRisk === 'ELEVATED',
      `Expected elevated or critical post-pump dump risk, got ${report.postPumpDumpRisk}`
    );
  });
});

describe('Phase 5.5: Zero Category Bias in Opportunity Ranking', () => {
  it('allows small-caps or meme coins to rank above BTC if technical evidence and opportunity score are genuinely superior', () => {
    const btcSignal: Partial<Signal> = {
      id: 'btc-1',
      symbol: 'BTC/USDT',
      direction: 'LONG',
      category: 'MAJOR',
      moonScore: 78,
      qualityGrade: 'B',
      actionablePriority: 'WATCH',
      opportunityScore: 65,
      opportunityReport: {
        symbol: 'BTC/USDT',
        category: 'MAJOR',
        opportunityScore: 65,
        detectedPatterns: [],
        rvol: 1.2,
        priceVelocityScore: 50,
        compressionScore: 20,
        rsScoreVsBtc: 0,
        smcStructure: 'NONE',
        earlySetupType: 'NONE',
        postPumpDumpRisk: 'LOW',
        summary: 'Standard consolidation',
        evidenceList: [],
        rankingBucket: 'WATCH_OPPORTUNITY'
      },
      createdAt: Date.now() - 5000
    };

    const nyloSignal: Partial<Signal> = {
      id: 'nylo-1',
      symbol: 'NYLO/USDT',
      direction: 'LONG',
      category: 'NEW_LISTING',
      moonScore: 92,
      qualityGrade: 'A+',
      actionablePriority: 'ENTRY_NOW',
      opportunityScore: 94,
      opportunityReport: {
        symbol: 'NYLO/USDT',
        category: 'NEW_LISTING',
        opportunityScore: 94,
        detectedPatterns: ['EARLY_VOLUME_ACCELERATION', 'PRE_PUMP_CATALYST'],
        rvol: 4.8,
        priceVelocityScore: 85,
        compressionScore: 80,
        rsScoreVsBtc: 45,
        smcStructure: 'ORDER_BLOCK_TAP',
        earlySetupType: 'COMPRESSION_BREAKOUT',
        postPumpDumpRisk: 'LOW',
        summary: 'Pristine pre-pump structural breakout with 4.8x RVOL and 0 dump risk.',
        evidenceList: ['High RVOL', 'Tight compression breakout'],
        rankingBucket: 'STRONGEST_A_PLUS'
      },
      createdAt: Date.now()
    };

    const rankings = rankMarketOpportunities([btcSignal as Signal, nyloSignal as Signal]);

    assert.strictEqual(rankings.strongestAPlus.length, 1);
    assert.strictEqual(rankings.strongestAPlus[0].symbol, 'NYLO/USDT', 'NYLO/USDT must rank as strongest A+ setup purely on evidence');
    assert.strictEqual(rankings.topRankedOpportunities[0].symbol, 'NYLO/USDT');
  });
});

console.log('=== ALL PHASE 5.5 TESTS COMPLETED ===');

