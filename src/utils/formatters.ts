import { TargetLevel, Signal } from '../types/crypto';

/**
 * Format cryptocurrency prices cleanly with appropriate decimal places based on magnitude.
 */
export function formatPrice(price: number | string | undefined | null): string {
  if (price === undefined || price === null) return '$0.00';
  const num = typeof price === 'number' ? price : Number(price);
  if (isNaN(num)) return '$0.00';
  if (num >= 1000) {
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (num >= 1) {
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } else if (num >= 0.001) {
    return '$' + num.toFixed(5);
  } else {
    return '$' + num.toFixed(8);
  }
}

/**
 * Format percentage with explicit + or - sign.
 */
export function formatPercent(value: number | string | undefined | null, decimals: number = 2): string {
  if (value === undefined || value === null) return '+0.00%';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return '+0.00%';
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(decimals)}%`;
}

/**
 * Format large volume / market cap numbers into human-readable strings (e.g. $1.25B, $45.6M).
 */
export function formatCompactNumber(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return '$0';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return '$0';
  if (num >= 1e9) {
    return `$${(num / 1e9).toFixed(2)}B`;
  }
  if (num >= 1e6) {
    return `$${(num / 1e6).toFixed(2)}M`;
  }
  if (num >= 1e3) {
    return `$${(num / 1e3).toFixed(2)}K`;
  }
  return `$${num.toFixed(2)}`;
}

/**
 * Canonical Target Normalizer (TASK 2, TASK 5, TASK 9)
 * Guarantees that any signal's targets are deduplicated, sorted, and contain exactly one TP1, TP2, TP3.
 * Prevents UI duplication (TP1, TP1, TP2, TP2, TP3, TP3).
 */
export function getCanonicalTargets(signal: Partial<Signal>): TargetLevel[] {
  if (!signal) return [];
  
  const targetMap = new Map<string, TargetLevel>();
  
  // 1. If signal already has an array of targets, process it first (preserving full dynamic ladder TP1..TP7+)
  if (Array.isArray(signal.targets) && signal.targets.length > 0) {
    for (const t of signal.targets) {
      if (!t || typeof t.price !== 'number' || isNaN(t.price)) continue;
      // Normalize label/id to uppercase TP1, TP2, TP3, TP4, TP5, TP6, TP7, etc.
      const key = (t.id || t.label || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const standardKey = key.startsWith('TP') ? key : (/^\d+$/.test(key) ? `TP${key}` : `TP${targetMap.size + 1}`);
      
      // If not already in map, save it while preserving rich metadata (evidenceLevel, structuralBasis, isClustered, status, etc.)
      if (!targetMap.has(standardKey)) {
        targetMap.set(standardKey, {
          ...t,
          id: standardKey,
          label: t.label || standardKey,
          price: t.price,
          percentage: t.percentage,
          hit: !!t.hit,
          hitTime: t.hitTime
        });
      }
    }
  }
  
  // 2. If scalar fields exist and map is missing any level, fill safely without duplicating
  if (!targetMap.has('TP1') && typeof signal.tp1 === 'number' && !isNaN(signal.tp1) && signal.tp1 > 0) {
    targetMap.set('TP1', { id: 'TP1', label: 'TP1', price: signal.tp1 });
  }
  if (!targetMap.has('TP2') && typeof signal.tp2 === 'number' && !isNaN(signal.tp2) && signal.tp2 > 0) {
    targetMap.set('TP2', { id: 'TP2', label: 'TP2', price: signal.tp2 });
  }
  if (!targetMap.has('TP3') && typeof signal.tp3 === 'number' && !isNaN(signal.tp3) && signal.tp3 > 0) {
    targetMap.set('TP3', { id: 'TP3', label: 'TP3', price: signal.tp3 });
  }
  
  // 3. Fallback calculation if completely empty but entryPrice and stopLoss exist
  if (targetMap.size === 0 && signal.entryPrice && signal.stopLoss) {
    const entry = signal.entryPrice;
    const sl = signal.stopLoss;
    const isLong = signal.direction !== 'SHORT';
    const risk = Math.abs(entry - sl);
    
    targetMap.set('TP1', { id: 'TP1', label: 'TP1', price: isLong ? entry + risk * 1.5 : entry - risk * 1.5 });
    targetMap.set('TP2', { id: 'TP2', label: 'TP2', price: isLong ? entry + risk * 2.5 : entry - risk * 2.5 });
    targetMap.set('TP3', { id: 'TP3', label: 'TP3', price: isLong ? entry + risk * 4.0 : entry - risk * 4.0 });
  }
  
  // Convert to ordered array with natural numeric sorting [TP1, TP2, TP3, TP4, ..., TP10, ...]
  const keys = Array.from(targetMap.keys()).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10);
    const numB = parseInt(b.replace(/\D/g, ''), 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });

  const result: TargetLevel[] = [];
  for (const k of keys) {
    const item = targetMap.get(k)!;
    // Calculate target gain percentage if not already present
    if ((item.percentage === undefined || isNaN(item.percentage)) && signal.entryPrice && signal.entryPrice > 0) {
      const isLong = signal.direction !== 'SHORT';
      item.percentage = isLong 
        ? Number((((item.price - signal.entryPrice) / signal.entryPrice) * 100).toFixed(2))
        : Number((((signal.entryPrice - item.price) / signal.entryPrice) * 100).toFixed(2));
    }
    result.push(item);
  }
  
  return result;
}

/**
 * Calculates realistic potential gain percentage to the terminal structural target (TP7+)
 * without artificial caps.
 */
export function computePotentialGainPct(signal: Partial<Signal>): number {
  if (signal.opportunityPriority?.realisticUpsidePct !== undefined && !isNaN(signal.opportunityPriority.realisticUpsidePct)) {
    return signal.opportunityPriority.realisticUpsidePct;
  }
  const targets = getCanonicalTargets(signal);
  if (targets.length === 0 || !signal.entryPrice || signal.entryPrice <= 0) {
    return 0;
  }
  const terminalTarget = targets[targets.length - 1];
  const isLong = signal.direction !== 'SHORT';
  const gain = isLong
    ? ((terminalTarget.price - signal.entryPrice) / signal.entryPrice) * 100
    : ((signal.entryPrice - terminalTarget.price) / signal.entryPrice) * 100;
  return Math.max(0, Number(gain.toFixed(2)));
}

/**
 * Universal Bangladesh Local Time Formatter (UTC+6 / BST)
 */
export function formatBangladeshTime(timestamp: number | string | Date | undefined | null): string {
  if (!timestamp) return '--:--';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '--:--';
  
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date);
}

/**
 * Relative time helper (e.g. "5m ago", "1h ago")
 */
export function formatRelativeTime(timestamp: number | string | Date | undefined | null): string {
  if (!timestamp) return '';
  const now = Date.now();
  const past = new Date(timestamp).getTime();
  const diffSec = Math.floor((now - past) / 1000);
  
  if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
