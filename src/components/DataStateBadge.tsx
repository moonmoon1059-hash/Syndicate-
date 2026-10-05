import React from 'react';
import { Activity, Wifi, AlertTriangle } from 'lucide-react';

interface Props {
  state: 'LIVE' | 'SYNCING' | 'CACHED' | 'DISCONNECTED';
}

export const DataStateBadge: React.FC<Props> = React.memo(({ state }) => {
  if (state === 'LIVE') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>LIVE FEED</span>
      </div>
    );
  }
  if (state === 'SYNCING') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono">
        <Activity className="w-3 h-3 animate-spin" />
        <span>SCANNING</span>
      </div>
    );
  }
  if (state === 'CACHED') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-mono">
        <Wifi className="w-3 h-3 text-blue-400" />
        <span>CACHED</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
      <AlertTriangle className="w-3 h-3" />
      <span>OFFLINE</span>
    </div>
  );
});
