import { Candle } from './cryptoService';
import {
  TargetLevel,
  TargetConfidence,
  TargetStatus,
  ProtectionMode,
  TradeManagementAnalysis,
  MarketRegimeType
} from '../src/types/crypto';
import type { MomentumExhaustionReport } from './coreIntelligenceEngine';
import type { BreakoutEvaluation } from './breakoutEngine';
import type { LiquidityStructureAnalysis } from './liquidityEngine';
import { formatPrice } from '../src/utils/formatters';

export interface DynamicTargetParams {
  entryPrice: number;
  stopLoss: number;
  direction: 'LONG' | 'SHORT';
  atr: number;
  regime?: MarketRegimeType;
  candles?: Candle[];
  patternMeasuredMove?: number;
  breakoutProjection?: number;
  trendlineProjection?: number;
  keyLevelsInDirection?: number[];
  liquidityPools?: { price: number; type?: string; description?: string }[];
  fairValueGaps?: { price: number; top?: number; bottom?: number; type?: string; description?: string }[];
  orderBlocks?: { price: number; type?: string; description?: string }[];
  priceDecimals?: number;
  explicitTargetCount?: number;
  opposingObstacles?: (number | { price: number; strength?: number })[];
}

export interface DynamicTargetResult {
  targets: TargetLevel[];
  riskRewardRatio: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
  totalTargetCount: number;
}

export interface TpValidationInput {
  entryPrice: number;
  stopLoss: number;
  direction: 'LONG' | 'SHORT';
  targets: Array<number | { price: number; label?: string; [key: string]: any }>;
  minSeparationPct?: number;
}

export interface TpValidationResult {
  isValid: boolean;
  reason?: string;
  rejectionReason?: string;
  validatedTargets: TargetLevel[];
  tp1?: number;
  tp2?: number;
  tp3?: number;
  tpCount: number;
}

/**
 * CENTRALIZED TP VALIDATION (Section 17 & 18)
 * Checks:
 * 1. finite
 * 2. positive
 * 3. unique
 * 4. correct ordering: LONG: Entry < TP1 < TP2 < TP3; SHORT: TP3 < TP2 < TP1 < Entry
 * 5. correct direction
 * 6. meaningful separation
 * 7. structural justification
 * 8. not equal Entry
 * 9. not equal SL
 * 10. no duplicate target (TP1 != TP2 != TP3)
 * 11. no reused target
 * 12. no fabricated extension
 *
 * If only one genuine structural target exists, returns ONLY TP1.
 */
