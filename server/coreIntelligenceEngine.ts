import { Candle } from './cryptoService';
import { calculateEMA, calculateRSI, calculateMACD, calculateATR, calculateRVOL, detectPatterns, PatternResult } from './technicalAnalysis';
import { detectTrendlines, TrendlineEvidence, evaluatePatternTrendlineConfluence } from './trendlineEngine';
import { PatternDetectionResult } from './patternEngine';
import { DerivativesData } from './advancedMarketData';
import { ProcessedNews } from './newsIntelligenceEngine';
import {
  TimeframeEvidence,
  UnifiedMarketEvidence,
  fuseMarketEvidence,
  buildTimeframeEvidence,
  DirectionalBias,
  SetupDecision
} from './multiTimeframeEngine';
import {
  TargetLevel,
  CoreDecision,
  EntryReadiness,
  MarketRegimeType,
  DataQualityRating,
  EvidenceState,
  TradeWindow,
  CoreIntelligenceMetadata,
  Signal,
  ConfluenceItem,
  SignalQualityGrade,
  ActionablePriority,
  HypothesisCase,
  AdversarialAudit,
  BreakoutStage,
  BreakoutClassification,
  LiquidityClassification,
  LiquidityZone,
  SweepSequenceType,
  LiquidityAsymmetry,
  MomentumExhaustionLevel,
  PriceExtensionLevel,
  MarketBehaviorType,
  EntryQualityClassification,
  PullbackZone,
  TradeManagementAnalysis,
  MarketCycleAnalysis,
  PumpDumpIntelligence,
  FlowWhaleIntelligence,
  KillSwitchEvaluation,
  AplusConfluenceReport,
  SMCStructureReport,
  OrderflowReport,
  FibonacciConfluenceReport,
  DivergenceMatrixReport,
  RelativeStrengthMacroReport,
  DerivativesIntelligenceReport,
  InstitutionalIntelligenceReport
} from '../src/types/crypto';
import { formatBangladeshTime, formatPrice, formatPercent } from '../src/utils/formatters';
import { generateDeterministicSignalId, calculateActionablePriority } from './signalEngine';
export { generateDeterministicSignalId, calculateActionablePriority };
import { analyzeMarketCycle } from './marketCycleEngine';
import { evaluatePumpDumpIntelligence } from './momentumPumpDumpEngine';
import { evaluateFlowWhaleIntelligence } from './flowWhaleEngine';
import { evaluateKillSwitch } from './killSwitchEngine';
import { evaluateAplusConfluence } from './aplusConfluenceEngine';
import { evaluateInstitutionalIntelligence } from './institutionalIntelligenceEngine';
export {
  analyzeMarketCycle,
  evaluatePumpDumpIntelligence,
  evaluateFlowWhaleIntelligence,
  evaluateKillSwitch,
  evaluateAplusConfluence,
  evaluateInstitutionalIntelligence
};
import { analyzeLiquidityStructure, LiquidityStructureAnalysis, checkStructureCollision } from './liquidityEngine';
import { analyzeSMCStructure } from './smcStructureEngine';
import { evaluateBreakoutQuality, BreakoutEvaluation } from './breakoutEngine';
import {
  evaluateAdaptiveExecution,
  calculatePullbackZone,
  calculateSafeExecutionZone
} from './executionEngine';
import type {
  AdaptiveExecutionAnalysis,
  ExecutionContext
} from './executionEngine';
export {
  evaluateAdaptiveExecution,
  calculatePullbackZone,
  calculateSafeExecutionZone
};
export type {
  AdaptiveExecutionAnalysis,
  ExecutionContext
};
import {
  generateDynamicTargets,
  evaluateTradeManagement,
  DynamicTargetParams,
  DynamicTargetResult,
  TradeManagementParams
} from './tradeManagementEngine';
export {
  generateDynamicTargets,
  evaluateTradeManagement
};
export type {
  DynamicTargetParams,
  DynamicTargetResult,
  TradeManagementParams
};

// ============================================================================
// 1. EVIDENCE INTERFACES & CANONICAL MODELS
// ============================================================================

export interface EvidenceSourceEvaluation {
  category: string;
  name: string;
  state: EvidenceState;
  bias: DirectionalBias;
  weight: number;
  score: number;
  details: string;
}

export interface DataQualityReport {
  rating: DataQualityRating;
  isAcceptable: boolean;
  candleCount: number;
  hasTimeframeGaps: boolean;
  missingDerivatives: boolean;
  missingNews: boolean;
  details: string[];
}

export interface MarketRegimeEvaluation {
  regime: MarketRegimeType;
  bias: DirectionalBias;
  volatilityIndex: number;
  details: string;
}

export interface MomentumExhaustionReport {
  level: MomentumExhaustionLevel;
  score: number; // 0 - 100
  details: string[];
  isExhausted: boolean;
}

export interface PriceExtensionReport {
  level: PriceExtensionLevel;
  distanceFromEma20Pct: number;
  distanceFromEma50Pct: number;
  atrMultiple: number;
  details: string;
}

export interface CoreIntelligenceResult {
  symbol: string;
  decision: CoreDecision;
  confidence: number;
  moonScore: number;
  qualityGrade: SignalQualityGrade;
  actionablePriority?: ActionablePriority;
  marketRegime: MarketRegimeEvaluation;
  marketBehavior: MarketBehaviorType;
  dataQuality: DataQualityReport;
  entryStatus: EntryReadiness;
  entryQualityRating: EntryQualityClassification;
  adaptiveExecution?: AdaptiveExecutionAnalysis;
  pullbackZone?: PullbackZone;
  retestLevel?: number;
  safestExecutionZone?: { low: number; high: number; idealPrice: number };
  tradeManagement?: TradeManagementAnalysis;
  exhaustionReport: MomentumExhaustionReport;
  priceExtension: PriceExtensionReport;
  liquidityAsymmetry: LiquidityAsymmetry;
  entryPrice: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number;
  targets: TargetLevel[];
  riskRewardRatio: number;
  tradeWindow: TradeWindow;
  confirmations: string[];
  conflicts: string[];
  unknowns: string[];
  whyTrade: string[];
  whyNotPerfect: string[];
  keyRisk: string;
  invalidationReason: string;
  entryReason: string;
  liquidityReason: string;
  breakoutReason: string;
  regimeReason: string;
  exhaustionReason: string;
  conflictReason: string;
  targetReasons: { targetId: string; reason: string }[];
  longCase: HypothesisCase;
  shortCase: HypothesisCase;
  adversarialAudit: AdversarialAudit;
  explanation: string;
  riskExplanation: string;
  evidenceBreakdown: EvidenceSourceEvaluation[];
  marketCycle?: MarketCycleAnalysis;
  pumpDumpIntelligence?: PumpDumpIntelligence;
  flowWhaleIntelligence?: FlowWhaleIntelligence;
  killSwitch?: KillSwitchEvaluation;
  aplusConfluence?: AplusConfluenceReport;
  smcStructureReport?: SMCStructureReport;
  orderflowReport?: OrderflowReport;
  fibonacciReport?: FibonacciConfluenceReport;
  divergenceMatrixReport?: DivergenceMatrixReport;
  relativeStrengthReport?: RelativeStrengthMacroReport;
  derivativesIntelligenceReport?: DerivativesIntelligenceReport;
  institutionalIntelligence?: InstitutionalIntelligenceReport;
  signal: Signal | null;
}

// ============================================================================
// 2. DATA QUALITY GATE
// ============================================================================

export function evaluateDataQuality(
  primaryCandles: Candle[],
  timeframeCandlesMap: Record<string, Candle[] | undefined>,
  derivatives?: DerivativesData | null,
  newsList?: ProcessedNews[] | null
): DataQualityReport {
  const details: string[] = [];
  let score = 100;
  let hasTimeframeGaps = false;
  const candleCount = primaryCandles ? primaryCandles.length : 0;

  // 1. Candle Quantity Check
  if (!primaryCandles || primaryCandles.length < 20) {
    return {
      rating: 'INVALID',
      isAcceptable: false,
      candleCount,
      hasTimeframeGaps: true,
      missingDerivatives: !derivatives,
      missingNews: !newsList || newsList.length === 0,
      details: ['Fatal: Insufficient primary candle data (< 20 bars)']
    };
  }

  if (primaryCandles.length < 35) {
    score -= 25;
    details.push('Sub-optimal candle count for deep structural analysis');
  }

  const now = Date.now();
  const ONE_DAY_MS = 86400000;

  // 2. Candle Continuity, Timestamp Integrity & Extreme Validity Check
  for (let i = 0; i < primaryCandles.length; i++) {
    const c = primaryCandles[i];
    if (
      isNaN(c.open) || isNaN(c.high) || isNaN(c.low) || isNaN(c.close) ||
      c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0
    ) {
      return {
        rating: 'INVALID',
        isAcceptable: false,
        candleCount,
        hasTimeframeGaps: true,
        missingDerivatives: !derivatives,
        missingNews: !newsList || newsList.length === 0,
        details: ['Fatal: Corrupted or non-positive price values in candles']
      };
    }

    // Future timestamp check
    if (c.timestamp > now + ONE_DAY_MS) {
      return {
        rating: 'INVALID',
        isAcceptable: false,
        candleCount,
        hasTimeframeGaps: true,
        missingDerivatives: !derivatives,
        missingNews: !newsList || newsList.length === 0,
        details: ['Fatal: Future candle timestamps detected']
      };
    }

    // Extremes check: High must be >= Low, Open, Close. Low must be <= Open, Close.
    if (c.high < c.low || c.high < c.open || c.high < c.close || c.low > c.open || c.low > c.close) {
      return {
        rating: 'INVALID',
        isAcceptable: false,
        candleCount,
        hasTimeframeGaps: true,
        missingDerivatives: !derivatives,
        missingNews: !newsList || newsList.length === 0,
        details: ['Fatal: Inconsistent OHLC candle extremes (High < Low or Low > Open/Close)']
      };
    }

    // Duplicate or non-monotonic timestamps check
    if (i > 0) {
      const prev = primaryCandles[i - 1];
      if (c.timestamp === prev.timestamp) {
        return {
          rating: 'INVALID',
          isAcceptable: false,
          candleCount,
          hasTimeframeGaps: true,
          missingDerivatives: !derivatives,
          missingNews: !newsList || newsList.length === 0,
          details: ['Fatal: Duplicate candle timestamps detected']
        };
      }
      if (c.timestamp < prev.timestamp) {
        return {
          rating: 'INVALID',
          isAcceptable: false,
          candleCount,
          hasTimeframeGaps: true,
          missingDerivatives: !derivatives,
          missingNews: !newsList || newsList.length === 0,
          details: ['Fatal: Non-monotonic candle timestamps detected']
        };
      }
    }
  }

  // 3. Staleness Check
  if (primaryCandles.length > 0) {
    const lastCandle = primaryCandles[primaryCandles.length - 1];
    const ageMs = now - lastCandle.timestamp;
    if (ageMs > 14400000) {
      score -= 40;
      details.push(`Market data staleness detected (${Math.round(ageMs / 60000)}m old)`);
    }
  }

  // 4. Missing Derivatives Check (Handled cleanly as UNKNOWN)
  const missingDerivatives = !derivatives || derivatives.fundingRate === undefined;
  if (missingDerivatives) {
    details.push('Derivatives telemetry unavailable (marked UNKNOWN)');
  }

  // 5. Missing News Check (Handled cleanly as UNKNOWN)
  const missingNews = !newsList || newsList.length === 0;
  if (missingNews) {
    details.push('Live public news intelligence unavailable (marked UNKNOWN)');
  }

  let rating: DataQualityRating = 'HIGH';
  if (score < 50) rating = 'LOW';
  else if (score < 80 || missingDerivatives) rating = 'MEDIUM';

  return {
    rating,
    isAcceptable: rating === 'HIGH' || rating === 'MEDIUM',
    candleCount,
    hasTimeframeGaps,
    missingDerivatives,
    missingNews,
    details
  };
}

// ============================================================================
// 3. MARKET REGIME EVALUATION
// ============================================================================

export function evaluateMarketRegime(candles: Candle[]): MarketRegimeEvaluation {
  if (!candles || candles.length < 30) {
    return {
      regime: 'UNKNOWN',
      bias: 'UNKNOWN',
      volatilityIndex: 50,
      details: 'Insufficient data for market regime classification'
    };
  }

  const closes = candles.map(c => c.close);
  const len = closes.length;
  const latest = closes[len - 1];

  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema20 = ema20Arr[len - 1];
  const ema50 = ema50Arr[len - 1];
  const rsiArr = calculateRSI(closes, 14);
  const rsi = rsiArr[len - 1] !== undefined ? rsiArr[len - 1] : 50;
  const atrArr = calculateATR(candles, 14);
  const atr = atrArr[len - 1] !== undefined ? atrArr[len - 1] : latest * 0.02;
  const atrPercent = (atr / latest) * 100;

  // Volatility evaluation
  if (atrPercent > 4.5) {
    return {
      regime: 'HIGH_VOLATILITY',
      bias: 'NEUTRAL',
      volatilityIndex: 85,
      details: `Extreme volatility regime (ATR ${atrPercent.toFixed(2)}% of asset price)`
    };
  }

  if (latest > ema20 && ema20 > ema50 && rsi >= 55) {
    const isStrong = rsi > 62 && latest > ema20 * 1.01;
    return {
      regime: isStrong ? 'STRONG_BULL' : 'BULL',
      bias: 'BULLISH',
      volatilityIndex: Math.round(atrPercent * 15),
      details: isStrong
        ? 'Strong Bullish Regime: Price leading expanding 20/50 EMAs with high momentum'
        : 'Bullish Regime: Price established above upward-sloping EMAs'
    };
  }

  if (latest < ema20 && ema20 < ema50 && rsi <= 45) {
    const isStrong = rsi < 38 && latest < ema20 * 0.99;
    return {
      regime: isStrong ? 'STRONG_BEAR' : 'BEAR',
      bias: 'BEARISH',
      volatilityIndex: Math.round(atrPercent * 15),
      details: isStrong
        ? 'Strong Bearish Regime: Price compressed below declining 20/50 EMAs'
        : 'Bearish Regime: Price trading beneath downward-sloping EMAs'
    };
  }

  return {
    regime: 'NEUTRAL',
    bias: 'NEUTRAL',
    volatilityIndex: Math.round(atrPercent * 15),
    details: 'Neutral Rangebound Regime: Balanced mean-reverting price action'
  };
}

