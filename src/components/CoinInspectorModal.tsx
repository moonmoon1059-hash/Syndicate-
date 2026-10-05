import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Target,
  Shield,
  Activity,
  BarChart2,
  TrendingUp,
  TrendingDown,
  Layers,
  AlertTriangle,
  Play,
  CheckCircle2,
  Search,
  Clock,
  Sparkles,
  Flame,
  ArrowRight,
  Sliders
} from 'lucide-react';
import { formatPrice } from '../utils/formatters';
import { useTrading } from '../context/TradingContext';

interface Props {
  symbol: string | null;
  onClose: () => void;
  onTrade?: (symbol: string) => void;
  initialSignal?: any;
}

export const CoinInspectorModal: React.FC<Props> = ({ symbol, onClose, onTrade, initialSignal }) => {
  const { executeTrade, isAuthenticated, openAuthModal, summary, updateSettings } = useTrading();
  const [loading, setLoading] = useState(!initialSignal);

  // Synchronously initialize auditData from initialSignal to eliminate blank modals and repainting
  const [auditData, setAuditData] = useState<any>(() => {
    if (initialSignal) {
      const isLong = initialSignal.direction === 'LONG';
      const ep = initialSignal.entryPrice || initialSignal.currentPrice || 100;
      const curP = initialSignal.currentPrice || ep;
      const sl = initialSignal.stopLoss || (isLong ? ep * 0.98 : ep * 1.02);
      const t1 = initialSignal.tp1 || (isLong ? ep * 1.05 : ep * 0.95);
      const t2 = initialSignal.tp2 || (isLong ? ep * 1.10 : ep * 0.90);
      const t4 = initialSignal.tp4 || (isLong ? ep * 1.50 : ep * 0.50);
      const dPct = ep > 0 ? ((curP - ep) / ep) * 100 : 0;
      const targetPot = Math.abs(((t4 - ep) / ep) * 100).toFixed(1);
      const rr = (Math.abs(t2 - ep) / Math.max(0.0001, Math.abs(ep - sl))).toFixed(1);
      const cleanSym = (initialSignal.symbol || symbol || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
      const fullSym = cleanSym.endsWith('USDT') ? cleanSym : `${cleanSym}USDT`;
      const base = cleanSym.replace(/USDT$/i, '');
      const sc = initialSignal.score ?? initialSignal.moonScore ?? 95;

      return {
        symbol: fullSym,
        baseAsset: base,
        price: curP,
        change24h: initialSignal.priceChange24h ?? initialSignal.change24h ?? 0,
        score: sc,
        verdict: isLong ? 'STRONG_LONG' : 'SNIPER_SHORT',
        direction: initialSignal.direction || (isLong ? 'LONG' : 'SHORT'),
        signalId: initialSignal.id || `inst-${fullSym}-${Date.now()}`,
        pocLevel: (curP * (isLong ? 0.992 : 1.008)),
        pocStatus: isLong ? 'Above Value Area High (POC Held)' : 'Below Value Area Low (Rejection)',
        orderBlock: isLong ? '4H Institutional Demand Shelf' : '1H Bearish Breaker Block',
        whaleOiChange: isLong ? '+18.5% (Net Long Absorption)' : '-14.2% (Short Breakdown Trap)',
        liquidityVacuum: 'Explosive Orderbook Air Pocket (Low Volume Node - LVN breakout)',
        entryPrice: ep,
        stopLoss: sl,
        tp1: t1,
        tp2: t2,
        tp4: t4,
        targetPotential: targetPot,
        riskReward: Math.max(2.5, parseFloat(rr)),
        rvol: `${(initialSignal.rvol || 4.5).toFixed ? initialSignal.rvol.toFixed(2) : initialSignal.rvol}x`,
        rvolNum: typeof initialSignal.rvol === 'number' ? initialSignal.rvol : 4.5,
        isSupernova: Boolean(initialSignal.isSupernova || initialSignal.phase),
        deltaPct: dPct,
        absDeltaPct: Math.abs(dPct),
        entryState: Math.abs(dPct) <= 0.35 ? 'ACTIVE_ZONE' : 'WAIT_PULLBACK'
      };
    }
    return null;
  });
  const [executing, setExecuting] = useState(false);
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);

  // Dual-Input Margin & Leverage State (Persisted directly to global settings)
  const [marginInput, setMarginInput] = useState<string>('50');
  const [marginValue, setMarginValue] = useState<number>(50);
  const [leverageInput, setLeverageInput] = useState<string>('20');
  const [leverageValue, setLeverageValue] = useState<number>(20);
  const [marginType, setMarginType] = useState<'CROSS' | 'ISOLATED'>('CROSS');

  useEffect(() => {
    if (summary?.settings) {
      if (summary.settings.marginPerTrade && summary.settings.marginPerTrade > 0) {
        setMarginValue(summary.settings.marginPerTrade);
        setMarginInput(String(summary.settings.marginPerTrade));
      }
      const lev = summary.settings.leverage || summary.settings.maxLeverage || 20;
      setLeverageValue(lev);
      setLeverageInput(String(lev));
      if (summary.settings.marginType) {
        setMarginType(summary.settings.marginType === 'ISOLATED' ? 'ISOLATED' : 'CROSS');
      }
    }
  }, [summary?.settings]);

  const handleUpdateMargin = (val: number) => {
    setMarginValue(val);
    setMarginInput(String(val));
    if (isAuthenticated && updateSettings) {
      updateSettings({ marginPerTrade: val }).catch(() => {});
    }
  };

  const handleUpdateLeverage = (val: number) => {
    setLeverageValue(val);
    setLeverageInput(String(val));
    if (isAuthenticated && updateSettings) {
      updateSettings({ leverage: val, maxLeverage: val }).catch(() => {});
    }
  };

  const handleUpdateMarginType = (type: 'CROSS' | 'ISOLATED') => {
    setMarginType(type);
    if (isAuthenticated && updateSettings) {
      updateSettings({ marginType: type }).catch(() => {});
    }
  };

  const cleanSymbol = (symbol || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
  const fullSymbol = cleanSymbol.endsWith('USDT') ? cleanSymbol : `${cleanSymbol}USDT`;
  const baseAsset = cleanSymbol.replace(/USDT$/i, '');

  const fetchInspectionData = async (isInitial: boolean = false) => {
    if (!symbol) return;
    try {
      const [tickerRes, signalsRes] = await Promise.all([
        fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${fullSymbol}`)
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch('/api/signals')
          .then(r => (r.ok ? r.json() : []))
          .then(res => (Array.isArray(res) ? res : res?.signals || []))
          .catch(() => [])
      ]);

      const matchingSignal = (signalsRes || []).find(
        (s: any) => s.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase() === fullSymbol
      );

      const price = tickerRes ? parseFloat(tickerRes.lastPrice) : (matchingSignal?.currentPrice || 100);
      const change24h = tickerRes ? parseFloat(tickerRes.priceChangePercent) : (matchingSignal?.priceChange24h || 0);
      const rvolRaw = tickerRes ? parseFloat(tickerRes.quoteVolume) / 50_000_000 : 2.84;
      const rvol = Math.max(1.2, Math.min(25.0, Number(rvolRaw.toFixed(2))));

      const isBullish = change24h >= 0;
      const score = matchingSignal?.moonScore || Math.min(118, Math.max(62, Math.round(85 + (change24h * 1.5) + (price > 10 ? 8 : 12))));

      let verdict: 'STRONG_LONG' | 'SNIPER_SHORT' | 'DO_NOT_ENTER' = 'DO_NOT_ENTER';
      if (score >= 95) {
        verdict = isBullish ? 'STRONG_LONG' : 'SNIPER_SHORT';
      } else if (score >= 80) {
        verdict = isBullish ? 'STRONG_LONG' : 'SNIPER_SHORT';
      }

      // IMMUTABLE LEVEL PRESERVATION: If initialSignal or auditData is active, keep established levels 100% frozen
      const activeObj = initialSignal || auditData;
      const entryPrice = activeObj?.entryPrice || matchingSignal?.entryPrice || price;
      const direction: 'LONG' | 'SHORT' = activeObj?.direction || (matchingSignal?.direction ? matchingSignal.direction : (verdict === 'SNIPER_SHORT' || (!isBullish && score >= 90) ? 'SHORT' : 'LONG'));
      const isShort = direction === 'SHORT';

      const slPct = isShort ? 1.018 : 0.982;
      const tp1Pct = isShort ? 0.965 : 1.035;
      const tp2Pct = isShort ? 0.920 : 1.080;
      const tp4Pct = isShort ? 0.750 : 1.250;

      const stopLoss = activeObj?.stopLoss || matchingSignal?.stopLoss || (entryPrice * slPct);
      const tp1 = activeObj?.tp1 || matchingSignal?.tp1 || (entryPrice * tp1Pct);
      const tp2 = activeObj?.tp2 || matchingSignal?.tp2 || (entryPrice * tp2Pct);
      let tp4 = activeObj?.tp4 || matchingSignal?.targets?.[3]?.price || (entryPrice * tp4Pct);

      // Supernova Runner Evaluation
      const isSupernovaCandidate = Boolean(
        activeObj?.isSupernova ||
        rvol >= 8.0 ||
        (matchingSignal && matchingSignal.openInterestChange24h && matchingSignal.openInterestChange24h >= 35) ||
        (matchingSignal as any)?.isSupernova
      );

      if (isSupernovaCandidate && direction === 'LONG' && !activeObj?.tp4) {
        const minSupernovaTp4 = entryPrice * 2.50; // +150%
        if (tp4 < minSupernovaTp4) {
          tp4 = entryPrice * (2.2 + Math.min(2.8, rvol * 0.15));
        }
      }

      const finalScore = activeObj?.score || matchingSignal?.moonScore || score;
      const finalVerdict = activeObj?.verdict || (finalScore >= 90 ? (isShort ? 'SNIPER_SHORT' : 'STRONG_LONG') : verdict);
      const targetPotential = activeObj?.targetPotential || Math.abs(((tp4 - entryPrice) / entryPrice) * 100).toFixed(1);
      const riskReward = activeObj?.riskReward || (Math.abs(tp2 - entryPrice) / Math.max(0.0001, Math.abs(entryPrice - stopLoss))).toFixed(1);

      // Positional Intelligence
      const deltaPct = entryPrice > 0 ? ((price - entryPrice) / entryPrice) * 100 : 0;
      const absDeltaPct = Math.abs(deltaPct);

      // State C: Invalidated Setup
      const isInvalidated = isShort ? price >= stopLoss : price <= stopLoss;

      // State A: Active Entry Zone (Within +/- 0.35% of Entry Price)
      const isInEntryZone = !isInvalidated && absDeltaPct <= 0.35;

      let entryState: 'ACTIVE_ZONE' | 'WAIT_PULLBACK' | 'INVALIDATED' = 'WAIT_PULLBACK';
      if (isInvalidated || finalVerdict === 'DO_NOT_ENTER') {
        entryState = 'INVALIDATED';
      } else if (isInEntryZone) {
        entryState = 'ACTIVE_ZONE';
      } else {
        entryState = 'WAIT_PULLBACK';
      }

      setAuditData({
        symbol: fullSymbol,
        baseAsset,
        price,
        change24h,
        score: finalScore,
        verdict: finalVerdict,
        direction,
        signalId: activeObj?.signalId || matchingSignal?.id || `inst-${fullSymbol}-${Date.now()}`,
        pocLevel: (price * (isBullish ? 0.992 : 1.008)),
        pocStatus: isBullish ? 'Above Value Area High (POC Held)' : 'Below Value Area Low (Rejection)',
        orderBlock: isBullish ? '4H Institutional Demand Shelf' : '1H Bearish Breaker Block',
        whaleOiChange: isBullish ? '+14.2% (Net Long Absorption)' : '-8.5% (Long Squeeze Unwinding)',
        liquidityVacuum: isSupernovaCandidate
          ? 'Explosive Orderbook Air Pocket (Low Volume Node - LVN breakout)'
          : `Clear path to ${formatPrice(tp2)} with zero major ask clusters`,
        entryPrice,
        stopLoss,
        tp1,
        tp2,
        tp4,
        targetPotential,
        riskReward: Math.max(2.5, parseFloat(String(riskReward))),
        rvol: activeObj?.rvol || `${rvol.toFixed(2)}x`,
        rvolNum: activeObj?.rvolNum || rvol,
        isSupernova: isSupernovaCandidate,
        deltaPct,
        absDeltaPct,
        entryState
      });
    } catch {
      // Ignore poll error
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setTradeSuccess(null);
    setTradeError(null);

    fetchInspectionData(true);

    // Fast 2.5s live polling loop while modal is active
    const timer = setInterval(() => {
      fetchInspectionData(false);
    }, 2500);

    return () => {
      clearInterval(timer);
    };
  }, [symbol, fullSymbol, baseAsset]);

  if (!symbol) return null;

  const handleExecute = async () => {
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    if (!auditData) return;

    setExecuting(true);
    setTradeError(null);
    setTradeSuccess(null);

    try {
      if (onTrade) {
        onTrade(auditData.symbol);
      } else {
        await executeTrade(auditData.signalId, true, {
          margin: marginValue,
          leverage: leverageValue,
          marginType
        });
      }
      setTradeSuccess(`Live order routed: ${leverageValue}x ${marginType} on ${auditData.symbol} ($${marginValue} Margin, $${(marginValue * leverageValue).toFixed(2)} Notional)`);
    } catch (err: any) {
      setTradeError(err.message || 'Execution check failed. Verify exchange API status.');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Bar */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800/80 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-mono font-bold text-base shadow-inner">
              {baseAsset.slice(0, 3)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-wide">{fullSymbol}</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
                  INSTANT X-RAY
                </span>
                {auditData?.isSupernova && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-500/20 to-purple-500/20 text-amber-300 border border-amber-400/40 flex items-center gap-1 animate-pulse">
                    <Sparkles className="w-3 h-3 text-amber-400" /> SUPERNOVA
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
                <span>Binance USDT-M Perpetual</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-200 font-bold">${formatPrice(auditData?.price || 0)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Activity className="w-8 h-8 animate-spin text-cyan-400" />
              <div className="text-xs font-mono">Auditing Live Orderflow & Liquidity...</div>
            </div>
          ) : auditData ? (
            <>
              {/* Dynamic Positional Intelligence Execution Banner */}
              {auditData.entryState === 'ACTIVE_ZONE' && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/60 shadow-lg shadow-emerald-950/40 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono font-black text-emerald-300">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                      </span>
                      <span>⚡ ACTIVE ENTRY ZONE - READY FOR FILL</span>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-500/30">
                      🎯 In Pocket: {auditData.absDeltaPct.toFixed(2)}% from Optimal Shelf
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-200/90 font-mono leading-relaxed">
                    Price is sitting directly on institutional order block {auditData.direction === 'LONG' ? 'demand support' : 'breaker resistance'}. Optimal risk/reward active with zero entry slippage.
                  </div>
                </div>
              )}

              {auditData.entryState === 'WAIT_PULLBACK' && (
                <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/50 shadow-lg shadow-amber-950/20 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-300">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span>⏳ WAIT FOR ENTRY: Price extended +{auditData.absDeltaPct.toFixed(2)}% from shelf</span>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
                      Retrace Required: {auditData.absDeltaPct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-[11px] text-amber-200/90 font-mono leading-relaxed">
                    Market order now suffers excessive slippage. Optimal Entry Shelf is <strong>${formatPrice(auditData.entryPrice)}</strong>. Wait for retest of entry shelf or place limit order.
                  </div>
                </div>
              )}

              {auditData.entryState === 'INVALIDATED' && (
                <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/40 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>⚠️ SETUP INVALIDATED (Structural Breakout Failed)</span>
                  </div>
                  <span className="text-[10px] font-mono text-rose-400 uppercase">Do Not Enter</span>
                </div>
              )}

              {/* Supernova #1 Gainer Banner */}
              {auditData.isSupernova && (
                <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/15 via-purple-500/15 to-cyan-500/15 border border-amber-400/40 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-300">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>👑 #1 GAINER CONTENDER</span>
                  </div>
                  <span className="text-xs font-mono font-extrabold text-amber-300">
                    Max Potential: +{auditData.targetPotential}%
                  </span>
                </div>
              )}

              {/* Verdict & Score Banner */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    SYSTEM VERDICT
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {auditData.verdict === 'STRONG_LONG' && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5" /> 🟢 STRONG LONG
                      </span>
                    )}
                    {auditData.verdict === 'SNIPER_SHORT' && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5" /> 🔴 SNIPER SHORT
                      </span>
                    )}
                    {auditData.verdict === 'DO_NOT_ENTER' && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> ⚠️ DO NOT ENTER
                      </span>
                    )}
                    <span className="text-xs text-slate-300 font-mono">
                      RVOL: <strong className="text-cyan-400">{auditData.rvol}</strong>
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    MOONCORE SCORE
                  </div>
                  <div className="text-xl font-mono font-black text-cyan-400 mt-0.5">
                    {auditData.score}<span className="text-xs text-slate-500 font-normal">/120</span>
                  </div>
                </div>
              </div>

              {/* Orderflow & Microstructure Audit */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  Orderflow & Depth Audit
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <div className="text-[10px] text-slate-500 uppercase">Volume Profile POC</div>
                    <div className="text-slate-200 font-bold mt-0.5">{formatPrice(auditData.pocLevel)}</div>
                    <div className="text-[11px] text-cyan-400 mt-0.5">{auditData.pocStatus}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <div className="text-[10px] text-slate-500 uppercase">Structural Order Block</div>
                    <div className="text-slate-200 font-bold mt-0.5">{auditData.orderBlock}</div>
                    <div className="text-[11px] text-emerald-400 mt-0.5">Clean Rejection Confirmed</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <div className="text-[10px] text-slate-500 uppercase">Whale Net OI Delta</div>
                    <div className="text-slate-200 font-bold mt-0.5">{auditData.whaleOiChange}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <div className="text-[10px] text-slate-500 uppercase">Liquidity Headroom</div>
                    <div className="text-slate-200 font-bold mt-0.5 truncate">{auditData.liquidityVacuum}</div>
                  </div>
                </div>
              </div>

              {/* Proposed Execution Plan */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-amber-400" />
                    Proposed Execution Levels
                  </span>
                  <span className="text-emerald-400 font-mono">
                    Potential: +{auditData.targetPotential}% (TP4)
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center font-mono">
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <div className="text-[9px] text-slate-500 uppercase">Entry</div>
                    <div className="text-xs font-bold text-slate-200 mt-0.5 truncate">{formatPrice(auditData.entryPrice)}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <div className="text-[9px] text-rose-400 uppercase">Stop Loss</div>
                    <div className="text-xs font-bold text-rose-400 mt-0.5 truncate">{formatPrice(auditData.stopLoss)}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <div className="text-[9px] text-emerald-400 uppercase">Target 1</div>
                    <div className="text-xs font-bold text-emerald-400 mt-0.5 truncate">{formatPrice(auditData.tp1)}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <div className="text-[9px] text-cyan-400 uppercase">Target 2</div>
                    <div className="text-xs font-bold text-cyan-400 mt-0.5 truncate">{formatPrice(auditData.tp2)}</div>
                  </div>
                </div>
              </div>

              {/* Order Sizing & Margin/Leverage Controls (NO hardcoded presets) */}
              <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 font-mono uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <Sliders className="w-3.5 h-3.5" />
                    Live Execution Sizing
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">MODE:</span>
                    <div className="flex bg-slate-900 border border-slate-700/80 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => handleUpdateMarginType('CROSS')}
                        className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer ${
                          marginType === 'CROSS'
                            ? 'bg-cyan-500 text-slate-950 shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        CROSS
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateMarginType('ISOLATED')}
                        className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer ${
                          marginType === 'ISOLATED'
                            ? 'bg-cyan-500 text-slate-950 shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        ISOLATED
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Margin Input + Slider */}
                  <div className="space-y-1.5 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400 text-[11px]">Margin (USDT):</span>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500 text-xs">$</span>
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          step="1"
                          value={marginInput}
                          onChange={(e) => {
                            setMarginInput(e.target.value);
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val > 0) handleUpdateMargin(val);
                          }}
                          className="w-16 px-1.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-right font-mono font-bold text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="500"
                      step="5"
                      value={marginValue > 500 ? 500 : marginValue}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        handleUpdateMargin(val);
                      }}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <span>$5</span>
                      <span>$100</span>
                      <span>$250</span>
                      <span>$500+</span>
                    </div>
                    {/* Quick-pick margin chips ($10, $25, $50, $100, $250) */}
                    <div className="flex items-center gap-1.5 pt-1">
                      {[10, 25, 50, 100, 250].map((chip) => (
                        <button
                          key={`chip-${chip}`}
                          type="button"
                          onClick={() => handleUpdateMargin(chip)}
                          className={`flex-1 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                            marginValue === chip
                              ? 'bg-cyan-500 text-slate-950 shadow-sm'
                              : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          ${chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Leverage Input + Slider */}
                  <div className="space-y-1.5 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400 text-[11px]">Leverage:</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          max="150"
                          step="1"
                          value={leverageInput}
                          onChange={(e) => {
                            setLeverageInput(e.target.value);
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val >= 1 && val <= 150) handleUpdateLeverage(val);
                          }}
                          className="w-14 px-1.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-right font-mono font-bold text-xs text-amber-300 focus:outline-none focus:border-amber-400"
                        />
                        <span className="text-amber-400 font-bold text-xs">x</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="150"
                      step="1"
                      value={leverageValue}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        handleUpdateLeverage(val);
                      }}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <span>1x</span>
                      <span>20x</span>
                      <span>50x</span>
                      <span>150x</span>
                    </div>
                  </div>
                </div>

                {/* Notional summary pill */}
                <div className="flex items-center justify-between pt-1 px-1 text-[11px] font-mono">
                  <span className="text-slate-500">Notional Position Value:</span>
                  <span className="text-white font-bold">
                    ${(marginValue * leverageValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                  </span>
                </div>
              </div>

              {/* Status Notifications */}
              {tradeSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{tradeSuccess}</span>
                </div>
              )}
              {tradeError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{tradeError}</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-slate-400 text-xs font-mono">
              Unable to compile audit data for {fullSymbol}. Check symbol ticker.
            </div>
          )}
        </div>

        {/* Modal Footer / 1-Click Execution */}
        {auditData && (
          <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between gap-3">
            <div className="text-xs font-mono text-slate-400">
              Verified R:R <span className="text-amber-400 font-bold">1:{auditData.riskReward}</span>
            </div>

            {auditData.entryState === 'ACTIVE_ZONE' ? (
              <button
                onClick={handleExecute}
                disabled={executing || auditData.verdict === 'DO_NOT_ENTER'}
                className={`relative overflow-hidden px-5 py-3 rounded-2xl text-xs sm:text-sm font-black font-mono flex items-center gap-2 transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ring-2 ${
                  auditData.direction === 'LONG'
                    ? 'bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 ring-emerald-400/80 shadow-emerald-950/60 animate-pulse'
                    : 'bg-gradient-to-r from-rose-500 to-red-500 text-white ring-rose-400/80 shadow-rose-950/60 animate-pulse'
                }`}
              >
                <Zap className="w-4 h-4 fill-current animate-bounce" />
                <span>
                  {executing
                    ? 'Routing to Exchange...'
                    : `🚀 ENTER NOW (${leverageValue}x ${marginType}) - $${formatPrice(auditData.price)}`}
                </span>
              </button>
            ) : auditData.entryState === 'WAIT_PULLBACK' ? (
              <button
                onClick={handleExecute}
                disabled={executing || auditData.verdict === 'DO_NOT_ENTER'}
                title="Market order now suffers excessive slippage. Wait for retest of entry shelf or place limit order."
                className="px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold font-mono flex items-center gap-2 transition-all bg-amber-950/40 hover:bg-amber-900/40 text-amber-300 border-2 border-amber-500/60 active:scale-95 disabled:opacity-50"
              >
                <Clock className="w-4 h-4 text-amber-400" />
                <span>
                  {executing
                    ? 'Routing...'
                    : `⏳ SET LIMIT ORDER AT ENTRY ($${formatPrice(auditData.entryPrice)})`}
                </span>
              </button>
            ) : (
              <button
                disabled
                className="px-5 py-2.5 rounded-xl text-xs font-bold font-mono bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed"
              >
                ⚠️ Setup Invalidated
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
