import { Candle } from './cryptoService';
import {
  OpportunityDiscoveryReport,
  OpportunityType,
  MarketCategory,
  Signal,
  OpportunityRanking,
  SignalQualityGrade,
  ActionablePriority,
  OpportunityPriorityAnalysis,
  OpportunityScoreBreakdown,
  OpportunityRankingTier,
  ExpectedMoveClass,
  HighImpactOpportunityType
} from '../src/types/crypto';
import { getAssetCategory, getMarketCoverageTelemetry } from './marketUniverseService';
import { calculateEMA, calculateRSI, calculateATR, calculateRVOL } from './technicalAnalysis';
import { DerivativesData } from './advancedMarketData';
import { ProcessedNews } from './newsIntelligenceEngine';

export interface DiscoveryInputData {
  symbol: string;
  timeframe?: string;
  candles: Candle[];
  btcCandles?: Candle[];
  derivatives?: DerivativesData | null;
  newsList?: ProcessedNews[];
  qualityGrade?: SignalQualityGrade;
  moonScore?: number;
  confidence?: number;
  riskRewardRatio?: number;
  direction?: 'LONG' | 'SHORT';
  whyTrade?: string[];
  conflicts?: string[];
}

/**
 * Opportunity Discovery Engine
 * Evaluates assets across the universal market universe to discover early momentum,
 * structural compression, SMC setups, and pre-pump catalysts while enforcing strict
 * anti-hindsight rules and post-pump dump-risk protection.
 */
