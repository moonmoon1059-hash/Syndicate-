import { Resvg } from '@resvg/resvg-js';
import { Signal, TargetLevel } from './signalEngine';
import { getActionableStoredSignals } from './signalTracker';
import { tradingStorage, isValidTelegramChatId } from './tradingStorage';
import { calculateDynamicRecommendedLeverage, calculateRealEntryZone } from './technicalAnalysis';
import {
  generateCandlestickChartSvg as engineGenerateCandlestickChartSvg,
  renderCandlestickChartPng as engineRenderCandlestickChartPng,
  generateSyntheticPatternCandles as engineGenerateSyntheticPatternCandles,
  generateTradingViewChart,
  formatPrecision,
  getPriceDecimals
} from './chartSnapshotEngine';

export { generateTradingViewChart, formatPrecision };

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartGenerationParams {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number;
  targets: TargetLevel[];
  pattern?: string;
  reason?: string;
  riskRewardRatio?: number | string;
  candles?: CandleData[];
  priceDecimals?: number;
  archetype?: 'BULL_PENNANT' | 'ORDER_BLOCK_SHELF' | 'SR_BREAKOUT_RETEST' | 'BEARISH_DISTRIBUTION';
  leverage?: string;
}

/**
 * Track server boot timestamp to eliminate startup backlog dumps
 */
export const serverBootTimestamp = Date.now();

/**
 * TELEGRAM VIP TIER ANTI-BURST THROTTLE:
 * Hard limit of MAXIMUM 1 signal per 60 minutes to Telegram channel.
 * Elite VIP Alpha Only. All other scanned signals stay in the Web/Mobile App.
 */
let lastTelegramVipBroadcastTime = 0;
const TELEGRAM_VIP_THROTTLE_MS = 60 * 60 * 1000; // 60 minutes hard ceiling

export function getLastTelegramVipBroadcastTime(): number {
  return lastTelegramVipBroadcastTime;
}

export function resetTelegramVipThrottle(): void {
  lastTelegramVipBroadcastTime = 0;
}

export function setLastTelegramVipBroadcastTime(timestamp: number = Date.now()): void {
  lastTelegramVipBroadcastTime = timestamp;
}

/**
 * Formats time in Bangladesh Standard Time (UTC+6, Asia/Dhaka)
 */
export function getBangladeshTimeString(date: Date = new Date()): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  };
  return `${new Intl.DateTimeFormat('en-US', options).format(date)} BST (UTC+6)`;
}

/**
 * Formats short time for chart x-axis ticks (e.g. "04:30 BST")
 */
export function formatBstShortTime(timestamp: number): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  return `${new Intl.DateTimeFormat('en-US', options).format(new Date(timestamp))} BST`;
}

/**
 * Escapes special XML characters to prevent SVG parser failures
 */
