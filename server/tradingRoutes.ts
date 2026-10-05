import express from 'express';
import { tradingStorage, StoredUser, StoredSupportedExchange } from './tradingStorage';
import { UserTradingCore } from './userTradingCore';
import { ExchangeAdapterHub } from './exchangeAdapterHub';
import { UserTradingSummary, ExchangeConfigInfo } from '../src/types/trading';
import { SecurityService } from './security';
import { BinanceClient } from './binanceClient';
import { get24hTicker } from './cryptoService';

export interface AuthenticatedRequest extends express.Request {
  user?: StoredUser;
}

export const requireAuth = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.split(' ')[1];
  const session = tradingStorage.getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  const user = tradingStorage.getUserById(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User account not found.' });
  }

  req.user = user;
  next();
};

export const requireAdmin = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
) => {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied. Super Admin privileges required.' });
    }
    next();
  });
};

export const tradingRouter = express.Router();

// ================= AUTHENTICATION ENDPOINTS =================

tradingRouter.post('/auth/register', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Valid email and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const user = tradingStorage.createUser(email, password);
    const session = tradingStorage.createSession(user.id);

    res.json({
      token: session.token,
      user: {
        id: user.id,
        email: user.email,
        isApproved: user.isApproved,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Registration failed.' });
  }
});

tradingRouter.post('/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = tradingStorage.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isValid = tradingStorage.verifyPassword(password, user.salt, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const session = tradingStorage.createSession(user.id);

    res.json({
      token: session.token,
      user: {
        id: user.id,
        email: user.email,
        isApproved: user.isApproved,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed.' });
  }
});

tradingRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  res.json({
    id: user.id,
    email: user.email,
    isApproved: user.isApproved,
    role: user.role,
    createdAt: user.createdAt
  });
});

tradingRouter.post('/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    tradingStorage.deleteSession(token);
  }
  res.json({ success: true });
});

// ================= ADMIN USER APPROVAL ENDPOINTS =================

tradingRouter.get('/admin/users/pending', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const adminEmail = (process.env.ADMIN_EMAIL || 'sabbirmoon969@gmail.com').toLowerCase();
  const isAdmin = user.role === 'ADMIN' || user.email.toLowerCase() === adminEmail;
  if (!isAdmin) {
    return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
  }

  const pending = tradingStorage.getPendingUsers().map(u => {
    const link = tradingStorage.getTelegramLinkByUserId(u.id);
    return {
      id: u.id,
      email: u.email,
      createdAt: u.createdAt,
      isApproved: u.isApproved,
      role: u.role,
      telegramUsername: link?.telegramUsername,
      telegramLink: link
    };
  });
  res.json({ pending, pendingUsers: pending, count: pending.length });
});

tradingRouter.get('/admin/users', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const adminEmail = (process.env.ADMIN_EMAIL || 'sabbirmoon969@gmail.com').toLowerCase();
  const isAdmin = user.role === 'ADMIN' || user.email.toLowerCase() === adminEmail;
  if (!isAdmin) {
    return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
  }

  const users = tradingStorage.getAllUsers().map(u => {
    const link = tradingStorage.getTelegramLinkByUserId(u.id);
    return {
      id: u.id,
      email: u.email,
      createdAt: u.createdAt,
      isApproved: u.isApproved,
      role: u.role,
      telegramUsername: link?.telegramUsername,
      telegramLink: link
    };
  });
  res.json({ users, allUsers: users, count: users.length });
});

tradingRouter.post('/admin/users/approve', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const adminEmail = (process.env.ADMIN_EMAIL || 'sabbirmoon969@gmail.com').toLowerCase();
  const isAdmin = user.role === 'ADMIN' || user.email.toLowerCase() === adminEmail;
  if (!isAdmin) {
    return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
  }

  const identifier = req.body?.identifier || req.body?.userId;
  if (!identifier || typeof identifier !== 'string') {
    return res.status(400).json({ error: 'User ID, Email, or Telegram Chat ID is required in identifier.' });
  }

  const approved = tradingStorage.approveUser(identifier);
  if (!approved) {
    return res.status(404).json({ error: `User not found matching ${identifier}` });
  }

  res.json({
    success: true,
    message: `User ${approved.email} has been approved.`,
    user: {
      id: approved.id,
      email: approved.email,
      isApproved: approved.isApproved,
      role: approved.role
    }
  });
});

