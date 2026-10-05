export type TradingMode = 'DISABLED' | 'PAPER' | 'MANUAL' | 'SEMI-AUTO' | 'FULL-AUTO';

export type MarginMode = 'CROSS' | 'ISOLATED' | 'CROSSED';

export type PositionStatus = 'OPEN' | 'CLOSED';

export type OrderStatus = 'NEW' | 'FILLED' | 'CANCELED' | 'REJECTED';

export type SupportedExchange = 'binance' | 'bybit' | 'okx' | 'mexc' | 'bitget' | 'bitunix';

export interface UserProfile {
  id: string;
  email: string;
  role?: 'ADMIN' | 'USER';
  isApproved?: boolean;
  telegramUsername?: string;
  createdAt: number;
}

export interface ExchangeConfigInfo {
  exchange: SupportedExchange;
  isConfigured: boolean;
  apiKeyMasked?: string;
  accountLabel?: string;
  testnet: boolean;
  connectionStatus: 'DISCONNECTED' | 'CONNECTED' | 'ERROR' | 'INVALID_PERMISSIONS';
  lastValidatedAt?: number;
  lastErrorMessage?: string;
}

export interface UserTradingSettings {
  userId: string;
  tradingMode: TradingMode;
  autonomousTradingEnabled: boolean;
  autoTradingEnabled?: boolean;
  emergencyStop: boolean;
  marginType: MarginMode;
  capitalAllocationPct: number;
  riskPerTradePct: number;
  maxSimultaneousTrades: number;
  maxLeverage: number;
  leverage?: number;
  marginPerTrade?: number;
  minSignalScore: number;
  dailyLossLimitUsd: number;
  tpPartialClosePct: number;
  cooldownMinutes: number;
  paperBalanceUsd: number;
  activeExchange?: SupportedExchange;
  exchangeConnections?: Record<string, ExchangeConfigInfo>;
  allowedSources?: {
    preMove: boolean;
    news: boolean;
    newListing: boolean;
    top5: boolean;
  };
  minQualityThreshold?: 'A+' | 'A' | 'B';
  minMovePotentialPct?: number;
  slippageLimitPct?: number;
  binanceConfig: {
    isConfigured: boolean;
    apiKeyMasked?: string;
    testnet: boolean;
    connectionStatus: 'DISCONNECTED' | 'CONNECTED' | 'ERROR' | 'INVALID_CREDENTIALS' | 'INVALID_PERMISSIONS';
    lastValidatedAt?: number;
    lastErrorMessage?: string;
  };
}

export interface TradeRejectionLog {
  id: string;
  symbol: string;
  signalId: string;
  reason: string;
  rejectionCode: string;
  timestamp: number;
}

export interface ExecutionAuditEvent {
  id: string;
  userId: string;
  exchange: string;
  symbol: string;
  signalId: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  leverage: number;
  stopLoss: number;
  tpTargets: number[];
  orderId?: string;
  executionStatus: 'SUBMITTED' | 'CONFIRMED' | 'REJECTED' | 'FAILED' | 'EMERGENCY_LIQUIDATED';
  rejectionReason?: string;
  timestamp: number;
}

export interface UserPosition {
  id: string;
  userId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  notionalUsd: number;
  marginUsd: number;
  leverage: number;
  marginType: MarginMode;
  stopLoss: number;
  originalStopLoss: number;
  highestPriceReached: number;
  lowestPriceReached: number;
  tpTargets: Array<{
    index: number;
    price: number;
    rMultiple: number;
    hit: boolean;
    closedQty: number;
  }>;
  currentTpStep: number;
  realizedPnL: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  status: PositionStatus;
  isPaper: boolean;
  slOrderId?: string;
  tpOrderId?: string;
  trailedToBreakEven?: boolean;
  trailingRunner?: boolean;
  trailingRunnerActive?: boolean;
  openedAt: number;
  updatedAt: number;
  closedAt?: number;
  closeReason?: string;
}

export interface UserTradeRecord {
  id: string;
  userId: string;
  positionId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  realizedPnL: number;
  realizedPnLPct: number;
  exitReason: string;
  isPaper: boolean;
  openedAt: number;
  closedAt: number;
}

export interface UserTradingSummary {
  user: UserProfile;
  settings: UserTradingSettings;
  balances: {
    equity: number;
    available: number;
    unrealizedPnL: number;
    isPaper: boolean;
    isLiveUnavailable?: boolean;
    liveErrorMessage?: string;
  };
  stats: {
    activePositionsCount: number;
    todayRealizedPnL: number;
    todayLossTotal: number;
    dailyLossRemaining: number;
    winRatePct: number;
    totalTradesCount: number;
  };
  activePositions: UserPosition[];
  recentTrades: UserTradeRecord[];
}

export interface Top5ActionableSignal {
  signalId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  moonScore: number;
  qualityGrade: string;
  currentPrice: number;
  entryPrice: number;
  stopLoss: number;
  targets: Array<{ index: number; price: number; rMultiple: number }>;
  timeframe: string;
  pattern: string;
  evaluation: {
    canExecute: boolean;
    rejectionReason?: string;
    rejectionCode?: string;
    actionType: 'READY_MANUAL' | 'READY_SEMI_AUTO' | 'READY_FULL_AUTO' | 'BLOCKED_BY_RISK' | 'BLOCKED_BY_MODE' | 'ALREADY_IN_POSITION';
    calculatedSize?: {
      units: number;
      notionalUsd: number;
      marginUsd: number;
      leverage: number;
      riskUsd: number;
    };
  };
}
