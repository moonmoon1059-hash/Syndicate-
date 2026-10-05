import { Signal, MajorMoveClassification } from '../src/types/crypto';
import { formatPrice } from '../src/utils/formatters';

export interface MajorMoveQualification {
  classification: MajorMoveClassification;
  structurallySupportedMovePct: number;
  isQualified: boolean;
  reason: string;
  notes: string[];
  antiChasePassed: boolean;
}

/**
 * Authoritative Major Move Qualification Engine
 *
 * CRITICAL SEPARATION OF CONCEPTS (User Mandate):
 * 1. Signal Quality (A/A+) is NOT Move Classification. A Grade A/A+ signal can be a +1.5% scalp.
 * 2. MoonScore (90+) is NOT Move Classification.
 * 3. High Conviction is NOT Move Classification.
 * 4. '300% potential' / 'Exceptional' label alone is NOT Move Classification.
 * 5. TP count (even 5+ TPs) is NOT Move Classification.
 * 6. ONLY genuine structural price opportunity >= 30.0% from entry to terminal valid target
 *    qualifies for MAJOR MOVE (>30%).
 * 7. ONLY genuine structural price opportunity >= 50.0% qualifies for EXTREME MOVE (>50%).
 */
export function qualifyMajorMoveOpportunity(signal: Signal): MajorMoveQualification {
  if (!signal || (signal.direction as any) === 'WAIT' || !signal.entryPrice || signal.entryPrice <= 0) {
    return {
      classification: 'NORMAL',
      structurallySupportedMovePct: 0,
      isQualified: false,
      reason: 'No valid active directional setup with positive entry price',
      notes: [],
      antiChasePassed: true
    };
  }

  const isLong = signal.direction === 'LONG';
  const entryLow = Math.min(signal.entryZoneLow || signal.entryPrice, signal.entryZoneHigh || signal.entryPrice);
  const entryHigh = Math.max(signal.entryZoneLow || signal.entryPrice, signal.entryZoneHigh || signal.entryPrice);
  const entryPrice = (entryLow > 0 && entryHigh > 0) ? (entryLow + entryHigh) / 2 : signal.entryPrice;

  // Extract canonical dynamic targets strictly in the favorable direction
  const rawTargets = (signal.targets || []).filter(
    t => typeof t.price === 'number' && Number.isFinite(t.price) && t.price > 0 && t.status !== 'INVALIDATED'
  );

  const validTargets = rawTargets.filter(t =>
    isLong ? t.price > entryPrice : t.price < entryPrice
  );

  if (validTargets.length === 0) {
    return {
      classification: 'NORMAL',
      structurallySupportedMovePct: 0,
      isQualified: false,
      reason: 'No valid structural targets established in trade direction',
      notes: [],
      antiChasePassed: true
    };
  }

  // Calculate potential structural move from Entry to terminal target
  const finalTarget = isLong
    ? Math.max(...validTargets.map(t => t.price))
    : Math.min(...validTargets.map(t => t.price));

  const supportedMovePct = isLong
    ? Number((((finalTarget - entryPrice) / entryPrice) * 100).toFixed(1))
    : Number((((entryPrice - finalTarget) / entryPrice) * 100).toFixed(1));

  const currentPrice = signal.currentPrice || entryPrice;
  const priceDistancePastEntryPct = isLong
    ? ((currentPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - currentPrice) / entryPrice) * 100;

  // Real Macro Anti-chase / severe exhaustion guards:
  const isAlreadyExtended = Boolean(
    signal.largeMoveIntelligence?.isAlreadyExtended ||
    signal.largeMoveIntelligence?.antiChaseActive ||
    signal.entryStatus === 'ENTRY_MISSED' ||
    priceDistancePastEntryPct >= 15.0 || // Price has already surged/dumped 15%+ away from entry
    (signal.pumpDumpIntelligence && (signal.pumpDumpIntelligence.dumpRisk === 'CRITICAL' || signal.pumpDumpIntelligence.fakePumpRisk === 'HIGH'))
  );

  if (isAlreadyExtended) {
    const reasonText = priceDistancePastEntryPct >= 15.0
      ? `Anti-Chase Guard: Asset has already run ${priceDistancePastEntryPct.toFixed(1)}% past entry`
      : 'Anti-Chase Guard: Asset is extended or exhausted from base';
    return {
      classification: 'NORMAL',
      structurallySupportedMovePct: supportedMovePct,
      isQualified: false,
      reason: reasonText,
      notes: ['Exhaustion detected; large move alert suppressed by anti-chase guard'],
      antiChasePassed: false
    };
  }

  const notes: string[] = [];
  if (signal.unifiedFusion?.primaryCategory) {
    notes.push(`Unified setup: ${signal.unifiedFusion.primaryCategory}`);
  }
  if (signal.marketStructure) {
    notes.push(`Market Structure: ${signal.marketStructure}`);
  }
  if (signal.preMoveReport?.compressionRatio) {
    notes.push(`Compression ratio: ${signal.preMoveReport.compressionRatio}%`);
  }

  // Strict structural thresholds:
  // ONLY >= 50% qualifies for EXTREME_MOVE
  if (supportedMovePct >= 50.0) {
    notes.push(`Structurally supported expansion: +${supportedMovePct}% to terminal level ${formatPrice(finalTarget)}`);
    return {
      classification: 'EXTREME_MOVE',
      structurallySupportedMovePct: supportedMovePct,
      isQualified: true,
      reason: `Extreme move opportunity confirmed by dynamic structural targets (+${supportedMovePct}%)`,
      notes,
      antiChasePassed: true
    };
  }

  // ONLY >= 30% qualifies for MAJOR_MOVE
  if (supportedMovePct >= 30.0) {
    notes.push(`Structurally supported expansion: +${supportedMovePct}% to terminal level ${formatPrice(finalTarget)}`);
    return {
      classification: 'MAJOR_MOVE',
      structurallySupportedMovePct: supportedMovePct,
      isQualified: true,
      reason: `Major move opportunity confirmed by dynamic structural targets (+${supportedMovePct}%)`,
      notes,
      antiChasePassed: true
    };
  }

  // 10% - 29.9%: Strong Move (NOT Major Move)
  if (supportedMovePct >= 10.0) {
    notes.push(`Structurally supported expansion: +${supportedMovePct}% to terminal level ${formatPrice(finalTarget)}`);
    return {
      classification: 'STRONG_MOVE',
      structurallySupportedMovePct: supportedMovePct,
      isQualified: false,
      reason: `Strong move opportunity (+${supportedMovePct}%) below 30% Major Move threshold`,
      notes,
      antiChasePassed: true
    };
  }

  // 4% - 9.9%: Moderate Move (NOT Major Move)
  if (supportedMovePct >= 4.0) {
    notes.push(`Structurally supported expansion: +${supportedMovePct}% to terminal level ${formatPrice(finalTarget)}`);
    return {
      classification: 'MODERATE_MOVE',
      structurallySupportedMovePct: supportedMovePct,
      isQualified: false,
      reason: `Moderate move opportunity (+${supportedMovePct}%) below 30% Major Move threshold`,
      notes,
      antiChasePassed: true
    };
  }

  // < 4%: Normal / Small Move (HOOD ~1.5%, GLWB ~1.1%, NFLX ~2.5%)
  return {
    classification: 'NORMAL',
    structurallySupportedMovePct: Math.max(0, supportedMovePct),
    isQualified: false,
    reason: `Potential move +${supportedMovePct}% below 4% threshold (Small Move)`,
    notes,
    antiChasePassed: true
  };
}