tradingRouter.post('/admin/users/revoke', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const adminEmail = (process.env.ADMIN_EMAIL || 'sabbirmoon969@gmail.com').toLowerCase();
  const isAdmin = user.role === 'ADMIN' || user.email.toLowerCase() === adminEmail;
  if (!isAdmin) {
    return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
  }

  const identifier = req.body?.identifier || req.body?.userId;
  if (!identifier || typeof identifier !== 'string') {
    return res.status(400).json({ error: 'User ID, Email, or Telegram Chat ID is required in identifier.' });
  }

  const revoked = tradingStorage.revokeUser(identifier);
  if (!revoked) {
    return res.status(404).json({ error: `User not found matching ${identifier}` });
  }

  res.json({
    success: true,
    message: `User ${revoked.email} access has been revoked.`,
    user: {
      id: revoked.id,
      email: revoked.email,
      isApproved: revoked.isApproved,
      role: revoked.role
    }
  });
});

// ================= USER TRADING SUMMARY & STATUS =================

tradingRouter.get('/trading/summary', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const settings = tradingStorage.getUserSettings(userId);
    const activePositions = tradingStorage.getOpenPositions(userId);
    const recentTrades = tradingStorage.getUserTrades(userId);
    const todayLoss = tradingStorage.getTodayRealizedLoss(userId);
    const todayPnL = tradingStorage.getTodayRealizedPnL(userId);

    // Calculate balances
    let equity = settings.paperBalanceUsd;
    let available = settings.paperBalanceUsd;
    let isPaper = settings.tradingMode === 'PAPER' || settings.tradingMode === 'DISABLED';
    let isLiveUnavailable = false;
    let liveErrorMessage: string | undefined = undefined;
    let unrealizedTotal = 0;

    for (const pos of activePositions) {
      unrealizedTotal += pos.unrealizedPnL || 0;
    }

    const exchangeConnections = tradingStorage.getUserExchangeConnections(userId);

    if (!isPaper) {
      const creds = tradingStorage.getDecryptedExchangeCredentials(userId);
      if (creds) {
        try {
          const balance = await ExchangeAdapterHub.getAccountBalance(creds);
          equity = balance.totalEquity;
          available = balance.availableBalance;
          unrealizedTotal = balance.unrealizedPnL;
        } catch (exErr: any) {
          isLiveUnavailable = true;
          liveErrorMessage = `Connection to ${creds.exchange} failed: ${exErr.message}`;
          equity = 0;
          available = 0;
        }
      } else {
        isLiveUnavailable = true;
        liveErrorMessage = `No API credentials configured for ${settings.activeExchange || 'active exchange'}`;
        equity = 0;
        available = 0;
      }
    }

    // Win rate calculation
    const wonTrades = recentTrades.filter(t => t.realizedPnL > 0);
    const winRate = recentTrades.length > 0 ? (wonTrades.length / recentTrades.length) * 100 : 0;

    const summary: UserTradingSummary = {
      user: {
        id: req.user!.id,
        email: req.user!.email,
        createdAt: req.user!.createdAt
      },
      settings: {
        userId: settings.userId,
        tradingMode: settings.tradingMode,
        autoTradingEnabled: settings.autoTradingEnabled ?? settings.autonomousTradingEnabled,
        autonomousTradingEnabled: settings.autonomousTradingEnabled,
        emergencyStop: settings.emergencyStop,
        activeExchange: settings.activeExchange || 'binance',
        allowedSources: settings.allowedSources || { preMove: true, news: true, newListing: true, top5: true },
        minQualityThreshold: settings.minQualityThreshold || 'A',
        minMovePotentialPct: settings.minMovePotentialPct ?? 30,
        slippageLimitPct: settings.slippageLimitPct ?? 0.5,
        marginType: 'CROSS',
        capitalAllocationPct: settings.capitalAllocationPct,
        riskPerTradePct: settings.riskPerTradePct,
        maxSimultaneousTrades: settings.maxSimultaneousTrades,
        maxLeverage: settings.maxLeverage,
        minSignalScore: settings.minSignalScore,
        dailyLossLimitUsd: settings.dailyLossLimitUsd,
        tpPartialClosePct: settings.tpPartialClosePct,
        cooldownMinutes: settings.cooldownMinutes,
        paperBalanceUsd: settings.paperBalanceUsd,
        exchangeConnections,
        binanceConfig: {
          isConfigured: Boolean(exchangeConnections['binance']?.isConfigured),
          apiKeyMasked: exchangeConnections['binance']?.apiKeyMasked,
          testnet: exchangeConnections['binance']?.testnet ?? false,
          connectionStatus: (exchangeConnections['binance']?.connectionStatus as any) || 'DISCONNECTED',
          lastValidatedAt: exchangeConnections['binance']?.lastValidatedAt,
          lastErrorMessage: exchangeConnections['binance']?.lastErrorMessage
        }
      },
      balances: {
        equity: Number(equity.toFixed(2)),
        available: Number(available.toFixed(2)),
        unrealizedPnL: Number(unrealizedTotal.toFixed(2)),
        isPaper,
        isLiveUnavailable,
        liveErrorMessage
      },
      stats: {
        activePositionsCount: activePositions.length,
        todayRealizedPnL: todayPnL,
        todayLossTotal: Number(todayLoss.toFixed(2)),
        dailyLossRemaining: Math.max(0, Number((settings.dailyLossLimitUsd - todayLoss).toFixed(2))),
        winRatePct: Number(winRate.toFixed(1)),
        totalTradesCount: recentTrades.length
      },
      activePositions,
      recentTrades
    };

    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch trading summary.' });
  }
});

