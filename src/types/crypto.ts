export type TimeFrame = '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '1d';

export type SignalDirection = 'LONG' | 'SHORT';

export type CoreDecision = 'LONG' | 'SHORT' | 'WAIT';

export type SignalQualityGrade = 'A+' | 'A' | 'B' | 'C' | 'WAIT';

export type ActionablePriority = 
  | 'ENTRY_NOW' 
  | 'HIGH_PRIORITY' 
  | 'WATCH' 
  | 'WAIT' 
  | 'INVALIDATED_EXPIRED';

// ============================================================================
// MARKET CYCLE & WYCKOFF INTELLIGENCE TYPES (PHASE 10)
// ============================================================================
export type MarketCycleType = 
  | 'ACCUMULATION' 
  | 'MARKUP' 
  | 'RE_ACCUMULATION'
  | 'DISTRIBUTION' 
  | 'RE_DISTRIBUTION'
  | 'MARKDOWN' 
  | 'TRANSITION'
  | 'TRANSITION_UNKNOWN'
  | 'UNKNOWN';

export type MarketCycleTransition = 
  | 'NONE' 
  | 'ACCUMULATION_TO_MARKUP' 
  | 'MARKUP_TO_RE_ACCUMULATION'
  | 'MARKUP_TO_DISTRIBUTION' 
  | 'DISTRIBUTION_TO_MARKDOWN' 
  | 'MARKDOWN_TO_RE_DISTRIBUTION'
  | 'MARKDOWN_TO_ACCUMULATION'
  | 'RE_ACCUMULATION_TO_MARKUP'
  | 'RE_DISTRIBUTION_TO_MARKDOWN'
  | 'TRANSITION_TO_ACCUMULATION'
  | 'TRANSITION_TO_DISTRIBUTION';

export type WyckoffEventStatus = 'DETECTED' | 'NOT_DETECTED' | 'UNKNOWN';

export type WyckoffAccumulationEvent =
  | 'PS' // Preliminary Support
  | 'SC' // Selling Climax
  | 'AR' // Automatic Rally
  | 'ST' // Secondary Test
  | 'SPRING' // Spring / Shakeout
  | 'SOS' // Sign of Strength
  | 'LPS'; // Last Point of Support

export type WyckoffDistributionEvent =
  | 'PSY' // Preliminary Supply
  | 'BC' // Buying Climax
  | 'AR' // Automatic Reaction
  | 'ST' // Secondary Test
  | 'UT' // Upthrust
  | 'UTAD' // Upthrust After Distribution
  | 'SOW' // Sign of Weakness
  | 'LPSY'; // Last Point of Supply

export interface WyckoffEventRecord {
  eventType: WyckoffAccumulationEvent | WyckoffDistributionEvent | string;
  name: string;
  category: 'ACCUMULATION' | 'DISTRIBUTION' | 'UNKNOWN';
  status: WyckoffEventStatus;
  detected: boolean;
  timestamp?: number;
  price?: number;
  volumeRatio?: number;
  confidence: number; // 0 - 100
  isConfirmed: boolean;
  evidence: string;
}

export type EffortVsResultClassification =
  | 'ABSORPTION'
  | 'CLIMAX_EXHAUSTION'
  | 'NO_SUPPLY_PULLBACK'
  | 'NO_DEMAND_BOUNCE'
  | 'EFFORT_REWARDED'
  | 'NORMAL_EFFORT_RESULT'
  | 'UNKNOWN';

export interface EffortVsResultAnalysis {
  classification: EffortVsResultClassification;
  volumeRatio: number;
  spreadRatio: number;
  effortScore: number; // 0 - 100
  resultScore: number; // 0 - 100
  interpretation: string;
  details: string[];
}

export interface CycleTransitionRecord {
  previousPhase: MarketCycleType;
  currentPhase: MarketCycleType;
  transitionConfidence: number;
  transitionTimestamp: number;
  transitionState: MarketCycleTransition | string;
  evidence: string[];
}

export interface MultiTimeframeCycleContext {
  localCycle?: { timeframe: string; phase: MarketCycleType; stage: string; confidence: number };
  intermediateCycle?: { timeframe: string; phase: MarketCycleType; stage: string; confidence: number };
  macroCycle?: { timeframe: string; phase: MarketCycleType; stage: string; confidence: number };
  alignment: 'ALIGNED_BULLISH' | 'ALIGNED_BEARISH' | 'TRANSITIONAL_CONFLUENCE' | 'CONFLICTING' | 'UNKNOWN';
  confluenceSummary: string;
  conflicts: string[];
}

export interface MarketCycleAnalysis {
  cycle: MarketCycleType;
  stage: string;
  cycleConfidence: number; // 0 - 100 evidence strength
  confidence: number; // 0 - 100 (backward compatibility)
  transitionState: MarketCycleTransition | string;
  transition?: CycleTransitionRecord;
  volumeCharacteristic: 'EXPANDING' | 'CONTRACTING' | 'CLIMACTIC' | 'NORMAL' | 'UNKNOWN';
  effortVsResult?: EffortVsResultAnalysis;
  wyckoffEvents?: {
    accumulation: Record<string, WyckoffEventRecord>;
    distribution: Record<string, WyckoffEventRecord>;
  };
  activeWyckoffEvent?: WyckoffEventRecord;
  multiTimeframeCycle?: MultiTimeframeCycleContext;
  cycleDurationBars: number;
  description: string;
  summary?: string;
  details: string[];
  isConfluentWithSignal?: boolean;
  confluenceNotes?: string[];
}

// ============================================================================
// MOMENTUM / PUMP / DUMP INTELLIGENCE TYPES
// ============================================================================
export interface PumpDumpIntelligence {
  acceleration: 'ACCELERATING' | 'STEADY' | 'DECELERATING' | 'NEUTRAL';
  volumeAcceleration: 'EXPLOSIVE' | 'ABOVE_AVERAGE' | 'NORMAL' | 'DRYING_UP';
  pumpIgnition: boolean;
  fakePumpRisk: 'HIGH' | 'MODERATE' | 'LOW';
  climaxDetected: boolean;
  postPumpExhaustion: boolean;
  dumpRisk: 'CRITICAL' | 'ELEVATED' | 'MODERATE' | 'LOW';
  liquidityVacuum: boolean;
  abnormalExtension: boolean;
  sellTheNewsRisk: boolean;
  warningDetails: string[];
  setupValid: boolean;
  catalystSupportSummary: string;
  moveClassification?: 'EARLY_PUMP_SETUP' | 'CONFIRMED_PUMP' | 'EARLY_DUMP_SETUP' | 'CONFIRMED_DUMP' | 'NORMAL_MOVE' | 'NO_TRADE';
}

// ============================================================================
// FLOW / WHALE INTELLIGENCE TYPES
// ============================================================================
export interface FlowWhaleIntelligence {
  status: 'AVAILABLE' | 'UNKNOWN' | 'UNAVAILABLE';
  inflowOutflowBias: 'INFLOW_DOMINANT' | 'OUTFLOW_DOMINANT' | 'BALANCED' | 'UNKNOWN';
  abnormalTransfers: boolean;
  largeVolumeFlow: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' | 'UNKNOWN';
  liquidityChange24hPct?: number;
  exchangeNetFlowStatus?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  details: string;
  evidence: string[];
}

// ============================================================================
// NO-TRADE / KILL SWITCH TYPES
// ============================================================================
export interface KillSwitchEvaluation {
  triggered: boolean;
  action: 'TRADE_ALLOWED' | 'NO_TRADE_WAIT';
  reasons: string[];
  severity: 'CRITICAL' | 'WARNING' | 'NONE';
  metrics: {
    volatilityTooHigh: boolean;
    liquidityUnstable: boolean;
    severeConflict: boolean;
    structureBroken: boolean;
    adversarialRejection: boolean;
    dataUnreliable: boolean;
  };
  killSwitchMessage?: string;
}

// ============================================================================
// ADVANCED A+ CONFLUENCE TYPES
// ============================================================================
export interface AplusConfluenceReport {
  isAplusQualified: boolean;
  isAPlus?: boolean;
  recommendedGrade?: SignalQualityGrade;
  independentConfirmationsCount: number;
  evidenceCorrelationPenalty: number;
  timingQualityScore: number; // 0 - 100
  expectedMoveVsRiskRatio: number;
  correlatedMarketRisk: 'HIGH' | 'MODERATE' | 'LOW';
  criticalGatesPassed: boolean;
  failedGates: string[];
  supportingScore: number; // 0 - 100
  falseAplusPrevented: boolean;
  falseAplusReason?: string;
  summary: string;
}

export type EntryReadiness = 
  | 'ENTRY_NOW' 
  | 'WAIT_FOR_ENTRY' 
  | 'WAIT_FOR_PULLBACK' 
  | 'WAIT_FOR_RETEST' 
  | 'WAIT_FOR_CONFIRMATION' 
  | 'ENTRY_MISSED' 
  | 'INVALID' 
  | 'INVALIDATED'
  | 'EXPIRED';

export type EntryQualityClassification = 
  | 'OPTIMAL_ENTRY' 
  | 'GOOD_ENTRY' 
  | 'ACCEPTABLE_ENTRY' 
  | 'EXTENDED_ENTRY' 
  | 'CHASE_RISK' 
  | 'INVALID_ENTRY';

export type BreakoutClassification = 
  | 'GENUINE_BREAKOUT' 
  | 'POTENTIAL_BREAKOUT' 
  | 'FAKE_BREAKOUT' 
  | 'FAILED_BREAKOUT' 
  | 'BREAKOUT_RETEST' 
  | 'CONFIRMED_CONTINUATION';

export type BreakoutStage = 
  | 'PRE_BREAKOUT' 
  | 'BREAKOUT' 
  | 'BREAKOUT_CONFIRMED' 
  | 'RETEST' 
  | 'RETEST_CONFIRMED' 
  | 'CONTINUATION' 
  | 'FAILED_BREAKOUT';

export type LiquidityZoneType = 
  | 'EQUAL_HIGHS' 
  | 'EQUAL_LOWS' 
  | 'SWING_HIGH' 
  | 'SWING_LOW' 
  | 'RANGE_HIGH' 
  | 'RANGE_LOW' 
  | 'BREAKOUT_LEVEL' 
  | 'BREAKDOWN_LEVEL' 
  | 'MAJOR_SUPPORT' 
  | 'MAJOR_RESISTANCE' 
  | 'PATTERN_NECKLINE' 
  | 'TRENDLINE_LEVEL' 
  | 'HIGH_VOLUME_NODE';

export interface LiquidityZone {
  price: number;
  type: LiquidityZoneType;
  strength: number; // 0 - 100
  distanceFromPricePct: number;
  relevance: 'HIGH' | 'MEDIUM' | 'LOW';
  touched: boolean;
  touchCount: number;
  swept: boolean;
  description: string;
}

export type SweepSequenceType = 
  | 'BULLISH_SWEEP' 
  | 'BEARISH_SWEEP' 
  | 'FAILED_SWEEP' 
  | 'CONFIRMED_RECLAIM' 
  | 'CONTINUATION_AFTER_SWEEP' 
  | 'NONE';

export type MomentumExhaustionLevel = 
  | 'NO_EXHAUSTION' 
  | 'EARLY_EXHAUSTION' 
  | 'MODERATE_EXHAUSTION' 
  | 'HIGH_EXHAUSTION';

export type PriceExtensionLevel = 
  | 'OPTIMAL' 
  | 'EXTENDED' 
  | 'SEVERELY_EXTENDED';

export type MarketBehaviorType = 
  | 'TRENDING_UP' 
  | 'TRENDING_DOWN' 
  | 'RANGE_BOUND' 
  | 'BREAKOUT_EXPANSION' 
  | 'BREAKOUT_RETEST' 
  | 'MEAN_REVERSION' 
  | 'LIQUIDITY_SWEEP' 
  | 'FAILED_BREAKOUT' 
  | 'HIGH_VOLATILITY' 
  | 'LOW_MOMENTUM' 
  | 'UNKNOWN';

export interface LiquidityAsymmetry {
  upsideLiquidityScore: number;
  downsideLiquidityScore: number;
  ratio: number;
  bias: 'FAVORS_LONG' | 'FAVORS_SHORT' | 'NEUTRAL';
  description: string;
}

