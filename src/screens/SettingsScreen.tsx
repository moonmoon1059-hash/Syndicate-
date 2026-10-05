import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  ShieldCheck,
  Globe,
  Cpu,
  Send,
  Bell,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Zap,
  Flame,
  Radio,
  ExternalLink,
  MessageSquare,
  Info,
  Crown,
  UserCheck,
  UserX,
  Users,
  Image as ImageIcon,
  Sliders,
  Key,
  Lock,
  Eye
} from 'lucide-react';
import { formatBangladeshTime } from '../utils/formatters';
import { useTrading } from '../context/TradingContext';

interface TelegramStatus {
  isConfigured: boolean;
  configured?: boolean;
  chatId?: string;
  hasToken?: boolean;
  totalAlertsDispatched?: number;
  TELEGRAM_LAST_ZERO_DISPATCH_REASON?: string;
  TELEGRAM_LAST_CHECK_TIME?: number;
  TELEGRAM_SERVER_MONITOR_ACTIVE?: boolean;
  TELEGRAM_CANDIDATE_COUNT?: number;
  TELEGRAM_ELIGIBLE_COUNT?: number;
  TELEGRAM_TOTAL_SENT?: number;
  TELEGRAM_DUPLICATE_SUPPRESSED_COUNT?: number;
  TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION?: number;
  TELEGRAM_INSTANCE_ID?: string;
  diagnostics?: any;
}

interface AlertRecord {
  id: string;
  symbol: string;
  alertType: string;
  timestamp: number;
  message: string;
  dispatchSuccess: boolean;
  error?: string;
}