// ================= USER TRADING SETTINGS =================

tradingRouter.get('/trading/settings', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const settings = tradingStorage.getUserSettings(userId);
  const exchangeConnections = tradingStorage.getUserExchangeConnections(userId);

  res.json({
    ...settings,
    marginType: settings.marginType || 'CROSS',
    exchangeConnections,
    binanceCredentials: exchangeConnections['binance']
  });
});

tradingRouter.put('/trading/settings', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const body = req.body;

    const updates: any = {};
    if (['DISABLED', 'PAPER', 'MANUAL', 'SEMI-AUTO', 'FULL-AUTO'].includes(body.tradingMode)) {
      updates.tradingMode = body.tradingMode;
    }
    if (typeof body.autoTradingEnabled === 'boolean') {
      updates.autoTradingEnabled = body.autoTradingEnabled;
      updates.autonomousTradingEnabled = body.autoTradingEnabled;
    } else if (typeof body.autonomousTradingEnabled === 'boolean') {
      updates.autonomousTradingEnabled = body.autonomousTradingEnabled;
      updates.autoTradingEnabled = body.autonomousTradingEnabled;
    }
    if (typeof body.emergencyStop === 'boolean') {
      updates.emergencyStop = body.emergencyStop;
    }
    if (['binance', 'bybit', 'okx', 'mexc', 'bitget', 'bitunix'].includes(body.activeExchange)) {
      updates.activeExchange = body.activeExchange;
    }
    if (typeof body.marginType === 'string') {
      const m = body.marginType.toUpperCase();
      if (['CROSS', 'ISOLATED', 'CROSSED'].includes(m)) {
        updates.marginType = m === 'ISOLATED' ? 'ISOLATED' : 'CROSS';
      }
    }
    if (Array.isArray(body.allowedSources)) {
      updates.allowedSources = body.allowedSources;
    }
    if (['A+', 'A', 'B', 'ALL'].includes(body.minQualityThreshold)) {
      updates.minQualityThreshold = body.minQualityThreshold;
    }
    if (typeof body.minMovePotentialPct === 'number') {
      updates.minMovePotentialPct = Math.max(0, Math.min(100, body.minMovePotentialPct));
    }
    if (typeof body.slippageLimitPct === 'number') {
      updates.slippageLimitPct = Math.max(0.1, Math.min(5, body.slippageLimitPct));
    }
    if (typeof body.capitalAllocationPct === 'number') {
      updates.capitalAllocationPct = Math.max(1, Math.min(100, body.capitalAllocationPct));
    }
    if (typeof body.riskPerTradePct === 'number') {
      updates.riskPerTradePct = Math.max(0.1, Math.min(10, body.riskPerTradePct));
    }
    if (typeof body.maxSimultaneousTrades === 'number') {
      updates.maxSimultaneousTrades = Math.max(1, Math.min(10, body.maxSimultaneousTrades));
    }
    if (typeof body.maxLeverage === 'number' && !isNaN(body.maxLeverage)) {
      updates.maxLeverage = Math.max(1, Math.min(125, Math.round(body.maxLeverage)));
    }
    if (typeof body.leverage === 'number' && !isNaN(body.leverage)) {
      updates.leverage = Math.max(1, Math.min(125, Math.round(body.leverage)));
      updates.maxLeverage = updates.leverage;
    }
    if (typeof body.marginPerTrade === 'number' && !isNaN(body.marginPerTrade) && body.marginPerTrade > 0) {
      updates.marginPerTrade = Number(body.marginPerTrade);
    }
    if (typeof body.minSignalScore === 'number') {
      updates.minSignalScore = Math.max(50, Math.min(99, body.minSignalScore));
    }
    if (typeof body.dailyLossLimitUsd === 'number') {
      updates.dailyLossLimitUsd = Math.max(10, body.dailyLossLimitUsd);
    }
    if (typeof body.tpPartialClosePct === 'number') {
      updates.tpPartialClosePct = Math.max(5, Math.min(50, body.tpPartialClosePct));
    }
    if (typeof body.cooldownMinutes === 'number') {
      updates.cooldownMinutes = Math.max(0, Math.min(120, body.cooldownMinutes));
    }

    const updated = tradingStorage.updateUserSettings(userId, updates);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update settings.' });
  }
});

