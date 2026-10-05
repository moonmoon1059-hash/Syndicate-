import React, { useState } from 'react';
import { SupernovaCandidate } from '../types/supernova';
import {
  Flame,
  TrendingUp,
  TrendingDown,
  Zap,
  Target,
  ShieldAlert,
  Send,
  ExternalLink,
  ChevronRight,
  Activity,
  Layers,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { formatPrice } from '../utils/formatters';
import { CoinInspectorModal } from './CoinInspectorModal';

interface Props {
  candidate: SupernovaCandidate;
  onSelect?: (candidate: SupernovaCandidate) => void;
  onTrade?: (candidate: SupernovaCandidate) => void;
}

export const SupernovaCard: React.FC<Props> = ({ candidate, onSelect, onTrade }) => {
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const isLong = candidate.direction === 'LONG';
  const isPhase1 = candidate.phase === 'ROCKET_PUMP';
  const isPreIgnition = candidate.phase === 'PRE_IGNITION';
  const isPreCollapse = candidate.phase === 'PRE_COLLAPSE';
  const isClimax = candidate.phase === 'CLIMAX_COLLAPSE';
  const isShort = !isLong || isPreCollapse || isClimax;

  const entryPrice = candidate.entryPrice || candidate.currentPrice || 1;
  const tp1Pct = entryPrice > 0 ? ((Math.abs(entryPrice - candidate.tp1) / entryPrice) * 100).toFixed(0) : '15';
  const tp2Pct = entryPrice > 0 ? ((Math.abs(entryPrice - candidate.tp2) / entryPrice) * 100).toFixed(0) : '35';
  const tp3Pct = entryPrice > 0 ? ((Math.abs(entryPrice - candidate.tp3) / entryPrice) * 100).toFixed(0) : '55';
  const tp4Pct = candidate.tp4 && entryPrice > 0 ? ((Math.abs(entryPrice - candidate.tp4) / entryPrice) * 100).toFixed(0) : '';

  const formatDec = (val: number) => {
    if (!Number.isFinite(val)) return '0.00';
    if (val < 0.001) return val.toFixed(6);
    if (val < 1.0) return val.toFixed(4);
    return val.toFixed(2);
  };

  const handleDispatchTelegram = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDispatching(true);
    setDispatchStatus(null);
    try {
      const res = await fetch(`/api/supernova/dispatch/${candidate.symbol}`, {
        method: 'POST'
      });
      if (res.ok) {
        setDispatchStatus('Dispatched to Telegram VIP! 🚀');
        setTimeout(() => setDispatchStatus(null), 4000);
      } else {
        setDispatchStatus('Alert recorded in queue');
        setTimeout(() => setDispatchStatus(null), 4000);
      }
    } catch {
      setDispatchStatus('Offline - Queued');
      setTimeout(() => setDispatchStatus(null), 4000);
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div
      onClick={() => onSelect && onSelect(candidate)}
      className={`group relative rounded-3xl p-5 sm:p-6 transition-all duration-300 cursor-pointer overflow-hidden border backdrop-blur-xl ${
        isPreIgnition
          ? 'bg-gradient-to-br from-cyan-950/25 via-slate-900/90 to-slate-950 border-cyan-500/40 hover:border-cyan-400/70 shadow-lg shadow-cyan-950/20'
          : isPhase1
          ? 'bg-gradient-to-br from-amber-950/20 via-slate-900/90 to-slate-950 border-amber-500/30 hover:border-amber-400/60 shadow-lg shadow-amber-950/20'
          : isPreCollapse
          ? 'bg-gradient-to-br from-rose-950/25 via-slate-900/90 to-slate-950 border-rose-500/40 hover:border-rose-400/70 shadow-lg shadow-rose-950/20'
          : 'bg-gradient-to-br from-red-950/35 via-slate-900/90 to-slate-950 border-red-500/50 hover:border-red-400/80 shadow-lg shadow-red-950/25'
      }`}
    >
      {/* Background Ambient Glow */}
      <div
        className={`absolute -top-24 -right-24 w-56 h-56 rounded-full blur-3xl pointer-events-none opacity-20 ${
          isPreIgnition ? 'bg-cyan-400' : isPhase1 ? 'bg-amber-400' : 'bg-rose-500'
        }`}
      />

      {/* Top Banner & Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-4">
        <div className="flex items-center gap-2">
          {isPreIgnition ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wide bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/50 text-cyan-300 shadow-sm shadow-cyan-500/20 animate-pulse">
              <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
              <span>🚀 PRE-IGNITION RADAR (LONG)</span>
            </div>
          ) : isPhase1 ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wide bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-400/50 text-amber-300 shadow-sm shadow-amber-500/20 animate-pulse">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>👑 #1 GAINER CONTENDER (LONG)</span>
            </div>
          ) : isPreCollapse ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wide bg-gradient-to-r from-rose-500/20 to-pink-500/20 border border-rose-500/60 text-rose-300 shadow-sm shadow-rose-500/20 animate-pulse">
              <TrendingDown className="w-3.5 h-3.5 text-rose-300" />
              <span>📉 PRE-COLLAPSE BREAKDOWN (SHORT)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wide bg-gradient-to-r from-red-600/20 to-rose-600/20 border border-red-500/70 text-red-300 shadow-sm shadow-red-500/20 animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5 text-red-300" />
              <span>🚨 CLIMAX CRASH RUNNER (SHORT)</span>
            </div>
          )}

          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800/80 text-slate-300 border border-slate-700/60">
            Score: {candidate.score}/120
          </span>
        </div>

        {/* Asymmetric Expansion Potential */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-xl font-mono text-xs font-black ${
            isPreIgnition
              ? 'bg-cyan-400 text-slate-950 shadow-sm shadow-cyan-400/30'
              : isPhase1
              ? 'bg-amber-400 text-slate-950 shadow-sm shadow-amber-400/30'
              : 'bg-rose-500 text-white shadow-sm shadow-rose-500/30'
          }`}
        >
          {isLong ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span>
            {isLong
              ? `+${candidate.maxPotentialPct}% UPSIDE`
              : `-${candidate.maxPotentialPct}% FREEFALL`}
          </span>
        </div>
      </div>

      {/* Main Header: Symbol, Price, Phase */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-baseline gap-2">
            <h3 className={`text-2xl font-black font-mono tracking-tight transition-colors ${
              isShort ? 'text-white group-hover:text-rose-400' : 'text-white group-hover:text-amber-300'
            }`}>
              #{candidate.baseAsset}
            </h3>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {candidate.symbol}
            </span>
          </div>
          <div className="text-xs font-medium text-slate-400 mt-0.5">
            {isPreIgnition
              ? 'Stealth Whale Accumulation & Volatility Squeeze Coil'
              : isPhase1
              ? 'Binance Futures Meme / Micro-Cap Runner'
              : isPreCollapse
              ? 'Coiled Distribution Shelf before Cliff Breakdown'
              : 'Parabolic Exhaustion & Smart Money Dump'}
          </div>
        </div>

        <div className="text-right">
          <div className="text-xl font-black font-mono text-white">
            ${formatDec(candidate.currentPrice)}
          </div>
          <div className="flex items-center justify-end gap-1.5 text-xs font-mono font-bold">
            {candidate.change24h !== undefined && (
              <span className={candidate.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {candidate.change24h >= 0 ? `+${candidate.change24h.toFixed(2)}%` : `${candidate.change24h.toFixed(2)}%`}
              </span>
            )}
            <span className="text-slate-500">•</span>
            <span className="text-cyan-400">RVOL {candidate.rvol}x</span>
          </div>
        </div>
      </div>

      {/* Institutional Drivers Metric Pill Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="p-2.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Relative Volume</div>
          <div className="text-sm font-black font-mono text-cyan-300 mt-0.5">
            {candidate.rvol}x Volume
          </div>
        </div>

        <div className="p-2.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Whale OI Surge</div>
          <div className="text-sm font-black font-mono text-emerald-300 mt-0.5">
            +{candidate.oiSurgePct}%
          </div>
        </div>

        <div className="p-2.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            {isClimax ? '15M RSI Peak' : isPreCollapse ? 'Trap Funding' : 'Squeeze Funding'}
          </div>
          <div className={`text-sm font-black font-mono mt-0.5 ${isShort ? 'text-rose-400' : 'text-amber-300'}`}>
            {isClimax
              ? `${candidate.rsi || 88} Peak`
              : `${(candidate.fundingRatePct * 100).toFixed(3)}%`}
          </div>
        </div>

        <div className="p-2.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            {isClimax ? 'Peak Invalidation' : isPreCollapse ? 'Downside Void' : 'Orderbook Shelf'}
          </div>
          <div className="text-sm font-black font-mono text-purple-300 mt-0.5">
            {isClimax ? '+1.8% SL Peak' : isPreCollapse ? 'LVN Void Below' : 'LVN Air Pocket'}
          </div>
        </div>
      </div>

      {/* Targets & Invalidation Shelf */}
      <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/90 mb-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400 font-semibold">Entry Shelf:</span>
          <span className="text-white font-bold">${formatDec(candidate.entryPrice)}</span>
        </div>
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400 font-semibold">
            {isClimax ? 'Peak Wick Invalidation (SL):' : isPreCollapse ? 'Ceiling Invalidation (SL):' : 'Structural Stop Loss:'}
          </span>
          <span className="text-rose-400 font-bold">${formatDec(candidate.stopLoss)}</span>
        </div>

        {/* Milestone Targets Ladder */}
        <div className="pt-2 border-t border-slate-800/80 grid grid-cols-3 sm:grid-cols-4 gap-2 text-center">
          <div className="p-1.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[9px] uppercase font-bold text-slate-400">TP1 {isLong ? `+${tp1Pct}%` : `-${tp1Pct}%`}</div>
            <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5">${formatDec(candidate.tp1)}</div>
          </div>
          <div className="p-1.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[9px] uppercase font-bold text-slate-400">TP2 {isLong ? `+${tp2Pct}%` : `-${tp2Pct}%`}</div>
            <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5">${formatDec(candidate.tp2)}</div>
          </div>
          <div className="p-1.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[9px] uppercase font-bold text-slate-400">TP3 {isLong ? `+${tp3Pct}%` : `-${tp3Pct}% Freefall`}</div>
            <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5">${formatDec(candidate.tp3)}</div>
          </div>
          {candidate.tp4 && (
            <div className={`p-1.5 rounded-xl col-span-3 sm:col-span-1 ${
              isLong ? 'bg-amber-950/40 border border-amber-500/40' : 'bg-rose-950/40 border border-rose-500/40'
            }`}>
              <div className={`text-[9px] uppercase font-black ${isLong ? 'text-amber-300' : 'text-rose-300'}`}>
                {isLong ? 'TP4 MOON' : 'TP4 AIR POCKET'}
              </div>
              <div className={`text-xs font-mono font-black mt-0.5 ${isLong ? 'text-amber-300' : 'text-rose-300'}`}>
                ${formatDec(candidate.tp4)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons: 1-Click Execution & VIP Telegram Dispatch */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowConfigModal(true);
          }}
          className={`w-full flex-1 py-3 px-4 rounded-2xl font-mono text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all transform active:scale-95 shadow-md ${
            isPreIgnition
              ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 hover:brightness-110 shadow-cyan-500/30'
              : isPhase1
              ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 hover:brightness-110 shadow-amber-500/30'
              : 'bg-gradient-to-r from-rose-500 to-red-600 text-white hover:brightness-110 shadow-rose-500/30'
          }`}
        >
          <Zap className="w-4 h-4 fill-current" />
          <span>⚡ Configure & Execute Trade</span>
        </button>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleDispatchTelegram}
            disabled={isDispatching}
            className="flex-1 sm:flex-initial py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-cyan-400 font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
            title="Dispatch VIP Telegram Alert with TradingView Chart"
          >
            <Send className={`w-3.5 h-3.5 ${isDispatching ? 'animate-spin' : ''}`} />
            <span>{isDispatching ? 'Sending...' : 'VIP Alert'}</span>
          </button>

          <a
            href={`https://www.tradingview.com/chart/?symbol=BINANCE:${candidate.symbol}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white transition-all flex items-center justify-center"
            title="Open Live TradingView Chart"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {dispatchStatus && (
        <div className="mt-3 p-2 rounded-xl bg-cyan-950/60 border border-cyan-800 text-cyan-300 text-xs text-center font-mono flex items-center justify-center gap-1.5 animate-fadeIn">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{dispatchStatus}</span>
        </div>
      )}

      {/* Dynamic Dual Slider Margin & Leverage Trade Modal */}
      {showConfigModal && (
        <CoinInspectorModal
          symbol={candidate.symbol}
          initialSignal={candidate}
          onClose={() => setShowConfigModal(false)}
          onTrade={() => {
            setShowConfigModal(false);
            if (onTrade) onTrade(candidate);
          }}
        />
      )}
    </div>
  );
};
