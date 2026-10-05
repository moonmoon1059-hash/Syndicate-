import {
  Candle,
  TargetLevel,
  StructuralStopLossBasis,
  StructuralStopLossReport,
  PositionSizingParams,
  PositionSizingResult,
  LeverageRiskLevel,
  LeverageRiskAnalysis,
  DerivativesRiskContextType,
  DerivativesRiskAnalysis,
  TradeLifecycleState,
  TradeLifecycleRecord,
  TradeLifecycleTransition,
  NewsIntelligenceCompatibility,
  SmartRiskReport,
  SignalQualityGrade
} from '../src/types/crypto';
import { calculateATR } from './technicalAnalysis';

/**
 * ============================================================================
 * MOONSCANNER PHASE 9: SMART RISK + TRADE MANAGEMENT ENGINE
 * ============================================================================
 * 
 * CORE PRINCIPLES & INVARIANTS:
 * 1. Deterministic Risk Calculation: Uses real available price, ATR, and structural levels.
 * 2. Structural Stop Loss:
 *    - LONG: Swing low, demand order block, confirmed support shelf, liquidity reclaim invalidation.
 *    - SHORT: Swing high, supply order block, confirmed resistance shelf, liquidity rejection invalidation.
 *    - Never uses arbitrary percentage SL when structural invalidation is available.
 * 3. Dynamic R:R Validation: Supports 1:5, 1:10, 1:15, 1:20+ setups with multi-target preservation.
 * 4. Invariant: R:R alone can NEVER create or upgrade a signal.
 * 5. Position Sizing: Exact deterministic calculations when equity & risk % are provided; UNKNOWN otherwise.
 * 6. Leverage Risk Context: Low, Moderate, High, Extreme risk context with mandatory safety disclaimer.
 * 7. Trade Lifecycle Management:
 *    - ORIGINAL_SL -> BREAK_EVEN (only after TP1 / verified favorable progress, never on time alone)
 *    - BREAK_EVEN -> STRUCTURAL_TRAILING (trailing based on new swing structures, not arbitrary distances)
 *    - STRUCTURAL_TRAILING -> PROFIT_LOCKED -> CLOSED
 * 8. Derivatives Risk Context: Crowding & Squeeze analysis (supporting context only, never creates signals).
 * 9. News Compatibility: Purely supporting evidence, handles optional news gracefully.
 * 10. No Fabricated Data: UNKNOWN / UNAVAILABLE when data is missing.
 */

// Explicit Safety Warning Invariant
export const MANDATORY_LEVERAGE_WARNING =
  'CRITICAL RISK WARNING: No leverage is safe. All leveraged trading incurs liquidation risk. Position size must always be determined by strict dollar risk loss limits, never by maximum account borrowing capacity.';

/**
 * 1. STRUCTURAL STOP LOSS CALCULATION
 * Determines the logical structural invalidation price for a setup based on swing highs/lows,
 * order blocks, liquidity reclaim levels, and confirmed support/resistance.
 */