// ============================================================================
// 4. MOMENTUM EXHAUSTION ENGINE (PHASE 4.6)
// ============================================================================

export function detectMomentumExhaustion(
  candles: Candle[],
  rsi: number,
  ema20: number,
  ema50: number,
  atr: number
): MomentumExhaustionReport {
  const details: string[] = [];
  let score = 0;

  if (!candles || candles.length < 15) {
    return { level: 'NO_EXHAUSTION', score: 0, details: ['Insufficient data for exhaustion analysis'], isExhausted: false };
  }

  const len = candles.length;
  const current = candles[len - 1];
  const currentPrice = current.close;

  // 1. Extreme RSI check
  if (rsi >= 75) {
    score += 35;
    details.push(`Extreme Overbought RSI (${rsi.toFixed(1)})`);
  } else if (rsi <= 25) {
    score += 35;
    details.push(`Extreme Oversold RSI (${rsi.toFixed(1)})`);
  } else if (rsi >= 70 || rsi <= 30) {
    score += 15;
    details.push(`Elevated RSI (${rsi.toFixed(1)}) nearing boundary`);
  }

  // 2. Price extension from EMA20
  const distEma20Pct = Math.abs(currentPrice - ema20) / ema20 * 100;
  const atrPct = (atr / currentPrice) * 100;
  if (distEma20Pct > atrPct * 2.2) {
    score += 30;
    details.push(`Severe EMA20 price extension (+${distEma20Pct.toFixed(2)}% vs ${atrPct.toFixed(2)}% normal range)`);
  } else if (distEma20Pct > atrPct * 1.5) {
    score += 15;
    details.push(`Moderate EMA20 price extension (+${distEma20Pct.toFixed(2)}%)`);
  }

  // 3. Diminishing volume during recent high/low pushes
  const recent3 = candles.slice(len - 3);
  const v1 = recent3[0]?.volume || 0;
  const v2 = recent3[1]?.volume || 0;
  const v3 = recent3[2]?.volume || 0;
  if (v3 < v2 && v2 < v1 && v3 > 0) {
    score += 20;
    details.push('Diminishing volume across consecutive candle pushes (momentum decay)');
  }

  // 4. Repeated wicks / Rejections at extremes in last 3 bars
  const upperWickCount = recent3.filter(c => (c.high - Math.max(c.open, c.close)) > Math.abs(c.close - c.open)).length;
  const lowerWickCount = recent3.filter(c => (Math.min(c.open, c.close) - c.low) > Math.abs(c.close - c.open)).length;
  if (upperWickCount >= 2 && currentPrice > ema20) {
    score += 20;
    details.push('Repeated upper shadow rejections at local high');
  } else if (lowerWickCount >= 2 && currentPrice < ema20) {
    score += 20;
    details.push('Repeated lower shadow rejections at local low');
  }

  let level: MomentumExhaustionLevel = 'NO_EXHAUSTION';
  if (score >= 60) level = 'HIGH_EXHAUSTION';
  else if (score >= 40) level = 'MODERATE_EXHAUSTION';
  else if (score >= 20) level = 'EARLY_EXHAUSTION';

  return {
    level,
    score,
    details: details.length > 0 ? details : ['Normal momentum profile'],
    isExhausted: level === 'HIGH_EXHAUSTION' || level === 'MODERATE_EXHAUSTION'
  };
}

// ============================================================================
// 5. PRICE EXTENSION ENGINE (PHASE 4.6)
// ============================================================================

export function evaluatePriceExtension(
  currentPrice: number,
  ema20: number,
  ema50: number,
  atr: number,
  direction?: 'LONG' | 'SHORT'
): PriceExtensionReport {
  if (currentPrice <= 0 || ema20 <= 0) {
    return {
      level: 'OPTIMAL',
      distanceFromEma20Pct: 0,
      distanceFromEma50Pct: 0,
      atrMultiple: 0,
      details: 'Price extension within optimal baseline'
    };
  }

  const distEma20Pct = ((currentPrice - ema20) / ema20) * 100;
  const distEma50Pct = ((currentPrice - ema50) / ema50) * 100;
  const atrMultiple = atr > 0 ? Math.abs(currentPrice - ema20) / atr : 1.0;

  let level: PriceExtensionLevel = 'OPTIMAL';
  let details = 'Price well-anchored near structural dynamic support/resistance';

  if (atrMultiple >= 2.5 || Math.abs(distEma20Pct) > 4.5) {
    level = 'SEVERELY_EXTENDED';
    details = `Price severely stretched (${atrMultiple.toFixed(1)}x ATR from 20 EMA, ${distEma20Pct.toFixed(2)}%)`;
  } else if (atrMultiple >= 1.6 || Math.abs(distEma20Pct) > 2.5) {
    level = 'EXTENDED';
    details = `Price moderately extended (${atrMultiple.toFixed(1)}x ATR from 20 EMA, ${distEma20Pct.toFixed(2)}%)`;
  }

  return {
    level,
    distanceFromEma20Pct: Number(distEma20Pct.toFixed(2)),
    distanceFromEma50Pct: Number(distEma50Pct.toFixed(2)),
    atrMultiple: Number(atrMultiple.toFixed(2)),
    details
  };
}

// ============================================================================
// 6. ANALYTICAL ENTRY QUALITY ENGINE (PHASE 4.6)
// ============================================================================

export function evaluateAnalyticalEntryQuality(
  currentPrice: number,
  entryPrice: number,
  entryZoneLow: number,
  entryZoneHigh: number,
  stopLoss: number,
  direction: 'LONG' | 'SHORT',
  extension: PriceExtensionReport,
  exhaustion: MomentumExhaustionReport,
  breakoutEval: BreakoutEvaluation,
  rvol: number
): EntryQualityClassification {
  if (direction === 'LONG' && currentPrice <= stopLoss) return 'INVALID_ENTRY';
  if (direction === 'SHORT' && currentPrice >= stopLoss) return 'INVALID_ENTRY';

  const zoneMin = Math.min(entryZoneLow, entryZoneHigh);
  const zoneMax = Math.max(entryZoneLow, entryZoneHigh);

  // Chase risk if severely extended or high exhaustion with late entry
  if (extension.level === 'SEVERELY_EXTENDED' || exhaustion.level === 'HIGH_EXHAUSTION') {
    return 'CHASE_RISK';
  }

  const isExtendedLong = direction === 'LONG' && currentPrice > zoneMax * 1.015;
  const isExtendedShort = direction === 'SHORT' && currentPrice < zoneMin * 0.985;
  if (isExtendedLong || isExtendedShort) {
    return 'EXTENDED_ENTRY';
  }

  const zoneBuffer = zoneMin * 0.002;
  const isInsideZone = currentPrice >= (zoneMin - zoneBuffer) && currentPrice <= (zoneMax + zoneBuffer);
  if (isInsideZone && (breakoutEval.isConfirmed || rvol >= 1.1) && exhaustion.level === 'NO_EXHAUSTION') {
    return 'OPTIMAL_ENTRY';
  }

  if (isInsideZone || Math.abs(currentPrice - entryPrice) / entryPrice <= 0.008) {
    return 'GOOD_ENTRY';
  }

  return 'ACCEPTABLE_ENTRY';
}

// ============================================================================
// 7. MARKET BEHAVIOR CLASSIFIER (PHASE 4.6)
// ============================================================================

export function classifyMarketBehavior(
  regime: MarketRegimeEvaluation,
  breakout: BreakoutEvaluation,
  liquidity: LiquidityStructureAnalysis,
  rsi: number,
  rvol: number,
  atrPercent: number
): MarketBehaviorType {
  if (regime.regime === 'UNKNOWN') return 'UNKNOWN';
  if (atrPercent > 4.5 || regime.regime === 'HIGH_VOLATILITY') return 'HIGH_VOLATILITY';

  if (liquidity.liquiditySweep.detected) return 'LIQUIDITY_SWEEP';
  if (breakout.classification === 'FAILED_BREAKOUT' || breakout.classification === 'FAKE_BREAKOUT' || liquidity.failedBreakout) {
    return 'FAILED_BREAKOUT';
  }
  if (breakout.stage === 'RETEST' || breakout.stage === 'RETEST_CONFIRMED' || breakout.classification === 'BREAKOUT_RETEST') {
    return 'BREAKOUT_RETEST';
  }
  if (breakout.stage === 'CONTINUATION' || breakout.classification === 'CONFIRMED_CONTINUATION' || breakout.stage === 'BREAKOUT_CONFIRMED') {
    return 'BREAKOUT_EXPANSION';
  }

  if (regime.regime === 'STRONG_BULL' || (regime.regime === 'BULL' && rsi > 58)) return 'TRENDING_UP';
  if (regime.regime === 'STRONG_BEAR' || (regime.regime === 'BEAR' && rsi < 42)) return 'TRENDING_DOWN';

  if (rvol < 0.85 && Math.abs(rsi - 50) < 5) return 'LOW_MOMENTUM';
  if (regime.regime === 'NEUTRAL' || liquidity.classification === 'RANGE_BOUND_LIQUIDITY') return 'RANGE_BOUND';

  return 'MEAN_REVERSION';
}

// ============================================================================
// 8. DYNAMIC STOP LOSS ENGINE
// ============================================================================

export function calculateDynamicStopLoss(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  candles: Candle[],
  atr: number,
  patternInvalidation?: number,
  trendlineInvalidation?: number,
  priceDecimals: number = 2,
  supportResistanceLevel?: number,
  liquidityInvalidation?: number,
  orderBlockInvalidation?: number
): number {
  const len = candles.length;
  const recentSlice = candles.slice(Math.max(0, len - 30));
  const safeAtr = atr > 0 ? atr : entryPrice * 0.015;
  // Volatility buffer derived strictly from ATR, giving room past the structural level without arbitrary multipliers
  const volatilityBuffer = Math.max(safeAtr * 0.25, entryPrice * 0.0015);
  const minRiskBuffer = safeAtr * 0.35;
  
  if (direction === 'LONG') {
    // 1. Identify verified structural swing low pivots (fractal low with higher lows on left & right)
    const verifiedSwingLows: number[] = [];
    for (let i = 2; i < recentSlice.length - 1; i++) {
      const c = recentSlice[i];
      const prev1 = recentSlice[i - 1];
      const prev2 = recentSlice[i - 2];
      const next1 = recentSlice[i + 1];
      if (c.low <= prev1.low && c.low <= prev2.low && c.low <= next1.low) {
        if (c.low < entryPrice) {
          verifiedSwingLows.push(c.low);
        }
      }
    }

    // Most recent verified structural pivot low below entry
    const confirmedSwingLow = verifiedSwingLows.length > 0
      ? verifiedSwingLows[verifiedSwingLows.length - 1]
      : (recentSlice.length > 0 ? Math.min(...recentSlice.map(c => c.low)) : 0);

    const atrStop = entryPrice - (safeAtr * 1.8);
    
    const structuralCandidates: number[] = [];
    if (confirmedSwingLow > 0 && confirmedSwingLow < entryPrice) {
      structuralCandidates.push(confirmedSwingLow - volatilityBuffer);
    }
    if (patternInvalidation && patternInvalidation < entryPrice) {
      structuralCandidates.push(patternInvalidation - volatilityBuffer);
    }
    if (trendlineInvalidation && trendlineInvalidation < entryPrice) {
      structuralCandidates.push(trendlineInvalidation - volatilityBuffer);
    }
    if (supportResistanceLevel && supportResistanceLevel < entryPrice) {
      structuralCandidates.push(supportResistanceLevel - volatilityBuffer);
    }
    if (liquidityInvalidation && liquidityInvalidation < entryPrice) {
      structuralCandidates.push(liquidityInvalidation - volatilityBuffer);
    }
    if (orderBlockInvalidation && orderBlockInvalidation < entryPrice) {
      structuralCandidates.push(orderBlockInvalidation - volatilityBuffer);
    }
    
    // Only accept structural levels that provide genuine invalidation below entry
    const validStructural = structuralCandidates.filter(p => p <= entryPrice - minRiskBuffer && p > 0);
    // Structure-first: pick the highest valid structural invalidation level with buffer. If no structural level exists, return 0 (no fake fallback).
    const finalSL = validStructural.length > 0 ? Math.max(...validStructural) : 0;
    return finalSL > 0 ? Number(finalSL.toFixed(priceDecimals)) : 0;
  } else {
    // 1. Identify verified structural swing high pivots (fractal high with lower highs on left & right)
    const verifiedSwingHighs: number[] = [];
    for (let i = 2; i < recentSlice.length - 1; i++) {
      const c = recentSlice[i];
      const prev1 = recentSlice[i - 1];
      const prev2 = recentSlice[i - 2];
      const next1 = recentSlice[i + 1];
      if (c.high >= prev1.high && c.high >= prev2.high && c.high >= next1.high) {
        if (c.high > entryPrice) {
          verifiedSwingHighs.push(c.high);
        }
      }
    }

    // Most recent verified structural pivot high above entry
    const confirmedSwingHigh = verifiedSwingHighs.length > 0
      ? verifiedSwingHighs[verifiedSwingHighs.length - 1]
      : (recentSlice.length > 0 ? Math.max(...recentSlice.map(c => c.high)) : 0);

    const structuralCandidates: number[] = [];
    if (confirmedSwingHigh > 0 && confirmedSwingHigh > entryPrice) {
      structuralCandidates.push(confirmedSwingHigh + volatilityBuffer);
    }
    if (patternInvalidation && patternInvalidation > entryPrice) {
      structuralCandidates.push(patternInvalidation + volatilityBuffer);
    }
    if (trendlineInvalidation && trendlineInvalidation > entryPrice) {
      structuralCandidates.push(trendlineInvalidation + volatilityBuffer);
    }
    if (supportResistanceLevel && supportResistanceLevel > entryPrice) {
      structuralCandidates.push(supportResistanceLevel + volatilityBuffer);
    }
    if (liquidityInvalidation && liquidityInvalidation > entryPrice) {
      structuralCandidates.push(liquidityInvalidation + volatilityBuffer);
    }
    if (orderBlockInvalidation && orderBlockInvalidation > entryPrice) {
      structuralCandidates.push(orderBlockInvalidation + volatilityBuffer);
    }
    
    const validStructural = structuralCandidates.filter(p => p >= entryPrice + minRiskBuffer);
    // Structure-first: pick lowest valid structural resistance invalidation above entry. If no structural level exists, return 0 (no fake fallback).
    const finalSL = validStructural.length > 0 ? Math.min(...validStructural) : 0;
    return finalSL > 0 ? Number(finalSL.toFixed(priceDecimals)) : 0;
  }
}

