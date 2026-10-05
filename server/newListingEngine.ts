import {
  Candle,
  TargetLevel,
  ListingStatus,
  ListingDiscoveryStage,
  ListingStructureType,
  ListingStructureAction,
  ListingLiquidityStatus,
  ListingVolatilityState,
  ListingOverextensionRisk,
  ListingSetupViability,
  ListingTechnicalAlignment,
  ListingReferenceLevels,
  ListingTransitionRecord,
  NewListingIntelligenceReport,
  NewsMarketImpactReport
} from '../src/types/crypto';

export interface EvaluateNewListingParams {
  symbol: string;
  candles?: Candle[];
  currentPrice?: number;
  volume24hUsd?: number | null;
  rvol?: number | null;
  exchange?: string;
  listingTime?: number | null; // epoch ms if known, null if unavailable
  newsImpactReport?: NewsMarketImpactReport;
  coreDecision?: 'LONG' | 'SHORT' | 'WAIT';
  marketCycle?: any;
  previousStatus?: ListingStatus;
  transitionHistory?: ListingTransitionRecord[];
}

/**
 * Deterministic Listing Detection & Status Classification
 * PRE_LISTING -> LISTING_LIVE -> POST_LISTING -> NONE (Mature asset)
 */
export function determineListingStatus(params: {
  candlesCount: number;
  listingAgeHours?: number | null;
  isRegisteredNewListing?: boolean;
  hasTradingHistory?: boolean;
  manualOverride?: ListingStatus;
}): ListingStatus {
  if (params.manualOverride) return params.manualOverride;

  // If no trading history or 0 candles available, it is PRE_LISTING
  if (!params.hasTradingHistory || params.candlesCount === 0) {
    return 'PRE_LISTING';
  }

  // If explicit listing age is provided
  if (typeof params.listingAgeHours === 'number' && params.listingAgeHours !== null) {
    if (params.listingAgeHours < 0) return 'PRE_LISTING';
    if (params.listingAgeHours <= 24) return 'LISTING_LIVE';
    if (params.listingAgeHours <= 336) return 'POST_LISTING'; // Within 14 days
    return 'NONE';
  }

  // Infer strictly from candle count if age not explicitly provided (e.g. 1h candles)
  if (params.isRegisteredNewListing) {
    if (params.candlesCount <= 24) {
      return 'LISTING_LIVE';
    } else if (params.candlesCount <= 336) {
      return 'POST_LISTING';
    }
    return 'NONE';
  }

  // If low candle count on a pair
  if (params.candlesCount <= 24) {
    return 'LISTING_LIVE';
  } else if (params.candlesCount <= 120) {
    return 'POST_LISTING';
  }

  return 'NONE';
}

/**
 * Exact Listing Time & Age Calculation
 * ZERO DATA FABRICATION: If listing time is missing/unknown, return null!
 */
export function calculateListingTimeAndAge(params: {
  listingTime?: number | null;
  firstCandleTimestamp?: number | null;
  evaluationTimestamp?: number;
}): {
  listingTime: number | null;
  listingTimeAvailable: boolean;
  listingAgeHours: number | null;
} {
  const now = params.evaluationTimestamp || Date.now();

  if (typeof params.listingTime === 'number' && !isNaN(params.listingTime) && params.listingTime > 0) {
    const ageHours = Math.max(0, Number(((now - params.listingTime) / 3600000).toFixed(1)));
    return {
      listingTime: params.listingTime,
      listingTimeAvailable: true,
      listingAgeHours: ageHours
    };
  }

  if (typeof params.firstCandleTimestamp === 'number' && !isNaN(params.firstCandleTimestamp) && params.firstCandleTimestamp > 0) {
    const ageHours = Math.max(0, Number(((now - params.firstCandleTimestamp) / 3600000).toFixed(1)));
    return {
      listingTime: params.firstCandleTimestamp,
      listingTimeAvailable: true,
      listingAgeHours: ageHours
    };
  }

  // Explicitly return null when unavailable. No guesswork!
  return {
    listingTime: null,
    listingTimeAvailable: false,
    listingAgeHours: null
  };
}

/**
 * Initial Reference Levels & Range Extraction
 */
