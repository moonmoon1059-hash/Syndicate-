import React from 'react';
import { Signal, EarlyMoveReport } from '../types/crypto';
import { formatPrice, formatPercent, formatBangladeshTime } from '../utils/formatters';
import {
  Timer,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Activity,
  Crosshair,
  TrendingUp,
  AlertOctagon,
  Hourglass
} from 'lucide-react';

interface Props {
  signal: Signal;
  report?: EarlyMoveReport;
}

export const EarlySetupTimingView: React.FC<Props> = ({ signal, report: explicitReport }) => {
  const earlyReport = explicitReport || signal.earlyMoveReport;
  if (!earlyReport && !signal.setupMaturity && !signal.smartEntryTiming) {
    return null;
  }

  const maturity = signal.setupMaturity || earlyReport?.maturity || 'UNKNOWN';
  const timing = signal.smartEntryTiming || earlyReport?.entryTiming || 'WAIT_FOR_CONFIRMATION';
  const timingWindow = signal.timingWindow || earlyReport?.timingWindow || 'WAITING_FOR_CONFIRMATION';
  const earlyCategory = signal.earlyCategory || earlyReport?.earlyCategory || (signal.direction === 'LONG' ? 'EARLY_LONG' : 'EARLY_SHORT');
  const setupType = earlyReport?.setupType || earlyReport?.classification || 'EARLY_EXPANSION';
  const setupAge = signal.setupAge || earlyReport?.setupAge || 'RECENT';
  const triggerCondition = signal.triggerCondition || earlyReport?.triggerCondition;
  const whyThisMatters = signal.whyEarlySetupMatters || earlyReport?.whyThisMatters;
  const idealEntry = earlyReport?.idealEntryPrice || signal.entryPrice;
  const distancePct = earlyReport?.distanceFromIdealEntryPct;
  const noChaseThreshold = earlyReport?.noChaseThresholdPct ?? 1.8;
  const timingQuality = earlyReport?.timingQuality ?? 75;

  const getMaturityBadgeStyle = (m: string) => {
    switch (m) {
      case 'CONFIRMED':
      case 'TRIGGERED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'NEAR_TRIGGER':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'SETUP_FORMING':
      case 'EARLY_SETUP':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'EXTENDED':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      case 'INVALIDATED':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'EXPIRED':
        return 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const getTimingBadgeStyle = (t: string) => {
    switch (t) {
      case 'ENTRY_NOW':
        return 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-xs shadow-emerald-500/20';
      case 'WAIT_FOR_PULLBACK':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'WAIT_FOR_RETEST':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      case 'WAIT_FOR_CONFIRMATION':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
      case 'ENTRY_MISSED':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      case 'INVALIDATED':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'EXPIRED':
        return 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 space-y-3.5 font-mono text-xs">
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
            <Timer className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-bold uppercase tracking-wide">Early Setup & Timing</span>
              <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 text-[9px] font-bold border border-cyan-800/60">
                PHASE 11
              </span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span>Setup Type:</span>
              <span className="text-slate-200 font-bold">{setupType.replace(/_/g, ' ')}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Category Badge */}
          <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${
            earlyCategory === 'EARLY_LONG'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : earlyCategory === 'EARLY_SHORT'
              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}>
            {earlyCategory.replace(/_/g, ' ')}
          </span>

          {/* Maturity State Badge */}
          <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${getMaturityBadgeStyle(maturity)}`}>
            {maturity.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Execution Timing Banner */}
      <div className={`p-3 rounded-lg border flex items-center justify-between flex-wrap gap-3 ${getTimingBadgeStyle(timing)}`}>
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-md bg-slate-900/60 border border-current">
            {timing === 'ENTRY_NOW' ? (
              <Zap className="w-4 h-4 text-emerald-400" />
            ) : timing === 'WAIT_FOR_PULLBACK' ? (
              <Hourglass className="w-4 h-4 text-amber-400" />
            ) : timing === 'ENTRY_MISSED' ? (
              <AlertOctagon className="w-4 h-4 text-orange-400" />
            ) : (
              <Activity className="w-4 h-4 text-indigo-400" />
            )}
          </div>
          <div>
            <div className="text-[11px] font-black uppercase tracking-wide">
              {timing === 'ENTRY_NOW' && '🚀 EXECUTION READY: ENTRY NOW'}
              {timing === 'WAIT_FOR_PULLBACK' && '⏳ DISCIPLINE: WAIT FOR PULLBACK (DO NOT CHASE)'}
              {timing === 'WAIT_FOR_RETEST' && '🔍 PATIENCE: WAIT FOR RETEST CONFIRMATION'}
              {timing === 'WAIT_FOR_CONFIRMATION' && '📊 OBSERVATION: WAIT FOR BREAKOUT TRIGGER'}
              {timing === 'ENTRY_MISSED' && '🛑 ENTRY MISSED: EXTENDED PAST NO-CHASE LIMIT'}
              {timing === 'INVALIDATED' && '❌ SETUP INVALIDATED: STOP LOSS BREACHED'}
              {timing === 'EXPIRED' && '⌛ STALE SETUP: TIME EXPIRED WITHOUT TRIGGER'}
            </div>
            <div className="text-[10px] opacity-90 mt-0.5">
              Timing Window: <strong>{timingWindow.replace(/_/g, ' ')}</strong> • Quality: <strong>{timingQuality}/100</strong>
            </div>
          </div>
        </div>

        {/* Setup Age Badge */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-950/70 border border-slate-800 text-[10px] text-slate-300">
          <Clock className="w-3 h-3 text-cyan-400" />
          <span>Setup Age: <strong>{setupAge}</strong></span>
        </div>
      </div>

      {/* Mathematical Entry Pocket & Anti-Chase Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800">
          <span className="text-[10px] text-slate-500 block uppercase">Ideal Entry</span>
          <span className="text-cyan-300 font-bold">{formatPrice(idealEntry)}</span>
        </div>

        <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800">
          <span className="text-[10px] text-slate-500 block uppercase">Distance to Entry</span>
          <span className={`font-bold ${
            distancePct === undefined
              ? 'text-slate-300'
              : Math.abs(distancePct) <= noChaseThreshold
              ? 'text-emerald-400'
              : distancePct > noChaseThreshold
              ? 'text-amber-400'
              : 'text-cyan-300'
          }`}>
            {distancePct !== undefined ? `${distancePct >= 0 ? '+' : ''}${distancePct.toFixed(2)}%` : '0.00%'}
          </span>
        </div>

        <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800">
          <span className="text-[10px] text-slate-500 block uppercase">No-Chase Limit</span>
          <span className="text-amber-300 font-bold">
            +{noChaseThreshold.toFixed(1)}% Max
          </span>
        </div>

        <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800">
          <span className="text-[10px] text-slate-500 block uppercase">Trigger Status</span>
          <span className={`font-bold ${
            earlyReport?.isTriggered
              ? 'text-emerald-400'
              : maturity === 'NEAR_TRIGGER'
              ? 'text-amber-400'
              : 'text-slate-300'
          }`}>
            {earlyReport?.isTriggered ? 'TRIGGERED ✓' : maturity === 'NEAR_TRIGGER' ? 'APPROACHING' : 'PENDING'}
          </span>
        </div>
      </div>

      {/* Trigger Condition Statement */}
      {triggerCondition && (
        <div className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800 text-[11px] text-slate-300 flex items-start gap-2">
          <Crosshair className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-cyan-300 block text-[10px] uppercase">Execution Trigger Condition:</strong>
            <span>{triggerCondition}</span>
          </div>
        </div>
      )}

      {/* Wyckoff Phase Synergy (if present in early move report) */}
      {earlyReport?.wyckoffSynergy && (
        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-cyan-500/20 text-[11px] flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-cyan-300">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-bold">Wyckoff Confluence:</span>
            <span className="text-slate-200">{earlyReport.wyckoffSynergy.phase} ({earlyReport.wyckoffSynergy.event})</span>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-bold">
            Effort vs Result: {earlyReport.wyckoffSynergy.effortVsResult}
          </span>
        </div>
      )}

      {/* Multi-Timeframe Alignment & Conflict Guard */}
      {earlyReport?.mtfContext && (
        <div className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800 text-[11px] flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">MTF Timing Bias:</span>
            <div className="flex items-center gap-1">
              {earlyReport.mtfContext.timeframes.map((tf) => (
                <span
                  key={tf.timeframe}
                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                    tf.bias === 'BULLISH'
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                      : tf.bias === 'BEARISH'
                      ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {tf.timeframe.toUpperCase()}: {tf.bias}
                </span>
              ))}
            </div>
          </div>

          {earlyReport.mtfContext.hasConflict && (
            <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 text-[10px] font-bold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>TIMING CONFLICT GATED</span>
            </span>
          )}
        </div>
      )}

      {/* Contradiction Warnings (if any) */}
      {earlyReport?.contradictions && earlyReport.contradictions.length > 0 && (
        <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-900/40 text-[11px] text-amber-300/90 space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>TIMING GATING WARNINGS ({earlyReport.contradictions.length})</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[10px]">
            {earlyReport.contradictions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Why This Early Setup Matters */}
      {whyThisMatters && (
        <div className="text-[11px] text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
          <span className="text-cyan-400 font-bold block text-[10px] uppercase mb-0.5">Asymmetric Edge / Structural Advantage:</span>
          <span>{whyThisMatters}</span>
        </div>
      )}
    </div>
  );
};
