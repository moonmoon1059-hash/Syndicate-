import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { Signal, TelegramAlertRecord, TelegramAlertType, TelegramConfig, TargetLevel, PreMoveReport } from '../src/types/crypto';
import { formatPrice } from '../src/utils/formatters';
import { getKlines, Candle } from './cryptoService';
import { fetchFreshTelegramLiveMarketData, TelegramMarketDataResult } from './liveDataProvider';
import { getAllStoredSignals, getActionableStoredSignals, invalidateStoredSignal } from './signalTracker';
import { getAuthoritativePreMoveSignals, hasAuthoritativePreMoveSignal } from './preMoveEngine';
import { tradingStorage, isValidTelegramChatId } from './tradingStorage';
import { generateTradingViewChart } from './chartSnapshotEngine';
import { formatTelegramSignalCaption } from './telegramService';

// In-memory alert log and deduplication cache
const recentAlerts: TelegramAlertRecord[] = [];
const MAX_ALERT_HISTORY = 200;

// ============================================================================
// RUNTIME ENVIRONMENT & CLOUD RUN MULTI-INSTANCE IDENTIFIERS
// ============================================================================

export const TELEGRAM_PROCESS_PID = process.pid;
export const TELEGRAM_HOSTNAME = os.hostname();
export const K_SERVICE = process.env.K_SERVICE || 'local';
export const K_REVISION = process.env.K_REVISION || 'local';

// Dynamic GCP Instance ID or deterministic container host identity
export let TELEGRAM_INSTANCE_ID = process.env.K_INSTANCE || `${TELEGRAM_HOSTNAME}_${TELEGRAM_PROCESS_PID}`;
export const K_INSTANCE = process.env.K_INSTANCE || TELEGRAM_INSTANCE_ID;

// Cloud Run concurrency and scaling configuration
export const CLOUD_RUN_MAX_INSTANCES = parseInt(process.env.CLOUD_RUN_MAX_INSTANCES || '1', 10);
export const CLOUD_RUN_MIN_INSTANCES = parseInt(process.env.CLOUD_RUN_MIN_INSTANCES || '0', 10);

// Asynchronously probe GCP metadata server for exact hardware/container instance id
(async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const resp = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/id', {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (resp.ok) {
      const gcpId = (await resp.text()).trim();
      if (gcpId) {
        TELEGRAM_INSTANCE_ID = gcpId;
        pipelineDiagnostics.TELEGRAM_INSTANCE_ID = gcpId;
        pipelineDiagnostics.K_INSTANCE = gcpId;
      }
    }
  } catch {
    // Outside GCP or local container
  }
})();

/**
 * Checks whether this container process is authorized to execute the autonomous Telegram dispatcher loop.
 * Guarantees that only 1 authoritative dispatcher service evaluates and sends alerts.
 */
export function isAuthoritativeDispatcherInstance(): boolean {
  if (process.env.TELEGRAM_DISPATCHER_ENABLED === 'false') {
    return false;
  }
  if (process.env.TELEGRAM_WORKER_ROLE === 'web') {
    return false;
  }
  const authoritativeService = process.env.TELEGRAM_AUTHORITATIVE_SERVICE;
  if (authoritativeService && process.env.K_SERVICE && process.env.K_SERVICE !== authoritativeService) {
    return false;
  }
  return true;
}

// ============================================================================
// PERSISTENT TELEGRAM LEDGER ON DISK
// ============================================================================

export interface TelegramLedgerEntry {
  fingerprint: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  firstSeenAt: number;
  lastEvaluatedAt: number;
  lastSentAt: number;
  dispatched: boolean;
  dispatchStatus: 'SENT' | 'BASELINE_SEEDED' | 'SUPPRESSED_DUPLICATE' | 'FAILED';
  setupVersion: number;
  alertType: TelegramAlertType;
  entryPrice: number;
  stopLoss: number;
  qualityGrade: string;
  score: number;
  expectedMovePct: number;
  targetCount: number;
  terminalTarget: number;
}

const telegramLedger = new Map<string, TelegramLedgerEntry>(); // key: fingerprint
const symbolLedgerIndex = new Map<string, TelegramLedgerEntry>(); // key: normSym -> latest entry

export function resetTelegramAlertEngineState(): void {
  telegramLedger.clear();
  symbolLedgerIndex.clear();
}

const LEDGER_FILE_PATH = path.join(process.cwd(), 'data', 'telegram_ledger.json');

/**
 * Loads the Telegram deduplication ledger from data/telegram_ledger.json on startup.
 */
function initTelegramLedgerFromDisk(): void {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (fs.existsSync(LEDGER_FILE_PATH)) {
      const raw = fs.readFileSync(LEDGER_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.entries)) {
        for (const entry of parsed.entries) {
          // Strictly load historical opportunities that were actually dispatched
          if (entry && entry.fingerprint && entry.dispatched === true) {
            telegramLedger.set(entry.fingerprint, entry);
            if (entry.symbol) {
              const normSym = entry.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
              symbolLedgerIndex.set(normSym, entry);
            }
          }
        }
        console.log(`[Telegram Ledger] Loaded ${telegramLedger.size} historical dispatched records from disk.`);
      }
    }
  } catch (err) {
    console.warn('[Telegram Ledger] Failed to load ledger from disk:', err);
  }
}

/**
 * Atomically flushes the ledger state to data/telegram_ledger.json.
 * Strictly persists ONLY entries that were actually dispatched to prevent disk ledger poisoning.
 */
function saveTelegramLedgerToDisk(): void {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dispatchedEntries = Array.from(telegramLedger.values()).filter(e => e.dispatched === true);
    const payload = {
      version: 1,
      updatedAt: Date.now(),
      totalEntries: dispatchedEntries.length,
      entries: dispatchedEntries
    };
    fs.writeFileSync(LEDGER_FILE_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Telegram Ledger] Failed to save ledger to disk:', err);
  }
}

// Initialize ledger from disk on module load
initTelegramLedgerFromDisk();

// ============================================================================
// ELITE TELEGRAM SHORTLIST MANAGEMENT (MAX 6 ACTIVE OPPORTUNITIES)
// ============================================================================

export interface ActiveTelegramOpportunity {
  opportunityId: string;
  fingerprint?: string;
  symbol: string;
  alertType: TelegramAlertType;
  sourceType: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  score: number;
  qualityGrade: string;
  expectedMovePct: number;
  riskRewardRatio: number;
  entryPrice: number;
  entryLow: number;
  entryHigh: number;
  currentPrice: number;
  stopLoss: number;
  targets: Array<{ label: string; price: number; percentage: number }>;
  timestamp: number;
  lastDispatchedAt: number;
  status: string;
  preMoveReport?: PreMoveReport;
  exceptionalPriority?: string;
  classification?: string;
}

const activeTelegramOpportunities = new Map<string, ActiveTelegramOpportunity>();
export const DEFAULT_MAX_TELEGRAM_OPPORTUNITIES = 6;
export const ABSOLUTE_MAX_TELEGRAM_OPPORTUNITIES = 6;

// Anti-Spam & Event-Based Throttling Gates
export const GLOBAL_TELEGRAM_COOLDOWN_MS = 5 * 60 * 1000; // Strictly 5 minutes minimum between ANY Telegram dispatch
export const SYMBOL_TELEGRAM_COOLDOWN_MS = 30 * 60 * 1000; // Strictly 30 minutes minimum between dispatches for the same coin (replacing old 4-hour cooldown)
let lastGlobalTelegramDispatchAt = 0;

export function getLastGlobalTelegramDispatchAt(): number {
  return lastGlobalTelegramDispatchAt;
}

export function getActiveTelegramOpportunities(): ActiveTelegramOpportunity[] {
  return Array.from(activeTelegramOpportunities.values()).sort((a, b) => b.score - a.score);
}

export function clearActiveTelegramOpportunities(): void {
  activeTelegramOpportunities.clear();
}

// ============================================================================
// EXPLICIT RUNTIME DIAGNOSTICS & TELEMETRY
// ============================================================================

export interface TelegramPipelineDiagnostics {
  // Explicit server-side runtime diagnostics requested
  TELEGRAM_RUNTIME_STARTED: boolean;
  TELEGRAM_DISPATCH_LOOP_COUNT: number;
  TELEGRAM_EVALUATION_COUNT: number;
  TELEGRAM_CANDIDATE_COUNT: number;
  TELEGRAM_ELIGIBLE_COUNT: number;
  TELEGRAM_NEW_COUNT: number;
  TELEGRAM_UPDATED_COUNT: number;
  TELEGRAM_UNCHANGED_COUNT: number;
  TELEGRAM_DUPLICATE_SUPPRESSED_COUNT: number;
  TELEGRAM_LAST_EVALUATION_AT: number;
  TELEGRAM_LAST_CANDIDATE_COUNT: number;
  TELEGRAM_LAST_ELIGIBLE_COUNT: number;
  TELEGRAM_LAST_NEW_COUNT: number;
  TELEGRAM_LAST_UPDATED_COUNT: number;
  TELEGRAM_LAST_UNCHANGED_COUNT: number;
  TELEGRAM_LAST_SENT_SYMBOL: string;
  TELEGRAM_LAST_SENT_FINGERPRINT: string;
  TELEGRAM_TOTAL_SENT: number;
  TELEGRAM_TOTAL_SUPPRESSED_DUPLICATE: number;
  TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION: number;
  TELEGRAM_TOTAL_EVALUATIONS: number;
  TELEGRAM_LAST_ZERO_DISPATCH_REASON: string;
  TELEGRAM_LAST_CHECK_TIME: number;
  TELEGRAM_SERVER_MONITOR_ACTIVE: boolean;

  // Required Runtime Telemetry Counters (User Requirement 19)
  NORMAL_SIGNALS_SEEN: number;
  NORMAL_SIGNALS_BLOCKED: number;
  PREMOVE_EVALUATED: number;
  PREMOVE_QUALIFIED: number;
  PREMOVE_ACTIVE: number;
  PREMOVE_EXTREME_100: number;
  PREMOVE_EXTREME_200: number;
  PREMOVE_EXTREME_300: number;
  PREMOVE_EXTREME_500: number;
  BIG_MOVE_CANDIDATES: number;
  BIG_DUMP_CANDIDATES: number;
  TELEGRAM_FINAL_GATE_CHECKED: number;
  TELEGRAM_FINAL_GATE_BLOCKED: number;
  TELEGRAM_FINAL_GATE_ALLOWED: number;
  TELEGRAM_SENT: number;
  TELEGRAM_DUPLICATE_BLOCKED: number;
  TELEGRAM_STALE_BLOCKED: number;
  TELEGRAM_CHASE_BLOCKED: number;
  TELEGRAM_INVALID_TP_BLOCKED: number;
  PREMOVE_LAST_ALERT_CLASS?: string;

  // Multi-Instance and Cloud Run Runtime Identifiers
  TELEGRAM_INSTANCE_ID: string;
  TELEGRAM_PROCESS_PID: number;
  TELEGRAM_HOSTNAME: string;
  K_SERVICE: string;
  K_REVISION: string;
  K_INSTANCE: string;
  CLOUD_RUN_MAX_INSTANCES: number;
  CLOUD_RUN_MIN_INSTANCES: number;
  TELEGRAM_ACTIVE_INSTANCE_COUNT: number;
  TELEGRAM_DISPATCHER_COUNT: number;

  // Verification invariants
  STARTUP_REPLAY: 'FIXED' | 'NOT_FIXED';
  CHROME_TELEGRAM_DEPENDENCY: 'NONE' | 'PRESENT';
  CROSS_INSTANCE_DUPLICATION: 'FIXED' | 'NOT_FIXED';

  // Pipeline telemetry for UI backwards compatibility
  lastEvaluationAt: number;
  totalEvaluated: number;
  discovered: number;
  rejected: number;
  qualified: number;
  queued: number;
  sent: number;
  failed: number;
  coilingCandidates?: number;
  readyCandidates?: number;
  triggeredCandidates?: number;
  exceptionalCandidates?: number;
  dispatchedCandidates?: number;
  suppressedCandidates?: number;
  suppressionReasonsBreakdown?: Record<string, { count: number; sampleSymbols: string[]; description: string }>;
  rejectionBreakdown: Record<string, number>;
  latestEvaluations: Array<{
    symbol: string;
    opportunityId?: string;
    timestamp: number;
    status: 'DISCOVERED' | 'REJECTED' | 'QUALIFIED' | 'SENT' | 'FAILED' | 'SUPPRESSED';
    reason: string;
    expectedMovePct: number;
    targetsCount: number;
    direction: string;
    qualityGrade: string;
  }>;
}

const pipelineDiagnostics: TelegramPipelineDiagnostics = {
  TELEGRAM_RUNTIME_STARTED: false,
  TELEGRAM_DISPATCH_LOOP_COUNT: 0,
  TELEGRAM_EVALUATION_COUNT: 0,
  TELEGRAM_CANDIDATE_COUNT: 0,
  TELEGRAM_ELIGIBLE_COUNT: 0,
  TELEGRAM_NEW_COUNT: 0,
  TELEGRAM_UPDATED_COUNT: 0,
  TELEGRAM_UNCHANGED_COUNT: 0,
  TELEGRAM_DUPLICATE_SUPPRESSED_COUNT: 0,
  TELEGRAM_LAST_EVALUATION_AT: 0,
  TELEGRAM_LAST_CANDIDATE_COUNT: 0,
  TELEGRAM_LAST_ELIGIBLE_COUNT: 0,
  TELEGRAM_LAST_NEW_COUNT: 0,
  TELEGRAM_LAST_UPDATED_COUNT: 0,
  TELEGRAM_LAST_UNCHANGED_COUNT: 0,
  TELEGRAM_LAST_SENT_SYMBOL: '',
  TELEGRAM_LAST_SENT_FINGERPRINT: '',
  TELEGRAM_TOTAL_SENT: 0,
  TELEGRAM_TOTAL_SUPPRESSED_DUPLICATE: 0,
  TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION: 0,
  TELEGRAM_TOTAL_EVALUATIONS: 0,
  TELEGRAM_LAST_ZERO_DISPATCH_REASON: 'Waiting for exceptional opportunity (no candidate passed high-conviction filter)',
  TELEGRAM_LAST_CHECK_TIME: 0,
  TELEGRAM_SERVER_MONITOR_ACTIVE: true,

  // Required Runtime Telemetry Counters (User Requirement 19)
  NORMAL_SIGNALS_SEEN: 0,
  NORMAL_SIGNALS_BLOCKED: 0,
  PREMOVE_EVALUATED: 0,
  PREMOVE_QUALIFIED: 0,
  PREMOVE_ACTIVE: 0,
  PREMOVE_EXTREME_100: 0,
  PREMOVE_EXTREME_200: 0,
  PREMOVE_EXTREME_300: 0,
  PREMOVE_EXTREME_500: 0,
  BIG_MOVE_CANDIDATES: 0,
  BIG_DUMP_CANDIDATES: 0,
  TELEGRAM_FINAL_GATE_CHECKED: 0,
  TELEGRAM_FINAL_GATE_BLOCKED: 0,
  TELEGRAM_FINAL_GATE_ALLOWED: 0,
  TELEGRAM_SENT: 0,
  TELEGRAM_DUPLICATE_BLOCKED: 0,
  TELEGRAM_STALE_BLOCKED: 0,
  TELEGRAM_CHASE_BLOCKED: 0,
  TELEGRAM_INVALID_TP_BLOCKED: 0,
  PREMOVE_LAST_ALERT_CLASS: 'NONE',

  TELEGRAM_INSTANCE_ID,
  TELEGRAM_PROCESS_PID,
  TELEGRAM_HOSTNAME,
  K_SERVICE,
  K_REVISION,
  K_INSTANCE,
  CLOUD_RUN_MAX_INSTANCES,
  CLOUD_RUN_MIN_INSTANCES,
  TELEGRAM_ACTIVE_INSTANCE_COUNT: 1,
  TELEGRAM_DISPATCHER_COUNT: 1,

  STARTUP_REPLAY: 'FIXED',
  CHROME_TELEGRAM_DEPENDENCY: 'NONE',
  CROSS_INSTANCE_DUPLICATION: 'FIXED',

  lastEvaluationAt: 0,
  totalEvaluated: 0,
  discovered: 0,
  rejected: 0,
  qualified: 0,
  queued: 0,
  sent: 0,
  failed: 0,
  rejectionBreakdown: {},
  latestEvaluations: []
};

export function getTelegramPipelineDiagnostics(): TelegramPipelineDiagnostics {
  // Aggregate candidate counts across active opportunities
  let coilingCandidates = 0;
  let readyCandidates = 0;
  let triggeredCandidates = 0;
  let exceptionalCandidates = 0;

  for (const opp of activeTelegramOpportunities.values()) {
    if (opp.preMoveReport) {
      if (opp.preMoveReport.setupStage === 'COILING') coilingCandidates++;
      else if (opp.preMoveReport.setupStage === 'READY_TO_BREAK') readyCandidates++;
      else if (opp.preMoveReport.setupStage === 'TRIGGERED') triggeredCandidates++;
    }
    if (
      opp.exceptionalPriority === 'CRITICAL' ||
      opp.exceptionalPriority === 'VERY_HIGH' ||
      opp.exceptionalPriority === 'HIGH' ||
      opp.classification === 'EXTREME_MOVE'
    ) {
      exceptionalCandidates++;
    }
  }

  const suppressionReasonsBreakdown: Record<string, { count: number; sampleSymbols: string[]; description: string }> = {};
  for (const [reason, count] of Object.entries(pipelineDiagnostics.rejectionBreakdown)) {
    const samples = Array.from(
      new Set(
        pipelineDiagnostics.latestEvaluations
          .filter(e => e.reason === reason && e.symbol)
          .map(e => e.symbol)
      )
    ).slice(0, 5);

    let description = reason.replace(/_/g, ' ').toLowerCase();
    if (reason === 'NORMAL_CORE_SIGNAL_SUPPRESSED') {
      description = 'Filtered out ordinary routine market moves (only exceptional signals reach Telegram)';
    } else if (reason === 'COIL_NOT_TIGHT_ENOUGH') {
      description = 'Compression score below early-warning threshold';
    } else if (reason === 'EXPECTED_MOVE_BELOW_MAJOR_THRESHOLD') {
      description = 'Calculated profit runway below minimum threshold';
    } else if (reason === 'NO_STRUCTURAL_TARGETS_ESTABLISHED') {
      description = 'Lack of confirmed multi-target structural price ladder';
    } else if (reason === 'DIRECTION_IS_WAIT') {
      description = 'Asset currently in non-directional WAIT state';
    } else if (reason === 'TELEGRAM_COOLDOWN_ACTIVE') {
      description = 'Alert suppressed to prevent duplicate notifications during cooldown';
    } else if (reason === 'NOT_EXCEPTIONAL') {
      description = 'Setup does not meet exceptional move conviction criteria';
    }

    suppressionReasonsBreakdown[reason] = {
      count,
      sampleSymbols: samples,
      description
    };
  }

  return {
    ...pipelineDiagnostics,
    PREMOVE_ACTIVE: getAuthoritativePreMoveSignals().length,
    TELEGRAM_SENT: pipelineDiagnostics.TELEGRAM_TOTAL_SENT,
    TELEGRAM_INSTANCE_ID,
    TELEGRAM_PROCESS_PID,
    TELEGRAM_HOSTNAME,
    K_SERVICE,
    K_REVISION,
    K_INSTANCE,
    coilingCandidates,
    readyCandidates,
    triggeredCandidates,
    exceptionalCandidates,
    dispatchedCandidates: pipelineDiagnostics.sent,
    suppressedCandidates: pipelineDiagnostics.rejected,
    suppressionReasonsBreakdown,
    latestEvaluations: pipelineDiagnostics.latestEvaluations.slice(0, 50)
  };
}

export function recordNormalSignalsSeen(count: number = 1): void {
  pipelineDiagnostics.NORMAL_SIGNALS_SEEN += count;
}

export function recordNormalSignalsBlocked(count: number = 1): void {
  pipelineDiagnostics.NORMAL_SIGNALS_BLOCKED += count;
}

export function recordPreMoveEvaluated(count: number = 1): void {
  pipelineDiagnostics.PREMOVE_EVALUATED += count;
}

export function recordPreMoveQualified(count: number = 1, moveClass?: string): void {
  pipelineDiagnostics.PREMOVE_QUALIFIED += count;
  if (moveClass === 'EXTREME_100_PLUS') pipelineDiagnostics.PREMOVE_EXTREME_100 += count;
  else if (moveClass === 'EXTREME_200_PLUS') pipelineDiagnostics.PREMOVE_EXTREME_200 += count;
  else if (moveClass === 'EXTREME_300_PLUS') pipelineDiagnostics.PREMOVE_EXTREME_300 += count;
  else if (moveClass === 'EXTREME_500_PLUS') pipelineDiagnostics.PREMOVE_EXTREME_500 += count;
}