// ================= MULTI-EXCHANGE CONNECTIONS =================

tradingRouter.post('/trading/exchange/connect', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { exchange = 'binance', apiKey, apiSecret, passphrase, accountLabel, testnet = false } = req.body;

    if (!['binance', 'bybit', 'okx', 'mexc', 'bitget', 'bitunix'].includes(exchange)) {
      return res.status(400).json({ error: `Unsupported exchange: ${exchange}` });
    }

    if (!apiKey || !apiSecret || typeof apiKey !== 'string' || typeof apiSecret !== 'string') {
      return res.status(400).json({ error: 'Both API Key and API Secret are required.' });
    }

    // Zero-Withdrawal Enforcement Policy for Binance
    if (exchange === 'binance') {
      const securityCheck = await SecurityService.verifyZeroWithdrawalPolicy(apiKey.trim(), apiSecret.trim());
      if (!securityCheck.allowed) {
        return res.status(400).json({
          error: securityCheck.violationReason || 'ZERO-WITHDRAWAL POLICY: Withdrawals are enabled on this API key. Withdrawals must be strictly disabled.'
        });
      }
    }

    // Test connection using ExchangeAdapterHub
    const testResult = await ExchangeAdapterHub.testConnection({
      exchange: exchange as StoredSupportedExchange,
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      passphrase: passphrase ? passphrase.trim() : undefined,
      testnet: !!testnet
    });

    if (!testResult.connected) {
      throw new Error(`Could not establish connection to ${exchange.toUpperCase()}: ${testResult.notes || 'Check API credentials'}`);
    }

    // Store encrypted credentials (never exposed or logged)
    tradingStorage.setExchangeCredentials(
      userId,
      exchange as StoredSupportedExchange,
      apiKey.trim(),
      apiSecret.trim(),
      passphrase ? passphrase.trim() : undefined,
      accountLabel,
      testnet
    );

    res.json({
      connected: true,
      exchange,
      canTrade: testResult.canTrade,
      accountType: testResult.accountType,
      marginBalance: testResult.totalMarginBalance,
      availableBalance: testResult.availableBalance,
      marginMode: 'CROSS'
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to connect exchange.' });
  }
});

tradingRouter.delete('/trading/exchange/:exchange/disconnect', requireAuth, (req: AuthenticatedRequest, res) => {
  const exchange = req.params.exchange as StoredSupportedExchange;
  tradingStorage.removeExchangeCredentials(req.user!.id, exchange);
  res.json({ success: true, message: `${exchange.toUpperCase()} credentials removed.` });
});

tradingRouter.get('/trading/exchange/status', requireAuth, (req: AuthenticatedRequest, res) => {
  const connections = tradingStorage.getUserExchangeConnections(req.user!.id);
  res.json({ connections });
});

