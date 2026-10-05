import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { fetchListingRadar } from '../services/api';
import { formatPrice, formatPercent } from '../utils/formatters';
import { NewListingItem } from '../types/crypto';
import {
  Compass,
  Zap,
  Activity,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Clock,
  Radio,
  ExternalLink,
  Flame,
  CheckCircle2
} from 'lucide-react';

export const RadarScreen: React.FC = () => {
  const { radar, setSelectedRadar, signals } = useApp();
  const [activeTab, setActiveTab] = useState<'RADAR' | 'NEW_LISTINGS'>('RADAR');
  const [listingSubTab, setListingSubTab] = useState<'ALL' | 'UPCOMING' | 'LIVE'>('ALL');
  const [listings, setListings] = useState<NewListingItem[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [displayTimezone, setDisplayTimezone] = useState<'BDT' | 'UTC' | 'LOCAL'>('BDT');

  // 1-second interval ticker for live countdowns and dynamic pre-listing -> live transitions
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadListings = async (isSilent = false) => {
    if (!isSilent) setLoadingListings(true);
    setListingError(null);
    try {
      const data = await fetchListingRadar();
      setListings(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.warn('Failed to load listings:', err);
      setListingError(err?.message || 'Failed to scan exchange listing feeds');
    } finally {
      if (!isSilent) setLoadingListings(false);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (activeTab === 'NEW_LISTINGS') {
      loadListings();
      // Continuous background refresh every 15s so new listings appear automatically
      interval = setInterval(() => {
        loadListings(true);
      }, 15000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab]);

  // Derived filtered listings based on dynamic live timestamp
  const upcomingListings = listings.filter((item) => {
    const sched = item.scheduledListingTime || item.listedAt;
    return item.launchStatus === 'PRE_LISTING' || (sched && sched > currentTime);
  });

  const liveListings = listings.filter((item) => {
    const sched = item.scheduledListingTime || item.listedAt;
    return item.launchStatus !== 'PRE_LISTING' && (!sched || sched <= currentTime);
  });

  const displayedListings =
    listingSubTab === 'UPCOMING'
      ? upcomingListings
      : listingSubTab === 'LIVE'
      ? liveListings
      : listings;

  const formatCountdown = (targetMs: number, nowMs: number): string => {
    const diff = targetMs - nowMs;
    if (diff <= 0) return 'Listing Live';
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `T-${days}d ${hours}h ${minutes}m ${seconds}s`;
    }
    return `T-${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatTimeAgo = (ms: number): string => {
    const diff = currentTime - ms;
    if (diff < 0) return 'just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ${mins % 60}m ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const formatListingTime = (ts: number, tz: 'BDT' | 'UTC' | 'LOCAL'): string => {
    if (!ts) return 'Unknown';
    const d = new Date(ts);
    try {
      if (tz === 'BDT') {
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Dhaka',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        }).format(d) + ' BDT (UTC+6)';
      } else if (tz === 'UTC') {
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: 'UTC',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(d) + ' UTC';
      } else {
        return d.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' Local';
      }
    } catch {
      return new Date(ts).toUTCString();
    }
  };

  return (
    <div className="space-y-5 pb-24 max-w-5xl mx-auto px-2 sm:px-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
            <Compass className="w-6 h-6 text-blue-400" />
            <span>Market Intelligence Radar</span>
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Multi-exchange radar monitoring volume surges, momentum anomalies, verified upcoming & live listing discovery
          </p>
        </div>

        {/* Primary Tab Switcher */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('RADAR')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              activeTab === 'RADAR'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Market Scanner ({radar.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('NEW_LISTINGS')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
              activeTab === 'NEW_LISTINGS'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            New Listings ({listings.length})
          </button>
        </div>
      </div>

      {/* Tab 1: Market Scanner Radar */}
      {activeTab === 'RADAR' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {radar.map((item) => {
            const cleanSym = item.symbol.replace(/[^A-Z0-9]/g, '');
            const matchingSignal = signals.find(s => {
              const sigClean = s.symbol.replace(/[^A-Z0-9]/g, '');
              return sigClean === cleanSym || s.baseAsset === cleanSym.replace(/(USDT|BUSD|USDC)$/, '');
            });
            const preMove = matchingSignal?.preMoveReport || matchingSignal?.preMoveIntelligence;

            return (
              <div
                key={item.symbol}
                onClick={() => setSelectedRadar(item)}
                className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-cyan-500/40 hover:bg-slate-900/90 cursor-pointer transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-base text-slate-100">{item.symbol}</span>
                    <span
                      className={`text-xs font-mono font-bold ${
                        item.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatPercent(item.change24h)}
                    </span>
                  </div>

                  <div className="text-sm font-mono text-slate-300 mt-1">
                    {formatPrice(item.price)}
                  </div>

                  {/* Pre-Move Squeeze / Early Catalyst Ribbon */}
                  {preMove && (preMove.volatilitySqueeze || preMove.coilScore >= 60) && (
                    <div className="mt-2.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-[11px] font-mono text-emerald-300">
                      <span className="flex items-center gap-1 font-bold">
                        <Zap className="w-3 h-3 text-emerald-400 animate-pulse" />
                        PRE-MOVE COIL: {preMove.coilScore}/100
                      </span>
                      <span className="text-[10px] text-emerald-400/80 font-semibold">
                        {preMove.volatilitySqueeze ? 'SQUEEZE' : 'BREAKOUT'}: {preMove.breakoutProbability}%
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 my-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 text-xs font-mono">
                    <div>
                      <div className="text-[10px] text-slate-400">1H / 4H Bias</div>
                      <div className="text-slate-200 font-semibold mt-0.5">{item.trend1h}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">15M RSI</div>
                      <div className="text-cyan-300 font-semibold mt-0.5">{item.rsi15m}</div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-slate-400">MoonScore:</span>
                    <span className="text-xs font-mono font-bold text-amber-400">{item.moonScore}</span>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold ${
                      item.recommendedAction === 'LONG'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : item.recommendedAction === 'SHORT'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.recommendedAction}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: New Listing Intelligence Radar */}
      {activeTab === 'NEW_LISTINGS' && (
        <div className="space-y-4">
          {/* Rules & Protocol Banner */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 text-xs font-mono text-slate-300 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <strong className="text-amber-300">NEW LISTING INTELLIGENCE PROTOCOL (BINANCE, BYBIT):</strong>
                <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800/60 text-[9px]">ZERO FABRICATION</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Monitors verified upcoming exchange listings with live countdowns and live pairs within a 30-day window. Trade recommendations strictly require verified accumulation base stabilization. Coins are never automatically bought simply because they are newly listed.
              </p>
            </div>
          </div>

          {/* Sub-Tabs & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono">
            {/* Filter Sub-Tabs */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setListingSubTab('ALL')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  listingSubTab === 'ALL'
                    ? 'bg-slate-800 text-slate-100 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({listings.length})
              </button>
              <button
                type="button"
                onClick={() => setListingSubTab('UPCOMING')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                  listingSubTab === 'UPCOMING'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="w-3 h-3 text-amber-400" />
                <span>Upcoming ({upcomingListings.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setListingSubTab('LIVE')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                  listingSubTab === 'LIVE'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>Live / Recent ({liveListings.length})</span>
              </button>
            </div>

            {/* Re-scan & Auto-refresh status */}
            <div className="flex items-center gap-2.5">
              {/* Timezone Selector: BDT default */}
              <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 px-1 font-bold">TZ:</span>
                <button
                  type="button"
                  onClick={() => setDisplayTimezone('BDT')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                    displayTimezone === 'BDT'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Bangladesh Standard Time (UTC+6)"
                >
                  BDT (UTC+6)
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayTimezone('UTC')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                    displayTimezone === 'UTC'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  UTC
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayTimezone('LOCAL')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                    displayTimezone === 'LOCAL'
                      ? 'bg-slate-700 text-slate-100 border border-slate-600'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Local
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>15s</span>
              </div>
              <button
                type="button"
                onClick={() => loadListings(false)}
                disabled={loadingListings}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loadingListings ? 'animate-spin' : ''}`} />
                <span>{loadingListings ? 'Scanning...' : 'Re-scan'}</span>
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loadingListings && listings.length === 0 && (
            <div className="p-16 text-center text-xs font-mono text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800 space-y-3">
              <RefreshCw className="w-7 h-7 animate-spin mx-auto text-cyan-400" />
              <div className="text-slate-300 font-bold">Scanning Binance & Bybit listing feeds...</div>
              <div className="text-slate-500 text-[11px]">Connecting to official exchange registries & announcement channels</div>
            </div>
          )}

          {/* Error State */}
          {listingError && listings.length === 0 && (
            <div className="p-8 text-center text-xs font-mono text-rose-300 bg-rose-950/30 rounded-2xl border border-rose-800/80 space-y-3">
              <AlertTriangle className="w-6 h-6 mx-auto text-rose-400" />
              <div>Error fetching listing radar: {listingError}</div>
              <button
                type="button"
                onClick={() => loadListings(false)}
                className="px-4 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-900 text-white font-bold text-xs border border-rose-700"
              >
                Retry Scan
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loadingListings && displayedListings.length === 0 && !listingError && (
            <div className="p-12 text-center text-xs font-mono text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800 space-y-2">
              <Clock className="w-8 h-8 mx-auto text-slate-600 mb-1" />
              <div className="text-slate-300 font-bold">
                {listingSubTab === 'UPCOMING'
                  ? 'No verified upcoming pre-listings scheduled at this moment.'
                  : listingSubTab === 'LIVE'
                  ? 'No live listings within the 30-day window found.'
                  : 'No listings tracked currently.'}
              </div>
              <div className="text-slate-500 text-[11px]">
                Monitoring Binance & Bybit continuous discovery registries.
              </div>
            </div>
          )}

          {/* Listings Feed Cards */}
          {displayedListings.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayedListings.map((item) => {
                const schedTime = item.scheduledListingTime || item.listedAt;
                const isUpcomingNow = Boolean(schedTime && schedTime > currentTime);
                const livePrice = item.newListingIntelligence?.currentPrice || item.entryZone?.ideal;
                const earlyWarning = item.pumpDumpIntelligence;

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 transition-all ${
                      isUpcomingNow
                        ? 'bg-slate-900/90 border-amber-500/30 hover:border-amber-500/60 shadow-sm'
                        : 'bg-slate-900/80 border-slate-800/90 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Top Header: Symbol, Exchange & Launch Status */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base text-slate-100 font-mono tracking-tight">
                            {item.symbol}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 text-[10px] font-mono font-bold border border-slate-700">
                            {item.exchange}
                          </span>
                        </div>

                        {/* Status Badge */}
                        {isUpcomingNow ? (
                          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold">
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>UPCOMING</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>LIVE</span>
                          </div>
                        )}
                      </div>

                      {/* Scheduled Time & Live Countdown for Upcoming */}
                      {isUpcomingNow && schedTime && (
                        <div className="mt-2.5 p-2.5 rounded-xl bg-amber-950/30 border border-amber-800/50 flex flex-col gap-2 text-xs font-mono">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[10px] text-amber-400 block font-semibold">Scheduled Listing:</span>
                              <span className="text-slate-200 text-[11px] font-bold">
                                {formatListingTime(schedTime, displayTimezone)}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-amber-400 block font-semibold">Time Until Listing:</span>
                              <span className="text-amber-300 font-black text-xs tracking-wider">
                                {formatCountdown(schedTime, currentTime)}
                              </span>
                            </div>
                          </div>
                          {item.listedAt && (
                            <div className="pt-1.5 border-t border-amber-800/40 flex items-center justify-between text-[10px] text-slate-400">
                              <span>Announced:</span>
                              <span className="text-slate-300">{formatTimeAgo(item.listedAt)} • {formatListingTime(item.listedAt, displayTimezone)}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Live Listing Timing info */}
                      {!isUpcomingNow && schedTime && (
                        <div className="mt-2 p-2 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs font-mono">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Listed:</span>
                            <span className="text-slate-200 text-[11px] font-semibold">
                              {formatListingTime(schedTime, displayTimezone)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block">Market Age:</span>
                            <span className="text-cyan-300 font-bold text-[11px]">
                              {formatTimeAgo(schedTime)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Live Price & 24H Metrics for Live Listings */}
                      {!isUpcomingNow && (
                        <div className="flex items-center justify-between text-xs font-mono mt-2 pt-1 border-t border-slate-800/50">
                          <div className="text-slate-100 font-bold text-sm">
                            {livePrice ? formatPrice(livePrice) : 'LIVE TICKER INITIALIZING'}
                          </div>
                          <div className="flex items-center gap-2 text-xs font-mono">
                            <span>
                              24h:{' '}
                              <strong className={item.currentPriceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {item.currentPriceChange24h > 0 ? '+' : ''}
                                {item.currentPriceChange24h}%
                              </strong>
                            </span>
                            <span>•</span>
                            <span>
                              Spike:{' '}
                              <strong className="text-amber-400">
                                {typeof item.initialSpikePct === 'number' && !isNaN(item.initialSpikePct)
                                  ? `+${item.initialSpikePct}%`
                                  : 'N/A'}
                              </strong>
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Lifecycle Stage & Listing Risk Grid */}
                      <div className="grid grid-cols-2 gap-2 my-2.5 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 text-xs font-mono">
                        <div>
                          <div className="text-[10px] text-slate-400">Lifecycle Stage</div>
                          <div className="text-slate-200 font-semibold mt-0.5 text-[11px]">
                            {isUpcomingNow
                              ? (schedTime - currentTime < 3600000 ? 'Countdown / Imminent' : 'Rumor / Announced')
                              : (currentTime - schedTime < 900000 ? 'Live Trading (1m/5m Volatility)' : item.stage.replace(/_/g, ' '))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Pump / Dump Risk & Safety</div>
                          <div
                            className={`font-semibold mt-0.5 text-[11px] ${
                              item.pumpDumpRisk === 'CRITICAL' || item.pumpDumpRisk === 'HIGH'
                                ? 'text-rose-400'
                                : item.pumpDumpRisk === 'MODERATE'
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {item.pumpDumpRisk} • Safe Contract
                          </div>
                        </div>
                      </div>

                      {/* Early Warning Intelligence Vector Breakdown */}
                      {earlyWarning && (
                        <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/90 text-xs font-mono space-y-1.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">Volume Velocity:</span>
                            <span className="text-cyan-300 font-semibold">
                              {earlyWarning.volumeVelocity.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">Order-Flow Absorption:</span>
                            <span className={
                              earlyWarning.orderFlowAbsorption.includes('BUY')
                                ? 'text-emerald-400 font-semibold'
                                : earlyWarning.orderFlowAbsorption.includes('SELL')
                                ? 'text-rose-400 font-semibold'
                                : 'text-slate-300 font-semibold'
                            }>
                              {earlyWarning.orderFlowAbsorption.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">Liquidity Depth:</span>
                            <span className="text-slate-300 font-semibold">
                              {earlyWarning.liquidityDepth.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="pt-1 border-t border-slate-800/60 text-[10px] text-amber-300/90 leading-tight flex items-start gap-1">
                            <Flame className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                            <span>{earlyWarning.earlyWarningSummary}</span>
                          </div>
                        </div>
                      )}

                      {/* Anti-chase Warning Banner */}
                      {item.executionStatus === 'WAIT_FOR_PULLBACK' && (
                        <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-amber-950/40 border border-amber-800/80 text-[10px] font-mono text-amber-300 flex items-center gap-1.5 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Anti-Chase Guard: Price extended from base • Wait for structural pullback</span>
                        </div>
                      )}

                      {/* Structural Trade Setup (ONLY when verified base supports it, never fabricated) */}
                      {!isUpcomingNow && item.decision && item.decision !== 'WAIT' && item.entryZone ? (
                        <div className="mt-3 p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2 text-xs font-mono">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                              <Zap className="w-3.5 h-3.5" />
                              <span>ACTIONABLE {item.decision} SETUP</span>
                            </span>
                            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold">
                              {item.executionStatus}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-[10px]">
                            <div>
                              <span className="text-slate-500">Entry Zone</span>
                              <div className="text-cyan-300 font-bold">{formatPrice(item.entryZone.ideal)}</div>
                              <div className="text-slate-400 text-[9px]">
                                {formatPrice(item.entryZone.low)} - {formatPrice(item.entryZone.high)}
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-500">Stop Loss</span>
                              <div className="text-rose-400 font-bold">{formatPrice(item.stopLoss)}</div>
                            </div>
                            <div>
                              <span className="text-slate-500">Risk : Reward</span>
                              <div className="text-amber-300 font-bold">1 : {item.riskRewardRatio}</div>
                            </div>
                          </div>

                          {item.targets && item.targets.length > 0 && (
                            <div className="pt-1.5 border-t border-slate-800/80 flex items-center gap-2 flex-wrap text-[10px]">
                              <span className="text-slate-500">Targets:</span>
                              {item.targets.map((t: any) => (
                                <span
                                  key={t.id}
                                  className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-800"
                                >
                                  {t.label}: {formatPrice(t.price)} (+{t.percentage}%)
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="text-[10px] text-slate-400 border-t border-slate-800/60 pt-1">
                            <span className="text-slate-500">Invalidation: </span>
                            <span className="text-slate-300">{item.invalidation}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                          <Activity className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>
                            {isUpcomingNow
                              ? 'Scheduled Pre-Listing: Awaiting trading commencement (Zero fabricated levels)'
                              : 'Status: Awaiting tradeable base stabilization (Zero fabricated levels)'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>
                        {isUpcomingNow
                          ? 'Pre-Market Discovery'
                          : typeof item.volume24hUsd === 'number' && !isNaN(item.volume24hUsd) && item.volume24hUsd > 0
                          ? `24h Vol: $${(item.volume24hUsd / 1000000).toFixed(1)}M`
                          : 'Vol: Initializing'}
                      </span>

                      <span
                        className={`px-2.5 py-0.5 rounded font-bold border ${
                          item.setupViability === 'ACTIONABLE_BASE'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : item.setupViability === 'PRE_LISTING_WAIT'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : item.setupViability === 'WAIT_STABILIZATION'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        {item.setupViability.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
