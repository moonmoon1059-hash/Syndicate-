import { Candle } from './cryptoService';
import {
  LiquidityClassification,
  LiquidityZone,
  LiquidityZoneType,
  SweepSequenceType,
  LiquidityAsymmetry
} from '../src/types/crypto';

export interface PivotPoint {
  index: number;
  price: number;
  timestamp: number;
  type: 'HIGH' | 'LOW';
}

export interface EqualLevel {
  price: number;
  touches: number;
  indices: number[];
  tolerance: number;
}

export interface LiquiditySweepResult {
  detected: boolean;
  type: 'BULLISH_SWEEP' | 'BEARISH_SWEEP' | 'NONE';
  sweepLevel: number;
  reclaimPrice: number;
  candleIndex: number;
  description: string;
}

export interface StructureCollisionCheck {
  detected: boolean;
  distancePct: number;
  level: number;
  details: string;
}

export interface LiquidityStructureAnalysis {
  classification: LiquidityClassification;
  equalHighs: EqualLevel | null;
  equalLows: EqualLevel | null;
  liquiditySweep: LiquiditySweepResult;
  sweepSequence: SweepSequenceType;
  possibleStopHunt: boolean;
  failedBreakout: boolean;
  liquidityZones: LiquidityZone[];
  asymmetry: LiquidityAsymmetry;
  resistanceCollision: StructureCollisionCheck;
  supportCollision: StructureCollisionCheck;
  details: string[];
  keyResistanceLevels: number[];
  keySupportLevels: number[];
}

/**
 * Identifies swing pivots (Highs & Lows) using a rolling window
 */
export function findSwingPivots(candles: Candle[], window: number = 2): PivotPoint[] {
  const pivots: PivotPoint[] = [];
  if (!candles || candles.length < window * 2 + 1) return pivots;

  for (let i = window; i < candles.length - window; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;

    let isHigh = true;
    let isLow = true;

    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (candles[j].high >= currentHigh) isHigh = false;
      if (candles[j].low <= currentLow) isLow = false;
    }

    if (isHigh) {
      pivots.push({ index: i, price: currentHigh, timestamp: candles[i].timestamp, type: 'HIGH' });
    }
    if (isLow) {
      pivots.push({ index: i, price: currentLow, timestamp: candles[i].timestamp, type: 'LOW' });
    }
  }

  return pivots;
}

/**
 * Detects equal highs or equal lows (clusters of swing points within tolerance)
 */
export function detectEqualLevels(pivots: PivotPoint[], type: 'HIGH' | 'LOW', tolerancePct: number = 0.0035): EqualLevel | null {
  const filtered = pivots.filter(p => p.type === type);
  if (filtered.length < 2) return null;

  let bestLevel: EqualLevel | null = null;
  let maxTouches = 0;

  for (let i = 0; i < filtered.length; i++) {
    const basePrice = filtered[i].price;
    const matchingIndices: number[] = [filtered[i].index];
    let sumPrice = basePrice;

    for (let j = 0; j < filtered.length; j++) {
      if (i === j) continue;
      const diffPct = Math.abs(filtered[j].price - basePrice) / basePrice;
      if (diffPct <= tolerancePct) {
        matchingIndices.push(filtered[j].index);
        sumPrice += filtered[j].price;
      }
    }

    if (matchingIndices.length >= 2 && matchingIndices.length > maxTouches) {
      maxTouches = matchingIndices.length;
      bestLevel = {
        price: sumPrice / matchingIndices.length,
        touches: matchingIndices.length,
        indices: Array.from(new Set(matchingIndices)),
        tolerance: tolerancePct
      };
    }
  }

  return bestLevel;
}

/**
 * Phase 4.6: Map and rank all available liquidity zones from market data
 */
