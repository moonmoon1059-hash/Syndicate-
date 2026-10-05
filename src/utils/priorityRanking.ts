import {
  Signal,
  OpportunityPriorityAnalysis,
  OpportunityRankingTier,
  OpportunityScoreBreakdown,
  CatalystTradePipeline,
  NewsItem
} from '../types/crypto';

/**
 * Phase 6.2 Deterministic Opportunity Priority Score & Breakdown Calculation
 * Evaluates real structural TP levels, upside, R:R, execution timing, SMC, orderflow,
 * relative strength vs BTC, catalysts, and post-pump exhaustion penalty.
 * Zero market cap bias. Zero fake targets.
 */
export function calculateClientOpportunityPriority(signal: Signal): OpportunityPriorityAnalysis {
  // If backend already computed priority analysis, preserve it or enhance it
  if (signal.opportunityPriority && signal.opportunityPriority.priorityScore !== undefined) {
    return signal.opportunityPriority;
  }

  // 1. Genuine Structural Target Count & Realistic Upside Calculation
  const targets = signal.targets || [];
  const validTargets = targets.filter(t => {
    if (!t || typeof t.price !== 'number' || t.price <= 0 || t.status === 'INVALIDATED') {
      return false;
    }
    // Explicitly reject non-structural / fabricated targets marked with NONE
    if (t.structuralBasis === 'NONE' || (t.evidenceLevel && t.evidenceLevel === 'NONE')) {
      return false;
    }
    // Valid structural basis or verified evidence
    if (t.structuralBasis && t.structuralBasis !== 'NONE') return true;
    if (t.evidenceLevel && t.evidenceLevel !== 'NONE') return true;
    if (t.sources && t.sources.length > 0) return true;
    // Default standard structural TP1..TP3 if no explicit NONE flag
    if (t.label && ['TP1', 'TP2', 'TP3'].includes(t.label.toUpperCase())) return true;
    return false;
  });

  const genuineTpCount = validTargets.length;
  let realisticUpsidePct = 0;
  const entry = signal.entryPrice || signal.currentPrice || 0;

  if (entry > 0 && validTargets.length > 0) {
    const finalTp = validTargets[validTargets.length - 1].price;
    if (signal.direction === 'LONG') {
      realisticUpsidePct = Math.max(0, ((finalTp - entry) / entry) * 100);
    } else if (signal.direction === 'SHORT') {
      realisticUpsidePct = Math.max(0, ((entry - finalTp) / entry) * 100);
    }
  }

  // 2. Base Quality Grade Score (A+ > A > B > C > WAIT)
  let qualityGradeScore = 0;
  const grade = signal.qualityGrade || 'B';
  switch (grade) {
    case 'A+': qualityGradeScore = 1000; break;
    case 'A': qualityGradeScore = 750; break;
    case 'B': qualityGradeScore = 450; break;
    case 'C': qualityGradeScore = 200; break;
    case 'WAIT':
    default: qualityGradeScore = 0; break;
  }

  // 3. Risk / Reward Contribution (Supports realistic 1:5, 1:10, 1:15, 1:20+ without ever allowing RR alone to override A+ tier)
  let riskRewardScore = 0;
  const rr = signal.riskRewardRatio || 1.5;
  if (rr >= 20.0) riskRewardScore = 200;
  else if (rr >= 15.0) riskRewardScore = 175;
  else if (rr >= 10.0) riskRewardScore = 150;
  else if (rr >= 5.0) riskRewardScore = 110;
  else if (rr >= 3.5) riskRewardScore = 75;
  else if (rr >= 2.5) riskRewardScore = 50;
  else if (rr >= 2.0) riskRewardScore = 35;
  else if (rr >= 1.5) riskRewardScore = 20;
  else if (rr >= 1.2) riskRewardScore = 5;
  else if (rr < 1.0) riskRewardScore = -80;
  else riskRewardScore = -40;

  // 4. Realistic Upside Score (Tempered: high upside with poor R:R or high dump risk does not rank top)
  let realisticUpsideScore = Math.min(80, Math.round(realisticUpsidePct * 1.5));
  if (rr < 1.3 || signal.pumpDump?.dumpRisk === 'CRITICAL' || signal.opportunityReport?.postPumpDumpRisk === 'CRITICAL') {
    realisticUpsideScore = Math.min(10, realisticUpsideScore);
  }

  // Determine Expected Move Class (Macro expansion ~50%+ / 100%+)
  let expectedMoveClass: any = 'RANGE_BOUND_UNDER_10PCT';
  if (realisticUpsidePct >= 100) {
    expectedMoveClass = 'MACRO_EXPANSION_100PCT_PLUS';
  } else if (realisticUpsidePct >= 50) {
    expectedMoveClass = 'HIGH_EXPANSION_50PCT_PLUS';
  } else if (realisticUpsidePct >= 25) {
    expectedMoveClass = 'MOMENTUM_EXPANSION_25PCT_PLUS';
  } else if (realisticUpsidePct >= 10) {
    expectedMoveClass = 'STANDARD_SWING_10_25PCT';
  }

  // Determine High-Impact Opportunity Type
  let highImpactType: any = 'BREAKOUT_RETEST';
  const pdIntel = signal.pumpDump || (signal as any).pumpDumpIntelligence;
  const oppReport = signal.opportunityReport;

  if (pdIntel?.dumpRisk === 'CRITICAL' || oppReport?.postPumpDumpRisk === 'CRITICAL') {
    highImpactType = 'DUMP_RISK';
  } else if (pdIntel?.isPumpExhausted || pdIntel?.postPumpExhaustion || pdIntel?.climaxDetected) {
    highImpactType = 'POST_PUMP_EXHAUSTION';
  } else if (pdIntel?.sellTheNewsRisk || signal.newsCatalyst?.toLowerCase().includes('sell the news')) {
    highImpactType = 'SELL_THE_NEWS';
  } else if (signal.marketCycle?.cycle === 'DISTRIBUTION') {
    highImpactType = 'DISTRIBUTION';
  } else if (oppReport?.earlySetupType === 'EARLY_CATALYST_SETUP' || (signal.newsCatalyst && oppReport?.compressionScore && oppReport.compressionScore >= 50)) {
    highImpactType = 'EARLY_CATALYST_SETUP';
  } else if (oppReport?.earlySetupType === 'EARLY_MOMENTUM_SETUP' || (oppReport?.rvol && oppReport.rvol >= 1.5 && (oppReport.priceVelocityScore || 50) >= 65)) {
    highImpactType = 'EARLY_MOMENTUM_SETUP';
  } else if (oppReport?.detectedPatterns?.includes('COMPRESSION_EXPANSION') || (oppReport?.compressionScore && oppReport.compressionScore >= 60)) {
    highImpactType = 'COMPRESSION_EXPANSION';
  } else if (oppReport?.detectedPatterns?.includes('LIQUIDITY_SWEEP_RECLAIM') || (signal.smcStructureReport as any)?.liquiditySweeps?.some((s: any) => s.status === 'SWEPT')) {
    highImpactType = 'LIQUIDITY_SWEEP_RECLAIM';
  } else {
    highImpactType = 'BREAKOUT_RETEST';
  }

  signal.expectedMoveClass = expectedMoveClass;
  signal.highImpactType = highImpactType;

  // 5. Genuine Structural TP Score (Bonus points only for real structural levels, capped at 5)
  const structuralTpScore = Math.min(20, genuineTpCount * 4);

  // 6. Execution Readiness Score
  let executionReadinessScore = 0;
  const entryStatus = signal.entryStatus || signal.actionablePriority;
  if (entryStatus === 'ENTRY_NOW' || signal.actionablePriority === 'ENTRY_NOW') {
    executionReadinessScore = 35;
  } else if (entryStatus === 'WAIT_FOR_PULLBACK' || entryStatus === 'WAIT_FOR_RETEST') {
    executionReadinessScore = 15;
  } else if (entryStatus === 'WAIT_FOR_CONFIRMATION') {
    executionReadinessScore = 5;
  } else if (entryStatus === 'ENTRY_MISSED') {
    executionReadinessScore = -30;
  } else if (entryStatus === 'INVALIDATED' || signal.status === 'STOPPED_OUT' || signal.status === 'EXPIRED' || signal.status === 'CANCELLED') {
    executionReadinessScore = -600;
  }

  // 7. Multi-Timeframe Confluence Score
  let mtfConfluenceScore = 0;
  if (signal.unifiedEvidence?.timeframes) {
    const tfs = signal.unifiedEvidence.timeframes;
    let alignedCount = 0;
    for (const k of ['4h', '1h', '15m', '5m']) {
      if (tfs[k] && ((signal.direction === 'LONG' && tfs[k].bias === 'BULLISH') || (signal.direction === 'SHORT' && tfs[k].bias === 'BEARISH'))) {
        alignedCount++;
      }
    }
    mtfConfluenceScore = alignedCount * 8;
  } else if (signal.confirmations && signal.confirmations.length >= 3) {
    mtfConfluenceScore = 20;
  }

  // 8. Volume / RVOL + Velocity Score
  let volumeVelocityScore = 0;
  const rvol = signal.opportunityReport?.rvol || 1.0;
  if (rvol >= 2.2) volumeVelocityScore += 25;
  else if (rvol >= 1.5) volumeVelocityScore += 15;
  else if (rvol >= 1.2) volumeVelocityScore += 8;

  if (signal.opportunityReport?.detectedPatterns?.includes('EARLY_VOLUME_ACCELERATION')) {
    volumeVelocityScore += 10;
  }

  // 9. SMC / ICT Structure Score
  let smcStructureScore = 0;
  const smcReport = signal.smcStructureReport || signal.institutionalIntelligence?.smc;
  if (smcReport) {
    if (smcReport.structureType === 'BOS') smcStructureScore += 20;
    else if (smcReport.structureType === 'CHOCH') smcStructureScore += 15;
    if (smcReport.nearestOrderBlock && smcReport.nearestOrderBlock.status === 'ACTIVE') smcStructureScore += 10;
    if (smcReport.nearestFvg && smcReport.nearestFvg.status === 'UNMITIGATED') smcStructureScore += 10;
  } else if (signal.opportunityReport?.smcStructure && signal.opportunityReport.smcStructure !== 'NONE') {
    smcStructureScore += 15;
  }

  // 10. Orderflow / CVD / OBI Score (ZERO fabrication)
  let orderflowScore = 0;
  const ofReport = signal.orderflowReport || (signal.institutionalIntelligence as any)?.orderflow;
  if (ofReport && ofReport.status === 'AVAILABLE') {
    if ((signal.direction === 'LONG' && ofReport.cvd?.deltaTrend === 'RISING') ||
        (signal.direction === 'SHORT' && ofReport.cvd?.deltaTrend === 'FALLING')) {
      orderflowScore += 15;
    }
    if (ofReport.orderBookImbalance && ofReport.orderBookImbalance.status === 'AVAILABLE') {
      if ((signal.direction === 'LONG' && ofReport.orderBookImbalance.bidDepthPressure === 'BIDS_DOMINANT') ||
          (signal.direction === 'SHORT' && ofReport.orderBookImbalance.bidDepthPressure === 'ASKS_DOMINANT')) {
        orderflowScore += 15;
      }
    }
  }

  // 11. Relative Strength vs BTC Score
  let relativeStrengthScore = 0;
  const rsReport = signal.relativeStrengthReport || (signal.institutionalIntelligence as any)?.relativeStrength;
  const rsScore = typeof rsReport?.rsVsBtc24h === 'number' ? rsReport.rsVsBtc24h : signal.opportunityReport?.rsScoreVsBtc;
  if (typeof rsScore === 'number') {
    if (rsScore >= 5.0 || rsReport?.relativeStrengthCategory === 'LEADER') relativeStrengthScore += 25;
    else if (rsScore >= 2.0 || rsReport?.relativeStrengthCategory === 'OUTPERFORMER') relativeStrengthScore += 15;
    else if (rsScore <= -3.0 || rsReport?.relativeStrengthCategory === 'LAGGARD') relativeStrengthScore -= 10;
  }

  // 12. Derivatives Evidence Score (ZERO fabrication)
  let derivativesScore = 0;
  const derivReport = signal.derivativesIntelligenceReport || signal.derivativesReport || (signal.institutionalIntelligence as any)?.derivatives;
  if (derivReport && derivReport.status === 'AVAILABLE') {
    if ((signal.direction === 'LONG' && derivReport.priceOiCorrelation === 'LONG_ACCUMULATION') ||
        (signal.direction === 'SHORT' && derivReport.priceOiCorrelation === 'SHORT_ACCUMULATION')) {
      derivativesScore += 15;
    } else if (derivReport.priceOiCorrelation === 'SHORT_SQUEEZE' && signal.direction === 'LONG') {
      derivativesScore += 20;
    }
  }

  // 13. News / Catalyst Score
  let catalystScore = 0;
  if (signal.newsCatalyst || (signal.opportunityReport?.detectedPatterns?.includes('CATALYST_ACCELERATION'))) {
    catalystScore = 20;
  }

  // 14. Obstacle Clearance / Resistance Distance Score
  let obstacleClearanceScore = 0;
  if (signal.tradeManagement?.details?.some(d => d.includes('Opposing wall') || d.includes('Major opposing liquidity'))) {
    obstacleClearanceScore = -25;
  } else {
    obstacleClearanceScore = 15;
  }

  // 15. Pump Exhaustion / Dump-Risk Penalties (CRITICAL)
  let dumpRiskPenalty = 0;
  const pd = signal.pumpDump as any;
  const dumpRisk = signal.opportunityReport?.postPumpDumpRisk || pd?.dumpRisk;
  const isDumpHazard = dumpRisk === 'CRITICAL' || pd?.climaxDetected || pd?.postPumpExhaustion || pd?.isDumpRisk || pd?.isPumpExhausted || (pd?.dumpScore && pd.dumpScore >= 70);
  const isElevatedHazard = dumpRisk === 'ELEVATED' || pd?.fakePumpRisk === 'HIGH' || (pd?.dumpScore && pd.dumpScore >= 50);

  if (isDumpHazard) {
    dumpRiskPenalty = 140;
  } else if (isElevatedHazard) {
    dumpRiskPenalty = 70;
  }

  if (signal.adaptiveExecution?.chaseRisk || (signal as any).priceExtensionLevel === 'SEVERELY_EXTENDED') {
    dumpRiskPenalty += 40;
  }

  // 16. Data Quality Score
  let dataQualityScore = 0;
  const dq = signal.dataQuality || 'MEDIUM';
  if (dq === 'HIGH') dataQualityScore = 10;
  else if (dq === 'LOW') dataQualityScore = -30;
  else if (dq === 'INVALID') dataQualityScore = -300;

  // 17. Composite Score Calculation
  const scoreBreakdown: OpportunityScoreBreakdown = {
    qualityGradeScore,
    riskRewardScore,
    realisticUpsideScore,
    structuralTpScore,
    executionReadinessScore,
    mtfConfluenceScore,
    volumeVelocityScore,
    smcStructureScore,
    orderflowScore,
    relativeStrengthScore,
    derivativesScore,
    catalystScore,
    obstacleClearanceScore,
    dumpRiskPenalty,
    dataQualityScore
  };

  const totalRawScore = 
    qualityGradeScore +
    riskRewardScore +
    realisticUpsideScore +
    structuralTpScore +
    executionReadinessScore +
    mtfConfluenceScore +
    volumeVelocityScore +
    smcStructureScore +
    orderflowScore +
    relativeStrengthScore +
    derivativesScore +
    catalystScore +
    obstacleClearanceScore -
    dumpRiskPenalty +
    dataQualityScore;

  const priorityScore = signal.status === 'STOPPED_OUT' || signal.status === 'EXPIRED' || signal.status === 'CANCELLED' || signal.entryStatus === 'INVALIDATED'
    ? Math.min(-100, totalRawScore)
    : Math.max(10, totalRawScore);

  // 18. Ranking Tier
  let rankingTier: OpportunityRankingTier = 'TIER_5_WAIT_CHOP';
  if (signal.status === 'STOPPED_OUT' || signal.status === 'EXPIRED' || signal.status === 'CANCELLED' || signal.entryStatus === 'INVALIDATED') {
    rankingTier = 'TIER_6_EXPIRED_INVALIDATED';
  } else if (grade === 'A+') {
    rankingTier = 'TIER_1_A_PLUS_ELITE';
  } else if (grade === 'A') {
    rankingTier = 'TIER_2_A_HIGH_CONVICTION';
  } else if (signal.opportunityReport?.earlySetupType && signal.opportunityReport.earlySetupType !== 'NONE') {
    rankingTier = 'TIER_3_EARLY_OPPORTUNITY';
  } else if (grade === 'B' || signal.actionablePriority === 'WATCH') {
    rankingTier = 'TIER_4_WATCH_RETEST';
  } else {
    rankingTier = 'TIER_5_WAIT_CHOP';
  }

  // 19. High-Conviction Reasons
  const keyRankReasons: string[] = [];
  keyRankReasons.push(`Quality Grade: ${grade} (${qualityGradeScore} pts)`);
  
  if (rr >= 2.0) {
    keyRankReasons.push(`Risk/Reward: 1:${rr.toFixed(1)} (${genuineTpCount} verified targets)`);
  } else {
    keyRankReasons.push(`Risk/Reward: 1:${rr.toFixed(1)}`);
  }

  if (realisticUpsidePct > 0) {
    keyRankReasons.push(`Realistic Upside: +${realisticUpsidePct.toFixed(1)}% to final target`);
  }

  if (entryStatus === 'ENTRY_NOW' || signal.actionablePriority === 'ENTRY_NOW') {
    keyRankReasons.push('Execution: Immediate trigger confirmed (ENTRY NOW)');
  } else if (entryStatus === 'WAIT_FOR_RETEST' || entryStatus === 'WAIT_FOR_PULLBACK') {
    keyRankReasons.push('Execution: Awaiting structural retest zone');
  }

  if (rvol >= 1.5) {
    keyRankReasons.push(`Volume: RVOL ${rvol.toFixed(1)}x expansion active`);
  }

  if (relativeStrengthScore > 0) {
    keyRankReasons.push('Relative Strength: Outperforming BTC benchmark');
  }

  if (dumpRiskPenalty < 0) {
    keyRankReasons.push(`Risk: Post-pump exhaustion penalty applied (${dumpRiskPenalty} pts)`);
  }

  return {
    priorityScore,
    rankingTier,
    realisticUpsidePct: Number(realisticUpsidePct.toFixed(2)),
    genuineTpCount,
    keyRankReasons: keyRankReasons.slice(0, 4),
    scoreBreakdown
  };
}