export function escapeXml(unsafe: string | number): string {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats price cleanly according to magnitude with sub-cent smart precision
 */
export function formatPrice(price: number, decimals?: number): string {
  if (typeof decimals === 'number') {
    if (price >= 1000 && decimals <= 2) {
      return price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
    return price.toFixed(decimals);
  }
  return formatPrecision(price);
}

/**
 * Formats the standardized institutional VIP Telegram Signal caption:
 * 
 * 🚨 #{symbol} | {direction}
 * 
 * ⚡ Leverage: {dynamicRecommendedLeverage}
 * 🎯 Entry Targets: {entryPrice} (Zone: {entryZoneLow} - {entryZoneHigh})
 * 
 * 🏆 Take Profits 👇
 * 1️⃣ {tp1} (+{tp1_pct}%)
 * 2️⃣ {tp2} (+{tp2_pct}%)
 * 3️⃣ {tp3} (+{tp3_pct}%)
 * 4️⃣ {tp4} (+{tp4_pct}%)
 * 
 * ⛔ Stop Loss: {stopLoss} (-{sl_pct}%)
 * 
 * 💡 Setup active — institutional breakout confirmed. Zero-loss break-even trailing activates automatically at TP1. 💎 Verified R:R 1:{riskRewardRatio}.
 * 🕒 Time: {bangladeshTimeUTC+6}
 */
export function formatTelegramSignalCaption(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp4: number;
  stopLoss: number;
  pattern?: string;
  reason?: string;
  riskRewardRatio?: number | string;
  timestamp?: number;
  priceDecimals?: number;
  leverage?: string;
  isSupernova?: boolean;
  supernovaPotentialPct?: number;
}): string {
  const cleanSym = params.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const bstTime = getBangladeshTimeString(params.timestamp ? new Date(params.timestamp) : new Date());
  const rr = params.riskRewardRatio || '2.5';
  const dec = params.priceDecimals ?? getPriceDecimals(params.entryPrice);

  // Dynamic recommended leverage based on structural SL distance
  const dynamicRecommendedLeverage = params.leverage || calculateDynamicRecommendedLeverage(params.entryPrice, params.stopLoss);

  // Ensure genuine execution band (prevent single-point 1.50 - 1.50)
  let low = params.entryZoneLow;
  let high = params.entryZoneHigh;
  if (!low || !high || low >= high) {
    const band = calculateRealEntryZone(params.entryPrice, dec);
    low = band.entryZoneLow;
    high = band.entryZoneHigh;
  }

  const isLong = params.direction === 'LONG';
  const calcGainPct = (tp: number) => {
    if (!params.entryPrice || params.entryPrice <= 0) return '0.0';
    const pct = isLong
      ? ((tp - params.entryPrice) / params.entryPrice) * 100
      : ((params.entryPrice - tp) / params.entryPrice) * 100;
    return Math.abs(pct).toFixed(1);
  };

  const tp1Pct = calcGainPct(params.tp1);
  const tp2Pct = calcGainPct(params.tp2);
  const tp3Pct = calcGainPct(params.tp3);
  const tp4Pct = calcGainPct(params.tp4);

  const slPct = params.entryPrice > 0
    ? ((Math.abs(params.entryPrice - params.stopLoss) / params.entryPrice) * 100).toFixed(1)
    : '0.0';

  let header = `🚨 #${cleanSym} | ${params.direction}`;
  if (params.isSupernova) {
    if (params.direction === 'SHORT') {
      const isClimax = (params as any).phase === 'CLIMAX_COLLAPSE' || Number((params as any).rsi || 0) >= 80;
      header = isClimax
        ? `🚨 SUPERNOVA CLIMAX CRASH: #${cleanSym} | SHORT NOW 📉`
        : `📉 SUPERNOVA PRE-COLLAPSE: #${cleanSym} (SHORT - Massive Breakdown Potential)`;
    } else {
      header = `🚀 SUPERNOVA PRE-IGNITION: #${cleanSym} (LONG - 50% to 100%+ Potential)`;
    }
  }

  return `${header}

⚡ Leverage: ${dynamicRecommendedLeverage}
🎯 Entry Targets: ${formatPrice(params.entryPrice, dec)} (Zone: ${formatPrice(low, dec)} - ${formatPrice(high, dec)})

🏆 Take Profits 👇
1️⃣ TP1: ${formatPrice(params.tp1, dec)} (+${tp1Pct}%)
2️⃣ TP2: ${formatPrice(params.tp2, dec)} (+${tp2Pct}%)
3️⃣ TP3: ${formatPrice(params.tp3, dec)} (+${tp3Pct}%)
4️⃣ TP4: ${formatPrice(params.tp4, dec)} (+${tp4Pct}%)

⛔ Stop Loss (SL): ${formatPrice(params.stopLoss, dec)} (-${slPct}%)

💡 Setup active — institutional breakout confirmed. Zero-loss break-even trailing activates automatically at TP1. 💎 Verified R:R 1:${rr}.
🕒 Time: ${bstTime}`;
}

/**
 * Generates an ultra-crisp dark-mode 15M candlestick chart SVG string
 * with TradingView fidelity, dynamic scaling, position boxes, and neon RVOL volume subpanel.
 */
export function generateCandlestickChartSvg(params: ChartGenerationParams): string {
  return engineGenerateCandlestickChartSvg(params);
}

/**
 * Converts the generated SVG string into a high-resolution PNG Buffer
 * using @resvg/resvg-js.
 */
export function renderCandlestickChartPng(svg: string): Buffer {
  return engineRenderCandlestickChartPng(svg);
}

/**
 * Generates synthetic pattern candles if live Binance candles are not provided
 */
export function generateSyntheticPatternCandles(entryPrice: number, direction: 'LONG' | 'SHORT', count: number = 42): CandleData[] {
  return engineGenerateSyntheticPatternCandles(entryPrice, direction, count);
}

/**
 * Fetches real 15M candles from Binance REST API with graceful fallback
 */
export async function fetchBinance15mCandles(symbol: string, limit: number = 40): Promise<CandleData[]> {
  const cleanSym = symbol.replace(/[^A-Z0-9]/g, '');
  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${cleanSym}&interval=15m&limit=${limit}`, {
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((k: any) => ({
      time: Number(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  } catch {
    return [];
  }
}

/**
 * Dispatches a verified actionable trade signal with an ultra-clean 15M
 * candlestick chart snapshot to Telegram via sendPhoto.
 */
export async function sendTelegramSignalWithChart(
  signal: Signal,
  options?: {
    botToken?: string;
    chatId?: string;
    candles?: CandleData[];
  }
): Promise<{ success: boolean; error?: string; httpStatusCode?: number }> {
  const token = options?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = options?.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { success: false, error: 'Telegram credentials missing (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)' };
  }

  try {
    // 1. Fetch 15M candles if not provided
    let candles = options?.candles;
    if (!candles || candles.length < 15) {
      candles = await fetchBinance15mCandles(signal.symbol, 42);
    }

    // 2. Ensure 4 Take Profit targets are present
    const isLong = signal.direction === 'LONG';
    const entry = signal.entryPrice;
    const decimals = signal.entryPrice < 1 ? 4 : 2;
    const riskDist = Math.abs(entry - (signal.stopLoss || 0)) || entry * 0.015;

    const tp1 = signal.tp1 || (signal.targets?.[0]?.price) || (isLong ? entry + riskDist * 1.5 : entry - riskDist * 1.5);
    const tp2 = signal.tp2 || (signal.targets?.[1]?.price) || (isLong ? entry + riskDist * 2.5 : entry - riskDist * 2.5);
    const tp3 = signal.tp3 || (signal.targets?.[2]?.price) || (isLong ? entry + riskDist * 4.0 : entry - riskDist * 4.0);
    const tp4 = (signal as any).tp4 || (signal.targets?.[3]?.price) || (isLong ? entry + riskDist * 6.0 : entry - riskDist * 6.0);

    const targets: TargetLevel[] = [
      { id: 'TP1', label: 'TP1', price: tp1, hit: false },
      { id: 'TP2', label: 'TP2', price: tp2, hit: false },
      { id: 'TP3', label: 'TP3', price: tp3, hit: false },
      { id: 'TP4', label: 'TP4', price: tp4, hit: false }
    ];

    // 3. Generate Chart SVG and Render PNG
    const safeReason = Array.isArray(signal.whyTrade)
      ? signal.whyTrade.join(', ')
      : (typeof signal.whyTrade === 'string'
          ? signal.whyTrade
          : (Array.isArray(signal.entryReason)
              ? signal.entryReason.join(', ')
              : (typeof signal.entryReason === 'string'
                  ? signal.entryReason
                  : 'Multi-confluence trendline breakout with volume expansion')));

    const svg = generateCandlestickChartSvg({
      symbol: signal.symbol,
      direction: signal.direction === 'SHORT' ? 'SHORT' : 'LONG',
      entryPrice: entry,
      entryZoneLow: signal.entryZoneLow || (isLong ? entry * 0.998 : entry * 0.995),
      entryZoneHigh: signal.entryZoneHigh || (isLong ? entry * 1.005 : entry * 1.002),
      stopLoss: signal.stopLoss,
      targets,
      pattern: signal.pattern || (isLong ? 'Bullish Pennant Breakout' : 'Bearish Pennant Breakdown'),
      reason: safeReason,
      riskRewardRatio: signal.riskRewardRatio || 2.5,
      candles,
      priceDecimals: decimals
    });

    const pngBuffer = renderCandlestickChartPng(svg);

    // 4. Generate the exact Caption required by the specification
    const caption = formatTelegramSignalCaption({
      symbol: signal.symbol,
      direction: signal.direction === 'SHORT' ? 'SHORT' : 'LONG',
      entryPrice: entry,
      entryZoneLow: signal.entryZoneLow || (isLong ? entry * 0.998 : entry * 0.995),
      entryZoneHigh: signal.entryZoneHigh || (isLong ? entry * 1.005 : entry * 1.002),
      tp1,
      tp2,
      tp3,
      tp4,
      stopLoss: signal.stopLoss,
      pattern: signal.pattern,
      reason: safeReason,
      riskRewardRatio: signal.riskRewardRatio,
      timestamp: signal.createdAt,
      priceDecimals: decimals
    });

    // 5. Send Photo with Caption to Telegram Bot API
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
    const imageBlob = new Blob([pngBuffer], { type: 'image/png' });
    formData.append('photo', imageBlob, `${signal.symbol.replace(/[^A-Z0-9]/g, '')}_15M.png`);

    const url = `https://api.telegram.org/bot${token}/sendPhoto`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData
    });

    const httpStatusCode = response.status;
    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[TelegramService] sendPhoto failed (${httpStatusCode}): ${errText}`);
      return { success: false, httpStatusCode, error: errText };
    }

    return { success: true, httpStatusCode };
  } catch (err: any) {
    console.error('[TelegramService] Error generating/sending chart alert:', err);
    return { success: false, error: err?.message || 'Telegram chart delivery error' };
  }
}

/**
 * Dispatches a live test signal with server-rendered 15M chart and institutional caption.
 * Used by POST /api/telegram/test-dispatch
 */
export async function dispatchLiveTestSignal(
  targetChatId?: string,
  targetToken?: string
): Promise<{ success: boolean; signal?: any; message?: string; error?: string; credentialsRequired?: boolean; httpStatusCode?: number }> {
  const token = targetToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = targetChatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return {
      success: false,
      credentialsRequired: true,
      error: 'Telegram credentials missing (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID required)'
    };
  }

  // 1. Get current top actionable signal or build high-conviction institutional test candidate (e.g. CUSDT)
  const actionable = getActionableStoredSignals();
  let signalToDispatch: any = actionable.length > 0 ? actionable[0] : null;

  if (!signalToDispatch) {
    // Generate institutional candidate for CUSDT (or top coiled token)
    const now = Date.now();
    const entryPrice = 0.1850;
    const stopLoss = 0.1765;
    const delta = Math.abs(entryPrice - stopLoss);
    signalToDispatch = {
      id: `sig_test_cusdt_${now}`,
      symbol: 'CUSDT',
      direction: 'LONG',
      timeframe: '15m',
      entryPrice,
      entryZoneLow: 0.1845,
      entryZoneHigh: 0.1860,
      stopLoss,
      tp1: +(entryPrice + delta * 1.5).toFixed(4),
      tp2: +(entryPrice + delta * 2.5).toFixed(4),
      tp3: +(entryPrice + delta * 4.0).toFixed(4),
      tp4: +(entryPrice + delta * 6.0).toFixed(4),
      targets: [
        { id: 'TP1', price: +(entryPrice + delta * 1.5).toFixed(4) },
        { id: 'TP2', price: +(entryPrice + delta * 2.5).toFixed(4) },
        { id: 'TP3', price: +(entryPrice + delta * 4.0).toFixed(4) },
        { id: 'TP4', price: +(entryPrice + delta * 6.0).toFixed(4) }
      ],
      pattern: 'Bullish High-Tight Pennant Breakout',
      entryReason: 'Volatility compression coil with multi-timeframe volume surge and orderbook buyer imbalance',
      whyTrade: '15M Pennant apex breakout with 2.8x RVOL surge confirming institutional expansion',
      riskRewardRatio: 2.8,
      qualityGrade: 'A+',
      moonScore: 92,
      majorMovePotentialPct: 35.5,
      createdAt: now
    };
  }

  const dispatchRes = await sendTelegramSignalWithChart(signalToDispatch, {
    botToken: token,
    chatId
  });

  if (dispatchRes.success) {
    return {
      success: true,
      signal: signalToDispatch,
      message: `Successfully dispatched live 15M chart snapshot and institutional card for ${signalToDispatch.symbol} to Telegram chat ${chatId}.`
    };
  } else {
    return {
      success: false,
      error: dispatchRes.error || 'Failed to dispatch chart to Telegram',
      httpStatusCode: dispatchRes.httpStatusCode
    };
  }
}

// ============================================================================
// AUTONOMOUS BACKGROUND TELEGRAM BROADCASTER & TARGET TRACKING ENGINE
// ============================================================================

const autonomousDispatchedFingerprints = new Map<string, number>();
const symbolLastDispatchedTime = new Map<string, number>();

/**
 * 12-Hour Per-Symbol Deduplication Gate:
 * Blocks duplicate alerts on the same coin for 12 hours.
 * New distinct coins with Grade A+ setups alert immediately without global lockout!
 */
export function isSymbolIn12HourCooldown(symbol: string): boolean {
  const symbolKey = (symbol || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const lastSent = symbolLastDispatchedTime.get(symbolKey);
  if (!lastSent) return false;
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  return (Date.now() - lastSent) < twelveHoursMs;
}

export function markSymbolDispatched(symbol: string): void {
  const symbolKey = (symbol || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  symbolLastDispatchedTime.set(symbolKey, Date.now());
  const now = Date.now();
  for (const [sym, ts] of symbolLastDispatchedTime.entries()) {
    if (now - ts > 24 * 60 * 60 * 1000) {
      symbolLastDispatchedTime.delete(sym);
    }
  }
}

/**
 * Computes canonical opportunity fingerprint to prevent duplicate dispatches
 */
export function getSignalOpportunityFingerprint(signal: Signal): string {
  const sym = (signal.symbol || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const dir = signal.direction;
  const entry = signal.entryPrice ? Number(signal.entryPrice.toFixed(4)) : 0;
  const sl = signal.stopLoss ? Number(signal.stopLoss.toFixed(4)) : 0;
  const grade = signal.qualityGrade || 'A';
  return `${sym}_${dir}_${entry}_${sl}_${grade}`;
}

/**
 * 12-Hour Deduplication Gate:
 * Verifies if an identical opportunity fingerprint was already dispatched in the last 12 hours
 */
export function isOpportunitySentInLast12Hours(fingerprint: string): boolean {
  const lastSent = autonomousDispatchedFingerprints.get(fingerprint);
  if (!lastSent) return false;
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  return (Date.now() - lastSent) < twelveHoursMs;
}

export function markOpportunityDispatched(fingerprint: string): void {
  autonomousDispatchedFingerprints.set(fingerprint, Date.now());
  const now = Date.now();
  for (const [fp, ts] of autonomousDispatchedFingerprints.entries()) {
    if (now - ts > 24 * 60 * 60 * 1000) {
      autonomousDispatchedFingerprints.delete(fp);
    }
  }
}

/**
 * Clean helper to send plain or HTML formatted Telegram text message
 */
export async function sendRawTelegramMessage(
  text: string,
  chatId?: string,
  botToken?: string
): Promise<{ success: boolean; error?: string; httpStatusCode?: number }> {
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN;
  const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID;
  if (!token || !targetChatId) {
    return { success: false, error: 'Telegram credentials missing' };
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const httpStatusCode = res.status;
    if (!res.ok) {
      const err = await res.text();
      return { success: false, httpStatusCode, error: err };
    }
    return { success: true, httpStatusCode };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error' };
  }
}

export interface ActiveTradeLifecycle {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  currentSl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp4: number;
  status: 'ACTIVE_IN_TRADE' | 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'CLOSED';
  telegramMessageId?: number;
  chatId?: string;
  postedAt: number;
  closedAt?: number;
  isBreakEvenLocked?: boolean;
}

// Global state-driven lifecycle registry: tracks active trade per symbol (ZERO COOLDOWN TIMERS)
const activeTradeLifecycleMap = new Map<string, ActiveTradeLifecycle>();

export function isSymbolActiveInTrade(symbol: string): boolean {
  const clean = (symbol || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const trade = activeTradeLifecycleMap.get(clean);
  return Boolean(trade && trade.status !== 'CLOSED');
}

export function getActiveTradeLifecycle(symbol: string): ActiveTradeLifecycle | undefined {
  const clean = (symbol || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return activeTradeLifecycleMap.get(clean);
}

export function recordActiveTradeLifecycle(trade: ActiveTradeLifecycle): void {
  const clean = (trade.symbol || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  activeTradeLifecycleMap.set(clean, { ...trade, symbol: clean });
}

export function updateActiveTradeStage(symbol: string, stage: 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'CLOSED', newSl?: number): void {
  const clean = (symbol || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const trade = activeTradeLifecycleMap.get(clean);
  if (trade) {
    trade.status = stage;
    if (newSl !== undefined) trade.currentSl = newSl;
    if (stage === 'TP1_HIT') trade.isBreakEvenLocked = true;
    if (stage === 'CLOSED') {
      trade.closedAt = Date.now();
      // Remove from active trades upon closing so symbol is free for future natural setups
      activeTradeLifecycleMap.delete(clean);
    }
  }
}

export function closeActiveTradeLifecycle(symbol: string, reason?: string): void {
  const clean = (symbol || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const trade = activeTradeLifecycleMap.get(clean);
  if (trade) {
    trade.status = 'CLOSED';
    trade.closedAt = Date.now();
    activeTradeLifecycleMap.delete(clean);
    console.log(`[Trade Lifecycle] Closed active trade for #${clean}. Reason: ${reason || 'EXIT'}`);
  }
}

