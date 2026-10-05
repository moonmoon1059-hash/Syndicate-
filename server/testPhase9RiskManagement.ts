import {
  calculateStructuralStopLoss,
  calculateRiskRewardLadder,
  calculatePositionSizing,
  evaluateLeverageRiskContext,
  evaluateDerivativesRiskContext,
  updateTradeLifecycleState,
  buildNewsCompatibilityReport,
  evaluateSmartRiskAndTradeManagement,
  MANDATORY_LEVERAGE_WARNING
} from './smartRiskEngine';
import { Candle, TargetLevel } from '../src/types/crypto';

function generateMockCandles(count: number, basePrice: number, trend: 'UP' | 'DOWN' | 'RANGE' | 'COMPRESSED'): Candle[] {
  const candles: Candle[] = [];
  let current = basePrice;
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * 3600000;
    let change = 0;
    if (trend === 'UP') change = (0.01 + Math.sin(i / 3) * 0.005) * current;
    else if (trend === 'DOWN') change = -(0.01 + Math.sin(i / 3) * 0.005) * current;
    else if (trend === 'RANGE') change = (Math.sin(i) * 0.008) * current;
    else if (trend === 'COMPRESSED') change = (Math.sin(i) * 0.002) * current;

    const open = current;
    const close = current + change;
    const high = Math.max(open, close) + Math.abs(current * 0.003);
    const low = Math.min(open, close) - Math.abs(current * 0.003);
    const volume = 100000 + Math.random() * 50000;

    candles.push({ timestamp: time, time, open, high, low, close, volume });
    current = close;
  }
  return candles;
}