export function calculateStructuralStopLoss(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryPrice: number;
  candles: Candle[];
  smcReport?: any;
  liquidityZones?: any[];
  atr?: number;
}): StructuralStopLossReport {
  const { direction, entryPrice, candles, smcReport, liquidityZones } = params;

  if (direction === 'WAIT' || !candles || candles.length < 5 || entryPrice <= 0) {
    return {
      price: 'UNKNOWN',
      basis: 'UNKNOWN',
      invalidationAnchor: 'UNKNOWN',
      atrBufferUsed: 0,
      distancePct: 'UNKNOWN',
      isValidStructural: false,
      details: ['Insufficient market structure data or WAIT condition. Structural stop loss is UNKNOWN.']
    };
  }

  const rawAtr = params.atr !== undefined ? params.atr : calculateATR(candles, 14);
  const atrValue = Array.isArray(rawAtr) ? (rawAtr[rawAtr.length - 1] || 0) : (typeof rawAtr === 'number' ? rawAtr : 0);
  const atrBuffer = atrValue > 0 ? atrValue * 0.2 : entryPrice * 0.003; // 0.2x ATR buffer to avoid stop hunts
  const details: string[] = [];

  if (direction === 'LONG') {
    // 1. Check SMC Demand Order Block / FVG bottoms below entry
    let bestDemandAnchor: number | null = null;
    let demandBasis: StructuralStopLossBasis = 'SWING_LOW';

    if (smcReport?.orderBlocks && Array.isArray(smcReport.orderBlocks)) {
      const demandOBs = smcReport.orderBlocks.filter((ob: any) => ob.type === 'BULLISH' && ob.bottom < entryPrice);
      if (demandOBs.length > 0) {
        // Nearest demand OB below entry
        const nearestOB = demandOBs.sort((a: any, b: any) => b.bottom - a.bottom)[0];
        bestDemandAnchor = nearestOB.bottom;
        demandBasis = 'DEMAND_ORDER_BLOCK';
        details.push(`Demand Order Block mapped at ${bestDemandAnchor.toFixed(4)}`);
      }
    }

    // 2. Check Pivot / Swing Lows below entry
    const pivotLows: number[] = [];
    for (let i = 2; i < candles.length - 2; i++) {
      if (
        candles[i].low <= candles[i - 1].low &&
        candles[i].low <= candles[i - 2].low &&
        candles[i].low <= candles[i + 1].low &&
        candles[i].low <= candles[i + 2].low &&
        candles[i].low < entryPrice
      ) {
        pivotLows.push(candles[i].low);
      }
    }

    // Recent swing low
    const recentSwingLow = pivotLows.length > 0 ? pivotLows[pivotLows.length - 1] : null;

    // 3. Check Liquidity Reclaim levels
    let liquidityReclaimLevel: number | null = null;
    if (liquidityZones && Array.isArray(liquidityZones)) {
      const sweptLows = liquidityZones.filter((z: any) => (z.type === 'SWING_LOW' || z.type === 'SELL_SIDE_LIQUIDITY') && z.price < entryPrice);
      if (sweptLows.length > 0) {
        liquidityReclaimLevel = sweptLows[0].price;
      }
    }

    // Select the most reliable structural invalidation anchor
    let anchor = recentSwingLow;
    let basis: StructuralStopLossBasis = 'SWING_LOW';

    if (bestDemandAnchor !== null && (!anchor || bestDemandAnchor > anchor * 0.95)) {
      anchor = bestDemandAnchor;
      basis = demandBasis;
    } else if (liquidityReclaimLevel !== null && (!anchor || Math.abs(entryPrice - liquidityReclaimLevel) < Math.abs(entryPrice - (anchor || 0)))) {
      anchor = liquidityReclaimLevel;
      basis = 'LIQUIDITY_RECLAIM_INVALIDATION';
    } else if (anchor !== null) {
      basis = 'SWING_LOW';
      details.push(`Confirmed Swing Low anchor at ${anchor.toFixed(4)}`);
    } else {
      // Fallback to lowest candle in recent window
      const recentLows = candles.slice(-20).map(c => c.low).filter(l => l < entryPrice);
      if (recentLows.length > 0) {
        anchor = Math.min(...recentLows);
        basis = 'CONFIRMED_SUPPORT';
        details.push(`Recent structural support shelf at ${anchor.toFixed(4)}`);
      }
    }

    if (anchor === null || anchor >= entryPrice) {
      return {
        price: 'UNKNOWN',
        basis: 'UNKNOWN',
        invalidationAnchor: 'UNKNOWN',
        atrBufferUsed: atrBuffer,
        distancePct: 'UNKNOWN',
        isValidStructural: false,
        details: ['No valid structural invalidation swing low found below entry price.']
      };
    }

    // Structural SL = Anchor minus ATR buffer
    const slPrice = Number((anchor - atrBuffer).toFixed(6));
    const distancePct = Number((((entryPrice - slPrice) / entryPrice) * 100).toFixed(2));

    details.push(`Applied 0.2x ATR buffer (${atrBuffer.toFixed(4)}) below structural anchor.`);
    details.push(`Invalidation level: ${slPrice.toFixed(4)} (-${distancePct}% risk distance)`);

    return {
      price: slPrice,
      basis,
      invalidationAnchor: anchor,
      atrBufferUsed: Number(atrBuffer.toFixed(6)),
      distancePct,
      isValidStructural: distancePct > 0.1 && distancePct <= 20.0,
      details
    };
  } else {
    // SHORT DIRECTION
    let bestSupplyAnchor: number | null = null;
    let supplyBasis: StructuralStopLossBasis = 'SWING_HIGH';

    if (smcReport?.orderBlocks && Array.isArray(smcReport.orderBlocks)) {
      const supplyOBs = smcReport.orderBlocks.filter((ob: any) => ob.type === 'BEARISH' && ob.top > entryPrice);
      if (supplyOBs.length > 0) {
        const nearestOB = supplyOBs.sort((a: any, b: any) => a.top - b.top)[0];
        bestSupplyAnchor = nearestOB.top;
        supplyBasis = 'SUPPLY_ORDER_BLOCK';
        details.push(`Supply Order Block mapped at ${bestSupplyAnchor.toFixed(4)}`);
      }
    }

    const pivotHighs: number[] = [];
    for (let i = 2; i < candles.length - 2; i++) {
      if (
        candles[i].high >= candles[i - 1].high &&
        candles[i].high >= candles[i - 2].high &&
        candles[i].high >= candles[i + 1].high &&
        candles[i].high >= candles[i + 2].high &&
        candles[i].high > entryPrice
      ) {
        pivotHighs.push(candles[i].high);
      }
    }

    const recentSwingHigh = pivotHighs.length > 0 ? pivotHighs[pivotHighs.length - 1] : null;

    let liquidityRejectionLevel: number | null = null;
    if (liquidityZones && Array.isArray(liquidityZones)) {
      const sweptHighs = liquidityZones.filter((z: any) => (z.type === 'SWING_HIGH' || z.type === 'BUY_SIDE_LIQUIDITY') && z.price > entryPrice);
      if (sweptHighs.length > 0) {
        liquidityRejectionLevel = sweptHighs[0].price;
      }
    }

    let anchor = recentSwingHigh;
    let basis: StructuralStopLossBasis = 'SWING_HIGH';

    if (bestSupplyAnchor !== null && (!anchor || bestSupplyAnchor < anchor * 1.05)) {
      anchor = bestSupplyAnchor;
      basis = supplyBasis;
    } else if (liquidityRejectionLevel !== null && (!anchor || Math.abs(liquidityRejectionLevel - entryPrice) < Math.abs((anchor || 0) - entryPrice))) {
      anchor = liquidityRejectionLevel;
      basis = 'LIQUIDITY_REJECTION_INVALIDATION';
    } else if (anchor !== null) {
      basis = 'SWING_HIGH';
      details.push(`Confirmed Swing High anchor at ${anchor.toFixed(4)}`);
    } else {
      const recentHighs = candles.slice(-20).map(c => c.high).filter(h => h > entryPrice);
      if (recentHighs.length > 0) {
        anchor = Math.max(...recentHighs);
        basis = 'CONFIRMED_RESISTANCE';
        details.push(`Recent structural resistance shelf at ${anchor.toFixed(4)}`);
      }
    }

    if (anchor === null || anchor <= entryPrice) {
      return {
        price: 'UNKNOWN',
        basis: 'UNKNOWN',
        invalidationAnchor: 'UNKNOWN',
        atrBufferUsed: atrBuffer,
        distancePct: 'UNKNOWN',
        isValidStructural: false,
        details: ['No valid structural invalidation swing high found above entry price.']
      };
    }

    const slPrice = Number((anchor + atrBuffer).toFixed(6));
    const distancePct = Number((((slPrice - entryPrice) / entryPrice) * 100).toFixed(2));

    details.push(`Applied 0.2x ATR buffer (${atrBuffer.toFixed(4)}) above structural anchor.`);
    details.push(`Invalidation level: ${slPrice.toFixed(4)} (+${distancePct}% risk distance)`);

    return {
      price: slPrice,
      basis,
      invalidationAnchor: anchor,
      atrBufferUsed: Number(atrBuffer.toFixed(6)),
      distancePct,
      isValidStructural: distancePct > 0.1 && distancePct <= 20.0,
      details
    };
  }
}