export type LiquidityClassification = 
  | 'LIQUIDITY_SWEEP' 
  | 'POSSIBLE_STOP_HUNT' 
  | 'FAILED_BREAKOUT' 
  | 'EQUAL_HIGHS' 
  | 'EQUAL_LOWS' 
  | 'BUY_SIDE_LIQUIDITY' 
  | 'SELL_SIDE_LIQUIDITY' 
  | 'RANGE_BOUND_LIQUIDITY' 
  | 'CLEAN_STRUCTURE';

export type MarketRegimeType = 'STRONG_BULL' | 'BULL' | 'NEUTRAL' | 'BEAR' | 'STRONG_BEAR' | 'HIGH_VOLATILITY' | 'UNKNOWN';

export type DataQualityRating = 'HIGH' | 'MEDIUM' | 'LOW' | 'INVALID';

export type EvidenceState = 'CONFIRMED' | 'SUPPORTIVE' | 'NEUTRAL' | 'CONFLICTING' | 'UNKNOWN' | 'INVALID';

export type SignalStatus = 
  | 'SIGNAL_CREATED'
  | 'ENTRY_PENDING'
  | 'ACTIVE' 
  | 'TRIGGERED' 
  | 'TP_PROGRESS'
  | 'TP1_HIT' 
  | 'TP2_HIT' 
  | 'TP3_HIT' 
  | 'FINAL_TARGET_REACHED'
  | 'COMPLETED'
  | 'STOPPED_OUT' 
  | 'EXPIRED' 
  | 'CANCELLED'
  | 'INVALIDATED';

export type TargetConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INVALID';
export type TargetStatus = 'ACTIVE' | 'HIT' | 'INVALIDATED' | 'PROTECTED';
export type ProtectionMode = 'ORIGINAL_SL' | 'BREAK_EVEN' | 'STRUCTURAL_TRAILING' | 'PROFIT_LOCKED' | 'INVALIDATED';

export interface TargetLevel {
  id: 'TP1' | 'TP2' | 'TP3' | string;
  label: string;
  price: number;
  percentage?: number;
  rMultiple?: number;
  evidenceLevel?: string;
  hit?: boolean;
  hitTime?: number;
  confidence?: TargetConfidence;
  sources?: string[];
  structuralBasis?: string;
  status?: TargetStatus;
  invalidationReason?: string;
  isClustered?: boolean;
  confluentCount?: number;
}

export interface TradeManagementAnalysis {
  protectionMode: ProtectionMode;
  recommendedStopLoss: number;
  originalStopLoss: number;
  trailingAnchor?: string;
  isRiskWidened: boolean;
  postTpHitStatus?: {
    tpHitIndex: number;
    continuationViable: boolean;
    reason: string;
  };
  parabolicProtection?: {
    detected: boolean;
    extensionRatio: number;
    action: string;
  };
  activeTargetsCount: number;
  hitTargetsCount: number;
  invalidatedTargetsCount: number;
  runnerExtensionActive: boolean;
  details: string[];
}

export interface TradeWindow {
  entryWindowStart: number;
  entryWindowEnd: number;
  expiresAt: number;
  formattedStartBST?: string;
  formattedEndBST?: string;
  formattedExpiryBST?: string;
}

export interface HypothesisCase {
  direction: 'LONG' | 'SHORT';
  overallCaseStrength: number; // 0 - 100
  structuralStrength: number; // 0 - 100
  supportingEvidence: string[];
  conflictingEvidence: string[];
  unknownEvidence: string[];
  strongestConfirmation: string;
  strongestContradiction: string;
  marketRegimeAlignment: boolean;
  riskRewardQuality: number;
  entryQuality: 'OPTIMAL' | 'ACCEPTABLE' | 'EXTENDED' | 'POOR';
  dataQuality: DataQualityRating;
}

export interface AdversarialAudit {
  targetDirection: 'LONG' | 'SHORT' | 'WAIT';
  primaryFailureRisk: string;
  opposingStructureRisk: boolean;
  liquidityRisk: boolean;
  breakoutFailureRisk: boolean;
  derivativesConflictRisk: boolean;
  newsConflictRisk: boolean;
  chaseRisk: boolean;
  riskRewardRisk: boolean;
  adversarialVerdict: 'APPROVED' | 'DOWNGRADED' | 'REJECTED';
  verdict?: 'APPROVED' | 'DOWNGRADED' | 'REJECTED';
  auditScore?: number;
  fatalFlaw?: string;
  downgradePenalty: number;
  details: string[];
}

export interface PullbackZone {
  low: number;
  high: number;
  idealEntry: number;
  structuralReference: string;
  description: string;
}

export interface AdaptiveExecutionAnalysis {
  readiness: EntryReadiness;
  isExecutable: boolean;
  chaseRisk: boolean;
  exhaustionRisk: boolean;
  retestRequired: boolean;
  retestConfirmed: boolean;
  pullbackZone?: PullbackZone;
  retestLevel?: number;
  safestExecutionZone?: { low: number; high: number; idealPrice: number };
  executionReason: string;
  executionConfidence: number; // 0 - 100
  actionGuidance: string;
  details: string[];
}

export interface CoreIntelligenceMetadata {
  marketRegime: MarketRegimeType;
  marketBehavior?: MarketBehaviorType;
  dataQuality: DataQualityRating;
  decision: CoreDecision;
  entryStatus: EntryReadiness;
  qualityGrade?: SignalQualityGrade;
  actionablePriority?: ActionablePriority;
  entryQualityRating?: EntryQualityClassification;
  exhaustionLevel?: MomentumExhaustionLevel;
  priceExtensionLevel?: PriceExtensionLevel;
  liquidityAsymmetry?: LiquidityAsymmetry;
  adaptiveExecution?: AdaptiveExecutionAnalysis;
  executionStatus?: EntryReadiness;
  executionReason?: string;
  pullbackZone?: PullbackZone;
  retestLevel?: number;
  chaseRisk?: boolean;
  safestExecutionZone?: { low: number; high: number; idealPrice: number };
  tradeManagement?: TradeManagementAnalysis;
  confirmations: string[];
  conflicts: string[];
  unknowns: string[];
  explanation: string;
  riskExplanation?: string;
  tradeWindow?: TradeWindow;
  whyTrade?: string[];
  whyNotPerfect?: string[];
  keyRisk?: string;
  entryReason?: string;
  invalidationReason?: string;
  liquidityReason?: string;
  breakoutReason?: string;
  regimeReason?: string;
  exhaustionReason?: string;
  conflictReason?: string;
  targetReasons?: { targetId: string; reason: string }[];
  longCase?: HypothesisCase;
  shortCase?: HypothesisCase;
  adversarialAudit?: AdversarialAudit;
  liquidityZones?: LiquidityZone[];
  marketCycle?: MarketCycleAnalysis;
  pumpDump?: PumpDumpIntelligence;
  pumpDumpIntelligence?: PumpDumpIntelligence;
  flowWhale?: FlowWhaleIntelligence;
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
  category?: MarketCategory;
  opportunityReport?: OpportunityDiscoveryReport;
  opportunityScore?: number;
  rankingBucket?: 'STRONGEST_A_PLUS' | 'STRONGEST_A' | 'EARLY_OPPORTUNITY' | 'WATCH_OPPORTUNITY' | 'WAIT';
}

// ============================================================================
// PHASE 5.5: UNIVERSAL MARKET COVERAGE & OPPORTUNITY DISCOVERY TYPES
// ============================================================================
export type MarketCategory = 'MAJOR' | 'ALTCOIN' | 'MEME_HIGH_BETA' | 'NEW_LISTING';

export type ExpectedMoveClass =
  | 'MACRO_EXPANSION_100PCT_PLUS'
  | 'HIGH_EXPANSION_50PCT_PLUS'
  | 'MOMENTUM_EXPANSION_25PCT_PLUS'
  | 'STANDARD_SWING_10_25PCT'
  | 'RANGE_BOUND_UNDER_10PCT';

export type HighImpactOpportunityType =
  | 'EARLY_CATALYST_SETUP'
  | 'EARLY_MOMENTUM_SETUP'
  | 'COMPRESSION_EXPANSION'
  | 'BREAKOUT_RETEST'
  | 'LIQUIDITY_SWEEP_RECLAIM'
  | 'POST_PUMP_EXHAUSTION'
  | 'DUMP_RISK'
  | 'SELL_THE_NEWS'
  | 'DISTRIBUTION';

export type OpportunityType =
  | 'EARLY_VOLUME_ACCELERATION'
  | 'RVOL_EXPANSION'
  | 'COMPRESSION_EXPANSION'
  | 'BREAKOUT_RETEST'
  | 'LIQUIDITY_SWEEP_RECLAIM'
  | 'RELATIVE_STRENGTH_BTC'
  | 'DERIVATIVES_ACCELERATION'
  | 'CATALYST_ACCELERATION'
  | 'NEW_LISTING_MOMENTUM'
  | 'SMC_STRUCTURAL_SETUP'
  | 'PRE_PUMP_CATALYST'
  | 'POST_PUMP_CLIMAX';

export interface OpportunityDiscoveryReport {
  symbol: string;
  category: MarketCategory;
  opportunityScore: number; // 0 - 100
  detectedPatterns: OpportunityType[];
  earlySetupType: 'EARLY_CATALYST_SETUP' | 'EARLY_MOMENTUM_SETUP' | 'COMPRESSION_BREAKOUT' | 'NONE';
  rvol: number;
  priceVelocityScore: number;
  compressionScore: number;
  rsScoreVsBtc: number; // Relative strength vs BTC
  smcStructure: 'BOS' | 'CHOCH' | 'ORDER_BLOCK_TAP' | 'FVG_FILL' | 'LIQUIDITY_GRAB' | 'NONE';
  postPumpDumpRisk: 'CRITICAL' | 'ELEVATED' | 'MODERATE' | 'LOW';
  summary: string;
  evidenceList: string[];
  rankingBucket: 'STRONGEST_A_PLUS' | 'STRONGEST_A' | 'EARLY_OPPORTUNITY' | 'WATCH_OPPORTUNITY' | 'WAIT';
}

export type ExchangeProviderId = 'binance' | 'bybit' | 'okx' | 'mexc' | 'fallback';
export type ProviderHealthStatus = 'OPERATIONAL' | 'DEGRADED' | 'RATE_LIMITED' | 'RECONNECTING' | 'OFFLINE';

export interface ProviderHealthReport {
  providerId: ExchangeProviderId;
  status: ProviderHealthStatus;
  latencyMs: number;
  lastSuccessfulRequest: number;
  consecutiveFailures: number;
  isRateLimited: boolean;
  rateLimitCooldownUntil: number;
  wsConnected: boolean;
}

export interface MarketDataQualityReport {
  symbol: string;
  isStale: boolean;
  stalenessMs: number;
  lastUpdated: number;
  primarySource: ExchangeProviderId;
  activeSources: ExchangeProviderId[];
  isContradictory: boolean;
  dataCompletenessScore: number; // 0 - 100
  qualityRating: 'PRISTINE_REALTIME' | 'ACCEPTABLE' | 'DEGRADED' | 'DATA_STALE' | 'CRITICALLY_UNAVAILABLE';
}

export interface MarketCoverageTelemetry {
  totalEligibleDiscovered: number;
  totalAssetsScanned: number;
  successfulScans: number;
  failedOrUnavailableScans: number;
  waitCount: number;
  actionableCount: number;
  staleCount?: number;
  wsStreamsActive?: number;
  lastUpdateLatencyMs?: number;
  categoryDistribution: {
    major: number;
    altcoin: number;
    memeHighBeta: number;
    newListing: number;
  };
  lastScanTimestamp: number;
  providerStatus: {
    binance: 'OPERATIONAL' | 'DEGRADED' | 'FALLBACK_SYNTHETIC' | 'RATE_LIMITED' | 'OFFLINE';
    bybit?: 'OPERATIONAL' | 'DEGRADED' | 'RATE_LIMITED' | 'OFFLINE';
    okx?: 'OPERATIONAL' | 'DEGRADED' | 'RATE_LIMITED' | 'OFFLINE';
    mexc?: 'OPERATIONAL' | 'DEGRADED' | 'RATE_LIMITED' | 'OFFLINE';
    coingecko?: string;
    derivativesProvider?: string;
  };
  providerHealth?: Record<string, ProviderHealthReport>;
}