// Backwards-compatible Binance alias routes
tradingRouter.post('/trading/binance/connect', requireAuth, async (req: AuthenticatedRequest, res) => {
  req.body.exchange = 'binance';
  const userId = req.user!.id;
  const { apiKey, apiSecret, testnet = false } = req.body;

  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'Both Binance API Key and API Secret are required.' });
  }

  try {
    const testResult = await ExchangeAdapterHub.testConnection({
      exchange: 'binance',
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      testnet: !!testnet
    });

    if (!testResult.connected) {
      throw new Error(`Could not establish connection to Binance.`);
    }

    tradingStorage.setExchangeCredentials(userId, 'binance', apiKey.trim(), apiSecret.trim(), undefined, 'Binance', testnet);

    res.json({
      connected: true,
      canTrade: testResult.canTrade,
      accountType: testResult.accountType,
      marginBalance: testResult.totalMarginBalance,
      availableBalance: testResult.availableBalance,
      marginMode: 'CROSS'
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to connect to Binance.' });
  }
});

tradingRouter.delete('/trading/binance/disconnect', requireAuth, (req: AuthenticatedRequest, res) => {
  tradingStorage.removeExchangeCredentials(req.user!.id, 'binance');
  res.json({ success: true, message: 'Binance credentials removed.' });
});

// ================= TRADE REJECTIONS AUDIT LOG =================

tradingRouter.get('/trading/rejections', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const rejections = tradingStorage.getUserRejections(req.user!.id);
    res.json(rejections);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch rejection logs.' });
  }
});

// ================= EMERGENCY STOP =================

tradingRouter.post('/trading/emergency-stop', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const active = req.body.active !== false; // default to true

    tradingStorage.updateUserSettings(userId, { emergencyStop: active });

    res.json({
      emergencyStop: active,
      message: active
        ? 'Emergency stop activated. All new automated entries and trades are strictly halted. Open positions remain visible and manageable.'
        : 'Emergency stop cleared. Trading may resume based on user settings.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Explicit user action to close all open positions
const handleEmergencyCloseAll = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const userId = req.user!.id;
    const openPositions = tradingStorage.getOpenPositions(userId);
    const results = [];

    for (const pos of openPositions) {
      try {
        const closed = await UserTradingCore.closePositionForUser(userId, pos.id, 'EMERGENCY_EXPLICIT_CLOSE_ALL');
        results.push({ positionId: pos.id, symbol: pos.symbol, status: 'CLOSED', pnl: closed.realizedPnL });
      } catch (err: any) {
        results.push({ positionId: pos.id, symbol: pos.symbol, status: 'ERROR', error: err.message });
      }
    }

    res.json({
      success: true,
      closedCount: results.filter(r => r.status === 'CLOSED').length,
      results
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to close positions' });
  }
};

tradingRouter.post('/trading/emergency-close-all', requireAuth, handleEmergencyCloseAll);
tradingRouter.post('/trading/positions/emergency-close-all', requireAuth, handleEmergencyCloseAll);

// ================= TOP 5 ACTIONABLE SIGNALS =================

tradingRouter.get('/trading/top5-actionable', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const actionable = await UserTradingCore.getTop5ActionableSignals(userId);
    res.json(actionable);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to evaluate Top 5 signals.' });
  }
});

// ================= TRADE EXECUTION & MANAGEMENT =================

tradingRouter.post('/trading/execute', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { signalId, forceManual, margin, leverage, marginType } = req.body;

    if (!signalId) {
      return res.status(400).json({ error: 'signalId is required to execute a trade.' });
    }

    const position = await UserTradingCore.executeTradeForUser(userId, signalId, {
      forceManual: !!forceManual,
      margin: typeof margin === 'number' ? margin : (margin ? parseFloat(margin) : undefined),
      leverage: typeof leverage === 'number' ? leverage : (leverage ? parseInt(leverage, 10) : undefined),
      marginType: marginType === 'ISOLATED' ? 'ISOLATED' : (marginType === 'CROSS' ? 'CROSS' : undefined)
    });

    res.json({
      success: true,
      position
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Trade execution failed.' });
  }
});

tradingRouter.post('/trading/positions/:id/close', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const positionId = req.params.id;

    const trade = await UserTradingCore.closePositionForUser(userId, positionId, 'MANUAL_CLOSE');
    res.json({
      success: true,
      trade
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to close position.' });
  }
});

tradingRouter.post('/trading/reset-paper', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    tradingStorage.updateUserSettings(userId, { paperBalanceUsd: 10000 });
    res.json({ success: true, paperBalanceUsd: 10000 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ================= EXECUTION AUDIT LOGS =================
tradingRouter.get('/trading/audit-logs', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const audits = tradingStorage.getUserExecutionAudits(userId);
    res.json(audits);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch execution audits.' });
  }
});

// ================= EXCHANGE POSITION SYNCHRONIZATION =================
tradingRouter.post('/trading/sync-positions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const result = await UserTradingCore.syncPositionsWithExchange(userId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to synchronize positions with exchange.' });
  }
});

