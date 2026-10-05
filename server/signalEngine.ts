import { getKlines, get24hTicker, MONITORED_SYMBOLS, Candle } from './cryptoService';
import { isBinanceOnlyMode } from './liveDataProvider';
import { calculateEMA, calculateRSI, calculateMACD, calculateATR, calculateRVOL, detectPatterns, calculateVolumeProfile } from './technicalAnalysis';
import { getDerivativesData, DerivativesData } from './advancedMarketData';
import { getProcessedNewsIntelligence, ProcessedNews, evaluateNewsMarketImpact } from './newsIntelligenceEngine';
import { evaluateNewListingIntelligence } from './newListingEngine';
import { evaluateLargeMoveOpportunity } from './largeMoveOpportunityEngine';
import { evaluateUnifiedFusion } from './unifiedFusionEngine';
import { detectTrendlines, evaluatePatternTrendlineConfluence, TrendlineEvidence } from './trendlineEngine';
import {
  fuseMarketEvidence,
  buildTimeframeEvidence,
  UnifiedMarketEvidence,
  DirectionalBias,
  SetupDecision
} from './multiTimeframeEngine';
import { evaluateMarketWithCoreIntelligence } from './coreIntelligenceEngine';
import {
  SignalQualityGrade,
  ActionablePriority,
  TimeFrame,
  SignalDirection,
  SignalStatus,
  MarketCategory,
  OpportunityDiscoveryReport,
  CoinAnalysisReport,
  TradeabilitySummary,
  DataFeedStatus,
  NewsItem,
  LiquidityZone,
  LiquidityZoneType,
  MarketRegimeType,
  OpportunityRankingTier,
  MajorMoveClassification
} from '../src/types/crypto';
import {
  discoverUniversalMarket,
  getAssetCategory,
  resolveSymbolFromQuery,
  runBoundedParallelScan,
  updateScanCoverageTelemetry,
  getMarketCoverageTelemetry
} from './marketUniverseService';
import {
  evaluateOpportunityDiscovery,
  calculateOpportunityPriorityScore,
  rankMarketOpportunities
} from './opportunityDiscoveryEngine';
import { determineCurrentMarketStructure } from './currentStructureEngine';
import { upsertSignals, getStoredSignalBySymbol, invalidateStoredSignal } from './signalTracker';
import { analyzeMarketRegime } from './marketRegimeEngine';
import { analyzeSectorRotation, AssetMarketSnapshot } from './sectorRotationEngine';
import { evaluatePredictiveOpportunity } from './predictiveOpportunityEngine';
import { evaluatePreMoveOpportunity, qualifyAndBuildPreMoveSignal, checkAndUpdateExistingPreMoveSignal, storeAuthoritativePreMoveSignal, removeAuthoritativePreMoveSignal } from './preMoveEngine';
import { preMoveDiagnostics } from './preMoveDiagnostics';
import { PreMoveReport } from '../src/types/crypto';
import { qualifyMajorMoveOpportunity } from './telegramAlertEngine';
import { evaluateSmartRiskAndTradeManagement } from './smartRiskEngine';
import { evaluatePrimarySetupCategory } from './categoryIntelligenceEngine';
import { generateDynamicTargets } from './tradeManagementEngine';
import {
  evaluateBigMoveHunter,
  evaluateDumpHunter,
  evaluateUnifiedExceptionalOpportunity
} from './exceptionalOpportunityEngine';

export type { TimeFrame, SignalDirection, SignalStatus };
export {
  rankMarketOpportunities,
  calculateOpportunityPriorityScore,
  discoverUniversalMarket,
  getMarketCoverageTelemetry,
  analyzeMarketRegime,
  analyzeSectorRotation,
  evaluatePredictiveOpportunity,
  evaluateSmartRiskAndTradeManagement
};

export interface TargetLevel {
  id: 'TP1' | 'TP2' | 'TP3' | string;
  label: string;
  price: number;
  percentage?: number;
  hit?: boolean;
  hitTime?: number;
  rMultiple?: number;
  evidenceLevel?: string;
  confidence?: any;
  sources?: string[];
  structuralBasis?: string;
  status?: any;
  invalidationReason?: string;
  isClustered?: boolean;
  confluentCount?: number;
}

export interface ConfluenceItem {
  id: string;
  category: 'TREND' | 'MOMENTUM' | 'VOLUME' | 'PATTERN' | 'DERIVATIVES' | 'NEWS';
  name: string;
  status: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number;
  weight: number;
  description: string;
}

export interface Signal {
  id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  direction: SignalDirection;
  timeframe: TimeFrame;
  status: SignalStatus;
  moonScore: number;
  confidence: number;
  
  entryPrice: number;
  entryZoneLow?: number;
  entryZoneHigh?: number;
  stopLoss: number;
  
  // Canonical Target Collection (Task 2 & 3: Single Source of Truth)
  targets: TargetLevel[];
  
  // Backward-compatibility scalar fields
  tp1: number;
  tp2: number;
  tp3: number;
  
  riskRewardRatio: number;
  currentPrice: number;
  priceChange24h: number;
  volume24h?: number;
  
  pattern?: string;
  trendlineAngle?: number;
  trendlineDescription?: string;
  marketStructure?: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'BOS' | 'CHOCH';
  rsi?: number;
  macdSignal?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confluences: ConfluenceItem[];
  
  openInterestChange24h?: number;
  fundingRate?: number;
  
  timestamp: number;
  createdAt: number;
  expiresAt: number;
  triggeredAt?: number;
  closedAt?: number;
  
  newsCatalyst?: string;
  notes?: string;

  // Phase 5.5 Universal Market Coverage & Opportunity Discovery
  category?: MarketCategory;
  opportunityReport?: OpportunityDiscoveryReport;
  opportunityScore?: number;
  rankingBucket?: 'STRONGEST_A_PLUS' | 'STRONGEST_A' | 'EARLY_OPPORTUNITY' | 'WATCH_OPPORTUNITY' | 'WAIT';

  // Phase 3, 4 & 4.5 additions
  qualityGrade?: SignalQualityGrade;
  actionablePriority?: ActionablePriority;
  whyTrade?: string[];
  whyNotPerfect?: string[];
  keyRisk?: string;
  entryReason?: string;
  invalidationReason?: string;
  longCase?: any;
  shortCase?: any;
  adversarialAudit?: any;
  liquidityAnalysis?: any;
  breakoutEvaluation?: any;
  marketRegime?: any;
  dataQuality?: any;
  entryStatus?: any;
  tradeWindow?: any;
  confirmations?: string[];
  conflicts?: string[];
  unknowns?: string[];
  explanation?: string;
  adaptiveExecution?: any;
  tradeManagement?: any;
  coreIntelligence?: any;
  unifiedEvidence?: UnifiedMarketEvidence;
  
  // Phase 8: Predictive Opportunity & Market Regime Intelligence
  marketRegimeAnalysis?: any;
  earlyMoveReport?: any;
  sectorRotationAnalysis?: any;
  crossAssetConfirmation?: any;
  smartEntryTiming?: any;

  // Phase 9: Smart Risk + Trade Management
  smartRiskReport?: any;

  // Phase 10: Market Cycle + Wyckoff Intelligence
  marketCycle?: any;

  // Phase 11: Early Setup + Timing Intelligence
  setupMaturity?: any;
  timingWindow?: any;
  setupAge?: string;
  triggerCondition?: string;
  whyEarlySetupMatters?: string;
  earlySetupTiming?: any;

  // Phase 12: Long/Short Primary Setup Category Intelligence
  primaryCategory?: any;
  previousCategory?: any;
  categoryTransitionHistory?: any[];
  categoryConfluences?: any[];
  categoryIntelligence?: any;
  categoryReasoning?: string;

  // Phase 13: News Intelligence 2.0
  newsImpactReport?: any;
  newsIntelligence?: any;

  // Phase 14: New Listing Intelligence
  newListingIntelligence?: any;

  // Phase 15: Large Move + Asymmetric Opportunity Intelligence
  largeMoveIntelligence?: any;

  // Phase 16: Unified Intelligence Fusion
  unifiedFusion?: any;
  unifiedFusionScore?: number;
  priorityScore?: number;
  rankingTier?: OpportunityRankingTier;
  opportunityPriority?: any;

  // Signal Lifecycle Tracking
  entryTriggeredAt?: number;
  activeDurationMs?: number;
  finalState?: SignalStatus;

  // Pre-Move Intelligence
  preMoveReport?: any;
  preMoveIntelligence?: any;

  // Anti-Chase & Major Move fields
  chaseRisk?: boolean;
  antiChaseActive?: boolean;
  pumpDumpIntelligence?: any;
  majorMoveClass?: MajorMoveClassification;
  majorMovePotentialPct?: number;
  majorMoveNotes?: string[];
}

export function calculateActionablePriority(
  decision: string,
  qualityGrade: SignalQualityGrade,
  entryStatus?: string,
  status?: string
): ActionablePriority {
  if (status === 'STOPPED_OUT' || status === 'EXPIRED' || status === 'CANCELLED' || entryStatus === 'INVALIDATED' || entryStatus === 'INVALID') {
    return 'INVALIDATED_EXPIRED';
  }
  if (decision === 'WAIT' || qualityGrade === 'WAIT') {
    return 'WAIT';
  }
  if (entryStatus === 'ENTRY_NOW' && (qualityGrade === 'A+' || qualityGrade === 'A' || qualityGrade === 'B')) {
    return 'ENTRY_NOW';
  }
  if (qualityGrade === 'A+' || qualityGrade === 'A') {
    return 'HIGH_PRIORITY';
  }
  if (qualityGrade === 'B' || entryStatus === 'WAIT_FOR_PULLBACK' || entryStatus === 'WAIT_FOR_RETEST' || entryStatus === 'WAIT_FOR_CONFIRMATION') {
    return 'WATCH';
  }
  if (qualityGrade === 'C' || entryStatus === 'ENTRY_MISSED') {
    return 'WAIT';
  }
  return 'WAIT';
}

export {
  detectTrendlines,
  evaluatePatternTrendlineConfluence,
  fuseMarketEvidence,
  buildTimeframeEvidence,
  type TrendlineEvidence,
  type UnifiedMarketEvidence,
  type DirectionalBias,
  type SetupDecision
};

/**
 * Deterministic Signal ID Generator (TASK 6 & TASK 7)
 * Formula: Symbol + Timeframe + Direction + Pattern + BucketedCandleTimestamp
 * Guarantees that scanner cycles processing the same ongoing setup yield the exact same stable ID.
 */
export function generateDeterministicSignalId(
  symbol: string,
  timeframe: string,
  direction: string,
  pattern?: string,
  timestamp?: number
): string {
  const cleanSym = (symbol || 'BTCUSDT').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const cleanTf = (timeframe || '1h').toLowerCase();
  const cleanDir = (direction || 'LONG').toUpperCase();
  const cleanPat = (pattern || 'MOMENTUM').toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Bucket timestamp by timeframe interval (e.g. 15m = 900,000ms, 1h = 3,600,000ms)
  const intervalMsMap: Record<string, number> = {
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
  };
  const intervalMs = intervalMsMap[cleanTf] || 60 * 60 * 1000;
  const validTime = (timestamp && timestamp > 0) ? timestamp : Date.now();
  const bucketedTime = Math.floor(validTime / intervalMs) * intervalMs;
  
  return `sig_${cleanSym}_${cleanTf}_${cleanDir}_${cleanPat}_${bucketedTime}`;
}

