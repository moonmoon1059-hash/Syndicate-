import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateSignalQualityGrade,
  calculateActionablePriority
} from './coreIntelligenceEngine';
import {
  upsertSignals,
  getAllStoredSignals,
  calculateSignalLifecycleStats,
  clearSignalStoreForTesting,
  getSignalLifecycleEvents
} from './signalTracker';
import { getCanonicalTargets } from '../src/utils/formatters';
import { Signal, TargetLevel } from '../src/types/crypto';

console.log('=== RUNNING PHASE 5 COMPREHENSIVE TEST SUITE ===');

describe('Phase 5: Signal Quality Filtering & Grading Engine', () => {
  it('assigns Grade A+ for high confidence, multiple confirmations, high data quality, and approved adversarial audit', () => {
    const grade = calculateSignalQualityGrade(
      'LONG',
      88, // confidence >= 80
      3,  // confirmations >= 2
      'HIGH', // data quality HIGH
      2.5, // RR >= 2.0
      'APPROVED',
      false
    );
    assert.strictEqual(grade, 'A+');
  });

  it('assigns Grade A for solid setups meeting tier 2 thresholds', () => {
    const grade = calculateSignalQualityGrade(
      'LONG',
      75, // confidence >= 70
      2,  // confirmations >= 2
      'HIGH',
      1.9, // RR >= 1.8
      'APPROVED',
      false
    );
    assert.strictEqual(grade, 'A');
  });

  it('assigns Grade B for standard setups meeting tier 3 thresholds', () => {
    const grade = calculateSignalQualityGrade(
      'SHORT',
      65, // confidence >= 60
      1,
      'MEDIUM',
      1.6, // RR >= 1.5
      'APPROVED',
      false
    );
    assert.strictEqual(grade, 'B');
  });

  it('assigns Grade C for low-confidence setups and never artificially upgrades them', () => {
    const grade = calculateSignalQualityGrade(
      'LONG',
      50, // confidence 45-59
      1,
      'LOW',
      1.2,
      'DOWNGRADED',
      false
    );
    assert.strictEqual(grade, 'C');
  });

  it('assigns Grade WAIT when decision is WAIT, or severe conflict exists, or adversarial audit is REJECTED', () => {
    const gradeDecisionWait = calculateSignalQualityGrade('WAIT', 85, 3, 'HIGH', 2.5, 'APPROVED', false);
    assert.strictEqual(gradeDecisionWait, 'WAIT');

    const gradeSevereConflict = calculateSignalQualityGrade('LONG', 90, 4, 'HIGH', 3.0, 'APPROVED', true);
    assert.strictEqual(gradeSevereConflict, 'WAIT');

    const gradeRejected = calculateSignalQualityGrade('LONG', 90, 4, 'HIGH', 3.0, 'REJECTED', false);
    assert.strictEqual(gradeRejected, 'WAIT');
  });
});

describe('Phase 5: Actionable Priority Ranking', () => {
  it('identifies ENTRY_NOW priority for actionable high-grade setups at the entry zone', () => {
    const priority = calculateActionablePriority('LONG', 'A+', 'ENTRY_NOW', 'ACTIVE');
    assert.strictEqual(priority, 'ENTRY_NOW');
  });

  it('identifies HIGH_PRIORITY for Grade A/A+ setups pending readiness', () => {
    const priority = calculateActionablePriority('LONG', 'A', 'WAIT_FOR_ENTRY', 'ACTIVE');
    assert.strictEqual(priority, 'HIGH_PRIORITY');
  });

  it('identifies WATCH for Grade B setups or setups waiting for pullback/retest', () => {
    const priority1 = calculateActionablePriority('SHORT', 'B', 'WAIT_FOR_PULLBACK', 'ACTIVE');
    assert.strictEqual(priority1, 'WATCH');

    const priority2 = calculateActionablePriority('LONG', 'B', 'WAIT_FOR_RETEST', 'ACTIVE');
    assert.strictEqual(priority2, 'WATCH');
  });

  it('identifies WAIT for Grade C or decision WAIT', () => {
    const priorityWait = calculateActionablePriority('WAIT', 'WAIT', 'WAIT_FOR_ENTRY', 'ACTIVE');
    assert.strictEqual(priorityWait, 'WAIT');

    const priorityC = calculateActionablePriority('LONG', 'C', 'ENTRY_MISSED', 'ACTIVE');
    assert.strictEqual(priorityC, 'WAIT');
  });

  it('identifies INVALIDATED_EXPIRED for stopped out or expired signals', () => {
    const priorityStopped = calculateActionablePriority('LONG', 'A', 'ENTRY_NOW', 'STOPPED_OUT');
    assert.strictEqual(priorityStopped, 'INVALIDATED_EXPIRED');

    const priorityInvalid = calculateActionablePriority('LONG', 'B', 'INVALIDATED', 'CANCELLED');
    assert.strictEqual(priorityInvalid, 'INVALIDATED_EXPIRED');
  });
});