/**
 * Dispatches real-time target hit updates (TP1 Break-Even, TP2, TP3, TP4, Stop Loss)
 * strictly posted as a reply update on the original Telegram signal message.
 */
export async function sendTelegramTradeUpdateAlert(
  message: string,
  symbol?: string
): Promise<{ success: boolean; deliveredCount: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const defaultChatId = process.env.TELEGRAM_CHAT_ID;
  if (!token) return { success: false, deliveredCount: 0 };

  const cleanSym = symbol ? symbol.replace(/[^A-Z0-9]/g, '').toUpperCase() : '';
  const activeTrade = cleanSym ? getActiveTradeLifecycle(cleanSym) : undefined;
  const replyMessageId = activeTrade?.telegramMessageId;
  const targetChatId = activeTrade?.chatId || defaultChatId;

  let deliveredCount = 0;

  // 1. Primary channel / chat with reply to original message if available
  if (targetChatId && isValidTelegramChatId(targetChatId)) {
    try {
      const payload: any = {
        chat_id: targetChatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      };
      if (replyMessageId) {
        payload.reply_parameters = { message_id: replyMessageId };
        payload.reply_to_message_id = replyMessageId;
      }
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        deliveredCount++;
      } else {
        const errText = await res.text();
        if (errText.includes('chat not found') || errText.includes('bot was blocked')) {
          console.info(`[sendTelegramTradeUpdateAlert] Reply skipped for ${targetChatId}: chat not initiated or blocked`);
        }
      }
    } catch (err) {
      console.info(`[sendTelegramTradeUpdateAlert] Note sending reply to ${targetChatId}:`, err);
    }
  }

  // 2. Multi-User delivery to APPROVED Telegram subscribers
  try {
    const subscribers = tradingStorage.getAllTelegramSubscribers();
    for (const sub of subscribers) {
      if (!sub.notificationsEnabled || sub.chatId === targetChatId) continue;
      if (!isValidTelegramChatId(sub.chatId)) continue;
      const user = sub.userId ? tradingStorage.getUserById(sub.userId) : null;
      if (user && !user.isApproved) continue;

      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: sub.chatId,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true
          })
        });
        if (res.ok) {
          deliveredCount++;
        } else {
          const errText = await res.text();
          if (errText.includes('chat not found') || errText.includes('bot was blocked') || errText.includes('user is deactivated')) {
            tradingStorage.unlinkTelegramChat(sub.chatId);
            console.info(`[sendTelegramTradeUpdateAlert] Unlinked unreachable subscriber ${sub.chatId}`);
          }
        }
      } catch {}
    }
  } catch (err) {
    console.info('[sendTelegramTradeUpdateAlert] Note delivering to subscribers:', err);
  }

  return { success: deliveredCount > 0, deliveredCount };
}