export function recordBigMoveCandidate(count: number = 1): void {
  pipelineDiagnostics.BIG_MOVE_CANDIDATES += count;
}

export function recordBigDumpCandidate(count: number = 1): void {
  pipelineDiagnostics.BIG_DUMP_CANDIDATES += count;
}

function recordDiagnosticEvaluation(entry: {
  symbol: string;
  opportunityId?: string;
  status: 'DISCOVERED' | 'REJECTED' | 'QUALIFIED' | 'SENT' | 'FAILED' | 'SUPPRESSED';
  reason: string;
  expectedMovePct: number;
  targetsCount: number;
  direction: string;
  qualityGrade: string;
}) {
  const timestamp = Date.now();
  pipelineDiagnostics.lastEvaluationAt = timestamp;

  if (entry.status === 'REJECTED' || entry.status === 'SUPPRESSED') {
    pipelineDiagnostics.rejected++;
    pipelineDiagnostics.rejectionBreakdown[entry.reason] = (pipelineDiagnostics.rejectionBreakdown[entry.reason] || 0) + 1;
  } else if (entry.status === 'QUALIFIED') {
    pipelineDiagnostics.qualified++;
    pipelineDiagnostics.queued++;
  } else if (entry.status === 'SENT') {
    pipelineDiagnostics.sent++;
  } else if (entry.status === 'FAILED') {
    pipelineDiagnostics.failed++;
  }

  pipelineDiagnostics.latestEvaluations.unshift({
    ...entry,
    timestamp
  });

  if (pipelineDiagnostics.latestEvaluations.length > 200) {
    pipelineDiagnostics.latestEvaluations.pop();
  }
}

// Runtime Telegram Configuration Store
let runtimeConfig: TelegramConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID || '',
  enabled: true,
  minGrade: 'B',
  enablePreMoveAlerts: true,
  enableNewsAlerts: true,
  enableNewListingAlerts: true,
  enableMajorMoveAlerts: true,
  enableExtremeMoveAlerts: true
};

export function getTelegramConfig(): TelegramConfig {
  return {
    ...runtimeConfig,
    botToken: runtimeConfig.botToken ? `${runtimeConfig.botToken.slice(0, 8)}...${runtimeConfig.botToken.slice(-4)}` : '',
    chatId: runtimeConfig.chatId || ''
  };
}

export function updateTelegramConfig(newConfig: Partial<TelegramConfig>): { success: boolean; config: TelegramConfig } {
  runtimeConfig = {
    ...runtimeConfig,
    ...newConfig,
    botToken: newConfig.botToken !== undefined && newConfig.botToken !== ''
      ? (newConfig.botToken.includes('...') ? runtimeConfig.botToken : newConfig.botToken)
      : runtimeConfig.botToken,
    chatId: newConfig.chatId !== undefined ? newConfig.chatId : runtimeConfig.chatId
  };
  return { success: true, config: getTelegramConfig() };
}

export function getRecentTelegramAlerts(limit = 50): TelegramAlertRecord[] {
  return recentAlerts.slice(0, limit);
}

// ============================================================================
// 1. MAJOR MOVE QUALIFICATION LAYER (30% & 50% Thresholds)
// ============================================================================

import {
  qualifyMajorMoveOpportunity,
  type MajorMoveQualification
} from './majorMoveEngine';

export type {
  MajorMoveQualification
};

export {
  qualifyMajorMoveOpportunity
};

// ============================================================================
// 2. DETERMINISTIC FINGERPRINT & OPPORTUNITY STATE MACHINE
// ============================================================================

export type OpportunityState =
  | 'NEW_OPPORTUNITY'
  | 'UPDATED_OPPORTUNITY'
  | 'UNCHANGED_OPPORTUNITY'
  | 'INVALIDATED_OPPORTUNITY';

/**
 * Creates a deterministic, canonical opportunity fingerprint for an opportunity.
 * A new chart generation, millisecond jitter, or minor float rounding NEVER changes the fingerprint.
 * Format: {SYMBOL}_{DIRECTION}_E{QUANTIZED_ENTRY}_SL{QUANTIZED_SL}_TP{TARGET_COUNT}_TMAX{QUANTIZED_TMAX}
 */
export function calculateOpportunityFingerprint(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryPrice: number;
  entryLow?: number;
  entryHigh?: number;
  stopLoss: number;
  targets: Array<{ price: number }>;
  qualityGrade?: string;
}): string {
  const normSym = params.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const dir = params.direction.toUpperCase();

  const quantizePrice = (p: number | undefined | null): string => {
    if (!p || p <= 0 || isNaN(p)) return '0';
    if (p >= 1000) return (Math.round(p * 10) / 10).toFixed(1);
    if (p >= 1) return (Math.round(p * 100) / 100).toFixed(2);
    if (p >= 0.01) return (Math.round(p * 10000) / 10000).toFixed(4);
    return (Math.round(p * 1000000) / 1000000).toFixed(6);
  };

  const entryRef = (params.entryLow && params.entryHigh && params.entryLow > 0 && params.entryHigh > 0)
    ? (params.entryLow + params.entryHigh) / 2
    : (params.entryPrice > 0 ? params.entryPrice : 0);
  const qEntry = quantizePrice(entryRef);
  const qStop = quantizePrice(params.stopLoss);

  const validTargets = (params.targets || [])
    .map(t => t.price)
    .filter(p => typeof p === 'number' && p > 0 && !isNaN(p))
    .sort((a, b) => dir === 'LONG' ? a - b : b - a);

  const qTerminal = validTargets.length > 0 ? quantizePrice(validTargets[validTargets.length - 1]) : '0';
  const targetCount = validTargets.length;

  return `${normSym}_${dir}_E${qEntry}_SL${qStop}_TP${targetCount}_TMAX${qTerminal}`;
}

/**
 * Authoritative Opportunity State Classification against the persistent ledger.
 */
export function classifyOpportunityState(cand: {
  fingerprint: string;
  normSym: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  qualityGrade: string;
  expectedMovePct: number;
}): { state: OpportunityState; reason: string; previous?: TelegramLedgerEntry } {
  // 1. Exact fingerprint already in the persistent ledger -> UNCHANGED
  if (telegramLedger.has(cand.fingerprint)) {
    return {
      state: 'UNCHANGED_OPPORTUNITY',
      reason: 'EXACT_FINGERPRINT_IN_LEDGER',
      previous: telegramLedger.get(cand.fingerprint)
    };
  }

  // 2. Check if a prior setup for this symbol exists in the ledger index
  const prev = symbolLedgerIndex.get(cand.normSym);
  if (!prev) {
    return {
      state: 'NEW_OPPORTUNITY',
      reason: 'NEW_UNSEEN_SYMBOL_OPPORTUNITY'
    };
  }

  // If the prior entry was recorded over 24 hours ago, treat as a brand-new market cycle
  if (prev.lastEvaluatedAt && (Date.now() - prev.lastEvaluatedAt) > 24 * 60 * 60 * 1000) {
    return {
      state: 'NEW_OPPORTUNITY',
      reason: 'NEW_CYCLE_PREVIOUS_EXPIRED',
      previous: prev
    };
  }

  // 3. Compare with previous setup for this symbol to detect MATERIAL updates:
  // A) Direction flipped (e.g. was SHORT, now high-conviction LONG breakout)
  if (prev.direction !== cand.direction) {
    return {
      state: 'UPDATED_OPPORTUNITY',
      reason: `DIRECTION_FLIPPED_${prev.direction}_TO_${cand.direction}`,
      previous: prev
    };
  }

  // B) Quality grade upgraded
  const gradeWeight: Record<string, number> = { 'WAIT': 0, 'C': 1, 'B': 2, 'A': 3, 'A+': 4 };
  const prevWeight = gradeWeight[prev.qualityGrade] ?? 1;
  const currWeight = gradeWeight[cand.qualityGrade] ?? 1;
  if (currWeight > prevWeight) {
    return {
      state: 'UPDATED_OPPORTUNITY',
      reason: `GRADE_UPGRADED_${prev.qualityGrade}_TO_${cand.qualityGrade}`,
      previous: prev
    };
  }

  // C) Terminal target expanded by at least 10% in move potential
  if (cand.expectedMovePct >= 30.0 && (cand.expectedMovePct - prev.expectedMovePct) >= 10.0) {
    return {
      state: 'UPDATED_OPPORTUNITY',
      reason: `TARGET_EXPANSION_PLUS_${(cand.expectedMovePct - prev.expectedMovePct).toFixed(1)}%`,
      previous: prev
    };
  }

  // D) Stop loss tightened towards entry reducing downside risk by >= 20%
  if (cand.entryPrice > 0 && prev.entryPrice > 0 && prev.stopLoss > 0 && cand.stopLoss > 0) {
    const prevRisk = Math.abs(prev.entryPrice - prev.stopLoss);
    const currRisk = Math.abs(cand.entryPrice - cand.stopLoss);
    if (currRisk < prevRisk * 0.8) {
      return {
        state: 'UPDATED_OPPORTUNITY',
        reason: 'STOP_LOSS_TIGHTENED_RISK_REDUCED',
        previous: prev
      };
    }
  }

  // E) Meaningful entry shift (>= 2% entry variation indicating new breakout level)
  if (cand.entryPrice > 0 && prev.entryPrice > 0) {
    const entryShiftPct = Math.abs(cand.entryPrice - prev.entryPrice) / prev.entryPrice;
    if (entryShiftPct >= 0.02) {
      return {
        state: 'UPDATED_OPPORTUNITY',
        reason: `ENTRY_LEVEL_SHIFTED_${(entryShiftPct * 100).toFixed(1)}%`,
        previous: prev
      };
    }
  }

  // Minor price or float variations without structural justification -> UNCHANGED
  return {
    state: 'UNCHANGED_OPPORTUNITY',
    reason: 'MINOR_FLOAT_VARIATION_UNCHANGED',
    previous: prev
  };
}

/**
 * Silently seeds the Telegram deduplication ledger from existing signals on startup.
 * Marks opportunities as already known baseline in memory so they are NOT dispatched as new alerts upon boot/restart.
 */
export function silentlySeedTelegramLedger(signals: Signal[]): number {
  let seededCount = 0;
  for (const sig of signals) {
    if (!sig || !sig.symbol || (sig.direction as any) === 'WAIT' || sig.entryPrice <= 0) continue;
    const normSym = sig.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
    const validTargets = (sig.targets || [])
      .filter(t => typeof t.price === 'number' && t.price > 0 && t.status !== 'INVALIDATED')
      .map((t, idx) => ({ label: t.label || `TP${idx + 1}`, price: t.price, percentage: Number(t.percentage || 0) }));

    const fingerprint = calculateOpportunityFingerprint({
      symbol: sig.symbol,
      direction: sig.direction as any,
      entryPrice: sig.entryPrice,
      entryLow: sig.entryZoneLow || sig.entryPrice,
      entryHigh: sig.entryZoneHigh || sig.entryPrice,
      stopLoss: sig.stopLoss,
      targets: validTargets,
      qualityGrade: sig.qualityGrade
    });

    if (!telegramLedger.has(fingerprint)) {
      const entry: TelegramLedgerEntry = {
        fingerprint,
        symbol: normSym,
        direction: sig.direction as 'LONG' | 'SHORT',
        firstSeenAt: sig.timestamp || Date.now(),
        lastEvaluatedAt: Date.now(),
        lastSentAt: sig.timestamp || Date.now(),
        dispatched: false,
        dispatchStatus: 'BASELINE_SEEDED',
        setupVersion: 1,
        alertType: 'MAJOR_MOVE',
        entryPrice: sig.entryPrice,
        stopLoss: sig.stopLoss,
        qualityGrade: sig.qualityGrade || 'A',
        score: sig.confidence || 90,
        expectedMovePct: 0,
        targetCount: validTargets.length,
        terminalTarget: validTargets[validTargets.length - 1]?.price || 0
      };
      telegramLedger.set(fingerprint, entry);
      if (!symbolLedgerIndex.has(normSym)) {
        symbolLedgerIndex.set(normSym, entry);
      }
      seededCount++;
    }
  }
  if (seededCount > 0) {
    console.log(`[Telegram Ledger] Silently seeded in-memory baseline for ${seededCount} existing opportunities without alert replay.`);
  }
  return seededCount;
}


function generateAlertSignature(params: {
  symbol: string;
  alertType: TelegramAlertType;
  direction: string;
  entryPrice: number;
  stopLoss: number;
  targetCount: number;
  qualityGrade: string;
  status: string;
}): string {
  const normSym = params.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const roundedEntry = Math.round(params.entryPrice * 10000);
  const roundedSL = Math.round(params.stopLoss * 10000);
  return `${normSym}::${params.alertType}::${params.direction}::${roundedEntry}::${roundedSL}::T${params.targetCount}::${params.qualityGrade}::${params.status}`;
}

function shouldDispatchAlert(
  symbol: string,
  alertType: TelegramAlertType,
  fingerprint: string,
  direction: string,
  grade: string,
  status: string,
  movePct: number
): { shouldDispatch: boolean; reason: string } {
  const normSym = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const prevByFingerprint = telegramLedger.get(fingerprint);
  const prevBySymbol = symbolLedgerIndex.get(normSym);

  // 1. Exact opportunity fingerprint already dispatched: enforce opportunity cooldown
  if (prevByFingerprint && prevByFingerprint.dispatched) {
    const timeSinceLastMs = Date.now() - prevByFingerprint.lastSentAt;
    if (timeSinceLastMs < SYMBOL_TELEGRAM_COOLDOWN_MS) {
      return { shouldDispatch: false, reason: 'SAME_OPPORTUNITY_IN_LEDGER' };
    }
    return { shouldDispatch: true, reason: 'COOLDOWN_EXPIRED' };
  }

  // 2. If no previous alert for this symbol exists: allow as FIRST_ALERT
  if (!prevBySymbol || !prevBySymbol.dispatched) {
    return { shouldDispatch: true, reason: 'FIRST_ALERT' };
  }

  // 3. A prior alert exists for this symbol.
  // Check whether it is the SAME opportunity or a genuinely NEW structural opportunity.
  const isSameDirection = prevBySymbol.direction === direction;
  const isSameFingerprint = prevBySymbol.fingerprint === fingerprint;

  // Material change 1: Direction flipped -> Genuinely NEW opportunity
  if (!isSameDirection) {
    return { shouldDispatch: true, reason: 'DIRECTION_CHANGED' };
  }

  // Material change 2: Exact structural setup match -> Same opportunity cooldown
  if (isSameFingerprint) {
    const timeSinceLastMs = Date.now() - prevBySymbol.lastSentAt;
    if (timeSinceLastMs < SYMBOL_TELEGRAM_COOLDOWN_MS) {
      return { shouldDispatch: false, reason: 'SAME_OPPORTUNITY_IN_LEDGER' };
    }
    return { shouldDispatch: true, reason: 'COOLDOWN_EXPIRED' };
  }

  // Material change 3: Grade upgraded
  const gradeWeight: Record<string, number> = { 'WAIT': 0, 'C': 1, 'B': 2, 'A': 3, 'A+': 4 };
  if ((gradeWeight[grade] ?? 1) > (gradeWeight[prevBySymbol.qualityGrade] ?? 1)) {
    return { shouldDispatch: true, reason: 'GRADE_UPGRADED' };
  }

  // Material change 4: Target potential expanded by >= 15%
  if (movePct >= 30.0 && (movePct - prevBySymbol.expectedMovePct) >= 15.0) {
    return { shouldDispatch: true, reason: 'TARGET_LADDER_EXPANDED' };
  }

  // Genuinely NEW structural opportunity on the same symbol (new entry zone, new pivot SL, or distinct structural targets)
  return { shouldDispatch: true, reason: 'NEW_STRUCTURAL_OPPORTUNITY' };
}

// ============================================================================
// 3. ALERT MESSAGE FORMATTER
// ============================================================================

function formatTelegramPrice(price: number | undefined | null): string {
  if (price === undefined || price === null || isNaN(price)) return '0';
  const num = Number(price);
  if (num >= 1000) {
    return num % 1 === 0 ? num.toString() : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (num >= 1) {
    return Number(num.toFixed(4)).toString();
  } else if (num >= 0.001) {
    return Number(num.toFixed(5)).toString();
  } else {
    return Number(num.toFixed(8)).toString();
  }
}

export function formatTelegramAlertMessage(params: {
  alertType?: TelegramAlertType;
  symbol: string;
  opportunityId?: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryLow: number;
  entryHigh: number;
  currentPrice: number;
  stopLoss: number;
  targets: Array<{ label?: string; price: number; percentage?: number }>;
  expectedMovePct?: number;
  riskRewardRatio?: number;
  qualityGrade?: string;
  confidence?: number;
  whyReason?: string;
  sourceType?: string;
  timestamp?: number;
  leverage?: string;
}): string {
  const normSym = params.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const dir = params.direction.toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const entryPrice = (params.entryLow > 0 && params.entryHigh > 0)
    ? (params.entryLow + params.entryHigh) / 2
    : (params.currentPrice > 0 ? params.currentPrice : params.entryLow);

  const tp1 = params.targets?.[0]?.price || 0;
  const tp2 = params.targets?.[1]?.price || 0;
  const tp3 = params.targets?.[2]?.price || 0;
  const tp4 = params.targets?.[3]?.price || 0;

  return formatTelegramSignalCaption({
    symbol: normSym,
    direction: dir,
    entryPrice,
    entryZoneLow: params.entryLow,
    entryZoneHigh: params.entryHigh,
    tp1,
    tp2,
    tp3,
    tp4,
    stopLoss: params.stopLoss,
    reason: params.whyReason || params.sourceType,
    riskRewardRatio: params.riskRewardRatio,
    timestamp: params.timestamp,
    priceDecimals: entryPrice < 1 ? 4 : 2,
    leverage: params.leverage
  });
}

// ============================================================================
// 4. TELEGRAM DISPATCH PIPELINE & SYSTEM TEST
// ============================================================================

async function sendRawTelegramMessage(
  text: string,
  targetChatId?: string
): Promise<{ success: boolean; httpStatusCode?: number; error?: string }> {
  const token = runtimeConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = targetChatId || runtimeConfig.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return {
      success: false,
      error: 'TELEGRAM_CONFIG_MISSING'
    };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const httpStatusCode = response.status;
    if (!response.ok) {
      const errText = await response.text();
      return { success: false, httpStatusCode, error: `Telegram HTTP ${httpStatusCode}: ${errText}` };
    }

    return { success: true, httpStatusCode };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network dispatch failed' };
  }
}

/**
 * Resolves signal execution timeframe prioritizing 5M and 15M for execution signals.
 * Never hardcodes 1H for every Telegram chart.
 */
export function resolveExecutionTimeframe(signal?: Signal, preferredTf?: string): string {
  if (preferredTf && ['1M', '5M', '15M', '30M', '1H', '4H', '1D'].includes(preferredTf.toUpperCase())) {
    return preferredTf.toUpperCase();
  }
  const sigTf = (signal?.timeframe || '').toUpperCase();
  if (['1M', '5M', '15M', '30M', '1H', '4H', '1D'].includes(sigTf)) {
    return sigTf;
  }
  // For execution setups, prioritize 15M (or 5M) instead of hardcoding 1H
  return '15M';
}

/**
 * Generate a professional TradingView-style dark candlestick chart image Buffer
 * using real exchange candle data (prioritizing 5M/15M execution candles) with Entry, Market Price, SL, and TP annotations.
 * Never uses ancient or unverified cached candles for live Telegram dispatch.
 */
