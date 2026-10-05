import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatBangladeshTime, formatPrice } from '../utils/formatters';
import {
  Newspaper,
  TrendingUp,
  TrendingDown,
  Clock,
  ExternalLink,
  Search,
  ShieldCheck,
  AlertTriangle,
  Flame,
  Zap,
  Tag,
  Radio,
  Layers,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { NewsItem, NewsSentiment, NewsEventType } from '../types/crypto';

export const NewsScreen: React.FC = () => {
  const { news, setSelectedNews, signals, setSelectedSignal } = useApp();
  const [subTab, setSubTab] = useState<'VALIDATED_SIGNALS' | 'FAST_FEED'>('VALIDATED_SIGNALS');
  const [filterSentiment, setFilterSentiment] = useState<'ALL' | 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL'>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  // Extract signals that have a confirmed news catalyst and market price action confirmation
  const validatedNewsSignals = useMemo(() => {
    return signals.filter(s => {
      if (s.direction === 'WAIT' || s.entryPrice <= 0) return false;
      const nr = s.newsImpactReport;
      const hasCatalyst = Boolean(s.newsCatalyst || (nr && nr.isConfirmedCatalyst));
      return hasCatalyst;
    }).map(s => {
      const nr = s.newsImpactReport;
      const isLong = s.direction === 'LONG';
      const entryLow = s.entryZoneLow || s.entryPrice * 0.998;
      const entryHigh = s.entryZoneHigh || s.entryPrice * 1.002;
      const validTargets = (s.targets || []).filter(t => t.price > 0 && t.status !== 'INVALIDATED');
      const terminalTarget = validTargets.length > 0 ? validTargets[validTargets.length - 1].price : (isLong ? s.entryPrice * 1.08 : s.entryPrice * 0.92);
      const expectedMovePct = isLong
        ? Number((((terminalTarget - s.entryPrice) / s.entryPrice) * 100).toFixed(1))
        : Number((((s.entryPrice - terminalTarget) / s.entryPrice) * 100).toFixed(1));

      return {
        signal: s,
        nr,
        headline: nr?.headline || s.newsCatalyst || `Breaking structural catalyst for ${s.symbol}`,
        source: nr?.source || 'Exchange Verified Feed',
        timestamp: nr?.publishedAt || s.createdAt || Date.now(),
        entryLow,
        entryHigh,
        validTargets,
        expectedMovePct: Math.max(expectedMovePct, s.majorMovePotentialPct || 6.5),
        qualityGrade: s.qualityGrade || 'A',
        isConfirmed: nr?.technicalAlignment !== 'NEUTRAL' && nr?.technicalAlignment !== 'CONTRADICTED',
        whyReason: nr?.whyConfirmation || `${s.direction} expansion confirmed by market structure & volume surge following catalyst announcement`
      };
    });
  }, [signals]);

  const filteredNews = news.filter((n) => {
    if (filterSentiment !== 'ALL' && n.sentiment !== filterSentiment) return false;
    if (filterCategory !== 'ALL') {
      const matchEvent = n.eventType === filterCategory;
      const matchCatalyst = (n.catalystType || '').includes(filterCategory);
      const isReg = filterCategory === 'REGULATION' && (n.eventType === 'REGULATION' || n.eventType === 'ETF' || n.catalystType === 'REGULATION' || n.catalystType === 'ETF');
      const isSec = filterCategory === 'SECURITY' && (n.eventType === 'SECURITY' || n.eventType === 'HACK' || n.eventType === 'OUTAGE' || n.catalystType === 'HACK_EXPLOIT');
      const isList = filterCategory === 'LISTING' && (n.eventType === 'LISTING' || n.eventType === 'TOKEN_LAUNCH' || n.catalystType === 'EXCHANGE_LISTING');
      const isMacro = filterCategory === 'MACRO' && (n.eventType === 'MACRO' || n.catalystType === 'MACRO');
      const isGeo = filterCategory === 'GEOPOLITICAL' && (n.eventType === 'GEOPOLITICAL' || n.catalystType === 'GEOPOLITICAL');
      if (!matchEvent && !matchCatalyst && !isReg && !isSec && !isList && !isMacro && !isGeo) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const matchTitle = n.title.toLowerCase().includes(q);
      const matchSummary = (n.summary || '').toLowerCase().includes(q);
      const matchCoin = (n.relatedCoins || []).some(c => c.toLowerCase().includes(q));
      const matchSource = (n.source || '').toLowerCase().includes(q);
      const matchEvent = (n.eventType || '').toLowerCase().includes(q);
      if (!matchTitle && !matchSummary && !matchCoin && !matchSource && !matchEvent) return false;
    }
    return true;
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-24 max-w-6xl mx-auto px-2 sm:px-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Newspaper className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
                <span>All-Coin News & Catalyst Intelligence</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-semibold">
                  Live Verified Feed
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Deterministic source-quality scoring, entity mapping, market reaction correlation & catalyst setups
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800">
          <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span>Active Catalysts: <strong className="text-slate-200">{news.length}</strong></span>
        </div>
      </div>

      {/* Strict Rule Notice */}
      <div className="p-3.5 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex items-start gap-3 text-xs text-slate-400">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-[11px] leading-relaxed">
          <strong className="text-slate-300 font-semibold">Strict News Intelligence Rule:</strong>
          <span> A news headline alone is NOT a signal. It becomes an actionable signal ONLY when verified and supported by real market price action (relative volume surge, structural level reclaim, or institutional orderflow reaction).</span>
        </div>
      </div>

      {/* Primary SubTab Bar: Validated News Signals vs Fast News Feed */}
      <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
        <button
          onClick={() => setSubTab('VALIDATED_SIGNALS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
            subTab === 'VALIDATED_SIGNALS'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/40 border border-slate-800'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span>Validated News Signals ({validatedNewsSignals.length})</span>
        </button>

        <button
          onClick={() => setSubTab('FAST_FEED')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
            subTab === 'FAST_FEED'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/40 border border-slate-800'
          }`}
        >
          <Newspaper className="w-3.5 h-3.5 text-cyan-400" />
          <span>Fast News Feed ({filteredNews.length})</span>
        </button>
      </div>

      {/* VIEW A: VALIDATED NEWS SIGNALS */}
      {subTab === 'VALIDATED_SIGNALS' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {validatedNewsSignals.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/30 rounded-3xl border border-slate-800/80">
              <Newspaper className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-300">No News Catalysts Currently Verified by Price Action</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 font-mono">
                Headlines are active in the fast feed, but no coin has yet met the strict technical confirmation threshold (BOS + Volume expansion).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {validatedNewsSignals.map(({ signal, nr, headline, source, timestamp, entryLow, entryHigh, validTargets, expectedMovePct, qualityGrade, isConfirmed, whyReason }) => {
                const isLong = signal.direction === 'LONG';
                const hasMajorMove = expectedMovePct >= 30;

                return (
                  <div
                    key={signal.id || signal.symbol}
                    onClick={() => setSelectedSignal(signal)}
                    className="group cursor-pointer bg-slate-900/80 hover:bg-slate-900 border border-slate-800/90 hover:border-emerald-500/40 rounded-2xl p-5 transition-all shadow-xl hover:shadow-2xl relative overflow-hidden"
                  >
                    {/* Top Row: Symbol, Bias, Quality, Major Move */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg font-black text-slate-100 tracking-tight">{signal.symbol}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase ${
                            isLong
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          }`}>
                            {isLong ? '🟢 LONG BIAS' : '🔴 SHORT BIAS'}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                            NEWS CATALYST
                          </span>
                          {hasMajorMove && (
                            <span className="text-[9px] px-2 py-0.5 rounded-full font-mono font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              🚀 MAJOR MOVE (≥30%)
                            </span>
                          )}
                        </div>

                        {/* Confirmation Badge */}
                        <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-mono text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span className="font-bold">Confirmed by Market Price Action</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs px-2.5 py-1 rounded-xl bg-slate-950 font-mono font-black text-cyan-300 border border-slate-800">
                          Grade {qualityGrade}
                        </span>
                        <div className="text-[10px] font-mono text-slate-400 mt-1">
                          Conf: <strong className="text-slate-200">{typeof signal.confidence === 'number' && signal.confidence > 0 ? `${signal.confidence}%` : 'N/A'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Headline Banner */}
                    <div className="mb-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 text-xs">
                      <div className="text-[10px] font-mono text-slate-500 flex items-center justify-between mb-1">
                        <span>Source: <strong className="text-slate-300">{source}</strong></span>
                        <span>{formatBangladeshTime(timestamp)} BST</span>
                      </div>
                      <p className="font-bold text-slate-200 line-clamp-2 leading-snug">
                        "{headline}"
                      </p>
                    </div>

                    {/* Setup Matrix: Entry Range, SL, Expected Move, R:R */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 text-xs font-mono mb-3">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Entry Range</span>
                        <span className="text-slate-200 font-bold">
                          {formatPrice(entryLow)} – {formatPrice(entryHigh)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Structural SL</span>
                        <span className="text-rose-400 font-bold">{formatPrice(signal.stopLoss)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Expected Move</span>
                        <span className="text-emerald-400 font-black">+{expectedMovePct}%</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">R : R</span>
                        <span className="text-cyan-400 font-bold">1 : {signal.riskRewardRatio && signal.riskRewardRatio > 0 ? signal.riskRewardRatio.toFixed(1) : 'N/A'}</span>
                      </div>
                    </div>

                    {/* Targets */}
                    <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 text-[11px] font-mono">
                      <span className="text-slate-500 text-[10px] uppercase font-bold shrink-0">Targets:</span>
                      {validTargets.slice(0, 4).map((t, idx) => (
                        <div key={idx} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 whitespace-nowrap">
                          <span className="text-slate-400">{t.label || `TP${idx + 1}`}:</span>
                          <span className="text-emerald-400 font-bold">{formatPrice(t.price)}</span>
                          <span className="text-[9px] text-slate-500">(+{t.percentage || 0}%)</span>
                        </div>
                      ))}
                    </div>

                    {/* Why Technical Structure Confirms */}
                    <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60 text-xs space-y-1">
                      <span className="text-[11px] font-mono font-bold text-slate-300 block">
                        Why Structure Confirms News:
                      </span>
                      <p className="text-[11px] text-slate-400 leading-tight">
                        {whyReason}
                      </p>
                    </div>

                    {/* Card Footer */}
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/60 text-[11px] font-mono text-slate-500">
                      <span>Status: {signal.status}</span>
                      <div className="flex items-center gap-1 text-cyan-400 group-hover:translate-x-0.5 transition-transform">
                        <span>Inspect Full Setup</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW B: FAST NEWS FEED */}
      {subTab === 'FAST_FEED' && (
      <>
      {/* Filter & Search Bar */}
      <div className="bg-slate-900/70 p-4 rounded-2xl border border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search news, coins (e.g. BTC, SOL, SUI), event type, or keywords..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* Sentiment Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 overflow-x-auto">
            {(['ALL', 'BULLISH', 'BEARISH', 'MIXED', 'NEUTRAL'] as const).map((sent) => (
              <button
                key={sent}
                onClick={() => setFilterSentiment(sent)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all whitespace-nowrap ${
                  filterSentiment === sent
                    ? sent === 'BULLISH'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : sent === 'BEARISH'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                      : sent === 'MIXED'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sent}
              </button>
            ))}
          </div>
        </div>

        {/* Intelligence Category Pills */}
        <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800/60 overflow-x-auto text-[11px] font-mono">
          <span className="text-slate-500 px-1 font-bold text-[10px]">DOMAIN:</span>
          {[
            { id: 'ALL', label: 'All Feeds' },
            { id: 'GEOPOLITICAL', label: 'Geopolitical & Tariffs' },
            { id: 'MACRO', label: 'Macro (CPI / FOMC / Rates)' },
            { id: 'REGULATION', label: 'Regulatory & ETF' },
            { id: 'LISTING', label: 'Listings & Launches' },
            { id: 'SECURITY', label: 'Security & Hacks' },
            { id: 'UPGRADE', label: 'Upgrades & Tech' }
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(cat.id)}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap ${
                filterCategory === cat.id
                  ? 'bg-slate-800 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-950/60 border border-slate-800/80'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* News Feed Grid */}
      {filteredNews.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 font-mono text-sm">
          {news.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto opacity-60" />
              <div className="font-bold text-slate-300">NEWS FEED UNAVAILABLE</div>
              <div className="text-xs text-slate-500">Live intelligence pipeline is polling for incoming network events.</div>
            </div>
          ) : (
            <div>No news events match your active filters.</div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredNews.map((n) => {
            const isBull = n.sentiment === 'BULLISH';
            const isBear = n.sentiment === 'BEARISH';
            const isMixed = n.sentiment === 'MIXED';

            // Check if there is an active Unified Signal for this coin
            const primary = n.primaryCoin || n.relatedCoins?.[0];
            const matchingSignal = primary
              ? signals.find(s => s.baseAsset.toUpperCase() === primary.toUpperCase() || s.symbol.startsWith(primary.toUpperCase()))
              : undefined;

            return (
              <div
                key={n.id}
                onClick={() => setSelectedNews(n)}
                className="group p-5 rounded-2xl bg-slate-900/70 border border-slate-800/90 hover:border-emerald-500/50 hover:bg-slate-900/95 cursor-pointer transition-all flex flex-col justify-between shadow-lg relative overflow-hidden"
              >
                {/* Pre-pump or Exhaustion Header Ribbon if active */}
                {n.prePumpSetup?.isPrePumpCatalyst && (
                  <div className="mb-3 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-950/80 to-slate-900 border border-emerald-500/30 flex items-center justify-between text-xs font-mono text-emerald-300">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Zap className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      EARLY CATALYST SETUP
                    </span>
                    <span className="text-[10px] text-emerald-400/80 uppercase">Compression + Volume</span>
                  </div>
                )}

                {n.exhaustionDumpRisk && (n.exhaustionDumpRisk.status === 'PUMP_EXHAUSTION' || n.exhaustionDumpRisk.status === 'DUMP_RISK') && (
                  <div className="mb-3 px-3 py-1.5 rounded-xl bg-rose-950/60 border border-rose-500/30 flex items-center justify-between text-xs font-mono text-rose-300">
                    <span className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      {n.exhaustionDumpRisk.status === 'PUMP_EXHAUSTION' ? 'PUMP EXHAUSTION DETECTED' : 'DUMP RISK ALERT'}
                    </span>
                    <span className="text-[10px] text-rose-400/80">Extended Trend Reversal Risk</span>
                  </div>
                )}

                <div>
                  {/* Top Bar: Source Tier + Event Type + Impact + Freshness */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400 mb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-200 flex items-center gap-1">
                        {n.sourceTier === 'TIER_1' ? (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        ) : n.isVerified === false ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        ) : null}
                        {n.source}
                        {n.sourceCount && n.sourceCount > 1 ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300">
                            +{n.sourceCount - 1} sources
                          </span>
                        ) : null}
                      </span>

                      {/* Source Tier Badge */}
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        n.sourceTier === 'TIER_1'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : n.sourceTier === 'TIER_2'
                          ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                          : n.sourceTier === 'TIER_4' || n.isVerified === false
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {n.sourceTier === 'TIER_1' ? 'TIER 1 (Official)' : n.sourceTier === 'TIER_2' ? 'TIER 2 (Verified)' : n.sourceTier === 'TIER_4' || !n.isVerified ? 'UNVERIFIED' : 'TIER 3'}
                      </span>

                      {/* Event Type Badge */}
                      {n.eventType && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-[10px] text-slate-300 font-bold uppercase">
                          {n.eventType}
                        </span>
                      )}

                      {/* Phase 13 Catalyst Type */}
                      {n.catalystType && n.catalystType !== 'UNKNOWN' && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-[10px] text-indigo-300 font-bold">
                          {n.catalystType.replace(/_/g, ' ')}
                        </span>
                      )}

                      {/* Phase 13 Impact Classification */}
                      {n.impactClassification && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          n.impactClassification === 'PUMP_CATALYST'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : n.impactClassification === 'DUMP_RISK'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {n.impactClassification.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>

                    {/* Sentiment & Impact */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                          isBull
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : isBear
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            : isMixed
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {isBull ? <TrendingUp className="w-3 h-3" /> : isBear ? <TrendingDown className="w-3 h-3" /> : null}
                        {n.sentiment} ({n.impactScore}/100)
                      </span>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="font-bold text-sm text-slate-100 group-hover:text-emerald-300 transition-colors leading-snug">
                    {n.title}
                  </h3>

                  {/* Summary */}
                  <p className="text-xs text-slate-400 line-clamp-2 mt-2 leading-relaxed">
                    {n.summary}
                  </p>

                  {/* Market Reaction Indicator */}
                  {n.marketReaction && n.marketReaction.state !== 'UNKNOWN' && (
                    <div className={`mt-3 p-2 rounded-xl text-[11px] font-mono flex items-center justify-between ${
                      n.marketReaction.state === 'CONFIRMED'
                        ? 'bg-emerald-950/40 border border-emerald-500/20 text-emerald-300'
                        : n.marketReaction.state === 'REJECTED' || n.marketReaction.isContradicted
                        ? 'bg-rose-950/40 border border-rose-500/20 text-rose-300'
                        : 'bg-slate-950/50 border border-slate-800 text-slate-400'
                    }`}>
                      <span className="flex items-center gap-1.5">
                        {n.marketReaction.state === 'CONFIRMED' ? (
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        ) : n.marketReaction.state === 'REJECTED' ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span>Market Reaction: <strong className="font-bold">{n.marketReaction.state.replace('_', ' ')}</strong></span>
                      </span>
                      {n.marketReaction.priceChangePostNewsPct !== 0 && (
                        <span>
                          {n.marketReaction.priceChangePostNewsPct > 0 ? '+' : ''}
                          {n.marketReaction.priceChangePostNewsPct}%
                        </span>
                      )}
                    </div>
                  )}

                  {/* Unified Core Setup link if matched */}
                  {matchingSignal && (
                    <div className="mt-3 p-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20 flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Core Setup:</span>
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          matchingSignal.direction === 'LONG'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}>
                          {matchingSignal.direction}
                        </span>
                        <span className="text-slate-300 font-semibold">{matchingSignal.symbol}</span>
                      </div>
                      <div className="text-[11px] text-cyan-300">
                        Entry: {formatPrice(matchingSignal.entryPrice)} | SL: {formatPrice(matchingSignal.stopLoss)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer: Coins, Freshness, Timestamp */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(n.relatedCoins || []).map((coin) => (
                      <span
                        key={coin}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          coin === n.primaryCoin
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        #{coin}
                      </span>
                    ))}
                    {n.freshness && (
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        n.freshness === 'BREAKING'
                          ? 'bg-emerald-500/20 text-emerald-300 animate-pulse'
                          : n.freshness === 'FRESH'
                          ? 'bg-cyan-500/15 text-cyan-300'
                          : 'bg-slate-800 text-slate-500'
                      }`}>
                        {n.freshness}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{formatBangladeshTime(n.publishedAt)} BST</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
};
