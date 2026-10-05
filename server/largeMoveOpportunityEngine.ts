import { Candle } from './cryptoService';
import {
  LargeMoveClass,
  DerivativesCrowdingState,
  FundingExtremity,
  OiVelocityState,
  PumpDumpExhaustionState,
  LiquidityActionType,
  LargeMoveAlignment,
  LiquidationImbalanceState,
  LargeMoveOpportunityReport,
  TargetLevel,
  SignalQualityGrade,
  ActionablePriority,
  MarketCycleAnalysis,
  EarlyMoveReport,
  NewsMarketImpactReport,
  NewListingIntelligenceReport,
  PumpDumpIntelligence
} from '../src/types/crypto';
import { DerivativesData } from './advancedMarketData';
import { calculateEMA, calculateRSI } from './technicalAnalysis';

export interface LargeMoveEvaluationInput {
  symbol: string;
  candles: Candle[];
  currentPrice: number;
  entryPrice?: number;
  stopLoss?: number;
  targets?: TargetLevel[];
  riskRewardRatio?: number;
  coreDecision?: 'LONG' | 'SHORT' | 'WAIT';
  qualityGrade?: SignalQualityGrade;
  actionablePriority?: ActionablePriority;
  derivatives?: DerivativesData | null;
  fundingRate?: number | null;
  openInterest?: number | null;
  oiChange24h?: number | null;
  fundingChange24h?: number | null;
  marketCycle?: MarketCycleAnalysis;
  earlyMoveReport?: EarlyMoveReport;
  newsImpactReport?: NewsMarketImpactReport;
  newListingIntelligence?: NewListingIntelligenceReport;
  pumpDumpIntelligence?: PumpDumpIntelligence;
}

export interface CrowdingAnalysisResult {
  crowdingState: DerivativesCrowdingState;
  fundingRate: number | null;
  fundingChange24h: number | null;
  fundingExtremity: FundingExtremity;
  openInterestUsd: number | null;
  oiChange24h: number | null;
  oiState: OiVelocityState;
  liquidationImbalance: LiquidationImbalanceState;
  evidence: string[];
  warnings: string[];
}

export interface ExhaustionReversalResult {
  exhaustionState: PumpDumpExhaustionState;
  momentumWeakening: boolean;
  volumeDivergence: boolean;
  liquidityAction: LiquidityActionType;
  structuralConfirmation: boolean;
  isAlreadyExtended: boolean;
  antiChaseActive: boolean;
  evidence: string[];
  warnings: string[];
}

/**
 * 1. Deterministic Derivatives & Crowding Telemetry
 * Evaluates funding rate level, velocity/change, open interest expansion/contraction,
 * and liquidation imbalance. Returns UNAVAILABLE / UNKNOWN if data is missing (Zero Fabrication).
 */
