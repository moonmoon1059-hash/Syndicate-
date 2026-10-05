import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatPrice, formatPercent } from '../utils/formatters';
import { Signal, PreMoveReport } from '../types/crypto';
import {
  Zap,
  Activity,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Clock,
  Flame,
  Layers,
  ArrowRight,
  Filter,
  RefreshCw,
  Search,
  Sparkles,
  Info,
  CheckCircle2,
  Lock,
  ChevronRight
} from 'lucide-react';
import { fetchPreMoveSignals } from '../services/api';

export const PreMoveScreen: React.FC = () => {
  const { signals, preMoveSignals, setPreMoveSignals, setSelectedSignal, runDeepScan, isScanning, reconcileSignals } = useApp();
  const [filterDirection, setFilterDirection] = useState<'ALL' | 'PRE_PUMP' | 'PRE_DUMP'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'COILING' | 'READY' | 'TRIGGERED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [authoritativeFeed, setAuthoritativeFeed] = useState<Signal[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [feedLoadedOnce, setFeedLoadedOnce] = useState(false);

  const loadAuthoritativeFeed = async (forceFresh = false) => {
    setIsLoadingFeed(true);
    try {
      const fresh = await fetchPreMoveSignals(forceFresh);
      if (Array.isArray(fresh)) {
        console.log(`[PreMove Diagnostics] PREMOVE_UI_API_COUNT=${fresh.length}`);
        setAuthoritativeFeed(fresh);
        if (setPreMoveSignals) {
          setPreMoveSignals(fresh);
        }
      }
    } catch (err) {
      console.warn('[PreMoveScreen] Pre-move feed fetch error:', err);
    } finally {
      setIsLoadingFeed(false);
      setFeedLoadedOnce(true);
    }
  };

  // Immediate and continuous sync from preMoveSignals context whenever available
  useEffect(() => {
    if (preMoveSignals && preMoveSignals.length > 0 && authoritativeFeed.length === 0) {
      setAuthoritativeFeed(preMoveSignals);
      setIsLoadingFeed(false);
    }
  }, [preMoveSignals, authoritativeFeed.length]);

  // Sync dedicated authoritative pre-move feed immediately on mount and periodically
  useEffect(() => {
    loadAuthoritativeFeed(true);
    const interval = setInterval(() => loadAuthoritativeFeed(false), 20000);
    return () => clearInterval(interval);
  }, []);

  // Use authoritative pre-move feed directly, with seamless fallback to preMoveSignals
  const preMoveCandidates = useMemo(() => {
    const rawList = (authoritativeFeed && authoritativeFeed.length > 0)
      ? authoritativeFeed
      : ((preMoveSignals && preMoveSignals.length > 0) ? preMoveSignals : []);

    const list = rawList.filter(sig => {
      // Authoritative feed is already pre-qualified by server engine
      if (sig.preMoveReport || (sig.id && sig.id.includes('PREMOVE'))) return true;
      return true;
    }).map(sig => {
      const pm = sig.preMoveReport;
      const isLong = sig.direction === 'LONG';
      const isPrePump = pm?.projectedDirection === 'BULLISH' || ((!pm?.projectedDirection || pm?.projectedDirection === 'NEUTRAL') && isLong) || isLong;
      const isTriggered = pm?.setupStage === 'TRIGGERED' || sig.status === 'ENTRY_TRIGGERED';
      const isReady = !isTriggered && (pm?.setupStage === 'READY_TO_BREAK' || pm?.recommendedAction === 'PREPARE_BREAKOUT_LIMIT' || sig.setupMaturity === 'NEAR_TRIGGER' || sig.actionablePriority === 'URGENT_BREAKOUT_COIL');
      const isCoiling = !isTriggered && !isReady;

      const entryLow = sig.entryZoneLow || sig.entryPrice;
      const entryHigh = sig.entryZoneHigh || sig.entryPrice;
      const validTargets = (sig.targets || []).filter(t => typeof t.price === 'number' && t.price > 0 && t.status !== 'INVALIDATED');
      const terminalTarget = validTargets.length > 0 ? validTargets[validTargets.length - 1].price : (sig.entryPrice || 0);
      
      const expectedMovePct = validTargets.length > 0
        ? (isLong
            ? Number((((terminalTarget - sig.entryPrice) / sig.entryPrice) * 100).toFixed(1))
            : Number((((sig.entryPrice - terminalTarget) / sig.entryPrice) * 100).toFixed(1)))
        : (sig.majorMovePotentialPct || 0);

      const invalidationPrice = pm?.invalidationPrice || sig.stopLoss;
      const rvol = sig.rvol || (sig as any).rvol24h || (sig.orderflowAnalysis?.rvol) || 0;

      const isExhausted = Boolean(
        sig.largeMoveIntelligence?.isAlreadyExtended ||
        sig.largeMoveIntelligence?.antiChaseActive ||
        sig.entryStatus === 'ENTRY_MISSED' ||
        (sig.currentPrice && pm?.noChaseLevel && (isLong ? sig.currentPrice > pm.noChaseLevel : sig.currentPrice < pm.noChaseLevel)) ||
        (sig.pumpDumpIntelligence && sig.pumpDumpIntelligence.riskLevel === 'CRITICAL')
      );

      return {
        signal: sig,
        pm,
        isPrePump,
        isCoiling,
        isReady,
        isTriggered,
        entryLow,
        entryHigh,
        validTargets,
        invalidationPrice,
        rvol,
        expectedMovePct: Math.max(0, expectedMovePct),
        isExhausted
      };
    });

    console.log(`[PreMove Diagnostics] PREMOVE_UI_STATE_COUNT=${list.length}`);
    return list;
  }, [authoritativeFeed, preMoveSignals, signals]);

  // Filter count metrics
  const counts = useMemo(() => {
    return {
      allMoves: preMoveCandidates.length,
      prePump: preMoveCandidates.filter(c => c.isPrePump).length,
      preDump: preMoveCandidates.filter(c => !c.isPrePump).length,
      coiling: preMoveCandidates.filter(c => c.isCoiling).length,
      ready: preMoveCandidates.filter(c => c.isReady).length,
      triggered: preMoveCandidates.filter(c => c.isTriggered).length
    };
  }, [preMoveCandidates]);

  // Apply filters
  const filteredList = useMemo(() => {
    const list = preMoveCandidates.filter(item => {
      if (filterDirection === 'PRE_PUMP' && !item.isPrePump) return false;
      if (filterDirection === 'PRE_DUMP' && item.isPrePump) return false;

      if (filterStatus === 'COILING' && !item.isCoiling) return false;
      if (filterStatus === 'READY' && !item.isReady) return false;
      if (filterStatus === 'TRIGGERED' && !item.isTriggered) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        return item.signal.symbol.toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => {
      const scoreA = (a.pm?.coilScore || 50) + (a.isReady ? 20 : 0);
      const scoreB = (b.pm?.coilScore || 50) + (b.isReady ? 20 : 0);
      return scoreB - scoreA;
    });

    console.log(`[PreMove Diagnostics] PREMOVE_UI_AFTER_FILTER_COUNT=${list.length}`);
    console.log(`[PreMove Diagnostics] PREMOVE_UI_RENDER_COUNT=${list.length}`);
    return list;
  }, [preMoveCandidates, filterDirection, filterStatus, searchQuery]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-24 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-3xl border border-slate-800/80 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-400">
              <Flame className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
                  Pre-Move Intelligence Radar
                </h1>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold uppercase tracking-wider">
                  Pre-Pump / Pre-Dump
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Early-stage volatility compression, liquidity sweeps & orderflow absorption before the major move becomes obvious
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              runDeepScan();
              loadAuthoritativeFeed();
            }}
            disabled={isScanning || isLoadingFeed}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono font-semibold transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning || isLoadingFeed ? 'animate-spin text-amber-400' : ''}`} />
            <span>{isScanning || isLoadingFeed ? 'Scanning Coils...' : 'Refresh Radar'}</span>
          </button>
        </div>
      </div>

      {/* Rules Notice */}
      <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-[11px] leading-relaxed">
          <strong className="text-cyan-300 font-semibold">Early Warning Radar Directive:</strong>
          <span> Coins displayed here are being monitored because multi-dimensional market evidence indicates an unusually large move may be developing prior to public breakout. <em>This is an early-warning radar, not a guaranteed move. Always honor structural invalidation levels.</em></span>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/70 p-3.5 rounded-2xl border border-slate-800/80">
        <div className="flex flex-wrap items-center gap-2">
          {/* Direction Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['ALL', 'PRE_PUMP', 'PRE_DUMP'] as const).map(dir => {
              const count = dir === 'ALL' ? counts.allMoves : dir === 'PRE_PUMP' ? counts.prePump : counts.preDump;
              return (
                <button
                  key={dir}
                  onClick={() => setFilterDirection(dir)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                    filterDirection === dir
                      ? dir === 'PRE_PUMP'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : dir === 'PRE_DUMP'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{dir === 'ALL' ? 'All Moves' : dir === 'PRE_PUMP' ? '🟢 Pre-Pump' : '🔴 Pre-Dump'}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    filterDirection === dir ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['ALL', 'COILING', 'READY', 'TRIGGERED'] as const).map(st => {
              const count = st === 'ALL' ? counts.allMoves : st === 'COILING' ? counts.coiling : st === 'READY' ? counts.ready : counts.triggered;
              return (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                    filterStatus === st
                      ? 'bg-slate-800 text-amber-300 border border-amber-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{st === 'ALL' ? 'All Stages' : st === 'COILING' ? '⏳ Coiling' : st === 'READY' ? '⚡ Ready' : '🎯 Triggered'}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    filterStatus === st ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search coin (e.g. SUI, SOL)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>
      </div>

      {/* Candidates List */}
      {isLoadingFeed && preMoveCandidates.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/30 rounded-3xl border border-slate-800/80">
          <Activity className="w-12 h-12 text-amber-400 mx-auto mb-3 animate-pulse" />
          <h3 className="text-base font-bold text-slate-300">
            Scanning Real-Time Market Structure & Coils...
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 font-mono">
            Loading early volatility compression, liquidity sweeps, and orderflow absorption setups.
          </p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/30 rounded-3xl border border-slate-800/80">
          <Activity className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-300">
            {preMoveCandidates.length === 0
              ? 'No Extreme Pre-Move Setups Currently Active'
              : 'No Pre-Move Opportunities Meeting Filter Criteria'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 font-mono">
            {preMoveCandidates.length > 0
              ? `${preMoveCandidates.length} pre-move opportunities exist. Try resetting your search or stage filters.`
              : 'Silence is correct when the market does not present genuine 100%+ asymmetric expansion coils. Autonomous radar scans multi-timeframe compression 24/7.'}
          </p>
          {preMoveCandidates.length > 0 && (filterDirection !== 'ALL' || filterStatus !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setFilterDirection('ALL');
                setFilterStatus('ALL');
                setSearchQuery('');
              }}
              className="mt-4 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-mono font-bold transition-all"
            >
              Reset Filters ({preMoveCandidates.length} Total Opportunities)
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredList.map(({ signal, pm, isPrePump, isCoiling, isReady, isTriggered, entryLow, entryHigh, validTargets, expectedMovePct, isExhausted, invalidationPrice, rvol }) => {
            const hasMajorMove = (signal.majorMoveClass === 'MAJOR_MOVE' || signal.majorMoveClass === 'EXTREME_MOVE') && expectedMovePct >= 30;
            const isExtreme = (signal.majorMoveClass === 'EXTREME_MOVE' || expectedMovePct >= 50);

            // Section 8: State Terminology & Conditional Warning Badges
            const detailedState = pm?.detailedState || signal.preMoveDetailedState || (isPrePump ? (isTriggered ? 'TRIGGERED' : isReady ? 'READY_TO_BREAK' : 'COILING') : (isTriggered ? 'DUMP_TRIGGERED' : isReady ? 'DUMP_WATCH' : 'BEARISH_STRUCTURE'));
            const showBigMoveComing = detailedState === 'BIG_MOVE_COMING' || (isPrePump && pm?.directionalWarning === 'BIG_MOVE_COMING' && (signal.isExtremeCandidate || pm?.isExtremeCandidate));
            const showBigDumpComing = detailedState === 'BIG_DUMP_COMING' || (!isPrePump && pm?.directionalWarning === 'BIG_DUMP_COMING' && (signal.isExtremeCandidate || pm?.isExtremeCandidate));

            // Section 12: Expected Move represents Large-Move Potential ONLY (never ordinary TP projections)
            const potentialLabel = expectedMovePct >= 100 ? `+${expectedMovePct}% (Extreme)` :
              expectedMovePct >= 50 ? `+${expectedMovePct}% (Extreme)` :
              expectedMovePct >= 30 ? `+${expectedMovePct}% (Major)` :
              expectedMovePct >= 10 ? `+${expectedMovePct}% (Strong)` :
              expectedMovePct >= 4 ? `+${expectedMovePct}% (Moderate)` :
              `+${expectedMovePct}% (Small Move)`;

            return (
              <div
                key={signal.id || signal.symbol}
                onClick={() => setSelectedSignal(signal)}
                className="group cursor-pointer bg-slate-900/80 hover:bg-slate-900 border border-slate-800/90 hover:border-slate-700/80 rounded-2xl p-5 transition-all shadow-xl hover:shadow-2xl relative overflow-hidden"
              >
                {/* Major / Extreme Move Glowing Accent */}
                {hasMajorMove && (
                  <div className={`absolute top-0 right-0 left-0 h-1 bg-gradient-to-r ${
                    isExtreme
                      ? 'from-purple-500 via-pink-500 to-amber-400'
                      : 'from-amber-500 via-cyan-500 to-emerald-400'
                  }`} />
                )}

                {/* Top Row: Symbol, Direction Badge, Stage, Quality */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-black text-slate-100 tracking-tight">{signal.symbol}</span>
                      
                      {/* Prominent Early-Warning Badge ONLY when extreme evidence justifies it */}
                      {showBigMoveComing ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono font-black bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm shadow-blue-500/20 animate-pulse">
                          <span>🔵</span>
                          <span>BIG MOVE COMING</span>
                        </span>
                      ) : showBigDumpComing ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/20 animate-pulse">
                          <span>🔴</span>
                          <span>BIG DUMP COMING</span>
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-mono font-bold ${
                          isPrePump ? 'bg-blue-500/10 text-blue-300 border border-blue-500/30' : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                        }`}>
                          <span>{detailedState.replace(/_/g, ' ')}</span>
                        </span>
                      )}

                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase ${
                        isPrePump
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                      }`}>
                        {isPrePump ? '🟢 PRE-PUMP' : '🔴 PRE-DUMP'}
                      </span>
                      {hasMajorMove && (
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-black ${
                          isExtreme
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}>
                          {isExtreme ? '⚡ EXTREME POTENTIAL' : '🚀 MAJOR POTENTIAL'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] font-mono text-slate-400">
                      <span>Price: <strong className="text-slate-200">{formatPrice(signal.currentPrice || signal.entryPrice)}</strong></span>
                      <span>•</span>
                      <span className={`${
                        isReady ? 'text-emerald-400 font-bold' : isTriggered ? 'text-cyan-400 font-bold' : 'text-amber-400'
                      }`}>
                        Stage: {detailedState.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs px-2.5 py-1 rounded-xl bg-slate-950 font-mono font-black text-cyan-300 border border-slate-800">
                      Grade {signal.qualityGrade || 'A'}
                    </span>
                    <div className="text-[10px] font-mono text-slate-400 mt-1">
                      Score: <strong className="text-amber-400">{typeof pm?.coilScore === 'number' ? `${pm.coilScore}/100` : (typeof signal.confidence === 'number' ? `${signal.confidence}/100` : 'N/A')}</strong>
                    </div>
                  </div>
                </div>

                {/* Anti-Chase Alert Box if Extended */}
                {isExhausted && (
                  <div className="mb-3 p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-center gap-2 text-rose-300 text-[11px] font-mono">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Anti-Chase Warning: Asset is extended from base. Wait for structural retest.</span>
                  </div>
                )}

                {/* Trade Setup Matrix (Entry Range, Current Price, SL, Invalidation, Expected Move, R:R) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 text-xs font-mono mb-3">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Entry Range</span>
                    <span className="text-slate-200 font-bold">
                      {formatPrice(entryLow)} – {formatPrice(entryHigh)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Current Price</span>
                    <span className="text-cyan-300 font-bold">{formatPrice(signal.currentPrice || signal.entryPrice)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Structural SL</span>
                    <span className="text-rose-400 font-bold">{formatPrice(signal.stopLoss)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Invalidation</span>
                    <span className="text-amber-400 font-bold">{formatPrice(invalidationPrice)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Expected Move</span>
                    <span className={`font-black ${potentialLabel.includes('Extreme') || potentialLabel.includes('500') || potentialLabel.includes('300') || potentialLabel.includes('100') ? 'text-purple-300' : 'text-emerald-400'}`}>
                      {potentialLabel}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">R : R</span>
                    <span className="text-cyan-400 font-bold">1 : {signal.riskRewardRatio && signal.riskRewardRatio > 0 ? signal.riskRewardRatio.toFixed(1) : 'N/A'}</span>
                  </div>
                </div>

                {/* Target Ladder & Volume/RVOL Stats */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-[11px] font-mono">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    <span className="text-slate-500 text-[10px] uppercase font-bold shrink-0">Targets:</span>
                    {validTargets.slice(0, 4).map((t, idx) => (
                      <div key={idx} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 whitespace-nowrap">
                        <span className="text-slate-400">{t.label || `TP${idx + 1}`}:</span>
                        <span className="text-emerald-400 font-bold">{formatPrice(t.price)}</span>
                        <span className="text-[9px] text-slate-500">(+{t.percentage || 0}%)</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] shrink-0">
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                      RVOL: <strong className="text-amber-300 font-bold">{rvol > 0 ? `${rvol.toFixed(1)}x` : 'N/A'}</strong>
                    </span>
                    {signal.volume24h ? (
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                        Vol: <strong className="text-slate-200">${((signal.volume24h || 0) / 1e6).toFixed(1)}M</strong>
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Detailed Radar Evidence Grid (RVOL, OI, Structure, Liquidity, Volatility, MTF) */}
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="font-bold text-slate-200">Radar Telemetry & Conditions:</span>
                    <span className="text-[10px] text-amber-400 font-mono font-bold">
                      Early Score: {pm?.coilScore !== undefined ? `${pm.coilScore}/100` : 'N/A'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px] font-mono">
                    {/* Structure Condition */}
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block text-[9px] uppercase">Structure</span>
                      <span className="text-cyan-300 font-bold truncate block">{signal.marketStructure || 'Compression Base'}</span>
                    </div>

                    {/* Volatility Condition */}
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block text-[9px] uppercase">Volatility Squeeze</span>
                      <span className={`font-bold block ${pm?.volatilitySqueeze ? 'text-amber-300' : 'text-slate-300'}`}>
                        {pm?.volatilitySqueeze ? '⚡ Squeeze Ready' : (typeof pm?.compressionRatio === 'number' ? `Ratio: ${pm.compressionRatio}%` : 'Ratio: N/A')}
                      </span>
                    </div>

                    {/* OI Condition */}
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block text-[9px] uppercase">Derivatives OI</span>
                      <span className="text-emerald-300 font-bold truncate block">
                        {pm?.openInterestBuild?.implication || (signal.derivativesData?.status === 'AVAILABLE' ? 'OI Accumulating' : 'Spot Volume Only')}
                      </span>
                    </div>

                    {/* Liquidity Condition */}
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block text-[9px] uppercase">Liquidity Sweep</span>
                      <span className={`font-bold block truncate ${pm?.fakeoutSweep?.detected ? 'text-purple-300' : 'text-slate-400'}`}>
                        {pm?.fakeoutSweep?.detected ? (pm.fakeoutSweep.reclaimed ? 'Sweep Reclaimed' : 'Sweep Detected') : 'Clean Range'}
                      </span>
                    </div>

                    {/* MTF Confirmation */}
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block text-[9px] uppercase">MTF Align</span>
                      <span className="text-blue-300 font-bold block">
                        {pm?.multiTimeframeCoil ? (pm.multiTimeframeCoil.aligned1h ? '15m/1h/4h Aligned' : '1h Base Aligned') : '1h Base Aligned'}
                      </span>
                    </div>

                    {/* Invalidation Condition */}
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block text-[9px] uppercase">Invalidation</span>
                      <span className="text-rose-400 font-bold truncate block">
                        {formatPrice(invalidationPrice)}
                      </span>
                    </div>
                  </div>

                  {/* Early Warning Message & Thesis */}
                  <p className="text-[11px] text-slate-300 leading-tight pt-1 border-t border-slate-900">
                    <strong className="text-amber-400 font-semibold">Radar Warning: </strong>
                    {pm?.earlyWarningMessage || signal.primaryReason || `Evidence suggests an unusually large move may be developing in ${signal.symbol}.`}
                  </p>
                </div>

                {/* Card Footer */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/60 text-[11px] font-mono text-slate-500">
                  <div className="flex items-center gap-3">
                    <span>Window: {pm?.timingWindow || signal.timingWindow || '1 - 4 hours'}</span>
                    <span className="hidden sm:inline text-slate-600">•</span>
                    <span className="text-[10px] text-slate-500 truncate max-w-[140px] sm:max-w-[200px]">ID: {signal.id}</span>
                  </div>
                  <div className="flex items-center gap-1 text-cyan-400 group-hover:translate-x-0.5 transition-transform">
                    <span>Inspect Setup</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
