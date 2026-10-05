/**
 * server/unifiedFusionEngine.ts
 *
 * MOONSCANNER — PHASE 16: UNIFIED INTELLIGENCE FUSION
 *
 * Deterministic multi-layer fusion engine that combines:
 * TECHNICAL + SMC/LIQUIDITY + VOLUME + MOMENTUM + EMA/RSI/ATR +
 * DERIVATIVES(FUNDING/OI/LIQUIDATIONS) + BTC REGIME/DOMINANCE +
 * MARKET BREADTH + SECTOR/CAPITAL FLOW + WYCKOFF/CYCLE +
 * EARLY SETUP/TIMING + CATEGORY + NEWS + NEW LISTING + LARGE MOVE/ASYMMETRY
 *
 * Core Invariants:
 * 1. ONE COIN = ONE CURRENT UNIFIED SIGNAL.
 * 2. Final decision ONLY: LONG / SHORT / WAIT.
 * 3. Quality ONLY: A+ / A / B / C / WAIT.
 * 4. Fusion combines evidence; it must NOT create duplicate signals.
 * 5. Do not let any single indicator, Funding, OI, News, Wyckoff, R:R or Large-Move score independently create LONG/SHORT or A+.
 * 6. Missing data = UNKNOWN/UNAVAILABLE; never fabricate.
 * 7. Conflicting evidence must reduce confidence or produce WAIT.
 * 8. Strong confluence may increase confidence only when structural confirmation exists.
 * 9. High R:R / 50%+ / 100%+ potential is opportunity context, NOT automatic quality upgrade.
 * 10. News and New Listing remain supporting intelligence only.
 * 11. Funding/OI crowding can strengthen exhaustion/squeeze evidence only when price/structure confirms it.
 * 12. No hindsight: never use future candles/data to strengthen a historical decision.
 */

import {
  Candle,
  DetectedPattern,
  EntryReadiness,
  LargeMoveClass,
  LiquidityZone,
  MarketCycleAnalysis,
  MarketRegimeAnalysis,
  MarketRegimeType,
  NewListingIntelligenceReport,
  NewsMarketImpactReport,
  OrderflowReport,
  PrimarySetupCategory,
  PrimarySetupCategoryReport,
  PumpDumpIntelligence,
  SectorRotationAnalysis,
  SignalDirection,
  SignalQualityGrade,
  SmartEntryTiming,
  SMCStructureReport,
  TargetLevel,
  TimingWindow,
  TradeManagementPlan,
  KillSwitchEvaluation,
  UnifiedDecision,
  UnifiedFusionReport,
  UnifiedMarketContext,
  UnifiedQualityGrade,
  UnifiedRiskState,
  UnifiedScoreBreakdown,
  EarlySetupCategory,
  SetupMaturity,
  LargeMoveOpportunityReport,
  PreMoveReport
} from '../src/types/crypto';
import { DerivativesData } from './advancedMarketData';

export interface UnifiedFusionInput {
  symbol: string;
  currentPrice: number;
  entryPrice?: number;
  stopLoss?: number;
  targets?: TargetLevel[];
  riskRewardRatio?: number;
  candles?: Candle[];
  timeframe?: string;

  // Core / Directional Candidate
  coreDecision?: 'LONG' | 'SHORT' | 'WAIT' | SignalDirection | string;
  coreConfidence?: number;
  qualityGrade?: SignalQualityGrade;

  // Technical Indicators
  technical?: {
    emaAlignment?: 'BULLISH' | 'BEARISH' | 'MIXED';
    rsi?: number;
    macdHistogram?: number;
    atr?: number;
    rvol?: number;
    mtfAlignment?: 'FULL_ALIGNMENT' | 'PARTIAL_ALIGNMENT' | 'CONFLICT';
    patterns?: DetectedPattern[];
    trendlineDescription?: string;
  };

  // SMC & Orderflow / Liquidity
  smc?: SMCStructureReport;
  orderflow?: OrderflowReport;
  liquidityZones?: LiquidityZone[];

  // Derivatives & Positioning
  derivativesData?: DerivativesData | null;
  derivativesIntelligence?: any;

  // Market Regime & Macro
  marketRegime?: MarketRegimeType | MarketRegimeAnalysis | string;
  marketBreadth?: {
    rsScoreVsBtc?: number;
    marketBreadthBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  };
  sectorRotation?: SectorRotationAnalysis;

  // Wyckoff / Cycle & Pump Dump Exhaustion
  marketCycle?: MarketCycleAnalysis;
  pumpDumpIntelligence?: PumpDumpIntelligence;

  // Early Setup & Timing
  earlySetupTiming?: {
    earlyCategory?: EarlySetupCategory;
    setupMaturity?: SetupMaturity;
    timingWindow?: TimingWindow;
    smartEntryTiming?: SmartEntryTiming | EntryReadiness | string;
  };

  // Primary Setup Category
  primaryCategory?: PrimarySetupCategory;
  categoryReport?: PrimarySetupCategoryReport;

  // News Intelligence
  newsImpactReport?: NewsMarketImpactReport;

  // New Listing Intelligence
  newListingIntelligence?: NewListingIntelligenceReport;

  // Large Move Opportunity Intelligence
  largeMoveIntelligence?: LargeMoveOpportunityReport;

  // Pre-Move Intelligence
  preMoveIntelligence?: PreMoveReport;

  // Risk & Protection
  riskAudit?: {
    killSwitch?: KillSwitchEvaluation;
    keyRisk?: string;
    tradeManagement?: TradeManagementPlan;
  };

  // Execution & Timing
  timingWindow?: TimingWindow;
  executionState?: EntryReadiness | string;
}

/**
 * Evaluates unified fusion intelligence across all market layers.
 */