// ================= LIVE TELEMETRY & SYMBOL LIMITS =================
tradingRouter.get('/trading/telemetry', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const creds = tradingStorage.getDecryptedExchangeCredentials(userId);
    if (creds && creds.exchange === 'binance' && creds.apiKey && creds.apiSecret) {
      const telemetry = await BinanceClient.getLiveTelemetry({
        apiKey: creds.apiKey,
        apiSecret: creds.apiSecret
      });
      return res.json({ live: true, ...telemetry });
    }

    const settings = tradingStorage.getUserSettings(userId);
    const openPositions = tradingStorage.getOpenPositions(userId);
    let unrealized = 0;
    for (const p of openPositions) unrealized += p.unrealizedPnL || 0;

    return res.json({
      live: false,
      totalEquity: settings.paperBalanceUsd + unrealized,
      availableBalance: settings.paperBalanceUsd,
      marginBalance: settings.paperBalanceUsd,
      unrealizedPnL: unrealized,
      positionsCount: openPositions.length,
      canTrade: true
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch telemetry.' });
  }
});

tradingRouter.get('/trading/symbol-info/:symbol', async (req, res) => {
  try {
    const sym = req.params.symbol;
    const bracket = await BinanceClient.getSymbolLeverageBracket(sym);
    res.json(bracket);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to query symbol bracket.' });
  }
});

// ================= MANUAL POSITION OVERRIDE MANAGER =================
// 1. Full Market Close (100% and cancel open conditional orders)
tradingRouter.post('/trading/positions/:id/market-close', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const positionId = req.params.id;
    const openPositions = tradingStorage.getOpenPositions(userId);
    const pos = openPositions.find(p => p.id === positionId);
    if (!pos) return res.status(404).json({ error: 'Position not found' });

    const creds = tradingStorage.getDecryptedExchangeCredentials(userId);
    if (!pos.isPaper && creds && creds.exchange === 'binance') {
      try {
        await BinanceClient.marketCloseFullPosition(
          { apiKey: creds.apiKey, apiSecret: creds.apiSecret },
          pos.symbol,
          pos.direction,
          pos.quantity
        );
      } catch (exErr: any) {
        console.warn(`[TradingRouter] Live Binance market close error:`, exErr.message);
      }
    }

    const trade = await UserTradingCore.closePositionForUser(userId, positionId, 'MANUAL_FULL_MARKET_CLOSE');
    res.json({ success: true, message: 'Position fully closed at market price.', trade });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Market close failed' });
  }
});

// 2. Partial Take-Profit Market Close (25%, 50%, 75%)
tradingRouter.post('/trading/positions/:id/partial-close', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const positionId = req.params.id;
    const pct = Number(req.body.percentage) || 50;
    if (![25, 50, 75].includes(pct)) {
      return res.status(400).json({ error: 'Partial percentage must be 25, 50, or 75.' });
    }

    const openPositions = tradingStorage.getOpenPositions(userId);
    const pos = openPositions.find(p => p.id === positionId);
    if (!pos) return res.status(404).json({ error: 'Position not found' });

    const ticker = await get24hTicker(pos.symbol);
    const currentPrice = ticker?.lastPrice || pos.currentPrice || pos.entryPrice;
    const closeQty = Number((pos.quantity * (pct / 100)).toFixed(4));
    const remainingQty = Math.max(0, Number((pos.quantity - closeQty).toFixed(4)));

    if (closeQty <= 0) {
      return res.status(400).json({ error: 'Quantity too small for partial closure.' });
    }

    const creds = tradingStorage.getDecryptedExchangeCredentials(userId);
    if (!pos.isPaper && creds && creds.exchange === 'binance') {
      await BinanceClient.partialMarketClose(
        { apiKey: creds.apiKey, apiSecret: creds.apiSecret },
        pos.symbol,
        pos.direction,
        closeQty
      );
    }

    // Calculate partial realized PnL
    const priceDiff = pos.direction === 'LONG' ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice;
    const partialPnL = priceDiff * closeQty;

    pos.quantity = remainingQty;
    pos.notionalUsd = Number((remainingQty * currentPrice).toFixed(2));
    pos.realizedPnL = Number(((pos.realizedPnL || 0) + partialPnL).toFixed(2));
    pos.updatedAt = Date.now();

    if (remainingQty <= 0) {
      await UserTradingCore.closePositionForUser(userId, positionId, `PARTIAL_${pct}_FULL_REMAINDER`);
    } else {
      tradingStorage.updatePosition(userId, positionId, pos);
    }

    res.json({
      success: true,
      message: `Successfully closed ${pct}% (${closeQty} ${pos.symbol}) at market.`,
      remainingQty,
      closedQty: closeQty,
      partialPnL: Number(partialPnL.toFixed(2))
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Partial close failed' });
  }
});