// ============================================================================
// 9. DYNAMIC TARGET ENGINE (TP1 ... TP10, TP11, TP12 ... TPn)
// ============================================================================

export function generateMarketJustifiedTargets(
  entryPrice: number,
  stopLoss: number,
  direction: 'LONG' | 'SHORT',
  atr: number,
  regime: MarketRegimeType,
  patternMeasuredMove?: number,
  keyLevelsInDirection: number[] = [],
  priceDecimals: number = 2,
  explicitTargetCount?: number,
  opposingObstacles: (number | { price: number; strength?: number })[] = [],
  breakoutProjection?: number,
  candles?: Candle[],
  trendlineProjection?: number,
  liquidityPools?: { price: number; type?: string; description?: string }[],
  fairValueGaps?: { price: number; top?: number; bottom?: number; type?: string; description?: string }[],
  orderBlocks?: { price: number; type?: string; description?: string }[]
): DynamicTargetResult {
  return generateDynamicTargets({
    entryPrice,
    stopLoss,
    direction,
    atr,
    regime,
    patternMeasuredMove,
    keyLevelsInDirection,
    priceDecimals,
    explicitTargetCount,
    opposingObstacles,
    breakoutProjection,
    candles,
    trendlineProjection,
    liquidityPools,
    fairValueGaps,
    orderBlocks
  });
}

// ============================================================================
// 10. ENTRY DECISION & CHASE PROTECTION ENGINE
// ============================================================================

export function evaluateEntryReadiness(
  currentPrice: number,
  entryPrice: number,
  entryZoneLow: number,
  entryZoneHigh: number,
  stopLoss: number,
  direction: 'LONG' | 'SHORT',
  rvol: number = 1.0,
  hasBreakoutConfirmation: boolean = false,
  tp1Price?: number
): EntryReadiness {
  // Check if price already passed Stop Loss (Invalid setup)
  if (direction === 'LONG' && currentPrice <= stopLoss) return 'INVALID';
  if (direction === 'SHORT' && currentPrice >= stopLoss) return 'INVALID';

  const zoneMin = Math.min(entryZoneLow, entryZoneHigh);
  const zoneMax = Math.max(entryZoneLow, entryZoneHigh);

  // Chase Risk / Extended Entry Protection
  if (tp1Price && tp1Price !== entryPrice) {
    const totalDistanceToTp1 = Math.abs(tp1Price - entryPrice);
    const movedDistance = direction === 'LONG' ? (currentPrice - entryPrice) : (entryPrice - currentPrice);
    
    // If price has already covered >= 50% of distance to TP1, entry is missed
    if (movedDistance >= totalDistanceToTp1 * 0.5) {
      return 'ENTRY_MISSED';
    }
    
    // If price has extended > 25% of distance to TP1, wait for pullback
    if (movedDistance >= totalDistanceToTp1 * 0.25) {
      return 'WAIT_FOR_ENTRY';
    }
  }

  // Price extended beyond entry zone by more than 2% in trade direction -> Chase risk
  const isExtendedLong = direction === 'LONG' && currentPrice > zoneMax * 1.02;
  const isExtendedShort = direction === 'SHORT' && currentPrice < zoneMin * 0.98;
  if (isExtendedLong || isExtendedShort) {
    return 'WAIT_FOR_ENTRY';
  }

  // Check if current price is inside or very close to Entry Zone
  const zoneTolerance = Math.max((zoneMax - zoneMin) * 0.1, entryPrice * 0.001);
  const isInsideZone = currentPrice >= (zoneMin - zoneTolerance) && currentPrice <= (zoneMax + zoneTolerance);
  const isNearEntry = Math.abs(currentPrice - entryPrice) <= Math.max(zoneTolerance * 2, entryPrice * 0.005);

  if ((isInsideZone || isNearEntry) && (rvol >= 1.0 || hasBreakoutConfirmation)) {
    return 'ENTRY_NOW';
  }

  return 'WAIT_FOR_ENTRY';
}

// ============================================================================
// 11. TRADE WINDOW & EXPIRATION CALCULATION
// ============================================================================

export function calculateTradeWindow(
  baseTimestamp: number,
  timeframe: string = '1h',
  hasNewsCatalyst: boolean = false
): TradeWindow {
  const now = baseTimestamp || Date.now();
  
  const entryDurationMs = hasNewsCatalyst ? 45 * 60 * 1000 : 2 * 3600 * 1000;
  const expiryDurationMs = timeframe === '15m' ? 4 * 3600 * 1000 : 24 * 3600 * 1000;

  const entryWindowStart = now;
  const entryWindowEnd = now + entryDurationMs;
  const expiresAt = now + expiryDurationMs;

  return {
    entryWindowStart,
    entryWindowEnd,
    expiresAt,
    formattedStartBST: `${formatBangladeshTime(entryWindowStart)} BST`,
    formattedEndBST: `${formatBangladeshTime(entryWindowEnd)} BST`,
    formattedExpiryBST: `${formatBangladeshTime(expiresAt)} BST`
  };
}

// ============================================================================
// 12. BULL CASE VS BEAR CASE COMPILATION & ADVERSARIAL VALIDATION
// ============================================================================

export interface CaseAnalysisContext {
  symbol: string;
  currentPrice: number;
  primaryCandles: Candle[];
  timeframeCandlesMap: Record<string, Candle[] | undefined>;
  unifiedEvidence: UnifiedMarketEvidence;
  pattern: any;
  trendline: TrendlineEvidence | null;
  liquidity: LiquidityStructureAnalysis;
  breakoutEval: BreakoutEvaluation;
  marketRegime: MarketRegimeEvaluation;
  dataQuality: DataQualityReport;
  rvol: number;
  rsi: number;
  macdHist: number;
  ema20: number;
  ema50: number;
  exhaustion: MomentumExhaustionReport;
  extension: PriceExtensionReport;
  smcStructure?: SMCStructureReport;
}

