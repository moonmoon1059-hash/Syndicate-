import React, { useState } from 'react';
import { UnifiedFusionReport } from '../types/crypto';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Layers,
  Sparkles,
  Gauge,
  Clock,
  Flame,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';

interface Props {
  fusion?: UnifiedFusionReport;
}

export const UnifiedFusionView: React.FC<Props> = ({ fusion }) => {
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (!fusion) {
    return null;
  }

  const {
    finalDecision,
    quality,
    confidence,
    primaryCategory,
    executionState,
    timingWindow,
    marketContext,
    supportingEvidence,
    contradictions,
    riskState,
    largeMoveClass,
    asymmetry,
    reasonSummary,
    scoreBreakdown,
    hasStructuralConfirmation,
    isAntiChaseActive
  } = fusion;

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case 'LONG':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-emerald-950/40';
      case 'SHORT':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-rose-950/40';
      default:
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-amber-950/40';
    }
  };

  const getQualityBadge = (grade: string) => {
    switch (grade) {
      case 'A+':
        return 'bg-gradient-to-r from-amber-500/30 via-emerald-500/30 to-teal-500/30 text-amber-300 border-amber-400 font-black shadow-lg shadow-amber-950/50';
      case 'A':
        return 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 font-bold';
      case 'B':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-semibold';
      case 'C':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'ACCEPTABLE':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-800';
      case 'ELEVATED':
        return 'bg-amber-950/60 text-amber-300 border-amber-800';
      case 'CRITICAL':
        return 'bg-rose-950/80 text-rose-300 border-rose-800 font-bold animate-pulse';
      case 'INVALIDATED':
        return 'bg-slate-900 text-slate-400 border-slate-750';
      default:
        return 'bg-slate-900 text-slate-400 border-slate-800';
    }
  };

  return (
    <div className="p-4 rounded-xl bg-slate-950/90 border border-cyan-500/40 space-y-4 font-mono text-xs shadow-xl shadow-cyan-950/10">
      {/* Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-slate-100 flex items-center gap-2">
              <span>UNIFIED INTELLIGENCE FUSION</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-medium">
                Phase 16 Final Authority
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-normal">
              One Coin = One Current Unified Decision • Deterministic Multi-Layer Confluence
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Final Decision */}
          <span className={`px-2.5 py-1 rounded-lg border text-xs font-black shadow ${getDecisionBadge(finalDecision)}`}>
            {finalDecision}
          </span>
          {/* Quality Grade */}
          <span className={`px-2 py-1 rounded-lg border text-xs ${getQualityBadge(quality)}`}>
            Grade: {quality}
          </span>
          {/* Confidence */}
          <span className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-cyan-300 font-bold">
            {confidence}% Conf
          </span>
        </div>
      </div>

      {/* Reason Summary Callout */}
      <div className={`p-3 rounded-lg border ${
        finalDecision === 'WAIT'
          ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
          : finalDecision === 'LONG'
          ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
          : 'bg-rose-950/20 border-rose-800/40 text-rose-200'
      }`}>
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <strong>Fusion Verdict:</strong> {reasonSummary}
          </div>
        </div>
      </div>

      {/* Context & State Badges Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] text-slate-400 block uppercase">Primary Category</span>
          <span className="font-bold text-slate-200 truncate block mt-0.5">
            {primaryCategory.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] text-slate-400 block uppercase">Execution Timing</span>
          <span className={`font-bold block mt-0.5 ${
            executionState === 'READY_NOW' ? 'text-emerald-400' : 'text-slate-200'
          }`}>
            {String(executionState).replace(/_/g, ' ')}
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] text-slate-400 block uppercase">Risk State</span>
          <span className={`px-1.5 py-0.5 rounded border inline-block mt-0.5 text-[10px] ${getRiskBadge(riskState)}`}>
            {riskState}
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
          <span className="text-[10px] text-slate-400 block uppercase">Structure Confirmation</span>
          <span className={`font-bold block mt-0.5 ${
            hasStructuralConfirmation ? 'text-emerald-400' : 'text-amber-400'
          }`}>
            {hasStructuralConfirmation ? 'CONFIRMED ✓' : 'UNCONFIRMED'}
          </span>
        </div>
      </div>

      {/* Market Context Bar */}
      <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-[11px] text-slate-300">
        <div className="flex items-center gap-3 flex-wrap">
          <span><strong className="text-slate-500">BTC Regime:</strong> {marketContext.btcRegime}</span>
          <span><strong className="text-slate-500">Cycle:</strong> {marketContext.marketCycle}</span>
          {marketContext.sectorBias && (
            <span><strong className="text-slate-500">Sector Flow:</strong> {marketContext.sectorBias}</span>
          )}
        </div>
        {largeMoveClass && (
          <div className="flex items-center gap-1 text-amber-300">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Opportunity: {largeMoveClass.replace(/_/g, ' ')} ({asymmetry || 0} pts)</span>
          </div>
        )}
      </div>

      {/* Supporting Evidence vs Contradictions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* Supporting Evidence */}
        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 space-y-1.5">
          <div className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Supporting Evidence ({supportingEvidence.length})
          </div>
          {supportingEvidence.length > 0 ? (
            <div className="space-y-1">
              {supportingEvidence.map((item, idx) => (
                <div key={idx} className="text-[11px] text-slate-300 flex items-start gap-1.5">
                  <span className="text-emerald-400 shrink-0">✓</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 italic">No strong directional confirmation logged.</div>
          )}
        </div>

        {/* Contradictions / Warnings */}
        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 space-y-1.5">
          <div className="text-[10px] font-bold text-rose-400 uppercase flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Contradictions & Risks ({contradictions.length})
          </div>
          {contradictions.length > 0 ? (
            <div className="space-y-1">
              {contradictions.map((item, idx) => (
                <div key={idx} className="text-[11px] text-rose-300/90 flex items-start gap-1.5">
                  <span className="text-rose-400 shrink-0">⚠</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-emerald-400/90 italic flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Zero structural or macro contradictions detected.
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Deterministic Score Factor Breakdown */}
      <div className="pt-1">
        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-[11px] text-slate-400 transition-colors"
        >
          <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            <span>Deterministic 9-Factor Score Audit (Bounded: {scoreBreakdown.boundedScore}/100)</span>
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <span>{showBreakdown ? 'Hide Breakdown' : 'Show Breakdown'}</span>
            {showBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        </button>

        {showBreakdown && (
          <div className="mt-2 p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2 text-[11px]">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">1. Directional Evidence</span>
                <span className="text-emerald-400 font-bold">+{scoreBreakdown.directionalEvidenceScore} / 25 pts</span>
              </div>
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">2. Structural Confirmation</span>
                <span className="text-cyan-300 font-bold">+{scoreBreakdown.structuralConfirmationScore} / 25 pts</span>
              </div>
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">3. Macro & Regime</span>
                <span className="text-indigo-300 font-bold">+{scoreBreakdown.marketRegimeScore} / 15 pts</span>
              </div>
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">4. Derivatives Crowding</span>
                <span className="text-purple-300 font-bold">+{scoreBreakdown.derivativesCrowdingScore} / 10 pts</span>
              </div>
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">5. Catalyst / News</span>
                <span className="text-sky-300 font-bold">+{scoreBreakdown.catalystScore} / 10 pts</span>
              </div>
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">6. Timing / Entry</span>
                <span className="text-teal-300 font-bold">+{scoreBreakdown.timingQualityScore} / 10 pts</span>
              </div>
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">7. Risk / Invalidation</span>
                <span className="text-amber-300 font-bold">+{scoreBreakdown.riskInvalidationScore} / 5 pts</span>
              </div>
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">8. Contradiction Penalty</span>
                <span className="text-rose-400 font-bold">-{scoreBreakdown.contradictionPenalty} pts</span>
              </div>
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">9. Data Quality Penalty</span>
                <span className="text-rose-400 font-bold">-{scoreBreakdown.dataQualityPenalty} pts</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span>Raw Score: <strong className="text-slate-200">{scoreBreakdown.rawScore} pts</strong></span>
              <span>Final Bounded Score: <strong className="text-cyan-300">{scoreBreakdown.boundedScore}/100</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
