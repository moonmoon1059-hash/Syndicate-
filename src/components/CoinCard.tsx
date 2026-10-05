import React from 'react';
import { Signal } from '../types/crypto';
import { formatPrice } from '../utils/formatters';
import {
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Zap,
  Flame,
  Shield,
  Clock,
  Play,
  TrendingUp,
  TrendingDown,
  Sparkles
} from 'lucide-react';

interface CoinCardProps {
  signal: Signal;
  onSelect: (signal: Signal) => void;
  onTrade?: (signal: Signal) => void;
}

export const CoinCard: React.FC<CoinCardProps> = ({ signal, onSelect, onTrade }) => {
  const isLong = signal.direction === 'LONG';
  const isShort = signal.direction === 'SHORT';

  const symbol = signal.symbol.replace(/USDT$/i, '');
  const price = signal.currentPrice || signal.entryPrice;
  const change = signal.priceChange24h ?? (signal as any).change24h ?? 0;
  const isPositive = change >= 0;

  // Conviction / MoonScore: Unified property access
  const score = (signal as any).score ?? signal.moonScore ?? 0;
  const rMultiple = signal.riskRewardRatio && signal.riskRewardRatio > 0 ? signal.riskRewardRatio.toFixed(1) : '2.8';

  // Dynamic Merit-Based Conviction Tiers:
  // 1. Grade A+ / VALID (Score >= 95): Active 1-Click execution, glowing badges, full dispatch
  // 2. CONFLUENCE (Score 80 - 94): Muted amber status, NO trade button
  // 3. WATCHLIST / NEUTRAL (Score < 80): Subdued card, strictly suppress trade buttons & directional pills
  const isValid = score >= 95;
  const isConfluence = score >= 80 && score < 95;
  const isNeutral = score < 80;

  // Target Potential Expansion % (TP4 or highest target level vs Entry)
  const entryPrice = signal.entryPrice || price;
  let maxTp = signal.tp3 || signal.tp2 || signal.tp1 || (entryPrice * (isShort ? 0.85 : 1.25));
  let tpLabel = 'TP2';

  if (Array.isArray(signal.targets) && signal.targets.length > 0) {
    const validTargets = signal.targets.filter(t => t && Number.isFinite(t.price) && t.price > 0);
    if (validTargets.length > 0) {
      const highest = validTargets[validTargets.length - 1];
      maxTp = highest.price;
      tpLabel = highest.label || `TP${validTargets.length}`;
    }
  }

  const targetPotentialPct = entryPrice > 0
    ? (Math.abs(maxTp - entryPrice) / entryPrice * 100).toFixed(1)
    : '32.4';

  const deltaPct = entryPrice > 0 ? Math.abs((price - entryPrice) / entryPrice) * 100 : 0;
  const isWithinEntryZone = deltaPct <= 0.35;
  const canTradeNow = isValid && isWithinEntryZone;

  const isSupernova = Boolean(
    (signal as any).isSupernova ||
    parseFloat(targetPotentialPct) >= 100 ||
    ((signal as any).rvol && (signal as any).rvol >= 8.0) ||
    ((signal as any).openInterestChange24h && (signal as any).openInterestChange24h >= 35)
  );

  return (
    <div
      onClick={() => onSelect(signal)}
      className={`group relative w-full max-w-full box-border rounded-2xl p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between border ${
        isSupernova && canTradeNow
          ? 'bg-gradient-to-b from-slate-900 via-slate-900 to-amber-950/20 border-amber-500/40 hover:border-amber-400 shadow-lg hover:shadow-amber-950/30'
          : canTradeNow
          ? 'bg-slate-900/90 hover:bg-slate-900 border-slate-800 hover:border-cyan-500/50 shadow-lg hover:shadow-cyan-950/30 ring-1 ring-cyan-500/30'
          : isConfluence || (isValid && !isWithinEntryZone)
          ? 'bg-slate-950/70 hover:bg-slate-900/70 border-amber-500/30 hover:border-amber-500/50 opacity-90'
          : 'bg-slate-950/50 hover:bg-slate-900/40 border-slate-800/60 opacity-75'
      }`}
    >
      {/* Top Header: Symbol, Direction, Status badge */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm tracking-wider font-mono shadow-inner ${
                canTradeNow
                  ? isLong
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
              }`}
            >
              {symbol.slice(0, 3)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white tracking-wide text-base">{symbol}</span>
                <span className="text-[10px] text-slate-500 font-mono">USDT</span>
                {signal.preMoveReport?.volatilitySqueeze && (
                  <span className="p-0.5 rounded bg-amber-400/20 text-amber-300" title="Coil Squeeze">
                    <Flame className="w-3 h-3" />
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                <span>{formatPrice(price)}</span>
                <span className={`font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isPositive ? '+' : ''}{change.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              {/* Dynamic Merit Badge: Score >= 95 and within entry zone, else amber wait */}
              {canTradeNow ? (
                <span
                  className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border flex items-center gap-1 font-mono shadow-sm ${
                    isLong
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-emerald-950/20'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-rose-950/20'
                  }`}
                >
                  {isLong ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {isLong ? 'VALID LONG' : 'SNIPER SHORT'}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono border bg-amber-500/15 text-amber-300 border-amber-500/40">
                  ⏳ Setup Forming - Wait For Shelf
                </span>
              )}
            </div>

            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
              <span>Score:</span>
              <span
                className={`font-bold ${
                  canTradeNow ? 'text-cyan-400' : isValid ? 'text-amber-300' : isConfluence ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                {score}
              </span>
            </div>
          </div>
        </div>

        {/* Grade A+ 95+ VIP Conviction Banner */}
        {score >= 95 && (
          <div className="mt-2.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500/20 via-emerald-500/15 to-cyan-500/15 border border-amber-400/40 flex items-center justify-between text-[10px] font-mono shadow-sm">
            <span className="text-amber-300 font-extrabold flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              GRADE A+ VIP SETUP ({score}/100)
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-200 border border-amber-400/30">
              INSTITUTIONAL
            </span>
          </div>
        )}

        {/* Asymmetric Target Potential Neon Banner */}
        {isSupernova ? (
          <div className="mt-2.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-cyan-500/20 border border-amber-400/50 flex items-center justify-between text-[11px] font-mono shadow-sm">
            <span className="text-amber-300 flex items-center gap-1 font-bold">
              👑 #1 GAINER: +{targetPotentialPct}% ({tpLabel})
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-200 border border-amber-400/40">
              SUPERNOVA
            </span>
          </div>
        ) : (
          <div className="mt-2.5 px-2.5 py-1 rounded-lg bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-between text-[11px] font-mono">
            <span className="text-cyan-400 flex items-center gap-1 font-bold">
              🚀 Potential: +{targetPotentialPct}% ({tpLabel})
            </span>
            <span className="text-slate-400 text-[10px]">
              1:{rMultiple} R:R
            </span>
          </div>
        )}

        {/* Tactical Metrics 3-Column Grid */}
        <div className="mt-2.5 grid grid-cols-3 gap-2 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 text-center font-mono">
          <div>
            <div className="text-[9px] text-slate-400 uppercase tracking-tight">Entry Zone</div>
            <div className="text-xs font-bold text-slate-200 mt-0.5 truncate">
              {formatPrice(signal.entryPrice)}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-slate-400 uppercase tracking-tight">Stop Loss</div>
            <div className="text-xs font-bold text-rose-400 mt-0.5 truncate">
              {formatPrice(signal.stopLoss)}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-slate-400 uppercase tracking-tight">Target 1</div>
            <div className="text-xs font-bold text-emerald-400 mt-0.5 truncate">
              {formatPrice(signal.tp1 || entryPrice * 1.03)}
            </div>
          </div>
        </div>

        {/* Technical Pattern / Context Tag */}
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 px-0.5">
          <div className="flex items-center gap-1 truncate max-w-[200px]">
            <Zap className="w-3 h-3 text-cyan-400 shrink-0" />
            <span className="truncate text-slate-300">
              {signal.pattern || (signal as any).sourceType || 'Orderflow Breakout'}
            </span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400 shrink-0">
            <Clock className="w-3 h-3" />
            <span>{signal.timeframe || '15M'}</span>
          </div>
        </div>
      </div>

      {/* Action Footer: ONLY Render 1-Click Execution for Grade A+ / Valid Setups */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between gap-2">
        <div className="text-[10px] text-slate-400 font-mono">
          {canTradeNow ? '⚡ Auto-Verified' : isValid ? '⏳ Awaiting Shelf' : isConfluence ? 'Radar Monitored' : 'Observation Mode'}
        </div>

        {canTradeNow ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onTrade) onTrade(signal);
              else onSelect(signal);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-all shadow-md active:scale-95 ${
              isLong
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/40'
                : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-950/40'
            }`}
          >
            <Play className="w-3 h-3 fill-current" />
            <span>1-Click Trade</span>
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(signal);
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium font-mono text-amber-300 hover:text-amber-200 bg-amber-950/30 hover:bg-amber-900/40 border border-amber-500/40 transition-all flex items-center gap-1"
          >
            <Clock className="w-3 h-3 text-amber-400" />
            <span>Wait For Shelf</span>
          </button>
        )}
      </div>
    </div>
  );
};