export function constructHypothesisCases(ctx: CaseAnalysisContext): {
  longCase: HypothesisCase;
  shortCase: HypothesisCase;
} {
  const {
    currentPrice,
    unifiedEvidence,
    pattern,
    trendline,
    liquidity,
    breakoutEval,
    marketRegime,
    dataQuality,
    rvol,
    rsi,
    macdHist,
    ema20,
    ema50,
    exhaustion,
    extension,
    smcStructure
  } = ctx;

  const tf4h = unifiedEvidence.timeframes['4h'];
  const tf1h = unifiedEvidence.timeframes['1h'];

  // LONG CASE CALCULATION
  const longSupporting: string[] = [];
  const longConflicting: string[] = [];
  const longUnknowns: string[] = [];
  let longStructuralPoints = 0;
  let longMomentumPoints = 0;

  // Phase 21: Order Block (OB) & Fair Value Gap (FVG) Confluence Integration
  if (smcStructure) {
    const bullOB = smcStructure.nearestOrderBlock?.type === 'BULLISH' ? smcStructure.nearestOrderBlock : undefined;
    const activeBullOBs = (smcStructure.orderBlocks || []).filter(o => o.type === 'BULLISH' && o.status !== 'INVALIDATED');
    
    if (bullOB && bullOB.status !== 'INVALIDATED') {
      const isFresh = bullOB.status === 'ACTIVE';
      const isNearOB = currentPrice >= bullOB.bottom * 0.98 && currentPrice <= bullOB.top * 1.05;
      let obPoints = isNearOB ? (isFresh ? 18 : 14) : 10;
      if (bullOB.strength && bullOB.strength >= 60) obPoints += 5;
      longStructuralPoints += obPoints;
      const statusLabel = isFresh ? 'Fresh Unmitigated' : 'Retested';
      longSupporting.push(`Bullish Order Block (${statusLabel}): $${bullOB.bottom.toFixed(2)}–$${bullOB.top.toFixed(2)} [Strength: ${bullOB.strength || 70}%]`);
    } else if (activeBullOBs.length > 0) {
      longStructuralPoints += 8;
      longSupporting.push('Institutional Bullish Order Block demand base identified');
    }

    if (smcStructure.structureBias === 'BULLISH') {
      if (smcStructure.bosCount > 0) {
        longStructuralPoints += 12;
        longSupporting.push(`SMC Bullish Break of Structure (BOS count: ${smcStructure.bosCount})`);
      } else if (smcStructure.chochCount > 0) {
        longStructuralPoints += 10;
        longSupporting.push(`SMC Bullish Change of Character (CHoCH transition)`);
      }
    }

    const bearOB = smcStructure.nearestOrderBlock?.type === 'BEARISH' ? smcStructure.nearestOrderBlock : undefined;
    if (bearOB && bearOB.status !== 'INVALIDATED') {
      const isOverheadClose = currentPrice <= bearOB.top * 1.02 && currentPrice >= bearOB.bottom * 0.97;
      if (isOverheadClose) {
        longConflicting.push(`Opposing Bearish Order Block overhead supply at $${bearOB.midpoint.toFixed(2)}`);
      }
    }

    const activeBullFvgs = (smcStructure.fvgs || []).filter(f => f.type === 'BULLISH' && f.status !== 'MITIGATED');
    if (activeBullFvgs.length > 0) {
      const nearestFvg = smcStructure.nearestFvg?.type === 'BULLISH' && smcStructure.nearestFvg.status !== 'MITIGATED'
        ? smcStructure.nearestFvg
        : activeBullFvgs[0];
      const isInFvg = currentPrice >= nearestFvg.bottom * 0.99 && currentPrice <= nearestFvg.top * 1.02;
      longStructuralPoints += isInFvg ? 12 : 8;
      longSupporting.push(`Bullish Fair Value Gap (FVG) discount support ($${nearestFvg.bottom.toFixed(2)}–$${nearestFvg.top.toFixed(2)})`);
    }

    if (smcStructure.nearestFvg?.type === 'BEARISH' && smcStructure.nearestFvg.status === 'UNMITIGATED') {
      if (currentPrice >= smcStructure.nearestFvg.bottom * 0.98 && currentPrice <= smcStructure.nearestFvg.top * 1.02) {
        longConflicting.push(`Overhead Bearish FVG imbalance resistance ($${smcStructure.nearestFvg.bottom.toFixed(2)}–$${smcStructure.nearestFvg.top.toFixed(2)})`);
      }
    }

    if (smcStructure.multiTimeframeAligned && smcStructure.structureBias === 'BULLISH') {
      longStructuralPoints += 10;
      longSupporting.push('Multi-Timeframe SMC Trend & Liquidity Alignment');
    }
  }

  if (tf4h?.bias === 'BULLISH') {
    longStructuralPoints += 20;
    longSupporting.push('4H Macro Trend Bullish');
  } else if (tf4h?.bias === 'BEARISH') {
    longConflicting.push('4H Macro Trend opposing (BEARISH)');
  } else {
    longUnknowns.push('4H Macro layer unavailable');
  }

  if (tf1h?.bias === 'BULLISH') {
    longStructuralPoints += 20;
    longSupporting.push(`1H Market Structure (${tf1h.marketStructure.structure})`);
  } else if (tf1h?.bias === 'BEARISH') {
    longConflicting.push(`1H Market Structure opposing (${tf1h.marketStructure.structure})`);
  }

  if (pattern.detected && pattern.type === 'BULLISH' && (pattern.breakoutStatus === 'CONFIRMED' || pattern.breakoutStatus === 'BROKEN_OUT')) {
    const isConf = pattern.breakoutStatus === 'CONFIRMED';
    longStructuralPoints += isConf ? 20 : 10;
    longSupporting.push(`Bullish Pattern: ${pattern.name} (${pattern.breakoutStatus})`);
  } else if (pattern.detected && pattern.type === 'BEARISH' && (pattern.breakoutStatus === 'CONFIRMED' || pattern.breakoutStatus === 'BROKEN_OUT')) {
    longConflicting.push(`Bearish Pattern active: ${pattern.name}`);
  }

  if (trendline && trendline.detected && trendline.touchCount >= 3 && trendline.breakoutStatus === 'CONFIRMED' && (trendline.direction === 'BULLISH' || trendline.type === 'RESISTANCE')) {
    longStructuralPoints += 15;
    longSupporting.push(`Trendline: ${trendline.touchCount}-touch ${trendline.type} (${trendline.breakoutStatus})`);
  } else if (trendline && trendline.detected && trendline.direction === 'BEARISH' && trendline.breakoutStatus === 'CONFIRMED') {
    longConflicting.push(`Opposing ${trendline.type} Trendline resistance`);
  }

  if (liquidity.liquiditySweep.detected && liquidity.liquiditySweep.type === 'BULLISH_SWEEP') {
    longStructuralPoints += 15;
    longSupporting.push(liquidity.liquiditySweep.description);
  }
  if (breakoutEval.isConfirmed && breakoutEval.levelType === 'RESISTANCE') {
    longStructuralPoints += 10;
    longSupporting.push(breakoutEval.details);
  }

  // Phase 4.6 S/R Collision check
  if (liquidity.resistanceCollision.detected) {
    longConflicting.push(liquidity.resistanceCollision.details);
  }

  // Phase 4.6 Momentum Exhaustion / Extension check
  if (exhaustion.isExhausted && currentPrice > ema20) {
    longConflicting.push(`Bullish Momentum Exhaustion: ${exhaustion.details[0]}`);
  }
  if (extension.level === 'SEVERELY_EXTENDED') {
    longConflicting.push(extension.details);
  }

  // Momentum & Derivatives (Secondary indicator protection: bounded points)
  if (marketRegime.bias === 'BULLISH') longMomentumPoints += 10;
  if (rvol >= 1.2) longMomentumPoints += 5;
  if (currentPrice > ema20 && ema20 >= ema50) longMomentumPoints += 5;
  if (rsi >= 50 && rsi <= 72) longMomentumPoints += 5;
  if (macdHist >= 0) longMomentumPoints += 5;

  if (!unifiedEvidence.derivatives.isMissing) {
    if (unifiedEvidence.derivatives.bias === 'BULLISH') {
      longMomentumPoints += 5;
      longSupporting.push('Derivatives: Balanced/Negative funding rate');
    } else if (unifiedEvidence.derivatives.bias === 'BEARISH') {
      longConflicting.push('Derivatives: High positive funding rate indicates crowded longs');
    }
  } else {
    longUnknowns.push('Derivatives telemetry unavailable (marked UNKNOWN)');
  }

  if (!unifiedEvidence.news.isMissing && unifiedEvidence.news.bias !== 'UNKNOWN') {
    if (unifiedEvidence.news.bias === 'BULLISH') {
      longMomentumPoints += 5;
      longSupporting.push(`Public News: ${unifiedEvidence.news.latestHeadlines[0] || 'Bullish Catalyst'}`);
    } else if (unifiedEvidence.news.bias === 'BEARISH') {
      longConflicting.push(`Public News opposing: ${unifiedEvidence.news.latestHeadlines[0] || 'Bearish Catalyst'}`);
    }
  } else {
    longUnknowns.push('Public news catalyst unavailable (marked UNKNOWN)');
  }

  const longOverallStrength = Math.min(100, Math.max(0, longStructuralPoints + longMomentumPoints - (longConflicting.length * 15)));

  const longCase: HypothesisCase = {
    direction: 'LONG',
    overallCaseStrength: longOverallStrength,
    structuralStrength: Math.min(100, longStructuralPoints),
    supportingEvidence: longSupporting,
    conflictingEvidence: longConflicting,
    unknownEvidence: longUnknowns,
    strongestConfirmation: longSupporting[0] || 'No primary bullish confirmation',
    strongestContradiction: longConflicting[0] || 'None',
    marketRegimeAlignment: marketRegime.bias === 'BULLISH',
    riskRewardQuality: 2.5,
    entryQuality: 'OPTIMAL',
    dataQuality: dataQuality.rating
  };

  // SHORT CASE CALCULATION
  const shortSupporting: string[] = [];
  const shortConflicting: string[] = [];
  const shortUnknowns: string[] = [];
  let shortStructuralPoints = 0;
  let shortMomentumPoints = 0;

  // Phase 21: Order Block (OB) & Fair Value Gap (FVG) Confluence Integration
  if (smcStructure) {
    const bearOB = smcStructure.nearestOrderBlock?.type === 'BEARISH' ? smcStructure.nearestOrderBlock : undefined;
    const activeBearOBs = (smcStructure.orderBlocks || []).filter(o => o.type === 'BEARISH' && o.status !== 'INVALIDATED');
    
    if (bearOB && bearOB.status !== 'INVALIDATED') {
      const isFresh = bearOB.status === 'ACTIVE';
      const isNearOB = currentPrice <= bearOB.top * 1.02 && currentPrice >= bearOB.bottom * 0.95;
      let obPoints = isNearOB ? (isFresh ? 18 : 14) : 10;
      if (bearOB.strength && bearOB.strength >= 60) obPoints += 5;
      shortStructuralPoints += obPoints;
      const statusLabel = isFresh ? 'Fresh Unmitigated' : 'Retested';
      shortSupporting.push(`Bearish Order Block (${statusLabel}): $${bearOB.bottom.toFixed(2)}–$${bearOB.top.toFixed(2)} [Strength: ${bearOB.strength || 70}%]`);
    } else if (activeBearOBs.length > 0) {
      shortStructuralPoints += 8;
      shortSupporting.push('Institutional Bearish Order Block supply ceiling identified');
    }

    if (smcStructure.structureBias === 'BEARISH') {
      if (smcStructure.bosCount > 0) {
        shortStructuralPoints += 12;
        shortSupporting.push(`SMC Bearish Break of Structure (BOS count: ${smcStructure.bosCount})`);
      } else if (smcStructure.chochCount > 0) {
        shortStructuralPoints += 10;
        shortSupporting.push(`SMC Bearish Change of Character (CHoCH breakdown)`);
      }
    }

    const bullOB = smcStructure.nearestOrderBlock?.type === 'BULLISH' ? smcStructure.nearestOrderBlock : undefined;
    if (bullOB && bullOB.status !== 'INVALIDATED') {
      const isUnderlyingClose = currentPrice >= bullOB.bottom * 0.98 && currentPrice <= bullOB.top * 1.03;
      if (isUnderlyingClose) {
        shortConflicting.push(`Opposing Bullish Order Block underlying demand at $${bullOB.midpoint.toFixed(2)}`);
      }
    }

    const activeBearFvgs = (smcStructure.fvgs || []).filter(f => f.type === 'BEARISH' && f.status !== 'MITIGATED');
    if (activeBearFvgs.length > 0) {
      const nearestFvg = smcStructure.nearestFvg?.type === 'BEARISH' && smcStructure.nearestFvg.status !== 'MITIGATED'
        ? smcStructure.nearestFvg
        : activeBearFvgs[0];
      const isInFvg = currentPrice >= nearestFvg.bottom * 0.98 && currentPrice <= nearestFvg.top * 1.02;
      shortStructuralPoints += isInFvg ? 12 : 8;
      shortSupporting.push(`Bearish Fair Value Gap (FVG) premium resistance ($${nearestFvg.bottom.toFixed(2)}–$${nearestFvg.top.toFixed(2)})`);
    }

    if (smcStructure.nearestFvg?.type === 'BULLISH' && smcStructure.nearestFvg.status === 'UNMITIGATED') {
      if (currentPrice >= smcStructure.nearestFvg.bottom * 0.98 && currentPrice <= smcStructure.nearestFvg.top * 1.02) {
        shortConflicting.push(`Underlying Bullish FVG imbalance support ($${smcStructure.nearestFvg.bottom.toFixed(2)}–$${smcStructure.nearestFvg.top.toFixed(2)})`);
      }
    }

    if (smcStructure.multiTimeframeAligned && smcStructure.structureBias === 'BEARISH') {
      shortStructuralPoints += 10;
      shortSupporting.push('Multi-Timeframe SMC Trend & Liquidity Alignment');
    }
  }

  if (tf4h?.bias === 'BEARISH') {
    shortStructuralPoints += 20;
    shortSupporting.push('4H Macro Trend Bearish');
  } else if (tf4h?.bias === 'BULLISH') {
    shortConflicting.push('4H Macro Trend opposing (BULLISH)');
  } else {
    shortUnknowns.push('4H Macro layer unavailable');
  }

  if (tf1h?.bias === 'BEARISH') {
    shortStructuralPoints += 20;
    shortSupporting.push(`1H Market Structure (${tf1h.marketStructure.structure})`);
  } else if (tf1h?.bias === 'BULLISH') {
    shortConflicting.push(`1H Market Structure opposing (${tf1h.marketStructure.structure})`);
  }

  if (pattern.detected && pattern.type === 'BEARISH' && (pattern.breakoutStatus === 'CONFIRMED' || pattern.breakoutStatus === 'BROKEN_OUT')) {
    const isConf = pattern.breakoutStatus === 'CONFIRMED';
    shortStructuralPoints += isConf ? 20 : 10;
    shortSupporting.push(`Bearish Pattern: ${pattern.name} (${pattern.breakoutStatus})`);
  } else if (pattern.detected && pattern.type === 'BULLISH' && (pattern.breakoutStatus === 'CONFIRMED' || pattern.breakoutStatus === 'BROKEN_OUT')) {
    shortConflicting.push(`Bullish Pattern active: ${pattern.name}`);
  }

  if (trendline && trendline.detected && trendline.touchCount >= 3 && trendline.breakoutStatus === 'CONFIRMED' && (trendline.direction === 'BEARISH' || trendline.type === 'SUPPORT')) {
    shortStructuralPoints += 15;
    shortSupporting.push(`Trendline: ${trendline.touchCount}-touch ${trendline.type} (${trendline.breakoutStatus})`);
  } else if (trendline && trendline.detected && trendline.direction === 'BULLISH' && trendline.breakoutStatus === 'CONFIRMED') {
    shortConflicting.push(`Opposing ${trendline.type} Trendline support`);
  }

  if (liquidity.liquiditySweep.detected && liquidity.liquiditySweep.type === 'BEARISH_SWEEP') {
    shortStructuralPoints += 15;
    shortSupporting.push(liquidity.liquiditySweep.description);
  }
  if (breakoutEval.isConfirmed && breakoutEval.levelType === 'SUPPORT') {
    shortStructuralPoints += 10;
    shortSupporting.push(breakoutEval.details);
  }

  // Phase 4.6 S/R Collision check
  if (liquidity.supportCollision.detected) {
    shortConflicting.push(liquidity.supportCollision.details);
  }

  // Phase 4.6 Momentum Exhaustion / Extension check
  if (exhaustion.isExhausted && currentPrice < ema20) {
    shortConflicting.push(`Bearish Momentum Exhaustion: ${exhaustion.details[0]}`);
  }
  if (extension.level === 'SEVERELY_EXTENDED') {
    shortConflicting.push(extension.details);
  }

  // Momentum & Derivatives
  if (marketRegime.bias === 'BEARISH') shortMomentumPoints += 10;
  if (rvol >= 1.2) shortMomentumPoints += 5;
  if (currentPrice < ema20 && ema20 <= ema50) shortMomentumPoints += 5;
  if (rsi <= 50 && rsi >= 28) shortMomentumPoints += 5;
  if (macdHist <= 0) shortMomentumPoints += 5;

  if (!unifiedEvidence.derivatives.isMissing) {
    if (unifiedEvidence.derivatives.bias === 'BEARISH') {
      shortMomentumPoints += 5;
      shortSupporting.push('Derivatives: High funding rate favors short squeeze unwind');
    } else if (unifiedEvidence.derivatives.bias === 'BULLISH') {
      shortConflicting.push('Derivatives: Negative funding rate indicates crowded shorts');
    }
  } else {
    shortUnknowns.push('Derivatives telemetry unavailable (marked UNKNOWN)');
  }

  if (!unifiedEvidence.news.isMissing && unifiedEvidence.news.bias !== 'UNKNOWN') {
    if (unifiedEvidence.news.bias === 'BEARISH') {
      shortMomentumPoints += 5;
      shortSupporting.push(`Public News: ${unifiedEvidence.news.latestHeadlines[0] || 'Bearish Catalyst'}`);
    } else if (unifiedEvidence.news.bias === 'BULLISH') {
      shortConflicting.push(`Public News opposing: ${unifiedEvidence.news.latestHeadlines[0] || 'Bullish Catalyst'}`);
    }
  } else {
    shortUnknowns.push('Public news catalyst unavailable (marked UNKNOWN)');
  }

  const shortOverallStrength = Math.min(100, Math.max(0, shortStructuralPoints + shortMomentumPoints - (shortConflicting.length * 15)));

  const shortCase: HypothesisCase = {
    direction: 'SHORT',
    overallCaseStrength: shortOverallStrength,
    structuralStrength: Math.min(100, shortStructuralPoints),
    supportingEvidence: shortSupporting,
    conflictingEvidence: shortConflicting,
    unknownEvidence: shortUnknowns,
    strongestConfirmation: shortSupporting[0] || 'No primary bearish confirmation',
    strongestContradiction: shortConflicting[0] || 'None',
    marketRegimeAlignment: marketRegime.bias === 'BEARISH',
    riskRewardQuality: 2.5,
    entryQuality: 'OPTIMAL',
    dataQuality: dataQuality.rating
  };

  return { longCase, shortCase };
}

