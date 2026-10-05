import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Sliders,
  AlertTriangle,
  LogIn,
  LogOut,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Target,
  RefreshCw,
  FileText,
  UserCheck,
  UserX,
  Users,
  Crown
} from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { Top5ActionableSignal, UserPosition } from '../../types/trading';

export const CompactTradingSection: React.FC = () => {
  const {
    user,
    isAuthenticated,
    summary,
    top5Actionable,
    rejections,
    executionAudits,
    openAuthModal,
    openSettingsModal,
    logout,
    toggleEmergencyStop,
    executeTrade,
    closePosition,
    syncPositions,
    adminGetPendingUsers,
    adminGetAllUsers,
    adminApproveUser,
    adminRevokeUser
  } = useTrading();

  const [activeTab, setActiveTab] = useState<'POSITIONS' | 'TOP5' | 'HISTORY' | 'REJECTIONS' | 'AUDIT' | 'ADMIN'>('POSITIONS');
  const [executingSignalId, setExecutingSignalId] = useState<string | null>(null);
  const [closingPosId, setClosingPosId] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [confirmClosePosId, setConfirmClosePosId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Admin user management state
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminFilter, setAdminFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [isLoadingAdmin, setIsLoadingAdmin] = useState<boolean>(false);
  const [adminActionId, setAdminActionId] = useState<string | null>(null);
  const [adminFeedback, setAdminFeedback] = useState<{ text: string; success: boolean } | null>(null);

  const loadAdminUsers = useCallback(async () => {
    if (user?.role !== 'ADMIN') return;
    setIsLoadingAdmin(true);
    setAdminFeedback(null);
    try {
      const users = adminFilter === 'PENDING' ? await adminGetPendingUsers() : await adminGetAllUsers();
      setAdminUsers(users);
    } catch (err: any) {
      setAdminFeedback({ text: err.message || 'Failed to fetch admin users', success: false });
    } finally {
      setIsLoadingAdmin(false);
    }
  }, [user?.role, adminFilter, adminGetPendingUsers, adminGetAllUsers]);

  useEffect(() => {
    if (user?.role === 'ADMIN' && activeTab === 'ADMIN') {
      loadAdminUsers();
    }
  }, [user?.role, activeTab, loadAdminUsers]);

  const handleApprove = async (userId: string) => {
    try {
      setAdminActionId(userId);
      setAdminFeedback(null);
      await adminApproveUser(userId);
      setAdminFeedback({ text: 'User access approved successfully!', success: true });
      await loadAdminUsers();
    } catch (err: any) {
      setAdminFeedback({ text: err.message || 'Failed to approve user', success: false });
    } finally {
      setAdminActionId(null);
    }
  };

  const handleRevoke = async (userId: string) => {
    try {
      setAdminActionId(userId);
      setAdminFeedback(null);
      await adminRevokeUser(userId);
      setAdminFeedback({ text: 'User access revoked successfully.', success: true });
      await loadAdminUsers();
    } catch (err: any) {
      setAdminFeedback({ text: err.message || 'Failed to revoke user', success: false });
    } finally {
      setAdminActionId(null);
    }
  };

  const handleSyncExchange = async () => {
    try {
      setIsSyncing(true);
      setInlineError(null);
      await syncPositions();
    } catch (err: any) {
      setInlineError(err.message || 'Failed to sync positions with exchange.');
    } finally {
      setIsSyncing(false);
    }
  };

  // If not logged in, show compact prompt card
  if (!isAuthenticated || !user) {
    return (
      <div className="w-full bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-lg backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-semibold text-slate-100">
                  MoonScanner Multi-User Trading System
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Separate Layer
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Isolated accounts, personal Binance API integration, CROSS margin enforcement & progressive TP1-TP10 management.
              </p>
            </div>
          </div>

          <button
            onClick={openAuthModal}
            className="w-full sm:w-auto px-4 py-2 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 text-xs font-semibold rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <LogIn className="w-4 h-4" />
            Sign In / Register Account
          </button>
        </div>
      </div>
    );
  }

  const s = summary?.settings;
  const b = summary?.balances;
  const stats = summary?.stats;
  const isEmergency = s?.emergencyStop;
  const isBinanceConnected = s?.binanceConfig?.isConfigured;

  const handleExecute = async (signal: Top5ActionableSignal) => {
    try {
      setInlineError(null);
      setExecutingSignalId(signal.signalId);
      await executeTrade(signal.signalId, true);
    } catch (err: any) {
      setInlineError(err.message || 'Execution failed');
    } finally {
      setExecutingSignalId(null);
    }
  };

  const handleClosePos = async (pos: UserPosition) => {
    if (confirmClosePosId !== pos.id) {
      setConfirmClosePosId(pos.id);
      return;
    }

    try {
      setInlineError(null);
      setClosingPosId(pos.id);
      await closePosition(pos.id);
      setConfirmClosePosId(null);
    } catch (err: any) {
      setInlineError(err.message || 'Close position failed');
    } finally {
      setClosingPosId(null);
    }
  };

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-xl backdrop-blur-sm overflow-hidden">
      {/* Top Header Bar */}
      <div className="p-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 bg-slate-950/40">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-semibold text-slate-200">
            {user.email}
          </span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">•</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Super Admin badge */}
            {user.role === 'ADMIN' && (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                <Crown className="w-3 h-3 text-purple-400" />
                SUPER ADMIN
              </span>
            )}

            {/* Approval badge */}
            {user.isApproved ? (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                APPROVED TRADER
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 animate-pulse">
                <Clock className="w-3 h-3 text-amber-400" />
                PENDING APPROVAL
              </span>
            )}

            {/* Mode badge */}
            <span
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                s?.tradingMode === 'FULL-AUTO'
                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                  : s?.tradingMode === 'SEMI-AUTO'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : s?.tradingMode === 'MANUAL'
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  : s?.tradingMode === 'PAPER'
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              MODE: {s?.tradingMode || 'DISABLED'}
            </span>

            {/* Active Exchange / Live status badge */}
            {b?.isLiveUnavailable ? (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                LIVE UNAVAILABLE: BLOCKED
              </span>
            ) : isBinanceConnected ? (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                {(s?.activeExchange || 'binance').toUpperCase()}: LIVE CONNECTED
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-slate-800/80 text-slate-400 border border-slate-700">
                PAPER TRADING (VIRTUAL)
              </span>
            )}

            {/* Margin Type */}
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hidden md:inline">
              MARGIN: CROSS
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Emergency Stop Toggle */}
          <button
            onClick={() => toggleEmergencyStop(!isEmergency)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
              isEmergency
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 animate-pulse'
                : 'bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {isEmergency ? 'EMERGENCY STOPPED' : 'EMERGENCY STOP'}
          </button>

          {/* Settings button */}
          <button
            onClick={openSettingsModal}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-cyan-400 hover:bg-slate-700 transition-colors"
            title="Trading Settings"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-800/50">
        <div className="p-3.5 bg-slate-900">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Account Equity</span>
            <span className="text-[10px] text-slate-500">{b?.isPaper ? 'Virtual' : 'Live'}</span>
          </div>
          <div className="text-sm sm:text-base font-bold text-slate-100 mt-1">
            ${b?.equity?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Avail: ${b?.available?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
        </div>

        <div className="p-3.5 bg-slate-900">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Today's Realized PnL</span>
            <Activity className="w-3 h-3 text-slate-500" />
          </div>
          <div
            className={`text-sm sm:text-base font-bold mt-1 flex items-center gap-1 ${
              (stats?.todayRealizedPnL || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {(stats?.todayRealizedPnL || 0) >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            {(stats?.todayRealizedPnL || 0) >= 0 ? '+' : ''}
            ${stats?.todayRealizedPnL?.toFixed(2) || '0.00'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Unrealized: {b?.unrealizedPnL && b.unrealizedPnL >= 0 ? '+' : ''}${b?.unrealizedPnL?.toFixed(2) || '0.00'}
          </div>
        </div>

        <div className="p-3.5 bg-slate-900">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Active Positions</span>
            <Layers className="w-3 h-3 text-slate-500" />
          </div>
          <div className="text-sm sm:text-base font-bold text-slate-100 mt-1">
            {stats?.activePositionsCount || 0} / {s?.maxSimultaneousTrades || 3}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Cap: {s?.capitalAllocationPct}% • Risk: {s?.riskPerTradePct}%
          </div>
        </div>

        <div className="p-3.5 bg-slate-900">
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Daily Loss Limit</span>
            <Shield className="w-3 h-3 text-slate-500" />
          </div>
          <div className="text-sm sm:text-base font-bold text-slate-100 mt-1">
            ${stats?.dailyLossRemaining?.toFixed(0) || '100'} Left
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Max: ${s?.dailyLossLimitUsd || 100} • Win Rate: {stats?.winRatePct || 0}%
          </div>
        </div>
      </div>

      {/* Live Exchange Unavailable Safety Halt Banner */}
      {b?.isLiveUnavailable && (
        <div className="mx-4 mt-3 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-3 shadow-lg shadow-amber-500/5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
            <div>
              <div className="font-bold text-amber-300 text-xs">
                LIVE UNAVAILABLE — EXECUTION BLOCKED
              </div>
              <div className="text-[11px] text-amber-200/90 mt-0.5">
                {b.liveErrorMessage || 'Live exchange connection failed or API is unreachable. System refuses silent fallback to Paper Trading to protect live accounts.'}
              </div>
            </div>
          </div>
          <button
            onClick={openSettingsModal}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-semibold whitespace-nowrap"
          >
            Check API
          </button>
        </div>
      )}

      {/* User Approval Gating Warning Banner */}
      {!user.isApproved && (
        <div className="mx-4 mt-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3 shadow-lg shadow-amber-500/5">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
          <div>
            <div className="font-bold text-amber-300 flex items-center gap-2">
              <span>AWAITING SUPER ADMIN APPROVAL</span>
              <span className="text-[10px] px-2 py-0.2 rounded bg-amber-500/20 text-amber-200 font-mono font-normal">EXECUTION GATED</span>
            </div>
            <div className="text-[11px] text-amber-200/90 mt-1 leading-relaxed">
              Your registration has been logged. Autonomous trade execution and exchange order placement require authorization by the Super Admin (<span className="text-amber-100 font-mono font-semibold">sabbirmoon969@gmail.com</span>). Terminal scanning, pre-move tracking, and paper trading remain fully accessible.
            </div>
          </div>
        </div>
      )}

      {/* Inline Notification Banner */}
      {inlineError && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{inlineError}</span>
          </div>
          <button
            onClick={() => setInlineError(null)}
            className="text-slate-400 hover:text-slate-200"
          >
            &times;
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800/80 px-4 pt-2 gap-4 bg-slate-950/20 overflow-x-auto">
        <button
          onClick={() => setActiveTab('POSITIONS')}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'POSITIONS'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Active Positions</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
            {summary?.activePositions?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('TOP5')}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'TOP5'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Top 5 Actionable Setups</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-500/20 text-cyan-400 font-bold">
            {top5Actionable.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'HISTORY'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Recent Trades</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
            {summary?.recentTrades?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('REJECTIONS')}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'REJECTIONS'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Safety Rejections</span>
          {rejections.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-semibold">
              {rejections.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('AUDIT')}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'AUDIT'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Execution Audit Log</span>
          {executionAudits.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 font-semibold">
              {executionAudits.length}
            </span>
          )}
        </button>

        {user.role === 'ADMIN' && (
          <button
            onClick={() => setActiveTab('ADMIN')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'ADMIN'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-purple-400" />
            <span>Admin Approvals</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/20 text-purple-300 font-bold">
              SUPER ADMIN
            </span>
          </button>
        )}
      </div>

      {/* Tab Contents */}
      <div className="p-4">
        {/* TAB 1: ACTIVE POSITIONS */}
        {activeTab === 'POSITIONS' && (
          <div>
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs text-slate-400">
                Live and paper positions managed with structural trailing stops and dynamic targets.
              </span>
              <button
                onClick={handleSyncExchange}
                disabled={isSyncing}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 text-xs font-medium rounded-lg border border-slate-700/80 transition-all flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                title="Synchronize open positions with real exchange"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Exchange'}</span>
              </button>
            </div>
            {!summary?.activePositions || summary.activePositions.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No active positions open. Execute qualified Top 5 setups below or enable Autonomous Trading.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4.5">
                {summary.activePositions.map((pos) => {
                  const isLong = pos.direction === 'LONG';
                  const isProfit = pos.unrealizedPnL >= 0;

                  return (
                    <div
                      key={pos.id}
                      className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700/80 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg font-bold text-xs flex items-center gap-1 ${
                            isLong
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {isLong ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          {pos.direction}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-100">{pos.symbol}</span>
                            <span className="text-[11px] text-slate-400">
                              {pos.leverage}x CROSS
                            </span>
                            {pos.isPaper && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                Paper
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                            <span>Entry: ${pos.entryPrice}</span>
                            <span>Mark: ${pos.currentPrice}</span>
                            <span className="text-amber-400 font-medium">SL: ${pos.stopLoss}</span>
                          </div>
                        </div>
                      </div>

                      {/* Progressive TP Status */}
                      <div className="flex flex-col md:items-center">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Target className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="text-slate-300 font-medium">
                            {pos.currentTpStep > 0
                              ? `TP${pos.currentTpStep} Reached • SL Protected`
                              : 'Original SL Active'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Secured PnL: +${pos.realizedPnL.toFixed(2)}
                        </div>
                      </div>

                      {/* PnL & Close */}
                      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                        <div className="text-right">
                          <div
                            className={`text-sm font-bold flex items-center justify-end gap-1 ${
                              isProfit ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isProfit ? '+' : ''}${pos.unrealizedPnL.toFixed(2)}
                            <span className="text-xs">
                              ({isProfit ? '+' : ''}{pos.unrealizedPnLPct.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Margin: ${pos.marginUsd.toFixed(1)}
                          </div>
                        </div>

                        <button
                          onClick={() => handleClosePos(pos)}
                          disabled={closingPosId === pos.id}
                          className={`px-3 py-1.5 border text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                            confirmClosePosId === pos.id
                              ? 'bg-rose-700 border-rose-500 text-white animate-pulse'
                              : 'bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 border-slate-700 text-slate-300'
                          }`}
                        >
                          {closingPosId === pos.id
                            ? 'Closing...'
                            : confirmClosePosId === pos.id
                            ? 'Confirm Close?'
                            : 'Close'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TOP 5 ACTIONABLE SETUPS */}
        {activeTab === 'TOP5' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div className="text-xs text-slate-400 flex items-center justify-between pb-1">
              <span>
                Existing MoonScanner Core Intelligence Top 5 ranked signals evaluated by your isolated Risk Engine.
              </span>
            </div>

            {top5Actionable.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                Scanning market for qualified Top 5 opportunities...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4.5">
                {top5Actionable.map((sig) => {
                  const ev = sig.evaluation;
                  const canTrade = ev.canExecute;
                  const isLong = sig.direction === 'LONG';

                  return (
                    <div
                      key={sig.signalId}
                      className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700/80 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg font-bold text-xs flex items-center gap-1 ${
                            isLong
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {isLong ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          {sig.direction}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-100">{sig.symbol}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                              MoonScore {sig.moonScore}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                              {sig.pattern}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                            <span>Entry: ${sig.entryPrice}</span>
                            <span>SL: ${sig.stopLoss}</span>
                            <span>TP1: ${sig.targets[0]?.price || 'N/A'}</span>
                            <span>TP2: ${sig.targets[1]?.price || 'N/A'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Sizing & Status */}
                      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                        {ev.calculatedSize ? (
                          <div className="text-right hidden sm:block">
                            <div className="text-xs font-semibold text-slate-200">
                              ${ev.calculatedSize.notionalUsd} ({ev.calculatedSize.leverage}x)
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Margin: ${ev.calculatedSize.marginUsd} • Risk: ${ev.calculatedSize.riskUsd}
                            </div>
                          </div>
                        ) : null}

                        {/* Execute Button */}
                        <div className="flex items-center gap-2">
                          {canTrade ? (
                            <button
                              onClick={() => handleExecute(sig)}
                              disabled={executingSignalId === sig.signalId}
                              className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-1.5 whitespace-nowrap"
                            >
                              {executingSignalId === sig.signalId ? (
                                'Executing...'
                              ) : (
                                <>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Execute Setup
                                </>
                              )}
                            </button>
                          ) : (
                            <div
                              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-800/80 text-slate-400 border border-slate-700/60 max-w-[180px] text-center truncate"
                              title={ev.rejectionReason}
                            >
                              {ev.actionType === 'ALREADY_IN_POSITION'
                                ? 'Position Open'
                                : ev.actionType === 'BLOCKED_BY_RISK'
                                ? 'Blocked by Risk'
                                : 'Disabled'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: RECENT TRADES */}
        {activeTab === 'HISTORY' && (
          <div>
            {!summary?.recentTrades || summary.recentTrades.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No past trades recorded yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {summary.recentTrades.map((t) => {
                  const isWon = t.realizedPnL > 0;
                  return (
                    <div
                      key={t.id}
                      className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                            t.direction === 'LONG'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {t.direction}
                        </span>
                        <span className="font-semibold text-slate-200">{t.symbol}</span>
                        <span className="text-[11px] text-slate-500">{t.exitReason}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div
                            className={`font-bold ${
                              isWon ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isWon ? '+' : ''}${t.realizedPnL.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(t.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* TAB 4: REJECTIONS / SAFETY GUARDS */}
        {activeTab === 'REJECTIONS' && (
          <div>
            {rejections.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No safety rejections recorded. All pre-flight checks and risk engine rules are healthy.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {rejections.map((rej) => (
                  <div
                    key={rej.id}
                    className="p-3 rounded-xl bg-slate-950/60 border border-amber-500/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          {rej.rejectionCode}
                        </span>
                        <span className="font-semibold text-slate-200">{rej.symbol}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {rej.reason}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono self-start sm:self-auto whitespace-nowrap">
                      {new Date(rej.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: EXECUTION AUDIT LOG */}
        {activeTab === 'AUDIT' && (
          <div>
            {executionAudits.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No execution audit logs recorded yet. Every order placement, SL/TP modification, safety rejection, and emergency action is permanently recorded here.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {executionAudits.map((audit) => {
                  const isSuccess = audit.executionStatus === 'CONFIRMED' || audit.executionStatus === 'SUBMITTED';
                  const isRejected = audit.executionStatus === 'REJECTED';
                  const isFailed = audit.executionStatus === 'FAILED' || audit.executionStatus === 'EMERGENCY_LIQUIDATED';

                  return (
                    <div
                      key={audit.id}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700/80 transition-all"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isSuccess
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : isRejected
                                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                                : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {audit.executionStatus.replace('_', ' ')}
                          </span>

                          <span className="font-semibold text-slate-200">{audit.symbol}</span>

                          {audit.direction && (
                            <span
                              className={`px-1 py-0.2 rounded text-[10px] font-bold ${
                                audit.direction === 'LONG'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-rose-500/10 text-rose-400'
                              }`}
                            >
                              {audit.direction}
                            </span>
                          )}

                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            {audit.exchange?.toUpperCase() || 'EXCHANGE'}
                            {audit.leverage ? ` • ${audit.leverage}x` : ''}
                          </span>

                          {audit.orderId && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              OID: #{audit.orderId.slice(-8)}
                            </span>
                          )}
                        </div>

                        {audit.rejectionReason && (
                          <div className="text-[11px] text-rose-400/90 font-medium">
                            Reason: {audit.rejectionReason}
                          </div>
                        )}

                        {audit.entryPrice > 0 && (
                          <div className="text-[11px] text-slate-400 flex items-center gap-3">
                            <span>Entry: ${audit.entryPrice}</span>
                            {audit.quantity > 0 && <span>Qty: {audit.quantity}</span>}
                            {audit.stopLoss > 0 && <span className="text-rose-400">SL: ${audit.stopLoss}</span>}
                          </div>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-500 font-mono whitespace-nowrap self-start sm:self-auto">
                        {new Date(audit.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: ADMIN APPROVALS & USER ACCESS */}
        {activeTab === 'ADMIN' && user.role === 'ADMIN' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* Header & Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                    <Crown className="w-4 h-4 text-purple-400" />
                    <span>Super Admin Access & Approval Gateway</span>
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    MASTER CONTROL
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Approve or revoke trader access to autonomous execution and real-money Binance order placement.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs">
                  <button
                    onClick={() => setAdminFilter('PENDING')}
                    className={`px-3 py-1 rounded-md transition-colors ${
                      adminFilter === 'PENDING'
                        ? 'bg-purple-500/20 text-purple-300 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Pending Queue
                  </button>
                  <button
                    onClick={() => setAdminFilter('ALL')}
                    className={`px-3 py-1 rounded-md transition-colors ${
                      adminFilter === 'ALL'
                        ? 'bg-purple-500/20 text-purple-300 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All Accounts
                  </button>
                </div>

                <button
                  onClick={loadAdminUsers}
                  disabled={isLoadingAdmin}
                  className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                  title="Refresh users"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAdmin ? 'animate-spin text-cyan-400' : ''}`} />
                </button>
              </div>
            </div>

            {/* Admin Feedback Toast */}
            {adminFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
                  adminFeedback.success
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                }`}
              >
                <span>{adminFeedback.text}</span>
                <button
                  onClick={() => setAdminFeedback(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  &times;
                </button>
              </div>
            )}

            {/* Users List */}
            {isLoadingAdmin ? (
              <div className="py-12 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                <span>Loading registration accounts...</span>
              </div>
            ) : adminUsers.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800">
                {adminFilter === 'PENDING'
                  ? 'No accounts currently awaiting approval. All registrations are processed.'
                  : 'No user accounts found in registry.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4.5">
                {adminUsers.map((u) => (
                  <div
                    key={u.id}
                    className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-100 text-sm">{u.email}</span>

                        {u.role === 'ADMIN' ? (
                          <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            SUPER ADMIN
                          </span>
                        ) : (
                          <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                            TRADER
                          </span>
                        )}

                        {u.isApproved ? (
                          <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            APPROVED
                          </span>
                        ) : (
                          <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                            PENDING APPROVAL
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-3">
                        <span>ID: <code className="font-mono text-slate-300">{u.id.slice(0, 8)}...</code></span>
                        {u.telegramUsername && (
                          <span className="text-cyan-400">Telegram: @{u.telegramUsername}</span>
                        )}
                        <span>Registered: {new Date(u.createdAt).toLocaleDateString()} {new Date(u.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {!u.isApproved ? (
                        <button
                          onClick={() => handleApprove(u.id)}
                          disabled={adminActionId === u.id}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 text-slate-950 text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>{adminActionId === u.id ? 'Approving...' : 'Approve Trader'}</span>
                        </button>
                      ) : (
                        u.role !== 'ADMIN' && (
                          <button
                            onClick={() => handleRevoke(u.id)}
                            disabled={adminActionId === u.id}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>{adminActionId === u.id ? 'Revoking...' : 'Revoke Access'}</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
