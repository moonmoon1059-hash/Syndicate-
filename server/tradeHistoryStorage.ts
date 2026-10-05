import fs from 'fs';
import path from 'path';

export interface ClosedTradeRecord {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
  tp4?: number;
  outcome: 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'TP4_HIT' | 'STOPPED_OUT' | 'BREAK_EVEN' | 'EXPIRED';
  pnlPct: number;
  riskRewardAchieved: number;
  entryTimestamp: number;
  exitTimestamp: number;
  exitTimestampFormatted: string; // Bangladesh Local Time (Asia/Dhaka UTC+6)
  notes?: string;
  source: 'SUPERNOVA' | 'TERMINAL';
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'trade_history.json');

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[TradeHistory] Failed to create data dir:', err);
  }
}

export function formatDhakaTime(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  return `${new Intl.DateTimeFormat('en-US', options).format(d)} BST`;
}

// In-memory cache synced with data/trade_history.json
let historyCache: ClosedTradeRecord[] = [];
let isInitialized = false;

function loadHistory(): ClosedTradeRecord[] {
  if (isInitialized) return historyCache;
  ensureDataDir();
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        historyCache = parsed;
        isInitialized = true;
        return historyCache;
      }
    }
  } catch (err) {
    console.warn('[TradeHistory] Error reading trade_history.json:', err);
  }
  historyCache = [];
  isInitialized = true;
  return historyCache;
}

function saveHistory(): void {
  ensureDataDir();
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyCache, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[TradeHistory] Error saving trade_history.json:', err);
  }
}

export function recordClosedTrade(trade: Omit<ClosedTradeRecord, 'id' | 'exitTimestampFormatted'>): ClosedTradeRecord {
  loadHistory();
  const id = `trade_${Date.now()}_${trade.symbol.toLowerCase()}`;
  const exitTimestampFormatted = formatDhakaTime(trade.exitTimestamp);
  const record: ClosedTradeRecord = {
    ...trade,
    id,
    exitTimestampFormatted
  };

  // Prepend to show most recent first
  historyCache.unshift(record);

  // Keep up to 200 records
  if (historyCache.length > 200) {
    historyCache = historyCache.slice(0, 200);
  }

  saveHistory();
  return record;
}

export function getClosedTradeHistory(): ClosedTradeRecord[] {
  return loadHistory();
}
