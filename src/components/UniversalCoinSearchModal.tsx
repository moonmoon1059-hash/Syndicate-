import React, { useState, useEffect, useRef } from 'react';
import { Signal, CryptoCandle, TimeFrame, CoinAnalysisReport } from '../types/crypto';
import { CandlestickChart } from './CandlestickChart';
import { MoonScoreGauge } from './MoonScoreGauge';
import { fetchCoinAnalysis, fetchCandles, searchCoins } from '../services/api';
import { formatPrice, formatPercent, formatBangladeshTime } from '../utils/formatters';
import {
  Search, X, Zap, ArrowUpRight, ArrowDownRight, Target, ShieldAlert,
  ShieldCheck, AlertTriangle, Activity, Sparkles, TrendingUp,
  Layers, Waves, Lock, Check, Copy, Flame, Clock, BarChart2,
  Compass, PieChart, Info, Shield, Hash, Crosshair
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectSignal?: (signal: Signal) => void;
  initialQuery?: string;
}

export const UniversalCoinSearchModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSelectSignal,
  initialQuery = ''
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [selectedTf, setSelectedTf] = useState<TimeFrame>('1h');
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<CoinAnalysisReport | null>(null);
  const [candles, setCandles] = useState<CryptoCandle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const quickPicks = ['BTC', 'ETH', 'SOL', 'SUI', 'NEAR', 'DOGE', 'PEPE', 'RENDER', 'AVAX', 'BNB'];

  useEffect(() => {
    if (isOpen && initialQuery) {
      setQuery(initialQuery);
      handleSearch(initialQuery, selectedTf);
    }
  }, [isOpen, initialQuery]);

  // Autocomplete suggestions debounce
  useEffect(() => {
    if (!query.trim() || query.length < 1) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await searchCoins(query, 6);
        setSuggestions(results || []);
      } catch {
        setSuggestions([]);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  const handleSearch = async (coinSymbol: string, tf: TimeFrame = selectedTf) => {
    const clean = coinSymbol.trim();
    if (!clean) return;
    setShowSuggestions(false);
    setLoading(true);
    setError(null);
    try {
      const [res, klines] = await Promise.all([
        fetchCoinAnalysis(clean, tf),
        fetchCandles(clean, tf, 80)
      ]);
      if (!res) {
        setError(`Unable to compute intelligence for ${clean}. Ensure the asset exists on monitored exchanges.`);
      } else {
        setAnalysisResult(res);
        setCandles(klines || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to analyze coin');
    } finally {
      setLoading(false);
    }
  };

  const handleTimeframeChange = (tf: TimeFrame) => {
    setSelectedTf(tf);
    if (query) {
      handleSearch(query, tf);
    }
  };

  const signal = analysisResult?.signal as Signal | undefined;
  const decision = analysisResult?.decision || (signal?.direction || 'WAIT');
  const grade = analysisResult?.qualityGrade || signal?.qualityGrade || 'WAIT';
  const priority = analysisResult?.actionablePriority || signal?.actionablePriority || 'WAIT';
  const cycle = analysisResult?.marketCycle || signal?.marketCycle;
  const pumpDump = analysisResult?.pumpDump || signal?.pumpDump;
  const flow = analysisResult?.flowWhale || signal?.flowWhale;
  const killSwitch = analysisResult?.killSwitch || signal?.killSwitch;
  const smc = analysisResult?.smc;
  const orderflow = analysisResult?.orderflow;
  const rs = analysisResult?.relativeStrength;
  const fib = analysisResult?.fibonacci;
  const deriv = analysisResult?.derivatives;
  const structState = analysisResult?.currentStructureState;
  const tradeability = analysisResult?.tradeability;

  const isLong = decision === 'LONG';
  const isShort = decision === 'SHORT';

  const handleCopy = () => {
    if (!analysisResult) return;
    const text = `[MoonScanner Universal Institutional Intelligence]
Asset: ${analysisResult.symbol}
Decision: ${decision} (${selectedTf.toUpperCase()})
Structure State: ${structState?.state || 'N/A'} (Confidence: ${structState?.confidence || 0}%)
Tradeability: ${tradeability?.status || 'N/A'} (Score: ${tradeability?.tradeabilityScore || 0}/100)
Quality Grade: ${grade} | Priority: ${priority}
Current Price: ${formatPrice(analysisResult.currentPrice)}
Entry Zone: ${formatPrice(tradeability?.entryZone?.ideal || signal?.entryPrice || 0)}
Stop Loss: ${formatPrice(tradeability?.stopLoss || signal?.stopLoss || 0)}
Targets: ${(tradeability?.targets || signal?.targets)?.map(t => `${t.label}: ${formatPrice(t.price)}`).join(', ') || 'N/A'}
MoonScore: ${analysisResult.moonScore}/100`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-5xl my-6 overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl animate-fade-in max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Title & Search Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-black text-slate-100 tracking-tight">
              Universal Coin Intelligence Search & Deep-Dive
            </h2>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Institutional SMC, Orderflow Delta, Wyckoff, Relative Strength, Fibonacci & Kill Switch across all market assets
          </p>
        </div>

        {/* Search Input Bar with Autocomplete Dropdown */}
        <div className="relative mb-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(query);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Enter ANY coin symbol or pair (e.g. BTC, SOL, SUI, NEAR, PEPE, RENDER, INJ, AVAX)..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/90 border border-slate-700 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-cyan-500/20"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Deep Scan</span>
                </>
              )}
            </button>
          </form>

          {/* Autocomplete Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-20 mt-1 z-30 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden font-mono text-xs">
              {suggestions.map((item) => (
                <div
                  key={item.symbol}
                  onClick={() => {
                    setQuery(item.symbol);
                    setShowSuggestions(false);
                    handleSearch(item.symbol);
                  }}
                  className="flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-900 cursor-pointer border-b border-slate-800/60 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">{item.symbol}</span>
                    <span className="text-slate-500 text-[11px]">{item.name}</span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[9px] uppercase">{item.category}</span>
                  </div>
                  <span className="text-cyan-400 text-[10px]">Select & Scan &rarr;</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Pick Chips */}
        <div className="flex items-center gap-1.5 flex-wrap mb-5 pb-3 border-b border-slate-800/80">
          <span className="text-[10px] font-mono text-slate-400 uppercase mr-1">Quick Scan:</span>
          {quickPicks.map(coin => (
            <button
              key={coin}
              type="button"
              onClick={() => {
                setQuery(coin);
                handleSearch(coin);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-950 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/40 text-[11px] font-mono font-medium transition-colors"
            >
              {coin}
            </button>
          ))}
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800 text-rose-300 text-xs font-mono mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading State */}
        {loading && !analysisResult && (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400 font-mono text-xs">
            <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
            <span>Executing Institutional SMC, Multi-Timeframe Fusion & Adversarial Audit for {query.toUpperCase()}...</span>
          </div>
        )}

        {/* Analysis Body */}
        {analysisResult && !loading && (
          <div className="space-y-5">
            {/* Top Analysis Header Card */}
            <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div
                  className={`flex items-center justify-center w-12 h-12 rounded-xl ${
                    isLong ? 'bg-emerald-500/20 text-emerald-400' : isShort ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isLong ? <ArrowUpRight className="w-7 h-7" /> : isShort ? <ArrowDownRight className="w-7 h-7" /> : <Activity className="w-6 h-6" />}
                </div>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-2xl font-black text-slate-100 font-mono">
                      {analysisResult.symbol}
                    </h3>
                    <span
                      className={`px-3 py-0.5 rounded-full text-xs font-mono font-black ${
                        isLong
                          ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                          : isShort
                          ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {decision}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-amber-400/20 text-amber-300 border border-amber-400/50">
                      GRADE {grade}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                      {priority.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono text-slate-400 mt-1 flex-wrap">
                    <span>Price: <strong className="text-slate-100">{formatPrice(analysisResult.currentPrice)}</strong></span>
                    <span className={analysisResult.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      ({formatPercent(analysisResult.priceChange24h)})
                    </span>
                    <span>•</span>
                    <span>24h Vol: <strong className="text-slate-300">{analysisResult.volume24h ? (analysisResult.volume24h / 1000000).toFixed(2) + 'M' : 'N/A'}</strong></span>
                    <span>•</span>
                    <span>RVOL: <strong className="text-cyan-300">{analysisResult.rvol ? analysisResult.rvol.toFixed(2) + 'x' : 'N/A'}</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <MoonScoreGauge score={analysisResult.moonScore} size="md" />
              </div>
            </div>

            {/* Deterministic Current Market Structure State & Tradeability Bar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Structure State Card */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 font-mono text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                    <Compass className="w-3.5 h-3.5 text-purple-400" />
                    <span>MARKET STRUCTURE STATE</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 font-bold border border-purple-800/60 text-[10px]">
                    {structState?.state || 'CONSOLIDATION'}
                  </span>
                </div>
                <div className="text-slate-300 text-[11px]">
                  <strong>Confidence:</strong> {structState?.confidence !== undefined ? `${structState.confidence}%` : 'N/A'} | <strong>MTF Alignment:</strong> {structState?.mtfAlignment || 'MIXED'}
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  {structState?.rationale || 'Evaluating Fair Value Gaps, Order Blocks, Liquidity Sweeps and Session Bias.'}
                </p>
              </div>

              {/* Tradeability & Execution Gate */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 font-mono text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>TRADEABILITY VERDICT</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    tradeability?.status === 'TRADEABLE'
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                      : tradeability?.status === 'WAIT_FOR_TRIGGER'
                      ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                      : 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                  }`}>
                    {tradeability?.status || 'WAIT_FOR_TRIGGER'} ({tradeability?.tradeabilityScore || 50}/100)
                  </span>
                </div>
                <div className="text-slate-300 text-[11px]">
                  <strong>Setup:</strong> {tradeability?.preferredDirection || 'NEUTRAL'} | <strong>R:R:</strong> {tradeability?.riskRewardRatio ? `1:${tradeability.riskRewardRatio}` : 'N/A'}
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  {tradeability?.summary || 'Assessing structural risk/reward and order flow validation.'}
                </p>
              </div>
            </div>

            {/* Interactive Live Candlestick Chart */}
            <div>
              <CandlestickChart
                candles={candles}
                signal={signal}
                report={analysisResult}
                height={300}
                selectedTimeframe={selectedTf}
                onTimeframeChange={handleTimeframeChange}
              />
            </div>

            {/* Trading Levels & Execution Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 font-mono">
                <div className="text-[10px] text-slate-400 uppercase">Entry Zone</div>
                <div className="text-base font-bold text-cyan-300 mt-0.5">
                  {formatPrice(tradeability?.entryZone?.ideal || signal?.entryPrice || analysisResult.currentPrice)}
                </div>
                {(tradeability?.entryZone?.low || signal?.entryZoneLow) && (
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Zone: {formatPrice(tradeability?.entryZone?.low || signal?.entryZoneLow || 0)} – {formatPrice(tradeability?.entryZone?.high || signal?.entryZoneHigh || 0)}
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 font-mono">
                <div className="text-[10px] text-slate-400 uppercase">Stop Loss / Invalidation</div>
                <div className="text-base font-bold text-rose-400 mt-0.5 flex items-center gap-1">
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                  {formatPrice(tradeability?.stopLoss || signal?.stopLoss || 0)}
                </div>
                <div className="text-[10px] text-rose-400/80 mt-0.5">
                  {tradeability?.stopLoss && analysisResult.currentPrice > 0
                    ? `Risk: ${((Math.abs(analysisResult.currentPrice - tradeability.stopLoss) / analysisResult.currentPrice) * 100).toFixed(2)}%`
                    : 'Awaiting Structural Level'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 font-mono">
                <div className="text-[10px] text-slate-400 uppercase">Risk to Reward</div>
                <div className="text-base font-bold text-amber-300 mt-0.5">
                  1 : {(tradeability?.riskRewardRatio || signal?.riskRewardRatio) ? (tradeability?.riskRewardRatio || signal?.riskRewardRatio)?.toFixed(1) : 'N/A'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Targets: {(tradeability?.targets || signal?.targets)?.length || 0} Levels
                </div>
              </div>
            </div>

            {/* Take Profit Target Levels */}
            {(tradeability?.targets || signal?.targets) && (tradeability?.targets || signal?.targets)!.length > 0 && (
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
                  <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                    <Target className="w-4 h-4 text-emerald-400" />
                    <span>CANONICAL TAKE PROFIT TARGETS</span>
                  </span>
                  <span className="text-emerald-400">
                    {(tradeability?.targets || signal?.targets)!.filter(t => t.hit).length} / {(tradeability?.targets || signal?.targets)!.length} Reached
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(tradeability?.targets || signal?.targets)!.map(t => (
                    <div key={t.id || t.label} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-300">
                        <span>{t.label}</span>
                        {t.percentage !== undefined && <span className="text-emerald-400">+{t.percentage.toFixed(2)}%</span>}
                      </div>
                      <div className="text-sm font-mono font-black text-slate-100 mt-0.5">
                        {formatPrice(t.price)}
                      </div>
                      {t.evidenceLevel && <div className="text-[10px] font-mono text-slate-400 mt-0.5">{t.evidenceLevel}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Institutional Intelligence Grid (SMC, Orderflow, Relative Strength, Fib) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* SMC Market Structure */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    <span>SMC & FAIR VALUE GAPS</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 font-bold border border-purple-800/60 text-[10px]">
                    {smc?.marketStructure || 'NEUTRAL'}
                  </span>
                </div>
                <div className="text-slate-300 text-[11px]">
                  <strong>FVGs Detected:</strong> {smc?.fairValueGaps?.length || 0} | <strong>Order Blocks:</strong> {smc?.orderBlocks?.length || 0} | <strong>BOS/CHOCH:</strong> {smc?.bosChoch || 'NONE'}
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  {smc?.sessionManipulation?.judasSwingDetected
                    ? `⚠️ ${smc.sessionManipulation.session} Judas Swing detected.`
                    : 'Institutional zones identified via deterministic multi-bar wick and candle imbalances.'}
                </p>
              </div>

              {/* Orderflow & Delta */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                    <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>ORDERFLOW & CUMULATIVE DELTA</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 font-bold border border-cyan-800/60 text-[10px]">
                    CVD: {orderflow?.cvdState || 'NEUTRAL'}
                  </span>
                </div>
                <div className="text-slate-300 text-[11px]">
                  <strong>POC Level:</strong> {orderflow?.pointOfControl ? formatPrice(orderflow.pointOfControl) : 'Calculated'} | <strong>Absorption:</strong> {orderflow?.absorptionSignal || 'NONE'}
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  {orderflow?.deltaDivergence ? '⚠️ CVD Divergence observed vs price trend.' : 'Aggressive buyer/seller delta and volume profile points of control mapped.'}
                </p>
              </div>

              {/* Relative Strength vs BTC */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span>RELATIVE STRENGTH VS BTC</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    rs?.vsBtc === 'OUTPERFORMING'
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                      : rs?.vsBtc === 'UNDERPERFORMING'
                      ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                      : 'bg-slate-900 text-slate-300 border-slate-700'
                  }`}>
                    {rs?.vsBtc || 'IN_LINE'}
                  </span>
                </div>
                <div className="text-slate-300 text-[11px]">
                  <strong>RS Score:</strong> {rs?.rsScore || 50}/100 | <strong>Beta:</strong> {rs?.betaToBtc ? rs.betaToBtc.toFixed(2) : '1.00'}
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  {rs?.vsBtc === 'OUTPERFORMING'
                    ? 'Asset exhibiting high institutional relative strength against BTC benchmark.'
                    : 'Tracking correlated market movement relative to BTC base volatility.'}
                </p>
              </div>

              {/* Fibonacci & Golden Pocket */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                    <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                    <span>FIBONACCI & GOLDEN POCKET</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 font-bold border border-amber-800/60 text-[10px]">
                    {fib?.inGoldenPocket ? 'IN GOLDEN POCKET' : 'STANDARD FIB'}
                  </span>
                </div>
                <div className="text-slate-300 text-[11px]">
                  <strong>0.618 Level:</strong> {fib?.goldenPocket ? formatPrice(fib.goldenPocket.level0618) : 'Calculated'} | <strong>0.5 Level:</strong> {fib?.levels?.find(l => l.level === 0.5) ? formatPrice(fib.levels.find(l => l.level === 0.5)!.price) : 'N/A'}
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  {fib?.inGoldenPocket ? 'Price currently interacting with high-probability institutional golden pocket reversal zone.' : 'Mathematical swing highs/lows Fibonacci retracement levels.'}
                </p>
              </div>
            </div>

            {/* Market Cycle, Dump Risk, Whale Flow & Safety Gate */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Market Cycle */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>WYCKOFF & MARKET CYCLE</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 font-bold border border-cyan-800/60 text-[10px]">
                    {cycle?.phase || 'UNKNOWN'}
                  </span>
                </div>
                <div className="text-slate-300 text-[11px]">
                  <strong>Stage:</strong> {cycle?.cycleStage || 'UNKNOWN'} (Confidence: {cycle?.confidence !== undefined ? `${cycle.confidence}%` : 'N/A'})
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  {cycle?.rationale || 'Evaluating structural price and volume signatures across multi-timeframe candles.'}
                </p>
              </div>

              {/* Climax Dump Risk */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span>MOMENTUM & CLIMAX DUMP RISK</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    pumpDump?.dumpRisk === 'HIGH' || pumpDump?.dumpRisk === 'CRITICAL'
                      ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                      : pumpDump?.dumpRisk === 'MODERATE'
                      ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                  }`}>
                    RISK: {pumpDump?.dumpRisk || 'LOW'}
                  </span>
                </div>
                <div className="text-slate-300 text-[11px]">
                  <strong>State:</strong> {pumpDump?.momentumState || 'NORMAL'} | <strong>Fake Pump:</strong> {pumpDump?.fakePumpWarning ? 'DETECTED' : 'CLEAR'}
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  {pumpDump?.rationale || 'Evaluating volume expansion, RSI divergence, and upper wick exhaustion.'}
                </p>
              </div>

              {/* Whale Flow */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                    <Waves className="w-3.5 h-3.5 text-indigo-400" />
                    <span>WHALE & EXCHANGE FLOW</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 text-[10px] border border-slate-700">
                    {flow?.netFlowStatus || 'BALANCED'}
                  </span>
                </div>
                <div className="text-slate-300 text-[11px]">
                  <strong>Whale Accumulation:</strong> {flow?.whaleAccumulationSignal || 'NEUTRAL'}
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  {flow?.rationale || 'Institutional order flow telemetry monitored with strict fallback.'}
                </p>
              </div>

              {/* Kill Switch */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>KILL SWITCH SAFETY GATE</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    killSwitch?.triggered
                      ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                  }`}>
                    {killSwitch?.triggered ? 'KILL SWITCH ACTIVE' : 'SYSTEM CLEAR'}
                  </span>
                </div>
                <div className="text-slate-300 text-[11px]">
                  <strong>Status:</strong> {killSwitch?.triggered ? `Triggered: ${killSwitch.triggerReason}` : 'Safe Trading Conditions'}
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  Volatility, telemetry integrity, and extreme instability monitors are active.
                </p>
              </div>
            </div>

            {/* News Catalysts & Market Reaction Intelligence */}
            {analysisResult.newsList && analysisResult.newsList.length > 0 && (
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>NEWS CATALYSTS & TRADE INTELLIGENCE</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/60">
                    {analysisResult.newsList.length} Catalysts Monitored
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {analysisResult.newsList.slice(0, 2).map((newsItem: any, idx: number) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <span className="text-indigo-300 font-bold">{newsItem.source || 'Breaking News'}</span>
                        <span className="text-amber-400 font-bold">Impact: {newsItem.impactScore ? `${newsItem.impactScore}/100` : 'N/A'}</span>
                      </div>
                      <p className="text-slate-200 text-[11px] font-semibold line-clamp-2">{newsItem.title}</p>
                      {newsItem.summary && (
                        <p className="text-slate-400 text-[10px] mt-1 line-clamp-2">{newsItem.summary}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Unified Analysis'}</span>
              </button>

              <div className="flex items-center gap-2">
                {signal && onSelectSignal && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSignal(signal);
                      onClose();
                    }}
                    className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors"
                  >
                    Open in Full Inspector
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-slate-100 text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
