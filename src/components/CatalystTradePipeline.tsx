import React from 'react';
import { CatalystTradePipeline as CatalystPipelineType, Signal, NewsItem } from '../types/crypto';
import { buildCatalystTradePipeline } from '../utils/priorityRanking';
import { formatPrice } from '../utils/formatters';
import {
  Sparkles,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Target,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Layers,
  Zap,
  Clock,
  ShieldCheck,
  Flame,
  Crosshair
} from 'lucide-react';

interface Props {
  pipeline?: CatalystPipelineType | null;
  signal?: Signal | null;
  news?: NewsItem | null;
}

export const CatalystTradePipeline: React.FC<Props> = ({ pipeline: propPipeline, signal, news }) => {
  const pipeline: CatalystPipelineType | null = propPipeline || (signal ? buildCatalystTradePipeline(signal, news) : null);

  if (!pipeline) return null;

  const isBull = pipeline.catalyst.sentiment === 'BULLISH';
  const isBear = pipeline.catalyst.sentiment === 'BEARISH';
  const isConfirmedReaction = pipeline.marketReaction.state === 'CONFIRMED';
  const isRejectedReaction = pipeline.marketReaction.state === 'REJECTED' || pipeline.marketReaction.state === 'CONTRADICTED';

  const classificationConfig = {
    PRE_PUMP_CATALYST_SETUP: {
      label: 'Pre-Pump Catalyst Setup',
      badge: 'PRE-PUMP SETUP',
      bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
      icon: Zap
    },
    CATALYST_CONTINUATION: {
      label: 'Catalyst Trend Continuation',
      badge: 'CONTINUATION',
      bg: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300',
      icon: TrendingUp
    },
    SELL_THE_NEWS: {
      label: 'Sell-The-News Event Risk',
      badge: 'SELL-THE-NEWS',
      bg: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
      icon: AlertTriangle
    },
    POST_PUMP_EXHAUSTION: {
      label: 'Post-Pump Momentum Exhaustion',
      badge: 'EXHAUSTION WARNING',
      bg: 'bg-rose-500/15 border-rose-500/30 text-rose-300',
      icon: Flame
    },
    DUMP_RISK: {
      label: 'Elevated Dump Risk Hazard',
      badge: 'DUMP RISK',
      bg: 'bg-rose-950/40 border-rose-600/50 text-rose-200',
      icon: ShieldAlert
    },
    STANDARD_CATALYST_SWING: {
      label: 'Catalyst Swing Setup',
      badge: 'CATALYST SWING',
      bg: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300',
      icon: Target
    }
  }[pipeline.setupClassification] || {
    label: 'Catalyst Trade Setup',
    badge: 'CATALYST',
    bg: 'bg-slate-800 border-slate-700 text-slate-300',
    icon: Sparkles
  };

  const ClassIcon = classificationConfig.icon;

  return (
    <div className="w-full rounded-2xl bg-slate-950/80 border border-slate-800 p-4 space-y-4 font-mono">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-200 tracking-wide uppercase">
              Catalyst &rarr; Technical &rarr; Execution Pipeline
            </h4>
            <span className="text-[10px] text-slate-400">
              Deterministic 8-step institutional confirmation sequence
            </span>
          </div>
        </div>

        <div className={`px-2.5 py-1 rounded-full text-[10px] font-black border flex items-center gap-1.5 ${classificationConfig.bg}`}>
          <ClassIcon className="w-3.5 h-3.5" />
          <span>{classificationConfig.badge}</span>
        </div>
      </div>

      {/* 8-Step Sequential Workflow Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Step 1: News / Catalyst */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-1.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase mb-1">
              <span>1. News & Catalyst</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                isBull ? 'bg-emerald-500/20 text-emerald-300' : isBear ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-400'
              }`}>
                {pipeline.catalyst.sentiment} ({pipeline.catalyst.impactScore}/100)
              </span>
            </div>
            <p className="text-xs font-bold text-slate-200 line-clamp-2" title={pipeline.catalyst.title}>
              {pipeline.catalyst.title}
            </p>
          </div>
          <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 flex items-center justify-between">
            <span>{pipeline.catalyst.source}</span>
            <span className="text-cyan-400">{pipeline.catalyst.sourceTier}</span>
          </div>
        </div>

        {/* Step 2: Market Reaction */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-1.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase mb-1">
              <span>2. Market Reaction</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                isConfirmedReaction ? 'bg-emerald-500/20 text-emerald-300' : isRejectedReaction ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {pipeline.marketReaction.state.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="text-xs text-slate-300">
              <span className="text-slate-400">RVOL: </span>
              <strong className="text-slate-100">{pipeline.marketReaction.rvolPostEvent}x</strong>
              <span className="text-slate-400 ml-2">Price Δ: </span>
              <strong className={pipeline.marketReaction.priceChangePostPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {pipeline.marketReaction.priceChangePostPct > 0 ? '+' : ''}{pipeline.marketReaction.priceChangePostPct}%
              </strong>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 line-clamp-2 pt-1 border-t border-slate-800/60">
            {pipeline.marketReaction.reactionAnalysis}
          </p>
        </div>

        {/* Step 3: Technical Confirmation */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-1.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase mb-1">
              <span>3. Technical Confirmation</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                pipeline.technicalConfirmation.isConfirmed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
              }`}>
                {pipeline.technicalConfirmation.isConfirmed ? 'CONFIRMED' : 'MONITORING'}
              </span>
            </div>
            <div className="text-xs font-bold text-cyan-300 truncate">
              {pipeline.technicalConfirmation.bosChochStatus}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 truncate">
            {pipeline.technicalConfirmation.orderflowOrCvd}
          </div>
        </div>

        {/* Step 4: Entry Zone */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-1.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase mb-1">
              <span>4. Execution Entry Zone</span>
              <span className="text-emerald-400 font-bold text-[9px]">ZERO CHASE</span>
            </div>
            <div className="text-xs font-bold text-slate-100">
              ${formatPrice(pipeline.entryZone.low)} &ndash; ${formatPrice(pipeline.entryZone.high)}
            </div>
          </div>
          <p className="text-[10px] text-emerald-400/90 pt-1 border-t border-slate-800/60 truncate">
            Ideal: ${formatPrice(pipeline.entryZone.ideal)}
          </p>
        </div>

        {/* Step 5: Stop Loss */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-1.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase mb-1">
              <span>5. Structural Invalidation</span>
              <span className="text-rose-400 font-bold text-[9px]">HARD SL</span>
            </div>
            <div className="text-xs font-bold text-rose-400">
              ${formatPrice(pipeline.stopLoss.price)}
            </div>
          </div>
          <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 truncate" title={pipeline.stopLoss.invalidationBasis}>
            {pipeline.stopLoss.invalidationBasis}
          </p>
        </div>

        {/* Step 6: Take Profit Targets */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-1.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase mb-1">
              <span>6. Take Profit Targets</span>
              <span className="text-cyan-400 font-bold text-[9px]">{pipeline.targets.length} Structural</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap text-xs font-bold">
              {pipeline.targets.map((t, idx) => (
                <span key={t.id || idx} className="px-1.5 py-0.5 rounded bg-slate-950 text-emerald-400 text-[10px] border border-slate-800">
                  {t.label}: ${formatPrice(t.price)}
                </span>
              ))}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 truncate">
            {pipeline.targets[0]?.structuralBasis || 'Structural liquidity pools'}
          </div>
        </div>

        {/* Step 7: Risk : Reward */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-1.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase mb-1">
              <span>7. Realistic R:R</span>
              <span className="text-amber-400 font-bold text-[9px]">ASYMMETRY</span>
            </div>
            <div className="text-sm font-black text-amber-300">
              1 : {pipeline.riskRewardRatio.toFixed(1)}
            </div>
          </div>
          <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 truncate">
            {pipeline.riskRewardRatio >= 3.0 ? 'High-asymmetry setup' : 'Standard swing R:R'}
          </p>
        </div>

        {/* Step 8: Execution & Invalidation Status */}
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-1.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase mb-1">
              <span>8. Execution Status</span>
              <Crosshair className="w-3 h-3 text-cyan-400" />
            </div>
            <div className={`text-xs font-black px-2 py-0.5 rounded w-fit ${
              pipeline.executionStatus === 'ENTRY_NOW'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : pipeline.executionStatus === 'WAIT_FOR_RETEST' || pipeline.executionStatus === 'WAIT_FOR_PULLBACK'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-800 text-slate-400'
            }`}>
              {pipeline.executionStatus.replace(/_/g, ' ')}
            </div>
          </div>
          <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 truncate" title={pipeline.invalidationCriteria}>
            {pipeline.invalidationCriteria}
          </p>
        </div>
      </div>

      {/* Summary Banner */}
      <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-xs text-cyan-200/90 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{pipeline.summary}</span>
        </div>
        <span className="text-[10px] text-cyan-400 font-bold">
          Zero Fabricated Signals • News Is Supporting Evidence Only
        </span>
      </div>
    </div>
  );
};