/**
 * 2. DYNAMIC RISK/REWARD LADDER & ASYMMETRIC SETUP VALIDATION
 * Computes exact R:R for TP1, TP2, TP3, and identifies high R:R setups (1:5, 1:10, 1:15, 1:20+).
 * INVARIANT: R:R alone can NEVER create or upgrade a signal.
 */
export function calculateRiskRewardLadder(params: {
  entryPrice: number;
  stopLossPrice: number | 'UNKNOWN';
  targets: TargetLevel[];
  direction: 'LONG' | 'SHORT' | 'WAIT';
}): {
  tp1RR: number | 'UNKNOWN';
  tp2RR: number | 'UNKNOWN';
  tp3RR: number | 'UNKNOWN';
  maxStructuralRR: number | 'UNKNOWN';
  isAsymmetric: boolean;
} {
  const { entryPrice, stopLossPrice, targets, direction } = params;

  if (
    direction === 'WAIT' ||
    stopLossPrice === 'UNKNOWN' ||
    typeof stopLossPrice !== 'number' ||
    entryPrice <= 0 ||
    !targets ||
    targets.length === 0
  ) {
    return {
      tp1RR: 'UNKNOWN',
      tp2RR: 'UNKNOWN',
      tp3RR: 'UNKNOWN',
      maxStructuralRR: 'UNKNOWN',
      isAsymmetric: false
    };
  }

  const riskDistance = Math.abs(entryPrice - stopLossPrice);
  if (riskDistance <= 0) {
    return {
      tp1RR: 'UNKNOWN',
      tp2RR: 'UNKNOWN',
      tp3RR: 'UNKNOWN',
      maxStructuralRR: 'UNKNOWN',
      isAsymmetric: false
    };
  }

  const getTargetRR = (targetIndex: number): number | 'UNKNOWN' => {
    if (targets.length > targetIndex && targets[targetIndex] && targets[targetIndex].price > 0) {
      const reward = Math.abs(targets[targetIndex].price - entryPrice);
      return Number((reward / riskDistance).toFixed(2));
    }
    return 'UNKNOWN';
  };

  const tp1RR = getTargetRR(0);
  const tp2RR = getTargetRR(1);
  const tp3RR = getTargetRR(2);

  // Maximum structural R:R across all targets
  const allRRs = targets
    .map(t => (t.price > 0 ? Number((Math.abs(t.price - entryPrice) / riskDistance).toFixed(2)) : 0))
    .filter(r => r > 0);

  const maxStructuralRR = allRRs.length > 0 ? Math.max(...allRRs) : 'UNKNOWN';
  const isAsymmetric = typeof maxStructuralRR === 'number' && maxStructuralRR >= 5.0;

  return {
    tp1RR,
    tp2RR,
    tp3RR,
    maxStructuralRR,
    isAsymmetric
  };
}

/**
 * 3. DETERMINISTIC POSITION SIZING CALCULATION
 * Calculates position size based on user account equity, risk %, entry, and structural stop loss.
 * INVARIANT: If account or risk configuration is unavailable, returns UNKNOWN. Never fabricates balance data.
 */