export function mapLiquidityZones(
  candles: Candle[],
  pivotsOrPrice?: PivotPoint[] | number,
  equalHighs?: EqualLevel | number | null,
  equalLows?: EqualLevel | null,
  currentPriceArg?: number,
  priceDecimals: number = 2
): LiquidityZone[] {

  const zones: LiquidityZone[] = [];
  if (!candles || candles.length < 5) return zones;

  const len = candles.length;
  const latestPrice = candles[len - 1].close;

  let pivots: PivotPoint[];
  let eqHighs: EqualLevel | null;
  let eqLows: EqualLevel | null;
  let currentPrice: number;

  if (typeof pivotsOrPrice === 'number') {
    currentPrice = pivotsOrPrice;
    pivots = findSwingPivots(candles, 2);
    eqHighs = detectEqualLevels(pivots, 'HIGH', 0.004);
    eqLows = detectEqualLevels(pivots, 'LOW', 0.004);
    if (typeof equalHighs === 'number') {
      priceDecimals = equalHighs;
    }
  } else {
    pivots = Array.isArray(pivotsOrPrice) ? pivotsOrPrice : findSwingPivots(candles, 2);
    eqHighs = equalHighs && typeof equalHighs === 'object' ? equalHighs : detectEqualLevels(pivots, 'HIGH', 0.004);
    eqLows = equalLows && typeof equalLows === 'object' ? equalLows : detectEqualLevels(pivots, 'LOW', 0.004);
    currentPrice = typeof currentPriceArg === 'number' ? currentPriceArg : latestPrice;
  }


  const recentCandles = candles.slice(Math.max(0, len - 30));

  // 1. Equal Highs Zone
  if (eqHighs) {
    const dist = ((eqHighs.price - currentPrice) / currentPrice) * 100;
    const swept = currentPrice > eqHighs.price || candles.slice(-5).some(c => c.high > eqHighs!.price && c.close < eqHighs!.price);
    zones.push({
      price: Number(eqHighs.price.toFixed(priceDecimals)),
      type: 'EQUAL_HIGHS',
      strength: Math.min(95, 60 + eqHighs.touches * 10),
      distanceFromPricePct: Number(dist.toFixed(2)),
      relevance: 'HIGH',
      touched: true,
      touchCount: eqHighs.touches,
      swept,
      description: `Equal Highs buy-side liquidity pool with ${eqHighs.touches} touches`
    });
  }

  // 2. Equal Lows Zone
  if (eqLows) {
    const dist = ((eqLows.price - currentPrice) / currentPrice) * 100;
    const swept = currentPrice < eqLows.price || candles.slice(-5).some(c => c.low < eqLows!.price && c.close > eqLows!.price);
    zones.push({
      price: Number(eqLows.price.toFixed(priceDecimals)),
      type: 'EQUAL_LOWS',
      strength: Math.min(95, 60 + eqLows.touches * 10),
      distanceFromPricePct: Number(dist.toFixed(2)),
      relevance: 'HIGH',
      touched: true,
      touchCount: eqLows.touches,
      swept,
      description: `Equal Lows sell-side liquidity pool with ${eqLows.touches} touches`
    });
  }

  // 3. Range High & Range Low
  const highs = recentCandles.map(c => c.high);
  const lows = recentCandles.map(c => c.low);
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);

  if (rangeHigh > 0 && (!eqHighs || Math.abs(rangeHigh - eqHighs.price) / rangeHigh > 0.005)) {
    const dist = ((rangeHigh - currentPrice) / currentPrice) * 100;
    zones.push({
      price: Number(rangeHigh.toFixed(priceDecimals)),
      type: 'RANGE_HIGH',
      strength: 75,
      distanceFromPricePct: Number(dist.toFixed(2)),
      relevance: 'MEDIUM',
      touched: true,
      touchCount: 1,
      swept: currentPrice > rangeHigh,
      description: `Range High liquidity level at ${rangeHigh.toFixed(priceDecimals)}`
    });
  }

  if (rangeLow > 0 && (!eqLows || Math.abs(rangeLow - eqLows.price) / rangeLow > 0.005)) {
    const dist = ((rangeLow - currentPrice) / currentPrice) * 100;
    zones.push({
      price: Number(rangeLow.toFixed(priceDecimals)),
      type: 'RANGE_LOW',
      strength: 75,
      distanceFromPricePct: Number(dist.toFixed(2)),
      relevance: 'MEDIUM',
      touched: true,
      touchCount: 1,
      swept: currentPrice < rangeLow,
      description: `Range Low liquidity level at ${rangeLow.toFixed(priceDecimals)}`
    });
  }

  // 4. Swing Highs & Swing Lows from Pivots
  const highPivots = pivots.filter(p => p.type === 'HIGH').slice(-4);
  for (const hp of highPivots) {
    // Avoid duplicating range high or equal highs
    if (Math.abs(hp.price - rangeHigh) / rangeHigh > 0.004 && (!eqHighs || Math.abs(hp.price - eqHighs.price) / eqHighs.price > 0.004)) {
      const dist = ((hp.price - currentPrice) / currentPrice) * 100;
      zones.push({
        price: Number(hp.price.toFixed(priceDecimals)),
        type: 'SWING_HIGH',
        strength: 70,
        distanceFromPricePct: Number(dist.toFixed(2)),
        relevance: Math.abs(dist) < 3.0 ? 'HIGH' : 'MEDIUM',
        touched: true,
        touchCount: 1,
        swept: currentPrice > hp.price,
        description: `Swing High liquidity node at ${hp.price.toFixed(priceDecimals)}`
      });
    }
  }

  const lowPivots = pivots.filter(p => p.type === 'LOW').slice(-4);
  for (const lp of lowPivots) {
    if (Math.abs(lp.price - rangeLow) / rangeLow > 0.004 && (!eqLows || Math.abs(lp.price - eqLows.price) / eqLows.price > 0.004)) {
      const dist = ((lp.price - currentPrice) / currentPrice) * 100;
      zones.push({
        price: Number(lp.price.toFixed(priceDecimals)),
        type: 'SWING_LOW',
        strength: 70,
        distanceFromPricePct: Number(dist.toFixed(2)),
        relevance: Math.abs(dist) < 3.0 ? 'HIGH' : 'MEDIUM',
        touched: true,
        touchCount: 1,
        swept: currentPrice < lp.price,
        description: `Swing Low liquidity node at ${lp.price.toFixed(priceDecimals)}`
      });
    }
  }

  // 5. High-Volume Reaction Nodes (detect candles with >= 1.8x average volume)
  const avgVol = candles.reduce((acc, c) => acc + (c.volume || 0), 0) / Math.max(1, len);
  if (avgVol > 0) {
    for (let i = Math.max(0, len - 15); i < len - 1; i++) {
      const c = candles[i];
      if ((c.volume || 0) >= avgVol * 1.8) {
        const nodePrice = (c.high + c.low + c.close) / 3;
        const exists = zones.some(z => Math.abs(z.price - nodePrice) / nodePrice < 0.004);
        if (!exists) {
          const dist = ((nodePrice - currentPrice) / currentPrice) * 100;
          zones.push({
            price: Number(nodePrice.toFixed(priceDecimals)),
            type: 'HIGH_VOLUME_NODE',
            strength: 80,
            distanceFromPricePct: Number(dist.toFixed(2)),
            relevance: Math.abs(dist) < 2.5 ? 'HIGH' : 'MEDIUM',
            touched: true,
            touchCount: 1,
            swept: false,
            description: `High-Volume reaction zone around ${nodePrice.toFixed(priceDecimals)}`
          });
        }
      }
    }
  }

  // Deduplicate and sort by absolute distance to current price
  const uniqueZones: LiquidityZone[] = [];
  for (const z of zones) {
    const isDup = uniqueZones.some(uz => Math.abs(uz.price - z.price) / z.price < 0.002);
    if (!isDup) {
      uniqueZones.push(z);
    }
  }

  return uniqueZones.sort((a, b) => Math.abs(a.distanceFromPricePct) - Math.abs(b.distanceFromPricePct));
}

