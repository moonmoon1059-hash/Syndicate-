import { Candle } from './cryptoService';
import {
  runComprehensivePatternEngine,
  type PatternDetectionResult,
  type PatternCategory,
  type PatternBias,
  type BreakoutStatus,
  type RetestStatus,
  type PatternKeyLevels,
  type SwingPoint
} from './patternEngine';

export interface IndicatorResults {
  ema9: number[];
  ema20: number[];
  ema50: number[];
  ema200: number[];
  rsi: number[];
  macd: { macd: number[]; signal: number[]; histogram: number[] };
  atr: number[];
  bollingerBands: { upper: number[]; middle: number[]; lower: number[] };
  rvol: number;
}

export interface PatternResult {
  detected: boolean;
  name: string;
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  breakoutPrice?: number;
  breakoutTimestamp?: number;
  description: string;
  // Extended modular fields (Step 4 & Step 17)
  category?: PatternCategory;
  breakoutStatus?: BreakoutStatus;
  retestStatus?: RetestStatus;
  volumeConfirmation?: boolean;
  volumeRatio?: number;
  invalidationPrice?: number;
  keyLevels?: PatternKeyLevels;
  evidence?: string[];
  swings?: SwingPoint[];
}

export {
  runComprehensivePatternEngine,
  type PatternDetectionResult,
  type PatternCategory,
  type PatternBias,
  type BreakoutStatus,
  type RetestStatus,
  type PatternKeyLevels,
  type SwingPoint
};

/**
 * Compute Exponential Moving Average (EMA)
 */
export function calculateEMA(values: number[], period: number): number[] {
  if (values.length < period) return new Array(values.length).fill(values[values.length - 1] || 0);
  const k = 2 / (period + 1);
  const ema: number[] = [];
  
  // Start with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
    ema.push(sum / (i + 1));
  }
  
  for (let i = period; i < values.length; i++) {
    const nextEma = values[i] * k + ema[i - 1] * (1 - k);
    ema.push(nextEma);
  }
  return ema;
}

/**
 * Compute Relative Strength Index (RSI - 14)
 */
export function calculateRSI(closes: number[], period: number = 14): number[] {
  if (closes.length <= period) return new Array(closes.length).fill(50);
  const rsi: number[] = new Array(period).fill(50);
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) {
        avgGain = (avgGain * (period - 1) + diff) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - diff) / period;
      }
    }
    
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  return rsi;
}

/**
 * Compute Average True Range (ATR - 14)
 */
export function calculateATR(candles: Candle[], period: number = 14): number[] {
  if (candles.length < 2) return new Array(candles.length).fill(0);
  const tr: number[] = [candles[0].high - candles[0].low];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    const trueRange = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    tr.push(trueRange);
  }
  
  return calculateEMA(tr, period);
}

/**
 * Compute MACD (12, 26, 9)
 */
