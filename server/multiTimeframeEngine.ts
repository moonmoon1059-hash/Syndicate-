import { Candle } from './cryptoService';
import { calculateEMA, calculateRSI, calculateMACD, calculateATR, calculateRVOL, detectPatterns } from './technicalAnalysis';
import { detectTrendlines, TrendlineEvidence, evaluatePatternTrendlineConfluence, TrendlineConfluenceResult } from './trendlineEngine';
import { PatternDetectionResult } from './patternEngine';
import { DerivativesData } from './advancedMarketData';
import { ProcessedNews } from './newsIntelligenceEngine';

export type TimeframeRole = 'MACRO_TREND' | 'INTERMEDIATE_STRUCTURE' | 'SETUP_CONFIRMATION' | 'FINE_TIMING';
export type DirectionalBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNKNOWN';
export type SetupDecision = 'LONG' | 'SHORT' | 'WAIT';

export interface TimeframeTechnicalSnapshot {
  closePrice?: number;
  ema20: number;
  ema50: number;
  ema200?: number;
  isBullishEma: boolean;
  isBearishEma: boolean;
  rsi: number;
  macdHist: number;
  atr: number;
  rvol: number;
}

export interface MarketStructureEvidence {
  structure: 'HH_HL' | 'LH_LL' | 'BOS' | 'CHOCH' | 'SIDEWAYS' | 'UNKNOWN';
  bias: DirectionalBias;
  details: string;
}

export interface TimeframeEvidence {
  timeframe: '5m' | '15m' | '1h' | '4h' | '1d' | string;
  role: TimeframeRole;
  bias: DirectionalBias;
  confidence: number; // 0 - 100
  technicals: TimeframeTechnicalSnapshot;
  marketStructure: MarketStructureEvidence;
  pattern: PatternDetectionResult | null;
  trendline: TrendlineEvidence | null;
  patternTrendlineConfluence?: TrendlineConfluenceResult;
  evidenceList: string[];
}

export interface DerivativesEvidence {
  bias: DirectionalBias;
  fundingRate: number | null;
  fundingBias: DirectionalBias;
  openInterestChange24h: number | null;
  openInterestBias: DirectionalBias;
  longShortRatio: number | null;
  confidence: number;
  isMissing: boolean;
  evidenceList: string[];
}

export interface NewsEvidence {
  bias: DirectionalBias;
  impactScore: number;
  relevanceScore: number;
  matchedCount: number;
  isMissing: boolean;
  latestHeadlines: string[];
  evidenceList: string[];
}

export interface ConfluenceSummary {
  bullishScore: number; // Cumulative weighted points
  bearishScore: number;
  neutralScore: number;
  confluenceScore: number; // 0 - 100 normalized
  conflictDetected: boolean;
  conflictScore: number; // 0 - 100
  isLowerTfPullback: boolean;
  macroAligned: boolean;
  primaryDrivers: string[];
  conflictReasons: string[];
}

export interface UnifiedMarketEvidence {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  timestamp: number;
  currentPrice: number;
  timeframes: {
    '4h'?: TimeframeEvidence;
    '1h'?: TimeframeEvidence;
    '15m'?: TimeframeEvidence;
    '5m'?: TimeframeEvidence;
    [key: string]: TimeframeEvidence | undefined;
  };
  derivatives: DerivativesEvidence;
  news: NewsEvidence;
  confluence: ConfluenceSummary;
  overallBias: DirectionalBias;
  suggestedDecision: SetupDecision;
  moonScore: number;
  confidence: number;
  evidenceSummary: string[];
}

/**
 * Assigns analytical role per timeframe
 */
export function getTimeframeRole(timeframe: string): TimeframeRole {
  switch (timeframe.toLowerCase()) {
    case '4h':
    case '1d':
      return 'MACRO_TREND';
    case '1h':
      return 'INTERMEDIATE_STRUCTURE';
    case '15m':
      return 'SETUP_CONFIRMATION';
    case '5m':
    case '1m':
      return 'FINE_TIMING';
    default:
      return 'INTERMEDIATE_STRUCTURE';
  }
}

