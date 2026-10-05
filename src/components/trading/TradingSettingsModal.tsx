import React, { useState, useEffect } from 'react';
import {
  X,
  Sliders,
  Shield,
  Key,
  Flame,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Trash2,
  Globe,
  Eye,
  EyeOff,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Zap
} from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import { TradingMode, SupportedExchange } from '../../types/trading';

const SUPPORTED_EXCHANGES: Array<{ id: SupportedExchange; name: string; needsPassphrase?: boolean }> = [
  { id: 'binance', name: 'Binance Futures' },
  { id: 'bybit', name: 'Bybit V5' },
  { id: 'okx', name: 'OKX Swap', needsPassphrase: true },
  { id: 'mexc', name: 'MEXC Contract' },
  { id: 'bitget', name: 'Bitget Mix', needsPassphrase: true },
  { id: 'bitunix', name: 'Bitunix' }
];

export const TradingSettingsModal: React.FC = () => {
  const {
    isSettingsModalOpen,
    closeSettingsModal,
    summary,
    updateSettings,
    connectBinance,
    disconnectBinance,
    connectExchange,
    disconnectExchange,
    toggleEmergencyStop,
    emergencyCloseAll,
    resetPaper
  } = useTrading();

  const [activeTab, setActiveTab] = useState<'MODE' | 'RISK' | 'EXCHANGES'>('MODE');

  // Local settings state
  const [tradingMode, setTradingMode] = useState<TradingMode>('DISABLED');
  const [autonomousEnabled, setAutonomousEnabled] = useState<boolean>(false);
  const [activeExchange, setActiveExchange] = useState<SupportedExchange>('binance');
  const [selectedExchange, setSelectedExchange] = useState<SupportedExchange>('binance');
  const [capitalAllocationPct, setCapitalAllocationPct] = useState<number>(20);
  const [riskPerTradePct, setRiskPerTradePct] = useState<number>(1);
  const [maxSimultaneousTrades, setMaxSimultaneousTrades] = useState<number>(3);
  const [maxLeverage, setMaxLeverage] = useState<number>(5);
  const [leverage, setLeverage] = useState<number>(10);
  const [marginPerTrade, setMarginPerTrade] = useState<number>(50);
  const [minSignalScore, setMinSignalScore] = useState<number>(75);
  const [dailyLossLimitUsd, setDailyLossLimitUsd] = useState<number>(100);
  const [tpPartialClosePct, setTpPartialClosePct] = useState<number>(10);
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(15);
  const [confirmedRealRisk, setConfirmedRealRisk] = useState<boolean>(false);
  const [isClosingAll, setIsClosingAll] = useState<boolean>(false);

  // Exchange API form state
  const [apiKey, setApiKey] = useState<string>('');
  const [apiSecret, setApiSecret] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [showApiSecret, setShowApiSecret] = useState<boolean>(false);
  const [passphrase, setPassphrase] = useState<string>('');
  const [accountLabel, setAccountLabel] = useState<string>('');
  const [isTestnet, setIsTestnet] = useState<boolean>(false);
  const [apiStatusMsg, setApiStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [modalFeedback, setModalFeedback] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
  const [confirmCloseAllActive, setConfirmCloseAllActive] = useState<boolean>(false);
  const [confirmDisconnectActive, setConfirmDisconnectActive] = useState<boolean>(false);

  useEffect(() => {
    if (summary?.settings) {
      const s = summary.settings;
      setTradingMode(s.tradingMode);
      setAutonomousEnabled(s.autonomousTradingEnabled);
      setActiveExchange(s.activeExchange || 'binance');
      setSelectedExchange(s.activeExchange || 'binance');
      setCapitalAllocationPct(s.capitalAllocationPct);
      setRiskPerTradePct(s.riskPerTradePct);
      setMaxSimultaneousTrades(s.maxSimultaneousTrades);
      setMaxLeverage(s.maxLeverage);
      setLeverage(s.leverage || s.maxLeverage || 10);
      setMarginPerTrade(s.marginPerTrade !== undefined ? s.marginPerTrade : 50);
      setMinSignalScore(s.minSignalScore);
      setDailyLossLimitUsd(s.dailyLossLimitUsd);
      setTpPartialClosePct(s.tpPartialClosePct);
      setCooldownMinutes(s.cooldownMinutes);
      setConfirmedRealRisk(s.tradingMode === 'MANUAL' || s.tradingMode === 'SEMI-AUTO' || s.tradingMode === 'FULL-AUTO');
    }
  }, [summary]);

  if (!isSettingsModalOpen) return null;

  const handleSaveSettings = async () => {
    setModalFeedback(null);
    if ((tradingMode === 'MANUAL' || tradingMode === 'SEMI-AUTO' || tradingMode === 'FULL-AUTO') && !confirmedRealRisk) {
      setModalFeedback({ text: 'Please acknowledge and confirm the Real Trading Risk warning before activating live trading.', type: 'error' });
      return;
    }

    setIsSaving(true);
    try {
      await updateSettings({
        tradingMode,
        autonomousTradingEnabled: autonomousEnabled,
        activeExchange,
        capitalAllocationPct,
        riskPerTradePct,
        maxSimultaneousTrades,
        maxLeverage,
        leverage,
        marginPerTrade,
        minSignalScore,
        dailyLossLimitUsd,
        tpPartialClosePct,
        cooldownMinutes
      });
      closeSettingsModal();
    } catch (err: any) {
      setModalFeedback({ text: err.message || 'Failed to update settings', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEmergencyCloseAll = async () => {
    if (!confirmCloseAllActive) {
      setConfirmCloseAllActive(true);
      return;
    }

    try {
      setIsClosingAll(true);
      setModalFeedback(null);
      await emergencyCloseAll();
      setModalFeedback({ text: 'All open positions have been successfully closed.', type: 'success' });
      setConfirmCloseAllActive(false);
    } catch (err: any) {
      setModalFeedback({ text: err.message || 'Failed to close all positions', type: 'error' });
    } finally {
      setIsClosingAll(false);
    }
  };

  const handleConnectSelectedExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiStatusMsg(null);
    setIsConnecting(true);

    try {
      if (selectedExchange === 'binance') {
        await connectBinance(apiKey.trim(), apiSecret.trim(), isTestnet);
        setApiStatusMsg({ text: 'Binance Futures API credentials verified, authenticated, and securely encrypted!', type: 'success' });
      } else {
        await connectExchange({
          exchange: selectedExchange,
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim(),
          passphrase: passphrase ? passphrase.trim() : undefined,
          accountLabel: accountLabel ? accountLabel.trim() : undefined,
          testnet: isTestnet
        });
        setApiStatusMsg({ text: `${selectedExchange.toUpperCase()} credentials verified & securely encrypted!`, type: 'success' });
      }
      setApiKey('');
      setApiSecret('');
      setPassphrase('');
      setAccountLabel('');
    } catch (err: any) {
      setApiStatusMsg({ text: err.message || `Failed to connect ${selectedExchange.toUpperCase()}`, type: 'error' });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectSelectedExchange = async () => {
    if (!confirmDisconnectActive) {
      setConfirmDisconnectActive(true);
      return;
    }

    try {
      await disconnectExchange(selectedExchange);
      setConfirmDisconnectActive(false);
      setApiStatusMsg({ text: `${selectedExchange.toUpperCase()} credentials disconnected.`, type: 'success' });
    } catch (err: any) {
      setApiStatusMsg({ text: err.message || 'Failed to disconnect exchange', type: 'error' });
    }
  };

  const isEmergency = summary?.settings?.emergencyStop;
  const isSelectedConnected = Boolean(
    (selectedExchange === 'binance' && summary?.settings?.binanceConfig?.isConfigured) ||
    (summary?.settings?.exchangeConnections && summary.settings.exchangeConnections[selectedExchange]?.connectionStatus === 'CONNECTED')
  );
  const isLiveExchangeConfigured = Boolean(
    summary?.settings?.binanceConfig?.isConfigured ||
    (summary?.settings?.exchangeConnections && Object.values(summary.settings.exchangeConnections).some(c => c.connectionStatus === 'CONNECTED'))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-100">Trading System Settings</h3>
              <p className="text-xs text-slate-400">
                User-specific risk limits, execution modes, and exchange connection
              </p>
            </div>
          </div>
          <button
            onClick={closeSettingsModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex px-5 pt-3 border-b border-slate-800/60 gap-4">
          <button
            onClick={() => setActiveTab('MODE')}
            className={`pb-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'MODE'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Execution Mode
          </button>
          <button
            onClick={() => setActiveTab('RISK')}
            className={`pb-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'RISK'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Risk Engine Limits
          </button>
          <button
            onClick={() => setActiveTab('EXCHANGES')}
            className={`pb-2.5 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'EXCHANGES'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Exchanges ({activeExchange.toUpperCase()})
            {isLiveExchangeConfigured && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {modalFeedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 ${
                modalFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {modalFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                )}
                <span>{modalFeedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setModalFeedback(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* TAB 1: EXECUTION MODE */}
          {activeTab === 'MODE' && (
            <div className="space-y-4">
              {/* AUTOTRADE MASTER ENGINE CONFIGURATION */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-900/60 to-slate-950 border border-cyan-500/30 space-y-3.5 shadow-lg shadow-cyan-950/20">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Flame className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-bold text-slate-100">AutoTrade Master Engine</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          autonomousEnabled
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {autonomousEnabled ? 'ACTIVE (ON)' : 'PAUSED (OFF)'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Continuously polls MoonScanner Top 5 and auto-executes Grade A+ signals adhering to strict risk invariant rules.
                    </p>
                  </div>

                  {/* AutoTrade Master Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const nextState = !autonomousEnabled;
                      setAutonomousEnabled(nextState);
                      if (nextState && tradingMode === 'DISABLED') {
                        setTradingMode('PAPER');
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      autonomousEnabled ? 'bg-cyan-500' : 'bg-slate-800'
                    }`}
                    title={autonomousEnabled ? 'Turn AutoTrade OFF' : 'Turn AutoTrade ON'}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        autonomousEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Parameters Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2.5 border-t border-slate-800/80">
                  {/* Leverage Selector (Cross 5x, 10x, 20x) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium">Leverage</span>
                      <span className="text-cyan-400 font-bold">{leverage}x Cross</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {[5, 10, 20].map((lev) => (
                        <button
                          key={lev}
                          type="button"
                          onClick={() => {
                            setLeverage(lev);
                            if (lev > maxLeverage) setMaxLeverage(lev);
                          }}
                          className={`py-1 text-xs font-semibold rounded-lg border transition-all ${
                            leverage === lev
                              ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm'
                              : 'bg-slate-950/70 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {lev}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Margin Per Trade (USDT amount, e.g. $25, $50, $100) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium">Margin / Trade</span>
                      <span className="text-cyan-400 font-bold">${marginPerTrade} USDT</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {[25, 50, 100].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setMarginPerTrade(amt)}
                          className={`py-1 text-xs font-semibold rounded-lg border transition-all ${
                            marginPerTrade === amt
                              ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm'
                              : 'bg-slate-950/70 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          ${amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Max Simultaneous Positions Limit (1 to 5) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium">Max Positions</span>
                      <span className="text-cyan-400 font-bold">{maxSimultaneousTrades} Max</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {[1, 2, 3, 5].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setMaxSimultaneousTrades(count)}
                          className={`py-1 text-xs font-semibold rounded-lg border transition-all ${
                            maxSimultaneousTrades === count
                              ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm'
                              : 'bg-slate-950/70 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Trading Execution State
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {(['DISABLED', 'PAPER', 'MANUAL', 'SEMI-AUTO', 'FULL-AUTO'] as TradingMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTradingMode(mode)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        tradingMode === mode
                          ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-500/10'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-semibold text-xs mb-1 flex items-center justify-between">
                        {mode}
                        {tradingMode === mode && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                      </div>
                      <div className="text-[11px] leading-tight text-slate-500">
                        {mode === 'DISABLED' && 'No trading. System monitors and displays signals only.'}
                        {mode === 'PAPER' && 'Simulated orders using virtual paper balance. Zero real risk.'}
                        {mode === 'MANUAL' && 'User prepares and executes live orders manually with calculated SL/TP.'}
                        {mode === 'SEMI-AUTO' && 'Real execution requiring 1-click confirmation per trade.'}
                        {mode === 'FULL-AUTO' && 'Autonomous AI trade execution on qualified Top 5 signals.'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Strong Real Trading Warning */}
              {(tradingMode === 'MANUAL' || tradingMode === 'SEMI-AUTO' || tradingMode === 'FULL-AUTO') && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs space-y-2.5 animate-fade-in">
                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span>MANDATORY WARNING: LIVE {activeExchange.toUpperCase()} TRADING</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-200/90">
                    You are enabling live execution. Real capital will be committed on {activeExchange.toUpperCase()} Futures. Orders will be submitted in <strong>CROSS</strong> margin mode and leverage will be validated against your risk settings.
                  </p>
                  {summary?.balances?.isLiveUnavailable ? (
                    <div className="p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[11px] font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                      <span>LIVE UNAVAILABLE — EXECUTION BLOCKED: {summary.balances.liveErrorMessage || 'Live exchange connection failed. System will not switch to paper trading.'}</span>
                    </div>
                  ) : !isLiveExchangeConfigured ? (
                    <div className="p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[11px] font-medium">
                      ⚠️ No exchange credentials configured for {activeExchange.toUpperCase()}! Configure your API credentials in the Exchanges tab before real trades can execute.
                    </div>
                  ) : null}
                  <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={confirmedRealRisk}
                      onChange={(e) => setConfirmedRealRisk(e.target.checked)}
                      className="mt-0.5 rounded bg-slate-900 border-amber-500/50 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-[11px] text-amber-300 font-semibold leading-tight">
                      I understand that real trading carries financial risk, and I accept full responsibility for real-money execution.
                    </span>
                  </label>
                </div>
              )}

              {/* Autonomous Trading Switch */}
              {(tradingMode === 'FULL-AUTO' || tradingMode === 'SEMI-AUTO') && (
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-amber-400" />
                      Autonomous Execution Engine
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Continuously polls Core Intelligence Top 5 and executes when Risk Engine passes
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autonomousEnabled}
                      onChange={(e) => setAutonomousEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>
              )}

              {/* Margin Mode Verification */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Margin Mode</div>
                  <div className="text-[11px] text-slate-400">
                    Strict platform invariant: Isolated margin prohibited.
                  </div>
                </div>
                <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                  CROSS (Enforced)
                </div>
              </div>

              {/* Emergency Stop & Kill All Card */}
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      Account Emergency Kill Switch
                    </div>
                    <div className="text-[11px] text-rose-300/80">
                      Immediately halts all automated entries and active polling.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleEmergencyStop(!isEmergency)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isEmergency
                        ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30 animate-pulse'
                        : 'bg-slate-900 border border-rose-500/40 text-rose-300 hover:bg-rose-500/20'
                    }`}
                  >
                    {isEmergency ? 'EMERGENCY HALTED' : 'HALT AUTOTRADE'}
                  </button>
                </div>

                {/* Prominent Emergency Close All Action */}
                <div className="pt-2.5 border-t border-rose-500/20">
                  {!confirmCloseAllActive ? (
                    <button
                      type="button"
                      onClick={() => setConfirmCloseAllActive(true)}
                      disabled={isClosingAll}
                      className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>EMERGENCY KILL ALL / CLOSE ALL POSITIONS</span>
                      {summary?.activePositions && summary.activePositions.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-rose-900 text-[10px] font-mono">
                          {summary.activePositions.length} Open
                        </span>
                      )}
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl bg-rose-950/90 border border-rose-500/60 space-y-2 animate-fade-in">
                      <div className="text-xs text-rose-200 font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-400 animate-bounce" />
                        <span>Confirm Emergency Kill All?</span>
                      </div>
                      <p className="text-[11px] text-rose-300/90 leading-relaxed">
                        This action will immediately submit market orders to close all open positions and cancel any open TP/SL trigger orders.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleEmergencyCloseAll}
                          disabled={isClosingAll}
                          className="flex-1 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-extrabold shadow-md transition-all flex items-center justify-center gap-1.5"
                        >
                          {isClosingAll ? 'Closing All Positions...' : 'YES, FORCE CLOSE ALL NOW'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCloseAllActive(false)}
                          disabled={isClosingAll}
                          className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Reset Paper Balance */}
              <div className="pt-2 flex items-center justify-between text-xs text-slate-400">
                <span>Paper Balance: ${summary?.balances?.equity.toLocaleString() || '10,000'}</span>
                <button
                  type="button"
                  onClick={resetPaper}
                  className="flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset to $10,000
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: RISK ENGINE LIMITS */}
          {activeTab === 'RISK' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 text-[11px] text-slate-400">
                <span className="font-semibold text-slate-200">Hard Safety Guarantee: </span>
                The Risk Engine executes strict mathematical boundaries before any trade entry.
              </div>

              {/* Capital Allocation & Risk Per Trade */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-medium">Capital Allocation</span>
                    <span className="text-cyan-400 font-semibold">{capitalAllocationPct}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={capitalAllocationPct}
                    onChange={(e) => setCapitalAllocationPct(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                  <div className="text-[10px] text-slate-500">Max margin per position (% equity)</div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-medium">Fixed Margin Per Trade</span>
                    <span className="text-cyan-400 font-semibold">${marginPerTrade} USDT</span>
                  </div>
                  <input
                    type="number"
                    min="5"
                    max="5000"
                    step="5"
                    value={marginPerTrade}
                    onChange={(e) => setMarginPerTrade(Math.max(5, Number(e.target.value)))}
                    className="w-full px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <div className="text-[10px] text-slate-500 mt-1">Direct margin used for each trade entry</div>
                </div>
              </div>

              {/* Leverage & Max Simultaneous */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-medium">Target Leverage</span>
                    <span className="text-cyan-400 font-semibold">{leverage}x</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="1"
                    value={leverage}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setLeverage(val);
                      if (val > maxLeverage) setMaxLeverage(val);
                    }}
                    className="w-full accent-cyan-500"
                  />
                  <div className="text-[10px] text-slate-500">Cross leverage applied on exchange</div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-medium">Simultaneous Trades</span>
                    <span className="text-cyan-400 font-semibold">{maxSimultaneousTrades}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={maxSimultaneousTrades}
                    onChange={(e) => setMaxSimultaneousTrades(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                  <div className="text-[10px] text-slate-500">Max open positions allowed</div>
                </div>
              </div>

              {/* Daily Loss Limit & Cooldown */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Daily Loss Limit ($)
                  </label>
                  <input
                    type="number"
                    min="10"
                    step="10"
                    value={dailyLossLimitUsd}
                    onChange={(e) => setDailyLossLimitUsd(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                  <div className="text-[10px] text-slate-500 mt-1">Trading halts if exceeded</div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Asset Cooldown (Min)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    step="5"
                    value={cooldownMinutes}
                    onChange={(e) => setCooldownMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                  <div className="text-[10px] text-slate-500 mt-1">Prevent rapid re-entry</div>
                </div>
              </div>

              {/* TP Progression & Min MoonScore */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-medium">TP Partial Close</span>
                    <span className="text-cyan-400 font-semibold">{tpPartialClosePct}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={tpPartialClosePct}
                    onChange={(e) => setTpPartialClosePct(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                  <div className="text-[10px] text-slate-500">Secured at each TP step</div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-medium">Min MoonScore</span>
                    <span className="text-cyan-400 font-semibold">{minSignalScore}</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="95"
                    step="1"
                    value={minSignalScore}
                    onChange={(e) => setMinSignalScore(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                  <div className="text-[10px] text-slate-500">Quality score cutoff</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: EXCHANGES CONNECTION */}
          {activeTab === 'EXCHANGES' && (
            <div className="space-y-4">
              {/* Active Exchange Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Select Active Exchange
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {SUPPORTED_EXCHANGES.map((ex) => {
                    const isExConnected = Boolean(
                      (ex.id === 'binance' && summary?.settings?.binanceConfig?.isConfigured) ||
                      (summary?.settings?.exchangeConnections && summary.settings.exchangeConnections[ex.id]?.connectionStatus === 'CONNECTED')
                    );
                    const isExActive = activeExchange === ex.id;
                    const isExSelected = selectedExchange === ex.id;

                    return (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => setSelectedExchange(ex.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isExSelected
                            ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-slate-200">{ex.name}</span>
                          {isExActive && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                          <span className={`w-1.5 h-1.5 rounded-full ${isExConnected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                          <span className={isExConnected ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                            {isExConnected ? 'Connected' : 'Not Connected'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Set selected as Active Exchange Button if different */}
              {selectedExchange !== activeExchange && (
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <div className="text-xs text-slate-300">
                    Use <strong className="text-cyan-400">{selectedExchange.toUpperCase()}</strong> for live execution?
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveExchange(selectedExchange)}
                    className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold rounded-lg transition-colors"
                  >
                    Set as Active
                  </button>
                </div>
              )}

              {/* Status Header for selected exchange */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-lg ${isSelectedConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200">
                      {selectedExchange.toUpperCase()} Account {isSelectedConnected ? 'Connected' : 'Disconnected'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {isSelectedConnected
                        ? `Credentials active • Masked key encrypted server-side`
                        : `Connect your personal ${selectedExchange.toUpperCase()} API credentials`}
                    </div>
                  </div>
                </div>

                {isSelectedConnected && (
                  <button
                    type="button"
                    onClick={handleDisconnectSelectedExchange}
                    className={`px-2 py-1 text-xs rounded-lg transition-colors flex items-center gap-1 ${
                      confirmDisconnectActive
                        ? 'bg-rose-600 text-white font-semibold'
                        : 'text-rose-400 hover:bg-rose-500/10'
                    }`}
                    title={`Disconnect ${selectedExchange.toUpperCase()}`}
                  >
                    <Trash2 className="w-4 h-4" />
                    {confirmDisconnectActive && <span>Confirm?</span>}
                  </button>
                )}
              </div>

              {/* Clear Badge: Futures Trading Only — Withdrawals Strictly Forbidden */}
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
                <div className="leading-snug">
                  <div className="font-bold text-amber-300">Futures Trading Only — Withdrawals Strictly Forbidden</div>
                  <div className="text-[11px] text-amber-200/80 mt-0.5">
                    Enable only <strong>Reading</strong> and <strong>Futures Trading</strong> permissions in your Binance API settings. Withdrawals must remain disabled.
                  </div>
                </div>
              </div>

              {apiStatusMsg && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    apiStatusMsg.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  {apiStatusMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{apiStatusMsg.text}</span>
                </div>
              )}

              {/* Form to connect selected exchange */}
              <form onSubmit={handleConnectSelectedExchange} className="space-y-3 pt-1">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-300">
                      {selectedExchange.toUpperCase()} Futures API Key
                    </label>
                    <span className="text-[10px] text-slate-500">Cross Margin Enforced</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      required
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={`Enter your ${selectedExchange.toUpperCase()} API key`}
                      className="w-full pl-3 pr-10 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors focus:outline-none"
                      title={showApiKey ? 'Mask API Key' : 'Reveal API Key'}
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-300">
                      {selectedExchange.toUpperCase()} Futures API Secret
                    </label>
                    <span className="text-[10px] text-slate-500">AES-256 Encrypted</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showApiSecret ? 'text' : 'password'}
                      required
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder={`Enter your ${selectedExchange.toUpperCase()} API secret`}
                      className="w-full pl-3 pr-10 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiSecret(!showApiSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors focus:outline-none"
                      title={showApiSecret ? 'Mask API Secret' : 'Reveal API Secret'}
                    >
                      {showApiSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Passphrase for OKX and Bitget */}
                {(selectedExchange === 'okx' || selectedExchange === 'bitget') && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      API Passphrase (Required for {selectedExchange.toUpperCase()})
                    </label>
                    <input
                      type="password"
                      required
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder={`Enter your ${selectedExchange.toUpperCase()} passphrase`}
                      className="w-full px-3 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="testnet-check"
                    checked={isTestnet}
                    onChange={(e) => setIsTestnet(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-cyan-500"
                  />
                  <label htmlFor="testnet-check" className="text-xs text-slate-300 cursor-pointer">
                    Use {selectedExchange.toUpperCase()} Testnet / Demo Environment
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isConnecting}
                  className="w-full py-2.5 px-4 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
                >
                  {isConnecting ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Testing & Authenticating {selectedExchange.toUpperCase()} Connection...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Test & Connect {selectedExchange.toUpperCase()} Futures</span>
                    </>
                  )}
                </button>
              </form>

              <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/60 space-y-1 text-[11px] text-slate-400">
                <div className="font-semibold text-slate-300">Security Invariants:</div>
                <div>• Zero plaintext storage: encrypted with AES-256-GCM server-side.</div>
                <div>• Never exposed to frontend code or client storage.</div>
                <div>• Permissions: Read & Futures/Swap Trading only. Withdrawals strictly prohibited.</div>
                <div>• Enforced CROSS margin mode on all live executions.</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/80 flex items-center justify-between bg-slate-950/60">
          <button
            type="button"
            onClick={closeSettingsModal}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveSettings}
            className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-1.5"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};