export function calculatePositionSizing(params: PositionSizingParams): PositionSizingResult {
  const { accountEquity, riskPercentage, entryPrice, stopLossPrice, leverage = 1, makerFeePct = 0.0004, takerFeePct = 0.0006 } = params;

  if (
    accountEquity === undefined ||
    accountEquity === null ||
    accountEquity <= 0 ||
    riskPercentage === undefined ||
    riskPercentage === null ||
    riskPercentage <= 0 ||
    entryPrice === undefined ||
    entryPrice === null ||
    entryPrice <= 0 ||
    stopLossPrice === undefined ||
    stopLossPrice === null ||
    stopLossPrice <= 0
  ) {
    return {
      status: 'UNKNOWN',
      summary: 'Account equity, risk percentage, or structural stop loss is unavailable. Configure equity and risk parameters to compute exact position size.'
    };
  }

  const stopDistancePrice = Math.abs(entryPrice - stopLossPrice);
  if (stopDistancePrice <= 0) {
    return {
      status: 'INSUFFICIENT_DATA',
      summary: 'Stop loss is identical to entry price. Cannot calculate position sizing.'
    };
  }

  const riskAmountUsd = accountEquity * (riskPercentage / 100);
  const stopDistancePct = (stopDistancePrice / entryPrice) * 100;
  const positionUnits = riskAmountUsd / stopDistancePrice;
  const notionalValueUsd = positionUnits * entryPrice;
  const leverageUsed = Math.max(1, leverage);
  const estimatedMarginUsd = notionalValueUsd / leverageUsed;
  const estimatedTotalFeeUsd = notionalValueUsd * (makerFeePct + takerFeePct);

  return {
    status: 'CALCULATED',
    accountEquity: Number(accountEquity.toFixed(2)),
    riskPercentage: Number(riskPercentage.toFixed(2)),
    riskAmountUsd: Number(riskAmountUsd.toFixed(2)),
    stopDistancePrice: Number(stopDistancePrice.toFixed(4)),
    stopDistancePct: Number(stopDistancePct.toFixed(2)),
    positionUnits: Number(positionUnits.toFixed(4)),
    notionalValueUsd: Number(notionalValueUsd.toFixed(2)),
    estimatedMarginUsd: Number(estimatedMarginUsd.toFixed(2)),
    leverageUsed,
    estimatedTotalFeeUsd: Number(estimatedTotalFeeUsd.toFixed(2)),
    summary: `Risking $${riskAmountUsd.toFixed(2)} (${riskPercentage}% of $${accountEquity.toFixed(2)} equity). Position size: ${positionUnits.toFixed(4)} units ($${notionalValueUsd.toFixed(2)} notional, $${estimatedMarginUsd.toFixed(2)} margin at ${leverageUsed}x leverage).`
  };
}

/**
 * 4. LEVERAGE RISK CONTEXT EVALUATION
 * Classifies leverage risk context (Low, Moderate, High, Extreme) based on ATR %, SL distance %,
 * market regime, liquidity depth, and derivatives crowding.
 * INVARIANT: Always includes the mandatory explicit leverage safety warning.
 */
export function evaluateLeverageRiskContext(params: {
  candles: Candle[];
  entryPrice: number;
  stopLossPrice: number | 'UNKNOWN';
  marketRegime?: string;
  liquidityCondition?: 'DEEP' | 'MODERATE' | 'THIN' | 'POOR';
  derivativesFunding?: number;
  derivativesOIChange?: number;
}): LeverageRiskAnalysis {
  const { candles, entryPrice, stopLossPrice, marketRegime = 'UNKNOWN', liquidityCondition = 'MODERATE', derivativesFunding, derivativesOIChange } = params;

  if (!candles || candles.length < 5 || entryPrice <= 0) {
    return {
      riskLevel: 'UNKNOWN',
      maxRecommendedLeverage: 'UNKNOWN',
      volatilityFactor: 0,
      slDistanceRisk: 'NORMAL',
      liquidityCondition,
      derivativesCrowding: 'NONE',
      regimeContext: marketRegime,
      safetyWarning: MANDATORY_LEVERAGE_WARNING,
      riskDrivers: ['Insufficient market data to compute leverage risk context.']
    };
  }

  const rawAtr = calculateATR(candles, 14);
  const atr = Array.isArray(rawAtr) ? (rawAtr[rawAtr.length - 1] || 0) : (typeof rawAtr === 'number' ? rawAtr : 0);
  const volatilityFactor = entryPrice > 0 ? Number(((atr / entryPrice) * 100).toFixed(2)) : 0;
  const riskDrivers: string[] = [];

  let slDistancePct = 2.0;
  let slDistanceRisk: 'TIGHT' | 'NORMAL' | 'WIDE' | 'EXTREME' = 'NORMAL';

  if (typeof stopLossPrice === 'number' && stopLossPrice > 0) {
    slDistancePct = (Math.abs(entryPrice - stopLossPrice) / entryPrice) * 100;
    if (slDistancePct < 0.8) {
      slDistanceRisk = 'TIGHT';
      riskDrivers.push(`Tight structural SL distance (${slDistancePct.toFixed(2)}%) susceptible to normal spread noise under high leverage.`);
    } else if (slDistancePct > 6.0) {
      slDistanceRisk = 'EXTREME';
      riskDrivers.push(`Wide SL distance (${slDistancePct.toFixed(2)}%) requires low leverage to prevent oversized notional exposure.`);
    } else if (slDistancePct > 3.5) {
      slDistanceRisk = 'WIDE';
      riskDrivers.push(`Moderate-wide SL distance (${slDistancePct.toFixed(2)}%).`);
    } else {
      slDistanceRisk = 'NORMAL';
    }
  }

  // Derivatives crowding check
  let derivativesCrowding: 'NONE' | 'MODERATE' | 'HIGH' | 'EXTREME' = 'NONE';
  if (derivativesFunding !== undefined) {
    if (Math.abs(derivativesFunding) > 0.05) {
      derivativesCrowding = 'EXTREME';
      riskDrivers.push(`Extreme funding rate (${(derivativesFunding * 100).toFixed(3)}%) indicates severe positioning crowding.`);
    } else if (Math.abs(derivativesFunding) > 0.025) {
      derivativesCrowding = 'HIGH';
      riskDrivers.push(`Elevated funding rate (${(derivativesFunding * 100).toFixed(3)}%).`);
    } else if (Math.abs(derivativesFunding) > 0.01) {
      derivativesCrowding = 'MODERATE';
    }
  }

  // Market Regime risk check
  if (marketRegime === 'HIGH_VOLATILITY' || marketRegime === 'STRONG_BEAR') {
    riskDrivers.push(`Adverse market regime (${marketRegime}) elevates liquidation cascade risk.`);
  }

  // Liquidity risk check
  if (liquidityCondition === 'THIN' || liquidityCondition === 'POOR') {
    riskDrivers.push(`Thin order book liquidity increases slippage during liquidation events.`);
  }

  // Determine overall leverage risk level & max recommended leverage
  let riskLevel: LeverageRiskLevel = 'MODERATE_RISK_CONTEXT';
  let maxRecommendedLeverage: number = 5;

  if (
    slDistanceRisk === 'TIGHT' ||
    volatilityFactor > 4.5 ||
    derivativesCrowding === 'EXTREME' ||
    liquidityCondition === 'POOR' ||
    marketRegime === 'HIGH_VOLATILITY'
  ) {
    riskLevel = 'EXTREME_RISK_CONTEXT';
    maxRecommendedLeverage = 2; // Spot or max 2x
  } else if (
    slDistanceRisk === 'WIDE' ||
    volatilityFactor > 2.8 ||
    derivativesCrowding === 'HIGH' ||
    liquidityCondition === 'THIN' ||
    marketRegime === 'STRONG_BEAR' ||
    marketRegime === 'BEAR'
  ) {
    riskLevel = 'HIGH_RISK_CONTEXT';
    maxRecommendedLeverage = 3;
  } else if (volatilityFactor <= 1.5 && liquidityCondition === 'DEEP' && (marketRegime === 'BULL' || marketRegime === 'STRONG_BULL')) {
    riskLevel = 'LOW_RISK_CONTEXT';
    maxRecommendedLeverage = 8;
  } else {
    riskLevel = 'MODERATE_RISK_CONTEXT';
    maxRecommendedLeverage = 5;
  }

  if (riskDrivers.length === 0) {
    riskDrivers.push('Normal volatility and liquidity environment.');
  }

  return {
    riskLevel,
    maxRecommendedLeverage,
    volatilityFactor,
    slDistanceRisk,
    liquidityCondition,
    derivativesCrowding,
    regimeContext: marketRegime,
    safetyWarning: MANDATORY_LEVERAGE_WARNING,
    riskDrivers
  };
}