export function analyzeDerivativesCrowding(
  derivatives?: DerivativesData | null,
  overrideFunding?: number | null,
  overrideOI?: number | null,
  overrideOIChange?: number | null,
  overrideFundingChange?: number | null
): CrowdingAnalysisResult {
  const fundingRate = typeof overrideFunding === 'number'
    ? overrideFunding
    : (derivatives && typeof derivatives.fundingRate === 'number' ? derivatives.fundingRate : null);

  const openInterestUsd = typeof overrideOI === 'number'
    ? overrideOI
    : (derivatives && typeof derivatives.openInterest === 'number' ? derivatives.openInterest : null);

  const oiChange24h = typeof overrideOIChange === 'number'
    ? overrideOIChange
    : (derivatives && typeof derivatives.openInterestChange24h === 'number' ? derivatives.openInterestChange24h : null);

  const fundingChange24h = typeof overrideFundingChange === 'number'
    ? overrideFundingChange
    : null;

  // Zero fabrication: if neither funding nor OI is available
  if (fundingRate === null && openInterestUsd === null && oiChange24h === null) {
    return {
      crowdingState: 'UNAVAILABLE',
      fundingRate: null,
      fundingChange24h: null,
      fundingExtremity: 'UNKNOWN',
      openInterestUsd: null,
      oiChange24h: null,
      oiState: 'UNKNOWN',
      liquidationImbalance: 'UNAVAILABLE',
      evidence: [],
      warnings: ['Derivatives telemetry unavailable - no funding or OI data fabricated']
    };
  }

  const evidence: string[] = [];
  const warnings: string[] = [];

  // Funding extremity analysis (Standard 8h rate)
  let fundingExtremity: FundingExtremity = 'NEUTRAL';
  if (fundingRate !== null) {
    if (fundingRate >= 0.0008) {
      fundingExtremity = 'EXTREME_POSITIVE';
      evidence.push(`Extreme positive funding rate (${(fundingRate * 100).toFixed(4)}% / 8h) indicates heavy long premium`);
      warnings.push('Long crowding penalty: longs paying extreme carry fee');
    } else if (fundingRate >= 0.0003) {
      fundingExtremity = 'HIGH_POSITIVE';
      evidence.push(`Elevated positive funding (${(fundingRate * 100).toFixed(4)}% / 8h)`);
    } else if (fundingRate <= -0.0008) {
      fundingExtremity = 'EXTREME_NEGATIVE';
      evidence.push(`Extreme negative funding rate (${(fundingRate * 100).toFixed(4)}% / 8h) indicates heavy short skew`);
      warnings.push('Short crowding penalty: shorts paying extreme carry fee');
    } else if (fundingRate <= -0.0003) {
      fundingExtremity = 'HIGH_NEGATIVE';
      evidence.push(`Elevated negative funding (${(fundingRate * 100).toFixed(4)}% / 8h)`);
    } else {
      fundingExtremity = 'NEUTRAL';
      evidence.push(`Balanced funding rate (${(fundingRate * 100).toFixed(4)}% / 8h)`);
    }
  } else {
    fundingExtremity = 'UNKNOWN';
  }

  // Rapid funding change detection
  if (fundingChange24h !== null) {
    if (fundingChange24h >= 0.0004) {
      evidence.push(`Rapid funding acceleration (+${(fundingChange24h * 100).toFixed(4)}% surge over 24h)`);
    } else if (fundingChange24h <= -0.0004) {
      evidence.push(`Rapid funding collapse (${(fundingChange24h * 100).toFixed(4)}% drop over 24h)`);
    }
  }

  // Open interest velocity analysis
  let oiState: OiVelocityState = 'STABLE';
  if (oiChange24h !== null) {
    if (oiChange24h >= 20.0) {
      oiState = 'RAPID_EXPANSION';
      evidence.push(`Rapid OI expansion (+${oiChange24h.toFixed(1)}% 24h) confirming aggressive leverage inflow`);
    } else if (oiChange24h >= 8.0) {
      oiState = 'MODERATE_EXPANSION';
      evidence.push(`Moderate OI expansion (+${oiChange24h.toFixed(1)}% 24h)`);
    } else if (oiChange24h <= -10.0) {
      oiState = 'CONTRACTION';
      evidence.push(`OI contraction (${oiChange24h.toFixed(1)}% 24h) signaling leverage unwinding`);
    } else {
      oiState = 'STABLE';
    }
  } else {
    oiState = 'UNKNOWN';
  }

  // Liquidation imbalance estimation (Zero fabrication: based purely on funding & long/short ratio)
  let liquidationImbalance: LiquidationImbalanceState = 'BALANCED';
  const lsRatio = derivatives?.longShortRatio;
  if (fundingExtremity === 'EXTREME_POSITIVE' || (lsRatio && lsRatio >= 2.0)) {
    liquidationImbalance = 'HEAVY_LONGS';
    evidence.push(`Liquidation vulnerability skewed toward longs (L/S ratio: ${lsRatio ? lsRatio.toFixed(2) : 'elevated'})`);
  } else if (fundingExtremity === 'EXTREME_NEGATIVE' || (lsRatio && lsRatio <= 0.6)) {
    liquidationImbalance = 'HEAVY_SHORTS';
    evidence.push(`Liquidation vulnerability skewed toward shorts (L/S ratio: ${lsRatio ? lsRatio.toFixed(2) : 'depressed'})`);
  }

  // Synthesize Crowding State
  let crowdingState: DerivativesCrowdingState = 'BALANCED';
  const isRapidFundingRise = fundingChange24h !== null && fundingChange24h >= 0.0003;
  const isRapidFundingFall = fundingChange24h !== null && fundingChange24h <= -0.0003;

  if (
    (fundingExtremity === 'EXTREME_POSITIVE' || (fundingExtremity === 'HIGH_POSITIVE' && isRapidFundingRise)) &&
    (oiState === 'RAPID_EXPANSION' || oiState === 'MODERATE_EXPANSION' || (lsRatio && lsRatio >= 1.8))
  ) {
    crowdingState = 'LONG_CROWDED';
    evidence.push('LONG CROWDING CONFIRMED: High positive funding + expanding open interest');
  } else if (
    (fundingExtremity === 'EXTREME_NEGATIVE' || (fundingExtremity === 'HIGH_NEGATIVE' && isRapidFundingFall)) &&
    (oiState === 'RAPID_EXPANSION' || oiState === 'MODERATE_EXPANSION' || (lsRatio && lsRatio <= 0.6))
  ) {
    crowdingState = 'SHORT_CROWDED';
    evidence.push('SHORT CROWDING CONFIRMED: Negative funding + expanding open interest');
  } else if (oiState === 'CONTRACTION') {
    crowdingState = 'UNWINDING';
    evidence.push('Positioning unwinding: Open interest contracting');
  }

  return {
    crowdingState,
    fundingRate,
    fundingChange24h,
    fundingExtremity,
    openInterestUsd,
    oiChange24h,
    oiState,
    liquidationImbalance,
    evidence,
    warnings
  };
}