// ============================================================================
// PHASE 6.2: ADVANCED OPPORTUNITY RANKING & SIGNAL PRIORITIZATION TYPES
// ============================================================================

export type OpportunityRankingTier =
  | 'TIER_1_A_PLUS_ELITE'
  | 'TIER_2_A_HIGH_CONVICTION'
  | 'TIER_3_EARLY_OPPORTUNITY'
  | 'TIER_4_WATCH_RETEST'
  | 'TIER_5_WAIT_CHOP'
  | 'TIER_6_EXPIRED_INVALIDATED';

export interface OpportunityScoreBreakdown {
  qualityGradeScore: number;
  riskRewardScore: number;
  realisticUpsideScore: number;
  structuralTpScore: number;
  executionReadinessScore: number;
  mtfConfluenceScore: number;
  volumeVelocityScore: number;
  smcStructureScore: number;
  orderflowScore: number;
  relativeStrengthScore: number;
  derivativesScore: number;
  catalystScore: number;
  obstacleClearanceScore: number;
  dumpRiskPenalty: number;
  dataQualityScore: number;
}

export interface OpportunityPriorityAnalysis {
  priorityRank?: number;
  priorityScore: number;
  rankingTier: OpportunityRankingTier;
  realisticUpsidePct: number;
  genuineTpCount: number;
  keyRankReasons: string[];
  scoreBreakdown: OpportunityScoreBreakdown;
}

export interface OpportunityRanking {
  strongestAPlus: Signal[];
  strongestA: Signal[];
  earlyOpportunities: Signal[];
  watchOpportunities: Signal[];
  topRankedOpportunities?: Signal[];
  telemetry: MarketCoverageTelemetry;
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
  
  // Price parameters
  entryPrice: number;
  entryZoneLow?: number;
  entryZoneHigh?: number;
  stopLoss: number;
  
  // Canonical Target Collection (Single source of truth)
  targets: TargetLevel[];
  
  // Backward-compatibility scalar fields (mirroring targets[0..2])
  tp1: number;
  tp2: number;
  tp3: number;
  
  riskRewardRatio: number;
  currentPrice: number;
  priceChange24h: number;
  volume24h?: number;
  
  // Technical context
  pattern?: string;
  trendlineAngle?: number;
  trendlineDescription?: string;
  marketStructure?: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'BOS' | 'CHOCH';
  rsi?: number;
  macdSignal?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confluences: ConfluenceItem[];
  
  // Derivatives info
  openInterestChange24h?: number;
  fundingRate?: number;
  
  // Timestamps
  timestamp: number; // Candle timestamp / Trigger timestamp (epoch ms)
  createdAt: number;
  expiresAt: number;
  triggeredAt?: number;
  closedAt?: number;
  
  // Notes / Catalysts
  newsCatalyst?: string;
  notes?: string;
  
  // Phase 5.5 Universal Market Coverage & Opportunity Discovery
  category?: MarketCategory;
  opportunityReport?: OpportunityDiscoveryReport;
  opportunityScore?: number;
  rankingBucket?: 'STRONGEST_A_PLUS' | 'STRONGEST_A' | 'EARLY_OPPORTUNITY' | 'WATCH_OPPORTUNITY' | 'WAIT';

  // Phase 6.2 & Phase 18 Advanced Opportunity Ranking & Signal Prioritization
  priorityScore?: number;
  priorityRank?: number;
  rankingTier?: OpportunityRankingTier;
  opportunityPriority?: OpportunityPriorityAnalysis;
  expectedMoveClass?: ExpectedMoveClass;
  highImpactType?: HighImpactOpportunityType;
  unifiedFusionScore?: number;

  // Phase 6 Institutional-Grade Market Intelligence
  institutionalIntelligence?: InstitutionalIntelligenceReport;
  smcStructureReport?: SMCStructureReport;
  orderflowReport?: OrderflowReport;
  fibonacciReport?: FibonacciConfluenceReport;
  divergenceMatrixReport?: DivergenceMatrixReport;
  relativeStrengthReport?: RelativeStrengthMacroReport;
  derivativesReport?: DerivativesIntelligenceReport;
  derivativesIntelligenceReport?: DerivativesIntelligenceReport;
  
  // Phase 3, 4 & 4.7 Core Intelligence additions
  marketRegime?: MarketRegimeType;
  dataQuality?: DataQualityRating;
  entryStatus?: EntryReadiness;
  qualityGrade?: SignalQualityGrade;
  actionablePriority?: ActionablePriority;
  tradeWindow?: TradeWindow;
  confirmations?: string[];
  conflicts?: string[];
  unknowns?: string[];
  explanation?: string;
  whyTrade?: string[];
  whyNotPerfect?: string[];
  keyRisk?: string;
  entryReason?: string;
  invalidationReason?: string;
  longCase?: HypothesisCase;
  shortCase?: HypothesisCase;
  adversarialAudit?: AdversarialAudit;
  liquidityAnalysis?: any;
  breakoutEvaluation?: any;
  adaptiveExecution?: AdaptiveExecutionAnalysis;
  executionStatus?: EntryReadiness;
  executionReason?: string;
  pullbackZone?: PullbackZone;
  retestLevel?: number;
  chaseRisk?: boolean;
  tradeManagement?: TradeManagementAnalysis;
  coreIntelligence?: CoreIntelligenceMetadata;
  marketCycle?: MarketCycleAnalysis;
  pumpDump?: PumpDumpIntelligence;
  pumpDumpIntelligence?: PumpDumpIntelligence;
  flowWhale?: FlowWhaleIntelligence;
  flowWhaleIntelligence?: FlowWhaleIntelligence;
  killSwitch?: KillSwitchEvaluation;
  aplusConfluence?: AplusConfluenceReport;
  unifiedEvidence?: any;
  catalystTradePipeline?: CatalystTradePipeline;
  
  // Phase 8: Predictive Opportunity & Market Regime Intelligence
  marketRegimeAnalysis?: MarketRegimeAnalysis;
  earlyMoveReport?: EarlyMoveReport;
  sectorRotationAnalysis?: SectorRotationAnalysis;
  crossAssetConfirmation?: CrossAssetConfirmationReport;
  smartEntryTiming?: SmartEntryTiming;

  // Phase 9: Smart Risk + Trade Management
  smartRiskReport?: SmartRiskReport;

  // Phase 11: Early Setup + Timing Intelligence
  earlyCategory?: EarlySetupCategory;
  setupMaturity?: SetupMaturity;
  timingWindow?: TimingWindow;
  setupAge?: string;
  triggerCondition?: string;
  whyEarlySetupMatters?: string;

  // Phase 12: Long/Short Category Intelligence
  primaryCategory?: PrimarySetupCategory;
  categoryConfluences?: PrimarySetupCategory[];
  previousCategory?: PrimarySetupCategory;
  categoryTransitionHistory?: CategoryTransitionRecord[];
  categoryIntelligence?: CategoryIntelligenceReport;
  categoryReasoning?: string;

  // Phase 13: News Intelligence 2.0 (News -> Market Impact Intelligence)
  newsImpactReport?: NewsMarketImpactReport;
  newsIntelligence?: NewsMarketImpactReport;

  // Phase 14: New Listing Intelligence
  newListingIntelligence?: NewListingIntelligenceReport;

  // Phase 15: Large Move + Asymmetric Opportunity Intelligence
  largeMoveIntelligence?: LargeMoveOpportunityReport;

  // Phase 16: Unified Intelligence Fusion
  unifiedFusion?: UnifiedFusionReport;

  // Signal Lifecycle Tracking
  entryTriggeredAt?: number;
  activeDurationMs?: number;
  finalState?: SignalStatus;

  // Pre-Move Intelligence
  preMoveReport?: PreMoveReport;
  preMoveIntelligence?: PreMoveReport;
  isPreMove?: boolean;
  largeMoveClass?: LargeMoveClass;
  largeMovePotentialLabel?: string;
  isExtremeCandidate?: boolean;
  preMoveDetailedState?: string;
  expectedMovePct?: number;

  // Major Move Qualification
  majorMoveClass?: MajorMoveClassification;
  majorMovePotentialPct?: number;
  majorMoveNotes?: string[];

  // Event-Driven Alert Tracking
  telegramAlertStatus?: {
    lastAlertedAt?: number;
    lastAlertType?: string;
    signature?: string;
  };

  // Dedicated Big Move & Dump Hunter & Exceptional Opportunity Reports
  bigMoveHunter?: BigMoveHunterReport;
  dumpHunter?: DumpHunterReport;
  exceptionalOpportunity?: ExceptionalOpportunityReport;
}

export type TelegramAlertType =
  | 'PRE_PUMP'
  | 'PRE_DUMP'
  | 'NEWS_SIGNAL'
  | 'NEW_LISTING_SIGNAL'
  | 'MAJOR_MOVE'
  | 'EXTREME_MOVE';

export interface TelegramAlertRecord {
  id: string;
  timestamp: number;
  alertType: TelegramAlertType;
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryLow: number;
  entryHigh: number;
  currentPrice: number;
  stopLoss: number;
  targets: Array<{ label: string; price: number; percentage: number }>;
  expectedMovePct: number;
  riskRewardRatio: number;
  qualityGrade: string;
  confidence: number;
  whyReason: string;
  sourceType: string;
  formattedMessage: string;
  signature: string;
  status: 'SENT' | 'FAILED' | 'PENDING_CONFIG' | 'SUPPRESSED_DUPLICATE';
  errorMessage?: string;
}

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
  enabled: boolean;
  minGrade: 'ALL' | 'B' | 'A' | 'A+';
  enablePreMoveAlerts: boolean;
  enableNewsAlerts: boolean;
  enableNewListingAlerts: boolean;
  enableMajorMoveAlerts: boolean;
  enableExtremeMoveAlerts: boolean;
}

export interface CryptoCandle {
  timestamp: number;
  time?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Candle = CryptoCandle;

export interface CryptoPair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

export type NewsSourceTier = 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4' | 'UNKNOWN';

export type NewsSentiment = 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL' | 'UNKNOWN';

export type NewsEventType =
  | 'LISTING'
  | 'DELISTING'
  | 'PARTNERSHIP'
  | 'INTEGRATION'
  | 'MAINNET'
  | 'TESTNET'
  | 'TOKEN_LAUNCH'
  | 'AIRDROP'
  | 'UNLOCK'
  | 'BURN'
  | 'SUPPLY_CHANGE'
  | 'GOVERNANCE'
  | 'FUNDING'
  | 'INSTITUTIONAL'
  | 'REGULATION'
  | 'SECURITY'
  | 'HACK'
  | 'OUTAGE'
  | 'UPGRADE'
  | 'FORK'
  | 'HARD_FORK'
  | 'ETF'
  | 'ETF_FLOW'
  | 'ECOSYSTEM'
  | 'DEVELOPER'
  | 'MACRO'
  | 'GEOPOLITICAL'
  | 'OTHER';

export type NewsImpactLevel = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type NewsFreshness = 'BREAKING' | 'FRESH' | 'RECENT' | 'AGING' | 'HISTORICAL';

// ============================================================================
// PHASE 13: NEWS INTELLIGENCE 2.0 (NEWS → MARKET IMPACT INTELLIGENCE)
// ============================================================================

export type NewsCatalystType =
  | 'EXCHANGE_LISTING'
  | 'DELISTING'
  | 'PARTNERSHIP'
  | 'ETF'
  | 'REGULATION'
  | 'TOKEN_UNLOCK'
  | 'HACK_EXPLOIT'
  | 'FUNDING_INVESTMENT'
  | 'MAINNET'
  | 'UPGRADE'
  | 'AIRDROP'
  | 'BURN'
  | 'WHALE_ONCHAIN'
  | 'MACRO'
  | 'GEOPOLITICAL'
  | 'RUMOR'
  | 'FAKE_MISLEADING'
  | 'UNKNOWN';

export type NewsImpactClassification =
  | 'PUMP_CATALYST'
  | 'DUMP_RISK'
  | 'HIGH_IMPACT'
  | 'MEDIUM_LOW'
  | 'NEUTRAL'
  | 'UNKNOWN';

export type SourceCredibilityTier =
  | 'TIER_1_OFFICIAL'
  | 'TIER_2_TIER1_MEDIA'
  | 'TIER_3_SECONDARY'
  | 'TIER_4_SOCIAL_UNVERIFIED'
  | 'UNKNOWN';

export type NewsVerificationStatus =
  | 'VERIFIED'
  | 'UNVERIFIED_RUMOR'
  | 'DISPUTED_FAKE'
  | 'UNKNOWN';

export type NewsReactionWindowPeriod = '5m' | '15m' | '30m' | '1h' | '4h';

export type ReactionWindowStatus =
  | 'BULLISH_EXPANSION'
  | 'BEARISH_DUMP'
  | 'ABSORPTION_FADE'
  | 'NO_REACTION'
  | 'PENDING_TIME'
  | 'UNAVAILABLE';

export interface ReactionWindowMetric {
  window: NewsReactionWindowPeriod;
  priceChangePct: number | null; // null if pending or unavailable (no fabricated data)
  volumeRatio: number | null;
  status: ReactionWindowStatus;
  barCount: number;
}

export type NewsReactionConflictType =
  | 'BULLISH_NEWS_BEARISH_PRICE'
  | 'BEARISH_NEWS_BULLISH_PRICE'
  | 'HIGH_IMPACT_NO_VOLUME'
  | 'RUMOR_FADE_RISK'
  | 'NONE'
  | 'UNKNOWN';

export type NewsTechnicalAlignment =
  | 'SUPPORTS_LONG'
  | 'SUPPORTS_SHORT'
  | 'WEAKENS_SETUP'
  | 'CONTRADICTS_SETUP'
  | 'NEUTRAL'
  | 'UNKNOWN';

export interface NewsMarketImpactReport {
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  symbol: string;
  catalystType: NewsCatalystType;
  impactClassification: NewsImpactClassification;
  impactScore: number; // 0 - 100
  catalystConfidence: number; // 0 - 100
  sourceCredibilityTier: SourceCredibilityTier;
  sourceCredibilityScore: number; // 0 - 100
  verificationStatus: NewsVerificationStatus;
  isRumorOrUnverified: boolean;
  isFakeOrMisleading: boolean;
  isConfirmedCatalyst: boolean;

