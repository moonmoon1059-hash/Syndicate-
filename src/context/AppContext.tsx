import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import {
  Signal,
  MarketStats,
  NewsItem,
  RadarItem,
  ScannerFilter,
  SignalLifecycleStats,
  ActionablePriority,
  SignalQualityGrade,
  MarketCoverageTelemetry,
  OpportunityRanking
} from '../types/crypto';
import {
  fetchSignals,
  fetchPreMoveSignals,
  fetchMarketStats,
  fetchNews,
  fetchRadar,
  triggerMarketScan,
  fetchLifecycleStats,
  fetchCoverageTelemetry,
  fetchOpportunityRankings
} from '../services/api';
import { getCanonicalTargets } from '../utils/formatters';
import { calculateClientOpportunityPriority, rankAndSortSignals, calculateUnifiedFusionScore } from '../utils/priorityRanking';

interface AppContextType {
  signals: Signal[];
  preMoveSignals: Signal[];
  filteredSignals: Signal[];
  selectedSignal: Signal | null;
  setSelectedSignal: (signal: Signal | null) => void;
  marketStats: MarketStats | null;
  lifecycleStats: SignalLifecycleStats | null;
  coverageTelemetry: MarketCoverageTelemetry | null;
  opportunityRankings: OpportunityRanking | null;
  news: NewsItem[];
  radar: RadarItem[];
  selectedNews: NewsItem | null;
  setSelectedNews: (news: NewsItem | null) => void;
  selectedRadar: RadarItem | null;
  setSelectedRadar: (item: RadarItem | null) => void;
  isAlertModalOpen: boolean;
  setIsAlertModalOpen: (open: boolean) => void;
  
  // Filters & Controls
  filter: ScannerFilter;
  setFilter: React.Dispatch<React.SetStateAction<ScannerFilter>>;
  
  // Data state
  dataState: 'LIVE' | 'SYNCING' | 'CACHED' | 'DISCONNECTED';
  lastUpdated: number;
  currentTime: number;
  
