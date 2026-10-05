import { Capacitor } from '@capacitor/core';
import {
  Signal,
  MarketStats,
  NewsItem,
  RadarItem,
  CryptoCandle,
  SignalLifecycleStats,
  MarketCoverageTelemetry,
  OpportunityRanking,
  CoinAnalysisReport
} from '../types/crypto';

export const DEFAULT_PRODUCTION_API_URL = 'https://moonscanner.ai.studio';

export const getApiBase = (): string => {
  // If running inside Capacitor native Android/iOS mobile container
  if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
    const rawUrl = (import.meta as any).env?.VITE_API_URL;
    if (typeof rawUrl === 'string' && (rawUrl.startsWith('https://') || rawUrl.startsWith('http://'))) {
      const clean = rawUrl.trim().replace(/\/+$/, '');
      return clean.endsWith('/api') ? clean : `${clean}/api`;
    }
    return `${DEFAULT_PRODUCTION_API_URL}/api`;
  }
  // In standard web browser execution, ALWAYS use relative '/api'
  // so requests route directly to the active backend container serving the applet
  return '/api';
};

// Phase 17 Performance: In-flight deduplication and safe client-side TTL caching
const inFlightRequests = new Map<string, Promise<any>>();
const clientCache = new Map<string, { data: any; timestamp: number; ttlMs: number }>();

async function cachedFetch<T>(
  url: string,
  options?: RequestInit,
  ttlMs: number = 3000
): Promise<T> {
  const method = options?.method?.toUpperCase() || 'GET';

  // Only cache GET requests
  if (method === 'GET') {
    const cached = clientCache.get(url);
    if (cached && Date.now() - cached.timestamp < cached.ttlMs) {
      return cached.data as T;
    }

    if (inFlightRequests.has(url)) {
      return inFlightRequests.get(url) as Promise<T>;
    }
  }

  const reqPromise = (async () => {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (method === 'GET' && ttlMs > 0) {
        clientCache.set(url, { data, timestamp: Date.now(), ttlMs });
      }
      return data as T;
    } finally {
      inFlightRequests.delete(url);
    }
  })();

  if (method === 'GET') {
    inFlightRequests.set(url, reqPromise);
  }

  return reqPromise;
}

export function clearApiClientCache(): void {
  clientCache.clear();
}

export async function fetchCoverageTelemetry(): Promise<MarketCoverageTelemetry | null> {
  try {
    return await cachedFetch<MarketCoverageTelemetry>(`${getApiBase()}/market/coverage-telemetry`, undefined, 3000);
  } catch (err) {
    console.warn('[API] fetchCoverageTelemetry error:', err);
    return null;
  }
}

export async function fetchOpportunityRankings(): Promise<OpportunityRanking | null> {
  try {
    return await cachedFetch<OpportunityRanking>(`${getApiBase()}/market/opportunity-rankings`, undefined, 4000);
  } catch (err) {
    console.warn('[API] fetchOpportunityRankings error:', err);
    return null;
  }
}

export async function fetchMarketUniverse(): Promise<{ totalEligible: number; symbols: string[]; categories: any } | null> {
  try {
    return await cachedFetch<any>(`${getApiBase()}/market/universe`, undefined, 30000);
  } catch (err) {
    console.warn('[API] fetchMarketUniverse error:', err);
    return null;
  }
}

export async function fetchLifecycleStats(): Promise<SignalLifecycleStats | null> {
  try {
    return await cachedFetch<SignalLifecycleStats>(`${getApiBase()}/lifecycle-stats`, undefined, 3000);
  } catch (err) {
    console.warn('[API] fetchLifecycleStats error:', err);
    return null;
  }
}

export async function fetchSignals(forceFresh: boolean = false): Promise<Signal[]> {
  try {
    const url = `${getApiBase()}/signals`;
    if (forceFresh) {
      clientCache.delete(url);
    }
    const data = await cachedFetch<any>(url, undefined, 2500);
    const list = Array.isArray(data) ? data : (data?.signals || []);
    // If empty list returned, avoid caching so background poll can retry immediately
    if (list.length === 0) {
      clientCache.delete(url);
    }
    return list;
  } catch (err) {
    console.warn('[API] fetchSignals error:', err);
    return [];
  }
}