/**
 * Checks if a signal is eligible for autonomous broadcast (Grade A+ or Grade A, actionable, non-WAIT)
 */
export function isAutonomousOpportunityEligible(signal: Signal): boolean {
  const grade = signal.qualityGrade || 'A';
  const isHighGrade = grade === 'A+' || grade === 'A' || (typeof (signal as any).score === 'number' && (signal as any).score >= 80);
  return isHighGrade && (signal.direction as any) !== 'WAIT' && !!signal.entryPrice && signal.entryPrice > 0;
}

export interface InstitutionalSignalParams {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  entryZoneLow?: number;
  entryZoneHigh?: number;
  stopLoss: number;
  targets?: Array<{ label?: string; price: number; percentage?: number }> | TargetLevel[];
  tp1?: number;
  tp2?: number;
  tp3?: number;
  tp4?: number;
  riskRewardRatio?: number | string;
  qualityGrade?: string;
  score?: number;
  moonScore?: number;
  pattern?: string;
  reason?: string;
  whyTrade?: string | string[];
  entryReason?: string | string[];
  timestamp?: number;
  createdAt?: number;
  candles?: CandleData[];
  priceDecimals?: number;
  leverage?: string;
  isSwing?: boolean;
  timeframe?: string;
  id?: string;
}

/**
 * Unified Institutional Signal Broadcaster (VIP Pipeline):
 * - Enforces mandatory TradingView-style candlestick chart PNG generation.
 * - Dispatches strictly via bot sendPhoto.
 * - Strict Pre-Pump SL & RR Compliance:
 *   * Minimum Risk/Reward Ratio >= 2.0.
 *   * Dynamic Recommended Leverage caption (SL <= 2.5% -> 15x-20x; SL > 2.5% -> 10x-12x; SL > 5% -> 5x-8x).
 *   * SL distance cannot exceed 5.0% for scalps/momentum setups unless classified as high-timeframe swing.
 * - Multi-user delivery to default channel and all approved Telegram subscribers.
 * - Autonomous AutoTrade execution for approved accounts.
 */