export function performAdversarialAudit(
  tentativeDirection: 'LONG' | 'SHORT' | null,
  longCase: HypothesisCase,
  shortCase: HypothesisCase,
  liquidity: LiquidityStructureAnalysis,
  breakoutEval: BreakoutEvaluation,
  marketRegime: MarketRegimeEvaluation,
  dataQuality: DataQualityReport,
  rvol: number,
  currentPrice: number,
  atr: number
): AdversarialAudit {
  if (!tentativeDirection) {
    return {
      targetDirection: 'WAIT',
      primaryFailureRisk: 'No clear directional structural edge',
      opposingStructureRisk: false,
      liquidityRisk: false,
      breakoutFailureRisk: false,
      derivativesConflictRisk: false,
      newsConflictRisk: false,
      chaseRisk: false,
      riskRewardRisk: false,
      adversarialVerdict: 'REJECTED',
      downgradePenalty: 0,
      details: ['Market in neutral or conflicting state']
    };
  }

  const isLong = tentativeDirection === 'LONG';
  const activeCase = isLong ? longCase : shortCase;
  const opposingCase = isLong ? shortCase : longCase;
  const details: string[] = [];
  let downgradePenalty = 0;

  // 1. Opposing Structure Risk
  const opposingStructureRisk = opposingCase.structuralStrength >= 20 || opposingCase.supportingEvidence.length >= 2;
  if (opposingStructureRisk) {
    details.push(`Opposing structural pressure: ${opposingCase.strongestConfirmation}`);
    downgradePenalty += 15;
  }


  // 2. Liquidity Risk (e.g. Bearish sweep on LONG, or Bullish sweep on SHORT)
  const liquidityRisk = isLong
    ? (liquidity.liquiditySweep.detected && liquidity.liquiditySweep.type === 'BEARISH_SWEEP') || liquidity.failedBreakout
    : (liquidity.liquiditySweep.detected && liquidity.liquiditySweep.type === 'BULLISH_SWEEP') || liquidity.failedBreakout;
  if (liquidityRisk) {
    details.push(isLong ? 'Liquidity rejection at highs detected' : 'Liquidity absorption at lows detected');
    downgradePenalty += 20;
  }

  // 3. Breakout Failure Risk
  const breakoutFailureRisk = breakoutEval.stage === 'FAILED_BREAKOUT' || breakoutEval.classification === 'FAKE_BREAKOUT';
  if (breakoutFailureRisk) {
    details.push(breakoutEval.details);
    downgradePenalty += 25;
  }

  // 4. S/R Collision Risk (Phase 4.6)
  const collisionRisk = isLong ? liquidity.resistanceCollision.detected : liquidity.supportCollision.detected;
  if (collisionRisk) {
    const colDetails = isLong ? liquidity.resistanceCollision.details : liquidity.supportCollision.details;
    details.push(colDetails);
    downgradePenalty += 25;
  }

  // 5. Derivatives Conflict Risk
  const derivativesConflictRisk = activeCase.conflictingEvidence.some(c => c.toLowerCase().includes('derivatives') || c.toLowerCase().includes('funding'));
  if (derivativesConflictRisk) {
    details.push('Derivatives positioning directly contradicts setup direction');
    downgradePenalty += 10;
  }

  // 6. News Conflict Risk
  const newsConflictRisk = activeCase.conflictingEvidence.some(c => c.toLowerCase().includes('news') || c.toLowerCase().includes('catalyst'));
  if (newsConflictRisk) {
    details.push('High-impact public news opposes technical direction');
    downgradePenalty += 15;
  }

  // 7. Data Quality Risk
  if (dataQuality.rating === 'LOW') {
    details.push('Low data quality degrades analytical confidence');
    downgradePenalty += 20;
  }

  let adversarialVerdict: 'APPROVED' | 'DOWNGRADED' | 'REJECTED' = 'APPROVED';
  if (breakoutFailureRisk || collisionRisk || downgradePenalty >= 40 || opposingCase.structuralStrength > activeCase.structuralStrength) {
    adversarialVerdict = 'REJECTED';
  } else if (downgradePenalty >= 15) {
    adversarialVerdict = 'DOWNGRADED';
  }

  const primaryFailureRisk = details[0] || (isLong ? 'Potential overhead supply rejection' : 'Potential underlying demand absorption');

  return {
    targetDirection: tentativeDirection,
    primaryFailureRisk,
    opposingStructureRisk,
    liquidityRisk,
    breakoutFailureRisk,
    derivativesConflictRisk,
    newsConflictRisk,
    chaseRisk: false,
    riskRewardRisk: false,
    adversarialVerdict,
    downgradePenalty,
    details
  };
}

// ============================================================================
// 13. SIGNAL QUALITY GRADE EVALUATOR
// ============================================================================

export function calculateSignalQualityGrade(
  decision: CoreDecision,
  confidence: number,
  primaryConfirmationsCount: number,
  dataQualityRating: DataQualityRating,
  riskRewardRatio: number,
  adversarialVerdict: 'APPROVED' | 'DOWNGRADED' | 'REJECTED',
  hasSevereConflict: boolean
): SignalQualityGrade {
  if (decision === 'WAIT' || hasSevereConflict || adversarialVerdict === 'REJECTED') {
    return 'WAIT';
  }
  if (dataQualityRating === 'INVALID') return 'WAIT';

  if (
    confidence >= 80 &&
    primaryConfirmationsCount >= 2 &&
    dataQualityRating === 'HIGH' &&
    riskRewardRatio >= 2.0 &&
    adversarialVerdict === 'APPROVED'
  ) {
    return 'A+';
  }
  if (
    confidence >= 70 &&
    primaryConfirmationsCount >= 2 &&
    (dataQualityRating === 'HIGH' || dataQualityRating === 'MEDIUM') &&
    riskRewardRatio >= 1.8
  ) {
    return 'A';
  }
  if (
    confidence >= 60 &&
    primaryConfirmationsCount >= 1 &&
    riskRewardRatio >= 1.5
  ) {
    return 'B';
  }
  if (confidence >= 45) {
    return 'C';
  }
  return 'WAIT';
}

// ============================================================================
// 14. CORE INTELLIGENCE DECISION & CONFLUENCE EVALUATOR (PHASE 4.6 UNIFIED)
// ============================================================================

export interface CoreIntelligenceInput {
  symbol: string;
  primaryCandles: Candle[];
  timeframeCandlesMap: Record<string, Candle[] | undefined>;
  derivatives?: DerivativesData | null;
  newsList?: ProcessedNews[] | null;
  baseTimeframe?: string;
  explicitTargetCount?: number;
}