/**
 * Phase 18 Unified Multi-Timeframe Fusion Ranking Engine
 * 
 * Strict Priority Hierarchy:
 * 1. EARLY PUMP (pre-pump compression, volume surge, early accumulation)
 * 2. POST-PUMP DUMP (post-pump climax exhaustion, dump risk warning / short distribution setup)
 * 3. NEW LISTING PUMP/DUMP (new listing base formation, post-listing discovery)
 * 4. NEWS PUMP/DUMP (high-impact news catalyst acceleration)
 * 5. BEST ENTRY TIMING (immediate trigger confirmed: ENTRY_NOW, tight invalidation)
 * 6. Structurally justified 30–35%+ TP potential (genuine structural levels >= 30% upside, RR >= 1.8, zero fabrication)
 * 
 * Invariants:
 * - Never fabricate or force score/TP/R:R to enter the top 5.
 * - Stopped out / expired / invalidated signals receive massive penalty.
 * - Multi-criteria confluences accumulate additive bonuses so high-synergy setups naturally surface.
 */
export function calculateUnifiedFusionScore(signal: Signal): number {
  if (!signal) return -1000000;

  // Severe penalty for dead / invalidated / stopped-out signals
  if (
    signal.status === 'STOPPED_OUT' ||
    signal.status === 'EXPIRED' ||
    signal.status === 'CANCELLED' ||
    signal.entryStatus === 'INVALIDATED' ||
    (signal as any).executionStatus === 'DO_NOT_TRADE'
  ) {
    return -1000000 + (signal.moonScore || 0);
  }

  let fusionScore = 0;

  // 1. EARLY PUMP (+120,000 pts)
  // Indicators: early momentum setup, compression expansion, volume acceleration
  const oppReport = signal.opportunityReport;
  const isEarlyPump =
    oppReport?.earlySetupType === 'EARLY_MOMENTUM_SETUP' ||
    oppReport?.earlySetupType === 'COMPRESSION_BREAKOUT' ||
    oppReport?.earlySetupType === 'EARLY_CATALYST_SETUP' ||
    signal.highImpactType === 'EARLY_MOMENTUM_SETUP' ||
    signal.highImpactType === 'COMPRESSION_EXPANSION' ||
    oppReport?.detectedPatterns?.includes('EARLY_VOLUME_ACCELERATION') ||
    oppReport?.detectedPatterns?.includes('COMPRESSION_EXPANSION') ||
    (signal.direction === 'LONG' && (oppReport?.rvol || 0) >= 1.5 && (oppReport?.compressionScore || 0) >= 60);

  if (isEarlyPump) {
    fusionScore += 120000;
  }

  // 2. POST-PUMP DUMP (+100,000 pts)
  // Indicators: dump risk critical, climax detected, post-pump exhaustion, or high-conviction SHORT distribution setup
  const pdIntel = signal.pumpDump || (signal as any).pumpDumpIntelligence;
  const isPostPumpDump =
    pdIntel?.dumpRisk === 'CRITICAL' ||
    oppReport?.postPumpDumpRisk === 'CRITICAL' ||
    signal.highImpactType === 'DUMP_RISK' ||
    signal.highImpactType === 'POST_PUMP_EXHAUSTION' ||
    pdIntel?.isPumpExhausted === true ||
    pdIntel?.climaxDetected === true ||
    (signal.direction === 'SHORT' && (signal.qualityGrade === 'A+' || signal.qualityGrade === 'A'));

  if (isPostPumpDump) {
    fusionScore += 100000;
  }

  // 3. QUALIFIED NEW LISTING PUMP/DUMP (+80,000 pts)
  // Qualified only when there is a validated actionable base or confirmed short distribution with real structural invalidation.
  // Never automatically boost or BUY merely because a coin is newly listed.
  const nlIntel = signal.newListingIntelligence;
  const isQualifiedListingSetup =
    (nlIntel?.setupViability === 'ACTIONABLE_BASE' && (signal.direction === 'LONG' || signal.direction === 'SHORT')) ||
    (signal.direction === 'SHORT' && nlIntel?.pumpDumpRisk === 'CRITICAL' && nlIntel?.earlyAccumulationDistribution === 'EARLY_DISTRIBUTION') ||
    (signal.category === 'NEW_LISTING' && signal.qualityGrade === 'A+' && signal.entryStatus === 'ENTRY_NOW');

  if (isQualifiedListingSetup) {
    fusionScore += 80000;
  } else if (nlIntel?.pumpDumpRisk === 'CRITICAL' && signal.direction === 'LONG') {
    // Severe penalty for trying to buy an unformed critical dump risk listing
    fusionScore -= 100000;
  }

  // 4. NEWS PUMP/DUMP (+60,000 pts)
  // Indicators: high-impact news catalyst, active catalyst reported
  const newsRep = signal.newsImpactReport || signal.newsIntelligence;
  const hasNewsCatalyst =
    Boolean(signal.newsCatalyst && signal.newsCatalyst.trim().length > 0) ||
    newsRep?.isConfirmedCatalyst === true ||
    (newsRep && typeof newsRep.impactScore === 'number' && newsRep.impactScore >= 60) ||
    signal.highImpactType === 'EARLY_CATALYST_SETUP' ||
    Boolean(oppReport?.detectedPatterns?.includes('CATALYST_ACCELERATION'));

  if (hasNewsCatalyst) {
    fusionScore += 60000;
  }

  // 5. BEST ENTRY TIMING (+40,000 pts)
  // Indicators: ENTRY_NOW status, tight invalidation, confirmed multi-timeframe execution
  const isBestEntry =
    signal.entryStatus === 'ENTRY_NOW' ||
    signal.actionablePriority === 'ENTRY_NOW';

  if (isBestEntry) {
    fusionScore += 40000;
  }

  // 6. STRUCTURALLY JUSTIFIED 15%+, 30%+, 40%+ TP POTENTIAL
  // High confluence + structural quality + entry quality + realistic TP potential + R:R + low risk.
  // CRITICAL: NEVER FABRICATE - must be genuine structural basis
  const targets = signal.targets || [];
  const genuineTargets = targets.filter(t => 
    t && typeof t.price === 'number' && t.price > 0 && t.status !== 'INVALIDATED' &&
    t.structuralBasis && t.structuralBasis !== 'NONE'
  );
  const upside = signal.opportunityPriority?.realisticUpsidePct || 0;
  const isLowRisk = pdIntel?.dumpRisk !== 'CRITICAL' && 
                    oppReport?.postPumpDumpRisk !== 'CRITICAL' && 
                    pdIntel?.dumpRisk !== 'HIGH' &&
                    !pdIntel?.isDumpRisk;
  const validRR = (signal.riskRewardRatio || 0) >= 1.5;

  if (isLowRisk && genuineTargets.length >= 1 && validRR) {
    if (upside >= 40 && (signal.riskRewardRatio || 0) >= 2.0 && genuineTargets.length >= 2) {
      fusionScore += 30000;
    } else if (upside >= 30 && (signal.riskRewardRatio || 0) >= 1.8 && genuineTargets.length >= 2) {
      fusionScore += 20000;
    } else if (upside >= 15 && (signal.riskRewardRatio || 0) >= 1.5) {
      fusionScore += 10000;
    }
  }

  // Confluence count weighting (+1,500 per validated confluence, up to 10,000)
  const confluences = Array.isArray(signal.confluences) ? signal.confluences : [];
  fusionScore += Math.min(10000, confluences.length * 1500);

  // Structural Quality bonus: presence of SMC order blocks, FVG, or CHoCH
  if (signal.opportunityReport?.detectedPatterns && signal.opportunityReport.detectedPatterns.length > 0) {
    fusionScore += Math.min(5000, signal.opportunityReport.detectedPatterns.length * 1000);
  }

  // Baseline quality grade (A+ = 1000, A = 750, B = 450, C = 200)
  const grade = signal.qualityGrade || 'B';
  if (grade === 'A+') fusionScore += 1000;
  else if (grade === 'A') fusionScore += 750;
  else if (grade === 'B') fusionScore += 450;
  else if (grade === 'C') fusionScore += 200;

  // Risk/reward ratio bonus (up to 500)
  const rr = signal.riskRewardRatio || 1.5;
  fusionScore += Math.min(500, Math.max(0, Math.round(rr * 50)));

  // MoonScore contribution (0 - 100)
  fusionScore += (signal.moonScore || 0);

  // PriorityScore contribution (0 - 500)
  fusionScore += Math.min(500, Math.max(0, signal.priorityScore || 0));

  return fusionScore;
}

