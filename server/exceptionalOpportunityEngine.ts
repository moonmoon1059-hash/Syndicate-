import {
  Candle,
  Signal,
  PreMoveReport,
  BigMoveStage,
  BigMoveHunterReport,
  DumpHunterStage,
  DumpHunterReport,
  ExceptionalOpportunityPriority,
  ExceptionalOpportunityReport,
  NewListingIntelligenceReport,
  PumpDumpIntelligence,
  MarketCycleAnalysis,
  DerivativesIntelligenceReport,
  NewsMarketImpactReport
} from '../src/types/crypto';

// ============================================================================
// 1. DEDICATED BIG MOVE HUNTER ENGINE
// ============================================================================

export interface BigMoveHunterInput {
  symbol: string;
  candles: Candle[];
  currentPrice: number;
  rvol?: number;
  pumpDumpIntelligence?: PumpDumpIntelligence | null;
  preMoveReport?: PreMoveReport | null;
  marketCycle?: MarketCycleAnalysis | null;
  derivativesIntelligence?: DerivativesIntelligenceReport | null;
}

/**
 * Detects explosive movement BEFORE or DURING the acceleration phase.
 * Stages:
 * - WATCH: Coiling, volume base building, compression tightening
 * - EARLY_EXPANSION: First 1-2 expansion bars, RVOL spiking, BOS/CHoCH, price < 5% from base
 * - EXPLOSIVE: Consecutive expansion candles, RVOL > 2.5x, aggressive taker flow, OI confirming
 * - EXTREME: Parabolic expansion across multiple timeframes, RVOL > 4.0x
 *
 * NOTE: 30% is a priority classifier, NEVER a hard gate. An eventual 300% move begins with a small initial move!
 */