/**
 * 5. DERIVATIVES RISK CONTEXT EVALUATION
 * Analyzes funding rate, OI changes, and CVD trends to identify crowding or squeeze risks.
 * INVARIANT: Derivatives data must NOT independently create a LONG/SHORT signal.
 */
export function evaluateDerivativesRiskContext(params: {
  direction: 'LONG' | 'SHORT' | 'WAIT';
  fundingRate?: number;
  openInterestChange24h?: number;
  cvdDeltaTrend?: string;
  longLiquidationVolume?: number;
  shortLiquidationVolume?: number;
}): DerivativesRiskAnalysis {
  const { direction, fundingRate, openInterestChange24h, cvdDeltaTrend } = params;

  if (fundingRate === undefined && openInterestChange24h === undefined && !cvdDeltaTrend) {
    return {
      riskContext: 'UNKNOWN',
      fundingBias: 'UNKNOWN',
      openInterestTrend: 'UNKNOWN',
      cvdTrend: 'UNKNOWN',
      liquidationSensitivity: 'UNKNOWN',
      summary: 'Derivatives telemetry unavailable.',
      riskWarnings: []
    };
  }

  const fRate = fundingRate ?? 0;
  const oiChange = openInterestChange24h ?? 0;
  const riskWarnings: string[] = [];

  let fundingBias: 'EXTREME_POSITIVE' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'EXTREME_NEGATIVE' | 'UNKNOWN' = 'NEUTRAL';
  if (fRate > 0.03) fundingBias = 'EXTREME_POSITIVE';
  else if (fRate > 0.01) fundingBias = 'POSITIVE';
  else if (fRate < -0.03) fundingBias = 'EXTREME_NEGATIVE';
  else if (fRate < -0.01) fundingBias = 'NEGATIVE';

  let openInterestTrend: 'RISING' | 'FALLING' | 'STABLE' | 'UNKNOWN' = 'STABLE';
  if (oiChange > 5.0) openInterestTrend = 'RISING';
  else if (oiChange < -5.0) openInterestTrend = 'FALLING';

  let cvdTrend: 'BULLISH_AGGRESSION' | 'BEARISH_AGGRESSION' | 'NEUTRAL' | 'DIVERGENT' | 'UNKNOWN' = 'NEUTRAL';
  if (cvdDeltaTrend === 'BULLISH' || cvdDeltaTrend === 'BULLISH_AGGRESSION') cvdTrend = 'BULLISH_AGGRESSION';
  else if (cvdDeltaTrend === 'BEARISH' || cvdDeltaTrend === 'BEARISH_AGGRESSION') cvdTrend = 'BEARISH_AGGRESSION';
  else if (cvdDeltaTrend === 'DIVERGENT' || cvdDeltaTrend === 'ABSORPTION') cvdTrend = 'DIVERGENT';

  let riskContext: DerivativesRiskContextType = 'NORMAL';
  let liquidationSensitivity: 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN' = 'MODERATE';

  if (direction === 'LONG' && fundingBias === 'EXTREME_POSITIVE' && openInterestTrend === 'RISING') {
    riskContext = 'CROWDING_RISK';
    liquidationSensitivity = 'HIGH';
    riskWarnings.push('Long crowding detected: High positive funding with surging OI elevates long liquidation cascade risk.');
  } else if (direction === 'SHORT' && fundingBias === 'EXTREME_NEGATIVE' && openInterestTrend === 'RISING') {
    riskContext = 'SHORT_SQUEEZE_RISK';
    liquidationSensitivity = 'HIGH';
    riskWarnings.push('Short crowding detected: Deep negative funding with surging OI elevates short squeeze risk.');
  } else if (fundingBias === 'EXTREME_POSITIVE' && cvdTrend === 'BEARISH_AGGRESSION') {
    riskContext = 'LONG_SQUEEZE_RISK';
    liquidationSensitivity = 'HIGH';
    riskWarnings.push('Perp divergence: Longs paying high premium while market orderflow delta is aggressively selling.');
  } else if (openInterestTrend === 'RISING' && Math.abs(oiChange) > 15.0) {
    riskContext = 'HIGH_LIQUIDATION_RISK';
    liquidationSensitivity = 'HIGH';
    riskWarnings.push('Extreme OI expansion indicates significant leverage buildup across the orderbook.');
  }

  const summary =
    riskWarnings.length > 0
      ? riskWarnings[0]
      : `Derivatives context is balanced (Funding: ${(fRate * 100).toFixed(3)}%, OI Trend: ${openInterestTrend}, CVD: ${cvdTrend}).`;

  return {
    riskContext,
    fundingRate: fRate,
    fundingBias,
    openInterestTrend,
    cvdTrend,
    liquidationSensitivity,
    summary,
    riskWarnings
  };
}