// 3. Dynamic TP/SL Editor (In-place bracket modification on Binance)
tradingRouter.post('/trading/positions/:id/update-brackets', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const positionId = req.params.id;
    const openPositions = tradingStorage.getOpenPositions(userId);
    const pos = openPositions.find(p => p.id === positionId);
    if (!pos) return res.status(404).json({ error: 'Position not found' });

    const newStopLoss = req.body.stopLoss !== undefined ? Number(req.body.stopLoss) : undefined;
    const newTakeProfit = req.body.takeProfit !== undefined ? Number(req.body.takeProfit) : undefined;

    if (!newStopLoss && !newTakeProfit) {
      return res.status(400).json({ error: 'Provide at least stopLoss or takeProfit to update.' });
    }

    const creds = tradingStorage.getDecryptedExchangeCredentials(userId);
    if (!pos.isPaper && creds && creds.exchange === 'binance') {
      const result = await BinanceClient.updateBracketOrders({
        credentials: { apiKey: creds.apiKey, apiSecret: creds.apiSecret },
        symbol: pos.symbol,
        direction: pos.direction,
        quantity: pos.quantity,
        newStopLoss,
        newTakeProfit
      });
      if (result.slOrderId) pos.slOrderId = result.slOrderId;
      if (result.tpOrderId) pos.tpOrderId = result.tpOrderId;
    }

    if (newStopLoss && newStopLoss > 0) {
      pos.stopLoss = newStopLoss;
    }
    if (newTakeProfit && newTakeProfit > 0) {
      pos.tpTargets = [{ index: 1, price: newTakeProfit, rMultiple: 2, hit: false, closedQty: 0 }];
    }
    pos.updatedAt = Date.now();
    tradingStorage.updatePosition(userId, positionId, pos);

    res.json({
      success: true,
      message: 'Take Profit & Stop Loss brackets updated on exchange.',
      stopLoss: pos.stopLoss,
      tpTargets: pos.tpTargets
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Updating brackets failed' });
  }
});

// 4. Trailing Runner Toggle (Removes automated TP, lets position run with dynamic trailing SL)
tradingRouter.post('/trading/positions/:id/trailing-runner', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const positionId = req.params.id;
    const openPositions = tradingStorage.getOpenPositions(userId);
    const pos = openPositions.find(p => p.id === positionId);
    if (!pos) return res.status(404).json({ error: 'Position not found' });

    const enable = req.body.enableTrailing !== false;
    pos.trailingRunner = enable;

    const creds = tradingStorage.getDecryptedExchangeCredentials(userId);
    if (!pos.isPaper && creds && creds.exchange === 'binance' && enable) {
      // Cancel TP orders so runner doesn't get filled prematurely
      await BinanceClient.cancelAllOpenOrders(
        { apiKey: creds.apiKey, apiSecret: creds.apiSecret },
        pos.symbol
      ).catch(() => {});

      // Ensure Stop Loss order remains armed
      if (pos.stopLoss && pos.stopLoss > 0) {
        const exitSide = pos.direction === 'LONG' ? 'SELL' : 'BUY';
        const slRes = await BinanceClient.placeStopMarketOrder(
          { apiKey: creds.apiKey, apiSecret: creds.apiSecret },
          pos.symbol,
          exitSide,
          pos.stopLoss,
          pos.quantity
        ).catch(() => null);
        if (slRes) pos.slOrderId = slRes.orderId;
      }
    }

    pos.updatedAt = Date.now();
    tradingStorage.updatePosition(userId, positionId, pos);

    res.json({
      success: true,
      trailingRunner: enable,
      message: enable
        ? 'Trailing Runner activated. Fixed TP limits removed; position will ride market expansion.'
        : 'Trailing Runner deactivated.'
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Trailing runner toggle failed' });
  }
});