/**
 * Phase 4.6: Calculate Long vs Short Liquidity Asymmetry
 */
export function calculateLiquidityAsymmetry(
  arg1: number | LiquidityZone[],
  arg2: LiquidityZone[] | number,
  atrArg: number = 0
): LiquidityAsymmetry {
  let currentPrice: number;
  let zones: LiquidityZone[];
  let atr = atrArg;

  if (typeof arg1 === 'number') {
    currentPrice = arg1;
    zones = Array.isArray(arg2) ? arg2 : [];
  } else {
    zones = Array.isArray(arg1) ? arg1 : [];
    currentPrice = typeof arg2 === 'number' ? arg2 : 0;
  }

  if (!zones || zones.length === 0 || currentPrice <= 0) {
    return {
      upsideLiquidityScore: 50,
      downsideLiquidityScore: 50,
      ratio: 1.0,
      bias: 'NEUTRAL',
      description: 'Balanced liquidity landscape'
    };
  }


  const effectiveAtr = atr > 0 ? atr : currentPrice * 0.015;
  const horizon = effectiveAtr * 4.0;

  let upsideScore = 0;
  let downsideScore = 0;

  for (const z of zones) {
    const distAbs = Math.abs(z.price - currentPrice);
    if (distAbs > horizon * 1.5) continue;

    const proximityWeight = Math.max(0.2, 1 - distAbs / (horizon * 1.5));
    const strengthWeight = z.strength / 100;
    const weightedValue = z.strength * proximityWeight * (z.swept ? 0.4 : 1.0);

    if (z.price > currentPrice) {
      upsideScore += weightedValue;
    } else {
      downsideScore += weightedValue;
    }
  }

  const cleanUpside = Math.max(10, Math.min(100, Math.round(upsideScore)));
  const cleanDownside = Math.max(10, Math.min(100, Math.round(downsideScore)));
  const ratio = Number((cleanUpside / cleanDownside).toFixed(2));

  let bias: 'FAVORS_LONG' | 'FAVORS_SHORT' | 'NEUTRAL' = 'NEUTRAL';
  let description = 'Symmetrical liquidity distribution';

  if (ratio >= 1.35) {
    bias = 'FAVORS_LONG';
    description = `Upside buy-side liquidity pool density outweighs downside risk (${ratio.toFixed(2)}x)`;
  } else if (ratio <= 0.75) {
    bias = 'FAVORS_SHORT';
    description = `Downside sell-side liquidity pool density outweighs upside risk (${(1 / ratio).toFixed(2)}x)`;
  }

  return {
    upsideLiquidityScore: cleanUpside,
    downsideLiquidityScore: cleanDownside,
    ratio,
    bias,
    description
  };
}