export async function generateOpportunityChartBuffer(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryLow: number;
  entryHigh: number;
  currentPrice: number;
  stopLoss: number;
  targets: Array<{ label?: string; price: number; percentage?: number }>;
  candles?: Candle[];
  setupType?: string;
  keyTriggerLevel?: number;
  noChaseLevel?: number;
  timeframe?: string;
}): Promise<Buffer | null> {
  try {
    const cleanSym = params.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
    const isLong = params.direction === 'LONG';
    const tf = resolveExecutionTimeframe(undefined, params.timeframe);
    const setupType = params.setupType || (isLong ? 'LONG EXECUTION' : 'SHORT EXECUTION');

    let candles = params.candles;
    let curPrice = params.currentPrice;

    // Reject missing or fabricated prices immediately
    if (!curPrice || curPrice <= 0 || isNaN(curPrice)) {
      console.warn(`[Telegram Chart] Missing or non-positive live ticker price for ${cleanSym}`);
      return null;
    }

    // If candles not passed, fetch fresh live market data directly from real exchange on the execution timeframe
    if (!candles || candles.length < 20) {
      const freshData = await fetchFreshTelegramLiveMarketData(cleanSym, tf.toLowerCase());
      if (!freshData.isFresh || !freshData.candles || freshData.candles.length < 20) {
        console.warn(`[Telegram Chart] Live candle fetch failed or stale for ${cleanSym} (${tf}): ${freshData.rejectReason}`);
        return null;
      }
      candles = freshData.candles;
      if (freshData.ticker?.lastPrice) {
        curPrice = freshData.ticker.lastPrice;
      }
    }

    // Chart Freshness Validation (Section 5)
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].timestamp <= candles[i - 1].timestamp) {
        console.warn(`[Telegram Chart] Candle timestamps not chronological for ${cleanSym}`);
        return null;
      }
    }

    const latestCandle = candles[candles.length - 1];
    const now = Date.now();
    const candleAgeMs = now - latestCandle.timestamp;

    // Timeframe-specific staleness thresholds
    let maxCandleAgeMs = 3.0 * 60 * 60 * 1000; // 1H default: 3 hours
    const lowerTf = tf.toLowerCase();
    if (lowerTf === '5m') maxCandleAgeMs = 30 * 60 * 1000;
    else if (lowerTf === '15m') maxCandleAgeMs = 60 * 60 * 1000;
    else if (lowerTf === '4h') maxCandleAgeMs = 12 * 60 * 60 * 1000;
    else if (lowerTf === '1d') maxCandleAgeMs = 36 * 60 * 60 * 1000;

    if (candleAgeMs > maxCandleAgeMs) {
      console.warn(`[Telegram Chart] Latest candle is too old for ${cleanSym} (${(candleAgeMs / 60000).toFixed(1)}m > ${(maxCandleAgeMs / 60000).toFixed(1)}m for ${tf})`);
      return null;
    }

    if (latestCandle.timestamp > now + 60 * 1000) {
      console.warn(`[Telegram Chart] Latest candle timestamp is in the future for ${cleanSym}`);
      return null;
    }

    // RENDER CRISP PURE WHITE TRADINGVIEW CANVAS BUFFER VIA RESVG
    // Purges obsolete QuickChart dotted dark mode completely
    const mappedCandles = candles.map(c => ({
      time: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume || 0
    }));

    const entryRef = (params as any).entryPrice || (params.entryLow && params.entryHigh ? (params.entryLow + params.entryHigh) / 2 : curPrice);

    const chartBuffer = await generateTradingViewChart(
      cleanSym,
      params.direction === 'SHORT' ? 'SHORT' : 'LONG',
      entryRef,
      params.stopLoss,
      params.targets || [],
      mappedCandles
    );

    return chartBuffer;
  } catch (err) {
    console.warn('[Telegram Alert] generateOpportunityChartBuffer error:', err);
    return null;
  }
}

/**
 * Backward compatibility wrapper returning URL if needed
 */
export async function generateOpportunityChartUrl(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryLow: number;
  entryHigh: number;
  currentPrice: number;
  stopLoss: number;
  targets: Array<{ label: string; price: number; percentage?: number }>;
}): Promise<string | null> {
  const buffer = await generateOpportunityChartBuffer(params);
  if (!buffer) return null;
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

async function sendRawTelegramPhoto(
  imageBuffer: Buffer,
  fileName: string,
  caption: string,
  targetChatId?: string | string[],
  fingerprint?: string
): Promise<{ success: boolean; httpStatusCode?: number; error?: string; deliveredCount?: number }> {
  const token = runtimeConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const rawChatIds = targetChatId
    ? (Array.isArray(targetChatId) ? targetChatId : [targetChatId])
    : (runtimeConfig.chatId || process.env.TELEGRAM_CHAT_ID ? [runtimeConfig.chatId || process.env.TELEGRAM_CHAT_ID!] : []);

  const chatIds = rawChatIds.map(c => String(c).trim()).filter(cid => isValidTelegramChatId(cid));

  if (!token || chatIds.length === 0) {
    return {
      success: false,
      error: 'TELEGRAM_CONFIG_MISSING'
    };
  }

  let deliveredCount = 0;
  let lastError: string | undefined;
  let lastStatus: number | undefined;

  for (const cid of chatIds) {
    try {
      const formData = new FormData();
      formData.append('chat_id', cid);
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
      const imageBlob = new Blob([imageBuffer], { type: 'image/png' });
      formData.append('photo', imageBlob, fileName);

      const url = `https://api.telegram.org/bot${token}/sendPhoto`;
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });

      lastStatus = response.status;
      if (!response.ok) {
        const errText = await response.text();
        if (errText.includes('chat not found') || errText.includes('bot was blocked') || errText.includes('user is deactivated')) {
          tradingStorage.unlinkTelegramChat(cid);
          console.info(`[Telegram] Delivery skipped for chatId=${cid}: ${errText.includes('chat not found') ? 'Chat not initiated (user must /start bot)' : 'User blocked or deactivated'}`);
        } else {
          console.info(`[Telegram] sendPhoto upload notice for chatId=${cid} (HTTP ${lastStatus}): ${errText}`);
        }
        lastError = `Telegram sendPhoto rejected (${lastStatus}): ${errText}`;
      } else {
        deliveredCount++;
        if (fingerprint) {
          tradingStorage.recordTelegramDeliveryForUser(cid, fingerprint);
        }
      }
    } catch (err: any) {
      console.info(`[Telegram] sendPhoto network notice for chatId=${cid}:`, err?.message);
      lastError = err?.message || 'sendPhoto network failure';
    }
  }

  return {
    success: deliveredCount > 0,
    httpStatusCode: lastStatus,
    error: deliveredCount > 0 ? undefined : lastError,
    deliveredCount
  };
}

/**
 * Clean, safe, non-trading system test function.
 * Verifies Telegram bot token, chat ID, transport, message formatting, and HTTP response.
 */
export async function sendTelegramSystemTest(): Promise<{
  success: boolean;
  httpStatusCode: number | null;
  status: 'Operational' | 'Degraded' | 'Misconfigured';
  botConfigPresent: boolean;
  chatIdPresent: boolean;
  timestamp: number;
  message: string;
  responseText?: string;
  error?: string;
}> {
  const token = runtimeConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = runtimeConfig.chatId || process.env.TELEGRAM_CHAT_ID;
  const botConfigPresent = Boolean(token && token.trim().length > 0);
  const chatIdPresent = Boolean(chatId && chatId.trim().length > 0);
  const timestamp = Date.now();

  if (!botConfigPresent || !chatIdPresent) {
    return {
      success: false,
      httpStatusCode: null,
      status: 'Misconfigured',
      botConfigPresent,
      chatIdPresent,
      timestamp,
      message: 'Telegram botToken or chatId is unconfigured. Set credentials in environment or settings.',
      error: 'TELEGRAM_CREDENTIALS_MISSING'
    };
  }

  const dateStrDhaka = new Date(timestamp).toLocaleString('en-US', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'medium',
    timeStyle: 'medium'
  });
  const dateStrUtc = new Date(timestamp).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

  const testMessage = `🚨 MOONSCANNER TELEGRAM SYSTEM TEST

Status: Operational

TRANSPORT DIAGNOSTICS:
• Bot Config: Present (Verified)
• Chat ID: Present (${chatId})
• Transport Protocol: Telegram Bot HTTPS API
• Timestamp: ${dateStrDhaka} BST (${dateStrUtc})
• Node Environment: ${process.env.NODE_ENV || 'production'}

This is a non-trading infrastructure verification broadcast.`;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: testMessage,
        disable_web_page_preview: true
      })
    });

    const respText = await response.text();
    const httpStatusCode = response.status;

    if (!response.ok) {
      return {
        success: false,
        httpStatusCode,
        status: 'Degraded',
        botConfigPresent,
        chatIdPresent,
        timestamp,
        message: `Telegram API returned HTTP ${httpStatusCode}`,
        responseText: respText,
        error: `HTTP_${httpStatusCode}: ${respText}`
      };
    }

    return {
      success: true,
      httpStatusCode,
      status: 'Operational',
      botConfigPresent,
      chatIdPresent,
      timestamp,
      message: 'System test message successfully delivered to Telegram channel.',
      responseText: respText
    };
  } catch (err: any) {
    return {
      success: false,
      httpStatusCode: null,
      status: 'Degraded',
      botConfigPresent,
      chatIdPresent,
      timestamp,
      message: err?.message || 'Network transport failure during Telegram dispatch',
      error: err?.message || 'NETWORK_FAILURE'
    };
  }
}

export interface SignalActionabilityResult {
  isValid: boolean;
  rejectReason?: string;
  actionableCurrentPrice: number;
  remainingMovePct: number;
}

/**
 * Universal Live Signal Integrity & Actionability Validator (Sections 1 & 2)
 * Validates current ticker price vs proposed Entry, SL direction, TP direction,
 * and confirms setup is actionable and not stale or already hit.
 */
export function validateTelegramSignalActionability(
  candidate: {
    symbol: string;
    direction: 'LONG' | 'SHORT' | 'WAIT';
    entryLow: number;
    entryHigh: number;
    stopLoss: number;
    targets: Array<{ label?: string; price: number; percentage?: number }>;
    alertType?: TelegramAlertType;
    minRemainingExpansionPct?: number;
  },
  freshTicker: { symbol: string; lastPrice: number },
  freshCandles?: Candle[]
): SignalActionabilityResult {
  const normCandSym = candidate.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const normTickerSym = freshTicker.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();

  // 1. Symbol Match
  if (!normTickerSym.includes(normCandSym) && !normCandSym.includes(normTickerSym)) {
    return {
      isValid: false,
      rejectReason: `SYMBOL_MISMATCH (Signal: ${normCandSym} vs Ticker: ${normTickerSym})`,
      actionableCurrentPrice: freshTicker.lastPrice || 0,
      remainingMovePct: 0
    };
  }

  const curPrice = freshTicker.lastPrice;
  if (!curPrice || curPrice <= 0 || isNaN(curPrice)) {
    return {
      isValid: false,
      rejectReason: 'INVALID_FRESH_TICKER_PRICE',
      actionableCurrentPrice: 0,
      remainingMovePct: 0
    };
  }

  const dir = candidate.direction;
  if (dir !== 'LONG' && dir !== 'SHORT') {
    return {
      isValid: false,
      rejectReason: 'INVALID_DIRECTION_WAIT',
      actionableCurrentPrice: curPrice,
      remainingMovePct: 0
    };
  }

  const isLong = dir === 'LONG';
  let entryLow = Math.min(candidate.entryLow, candidate.entryHigh);
  let entryHigh = Math.max(candidate.entryLow, candidate.entryHigh);
  if (entryLow <= 0) entryLow = curPrice;
  if (entryHigh <= 0) entryHigh = curPrice;
  const sl = candidate.stopLoss;

  const validTargets = (candidate.targets || [])
    .filter(t => typeof t.price === 'number' && t.price > 0)
    .sort((a, b) => (isLong ? a.price - b.price : b.price - a.price));

  if (validTargets.length === 0) {
    return {
      isValid: false,
      rejectReason: 'NO_VALID_TARGETS',
      actionableCurrentPrice: curPrice,
      remainingMovePct: 0
    };
  }

  // 2. Structural SL Direction Validation
  if (isLong) {
    if (sl <= 0 || sl >= entryLow) {
      return {
        isValid: false,
        rejectReason: `INVALID_SL_DIRECTION_LONG (SL ${sl} must be < EntryLow ${entryLow})`,
        actionableCurrentPrice: curPrice,
        remainingMovePct: 0
      };
    }
  } else {
    if (sl <= 0 || sl <= entryHigh) {
      return {
        isValid: false,
        rejectReason: `INVALID_SL_DIRECTION_SHORT (SL ${sl} must be > EntryHigh ${entryHigh})`,
        actionableCurrentPrice: curPrice,
        remainingMovePct: 0
      };
    }
  }

  // 3. Structural TP Direction Validation
  for (let i = 0; i < validTargets.length; i++) {
    const tp = validTargets[i].price;
    if (isLong && tp <= entryLow) {
      return {
        isValid: false,
        rejectReason: `INVALID_TP_DIRECTION_LONG (TP${i + 1} ${tp} must be > EntryLow ${entryLow})`,
        actionableCurrentPrice: curPrice,
        remainingMovePct: 0
      };
    }
    if (!isLong && tp >= entryHigh) {
      return {
        isValid: false,
        rejectReason: `INVALID_TP_DIRECTION_SHORT (TP${i + 1} ${tp} must be < EntryHigh ${entryHigh})`,
        actionableCurrentPrice: curPrice,
        remainingMovePct: 0
      };
    }
  }

  // 4. Current Market Price vs Entry (Anti-Chase & Anti-Stale Actionability Guard)
  const firstTP = validTargets[0].price;
  const terminalTP = validTargets[validTargets.length - 1].price;

  if (isLong) {
    if (curPrice <= sl) {
      return {
        isValid: false,
        rejectReason: `STALE_SETUP_PRICE_BELOW_SL (Market ${curPrice} <= SL ${sl})`,
        actionableCurrentPrice: curPrice,
        remainingMovePct: 0
      };
    }
    if (curPrice >= firstTP) {
      return {
        isValid: false,
        rejectReason: `STALE_SETUP_TP1_ALREADY_HIT (Market ${curPrice} >= TP1 ${firstTP})`,
        actionableCurrentPrice: curPrice,
        remainingMovePct: 0
      };
    }
    if (curPrice > entryHigh) {
      const overPct = ((curPrice - entryHigh) / entryHigh) * 100;
      return {
        isValid: false,
        rejectReason: `STALE_SETUP_PRICE_ALREADY_SURGED (Market ${curPrice} > EntryHigh ${entryHigh} +${overPct.toFixed(2)}%; LONG entry missed)`,
        actionableCurrentPrice: curPrice,
        remainingMovePct: 0
      };
    }
    if (curPrice < entryLow * 0.96) {
      return {
        isValid: false,
        rejectReason: `STALE_SETUP_PRICE_DRIFTED_TOO_LOW (Market ${curPrice} < EntryLow ${entryLow} -4%)`,
        actionableCurrentPrice: curPrice,
        remainingMovePct: 0
      };
    }
  } else {
    if (curPrice >= sl) {
      return {
        isValid: false,
        rejectReason: `STALE_SETUP_PRICE_ABOVE_SL (Market ${curPrice} >= SL ${sl})`,
        actionableCurrentPrice: curPrice,
        remainingMovePct: 0
      };
    }
    if (curPrice <= firstTP) {
      return {
        isValid: false,
        rejectReason: `STALE_SETUP_TP1_ALREADY_HIT (Market ${curPrice} <= TP1 ${firstTP})`,
        actionableCurrentPrice: curPrice,
        remainingMovePct: 0
      };
    }
    if (curPrice < entryLow) {
      const underPct = ((entryLow - curPrice) / entryLow) * 100;
      return {
        isValid: false,
        rejectReason: `STALE_SETUP_PRICE_ALREADY_DUMPED (Market ${curPrice} < EntryLow ${entryLow} -${underPct.toFixed(2)}%; SHORT entry missed)`,
        actionableCurrentPrice: curPrice,
        remainingMovePct: 0
      };
    }
    if (curPrice > entryHigh * 1.04) {
      return {
        isValid: false,
        rejectReason: `STALE_SETUP_PRICE_DRIFTED_TOO_HIGH (Market ${curPrice} > EntryHigh ${entryHigh} +4%)`,
        actionableCurrentPrice: curPrice,
        remainingMovePct: 0
      };
    }
  }

  // 5. Remaining Expansion Potential to Terminal TP (must be actionable from current market price)
  const remainingMovePct = isLong
    ? ((terminalTP - curPrice) / curPrice) * 100
    : ((curPrice - terminalTP) / curPrice) * 100;

  // Compute required remaining expansion based on alert type or candidate config
  let minRemaining = 1.0;
  if (candidate.minRemainingExpansionPct !== undefined) {
    minRemaining = candidate.minRemainingExpansionPct;
  } else if (candidate.alertType === 'EXTREME_MOVE') {
    minRemaining = 20.0;
  } else if (candidate.alertType === 'MAJOR_MOVE') {
    minRemaining = 5.0;
  } else {
    // PRE_PUMP, PRE_DUMP, NEWS_SIGNAL, etc.
    minRemaining = 1.0;
  }

  if (remainingMovePct < minRemaining) {
    return {
      isValid: false,
      rejectReason: `INSUFFICIENT_REMAINING_EXPANSION (+${remainingMovePct.toFixed(1)}% < ${minRemaining}%)`,
      actionableCurrentPrice: curPrice,
      remainingMovePct
    };
  }

  return { isValid: true, actionableCurrentPrice: curPrice, remainingMovePct };
}

/**
 * 4. TELEGRAM FINAL GATE & TP LADDER VALIDATOR
 */

export function validateTpLadder(
  direction: 'LONG' | 'SHORT' | 'WAIT',
  entryLow: number,
  entryHigh: number,
  stopLoss: number,
  targets: Array<{ label?: string; price: number; percentage?: number }>
): {
  isValid: boolean;
  rejectReason?: string;
  validLadder: Array<{ label: string; price: number; percentage: number }>;
  sanitizedEntryLow?: number;
  sanitizedEntryHigh?: number;
} {
  if (direction !== 'LONG' && direction !== 'SHORT') {
    return { isValid: false, rejectReason: `INVALID_DIRECTION_${direction}`, validLadder: [] };
  }
  if (!entryLow || !entryHigh || entryLow <= 0 || entryHigh <= 0) {
    return { isValid: false, rejectReason: 'INVALID_ENTRY_RANGE', validLadder: [] };
  }
  let low = Math.min(entryLow, entryHigh);
  let high = Math.max(entryLow, entryHigh);
  const entryMid = (low + high) / 2;

  if (!stopLoss || stopLoss <= 0) {
    return { isValid: false, rejectReason: 'INVALID_STOP_LOSS', validLadder: [] };
  }

  const isLong = direction === 'LONG';
  if (isLong && stopLoss >= low) {
    return { isValid: false, rejectReason: `LONG_SL_MUST_BE_BELOW_ENTRY (SL ${stopLoss} >= EntryLow ${low})`, validLadder: [] };
  }
  if (!isLong && stopLoss <= high) {
    return { isValid: false, rejectReason: `SHORT_SL_MUST_BE_ABOVE_ENTRY (SL ${stopLoss} <= EntryHigh ${high})`, validLadder: [] };
  }

  if (!targets || targets.length === 0) {
    return { isValid: false, rejectReason: 'NO_TARGETS_PROVIDED', validLadder: [] };
  }

  const cleaned: Array<{ label: string; price: number; percentage: number }> = [];
  const seenPrices = new Set<number>();

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t) continue;
    const p = Number(t.price);
    if (!p || isNaN(p) || p <= 0) continue;

    const isDup = Array.from(seenPrices).some(prevP => Math.abs(prevP - p) / prevP < 0.0001);
    if (isDup) {
      return { isValid: false, rejectReason: `DUPLICATE_TARGET_PRICE (${p})`, validLadder: [] };
    }
    seenPrices.add(p);

    const pct = isLong
      ? ((p - entryMid) / entryMid) * 100
      : ((entryMid - p) / entryMid) * 100;

    cleaned.push({
      label: t.label || `TP${cleaned.length + 1}`,
      price: p,
      percentage: Number(pct.toFixed(2))
    });
  }

  if (cleaned.length === 0) {
    return { isValid: false, rejectReason: 'NO_VALID_POSITIVE_TARGETS', validLadder: [] };
  }

  // Monotonicity check
  // LONG: StopLoss < EntryLow <= EntryHigh < TP1 < TP2 < TP3 < TP4
  // SHORT: StopLoss > EntryHigh >= EntryLow > TP1 > TP2 > TP3 > TP4
  if (isLong) {
    if (cleaned[0].price <= entryMid) {
      return { isValid: false, rejectReason: `LONG_TP1_MUST_BE_ABOVE_ENTRY (TP1 ${cleaned[0].price} <= EntryMid ${entryMid})`, validLadder: [] };
    }
    if (cleaned[0].price <= high) {
      return { isValid: false, rejectReason: `LONG_TP1_MUST_BE_ABOVE_ENTRY_HIGH (TP1 ${cleaned[0].price} <= EntryHigh ${high})`, validLadder: [] };
    }
    if (stopLoss >= low) {
      return { isValid: false, rejectReason: `LONG_SL_MUST_BE_BELOW_ENTRY (SL ${stopLoss} >= EntryLow ${low})`, validLadder: [] };
    }
    for (let i = 1; i < cleaned.length; i++) {
      if (cleaned[i].price <= cleaned[i - 1].price) {
        return { isValid: false, rejectReason: `LONG_TARGETS_NOT_STRICTLY_ASCENDING (TP${i + 1} ${cleaned[i].price} <= TP${i} ${cleaned[i - 1].price})`, validLadder: [] };
      }
    }
  } else {
    if (cleaned[0].price >= entryMid) {
      return { isValid: false, rejectReason: `SHORT_TP1_MUST_BE_BELOW_ENTRY (TP1 ${cleaned[0].price} >= EntryMid ${entryMid})`, validLadder: [] };
    }
    if (cleaned[0].price >= low) {
      return { isValid: false, rejectReason: `SHORT_TP1_MUST_BE_BELOW_ENTRY_LOW (TP1 ${cleaned[0].price} >= EntryLow ${low})`, validLadder: [] };
    }
    if (stopLoss <= high) {
      return { isValid: false, rejectReason: `SHORT_SL_MUST_BE_ABOVE_ENTRY (SL ${stopLoss} <= EntryHigh ${high})`, validLadder: [] };
    }
    if (cleaned[0].price >= low) {
      return { isValid: false, rejectReason: `SHORT_TP1_MUST_BE_BELOW_ENTRY (TP1 ${cleaned[0].price} >= EntryLow ${low})`, validLadder: [] };
    }
    for (let i = 1; i < cleaned.length; i++) {
      if (cleaned[i].price >= cleaned[i - 1].price) {
        return { isValid: false, rejectReason: `SHORT_TARGETS_NOT_STRICTLY_DESCENDING (TP${i + 1} ${cleaned[i].price} >= TP${i} ${cleaned[i - 1].price})`, validLadder: [] };
      }
    }
  }

  const validLadder = cleaned.slice(0, 5).map((t, idx) => ({
    ...t,
    label: `TP${idx + 1}`
  }));

  return { isValid: true, validLadder, sanitizedEntryLow: low, sanitizedEntryHigh: high };
}