/**
 * Enforces strict mathematical directional targets and risk invariants:
 * - For SHORT setups (e.g. ARUSDT SHORT): all Take Profits (TP1, TP2, TP3, TP4) MUST be mathematically LOWER than Entry price,
 *   and Stop Loss must be HIGHER than Entry.
 *   targetPrice = entryPrice - Math.abs(delta); StopLoss = entryPrice + Math.abs(riskDistance)
 * - For LONG setups: all Take Profits (TP1, TP2, TP3, TP4) MUST be mathematically HIGHER than Entry price,
 *   and Stop Loss must be LOWER than Entry.
 *   targetPrice = entryPrice + Math.abs(delta); StopLoss = entryPrice - Math.abs(riskDistance)
 * - Invalidate any signal where SHORT TP >= Entry or LONG TP <= Entry, or StopLoss is inverted.
 */
export function enforceDirectionalRiskAndTargets(signal: Signal, priceDecimals: number = 2): boolean {
  if (!signal || !signal.entryPrice || signal.entryPrice <= 0) return false;
  const isShort = signal.direction === 'SHORT';
  const entry = signal.entryPrice;

  const rawStop = typeof signal.stopLoss === 'number' && Number.isFinite(signal.stopLoss) ? signal.stopLoss : 0;
  const riskDist = Math.abs(entry - rawStop);
  const effectiveRisk = riskDist > 0 ? riskDist : entry * 0.015;

  // 1. Math Stop Loss
  // For SHORT: StopLoss = entryPrice + Math.abs(riskDistance)
  // For LONG: StopLoss = entryPrice - Math.abs(riskDistance)
  if (isShort) {
    signal.stopLoss = Number((entry + Math.abs(effectiveRisk)).toFixed(priceDecimals));
  } else {
    signal.stopLoss = Number((Math.max(0.000001, entry - Math.abs(effectiveRisk))).toFixed(priceDecimals));
  }

  // 2. Math Take Profits (TP1, TP2, TP3, TP4)
  // Ensure default progression satisfies strict 1:2.0+ institutional minimum
  const defaultRMultipliers = [2.0, 3.5, 5.0, 7.0];
  const rawTargets = Array.isArray(signal.targets) ? signal.targets : [];
  const processedTargets: TargetLevel[] = [];

  for (let i = 0; i < rawTargets.length; i++) {
    const t = rawTargets[i];
    if (typeof t.price !== 'number' || !Number.isFinite(t.price) || t.price <= 0) continue;

    let delta = Math.abs(t.price - entry);
    if (delta <= 0) {
      delta = effectiveRisk * (defaultRMultipliers[i] || (2.0 + i * 1.5));
    }

    const cleanPrice = isShort
      ? Number(Math.max(0.000001, entry - Math.abs(delta)).toFixed(priceDecimals))
      : Number((entry + Math.abs(delta)).toFixed(priceDecimals));

    processedTargets.push({
      ...t,
      price: cleanPrice,
      percentage: Number((((Math.abs(cleanPrice - entry)) / entry) * 100).toFixed(2)),
      rMultiple: Number((Math.abs(cleanPrice - entry) / effectiveRisk).toFixed(1))
    });
  }

  // Sort: For LONG ascending (TP1 < TP2 < TP3 < TP4), For SHORT descending (TP1 > TP2 > TP3 > TP4)
  processedTargets.sort((a, b) => isShort ? b.price - a.price : a.price - b.price);

  // Fill up to 4 targets if fewer
  while (processedTargets.length < 4) {
    const idx = processedTargets.length;
    const rMult = defaultRMultipliers[idx] || (2.0 + idx * 1.5);
    const delta = effectiveRisk * rMult;
    const cleanPrice = isShort
      ? Number(Math.max(0.000001, entry - Math.abs(delta)).toFixed(priceDecimals))
      : Number((entry + Math.abs(delta)).toFixed(priceDecimals));
    const label = `TP${idx + 1}`;
    processedTargets.push({
      id: label,
      label,
      price: cleanPrice,
      percentage: Number((((Math.abs(cleanPrice - entry)) / entry) * 100).toFixed(2)),
      rMultiple: Number(rMult.toFixed(1)),
      hit: false,
      status: 'ACTIVE'
    });
  }

  // Final 4 targets labeled TP1, TP2, TP3, TP4
  processedTargets.sort((a, b) => isShort ? b.price - a.price : a.price - b.price);
  signal.targets = processedTargets.slice(0, 4).map((t, idx) => ({
    ...t,
    id: `TP${idx + 1}`,
    label: `TP${idx + 1}`,
    percentage: Number((((Math.abs(t.price - entry)) / entry) * 100).toFixed(2)),
    rMultiple: Number((Math.abs(t.price - entry) / effectiveRisk).toFixed(1))
  }));

  // Invalidate any signal where SHORT TP >= Entry or LONG TP <= Entry
  for (const t of signal.targets) {
    if (isShort && t.price >= entry) {
      signal.status = 'INVALIDATED';
      signal.actionablePriority = 'INVALIDATED_EXPIRED';
      signal.invalidationReason = `SHORT_TARGET_INVERSION: TP ${t.price} >= Entry ${entry}`;
      return false;
    }
    if (!isShort && t.price <= entry) {
      signal.status = 'INVALIDATED';
      signal.actionablePriority = 'INVALIDATED_EXPIRED';
      signal.invalidationReason = `LONG_TARGET_INVERSION: TP ${t.price} <= Entry ${entry}`;
      return false;
    }
  }

  // Invalidate any signal where Stop Loss is inverted
  if (isShort && signal.stopLoss <= entry) {
    signal.status = 'INVALIDATED';
    signal.actionablePriority = 'INVALIDATED_EXPIRED';
    signal.invalidationReason = `SHORT_SL_INVERSION: StopLoss ${signal.stopLoss} <= Entry ${entry}`;
    return false;
  }
  if (!isShort && signal.stopLoss >= entry) {
    signal.status = 'INVALIDATED';
    signal.actionablePriority = 'INVALIDATED_EXPIRED';
    signal.invalidationReason = `LONG_SL_INVERSION: StopLoss ${signal.stopLoss} >= Entry ${entry}`;
    return false;
  }

  signal.tp1 = signal.targets[0].price;
  signal.tp2 = signal.targets[1].price;
  signal.tp3 = signal.targets[2].price;
  (signal as any).tp4 = signal.targets[3].price;

  const reward = Math.abs(signal.targets[0].price - entry);
  signal.riskRewardRatio = Number((reward / effectiveRisk).toFixed(1));

  // HARD GATE: Strict 1:2.0+ R:R Firewall
  // (e.g. GUSDT showing 1:1.9 in preview MUST be rejected!)
  if (signal.riskRewardRatio < 2.0) {
    signal.status = 'INVALIDATED';
    signal.actionablePriority = 'INVALIDATED_EXPIRED';
    signal.invalidationReason = `INSUFFICIENT_RR: Calculated R:R 1:${signal.riskRewardRatio} is strictly below institutional 1:2.0 threshold`;
    return false;
  }

  return true;
}

/**
 * Generate Idempotent Canonical Take-Profit Targets (TASK 2 & TASK 3)
 */
export function generateCanonicalTargets(
  entry: number,
  stopLoss: number,
  direction: SignalDirection,
  priceDecimals: number = 2
): { targets: TargetLevel[]; tp1: number; tp2: number; tp3: number; tp4?: number; riskRewardRatio: number } {
  const isLong = direction === 'LONG';
  const risk = Math.abs(entry - stopLoss);
  const effectiveRisk = risk > 0 ? risk : entry * 0.015;

  const initialSL = isLong
    ? Number((entry - Math.abs(effectiveRisk)).toFixed(priceDecimals))
    : Number((entry + Math.abs(effectiveRisk)).toFixed(priceDecimals));

  // Delegate directly to the authoritative single dynamic target generator
  const dynamic = generateDynamicTargets({
    entryPrice: entry,
    stopLoss: initialSL,
    direction: isLong ? 'LONG' : 'SHORT',
    atr: effectiveRisk,
    priceDecimals: priceDecimals,
    explicitTargetCount: 4
  });

  const tempSig: Partial<Signal> = {
    entryPrice: entry,
    stopLoss: initialSL,
    direction,
    targets: dynamic.targets
  };

  enforceDirectionalRiskAndTargets(tempSig as Signal, priceDecimals);

  return {
    targets: tempSig.targets || [],
    tp1: tempSig.tp1 || 0,
    tp2: tempSig.tp2 || 0,
    tp3: tempSig.tp3 || 0,
    tp4: (tempSig as any).tp4 || 0,
    riskRewardRatio: tempSig.riskRewardRatio || 2.0
  };
}

/**
 * Scan cryptocurrency pairs and generate trading signals with Unified Multi-Timeframe & Trendline confluence
 * Guaranteed: Produces ONE UNIFIED FINAL SIGNAL per market setup (not 4 separate timeframe signals).
 * Phase 5.5: Universal Market Coverage across all categories with bounded concurrency and opportunity discovery.
 */