  // Coin Mapping
  primaryCoin?: string;
  matchedCoins: string[];
  mappingConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

  // Freshness & Sources
  headline: string;
  summary: string;
  source: string;
  supportingSources: string[];
  sourceCount: number;
  publishedAt?: number;
  detectedAt?: number;
  ageMinutes?: number;
  freshness: NewsFreshness;

  // Reaction Windows (5m, 15m, 30m, 1h, 4h)
  reactionWindows: Record<NewsReactionWindowPeriod, ReactionWindowMetric>;
  marketReactionState: MarketReactionState;
  reactionConflict: NewsReactionConflictType;
  conflictWarning?: string;

  // Technical Setup Alignment
  technicalAlignment: NewsTechnicalAlignment;
  alignmentExplanation: string;
  confluenceNotes: string[];
  contradictionNotes: string[];

  // Anti-fabrication guard
  isFabricated: false;
}

export type MarketReactionState = 'CONFIRMED' | 'PARTIALLY_CONFIRMED' | 'REJECTED' | 'NOT_YET_REACTED' | 'UNKNOWN';

export type ListingStatus = 'PRE_LISTING' | 'LISTING_LIVE' | 'POST_LISTING' | 'NONE';

export type ListingRadarAssessment = 'BULLISH_POTENTIAL' | 'BEARISH_RISK' | 'MIXED' | 'INSUFFICIENT_DATA';

export type PostListingClassification = 
  | 'EARLY_LONG_OPPORTUNITY' 
  | 'WAIT_FOR_PULLBACK' 
  | 'WAIT_FOR_CONFIRMATION' 
  | 'PUMP_EXHAUSTION' 
  | 'DUMP_RISK' 
  | 'NO_VALID_SETUP';

export interface PrePumpCatalystSetup {
  isPrePumpCatalyst: boolean;
  setupType: 'EARLY_CATALYST_SETUP' | 'COMPRESSION_BREAKOUT_CATALYST' | 'NONE';
  catalystName: string;
  compressionScore: number;
  volumeAcceleration: boolean;
  readinessScore?: number;
  conviction: 'HIGH' | 'MEDIUM' | 'LOW';
  details: string[];
}

export interface ExhaustionDumpRisk {
  pumpExhaustionDetected: boolean;
  dumpRiskDetected: boolean;
  status: 'PUMP_EXHAUSTION' | 'DUMP_RISK' | 'HEALTHY_TREND' | 'NONE';
  abnormalMovePercent: number;
  distanceFromEma20Pct: number;
  rsiClimax: boolean;
  isClimaxVolume?: boolean;
  exhaustionScore?: number;
  details: string[];
}

export interface NewListingInfo {
  exchange: string;
  tradingPair: string;
  listingTime: number;
  launchStatus: ListingStatus;
  launchpadInfo?: string;
  circulatingSupplyPct?: number;
  unlockRisk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  preListingRadar?: { assessment: ListingRadarAssessment; details: string[] };
  postListingAnalysis?: { classification: PostListingClassification; details: string[] };
  // Trade setup when sufficient structure exists (otherwise WAIT / UNKNOWN)
  decision?: 'LONG' | 'SHORT' | 'WAIT';
  entryZone?: { low: number; high: number; ideal: number };
  stopLoss?: number;
  targets?: TargetLevel[];
  riskRewardRatio?: number;
  executionStatus?: string;
  invalidation?: string;
  pumpDumpRisk?: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
}

export interface NewListingItem {
  id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: 'BINANCE' | 'MEXC' | 'OKX' | 'BYBIT' | 'OTHER';
  listedAt: number | null;
  scheduledListingTime?: number | null;
  listedDateFormatted: string;
  listingAgeHours: number;
  launchStatus: ListingStatus;
  initialSpikePct: number | null;
  currentPriceChange24h: number;
  volume24hUsd: number | null;
  rvol: number;
  stage: 'INITIAL_SPIKE' | 'PRICE_DISCOVERY' | 'BASE_BUILDING' | 'BLEED_MARKDOWN' | 'ESTABLISHED' | 'PRE_ANNOUNCEMENT' | 'UPCOMING' | 'PRE_MARKET' | 'LIVE' | 'ACTIONABLE' | 'COMPLETED' | 'CANCELLED';
  earlyStructure: 'ACCUMULATION_BASE' | 'BREAKOUT_RETEST' | 'FVG_TAP' | 'DISTRIBUTION_BLEED' | 'UNFORMED_VOLATILE';
  relativeStrengthVsBtc: number;
  pumpDumpRisk: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  pumpDumpIntelligence?: {
    volumeVelocity: string;
    liquidityDepth: string;
    orderFlowAbsorption: string;
    fundingRateBias?: string;
    openInterestTrend?: string;
    catalystRisk: string;
    earlyWarningSummary: string;
  };
  setupViability: 'ACTIONABLE_BASE' | 'WAIT_STABILIZATION' | 'DO_NOT_TRADE' | 'PRE_LISTING_WAIT';
  decision: 'LONG' | 'SHORT' | 'WAIT';
  entryZone?: { low: number; high: number; ideal: number };
  stopLoss?: number;
  targets?: TargetLevel[];
  riskRewardRatio?: number;
  executionStatus: 'ENTRY_NOW' | 'WAIT_FOR_PULLBACK' | 'WAIT_FOR_RETEST' | 'WAIT_FOR_CONFIRMATION' | 'WAIT';
  invalidation: string;
  description: string;
  confluences: string[];
  newListingIntelligence?: NewListingIntelligenceReport;
}

// Phase 14: Deterministic New Listing Intelligence Types
export type ListingDiscoveryStage =
  | 'PRE_ANNOUNCEMENT'
  | 'INITIAL_SPIKE'
  | 'PRICE_DISCOVERY'
  | 'FIRST_RANGE_FORMING'
  | 'BASE_BUILDING'
  | 'BREAKOUT_EXPANSION'
  | 'BLEED_MARKDOWN'
  | 'ESTABLISHED'
  | 'UNKNOWN';

export type ListingStructureType =
  | 'ACCUMULATION_BASE'
  | 'BREAKOUT_RETEST'
  | 'RANGE_BOUND'
  | 'DISTRIBUTION_BLEED'
  | 'UNFORMED_VOLATILE'
  | 'STRUCTURE_INSUFFICIENT'
  | 'UNKNOWN';

export type ListingStructureAction =
  | 'BREAKOUT'
  | 'BREAKDOWN'
  | 'RECLAIM'
  | 'REJECTION'
  | 'NO_ACTION'
  | 'UNKNOWN';

export type ListingLiquidityStatus =
  | 'LIQUIDITY_AVAILABLE'
  | 'LIQUIDITY_THIN'
  | 'LIQUIDITY_UNAVAILABLE'
  | 'UNKNOWN';

export type ListingVolatilityState =
  | 'EXTREME'
  | 'HIGH'
  | 'MODERATE'
  | 'STABILIZING'
  | 'INSUFFICIENT_DATA';

export type ListingOverextensionRisk =
  | 'CRITICAL_OVEREXTENSION'
  | 'MODERATE_OVEREXTENSION'
  | 'NOT_OVEREXTENDED'
  | 'UNKNOWN';

export type ListingSetupViability =
  | 'ACTIONABLE_BASE'
  | 'WAIT_STABILIZATION'
  | 'WAIT_LIQUIDITY'
  | 'DO_NOT_TRADE'
  | 'PRE_LISTING_WAIT'
  | 'INSUFFICIENT_DATA';

export type ListingTechnicalAlignment =
  | 'SUPPORTS_LONG'
  | 'SUPPORTS_SHORT'
  | 'CONTRADICTS_SETUP'
  | 'WEAKENS_SETUP'
  | 'HIGH_RISK_WARNING'
  | 'NEUTRAL';

export interface ListingReferenceLevels {
  listingOpenPrice: number | null;
  listingHigh: number | null;
  listingLow: number | null;
  initialRangePct: number | null;
  currentVsListingOpenPct: number | null;
  currentVsListingHighPct: number | null;
  currentVsListingLowPct: number | null;
}

export interface ListingTransitionRecord {
  from: ListingStatus;
  to: ListingStatus;
  timestamp: number;
  reason: string;
}

export interface NewListingIntelligenceReport {
  symbol: string;
  isNewListing: boolean;
  launchStatus: ListingStatus; // 'PRE_LISTING' | 'LISTING_LIVE' | 'POST_LISTING' | 'NONE'
  exchange: string;
  listingTime: number | null; // epoch ms if known, null if unavailable (zero fabrication)
  listingTimeAvailable: boolean;
  listingAgeHours: number | null;
  discoveryStage: ListingDiscoveryStage;
  volatilityState: ListingVolatilityState;
  initialVolatilityPct: number | null;
  liquidityStatus: ListingLiquidityStatus;
  volumeAvailable: boolean;
  volume24hUsd: number | null;
  rvol: number | null;
  marketStructure: ListingStructureType;
  structureAction: ListingStructureAction;
  referenceLevels: ListingReferenceLevels;
  earlyAccumulationDistribution: 'EARLY_ACCUMULATION' | 'EARLY_DISTRIBUTION' | 'NEUTRAL_CONSOLIDATION' | 'INSUFFICIENT_DATA';
  pumpDumpRisk: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
  overextensionRisk: ListingOverextensionRisk;
  antiChaseWarning: boolean;
  setupViability: ListingSetupViability;
  // Confluence only - NEVER independently generates signals
  technicalAlignment: ListingTechnicalAlignment;
  confluenceReason: string;
  invalidation: string;
  // Structural trade params ONLY when verified structure supports them
  hasStructuralLevels: boolean;
  entryZone?: { low: number; high: number; ideal: number } | null;
  structuralStopLoss: number | null;
  structuralTargets: TargetLevel[];
  structuralRiskRewardRatio: number | null;
  zeroFabricatedData: true;
  transitionHistory?: ListingTransitionRecord[];
}

export interface MarketReactionAnalysis {
  state: MarketReactionState;
  priceChangePostNewsPct: number;
  rvolPostNews: number;
  volumeSurgePostNews?: boolean;
  reactionDelayBars?: number;
  isContradicted: boolean;
  fadeOpportunity?: boolean;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  contradictionWarning?: string;
  evidence?: string[];
  details: string;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  sources?: string[];
  supportingSources?: string[];
  sourceCount?: number;
  sourceTier?: NewsSourceTier;
  isVerified?: boolean;
  url?: string;
  publishedAt: number;
  detectedAt?: number;
  ageMinutes?: number;
  freshness?: NewsFreshness;
  isActive?: boolean;
  sentiment: NewsSentiment;
  sentimentScore?: number;
  eventType?: NewsEventType;
  impactScore: number; // 0 - 100
  impactLevel?: NewsImpactLevel;
  relatedCoins: string[];
  primaryCoin?: string;
  mappingConfidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  summary: string;
  tradeWindowHours?: number;
  marketReaction?: MarketReactionAnalysis;
  prePumpSetup?: PrePumpCatalystSetup;
  exhaustionDumpRisk?: ExhaustionDumpRisk;
  listingInfo?: NewListingInfo;
  tags?: string[];