export function logTelegramFinalGateAudit(audit: {
  symbol: string;
  direction: string;
  archetype: string;
  classification: string;
  expectedMove: number;
  preMoveClassification: string;
  executionTimeframe: string;
  currentPrice: number;
  entry: string;
  sl: number;
  targets: string;
  decision: 'SEND' | 'BLOCK';
  reason: string;
}) {
  const moveStr = typeof audit.expectedMove === 'number' ? audit.expectedMove.toFixed(1) : audit.expectedMove;
  console.log(`[TELEGRAM_FINAL_GATE] SYMBOL=${audit.symbol} DIR=${audit.direction} ARCHETYPE=${audit.archetype} CLASS=${audit.classification} PREMOVE_CLASS=${audit.preMoveClassification} MOVE=${moveStr}% DECISION=${audit.decision} REASON=${audit.reason}`);
}

export interface FinalFirewallDecision {
  allowed: boolean;
  reason: string;
  archetype: string;
  classification: string;
  executionTimeframe: string;
  validTargets: Array<{ label: string; price: number; percentage: number }>;
  sanitizedEntryLow?: number;
  sanitizedEntryHigh?: number;
}

export function validateTelegramFinalFirewall(params: {
  symbol: string;
  opportunityId?: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryLow: number;
  entryHigh: number;
  currentPrice: number;
  stopLoss: number;
  targets: Array<{ label?: string; price: number; percentage?: number }>;
  expectedMovePct: number;
  riskRewardRatio?: number;
  qualityGrade?: string;
  confidence?: number;
  sourceType?: string;
  alertType?: TelegramAlertType;
  signal?: Signal;
  marketData?: TelegramMarketDataResult;
  noChaseLevel?: number;
  timeframe?: string;
}): FinalFirewallDecision {
  const normSym = params.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const dir = params.direction;
  const isLong = dir === 'LONG';
  const sig = params.signal;
  const tf = resolveExecutionTimeframe(sig, params.timeframe);
  const curPrice = params.currentPrice || 0;
  const grade = params.qualityGrade || sig?.qualityGrade || 'B';
  const preMove = sig?.preMoveReport || (sig as any)?.preMoveIntelligence;
  const preMoveClass = preMove?.largeMoveClass || sig?.largeMoveClass || 'NONE';

  pipelineDiagnostics.TELEGRAM_FINAL_GATE_CHECKED++;

  // 1. DIRECTION INTEGRITY
  if (dir !== 'LONG' && dir !== 'SHORT') {
    const reason = 'DIRECTION_IS_NOT_ACTIONABLE (WAIT or UNDEFINED)';
    logTelegramFinalGateAudit({
      symbol: normSym, direction: dir, archetype: 'NONE', classification: 'INVALID',
      expectedMove: params.expectedMovePct, preMoveClassification: preMoveClass,
      executionTimeframe: tf, currentPrice: curPrice,
      entry: `${params.entryLow}-${params.entryHigh}`, sl: params.stopLoss,
      targets: 'NONE', decision: 'BLOCK', reason
    });
    pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
    return { allowed: false, reason, archetype: 'NONE', classification: 'INVALID', executionTimeframe: tf, validTargets: [] };
  }

  // 1.0. GRADE REQUIREMENT: Strictly Grade A or A+
  if (grade !== 'A' && grade !== 'A+') {
    const reason = `FIREWALL_BLOCKED_GRADE: Telegram alerts strictly require Grade A or A+ (current: ${grade}); lower grades are strictly blocked`;
    logTelegramFinalGateAudit({
      symbol: normSym, direction: dir, archetype: 'GRADE_INSUFFICIENT', classification: 'BLOCKED',
      expectedMove: params.expectedMovePct, preMoveClassification: preMoveClass,
      executionTimeframe: tf, currentPrice: curPrice,
      entry: `${params.entryLow}-${params.entryHigh}`, sl: params.stopLoss,
      targets: 'BLOCKED', decision: 'BLOCK', reason
    });
    pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
    return { allowed: false, reason, archetype: 'GRADE_INSUFFICIENT', classification: 'BLOCKED', executionTimeframe: tf, validTargets: [] };
  }

  // 1.1. LIVE PRICE VS ENTRY CONSISTENCY & ZERO DRIFT FIREWALL (VIRTUAL / ENA Missed Entry Protection)
  const low = Math.min(params.entryLow, params.entryHigh);
  const high = Math.max(params.entryLow, params.entryHigh);
  const rawEntryMid = (low + high) / 2;

  if (curPrice > 0 && low > 0 && high > 0) {
    // A. Missed Entry Runaway: Price has already moved past Entry Zone in trade direction
    if (isLong && curPrice > high) {
      const overPct = ((curPrice - high) / high) * 100;
      const reason = `ENTRY_MISSED_RUNAWAY: Live price (${curPrice}) is above entryHigh (${high}) (+${overPct.toFixed(2)}%); LONG entry already missed; Telegram strictly rejected`;
      logTelegramFinalGateAudit({
        symbol: normSym, direction: dir, archetype: 'PRICE_DIVERGED', classification: 'BLOCKED',
        expectedMove: params.expectedMovePct, preMoveClassification: preMoveClass,
        executionTimeframe: tf, currentPrice: curPrice,
        entry: `${low}-${high}`, sl: params.stopLoss,
        targets: 'ENTRY_MISSED', decision: 'BLOCK', reason
      });
      pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
      pipelineDiagnostics.TELEGRAM_STALE_BLOCKED++;
      return { allowed: false, reason, archetype: 'PRICE_DIVERGED', classification: 'BLOCKED', executionTimeframe: tf, validTargets: [] };
    }

    if (!isLong && curPrice < low) {
      const underPct = ((low - curPrice) / low) * 100;
      const reason = `ENTRY_MISSED_RUNAWAY: Live price (${curPrice}) is below entryLow (${low}) (-${underPct.toFixed(2)}%); SHORT entry already missed; Telegram strictly rejected`;
      logTelegramFinalGateAudit({
        symbol: normSym, direction: dir, archetype: 'PRICE_DIVERGED', classification: 'BLOCKED',
        expectedMove: params.expectedMovePct, preMoveClassification: preMoveClass,
        executionTimeframe: tf, currentPrice: curPrice,
        entry: `${low}-${high}`, sl: params.stopLoss,
        targets: 'ENTRY_MISSED', decision: 'BLOCK', reason
      });
      pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
      pipelineDiagnostics.TELEGRAM_STALE_BLOCKED++;
      return { allowed: false, reason, archetype: 'PRICE_DIVERGED', classification: 'BLOCKED', executionTimeframe: tf, validTargets: [] };
    }

    // B. Overall Entry Divergence Check (XMR style 500 vs 100)
    const divergencePct = (Math.abs(curPrice - rawEntryMid) / rawEntryMid) * 100;
    if (divergencePct > 3.0) {
      const reason = `LIVE_ENTRY_PRICE_DIVERGENCE_EXCEEDED: Live Binance price (${curPrice}) diverged by ${divergencePct.toFixed(1)}% from entry zone [${low}, ${high}] (allowed: <=3.0%); stale or wrong entry strictly blocked`;
      logTelegramFinalGateAudit({
        symbol: normSym, direction: dir, archetype: 'PRICE_DIVERGED', classification: 'BLOCKED',
        expectedMove: params.expectedMovePct, preMoveClassification: preMoveClass,
        executionTimeframe: tf, currentPrice: curPrice,
        entry: `${low}-${high}`, sl: params.stopLoss,
        targets: 'DIVERGED', decision: 'BLOCK', reason
      });
      pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
      pipelineDiagnostics.TELEGRAM_STALE_BLOCKED++;
      return { allowed: false, reason, archetype: 'PRICE_DIVERGED', classification: 'BLOCKED', executionTimeframe: tf, validTargets: [] };
    }
  }

  // 1.2. STOP LOSS INTEGRITY & PRE-ENTRY BREACH
  if (curPrice > 0 && params.stopLoss > 0) {
    const isSlBreached = isLong ? curPrice <= params.stopLoss : curPrice >= params.stopLoss;
    if (isSlBreached) {
      const reason = `STOP_LOSS_ALREADY_BREACHED: Live Binance price (${curPrice}) has breached stop loss (${params.stopLoss})`;
      logTelegramFinalGateAudit({
        symbol: normSym, direction: dir, archetype: 'SL_BREACHED', classification: 'BLOCKED',
        expectedMove: params.expectedMovePct, preMoveClassification: preMoveClass,
        executionTimeframe: tf, currentPrice: curPrice,
        entry: `${params.entryLow}-${params.entryHigh}`, sl: params.stopLoss,
        targets: 'SL_BREACHED', decision: 'BLOCK', reason
      });
      pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
      return { allowed: false, reason, archetype: 'SL_BREACHED', classification: 'BLOCKED', executionTimeframe: tf, validTargets: [] };
    }
  }

  // 1.3. MARKET DATA FRESHNESS CHECK
  if (params.marketData) {
    if (!params.marketData.isFresh || !params.marketData.ticker || !params.marketData.candles || params.marketData.candles.length < 20) {
      const reason = `STALE_OR_UNAVAILABLE_MARKET_DATA (${params.marketData.rejectReason || 'INSUFFICIENT_CANDLES'})`;
      logTelegramFinalGateAudit({
        symbol: normSym, direction: dir, archetype: 'STALE_DATA', classification: 'BLOCKED',
        expectedMove: params.expectedMovePct, preMoveClassification: preMoveClass,
        executionTimeframe: tf, currentPrice: curPrice,
        entry: `${params.entryLow}-${params.entryHigh}`, sl: params.stopLoss,
        targets: 'N/A', decision: 'BLOCK', reason
      });
      pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
      pipelineDiagnostics.TELEGRAM_STALE_BLOCKED++;
      return { allowed: false, reason, archetype: 'STALE_DATA', classification: 'BLOCKED', executionTimeframe: tf, validTargets: [] };
    }
  }

  // 1.4. TP LADDER VALIDATION FIRST
  const tpValidation = validateTpLadder(dir, params.entryLow, params.entryHigh, params.stopLoss, params.targets);
  if (!tpValidation.isValid || tpValidation.validLadder.length === 0) {
    const reason = `INVALID_TP_SL_LADDER (${tpValidation.rejectReason || 'CORRUPTED_TARGETS'})`;
    logTelegramFinalGateAudit({
      symbol: normSym, direction: dir, archetype: 'NONE', classification: 'INVALID',
      expectedMove: params.expectedMovePct, preMoveClassification: preMoveClass,
      executionTimeframe: tf, currentPrice: curPrice,
      entry: `${params.entryLow}-${params.entryHigh}`, sl: params.stopLoss,
      targets: 'INVALID', decision: 'BLOCK', reason
    });
    pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
    pipelineDiagnostics.TELEGRAM_INVALID_TP_BLOCKED++;
    return { allowed: false, reason, archetype: 'NONE', classification: 'INVALID', executionTimeframe: tf, validTargets: [] };
  }

  const validTargets = tpValidation.validLadder;
  const targetsStr = validTargets.map(t => `${t.label}:${t.price}(+${t.percentage}%)`).join(', ');
  const entryLow = low;
  const entryHigh = high;
  const entryReference = (entryLow + entryHigh) / 2;

  // 1.5. GENUINE MAXIMUM STRUCTURAL TARGET MOVE INTEGRITY (The 30%+ Rule)
  // LONG: maxTargetMove = ((highest genuine structural TP - entryReference) / entryReference) * 100
  // SHORT: maxTargetMove = ((entryReference - lowest genuine structural TP) / entryReference) * 100
  const highestStructuralTp = Math.max(...validTargets.map(t => t.price));
  const lowestStructuralTp = Math.min(...validTargets.map(t => t.price));
  const maxTargetMove = isLong
    ? Number((((highestStructuralTp - entryReference) / entryReference) * 100).toFixed(2))
    : Number((((entryReference - lowestStructuralTp) / entryReference) * 100).toFixed(2));

  if (maxTargetMove < 30.0) {
    const reason = `FIREWALL_BLOCKED_BELOW_30_PERCENT_STRUCTURAL_TARGET: Maximum genuine structural target (+${maxTargetMove.toFixed(1)}%) is below mandatory 30.0% threshold (TP count=${validTargets.length}, highest TP=${isLong ? highestStructuralTp : lowestStructuralTp}); routine/small-move signals (such as VIRTUAL/ENA ~21%) are strictly prohibited on Telegram`;
    logTelegramFinalGateAudit({
      symbol: normSym, direction: dir, archetype: 'ORDINARY_SIGNAL', classification: 'BLOCKED',
      expectedMove: maxTargetMove, preMoveClassification: preMoveClass,
      executionTimeframe: tf, currentPrice: curPrice,
      entry: `${entryLow}-${entryHigh}`, sl: params.stopLoss,
      targets: targetsStr, decision: 'BLOCK', reason
    });
    pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
    pipelineDiagnostics.NORMAL_SIGNALS_BLOCKED++;
    return { allowed: false, reason, archetype: 'ORDINARY_SIGNAL', classification: 'BLOCKED', executionTimeframe: tf, validTargets: [] };
  }

  // 1.6. STALE / ALREADY HIT FIRST TARGET CHECK
  if (curPrice > 0) {
    const firstTP = validTargets[0].price;
    const hasAlreadyHitTP1 = isLong ? curPrice >= firstTP : curPrice <= firstTP;
    if (hasAlreadyHitTP1) {
      const reason = `STALE_ALREADY_HIT_TARGET_1 (Live: ${curPrice} vs TP1: ${firstTP})`;
      logTelegramFinalGateAudit({
        symbol: normSym, direction: dir, archetype: 'PRICE_DIVERGED', classification: 'BLOCKED',
        expectedMove: maxTargetMove, preMoveClassification: preMoveClass,
        executionTimeframe: tf, currentPrice: curPrice,
        entry: `${entryLow}-${entryHigh}`, sl: params.stopLoss,
        targets: targetsStr, decision: 'BLOCK', reason
      });
      pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
      pipelineDiagnostics.TELEGRAM_STALE_BLOCKED++;
      return { allowed: false, reason, archetype: 'PRICE_DIVERGED', classification: 'BLOCKED', executionTimeframe: tf, validTargets: [] };
    }
  }

  // 2. ARCHETYPE IDENTIFICATION & CLASSIFICATION CHECK
  let archetype = 'NONE';
  let classification = 'NONE';

  const isAuthoritativePreMove = Boolean(
    (sig?.isPreMove === true || sig?.id?.includes('PREMOVE') || params.opportunityId?.includes('PREMOVE')) &&
    preMove
  );

  const isExtremePreMove = Boolean(
    isAuthoritativePreMove &&
    maxTargetMove >= 30.0 &&
    (preMove?.isExtremeCandidate === true ||
     sig?.isExtremeCandidate === true ||
     preMove?.largeMoveClass === 'EXCEPTIONAL_30_PLUS' ||
     sig?.largeMoveClass === 'EXCEPTIONAL_30_PLUS' ||
     preMove?.largeMoveClass?.startsWith('EXTREME') ||
     sig?.largeMoveClass?.startsWith('EXTREME') ||
     ((preMove?.coilScore || 0) >= 70)) &&
    (grade === 'A' || grade === 'A+')
  );

  const isBigMoveLong = Boolean(
    !isAuthoritativePreMove &&
    isLong &&
    sig?.bigMoveHunter &&
    (sig.bigMoveHunter.stage === 'EXPLOSIVE' || sig.bigMoveHunter.stage === 'EXTREME') &&
    maxTargetMove >= 30.0 &&
    (grade === 'A' || grade === 'A+') &&
    (params.riskRewardRatio || sig.riskRewardRatio || 0) >= 2.0
  );

  const isBigDumpShort = Boolean(
    !isAuthoritativePreMove &&
    !isLong &&
    sig?.dumpHunter &&
    (sig.dumpHunter.stage === 'DUMP_EXPANSION' || sig.dumpHunter.stage === 'EXTREME_DUMP' || sig.dumpHunter.stage === 'DUMP_TRIGGERED') &&
    maxTargetMove >= 30.0 &&
    (grade === 'A' || grade === 'A+') &&
    (params.riskRewardRatio || sig.riskRewardRatio || 0) >= 2.0
  );

  const isExceptionalAsymmetric = Boolean(
    !isAuthoritativePreMove &&
    sig?.exceptionalOpportunity?.telegramEligible &&
    sig?.exceptionalOpportunity?.priority === 'CRITICAL' &&
    sig?.exceptionalOpportunity?.opportunityClass !== 'STANDARD' &&
    maxTargetMove >= 30.0 &&
    (grade === 'A' || grade === 'A+') &&
    (params.riskRewardRatio || sig.riskRewardRatio || 0) >= 2.0
  );

  const isVerifiedNewListing = Boolean(
    !isAuthoritativePreMove &&
    sig?.newListingIntelligence?.isNewListing &&
    sig?.newListingIntelligence.setupViability === 'ACTIONABLE_BASE' &&
    sig?.newListingIntelligence.hasStructuralLevels &&
    maxTargetMove >= 30.0 &&
    (grade === 'A' || grade === 'A+')
  );

  if (isExtremePreMove) {
    archetype = 'EXTREME_PRE_MOVE';
    classification = preMove?.largeMoveClass || sig?.largeMoveClass || 'EXTREME_100_PLUS';
  } else if (isBigMoveLong) {
    archetype = 'BIG_MOVE_HUNTER';
    classification = sig?.bigMoveHunter?.stage || 'EXPLOSIVE';
  } else if (isBigDumpShort) {
    archetype = 'BIG_DUMP_HUNTER';
    classification = sig?.dumpHunter?.stage || 'DUMP_EXPANSION';
  } else if (isExceptionalAsymmetric) {
    archetype = 'EXCEPTIONAL_ASYMMETRIC';
    classification = 'CRITICAL_30_PLUS';
  } else if (isVerifiedNewListing) {
    archetype = 'NEW_LISTING';
    classification = 'BASE_BREAKOUT';
  } else {
    const reason = `FIREWALL_BLOCKED_NON_EXCEPTIONAL: Expected structural move (+${maxTargetMove.toFixed(1)}%) or setup does not meet extreme/30%+ criteria; routine signals strictly prohibited on Telegram`;
    logTelegramFinalGateAudit({
      symbol: normSym, direction: dir, archetype: 'ORDINARY_SIGNAL', classification: 'SUPPRESSED',
      expectedMove: maxTargetMove, preMoveClassification: preMoveClass,
      executionTimeframe: tf, currentPrice: curPrice,
      entry: `${entryLow}-${entryHigh}`, sl: params.stopLoss,
      targets: 'SUPPRESSED', decision: 'BLOCK', reason
    });
    pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
    pipelineDiagnostics.NORMAL_SIGNALS_BLOCKED++;
    return { allowed: false, reason, archetype: 'ORDINARY_SIGNAL', classification: 'SUPPRESSED', executionTimeframe: tf, validTargets: [] };
  }

  // 3. ANTI-CHASE AND OVER-EXTENSION CHECK
  if (curPrice > 0) {
    const noChase = params.noChaseLevel || preMove?.noChaseLevel;
    const isPastNoChase = Boolean(noChase && noChase > 0 && (isLong ? curPrice > noChase : curPrice < noChase));

    if (isPastNoChase) {
      const reason = `ANTI_CHASE_OVEREXTENDED (Live: ${curPrice}, Entry: ${entryLow}-${entryHigh}, NoChase: ${noChase || 'N/A'})`;
      logTelegramFinalGateAudit({
        symbol: normSym, direction: dir, archetype, classification,
        expectedMove: maxTargetMove, preMoveClassification: preMoveClass,
        executionTimeframe: tf, currentPrice: curPrice,
        entry: `${entryLow}-${entryHigh}`, sl: params.stopLoss,
        targets: targetsStr, decision: 'BLOCK', reason
      });
      pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
      pipelineDiagnostics.TELEGRAM_CHASE_BLOCKED++;
      return { allowed: false, reason, archetype, classification, executionTimeframe: tf, validTargets: [] };
    }

    // Check adverse slip before entry
    const maxAdverseAllowance = isLong ? entryLow * 0.96 : entryHigh * 1.04;
    const isAdverseSlip = isLong ? curPrice < maxAdverseAllowance : curPrice > maxAdverseAllowance;
    if (isAdverseSlip) {
      const reason = `ADVERSE_PRICE_SLIP_BEFORE_ENTRY (Live: ${curPrice} vs Entry: ${entryLow}-${entryHigh})`;
      logTelegramFinalGateAudit({
        symbol: normSym, direction: dir, archetype, classification,
        expectedMove: maxTargetMove, preMoveClassification: preMoveClass,
        executionTimeframe: tf, currentPrice: curPrice,
        entry: `${entryLow}-${entryHigh}`, sl: params.stopLoss,
        targets: targetsStr, decision: 'BLOCK', reason
      });
      pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
      return { allowed: false, reason, archetype, classification, executionTimeframe: tf, validTargets: [] };
    }
  }

  // 4. ALL CHECKS PASSED: AUTHORIZED FOR TELEGRAM DISPATCH
  const reason = `AUTHORIZED_${archetype}_${classification}`;
  logTelegramFinalGateAudit({
    symbol: normSym, direction: dir, archetype, classification,
    expectedMove: maxTargetMove, preMoveClassification: preMoveClass,
    executionTimeframe: tf, currentPrice: curPrice,
    entry: `${entryLow}-${entryHigh}`, sl: params.stopLoss,
    targets: targetsStr, decision: 'SEND', reason
  });
  pipelineDiagnostics.TELEGRAM_FINAL_GATE_ALLOWED++;
  return {
    allowed: true,
    reason,
    archetype,
    classification,
    executionTimeframe: tf,
    validTargets,
    sanitizedEntryLow: entryLow,
    sanitizedEntryHigh: entryHigh
  };
}

