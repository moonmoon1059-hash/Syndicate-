import React, { useMemo } from 'react';
import { Signal, SignalQualityGrade } from '../types/crypto';
import { formatPrice, formatPercent, getCanonicalTargets } from '../utils/formatters';
import {
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  ChevronRight,
  ShieldAlert,
  Target,
  TrendingUp,
  Sparkles,
  Newspaper,
  Zap
} from 'lucide-react';

interface Props {
  signal: Signal;
  onSelect: (signal: Signal) => void;
}

const getGradeBadgeStyle = (grade?: SignalQualityGrade) => {
  switch (grade) {
    case 'A+':
      return 'bg-amber-400/20 text-amber-300 border-amber-400/50 shadow-sm shadow-amber-400/20';
    case 'A':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'B':
      return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    case 'C':
      return 'bg-slate-700/40 text-slate-300 border-slate-600/40';
    case 'WAIT':
    default:
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  }
};

const SignalCardComponent: React.FC<Props> = ({ signal, onSelect }) => {
  const isLong = signal.direction === 'LONG';
  const isShort = signal.direction === 'SHORT';
  const isWait = signal.direction === 'WAIT' || (!isLong && !isShort);

  const grade = signal.qualityGrade || (isWait ? 'WAIT' : 'B');

  // Dynamic canonical targets (TP1..TP7)
  const rawTargets = useMemo(() => getCanonicalTargets(signal), [signal]);
  const tpTargets = rawTargets.filter(t => typeof t.price === 'number' && t.price > 0 && t.status !== 'INVALIDATED');

  // Concise Category / Strength
  const conciseCategory = signal.category === 'MAJOR'
    ? 'MAJOR'
    : signal.category === 'ALTCOIN'
    ? 'ALT'
    : signal.category === 'MEME_HIGH_BETA'
    ? 'MEME'
    : signal.category === 'NEW_LISTING'
    ? 'NEW'
    : signal.primaryCategory
    ? signal.primaryCategory.replace(/_/g, ' ')
    : 'MOMENTUM';

  // Calculate Potential Upside % (Calculated strictly from dynamic targets without hardcoded caps or fallbacks)
  const finalTp = tpTargets.length > 0 ? tpTargets[tpTargets.length - 1] : null;
  const potentialUpsidePct: number = signal.opportunityPriority?.realisticUpsidePct ?? (
    finalTp && finalTp.price && signal.entryPrice > 0 && !isWait
      ? isLong
        ? Math.max(0, ((finalTp.price - signal.entryPrice) / signal.entryPrice) * 100)
        : Math.max(0, ((signal.entryPrice - finalTp.price) / signal.entryPrice) * 100)
      : 0
  );

  // Optional Tiny Indicator (priority, news, listing, or early setup)
  const tinyIndicator = (() => {
    if (signal.priorityScore && signal.priorityScore > 500) {
      return { label: 'HIGH CONVICTION', icon: Zap, style: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    }
    if (signal.newsCatalyst || (signal.unifiedEvidence?.news && !signal.unifiedEvidence.news.isMissing)) {
      return { label: 'NEWS CATALYST', icon: Newspaper, style: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' };
    }
    if (signal.newListingIntelligence?.isNewListing || signal.category === 'NEW_LISTING') {
      return { label: 'NEW LISTING', icon: Sparkles, style: 'bg-teal-500/15 text-teal-300 border-teal-500/30' };
    }
    if (signal.earlyMoveReport?.isEarlySetup) {
      return { label: 'EARLY SETUP', icon: Sparkles, style: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' };
    }
    return null;
  })();

  // Concise reason if WAIT
  const waitReason = (signal as any).waitReason || signal.notes || 'No valid setup';

  return (
    <div
      onClick={() => onSelect(signal)}
      className="group relative cursor-pointer overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800 p-4 transition-all duration-200 hover:border-cyan-500/40 hover:bg-slate-900/95 hover:shadow-lg hover:shadow-cyan-950/20 font-mono"
    >
      {/* Direction Accent Bar */}
      <div
        className={`absolute top-0 left-0 bottom-0 w-1.5 ${
          isWait ? 'bg-amber-500' : isLong ? 'bg-emerald-500' : 'bg-rose-500'
        }`}
      />

      {/* Primary Header Row: Coin Symbol, Direction, Grade */}
      <div className="flex items-center justify-between pl-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Direction Icon */}
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-xl shrink-0 ${
              isWait
                ? 'bg-amber-500/15 text-amber-400'
                : isLong
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-rose-500/15 text-rose-400'
            }`}
          >
            {isWait ? (
              <Activity className="w-4 h-4" />
            ) : isLong ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : (
              <ArrowDownRight className="w-4 h-4" />
            )}
          </div>

          {/* Coin Symbol & Price */}
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-base text-slate-100 tracking-tight">
              {signal.symbol}
            </span>
            <span className="text-xs text-slate-400">
              {formatPrice(signal.currentPrice)}
            </span>
            {signal.priceChange24h !== undefined && (
              <span
                className={`text-[11px] font-semibold ${
                  signal.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatPercent(signal.priceChange24h)}
              </span>
            )}
          </div>
        </div>

        {/* Right Badges: Direction & Grade */}
        <div className="flex items-center gap-1.5">
          {/* Direction Badge */}
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold tracking-wide border ${
              isWait
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : isLong
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
            }`}
          >
            {isWait ? 'WAIT' : signal.direction}
          </span>

          {/* Quality Grade Badge */}
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${getGradeBadgeStyle(grade)}`}>
            {grade === 'WAIT' ? 'WAIT' : `GRADE ${grade}`}
          </span>
        </div>
      </div>

      {/* Sub-header Strip: Concise Category & Optional Tiny Indicator */}
      <div className="mt-2 pl-1 flex items-center justify-between text-[10px] text-slate-400 flex-wrap gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-500 font-semibold uppercase">Category:</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60 font-semibold">
            {conciseCategory}
          </span>
          {signal.majorMoveClass === 'EXTREME_MOVE' && potentialUpsidePct >= 50 && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse">
              ⚡ EXTREME MOVE (≥50%)
            </span>
          )}
          {signal.majorMoveClass === 'MAJOR_MOVE' && potentialUpsidePct >= 30 && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
              🚀 MAJOR MOVE (≥30%)
            </span>
          )}
          {signal.majorMoveClass === 'STRONG_MOVE' && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
              STRONG MOVE (10-30%)
            </span>
          )}
          {signal.majorMoveClass === 'MODERATE_MOVE' && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
              MODERATE MOVE (5-10%)
            </span>
          )}
          {(signal.majorMoveClass === 'NORMAL' || potentialUpsidePct < 5) && potentialUpsidePct > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-800 text-slate-400 border border-slate-700/60">
              NORMAL MOVE
            </span>
          )}
        </div>

        {tinyIndicator && (
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border flex items-center gap-1 ${tinyIndicator.style}`}>
            <tinyIndicator.icon className="w-2.5 h-2.5" />
            <span>{tinyIndicator.label}</span>
          </span>
        )}
      </div>

      {/* Main Trading Metrics: Entry, SL, R:R, Potential % */}
      {!isWait ? (
        <div className="mt-2.5 pl-1 grid grid-cols-4 gap-2 bg-slate-950/60 p-2 rounded-xl border border-slate-800/70 text-center">
          <div>
            <div className="text-[9px] text-slate-400 uppercase">Entry</div>
            <div className="text-xs font-bold text-cyan-300 mt-0.5">
              {formatPrice(signal.entryPrice)}
            </div>
            {signal.entryZoneLow && signal.entryZoneHigh ? (
              <div className="text-[8px] text-slate-400/90 font-mono truncate mt-0.5" title={`Zone: ${formatPrice(signal.entryZoneLow)} – ${formatPrice(signal.entryZoneHigh)}`}>
                {formatPrice(signal.entryZoneLow)}–{formatPrice(signal.entryZoneHigh)}
              </div>
            ) : null}
          </div>
          <div>
            <div className="text-[9px] text-slate-400 uppercase">Stop Loss</div>
            <div className="text-xs font-bold text-rose-400 mt-0.5 flex items-center justify-center gap-0.5">
              <ShieldAlert className="w-3 h-3 text-rose-500" />
              <span>{formatPrice(signal.stopLoss)}</span>
            </div>
          </div>
          <div>
            <div className="text-[9px] text-slate-400 uppercase">R : R</div>
            <div className="text-xs font-bold text-amber-300 mt-0.5">
              1 : {signal.riskRewardRatio && signal.riskRewardRatio > 0 ? signal.riskRewardRatio.toFixed(1) : 'N/A'}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-slate-400 uppercase">Potential</div>
            <div className="text-xs font-bold text-emerald-400 mt-0.5 flex items-center justify-center gap-0.5">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              <span>{potentialUpsidePct > 0 ? `+${potentialUpsidePct.toFixed(1)}%` : '—'}</span>
            </div>
          </div>
        </div>
      ) : (
        /* If WAIT: Concise explanation banner (No valid setup) */
        <div className="mt-2.5 pl-1 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300/90 text-xs flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="truncate">
            <strong>WAIT:</strong> {waitReason}
          </div>
        </div>
      )}

      {/* Target Pipeline: Dynamic ladder (TP1..TP7) */}
      {!isWait && tpTargets.length > 0 && (
        <div className="mt-2.5 pl-1">
          <div className={`grid ${
            tpTargets.length <= 3 
              ? 'grid-cols-3' 
              : tpTargets.length <= 4 
              ? 'grid-cols-2 sm:grid-cols-4' 
              : tpTargets.length <= 6
              ? 'grid-cols-3 sm:grid-cols-6'
              : 'grid-cols-2 sm:grid-cols-4 md:grid-cols-7'
          } gap-1.5`}>
            {tpTargets.map((t, idx) => {
              const label = t.label || `TP${idx + 1}`;
              const pct = typeof t.percentage === 'number' && !isNaN(t.percentage)
                ? t.percentage
                : (signal.entryPrice > 0 ? Math.abs(t.price - signal.entryPrice) / signal.entryPrice * 100 : 0);

              return (
                <div
                  key={label}
                  className="p-1.5 rounded-lg bg-slate-950/40 border border-slate-800/80 text-center"
                >
                  <div className="text-[9px] text-slate-400 font-semibold flex items-center justify-center gap-1">
                    <Target className="w-2.5 h-2.5 text-emerald-400" />
                    <span>{label}</span>
                  </div>
                  <div className="text-xs font-bold text-slate-200 mt-0.5">
                    {formatPrice(t.price)}
                  </div>
                  <div className="text-[9px] text-emerald-400 font-semibold">
                    +{pct.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invalidation summary if non-wait */}
      {!isWait && (signal.invalidationReason || (signal as any).invalidation) && (
        <div className="mt-2 pl-1 text-[10px] text-slate-400 truncate flex items-center gap-1">
          <span className="text-rose-400 font-semibold shrink-0">Invalidation:</span>
          <span className="text-slate-300 truncate">{signal.invalidationReason || (signal as any).invalidation}</span>
        </div>
      )}

      {/* Bottom Row: Tap to Inspect Setup */}
      <div className="mt-3 pl-1 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
        <span className="text-slate-500">
          MoonScore {signal.moonScore}/100
        </span>
        <div className="flex items-center gap-1 text-cyan-400 font-medium group-hover:translate-x-0.5 transition-transform">
          <span>Inspect analysis</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
};

export const SignalCard = React.memo(SignalCardComponent, (prev, next) => {
  return (
    prev.signal.id === next.signal.id &&
    prev.signal.status === next.signal.status &&
    prev.signal.currentPrice === next.signal.currentPrice &&
    prev.signal.moonScore === next.signal.moonScore &&
    prev.signal.qualityGrade === next.signal.qualityGrade &&
    prev.signal.direction === next.signal.direction &&
    prev.signal.entryPrice === next.signal.entryPrice &&
    prev.signal.stopLoss === next.signal.stopLoss &&
    prev.signal.updatedAt === next.signal.updatedAt &&
    prev.onSelect === next.onSelect
  );
});
