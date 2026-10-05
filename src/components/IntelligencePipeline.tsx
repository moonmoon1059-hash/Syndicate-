import React from 'react';
import { ConfluenceItem } from '../types/crypto';
import { CheckCircle2, TrendingUp, Zap, BarChart3, Binary, Newspaper, MinusCircle } from 'lucide-react';

interface Props {
  confluences: ConfluenceItem[];
  moonScore: number;
}

export const IntelligencePipeline: React.FC<Props> = ({ confluences, moonScore }) => {
  const getIcon = (category: string) => {
    switch (category) {
      case 'TREND': return <TrendingUp className="w-3.5 h-3.5" />;
      case 'MOMENTUM': return <Zap className="w-3.5 h-3.5" />;
      case 'VOLUME': return <BarChart3 className="w-3.5 h-3.5" />;
      case 'DERIVATIVES': return <Binary className="w-3.5 h-3.5" />;
      case 'NEWS': return <Newspaper className="w-3.5 h-3.5" />;
      default: return <CheckCircle2 className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800/80 pb-1.5">
        <span className="font-semibold text-slate-300">CONFLUENCE VERIFICATION MATRIX</span>
        <span className="text-emerald-400 font-bold">{moonScore}% VALIDATED</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {confluences.map((item) => {
          const isBull = item.status === 'BULLISH';
          const isBear = item.status === 'BEARISH';
          const badgeClass = isBull 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
            : isBear 
            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
            : 'bg-slate-800/50 text-slate-400 border-slate-700/50';

          return (
            <div
              key={item.id}
              className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/50 border border-slate-800/60 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className={`p-1.5 rounded-md ${badgeClass} border`}>
                  {getIcon(item.category)}
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-200">{item.name}</div>
                  <div className="text-[11px] text-slate-400">{item.description}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${badgeClass}`}>
                  {item.status}
                </span>
                <span className="text-xs font-mono text-slate-400">+{item.score}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