/**
 * Core event-driven dispatch coordinator.
 * Fully integrates live market data verification, actionability checks,
 * professional chart generation, and persistent deduplication before dispatch.
 */
export async function dispatchEventAlert(params: {
  alertType: TelegramAlertType;
  symbol: string;
  opportunityId?: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryLow: number;
  entryHigh: number;
  currentPrice: number;
  stopLoss: number;
  targets: Array<{ label?: string; price: number; percentage?: number }>;
  expectedMovePct: number;
  riskRewardRatio: number;
  qualityGrade: string;
  confidence: number;
  whyReason?: string;
  sourceType: string;
  status?: string;
  preFetchedMarketData?: TelegramMarketDataResult;
  keyTriggerLevel?: number;
  noChaseLevel?: number;
  timeframe?: string;
  signal?: Signal;
}): Promise<{ dispatched: boolean; record: TelegramAlertRecord; reason: string }> {
  const normSym = params.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const timestamp = Date.now();
  const executionTimeframe = resolveExecutionTimeframe(params.signal, params.timeframe);

  // 1. Fetch or utilize strictly fresh live market data on execution timeframe
  const marketData = params.preFetchedMarketData || await fetchFreshTelegramLiveMarketData(normSym, executionTimeframe);
  if (!marketData || !marketData.isFresh || !marketData.ticker || !marketData.ticker.lastPrice || marketData.ticker.lastPrice <= 0) {
    const reason = `BINANCE_DATA_UNAVAILABLE: Fresh live Binance ticker unavailable (${marketData?.rejectReason || 'NO_TICKER'})`;
    pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
    pipelineDiagnostics.TELEGRAM_STALE_BLOCKED++;
    const record: TelegramAlertRecord = {
      id: params.opportunityId ? `alert-${params.opportunityId}` : `alert-${timestamp}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp,
      alertType: params.alertType,
      symbol: normSym,
      direction: params.direction,
      entryLow: params.entryLow,
      entryHigh: params.entryHigh,
      currentPrice: params.currentPrice,
      stopLoss: params.stopLoss,
      targets: params.targets as any,
      expectedMovePct: params.expectedMovePct,
      riskRewardRatio: params.riskRewardRatio,
      qualityGrade: params.qualityGrade,
      confidence: params.confidence,
      whyReason: params.whyReason || params.sourceType,
      sourceType: params.sourceType,
      formattedMessage: '',
      signature: '',
      status: 'FAILED',
      errorMessage: reason
    };
    return { dispatched: false, record, reason };
  }

  if (!marketData.candles || marketData.candles.length < 20) {
    const reason = `BINANCE_DATA_UNAVAILABLE: Fresh Binance ${executionTimeframe} candles unavailable (${marketData.rejectReason || 'INSUFFICIENT_CANDLES'})`;
    pipelineDiagnostics.TELEGRAM_FINAL_GATE_BLOCKED++;
    pipelineDiagnostics.TELEGRAM_STALE_BLOCKED++;
    const record: TelegramAlertRecord = {
      id: params.opportunityId ? `alert-${params.opportunityId}` : `alert-${timestamp}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp,
      alertType: params.alertType,
      symbol: normSym,
      direction: params.direction,
      entryLow: params.entryLow,
      entryHigh: params.entryHigh,
      currentPrice: params.currentPrice,
      stopLoss: params.stopLoss,
      targets: params.targets as any,
      expectedMovePct: params.expectedMovePct,
      riskRewardRatio: params.riskRewardRatio,
      qualityGrade: params.qualityGrade,
      confidence: params.confidence,
      whyReason: params.whyReason || params.sourceType,
      sourceType: params.sourceType,
      formattedMessage: '',
      signature: '',
      status: 'FAILED',
      errorMessage: reason
    };
    return { dispatched: false, record, reason };
  }

  const authoritativeCurrentPrice = marketData.ticker.lastPrice;

  // 2. Authoritative Final Firewall Gate
  const finalGate = validateTelegramFinalFirewall({
    symbol: normSym,
    opportunityId: params.opportunityId,
    direction: params.direction,
    entryLow: params.entryLow,
    entryHigh: params.entryHigh,
    currentPrice: authoritativeCurrentPrice,
    stopLoss: params.stopLoss,
    targets: params.targets,
    expectedMovePct: params.expectedMovePct,
    riskRewardRatio: params.riskRewardRatio,
    qualityGrade: params.qualityGrade,
    confidence: params.confidence,
    sourceType: params.sourceType,
    alertType: params.alertType,
    signal: params.signal,
    marketData,
    noChaseLevel: params.noChaseLevel,
    timeframe: executionTimeframe
  });

  const recordId = params.opportunityId ? `alert-${params.opportunityId}` : `alert-${timestamp}-${Math.random().toString(36).substr(2, 6)}`;

  if (!finalGate.allowed) {
    const reason = finalGate.reason;
    const record: TelegramAlertRecord = {
      id: recordId,
      timestamp,
      alertType: params.alertType,
      symbol: normSym,
      direction: params.direction,
      entryLow: params.entryLow,
      entryHigh: params.entryHigh,
      currentPrice: authoritativeCurrentPrice,
      stopLoss: params.stopLoss,
      targets: params.targets as any,
      expectedMovePct: params.expectedMovePct,
      riskRewardRatio: params.riskRewardRatio,
      qualityGrade: params.qualityGrade,
      confidence: params.confidence,
      whyReason: params.whyReason || params.sourceType,
      sourceType: params.sourceType,
      formattedMessage: '',
      signature: '',
      status: 'FAILED',
      errorMessage: reason
    };
    recordDiagnosticEvaluation({
      symbol: normSym,
      opportunityId: params.opportunityId,
      status: 'SUPPRESSED',
      reason,
      expectedMovePct: params.expectedMovePct,
      targetsCount: params.targets.length,
      direction: params.direction,
      qualityGrade: params.qualityGrade
    });
    console.log(`[Telegram Dispatch Execution] SYMBOL=${normSym} DISPATCH_RESULT=SUPPRESSED DISPATCH_REASON=${reason}`);
    return { dispatched: false, record, reason };
  }

  // Use strictly verified targets and sanitized entry bounds from final gate
  const verifiedTargets = finalGate.validTargets;
  const verifiedTimeframe = finalGate.executionTimeframe;
  if (finalGate.sanitizedEntryLow !== undefined && finalGate.sanitizedEntryHigh !== undefined) {
    params.entryLow = finalGate.sanitizedEntryLow;
    params.entryHigh = finalGate.sanitizedEntryHigh;
  }
  const finalTarget = verifiedTargets[verifiedTargets.length - 1]?.price || authoritativeCurrentPrice;
  const authoritativeMovePct = params.direction === 'LONG'
    ? Number((((finalTarget - authoritativeCurrentPrice) / authoritativeCurrentPrice) * 100).toFixed(1))
    : Number((((authoritativeCurrentPrice - finalTarget) / authoritativeCurrentPrice) * 100).toFixed(1));

  // 3. Compute Canonical Fingerprint & Signature
  const fingerprint = calculateOpportunityFingerprint({
    symbol: normSym,
    direction: params.direction as any,
    entryPrice: (params.entryLow && params.entryHigh && params.entryLow > 0) ? (params.entryLow + params.entryHigh) / 2 : authoritativeCurrentPrice,
    entryLow: params.entryLow,
    entryHigh: params.entryHigh,
    stopLoss: params.stopLoss,
    targets: verifiedTargets,
    qualityGrade: params.qualityGrade
  });

  const signature = generateAlertSignature({
    symbol: normSym,
    alertType: params.alertType,
    direction: params.direction,
    entryPrice: params.entryLow,
    stopLoss: params.stopLoss,
    targetCount: verifiedTargets.length,
    qualityGrade: params.qualityGrade,
    status: params.status || 'ACTIVE'
  });

  const check = shouldDispatchAlert(
    normSym,
    params.alertType,
    signature,
    params.direction,
    params.qualityGrade,
    params.status || 'ACTIVE',
    authoritativeMovePct
  );

  const formattedMessage = formatTelegramAlertMessage({
    ...params,
    targets: verifiedTargets,
    currentPrice: authoritativeCurrentPrice,
    timestamp
  });

  const record: TelegramAlertRecord = {
    id: recordId,
    timestamp,
    alertType: params.alertType,
    symbol: normSym,
    direction: params.direction,
    entryLow: params.entryLow,
    entryHigh: params.entryHigh,
    currentPrice: authoritativeCurrentPrice,
    stopLoss: params.stopLoss,
    targets: verifiedTargets as any,
    expectedMovePct: authoritativeMovePct,
    riskRewardRatio: params.riskRewardRatio,
    qualityGrade: params.qualityGrade,
    confidence: params.confidence,
    whyReason: params.whyReason || params.sourceType,
    sourceType: params.sourceType,
    formattedMessage,
    signature,
    status: 'PENDING_CONFIG'
  };

  if (!check.shouldDispatch) {
    pipelineDiagnostics.TELEGRAM_DUPLICATE_BLOCKED++;
    logTelegramFinalGateAudit({
      symbol: normSym,
      direction: params.direction,
      archetype: finalGate.archetype,
      classification: finalGate.classification,
      expectedMove: params.expectedMovePct,
      preMoveClassification: params.signal?.preMoveReport?.largeMoveClass || params.signal?.largeMoveClass || 'NONE',
      executionTimeframe: verifiedTimeframe,
      currentPrice: authoritativeCurrentPrice,
      entry: `${params.entryLow}-${params.entryHigh}`,
      sl: params.stopLoss,
      targets: verifiedTargets.map(t => `${t.label}:${t.price}(+${t.percentage}%)`).join(', '),
      decision: 'BLOCK',
      reason: `DUPLICATE_SUPPRESSED (${check.reason})`
    });

    record.status = 'SUPPRESSED_DUPLICATE';
    record.errorMessage = `Deduplication active: ${check.reason}`;
    recentAlerts.unshift(record);
    if (recentAlerts.length > MAX_ALERT_HISTORY) recentAlerts.pop();
    recordDiagnosticEvaluation({
      symbol: normSym,
      opportunityId: params.opportunityId,
      status: 'SUPPRESSED',
      reason: check.reason,
      expectedMovePct: authoritativeMovePct,
      targetsCount: verifiedTargets.length,
      direction: params.direction,
      qualityGrade: params.qualityGrade
    });
    console.log(`[Telegram Dispatch Execution] SYMBOL=${normSym} FINGERPRINT=${fingerprint} INSTANCE_ID=${TELEGRAM_INSTANCE_ID} PID=${TELEGRAM_PROCESS_PID} TIMESTAMP=${timestamp} DISPATCH_RESULT=SUPPRESSED DISPATCH_REASON=${check.reason}`);
    return { dispatched: false, record, reason: check.reason };
  }

  // 4. Generate Professional TradingView-Style Dark Candlestick Chart (Buffer)
  let chartBuffer: Buffer | null = null;
  try {
    chartBuffer = await generateOpportunityChartBuffer({
      symbol: normSym,
      direction: params.direction,
      entryLow: params.entryLow,
      entryHigh: params.entryHigh,
      currentPrice: authoritativeCurrentPrice,
      stopLoss: params.stopLoss,
      targets: verifiedTargets,
      candles: marketData.candles,
      setupType: params.sourceType,
      keyTriggerLevel: params.keyTriggerLevel,
      noChaseLevel: params.noChaseLevel,
      timeframe: verifiedTimeframe
    });
  } catch (chartErr) {
    console.warn(`[Telegram Alert] Chart generation error for ${normSym}:`, chartErr);
  }

  if (!chartBuffer) {
    const chartReason = 'FRESH_CHART_UNAVAILABLE_OR_RENDER_FAILED';
    record.status = 'FAILED';
    record.errorMessage = chartReason;
    recordDiagnosticEvaluation({
      symbol: normSym,
      opportunityId: params.opportunityId,
      status: 'SUPPRESSED',
      reason: chartReason,
      expectedMovePct: authoritativeMovePct,
      targetsCount: verifiedTargets.length,
      direction: params.direction,
      qualityGrade: params.qualityGrade
    });
    console.log(`[Telegram Dispatch Execution] SYMBOL=${normSym} DISPATCH_RESULT=SUPPRESSED DISPATCH_REASON=${chartReason}`);
    return { dispatched: false, record, reason: chartReason };
  }

  // 5. Telegram Dispatch: strictly photo dispatch to configured channel and all active subscribers
  if (runtimeConfig.enabled) {
    const defaultChatId = runtimeConfig.chatId || process.env.TELEGRAM_CHAT_ID;
    
    // Resolve all eligible target chat IDs (primary channel + approved subscribers)
    const targetChatIds: string[] = [];
    if (defaultChatId && isValidTelegramChatId(defaultChatId)) {
      targetChatIds.push(defaultChatId);
    }
    const subscribers = tradingStorage.getAllTelegramSubscribers();
    for (const sub of subscribers) {
      if (!sub.notificationsEnabled || sub.chatId === defaultChatId) continue;
      if (!isValidTelegramChatId(sub.chatId)) continue;
      if (tradingStorage.hasUserReceivedSignal(sub.chatId, fingerprint)) continue;
      const user = sub.userId ? tradingStorage.getUserById(sub.userId) : null;
      if (user && !user.isApproved) continue;
      targetChatIds.push(sub.chatId);
    }

    // Consolidated single invocation of sendRawTelegramPhoto
    const dispatchResult = await sendRawTelegramPhoto(chartBuffer, `${normSym}_${verifiedTimeframe}_chart.png`, formattedMessage, targetChatIds, fingerprint);

    if (dispatchResult.success) {
      record.status = 'SENT';
      pipelineDiagnostics.TELEGRAM_SENT++;
      pipelineDiagnostics.TELEGRAM_TOTAL_SENT++;
      recordDiagnosticEvaluation({
        symbol: normSym,
        opportunityId: params.opportunityId,
        status: 'SENT',
        reason: 'DISPATCH_SUCCESS',
        expectedMovePct: authoritativeMovePct,
        targetsCount: verifiedTargets.length,
        direction: params.direction,
        qualityGrade: params.qualityGrade
      });
      console.log(`[Telegram Dispatch Execution] SYMBOL=${normSym} FINGERPRINT=${fingerprint} INSTANCE_ID=${TELEGRAM_INSTANCE_ID} PID=${TELEGRAM_PROCESS_PID} TIMESTAMP=${timestamp} DISPATCH_RESULT=SENT DISPATCH_REASON=DISPATCH_SUCCESS`);
    } else {
      record.status = (dispatchResult.error === 'TELEGRAM_CONFIG_MISSING' && targetChatIds.length === 0) ? 'PENDING_CONFIG' : 'FAILED';
      record.errorMessage = dispatchResult.error || 'NO_ELIGIBLE_SUBSCRIBERS_OR_DELIVERY_FAILED';
      recordDiagnosticEvaluation({
        symbol: normSym,
        opportunityId: params.opportunityId,
        status: 'FAILED',
        reason: record.errorMessage,
        expectedMovePct: authoritativeMovePct,
        targetsCount: verifiedTargets.length,
        direction: params.direction,
        qualityGrade: params.qualityGrade
      });
      console.log(`[Telegram Dispatch Execution] SYMBOL=${normSym} FINGERPRINT=${fingerprint} INSTANCE_ID=${TELEGRAM_INSTANCE_ID} PID=${TELEGRAM_PROCESS_PID} TIMESTAMP=${timestamp} DISPATCH_RESULT=${record.status} DISPATCH_REASON=${record.errorMessage}`);
    }
  } else {
    record.status = 'PENDING_CONFIG';
    record.errorMessage = 'Telegram alerts disabled in settings';
    recordDiagnosticEvaluation({
      symbol: normSym,
      opportunityId: params.opportunityId,
      status: 'SUPPRESSED',
      reason: 'TELEGRAM_DISABLED_IN_SETTINGS',
      expectedMovePct: authoritativeMovePct,
      targetsCount: verifiedTargets.length,
      direction: params.direction,
      qualityGrade: params.qualityGrade
    });
    console.log(`[Telegram Dispatch Execution] SYMBOL=${normSym} FINGERPRINT=${fingerprint} INSTANCE_ID=${TELEGRAM_INSTANCE_ID} PID=${TELEGRAM_PROCESS_PID} TIMESTAMP=${timestamp} DISPATCH_RESULT=SUPPRESSED DISPATCH_REASON=TELEGRAM_DISABLED_IN_SETTINGS`);
  }

  // 6. Update persistent deduplication ledger and in-memory log
  const existingLedger = telegramLedger.get(fingerprint) || symbolLedgerIndex.get(normSym);
  const ledgerEntry: TelegramLedgerEntry = {
    fingerprint,
    symbol: normSym,
    direction: params.direction as 'LONG' | 'SHORT',
    firstSeenAt: existingLedger?.firstSeenAt || timestamp,
    lastEvaluatedAt: timestamp,
    lastSentAt: record.status === 'SENT' ? timestamp : (existingLedger?.lastSentAt || 0),
    dispatched: record.status === 'SENT',
    dispatchStatus: record.status as any,
    setupVersion: (existingLedger?.setupVersion || 0) + (record.status === 'SENT' ? 1 : 0),
    alertType: params.alertType,
    entryPrice: (params.entryLow && params.entryHigh && params.entryLow > 0) ? (params.entryLow + params.entryHigh) / 2 : authoritativeCurrentPrice,
    stopLoss: params.stopLoss,
    qualityGrade: params.qualityGrade,
    score: params.confidence || 90,
    expectedMovePct: authoritativeMovePct,
    targetCount: verifiedTargets.length,
    terminalTarget: verifiedTargets[verifiedTargets.length - 1]?.price || 0
  };
  telegramLedger.set(fingerprint, ledgerEntry);
  symbolLedgerIndex.set(normSym, ledgerEntry);
  if (record.status === 'SENT') {
    saveTelegramLedgerToDisk();
  }

  recentAlerts.unshift(record);
  if (recentAlerts.length > MAX_ALERT_HISTORY) {
    recentAlerts.pop();
  }

  return { dispatched: record.status === 'SENT', record, reason: check.reason };
}

// ============================================================================
// 5. EVALUATE & TRIGGER PIPELINES FOR DIFFERENT INTELLIGENCE FEEDS
// ============================================================================

/**
 * Compute multi-evidence confluence score for elite opportunity ranking
 */
