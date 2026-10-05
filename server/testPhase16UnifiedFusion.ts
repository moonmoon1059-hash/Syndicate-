import { evaluateUnifiedFusion, UnifiedFusionInput } from './unifiedFusionEngine';
import { upsertSignals, getStoredSignals, clearStoredSignals } from './signalTracker';
import { Signal } from '../src/types/crypto';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
}

function generateMockCandles(count: number, basePrice: number, trend: 'UP' | 'DOWN' | 'FLAT' = 'UP') {
  const candles = [];
  let price = basePrice;
  const now = Date.now();
  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * 3600 * 1000;
    const change = trend === 'UP' ? 1.002 : trend === 'DOWN' ? 0.998 : 1.0;
    price = price * change;
    const high = price * 1.005;
    const low = price * 0.995;
    const close = price;
    const open = trend === 'UP' ? price * 0.998 : price * 1.002;
    const volume = 100000;
    candles.push({ time, open, high, low, close, volume });
  }
  return candles;
}

console.log('--- Starting MoonScanner Phase 16: Unified Intelligence Fusion Test Suite ---');

// Test 1: Full Confluence LONG Setup
console.log('\n[Test 1] Full Confluence LONG Setup:');
{
  const candles = generateMockCandles(100, 100, 'UP');
  const input: any = {
    symbol: 'BTCUSDT',
    currentPrice: 100,
    entryPrice: 100,
    stopLoss: 97,
    targets: [{ id: 'tp1', targetPrice: 106, hit: false, percentage: 6, status: 'PENDING' }],
    riskRewardRatio: 2.0,
    candles,
    coreDecision: 'LONG',
    coreConfidence: 85,
    qualityGrade: 'A',
    technical: {
      emaAlignment: 'BULLISH',
      rsi: 54,
      macdHistogram: 0.8,
      atr: 1.5,
      rvol: 1.8,
      mtfAlignment: 'ALIGNED_BULLISH',
      patterns: [{ name: 'Ascending Triangle', type: 'CONTINUATION', reliability: 'HIGH' }]
    },
    smc: {
      marketStructure: 'BULLISH_CONTINUATION',
      bosDetected: true,
      chochDetected: false,
      imbalanceDetected: true
    },
    orderflow: {
      orderBookImbalance: { bidAskRatio: 1.8, bias: 'BID_DOMINANT' }
    },
    derivativesData: {
      fundingRate: -0.0004, // negative funding = short crowded, fuel for long
      openInterest: 20000000,
      openInterestChange24h: 8.5
    },
    marketRegime: 'TRENDING_BULLISH',
    marketBreadth: {
      rsScoreVsBtc: 75,
      marketBreadthBias: 'BULLISH'
    },
    marketCycle: {
      cycle: 'MARKUP',
      phase: 'ADVANCING'
    },
    earlySetupTiming: {
      earlyCategory: 'COMPRESSION_SQUEEZE',
      setupMaturity: 'MATURE',
      timingWindow: 'ACTIVE_WINDOW',
      smartEntryTiming: {
        readiness: 'READY_NOW'
      }
    },
    primaryCategory: 'TREND_CONTINUATION_LONG',
    riskAudit: {
      killSwitch: { triggered: false, reasons: [] },
      keyRisk: 'Normal market volatility'
    }
  };

  const report = evaluateUnifiedFusion(input);
  console.log(`- Final Decision: ${report.finalDecision}`);
  console.log(`- Quality: ${report.quality}`);
  console.log(`- Confidence: ${report.confidence}%`);
  console.log(`- Structural Confirmed: ${report.hasStructuralConfirmation}`);
  console.log(`- Supporting Evidence Count: ${report.supportingEvidence.length}`);

  assert(report.finalDecision === 'LONG', 'Expected finalDecision to be LONG');
  assert(report.quality === 'A+' || report.quality === 'A', 'Expected quality A+ or A for full confluence');
  assert(report.confidence >= 75, 'Expected confidence >= 75%');
  assert(report.hasStructuralConfirmation === true, 'Expected structural confirmation to be true');
  assert(report.supportingEvidence.length >= 4, 'Expected at least 4 supporting evidence points');
  console.log('✓ Test 1 Passed');
}

