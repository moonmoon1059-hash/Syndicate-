/**
 * Dedicated Test Suite:
 * - BINANCE_ONLY_MODE verification
 * - Live Price Consistency Firewall (<= 2.0% divergence)
 * - Telegram Gate Target Ladder & Stop Loss Invariant
 * - Signal Tracker Invalidation & Entry Bounds
 */

import {
  BINANCE_ONLY_MODE,
  isBinanceOnlyMode,
  validateLivePriceConsistency,
  validateEntryPriceConsistency,
  validateCandleDataFreshness
} from './liveDataProvider';
import {
  validateTpLadder,
  qualifyTelegramCandidate,
  validateTelegramFinalFirewall
} from './telegramAlertEngine';
import { upsertSignals, getAllStoredSignals, clearStoredSignals } from './signalTracker';
import { Candle, Signal } from '../src/types/crypto';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`[PASS] ${msg}`);
    passed++;
  } else {
    console.error(`[FAIL] ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('⚡ BINANCE ONLY MODE & TELEGRAM GATE AUDIT VERIFICATION');
  console.log('================================================================\n');

  // 1. BINANCE_ONLY_MODE Check
  console.log('--- Test 1: Binance Only Mode ---');
  assert(BINANCE_ONLY_MODE === true, 'BINANCE_ONLY_MODE constant is strictly true');
  assert(isBinanceOnlyMode() === true, 'isBinanceOnlyMode() returns true');

  // 2. Price Consistency Firewall
  console.log('\n--- Test 2: Live Price Consistency Firewall (<= 2.0%) ---');
  const matchResult = validateLivePriceConsistency(100.0, 100.5, 2.0);
  assert(matchResult.isConsistent === true, '0.5% divergence passes consistency firewall');
  assert(matchResult.divergencePct <= 2.0, `Divergence is ${matchResult.divergencePct.toFixed(2)}% <= 2.0%`);

  const boundaryResult = validateLivePriceConsistency(100.0, 102.0, 2.0);
  assert(boundaryResult.isConsistent === true, '2.0% boundary divergence passes');

  const breachResult = validateLivePriceConsistency(100.0, 103.5, 2.0);
  assert(breachResult.isConsistent === false, '3.5% divergence rejected by firewall');
  assert(breachResult.rejectReason?.includes('PRICE_DIVERGENCE_EXCEEDED') === true, 'Rejection reason explicitly recorded');

  // Invalid values protection
  const invalidPriceResult = validateLivePriceConsistency(0, 100, 2.0);
  assert(invalidPriceResult.isConsistent === false, 'Zero live price rejected');

  // 3. Candle Freshness Validation
  console.log('\n--- Test 3: Candle Freshness Validation ---');
  const now = Date.now();
  const validCandles: Candle[] = Array.from({ length: 30 }, (_, i) => ({
    timestamp: now - (30 - i) * 60 * 60 * 1000,
    open: 100 + i,
    high: 105 + i,
    low: 95 + i,
    close: 101 + i,
    volume: 1000
  }));
  const freshResult = validateCandleDataFreshness(validCandles, '1h');
  assert(freshResult.isValid === true, 'Live chronological 1h candles valid');

  // Stale candles test (> 3h for 1h candles)
  const staleCandles: Candle[] = Array.from({ length: 30 }, (_, i) => ({
    timestamp: now - (35 - i) * 60 * 60 * 1000, // latest candle is 5h old
    open: 100 + i,
    high: 105 + i,
    low: 95 + i,
    close: 101 + i,
    volume: 1000
  }));
  const staleResult = validateCandleDataFreshness(staleCandles, '1h');
  assert(staleResult.isValid === false, 'Stale 1h candles (> 3h old) strictly rejected');
  assert(staleResult.rejectReason?.includes('CANDLES_STALE') === true, 'Stale rejection reason returned');

  // 4. Telegram Target Ladder & Stop Loss Invariant
  console.log('\n--- Test 4: Telegram Target Ladder & Stop Loss Invariant ---');

  // LONG VALID: SL < EntryLow <= EntryHigh < TP1 < TP2
  const validLong = validateTpLadder(
    'LONG',
    98,
    102,
    95,
    [
      { label: 'TP1', price: 110, percentage: 10 },
      { label: 'TP2', price: 120, percentage: 20 }
    ]
  );
  assert(validLong.isValid === true, 'Valid LONG setup (SL 95 < Entry 98-102 < TP1 110 < TP2 120) passes');

  // LONG INVALID: StopLoss >= EntryLow
  const invalidLongSL = validateTpLadder(
    'LONG',
    98,
    102,
    99, // SL 99 >= EntryLow 98
    [
      { label: 'TP1', price: 110, percentage: 10 },
      { label: 'TP2', price: 120, percentage: 20 }
    ]
  );
  assert(invalidLongSL.isValid === false, 'LONG with inverted SL >= EntryLow strictly rejected');
  assert(invalidLongSL.rejectReason?.includes('LONG_SL_MUST_BE_BELOW_ENTRY') === true, 'LONG SL rejection reason recorded');

  // LONG INVALID: TP1 <= EntryHigh
  const invalidLongTP = validateTpLadder(
    'LONG',
    98,
    102,
    95,
    [
      { label: 'TP1', price: 95, percentage: -5 }, // TP1 95 <= EntryMid 100
      { label: 'TP2', price: 110, percentage: 10 }
    ]
  );
  assert(invalidLongTP.isValid === false, 'LONG with inverted TP1 <= Entry strictly rejected');
  assert(invalidLongTP.rejectReason?.includes('LONG_TP1_MUST_BE_ABOVE_ENTRY') === true, 'LONG TP1 below entry rejected');

  // SHORT VALID: SL > EntryHigh >= EntryLow > TP1 > TP2
  const validShort = validateTpLadder(
    'SHORT',
    98,
    102,
    105,
    [
      { label: 'TP1', price: 90, percentage: 10 },
      { label: 'TP2', price: 80, percentage: 20 }
    ]
  );
  assert(validShort.isValid === true, 'Valid SHORT setup (SL 105 > Entry 102-98 > TP1 90 > TP2 80) passes');

  // SHORT INVALID: StopLoss <= EntryHigh
  const invalidShortSL = validateTpLadder(
    'SHORT',
    98,
    102,
    101, // SL 101 <= EntryHigh 102
    [
      { label: 'TP1', price: 90, percentage: 10 },
      { label: 'TP2', price: 80, percentage: 20 }
    ]
  );
  assert(invalidShortSL.isValid === false, 'SHORT with inverted SL <= EntryHigh strictly rejected');
  assert(invalidShortSL.rejectReason?.includes('SHORT_SL_MUST_BE_ABOVE_ENTRY') === true, 'SHORT SL rejection reason recorded');

  // SHORT INVALID: TP1 >= EntryLow
  const invalidShortTP = validateTpLadder(
    'SHORT',
    98,
    102,
    108,
    [
      { label: 'TP1', price: 105, percentage: 5 }, // TP1 105 >= EntryMid 100
      { label: 'TP2', price: 90, percentage: 10 }
    ]
  );
  assert(invalidShortTP.isValid === false, 'SHORT with inverted TP1 >= Entry strictly rejected');
  assert(invalidShortTP.rejectReason?.includes('SHORT_TP1_MUST_BE_BELOW_ENTRY') === true, 'SHORT TP1 rejection reason recorded');

  // =========================================================================
  // 5. Bug 1 Regression: Live Entry Price Consistency (XMR-Style Wrong Entry Bug)
  // =========================================================================
  console.log('\n--- Test 5: Bug 1 Regression: Live Entry Price Consistency (XMR-Style) ---');
  
  // Case A: Live price 500 vs Entry zone 98-102 (e.g. XMR historical entry vs live price)
  const xmrBugResult = validateEntryPriceConsistency(500.0, 98.0, 102.0, 4.0);
  assert(xmrBugResult.isConsistent === false, 'XMR-style gross entry divergence (500 live vs 100 entry) strictly rejected');
  assert(xmrBugResult.rejectReason?.includes('ENTRY_PRICE_DIVERGENCE_EXCEEDED') === true, 'Rejection reason explicitly flags divergence');
  assert(xmrBugResult.divergencePct >= 100, `Divergence is ${xmrBugResult.divergencePct.toFixed(1)}%`);

  // Case B: Live price within valid tolerance (101.5 vs 98-102)
  const validEntryResult = validateEntryPriceConsistency(101.5, 98.0, 102.0, 4.0);
  assert(validEntryResult.isConsistent === true, 'Live price matching entry zone (101.5 vs 98-102) passes');
  assert(validEntryResult.divergencePct <= 4.0, `Divergence is ${validEntryResult.divergencePct.toFixed(2)}% <= 4.0%`);

  // Case C: 5% divergence (> 4.0% threshold)
  const slightDriftResult = validateEntryPriceConsistency(105.0, 99.0, 101.0, 4.0);
  assert(slightDriftResult.isConsistent === false, '5.0% live-to-entry drift exceeds 4.0% tolerance and is rejected');

  // Case D: validateTelegramFinalFirewall blocks XMR-style signal
  const xmrFirewallResult = validateTelegramFinalFirewall({
    symbol: 'XMRUSDT',
    direction: 'LONG',
    entryLow: 98,
    entryHigh: 102,
    currentPrice: 500, // Live Binance price has surged to 500 while entry was 100
    stopLoss: 95,
    targets: [
      { label: 'TP1', price: 140, percentage: 40 }
    ],
    expectedMovePct: 40,
    riskRewardRatio: 3.0,
    qualityGrade: 'A+',
    confidence: 90,
    sourceType: 'TEST',
    alertType: 'MAJOR_MOVE'
  });
  assert(xmrFirewallResult.allowed === false, 'validateTelegramFinalFirewall strictly blocks XMR-style price divergence');
  assert(xmrFirewallResult.reason.includes('LIVE_ENTRY_PRICE_DIVERGENCE_EXCEEDED') || xmrFirewallResult.reason.includes('ENTRY_MISSED'), 'Firewall records divergence/missed entry rejection');

  // =========================================================================
  // 6. Bug 2 Regression: Telegram Small-Move Flood (WAXP & LITE Style)
  // =========================================================================
  console.log('\n--- Test 6: Bug 2 Regression: Telegram Small-Move Flood (WAXP & LITE Style) ---');

  // WAXPUSDT SHORT: Entry 0.00494-0.00501, TP4 0.00457 (+7.54% move) - Ordinary signal
  const waxpSignal: Partial<Signal> = {
    id: 'WAXPUSDT-SHORT-001',
    symbol: 'WAXPUSDT',
    direction: 'SHORT',
    entryPrice: 0.004975,
    entryZoneLow: 0.00494,
    entryZoneHigh: 0.00501,
    currentPrice: 0.004975,
    stopLoss: 0.00520,
    targets: [
      { id: 'TP1', label: 'TP1', price: 0.00493, percentage: 0.90 },
      { id: 'TP2', label: 'TP2', price: 0.00488, percentage: 1.91 },
      { id: 'TP3', label: 'TP3', price: 0.00465, percentage: 6.53 },
      { id: 'TP4', label: 'TP4', price: 0.00457, percentage: 7.54 }
    ],
    qualityGrade: 'A',
    actionablePriority: 'ROUTINE' as any,
    dumpHunter: {
      stage: 'DUMP_EXPANSION',
      dumpTriggered: true,
      dumpScore: 85
    } as any
  };

  const waxpQualResult = qualifyTelegramCandidate(waxpSignal as Signal);
  assert(waxpQualResult.qualified === false, 'WAXPUSDT SHORT (+7.54% small move) is disqualified by qualifyTelegramCandidate');
  assert(waxpQualResult.reason?.includes('FIREWALL_BLOCKED') === true, 'WAXP disqualified with FIREWALL_BLOCKED reason');

  const waxpFirewallResult = validateTelegramFinalFirewall({
    symbol: 'WAXPUSDT',
    direction: 'SHORT',
    entryLow: 0.00494,
    entryHigh: 0.00501,
    currentPrice: 0.004975,
    stopLoss: 0.00520,
    targets: waxpSignal.targets!,
    expectedMovePct: 7.54,
    riskRewardRatio: 2.2,
    qualityGrade: 'A',
    confidence: 85,
    sourceType: 'TEST',
    alertType: 'MAJOR_MOVE',
    signal: waxpSignal as Signal
  });
  assert(waxpFirewallResult.allowed === false, 'validateTelegramFinalFirewall strictly blocks WAXPUSDT (+7.54% small move)');
  assert(waxpFirewallResult.reason.includes('FIREWALL_BLOCKED'), 'Firewall reason records FIREWALL_BLOCKED');

  // LITEUSDT SHORT: Entry 854.84-856.82, TP4 826.37 (+3.33% move) - Ordinary signal
  const liteSignal: Partial<Signal> = {
    id: 'LITEUSDT-SHORT-001',
    symbol: 'LITEUSDT',
    direction: 'SHORT',
    entryPrice: 855.83,
    entryZoneLow: 854.84,
    entryZoneHigh: 856.82,
    currentPrice: 855.83,
    stopLoss: 875.00,
    targets: [
      { id: 'TP1', label: 'TP1', price: 838.03, percentage: 2.08 },
      { id: 'TP2', label: 'TP2', price: 835.20, percentage: 2.41 },
      { id: 'TP3', label: 'TP3', price: 832.64, percentage: 2.71 },
      { id: 'TP4', label: 'TP4', price: 827.33, percentage: 3.33 }
    ],
    qualityGrade: 'A+',
    actionablePriority: 'ROUTINE' as any
  };

  const liteQualResult = qualifyTelegramCandidate(liteSignal as Signal);
  assert(liteQualResult.qualified === false, 'LITEUSDT SHORT (+3.33% small move) is disqualified by qualifyTelegramCandidate');

  const liteFirewallResult = validateTelegramFinalFirewall({
    symbol: 'LITEUSDT',
    direction: 'SHORT',
    entryLow: 854.84,
    entryHigh: 856.82,
    currentPrice: 855.83,
    stopLoss: 875.00,
    targets: liteSignal.targets!,
    expectedMovePct: 3.33,
    riskRewardRatio: 2.5,
    qualityGrade: 'A+',
    confidence: 88,
    sourceType: 'TEST',
    alertType: 'MAJOR_MOVE',
    signal: liteSignal as Signal
  });
  assert(liteFirewallResult.allowed === false, 'validateTelegramFinalFirewall strictly blocks LITEUSDT (+3.33% small move)');

  // =========================================================================
  // 7. Exceptional 30%+ Signal Qualification & Dispatch
  // =========================================================================
  console.log('\n--- Test 7: Exceptional 30%+ Signal Qualification & Dispatch ---');

  const exceptionalBigMove: Partial<Signal> = {
    id: 'SOLUSDT-LONG-BIGMOVE',
    symbol: 'SOLUSDT',
    direction: 'LONG',
    entryPrice: 100.0,
    entryZoneLow: 99.0,
    entryZoneHigh: 101.0,
    currentPrice: 100.2,
    stopLoss: 94.0,
    targets: [
      { id: 'TP1', label: 'TP1', price: 110.0, percentage: 10.0 },
      { id: 'TP2', label: 'TP2', price: 120.0, percentage: 20.0 },
      { id: 'TP3', label: 'TP3', price: 135.0, percentage: 35.0 }
    ],
    qualityGrade: 'A+',
    riskRewardRatio: 3.5,
    bigMoveHunter: {
      stage: 'EXPLOSIVE',
      expansionScore: 92,
      predictedMovePct: 35.0
    } as any
  };

  const exceptionalQual = qualifyTelegramCandidate(exceptionalBigMove as Signal);
  assert(exceptionalQual.qualified === true, 'Exceptional 35% Big Move qualifies for Telegram');

  const exceptionalFirewall = validateTelegramFinalFirewall({
    symbol: 'SOLUSDT',
    direction: 'LONG',
    entryLow: 99.0,
    entryHigh: 101.0,
    currentPrice: 100.2,
    stopLoss: 94.0,
    targets: exceptionalBigMove.targets!,
    expectedMovePct: 35.0,
    riskRewardRatio: 3.5,
    qualityGrade: 'A+',
    confidence: 92,
    sourceType: 'BIG_MOVE_HUNTER',
    alertType: 'MAJOR_MOVE',
    signal: exceptionalBigMove as Signal
  });
  assert(exceptionalFirewall.allowed === true, 'Exceptional 35% Big Move allowed through Telegram Final Firewall');
  assert(exceptionalFirewall.archetype === 'BIG_MOVE_HUNTER', 'Correct archetype assigned');

  // =========================================================================
  // 8. Signal Tracker Gross Price Drift Protection
  // =========================================================================
  console.log('\n--- Test 8: Signal Tracker Gross Price Drift Protection ---');
  clearStoredSignals();

  // New signal with gross price drift (> 5%)
  const driftedNewSignal: Partial<Signal> = {
    id: 'TEST-DRIFT-001',
    symbol: 'DRIFTUSDT',
    direction: 'LONG',
    entryPrice: 100.0,
    currentPrice: 120.0, // 20% drift
    stopLoss: 95.0,
    targets: [{ id: 'TP1', label: 'TP1', price: 140, percentage: 40 }],
    status: 'ACTIVE',
    qualityGrade: 'A'
  };

  upsertSignals([driftedNewSignal as Signal]);
  const stored = getAllStoredSignals();
  const found = stored.find(s => s.symbol === 'DRIFTUSDT');
  assert(found !== undefined, 'Signal stored in tracker');
  assert(found?.status === 'INVALIDATED', 'Signal with > 5% drift from entry is marked INVALIDATED');
  assert(found?.invalidationReason?.includes('GROSS_PRICE_MISMATCH') === true, 'Invalidation reason records GROSS_PRICE_MISMATCH');

  // =========================================================================
  // 9. Bug Regression: Pre-Move Small Move Suppression & Bearish Classification
  // =========================================================================
  console.log('\n--- Test 9: Pre-Move Small Move Suppression & Bearish Classification ---');
  
  // TKOUSDT style: tagged as pre-move but terminal target ladder only offers +4.7%
  const tkoPreMoveSignal: Partial<Signal> = {
    id: 'sig_TKOUSDT_1h_SHORT_PREMOVE_1789545600000',
    symbol: 'TKOUSDT',
    direction: 'SHORT',
    entryPrice: 0.32,
    currentPrice: 0.32,
    stopLoss: 0.33,
    targets: [
      { id: 'TP1', label: 'TP1', price: 0.315, percentage: 1.5 },
      { id: 'TP2', label: 'TP2', price: 0.305, percentage: 4.7 }
    ],
    qualityGrade: 'A',
    confidence: 85,
    riskRewardRatio: 2.5,
    isPreMove: true,
    largeMoveClass: 'EXCEPTIONAL_30_PLUS',
    expectedMovePct: 4.7,
    preMoveReport: {
      symbol: 'TKOUSDT',
      timeframe: '1H',
      timestamp: Date.now(),
      isCoiling: true,
      coilScore: 78,
      compressionRatio: 45,
      atrExpansionRatio: 0.8,
      volatilitySqueeze: true,
      largeMoveClass: 'EXCEPTIONAL_30_PLUS',
      largeMovePotentialLabel: 'EXCEPTIONAL DUMP (30%+)',
      isExtremeCandidate: true,
      setupStage: 'TRIGGERED',
      expansionEvidenceScore: 70,
      breakoutDirection: 'DOWN',
      projectedDirection: 'BEARISH',
      supportCluster: 0.305,
      resistanceCluster: 0.33,
      noChaseLevel: 0.31,
      recommendedAction: 'PREPARE_BREAKOUT',
      detailedState: 'BIG_DUMP_COMING'
    } as any
  };

  const tkoQual = qualifyTelegramCandidate(tkoPreMoveSignal as Signal);
  assert(tkoQual.qualified === false, 'TKOUSDT (+4.7% small move Pre-Move) is disqualified from Telegram');
  assert(tkoQual.reason.includes('FIREWALL_BLOCKED_ORDINARY_SMALL_MOVE') === true, 'Disqualification reason cites ordinary small move suppression');

  // SPELLUSDT style: tagged as pre-move with 4.7% target ladder
  const spellPreMoveSignal: Partial<Signal> = {
    id: 'sig_SPELLUSDT_1h_SHORT_PREMOVE_1789545600000',
    symbol: 'SPELLUSDT',
    direction: 'SHORT',
    entryPrice: 0.00064,
    currentPrice: 0.00064,
    stopLoss: 0.00066,
    targets: [
      { id: 'TP1', label: 'TP1', price: 0.00062, percentage: 3.1 },
      { id: 'TP2', label: 'TP2', price: 0.00061, percentage: 4.7 }
    ],
    qualityGrade: 'A',
    confidence: 85,
    riskRewardRatio: 2.2,
    isPreMove: true,
    largeMoveClass: 'EXCEPTIONAL_30_PLUS',
    expectedMovePct: 4.7,
    preMoveReport: {
      symbol: 'SPELLUSDT',
      timeframe: '1H',
      timestamp: Date.now(),
      isCoiling: true,
      coilScore: 75,
      compressionRatio: 40,
      atrExpansionRatio: 0.85,
      volatilitySqueeze: true,
      largeMoveClass: 'EXCEPTIONAL_30_PLUS',
      largeMovePotentialLabel: 'EXCEPTIONAL DUMP (30%+)',
      isExtremeCandidate: false,
      setupStage: 'READY_TO_BREAK',
      expansionEvidenceScore: 65,
      breakoutDirection: 'DOWN',
      projectedDirection: 'BEARISH',
      supportCluster: 0.00061,
      resistanceCluster: 0.00066,
      noChaseLevel: 0.00062,
      recommendedAction: 'PREPARE_BREAKOUT',
      detailedState: 'BIG_DUMP_COMING'
    } as any
  };

  const spellQual = qualifyTelegramCandidate(spellPreMoveSignal as Signal);
  assert(spellQual.qualified === false, 'SPELLUSDT (+4.7% small move Pre-Move) is disqualified from Telegram');

  // Genuine Exceptional Pre-Move with +35% move
  const genuinePreMoveSignal: Partial<Signal> = {
    id: 'sig_GENUINE_1h_LONG_PREMOVE_1789545600000',
    symbol: 'GENUINEUSDT',
    direction: 'LONG',
    entryPrice: 1.00,
    currentPrice: 1.00,
    stopLoss: 0.96,
    targets: [
      { id: 'TP1', label: 'TP1', price: 1.15, percentage: 15.0 },
      { id: 'TP2', label: 'TP2', price: 1.35, percentage: 35.0 }
    ],
    qualityGrade: 'A+',
    confidence: 90,
    riskRewardRatio: 3.5,
    isPreMove: true,
    largeMoveClass: 'EXCEPTIONAL_30_PLUS',
    expectedMovePct: 35.0,
    preMoveReport: {
      symbol: 'GENUINEUSDT',
      timeframe: '1H',
      timestamp: Date.now(),
      isCoiling: true,
      coilScore: 82,
      compressionRatio: 50,
      atrExpansionRatio: 0.6,
      volatilitySqueeze: true,
      largeMoveClass: 'EXCEPTIONAL_30_PLUS',
      largeMovePotentialLabel: 'EXCEPTIONAL 30+ POTENTIAL',
      isExtremeCandidate: true,
      setupStage: 'READY_TO_BREAK',
      expansionEvidenceScore: 75,
      breakoutDirection: 'UP',
      projectedDirection: 'BULLISH',
      supportCluster: 0.96,
      resistanceCluster: 1.05,
      noChaseLevel: 1.04,
      recommendedAction: 'PREPARE_BREAKOUT',
      detailedState: 'BIG_MOVE_COMING'
    } as any
  };

  const genuineQual = qualifyTelegramCandidate(genuinePreMoveSignal as Signal);
  assert(genuineQual.qualified === true, 'Genuine +35% Exceptional Pre-Move qualifies for Telegram');
  assert(genuineQual.isPreMoveSignal === true, 'Identified as Pre-Move signal');

  // --- Test 10: Multi-Timeframe Current Price Anchoring ---
  console.log('\n--- Test 10: Multi-Timeframe Current Price Anchoring ---');
  const { fuseMarketEvidence } = await import('./multiTimeframeEngine');
  const mockCandles: Candle[] = [];
  const baseTime = 1700000000000;
  // Generate mock candles with EMA20 clearly different from latest close
  for (let i = 0; i < 50; i++) {
    const p = 100 + i;
    mockCandles.push({
      timestamp: baseTime + i * 3600000,
      open: p,
      high: p + 1,
      low: p - 1,
      close: p,
      volume: 1000
    });
  }
  // Make the last candle close at 250 (while EMA20 will be around 140)
  mockCandles[mockCandles.length - 1].close = 250;
  const mtfResult = fuseMarketEvidence('BTCUSDT', { '1h': mockCandles });
  assert(mtfResult.currentPrice === 250, `MTF currentPrice (${mtfResult.currentPrice}) anchored strictly to latest close (250), NOT EMA20`);

  // --- Test 11: Zero Synthetic Target Fallback (No Structural Candidates -> Empty Targets) ---
  console.log('\n--- Test 11: Structural Target Invariant (No Fake ATR Targets) ---');
  const { generateDynamicTargets } = await import('./tradeManagementEngine');
  const emptyLadder = generateDynamicTargets({
    direction: 'LONG',
    entryPrice: 100,
    stopLoss: 95,
    atr: 2.0,
    candles: [],
    keyLevelsInDirection: [],
    liquidityPools: [],
    fairValueGaps: [],
    orderBlocks: []
  });
  assert(emptyLadder.targets.length === 0, 'Zero structural candidates returns exactly 0 targets (no synthetic ATR expansion)');
  assert(emptyLadder.totalTargetCount === 0, 'totalTargetCount is 0 when no structural targets exist');

  // --- Test 12: Stale Signal Eviction and Actionable Feed Invariant ---
  console.log('\n--- Test 12: Stale Signal Eviction & Actionable Feed Invariant ---');
  const {
    isSignalActionable,
    invalidateStoredSignal,
    getActionableStoredSignals,
    getStoredSignalBySymbol
  } = await import('./signalTracker');

  clearStoredSignals();

  // Create an old signal: Entry 100, live 100
  const oldSignal: Signal = {
    id: 'sig_XMR_OLD',
    symbol: 'XMRUSDT',
    direction: 'LONG',
    entryPrice: 100,
    currentPrice: 100,
    stopLoss: 95,
    targets: [{ id: 'TP1', label: 'TP1', price: 120, percentage: 20 }],
    qualityGrade: 'A',
    confidence: 85,
    status: 'ACTIVE',
    actionablePriority: 'ENTRY_NOW',
    entryStatus: 'ENTRY_NOW',
    createdAt: Date.now() - 3600000
  } as Signal;

  upsertSignals([oldSignal]);
  assert(isSignalActionable(oldSignal) === true, 'Fresh coherent signal is actionable');
  let actionableList = getActionableStoredSignals();
  assert(actionableList.length === 1, 'Actionable signal feed contains 1 signal');

  // Scenario 1: Gross price drift (e.g. live price moves to 500 while entry was 100)
  oldSignal.currentPrice = 500;
  assert(isSignalActionable(oldSignal) === false, 'Signal with 400% price drift is rejected as non-actionable');
  actionableList = getActionableStoredSignals();
  assert(actionableList.length === 0, 'getActionableStoredSignals() drops drifted signal');

  // Scenario 2: Explicit invalidation when new scan produces WAIT or null
  invalidateStoredSignal('XMRUSDT', 'SCAN_REJECTED_NEW_SETUP: Core intelligence returned WAIT');
  const storedAfterInvalidation = getStoredSignalBySymbol('XMRUSDT');
  assert(storedAfterInvalidation?.status === 'INVALIDATED', 'Stored signal status marked INVALIDATED');
  assert(storedAfterInvalidation?.actionablePriority === 'INVALIDATED_EXPIRED', 'Stored signal priority marked INVALIDATED_EXPIRED');
  assert(isSignalActionable(storedAfterInvalidation) === false, 'Invalidated signal is not actionable');
  actionableList = getActionableStoredSignals();
  assert(actionableList.length === 0, 'Invalidated signal excluded from getActionableStoredSignals()');

  // --- Test 13: Entry Drift Firewall - Missed Entry Protection (VIRTUAL / ENA Regression) ---
  console.log('\n--- Test 13: Entry Drift Firewall - Missed Entry Protection (VIRTUAL / ENA Regression) ---');
  
  // VIRTUALUSDT: Entry 0.6385–0.6423, Live price 0.66 (surged +2.7% above entryHigh)
  const virtualFirewall = validateTelegramFinalFirewall({
    symbol: 'VIRTUALUSDT',
    direction: 'LONG',
    entryLow: 0.6385,
    entryHigh: 0.6423,
    currentPrice: 0.6600,
    stopLoss: 0.6100,
    targets: [
      { label: 'TP1', price: 0.7500, percentage: 17 },
      { label: 'TP2', price: 0.8500, percentage: 32 }
    ],
    expectedMovePct: 32,
    riskRewardRatio: 2.8,
    qualityGrade: 'A+',
    confidence: 90,
    sourceType: 'PRE_MOVE',
    alertType: 'PRE_PUMP'
  });
  assert(virtualFirewall.allowed === false, 'VIRTUALUSDT (live 0.66 vs entryHigh 0.6423) is strictly blocked by Entry Drift Firewall');
  assert(virtualFirewall.reason.includes('ENTRY_MISSED') === true, 'VIRTUALUSDT blocked with ENTRY_MISSED reason');

  // ENAUSDT: Entry 0.1604–0.1622, Live price 0.164 (surged +1.1% above entryHigh)
  const enaFirewall = validateTelegramFinalFirewall({
    symbol: 'ENAUSDT',
    direction: 'LONG',
    entryLow: 0.1604,
    entryHigh: 0.1622,
    currentPrice: 0.1640,
    stopLoss: 0.1520,
    targets: [
      { label: 'TP1', price: 0.1900, percentage: 17 },
      { label: 'TP2', price: 0.2200, percentage: 35 }
    ],
    expectedMovePct: 35,
    riskRewardRatio: 3.1,
    qualityGrade: 'A+',
    confidence: 88,
    sourceType: 'PRE_MOVE',
    alertType: 'PRE_PUMP'
  });
  assert(enaFirewall.allowed === false, 'ENAUSDT (live 0.164 vs entryHigh 0.1622) is strictly blocked by Entry Drift Firewall');
  assert(enaFirewall.reason.includes('ENTRY_MISSED') === true, 'ENAUSDT blocked with ENTRY_MISSED reason');

  // --- Test 14: Stop Loss Integrity & Breach Invariant ---
  console.log('\n--- Test 14: Stop Loss Integrity & Breach Invariant ---');
  
  // Wrong-side SL for LONG: StopLoss >= Entry
  const wrongSlLong = isSignalActionable({
    id: 'sig_WRONG_SL_L',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entryPrice: 65000,
    entryZoneLow: 64900,
    entryZoneHigh: 65100,
    currentPrice: 65000,
    stopLoss: 65500, // Above entry!
    targets: [{ id: 'TP1', label: 'TP1', price: 70000, percentage: 7.7 }],
    status: 'ACTIVE',
    qualityGrade: 'A'
  } as Signal);
  assert(wrongSlLong === false, 'Wrong-side SL for LONG (SL >= Entry) is rejected as non-actionable');

  // Wrong-side SL for SHORT: StopLoss <= Entry
  const wrongSlShort = isSignalActionable({
    id: 'sig_WRONG_SL_S',
    symbol: 'BTCUSDT',
    direction: 'SHORT',
    entryPrice: 65000,
    entryZoneLow: 64900,
    entryZoneHigh: 65100,
    currentPrice: 65000,
    stopLoss: 64500, // Below entry!
    targets: [{ id: 'TP1', label: 'TP1', price: 60000, percentage: 7.7 }],
    status: 'ACTIVE',
    qualityGrade: 'A'
  } as Signal);
  assert(wrongSlShort === false, 'Wrong-side SL for SHORT (SL <= Entry) is rejected as non-actionable');

  // Already breached SL for LONG: currentPrice <= stopLoss
  const breachedSlLong = isSignalActionable({
    id: 'sig_BREACHED_SL_L',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entryPrice: 65000,
    entryZoneLow: 64900,
    entryZoneHigh: 65100,
    currentPrice: 62000, // Breached past SL of 63000
    stopLoss: 63000,
    targets: [{ id: 'TP1', label: 'TP1', price: 70000, percentage: 7.7 }],
    status: 'ACTIVE',
    qualityGrade: 'A'
  } as Signal);
  assert(breachedSlLong === false, 'Already breached SL for LONG (currentPrice <= stopLoss) is rejected as non-actionable');

  // Already breached SL in Telegram Firewall
  const breachedFirewall = validateTelegramFinalFirewall({
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entryLow: 64900,
    entryHigh: 65100,
    currentPrice: 62000,
    stopLoss: 63000,
    targets: [{ label: 'TP1', price: 85000, percentage: 30 }],
    expectedMovePct: 30,
    riskRewardRatio: 2.5,
    qualityGrade: 'A+',
    confidence: 90,
    sourceType: 'TEST',
    alertType: 'MAJOR_MOVE'
  });
  assert(breachedFirewall.allowed === false, 'Already breached SL rejected by validateTelegramFinalFirewall');

  // --- Test 15: Market Data Unavailability Invariant ---
  console.log('\n--- Test 15: Market Data Unavailability Invariant ---');
  const staleDataFirewall = validateTelegramFinalFirewall({
    symbol: 'SOLUSDT',
    direction: 'LONG',
    entryLow: 130,
    entryHigh: 132,
    currentPrice: 131,
    stopLoss: 125,
    targets: [{ label: 'TP1', price: 175, percentage: 33 }],
    expectedMovePct: 33,
    riskRewardRatio: 3.0,
    qualityGrade: 'A+',
    confidence: 90,
    sourceType: 'TEST',
    alertType: 'MAJOR_MOVE',
    marketData: {
      isFresh: false,
      rejectReason: 'STALE_DATA_TIMEOUT',
      source: 'binance',
      ticker: null as any,
      candles: []
    }
  });
  assert(staleDataFirewall.allowed === false, 'Stale / Unavailable market data is strictly blocked from Telegram');
  assert(staleDataFirewall.reason.includes('STALE_OR_UNAVAILABLE_MARKET_DATA') === true, 'Reason explicitly notes STALE_OR_UNAVAILABLE_MARKET_DATA');

  // --- Test 16: Single-Coin Deduplication Invariant ---
  console.log('\n--- Test 16: Single-Coin Deduplication Invariant ---');
  const { SYMBOL_TELEGRAM_COOLDOWN_MS } = await import('./telegramAlertEngine');
  assert(SYMBOL_TELEGRAM_COOLDOWN_MS >= 60 * 60 * 1000, 'Symbol cooldown is at least 60 minutes (configured for 4 hours)');

  // --- Test 17: Production Bug Regression - VIRTUALUSDT Strict Blocking ---
  console.log('\n--- Test 17: Production Bug Regression - VIRTUALUSDT Strict Blocking ---');
  // Scenario A: VIRTUALUSDT inside entry (0.640) but genuine max TP (0.776) is only +21.2% (< 30%)
  const virtualScenarioA = validateTelegramFinalFirewall({
    symbol: 'VIRTUALUSDT',
    direction: 'LONG',
    entryLow: 0.6385,
    entryHigh: 0.6423,
    currentPrice: 0.6400,
    stopLoss: 0.6100,
    targets: [
      { label: 'TP1', price: 0.68, percentage: 6.2 },
      { label: 'TP2', price: 0.72, percentage: 12.4 },
      { label: 'TP3', price: 0.776, percentage: 21.2 }
    ],
    expectedMovePct: 21.2,
    riskRewardRatio: 3.0,
    qualityGrade: 'A',
    confidence: 88,
    sourceType: 'BIG_MOVE_HUNTER',
    alertType: 'MAJOR_MOVE'
  });
  assert(virtualScenarioA.allowed === false, 'VIRTUALUSDT with +21.2% TP3 is strictly blocked (< 30% structural rule)');
  assert(virtualScenarioA.reason.includes('FIREWALL_BLOCKED_BELOW_30_PERCENT_STRUCTURAL_TARGET') === true, 'VIRTUALUSDT blocked reason cites < 30% structural target');

  // Scenario B: VIRTUALUSDT runaway price (0.66 > 0.6423) with +21.2% TP3
  const virtualScenarioB = validateTelegramFinalFirewall({
    symbol: 'VIRTUALUSDT',
    direction: 'LONG',
    entryLow: 0.6385,
    entryHigh: 0.6423,
    currentPrice: 0.6600,
    stopLoss: 0.6100,
    targets: [
      { label: 'TP1', price: 0.68, percentage: 6.2 },
      { label: 'TP2', price: 0.72, percentage: 12.4 },
      { label: 'TP3', price: 0.776, percentage: 21.2 }
    ],
    expectedMovePct: 21.2,
    riskRewardRatio: 3.0,
    qualityGrade: 'A',
    confidence: 88,
    sourceType: 'BIG_MOVE_HUNTER',
    alertType: 'MAJOR_MOVE'
  });
  assert(virtualScenarioB.allowed === false, 'VIRTUALUSDT with live 0.66 and TP3 0.776 is strictly blocked');
  assert(virtualScenarioB.reason.includes('ENTRY_MISSED_RUNAWAY') === true, 'VIRTUALUSDT runaway price flagged as ENTRY_MISSED_RUNAWAY');

  // Scenario C: VIRTUALUSDT runaway price (0.66 > 0.6423) even with +35% hypothetical TP3
  const virtualScenarioC = validateTelegramFinalFirewall({
    symbol: 'VIRTUALUSDT',
    direction: 'LONG',
    entryLow: 0.6385,
    entryHigh: 0.6423,
    currentPrice: 0.6600,
    stopLoss: 0.6100,
    targets: [
      { label: 'TP1', price: 0.70, percentage: 9.3 },
      { label: 'TP2', price: 0.76, percentage: 18.7 },
      { label: 'TP3', price: 0.865, percentage: 35.1 }
    ],
    expectedMovePct: 35.1,
    riskRewardRatio: 3.5,
    qualityGrade: 'A',
    confidence: 90,
    sourceType: 'BIG_MOVE_HUNTER',
    alertType: 'MAJOR_MOVE'
  });
  assert(virtualScenarioC.allowed === false, 'VIRTUALUSDT with live 0.66 is strictly blocked despite 35% targets');
  assert(virtualScenarioC.reason.includes('ENTRY_MISSED_RUNAWAY') === true, 'Runaway entry takes precedence and blocks dispatch');

  // --- Test 18: Production Bug Regression - ENAUSDT Strict Blocking ---
  console.log('\n--- Test 18: Production Bug Regression - ENAUSDT Strict Blocking ---');
  // Scenario A: ENAUSDT inside entry (0.1610) but genuine max TP (0.1953) is only +21.0% (< 30%)
  const enaScenarioA = validateTelegramFinalFirewall({
    symbol: 'ENAUSDT',
    direction: 'LONG',
    entryLow: 0.1604,
    entryHigh: 0.1622,
    currentPrice: 0.1610,
    stopLoss: 0.1550,
    targets: [
      { label: 'TP1', price: 0.175, percentage: 8.5 },
      { label: 'TP2', price: 0.185, percentage: 14.7 },
      { label: 'TP3', price: 0.1953, percentage: 21.0 }
    ],
    expectedMovePct: 21.0,
    riskRewardRatio: 3.0,
    qualityGrade: 'A',
    confidence: 87,
    sourceType: 'BIG_MOVE_HUNTER',
    alertType: 'MAJOR_MOVE'
  });
  assert(enaScenarioA.allowed === false, 'ENAUSDT with +21.0% TP3 is strictly blocked (< 30% structural rule)');
  assert(enaScenarioA.reason.includes('FIREWALL_BLOCKED_BELOW_30_PERCENT_STRUCTURAL_TARGET') === true, 'ENAUSDT blocked reason cites < 30% structural target');

  // Scenario B: ENAUSDT runaway price (0.164 > 0.1622) with +21.0% TP3
  const enaScenarioB = validateTelegramFinalFirewall({
    symbol: 'ENAUSDT',
    direction: 'LONG',
    entryLow: 0.1604,
    entryHigh: 0.1622,
    currentPrice: 0.1640,
    stopLoss: 0.1550,
    targets: [
      { label: 'TP1', price: 0.175, percentage: 8.5 },
      { label: 'TP2', price: 0.185, percentage: 14.7 },
      { label: 'TP3', price: 0.1953, percentage: 21.0 }
    ],
    expectedMovePct: 21.0,
    riskRewardRatio: 3.0,
    qualityGrade: 'A',
    confidence: 87,
    sourceType: 'BIG_MOVE_HUNTER',
    alertType: 'MAJOR_MOVE'
  });
  assert(enaScenarioB.allowed === false, 'ENAUSDT with live 0.164 and TP3 0.1953 is strictly blocked');
  assert(enaScenarioB.reason.includes('ENTRY_MISSED_RUNAWAY') === true, 'ENAUSDT runaway price flagged as ENTRY_MISSED_RUNAWAY');

  // --- Test 19: Removal of +3% / -3% Drift Grace Period ---
  console.log('\n--- Test 19: Removal of +3% / -3% Drift Grace Period ---');
  // LONG with +0.5% drift above entryHigh (would have passed under old +3% grace period)
  const longDriftGraceBreach = validateTelegramFinalFirewall({
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entryLow: 60000,
    entryHigh: 60500,
    currentPrice: 60800, // +0.49% above 60500
    stopLoss: 58000,
    targets: [{ label: 'TP1', price: 82000, percentage: 36.1 }],
    expectedMovePct: 36.1,
    riskRewardRatio: 4.0,
    qualityGrade: 'A+',
    confidence: 92,
    sourceType: 'BIG_MOVE_HUNTER',
    alertType: 'MAJOR_MOVE'
  });
  assert(longDriftGraceBreach.allowed === false, 'LONG with price above entryHigh (no +3% grace) is strictly blocked');
  assert(longDriftGraceBreach.reason.includes('ENTRY_MISSED_RUNAWAY') === true, 'Blocked due to ENTRY_MISSED_RUNAWAY');

  // SHORT with -0.5% drift below entryLow (would have passed under old -3% grace period)
  const shortDriftGraceBreach = validateTelegramFinalFirewall({
    symbol: 'ETHUSDT',
    direction: 'SHORT',
    entryLow: 3000,
    entryHigh: 3050,
    currentPrice: 2980, // -0.66% below 3000
    stopLoss: 3200,
    targets: [{ label: 'TP1', price: 1900, percentage: 37.2 }],
    expectedMovePct: 37.2,
    riskRewardRatio: 4.0,
    qualityGrade: 'A+',
    confidence: 92,
    sourceType: 'BIG_MOVE_HUNTER',
    alertType: 'PRE_DUMP'
  });
  assert(shortDriftGraceBreach.allowed === false, 'SHORT with price below entryLow (no -3% grace) is strictly blocked');
  assert(shortDriftGraceBreach.reason.includes('ENTRY_MISSED_RUNAWAY') === true, 'Blocked due to ENTRY_MISSED_RUNAWAY');

  // --- Test 20: Strict Grade A / A+ Requirement ---
  console.log('\n--- Test 20: Strict Grade A / A+ Requirement ---');
  const gradeBSetup = validateTelegramFinalFirewall({
    symbol: 'BNBUSDT',
    direction: 'LONG',
    entryLow: 500,
    entryHigh: 505,
    currentPrice: 502,
    stopLoss: 480,
    targets: [{ label: 'TP1', price: 700, percentage: 39.3 }],
    expectedMovePct: 39.3,
    riskRewardRatio: 3.5,
    qualityGrade: 'B+',
    confidence: 85,
    sourceType: 'BIG_MOVE_HUNTER',
    alertType: 'MAJOR_MOVE'
  });
  assert(gradeBSetup.allowed === false, 'Grade B+ setup is strictly blocked from Telegram');
  assert(gradeBSetup.reason.includes('FIREWALL_BLOCKED_GRADE') === true, 'Grade B+ rejection explicitly logged');

  const gradeCSetup = validateTelegramFinalFirewall({
    symbol: 'BNBUSDT',
    direction: 'LONG',
    entryLow: 500,
    entryHigh: 505,
    currentPrice: 502,
    stopLoss: 480,
    targets: [{ label: 'TP1', price: 700, percentage: 39.3 }],
    expectedMovePct: 39.3,
    riskRewardRatio: 3.5,
    qualityGrade: 'C',
    confidence: 70,
    sourceType: 'BIG_MOVE_HUNTER',
    alertType: 'MAJOR_MOVE'
  });
  assert(gradeCSetup.allowed === false, 'Grade C setup is strictly blocked from Telegram');
  assert(gradeCSetup.reason.includes('FIREWALL_BLOCKED_GRADE') === true, 'Grade C rejection explicitly logged');

  // --- Test 21: Target Count Irrelevance (Genuine Max Target < 30% Invariant) ---
  console.log('\n--- Test 21: Target Count Irrelevance ---');
  const fourTargetsSmallMove = validateTelegramFinalFirewall({
    symbol: 'AVAXUSDT',
    direction: 'LONG',
    entryLow: 25.0,
    entryHigh: 25.5,
    currentPrice: 25.2,
    stopLoss: 24.0,
    targets: [
      { label: 'TP1', price: 26.5, percentage: 5.0 },
      { label: 'TP2', price: 28.0, percentage: 10.9 },
      { label: 'TP3', price: 29.5, percentage: 16.8 },
      { label: 'TP4', price: 31.0, percentage: 22.8 }
    ],
    expectedMovePct: 22.8,
    riskRewardRatio: 3.0,
    qualityGrade: 'A+',
    confidence: 95,
    sourceType: 'BIG_MOVE_HUNTER',
    alertType: 'MAJOR_MOVE'
  });
  assert(fourTargetsSmallMove.allowed === false, 'Signal with 4 targets but max move 22.8% is strictly blocked');
  assert(fourTargetsSmallMove.reason.includes('FIREWALL_BLOCKED_BELOW_30_PERCENT_STRUCTURAL_TARGET') === true, 'Rejection explicitly notes below 30% structural target');

  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