  // Phase 13: News Intelligence 2.0
  catalystType?: NewsCatalystType;
  impactClassification?: NewsImpactClassification;
  sourceCredibilityTier?: SourceCredibilityTier;
  sourceCredibilityScore?: number;
  verificationStatus?: NewsVerificationStatus;
  isRumorOrUnverified?: boolean;
  isFakeOrMisleading?: boolean;
  isConfirmedCatalyst?: boolean;
  reactionWindows?: Record<NewsReactionWindowPeriod, ReactionWindowMetric>;
  reactionConflict?: NewsReactionConflictType;
  technicalAlignment?: NewsTechnicalAlignment;
  newsImpactReport?: NewsMarketImpactReport;
}

export interface MarketStats {
  btcPrice: number;
  btcChange24h: number;
  btcDominance: number;
  totalMarketCap: number;
  fearGreedIndex: number;
  fearGreedLabel: string;
  marketRegime: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'VOLATILE';
  activeSignalsCount: number;
  winRate24h: number;
}

export interface RadarItem {
  symbol: string;
  price: number;
  change24h: number;
  moonScore: number;
  trend1h: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trend4h: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  rsi15m: number;
  rsi1h: number;
  volumeSpike: boolean;
  activePattern?: string;
  recommendedAction: 'LONG' | 'SHORT' | 'WATCH';
}

export interface SignalLifecycleStats {
  totalSignals: number;
  longCount: number;
  shortCount: number;
  waitCount: number;
  entryNowCount: number;
  activeCount: number;
  tp1Hits: number;
  tp2Hits: number;
  tp3Hits: number;
  tpnHits: number;
  stopLossHits: number;
  invalidatedCount: number;
  expiredCount: number;
  completedCount: number;
  winRate: number; // 0 - 100
  avgRiskRewardAchieved?: number;
  gradeDistribution: {
    'A+': number;
    'A': number;
    'B': number;
    'C': number;
    'WAIT': number;
  };
}

export interface ScannerFilter {
  direction: 'ALL' | 'LONG' | 'SHORT';
  minScore: number;
  status: 'ALL' | 'ENTRY_NOW' | 'ACTIVE' | 'COMPLETED' | 'WAIT';
  category?: 'ALL' | 'MAJOR' | 'ALTCOIN' | 'MEME_HIGH_BETA' | 'NEW_LISTING';
  rankingBucket?: 'ALL' | 'STRONGEST_A_PLUS' | 'STRONGEST_A' | 'EARLY_OPPORTUNITY' | 'WATCH_OPPORTUNITY';
  rankingTier?: 'ALL' | OpportunityRankingTier;
  sortBy?: 'PRIORITY_SCORE' | 'MOON_SCORE' | 'REALISTIC_UPSIDE' | 'RISK_REWARD' | 'NEWEST';
  searchQuery: string;
}

// ============================================================================
// PHASE 6: INSTITUTIONAL-GRADE MARKET INTELLIGENCE INTERFACES
// ============================================================================

export interface FairValueGap {
  id: string;
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  midpoint: number;
  status: 'UNMITIGATED' | 'PARTIALLY_MITIGATED' | 'MITIGATED';
  candleIndex: number;
  timeframe: string;
  mitigationPercentage?: number;
}

export interface OrderBlock {
  id: string;
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  midpoint: number;
  status: 'ACTIVE' | 'TESTED' | 'INVALIDATED';
  strength: number; // 0 - 100
  candleIndex: number;
  timeframe: string;
  volume: number;
}

export interface BreakerBlock {
  id: string;
  type: 'BULLISH' | 'BEARISH'; // BULLISH breaker = previously failed Bearish OB broken upwards
  top: number;
  bottom: number;
  originOBPrice: number;
  status: 'ACTIVE' | 'MITIGATED';
  timeframe: string;
}

export interface JudasSwingAnalysis {
  detected: boolean;
  session: 'LONDON' | 'NEW_YORK' | 'NONE';
  sessionName: string;
  sweepDirection: 'HIGH_SWEEP_REVERSAL_SHORT' | 'LOW_SWEEP_REVERSAL_LONG' | 'NONE';
  sweepLevel: number;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  details: string;
}

export interface SMCStructureReport {
  structureType: 'BOS' | 'CHOCH' | 'RANGING' | 'EXPANSION' | 'NONE';
  structureBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  fvgs: FairValueGap[];
  nearestFvg?: FairValueGap;
  orderBlocks: OrderBlock[];
  nearestOrderBlock?: OrderBlock;
  breakerBlocks: BreakerBlock[];
  nearestBreakerBlock?: BreakerBlock;
  bosCount: number;
  chochCount: number;
  judasSwing: JudasSwingAnalysis;
  multiTimeframeAligned: boolean;
  confluenceSummary: string;
}

export interface VolumeProfileReport {
  poc: number; // Point of Control (highest volume price)
  vah: number; // Value Area High (70% boundary)
  val: number; // Value Area Low (70% boundary)
  lvn: number[]; // Low Volume Nodes (vacuum areas)
  valueAreaVolumePct: number;
  currentVsPoc: 'ABOVE_POC' | 'BELOW_POC' | 'AT_POC';
  profileRangeLow: number;
  profileRangeHigh: number;
}

export interface CumulativeVolumeDeltaReport {
  cumulativeDelta: number;
  deltaTrend: 'RISING' | 'FALLING' | 'FLAT';
  divergence: {
    detected: boolean;
    type: 'BULLISH_CVD_DIVERGENCE' | 'BEARISH_CVD_DIVERGENCE' | 'NONE';
    description: string;
  };
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
}

export interface OrderBookImbalanceReport {
  obiPercent: number; // -100 to +100
  bidDepthPressure: 'BIDS_DOMINANT' | 'ASKS_DOMINANT' | 'BALANCED' | 'UNKNOWN';
  spoofingRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  bidWallPrice?: number;
  askWallPrice?: number;
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  details: string;
}

export interface OrderflowReport {
  cvd: CumulativeVolumeDeltaReport;
  volumeProfile: VolumeProfileReport;
  orderBookImbalance: OrderBookImbalanceReport;
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  summary: string;
}

export interface FibonacciConfluenceReport {
  anchorHigh: number;
  anchorLow: number;
  trendDirection: 'UP' | 'DOWN';
  goldenPocket: {
    min: number; // 0.618
    max: number; // 0.65
    inZone: boolean;
  };
  extension1272: number;
  extension1618: number;
  extension2618: number;
  confluentTargets: {
    level: number;
    price: number;
    type: string;
  }[];
  status: 'VALID_SWING' | 'NO_SWING_FOUND';
  summary: string;
}

export interface SingleDivergence {
  detected: boolean;
  type: 'REGULAR_BULLISH' | 'REGULAR_BEARISH' | 'HIDDEN_BULLISH' | 'HIDDEN_BEARISH' | 'NONE';
  timeframe: string;
  description: string;
}

export interface DivergenceMatrixReport {
  rsiDivergence: SingleDivergence;
  macdDivergence: SingleDivergence;
  mtfConfluenceCount: number;
  isConfirmed: boolean;
  summary: string;
}

export interface RelativeStrengthMacroReport {
  rsVsBtc24h: number; // Positive = Outperforming BTC
  rsVsBtc4h: number;
  rsVsBtc1h: number;
  relativeStrengthCategory: 'LEADER' | 'OUTPERFORMER' | 'NEUTRAL' | 'LAGGARD';
  btcDominanceContext: {
    btcD: number;
    trend: 'RISING' | 'FALLING' | 'STABLE';
    impactOnAlts: 'FAVORABLE' | 'NEUTRAL' | 'ADVERSE';
  };
  usdtDominanceContext: {
    usdtD: number;
    trend: 'RISING' | 'FALLING' | 'STABLE';
    macroCapitalFlow: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  };
  summary: string;
}

export interface DerivativesIntelligenceReport {
  fundingRate: number;
  fundingSentiment: 'OVERHEATED_LONGS' | 'EXTREME_SHORTS' | 'NEUTRAL' | 'UNKNOWN';
  openInterest: number;
  oiChange24h: number;
  priceOiCorrelation: 'LONG_ACCUMULATION' | 'SHORT_ACCUMULATION' | 'SHORT_SQUEEZE' | 'LONG_LIQUIDATION' | 'NEUTRAL' | 'UNKNOWN';
  fundingOiDisconnect: boolean;
  liquidationCascadeRisk: 'HIGH' | 'ELEVATED' | 'LOW' | 'UNKNOWN';
  estimatedLiquidationPools: {
    longLiqZone: number; // Below swing low
    shortLiqZone: number; // Above swing high
    proximity: 'NEAR' | 'FAR' | 'UNKNOWN';
  };
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  summary: string;
}

export interface InstitutionalIntelligenceReport {
  smc: SMCStructureReport;
  orderflow: OrderflowReport;
  fibonacci: FibonacciConfluenceReport;
  divergenceMatrix: DivergenceMatrixReport;
  relativeStrength: RelativeStrengthMacroReport;
  derivatives: DerivativesIntelligenceReport;
  institutionalScore: number; // 0 - 100
  overallInstitutionalVerdict: 'STRONGLY_BULLISH' | 'MODERATELY_BULLISH' | 'NEUTRAL' | 'MODERATELY_BEARISH' | 'STRONGLY_BEARISH';
  keyConfirmations: string[];
  keyContradictions: string[];
}

// Phase 6.1 Universal Coin Deep-Dive & Current Structure Types
export interface BreakoutEvaluation {
  breakoutStage: BreakoutStage | string;
  classification: BreakoutClassification | string;
  level: number;
  confidence: number;
  volumeRatio?: number;
  confirmed?: boolean;
}

export interface DetectedPattern {
  name: string;
  pattern?: string;
  category?: string;
  type?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence?: number;
  breakoutStatus?: string;
  retestStatus?: string;
  isConfirmed?: boolean;
  neckline?: number;
  breakoutLevel?: number;
  breakoutPrice?: number;
  targetPrice?: number;
  description?: string;
  keyLevels?: {
    neckline?: number;
    support?: number;
    resistance?: number;
    breakoutLevel?: number;
    invalidationLevel?: number;
    measuredTarget?: number;
  };
  evidence?: string[];
}

export interface TrendlineEvidence {
  detected: boolean;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  type: 'SUPPORT' | 'RESISTANCE' | 'UPPER_CHANNEL' | 'LOWER_CHANNEL';
  slope: number;
  intercept: number;
  angleDegrees?: number;
  touchCount: number;
  touchQuality: number;
  confidence: number;
  timeframe: string;
  startPoint?: { index: number; timestamp: number; price: number };
  endPoint?: { index: number; timestamp: number; price: number };
  currentLinePrice?: number;
}

export type CurrentMarketStructureState =
  | 'DOUBLE_TOP_FORMING'
  | 'DOUBLE_TOP_CONFIRMED'
  | 'DOUBLE_BOTTOM_FORMING'
  | 'DOUBLE_BOTTOM_CONFIRMED'
  | 'TRENDLINE_BREAK'
  | 'BREAKOUT'
  | 'BREAKDOWN'
  | 'BREAKOUT_RETEST'
  | 'RANGE'
  | 'ACCUMULATION'
  | 'DISTRIBUTION'
  | 'FVG_RETEST'
  | 'ORDER_BLOCK_RETEST'
  | 'PARABOLIC_EXTENSION'
  | 'PUMP_EXHAUSTION'
  | 'UNKNOWN';

export interface DataFeedStatus {
  priceFeed: 'OPERATIONAL' | 'DEGRADED' | 'FALLBACK' | 'UNAVAILABLE';
  candleHistory: 'OPERATIONAL' | 'DEGRADED' | 'UNAVAILABLE';
  orderBookFeed: 'OPERATIONAL' | 'FALLBACK_SYNTHETIC' | 'UNAVAILABLE';
  derivativesFeed: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  newsFeed: 'OPERATIONAL' | 'FALLBACK' | 'UNAVAILABLE';
  timestamp: number;
}

export interface TradeabilitySummary {
  decision: 'LONG' | 'SHORT' | 'WAIT';
  status?: 'TRADEABLE' | 'WAIT_FOR_TRIGGER' | 'UNTRADEABLE_CHOP';
  tradeabilityScore?: number;
  preferredDirection?: 'LONG' | 'SHORT' | 'NEUTRAL';
  summary?: string;
  qualityGrade: SignalQualityGrade;
  actionablePriority: ActionablePriority;
  entryZone: {
    low: number;
    high: number;
    ideal: number;
  };
  stopLoss: number;
  targets: TargetLevel[];
  riskRewardRatio: number;
  executionState: EntryReadiness;
  invalidation: string;
  requiredConfirmations: string[];
  missingConfirmations?: string[];
}

export interface CoinAnalysisReport {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  name: string;
  category: MarketCategory;
  timeframe: TimeFrame;
  currentPrice: number;
  priceChange24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  
  // Technical & Velocity Telemetry
  rvol: number;
  atr: number;
  momentumVelocity: number;
  marketRegime: MarketRegimeType;
  mtfTrendState: {
    trend15m: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    trend1h: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    trend4h: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    alignment: 'FULL_ALIGNMENT' | 'PARTIAL_ALIGNMENT' | 'CONFLICT';
  };
  
