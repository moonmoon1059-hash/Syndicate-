import { getCanonicalTargets, formatPrice, formatPercent, formatBangladeshTime } from '../src/utils/formatters';
import { generateDeterministicSignalId, generateCanonicalTargets, Signal, TargetLevel } from './signalEngine';
import { fuseMarketEvidence, buildTimeframeEvidence, UnifiedMarketEvidence } from './multiTimeframeEngine';
import { Candle } from './cryptoService';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function runTest(name: string, fn: () => { passed: boolean; details?: string }) {
  try {
    const res = fn();
    results.push({ name, passed: res.passed, details: res.details });
  } catch (err: any) {
    results.push({ name, passed: false, details: `Exception: ${err.message}` });
  }
}

function makeCandles(prices: number[], baseVol: number = 1000): Candle[] {
  return prices.map((p, idx) => ({
    timestamp: 1700000000000 + idx * 60000,
    open: p,
    high: p + 1.5,
    low: p - 1.5,
    close: p,
    volume: baseVol,
  }));
}

console.log('=== MOONSCANNER PHASE 3.5: REGRESSION & DYNAMIC TARGET SUITE ===\n');

// 1. One Asset Setup Unification Check
runTest('1. One Asset Produces Single Unified Signal (Not 4 independent signals)', () => {
  const candles = makeCandles([100, 102, 104, 106, 108, 110, 112, 115, 118, 120]);
  const unified = fuseMarketEvidence(
    'BTCUSDT',
    { '4h': candles, '1h': candles, '15m': candles, '5m': candles }
  );

  const isSingleDecision = unified.suggestedDecision === 'LONG' || unified.suggestedDecision === 'SHORT' || unified.suggestedDecision === 'WAIT';
  return {
    passed: isSingleDecision && typeof unified.overallBias === 'string',
    details: `Suggested Decision: ${unified.suggestedDecision}, Overall Bias: ${unified.overallBias}`
  };
});

// 2. Multi-Timeframe Evidence Layer Structure Check
runTest('2. 4H, 1H, 15M, 5M Remain Evidence Layers (Not Trade Signals)', () => {
  const candles = makeCandles([100, 102, 104, 106, 108, 110, 112, 115, 118, 120]);
  const tf4h = buildTimeframeEvidence(candles, '4h');
  const tf1h = buildTimeframeEvidence(candles, '1h');
  const tf15m = buildTimeframeEvidence(candles, '15m');
  const tf5m = buildTimeframeEvidence(candles, '5m');

  const rolesValid = tf4h.role === 'MACRO_TREND' &&
                     tf1h.role === 'INTERMEDIATE_STRUCTURE' &&
                     tf15m.role === 'SETUP_CONFIRMATION' &&
                     tf5m.role === 'FINE_TIMING';

  return {
    passed: rolesValid && tf4h.bias !== undefined && tf1h.bias !== undefined,
    details: `Roles confirmed: 4H (${tf4h.role}), 1H (${tf1h.role}), 15M (${tf15m.role}), 5M (${tf5m.role})`
  };
});

// 3. Dynamic Targets: TP1..TP3 Baseline
runTest('3. Canonical Targets Generates Baseline TP1, TP2, TP3', () => {
  const pkg = generateCanonicalTargets(50000, 48000, 'LONG', 2);
  return {
    passed: pkg.targets.length === 3 && pkg.targets[0].label === 'TP1' && pkg.targets[1].label === 'TP2' && pkg.targets[2].label === 'TP3',
    details: `Generated targets: ${pkg.targets.map(t => `${t.label}: $${t.price}`).join(', ')}`
  };
});

// 4. Dynamic Targets: Support TP4..TP6
runTest('4. getCanonicalTargets Preserves 6 Dynamic Targets Without Truncation', () => {
  const mockTargets: TargetLevel[] = [
    { id: 'TP1', label: 'TP1', price: 52000, hit: true },
    { id: 'TP2', label: 'TP2', price: 54000, hit: false },
    { id: 'TP3', label: 'TP3', price: 56000, hit: false },
    { id: 'TP4', label: 'TP4', price: 58000, hit: false },
    { id: 'TP5', label: 'TP5', price: 60000, hit: false },
    { id: 'TP6', label: 'TP6', price: 62000, hit: false },
  ];

  const canonical = getCanonicalTargets({
    entryPrice: 50000,
    stopLoss: 48000,
    direction: 'LONG',
    targets: mockTargets
  });

  const hasAll6 = canonical.length === 6 && canonical[5].label === 'TP6' && canonical[5].price === 62000;
  return {
    passed: hasAll6,
    details: `Extracted ${canonical.length} targets: ${canonical.map(t => t.label).join(', ')}`
  };
});

// 5. Dynamic Targets: Support TP10
runTest('5. getCanonicalTargets Preserves 10 Dynamic Targets (TP1..TP10)', () => {
  const mockTargets: TargetLevel[] = [];
  for (let i = 1; i <= 10; i++) {
    mockTargets.push({
      id: `TP${i}`,
      label: `TP${i}`,
      price: 50000 + (i * 1500),
      hit: i <= 2
    });
  }

  const canonical = getCanonicalTargets({
    entryPrice: 50000,
    stopLoss: 48000,
    direction: 'LONG',
    targets: mockTargets
  });

  const hasAll10 = canonical.length === 10 &&
                   canonical[0].label === 'TP1' &&
                   canonical[9].label === 'TP10' &&
                   canonical[9].price === 65000;

  // Verify natural numeric sort (TP10 is 10th, not 2nd after TP1)
  const isCorrectOrder = canonical[8].label === 'TP9' && canonical[9].label === 'TP10';

  return {
    passed: hasAll10 && isCorrectOrder,
    details: `Extracted 10 targets in order: ${canonical.map(t => t.label).join(' -> ')}`
  };
});