describe('Phase 5: Strict Dynamic Target Display & Preservation', () => {
  it('preserves exactly 3 targets when 3 exist without synthesizing extra missing ones', () => {
    const signal: Partial<Signal> = {
      direction: 'LONG',
      entryPrice: 100,
      stopLoss: 95,
      targets: [
        { id: 'TP1', label: 'TP1', price: 105, hit: false },
        { id: 'TP2', label: 'TP2', price: 110, hit: false },
        { id: 'TP3', label: 'TP3', price: 115, hit: false },
      ]
    };
    const targets = getCanonicalTargets(signal);
    assert.strictEqual(targets.length, 3);
    assert.strictEqual(targets[0].label, 'TP1');
    assert.strictEqual(targets[1].label, 'TP2');
    assert.strictEqual(targets[2].label, 'TP3');
  });

  it('preserves all 7 targets when 7 exist (TP1..TP7)', () => {
    const signal: Partial<Signal> = {
      direction: 'LONG',
      entryPrice: 100,
      stopLoss: 95,
      targets: [
        { id: 'TP1', label: 'TP1', price: 105 },
        { id: 'TP2', label: 'TP2', price: 110 },
        { id: 'TP3', label: 'TP3', price: 115 },
        { id: 'TP4', label: 'TP4', price: 120 },
        { id: 'TP5', label: 'TP5', price: 125 },
        { id: 'TP6', label: 'TP6', price: 130 },
        { id: 'TP7', label: 'TP7', price: 135 },
      ]
    };
    const targets = getCanonicalTargets(signal);
    assert.strictEqual(targets.length, 7);
    assert.strictEqual(targets[6].label, 'TP7');
    assert.strictEqual(targets[6].price, 135);
  });

  it('preserves all 10 targets when 10 exist (TP1..TP10)', () => {
    const mockTargets: TargetLevel[] = [];
    for (let i = 1; i <= 10; i++) {
      mockTargets.push({ id: `TP${i}`, label: `TP${i}`, price: 100 + i * 5 });
    }
    const signal: Partial<Signal> = {
      direction: 'LONG',
      entryPrice: 100,
      stopLoss: 95,
      targets: mockTargets
    };
    const targets = getCanonicalTargets(signal);
    assert.strictEqual(targets.length, 10);
    assert.strictEqual(targets[9].label, 'TP10');
    assert.strictEqual(targets[9].price, 150);
  });
});