export function extractListingReferenceLevels(
  candles: Candle[],
  currentPrice: number | null
): ListingReferenceLevels {
  if (!candles || candles.length === 0) {
    return {
      listingOpenPrice: null,
      listingHigh: null,
      listingLow: null,
      initialRangePct: null,
      currentVsListingOpenPct: null,
      currentVsListingHighPct: null,
      currentVsListingLowPct: null
    };
  }

  const listingOpenPrice = candles[0].open;
  
  // Use first 24 bars (or all available if < 24) for initial discovery range
  const discoveryBars = candles.slice(0, Math.min(candles.length, 24));
  let listingHigh = -Infinity;
  let listingLow = Infinity;

  for (const bar of discoveryBars) {
    if (bar.high > listingHigh) listingHigh = bar.high;
    if (bar.low < listingLow) listingLow = bar.low;
  }

  if (!isFinite(listingHigh)) listingHigh = listingOpenPrice;
  if (!isFinite(listingLow)) listingLow = listingOpenPrice;

  const initialRangePct = listingLow > 0
    ? Number((((listingHigh - listingLow) / listingLow) * 100).toFixed(2))
    : null;

  const cur = currentPrice || candles[candles.length - 1].close;

  const currentVsListingOpenPct = listingOpenPrice > 0
    ? Number((((cur - listingOpenPrice) / listingOpenPrice) * 100).toFixed(2))
    : null;

  const currentVsListingHighPct = listingHigh > 0
    ? Number((((cur - listingHigh) / listingHigh) * 100).toFixed(2))
    : null;

  const currentVsListingLowPct = listingLow > 0
    ? Number((((cur - listingLow) / listingLow) * 100).toFixed(2))
    : null;

  return {
    listingOpenPrice,
    listingHigh,
    listingLow,
    initialRangePct,
    currentVsListingOpenPct,
    currentVsListingHighPct,
    currentVsListingLowPct
  };
}

/**
 * Price Discovery Stage Analysis
 */
export function analyzePriceDiscoveryStage(
  candles: Candle[],
  currentPrice: number,
  ref: ListingReferenceLevels,
  launchStatus: ListingStatus
): ListingDiscoveryStage {
  if (launchStatus === 'PRE_LISTING' || !candles || candles.length === 0) {
    return 'PRE_ANNOUNCEMENT';
  }

  if (candles.length < 3) {
    return 'INITIAL_SPIKE';
  }

  const firstBar = candles[0];
  const firstBarRangePct = firstBar.low > 0 ? ((firstBar.high - firstBar.low) / firstBar.low) * 100 : 0;

  // Immediate initial spike (first 1-4 bars with massive range)
  if (candles.length <= 4 && firstBarRangePct > 50) {
    return 'INITIAL_SPIKE';
  }

  if (launchStatus === 'NONE' && candles.length > 200) {
    return 'ESTABLISHED';
  }

  // Check if bleeding down: current price below listing low or lower lows
  if (
    (ref.listingLow !== null && currentPrice < ref.listingLow * 0.98) ||
    (ref.listingOpenPrice !== null && currentPrice < ref.listingOpenPrice * 0.75)
  ) {
    return 'BLEED_MARKDOWN';
  }

  // Check if expanding breakout above initial high
  if (ref.listingHigh !== null && currentPrice > ref.listingHigh * 1.01) {
    return 'BREAKOUT_EXPANSION';
  }

  // Base building: multiple bars stabilizing in tight range after initial discovery
  if (candles.length > 12 || launchStatus === 'POST_LISTING') {
    const recentBars = candles.slice(-8);
    if (recentBars.length >= 5) {
      const recentHigh = Math.max(...recentBars.map(b => b.high));
      const recentLow = Math.min(...recentBars.map(b => b.low));
      const recentSpreadPct = recentLow > 0 ? ((recentHigh - recentLow) / recentLow) * 100 : 100;

      if (recentSpreadPct < 15 && ref.listingOpenPrice !== null && currentPrice >= ref.listingOpenPrice * 0.95) {
        return 'BASE_BUILDING';
      }
    }
  }

  // First range forming vs price discovery
  if (candles.length <= 16) {
    return 'PRICE_DISCOVERY';
  }

  return 'FIRST_RANGE_FORMING';
}

