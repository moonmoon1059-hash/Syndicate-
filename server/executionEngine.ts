/**
 * PHASE 4.7 — ADAPTIVE TRADE EXECUTION INTELLIGENCE ENGINE
 * MoonScanner Autonomous Market Intelligence Pipeline
 *
 * This modular execution engine determines whether a validated market setup
 * (LONG / SHORT) is structurally executable RIGHT NOW.
 *
 * It does NOT create competing signals. It evaluates:
 * 1. Execution Readiness (ENTRY_NOW, WAIT_FOR_PULLBACK, WAIT_FOR_RETEST, WAIT_FOR_CONFIRMATION, ENTRY_MISSED, INVALIDATED)
 * 2. Don't-Chase Protection (ATR-normalized distance, candle expansion, volume climax)
 * 3. Pullback Zone Calculation (S/R flip, breakout level, trendline, EMAs, ATR boundary)
 * 4. Retest Execution & Progression Quality (integrated with breakoutEngine.ts)
 * 5. Momentum Exhaustion Detection (multi-signal confirmation)
 * 6. Liquidity-Aware Execution (opposing barriers, sweeps, stop-hunts)
 * 7. Safest Structurally Justified Execution Zone
 */

import {
  EntryReadiness,
  EntryQualityClassification,
  SignalQualityGrade,
  MarketRegimeType,
  MarketBehaviorType,
  PullbackZone,
  AdaptiveExecutionAnalysis,
  Candle
} from '../src/types/crypto';
import { BreakoutEvaluation } from './breakoutEngine';
import { LiquidityStructureAnalysis } from './liquidityEngine';
import {
  MomentumExhaustionReport,
  PriceExtensionReport,
  MarketRegimeEvaluation
} from './coreIntelligenceEngine';
import { UnifiedMarketEvidence } from './multiTimeframeEngine';
import { formatPrice } from '../src/utils/formatters';

export type { AdaptiveExecutionAnalysis, PullbackZone };

export interface ExecutionContext {
  currentPrice: number;
  entryPrice: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  candles: Candle[];
  atr: number;
  rvol: number;
  rsi: number;
  macdHist?: number;
  ema20: number;
  ema50: number;
  breakoutEval: BreakoutEvaluation;
  liquidity: LiquidityStructureAnalysis;
  exhaustion: MomentumExhaustionReport;
  extension: PriceExtensionReport;
  marketRegime: MarketRegimeEvaluation;
  marketBehavior: MarketBehaviorType;
  unifiedEvidence?: UnifiedMarketEvidence;
  qualityGrade?: SignalQualityGrade;
  tp1Price?: number;
  priceDecimals?: number;
}

/**
 * 1. PULLBACK ENTRY LOGIC
 * Identifies structurally valid pullback areas using S/R flip, breakout level,
 * trendline, EMA structure, ATR-normalized zone, and liquidity levels.
 */
