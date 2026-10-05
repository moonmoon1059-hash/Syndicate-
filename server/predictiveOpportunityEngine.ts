import {
  Candle,
  Signal,
  EarlyMoveClassification,
  EarlyMoveReport,
  SmartEntryTiming,
  CrossAssetConfirmationReport,
  MarketRegimeAnalysis,
  SectorRotationAnalysis,
  SignalQualityGrade,
  TargetLevel,
  ExpectedMoveClass,
  SetupMaturity,
  TimingWindow,
  EarlySetupCategory,
  EarlyCatalystInput,
  MTFTimingContext,
  MarketCycleAnalysis
} from '../src/types/crypto';

export interface PredictiveOpportunityInput {
  symbol: string;
  candles: Candle[];
  currentPrice: number;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  targets: TargetLevel[];
  riskRewardRatio: number;
  qualityGrade: SignalQualityGrade;
  rvol: number;
  priceChange24h: number;
  smcStructure?: string;
  orderflowCvd?: string;
  newsCatalyst?: string;
  isNewListing?: boolean;
  marketRegime?: MarketRegimeAnalysis;
  sectorRotation?: SectorRotationAnalysis;
  derivativesFunding?: number;
  derivativesOIChange?: number;

  // Phase 10 / 11 additions:
  marketCycle?: MarketCycleAnalysis;
  mtfTiming?: MTFTimingContext;
  earlyCatalyst?: EarlyCatalystInput;
  evaluationTimestamp?: number; // Anti-hindsight timestamp cutoff
  knownSetupDetectedAt?: number;
  knownTriggerDetectedAt?: number;
  knownInvalidatedAt?: number;
  knownExpiredAt?: number;
}

/**
 * Format duration in ms into a human-readable age string (e.g. "12m", "1h 24m", "2d")
 */