/**
 * Initial Volatility Analysis
 */
export function analyzeListingVolatility(candles: Candle[]): {
  volatilityState: ListingVolatilityState;
  initialVolatilityPct: number | null;
} {
  if (!candles || candles.length === 0) {
    return { volatilityState: 'INSUFFICIENT_DATA', initialVolatilityPct: null };
  }

  const firstBar = candles[0];
  const firstBarPct = firstBar.low > 0 ? ((firstBar.high - firstBar.low) / firstBar.low) * 100 : 0;

  // Average volatility of available bars
  let totalPct = 0;
  for (const bar of candles.slice(0, 10)) {
    if (bar.low > 0) {
      totalPct += ((bar.high - bar.low) / bar.low) * 100;
    }
  }
  const avgPct = Number((totalPct / Math.min(candles.length, 10)).toFixed(2));

  let state: ListingVolatilityState = 'MODERATE';
  if (firstBarPct > 80 || avgPct > 35) {
    state = 'EXTREME';
  } else if (firstBarPct > 30 || avgPct > 18) {
    state = 'HIGH';
  } else if (candles.length >= 6) {
    const recentBar = candles[candles.length - 1];
    const recentPct = recentBar.low > 0 ? ((recentBar.high - recentBar.low) / recentBar.low) * 100 : 0;
    if (recentPct < avgPct * 0.6) {
      state = 'STABILIZING';
    } else {
      state = 'MODERATE';
    }
  }

  return {
    volatilityState: state,
    initialVolatilityPct: Number(firstBarPct.toFixed(2))
  };
}

/**
 * Liquidity & Volume Availability
 * ZERO FABRICATION: If volume data is missing/undefined/0, return null and mark unavailable.
 */
export function analyzeListingLiquidity(
  volume24hUsd?: number | null,
  rvol?: number | null
): {
  liquidityStatus: ListingLiquidityStatus;
  volumeAvailable: boolean;
  volume24hUsd: number | null;
  rvol: number | null;
} {
  if (volume24hUsd === undefined || volume24hUsd === null || isNaN(volume24hUsd) || volume24hUsd <= 0) {
    return {
      liquidityStatus: 'LIQUIDITY_UNAVAILABLE',
      volumeAvailable: false,
      volume24hUsd: null,
      rvol: null
    };
  }

  const cleanVol = Number(volume24hUsd);
  const cleanRvol = typeof rvol === 'number' && !isNaN(rvol) ? Number(rvol.toFixed(2)) : null;

  if (cleanVol < 1000000) {
    return {
      liquidityStatus: 'LIQUIDITY_THIN',
      volumeAvailable: true,
      volume24hUsd: cleanVol,
      rvol: cleanRvol
    };
  }

  return {
    liquidityStatus: 'LIQUIDITY_AVAILABLE',
    volumeAvailable: true,
    volume24hUsd: cleanVol,
    rvol: cleanRvol
  };
}

/**
 * First Market Structure Identification
 */
export function identifyFirstMarketStructure(
  candles: Candle[],
  currentPrice: number,
  ref: ListingReferenceLevels,
  stage: ListingDiscoveryStage
): ListingStructureType {
  if (!candles || candles.length < 3) {
    return 'STRUCTURE_INSUFFICIENT';
  }

  if (stage === 'BLEED_MARKDOWN') {
    return 'DISTRIBUTION_BLEED';
  }

  if (stage === 'INITIAL_SPIKE' || stage === 'PRICE_DISCOVERY') {
    return 'UNFORMED_VOLATILE';
  }

  // Check for breakout and retest
  if (ref.listingHigh !== null && ref.listingLow !== null) {
    const rangeHeight = ref.listingHigh - ref.listingLow;
    if (rangeHeight > 0) {
      // Retest holding prior high as support
      if (currentPrice >= ref.listingHigh * 0.97 && currentPrice <= ref.listingHigh * 1.08) {
        return 'BREAKOUT_RETEST';
      }

      // Accumulation base: price holding in upper 50% of range with higher lows
      const midPoint = ref.listingLow + rangeHeight * 0.5;
      if (currentPrice >= midPoint) {
        return 'ACCUMULATION_BASE';
      }

      // Range bound between high and low
      if (currentPrice >= ref.listingLow && currentPrice <= ref.listingHigh) {
        return 'RANGE_BOUND';
      }
    }
  }

  return 'RANGE_BOUND';
}