/**
 * Phase 4.6: Support / Resistance Collision Check
 */
export function checkStructureCollision(
  arg1: number | 'LONG' | 'SHORT',
  arg2: 'LONG' | 'SHORT' | number,
  zonesOrLevels: (LiquidityZone | number)[],
  atrArg: number = 0
): StructureCollisionCheck {
  let currentPrice: number;
  let direction: 'LONG' | 'SHORT';

  if (typeof arg1 === 'number') {
    currentPrice = arg1;
    direction = (arg2 as 'LONG' | 'SHORT') || 'LONG';
  } else {
    direction = arg1 || 'LONG';
    currentPrice = typeof arg2 === 'number' ? arg2 : 0;
  }

  if (!zonesOrLevels || zonesOrLevels.length === 0 || currentPrice <= 0) {
    return { detected: false, distancePct: 999, level: 0, details: 'No immediate structural collision' };
  }

  const effectiveAtr = atrArg > 0 ? atrArg : currentPrice * 0.015;
  const collisionThresholdPct = Math.min(0.85, (effectiveAtr * 0.85 / currentPrice) * 100);

  // Normalize to price and type
  const normalizedZones: LiquidityZone[] = zonesOrLevels.map(z => {
    if (typeof z === 'number') {
      return {
        price: z,
        type: z > currentPrice ? 'MAJOR_RESISTANCE' : 'MAJOR_SUPPORT',
        strength: 80,
        distanceFromPricePct: Number((((z - currentPrice) / currentPrice) * 100).toFixed(2)),
        relevance: 'HIGH',
        touched: true,
        touchCount: 1,
        swept: false,
        description: `Structural level at ${z}`
      };
    }
    return z;
  });

  if (direction === 'LONG') {
    const opposingRes = normalizedZones.filter(
      z => z.price > currentPrice && 
      (z.type === 'EQUAL_HIGHS' || z.type === 'MAJOR_RESISTANCE' || ((z.type === 'RANGE_HIGH' || z.type === 'SWING_HIGH') && (z.touchCount || 0) >= 2)) &&
      !z.swept
    );

    for (const r of opposingRes) {
      const distPct = ((r.price - currentPrice) / currentPrice) * 100;
      if (distPct >= 0.15 && distPct <= collisionThresholdPct) {
        return {
          detected: true,
          distancePct: Number(distPct.toFixed(2)),
          level: r.price,
          details: `Major resistance barrier (${r.type}) is dangerously close (+${distPct.toFixed(2)}% at ${r.price})`
        };
      }
    }
  } else if (direction === 'SHORT') {
    const opposingSup = normalizedZones.filter(
      z => z.price < currentPrice && 
      (z.type === 'EQUAL_LOWS' || z.type === 'MAJOR_SUPPORT' || ((z.type === 'RANGE_LOW' || z.type === 'SWING_LOW') && (z.touchCount || 0) >= 2)) &&
      !z.swept
    );

    for (const s of opposingSup) {
      const distPct = ((currentPrice - s.price) / currentPrice) * 100;
      if (distPct >= 0.15 && distPct <= collisionThresholdPct) {
        return {
          detected: true,
          distancePct: Number(distPct.toFixed(2)),
          level: s.price,
          details: `Major support barrier (${s.type}) is dangerously close (-${distPct.toFixed(2)}% at ${s.price})`
        };
      }
    }
  }



  return { detected: false, distancePct: 999, level: 0, details: 'Clear structural runway' };
}

