import {
  Candle,
  PrimarySetupCategory,
  LongSetupCategory,
  ShortSetupCategory,
  CategoryTransitionRecord,
  CategoryIntelligenceReport,
  SignalQualityGrade,
  ActionablePriority,
  TargetLevel,
  SmartEntryTiming,
  SetupMaturity,
  TimingWindow,
  MarketCycleAnalysis,
  EarlyMoveReport,
  SectorRotationAnalysis,
  EarlyCatalystInput
} from '../src/types/crypto';

export interface CategoryEvaluationInput {
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  candles: Candle[];
  currentPrice: number;
  entryPrice: number;
  stopLoss?: number;
  targets?: TargetLevel[];
  riskRewardRatio?: number;
  decision?: 'LONG' | 'SHORT' | 'WAIT';
  qualityGrade?: SignalQualityGrade;
  actionablePriority?: ActionablePriority;
  entryStatus?: SmartEntryTiming | string;
  setupMaturity?: SetupMaturity;
  timingWindow?: TimingWindow;
  marketCycle?: MarketCycleAnalysis;
  earlyMoveReport?: EarlyMoveReport;
  smcStructureReport?: any;
  orderflowReport?: any;
  relativeStrengthReport?: any;
  rsScoreVsBtc?: number;
  breakoutEvaluation?: any;
  pullbackZone?: any;
  retestLevel?: number;
  newsCatalyst?: string;
  catalystTradePipeline?: any;
  earlyCatalyst?: EarlyCatalystInput;
  marketRegime?: any;
  sectorRotation?: SectorRotationAnalysis;
  rvol?: number;
  priceChange24h?: number;
  previousCategory?: PrimarySetupCategory;
  categoryTransitionHistory?: CategoryTransitionRecord[];
}

/**
 * Deterministic Priority Weights for Category Selection:
 * Institutional / Structural specificity takes precedence over generic momentum or early state.
 */
const LONG_CATEGORY_PRIORITY: Record<LongSetupCategory, number> = {
  SPRING_LONG: 12,
  LIQUIDITY_RECLAIM_LONG: 11,
  BREAKOUT_RETEST_LONG: 10,
  BREAKOUT_LONG: 9,
  PULLBACK_LONG: 8,
  ACCUMULATION_LONG: 7,
  TREND_CONTINUATION_LONG: 6,
  MOMENTUM_EXPANSION_LONG: 5,
  CATALYST_LONG: 4,
  RELATIVE_STRENGTH_LONG: 3,
  HIGH_ASYMMETRY_LONG: 2,
  EARLY_LONG: 1
};

const SHORT_CATEGORY_PRIORITY: Record<ShortSetupCategory, number> = {
  UTAD_SHORT: 12,
  LIQUIDITY_REJECTION_SHORT: 11,
  BREAKDOWN_RETEST_SHORT: 10,
  BREAKDOWN_SHORT: 9,
  PULLBACK_SHORT: 8,
  DISTRIBUTION_SHORT: 7,
  TREND_CONTINUATION_SHORT: 6,
  MOMENTUM_EXPANSION_SHORT: 5,
  CATALYST_DUMP_SHORT: 4,
  RELATIVE_WEAKNESS_SHORT: 3,
  HIGH_ASYMMETRY_SHORT: 2,
  EARLY_SHORT: 1
};

/**
 * PHASE 12: LONG/SHORT PRIMARY SETUP CATEGORY ENGINE
 * 
 * Rules:
 * 1. Category is classification, NOT a signal generator.
 * 2. Final decision remains only LONG/SHORT/WAIT.
 * 3. Final quality remains A+/A/B/C/WAIT.
 * 4. ONE COIN = ONE CURRENT UNIFIED SIGNAL.
 * 5. If multiple setup evidences exist, select ONE primary category using deterministic structural priority;
 *    retain secondary setup evidences in categoryConfluences.
 * 6. Never force a category when evidence is insufficient: use UNKNOWN/WAIT.
 * 7. Conflicting LONG/SHORT evidence is handled by the unified Signal Engine, never as duplicate signals.
 * 8. Category name, R:R, Wyckoff phase, or catalyst alone must NEVER create or upgrade a signal.
 * 9. Supports meaningful category transitions for the SAME opportunity (e.g. EARLY_LONG -> BREAKOUT_LONG -> BREAKOUT_RETEST_LONG).
 */
