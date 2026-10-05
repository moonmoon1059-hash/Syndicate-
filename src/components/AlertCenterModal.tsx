import React from 'react';
import { X, Bell, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const AlertCenterModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

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
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-100">Alert Center</h3>
            <div className="text-xs text-slate-400 font-mono">Real-time Breakout & TP Notifications</div>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800">
            <div>
              <div className="text-xs font-semibold text-slate-200">High Confluence Signals (&gt;80 Score)</div>
              <div className="text-[11px] text-slate-400">Instant audio & visual banner alerts</div>
            </div>
            <input type="checkbox" defaultChecked className="toggle-checkbox accent-cyan-400 rounded" />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800">
            <div>
              <div className="text-xs font-semibold text-slate-200">Take Profit & Stop Loss Hits</div>
              <div className="text-[11px] text-slate-400">Real-time target progression tracking</div>
            </div>
            <input type="checkbox" defaultChecked className="toggle-checkbox accent-cyan-400 rounded" />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800">
            <div>
              <div className="text-xs font-semibold text-slate-200">Breaking High-Impact News</div>
              <div className="text-[11px] text-slate-400">Catalyst intelligence push notifications</div>
            </div>
            <input type="checkbox" defaultChecked className="toggle-checkbox accent-cyan-400 rounded" />
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Save Alert Preferences</span>
        </button>
      </div>
    </div>
  );
};