export async function scanMarketForSignals(timeframe: TimeFrame = '1h'): Promise<Signal[]> {
  preMoveDiagnostics.resetForNewScan();
  const discoveredSymbols = await discoverUniversalMarket();
  let newsList: ProcessedNews[] = [];
  try {
    newsList = await getProcessedNewsIntelligence();
  } catch (e) {
    // News service fallback
  }

  // Pre-fetch BTC candles for relative strength calculation & Market Regime analysis
  let btcCandles: Candle[] | undefined;
  try {
    btcCandles = await getKlines('BTCUSDT', timeframe, 100);
  } catch (e) {}

  // Phase 8: Calculate Macro Market Regime
  const marketRegimeAnalysis = analyzeMarketRegime(btcCandles || [], 55);

  let totalScanned = 0;
  let successfulCount = 0;
  let failedCount = 0;
  let waitCount = 0;
  let actionableCount = 0;

  const scannedSnapshots: AssetMarketSnapshot[] = [];

  const scannedSignals = await runBoundedParallelScan<Signal>(
    discoveredSymbols,
    async (symbol: string) => {
      totalScanned++;
      try {
        // 1. Fetch Primary & Secondary Timeframe Candles
        const primaryCandles = await getKlines(symbol, timeframe, 100);
        if (!primaryCandles || primaryCandles.length < 20) {
          failedCount++;
          invalidateStoredSignal(symbol, 'INSUFFICIENT_BINANCE_DATA: Kline history unavailable or insufficient on Binance');
          return null;
        }

        const higherTf: TimeFrame = timeframe === '4h' ? '1d' : '4h';
        const lowerTf: TimeFrame = timeframe === '15m' ? '5m' : '15m';

        let higherCandles: Candle[] | undefined;
        let lowerCandles: Candle[] | undefined;

        try {
          higherCandles = await getKlines(symbol, higherTf, 50);
        } catch (e) {}

        try {
          lowerCandles = await getKlines(symbol, lowerTf, 50);
        } catch (e) {}

        const ticker = await get24hTicker(symbol);
        const derivatives = await getDerivativesData(symbol);

        if (!ticker || !ticker.lastPrice || ticker.lastPrice <= 0) {
          waitCount++;
          invalidateStoredSignal(symbol, 'BINANCE_TICKER_UNAVAILABLE: Fresh live Binance ticker missing or non-positive');
          return null;
        }

        scannedSnapshots.push({
          symbol,
          priceChange24h: ticker.priceChangePercent,
          volume24h: ticker.quoteVolume || (ticker.volume * ticker.lastPrice)
        });

        const tfCandlesMap: Record<string, Candle[] | undefined> = {
          [timeframe]: primaryCandles,
        };
        if (higherCandles && higherCandles.length >= 20) tfCandlesMap[higherTf] = higherCandles;
        if (lowerCandles && lowerCandles.length >= 20) tfCandlesMap[lowerTf] = lowerCandles;

        // Evaluate through Phase 4 Core Intelligence Engine
        const coreResult = evaluateMarketWithCoreIntelligence(
          symbol,
          timeframe,
          tfCandlesMap,
          derivatives,
          newsList
        );

        successfulCount++;

        // Evaluate through Phase 5.5 Opportunity Discovery Engine
        const opportunityReport = evaluateOpportunityDiscovery({
          symbol,
          timeframe,
          candles: primaryCandles,
          btcCandles,
          derivatives,
          newsList,
          qualityGrade: coreResult.signal?.qualityGrade || (coreResult.decision === 'WAIT' ? 'WAIT' : 'B'),
          moonScore: coreResult.signal?.moonScore || 50,
          confidence: coreResult.confidence,
          riskRewardRatio: coreResult.signal?.riskRewardRatio || 2.0,
          direction: coreResult.decision === 'WAIT' ? undefined : coreResult.decision,
          whyTrade: coreResult.signal?.whyTrade,
          conflicts: coreResult.signal?.conflicts
        });

        const currentMarketPrice = ticker.lastPrice;
        const calculatedPriceDecimals = currentMarketPrice < 1 ? (currentMarketPrice < 0.001 ? 6 : 4) : 2;

        // Invalidate or update existing Pre-Move setup for this coin if stopLoss or invalidation levels were breached
        checkAndUpdateExistingPreMoveSignal(symbol, currentMarketPrice);

        // Independent Pre-Move Intelligence Evaluation for EVERY coin with sufficient market data
        let preMoveOpportunityReport: PreMoveReport | null = null;
        try {
          preMoveOpportunityReport = evaluatePreMoveOpportunity({
            symbol,
            candles15m: lowerCandles || [],
            candles1h: primaryCandles,
            candles4h: higherCandles || [],
            currentPrice: currentMarketPrice,
            derivatives: derivatives || null,
            rvol: opportunityReport.rvol || 1.0,
            priceDecimals: calculatedPriceDecimals,
            timeframe,
            structure: {
              bosBullish: (coreResult.smcStructureReport?.structureType === 'BOS' || (coreResult.smcStructureReport?.bosCount || 0) > 0) && coreResult.smcStructureReport?.structureBias === 'BULLISH',
              bosBearish: (coreResult.smcStructureReport?.structureType === 'BOS' || (coreResult.smcStructureReport?.bosCount || 0) > 0) && coreResult.smcStructureReport?.structureBias === 'BEARISH',
              chochBullish: (coreResult.smcStructureReport?.structureType === 'CHOCH' || (coreResult.smcStructureReport?.chochCount || 0) > 0) && coreResult.smcStructureReport?.structureBias === 'BULLISH',
              chochBearish: (coreResult.smcStructureReport?.structureType === 'CHOCH' || (coreResult.smcStructureReport?.chochCount || 0) > 0) && coreResult.smcStructureReport?.structureBias === 'BEARISH',
              orderBlockType: coreResult.smcStructureReport?.orderBlocks?.[0]?.type,
              fvgType: coreResult.smcStructureReport?.fvgs?.[0]?.type,
              judasSwing: coreResult.smcStructureReport?.judasSwing
            },
            orderflow: {
              cvdTrend: coreResult.orderflowReport?.cvd?.deltaTrend === 'RISING' ? 'BULLISH' : coreResult.orderflowReport?.cvd?.deltaTrend === 'FALLING' ? 'BEARISH' : 'NEUTRAL',
              deltaBias: coreResult.orderflowReport?.cvd?.divergence?.type === 'BULLISH_CVD_DIVERGENCE' ? 'BULLISH' : coreResult.orderflowReport?.cvd?.divergence?.type === 'BEARISH_CVD_DIVERGENCE' ? 'BEARISH' : 'NEUTRAL',
              currentVsPoc: coreResult.orderflowReport?.volumeProfile?.currentVsPoc,
              dominantPressure: coreResult.orderflowReport?.orderBookImbalance?.bidDepthPressure === 'BIDS_DOMINANT' ? 'BUY_AGGRESSIVE' : coreResult.orderflowReport?.orderBookImbalance?.bidDepthPressure === 'ASKS_DOMINANT' ? 'SELL_AGGRESSIVE' : 'NEUTRAL'
            },
            btcRegime: {
              bias: marketRegimeAnalysis?.btcTrend === 'BULLISH' ? 'BULLISH' : marketRegimeAnalysis?.btcTrend === 'BEARISH' ? 'BEARISH' : 'NEUTRAL',
              regime: marketRegimeAnalysis?.regime
            }
          });

          // Qualify and register in the authoritative Pre-Move registry
          const builtPreMoveSignal = qualifyAndBuildPreMoveSignal({
            preMoveReport: preMoveOpportunityReport,
            candles: primaryCandles,
            currentPrice: currentMarketPrice,
            timeframe,
            priceDecimals: calculatedPriceDecimals,
            rvol: opportunityReport.rvol || 1.0
          });
          if (builtPreMoveSignal) {
            storeAuthoritativePreMoveSignal(builtPreMoveSignal);
          } else {
            // Check if coin is an existing registered candidate and update its live status against fresh market price
            checkAndUpdateExistingPreMoveSignal(symbol, currentMarketPrice);
          }
        } catch (preMoveErr) {
          console.warn(`[Scanner] Pre-move independent evaluation error for ${symbol}:`, preMoveErr);
          // Do not remove valid active Pre-Move opportunity simply because a temporary calculation or API request threw
        }

        // Dedicated Normal / Core Signal Evaluation (Independent Layer)
        let signal = coreResult.signal;

        if (!signal) {
          waitCount++;
          // Stale Stored Signal Eviction:
          // If new scan rejects signal / returns null or WAIT, the old stored signal must NOT remain actionable!
          invalidateStoredSignal(symbol, 'SCAN_REJECTED_NEW_SETUP: New scan produced WAIT or no actionable signal');
          return null;
        }

        // Directional Math Integrity Firewall:
        // For SHORT setups (e.g. ARUSDT SHORT), all Take Profits (TP1, TP2, TP3, TP4) MUST be mathematically LOWER than Entry,
        // and Stop Loss must be HIGHER than Entry.
        // For LONG setups, all Take Profits MUST be HIGHER than Entry, and Stop Loss must be LOWER than Entry.
        // Invalidate any signal where SHORT TP >= Entry or LONG TP <= Entry.
        if (!enforceDirectionalRiskAndTargets(signal, calculatedPriceDecimals)) {
          console.log(`[Scanner Filter] Filtered candidate for ${symbol} due to directional target or SL inversion: ${signal.invalidationReason}`);
          invalidateStoredSignal(symbol, signal.invalidationReason || 'DIRECTIONAL_TARGET_OR_SL_INVERSION');
          return null;
        }

        // Live Price Consistency Firewall: If live Binance price diverges from entry price (>4%), discard immediately
        if (ticker && ticker.lastPrice > 0 && signal.entryPrice > 0) {
          const entryDrift = Math.abs(ticker.lastPrice - signal.entryPrice) / signal.entryPrice;
          if (entryDrift > 0.04) {
            console.log(`[Scanner Filter] Filtered stale/inconsistent signal for ${symbol}: live Binance ticker (${ticker.lastPrice}) diverged from calculated entry (${signal.entryPrice}) by ${(entryDrift * 100).toFixed(1)}%`);
            invalidateStoredSignal(symbol, `PRICE_CONSISTENCY_FIREWALL_BREACH: Live Binance ticker (${ticker.lastPrice}) diverged from entry (${signal.entryPrice}) by ${(entryDrift * 100).toFixed(1)}%`);
            return null;
          }
        }

        // Gate 1: Institutional Volume Profile & Liquidity Vacuum Engine
        // Require that valid LONG setups occur with price reclaiming or holding above POC/VAH alongside confirmed RVOL
        const volumeProfile = calculateVolumeProfile(primaryCandles, 30);
        (signal as any).volumeProfile = volumeProfile;

        const currentRvol = Math.max(
          opportunityReport.rvol || 1.0,
          calculateRVOL(primaryCandles.map(c => c.volume), 20)
        );
        if (signal.direction === 'LONG') {
          const reclaimed = volumeProfile.reclaimedPOCorVAH;
          const minRvol = (signal.qualityGrade === 'A+' || signal.qualityGrade === 'A') ? 1.0 : 1.1;
          if (!reclaimed || currentRvol < minRvol) {
            console.log(`[Scanner Filter] Filtering candidate for ${symbol}: Volume Profile Gate (reclaimed: ${reclaimed}, rvol: ${currentRvol} < ${minRvol}x)`);
            invalidateStoredSignal(symbol, `VOLUME_PROFILE_FILTER: Reclaimed POC/VAH=${reclaimed}, RVOL=${currentRvol} (Req >= ${minRvol}x)`);
            return null;
          }
        }

        // Gate 2: Anti-Waterfall Dump Gate
        // Valid Bull Pennant requires an initial upward impulse pole (gain >= 8% in last 10-25 bars) and consolidation depth <= 50% of pole
        const patternStr = `${signal.pattern || ''} ${(signal as any).name || ''} ${(signal as any).setupType || ''}`;
        if (/pennant/i.test(patternStr) && primaryCandles.length >= 20) {
          const len = primaryCandles.length;
          const searchStart = Math.max(0, len - 25);
          const poleEndIdx = len - 6;
          let poleLow = Infinity;
          for (let i = searchStart; i < poleEndIdx - 2; i++) {
            if (primaryCandles[i].low < poleLow) poleLow = primaryCandles[i].low;
          }
          let poleHigh = -Infinity;
          for (let i = searchStart; i <= poleEndIdx; i++) {
            if (primaryCandles[i].high > poleHigh) poleHigh = primaryCandles[i].high;
          }
          const poleGain = poleHigh - poleLow;
          const poleGainPct = poleLow > 0 ? (poleGain / poleLow) * 100 : 0;
          const pennantSlice = primaryCandles.slice(poleEndIdx);
          const lowestConsolidation = Math.min(...pennantSlice.map(c => c.low));
          const consolidationDepth = poleHigh - lowestConsolidation;
          const consolidationRatio = poleGain > 0 ? consolidationDepth / poleGain : 1.0;

          if (poleGainPct < 8.0 || consolidationRatio > 0.50) {
            console.log(`[Scanner Filter] Filtered ${symbol}: Anti-Waterfall Dump Gate (poleGainPct: ${poleGainPct.toFixed(1)}% < 8% or consolidationRatio: ${(consolidationRatio * 100).toFixed(1)}% > 50%)`);
            invalidateStoredSignal(symbol, `ANTI_WATERFALL_DUMP_GATE: Pole gain ${poleGainPct.toFixed(1)}% (<8%) or retrace ${(consolidationRatio * 100).toFixed(1)}% (>50%)`);
            return null;
          }
        }

        // Gate 3: Whale Accumulation Sentinel
        // Require Binance Futures Open Interest (OI) acceleration (+15% to +30%) and Taker Buy Volume >= 65% on breakout
        if (/breakout/i.test(patternStr) && derivatives && derivatives.status === 'AVAILABLE') {
          const oiChange = derivatives.openInterestChange24h ?? 0;
          const rawTaker = (derivatives as any).takerBuyRatio ?? (derivatives as any).takerBuySellRatio ?? 0.65;
          const takerPct = rawTaker <= 1.0 ? rawTaker * 100 : (rawTaker / (rawTaker + 1)) * 100;
          if (oiChange < 15.0 || takerPct < 65.0) {
            console.log(`[Scanner Filter] Filtered ${symbol}: Whale Accumulation Sentinel (OI Change: ${oiChange.toFixed(1)}% < 15%, Taker Buy: ${takerPct.toFixed(1)}% < 65%)`);
            invalidateStoredSignal(symbol, `WHALE_ACCUMULATION_GATE: OI acceleration ${oiChange.toFixed(1)}% (<15%) or Taker Buy ${takerPct.toFixed(1)}% (<65%)`);
            return null;
          }
        }

        // Attach pre-move intelligence to normal signal as enrichment if present
        if (preMoveOpportunityReport) {
          signal.preMoveReport = preMoveOpportunityReport;
          signal.preMoveIntelligence = preMoveOpportunityReport;
        }

        actionableCount++;
        signal.category = getAssetCategory(symbol);
        signal.opportunityReport = opportunityReport;
        signal.opportunityScore = opportunityReport.opportunityScore;
        signal.rankingBucket = opportunityReport.rankingBucket;

        signal.currentPrice = ticker.lastPrice;
        signal.priceChange24h = ticker.priceChangePercent;
        signal.volume24h = ticker.volume;

        // Phase 8: Predictive Early-Move & Smart Entry Timing Evaluation
        const earlyMoveReport = evaluatePredictiveOpportunity({
          symbol,
          candles: primaryCandles,
          currentPrice: signal.currentPrice || ticker?.lastPrice || signal.entryPrice,
          direction: signal.direction === 'SHORT' ? 'SHORT' : 'LONG',
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          targets: signal.targets || [],
          riskRewardRatio: signal.riskRewardRatio,
          qualityGrade: signal.qualityGrade,
          rvol: opportunityReport.rvol || 1.0,
          priceChange24h: signal.priceChange24h || 0,
          smcStructure: coreResult.smcStructureReport?.structureType,
          orderflowCvd: coreResult.orderflowReport?.cvd?.deltaTrend,
          newsCatalyst: signal.newsCatalyst,
          isNewListing: signal.category === 'NEW_LISTING',
          marketRegime: marketRegimeAnalysis,
          marketCycle: coreResult.marketCycle,
          derivativesFunding: derivatives?.fundingRate,
          derivativesOIChange: derivatives?.openInterestChange24h
        });

        signal.earlyMoveReport = earlyMoveReport;
        signal.marketRegimeAnalysis = marketRegimeAnalysis;
        signal.smartEntryTiming = earlyMoveReport.entryTiming;
        signal.crossAssetConfirmation = earlyMoveReport.crossAssetConfirmation;
        signal.earlyCategory = earlyMoveReport.earlyCategory;
        signal.setupMaturity = earlyMoveReport.maturity;
        signal.timingWindow = earlyMoveReport.timingWindow;
        signal.setupAge = earlyMoveReport.setupAge;
        signal.triggerCondition = earlyMoveReport.triggerCondition;
        signal.whyEarlySetupMatters = earlyMoveReport.whyThisMatters;

        // Phase 12: Primary Setup Category Intelligence
        const categoryReport = evaluatePrimarySetupCategory({
          symbol,
          direction: signal.direction === 'SHORT' ? 'SHORT' : 'LONG',
          candles: primaryCandles,
          currentPrice: signal.currentPrice || ticker?.lastPrice || signal.entryPrice,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          targets: signal.targets || [],
          riskRewardRatio: signal.riskRewardRatio,
          decision: signal.direction === 'SHORT' ? 'SHORT' : 'LONG',
          qualityGrade: signal.qualityGrade,
          actionablePriority: signal.actionablePriority,
          entryStatus: signal.smartEntryTiming || signal.entryStatus,
          setupMaturity: signal.setupMaturity,
          timingWindow: signal.timingWindow,
          marketCycle: coreResult.marketCycle,
          earlyMoveReport,
          smcStructureReport: coreResult.smcStructureReport,
          orderflowReport: coreResult.orderflowReport,
          relativeStrengthReport: coreResult.relativeStrengthReport,
          rsScoreVsBtc: opportunityReport.rsScoreVsBtc,
          breakoutEvaluation: signal.breakoutEvaluation,
          pullbackZone: coreResult.pullbackZone,
          retestLevel: coreResult.retestLevel,
          newsCatalyst: signal.newsCatalyst,
          rvol: opportunityReport.rvol || 1.0,
          priceChange24h: signal.priceChange24h || 0
        });

        signal.primaryCategory = categoryReport.primaryCategory;
        signal.categoryConfluences = categoryReport.categoryConfluences;
        signal.categoryIntelligence = categoryReport;
        signal.categoryReasoning = categoryReport.reasoning;

        // Phase 13: News Intelligence 2.0 (Deterministic Impact Pipeline)
        const newsImpactReport = evaluateNewsMarketImpact({
          symbol,
          newsList,
          candles: primaryCandles,
          currentPrice: signal.currentPrice || ticker?.lastPrice || signal.entryPrice,
          decision: signal.direction === 'SHORT' ? 'SHORT' : 'LONG'
        });
        signal.newsImpactReport = newsImpactReport;
        signal.newsIntelligence = newsImpactReport;

        // Phase 14: New Listing Intelligence (Deterministic Discovery & Confluence)
        let newListingIntelligence: any = undefined;
        try {
          newListingIntelligence = evaluateNewListingIntelligence({
            symbol,
            candles: primaryCandles,
            currentPrice: signal.currentPrice || ticker?.lastPrice || signal.entryPrice,
            volume24hUsd: ticker ? ticker.volume * (signal.currentPrice || ticker.lastPrice) : null,
            rvol: opportunityReport.rvol || 1.0,
            newsImpactReport,
            coreDecision: signal.direction === 'SHORT' ? 'SHORT' : 'LONG'
          });
          signal.newListingIntelligence = newListingIntelligence;
        } catch (listingErr) {
          console.warn(`[Scanner] Listing intelligence error for ${symbol}:`, listingErr);
        }

        // Phase 15: Large Move + Asymmetric Opportunity Intelligence
        try {
          const largeMoveIntelligence = evaluateLargeMoveOpportunity({
            symbol,
            candles: primaryCandles,
            currentPrice: signal.currentPrice || ticker?.lastPrice || signal.entryPrice,
            entryPrice: signal.entryPrice,
            stopLoss: signal.stopLoss,
            targets: signal.targets,
            riskRewardRatio: signal.riskRewardRatio,
            coreDecision: signal.direction === 'SHORT' ? 'SHORT' : 'LONG',
            qualityGrade: signal.qualityGrade,
            actionablePriority: signal.actionablePriority,
            derivatives: derivatives || null,
            marketCycle: coreResult.marketCycle,
            earlyMoveReport,
            newsImpactReport,
            newListingIntelligence,
            pumpDumpIntelligence: coreResult.pumpDumpIntelligence
          });
          signal.largeMoveIntelligence = largeMoveIntelligence;
        } catch (largeMoveErr) {
          console.warn(`[Scanner] Large move intelligence error for ${symbol}:`, largeMoveErr);
        }

        // Pre-Move Intelligence: Compression, Volatility Squeeze & Liquidity Sweep Radar
        const curPrice = signal.currentPrice || ticker?.lastPrice || signal.entryPrice;
        try {
          if (!signal.preMoveReport) {
            const preMoveReport = evaluatePreMoveOpportunity({
              symbol,
              candles15m: lowerCandles || [],
              candles1h: primaryCandles,
              candles4h: higherCandles || [],
              currentPrice: curPrice,
              rvol: opportunityReport.rvol || 1.0,
              derivatives: derivatives || undefined,
              priceDecimals: calculatedPriceDecimals,
              timeframe,
              structure: {
                bosBullish: (coreResult.smcStructureReport?.structureType === 'BOS' || coreResult.smcStructureReport?.bosCount! > 0) && coreResult.smcStructureReport?.structureBias === 'BULLISH',
                bosBearish: (coreResult.smcStructureReport?.structureType === 'BOS' || coreResult.smcStructureReport?.bosCount! > 0) && coreResult.smcStructureReport?.structureBias === 'BEARISH',
                chochBullish: (coreResult.smcStructureReport?.structureType === 'CHOCH' || coreResult.smcStructureReport?.chochCount! > 0) && coreResult.smcStructureReport?.structureBias === 'BULLISH',
                chochBearish: (coreResult.smcStructureReport?.structureType === 'CHOCH' || coreResult.smcStructureReport?.chochCount! > 0) && coreResult.smcStructureReport?.structureBias === 'BEARISH',
                orderBlockType: coreResult.smcStructureReport?.orderBlocks?.[0]?.type,
                fvgType: coreResult.smcStructureReport?.fvgs?.[0]?.type,
                judasSwing: coreResult.smcStructureReport?.judasSwing
              },
              orderflow: {
                cvdTrend: coreResult.orderflowReport?.cvd?.deltaTrend === 'RISING' ? 'BULLISH' : coreResult.orderflowReport?.cvd?.deltaTrend === 'FALLING' ? 'BEARISH' : 'NEUTRAL',
                deltaBias: coreResult.orderflowReport?.cvd?.divergence?.type === 'BULLISH_CVD_DIVERGENCE' ? 'BULLISH' : coreResult.orderflowReport?.cvd?.divergence?.type === 'BEARISH_CVD_DIVERGENCE' ? 'BEARISH' : 'NEUTRAL',
                currentVsPoc: coreResult.orderflowReport?.volumeProfile?.currentVsPoc,
                dominantPressure: coreResult.orderflowReport?.orderBookImbalance?.bidDepthPressure === 'BIDS_DOMINANT' ? 'BUY_AGGRESSIVE' : coreResult.orderflowReport?.orderBookImbalance?.bidDepthPressure === 'ASKS_DOMINANT' ? 'SELL_AGGRESSIVE' : 'NEUTRAL'
              },
              btcRegime: {
                bias: marketRegimeAnalysis?.btcTrend === 'BULLISH' ? 'BULLISH' : marketRegimeAnalysis?.btcTrend === 'BEARISH' ? 'BEARISH' : 'NEUTRAL',
                regime: marketRegimeAnalysis?.regime
              }
            });
            signal.preMoveReport = preMoveReport;
            signal.preMoveIntelligence = preMoveReport;
            const builtPreMoveSignal = qualifyAndBuildPreMoveSignal({
              preMoveReport,
              candles: primaryCandles,
              currentPrice: curPrice,
              timeframe,
              priceDecimals: calculatedPriceDecimals,
              rvol: opportunityReport.rvol || 1.0
            });
            if (!builtPreMoveSignal) {
              checkAndUpdateExistingPreMoveSignal(symbol, curPrice);
            }
          }
        } catch (preMoveErr) {
          console.warn(`[Scanner] Pre-move evaluation error for ${symbol}:`, preMoveErr);
          // Do not remove valid active Pre-Move opportunity simply because a temporary calculation or API request threw
        }

        // Dedicated Big Move & Dump Hunter Engines
        try {
          const bigMoveHunter = evaluateBigMoveHunter({
            symbol,
            candles: primaryCandles,
            currentPrice: curPrice,
            rvol: opportunityReport.rvol || 1.0,
            pumpDumpIntelligence: coreResult.pumpDumpIntelligence,
            preMoveReport: signal.preMoveReport,
            marketCycle: coreResult.marketCycle,
            derivativesIntelligence: derivatives as any
          });
          signal.bigMoveHunter = bigMoveHunter;

          const dumpHunter = evaluateDumpHunter({
            symbol,
            candles: primaryCandles,
            currentPrice: curPrice,
            rvol: opportunityReport.rvol || 1.0,
            pumpDumpIntelligence: coreResult.pumpDumpIntelligence,
            marketCycle: coreResult.marketCycle,
            derivativesIntelligence: derivatives as any
          });
          signal.dumpHunter = dumpHunter;

          // Unified Exceptional Opportunity Priority Engine
          const exceptionalOpportunity = evaluateUnifiedExceptionalOpportunity({
            signal,
            preMove: signal.preMoveReport,
            bigMove: bigMoveHunter,
            dumpHunter,
            listingIntel: signal.newListingIntelligence,
            btcRegime: marketRegimeAnalysis?.btcTrend ? {
              trend: marketRegimeAnalysis.btcTrend === 'BULLISH' ? 'BULLISH' : marketRegimeAnalysis.btcTrend === 'BEARISH' ? 'BEARISH' : 'RANGING',
              volatility: 'NORMAL'
            } : null,
            newsReport: signal.newsImpactReport
          });
          signal.exceptionalOpportunity = exceptionalOpportunity;
        } catch (huntErr) {
          console.warn(`[Scanner] Exceptional Opportunity evaluation error for ${symbol}:`, huntErr);
        }

        // Major Move (≥30%) & Extreme Move (≥50%) Qualification Layer
        // Only setups whose verified mathematical upside to the final target is >= 30.0% may carry MAJOR_MOVE.
        // Route smaller moves to STANDARD_SWING.
        try {
          const majorQual = qualifyMajorMoveOpportunity(signal);
          if (majorQual.structurallySupportedMovePct >= 30.0 && majorQual.isQualified) {
            signal.majorMoveClass = majorQual.classification;
          } else {
            signal.majorMoveClass = 'NORMAL';
            if ((signal.primaryCategory as string) === 'MAJOR_MOVE') {
              signal.primaryCategory = signal.direction === 'LONG' ? 'TREND_CONTINUATION_LONG' : 'TREND_CONTINUATION_SHORT';
            }
          }
          signal.majorMovePotentialPct = majorQual.structurallySupportedMovePct;
          signal.majorMoveNotes = majorQual.notes;
        } catch (majorErr) {
          console.warn(`[Scanner] Major move qualification error for ${symbol}:`, majorErr);
        }

        // Phase 16: Unified Intelligence Fusion
        try {
          const closes = primaryCandles.map(k => k.close);
          const scanRsi = calculateRSI(closes, 14);
          const currentRsi = scanRsi[scanRsi.length - 1] ?? 50;
          const scanMacd = calculateMACD(closes);
          const currentHist = scanMacd.histogram[scanMacd.histogram.length - 1] ?? 0;
          const scanAtr = calculateATR(primaryCandles, 14);
          const currentAtr = scanAtr[scanAtr.length - 1] ?? ((signal.currentPrice || ticker?.lastPrice || signal.entryPrice) * 0.02);

          const unifiedFusion = evaluateUnifiedFusion({
            symbol,
            currentPrice: signal.currentPrice || ticker?.lastPrice || signal.entryPrice,
            entryPrice: signal.entryPrice,
            stopLoss: signal.stopLoss,
            targets: signal.targets,
            riskRewardRatio: signal.riskRewardRatio,
            candles: primaryCandles,
            coreDecision: signal.direction,
            coreConfidence: signal.confidence,
            qualityGrade: signal.qualityGrade,
            technical: {
              emaAlignment: (signal as any).emaAlignment || (coreResult as any).indicators?.emaAlignment || 'MIXED',
              rsi: currentRsi,
              macdHistogram: currentHist,
              atr: currentAtr,
              rvol: opportunityReport.rvol || 1.0,
              mtfAlignment: (signal as any).mtfAlignment || 'FULL_ALIGNMENT',
              patterns: (signal as any).patterns || [],
              trendlineDescription: signal.trendlineDescription
            },
            smc: coreResult.smcStructureReport,
            orderflow: coreResult.orderflowReport,
            liquidityZones: (signal as any).liquidityZones || [],
            derivativesData: derivatives || null,
            derivativesIntelligence: (coreResult as any).derivativesIntelligenceReport,
            marketRegime: typeof coreResult.marketRegime === 'string' ? coreResult.marketRegime : ((coreResult.marketRegime as any)?.regime || 'NEUTRAL'),
            marketBreadth: {
              rsScoreVsBtc: opportunityReport.rsScoreVsBtc || 0,
              marketBreadthBias: 'NEUTRAL'
            },
            marketCycle: coreResult.marketCycle,
            pumpDumpIntelligence: coreResult.pumpDumpIntelligence,
            earlySetupTiming: {
              earlyCategory: earlyMoveReport?.earlyCategory,
              setupMaturity: (earlyMoveReport as any)?.setupMaturity || earlyMoveReport?.maturity || earlyMoveReport?.setupAge,
              timingWindow: earlyMoveReport?.timingWindow,
              smartEntryTiming: (earlyMoveReport as any)?.smartEntryTiming || earlyMoveReport?.entryTiming
            },
            primaryCategory: categoryReport?.primaryCategory,
            categoryReport,
            newsImpactReport,
            newListingIntelligence,
            largeMoveIntelligence: signal.largeMoveIntelligence,
            riskAudit: {
              killSwitch: coreResult.killSwitch,
              keyRisk: coreResult.keyRisk,
              tradeManagement: signal.tradeManagement
            },
            timingWindow: earlyMoveReport?.timingWindow,
            executionState: (earlyMoveReport as any)?.smartEntryTiming?.readiness || (earlyMoveReport as any)?.entryTiming?.readiness || (signal.tradeManagement as any)?.entryTiming?.readiness || signal.entryStatus
          });
          signal.unifiedFusion = unifiedFusion;
        } catch (fusionErr) {
          console.warn(`[Scanner] Unified fusion error for ${symbol}:`, fusionErr);
        }

        // Incrementally seed/update signal store so signals appear immediately on startup
        upsertSignals([signal]);

        return signal;
      } catch (err) {
        failedCount++;
        console.warn(`[Scanner] Error processing ${symbol}:`, err);
        return null;
      }
    },
    8 // Bounded concurrency of 8 workers
  );

  // Phase 8: Compute Sector Rotation
  const sectorRotationAnalysis = analyzeSectorRotation(scannedSnapshots);
  for (const s of scannedSignals) {
    if (s) {
      s.sectorRotationAnalysis = sectorRotationAnalysis;
    }
  }

  // Update real-time Market Coverage Telemetry
  updateScanCoverageTelemetry({
    scanned: totalScanned,
    successful: successfulCount,
    failed: failedCount,
    waitCount,
    actionableCount
  });

  // Deduplicate & Rank signals: Ensure ONE COIN = ONE CURRENT UNIFIED SIGNAL and apply Phase 6.2 Priority Ranking
  const rankedReport = rankMarketOpportunities(scannedSignals);
  return rankedReport.topRankedOpportunities || Array.from(new Map(scannedSignals.map(s => [s.symbol, s])).values());
}

