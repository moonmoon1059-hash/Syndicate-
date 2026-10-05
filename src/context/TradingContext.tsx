import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  UserProfile,
  UserTradingSummary,
  Top5ActionableSignal,
  UserTradingSettings,
  TradeRejectionLog,
  SupportedExchange,
  ExecutionAuditEvent
} from '../types/trading';
import {
  loginUser as apiLogin,
  registerUser as apiRegister,
  getAuthProfile,
  logoutUser as apiLogout,
  fetchUserTradingSummary,
  updateTradingSettings as apiUpdateSettings,
  connectBinance as apiConnectBinance,
  disconnectBinance as apiDisconnectBinance,
  connectExchange as apiConnectExchange,
  disconnectExchange as apiDisconnectExchange,
  fetchTradeRejections as apiFetchTradeRejections,
  fetchExecutionAudits as apiFetchExecutionAudits,
  syncExchangePositions as apiSyncExchangePositions,
  setEmergencyStop as apiSetEmergencyStop,
  emergencyCloseAllPositions as apiEmergencyCloseAll,
  fetchTop5ActionableSignals,
  executeTrade as apiExecuteTrade,
  closePosition as apiClosePosition,
  marketClosePosition as apiMarketClosePosition,
  partialClosePosition as apiPartialClosePosition,
  updatePositionBrackets as apiUpdatePositionBrackets,
  toggleTrailingRunner as apiToggleTrailingRunner,
  fetchTradingTelemetry as apiFetchTradingTelemetry,
  fetchSymbolInfo as apiFetchSymbolInfo,
  resetPaperBalance as apiResetPaper,
  fetchPendingUsers as apiFetchPendingUsers,
  fetchAllUsers as apiFetchAllUsers,
  approveUserAccess as apiApproveUserAccess,
  revokeUserAccess as apiRevokeUserAccess
} from '../services/api';

interface TradingContextValue {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  summary: UserTradingSummary | null;
  top5Actionable: Top5ActionableSignal[];
  rejections: TradeRejectionLog[];
  executionAudits: ExecutionAuditEvent[];
  isAuthModalOpen: boolean;
  isSettingsModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSummary: () => Promise<void>;
  refreshTop5: () => Promise<void>;
  refreshRejections: () => Promise<void>;
  refreshExecutionAudits: () => Promise<void>;
  syncPositions: () => Promise<void>;
  updateSettings: (updates: Partial<UserTradingSettings>) => Promise<void>;
  connectBinance: (apiKey: string, secret: string, testnet?: boolean) => Promise<void>;
  disconnectBinance: () => Promise<void>;
  connectExchange: (params: {
    exchange: SupportedExchange;
    apiKey: string;
    apiSecret: string;
    passphrase?: string;
    accountLabel?: string;
    testnet?: boolean;
  }) => Promise<void>;
  disconnectExchange: (exchange: SupportedExchange) => Promise<void>;
  toggleEmergencyStop: (active: boolean) => Promise<void>;
  emergencyCloseAll: () => Promise<any>;
  executeTrade: (signalId: string, forceManual?: boolean, options?: { margin?: number; leverage?: number; marginType?: 'CROSS' | 'ISOLATED' }) => Promise<any>;
  closePosition: (positionId: string) => Promise<any>;
  marketClosePosition: (positionId: string) => Promise<any>;
  partialClosePosition: (positionId: string, percent: number) => Promise<any>;
  updatePositionBrackets: (positionId: string, brackets: { stopLoss?: number; takeProfit?: number }) => Promise<any>;
  toggleTrailingRunner: (positionId: string, active: boolean) => Promise<any>;
  getLiveTelemetry: () => Promise<any>;
  getSymbolInfo: (symbol: string) => Promise<any>;
  resetPaper: () => Promise<void>;
  adminGetPendingUsers: () => Promise<any[]>;
  adminGetAllUsers: () => Promise<any[]>;
  adminApproveUser: (userId: string) => Promise<any>;
  adminRevokeUser: (userId: string) => Promise<any>;
}

const TradingContext = createContext<TradingContextValue | null>(null);

const AUTH_TOKEN_KEY = 'moonscanner_auth_token';