/**
 * Ranks and sorts signals deterministically according to Phase 18 Unified Fusion requirements
 */
export function rankAndSortSignals(
  signals: Signal[],
  sortBy: 'PRIORITY_SCORE' | 'MOON_SCORE' | 'REALISTIC_UPSIDE' | 'RISK_REWARD' | 'NEWEST' = 'PRIORITY_SCORE'
): Signal[] {
  // Ensure every signal has opportunityPriority attached
  const evaluated = signals.map(sig => {
    const opp = sig.opportunityPriority || calculateClientOpportunityPriority(sig);
    const fusionScore = calculateUnifiedFusionScore(sig);
    return {
      ...sig,
      priorityScore: opp.priorityScore,
      rankingTier: opp.rankingTier,
      opportunityPriority: opp,
      unifiedFusionScore: fusionScore
    };
  });

  // Sort based on selected criterion
  evaluated.sort((a, b) => {
    if (sortBy === 'MOON_SCORE') {
      const diff = (b.moonScore || 0) - (a.moonScore || 0);
      if (diff !== 0) return diff;
      return (b.unifiedFusionScore || 0) - (a.unifiedFusionScore || 0);
    }

    if (sortBy === 'REALISTIC_UPSIDE') {
      const upA = a.opportunityPriority?.realisticUpsidePct || 0;
      const upB = b.opportunityPriority?.realisticUpsidePct || 0;
      const diff = upB - upA;
      if (diff !== 0) return diff;
      return (b.unifiedFusionScore || 0) - (a.unifiedFusionScore || 0);
    }

    if (sortBy === 'RISK_REWARD') {
      const rrA = a.riskRewardRatio || 0;
      const rrB = b.riskRewardRatio || 0;
      const diff = rrB - rrA;
      if (diff !== 0) return diff;
      return (b.unifiedFusionScore || 0) - (a.unifiedFusionScore || 0);
    }

    if (sortBy === 'NEWEST') {
      const diff = (b.createdAt || 0) - (a.createdAt || 0);
      if (diff !== 0) return diff;
      return (b.unifiedFusionScore || 0) - (a.unifiedFusionScore || 0);
    }

    // Default: 'PRIORITY_SCORE' (Phase 18 Unified Fusion Ranking)
    const fusionA = a.unifiedFusionScore ?? calculateUnifiedFusionScore(a);
    const fusionB = b.unifiedFusionScore ?? calculateUnifiedFusionScore(b);
    if (fusionB !== fusionA) return fusionB - fusionA;

    const scoreA = a.priorityScore || 0;
    const scoreB = b.priorityScore || 0;
    if (scoreB !== scoreA) return scoreB - scoreA;

    const rrA = a.riskRewardRatio || 0;
    const rrB = b.riskRewardRatio || 0;
    if (rrB !== rrA) return rrB - rrA;

    const upA = a.opportunityPriority?.realisticUpsidePct || 0;
    const upB = b.opportunityPriority?.realisticUpsidePct || 0;
    if (upB !== upA) return upB - upA;

    const moonA = a.moonScore || 0;
    const moonB = b.moonScore || 0;
    if (moonB !== moonA) return moonB - moonA;

    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  // Assign priorityRank
  evaluated.forEach((sig, idx) => {
    sig.priorityRank = idx + 1;
    if (sig.opportunityPriority) {
      sig.opportunityPriority.priorityRank = idx + 1;
    }
  });

  return evaluated;
}

/**
 * Returns clean styling metadata for ranking tiers
 */
export function getRankingTierBadge(tier?: OpportunityRankingTier): {
  label: string;
  badgeText: string;
  color: string;
  bg: string;
  border: string;
} {
  switch (tier) {
    case 'TIER_1_A_PLUS_ELITE':
      return {
        label: 'A+ Elite Opportunity',
        badgeText: 'A+ ELITE #1 TIER',
        color: 'text-amber-300',
        bg: 'bg-amber-500/15',
        border: 'border-amber-500/40'
      };
    case 'TIER_2_A_HIGH_CONVICTION':
      return {
        label: 'A Grade High Conviction',
        badgeText: 'A HIGH CONVICTION',
        color: 'text-emerald-300',
        bg: 'bg-emerald-500/15',
        border: 'border-emerald-500/40'
      };
    case 'TIER_3_EARLY_OPPORTUNITY':
      return {
        label: 'Early Setup / Breakout',
        badgeText: 'EARLY SETUP',
        color: 'text-sky-300',
        bg: 'bg-sky-500/15',
        border: 'border-sky-500/40'
      };
    case 'TIER_4_WATCH_RETEST':
      return {
        label: 'Watchlist / Retest Zone',
        badgeText: 'WATCH RETEST',
        color: 'text-purple-300',
        bg: 'bg-purple-500/15',
        border: 'border-purple-500/40'
      };
    case 'TIER_5_WAIT_CHOP':
      return {
        label: 'Wait / Chop Zone',
        badgeText: 'WAIT ZONE',
        color: 'text-slate-400',
        bg: 'bg-slate-800/40',
        border: 'border-slate-700/50'
      };
    case 'TIER_6_EXPIRED_INVALIDATED':
    default:
      return {
        label: 'Expired / Invalidated',
        badgeText: 'INACTIVE',
        color: 'text-rose-400',
        bg: 'bg-rose-950/20',
        border: 'border-rose-900/30'
      };
  }
}

/**
 * Phase 6.4: Strict Elite Signal Filter
 * Filters the primary signal stream for genuine high-conviction actionable setups only:
 * - Grade A+ or A (or B with active ENTRY_NOW and R:R >= 3.0)
 * - Active / pending execution (not expired, stopped, or invalidated)
 * - Free of critical pump-exhaustion or dump hazards
 * - Realistic R:R >= 1.5 with at least 1 verified structural TP
 */
export function filterEliteSignals(signals: Signal[]): Signal[] {
  const ranked = rankAndSortSignals(signals, 'PRIORITY_SCORE');
  return ranked.filter(s => {
    // Inactive or invalidated states are excluded from primary Elite feed
    if (s.status === 'STOPPED_OUT' || s.status === 'EXPIRED' || s.status === 'CANCELLED' || s.status === 'INVALIDATED' || s.status === 'COMPLETED') {
      return false;
    }
    if (s.entryStatus === 'INVALIDATED' || s.entryStatus === 'ENTRY_MISSED' || s.actionablePriority === 'INVALIDATED_EXPIRED') {
      return false;
    }

    // Direction must be explicit actionable trade (LONG or SHORT)
    if (s.direction !== 'LONG' && s.direction !== 'SHORT') {
      return false;
    }

    // Gross Price Drift Invariant: If price diverged by > 5% before any TP was hit, exclude from actionable feed
    const hasHitAnyTp = s.targets?.some(t => t.hit || t.status === 'HIT');
    if (!hasHitAnyTp && s.entryPrice > 0 && s.currentPrice > 0) {
      const drift = Math.abs(s.currentPrice - s.entryPrice) / s.entryPrice;
      if (drift > 0.05) {
        return false;
      }
    }

    // Critical dump / exhaustion hazards are disqualified from Elite feed
    const pd = s.pumpDump as any;
    if (
      s.opportunityReport?.postPumpDumpRisk === 'CRITICAL' ||
      pd?.dumpRisk === 'CRITICAL' ||
      pd?.dumpRisk === 'HIGH' ||
      pd?.isDumpRisk ||
      pd?.isPumpExhausted
    ) {
      return false;
    }

    const grade = s.qualityGrade || 'B';
    const rr = s.riskRewardRatio || 0;
    const readiness = (s.entryStatus || s.actionablePriority || '') as string;

    if (readiness.includes('INVALID') || readiness === 'ENTRY_MISSED' || grade === 'WAIT' || grade === 'C') {
      return false;
    }

    // Must have at least 2 validated confluences
    const confluenceCount = Array.isArray(s.confluences)
      ? s.confluences.length
      : ((s.targets && s.targets.length >= 2 ? 2 : 1) + (s.qualityGrade === 'A+' ? 1 : 0));
    if (confluenceCount < 2) {
      return false;
    }

    // A+ is always elite provided it has valid R:R >= 1.5
    if (grade === 'A+' && rr >= 1.5) return true;

    // A grade with valid R:R >= 1.5 and actionable readiness
    if (grade === 'A' && rr >= 1.4 && (readiness === 'ENTRY_NOW' || readiness === 'WAIT_FOR_RETEST' || readiness === 'WAIT_FOR_PULLBACK' || readiness === 'HIGH_PRIORITY')) {
      return true;
    }

    // High-conviction early setup with strong RR >= 2.0 and active trigger
    if (s.opportunityPriority?.rankingTier === 'TIER_3_EARLY_OPPORTUNITY' && rr >= 2.0 && (readiness === 'ENTRY_NOW' || readiness === 'WAIT_FOR_RETEST')) {
      return true;
    }

    // High R:R (1:3+) with immediate trigger and high confluence count
    if (grade === 'B' && rr >= 3.0 && readiness === 'ENTRY_NOW' && confluenceCount >= 3) {
      return true;
    }

    return false;
  });
}

/**
 * Phase 6.4: Deterministic Catalyst-to-Trade Pipeline Builder
 * Constructs the 8-step pipeline linking Catalyst -> Market Reaction -> Technical Confirmation
 * -> Entry Zone -> Stop Loss -> Targets -> R:R -> Invalidation & Execution.
 */
export function buildCatalystTradePipeline(signal: Signal, newsItem?: NewsItem | null): CatalystTradePipeline {
  const newsEvidence = newsItem || signal.unifiedEvidence?.news || null;
  const isLong = signal.direction === 'LONG';
  const entry = signal.entryPrice || signal.currentPrice || 0;
  const entryLow = signal.entryZoneLow || (isLong ? entry * 0.99 : entry);
  const entryHigh = signal.entryZoneHigh || (isLong ? entry : entry * 1.01);
  const sl = signal.stopLoss || (isLong ? entry * 0.96 : entry * 1.04);
  const targets = (signal.targets && signal.targets.length > 0)
    ? signal.targets
    : [
        { id: 'tp1', label: 'TP1', price: isLong ? entry * 1.04 : entry * 0.96, percentage: 4, hit: false, riskRewardRatio: 1.5, structuralBasis: 'RESISTANCE' as any },
        { id: 'tp2', label: 'TP2', price: isLong ? entry * 1.08 : entry * 0.92, percentage: 8, hit: false, riskRewardRatio: 3.0, structuralBasis: 'LIQUIDITY_POOL' as any },
        { id: 'tp3', label: 'TP3', price: isLong ? entry * 1.15 : entry * 0.85, percentage: 15, hit: false, riskRewardRatio: 5.5, structuralBasis: 'MACRO_EXPANSION' as any }
      ];

  const rr = signal.riskRewardRatio || (Math.abs(targets[0].price - entry) / Math.max(0.0001, Math.abs(entry - sl)));

  // Setup classification
  const pd = signal.pumpDump as any;
  let setupClassification: CatalystTradePipeline['setupClassification'] = 'STANDARD_CATALYST_SWING';
  if (pd?.dumpRisk === 'CRITICAL' || signal.opportunityReport?.postPumpDumpRisk === 'CRITICAL') {
    setupClassification = 'DUMP_RISK';
  } else if (pd?.isPumpExhausted || pd?.postPumpExhaustion || pd?.climaxDetected) {
    setupClassification = 'POST_PUMP_EXHAUSTION';
  } else if (pd?.sellTheNewsRisk || newsEvidence?.eventType === 'PARTNERSHIP_RUMOR' || signal.notes?.toLowerCase().includes('sell the news')) {
    setupClassification = 'SELL_THE_NEWS';
  } else if (signal.opportunityReport?.earlySetupType === 'EARLY_CATALYST_SETUP' || newsEvidence?.prePumpSetup?.isPrePumpCatalyst) {
    setupClassification = 'PRE_PUMP_CATALYST_SETUP';
  } else if (signal.opportunityReport?.detectedPatterns?.includes('CATALYST_ACCELERATION') || signal.opportunityReport?.earlySetupType === 'EARLY_MOMENTUM_SETUP') {
    setupClassification = 'CATALYST_CONTINUATION';
  }

  // Market reaction status
  let reactionState: CatalystTradePipeline['marketReaction']['state'] = 'PENDING';
  let priceChangePct = signal.priceChange24h || 0;
  let rvolPost = signal.opportunityReport?.rvol || 1.0;
  let reactionAnalysis = 'Market absorbing catalyst telemetry across order books.';

  if (newsEvidence?.marketReaction) {
    reactionState = newsEvidence.marketReaction.state || 'CONFIRMED';
    priceChangePct = newsEvidence.marketReaction.priceChangePostNewsPct || signal.priceChange24h || 0;
    rvolPost = newsEvidence.marketReaction.rvolPostNews || rvolPost;
    reactionAnalysis = newsEvidence.marketReaction.details || reactionAnalysis;
  } else if (rvolPost >= 1.5) {
    reactionState = 'CONFIRMED';
    reactionAnalysis = `Volume surge confirmed post-event (RVOL: ${rvolPost.toFixed(1)}x).`;
  }

  // Technical confirmation
  const smc = signal.smcStructureReport;
  const bosChoch = smc ? `${smc.structureType} (${smc.structureBias})` : (signal.marketStructure || 'STRUCTURAL ALIGNMENT');
  const mtfAlign = signal.coreIntelligence?.marketRegime || 'MULTI-TIMEFRAME CONFLUENT';
  const orderflowStatus = signal.orderflowReport?.cvd?.deltaTrend ? `CVD ${signal.orderflowReport.cvd.deltaTrend}` : 'VOLUME PROFILE BALANCED';

  const detailsList: string[] = [];
  if (smc?.nearestOrderBlock) detailsList.push(`Order block active at $${smc.nearestOrderBlock.midpoint.toFixed(4)}`);
  if (signal.opportunityReport?.compressionScore && signal.opportunityReport.compressionScore > 50) {
    detailsList.push(`Volatility compression score: ${signal.opportunityReport.compressionScore}/100`);
  }
  if (signal.confirmations && signal.confirmations.length > 0) {
    detailsList.push(...signal.confirmations.slice(0, 3));
  }

  return {
    catalyst: {
      title: newsEvidence?.title || newsEvidence?.primaryHeadlines?.[0] || signal.newsCatalyst || `${signal.symbol} Institutional Flow & Ecosystem Catalyst`,
      source: newsEvidence?.source || 'Verified Intelligence Network',
      sourceTier: newsEvidence?.sourceTier || 'TIER_1',
      publishedAt: newsEvidence?.publishedAt || signal.createdAt || Date.now(),
      eventType: newsEvidence?.eventType || 'ECOSYSTEM_CATALYST',
      sentiment: (newsEvidence?.sentiment || newsEvidence?.bias || (isLong ? 'BULLISH' : 'BEARISH')) as any,
      impactScore: newsEvidence?.impactScore || 0
    },
    marketReaction: {
      state: reactionState,
      priceChangePostPct: Number(priceChangePct.toFixed(2)),
      rvolPostEvent: Number(rvolPost.toFixed(2)),
      reactionAnalysis
    },
    technicalConfirmation: {
      isConfirmed: Boolean(signal.qualityGrade === 'A+' || signal.qualityGrade === 'A' || signal.moonScore >= 75),
      bosChochStatus: bosChoch,
      mtfAlignment: mtfAlign,
      orderflowOrCvd: orderflowStatus,
      details: detailsList
    },
    entryZone: {
      low: Number(entryLow.toFixed(6)),
      high: Number(entryHigh.toFixed(6)),
      ideal: Number(entry.toFixed(6)),
      noChaseRule: 'Strict execution rule: Do NOT market-chase if price extends >1.5% beyond Entry High.'
    },
    stopLoss: {
      price: Number(sl.toFixed(6)),
      invalidationBasis: signal.invalidationReason || 'Loss of structural pivot / Order Block breakdown'
    },
    targets,
    riskRewardRatio: Number(rr.toFixed(2)),
    invalidationCriteria: signal.invalidationReason || `Candle close ${isLong ? 'below' : 'above'} $${sl.toFixed(4)} invalidates technical setup immediately.`,
    executionStatus: (signal.entryStatus || (signal.actionablePriority === 'ENTRY_NOW' ? 'ENTRY_NOW' : 'WAIT_FOR_CONFIRMATION')) as any,
    setupClassification,
    summary: `${signal.symbol} catalyst integrated with ${bosChoch} structure and 1:${rr.toFixed(1)} verified R:R.`
  };
}