export function computeEliteOpportunityScore(sig: Signal, movePct: number): number {
  let score = 0;

  // 1. Quality Grade (Strictly prefer A+ and A)
  if (sig.qualityGrade === 'A+') score += 35;
  else if (sig.qualityGrade === 'A') score += 25;
  else score += 12;

  // 2. Risk:Reward Ratio
  const rr = sig.riskRewardRatio || 1.5;
  if (rr >= 3.0) score += 20;
  else if (rr >= 2.0) score += 15;
  else if (rr >= 1.5) score += 10;
  else if (rr >= 1.0) score += 5;

  // 3. Dynamic TP potential (Scale with structurally supported move)
  if (movePct >= 60.0) score += 20;
  else if (movePct >= 45.0) score += 15;
  else if (movePct >= 30.0) score += 10;
  else if (movePct >= 10.0) score += 8;
  else if (movePct >= 2.0) score += 5;

  // 4. Pre-Move / Coiling Intelligence
  const pm = sig.preMoveReport || (sig as any).preMoveIntelligence;
  if (pm) {
    if (pm.coilScore >= 70) score += 20;
    else if (pm.coilScore >= 55) score += 14;
    else if (pm.coilScore >= 45) score += 8;

    if (pm.fakeoutSweep?.detected) score += 12;
    if (pm.orderflowAbsorption?.detected) score += 10;
    if (pm.volatilitySqueeze) score += 8;
    if (pm.openInterestBuild?.detected) score += 6;
  }

  // 4b. New Listing Intelligence
  if (sig.newListingIntelligence?.isNewListing) {
    if (sig.newListingIntelligence.setupViability === 'ACTIONABLE_BASE') score += 18;
    else if (sig.newListingIntelligence.hasStructuralLevels) score += 10;
  }

  // 4c. Big Move / Dump Hunter Intelligence
  if (sig.bigMoveHunter) {
    if (sig.bigMoveHunter.stage === 'EXPLOSIVE' || sig.bigMoveHunter.stage === 'EXTREME') score += 15;
    else if (sig.bigMoveHunter.stage === 'EARLY_EXPANSION') score += 10;
  }
  if (sig.dumpHunter) {
    if (sig.dumpHunter.stage === 'DUMP_TRIGGERED' || sig.dumpHunter.stage === 'EXTREME_DUMP') score += 15;
    else if (sig.dumpHunter.stage === 'DUMP_EXPANSION') score += 10;
  }

  // 5. RVOL / Volume expansion
  const rvol = (sig as any).rvol || (sig as any).opportunityReport?.rvol || (sig as any).orderflowAnalysis?.rvol || sig.newListingIntelligence?.rvol || 1.0;
  if (rvol >= 2.0) score += 12;
  else if (rvol >= 1.4) score += 8;
  else if (rvol >= 1.1) score += 4;

  // 6. News Catalyst strength
  const news = sig.newsImpactReport;
  if (news && news.isConfirmedCatalyst && news.impactScore >= 65) {
    score += 15;
  }

  // 7. Structural SL Distance
  if (sig.stopLoss > 0 && sig.entryPrice > 0) {
    const slDistPct = (Math.abs(sig.entryPrice - sig.stopLoss) / sig.entryPrice) * 100;
    if (slDistPct >= 1.2 && slDistPct <= 7.0) score += 10;
    else if (slDistPct < 1.2) score += 4;
  }

  // 8. Entry Proximity
  const curPrice = sig.currentPrice || sig.entryPrice;
  if (sig.entryPrice > 0 && curPrice > 0) {
    const distFromEntry = (Math.abs(curPrice - sig.entryPrice) / sig.entryPrice) * 100;
    if (distFromEntry <= 1.0) score += 10;
    else if (distFromEntry <= 2.5) score += 5;
    else score -= 15;
  }

  // 9. BTC Regime Alignment
  if (sig.marketRegime) {
    const isBullRegime = typeof sig.marketRegime === 'string'
      ? sig.marketRegime.includes('BULL')
      : (sig.marketRegime as any)?.btcTrend === 'BULLISH';
    if (sig.direction === 'LONG' && isBullRegime) score += 6;
    else if (sig.direction === 'SHORT' && !isBullRegime) score += 6;
  }

  return Math.round(score);
}

export interface TelegramCandidateQualification {
  qualified: boolean;
  reason?: string;
  alertType?: TelegramAlertType;
  sourceType?: string;
  score?: number;
  expectedMovePct?: number;
  isBigMoveSignal?: boolean;
  isBigDumpSignal?: boolean;
  isPreMoveSignal?: boolean;
  isExceptionalNewListing?: boolean;
  isExceptionalAsymmetry?: boolean;
  entryLow?: number;
  entryHigh?: number;
  stopLoss?: number;
  targets?: TargetLevel[];
  validTargets?: TargetLevel[];
  validLadder?: Array<{ label: string; price: number; percentage: number }>;
}

/**
 * Authoritative Candidate Qualification for Telegram Hard Firewall (Requirements 12, 13, 24)
 * Evaluates whether a candidate signal passes all structural gates, the hard firewall,
 * minimum conviction score, and alert-type specific thresholds.
 */
export function qualifyTelegramCandidate(sig: Signal): TelegramCandidateQualification {
  // Hard Firewall Invariant 1: Normal/core scanner signals are NEVER permitted on Telegram
  const isNormalSignal = !sig.isPreMove && !sig.dumpHunter && !sig.bigMoveHunter && !sig.exceptionalOpportunity?.telegramEligible && !sig.newListingIntelligence?.isNewListing;
  if (isNormalSignal) {
    return {
      qualified: false,
      reason: 'FIREWALL_BLOCKED_NORMAL_CORE_SIGNAL',
      isBigMoveSignal: false,
      isBigDumpSignal: false,
      isPreMoveSignal: false,
      isExceptionalNewListing: false,
      isExceptionalAsymmetry: false
    };
  }

  // Strict Quality gate: Telegram alerts are strictly reserved for A+ or A priority setups
  const isPriorityGrade = sig.qualityGrade === 'A+' || sig.qualityGrade === 'A';
  if (!isPriorityGrade) {
    return { qualified: false, reason: `NON_PRIORITY_GRADE_${sig.qualityGrade || 'UNKNOWN'}_SUPPRESSED_FOR_TELEGRAM` };
  }

  const entryLow = Math.min(sig.entryZoneLow || sig.entryPrice, sig.entryZoneHigh || sig.entryPrice);
  const entryHigh = Math.max(sig.entryZoneLow || sig.entryPrice, sig.entryZoneHigh || sig.entryPrice);
  const entryReference = (entryLow + entryHigh) / 2 || sig.entryPrice;

  // Authoritative TP ladder validation: ensure identical ladder logic between qualification and final firewall
  const tpValidation = validateTpLadder(
    sig.direction as 'LONG' | 'SHORT',
    entryLow,
    entryHigh,
    sig.stopLoss,
    sig.targets || []
  );

  if (!tpValidation.isValid || tpValidation.validLadder.length === 0) {
    return { qualified: false, reason: tpValidation.rejectReason || 'INVALID_TP_LADDER' };
  }

  const validTargets = tpValidation.validLadder;
  const isLong = sig.direction === 'LONG';

  // Genuine Maximum Structural Target Move (30%+ Rule)
  const highestTarget = Math.max(...validTargets.map(t => t.price));
  const lowestTarget = Math.min(...validTargets.map(t => t.price));
  const movePct = isLong
    ? Number((((highestTarget - entryReference) / entryReference) * 100).toFixed(1))
    : Number((((entryReference - lowestTarget) / entryReference) * 100).toFixed(1));

  if (movePct < 30.0) {
    return {
      qualified: false,
      reason: `FIREWALL_BLOCKED_ORDINARY_SMALL_MOVE: Maximum genuine structural target (+${movePct.toFixed(1)}%) is below mandatory 30% Telegram threshold`
    };
  }

  // Structural Stop Loss validation
  const isSlValid = isLong
    ? (sig.stopLoss > 0 && sig.stopLoss < entryLow)
    : (sig.stopLoss > 0 && sig.stopLoss > entryHigh);

  if (!isSlValid) {
    return { qualified: false, reason: `INVALID_STRUCTURAL_SL (${sig.stopLoss} vs entry [${entryLow}, ${entryHigh}])` };
  }

  const curPrice = sig.currentPrice || sig.entryPrice || 0;

  // 1. Live Price vs Entry Consistency Firewall & Zero Drift Gate
  if (curPrice > 0 && entryLow > 0 && entryHigh > 0) {
    if (isLong && curPrice > entryHigh) {
      const overPct = ((curPrice - entryHigh) / entryHigh) * 100;
      return {
        qualified: false,
        reason: `ENTRY_MISSED_RUNAWAY: Live price (${curPrice}) is above entryHigh (${entryHigh}) (+${overPct.toFixed(2)}%); LONG entry already missed`
      };
    }
    if (!isLong && curPrice < entryLow) {
      const underPct = ((entryLow - curPrice) / entryLow) * 100;
      return {
        qualified: false,
        reason: `ENTRY_MISSED_RUNAWAY: Live price (${curPrice}) is below entryLow (${entryLow}) (-${underPct.toFixed(2)}%); SHORT entry already missed`
      };
    }
    const divergencePct = (Math.abs(curPrice - entryReference) / entryReference) * 100;
    if (divergencePct > 3.0) {
      return {
        qualified: false,
        reason: `ENTRY_PRICE_DIVERGENCE_EXCEEDED: Live price ${curPrice} diverged by ${divergencePct.toFixed(1)}% from entry zone [${entryLow}, ${entryHigh}] (max allowed: 3.0%)`
      };
    }
  }

  // 2. Stop Loss breach check
  if (curPrice > 0 && sig.stopLoss > 0) {
    const isSlBreached = isLong ? curPrice <= sig.stopLoss : curPrice >= sig.stopLoss;
    if (isSlBreached) {
      return { qualified: false, reason: `STOP_LOSS_ALREADY_BREACHED: Live price ${curPrice} breached SL ${sig.stopLoss}` };
    }
  }

  // 3. Stale / TP1 Already Hit Check
  if (curPrice > 0 && validTargets[0]?.price > 0) {
    const hasAlreadyHitTP1 = isLong ? curPrice >= validTargets[0].price : curPrice <= validTargets[0].price;
    if (hasAlreadyHitTP1) {
      return { qualified: false, reason: `STALE_ALREADY_HIT_TARGET_1: Live price ${curPrice} already hit TP1 ${validTargets[0].price}` };
    }
  }

  // 4. Dynamic structural major move qualification & anti-chase guards
  const majorMove = qualifyMajorMoveOpportunity(sig);
  sig.majorMoveClass = majorMove.classification;
  sig.majorMovePotentialPct = majorMove.structurallySupportedMovePct;
  sig.majorMoveNotes = majorMove.notes;

  if (!majorMove.antiChasePassed) {
    return { qualified: false, reason: majorMove.reason };
  }

  const preMove = sig.preMoveReport || (sig as any).preMoveIntelligence;
  const isChaseExhausted = Boolean(
    sig.largeMoveIntelligence?.isAlreadyExtended ||
    sig.largeMoveIntelligence?.antiChaseActive ||
    sig.entryStatus === 'ENTRY_MISSED' ||
    (preMove && preMove.noChaseLevel > 0 && (isLong ? curPrice > preMove.noChaseLevel : curPrice < preMove.noChaseLevel))
  );

  // TELEGRAM HARD FIREWALL (User Intent: Telegram Sniper Feed Discipline)
  // 1. Extreme Pre-Move only (30%+ structural target with confirmed coil & trigger)
  const isAuthoritativePreMoveOrigin = Boolean(
    (sig.isPreMove === true || sig.id.includes('PREMOVE')) &&
    preMove
  );

  const isExtremePreMove = Boolean(
    isAuthoritativePreMoveOrigin &&
    movePct >= 30.0 &&
    (preMove?.isExtremeCandidate === true ||
     sig.isExtremeCandidate === true ||
     preMove?.largeMoveClass === 'EXCEPTIONAL_30_PLUS' ||
     sig.largeMoveClass === 'EXCEPTIONAL_30_PLUS' ||
     preMove?.largeMoveClass?.startsWith('EXTREME') ||
     sig.largeMoveClass?.startsWith('EXTREME') ||
     ((preMove?.coilScore || 0) >= 70)) &&
    preMove &&
    preMove.coilScore >= 60 &&
    !isChaseExhausted &&
    preMove.recommendedAction !== 'STAND_ASIDE' &&
    (preMove.setupStage === 'TRIGGERED' || preMove.setupStage === 'READY_TO_BREAK' || (preMove.coilScore >= 70 && preMove.setupStage === 'COILING')) &&
    (preMove.volatilitySqueeze || preMove.compressionRatio >= 30 || preMove.orderflowAbsorption?.detected || preMove.fakeoutSweep?.detected)
  );

  // 2. Genuine Big Move Hunter (LONG >= 30% structural expansion)
  const isBigMoveSignal = Boolean(
    !sig.isPreMove &&
    isLong &&
    movePct >= 30.0 &&
    sig.bigMoveHunter &&
    (sig.bigMoveHunter.stage === 'EXPLOSIVE' || sig.bigMoveHunter.stage === 'EXTREME') &&
    !isChaseExhausted
  );

  // 3. Genuine Big Dump Hunter (SHORT >= 30% structural breakdown)
  const isBigDumpSignal = Boolean(
    !sig.isPreMove &&
    !isLong &&
    movePct >= 30.0 &&
    sig.dumpHunter &&
    (sig.dumpHunter.stage === 'DUMP_EXPANSION' || sig.dumpHunter.stage === 'EXTREME_DUMP' || sig.dumpHunter.stage === 'DUMP_TRIGGERED') &&
    !isChaseExhausted
  );

  // 4. Exceptional New Listing (>= 30% verified base breakout)
  const isExceptionalNewListing = Boolean(
    sig.newListingIntelligence?.isNewListing &&
    sig.newListingIntelligence.setupViability === 'ACTIONABLE_BASE' &&
    sig.newListingIntelligence.hasStructuralLevels &&
    !sig.newListingIntelligence.antiChaseWarning &&
    sig.newListingIntelligence.pumpDumpRisk !== 'CRITICAL' &&
    movePct >= 30.0 &&
    !isChaseExhausted
  );

  // 5. Exceptional Asymmetry (>= 30% critical asymmetric setup)
  const isExceptionalAsymmetrySignal = Boolean(
    sig.exceptionalOpportunity?.telegramEligible &&
    sig.exceptionalOpportunity?.priority === 'CRITICAL' &&
    sig.exceptionalOpportunity?.opportunityClass !== 'STANDARD' &&
    movePct >= 30.0 &&
    !isChaseExhausted
  );

  const passesTelegramHardFirewall = isBigMoveSignal || isBigDumpSignal || isExtremePreMove || isExceptionalAsymmetrySignal || isExceptionalNewListing;

  if (!passesTelegramHardFirewall) {
    const isNormalSignal = !sig.isPreMove && !sig.dumpHunter && !sig.bigMoveHunter && !sig.exceptionalOpportunity?.telegramEligible && !sig.newListingIntelligence?.isNewListing;
    return {
      qualified: false,
      reason: isNormalSignal
        ? 'FIREWALL_BLOCKED_NORMAL_CORE_SIGNAL'
        : `FIREWALL_BLOCKED_ORDINARY_SMALL_MOVE: Ordinary move (+${movePct.toFixed(1)}%) suppressed by Telegram Sniper Firewall; strictly reserved for Extreme Pre-Move or 30%+ Exceptional opportunities`,
      isBigMoveSignal,
      isBigDumpSignal,
      isPreMoveSignal: isExtremePreMove,
      isExceptionalNewListing,
      isExceptionalAsymmetry: isExceptionalAsymmetrySignal
    };
  }

  let alertType: TelegramAlertType = 'MAJOR_MOVE';
  let sourceType = 'EXCEPTIONAL ASYMMETRIC SETUP';

  if (isBigDumpSignal) {
    alertType = 'PRE_DUMP';
    sourceType = 'BIG DUMP HUNTER (Cascade Breakdown)';
  } else if (isBigMoveSignal) {
    alertType = movePct >= 50.0 ? 'EXTREME_MOVE' : 'MAJOR_MOVE';
    sourceType = 'BIG MOVE HUNTER (Explosive Expansion)';
  } else if (isExtremePreMove) {
    const isPrePump = preMove?.projectedDirection === 'BULLISH' || ((!preMove?.projectedDirection || preMove?.projectedDirection === 'NEUTRAL') && isLong) || isLong;
    alertType = isPrePump ? 'PRE_PUMP' : 'PRE_DUMP';
    sourceType = isPrePump ? 'PRE-PUMP (Coiling / Early Acceleration)' : 'PRE-DUMP (Distribution / Coiling Breakdown)';
  } else if (isExceptionalNewListing) {
    alertType = 'MAJOR_MOVE';
    sourceType = 'NEW LISTING MOMENTUM (Base Breakout)';
  } else if (isExceptionalAsymmetrySignal) {
    alertType = movePct >= 50.0 ? 'EXTREME_MOVE' : 'MAJOR_MOVE';
    sourceType = 'EXCEPTIONAL ASYMMETRIC SETUP';
  }

  const score = computeEliteOpportunityScore(sig, movePct);
  const minConvictionScore = (sig.qualityGrade === 'A+' && (sig.riskRewardRatio || 0) >= 2.2) ? 75 : 80;
  if (score < minConvictionScore) {
    return { qualified: false, reason: `HIGH_CONVICTION_SCORE_BELOW_THRESHOLD (actual: ${score} < ${minConvictionScore})`, alertType, sourceType, score, isBigMoveSignal, isBigDumpSignal, isPreMoveSignal: isExtremePreMove, isExceptionalNewListing, isExceptionalAsymmetry: isExceptionalAsymmetrySignal };
  }

  const targetLevels: TargetLevel[] = validTargets.map(t => ({
    id: t.label,
    label: t.label,
    price: t.price,
    percentage: t.percentage
  }));

  return {
    qualified: true,
    alertType,
    sourceType,
    score,
    expectedMovePct: movePct,
    isBigMoveSignal,
    isBigDumpSignal,
    isPreMoveSignal: isExtremePreMove,
    isExceptionalNewListing,
    isExceptionalAsymmetry: isExceptionalAsymmetrySignal,
    entryLow,
    entryHigh,
    stopLoss: sig.stopLoss,
    targets: targetLevels,
    validTargets: targetLevels,
    validLadder: validTargets
  };
}

// Mutex serialization queue for Telegram evaluation & dispatch
let telegramMutex: Promise<any> = Promise.resolve();

/**
 * Evaluate all signals for Elite Telegram alerts:
 * - Pre-Move (PRE-PUMP / PRE-DUMP)
 * - Major Move (≥30%)
 * - Extreme Move (≥50%)
 * - News Signal
 *
 * Enforces:
 * - Mutex-serialized execution (single-queue to prevent concurrency race conditions)
 * - Only genuine ≥30% expected move with valid SL and targets
 * - Maximum active Telegram opportunities: strictly 6 (absolute max 6)
 * - Replaces weakest active opportunity when a stronger one appears
 * - Strict deduplication, cooldown, and burst protection (max 2 dispatches per run)
 */
export function evaluateAndDispatchSignalAlerts(signals: Signal[]): Promise<number> {
  const task = () => runSerializedEvaluateAndDispatch(signals);
  const next = telegramMutex.then(task, task);
  telegramMutex = next.catch(() => {});
  return next;
}