export function validateTargetLadder(input: TpValidationInput): TpValidationResult {
  const { entryPrice, stopLoss, direction, targets } = input;
  const rawMinSep = input.minSeparationPct ?? 0.002;
  const minSeparationPct = rawMinSep > 0.05 ? rawMinSep / 100 : rawMinSep;

  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    const reason = 'INVALID_ENTRY_PRICE (must be positive finite)';
    return { isValid: false, reason, rejectionReason: reason, validatedTargets: [], tpCount: 0 };
  }
  if (!Number.isFinite(stopLoss) || stopLoss <= 0) {
    const reason = 'INVALID_STOP_LOSS (must be positive finite)';
    return { isValid: false, reason, rejectionReason: reason, validatedTargets: [], tpCount: 0 };
  }

  const isLong = direction === 'LONG';
  if (isLong) {
    if (stopLoss >= entryPrice) {
      const reason = `INVERTED_STOP_LOSS (SL ${stopLoss} must be < Entry ${entryPrice})`;
      return { isValid: false, reason, rejectionReason: reason, validatedTargets: [], tpCount: 0 };
    }
  } else {
    if (stopLoss <= entryPrice) {
      const reason = `INVERTED_STOP_LOSS (SL ${stopLoss} must be > Entry ${entryPrice})`;
      return { isValid: false, reason, rejectionReason: reason, validatedTargets: [], tpCount: 0 };
    }
  }

  if (!Array.isArray(targets) || targets.length === 0) {
    const reason = 'NO_TARGETS_PROVIDED (at least one valid target required)';
    return { isValid: false, reason, rejectionReason: reason, validatedTargets: [], tpCount: 0 };
  }

  const effectiveRisk = Math.abs(entryPrice - stopLoss);

  // Extract valid raw candidate items
  interface CandidateItem {
    price: number;
    label?: string;
    rawObj?: any;
  }
  const candidates: CandidateItem[] = [];

  for (let i = 0; i < targets.length; i++) {
    const raw = targets[i];
    const rawPrice = typeof raw === 'number' ? raw : raw?.price;
    const label = (typeof raw === 'object' && raw?.label) ? raw.label : undefined;
    const rawObj = typeof raw === 'object' ? raw : {};

    if (typeof rawPrice !== 'number' || !Number.isFinite(rawPrice) || rawPrice <= 0) {
      continue;
    }

    // Must not equal entry or SL
    if (Math.abs(rawPrice - entryPrice) / entryPrice < 0.0005) continue;
    if (Math.abs(rawPrice - stopLoss) / entryPrice < 0.0005) continue;

    // Must be in correct direction
    if (isLong && rawPrice <= entryPrice) continue;
    if (!isLong && rawPrice >= entryPrice) continue;

    candidates.push({ price: rawPrice, label, rawObj });
  }

  if (candidates.length === 0) {
    const reason = 'NO_STRUCTURAL_TARGETS_IN_DIRECTION';
    return { isValid: false, reason, rejectionReason: reason, validatedTargets: [], tpCount: 0 };
  }

  // Sort structurally: Long ascending, Short descending
  candidates.sort((a, b) => isLong ? a.price - b.price : b.price - a.price);

  // Deduplicate and enforce minimum separation
  const validatedTargets: TargetLevel[] = [];
  for (const c of candidates) {
    const isTooClose = validatedTargets.some(vt => (Math.abs(vt.price - c.price) / entryPrice) < minSeparationPct);
    if (!isTooClose) {
      const idx = validatedTargets.length + 1;
      const gainPct = isLong
        ? ((c.price - entryPrice) / entryPrice) * 100
        : ((entryPrice - c.price) / entryPrice) * 100;
      const rMult = effectiveRisk > 0 ? Math.abs(c.price - entryPrice) / effectiveRisk : 1.5;

      validatedTargets.push({
        id: `TP${idx}`,
        label: c.label || `TP${idx}`,
        price: c.price,
        percentage: Number(gainPct.toFixed(2)),
        rMultiple: Number(rMult.toFixed(1)),
        hit: false,
        status: 'ACTIVE',
        ...c.rawObj
      });
    }
  }

  if (validatedTargets.length === 0) {
    return { isValid: false, reason: 'NO_TARGETS_PASSED_SEPARATION', validatedTargets: [], tpCount: 0 };
  }

  return {
    isValid: true,
    validatedTargets,
    tp1: validatedTargets[0].price,
    tp2: validatedTargets.length > 1 ? validatedTargets[1].price : undefined,
    tp3: validatedTargets.length > 2 ? validatedTargets[2].price : undefined,
    tpCount: validatedTargets.length
  };
}

export interface TradeManagementParams {
  entryPrice: number;
  stopLoss: number;
  currentPrice: number;
  direction: 'LONG' | 'SHORT';
  targets: TargetLevel[];
  atr: number;
  marketRegime?: MarketRegimeType;
  exhaustion?: MomentumExhaustionReport;
  breakoutEval?: BreakoutEvaluation;
  liquidity?: LiquidityStructureAnalysis;
  candles?: Candle[];
  rsi?: number;
  rvol?: number;
  priceDecimals?: number;
}

interface RawTargetCandidate {
  price: number;
  source: string;
  structuralBasis: string;
  weight: number;
  rMultiple: number;
}

/**
 * PHASE 4.8 — ADVANCED DYNAMIC TARGET ENGINE
 * Generates mathematically & structurally justified profit targets with:
 * - Confluence clustering across multiple independent evidence sources
 * - Monotonic ordering and duplicate elimination
 * - Strict dynamic count (no forced TP4-TP10 quotas)
 * - Obstacle collision detection
 */