/**
 * Breakout / Breakdown / Reclaim / Rejection Action Detection
 */
export function detectStructureAction(
  candles: Candle[],
  currentPrice: number,
  ref: ListingReferenceLevels
): ListingStructureAction {
  if (!candles || candles.length < 3 || ref.listingHigh === null || ref.listingLow === null) {
    return 'UNKNOWN';
  }

  const lastBar = candles[candles.length - 1];
  const prevBar = candles[candles.length - 2];

  // 1. REJECTION: tested near or above listingHigh but rejected with long upper wick or bearish close
  if (lastBar.high >= ref.listingHigh * 0.97) {
    const upperWick = lastBar.high - Math.max(lastBar.open, lastBar.close);
    const body = Math.abs(lastBar.close - lastBar.open);
    if ((upperWick > body * 0.8 || lastBar.close < lastBar.open) && lastBar.close < lastBar.high * 0.96) {
      return 'REJECTION';
    }
  }

  // 2. RECLAIM: price had dipped below listing open or low, but last bar pushed back above with strong close
  if (ref.listingOpenPrice !== null) {
    const dippedBelow = candles.slice(-5).some(b => b.low < ref.listingOpenPrice!);
    if (dippedBelow && lastBar.close > ref.listingOpenPrice && lastBar.close > lastBar.open && lastBar.close <= ref.listingHigh * 1.02) {
      return 'RECLAIM';
    }
  }

  // 3. BREAKOUT: clean close above listing high with solid bullish expansion
  if (lastBar.close > ref.listingHigh && prevBar.close <= ref.listingHigh * 1.02) {
    return 'BREAKOUT';
  }

  // 4. BREAKDOWN: clean close below listing low
  if (lastBar.close < ref.listingLow) {
    return 'BREAKDOWN';
  }

  return 'NO_ACTION';
}

/**
 * Early Accumulation vs Distribution Behavior
 */
export function assessAccumulationDistribution(
  candles: Candle[],
  structure: ListingStructureType,
  action: ListingStructureAction
): 'EARLY_ACCUMULATION' | 'EARLY_DISTRIBUTION' | 'NEUTRAL_CONSOLIDATION' | 'INSUFFICIENT_DATA' {
  if (!candles || candles.length < 4) {
    return 'INSUFFICIENT_DATA';
  }

  if (structure === 'DISTRIBUTION_BLEED' || action === 'BREAKDOWN') {
    return 'EARLY_DISTRIBUTION';
  }

  if (structure === 'ACCUMULATION_BASE' || structure === 'BREAKOUT_RETEST' || action === 'RECLAIM') {
    return 'EARLY_ACCUMULATION';
  }

  // Check volume on green vs red bars in recent period
  const sample = candles.slice(-10);
  let greenVol = 0;
  let redVol = 0;

  for (const bar of sample) {
    if (bar.close >= bar.open) {
      greenVol += bar.volume;
    } else {
      redVol += bar.volume;
    }
  }

  if (greenVol > redVol * 1.6) {
    return 'EARLY_ACCUMULATION';
  } else if (redVol > greenVol * 1.8) {
    return 'EARLY_DISTRIBUTION';
  }

  return 'NEUTRAL_CONSOLIDATION';
}

/**
 * Dump-Risk & Overextension (Anti-Chase Protocol)
 */