export function evaluateBigMoveHunter(input: BigMoveHunterInput): BigMoveHunterReport {
  const {
    symbol,
    candles,
    currentPrice,
    rvol = 1.0,
    pumpDumpIntelligence,
    preMoveReport,
    marketCycle,
    derivativesIntelligence
  } = input;

  const evidence: string[] = [];
  const warnings: string[] = [];

  if (!candles || candles.length < 15) {
    return {
      symbol,
      stage: 'WATCH',
      detected: false,
      score: 0,
      rangeExpansion: {
        m5Expansion: false,
        m15Expansion: false,
        m30Expansion: false,
        h1Expansion: false,
        consecutiveExpansions: 0
      },
      volumeVelocity: {
        rvol,
        volumeAcceleration: 'NORMAL',
        takerBuyRatio: 0.5,
        aggressiveTakerFlow: false
      },
      structureTriggers: {
        bosConfirmed: false,
        mssConfirmed: false,
        chochConfirmed: false,
        liquiditySweepReclaimed: false,
        breakoutFromCompression: false
      },
      derivativesConfirmation: {
        oiExpanding: false,
        oiPriceConfirmed: false,
        liquidationImbalance: 'UNAVAILABLE',
        fundingPressure: 'NEUTRAL'
      },
      asymmetryScore: 20,
      evidence: ['Insufficient candle depth for Big Move detection'],
      warnings: ['Need at least 15 candles for velocity calculation']
    };
  }

  // 1. Calculate Multi-Candle Range and Expansions
  const recent = candles.slice(-10);
  const lastBar = candles[candles.length - 1];
  const prevBar = candles[candles.length - 2];
  const barRange = Math.abs(lastBar.high - lastBar.low);
  const prevBarRange = Math.abs(prevBar.high - prevBar.low);

  const avgRange10 = recent.reduce((sum, c) => sum + Math.abs(c.high - c.low), 0) / recent.length;
  const isRangeExpanding = barRange > (avgRange10 * 1.45);

  // Consecutive expansions
  let consecutiveExpansions = 0;
  for (let i = candles.length - 1; i >= Math.max(0, candles.length - 5); i--) {
    const bar = candles[i];
    const range = Math.abs(bar.high - bar.low);
    const isGreen = bar.close >= bar.open;
    if (isGreen && range > avgRange10 * 1.2) {
      consecutiveExpansions++;
    } else {
      break;
    }
  }

  const h1Expansion = isRangeExpanding && (lastBar.close > lastBar.open);
  const m15Expansion = barRange > prevBarRange * 1.3 && (lastBar.close > prevBar.high);
  const m5Expansion = consecutiveExpansions >= 1;
  const m30Expansion = consecutiveExpansions >= 2;

  if (isRangeExpanding) {
    evidence.push(`Candle range expansion ${(barRange / (avgRange10 || 1)).toFixed(2)}x above 10-bar baseline`);
  }
  if (consecutiveExpansions >= 2) {
    evidence.push(`${consecutiveExpansions} consecutive strong bullish expansion candles`);
  }

  // 2. Volume Velocity and Taker Flow
  const lastVol = lastBar.volume || 0;
  const avgVol10 = recent.reduce((sum, c) => sum + (c.volume || 0), 0) / recent.length;
  const volExpansionRatio = avgVol10 > 0 ? lastVol / avgVol10 : 1.0;
  const effectiveRvol = Math.max(rvol, volExpansionRatio);

  let volumeAcceleration: 'EXPLOSIVE' | 'ABOVE_AVERAGE' | 'NORMAL' | 'DRYING_UP' = 'NORMAL';
  if (effectiveRvol >= 2.8 || volExpansionRatio >= 3.0) {
    volumeAcceleration = 'EXPLOSIVE';
    evidence.push(`Abnormal explosive relative volume (${effectiveRvol.toFixed(2)}x)`);
  } else if (effectiveRvol >= 1.6 || volExpansionRatio >= 1.8) {
    volumeAcceleration = 'ABOVE_AVERAGE';
    evidence.push(`Elevated buy-side volume acceleration (${effectiveRvol.toFixed(2)}x)`);
  } else if (effectiveRvol < 0.7) {
    volumeAcceleration = 'DRYING_UP';
  }

  // Taker buy flow estimation
  const bodySize = Math.abs(lastBar.close - lastBar.open);
  const upperWick = lastBar.high - Math.max(lastBar.open, lastBar.close);
  const lowerWick = Math.min(lastBar.open, lastBar.close) - lastBar.low;
  const isStrongCloseNearHigh = barRange > 0 ? (lastBar.high - lastBar.close) / barRange < 0.25 : false;
  const aggressiveTakerFlow = isStrongCloseNearHigh && (lastBar.close > lastBar.open) && effectiveRvol >= 1.4;
  const takerBuyRatio = aggressiveTakerFlow ? 0.75 : (lastBar.close > lastBar.open ? 0.58 : 0.42);

  if (aggressiveTakerFlow) {
    evidence.push('Aggressive buy-side taker orderflow (closing at top 25% of candle on expanding volume)');
  }

  // 3. Structure Triggers
  const highestOfPrior8 = Math.max(...candles.slice(-9, -1).map(c => c.high));
  const lowestOfPrior8 = Math.min(...candles.slice(-9, -1).map(c => c.low));

  const bosConfirmed = lastBar.close > highestOfPrior8;
  const chochConfirmed = lastBar.close > highestOfPrior8 && prevBar.close <= highestOfPrior8;
  const mssConfirmed = chochConfirmed;
  const breakoutFromCompression = Boolean(
    preMoveReport?.volatilitySqueeze ||
    (preMoveReport && preMoveReport.compressionRatio >= 35) ||
    (preMoveReport?.setupStage === 'TRIGGERED')
  );

  const liquiditySweepReclaimed = Boolean(
    preMoveReport?.fakeoutSweep?.detected &&
    preMoveReport?.fakeoutSweep?.sweepSide === 'LIQUIDITY_RUN_LOW' &&
    preMoveReport?.fakeoutSweep?.reclaimed
  );

  if (bosConfirmed) {
    evidence.push(`Bullish Break of Structure (BOS) above swing high ${highestOfPrior8.toFixed(4)}`);
  }
  if (breakoutFromCompression) {
    evidence.push(`Breakout from pre-move coil compression (Coil Score: ${preMoveReport?.coilScore || 0})`);
  }
  if (liquiditySweepReclaimed) {
    evidence.push('Liquidity sweep of prior lows followed by immediate bullish structural reclaim');
  }

  // 4. Derivatives Confirmation
  const oiExpanding = Boolean(
    ((derivativesIntelligence as any)?.oiVelocity === 'RAPID_EXPANSION' || (derivativesIntelligence as any)?.oiVelocity === 'MODERATE_EXPANSION') ||
    (derivativesIntelligence?.oiChange24h && derivativesIntelligence.oiChange24h > 5) ||
    (preMoveReport?.openInterestBuild?.detected && preMoveReport.openInterestBuild.implication === 'ACCUMULATION')
  );
  const oiPriceConfirmed = oiExpanding && lastBar.close > lastBar.open;

  let liquidationImbalance: 'HEAVY_SHORTS' | 'HEAVY_LONGS' | 'BALANCED' | 'UNAVAILABLE' = 'UNAVAILABLE';
  if ((derivativesIntelligence as any)?.liquidationImbalance) {
    liquidationImbalance = (derivativesIntelligence as any).liquidationImbalance;
  }

  let fundingPressure: 'FAVORABLE' | 'CROWDED' | 'NEUTRAL' = 'NEUTRAL';
  if (derivativesIntelligence?.fundingRate !== undefined && derivativesIntelligence.fundingRate !== null) {
    if (derivativesIntelligence.fundingRate < 0.0001 && derivativesIntelligence.fundingRate > -0.0005) {
      fundingPressure = 'FAVORABLE'; // Clean, uncrowded funding allows sustained move
    } else if (derivativesIntelligence.fundingRate > 0.0008) {
      fundingPressure = 'CROWDED';
      warnings.push('High positive funding rate indicates crowded longs');
    }
  }

  if (oiPriceConfirmed) {
    evidence.push('Open interest expanding in tandem with spot price (Institutional fresh positioning)');
  }
  if (liquidationImbalance === 'HEAVY_SHORTS') {
    evidence.push('Short liquidation imbalance providing immediate fuel for squeeze acceleration');
  }

  // 5. Scoring & Stage Classification
  let score = 25;
  if (effectiveRvol >= 1.5) score += 15;
  if (effectiveRvol >= 2.5) score += 15;
  if (consecutiveExpansions >= 1) score += 10;
  if (consecutiveExpansions >= 2) score += 10;
  if (bosConfirmed) score += 15;
  if (breakoutFromCompression) score += 15;
  if (aggressiveTakerFlow) score += 10;
  if (oiPriceConfirmed) score += 10;
  if (liquiditySweepReclaimed) score += 10;

  score = Math.min(100, score);

  let stage: BigMoveStage = 'WATCH';
  if (score >= 80 && (consecutiveExpansions >= 2 || effectiveRvol >= 3.0)) {
    stage = 'EXPLOSIVE';
  } else if (score >= 90 && effectiveRvol >= 4.0) {
    stage = 'EXTREME';
  } else if (score >= 60 && (bosConfirmed || breakoutFromCompression || effectiveRvol >= 1.8)) {
    stage = 'EARLY_EXPANSION';
  } else if (score >= 40 || preMoveReport?.setupStage === 'COILING' || preMoveReport?.setupStage === 'READY_TO_BREAK') {
    stage = 'WATCH';
  }

  const detected = stage !== 'WATCH';

  // Asymmetry Score
  let asymmetryScore = 40;
  if (stage === 'EARLY_EXPANSION') asymmetryScore = 85; // Highest asymmetry: entering right at expansion onset
  else if (stage === 'EXPLOSIVE') asymmetryScore = 75;
  else if (stage === 'EXTREME') asymmetryScore = 60; // Later in the move, lower R:R
  else if (preMoveReport?.setupStage === 'READY_TO_BREAK') asymmetryScore = 90;

  return {
    symbol,
    stage,
    detected,
    score,
    rangeExpansion: {
      m5Expansion,
      m15Expansion,
      m30Expansion,
      h1Expansion,
      consecutiveExpansions
    },
    volumeVelocity: {
      rvol: Number(effectiveRvol.toFixed(2)),
      volumeAcceleration,
      takerBuyRatio: Number(takerBuyRatio.toFixed(2)),
      aggressiveTakerFlow
    },
    structureTriggers: {
      bosConfirmed,
      mssConfirmed,
      chochConfirmed,
      liquiditySweepReclaimed,
      breakoutFromCompression
    },
    derivativesConfirmation: {
      oiExpanding,
      oiPriceConfirmed,
      liquidationImbalance,
      fundingPressure
    },
    asymmetryScore,
    evidence,
    warnings
  };
}