  // Market Structure & Current State
  currentStructureState: CurrentMarketStructureState;
  currentStructureExplanation: string;
  
  // Support, Resistance & Liquidity
  supportLevels: number[];
  resistanceLevels: number[];
  liquidityZones: LiquidityZone[];
  
  // Trendlines & Chart Patterns
  trendlines: TrendlineEvidence;
  detectedPatterns: DetectedPattern[];
  breakoutEvaluation?: BreakoutEvaluation;
  
  // Technical Indicators
  rsi: number;
  macd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  };
  ema20: number;
  ema50: number;
  ema200?: number;
  emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED';
  
  // Institutional Reports (SMC, Orderflow, Fibonacci, Divergence, Relative Strength, Derivatives)
  smc: SMCStructureReport;
  orderflow: OrderflowReport;
  fibonacci: FibonacciConfluenceReport;
  divergenceMatrix: DivergenceMatrixReport;
  relativeStrength: RelativeStrengthMacroReport;
  derivatives: DerivativesIntelligenceReport;
  institutionalIntelligence: InstitutionalIntelligenceReport;
  
  // Pre-pump & Post-pump Exhaustion
  pumpDumpIntelligence: PumpDumpIntelligence;
  marketCycle: MarketCycleAnalysis;
  flowWhaleIntelligence: FlowWhaleIntelligence;
  killSwitch: KillSwitchEvaluation;
  aplusConfluence: AplusConfluenceReport;
  opportunityReport?: OpportunityDiscoveryReport;
  
  // News & Catalysts
  newsList: NewsItem[];
  newsCatalystSummary: string;
  listingStatus: {
    isNewListing: boolean;
    listingTier?: 'TIER_1' | 'TIER_2' | 'DEX';
    detectedAt?: number;
  };
  newListingIntelligence?: NewListingIntelligenceReport;
  largeMoveIntelligence?: LargeMoveOpportunityReport;
  
  // Tradeability Decision & Reasons
  tradeability: TradeabilitySummary;
  whyThisDecision: {
    reasons: string[];
    evidenceSummary: string;
    conflicts: string[];
    unknowns: string[];
  };
  
  // Data Quality & Feeds Status
  dataFeedsStatus: DataFeedStatus;
  
  // Unified Reconciled Signal (Zero duplicate instances)
  signal: Signal | null;
  decision?: SignalDirection | 'WAIT';
  qualityGrade?: SignalQualityGrade;
  actionablePriority?: ActionablePriority;
  moonScore: number;
  confidence: number;
  catalystTradePipeline?: CatalystTradePipeline;
  
  // Phase 8 Predictive Opportunity & Market Regime Intelligence
  marketRegimeAnalysis?: MarketRegimeAnalysis;
  earlyMoveReport?: EarlyMoveReport;
  sectorRotationAnalysis?: SectorRotationAnalysis;
  crossAssetConfirmation?: CrossAssetConfirmationReport;
  smartEntryTiming?: SmartEntryTiming;

  // Phase 11: Early Setup + Timing Intelligence
  earlyCategory?: EarlySetupCategory;
  setupMaturity?: SetupMaturity;
  timingWindow?: TimingWindow;
  setupAge?: string;
  triggerCondition?: string;
  whyEarlySetupMatters?: string;

  // Phase 13: News Intelligence 2.0
  newsImpactReport?: NewsMarketImpactReport;

  // Phase 16: Unified Intelligence Fusion
  unifiedFusion?: UnifiedFusionReport;

  // Pre-Move Intelligence
  preMoveReport?: PreMoveReport;
  preMoveIntelligence?: PreMoveReport;
}

export interface CatalystTradePipeline {
  catalyst: {
    title: string;
    source: string;
    sourceTier: string;
    publishedAt: number;
    eventType: string;
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'MIXED';
    impactScore: number;
  };
  marketReaction: {
    state: 'CONFIRMED' | 'REJECTED' | 'ABSORPTION_IN_PROGRESS' | 'FADED' | 'CONTRADICTED' | 'PENDING';
    priceChangePostPct: number;
    rvolPostEvent: number;
    reactionAnalysis: string;
  };
  technicalConfirmation: {
    isConfirmed: boolean;
    bosChochStatus: string;
    mtfAlignment: string;
    orderflowOrCvd: string;
    details: string[];
  };
  entryZone: {
    low: number;
    high: number;
    ideal: number;
    noChaseRule: string;
  };
  stopLoss: {
    price: number;
    invalidationBasis: string;
  };
  targets: TargetLevel[];
  riskRewardRatio: number;
  invalidationCriteria: string;
  executionStatus: EntryReadiness;
  setupClassification: 'PRE_PUMP_CATALYST_SETUP' | 'CATALYST_CONTINUATION' | 'SELL_THE_NEWS' | 'POST_PUMP_EXHAUSTION' | 'DUMP_RISK' | 'STANDARD_CATALYST_SWING';
  summary: string;
}

// ============================================================================
// PHASE 8: PREDICTIVE OPPORTUNITY & MARKET REGIME INTELLIGENCE TYPES
// ============================================================================

export type MarketRegime = 'BULL' | 'BEAR' | 'RANGE' | 'HIGH_VOLATILITY' | 'TRANSITION';

export interface MarketRegimeAnalysis {
  regime: MarketRegime;
  btcTrend: 'BULLISH' | 'BEARISH' | 'RANGING';
  btcDominanceTrend: 'RISING' | 'FALLING' | 'STABLE';
  usdtDominanceTrend: 'RISING' | 'FALLING' | 'STABLE';
  volatilityState: 'EXPANDING' | 'COMPRESSING' | 'NORMAL' | 'EXTREME';
  marketBreadthPct: number; // % of market universe above 20 EMA
  regimeConfidence: number; // 0 - 100
  contextualImpactOnAlts: 'FAVORABLE_ALTS' | 'FAVORABLE_MAJORS' | 'DEFENSIVE_CASH' | 'SELECTIVE_NARRATIVE';
  summary: string;
  details: string[];
}

export type EarlyMoveClassification =
  | 'COMPRESSION_BREAKOUT'
  | 'LIQUIDITY_RECLAIM'
  | 'BREAKOUT_RETEST'
  | 'EARLY_EXPANSION'
  | 'EARLY_CATALYST'
  | 'RELATIVE_STRENGTH_ACCELERATION'
  | 'UNUSUAL_VOLUME'
  | 'ACCUMULATION_SETUP'
  | 'SPRING_SETUP'
  | 'MARKUP_PREPARATION'
  | 'DISTRIBUTION_SETUP'
  | 'UTAD_SETUP'
  | 'MARKDOWN_PREPARATION'
  | 'SECTOR_ROTATION'
  | 'NONE';

export type EarlySetupType = EarlyMoveClassification;

export type SetupMaturity =
  | 'SETUP_FORMING'
  | 'EARLY_SETUP'
  | 'NEAR_TRIGGER'
  | 'TRIGGERED'
  | 'CONFIRMED'
  | 'EXTENDED'
  | 'EXPIRED'
  | 'INVALIDATED'
  | 'UNKNOWN';

export type SmartEntryTiming =
  | 'ENTRY_NOW'
  | 'WAIT_FOR_PULLBACK'
  | 'WAIT_FOR_RETEST'
  | 'WAIT_FOR_CONFIRMATION'
  | 'ENTRY_MISSED'
  | 'INVALIDATED'
  | 'EXPIRED';

export type EarlyTimingState = SmartEntryTiming;

export type TimingWindow =
  | 'IMMEDIATE'
  | 'NEAR_TERM'
  | 'WAITING_FOR_TRIGGER'
  | 'WAITING_FOR_CONFIRMATION'
  | 'WAITING_FOR_PULLBACK'
  | 'WAITING_FOR_RETEST'
  | 'NO_VALID_TIMING'
  | 'UNKNOWN';

export type EarlySetupCategory = 'EARLY_LONG' | 'EARLY_SHORT' | 'NEUTRAL_WATCH';

export interface EarlyCatalystInput {
  catalystType?: string;
  catalystTimestamp?: number;
  affectedCoin?: string;
  impactDirection?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNKNOWN';
  impactStrength?: number;
  freshness?: 'BREAKING' | 'RECENT' | 'STALE' | 'ARCHIVED';
  sourceQuality?: 'TIER_1' | 'TIER_2' | 'TIER_3' | 'COMMUNITY' | 'UNKNOWN';
  reactionState?: 'CONFIRMED' | 'REJECTED' | 'ABSORPTION_IN_PROGRESS' | 'FADED' | 'CONTRADICTED' | 'PENDING';
}

export interface MTFTimingItem {
  timeframe: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  stage?: string;
  setupState?: string;
}

export interface MTFTimingContext {
  alignment: 'ALIGNED_BULLISH' | 'ALIGNED_BEARISH' | 'MIXED' | 'TIMING_CONFLICT';
  hasConflict: boolean;
  conflictReason?: string;
  timeframes: MTFTimingItem[];
}

export type MarketSectorId = 'MAJORS' | 'ALTCOINS' | 'MEMES' | 'HIGH_BETA' | 'NEW_LISTINGS' | 'DEFI' | 'AI_DATA' | 'L1_L2';

export interface SectorPerformanceItem {
  sector: MarketSectorId;
  name: string;
  relativeStrengthScore: number; // 0 - 100
  flowDirection: 'INFLOW_ACCELERATING' | 'INFLOW_STABLE' | 'NEUTRAL' | 'OUTFLOW' | 'OUTFLOW_HEAVY';
  volumeSharePct: number;
  avg24hChange: number;
  leadingAssets: string[];
  isLeadingRotation: boolean;
}

export interface SectorRotationAnalysis {
  activeRotationLeader: MarketSectorId;
  rotationStage: 'EARLY_ACCUMULATION' | 'ACCELERATING' | 'PARABOLIC_MATURE' | 'DISTRIBUTION_ROTATING_OUT';
  sectors: SectorPerformanceItem[];
  btcToAltFlowState: 'BTC_ACCUMULATION' | 'ALT_SEASON_EARLY' | 'MEME_MANIA' | 'RISK_OFF_USDT';
  summary: string;
}