// Test 2: Full Confluence SHORT Setup
console.log('\n[Test 2] Full Confluence SHORT Setup:');
{
  const candles = generateMockCandles(100, 100, 'DOWN');
  const input: any = {
    symbol: 'ETHUSDT',
    currentPrice: 100,
    entryPrice: 100,
    stopLoss: 103,
    targets: [{ id: 'tp1', targetPrice: 94, hit: false, percentage: 6, status: 'PENDING' }],
    riskRewardRatio: 2.0,
    candles,
    coreDecision: 'SHORT',
    coreConfidence: 82,
    qualityGrade: 'A',
    technical: {
      emaAlignment: 'BEARISH',
      rsi: 42,
      macdHistogram: -0.6,
      atr: 1.5,
      rvol: 1.6,
      mtfAlignment: 'ALIGNED_BEARISH'
    },
    smc: {
      marketStructure: 'BEARISH_EXPANSION',
      liquiditySweep: true,
      sweepType: 'BUY_SIDE_LIQUIDITY'
    },
    derivativesData: {
      fundingRate: 0.0006, // positive funding = long crowded, fuel for short
      openInterest: 15000000,
      openInterestChange24h: 12.0
    },
    marketRegime: 'TRENDING_BEARISH',
    marketCycle: {
      cycle: 'DISTRIBUTION',
      phase: 'MARKDOWN'
    },
    riskAudit: {
      killSwitch: { triggered: false, reasons: [] }
    }
  };

  const report = evaluateUnifiedFusion(input);
  console.log(`- Final Decision: ${report.finalDecision}`);
  console.log(`- Quality: ${report.quality}`);
  console.log(`- Confidence: ${report.confidence}%`);

  assert(report.finalDecision === 'SHORT', 'Expected finalDecision to be SHORT');
  assert(report.quality === 'A+' || report.quality === 'A', 'Expected quality A+ or A');
  assert(report.confidence >= 70, 'Expected confidence >= 70%');
  console.log('✓ Test 2 Passed');
}

// Test 3: Conflicting Evidence (Technical Bullish vs Extreme Long Crowding & Exhaustion)
console.log('\n[Test 3] Conflicting Evidence (Bullish Tech vs Long Crowding / Exhaustion):');
{
  const candles = generateMockCandles(100, 100, 'UP');
  const input: any = {
    symbol: 'SOLUSDT',
    currentPrice: 100,
    entryPrice: 100,
    stopLoss: 97,
    targets: [{ id: 'tp1', targetPrice: 106, hit: false, percentage: 6, status: 'PENDING' }],
    riskRewardRatio: 2.0,
    candles,
    coreDecision: 'LONG',
    coreConfidence: 75,
    technical: {
      emaAlignment: 'BULLISH',
      rsi: 78 // Overbought
    },
    derivativesData: {
      fundingRate: 0.0008, // Very high positive funding: Long crowded
      openInterestChange24h: 25.0
    },
    pumpDumpIntelligence: {
      state: 'PUMP_EXHAUSTION',
      exhaustionType: 'CLIMAX_BLOWOFF'
    },
    marketCycle: {
      cycle: 'DISTRIBUTION',
      phase: 'CLIMAX'
    }
  };

  const report = evaluateUnifiedFusion(input);
  console.log(`- Final Decision: ${report.finalDecision}`);
  console.log(`- Quality: ${report.quality}`);
  console.log(`- Contradictions: ${report.contradictions.join('; ')}`);
  console.log(`- Contradiction Penalty: ${report.scoreBreakdown.contradictionPenalty}`);

  assert(report.contradictions.length >= 2, 'Expected at least 2 contradictions flagged');
  assert(report.scoreBreakdown.contradictionPenalty >= 15, 'Expected substantial contradiction penalty');
  assert(report.quality !== 'A+', 'Conflicting evidence must NEVER produce A+ quality');
  console.log('✓ Test 3 Passed');
}

// Test 4: Extreme Crowding & Reversal Evidence
console.log('\n[Test 4] Extreme Crowding & Reversal Evidence:');
{
  const candles = generateMockCandles(100, 100, 'UP');
  const input: any = {
    symbol: 'DOGEUSDT',
    currentPrice: 100,
    candles,
    coreDecision: 'SHORT',
    derivativesData: {
      fundingRate: 0.0009, // +0.09% extreme long crowding
      openInterest: 50000000,
      openInterestChange24h: 30
    },
    pumpDumpIntelligence: {
      state: 'PUMP_EXHAUSTION',
      exhaustionType: 'BUY_VOLUME_EXHAUSTION'
    },
    smc: {
      liquiditySweep: true,
      sweepType: 'BUY_SIDE_LIQUIDITY'
    }
  };

  const report = evaluateUnifiedFusion(input);
  console.log(`- Final Decision: ${report.finalDecision}`);
  console.log(`- Derivatives Crowding Score: +${report.scoreBreakdown.derivativesCrowdingScore}`);
  assert(report.scoreBreakdown.derivativesCrowdingScore >= 6, 'Expected high crowding score for short setup');
  assert(report.finalDecision === 'SHORT', 'Expected SHORT on pump exhaustion + sweep');
  console.log('✓ Test 4 Passed');
}

