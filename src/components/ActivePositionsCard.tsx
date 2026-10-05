import React, { useState } from 'react';
import {
  Shield,
  AlertOctagon,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Target,
  XCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Sliders,
  Percent,
  Zap,
  Edit3,
  Check,
  X,
  Compass
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { UserPosition } from '../types/trading';

interface Props {
  className?: string;
}

const formatPrice = (p: number | undefined | null): string => {
  if (p === undefined || p === null || isNaN(p)) return '0.00';
  if (p < 0.0001) return p.toFixed(8);
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  return p.toFixed(2);
};

export const ActivePositionsCard: React.FC<Props> = ({ className = '' }) => {
  const {
    summary,
    closePosition,
    marketClosePosition,
    partialClosePosition,
    updatePositionBrackets,
    toggleTrailingRunner,
    emergencyCloseAll,
    syncPositions,
    isAuthenticated,
    openAuthModal,
    user
  } = useTrading();

  const [closingId, setClosingId] = useState<string | null>(null);
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const [isEmergencyClosing, setIsEmergencyClosing] = useState<boolean>(false);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ text: string; success: boolean } | null>(null);

  // Manual Position Management State
  const [editingBracketsId, setEditingBracketsId] = useState<string | null>(null);
  const [editSlInput, setEditSlInput] = useState<string>('');
  const [editTpInput, setEditTpInput] = useState<string>('');
  const [isSavingBrackets, setIsSavingBrackets] = useState<boolean>(false);
  const [partialClosingId, setPartialClosingId] = useState<string | null>(null);
  const [trailingTogglingId, setTrailingTogglingId] = useState<string | null>(null);

  const positions: UserPosition[] = summary?.activePositions || [];
  const maxSimultaneous = summary?.settings?.maxSimultaneousTrades || 3;

  // Calculate total unrealized PnL
  const totalUnrealizedPnL = positions.reduce((acc, p) => acc + (p.unrealizedPnL || 0), 0);
  const totalMargin = positions.reduce((acc, p) => acc + (p.marginUsd || 0), 0);
  const totalPnLPct = totalMargin > 0 ? (totalUnrealizedPnL / totalMargin) * 100 : 0;

  const handleClose = async (positionId: string) => {
    try {
      setClosingId(positionId);
      setFeedback(null);
      await marketClosePosition(positionId);
      setConfirmCloseId(null);
      setFeedback({ text: 'Position successfully closed at market price.', success: true });
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to close position', success: false });
    } finally {
      setClosingId(null);
    }
  };

  const handlePartialClose = async (positionId: string, percent: number) => {
    try {
      setPartialClosingId(positionId);
      setFeedback(null);
      const res = await partialClosePosition(positionId, percent);
      setFeedback({
        text: `Partial close executed: ${percent}% position closed at market (Realized: $${res.trade?.realizedPnL?.toFixed(2) || '0.00'}).`,
        success: true
      });
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to execute partial close', success: false });
    } finally {
      setPartialClosingId(null);
    }
  };

  const handleOpenBracketEditor = (pos: UserPosition) => {
    setEditingBracketsId(pos.id);
    setEditSlInput(pos.stopLoss ? String(pos.stopLoss) : '');
    const firstTp = pos.tpTargets?.[0]?.price;
    setEditTpInput(firstTp ? String(firstTp) : '');
  };

  const handleSaveBrackets = async (positionId: string) => {
    try {
      setIsSavingBrackets(true);
      setFeedback(null);
      const slNum = editSlInput ? parseFloat(editSlInput) : undefined;
      const tpNum = editTpInput ? parseFloat(editTpInput) : undefined;
      await updatePositionBrackets(positionId, {
        stopLoss: slNum,
        takeProfit: tpNum
      });
      setEditingBracketsId(null);
      setFeedback({ text: 'Exchange bracket orders (SL/TP) successfully updated.', success: true });
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to update bracket orders', success: false });
    } finally {
      setIsSavingBrackets(false);
    }
  };

  const handleToggleTrailing = async (positionId: string, currentActive: boolean) => {
    try {
      setTrailingTogglingId(positionId);
      setFeedback(null);
      const newActive = !currentActive;
      await toggleTrailingRunner(positionId, newActive);
      setFeedback({
        text: newActive
          ? 'Trailing Runner activated: Fixed TP removed, stop loss will trail profit dynamically.'
          : 'Trailing Runner deactivated.',
        success: true
      });
    } catch (err: any) {
      setFeedback({ text: err.message || 'Failed to toggle trailing runner', success: false });
    } finally {
      setTrailingTogglingId(null);
    }
  };

  const handleEmergencyCloseAll = async () => {
    try {
      setIsEmergencyClosing(true);
      setShowEmergencyConfirm(false);
      setFeedback(null);
      const res = await emergencyCloseAll();
      setFeedback({
        text: `Emergency Kill Switch Triggered: Closed ${res.closedCount || positions.length} active position(s).`,
        success: true
      });
    } catch (err: any) {
      setFeedback({ text: err.message || 'Emergency close failed', success: false });
    } finally {
      setIsEmergencyClosing(false);
    }
  };

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      setFeedback(null);
      await syncPositions();
      setFeedback({ text: 'Positions synchronized with exchange.', success: true });
    } catch (err: any) {
      setFeedback({ text: err.message || 'Sync failed', success: false });
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className={`bg-slate-900/90 border border-slate-800/90 rounded-2xl p-6 text-center shadow-xl backdrop-blur-sm ${className}`}>
        <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700/80 flex items-center justify-center mx-auto mb-3 text-cyan-400">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-white mb-1">Live Active Positions</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
          Authenticate to view and control live institutional trades, margin allocation, and zero-loss trailing status.
        </p>
        <button
          onClick={openAuthModal}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
        >
          Sign In to Access AutoTrade
        </button>
      </div>
    );
  }

  return (
    <div className={`bg-slate-900/90 border border-slate-800/90 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm ${className}`}>
      {/* Top Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className={`w-3 h-3 rounded-full ${positions.length > 0 ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
            <div className={`absolute inset-0 w-3 h-3 rounded-full ${positions.length > 0 ? 'bg-emerald-500' : 'bg-slate-600'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">Live Active Positions</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                {positions.length} / {maxSimultaneous} MAX
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Binance Futures Cross Margin • True OCO Brackets • Break-Even Trailing
            </p>
          </div>
        </div>

        {/* Global Unrealized PnL & Action Bar */}
        <div className="flex items-center gap-2">
          {positions.length > 0 && (
            <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-mono text-xs font-bold ${
              totalUnrealizedPnL >= 0
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-950/40 border-rose-500/30 text-rose-400'
            }`}>
              <span>Total uPnL:</span>
              <span>{totalUnrealizedPnL >= 0 ? '+' : ''}${totalUnrealizedPnL.toFixed(2)} USDT</span>
              <span className="text-[10px] opacity-80">({totalPnLPct >= 0 ? '+' : ''}{totalPnLPct.toFixed(1)}%)</span>
            </div>
          )}

          <button
            onClick={handleSync}
            disabled={isSyncing}
            title="Sync positions with exchange"
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          {positions.length > 0 && (
            <button
              onClick={() => setShowEmergencyConfirm(true)}
              disabled={isEmergencyClosing}
              className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-600/50 hover:border-rose-500 text-rose-300 hover:text-rose-100 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-rose-950/30 cursor-pointer"
            >
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
              <span>Kill Switch & Close All</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Feedback Banner */}
      {feedback && (
        <div className={`px-4 py-2 text-xs flex items-center justify-between border-b ${
          feedback.success
            ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
            : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Emergency Close Confirmation Modal / Banner */}
      {showEmergencyConfirm && (
        <div className="p-4 bg-rose-950/80 border-b border-rose-700/60 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2.5 text-rose-200 text-xs">
            <AlertOctagon className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <div>
              <span className="font-bold">CONFIRM EMERGENCY KILL SWITCH:</span>
              <p className="text-rose-300/80 text-[11px]">
                Immediately market-liquidate all {positions.length} active position(s) on exchange and cancel pending OCO orders.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => setShowEmergencyConfirm(false)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleEmergencyCloseAll}
              disabled={isEmergencyClosing}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg shadow-lg shadow-rose-900/50 flex items-center gap-1.5 cursor-pointer"
            >
              {isEmergencyClosing && <RefreshCw className="w-3 h-3 animate-spin" />}
              <span>Yes, Liquidate All Now</span>
            </button>
          </div>
        </div>
      )}

      {/* Positions Body */}
      {positions.length === 0 ? (
        <div className="p-8 sm:p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/40 border border-slate-700/50 flex items-center justify-center mx-auto mb-3 text-slate-500">
            <Shield className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-300 mb-1">No Active Open Positions</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-3">
            MoonScanner Institutional Engine is active and standing by. Grade A+ breakout setups with &le;0.3% slippage will execute automatically.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/60 border border-slate-700/60 text-[11px] text-slate-400 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>Anti-Chase Slippage Guard: Active (Max 0.3%)</span>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {positions.map((pos) => {
            const isLong = pos.direction === 'LONG';
            const curPrice = pos.currentPrice || pos.entryPrice;
            const diffPct = pos.entryPrice > 0 ? ((curPrice - pos.entryPrice) / pos.entryPrice) * (isLong ? 100 : -100) : 0;
            const roePct = diffPct * (pos.leverage || 20);
            const uPnlUsd = (pos.unrealizedPnL !== undefined && pos.unrealizedPnL !== null)
              ? pos.unrealizedPnL
              : (pos.marginUsd ? (pos.marginUsd * (roePct / 100)) : 0);

            const isProfitable = uPnlUsd >= 0;
            const isClosing = closingId === pos.id;
            const isConfirming = confirmCloseId === pos.id;

            return (
              <div key={pos.id} className="p-4 sm:p-5 hover:bg-slate-800/20 transition-colors">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left Column: Asset, Direction, Leverage, Badges */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-extrabold text-white font-mono tracking-tight">
                        #{pos.symbol.toUpperCase()}
                      </span>

                      {/* Direction Tag */}
                      <span className={`px-2 py-0.5 rounded-md text-xs font-extrabold font-mono flex items-center gap-1 ${
                        isLong
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                          : 'bg-rose-950/80 text-rose-400 border border-rose-500/40'
                      }`}>
                        {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {pos.direction} {pos.leverage || 20}x Cross
                      </span>

                      {/* Paper vs Live Badge */}
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        pos.isPaper
                          ? 'bg-amber-950/50 text-amber-300 border border-amber-600/30'
                          : 'bg-cyan-950/50 text-cyan-300 border border-cyan-500/30'
                      }`}>
                        {pos.isPaper ? 'PAPER' : 'BINANCE LIVE'}
                      </span>

                      {/* Trailed Break-Even Badge */}
                      {pos.trailedToBreakEven && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          <span>BREAK-EVEN TRAILED (+0.05% BUFFER)</span>
                        </span>
                      )}
                    </div>

                    {/* Price metrics row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono">
                      <div>
                        <span className="text-slate-500">Entry:</span>{' '}
                        <span className="text-slate-200 font-semibold">${formatPrice(pos.entryPrice)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Mark:</span>{' '}
                        <span className="text-slate-200 font-semibold">${formatPrice(curPrice)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">SL:</span>{' '}
                        <span className="text-rose-400 font-semibold">${formatPrice(pos.stopLoss)}</span>
                      </div>
                      {pos.tpTargets?.[0] && (
                        <div>
                          <span className="text-slate-500">TP1:</span>{' '}
                          <span className="text-emerald-400 font-semibold">${formatPrice(pos.tpTargets[0].price)}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-500">Margin:</span>{' '}
                        <span className="text-slate-300">${pos.marginUsd?.toFixed(2) || '50.00'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Real-time Unrealized PnL & Quick Controls */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between lg:justify-end gap-3">
                    {/* PnL Display */}
                    <div className="text-left lg:text-right font-mono">
                      <div className={`text-base sm:text-lg font-black tracking-tight ${
                        isProfitable ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {isProfitable ? '+' : ''}${uPnlUsd.toFixed(2)} USDT
                      </div>
                      <div className={`text-xs font-bold ${
                        isProfitable ? 'text-emerald-400/90' : 'text-rose-400/90'
                      }`}>
                        {roePct >= 0 ? '+' : ''}{roePct.toFixed(2)}% ROE
                      </div>
                    </div>

                    {/* Action Buttons Group */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Edit Brackets Button */}
                      <button
                        onClick={() => editingBracketsId === pos.id ? setEditingBracketsId(null) : handleOpenBracketEditor(pos)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                          editingBracketsId === pos.id
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                            : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border-slate-700'
                        }`}
                        title="Edit Stop Loss & Take Profit on Exchange"
                      >
                        <Sliders className="w-3 h-3 text-cyan-400" />
                        <span>Brackets</span>
                      </button>

                      {/* Trailing Runner Mode Toggle */}
                      <button
                        onClick={() => handleToggleTrailing(pos.id, !!pos.trailingRunnerActive)}
                        disabled={trailingTogglingId === pos.id}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                          pos.trailingRunnerActive
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                            : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 border-slate-700'
                        }`}
                        title="Toggle dynamic Trailing Runner mode"
                      >
                        <Compass className={`w-3 h-3 ${pos.trailingRunnerActive ? 'text-amber-400 animate-spin' : 'text-slate-500'}`} />
                        <span>{pos.trailingRunnerActive ? 'Runner: ON' : 'Runner'}</span>
                      </button>

                      {/* Partial Close Dropdown / Chips */}
                      <div className="flex items-center bg-slate-900/80 border border-slate-700/80 rounded-lg p-0.5">
                        {[25, 50, 75].map((pct) => (
                          <button
                            key={pct}
                            onClick={() => handlePartialClose(pos.id, pct)}
                            disabled={partialClosingId === pos.id || isClosing}
                            className="px-1.5 py-1 text-[10px] font-mono font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-50 cursor-pointer"
                            title={`Market close ${pct}% of position`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>

                      {/* Full Market Close Action */}
                      {isConfirming ? (
                        <div className="flex items-center gap-1 animate-fadeIn">
                          <button
                            onClick={() => setConfirmCloseId(null)}
                            className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg font-medium cursor-pointer"
                          >
                            No
                          </button>
                          <button
                            onClick={() => handleClose(pos.id)}
                            disabled={isClosing}
                            className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg flex items-center gap-1 cursor-pointer"
                          >
                            {isClosing && <RefreshCw className="w-3 h-3 animate-spin" />}
                            <span>Close 100%</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmCloseId(pos.id)}
                          disabled={isClosing}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-600/60 text-slate-300 hover:text-rose-300 font-bold text-xs rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                          title="Instant 100% Market Close"
                        >
                          <XCircle className="w-3 h-3 text-rose-400" />
                          <span>Close</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inline Bracket Editor Panel */}
                {editingBracketsId === pos.id && (
                  <div className="mt-3 p-3 bg-slate-900/90 border border-cyan-500/30 rounded-xl animate-fadeIn">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                          Adjust Exchange Brackets for #{pos.symbol}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                          <span>Stop Loss ($):</span>
                          <input
                            type="number"
                            step="any"
                            value={editSlInput}
                            onChange={(e) => setEditSlInput(e.target.value)}
                            placeholder={formatPrice(pos.stopLoss)}
                            className="w-28 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-rose-300 font-mono focus:border-rose-500 focus:outline-none"
                          />
                        </label>
                        <label className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                          <span>Take Profit ($):</span>
                          <input
                            type="number"
                            step="any"
                            value={editTpInput}
                            onChange={(e) => setEditTpInput(e.target.value)}
                            placeholder={formatPrice(pos.tpTargets?.[0]?.price)}
                            className="w-28 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-emerald-300 font-mono focus:border-emerald-500 focus:outline-none"
                          />
                        </label>
                        <button
                          onClick={() => handleSaveBrackets(pos.id)}
                          disabled={isSavingBrackets}
                          className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded font-mono flex items-center gap-1 transition-all cursor-pointer"
                        >
                          {isSavingBrackets ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          <span>Save to Exchange</span>
                        </button>
                        <button
                          onClick={() => setEditingBracketsId(null)}
                          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TP Targets Step Indicator */}
                {pos.tpTargets && pos.tpTargets.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800/40 flex flex-wrap items-center gap-2 text-[11px] font-mono">
                    <span className="text-slate-500 text-[10px] font-sans font-medium">TARGET TRAIL:</span>
                    {pos.tpTargets.map((tp, idx) => {
                      const isReached = tp.hit || (pos.currentTpStep && pos.currentTpStep >= tp.index);
                      return (
                        <div
                          key={idx}
                          className={`px-2 py-0.5 rounded border flex items-center gap-1 ${
                            isReached
                              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 font-bold'
                              : 'bg-slate-900/40 border-slate-800 text-slate-500'
                          }`}
                        >
                          <span>TP{tp.index || idx + 1}:</span>
                          <span>${tp.price}</span>
                          {isReached && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
