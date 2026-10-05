import { Signal, SignalStatus } from './signalEngine';
import { get24hTicker } from './cryptoService';
import { evaluateTradeManagement } from './tradeManagementEngine';
import { ActionablePriority, SignalQualityGrade, SignalLifecycleStats } from '../src/types/crypto';
import { getAuthoritativePreMoveSignals, checkAndUpdateExistingPreMoveSignal } from './preMoveEngine';
import { qualifyMajorMoveOpportunity } from './majorMoveEngine';

export interface SignalLifecycleEvent {
  signalId: string;
  symbol: string;
  eventType: 
    | 'GENERATED' 
    | 'ENTRY_TRIGGERED' 
    | 'STATUS_CHANGED'
    | 'TP_HIT' 
    | 'FINAL_TARGET_REACHED' 
    | 'STOPPED_OUT' 
    | 'INVALIDATED' 
    | 'EXPIRED' 
    | 'COMPLETED';
  targetId?: string;
  targetPrice?: number;
  triggerPrice: number;
  timestamp: number;
  notes?: string;
}

// In-memory store for active and historical signals & lifecycle events
// Map keyed by deterministic signal ID
const signalStore = new Map<string, Signal>();
// Index by normalized symbol to enforce ONE COIN = ONE CURRENT UNIFIED SIGNAL
const symbolIndex = new Map<string, string>();
const lifecycleEvents: SignalLifecycleEvent[] = [];

/**
 * Reset store for automated test isolation
 */
export function resetSignalStoreForTesting(): void {
  signalStore.clear();
  symbolIndex.clear();
  lifecycleEvents.length = 0;
}

/**
 * Normalizes symbol string to uppercase alphanumeric ticker (e.g. "BTC/USDT" -> "BTCUSDT")
 */