export const SettingsScreen: React.FC = () => {
  const {
    user,
    summary,
    openSettingsModal,
    toggleEmergencyStop,
    adminGetPendingUsers,
    adminGetAllUsers,
    adminApproveUser,
    adminRevokeUser
  } = useTrading();

  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [alertHistory, setAlertHistory] = useState<AlertRecord[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isSendingChartTest, setIsSendingChartTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Config edit state
  const [botTokenInput, setBotTokenInput] = useState('');
  const [chatIdInput, setChatIdInput] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  // Admin user approvals state
  const [adminUsersList, setAdminUsersList] = useState<any[]>([]);
  const [adminListFilter, setAdminListFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [loadingAdminUsers, setLoadingAdminUsers] = useState(false);
  const [adminProcessingId, setAdminProcessingId] = useState<string | null>(null);
  const [adminFeedbackToast, setAdminFeedbackToast] = useState<{ text: string; success: boolean } | null>(null);

  const fetchStatusAndHistory = async () => {
    setLoadingStatus(true);
    try {
      const [resStatus, resAlerts] = await Promise.all([
        fetch('/api/telegram/status').then(r => r.json()).catch(() => null),
        fetch('/api/telegram/alerts').then(r => r.json()).catch(() => ({ alerts: [] }))
      ]);

      if (resStatus) {
        setTelegramStatus(resStatus);
        if (resStatus.chatId) setChatIdInput(resStatus.chatId);
      }
      if (resAlerts && resAlerts.alerts) {
        setAlertHistory(resAlerts.alerts);
      }
    } catch (e) {
      console.error('Failed to fetch telegram data', e);
    } finally {
      setLoadingStatus(false);
    }
  };

  const loadAdminUsersData = useCallback(async () => {
    if (user?.role !== 'ADMIN') return;
    setLoadingAdminUsers(true);
    try {
      const users = adminListFilter === 'PENDING' ? await adminGetPendingUsers() : await adminGetAllUsers();
      setAdminUsersList(users);
    } catch (err: any) {
      setAdminFeedbackToast({ text: err.message || 'Failed to fetch users', success: false });
    } finally {
      setLoadingAdminUsers(false);
    }
  }, [user?.role, adminListFilter, adminGetPendingUsers, adminGetAllUsers]);

  useEffect(() => {
    fetchStatusAndHistory();
    if (user?.role === 'ADMIN') {
      loadAdminUsersData();
    }
  }, [user?.role, loadAdminUsersData]);

  const handleSendTestAlert = async () => {
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && (data.success || data.record)) {
        setTestResult({
          success: true,
          message: data.dispatchedToTelegram
            ? '✅ Dispatched verified event alert to live Telegram channel successfully!'
            : '✅ Formatted event alert validated and logged in audit ledger. (Provide Bot Token & Chat ID below to broadcast live to Telegram).'
        });
        fetchStatusAndHistory();
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Failed to dispatch test alert.'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Network error dispatching test alert.'
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSendLiveChartTest = async () => {
    setIsSendingChartTest(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/telegram/test-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: chatIdInput || undefined,
          botToken: botTokenInput || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: `✅ Dispatched live 15M candlestick chart snapshot for ${data.symbol || 'top setup'} to Telegram with pennant trendlines & risk boxes!`
        });
        fetchStatusAndHistory();
      } else if (data.credentialsRequired) {
        setTestResult({
          success: false,
          message: '⚠️ Telegram credentials required: Please enter your Bot Token and Chat ID below to broadcast chart snapshots live.'
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Failed to dispatch live chart test.'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Network error dispatching live chart test.'
      });
    } finally {
      setIsSendingChartTest(false);
    }
  };

  const handleApproveUserAction = async (userId: string) => {
    try {
      setAdminProcessingId(userId);
      setAdminFeedbackToast(null);
      await adminApproveUser(userId);
      setAdminFeedbackToast({ text: 'User access approved successfully!', success: true });
      await loadAdminUsersData();
    } catch (err: any) {
      setAdminFeedbackToast({ text: err.message || 'Failed to approve user', success: false });
    } finally {
      setAdminProcessingId(null);
    }
  };

  const handleRevokeUserAction = async (userId: string) => {
    try {
      setAdminProcessingId(userId);
      setAdminFeedbackToast(null);
      await adminRevokeUser(userId);
      setAdminFeedbackToast({ text: 'User access revoked successfully.', success: true });
      await loadAdminUsersData();
    } catch (err: any) {
      setAdminFeedbackToast({ text: err.message || 'Failed to revoke user', success: false });
    } finally {
      setAdminProcessingId(null);
    }
  };

  const handleSaveTelegramConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigMessage(null);
    try {
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: botTokenInput || undefined,
          chatId: chatIdInput || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setConfigMessage('✅ Telegram credentials updated successfully!');
        setBotTokenInput('');
        fetchStatusAndHistory();
      } else {
        setConfigMessage(`❌ ${data.error || 'Failed to update credentials.'}`);
      }
    } catch (err: any) {
      setConfigMessage(`❌ ${err?.message || 'Network error saving credentials.'}`);
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="space-y-6 pb-24 max-w-4xl mx-auto px-2 sm:px-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-cyan-400" />
          <span>System & Trading Settings</span>
        </h1>
        <p className="text-xs text-slate-400 font-mono mt-1">
          Binance Futures AutoTrade engine, risk invariant controls & event-driven Telegram alerts
        </p>
      </div>

      {/* SECTION 0: BINANCE CONNECTION & AUTOTRADE ENGINE */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-5 relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100 font-mono">
                  Binance Futures & AutoTrade Configuration
                </h2>
                {summary?.settings?.binanceConfig?.isConfigured ? (
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    BINANCE CONNECTED
                  </span>
                ) : (
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                    BINANCE DISCONNECTED
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Automated trade execution, API credentials, leverage multiplier & position sizing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openSettingsModal}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20 transition-all flex items-center gap-1.5"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Configure Binance API & AutoTrade</span>
            </button>
          </div>
        </div>

        {/* Status & Parameter Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
            <div className="text-[10px] uppercase font-mono text-slate-400">Execution Mode</div>
            <div className="text-sm font-bold text-slate-100 font-mono flex items-center gap-1.5">
              <span>{summary?.settings?.tradingMode || 'PAPER'}</span>
              {summary?.settings?.tradingMode === 'FULL-AUTO' && (
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              )}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
            <div className="text-[10px] uppercase font-mono text-slate-400">AutoTrade Engine</div>
            <div className="text-sm font-bold font-mono">
              {summary?.settings?.autonomousTradingEnabled || summary?.settings?.autoTradingEnabled ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  ACTIVE (ON)
                </span>
              ) : (
                <span className="text-slate-500">PAUSED (OFF)</span>
              )}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
            <div className="text-[10px] uppercase font-mono text-slate-400">Leverage & Margin</div>
            <div className="text-sm font-bold text-cyan-400 font-mono">
              {summary?.settings?.leverage || summary?.settings?.maxLeverage || 10}x Cross
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
            <div className="text-[10px] uppercase font-mono text-slate-400">Max Positions</div>
            <div className="text-sm font-bold text-slate-100 font-mono">
              {summary?.settings?.maxSimultaneousTrades || 3} Concurrent
            </div>
          </div>
        </div>

        {/* Safety Invariant Notice */}
        <div className="p-3 rounded-2xl bg-slate-950/50 border border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              <strong>Platform Safety Rules:</strong> Withdrawals strictly forbidden • Enforced Cross margin mode • Automatic multi-tier take-profits.
            </span>
          </div>
          {summary?.settings?.emergencyStop && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
              EMERGENCY HALT TRIGGERED
            </span>
          )}
        </div>
      </div>

      {/* SECTION 1: TELEGRAM ALERT ENGINE (PRIMARY UPGRADE) */}
      <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-2xl space-y-5 relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100 font-mono">
                  Event-Driven Telegram Alert Engine
                </h2>
                {telegramStatus?.isConfigured ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    LIVE DISPATCH ACTIVE
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                    IDLE / LEDGER ACTIVE
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Dispatches real-time alerts strictly when market setup events trigger (NO fixed daily schedule)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={fetchStatusAndHistory}
              disabled={loadingStatus}
              className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Refresh ledger"
            >
              <RefreshCw className={`w-4 h-4 ${loadingStatus ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
            <button
              onClick={handleSendTestAlert}
              disabled={isSendingTest}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold transition-all disabled:opacity-50"
            >
              <Send className={`w-3.5 h-3.5 ${isSendingTest ? 'animate-pulse' : ''}`} />
              <span>{isSendingTest ? 'Verifying...' : 'Dispatch Test Alert'}</span>
            </button>
            <button
              onClick={handleSendLiveChartTest}
              disabled={isSendingChartTest}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-mono font-bold transition-all disabled:opacity-50"
              title="Render server-side 15M candlestick chart snapshot with trendlines & risk boxes and dispatch via sendPhoto to Telegram"
            >
              <ImageIcon className={`w-3.5 h-3.5 ${isSendingChartTest ? 'animate-spin' : ''}`} />
              <span>{isSendingChartTest ? 'Rendering Chart...' : 'Live Chart Dispatch'}</span>
            </button>
          </div>
        </div>

        {/* Test Result Toast */}
        {testResult && (
          <div className={`p-3.5 rounded-xl border text-xs font-mono leading-relaxed flex items-start gap-2 ${
            testResult.success
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
          }`}>
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>{testResult.message}</div>
          </div>
        )}

        {/* Alert Protocol Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 font-mono mb-1">
              <Zap className="w-4 h-4" />
              <span>Event-Driven Trigger</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
              Alerts only fire when an actionable setup, entry trigger, TP milestone, or invalidation actually happens.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 font-mono mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>State-Driven Lifecycle Guard</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
              Active trades tracked in real-time until exit. Zero cooldown timers; state-driven updates on TP milestones and SL invalidation.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-bold text-purple-400 font-mono mb-1">
              <Flame className="w-4 h-4" />
              <span>Major Move Detection</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
              Highlights verified ≥30% Major Moves and ≥50% Extreme Moves with structural evidence.
            </p>
          </div>
        </div>

        {/* Pipeline Diagnostics & Quality Policy Panel */}
        <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Server Dispatcher & Quality Gate Diagnostics</span>
            </span>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
              QUALITY &gt; QUANTITY
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Server Monitor</span>
              <span className="font-bold text-emerald-300 flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="w-3 h-3" />
                {telegramStatus?.TELEGRAM_SERVER_MONITOR_ACTIVE !== false ? 'ACTIVE (AUTONOMOUS)' : 'STANDBY'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Quality Threshold</span>
              <span className="font-bold text-slate-200 block mt-0.5">GRADE A / A+ ONLY</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Evaluated / Eligible</span>
              <span className="font-bold text-slate-200 block mt-0.5">
                {telegramStatus?.TELEGRAM_CANDIDATE_COUNT ?? 0} / {telegramStatus?.TELEGRAM_ELIGIBLE_COUNT ?? 0}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Low-Conviction Blocked</span>
              <span className="font-bold text-amber-300 block mt-0.5">
                {telegramStatus?.TELEGRAM_TOTAL_SUPPRESSED_LOW_CONVICTION ?? 0}
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-[11px] font-mono flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-slate-300 leading-relaxed">
              <span className="font-bold text-slate-200">Current Status / Zero-Dispatch Reason: </span>
              <span className="text-cyan-300">
                {telegramStatus?.TELEGRAM_LAST_ZERO_DISPATCH_REASON || 'System remains silent until a rare, exceptional opportunity triggers.'}
              </span>
            </div>
          </div>
        </div>

        {/* Config Form (Optional Live Bot Connection) */}
        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
              <span>Telegram Bot Credentials</span>
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              {telegramStatus?.isConfigured ? 'Connected' : 'Environment or Manual Config'}
            </span>
          </div>

          <form onSubmit={handleSaveTelegramConfig} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            <div className="sm:col-span-2">
              <input
                type="password"
                placeholder={telegramStatus?.hasToken ? '•••••••••••••••• (Configured)' : 'Bot Token (e.g. 123456:ABC...)'}
                value={botTokenInput}
                onChange={(e) => setBotTokenInput(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <input
                type="text"
                placeholder="Chat / Channel ID (e.g. @channel or -100123...)"
                value={chatIdInput}
                onChange={(e) => setChatIdInput(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={savingConfig}
              className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono font-bold transition-colors disabled:opacity-50"
            >
              {savingConfig ? 'Saving...' : 'Save Config'}
            </button>
          </form>

          {configMessage && (
            <div className="text-[11px] font-mono mt-1 text-slate-300">
              {configMessage}
            </div>
          )}
        </div>

        {/* Live Audit Ledger of Dispatched Alerts */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>Live Dispatched Alert Audit Ledger ({alertHistory.length})</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              Timestamp: BST (UTC+6)
            </span>
          </div>

          {alertHistory.length === 0 ? (
            <div className="p-6 text-center bg-slate-950/40 rounded-xl border border-slate-800/80 text-xs font-mono text-slate-500">
              No alerts dispatched yet in this engine session. Click "Dispatch Test Alert" to verify formatting.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {alertHistory.slice(0, 10).map((alert) => (
                <div
                  key={alert.id}
                  className="p-3 rounded-xl bg-slate-950/90 border border-slate-800/90 hover:border-slate-700 transition-colors text-xs font-mono space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100">{alert.symbol}</span>
                      <span className="px-2 py-0.2 rounded bg-slate-800 text-[10px] text-cyan-300 font-bold">
                        {alert.alertType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>{formatBangladeshTime(alert.timestamp)} BST</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                        alert.dispatchSuccess
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {alert.dispatchSuccess ? 'DISPATCHED' : 'LEDGER LOGGED'}
                      </span>
                    </div>
                  </div>

                  {/* Formatted Alert Preview */}
                  <pre className="text-[10px] text-slate-400 whitespace-pre-wrap bg-slate-900/60 p-2 rounded-lg border border-slate-800/60 font-mono leading-relaxed overflow-x-auto max-h-32">
                    {alert.message}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SUPER ADMIN: USER APPROVALS & ACCESS MANAGEMENT */}
      {user?.role === 'ADMIN' && (
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-purple-500/30 shadow-2xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-purple-500/10 border border-purple-500/25 text-purple-400">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-100 font-mono">
                    Super Admin User Management & Approval Control
                  </h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold">
                    MASTER ACCESS
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Approve or revoke trader access to live order execution and autonomous portfolio control
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs">
                <button
                  onClick={() => setAdminListFilter('PENDING')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    adminListFilter === 'PENDING'
                      ? 'bg-purple-500/20 text-purple-300 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Pending Approvals
                </button>
                <button
                  onClick={() => setAdminListFilter('ALL')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    adminListFilter === 'ALL'
                      ? 'bg-purple-500/20 text-purple-300 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All Accounts
                </button>
              </div>

              <button
                onClick={loadAdminUsersData}
                disabled={loadingAdminUsers}
                className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                title="Refresh user list"
              >
                <RefreshCw className={`w-4 h-4 ${loadingAdminUsers ? 'animate-spin text-purple-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Feedback Toast */}
          {adminFeedbackToast && (
            <div
              className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
                adminFeedbackToast.success
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}
            >
              <span>{adminFeedbackToast.text}</span>
              <button
                onClick={() => setAdminFeedbackToast(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                &times;
              </button>
            </div>
          )}

          {/* User List */}
          {loadingAdminUsers ? (
            <div className="py-10 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
              <span>Loading user registry accounts...</span>
            </div>
          ) : adminUsersList.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800">
              {adminListFilter === 'PENDING'
                ? 'No pending approval requests. All traders are authorized.'
                : 'No registered users found.'}
            </div>
          ) : (
            <div className="space-y-2.5">
              {adminUsersList.map((u) => (
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

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {!u.isApproved ? (
                      <button
                        onClick={() => handleApproveUserAction(u.id)}
                        disabled={adminProcessingId === u.id}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 text-slate-950 text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>{adminProcessingId === u.id ? 'Approving...' : 'Approve Trader'}</span>
                      </button>
                    ) : (
                      u.role !== 'ADMIN' && (
                        <button
                          onClick={() => handleRevokeUserAction(u.id)}
                          disabled={adminProcessingId === u.id}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>{adminProcessingId === u.id ? 'Revoking...' : 'Revoke Access'}</span>
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

      {/* SECTION 2: SYSTEM ARCHITECTURE & INTEGRITY RULES */}
      <div className="space-y-4">
        {/* Core Architecture */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>Unified Multi-Timeframe Architecture</span>
          </div>
          <div className="text-xs text-slate-400 leading-relaxed">
            Multi-timeframe algorithmic engine synthesizing EMA ribbon alignment, 14-period RSI momentum channels, ATR-based risk invalidation, real-time volume surges (RVOL), orderflow delta absorption, and derivatives metrics (Funding & OI).
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-400 pt-2 border-t border-slate-800">
            <div>Engine Version: <strong className="text-slate-200">v2.5.0-PRO</strong></div>
            <div>Time Standard: <strong className="text-slate-200">BST (UTC+6)</strong></div>
          </div>
        </div>

        {/* Invalidation Rules */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Risk Invalidation & Pre-Entry Safety</span>
          </div>
          <div className="text-xs text-slate-400 space-y-1.5 font-mono">
            <div className="flex items-center justify-between">
              <span>Pre-Entry Invariant (No premature TP/SL):</span>
              <span className="text-emerald-400 font-semibold">ENFORCED</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Canonical Target Ladder (TP1..TP7):</span>
              <span className="text-emerald-400 font-semibold">DYNAMIC ATR</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Structural Invalidation Level:</span>
              <span className="text-emerald-400 font-semibold">SWING HIGH/LOW</span>
            </div>
          </div>
        </div>

        {/* Telemetry Sources */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
            <Globe className="w-4 h-4 text-blue-400" />
            <span>Exchange & Registry Feeds</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>Primary Market Feed:</span>
            <span className="text-cyan-300">Binance Spot & Futures REST API</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>New Listing Registries:</span>
            <span className="text-cyan-300">Binance Announcements & Bybit Launchpad</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>News Catalyst Provider:</span>
            <span className="text-cyan-300">CryptoCompare Verified Headfeed</span>
          </div>
        </div>
      </div>
    </div>
  );
};
