import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Search,
  Flame,
  Shield,
  Eye,
  RefreshCw,
  ShieldAlert,
  Bell,
  BellOff,
  Download,
  X,
  Share2,
  Sparkles,
  Loader2,
  WifiOff,
  Send,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { MoonScannerCard, MoonScannerCandidate, MoonScannerTier, MoonScannerDirection } from '../components/MoonScannerCard';
import { NotificationService } from '../services/notificationService';
import { usePWAInstall } from '../utils/usePWAInstall';
import { getApiBase } from '../services/api';

export type { MoonScannerCandidate, MoonScannerTier, MoonScannerDirection };

interface MoonScannerTelemetry {
  lastScanTimestamp: number;
  lastScanFormatted: string;
  totalMonitored: number;
  validCount: number;
  confluenceCount: number;
  observeCount: number;
  scanDurationMs: number;
  isScanning: boolean;
  btcDumpShieldActive?: boolean;
  btcRsi15m?: number;
}

export const MoonScannerAnalystPage: React.FC = () => {
  const [candidates, setCandidates] = useState<MoonScannerCandidate[]>([]);
  const [telemetry, setTelemetry] = useState<MoonScannerTelemetry | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedTier, setSelectedTier] = useState<'ALL' | MoonScannerTier>('ALL');
  const [selectedDirection, setSelectedDirection] = useState<'ALL' | MoonScannerDirection>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchingOnline, setIsSearchingOnline] = useState<boolean>(false);
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() => NotificationService.isAlertsEnabled());
  const [showIOSGuide, setShowIOSGuide] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [testingTelegram, setTestingTelegram] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4500);
  }, []);

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const inFlightRef = useRef<boolean>(false);

  // Resilient Fetch with in-flight deduplication and timeout protection
  const fetchMoonScannerData = useCallback(async (isManual: boolean = false) => {
    // Prevent overlapping simultaneous requests
    if (inFlightRef.current && !isManual) return;
    inFlightRef.current = true;

    if (isManual && isMountedRef.current) setRefreshing(true);

    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/moonscanner`, {
        signal: AbortSignal.timeout(9000),
        headers: { Accept: 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        if (isMountedRef.current) {
          setIsOffline(false);
          if (Array.isArray(data.candidates) && data.candidates.length > 0) {
            setCandidates(data.candidates);
            NotificationService.handleCandidateUpdates(data.candidates);
          }
          if (data.telemetry) {
            setTelemetry(data.telemetry);
          }
        }
      } else {
        // Non-fatal status (e.g. 503 while warming up)
        console.warn(`[MoonScannerAnalyst] Feed syncing HTTP ${res.status}`);
      }
    } catch (err: any) {
      // Gracefully handle aborts or transient network glitches without raising console.error
      if (err?.name !== 'AbortError') {
        console.warn('[MoonScannerAnalyst] Feed syncing:', err?.message || err);
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine && isMountedRef.current) {
        setIsOffline(true);
      }
    } finally {
      inFlightRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
        if (isManual) setRefreshing(false);
      }
    }
  }, []);

  // Polling lifecycle with visibility and online awareness
  useEffect(() => {
    isMountedRef.current = true;
    fetchMoonScannerData();

    // Continuous 4-second real-time streaming poll (paused when tab hidden to prevent socket drops)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }
      fetchMoonScannerData();
    }, 4000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchMoonScannerData();
      }
    };

    const handleOnline = () => {
      setIsOffline(false);
      fetchMoonScannerData();
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchMoonScannerData]);

  // Universal Real-Time Coin Inspector: inspects any Binance Futures pair
  const inspectCoinOnline = async (query: string) => {
    const clean = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean || clean.length < 2) return;

    setIsSearchingOnline(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/moonscanner/inspect?symbol=${encodeURIComponent(clean)}`, {
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.candidate && isMountedRef.current) {
          setCandidates(prev => {
            const sym = data.candidate.symbol;
            const filtered = prev.filter(c => c.symbol !== sym);
            return [data.candidate, ...filtered];
          });
        }
      }
    } catch (e: any) {
      console.warn('[MoonScannerAnalyst] Search inspection notice:', e?.message || e);
    } finally {
      if (isMountedRef.current) {
        setIsSearchingOnline(false);
      }
    }
  };

  // Debounced search handler
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const trimmed = val.trim().toUpperCase();
    if (trimmed.length >= 2) {
      const exists = candidates.some(c => c.symbol.includes(trimmed) || c.baseAsset === trimmed);
      if (!exists) {
        searchDebounceRef.current = setTimeout(() => {
          inspectCoinOnline(trimmed);
        }, 500);
      }
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      inspectCoinOnline(searchQuery);
    }
  };

  const handleManualScan = async () => {
    setRefreshing(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/moonscanner/scan`, {
        method: 'POST',
        signal: AbortSignal.timeout(12000)
      });
      if (res.ok) {
        const data = await res.json();
        if (isMountedRef.current) {
          if (Array.isArray(data.candidates)) {
            setCandidates(data.candidates);
            NotificationService.handleCandidateUpdates(data.candidates);
          }
          if (data.telemetry) {
            setTelemetry(data.telemetry);
          }
        }
      }
    } catch (e: any) {
      console.warn('[MoonScannerAnalyst] Manual scan notice:', e?.message || e);
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
    }
  };

  const handleToggleAlerts = async () => {
    const nextState = await NotificationService.toggleAlerts();
    setAlertsEnabled(nextState);
    if (nextState) {
      showToast('Audio & Push Alerts Activated! Sound chimes and mobile vibration active.', 'success');
    } else {
      showToast('Alerts Paused. Audio chimes muted.', 'info');
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/moonscanner/test-telegram`, {
        method: 'POST',
        signal: AbortSignal.timeout(10000)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('✅ Telegram Gateway Online & Verified! Live alert dispatched to channel.', 'success');
      } else {
        showToast(`❌ Telegram Notice: ${data.error || 'Failed to dispatch verification'}`, 'error');
      }
    } catch (err: any) {
      showToast(`❌ Telegram Error: ${err?.message || 'Network error reaching gateway'}`, 'error');
    } finally {
      if (isMountedRef.current) {
        setTestingTelegram(false);
      }
    }
  };

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  // Dynamic strength-based sorting hierarchy
  const sortedAndFilteredCandidates = useMemo(() => {
    const filtered = candidates.filter(c => {
      if (selectedTier !== 'ALL' && c.tier !== selectedTier) return false;
      if (selectedDirection !== 'ALL' && c.direction !== selectedDirection) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toUpperCase();
        return c.symbol.toUpperCase().includes(q) || c.baseAsset.toUpperCase().includes(q);
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const tierRank = (t: MoonScannerTier) => (t === 'VALID' ? 3 : t === 'CONFLUENCE' ? 2 : 1);
      const tierDiff = tierRank(b.tier) - tierRank(a.tier);
      if (tierDiff !== 0) return tierDiff;

      const volDiff = b.volMultiplier - a.volMultiplier;
      if (Math.abs(volDiff) >= 0.1) return volDiff;

      const strengthA = (a.oiDeltaPct * 1.5) + Math.abs(a.change1h);
      const strengthB = (b.oiDeltaPct * 1.5) + Math.abs(b.change1h);
      return strengthB - strengthA;
    });
  }, [candidates, selectedTier, selectedDirection, searchQuery]);

  const validCount = useMemo(() => candidates.filter(c => c.tier === 'VALID').length, [candidates]);
  const confluenceCount = useMemo(() => candidates.filter(c => c.tier === 'CONFLUENCE').length, [candidates]);
  const observeCount = useMemo(() => candidates.filter(c => c.tier === 'OBSERVE').length, [candidates]);

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-slate-950">
      {/* Offline Alert Strip */}
      {isOffline && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-1.5 flex items-center justify-center gap-2 text-xs text-amber-300 font-mono">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Network reconnecting... Serving institutional memory cache</span>
        </div>
      )}

      {/* 1. TOP MINIMAL CLEAN HEADER */}
      <header className="sticky top-0 z-30 bg-[#0A0D14]/95 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
              <Zap className="w-4 h-4 fill-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  MoonScanner Pro
                </h1>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-extrabold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Whale Radar
                </span>
              </div>
            </div>
          </div>

          {/* Controls Bar: BTC Shield, Live Pulse, Native Push Alerts, PWA Install & Refresh */}
          <div className="flex flex-wrap items-center gap-2">
            {/* BTC Macro Dump Shield Status */}
            {telemetry?.btcDumpShieldActive ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs font-mono text-rose-300">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                <span className="font-bold">BTC Dump Shield</span>
                <span className="text-rose-400/80 text-[10px]">(RSI {telemetry.btcRsi15m ?? 38})</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-400">BTC Macro:</span>
                <span className="text-emerald-400 font-bold">Safe</span>
                <span className="text-slate-500 text-[10px]">(RSI {telemetry?.btcRsi15m ?? 50})</span>
              </div>
            )}

            {/* Binance Live Pulse */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-emerald-400 font-bold">Binance Live</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400 text-[11px]">
                {telemetry?.lastScanFormatted ? telemetry.lastScanFormatted.split(' ')[0] : 'Scanning...'}
              </span>
            </div>

            {/* Dual-Channel Push Notifications Toggle */}
            <button
              onClick={handleToggleAlerts}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                alertsEnabled
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.35)] ring-1 ring-emerald-500/40'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800'
              }`}
              title={alertsEnabled ? 'Push Alerts Active' : 'Click to Enable Audio/Push Alerts'}
            >
              {alertsEnabled ? (
                <Bell className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 animate-pulse" />
              ) : (
                <BellOff className="w-3.5 h-3.5" />
              )}
              <span>{alertsEnabled ? '🔔 Alerts Active' : 'Enable Alerts'}</span>
            </button>

            {/* In-App Mobile PWA Install Button */}
            {!isInstalled && (isInstallable || isIOS) && (
              <button
                onClick={handleInstallClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-950/80 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-500/40 shadow-sm transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install Mobile App</span>
              </button>
            )}

            {/* 1-Click Test Telegram Button */}
            <button
              onClick={handleTestTelegram}
              disabled={testingTelegram}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-950/80 hover:bg-cyan-900/90 text-cyan-300 border border-cyan-500/50 hover:border-cyan-400 shadow-sm transition-all disabled:opacity-50"
              title="Send a live test verification alert directly to your Telegram channel"
            >
              <Send className={`w-3.5 h-3.5 text-cyan-400 ${testingTelegram ? 'animate-pulse' : ''}`} />
              <span>{testingTelegram ? 'Sending...' : '🚀 Test Telegram'}</span>
            </button>

            {/* Refresh Button */}
            <button
              onClick={handleManualScan}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. UNIVERSAL REAL-TIME COIN SEARCH INSPECTOR (STICKY & DEBOUNCED) */}
      <section className="sticky top-[57px] z-20 border-b border-slate-800/80 bg-[#090C13]/95 backdrop-blur-md px-4 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* Universal Sticky Search Bar */}
          <div className="relative flex-1 max-w-xl">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none text-slate-400">
              {isSearchingOnline ? (
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              ) : (
                <Search className="w-4 h-4 text-emerald-400" />
              )}
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              placeholder="🔍 Search any pair (e.g. PEPE, SOL, SUI, DOGE, XRP)..."
              className="w-full pl-10 pr-20 py-2 rounded-xl bg-slate-950/90 border border-slate-700/80 hover:border-cyan-500/60 focus:border-cyan-400 text-xs sm:text-sm text-white placeholder-slate-400 font-mono tracking-tight shadow-inner focus:outline-none transition-all"
            />

            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1 rounded-md text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {isSearchingOnline ? (
                <span className="text-[10px] font-mono text-cyan-400 animate-pulse font-bold">Scanning...</span>
              ) : (
                <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">Press Enter</span>
              )}
            </div>
          </div>

          {/* Direction Filter Toggles */}
          <div className="flex items-center gap-2">
            <div className="flex items-center p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button
                onClick={() => setSelectedDirection('ALL')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  selectedDirection === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Dirs
              </button>
              <button
                onClick={() => setSelectedDirection('LONG')}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  selectedDirection === 'LONG' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                <TrendingUp className="w-3 h-3" />
                <span>LONG</span>
              </button>
              <button
                onClick={() => setSelectedDirection('SHORT')}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  selectedDirection === 'SHORT' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-slate-400 hover:text-rose-400'
                }`}
              >
                <TrendingDown className="w-3 h-3" />
                <span>SHORT</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. SUB-BAR: TIER FILTER PILL TOGGLES */}
      <section className="border-b border-slate-800/60 bg-[#0B0E17]/60 px-4 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedTier('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedTier === 'ALL'
                  ? 'bg-white text-slate-950 shadow-sm font-black'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              All ({candidates.length})
            </button>

            <button
              onClick={() => setSelectedTier('VALID')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedTier === 'VALID'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm font-black shadow-emerald-500/20'
                  : 'bg-emerald-950/30 text-emerald-400 hover:bg-emerald-950/60 border border-emerald-500/30'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>🟢 VALID ({validCount})</span>
            </button>

            <button
              onClick={() => setSelectedTier('CONFLUENCE')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedTier === 'CONFLUENCE'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-black shadow-amber-500/20'
                  : 'bg-amber-950/30 text-amber-400 hover:bg-amber-950/60 border border-amber-500/30'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>🟡 CONFLUENCE ({confluenceCount})</span>
            </button>

            <button
              onClick={() => setSelectedTier('OBSERVE')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedTier === 'OBSERVE'
                  ? 'bg-rose-500 text-slate-950 shadow-sm font-black'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>🔴 OBSERVE ({observeCount})</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Card #1 = Market Top Whale Volume Runner</span>
          </div>
        </div>
      </section>

      {/* 4. MAIN DYNAMIC STRENGTH-SORTED GRID */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {loading && candidates.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <div key={n} className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 animate-pulse space-y-4">
                <div className="flex justify-between items-center">
                  <div className="w-28 h-4 bg-slate-800 rounded" />
                  <div className="w-16 h-4 bg-slate-800 rounded" />
                </div>
                <div className="flex justify-between items-center">
                  <div className="w-32 h-6 bg-slate-800 rounded" />
                  <div className="w-12 h-6 bg-slate-800 rounded" />
                </div>
                <div className="w-full h-8 bg-slate-800 rounded" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-10 bg-slate-800 rounded" />
                  <div className="h-10 bg-slate-800 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedAndFilteredCandidates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {sortedAndFilteredCandidates.map(candidate => (
              <MoonScannerCard key={candidate.id} candidate={candidate} />
            ))}
          </div>
        ) : (
          <div className="p-12 text-center rounded-2xl border border-slate-800 bg-slate-900/40 space-y-3 max-w-md mx-auto my-12">
            <Eye className="w-10 h-10 text-slate-500 mx-auto" />
            <h3 className="text-base font-bold text-white">
              {searchQuery ? `No active results for "${searchQuery}"` : 'No Matching Pairs'}
            </h3>
            <p className="text-xs text-slate-400">
              {searchQuery
                ? 'Try pressing Enter to run a real-time deep scan on this Binance Futures perpetual.'
                : 'No active Binance Futures pairs meet the selected filter criteria.'}
            </p>
            {searchQuery && (
              <button
                onClick={() => inspectCoinOnline(searchQuery)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 mx-auto"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Deep Scan "#{searchQuery.toUpperCase()}"</span>
              </button>
            )}
            <button
              onClick={() => {
                setSelectedTier('ALL');
                setSelectedDirection('ALL');
                setSearchQuery('');
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white block mx-auto mt-2"
            >
              Reset Filters
            </button>
          </div>
        )}
      </main>

      {/* iOS Safari Guided Install Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#0D1119] border border-slate-800 p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mx-auto text-cyan-400">
              <Share2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-white">Install on iPhone / iPad</h3>
            <p className="text-xs text-slate-300 leading-relaxed text-left">
              1. Tap the <strong>Share</strong> button <span className="text-cyan-400">[⎋]</span> in your Safari bottom bar.<br />
              2. Scroll down and tap <strong>Add to Home Screen</strong>.<br />
              3. Launch from your home screen for pure full-screen app view with zero browser address bars!
            </p>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
      {/* Floating Action Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-[#0C1018]/95 backdrop-blur-md border border-emerald-500/50 shadow-2xl shadow-emerald-950/50 text-xs sm:text-sm font-mono text-emerald-200 animate-in fade-in slide-in-from-bottom-3 duration-200">
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Bell className="w-4 h-4 text-cyan-400 shrink-0" />
          )}
          <span className="font-semibold">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 p-1 rounded-md text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