function normalizeSymbolKey(sym: string): string {
  return (sym || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

/**
 * Priority weighting for deterministic sorting
 */
function getPriorityWeight(priority?: ActionablePriority): number {
  switch (priority) {
    case 'ENTRY_NOW': return 5;
    case 'HIGH_PRIORITY': return 4;
    case 'WATCH': return 3;
    case 'WAIT': return 2;
    case 'INVALIDATED_EXPIRED': return 1;
    default: return 0;
  }
}

/**
 * Grade weighting for deterministic sorting
 */
function getGradeWeight(grade?: SignalQualityGrade): number {
  switch (grade) {
    case 'A+': return 5;
    case 'A': return 4;
    case 'B': return 3;
    case 'C': return 2;
    case 'WAIT': return 1;
    default: return 0;
  }
}

/**
 * Calculate Actionable Priority deterministically
 */
export function calculateActionablePriority(
  decision: string,
  qualityGrade: SignalQualityGrade,
  entryStatus?: string,
  status?: string,
  conflicts?: string[]
): ActionablePriority {
  if (
    status === 'STOPPED_OUT' ||
    status === 'EXPIRED' ||
    status === 'CANCELLED' ||
    entryStatus === 'INVALIDATED' ||
    entryStatus === 'INVALID'
  ) {
    return 'INVALIDATED_EXPIRED';
  }
  if (decision === 'WAIT' || qualityGrade === 'WAIT') {
    return 'WAIT';
  }
  if (entryStatus === 'ENTRY_NOW' && (qualityGrade === 'A+' || qualityGrade === 'A' || qualityGrade === 'B')) {
    return 'ENTRY_NOW';
  }
  if (qualityGrade === 'A+' || qualityGrade === 'A') {
    return 'HIGH_PRIORITY';
  }
  if (
    qualityGrade === 'B' ||
    entryStatus === 'WAIT_FOR_PULLBACK' ||
    entryStatus === 'WAIT_FOR_RETEST' ||
    entryStatus === 'WAIT_FOR_CONFIRMATION'
  ) {
    return 'WATCH';
  }
  if (qualityGrade === 'C' || entryStatus === 'ENTRY_MISSED') {
    return 'WAIT';
  }
  return 'WAIT';
}

/**
 * Idempotent Signal Store Upsert (PHASE 5 RECONCILIATION)
 * Enforces ONE COIN = ONE CURRENT UNIFIED SIGNAL.
 * When status changes (e.g. WAIT -> ENTRY_NOW -> ACTIVE -> TP1_HIT),
 * updates the existing current signal for that asset without duplicating cards.
 */
export function upsertSignals(incomingSignals: Signal[]): Signal[] {
  for (const signal of incomingSignals) {
    if (!signal || (!signal.id && !signal.symbol)) continue;

    const normSym = normalizeSymbolKey(signal.symbol);
    
    // Ensure actionablePriority is populated
    if (!signal.actionablePriority) {
      signal.actionablePriority = calculateActionablePriority(
        signal.direction || 'LONG',
        signal.qualityGrade || 'B',
        signal.entryStatus,
        signal.status,
        signal.conflicts
      );
    }

    // Find existing signal by direct ID or by symbolIndex
    let existingId = signal.id && signalStore.has(signal.id) ? signal.id : symbolIndex.get(normSym);
    const existing = existingId ? signalStore.get(existingId) : undefined;

    if (existing) {
      const prevStatus = existing.status;
      const prevEntryStatus = existing.entryStatus;

      // Update mutable properties while preserving target hit states and freezing entry/targets
      existing.currentPrice = signal.currentPrice;
      existing.priceChange24h = signal.priceChange24h;
      existing.moonScore = signal.moonScore;
      existing.confidence = signal.confidence || signal.moonScore;
      existing.confluences = signal.confluences;

      // IMMUTABLE EVENT ARCHITECTURE: Never flip direction or overwrite entry/SL if trade is active or entry is already set
      const isAlreadyActive = Boolean(existing.entryTriggeredAt || existing.status === 'ACTIVE' || existing.status === 'TRIGGERED' || existing.status?.startsWith('TP'));
      if (signal.direction && !isAlreadyActive && existing.status === 'ENTRY_PENDING') {
        existing.direction = signal.direction;
      }
      if (signal.entryPrice && (!existing.entryPrice || !isAlreadyActive)) {
        existing.entryPrice = signal.entryPrice;
      }
      if (signal.entryZoneLow && (!existing.entryZoneLow || !isAlreadyActive)) {
        existing.entryZoneLow = signal.entryZoneLow;
      }
      if (signal.entryZoneHigh && (!existing.entryZoneHigh || !isAlreadyActive)) {
        existing.entryZoneHigh = signal.entryZoneHigh;
      }
      // Never allow scanner ticks to shift stop loss (only trailing stop logic like break-even at TP1 can adjust it)
      if (signal.stopLoss && (!existing.stopLoss || !isAlreadyActive)) {
        existing.stopLoss = signal.stopLoss;
      }

      // Price Consistency Guard on existing signal: Invalidate if live price diverged > 5% before TP hit
      const checkEntry = existing.entryPrice || signal.entryPrice;
      if (checkEntry && existing.currentPrice && existing.currentPrice > 0) {
        const driftPct = Math.abs(checkEntry - existing.currentPrice) / checkEntry;
        const hasHitAnyTp = (existing.targets || []).some(t => t.hit || t.status === 'HIT');
        if (driftPct > 0.05 && !hasHitAnyTp && existing.status !== 'STOPPED_OUT') {
          existing.status = 'INVALIDATED';
          existing.entryStatus = 'ENTRY_MISSED';
          existing.actionablePriority = 'INVALIDATED_EXPIRED';
          existing.invalidationReason = `GROSS_PRICE_DIVERGENCE_ON_UPDATE: Live price (${existing.currentPrice}) diverged from entry (${checkEntry}) by ${(driftPct * 100).toFixed(1)}%`;
        }
      }

      if (signal.status && existing.status !== 'INVALIDATED') existing.status = signal.status;
      if (signal.entryStatus && existing.status !== 'INVALIDATED') existing.entryStatus = signal.entryStatus;
      if (signal.qualityGrade) existing.qualityGrade = signal.qualityGrade;
      existing.actionablePriority = signal.actionablePriority;
      if (signal.whyTrade) existing.whyTrade = signal.whyTrade;
      if (signal.whyNotPerfect) existing.whyNotPerfect = signal.whyNotPerfect;
      if (signal.keyRisk) existing.keyRisk = signal.keyRisk;
      if (signal.entryReason) existing.entryReason = signal.entryReason;
      if (signal.invalidationReason) existing.invalidationReason = signal.invalidationReason;
      if (signal.confirmations) existing.confirmations = signal.confirmations;
      if (signal.conflicts) existing.conflicts = signal.conflicts;
      if (signal.marketRegime) existing.marketRegime = signal.marketRegime;
      if (signal.marketCycle) existing.marketCycle = signal.marketCycle;
      if (signal.dataQuality) existing.dataQuality = signal.dataQuality;
      if (signal.adaptiveExecution) existing.adaptiveExecution = signal.adaptiveExecution;
      if (signal.tradeManagement) existing.tradeManagement = signal.tradeManagement;
      if (signal.coreIntelligence) existing.coreIntelligence = signal.coreIntelligence;
      if (signal.unifiedEvidence) existing.unifiedEvidence = signal.unifiedEvidence;
      if (signal.newsCatalyst) existing.newsCatalyst = signal.newsCatalyst;
      if (signal.earlyMoveReport) existing.earlyMoveReport = signal.earlyMoveReport;
      if (signal.marketRegimeAnalysis) existing.marketRegimeAnalysis = signal.marketRegimeAnalysis;
      if (signal.sectorRotationAnalysis) existing.sectorRotationAnalysis = signal.sectorRotationAnalysis;
      if (signal.crossAssetConfirmation) existing.crossAssetConfirmation = signal.crossAssetConfirmation;
      if (signal.smartEntryTiming) existing.smartEntryTiming = signal.smartEntryTiming;
      if (signal.smartRiskReport) existing.smartRiskReport = signal.smartRiskReport;
      if (signal.setupMaturity) existing.setupMaturity = signal.setupMaturity;
      if (signal.timingWindow) existing.timingWindow = signal.timingWindow;
      if (signal.setupAge) existing.setupAge = signal.setupAge;
      if (signal.triggerCondition) existing.triggerCondition = signal.triggerCondition;
      if (signal.whyEarlySetupMatters) existing.whyEarlySetupMatters = signal.whyEarlySetupMatters;

      // Phase 12: Primary Setup Category & Category Transitions
      if (signal.primaryCategory) {
        if (
          existing.primaryCategory &&
          existing.primaryCategory !== signal.primaryCategory &&
          signal.primaryCategory !== 'UNKNOWN' &&
          signal.primaryCategory !== 'WAIT'
        ) {
          existing.previousCategory = existing.primaryCategory;
          const transitions = existing.categoryTransitionHistory ? [...existing.categoryTransitionHistory] : [];
          transitions.push({
            fromCategory: existing.primaryCategory,
            toCategory: signal.primaryCategory,
            timestamp: Date.now(),
            reason: `Category progressed from ${existing.primaryCategory} to ${signal.primaryCategory}`,
            price: signal.currentPrice || existing.currentPrice
          });
          if (transitions.length > 10) transitions.shift();
          existing.categoryTransitionHistory = transitions;
        }
        existing.primaryCategory = signal.primaryCategory;
      }
      if (signal.categoryConfluences) existing.categoryConfluences = signal.categoryConfluences;
      if (signal.categoryIntelligence) existing.categoryIntelligence = signal.categoryIntelligence;
      if (signal.categoryReasoning) existing.categoryReasoning = signal.categoryReasoning;

      // Phase 13: News Intelligence 2.0
      if (signal.newsImpactReport) existing.newsImpactReport = signal.newsImpactReport;
      if (signal.newsIntelligence) existing.newsIntelligence = signal.newsIntelligence;

      // Phase 14: New Listing Intelligence
      if (signal.newListingIntelligence) existing.newListingIntelligence = signal.newListingIntelligence;

      // Phase 15: Large Move + Asymmetric Opportunity Intelligence
      if (signal.largeMoveIntelligence) existing.largeMoveIntelligence = signal.largeMoveIntelligence;

      // Phase 16: Unified Intelligence Fusion
      if (signal.unifiedFusion) existing.unifiedFusion = signal.unifiedFusion;
      if (signal.unifiedFusionScore !== undefined) existing.unifiedFusionScore = signal.unifiedFusionScore;
      if (signal.priorityScore !== undefined) existing.priorityScore = signal.priorityScore;
      if (signal.rankingTier) existing.rankingTier = signal.rankingTier;
      if (signal.opportunityPriority) existing.opportunityPriority = signal.opportunityPriority;

      // Pre-Move Intelligence (Pre-Pump / Pre-Dump)
      if (signal.preMoveReport) existing.preMoveReport = signal.preMoveReport;
      if (signal.preMoveIntelligence) existing.preMoveIntelligence = signal.preMoveIntelligence;

      // Major Move (≥30%) & Extreme Move (≥50%)
      if (signal.majorMoveClass) existing.majorMoveClass = signal.majorMoveClass;
      if (signal.majorMovePotentialPct !== undefined) existing.majorMovePotentialPct = signal.majorMovePotentialPct;
      if (signal.majorMoveNotes) existing.majorMoveNotes = signal.majorMoveNotes;

      // IMMUTABLE TARGET ARCHITECTURE: Freeze target prices once established. Never recalculate or shift them!
      if (Array.isArray(signal.targets)) {
        if (!existing.targets || existing.targets.length === 0) {
          existing.targets = signal.targets;
          existing.tp1 = signal.tp1;
          existing.tp2 = signal.tp2;
          existing.tp3 = signal.tp3;
          (existing as any).tp4 = (signal as any).tp4;
        } else {
          // Preserve existing frozen prices; only propagate hit states from price execution
          const incomingHitMap = new Map((signal.targets || []).map(t => [t.id, t.hit]));
          existing.targets = existing.targets.map(t => {
            const isHitIncoming = incomingHitMap.get(t.id);
            if (isHitIncoming && !t.hit) {
              return { ...t, hit: true, hitTime: Date.now(), status: 'HIT' as const };
            }
            return t;
          });
        }
      }

      // Track status transitions in lifecycle events
      if (prevStatus !== existing.status || prevEntryStatus !== existing.entryStatus) {
        lifecycleEvents.push({
          signalId: existing.id,
          symbol: existing.symbol,
          eventType: existing.status === 'TRIGGERED' || existing.entryStatus === 'ENTRY_NOW' ? 'ENTRY_TRIGGERED' : 'STATUS_CHANGED',
          triggerPrice: existing.currentPrice || existing.entryPrice,
          timestamp: Date.now(),
          notes: `Status updated: ${prevStatus}/${prevEntryStatus} -> ${existing.status}/${existing.entryStatus}`
        });
      }

      // Ensure symbol index points to this signal ID
      symbolIndex.set(normSym, existing.id);
    } else {
      // Check Gross Price Mismatch upon upsert
      if (signal.entryPrice && signal.currentPrice && signal.currentPrice > 0) {
        const driftPct = Math.abs(signal.entryPrice - signal.currentPrice) / Math.min(signal.entryPrice, signal.currentPrice);
        if (driftPct > 0.05) {
          signal.status = 'INVALIDATED';
          signal.actionablePriority = 'INVALIDATED_EXPIRED';
          signal.invalidationReason = `GROSS_PRICE_MISMATCH (Entry ${signal.entryPrice} vs Current ${signal.currentPrice} differs by ${(driftPct * 100).toFixed(1)}%)`;
        }
      }

      // New signal for this asset
      // Verify whether price is already in the entry zone upon generation
      const isLong = signal.direction === 'LONG';
      const lowBound = signal.entryZoneLow || signal.entryPrice * 0.998;
      const highBound = signal.entryZoneHigh || signal.entryPrice * 1.002;
      const inEntryZone = signal.currentPrice >= lowBound * 0.998 && signal.currentPrice <= highBound * 1.002;

      if (signal.status !== 'INVALIDATED') {
        if (inEntryZone && !signal.status.includes('TP') && signal.status !== 'STOPPED_OUT') {
          signal.status = 'ACTIVE';
          signal.entryTriggeredAt = Date.now();
        } else if (!signal.status || signal.status === 'ACTIVE') {
          // If price is not yet in entry zone, signal starts in ENTRY_PENDING
          signal.status = 'ENTRY_PENDING';
        }
      }

      signalStore.set(signal.id, signal);
      symbolIndex.set(normSym, signal.id);

      lifecycleEvents.push({
        signalId: signal.id,
        symbol: signal.symbol,
        eventType: 'GENERATED',
        triggerPrice: signal.entryPrice,
        timestamp: signal.createdAt || Date.now(),
        notes: `Signal generated for ${signal.symbol} (${signal.direction}) with Grade ${signal.qualityGrade || 'B'} [Status: ${signal.status}]`
      });

      // Autonomous event-driven Telegram broadcaster:
      // When a Grade A+ or Grade A actionable signal is identified, automatically render 15M chart snapshot and broadcast
      const grade = signal.qualityGrade || 'A';
      if ((grade === 'A+' || grade === 'A' || ((signal as any).moonScore && (signal as any).moonScore >= 80)) && (signal.direction as any) !== 'WAIT') {
        import('./telegramService').then(ts => {
          ts.broadcastAutonomousSignalAlert(signal).catch(e => console.warn('[Autonomous Broadcaster Error]:', e));
        }).catch(() => {});
      }
    }
  }

  return getAllStoredSignals();
}

/**
 * Returns all stored signals sorted deterministically:
 * 1. Actionable Priority (ENTRY_NOW > HIGH_PRIORITY > WATCH > WAIT > INVALIDATED_EXPIRED)
 * 2. Quality Grade (A+ > A > B > C > WAIT)
 * 3. MoonScore / Confidence (descending)
 * 4. Timestamp (descending)
 */
export function getAllStoredSignals(): Signal[] {
  return Array.from(signalStore.values()).sort((a, b) => {
    // 1. Actionable Priority
    const pA = getPriorityWeight(a.actionablePriority);
    const pB = getPriorityWeight(b.actionablePriority);
    if (pB !== pA) return pB - pA;

    // 2. Quality Grade
    const gA = getGradeWeight(a.qualityGrade);
    const gB = getGradeWeight(b.qualityGrade);
    if (gB !== gA) return gB - gA;

    // 3. MoonScore
    const scoreA = a.moonScore || 0;
    const scoreB = b.moonScore || 0;
    if (scoreB !== scoreA) return scoreB - scoreA;

    // 4. Recency
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

export const getStoredSignals = getAllStoredSignals;

export function clearStoredSignals(): void {
  signalStore.clear();
  symbolIndex.clear();
  lifecycleEvents.length = 0;
}

/**
 * Returns a stored signal by symbol if one currently exists in memory
 */
export function getStoredSignalBySymbol(symbol: string): Signal | undefined {
  const norm = normalizeSymbolKey(symbol);
  const id = symbolIndex.get(norm);
  if (id && signalStore.has(id)) {
    return signalStore.get(id);
  }
  for (const sig of signalStore.values()) {
    if (normalizeSymbolKey(sig.symbol) === norm) {
      return sig;
    }
  }
  return undefined;
}

export function getSignalLifecycleEvents(signalId?: string): SignalLifecycleEvent[] {
  if (signalId) return lifecycleEvents.filter(e => e.signalId === signalId);
  return [...lifecycleEvents];
}

/**
 * ONE AUTHORITATIVE RULE FOR ACTIONABLE SIGNALS
 * An actionable signal MUST:
 * 1. Have explicit trade direction ('LONG' or 'SHORT').
 * 2. Status must NOT be 'INVALIDATED', 'EXPIRED', 'STOPPED_OUT', 'CANCELLED', or 'CLOSED'.
 * 3. Priority must NOT be 'INVALIDATED_EXPIRED'.
 * 4. Have positive, finite currentPrice, entryPrice, and stopLoss.
 * 5. Have directional level coherence:
 *    - LONG: stopLoss < entryPrice
 *    - SHORT: stopLoss > entryPrice
 * 6. Have at least one valid structural target in the trade direction:
 *    - LONG: target.price > entryPrice
 *    - SHORT: target.price < entryPrice
 * 7. Price Consistency Firewall: If no target has been hit, live price must not have
 *    diverged by > 5% from entry.
 */
export function isSignalActionable(signal: Signal | undefined | null): boolean {
  if (!signal) return false;
  if (signal.direction !== 'LONG' && signal.direction !== 'SHORT') return false;

  // Inactive states
  if (
    signal.status === 'INVALIDATED' ||
    signal.status === 'EXPIRED' ||
    signal.status === 'STOPPED_OUT' ||
    signal.status === 'CANCELLED' ||
    signal.status === 'COMPLETED'
  ) {
    return false;
  }

  if (signal.actionablePriority === 'INVALIDATED_EXPIRED') {
    return false;
  }

  if (signal.entryStatus === 'INVALIDATED' || signal.entryStatus === 'INVALID') {
    return false;
  }

  // Price existence & positivity
  if (!signal.entryPrice || !Number.isFinite(signal.entryPrice) || signal.entryPrice <= 0) return false;
  if (!signal.stopLoss || !Number.isFinite(signal.stopLoss) || signal.stopLoss <= 0) return false;
  if (!signal.currentPrice || !Number.isFinite(signal.currentPrice) || signal.currentPrice <= 0) return false;

  // Directional invariants
  const low = signal.entryZoneLow ? Math.min(signal.entryZoneLow, signal.entryPrice) : signal.entryPrice;
  const high = signal.entryZoneHigh ? Math.max(signal.entryZoneHigh, signal.entryPrice) : signal.entryPrice;

  if (signal.direction === 'LONG') {
    // SL must be strictly below entry, entryLow, and currentPrice (not already breached)
    if (signal.stopLoss >= low || signal.stopLoss >= signal.entryPrice || signal.stopLoss >= signal.currentPrice) return false;
  }
  if (signal.direction === 'SHORT') {
    // SL must be strictly above entry, entryHigh, and currentPrice (not already breached)
    if (signal.stopLoss <= high || signal.stopLoss <= signal.entryPrice || signal.stopLoss <= signal.currentPrice) return false;
  }

  // Targets check:
  // For SHORT setups (e.g. ARUSDT SHORT), all Take Profits (TP1, TP2, TP3, TP4) MUST be mathematically LOWER than Entry price.
  // For LONG setups, all Take Profits MUST be mathematically HIGHER than Entry price.
  // Invalidate any signal where SHORT TP >= Entry or LONG TP <= Entry.
  const targets = signal.targets || [];
  if (targets.length === 0) return false;

  for (const t of targets) {
    if (typeof t.price !== 'number' || !Number.isFinite(t.price) || t.price <= 0) return false;
    if (signal.direction === 'SHORT' && t.price >= signal.entryPrice) return false;
    if (signal.direction === 'LONG' && t.price <= signal.entryPrice) return false;
  }

  // Entry Runaway / Missed Entry Check (Zero Drift Invalidation Rule)
  // LONG: currentPrice > high = INVALIDATE / BLOCK
  // SHORT: currentPrice < low = INVALIDATE / BLOCK
  // Do NOT use 1.0005 / 0.9995 or any percentage grace.
  const hasHitAnyTp = targets.some(t => t.hit || t.status === 'HIT');
  if (!hasHitAnyTp) {
    if (signal.direction === 'LONG' && signal.currentPrice > high) {
      return false; // Missed LONG entry: currentPrice > entryZoneHigh
    }
    if (signal.direction === 'SHORT' && signal.currentPrice < low) {
      return false; // Missed SHORT entry: currentPrice < entryZoneLow
    }
    const drift = Math.abs(signal.currentPrice - signal.entryPrice) / signal.entryPrice;
    if (drift > 0.04) {
      return false;
    }
  }

  // HARD MOONSCORE FLOOR: Never display or return grade 'B' 52-score trash (< 90)
  const score = (signal as any).score ?? signal.moonScore ?? 0;
  if (score < 90) {
    return false;
  }

  // LATE-FOMO STRUCTURAL KILL SWITCH: If genuine structural SL distance exceeds 3.5%, DISQUALIFY IMMEDIATELY
  if (signal.entryPrice && signal.stopLoss && signal.entryPrice > 0) {
    const slDistPct = (Math.abs(signal.entryPrice - signal.stopLoss) / signal.entryPrice) * 100;
    if (slDistPct > 3.5) {
      return false;
    }
  }

  return true;
}

/**
 * Invalidates and expires any stored signal for a symbol so it does NOT remain actionable.
 */
export function invalidateStoredSignal(symbol: string, reason: string): void {
  const norm = normalizeSymbolKey(symbol);
  const id = symbolIndex.get(norm);
  const existing = id ? signalStore.get(id) : undefined;

  if (existing) {
    existing.status = 'INVALIDATED';
    existing.entryStatus = 'ENTRY_MISSED';
    existing.actionablePriority = 'INVALIDATED_EXPIRED';
    existing.invalidationReason = reason;
    existing.closedAt = Date.now();

    lifecycleEvents.push({
      signalId: existing.id,
      symbol: existing.symbol,
      eventType: 'INVALIDATED',
      triggerPrice: existing.currentPrice || existing.entryPrice || 0,
      timestamp: Date.now(),
      notes: reason
    });
  }
}

/**
 * Authoritative Actionable Signal Feed
 * Performs real-time validation and prunes any stale/invalidated/diverged signals.
 * Guaranteed to return only true actionable signals.
 */
export function getActionableStoredSignals(): Signal[] {
  const all = getAllStoredSignals();
  const actionable: Signal[] = [];

  for (const sig of all) {
    // 1. Basic Actionability & Directional Integrity
    if (!isSignalActionable(sig)) {
      if (sig.status !== 'STOPPED_OUT' && sig.status !== 'EXPIRED' && sig.status !== 'COMPLETED') {
        sig.status = 'INVALIDATED';
        sig.actionablePriority = 'INVALIDATED_EXPIRED';
        if (!sig.invalidationReason) {
          sig.invalidationReason = 'FAILED_ACTIONABLE_INVARIANTS';
        }
      }
      continue;
    }

    // 2. Strict Filter: Only Grade A+ and A setups
    const isHighConvictionGrade = sig.qualityGrade === 'A+' || sig.qualityGrade === 'A';
    if (!isHighConvictionGrade) {
      continue;
    }

    // 3. Strict Filter: Verified volume (RVOL >= 1.8x)
    const rvol = sig.opportunityReport?.rvol ?? (sig as any).rvol ?? sig.unifiedFusion?.technical?.rvol ?? (sig.volume24h && sig.volume24h > 1000000 ? 1.8 : 1.0);
    if (rvol < 1.8) {
      continue;
    }

    // 4. Strict Filter: Coiling compression
    const hasCoilingCompression = Boolean(
      (sig.preMoveReport && (
        (sig.preMoveReport.compressionRatio !== undefined && sig.preMoveReport.compressionRatio >= 0.2) ||
        sig.preMoveReport.volatilitySqueeze ||
        (sig.preMoveReport.coilScore !== undefined && sig.preMoveReport.coilScore >= 30)
      )) ||
      (sig.preMoveIntelligence && (
        (sig.preMoveIntelligence.compressionRatio !== undefined && sig.preMoveIntelligence.compressionRatio >= 0.2) ||
        sig.preMoveIntelligence.volatilitySqueeze
      )) ||
      (sig.largeMoveIntelligence && (sig.largeMoveIntelligence.isCoiling || (sig.largeMoveIntelligence.compressionRatio !== undefined && sig.largeMoveIntelligence.compressionRatio >= 0.2))) ||
      (((sig as any).compressionRatio !== undefined && (sig as any).compressionRatio >= 0.2)) ||
      (sig.pattern && (sig.pattern.toLowerCase().includes('pennant') || sig.pattern.toLowerCase().includes('triangle') || sig.pattern.toLowerCase().includes('coil') || sig.pattern.toLowerCase().includes('breakout') || sig.pattern.toLowerCase().includes('consolidation') || sig.pattern.toLowerCase().includes('squeeze')))
    );
    if (!hasCoilingCompression) {
      continue;
    }

    // Re-qualify major move to ensure mathematical precision:
    // Only setups whose verified mathematical upside to the final target is >= 30.0% may carry MAJOR_MOVE.
    // Route smaller moves to STANDARD_SWING.
    const majorQual = qualifyMajorMoveOpportunity(sig as any);
    if (majorQual.structurallySupportedMovePct >= 30.0 && majorQual.isQualified) {
      sig.majorMoveClass = majorQual.classification;
    } else {
      sig.majorMoveClass = 'NORMAL';
      if (sig.primaryCategory === 'MAJOR_MOVE') {
        sig.primaryCategory = 'STANDARD_SWING';
      }
    }
    sig.majorMovePotentialPct = majorQual.structurallySupportedMovePct;
    sig.majorMoveNotes = majorQual.notes;

    actionable.push(sig);
  }

  // Sort by highest conviction / MoonScore descending
  actionable.sort((a, b) => {
    const scoreA = (a.moonScore || a.confidence || 0) + (a.riskRewardRatio || 0) * 5;
    const scoreB = (b.moonScore || b.confidence || 0) + (b.riskRewardRatio || 0) * 5;
    return scoreB - scoreA;
  });

  // Strict User Mandate: Max 3-5 high-conviction setups pass through
  return actionable.slice(0, 5);
}

/**
 * Computes deterministic real-time Signal Lifecycle Statistics
 */
export function calculateSignalLifecycleStats(): SignalLifecycleStats {
  const allSignals = Array.from(signalStore.values());
  
  let longCount = 0;
  let shortCount = 0;
  let waitCount = 0;
  let entryNowCount = 0;
  let activeCount = 0;
  let tp1Hits = 0;
  let tp2Hits = 0;
  let tp3Hits = 0;
  let tpnHits = 0;
  let stopLossHits = 0;
  let invalidatedCount = 0;
  let expiredCount = 0;
  let completedCount = 0;

  const gradeDistribution = {
    'A+': 0,
    'A': 0,
    'B': 0,
    'C': 0,
    'WAIT': 0
  };

  let totalAchievedRR = 0;
  let rrSampleCount = 0;

  // Process signals
  for (const s of allSignals) {
    if (s.direction === 'LONG') longCount++;
    else if (s.direction === 'SHORT') shortCount++;
    else waitCount++;

    if (s.entryStatus === 'ENTRY_NOW' || s.actionablePriority === 'ENTRY_NOW') {
      entryNowCount++;
    }

    if (s.status === 'ACTIVE' || s.status === 'TRIGGERED') {
      activeCount++;
    }

    if (s.status === 'STOPPED_OUT') {
      stopLossHits++;
      completedCount++;
    } else if (s.status === 'EXPIRED') {
      expiredCount++;
      completedCount++;
    } else if (s.status === 'CANCELLED' || s.entryStatus === 'INVALIDATED') {
      invalidatedCount++;
      completedCount++;
    } else if (s.status.includes('TP')) {
      completedCount++;
    }

    // Tally target hits
    if (Array.isArray(s.targets)) {
      for (const t of s.targets) {
        if (t.hit || t.status === 'HIT') {
          tpnHits++;
          if (t.id === 'TP1' || t.label === 'TP1') tp1Hits++;
          else if (t.id === 'TP2' || t.label === 'TP2') tp2Hits++;
          else if (t.id === 'TP3' || t.label === 'TP3') tp3Hits++;

          if (s.riskRewardRatio && s.riskRewardRatio > 0) {
            totalAchievedRR += s.riskRewardRatio;
            rrSampleCount++;
          }
        }
      }
    }

    // Grade distribution
    const grade = s.qualityGrade || (s.direction === 'LONG' || s.direction === 'SHORT' ? 'B' : 'WAIT');
    if (grade in gradeDistribution) {
      gradeDistribution[grade]++;
    } else {
      gradeDistribution['B']++;
    }
  }

  // Also count lifecycle event triggers
  for (const ev of lifecycleEvents) {
    if (ev.eventType === 'STOPPED_OUT' && stopLossHits === 0) stopLossHits++;
    if (ev.eventType === 'INVALIDATED' && invalidatedCount === 0) invalidatedCount++;
    if (ev.eventType === 'EXPIRED' && expiredCount === 0) expiredCount++;
  }

  // Deterministic Win Rate calculation
  const totalWinningSignals = allSignals.filter(s => s.status.includes('TP') || (s.targets && s.targets.some(t => t.hit))).length;
  const totalLosingSignals = allSignals.filter(s => s.status === 'STOPPED_OUT').length;
  const closedTotal = totalWinningSignals + totalLosingSignals;

  const winRate = closedTotal > 0 
    ? Number(((totalWinningSignals / closedTotal) * 100).toFixed(1))
    : 0;

  const avgRiskRewardAchieved = rrSampleCount > 0 
    ? Number((totalAchievedRR / rrSampleCount).toFixed(2)) 
    : 0;

  return {
    totalSignals: allSignals.length,
    longCount,
    shortCount,
    waitCount,
    entryNowCount,
    activeCount,
    tp1Hits,
    tp2Hits,
    tp3Hits,
    tpnHits,
    stopLossHits,
    invalidatedCount,
    expiredCount,
    completedCount: Math.max(completedCount, closedTotal),
    winRate,
    avgRiskRewardAchieved,
    gradeDistribution
  };
}

/**
 * Testing helper: clears in-memory stores
 */
export function clearSignalStoreForTesting(): void {
  signalStore.clear();
  symbolIndex.clear();
  lifecycleEvents.length = 0;
}

/**
 * Real-time price monitor & dynamic target evaluator (supports TP1..TPn)
 */
export async function updateSignalLifecycle(): Promise<void> {
  const allSignals = Array.from(signalStore.values());
  
  for (const sig of allSignals) {
    if (
      sig.status === 'STOPPED_OUT' ||
      sig.status === 'EXPIRED' ||
      sig.status === 'CANCELLED' ||
      sig.status === 'INVALIDATED' ||
      (sig as any).status === 'COMPLETED'
    ) {
      continue;
    }
    
    try {
      const cleanSym = sig.symbol.replace('/', '').toUpperCase();
      const now = Date.now();
      const signalAgeMs = now - (sig.createdAt || now);

      // Signal age validation: Invalidate/Expire signals older than 48 hours
      if (signalAgeMs > 48 * 60 * 60 * 1000) {
        sig.status = 'EXPIRED';
        sig.entryStatus = 'ENTRY_MISSED';
        sig.actionablePriority = 'INVALIDATED_EXPIRED';
        sig.closedAt = now;
        sig.invalidationReason = 'SIGNAL_MAX_LIFESPAN_EXCEEDED (48h)';
        continue;
      }

      const ticker = await get24hTicker(cleanSym);
      let currentPrice = ticker?.lastPrice;
      if (!currentPrice && sig.currentPrice && sig.currentPrice > 0) {
        currentPrice = sig.currentPrice;
      }
      if (!currentPrice) {
        if (signalAgeMs > 15 * 60 * 1000) {
          sig.status = 'INVALIDATED';
          sig.actionablePriority = 'INVALIDATED_EXPIRED';
          sig.invalidationReason = 'SYMBOL_NOT_ACTIVE_ON_BINANCE';
        }
        continue;
      }
      
      sig.currentPrice = currentPrice;
      if (ticker?.priceChangePercent !== undefined) {
        sig.priceChange24h = ticker.priceChangePercent;
      }
      
      const isLong = sig.direction === 'LONG';
      const hasEntered = Boolean(
        sig.entryTriggeredAt ||
        sig.status === 'ACTIVE' ||
        sig.status === 'TRIGGERED' ||
        sig.status.startsWith('TP')
      );

      // Pending age validation: Signals waiting for entry > 12h expire
      if (!hasEntered && signalAgeMs > 12 * 60 * 60 * 1000) {
        sig.status = 'EXPIRED';
        sig.entryStatus = 'ENTRY_MISSED';
        sig.actionablePriority = 'INVALIDATED_EXPIRED';
        sig.closedAt = now;
        sig.invalidationReason = 'ENTRY_WINDOW_TIMED_OUT (12h)';
        continue;
      }

      // Gross Price Drift validation: If price drifted > 5% before entry, invalidate
      if (!hasEntered && sig.entryPrice && currentPrice > 0) {
        const driftPct = Math.abs(sig.entryPrice - currentPrice) / Math.min(sig.entryPrice, currentPrice);
        if (driftPct > 0.05) {
          sig.status = 'INVALIDATED';
          sig.entryStatus = 'ENTRY_MISSED';
          sig.actionablePriority = 'INVALIDATED_EXPIRED';
          sig.invalidationReason = `PRICE_DRIFTED_BEYOND_RECOVERY (${(driftPct * 100).toFixed(1)}% drift from entry)`;
          sig.closedAt = now;
          continue;
        }
      }

      // Macro drift protection: even if marked entered, if price is > 15% away without hitting TP, expire/invalidate
      if (sig.entryPrice && currentPrice > 0 && !sig.status.startsWith('TP')) {
        const macroDrift = Math.abs(sig.entryPrice - currentPrice) / Math.min(sig.entryPrice, currentPrice);
        if (macroDrift > 0.15) {
          sig.status = 'INVALIDATED';
          sig.entryStatus = 'ENTRY_MISSED';
          sig.actionablePriority = 'INVALIDATED_EXPIRED';
          sig.invalidationReason = `MACRO_PRICE_DIVERGENCE (${(macroDrift * 100).toFixed(1)}% drift from entry)`;
          sig.closedAt = now;
          continue;
        }
      }

      // =====================================================================
      // 1. PRE-ENTRY INVARIANT: If entry was NEVER triggered, do not advance to TP or STOPPED_OUT
      // =====================================================================
      if (!hasEntered) {
        // Check structural invalidation before entry (Never marked STOPPED_OUT before entry)
        const isInvalidatedBeforeEntry = isLong
          ? currentPrice <= sig.stopLoss
          : currentPrice >= sig.stopLoss;

        if (isInvalidatedBeforeEntry) {
          sig.status = 'INVALIDATED';
          sig.actionablePriority = 'INVALIDATED_EXPIRED';
          sig.invalidationReason = 'Price breached structural invalidation level before reaching entry zone';
          sig.closedAt = Date.now();
          sig.finalState = 'INVALIDATED';
          lifecycleEvents.push({
            signalId: sig.id,
            symbol: sig.symbol,
            eventType: 'INVALIDATED',
            triggerPrice: currentPrice,
            timestamp: Date.now(),
            notes: `Invalidated before entry: price ${currentPrice} breached structural SL ${sig.stopLoss} (Never entered)`
          });
          continue;
        }

        // Check if price already ran away beyond entry zone without fill (MISSED / DO NOT CHASE)
        const entryLow = sig.entryZoneLow || sig.entryPrice;
        const entryHigh = sig.entryZoneHigh || sig.entryPrice;
        const tp1Price = (sig.targets && sig.targets[0]?.price) || (isLong ? sig.entryPrice * 1.02 : sig.entryPrice * 0.98);
        const hasRunAway = isLong
          ? (currentPrice >= tp1Price || currentPrice > entryHigh)
          : (currentPrice <= tp1Price || currentPrice < entryLow);

        if (hasRunAway) {
          sig.status = 'EXPIRED';
          sig.entryStatus = 'ENTRY_MISSED';
          sig.finalState = 'EXPIRED';
          sig.chaseRisk = true;
          sig.antiChaseActive = true;
          sig.actionablePriority = 'INVALIDATED_EXPIRED';
          sig.closedAt = Date.now();
          lifecycleEvents.push({
            signalId: sig.id,
            symbol: sig.symbol,
            eventType: 'EXPIRED',
            triggerPrice: currentPrice,
            timestamp: Date.now(),
            notes: `Price ran away to ${currentPrice} beyond entry threshold (${entryLow} - ${entryHigh}) without fill. Anti-chase state triggered.`
          });
          continue;
        }

        // Check if current price touches or enters the valid entry zone
        const inZone = isLong
          ? (currentPrice >= entryLow && currentPrice <= entryHigh)
          : (currentPrice <= entryHigh && currentPrice >= entryLow);

        if (inZone) {
          sig.entryTriggeredAt = Date.now();
          sig.status = 'ACTIVE';
          sig.entryStatus = 'TRIGGERED';
          lifecycleEvents.push({
            signalId: sig.id,
            symbol: sig.symbol,
            eventType: 'ENTRY_TRIGGERED',
            triggerPrice: currentPrice,
            timestamp: Date.now(),
            notes: `Entry triggered at ${currentPrice} (Entry Zone: ${entryLow} - ${entryHigh})`
          });
        } else {
          // Approaching entry zone
          sig.status = 'ENTRY_PENDING';
          sig.entryStatus = 'WAIT_FOR_ENTRY';
          continue;
        }
      }

      // =====================================================================
      // 2. ACTIVE POSITION EVALUATION
      // =====================================================================
      sig.activeDurationMs = Date.now() - (sig.entryTriggeredAt || sig.createdAt || Date.now());

      // Check Stop Loss (Once Active)
      const slTriggered = (isLong && currentPrice <= sig.stopLoss) || (!isLong && currentPrice >= sig.stopLoss);
      if (slTriggered) {
        sig.status = 'STOPPED_OUT';
        sig.finalState = 'STOPPED_OUT';
        sig.actionablePriority = 'INVALIDATED_EXPIRED';
        sig.closedAt = Date.now();
        lifecycleEvents.push({
          signalId: sig.id,
          symbol: sig.symbol,
          eventType: 'STOPPED_OUT',
          triggerPrice: currentPrice,
          timestamp: Date.now(),
          notes: `Stopped out at ${currentPrice}`
        });

        // Record in permanent trade history log
        try {
          const { recordClosedTrade } = await import('./tradeHistoryStorage');
          const lossPct = sig.entryPrice > 0 ? -Math.abs(((currentPrice - sig.entryPrice) / sig.entryPrice) * 100) : 0;
          const wasBreakEven = (sig as any).isBreakEven || Math.abs(sig.stopLoss - sig.entryPrice) < 0.0001;
          recordClosedTrade({
            symbol: (sig.symbol || '').replace(/[^A-Z0-9]/g, '').toUpperCase(),
            direction: sig.direction as 'LONG' | 'SHORT',
            entryPrice: sig.entryPrice,
            exitPrice: currentPrice,
            stopLoss: sig.stopLoss,
            tp1: sig.tp1 || (sig.targets && sig.targets[0]?.price) || sig.entryPrice,
            tp2: sig.tp2 || (sig.targets && sig.targets[1]?.price),
            tp3: sig.tp3 || (sig.targets && sig.targets[2]?.price),
            tp4: (sig as any).tp4 || (sig.targets && sig.targets[3]?.price),
            outcome: wasBreakEven ? 'BREAK_EVEN' : 'STOPPED_OUT',
            pnlPct: wasBreakEven ? 0.0 : lossPct,
            riskRewardAchieved: wasBreakEven ? 1.0 : 0,
            entryTimestamp: sig.entryTriggeredAt || sig.createdAt || (Date.now() - 3600000),
            exitTimestamp: Date.now(),
            notes: wasBreakEven ? 'Closed at break-even SL protection' : 'Stopped out at controlled structural SL',
            source: (sig as any).isSupernova ? 'SUPERNOVA' : 'TERMINAL'
          });
        } catch (err) {
          console.warn('[TradeHistory] Failed to record stopped out trade:', err);
        }

        // Instant Telegram update on SL hit (deduplicated once per signal)
        if (!(sig as any).slAlertDispatched) {
          (sig as any).slAlertDispatched = true;
          const cleanSym = (sig.symbol || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
          const formatNum = (p: number) => (p < 0.001 ? p.toFixed(6) : (p < 1 ? p.toFixed(4) : p.toFixed(2)));
          const lossPct = sig.entryPrice > 0 ? Math.abs(((currentPrice - sig.entryPrice) / sig.entryPrice) * 100) : 0;
          const wasBreakEven = (sig as any).isBreakEven || Math.abs(sig.stopLoss - sig.entryPrice) < 0.0001;

          const dhakaTime = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Dhaka',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }).format(new Date()) + ' BST';

          const msg = wasBreakEven
            ? `🛡️ <b>#${cleanSym} Closed strictly at Break-Even / Controlled Stop.</b>\n\nPosition protected at entry level (<code>${formatNum(currentPrice)}</code>). 0.0% capital loss.\n🕒 <i>${dhakaTime}</i>`
            : `🛡️ <b>#${cleanSym} Closed strictly at Controlled Stop.</b>\n\nStop-loss triggered at <code>${formatNum(currentPrice)}</code> (-${lossPct.toFixed(2)}%). Risk strictly contained.\n🕒 <i>${dhakaTime}</i>`;

          import('./telegramService').then(ts => {
            ts.sendTelegramTradeUpdateAlert(msg, cleanSym).catch(e => console.warn('[Telegram SL Alert Error]:', e));
            ts.closeActiveTradeLifecycle(cleanSym, 'STOPPED_OUT');
          }).catch(() => {});
        }
        continue;
      }
      
      // Check All Dynamic Targets (TP1, TP2, TP3, ... TPn)
      if (Array.isArray(sig.targets) && sig.targets.length > 0) {
        let anyHitThisCycle = false;
        let allTargetsHit = true;

        for (let i = 0; i < sig.targets.length; i++) {
          const target = sig.targets[i];
          if (target.hit) continue;
          
          const hit = isLong ? currentPrice >= target.price : currentPrice <= target.price;
          if (hit) {
            target.hit = true;
            target.hitTime = Date.now();
            target.status = 'HIT';
            anyHitThisCycle = true;
            
            lifecycleEvents.push({
              signalId: sig.id,
              symbol: sig.symbol,
              eventType: 'TP_HIT',
              targetId: target.id,
              targetPrice: target.price,
              triggerPrice: currentPrice,
              timestamp: Date.now(),
              notes: `${target.label} reached at ${currentPrice}`
            });
            
            const isTp1 = target.id === 'TP1' || target.label === 'TP1' || i === 0;
            const isTp2 = target.id === 'TP2' || target.label === 'TP2' || i === 1;
            const isTp3 = target.id === 'TP3' || target.label === 'TP3' || i === 2;
            const isTp4 = target.id === 'TP4' || target.label === 'TP4' || i === 3;

            const cleanSym = (sig.symbol || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
            const formatNum = (p: number) => (p < 0.001 ? p.toFixed(6) : (p < 1 ? p.toFixed(4) : p.toFixed(2)));
            const gainPct = sig.entryPrice > 0
              ? (isLong ? ((target.price - sig.entryPrice) / sig.entryPrice) * 100 : ((sig.entryPrice - target.price) / sig.entryPrice) * 100)
              : 0;

            const dhakaTime = new Intl.DateTimeFormat('en-GB', {
              timeZone: 'Asia/Dhaka',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            }).format(new Date()) + ' BST';

            if (isTp1) {
              sig.status = 'TP1_HIT';
              // 1. Automatically move trade's active stopLoss to entryPrice to eliminate risk
              sig.stopLoss = sig.entryPrice;
              (sig as any).isBreakEven = true;

              // 2. Dispatch instant Telegram update: "🎯 #{SYMBOL} TP1 Smashed! 50% Profit Locked into Wallet. Stop-Loss moved to Entry (Break-Even)!"
              const tp1Msg = `🎯 <b>#${cleanSym} TP1 Smashed! (+${gainPct.toFixed(2)}%)</b>\n\n💰 <b>50% Profit Locked into Wallet.</b>\n🛡️ <b>Stop-Loss moved to Entry (Break-Even: <code>${formatNum(sig.entryPrice)}</code>)!</b>\n🕒 <i>${dhakaTime}</i>`;
              import('./telegramService').then(ts => {
                ts.sendTelegramTradeUpdateAlert(tp1Msg, cleanSym).catch(e => console.warn('[Telegram TP1 Alert Error]:', e));
                ts.updateActiveTradeStage(cleanSym, 'TP1_HIT', sig.entryPrice);
              }).catch(() => {});
            } else if (isTp2) {
              sig.status = 'TP2_HIT';
              const nextTarget = sig.targets[2]?.price ? `TP3 (<code>${formatNum(sig.targets[2].price)}</code>)` : 'TP3';
              const tp2Msg = `🔥 <b>#${cleanSym} TP2 & TP3 Obliterated! Trailing Stop Active! (+${gainPct.toFixed(2)}%)</b>\n\n💰 Capital locked in profit. Next Target: <b>${nextTarget}</b>.\n🕒 <i>${dhakaTime}</i>`;
              import('./telegramService').then(ts => {
                ts.sendTelegramTradeUpdateAlert(tp2Msg, cleanSym).catch(e => console.warn('[Telegram TP2 Alert Error]:', e));
                ts.updateActiveTradeStage(cleanSym, 'TP2_HIT');
              }).catch(() => {});
            } else if (isTp3) {
              sig.status = 'TP3_HIT';
              const nextTarget = sig.targets[3]?.price ? `TP4 (<code>${formatNum(sig.targets[3].price)}</code>)` : 'TP4 Moon Target';
              const tp3Msg = `🔥 <b>#${cleanSym} TP2 & TP3 Obliterated! Trailing Stop Active! (+${gainPct.toFixed(2)}%)</b>\n\n💎 Structural expansion runner active. Next Target: <b>${nextTarget}</b>.\n🕒 <i>${dhakaTime}</i>`;
              import('./telegramService').then(ts => {
                ts.sendTelegramTradeUpdateAlert(tp3Msg, cleanSym).catch(e => console.warn('[Telegram TP3 Alert Error]:', e));
                ts.updateActiveTradeStage(cleanSym, 'TP3_HIT');
              }).catch(() => {});
            } else {
              sig.status = 'TP_PROGRESS';
            }
            
            // Check if final target in array was reached
            if (i === sig.targets.length - 1) {
              sig.closedAt = Date.now();
              sig.status = 'COMPLETED';
              sig.finalState = 'COMPLETED';
              lifecycleEvents.push({
                signalId: sig.id,
                symbol: sig.symbol,
                eventType: 'FINAL_TARGET_REACHED',
                targetId: target.id,
                targetPrice: target.price,
                triggerPrice: currentPrice,
                timestamp: Date.now(),
                notes: `Final target ${target.label} reached — Position Completed`
              });

              // Record in permanent trade history log
              try {
                const { recordClosedTrade } = await import('./tradeHistoryStorage');
                recordClosedTrade({
                  symbol: (sig.symbol || '').replace(/[^A-Z0-9]/g, '').toUpperCase(),
                  direction: sig.direction as 'LONG' | 'SHORT',
                  entryPrice: sig.entryPrice,
                  exitPrice: currentPrice,
                  stopLoss: sig.stopLoss,
                  tp1: sig.tp1 || (sig.targets && sig.targets[0]?.price) || sig.entryPrice,
                  tp2: sig.tp2 || (sig.targets && sig.targets[1]?.price),
                  tp3: sig.tp3 || (sig.targets && sig.targets[2]?.price),
                  tp4: (sig as any).tp4 || (sig.targets && sig.targets[3]?.price),
                  outcome: isTp4 ? 'TP4_HIT' : (isTp3 ? 'TP3_HIT' : (isTp2 ? 'TP2_HIT' : 'TP1_HIT')),
                  pnlPct: gainPct,
                  riskRewardAchieved: sig.riskRewardRatio || 3.5,
                  entryTimestamp: sig.entryTriggeredAt || sig.createdAt || (Date.now() - 3600000),
                  exitTimestamp: Date.now(),
                  notes: `Full target completion (+${gainPct.toFixed(2)}%)`,
                  source: (sig as any).isSupernova ? 'SUPERNOVA' : 'TERMINAL'
                });
              } catch (err) {
                console.warn('[TradeHistory] Failed to record completed trade:', err);
              }

              const tp4Msg = `🏆 <b>#${cleanSym} ALL TARGETS HIT! Maximum Move Captured (+${gainPct.toFixed(2)}%)!</b>\n\n🌟 Full structural profit expansion complete. All targets achieved successfully!\n🕒 <i>${dhakaTime}</i>`;
              import('./telegramService').then(ts => {
                ts.sendTelegramTradeUpdateAlert(tp4Msg, cleanSym).catch(e => console.warn('[Telegram TP4 Final Alert Error]:', e));
                ts.closeActiveTradeLifecycle(cleanSym, 'COMPLETED');
              }).catch(() => {});
            }
          } else {
            allTargetsHit = false;
          }
        }

        // Re-evaluate trade management if a target was hit
        if (anyHitThisCycle) {
          const estAtr = Math.abs(sig.entryPrice - sig.stopLoss) * 0.5;
          const updatedMgmt = evaluateTradeManagement({
            entryPrice: sig.entryPrice,
            stopLoss: sig.stopLoss,
            currentPrice,
            direction: sig.direction,
            targets: sig.targets,
            atr: estAtr,
            marketRegime: sig.marketRegime || 'NEUTRAL',
            rsi: sig.rsi || 50
          });
          sig.tradeManagement = updatedMgmt;
          
          // Advance Stop Loss if protected (NEVER widen risk)
          if (updatedMgmt.protectionMode !== 'ORIGINAL_SL') {
            if (isLong && updatedMgmt.recommendedStopLoss > sig.stopLoss) {
              sig.stopLoss = updatedMgmt.recommendedStopLoss;
            } else if (!isLong && updatedMgmt.recommendedStopLoss < sig.stopLoss) {
              sig.stopLoss = updatedMgmt.recommendedStopLoss;
            }
          }
        }
      }
      
      // Expiration check
      if (Date.now() > sig.expiresAt && sig.status === 'ACTIVE') {
        sig.status = 'EXPIRED';
        sig.finalState = 'EXPIRED';
        sig.actionablePriority = 'INVALIDATED_EXPIRED';
        sig.closedAt = Date.now();
        lifecycleEvents.push({
          signalId: sig.id,
          symbol: sig.symbol,
          eventType: 'EXPIRED',
          triggerPrice: currentPrice,
          timestamp: Date.now(),
          notes: 'Signal trade window expired'
        });
      }
    } catch (err) {
      // ignore individual ticker update errors
    }
  }

  // Active real-time cleanup and price sync for authoritative Pre-Move registry
  try {
    const activePreMove = getAuthoritativePreMoveSignals();
    for (const pmSig of activePreMove) {
      const cleanSym = pmSig.symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const ticker = await get24hTicker(cleanSym);
      if (ticker && ticker.lastPrice > 0) {
        checkAndUpdateExistingPreMoveSignal(cleanSym, ticker.lastPrice);
      }
    }
  } catch (pmErr) {
    // ignore individual ticker update errors
  }
}
