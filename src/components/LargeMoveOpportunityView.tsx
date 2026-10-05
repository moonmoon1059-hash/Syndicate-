import React from 'react';
import { LargeMoveOpportunityReport } from '../types/crypto';
import {
  Flame,
  Zap,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Activity,
  DollarSign,
  Scale,
  Gauge
} from 'lucide-react';

interface Props {
  report?: LargeMoveOpportunityReport;
}

export const LargeMoveOpportunityView: React.FC<Props> = ({ report }) => {
  if (!report || report.moveClass === 'UNKNOWN' && report.crowdingState === 'UNAVAILABLE') {
    return null;
  }

  const getMoveClassBadge = (moveClass: string) => {
    switch (moveClass) {
      case '100_PERCENT_PLUS':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/50 font-black';
      case '50_PERCENT_PLUS':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-black';
      case 'EXTREME_ASYMMETRY':
        return 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 font-black';
      case '20_PERCENT_PLUS':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold';
      case '10_PERCENT_PLUS':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold';
      case 'NORMAL':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      default:
        return 'bg-slate-850 text-slate-400 border-slate-800';
    }
  };

  const getCrowdingBadge = (crowding: string) => {
    switch (crowding) {
      case 'LONG_CROWDED':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'SHORT_CROWDED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'UNWINDING':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'BALANCED':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      default:
        return 'bg-slate-900 text-slate-500 border-slate-800';
    }
  };

  const getExhaustionBadge = (exhaustion: string) => {
    switch (exhaustion) {
      case 'PUMP_EXHAUSTION':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'DUMP_EXHAUSTION':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      default:
        return 'bg-slate-850 text-slate-400 border-slate-750';
    }
  };

  const getAlignmentStyle = (alignment: string) => {
    switch (alignment) {
      case 'SUPPORTS_LONG':
        return 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
      case 'SUPPORTS_SHORT':
        return 'text-rose-300 border-rose-500/40 bg-rose-500/10';
      case 'CONTRADICTS_SETUP':
      case 'HIGH_RISK_WARNING':
        return 'text-rose-400 border-rose-500/40 bg-rose-500/20 font-bold';
      default:
        return 'text-slate-300 border-slate-700 bg-slate-800/40';
    }
  };

  return (
    <div className="mb-6 p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 shadow-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              Large Move & Asymmetry Intelligence
            </h4>
            <p className="text-[11px] text-slate-400">
              Derivatives Crowding + Pump/Dump Exhaustion + Structural Move Potential
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Large Move Class */}
          <span className={`px-2.5 py-1 rounded-md text-xs font-mono border flex items-center gap-1.5 ${getMoveClassBadge(report.moveClass)}`}>
            <Zap className="w-3 h-3" />
            {report.moveClass.replace(/_PERCENT_PLUS/, '%+').replace(/_/g, ' ')}
          </span>

          {/* Asymmetry Score */}
          <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-slate-900 border border-slate-750 text-amber-300 flex items-center gap-1">
            <Scale className="w-3 h-3 text-amber-400" />
            Asymmetry: {report.asymmetryScore}/100
          </span>

          {/* Confluence Alignment */}
          <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${getAlignmentStyle(report.confluenceAlignment)}`}>
            {report.confluenceAlignment.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Grid: Crowding & Derivatives Telemetry */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <span className="text-[10px] text-slate-400 block mb-0.5">POSITIONING CROWD</span>
          <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold border inline-block ${getCrowdingBadge(report.crowdingState)}`}>
            {report.crowdingState.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <span className="text-[10px] text-slate-400 block mb-0.5">FUNDING RATE (8h)</span>
          <div className="flex items-center gap-1">
            <span className="font-bold text-slate-200">
              {report.fundingRate !== null ? `${(report.fundingRate * 100).toFixed(4)}%` : 'UNAVAILABLE'}
            </span>
            {report.fundingExtremity !== 'UNKNOWN' && report.fundingExtremity !== 'NEUTRAL' && (
              <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {report.fundingExtremity.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <span className="text-[10px] text-slate-400 block mb-0.5">OPEN INTEREST VELOCITY</span>
          <div className="flex items-center gap-1">
            <span className="font-bold text-slate-200">
              {report.oiChange24h !== null ? `${report.oiChange24h >= 0 ? '+' : ''}${report.oiChange24h.toFixed(1)}%` : 'UNAVAILABLE'}
            </span>
            {report.oiState !== 'UNKNOWN' && (
              <span className={`text-[9px] px-1 py-0.2 rounded border ${
                report.oiState === 'RAPID_EXPANSION'
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                  : report.oiState === 'CONTRACTION'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {report.oiState.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <span className="text-[10px] text-slate-400 block mb-0.5">LIQUIDATION SKEW</span>
          <span className={`font-bold ${
            report.liquidationImbalance === 'HEAVY_LONGS'
              ? 'text-rose-400'
              : report.liquidationImbalance === 'HEAVY_SHORTS'
              ? 'text-emerald-400'
              : 'text-slate-300'
          }`}>
            {report.liquidationImbalance.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Grid: Exhaustion & Structural Mechanics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <span className="text-[10px] text-slate-400 block mb-0.5">EXHAUSTION STATE</span>
          <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold border inline-block ${getExhaustionBadge(report.exhaustionState)}`}>
            {report.exhaustionState.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <span className="text-[10px] text-slate-400 block mb-0.5">LIQUIDITY SWEEP</span>
          <span className={`font-bold ${
            report.liquidityAction === 'SWEEP_REJECTION'
              ? 'text-rose-400'
              : report.liquidityAction === 'SWEEP_RECLAIM'
              ? 'text-emerald-400'
              : 'text-slate-400'
          }`}>
            {report.liquidityAction.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <span className="text-[10px] text-slate-400 block mb-0.5">STRUCTURE CONFIRMED</span>
          <span className={`font-bold flex items-center gap-1 ${
            report.structuralConfirmation ? 'text-emerald-400' : 'text-slate-500'
          }`}>
            {report.structuralConfirmation ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                CONFIRMED
              </>
            ) : (
              'AWAITING TRIGGER'
            )}
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <span className="text-[10px] text-slate-400 block mb-0.5">EST. RUNWAY / R:R</span>
          <div className="flex items-center gap-1 font-bold text-slate-200">
            <span>{report.estimatedMovePct !== null ? `+${report.estimatedMovePct.toFixed(1)}%` : 'UNFORMED'}</span>
            <span className="text-slate-500">•</span>
            <span>{report.riskRewardRatio !== null ? `1:${report.riskRewardRatio.toFixed(1)}` : 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* Anti-Chase / Overextension Risk Banner */}
      {report.antiChaseActive && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-rose-300">ANTI-CHASE INVARIANT ACTIVE</span>
            <span>
              Price is already heavily extended from structural base. Large-move classification is restricted to prevent late chasing.
            </span>
          </div>
        </div>
      )}

      {/* Reasoning Summary */}
      <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800/90 text-xs">
        <span className="text-[10px] font-mono text-slate-400 block mb-1">CONFLUENCE EVALUATION</span>
        <p className="text-slate-200 leading-relaxed font-sans">{report.reasoning}</p>
      </div>

      {/* Evidence Tags */}
      {report.evidenceList && report.evidenceList.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono text-slate-400 block uppercase">Telemetry Evidence</span>
          <div className="flex flex-wrap gap-1.5">
            {report.evidenceList.map((ev, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono flex items-center gap-1"
              >
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                {ev}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Risk Warnings */}
      {report.riskWarnings && report.riskWarnings.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-mono text-amber-400/80 block uppercase">Risk Guardrails</span>
          <div className="flex flex-wrap gap-1.5">
            {report.riskWarnings.map((warn, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded bg-amber-950/20 border border-amber-500/30 text-[11px] text-amber-300 font-mono flex items-center gap-1"
              >
                <ShieldAlert className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                {warn}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