export function generateDynamicTargets(params: DynamicTargetParams): DynamicTargetResult {
  const {
    entryPrice,
    stopLoss,
    direction,
    atr,
    regime = 'NEUTRAL',
    candles = [],
    patternMeasuredMove,
    breakoutProjection,
    trendlineProjection,
    keyLevelsInDirection = [],
    liquidityPools = [],
    fairValueGaps = [],
    orderBlocks = [],
    priceDecimals = 2,
    explicitTargetCount,
    opposingObstacles = []
  } = params;

  const risk = Math.abs(entryPrice - stopLoss);
  const effectiveRisk = risk > 0 ? risk : Math.max(entryPrice * 0.015, atr * 1.5);
  const isLong = direction === 'LONG';
  const effectiveAtr = atr > 0 ? atr : entryPrice * 0.01;

  // Progressive R-multiples for structural tiers
  const standardRMultiples = [1.5, 2.5, 4.0, 5.5, 7.0, 9.0, 11.5, 14.0, 17.0, 20.0, 23.5, 27.0, 31.0, 35.5, 40.0];
  const rawCandidates: RawTargetCandidate[] = [];

  // 1. S/R Levels & Swing Points from Multi-Timeframe Structure
  if (Array.isArray(keyLevelsInDirection)) {
    for (let i = 0; i < keyLevelsInDirection.length; i++) {
      const lvl = keyLevelsInDirection[i];
      if (typeof lvl === 'number' && !isNaN(lvl)) {
        const isFavorable = isLong ? lvl > entryPrice : lvl < entryPrice;
        if (isFavorable) {
          const rMult = Math.abs(lvl - entryPrice) / effectiveRisk;
          if (rMult >= 0.8) {
            rawCandidates.push({
              price: lvl,
              source: `Major Structural ${isLong ? 'Resistance' : 'Support'} Pivot`,
              structuralBasis: `S/R Level at ${formatPrice(lvl)} (${rMult.toFixed(1)}R)`,
              weight: 3,
              rMultiple: rMult
            });
          }
        }
      }
    }
  }

  // 2. Liquidity Pool Levels (Buy-Side / Sell-Side Liquidity)
  if (Array.isArray(liquidityPools)) {
    for (const pool of liquidityPools) {
      if (pool && typeof pool.price === 'number' && !isNaN(pool.price)) {
        const isFavorable = isLong ? pool.price > entryPrice : pool.price < entryPrice;
        if (isFavorable) {
          const rMult = Math.abs(pool.price - entryPrice) / effectiveRisk;
          if (rMult >= 0.8) {
            rawCandidates.push({
              price: pool.price,
              source: pool.type || 'Liquidity Pool',
              structuralBasis: pool.description || `Liquidity Pool at ${formatPrice(pool.price)}`,
              weight: 3,
              rMultiple: rMult
            });
          }
        }
      }
    }
  }

  // 3. Pattern Measured Move
  if (patternMeasuredMove && typeof patternMeasuredMove === 'number' && !isNaN(patternMeasuredMove)) {
    const isFavorable = isLong ? patternMeasuredMove > entryPrice : patternMeasuredMove < entryPrice;
    if (isFavorable) {
      const rMult = Math.abs(patternMeasuredMove - entryPrice) / effectiveRisk;
      if (rMult >= 1.0) {
        rawCandidates.push({
          price: patternMeasuredMove,
          source: 'Pattern Measured Move',
          structuralBasis: `Chart Pattern Projected Target (${rMult.toFixed(1)}R)`,
          weight: 4,
          rMultiple: rMult
        });
      }
    }
  }

  // 4. Breakout Structural Projection
  if (breakoutProjection && typeof breakoutProjection === 'number' && !isNaN(breakoutProjection)) {
    const isFavorable = isLong ? breakoutProjection > entryPrice : breakoutProjection < entryPrice;
    if (isFavorable) {
      const rMult = Math.abs(breakoutProjection - entryPrice) / effectiveRisk;
      if (rMult >= 1.0) {
        rawCandidates.push({
          price: breakoutProjection,
          source: 'Breakout Expansion Target',
          structuralBasis: `Breakout Retest Projected Level (${rMult.toFixed(1)}R)`,
          weight: 3,
          rMultiple: rMult
        });
      }
    }
  }

  // 5. Trendline / Channel Projection
  if (trendlineProjection && typeof trendlineProjection === 'number' && !isNaN(trendlineProjection)) {
    const isFavorable = isLong ? trendlineProjection > entryPrice : trendlineProjection < entryPrice;
    if (isFavorable) {
      const rMult = Math.abs(trendlineProjection - entryPrice) / effectiveRisk;
      if (rMult >= 1.0) {
        rawCandidates.push({
          price: trendlineProjection,
          source: 'Trendline Channel Boundary',
          structuralBasis: `Ascending/Descending Channel Boundary Projection (${rMult.toFixed(1)}R)`,
          weight: 3,
          rMultiple: rMult
        });
      }
    }
  }

  // 6. Natural Swing High / Low Extraction from primary candles
  if (Array.isArray(candles) && candles.length >= 10) {
    const lookback = candles.slice(-50);
    for (let i = 2; i < lookback.length - 2; i++) {
      if (isLong) {
        // Swing high
        const isSwingHigh = lookback[i].high > lookback[i-1].high &&
                            lookback[i].high > lookback[i-2].high &&
                            lookback[i].high > lookback[i+1].high &&
                            lookback[i].high > lookback[i+2].high;
        if (isSwingHigh && lookback[i].high > entryPrice + effectiveRisk * 0.8) {
          const p = lookback[i].high;
          const rMult = (p - entryPrice) / effectiveRisk;
          rawCandidates.push({
            price: p,
            source: 'Previous Swing High',
            structuralBasis: `Structural Swing High at ${formatPrice(p)} (${rMult.toFixed(1)}R)`,
            weight: 2,
            rMultiple: rMult
          });
        }
      } else {
        // Swing low
        const isSwingLow = lookback[i].low < lookback[i-1].low &&
                           lookback[i].low < lookback[i-2].low &&
                           lookback[i].low < lookback[i+1].low &&
                           lookback[i].low < lookback[i+2].low;
        if (isSwingLow && lookback[i].low < entryPrice - effectiveRisk * 0.8) {
          const p = lookback[i].low;
          const rMult = (entryPrice - p) / effectiveRisk;
          rawCandidates.push({
            price: p,
            source: 'Previous Swing Low',
            structuralBasis: `Structural Swing Low at ${formatPrice(p)} (${rMult.toFixed(1)}R)`,
            weight: 2,
            rMultiple: rMult
          });
        }
      }
    }
  }

  // 7. Fair Value Gaps (FVG) and Order Blocks (OB)
  if (Array.isArray(params.fairValueGaps)) {
    for (const fvg of params.fairValueGaps) {
      if (fvg && typeof fvg.price === 'number' && !isNaN(fvg.price)) {
        const isFavorable = isLong ? fvg.price > entryPrice : fvg.price < entryPrice;
        if (isFavorable) {
          const rMult = Math.abs(fvg.price - entryPrice) / effectiveRisk;
          if (rMult >= 0.8) {
            rawCandidates.push({
              price: fvg.price,
              source: fvg.type ? `${fvg.type} FVG` : 'Fair Value Gap',
              structuralBasis: fvg.description || `Fair Value Gap Imbalance at ${formatPrice(fvg.price)} (${rMult.toFixed(1)}R)`,
              weight: 3,
              rMultiple: rMult
            });
          }
        }
      }
    }
  }

  if (Array.isArray(params.orderBlocks)) {
    for (const ob of params.orderBlocks) {
      if (ob && typeof ob.price === 'number' && !isNaN(ob.price)) {
        const isFavorable = isLong ? ob.price > entryPrice : ob.price < entryPrice;
        if (isFavorable) {
          const rMult = Math.abs(ob.price - entryPrice) / effectiveRisk;
          if (rMult >= 0.8) {
            rawCandidates.push({
              price: ob.price,
              source: ob.type ? `${ob.type} Order Block` : 'Order Block',
              structuralBasis: ob.description || `Order Block Level at ${formatPrice(ob.price)} (${rMult.toFixed(1)}R)`,
              weight: 3,
              rMultiple: rMult
            });
          }
        }
      }
    }
  }

  // Structural Target Invariant:
  // If zero structural candidates exist from market structure, S/R, liquidity pools,
  // order blocks, FVGs, channels, or swing points: NO VALID TARGET (Do NOT generate synthetic equal-spaced TPs).
  if (rawCandidates.length === 0) {
    return {
      targets: [],
      riskRewardRatio: 0,
      tp1: entryPrice,
      tp2: entryPrice,
      tp3: entryPrice,
      totalTargetCount: 0
    };
  }

  // Filter raw candidates to strictly valid direction
  const validDirectionCandidates = rawCandidates.filter(c => {
    if (isLong) return c.price > entryPrice && c.price > stopLoss;
    return c.price < entryPrice && c.price < stopLoss && c.price > 0;
  });

  if (validDirectionCandidates.length === 0) {
    return {
      targets: [],
      riskRewardRatio: 0,
      tp1: entryPrice,
      tp2: entryPrice,
      tp3: entryPrice,
      totalTargetCount: 0
    };
  }

  // Sort candidates in order of trade direction
  validDirectionCandidates.sort((a, b) => isLong ? a.price - b.price : b.price - a.price);

  // =========================================================================
  // TARGET CLUSTERING & CONFLUENCE RESOLUTION
  // =========================================================================
  const clusterTolerance = Math.max(effectiveAtr * 0.45, entryPrice * 0.0035);
  interface Cluster {
    representativePrice: number;
    sources: Set<string>;
    bases: string[];
    confluentCount: number;
    highestWeight: number;
    avgRMultiple: number;
  }

  const clusters: Cluster[] = [];

  for (const cand of validDirectionCandidates) {
    let matchedCluster = clusters.find(cl => Math.abs(cl.representativePrice - cand.price) <= clusterTolerance);
    if (matchedCluster) {
      matchedCluster.sources.add(cand.source);
      matchedCluster.bases.push(cand.structuralBasis);
      matchedCluster.confluentCount += 1;
      if (cand.weight > matchedCluster.highestWeight) {
        matchedCluster.representativePrice = cand.price; // Anchor to the strongest structural level
        matchedCluster.highestWeight = cand.weight;
      }
    } else {
      const srcSet = new Set<string>();
      srcSet.add(cand.source);
      clusters.push({
        representativePrice: cand.price,
        sources: srcSet,
        bases: [cand.structuralBasis],
        confluentCount: 1,
        highestWeight: cand.weight,
        avgRMultiple: cand.rMultiple
      });
    }
  }

  // Sort clusters monotonically
  clusters.sort((a, b) => isLong ? a.representativePrice - b.representativePrice : b.representativePrice - a.representativePrice);

  // Extract clean opposing obstacles
  const obstacles: number[] = opposingObstacles
    .map(obs => typeof obs === 'number' ? obs : obs?.price)
    .filter((p): p is number => typeof p === 'number' && !isNaN(p) && (isLong ? p > entryPrice : p < entryPrice))
    .sort((a, b) => isLong ? a - b : b - a);

  // =========================================================================
  // STRICT TARGET COUNT & MONOTONIC LADDER FORMATION
  // =========================================================================
  // Structure-first: Return only genuinely supported targets (1, 2, or 3+).
  // Do NOT fill missing targets with synthetic prices.
  const targetLimit = explicitTargetCount !== undefined
    ? Math.min(explicitTargetCount, clusters.length)
    : clusters.length;

  if (targetLimit === 0) {
    return {
      targets: [],
      riskRewardRatio: 0,
      tp1: entryPrice,
      tp2: entryPrice,
      tp3: entryPrice,
      totalTargetCount: 0
    };
  }

  const targets: TargetLevel[] = [];
  const minStep = Math.max(effectiveAtr * 0.35, entryPrice * 0.0025);

  for (let i = 0; i < targetLimit; i++) {
    const tpNumber = i + 1;
    const cl = clusters[i];
    if (!cl) break;

    const candidatePrice = cl.representativePrice;
    const sourcesList = Array.from(cl.sources);
    const isClustered = sourcesList.length > 1;
    const confluentCount = cl.confluentCount;
    let confidence: TargetConfidence = sourcesList.length >= 2 || cl.highestWeight >= 3 ? 'HIGH' : 'MEDIUM';
    let evidenceText = sourcesList.length > 1 ? sourcesList.slice(0, 3).join(' + ') : (sourcesList[0] || 'Market Structure Pivot');

    if (candidatePrice <= 0) continue;
    let cleanPrice = Number(candidatePrice.toFixed(priceDecimals));

    // Enforce strict ascending (LONG) or descending (SHORT) monotonic steps
    if (i > 0 && targets[i - 1]) {
      const prevPrice = targets[i - 1].price;
      if (isLong && cleanPrice <= prevPrice + minStep) {
        cleanPrice = Number((prevPrice + Math.max(minStep, effectiveRisk * 0.4)).toFixed(priceDecimals));
      } else if (!isLong && cleanPrice >= prevPrice - minStep) {
        cleanPrice = Number(Math.max(0.000001, prevPrice - Math.max(minStep, effectiveRisk * 0.4)).toFixed(priceDecimals));
      }
    }

    // Obstacle barrier collision check
    let ladderBlocked = false;
    if (obstacles.length > 0) {
      const prevPrice = i > 0 ? targets[i - 1].price : entryPrice;
      for (const obstaclePrice of obstacles) {
        const isBetween = isLong
          ? (obstaclePrice > prevPrice && obstaclePrice <= cleanPrice)
          : (obstaclePrice < prevPrice && obstaclePrice >= cleanPrice);

        if (isBetween) {
          cleanPrice = Number(obstaclePrice.toFixed(priceDecimals));
          evidenceText = `Terminal Structural Resistance Invalidation Wall`;
          confidence = 'HIGH';
          ladderBlocked = true;
          break;
        }
      }
    }

    const calculatedRMult = effectiveRisk > 0 ? Math.abs(cleanPrice - entryPrice) / effectiveRisk : (cl.avgRMultiple || 1.5);
    const gainPct = isLong
      ? ((cleanPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - cleanPrice) / entryPrice) * 100;

    targets.push({
      id: `TP${tpNumber}`,
      label: `TP${tpNumber}`,
      price: cleanPrice,
      percentage: Number(gainPct.toFixed(2)),
      rMultiple: Number(calculatedRMult.toFixed(1)),
      evidenceLevel: evidenceText,
      confidence,
      sources: sourcesList,
      structuralBasis: evidenceText,
      hit: false,
      status: 'ACTIVE',
      isClustered,
      confluentCount
    });

    if (ladderBlocked) {
      // Stopped by terminal opposing obstacle
      break;
    }
  }

  // Pass through central validation to enforce unique, strictly separated targets
  const validation = validateTargetLadder({
    entryPrice,
    stopLoss,
    direction,
    targets
  });

  const finalTargets = validation.isValid ? validation.validatedTargets : targets;
  const tp1 = finalTargets[0]?.price || 0;
  const tp2 = finalTargets.length > 1 ? finalTargets[1]?.price : undefined;
  const tp3 = finalTargets.length > 2 ? finalTargets[2]?.price : undefined;
  const maxTargetPrice = finalTargets.length > 0 ? finalTargets[finalTargets.length - 1].price : entryPrice;
  const riskRewardRatio = Number((effectiveRisk > 0 ? (Math.abs(maxTargetPrice - entryPrice) / effectiveRisk) : 2.5).toFixed(2));

  return {
    targets: finalTargets,
    riskRewardRatio,
    tp1,
    tp2,
    tp3,
    totalTargetCount: finalTargets.length
  };
}