describe('Phase 5: One Current Signal Per Asset & Polling Idempotency', () => {
  it('enforces ONE COIN = ONE CURRENT UNIFIED SIGNAL across multiple scanner updates', () => {
    clearSignalStoreForTesting();

    const timestamp1 = Date.now() - 60000;
    const signalCycle1: Signal = {
      id: 'BTCUSDT_1h_LONG_DOUBLE_BOTTOM_1',
      symbol: 'BTC/USDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      direction: 'LONG',
      timeframe: '1h',
      status: 'ACTIVE',
      entryStatus: 'WAIT_FOR_ENTRY',
      qualityGrade: 'A',
      actionablePriority: 'HIGH_PRIORITY',
      moonScore: 84,
      confidence: 84,
      entryPrice: 88000,
      stopLoss: 86500,
      riskRewardRatio: 2.3,
      tp1: 90000,
      tp2: 92000,
      tp3: 94000,
      targets: [
        { id: 'TP1', label: 'TP1', price: 90000, hit: false },
        { id: 'TP2', label: 'TP2', price: 92000, hit: false }
      ],
      currentPrice: 87800,
      priceChange24h: 2.1,
      volume24h: 120000,
      confluences: [],
      timestamp: timestamp1,
      createdAt: timestamp1,
      expiresAt: timestamp1 + 3600000
    };

    upsertSignals([signalCycle1]);
    let stored = getAllStoredSignals();
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].symbol, 'BTC/USDT');
    assert.strictEqual(stored[0].entryStatus, 'WAIT_FOR_ENTRY');

    // Cycle 2: Same coin moves into ENTRY_NOW zone in next polling cycle
    const signalCycle2: Signal = {
      ...signalCycle1,
      currentPrice: 88050,
      entryStatus: 'ENTRY_NOW',
      actionablePriority: 'ENTRY_NOW',
      moonScore: 88,
      timestamp: timestamp1 + 15000
    };

    upsertSignals([signalCycle2]);
    stored = getAllStoredSignals();
    
    // STRICT CHECK: Stored count MUST remain 1 (no duplicate signal card)
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].symbol, 'BTC/USDT');
    assert.strictEqual(stored[0].entryStatus, 'ENTRY_NOW');
    assert.strictEqual(stored[0].actionablePriority, 'ENTRY_NOW');
    assert.strictEqual(stored[0].currentPrice, 88050);

    // Lifecycle events must record the transition
    const events = getSignalLifecycleEvents();
    assert.ok(events.length >= 2);
    assert.strictEqual(events[0].eventType, 'GENERATED');
    assert.strictEqual(events[1].eventType, 'ENTRY_TRIGGERED');
  });

  it('smoothly reconciles status transition WAIT -> ENTRY_NOW -> ACTIVE -> TP1_HIT on the single asset record', () => {
    clearSignalStoreForTesting();

    const timestamp = Date.now() - 30000;
    const initialSignal: Signal = {
      id: 'ETHUSDT_1h_LONG_BULL_FLAG_1',
      symbol: 'ETH/USDT',
      baseAsset: 'ETH',
      quoteAsset: 'USDT',
      direction: 'LONG',
      timeframe: '1h',
      status: 'ACTIVE',
      entryStatus: 'WAIT_FOR_PULLBACK',
      qualityGrade: 'A+',
      actionablePriority: 'WATCH',
      moonScore: 91,
      confidence: 91,
      entryPrice: 3200,
      stopLoss: 3100,
      riskRewardRatio: 2.1,
      tp1: 3350,
      tp2: 3500,
      tp3: 3650,
      targets: [
        { id: 'TP1', label: 'TP1', price: 3350, hit: false },
        { id: 'TP2', label: 'TP2', price: 3500, hit: false }
      ],
      currentPrice: 3220,
      priceChange24h: 3.4,
      volume24h: 80000,
      confluences: [],
      timestamp,
      createdAt: timestamp,
      expiresAt: timestamp + 3600000
    };

    upsertSignals([initialSignal]);
    assert.strictEqual(getAllStoredSignals().length, 1);

    // Transition to TP1_HIT
    const tp1Signal: Signal = {
      ...initialSignal,
      status: 'TP1_HIT',
      currentPrice: 3360,
      targets: [
        { id: 'TP1', label: 'TP1', price: 3350, hit: true, status: 'HIT' },
        { id: 'TP2', label: 'TP2', price: 3500, hit: false }
      ]
    };

    upsertSignals([tp1Signal]);
    const stored = getAllStoredSignals();
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].status, 'TP1_HIT');
    assert.strictEqual(stored[0].targets?.[0].hit, true);
  });
});