export const TradingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(AUTH_TOKEN_KEY));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<UserTradingSummary | null>(null);
  const [top5Actionable, setTop5Actionable] = useState<Top5ActionableSignal[]>([]);
  const [rejections, setRejections] = useState<TradeRejectionLog[]>([]);
  const [executionAudits, setExecutionAudits] = useState<ExecutionAuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);

  // Initialize auth
  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      if (!token) {
        if (isMounted) setIsLoading(false);
        return;
      }
      try {
        const profile = await getAuthProfile(token);
        if (isMounted) {
          setUser(profile);
        }
      } catch (err) {
        console.warn('[TradingContext] Session expired or invalid');
        localStorage.removeItem(AUTH_TOKEN_KEY);
        if (isMounted) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    initAuth();
    return () => {
      isMounted = false;
    };
  }, [token]);

  // Fetch summary and top 5
  const refreshSummary = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchUserTradingSummary(token);
      setSummary(data);
    } catch (err) {
      console.warn('[TradingContext] refreshSummary error:', err);
    }
  }, [token]);

  const refreshTop5 = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchTop5ActionableSignals(token);
      setTop5Actionable(data);
    } catch (err) {
      console.warn('[TradingContext] refreshTop5 error:', err);
    }
  }, [token]);

  const refreshRejections = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetchTradeRejections(token);
      setRejections(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('[TradingContext] refreshRejections error:', err);
    }
  }, [token]);

  const refreshExecutionAudits = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetchExecutionAudits(token);
      setExecutionAudits(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('[TradingContext] refreshExecutionAudits error:', err);
    }
  }, [token]);

  const syncPositions = useCallback(async () => {
    if (!token) return;
    try {
      await apiSyncExchangePositions(token);
      await refreshSummary();
      await refreshExecutionAudits();
    } catch (err) {
      console.warn('[TradingContext] syncPositions error:', err);
    }
  }, [token, refreshSummary, refreshExecutionAudits]);

  // Periodic polling for active positions, telemetry, and rejection events
  useEffect(() => {
    if (!token || !user) {
      setSummary(null);
      setTop5Actionable([]);
      setRejections([]);
      setExecutionAudits([]);
      return;
    }

    refreshSummary();
    refreshTop5();
    refreshRejections();
    refreshExecutionAudits();

    const interval = setInterval(() => {
      refreshSummary();
      refreshTop5();
      refreshRejections();
      refreshExecutionAudits();
    }, 6000);

    return () => clearInterval(interval);
  }, [token, user, refreshSummary, refreshTop5, refreshRejections, refreshExecutionAudits]);

  const login = async (email: string, pass: string) => {
    const res = await apiLogin(email, pass);
    localStorage.setItem(AUTH_TOKEN_KEY, res.token);
    setToken(res.token);
    setUser(res.user);
    setIsAuthModalOpen(false);
  };

  const register = async (email: string, pass: string) => {
    const res = await apiRegister(email, pass);
    localStorage.setItem(AUTH_TOKEN_KEY, res.token);
    setToken(res.token);
    setUser(res.user);
    setIsAuthModalOpen(false);
  };

  const logout = async () => {
    if (token) {
      await apiLogout(token).catch(() => {});
    }
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setToken(null);
    setUser(null);
    setSummary(null);
    setTop5Actionable([]);
    setRejections([]);
    setExecutionAudits([]);
  };

  const updateSettings = async (updates: Partial<UserTradingSettings>) => {
    if (!token) throw new Error('Not authenticated');
    await apiUpdateSettings(token, updates);
    await refreshSummary();
  };

  const connectBinance = async (apiKey: string, secret: string, testnet: boolean = false) => {
    if (!token) throw new Error('Not authenticated');
    await apiConnectBinance(token, apiKey, secret, testnet);
    await refreshSummary();
  };

  const disconnectBinance = async () => {
    if (!token) throw new Error('Not authenticated');
    await apiDisconnectBinance(token);
    await refreshSummary();
  };

  const connectExchange = async (params: {
    exchange: SupportedExchange;
    apiKey: string;
    apiSecret: string;
    passphrase?: string;
    accountLabel?: string;
    testnet?: boolean;
  }) => {
    if (!token) throw new Error('Not authenticated');
    await apiConnectExchange(token, params);
    await refreshSummary();
  };

  const disconnectExchange = async (exchange: SupportedExchange) => {
    if (!token) throw new Error('Not authenticated');
    await apiDisconnectExchange(token, exchange);
    await refreshSummary();
  };

  const toggleEmergencyStop = async (active: boolean) => {
    if (!token) throw new Error('Not authenticated');
    await apiSetEmergencyStop(token, active);
    await refreshSummary();
  };

  const emergencyCloseAll = async () => {
    if (!token) throw new Error('Not authenticated');
    const res = await apiEmergencyCloseAll(token);
    await refreshSummary();
    return res;
  };

  const executeTrade = async (
    signalId: string,
    forceManual: boolean = false,
    options?: { margin?: number; leverage?: number; marginType?: 'CROSS' | 'ISOLATED' }
  ) => {
    if (!token) throw new Error('Not authenticated');
    const res = await apiExecuteTrade(token, signalId, forceManual, options);
    await refreshSummary();
    await refreshTop5();
    await refreshRejections();
    return res;
  };

  const closePosition = async (positionId: string) => {
    if (!token) throw new Error('Not authenticated');
    const res = await apiClosePosition(token, positionId);
    await refreshSummary();
    return res;
  };

  const marketClosePosition = async (positionId: string) => {
    if (!token) throw new Error('Not authenticated');
    const res = await apiMarketClosePosition(token, positionId);
    await refreshSummary();
    return res;
  };

  const partialClosePosition = async (positionId: string, percent: number) => {
    if (!token) throw new Error('Not authenticated');
    const res = await apiPartialClosePosition(token, positionId, percent);
    await refreshSummary();
    return res;
  };

  const updatePositionBrackets = async (positionId: string, brackets: { stopLoss?: number; takeProfit?: number }) => {
    if (!token) throw new Error('Not authenticated');
    const res = await apiUpdatePositionBrackets(token, positionId, brackets);
    await refreshSummary();
    return res;
  };

  const toggleTrailingRunner = async (positionId: string, active: boolean) => {
    if (!token) throw new Error('Not authenticated');
    const res = await apiToggleTrailingRunner(token, positionId, active);
    await refreshSummary();
    return res;
  };

  const getLiveTelemetry = async () => {
    if (!token) throw new Error('Not authenticated');
    return await apiFetchTradingTelemetry(token);
  };

  const getSymbolInfo = async (symbol: string) => {
    if (!token) throw new Error('Not authenticated');
    return await apiFetchSymbolInfo(token, symbol);
  };

  const resetPaper = async () => {
    if (!token) throw new Error('Not authenticated');
    await apiResetPaper(token);
    await refreshSummary();
  };

  const adminGetPendingUsers = async () => {
    if (!token) throw new Error('Not authenticated');
    return await apiFetchPendingUsers(token);
  };

  const adminGetAllUsers = async () => {
    if (!token) throw new Error('Not authenticated');
    return await apiFetchAllUsers(token);
  };

  const adminApproveUser = async (userId: string) => {
    if (!token) throw new Error('Not authenticated');
    const res = await apiApproveUserAccess(token, userId);
    return res;
  };

  const adminRevokeUser = async (userId: string) => {
    if (!token) throw new Error('Not authenticated');
    const res = await apiRevokeUserAccess(token, userId);
    return res;
  };

  return (
    <TradingContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        summary,
        top5Actionable,
        rejections,
        executionAudits,
        isAuthModalOpen,
        isSettingsModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        openSettingsModal: () => setIsSettingsModalOpen(true),
        closeSettingsModal: () => setIsSettingsModalOpen(false),
        login,
        register,
        logout,
        refreshSummary,
        refreshTop5,
        refreshRejections,
        refreshExecutionAudits,
        syncPositions,
        updateSettings,
        connectBinance,
        disconnectBinance,
        connectExchange,
        disconnectExchange,
        toggleEmergencyStop,
        emergencyCloseAll,
        executeTrade,
        closePosition,
        marketClosePosition,
        partialClosePosition,
        updatePositionBrackets,
        toggleTrailingRunner,
        getLiveTelemetry,
        getSymbolInfo,
        resetPaper,
        adminGetPendingUsers,
        adminGetAllUsers,
        adminApproveUser,
        adminRevokeUser
      }}
    >
      {children}
    </TradingContext.Provider>
  );
};

export const useTrading = (): TradingContextValue => {
  const ctx = useContext(TradingContext);
  if (!ctx) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return ctx;
};