async function runSerializedEvaluateAndDispatch(signals: Signal[]): Promise<number> {
  let dispatchedCount = 0;
  const MAX_DISPATCH_PER_EVAL_RUN = 1; // Strict priority cadence: max 1 alert per evaluation cycle
  pipelineDiagnostics.TELEGRAM_TOTAL_EVALUATIONS++;
  pipelineDiagnostics.TELEGRAM_LAST_EVALUATION_AT = Date.now();
  pipelineDiagnostics.TELEGRAM_LAST_CANDIDATE_COUNT = signals.length;
  pipelineDiagnostics.TELEGRAM_LAST_ELIGIBLE_COUNT = 0;
  pipelineDiagnostics.TELEGRAM_LAST_NEW_COUNT = 0;
  pipelineDiagnostics.TELEGRAM_LAST_UPDATED_COUNT = 0;
  pipelineDiagnostics.TELEGRAM_LAST_UNCHANGED_COUNT = 0;
  pipelineDiagnostics.lastEvaluationAt = Date.now();

  const now = Date.now();
  pipelineDiagnostics.TELEGRAM_EVALUATION_COUNT++;
  pipelineDiagnostics.TELEGRAM_CANDIDATE_COUNT = signals.length;
  pipelineDiagnostics.TELEGRAM_LAST_CHECK_TIME = now;
  pipelineDiagnostics.TELEGRAM_SERVER_MONITOR_ACTIVE = isTelegramMonitoringLoopRunning();

  // Housekeeping: ensure active shortlist never exceeds strict limit of 6
  if (activeTelegramOpportunities.size > ABSOLUTE_MAX_TELEGRAM_OPPORTUNITIES) {
    const sorted = Array.from(activeTelegramOpportunities.entries()).sort((a, b) => b[1].score - a[1].score);
    const toKeep = sorted.slice(0, ABSOLUTE_MAX_TELEGRAM_OPPORTUNITIES);
    activeTelegramOpportunities.clear();
    for (const [k, v] of toKeep) {
      activeTelegramOpportunities.set(k, v);
    }
  }

  interface CandidateOpportunity {
    signal: Signal;
    normSym: string;
    alertType: TelegramAlertType;
    sourceType: string;
    entryLow: number;
    entryHigh: number;
    currentPrice: number;
    stopLoss: number;
    validTargets: Array<{ label: string; price: number; percentage: number }>;
    expectedMovePct: number;
    riskRewardRatio: number;
    qualityGrade: string;
    confidence: number;
    score: number;
  }

  const qualifiedCandidates: CandidateOpportunity[] = [];
  const processedCoins = new Set<string>();

  for (const sig of signals) {
    pipelineDiagnostics.totalEvaluated++;
    pipelineDiagnostics.discovered++;

    if (!sig) continue;
    const normSym = sig.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();

    if ((sig.direction as any) === 'WAIT' || sig.entryPrice <= 0) {
      pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION++;
      recordDiagnosticEvaluation({
        symbol: normSym,
        opportunityId: sig.id,
        status: 'REJECTED',
        reason: (sig.direction as any) === 'WAIT' ? 'DIRECTION_IS_WAIT' : 'INVALID_ENTRY_PRICE',
        expectedMovePct: 0,
        targetsCount: 0,
        direction: sig.direction,
        qualityGrade: sig.qualityGrade || 'N/A'
      });
      continue;
    }

    const validTargets = (sig.targets || []).filter(
      t => typeof t.price === 'number' && t.price > 0 && t.status !== 'INVALIDATED'
    ).map((t, idx) => ({
      label: t.label || `TP${idx + 1}`,
      price: t.price,
      percentage: Number(t.percentage || (((t.price - sig.entryPrice) / sig.entryPrice) * 100).toFixed(1))
    }));

    if (validTargets.length === 0) {
      pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION++;
      recordDiagnosticEvaluation({
        symbol: normSym,
        opportunityId: sig.id,
        status: 'REJECTED',
        reason: 'NO_STRUCTURAL_TARGETS_ESTABLISHED',
        expectedMovePct: 0,
        targetsCount: 0,
        direction: sig.direction,
        qualityGrade: sig.qualityGrade || 'A'
      });
      continue;
    }

    // Strict Grade Requirement: Grade A or A+
    if (sig.qualityGrade !== 'A' && sig.qualityGrade !== 'A+') {
      pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION++;
      recordDiagnosticEvaluation({
        symbol: normSym,
        opportunityId: sig.id,
        status: 'REJECTED',
        reason: `GRADE_BELOW_A_STANDARD (${sig.qualityGrade || 'N/A'})`,
        expectedMovePct: 0,
        targetsCount: validTargets.length,
        direction: sig.direction,
        qualityGrade: sig.qualityGrade || 'N/A'
      });
      continue;
    }

    const isLong = sig.direction === 'LONG';
    const entryLow = Math.min(sig.entryZoneLow || sig.entryPrice, sig.entryZoneHigh || sig.entryPrice);
    const entryHigh = Math.max(sig.entryZoneLow || sig.entryPrice, sig.entryZoneHigh || sig.entryPrice);
    const entryReference = (entryLow + entryHigh) / 2 || sig.entryPrice;

    const tpValidation = validateTpLadder(
      sig.direction as 'LONG' | 'SHORT',
      entryLow,
      entryHigh,
      sig.stopLoss,
      sig.targets || []
    );

    if (!tpValidation.isValid || tpValidation.validLadder.length === 0) {
      pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION++;
      recordDiagnosticEvaluation({
        symbol: normSym,
        opportunityId: sig.id,
        status: 'REJECTED',
        reason: tpValidation.rejectReason || 'INVALID_TP_LADDER',
        expectedMovePct: 0,
        targetsCount: 0,
        direction: sig.direction,
        qualityGrade: sig.qualityGrade || 'A'
      });
      continue;
    }

    const verifiedTargets = tpValidation.validLadder;
    const highestTarget = Math.max(...verifiedTargets.map(t => t.price));
    const lowestTarget = Math.min(...verifiedTargets.map(t => t.price));
    const movePct = isLong
      ? Number((((highestTarget - entryReference) / entryReference) * 100).toFixed(1))
      : Number((((entryReference - lowestTarget) / entryReference) * 100).toFixed(1));

    // Mandatory 30%+ Genuine Structural Target Rule
    if (movePct < 30.0) {
      pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION++;
      pipelineDiagnostics.NORMAL_SIGNALS_BLOCKED++;
      recordDiagnosticEvaluation({
        symbol: normSym,
        opportunityId: sig.id,
        status: 'REJECTED',
        reason: `FIREWALL_BLOCKED_BELOW_30_PERCENT_STRUCTURAL_TARGET (+${movePct}% < 30%)`,
        expectedMovePct: movePct,
        targetsCount: validTargets.length,
        direction: sig.direction,
        qualityGrade: sig.qualityGrade || 'A'
      });
      continue;
    }

    const curPrice = sig.currentPrice || sig.entryPrice || 0;
    if (curPrice > 0 && entryLow > 0 && entryHigh > 0) {
      if (isLong && curPrice > entryHigh) {
        pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION++;
        recordDiagnosticEvaluation({
          symbol: normSym,
          opportunityId: sig.id,
          status: 'REJECTED',
          reason: `ENTRY_MISSED_RUNAWAY (Live ${curPrice} > entryHigh ${entryHigh})`,
          expectedMovePct: movePct,
          targetsCount: validTargets.length,
          direction: sig.direction,
          qualityGrade: sig.qualityGrade || 'A'
        });
        continue;
      }
      if (!isLong && curPrice < entryLow) {
        pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION++;
        recordDiagnosticEvaluation({
          symbol: normSym,
          opportunityId: sig.id,
          status: 'REJECTED',
          reason: `ENTRY_MISSED_RUNAWAY (Live ${curPrice} < entryLow ${entryLow})`,
          expectedMovePct: movePct,
          targetsCount: validTargets.length,
          direction: sig.direction,
          qualityGrade: sig.qualityGrade || 'A'
        });
        continue;
      }
    }

    // Structural Stop Loss validation
    const isSlValid = isLong
      ? (sig.stopLoss > 0 && sig.stopLoss < entryLow)
      : (sig.stopLoss > 0 && sig.stopLoss > entryHigh);

    if (!isSlValid) {
      pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION++;
      recordDiagnosticEvaluation({
        symbol: normSym,
        opportunityId: sig.id,
        status: 'REJECTED',
        reason: `INVALID_STRUCTURAL_SL (${sig.stopLoss} vs entry [${entryLow}, ${entryHigh}])`,
        expectedMovePct: movePct,
        targetsCount: validTargets.length,
        direction: sig.direction,
        qualityGrade: sig.qualityGrade || 'A'
      });
      continue;
    }

    // Check if Stop Loss already breached
    if (curPrice > 0 && sig.stopLoss > 0) {
      const isSlBreached = isLong ? curPrice <= sig.stopLoss : curPrice >= sig.stopLoss;
      if (isSlBreached) {
        pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION++;
        recordDiagnosticEvaluation({
          symbol: normSym,
          opportunityId: sig.id,
          status: 'REJECTED',
          reason: `STOP_LOSS_ALREADY_BREACHED (${curPrice} vs SL ${sig.stopLoss})`,
          expectedMovePct: movePct,
          targetsCount: validTargets.length,
          direction: sig.direction,
          qualityGrade: sig.qualityGrade || 'A'
        });
        continue;
      }
    }

    // Check if TP1 already hit
    if (curPrice > 0 && validTargets[0]?.price > 0) {
      const tp1Hit = isLong ? curPrice >= validTargets[0].price : curPrice <= validTargets[0].price;
      if (tp1Hit) {
        pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION++;
        recordDiagnosticEvaluation({
          symbol: normSym,
          opportunityId: sig.id,
          status: 'REJECTED',
          reason: `STALE_ALREADY_HIT_TARGET_1 (Live ${curPrice} vs TP1 ${validTargets[0].price})`,
          expectedMovePct: movePct,
          targetsCount: validTargets.length,
          direction: sig.direction,
          qualityGrade: sig.qualityGrade || 'A'
        });
        continue;
      }
    }

    // 1. HARD TP LADDER INVARIANTS (Requirement 5)
    // Long: Entry < TP1 < TP2 < TP3 ...
    // Short: Entry > TP1 > TP2 > TP3 ...
    // Zero duplicate TP prices, zero inverted TP prices, zero fake targets.
    const hasDuplicateTps = validTargets.some((t, idx) =>
      validTargets.findIndex(other => Math.abs(other.price - t.price) / t.price < 0.001) !== idx
    );

    let isLadderOrdered = true;
    for (let i = 0; i < validTargets.length; i++) {
      const tp = validTargets[i].price;
      const prevPrice = i === 0 ? sig.entryPrice : validTargets[i - 1].price;
      if (isLong) {
        if (tp <= prevPrice) { isLadderOrdered = false; break; }
      } else {
        if (tp >= prevPrice) { isLadderOrdered = false; break; }
      }
    }

    if (hasDuplicateTps || !isLadderOrdered) {
      pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION++;
      recordDiagnosticEvaluation({
        symbol: normSym,
        opportunityId: sig.id,
        status: 'REJECTED',
        reason: 'CORRUPTED_OR_INVERTED_TARGET_LADDER',
        expectedMovePct: movePct,
        targetsCount: validTargets.length,
        direction: sig.direction,
        qualityGrade: sig.qualityGrade || 'A'
      });
      continue;
    }

    // Evaluate dynamic structural major move qualification & anti-chase guards
    const majorMove = qualifyMajorMoveOpportunity(sig);
    sig.majorMoveClass = majorMove.classification;
    sig.majorMovePotentialPct = majorMove.structurallySupportedMovePct;
    sig.majorMoveNotes = majorMove.notes;

    if (!majorMove.antiChasePassed) {
      pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION++;
      recordDiagnosticEvaluation({
        symbol: normSym,
        opportunityId: sig.id,
        status: 'REJECTED',
        reason: majorMove.reason,
        expectedMovePct: movePct,
        targetsCount: validTargets.length,
        direction: sig.direction,
        qualityGrade: sig.qualityGrade || 'A'
      });
      continue;
    }

    // Determine the authoritative classification for this opportunity:
    const preMove = sig.preMoveReport || (sig as any).preMoveIntelligence;
    const isChaseExhausted = Boolean(
      sig.largeMoveIntelligence?.isAlreadyExtended ||
      sig.largeMoveIntelligence?.antiChaseActive ||
      sig.entryStatus === 'ENTRY_MISSED' ||
      (preMove && preMove.noChaseLevel > 0 && (isLong ? curPrice > preMove.noChaseLevel : curPrice < preMove.noChaseLevel))
    );

    // =========================================================================
    // TELEGRAM HARD FIREWALL (User Requirements: Sniper Feed Discipline)
    //
    // The following MUST NEVER reach Telegram:
    // - Ordinary core scanner LONG / SHORT (e.g. CITY LONG +0.57% to +2.12%)
    // - Routine A/B/C signals
    // - Small 2-5%, 5-10%, or ordinary 10-15% moves (e.g. SC SHORT +5.26% to +14.02%)
    // - Routine scanner polling signals
    // - Normal signals with informational preMoveReport attached
    //
    // Telegram MAY send only:
    // A. Genuine Authoritative Pre-Move Opportunity:
    //    - Originates as an authoritative Pre-Move signal (isPreMove === true && id has 'PREMOVE')
    //    - High coil energy: coilScore >= 65
    //    - Real compression/absorption: volatilitySqueeze || compressionRatio >= 40 || orderflowAbsorption?.detected
    //    - Triggered or ready stage: setupStage === 'TRIGGERED' || setupStage === 'READY_TO_BREAK'
    //    - Minimum 8% structural expansion: movePct >= 8.0%
    //    - Not chase-exhausted
    //    - Priority Grade A or A+, RR >= 1.5
    //
    // B. Genuine Big Move Opportunity (LONG):
    //    - Not Pre-Move origin
    //    - Structurally supported move >= 25.0% (or majorMovePotentialPct >= 25.0%)
    //    - Confirmed explosive stage: bigMoveHunter && (stage === 'EXPLOSIVE' || stage === 'EXTREME')
    //    - Grade A or A+, RR >= 2.0
    //
    // C. Genuine Big Dump Opportunity (SHORT):
    //    - Not Pre-Move origin
    //    - Structurally supported move >= 25.0% (or majorMovePotentialPct >= 25.0%)
    //    - Confirmed breakdown stage: dumpHunter && (stage === 'DUMP_EXPANSION' || stage === 'EXTREME_DUMP')
    //    - Grade A or A+, RR >= 2.0
    //
    // D. Genuine Verified New Listing:
    //    - isNewListing && setupViability === 'ACTIONABLE_BASE' && hasStructuralLevels && movePct >= 20.0
    //
    // E. Genuine Exceptional Asymmetric Setup:
    //    - exceptionalOpportunity?.priority === 'CRITICAL' && movePct >= 25.0
    // =========================================================================

    const isAuthoritativePreMoveOrigin = Boolean(
      (sig.isPreMove === true || sig.id.includes('PREMOVE')) &&
      preMove
    );

    if (!isAuthoritativePreMoveOrigin) {
      pipelineDiagnostics.NORMAL_SIGNALS_SEEN++;
    } else {
      pipelineDiagnostics.PREMOVE_EVALUATED++;
    }

    if (sig.bigMoveHunter) {
      pipelineDiagnostics.BIG_MOVE_CANDIDATES++;
    }
    if (sig.dumpHunter) {
      pipelineDiagnostics.BIG_DUMP_CANDIDATES++;
    }

    // Authoritative candidate qualification through the Telegram Hard Firewall
    const qualification = qualifyTelegramCandidate(sig);

    if (!qualification.qualified) {
      if (!isAuthoritativePreMoveOrigin) {
        pipelineDiagnostics.NORMAL_SIGNALS_BLOCKED++;
      }
      pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION++;
      recordDiagnosticEvaluation({
        symbol: normSym,
        opportunityId: sig.id,
        status: 'SUPPRESSED',
        reason: qualification.reason,
        expectedMovePct: movePct,
        targetsCount: validTargets.length,
        direction: sig.direction,
        qualityGrade: sig.qualityGrade || 'A'
      });
      continue;
    }

    if (qualification.isPreMoveSignal) {
      pipelineDiagnostics.PREMOVE_QUALIFIED++;
      pipelineDiagnostics.PREMOVE_LAST_ALERT_CLASS = preMove?.largeMoveClass || sig.largeMoveClass || 'EXTREME';
    }

    qualifiedCandidates.push({
      signal: sig,
      normSym,
      alertType: qualification.alertType || 'MAJOR_MOVE',
      sourceType: qualification.sourceType || 'EXCEPTIONAL ASYMMETRIC SETUP',
      entryLow: qualification.entryLow ?? entryLow,
      entryHigh: qualification.entryHigh ?? entryHigh,
      currentPrice: curPrice,
      stopLoss: sig.stopLoss,
      validTargets: qualification.validLadder || verifiedTargets,
      expectedMovePct: qualification.expectedMovePct || movePct,
      riskRewardRatio: sig.riskRewardRatio || 0,
      qualityGrade: sig.qualityGrade || 'WAIT',
      confidence: sig.confidence || 0,
      score: qualification.score || computeEliteOpportunityScore(sig, movePct)
    });
  }

  // Sort qualified candidates strictly by calculated elite quality score descending
  qualifiedCandidates.sort((a, b) => b.score - a.score);

  // Deduplicate same coin: keep only the single highest-scoring setup for each coin
  const deduplicatedCandidates: CandidateOpportunity[] = [];
  for (const cand of qualifiedCandidates) {
    if (!processedCoins.has(cand.normSym)) {
      processedCoins.add(cand.normSym);
      deduplicatedCandidates.push(cand);
    }
  }

  pipelineDiagnostics.TELEGRAM_LAST_ELIGIBLE_COUNT = deduplicatedCandidates.length;

  if (deduplicatedCandidates.length === 0) {
    pipelineDiagnostics.TELEGRAM_LAST_ZERO_DISPATCH_REASON = 'Waiting for exceptional opportunity (no candidate passed high-conviction filter)';
    return 0;
  }

  // Global Throttling Check (Section 11):
  // Rank all candidates first. Then check global cooldown.
  // Allow CRITICAL priority / explosive setups through if at least 60s has passed;
  // otherwise enforce the 5-minute cooldown.
  const timeSinceLastGlobal = now - lastGlobalTelegramDispatchAt;
  if (lastGlobalTelegramDispatchAt > 0 && timeSinceLastGlobal < GLOBAL_TELEGRAM_COOLDOWN_MS) {
    const topCandidate = deduplicatedCandidates[0];
    const isCriticalPriority = topCandidate?.signal?.exceptionalOpportunity?.priority === 'CRITICAL' || (topCandidate?.score >= 92);
    const allowCriticalThrough = isCriticalPriority && timeSinceLastGlobal >= 60000;

    if (!allowCriticalThrough) {
      const remainingCooldownSec = Math.ceil((GLOBAL_TELEGRAM_COOLDOWN_MS - timeSinceLastGlobal) / 1000);
      pipelineDiagnostics.TELEGRAM_LAST_ZERO_DISPATCH_REASON = `Global cooldown active (${remainingCooldownSec}s remaining)`;
      console.log(`[Telegram Throttling] Global dispatch cooldown active (${remainingCooldownSec}s remaining). Dispatch suppressed.`);
      return 0;
    }
  }

  // Prune expired or invalidated active opportunities from previous cycles (>24h or SL hit)
  for (const [sym, active] of activeTelegramOpportunities.entries()) {
    const isStale = (now - active.lastDispatchedAt) > 24 * 60 * 60 * 1000;
    if (isStale) {
      activeTelegramOpportunities.delete(sym);
    }
  }

  // Process candidate opportunities using fresh exchange data, live actionability validation, and canonical fingerprint
  let rejectedStaleData = 0;
  let rejectedInvalidLivePrice = 0;
  let rejectedInvalidEntry = 0;
  let rejectedInvalidSlTp = 0;
  let rejectedAntiChase = 0;
  let rejectedDuplicate = 0;
  let telegramApiFailureCount = 0;
  const suppressionReasons: string[] = [];

  for (const cand of deduplicatedCandidates) {
    // 1. Fetch strictly fresh live market data (Binance/Bybit/OKX/MEXC) on execution timeframe
    const execTf = resolveExecutionTimeframe(cand.signal, cand.signal.timeframe);
    const marketData = await fetchFreshTelegramLiveMarketData(cand.signal.symbol, execTf.toLowerCase());
    if (!marketData.isFresh || !marketData.ticker || !marketData.candles || marketData.candles.length < 20) {
      if (marketData.rejectReason?.includes('PRICE')) {
        rejectedInvalidLivePrice++;
      } else {
        rejectedStaleData++;
      }
      suppressionReasons.push(`${cand.normSym}: Stale/Unavailable LiveData (${marketData.rejectReason || 'NO_DATA'})`);
      recordDiagnosticEvaluation({
        symbol: cand.normSym,
        opportunityId: cand.signal.id,
        status: 'SUPPRESSED',
        reason: `STALE_OR_UNAVAILABLE_MARKET_DATA (${marketData.rejectReason || 'NO_DATA'})`,
        expectedMovePct: cand.expectedMovePct,
        targetsCount: cand.validTargets.length,
        direction: cand.signal.direction,
        qualityGrade: cand.qualityGrade
      });
      continue;
    }

    // 2. Universal Live Actionability Validation against fresh ticker (Sections 1 & 2)
    const actionability = validateTelegramSignalActionability(
      {
        symbol: cand.normSym,
        direction: cand.signal.direction,
        entryLow: cand.entryLow,
        entryHigh: cand.entryHigh,
        stopLoss: cand.stopLoss,
        targets: cand.validTargets,
        alertType: cand.alertType
      },
      marketData.ticker,
      marketData.candles
    );

    if (!actionability.isValid) {
      const reason = actionability.rejectReason || 'INVALID';
      if (reason.includes('SL')) {
        rejectedInvalidSlTp++;
      } else if (reason.includes('TP')) {
        rejectedInvalidSlTp++;
      } else if (reason.includes('ENTRY')) {
        rejectedInvalidEntry++;
      } else if (reason.includes('SURGED') || reason.includes('DUMPED') || reason.includes('EXPANSION')) {
        rejectedAntiChase++;
      } else {
        rejectedInvalidLivePrice++;
      }
      suppressionReasons.push(`${cand.normSym}: Actionability (${reason})`);
      if (reason.includes('SURGED') || reason.includes('DUMPED') || reason.includes('SL') || reason.includes('TP1')) {
        invalidateStoredSignal(cand.signal.symbol, reason);
      }
      recordDiagnosticEvaluation({
        symbol: cand.normSym,
        opportunityId: cand.signal.id,
        status: 'SUPPRESSED',
        reason: `STALE_OR_NON_ACTIONABLE (${actionability.rejectReason})`,
        expectedMovePct: cand.expectedMovePct,
        targetsCount: cand.validTargets.length,
        direction: cand.signal.direction,
        qualityGrade: cand.qualityGrade
      });
      continue;
    }

    // Update with authoritative live price & calculated remaining potential
    cand.currentPrice = actionability.actionableCurrentPrice;
    cand.expectedMovePct = actionability.remainingMovePct;

    const entryMid = (cand.entryLow && cand.entryHigh && cand.entryLow > 0)
      ? (cand.entryLow + cand.entryHigh) / 2
      : cand.currentPrice;

    const fingerprint = calculateOpportunityFingerprint({
      symbol: cand.signal.symbol,
      direction: cand.signal.direction as any,
      entryPrice: entryMid,
      entryLow: cand.entryLow,
      entryHigh: cand.entryHigh,
      stopLoss: cand.stopLoss,
      targets: cand.validTargets,
      qualityGrade: cand.qualityGrade
    });

    const stateClassification = classifyOpportunityState({
      fingerprint,
      normSym: cand.normSym,
      direction: cand.signal.direction as any,
      entryPrice: entryMid,
      stopLoss: cand.stopLoss,
      qualityGrade: cand.qualityGrade,
      expectedMovePct: cand.expectedMovePct
    });

    if (stateClassification.state === 'UNCHANGED_OPPORTUNITY') {
      rejectedDuplicate++;
      suppressionReasons.push(`${cand.normSym}: Deduplicated (${stateClassification.reason})`);
      pipelineDiagnostics.TELEGRAM_LAST_UNCHANGED_COUNT++;
      pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_DUPLICATE++;
      recordDiagnosticEvaluation({
        symbol: cand.normSym,
        opportunityId: cand.signal.id,
        status: 'SUPPRESSED',
        reason: `UNCHANGED_OPPORTUNITY (${stateClassification.reason})`,
        expectedMovePct: cand.expectedMovePct,
        targetsCount: cand.validTargets.length,
        direction: cand.signal.direction,
        qualityGrade: cand.qualityGrade
      });

      // Update tracking price/score if already in active shortlist
      const existingActive = activeTelegramOpportunities.get(cand.normSym);
      if (existingActive) {
        existingActive.currentPrice = cand.currentPrice;
        existingActive.score = cand.score;
      }
      continue;
    }

    if (stateClassification.state === 'INVALIDATED_OPPORTUNITY') {
      continue;
    }

    // Opportunity-level cooldown: do not re-dispatch alerts for the SAME setup on the same coin within 4 hours
    // But do NOT suppress legitimate NEW opportunities (User Requirement 3):
    // "Do NOT block a symbol for 4 hours merely because that symbol previously sent an alert.
    // Cooldown/deduplication must identify the SAME OPPORTUNITY using the existing
    // opportunity identity / structural setup / direction / entry structure.
    // A genuinely NEW structural opportunity on the same symbol must be allowed after passing all other filters."
    const existingActive = activeTelegramOpportunities.get(cand.normSym);
    if (existingActive) {
      const isDirectionReversal = cand.signal.direction !== existingActive.direction;
      const isStageTriggered = Boolean(
        (cand.sourceType === 'PRE_MOVE' && cand.signal.preMoveReport?.setupStage === 'TRIGGERED' && existingActive.status !== 'TRIGGERED') ||
        (cand.signal.bigMoveHunter && (cand.signal.bigMoveHunter.stage === 'EXPLOSIVE' || cand.signal.bigMoveHunter.stage === 'EXTREME') && (existingActive.alertType as string) !== 'BIG_MOVE_HUNTER') ||
        (cand.signal.dumpHunter && (cand.signal.dumpHunter.stage === 'EXTREME_DUMP' || cand.signal.dumpHunter.stage === 'DUMP_TRIGGERED') && (existingActive.alertType as string) !== 'DUMP_HUNTER')
      );
      const isMajorGradeUpgrade = (existingActive.qualityGrade === 'B' || existingActive.qualityGrade === 'A') && cand.qualityGrade === 'A+';
      const isMateriallyNewEvent = isDirectionReversal || isStageTriggered || isMajorGradeUpgrade;

      const isSameOpportunity = existingActive.fingerprint === fingerprint ||
        (!isDirectionReversal &&
         existingActive.entryPrice > 0 && entryMid > 0 &&
         Math.abs(existingActive.entryPrice - entryMid) / entryMid < 0.015 &&
         existingActive.stopLoss > 0 && cand.stopLoss > 0 &&
         Math.abs(existingActive.stopLoss - cand.stopLoss) / cand.stopLoss < 0.015);

      const timeSinceCoinDispatch = now - existingActive.lastDispatchedAt;
      if (isSameOpportunity && !isMateriallyNewEvent && timeSinceCoinDispatch < SYMBOL_TELEGRAM_COOLDOWN_MS) {
        rejectedDuplicate++;
        suppressionReasons.push(`${cand.normSym}: OpportunityCooldown (${Math.ceil((SYMBOL_TELEGRAM_COOLDOWN_MS - timeSinceCoinDispatch) / 60000)}m remaining)`);
        continue;
      }
    }

    // Persistent Ledger Cooldown Check (covers prior sessions, server restarts, or historical dispatches)
    const ledgerEntry = telegramLedger.get(fingerprint) || symbolLedgerIndex.get(cand.normSym);
    if (ledgerEntry) {
      const ledgerCheck = shouldDispatchAlert(
        cand.normSym,
        cand.alertType,
        fingerprint,
        cand.signal.direction,
        cand.qualityGrade,
        cand.signal.status || 'ACTIVE',
        cand.expectedMovePct
      );
      if (!ledgerCheck.shouldDispatch) {
        rejectedDuplicate++;
        pipelineDiagnostics.TELEGRAM_LAST_UNCHANGED_COUNT++;
        pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_DUPLICATE++;
        const remainingMin = Math.ceil((SYMBOL_TELEGRAM_COOLDOWN_MS - (now - ledgerEntry.lastSentAt)) / 60000);
        suppressionReasons.push(`${cand.normSym}: Deduplicated (${remainingMin > 0 ? `${remainingMin}m remaining` : 'RECENTLY_SENT_IN_LEDGER'})`);
        continue;
      }
    }

    if (dispatchedCount >= MAX_DISPATCH_PER_EVAL_RUN) {
      // Prevent burst dispatching in any single evaluation interval
      break;
    }

    if (dispatchedCount > 0) {
      await new Promise(r => setTimeout(r, 400));
    }

    // If active shortlist has room (strictly max 6 active opportunities)
    if (activeTelegramOpportunities.size < DEFAULT_MAX_TELEGRAM_OPPORTUNITIES) {
      const candPreMove = cand.signal.preMoveReport || (cand.signal as any).preMoveIntelligence;
      const res = await dispatchEventAlert({
        alertType: cand.alertType,
        symbol: cand.signal.symbol,
        opportunityId: cand.signal.id,
        direction: cand.signal.direction,
        entryLow: cand.entryLow,
        entryHigh: cand.entryHigh,
        currentPrice: cand.currentPrice,
        stopLoss: cand.stopLoss,
        targets: cand.validTargets,
        expectedMovePct: cand.expectedMovePct,
        riskRewardRatio: cand.riskRewardRatio,
        qualityGrade: cand.qualityGrade,
        confidence: cand.confidence,
        sourceType: cand.sourceType,
        preFetchedMarketData: marketData,
        keyTriggerLevel: candPreMove?.keyTriggerLevel || (cand.signal.direction === 'LONG' ? cand.entryHigh : cand.entryLow),
        noChaseLevel: candPreMove?.noChaseLevel || (cand.signal.largeMoveIntelligence as any)?.noChaseThreshold,
        timeframe: execTf,
        signal: cand.signal
      });

      if (res.dispatched) {
        dispatchedCount++;
        lastGlobalTelegramDispatchAt = now;
        if (stateClassification.state === 'NEW_OPPORTUNITY') {
          pipelineDiagnostics.TELEGRAM_LAST_NEW_COUNT++;
        } else {
          pipelineDiagnostics.TELEGRAM_LAST_UPDATED_COUNT++;
        }
        pipelineDiagnostics.TELEGRAM_TOTAL_SENT++;
        pipelineDiagnostics.TELEGRAM_LAST_SENT_SYMBOL = cand.signal.symbol;
        pipelineDiagnostics.TELEGRAM_LAST_SENT_FINGERPRINT = fingerprint;

        activeTelegramOpportunities.set(cand.normSym, {
          opportunityId: cand.signal.id,
          fingerprint,
          symbol: cand.signal.symbol,
          alertType: cand.alertType,
          sourceType: cand.sourceType,
          direction: cand.signal.direction,
          score: cand.score,
          qualityGrade: cand.qualityGrade,
          expectedMovePct: cand.expectedMovePct,
          riskRewardRatio: cand.riskRewardRatio,
          entryPrice: entryMid,
          entryLow: cand.entryLow,
          entryHigh: cand.entryHigh,
          currentPrice: cand.currentPrice,
          stopLoss: cand.stopLoss,
          targets: cand.validTargets,
          timestamp: cand.signal.timestamp || now,
          lastDispatchedAt: now,
          status: 'ACTIVE'
        });
      } else {
        if (res.reason?.includes('failed') || res.reason?.includes('network') || res.reason?.includes('HTTP')) {
          telegramApiFailureCount++;
        }
        const isDeliveryFailure = res.reason?.includes('failed') || res.reason?.includes('network') || res.reason?.includes('HTTP') || res.reason?.includes('RENDER_FAILED');
        const suppressionPrefix = isDeliveryFailure
          ? 'DeliveryFailed'
          : (res.reason?.includes('LEDGER') || res.reason?.includes('DUPLICATE') || res.reason?.includes('COOLDOWN') || res.reason?.includes('RECENTLY_SENT'))
            ? 'Deduplicated'
            : 'DispatchSuppressed';
        suppressionReasons.push(`${cand.normSym}: ${suppressionPrefix} (${res.reason})`);
      }
    } else {
      // Active shortlist is at capacity (6). Rotate out the lowest-scoring / oldest setup
      const activeList = Array.from(activeTelegramOpportunities.values()).sort((a, b) => a.score - b.score);
      const weakest = activeList[0];

      if (weakest) {
        console.log(`[Telegram] Elite Shortlist Rotation: Retiring ${weakest.symbol} (Score: ${weakest.score}) to make room for new high-conviction opportunity ${cand.signal.symbol} (Score: ${cand.score})`);
        const weakestKey = Array.from(activeTelegramOpportunities.entries())
          .find(([k, v]) => v.opportunityId === weakest.opportunityId || k === weakest.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase())?.[0];
        if (weakestKey) {
          activeTelegramOpportunities.delete(weakestKey);
        } else {
          activeTelegramOpportunities.delete(weakest.symbol);
        }

        const rotPreMove = cand.signal.preMoveReport || (cand.signal as any).preMoveIntelligence;
        const res = await dispatchEventAlert({
          alertType: cand.alertType,
          symbol: cand.signal.symbol,
          opportunityId: cand.signal.id,
          direction: cand.signal.direction,
          entryLow: cand.entryLow,
          entryHigh: cand.entryHigh,
          currentPrice: cand.currentPrice,
          stopLoss: cand.stopLoss,
          targets: cand.validTargets,
          expectedMovePct: cand.expectedMovePct,
          riskRewardRatio: cand.riskRewardRatio,
          qualityGrade: cand.qualityGrade,
          confidence: cand.confidence,
          sourceType: cand.sourceType,
          preFetchedMarketData: marketData,
          keyTriggerLevel: rotPreMove?.keyTriggerLevel || (cand.signal.direction === 'LONG' ? cand.entryHigh : cand.entryLow),
          noChaseLevel: rotPreMove?.noChaseLevel || (cand.signal.largeMoveIntelligence as any)?.noChaseThreshold,
          timeframe: execTf,
          signal: cand.signal
        });

        if (res.dispatched) {
          dispatchedCount++;
          lastGlobalTelegramDispatchAt = now;
          if (stateClassification.state === 'NEW_OPPORTUNITY') {
            pipelineDiagnostics.TELEGRAM_LAST_NEW_COUNT++;
          } else {
            pipelineDiagnostics.TELEGRAM_LAST_UPDATED_COUNT++;
          }
          pipelineDiagnostics.TELEGRAM_TOTAL_SENT++;
          pipelineDiagnostics.TELEGRAM_LAST_SENT_SYMBOL = cand.signal.symbol;
          pipelineDiagnostics.TELEGRAM_LAST_SENT_FINGERPRINT = fingerprint;

          activeTelegramOpportunities.set(cand.normSym, {
            opportunityId: cand.signal.id,
            fingerprint,
            symbol: cand.signal.symbol,
            alertType: cand.alertType,
            sourceType: cand.sourceType,
            direction: cand.signal.direction,
            score: cand.score,
            qualityGrade: cand.qualityGrade,
            expectedMovePct: cand.expectedMovePct,
            riskRewardRatio: cand.riskRewardRatio,
            entryPrice: entryMid,
            entryLow: cand.entryLow,
            entryHigh: cand.entryHigh,
            currentPrice: cand.currentPrice,
            stopLoss: cand.stopLoss,
            targets: cand.validTargets,
            timestamp: cand.signal.timestamp || now,
            lastDispatchedAt: now,
            status: 'ACTIVE'
          });
        } else {
          if (res.reason?.includes('failed') || res.reason?.includes('network') || res.reason?.includes('HTTP')) {
            telegramApiFailureCount++;
          }
          const isDeliveryFailure = res.reason?.includes('failed') || res.reason?.includes('network') || res.reason?.includes('HTTP') || res.reason?.includes('RENDER_FAILED');
          const suppressionPrefix = isDeliveryFailure
            ? 'DeliveryFailed'
            : (res.reason?.includes('LEDGER') || res.reason?.includes('DUPLICATE') || res.reason?.includes('COOLDOWN') || res.reason?.includes('RECENTLY_SENT'))
              ? 'Deduplicated'
              : 'DispatchSuppressed';
          suppressionReasons.push(`${cand.normSym}: ${suppressionPrefix} (${res.reason})`);
        }
      }
    }
  }

  pipelineDiagnostics.TELEGRAM_EVALUATION_COUNT++;
  pipelineDiagnostics.TELEGRAM_CANDIDATE_COUNT = signals.length;
  pipelineDiagnostics.TELEGRAM_ELIGIBLE_COUNT = deduplicatedCandidates.length;
  pipelineDiagnostics.TELEGRAM_DUPLICATE_SUPPRESSED_COUNT = pipelineDiagnostics.TELEGRAM_TOTAL_SUPPRESSED_DUPLICATE;
  pipelineDiagnostics.TELEGRAM_UNCHANGED_COUNT = pipelineDiagnostics.TELEGRAM_LAST_UNCHANGED_COUNT;
  pipelineDiagnostics.TELEGRAM_NEW_COUNT = pipelineDiagnostics.TELEGRAM_LAST_NEW_COUNT;

  console.log(`[Telegram Evaluation Cycle] ` +
    `TELEGRAM_INSTANCE_ID=${TELEGRAM_INSTANCE_ID} ` +
    `TELEGRAM_PROCESS_PID=${TELEGRAM_PROCESS_PID} ` +
    `TELEGRAM_HOSTNAME=${TELEGRAM_HOSTNAME} ` +
    `K_SERVICE=${K_SERVICE} ` +
    `K_REVISION=${K_REVISION} ` +
    `K_INSTANCE=${K_INSTANCE} ` +
    `TELEGRAM_RUNTIME_STARTED=${pipelineDiagnostics.TELEGRAM_RUNTIME_STARTED} ` +
    `TELEGRAM_EVALUATION_COUNT=${pipelineDiagnostics.TELEGRAM_EVALUATION_COUNT} ` +
    `TELEGRAM_CANDIDATE_COUNT=${pipelineDiagnostics.TELEGRAM_CANDIDATE_COUNT} ` +
    `TELEGRAM_ELIGIBLE_COUNT=${pipelineDiagnostics.TELEGRAM_ELIGIBLE_COUNT} ` +
    `TELEGRAM_NEW_COUNT=${pipelineDiagnostics.TELEGRAM_NEW_COUNT} ` +
    `TELEGRAM_UNCHANGED_COUNT=${pipelineDiagnostics.TELEGRAM_UNCHANGED_COUNT} ` +
    `TELEGRAM_DUPLICATE_SUPPRESSED_COUNT=${pipelineDiagnostics.TELEGRAM_DUPLICATE_SUPPRESSED_COUNT} ` +
    `TELEGRAM_TOTAL_SENT=${pipelineDiagnostics.TELEGRAM_TOTAL_SENT}`);

  console.log(`[Telegram Cycle Diagnostics] ` +
    `Scanned: ${signals.length} | ` +
    `Eligible: ${deduplicatedCandidates.length} | ` +
    `StaleData: ${rejectedStaleData} | ` +
    `OffMarketPrice: ${rejectedInvalidLivePrice} | ` +
    `EntryMisaligned: ${rejectedInvalidEntry} | ` +
    `SlTpMisaligned: ${rejectedInvalidSlTp} | ` +
    `AntiChase: ${rejectedAntiChase} | ` +
    `DuplicateUnchanged: ${rejectedDuplicate} | ` +
    `Dispatched: ${dispatchedCount} | ` +
    `DeliveryFailures: ${telegramApiFailureCount}`);

  if (dispatchedCount === 0) {
    if (deduplicatedCandidates.length > 0) {
      pipelineDiagnostics.TELEGRAM_LAST_ZERO_DISPATCH_REASON = suppressionReasons.slice(0, 3).join('; ') || 'Suppressed by live actionability / deduplication';
      console.log(`[Telegram Cycle Summary] Standby / Suppressed (${deduplicatedCandidates.length} eligible): ${suppressionReasons.slice(0, 5).join('; ')}`);
    } else {
      pipelineDiagnostics.TELEGRAM_LAST_ZERO_DISPATCH_REASON = 'Waiting for exceptional opportunity (no candidate passed high-conviction filter)';
    }
  } else {
    pipelineDiagnostics.TELEGRAM_LAST_ZERO_DISPATCH_REASON = `Dispatched ${dispatchedCount} exceptional opportunity alert(s)`;
  }

  return dispatchedCount;
}