// Test 5: News Contradiction (Kill Switch / Negative Catalyst against Long)
console.log('\n[Test 5] News Contradiction:');
{
  const candles = generateMockCandles(100, 100, 'UP');
  const input: any = {
    symbol: 'AVAXUSDT',
    currentPrice: 100,
    candles,
    coreDecision: 'LONG',
    technical: {
      emaAlignment: 'BULLISH',
      rsi: 55
    },
    newsImpactReport: {
      headline: 'Major Security Exploit Discovered in Protocol Contracts',
      impactDirection: 'BEARISH',
      impactWeight: 90,
      contradictsTechnical: true
    }
  };

  const report = evaluateUnifiedFusion(input);
  console.log(`- Final Decision: ${report.finalDecision}`);
  console.log(`- Contradictions: ${report.contradictions.join(', ')}`);
  assert(report.contradictions.some(c => c.includes('Bearish news catalyst contradicts LONG')), 'Expected news contradiction warning');
  assert(report.quality !== 'A+', 'Severe news contradiction must prevent A+ quality');
  console.log('✓ Test 5 Passed');
}

// Test 6: Wyckoff Conflict (Bullish attempt in Redistribution / Markdown)
console.log('\n[Test 6] Wyckoff Conflict:');
{
  const candles = generateMockCandles(100, 100, 'DOWN');
  const input: any = {
    symbol: 'NEARUSDT',
    currentPrice: 100,
    candles,
    coreDecision: 'LONG',
    marketCycle: {
      cycle: 'MARKDOWN',
      phase: 'DISTRIBUTION'
    }
  };

  const report = evaluateUnifiedFusion(input);
  console.log(`- Contradictions: ${report.contradictions.join('; ')}`);
  assert(report.contradictions.some(c => c.includes('Wyckoff') || c.includes('cycle')), 'Expected Wyckoff conflict flagged');
  console.log('✓ Test 6 Passed');
}

// Test 7: New Listing Risk
console.log('\n[Test 7] New Listing Risk & Unconfirmed Structure:');
{
  const candles = generateMockCandles(30, 10, 'UP'); // short history
  const input: any = {
    symbol: 'NEWCOINUSDT',
    currentPrice: 10,
    candles,
    coreDecision: 'LONG',
    newListingIntelligence: {
      isNewListing: true,
      launchStatus: 'PRICE_DISCOVERY',
      listingAgeHours: 6,
      volatilityState: 'EXTREME'
    }
  };

  const report = evaluateUnifiedFusion(input);
  console.log(`- Final Decision: ${report.finalDecision}`);
  console.log(`- Risk State: ${report.riskState}`);
  console.log(`- Confidence: ${report.confidence}%`);
  assert(report.riskState === 'ELEVATED' || report.riskState === 'CRITICAL', 'Expected elevated risk for new listing');
  assert(report.quality !== 'A+', 'New listing discovery phase cannot achieve A+ grade');
  console.log('✓ Test 7 Passed');
}

// Test 8: Large-Move Anti-Chase Guard
console.log('\n[Test 8] Large-Move Anti-Chase Guard:');
{
  const candles = generateMockCandles(100, 100, 'UP');
  // Make the last candle 20% higher to simulate huge extension
  candles[candles.length - 1].close = 120;
  candles[candles.length - 1].high = 122;

  const input: any = {
    symbol: 'PUMPUSDT',
    currentPrice: 120,
    entryPrice: 120,
    candles,
    coreDecision: 'LONG',
    largeMoveIntelligence: {
      moveClass: '100_PERCENT_PLUS',
      asymmetricScore: 92,
      riskRewardRatio: 8.0,
      crowdingState: 'LONG_CROWDED',
      exhaustionState: 'PUMP_EXHAUSTION',
      marketStructureAlignment: 'EXTENDED'
    }
  };

  const report = evaluateUnifiedFusion(input);
  console.log(`- Anti-Chase Active: ${report.isAntiChaseActive}`);
  console.log(`- Execution State: ${report.executionState}`);
  console.log(`- Contradictions: ${report.contradictions.join('; ')}`);
  assert(report.isAntiChaseActive === true, 'Expected anti-chase guard to activate on extended pump');
  assert(report.quality !== 'A+', 'Anti-chase must never allow A+ quality');
  console.log('✓ Test 8 Passed');
}

