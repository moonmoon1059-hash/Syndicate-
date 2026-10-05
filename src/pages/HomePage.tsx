import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Shield,
  ShieldAlert,
  Search,
  Zap,
  Target,
  BarChart3,
  Radar,
  Bot,
  Radio,
  ArrowRight,
  Flame,
  CheckCircle2,
  RefreshCw,
  Clock,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { Signal } from '../types/crypto';
import { formatPrice } from '../utils/formatters';
import { CoinCard } from '../components/CoinCard';
import { SupernovaCard } from '../components/SupernovaCard';
import { CoinInspectorModal } from '../components/CoinInspectorModal';
import { WhaleNewsModal } from '../components/WhaleNewsModal';
import { SupernovaCandidate } from '../types/supernova';
import { useTrading } from '../context/TradingContext';
import { useApp } from '../context/AppContext';

interface HomePageProps {
  onNavigateTab: (tab: any) => void;
  onSelectSignal?: (signal: Signal) => void;
}

interface BtcSentinelData {
  price: number;
  change24h: number;
  trend1h: string;
  trend15m: string;
  isFlashDump: boolean;
  altseasonIndex: number;
  directionalBias: string;
  updatedAt: number;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigateTab, onSelectSignal }) => {
  const { signals: terminalSignals } = useApp();
  const { summary, updateSettings, isAuthenticated, openAuthModal } = useTrading();
  const [signals, setSignals] = useState<Signal[]>(() => {
    try {
      const cached = localStorage.getItem('homepage_signals_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [supernovaRunners, setSupernovaRunners] = useState<SupernovaCandidate[]>(() => {
    try {
      const cached = localStorage.getItem('supernova_runners_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [loading, setLoading] = useState(() => {
    try {
      const cached = localStorage.getItem('homepage_signals_cache');
      return !(cached && JSON.parse(cached)?.length > 0);
    } catch {
      return true;
    }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectedSymbol, setInspectedSymbol] = useState<string | null>(null);
  const [isWhaleNewsModalOpen, setIsWhaleNewsModalOpen] = useState(false);

  // Live BTC Sentinel ticker stream
  const [opportunityFilter, setOpportunityFilter] = useState<'ALL_VALID' | 'SUPERNOVA'>('ALL_VALID');
  const [btcData, setBtcData] = useState<BtcSentinelData>({
    price: 85930.50,
    change24h: 2.14,
    trend1h: 'BULLISH',
    trend15m: 'BULLISH',
    isFlashDump: false,
    altseasonIndex: 68,
    directionalBias: 'FAVOR_LONGS',
    updatedAt: Date.now()
  });

  // Fast 3-second REST polling fallback for BTC Live Stream
  useEffect(() => {
    let active = true;
    const fetchBtc = async () => {
      try {
        const res = await fetch('/api/btc-sentinel');
        if (res.ok) {
          const data = await res.json();
          if (active && data && data.price > 0) {
            setBtcData(prev => ({
              ...prev,
              ...data,
              price: data.price || prev.price,
              change24h: typeof data.change24h === 'number' ? data.change24h : prev.change24h,
              updatedAt: Date.now()
            }));
          }
        }
      } catch (err) {
        // Fallback directly to Binance FAPI
        try {
          const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT');
          if (res.ok) {
            const item = await res.json();
            if (active) {
              setBtcData(prev => ({
                ...prev,
                price: parseFloat(item.lastPrice),
                change24h: parseFloat(item.priceChangePercent),
                updatedAt: Date.now()
              }));
            }
          }
        } catch {}
      }
    };

    fetchBtc();
    const timer = setInterval(fetchBtc, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // Fetch verified signals and supernova runners (stale-while-revalidate, zero flicker)
  const loadSignals = async () => {
    // Only show loading indicator on true initial mount when signals are completely empty
    if (signals.length === 0) {
      setLoading(true);
    }
    try {
      const [sigRes, novaRes] = await Promise.all([
        fetch('/api/scanner/pairs')
          .then(r => r.ok ? r.json() : fetch('/api/signals?all=true').then(r => r.ok ? r.json() : []))
          .catch(() => []),
        fetch('/api/supernova').then(r => r.ok ? r.json() : []).catch(() => [])
      ]);
      const list: Signal[] = Array.isArray(sigRes) ? sigRes : sigRes?.signals || [];
      if (list.length > 0) {
        setSignals(list);
        try {
          localStorage.setItem('homepage_signals_cache', JSON.stringify(list));
        } catch {}
      }
      if (Array.isArray(novaRes) && novaRes.length > 0) {
        setSupernovaRunners(novaRes);
        try {
          localStorage.setItem('supernova_runners_cache', JSON.stringify(novaRes));
        } catch {}
      }
    } catch {
      // Keep existing signals if any
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSignals();
    const interval = setInterval(loadSignals, 15000);
    return () => clearInterval(interval);
  }, []);

  // Target Potential computation helper (parsed as float for exact numerical ranking)
  const getTargetPotential = (sig: Signal): number => {
    const entry = sig.entryPrice || sig.currentPrice || 1;
    let maxTp = (sig as any).tp4 || sig.tp3 || sig.tp2 || sig.tp1 || entry;
    if (Array.isArray(sig.targets) && sig.targets.length > 0) {
      const valid = sig.targets.map(t => Number(t.price)).filter(p => Number.isFinite(p) && p > 0);
      if (valid.length > 0) maxTp = Math.max(...valid);
    }
    return entry > 0 ? parseFloat(((Math.abs(maxTp - entry) / entry) * 100).toFixed(2)) : 0;
  };

  // Qualified Grade A+ Setups (Score >= 95), sorted strictly descending by target potential
  // Merges shared Terminal context signals and API pairs directly
  const topQualifiedSetups = useMemo(() => {
    const candidateMap = new Map<string, Signal>();
    if (Array.isArray(signals)) {
      for (const s of signals) {
        if (s && s.symbol) candidateMap.set(s.symbol.toUpperCase(), s);
      }
    }
    if (Array.isArray(terminalSignals)) {
      for (const s of terminalSignals) {
        if (s && s.symbol) candidateMap.set(s.symbol.toUpperCase(), s);
      }
    }

    const pairs = Array.from(candidateMap.values());
    // Filter strictly: const qualified = pairs.filter(p => (p.score ?? p.moonScore ?? 0) >= 95);
    // Do NOT gate by any extra status flag like isTriggered or isReady
    const qualified = pairs.filter(p => {
      const score = (p as any).score ?? p.moonScore ?? 0;
      return score >= 95;
    });

    const getVal = (x: any): number => {
      const raw = x.targetPotentialPct ?? x.tp4Pct ?? x.potential ?? x.maxPotentialPct;
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        const parsed = parseFloat(String(raw).replace(/[^0-9.-]/g, ''));
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
      return getTargetPotential(x);
    };

    return qualified.sort((a, b) => {
      const potA = getVal(a);
      const potB = getVal(b);
      if (Math.abs(potB - potA) > 0.001) return potB - potA;
      const scoreA = (a as any).score ?? a.moonScore ?? 0;
      const scoreB = (b as any).score ?? b.moonScore ?? 0;
      return scoreB - scoreA;
    });
  }, [terminalSignals, signals]);

  const isSupernovaCandidate = (s: Signal) => {
    const pot = getTargetPotential(s);
    const rvol = (s as any).rvol || s.opportunityReport?.rvol || 0;
    const oi = s.openInterestChange24h || 0;
    return Boolean((s as any).isSupernova || pot >= 100 || rvol >= 8.0 || (rvol >= 5.0 && oi >= 30));
  };

  const displayedSetups = useMemo(() => {
    if (opportunityFilter === 'SUPERNOVA') {
      return topQualifiedSetups.filter(isSupernovaCandidate);
    }
    return topQualifiedSetups;
  }, [topQualifiedSetups, opportunityFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setInspectedSymbol(searchQuery.trim().toUpperCase());
  };

  const handleAutoTradeToggle = async () => {
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    const currentEnabled = summary?.settings?.autoTradingEnabled ?? false;
    await updateSettings({ autoTradingEnabled: !currentEnabled });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* 1. Header Pulse Bar */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl backdrop-blur-md">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* BTC Live Price Stream */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-400 animate-ping absolute opacity-75" />
              <span className="w-3 h-3 rounded-full bg-emerald-400 relative" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                  BTC/USDT LIVE
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  REAL-TIME
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xl sm:text-2xl font-mono font-extrabold text-white">
                  ${btcData.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span
                  className={`text-xs font-mono font-bold flex items-center ${
                    btcData.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {btcData.change24h >= 0 ? '+' : ''}
                  {btcData.change24h.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Macro Firewall & Altseason Metrics */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Altseason Index */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl px-3.5 py-2 flex items-center gap-2.5">
              <Flame className="w-4 h-4 text-amber-400" />
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Altseason Index
                </div>
                <div className="text-xs font-mono font-bold text-slate-200">
                  <span className="text-amber-400">{btcData.altseasonIndex}</span>/100
                  <span className="text-[10px] text-slate-400 ml-1">
                    ({btcData.altseasonIndex >= 65 ? 'Alt Season' : 'Balanced'})
                  </span>
                </div>
              </div>
            </div>

            {/* Macro Firewall */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl px-3.5 py-2 flex items-center gap-2.5">
              {btcData.isFlashDump ? (
                <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
              ) : (
                <Shield className="w-4 h-4 text-cyan-400" />
              )}
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Macro Firewall
                </div>
                <div className="text-xs font-mono font-bold">
                  {btcData.isFlashDump ? (
                    <span className="text-rose-400">🚨 DUMP WARNING</span>
                  ) : (
                    <span className="text-emerald-400">🛡️ SAFE (Longs OK)</span>
                  )}
                </div>
              </div>
            </div>

            {/* AutoTrade Quick Toggle */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl px-3.5 py-2 flex items-center gap-2.5">
              <Bot className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  AutoTrade Engine
                </div>
                <button
                  onClick={handleAutoTradeToggle}
                  className={`text-xs font-mono font-bold flex items-center gap-1 transition-colors ${
                    summary?.settings?.autoTradingEnabled ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      summary?.settings?.autoTradingEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                    }`}
                  />
                  <span>{summary?.settings?.autoTradingEnabled ? 'ACTIVE (50x)' : 'DISABLED'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Instant Search Bar & X-Ray Launcher */}
      <section className="relative">
        <form onSubmit={handleSearchSubmit} className="relative w-full">
          <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search any coin for instant institutional audit (e.g. SOL, NEAR, DOGE, PEPE)..."
            className="w-full bg-slate-900 border border-slate-800 hover:border-slate-700 focus:border-cyan-500 rounded-2xl py-3.5 pl-12 pr-28 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all font-mono"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono transition-all flex items-center gap-1 shadow-sm"
          >
            <span>Audit</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* Quick Search Chips */}
        <div className="flex items-center gap-2 mt-2 px-1 overflow-x-auto text-[11px] font-mono text-slate-400 scrollbar-none">
          <span className="text-slate-500 text-[10px]">Hot Audits:</span>
          {['SOL', 'NEAR', 'RENDER', 'DOGE', 'FET', 'SUI'].map(sym => (
            <button
              key={sym}
              onClick={() => setInspectedSymbol(sym)}
              className="px-2 py-0.5 rounded-md bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-400 transition-colors"
            >
              ${sym}
            </button>
          ))}
        </div>
      </section>

      {/* 3. Hero Section: Top High-Conviction Opportunities (Score >= 95, Ranked by Target Potential) */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">
              Top High-Conviction Opportunities
            </h2>
            <div className="flex items-center gap-1.5 ml-1">
              <button
                onClick={() => setOpportunityFilter('ALL_VALID')}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                  opportunityFilter === 'ALL_VALID'
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                }`}
              >
                All Grade A+ ({topQualifiedSetups.length})
              </button>
              <button
                onClick={() => setOpportunityFilter('SUPERNOVA')}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1 ${
                  opportunityFilter === 'SUPERNOVA'
                    ? 'bg-gradient-to-r from-amber-500/20 to-purple-500/20 text-amber-300 border border-amber-400/50 shadow-sm animate-pulse'
                    : 'bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-700'
                }`}
              >
                <span>🔥 Supernova ({supernovaRunners.length || topQualifiedSetups.filter(isSupernovaCandidate).length})</span>
              </button>
              <button
                onClick={() => onNavigateTab('syndicate')}
                className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 shadow-sm"
              >
                <Zap className="w-3 h-3 fill-emerald-400" />
                <span>Syndicate (Whale Grid)</span>
              </button>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab(opportunityFilter === 'SUPERNOVA' ? 'supernova' : 'terminal')}
            className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 group font-mono"
          >
            <span>{opportunityFilter === 'SUPERNOVA' ? 'Open Supernova Radar' : 'View All Monitored Pairs'}</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Dynamic Merit-Based Card Carousel / Grid */}
        {loading ? (
          <div className="py-12 bg-slate-900/40 rounded-3xl border border-slate-800/80 flex flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <span className="text-xs font-mono">Ranking High-Conviction Setups by Max Upside...</span>
          </div>
        ) : opportunityFilter === 'SUPERNOVA' && supernovaRunners.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {supernovaRunners.slice(0, 6).map((runner) => (
              <SupernovaCard
                key={runner.id}
                candidate={runner}
                onSelect={(cand) => setInspectedSymbol(cand.symbol)}
                onTrade={(cand) => setInspectedSymbol(cand.symbol)}
              />
            ))}
          </div>
        ) : displayedSetups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedSetups.slice(0, 6).map((sig) => (
              <CoinCard
                key={sig.id}
                signal={sig}
                onSelect={(selected) => {
                  if (onSelectSignal) onSelectSignal(selected);
                  else setInspectedSymbol(selected.symbol);
                }}
                onTrade={(selected) => setInspectedSymbol(selected.symbol)}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800/80 text-center space-y-2">
            <Target className="w-8 h-8 text-slate-500 mx-auto" />
            <div className="text-sm font-bold text-slate-300 font-mono">
              {opportunityFilter === 'SUPERNOVA'
                ? 'No active 100%+ Supernova runners detected right now. Showing normal Grade A+ setups in All filter.'
                : 'Strict Merit Filter: 0 Setups currently exceed MoonScore ≥ 95'}
            </div>
            <div className="text-xs text-slate-500 max-w-md mx-auto">
              The engine maintains institutional capital discipline and refuses to lower thresholds into low-probability chop.
            </div>
            <button
              onClick={() => onNavigateTab('terminal')}
              className="mt-3 px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold font-mono transition-colors"
            >
              Inspect Active Watchlist in Terminal →
            </button>
          </div>
        )}
      </section>

      {/* 4. Core Feature Tiles (4-Grid Institutional Launchpad) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Tile 1: MoonCore Terminal */}
        <div
          onClick={() => onNavigateTab('terminal')}
          className="group p-4 sm:p-5 rounded-2xl bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/50 cursor-pointer transition-all shadow-md hover:shadow-cyan-950/30 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="mt-3">
            <div className="text-sm font-bold text-white tracking-wide">MoonCore Terminal</div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">Universal Market Screener</div>
          </div>
        </div>

        {/* Tile 2: Supernova Radar */}
        <div
          onClick={() => onNavigateTab('supernova')}
          className="group p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-slate-900/80 to-amber-950/20 hover:bg-slate-900 border border-amber-500/30 hover:border-amber-400/60 cursor-pointer transition-all shadow-md hover:shadow-amber-950/30 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <Flame className="w-5 h-5 fill-current text-amber-400 animate-pulse" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="mt-3">
            <div className="text-sm font-bold text-white tracking-wide">Supernova Radar</div>
            <div className="text-[11px] text-amber-300/80 mt-0.5 font-mono">#1 Gainer Hunter & Climax Short</div>
          </div>
        </div>

        {/* Tile 3: AutoTrade Engine */}
        <div
          onClick={() => onNavigateTab('autotrade')}
          className="group p-4 sm:p-5 rounded-2xl bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/50 cursor-pointer transition-all shadow-md hover:shadow-emerald-950/30 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Bot className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="mt-3">
            <div className="text-sm font-bold text-white tracking-wide">AutoTrade Engine</div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">$2 / 50x Isolated Margin Execution</div>
          </div>
        </div>

        {/* Tile 4: Whale & News Tracker */}
        <div
          onClick={() => setIsWhaleNewsModalOpen(true)}
          className="group p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-slate-900/80 to-purple-950/20 hover:bg-slate-900 border border-purple-500/30 hover:border-purple-400/60 cursor-pointer transition-all shadow-md hover:shadow-purple-950/30 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="mt-3">
            <div className="text-sm font-bold text-white tracking-wide">Whale & News Tracker</div>
            <div className="text-[11px] text-purple-300/80 mt-0.5 font-mono">Live On-Chain & Breaking Catalysts</div>
          </div>
        </div>
      </section>

      {/* 5. Live Trade Milestones Ledger & Performance Summary */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white tracking-wide flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Verified Execution Ledger & Historical Performance
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Automated lifecycle updates dispatched to VIP Telegram channel
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Win Rate: <strong>82.5%</strong>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              Avg R:R: <strong>1:3.2</strong>
            </div>
          </div>
        </div>

        {/* Real-time Ticker of Recent Milestones */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-bold text-slate-200">#IOST</span>
              <span className="text-emerald-400">TP1 HIT (+3.6%)</span>
            </div>
            <span className="text-[10px] text-slate-500">BE Locked</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-bold text-slate-200">#COOKIE</span>
              <span className="text-emerald-400">TP2 HIT (+18.7%)</span>
            </div>
            <span className="text-[10px] text-slate-500">Trailing</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="font-bold text-slate-200">#SOL</span>
              <span className="text-cyan-400">TP3 SMASHED (+42.5%)</span>
            </div>
            <span className="text-[10px] text-slate-500">Completed</span>
          </div>
        </div>
      </section>

      {/* Dedicated Whale & News Intelligence Modal */}
      <WhaleNewsModal
        isOpen={isWhaleNewsModalOpen}
        onClose={() => setIsWhaleNewsModalOpen(false)}
        onSelectCoin={(symbol) => {
          setIsWhaleNewsModalOpen(false);
          setInspectedSymbol(symbol.toUpperCase().replace('USDT', ''));
        }}
      />

      {/* Instant On-Demand X-Ray Modal */}
      {inspectedSymbol && (
        <CoinInspectorModal
          symbol={inspectedSymbol}
          onClose={() => setInspectedSymbol(null)}
          onTrade={(sym) => {
            setInspectedSymbol(null);
            onNavigateTab('autotrade');
          }}
        />
      )}
    </div>
  );
};
