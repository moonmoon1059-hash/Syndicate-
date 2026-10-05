import React from 'react';
import { RadarItem } from '../types/crypto';
import { formatPrice, formatPercent } from '../utils/formatters';
import { MoonScoreGauge } from './MoonScoreGauge';
import { X, TrendingUp, TrendingDown, Activity, Zap, Compass } from 'lucide-react';

interface Props {
  item: RadarItem | null;
  onClose: () => void;
  onTriggerScan?: (symbol: string) => void;
}

export const RadarDetailModal: React.FC<Props> = ({ item, onClose, onTriggerScan }) => {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg bg-slate-800/80 text-slate-400 hover:text-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
            <Compass className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-100">{item.symbol}</h3>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span>{formatPrice(item.price)}</span>
              <span className={item.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                ({formatPercent(item.change24h)})
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-around bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 mb-4">
          <MoonScoreGauge score={item.moonScore} size="md" />
          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">1H Trend:</span>
              <span className={`font-semibold ${item.trend1h === 'BULLISH' ? 'text-emerald-400' : 'text-slate-300'}`}>
                {item.trend1h}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">4H Trend:</span>
              <span className={`font-semibold ${item.trend4h === 'BULLISH' ? 'text-emerald-400' : 'text-slate-300'}`}>
                {item.trend4h}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">15M RSI:</span>
              <span className="text-cyan-300 font-semibold">{item.rsi15m}</span>
            </div>
          </div>
        </div>

        {item.activePattern && (
          <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-xs font-mono text-slate-300 mb-5 flex items-center justify-between">
            <span className="text-slate-400">Detected Pattern:</span>
            <span className="text-cyan-400 font-semibold">{item.activePattern}</span>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
          >
            Close Radar
          </button>
          <button
            onClick={() => {
              if (onTriggerScan) onTriggerScan(item.symbol);
              onClose();
            }}
            className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <Zap className="w-4 h-4" />
            <span>Launch Deep Scan</span>
          </button>
        </div>
      </div>
    </div>
  );
};