export function evaluateOpportunityDiscovery(input: DiscoveryInputData): OpportunityDiscoveryReport {
  const { symbol, candles, btcCandles, derivatives, newsList, qualityGrade, moonScore, direction } = input;
  const category = getAssetCategory(symbol);
  const detectedPatterns: OpportunityType[] = [];
  const evidenceList: string[] = [];

  if (!candles || candles.length < 20) {
    return {
      symbol,
      category,
      opportunityScore: 0,
      detectedPatterns: [],
      earlySetupType: 'NONE',
      rvol: 1.0,
      priceVelocityScore: 50,
      compressionScore: 0,
      rsScoreVsBtc: 0,
      smcStructure: 'NONE',
      postPumpDumpRisk: 'LOW',
      summary: 'Insufficient candle data for opportunity discovery',
      evidenceList: ['Data unavailable (<20 candles)'],
      rankingBucket: 'WAIT'
    };
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const latest = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  // 1. Calculate Core Indicators
  const rvol = calculateRVOL(volumes, 20);
  const rsiArr = calculateRSI(closes, 14);
  const rsi = rsiArr[rsiArr.length - 1] || 50;
  const ema20Arr = calculateEMA(closes, 20);
  const ema20 = ema20Arr[ema20Arr.length - 1] || latest.close;
  const atrArr = calculateATR(candles, 14);
  const atr = atrArr[atrArr.length - 1] || latest.close * 0.02;

  // 2. Early Volume Acceleration Detection
  const vol3BarRising = latest.volume > prev.volume && prev.volume > prev2.volume;
  const volSurge = rvol >= 1.8;
  if (volSurge || (vol3BarRising && rvol >= 1.3)) {
    detectedPatterns.push('EARLY_VOLUME_ACCELERATION');
    evidenceList.push(`Volume acceleration active (RVOL ${rvol.toFixed(1)}x, 3-bar trend expanding)`);
  }
  if (rvol >= 2.2) {
    detectedPatterns.push('RVOL_EXPANSION');
    evidenceList.push(`Significant relative volume expansion (RVOL: ${rvol.toFixed(2)}x)`);
  }

  // 3. Price Velocity Acceleration & Compression -> Expansion
  const priceChange3Bar = ((latest.close - candles[Math.max(0, candles.length - 4)].close) / candles[Math.max(0, candles.length - 4)].close) * 100;
  const priceChange24hApprox = ((latest.close - candles[Math.max(0, candles.length - 25)].close) / candles[Math.max(0, candles.length - 25)].close) * 100;
  
  // Measure Volatility Compression (narrow range relative to ATR over last 6-10 bars)
  const recent6High = Math.max(...highs.slice(-7, -1));
  const recent6Low = Math.min(...lows.slice(-7, -1));
  const rangeSpanPct = ((recent6High - recent6Low) / latest.close) * 100;
  const isCompressed = rangeSpanPct < 3.5; // Under 3.5% consolidation range
  const compressionScore = isCompressed ? Math.min(100, Math.round((4.0 - rangeSpanPct) * 30)) : 20;

  // Compression -> Expansion Breakout detection
  const isExpandingOut = isCompressed && (latest.close > recent6High || latest.close < recent6Low);
  if (isExpandingOut || (compressionScore > 60 && rvol > 1.4)) {
    detectedPatterns.push('COMPRESSION_EXPANSION');
    evidenceList.push(`Volatility compression transitioning into expansion (Consolidation span: ${rangeSpanPct.toFixed(1)}%)`);
  }

  // 4. Breakout / Retest Detection
  const resistanceLevel = Math.max(...highs.slice(-25, -5));
  const isBreakout = latest.close > resistanceLevel && prev.close <= resistanceLevel * 1.002;
  const isRetest = prev.high >= resistanceLevel && latest.low <= resistanceLevel * 1.005 && latest.close >= resistanceLevel;
  if (isBreakout || isRetest) {
    detectedPatterns.push('BREAKOUT_RETEST');
    evidenceList.push(isRetest ? `Structural retest confirmed at horizontal level ${resistanceLevel.toFixed(4)}` : `Horizontal level breakout confirmed above ${resistanceLevel.toFixed(4)}`);
  }

  // 5. Liquidity Sweep & Reclaim (SMC Concept)
  const swingLow20 = Math.min(...lows.slice(-20, -3));
  const swingHigh20 = Math.max(...highs.slice(-20, -3));
  let smcStructure: 'BOS' | 'CHOCH' | 'ORDER_BLOCK_TAP' | 'FVG_FILL' | 'LIQUIDITY_GRAB' | 'NONE' = 'NONE';

  const isSweepLowReclaim = prev.low < swingLow20 && latest.close > swingLow20;
  const isSweepHighRejection = prev.high > swingHigh20 && latest.close < swingHigh20;

  if (isSweepLowReclaim || isSweepHighRejection) {
    detectedPatterns.push('LIQUIDITY_SWEEP_RECLAIM');
    smcStructure = 'LIQUIDITY_GRAB';
    evidenceList.push(isSweepLowReclaim ? `Liquidity sweep below swing low (${swingLow20.toFixed(4)}) followed by bullish reclaim` : `Buy-side liquidity sweep above swing high (${swingHigh20.toFixed(4)}) followed by rejection`);
  } else if (isBreakout) {
    smcStructure = 'BOS';
    detectedPatterns.push('SMC_STRUCTURAL_SETUP');
  }

  // 6. Relative Strength vs BTC
  let rsScoreVsBtc = 50;
  if (btcCandles && btcCandles.length >= 20) {
    const btcLatest = btcCandles[btcCandles.length - 1];
    const btcStart = btcCandles[Math.max(0, btcCandles.length - 20)];
    const btcChangePct = ((btcLatest.close - btcStart.close) / btcStart.close) * 100;
    const assetStart = candles[Math.max(0, candles.length - 20)];
    const assetChangePct = ((latest.close - assetStart.close) / assetStart.close) * 100;
    const rsDelta = assetChangePct - btcChangePct;

    if (rsDelta >= 3.0) {
      detectedPatterns.push('RELATIVE_STRENGTH_BTC');
      rsScoreVsBtc = Math.min(100, Math.round(50 + rsDelta * 4));
      evidenceList.push(`Strong relative strength vs BTC (+${rsDelta.toFixed(1)}% alpha over 20 bars)`);
    } else if (rsDelta <= -3.0) {
      rsScoreVsBtc = Math.max(10, Math.round(50 + rsDelta * 4));
    }
  }

  // 7. Unusual Derivatives Activity (Zero fabrication: only if provided)
  if (derivatives && derivatives.openInterest && derivatives.openInterest > 0) {
    const oiChange = derivatives.openInterestChange24h || 0;
    const funding = derivatives.fundingRate || 0;
    if (Math.abs(oiChange) >= 15 || Math.abs(funding) >= 0.0005) {
      detectedPatterns.push('DERIVATIVES_ACCELERATION');
      evidenceList.push(`Unusual derivatives positioning (OI 24h: ${oiChange > 0 ? '+' : ''}${oiChange.toFixed(1)}%, Funding: ${(funding * 100).toFixed(3)}%)`);
    }
  }

  // 8. Catalyst / News Acceleration & New Listing Momentum
  if (newsList && newsList.length > 0) {
    const relevantNews = newsList.filter(n => n.relatedCoins.includes(symbol.replace('USDT', '')) || n.primaryCoin === symbol.replace('USDT', ''));
    const highImpact = relevantNews.find(n => n.impactScore >= 70);
    if (highImpact) {
      detectedPatterns.push('CATALYST_ACCELERATION');
      evidenceList.push(`Catalyst acceleration: ${highImpact.title.substring(0, 60)}...`);
    }
  }

  if (category === 'NEW_LISTING') {
    detectedPatterns.push('NEW_LISTING_MOMENTUM');
    evidenceList.push(`New listing structure evaluation active for ${symbol}`);
  }

  // =========================================================================
  // 9. PRE-PUMP DISCOVERY VS POST-PUMP DUMP-RISK (STRICT ANTI-HINDSIGHT RULE)
  // =========================================================================
  let earlySetupType: 'EARLY_CATALYST_SETUP' | 'EARLY_MOMENTUM_SETUP' | 'COMPRESSION_BREAKOUT' | 'NONE' = 'NONE';
  let postPumpDumpRisk: 'CRITICAL' | 'ELEVATED' | 'MODERATE' | 'LOW' = 'LOW';

  const distanceFromEma20Pct = ((latest.close - ema20) / ema20) * 100;
  const isAlreadyPumpedMassively = priceChange24hApprox > 35 || distanceFromEma20Pct > 9.0 || (rsi > 78 && distanceFromEma20Pct > 6.0);

  if (isAlreadyPumpedMassively) {
    // STRICT RULE 3: Never label an already +100% or heavily pumped move as "early".
    // Move to post-pump / climax exhaustion evaluation instead.
    earlySetupType = 'NONE';
    detectedPatterns.push('POST_PUMP_CLIMAX');
    
    if (distanceFromEma20Pct > 15 || rsi > 85 || (latest.high - latest.close > (latest.close - latest.low) * 2)) {
      postPumpDumpRisk = 'CRITICAL';
      evidenceList.push(`Severe post-pump exhaustion / climax detected (Distance from EMA20: ${distanceFromEma20Pct.toFixed(1)}%, RSI: ${rsi.toFixed(1)})`);
    } else {
      postPumpDumpRisk = 'ELEVATED';
      evidenceList.push(`Elevated dump risk due to extended momentum (+${priceChange24hApprox.toFixed(1)}% 24h change)`);
    }
  } else {
    // Truly Early Setup criteria: compressed base, early volume expansion, not yet extended
    if (isExpandingOut && rvol >= 1.4 && Math.abs(distanceFromEma20Pct) < 5.0) {
      earlySetupType = 'COMPRESSION_BREAKOUT';
      detectedPatterns.push('PRE_PUMP_CATALYST');
      evidenceList.push(`Early compression breakout setup detected before major price expansion`);
    } else if (volSurge && (priceChange3Bar >= 0.4 || vol3BarRising) && priceChange3Bar < 7.0 && distanceFromEma20Pct < 6.0) {
      earlySetupType = 'EARLY_MOMENTUM_SETUP';
      detectedPatterns.push('PRE_PUMP_CATALYST');
      evidenceList.push(`Early momentum ignition setup detected with clean structural entry`);
    } else if (compressionScore >= 50 && rvol >= 1.3 && Math.abs(distanceFromEma20Pct) < 4.0) {
      earlySetupType = 'COMPRESSION_BREAKOUT';
      detectedPatterns.push('PRE_PUMP_CATALYST');
      evidenceList.push(`Structural compression with initial accumulation volume`);
    } else if (newsList && newsList.some(n => n.relatedCoins.includes(symbol.replace('USDT', '')) && n.impactScore >= 75) && Math.abs(distanceFromEma20Pct) < 5.0) {
      earlySetupType = 'EARLY_CATALYST_SETUP';
      detectedPatterns.push('PRE_PUMP_CATALYST');
      evidenceList.push(`Early catalyst setup detected prior to full market reaction`);
    }
  }

  // 10. Calculate Opportunity Score (0 - 100)
  let baseScore = moonScore || 50;
  let patternBonus = detectedPatterns.length * 6;
  if (earlySetupType !== 'NONE') patternBonus += 12;
  if (postPumpDumpRisk === 'CRITICAL') patternBonus -= 30;
  if (postPumpDumpRisk === 'ELEVATED') patternBonus -= 15;

  const opportunityScore = Math.max(10, Math.min(99, Math.round(baseScore * 0.6 + patternBonus + (rvol > 2 ? 10 : rvol * 4))));

  // 11. Determine Cross-Market Ranking Bucket
  let rankingBucket: 'STRONGEST_A_PLUS' | 'STRONGEST_A' | 'EARLY_OPPORTUNITY' | 'WATCH_OPPORTUNITY' | 'WAIT' = 'WAIT';
  if (qualityGrade === 'A+') {
    rankingBucket = 'STRONGEST_A_PLUS';
  } else if (qualityGrade === 'A') {
    rankingBucket = 'STRONGEST_A';
  } else if (earlySetupType !== 'NONE' && (qualityGrade === 'B' || opportunityScore >= 75)) {
    rankingBucket = 'EARLY_OPPORTUNITY';
  } else if (qualityGrade === 'B' || opportunityScore >= 65) {
    rankingBucket = 'WATCH_OPPORTUNITY';
  } else {
    rankingBucket = 'WAIT';
  }

  const summary = evidenceList.length > 0 ? evidenceList.slice(0, 3).join(' • ') : 'Standard market conditions';

  return {
    symbol,
    category,
    opportunityScore,
    detectedPatterns,
    earlySetupType,
    rvol: Number(rvol.toFixed(2)),
    priceVelocityScore: Math.min(100, Math.max(0, Math.round(50 + priceChange3Bar * 5))),
    compressionScore,
    rsScoreVsBtc,
    smcStructure,
    postPumpDumpRisk,
    summary,
    evidenceList,
    rankingBucket
  };
}

/**
 * Phase 6.2 Advanced Opportunity Priority Score Engine
 * Deterministic scoring algorithm ranking genuine, high-conviction setups at the top
 * based on Quality Grade, Real TP Count, Realistic Upside, R:R, Execution Readiness,
 * MTF Confluence, RVOL/Velocity, SMC Structure, Orderflow, Relative Strength vs BTC,
 * Derivatives, Catalysts, Obstacle Proximity, Post-Pump Dump-Risk Penalty, and Data Quality.
 * Zero market-cap bias. Zero data fabrication.
 */
export function calculateOpportunityPriorityScore(signal: Signal): OpportunityPriorityAnalysis {
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
    // Default standard structural targets up to TP10 if no explicit NONE flag
    if (t.label && /^TP([1-9]|10)$/i.test(t.label)) return true;
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
  else if (rr < 1.0) riskRewardScore = -80; // Severe penalty for negative expectation R:R
  else riskRewardScore = -40; // Penalize sub-optimal R:R

  // 4. Realistic Upside Score (Tempered: high upside with poor R:R or high dump risk does not rank top)
  let realisticUpsideScore = Math.min(80, Math.round(realisticUpsidePct * 1.5));
  // Phase 18: Structurally justified 30–35%+ TP potential receives priority when available with real levels
  if (realisticUpsidePct >= 30 && genuineTpCount >= 2 && rr >= 1.8 && signal.pumpDump?.dumpRisk !== 'CRITICAL') {
    realisticUpsideScore += 25;
  }
  if (rr < 1.3 || signal.pumpDump?.dumpRisk === 'CRITICAL' || (signal.pumpDump as any)?.isDumpRisk || signal.opportunityReport?.postPumpDumpRisk === 'CRITICAL') {
    realisticUpsideScore = Math.min(10, realisticUpsideScore);
  }

  // Determine Expected Move Class (Macro expansion ~50%+ / 100%+)
  let expectedMoveClass: ExpectedMoveClass = 'RANGE_BOUND_UNDER_10PCT';
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
  let highImpactType: HighImpactOpportunityType = 'BREAKOUT_RETEST';
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

  // Attach to signal object directly
  signal.expectedMoveClass = expectedMoveClass;
  signal.highImpactType = highImpactType;

  // 5. Genuine Structural TP Score (Bonus points only for real structural levels, capped at 5)
  // CRITICAL RULE 1: More TP levels alone must NEVER increase quality grade. Capped at 20 pts max.
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
    for (const k of ['4h', '1h', '30m', '15m', '5m']) {
      if (tfs[k] && ((signal.direction === 'LONG' && tfs[k].bias === 'BULLISH') || (signal.direction === 'SHORT' && tfs[k].bias === 'BEARISH'))) {
        alignedCount++;
      }
    }
    mtfConfluenceScore = alignedCount * 8; // up to 32
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

  // 10. Orderflow / CVD / OBI Score (ZERO fabrication: 0 if unavailable)
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

  // 12. Derivatives Evidence Score (ZERO fabrication: 0 if unavailable)
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
    obstacleClearanceScore = 15; // Clean runway to targets
  }

  // 15. Pump Exhaustion / Dump-Risk Penalties (CRITICAL)
  let dumpRiskPenalty = 0;
  const pd = signal.pumpDump as any;
  const dumpRisk = signal.opportunityReport?.postPumpDumpRisk || pd?.dumpRisk;
  const isDumpHazard = dumpRisk === 'CRITICAL' || pd?.climaxDetected || pd?.postPumpExhaustion || pd?.isDumpRisk || pd?.isPumpExhausted || (pd?.dumpScore && pd.dumpScore >= 70);
  const isElevatedHazard = dumpRisk === 'ELEVATED' || pd?.fakePumpRisk === 'HIGH' || (pd?.dumpScore && pd.dumpScore >= 50);

  if (isDumpHazard) {
    dumpRiskPenalty = 140; // Substantial deduction
  } else if (isElevatedHazard) {
    dumpRiskPenalty = 70;
  }

  if (signal.adaptiveExecution?.chaseRisk || signal.coreIntelligence?.priceExtensionLevel === 'SEVERELY_EXTENDED' || (signal as any).priceExtensionLevel === 'SEVERELY_EXTENDED') {
    dumpRiskPenalty += 40;
  }

  // 16. Data Quality Score
  let dataQualityScore = 0;
  const dq = signal.dataQuality || 'MEDIUM';
  if (dq === 'HIGH') dataQualityScore = 10;
  else if (dq === 'LOW') dataQualityScore = -30;
  else if (dq === 'INVALID') dataQualityScore = -300;

  // 17. Calculate Final Composite Score
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

  let totalRawScore = 
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

  // Clamp priority score (10 min for active signals, negative only for stopped/expired)
  const priorityScore = signal.status === 'STOPPED_OUT' || signal.status === 'EXPIRED' || signal.status === 'CANCELLED' || signal.entryStatus === 'INVALIDATED'
    ? Math.min(-100, totalRawScore)
    : Math.max(10, totalRawScore);

  // 18. Determine Ranking Tier
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

  // 19. Generate High-Conviction Key Rank Reasons (up to 4 bullet points)
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
 * Phase 18 Unified Multi-Timeframe Fusion Ranking Engine (Server)
 * 
 * Strict Priority Hierarchy:
 * 1. EARLY PUMP (pre-pump compression, volume surge, early accumulation)
 * 2. POST-PUMP DUMP (post-pump climax exhaustion, dump risk warning / short distribution setup)
 * 3. NEW LISTING PUMP/DUMP (new listing base formation, post-listing discovery)
 * 4. NEWS PUMP/DUMP (high-impact news catalyst acceleration)
 * 5. BEST ENTRY TIMING (immediate trigger confirmed: ENTRY_NOW, tight invalidation)
 * 6. Structurally justified 30–35%+ TP potential (genuine structural levels >= 30% upside, RR >= 1.8, zero fabrication)
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

  if (isEarlyPump) fusionScore += 120000;

  // 2. POST-PUMP DUMP (+100,000 pts)
  const pdIntel = signal.pumpDump || (signal as any).pumpDumpIntelligence;
  const isPostPumpDump =
    pdIntel?.dumpRisk === 'CRITICAL' ||
    oppReport?.postPumpDumpRisk === 'CRITICAL' ||
    signal.highImpactType === 'DUMP_RISK' ||
    signal.highImpactType === 'POST_PUMP_EXHAUSTION' ||
    pdIntel?.isPumpExhausted === true ||
    pdIntel?.climaxDetected === true ||
    (signal.direction === 'SHORT' && (signal.qualityGrade === 'A+' || signal.qualityGrade === 'A'));

  if (isPostPumpDump) fusionScore += 100000;

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
  const newsRep = signal.newsImpactReport || signal.newsIntelligence;
  const hasNewsCatalyst =
    Boolean(signal.newsCatalyst && signal.newsCatalyst.trim().length > 0) ||
    newsRep?.isConfirmedCatalyst === true ||
    (newsRep && typeof newsRep.impactScore === 'number' && newsRep.impactScore >= 60) ||
    signal.highImpactType === 'EARLY_CATALYST_SETUP' ||
    Boolean(oppReport?.detectedPatterns?.includes('CATALYST_ACCELERATION'));

  if (hasNewsCatalyst) fusionScore += 60000;

  // 5. BEST ENTRY TIMING (+40,000 pts)
  const isBestEntry =
    signal.entryStatus === 'ENTRY_NOW' ||
    signal.actionablePriority === 'ENTRY_NOW';

  if (isBestEntry) fusionScore += 40000;

  // 6. STRUCTURALLY JUSTIFIED 30–35%+ TP POTENTIAL (+20,000 pts)
  const targets = signal.targets || [];
  const genuineTargets = targets.filter(t => 
    t && typeof t.price === 'number' && t.price > 0 && t.status !== 'INVALIDATED' &&
    t.structuralBasis && t.structuralBasis !== 'NONE'
  );
  const upside = signal.opportunityPriority?.realisticUpsidePct || 0;
  const is30PctPlusStructurallyJustified =
    upside >= 30 &&
    (signal.riskRewardRatio || 0) >= 1.8 &&
    genuineTargets.length >= 2 &&
    pdIntel?.dumpRisk !== 'CRITICAL' &&
    oppReport?.postPumpDumpRisk !== 'CRITICAL';

  if (is30PctPlusStructurallyJustified) fusionScore += 20000;

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
 * Rank opportunities across the entire market based strictly on evidence quality,
 * independent of market cap (Phase 6.2 & Phase 18 Unified Fusion).
 * Strictly maintains ONE COIN = ONE CURRENT UNIFIED SIGNAL.
 */
export function rankMarketOpportunities(signals: Signal[]): OpportunityRanking {
  const telemetry = getMarketCoverageTelemetry();

  // Deduplicate: ensure ONE COIN = ONE CURRENT UNIFIED SIGNAL
  const uniqueSignalsMap = new Map<string, Signal>();
  for (const s of signals) {
    if (!uniqueSignalsMap.has(s.symbol) || (s.moonScore > (uniqueSignalsMap.get(s.symbol)?.moonScore || 0))) {
      uniqueSignalsMap.set(s.symbol, s);
    }
  }
  const uniqueSignals = Array.from(uniqueSignalsMap.values());

  // Attach priority score analysis to every signal
  const evaluatedSignals: Signal[] = uniqueSignals.map(sig => {
    const priorityAnalysis = calculateOpportunityPriorityScore(sig);
    const fusionScore = calculateUnifiedFusionScore(sig);
    return {
      ...sig,
      priorityScore: priorityAnalysis.priorityScore,
      rankingTier: priorityAnalysis.rankingTier,
      opportunityPriority: priorityAnalysis,
      unifiedFusionScore: fusionScore
    };
  });

  // Phase 18 Deterministic Unified Fusion sorting invariant:
  // 1. unifiedFusionScore descending
  // 2. priorityScore descending
  // 3. riskRewardRatio descending
  // 4. realisticUpsidePct descending
  // 5. moonScore descending
  // 6. createdAt descending
  evaluatedSignals.sort((a, b) => {
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

  // Assign 1-indexed priorityRank
  evaluatedSignals.forEach((sig, idx) => {
    sig.priorityRank = idx + 1;
    if (sig.opportunityPriority) {
      sig.opportunityPriority.priorityRank = idx + 1;
    }
  });

  const strongestAPlus = evaluatedSignals.filter(s => s.rankingTier === 'TIER_1_A_PLUS_ELITE');
  const strongestA = evaluatedSignals.filter(s => s.rankingTier === 'TIER_2_A_HIGH_CONVICTION');
  const earlyOpportunities = evaluatedSignals.filter(s => s.rankingTier === 'TIER_3_EARLY_OPPORTUNITY');
  const watchOpportunities = evaluatedSignals.filter(s => s.rankingTier === 'TIER_4_WATCH_RETEST' || s.rankingTier === 'TIER_5_WAIT_CHOP');

  return {
    strongestAPlus,
    strongestA,
    earlyOpportunities,
    watchOpportunities,
    topRankedOpportunities: evaluatedSignals,
    telemetry
  };
}