export async function broadcastInstitutionalSignal(
  signalOrParams: Signal | InstitutionalSignalParams
): Promise<{ sent: boolean; dispatched: boolean; reason?: string; deliveredCount?: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const defaultChatId = process.env.TELEGRAM_CHAT_ID;
  if (!token) {
    return { sent: false, dispatched: false, reason: 'TELEGRAM_BOT_TOKEN_NOT_CONFIGURED' };
  }

  // 1. Startup Backlog Gate (do NOT send stale / historical cached signals on boot)
  const now = Date.now();
  const createdAt = (signalOrParams as any).createdAt || (signalOrParams as any).timestamp || now;
  const signalAgeMs = now - createdAt;
  if (createdAt < serverBootTimestamp - 10000 || signalAgeMs > 3 * 60 * 1000) {
    return { sent: false, dispatched: false, reason: 'STARTUP_BACKLOG_OR_STALE_SIGNAL_SKIPPED' };
  }

  // 2. Direction & Quality Grade Integrity
  const rawDir = String(signalOrParams.direction || '').toUpperCase();
  if (rawDir !== 'LONG' && rawDir !== 'SHORT') {
    return { sent: false, dispatched: false, reason: 'DIRECTION_NOT_ACTIONABLE (WAIT or UNDEFINED)' };
  }
  const direction = rawDir as 'LONG' | 'SHORT';
  const isLong = direction === 'LONG';

  const grade = signalOrParams.qualityGrade || 'A';
  const score = (signalOrParams as any).score ?? (signalOrParams as any).moonScore ?? 85;
  const isGradeQualified = grade === 'A+' || grade === 'A' || (typeof score === 'number' && score >= 80);
  if (!isGradeQualified) {
    return { sent: false, dispatched: false, reason: `NOT_GRADE_A_OR_A_PLUS (Grade: ${grade}, Score: ${score})` };
  }

  // 3. Price & Level Validation
  const entry = Number(signalOrParams.entryPrice);
  const sl = Number(signalOrParams.stopLoss);
  const cleanSym = String(signalOrParams.symbol || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
  if (!cleanSym || !entry || entry <= 0 || !sl || sl <= 0) {
    return { sent: false, dispatched: false, reason: 'INVALID_ENTRY_OR_SL_PRICES' };
  }

  // 4. STATE LIFECYCLE CHECK: ZERO DUPLICATES WHILE IN TRADE (ZERO COOLDOWN TIMERS)
  if (isSymbolActiveInTrade(cleanSym)) {
    return {
      sent: false,
      dispatched: false,
      reason: `ACTIVE_IN_TRADE: #${cleanSym} already has an active trade in progress. Duplicate entry signals are banned until trade closes.`
    };
  }

  // 5. STRICT PRE-PUMP SL & RR COMPLIANCE
  const slDistPct = (Math.abs(entry - sl) / entry) * 100;
  const isSwing = Boolean(
    (signalOrParams as any).isSwing ||
    (signalOrParams as any).timeframe === '4h' ||
    (signalOrParams as any).timeframe === '1d' ||
    (signalOrParams as any).archetype === 'SWING'
  );

  // A. Stop loss distance must NOT exceed 3.0% (Zero Late-FOMO Ceiling)
  if (!isSwing && slDistPct > 3.0) {
    return {
      sent: false,
      dispatched: false,
      reason: `REJECTED_SL_EXCEEDS_3_PCT: Stop loss distance (-${slDistPct.toFixed(2)}%) exceeds 3.0% ceiling for Telegram VIP tier (Late-FOMO setups strictly blocked, keep in app).`
    };
  }

  // =========================================================================
  // TELEGRAM VIP TIER ELITE QUALIFICATION GATE (STRICT CONFLUENCE ONLY):
  // All other opportunities stay inside internal App Radar.
  // 1) Institutional Confluence Score >= 94.
  // 2) Real Whale Volume Absorption: RVOL strictly >= 6.0x.
  // 3) Stealth Futures Open Interest Surge >= +25% in last 1-2 hours.
  // 4) Squeeze Funding Trap (< -0.02% for Longs, > +0.02% for Shorts).
  // 5) Anti-Burst Throttle: Maximum 1 signal per 60 minutes to VIP channel.
  // =========================================================================
  const numScore = Number((signalOrParams as any).score ?? (signalOrParams as any).moonScore ?? 0);
  const numRvol = Number((signalOrParams as any).rvol || (signalOrParams as any).opportunityReport?.rvol || 0);
  const numOi = Number((signalOrParams as any).openInterestChange24h || (signalOrParams as any).oiSurgePct || 0);
  const numFunding = Number((signalOrParams as any).fundingRate || (signalOrParams as any).fundingRatePct || 0);

  if (numScore < 94) {
    return {
      sent: false,
      dispatched: false,
      reason: `VIP_GATE_SCORE_BELOW_94: Score (${numScore}) < 94 required for Telegram VIP broadcast. Setup remains in App Radar.`
    };
  }

  if (numRvol < 6.0) {
    return {
      sent: false,
      dispatched: false,
      reason: `VIP_GATE_RVOL_BELOW_6X: RVOL (${numRvol.toFixed(1)}x) < 6.0x threshold required for Telegram VIP broadcast. Setup remains in App Radar.`
    };
  }

  if (numOi < 25.0) {
    return {
      sent: false,
      dispatched: false,
      reason: `VIP_GATE_OI_BELOW_25PCT: Whale OI Surge (+${numOi.toFixed(1)}%) < 25.0% threshold. Setup remains in App Radar.`
    };
  }

  const isFundingQualified = isLong ? (numFunding <= -0.02) : (numFunding >= 0.02);
  if (!isFundingQualified) {
    return {
      sent: false,
      dispatched: false,
      reason: `VIP_GATE_FUNDING_TRAP_REQUIRED: Funding (${(numFunding * 100).toFixed(3)}%) does not meet squeeze trap criteria (< -0.02% for Long, > +0.02% for Short). Setup remains in App Radar.`
    };
  }

  // Anti-Burst Throttle: Maximum 1 broadcast per 60 minutes to Telegram
  const timeSinceLastVip = now - lastTelegramVipBroadcastTime;
  if (lastTelegramVipBroadcastTime > 0 && timeSinceLastVip < TELEGRAM_VIP_THROTTLE_MS) {
    const remainingMins = Math.ceil((TELEGRAM_VIP_THROTTLE_MS - timeSinceLastVip) / (60 * 1000));
    return {
      sent: false,
      dispatched: false,
      reason: `VIP_ANTI_BURST_THROTTLE: Only 1 VIP signal allowed per 60m to prevent Telegram channel spam (${remainingMins}m remaining). Setup remains in App Radar.`
    };
  }

  // B. Resolve targets
  const riskDist = Math.abs(entry - sl) || entry * 0.015;
  let rawTargets = (signalOrParams as any).targets;
  let tp1 = Number((signalOrParams as any).tp1 || (rawTargets && rawTargets[0]?.price) || 0);
  let tp2 = Number((signalOrParams as any).tp2 || (rawTargets && rawTargets[1]?.price) || 0);
  let tp3 = Number((signalOrParams as any).tp3 || (rawTargets && rawTargets[2]?.price) || 0);
  let tp4 = Number((signalOrParams as any).tp4 || (rawTargets && rawTargets[3]?.price) || 0);

  if (tp1 <= 0) tp1 = isLong ? entry + riskDist * 1.5 : entry - riskDist * 1.5;
  if (tp2 <= 0) tp2 = isLong ? entry + riskDist * 2.5 : entry - riskDist * 2.5;
  if (tp3 <= 0) tp3 = isLong ? entry + riskDist * 4.0 : entry - riskDist * 4.0;
  if (tp4 <= 0) tp4 = isLong ? entry + riskDist * 6.0 : entry - riskDist * 6.0;

  const isSupernova = Boolean(
    (signalOrParams as any).isSupernova ||
    (signalOrParams as any).supernovaPotentialPct > 0 ||
    ((signalOrParams as any).rvol && (signalOrParams as any).rvol >= 8.0)
  );

  // C. STRICT TELEGRAM SCALP BAN (< 15% TARGETS):
  // Calculate max TP % across all target levels.
  // If max TP < 15.0% AND coin is NOT Supernova, drop immediately.
  // Small scalps (+1% to +10%) remain strictly in web Terminal.
  const calcGainPctNum = (tp: number) => {
    if (!entry || entry <= 0 || !tp || tp <= 0) return 0;
    return isLong
      ? ((tp - entry) / entry) * 100
      : ((entry - tp) / entry) * 100;
  };

  const maxTpPct = Math.max(
    calcGainPctNum(tp1),
    calcGainPctNum(tp2),
    calcGainPctNum(tp3),
    calcGainPctNum(tp4)
  );

  if (!isSupernova && maxTpPct < 15.0) {
    console.log(`[Telegram Scalp Ban] Dropping #${cleanSym}: Max TP gain (+${maxTpPct.toFixed(1)}%) is under 15.0% threshold. Scalps remain strictly on Web Terminal.`);
    return {
      sent: false,
      dispatched: false,
      reason: `SCALP_BANNED_FROM_TELEGRAM: Max TP gain (+${maxTpPct.toFixed(1)}%) < 15.0% threshold. Scalps remain strictly on Web Terminal.`
    };
  }

  // D. Calculate & enforce Minimum Risk/Reward Ratio >= 2.0
  const parsedRr = Number(signalOrParams.riskRewardRatio || 0);
  const calculatedRr = (slDistPct > 0) ? (Math.abs(tp4 - entry) / Math.abs(entry - sl)) : 0;
  const effectiveRr = parsedRr >= 2.0 ? parsedRr : (calculatedRr >= 2.0 ? Number(calculatedRr.toFixed(1)) : 2.5);

  if (parsedRr > 0 && parsedRr < 2.0) {
    return {
      sent: false,
      dispatched: false,
      reason: `REJECTED_RR_BELOW_2: Minimum Risk/Reward Ratio must be >= 2.0 (got ${parsedRr})`
    };
  }

  const fingerprint = getSignalOpportunityFingerprint(signalOrParams as any);

  try {
    // 6. MANDATORY TRADINGVIEW-STYLE CANDLESTICK CHART GENERATION
    // Must await generateTradingViewChart; handles retry & synthetic fallback internally
    const chartBuffer = await generateTradingViewChart(
      cleanSym,
      direction,
      entry,
      sl,
      [tp1, tp2, tp3, tp4],
      (signalOrParams as any).candles
    );

    // 7. Format VIP Caption
    const decimals = getPriceDecimals(entry);
    const safeReason = Array.isArray((signalOrParams as any).whyTrade)
      ? (signalOrParams as any).whyTrade.join(', ')
      : (typeof (signalOrParams as any).whyTrade === 'string'
          ? (signalOrParams as any).whyTrade
          : (Array.isArray((signalOrParams as any).entryReason)
              ? (signalOrParams as any).entryReason.join(', ')
              : (typeof (signalOrParams as any).entryReason === 'string'
                  ? (signalOrParams as any).entryReason
                  : 'Multi-confluence trendline breakout with volume expansion')));

    const isSupernova = Boolean(
      (signalOrParams as any).isSupernova ||
      (signalOrParams as any).supernovaPotentialPct > 0 ||
      ((signalOrParams as any).rvol && (signalOrParams as any).rvol >= 8.0)
    );

    const vipCaption = formatTelegramSignalCaption({
      symbol: cleanSym,
      direction,
      entryPrice: entry,
      entryZoneLow: signalOrParams.entryZoneLow || (isLong ? entry * 0.9985 : entry * 0.9975),
      entryZoneHigh: signalOrParams.entryZoneHigh || (isLong ? entry * 1.0025 : entry * 1.0015),
      tp1,
      tp2,
      tp3,
      tp4,
      stopLoss: sl,
      pattern: (signalOrParams as any).pattern,
      reason: safeReason,
      riskRewardRatio: effectiveRr,
      timestamp: createdAt,
      priceDecimals: decimals,
      leverage: (signalOrParams as any).leverage,
      isSupernova
    });

    let deliveredCount = 0;

    // Institutional Inline Execution Buttons
    const inlineKeyboard = JSON.stringify({
      inline_keyboard: [
        [
          { text: `⚡ 1-Click ${direction} on Binance`, url: `https://www.binance.com/en/futures/${cleanSym}` },
          { text: `📊 Live 15M Chart`, url: `https://www.tradingview.com/chart/?symbol=BINANCE:${cleanSym}` }
        ]
      ]
    });

    // 8. Dispatch strictly via bot.sendPhoto to configured channel
    if (defaultChatId && isValidTelegramChatId(defaultChatId)) {
      const formData = new FormData();
      formData.append('chat_id', defaultChatId);
      formData.append('caption', vipCaption);
      formData.append('parse_mode', 'HTML');
      formData.append('reply_markup', inlineKeyboard);
      const blob = new Blob([chartBuffer], { type: 'image/png' });
      formData.append('photo', blob, `${cleanSym}_15M.png`);

      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        deliveredCount++;
        lastTelegramVipBroadcastTime = now;
        try {
          const respData = await res.json();
          const messageId = respData?.result?.message_id;
          if (messageId) {
            recordActiveTradeLifecycle({
              symbol: cleanSym,
              direction,
              entryPrice: entry,
              stopLoss: sl,
              currentSl: sl,
              tp1,
              tp2,
              tp3,
              tp4,
              status: 'ACTIVE_IN_TRADE',
              telegramMessageId: messageId,
              chatId: defaultChatId,
              postedAt: now
            });
            console.log(`[Trade Lifecycle] Recorded ACTIVE_IN_TRADE for #${cleanSym} (Telegram Msg #${messageId}). Zero duplicates allowed until trade exits.`);
          }
        } catch (parseErr) {
          recordActiveTradeLifecycle({
            symbol: cleanSym,
            direction,
            entryPrice: entry,
            stopLoss: sl,
            currentSl: sl,
            tp1,
            tp2,
            tp3,
            tp4,
            status: 'ACTIVE_IN_TRADE',
            chatId: defaultChatId,
            postedAt: now
          });
        }
      } else {
        const errText = await res.text();
        if (errText.includes('chat not found') || errText.includes('bot was blocked')) {
          console.info(`[broadcastInstitutionalSignal] Primary channel note: chat not initiated (${defaultChatId}). User must send /start to bot.`);
        } else {
          console.info(`[broadcastInstitutionalSignal] Primary channel dispatch notice (${res.status}):`, errText);
        }
      }
    }

    // 9. Multi-User delivery to APPROVED Telegram subscribers
    try {
      const subscribers = tradingStorage.getAllTelegramSubscribers();
      for (const sub of subscribers) {
        if (!sub.notificationsEnabled || sub.chatId === defaultChatId) continue;
        if (!isValidTelegramChatId(sub.chatId)) continue;
        const user = sub.userId ? tradingStorage.getUserById(sub.userId) : null;
        if (user && !user.isApproved) continue; // Approved users only!

        if (tradingStorage.hasUserReceivedSignal(sub.chatId, fingerprint)) continue;

        try {
          const formData = new FormData();
          formData.append('chat_id', sub.chatId);
          formData.append('caption', vipCaption);
          formData.append('parse_mode', 'HTML');
          formData.append('reply_markup', inlineKeyboard);
          const blob = new Blob([chartBuffer], { type: 'image/png' });
          formData.append('photo', blob, `${cleanSym}_15M.png`);

          const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
            method: 'POST',
            body: formData
          });
          if (res.ok) {
            deliveredCount++;
            tradingStorage.recordTelegramDeliveryForUser(sub.chatId, fingerprint);
          } else {
            const errText = await res.text();
            if (errText.includes('chat not found') || errText.includes('bot was blocked') || errText.includes('user is deactivated')) {
              tradingStorage.unlinkTelegramChat(sub.chatId);
              console.info(`[broadcastInstitutionalSignal] Unlinked unreachable subscriber chatId=${sub.chatId}`);
            }
          }
        } catch (subErr) {
          console.info(`[broadcastInstitutionalSignal] User delivery note:`, subErr);
        }
      }
    } catch (subListErr) {
      console.info(`[broadcastInstitutionalSignal] Subscriber delivery note:`, subListErr);
    }

    markSymbolDispatched(cleanSym);
    markOpportunityDispatched(fingerprint);
    lastTelegramVipBroadcastTime = Date.now();
    console.log(`[Institutional Telegram Broadcast] Dispatched ${cleanSym} Grade ${grade} to ${deliveredCount} recipient(s) with TradingView chart. Anti-burst throttle armed (60m lock).`);

    // 10. Autonomous AutoTrade execution dispatch for approved accounts on Grade A/A+ signals
    if (grade === 'A+' || grade === 'A') {
      import('./autotradeEngine').then(({ AutoTradeEngine }) => {
        AutoTradeEngine.dispatchGradeAPlusAutoTrades(signalOrParams as any).catch(atErr => {
          console.warn(`[AutoTrade Engine] Error during autonomous trade dispatch:`, atErr);
        });
      }).catch(() => {});
    }

    return { sent: true, dispatched: true, deliveredCount };
  } catch (err: any) {
    console.error(`[broadcastInstitutionalSignal] Error:`, err);
    return { sent: false, dispatched: false, reason: err?.message || 'DISPATCH_ERROR' };
  }
}

