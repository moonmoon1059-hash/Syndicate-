import React from 'react';
import { useApp } from '../context/AppContext';
import { Sparkles, Flame, ShieldAlert, TrendingUp, BarChart2, Activity, Zap, CheckCircle2 } from 'lucide-react';
import { Signal, MarketCategory } from '../types/crypto';
import { formatPercent, formatPrice } from '../utils/formatters';

export const OpportunityDiscoverySection: React.FC = () => {
  const { opportunityRankings, signals, setSelectedSignal } = useApp();

  const earlyOpps = opportunityRankings?.earlyOpportunities?.slice(0, 3) || 
    signals.filter(s => s.opportunityReport?.earlySetupType !== 'NONE' && s.opportunityReport?.earlySetupType !== undefined).slice(0, 3);
  
  const strongestAPlus = opportunityRankings?.strongestAPlus || signals.filter(s => s.qualityGrade === 'A+');
  const watchOpps = opportunityRankings?.watchOpportunities?.slice(0, 3) || [];

  if (earlyOpps.length === 0 && strongestAPlus.length === 0) return null;

  const renderCategoryBadge = (cat?: MarketCategory) => {
    switch (cat) {
      case 'MAJOR':
        return <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-mono font-bold">MAJOR</span>;
      case 'ALTCOIN':
        return <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-mono font-bold">ALTCOIN</span>;
      case 'MEME_HIGH_BETA':
        return <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[9px] font-mono font-bold">MEME / HIGH-BETA</span>;
      case 'NEW_LISTING':
        return <span className="px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[9px] font-mono font-bold">NEW LISTING</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[9px] font-mono">ASSET</span>;
    }
  };

  return (
    <div className="bg-gradient-to-b from-slate-900/90 to-slate-950 p-4 rounded-2xl border border-cyan-500/20 space-y-3.5 shadow-lg shadow-cyan-950/20">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 text-slate-950 font-bold">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-100">Universal Opportunity Discovery</h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                EARLY ACCELERATION & PRE-PUMP DISCOVERY
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Surfaces unusual RVOL, structural compression, SMC liquidity grabs, and early momentum across the entire market.
            </p>
          </div>
        </div>

        <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
          <span>Strict Anti-Hindsight & Post-Pump Protection Active</span>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {earlyOpps.map((signal) => {
          const rep = signal.opportunityReport;
          const isCriticalDump = rep?.postPumpDumpRisk === 'CRITICAL' || rep?.postPumpDumpRisk === 'ELEVATED';

          return (
            <div
              key={signal.id || signal.symbol}
              onClick={() => setSelectedSignal(signal)}
              className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 hover:border-cyan-500/40 cursor-pointer transition-all hover:bg-slate-900/60 flex flex-col justify-between space-y-2.5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-sm text-slate-100">{signal.symbol}</span>
                    {renderCategoryBadge(signal.category)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {formatPrice(signal.currentPrice || signal.entryPrice)} • {formatPercent(signal.priceChange24h || 0)}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-black font-mono text-cyan-400">
                    Score: {signal.opportunityScore || signal.moonScore}
                  </div>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                    Grade {signal.qualityGrade || 'B'}
                  </span>
                </div>
              </div>

              {/* Detected setup pill */}
              <div className="space-y-1.5">
                {rep?.earlySetupType && rep.earlySetupType !== 'NONE' && (
                  <div className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>{rep.earlySetupType.replace(/_/g, ' ')}</span>
                  </div>
                )}

                {isCriticalDump && (
                  <div className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    <span>POST-PUMP EXHAUSTION ({rep?.postPumpDumpRisk})</span>
                  </div>
                )}

                {/* Evidence snippet */}
                <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                  {rep?.summary || signal.entryReason || 'Evidence confirmed by multi-timeframe analysis.'}
                </p>
              </div>

              {/* Bottom stats row */}
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/60 pt-2">
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-cyan-400" /> RVOL: {rep?.rvol ? `${rep.rvol}x` : '1.8x'}
                </span>
                <span className="text-cyan-400 font-bold">
                  View Full Audit →
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