export function evaluateMarketWithCoreIntelligence(
  inputOrSymbol: CoreIntelligenceInput | string,
  argTimeframe?: string,
  argTfMap?: Record<string, Candle[] | undefined>,
  argDerivatives?: DerivativesData | null,
  argNewsList?: ProcessedNews[] | null
): CoreIntelligenceResult {
  let symbol: string;
  let primaryCandles: Candle[];
  let timeframeCandlesMap: Record<string, Candle[] | undefined>;
  let derivatives: DerivativesData | null | undefined;
  let newsList: ProcessedNews[] | null | undefined;
  let baseTimeframe = '1h';
  let explicitTargetCount: number | undefined;

  if (typeof inputOrSymbol === 'string') {
    symbol = inputOrSymbol;
    baseTimeframe = argTimeframe || '1h';
    timeframeCandlesMap = argTfMap || {};
    primaryCandles = timeframeCandlesMap[baseTimeframe] || Object.values(timeframeCandlesMap)[0] || [];
    derivatives = argDerivatives;
    newsList = argNewsList;
  } else {
    symbol = inputOrSymbol.symbol;
    primaryCandles = inputOrSymbol.primaryCandles;
    timeframeCandlesMap = inputOrSymbol.timeframeCandlesMap;
    derivatives = inputOrSymbol.derivatives;
    newsList = inputOrSymbol.newsList;
    baseTimeframe = inputOrSymbol.baseTimeframe || '1h';
    explicitTargetCount = inputOrSymbol.explicitTargetCount;
  }

  const cleanSymbol = (symbol || 'BTCUSDT').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const baseAsset = cleanSymbol.replace('USDT', '');
  const quoteAsset = 'USDT';

  const confirmations: string[] = [];
  const conflicts: string[] = [];
  const unknowns: string[] = [];
  const evidenceBreakdown: EvidenceSourceEvaluation[] = [];

  // --------------------------------------------------------------------------
  // STEP 1: DATA QUALITY GATE
  // --------------------------------------------------------------------------
  const dataQuality = evaluateDataQuality(primaryCandles, timeframeCandlesMap, derivatives, newsList);
  if (!dataQuality.isAcceptable) {
    const fallbackPrice = primaryCandles?.[primaryCandles.length - 1]?.close || 0;
    const fallbackCase: HypothesisCase = {
      direction: 'LONG',
      overallCaseStrength: 0,
      structuralStrength: 0,
      supportingEvidence: [],
      conflictingEvidence: dataQuality.details,
      unknownEvidence: ['Candle data corrupted or missing'],
      strongestConfirmation: 'None',
      strongestContradiction: 'Fatal data quality rejection',
      marketRegimeAlignment: false,
      riskRewardQuality: 0,
      entryQuality: 'POOR',
      dataQuality: dataQuality.rating
    };

    const emptyAudit: AdversarialAudit = {
      targetDirection: 'WAIT',
      primaryFailureRisk: 'Fatal data quality failure',
      opposingStructureRisk: true,
      liquidityRisk: false,
      breakoutFailureRisk: false,
      derivativesConflictRisk: false,
      newsConflictRisk: false,
      chaseRisk: false,
      riskRewardRisk: true,
      adversarialVerdict: 'REJECTED',
      downgradePenalty: 100,
      details: dataQuality.details
    };

    const fallbackExhaustion: MomentumExhaustionReport = { level: 'NO_EXHAUSTION', score: 0, details: ['Data invalid'], isExhausted: false };
    const fallbackExtension: PriceExtensionReport = { level: 'OPTIMAL', distanceFromEma20Pct: 0, distanceFromEma50Pct: 0, atrMultiple: 0, details: 'Data invalid' };
    const fallbackAsymmetry: LiquidityAsymmetry = { upsideLiquidityScore: 50, downsideLiquidityScore: 50, ratio: 1.0, bias: 'NEUTRAL', description: 'Data invalid' };
    const fallbackDecimals = fallbackPrice < 1 ? 4 : 2;

    return {
      symbol: `${baseAsset}/${quoteAsset}`,
      decision: 'WAIT',
      confidence: 0,
      moonScore: 0,
      qualityGrade: 'WAIT',
      marketRegime: { regime: 'UNKNOWN', bias: 'UNKNOWN', volatilityIndex: 50, details: 'Data quality invalid' },
      marketBehavior: 'UNKNOWN',
      dataQuality,
      entryStatus: 'INVALID',
      entryQualityRating: 'INVALID_ENTRY',
      exhaustionReport: fallbackExhaustion,
      priceExtension: fallbackExtension,
      liquidityAsymmetry: fallbackAsymmetry,
      entryPrice: fallbackPrice,
      entryZoneLow: Number((fallbackPrice * 0.9985).toFixed(fallbackDecimals)),
      entryZoneHigh: Number((fallbackPrice * 1.0025).toFixed(fallbackDecimals)),
      stopLoss: fallbackPrice,
      targets: [],
      riskRewardRatio: 0,
      tradeWindow: calculateTradeWindow(Date.now(), baseTimeframe),
      confirmations: [],
      conflicts: dataQuality.details,
      unknowns: ['Candle data corrupted or missing'],
      whyTrade: [],
      whyNotPerfect: dataQuality.details,
      keyRisk: 'Unacceptable data risk',
      invalidationReason: 'Data feed failed integrity check',
      entryReason: 'No entry permissible due to invalid data',
      liquidityReason: 'No liquidity data available',
      breakoutReason: 'No breakout data available',
      regimeReason: 'Market regime cannot be evaluated',
      exhaustionReason: 'Exhaustion cannot be evaluated',
      conflictReason: 'Fatal data quality rejection',
      targetReasons: [],
      longCase: fallbackCase,
      shortCase: { ...fallbackCase, direction: 'SHORT' },
      adversarialAudit: emptyAudit,
      explanation: `WAIT: Market evaluation aborted due to insufficient data quality (${dataQuality.details.join('; ')})`,
      riskExplanation: 'Unacceptable data risk',
      evidenceBreakdown: [],
      signal: null
    };
  }

  // --------------------------------------------------------------------------
  // STEP 2: MARKET REGIME EVALUATION
  // --------------------------------------------------------------------------
  const marketRegime = evaluateMarketRegime(primaryCandles);
  evidenceBreakdown.push({
    category: 'MARKET_REGIME',
    name: 'Broad Market Regime',
    state: marketRegime.regime === 'UNKNOWN' ? 'UNKNOWN' : (marketRegime.bias !== 'NEUTRAL' ? 'SUPPORTIVE' : 'NEUTRAL'),
    bias: marketRegime.bias,
    weight: 15,
    score: marketRegime.bias === 'BULLISH' ? 15 : (marketRegime.bias === 'BEARISH' ? -15 : 0),
    details: marketRegime.details
  });

  // --------------------------------------------------------------------------
  // STEP 3: UNIFIED MULTI-TIMEFRAME & STRUCTURE FUSION (PHASE 3, 4.5 & 4.6)
  // --------------------------------------------------------------------------
  const unifiedEvidence = fuseMarketEvidence(symbol, timeframeCandlesMap, derivatives, newsList);
  const closes = primaryCandles.map(c => c.close);
  const volumes = primaryCandles.map(c => c.volume);
  const len = primaryCandles.length;
  const latest = primaryCandles[len - 1];
  const currentPrice = latest.close;

  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema20 = ema20Arr[len - 1] || currentPrice;
  const ema50 = ema50Arr[len - 1] || currentPrice;
  const rsiArr = calculateRSI(closes, 14);
  const rsi = Number((rsiArr[len - 1] || 50).toFixed(1));
  const macdObj = calculateMACD(closes);
  const macdHist = macdObj.histogram[len - 1] || 0;
  const atrArr = calculateATR(primaryCandles, 14);
  const atr = atrArr[len - 1] || currentPrice * 0.02;
  const atrPercent = (atr / currentPrice) * 100;
  const rvol = calculateRVOL(volumes, 20);

  const priceDecimals = currentPrice < 0.001 ? 7 : (currentPrice < 1 ? 4 : 2);

  // Liquidity Analysis Layer (Phase 4.6 Advanced Liquidity Map)
  const liquidity = analyzeLiquidityStructure(primaryCandles, priceDecimals);

  // Patterns & Trendlines (Phase 2 & 3)
  const pattern = detectPatterns(primaryCandles, baseTimeframe);
  const trendline = detectTrendlines(primaryCandles, baseTimeframe);

  // Breakout Quality Layer (Phase 4.6 Fake Breakout & Progression Quality)
  const keyLevel = pattern.detected 
    ? (pattern.keyLevels.breakoutLevel || pattern.keyLevels.neckline || 0) 
    : (trendline?.detected ? trendline.currentLinePrice : 0);
  const breakoutEval = evaluateBreakoutQuality(
    primaryCandles,
    keyLevel,
    pattern.type === 'BEARISH' || trendline?.type === 'SUPPORT' ? 'SUPPORT' : 'RESISTANCE',
    rvol,
    priceDecimals
  );


  // Phase 4.6 Momentum Exhaustion & Price Extension
  const exhaustion = detectMomentumExhaustion(primaryCandles, rsi, ema20, ema50, atr);
  const extension = evaluatePriceExtension(currentPrice, ema20, ema50, atr);

  // Phase 4.6 Market Behavior
  const marketBehavior = classifyMarketBehavior(marketRegime, breakoutEval, liquidity, rsi, rvol, atrPercent);

  // Phase 21: SMC Market Structure Analysis (Order Blocks, FVGs, Liquidity Pools, BOS/CHoCH)
  const smcStructure = analyzeSMCStructure(primaryCandles, baseTimeframe, timeframeCandlesMap as any);

  // --------------------------------------------------------------------------
  // STEP 4: BULL CASE VS BEAR CASE COMPILATION
  // --------------------------------------------------------------------------
  const caseContext: CaseAnalysisContext = {
    symbol,
    currentPrice,
    primaryCandles,
    timeframeCandlesMap,
    unifiedEvidence,
    pattern,
    trendline,
    liquidity,
    breakoutEval,
    marketRegime,
    dataQuality,
    rvol,
    rsi,
    macdHist,
    ema20,
    ema50,
    exhaustion,
    extension,
    smcStructure
  };

  const { longCase, shortCase } = constructHypothesisCases(caseContext);

  // Evidence Breakdown mapping for UI & confluences
  const tf4h = unifiedEvidence.timeframes['4h'];
  if (tf4h) {
    if (tf4h.bias === 'BULLISH') {
      confirmations.push('4H Macro Trend Bullish');
      evidenceBreakdown.push({ category: 'MACRO_4H', name: '4H Macro Trend', state: 'SUPPORTIVE', bias: 'BULLISH', weight: 15, score: 15, details: '4H structure aligned with uptrend' });
    } else if (tf4h.bias === 'BEARISH') {
      confirmations.push('4H Macro Trend Bearish');
      evidenceBreakdown.push({ category: 'MACRO_4H', name: '4H Macro Trend', state: 'SUPPORTIVE', bias: 'BEARISH', weight: 15, score: -15, details: '4H structure aligned with downtrend' });
    }
  } else {
    unknowns.push('4H Macro Trend layer unavailable (UNKNOWN)');
  }

  const tf1h = unifiedEvidence.timeframes['1h'];
  if (tf1h) {
    if (tf1h.bias === 'BULLISH') {
      confirmations.push(`1H Market Structure (${tf1h.marketStructure.structure})`);
      evidenceBreakdown.push({ category: 'STRUCTURE_1H', name: '1H Market Structure', state: 'CONFIRMED', bias: 'BULLISH', weight: 15, score: 15, details: tf1h.marketStructure.details });
    } else if (tf1h.bias === 'BEARISH') {
      confirmations.push(`1H Market Structure (${tf1h.marketStructure.structure})`);
      evidenceBreakdown.push({ category: 'STRUCTURE_1H', name: '1H Market Structure', state: 'CONFIRMED', bias: 'BEARISH', weight: 15, score: -15, details: tf1h.marketStructure.details });
    }
  }

  if (pattern.detected && pattern.breakoutStatus !== 'FAILED') {
    const isConfirmed = pattern.breakoutStatus === 'CONFIRMED';
    const patScore = isConfirmed ? 15 : 10;
    if (pattern.type === 'BULLISH') {
      confirmations.push(`Pattern: ${pattern.name} (${pattern.breakoutStatus})`);
      evidenceBreakdown.push({ category: 'PATTERN', name: pattern.name, state: isConfirmed ? 'CONFIRMED' : 'SUPPORTIVE', bias: 'BULLISH', weight: 15, score: patScore, details: pattern.description });
    } else if (pattern.type === 'BEARISH') {
      confirmations.push(`Pattern: ${pattern.name} (${pattern.breakoutStatus})`);
      evidenceBreakdown.push({ category: 'PATTERN', name: pattern.name, state: isConfirmed ? 'CONFIRMED' : 'SUPPORTIVE', bias: 'BEARISH', weight: 15, score: -patScore, details: pattern.description });
    }
  } else {
    evidenceBreakdown.push({ category: 'PATTERN', name: 'Geometric Chart Pattern', state: 'NEUTRAL', bias: 'NEUTRAL', weight: 15, score: 0, details: 'No active completed chart pattern detected' });
  }

  if (trendline && trendline.detected && trendline.breakoutStatus !== 'FAILED') {
    const is3Touch = trendline.touchCount >= 3;
    const tlScore = is3Touch ? 10 : 6;
    if (trendline.direction === 'BULLISH' || (trendline.type === 'RESISTANCE' && trendline.breakoutStatus === 'CONFIRMED')) {
      confirmations.push(`Trendline: ${trendline.touchCount}-Touch ${trendline.type} (${trendline.breakoutStatus})`);
      evidenceBreakdown.push({ category: 'TRENDLINE', name: `${trendline.touchCount}-Touch Trendline`, state: 'CONFIRMED', bias: 'BULLISH', weight: 10, score: tlScore, details: trendline.description });
    } else if (trendline.direction === 'BEARISH' || (trendline.type === 'SUPPORT' && trendline.breakoutStatus === 'CONFIRMED')) {
      confirmations.push(`Trendline: ${trendline.touchCount}-Touch ${trendline.type} (${trendline.breakoutStatus})`);
      evidenceBreakdown.push({ category: 'TRENDLINE', name: `${trendline.touchCount}-Touch Trendline`, state: 'CONFIRMED', bias: 'BEARISH', weight: 10, score: -tlScore, details: trendline.description });
    }
  }

  if (rvol >= 1.25) {
    confirmations.push(`Volume Expansion (${rvol}x RVOL)`);
    evidenceBreakdown.push({ category: 'VOLUME_FLOW', name: 'Relative Volume Surge', state: 'CONFIRMED', bias: 'NEUTRAL', weight: 8, score: 8, details: `High volume impulse (${rvol}x) confirming directional volatility` });
  }

  if (!unifiedEvidence.derivatives.isMissing) {
    if (unifiedEvidence.derivatives.bias === 'BULLISH') {
      confirmations.push('Derivatives: Negative/Balanced Funding favors Long');
      evidenceBreakdown.push({ category: 'DERIVATIVES', name: 'Funding & Open Interest', state: 'SUPPORTIVE', bias: 'BULLISH', weight: 6, score: 6, details: 'Derivatives positioning favors bullish continuation' });
    } else if (unifiedEvidence.derivatives.bias === 'BEARISH') {
      confirmations.push('Derivatives: High Funding Rate indicates Long Overheating');
      evidenceBreakdown.push({ category: 'DERIVATIVES', name: 'Funding & Open Interest', state: 'SUPPORTIVE', bias: 'BEARISH', weight: 6, score: -6, details: 'Derivatives positioning indicates crowded long distribution' });
    }
  } else {
    unknowns.push('Derivatives telemetry unavailable (marked UNKNOWN)');
    evidenceBreakdown.push({ category: 'DERIVATIVES', name: 'Funding & Open Interest', state: 'UNKNOWN', bias: 'UNKNOWN', weight: 6, score: 0, details: 'Missing derivatives data - no bias fabricated' });
  }

  if (!unifiedEvidence.news.isMissing && unifiedEvidence.news.bias !== 'UNKNOWN') {
    if (unifiedEvidence.news.bias === 'BULLISH') {
      confirmations.push(`News Catalyst: ${unifiedEvidence.news.latestHeadlines[0] || 'Bullish Announcement'}`);
      evidenceBreakdown.push({ category: 'NEWS_EVENT', name: 'Public News Catalyst', state: 'SUPPORTIVE', bias: 'BULLISH', weight: 5, score: 5, details: `Sentiment: BULLISH (Impact: ${unifiedEvidence.news.impactScore}/100)` });
    } else if (unifiedEvidence.news.bias === 'BEARISH') {
      confirmations.push(`News Catalyst: ${unifiedEvidence.news.latestHeadlines[0] || 'Bearish Announcement'}`);
      evidenceBreakdown.push({ category: 'NEWS_EVENT', name: 'Public News Catalyst', state: 'SUPPORTIVE', bias: 'BEARISH', weight: 5, score: -5, details: `Sentiment: BEARISH (Impact: ${unifiedEvidence.news.impactScore}/100)` });
    }
  } else {
    unknowns.push('Public news catalyst unavailable (marked UNKNOWN)');
    evidenceBreakdown.push({ category: 'NEWS_EVENT', name: 'Public News Catalyst', state: 'UNKNOWN', bias: 'UNKNOWN', weight: 5, score: 0, details: 'No active verified news catalyst - no bias fabricated' });
  }

  // --------------------------------------------------------------------------
  // STEP 5: COMPARATIVE HYPOTHESIS & TENTATIVE DIRECTION
  // --------------------------------------------------------------------------
  let conflictDetected = false;
  if (longCase.overallCaseStrength >= 40 && shortCase.overallCaseStrength >= 40) {
    conflictDetected = true;
    conflicts.push('Severe multi-timeframe directional conflict between bullish and bearish evidence layers');
  }

  let tentativeDirection: 'LONG' | 'SHORT' | null = null;
  const longStructuralConfirmations = (tf4h?.bias === 'BULLISH' ? 1 : 0) +
                                      (tf1h?.bias === 'BULLISH' ? 1 : 0) +
                                      (pattern.detected && pattern.type === 'BULLISH' && (pattern.breakoutStatus === 'CONFIRMED' || pattern.breakoutStatus === 'BROKEN_OUT') ? 1 : 0) +
                                      (trendline?.detected && trendline.touchCount >= 3 && trendline.breakoutStatus === 'CONFIRMED' && (trendline.direction === 'BULLISH' || trendline.type === 'RESISTANCE') ? 1 : 0) +
                                      (marketRegime.bias === 'BULLISH' ? 1 : 0);

  const shortStructuralConfirmations = (tf4h?.bias === 'BEARISH' ? 1 : 0) +
                                       (tf1h?.bias === 'BEARISH' ? 1 : 0) +
                                       (pattern.detected && pattern.type === 'BEARISH' && (pattern.breakoutStatus === 'CONFIRMED' || pattern.breakoutStatus === 'BROKEN_OUT') ? 1 : 0) +
                                       (trendline?.detected && trendline.touchCount >= 3 && trendline.breakoutStatus === 'CONFIRMED' && (trendline.direction === 'BEARISH' || trendline.type === 'SUPPORT') ? 1 : 0) +
                                       (marketRegime.bias === 'BEARISH' ? 1 : 0);

  // Adaptive Thresholds based on Market Regime (Phase 4.6)
  let requiredDiff = 15;
  let minCaseStrength = 50;
  if (marketRegime.regime === 'HIGH_VOLATILITY') {
    requiredDiff = 20;
    minCaseStrength = 60;
  } else if (marketRegime.regime === 'NEUTRAL') {
    requiredDiff = 18;
    minCaseStrength = 55;
  }

  if (longCase.structuralStrength >= 30 && longCase.overallCaseStrength >= minCaseStrength && longCase.overallCaseStrength > shortCase.overallCaseStrength + requiredDiff && longStructuralConfirmations >= 2 && !conflictDetected) {
    tentativeDirection = 'LONG';
  } else if (shortCase.structuralStrength >= 30 && shortCase.overallCaseStrength >= minCaseStrength && shortCase.overallCaseStrength > longCase.overallCaseStrength + requiredDiff && shortStructuralConfirmations >= 2 && !conflictDetected) {
    tentativeDirection = 'SHORT';
  }

  // --------------------------------------------------------------------------
  // STEP 6: ADVERSARIAL SELF-CHECK PASS
  // --------------------------------------------------------------------------
  const adversarialAudit = performAdversarialAudit(
    tentativeDirection,
    longCase,
    shortCase,
    liquidity,
    breakoutEval,
    marketRegime,
    dataQuality,
    rvol,
    currentPrice,
    atr
  );

  // --------------------------------------------------------------------------
  // STEP 7: DYNAMIC RISK / REWARD & TARGET GENERATION
  // --------------------------------------------------------------------------
  const entryPrice = Number(currentPrice.toFixed(priceDecimals));
  const breakoutLevel = entryPrice;
  let entryZoneLow = Number((breakoutLevel * 0.9985).toFixed(priceDecimals));
  let entryZoneHigh = Number((breakoutLevel * 1.0025).toFixed(priceDecimals));
  if (entryZoneLow >= entryZoneHigh) {
    const tick = Math.pow(10, -priceDecimals);
    entryZoneLow = Number((breakoutLevel - tick).toFixed(priceDecimals));
    entryZoneHigh = Number((breakoutLevel + tick).toFixed(priceDecimals));
    if (entryZoneLow >= entryZoneHigh) {
      entryZoneLow = Number((breakoutLevel * 0.998).toFixed(priceDecimals + 1));
      entryZoneHigh = Number((breakoutLevel * 1.003).toFixed(priceDecimals + 1));
    }
  }

  const stopLoss = tentativeDirection
    ? calculateDynamicStopLoss(
        tentativeDirection,
        entryPrice,
        primaryCandles,
        atr,
        pattern.detected ? pattern.invalidationPrice : undefined,
        trendline?.detected ? trendline.currentLinePrice : undefined,
        priceDecimals,
        tentativeDirection === 'LONG' ? liquidity.keySupportLevels[0] : liquidity.keyResistanceLevels[0],
        liquidity.liquiditySweep?.detected ? liquidity.liquiditySweep.sweepLevel : undefined
      )
    : entryPrice;

  const targetPkg = tentativeDirection
    ? generateMarketJustifiedTargets(
        entryPrice,
        stopLoss,
        tentativeDirection,
        atr,
        marketRegime.regime,
        pattern.detected ? ((pattern as any).measuredMoveTarget || (pattern as any).keyLevels?.measuredMove) : undefined,
        tentativeDirection === 'LONG' ? liquidity.keyResistanceLevels : liquidity.keySupportLevels,
        priceDecimals,
        explicitTargetCount,
        tentativeDirection === 'LONG' ? liquidity.keyResistanceLevels.slice(3) : liquidity.keySupportLevels.slice(3),
        breakoutEval?.isConfirmed ? breakoutEval.levelPrice : undefined,
        primaryCandles,
        trendline?.detected && trendline.currentLinePrice ? trendline.currentLinePrice : undefined,
        liquidity.liquidityZones?.map(z => ({ price: z.price, type: z.type, description: z.description })),
        smcStructure?.fvgs?.map(f => ({
          price: (f.top + f.bottom) / 2,
          top: f.top,
          bottom: f.bottom,
          type: f.type,
          description: `${f.type} FVG Imbalance`
        })),
        smcStructure?.orderBlocks?.map(ob => ({
          price: ob.midpoint,
          type: ob.type,
          description: `${ob.type} Order Block`
        }))
      )
    : { targets: [], riskRewardRatio: 0, tp1: entryPrice, tp2: entryPrice, tp3: entryPrice, totalTargetCount: 0 };

  if (tentativeDirection && (stopLoss <= 0 || (tentativeDirection === 'LONG' ? stopLoss >= entryPrice : stopLoss <= entryPrice))) {
    conflicts.push('Structural Stop Loss cannot be established from market structure (no confirmed swing pivots, S/R, liquidity, or pattern invalidation levels). Setup is NOT ACTIONABLE (WAIT)');
    tentativeDirection = null;
  }

  if (tentativeDirection && targetPkg.targets.length === 0) {
    conflicts.push('No valid structural targets established by market structure (support/resistance/liquidity/orderblock/FVG). Setup is NOT ACTIONABLE (WAIT)');
    tentativeDirection = null;
  }

  const isRRViable = targetPkg.riskRewardRatio >= 1.5;
  if (tentativeDirection && !isRRViable) {
    conflicts.push(`Unfavorable Risk:Reward ratio (${targetPkg.riskRewardRatio}:1 is below minimum 1.5:1 threshold)`);
  }

  // Ensure Entry Zone never overlaps or inverts past TP1
  if (tentativeDirection === 'LONG' && targetPkg.tp1 > entryPrice && entryZoneHigh >= targetPkg.tp1) {
    entryZoneHigh = Number((entryPrice + (targetPkg.tp1 - entryPrice) * 0.4).toFixed(priceDecimals));
    if (entryZoneHigh >= targetPkg.tp1) entryZoneHigh = Number((targetPkg.tp1 * 0.999).toFixed(priceDecimals));
  } else if (tentativeDirection === 'SHORT' && targetPkg.tp1 < entryPrice && entryZoneLow <= targetPkg.tp1) {
    entryZoneLow = Number((entryPrice - (entryPrice - targetPkg.tp1) * 0.4).toFixed(priceDecimals));
    if (entryZoneLow <= targetPkg.tp1) entryZoneLow = Number((targetPkg.tp1 * 1.001).toFixed(priceDecimals));
  }

  // --------------------------------------------------------------------------
  // STEP 7.5: MARKET CYCLE, PUMP/DUMP, FLOW/WHALE & KILL SWITCH PRE-EVALUATION
  // --------------------------------------------------------------------------
  const marketCycle = analyzeMarketCycle(primaryCandles, baseTimeframe, {
    multiTimeframeCandles: timeframeCandlesMap as any,
    liquidityZones: liquidity.liquidityZones,
    marketRegime: marketRegime.regime,
    derivatives
  });
  const pumpDump = evaluatePumpDumpIntelligence(primaryCandles, newsList || [], symbol);
  const flowWhale = evaluateFlowWhaleIntelligence(symbol, derivatives);

  if ((marketCycle.cycle === 'MARKUP' || marketCycle.cycle === 'RE_ACCUMULATION') && tentativeDirection === 'LONG') {
    confirmations.push(`Stage 2 ${marketCycle.cycle.replace(/_/g, ' ')} cycle confirmed (${marketCycle.stage})`);
  } else if ((marketCycle.cycle === 'MARKDOWN' || marketCycle.cycle === 'RE_DISTRIBUTION') && tentativeDirection === 'SHORT') {
    confirmations.push(`Stage 4 ${marketCycle.cycle.replace(/_/g, ' ')} cycle confirmed (${marketCycle.stage})`);
  } else if ((marketCycle.cycle === 'DISTRIBUTION' || marketCycle.cycle === 'MARKDOWN' || marketCycle.cycle === 'RE_DISTRIBUTION') && tentativeDirection === 'LONG') {
    conflicts.push(`Market cycle is in ${marketCycle.cycle} (${marketCycle.stage}) opposing long setup`);
  } else if ((marketCycle.cycle === 'ACCUMULATION' || marketCycle.cycle === 'MARKUP' || marketCycle.cycle === 'RE_ACCUMULATION') && tentativeDirection === 'SHORT') {
    conflicts.push(`Market cycle is in ${marketCycle.cycle} (${marketCycle.stage}) opposing short setup`);
  }

  // Phase 10: Wyckoff & VSA Confluence Context
  if (marketCycle.wyckoffEvents?.accumulation?.SPRING?.detected && tentativeDirection === 'LONG') {
    confirmations.push('Wyckoff Spring: Terminal liquidity shakeout confirmed at range support');
  } else if (marketCycle.wyckoffEvents?.distribution?.UTAD?.detected && tentativeDirection === 'SHORT') {
    confirmations.push('Wyckoff UTAD: Upthrust after distribution confirmed at range ceiling');
  }

  if (marketCycle.effortVsResult?.classification === 'ABSORPTION' && tentativeDirection === 'LONG') {
    confirmations.push('VSA: Supply absorption confirmed on high effort / narrow spread');
  } else if (marketCycle.effortVsResult?.classification === 'NO_SUPPLY_PULLBACK' && tentativeDirection === 'LONG') {
    confirmations.push('VSA: No supply on pullback confirming continuation probability');
  } else if (marketCycle.effortVsResult?.classification === 'CLIMAX_EXHAUSTION' && tentativeDirection === 'LONG') {
    conflicts.push('VSA: Climactic volume exhaustion detected at highs');
  }

  if (pumpDump.dumpRisk === 'CRITICAL' && tentativeDirection === 'LONG') {
    conflicts.push('Critical dump risk / climactic exhaustion detected; long entry prohibited');
    conflictDetected = true;
  }
  if (pumpDump.fakePumpRisk === 'HIGH' && tentativeDirection === 'LONG') {
    conflicts.push('High fake-pump trap risk (price displacement lacking authentic institutional volume)');
  }

  if (flowWhale.status === 'AVAILABLE' && flowWhale.largeVolumeFlow === 'ACCUMULATION' && tentativeDirection === 'LONG') {
    confirmations.push('Institutional taker flow shows active accumulation');
  } else if (flowWhale.status === 'AVAILABLE' && flowWhale.largeVolumeFlow === 'DISTRIBUTION' && tentativeDirection === 'SHORT') {
    confirmations.push('Institutional taker flow shows active distribution');
  } else if (flowWhale.status === 'UNKNOWN') {
    unknowns.push('Exchange whale/flow telemetry UNAVAILABLE (preserving strict UNKNOWN state)');
  }

  // Pre-evaluate Kill Switch safety gates
  const killSwitch = evaluateKillSwitch({
    candles: primaryCandles,
    dataQualityRating: dataQuality.rating,
    adversarialAudit: {
      ...adversarialAudit,
      verdict: adversarialAudit.adversarialVerdict,
      auditScore: 100 - (adversarialAudit.downgradePenalty || 0),
      fatalFlaw: adversarialAudit.primaryFailureRisk
    },
    conflicts,
    marketRegime: marketRegime.regime
  });

  if (killSwitch.triggered) {
    conflictDetected = true;
  }

  // Final Decision Score Calculation with Data Quality & Adversarial Penalty
  let baseScore = tentativeDirection === 'LONG'
    ? Math.min(98, Math.max(45, Math.round(50 + (longCase.overallCaseStrength - shortCase.overallCaseStrength) * 0.6)))
    : (tentativeDirection === 'SHORT'
      ? Math.min(98, Math.max(45, Math.round(50 + (shortCase.overallCaseStrength - longCase.overallCaseStrength) * 0.6)))
      : 50);

  // Apply penalties
  if (dataQuality.rating === 'MEDIUM') baseScore -= 5;
  if (dataQuality.rating === 'LOW') baseScore -= 20;
  baseScore -= adversarialAudit.downgradePenalty;

  const moonScore = Math.max(30, Math.min(98, conflictDetected ? baseScore - 25 : baseScore));

  // Final Decision Synthesis
  let decision: CoreDecision = 'WAIT';
  if (
    tentativeDirection &&
    moonScore >= 62 &&
    isRRViable &&
    !conflictDetected &&
    !killSwitch.triggered &&
    adversarialAudit.adversarialVerdict !== 'REJECTED' &&
    dataQuality.isAcceptable
  ) {
    decision = tentativeDirection;
  }

  // --------------------------------------------------------------------------
  // STEP 8: SIGNAL QUALITY GRADE & STRUCTURED EXPLANATIONS
  // --------------------------------------------------------------------------
  const primaryConfirmationsCount = decision === 'LONG' ? longStructuralConfirmations : (decision === 'SHORT' ? shortStructuralConfirmations : 0);
  let qualityGrade = calculateSignalQualityGrade(
    decision,
    moonScore,
    primaryConfirmationsCount,
    dataQuality.rating,
    targetPkg.riskRewardRatio,
    adversarialAudit.adversarialVerdict,
    conflictDetected || killSwitch.triggered
  );

  // Phase 6 Institutional-Grade Market Intelligence Evaluation
  const institutionalIntelligence = evaluateInstitutionalIntelligence({
    symbol,
    timeframe: baseTimeframe,
    candles: primaryCandles,
    btcCandles: timeframeCandlesMap['btc_1h'] || timeframeCandlesMap['4h'],
    multiTimeframeCandles: timeframeCandlesMap as any,
    derivatives,
    macroData: undefined
  });

  if (tentativeDirection === 'LONG') {
    for (const conf of institutionalIntelligence.keyConfirmations) {
      if (!confirmations.includes(conf)) confirmations.push(conf);
    }
    for (const contr of institutionalIntelligence.keyContradictions) {
      if (!conflicts.includes(contr)) conflicts.push(contr);
    }
  } else if (tentativeDirection === 'SHORT') {
    for (const conf of institutionalIntelligence.keyContradictions) {
      if (!confirmations.includes(conf)) confirmations.push(conf);
    }
    for (const contr of institutionalIntelligence.keyConfirmations) {
      if (!conflicts.includes(contr)) conflicts.push(contr);
    }
  }

  // Phase 6: A+ Confluence Gate Refinement
  const aplusConfluence = evaluateAplusConfluence({
    decision,
    confidence: moonScore,
    entryStatus: tentativeDirection ? 'ENTRY_NOW' : 'WAIT_FOR_ENTRY',
    riskRewardRatio: targetPkg.riskRewardRatio,
    confirmations,
    conflicts,
    unknowns,
    adversarialAudit,
    dataQualityRating: dataQuality.rating,
    collisionDetected: conflictDetected || killSwitch.triggered,
    marketRegime: marketRegime.regime
  });

  if (qualityGrade === 'A+' && !aplusConfluence.isAPlus) {
    qualityGrade = aplusConfluence.recommendedGrade;
  }

  // Phase 4.7 Adaptive Execution Intelligence
  const adaptiveExecution = evaluateAdaptiveExecution({
    currentPrice,
    entryPrice,
    entryZoneLow,
    entryZoneHigh,
    stopLoss,
    direction: decision,
    candles: primaryCandles,
    atr,
    rvol,
    rsi,
    macdHist,
    ema20,
    ema50,
    breakoutEval,
    liquidity,
    exhaustion,
    extension,
    marketRegime,
    marketBehavior,
    unifiedEvidence,
    qualityGrade,
    tp1Price: targetPkg.tp1,
    priceDecimals
  });

  // Phase 4.8 Trade Management Intelligence
  const tradeManagement = decision !== 'WAIT'
    ? evaluateTradeManagement({
        entryPrice,
        stopLoss,
        currentPrice,
        direction: decision,
        targets: targetPkg.targets,
        atr,
        marketRegime: marketRegime.regime,
        exhaustion,
        breakoutEval,
        liquidity,
        candles: primaryCandles,
        rsi,
        rvol,
        priceDecimals
      })
    : undefined;

  const entryStatus = decision !== 'WAIT'
    ? adaptiveExecution.readiness
    : 'WAIT_FOR_ENTRY';

  const entryQualityRating = decision !== 'WAIT'
    ? evaluateAnalyticalEntryQuality(
        currentPrice,
        entryPrice,
        entryZoneLow,
        entryZoneHigh,
        stopLoss,
        decision,
        extension,
        exhaustion,
        breakoutEval,
        rvol
      )
    : 'ACCEPTABLE_ENTRY';

  const tradeWindow = calculateTradeWindow(latest.timestamp, baseTimeframe, !unifiedEvidence.news.isMissing);

  // Phase 4.6 & 4.7 Structured Reasons
  const whyTrade = decision === 'LONG' ? longCase.supportingEvidence : (decision === 'SHORT' ? shortCase.supportingEvidence : []);
  const whyNotPerfect = decision === 'LONG' ? [...longCase.conflictingEvidence, ...adversarialAudit.details] : (decision === 'SHORT' ? [...shortCase.conflictingEvidence, ...adversarialAudit.details] : conflicts);
  const keyRisk = adversarialAudit.primaryFailureRisk;
  const invalidationReason = decision === 'LONG'
    ? `Loss of swing low / structural support at ${formatPrice(stopLoss)} invalidates the bullish setup thesis.`
    : (decision === 'SHORT'
      ? `Breach of swing high / structural resistance at ${formatPrice(stopLoss)} invalidates the bearish setup thesis.`
      : 'No active trade thesis to invalidate.');

  const entryReason = adaptiveExecution.executionReason || (entryStatus === 'ENTRY_NOW'
    ? `Price currently within optimal execution zone (${formatPrice(entryZoneLow)} - ${formatPrice(entryZoneHigh)}) with active volume confirmation.`
    : (entryStatus === 'ENTRY_MISSED'
      ? `Price has advanced significantly towards TP1 (${formatPrice(targetPkg.tp1)}). Awaiting secondary pullback.`
      : `Consolidating near entry. Awaiting formal level trigger.`));

  const liquidityReason = liquidity.liquiditySweep.detected
    ? liquidity.liquiditySweep.description
    : (liquidity.equalHighs || liquidity.equalLows
      ? `Mapped key liquidity pools: ${liquidity.details.join('; ')}`
      : `Clean liquidity structure with ${liquidity.asymmetry.description}`);

  const breakoutReason = breakoutEval.details;
  const regimeReason = `${marketRegime.details} (Behavior: ${marketBehavior.replace(/_/g, ' ')})`;
  const exhaustionReason = exhaustion.details.join('; ');
  const conflictReason = conflicts.length > 0 ? conflicts.join('; ') : 'No material directional conflicts detected';

  const targetReasons = targetPkg.targets.map(t => ({
    targetId: t.id,
    reason: `${t.label} anchored at ${formatPrice(t.price)} (${t.evidenceLevel || 'Structural S/R Pivot'}, ${t.rMultiple || 1.5}R)`
  }));

  const explanation = decision !== 'WAIT'
    ? `DECISION: ${decision} [Grade ${qualityGrade}] (${moonScore}/100 confidence)\n` +
      `Confirmations: ${confirmations.join('; ')}\n` +
      `Entry Zone: ${formatPrice(entryZoneLow)} - ${formatPrice(entryZoneHigh)} | SL: ${formatPrice(stopLoss)} | TP1: ${formatPrice(targetPkg.tp1)} (${targetPkg.riskRewardRatio}:1 R:R)`
    : `DECISION: WAIT [Grade WAIT] (${moonScore}/100 confidence)\n` +
      `Reasons: ${conflicts.length > 0 ? conflicts.join('; ') : 'Awaiting multi-factor structural confluence & adversarial clearance'}`;

  const riskExplanation = `Risk: ${formatPrice(Math.abs(entryPrice - stopLoss))} (${formatPercent(Math.abs(entryPrice - stopLoss) / entryPrice * 100)}) | Potential Reward: ${formatPrice(Math.abs(targetPkg.tp2 - entryPrice))} (${targetPkg.riskRewardRatio}:1 R:R)`;

  // Construct backward-compatible Signal object if actionable
  let finalSignal: Signal | null = null;
  if (decision !== 'WAIT') {
    const deterministicId = generateDeterministicSignalId(
      symbol,
      baseTimeframe,
      decision,
      pattern.name || 'CORE_SETUP',
      latest.timestamp
    );

    const confluences: ConfluenceItem[] = evidenceBreakdown.map(ev => ({
      id: ev.category.toLowerCase(),
      category: ev.category === 'PATTERN' ? 'PATTERN' : (ev.category === 'VOLUME_FLOW' ? 'VOLUME' : (ev.category === 'DERIVATIVES' ? 'DERIVATIVES' : (ev.category === 'NEWS_EVENT' ? 'NEWS' : 'TREND'))),
      name: ev.name,
      status: ev.bias === 'BULLISH' ? 'BULLISH' : (ev.bias === 'BEARISH' ? 'BEARISH' : 'NEUTRAL'),
      score: Math.abs(ev.score),
      weight: ev.weight,
      description: ev.details
    }));

    const actionablePriority: ActionablePriority = calculateActionablePriority(
      decision,
      qualityGrade,
      entryStatus,
      'ACTIVE'
    );

    finalSignal = {
      id: deterministicId,
      symbol: `${baseAsset}/${quoteAsset}`,
      baseAsset,
      quoteAsset,
      direction: decision,
      timeframe: (baseTimeframe as any) || '1h',
      status: 'ACTIVE',
      moonScore,
      confidence: moonScore,
      qualityGrade,
      actionablePriority,
      
      entryPrice,
      entryZoneLow,
      entryZoneHigh,
      stopLoss,
      
      targets: targetPkg.targets,
      tp1: targetPkg.tp1,
      tp2: targetPkg.tp2,
      tp3: targetPkg.tp3,
      
      riskRewardRatio: targetPkg.riskRewardRatio,
      currentPrice: entryPrice,
      priceChange24h: 0,
      volume24h: latest.volume,
      
      pattern: pattern.name ? pattern.name.replace(/_/g, ' ') : undefined,
      trendlineAngle: trendline ? Number(trendline.slope.toFixed(4)) : undefined,
      trendlineDescription: trendline ? `${trendline.touchCount}-touch ${trendline.type} (${trendline.breakoutStatus})` : undefined,
      marketStructure: tf1h ? (tf1h.marketStructure.structure as any) : 'SIDEWAYS',
      rsi,
      macdSignal: macdHist >= 0 ? 'BULLISH' : 'BEARISH',
      confluences,
      
      openInterestChange24h: derivatives?.openInterestChange24h,
      fundingRate: derivatives?.fundingRate,
      
      timestamp: latest.timestamp,
      createdAt: latest.timestamp,
      expiresAt: tradeWindow.expiresAt,
      
      newsCatalyst: unifiedEvidence.news.latestHeadlines[0] || undefined,
      notes: explanation,
      
      marketRegime: marketRegime.regime,
      dataQuality: dataQuality.rating,
      entryStatus,
      tradeWindow,
      confirmations,
      conflicts,
      unknowns,
      whyTrade,
      whyNotPerfect,
      keyRisk,
      entryReason,
      invalidationReason,
      explanation,
      adaptiveExecution,
      executionStatus: entryStatus,
      executionReason: adaptiveExecution.executionReason,
      pullbackZone: adaptiveExecution.pullbackZone,
      retestLevel: adaptiveExecution.retestLevel,
      chaseRisk: adaptiveExecution.chaseRisk,
      tradeManagement,
      coreIntelligence: {
        marketRegime: marketRegime.regime,
        marketBehavior,
        dataQuality: dataQuality.rating,
        decision,
        entryStatus,
        qualityGrade,
        actionablePriority,
        entryQualityRating,
        exhaustionLevel: exhaustion.level,
        priceExtensionLevel: extension.level,
        liquidityAsymmetry: liquidity.asymmetry,
        adaptiveExecution,
        executionStatus: entryStatus,
        executionReason: adaptiveExecution.executionReason,
        pullbackZone: adaptiveExecution.pullbackZone,
        retestLevel: adaptiveExecution.retestLevel,
        chaseRisk: adaptiveExecution.chaseRisk,
        safestExecutionZone: adaptiveExecution.safestExecutionZone,
        tradeManagement,
        confirmations,
        conflicts,
        unknowns,
        whyTrade,
        whyNotPerfect,
        keyRisk,
        entryReason,
        invalidationReason,
        liquidityReason,
        breakoutReason,
        regimeReason,
        exhaustionReason,
        conflictReason,
        targetReasons,
        longCase,
        shortCase,
        adversarialAudit,
        explanation,
        riskExplanation,
        tradeWindow,
        liquidityZones: liquidity.liquidityZones,
        marketCycle,
        pumpDumpIntelligence: pumpDump,
        flowWhaleIntelligence: flowWhale,
        killSwitch,
        aplusConfluence,
        smcStructureReport: institutionalIntelligence.smc,
        orderflowReport: institutionalIntelligence.orderflow,
        fibonacciReport: institutionalIntelligence.fibonacci,
        divergenceMatrixReport: institutionalIntelligence.divergenceMatrix,
        relativeStrengthReport: institutionalIntelligence.relativeStrength,
        derivativesIntelligenceReport: institutionalIntelligence.derivatives,
        institutionalIntelligence
      },
      marketCycle,
      pumpDumpIntelligence: pumpDump,
      flowWhaleIntelligence: flowWhale,
      killSwitch,
      aplusConfluence,
      smcStructureReport: institutionalIntelligence.smc,
      orderflowReport: institutionalIntelligence.orderflow,
      fibonacciReport: institutionalIntelligence.fibonacci,
      divergenceMatrixReport: institutionalIntelligence.divergenceMatrix,
      relativeStrengthReport: institutionalIntelligence.relativeStrength,
      derivativesIntelligenceReport: institutionalIntelligence.derivatives,
      institutionalIntelligence,
      unifiedEvidence
    };
  }

  return {
    symbol: `${baseAsset}/${quoteAsset}`,
    decision,
    confidence: moonScore,
    moonScore,
    qualityGrade,
    actionablePriority: calculateActionablePriority(decision, qualityGrade, entryStatus, 'ACTIVE'),
    marketRegime,
    marketBehavior,
    dataQuality,
    entryStatus,
    entryQualityRating,
    adaptiveExecution,
    pullbackZone: adaptiveExecution.pullbackZone,
    retestLevel: adaptiveExecution.retestLevel,
    safestExecutionZone: adaptiveExecution.safestExecutionZone,
    tradeManagement,
    exhaustionReport: exhaustion,
    priceExtension: extension,
    liquidityAsymmetry: liquidity.asymmetry,
    entryPrice,
    entryZoneLow,
    entryZoneHigh,
    stopLoss,
    targets: targetPkg.targets,
    riskRewardRatio: targetPkg.riskRewardRatio,
    tradeWindow,
    confirmations,
    conflicts,
    unknowns,
    whyTrade,
    whyNotPerfect,
    keyRisk,
    invalidationReason,
    entryReason,
    liquidityReason,
    breakoutReason,
    regimeReason,
    exhaustionReason,
    conflictReason,
    targetReasons,
    longCase,
    shortCase,
    adversarialAudit,
    explanation,
    riskExplanation,
    evidenceBreakdown,
    marketCycle,
    pumpDumpIntelligence: pumpDump,
    flowWhaleIntelligence: flowWhale,
    killSwitch,
    aplusConfluence,
    smcStructureReport: institutionalIntelligence.smc,
    orderflowReport: institutionalIntelligence.orderflow,
    fibonacciReport: institutionalIntelligence.fibonacci,
    divergenceMatrixReport: institutionalIntelligence.divergenceMatrix,
    relativeStrengthReport: institutionalIntelligence.relativeStrength,
    derivativesIntelligenceReport: institutionalIntelligence.derivatives,
    institutionalIntelligence,
    signal: finalSignal
  };
}