export async function fetchPreMoveSignals(forceFresh: boolean = false): Promise<Signal[]> {
  try {
    const url = `${getApiBase()}/pre-move`;
    if (forceFresh) {
      clientCache.delete(url);
    }
    const data = await cachedFetch<any>(url, undefined, 2500);
    const list = Array.isArray(data) ? data : (data?.signals || []);
    if (list.length === 0) {
      clientCache.delete(url);
    }
    return list;
  } catch (err) {
    console.warn('[API] fetchPreMoveSignals error:', err);
    return [];
  }
}

export async function triggerMarketScan(): Promise<Signal[]> {
  try {
    clearApiClientCache();
    const res = await fetch(`${getApiBase()}/scan`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.signals || []);
  } catch (err) {
    console.warn('[API] triggerMarketScan error:', err);
    return [];
  }
}

export async function fetchMarketStats(): Promise<MarketStats | null> {
  try {
    return await cachedFetch<MarketStats>(`${getApiBase()}/market-stats`, undefined, 5000);
  } catch (err) {
    console.warn('[API] fetchMarketStats error:', err);
    return null;
  }
}

export async function fetchNews(): Promise<NewsItem[]> {
  try {
    const data = await cachedFetch<any>(`${getApiBase()}/news`, undefined, 30000);
    return Array.isArray(data) ? data : (data.news || []);
  } catch (err) {
    console.warn('[API] fetchNews error:', err);
    return [];
  }
}

export async function fetchRadar(): Promise<RadarItem[]> {
  try {
    const data = await cachedFetch<any>(`${getApiBase()}/radar`, undefined, 30000);
    return Array.isArray(data) ? data : (data.radar || []);
  } catch (err) {
    console.warn('[API] fetchRadar error:', err);
    return [];
  }
}

export async function fetchCandles(symbol: string, interval: string = '1h', limit: number = 100): Promise<CryptoCandle[]> {
  try {
    const cleanSymbol = symbol.replace('/', '').toUpperCase();
    const data = await cachedFetch<any>(
      `${getApiBase()}/market/candles?symbol=${cleanSymbol}&interval=${interval}&limit=${limit}`,
      undefined,
      10000
    );
    return Array.isArray(data) ? data : (data.candles || []);
  } catch (err) {
    console.warn('[API] fetchCandles error:', err);
    return [];
  }
}

export async function searchCoins(query: string, limit: number = 8): Promise<any[]> {
  try {
    return await cachedFetch<any[]>(
      `${getApiBase()}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      undefined,
      5000
    );
  } catch (err) {
    console.warn('[API] searchCoins error:', err);
    return [];
  }
}

export async function fetchCoinAnalysis(symbol: string, timeframe: string = '1h'): Promise<CoinAnalysisReport | null> {
  try {
    const clean = symbol.replace('/', '').toUpperCase();
    return await cachedFetch<CoinAnalysisReport>(
      `${getApiBase()}/analysis/${clean}?timeframe=${timeframe}`,
      undefined,
      8000
    );
  } catch (err) {
    console.warn('[API] fetchCoinAnalysis error:', err);
    return null;
  }
}

export async function fetchListingRadar(): Promise<any[]> {
  try {
    return await cachedFetch<any[]>(`${getApiBase()}/listings`, undefined, 30000);
  } catch (err) {
    console.warn('[API] fetchListingRadar error:', err);
    return [];
  }
}

// ================= MULTI-USER TRADING API =================

export async function loginUser(email: string, password: string): Promise<{ token: string; user: any }> {
  const res = await fetch(`${getApiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function registerUser(email: string, password: string): Promise<{ token: string; user: any }> {
  const res = await fetch(`${getApiBase()}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

export async function getAuthProfile(token: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Session expired');
  return data;
}

export async function logoutUser(token: string): Promise<void> {
  await fetch(`${getApiBase()}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  }).catch(() => {});
}

export async function fetchUserTradingSummary(token: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/summary`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch trading summary');
  return data;
}

export async function updateTradingSettings(token: string, settings: any): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(settings)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update trading settings');
  return data;
}

export async function connectBinance(
  token: string,
  apiKey: string,
  apiSecret: string,
  testnet: boolean = false
): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/binance/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ apiKey, apiSecret, testnet })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to connect Binance');
  return data;
}

export async function disconnectBinance(token: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/binance/disconnect`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to disconnect Binance');
  return data;
}

export async function setEmergencyStop(token: string, active: boolean): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/emergency-stop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ active })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to toggle emergency stop');
  return data;
}