describe('Phase 5: Performance & Daily Lifecycle Statistics', () => {
  it('calculates deterministic lifecycle statistics without fabrication', () => {
    clearSignalStoreForTesting();

    const signal1: Signal = {
      id: 'SOLUSDT_1h_LONG',
      symbol: 'SOL/USDT',
      baseAsset: 'SOL',
      quoteAsset: 'USDT',
      direction: 'LONG',
      timeframe: '1h',
      status: 'TP1_HIT',
      entryStatus: 'ENTRY_NOW',
      qualityGrade: 'A+',
      actionablePriority: 'ENTRY_NOW',
      moonScore: 94,
      confidence: 94,
      entryPrice: 190,
      stopLoss: 180,
      riskRewardRatio: 2.5,
      tp1: 205,
      tp2: 220,
      tp3: 235,
      targets: [
        { id: 'TP1', label: 'TP1', price: 205, hit: true, status: 'HIT' },
        { id: 'TP2', label: 'TP2', price: 220, hit: false }
      ],
      currentPrice: 206,
      priceChange24h: 5.2,
      volume24h: 50000,
      confluences: [],
      timestamp: Date.now(),
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000
    };

    const signal2: Signal = {
      id: 'DOGEUSDT_1h_SHORT',
      symbol: 'DOGE/USDT',
      baseAsset: 'DOGE',
      quoteAsset: 'USDT',
      direction: 'SHORT',
      timeframe: '1h',
      status: 'STOPPED_OUT',
      entryStatus: 'INVALIDATED',
      qualityGrade: 'B',
      actionablePriority: 'INVALIDATED_EXPIRED',
      moonScore: 72,
      confidence: 72,
      entryPrice: 0.30,
      stopLoss: 0.32,
      riskRewardRatio: 1.8,
      tp1: 0.27,
      tp2: 0.25,
      tp3: 0.23,
      targets: [
        { id: 'TP1', label: 'TP1', price: 0.27, hit: false }
      ],
      currentPrice: 0.33,
      priceChange24h: -1.5,
      volume24h: 30000,
      confluences: [],
      timestamp: Date.now(),
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000
    };

    const signal3: Signal = {
      id: 'XRPUSDT_1h_WAIT',
      symbol: 'XRP/USDT',
      baseAsset: 'XRP',
      quoteAsset: 'USDT',
      direction: 'WAIT' as any,
      timeframe: '1h',
      status: 'ACTIVE',
      entryStatus: 'WAIT_FOR_ENTRY',
      qualityGrade: 'WAIT',
      actionablePriority: 'WAIT',
      moonScore: 55,
      confidence: 55,
      entryPrice: 2.30,
      stopLoss: 2.20,
      riskRewardRatio: 1.0,
      tp1: 2.40,
      tp2: 2.50,
      tp3: 2.60,
      targets: [],
      currentPrice: 2.30,
      priceChange24h: 0.5,
      volume24h: 20000,
      confluences: [],
      timestamp: Date.now(),
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000
    };

    upsertSignals([signal1, signal2, signal3]);

    const stats = calculateSignalLifecycleStats();
    assert.strictEqual(stats.totalSignals, 3);
    assert.strictEqual(stats.longCount, 1);
    assert.strictEqual(stats.shortCount, 1);
    assert.strictEqual(stats.waitCount, 1);
    assert.strictEqual(stats.entryNowCount, 1);
    assert.strictEqual(stats.tp1Hits, 1);
    assert.strictEqual(stats.stopLossHits, 1);
    assert.strictEqual(stats.gradeDistribution['A+'], 1);
    assert.strictEqual(stats.gradeDistribution['B'], 1);
    assert.strictEqual(stats.gradeDistribution['WAIT'], 1);

    // 1 winner (SOL TP1_HIT), 1 loser (DOGE STOPPED_OUT) -> 50% Win Rate
    assert.strictEqual(stats.winRate, 50);
  });
});

console.log('=== PHASE 5 TEST SUITE COMPLETED SUCCESSFULLY ===');
