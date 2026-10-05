import React from 'react';
import { Signal, PrimarySetupCategory } from '../types/crypto';
import { formatBangladeshTime, formatPrice } from '../utils/formatters';
import {
  Layers,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Shield,
  Activity,
  History,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface Props {
  signal: Signal;
}

export const CategoryIntelligenceView: React.FC<Props> = ({ signal }) => {
  const catReport = signal.categoryIntelligence;
  const primaryCategory = signal.primaryCategory || catReport?.primaryCategory || (signal.direction === 'LONG' ? 'EARLY_LONG' : 'EARLY_SHORT');
  const categoryConfluences = signal.categoryConfluences || catReport?.categoryConfluences || [];
  const transitionHistory = signal.categoryTransitionHistory || catReport?.transitionHistory || [];
  const direction = signal.direction;
  const isLong = direction === 'LONG';
  const isWait = direction === 'WAIT';

  const executionTiming = signal.smartEntryTiming || signal.entryStatus || 'WAIT_FOR_CONFIRMATION';
  const cycle = signal.marketCycle?.cycle || signal.earlyMoveReport?.cycleContext?.cycle || 'MARKUP';

  const getCategoryColor = (cat: PrimarySetupCategory) => {
    if (cat.endsWith('_LONG')) {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
    if (cat.endsWith('_SHORT')) {
      return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }
    return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  };

  return (
    <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4 font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="text-slate-200 font-bold tracking-wide">
            PHASE 12: PRIMARY SETUP CATEGORY INTELLIGENCE
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${getCategoryColor(primaryCategory)}`}>
          {primaryCategory.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Primary Flow Chain: Direction → Primary Category → Execution/Timing → Cycle */}
      <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
        <span className="text-[10px] text-slate-400 font-semibold block mb-2 uppercase">
          Unified Setup Progression Architecture
        </span>
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          {/* Direction */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
            {isLong ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            ) : isWait ? (
              <Shield className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span className="text-slate-400 text-[10px]">DIR:</span>
            <span className={`font-bold ${isLong ? 'text-emerald-300' : isWait ? 'text-amber-300' : 'text-rose-300'}`}>
              {direction}
            </span>
          </div>

          <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

          {/* Primary Category */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-slate-400 text-[10px]">SETUP:</span>
            <span className="font-bold text-cyan-300">
              {primaryCategory.replace(/_/g, ' ')}
            </span>
          </div>

          <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

          {/* Execution / Timing */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-slate-400 text-[10px]">EXEC:</span>
            <span className="font-bold text-indigo-300">
              {String(executionTiming).replace(/_/g, ' ')}
            </span>
          </div>

          <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

          {/* Market Cycle */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-slate-400 text-[10px]">CYCLE:</span>
            <span className="font-bold text-purple-300">
              {String(cycle).replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      </div>

      {/* Setup Category Reasoning & Confluences */}
      <div className="space-y-2">
        {catReport?.reasoning && (
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] text-slate-300">
            <span className="text-cyan-400 font-bold block mb-1">RATIONALE & EVIDENCE:</span>
            <p className="leading-relaxed">{catReport.reasoning}</p>
          </div>
        )}

        {/* Secondary Category Confluences */}
        {categoryConfluences.length > 0 && (
          <div className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800">
            <span className="text-[10px] text-slate-400 block mb-1.5 uppercase font-semibold">
              Confluent Setup Alignments ({categoryConfluences.length})
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {categoryConfluences.map((cat, idx) => (
                <span
                  key={idx}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getCategoryColor(cat)}`}
                >
                  {cat.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Structural Triggers */}
        {catReport?.structuralTriggers && catReport.structuralTriggers.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">
              Structural Triggers Detected:
            </span>
            <div className="space-y-1">
              {catReport.structuralTriggers.map((trig, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-slate-300 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{trig}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Category Progression & Transitions for SAME Opportunity */}
      {transitionHistory.length > 0 && (
        <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-slate-300 font-bold text-xs">
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span>OPPORTUNITY PROGRESSION HISTORY ({transitionHistory.length})</span>
          </div>
          <div className="space-y-1.5">
            {transitionHistory.map((tr, idx) => (
              <div
                key={idx}
                className="p-2 rounded bg-slate-950 border border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-[11px]"
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="text-slate-400">{tr.fromCategory.replace(/_/g, ' ')}</span>
                  <ArrowRight className="w-3 h-3 text-cyan-400" />
                  <span className="text-emerald-400">{tr.toCategory.replace(/_/g, ' ')}</span>
                </div>
                {tr.price && (
                  <span className="text-slate-400 font-mono text-[10px]">
                    @ {formatPrice(tr.price)}
                  </span>
                )}
                {tr.timestamp && (
                  <span className="text-slate-500 font-mono text-[10px]">
                    {formatBangladeshTime(tr.timestamp)}
                  </span>
                )}
                <div className="w-full text-slate-400 text-[10px] mt-0.5">
                  {tr.reason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