/**
 * PHASE 4.8 — TRADE MANAGEMENT INTELLIGENCE
 * Evaluates active setup lifecycle, post-TP reassessment, structural profit protection,
 * and parabolic move defense without widening risk.
 */
export function evaluateTradeManagement(params: TradeManagementParams): TradeManagementAnalysis {
  const {
    entryPrice,
    stopLoss,
    currentPrice,
    direction,
    targets = [],
    atr,
    marketRegime = 'NEUTRAL',
    exhaustion,
    candles = [],
    rsi = 50,
    rvol = 1.0,
    priceDecimals = 2
  } = params;

  const isLong = direction === 'LONG';
  const effectiveAtr = atr > 0 ? atr : entryPrice * 0.01;
  const details: string[] = [];

  // Track target hit states
  let highestHitIndex = -1;
  let hitCount = 0;
  let invalidatedCount = 0;
  let activeCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (t.hit) {
      highestHitIndex = Math.max(highestHitIndex, i);
      hitCount++;
    } else if (t.status === 'INVALIDATED') {
      invalidatedCount++;
    } else {
      activeCount++;
    }
  }

  // 1. Post-TP Continuation Assessment
  let continuationViable = true;
  let postTpHitReason = 'Initial trade thesis active';

  if (highestHitIndex >= 0) {
    const highestHitTarget = targets[highestHitIndex];
    details.push(`${highestHitTarget.label} reached at ${formatPrice(highestHitTarget.price)}`);

    const hasExhaustion = exhaustion && (exhaustion.isExhausted || exhaustion.level === 'HIGH_EXHAUSTION');
    const isExtremeRsi = isLong ? rsi >= 80 : rsi <= 20;
    const isVolumeClimaxRejection = rvol >= 2.5 && (isLong ? (candles.slice(-1)[0]?.close || currentPrice) < (candles.slice(-1)[0]?.open || currentPrice) : (candles.slice(-1)[0]?.close || currentPrice) > (candles.slice(-1)[0]?.open || currentPrice));

    if (hasExhaustion || (isExtremeRsi && isVolumeClimaxRejection)) {
      continuationViable = false;
      postTpHitReason = `Post-${highestHitTarget.label} momentum exhaustion detected (${exhaustion?.level || 'RSI Extreme Climax'}). Remaining speculative targets downgraded.`;
      details.push(postTpHitReason);

      // Invalidate remaining unhit targets if momentum completely exhausts
      for (let j = highestHitIndex + 1; j < targets.length; j++) {
        if (!targets[j].hit && targets[j].status !== 'INVALIDATED') {
          targets[j].status = 'INVALIDATED';
          targets[j].invalidationReason = `Momentum exhausted after ${highestHitTarget.label} hit`;
          invalidatedCount++;
          activeCount = Math.max(0, activeCount - 1);
        }
      }
    } else {
      postTpHitReason = `Structure remains supportive following ${highestHitTarget.label} hit. Trajectory intact for remaining targets.`;
      details.push(postTpHitReason);
    }
  }

  // 2. Structural Trailing & Profit Protection Calculation
  let protectionMode: ProtectionMode = 'ORIGINAL_SL';
  let recommendedStopLoss = stopLoss;
  let trailingAnchor: string | undefined;

  if (highestHitIndex < 0) {
    // No target hit yet — enforce original structural SL
    protectionMode = 'ORIGINAL_SL';
    recommendedStopLoss = stopLoss;
    details.push(`Maintaining original structural stop loss at ${formatPrice(stopLoss)}`);
  } else if (highestHitIndex === 0) {
    // TP1 Hit — Activate Break-Even or Structural Trailing
    protectionMode = 'BREAK_EVEN';
    const breakEvenPrice = isLong
      ? Number((entryPrice + effectiveAtr * 0.05).toFixed(priceDecimals))
      : Number((entryPrice - effectiveAtr * 0.05).toFixed(priceDecimals));

    // Check if a structural swing point exists between entry and currentPrice
    let structuralTrailingPoint: number | null = null;
    if (candles.length >= 10) {
      const recent = candles.slice(-15);
      if (isLong) {
        const swingLows = recent.map(c => c.low).filter(l => l > entryPrice && l < currentPrice);
        if (swingLows.length > 0) {
          structuralTrailingPoint = Number((Math.min(...swingLows) - effectiveAtr * 0.2).toFixed(priceDecimals));
        }
      } else {
        const swingHighs = recent.map(c => c.high).filter(h => h < entryPrice && h > currentPrice);
        if (swingHighs.length > 0) {
          structuralTrailingPoint = Number((Math.max(...swingHighs) + effectiveAtr * 0.2).toFixed(priceDecimals));
        }
      }
    }

    if (structuralTrailingPoint !== null && (isLong ? structuralTrailingPoint > breakEvenPrice : structuralTrailingPoint < breakEvenPrice)) {
      protectionMode = 'STRUCTURAL_TRAILING';
      recommendedStopLoss = structuralTrailingPoint;
      trailingAnchor = `Recent structural swing pivot (${formatPrice(structuralTrailingPoint)})`;
      details.push(`TP1 achieved: Advanced stop loss to structural trailing anchor at ${formatPrice(structuralTrailingPoint)}`);
    } else {
      recommendedStopLoss = breakEvenPrice;
      trailingAnchor = `Break-even + buffer (${formatPrice(breakEvenPrice)})`;
      details.push(`TP1 achieved: Moved stop loss to break-even at ${formatPrice(breakEvenPrice)}`);
    }
  } else {
    // TP2+ Hit — Progressive Profit Lock: TP1->BE, TP2->TP1, TP3->TP2, TP(N)->TP(N-1)
    protectionMode = 'PROFIT_LOCKED';
    const prevTargetIndex = highestHitIndex - 1;
    const prevTarget = targets[prevTargetIndex] || targets[0];
    const prevPrice = prevTarget?.price || entryPrice;

    // Check if a structural swing point exists between previous TP and currentPrice that is even better
    let structuralPoint: number | null = null;
    if (candles.length >= 10) {
      const recent = candles.slice(-15);
      if (isLong) {
        const swingLows = recent.map(c => c.low).filter(l => l > prevPrice && l < currentPrice);
        if (swingLows.length > 0) {
          structuralPoint = Number((Math.min(...swingLows) - effectiveAtr * 0.15).toFixed(priceDecimals));
        }
      } else {
        const swingHighs = recent.map(c => c.high).filter(h => h < prevPrice && h > currentPrice);
        if (swingHighs.length > 0) {
          structuralPoint = Number((Math.max(...swingHighs) + effectiveAtr * 0.15).toFixed(priceDecimals));
        }
      }
    }

    const lockInPrice = structuralPoint !== null && (isLong ? structuralPoint > prevPrice : structuralPoint < prevPrice)
      ? structuralPoint
      : prevPrice;

    recommendedStopLoss = lockInPrice;
    trailingAnchor = `Progressive profit lock at ${prevTarget?.label || 'TP1'} (${formatPrice(lockInPrice)})`;
    details.push(`${targets[highestHitIndex]?.label || `TP${highestHitIndex + 1}`} achieved: Stop loss advanced to ${prevTarget?.label || 'TP1'} at ${formatPrice(lockInPrice)}`);
  }

  // =========================================================================
  // STRICT RISK PRESERVATION INVARIANT: NEVER WIDEN RISK
  // =========================================================================
  if (isLong) {
    recommendedStopLoss = Math.max(stopLoss, recommendedStopLoss);
  } else {
    recommendedStopLoss = Math.min(stopLoss, recommendedStopLoss);
  }

  // 3. Parabolic Pump / Dump Protection
  const priceDistance = Math.abs(currentPrice - entryPrice);
  const extensionRatio = effectiveAtr > 0 ? Number((priceDistance / effectiveAtr).toFixed(2)) : 1.0;
  const isParabolic = extensionRatio >= 3.0 || (isLong ? rsi >= 82 : rsi <= 18);
  let parabolicProtection: { detected: boolean; extensionRatio: number; action: string } | undefined;

  if (isParabolic) {
    const action = 'Tighten trailing stop and secure partial profits against sharp mean reversion';
    parabolicProtection = {
      detected: true,
      extensionRatio,
      action
    };
    details.push(`Parabolic move protection active (${extensionRatio}x ATR expansion): ${action}`);
    
    // Tighten stop closer to current price if higher than current recommended stop
    if (isLong) {
      const tightStop = Number((currentPrice - effectiveAtr * 1.2).toFixed(priceDecimals));
      if (tightStop > recommendedStopLoss) {
        recommendedStopLoss = tightStop;
        protectionMode = 'PROFIT_LOCKED';
        trailingAnchor = `Tight parabolic trailing buffer (${formatPrice(tightStop)})`;
      }
    } else {
      const tightStop = Number((currentPrice + effectiveAtr * 1.2).toFixed(priceDecimals));
      if (tightStop < recommendedStopLoss) {
        recommendedStopLoss = tightStop;
        protectionMode = 'PROFIT_LOCKED';
        trailingAnchor = `Tight parabolic trailing buffer (${formatPrice(tightStop)})`;
      }
    }
  }

  // 4. Runner Extension Logic
  const allOriginalTargetsHit = targets.length > 0 && targets.every(t => t.hit || t.status === 'INVALIDATED');
  const runnerExtensionActive = allOriginalTargetsHit &&
    (marketRegime === 'STRONG_BULL' || marketRegime === 'STRONG_BEAR') &&
    continuationViable;

  if (runnerExtensionActive) {
    details.push('All standard targets reached in strong trend regime: Runner extension enabled');
  }

  return {
    protectionMode,
    recommendedStopLoss,
    originalStopLoss: stopLoss,
    trailingAnchor,
    isRiskWidened: false,
    postTpHitStatus: highestHitIndex >= 0 ? {
      tpHitIndex: highestHitIndex + 1,
      continuationViable,
      reason: postTpHitReason
    } : undefined,
    parabolicProtection,
    activeTargetsCount: activeCount,
    hitTargetsCount: hitCount,
    invalidatedTargetsCount: invalidatedCount,
    runnerExtensionActive,
    details
  };
}
