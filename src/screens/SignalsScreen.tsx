import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { SignalCard } from '../components/SignalCard';
import { UniversalCoinSearchModal } from '../components/UniversalCoinSearchModal';
import { UniversalMarketCoverageBanner } from '../components/UniversalMarketCoverageBanner';
import { filterEliteSignals } from '../utils/priorityRanking';
import {
  Search,
  RefreshCw,
  Zap,
  Target,
  TrendingUp,
  CheckCircle,
  ShieldCheck,
  Clock,
  Sparkles,
  Layers,
  Flame,
  ShieldAlert,
  AlertTriangle,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import { MarketCategory, SignalQualityGrade } from '../types/crypto';

export const SignalsScreen: React.FC = () => {
  const {
    signals,
    filteredSignals,
    filter,
    setFilter,
    setSelectedSignal,
    runDeepScan,
    dataState,
    lifecycleStats,
    lastUpdated
  } = useApp();

  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchModalQuery, setSearchModalQuery] = useState('');
  const [viewMode, setViewMode] = useState<'ELITE' | 'ALL'>('ELITE');
  const [selectedMoveClass, setSelectedMoveClass] = useState<string>('ALL');

  const statuses = [
    { key: 'ALL', label: 'All States' },
    { key: 'ENTRY_NOW', label: 'Entry Now' },
    { key: 'ACTIVE', label: 'Active' },
    { key: 'COMPLETED', label: 'Completed' },
    { key: 'WAIT', label: 'Wait / Watch' },
  ] as const;

  const categories: { key: 'ALL' | MarketCategory; label: string }[] = [
    { key: 'ALL', label: 'All Universe' },
    { key: 'MAJOR', label: 'Majors' },
    { key: 'ALTCOIN', label: 'Altcoins' },
    { key: 'MEME_HIGH_BETA', label: 'Memes / Beta' },
    { key: 'NEW_LISTING', label: 'New Listings' },
  ];

  const rankingBuckets = [
    { key: 'ALL', label: 'All Opportunities' },
    { key: 'STRONGEST_A_PLUS', label: 'A+ Elite' },
    { key: 'STRONGEST_A', label: 'A High Conviction' },
    { key: 'EARLY_OPPORTUNITY', label: 'Early Catalyst / Pre-Pump' },
    { key: 'WATCH_OPPORTUNITY', label: 'Watch / Retest' },
  ] as const;

  const moveClasses = [
    { key: 'ALL', label: 'All Unified Setups' },
    { key: 'MAJOR_MOVE', label: '🚀 Major Move (≥30%)' },
    { key: 'EXTREME_MOVE', label: '⚡ Extreme Move (≥50%)' },
    { key: 'PRE_MOVE', label: '⏳ Pre-Move Coiling' },
    { key: 'NEWS_CATALYST', label: '📰 News Catalyst' },
    { key: 'MACRO_EXPANSION_100PCT_PLUS', label: '100%+ Macro' },
  ];

  const [visibleLimit, setVisibleLimit] = useState<number>(20);

  const handleSelectSignal = useCallback((s: any) => {
    setSelectedSignal(s);
  }, [setSelectedSignal]);

  const displayedSignals = useMemo(() => {
    let list = viewMode === 'ELITE' ? filterEliteSignals(filteredSignals) : filteredSignals;
    if (selectedMoveClass === 'MAJOR_MOVE') {
      list = list.filter(s => (s.majorMoveClass === 'MAJOR_MOVE' || s.majorMoveClass === 'EXTREME_MOVE') && (s.majorMovePotentialPct !== undefined ? s.majorMovePotentialPct >= 30 : true));
    } else if (selectedMoveClass === 'EXTREME_MOVE') {
      list = list.filter(s => s.majorMoveClass === 'EXTREME_MOVE' && (s.majorMovePotentialPct !== undefined ? s.majorMovePotentialPct >= 50 : true));
    } else if (selectedMoveClass === 'PRE_MOVE') {
      list = list.filter(s => Boolean(s.preMoveReport));
    } else if (selectedMoveClass === 'NEWS_CATALYST') {
      list = list.filter(s => Boolean(s.newsCatalyst || s.newsImpactReport?.isConfirmedCatalyst));
    } else if (selectedMoveClass !== 'ALL') {
      list = list.filter(s => s.expectedMoveClass === selectedMoveClass);
    }
    // Phase 20 Hardening: Strict deduplication (One Coin = One Current Unified Signal)
    const seen = new Set<string>();
    const deduplicated: typeof filteredSignals = [];
    for (const s of list) {
      const clean = (s.symbol || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
      if (!seen.has(clean)) {
        seen.add(clean);
        deduplicated.push(s);
      }
    }
    return deduplicated;
  }, [viewMode, filteredSignals, selectedMoveClass]);

  const eliteCount = useMemo(() => filterEliteSignals(signals).length, [signals]);

  return (
    <div className="space-y-5 pb-24 max-w-5xl mx-auto">
      {/* Dashboard Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2 font-mono">
            <Zap className="w-6 h-6 text-cyan-400" />
            <span>Market Intelligence & Elite Signals</span>
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Universal coverage across Majors, Alts, Memes, and New Listings. Surfacing only verified, high-asymmetry opportunities.
          </p>
        </div>

        <button
          onClick={() => runDeepScan()}
          disabled={dataState === 'SYNCING'}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50 font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${dataState === 'SYNCING' ? 'animate-spin' : ''}`} />
          <span>Rescan Market</span>
        </button>
      </div>

      {/* Universal Market Coverage Telemetry Banner */}
      <UniversalMarketCoverageBanner />

      {/* Primary Feed View Switcher: Elite Signals vs All Opportunities */}
      <div className="flex items-center justify-between p-2 rounded-2xl bg-slate-900/80 border border-slate-800 font-mono text-xs flex-wrap gap-2">
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setViewMode('ELITE')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-all ${
              viewMode === 'ELITE'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Elite Setups ({eliteCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('ALL')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-all ${
              viewMode === 'ALL'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>All Market Opportunities ({signals.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">Move Potential:</span>
          <select
            value={selectedMoveClass}
            onChange={(e) => setSelectedMoveClass(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-400"
          >
            {moveClasses.map(mc => (
              <option key={mc.key} value={mc.key}>{mc.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Filter Control Center */}
      <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80 space-y-3 font-mono">
        {/* Search Bar & Direction Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Filter feed or search coin symbol (e.g. BTC, SOL, NYLO, SUI, PEPE)..."
              value={filter.searchQuery}
              onChange={(e) => setFilter({ ...filter, searchQuery: e.target.value })}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setSearchModalQuery(filter.searchQuery);
              setIsSearchModalOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-xs font-bold border border-cyan-500/30 flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Universal Search</span>
          </button>

          <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
            {(['ALL', 'LONG', 'SHORT'] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => setFilter({ ...filter, direction: dir })}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  filter.direction === dir
                    ? dir === 'LONG'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : dir === 'SHORT'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {dir}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-800/60">
          <span className="text-[11px] text-slate-400 mr-1 flex items-center gap-1">
            <Layers className="w-3 h-3 text-cyan-400" /> Category:
          </span>
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setFilter({ ...filter, category: cat.key })}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                (filter.category || 'ALL') === cat.key
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-950/40'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Opportunity Ranking Bucket Filter */}
        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-800/60">
          <span className="text-[11px] text-slate-400 mr-1 flex items-center gap-1">
            <Flame className="w-3 h-3 text-amber-400" /> Discovery:
          </span>
          {rankingBuckets.map((rb) => (
            <button
              key={rb.key}
              onClick={() => setFilter({ ...filter, rankingBucket: rb.key })}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                (filter.rankingBucket || 'ALL') === rb.key
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-950/40'
              }`}
            >
              {rb.label}
            </button>
          ))}
        </div>

        {/* Status / Readiness & Score Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400 mr-1">Signal State:</span>
            {statuses.map((st) => (
              <button
                key={st.key}
                onClick={() => setFilter({ ...filter, status: st.key })}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  filter.status === st.key
                    ? st.key === 'ENTRY_NOW'
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-700 text-slate-100 border border-slate-600'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-950/40'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Sort By:</span>
              <select
                value={filter.sortBy || 'PRIORITY_SCORE'}
                onChange={(e) => setFilter({ ...filter, sortBy: e.target.value as any })}
                className="bg-slate-950/80 border border-amber-500/30 text-xs font-semibold text-amber-300 rounded-lg px-2.5 py-1 focus:outline-none"
              >
                <option value="PRIORITY_SCORE">⚡ Priority Score</option>
                <option value="REALISTIC_UPSIDE">📈 Realistic Upside</option>
                <option value="RISK_REWARD">⚖️ Risk / Reward</option>
                <option value="MOON_SCORE">🌕 MoonScore</option>
                <option value="NEWEST">🕒 Newest</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Min Score:</span>
              <select
                value={filter.minScore}
                onChange={(e) => setFilter({ ...filter, minScore: Number(e.target.value) })}
                className="bg-slate-950/70 border border-slate-800 text-xs text-cyan-300 rounded-lg px-2 py-1 focus:outline-none"
              >
                <option value={0}>All Scores</option>
                <option value={70}>&gt; 70 (Solid)</option>
                <option value={80}>&gt; 80 (High Confluence)</option>
                <option value={90}>&gt; 90 (MoonScore Elite)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Signal Grid or Empty / Wait State */}
      {displayedSignals.length === 0 ? (
        viewMode === 'ELITE' ? (
          <div className="p-12 text-center rounded-2xl bg-amber-950/20 border border-amber-500/30 text-amber-300/90 font-mono space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-amber-200">
              No high-confidence opportunities right now.
            </h3>
            <p className="text-xs text-amber-300/80 max-w-lg mx-auto leading-relaxed">
              MoonScanner strictly adheres to selective capital preservation. No current market assets meet the combined criteria for Grade A+/A quality, zero-chase execution readiness, verified structural targets, and minimum 1:1.5 R:R.
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setViewMode('ALL')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors"
              >
                Browse All Market Setups &rarr;
              </button>
            </div>
          </div>
        ) : (
          <div className="p-16 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 font-mono">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-500">
              <Zap className="w-6 h-6" />
            </div>
            <div className="font-semibold text-slate-300">No matching setups for active criteria</div>
            <div className="text-xs text-slate-500 mt-1">Try broadening your category, score or direction filters</div>
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedSignals.slice(0, visibleLimit).map((sig) => (
              <SignalCard
                key={sig.id}
                signal={sig}
                onSelect={handleSelectSignal}
              />
            ))}
          </div>

          {displayedSignals.length > visibleLimit && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 20)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-xs font-mono text-cyan-300 transition-colors shadow-sm"
              >
                Show More Setups ({displayedSignals.length - visibleLimit} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Universal Coin Intelligence Search Modal */}
      <UniversalCoinSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        initialQuery={searchModalQuery}
        onSelectSignal={handleSelectSignal}
      />
    </div>
  );
};