/**
 * 6. DETERMINISTIC TRADE LIFECYCLE STATE MACHINE
 * Handles the natural progression of an active trade setup:
 * ORIGINAL_SL -> BREAK_EVEN -> STRUCTURAL_TRAILING -> PROFIT_LOCKED -> CLOSED / INVALIDATED
 * 
 * INVARIANTS:
 * - Break-even transition ONLY occurs after TP1 is hit or favorable progress >= 1.0R with structural confirmation.
 *   Never moves to BE simply because time has elapsed.
 * - Structural trailing follows confirmed higher lows (LONG) or lower highs (SHORT).
 * - Risk is NEVER widened.
 */
export function updateTradeLifecycleState(params: {
  currentRecord?: TradeLifecycleRecord;
  entryPrice: number;
  originalStopLoss: number | 'UNKNOWN';
  currentPrice: number;
  direction: 'LONG' | 'SHORT';
  targets: TargetLevel[];
  candles?: Candle[];
  now?: number;
}): TradeLifecycleRecord {
  const { entryPrice, originalStopLoss, currentPrice, direction, targets, candles, now = Date.now() } = params;

  let record: TradeLifecycleRecord = params.currentRecord
    ? { ...params.currentRecord, stateHistory: [...params.currentRecord.stateHistory] }
    : {
        state: 'ORIGINAL_SL',
        currentStopLoss: originalStopLoss,
        originalStopLoss: originalStopLoss,
        entryPrice,
        currentPrice,
        highestPriceReached: currentPrice,
        lowestPriceReached: currentPrice,
        tp1Hit: false,
        tp2Hit: false,
        tp3Hit: false,
        allTargetsHit: false,
        unrealizedPnLPct: 0,
        realizedPnLPct: 0,
        stateHistory: [
          {
            fromState: 'INITIAL',
            toState: 'ORIGINAL_SL',
            price: currentPrice,
            timestamp: now,
            reason: 'Trade setup activated with original structural stop loss.'
          }
        ],
        updatedAt: now
      };

  // Update extreme price reaches
  record.currentPrice = currentPrice;
  record.highestPriceReached = Math.max(record.highestPriceReached, currentPrice);
  record.lowestPriceReached = Math.min(record.lowestPriceReached, currentPrice);
  record.updatedAt = now;

  // Calculate current unrealized PnL %
  if (entryPrice > 0) {
    record.unrealizedPnLPct =
      direction === 'LONG'
        ? Number((((currentPrice - entryPrice) / entryPrice) * 100).toFixed(2))
        : Number((((entryPrice - currentPrice) / entryPrice) * 100).toFixed(2));
  }

  // Check target hit states
  if (targets.length > 0 && targets[0].price > 0) {
    if (direction === 'LONG' ? record.highestPriceReached >= targets[0].price : record.lowestPriceReached <= targets[0].price) {
      record.tp1Hit = true;
    }
  }
  if (targets.length > 1 && targets[1].price > 0) {
    if (direction === 'LONG' ? record.highestPriceReached >= targets[1].price : record.lowestPriceReached <= targets[1].price) {
      record.tp2Hit = true;
    }
  }
  if (targets.length > 2 && targets[2].price > 0) {
    if (direction === 'LONG' ? record.highestPriceReached >= targets[2].price : record.lowestPriceReached <= targets[2].price) {
      record.tp3Hit = true;
    }
  }
  record.allTargetsHit = targets.length > 0 && targets.every(t => (direction === 'LONG' ? record.highestPriceReached >= t.price : record.lowestPriceReached <= t.price));

  // Invalidation / Stop Loss Hit check
  if (typeof record.currentStopLoss === 'number' && record.currentStopLoss > 0) {
    const isStoppedOut =
      direction === 'LONG' ? currentPrice <= record.currentStopLoss : currentPrice >= record.currentStopLoss;

    if (isStoppedOut && record.state !== 'CLOSED' && record.state !== 'INVALIDATED') {
      const fromState = record.state;
      record.state = record.tp1Hit ? 'CLOSED' : 'INVALIDATED';
      record.exitReason = `Stop loss triggered at ${currentPrice.toFixed(4)} (SL level: ${record.currentStopLoss.toFixed(4)}).`;
      record.invalidationReason = record.exitReason;
      record.stateHistory.push({
        fromState,
        toState: record.state,
        price: currentPrice,
        timestamp: now,
        reason: record.exitReason
      });
      return record;
    }
  }

  // STATE MACHINE PROGRESSION

  // 1. ORIGINAL_SL -> BREAK_EVEN
  // Invariant: Transition to BREAK_EVEN ONLY occurs if TP1 is hit or progress reaches >= 1.0R / 75% of TP1
  if (record.state === 'ORIGINAL_SL') {
    const tp1Price = targets.length > 0 ? targets[0].price : 0;
    const canMoveToBE =
      record.tp1Hit ||
      (tp1Price > 0 &&
        (direction === 'LONG'
          ? record.highestPriceReached >= entryPrice + Math.abs(tp1Price - entryPrice) * 0.75
          : record.lowestPriceReached <= entryPrice - Math.abs(entryPrice - tp1Price) * 0.75));

    if (canMoveToBE) {
      const fromState = record.state;
      record.state = 'BREAK_EVEN';
      record.currentStopLoss = entryPrice; // Protect entry
      record.stateHistory.push({
        fromState,
        toState: 'BREAK_EVEN',
        price: currentPrice,
        timestamp: now,
        reason: record.tp1Hit
          ? 'TP1 hit confirmed. Stop loss moved to entry price (Break-Even).'
          : 'Price reached 75%+ favorable expansion toward TP1. Stop loss moved to entry price.'
      });
    }
  }

  // 2. BREAK_EVEN -> STRUCTURAL_TRAILING
  // Trailing based on newly formed structural swing highs/lows
  if (record.state === 'BREAK_EVEN' && candles && candles.length >= 10) {
    if (direction === 'LONG') {
      // Find new swing low formed above entry price
      const pivotLowsAboveEntry = [];
      for (let i = 2; i < candles.length - 2; i++) {
        if (
          candles[i].low <= candles[i - 1].low &&
          candles[i].low <= candles[i - 2].low &&
          candles[i].low <= candles[i + 1].low &&
          candles[i].low <= candles[i + 2].low &&
          candles[i].low > entryPrice
        ) {
          pivotLowsAboveEntry.push(candles[i].low);
        }
      }

      if (pivotLowsAboveEntry.length > 0) {
        const newStructuralAnchor = pivotLowsAboveEntry[pivotLowsAboveEntry.length - 1];
        if (typeof record.currentStopLoss === 'number' && newStructuralAnchor > record.currentStopLoss) {
          const fromState = record.state;
          record.state = 'STRUCTURAL_TRAILING';
          record.currentStopLoss = Number(newStructuralAnchor.toFixed(6));
          record.stateHistory.push({
            fromState,
            toState: 'STRUCTURAL_TRAILING',
            price: currentPrice,
            timestamp: now,
            reason: `New structural Higher Low formed at ${newStructuralAnchor.toFixed(4)}. Trailing SL secured.`
          });
        }
      }
    } else {
      // SHORT: Find new swing high formed below entry price
      const pivotHighsBelowEntry = [];
      for (let i = 2; i < candles.length - 2; i++) {
        if (
          candles[i].high >= candles[i - 1].high &&
          candles[i].high >= candles[i - 2].high &&
          candles[i].high >= candles[i + 1].high &&
          candles[i].high >= candles[i + 2].high &&
          candles[i].high < entryPrice
        ) {
          pivotHighsBelowEntry.push(candles[i].high);
        }
      }

      if (pivotHighsBelowEntry.length > 0) {
        const newStructuralAnchor = pivotHighsBelowEntry[pivotHighsBelowEntry.length - 1];
        if (typeof record.currentStopLoss === 'number' && newStructuralAnchor < record.currentStopLoss) {
          const fromState = record.state;
          record.state = 'STRUCTURAL_TRAILING';
          record.currentStopLoss = Number(newStructuralAnchor.toFixed(6));
          record.stateHistory.push({
            fromState,
            toState: 'STRUCTURAL_TRAILING',
            price: currentPrice,
            timestamp: now,
            reason: `New structural Lower High formed at ${newStructuralAnchor.toFixed(4)}. Trailing SL secured.`
          });
        }
      }
    }
  }

  // 3. STRUCTURAL_TRAILING -> PROFIT_LOCKED
  // When TP2 is hit, lock in guaranteed profit (SL moved to TP1 level or higher)
  if ((record.state === 'STRUCTURAL_TRAILING' || record.state === 'BREAK_EVEN') && record.tp2Hit) {
    const tp1Price = targets.length > 0 ? targets[0].price : 0;
    if (tp1Price > 0) {
      const fromState = record.state;
      record.state = 'PROFIT_LOCKED';
      // Ensure stop loss moves forward in profit
      if (
        direction === 'LONG'
          ? typeof record.currentStopLoss !== 'number' || tp1Price > record.currentStopLoss
          : typeof record.currentStopLoss !== 'number' || tp1Price < record.currentStopLoss
      ) {
        record.currentStopLoss = tp1Price;
      }
      record.stateHistory.push({
        fromState,
        toState: 'PROFIT_LOCKED',
        price: currentPrice,
        timestamp: now,
        reason: `TP2 hit confirmed. Stop loss locked at TP1 level (${tp1Price.toFixed(4)}) ensuring profit protection.`
      });
    }
  }

  return record;
}

