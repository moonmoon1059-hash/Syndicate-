import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Shield, 
  HelpCircle, 
  Sliders, 
  DollarSign, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  Check
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';

interface AutoTradeConfigCardProps {
  currentMarginType: 'CROSS' | 'ISOLATED' | 'CROSSED';
  currentMargin: number;
  currentLeverage: number;
  isSaving: boolean;
  disabled?: boolean;
  onUpdateParam: (updates: Record<string, any>) => Promise<void>;
}

export const AutoTradeConfigCard: React.FC<AutoTradeConfigCardProps> = ({
  currentMarginType,
  currentMargin,
  currentLeverage,
  isSaving,
  disabled = false,
  onUpdateParam
}) => {
  const { summary } = useTrading();

  // Local states for immediate fluid typing
  const [marginInput, setMarginInput] = useState<string>(String(currentMargin ?? 50));
  const [leverageInput, setLeverageInput] = useState<number>(currentLeverage ?? 20);
  const [activeTooltip, setActiveTooltip] = useState<'CROSS' | 'ISOLATED' | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Sync with prop updates
  useEffect(() => {
    setMarginInput(String(currentMargin ?? 50));
  }, [currentMargin]);

  useEffect(() => {
    setLeverageInput(currentLeverage ?? 20);
  }, [currentLeverage]);

  // Derived calculations
  const parsedMargin = parseFloat(marginInput) || 0;
  const parsedLeverage = Math.max(1, Math.min(150, Math.round(leverageInput || 1)));
  const positionNotional = parsedMargin * parsedLeverage;
  const isNotionalValid = positionNotional >= 5.0;

  const normalizedMarginType = currentMarginType === 'ISOLATED' ? 'ISOLATED' : 'CROSS';

  // Handle Margin Type switch
  const handleMarginTypeChange = async (type: 'CROSS' | 'ISOLATED') => {
    if (disabled || isSaving) return;
    try {
      await onUpdateParam({ marginType: type });
      triggerSuccessBadge();
    } catch {
      // handled by parent feedback
    }
  };

  // Commit margin on blur or enter
  const commitMargin = async (value: number) => {
    if (disabled || isSaving) return;
    const cleanValue = Math.max(0.1, Number(value.toFixed(2)));
    if (cleanValue === currentMargin) return;
    try {
      await onUpdateParam({ marginPerTrade: cleanValue });
      triggerSuccessBadge();
    } catch {
      // handled by parent
    }
  };

  // Commit leverage on change
  const commitLeverage = async (lev: number) => {
    if (disabled || isSaving) return;
    const cleanLev = Math.max(1, Math.min(150, Math.round(lev)));
    if (cleanLev === currentLeverage) return;
    try {
      await onUpdateParam({ leverage: cleanLev, maxLeverage: cleanLev });
      triggerSuccessBadge();
    } catch {
      // handled by parent
    }
  };

  const triggerSuccessBadge = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Quick margin helpers
  const handleQuickMarginAdd = (delta: number) => {
    const next = Math.max(1, (parseFloat(marginInput) || 0) + delta);
    setMarginInput(String(next));
    commitMargin(next);
  };

  const handleSetQuickMargin = (amt: number) => {
    setMarginInput(String(amt));
    commitMargin(amt);
  };

  // Risk profile coloring for leverage
  const getLeverageColor = (lev: number) => {
    if (lev <= 10) return 'text-emerald-400 border-emerald-500/40 bg-emerald-950/30';
    if (lev <= 25) return 'text-cyan-400 border-cyan-500/40 bg-cyan-950/30';
    if (lev <= 40) return 'text-amber-400 border-amber-500/40 bg-amber-950/30';
    return 'text-rose-400 border-rose-500/40 bg-rose-950/30';
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-xl backdrop-blur-sm space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                Margin Mode & Dynamic Sizing Controls
              </h2>
              {saveSuccess && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30 animate-fadeIn">
                  <Check className="w-3 h-3" /> Saved
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Configure unrestricted margin allocation, precise 1x–50x leverage, and Binance cross vs isolated safety mode.
            </p>
          </div>
        </div>

        {/* Live Calculation Pill */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl font-mono text-xs">
          <span className="text-slate-400">Position Notional:</span>
          <span className={`font-bold ${isNotionalValid ? 'text-emerald-400' : 'text-amber-400'}`}>
            ${positionNotional.toFixed(2)} USDT
          </span>
        </div>
      </div>

      {/* Main Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* SECTION 1: MARGIN MODE SWITCHER (CROSS VS ISOLATED) */}
        <div className="lg:col-span-4 flex flex-col justify-between p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 tracking-wide uppercase flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                Margin Safety Mode
              </span>
              <span className="text-[10px] font-mono text-slate-400">Binance Futures Sync</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Select how Binance handles position liquidation & collateral pool.
            </p>
          </div>

          {/* Mode Switcher Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {/* CROSS MARGIN */}
            <button
              type="button"
              onClick={() => handleMarginTypeChange('CROSS')}
              disabled={disabled || isSaving}
              onMouseEnter={() => setActiveTooltip('CROSS')}
              onMouseLeave={() => setActiveTooltip(null)}
              className={`relative py-2.5 px-3 rounded-xl text-xs font-bold font-mono transition-all flex flex-col items-center justify-center gap-1 cursor-pointer border ${
                normalizedMarginType === 'CROSS'
                  ? 'bg-gradient-to-b from-cyan-950/80 to-slate-900 border-cyan-400 text-cyan-200 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-400/50'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Zap className={`w-4 h-4 ${normalizedMarginType === 'CROSS' ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
                <span>CROSS MARGIN</span>
              </div>
              <span className="text-[10px] font-normal text-slate-400">Shared Pool</span>
            </button>

            {/* ISOLATED MARGIN */}
            <button
              type="button"
              onClick={() => handleMarginTypeChange('ISOLATED')}
              disabled={disabled || isSaving}
              onMouseEnter={() => setActiveTooltip('ISOLATED')}
              onMouseLeave={() => setActiveTooltip(null)}
              className={`relative py-2.5 px-3 rounded-xl text-xs font-bold font-mono transition-all flex flex-col items-center justify-center gap-1 cursor-pointer border ${
                normalizedMarginType === 'ISOLATED'
                  ? 'bg-gradient-to-b from-emerald-950/80 to-slate-900 border-emerald-400 text-emerald-200 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-400/50'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Shield className={`w-4 h-4 ${normalizedMarginType === 'ISOLATED' ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>ISOLATED MARGIN</span>
              </div>
              <span className="text-[10px] font-normal text-slate-400">Strict Cap</span>
            </button>
          </div>

          {/* Explanatory Tooltip Box */}
          <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5 text-[11px] leading-relaxed transition-all">
            {normalizedMarginType === 'CROSS' ? (
              <div className="flex items-start gap-2 text-cyan-300/90">
                <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  <strong>⚡ Cross Margin:</strong> Shares balance across all open positions. Protects against unexpected liquidity wicks and high volatility.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-emerald-300/90">
                <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>🛡️ Isolated Margin:</strong> Caps maximum risk strictly to the allocated margin (e.g. only ${parsedMargin || 2} at risk). Protects remaining wallet balance.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: UNRESTRICTED DUAL SLIDER & TYPING MARGIN INPUT */}
        <div className="lg:col-span-4 flex flex-col justify-between p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="custom-margin-input" className="text-xs font-bold text-slate-300 tracking-wide uppercase flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
                Margin per Trade (USDT)
              </label>
              <span className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                ${parsedMargin.toFixed(2)} USDT
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Dual-input control: Slide smoothly or type any custom dollar amount.
            </p>
          </div>

          {/* Dual Input Controls: Numeric Input + Range Slider */}
          <div className="space-y-3">
            {/* Direct Numeric Input with floating-point support */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-mono text-sm font-bold pointer-events-none">
                $
              </span>
              <input
                id="custom-margin-input"
                type="number"
                step="any"
                min="0.1"
                max="5000"
                disabled={disabled || isSaving}
                value={marginInput}
                onChange={(e) => {
                  setMarginInput(e.target.value);
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val > 0) {
                    commitMargin(val);
                  }
                }}
                onBlur={() => commitMargin(parseFloat(marginInput) || 2)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitMargin(parseFloat(marginInput) || 2);
                  }
                }}
                placeholder="Enter custom margin ($)"
                className="w-full pl-7 pr-16 py-2.5 bg-slate-900 border border-slate-700 hover:border-cyan-500/50 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 rounded-xl font-mono text-white font-bold text-base transition-all outline-none"
              />
              <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 font-mono text-xs pointer-events-none">
                USDT
              </span>
            </div>

            {/* Smooth Margin Range Slider */}
            <div className="space-y-1.5 pt-1">
              <input
                type="range"
                min="1"
                max="500"
                step="1"
                disabled={disabled || isSaving}
                value={Math.min(500, Math.max(1, parsedMargin))}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMarginInput(String(val));
                  commitMargin(val);
                }}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
              />
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>$1</span>
                <span>$100</span>
                <span>$250</span>
                <span>$500+</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/60 pt-1.5">
            <span>Capital at Risk:</span>
            <span className="text-slate-300 font-bold">
              ${parsedMargin.toFixed(2)} USDT ({((parsedMargin / Math.max(1, (summary?.balances?.available || 1000))) * 100).toFixed(1)}% of Avail)
            </span>
          </div>
        </div>

        {/* SECTION 3: FULL DUAL SLIDER & TYPING LEVERAGE INPUT (1x to 125x) */}
        <div className="lg:col-span-4 flex flex-col justify-between p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="custom-leverage-input" className="text-xs font-bold text-slate-300 tracking-wide uppercase flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                Custom Leverage (1x – 150x)
              </label>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-bold ${getLeverageColor(parsedLeverage)}`}>
                {parsedLeverage}x MULTIPLIER
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Dual-input control: Slide smoothly or type exact leverage multiplier.
            </p>
          </div>

          <div className="space-y-3">
            {/* Direct Number Input Box */}
            <div className="relative">
              <input
                id="custom-leverage-input"
                type="number"
                min="1"
                max="150"
                step="1"
                disabled={disabled || isSaving}
                value={leverageInput}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setLeverageInput(val);
                  if (val >= 1 && val <= 150) {
                    commitLeverage(val);
                  }
                }}
                onBlur={() => commitLeverage(leverageInput)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitLeverage(leverageInput);
                  }
                }}
                placeholder="Enter leverage"
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 hover:border-cyan-500/50 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 rounded-xl font-mono text-center font-bold text-white text-base outline-none"
              />
              <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 font-mono text-sm pointer-events-none font-bold">
                x
              </span>
            </div>

            {/* Smooth Leverage Range Slider */}
            <div className="space-y-1.5 pt-1">
              <input
                type="range"
                min="1"
                max="150"
                step="1"
                disabled={disabled || isSaving}
                value={Math.min(150, Math.max(1, leverageInput))}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setLeverageInput(val);
                  commitLeverage(val);
                }}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
              />
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>1x (Spot)</span>
                <span>20x (Standard)</span>
                <span>50x (Scalp)</span>
                <span>150x (Extreme)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/60 pt-1.5">
            <span>Risk Tier:</span>
            <span className={parsedLeverage > 25 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
              {parsedLeverage <= 10 ? 'Conservative (Low Drawdown)' : (parsedLeverage <= 25 ? 'Institutional Standard' : parsedLeverage <= 50 ? 'High Scalp Volatility' : 'Extreme Leverage (Sub-cent Memes)')}
            </span>
          </div>
        </div>

      </div>

      {/* Real-Time Helper Notional Display Bar */}
      <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition-all ${
        isNotionalValid
          ? 'bg-slate-950/70 border-slate-800/80'
          : 'bg-amber-950/30 border-amber-500/40 text-amber-300'
      }`}>
        <div className="flex items-center gap-2">
          {isNotionalValid ? (
            <div className="p-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          ) : (
            <div className="p-1.5 rounded-lg bg-amber-950/60 border border-amber-500/30 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          )}
          <div>
            <div className="font-bold flex items-center gap-2">
              <span>Position Sizing Calculation:</span>
              <span className="font-mono text-cyan-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                ${parsedMargin.toFixed(2)} Margin × {parsedLeverage}x Leverage = ${positionNotional.toFixed(2)} USDT Notional
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isNotionalValid
                ? 'Meets Binance minimum notional requirement (≥ $5.00 USDT). Order will execute cleanly.'
                : 'Position notional is below Binance minimum $5.00 requirement. Increase margin or leverage to prevent execution rejection.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
          <span className="text-slate-400">Active Mode:</span>
          <span className={`px-2 py-0.5 rounded-md font-bold border ${
            normalizedMarginType === 'ISOLATED'
              ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400'
              : 'bg-cyan-950/60 border-cyan-500/30 text-cyan-400'
          }`}>
            {normalizedMarginType}
          </span>
        </div>
      </div>
    </div>
  );
};

export default AutoTradeConfigCard;