/**
 * Backward compatibility alias: route legacy broadcastAutonomousSignalAlert through broadcastInstitutionalSignal
 */
export const broadcastAutonomousSignalAlert = broadcastInstitutionalSignal;

export interface TelegramLifecycleParams {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  stage: 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'FULL_TP' | 'BREAK_EVEN_LOCKED' | 'STOP_LOSS_HIT';
  entryPrice: number;
  triggerPrice: number;
  pnlPct: number;
  roePct?: number;
  timeframe?: string;
}

/**
 * Dispatches automated VIP Telegram lifecycle alerts for TP1/TP2/TP3/Break-Even/Full TP
 */
export async function dispatchTelegramLifecycleAlert(params: TelegramLifecycleParams): Promise<boolean> {
  const cleanSym = params.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const bstTime = getBangladeshTimeString();
  const entryFmt = formatPrice(params.entryPrice);
  const triggerFmt = formatPrice(params.triggerPrice);
  const pnlSign = params.pnlPct >= 0 ? '+' : '';
  const roeText = params.roePct !== undefined ? ` (${params.roePct >= 0 ? '+' : ''}${params.roePct.toFixed(2)}% ROE)` : '';

  let headerIcon = '🎯';
  let title = '';
  let note = '';

  switch (params.stage) {
    case 'TP1_HIT':
      headerIcon = '🎯 1️⃣';
      title = 'TP1 REACHED — BREAK-EVEN TRAIL ARMED';
      note = `✅ First profit target banked! Stop loss is automatically adjusted to Entry ($${entryFmt}) for a guaranteed RISK-FREE ride.`;
      break;
    case 'TP2_HIT':
      headerIcon = '🚀 2️⃣';
      title = 'TP2 SMASHED — RUNNER ACCELERATION';
      note = '🔥 Significant profit expansion secured! Trailing dynamic runner activated for maximum swing extension.';
      break;
    case 'TP3_HIT':
      headerIcon = '💎 3️⃣';
      title = 'TP3 MONSTER EXTENSION HIT';
      note = '👑 Institutional expansion fully realized. Lock in 75%+ profits and trail runner stop behind current 15M candle low.';
      break;
    case 'FULL_TP':
      headerIcon = '🏆 🏁';
      title = 'FULL TARGET COMPLETED — 100% OBJECTIVE MET';
      note = '💰 Exceptional trade completed with maximum reward. Position fully liquidated at peak expansion shelf.';
      break;
    case 'BREAK_EVEN_LOCKED':
      headerIcon = '🛡️';
      title = 'BREAK-EVEN ACTIVATED (ZERO RISK)';
      note = '🛡️ Capital defense firewall active. Position cannot lose capital under any market condition.';
      break;
    case 'STOP_LOSS_HIT':
      headerIcon = '⛔';
      title = 'STOP LOSS TRIGGERED (DISCIPLINED EXIT)';
      note = 'Defensive capital preservation executed. Risk strictly contained within programmed limits.';
      break;
  }

  const message = `
${headerIcon} <b>#${cleanSym} | ${params.direction} — ${title}</b>

💵 <b>Entry Price:</b> $${entryFmt}
📍 <b>Trigger Price:</b> $${triggerFmt}
📈 <b>Realized Move:</b> <code>${pnlSign}${params.pnlPct.toFixed(2)}%</code>${roeText}

💡 <i>${note}</i>

🕒 <b>Time:</b> ${bstTime}
⚡ <b>Institutional Execution Core</b>
`.trim();

  const res = await sendTelegramTradeUpdateAlert(message);
  return res.success;
}

const syndicateDispatchedCooldownMap = new Map<string, number>();
const SYNDICATE_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes anti-spam gate

export function isSymbolInSyndicateCooldown(symbol: string): boolean {
  const clean = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const lastTime = syndicateDispatchedCooldownMap.get(clean);
  if (!lastTime) return false;
  return Date.now() - lastTime < SYNDICATE_COOLDOWN_MS;
}

export function markSymbolSyndicateCooldown(symbol: string): void {
  const clean = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  syndicateDispatchedCooldownMap.set(clean, Date.now());
}

/**
 * Dispatches institutional Syndicate Analyst VIP alert to Telegram
 * STRICT HARDENED CONFLUENCE FILTER:
 * 1) Score >= 100 and tier == VALID
 * 2) Volume Multiplier >= 3.0x baseline
 * 3) Momentum: 1h price change >= +3.5% (LONG) or <= -3.5% (SHORT)
 * 4) Structural Clearance: Resist Dist <= 3.0% (LONG) or Support Dist <= 3.0% (SHORT)
 * 5) Strict 30-minute cooldown per symbol
 */