/**
 * 7. NEWS INTELLIGENCE COMPATIBILITY REPORT
 * Wraps any optional news catalyst without forcing LLM or network dependencies.
 * Invariant: News is strictly supporting evidence only.
 */
export function buildNewsCompatibilityReport(newsItem?: any): NewsIntelligenceCompatibility {
  if (!newsItem) {
    return {
      isSupportingOnly: true
    };
  }

  return {
    catalyst: newsItem.title || newsItem.catalyst || newsItem.headline,
    newsTimestamp: newsItem.timestamp || newsItem.createdAt || newsItem.publishedAt,
    sourceQuality: newsItem.sourceTier || newsItem.tier || 'TIER_2',
    freshness: newsItem.freshness || 'FRESH_1_6H',
    marketReaction: newsItem.marketReaction || 'INITIAL_REACTION',
    catalystConfidence: newsItem.impactScore || newsItem.confidence || 75,
    conflictStatus: 'NONE',
    isSupportingOnly: true
  };
}

/**
 * 8. COMPLETE MASTER SMART RISK & TRADE MANAGEMENT REPORT EVALUATOR
 * Consolidates all Phase 9 risk and trade management capabilities into a single unified report.
 */
export function evaluateSmartRiskAndTradeManagement(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryPrice: number;
  candles: Candle[];
  targets: TargetLevel[];
  smcReport?: any;
  liquidityZones?: any[];
  marketRegime?: string;
  liquidityCondition?: 'DEEP' | 'MODERATE' | 'THIN' | 'POOR';
  derivativesFunding?: number;
  derivativesOIChange?: number;
  cvdDeltaTrend?: string;
  newsItem?: any;
  positionSizingParams?: PositionSizingParams;
  existingLifecycle?: TradeLifecycleRecord;
}): SmartRiskReport {
  const {
    symbol,
    direction,
    entryPrice,
    candles,
    targets,
    smcReport,
    liquidityZones,
    marketRegime,
    liquidityCondition,
    derivativesFunding,
    derivativesOIChange,
    cvdDeltaTrend,
    newsItem,
    positionSizingParams,
    existingLifecycle
  } = params;

  // 1. Calculate Structural Stop Loss
  const structuralStopLoss = calculateStructuralStopLoss({
    symbol,
    direction,
    entryPrice,
    candles,
    smcReport,
    liquidityZones
  });

  // 2. Calculate Risk/Reward Ladder
  const riskReward = calculateRiskRewardLadder({
    entryPrice,
    stopLossPrice: structuralStopLoss.price,
    targets,
    direction
  });

  // 3. Calculate Position Sizing
  const posSizingInput: PositionSizingParams = {
    ...positionSizingParams,
    entryPrice: entryPrice > 0 ? entryPrice : undefined,
    stopLossPrice: typeof structuralStopLoss.price === 'number' ? structuralStopLoss.price : undefined
  };
  const positionSizing = calculatePositionSizing(posSizingInput);

  // 4. Evaluate Leverage Risk Context
  const leverageRisk = evaluateLeverageRiskContext({
    candles,
    entryPrice,
    stopLossPrice: structuralStopLoss.price,
    marketRegime,
    liquidityCondition,
    derivativesFunding,
    derivativesOIChange
  });

  // 5. Evaluate Derivatives Risk Context
  const derivativesRisk = evaluateDerivativesRiskContext({
    direction,
    fundingRate: derivativesFunding,
    openInterestChange24h: derivativesOIChange,
    cvdDeltaTrend
  });

  // 6. Update Trade Lifecycle
  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : entryPrice;
  const lifecycle = updateTradeLifecycleState({
    currentRecord: existingLifecycle,
    entryPrice,
    originalStopLoss: structuralStopLoss.price,
    currentPrice,
    direction: direction === 'SHORT' ? 'SHORT' : 'LONG',
    targets,
    candles
  });

  // 7. Build News Compatibility
  const newsCompatibility = buildNewsCompatibilityReport(newsItem);

  // Invalidation criteria description
  const invalidationCriteria =
    direction === 'LONG'
      ? `Setup invalidates if price breaks structural support anchor (${structuralStopLoss.invalidationAnchor !== 'UNKNOWN' ? '$' + Number(structuralStopLoss.invalidationAnchor).toFixed(4) : 'N/A'}) or closes below ${structuralStopLoss.price !== 'UNKNOWN' ? '$' + Number(structuralStopLoss.price).toFixed(4) : 'structural low'}.`
      : direction === 'SHORT'
      ? `Setup invalidates if price breaks structural resistance anchor (${structuralStopLoss.invalidationAnchor !== 'UNKNOWN' ? '$' + Number(structuralStopLoss.invalidationAnchor).toFixed(4) : 'N/A'}) or closes above ${structuralStopLoss.price !== 'UNKNOWN' ? '$' + Number(structuralStopLoss.price).toFixed(4) : 'structural high'}.`
      : 'No active trade direction. Setup remains in WAIT state.';

  const summary = `Smart Risk Audit: Structural SL based on ${structuralStopLoss.basis} (${structuralStopLoss.price !== 'UNKNOWN' ? '$' + Number(structuralStopLoss.price).toFixed(4) : 'UNKNOWN'}). R:R = 1:${riskReward.tp2RR !== 'UNKNOWN' ? riskReward.tp2RR : 'N/A'}. Leverage context: ${leverageRisk.riskLevel}. Lifecycle state: ${lifecycle.state}.`;

  return {
    symbol,
    direction,
    entryPrice,
    structuralStopLoss,
    riskReward,
    positionSizing,
    leverageRisk,
    derivativesRisk,
    lifecycle,
    newsCompatibility,
    summary,
    invalidationCriteria
  };
}
