import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { SignalCard } from '../components/SignalCard';
import { CoinCard } from '../components/CoinCard';
import { DataStateBadge } from '../components/DataStateBadge';
import { UniversalCoinSearchModal } from '../components/UniversalCoinSearchModal';
import { CompactTradingSection } from '../components/trading/CompactTradingSection';
import { formatPrice, formatPercent, formatBangladeshTime, formatRelativeTime } from '../utils/formatters';
import { filterEliteSignals } from '../utils/priorityRanking';
import { fetchMarketStats } from '../services/api';
import {
  Zap,
  Activity,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Newspaper,
  Compass,
  AlertCircle,
  Bell,
  Search,
  Sparkles,
  Flame,
  Radio,
  SlidersHorizontal,
  ChevronRight,
  ArrowUpRight
} from 'lucide-react';

interface Props {
  onNavigateTab: (tab: 'home' | 'autotrade' | 'premove' | 'signals' | 'news' | 'radar' | 'settings') => void;
}

export const HomeScreen: React.FC<Props> = ({ onNavigateTab }) => {
  const {
    signals,
    marketStats,
    news,
    radar,
    dataState,
    lastUpdated,
    currentTime,
    setSelectedSignal,
    setSelectedNews,
    setSelectedRadar,
    setIsAlertModalOpen,
    runDeepScan
  } = useApp();

  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Automatic Live BTC Price via Real-Time WebSocket & Fallback Polling
  const [liveBtcPrice, setLiveBtcPrice] = useState<number | null>(null);
  const [liveBtcChange, setLiveBtcChange] = useState<number | null>(null);
  const [priceFlash, setPriceFlash] = useState<'UP' | 'DOWN' | null>(null);
  const [streamHealth, setStreamHealth] = useState<'WS_LIVE' | 'REST_LIVE' | 'CONNECTING' | 'OFFLINE'>('CONNECTING');
  const prevPriceRef = useRef<number | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let fallbackInterval: NodeJS.Timeout | null = null;
    let isSubscribed = true;

    // Direct Binance Public Ticker Stream
    try {
      ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
      
      ws.onopen = () => {
        if (!isSubscribed) return;
        setStreamHealth('WS_LIVE');
      };

      ws.onmessage = (event) => {
        if (!isSubscribed) return;
        try {
          const data = JSON.parse(event.data);
          const price = parseFloat(data.c);
          const change = parseFloat(data.P);
          
          if (!isNaN(price) && price > 0) {
            setStreamHealth('WS_LIVE');
            if (prevPriceRef.current !== null && Math.abs(prevPriceRef.current - price) > 0.1) {
              setPriceFlash(price > prevPriceRef.current ? 'UP' : 'DOWN');
              setTimeout(() => setPriceFlash(null), 900);
            }
            prevPriceRef.current = price;
            setLiveBtcPrice(price);
            if (!isNaN(change)) {
              setLiveBtcChange(change);
            }
          }
        } catch (e) {
          // ignore parsing error
        }
      };

      ws.onerror = () => {
        if (!isSubscribed) return;
        setStreamHealth(prev => prev === 'WS_LIVE' ? 'REST_LIVE' : prev);
        if (ws) ws.close();
      };

      ws.onclose = () => {
        if (!isSubscribed) return;
        setStreamHealth(prev => prev === 'WS_LIVE' ? 'REST_LIVE' : prev);
      };
    } catch (e) {
      console.warn('[HomeScreen] BTC WebSocket init failed:', e);
      setStreamHealth('REST_LIVE');
    }

    // High-frequency 3.5s polling fallback to guarantee live updates regardless of WebSocket network state
    fallbackInterval = setInterval(async () => {
      if (!isSubscribed) return;
      try {
        const stats = await fetchMarketStats();
        if (stats && stats.btcPrice) {
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            setStreamHealth('REST_LIVE');
          }
          if (prevPriceRef.current !== null && Math.abs(prevPriceRef.current - stats.btcPrice) > 0.1) {
            setPriceFlash(stats.btcPrice > prevPriceRef.current ? 'UP' : 'DOWN');
            setTimeout(() => setPriceFlash(null), 900);
          }
          prevPriceRef.current = stats.btcPrice;
          setLiveBtcPrice((prev) => (ws && ws.readyState === WebSocket.OPEN ? (prev || stats.btcPrice) : stats.btcPrice));
          if (stats.btcChange24h !== undefined) {
            setLiveBtcChange((prev) => (ws && ws.readyState === WebSocket.OPEN ? (prev || stats.btcChange24h) : stats.btcChange24h));
          }
        }
      } catch (e) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          setStreamHealth('OFFLINE');
        }
      }
    }, 3500);

    return () => {
      isSubscribed = false;
      if (ws) ws.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, []);

  const displayBtcPrice = (liveBtcPrice && liveBtcPrice > 0) ? liveBtcPrice : (marketStats?.btcPrice && marketStats.btcPrice > 0 ? marketStats.btcPrice : null);
  const displayBtcChange = liveBtcChange !== null ? liveBtcChange : (typeof marketStats?.btcChange24h === 'number' ? marketStats.btcChange24h : null);

  const handleSelectSignal = useCallback((s: any) => {
    setSelectedSignal(s);
  }, [setSelectedSignal]);

  // 2. High-Opportunity Setups (Strictly Top 3-5 High-Conviction Trades, 1 per coin)
  const highOpportunitySignals = useMemo(() => {
    const seenCoins = new Set<string>();
    const qualified: typeof signals = [];

    const getPotentialMove = (sig: any): number => {
      if (typeof sig.majorMovePotentialPct === 'number' && sig.majorMovePotentialPct > 0) {
        return sig.majorMovePotentialPct;
      }
      if (typeof sig.expectedMovePct === 'number' && sig.expectedMovePct > 0) {
        return sig.expectedMovePct;
      }
      if (sig.targets && sig.targets.length > 0 && sig.entryPrice > 0) {
        const validT = sig.targets.filter((t: any) => typeof t.price === 'number' && t.price > 0);
        if (validT.length > 0) {
          const finalTarget = validT[validT.length - 1].price;
          const isLong = sig.direction === 'LONG';
          return isLong
            ? ((finalTarget - sig.entryPrice) / sig.entryPrice) * 100
            : ((sig.entryPrice - finalTarget) / sig.entryPrice) * 100;
        }
      }
      return 0;
    };

    // Filter candidate actionable signals:
    // Exclude exploratory coiling setups (direction WAIT, status WAIT, or missing entry)
    const actionableCandidates = signals.filter((sig) => {
      if ((sig.direction as any) === 'WAIT' || sig.status === 'WAIT' || !sig.entryPrice || sig.entryPrice <= 0) {
        return false;
      }
      const grade = sig.qualityGrade || 'B';
      return grade === 'A+' || grade === 'A' || ((sig as any).moonScore && (sig as any).moonScore >= 75);
    });

    // Pass 1: Setups with major move potential >= 25% or Grade A+
    for (const sig of actionableCandidates) {
      const cleanSym = (sig.symbol || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
      if (seenCoins.has(cleanSym)) continue;

      const move = getPotentialMove(sig);
      if (move >= 25.0 || sig.qualityGrade === 'A+') {
        seenCoins.add(cleanSym);
        qualified.push({
          ...sig,
          majorMoveClass: move >= 50.0 ? 'EXTREME_MOVE' : 'MAJOR_MOVE',
          majorMovePotentialPct: Number(move.toFixed(1))
        });
      }
    }

    // Pass 2: If fewer than 3, backfill with next best high-conviction actionable setups
    if (qualified.length < 3) {
      for (const sig of actionableCandidates) {
        const cleanSym = (sig.symbol || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
        if (seenCoins.has(cleanSym)) continue;
        const move = getPotentialMove(sig);
        seenCoins.add(cleanSym);
        qualified.push({
          ...sig,
          majorMoveClass: move >= 50.0 ? 'EXTREME_MOVE' : (move >= 25.0 ? 'MAJOR_MOVE' : 'CONFIRMED'),
          majorMovePotentialPct: Number(move.toFixed(1))
        });
        if (qualified.length >= 5) break;
      }
    }

    // Deterministic ranking: Grade A+ first, then highest move potential
    qualified.sort((a, b) => {
      const gradeRank = (g?: string) => (g === 'A+' ? 2 : g === 'A' ? 1 : 0);
      const diff = gradeRank(b.qualityGrade) - gradeRank(a.qualityGrade);
      if (diff !== 0) return diff;
      return (b.majorMovePotentialPct || 0) - (a.majorMovePotentialPct || 0);
    });

    return qualified.slice(0, 5);
  }, [signals]);

  const hotRadar = useMemo(() => radar.slice(0, 3), [radar]);
  const latestNews = useMemo(() => news.slice(0, 2), [news]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-24 max-w-5xl mx-auto px-1 sm:px-0">
      {/* 1. Command Center Live Header */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800/90 p-4 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* App Branding & Telemetry Status */}
          <div className="flex items-center justify-between sm:justify-start gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-slate-950 font-black text-xl">
                🌙
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-black tracking-tight text-slate-100">
                    MoonScanner
                  </h1>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                    PRO TERMINAL
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                  <span className="text-slate-300 font-semibold">{formatBangladeshTime(currentTime || lastUpdated)} BST</span>
                  <span>•</span>
                  {streamHealth === 'WS_LIVE' ? (
                    <div className="flex items-center gap-1.5 text-emerald-400" title="Real-time Binance WebSocket stream connected (tick-by-tick)">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-[11px] font-bold">LIVE WS</span>
                    </div>
                  ) : streamHealth === 'REST_LIVE' ? (
                    <div className="flex items-center gap-1.5 text-cyan-400" title="High-frequency REST polling fallback active">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                      </span>
                      <span className="text-[11px] font-bold">LIVE REST</span>
                    </div>
                  ) : streamHealth === 'CONNECTING' ? (
                    <div className="flex items-center gap-1.5 text-amber-400" title="Connecting to Binance market stream...">
                      <span className="relative flex h-2 w-2">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500 animate-pulse"></span>
                      </span>
                      <span className="text-[11px] font-bold">CONNECTING</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-rose-400" title="Disconnected from market stream. Reconnecting...">
                      <span className="relative flex h-2 w-2">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                      </span>
                      <span className="text-[11px] font-bold">OFFLINE</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile Controls */}
            <div className="flex sm:hidden items-center gap-2">
              <button
                onClick={() => setIsAlertModalOpen(true)}
                className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 relative"
                title="Alert Center"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-400" />
              </button>
              <button
                onClick={() => runDeepScan()}
                disabled={dataState === 'SYNCING'}
                className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400"
              >
                <RefreshCw className={`w-4 h-4 ${dataState === 'SYNCING' ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Live BTC Price & Regime Pill */}
          <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t border-slate-800/60 md:border-t-0">
            {/* Live BTC Ticker */}
            <div className={`px-4 py-2 rounded-xl border transition-all duration-300 ${
              priceFlash === 'UP'
                ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 shadow-md shadow-emerald-500/20'
                : priceFlash === 'DOWN'
                ? 'bg-rose-950/40 border-rose-500/60 text-rose-300 shadow-md shadow-rose-500/20'
                : 'bg-slate-950/70 border-slate-800 text-slate-100'
            }`}>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <span>BTC / USDT Perpetual</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">TICK BY TICK</span>
              </div>
              <div className="flex items-baseline gap-2.5 mt-0.5 font-mono">
                <span className="text-base sm:text-lg font-black tracking-tight">
                  {displayBtcPrice ? formatPrice(displayBtcPrice) : '--'}
                </span>
                {displayBtcChange !== null ? (
                  <span className={`text-xs font-bold flex items-center gap-0.5 ${
                    displayBtcChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {displayBtcChange >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {formatPercent(displayBtcChange)}
                  </span>
                ) : (
                  <span className="text-xs font-mono text-slate-500">--</span>
                )}
              </div>
            </div>

            {/* Desktop Action Buttons */}
            <div className="hidden sm:flex items-center gap-2">
              <DataStateBadge state={dataState} />
              
              <button
                onClick={() => setIsAlertModalOpen(true)}
                className="p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 transition-colors relative border border-slate-700/60"
                title="High-Opportunity Telegram & Alert Center"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-400" />
              </button>

              <button
                onClick={() => runDeepScan()}
                disabled={dataState === 'SYNCING'}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${dataState === 'SYNCING' ? 'animate-spin' : ''}`} />
                <span>Rescan</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Market Sentiment & Health Matrix */}
      {marketStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Fear & Greed</div>
            <div className="text-sm font-mono font-bold text-amber-400 mt-1 flex items-center justify-between">
              <span>{marketStats.fearGreedIndex > 0 ? `${marketStats.fearGreedIndex} / 100` : 'N/A'}</span>
              <span className="text-[11px] font-semibold text-slate-300">{marketStats.fearGreedLabel || '--'}</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, marketStats.fearGreedIndex || 0))}%` }}
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Market Regime</div>
            <div className="text-sm font-mono font-bold text-slate-100 mt-1 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${
                marketStats.marketRegime === 'BULLISH' ? 'bg-emerald-400' : marketStats.marketRegime === 'BEARISH' ? 'bg-rose-400' : 'bg-amber-400'
              }`} />
              <span>{marketStats.marketRegime}</span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-1">
              BTC Dominance: {marketStats.btcDominance > 0 ? `${marketStats.btcDominance}%` : 'N/A'}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">24h Win Rate</div>
            <div className="text-sm font-mono font-bold text-emerald-400 mt-1 flex items-center gap-1">
              <ShieldCheck className="w-4 h-4" />
              <span>{marketStats.winRate24h > 0 ? `${marketStats.winRate24h}% TP Hit` : 'Live / Active'}</span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-1">
              Strict Multi-Timeframe SL
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">High Opportunity</div>
            <div className="text-sm font-mono font-bold text-cyan-400 mt-1 flex items-center gap-1">
              <Zap className="w-4 h-4" />
              <span>{highOpportunitySignals.length} Setups ≥30%</span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-1">
              Capital Preservation Active
            </div>
          </div>
        </div>
      )}

      {/* 3. Multi-User Isolated Auto-Trading Command Layer */}
      <CompactTradingSection />

      {/* 4. Best Opportunities Stream (>= 30% Potential Move, Hard-capped at 5) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-100 tracking-tight flex items-center gap-2">
                <span>Best High-Opportunity Setups</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  ≥30% MOVE POTENTIAL
                </span>
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                {highOpportunitySignals.length > 0
                  ? `Showing top ${highOpportunitySignals.length} unified opportunities with dynamic structural targets`
                  : 'Preserving capital: scanning all multi-timeframe confluences'}
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('signals')}
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
          >
            <span>All Signals ({signals.length})</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {highOpportunitySignals.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/60 border border-slate-800 font-mono grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-200">
              No Qualified Setups Exceeding 30% Move Right Now
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              MoonScanner strictly enforces capital preservation. Only trades exhibiting high-conviction structural expansions (TP3 &gt;= 30% and Grade A/A+) are promoted here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {highOpportunitySignals.map((sig) => (
              <CoinCard
                key={sig.id}
                signal={sig}
                onSelect={handleSelectSignal}
                onTrade={(s) => {
                  handleSelectSignal(s);
                  onNavigateTab('autotrade');
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 5. Quick Actions Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
        <button
          onClick={() => setIsSearchModalOpen(true)}
          className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 text-left transition-all group"
        >
          <div className="flex items-center justify-between text-cyan-400 mb-1.5">
            <Search className="w-4 h-4" />
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          </div>
          <div className="text-xs font-bold text-slate-200">Universal Search</div>
          <div className="text-[10px] font-mono text-slate-500 mt-0.5">Instant pair analysis</div>
        </button>

        <button
          onClick={() => onNavigateTab('premove')}
          className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-purple-500/40 text-left transition-all group"
        >
          <div className="flex items-center justify-between text-purple-400 mb-1.5">
            <Flame className="w-4 h-4" />
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400 transition-colors" />
          </div>
          <div className="text-xs font-bold text-slate-200">Pre-Move Radar</div>
          <div className="text-[10px] font-mono text-slate-500 mt-0.5">Pre-Pump / Pre-Dump</div>
        </button>

        <button
          onClick={() => onNavigateTab('radar')}
          className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-blue-500/40 text-left transition-all group"
        >
          <div className="flex items-center justify-between text-blue-400 mb-1.5">
            <Compass className="w-4 h-4" />
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 transition-colors" />
          </div>
          <div className="text-xs font-bold text-slate-200">Listing Radar</div>
          <div className="text-[10px] font-mono text-slate-500 mt-0.5">Early listing discovery</div>
        </button>

        <button
          onClick={() => onNavigateTab('news')}
          className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-emerald-500/40 text-left transition-all group"
        >
          <div className="flex items-center justify-between text-emerald-400 mb-1.5">
            <Newspaper className="w-4 h-4" />
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
          </div>
          <div className="text-xs font-bold text-slate-200">Catalyst News</div>
          <div className="text-[10px] font-mono text-slate-500 mt-0.5">Validated market events</div>
        </button>
      </div>

      {/* 6. Market Pulse: Radar & Catalyst Snippets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
        {/* Radar Snippet */}
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-bold text-slate-200 tracking-tight">
                Listing & Discovery Radar
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('radar')}
              className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 font-semibold"
            >
              Open Radar →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {hotRadar.map((item) => (
              <div
                key={item.symbol}
                onClick={() => setSelectedRadar(item)}
                className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/70 hover:border-blue-500/30 cursor-pointer flex items-center justify-between transition-colors"
              >
                <div>
                  <span className="font-bold text-xs text-slate-200">{item.symbol}</span>
                  <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                    Score: <strong className="text-amber-400">{item.moonScore}</strong> • {item.recommendedAction}
                  </div>
                </div>
                <span className={`text-xs font-mono font-bold ${item.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatPercent(item.change24h)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Breaking News Catalyst Snippet */}
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-200 tracking-tight">
                Real-Time Catalyst Intelligence
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('news')}
              className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 font-semibold"
            >
              All News →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {latestNews.map((n) => (
              <div
                key={n.id}
                onClick={() => setSelectedNews(n)}
                className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/70 hover:border-emerald-500/30 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                  <span>{n.source}</span>
                  <span className={n.sentiment === 'BULLISH' ? 'text-emerald-400' : n.sentiment === 'BEARISH' ? 'text-rose-400' : 'text-slate-400'}>
                    {n.sentiment} ({n.impactScore}/100)
                  </span>
                </div>
                <h4 className="text-xs font-medium text-slate-200 line-clamp-1">
                  {n.title}
                </h4>
                <div className="text-[9px] font-mono text-slate-500 mt-1">
                  {formatRelativeTime(n.publishedAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Universal Coin Search Modal */}
      <UniversalCoinSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        initialQuery={searchQuery}
        onSelectSignal={(s) => setSelectedSignal(s)}
      />
    </div>
  );
};