/**
 * Evaluates Market Structure (HH/HL, LH/LL, BOS, CHOCH) from candles
 */
export function evaluateMarketStructure(candles: Candle[]): MarketStructureEvidence {
  if (candles.length < 20) {
    return { structure: 'UNKNOWN', bias: 'UNKNOWN', details: 'Insufficient candles for market structure analysis' };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const len = candles.length;

  const recentHighs = [
    Math.max(...highs.slice(len - 30, len - 20)),
    Math.max(...highs.slice(len - 20, len - 10)),
    Math.max(...highs.slice(len - 10)),
  ];
  const recentLows = [
    Math.min(...lows.slice(len - 30, len - 20)),
    Math.min(...lows.slice(len - 20, len - 10)),
    Math.min(...lows.slice(len - 10)),
  ];

  const isHigherHighs = recentHighs[2] > recentHighs[1] && recentHighs[1] > recentHighs[0];
  const isHigherLows = recentLows[2] > recentLows[1] && recentLows[1] > recentLows[0];

  const isLowerHighs = recentHighs[2] < recentHighs[1] && recentHighs[1] < recentHighs[0];
  const isLowerLows = recentLows[2] < recentLows[1] && recentLows[1] < recentLows[0];

  // Break of Structure (BOS)
  const prevPeak = Math.max(...highs.slice(len - 25, len - 5));
  const prevValley = Math.min(...lows.slice(len - 25, len - 5));
  const latestClose = closes[len - 1];

  if (latestClose > prevPeak) {
    return { structure: 'BOS', bias: 'BULLISH', details: 'Bullish Break of Structure (BOS) above previous swing peak' };
  }
  if (latestClose < prevValley) {
    return { structure: 'BOS', bias: 'BEARISH', details: 'Bearish Break of Structure (BOS) below previous swing valley' };
  }

  // CHoCH (Change of Character)
  if (isHigherHighs && recentLows[2] < recentLows[1]) {
    return { structure: 'CHOCH', bias: 'BEARISH', details: 'Bearish Change of Character (CHoCH) breaking recent HL' };
  }
  if (isLowerLows && recentHighs[2] > recentHighs[1]) {
    return { structure: 'CHOCH', bias: 'BULLISH', details: 'Bullish Change of Character (CHoCH) breaking recent LH' };
  }

  if (isHigherHighs && isHigherLows) {
    return { structure: 'HH_HL', bias: 'BULLISH', details: 'Bullish market structure with consecutive Higher Highs & Higher Lows' };
  }
  if (isLowerHighs && isLowerLows) {
    return { structure: 'LH_LL', bias: 'BEARISH', details: 'Bearish market structure with consecutive Lower Highs & Lower Lows' };
  }

  return { structure: 'SIDEWAYS', bias: 'NEUTRAL', details: 'Rangebound market structure with mixed swing levels' };
}

/**
 * Builds individual timeframe evidence
 */
export function buildTimeframeEvidence(candles: Candle[], timeframe: string): TimeframeEvidence {
  const role = getTimeframeRole(timeframe);
  const evidenceList: string[] = [];

  if (!candles || candles.length < 20) {
    return {
      timeframe,
      role,
      bias: 'UNKNOWN',
      confidence: 0,
      technicals: {
        ema20: 0,
        ema50: 0,
        isBullishEma: false,
        isBearishEma: false,
        rsi: 50,
        macdHist: 0,
        atr: 0,
        rvol: 1.0,
      },
      marketStructure: { structure: 'UNKNOWN', bias: 'UNKNOWN', details: 'Missing candle data' },
      pattern: null,
      trendline: null,
      evidenceList: ['Insufficient candle data for timeframe'],
    };
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const len = candles.length;
  const latest = candles[len - 1];

  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema20 = ema20Arr[len - 1];
  const ema50 = ema50Arr[len - 1];
  const rsiArr = calculateRSI(closes, 14);
  const rsi = Number((rsiArr[len - 1] !== undefined ? rsiArr[len - 1] : 50).toFixed(1));
  const macdObj = calculateMACD(closes);
  const macdHist = macdObj.histogram[len - 1] || 0;
  const atrArr = calculateATR(candles, 14);
  const atr = atrArr[len - 1] || latest.close * 0.015;
  const rvol = calculateRVOL(volumes, 20);

  const isBullishEma = latest.close > ema20 && ema20 >= ema50;
  const isBearishEma = latest.close < ema20 && ema20 <= ema50;

  const marketStructure = evaluateMarketStructure(candles);
  const pattern = detectPatterns(candles, timeframe);
  const trendline = detectTrendlines(candles, timeframe);
  const ptConfluence = evaluatePatternTrendlineConfluence(
    pattern.detected ? (pattern as any) : null,
    trendline
  );

  // Directional scoring for this timeframe
  let bullPoints = 0;
  let bearPoints = 0;

  if (isBullishEma) {
    bullPoints += 25;
    evidenceList.push(`Price above rising 20/50 EMAs`);
  } else if (isBearishEma) {
    bearPoints += 25;
    evidenceList.push(`Price below declining 20/50 EMAs`);
  }

  if (rsi >= 50) {
    bullPoints += 20;
    evidenceList.push(`RSI (${rsi}) in bullish band`);
  } else {
    bearPoints += 20;
    evidenceList.push(`RSI (${rsi}) in bearish band`);
  }

  if (macdHist > 0) {
    bullPoints += 15;
  } else if (macdHist < 0) {
    bearPoints += 15;
  }

  if (marketStructure.bias === 'BULLISH') {
    bullPoints += 20;
    evidenceList.push(marketStructure.details);
  } else if (marketStructure.bias === 'BEARISH') {
    bearPoints += 20;
    evidenceList.push(marketStructure.details);
  }

  if (pattern && pattern.detected && pattern.breakoutStatus !== 'FAILED') {
    if (pattern.type === 'BULLISH') {
      bullPoints += 25;
      evidenceList.push(`Pattern: ${pattern.name} (${pattern.breakoutStatus})`);
    } else if (pattern.type === 'BEARISH') {
      bearPoints += 25;
      evidenceList.push(`Pattern: ${pattern.name} (${pattern.breakoutStatus})`);
    }
  }

  if (trendline && trendline.detected) {
    if (trendline.direction === 'BULLISH' || (trendline.type === 'RESISTANCE' && trendline.breakoutStatus === 'CONFIRMED')) {
      bullPoints += 20;
      evidenceList.push(`Trendline: ${trendline.touchCount}-touch ${trendline.type} (${trendline.breakoutStatus})`);
    } else if (trendline.direction === 'BEARISH' || (trendline.type === 'SUPPORT' && trendline.breakoutStatus === 'CONFIRMED')) {
      bearPoints += 20;
      evidenceList.push(`Trendline: ${trendline.touchCount}-touch ${trendline.type} (${trendline.breakoutStatus})`);
    }
  }

  if (ptConfluence.hasConfluence) {
    if (ptConfluence.scoreBonus > 0) {
      if (bullPoints > bearPoints) bullPoints += ptConfluence.scoreBonus;
      else bearPoints += ptConfluence.scoreBonus;
      evidenceList.push(...ptConfluence.notes);
    }
  } else if (ptConfluence.confluenceType === 'CONFLICT') {
    evidenceList.push(...ptConfluence.notes);
  }

  let bias: DirectionalBias = 'NEUTRAL';
  let confidence = 50;

  if (bullPoints > bearPoints + 20) {
    bias = 'BULLISH';
    confidence = Math.min(95, Math.round(50 + bullPoints * 0.4));
  } else if (bearPoints > bullPoints + 20) {
    bias = 'BEARISH';
    confidence = Math.min(95, Math.round(50 + bearPoints * 0.4));
  } else {
    bias = 'NEUTRAL';
    confidence = 50;
  }

  return {
    timeframe,
    role,
    bias,
    confidence,
    technicals: {
      closePrice: candles.length > 0 ? candles[candles.length - 1].close : 0,
      ema20: Number(ema20.toFixed(4)),
      ema50: Number(ema50.toFixed(4)),
      isBullishEma,
      isBearishEma,
      rsi,
      macdHist: Number(macdHist.toFixed(4)),
      atr: Number(atr.toFixed(4)),
      rvol,
    },
    marketStructure,
    pattern: pattern.detected ? (pattern as any) : null,
    trendline,
    patternTrendlineConfluence: ptConfluence,
    evidenceList,
  };
}

/**
 * Builds Derivatives Evidence with explicit missing-data handling
 */
export function buildDerivativesEvidence(derivatives?: DerivativesData | null): DerivativesEvidence {
  if (!derivatives || derivatives.fundingRate === undefined) {
    return {
      bias: 'UNKNOWN',
      fundingRate: null,
      fundingBias: 'UNKNOWN',
      openInterestChange24h: null,
      openInterestBias: 'UNKNOWN',
      longShortRatio: null,
      confidence: 0,
      isMissing: true,
      evidenceList: ['Derivatives metrics unavailable (UNKNOWN)'],
    };
  }

  const evidenceList: string[] = [];
  let fundingBias: DirectionalBias = 'NEUTRAL';
  if (derivatives.fundingRate > 0.0003) {
    fundingBias = 'BEARISH'; // High positive funding -> overheated longs
    evidenceList.push(`Elevated funding rate (${(derivatives.fundingRate * 100).toFixed(4)}%) indicates long-crowding`);
  } else if (derivatives.fundingRate < -0.0001) {
    fundingBias = 'BULLISH'; // Negative funding -> short squeeze potential
    evidenceList.push(`Negative funding rate (${(derivatives.fundingRate * 100).toFixed(4)}%) favors short squeeze`);
  } else {
    fundingBias = 'NEUTRAL';
    evidenceList.push(`Balanced funding rate (${(derivatives.fundingRate * 100).toFixed(4)}%)`);
  }

  let oiBias: DirectionalBias = 'NEUTRAL';
  if (derivatives.openInterestChange24h > 3.0) {
    oiBias = 'BULLISH';
    evidenceList.push(`Open Interest expanding (+${derivatives.openInterestChange24h}%)`);
  } else if (derivatives.openInterestChange24h < -3.0) {
    oiBias = 'BEARISH';
    evidenceList.push(`Open Interest contracting (${derivatives.openInterestChange24h}%)`);
  }

  let overallBias: DirectionalBias = 'NEUTRAL';
  if (fundingBias === 'BULLISH' || oiBias === 'BULLISH') overallBias = 'BULLISH';
  else if (fundingBias === 'BEARISH' || oiBias === 'BEARISH') overallBias = 'BEARISH';

  return {
    bias: overallBias,
    fundingRate: derivatives.fundingRate,
    fundingBias,
    openInterestChange24h: derivatives.openInterestChange24h,
    openInterestBias: oiBias,
    longShortRatio: derivatives.longShortRatio || 1.0,
    confidence: 75,
    isMissing: false,
    evidenceList,
  };
}

/**
 * Builds News Evidence with explicit missing-data handling
 */
export function buildNewsEvidence(newsList?: ProcessedNews[] | null, baseAsset: string = 'BTC'): NewsEvidence {
  if (!newsList || newsList.length === 0) {
    return {
      bias: 'UNKNOWN',
      impactScore: 0,
      relevanceScore: 0,
      matchedCount: 0,
      isMissing: true,
      latestHeadlines: [],
      evidenceList: ['No recent news catalyst detected (UNKNOWN)'],
    };
  }

  const cleanCoin = baseAsset.toUpperCase();
  const relevant = newsList.filter((n: any) => {
    const coins: string[] = n.relatedCoins || n.entities || [];
    return coins.includes(cleanCoin) || n.primaryCoin === cleanCoin || (coins.length === 0 && cleanCoin === 'BTC');
  });

  if (relevant.length === 0) {
    return {
      bias: 'UNKNOWN',
      impactScore: 0,
      relevanceScore: 0,
      matchedCount: 0,
      isMissing: true,
      latestHeadlines: [],
      evidenceList: [`No specific news matching ${cleanCoin} (UNKNOWN)`],
    };
  }

  let bullCount = 0;
  let bearCount = 0;
  let maxImpact = 0;
  const headlines: string[] = [];
  const evidenceList: string[] = [];

  for (const n of relevant.slice(0, 5)) {
    const title = (n as any).headline || (n as any).title || '';
    headlines.push(title);
    const sent = (n as any).sentiment || (n as any).sentimentLabel;
    const score = (n as any).sentimentScore;
    
    if (sent === 'BULLISH' || sent === 'POSITIVE' || (typeof score === 'number' && score > 0.2)) bullCount++;
    else if (sent === 'BEARISH' || sent === 'NEGATIVE' || (typeof score === 'number' && score < -0.2)) bearCount++;
    
    if (n.impactScore > maxImpact) maxImpact = n.impactScore;

    if (n.marketReaction?.isContradicted) {
      evidenceList.push(`Contradiction warning: ${title} (${sent}) contradicted by price action`);
    } else if (n.marketReaction?.state === 'CONFIRMED') {
      evidenceList.push(`Market confirmed catalyst: ${title} (Price reaction positive)`);
    } else if (n.isVerified === false) {
      evidenceList.push(`Unverified catalyst: ${title} (marked UNVERIFIED)`);
    }
  }

  let bias: DirectionalBias = 'NEUTRAL';
  if (bullCount > bearCount) bias = 'BULLISH';
  else if (bearCount > bullCount) bias = 'BEARISH';

  evidenceList.unshift(`${relevant.length} relevant news items; sentiment: ${bias} (Impact: ${maxImpact}/100)`);

  return {
    bias,
    impactScore: maxImpact,
    relevanceScore: Math.min(100, relevant.length * 30),
    matchedCount: relevant.length,
    isMissing: false,
    latestHeadlines: headlines,
    evidenceList,
  };
}

/**
 * Step 10 & 11: Unified Evidence Fusion Engine
 * Fuses 4H, 1H, 15M, 5M timeframes, patterns, trendlines, technicals, derivatives, and news into ONE market setup.
 */
export function fuseMarketEvidence(
  symbol: string,
  timeframeCandles: {
    '4h'?: Candle[];
    '1h'?: Candle[];
    '30m'?: Candle[];
    '15m'?: Candle[];
    '5m'?: Candle[];
    [key: string]: Candle[] | undefined;
  },
  derivativesData?: DerivativesData | null,
  newsList?: ProcessedNews[] | null
): UnifiedMarketEvidence {
  const cleanSymbol = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const baseAsset = cleanSymbol.replace('USDT', '');
  const quoteAsset = 'USDT';

  const timeframesEvidence: Record<string, TimeframeEvidence> = {};

  // Build evidence for each available timeframe
  for (const [tf, candles] of Object.entries(timeframeCandles)) {
    if (candles && candles.length > 0) {
      timeframesEvidence[tf] = buildTimeframeEvidence(candles, tf);
    }
  }

  // Primary signal generation is anchored on 1H (market structure), falling back to 4H or 15m/30m. 5M is strictly an entry trigger, never primary!
  const primaryCandles = timeframeCandles['1h'] || timeframeCandles['30m'] || timeframeCandles['15m'] || timeframeCandles['4h'] || Object.values(timeframeCandles)[0];
  const latestCandle = primaryCandles && primaryCandles.length > 0 ? primaryCandles[primaryCandles.length - 1] : undefined;
  const primaryTfEvidence = timeframesEvidence['1h'] || timeframesEvidence['30m'] || timeframesEvidence['15m'] || timeframesEvidence['4h'] || Object.values(timeframesEvidence)[0];
  const currentPrice = latestCandle ? latestCandle.close : (primaryTfEvidence?.technicals?.closePrice || 0);

  const derivatives = buildDerivativesEvidence(derivativesData);
  const news = buildNewsEvidence(newsList, baseAsset);

  // Timeframe Confluence & Conflict Evaluation (Phase 18 Fixed Timeframe Architecture):
  // 4H: Macro trend/cycle/context (35%)
  // 1H: Primary signal/market structure (30%)
  // 30M: Setup + confirmation (20%)
  // 15M: Entry refinement/retest (15%)
  // 5M: Optional entry trigger only (10%)
  const tfWeights: Record<string, number> = {
    '4h': 35,
    '1h': 30,
    '30m': 20,
    '15m': 15,
    '5m': 10,
  };

  let totalBullPoints = 0;
  let totalBearPoints = 0;
  let totalNeutralPoints = 0;
  let totalWeight = 0;

  const primaryDrivers: string[] = [];
  const conflictReasons: string[] = [];

  let alignedCount = 0;
  let conflictingCount = 0;

  for (const [tf, ev] of Object.entries(timeframesEvidence)) {
    const weight = tfWeights[tf] || 20;
    totalWeight += weight;

    if (ev.bias === 'BULLISH') {
      totalBullPoints += (ev.confidence / 100) * weight;
      alignedCount++;
      primaryDrivers.push(`${tf.toUpperCase()} Bullish (${ev.marketStructure.structure})`);
    } else if (ev.bias === 'BEARISH') {
      totalBearPoints += (ev.confidence / 100) * weight;
      conflictingCount++;
      primaryDrivers.push(`${tf.toUpperCase()} Bearish (${ev.marketStructure.structure})`);
    } else {
      totalNeutralPoints += weight * 0.5;
    }
  }

  // Weight derivatives & news
  if (!derivatives.isMissing) {
    if (derivatives.bias === 'BULLISH') totalBullPoints += 10;
    else if (derivatives.bias === 'BEARISH') totalBearPoints += 10;
  }
  if (!news.isMissing && news.bias !== 'UNKNOWN') {
    if (news.bias === 'BULLISH') totalBullPoints += (news.impactScore / 100) * 8;
    else if (news.bias === 'BEARISH') totalBearPoints += (news.impactScore / 100) * 8;
  }

  // Detect Higher vs Lower Timeframe Conflict (e.g. 4H/1H Bullish, 5M Bearish)
  const macroEv = timeframesEvidence['4h'] || timeframesEvidence['1h'];
  const microEv = timeframesEvidence['5m'] || timeframesEvidence['15m'];

  let isLowerTfPullback = false;
  let conflictDetected = false;
  let conflictScore = 0;

  if (macroEv && microEv) {
    if (macroEv.bias === 'BULLISH' && microEv.bias === 'BEARISH') {
      isLowerTfPullback = true;
      conflictDetected = true;
      conflictScore = 35;
      conflictReasons.push(`Lower timeframe (${microEv.timeframe}) pullback against macro (${macroEv.timeframe}) uptrend`);
    } else if (macroEv.bias === 'BEARISH' && microEv.bias === 'BULLISH') {
      isLowerTfPullback = true;
      conflictDetected = true;
      conflictScore = 35;
      conflictReasons.push(`Lower timeframe (${microEv.timeframe}) counter-trend bounce against macro downtrend`);
    }
  }

  if (totalBullPoints > 15 && totalBearPoints > 15 && !isLowerTfPullback) {
    conflictDetected = true;
    conflictScore = Math.round((Math.min(totalBullPoints, totalBearPoints) / Math.max(totalBullPoints, totalBearPoints)) * 60);
    conflictReasons.push(`Multi-timeframe directional divergence across analytical layers`);
  }

  // Calculate Unified MoonScore (0 - 100)
  const netAdvantage = Math.abs(totalBullPoints - totalBearPoints);
  let rawScore = 50 + netAdvantage * 0.75;
  if (conflictDetected && !isLowerTfPullback) rawScore -= conflictScore * 0.3;
  const moonScore = Math.min(98, Math.max(40, Math.round(rawScore)));

  // Determine Overall Bias & Unified Decision with Macro 4H Regime Discipline
  let overallBias: DirectionalBias = 'NEUTRAL';
  let suggestedDecision: SetupDecision = 'WAIT';

  const fourHourEv = timeframesEvidence['4h'];
  const oneHourEv = timeframesEvidence['1h'];

  if (totalBullPoints > totalBearPoints + 15) {
    // Strict Macro Rule: Cannot initiate high-conviction LONG directly into a strongly BEARISH 4H macro regime
    if (fourHourEv && fourHourEv.bias === 'BEARISH' && fourHourEv.confidence >= 65) {
      overallBias = 'NEUTRAL';
      suggestedDecision = 'WAIT';
      conflictReasons.push('Macro 4H structure is strongly BEARISH; Long counter-trend setup vetoed');
    } else {
      overallBias = 'BULLISH';
      suggestedDecision = (moonScore >= 68 && conflictScore < 40) ? 'LONG' : 'WAIT';
    }
  } else if (totalBearPoints > totalBullPoints + 15) {
    // Strict Macro Rule: Cannot initiate high-conviction SHORT directly into a strongly BULLISH 4H macro regime
    if (fourHourEv && fourHourEv.bias === 'BULLISH' && fourHourEv.confidence >= 65) {
      overallBias = 'NEUTRAL';
      suggestedDecision = 'WAIT';
      conflictReasons.push('Macro 4H structure is strongly BULLISH; Short counter-trend setup vetoed');
    } else {
      overallBias = 'BEARISH';
      suggestedDecision = (moonScore >= 68 && conflictScore < 40) ? 'SHORT' : 'WAIT';
    }
  } else {
    overallBias = 'NEUTRAL';
    suggestedDecision = 'WAIT';
  }

  const evidenceSummary: string[] = [
    `Unified ${overallBias} bias with MoonScore ${moonScore}/100 across ${Object.keys(timeframesEvidence).length} timeframes`,
  ];
  if (isLowerTfPullback) {
    evidenceSummary.push(`Lower timeframe pullback identified as high-probability entry context`);
  }
  if (conflictDetected && conflictReasons.length > 0) {
    evidenceSummary.push(...conflictReasons);
  }

  return {
    symbol: `${baseAsset}/${quoteAsset}`,
    baseAsset,
    quoteAsset,
    timestamp: Date.now(),
    currentPrice,
    timeframes: timeframesEvidence,
    derivatives,
    news,
    confluence: {
      bullishScore: Number(totalBullPoints.toFixed(1)),
      bearishScore: Number(totalBearPoints.toFixed(1)),
      neutralScore: Number(totalNeutralPoints.toFixed(1)),
      confluenceScore: Math.round(rawScore),
      conflictDetected,
      conflictScore,
      isLowerTfPullback,
      macroAligned: macroEv ? macroEv.bias === overallBias : true,
      primaryDrivers,
      conflictReasons,
    },
    overallBias,
    suggestedDecision,
    moonScore,
    confidence: moonScore,
    evidenceSummary,
  };
}