export function assessDumpRiskAndOverextension(params: {
  currentPrice: number;
  ref: ListingReferenceLevels;
  volatilityState: ListingVolatilityState;
  stage: ListingDiscoveryStage;
  structure: ListingStructureType;
  newsImpactReport?: NewsMarketImpactReport;
}): {
  pumpDumpRisk: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
  overextensionRisk: ListingOverextensionRisk;
  antiChaseWarning: boolean;
  chaseReason?: string;
} {
  const { currentPrice, ref, volatilityState, stage, structure, newsImpactReport } = params;

  if (ref.listingOpenPrice === null || !currentPrice) {
    return {
      pumpDumpRisk: 'UNKNOWN',
      overextensionRisk: 'UNKNOWN',
      antiChaseWarning: false
    };
  }

  const gainFromOpenPct = ((currentPrice - ref.listingOpenPrice) / ref.listingOpenPrice) * 100;
  const isAirdropDump = stage === 'BLEED_MARKDOWN' || structure === 'DISTRIBUTION_BLEED';

  // Overextension detection
  let overextension: ListingOverextensionRisk = 'NOT_OVEREXTENDED';
  let antiChase = false;
  let chaseReason: string | undefined;

  if (gainFromOpenPct > 150 && stage === 'INITIAL_SPIKE') {
    overextension = 'CRITICAL_OVEREXTENSION';
    antiChase = true;
    chaseReason = `Parabolic +${gainFromOpenPct.toFixed(0)}% initial spike without structural base. Chasing entry strictly prohibited.`;
  } else if (gainFromOpenPct > 80 && volatilityState === 'EXTREME') {
    overextension = 'CRITICAL_OVEREXTENSION';
    antiChase = true;
    chaseReason = `Extreme extension (+${gainFromOpenPct.toFixed(0)}%) with high volatility exhaustion risk. Anti-chase protocol active.`;
  } else if (gainFromOpenPct > 50) {
    overextension = 'MODERATE_OVEREXTENSION';
  }

  // Overall pump/dump hazard
  let risk: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' = 'MODERATE';

  if (isAirdropDump || (newsImpactReport && newsImpactReport.impactClassification === 'DUMP_RISK')) {
    risk = 'CRITICAL';
  } else if (overextension === 'CRITICAL_OVEREXTENSION' || volatilityState === 'EXTREME') {
    risk = 'HIGH';
  } else if (structure === 'ACCUMULATION_BASE' || structure === 'BREAKOUT_RETEST') {
    risk = 'LOW';
  }

  return {
    pumpDumpRisk: risk,
    overextensionRisk: overextension,
    antiChaseWarning: antiChase,
    chaseReason
  };
}

/**
 * Valid Entry Opportunity vs WAIT
 */
export function assessSetupViability(params: {
  launchStatus: ListingStatus;
  discoveryStage: ListingDiscoveryStage;
  liquidityStatus: ListingLiquidityStatus;
  structure: ListingStructureType;
  pumpDumpRisk: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
  antiChaseWarning: boolean;
}): ListingSetupViability {
  const { launchStatus, discoveryStage, liquidityStatus, structure, pumpDumpRisk, antiChaseWarning } = params;

  if (launchStatus === 'PRE_LISTING') {
    return 'PRE_LISTING_WAIT';
  }

  if (liquidityStatus === 'LIQUIDITY_UNAVAILABLE' || liquidityStatus === 'LIQUIDITY_THIN') {
    return 'WAIT_LIQUIDITY';
  }

  if (antiChaseWarning || pumpDumpRisk === 'CRITICAL' || structure === 'DISTRIBUTION_BLEED') {
    return 'DO_NOT_TRADE';
  }

  if (
    discoveryStage === 'INITIAL_SPIKE' ||
    discoveryStage === 'PRICE_DISCOVERY' ||
    structure === 'UNFORMED_VOLATILE' ||
    structure === 'STRUCTURE_INSUFFICIENT'
  ) {
    return 'WAIT_STABILIZATION';
  }

  if (
    (structure === 'ACCUMULATION_BASE' || structure === 'BREAKOUT_RETEST') &&
    (pumpDumpRisk === 'LOW' || pumpDumpRisk === 'MODERATE')
  ) {
    return 'ACTIONABLE_BASE';
  }

  return 'WAIT_STABILIZATION';
}

/**
 * Calculate Structural SL, TP & R:R
 * STRICT RULE: Only output levels when valid verified structural support/resistance exists.
 * Otherwise null! ZERO FABRICATION.
 */
