import React, { useEffect, useState } from 'react';
import { X, History, TrendingUp, TrendingDown, ShieldCheck, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { formatPrice } from '../utils/formatters';

export interface ClosedTradeRecord {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
  tp4?: number;
  outcome: 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'TP4_HIT' | 'STOPPED_OUT' | 'BREAK_EVEN';
  pnlPct: number;
  riskRewardAchieved: number;
  entryTimestamp: number;
  exitTimestamp: number;
  exitTimestampFormatted: string;
  notes?: string;
  source: 'SUPERNOVA' | 'TERMINAL';
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const TradeHistoryModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [history, setHistory] = useState<ClosedTradeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterSource, setFilterSource] = useState<'ALL' | 'SUPERNOVA' | 'TERMINAL'>('ALL');

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/trade-history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) {
      console.warn('Failed to fetch trade history:', e);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const filteredHistory = history.filter(item => {
    if (filterSource === 'SUPERNOVA') return item.source === 'SUPERNOVA';
    if (filterSource === 'TERMINAL') return item.source === 'TERMINAL';
    return true;
  });

  const totalClosed = filteredHistory.length;
  const wins = filteredHistory.filter(h => h.outcome.startsWith('TP')).length;
  const losses = filteredHistory.filter(h => h.outcome === 'STOPPED_OUT').length;
  const breakEvens = filteredHistory.filter(h => h.outcome === 'BREAK_EVEN').length;
  const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '100.0';
  const totalPnl = filteredHistory.reduce((acc, h) => acc + (h.pnlPct || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black font-mono text-white flex items-center gap-2">
                Closed Trades & Audit Log
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Permanent trade ledger with Bangladesh Local Time (Asia/Dhaka UTC+6) audit
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Aggregate Stats Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-slate-950/40 border-b border-slate-800/60 text-center font-mono">
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Total Closed</div>
            <div className="text-base font-black text-white mt-0.5">{totalClosed}</div>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Win Rate</div>
            <div className="text-base font-black text-emerald-400 mt-0.5">{winRate}%</div>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Wins / BE / SL</div>
            <div className="text-base font-black text-slate-200 mt-0.5">
              <span className="text-emerald-400">{wins}</span> / <span className="text-cyan-400">{breakEvens}</span> / <span className="text-rose-400">{losses}</span>
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Cum. Net PnL</div>
            <div className={`text-base font-black mt-0.5 ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalPnl >= 0 ? `+${totalPnl.toFixed(1)}%` : `${totalPnl.toFixed(1)}%`}
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800/60 bg-slate-900/40">
          <span className="text-xs font-mono text-slate-400">Filter Source:</span>
          {(['ALL', 'SUPERNOVA', 'TERMINAL'] as const).map(src => (
            <button
              key={src}
              onClick={() => setFilterSource(src)}
              className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition-all ${
                filterSource === src
                  ? 'bg-cyan-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white bg-slate-800/40'
              }`}
            >
              {src === 'ALL' ? 'All Sources' : src === 'SUPERNOVA' ? '🔥 Supernova Only' : '📊 Terminal Only'}
            </button>
          ))}
        </div>

        {/* Table / List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-12 text-slate-400 font-mono text-xs">
              Loading verified audit logs...
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <ShieldCheck className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="text-sm font-bold font-mono text-slate-400">
                No Closed Trades Recorded Yet
              </div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto font-mono">
                Trades that hit TP targets, touch zero-loss break-even, or exit are permanently archived here.
              </p>
            </div>
          ) : (
            filteredHistory.map(trade => {
              const isProfit = trade.pnlPct > 0;
              const isBE = trade.outcome === 'BREAK_EVEN';
              return (
                <div
                  key={trade.id}
                  className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all font-mono space-y-2"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white">#{trade.symbol}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                        trade.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        {trade.direction}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300">
                        {trade.source}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className={`text-sm font-black ${
                        isProfit ? 'text-emerald-400' : isBE ? 'text-cyan-400' : 'text-rose-400'
                      }`}>
                        {isProfit ? `+${trade.pnlPct.toFixed(2)}%` : isBE ? '0.0% (Break-Even)' : `${trade.pnlPct.toFixed(2)}%`}
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                        trade.outcome.startsWith('TP')
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : isBE
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      }`}>
                        {trade.outcome.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 text-slate-400 border-t border-slate-800/60">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Entry Price:</span>
                      <span className="text-slate-200 font-bold">${formatPrice(trade.entryPrice)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Exit / SL:</span>
                      <span className="text-slate-200 font-bold">${formatPrice(trade.exitPrice)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Achieved R:R:</span>
                      <span className="text-slate-200 font-bold">1:{trade.riskRewardAchieved?.toFixed(1) || '2.5'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Exit Time (Dhaka):</span>
                      <span className="text-slate-300 font-mono text-[11px]">{trade.exitTimestampFormatted}</span>
                    </div>
                  </div>

                  {trade.notes && (
                    <div className="text-[11px] text-slate-400 italic pt-1">
                      ℹ️ {trade.notes}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