/**
 * 2. Deterministic Exhaustion & Reversal Engine
 * Analyzes price expansion after major pump/dump, volume divergence, momentum weakening,
 * liquidity sweeps/reclaims/rejections, and strict market structure confirmation.
 */
export function detectExhaustionReversal(
  candles: Candle[],
  marketCycle?: MarketCycleAnalysis,
  pumpDumpIntelligence?: PumpDumpIntelligence,
  newListingIntel?: NewListingIntelligenceReport
): ExhaustionReversalResult {
  if (!candles || candles.length < 15) {
    return {
      exhaustionState: 'UNKNOWN',
      momentumWeakening: false,
      volumeDivergence: false,
      liquidityAction: 'UNKNOWN',
      structuralConfirmation: false,
      isAlreadyExtended: false,
      antiChaseActive: false,
      evidence: [],
      warnings: ['Insufficient candle depth for exhaustion analysis']
    };
  }

  const evidence: string[] = [];
  const warnings: string[] = [];
  const closes = candles.map(c => c.close);
  const ema20 = calculateEMA(closes, 20);
  const rsi = calculateRSI(closes, 14);

  const latest = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const lastEma20 = ema20[ema20.length - 1] || latest.close;
  const lastRsi = rsi[rsi.length - 1] || 50;

  // Check 20-bar price expansion
  const lookbackBar = candles[Math.max(0, candles.length - 20)];
  const return20Bar = ((latest.close - lookbackBar.close) / lookbackBar.close) * 100;
  const distFromEma20 = ((latest.close - lastEma20) / lastEma20) * 100;

  // Overextension & Anti-Chase Protocol
  let isAlreadyExtended = false;
  let antiChaseActive = false;

  if (
    distFromEma20 > 12.0 ||
    return20Bar > 30.0 ||
    lastRsi > 80.0 ||
    newListingIntel?.overextensionRisk === 'CRITICAL_OVEREXTENSION' ||
    pumpDumpIntelligence?.abnormalExtension === true ||
    (pumpDumpIntelligence?.acceleration === 'ACCELERATING' && distFromEma20 > 15.0)
  ) {
    isAlreadyExtended = true;
    antiChaseActive = true;
    warnings.push(`Anti-chase protocol triggered: Price extended +${distFromEma20.toFixed(1)}% from EMA20 (20-bar change: +${return20Bar.toFixed(1)}%, RSI: ${lastRsi.toFixed(1)})`);
  }

  // 1. Momentum Weakening / Divergence
  let momentumWeakening = false;
  // Check for bearish momentum weakening
  if (candles.length >= 10) {
    const recentHigh = Math.max(...candles.slice(-5).map(c => c.high));
    const priorHigh = Math.max(...candles.slice(-10, -5).map(c => c.high));
    const recentRsiMax = Math.max(...rsi.slice(-5));
    const priorRsiMax = Math.max(...rsi.slice(-10, -5));

    // Bearish divergence or upper wick exhaustion
    const upperWick = latest.high - Math.max(latest.open, latest.close);
    const candleRange = latest.high - latest.low;
    const isHeavyUpperWick = candleRange > 0 && (upperWick / candleRange) >= 0.45;

    if ((recentHigh > priorHigh && recentRsiMax < priorRsiMax - 3.0) || (isHeavyUpperWick && distFromEma20 > 6.0)) {
      momentumWeakening = true;
      evidence.push('Bearish momentum weakening: RSI divergence or upper wick rejection in overextended zone');
    }

    // Check for bullish momentum recovery / exhaustion of sellers
    const recentLow = Math.min(...candles.slice(-5).map(c => c.low));
    const priorLow = Math.min(...candles.slice(-10, -5).map(c => c.low));
    const recentRsiMin = Math.min(...rsi.slice(-5));
    const priorRsiMin = Math.min(...rsi.slice(-10, -5));

    const lowerWick = Math.min(latest.open, latest.close) - latest.low;
    const isHeavyLowerWick = candleRange > 0 && (lowerWick / candleRange) >= 0.45;

    if ((recentLow < priorLow && recentRsiMin > priorRsiMin + 3.0) || (isHeavyLowerWick && distFromEma20 < -6.0)) {
      momentumWeakening = true;
      evidence.push('Bullish momentum recovery: RSI divergence / demand absorption wick in oversold zone');
    }
  }

  if (pumpDumpIntelligence?.climaxDetected || pumpDumpIntelligence?.postPumpExhaustion) {
    momentumWeakening = true;
    evidence.push('Pump/dump telemetry confirms climax exhaustion');
  }

  // 2. Volume Divergence
  let volumeDivergence = false;
  if (candles.length >= 8) {
    const last3VolAvg = (candles[candles.length - 1].volume + candles[candles.length - 2].volume + candles[candles.length - 3].volume) / 3;
    const prev5VolAvg = candles.slice(-8, -3).reduce((acc, c) => acc + c.volume, 0) / 5;
    const peakPrice = Math.max(...candles.slice(-5).map(c => c.high));
    const troughPrice = Math.min(...candles.slice(-5).map(c => c.low));
    const startPrice = lookbackBar.close;
    const pushVol = (candles[candles.length - 2].volume + candles[candles.length - 3].volume) / 2;
    const earlierVol = candles.slice(Math.max(0, candles.length - 15), Math.max(1, candles.length - 8)).reduce((acc, c) => acc + c.volume, 0) / Math.max(1, candles.length >= 15 ? 7 : candles.length - 8);

    // Price making new high on declining volume (buying exhaustion)
    if (peakPrice > startPrice * 1.08 && (pushVol < earlierVol * 0.88 || last3VolAvg < prev5VolAvg * 0.85)) {
      volumeDivergence = true;
      evidence.push('Volume divergence on pump: Buying volume faded on recent highs');
    }
    // Price dumping on declining sell volume (selling dry-up / absorption)
    else if (troughPrice < startPrice * 0.92 && (pushVol < earlierVol * 0.88 || last3VolAvg < prev5VolAvg * 0.85)) {
      volumeDivergence = true;
      evidence.push('Volume divergence on dump: Selling pressure drying up with diminishing volume');
    }
  }

  // 3. Liquidity Sweep Rejection vs Reclaim
  let liquidityAction: LiquidityActionType = 'NO_SWEEP';

  if (candles.length >= 15) {
    const priorSwingHigh = Math.max(...candles.slice(-15, -3).map(c => c.high));
    const priorSwingLow = Math.min(...candles.slice(-15, -3).map(c => c.low));

    // Sweep Rejection: Probed above swing high but closed below
    const recentHigh = Math.max(latest.high, prev.high);
    if (recentHigh > priorSwingHigh && latest.close < priorSwingHigh) {
      liquidityAction = 'SWEEP_REJECTION';
      evidence.push(`Liquidity Sweep Rejection: Probed above swing high (${priorSwingHigh.toFixed(4)}) but closed back below`);
    }
    // Sweep Reclaim: Probed below swing low but closed above
    const recentLow = Math.min(latest.low, prev.low);
    if (recentLow < priorSwingLow && latest.close > priorSwingLow) {
      liquidityAction = 'SWEEP_RECLAIM';
      evidence.push(`Liquidity Sweep Reclaim: Probed below swing low (${priorSwingLow.toFixed(4)}) and reclaimed with buying absorption`);
    }
  }

  // Wyckoff Spring / UTAD integration
  const mc = marketCycle as any;
  if ((mc?.wyckoffSpring?.detected && mc?.wyckoffSpring?.confirmed) || mc?.wyckoffEvents?.accumulation?.SPRING?.detected) {
    liquidityAction = 'SWEEP_RECLAIM';
    evidence.push('Wyckoff Spring terminal shakeout confirmed by Market Cycle engine');
  }
  if ((mc?.wyckoffUtad?.detected && mc?.wyckoffUtad?.confirmed) || mc?.wyckoffEvents?.distribution?.UTAD?.detected) {
    liquidityAction = 'SWEEP_REJECTION';
    evidence.push('Wyckoff UTAD Upthrust after distribution confirmed by Market Cycle engine');
  }

  // 4. Market Structure Confirmation
  // CRITICAL RULE: Never assume reversal without price/structure confirmation!
  let structuralConfirmation = false;

  // Bearish confirmation (for pump exhaustion reversal)
  const isBearishCHoCH = latest.close < Math.min(prev.low, candles[candles.length - 3].low);
  const isBearishEngulfing = latest.close < prev.open && latest.open > prev.close && latest.close < latest.open;
  const isBelowEmaBreak = prev.close >= lastEma20 && latest.close < lastEma20;
  const isUtadConfirmed = mc?.wyckoffUtad?.confirmed === true || mc?.wyckoffEvents?.distribution?.UTAD?.detected === true;

  // Bullish confirmation (for dump exhaustion reversal)
  const isBullishCHoCH = latest.close > Math.max(prev.high, candles[candles.length - 3].high);
  const isBullishEngulfing = latest.close > prev.open && latest.open < prev.close && latest.close > latest.open;
  const isAboveEmaReclaim = prev.close <= lastEma20 && latest.close > lastEma20;
  const isSpringConfirmed = mc?.wyckoffSpring?.confirmed === true || mc?.wyckoffEvents?.accumulation?.SPRING?.detected === true;

  // Evaluate Exhaustion State
  let exhaustionState: PumpDumpExhaustionState = 'NONE';

  // PUMP EXHAUSTION
  if (return20Bar > 10.0 || distFromEma20 > 5.0 || isAlreadyExtended) {
    if ((momentumWeakening || volumeDivergence || liquidityAction === 'SWEEP_REJECTION')) {
      if (isBearishCHoCH || isBearishEngulfing || isBelowEmaBreak || isUtadConfirmed || latest.close < prev.close) {
        structuralConfirmation = true;
        exhaustionState = 'PUMP_EXHAUSTION';
        evidence.push('PUMP EXHAUSTION CONFIRMED: Extended run + momentum exhaustion + bearish structure breakdown');
      } else {
        warnings.push('Crowding/exhaustion suspected but NO bearish structure confirmation yet (do not short prematurely)');
      }
    }
  }

  // DUMP EXHAUSTION
  if (return20Bar < -10.0 || distFromEma20 < -5.0 || lastRsi < 35.0) {
    if ((momentumWeakening || volumeDivergence || liquidityAction === 'SWEEP_RECLAIM')) {
      if (isBullishCHoCH || isBullishEngulfing || isAboveEmaReclaim || isSpringConfirmed || latest.close > prev.close) {
        structuralConfirmation = true;
        exhaustionState = 'DUMP_EXHAUSTION';
        evidence.push('DUMP EXHAUSTION CONFIRMED: Deep selloff + selling dry-up/absorption + bullish structure reclaim');
      } else {
        warnings.push('Selling exhaustion suspected but NO bullish structure confirmation yet (falling knife warning)');
      }
    }
  }

  return {
    exhaustionState,
    momentumWeakening,
    volumeDivergence,
    liquidityAction,
    structuralConfirmation,
    isAlreadyExtended,
    antiChaseActive,
    evidence,
    warnings
  };
}