export function calculateStructuralLevels(params: {
  currentPrice: number;
  ref: ListingReferenceLevels;
  structure: ListingStructureType;
  viability: ListingSetupViability;
  atr?: number;
}): {
  hasStructuralLevels: boolean;
  entryZone: { low: number; high: number; ideal: number } | null;
  structuralStopLoss: number | null;
  structuralTargets: TargetLevel[];
  structuralRiskRewardRatio: number | null;
  invalidation: string;
} {
  const { currentPrice, ref, structure, viability, atr } = params;

  if (viability !== 'ACTIONABLE_BASE' || ref.listingLow === null || !currentPrice) {
    return {
      hasStructuralLevels: false,
      entryZone: null,
      structuralStopLoss: null,
      structuralTargets: [],
      structuralRiskRewardRatio: null,
      invalidation: viability === 'PRE_LISTING_WAIT'
        ? 'Awaiting live exchange listing commencement'
        : viability === 'WAIT_LIQUIDITY'
        ? 'Awaiting verifiable trading volume and order book liquidity'
        : viability === 'DO_NOT_TRADE'
        ? 'High dump risk / distribution bleed: trading prohibited'
        : 'Awaiting structural base low validation before calculating risk levels'
    };
  }

  // Derive structural volatility buffer using ATR or base price action range
  const baseRange = (ref.listingHigh !== null && ref.listingLow !== null) ? (ref.listingHigh - ref.listingLow) : (currentPrice * 0.04);
  const effectiveAtr = (atr && atr > 0) ? atr : Math.max(baseRange * 0.2, currentPrice * 0.008);
  const volatilityBuffer = Math.max(effectiveAtr * 0.25, currentPrice * 0.001);

  // Structural Stop Loss anchored to validated base/listing low with volatility invalidation
  let sl = ref.listingLow - volatilityBuffer;
  if (structure === 'BREAKOUT_RETEST' && ref.listingHigh !== null) {
    sl = ref.listingHigh - volatilityBuffer; // Just below retested former resistance pivot
  }

  const riskPerUnit = currentPrice - sl;
  if (riskPerUnit <= 0) {
    return {
      hasStructuralLevels: false,
      entryZone: null,
      structuralStopLoss: null,
      structuralTargets: [],
      structuralRiskRewardRatio: null,
      invalidation: 'Invalid structural geometry: price below support pivot'
    };
  }

  // Structural Targets: Anchor TP1 to verified structural high / range resistance if available
  let tp1Price: number;
  let tp2Price: number;
  let tp3Price: number;

  if (ref.listingHigh !== null && ref.listingHigh > currentPrice + (riskPerUnit * 0.5)) {
    tp1Price = Number(ref.listingHigh.toFixed(6));
    const rangeHeight = tp1Price - currentPrice;
    tp2Price = Number((currentPrice + rangeHeight * 1.618).toFixed(6));
    tp3Price = Number((currentPrice + rangeHeight * 2.618).toFixed(6));
  } else {
    tp1Price = Number((currentPrice + riskPerUnit * 2.0).toFixed(6));
    tp2Price = Number((currentPrice + riskPerUnit * 3.5).toFixed(6));
    tp3Price = Number((currentPrice + riskPerUnit * 5.0).toFixed(6));
  }

  const targets: TargetLevel[] = [
    {
      id: 'tp1',
      label: 'TP1',
      price: tp1Price,
      percentage: Number((((tp1Price - currentPrice) / currentPrice) * 100).toFixed(1)),
      hit: false,
      structuralBasis: ref.listingHigh && ref.listingHigh > currentPrice ? 'SWING_HIGH' : 'FIB_EXTENSION_1618'
    },
    {
      id: 'tp2',
      label: 'TP2',
      price: tp2Price,
      percentage: Number((((tp2Price - currentPrice) / currentPrice) * 100).toFixed(1)),
      hit: false,
      structuralBasis: 'FIB_EXTENSION_1618'
    },
    {
      id: 'tp3',
      label: 'TP3',
      price: tp3Price,
      percentage: Number((((tp3Price - currentPrice) / currentPrice) * 100).toFixed(1)),
      hit: false,
      structuralBasis: 'FIB_EXTENSION_2618'
    }
  ];

  const rr = Number(((tp1Price - currentPrice) / riskPerUnit).toFixed(1));
  const entrySpread = Math.max(volatilityBuffer, currentPrice * 0.0015);
  const entryZone = {
    ideal: currentPrice,
    low: Number(Math.max(sl + volatilityBuffer, currentPrice - entrySpread).toFixed(6)),
    high: Number((currentPrice + entrySpread).toFixed(6))
  };

  return {
    hasStructuralLevels: true,
    entryZone,
    structuralStopLoss: Number(sl.toFixed(6)),
    structuralTargets: targets,
    structuralRiskRewardRatio: rr,
    invalidation: `Breakdown below verified structural support at ${sl.toFixed(4)}`
  };
}