export interface CrossAssetConfirmationReport {
  btcAligned: boolean;
  sectorAligned: boolean;
  derivativesAligned: boolean;
  crossAssetScore: number; // 0 - 100
  contradictions: string[];
  isContradicted: boolean;
}

export interface EarlyMoveReport {
  symbol: string;
  classification: EarlyMoveClassification;
  setupType?: EarlyMoveClassification;
  earlyCategory?: EarlySetupCategory;
  maturity?: SetupMaturity;
  detectedAt: number;
  setupDetectedAt?: number;
  setupUpdatedAt?: number;
  setupAge?: string;
  setupAgeMs?: number;
  triggerDetectedAt?: number;
  confirmationDetectedAt?: number;
  invalidatedAt?: number;
  expiredAt?: number;
  isTriggered?: boolean;
  triggerCondition?: string;
  triggerDetails?: string;
  timingWindow?: TimingWindow;
  setupStrength?: number;
  timingQuality?: number;
  expansionStage: 'PRE_EXPANSION' | 'EARLY_ACCELERATION' | 'MID_EXPANSION' | 'EXTENDED_EXHAUSTED';
  confidence: number;
  rvol: number;
  volatilityCompressionScore: number; // 0 - 100
  smcTrigger: string;
  entryTiming: SmartEntryTiming;
  noChaseThreshold: number; // Max price allowed before entry is missed/wait for pullback
  distanceFromIdealEntryPct: number;
  isExtended?: boolean;
  isMissed?: boolean;
  cycleContext?: {
    cycle: string;
    stage: string;
    wyckoffEvent?: string;
    vsaClassification?: string;
    cycleConfluenceScore: number;
  };
  mtfTiming?: MTFTimingContext;
  asymmetricPotential: {
    isAsymmetric: boolean;
    expectedMoveClass: ExpectedMoveClass;
    structuralRR: number;
    targetCount: number;
  };
  decayStatus: {
    isDecaying: boolean;
    decayReason?: string;
    stalenessScore: number;
  };
  crossAssetConfirmation: CrossAssetConfirmationReport;
  whyThisMatters?: string;
  summary: string;
  evidenceList: string[];
  contradictions?: string[];
}

export type EarlySetupReport = EarlyMoveReport;

// ============================================================================
// PHASE 9: SMART RISK + TRADE MANAGEMENT TYPES
// ============================================================================

export type StructuralStopLossBasis =
  | 'SWING_LOW'
  | 'DEMAND_ORDER_BLOCK'
  | 'CONFIRMED_SUPPORT'
  | 'LIQUIDITY_RECLAIM_INVALIDATION'
  | 'SWING_HIGH'
  | 'SUPPLY_ORDER_BLOCK'
  | 'CONFIRMED_RESISTANCE'
  | 'LIQUIDITY_REJECTION_INVALIDATION'
  | 'UNKNOWN';

export interface StructuralStopLossReport {
  price: number | 'UNKNOWN';
  basis: StructuralStopLossBasis | string;
  invalidationAnchor: number | 'UNKNOWN';
  atrBufferUsed: number;
  distancePct: number | 'UNKNOWN';
  isValidStructural: boolean;
  details: string[];
}

export interface PositionSizingParams {
  accountEquity?: number;
  riskPercentage?: number; // e.g. 1.0 for 1%
  entryPrice?: number;
  stopLossPrice?: number;
  leverage?: number; // default 1x
  makerFeePct?: number; // default 0.04%
  takerFeePct?: number; // default 0.06%
}

export interface PositionSizingResult {
  status: 'CALCULATED' | 'UNKNOWN' | 'INSUFFICIENT_DATA';
  accountEquity?: number;
  riskPercentage?: number;
  riskAmountUsd?: number;
  stopDistancePrice?: number;
  stopDistancePct?: number;
  positionUnits?: number; // base asset units
  notionalValueUsd?: number;
  estimatedMarginUsd?: number;
  leverageUsed?: number;
  estimatedTotalFeeUsd?: number;
  summary: string;
}

export type LeverageRiskLevel =
  | 'LOW_RISK_CONTEXT'
  | 'MODERATE_RISK_CONTEXT'
  | 'HIGH_RISK_CONTEXT'
  | 'EXTREME_RISK_CONTEXT'
  | 'UNKNOWN';

export interface LeverageRiskAnalysis {
  riskLevel: LeverageRiskLevel;
  maxRecommendedLeverage: number | 'UNKNOWN';
  volatilityFactor: number;
  slDistanceRisk: 'TIGHT' | 'NORMAL' | 'WIDE' | 'EXTREME';
  liquidityCondition: 'DEEP' | 'MODERATE' | 'THIN' | 'POOR';
  derivativesCrowding: 'NONE' | 'MODERATE' | 'HIGH' | 'EXTREME';
  regimeContext: string;
  safetyWarning: string;
  riskDrivers: string[];
}

export type DerivativesRiskContextType =
  | 'NORMAL'
  | 'CROWDING_RISK'
  | 'SHORT_SQUEEZE_RISK'
  | 'LONG_SQUEEZE_RISK'
  | 'HIGH_LIQUIDATION_RISK'
  | 'UNKNOWN';

export interface DerivativesRiskAnalysis {
  riskContext: DerivativesRiskContextType;
  fundingRate?: number;
  fundingBias: 'EXTREME_POSITIVE' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'EXTREME_NEGATIVE' | 'UNKNOWN';
  openInterestTrend: 'RISING' | 'FALLING' | 'STABLE' | 'UNKNOWN';
  cvdTrend: 'BULLISH_AGGRESSION' | 'BEARISH_AGGRESSION' | 'NEUTRAL' | 'DIVERGENT' | 'UNKNOWN';
  liquidationSensitivity: 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
  summary: string;
  riskWarnings: string[];
}

export type TradeLifecycleState =
  | 'ORIGINAL_SL'
  | 'BREAK_EVEN'
  | 'STRUCTURAL_TRAILING'
  | 'PROFIT_LOCKED'
  | 'CLOSED'
  | 'INVALIDATED';

export interface TradeLifecycleTransition {
  fromState: string;
  toState: string;
  price: number;
  timestamp: number;
  reason: string;
}

export interface TradeLifecycleRecord {
  state: TradeLifecycleState;
  currentStopLoss: number | 'UNKNOWN';
  originalStopLoss: number | 'UNKNOWN';
  entryPrice: number;
  currentPrice: number;
  highestPriceReached: number;
  lowestPriceReached: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  allTargetsHit: boolean;
  unrealizedPnLPct: number;
  realizedPnLPct: number;
  invalidationReason?: string;
  exitReason?: string;
  stateHistory: TradeLifecycleTransition[];
  updatedAt: number;
}

export interface NewsIntelligenceCompatibility {
  catalyst?: string;
  newsTimestamp?: number;
  sourceQuality?: NewsSourceTier | string;
  freshness?: 'BREAKING_UNDER_1H' | 'FRESH_1_6H' | 'DEVELOPING_6_24H' | 'STALE' | 'UNKNOWN';
  marketReaction?: 'PRICED_IN' | 'INITIAL_REACTION' | 'MOMENTUM_EXPANSION' | 'FADED' | 'UNKNOWN';
  catalystConfidence?: number;
  conflictStatus?: 'NONE' | 'CONTRADICTED_BY_STRUCTURE' | 'SOURCE_DISPUTED' | 'UNKNOWN';
  isSupportingOnly: boolean;
}

export interface SmartRiskReport {
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryPrice: number;
  structuralStopLoss: StructuralStopLossReport;
  riskReward: {
    tp1RR: number | 'UNKNOWN';
    tp2RR: number | 'UNKNOWN';
    tp3RR: number | 'UNKNOWN';
    maxStructuralRR: number | 'UNKNOWN';
    isAsymmetric: boolean;
  };
  positionSizing: PositionSizingResult;
  leverageRisk: LeverageRiskAnalysis;
  derivativesRisk: DerivativesRiskAnalysis;
  lifecycle: TradeLifecycleRecord;
  newsCompatibility: NewsIntelligenceCompatibility;
  summary: string;
  invalidationCriteria: string;
}

// ============================================================================
// PHASE 12: LONG/SHORT PRIMARY SETUP CATEGORY INTELLIGENCE TYPES
// ============================================================================

export type LongSetupCategory =
  | 'EARLY_LONG'
  | 'BREAKOUT_LONG'
  | 'BREAKOUT_RETEST_LONG'
  | 'PULLBACK_LONG'
  | 'LIQUIDITY_RECLAIM_LONG'
  | 'ACCUMULATION_LONG'
  | 'SPRING_LONG'
  | 'TREND_CONTINUATION_LONG'
  | 'MOMENTUM_EXPANSION_LONG'
  | 'CATALYST_LONG'
  | 'RELATIVE_STRENGTH_LONG'
  | 'HIGH_ASYMMETRY_LONG';

export type ShortSetupCategory =
  | 'EARLY_SHORT'
  | 'BREAKDOWN_SHORT'
  | 'BREAKDOWN_RETEST_SHORT'
  | 'PULLBACK_SHORT'
  | 'LIQUIDITY_REJECTION_SHORT'
  | 'DISTRIBUTION_SHORT'
  | 'UTAD_SHORT'
  | 'TREND_CONTINUATION_SHORT'
  | 'MOMENTUM_EXPANSION_SHORT'
  | 'CATALYST_DUMP_SHORT'
  | 'RELATIVE_WEAKNESS_SHORT'
  | 'HIGH_ASYMMETRY_SHORT';

export type NeutralSetupCategory = 'UNKNOWN' | 'WAIT';

export type PrimarySetupCategory = LongSetupCategory | ShortSetupCategory | NeutralSetupCategory;

export interface CategoryTransitionRecord {
  fromCategory: PrimarySetupCategory;
  toCategory: PrimarySetupCategory;
  timestamp: number;
  reason: string;
  price?: number;
}

export interface CategoryIntelligenceReport {
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  primaryCategory: PrimarySetupCategory;
  categoryConfluences: PrimarySetupCategory[];
  previousCategory?: PrimarySetupCategory;
  transitionHistory: CategoryTransitionRecord[];
  confidence: number; // 0 - 100
  reasoning: string;
  structuralTriggers: string[];
  executionAlignment: string;
  cycleAlignment: string;
  isConfirmed: boolean;
}

// ============================================================================
// PHASE 15: LARGE MOVE + ASYMMETRIC OPPORTUNITY INTELLIGENCE TYPES
// ============================================================================

export type MajorMoveClassification =
  | 'EXTREME_MOVE'
  | 'MAJOR_MOVE'
  | 'STRONG_MOVE'
  | 'MODERATE_MOVE'
  | 'NORMAL'
  | 'UNKNOWN';

export type LargeMoveClass =
  | 'NORMAL'
  | 'WATCH'
  | 'HIGH_IMPACT'
  | 'EXCEPTIONAL_30_PLUS'
  | 'EXTREME_100_PLUS'
  | 'EXTREME_200_PLUS'
  | 'EXTREME_300_PLUS'
  | 'EXTREME_500_PLUS'
  | '10_PERCENT_PLUS'
  | '20_PERCENT_PLUS'
  | '50_PERCENT_PLUS'
  | '100_PERCENT_PLUS'
  | 'EXTREME_ASYMMETRY'
  | 'UNKNOWN';

export type DerivativesCrowdingState =
  | 'LONG_CROWDED'
  | 'SHORT_CROWDED'
  | 'BALANCED'
  | 'UNWINDING'
  | 'UNAVAILABLE';

export type FundingExtremity =
  | 'EXTREME_POSITIVE'
  | 'HIGH_POSITIVE'
  | 'NEUTRAL'
  | 'HIGH_NEGATIVE'
  | 'EXTREME_NEGATIVE'
  | 'UNKNOWN';

export type OiVelocityState =
  | 'RAPID_EXPANSION'
  | 'MODERATE_EXPANSION'
  | 'CONTRACTION'
  | 'STABLE'
  | 'UNKNOWN';

export type PumpDumpExhaustionState =
  | 'PUMP_EXHAUSTION'
  | 'DUMP_EXHAUSTION'
  | 'NONE'
  | 'UNKNOWN';

export type LiquidityActionType =
  | 'SWEEP_REJECTION'
  | 'SWEEP_RECLAIM'
  | 'NO_SWEEP'
  | 'UNKNOWN';