// ============================================================================
// 2. DEDICATED HUGE DUMP / SHORT HUNTER ENGINE
// ============================================================================

export interface DumpHunterInput {
  symbol: string;
  candles: Candle[];
  currentPrice: number;
  rvol?: number;
  pumpDumpIntelligence?: PumpDumpIntelligence | null;
  marketCycle?: MarketCycleAnalysis | null;
  derivativesIntelligence?: DerivativesIntelligenceReport | null;
}

/**
 * Detects severe distribution, exhaustion, failed reclaims, and cascade breakdowns for actionable shorts.
 * Stages:
 * - DUMP_WATCH: Extreme upside extension, upper wick rejections, Wyckoff UTAD forming
 * - DUMP_TRIGGERED: Liquidity sweep rejection confirmed, bearish CHoCH or support breakdown printed
 * - DUMP_EXPANSION: Consecutive downward expansion candles, breaking key support on elevated sell volume
 * - EXTREME_DUMP: Waterfall panic liquidation, extreme downward velocity
 *
 * CRITICAL: Only produce actionable short when setup is genuinely actionable (never short running parabolic pump without breakdown confirmation!).
 */
export function evaluateDumpHunter(input: DumpHunterInput): DumpHunterReport {
  const {
    symbol,
    candles,
    currentPrice,
    rvol = 1.0,
    pumpDumpIntelligence,
    marketCycle,
    derivativesIntelligence
  } = input;

  const evidence: string[] = [];
  const warnings: string[] = [];

  if (!candles || candles.length < 15) {
    return {
      symbol,
      stage: 'DUMP_WATCH',
      detected: false,
      score: 0,
      distributionFeatures: {
        extremeUpsideExtension: false,
        distributionDetected: false,
        exhaustionDetected: false,
        volumeClimax: false,
        liquiditySweepRejected: false,
        failedBreakout: false
      },
      breakdownTriggers: {
        bearishMss: false,
        bearishBos: false,
        supportLost: false,
        failedReclaim: false,
        accelerationDownward: false
      },
      derivativesReversal: {
        oiReversalPattern: false,
        aggressiveSellFlow: false,
        liquidationImbalance: 'UNAVAILABLE',
        fundingExtremeLong: false
      },
      actionableShort: false,
      evidence: ['Insufficient candle depth for Dump Hunter evaluation'],
      warnings: []
    };
  }

  const recent = candles.slice(-12);
  const lastBar = candles[candles.length - 1];
  const prevBar = candles[candles.length - 2];
  const prevBar2 = candles.length > 2 ? candles[candles.length - 3] : prevBar;

  // 1. Extreme Upside Extension & Climax
  const lowestRecent12 = Math.min(...recent.map(c => c.low));
  const highestRecent12 = Math.max(...recent.map(c => c.high));
  const recentRunPct = lowestRecent12 > 0 ? ((highestRecent12 - lowestRecent12) / lowestRecent12) * 100 : 0;

  const extremeUpsideExtension = recentRunPct >= 20.0 || Boolean(pumpDumpIntelligence?.postPumpExhaustion || pumpDumpIntelligence?.climaxDetected);
  if (extremeUpsideExtension) {
    evidence.push(`Extreme prior expansion (+${recentRunPct.toFixed(1)}% run) vulnerable to distribution`);
  }

  // Upper wick rejection / Wyckoff UTAD
  const barRange = Math.abs(lastBar.high - lastBar.low);
  const upperWick = barRange > 0 ? (lastBar.high - Math.max(lastBar.open, lastBar.close)) / barRange : 0;
  const prevUpperWick = Math.abs(prevBar.high - prevBar.low) > 0
    ? (prevBar.high - Math.max(prevBar.open, prevBar.close)) / Math.abs(prevBar.high - prevBar.low)
    : 0;

  const upperWickRejection = upperWick > 0.45 || prevUpperWick > 0.45;
  const volumeClimax = (rvol >= 2.5 || pumpDumpIntelligence?.volumeAcceleration === 'EXPLOSIVE') && upperWickRejection;
  if (volumeClimax) {
    evidence.push('Volume climax with heavy upper wick absorption (smart money distribution into retail FOMO)');
  }

  // Liquidity sweep rejection: broke highest high then closed below
  const swingHighPrior = Math.max(...candles.slice(-10, -2).map(c => c.high));
  const liquiditySweepRejected = (lastBar.high > swingHighPrior || prevBar.high > swingHighPrior) &&
    lastBar.close < swingHighPrior;

  if (liquiditySweepRejected) {
    evidence.push(`Liquidity sweep and sharp rejection above key swing high ${swingHighPrior.toFixed(4)}`);
  }

  const failedBreakout = liquiditySweepRejected || (prevBar.close > swingHighPrior && lastBar.close < prevBar.low);
  if (failedBreakout) {
    evidence.push('Bull trap / failed breakout: buyers trapped above resistance now underwater');
  }

  const distributionDetected = upperWickRejection || volumeClimax || marketCycle?.cycle === 'DISTRIBUTION';

  // 2. Breakdown Triggers
  const recentSwingLow = Math.min(...candles.slice(-8, -2).map(c => c.low));
  const supportLost = lastBar.close < recentSwingLow;
  const bearishBos = supportLost;
  const bearishMss = lastBar.close < prevBar.low && prevBar.close < prevBar2.low;
  const failedReclaim = prevBar.high > recentSwingLow && lastBar.close < recentSwingLow;
  const accelerationDownward = lastBar.close < lastBar.open && barRange > (Math.abs(prevBar.high - prevBar.low) * 1.3);

  if (bearishBos) {
    evidence.push(`Bearish Break of Structure (BOS) below key support ${recentSwingLow.toFixed(4)}`);
  }
  if (failedReclaim) {
    evidence.push('Failed reclaim of broken structural support level (resistance flip confirmed)');
  }
  if (accelerationDownward) {
    evidence.push('Downward price acceleration with expanding red candle body');
  }

  // 3. Derivatives Reversal
  const oiReversalPattern = Boolean(
    ((derivativesIntelligence as any)?.oiVelocity === 'RAPID_EXPANSION' || derivativesIntelligence?.priceOiCorrelation === 'SHORT_ACCUMULATION') && lastBar.close < lastBar.open
  );
  const aggressiveSellFlow = lastBar.close < lastBar.open && (lastBar.close - lastBar.low) / (barRange || 1) < 0.25;
  const fundingExtremeLong = Boolean(
    (derivativesIntelligence as any)?.fundingExtremity === 'EXTREME_POSITIVE' ||
    (derivativesIntelligence?.fundingRate && derivativesIntelligence.fundingRate > 0.001)
  );

  let liquidationImbalance: 'HEAVY_LONGS' | 'HEAVY_SHORTS' | 'BALANCED' | 'UNAVAILABLE' = 'UNAVAILABLE';
  if ((derivativesIntelligence as any)?.liquidationImbalance) {
    liquidationImbalance = (derivativesIntelligence as any).liquidationImbalance;
  }

  if (fundingExtremeLong) {
    evidence.push('Hyper-positive funding rate indicating highly vulnerable, over-leveraged longs');
  }
  if (liquidationImbalance === 'HEAVY_LONGS') {
    evidence.push('Long liquidation cascade underway providing downward momentum fuel');
  }

  // 4. Scoring & Stage Classification
  let score = 20;
  if (extremeUpsideExtension) score += 15;
  if (upperWickRejection) score += 10;
  if (volumeClimax) score += 15;
  if (liquiditySweepRejected) score += 20;
  if (failedBreakout) score += 15;
  if (bearishBos) score += 20;
  if (failedReclaim) score += 15;
  if (fundingExtremeLong) score += 10;
  if (accelerationDownward) score += 10;

  score = Math.min(100, score);

  let stage: DumpHunterStage = 'DUMP_WATCH';
  let actionableShort = false;

  if (score >= 85 && accelerationDownward && (bearishBos || failedBreakout)) {
    stage = 'EXTREME_DUMP';
    actionableShort = true;
  } else if (score >= 70 && (bearishBos || failedReclaim)) {
    stage = 'DUMP_EXPANSION';
    actionableShort = true;
  } else if (score >= 55 && (liquiditySweepRejected || failedBreakout || bearishMss)) {
    stage = 'DUMP_TRIGGERED';
    actionableShort = true; // Perfect early entry: right at confirmation of rejection
  } else {
    stage = 'DUMP_WATCH';
    actionableShort = false;
    warnings.push('Awaiting structural breakdown or rejection confirmation before shorting');
  }

  const detected = stage !== 'DUMP_WATCH' || score >= 50;

  return {
    symbol,
    stage,
    detected,
    score,
    distributionFeatures: {
      extremeUpsideExtension,
      distributionDetected,
      exhaustionDetected: Boolean(pumpDumpIntelligence?.postPumpExhaustion || pumpDumpIntelligence?.climaxDetected),
      volumeClimax,
      liquiditySweepRejected,
      failedBreakout
    },
    breakdownTriggers: {
      bearishMss,
      bearishBos,
      supportLost,
      failedReclaim,
      accelerationDownward
    },
    derivativesReversal: {
      oiReversalPattern,
      aggressiveSellFlow,
      liquidationImbalance,
      fundingExtremeLong
    },
    actionableShort,
    evidence,
    warnings
  };
}