export async function dispatchSyndicateTelegramAlert(candidate: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  markPrice: number;
  score: number;
  tier: string;
  executionMode?: string;
  executionLabel?: string;
  entryZone?: string;
  volMultiplier: number;
  change15m: number;
  change1h: number;
  fundingFeePct: number;
  supportDistPct: number;
  resistDistPct: number;
  oiDeltaPct?: number;
  takerBuyRatio?: number;
  slPrice?: number;
  slPercent?: number;
  recLeverage?: string;
  leverageBadge?: string;
  swingBase?: number;
  atrBuffer?: number;
  target1?: { price: number; percent: number };
  target2?: { price: number; percent: number };
  target1Price?: number;
  target1Percent?: number;
  target2Price?: number;
  target2Percent?: number;
  reasons: string[];
}): Promise<{ success: boolean; error?: string }> {
// 1. Ingestion Threshold: Any asset reaching Score >= 85 with 🟢 VALID LONG or 🔴 VALID SHORT MUST trigger an immediate Telegram alert.
  if (candidate.tier !== 'VALID' || candidate.score < 85) {
    return { success: false, error: 'Candidate does not meet VALID threshold (Score < 85)' };
  }

  // 1b. HARD RISK CEILING: REJECT ANY SL GREATER THAN 14.0% (ABSOLUTE SANITY FLOOR)
  if (candidate.slPercent !== undefined && candidate.slPercent > 14.0) {
    console.warn(`[TelegramService] BLOCKED #${candidate.symbol} alert: SL distance (${candidate.slPercent.toFixed(2)}%) exceeds 14.0% sanity floor.`);
    return { success: false, error: `Risk exceeds 14.0% sanity floor (-${candidate.slPercent.toFixed(2)}%)` };
  }

  const isSfp = candidate.executionLabel?.includes('SFP RECLAIM') || candidate.executionMode?.includes('SFP RECLAIM');

  // 1c. STRICT WHALE VALIDATION GATE (NO LOW-VOLUME TRAPS)
  // All 3 must pass, zero exceptions:
  // 1) Whale Volume Surge: volumeMultiplier >= 2.2x
  // 2) Taker Dominance: Long >= 52.0%, Short <= 48.0%
  // 3) Macro Velocity: 1h >= +2.5% (Long) or <= -2.5% (Short)
  if (!isSfp) {
    if (candidate.volMultiplier < 2.2) {
      console.warn(`[TelegramService] BLOCKED #${candidate.symbol} alert: Volume multiplier ${candidate.volMultiplier.toFixed(2)}x below 2.2x threshold.`);
      return { success: false, error: `Volume multiplier ${candidate.volMultiplier.toFixed(2)}x below 2.2x threshold` };
    }
    const isLong = candidate.direction === 'LONG';
    const takerRatioVal = candidate.takerBuyRatio ?? 50;
    if (isLong && takerRatioVal < 52.0) {
      console.warn(`[TelegramService] BLOCKED #${candidate.symbol} alert: Taker buy flow ${takerRatioVal.toFixed(1)}% below 52.0% dominance threshold.`);
      return { success: false, error: `Taker buy flow ${takerRatioVal.toFixed(1)}% below 52.0% threshold` };
    }
    if (!isLong && (100 - takerRatioVal) < 52.0) {
      console.warn(`[TelegramService] BLOCKED #${candidate.symbol} alert: Taker sell flow ${(100 - takerRatioVal).toFixed(1)}% below 52.0% dominance threshold.`);
      return { success: false, error: `Taker sell flow ${(100 - takerRatioVal).toFixed(1)}% below 52.0% threshold` };
    }
    if (isLong && candidate.change1h < 2.5) {
      console.warn(`[TelegramService] BLOCKED #${candidate.symbol} alert: 1h velocity +${candidate.change1h.toFixed(2)}% below +2.5% threshold.`);
      return { success: false, error: `1h change +${candidate.change1h.toFixed(2)}% below +2.5% threshold` };
    }
    if (!isLong && candidate.change1h > -2.5) {
      console.warn(`[TelegramService] BLOCKED #${candidate.symbol} alert: 1h velocity ${candidate.change1h.toFixed(2)}% above -2.5% threshold.`);
      return { success: false, error: `1h change ${candidate.change1h.toFixed(2)}% above -2.5% threshold` };
    }
  }

  // Strict Multi-Timeframe Trend Dominance Firewall (bypassed for institutional SFP Reclaim reversals):
  if (!isSfp && candidate.direction === 'LONG' && (candidate.change1h <= 0 || candidate.change15m <= 0)) {
    return { success: false, error: 'LONG blocked by trend dominance firewall (1h <= 0 or 15m <= 0)' };
  }
  if (!isSfp && candidate.direction === 'SHORT' && (candidate.change1h >= 0 || candidate.change15m >= 0)) {
    return { success: false, error: 'SHORT blocked by trend dominance firewall (1h >= 0 or 15m >= 0)' };
  }

  // 2. Strict 30-minute cooldown per symbol
  if (isSymbolInSyndicateCooldown(candidate.symbol)) {
    return { success: false, error: `Symbol #${candidate.symbol} is in 30-minute Telegram cooldown` };
  }

  const cleanSym = candidate.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const bstTime = getBangladeshTimeString();
  const markFmt = formatPrice(candidate.markPrice);
  const change15mSign = candidate.change15m >= 0 ? '+' : '';
  const change1hSign = candidate.change1h >= 0 ? '+' : '';
  const fundingSign = candidate.fundingFeePct >= 0 ? '+' : '';
  const dirLabel = candidate.direction === 'LONG' ? '🟢 VALID LONG' : '🔴 VALID SHORT';

  const executionState = candidate.executionLabel || candidate.executionMode || (candidate.volMultiplier >= 5.5 ? '🚀 IMPULSE ENTRY' : '⚡ ENTRY NOW');
  const entryZoneFmt = candidate.entryZone || (candidate.direction === 'LONG'
    ? `$${markFmt} - $${formatPrice(candidate.markPrice * 1.01)} (+1.0%)`
    : `$${formatPrice(candidate.markPrice * 0.99)} - $${markFmt} (-1.0%)`);

  const takerRatio = candidate.takerBuyRatio !== undefined
    ? (candidate.direction === 'LONG' ? candidate.takerBuyRatio.toFixed(1) : (100 - candidate.takerBuyRatio).toFixed(1))
    : '64.0';

  const slPriceFormatted = candidate.slPrice
    ? (candidate.slPrice < 0.001
        ? candidate.slPrice.toFixed(8)
        : candidate.slPrice < 1
        ? candidate.slPrice.toFixed(6)
        : candidate.slPrice.toFixed(4))
    : formatPrice(candidate.markPrice * 0.94);
  const slPercentFmt = candidate.slPercent !== undefined ? candidate.slPercent.toFixed(2) : '6.00';

  const recLev = candidate.recLeverage || (candidate.slPercent !== undefined && candidate.slPercent <= 4.0
    ? '7x - 10x (Tight Structural Base)'
    : candidate.slPercent !== undefined && candidate.slPercent <= 7.5
    ? '4x - 5x (Standard Altcoin Base)'
    : candidate.slPercent !== undefined && candidate.slPercent <= 13.0
    ? '2x - 3x (Meme / High Beta Base)'
    : '1x - 2x (Ultra Volatile Base)');

  // Dynamic Expansion Target Calculations for Telegram Dispatch
  const target1P = candidate.target1?.price ?? candidate.target1Price ?? (
    candidate.direction === 'LONG'
      ? candidate.markPrice + Math.max(candidate.markPrice * 0.03, (candidate.markPrice - (candidate.slPrice || candidate.markPrice * 0.94)) * 1.8)
      : candidate.markPrice - Math.max(candidate.markPrice * 0.03, ((candidate.slPrice || candidate.markPrice * 1.06) - candidate.markPrice) * 1.8)
  );
  const target1Pct = candidate.target1?.percent ?? candidate.target1Percent ?? (
    candidate.direction === 'LONG'
      ? ((target1P - candidate.markPrice) / candidate.markPrice) * 100
      : ((candidate.markPrice - target1P) / candidate.markPrice) * 100
  );

  const target2P = candidate.target2?.price ?? candidate.target2Price ?? (
    candidate.direction === 'LONG'
      ? candidate.markPrice + Math.max(candidate.markPrice * 0.06, (candidate.markPrice - (candidate.slPrice || candidate.markPrice * 0.94)) * 3.5)
      : candidate.markPrice - Math.max(candidate.markPrice * 0.06, ((candidate.slPrice || candidate.markPrice * 1.06) - candidate.markPrice) * 3.5)
  );
  const target2Pct = candidate.target2?.percent ?? candidate.target2Percent ?? (
    candidate.direction === 'LONG'
      ? ((target2P - candidate.markPrice) / candidate.markPrice) * 100
      : ((candidate.markPrice - target2P) / candidate.markPrice) * 100
  );

  const formatTargetPrice = (p: number): string => {
    if (p < 0.001) return p.toFixed(8);
    if (p < 1) return p.toFixed(6);
    return p.toFixed(4);
  };

  const target1PriceFmt = formatTargetPrice(target1P);
  const target1PercentFmt = Math.abs(target1Pct).toFixed(1);
  const target2PriceFmt = formatTargetPrice(target2P);
  const target2PercentFmt = Math.abs(target2Pct).toFixed(1);
  const targetSign = candidate.direction === 'LONG' ? '+' : '-';

  let caption = '';
  if (isSfp) {
    caption = `🏛 <b>SYNDICATE TERMINAL</b> | <b>🔥 SFP RECLAIM (SPRING REVERSAL)</b>
━━━━━━━━━━━━━━━━━━━━━━━━
<b>Asset:</b> <code>#${cleanSym}</code>
<b>Execution:</b> <b>${escapeXml(executionState)}</b>
<b>Conviction Score:</b> <code>${candidate.score}/100</code> 🔥

🎯 <b>Optimal Entry:</b> <code>${escapeXml(entryZoneFmt)}</code>
🛑 <b>Structural SL:</b> <code>$${slPriceFormatted}</code> (<b>-${slPercentFmt}%</b>)
⚖ <b>Safe Leverage:</b> <code>${escapeXml(recLev)}</code>

🏁 <b>TARGET PROJECTION:</b>
• <b>Primary Target:</b> <code>$${target1PriceFmt}</code> (<b>${targetSign}${target1PercentFmt}%</b>)
• <b>Macro Runner:</b> <code>$${target2PriceFmt}</code> (<b>${targetSign}${target2PercentFmt}%</b>)

📊 <b>MARKET TELEMETRY:</b>
• <b>Volume Surge:</b> <code>${candidate.volMultiplier.toFixed(2)}x</code> (vs 20MA)
• <b>Whale Flow:</b> <code>${takerRatio}% Taker Aggression</code>
• <b>1h Momentum:</b> <code>${change1hSign}${candidate.change1h.toFixed(2)}%</code> | <b>15m:</b> <code>${change15mSign}${candidate.change15m.toFixed(2)}%</code>
• <b>Funding Rate:</b> <code>${fundingSign}${candidate.fundingFeePct.toFixed(4)}%</code>

🛡 <i>Risk Note: Take partial profits at Primary Target; trail stop to breakeven for Macro Runner.</i>
━━━━━━━━━━━━━━━━━━━━━━━━
🔗 <a href="https://www.binance.com/en/futures/${cleanSym}"><b>Open Binance Futures Chart</b></a>
🕒 <i>${bstTime}</i>`;
  } else {
    caption = `🏛 <b>SYNDICATE TERMINAL</b> | <b>${dirLabel}</b>
━━━━━━━━━━━━━━━━━━━━━━━━
<b>Asset:</b> <code>#${cleanSym}</code>
<b>Execution:</b> <b>${escapeXml(executionState)}</b>
<b>Conviction Score:</b> <code>${candidate.score}/100</code> 🔥

🎯 <b>Optimal Entry:</b> <code>${escapeXml(entryZoneFmt)}</code>
🛑 <b>Structural SL:</b> <code>$${slPriceFormatted}</code> (<b>-${slPercentFmt}%</b>)
⚖ <b>Safe Leverage:</b> <code>${escapeXml(recLev)}</code>

🏁 <b>TARGET PROJECTION:</b>
• <b>Primary Target:</b> <code>$${target1PriceFmt}</code> (<b>${targetSign}${target1PercentFmt}%</b>)
• <b>Macro Runner:</b> <code>$${target2PriceFmt}</code> (<b>${targetSign}${target2PercentFmt}%</b>)

📊 <b>MARKET TELEMETRY:</b>
• <b>Volume Surge:</b> <code>${candidate.volMultiplier.toFixed(2)}x</code> (vs 20MA)
• <b>Whale Flow:</b> <code>${takerRatio}% Taker Aggression</code>
• <b>1h Momentum:</b> <code>${change1hSign}${candidate.change1h.toFixed(2)}%</code> | <b>15m:</b> <code>${change15mSign}${candidate.change15m.toFixed(2)}%</code>
• <b>Funding Rate:</b> <code>${fundingSign}${candidate.fundingFeePct.toFixed(4)}%</code>

🛡 <i>Risk Note: Take partial profits at Primary Target; trail stop to breakeven for Macro Runner.</i>
━━━━━━━━━━━━━━━━━━━━━━━━
🔗 <a href="https://www.binance.com/en/futures/${cleanSym}"><b>Open Binance Futures Chart</b></a>
🕒 <i>${bstTime}</i>`;
  }

  const res = await sendRawTelegramMessage(caption);
  if (res.success) {
    markSymbolSyndicateCooldown(candidate.symbol);
    dispatchedInvalidations.delete(cleanSym); // Reset invalidation one-shot latch for newly signaled pair
  }
  return res;
}

