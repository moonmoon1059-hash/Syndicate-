import React, { useState, useEffect, useMemo } from 'react';
import {
  Flame,
  Shield,
  Eye,
  RefreshCw,
  Search,
  Zap,
  TrendingUp,
  TrendingDown,
  Send,
  AlertCircle,
  BarChart2,
  CheckCircle2
} from 'lucide-react';
import { SyndicateCard, SyndicateCandidate, SyndicateTier, SyndicateDirection } from '../components/SyndicateCard';

interface SyndicateTelemetry {
  lastScanTimestamp: number;
  lastScanFormatted: string;
  totalMonitored: number;
  validCount: number;
  confluenceCount: number;
  observeCount: number;
  scanDurationMs: number;
  isScanning: boolean;
}

export const SyndicatePage: React.FC = () => {
  const [candidates, setCandidates] = useState<SyndicateCandidate[]>([]);
  const [telemetry, setTelemetry] = useState<SyndicateTelemetry | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [testAlertSending, setTestAlertSending] = useState<boolean>(false);
  const [alertFeedback, setAlertFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filters
  const [selectedTier, setSelectedTier] = useState<'ALL' | SyndicateTier>('ALL');
  const [selectedDirection, setSelectedDirection] = useState<'ALL' | SyndicateDirection>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fetch Syndicate intelligence
  const fetchSyndicateData = async (isManual: boolean = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/syndicate');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.candidates)) {
          setCandidates(data.candidates);
        }
        if (data.telemetry) {
          setTelemetry(data.telemetry);
        }
      }
    } catch (err) {
      console.error('[SyndicatePage] Fetch error:', err);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  // Immediate fetch and continuous 3-second polling
  useEffect(() => {
    fetchSyndicateData();
    const interval = setInterval(() => {
      fetchSyndicateData();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Manual Trigger Scan
  const handleManualScan = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/syndicate/scan', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.candidates)) {
          setCandidates(data.candidates);
        }
        if (data.telemetry) {
          setTelemetry(data.telemetry);
        }
      }
    } catch (e) {
      console.error('[SyndicatePage] Manual scan error:', e);
    } finally {
      setRefreshing(false);
    }
  };

  // Test Telegram VIP Alert
  const handleTestAlert = async () => {
    setTestAlertSending(true);
    setAlertFeedback(null);
    try {
      const res = await fetch('/api/syndicate/test-alert', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setAlertFeedback({
          message: `VIP alert dispatched to Telegram for #${data.candidate?.symbol || 'coin'}!`,
          type: 'success'
        });
      } else {
        setAlertFeedback({
          message: data.error || 'Telegram credentials not configured in environment',
          type: 'error'
        });
      }
    } catch (e: any) {
      setAlertFeedback({ message: e?.message || 'Failed to dispatch alert', type: 'error' });
    } finally {
      setTestAlertSending(false);
      setTimeout(() => setAlertFeedback(null), 5000);
    }
  };

  // Filter candidates
  const filteredCandidates = useMemo(() => {
    return candidates.filter(c => {
      // Tier filter
      if (selectedTier !== 'ALL' && c.tier !== selectedTier) return false;
      // Direction filter
      if (selectedDirection !== 'ALL' && c.direction !== selectedDirection) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toUpperCase();
        return c.symbol.toUpperCase().includes(q) || c.baseAsset.toUpperCase().includes(q);
      }
      return true;
    });
  }, [candidates, selectedTier, selectedDirection, searchQuery]);

  // Compute counts
  const validCount = useMemo(() => candidates.filter(c => c.tier === 'VALID').length, [candidates]);
  const confluenceCount = useMemo(() => candidates.filter(c => c.tier === 'CONFLUENCE').length, [candidates]);
  const observeCount = useMemo(() => candidates.filter(c => c.tier === 'OBSERVE').length, [candidates]);

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {/* 1. EXECUTIVE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Zap className="w-5 h-5 fill-emerald-400/30" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              SYNDICATE ANALYST
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
              Whale Orderflow
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Institutional Whale Footprints, Structural Clearance & Zero-Bloat Execution
          </p>
        </div>

        {/* Live stream badge & actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-emerald-400 font-bold">Binance Futures Live</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400 text-[11px]">
              {telemetry?.lastScanFormatted || 'Scanning...'}
            </span>
          </div>

          <button
            onClick={handleManualScan}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Scan Now</span>
          </button>

          <button
            onClick={handleTestAlert}
            disabled={testAlertSending}
            title="Dispatch top VALID candidate to VIP Telegram"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 transition-colors disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{testAlertSending ? 'Sending...' : 'Test Telegram'}</span>
          </button>
        </div>
      </div>

      {/* Alert Feedback Toast */}
      {alertFeedback && (
        <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-medium ${
          alertFeedback.type === 'success'
            ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
            : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
        }`}>
          {alertFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{alertFeedback.message}</span>
        </div>
      )}

      {/* 2. THREE-TIER SUMMARY METRICS STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Monitored */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Perpetuals Monitored</div>
            <div className="text-xl sm:text-2xl font-black font-mono text-white mt-0.5">
              {telemetry?.totalMonitored || candidates.length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-300">
            <BarChart2 className="w-5 h-5" />
          </div>
        </div>

        {/* 🟢 VALID Tier */}
        <div
          onClick={() => setSelectedTier('VALID')}
          className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
            selectedTier === 'VALID'
              ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-950/20'
              : 'bg-slate-900/80 border-emerald-500/30 hover:border-emerald-500/60'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>VALID Tier</span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-emerald-300 mt-0.5">
              {validCount}
            </div>
            <div className="text-[10px] text-emerald-500/80 mt-0.5">Score &ge; 100 · VIP Alerts</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-600/40 flex items-center justify-center text-emerald-400">
            <Flame className="w-5 h-5" />
          </div>
        </div>

        {/* 🟡 CONFLUENCE Tier */}
        <div
          onClick={() => setSelectedTier('CONFLUENCE')}
          className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
            selectedTier === 'CONFLUENCE'
              ? 'bg-amber-950/40 border-amber-500 shadow-md shadow-amber-950/20'
              : 'bg-slate-900/80 border-amber-500/30 hover:border-amber-500/60'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>CONFLUENCE</span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-amber-300 mt-0.5">
              {confluenceCount}
            </div>
            <div className="text-[10px] text-amber-500/80 mt-0.5">Score 90-99 · Watchlist</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-600/40 flex items-center justify-center text-amber-400">
            <Shield className="w-5 h-5" />
          </div>
        </div>

        {/* 🔴 OBSERVE Tier */}
        <div
          onClick={() => setSelectedTier('OBSERVE')}
          className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
            selectedTier === 'OBSERVE'
              ? 'bg-slate-800/80 border-slate-600 shadow-md'
              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <span>OBSERVE Tier</span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-slate-300 mt-0.5">
              {observeCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Score &lt; 90 · Baseline</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-center text-slate-400">
            <Eye className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. CONTROLS: TABS & SEARCH */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 bg-slate-900/80 rounded-2xl border border-slate-800/80">
        {/* Tier Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedTier('ALL')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors ${
              selectedTier === 'ALL'
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            All ({candidates.length})
          </button>

          <button
            onClick={() => setSelectedTier('VALID')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-colors ${
              selectedTier === 'VALID'
                ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20 font-black'
                : 'text-emerald-400 hover:bg-emerald-950/40'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>VALID ({validCount})</span>
          </button>

          <button
            onClick={() => setSelectedTier('CONFLUENCE')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-colors ${
              selectedTier === 'CONFLUENCE'
                ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                : 'text-amber-400 hover:bg-amber-950/40'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>CONFLUENCE ({confluenceCount})</span>
          </button>

          <button
            onClick={() => setSelectedTier('OBSERVE')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-colors ${
              selectedTier === 'OBSERVE'
                ? 'bg-slate-700 text-white shadow-sm font-black'
                : 'text-slate-400 hover:bg-slate-800/50'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>OBSERVE ({observeCount})</span>
          </button>
        </div>

        {/* Direction Tabs & Search */}
        <div className="flex items-center gap-2">
          {/* Direction segmented filter */}
          <div className="flex items-center p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              onClick={() => setSelectedDirection('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                selectedDirection === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedDirection('LONG')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                selectedDirection === 'LONG' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-emerald-400'
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              <span>LONG</span>
            </button>
            <button
              onClick={() => setSelectedDirection('SHORT')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                selectedDirection === 'SHORT' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              <TrendingDown className="w-3 h-3" />
              <span>SHORT</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[140px] sm:min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search coin..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>
        </div>
      </div>

      {/* 4. CARDS GRID MATCHING 25225.JPG */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {[1, 2, 3, 4, 5, 6].map(n => (
            <div key={n} className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 animate-pulse grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div className="flex justify-between items-center">
                <div className="w-24 h-4 bg-slate-800 rounded" />
                <div className="w-16 h-4 bg-slate-800 rounded" />
              </div>
              <div className="flex justify-between items-center">
                <div className="w-32 h-6 bg-slate-800 rounded" />
                <div className="w-14 h-6 bg-slate-800 rounded" />
              </div>
              <div className="w-full h-8 bg-slate-800 rounded" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-12 bg-slate-800 rounded" />
                <div className="h-12 bg-slate-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredCandidates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredCandidates.map(candidate => (
            <SyndicateCard
              key={candidate.id}
              candidate={candidate}
              onSelect={(cand) => window.open(cand.binanceUrl, '_blank', 'noopener,noreferrer')}
            />
          ))}
        </div>
      ) : (
        <div className="p-12 text-center rounded-2xl border border-slate-800 bg-slate-900/40 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <Eye className="w-10 h-10 text-slate-500 mx-auto" />
          <h3 className="text-base font-bold text-white">No Pairs Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            No active Binance Futures pairs meet the selected tier or search criteria.
          </p>
          <button
            onClick={() => {
              setSelectedTier('ALL');
              setSelectedDirection('ALL');
              setSearchQuery('');
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
};