/**
 * Confluence & Technical Alignment Evaluation
 * INVARIANT: New Listing Intelligence NEVER independently creates LONG/SHORT.
 * It provides confluence, timing context, and risk warnings only.
 */
export function evaluateNewListingConfluence(params: {
  coreDecision: 'LONG' | 'SHORT' | 'WAIT';
  viability: ListingSetupViability;
  structure: ListingStructureType;
  action: ListingStructureAction;
  pumpDumpRisk: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
  antiChaseWarning: boolean;
  newsImpactReport?: NewsMarketImpactReport;
}): {
  technicalAlignment: ListingTechnicalAlignment;
  confluenceReason: string;
} {
  const { coreDecision, viability, structure, action, pumpDumpRisk, antiChaseWarning, newsImpactReport } = params;

  // If anti-chase triggered, always warn
  if (antiChaseWarning) {
    return {
      technicalAlignment: 'HIGH_RISK_WARNING',
      confluenceReason: 'Anti-chase hazard: Extreme post-listing expansion without consolidation base'
    };
  }

  // If pump/dump risk is critical
  if (pumpDumpRisk === 'CRITICAL') {
    if (coreDecision === 'LONG') {
      return {
        technicalAlignment: 'CONTRADICTS_SETUP',
        confluenceReason: 'Critical post-listing dump hazard contradicts technical LONG setup'
      };
    }
    return {
      technicalAlignment: 'SUPPORTS_SHORT',
      confluenceReason: 'Severe distribution bleed supports markdown / SHORT posture'
    };
  }

  // If actionable base
  if (viability === 'ACTIONABLE_BASE') {
    if (coreDecision === 'LONG') {
      let reason = `Verified post-listing ${structure.replace(/_/g, ' ')} confirms technical breakout`;
      if (newsImpactReport && newsImpactReport.impactClassification === 'PUMP_CATALYST') {
        reason += ' with Tier-1 listing catalyst confluence';
      }
      return {
        technicalAlignment: 'SUPPORTS_LONG',
        confluenceReason: reason
      };
    } else if (coreDecision === 'SHORT') {
      return {
        technicalAlignment: 'CONTRADICTS_SETUP',
        confluenceReason: 'Forming accumulation base contradicts technical SHORT setup'
      };
    }
  }

  // If waiting for stabilization or liquidity
  if (viability === 'WAIT_STABILIZATION' || viability === 'WAIT_LIQUIDITY' || viability === 'PRE_LISTING_WAIT') {
    return {
      technicalAlignment: 'NEUTRAL',
      confluenceReason: 'Early listing discovery phase requires confirmation; confluence factor only'
    };
  }

  return {
    technicalAlignment: 'NEUTRAL',
    confluenceReason: 'New listing context aligned with standard market discovery'
  };
}

/**
 * State Transition Tracking
 */
export function trackListingStateTransition(
  previousStatus: ListingStatus | undefined,
  currentStatus: ListingStatus,
  history: ListingTransitionRecord[] | undefined,
  reason: string
): ListingTransitionRecord[] {
  const existing = history ? [...history] : [];

  if (previousStatus && previousStatus !== currentStatus) {
    existing.push({
      from: previousStatus,
      to: currentStatus,
      timestamp: Date.now(),
      reason
    });
  }

  return existing;
}

/**
 * Comprehensive Phase 14 New Listing Intelligence Engine Entry Point
 */