/**
 * Legacy Target Generation Compatibility Helper (Phase 3.5 & Phase 4)
 */
export function generateCanonicalTargets(
  entryPrice: number,
  stopLoss: number,
  direction: 'LONG' | 'SHORT',
  atr: number,
  priceDecimals: number = 2
): { targets: TargetLevel[]; tp1: number; tp2: number; tp3: number; riskRewardRatio: number } {
  const res = generateMarketJustifiedTargets(
    entryPrice,
    stopLoss,
    direction,
    atr,
    'NEUTRAL',
    undefined,
    [],
    priceDecimals,
    3
  );
  return {
    targets: res.targets,
    tp1: res.tp1,
    tp2: res.tp2 || 0,
    tp3: res.tp3 || 0,
    riskRewardRatio: res.riskRewardRatio
  };
}

/**
 * Dynamic Target Extractor & Normalizer (Preserves all dynamic targets without 3-target truncation)
 */
export function getCanonicalTargets(signalOrTargets: any): TargetLevel[] {
  if (!signalOrTargets) return [];
  if (Array.isArray(signalOrTargets)) return signalOrTargets;
  if (signalOrTargets.targets && Array.isArray(signalOrTargets.targets) && signalOrTargets.targets.length > 0) {
    return signalOrTargets.targets;
  }
  
  const legacyList: TargetLevel[] = [];
  const entry = typeof signalOrTargets.entryPrice === 'number' && signalOrTargets.entryPrice > 0 ? signalOrTargets.entryPrice : 0;
  
  if (typeof signalOrTargets.tp1 === 'number' && signalOrTargets.tp1 > 0) {
    const pct = entry > 0 ? (Math.abs(signalOrTargets.tp1 - entry) / entry) * 100 : 0;
    legacyList.push({ id: 'TP1', label: 'TP1', price: signalOrTargets.tp1, percentage: Number(pct.toFixed(2)), hit: false });
  }
  if (typeof signalOrTargets.tp2 === 'number' && signalOrTargets.tp2 > 0) {
    const pct = entry > 0 ? (Math.abs(signalOrTargets.tp2 - entry) / entry) * 100 : 0;
    legacyList.push({ id: 'TP2', label: 'TP2', price: signalOrTargets.tp2, percentage: Number(pct.toFixed(2)), hit: false });
  }
  if (typeof signalOrTargets.tp3 === 'number' && signalOrTargets.tp3 > 0) {
    const pct = entry > 0 ? (Math.abs(signalOrTargets.tp3 - entry) / entry) * 100 : 0;
    legacyList.push({ id: 'TP3', label: 'TP3', price: signalOrTargets.tp3, percentage: Number(pct.toFixed(2)), hit: false });
  }
  return legacyList;
}