export async function emergencyCloseAllPositions(token: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/emergency-close-all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to emergency close all positions');
  return data;
}

export async function fetchTop5ActionableSignals(token: string): Promise<any[]> {
  const res = await fetch(`${getApiBase()}/trading/top5-actionable`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch Top 5 actionable signals');
  return data;
}

export async function executeTrade(
  token: string,
  signalId: string,
  forceManual: boolean = false,
  options?: { margin?: number; leverage?: number; marginType?: 'CROSS' | 'ISOLATED' }
): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ signalId, forceManual, ...options })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Trade execution failed');
  return data;
}

export async function closePosition(token: string, positionId: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/positions/${positionId}/close`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to close position');
  return data;
}

export async function marketClosePosition(token: string, positionId: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/positions/${positionId}/market-close`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to market close position');
  return data;
}

export async function partialClosePosition(token: string, positionId: string, percent: number): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/positions/${positionId}/partial-close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ percent })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to execute partial close');
  return data;
}

export async function updatePositionBrackets(
  token: string,
  positionId: string,
  brackets: { stopLoss?: number; takeProfit?: number }
): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/positions/${positionId}/update-brackets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(brackets)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update position brackets');
  return data;
}

export async function toggleTrailingRunner(token: string, positionId: string, active: boolean): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/positions/${positionId}/trailing-runner`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ active })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to toggle trailing runner');
  return data;
}

export async function fetchTradingTelemetry(token: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/telemetry`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch live telemetry');
  return data;
}

export async function fetchSymbolInfo(token: string, symbol: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/symbol-info/${symbol}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch symbol info');
  return data;
}

export async function connectExchange(
  token: string,
  params: {
    exchange: string;
    apiKey: string;
    apiSecret: string;
    passphrase?: string;
    accountLabel?: string;
    testnet?: boolean;
  }
): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/exchange/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(params)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Failed to connect ${params.exchange}`);
  return data;
}

export async function disconnectExchange(token: string, exchange: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/exchange/${exchange}/disconnect`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Failed to disconnect ${exchange}`);
  return data;
}

export async function fetchTradeRejections(token: string): Promise<any[]> {
  const res = await fetch(`${getApiBase()}/trading/rejections`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch trade rejection logs');
  return data;
}

export async function resetPaperBalance(token: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/reset-paper`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to reset paper balance');
  return data;
}

export async function fetchExecutionAudits(token: string): Promise<any[]> {
  const res = await fetch(`${getApiBase()}/trading/audit-logs`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch execution audits');
  return data;
}

export async function syncExchangePositions(token: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/trading/sync-positions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to sync exchange positions');
  return data;
}

// ================= ADMIN USER APPROVAL API =================

export async function fetchPendingUsers(token: string): Promise<any[]> {
  const res = await fetch(`${getApiBase()}/admin/users/pending`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch pending user requests');
  return data.pendingUsers || [];
}

export async function fetchAllUsers(token: string): Promise<any[]> {
  const res = await fetch(`${getApiBase()}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch user accounts');
  return data.users || [];
}

export async function approveUserAccess(token: string, userId: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/admin/users/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ userId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to approve user access');
  return data;
}

export async function revokeUserAccess(token: string, userId: string): Promise<any> {
  const res = await fetch(`${getApiBase()}/admin/users/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ userId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to revoke user access');
  return data;
}