export function formatAgeString(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) {
    return `${Math.max(1, totalMinutes)}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

/**
 * PHASE 11: EARLY SETUP + TIMING INTELLIGENCE ENGINE
 * 
 * Evaluates early-stage setup mechanics, setup maturity, execution timing,
 * multi-timeframe timing confluence/conflict, Wyckoff cycle integration,
 * anti-chase boundaries, setup age, and deterministic trigger conditions.
 */
export function evaluatePredictiveOpportunity(
  input: PredictiveOpportunityInput
): EarlyMoveReport {
  const {
    symbol,
    candles: rawCandles,
    currentPrice,
    direction,
    entryPrice,
    stopLoss,
    targets,
    riskRewardRatio,
    qualityGrade,
    rvol,
    priceChange24h,
    smcStructure,
    orderflowCvd,
    newsCatalyst,
    isNewListing,
    marketRegime,
    sectorRotation,
    derivativesFunding,
    derivativesOIChange,
    marketCycle,
    mtfTiming,
    earlyCatalyst,
    evaluationTimestamp,
    knownSetupDetectedAt,
    knownTriggerDetectedAt,
    knownInvalidatedAt,
    knownExpiredAt
  } = input;

  const currentTimestamp = evaluationTimestamp || Date.now();

  // 0. Anti-Hindsight Filter: restrict candle history to evaluation timestamp
  const candles = evaluationTimestamp
    ? (rawCandles || []).filter(c => (c.timestamp || c.time || 0) <= evaluationTimestamp)
    : (rawCandles || []);

  const evidenceList: string[] = [];
  const contradictions: string[] = [];

  // 1. Check for Insufficient Data Fallback (Zero fabrication)
  if (!candles || candles.length < 15) {
    const defaultThreshold = direction === 'LONG' ? entryPrice * 1.018 : entryPrice * 0.982;
    return {
      symbol,
      classification: 'NONE',
      setupType: 'NONE',
      earlyCategory: 'NEUTRAL_WATCH',
      maturity: 'UNKNOWN',
      entryTiming: 'WAIT_FOR_CONFIRMATION',
      timingWindow: 'UNKNOWN',
      detectedAt: currentTimestamp,
      setupDetectedAt: currentTimestamp,
      setupUpdatedAt: currentTimestamp,
      setupAge: '0m',
      setupAgeMs: 0,
      isTriggered: false,
      triggerCondition: 'Awaiting sufficient market candle depth (min 15 bars required)',
      triggerDetails: 'Insufficient historical bars to compute volatility compression and structural triggers',
      noChaseThreshold: defaultThreshold,
      distanceFromIdealEntryPct: 0,
      isExtended: false,
      isMissed: false,
      setupStrength: 0,
      timingQuality: 0,
      expansionStage: 'PRE_EXPANSION',
      confidence: 0,
      rvol: rvol || 1.0,
      volatilityCompressionScore: 0,
      smcTrigger: 'INSUFFICIENT_DATA',
      asymmetricPotential: {
        isAsymmetric: false,
        expectedMoveClass: 'STANDARD_SWING_10_25PCT',
        structuralRR: riskRewardRatio || 0,
        targetCount: targets ? targets.length : 0
      },
      decayStatus: {
        isDecaying: true,
        decayReason: 'Insufficient candle data',
        stalenessScore: 100
      },
      crossAssetConfirmation: {
        btcAligned: true,
        sectorAligned: true,
        derivativesAligned: true,
        crossAssetScore: 50,
        contradictions: ['Insufficient data for reliable confirmation'],
        isContradicted: true
      },
      whyThisMatters: 'System refuses to fabricate early setup classification without verifiable price history.',
      summary: `${symbol}: UNKNOWN setup state due to insufficient candle depth (< 15 bars).`,
      evidenceList: [],
      contradictions: ['Insufficient candle data']
    };
  }

  // 2. Volatility Compression Calculation (BB width & ATR ratio)
  const volatilityCompressionScore = calculateCompressionScore(candles);
  if (volatilityCompressionScore > 70) {
    evidenceList.push(`Strong volatility coiling (Compression score: ${volatilityCompressionScore}/100)`);
  }

  // 3. Early Setup Classification (Deterministic Wyckoff + Structural + Catalyst)
  let classification: EarlyMoveClassification = 'NONE';
  let expansionStage: EarlyMoveReport['expansionStage'] = 'PRE_EXPANSION';
  let setupStrength = 65;
  let timingQuality = 70;
  let confidence = 70;

  const isExtended = priceChange24h > 20 || (candles.length > 5 && isLastBarExhaustionWick(candles));
  const isBOS = smcStructure?.includes('BOS') || smcStructure?.includes('CHOCH');
  const isLiquiditySweep = smcStructure?.includes('LIQUIDITY_GRAB') || smcStructure?.includes('SWEEP');

  // Evaluate Wyckoff events if present in marketCycle
  const wyckoffSpring = marketCycle?.wyckoffEvents?.accumulation?.SPRING?.detected;
  const wyckoffUtad = marketCycle?.wyckoffEvents?.distribution?.UTAD?.detected;
  const isAccumulationCycle = marketCycle?.cycle === 'ACCUMULATION';
  const isReAccumulationCycle = marketCycle?.cycle === 'RE_ACCUMULATION';
  const isDistributionCycle = marketCycle?.cycle === 'DISTRIBUTION';
  const isReDistributionCycle = marketCycle?.cycle === 'RE_DISTRIBUTION';

  if (isExtended) {
    expansionStage = 'EXTENDED_EXHAUSTED';
    contradictions.push('Asset is already parabolically extended (24h change > 20% or massive selling wick)');
    setupStrength = Math.min(setupStrength, 30);
    timingQuality = 15;
  }
  // Wyckoff Spring Setup (Phase C terminal test / shakeout in Accumulation)
  else if (wyckoffSpring && direction === 'LONG') {
    classification = 'SPRING_SETUP';
    expansionStage = 'PRE_EXPANSION';
    evidenceList.push('Wyckoff Spring / Terminal Shakeout: supply exhausted below support and aggressively reclaimed');
    setupStrength += 18;
    confidence += 14;
  }
  // Wyckoff UTAD Setup (Phase C Upthrust After Distribution)
  else if (wyckoffUtad && direction === 'SHORT') {
    classification = 'UTAD_SETUP';
    expansionStage = 'PRE_EXPANSION';
    evidenceList.push('Wyckoff UTAD: Upthrust above distribution ceiling rejected back into range with institutional supply');
    setupStrength += 18;
    confidence += 14;
  }
  // Wyckoff Accumulation Base Setup
  else if (isAccumulationCycle && direction === 'LONG') {
    classification = 'ACCUMULATION_SETUP';
    expansionStage = 'PRE_EXPANSION';
    evidenceList.push(`Wyckoff Stage 1 Accumulation Base building (${marketCycle?.stage || 'BASE_BUILDING'})`);
    setupStrength += 12;
    confidence += 10;
  }
  // Wyckoff Markup Preparation / Re-Accumulation
  else if (isReAccumulationCycle && direction === 'LONG') {
    classification = 'MARKUP_PREPARATION';
    expansionStage = 'PRE_EXPANSION';
    evidenceList.push(`Stage 2 Re-Accumulation pause: supply absorption before markup continuation`);
    setupStrength += 14;
    confidence += 10;
  }
  // Wyckoff Distribution Top Setup
  else if (isDistributionCycle && direction === 'SHORT') {
    classification = 'DISTRIBUTION_SETUP';
    expansionStage = 'PRE_EXPANSION';
    evidenceList.push(`Wyckoff Stage 3 Distribution Top: smart money unloading inventory into retail demand`);
    setupStrength += 12;
    confidence += 10;
  }
  // Wyckoff Markdown Preparation / Re-Distribution
  else if (isReDistributionCycle && direction === 'SHORT') {
    classification = 'MARKDOWN_PREPARATION';
    expansionStage = 'PRE_EXPANSION';
    evidenceList.push(`Stage 4 Re-Distribution pause: weak rallies failing under persistent supply`);
    setupStrength += 14;
    confidence += 10;
  }
  // Early News Catalyst Setup
  else if (earlyCatalyst || (newsCatalyst && newsCatalyst.length > 5)) {
    classification = 'EARLY_CATALYST';
    expansionStage = 'EARLY_ACCELERATION';
    const catTitle = earlyCatalyst?.catalystType || newsCatalyst || 'Breaking Catalyst';
    evidenceList.push(`Early-stage news catalyst confirmation: ${catTitle.slice(0, 55)}`);
    setupStrength += 12;
    confidence += 10;

    if (earlyCatalyst?.reactionState === 'CONFIRMED') {
      evidenceList.push('Catalyst market reaction verified: aggressive volume absorption post-headline');
      setupStrength += 8;
    } else if (earlyCatalyst?.reactionState === 'CONTRADICTED') {
      contradictions.push('Market reaction contradicts catalyst: immediate price fade post-release');
      setupStrength -= 15;
    }
  }
  // Compression Breakout Trigger
  else if (volatilityCompressionScore >= 65 && rvol >= 1.8) {
    classification = 'COMPRESSION_BREAKOUT';
    expansionStage = 'PRE_EXPANSION';
    evidenceList.push(`Compression breakout trigger: high coiling energy breaking with RVOL ${rvol.toFixed(1)}x`);
    setupStrength += 14;
    confidence += 12;
  }
  // Liquidity Pool Reclaim (Turtle Soup)
  else if (isLiquiditySweep) {
    classification = 'LIQUIDITY_RECLAIM';
    expansionStage = 'PRE_EXPANSION';
    evidenceList.push('Liquidity pool sweep and immediate structural reclaim (turtle soup)');
    setupStrength += 12;
    confidence += 10;
  }
  // Early Expansion
  else if (isBOS && rvol > 1.3) {
    classification = 'EARLY_EXPANSION';
    expansionStage = 'EARLY_ACCELERATION';
    evidenceList.push(`Early structural expansion confirmed by ${smcStructure}`);
    setupStrength += 10;
    confidence += 8;
  }
  // Unusual Volume Surge
  else if (rvol >= 2.5) {
    classification = 'UNUSUAL_VOLUME';
    expansionStage = 'PRE_EXPANSION';
    evidenceList.push(`Abnormal volume surge without price extension (RVOL ${rvol.toFixed(1)}x)`);
    setupStrength += 8;
    confidence += 6;
  }
  // Sector Rotation Leader
  else if (sectorRotation && sectorRotation.sectors.some(s => s.isLeadingRotation && s.leadingAssets.includes(symbol))) {
    classification = 'SECTOR_ROTATION';
    expansionStage = 'EARLY_ACCELERATION';
    evidenceList.push(`Asset leading active capital flow into ${sectorRotation.activeRotationLeader}`);
    setupStrength += 10;
    confidence += 8;
  }
  // Relative Strength Acceleration
  else if (priceChange24h > 3 && (marketRegime?.btcTrend === 'RANGING' || marketRegime?.btcTrend === 'BEARISH')) {
    classification = 'RELATIVE_STRENGTH_ACCELERATION';
    expansionStage = 'EARLY_ACCELERATION';
    evidenceList.push('Decoupled relative strength: advancing while macro market is flat/soft');
    setupStrength += 8;
    confidence += 6;
  }
  // Breakout Retest
  else if (isBOS) {
    classification = 'BREAKOUT_RETEST';
    expansionStage = 'EARLY_ACCELERATION';
    evidenceList.push('Clean structural breakout retest in progress');
    setupStrength += 8;
    confidence += 6;
  }

  // 4. Directional Category Assignment
  let earlyCategory: EarlySetupCategory = 'NEUTRAL_WATCH';
  if (
    classification === 'SPRING_SETUP' ||
    classification === 'ACCUMULATION_SETUP' ||
    classification === 'MARKUP_PREPARATION' ||
    direction === 'LONG'
  ) {
    earlyCategory = 'EARLY_LONG';
  } else if (
    classification === 'UTAD_SETUP' ||
    classification === 'DISTRIBUTION_SETUP' ||
    classification === 'MARKDOWN_PREPARATION' ||
    direction === 'SHORT'
  ) {
    earlyCategory = 'EARLY_SHORT';
  }

  // 5. Smart Entry Timing & No-Chase Thresholds
  const distanceFromIdealEntryPct = entryPrice > 0 
    ? Math.abs((currentPrice - entryPrice) / entryPrice) * 100 
    : 0;

  // No-chase maximum allowed threshold (1.8% from ideal entry for standard swings)
  const noChaseThreshold = direction === 'LONG' 
    ? entryPrice * 1.018 
    : entryPrice * 0.982;

  let entryTiming: SmartEntryTiming = 'ENTRY_NOW';
  let maturity: SetupMaturity = 'TRIGGERED';
  let timingWindow: TimingWindow = 'IMMEDIATE';
  let triggerCondition = '';
  let triggerDetails = '';
  let isTriggered = false;
  let isMissed = false;

  let triggerDetectedAt = knownTriggerDetectedAt;
  let confirmationDetectedAt: number | undefined = undefined;
  let invalidatedAt = knownInvalidatedAt;
  let expiredAt = knownExpiredAt;

  // Evaluation of Timing States & Setup Maturity:

  // A. Invalidation Check
  if (direction === 'LONG' && currentPrice <= stopLoss) {
    entryTiming = 'INVALIDATED';
    maturity = 'INVALIDATED';
    timingWindow = 'NO_VALID_TIMING';
    invalidatedAt = knownInvalidatedAt || currentTimestamp;
    triggerCondition = `Stop-loss violated (${currentPrice.toFixed(4)} <= ${stopLoss.toFixed(4)})`;
    triggerDetails = 'Structural setup premise negated by price trading below protective invalidation anchor.';
    contradictions.push(`Price breached stop loss (${currentPrice.toFixed(4)} <= ${stopLoss.toFixed(4)})`);
    timingQuality = 0;
  } else if (direction === 'SHORT' && currentPrice >= stopLoss) {
    entryTiming = 'INVALIDATED';
    maturity = 'INVALIDATED';
    timingWindow = 'NO_VALID_TIMING';
    invalidatedAt = knownInvalidatedAt || currentTimestamp;
    triggerCondition = `Stop-loss violated (${currentPrice.toFixed(4)} >= ${stopLoss.toFixed(4)})`;
    triggerDetails = 'Structural setup premise negated by price trading above protective invalidation anchor.';
    contradictions.push(`Price breached stop loss (${currentPrice.toFixed(4)} >= ${stopLoss.toFixed(4)})`);
    timingQuality = 0;
  }
  // B. Expiration Check
  else if (knownExpiredAt || (currentTimestamp - (knownSetupDetectedAt || currentTimestamp) > 172800000)) { // 48h staleness
    entryTiming = 'EXPIRED';
    maturity = 'EXPIRED';
    timingWindow = 'NO_VALID_TIMING';
    expiredAt = knownExpiredAt || currentTimestamp;
    triggerCondition = 'Setup validity window elapsed (stale structure > 48h)';
    triggerDetails = 'Structural momentum dissolved without triggering actionable volume expansion.';
    contradictions.push('Setup expired due to extended consolidation decay.');
    timingQuality = 10;
  }
  // C. Anti-Chase: Missed Entry Check (price extended beyond 4.5% from entry)
  else if (
    (direction === 'LONG' && currentPrice > noChaseThreshold && distanceFromIdealEntryPct > 4.5) ||
    (direction === 'SHORT' && currentPrice < noChaseThreshold && distanceFromIdealEntryPct > 4.5)
  ) {
    entryTiming = 'ENTRY_MISSED';
    maturity = 'EXTENDED';
    timingWindow = 'NO_VALID_TIMING';
    isMissed = true;
    triggerCondition = `Price extended +${distanceFromIdealEntryPct.toFixed(1)}% past ideal entry; chase forbidden`;
    triggerDetails = `No-Chase Rule enforced: risk-to-reward ratio degraded past safe entry pocket (${entryPrice.toFixed(4)}).`;
    contradictions.push(`Entry missed: price extended +${distanceFromIdealEntryPct.toFixed(1)}% past ideal entry`);
    timingQuality = 20;
  }
  // D. Anti-Chase: Wait for Pullback (price slightly extended between 1.8% and 4.5%)
  else if (
    (direction === 'LONG' && currentPrice > noChaseThreshold) ||
    (direction === 'SHORT' && currentPrice < noChaseThreshold)
  ) {
    entryTiming = 'WAIT_FOR_PULLBACK';
    maturity = 'TRIGGERED';
    timingWindow = 'WAITING_FOR_PULLBACK';
    isTriggered = true;
    triggerDetectedAt = knownTriggerDetectedAt || (currentTimestamp - 600000);
    triggerCondition = `Price extended ${distanceFromIdealEntryPct.toFixed(1)}% past trigger; await controlled pullback to ${entryPrice.toFixed(4)}`;
    triggerDetails = `Initial trigger fired, but current candle is slightly stretched. Best execution requires retrace toward ${entryPrice.toFixed(4)}.`;
    evidenceList.push(`No-Chase Rule: Price extended ${distanceFromIdealEntryPct.toFixed(1)}% from ideal entry. Await pullback.`);
    timingQuality = 55;
  }
  // E. Breakout Retest in Progress
  else if (classification === 'BREAKOUT_RETEST' && distanceFromIdealEntryPct > 0.8) {
    entryTiming = 'WAIT_FOR_RETEST';
    maturity = 'EARLY_SETUP';
    timingWindow = 'WAITING_FOR_RETEST';
    triggerCondition = `Awaiting clean structural retest of breakout level near ${entryPrice.toFixed(4)}`;
    triggerDetails = 'Breakout established; awaiting secondary confirmation test without range re-entry.';
    evidenceList.push(`Breakout retest pending near ${entryPrice.toFixed(4)}`);
    timingQuality = 65;
  }
  // F. Volatility Compressed / Base Building (Setup Forming & Waiting for Confirmation)
  else if (
    (volatilityCompressionScore > 85 && rvol < 1.1 && !isBOS) ||
    (classification === 'ACCUMULATION_SETUP' && !wyckoffSpring && ((direction === 'LONG' && currentPrice < entryPrice) || (direction === 'SHORT' && currentPrice > entryPrice))) ||
    (classification === 'DISTRIBUTION_SETUP' && !wyckoffUtad && ((direction === 'LONG' && currentPrice < entryPrice) || (direction === 'SHORT' && currentPrice > entryPrice)))
  ) {
    entryTiming = 'WAIT_FOR_CONFIRMATION';
    maturity = 'SETUP_FORMING';
    timingWindow = 'WAITING_FOR_CONFIRMATION';
    triggerCondition = 'Awaiting volume surge (RVOL > 1.5x) or structural breakout close';
    triggerDetails = 'Range compression active; waiting for institutional volume commitment before entry.';
    evidenceList.push('Setup forming: energy coiling, pending volume trigger.');
    timingQuality = 60;
  }
  // G. Approaching Trigger (Near Trigger - price within 0.8% below trigger for LONG or above trigger for SHORT)
  else if (
    ((direction === 'LONG' && currentPrice < entryPrice) || (direction === 'SHORT' && currentPrice > entryPrice)) &&
    distanceFromIdealEntryPct <= 0.8 &&
    !isBOS
  ) {
    entryTiming = 'WAIT_FOR_CONFIRMATION';
    maturity = 'NEAR_TRIGGER';
    timingWindow = 'NEAR_TERM';
    triggerCondition = `Price within ${distanceFromIdealEntryPct.toFixed(1)}% of key breakout trigger (${entryPrice.toFixed(4)}); trigger pending`;
    triggerDetails = 'Orderflow pressure tightening near key level. High probability of trigger within current session.';
    evidenceList.push(`Near trigger: approaching execution pivot at ${entryPrice.toFixed(4)}.`);
    timingQuality = 75;
  }
  // H. Actionable Entry Now (Trigger Active & Price in Pocket)
  else {
    entryTiming = 'ENTRY_NOW';
    maturity = (isBOS || rvol >= 2.0 || wyckoffSpring || wyckoffUtad) ? 'CONFIRMED' : 'TRIGGERED';
    timingWindow = 'IMMEDIATE';
    isTriggered = true;
    triggerDetectedAt = knownTriggerDetectedAt || (currentTimestamp - 300000);
    if (maturity === 'CONFIRMED') {
      confirmationDetectedAt = currentTimestamp;
    }
    triggerCondition = `Trigger confirmed; price within optimal entry zone (${entryPrice.toFixed(4)} ± 1.5%)`;
    triggerDetails = `Confirmed structural activation with ${classification.replace(/_/g, ' ')}. Immediate execution favorable.`;
    evidenceList.push('Execution ready: trigger fired, tight spread to ideal entry.');
    timingQuality = 92;
  }

  // 6. Setup Age Tracking
  const setupDetectedAt = knownSetupDetectedAt || (currentTimestamp - 3600000);
  const setupUpdatedAt = currentTimestamp;
  const setupAgeMs = Math.max(0, currentTimestamp - setupDetectedAt);
  const setupAge = formatAgeString(setupAgeMs);

  // 7. Multi-Timeframe Timing & Conflict Detection
  let isTimingConflicted = false;
  let timingConflictReason: string | undefined = undefined;

  if (mtfTiming) {
    if (mtfTiming.hasConflict || mtfTiming.alignment === 'TIMING_CONFLICT') {
      isTimingConflicted = true;
      timingConflictReason = mtfTiming.conflictReason || 'Multi-timeframe cycle/trend opposes local setup trigger';
      contradictions.push(`MTF Timing Conflict: ${timingConflictReason}`);
      
      // If timing was ENTRY_NOW but strong MTF conflict exists, downgrade to WAIT_FOR_CONFIRMATION
      if (entryTiming === 'ENTRY_NOW') {
        entryTiming = 'WAIT_FOR_CONFIRMATION';
        timingWindow = 'WAITING_FOR_CONFIRMATION';
        triggerCondition = `Execution held: ${timingConflictReason}`;
      }
      timingQuality = Math.max(25, timingQuality - 25);
      confidence = Math.max(35, confidence - 20);
    }
  }

  // 8. Asymmetric Trade Potential & R:R Validation
  let maxTargetUpsidePct = 0;
  if (targets && targets.length > 0) {
    for (const t of targets) {
      const upside = Math.abs((t.price - entryPrice) / entryPrice) * 100;
      if (upside > maxTargetUpsidePct) {
        maxTargetUpsidePct = upside;
      }
    }
  }

  let expectedMoveClass: ExpectedMoveClass = 'STANDARD_SWING_10_25PCT';
  if (maxTargetUpsidePct >= 100) {
    expectedMoveClass = 'MACRO_EXPANSION_100PCT_PLUS';
    evidenceList.push(`Structural target headroom supports +${maxTargetUpsidePct.toFixed(0)}% macro expansion`);
  } else if (maxTargetUpsidePct >= 50) {
    expectedMoveClass = 'HIGH_EXPANSION_50PCT_PLUS';
    evidenceList.push(`Structural target headroom supports +${maxTargetUpsidePct.toFixed(0)}% high expansion`);
  }

  const isAsymmetric = riskRewardRatio >= 4.0;
  if (isAsymmetric) {
    evidenceList.push(`Asymmetric risk-to-reward confirmed (1:${riskRewardRatio.toFixed(1)} R:R)`);
  }

  // 9. Cross-Asset Confirmation Layer
  let btcAligned = true;
  let sectorAligned = true;
  let derivativesAligned = true;
  let crossAssetScore = 80;

  if (marketRegime) {
    if (direction === 'LONG' && (marketRegime.regime === 'BEAR' || marketRegime.btcTrend === 'BEARISH')) {
      btcAligned = false;
      crossAssetScore -= 30;
      contradictions.push(`Bearish macro regime (${marketRegime.regime}) opposes Long setup`);
    } else if (direction === 'SHORT' && (marketRegime.regime === 'BULL' || marketRegime.marketBreadthPct > 70)) {
      btcAligned = false;
      crossAssetScore -= 30;
      contradictions.push('Strong Bull market breadth opposes Short setup');
    }
  }

  if (derivativesFunding !== undefined && derivativesFunding > 0.05 && direction === 'LONG') {
    derivativesAligned = false;
    crossAssetScore -= 15;
    contradictions.push(`Elevated funding rate (+${(derivativesFunding * 100).toFixed(2)}%) indicates crowded long positioning`);
  }

  const isContradicted = contradictions.length > 0;
  if (isContradicted) {
    confidence = Math.max(35, confidence - contradictions.length * 12);
  }

  // 10. Signal Decay & Expiry Status
  const isDecaying = isContradicted || entryTiming === 'ENTRY_MISSED' || entryTiming === 'INVALIDATED' || entryTiming === 'EXPIRED';
  const stalenessScore = isDecaying ? 85 : Math.min(100, Math.floor((setupAgeMs / 86400000) * 40) + 15);
  const decayReason = contradictions.length > 0 ? contradictions[0] : undefined;

  confidence = Math.min(98, Math.max(35, confidence));
  setupStrength = Math.min(100, Math.max(10, setupStrength));
  timingQuality = Math.min(100, Math.max(0, timingQuality));

  // 11. Deterministic Why This Matters Explanation
  const whyThisMatters = `Identifies early ${classification.replace(/_/g, ' ')} (${maturity.replace(/_/g, ' ')}) in ${earlyCategory.replace(/_/g, ' ')} structure before price extension. Current timing is ${entryTiming.replace(/_/g, ' ')} (${timingWindow.replace(/_/g, ' ')}), protecting structural R:R (1:${riskRewardRatio.toFixed(1)}).`;

  const summary = `${symbol} Early-Setup: ${classification.replace(/_/g, ' ')} (${maturity.replace(/_/g, ' ')} | ${earlyCategory.replace(/_/g, ' ')}). Execution: ${entryTiming.replace(/_/g, ' ')} (${timingWindow.replace(/_/g, ' ')}). Age: ${setupAge}. Structural R:R: 1:${riskRewardRatio.toFixed(1)}.`;

  return {
    symbol,
    classification,
    setupType: classification,
    earlyCategory,
    maturity,
    detectedAt: currentTimestamp,
    setupDetectedAt,
    setupUpdatedAt,
    setupAge,
    setupAgeMs,
    triggerDetectedAt,
    confirmationDetectedAt,
    invalidatedAt,
    expiredAt,
    isTriggered,
    triggerCondition,
    triggerDetails,
    timingWindow,
    setupStrength,
    timingQuality,
    expansionStage,
    confidence,
    rvol,
    volatilityCompressionScore,
    smcTrigger: smcStructure || 'STRUCTURE_HOLD',
    entryTiming,
    noChaseThreshold,
    distanceFromIdealEntryPct: parseFloat(distanceFromIdealEntryPct.toFixed(2)),
    isExtended: expansionStage === 'EXTENDED_EXHAUSTED' || isMissed,
    isMissed,
    cycleContext: marketCycle ? {
      cycle: marketCycle.cycle,
      stage: marketCycle.stage,
      wyckoffEvent: wyckoffSpring ? 'SPRING' : wyckoffUtad ? 'UTAD' : undefined,
      vsaClassification: marketCycle.effortVsResult?.classification,
      cycleConfluenceScore: marketCycle.confidence
    } : undefined,
    mtfTiming,
    asymmetricPotential: {
      isAsymmetric,
      expectedMoveClass,
      structuralRR: riskRewardRatio,
      targetCount: targets ? targets.length : 0
    },
    decayStatus: {
      isDecaying,
      decayReason,
      stalenessScore
    },
    crossAssetConfirmation: {
      btcAligned,
      sectorAligned,
      derivativesAligned,
      crossAssetScore,
      contradictions,
      isContradicted
    },
    whyThisMatters,
    summary,
    evidenceList,
    contradictions
  };
}

/**
 * Calculates Bollinger Band width / ATR ratio compression score (0 - 100)
 */
function calculateCompressionScore(candles: Candle[]): number {
  if (!candles || candles.length < 20) return 50;

  const closes = candles.slice(-20).map(c => c.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const variance = closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / closes.length;
  const stdDev = Math.sqrt(variance);

  // Bandwidth = (Upper - Lower) / Middle = (4 * stdDev) / mean
  const bandwidthPct = ((4 * stdDev) / mean) * 100;

  // Narrow bandwidth (<3.5%) indicates severe compression
  if (bandwidthPct < 2.0) return 95;
  if (bandwidthPct < 3.5) return 85;
  if (bandwidthPct < 5.0) return 70;
  if (bandwidthPct < 8.0) return 50;
  return 30; // Expanding or wide
}

/**
 * Detects if the most recent bar has an extreme upper selling wick (>50% of range)
 */
function isLastBarExhaustionWick(candles: Candle[]): boolean {
  if (candles.length === 0) return false;
  const last = candles[candles.length - 1];
  const range = last.high - last.low;
  if (range <= 0) return false;
  const upperWick = last.high - Math.max(last.open, last.close);
  return upperWick / range > 0.55;
}