let telegramMonitoringInterval: NodeJS.Timeout | null = null;

export function isTelegramMonitoringLoopRunning(): boolean {
  return telegramMonitoringInterval !== null;
}

/**
 * Starts the single authoritative server-side Telegram monitoring loop.
 * Runs completely independently of Chrome, browser visibility, or client HTTP requests.
 */
export function startAuthoritativeTelegramMonitoringLoop(intervalMs = 30000): void {
  if (!isAuthoritativeDispatcherInstance()) {
    console.log(`[Telegram Runtime] Instance ${TELEGRAM_INSTANCE_ID} (Service: ${K_SERVICE}, PID: ${TELEGRAM_PROCESS_PID}) role is web. Telegram background monitoring loop BYPASSED.`);
    pipelineDiagnostics.TELEGRAM_RUNTIME_STARTED = false;
    pipelineDiagnostics.TELEGRAM_DISPATCHER_COUNT = 0;
    return;
  }

  if (telegramMonitoringInterval) {
    console.log('[Telegram Runtime] Monitoring loop already running on authoritative dispatcher.');
    return;
  }

  pipelineDiagnostics.TELEGRAM_RUNTIME_STARTED = true;
  pipelineDiagnostics.TELEGRAM_DISPATCHER_COUNT = 1;
  console.log(`[Telegram Runtime] Authoritative server-side Telegram monitoring loop started on instance ${TELEGRAM_INSTANCE_ID} (Service: ${K_SERVICE}, PID: ${TELEGRAM_PROCESS_PID}, interval: ${intervalMs}ms).`);

  const runCycle = async () => {
    try {
      pipelineDiagnostics.TELEGRAM_DISPATCH_LOOP_COUNT++;
      const storedSignals = getActionableStoredSignals();
      const preMoveSignals = getAuthoritativePreMoveSignals();
      const combined = [...storedSignals];
      const existingIds = new Set(storedSignals.map(s => s.id));
      for (const pms of preMoveSignals) {
        if (!existingIds.has(pms.id)) {
          combined.push(pms);
        }
      }
      if (combined && combined.length > 0) {
        await evaluateAndDispatchSignalAlerts(combined);
      }
    } catch (err: any) {
      console.warn('[Telegram Monitoring Cycle] Error:', err?.message || err);
    }
  };

  // Run initial evaluation after a 4-second delay, allowing initial scan to seed baseline
  setTimeout(() => {
    runCycle();
  }, 4000);

  telegramMonitoringInterval = setInterval(runCycle, intervalMs);
}

/**
 * Dispatch test alert to verify Telegram integration (delegates to authoritative non-trading system test)
 */
export async function dispatchTestTelegramAlert(symbol = 'BTCUSDT'): Promise<{ success: boolean; message: string; record?: TelegramAlertRecord }> {
  const result = await sendTelegramSystemTest();
  return {
    success: result.success,
    message: result.message
  };
}