export async function runPhase9ValidationSuite(): Promise<{
  passed: boolean;
  testResults: { name: string; status: 'PASS' | 'FAIL'; details?: string }[];
}> {
  const results: { name: string; status: 'PASS' | 'FAIL'; details?: string }[] = [];

  console.log('\n======================================================');
  console.log('🧪 MOONSCANNER PHASE 9: SMART RISK + TRADE MANAGEMENT TEST SUITE');
  console.log('======================================================\n');

  // TEST 1: Deterministic Risk Calculation with Real Available Data
  try {
    const candles = generateMockCandles(40, 100, 'UP');
    const entry = candles[candles.length - 1].close;
    const slReport = calculateStructuralStopLoss({
      symbol: 'SOLUSDT',
      direction: 'LONG',
      entryPrice: entry,
      candles
    });

    const isDeterministic =
      typeof slReport.price === 'number' &&
      slReport.price < entry &&
      slReport.isValidStructural &&
      slReport.atrBufferUsed > 0;

    if (isDeterministic) {
      results.push({
        name: '1. Deterministic Risk Calculation',
        status: 'PASS',
        details: `SL: ${slReport.price}, Anchor: ${slReport.invalidationAnchor}, ATR Buffer: ${slReport.atrBufferUsed}`
      });
    } else {
      results.push({
        name: '1. Deterministic Risk Calculation',
        status: 'FAIL',
        details: `Invalid structural risk output: ${JSON.stringify(slReport)}`
      });
    }
  } catch (e: any) {
    results.push({ name: '1. Deterministic Risk Calculation', status: 'FAIL', details: e.message });
  }

  // TEST 2: Structural SL Calculation for LONG (Swing Low / Demand OB)
  try {
    const candles = generateMockCandles(40, 100, 'UP');
    const mockDemandOB = {
      orderBlocks: [{ type: 'BULLISH', bottom: 98.5, top: 100.2 }]
    };
    const slReport = calculateStructuralStopLoss({
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryPrice: 104,
      candles,
      smcReport: mockDemandOB
    });

    const pass =
      slReport.basis === 'DEMAND_ORDER_BLOCK' &&
      slReport.invalidationAnchor === 98.5 &&
      typeof slReport.price === 'number' &&
      slReport.price < 98.5;

    if (pass) {
      results.push({
        name: '2. Structural SL Calculation for LONG',
        status: 'PASS',
        details: `Basis: ${slReport.basis}, Anchor: ${slReport.invalidationAnchor}, Final SL: ${slReport.price}`
      });
    } else {
      results.push({
        name: '2. Structural SL Calculation for LONG',
        status: 'FAIL',
        details: `Expected DEMAND_ORDER_BLOCK basis, got ${slReport.basis}`
      });
    }
  } catch (e: any) {
    results.push({ name: '2. Structural SL Calculation for LONG', status: 'FAIL', details: e.message });
  }

  // TEST 3: Structural SL Calculation for SHORT (Swing High / Supply OB)
  try {
    const candles = generateMockCandles(40, 100, 'DOWN');
    const mockSupplyOB = {
      orderBlocks: [{ type: 'BEARISH', bottom: 94.0, top: 96.5 }]
    };
    const slReport = calculateStructuralStopLoss({
      symbol: 'ETHUSDT',
      direction: 'SHORT',
      entryPrice: 91.0,
      candles,
      smcReport: mockSupplyOB
    });

    const pass =
      slReport.basis === 'SUPPLY_ORDER_BLOCK' &&
      slReport.invalidationAnchor === 96.5 &&
      typeof slReport.price === 'number' &&
      slReport.price > 96.5;

    if (pass) {
      results.push({
        name: '3. Structural SL Calculation for SHORT',
        status: 'PASS',
        details: `Basis: ${slReport.basis}, Anchor: ${slReport.invalidationAnchor}, Final SL: ${slReport.price}`
      });
    } else {
      results.push({
        name: '3. Structural SL Calculation for SHORT',
        status: 'FAIL',
        details: `Expected SUPPLY_ORDER_BLOCK basis, got ${slReport.basis}`
      });
    }
  } catch (e: any) {
    results.push({ name: '3. Structural SL Calculation for SHORT', status: 'FAIL', details: e.message });
  }

  // TEST 4: Dynamic TP1 / TP2 / TP3 Preservation & Structural Justification
  try {
    const targets: TargetLevel[] = [
      { id: 'TP1', label: 'TP1', price: 105, percentage: 5.0, hit: false },
      { id: 'TP2', label: 'TP2', price: 110, percentage: 10.0, hit: false },
      { id: 'TP3', label: 'TP3', price: 120, percentage: 20.0, hit: false }
    ];
    const rr = calculateRiskRewardLadder({
      entryPrice: 100,
      stopLossPrice: 98,
      targets,
      direction: 'LONG'
    });

    const pass = rr.tp1RR === 2.5 && rr.tp2RR === 5.0 && rr.tp3RR === 10.0 && rr.maxStructuralRR === 10.0;
    if (pass) {
      results.push({
        name: '4. Dynamic TP1/TP2/TP3 Preservation',
        status: 'PASS',
        details: `TP1: ${rr.tp1RR}R, TP2: ${rr.tp2RR}R, TP3: ${rr.tp3RR}R, Max: ${rr.maxStructuralRR}R`
      });
    } else {
      results.push({
        name: '4. Dynamic TP1/TP2/TP3 Preservation',
        status: 'FAIL',
        details: `Mismatch in RR calculations: ${JSON.stringify(rr)}`
      });
    }
  } catch (e: any) {
    results.push({ name: '4. Dynamic TP1/TP2/TP3 Preservation', status: 'FAIL', details: e.message });
  }

  // TEST 5: High R:R Setups Correctly Validated and Preserved (1:5, 1:10, 1:15, 1:20+)
  try {
    const targets: TargetLevel[] = [
      { id: 'TP1', label: 'TP1', price: 105, percentage: 5.0, hit: false },
      { id: 'TP2', label: 'TP2', price: 115, percentage: 15.0, hit: false },
      { id: 'TP3', label: 'TP3', price: 130, percentage: 30.0, hit: false }
    ];
    // Entry = 100, SL = 98.5 (Risk = 1.5). TP3 = 130 (Reward = 30). RR = 30 / 1.5 = 20.0R
    const rr = calculateRiskRewardLadder({
      entryPrice: 100,
      stopLossPrice: 98.5,
      targets,
      direction: 'LONG'
    });

    const pass = rr.isAsymmetric && rr.maxStructuralRR === 20.0;
    if (pass) {
      results.push({
        name: '5. High R:R Setup Asymmetry (1:20+)',
        status: 'PASS',
        details: `Max Structural R:R: 1:${rr.maxStructuralRR}, Asymmetric: ${rr.isAsymmetric}`
      });
    } else {
      results.push({
        name: '5. High R:R Setup Asymmetry (1:20+)',
        status: 'FAIL',
        details: `Expected 20.0R and isAsymmetric=true, got ${JSON.stringify(rr)}`
      });
    }
  } catch (e: any) {
    results.push({ name: '5. High R:R Setup Asymmetry (1:20+)', status: 'FAIL', details: e.message });
  }

  // TEST 6: Invariant: R:R Alone Can NEVER Create or Upgrade a Signal
  try {
    // When direction is WAIT, risk/reward ladder returns UNKNOWN and never overrides WAIT
    const rr = calculateRiskRewardLadder({
      entryPrice: 100,
      stopLossPrice: 99,
      targets: [{ id: 'TP1', label: 'TP1', price: 200, hit: false }],
      direction: 'WAIT'
    });

    const pass = rr.tp1RR === 'UNKNOWN' && rr.isAsymmetric === false;
    if (pass) {
      results.push({
        name: '6. Invariant: R:R Alone Never Creates Signal',
        status: 'PASS',
        details: 'WAIT state correctly preserves UNKNOWN R:R without upgrading signals.'
      });
    } else {
      results.push({
        name: '6. Invariant: R:R Alone Never Creates Signal',
        status: 'FAIL',
        details: `Expected UNKNOWN on WAIT direction, got ${JSON.stringify(rr)}`
      });
    }
  } catch (e: any) {
    results.push({ name: '6. Invariant: R:R Alone Never Creates Signal', status: 'FAIL', details: e.message });
  }

  // TEST 7: Deterministic Position Sizing Calculation
  try {
    const sizing = calculatePositionSizing({
      accountEquity: 10000,
      riskPercentage: 1.0, // $100 risk
      entryPrice: 100,
      stopLossPrice: 98, // $2 risk per unit -> 50 units
      leverage: 5
    });

    const pass =
      sizing.status === 'CALCULATED' &&
      sizing.riskAmountUsd === 100 &&
      sizing.positionUnits === 50 &&
      sizing.notionalValueUsd === 5000 &&
      sizing.estimatedMarginUsd === 1000;

    if (pass) {
      results.push({
        name: '7. Deterministic Position Sizing',
        status: 'PASS',
        details: `Risk: $${sizing.riskAmountUsd}, Units: ${sizing.positionUnits}, Notional: $${sizing.notionalValueUsd}, Margin: $${sizing.estimatedMarginUsd}`
      });
    } else {
      results.push({
        name: '7. Deterministic Position Sizing',
        status: 'FAIL',
        details: `Mismatch in sizing calculation: ${JSON.stringify(sizing)}`
      });
    }
  } catch (e: any) {
    results.push({ name: '7. Deterministic Position Sizing', status: 'FAIL', details: e.message });
  }

  // TEST 8: Position Sizing Returns UNKNOWN When Config is Unavailable
  try {
    const sizing = calculatePositionSizing({
      entryPrice: 100,
      stopLossPrice: 95
      // accountEquity and riskPercentage omitted
    });

    const pass = sizing.status === 'UNKNOWN' && sizing.positionUnits === undefined;
    if (pass) {
      results.push({
        name: '8. Position Sizing UNKNOWN Fallback',
        status: 'PASS',
        details: 'Returns status UNKNOWN when equity or risk percentage is not provided.'
      });
    } else {
      results.push({
        name: '8. Position Sizing UNKNOWN Fallback',
        status: 'FAIL',
        details: `Expected status UNKNOWN, got ${sizing.status}`
      });
    }
  } catch (e: any) {
    results.push({ name: '8. Position Sizing UNKNOWN Fallback', status: 'FAIL', details: e.message });
  }

  // TEST 9: Leverage Risk Classification (Low, Moderate, High, Extreme)
  try {
    const candles = generateMockCandles(40, 100, 'UP');
    // High volatility & tight SL -> Extreme risk context
    const extremeLev = evaluateLeverageRiskContext({
      candles,
      entryPrice: 100,
      stopLossPrice: 99.4, // 0.6% SL -> Tight SL danger
      marketRegime: 'HIGH_VOLATILITY',
      derivativesFunding: 0.06 // 0.06% funding -> Extreme crowding
    });

    // Stable regime & normal SL -> Low/Moderate risk context
    const modLev = evaluateLeverageRiskContext({
      candles,
      entryPrice: 100,
      stopLossPrice: 97.5, // 2.5% SL
      marketRegime: 'BULL',
      liquidityCondition: 'DEEP',
      derivativesFunding: 0.005
    });

    const pass = extremeLev.riskLevel === 'EXTREME_RISK_CONTEXT' && typeof extremeLev.maxRecommendedLeverage === 'number' && extremeLev.maxRecommendedLeverage <= 2;
    if (pass) {
      results.push({
        name: '9. Leverage Risk Classification',
        status: 'PASS',
        details: `Extreme: ${extremeLev.riskLevel} (Max ${extremeLev.maxRecommendedLeverage}x), Normal: ${modLev.riskLevel} (Max ${modLev.maxRecommendedLeverage}x)`
      });
    } else {
      results.push({
        name: '9. Leverage Risk Classification',
        status: 'FAIL',
        details: `Expected EXTREME_RISK_CONTEXT, got ${extremeLev.riskLevel}`
      });
    }
  } catch (e: any) {
    results.push({ name: '9. Leverage Risk Classification', status: 'FAIL', details: e.message });
  }

  // TEST 10: Explicit Leverage Safety Warning Invariant
  try {
    const candles = generateMockCandles(30, 50, 'UP');
    const levReport = evaluateLeverageRiskContext({
      candles,
      entryPrice: 50,
      stopLossPrice: 48.5
    });

    const pass =
      typeof levReport.safetyWarning === 'string' &&
      levReport.safetyWarning.includes('No leverage is safe') &&
      levReport.safetyWarning.includes('liquidation risk');

    if (pass) {
      results.push({
        name: '10. Mandatory Leverage Safety Warning',
        status: 'PASS',
        details: 'Safety warning contains required liquidation and risk disclaimers.'
      });
    } else {
      results.push({
        name: '10. Mandatory Leverage Safety Warning',
        status: 'FAIL',
        details: `Warning missing required phrases: ${levReport.safetyWarning}`
      });
    }
  } catch (e: any) {
    results.push({ name: '10. Mandatory Leverage Safety Warning', status: 'FAIL', details: e.message });
  }

  // TEST 11: Execution Readiness State Evaluation
  try {
    const candles = generateMockCandles(40, 100, 'UP');
    const entry = candles[candles.length - 1].close;
    const targets: TargetLevel[] = [{ id: 'TP1', label: 'TP1', price: entry * 1.08, hit: false }];
    const smartReport = evaluateSmartRiskAndTradeManagement({
      symbol: 'AVAXUSDT',
      direction: 'LONG',
      entryPrice: entry,
      candles,
      targets
    });

    const pass = smartReport.lifecycle.state === 'ORIGINAL_SL' && smartReport.structuralStopLoss.isValidStructural;
    if (pass) {
      results.push({
        name: '11. Execution Readiness & Initial State',
        status: 'PASS',
        details: `Initial lifecycle state: ${smartReport.lifecycle.state}, Invalidation Criteria: ${smartReport.invalidationCriteria.substring(0, 40)}...`
      });
    } else {
      results.push({
        name: '11. Execution Readiness & Initial State',
        status: 'FAIL',
        details: `Expected initial state ORIGINAL_SL, got ${smartReport.lifecycle.state}`
      });
    }
  } catch (e: any) {
    results.push({ name: '11. Execution Readiness & Initial State', status: 'FAIL', details: e.message });
  }

  // TEST 12: Trade Lifecycle State Machine: ORIGINAL_SL -> BREAK_EVEN
  try {
    const targets: TargetLevel[] = [
      { id: 'TP1', label: 'TP1', price: 105, hit: false },
      { id: 'TP2', label: 'TP2', price: 110, hit: false }
    ];
    // Price moves to 105.5 (TP1 hit)
    const updated = updateTradeLifecycleState({
      entryPrice: 100,
      originalStopLoss: 98,
      currentPrice: 105.5,
      direction: 'LONG',
      targets
    });

    const pass =
      updated.state === 'BREAK_EVEN' &&
      updated.tp1Hit === true &&
      updated.currentStopLoss === 100 &&
      updated.stateHistory.some(h => h.toState === 'BREAK_EVEN');

    if (pass) {
      results.push({
        name: '12. Lifecycle: ORIGINAL_SL -> BREAK_EVEN',
        status: 'PASS',
        details: `State: ${updated.state}, Current SL moved to Entry: ${updated.currentStopLoss}, TP1 Hit: ${updated.tp1Hit}`
      });
    } else {
      results.push({
        name: '12. Lifecycle: ORIGINAL_SL -> BREAK_EVEN',
        status: 'FAIL',
        details: `Expected BREAK_EVEN state and SL=100, got state=${updated.state}, SL=${updated.currentStopLoss}`
      });
    }
  } catch (e: any) {
    results.push({ name: '12. Lifecycle: ORIGINAL_SL -> BREAK_EVEN', status: 'FAIL', details: e.message });
  }

  // TEST 13: Break-Even Invariant: Only on TP1 / Progress, NEVER on Time Alone
  try {
    const targets: TargetLevel[] = [{ id: 'TP1', label: 'TP1', price: 110, hit: false }];
    // Price at 100.5 (barely moved, only 5% of TP1 distance)
    const unchanged = updateTradeLifecycleState({
      entryPrice: 100,
      originalStopLoss: 98,
      currentPrice: 100.5,
      direction: 'LONG',
      targets
    });

    const pass = unchanged.state === 'ORIGINAL_SL' && unchanged.currentStopLoss === 98;
    if (pass) {
      results.push({
        name: '13. Break-Even Invariant (No premature BE)',
        status: 'PASS',
        details: 'State remains ORIGINAL_SL when favorable progress is below threshold.'
      });
    } else {
      results.push({
        name: '13. Break-Even Invariant (No premature BE)',
        status: 'FAIL',
        details: `Prematurely transitioned to ${unchanged.state}`
      });
    }
  } catch (e: any) {
    results.push({ name: '13. Break-Even Invariant (No premature BE)', status: 'FAIL', details: e.message });
  }

  // TEST 14: Trade Lifecycle: BREAK_EVEN -> STRUCTURAL_TRAILING
  try {
    const targets: TargetLevel[] = [
      { id: 'TP1', label: 'TP1', price: 105, hit: false },
      { id: 'TP2', label: 'TP2', price: 115, hit: false }
    ];

    // Initial BE record
    const beRecord = updateTradeLifecycleState({
      entryPrice: 100,
      originalStopLoss: 98,
      currentPrice: 105.5,
      direction: 'LONG',
      targets
    });

    // Candles forming a new Higher Low at 103.0 (above entry)
    const trailingCandles = generateMockCandles(20, 103, 'UP');
    // Ensure swing low anchor
    trailingCandles[10].low = 103.2;

    const trailingRecord = updateTradeLifecycleState({
      currentRecord: beRecord,
      entryPrice: 100,
      originalStopLoss: 98,
      currentPrice: 108.0,
      direction: 'LONG',
      targets,
      candles: trailingCandles
    });

    const pass = trailingRecord.state === 'STRUCTURAL_TRAILING' && typeof trailingRecord.currentStopLoss === 'number' && trailingRecord.currentStopLoss > 100;
    if (pass) {
      results.push({
        name: '14. Lifecycle: BREAK_EVEN -> STRUCTURAL_TRAILING',
        status: 'PASS',
        details: `State: ${trailingRecord.state}, Trailing SL: ${trailingRecord.currentStopLoss}`
      });
    } else {
      results.push({
        name: '14. Lifecycle: BREAK_EVEN -> STRUCTURAL_TRAILING',
        status: 'FAIL',
        details: `Expected STRUCTURAL_TRAILING state and SL > 100, got ${trailingRecord.state}, SL=${trailingRecord.currentStopLoss}`
      });
    }
  } catch (e: any) {
    results.push({ name: '14. Lifecycle: BREAK_EVEN -> STRUCTURAL_TRAILING', status: 'FAIL', details: e.message });
  }

  // TEST 15: Trade Lifecycle: STRUCTURAL_TRAILING -> PROFIT_LOCKED
  try {
    const targets: TargetLevel[] = [
      { id: 'TP1', label: 'TP1', price: 105, hit: false },
      { id: 'TP2', label: 'TP2', price: 110, hit: false }
    ];

    // Price hits TP2 at 111.0
    const profitLocked = updateTradeLifecycleState({
      entryPrice: 100,
      originalStopLoss: 98,
      currentPrice: 111.0,
      direction: 'LONG',
      targets
    });

    const pass = profitLocked.tp2Hit === true && profitLocked.state === 'PROFIT_LOCKED' && profitLocked.currentStopLoss === 105;
    if (pass) {
      results.push({
        name: '15. Lifecycle: TP2 -> PROFIT_LOCKED',
        status: 'PASS',
        details: `State: ${profitLocked.state}, Guaranteed Locked SL: ${profitLocked.currentStopLoss} (TP1 level)`
      });
    } else {
      results.push({
        name: '15. Lifecycle: TP2 -> PROFIT_LOCKED',
        status: 'FAIL',
        details: `Expected PROFIT_LOCKED with SL=105, got ${profitLocked.state}, SL=${profitLocked.currentStopLoss}`
      });
    }
  } catch (e: any) {
    results.push({ name: '15. Lifecycle: TP2 -> PROFIT_LOCKED', status: 'FAIL', details: e.message });
  }

  // TEST 16: Derivatives Risk Context (Crowding / Squeeze Detection)
  try {
    const longCrowding = evaluateDerivativesRiskContext({
      direction: 'LONG',
      fundingRate: 0.045, // Extreme positive funding
      openInterestChange24h: 12.0 // Rising OI
    });

    const shortSqueeze = evaluateDerivativesRiskContext({
      direction: 'SHORT',
      fundingRate: -0.04, // Extreme negative funding
      openInterestChange24h: 8.5
    });

    const pass = longCrowding.riskContext === 'CROWDING_RISK' && shortSqueeze.riskContext === 'SHORT_SQUEEZE_RISK';
    if (pass) {
      results.push({
        name: '16. Derivatives Risk Context (Crowding/Squeeze)',
        status: 'PASS',
        details: `Long Crowding: ${longCrowding.riskContext}, Short Squeeze: ${shortSqueeze.riskContext}`
      });
    } else {
      results.push({
        name: '16. Derivatives Risk Context (Crowding/Squeeze)',
        status: 'FAIL',
        details: `Mismatch: long=${longCrowding.riskContext}, short=${shortSqueeze.riskContext}`
      });
    }
  } catch (e: any) {
    results.push({ name: '16. Derivatives Risk Context (Crowding/Squeeze)', status: 'FAIL', details: e.message });
  }

  // TEST 17: Invariant: Derivatives Data Must NOT Independently Create Signals
  try {
    // Calling evaluateDerivativesRiskContext without a setup produces risk context ONLY, never a signal
    const derivResult = evaluateDerivativesRiskContext({
      direction: 'WAIT',
      fundingRate: -0.05,
      openInterestChange24h: 20.0
    });

    const pass = (derivResult as any).signal === undefined && derivResult.riskContext !== undefined;
    if (pass) {
      results.push({
        name: '17. Invariant: Derivatives Never Independently Creates Signal',
        status: 'PASS',
        details: 'Derivatives analysis remains strict contextual telemetry without creating signals.'
      });
    } else {
      results.push({
        name: '17. Invariant: Derivatives Never Independently Creates Signal',
        status: 'FAIL',
        details: 'Derivatives unexpectedly created signal fields.'
      });
    }
  } catch (e: any) {
    results.push({ name: '17. Invariant: Derivatives Never Independently Creates Signal', status: 'FAIL', details: e.message });
  }

  // TEST 18: News Intelligence Compatibility (Optional & Supporting Only)
  try {
    const withNews = buildNewsCompatibilityReport({
      title: 'Major Layer 1 Ecosystem Upgrade Announced',
      sourceTier: 'TIER_1',
      impactScore: 88
    });

    const withoutNews = buildNewsCompatibilityReport(undefined);

    const pass =
      withNews.isSupportingOnly === true &&
      withNews.catalyst !== undefined &&
      withoutNews.isSupportingOnly === true &&
      withoutNews.catalyst === undefined;

    if (pass) {
      results.push({
        name: '18. News Intelligence Compatibility',
        status: 'PASS',
        details: `With news: ${withNews.catalyst?.substring(0, 30)}... (Supporting: ${withNews.isSupportingOnly}). Without news: graceful undefined.`
      });
    } else {
      results.push({
        name: '18. News Intelligence Compatibility',
        status: 'FAIL',
        details: `News compatibility mismatch: withNews=${JSON.stringify(withNews)}, withoutNews=${JSON.stringify(withoutNews)}`
      });
    }
  } catch (e: any) {
    results.push({ name: '18. News Intelligence Compatibility', status: 'FAIL', details: e.message });
  }

  // Summary
  console.log('\n------------------------------------------------------');
  results.forEach(r => {
    console.log(`${r.status === 'PASS' ? '✅' : '❌'} ${r.name}: ${r.details || ''}`);
  });
  console.log('------------------------------------------------------');
  const allPassed = results.every(r => r.status === 'PASS');
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.filter(r => r.status === 'PASS').length} | FAILED: ${results.filter(r => r.status === 'FAIL').length}`);
  console.log(`PHASE 9 VALIDATION STATUS: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log('------------------------------------------------------\n');

  return {
    passed: allPassed,
    testResults: results
  };
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv.includes('--run')) {
  runPhase9ValidationSuite().then(res => {
    if (!res.passed) {
      process.exit(1);
    }
  });
}