export function calculatePullbackZone(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  stopLoss: number,
  currentPrice: number,
  atr: number,
  ema20: number,
  ema50: number,
  breakoutEval: BreakoutEvaluation,
  liquidity: LiquidityStructureAnalysis,
  priceDecimals: number = 2
): PullbackZone {
  const isLong = direction === 'LONG';
  const effectiveAtr = atr > 0 ? atr : entryPrice * 0.02;

  if (isLong) {
    // Bullish pullback structural references
    const candidateLevels: { price: number; ref: string }[] = [];

    // Breakout level now acting as support
    if (breakoutEval.levelPrice > 0 && breakoutEval.levelPrice < currentPrice && breakoutEval.levelPrice > stopLoss) {
      candidateLevels.push({
        price: breakoutEval.levelPrice,
        ref: `Breakout level (${formatPrice(breakoutEval.levelPrice)}) retest as dynamic support`
      });
    }

    // Key structural liquidity support
    for (const sup of liquidity.keySupportLevels) {
      if (sup < currentPrice && sup > stopLoss && sup >= currentPrice - effectiveAtr * 1.5) {
        candidateLevels.push({
          price: sup,
          ref: `Structural support level (${formatPrice(sup)})`
        });
      }
    }

    // 20 EMA dynamic support
    if (ema20 < currentPrice && ema20 > stopLoss && ema20 >= currentPrice - effectiveAtr * 1.2) {
      candidateLevels.push({
        price: ema20,
        ref: `20 EMA dynamic support (${formatPrice(ema20)})`
      });
    }

    // ATR-normalized pullback baseline
    const atrPullback = entryPrice - effectiveAtr * 0.4;
    if (atrPullback > stopLoss) {
      candidateLevels.push({
        price: atrPullback,
        ref: `ATR-normalized value zone (${formatPrice(atrPullback)})`
      });
    }

    // Select the strongest structural reference closest to current entry
    const chosen = candidateLevels.length > 0
      ? candidateLevels.sort((a, b) => Math.abs(a.price - entryPrice) - Math.abs(b.price - entryPrice))[0]
      : { price: Math.max(stopLoss + effectiveAtr * 0.2, entryPrice - effectiveAtr * 0.3), ref: 'Structural support shelf' };

    const idealEntry = Number(chosen.price.toFixed(priceDecimals));
    const low = Number(Math.max(stopLoss + effectiveAtr * 0.1, idealEntry - effectiveAtr * 0.25).toFixed(priceDecimals));
    const high = Number((idealEntry + effectiveAtr * 0.25).toFixed(priceDecimals));

    return {
      low,
      high,
      idealEntry,
      structuralReference: chosen.ref,
      description: `Optimal LONG pullback zone: ${formatPrice(low)} – ${formatPrice(high)} anchored by ${chosen.ref}`
    };
  } else {
    // Bearish pullback structural references
    const candidateLevels: { price: number; ref: string }[] = [];

    // Breakdown level now acting as resistance
    if (breakoutEval.levelPrice > 0 && breakoutEval.levelPrice > currentPrice && breakoutEval.levelPrice < stopLoss) {
      candidateLevels.push({
        price: breakoutEval.levelPrice,
        ref: `Breakdown level (${formatPrice(breakoutEval.levelPrice)}) retest as overhead resistance`
      });
    }

    // Key structural liquidity resistance
    for (const res of liquidity.keyResistanceLevels) {
      if (res > currentPrice && res < stopLoss && res <= currentPrice + effectiveAtr * 1.5) {
        candidateLevels.push({
          price: res,
          ref: `Structural resistance level (${formatPrice(res)})`
        });
      }
    }

    // 20 EMA dynamic resistance
    if (ema20 > currentPrice && ema20 < stopLoss && ema20 <= currentPrice + effectiveAtr * 1.2) {
      candidateLevels.push({
        price: ema20,
        ref: `20 EMA dynamic resistance (${formatPrice(ema20)})`
      });
    }

    // ATR-normalized pullback baseline
    const atrPullback = entryPrice + effectiveAtr * 0.4;
    if (atrPullback < stopLoss) {
      candidateLevels.push({
        price: atrPullback,
        ref: `ATR-normalized value zone (${formatPrice(atrPullback)})`
      });
    }

    const chosen = candidateLevels.length > 0
      ? candidateLevels.sort((a, b) => Math.abs(a.price - entryPrice) - Math.abs(b.price - entryPrice))[0]
      : { price: Math.min(stopLoss - effectiveAtr * 0.2, entryPrice + effectiveAtr * 0.3), ref: 'Structural resistance shelf' };

    const idealEntry = Number(chosen.price.toFixed(priceDecimals));
    const low = Number((idealEntry - effectiveAtr * 0.25).toFixed(priceDecimals));
    const high = Number(Math.min(stopLoss - effectiveAtr * 0.1, idealEntry + effectiveAtr * 0.25).toFixed(priceDecimals));

    return {
      low,
      high,
      idealEntry,
      structuralReference: chosen.ref,
      description: `Optimal SHORT pullback zone: ${formatPrice(low)} – ${formatPrice(high)} anchored by ${chosen.ref}`
    };
  }
}

/**
 * 2. SAFEST STRUCTURALLY JUSTIFIED EXECUTION ZONE
 * Calculates the exact tight boundary where risk:reward is mathematically and structurally maximized.
 */
export function calculateSafeExecutionZone(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  stopLoss: number,
  atr: number,
  priceDecimals: number = 2
): { low: number; high: number; idealPrice: number } {
  const isLong = direction === 'LONG';
  const effectiveAtr = atr > 0 ? atr : entryPrice * 0.02;

  if (isLong) {
    const idealPrice = Number(entryPrice.toFixed(priceDecimals));
    const low = Number(Math.max(stopLoss + effectiveAtr * 0.2, entryPrice - effectiveAtr * 0.2).toFixed(priceDecimals));
    const high = Number((entryPrice + effectiveAtr * 0.25).toFixed(priceDecimals));
    return { low, high, idealPrice };
  } else {
    const idealPrice = Number(entryPrice.toFixed(priceDecimals));
    const low = Number((entryPrice - effectiveAtr * 0.25).toFixed(priceDecimals));
    const high = Number(Math.min(stopLoss - effectiveAtr * 0.2, entryPrice + effectiveAtr * 0.2).toFixed(priceDecimals));
    return { low, high, idealPrice };
  }
}