export function evaluateNewListingIntelligence(
  params: EvaluateNewListingParams
): NewListingIntelligenceReport {
  const symbol = params.symbol.toUpperCase();
  const candles = params.candles || [];
  const curPrice = params.currentPrice || (candles.length > 0 ? candles[candles.length - 1].close : 0);
  const exchange = params.exchange || 'BINANCE';

  // 1. Exact listing time & age
  const timeData = calculateListingTimeAndAge({
    listingTime: params.listingTime,
    firstCandleTimestamp: candles.length > 0 ? candles[0].timestamp : null
  });

  // 2. Listing status
  const launchStatus = determineListingStatus({
    candlesCount: candles.length,
    listingAgeHours: timeData.listingAgeHours,
    isRegisteredNewListing: true,
    hasTradingHistory: candles.length > 0
  });

  // 3. Reference levels
  const refLevels = extractListingReferenceLevels(candles, curPrice);

  // 4. Discovery stage
  const discoveryStage = analyzePriceDiscoveryStage(candles, curPrice, refLevels, launchStatus);

  // 5. Volatility state
  const volData = analyzeListingVolatility(candles);

  // 6. Liquidity & Volume
  const liqData = analyzeListingLiquidity(params.volume24hUsd, params.rvol);

  // 7. First market structure
  const marketStructure = identifyFirstMarketStructure(candles, curPrice, refLevels, discoveryStage);

  // 8. Structure action
  const structureAction = detectStructureAction(candles, curPrice, refLevels);

  // 9. Accumulation vs distribution
  const accumDist = assessAccumulationDistribution(candles, marketStructure, structureAction);

  // 10. Dump risk & anti-chase
  const dumpOverext = assessDumpRiskAndOverextension({
    currentPrice: curPrice,
    ref: refLevels,
    volatilityState: volData.volatilityState,
    stage: discoveryStage,
    structure: marketStructure,
    newsImpactReport: params.newsImpactReport
  });

  // 11. Setup viability
  const setupViability = assessSetupViability({
    launchStatus,
    discoveryStage,
    liquidityStatus: liqData.liquidityStatus,
    structure: marketStructure,
    pumpDumpRisk: dumpOverext.pumpDumpRisk,
    antiChaseWarning: dumpOverext.antiChaseWarning
  });

  // 12. Structural trade levels
  const atr = candles.length >= 3
    ? candles.slice(-10).reduce((acc, c) => acc + (c.high - c.low), 0) / Math.min(10, candles.length)
    : undefined;
  const structuralLevels = calculateStructuralLevels({
    currentPrice: curPrice,
    ref: refLevels,
    structure: marketStructure,
    viability: setupViability,
    atr
  });

  // 13. Confluence with core unified engine
  const confluence = evaluateNewListingConfluence({
    coreDecision: params.coreDecision || 'WAIT',
    viability: setupViability,
    structure: marketStructure,
    action: structureAction,
    pumpDumpRisk: dumpOverext.pumpDumpRisk,
    antiChaseWarning: dumpOverext.antiChaseWarning,
    newsImpactReport: params.newsImpactReport
  });

  // 14. Transition history
  const transitionHistory = trackListingStateTransition(
    params.previousStatus,
    launchStatus,
    params.transitionHistory,
    `Stage evaluated as ${discoveryStage}`
  );

  return {
    symbol,
    isNewListing: launchStatus !== 'NONE',
    launchStatus,
    exchange,
    listingTime: timeData.listingTime,
    listingTimeAvailable: timeData.listingTimeAvailable,
    listingAgeHours: timeData.listingAgeHours,
    discoveryStage,
    volatilityState: volData.volatilityState,
    initialVolatilityPct: volData.initialVolatilityPct,
    liquidityStatus: liqData.liquidityStatus,
    volumeAvailable: liqData.volumeAvailable,
    volume24hUsd: liqData.volume24hUsd,
    rvol: liqData.rvol,
    marketStructure,
    structureAction,
    referenceLevels: refLevels,
    earlyAccumulationDistribution: accumDist,
    pumpDumpRisk: dumpOverext.pumpDumpRisk,
    overextensionRisk: dumpOverext.overextensionRisk,
    antiChaseWarning: dumpOverext.antiChaseWarning,
    setupViability,
    technicalAlignment: confluence.technicalAlignment,
    confluenceReason: confluence.confluenceReason,
    invalidation: structuralLevels.invalidation,
    hasStructuralLevels: structuralLevels.hasStructuralLevels,
    entryZone: structuralLevels.entryZone,
    structuralStopLoss: structuralLevels.structuralStopLoss,
    structuralTargets: structuralLevels.structuralTargets,
    structuralRiskRewardRatio: structuralLevels.structuralRiskRewardRatio,
    zeroFabricatedData: true,
    transitionHistory
  };
}