// Test 9: Missing Data Handled Without Fabrication
console.log('\n[Test 9] Missing Data (Derivatives & Orderflow Unavailable):');
{
  const candles = generateMockCandles(100, 100, 'UP');
  const input: any = {
    symbol: 'OBSCUREUSDT',
    currentPrice: 100,
    candles,
    coreDecision: 'LONG',
    derivativesData: null,
    orderflow: null
  };

  const report = evaluateUnifiedFusion(input);
  console.log(`- Data Quality Penalty: -${report.scoreBreakdown.dataQualityPenalty} pts`);
  assert(report.scoreBreakdown.dataQualityPenalty > 0, 'Expected data quality penalty for missing feeds');
  assert(report.scoreBreakdown.derivativesCrowdingScore === 0, 'Expected zero derivatives crowding points when feed is null');
  console.log('✓ Test 9 Passed');
}

// Test 10: High R:R Alone Cannot Fabricate A+ Grade
console.log('\n[Test 10] High R:R Alone Cannot Fabricate A+ Grade:');
{
  const candles = generateMockCandles(100, 100, 'FLAT');
  const input: any = {
    symbol: 'FLATUSDT',
    currentPrice: 100,
    candles,
    coreDecision: 'LONG',
    riskRewardRatio: 15.0, // huge R:R
    technical: {
      emaAlignment: 'NEUTRAL',
      rsi: 50
    },
    smc: {
      bosDetected: false
    }
  };

  const report = evaluateUnifiedFusion(input);
  console.log(`- Quality: ${report.quality}`);
  console.log(`- Confidence: ${report.confidence}%`);
  assert(report.quality !== 'A+' && report.quality !== 'A', 'High R:R alone cannot grant A or A+');
  assert(report.confidence <= 65, 'Without structural confirmation, confidence must be capped at 65%');
  console.log('✓ Test 10 Passed');
}

// Test 11: Output Schema Invariant Checks
console.log('\n[Test 11] Output Schema Invariant Checks:');
{
  const allowedDecisions = ['LONG', 'SHORT', 'WAIT'];
  const allowedQualities = ['A+', 'A', 'B', 'C', 'WAIT'];

  const testReport = evaluateUnifiedFusion({
    symbol: 'TESTUSDT',
    currentPrice: 100,
    candles: generateMockCandles(50, 100),
    coreDecision: 'WAIT'
  });

  assert(allowedDecisions.includes(testReport.finalDecision), `Invalid decision: ${testReport.finalDecision}`);
  assert(allowedQualities.includes(testReport.quality), `Invalid quality: ${testReport.quality}`);
  assert(testReport.confidence >= 0 && testReport.confidence <= 100, 'Confidence must be between 0 and 100');
  console.log('✓ Test 11 Passed');
}

// Test 12: ONE COIN = ONE CURRENT UNIFIED SIGNAL Invariant
console.log('\n[Test 12] ONE COIN = ONE CURRENT UNIFIED SIGNAL Invariant:');
{
  clearStoredSignals();

  const baseSignal: Signal = {
    id: 'SIG-TEST-001',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    qualityGrade: 'A',
    actionablePriority: 'HIGH_PRIORITY',
    status: 'ACTIVE',
    entryPrice: 100,
    stopLoss: 97,
    targets: [{ id: 'tp1', label: 'TP1', price: 106, hit: false, percentage: 6, status: 'ACTIVE' }],
    tp1: 106,
    tp2: 110,
    tp3: 115,
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    timestamp: Date.now(),
    expiresAt: Date.now() + 86400000,
    confluences: [],
    moonScore: 85,
    riskRewardRatio: 2.0,
    currentPrice: 100,
    priceChange24h: 2.5,
    volume24h: 1000000,
    confidence: 85,
    timeframe: '1h',
    createdAt: Date.now(),
    unifiedFusion: evaluateUnifiedFusion({
      symbol: 'BTCUSDT',
      currentPrice: 100,
      coreDecision: 'LONG',
      candles: generateMockCandles(50, 100)
    })
  };

  // Upsert first time
  upsertSignals([baseSignal]);
  let stored = getStoredSignals();
  assert(stored.length === 1, 'Expected 1 stored signal');

  // Attempt to insert duplicate or updated signal for same coin
  const duplicateOrUpdatedSignal: Signal = {
    ...baseSignal,
    id: 'SIG-TEST-002', // Different ID
    currentPrice: 102,
    confidence: 90
  };

  upsertSignals([duplicateOrUpdatedSignal]);
  stored = getStoredSignals();
  assert(stored.length === 1, `Expected exactly 1 stored signal for BTCUSDT, found ${stored.length}`);
  assert(stored[0].currentPrice === 102, 'Expected price to update to 102 on existing coin signal');
  assert(stored[0].unifiedFusion !== undefined, 'Expected unifiedFusion to be preserved');
  console.log('✓ Test 12 Passed (ONE COIN = ONE CURRENT UNIFIED SIGNAL guaranteed)');
}

console.log('\n======================================================');
console.log('ALL PHASE 16 UNIFIED INTELLIGENCE FUSION TESTS PASSED!');
console.log('======================================================');