/**
 * Analyzes market liquidity structure, sweeps, stop-hunts, and failed breakouts
 */
export function analyzeLiquidityStructure(
  candles: Candle[],
  priceDecimals: number = 2
): LiquidityStructureAnalysis {
  const details: string[] = [];
  const keyResistanceLevels: number[] = [];
  const keySupportLevels: number[] = [];

  if (!candles || candles.length < 20) {
    return {
      classification: 'CLEAN_STRUCTURE',
      equalHighs: null,
      equalLows: null,
      liquiditySweep: { detected: false, type: 'NONE', sweepLevel: 0, reclaimPrice: 0, candleIndex: -1, description: 'Insufficient data' },
      sweepSequence: 'NONE',
      possibleStopHunt: false,
      failedBreakout: false,
      liquidityZones: [],
      asymmetry: { upsideLiquidityScore: 50, downsideLiquidityScore: 50, ratio: 1.0, bias: 'NEUTRAL', description: 'Insufficient data' },
      resistanceCollision: { detected: false, distancePct: 999, level: 0, details: 'None' },
      supportCollision: { detected: false, distancePct: 999, level: 0, details: 'None' },
      details: ['Insufficient candle data for liquidity mapping'],
      keyResistanceLevels: [],
      keySupportLevels: []
    };
  }

  const currentPrice = candles[candles.length - 1].close;
  const pivots = findSwingPivots(candles, 2);
  const equalHighs = detectEqualLevels(pivots, 'HIGH', 0.0035);
  const equalLows = detectEqualLevels(pivots, 'LOW', 0.0035);

  // Extract key S/R levels from distinct pivots
  const highPivots = pivots.filter(p => p.type === 'HIGH').map(p => Number(p.price.toFixed(priceDecimals)));
  const lowPivots = pivots.filter(p => p.type === 'LOW').map(p => Number(p.price.toFixed(priceDecimals)));
  
  const uniqueHighs = Array.from(new Set(highPivots)).sort((a, b) => a - b);
  const uniqueLows = Array.from(new Set(lowPivots)).sort((a, b) => b - a);

  keyResistanceLevels.push(...uniqueHighs.slice(-6));
  keySupportLevels.push(...uniqueLows.slice(0, 6));

  if (equalHighs) {
    details.push(`Equal Highs cluster mapped at ${equalHighs.price.toFixed(priceDecimals)} (${equalHighs.touches} touches - potential buy-side liquidity pool)`);
  }
  if (equalLows) {
    details.push(`Equal Lows cluster mapped at ${equalLows.price.toFixed(priceDecimals)} (${equalLows.touches} touches - potential sell-side liquidity pool)`);
  }

  // Check Liquidity Sweeps in recent candles (last 8 bars)
  const len = candles.length;
  let liquiditySweep: LiquiditySweepResult = {
    detected: false,
    type: 'NONE',
    sweepLevel: 0,
    reclaimPrice: 0,
    candleIndex: -1,
    description: 'No liquidity sweep detected'
  };

  let sweepSequence: SweepSequenceType = 'NONE';
  let possibleStopHunt = false;
  let failedBreakout = false;

  // Identify reference low / high in prior lookback (excluding current bar)
  const priorLookback = candles.slice(Math.max(0, len - 25), len - 1);
  const priorMinLow = priorLookback.length > 0 ? Math.min(...priorLookback.map(c => c.low)) : 0;
  const priorMaxHigh = priorLookback.length > 0 ? Math.max(...priorLookback.map(c => c.high)) : 0;

  for (let i = Math.max(1, len - 8); i < len; i++) {
    const c = candles[i];
    const refLow = equalLows ? equalLows.price : priorMinLow;
    const refHigh = equalHighs ? equalHighs.price : priorMaxHigh;

    // 1. Bullish Liquidity Sweep (Wick below equal lows or swing low, but candle closes back above)
    if (refLow > 0 && c.low < refLow && c.close >= refLow * 0.999) {
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const body = Math.abs(c.close - c.open);
      if ((lowerWick >= body * 1.0 && lowerWick > 0) || (c.close > c.open && lowerWick >= body * 0.4)) {
        // Check if subsequent bar confirmed reclaim
        const isLast = i === len - 1;
        const nextBar = !isLast ? candles[i + 1] : null;
        const isConfirmedReclaim = nextBar ? nextBar.close >= refLow : c.close > refLow;

        sweepSequence = isConfirmedReclaim ? 'CONFIRMED_RECLAIM' : 'BULLISH_SWEEP';
        liquiditySweep = {
          detected: true,
          type: 'BULLISH_SWEEP',
          sweepLevel: refLow,
          reclaimPrice: c.close,
          candleIndex: i,
          description: `Bullish Liquidity Sweep: Price pierced liquidity pool at ${refLow.toFixed(priceDecimals)} but instantly reclaimed with strong absorption`
        };
        possibleStopHunt = true;
        details.push(liquiditySweep.description);
        break;
      }
    }

    // 2. Bearish Liquidity Sweep (Wick above equal highs or swing high, but candle closes back below)
    if (refHigh > 0 && c.high > refHigh && c.close <= refHigh * 1.001) {
      const upperWick = c.high - Math.max(c.open, c.close);
      const body = Math.abs(c.close - c.open);
      if ((upperWick >= body * 1.0 && upperWick > 0 && c.close <= refHigh) || (c.close < c.open && upperWick >= body * 0.5)) {
        const isLast = i === len - 1;
        const nextBar = !isLast ? candles[i + 1] : null;
        const isConfirmedReclaim = nextBar ? nextBar.close <= refHigh : c.close < refHigh;

        sweepSequence = isConfirmedReclaim ? 'CONFIRMED_RECLAIM' : 'BEARISH_SWEEP';
        liquiditySweep = {
          detected: true,
          type: 'BEARISH_SWEEP',
          sweepLevel: refHigh,
          reclaimPrice: c.close,
          candleIndex: i,
          description: `Bearish Liquidity Sweep: Price pierced liquidity pool at ${refHigh.toFixed(priceDecimals)} but promptly rejected and closed below`
        };
        possibleStopHunt = true;
        details.push(liquiditySweep.description);
        break;
      }
    }

  }

  // Check for Failed Breakout in the last 4 candles
  if (!liquiditySweep.detected) {
    for (let i = Math.max(2, len - 5); i < len; i++) {
      const prev = candles[i - 1];
      const curr = candles[i];

      // Failed Bullish Breakout
      if (equalHighs && prev.close > equalHighs.price && curr.close < equalHighs.price * 0.998) {
        failedBreakout = true;
        sweepSequence = 'FAILED_SWEEP';
        details.push(`Failed Breakout: Bullish breakout above ${equalHighs.price.toFixed(priceDecimals)} failed to hold and fell back inside range`);
        break;
      }

      // Failed Bearish Breakdown
      if (equalLows && prev.close < equalLows.price && curr.close > equalLows.price * 1.002) {
        failedBreakout = true;
        sweepSequence = 'FAILED_SWEEP';
        details.push(`Failed Breakdown: Bearish breakdown below ${equalLows.price.toFixed(priceDecimals)} failed to hold and reclaimed support`);
        break;
      }
    }
  }

  // Map liquidity zones
  const liquidityZones = mapLiquidityZones(candles, pivots, equalHighs, equalLows, currentPrice, priceDecimals);

  // Compute rough ATR for distance & asymmetry
  const recentRanges = candles.slice(-14).map(c => c.high - c.low);
  const roughAtr = recentRanges.reduce((a, b) => a + b, 0) / Math.max(1, recentRanges.length);

  const asymmetry = calculateLiquidityAsymmetry(currentPrice, liquidityZones, roughAtr);
  const resistanceCollision = checkStructureCollision(currentPrice, 'LONG', liquidityZones, roughAtr);
  const supportCollision = checkStructureCollision(currentPrice, 'SHORT', liquidityZones, roughAtr);

  // Classify liquidity environment
  let classification: LiquidityClassification = 'CLEAN_STRUCTURE';
  if (liquiditySweep.detected) {
    classification = 'LIQUIDITY_SWEEP';
  } else if (failedBreakout) {
    classification = 'FAILED_BREAKOUT';
  } else if (equalHighs && equalLows) {
    classification = 'RANGE_BOUND_LIQUIDITY';
  } else if (equalHighs) {
    classification = 'BUY_SIDE_LIQUIDITY';
  } else if (equalLows) {
    classification = 'SELL_SIDE_LIQUIDITY';
  }

  return {
    classification,
    equalHighs,
    equalLows,
    liquiditySweep,
    sweepSequence,
    possibleStopHunt,
    failedBreakout,
    liquidityZones,
    asymmetry,
    resistanceCollision,
    supportCollision,
    details,
    keyResistanceLevels,
    keySupportLevels
  };
}