// ============================================================================
// 3. UNIFIED EXCEPTIONAL-OPPORTUNITY PRIORITY ENGINE
// ============================================================================

export interface ExceptionalEvaluationInput {
  signal: Signal;
  preMove?: PreMoveReport | null;
  bigMove?: BigMoveHunterReport | null;
  dumpHunter?: DumpHunterReport | null;
  listingIntel?: NewListingIntelligenceReport | null;
  btcRegime?: { trend: 'BULLISH' | 'BEARISH' | 'RANGING'; volatility: 'HIGH' | 'NORMAL' | 'COMPRESSED' } | null;
  newsReport?: NewsMarketImpactReport | null;
}

/**
 * Consumes:
 * 1. Pre-Move
 * 2. Big Move Hunter
 * 3. Dump Hunter
 * 4. New Listing Radar
 * 5. Core market structure
 * 6. Volume / orderflow
 * 7. OI / funding / liquidations
 * 8. BTC regime
 * 9. Verified news / catalyst (SUPPORTING EVIDENCE ONLY. News alone can NEVER create a trading signal!)
 *
 * Ranks opportunities by exceptional-move potential and actionability.
 * Priority: CRITICAL, VERY_HIGH, HIGH, WATCH, IGNORE.
 *
 * Only CRITICAL / VERY_HIGH / top-tier HIGH reach Telegram!
 */