/**
 * 3. ADAPTIVE TRADE EXECUTION INTELLIGENCE ENGINE (PHASE 4.7)
 * Evaluates the existing unified setup using comprehensive multi-dimensional criteria.
 */
export function evaluateAdaptiveExecution(ctx: ExecutionContext): AdaptiveExecutionAnalysis {
  const {
    currentPrice,
    entryPrice,
    entryZoneLow,
    entryZoneHigh,
    stopLoss,
    direction,
    candles,
    atr,
    rvol,
    rsi,
    ema20,
    ema50,
    breakoutEval,
    liquidity,
    exhaustion,
    extension,
    marketRegime,
    marketBehavior,
    tp1Price,
    priceDecimals = 2
  } = ctx;

  const details: string[] = [];

  // If the overarching decision is WAIT, return neutral wait state cleanly
  if (direction === 'WAIT') {
    return {
      readiness: 'WAIT_FOR_ENTRY',
      isExecutable: false,
      chaseRisk: false,
      exhaustionRisk: false,
      retestRequired: false,
      retestConfirmed: false,
      executionReason: 'Setup in WAIT state — pending structural confirmation',
      executionConfidence: 0,
      actionGuidance: 'Monitor market structure for high-confluence entry triggers',
      details: ['No active directional trade thesis']
    };
  }

  const isLong = direction === 'LONG';
  const effectiveAtr = atr > 0 ? atr : entryPrice * 0.02;
  const zoneMin = Math.min(entryZoneLow, entryZoneHigh);
  const zoneMax = Math.max(entryZoneLow, entryZoneHigh);

  // --------------------------------------------------------------------------
  // CHECK 1: INVALIDATION GATE (Highest Priority)
  // --------------------------------------------------------------------------
  const isInvalidatedBySL = isLong ? currentPrice <= stopLoss : currentPrice >= stopLoss;
  const isFailedBreakout = breakoutEval.classification === 'FAILED_BREAKOUT' ||
                           breakoutEval.classification === 'FAKE_BREAKOUT' ||
                           breakoutEval.stage === 'FAILED_BREAKOUT';

  if (isInvalidatedBySL) {
    const reason = isLong
      ? `Price (${formatPrice(currentPrice)}) breached invalidation stop loss at ${formatPrice(stopLoss)}`
      : `Price (${formatPrice(currentPrice)}) breached invalidation stop loss at ${formatPrice(stopLoss)}`;
    return {
      readiness: 'INVALIDATED',
      isExecutable: false,
      chaseRisk: false,
      exhaustionRisk: false,
      retestRequired: false,
      retestConfirmed: false,
      executionReason: reason,
      executionConfidence: 0,
      actionGuidance: 'Setup invalidated. Stand aside and wait for new market structure.',
      details: [reason]
    };
  }

  if (isFailedBreakout) {
    const reason = `Breakout failure detected (${breakoutEval.details})`;
    return {
      readiness: 'INVALIDATED',
      isExecutable: false,
      chaseRisk: false,
      exhaustionRisk: false,
      retestRequired: false,
      retestConfirmed: false,
      executionReason: reason,
      executionConfidence: 0,
      actionGuidance: 'Breakout rejected (trap detected). Invalidate setup.',
      details: [reason]
    };
  }

  // Calculate Pullback Zone & Safe Execution Zone
  const pullbackZone = calculatePullbackZone(
    direction,
    entryPrice,
    stopLoss,
    currentPrice,
    effectiveAtr,
    ema20,
    ema50,
    breakoutEval,
    liquidity,
    priceDecimals
  );

  const safestExecutionZone = calculateSafeExecutionZone(
    direction,
    entryPrice,
    stopLoss,
    effectiveAtr,
    priceDecimals
  );

  // --------------------------------------------------------------------------
  // CHECK 2: DON'T-CHASE & EXTENSION PROTECTION
  // --------------------------------------------------------------------------
  let chaseRisk = false;
  const distanceMoved = isLong ? (currentPrice - entryPrice) : (entryPrice - currentPrice);
  const atrMultipleMoved = distanceMoved / effectiveAtr;

  // 1. Distance to TP1 check
  if (tp1Price && tp1Price !== entryPrice) {
    const totalDistanceToTp1 = Math.abs(tp1Price - entryPrice);
    if (totalDistanceToTp1 > 0) {
      if (distanceMoved >= totalDistanceToTp1 * 0.5) {
        // Price covered >= 50% distance to TP1 -> ENTRY MISSED
        const reason = `Entry missed: Price has traversed ${(distanceMoved / totalDistanceToTp1 * 100).toFixed(0)}% of path to TP1 (${formatPrice(tp1Price)})`;
        return {
          readiness: 'ENTRY_MISSED',
          isExecutable: false,
          chaseRisk: true,
          exhaustionRisk: exhaustion.isExhausted,
          retestRequired: false,
          retestConfirmed: false,
          pullbackZone,
          retestLevel: breakoutEval.levelPrice > 0 ? breakoutEval.levelPrice : undefined,
          safestExecutionZone,
          executionReason: reason,
          executionConfidence: 30,
          actionGuidance: `Do not chase. Wait for a deep structural pullback to ${formatPrice(pullbackZone.idealEntry)}.`,
          details: [reason, `ATR Extension: ${atrMultipleMoved.toFixed(1)}x ATR`]
        };
      }

      if (distanceMoved >= totalDistanceToTp1 * 0.25) {
        chaseRisk = true;
        details.push(`Price extended ${(distanceMoved / totalDistanceToTp1 * 100).toFixed(0)}% towards TP1`);
      }
    }
  }

  // 2. ATR-Normalized Extension Check
  if (extension.level === 'SEVERELY_EXTENDED' || atrMultipleMoved >= 1.6) {
    chaseRisk = true;
    details.push(`Price overextended (${atrMultipleMoved.toFixed(1)}x ATR from entry, ${extension.details})`);
  }

  // 3. Candle Expansion & Momentum Acceleration Check
  if (candles && candles.length >= 2) {
    const lastBar = candles[candles.length - 1];
    const barBody = Math.abs(lastBar.close - lastBar.open);
    if (barBody > effectiveAtr * 1.8 && ((isLong && rsi > 72) || (!isLong && rsi < 28))) {
      chaseRisk = true;
      details.push('Abnormal candle expansion with climax momentum — high chase risk');
    }
  }

  // --------------------------------------------------------------------------
  // CHECK 3: RETEST & PROGRESSION QUALITY (Integrated with breakoutEngine)
  // --------------------------------------------------------------------------
  let retestRequired = false;
  let retestConfirmed = false;
  const retestLevel = breakoutEval.levelPrice > 0 ? breakoutEval.levelPrice : undefined;

  if (breakoutEval.levelPrice > 0) {
    if (breakoutEval.stage === 'BREAKOUT' || breakoutEval.stage === 'PRE_BREAKOUT') {
      // Breakout just happened or brewing, retest confirmation is pending
      retestRequired = true;
      details.push(`Breakout in progress at ${formatPrice(breakoutEval.levelPrice)} — awaiting retest confirmation`);
    } else if (breakoutEval.stage === 'RETEST') {
      // Actively retesting key level
      retestRequired = true;
      details.push(`Actively testing structural level at ${formatPrice(breakoutEval.levelPrice)}`);
    } else if (breakoutEval.stage === 'RETEST_CONFIRMED' || breakoutEval.stage === 'CONTINUATION' || breakoutEval.classification === 'CONFIRMED_CONTINUATION') {
      retestConfirmed = true;
      const score = (breakoutEval as any).progressionQualityScore ?? breakoutEval.qualityScore ?? 80;
      details.push(`Retest confirmed with high progression quality (${score}/100)`);
    }
  }

  // --------------------------------------------------------------------------
  // CHECK 4: MOMENTUM EXHAUSTION FILTER
  // --------------------------------------------------------------------------
  const exhaustionRisk = exhaustion.level === 'HIGH_EXHAUSTION' || (exhaustion.level === 'MODERATE_EXHAUSTION' && chaseRisk);
  if (exhaustionRisk) {
    details.push(`Momentum exhaustion active (${exhaustion.details.join(', ')})`);
  }

  // --------------------------------------------------------------------------
  // CHECK 5: LIQUIDITY CONGESTION & OPPOSING OBSTACLES
  // --------------------------------------------------------------------------
  let opposingLiquidityConflict = false;
  if (isLong && liquidity.resistanceCollision.detected) {
    opposingLiquidityConflict = true;
    details.push(liquidity.resistanceCollision.details);
  } else if (!isLong && liquidity.supportCollision.detected) {
    opposingLiquidityConflict = true;
    details.push(liquidity.supportCollision.details);
  }

  // --------------------------------------------------------------------------
  // CHECK 6: ENTRY ZONE GEOMETRY & EXECUTION READINESS SYNTHESIS
  // --------------------------------------------------------------------------
  const isInsideSafeZone = currentPrice >= safestExecutionZone.low && currentPrice <= safestExecutionZone.high;
  const zoneTolerance = Math.max(atr * 0.15, (zoneMax - zoneMin) * 0.05);
  const isInsideStandardZone = currentPrice >= (zoneMin - zoneTolerance) && currentPrice <= (zoneMax + zoneTolerance);
  const isWellPositioned = isInsideSafeZone || isInsideStandardZone;

  // Decision state logic
  let readiness: EntryReadiness = 'WAIT_FOR_ENTRY';
  let executionConfidence = 60;
  let actionGuidance = 'Stand by for optimal entry confirmation';
  let executionReason = '';

  if (chaseRisk) {
    readiness = 'WAIT_FOR_PULLBACK';
    executionConfidence = 45;
    executionReason = `Overextended move (${atrMultipleMoved.toFixed(1)}x ATR from entry). Don't-chase rule engaged.`;
    actionGuidance = `Wait for structural pullback to ${formatPrice(pullbackZone.idealEntry)} before considering entry.`;
  } else if (exhaustionRisk) {
    readiness = 'WAIT_FOR_PULLBACK';
    executionConfidence = 40;
    executionReason = `Momentum exhausted near local extreme. Awaiting exhaustion cool-off and pullback.`;
    actionGuidance = `Avoid buying/selling the top/bottom of expansion. Allow momentum to reset near ${formatPrice(pullbackZone.idealEntry)}.`;
  } else if (opposingLiquidityConflict) {
    readiness = 'WAIT_FOR_CONFIRMATION';
    executionConfidence = 45;
    executionReason = isLong
      ? `Price colliding directly into major overhead liquidity resistance.`
      : `Price colliding directly into major underlying liquidity support.`;
    actionGuidance = 'Wait for structural absorption or breakout through the opposing liquidity wall.';
  } else if (retestRequired && !retestConfirmed) {
    readiness = 'WAIT_FOR_RETEST';
    executionConfidence = 55;
    executionReason = `Breakout established at ${formatPrice(breakoutEval.levelPrice)} — awaiting retest confirmation shelf.`;
    actionGuidance = `Wait for price to retest ${formatPrice(breakoutEval.levelPrice)} with supportive volume before entering.`;
  } else if (isWellPositioned) {
    // Inside valid execution zone and all checks passed
    if (rvol >= 0.95 || retestConfirmed || marketRegime.bias === (isLong ? 'BULLISH' : 'BEARISH')) {
      readiness = 'ENTRY_NOW';
      executionConfidence = 85;
      executionReason = `Price (${formatPrice(currentPrice)}) positioned inside optimal execution zone with validated structure.`;
      actionGuidance = `Execute ${direction} immediately within ${formatPrice(safestExecutionZone.low)} – ${formatPrice(safestExecutionZone.high)}. SL: ${formatPrice(stopLoss)}.`;
    } else {
      readiness = 'WAIT_FOR_CONFIRMATION';
      executionConfidence = 55;
      executionReason = `Price in zone but volume / momentum confirmation is developing.`;
      actionGuidance = `Wait for volume expansion or candle confirmation before firing entry.`;
    }
  } else {
    // Outside optimal zone
    const isPastZoneLong = isLong && currentPrice > zoneMax;
    const isPastZoneShort = !isLong && currentPrice < zoneMin;

    if (isPastZoneLong || isPastZoneShort) {
      readiness = 'WAIT_FOR_PULLBACK';
      executionConfidence = 50;
      executionReason = `Price has drifted past immediate entry zone. Awaiting mean-reverting pullback.`;
      actionGuidance = `Wait for retracement towards ${formatPrice(pullbackZone.idealEntry)}.`;
    } else {
      readiness = 'WAIT_FOR_CONFIRMATION';
      executionConfidence = 55;
      executionReason = `Awaiting price arrival at structural entry zone.`;
      actionGuidance = `Monitor price action as it approaches ${formatPrice(entryPrice)}.`;
    }
  }

  // Adjust for Market Regime
  if (marketRegime.regime === 'HIGH_VOLATILITY' && readiness === 'ENTRY_NOW') {
    executionConfidence -= 10;
    details.push('High volatility regime: tight position sizing advised');
  } else if ((marketRegime.regime === 'STRONG_BULL' && isLong) || (marketRegime.regime === 'STRONG_BEAR' && !isLong)) {
    executionConfidence = Math.min(95, executionConfidence + 5);
  }

  const isExecutable = readiness === 'ENTRY_NOW';

  return {
    readiness,
    isExecutable,
    chaseRisk,
    exhaustionRisk,
    retestRequired,
    retestConfirmed,
    pullbackZone,
    retestLevel,
    safestExecutionZone,
    executionReason,
    executionConfidence,
    actionGuidance,
    details
  };
}