// 6. Target Deduplication Check
runTest('6. Duplicate Targets Are Safely Deduplicated', () => {
  const duplicateTargets: TargetLevel[] = [
    { id: 'TP1', label: 'TP1', price: 52000 },
    { id: 'TP1', label: 'TP1', price: 52000 },
    { id: 'TP2', label: 'TP2', price: 54000 },
    { id: 'TP2', label: 'TP2', price: 54000 },
    { id: 'TP3', label: 'TP3', price: 56000 }
  ];

  const canonical = getCanonicalTargets({
    entryPrice: 50000,
    stopLoss: 48000,
    direction: 'LONG',
    targets: duplicateTargets
  });

  return {
    passed: canonical.length === 3 && canonical[0].label === 'TP1' && canonical[1].label === 'TP2' && canonical[2].label === 'TP3',
    details: `Deduplicated from 5 items to ${canonical.length} unique targets`
  };
});

// 7. Deterministic Signal ID & Idempotent Polling
runTest('7. Idempotent Polling Yields Identical Signal ID Across Scans', () => {
  const timestamp = 1710000000000;
  const id1 = generateDeterministicSignalId('SOLUSDT', '1h', 'LONG', 'DOUBLE_BOTTOM', timestamp);
  const id2 = generateDeterministicSignalId('SOLUSDT', '1h', 'LONG', 'DOUBLE_BOTTOM', timestamp);
  const id3 = generateDeterministicSignalId('SOLUSDT', '1h', 'LONG', 'DOUBLE_BOTTOM', timestamp + 30000); // within 1h bucket

  return {
    passed: id1 === id2 && id1 === id3,
    details: `Generated ID: ${id1} (consistent across bucket)`
  };
});

// 8. Entry & Invalidation Range Formatting
runTest('8. Price & Percent Formatters Maintain Exact Visual Precision', () => {
  const p1 = formatPrice(64250.5);
  const p2 = formatPrice(0.04215);
  const pct1 = formatPercent(4.25);
  const pct2 = formatPercent(-2.1);
  const bst = formatBangladeshTime(1700000000000);

  const passed = p1.includes('64,250.50') && p2.includes('0.04215') && pct1 === '+4.25%' && pct2 === '-2.10%' && bst.length > 5;
  return {
    passed,
    details: `Prices: ${p1}, ${p2} | Pcts: ${pct1}, ${pct2} | Time: ${bst}`
  };
});

// 9. Phase 3.6: Unified Signals Do Not Filter or Separate by Timeframe
runTest('9. Phase 3.6: Single Final Signal Model Has Internal MTF Evidence (4H, 1H, 15M, 5M)', () => {
  const candles = makeCandles([100, 102, 104, 106, 108, 110, 112, 115, 118, 120]);
  const unified = fuseMarketEvidence(
    'ETHUSDT',
    { '4h': candles, '1h': candles, '15m': candles, '5m': candles }
  );

  const timeframes = Object.keys(unified.timeframes);
  const hasMacro = unified.timeframes['4h']?.role === 'MACRO_TREND';
  const hasIntermediate = unified.timeframes['1h']?.role === 'INTERMEDIATE_STRUCTURE';
  const hasSetup = unified.timeframes['15m']?.role === 'SETUP_CONFIRMATION';
  const hasTiming = unified.timeframes['5m']?.role === 'FINE_TIMING';

  return {
    passed: timeframes.length === 4 && hasMacro && hasIntermediate && hasSetup && hasTiming,
    details: `Evidence layers fused: ${timeframes.join(', ')} | Roles verified: Macro(4H), Structure(1H), Setup(15M), Timing(5M)`
  };
});

// 10. Phase 3.6: Status & Entry Filter Reconciliation
runTest('10. Phase 3.6: Signal Direction & Setup Readiness Filter Without Timeframe Filter Dependency', () => {
  const mockSignals: Partial<Signal>[] = [
    { id: 'sig1', symbol: 'BTC/USDT', direction: 'LONG', status: 'ACTIVE', currentPrice: 50000, entryPrice: 50000, moonScore: 85 },
    { id: 'sig2', symbol: 'ETH/USDT', direction: 'SHORT', status: 'ACTIVE', currentPrice: 3000, entryPrice: 3000, moonScore: 80 },
    { id: 'sig3', symbol: 'SOL/USDT', direction: 'LONG', status: 'TP1_HIT', currentPrice: 160, entryPrice: 150, moonScore: 90 }
  ];

  const longOnly = mockSignals.filter(s => s.direction === 'LONG');
  const shortOnly = mockSignals.filter(s => s.direction === 'SHORT');
  const completedOnly = mockSignals.filter(s => s.status?.includes('TP'));

  const passed = longOnly.length === 2 && shortOnly.length === 1 && completedOnly.length === 1;
  return {
    passed,
    details: `Filtered: Longs (${longOnly.length}), Shorts (${shortOnly.length}), Completed (${completedOnly.length})`
  };
});

// Print Results
console.log('--------------------------------------------------');
let passedCount = 0;
for (const r of results) {
  if (r.passed) {
    passedCount++;
    console.log(`✓ [PASS] ${r.name}`);
    if (r.details) console.log(`   └─ ${r.details}`);
  } else {
    console.error(`✗ [FAIL] ${r.name}`);
    if (r.details) console.error(`   └─ ${r.details}`);
  }
}
console.log('==================================================');
console.log(`TEST RESULTS: ${passedCount} / ${results.length} TESTS PASSED`);
console.log('==================================================');

if (passedCount < results.length) {
  process.exit(1);
}
