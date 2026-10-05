/**
 * Test Suite: Final Micro-Correction Verification
 * 1. REMOVE ALL ENTRY DRIFT GRACE (Zero tolerance for LONG currentPrice > entryHigh or SHORT currentPrice < entryLow)
 * 2. EXACT TELEGRAM ENTRY FIREWALL (Consistent across engine, telegram, signal tracker, and UI)
 * 3. OPPORTUNITY-BASED COOLDOWN (Replaces symbol-only 4-hour cooldown; allows genuinely new opportunities on same symbol)
 */

import {
  validateTelegramFinalFirewall,
  validateTelegramSignalActionability,
  calculateOpportunityFingerprint
} from './telegramAlertEngine';
import { isSignalActionable } from './signalTracker';
import { Signal } from './signalEngine';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failCount++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('TEST SUITE: ZERO ENTRY DRIFT GRACE & OPPORTUNITY COOLDOWN AUDIT');
  console.log('================================================================\n');

  console.log('--- TEST 1: Exact Zero Drift Invalidation (LONG) ---');
  // entryZone: [100.0, 102.0]
  // 102.0001 is above entryHigh -> MUST BE BLOCKED
  const longCandidateOver = {
    symbol: 'BTCUSDT',
    direction: 'LONG' as const,
    qualityGrade: 'A+' as const,
    expectedMovePct: 35.0,
    currentPrice: 102.001, // 0.001% above entryHigh
    entryPrice: 101.0,
    entryLow: 100.0,
    entryHigh: 102.0,
    stopLoss: 95.0,
    targets: [
      { label: 'TP1', price: 115.0, percentage: 13.8 },
      { label: 'TP2', price: 125.0, percentage: 23.7 },
      { label: 'TP3', price: 138.0, percentage: 36.6 }
    ]
  };

  const gateLongOver = validateTelegramFinalFirewall({
    symbol: longCandidateOver.symbol,
    direction: longCandidateOver.direction,
    qualityGrade: longCandidateOver.qualityGrade,
    expectedMovePct: longCandidateOver.expectedMovePct,
    currentPrice: longCandidateOver.currentPrice,
    entryLow: longCandidateOver.entryLow,
    entryHigh: longCandidateOver.entryHigh,
    stopLoss: longCandidateOver.stopLoss,
    targets: longCandidateOver.targets
  });

  assert(gateLongOver.allowed === false, 'LONG with currentPrice > entryHigh is BLOCKED by validateTelegramFinalFirewall');
  assert(gateLongOver.reason.includes('ENTRY_MISSED_RUNAWAY'), 'Rejection reason cites ENTRY_MISSED_RUNAWAY');

  const actionZoneLongOver = validateTelegramSignalActionability(
    {
      symbol: longCandidateOver.symbol,
      direction: longCandidateOver.direction,
      entryLow: longCandidateOver.entryLow,
      entryHigh: longCandidateOver.entryHigh,
      stopLoss: longCandidateOver.stopLoss,
      targets: longCandidateOver.targets
    },
    { symbol: longCandidateOver.symbol, lastPrice: longCandidateOver.currentPrice }
  );
  assert(actionZoneLongOver.isValid === false, 'LONG with currentPrice > entryHigh is rejected by validateTelegramSignalActionability');
  assert(actionZoneLongOver.rejectReason?.includes('STALE_SETUP_PRICE_ALREADY_SURGED'), 'validateTelegramSignalActionability cites STALE_SETUP_PRICE_ALREADY_SURGED');

  const signalTrackerLongOver: Partial<Signal> = {
    id: 'SIG-TEST-LONG-OVER',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    status: 'ACTIVE',
    entryPrice: 101.0,
    entryZoneLow: 100.0,
    entryZoneHigh: 102.0,
    currentPrice: 102.001,
    stopLoss: 95.0,
    targets: [{ id: 'tp1', label: 'TP1', price: 138.0, percentage: 36.6, hit: false }]
  };
  assert(isSignalActionable(signalTrackerLongOver as Signal) === false, 'isSignalActionable rejects LONG with currentPrice > entryHigh');

  console.log('\n--- TEST 2: Exact Zero Drift Invalidation (SHORT) ---');
  // entryZone: [100.0, 102.0]
  // 99.999 is below entryLow -> MUST BE BLOCKED
  const shortCandidateUnder = {
    symbol: 'ETHUSDT',
    direction: 'SHORT' as const,
    qualityGrade: 'A+' as const,
    expectedMovePct: 35.0,
    currentPrice: 99.999, // 0.001% below entryLow
    entryPrice: 101.0,
    entryLow: 100.0,
    entryHigh: 102.0,
    stopLoss: 106.0,
    targets: [
      { label: 'TP1', price: 90.0, percentage: 10.9 },
      { label: 'TP2', price: 80.0, percentage: 20.8 },
      { label: 'TP3', price: 65.0, percentage: 35.6 }
    ]
  };

  const gateShortUnder = validateTelegramFinalFirewall({
    symbol: shortCandidateUnder.symbol,
    direction: shortCandidateUnder.direction,
    qualityGrade: shortCandidateUnder.qualityGrade,
    expectedMovePct: shortCandidateUnder.expectedMovePct,
    currentPrice: shortCandidateUnder.currentPrice,
    entryLow: shortCandidateUnder.entryLow,
    entryHigh: shortCandidateUnder.entryHigh,
    stopLoss: shortCandidateUnder.stopLoss,
    targets: shortCandidateUnder.targets
  });

  assert(gateShortUnder.allowed === false, 'SHORT with currentPrice < entryLow is BLOCKED by validateTelegramFinalFirewall');
  assert(gateShortUnder.reason.includes('ENTRY_MISSED_RUNAWAY'), 'Rejection reason cites ENTRY_MISSED_RUNAWAY');

  const actionZoneShortUnder = validateTelegramSignalActionability(
    {
      symbol: shortCandidateUnder.symbol,
      direction: shortCandidateUnder.direction,
      entryLow: shortCandidateUnder.entryLow,
      entryHigh: shortCandidateUnder.entryHigh,
      stopLoss: shortCandidateUnder.stopLoss,
      targets: shortCandidateUnder.targets
    },
    { symbol: shortCandidateUnder.symbol, lastPrice: shortCandidateUnder.currentPrice }
  );
  assert(actionZoneShortUnder.isValid === false, 'SHORT with currentPrice < entryLow is rejected by validateTelegramSignalActionability');
  assert(actionZoneShortUnder.rejectReason?.includes('STALE_SETUP_PRICE_ALREADY_DUMPED'), 'validateTelegramSignalActionability cites STALE_SETUP_PRICE_ALREADY_DUMPED');

  const signalTrackerShortUnder: Partial<Signal> = {
    id: 'SIG-TEST-SHORT-UNDER',
    symbol: 'ETHUSDT',
    direction: 'SHORT',
    status: 'ACTIVE',
    entryPrice: 101.0,
    entryZoneLow: 100.0,
    entryZoneHigh: 102.0,
    currentPrice: 99.999,
    stopLoss: 106.0,
    targets: [{ id: 'tp1', label: 'TP1', price: 65.0, percentage: 35.6, hit: false }]
  };
  assert(isSignalActionable(signalTrackerShortUnder as Signal) === false, 'isSignalActionable rejects SHORT with currentPrice < entryLow');

  console.log('\n--- TEST 3: Valid In-Zone Execution ---');
  // LONG with currentPrice exactly at entryZoneHigh (102.0)
  const longCandidateExact = {
    ...longCandidateOver,
    currentPrice: 102.0,
    signal: {
      id: 'PREMOVE-BTC-EXACT',
      symbol: 'BTCUSDT',
      direction: 'LONG' as const,
      entryPrice: 101.0,
      currentPrice: 102.0,
      stopLoss: 95.0,
      qualityGrade: 'A+' as const,
      isPreMove: true,
      preMoveReport: {
        isExtremeCandidate: true,
        largeMoveClass: 'EXCEPTIONAL_30_PLUS'
      }
    } as any
  };
  const gateLongExact = validateTelegramFinalFirewall({
    symbol: longCandidateExact.symbol,
    direction: longCandidateExact.direction,
    qualityGrade: longCandidateExact.qualityGrade,
    expectedMovePct: longCandidateExact.expectedMovePct,
    currentPrice: longCandidateExact.currentPrice,
    entryLow: longCandidateExact.entryLow,
    entryHigh: longCandidateExact.entryHigh,
    stopLoss: longCandidateExact.stopLoss,
    targets: longCandidateExact.targets,
    signal: longCandidateExact.signal
  });
  assert(gateLongExact.allowed === true, 'LONG with currentPrice == entryZoneHigh is ALLOWED');

  // SHORT with currentPrice exactly at entryZoneLow (100.0)
  const shortCandidateExact = {
    ...shortCandidateUnder,
    currentPrice: 100.0,
    signal: {
      id: 'PREMOVE-ETH-EXACT',
      symbol: 'ETHUSDT',
      direction: 'SHORT' as const,
      entryPrice: 101.0,
      currentPrice: 100.0,
      stopLoss: 106.0,
      qualityGrade: 'A+' as const,
      isPreMove: true,
      preMoveReport: {
        isExtremeCandidate: true,
        largeMoveClass: 'EXCEPTIONAL_30_PLUS'
      }
    } as any
  };
  const gateShortExact = validateTelegramFinalFirewall({
    symbol: shortCandidateExact.symbol,
    direction: shortCandidateExact.direction,
    qualityGrade: shortCandidateExact.qualityGrade,
    expectedMovePct: shortCandidateExact.expectedMovePct,
    currentPrice: shortCandidateExact.currentPrice,
    entryLow: shortCandidateExact.entryLow,
    entryHigh: shortCandidateExact.entryHigh,
    stopLoss: shortCandidateExact.stopLoss,
    targets: shortCandidateExact.targets,
    signal: shortCandidateExact.signal
  });
  assert(gateShortExact.allowed === true, 'SHORT with currentPrice == entryZoneLow is ALLOWED');

  console.log('\n--- TEST 4: Opportunity Fingerprinting & Cooldown Replacement ---');
  const fp1 = calculateOpportunityFingerprint({
    symbol: 'SOLUSDT',
    direction: 'LONG',
    entryPrice: 150.0,
    stopLoss: 140.0,
    targets: [{ price: 175.0 }, { price: 195.0 }],
    qualityGrade: 'A+'
  });

  const fp2Same = calculateOpportunityFingerprint({
    symbol: 'SOLUSDT',
    direction: 'LONG',
    entryPrice: 150.0,
    stopLoss: 140.0,
    targets: [{ price: 175.0 }, { price: 195.0 }],
    qualityGrade: 'A+'
  });

  assert(fp1 === fp2Same, 'Identical opportunity parameters produce identical fingerprint');

  const fpNewStructural = calculateOpportunityFingerprint({
    symbol: 'SOLUSDT',
    direction: 'LONG',
    entryPrice: 165.0, // Different structural entry zone
    stopLoss: 155.0, // Different pivot SL
    targets: [{ price: 190.0 }, { price: 215.0 }],
    qualityGrade: 'A+'
  });

  assert(fp1 !== fpNewStructural, 'Genuinely new structural opportunity on same symbol produces distinct fingerprint');

  const fpReversal = calculateOpportunityFingerprint({
    symbol: 'SOLUSDT',
    direction: 'SHORT', // Flipped direction
    entryPrice: 150.0,
    stopLoss: 158.0,
    targets: [{ price: 130.0 }, { price: 110.0 }],
    qualityGrade: 'A+'
  });

  assert(fp1 !== fpReversal, 'Direction reversal produces distinct fingerprint');

  console.log('\n================================================================');
  console.log(`AUDIT COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error in tests:', err);
  process.exit(1);
});