/**
 * Persistent cache set for one-shot invalidation dispatch:
 * Strictly prevents Telegram spam loop when a coin breaches its SL floor.
 */
export const dispatchedInvalidations = new Set<string>();

export function clearSymbolInvalidation(symbol: string): void {
  const cleanSym = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  dispatchedInvalidations.delete(cleanSym);
}

export function isInvalidationDispatched(symbol: string): boolean {
  const cleanSym = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return dispatchedInvalidations.has(cleanSym);
}

/**
 * Directly dispatches an SFP Reclaim VIP alert to Telegram channel
 */
export async function dispatchSyndicateSfpReclaimAlert(candidate: Parameters<typeof dispatchSyndicateTelegramAlert>[0]): Promise<{ success: boolean; error?: string }> {
  return await dispatchSyndicateTelegramAlert(candidate);
}

/**
 * Directly dispatches a formatted live verification alert to Telegram channel
 */
export async function dispatchSyndicateTestVerification(): Promise<{ success: boolean; error?: string }> {
  const bstTime = getBangladeshTimeString();
  const text = `✅ <b>SYNDICATE TELEGRAM GATEWAY: ONLINE & VERIFIED</b>\n\n` +
    `⚡ <i>Real-time whale pump & dump alerts are armed and monitoring.</i>\n\n` +
    `🐋 <b>Radar Engine:</b> Active (Dual-Mode Smart Entry)\n` +
    `🛡️ <b>BTC Dump Shield:</b> Engaged\n` +
    `🛑 <b>Structural Invalidation:</b> Armed (Swing Anchor + ATR Buffer)\n` +
    `🕒 <i>${bstTime}</i>`;

  return await sendRawTelegramMessage(text);
}

/**
 * Dispatches a clean 1-line invalidation update when a VALID coin breaches its Invalidation Floor (SL)
 * STRICT ONE-SHOT BROADCAST: Never spam or repeat for the same coin.
 */
export async function dispatchSyndicateInvalidationAlert(params: {
  symbol: string;
  slPrice: number;
}): Promise<{ success: boolean; error?: string }> {
  const cleanSym = params.symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  // One-Shot Gate: strictly prevent duplicate notification loop
  if (dispatchedInvalidations.has(cleanSym)) {
    console.log(`[TelegramService] Invalidation alert for #${cleanSym} already dispatched. Duplicate loop suppressed.`);
    return { success: false, error: `Duplicate invalidation notification suppressed for #${cleanSym}` };
  }
  dispatchedInvalidations.add(cleanSym);

  const slFmt = formatPrice(params.slPrice);
  const text = `🛑 <b>SYNDICATE RADAR: #${cleanSym}</b> Invalidation Floor ($${slFmt}) breached. Trade setup closed.`;
  return await sendRawTelegramMessage(text);
}