export function evaluatePrimarySetupCategory(
  input: CategoryEvaluationInput
): CategoryIntelligenceReport {
  const {
    symbol,
    direction,
    candles,
    currentPrice,
    entryPrice,
    riskRewardRatio,
    decision,
    entryStatus,
    setupMaturity,
    marketCycle,
    earlyMoveReport,
    smcStructureReport,
    relativeStrengthReport,
    rsScoreVsBtc,
    breakoutEvaluation,
    pullbackZone,
    retestLevel,
    newsCatalyst,
    catalystTradePipeline,
    earlyCatalyst,
    rvol = 1.0,
    priceChange24h = 0,
    previousCategory,
    categoryTransitionHistory = []
  } = input;

  const structuralTriggers: string[] = [];
  const history: CategoryTransitionRecord[] = [...categoryTransitionHistory];

  // 1. Zero fabrication rule: Insufficient candle depth (< 15 bars)
  if (!candles || candles.length < 15) {
    return {
      symbol,
      direction: 'WAIT',
      primaryCategory: 'UNKNOWN',
      categoryConfluences: [],
      previousCategory,
      transitionHistory: history,
      confidence: 0,
      reasoning: `${symbol}: UNKNOWN category due to insufficient candle depth (< 15 bars). Zero data fabrication enforced.`,
      structuralTriggers: ['Insufficient candle depth (< 15 bars)'],
      executionAlignment: 'WAIT_FOR_DATA',
      cycleAlignment: marketCycle?.cycle || 'UNKNOWN',
      isConfirmed: false
    };
  }

  // 2. WAIT / Conflicting state check
  const effDirection = direction || decision || 'WAIT';
  if (effDirection === 'WAIT') {
    return {
      symbol,
      direction: 'WAIT',
      primaryCategory: 'WAIT',
      categoryConfluences: [],
      previousCategory,
      transitionHistory: history,
      confidence: 0,
      reasoning: `${symbol}: In WAIT state. No active directional primary category assigned.`,
      structuralTriggers: ['Signal direction is WAIT or conflicting'],
      executionAlignment: entryStatus || 'WAIT_FOR_CONFIRMATION',
      cycleAlignment: marketCycle?.cycle || 'UNKNOWN',
      isConfirmed: false
    };
  }

  // Common structural signals
  const smcType = typeof smcStructureReport === 'string'
    ? smcStructureReport
    : smcStructureReport?.structureType || '';
  const isLiquidityGrab = smcType.includes('LIQUIDITY_GRAB') || smcType.includes('SWEEP');
  const isBOS = smcType.includes('BOS') || smcType.includes('CHOCH');

  const wyckoffSpring = marketCycle?.wyckoffEvents?.accumulation?.SPRING?.detected ||
    earlyMoveReport?.classification === 'SPRING_SETUP';
  const wyckoffUtad = marketCycle?.wyckoffEvents?.distribution?.UTAD?.detected ||
    earlyMoveReport?.classification === 'UTAD_SETUP';

  const isAccumulation = marketCycle?.cycle === 'ACCUMULATION' ||
    earlyMoveReport?.classification === 'ACCUMULATION_SETUP';
  const isReAccumulation = marketCycle?.cycle === 'RE_ACCUMULATION';
  const isDistribution = marketCycle?.cycle === 'DISTRIBUTION' ||
    earlyMoveReport?.classification === 'DISTRIBUTION_SETUP';
  const isReDistribution = marketCycle?.cycle === 'RE_DISTRIBUTION';

  const hasPositiveCatalyst = Boolean(
    (earlyCatalyst && earlyCatalyst.impactDirection === 'BULLISH' && earlyCatalyst.reactionState !== 'CONTRADICTED') ||
    (catalystTradePipeline?.tradeableDirection === 'LONG') ||
    (earlyMoveReport?.classification === 'EARLY_CATALYST' && effDirection === 'LONG') ||
    (newsCatalyst && newsCatalyst.length > 5 && effDirection === 'LONG')
  );

  const hasNegativeCatalyst = Boolean(
    (earlyCatalyst && earlyCatalyst.impactDirection === 'BEARISH') ||
    (catalystTradePipeline?.tradeableDirection === 'SHORT') ||
    (newsCatalyst && (newsCatalyst.toLowerCase().includes('exploit') || newsCatalyst.toLowerCase().includes('hack') || newsCatalyst.toLowerCase().includes('lawsuit')) && effDirection === 'SHORT')
  );

  const isHighRR = (riskRewardRatio && riskRewardRatio >= 3.0) || earlyMoveReport?.asymmetricPotential?.isAsymmetric === true;
  const isLeader = (rsScoreVsBtc && rsScoreVsBtc >= 65) || relativeStrengthReport?.leadershipState === 'LEADER';
  const isLaggard = (rsScoreVsBtc && rsScoreVsBtc <= 35) || relativeStrengthReport?.leadershipState === 'LAGGING';

  let primaryCategory: PrimarySetupCategory = 'UNKNOWN';
  const categoryConfluences: PrimarySetupCategory[] = [];

  // ==========================================================================
  // EVALUATE LONG CATEGORIES
  // ==========================================================================
  if (effDirection === 'LONG') {
    const candidateMatches: { category: LongSetupCategory; priority: number; trigger: string }[] = [];

    // 1. SPRING_LONG
    if (wyckoffSpring) {
      candidateMatches.push({
        category: 'SPRING_LONG',
        priority: LONG_CATEGORY_PRIORITY.SPRING_LONG,
        trigger: 'Wyckoff Spring detected: terminal shakeout and aggressive demand reclaim below support'
      });
    }

    // 2. LIQUIDITY_RECLAIM_LONG
    if (isLiquidityGrab || earlyMoveReport?.classification === 'LIQUIDITY_RECLAIM') {
      candidateMatches.push({
        category: 'LIQUIDITY_RECLAIM_LONG',
        priority: LONG_CATEGORY_PRIORITY.LIQUIDITY_RECLAIM_LONG,
        trigger: 'Liquidity sweep and reclaim of key swing low (turtle soup long)'
      });
    }

    // 3. BREAKOUT_RETEST_LONG
    if (
      breakoutEvaluation?.retestConfirmed ||
      entryStatus === 'WAIT_FOR_RETEST' ||
      (retestLevel && Math.abs(currentPrice - retestLevel) / retestLevel < 0.02)
    ) {
      candidateMatches.push({
        category: 'BREAKOUT_RETEST_LONG',
        priority: LONG_CATEGORY_PRIORITY.BREAKOUT_RETEST_LONG,
        trigger: 'Breakout retest confirmed: previous resistance successfully defending as support'
      });
    }

    // 4. BREAKOUT_LONG
    if (
      breakoutEvaluation?.isBreakout ||
      earlyMoveReport?.classification === 'COMPRESSION_BREAKOUT' ||
      (isBOS && rvol >= 1.5 && priceChange24h > 1.0)
    ) {
      candidateMatches.push({
        category: 'BREAKOUT_LONG',
        priority: LONG_CATEGORY_PRIORITY.BREAKOUT_LONG,
        trigger: 'Structural breakout with volume expansion above key resistance'
      });
    }

    // 5. PULLBACK_LONG
    if (
      pullbackZone?.isInside ||
      entryStatus === 'WAIT_FOR_PULLBACK' ||
      (earlyMoveReport?.classification as string) === 'PULLBACK_SETUP' ||
      smcStructureReport?.structureType === 'PULLBACK_TO_ORDERBLOCK'
    ) {
      candidateMatches.push({
        category: 'PULLBACK_LONG',
        priority: LONG_CATEGORY_PRIORITY.PULLBACK_LONG,
        trigger: 'Controlled shallow pullback into dynamic support within an active markup/uptrend'
      });
    }

    // 6. ACCUMULATION_LONG
    if (isAccumulation) {
      candidateMatches.push({
        category: 'ACCUMULATION_LONG',
        priority: LONG_CATEGORY_PRIORITY.ACCUMULATION_LONG,
        trigger: `Wyckoff Stage 1 Accumulation: supply absorption and base building (${marketCycle?.stage || 'PHASE_B_C'})`
      });
    }

    // 7. TREND_CONTINUATION_LONG
    if (isReAccumulation || marketCycle?.stage === 'STAGE_2_MARKUP' || (isBOS && !breakoutEvaluation?.isBreakout)) {
      candidateMatches.push({
        category: 'TREND_CONTINUATION_LONG',
        priority: LONG_CATEGORY_PRIORITY.TREND_CONTINUATION_LONG,
        trigger: 'Trend continuation / Re-accumulation: established bullish market structure intact'
      });
    }

    // 8. MOMENTUM_EXPANSION_LONG
    if (rvol >= 2.0 || earlyMoveReport?.classification === 'UNUSUAL_VOLUME' || earlyMoveReport?.classification === 'EARLY_EXPANSION') {
      candidateMatches.push({
        category: 'MOMENTUM_EXPANSION_LONG',
        priority: LONG_CATEGORY_PRIORITY.MOMENTUM_EXPANSION_LONG,
        trigger: `Momentum expansion: institutional volume acceleration (${rvol.toFixed(1)}x RVOL)`
      });
    }

    // 9. CATALYST_LONG
    if (hasPositiveCatalyst) {
      candidateMatches.push({
        category: 'CATALYST_LONG',
        priority: LONG_CATEGORY_PRIORITY.CATALYST_LONG,
        trigger: `Catalyst-driven expansion: confirmed news/protocol development with positive market reaction`
      });
    }

    // 10. RELATIVE_STRENGTH_LONG
    if (isLeader) {
      candidateMatches.push({
        category: 'RELATIVE_STRENGTH_LONG',
        priority: LONG_CATEGORY_PRIORITY.RELATIVE_STRENGTH_LONG,
        trigger: 'Relative strength outperformance: asset demonstrating persistent upside leadership vs BTC'
      });
    }

    // 11. HIGH_ASYMMETRY_LONG
    if (isHighRR) {
      candidateMatches.push({
        category: 'HIGH_ASYMMETRY_LONG',
        priority: LONG_CATEGORY_PRIORITY.HIGH_ASYMMETRY_LONG,
        trigger: `High asymmetry profile: structural R:R ratio >= 1:${(riskRewardRatio || 3.0).toFixed(1)} with tight invalidation anchor`
      });
    }

    // 12. EARLY_LONG
    if (
      setupMaturity === 'EARLY_SETUP' ||
      setupMaturity === 'SETUP_FORMING' ||
      setupMaturity === 'NEAR_TRIGGER' ||
      candidateMatches.length === 0
    ) {
      candidateMatches.push({
        category: 'EARLY_LONG',
        priority: LONG_CATEGORY_PRIORITY.EARLY_LONG,
        trigger: 'Early setup forming: coiling market structure developing prior to full momentum trigger'
      });
    }

    // Sort by deterministic priority (highest specificity first)
    candidateMatches.sort((a, b) => b.priority - a.priority);

    primaryCategory = candidateMatches[0].category;
    structuralTriggers.push(candidateMatches[0].trigger);

    for (let i = 1; i < candidateMatches.length; i++) {
      categoryConfluences.push(candidateMatches[i].category);
      if (i <= 3) {
        structuralTriggers.push(candidateMatches[i].trigger);
      }
    }
  }

  // ==========================================================================
  // EVALUATE SHORT CATEGORIES
  // ==========================================================================
  else if (effDirection === 'SHORT') {
    const candidateMatches: { category: ShortSetupCategory; priority: number; trigger: string }[] = [];

    // 1. UTAD_SHORT
    if (wyckoffUtad) {
      candidateMatches.push({
        category: 'UTAD_SHORT',
        priority: SHORT_CATEGORY_PRIORITY.UTAD_SHORT,
        trigger: 'Wyckoff UTAD detected: Upthrust After Distribution rejected back below ceiling with institutional supply'
      });
    }

    // 2. LIQUIDITY_REJECTION_SHORT
    if (isLiquidityGrab || earlyMoveReport?.classification === 'LIQUIDITY_RECLAIM') {
      candidateMatches.push({
        category: 'LIQUIDITY_REJECTION_SHORT',
        priority: SHORT_CATEGORY_PRIORITY.LIQUIDITY_REJECTION_SHORT,
        trigger: 'Liquidity sweep of key swing high followed by immediate aggressive rejection back into range'
      });
    }

    // 3. BREAKDOWN_RETEST_SHORT
    if (
      entryStatus === 'WAIT_FOR_RETEST' ||
      (retestLevel && Math.abs(currentPrice - retestLevel) / retestLevel < 0.02)
    ) {
      candidateMatches.push({
        category: 'BREAKDOWN_RETEST_SHORT',
        priority: SHORT_CATEGORY_PRIORITY.BREAKDOWN_RETEST_SHORT,
        trigger: 'Breakdown retest confirmed: broken support now acting as firm overhead resistance'
      });
    }

    // 4. BREAKDOWN_SHORT
    if (
      isBOS ||
      (rvol >= 1.5 && priceChange24h < -1.0)
    ) {
      candidateMatches.push({
        category: 'BREAKDOWN_SHORT',
        priority: SHORT_CATEGORY_PRIORITY.BREAKDOWN_SHORT,
        trigger: 'Structural breakdown below key support floor with volume expansion'
      });
    }

    // 5. PULLBACK_SHORT
    if (
      pullbackZone?.isInside ||
      entryStatus === 'WAIT_FOR_PULLBACK' ||
      (earlyMoveReport?.classification as string) === 'PULLBACK_SETUP' ||
      smcStructureReport?.structureType === 'PULLBACK_TO_ORDERBLOCK'
    ) {
      candidateMatches.push({
        category: 'PULLBACK_SHORT',
        priority: SHORT_CATEGORY_PRIORITY.PULLBACK_SHORT,
        trigger: 'Corrective relief rally into dynamic resistance within an active markdown/downtrend'
      });
    }

    // 6. DISTRIBUTION_SHORT
    if (isDistribution) {
      candidateMatches.push({
        category: 'DISTRIBUTION_SHORT',
        priority: SHORT_CATEGORY_PRIORITY.DISTRIBUTION_SHORT,
        trigger: `Wyckoff Stage 3 Distribution: institutional supply unloading into retail demand (${marketCycle?.stage || 'TOPPING'})`
      });
    }

    // 7. TREND_CONTINUATION_SHORT
    if (isReDistribution || marketCycle?.stage === 'STAGE_4_MARKDOWN') {
      candidateMatches.push({
        category: 'TREND_CONTINUATION_SHORT',
        priority: SHORT_CATEGORY_PRIORITY.TREND_CONTINUATION_SHORT,
        trigger: 'Trend continuation / Re-distribution: persistent markdown structure with lower highs'
      });
    }

    // 8. MOMENTUM_EXPANSION_SHORT
    if (rvol >= 2.0 || earlyMoveReport?.classification === 'UNUSUAL_VOLUME') {
      candidateMatches.push({
        category: 'MOMENTUM_EXPANSION_SHORT',
        priority: SHORT_CATEGORY_PRIORITY.MOMENTUM_EXPANSION_SHORT,
        trigger: `Selling momentum expansion: institutional dump volume acceleration (${rvol.toFixed(1)}x RVOL)`
      });
    }

    // 9. CATALYST_DUMP_SHORT
    if (hasNegativeCatalyst) {
      candidateMatches.push({
        category: 'CATALYST_DUMP_SHORT',
        priority: SHORT_CATEGORY_PRIORITY.CATALYST_DUMP_SHORT,
        trigger: 'Bearish catalyst dump: negative news / exploit / unlock reaction accelerating downward'
      });
    }

    // 10. RELATIVE_WEAKNESS_SHORT
    if (isLaggard) {
      candidateMatches.push({
        category: 'RELATIVE_WEAKNESS_SHORT',
        priority: SHORT_CATEGORY_PRIORITY.RELATIVE_WEAKNESS_SHORT,
        trigger: 'Relative weakness: asset underperforming broader market with persistent supply overhang'
      });
    }

    // 11. HIGH_ASYMMETRY_SHORT
    if (isHighRR) {
      candidateMatches.push({
        category: 'HIGH_ASYMMETRY_SHORT',
        priority: SHORT_CATEGORY_PRIORITY.HIGH_ASYMMETRY_SHORT,
        trigger: `High asymmetry short profile: structural R:R ratio >= 1:${(riskRewardRatio || 3.0).toFixed(1)} with tight stop loss anchor`
      });
    }

    // 12. EARLY_SHORT
    if (
      setupMaturity === 'EARLY_SETUP' ||
      setupMaturity === 'SETUP_FORMING' ||
      setupMaturity === 'NEAR_TRIGGER' ||
      candidateMatches.length === 0
    ) {
      candidateMatches.push({
        category: 'EARLY_SHORT',
        priority: SHORT_CATEGORY_PRIORITY.EARLY_SHORT,
        trigger: 'Early breakdown setup forming: distribution pressure coiling before breakdown trigger'
      });
    }

    // Sort by deterministic priority
    candidateMatches.sort((a, b) => b.priority - a.priority);

    primaryCategory = candidateMatches[0].category;
    structuralTriggers.push(candidateMatches[0].trigger);

    for (let i = 1; i < candidateMatches.length; i++) {
      categoryConfluences.push(candidateMatches[i].category);
      if (i <= 3) {
        structuralTriggers.push(candidateMatches[i].trigger);
      }
    }
  }

  // ==========================================================================
  // CATEGORY TRANSITION TRACKING FOR THE SAME OPPORTUNITY
  // ==========================================================================
  // If opportunity was previously evaluated with another primary category,
  // record the structural progression without creating duplicate signals.
  if (
    previousCategory &&
    previousCategory !== primaryCategory &&
    previousCategory !== 'UNKNOWN' &&
    (previousCategory as string) !== 'WAIT' &&
    primaryCategory !== 'UNKNOWN' &&
    (primaryCategory as string) !== 'WAIT'
  ) {
    const lastRecord = history[history.length - 1];
    if (!lastRecord || lastRecord.toCategory !== primaryCategory) {
      const transitionReason = generateTransitionReason(previousCategory, primaryCategory);
      history.push({
        fromCategory: previousCategory,
        toCategory: primaryCategory,
        timestamp: Date.now(),
        reason: transitionReason,
        price: currentPrice
      });

      // Keep maximum 10 historical transitions per unified signal
      if (history.length > 10) {
        history.shift();
      }
    }
  }

  // Format concise intelligence reasoning
  const confluencesSummary = categoryConfluences.length > 0
    ? ` Secondary Confluences: [${categoryConfluences.slice(0, 3).join(', ')}].`
    : '';
  const reasoning = `${symbol} [${effDirection}]: Primary Setup Category is ${primaryCategory}.${confluencesSummary} ${structuralTriggers[0] || ''}`;

  const executionAlignment = typeof entryStatus === 'string'
    ? entryStatus
    : (earlyMoveReport?.entryTiming || 'WAIT_FOR_CONFIRMATION');
  const cycleAlignment = marketCycle?.cycle || 'UNKNOWN';

  return {
    symbol,
    direction: effDirection,
    primaryCategory,
    categoryConfluences,
    previousCategory: previousCategory || undefined,
    transitionHistory: history,
    confidence: primaryCategory !== 'UNKNOWN' && (primaryCategory as string) !== 'WAIT' ? 85 : 0,
    reasoning,
    structuralTriggers,
    executionAlignment,
    cycleAlignment,
    isConfirmed: setupMaturity === 'CONFIRMED' || entryStatus === 'ENTRY_NOW'
  };
}