export type LargeMoveAlignment =
  | 'SUPPORTS_LONG'
  | 'SUPPORTS_SHORT'
  | 'CONTRADICTS_SETUP'
  | 'WEAKENS_SETUP'
  | 'HIGH_RISK_WARNING'
  | 'NEUTRAL';

export type LiquidationImbalanceState =
  | 'HEAVY_LONGS'
  | 'HEAVY_SHORTS'
  | 'BALANCED'
  | 'UNAVAILABLE';

export interface LargeMoveOpportunityReport {
  symbol: string;
  moveClass: LargeMoveClass;
  estimatedMovePct: number | null; // null if unformed/unavailable (zero fabrication)
  riskRewardRatio: number | null; // null if unformed/unavailable
  asymmetryScore: number; // 0 - 100
  crowdingState: DerivativesCrowdingState;
  fundingRate: number | null;
  fundingChange24h: number | null;
  fundingExtremity: FundingExtremity;
  openInterestUsd: number | null;
  oiChange24h: number | null;
  oiState: OiVelocityState;
  exhaustionState: PumpDumpExhaustionState;
  momentumWeakening: boolean;
  volumeDivergence: boolean;
  liquidityAction: LiquidityActionType;
  structuralConfirmation: boolean;
  liquidationImbalance: LiquidationImbalanceState;
  isAlreadyExtended: boolean;
  antiChaseActive: boolean;
  confluenceAlignment: LargeMoveAlignment;
  reasoning: string;
  evidenceList: string[];
  riskWarnings: string[];
  zeroFabricatedData: true;
}

// ============================================================================
// PHASE 16: UNIFIED INTELLIGENCE FUSION TYPES
// ============================================================================

export type UnifiedDecision = 'LONG' | 'SHORT' | 'WAIT';
export type UnifiedQualityGrade = 'A+' | 'A' | 'B' | 'C' | 'WAIT';
export type UnifiedRiskState = 'ACCEPTABLE' | 'ELEVATED' | 'CRITICAL' | 'INVALIDATED';

export interface UnifiedMarketContext {
  btcRegime: string;
  marketCycle: string;
  sectorBias?: string;
  volatilityState?: string;
  dominanceContext?: string;
}

export interface UnifiedScoreBreakdown {
  directionalEvidenceScore: number;       // [0, 25] Bounded directional momentum & indicators
  structuralConfirmationScore: number;    // [0, 25] SMC / Break of structure / Key level reclaim
  marketRegimeScore: number;              // [0, 15] BTC regime / Relative strength / Macro alignment
  derivativesCrowdingScore: number;       // [0, 10] Funding / OI / Liquidation squeeze confirmation
  catalystScore: number;                  // [0, 10] Supporting news / listing catalyst without chasing
  timingQualityScore: number;             // [0, 10] Near ideal entry zone, not overextended
  riskInvalidationScore: number;          // [0, 5]  Defined structural SL, R:R >= 2.0
  contradictionPenalty: number;           // [0, 40] Subtracted for conflicting evidence/news/Wyckoff
  dataQualityPenalty: number;             // [0, 25] Subtracted for missing/degraded data feeds
  rawScore: number;
  boundedScore: number;                   // [0, 100] Clamped composite confidence
}

export interface UnifiedFusionReport {
  finalDecision: UnifiedDecision;
  quality: UnifiedQualityGrade;
  confidence: number;                     // 0 - 100 (bounded score)
  primaryCategory: PrimarySetupCategory;
  executionState: EntryReadiness | string;
  timingWindow: TimingWindow | string;
  marketContext: UnifiedMarketContext;
  supportingEvidence: string[];
  contradictions: string[];
  riskState: UnifiedRiskState;
  largeMoveClass?: LargeMoveClass;
  asymmetry?: number;                     // 0 - 100
  reasonSummary: string;
  scoreBreakdown: UnifiedScoreBreakdown;
  hasStructuralConfirmation: boolean;
  isAntiChaseActive: boolean;
  zeroFabricatedData: true;
  evaluatedAt: number;
}

export type PrimarySetupCategoryReport = CategoryIntelligenceReport;
export type TradeManagementPlan = TradeManagementAnalysis;

export interface UnifiedFusionInput {
  symbol: string;
  currentPrice: number;
  entryPrice?: number;
  stopLoss?: number;
  targets?: TargetLevel[] | any[];
  riskRewardRatio?: number;
  candles?: Candle[] | CryptoCandle[] | any[];
  coreDecision?: CoreDecision | UnifiedDecision | string;
  coreConfidence?: number;
  qualityGrade?: SignalQualityGrade | UnifiedQualityGrade | string;
  actionablePriority?: ActionablePriority;
  technical?: any;
  smc?: SMCStructureReport | any;
  orderflow?: OrderflowReport | any;
  liquidityZones?: LiquidityZone[];
  derivativesData?: any;
  derivativesIntelligence?: DerivativesIntelligenceReport | any;
  marketRegime?: MarketRegimeType | MarketRegimeAnalysis | string | any;
  marketBreadth?: any;
  sectorRotation?: SectorRotationAnalysis | any;
  marketCycle?: MarketCycleAnalysis | any;
  earlySetupTiming?: any;
  primaryCategory?: PrimarySetupCategory;
  categoryReport?: CategoryIntelligenceReport | any;
  newsImpactReport?: NewsMarketImpactReport | any;
  newListingIntelligence?: NewListingIntelligenceReport | any;
  largeMoveIntelligence?: LargeMoveOpportunityReport | any;
  pumpDumpIntelligence?: PumpDumpIntelligence | any;
  riskAudit?: any;
  timingWindow?: TimingWindow | string;
  executionState?: EntryReadiness | string;
  preMoveIntelligence?: PreMoveReport;
}

export interface PreMoveReport {
  symbol: string;
  coilScore: number; // 0 - 100
  breakoutProbability: number; // 0 - 100%
  projectedDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  invalidationPrice: number;
  invalidationReason: string;
  recommendedAction: 'PREPARE_BREAKOUT_LIMIT' | 'WAIT_FOR_SWEEP' | 'MONITOR_COIL' | 'STAND_ASIDE';
  setupStage?: 'COILING' | 'READY_TO_BREAK' | 'TRIGGERED';
  
  // Detailed Evidence
  compressionRatio: number; // Volatility compression score
  volatilitySqueeze: boolean;
  orderflowAbsorption: {
    detected: boolean;
    type: 'PASSIVE_BID_ABSORPTION' | 'PASSIVE_ASK_ABSORPTION' | 'NONE';
    absorptionStrength: number;
  };
  openInterestBuild: {
    detected: boolean;
    oiChangePct: number;
    implication: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
  };
  smartMoneyPositioning: {
    detected: boolean;
    bias: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
    evidence: string[];
  };
  fakeoutSweep: {
    detected: boolean;
    sweepSide: 'LIQUIDITY_RUN_LOW' | 'LIQUIDITY_RUN_HIGH' | 'NONE';
    reclaimed: boolean;
  };
  multiTimeframeCoil: {
    aligned15m: boolean;
    aligned1h: boolean;
    aligned4h: boolean;
    coilState: 'HIGHLY_COILED' | 'MODERATELY_COILED' | 'EXPANDING';
  };
  keyTriggerLevel: number;
  noChaseLevel: number;
  evidence: string[];
  directionalWarning?: 'BIG_MOVE_COMING' | 'BIG_DUMP_COMING' | 'NEUTRAL_COIL';
  earlyWarningMessage?: string;
  coilingState?:
    | 'NEUTRAL'
    | 'COILING_LONG'
    | 'BIG_MOVE_COMING'
    | 'READY_TO_BREAK_LONG'
    | 'TRIGGERED_LONG'
    | 'EXPLOSIVE_LONG'
    | 'COILING_SHORT'
    | 'BIG_DUMP_COMING'
    | 'READY_TO_BREAK_SHORT'
    | 'TRIGGERED_SHORT'
    | 'EXPLOSIVE_SHORT';
  largeMoveClass?: LargeMoveClass;
  largeMovePotentialLabel?: string;
  isExtremeCandidate?: boolean;
  expansionEvidence?: string[];
  detailedState?:
    | 'COILING'
    | 'ACCUMULATION'
    | 'READY_TO_BREAK'
    | 'TRIGGERED'
    | 'BIG_MOVE_COMING'
    | 'DISTRIBUTION'
    | 'LIQUIDITY_SWEEP'
    | 'BEARISH_STRUCTURE'
    | 'DUMP_WATCH'
    | 'BIG_DUMP_COMING'
    | 'DUMP_TRIGGERED'
    | 'DUMP_EXPANSION';
  timestamp: number;
}

// ============================================================================
// DEDICATED BIG MOVE, DUMP HUNTER & EXCEPTIONAL OPPORTUNITY TYPES
// ============================================================================

export type BigMoveStage = 'WATCH' | 'EARLY_EXPANSION' | 'EXPLOSIVE' | 'EXTREME';
export type DumpHunterStage = 'DUMP_WATCH' | 'DUMP_TRIGGERED' | 'DUMP_EXPANSION' | 'EXTREME_DUMP';
export type ExceptionalOpportunityPriority = 'CRITICAL' | 'VERY_HIGH' | 'HIGH' | 'WATCH' | 'IGNORE';

export interface BigMoveHunterReport {
  symbol: string;
  stage: BigMoveStage;
  detected: boolean;
  score: number; // 0 - 100
  rangeExpansion: {
    m5Expansion: boolean;
    m15Expansion: boolean;
    m30Expansion: boolean;
    h1Expansion: boolean;
    consecutiveExpansions: number;
  };
  volumeVelocity: {
    rvol: number;
    volumeAcceleration: 'EXPLOSIVE' | 'ABOVE_AVERAGE' | 'NORMAL' | 'DRYING_UP';
    takerBuyRatio: number;
    aggressiveTakerFlow: boolean;
  };
  structureTriggers: {
    bosConfirmed: boolean;
    mssConfirmed: boolean;
    chochConfirmed: boolean;
    liquiditySweepReclaimed: boolean;
    breakoutFromCompression: boolean;
  };
  derivativesConfirmation: {
    oiExpanding: boolean;
    oiPriceConfirmed: boolean;
    liquidationImbalance: 'HEAVY_SHORTS' | 'HEAVY_LONGS' | 'BALANCED' | 'UNAVAILABLE';
    fundingPressure: 'FAVORABLE' | 'CROWDED' | 'NEUTRAL';
  };
  asymmetryScore: number; // 0 - 100
  evidence: string[];
  warnings: string[];
}

export interface DumpHunterReport {
  symbol: string;
  stage: DumpHunterStage;
  detected: boolean;
  score: number; // 0 - 100
  distributionFeatures: {
    extremeUpsideExtension: boolean;
    distributionDetected: boolean;
    exhaustionDetected: boolean;
    volumeClimax: boolean;
    liquiditySweepRejected: boolean;
    failedBreakout: boolean;
  };
  breakdownTriggers: {
    bearishMss: boolean;
    bearishBos: boolean;
    supportLost: boolean;
    failedReclaim: boolean;
    accelerationDownward: boolean;
  };
  derivativesReversal: {
    oiReversalPattern: boolean;
    aggressiveSellFlow: boolean;
    liquidationImbalance: 'HEAVY_LONGS' | 'HEAVY_SHORTS' | 'BALANCED' | 'UNAVAILABLE';
    fundingExtremeLong: boolean;
  };
  actionableShort: boolean;
  evidence: string[];
  warnings: string[];
}

export interface ExceptionalOpportunityReport {
  symbol: string;
  priority: ExceptionalOpportunityPriority;
  opportunityClass: 'PRE_PUMP' | 'PRE_DUMP' | 'BIG_MOVE_LONG' | 'HUGE_DUMP_SHORT' | 'NEW_LISTING_EXPANSION' | 'STANDARD';
  asymmetricPotentialScore: number; // 0 - 100
  actionabilityScore: number; // 0 - 100
  compositeRankScore: number; // 0 - 100
  telegramEligible: boolean;
  telegramEligibilityReason: string;
  evidence: string[];
  riskWarnings: string[];
  preMove?: PreMoveReport;
  bigMove?: BigMoveHunterReport;
  dumpHunter?: DumpHunterReport;
  listingIntel?: NewListingIntelligenceReport;
}



