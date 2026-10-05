import React from 'react';
import { SignalStatus } from '../types/crypto';

interface Props {
  status: SignalStatus;
}

export const StatusBadge: React.FC<Props> = React.memo(({ status }) => {
  switch (status) {
    case 'ACTIVE':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
          ACTIVE
        </span>
      );
    case 'TRIGGERED':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
          TRIGGERED
        </span>
      );
    case 'TP1_HIT':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
          🎯 TP1 HIT
        </span>
      );
    case 'TP2_HIT':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/30 border border-emerald-500/60 text-emerald-200">
          🎯🎯 TP2 HIT
        </span>
      );
    case 'TP3_HIT':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-yellow-500/30 border border-yellow-500/60 text-yellow-200">
          🏆 MAX TP HIT
        </span>
      );
    case 'STOPPED_OUT':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/15 border border-rose-500/30 text-rose-400">
          STOPPED OUT
        </span>
      );
    case 'EXPIRED':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 border border-slate-700 text-slate-400">
          EXPIRED
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400">
          {status}
        </span>
      );
  }
});
