import { StoredTradingSettings, StoredPosition } from './tradingStorage';

export interface SignalRiskInput {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  targets: Array<{ index: number; price: number; rMultiple: number }>;
  moonScore?: number;
  qualityGrade?: string;
  source?: 'PRE_MOVE' | 'NEWS' | 'NEW_LISTING' | 'TOP_5' | 'CORE_SCANNER';
  movePotentialPct?: number;
}

export interface RiskValidationResult {
  passed: boolean;
  rejectionCode?: string;
  rejectionReason?: string;
  sizing?: {
    units: number;
    notionalUsd: number;
    marginUsd: number;
    leverage: number;
    riskAmountUsd: number;
    riskUsd: number;
    stopDistancePct: number;
  };
}

export class UserRiskEngine {
  /**
   * The Risk Engine is a hard safety layer and cannot be bypassed by the AI Trading Core.
   */
  public static validateTradeExecution(params: {
    settings: StoredTradingSettings;
    openPositions: StoredPosition[];
    todayRealizedLoss: number;
    accountEquity: number;
    availableBalance: number;
    signal: SignalRiskInput;
    recentTradesForSymbol?: number; // timestamp of last trade for this symbol
  }): RiskValidationResult {
    const {
      settings,
      openPositions,
      todayRealizedLoss,
      accountEquity,
      availableBalance,
      signal,
      recentTradesForSymbol
    } = params;

    // 1. Emergency Stop Check
    if (settings.emergencyStop) {
      return {
        passed: false,
        rejectionCode: 'EMERGENCY_STOP_ACTIVE',
        rejectionReason: 'Emergency Stop is currently active for this account. All trading is strictly halted.'
      };
    }

    // 2. Trading Mode Check
    if (settings.tradingMode === 'DISABLED') {
      return {
        passed: false,
        rejectionCode: 'TRADING_MODE_DISABLED',
        rejectionReason: 'Trading mode is set to DISABLED in user settings.'
      };
    }

    // 3. Daily Loss Limit Check
    if (todayRealizedLoss >= settings.dailyLossLimitUsd) {
      return {
        passed: false,
        rejectionCode: 'DAILY_LOSS_LIMIT_EXCEEDED',
        rejectionReason: `Today's realized loss ($${todayRealizedLoss.toFixed(2)}) has reached or exceeded your configured daily loss limit ($${settings.dailyLossLimitUsd.toFixed(2)}). New trades are halted for capital preservation.`
      };
    }

    // 4. Maximum Simultaneous Positions Check
    if (openPositions.length >= settings.maxSimultaneousTrades) {
      return {
        passed: false,
        rejectionCode: 'MAX_POSITIONS_REACHED',
        rejectionReason: `Active positions (${openPositions.length}) have reached maximum allowed simultaneous trades (${settings.maxSimultaneousTrades}).`
      };
    }

    // 5. Duplicate Position Protection
    const cleanSym = signal.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
    const hasExistingPosition = openPositions.some(
      p => p.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase() === cleanSym
    );
    if (hasExistingPosition) {
      return {
        passed: false,
        rejectionCode: 'DUPLICATE_POSITION_PROHIBITED',
        rejectionReason: `An open position already exists for ${signal.symbol}. Duplicate positions are strictly prohibited.`
      };
    }

    // 6. Cooldown Protection
    if (recentTradesForSymbol && settings.cooldownMinutes > 0) {
      const cooldownMs = settings.cooldownMinutes * 60 * 1000;
      const elapsed = Date.now() - recentTradesForSymbol;
      if (elapsed < cooldownMs) {
        const remainingMin = Math.ceil((cooldownMs - elapsed) / 60000);
        return {
          passed: false,
          rejectionCode: 'COOLDOWN_ACTIVE',
          rejectionReason: `Cooldown protection active for ${signal.symbol}. Please wait ${remainingMin}m before opening another trade on this asset.`
        };
      }
    }

    // 7. Minimum Signal Quality / MoonScore Check
    if (signal.moonScore !== undefined && signal.moonScore < settings.minSignalScore) {
      return {
        passed: false,
        rejectionCode: 'SIGNAL_SCORE_BELOW_MINIMUM',
        rejectionReason: `Signal MoonScore (${signal.moonScore}) is below user required threshold (${settings.minSignalScore}).`
      };
    }

    // 7a. Setup Quality Grade Threshold Check (e.g. A+ only vs A and above)
    if (settings.minQualityThreshold && signal.qualityGrade) {
      const gradeRank: Record<string, number> = { 'A+': 3, 'A': 2, 'B': 1, 'C': 0 };
      const signalRank = gradeRank[signal.qualityGrade] ?? 1;
      const requiredRank = gradeRank[settings.minQualityThreshold] ?? 2;
      if (signalRank < requiredRank) {
        return {
          passed: false,
          rejectionCode: 'GRADE_BELOW_THRESHOLD',
          rejectionReason: `Signal quality grade (${signal.qualityGrade}) is below user required minimum (${settings.minQualityThreshold}).`
        };
      }
    }

    // 7b. Allowed Trading Sources Filter
    if (settings.allowedSources && signal.source) {
      const sourceKeyMap: Record<string, keyof typeof settings.allowedSources> = {
        'PRE_MOVE': 'preMove',
        'NEWS': 'news',
        'NEW_LISTING': 'newListing',
        'TOP_5': 'top5'
      };
      const sourceKey = sourceKeyMap[signal.source];
      if (sourceKey && settings.allowedSources[sourceKey] === false) {
        return {
          passed: false,
          rejectionCode: 'SOURCE_NOT_ENABLED',
          rejectionReason: `Auto-trading is disabled for ${signal.source} opportunities in your trading settings.`
        };
      }
    }

    // 7c. Minimum Move Potential Threshold (Default 30% for high-opportunity auto-trading)
    const minMove = settings.minMovePotentialPct !== undefined ? settings.minMovePotentialPct : 30;
    if (minMove > 0 && signal.movePotentialPct !== undefined && signal.movePotentialPct < minMove) {
      return {
        passed: false,
        rejectionCode: 'MOVE_POTENTIAL_BELOW_MINIMUM',
        rejectionReason: `Move potential (${signal.movePotentialPct.toFixed(1)}%) is below user required threshold (${minMove}%). MoonScanner high-opportunity auto-trading requires >=${minMove}% structurally justified potential.`
      };
    }

    // 7d. Slippage Protection Limit Check
    const slippageLimit = settings.slippageLimitPct !== undefined ? settings.slippageLimitPct : 0.8;
    if (slippageLimit > 0 && signal.entryPrice > 0 && signal.currentPrice > 0) {
      const driftPct = (Math.abs(signal.currentPrice - signal.entryPrice) / signal.entryPrice) * 100;
      if (driftPct > slippageLimit) {
        return {
          passed: false,
          rejectionCode: 'SLIPPAGE_LIMIT_EXCEEDED',
          rejectionReason: `Current market price has drifted ${driftPct.toFixed(2)}% from signal entry price, exceeding your slippage limit (${slippageLimit}%). Execution blocked to protect against adverse fills.`
        };
      }
    }

    // 8. Structural Stop Loss Requirement
    if (!signal.stopLoss || signal.stopLoss <= 0 || isNaN(signal.stopLoss)) {
      return {
        passed: false,
        rejectionCode: 'INVALID_STOP_LOSS',
        rejectionReason: 'Trade execution rejected: Stop loss is missing or invalid. Every position MUST have a valid structural stop loss.'
      };
    }

    const isLong = signal.direction === 'LONG';
    if (isLong && signal.stopLoss >= signal.entryPrice) {
      return {
        passed: false,
        rejectionCode: 'INVALID_STOP_LOSS_DIRECTION',
        rejectionReason: `Trade execution rejected: For LONG, Stop Loss (${signal.stopLoss}) must be strictly below Entry Price (${signal.entryPrice}).`
      };
    }
    if (!isLong && signal.stopLoss <= signal.entryPrice) {
      return {
        passed: false,
        rejectionCode: 'INVALID_STOP_LOSS_DIRECTION',
        rejectionReason: `Trade execution rejected: For SHORT, Stop Loss (${signal.stopLoss}) must be strictly above Entry Price (${signal.entryPrice}).`
      };
    }

    const stopDistance = Math.abs(signal.entryPrice - signal.stopLoss);
    if (stopDistance <= 0) {
      return {
        passed: false,
        rejectionCode: 'ZERO_STOP_DISTANCE',
        rejectionReason: 'Stop distance cannot be zero.'
      };
    }

    // 9. Sufficient Balance & Deterministic Position Sizing
    if (accountEquity <= 0) {
      return {
        passed: false,
        rejectionCode: 'ZERO_EQUITY',
        rejectionReason: 'Account equity is zero or unverified. Cannot compute position size.'
      };
    }

    // Leverage enforcement: prioritize user-configured leverage or maxLeverage (up to 125x)
    const leverage = Math.max(1, Math.min(settings.leverage || settings.maxLeverage || 10, 125));

    // Determine margin: If user has explicit marginPerTrade configured, use it directly (with safety caps)
    let marginUsd: number;
    let notionalUsd: number;
    let positionUnits: number;
    const maxCapitalAllowedUsd = accountEquity * (settings.capitalAllocationPct / 100);

    if (settings.marginPerTrade && settings.marginPerTrade > 0) {
      marginUsd = Math.min(settings.marginPerTrade, maxCapitalAllowedUsd, availableBalance);
      notionalUsd = marginUsd * leverage;
      positionUnits = notionalUsd / signal.entryPrice;
    } else {
      // Position units based on risk dollar amount and stop loss distance
      const riskAmountUsd = accountEquity * (settings.riskPerTradePct / 100);
      positionUnits = riskAmountUsd / stopDistance;
      notionalUsd = positionUnits * signal.entryPrice;
      marginUsd = notionalUsd / leverage;

      if (marginUsd > maxCapitalAllowedUsd) {
        const scaleFactor = maxCapitalAllowedUsd / marginUsd;
        positionUnits *= scaleFactor;
        notionalUsd = positionUnits * signal.entryPrice;
        marginUsd = notionalUsd / leverage;
      }
    }

    const riskAmountUsd = Math.abs(positionUnits * (signal.entryPrice - signal.stopLoss));

    // Enforce exchange minimum notional requirement ($5.00 USDT on Binance Futures)
    const MIN_EXCHANGE_NOTIONAL_USD = 5.00;
    if (notionalUsd < MIN_EXCHANGE_NOTIONAL_USD) {
      const minRequiredMargin = MIN_EXCHANGE_NOTIONAL_USD / leverage;
      if (minRequiredMargin <= maxCapitalAllowedUsd && minRequiredMargin <= availableBalance) {
        // Adjust up to minimum exchange notional
        notionalUsd = MIN_EXCHANGE_NOTIONAL_USD;
        positionUnits = notionalUsd / signal.entryPrice;
        marginUsd = notionalUsd / leverage;
      } else {
        return {
          passed: false,
          rejectionCode: 'NOTIONAL_BELOW_EXCHANGE_MINIMUM',
          rejectionReason: `Order notional value ($${notionalUsd.toFixed(2)}) is below exchange minimum ($${MIN_EXCHANGE_NOTIONAL_USD.toFixed(2)} USDT), and scaling up would exceed configured risk or balance limits.`
        };
      }
    }

    // Check available balance
    if (marginUsd > availableBalance) {
      return {
        passed: false,
        rejectionCode: 'INSUFFICIENT_AVAILABLE_BALANCE',
        rejectionReason: `Insufficient available balance. Required margin: $${marginUsd.toFixed(2)}, Available balance: $${availableBalance.toFixed(2)}.`
      };
    }

    if (positionUnits <= 0 || isNaN(positionUnits)) {
      return {
        passed: false,
        rejectionCode: 'CALCULATION_ERROR',
        rejectionReason: 'Position size computation resulted in an invalid number.'
      };
    }

    const stopDistancePct = (stopDistance / signal.entryPrice) * 100;

    return {
      passed: true,
      sizing: {
        units: Number(positionUnits.toFixed(4)),
        notionalUsd: Number(notionalUsd.toFixed(2)),
        marginUsd: Number(marginUsd.toFixed(2)),
        leverage,
        riskAmountUsd: Number(riskAmountUsd.toFixed(2)),
        riskUsd: Number(riskAmountUsd.toFixed(2)),
        stopDistancePct: Number(stopDistancePct.toFixed(2))
      }
    };
  }
}