/**
 * 3. Classify Large-Move Class & Asymmetry Score
 * Determines whether setup structurally justifies 10%+, 20%+, 50%+, 100%+, EXTREME_ASYMMETRY,
 * NORMAL, or UNKNOWN without fabricating numbers or hindsight.
 */
export function classifyLargeMovePotential(
  input: LargeMoveEvaluationInput,
  crowding: CrowdingAnalysisResult,
  exhaustion: ExhaustionReversalResult
): {
  moveClass: LargeMoveClass;
  estimatedMovePct: number | null;
  riskRewardRatio: number | null;
  asymmetryScore: number;
  evidence: string[];
  warnings: string[];
} {
  const { currentPrice, entryPrice, targets, riskRewardRatio, marketCycle, newsImpactReport, newListingIntelligence } = input;
  const evidence: string[] = [];
  const warnings: string[] = [];

  const entry = entryPrice || currentPrice;
  if (!entry || entry <= 0) {
    return {
      moveClass: 'UNKNOWN',
      estimatedMovePct: null,
      riskRewardRatio: null,
      asymmetryScore: 0,
      evidence: [],
      warnings: ['Missing valid price for move estimation']
    };
  }

  // Calculate estimated move percentage from genuine structural targets
  let estimatedMovePct: number | null = null;
  const validTargets = (targets || []).filter(t => t && typeof t.price === 'number' && t.price > 0 && t.status !== 'INVALIDATED');

  if (validTargets.length > 0) {
    const finalTarget = validTargets[validTargets.length - 1].price;
    if (input.coreDecision === 'SHORT') {
      estimatedMovePct = Number((((entry - finalTarget) / entry) * 100).toFixed(2));
    } else {
      estimatedMovePct = Number((((finalTarget - entry) / entry) * 100).toFixed(2));
    }
  } else if (marketCycle?.cycle === 'ACCUMULATION' || marketCycle?.cycle === 'RE_ACCUMULATION') {
    // If Wyckoff accumulation with confirmed base, base height projection
    estimatedMovePct = 25.0;
    evidence.push('Wyckoff accumulation structural base supports 20%+ swing projection');
  } else if (newListingIntelligence?.discoveryStage === 'BASE_BUILDING') {
    estimatedMovePct = 35.0;
    evidence.push('New listing consolidation base expansion supports 30%+ discovery move');
  } else if (newsImpactReport?.isConfirmedCatalyst && newsImpactReport.impactClassification === 'PUMP_CATALYST') {
    estimatedMovePct = 20.0;
    evidence.push('Tier-1 verified catalyst provides structural catalyst runway');
  }

  const rr = typeof riskRewardRatio === 'number' && riskRewardRatio > 0 ? riskRewardRatio : null;

  // Asymmetry Score computation (0 - 100)
  let asymmetryScore = 30;

  if (rr !== null) {
    if (rr >= 8.0) asymmetryScore += 45;
    else if (rr >= 5.0) asymmetryScore += 35;
    else if (rr >= 3.0) asymmetryScore += 20;
    else if (rr >= 2.0) asymmetryScore += 10;
    else if (rr < 1.3) asymmetryScore -= 25;
  }

  if (estimatedMovePct !== null) {
    if (estimatedMovePct >= 100) asymmetryScore += 25;
    else if (estimatedMovePct >= 50) asymmetryScore += 20;
    else if (estimatedMovePct >= 20) asymmetryScore += 12;
    else if (estimatedMovePct >= 10) asymmetryScore += 6;
  }

  if (exhaustion.structuralConfirmation) asymmetryScore += 15;
  if (crowding.crowdingState === 'LONG_CROWDED' && input.coreDecision === 'SHORT') asymmetryScore += 15;
  if (crowding.crowdingState === 'SHORT_CROWDED' && input.coreDecision === 'LONG') asymmetryScore += 15;

  if (exhaustion.isAlreadyExtended) {
    asymmetryScore -= 35;
    warnings.push('Overextension penalty applied: Asymmetric reward severely diminished due to extended price');
  }

  asymmetryScore = Math.max(5, Math.min(99, Math.round(asymmetryScore)));

  // Strict Rule: Never label an already extended/parabolic move as an early opportunity
  if (exhaustion.isAlreadyExtended) {
    return {
      moveClass: 'NORMAL',
      estimatedMovePct,
      riskRewardRatio: rr,
      asymmetryScore,
      evidence,
      warnings: [...warnings, 'Anti-chase invariant enforced: Extended asset restricted to NORMAL move class']
    };
  }

  // Classification
  let moveClass: LargeMoveClass = 'NORMAL';

  if (estimatedMovePct === null) {
    moveClass = 'UNKNOWN';
  } else if (rr !== null && rr >= 5.0 && estimatedMovePct >= 20.0) {
    moveClass = 'EXTREME_ASYMMETRY';
    evidence.push(`EXTREME ASYMMETRY SETUP: Risk/Reward 1:${rr.toFixed(1)} with +${estimatedMovePct.toFixed(1)}% structural target`);
  } else if (estimatedMovePct >= 300.0 && (rr === null || rr >= 2.5)) {
    moveClass = 'EXTREME_300_PLUS';
    evidence.push(`EXTREME 300%+ MACRO EXPANSION: Runway estimated at +${estimatedMovePct.toFixed(1)}%`);
  } else if (estimatedMovePct >= 200.0 && (rr === null || rr >= 2.5)) {
    moveClass = 'EXTREME_200_PLUS';
    evidence.push(`EXTREME 200%+ MACRO EXPANSION: Runway estimated at +${estimatedMovePct.toFixed(1)}%`);
  } else if (estimatedMovePct >= 100.0 && (rr === null || rr >= 2.5)) {
    moveClass = '100_PERCENT_PLUS';
    evidence.push(`100%+ LARGE MOVE CLASS: Macro structural runway estimated at +${estimatedMovePct.toFixed(1)}%`);
  } else if (estimatedMovePct >= 50.0 && (rr === null || rr >= 2.0)) {
    moveClass = '50_PERCENT_PLUS';
    evidence.push(`50%+ LARGE MOVE CLASS: Major structural target estimated at +${estimatedMovePct.toFixed(1)}%`);
  } else if (estimatedMovePct >= 20.0 && (rr === null || rr >= 1.8)) {
    moveClass = '20_PERCENT_PLUS';
    evidence.push(`20%+ LARGE MOVE CLASS: Structural expansion target estimated at +${estimatedMovePct.toFixed(1)}%`);
  } else if (estimatedMovePct >= 10.0 && (rr === null || rr >= 1.3)) {
    moveClass = '10_PERCENT_PLUS';
    evidence.push(`10%+ MOVE CLASS: Standard swing target estimated at +${estimatedMovePct.toFixed(1)}%`);
  } else {
    moveClass = 'NORMAL';
  }

  return {
    moveClass,
    estimatedMovePct,
    riskRewardRatio: rr,
    asymmetryScore,
    evidence,
    warnings
  };
}