  // Actions
  refreshAll: () => Promise<void>;
  runDeepScan: (timeframe?: string) => Promise<void>;
  reconcileSignals: (incoming: Signal[]) => void;
  setPreMoveSignals: (signals: Signal[]) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function normalizeSymbol(sym: string): string {
  return (sym || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function getPriorityWeight(priority?: ActionablePriority): number {
  switch (priority) {
    case 'ENTRY_NOW': return 5;
    case 'HIGH_PRIORITY': return 4;
    case 'WATCH': return 3;
    case 'WAIT': return 2;
    case 'INVALIDATED_EXPIRED': return 1;
    default: return 0;
  }
}

function getGradeWeight(grade?: SignalQualityGrade): number {
  switch (grade) {
    case 'A+': return 5;
    case 'A': return 4;
    case 'B': return 3;
    case 'C': return 2;
    case 'WAIT': return 1;
    default: return 0;
  }
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [preMoveSignals, setPreMoveSignals] = useState<Signal[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null);
  const [lifecycleStats, setLifecycleStats] = useState<SignalLifecycleStats | null>(null);
  const [coverageTelemetry, setCoverageTelemetry] = useState<MarketCoverageTelemetry | null>(null);
  const [opportunityRankings, setOpportunityRankings] = useState<OpportunityRanking | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [radar, setRadar] = useState<RadarItem[]>([]);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [selectedRadar, setSelectedRadar] = useState<RadarItem | null>(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState<boolean>(false);
  const [dataState, setDataState] = useState<'LIVE' | 'SYNCING' | 'CACHED' | 'DISCONNECTED'>('SYNCING');
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Continuous real-time system clock (ticks every second)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [filter, setFilter] = useState<ScannerFilter>({
    direction: 'ALL',
    minScore: 0,
    status: 'ALL',
    category: 'ALL',
    rankingBucket: 'ALL',
    rankingTier: 'ALL',
    sortBy: 'PRIORITY_SCORE',
    searchQuery: ''
  });

  /**
   * PHASE 6.2 IDEMPOTENT RECONCILIATION & OPPORTUNITY PRIORITY RANKING:
   * ONE COIN = ONE CURRENT UNIFIED SIGNAL.
   * Deterministically scores and ranks setups using Opportunity Priority Engine.
   */
  const reconcileSignals = useCallback((incoming: Signal[], isAuthoritativeFullSync: boolean = false) => {
    if (!Array.isArray(incoming)) return;

    setSignals((prevSignals) => {
      // Map existing signals by normalized symbol
      const symbolMap = new Map<string, Signal>();

      if (!isAuthoritativeFullSync) {
        for (const sig of prevSignals) {
          if (sig && sig.symbol) {
            const symKey = normalizeSymbol(sig.symbol);
            symbolMap.set(symKey, sig);
          }
        }
      }

      // Merge incoming signals
      for (const fresh of incoming) {
        if (!fresh || !fresh.symbol) continue;

        const symKey = normalizeSymbol(fresh.symbol);
        const canonicalTargets = getCanonicalTargets(fresh);
        const priorityAnalysis = fresh.opportunityPriority || calculateClientOpportunityPriority(fresh);
        const fusionScore = fresh.unifiedFusionScore ?? calculateUnifiedFusionScore(fresh);

        const normalizedFresh: Signal = {
          ...fresh,
          targets: canonicalTargets,
          tp1: canonicalTargets[0]?.price || fresh.tp1,
          tp2: canonicalTargets[1]?.price || fresh.tp2,
          tp3: canonicalTargets[2]?.price || fresh.tp3,
          priorityScore: priorityAnalysis.priorityScore,
          rankingTier: priorityAnalysis.rankingTier,
          opportunityPriority: priorityAnalysis,
          unifiedFusionScore: fusionScore
        };

        if (symbolMap.has(symKey) && !isAuthoritativeFullSync) {
          const existing = symbolMap.get(symKey)!;
          symbolMap.set(symKey, {
            ...existing,
            ...normalizedFresh,
            targets: canonicalTargets
          });
        } else {
          symbolMap.set(symKey, normalizedFresh);
        }
      }

      // Deterministic sort and assign priorityRank across unified signal universe
      // Invariant: Exclude invalidated, expired, or drifted signals from actionable state
      const activeCandidates: Signal[] = [];
      for (const sig of symbolMap.values()) {
        if (!sig || !sig.symbol) continue;
        if (
          sig.status === 'INVALIDATED' ||
          sig.status === 'EXPIRED' ||
          sig.status === 'STOPPED_OUT' ||
          sig.status === 'CANCELLED' ||
          sig.status === 'COMPLETED' ||
          sig.actionablePriority === 'INVALIDATED_EXPIRED' ||
          sig.entryStatus === 'INVALIDATED' ||
          sig.entryStatus === 'ENTRY_MISSED'
        ) {
          continue;
        }
        if (sig.entryPrice <= 0 || sig.stopLoss <= 0 || (sig.direction !== 'LONG' && sig.direction !== 'SHORT')) {
          continue;
        }
        // Directional coherence
        if (sig.direction === 'LONG' && (sig.stopLoss >= sig.entryPrice || (sig.currentPrice > 0 && sig.stopLoss >= sig.currentPrice))) continue;
        if (sig.direction === 'SHORT' && (sig.stopLoss <= sig.entryPrice || (sig.currentPrice > 0 && sig.stopLoss <= sig.currentPrice))) continue;

        // Entry zone consistency check (Zero Drift Invalidation Rule):
        // LONG: currentPrice <= entryZoneHigh (currentPrice > entryZoneHigh = INVALIDATE / BLOCK)
        // SHORT: currentPrice >= entryZoneLow (currentPrice < entryZoneLow = INVALIDATE / BLOCK)
        // No percentage grace.
        const hasHitTp = sig.targets?.some(t => t.hit || t.status === 'HIT');
        if (!hasHitTp && sig.currentPrice > 0) {
          const entryHigh = sig.entryZoneHigh || sig.entryPrice;
          const entryLow = sig.entryZoneLow || sig.entryPrice;
          if (sig.direction === 'LONG' && sig.currentPrice > entryHigh) {
            continue; // Missed entry / already surged
          }
          if (sig.direction === 'SHORT' && sig.currentPrice < entryLow) {
            continue; // Missed entry / already dumped
          }
          const drift = Math.abs(sig.currentPrice - sig.entryPrice) / sig.entryPrice;
          if (drift > 0.05) {
            continue;
          }
        }
        activeCandidates.push(sig);
      }

      const sorted = rankAndSortSignals(activeCandidates, 'PRIORITY_SCORE');

      // Phase 17 Optimization: Shallow equality check to avoid triggering unnecessary React re-renders
      if (
        prevSignals.length === sorted.length &&
        prevSignals.every((prev, i) => {
          const next = sorted[i];
          return (
            prev.id === next.id &&
            prev.status === next.status &&
            prev.currentPrice === next.currentPrice &&
            prev.moonScore === next.moonScore &&
            prev.priorityScore === next.priorityScore &&
            prev.entryStatus === next.entryStatus &&
            Boolean(prev.preMoveReport) === Boolean(next.preMoveReport) &&
            prev.preMoveReport?.coilScore === next.preMoveReport?.coilScore
          );
        })
      ) {
        return prevSignals;
      }

      return sorted;
    });

    // Also update selectedSignal if it's currently open in modal
    setSelectedSignal((currSelected) => {
      if (!currSelected) return null;
      const updated = incoming.find(
        (s) => s.id === currSelected.id || normalizeSymbol(s.symbol) === normalizeSymbol(currSelected.symbol)
      );
      if (updated) {
        const priorityAnalysis = updated.opportunityPriority || calculateClientOpportunityPriority(updated);
        const fusionScore = updated.unifiedFusionScore ?? calculateUnifiedFusionScore(updated);
        return {
          ...currSelected,
          ...updated,
          targets: getCanonicalTargets(updated),
          priorityScore: priorityAnalysis.priorityScore,
          rankingTier: priorityAnalysis.rankingTier,
          opportunityPriority: priorityAnalysis,
          unifiedFusionScore: fusionScore
        };
      }
      return currSelected;
    });
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      setDataState('SYNCING');
      const [fetchedSignals, fetchedPreMove, fetchedStats, fetchedLifecycleStats, fetchedTelemetry, fetchedRankings, fetchedNews, fetchedRadar] = await Promise.all([
        fetchSignals(true),
        fetchPreMoveSignals(true),
        fetchMarketStats(),
        fetchLifecycleStats(),
        fetchCoverageTelemetry(),
        fetchOpportunityRankings(),
        fetchNews(),
        fetchRadar()
      ]);

      if (Array.isArray(fetchedSignals)) {
        reconcileSignals(fetchedSignals, true);
      }
      if (Array.isArray(fetchedPreMove)) {
        setPreMoveSignals(fetchedPreMove);
      }
      if (fetchedStats) setMarketStats(fetchedStats);
      if (fetchedLifecycleStats) setLifecycleStats(fetchedLifecycleStats);
      if (fetchedTelemetry) setCoverageTelemetry(fetchedTelemetry);
      if (fetchedRankings) setOpportunityRankings(fetchedRankings);
      if (fetchedNews) setNews(fetchedNews);
      if (fetchedRadar) setRadar(fetchedRadar);

      setDataState('LIVE');
      setLastUpdated(Date.now());
    } catch (err) {
      console.warn('[AppContext] Refresh error:', err);
      setDataState('CACHED');
    }
  }, [reconcileSignals]);

  const runDeepScan = useCallback(async (timeframe?: string) => {
    try {
      setDataState('SYNCING');
      const fresh = await triggerMarketScan();
      if (Array.isArray(fresh) && fresh.length > 0) {
        reconcileSignals(fresh, true);
      }
      const [freshPreMove, freshStats, freshTelemetry, freshRankings] = await Promise.all([
        fetchPreMoveSignals(true),
        fetchLifecycleStats(),
        fetchCoverageTelemetry(),
        fetchOpportunityRankings()
      ]);
      if (Array.isArray(freshPreMove)) {
        setPreMoveSignals(freshPreMove);
        const activeSyms = new Set(freshPreMove.map(p => normalizeSymbol(p.symbol)));
        setSignals(prev => prev.filter(s => {
          if ((s.id && s.id.includes('PREMOVE')) || s.alertType === 'PRE_PUMP' || s.alertType === 'PRE_DUMP') {
            return activeSyms.has(normalizeSymbol(s.symbol));
          }
          return true;
        }));
        if (freshPreMove.length > 0) {
          reconcileSignals(freshPreMove);
        }
      }
      if (freshStats) setLifecycleStats(freshStats);
      if (freshTelemetry) setCoverageTelemetry(freshTelemetry);
      if (freshRankings) setOpportunityRankings(freshRankings);

      setDataState('LIVE');
      setLastUpdated(Date.now());
    } catch (err) {
      console.warn('[AppContext] Scan error:', err);
      setDataState('CACHED');
    }
  }, [reconcileSignals]);

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Phase 17 Optimization: Visibility-aware, non-overlapping batch polling loop with fast retry on startup
  const isPollingRef = useRef(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    let isDisposed = false;

    const doPoll = async () => {
      if (isDisposed || document.hidden || isPollingRef.current) return;
      isPollingRef.current = true;
      try {
        const [fresh, freshPreMove, stats, telemetry, rankings, mStats] = await Promise.all([
          fetchSignals(signals.length === 0),
          fetchPreMoveSignals(false),
          fetchLifecycleStats(),
          fetchCoverageTelemetry(),
          fetchOpportunityRankings(),
          fetchMarketStats()
        ]);
        if (Array.isArray(fresh)) {
          reconcileSignals(fresh, true);
        }
        if (Array.isArray(freshPreMove)) {
          setPreMoveSignals(freshPreMove);
          const activeSyms = new Set(freshPreMove.map(p => normalizeSymbol(p.symbol)));
          setSignals(prev => prev.filter(s => {
            if ((s.id && s.id.includes('PREMOVE')) || s.alertType === 'PRE_PUMP' || s.alertType === 'PRE_DUMP') {
              return activeSyms.has(normalizeSymbol(s.symbol));
            }
            return true;
          }));
          if (freshPreMove.length > 0) {
            reconcileSignals(freshPreMove);
          }
        }
        if (stats) setLifecycleStats(stats);
        if (telemetry) setCoverageTelemetry(telemetry);
        if (rankings) setOpportunityRankings(rankings);
        if (mStats) setMarketStats(mStats);

        setDataState('LIVE');
        setLastUpdated(Date.now());
      } catch (err) {
        console.warn('[AppContext] Background sync error:', err);
      } finally {
        isPollingRef.current = false;
        if (!isDisposed) {
          // If signals are still empty, retry rapidly (2.5s) until initial batch arrives; then standard 8s cadence
          const delay = signals.length === 0 ? 2500 : 8000;
          timeoutId = setTimeout(doPoll, delay);
        }
      }
    };

    // Schedule next poll shortly after initial mount
    timeoutId = setTimeout(doPoll, 4000);

    const handleVisibilityChange = () => {
      if (!document.hidden && !isPollingRef.current) {
        if (timeoutId) clearTimeout(timeoutId);
        doPoll();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isDisposed = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [reconcileSignals, signals.length]);

  // Filter and Sorting computation (Phase 6.2 Deterministic Ranking)
  const filteredSignals = useMemo(() => {
    const matched = signals.filter((signal) => {
      // Direction filter
      if (filter.direction !== 'ALL' && signal.direction !== filter.direction) {
        return false;
      }
      // Score filter
      if (signal.moonScore < filter.minScore) {
        return false;
      }
      // Category filter
      if (filter.category && filter.category !== 'ALL' && signal.category !== filter.category) {
        return false;
      }
      // Ranking bucket filter
      if (filter.rankingBucket && filter.rankingBucket !== 'ALL' && signal.rankingBucket !== filter.rankingBucket) {
        return false;
      }
      // Ranking tier filter (Phase 6.2)
      if (filter.rankingTier && filter.rankingTier !== 'ALL' && signal.rankingTier !== filter.rankingTier) {
        return false;
      }
      // Status filter
      if (filter.status === 'ENTRY_NOW') {
        const isEntryNow = (
          signal.status !== 'STOPPED_OUT' &&
          signal.status !== 'EXPIRED' &&
          signal.status !== 'CANCELLED' &&
          (signal.entryStatus === 'ENTRY_NOW' || signal.actionablePriority === 'ENTRY_NOW')
        );
        if (!isEntryNow) return false;
      } else if (filter.status === 'ACTIVE') {
        if (signal.status !== 'ACTIVE' && signal.status !== 'TRIGGERED') return false;
      } else if (filter.status === 'COMPLETED') {
        if (!signal.status.includes('TP') && signal.status !== 'STOPPED_OUT' && signal.status !== 'EXPIRED') return false;
      } else if (filter.status === 'WAIT') {
        const isWait = (
          signal.direction === 'WAIT' ||
          signal.qualityGrade === 'WAIT' ||
          signal.actionablePriority === 'WAIT' ||
          signal.entryStatus === 'WAIT_FOR_ENTRY' ||
          signal.entryStatus === 'WAIT_FOR_PULLBACK' ||
          signal.entryStatus === 'WAIT_FOR_RETEST' ||
          signal.entryStatus === 'WAIT_FOR_CONFIRMATION'
        );
        if (!isWait) return false;
      }

      // Search query
      if (filter.searchQuery) {
        const q = filter.searchQuery.toLowerCase().trim();
        const matchSymbol = signal.symbol.toLowerCase().includes(q);
        const matchPattern = signal.pattern?.toLowerCase().includes(q);
        if (!matchSymbol && !matchPattern) return false;
      }

      return true;
    });

    return rankAndSortSignals(matched, filter.sortBy || 'PRIORITY_SCORE');
  }, [signals, filter]);

  return (
    <AppContext.Provider
      value={{
        signals,
        preMoveSignals,
        filteredSignals,
        selectedSignal,
        setSelectedSignal,
        marketStats,
        lifecycleStats,
        coverageTelemetry,
        opportunityRankings,
        news,
        radar,
        selectedNews,
        setSelectedNews,
        selectedRadar,
        setSelectedRadar,
        isAlertModalOpen,
        setIsAlertModalOpen,
        filter,
        setFilter,
        dataState,
        lastUpdated,
        currentTime,
        refreshAll,
        runDeepScan,
        reconcileSignals,
        setPreMoveSignals
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