/**
 * Generate human-readable structural reason for category transition
 */
function generateTransitionReason(from: PrimarySetupCategory, to: PrimarySetupCategory): string {
  if (from === 'EARLY_LONG' && to === 'BREAKOUT_LONG') {
    return 'Setup matured: price decisively breached resistance with volume expansion, transitioning from early coiling to active breakout.';
  }
  if (from === 'BREAKOUT_LONG' && to === 'BREAKOUT_RETEST_LONG') {
    return 'Breakout follow-through: price pulled back to retest previous broken resistance as confirmed structural support.';
  }
  if (from === 'BREAKOUT_RETEST_LONG' && to === 'TREND_CONTINUATION_LONG') {
    return 'Retest held: buyers resumed upward push creating higher highs, transitioning to trend continuation.';
  }
  if (from === 'ACCUMULATION_LONG' && to === 'SPRING_LONG') {
    return 'Wyckoff terminal test: price swept range lows and aggressively reclaimed support, transitioning to Spring setup.';
  }
  if (from === 'SPRING_LONG' && to === 'BREAKOUT_LONG') {
    return 'Post-Spring expansion: successful Spring reclaimed base and triggered range ceiling breakout.';
  }
  if (from === 'EARLY_SHORT' && to === 'BREAKDOWN_SHORT') {
    return 'Setup matured: price decisively lost support with expanding sell volume, transitioning from early coiling to active breakdown.';
  }
  if (from === 'BREAKDOWN_SHORT' && to === 'BREAKDOWN_RETEST_SHORT') {
    return 'Breakdown follow-through: price conducted relief retest of broken support turned resistance.';
  }
  if (from === 'DISTRIBUTION_SHORT' && to === 'UTAD_SHORT') {
    return 'Wyckoff Upthrust: false breakout above distribution ceiling rejected back into range.';
  }
  return `Structural transition from ${from} to ${to} based on evolving price action and market structure.`;
}