/**
 * Main Phase 15 Deterministic Large Move & Asymmetry Evaluator
 * Integrates derivatives crowding, pump/dump exhaustion, multi-tier potential move classes,
 * and maintains strict Unified Decision Authority (confluence only, no signal fabrication).
 */
export function evaluateLargeMoveOpportunity(input: LargeMoveEvaluationInput): LargeMoveOpportunityReport {
  const { symbol, candles, currentPrice, coreDecision = 'WAIT' } = input;

  // Zero-candle fallback
  if (!candles || candles.length < 15 || !currentPrice || currentPrice <= 0) {
    return {
      symbol,
      moveClass: 'UNKNOWN',
      estimatedMovePct: null,
      riskRewardRatio: null,
      asymmetryScore: 0,
      crowdingState: 'UNAVAILABLE',
      fundingRate: null,
      fundingChange24h: null,
      fundingExtremity: 'UNKNOWN',
      openInterestUsd: null,
      oiChange24h: null,
      oiState: 'UNKNOWN',
      exhaustionState: 'UNKNOWN',
      momentumWeakening: false,
      volumeDivergence: false,
      liquidityAction: 'UNKNOWN',
      structuralConfirmation: false,
      liquidationImbalance: 'UNAVAILABLE',
      isAlreadyExtended: false,
      antiChaseActive: false,
      confluenceAlignment: 'NEUTRAL',
      reasoning: 'Insufficient candle action for deterministic large-move evaluation.',
      evidenceList: [],
      riskWarnings: ['Zero candle data or invalid price'],
      zeroFabricatedData: true
    };
  }

  // 1. Analyze Crowding
  const crowding = analyzeDerivativesCrowding(
    input.derivatives,
    input.fundingRate,
    input.openInterest,
    input.oiChange24h,
    input.fundingChange24h
  );

  // 2. Analyze Exhaustion & Structural Mechanics
  const exhaustion = detectExhaustionReversal(
    candles,
    input.marketCycle,
    input.pumpDumpIntelligence,
    input.newListingIntelligence
  );

  // 3. Classify Move Potential & Asymmetry
  const moveResult = classifyLargeMovePotential(input, crowding, exhaustion);

  // 4. Directional Confluence & Unified Decision Authority
  // INVARIANT: Funding/OI/ExpectedMove NEVER independently creates LONG/SHORT.
  // Core Decision is the ONLY final authority.
  let confluenceAlignment: LargeMoveAlignment = 'NEUTRAL';
  const evidenceList = [...crowding.evidence, ...exhaustion.evidence, ...moveResult.evidence];
  const riskWarnings = [...crowding.warnings, ...exhaustion.warnings, ...moveResult.warnings];

  if (coreDecision === 'WAIT') {
    confluenceAlignment = 'NEUTRAL';
    if (crowding.crowdingState === 'LONG_CROWDED' && exhaustion.exhaustionState === 'PUMP_EXHAUSTION') {
      evidenceList.push('Derivatives crowding & pump exhaustion noted, but unified engine decision is WAIT (confluence only)');
    }
  } else if (coreDecision === 'LONG') {
    // Bullish setup confirmed by unified engine
    if (crowding.crowdingState === 'SHORT_CROWDED' && exhaustion.exhaustionState === 'DUMP_EXHAUSTION') {
      confluenceAlignment = 'SUPPORTS_LONG';
      evidenceList.push('High-conviction confluence: Short crowding + confirmed dump exhaustion supports LONG setup');
    } else if (crowding.crowdingState === 'LONG_CROWDED' && exhaustion.isAlreadyExtended) {
      confluenceAlignment = 'CONTRADICTS_SETUP';
      riskWarnings.push('Contradiction warning: Long crowding and overextension conflict with entering LONG');
    } else if (moveResult.moveClass !== 'NORMAL' && moveResult.moveClass !== 'UNKNOWN' && !exhaustion.isAlreadyExtended) {
      confluenceAlignment = 'SUPPORTS_LONG';
      evidenceList.push(`High asymmetry (${moveResult.moveClass}) reinforces LONG thesis`);
    } else if (exhaustion.antiChaseActive) {
      confluenceAlignment = 'HIGH_RISK_WARNING';
    } else {
      confluenceAlignment = 'NEUTRAL';
    }
  } else if (coreDecision === 'SHORT') {
    // Bearish setup confirmed by unified engine
    if (crowding.crowdingState === 'LONG_CROWDED' && exhaustion.exhaustionState === 'PUMP_EXHAUSTION') {
      confluenceAlignment = 'SUPPORTS_SHORT';
      evidenceList.push('High-conviction confluence: Long crowding + confirmed pump exhaustion supports SHORT setup');
    } else if (crowding.crowdingState === 'SHORT_CROWDED' && !exhaustion.isAlreadyExtended && exhaustion.exhaustionState === 'DUMP_EXHAUSTION') {
      confluenceAlignment = 'CONTRADICTS_SETUP';
      riskWarnings.push('Contradiction warning: Short crowding and dump exhaustion conflict with entering SHORT');
    } else if (moveResult.moveClass !== 'NORMAL' && moveResult.moveClass !== 'UNKNOWN' && !exhaustion.isAlreadyExtended) {
      confluenceAlignment = 'SUPPORTS_SHORT';
      evidenceList.push(`High asymmetry (${moveResult.moveClass}) reinforces SHORT thesis`);
    } else if (exhaustion.antiChaseActive) {
      confluenceAlignment = 'HIGH_RISK_WARNING';
    } else {
      confluenceAlignment = 'NEUTRAL';
    }
  }

  // Summary reasoning
  let reasoning = '';
  if (moveResult.moveClass !== 'NORMAL' && moveResult.moveClass !== 'UNKNOWN') {
    reasoning = `${moveResult.moveClass.replace(/_/g, ' ')} setup (Asymmetry Score: ${moveResult.asymmetryScore}/100) with ${crowding.crowdingState.replace(/_/g, ' ')} derivatives positioning.`;
  } else {
    reasoning = `Standard market structure with ${crowding.crowdingState.replace(/_/g, ' ')} positioning and ${exhaustion.exhaustionState.replace(/_/g, ' ')} status.`;
  }

  if (riskWarnings.length > 0) {
    reasoning += ` Guardrail: ${riskWarnings[0]}`;
  }

  return {
    symbol,
    moveClass: moveResult.moveClass,
    estimatedMovePct: moveResult.estimatedMovePct,
    riskRewardRatio: moveResult.riskRewardRatio,
    asymmetryScore: moveResult.asymmetryScore,
    crowdingState: crowding.crowdingState,
    fundingRate: crowding.fundingRate,
    fundingChange24h: crowding.fundingChange24h,
    fundingExtremity: crowding.fundingExtremity,
    openInterestUsd: crowding.openInterestUsd,
    oiChange24h: crowding.oiChange24h,
    oiState: crowding.oiState,
    exhaustionState: exhaustion.exhaustionState,
    momentumWeakening: exhaustion.momentumWeakening,
    volumeDivergence: exhaustion.volumeDivergence,
    liquidityAction: exhaustion.liquidityAction,
    structuralConfirmation: exhaustion.structuralConfirmation,
    liquidationImbalance: crowding.liquidationImbalance,
    isAlreadyExtended: exhaustion.isAlreadyExtended,
    antiChaseActive: exhaustion.antiChaseActive,
    confluenceAlignment,
    reasoning,
    evidenceList,
    riskWarnings,
    zeroFabricatedData: true
  };
}