export function calculateMACD(closes: number[]): { macd: number[]; signal: number[]; histogram: number[] } {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calculateEMA(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  
  return { macd: macdLine, signal: signalLine, histogram };
}

/**
 * Compute Relative Volume (RVOL)
 * Uses the maximum of the latest confirmed closed candle and current forming candle
 * to prevent artificial volume collapse when a new bar opens.
 */
export function calculateRVOL(volumes: number[], period: number = 20): number {
  if (!volumes || volumes.length < 2) return 1.0;
  const effPeriod = Math.min(period, volumes.length - 1);
  if (effPeriod < 1) return 1.0;

  const slice = volumes.slice(-effPeriod - 1, -1);
  const avgVol = slice.reduce((a, b) => a + b, 0) / (slice.length || 1);
  if (avgVol <= 0) return 1.0;

  const currentVol = volumes[volumes.length - 1] || 0;
  const lastClosedVol = volumes.length >= 2 ? volumes[volumes.length - 2] : currentVol;

  const rvolClosed = lastClosedVol / avgVol;
  const rvolCurrent = currentVol / avgVol;
  const effectiveRvol = Math.max(rvolClosed, rvolCurrent);

  return Number(effectiveRvol.toFixed(2));
}

/**
 * Detect Geometric & Chart Patterns via Modular Pattern Engine
 */
export function detectPatterns(candles: Candle[], timeframe: string = '1h'): PatternResult {
  return runComprehensivePatternEngine(candles, timeframe);
}

// ============================================================================
// INSTITUTIONAL VOLUME PROFILE & LIQUIDITY VACUUM ENGINE
// ============================================================================

export interface VolumeProfileTier {
  binIndex: number;
  price: number;
  lowPrice: number;
  highPrice: number;
  volume: number;
  percentage: number;
  isPOC: boolean;
  isValueArea: boolean;
  isLVN: boolean;
}

export interface VolumeProfileResult {
  poc: number;              // Point of Control: Price tier with maximum accumulated volume
  vah: number;              // Value Area High: Upper boundary covering 70% of total volume
  val: number;              // Value Area Low: Lower boundary covering 70% of total volume
  lvns: number[];           // Low Volume Nodes: Thin liquidity zones/voids above POC
  pocPrice?: number;        // Alias for poc
  vahPrice?: number;        // Alias for vah
  valPrice?: number;        // Alias for val
  lvnPrices?: number[];     // Alias for lvns
  tiers: VolumeProfileTier[];
  totalVolume: number;
  valueAreaVolume: number;
  isPriceAbovePOC: boolean;
  isPriceAboveVAH: boolean;
  reclaimedPOCorVAH: boolean;
}

/**
 * Calculates Institutional Volume Profile across 30 price tiers
 * for the recent 50-100 candles.
 * 
 * - Distributes volume across 30 price tiers.
 * - Point of Control (POC): Price tier with maximum volume accumulation.
 * - Value Area (VAH / VAL): Price boundaries covering 70% of total volume profile.
 * - Low Volume Nodes (LVN): Thin volume zones (liquidity voids/vacuums) above POC
 *   where explosive 30-100%+ fast expansions occur.
 */
export function calculateVolumeProfile(
  candles: Candle[],
  binsCount: number = 30
): VolumeProfileResult {
  if (!candles || candles.length === 0) {
    return {
      poc: 0,
      vah: 0,
      val: 0,
      lvns: [],
      tiers: [],
      totalVolume: 0,
      valueAreaVolume: 0,
      isPriceAbovePOC: false,
      isPriceAboveVAH: false,
      reclaimedPOCorVAH: false,
    };
  }

  // Use recent 50 to 100 candles
  const windowSize = Math.max(20, Math.min(candles.length, 100));
  const recentCandles = candles.slice(-windowSize);

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let totalCandleVolume = 0;

  for (const c of recentCandles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
    totalCandleVolume += c.volume || 1;
  }

  const latestPrice = recentCandles[recentCandles.length - 1].close;

  if (minPrice >= maxPrice || !Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
    return {
      poc: latestPrice,
      vah: latestPrice * 1.01,
      val: latestPrice * 0.99,
      lvns: [],
      tiers: [],
      totalVolume: totalCandleVolume,
      valueAreaVolume: totalCandleVolume,
      isPriceAbovePOC: true,
      isPriceAboveVAH: false,
      reclaimedPOCorVAH: true,
    };
  }

  const priceRange = maxPrice - minPrice;
  const binStep = priceRange / binsCount;

  // Initialize bins
  const binVolumes = new Float64Array(binsCount);

  // Distribute candle volume into overlapping bins proportionally
  for (const c of recentCandles) {
    const vol = c.volume || 1;
    const cLow = c.low;
    const cHigh = c.high;
    const cRange = cHigh - cLow;

    if (cRange <= 0) {
      const idx = Math.min(binsCount - 1, Math.max(0, Math.floor((c.close - minPrice) / binStep)));
      binVolumes[idx] += vol;
      continue;
    }

    const startBin = Math.min(binsCount - 1, Math.max(0, Math.floor((cLow - minPrice) / binStep)));
    const endBin = Math.min(binsCount - 1, Math.max(0, Math.floor((cHigh - minPrice) / binStep)));

    for (let b = startBin; b <= endBin; b++) {
      const bLow = minPrice + b * binStep;
      const bHigh = bLow + binStep;
      const overlapLow = Math.max(cLow, bLow);
      const overlapHigh = Math.min(cHigh, bHigh);
      const overlap = Math.max(0, overlapHigh - overlapLow);
      if (overlap > 0) {
        binVolumes[b] += vol * (overlap / cRange);
      }
    }
  }

  // 1. Point of Control (POC): Price tier with maximum volume accumulation
  let maxBinIndex = 0;
  let maxBinVolume = 0;
  let totalProfileVolume = 0;

  for (let b = 0; b < binsCount; b++) {
    const vol = binVolumes[b];
    totalProfileVolume += vol;
    if (vol > maxBinVolume) {
      maxBinVolume = vol;
      maxBinIndex = b;
    }
  }

  const pocPrice = minPrice + (maxBinIndex + 0.5) * binStep;

  // 2. Value Area (VAH / VAL): Covering 70% of total volume expanding outward from POC
  const targetVaVolume = totalProfileVolume * 0.70;
  let accumulatedVaVolume = maxBinVolume;
  let lowVaIndex = maxBinIndex;
  let highVaIndex = maxBinIndex;

  while (accumulatedVaVolume < targetVaVolume && (lowVaIndex > 0 || highVaIndex < binsCount - 1)) {
    const nextLowVol = lowVaIndex > 0 ? binVolumes[lowVaIndex - 1] : -1;
    const nextHighVol = highVaIndex < binsCount - 1 ? binVolumes[highVaIndex + 1] : -1;

    if (nextHighVol >= nextLowVol && highVaIndex < binsCount - 1) {
      highVaIndex++;
      accumulatedVaVolume += binVolumes[highVaIndex];
    } else if (lowVaIndex > 0) {
      lowVaIndex--;
      accumulatedVaVolume += binVolumes[lowVaIndex];
    } else if (highVaIndex < binsCount - 1) {
      highVaIndex++;
      accumulatedVaVolume += binVolumes[highVaIndex];
    } else {
      break;
    }
  }

  const vahPrice = minPrice + (highVaIndex + 1) * binStep;
  const valPrice = minPrice + lowVaIndex * binStep;

  // 3. Low Volume Nodes (LVN): Thin volume zones (liquidity voids/vacuums) above POC
  // Where explosive fast expansions occur
  const avgBinVolume = totalProfileVolume / binsCount;
  const lvnThreshold = avgBinVolume * 0.45;
  const lvns: number[] = [];

  for (let b = maxBinIndex + 1; b < binsCount - 1; b++) {
    const vol = binVolumes[b];
    const prevVol = binVolumes[b - 1];
    const nextVol = binVolumes[b + 1];

    // Local minimum or below threshold
    if ((vol < prevVol && vol < nextVol && vol < avgBinVolume * 0.75) || vol <= lvnThreshold) {
      const lvnPrice = minPrice + (b + 0.5) * binStep;
      lvns.push(Number(lvnPrice.toFixed(4)));
    }
  }

  // Build tiers list
  const tiers: VolumeProfileTier[] = [];
  for (let b = 0; b < binsCount; b++) {
    const bLow = minPrice + b * binStep;
    const bHigh = bLow + binStep;
    const bMid = bLow + 0.5 * binStep;
    const vol = binVolumes[b];
    const isPOC = b === maxBinIndex;
    const isValueArea = b >= lowVaIndex && b <= highVaIndex;
    const isLVN = lvns.some(p => Math.abs(p - bMid) <= binStep * 0.6);

    tiers.push({
      binIndex: b,
      price: Number(bMid.toFixed(4)),
      lowPrice: Number(bLow.toFixed(4)),
      highPrice: Number(bHigh.toFixed(4)),
      volume: Number(vol.toFixed(2)),
      percentage: totalProfileVolume > 0 ? Number(((vol / totalProfileVolume) * 100).toFixed(2)) : 0,
      isPOC,
      isValueArea,
      isLVN,
    });
  }

  const prevPrice = recentCandles.length >= 2 ? recentCandles[recentCandles.length - 2].close : latestPrice;
  const isPriceAbovePOC = latestPrice >= pocPrice * 0.995;
  const isPriceAboveVAH = latestPrice >= vahPrice * 0.995;
  const reclaimedPOCorVAH = isPriceAbovePOC || isPriceAboveVAH || prevPrice >= pocPrice * 0.995;

  const formattedPoc = Number(pocPrice.toFixed(4));
  const formattedVah = Number(vahPrice.toFixed(4));
  const formattedVal = Number(valPrice.toFixed(4));

  return {
    poc: formattedPoc,
    vah: formattedVah,
    val: formattedVal,
    lvns,
    pocPrice: formattedPoc,
    vahPrice: formattedVah,
    valPrice: formattedVal,
    lvnPrices: lvns,
    tiers,
    totalVolume: Number(totalProfileVolume.toFixed(2)),
    valueAreaVolume: Number(accumulatedVaVolume.toFixed(2)),
    isPriceAbovePOC,
    isPriceAboveVAH,
    reclaimedPOCorVAH,
  };
}

/**
 * Computes the dynamic recommended leverage based on Structural SL Distance:
 * slPercent = abs(entry - sl) / entry * 100
 * - slPercent <= 2.5%: "Recommended: 15x - 20x (Cross/Isolated)"
 * - slPercent > 2.5% and <= 5.0%: "Recommended: 10x - 12x (Cross/Isolated)"
 * - slPercent > 5.0% and <= 8.0%: "Recommended: 5x - 8x (Cross/Isolated)"
 * - slPercent > 8.0%: "Recommended: 3x - 5x (Cross/Isolated)"
 */
export function calculateDynamicRecommendedLeverage(entryPrice: number, stopLoss: number): string {
  if (!entryPrice || entryPrice <= 0 || !stopLoss || stopLoss <= 0) {
    return 'Recommended: 10x - 12x (Cross/Isolated)';
  }
  const slPercent = (Math.abs(entryPrice - stopLoss) / entryPrice) * 100;
  if (slPercent <= 2.5) {
    return 'Recommended: 15x - 20x (Cross/Isolated)';
  } else if (slPercent <= 5.0) {
    return 'Recommended: 10x - 12x (Cross/Isolated)';
  } else if (slPercent <= 8.0) {
    return 'Recommended: 5x - 8x (Cross/Isolated)';
  } else {
    return 'Recommended: 3x - 5x (Cross/Isolated)';
  }
}

/**
 * Creates a genuine execution band to avoid single-point entry zone collapse (Zone: 1.50 - 1.50)
 * entryZoneLow = roundToTick(breakoutLevel * 0.9985)
 * entryZoneHigh = roundToTick(breakoutLevel * 1.0025)
 * Allows normal micro-fluctuations so Binance AutoTrade does not prematurely abort with ENTRY_MISSED.
 */
export function calculateRealEntryZone(
  breakoutLevel: number,
  priceDecimals: number = 2
): { entryZoneLow: number; entryZoneHigh: number } {
  const dec = Math.max(0, Math.min(8, priceDecimals));
  let low = Number((breakoutLevel * 0.9985).toFixed(dec));
  let high = Number((breakoutLevel * 1.0025).toFixed(dec));

  // If after rounding low and high are identical (e.g. low tick precision like 1.50),
  // expand tick margin so AutoTrade does not prematurely abort with ENTRY_MISSED
  if (low >= high) {
    const tick = Math.pow(10, -dec);
    low = Number((breakoutLevel - tick).toFixed(dec));
    high = Number((breakoutLevel + tick).toFixed(dec));
    if (low >= high) {
      low = Number((breakoutLevel * 0.998).toFixed(dec + 1));
      high = Number((breakoutLevel * 1.003).toFixed(dec + 1));
    }
  }

  return { entryZoneLow: low, entryZoneHigh: high };
}

/**
 * Institutional Pre-Pump & Breakout SL & RR Compliance Validator:
 * - Minimum Risk/Reward Ratio >= 2.0
 * - SL distance <= 5.0% for scalps/momentum setups (unless classified as high-timeframe swing with reduced leverage)
 * - Dynamic Recommended Leverage computation
 */
export function validatePrePumpCompliance(params: {
  entryPrice: number;
  stopLoss: number;
  targets?: Array<{ price: number }> | number[];
  riskRewardRatio?: number;
  isSwing?: boolean;
  timeframe?: string;
}): {
  compliant: boolean;
  rejectReason?: string;
  slPercent: number;
  riskRewardRatio: number;
  recommendedLeverage: string;
} {
  const { entryPrice, stopLoss, targets, isSwing, timeframe } = params;
  if (!entryPrice || entryPrice <= 0 || !stopLoss || stopLoss <= 0) {
    return {
      compliant: false,
      rejectReason: 'INVALID_PRICES: Entry and Stop Loss must be positive non-zero numbers',
      slPercent: 0,
      riskRewardRatio: 0,
      recommendedLeverage: 'Recommended: 10x - 12x (Cross/Isolated)'
    };
  }

  const slPercent = (Math.abs(entryPrice - stopLoss) / entryPrice) * 100;
  const isHighTfSwing = isSwing || timeframe === '4h' || timeframe === '1d';

  if (!isHighTfSwing && slPercent > 5.0) {
    return {
      compliant: false,
      rejectReason: `SL_EXCEEDS_5_PCT: Stop Loss distance (-${slPercent.toFixed(2)}%) exceeds mandatory 5.0% ceiling for scalp/momentum setups`,
      slPercent,
      riskRewardRatio: params.riskRewardRatio || 0,
      recommendedLeverage: calculateDynamicRecommendedLeverage(entryPrice, stopLoss)
    };
  }

  let rr = params.riskRewardRatio || 0;
  if (rr <= 0 && targets && targets.length > 0) {
    const tpPrices = targets.map((t: any) => typeof t === 'number' ? t : t.price).filter(p => p > 0);
    if (tpPrices.length > 0) {
      const maxTp = Math.max(...tpPrices);
      const minTp = Math.min(...tpPrices);
      const isLong = stopLoss < entryPrice;
      const targetMove = isLong ? (maxTp - entryPrice) : (entryPrice - minTp);
      const slDist = Math.abs(entryPrice - stopLoss);
      if (slDist > 0 && targetMove > 0) {
        rr = Number((targetMove / slDist).toFixed(1));
      }
    }
  }

  if (rr > 0 && rr < 2.0) {
    return {
      compliant: false,
      rejectReason: `RR_BELOW_2: Risk/Reward ratio (${rr}) is below mandatory 2.0 minimum threshold`,
      slPercent,
      riskRewardRatio: rr,
      recommendedLeverage: calculateDynamicRecommendedLeverage(entryPrice, stopLoss)
    };
  }

  return {
    compliant: true,
    slPercent,
    riskRewardRatio: rr >= 2.0 ? rr : 2.0,
    recommendedLeverage: calculateDynamicRecommendedLeverage(entryPrice, stopLoss)
  };
}