export function evaluateUnifiedExceptionalOpportunity(input: ExceptionalEvaluationInput): ExceptionalOpportunityReport {
  const {
    signal,
    preMove,
    bigMove,
    dumpHunter,
    listingIntel,
    btcRegime,
    newsReport
  } = input;

  const symbol = signal.symbol;
  const isLong = signal.direction === 'LONG';
  const evidence: string[] = [];
  const riskWarnings: string[] = [];

  // Determine Opportunity Classification
  let opportunityClass: 'PRE_PUMP' | 'PRE_DUMP' | 'BIG_MOVE_LONG' | 'HUGE_DUMP_SHORT' | 'NEW_LISTING_EXPANSION' | 'STANDARD' = 'STANDARD';

  if (listingIntel && (listingIntel.launchStatus === 'PRE_LISTING' || (listingIntel as any).status === 'UPCOMING' || listingIntel.discoveryStage === 'PRE_ANNOUNCEMENT' || listingIntel.discoveryStage === 'PRICE_DISCOVERY')) {
    opportunityClass = 'NEW_LISTING_EXPANSION';
  } else if (!isLong && dumpHunter && dumpHunter.actionableShort) {
    opportunityClass = 'HUGE_DUMP_SHORT';
  } else if (!isLong && preMove && preMove.projectedDirection === 'BEARISH' && preMove.setupStage === 'READY_TO_BREAK') {
    opportunityClass = 'PRE_DUMP';
  } else if (isLong && bigMove && (bigMove.stage === 'EXPLOSIVE' || bigMove.stage === 'EXTREME')) {
    opportunityClass = 'BIG_MOVE_LONG';
  } else if (isLong && preMove && preMove.projectedDirection === 'BULLISH' && (preMove.setupStage === 'TRIGGERED' || preMove.setupStage === 'READY_TO_BREAK')) {
    opportunityClass = 'PRE_PUMP';
  } else if (isLong && bigMove && bigMove.stage === 'EARLY_EXPANSION') {
    opportunityClass = 'BIG_MOVE_LONG';
  }

  // 1. Asymmetric Potential Score (0 - 100)
  let asymmetricPotentialScore = 40;
  if (preMove && preMove.coilScore >= 70) {
    asymmetricPotentialScore += 25;
    evidence.push(`Severe coiled compression (${preMove.coilScore}/100) provides high coiled spring energy`);
  }
  if (bigMove && (bigMove.stage === 'EARLY_EXPANSION' || bigMove.stage === 'EXPLOSIVE')) {
    asymmetricPotentialScore += 25;
    evidence.push(`Big Move acceleration stage (${bigMove.stage}) indicates multi-leg trend potential`);
  }
  if (dumpHunter && dumpHunter.actionableShort && (dumpHunter.stage === 'DUMP_TRIGGERED' || dumpHunter.stage === 'DUMP_EXPANSION')) {
    asymmetricPotentialScore += 25;
    evidence.push(`Dump Hunter confirmed cascade breakdown stage (${dumpHunter.stage})`);
  }
  if (signal.riskRewardRatio && signal.riskRewardRatio >= 2.5) {
    asymmetricPotentialScore += 15;
  }
  asymmetricPotentialScore = Math.min(100, Math.max(10, asymmetricPotentialScore));

  // 2. Actionability Score (0 - 100)
  let actionabilityScore = 30;

  // Grade boost
  if (signal.qualityGrade === 'A+') actionabilityScore += 25;
  else if (signal.qualityGrade === 'A') actionabilityScore += 15;

  // Stage actionability
  if (preMove?.setupStage === 'TRIGGERED') actionabilityScore += 25;
  else if (preMove?.setupStage === 'READY_TO_BREAK') actionabilityScore += 15;
  else if (preMove?.setupStage === 'COILING') actionabilityScore -= 10;

  if (bigMove?.stage === 'EXPLOSIVE' || bigMove?.stage === 'EARLY_EXPANSION') actionabilityScore += 20;
  if (dumpHunter?.actionableShort) actionabilityScore += 20;

  // Valid Entry and SL check
  const hasValidEntry = signal.entryPrice > 0 && signal.stopLoss > 0;
  const isAntiChaseActive = Boolean(
    (signal as any).antiChaseActive ||
    signal.executionStatus === 'WAIT_FOR_PULLBACK' ||
    (isLong && preMove?.noChaseLevel && signal.currentPrice > preMove.noChaseLevel) ||
    (!isLong && preMove?.noChaseLevel && signal.currentPrice < preMove.noChaseLevel)
  );

  if (isAntiChaseActive) {
    actionabilityScore = Math.min(actionabilityScore, 30);
    riskWarnings.push('Anti-chase guard active: price already extended beyond optimal risk envelope');
  }

  if (!hasValidEntry) {
    actionabilityScore = 0;
    riskWarnings.push('Missing valid structural entry or stop loss');
  }

  // BTC Regime confirmation
  if (btcRegime) {
    if (isLong && btcRegime.trend === 'BEARISH') {
      actionabilityScore -= 15;
      riskWarnings.push('Counter-trend against macro BTC bearish regime');
    } else if (!isLong && btcRegime.trend === 'BULLISH') {
      actionabilityScore -= 15;
      riskWarnings.push('Shorting into macro BTC bullish trend');
    }
  }

  // News is strictly supporting evidence
  if (newsReport && newsReport.impactScore >= 70) {
    evidence.push(`Supporting catalyst: ${newsReport.headline} (Impact: ${newsReport.impactScore}%)`);
  }

  actionabilityScore = Math.min(100, Math.max(0, actionabilityScore));

  // 3. Composite Rank Score
  const compositeRankScore = Math.round((asymmetricPotentialScore * 0.55) + (actionabilityScore * 0.45));

  // 4. Priority Classification
  let priority: ExceptionalOpportunityPriority = 'IGNORE';
  if (isAntiChaseActive) {
    priority = 'WATCH';
  } else if (
    (opportunityClass === 'BIG_MOVE_LONG' && bigMove?.stage === 'EXPLOSIVE' && actionabilityScore >= 75) ||
    (opportunityClass === 'HUGE_DUMP_SHORT' && dumpHunter?.stage === 'EXTREME_DUMP' && actionabilityScore >= 75) ||
    (opportunityClass === 'PRE_PUMP' && preMove?.setupStage === 'TRIGGERED' && signal.qualityGrade === 'A+' && actionabilityScore >= 80)
  ) {
    priority = 'CRITICAL';
  } else if (
    compositeRankScore >= 75 &&
    actionabilityScore >= 70 &&
    (signal.qualityGrade === 'A+' || signal.qualityGrade === 'A')
  ) {
    priority = 'VERY_HIGH';
  } else if (
    compositeRankScore >= 60 &&
    actionabilityScore >= 55 &&
    (signal.qualityGrade === 'A+' || signal.qualityGrade === 'A' || signal.qualityGrade === 'B')
  ) {
    priority = 'HIGH';
  } else if (
    preMove?.setupStage === 'COILING' ||
    dumpHunter?.stage === 'DUMP_WATCH' ||
    bigMove?.stage === 'WATCH'
  ) {
    priority = 'WATCH';
  } else {
    priority = 'IGNORE';
  }

  // 5. Telegram Eligibility Decision
  let telegramEligible = false;
  let telegramEligibilityReason = '';

  if (opportunityClass === 'STANDARD') {
    telegramEligibilityReason = 'Standard core signal is never eligible for Telegram (Telegram reserved for Pre-Move, Big Move, Big Dump, and New Listings)';
  } else if (isAntiChaseActive) {
    telegramEligibilityReason = 'Anti-chase rejected: price already over-extended';
  } else if (priority === 'IGNORE' || priority === 'WATCH') {
    telegramEligibilityReason = `Priority (${priority}) below Telegram threshold (requires CRITICAL, VERY_HIGH, or qualified HIGH)`;
  } else if (signal.qualityGrade !== 'A+' && signal.qualityGrade !== 'A') {
    telegramEligibilityReason = `Grade (${signal.qualityGrade}) below Telegram standard (requires Grade A or A+)`;
  } else if (actionabilityScore < 65) {
    telegramEligibilityReason = `Actionability score (${actionabilityScore}/100) below threshold`;
  } else if (!signal.targets || signal.targets.length === 0) {
    telegramEligibilityReason = 'No real structural targets defined';
  } else {
    const validTargets = signal.targets.filter(t => typeof t.price === 'number' && t.price > 0);
    const isLong = signal.direction === 'LONG';
    const entryLow = Math.min(signal.entryZoneLow || signal.entryPrice, signal.entryZoneHigh || signal.entryPrice);
    const entryHigh = Math.max(signal.entryZoneLow || signal.entryPrice, signal.entryZoneHigh || signal.entryPrice);
    const entryRef = (entryLow + entryHigh) / 2 || signal.entryPrice;
    const maxTarget = isLong ? Math.max(...validTargets.map(t => t.price)) : Math.min(...validTargets.map(t => t.price));
    const maxTargetMove = entryRef > 0
      ? (isLong ? ((maxTarget - entryRef) / entryRef) * 100 : ((entryRef - maxTarget) / entryRef) * 100)
      : 0;

    if (maxTargetMove < 30.0) {
      telegramEligible = false;
      telegramEligibilityReason = `Maximum structural target (+${maxTargetMove.toFixed(1)}%) below mandatory 30% Telegram threshold`;
    } else {
      telegramEligible = true;
      telegramEligibilityReason = `Qualified for Telegram dispatch as ${priority} ${opportunityClass} (Composite: ${compositeRankScore}/100)`;
    }
  }

  return {
    symbol,
    priority,
    opportunityClass,
    asymmetricPotentialScore,
    actionabilityScore,
    compositeRankScore,
    telegramEligible,
    telegramEligibilityReason,
    evidence,
    riskWarnings,
    preMove: preMove || undefined,
    bigMove: bigMove || undefined,
    dumpHunter: dumpHunter || undefined,
    listingIntel: listingIntel || undefined
  };
}
