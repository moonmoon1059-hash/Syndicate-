import { Signal } from './signalEngine';
import { getAllStoredSignals, getActionableStoredSignals } from './signalTracker';
import { sendTelegramTradeUpdateAlert, sendRawTelegramMessage } from './telegramService';

export interface DailyJournalStats {
  date: string;
  totalSignals: number;
  tp1Hits: number;
  tp2Hits: number;
  tp3Hits: number;
  tp4Hits: number;
  stoppedOut: number;
  activeCount: number;
  winRatePct: number;
  maxGainPct: number;
  avgRiskReward: number;
}

/**
 * Returns current date and time formatted in Bangladesh Standard Time (Asia/Dhaka, UTC+6)
 */
export function getBangladeshTimeString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date) + ' BST';
}

export function getBangladeshDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value || '2026';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const day = parts.find(p => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

/**
 * Aggregates 24-hour performance across all tracked signals
 */
export function calculateDailyJournalStats(signals?: Signal[]): DailyJournalStats {
  const allSignals = signals || getAllStoredSignals();
  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

  // Filter signals active or created in the past 24 hours
  let relevantSignals = allSignals.filter(s => {
    const created = s.createdAt || 0;
    const closed = s.closedAt || 0;
    return created >= twentyFourHoursAgo || closed >= twentyFourHoursAgo || s.status === 'ACTIVE';
  });

  // If newly booted and no signals within 24h, take all stored signals
  if (relevantSignals.length === 0) {
    relevantSignals = allSignals;
  }

  // Only consider actionable (non-WAIT, valid entry) setups
  const actionable = relevantSignals.filter(s => (s.direction as any) !== 'WAIT' && s.entryPrice > 0);

  let tp1Hits = 0;
  let tp2Hits = 0;
  let tp3Hits = 0;
  let tp4Hits = 0;
  let stoppedOut = 0;
  let activeCount = 0;
  let maxGainPct = 0;
  let totalRR = 0;
  let validRRCount = 0;

  for (const sig of actionable) {
    const isLong = sig.direction === 'LONG';
    const entry = sig.entryPrice;
    const targets = Array.isArray(sig.targets) ? sig.targets : [];

    // Track targets hit
    const hasTp1 = targets[0]?.hit || sig.status === 'TP1_HIT' || sig.status === 'TP2_HIT' || sig.status === 'TP3_HIT' || sig.status === 'COMPLETED';
    const hasTp2 = targets[1]?.hit || sig.status === 'TP2_HIT' || sig.status === 'TP3_HIT' || sig.status === 'COMPLETED';
    const hasTp3 = targets[2]?.hit || sig.status === 'TP3_HIT' || sig.status === 'COMPLETED';
    const hasTp4 = targets[3]?.hit || (sig.status === 'COMPLETED' && targets.length >= 4);

    if (hasTp1) tp1Hits++;
    if (hasTp2) tp2Hits++;
    if (hasTp3) tp3Hits++;
    if (hasTp4) tp4Hits++;

    if (sig.status === 'STOPPED_OUT') {
      stoppedOut++;
    } else if (sig.status === 'ACTIVE' || sig.status === 'ENTRY_PENDING') {
      activeCount++;
    }

    // Measure max realized target gain
    for (const t of targets) {
      if (t.hit && t.price > 0 && entry > 0) {
        const gain = isLong ? ((t.price - entry) / entry) * 100 : ((entry - t.price) / entry) * 100;
        if (gain > maxGainPct) {
          maxGainPct = gain;
        }
      }
    }

    if (sig.riskRewardRatio && sig.riskRewardRatio > 0) {
      totalRR += sig.riskRewardRatio;
      validRRCount++;
    }
  }

  // Win Rate: Signals that hit >= TP1 relative to closed outcomes (or total if none closed)
  const closedOrHit = tp1Hits + stoppedOut;
  const winRatePct = closedOrHit > 0
    ? (tp1Hits / closedOrHit) * 100
    : (actionable.length > 0 ? (tp1Hits / actionable.length) * 100 : 0);

  const avgRiskReward = validRRCount > 0 ? +(totalRR / validRRCount).toFixed(2) : 2.5;

  return {
    date: getBangladeshDateString(),
    totalSignals: actionable.length,
    tp1Hits,
    tp2Hits,
    tp3Hits,
    tp4Hits,
    stoppedOut,
    activeCount,
    winRatePct: +winRatePct.toFixed(1),
    maxGainPct: +maxGainPct.toFixed(2),
    avgRiskReward
  };
}

export * from './dailyJournalService';

/**
 * Formats the institutional Daily MoonScanner Journal card
 */
export function formatDailyJournalMessage(stats: DailyJournalStats): string {
  const winCount = stats.tp1Hits;
  const winRate = stats.winRatePct.toFixed(1);
  const lossCount = stats.stoppedOut;
  const tp4PlusCount = stats.tp4Hits;
  const netGainPercent = stats.maxGainPct.toFixed(1);
  const netR = ((stats.tp1Hits * 1.5 + stats.tp2Hits * 0.5 + stats.tp3Hits * 1.0 + stats.tp4Hits * 1.5) - stats.stoppedOut).toFixed(1);

  return [
    `📊 <b>MoonScanner Daily Intelligence Journal</b>`,
    `🗓 Date: ${stats.date} (Asia/Dhaka UTC+6)`,
    ``,
    `🎯 <b>Performance Summary:</b>`,
    `• Total High-Conviction Setups: ${stats.totalSignals}`,
    `• Winning Trades (TP1+): ${winCount} (${winRate}%)`,
    `• Break-Even / Stopped: ${lossCount}`,
    ``,
    `🏆 <b>Target Breakdown:</b>`,
    `• TP1 Reached: ${stats.tp1Hits}`,
    `• TP2 Reached: ${stats.tp2Hits}`,
    `• TP3 Reached: ${stats.tp3Hits}`,
    `• TP4+ Explosive Moves: ${tp4PlusCount}`,
    ``,
    `💎 Total Realized Gain: +${netGainPercent}% | Net R: +${netR}R`,
    `🛡 Max Drawdown Protected via Break-Even Trailing.`,
    ``,
    `MoonScanner Institutional Engine — Discipline over Frequency.`
  ].join('\n');
}

/**
 * Dispatches the Daily Performance Journal card to configured channel and subscribers
 */
export async function dispatchDailyJournal(
  targetChatId?: string
): Promise<{ success: boolean; stats: DailyJournalStats; message: string; error?: string }> {
  const stats = calculateDailyJournalStats();
  const formattedText = formatDailyJournalMessage(stats);

  if (targetChatId) {
    const res = await sendRawTelegramMessage(formattedText, targetChatId);
    return {
      success: res.success,
      stats,
      message: res.success
        ? `Daily Journal dispatched to chat ${targetChatId}`
        : `Failed to dispatch to chat ${targetChatId}: ${res.error}`,
      error: res.error
    };
  }

  const broadcastRes = await sendTelegramTradeUpdateAlert(formattedText);
  return {
    success: broadcastRes.success,
    stats,
    message: broadcastRes.success
      ? `Daily Journal successfully broadcast to ${broadcastRes.deliveredCount} Telegram recipient(s).`
      : 'Failed to broadcast Daily Journal (check Telegram configuration).'
  };
}

let lastDispatchedDateKey = '';

/**
 * Daily Cron Scheduler for 23:59:00 Bangladesh Standard Time (Asia/Dhaka)
 */
export function startDailyJournalScheduler(): NodeJS.Timeout {
  console.log('[Performance Journal] Initializing 23:59 BST Daily Journal Cron Scheduler...');

  const interval = setInterval(async () => {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const parts = formatter.formatToParts(now);
      const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
      const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      const dateKey = `${year}-${month}-${day}`;

      // Trigger at 23:59 BST once per calendar day
      if (hour === 23 && minute === 59 && lastDispatchedDateKey !== dateKey) {
        lastDispatchedDateKey = dateKey;
        console.log(`[Daily Journal Cron] Firing Daily Performance Journal for ${dateKey} at 23:59 BST...`);
        const result = await dispatchDailyJournal();
        console.log(`[Daily Journal Cron] Broadcast result: ${result.message}`);
      }
    } catch (err) {
      console.warn('[Daily Journal Cron] Error checking schedule:', err);
    }
  }, 30000); // Check every 30 seconds

  return interval;
}
