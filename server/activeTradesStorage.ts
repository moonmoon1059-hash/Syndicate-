import fs from 'fs';
import path from 'path';
import { SupernovaCandidate } from '../src/types/supernova';
import { recordClosedTrade, formatDhakaTime } from './tradeHistoryStorage';

export interface ActiveTradeRecord {
  id: string;
  symbol: string;
  baseAsset: string;
  direction: 'LONG' | 'SHORT';
  phase: string;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp4?: number;
  currentPrice: number;
  score: number;
  rvol: number;
  oiSurgePct: number;
  fundingRatePct: number;
  reasons: string[];
  openedAt: number;
  openedAtFormatted: string; // Bangladesh Local Time (Asia/Dhaka UTC+6)
  lastUpdatedAt: number;
  status: 'ACTIVE' | 'TP1_LOCKED' | 'TP2_LOCKED' | 'TP3_LOCKED';
  livePnlPct: number;
  peakPnlPct: number;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const ACTIVE_TRADES_FILE = path.join(DATA_DIR, 'active_trades.json');

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[ActiveTradesStorage] Failed to create data dir:', err);
  }
}

// In-memory active trade map backed by data/active_trades.json
const activeTradesMap = new Map<string, ActiveTradeRecord>();
let isInitialized = false;

function loadActiveTrades(): void {
  if (isInitialized) return;
  ensureDataDir();
  try {
    if (fs.existsSync(ACTIVE_TRADES_FILE)) {
      const raw = fs.readFileSync(ACTIVE_TRADES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        activeTradesMap.clear();
        for (const item of parsed) {
          if (item && item.symbol) {
            const cleanSym = item.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
            activeTradesMap.set(cleanSym, item);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[ActiveTradesStorage] Error reading active_trades.json:', err);
  }
  isInitialized = true;
}

function persistActiveTrades(): void {
  ensureDataDir();
  try {
    const list = Array.from(activeTradesMap.values());
    fs.writeFileSync(ACTIVE_TRADES_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[ActiveTradesStorage] Error saving active_trades.json:', err);
  }
}

/**
 * Returns all active in-flight trades as an array
 */
export function getActiveTrades(): ActiveTradeRecord[] {
  loadActiveTrades();
  return Array.from(activeTradesMap.values()).sort((a, b) => b.openedAt - a.openedAt);
}

/**
 * Registers or updates an active trade.
 * Appends to active trades without overwriting or dropping other existing running setups.
 */
export function registerOrUpdateActiveTrade(candidate: SupernovaCandidate | any): ActiveTradeRecord {
  loadActiveTrades();
  const cleanSym = candidate.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const existing = activeTradesMap.get(cleanSym);
  const now = Date.now();

  const entry = candidate.entryPrice || candidate.currentPrice || 1;
  const cur = candidate.currentPrice || entry;
  const isLong = candidate.direction === 'LONG';
  const livePnlPct = isLong ? ((cur - entry) / entry) * 100 : ((entry - cur) / entry) * 100;

  if (existing) {
    // Update live prices and progression
    existing.currentPrice = cur;
    existing.livePnlPct = Number(livePnlPct.toFixed(2));
    existing.peakPnlPct = Math.max(existing.peakPnlPct, existing.livePnlPct);
    existing.lastUpdatedAt = now;
    if (candidate.score && candidate.score > existing.score) existing.score = candidate.score;
    persistActiveTrades();
    return existing;
  }

  const newRecord: ActiveTradeRecord = {
    id: candidate.id || `active-${cleanSym}-${now}`,
    symbol: cleanSym,
    baseAsset: candidate.baseAsset || cleanSym.replace('USDT', ''),
    direction: candidate.direction || 'LONG',
    phase: candidate.phase || 'PRE_IGNITION',
    entryPrice: entry,
    stopLoss: candidate.stopLoss || (isLong ? entry * 0.98 : entry * 1.02),
    tp1: candidate.tp1 || (isLong ? entry * 1.05 : entry * 0.95),
    tp2: candidate.tp2 || (isLong ? entry * 1.10 : entry * 0.90),
    tp3: candidate.tp3 || (isLong ? entry * 1.20 : entry * 0.80),
    tp4: candidate.tp4 || (isLong ? entry * 1.50 : entry * 0.50),
    currentPrice: cur,
    score: candidate.score || 95,
    rvol: candidate.rvol || 6.5,
    oiSurgePct: candidate.oiSurgePct || 28.0,
    fundingRatePct: candidate.fundingRatePct || -0.025,
    reasons: Array.isArray(candidate.reasons) ? candidate.reasons : ['Institutional Whale Setup'],
    openedAt: now,
    openedAtFormatted: formatDhakaTime(now),
    lastUpdatedAt: now,
    status: 'ACTIVE',
    livePnlPct: Number(livePnlPct.toFixed(2)),
    peakPnlPct: Math.max(0, Number(livePnlPct.toFixed(2)))
  };

  activeTradesMap.set(cleanSym, newRecord);
  persistActiveTrades();
  console.log(`[ActiveTradesStorage] Pinned new in-flight trade: #${cleanSym} (${newRecord.direction}) | Total Active: ${activeTradesMap.size}`);
  return newRecord;
}

/**
 * Checks mark price against TP4 and Stop Loss.
 * If TP4 or SL hit, moves trade to permanent data/trade_history.json and removes from active trades.
 */
export function checkAndProgressActiveTrades(livePrices: Record<string, number>): {
  closed: { symbol: string; outcome: string; pnlPct: number }[];
  activeCount: number;
} {
  loadActiveTrades();
  const closedResults: { symbol: string; outcome: string; pnlPct: number }[] = [];
  const now = Date.now();

  for (const [sym, trade] of activeTradesMap.entries()) {
    const cur = livePrices[sym] || trade.currentPrice;
    if (!cur || cur <= 0) continue;

    trade.currentPrice = cur;
    const isLong = trade.direction === 'LONG';
    const pnlPct = isLong
      ? ((cur - trade.entryPrice) / trade.entryPrice) * 100
      : ((trade.entryPrice - cur) / trade.entryPrice) * 100;
    trade.livePnlPct = Number(pnlPct.toFixed(2));
    trade.peakPnlPct = Math.max(trade.peakPnlPct, trade.livePnlPct);
    trade.lastUpdatedAt = now;

    // Check 48h Max Lifespan Auto-Expiry
    if (now - trade.openedAt > 48 * 60 * 60 * 1000) {
      recordClosedTrade({
        symbol: sym,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        exitPrice: cur,
        stopLoss: trade.stopLoss,
        tp1: trade.tp1,
        tp2: trade.tp2,
        tp3: trade.tp3,
        tp4: trade.tp4,
        outcome: 'EXPIRED',
        pnlPct: Number(pnlPct.toFixed(2)),
        riskRewardAchieved: 0,
        entryTimestamp: trade.openedAt,
        exitTimestamp: now,
        notes: `Trade reached 48h maximum lifespan window. Archived automatically.`,
        source: 'SUPERNOVA'
      });
      activeTradesMap.delete(sym);
      closedResults.push({ symbol: sym, outcome: 'EXPIRED', pnlPct: Number(pnlPct.toFixed(2)) });
      continue;
    }

    // Check Stop Loss
    const isSlHit = isLong ? cur <= trade.stopLoss : cur >= trade.stopLoss;
    if (isSlHit) {
      recordClosedTrade({
        symbol: sym,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        exitPrice: cur,
        stopLoss: trade.stopLoss,
        tp1: trade.tp1,
        tp2: trade.tp2,
        tp3: trade.tp3,
        tp4: trade.tp4,
        outcome: 'STOPPED_OUT',
        pnlPct: Number(pnlPct.toFixed(2)),
        riskRewardAchieved: 0,
        entryTimestamp: trade.openedAt,
        exitTimestamp: now,
        notes: `Structural invalidation reached at $${cur}. Risk management auto-exit.`,
        source: 'SUPERNOVA'
      });
      activeTradesMap.delete(sym);
      closedResults.push({ symbol: sym, outcome: 'STOPPED_OUT', pnlPct: Number(pnlPct.toFixed(2)) });
      continue;
    }

    // Check TP4 (Full Objective Completed)
    const tp4Target = trade.tp4 || (isLong ? trade.tp3 * 1.3 : trade.tp3 * 0.7);
    const isTp4Hit = isLong ? cur >= tp4Target : cur <= tp4Target;
    if (isTp4Hit) {
      recordClosedTrade({
        symbol: sym,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        exitPrice: cur,
        stopLoss: trade.stopLoss,
        tp1: trade.tp1,
        tp2: trade.tp2,
        tp3: trade.tp3,
        tp4: trade.tp4,
        outcome: 'TP4_HIT',
        pnlPct: Number(pnlPct.toFixed(2)),
        riskRewardAchieved: 8.5,
        entryTimestamp: trade.openedAt,
        exitTimestamp: now,
        notes: `TP4 Moon Runner fully completed at $${cur}. Maximum reward banked.`,
        source: 'SUPERNOVA'
      });
      activeTradesMap.delete(sym);
      closedResults.push({ symbol: sym, outcome: 'TP4_HIT', pnlPct: Number(pnlPct.toFixed(2)) });
      continue;
    }

    // Check TP1 / TP2 / TP3 Milestone Progression
    if (isLong) {
      if (cur >= trade.tp3) trade.status = 'TP3_LOCKED';
      else if (cur >= trade.tp2) trade.status = 'TP2_LOCKED';
      else if (cur >= trade.tp1) {
        trade.status = 'TP1_LOCKED';
        // Zero-loss break-even trailing lock activates automatically upon TP1
        trade.stopLoss = trade.entryPrice;
      }
    } else {
      if (cur <= trade.tp3) trade.status = 'TP3_LOCKED';
      else if (cur <= trade.tp2) trade.status = 'TP2_LOCKED';
      else if (cur <= trade.tp1) {
        trade.status = 'TP1_LOCKED';
        trade.stopLoss = trade.entryPrice;
      }
    }
  }

  persistActiveTrades();
  return { closed: closedResults, activeCount: activeTradesMap.size };
}

/**
 * Manually close or dismiss an active trade
 */
export function removeActiveTrade(symbol: string): boolean {
  loadActiveTrades();
  const cleanSym = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const deleted = activeTradesMap.delete(cleanSym);
  if (deleted) persistActiveTrades();
  return deleted;
}