/**
 * Universal Coin Search & Unified Deep-Dive Analysis (Phase 6.1)
 * Runs the exact same deterministic core intelligence pipeline on ANY searched asset.
 * Guarantees ONE COIN = ONE UNIFIED CURRENT SIGNAL across the entire market universe.
 */
export async function analyzeSinglePair(rawSymbol: string, timeframe: TimeFrame = '1h'): Promise<CoinAnalysisReport> {
  const resolved = resolveSymbolFromQuery(rawSymbol);
  const cleanSym = resolved.symbol;

  let newsList: ProcessedNews[] = [];
  try {
    newsList = await getProcessedNewsIntelligence();
  } catch (e) {
    // News service fallback
  }

  let btcCandles: Candle[] | undefined;
  try {
    btcCandles = await getKlines('BTCUSDT', timeframe, 100);
  } catch (e) {}

  const primaryCandles = await getKlines(cleanSym, timeframe, 100);
  const higherTf: TimeFrame = timeframe === '4h' ? '1d' : '4h';
  const lowerTf: TimeFrame = timeframe === '15m' ? '5m' : '15m';

  let higherCandles: Candle[] | undefined;
  let lowerCandles: Candle[] | undefined;
  let tf15mCandles: Candle[] | undefined;
  let tf1hCandles: Candle[] | undefined;
  let tf4hCandles: Candle[] | undefined;

  try {
    higherCandles = await getKlines(cleanSym, higherTf, 50);
  } catch (e) {}

  try {
    lowerCandles = await getKlines(cleanSym, lowerTf, 50);
  } catch (e) {}

  try {
    tf15mCandles = timeframe === '15m' ? primaryCandles : await getKlines(cleanSym, '15m', 30);
  } catch (e) {}

  try {
    tf1hCandles = timeframe === '1h' ? primaryCandles : await getKlines(cleanSym, '1h', 50);
  } catch (e) {}

  try {
    tf4hCandles = timeframe === '4h' ? primaryCandles : await getKlines(cleanSym, '4h', 50);
  } catch (e) {}

  const ticker = await get24hTicker(cleanSym);
  const derivatives = await getDerivativesData(cleanSym);

  const tfCandlesMap: Record<string, Candle[] | undefined> = {
    [timeframe]: primaryCandles,
  };
  if (higherCandles && higherCandles.length >= 20) tfCandlesMap[higherTf] = higherCandles;
  if (lowerCandles && lowerCandles.length >= 20) tfCandlesMap[lowerTf] = lowerCandles;
  if (tf15mCandles && tf15mCandles.length >= 20) tfCandlesMap['15m'] = tf15mCandles;
  if (tf1hCandles && tf1hCandles.length >= 20) tfCandlesMap['1h'] = tf1hCandles;
  if (tf4hCandles && tf4hCandles.length >= 20) tfCandlesMap['4h'] = tf4hCandles;

  const coreResult = evaluateMarketWithCoreIntelligence(
    cleanSym,
    timeframe,
    tfCandlesMap,
    derivatives,
    newsList
  );

  const category = resolved.category || getAssetCategory(cleanSym);

  const opportunityReport = evaluateOpportunityDiscovery({
    symbol: cleanSym,
    timeframe,
    candles: primaryCandles,
    btcCandles,
    derivatives,
    newsList,
    qualityGrade: coreResult.signal?.qualityGrade || (coreResult.decision === 'WAIT' ? 'WAIT' : 'B'),
    moonScore: coreResult.signal?.moonScore || 50,
    confidence: coreResult.confidence,
    riskRewardRatio: coreResult.signal?.riskRewardRatio || 2.0,
    direction: coreResult.decision === 'WAIT' ? undefined : coreResult.decision,
    whyTrade: coreResult.signal?.whyTrade,
    conflicts: coreResult.signal?.conflicts
  });

  // Calculate technical indicators
  const closes = primaryCandles.map(c => c.close);
  const isTickerMissing = (!ticker || !ticker.lastPrice || ticker.lastPrice <= 0) && isBinanceOnlyMode();
  if (isTickerMissing) {
    invalidateStoredSignal(cleanSym, 'BINANCE_TICKER_UNAVAILABLE: Live Binance ticker missing or non-positive');
    coreResult.decision = 'WAIT';
    coreResult.qualityGrade = 'WAIT';
    coreResult.actionablePriority = 'WAIT';
    coreResult.confidence = 0;
  }
  const currentPrice = ticker?.lastPrice || (isBinanceOnlyMode() ? 0 : (closes[closes.length - 1] || 0));
  const priceChange24h = ticker?.priceChangePercent || 0;
  const volume24h = ticker?.quoteVolume || (ticker?.volume ? ticker.volume * currentPrice : 0);
  const high24h = ticker?.highPrice || Math.max(...closes.slice(-24));
  const low24h = ticker?.lowPrice || Math.min(...closes.slice(-24));

  const rsi = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);
  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema200Arr = calculateEMA(closes, 200);
  const ema20 = ema20Arr[ema20Arr.length - 1] || currentPrice;
  const ema50 = ema50Arr[ema50Arr.length - 1] || currentPrice;
  const ema200 = ema200Arr.length > 0 ? ema200Arr[ema200Arr.length - 1] : undefined;

  const emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED' =
    ema20 > ema50 && (!ema200 || ema50 > ema200)
      ? 'BULLISH'
      : ema20 < ema50 && (!ema200 || ema50 < ema200)
      ? 'BEARISH'
      : 'MIXED';

  const atr = calculateATR(primaryCandles, 14);
  const currentAtr = atr[atr.length - 1] ?? (currentPrice * 0.02);
  const rvol = calculateRVOL(primaryCandles.map(c => c.volume), 20);
  const detectedPatterns = detectPatterns(primaryCandles);
  const trendlines = detectTrendlines(primaryCandles);

  // Determine MTF Trend State
  const calcTfTrend = (candles?: Candle[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
    if (!candles || candles.length < 10) return 'NEUTRAL';
    const c = candles.map(k => k.close);
    const e20 = calculateEMA(c, 20);
    const lastC = c[c.length - 1];
    const lastE = e20[e20.length - 1] || lastC;
    if (lastC > lastE * 1.002) return 'BULLISH';
    if (lastC < lastE * 0.998) return 'BEARISH';
    return 'NEUTRAL';
  };

  const trend15m = calcTfTrend(tf15mCandles);
  const trend1h = calcTfTrend(tf1hCandles);
  const trend4h = calcTfTrend(tf4hCandles);
  const alignment: 'FULL_ALIGNMENT' | 'PARTIAL_ALIGNMENT' | 'CONFLICT' =
    trend15m === trend1h && trend1h === trend4h && trend1h !== 'NEUTRAL'
      ? 'FULL_ALIGNMENT'
      : (trend15m === trend1h || trend1h === trend4h) && (trend1h !== 'NEUTRAL')
      ? 'PARTIAL_ALIGNMENT'
      : 'CONFLICT';

  // Determine Current Market Structure (Double Top/Bottom, Breakout Retest, FVG, etc.)
  const structureResult = determineCurrentMarketStructure({
    candles: primaryCandles,
    patterns: detectedPatterns as any,
    breakout: (coreResult.adaptiveExecution as any)?.breakoutEvaluation,
    smc: coreResult.smcStructureReport,
    marketCycle: coreResult.marketCycle,
    momentum: coreResult.pumpDumpIntelligence,
    trendlines,
    currentPrice
  });

  // Calculate Support and Resistance Levels from Pivots
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];
  for (let i = 2; i < primaryCandles.length - 2; i++) {
    if (
      primaryCandles[i].high > primaryCandles[i - 1].high &&
      primaryCandles[i].high > primaryCandles[i - 2].high &&
      primaryCandles[i].high > primaryCandles[i + 1].high &&
      primaryCandles[i].high > primaryCandles[i + 2].high
    ) {
      pivotHighs.push(primaryCandles[i].high);
    }
    if (
      primaryCandles[i].low < primaryCandles[i - 1].low &&
      primaryCandles[i].low < primaryCandles[i - 2].low &&
      primaryCandles[i].low < primaryCandles[i + 1].low &&
      primaryCandles[i].low < primaryCandles[i + 2].low
    ) {
      pivotLows.push(primaryCandles[i].low);
    }
  }

  const resistanceLevels = Array.from(new Set(pivotHighs.filter(p => p > currentPrice))).slice(0, 4);
  const supportLevels = Array.from(new Set(pivotLows.filter(p => p < currentPrice))).slice(-4);

  // Liquidity Zones from SMC or Swings
  const liquidityZones: LiquidityZone[] = coreResult.smcStructureReport?.fvgs?.map(fvg => {
    const avgPrice = (fvg.top + fvg.bottom) / 2;
    return {
      price: avgPrice,
      type: (fvg.type === 'BULLISH' ? 'SWING_LOW' : 'SWING_HIGH') as LiquidityZoneType,
      strength: fvg.status === 'UNMITIGATED' ? 85 : 50,
      distanceFromPricePct: Math.abs((avgPrice - currentPrice) / currentPrice) * 100,
      relevance: fvg.status === 'UNMITIGATED' ? 'HIGH' : 'MEDIUM',
      touched: fvg.status === 'MITIGATED',
      touchCount: fvg.status === 'MITIGATED' ? 2 : 0,
      swept: fvg.status === 'MITIGATED',
      description: `${fvg.type} Fair Value Gap zone`
    };
  }) || [];

  // Phase 8: Calculate Macro Market Regime & Sector Rotation
  const marketRegimeAnalysis = analyzeMarketRegime(btcCandles || [], 55);
  const sectorRotationAnalysis = analyzeSectorRotation([
    {
      symbol: cleanSym,
      priceChange24h,
      volume24h
    }
  ]);

  // Phase 8: Predictive Early-Move & Smart Entry Timing Evaluation
  const earlyMoveReport = evaluatePredictiveOpportunity({
    symbol: cleanSym,
    candles: primaryCandles,
    currentPrice,
    direction: coreResult.decision === 'SHORT' ? 'SHORT' : 'LONG',
    entryPrice: coreResult.entryPrice || currentPrice,
    stopLoss: coreResult.stopLoss || (currentAtr > 0 ? (coreResult.decision === 'SHORT' ? currentPrice + currentAtr * 1.8 : Math.max(0.000001, currentPrice - currentAtr * 1.8)) : currentPrice),
    targets: coreResult.targets || [],
    riskRewardRatio: coreResult.riskRewardRatio || 2.0,
    qualityGrade: coreResult.qualityGrade || 'B',
    rvol,
    priceChange24h,
    smcStructure: coreResult.smcStructureReport?.structureType,
    orderflowCvd: coreResult.orderflowReport?.cvd?.deltaTrend,
    newsCatalyst: newsList[0]?.title,
    isNewListing: category === 'NEW_LISTING',
    marketRegime: marketRegimeAnalysis,
    sectorRotation: sectorRotationAnalysis,
    marketCycle: coreResult.marketCycle,
    mtfTiming: {
      alignment: alignment === 'FULL_ALIGNMENT'
        ? (trend1h === 'BULLISH' ? 'ALIGNED_BULLISH' : 'ALIGNED_BEARISH')
        : alignment === 'CONFLICT'
        ? 'TIMING_CONFLICT'
        : 'MIXED',
      hasConflict: alignment === 'CONFLICT',
      conflictReason: alignment === 'CONFLICT' ? `MTF trend mismatch (15m: ${trend15m}, 1h: ${trend1h}, 4h: ${trend4h})` : undefined,
      timeframes: [
        { timeframe: '15m', bias: trend15m },
        { timeframe: '1h', bias: trend1h },
        { timeframe: '4h', bias: trend4h }
      ]
    },
    derivativesFunding: derivatives?.fundingRate,
    derivativesOIChange: derivatives?.openInterestChange24h
  });

  // Independent Pre-Move Intelligence Evaluation for cleanSym
  checkAndUpdateExistingPreMoveSignal(cleanSym, currentPrice);

  let singlePairPreMoveReport: PreMoveReport | undefined;
  try {
    const calculatedPriceDecimals = currentPrice < 1 ? (currentPrice < 0.001 ? 6 : 4) : 2;
    singlePairPreMoveReport = evaluatePreMoveOpportunity({
      symbol: cleanSym,
      candles15m: tf15mCandles || [],
      candles1h: tf1hCandles || primaryCandles,
      candles4h: tf4hCandles || [],
      currentPrice,
      derivatives: derivatives || null,
      rvol,
      priceDecimals: calculatedPriceDecimals,
      timeframe,
      structure: {
        bosBullish: coreResult.smcStructureReport?.structureType === 'BOS' && coreResult.smcStructureReport?.structureBias === 'BULLISH',
        bosBearish: coreResult.smcStructureReport?.structureType === 'BOS' && coreResult.smcStructureReport?.structureBias === 'BEARISH',
        chochBullish: coreResult.smcStructureReport?.structureType === 'CHOCH' && coreResult.smcStructureReport?.structureBias === 'BULLISH',
        chochBearish: coreResult.smcStructureReport?.structureType === 'CHOCH' && coreResult.smcStructureReport?.structureBias === 'BEARISH',
        orderBlockType: coreResult.smcStructureReport?.orderBlocks?.[0]?.type,
        fvgType: coreResult.smcStructureReport?.fvgs?.[0]?.type
      },
      orderflow: {
        cvdTrend: coreResult.orderflowReport?.cvd?.deltaTrend === 'RISING' ? 'BULLISH' : coreResult.orderflowReport?.cvd?.deltaTrend === 'FALLING' ? 'BEARISH' : 'NEUTRAL',
        deltaBias: coreResult.orderflowReport?.cvd?.divergence?.type === 'BULLISH_CVD_DIVERGENCE' ? 'BULLISH' : coreResult.orderflowReport?.cvd?.divergence?.type === 'BEARISH_CVD_DIVERGENCE' ? 'BEARISH' : 'NEUTRAL'
      },
      btcRegime: {
        bias: marketRegimeAnalysis?.btcTrend === 'BULLISH' ? 'BULLISH' : marketRegimeAnalysis?.btcTrend === 'BEARISH' ? 'BEARISH' : 'NEUTRAL',
        regime: marketRegimeAnalysis?.regime
      }
    });

    qualifyAndBuildPreMoveSignal({
      preMoveReport: singlePairPreMoveReport,
      candles: primaryCandles,
      currentPrice,
      timeframe,
      priceDecimals: calculatedPriceDecimals,
      rvol
    });
  } catch (preMoveErr) {
    console.warn(`[SinglePair] Pre-move evaluation error for ${cleanSym}:`, preMoveErr);
  }

  // Check and reconcile with existing stored signal in signalTracker
  let reconciledSignal = coreResult.signal;

  const existingStored = getStoredSignalBySymbol(cleanSym);
  let categoryReport: any = undefined;
  if (reconciledSignal) {
    reconciledSignal.category = category;
    reconciledSignal.opportunityReport = opportunityReport;
    reconciledSignal.opportunityScore = opportunityReport.opportunityScore;
    reconciledSignal.rankingBucket = opportunityReport.rankingBucket;
    reconciledSignal.priceChange24h = priceChange24h;
    reconciledSignal.volume24h = volume24h;
    reconciledSignal.currentPrice = currentPrice;
    reconciledSignal.earlyMoveReport = earlyMoveReport;
    reconciledSignal.marketRegimeAnalysis = marketRegimeAnalysis;
    reconciledSignal.sectorRotationAnalysis = sectorRotationAnalysis;
    reconciledSignal.smartEntryTiming = earlyMoveReport.entryTiming;
    reconciledSignal.crossAssetConfirmation = earlyMoveReport.crossAssetConfirmation;
    reconciledSignal.earlyCategory = earlyMoveReport.earlyCategory;
    reconciledSignal.setupMaturity = earlyMoveReport.maturity;
    reconciledSignal.timingWindow = earlyMoveReport.timingWindow;
    reconciledSignal.setupAge = earlyMoveReport.setupAge;
    reconciledSignal.triggerCondition = earlyMoveReport.triggerCondition;
    reconciledSignal.whyEarlySetupMatters = earlyMoveReport.whyThisMatters;

    // Phase 6.2: Compute deterministic Opportunity Priority Score
    const priorityAnalysis = calculateOpportunityPriorityScore(reconciledSignal);
    reconciledSignal.priorityScore = priorityAnalysis.priorityScore;
    reconciledSignal.rankingTier = priorityAnalysis.rankingTier;
    reconciledSignal.opportunityPriority = priorityAnalysis;

    // Phase 9: Smart Risk & Trade Management Report
    const smartRiskReport = evaluateSmartRiskAndTradeManagement({
      symbol: cleanSym,
      direction: (reconciledSignal.direction as any) || 'LONG',
      entryPrice: reconciledSignal.entryPrice || currentPrice,
      candles: primaryCandles,
      targets: reconciledSignal.targets || [],
      smcReport: coreResult.smcStructureReport,
      liquidityZones,
      marketRegime: typeof coreResult.marketRegime === 'string' ? coreResult.marketRegime : (coreResult.marketRegime as any)?.regime || 'NEUTRAL',
      derivativesFunding: derivatives?.fundingRate,
      derivativesOIChange: derivatives?.openInterestChange24h,
      cvdDeltaTrend: (coreResult.orderflowReport as any)?.cvd?.deltaTrend,
      newsItem: newsList && newsList.length > 0 ? newsList[0] : undefined
    });
    reconciledSignal.smartRiskReport = smartRiskReport;

    // Phase 12: Primary Setup Category Intelligence & Category Progression
    categoryReport = evaluatePrimarySetupCategory({
        symbol: cleanSym,
        direction: (reconciledSignal.direction as any) || 'LONG',
        candles: primaryCandles,
        currentPrice,
        entryPrice: reconciledSignal.entryPrice || currentPrice,
        stopLoss: reconciledSignal.stopLoss,
        targets: reconciledSignal.targets || [],
        riskRewardRatio: reconciledSignal.riskRewardRatio,
        decision: coreResult.decision,
        qualityGrade: reconciledSignal.qualityGrade,
        actionablePriority: reconciledSignal.actionablePriority,
        entryStatus: reconciledSignal.smartEntryTiming || reconciledSignal.entryStatus,
        setupMaturity: reconciledSignal.setupMaturity,
        timingWindow: reconciledSignal.timingWindow,
        marketCycle: coreResult.marketCycle,
        earlyMoveReport,
        smcStructureReport: coreResult.smcStructureReport,
        orderflowReport: coreResult.orderflowReport,
        relativeStrengthReport: coreResult.relativeStrengthReport,
        rsScoreVsBtc: opportunityReport.rsScoreVsBtc,
        breakoutEvaluation: reconciledSignal.breakoutEvaluation,
        pullbackZone: coreResult.pullbackZone,
        retestLevel: coreResult.retestLevel,
        newsCatalyst: newsList && newsList.length > 0 ? newsList[0]?.title : undefined,
        rvol,
        priceChange24h,
        previousCategory: existingStored?.primaryCategory,
        categoryTransitionHistory: existingStored?.categoryTransitionHistory
      });

      reconciledSignal.primaryCategory = categoryReport.primaryCategory;
      reconciledSignal.categoryConfluences = categoryReport.categoryConfluences;
      reconciledSignal.previousCategory = categoryReport.previousCategory;
      reconciledSignal.categoryTransitionHistory = categoryReport.transitionHistory;
      reconciledSignal.categoryIntelligence = categoryReport;
      reconciledSignal.categoryReasoning = categoryReport.reasoning;

      // Idempotent upsert in tracker: enforces ONE COIN = ONE CURRENT UNIFIED SIGNAL
      const upserted = upsertSignals([reconciledSignal]);
      if (upserted && upserted.length > 0) {
        reconciledSignal = upserted[0];
      }
    } else {
      // If WAIT or no signal generated on re-analysis, invalidate any previously stored active/pending signal
      if (existingStored && (existingStored.status === 'ACTIVE' || existingStored.status === 'ENTRY_PENDING')) {
        invalidateStoredSignal(cleanSym, 'ANALYSIS_REJECTED_SETUP: Market condition evaluated to WAIT');
      }
      reconciledSignal = undefined;
    }

  // Phase 13: News Intelligence 2.0 Evaluation
  const newsImpactReport = evaluateNewsMarketImpact({
    symbol: cleanSym,
    newsList,
    candles: primaryCandles,
    currentPrice,
    decision: coreResult.decision
  });

  if (reconciledSignal) {
    reconciledSignal.newsImpactReport = newsImpactReport;
    reconciledSignal.newsIntelligence = newsImpactReport;
  }

  // Phase 14: New Listing Intelligence (Deterministic Confluence & Early Structure)
  let newListingIntelligence: any = undefined;
  try {
    const existingStored = getStoredSignalBySymbol(cleanSym);
    newListingIntelligence = evaluateNewListingIntelligence({
      symbol: cleanSym,
      candles: primaryCandles,
      currentPrice,
      volume24hUsd: volume24h > 0 ? volume24h * currentPrice : null,
      rvol,
      newsImpactReport,
      coreDecision: coreResult.decision,
      previousStatus: existingStored?.newListingIntelligence?.launchStatus,
      transitionHistory: existingStored?.newListingIntelligence?.transitionHistory
    });
  } catch (listingErr) {
    console.warn(`[SinglePair] Listing intelligence error for ${cleanSym}:`, listingErr);
  }

  if (reconciledSignal && newListingIntelligence) {
    reconciledSignal.newListingIntelligence = newListingIntelligence;
  }

  // Phase 15: Large Move + Asymmetric Opportunity Intelligence
  let largeMoveIntelligence: any = undefined;
  try {
    largeMoveIntelligence = evaluateLargeMoveOpportunity({
      symbol: cleanSym,
      candles: primaryCandles,
      currentPrice,
      entryPrice: reconciledSignal?.entryPrice || coreResult.entryPrice || currentPrice,
      stopLoss: reconciledSignal?.stopLoss || coreResult.stopLoss,
      targets: reconciledSignal?.targets || coreResult.targets,
      riskRewardRatio: reconciledSignal?.riskRewardRatio || coreResult.riskRewardRatio,
      coreDecision: coreResult.decision,
      qualityGrade: reconciledSignal?.qualityGrade || coreResult.qualityGrade,
      actionablePriority: reconciledSignal?.actionablePriority || coreResult.actionablePriority,
      derivatives: derivatives || null,
      marketCycle: coreResult.marketCycle,
      earlyMoveReport,
      newsImpactReport,
      newListingIntelligence,
      pumpDumpIntelligence: coreResult.pumpDumpIntelligence
    });
  } catch (largeMoveErr) {
    console.warn(`[SinglePair] Large move intelligence error for ${cleanSym}:`, largeMoveErr);
  }

  if (reconciledSignal && largeMoveIntelligence) {
    reconciledSignal.largeMoveIntelligence = largeMoveIntelligence;
    const upserted = upsertSignals([reconciledSignal]);
    if (upserted && upserted.length > 0) {
      reconciledSignal = upserted[0];
    }
  }

  // Phase 17: Pre-Move Early Stage Intelligence
  let preMoveReport: PreMoveReport | undefined = reconciledSignal?.preMoveReport || singlePairPreMoveReport;
  if (!preMoveReport) {
    try {
      const calculatedPriceDecimals = currentPrice < 1 ? (currentPrice < 0.001 ? 6 : 4) : 2;
      preMoveReport = evaluatePreMoveOpportunity({
        symbol: cleanSym,
        candles15m: tf15mCandles || [],
        candles1h: tf1hCandles || primaryCandles,
        candles4h: tf4hCandles || [],
        currentPrice,
        derivatives: derivatives || null,
        rvol,
        priceDecimals: calculatedPriceDecimals,
        timeframe,
        structure: {
          bosBullish: coreResult.smcStructureReport?.structureType === 'BOS' && coreResult.smcStructureReport?.structureBias === 'BULLISH',
          bosBearish: coreResult.smcStructureReport?.structureType === 'BOS' && coreResult.smcStructureReport?.structureBias === 'BEARISH',
          chochBullish: coreResult.smcStructureReport?.structureType === 'CHOCH' && coreResult.smcStructureReport?.structureBias === 'BULLISH',
          chochBearish: coreResult.smcStructureReport?.structureType === 'CHOCH' && coreResult.smcStructureReport?.structureBias === 'BEARISH',
          orderBlockType: coreResult.smcStructureReport?.orderBlocks?.[0]?.type,
          fvgType: coreResult.smcStructureReport?.fvgs?.[0]?.type
        },
        orderflow: {
          cvdTrend: coreResult.orderflowReport?.cvd?.deltaTrend === 'RISING' ? 'BULLISH' : coreResult.orderflowReport?.cvd?.deltaTrend === 'FALLING' ? 'BEARISH' : 'NEUTRAL',
          deltaBias: coreResult.orderflowReport?.cvd?.divergence?.type === 'BULLISH_CVD_DIVERGENCE' ? 'BULLISH' : coreResult.orderflowReport?.cvd?.divergence?.type === 'BEARISH_CVD_DIVERGENCE' ? 'BEARISH' : 'NEUTRAL'
        },
        btcRegime: {
          bias: marketRegimeAnalysis?.btcTrend === 'BULLISH' ? 'BULLISH' : marketRegimeAnalysis?.btcTrend === 'BEARISH' ? 'BEARISH' : 'NEUTRAL',
          regime: marketRegimeAnalysis?.regime
        }
      });

      qualifyAndBuildPreMoveSignal({
        preMoveReport,
        candles: primaryCandles,
        currentPrice,
        timeframe,
        priceDecimals: calculatedPriceDecimals,
        rvol
      });
    } catch (preMoveErr) {
      console.warn(`[SinglePair] Pre-move evaluation error for ${cleanSym}:`, preMoveErr);
    }
  }

  if (reconciledSignal) {
    if (preMoveReport) {
      reconciledSignal.preMoveReport = preMoveReport;
      reconciledSignal.preMoveIntelligence = preMoveReport;
    }
    const calculatedPriceDecimals = currentPrice < 1 ? (currentPrice < 0.001 ? 6 : 4) : 2;
    const passedIntegrity = enforceDirectionalRiskAndTargets(reconciledSignal, calculatedPriceDecimals);
    if (!passedIntegrity || (reconciledSignal.riskRewardRatio && reconciledSignal.riskRewardRatio < 2.0)) {
      invalidateStoredSignal(cleanSym, reconciledSignal.invalidationReason || 'INSUFFICIENT_RR_OR_INVERSION');
      reconciledSignal = null;
    }

    if (reconciledSignal && reconciledSignal.direction === 'LONG') {
      const volumeProfile = calculateVolumeProfile(primaryCandles, 30);
      (reconciledSignal as any).volumeProfile = volumeProfile;
      const minRvol = (reconciledSignal.qualityGrade === 'A+' || reconciledSignal.qualityGrade === 'A') ? 1.0 : 1.1;
      if (!volumeProfile.reclaimedPOCorVAH || rvol < minRvol) {
        invalidateStoredSignal(cleanSym, `VOLUME_PROFILE_FILTER: Reclaimed POC/VAH=${volumeProfile.reclaimedPOCorVAH}, RVOL=${rvol} (Req >= ${minRvol}x)`);
        reconciledSignal = null;
      }
    }

    if (reconciledSignal) {
      const majorMove = qualifyMajorMoveOpportunity(reconciledSignal);
      if (majorMove.structurallySupportedMovePct >= 30.0 && majorMove.isQualified) {
        reconciledSignal.majorMoveClass = majorMove.classification;
      } else {
        reconciledSignal.majorMoveClass = 'NORMAL';
        if ((reconciledSignal.primaryCategory as string) === 'MAJOR_MOVE') {
          reconciledSignal.primaryCategory = reconciledSignal.direction === 'LONG' ? 'TREND_CONTINUATION_LONG' : 'TREND_CONTINUATION_SHORT';
        }
      }
      reconciledSignal.majorMovePotentialPct = majorMove.structurallySupportedMovePct;
      reconciledSignal.majorMoveNotes = majorMove.notes;
    }
  }

  // Phase 16: Unified Intelligence Fusion
  let unifiedFusion: any = undefined;
  try {
    const closes = primaryCandles.map(k => k.close);
    const calculatedRsi = calculateRSI(closes, 14);
    const currentRsi = calculatedRsi[calculatedRsi.length - 1] ?? 50;
    const calculatedMacd = calculateMACD(closes);
    const currentHist = calculatedMacd.histogram[calculatedMacd.histogram.length - 1] ?? 0;
    const calculatedAtr = calculateATR(primaryCandles, 14);
    const currentAtr = calculatedAtr[calculatedAtr.length - 1] ?? (currentPrice * 0.02);

    unifiedFusion = evaluateUnifiedFusion({
      symbol: cleanSym,
      currentPrice,
      entryPrice: reconciledSignal?.entryPrice || coreResult.entryPrice || currentPrice,
      stopLoss: reconciledSignal?.stopLoss || coreResult.stopLoss,
      targets: reconciledSignal?.targets || coreResult.targets,
      riskRewardRatio: reconciledSignal?.riskRewardRatio || coreResult.riskRewardRatio,
      candles: primaryCandles,
      coreDecision: coreResult.decision,
      coreConfidence: coreResult.confidence,
      qualityGrade: reconciledSignal?.qualityGrade || coreResult.qualityGrade,
      technical: {
        emaAlignment,
        rsi: currentRsi,
        macdHistogram: currentHist,
        atr: currentAtr,
        rvol,
        mtfAlignment: alignment,
        patterns: (Array.isArray(detectedPatterns) ? detectedPatterns : [detectedPatterns]) as any,
        trendlineDescription: (trendlines as any)?.summary || (trendlines as any)?.description || 'Trendline analysis'
      },
      smc: coreResult.smcStructureReport,
      orderflow: coreResult.orderflowReport,
      liquidityZones,
      derivativesData: derivatives || null,
      derivativesIntelligence: coreResult.derivativesIntelligenceReport,
      marketRegime: typeof coreResult.marketRegime === 'string' ? coreResult.marketRegime : ((coreResult.marketRegime as any)?.regime || 'NEUTRAL'),
      marketBreadth: {
        rsScoreVsBtc: opportunityReport?.rsScoreVsBtc || (coreResult as any).indicators?.rsVsBtc24h || 0,
        marketBreadthBias: 'NEUTRAL'
      },
      marketCycle: coreResult.marketCycle,
      pumpDumpIntelligence: coreResult.pumpDumpIntelligence,
      earlySetupTiming: {
        earlyCategory: earlyMoveReport?.earlyCategory,
        setupMaturity: (earlyMoveReport as any)?.setupMaturity || earlyMoveReport?.maturity || earlyMoveReport?.setupAge,
        timingWindow: earlyMoveReport?.timingWindow,
        smartEntryTiming: (earlyMoveReport as any)?.smartEntryTiming || earlyMoveReport?.entryTiming
      },
      primaryCategory: reconciledSignal?.primaryCategory || categoryReport?.primaryCategory,
      newsImpactReport,
      newListingIntelligence,
      largeMoveIntelligence,
      preMoveIntelligence: preMoveReport,
      riskAudit: {
        killSwitch: coreResult.killSwitch,
        keyRisk: coreResult.keyRisk,
        tradeManagement: reconciledSignal?.tradeManagement
      },
      timingWindow: earlyMoveReport?.timingWindow,
      executionState: (earlyMoveReport as any)?.smartEntryTiming?.readiness || (earlyMoveReport as any)?.entryTiming?.readiness || (reconciledSignal?.tradeManagement as any)?.entryTiming?.readiness || reconciledSignal?.entryStatus
    });
  } catch (fusionErr) {
    console.warn(`[SinglePair] Unified fusion error for ${cleanSym}:`, fusionErr);
  }

  if (reconciledSignal) {
    if (unifiedFusion) {
      reconciledSignal.unifiedFusion = unifiedFusion;
    }
    if (preMoveReport) {
      reconciledSignal.preMoveReport = preMoveReport;
      reconciledSignal.preMoveIntelligence = preMoveReport;
    }
    const upserted = upsertSignals([reconciledSignal]);
    if (upserted && upserted.length > 0) {
      reconciledSignal = upserted[0];
    }
  }

  // Missing confirmations explanation if decision is WAIT
  const missingConfirmations: string[] = [];
  if (coreResult.decision === 'WAIT') {
    if (coreResult.conflicts && coreResult.conflicts.length > 0) {
      missingConfirmations.push(...coreResult.conflicts);
    }
    if (rvol < 1.1) {
      missingConfirmations.push('Volume RVOL below institutional expansion threshold (< 1.1x)');
    }
    if (alignment === 'CONFLICT') {
      missingConfirmations.push('Multi-timeframe trend alignment conflict between 15m/1h/4h');
    }
    if (coreResult.killSwitch?.triggered) {
      missingConfirmations.push(`Risk Kill Switch active: ${coreResult.killSwitch.killSwitchMessage || coreResult.killSwitch.reasons.join(', ')}`);
    }
    if (missingConfirmations.length === 0) {
      missingConfirmations.push('Awaiting structural breakout confirmation and decisive candle close');
    }
  }

  const regimeStr = typeof coreResult.marketRegime === 'string'
    ? coreResult.marketRegime
    : (coreResult.marketRegime as any)?.regime || 'NEUTRAL';

  const tradeabilityStatus: 'TRADEABLE' | 'WAIT_FOR_TRIGGER' | 'UNTRADEABLE_CHOP' =
    coreResult.decision === 'LONG' || coreResult.decision === 'SHORT'
      ? 'TRADEABLE'
      : (regimeStr === 'HIGH_VOLATILITY' || regimeStr === 'NEUTRAL')
      ? 'WAIT_FOR_TRIGGER'
      : 'UNTRADEABLE_CHOP';

  const tradeabilityScore =
    coreResult.decision === 'LONG' || coreResult.decision === 'SHORT'
      ? Math.max(70, coreResult.moonScore)
      : Math.min(50, coreResult.moonScore);

  const tradeability: TradeabilitySummary = {
    decision: coreResult.decision,
    status: tradeabilityStatus,
    tradeabilityScore,
    preferredDirection: coreResult.decision === 'WAIT' ? 'NEUTRAL' : coreResult.decision,
    summary: coreResult.explanation || structureResult.explanation,
    qualityGrade: coreResult.qualityGrade,
    actionablePriority: coreResult.actionablePriority,
    entryZone: {
      low: coreResult.entryZoneLow || currentPrice,
      high: coreResult.entryZoneHigh || currentPrice,
      ideal: coreResult.entryPrice || currentPrice
    },
    stopLoss: coreResult.stopLoss || (currentAtr > 0 ? (coreResult.decision === 'SHORT' ? currentPrice + currentAtr * 1.8 : Math.max(0.000001, currentPrice - currentAtr * 1.8)) : currentPrice),
    targets: coreResult.targets || [],
    riskRewardRatio: coreResult.riskRewardRatio || 0,
    executionState: coreResult.entryStatus,
    invalidation: coreResult.invalidationReason || 'Loss of key structural support/resistance pivot',
    requiredConfirmations: coreResult.confirmations || [],
    missingConfirmations: missingConfirmations.length > 0 ? missingConfirmations : undefined
  };

  const whyThisDecision = {
    reasons: (coreResult.whyTrade && coreResult.whyTrade.length > 0)
      ? coreResult.whyTrade
      : (coreResult.conflicts && coreResult.conflicts.length > 0)
      ? coreResult.conflicts
      : [coreResult.explanation || 'Market consolidating within neutral structural range'],
    evidenceSummary: coreResult.explanation || structureResult.explanation,
    conflicts: coreResult.conflicts || [],
    unknowns: coreResult.unknowns || []
  };

  const dataFeedsStatus: DataFeedStatus = {
    priceFeed: ticker ? 'OPERATIONAL' : 'FALLBACK',
    candleHistory: primaryCandles.length >= 50 ? 'OPERATIONAL' : 'DEGRADED',
    orderBookFeed: coreResult.orderflowReport?.orderBookImbalance?.status === 'AVAILABLE' ? 'OPERATIONAL' : 'UNAVAILABLE',
    derivativesFeed: derivatives?.status === 'AVAILABLE' ? 'AVAILABLE' : 'UNAVAILABLE',
    newsFeed: newsList.length > 0 ? 'OPERATIONAL' : 'UNAVAILABLE',
    timestamp: Date.now()
  };

  const baseAsset = resolved.baseAsset || cleanSym.replace(/(USDT|BUSD|USDC)$/, '');
  const quoteAsset = resolved.quoteAsset || 'USDT';

  const lastRsi = rsi[rsi.length - 1] || 50;
  const lastAtr = atr[atr.length - 1] || (currentPrice * 0.02);
  const lastMacdLine = macd.macd[macd.macd.length - 1] || 0;
  const lastSignalLine = macd.signal[macd.signal.length - 1] || 0;
  const lastHist = macd.histogram[macd.histogram.length - 1] || 0;

  return {
    symbol: `${baseAsset}/${quoteAsset}`,
    baseAsset,
    quoteAsset,
    name: resolved.name || baseAsset,
    category,
    timeframe,
    currentPrice,
    priceChange24h,
    volume24h,
    high24h,
    low24h,
    rvol,
    atr: lastAtr,
    momentumVelocity: coreResult.pumpDumpIntelligence?.acceleration === 'ACCELERATING' ? 80 : 50,
    marketRegime: (typeof coreResult.marketRegime === 'string' ? coreResult.marketRegime : (coreResult.marketRegime as any)?.regime || 'NEUTRAL') as MarketRegimeType,
    mtfTrendState: {
      trend15m,
      trend1h,
      trend4h,
      alignment
    },
    currentStructureState: structureResult.state,
    currentStructureExplanation: structureResult.explanation,
    supportLevels,
    resistanceLevels,
    liquidityZones,
    trendlines,
    detectedPatterns: (Array.isArray(detectedPatterns) ? detectedPatterns : [detectedPatterns]) as any,
    breakoutEvaluation: undefined,
    rsi: lastRsi,
    macd: {
      macdLine: lastMacdLine,
      signalLine: lastSignalLine,
      histogram: lastHist,
      trend: lastHist >= 0 ? 'BULLISH' : 'BEARISH'
    },
    ema20,
    ema50,
    ema200,
    emaAlignment,
    smc: coreResult.smcStructureReport,
    orderflow: coreResult.orderflowReport,
    fibonacci: coreResult.fibonacciReport,
    divergenceMatrix: coreResult.divergenceMatrixReport,
    relativeStrength: coreResult.relativeStrengthReport,
    derivatives: coreResult.derivativesIntelligenceReport,
    institutionalIntelligence: coreResult.institutionalIntelligence,
    pumpDumpIntelligence: coreResult.pumpDumpIntelligence,
    marketCycle: coreResult.marketCycle,
    flowWhaleIntelligence: coreResult.flowWhaleIntelligence,
    killSwitch: coreResult.killSwitch,
    aplusConfluence: coreResult.aplusConfluence,
    opportunityReport,
    earlyMoveReport,
    marketRegimeAnalysis,
    sectorRotationAnalysis,
    smartEntryTiming: earlyMoveReport.entryTiming,
    crossAssetConfirmation: earlyMoveReport.crossAssetConfirmation,
    newsList: (newsList as any) || [],
    newsCatalystSummary: newsList[0]?.title || 'No active high-impact breaking news catalyst',
    newsImpactReport,
    listingStatus: {
      isNewListing: newListingIntelligence ? newListingIntelligence.isNewListing : category === 'NEW_LISTING',
      listingTier: category === 'NEW_LISTING' ? 'TIER_1' : undefined,
      detectedAt: newListingIntelligence?.listingTime || (Date.now() - 3600000 * 24)
    },
    newListingIntelligence,
    largeMoveIntelligence,
    unifiedFusion,
    preMoveReport,
    preMoveIntelligence: preMoveReport,
    tradeability,
    whyThisDecision,
    dataFeedsStatus,
    signal: reconciledSignal || null,
    decision: reconciledSignal ? (reconciledSignal.direction as SignalDirection) : (coreResult.decision === 'LONG' || coreResult.decision === 'SHORT' ? coreResult.decision : 'WAIT'),
    qualityGrade: reconciledSignal?.qualityGrade || coreResult.qualityGrade || 'WAIT',
    actionablePriority: reconciledSignal?.actionablePriority || coreResult.actionablePriority || 'WAIT',
    moonScore: coreResult.moonScore,
    confidence: coreResult.confidence
  };
}