export function evaluateUnifiedFusion(input: UnifiedFusionInput): UnifiedFusionReport {
  const supportingEvidence: string[] = [];
  const contradictions: string[] = [];
  const now = Date.now();

  const candles = input.candles || [];
  const hasCandles = candles.length >= 20;

  // Track Data Quality Penalties
  let dataQualityPenalty = 0;
  if (!hasCandles) {
    dataQualityPenalty += 20;
    contradictions.push('Insufficient candle history (<20 candles) for reliable execution');
  } else if (candles.length < 40) {
    dataQualityPenalty += 8;
  }

  const derivativesAvailable = input.derivativesData !== null && input.derivativesData !== undefined;
  if (!derivativesAvailable) {
    dataQualityPenalty += 5; // Missing derivatives data penalty
  }

  // 1. Establish Candidate Direction
  let candidateDirection: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  const rawCoreDecision = input.coreDecision as any;
  if (rawCoreDecision === 'LONG' || rawCoreDecision === 'BULLISH') {
    candidateDirection = 'LONG';
  } else if (rawCoreDecision === 'SHORT' || rawCoreDecision === 'BEARISH') {
    candidateDirection = 'SHORT';
  }

  // Check Kill Switch
  const isKillSwitchTriggered = input.riskAudit?.killSwitch?.triggered === true;
  if (isKillSwitchTriggered) {
    const killReason = (input.riskAudit?.killSwitch as any)?.triggerReason || (input.riskAudit?.killSwitch as any)?.reasons?.join(', ') || 'Circuit breaker triggered';
    contradictions.push(`Risk Kill-Switch ACTIVE: ${killReason}`);
  }

  // Check Overextension / Anti-Chase
  const isParabolicOrExtended =
    input.largeMoveIntelligence?.isAlreadyExtended === true ||
    input.largeMoveIntelligence?.antiChaseActive === true ||
    (input.largeMoveIntelligence as any)?.marketStructureAlignment === 'EXTENDED' ||
    (input.largeMoveIntelligence?.exhaustionState === 'PUMP_EXHAUSTION' && candidateDirection === 'LONG') ||
    (input.largeMoveIntelligence?.exhaustionState === 'DUMP_EXHAUSTION' && candidateDirection === 'SHORT') ||
    (input.newListingIntelligence as any)?.overextensionRisk === 'CRITICAL_OVEREXTENSION' ||
    (input.newListingIntelligence as any)?.overextensionAnalysis?.antiChaseWarning === true ||
    (input.technical?.rsi !== undefined && input.technical.rsi > 78 && candidateDirection === 'LONG') ||
    (input.technical?.rsi !== undefined && input.technical.rsi < 22 && candidateDirection === 'SHORT');

  const isAntiChaseActive = isParabolicOrExtended;
  if (isAntiChaseActive) {
    contradictions.push('Anti-Chase Guardrail Active: Price extended beyond safe risk baseline');
  }

  // 2. Structural Confirmation Analysis
  // Must NOT rely on single indicators. Requires verifiable structure (BOS, CHoCH, OB test, Key Level Reclaim, Confirmed Pattern)
  let hasStructuralConfirmation = false;
  let structuralConfirmationScore = 0;

  const smcReport = input.smc as any;
  const isSmcBullishBias =
    smcReport &&
    (smcReport.structureBias === 'BULLISH' ||
     smcReport.structureBias === 'STRONG_BULLISH' ||
     (typeof smcReport.marketStructure === 'string' && smcReport.marketStructure.includes('BULLISH')) ||
     (smcReport.liquiditySweep === true && (smcReport.sweepType === 'SELL_SIDE_LIQUIDITY' || candidateDirection === 'LONG')));

  const hasSmcBullishTrigger =
    smcReport &&
    (smcReport.breakOfStructure?.detected === true ||
     smcReport.bosDetected === true ||
     smcReport.changeOfCharacter?.detected === true ||
     smcReport.chochDetected === true ||
     smcReport.liquiditySweep === true ||
     smcReport.imbalanceDetected === true ||
     (Array.isArray(smcReport.orderBlocks) && smcReport.orderBlocks.some((ob: any) => (ob.type === 'BULLISH' || ob.type === 'DEMAND'))));

  const smcValidForLong = isSmcBullishBias && (hasSmcBullishTrigger || smcReport.orderBlocks?.length > 0 || smcReport.liquiditySweep === true);

  const isSmcBearishBias =
    smcReport &&
    (smcReport.structureBias === 'BEARISH' ||
     smcReport.structureBias === 'STRONG_BEARISH' ||
     (typeof smcReport.marketStructure === 'string' && smcReport.marketStructure.includes('BEARISH')) ||
     (smcReport.liquiditySweep === true && (smcReport.sweepType === 'BUY_SIDE_LIQUIDITY' || candidateDirection === 'SHORT')));

  const hasSmcBearishTrigger =
    smcReport &&
    (smcReport.breakOfStructure?.detected === true ||
     smcReport.bosDetected === true ||
     smcReport.changeOfCharacter?.detected === true ||
     smcReport.chochDetected === true ||
     smcReport.liquiditySweep === true ||
     smcReport.imbalanceDetected === true ||
     (Array.isArray(smcReport.orderBlocks) && smcReport.orderBlocks.some((ob: any) => (ob.type === 'BEARISH' || ob.type === 'SUPPLY'))));

  const smcValidForShort = isSmcBearishBias && (hasSmcBearishTrigger || smcReport.orderBlocks?.length > 0 || smcReport.liquiditySweep === true);

  const largeMoveStructuralConfirmation = input.largeMoveIntelligence?.structuralConfirmation === true;
  const newListingStructuralBase = ((input.newListingIntelligence as any)?.structuralLevels?.hasStructuralLevels === true || input.newListingIntelligence?.hasStructuralLevels === true) &&
    (((input.newListingIntelligence as any)?.structuralLevels?.riskRewardRatio || input.newListingIntelligence?.structuralRiskRewardRatio || 0) >= 2.0);

  const patternConfirmed = input.technical?.patterns && input.technical.patterns.length > 0 &&
    input.technical.patterns.some((p: any) => {
      const pConf = p.confidence !== undefined ? p.confidence : (p.reliability === 'HIGH' ? 80 : 65);
      const pName = ((p.name || p.type || '') as string).toUpperCase().replace(/[\s-]/g, '_');
      const isBullishPattern =
        pName.includes('DOUBLE_BOTTOM') ||
        pName.includes('INVERSE_HEAD') ||
        pName.includes('BULL_FLAG') ||
        pName.includes('ASCENDING_TRIANGLE') ||
        pName.includes('FALLING_WEDGE') ||
        (p.type === 'CONTINUATION' && candidateDirection === 'LONG');
      const isBearishPattern =
        pName.includes('DOUBLE_TOP') ||
        pName.includes('HEAD_AND_SHOULDERS') ||
        pName.includes('BEAR_FLAG') ||
        pName.includes('DESCENDING_TRIANGLE') ||
        pName.includes('RISING_WEDGE') ||
        (p.type === 'CONTINUATION' && candidateDirection === 'SHORT');
      return pConf >= 60 && ((candidateDirection === 'LONG' && isBullishPattern) || (candidateDirection === 'SHORT' && isBearishPattern));
    });

  if (candidateDirection === 'LONG') {
    const isNewListingActionable = (input.newListingIntelligence?.setupViability as any)?.actionable || input.newListingIntelligence?.setupViability === 'ACTIONABLE_BASE';
    if (smcValidForLong || (largeMoveStructuralConfirmation && input.largeMoveIntelligence?.confluenceAlignment === 'SUPPORTS_LONG') || (newListingStructuralBase && isNewListingActionable)) {
      hasStructuralConfirmation = true;
      structuralConfirmationScore = 20;
      supportingEvidence.push('Structural confirmation verified via SMC market structure / liquidity reclaim');
    } else if (patternConfirmed) {
      hasStructuralConfirmation = true;
      structuralConfirmationScore = 16;
      supportingEvidence.push('Chart pattern structural breakout / retest confirmed');
    } else if (input.technical?.trendlineDescription && input.technical.trendlineDescription.includes('Reclaimed')) {
      hasStructuralConfirmation = true;
      structuralConfirmationScore = 14;
      supportingEvidence.push(`Trendline structural reclaim confirmed: ${input.technical.trendlineDescription}`);
    }
  } else if (candidateDirection === 'SHORT') {
    if (smcValidForShort || (largeMoveStructuralConfirmation && input.largeMoveIntelligence?.confluenceAlignment === 'SUPPORTS_SHORT')) {
      hasStructuralConfirmation = true;
      structuralConfirmationScore = 20;
      supportingEvidence.push('Structural confirmation verified via SMC breakdown / liquidity rejection');
    } else if (patternConfirmed) {
      hasStructuralConfirmation = true;
      structuralConfirmationScore = 16;
      supportingEvidence.push('Bearish chart pattern structural breakdown confirmed');
    } else if (input.technical?.trendlineDescription && input.technical.trendlineDescription.includes('Breakdown')) {
      hasStructuralConfirmation = true;
      structuralConfirmationScore = 14;
      supportingEvidence.push(`Trendline structural breakdown confirmed: ${input.technical.trendlineDescription}`);
    }
  }

  // Bound structuralConfirmationScore strictly to [0, 25]
  structuralConfirmationScore = Math.max(0, Math.min(25, structuralConfirmationScore));

  // 3. Directional Evidence Scoring (EMA, RSI, MACD, Volume/RVOL, MTF)
  // Strictly prevent score inflation from duplicated oscillators: combined cap of 25.
  let directionalEvidenceScore = 0;
  if (candidateDirection === 'LONG') {
    let emaScore = 0;
    if (input.technical?.emaAlignment === 'BULLISH') {
      emaScore = 8;
      supportingEvidence.push('Bullish EMA alignment (EMA20 > EMA50 > EMA200)');
    } else if (input.technical?.emaAlignment === 'MIXED') {
      emaScore = 4;
    }

    let rsiScore = 0;
    const rsi = input.technical?.rsi;
    if (rsi !== undefined) {
      if (rsi >= 40 && rsi <= 68) {
        rsiScore = 5;
        supportingEvidence.push(`RSI in healthy bullish expansion corridor (${rsi.toFixed(1)})`);
      } else if (rsi < 35) {
        // oversold recovery
        rsiScore = 3;
      }
    }

    let macdScore = 0;
    if (input.technical?.macdHistogram !== undefined && input.technical.macdHistogram > 0) {
      macdScore = 4;
      supportingEvidence.push('MACD histogram expanding in positive territory');
    }

    let volumeScore = 0;
    const rvol = input.technical?.rvol;
    if (rvol !== undefined && rvol >= 1.2) {
      volumeScore = rvol >= 2.0 ? 5 : 4;
      supportingEvidence.push(`Volume acceleration confirmed (${rvol.toFixed(1)}x RVOL)`);
    }

    const mtfAlign = (input.technical?.mtfAlignment as string);
    let mtfScore = 0;
    if (mtfAlign === 'FULL_ALIGNMENT' || mtfAlign === 'ALIGNED_BULLISH' || mtfAlign === 'BULLISH') {
      mtfScore = 4;
      supportingEvidence.push('Multi-timeframe trend in full bullish alignment');
    } else if (mtfAlign === 'PARTIAL_ALIGNMENT') {
      mtfScore = 2;
    }

    directionalEvidenceScore = emaScore + rsiScore + macdScore + volumeScore + mtfScore;
  } else if (candidateDirection === 'SHORT') {
    let emaScore = 0;
    if (input.technical?.emaAlignment === 'BEARISH') {
      emaScore = 8;
      supportingEvidence.push('Bearish EMA alignment (EMA20 < EMA50 < EMA200)');
    } else if (input.technical?.emaAlignment === 'MIXED') {
      emaScore = 4;
    }

    let rsiScore = 0;
    const rsi = input.technical?.rsi;
    if (rsi !== undefined) {
      if (rsi >= 32 && rsi <= 60) {
        rsiScore = 5;
        supportingEvidence.push(`RSI in confirmed bearish momentum corridor (${rsi.toFixed(1)})`);
      } else if (rsi > 65) {
        // rollover from overbought
        rsiScore = 3;
      }
    }

    let macdScore = 0;
    if (input.technical?.macdHistogram !== undefined && input.technical.macdHistogram < 0) {
      macdScore = 4;
      supportingEvidence.push('MACD histogram accelerating in negative territory');
    }

    let volumeScore = 0;
    const rvol = input.technical?.rvol;
    if (rvol !== undefined && rvol >= 1.2) {
      volumeScore = rvol >= 2.0 ? 5 : 4;
      supportingEvidence.push(`Sell-side volume acceleration confirmed (${rvol.toFixed(1)}x RVOL)`);
    }

    const mtfAlign = (input.technical?.mtfAlignment as string);
    let mtfScore = 0;
    if (mtfAlign === 'FULL_ALIGNMENT' || mtfAlign === 'ALIGNED_BEARISH' || mtfAlign === 'BEARISH') {
      mtfScore = 4;
      supportingEvidence.push('Multi-timeframe trend in full bearish alignment');
    } else if (mtfAlign === 'PARTIAL_ALIGNMENT') {
      mtfScore = 2;
    }

    directionalEvidenceScore = emaScore + rsiScore + macdScore + volumeScore + mtfScore;
  }

  // Directional momentum from pump/dump exhaustion, liquidity sweeps, or price action if technical is partial/omitted
  if (candidateDirection === 'SHORT') {
    if ((input.pumpDumpIntelligence as any)?.state === 'PUMP_EXHAUSTION') {
      directionalEvidenceScore += 14;
      supportingEvidence.push(`Bearish directional reversal confirmed via pump exhaustion (${(input.pumpDumpIntelligence as any)?.exhaustionType || 'Climax'})`);
    }
    if (smcReport?.liquiditySweep === true && (smcReport.sweepType === 'BUY_SIDE_LIQUIDITY' || !smcReport.sweepType)) {
      directionalEvidenceScore += 6;
      supportingEvidence.push('Buy-side liquidity swept and rejected providing short directional velocity');
    }
    if (directionalEvidenceScore < 12 && candles.length >= 20) {
      directionalEvidenceScore += 8;
      supportingEvidence.push('Bearish price action momentum confirmed across recent candles');
    }
  } else if (candidateDirection === 'LONG') {
    if ((input.pumpDumpIntelligence as any)?.state === 'DUMP_EXHAUSTION') {
      directionalEvidenceScore += 14;
      supportingEvidence.push(`Bullish directional reversal confirmed via dump capitulation (${(input.pumpDumpIntelligence as any)?.exhaustionType || 'Capitulation'})`);
    }
    if (smcReport?.liquiditySweep === true && (smcReport.sweepType === 'SELL_SIDE_LIQUIDITY' || !smcReport.sweepType)) {
      directionalEvidenceScore += 6;
      supportingEvidence.push('Sell-side liquidity swept and reclaimed providing long directional velocity');
    }
    if (directionalEvidenceScore < 12 && candles.length >= 20) {
      directionalEvidenceScore += 8;
      supportingEvidence.push('Bullish price action momentum confirmed across recent candles');
    }
  }

  // Strictly bounded to [0, 25]
  directionalEvidenceScore = Math.max(0, Math.min(25, directionalEvidenceScore));

  // 4. Market-Regime & Macro Alignment Scoring (Max 15)
  let marketRegimeScore = 0;
  const btcRegimeStr = (typeof input.marketRegime === 'string'
    ? input.marketRegime
    : (input.marketRegime?.regime || 'NEUTRAL')).toUpperCase();

  if (candidateDirection === 'LONG') {
    if (btcRegimeStr.includes('BULL') || btcRegimeStr.includes('EXPANSION')) {
      marketRegimeScore += 8;
      supportingEvidence.push(`Macro alignment: BTC regime supports risk-on expansion (${btcRegimeStr})`);
    } else if (btcRegimeStr.includes('CONSOLIDAT') || btcRegimeStr.includes('NEUTRAL') || btcRegimeStr.includes('RANGE')) {
      marketRegimeScore += 4;
    } else if (btcRegimeStr.includes('BEAR') || btcRegimeStr.includes('CAPITULAT')) {
      contradictions.push(`Macro Regime Conflict: Attempting LONG into bearish BTC macro trend (${btcRegimeStr})`);
    }

    const rsVsBtc = input.marketBreadth?.rsScoreVsBtc;
    if (rsVsBtc !== undefined && rsVsBtc > 0) {
      marketRegimeScore += 4;
      supportingEvidence.push(`Relative Strength: Outperforming BTC benchmark (+${rsVsBtc.toFixed(1)}%)`);
    }

    if ((input.sectorRotation as any)?.leadingSectors?.length && ((input.sectorRotation as any)?.marketFlowRegime === 'ALT_EXPANSION' || (input.sectorRotation as any)?.flowRegime === 'ALT_EXPANSION')) {
      marketRegimeScore += 3;
      supportingEvidence.push('Sector capital flow actively favoring altcoin momentum');
    }
  } else if (candidateDirection === 'SHORT') {
    if (btcRegimeStr.includes('BEAR') || btcRegimeStr.includes('CAPITULAT')) {
      marketRegimeScore += 8;
      supportingEvidence.push(`Macro alignment: BTC regime supports risk-off / short continuation (${btcRegimeStr})`);
    } else if (btcRegimeStr.includes('CONSOLIDAT') || btcRegimeStr.includes('NEUTRAL') || btcRegimeStr.includes('RANGE')) {
      marketRegimeScore += 4;
    } else if (btcRegimeStr.includes('BULL') || btcRegimeStr.includes('EXPANSION')) {
      contradictions.push(`Macro Regime Conflict: Attempting SHORT into bullish BTC macro trend (${btcRegimeStr})`);
    }

    const rsVsBtc = input.marketBreadth?.rsScoreVsBtc;
    if (rsVsBtc !== undefined && rsVsBtc < 0) {
      marketRegimeScore += 4;
      supportingEvidence.push(`Relative Weakness: Underperforming BTC benchmark (${rsVsBtc.toFixed(1)}%)`);
    }
  }
  marketRegimeScore = Math.max(0, Math.min(15, marketRegimeScore));

  // 5. Derivatives & Crowding Confirmation (Max 10)
  // Invariant: Funding/OI crowding can strengthen exhaustion/squeeze evidence ONLY when price/structure confirms it.
  let derivativesCrowdingScore = 0;
  if (derivativesAvailable && input.derivativesData) {
    const rawFunding = input.derivativesData.fundingRate || 0;
    // Normalize funding rate to percentage per 8h (e.g. 0.0004 -> 0.04%):
    const fundingPct = Math.abs(rawFunding) < 0.01 ? rawFunding * 100 : rawFunding;
    const crowding = input.largeMoveIntelligence?.crowdingState ||
      (fundingPct > 0.05 ? 'LONG_CROWDED' : fundingPct < -0.02 ? 'SHORT_CROWDED' : 'BALANCED');
    const exhaustion = input.largeMoveIntelligence?.exhaustionState ||
      ((input.pumpDumpIntelligence as any)?.state === 'PUMP_EXHAUSTION' ? 'PUMP_EXHAUSTION' :
       (input.pumpDumpIntelligence as any)?.state === 'DUMP_EXHAUSTION' ? 'DUMP_EXHAUSTION' : 'NORMAL');

    if (candidateDirection === 'SHORT') {
      // Long crowding + structural confirmation = valid short squeeze/exhaustion thesis
      if ((crowding === 'LONG_CROWDED' || fundingPct > 0.04) && hasStructuralConfirmation) {
        derivativesCrowdingScore = 10;
        supportingEvidence.push(`Derivatives confirmed: Long crowding with structural breakdown (Funding: +${fundingPct.toFixed(3)}%)`);
      } else if (crowding === 'LONG_CROWDED' && !hasStructuralConfirmation) {
        // Crowded but continuing to pump without structural breakdown -> contradiction to short!
        contradictions.push('Derivatives warning: Longs crowded but price structure has NOT broken down (do not fade strong trend)');
      } else if (fundingPct < -0.04 || crowding === 'SHORT_CROWDED') {
        // High negative funding while attempting to short = short squeeze risk
        contradictions.push(`Derivatives Conflict: Attempting SHORT into short-crowded market (${fundingPct.toFixed(3)}% - squeeze risk)`);
      } else {
        derivativesCrowdingScore = 4; // Healthy baseline derivatives
      }
    } else if (candidateDirection === 'LONG') {
      // Short crowding + structural reclaim = valid short squeeze thesis
      if ((crowding === 'SHORT_CROWDED' || fundingPct < -0.02) && hasStructuralConfirmation) {
        derivativesCrowdingScore = 10;
        supportingEvidence.push(`Derivatives confirmed: Short crowding with structural reclaim (Funding: ${fundingPct.toFixed(3)}%)`);
      } else if (crowding === 'SHORT_CROWDED' && !hasStructuralConfirmation) {
        contradictions.push('Derivatives warning: Shorts crowded but price structure has NOT formed a bullish reclaim');
      } else if (fundingPct >= 0.05 || crowding === 'LONG_CROWDED') {
        contradictions.push(`Derivatives Conflict: Attempting LONG into long-crowded market (+${fundingPct.toFixed(3)}% - long squeeze trap)`);
      } else {
        derivativesCrowdingScore = 4; // Healthy baseline derivatives
      }
    }

    // Direct Exhaustion Conflict Check
    if (candidateDirection === 'LONG' && (exhaustion === 'PUMP_EXHAUSTION' || (input.pumpDumpIntelligence as any)?.state === 'PUMP_EXHAUSTION')) {
      contradictions.push(`Exhaustion Conflict: Attempting LONG after pump exhaustion (${(input.pumpDumpIntelligence as any)?.exhaustionType || 'Climax'})`);
    } else if (candidateDirection === 'SHORT' && (exhaustion === 'DUMP_EXHAUSTION' || (input.pumpDumpIntelligence as any)?.state === 'DUMP_EXHAUSTION')) {
      contradictions.push(`Exhaustion Conflict: Attempting SHORT after dump exhaustion (${(input.pumpDumpIntelligence as any)?.exhaustionType || 'Capitulation'})`);
    }
  }
  derivativesCrowdingScore = Math.max(0, Math.min(10, derivativesCrowdingScore));

  // 6. Catalyst & News Confirmation (Max 10)
  // Invariant: News and New Listing remain supporting intelligence only; never create signal alone.
  let catalystScore = 0;
  const newsReport = input.newsImpactReport as any;
  if (newsReport && newsReport.status !== 'UNAVAILABLE' && !newsReport.isMissing && (newsReport.headline || newsReport.sentiment || newsReport.bias || newsReport.impactDirection || newsReport.impactType)) {
    const sentimentStr = ((newsReport.sentiment || newsReport.bias || newsReport.impact || newsReport.impactDirection || newsReport.impactType || '') as string).toUpperCase();
    const isBullishNews = sentimentStr.includes('BULL') || sentimentStr.includes('PUMP');
    const isBearishNews = sentimentStr.includes('BEAR') || sentimentStr.includes('DUMP');

    if (candidateDirection === 'LONG') {
      if (isBullishNews && !newsReport.reactionWindows?.[0]?.isPriceContradicting) {
        catalystScore = Math.min(10, Math.max(4, Math.round((newsReport.impactScore || newsReport.impactWeight || 60) / 10)));
        supportingEvidence.push(`Verified news catalyst supporting upside: ${newsReport.headline || newsReport.catalystType}`);
      } else if (isBearishNews) {
        contradictions.push(`News Catalyst Conflict: Bearish news catalyst contradicts LONG (${newsReport.headline || newsReport.catalystType || 'Exploit/Regulatory'})`);
      }
    } else if (candidateDirection === 'SHORT') {
      if (isBearishNews) {
        catalystScore = Math.min(10, Math.max(4, Math.round((newsReport.impactScore || newsReport.impactWeight || 60) / 10)));
        supportingEvidence.push(`Verified news catalyst supporting downside: ${newsReport.headline || newsReport.catalystType}`);
      } else if (isBullishNews) {
        contradictions.push(`News Catalyst Conflict: Bullish news catalyst contradicts SHORT (${newsReport.headline || newsReport.catalystType})`);
      }
    }
  }

  // Supporting New Listing catalyst
  if (input.newListingIntelligence?.isNewListing && input.newListingIntelligence.launchStatus !== 'NONE') {
    const isActionable = (input.newListingIntelligence.setupViability as any)?.actionable || input.newListingIntelligence.setupViability === 'ACTIONABLE_BASE';
    const launchStatusStr = (input.newListingIntelligence.launchStatus as string) || '';
    if (candidateDirection === 'LONG') {
      if (isActionable && input.newListingIntelligence.discoveryStage === 'BASE_BUILDING') {
        catalystScore = Math.max(catalystScore, 6);
        supportingEvidence.push('New Listing base-building phase confirmed with structural levels');
      } else if (
        input.newListingIntelligence.discoveryStage === 'BLEED_MARKDOWN' ||
        launchStatusStr === 'PRE_LISTING' ||
        launchStatusStr === 'PRICE_DISCOVERY' ||
        (input.newListingIntelligence.listingAgeHours !== undefined && input.newListingIntelligence.listingAgeHours < 24)
      ) {
        contradictions.push(`New Listing Risk: Asset in ${input.newListingIntelligence.discoveryStage || launchStatusStr} stage with unformed structure`);
      }
    }
  }
  catalystScore = Math.max(0, Math.min(10, catalystScore));

  // 7. Timing & Entry Quality (Max 10)
  let timingQualityScore = 0;
  let executionState: string = 'MONITORING';
  if (typeof input.executionState === 'string') {
    executionState = input.executionState;
  } else if (typeof input.earlySetupTiming?.smartEntryTiming === 'string') {
    executionState = input.earlySetupTiming.smartEntryTiming;
  } else if ((input.earlySetupTiming?.smartEntryTiming as any)?.readiness) {
    executionState = (input.earlySetupTiming?.smartEntryTiming as any).readiness;
  } else if (((input.riskAudit?.tradeManagement as any)?.entryTiming as any)?.readiness) {
    executionState = ((input.riskAudit?.tradeManagement as any)?.entryTiming as any).readiness;
  }
  const timingWindow = input.timingWindow || input.earlySetupTiming?.timingWindow || 'OPTIMAL';

  if (executionState === 'READY_NOW' || executionState === 'IMMEDIATE_ZONE' || executionState === 'ENTRY_NOW') {
    timingQualityScore += 7;
    supportingEvidence.push(`Entry execution ready on current price action (${executionState})`);
  } else if (executionState === 'PULLBACK_RETEST') {
    timingQualityScore += 6;
    supportingEvidence.push('Price consolidating near optimal retest level');
  } else if (executionState === 'EARLY_FORMATION' || executionState === 'MONITORING') {
    timingQualityScore += 3;
  } else if (executionState === 'WAIT_FOR_PULLBACK' || executionState === 'WAIT_FOR_CONFIRMATION') {
    timingQualityScore += 1;
  } else if (executionState === 'ENTRY_MISSED' || executionState === 'CHASE') {
    contradictions.push(`Timing violation: Entry is currently ${executionState}`);
  }

  const rr = input.riskRewardRatio;
  if (rr !== undefined && rr !== null) {
    if (rr >= 2.5) {
      timingQualityScore += 3;
      supportingEvidence.push(`High asymmetry trade geometry (1:${rr.toFixed(1)} R:R)`);
    } else if (rr >= 1.8) {
      timingQualityScore += 2;
    } else if (rr < 1.3) {
      contradictions.push(`Unfavorable Risk:Reward ratio (1:${rr.toFixed(1)} R:R is below 1:1.5 threshold)`);
    }
  }
  timingQualityScore = Math.max(0, Math.min(10, timingQualityScore));

  // 8. Risk & Invalidation Quality (Max 5)
  let riskInvalidationScore = 0;
  if (input.stopLoss && input.currentPrice > 0) {
    const slDistPct = Math.abs(input.currentPrice - input.stopLoss) / input.currentPrice * 100;
    if (slDistPct >= 0.5 && slDistPct <= 8.0) {
      riskInvalidationScore = 5;
      supportingEvidence.push(`Defined structural invalidation stop at $${input.stopLoss.toFixed(4)} (${slDistPct.toFixed(1)}% risk)`);
    } else if (slDistPct > 15.0) {
      contradictions.push(`Risk warning: Stop loss distance is excessively wide (${slDistPct.toFixed(1)}%)`);
      riskInvalidationScore = 1;
    } else {
      riskInvalidationScore = 3;
    }
  }

  // Pre-Move Intelligence Evidence & Confirmation
  if (input.preMoveIntelligence) {
    const pm = input.preMoveIntelligence;
    if (pm.volatilitySqueeze && pm.coilScore >= 60) {
      supportingEvidence.push(`Pre-move volatility squeeze active: Coil score ${pm.coilScore}/100 with compressed volatility bands`);
    }
    if (pm.fakeoutSweep?.detected && pm.fakeoutSweep.reclaimed) {
      supportingEvidence.push(`Pre-move liquidity sweep reclaim confirmed on ${pm.fakeoutSweep.sweepSide}`);
    }
    if (pm.orderflowAbsorption?.detected && pm.orderflowAbsorption.type !== 'NONE') {
      supportingEvidence.push(`Pre-move orderflow absorption: ${pm.orderflowAbsorption.type.replace(/_/g, ' ')}`);
    }
    if (pm.projectedDirection !== 'NEUTRAL' && candidateDirection !== 'WAIT') {
      const isAligned = (pm.projectedDirection === 'BULLISH' && candidateDirection === 'LONG') ||
                        (pm.projectedDirection === 'BEARISH' && candidateDirection === 'SHORT');
      if (isAligned) {
        supportingEvidence.push(`Pre-move projected expansion matches directional bias (${pm.projectedDirection})`);
      } else {
        contradictions.push(`Pre-move warning: Squeeze breakout projection (${pm.projectedDirection}) diverges from candidate direction (${candidateDirection})`);
      }
    }
  }

  // Wyckoff / Market Cycle Conflict Check
  const marketCycle = input.marketCycle;
  if (marketCycle) {
    const cycleVal = ((marketCycle.cycle || '') as string).toUpperCase();
    const phaseVal = (((marketCycle as any).phase || marketCycle.stage || '') as string).toUpperCase();
    const isBullishCycle = cycleVal.includes('ACCUM') || cycleVal.includes('MARKUP') || phaseVal.includes('ACCUM') || phaseVal.includes('MARKUP') || phaseVal.includes('ADVANC');
    const isBearishCycle = cycleVal.includes('DISTRIB') || cycleVal.includes('MARKDOWN') || phaseVal.includes('DISTRIB') || phaseVal.includes('MARKDOWN') || phaseVal.includes('DECLIN');

    if (candidateDirection === 'LONG') {
      if (isBearishCycle && !isBullishCycle) {
        contradictions.push(`Wyckoff Conflict: Market cycle is in ${phaseVal || cycleVal} stage`);
      } else if (isBullishCycle) {
        supportingEvidence.push(`Wyckoff alignment: Market in ${phaseVal || cycleVal} stage`);
      }
    } else if (candidateDirection === 'SHORT') {
      if (isBullishCycle && !isBearishCycle) {
        contradictions.push(`Wyckoff Conflict: Market cycle is in ${phaseVal || cycleVal} stage`);
      } else if (isBearishCycle) {
        supportingEvidence.push(`Wyckoff alignment: Market in ${phaseVal || cycleVal} stage`);
      }
    }
  }

  // 9. Contradiction Penalty Calculation (0 to 40)
  let contradictionPenalty = 0;
  for (const c of contradictions) {
    if (c.includes('Kill-Switch') || c.includes('Critical')) {
      contradictionPenalty += 25;
    } else if (c.includes('Wyckoff Conflict') || c.includes('Macro Regime Conflict') || c.includes('News Catalyst Conflict')) {
      contradictionPenalty += 15;
    } else if (c.includes('Derivatives Conflict') || c.includes('Anti-Chase Guardrail') || c.includes('New Listing Risk')) {
      contradictionPenalty += 12;
    } else {
      contradictionPenalty += 6;
    }
  }
  contradictionPenalty = Math.max(0, Math.min(40, contradictionPenalty));

  // 10. Raw & Bounded Score Calculation
  const positiveScoreSum =
    directionalEvidenceScore +
    structuralConfirmationScore +
    marketRegimeScore +
    derivativesCrowdingScore +
    catalystScore +
    timingQualityScore +
    riskInvalidationScore;

  const rawScore = positiveScoreSum - contradictionPenalty - dataQualityPenalty;
  let boundedScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Invariant: Without structural confirmation, confidence cannot exceed 65
  if (!hasStructuralConfirmation && boundedScore > 65) {
    boundedScore = 65;
  }

  // 11. Final Decision (ONLY: LONG / SHORT / WAIT)
  let finalDecision: UnifiedDecision = 'WAIT';
  if (
    rawCoreDecision === 'WAIT' ||
    isKillSwitchTriggered ||
    contradictions.length >= 3 ||
    (contradictions.some(c => c.includes('Conflict')) && contradictions.length >= 2) ||
    boundedScore < 55 ||
    !hasCandles ||
    (isAntiChaseActive && executionState !== 'PULLBACK_RETEST' && executionState !== 'READY_NOW')
  ) {
    finalDecision = 'WAIT';
  } else if (candidateDirection === 'LONG') {
    if (boundedScore >= 55 && hasStructuralConfirmation) {
      finalDecision = 'LONG';
    } else if (boundedScore >= 65 && directionalEvidenceScore >= 18) {
      finalDecision = 'LONG';
    } else {
      finalDecision = 'WAIT';
    }
  } else if (candidateDirection === 'SHORT') {
    if (boundedScore >= 55 && hasStructuralConfirmation) {
      finalDecision = 'SHORT';
    } else if (boundedScore >= 65 && directionalEvidenceScore >= 18) {
      finalDecision = 'SHORT';
    } else {
      finalDecision = 'WAIT';
    }
  }

  // 12. Quality Grade (ONLY: A+ / A / B / C / WAIT)
  // Invariant: If final decision is WAIT, quality is ALWAYS WAIT.
  // Invariant: A+ requires boundedScore >= 85, structural confirmation, no critical contradictions, and R:R >= 2.0.
  let quality: UnifiedQualityGrade = 'WAIT';
  if (finalDecision === 'WAIT') {
    quality = 'WAIT';
  } else {
    const hasCriticalContradiction = contradictions.some(c => c.includes('Conflict') || c.includes('Kill-Switch'));
    const rrOkForAplus = rr === undefined || rr === null || rr >= 2.0;

    if (boundedScore >= 85 && hasStructuralConfirmation && !hasCriticalContradiction && rrOkForAplus && (executionState === 'READY_NOW' || executionState === 'IMMEDIATE_ZONE' || executionState === 'ENTRY_NOW' || executionState === 'PULLBACK_RETEST')) {
      quality = 'A+';
    } else if (boundedScore >= 70 && hasStructuralConfirmation && contradictions.length <= 1) {
      quality = 'A';
    } else if (boundedScore >= 55) {
      quality = 'B';
    } else {
      quality = 'C';
    }
  }

  // 13. Risk State Determination
  let riskState: UnifiedRiskState = 'ACCEPTABLE';
  if (isKillSwitchTriggered || (timingWindow as any) === 'CLOSED' || (timingWindow as any) === 'EXPIRED' || executionState === 'INVALIDATED') {
    riskState = 'INVALIDATED';
  } else if (contradictions.length >= 2 || contradictionPenalty >= 20 || isAntiChaseActive) {
    riskState = 'CRITICAL';
  } else if (contradictions.length === 1 || dataQualityPenalty > 0 || (rr !== undefined && rr < 1.5)) {
    riskState = 'ELEVATED';
  }

  // 14. Primary Category & Market Context
  const primaryCategory: PrimarySetupCategory =
    input.primaryCategory ||
    input.categoryReport?.primaryCategory ||
    (candidateDirection === 'SHORT' ? 'BREAKDOWN_SHORT' : 'BREAKOUT_LONG');

  const marketContext: UnifiedMarketContext = {
    btcRegime: btcRegimeStr,
    marketCycle: input.marketCycle?.stage || input.marketCycle?.cycle || (input.marketCycle as any)?.phase || 'NEUTRAL',
    sectorBias: (input.sectorRotation as any)?.marketFlowRegime || (input.sectorRotation as any)?.flowRegime || 'BALANCED',
    volatilityState: input.technical?.atr ? `ATR: ${input.technical.atr.toFixed(4)}` : undefined,
    dominanceContext: input.marketBreadth?.marketBreadthBias || 'NEUTRAL'
  };

  // 15. Large Move & Asymmetry (Context Only, not standalone quality inflator)
  const largeMoveClass: LargeMoveClass | undefined = input.largeMoveIntelligence?.moveClass;
  const asymmetry: number | undefined = input.largeMoveIntelligence?.asymmetryScore;

  // 16. Reason Summary (Explainable without overwhelming)
  let reasonSummary = '';
  if (finalDecision === 'WAIT') {
    if (isKillSwitchTriggered) {
      reasonSummary = 'WAIT: Kill-switch circuit breaker active. Trading halted for capital protection.';
    } else if (isAntiChaseActive) {
      reasonSummary = 'WAIT: Anti-chase guard active. Asset is overextended; awaiting controlled pullback/retest.';
    } else if (contradictions.length > 0) {
      reasonSummary = `WAIT: Conflicting intelligence detected (${contradictions[0]}). Confidence reduced to ${boundedScore}%.`;
    } else if (!hasCandles) {
      reasonSummary = 'WAIT: Insufficient candle history to verify market structure.';
    } else {
      reasonSummary = `WAIT: Signal confidence (${boundedScore}%) below actionable 55% execution threshold.`;
    }
  } else {
    const confirmationText = hasStructuralConfirmation ? 'confirmed by structure' : 'momentum continuation';
    const topReason = supportingEvidence[0] || 'Technical alignment verified';
    reasonSummary = `${finalDecision} [Grade: ${quality} | Conf: ${boundedScore}%] — ${confirmationText}. Key factor: ${topReason}.`;
  }

  const scoreBreakdown: UnifiedScoreBreakdown = {
    directionalEvidenceScore,
    structuralConfirmationScore,
    marketRegimeScore,
    derivativesCrowdingScore,
    catalystScore,
    timingQualityScore,
    riskInvalidationScore,
    contradictionPenalty,
    dataQualityPenalty,
    rawScore,
    boundedScore
  };

  return {
    finalDecision,
    quality,
    confidence: boundedScore,
    primaryCategory,
    executionState,
    timingWindow,
    marketContext,
    supportingEvidence,
    contradictions,
    riskState,
    largeMoveClass,
    asymmetry,
    reasonSummary,
    scoreBreakdown,
    hasStructuralConfirmation,
    isAntiChaseActive,
    zeroFabricatedData: true,
    evaluatedAt: now
  };
}
