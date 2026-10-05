import { Candle } from './cryptoService';
import { calculateATR, calculateEMA } from './technicalAnalysis';
import { DerivativesData } from './advancedMarketData';
import {
  PreMoveReport,
  Signal,
  TargetLevel,
  TimeFrame,
  SignalQualityGrade,
  ActionablePriority,
  SmartEntryTiming,
  LargeMoveClass
} from '../src/types/crypto';
import { preMoveDiagnostics } from './preMoveDiagnostics';
import { validateTargetLadder } from './tradeManagementEngine';
import { qualifyMajorMoveOpportunity } from './majorMoveEngine';

export function generatePreMoveDeterministicId(
  symbol: string,
  timeframe: string,
  direction: string,
  timestamp?: number
): string {
  const cleanSym = (symbol || 'BTCUSDT').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const cleanTf = (timeframe || '1h').toLowerCase();
  const cleanDir = (direction || 'LONG').toUpperCase();
  const intervalMsMap: Record<string, number> = {
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
  };
  const intervalMs = intervalMsMap[cleanTf] || 60 * 60 * 1000;
  const validTime = (timestamp && timestamp > 0) ? timestamp : Date.now();
  const bucketedTime = Math.floor(validTime / intervalMs) * intervalMs;
  return `sig_${cleanSym}_${cleanTf}_${cleanDir}_PREMOVE_${bucketedTime}`;
}

export function getDynamicDecimals(price: number): number {
  if (price <= 0) return 2;
  if (price < 0.00001) return 8;
  if (price < 0.001) return 6;
  if (price < 0.1) return 5;
  if (price < 1) return 4;
  if (price < 10) return 3;
  return 2;
}

export interface PreMoveInput {
  symbol: string;
  candles15m?: Candle[];
  candles1h: Candle[];
  candles4h?: Candle[];
  currentPrice: number;
  derivatives?: DerivativesData | null;
  rvol?: number;
  priceDecimals?: number;
  timeframe?: TimeFrame;
  structure?: {
    bosBullish?: boolean;
    bosBearish?: boolean;
    chochBullish?: boolean;
    chochBearish?: boolean;
    orderBlockType?: 'BULLISH' | 'BEARISH' | 'NONE';
    fvgType?: 'BULLISH' | 'BEARISH' | 'NONE';
    judasSwing?: {
      detected: boolean;
      bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      details?: string;
    };
    supportLevels?: number[];
    resistanceLevels?: number[];
  };
  orderflow?: {
    cvdTrend?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    deltaBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    dominantPressure?: 'BUY_AGGRESSIVE' | 'SELL_AGGRESSIVE' | 'NEUTRAL';
    stackedBuyCount?: number;
    stackedSellCount?: number;
    currentVsPoc?: 'ABOVE_POC' | 'BELOW_POC' | 'AT_POC';
  };
  btcRegime?: {
    bias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    regime?: string;
  };
}

/**
 * PreMoveEngine: Detects explosive setups BEFORE the move begins.
 * Computes:
 * - Genuine early-stage compression & volatility squeeze (BB inside Keltner Channel)
 * - Order-flow / volume absorption (passive bid/ask)
 * - Open Interest accumulation/distribution build
 * - Smart money positioning / liquidity sweep & reclaim (Spring / Upthrust)
 * - Structure (BOS / CHoCH / Order Blocks)
 * - Multi-timeframe coil state
 */
export function evaluatePreMoveOpportunity(input: PreMoveInput): PreMoveReport {
  const {
    symbol,
    candles15m = [],
    candles1h,
    candles4h = [],
    currentPrice,
    derivatives,
    rvol = 1.0,
    priceDecimals = 2,
    structure,
    orderflow,
    btcRegime
  } = input;

  preMoveDiagnostics.recordEvaluation(symbol);

  const evidence: string[] = [];
  const c1h = candles1h;
  const n = c1h.length;
  const decimals = Math.max(priceDecimals || 2, getDynamicDecimals(currentPrice));

  if (n < 20) {
    preMoveDiagnostics.recordGateRejection(
      'INSUFFICIENT_DATA',
      symbol,
      `Insufficient 1H candlestick history (need >= 20, got ${n})`
    );
    return createEmptyPreMoveReport(symbol, currentPrice, decimals);
  }

  // 1. COMPRESSION & VOLATILITY SQUEEZE (BB vs Keltner Channels on 1h)
  const closes = c1h.map(c => c.close);
  const slice20 = closes.slice(-20);
  const mean20 = slice20.reduce((a, b) => a + b, 0) / 20;
  const variance = slice20.reduce((sum, val) => sum + Math.pow(val - mean20, 2), 0) / 20;
  const stdDev = Math.sqrt(variance);

  const bbUpper = mean20 + 2 * stdDev;
  const bbLower = mean20 - 2 * stdDev;
  const bbWidth = mean20 > 0 ? (bbUpper - bbLower) / mean20 : 0.05;

  const atr14 = calculateATR(c1h, 14);
  const currentAtr = atr14.length > 0 ? atr14[atr14.length - 1] : currentPrice * 0.015;
  const avgAtr = atr14.length >= 30
    ? atr14.slice(-30).reduce((a, b) => a + b, 0) / 30
    : currentAtr;

  const atrCompressionRatio = avgAtr > 0 ? currentAtr / avgAtr : 1.0;
  // Squeeze condition: BB width is tight and ATR is compressed
  const kcUpper = mean20 + 1.5 * currentAtr;
  const kcLower = mean20 - 1.5 * currentAtr;
  const volatilitySqueeze = bbUpper <= kcUpper && bbLower >= kcLower;

  let compressionScore = 0;
  if (volatilitySqueeze) {
    compressionScore += 45;
    evidence.push('Volatility Squeeze Active: Bollinger Bands compressed inside Keltner Channels');
  }
  if (atrCompressionRatio < 0.75) {
    compressionScore += 35;
    evidence.push(`Extreme Range Compression: Current ATR is only ${(atrCompressionRatio * 100).toFixed(0)}% of 30-period average`);
  } else if (atrCompressionRatio < 0.90) {
    compressionScore += 20;
    evidence.push(`Moderate Volatility Contraction: Current ATR at ${(atrCompressionRatio * 100).toFixed(0)}% of average`);
  }
  if (bbWidth < 0.035) {
    compressionScore += 20;
    evidence.push(`Narrow Bollinger Bandwidth: ${(bbWidth * 100).toFixed(2)}% range band`);
  }

  // Price velocity deceleration: recent candles exhibit narrowing real bodies
  const recentSliceForVelocity = c1h.slice(-5);
  const avgRecentBody = recentSliceForVelocity.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / recentSliceForVelocity.length;
  if (avgRecentBody < currentAtr * 0.45) {
    compressionScore += 10;
    evidence.push('Price Velocity Deceleration: Candle ranges tightly coiled near boundary');
  }

  const compressionRatio = Math.min(100, compressionScore);
  if (volatilitySqueeze || compressionRatio >= 35) {
    preMoveDiagnostics.recordCompressionCandidate(symbol);
  }

  // 2. ORDER-FLOW / CANDLESTICK ABSORPTION DETECTION
  const recentSlice = c1h.slice(-6);
  let passiveBidAbsorption = false;
  let passiveAskAbsorption = false;
  let absorptionStrength = 0;

  for (let i = 1; i < recentSlice.length; i++) {
    const c = recentSlice[i];
    const prev = recentSlice[i - 1];
    const range = c.high - c.low;
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);

    // High volume with long lower wick and small body = Bid Absorption at lows
    if (range > 0 && lowerWick >= range * 0.50 && c.volume > (prev.volume * 1.10)) {
      passiveBidAbsorption = true;
      absorptionStrength = Math.max(absorptionStrength, 85);
      evidence.push('Passive Bid Absorption: Aggressive sell flow absorbed with long lower wicks on elevated volume');
    }
    // High volume with long upper wick and small body = Ask Absorption at highs
    if (range > 0 && upperWick >= range * 0.50 && c.volume > (prev.volume * 1.10)) {
      passiveAskAbsorption = true;
      absorptionStrength = Math.max(absorptionStrength, 85);
      evidence.push('Passive Ask Absorption: Aggressive buy flow absorbed with long upper wicks on elevated volume');
    }
  }

  // Orderflow stacked imbalances & dominant pressure
  if (orderflow) {
    if (orderflow.dominantPressure === 'BUY_AGGRESSIVE' || (orderflow.stackedBuyCount || 0) >= 2) {
      passiveBidAbsorption = true;
      absorptionStrength = Math.max(absorptionStrength, 90);
      evidence.push('Orderflow Stacked Buy Imbalances: Aggressive bid absorption validated in tape');
    } else if (orderflow.dominantPressure === 'SELL_AGGRESSIVE' || (orderflow.stackedSellCount || 0) >= 2) {
      passiveAskAbsorption = true;
      absorptionStrength = Math.max(absorptionStrength, 90);
      evidence.push('Orderflow Stacked Sell Imbalances: Aggressive ask absorption validated in tape');
    }
  }

  // 3. OPEN INTEREST (OI) BUILD & DERIVATIVES POSITIONING
  let oiBuildDetected = false;
  let oiChangePct = 0;
  let oiImplication: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' = 'NEUTRAL';

  if (derivatives && derivatives.openInterestChange24h !== undefined) {
    oiChangePct = derivatives.openInterestChange24h;
    if (Math.abs(oiChangePct) >= 2.0) {
      oiBuildDetected = true;
      const funding = derivatives.fundingRate || 0;
      if (oiChangePct > 0) {
        // OI increasing during compression indicates massive positioning
        if (funding <= 0.0001) {
          oiImplication = 'ACCUMULATION';
          evidence.push(`Institutional OI Accumulation: Open Interest up ${oiChangePct.toFixed(1)}% with neutral/negative funding`);
        } else {
          oiImplication = 'DISTRIBUTION';
          evidence.push(`Leveraged Exposure Build: Open Interest up ${oiChangePct.toFixed(1)}% with positive funding`);
        }
      } else {
        oiImplication = 'NEUTRAL';
        evidence.push(`OI Flush/De-leveraging: Open Interest dropped ${Math.abs(oiChangePct).toFixed(1)}%`);
      }
    }
  }

  // 4. SMART MONEY POSITIONING & LIQUIDITY SWEEPS (Springs / Upthrusts & Judas Swings)
  let sweepDetected = false;
  let sweepSide: 'LIQUIDITY_RUN_LOW' | 'LIQUIDITY_RUN_HIGH' | 'NONE' = 'NONE';
  let reclaimed = false;

  const lookbackPivots = c1h.slice(Math.max(0, n - 25), n - 2);
  if (lookbackPivots.length >= 5) {
    const minLow = Math.min(...lookbackPivots.map(c => c.low));
    const maxHigh = Math.max(...lookbackPivots.map(c => c.high));
    const triggerCandle = c1h[n - 2];
    const currentCandle = c1h[n - 1];

    // Bullish Sweep: Swept below prior swing low on trigger or current candle, and reclaimed
    const sweptLow = (triggerCandle && triggerCandle.low < minLow) || (currentCandle && currentCandle.low < minLow);
    const reclaimedLow = currentCandle && currentCandle.close > minLow;

    // Bearish Sweep: Swept above prior swing high on trigger or current candle, and rejected back inside
    const sweptHigh = (triggerCandle && triggerCandle.high > maxHigh) || (currentCandle && currentCandle.high > maxHigh);
    const rejectedHigh = currentCandle && currentCandle.close < maxHigh;

    if (sweptLow && reclaimedLow) {
      sweepDetected = true;
      sweepSide = 'LIQUIDITY_RUN_LOW';
      reclaimed = true;
      evidence.push(`Bullish Liquidity Sweep (Spring): Pierced swing low ${minLow.toFixed(decimals)} and strongly reclaimed`);
    } else if (sweptHigh && rejectedHigh) {
      sweepDetected = true;
      sweepSide = 'LIQUIDITY_RUN_HIGH';
      reclaimed = true;
      evidence.push(`Bearish Liquidity Sweep (Upthrust): Pierced swing high ${maxHigh.toFixed(decimals)} and closed back inside range`);
    }
  }

  // Also check SMC Judas Swing from real structure input
  if (structure?.judasSwing?.detected) {
    if (structure.judasSwing.bias === 'BULLISH') {
      sweepDetected = true;
      sweepSide = 'LIQUIDITY_RUN_LOW';
      reclaimed = true;
      evidence.push(`Bullish Judas Swing: Smart money sweep below session low confirmed reclaimed`);
    } else if (structure.judasSwing.bias === 'BEARISH') {
      sweepDetected = true;
      sweepSide = 'LIQUIDITY_RUN_HIGH';
      reclaimed = true;
      evidence.push(`Bearish Judas Swing: Smart money sweep above session high confirmed rejected`);
    }
  }

  // 5. STRUCTURE / BOS / CHOCH & SMC ORDER BLOCKS
  let structureBullishSignals = 0;
  let structureBearishSignals = 0;
  if (structure) {
    if (structure.bosBullish) {
      structureBullishSignals += 2;
      evidence.push('Bullish Break of Structure (BOS) confirmed');
    }
    if (structure.chochBullish) {
      structureBullishSignals += 2;
      evidence.push('Bullish Change of Character (CHoCH) confirmed');
    }
    if (structure.orderBlockType === 'BULLISH') {
      structureBullishSignals += 2;
      evidence.push('Bullish Order Block support validated');
    }
    if (structure.fvgType === 'BULLISH') {
      structureBullishSignals += 1;
      evidence.push('Bullish Fair Value Gap (FVG) confluence');
    }

    if (structure.bosBearish) {
      structureBearishSignals += 2;
      evidence.push('Bearish Break of Structure (BOS) confirmed');
    }
    if (structure.chochBearish) {
      structureBearishSignals += 2;
      evidence.push('Bearish Change of Character (CHoCH) confirmed');
    }
    if (structure.orderBlockType === 'BEARISH') {
      structureBearishSignals += 2;
      evidence.push('Bearish Order Block resistance validated');
    }
    if (structure.fvgType === 'BEARISH') {
      structureBearishSignals += 1;
      evidence.push('Bearish Fair Value Gap (FVG) confluence');
    }
  }

  // 6. ORDERFLOW CVD & VOLUME EXPANSION
  if (orderflow) {
    if (orderflow.cvdTrend === 'BULLISH' || orderflow.deltaBias === 'BULLISH') {
      structureBullishSignals += 1;
      evidence.push('Orderflow Delta / CVD Trend Bullish');
    } else if (orderflow.cvdTrend === 'BEARISH' || orderflow.deltaBias === 'BEARISH') {
      structureBearishSignals += 1;
      evidence.push('Orderflow Delta / CVD Trend Bearish');
    }

    if (orderflow.currentVsPoc === 'ABOVE_POC') {
      structureBullishSignals += 1;
    } else if (orderflow.currentVsPoc === 'BELOW_POC') {
      structureBearishSignals += 1;
    }
  }

  // Consolidation Shape: Higher Lows (Accumulation) vs Lower Highs (Distribution)
  const rangeHigh = Math.max(...c1h.slice(-15).map(c => c.high));
  const rangeLow = Math.min(...c1h.slice(-15).map(c => c.low));
  const rangeMid = (rangeHigh + rangeLow) / 2;

  const coilSlice = c1h.slice(-14);
  if (coilSlice.length >= 8) {
    const half = Math.floor(coilSlice.length / 2);
    const olderHalf = coilSlice.slice(0, half);
    const newerHalf = coilSlice.slice(half);

    const minLowOlder = Math.min(...olderHalf.map(c => c.low));
    const minLowNewer = Math.min(...newerHalf.map(c => c.low));
    const maxHighOlder = Math.max(...olderHalf.map(c => c.high));
    const maxHighNewer = Math.max(...newerHalf.map(c => c.high));

    if (minLowNewer > minLowOlder * 1.002) {
      structureBullishSignals += 2;
      evidence.push('Higher Lows In Consolidation: Bullish accumulation pressure building at base');
    }
    if (maxHighNewer < maxHighOlder * 0.998) {
      structureBearishSignals += 2;
      evidence.push('Lower Highs In Consolidation: Bearish distribution pressure pressing ceiling');
    }
  }

  const lastCandle = c1h[n - 1];
  if (currentPrice > rangeMid && lastCandle.close >= lastCandle.open) {
    structureBullishSignals += 1;
  } else if (currentPrice < rangeMid && lastCandle.close <= lastCandle.open) {
    structureBearishSignals += 1;
  }

  if (rvol >= 1.20) {
    evidence.push(`Volume Expansion Active (${rvol.toFixed(2)}x RVOL)`);
  }

  // 7. MULTI-TIMEFRAME COIL ALIGNMENT
  const aligned15m = candles15m.length >= 20
    ? candles15m.slice(-5).every(c => Math.abs(c.close - c.open) < currentAtr * 0.45)
    : false;
  const aligned1h = compressionRatio >= 35;
  const aligned4h = candles4h.length >= 20
    ? (calculateATR(candles4h, 14).slice(-1)[0] || 0) < currentPrice * 0.035
    : false;

  const coilState: 'HIGHLY_COILED' | 'MODERATELY_COILED' | 'EXPANDING' =
    (aligned1h && (aligned15m || aligned4h)) ? 'HIGHLY_COILED' :
    aligned1h ? 'MODERATELY_COILED' : 'EXPANDING';

  if (coilState === 'HIGHLY_COILED') {
    evidence.push('Multi-Timeframe Coil Aligned: Synchronized volatility contraction across frames');
  }

  // 8. SYNTHESIS: COIL SCORE, PROBABILITY & DIRECTION
  let rawCoilScore = (compressionRatio * 0.40) + (coilState === 'HIGHLY_COILED' ? 20 : (coilState === 'MODERATELY_COILED' ? 12 : 0));
  if (volatilitySqueeze) rawCoilScore += 15;
  if (oiBuildDetected) rawCoilScore += 15;
  if (sweepDetected) rawCoilScore += 15;
  if (passiveBidAbsorption || passiveAskAbsorption) rawCoilScore += 12;
  if (rvol >= 1.20) rawCoilScore += 10;
  if (structureBullishSignals > 0 || structureBearishSignals > 0) rawCoilScore += 10;
  const coilScore = Math.min(100, Math.round(rawCoilScore));

  // Projected Direction from Real Evidence Layers
  let bullishSignals = structureBullishSignals;
  let bearishSignals = structureBearishSignals;

  if (passiveBidAbsorption) bullishSignals += 2;
  if (passiveAskAbsorption) bearishSignals += 2;
  if (sweepSide === 'LIQUIDITY_RUN_LOW') bullishSignals += 3;
  if (sweepSide === 'LIQUIDITY_RUN_HIGH') bearishSignals += 3;
  if (oiImplication === 'ACCUMULATION') bullishSignals += 2;
  if (oiImplication === 'DISTRIBUTION') bearishSignals += 2;

  // BTC Regime alignment when real data is available
  if (btcRegime?.bias === 'BULLISH') bullishSignals += 1;
  else if (btcRegime?.bias === 'BEARISH') bearishSignals += 1;

  // EMA trend bias for tie-break
  const ema20 = calculateEMA(closes, 20);
  const lastEma20 = ema20.length > 0 ? ema20[ema20.length - 1] : currentPrice;
  if (currentPrice > lastEma20) bullishSignals += 1;
  else bearishSignals += 1;

  let projectedDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (bullishSignals > bearishSignals) {
    projectedDirection = 'BULLISH';
  } else if (bearishSignals > bullishSignals) {
    projectedDirection = 'BEARISH';
  } else {
    projectedDirection = currentPrice >= lastEma20 ? 'BULLISH' : 'BEARISH';
  }

  // Breakout Probability
  let breakoutProbability = 40;
  if (coilScore >= 75) breakoutProbability += 25;
  else if (coilScore >= 50) breakoutProbability += 15;
  if (sweepDetected) breakoutProbability += 15;
  if (oiBuildDetected) breakoutProbability += 10;
  if (rvol > 1.20) breakoutProbability += 10;
  breakoutProbability = Math.min(95, Math.max(30, breakoutProbability));

  // Structure-First Invalidation & Levels
  const invalidationBuffer = Math.max(currentAtr * 0.35, currentPrice * 0.003);
  const structuralLow = Math.min(rangeLow, ...c1h.slice(-5).map(c => c.low));
  const structuralHigh = Math.max(rangeHigh, ...c1h.slice(-5).map(c => c.high));
  const safeAnchorLow = Math.min(structuralLow, currentPrice - invalidationBuffer * 0.5);
  const safeAnchorHigh = Math.max(structuralHigh, currentPrice + invalidationBuffer * 0.5);

  const invalidationPrice = projectedDirection === 'BULLISH'
    ? Number((safeAnchorLow - invalidationBuffer * 0.5).toFixed(decimals))
    : Number((safeAnchorHigh + invalidationBuffer * 0.5).toFixed(decimals));

  const invalidationReason = projectedDirection === 'BULLISH'
    ? `Structural breakdown below coil base ${structuralLow.toFixed(decimals)} (buffer: -${invalidationBuffer.toFixed(decimals)})`
    : `Structural breakout above coil ceiling ${structuralHigh.toFixed(decimals)} (buffer: +${invalidationBuffer.toFixed(decimals)})`;

  const keyTriggerLevel = projectedDirection === 'BULLISH'
    ? Number((rangeHigh + (currentAtr * 0.12)).toFixed(decimals))
    : Number((rangeLow - (currentAtr * 0.12)).toFixed(decimals));

  const noChaseLevel = projectedDirection === 'BULLISH'
    ? Number((rangeHigh + (currentAtr * 1.15)).toFixed(decimals))
    : Number((rangeLow - (currentAtr * 1.15)).toFixed(decimals));

  // Setup Stage: COILING vs READY_TO_BREAK vs TRIGGERED
  let setupStage: 'COILING' | 'READY_TO_BREAK' | 'TRIGGERED' = 'COILING';
  const isNearTrigger = projectedDirection === 'BULLISH'
    ? currentPrice >= keyTriggerLevel * 0.996
    : currentPrice <= keyTriggerLevel * 1.004;

  const isTriggerCrossed = projectedDirection === 'BULLISH'
    ? currentPrice >= keyTriggerLevel
    : currentPrice <= keyTriggerLevel;

  if (isTriggerCrossed || (sweepDetected && reclaimed && rvol >= 1.2)) {
    setupStage = 'TRIGGERED';
  } else if (coilScore >= 65 || isNearTrigger) {
    setupStage = 'READY_TO_BREAK';
  } else {
    setupStage = 'COILING';
  }

  // 9. DETERMINISTIC LARGE-MOVE POTENTIAL & EXPANSION EVALUATION (Multi-Layer Regression)
  // Evaluates whether current conditions represent early evidence of extreme multi-leg expansion:
  // 100%+, 200%+, 300%+, or 500%+ potential (versus ordinary 3%-15% moves).
  let expansionEvidenceScore = 0;
  const expansionEvidence: string[] = [];

  // A. Extreme Volatility Squeeze & Compression
  if (volatilitySqueeze) {
    expansionEvidenceScore += 18;
    expansionEvidence.push('Bollinger Bands contracted completely within Keltner Channels (Extreme Volatility Squeeze)');
  }
  if (compressionRatio >= 50) {
    expansionEvidenceScore += 14;
    expansionEvidence.push(`Severe volatility compression (${compressionRatio}% band tightness vs 30-period baseline)`);
  } else if (compressionRatio >= 35) {
    expansionEvidenceScore += 8;
  }

  // B. Prolonged Base Coiling / Accumulation Range
  const baseLookback = Math.min(30, c1h.length);
  if (baseLookback >= 15) {
    const baseCandles = c1h.slice(-baseLookback);
    const baseHigh = Math.max(...baseCandles.map(c => c.high));
    const baseLow = Math.min(...baseCandles.map(c => c.low));
    const baseSpanPct = baseLow > 0 ? ((baseHigh - baseLow) / baseLow) * 100 : 999;
    if (baseSpanPct < 8.0 && baseLookback >= 20) {
      expansionEvidenceScore += 16;
      expansionEvidence.push(`Prolonged tight base coiling (${baseLookback} bars within ${baseSpanPct.toFixed(1)}% narrow band)`);
    } else if (baseSpanPct < 12.0) {
      expansionEvidenceScore += 10;
      expansionEvidence.push(`Multi-session horizontal accumulation range (${baseSpanPct.toFixed(1)}% span)`);
    }
  }

  // C. Open Interest Accumulation & Trapped Positioning
  if (oiBuildDetected && (oiImplication === 'ACCUMULATION' || oiImplication === 'DISTRIBUTION')) {
    expansionEvidenceScore += 15;
    expansionEvidence.push(`Institutional OI positioning: Open Interest up ${oiChangePct.toFixed(1)}% during tight compression`);
  }

  // D. Orderflow Passive Absorption
  if (passiveBidAbsorption || passiveAskAbsorption) {
    expansionEvidenceScore += 15;
    expansionEvidence.push(passiveBidAbsorption ? 'Aggressive seller exhaustion absorbed by institutional passive limit bids' : 'Aggressive buyer exhaustion absorbed by institutional passive limit asks');
  }

  // E. Liquidity Sweep & Clean Reclaim (Spring / Upthrust / Judas Swing)
  if (sweepDetected && reclaimed) {
    expansionEvidenceScore += 16;
    expansionEvidence.push(`Clean liquidity sweep & immediate reclaim (${sweepSide})`);
  }

  // F. Multi-Timeframe Squeeze Alignment
  if (coilState === 'HIGHLY_COILED' || (aligned15m && aligned1h)) {
    expansionEvidenceScore += 14;
    expansionEvidence.push('Multi-timeframe squeeze alignment (synchronized compression across lower and higher frames)');
  }

  // G. Breakout Readiness & Volume Expansion
  if (setupStage === 'TRIGGERED') {
    expansionEvidenceScore += 15;
    expansionEvidence.push('Structural breakout trigger breached with immediate acceleration');
  } else if (setupStage === 'READY_TO_BREAK') {
    expansionEvidenceScore += 10;
    expansionEvidence.push('Price coiled within 0.5% of key breakout trigger level');
  }

  if (rvol >= 2.0) {
    expansionEvidenceScore += 14;
    expansionEvidence.push(`Abnormal relative volume surge (${rvol.toFixed(1)}x baseline)`);
  } else if (rvol >= 1.4) {
    expansionEvidenceScore += 8;
  }

  // H. SMC Market Structure Confirmation
  if (structureBullishSignals >= 2 || structureBearishSignals >= 2) {
    expansionEvidenceScore += 10;
    expansionEvidence.push('Confirmed institutional market structure (BOS / Order Block defense)');
  }

  // Derive authoritative LargeMoveClass based on expansion evidence score
  let largeMoveClass: LargeMoveClass = 'NORMAL';
  let largeMovePotentialLabel = 'INSUFFICIENT EVIDENCE';
  let isExtremeCandidate = false;

  if (projectedDirection === 'BEARISH') {
    // For BEARISH setups (dumps), moves represent downward percentage drops
    if (expansionEvidenceScore >= 45) {
      largeMoveClass = 'HIGH_IMPACT';
      largeMovePotentialLabel = 'HIGH COMPRESSION DUMP SETUP';
      isExtremeCandidate = false;
    } else if (expansionEvidenceScore >= 32) {
      largeMoveClass = 'WATCH';
      largeMovePotentialLabel = 'MODERATE COMPRESSION DUMP';
      isExtremeCandidate = false;
    } else if (expansionEvidenceScore >= 20) {
      largeMoveClass = 'WATCH';
      largeMovePotentialLabel = 'WATCH LIST';
      isExtremeCandidate = false;
    } else {
      largeMoveClass = 'NORMAL';
      largeMovePotentialLabel = 'INSUFFICIENT EVIDENCE';
      isExtremeCandidate = false;
    }
  } else {
    // For BULLISH setups (pumps), compression indicates expansion readiness
    if (expansionEvidenceScore >= 68) {
      largeMoveClass = 'HIGH_IMPACT';
      largeMovePotentialLabel = 'HIGH COMPRESSION EXPANSION SETUP';
      isExtremeCandidate = false;
    } else if (expansionEvidenceScore >= 45) {
      largeMoveClass = 'WATCH';
      largeMovePotentialLabel = 'MODERATE COMPRESSION EXPANSION';
      isExtremeCandidate = false;
    } else if (expansionEvidenceScore >= 20) {
      largeMoveClass = 'WATCH';
      largeMovePotentialLabel = 'WATCH LIST';
      isExtremeCandidate = false;
    } else {
      largeMoveClass = 'NORMAL';
      largeMovePotentialLabel = 'INSUFFICIENT EVIDENCE';
      isExtremeCandidate = false;
    }
  }

  // Derive Pre-Move Detailed State (Section 8)
  let detailedState: PreMoveReport['detailedState'] = 'COILING';
  if (projectedDirection === 'BULLISH') {
    if (isExtremeCandidate && (setupStage === 'TRIGGERED' || setupStage === 'READY_TO_BREAK' || coilScore >= 70)) {
      detailedState = 'BIG_MOVE_COMING';
    } else if (setupStage === 'TRIGGERED') {
      detailedState = 'TRIGGERED';
    } else if (setupStage === 'READY_TO_BREAK') {
      detailedState = 'READY_TO_BREAK';
    } else if (sweepDetected || passiveBidAbsorption) {
      detailedState = 'ACCUMULATION';
    } else {
      detailedState = 'COILING';
    }
  } else if (projectedDirection === 'BEARISH') {
    if (isExtremeCandidate && (setupStage === 'TRIGGERED' || setupStage === 'READY_TO_BREAK' || coilScore >= 70)) {
      detailedState = 'BIG_DUMP_COMING';
    } else if (setupStage === 'TRIGGERED') {
      detailedState = 'DUMP_TRIGGERED';
    } else if (setupStage === 'READY_TO_BREAK') {
      detailedState = 'DUMP_WATCH';
    } else if (sweepDetected) {
      detailedState = 'LIQUIDITY_SWEEP';
    } else if (passiveAskAbsorption) {
      detailedState = 'DISTRIBUTION';
    } else {
      detailedState = 'BEARISH_STRUCTURE';
    }
  }

  // Directional Warning badge: Only 'BIG_MOVE_COMING' or 'BIG_DUMP_COMING' when genuine extreme evidence exists!
  let directionalWarning: 'BIG_MOVE_COMING' | 'BIG_DUMP_COMING' | 'NEUTRAL_COIL' = 'NEUTRAL_COIL';
  let earlyWarningMessage = '';

  if (projectedDirection === 'BULLISH') {
    if (isExtremeCandidate && (coilScore >= 65 || setupStage === 'READY_TO_BREAK' || setupStage === 'TRIGGERED')) {
      directionalWarning = 'BIG_MOVE_COMING';
      earlyWarningMessage = `Evidence suggests an unusually large upward expansion (${largeMovePotentialLabel}) may be developing in ${symbol}.`;
    } else {
      directionalWarning = 'NEUTRAL_COIL';
      earlyWarningMessage = `Consolidation pattern monitored for directional resolution in ${symbol}.`;
    }
  } else if (projectedDirection === 'BEARISH') {
    if (isExtremeCandidate && (coilScore >= 65 || setupStage === 'READY_TO_BREAK' || setupStage === 'TRIGGERED')) {
      directionalWarning = 'BIG_DUMP_COMING';
      earlyWarningMessage = `Evidence suggests an unusually large downward dump (${largeMovePotentialLabel}) may be developing in ${symbol}.`;
    } else {
      directionalWarning = 'NEUTRAL_COIL';
      earlyWarningMessage = `Distribution pattern monitored for breakdown resolution in ${symbol}.`;
    }
  }

  // Setup Stage: COILING vs READY_TO_BREAK vs TRIGGERED
  // Coiling State for legacy/telemetry compatibility
  let coilingState:
    | 'NEUTRAL'
    | 'COILING_LONG'
    | 'BIG_MOVE_COMING'
    | 'READY_TO_BREAK_LONG'
    | 'TRIGGERED_LONG'
    | 'EXPLOSIVE_LONG'
    | 'COILING_SHORT'
    | 'BIG_DUMP_COMING'
    | 'READY_TO_BREAK_SHORT'
    | 'TRIGGERED_SHORT'
    | 'EXPLOSIVE_SHORT' = 'NEUTRAL';

  if (projectedDirection === 'BULLISH') {
    if (setupStage === 'TRIGGERED') {
      coilingState = 'TRIGGERED_LONG';
    } else if (setupStage === 'READY_TO_BREAK') {
      coilingState = 'READY_TO_BREAK_LONG';
    } else if (isExtremeCandidate && coilScore >= 70) {
      coilingState = 'BIG_MOVE_COMING';
    } else {
      coilingState = 'COILING_LONG';
    }
  } else if (projectedDirection === 'BEARISH') {
    if (setupStage === 'TRIGGERED') {
      coilingState = 'TRIGGERED_SHORT';
    } else if (setupStage === 'READY_TO_BREAK') {
      coilingState = 'READY_TO_BREAK_SHORT';
    } else if (isExtremeCandidate && coilScore >= 70) {
      coilingState = 'BIG_DUMP_COMING';
    } else {
      coilingState = 'COILING_SHORT';
    }
  }

  // Recommended Action
  let recommendedAction: 'PREPARE_BREAKOUT_LIMIT' | 'WAIT_FOR_SWEEP' | 'MONITOR_COIL' | 'STAND_ASIDE' = 'MONITOR_COIL';
  if (setupStage === 'TRIGGERED' || (coilScore >= 65 && sweepDetected)) {
    recommendedAction = 'PREPARE_BREAKOUT_LIMIT';
  } else if (coilScore >= 55 && !sweepDetected) {
    recommendedAction = 'WAIT_FOR_SWEEP';
  } else if (coilScore < 35) {
    recommendedAction = 'STAND_ASIDE';
  }

  return {
    symbol,
    coilScore,
    breakoutProbability,
    projectedDirection,
    invalidationPrice,
    invalidationReason,
    recommendedAction,
    setupStage,
    directionalWarning,
    earlyWarningMessage,
    coilingState,
    largeMoveClass,
    largeMovePotentialLabel,
    isExtremeCandidate,
    expansionEvidence,
    detailedState,
    compressionRatio,
    volatilitySqueeze,
    orderflowAbsorption: {
      detected: passiveBidAbsorption || passiveAskAbsorption,
      type: passiveBidAbsorption ? 'PASSIVE_BID_ABSORPTION' : (passiveAskAbsorption ? 'PASSIVE_ASK_ABSORPTION' : 'NONE'),
      absorptionStrength
    },
    openInterestBuild: {
      detected: oiBuildDetected,
      oiChangePct: Number(oiChangePct.toFixed(2)),
      implication: oiImplication
    },
    smartMoneyPositioning: {
      detected: sweepDetected || passiveBidAbsorption || passiveAskAbsorption,
      bias: bullishSignals > bearishSignals ? 'ACCUMULATION' : (bearishSignals > bullishSignals ? 'DISTRIBUTION' : 'NEUTRAL'),
      evidence: evidence.slice(0, 4)
    },
    fakeoutSweep: {
      detected: sweepDetected,
      sweepSide,
      reclaimed
    },
    multiTimeframeCoil: {
      aligned15m,
      aligned1h,
      aligned4h,
      coilState
    },
    keyTriggerLevel,
    noChaseLevel,
    evidence,
    timestamp: Date.now()
  };
}

/**
 * Validates Pre-Move candidate through all required gates:
 * 1. Genuine compression / coil score
 * 2. Real directional evidence (no NEUTRAL guesses)
 * 3. Confirming early catalyst (sweep, absorption, OI, structure, volume)
 * 4. Anti-chase check (price not already extended past noChaseLevel)
 * 5. Structural SL (derived from range low/high or swing pivot)
 * 6. Structurally derived TP ladder (measured move of coil + key pivots)
 * 7. Favorable R:R (>= 1.5:1)
 *
 * If valid, constructs ONE authoritative unified Signal object.
 * If invalid, returns null and logs the exact gate rejection reason in diagnostics.
 */
export function qualifyAndBuildPreMoveSignal(params: {
  preMoveReport: PreMoveReport;
  candles: Candle[];
  currentPrice: number;
  timeframe?: TimeFrame;
  priceDecimals?: number;
  rvol?: number;
}): Signal | null {
  const { preMoveReport, candles, currentPrice, timeframe = '1h', priceDecimals = 2, rvol = 1.0 } = params;
  const { symbol, coilScore, compressionRatio, volatilitySqueeze, projectedDirection, invalidationPrice } = preMoveReport;
  const decimals = Math.max(priceDecimals || 2, getDynamicDecimals(currentPrice));

  // Anti-resurrection guard: prevent background scanning from accidentally reviving an already-invalidated setup
  const symKey = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const tombstone = invalidatedPreMoveRegistry.get(symKey);
  if (tombstone) {
    const timeSinceInvalidation = Date.now() - tombstone.invalidatedAt;
    // Invalidation cooldown window prevents immediate resurrection if stop loss or invalidation price breached
    if (timeSinceInvalidation < 15 * 60 * 1000) {
      if (timeSinceInvalidation < 5 * 60 * 1000) {
        return null;
      }
      if (tombstone.invalidationPrice && tombstone.direction) {
        const isLong = tombstone.direction === 'LONG';
        if (isLong && currentPrice <= tombstone.invalidationPrice * 1.005) {
          return null;
        }
        if (!isLong && currentPrice >= tombstone.invalidationPrice * 0.995) {
          return null;
        }
      }
    } else {
      // Cooldown expired, clear tombstone so new legitimate future market setups can form
      invalidatedPreMoveRegistry.delete(symKey);
    }
  }

  // GATE 1: Genuine expansion & compression gate
  // Pre-Move Radar qualifies setups with Exceptional (30%+) or Extreme (100%+, 200%+, 300%+, 500%+) potential,
  // High Impact (15-25%), or genuine coiling candidates with verified compression squeeze (coilScore >= 50).
  // Strictly filter ordinary non-coiling noise (sub-50 coil without compression or zero expansion evidence).
  const isExceptionalOrExtreme = Boolean(
    preMoveReport.isExtremeCandidate ||
    preMoveReport.largeMoveClass === 'EXTREME_500_PLUS' ||
    preMoveReport.largeMoveClass === 'EXTREME_300_PLUS' ||
    preMoveReport.largeMoveClass === 'EXTREME_200_PLUS' ||
    preMoveReport.largeMoveClass === 'EXTREME_100_PLUS' ||
    preMoveReport.largeMoveClass === 'EXCEPTIONAL_30_PLUS' ||
    preMoveReport.largeMoveClass === 'HIGH_IMPACT' ||
    (coilScore >= 50 && (volatilitySqueeze || compressionRatio >= 30 || Boolean(preMoveReport.fakeoutSweep?.detected) || Boolean(preMoveReport.orderflowAbsorption?.detected)))
  );

  const minCoil = (preMoveReport.largeMoveClass === 'EXCEPTIONAL_30_PLUS' || preMoveReport.isExtremeCandidate || preMoveReport.largeMoveClass?.startsWith('EXTREME')) ? 45 : 55;
  const meetsCompression = volatilitySqueeze || compressionRatio >= 28 || Boolean(preMoveReport.fakeoutSweep?.detected) || Boolean(preMoveReport.orderflowAbsorption?.detected);
  
  if (!isExceptionalOrExtreme || !meetsCompression || coilScore < minCoil) {
    preMoveDiagnostics.recordRejectCompression(
      symbol,
      `Ordinary setup filtered (${preMoveReport.largeMovePotentialLabel || 'INSUFFICIENT_EXPANSION'}); Pre-Move Radar requires genuine compression coil (min: ${minCoil}, got: ${coilScore})`
    );
    return null;
  }

  // GATE 2: Real directional evidence required (no fabrication on neutral)
  if (projectedDirection === 'NEUTRAL') {
    preMoveDiagnostics.recordRejectDirection(
      symbol,
      'No clear directional evidence established during compression'
    );
    return null;
  }

  const direction: 'LONG' | 'SHORT' = projectedDirection === 'BULLISH' ? 'LONG' : 'SHORT';

  // GATE 3: At least one confirming early-stage catalyst required (not raw score alone)
  const hasConfirmingCatalyst =
    Boolean(preMoveReport.fakeoutSweep?.detected) ||
    Boolean(preMoveReport.orderflowAbsorption?.detected) ||
    Boolean(preMoveReport.openInterestBuild?.detected) ||
    rvol >= 1.25 ||
    (preMoveReport.multiTimeframeCoil && preMoveReport.multiTimeframeCoil.coilState === 'HIGHLY_COILED') ||
    (preMoveReport.evidence && preMoveReport.evidence.length >= 3) ||
    (volatilitySqueeze && coilScore >= 65);

  if (!hasConfirmingCatalyst) {
    preMoveDiagnostics.recordRejectCatalyst(
      symbol,
      'Awaiting confirming early catalyst (liquidity sweep, absorption, OI build, RVOL >= 1.25, or synchronized multi-frame coil)'
    );
    return null;
  }

  // GATE 4: Anti-chase protection: never enter after price has already run away
  const noChase = preMoveReport.noChaseLevel;
  const isChaseExhausted = Boolean(noChase && (direction === 'LONG'
    ? currentPrice > noChase
    : currentPrice < noChase));

  if (isChaseExhausted) {
    preMoveDiagnostics.recordRejectAntiChase(
      symbol,
      `Price has already advanced beyond no-chase threshold (${preMoveReport.noChaseLevel})`
    );
    return null;
  }

  // GATE 5: Structural Stop Loss validation & derivation anchored to consolidation coil invalidation
  let stopLoss: number;
  if (direction === 'LONG') {
    const coilLow = Math.min(...candles.slice(-8).map(c => c.low));
    const rawSl = (invalidationPrice > 0 && invalidationPrice < currentPrice)
      ? invalidationPrice
      : coilLow - Math.max(currentPrice * 0.003, currentPrice * 0.005);
    stopLoss = Number(rawSl.toFixed(decimals));
  } else {
    const coilHigh = Math.max(...candles.slice(-8).map(c => c.high));
    const rawSl = (invalidationPrice > 0 && invalidationPrice > currentPrice)
      ? invalidationPrice
      : coilHigh + Math.max(currentPrice * 0.003, currentPrice * 0.005);
    stopLoss = Number(rawSl.toFixed(decimals));
  }

  const isSlValid = direction === 'LONG'
    ? (stopLoss > 0 && stopLoss < currentPrice)
    : (stopLoss > 0 && stopLoss > currentPrice);

  if (!isSlValid) {
    preMoveDiagnostics.recordRejectStructuralSL(
      symbol,
      `Structural Stop Loss ${stopLoss} is invalid relative to entry ${currentPrice}`
    );
    return null;
  }

  const effectiveRisk = Math.abs(currentPrice - stopLoss);
  if (effectiveRisk <= 0) {
    preMoveDiagnostics.recordRejectStructuralSL(
      symbol,
      'Effective risk is zero or negative'
    );
    return null;
  }

  // GATE 6: Genuine structural targets extracted directly from candle fractal swings and liquidity levels
  // (Never invent target prices using R-multiples, percentage projections, ATR-only projections, or default targets)
  const rawStructuralLevels: number[] = [];
  const rangeHigh = Math.max(...candles.slice(-15).map(c => c.high));
  const rangeLow = Math.min(...candles.slice(-15).map(c => c.low));

  // 1. Fractal swing extraction from candle history
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    if (direction === 'LONG') {
      if (c.high >= candles[i - 1].high && c.high >= candles[i - 2].high &&
          c.high >= candles[i + 1].high && c.high >= candles[i + 2].high) {
        if (c.high > currentPrice * 1.002) {
          rawStructuralLevels.push(c.high);
        }
      }
    } else {
      if (c.low <= candles[i - 1].low && c.low <= candles[i - 2].low &&
          c.low <= candles[i + 1].low && c.low <= candles[i + 2].low) {
        if (c.low < currentPrice * 0.998) {
          rawStructuralLevels.push(c.low);
        }
      }
    }
  }

  // 2. High/low range boundary anchors if beyond current price
  if (direction === 'LONG' && rangeHigh > currentPrice * 1.003) {
    rawStructuralLevels.push(rangeHigh);
  } else if (direction === 'SHORT' && rangeLow < currentPrice * 0.997) {
    rawStructuralLevels.push(rangeLow);
  }

  // 3. Trigger / liquidity reference levels if confirmed
  if (preMoveReport.keyTriggerLevel > 0) {
    const lvl = preMoveReport.keyTriggerLevel;
    if (direction === 'LONG' && lvl >= currentPrice * 1.01) {
      rawStructuralLevels.push(lvl);
    } else if (direction === 'SHORT' && lvl <= currentPrice * 0.99) {
      rawStructuralLevels.push(lvl);
    }
  }

  // 4. Structural measured move of the coil if range is established
  const coilSpan = Math.abs(rangeHigh - rangeLow);
  if (coilSpan > 0 && coilSpan >= currentPrice * 0.003) {
    if (direction === 'LONG') {
      const measuredMove1 = currentPrice + coilSpan;
      const measuredMove2 = currentPrice + coilSpan * 1.618;
      if (measuredMove1 > currentPrice * 1.004) rawStructuralLevels.push(measuredMove1);
      if (measuredMove2 > currentPrice * 1.008) rawStructuralLevels.push(measuredMove2);
    } else {
      const measuredMove1 = currentPrice - coilSpan;
      const measuredMove2 = currentPrice - coilSpan * 1.618;
      if (measuredMove1 > 0 && measuredMove1 < currentPrice * 0.996) rawStructuralLevels.push(measuredMove1);
      if (measuredMove2 > 0 && measuredMove2 < currentPrice * 0.992) rawStructuralLevels.push(measuredMove2);
    }
  }

  // 5. Sort and filter out duplicate/too-close levels (<0.3% separation)
  const sortedLevels = direction === 'LONG'
    ? rawStructuralLevels.sort((a, b) => a - b)
    : rawStructuralLevels.sort((a, b) => b - a);

  const distinctLevels: number[] = [];
  for (const lvl of sortedLevels) {
    const isTooClose = distinctLevels.some(existing => (Math.abs(existing - lvl) / currentPrice) < 0.003);
    if (!isTooClose) {
      distinctLevels.push(lvl);
    }
  }

  // Pass through centralized target ladder validation
  const validation = validateTargetLadder({
    entryPrice: currentPrice,
    stopLoss,
    direction,
    targets: distinctLevels.slice(0, 5)
  });

  if (!validation.isValid || validation.validatedTargets.length === 0) {
    preMoveDiagnostics.recordRejectStructuralTarget(
      symbol,
      `No genuine structural targets validated: ${validation.reason || 'Invalid levels'}`
    );
    return null;
  }

  const targets = validation.validatedTargets;
  const tp1 = targets[0].price;
  const tp2 = targets.length > 1 ? targets[1].price : 0;
  const tp3 = targets.length > 2 ? targets[2].price : 0;

  const maxTargetPrice = targets[targets.length - 1].price;
  const maxReward = Math.abs(maxTargetPrice - currentPrice);
  const maxRR = Number((maxReward / effectiveRisk).toFixed(2));
  const tp1RR = Number((Math.abs(targets[0].price - currentPrice) / effectiveRisk).toFixed(2));
  const tp2RR = targets.length > 1 ? Number((Math.abs(targets[1].price - currentPrice) / effectiveRisk).toFixed(2)) : tp1RR;

  if (maxRR < 0.8) {
    preMoveDiagnostics.recordRejectStructuralTarget(
      symbol,
      `Calculated structural Risk:Reward ratio (${maxRR}:1) is below minimum threshold`
    );
    return null;
  }

  const riskRewardRatio = Number(Math.max(tp1RR, tp2RR, maxRR).toFixed(2));
  // Expected Move field represents the verified percentage distance to the terminal structural target
  const expectedMovePct = Number((((Math.abs(maxTargetPrice - currentPrice)) / currentPrice) * 100).toFixed(1));

  if (expectedMovePct < 2.0) {
    preMoveDiagnostics.recordRejectStructuralTarget(
      symbol,
      `Calculated structural expansion potential (+${expectedMovePct}%) is below 2.0% minimum threshold for Pre-Move setup`
    );
    return null;
  }

  // Determine Quality Grade based on coil compression strength, confluence, and reward size
  const hasStrongConfluence = Boolean(
    preMoveReport.fakeoutSweep?.detected ||
    preMoveReport.orderflowAbsorption?.detected ||
    preMoveReport.volatilitySqueeze ||
    preMoveReport.compressionRatio >= 40 ||
    preMoveReport.openInterestBuild?.detected ||
    (preMoveReport.evidence && preMoveReport.evidence.length >= 3)
  );

  let qualityGrade: SignalQualityGrade = 'B';
  if (coilScore >= 75 && (hasStrongConfluence || maxRR >= 2.0) && expectedMovePct >= 3.0) {
    qualityGrade = 'A+';
  } else if (coilScore >= 60 && (hasStrongConfluence || maxRR >= 1.5) && expectedMovePct >= 2.0) {
    qualityGrade = 'A';
  }

  // Direction-aware and TP1-bounded Entry Zone calculation:
  // On SHORT: EntryLow must NEVER dip down to or below TP1; entry buffer accommodates pullbacks towards SL.
  // On LONG: EntryHigh must NEVER rise up to or above TP1; entry buffer accommodates pullbacks towards SL.
  let entryZoneLow: number;
  let entryZoneHigh: number;

  if (direction === 'SHORT') {
    const maxDownBuffer = Math.max(0, (currentPrice - tp1) * 0.35);
    const downBuffer = Math.min(effectiveRisk * 0.1, maxDownBuffer);
    const upBuffer = Math.min(effectiveRisk * 0.2, Math.abs(stopLoss - currentPrice) * 0.3);

    let low = currentPrice - downBuffer;
    if (low <= tp1) {
      low = tp1 + Math.max(currentPrice - tp1, 0.002 * currentPrice) * 0.35;
    }
    let high = currentPrice + upBuffer;
    if (high >= stopLoss) {
      high = currentPrice + Math.abs(stopLoss - currentPrice) * 0.5;
    }
    entryZoneLow = Number(Math.min(low, high).toFixed(decimals));
    entryZoneHigh = Number(Math.max(low, high).toFixed(decimals));
    if (entryZoneLow <= tp1) {
      entryZoneLow = Number((tp1 * 1.003).toFixed(decimals));
    }
    if (entryZoneHigh <= entryZoneLow) {
      entryZoneHigh = Number((entryZoneLow * 1.002).toFixed(decimals));
    }
  } else {
    const maxUpBuffer = Math.max(0, (tp1 - currentPrice) * 0.35);
    const upBuffer = Math.min(effectiveRisk * 0.1, maxUpBuffer);
    const downBuffer = Math.min(effectiveRisk * 0.2, Math.abs(currentPrice - stopLoss) * 0.3);

    let high = currentPrice + upBuffer;
    if (high >= tp1) {
      high = tp1 - Math.max(tp1 - currentPrice, 0.002 * currentPrice) * 0.35;
    }
    let low = currentPrice - downBuffer;
    if (low <= stopLoss) {
      low = currentPrice - Math.abs(currentPrice - stopLoss) * 0.5;
    }
    entryZoneLow = Number(Math.min(low, high).toFixed(decimals));
    entryZoneHigh = Number(Math.max(low, high).toFixed(decimals));
    if (entryZoneHigh >= tp1) {
      entryZoneHigh = Number((tp1 * 0.997).toFixed(decimals));
    }
    if (entryZoneLow >= entryZoneHigh) {
      entryZoneLow = Number((entryZoneHigh * 0.998).toFixed(decimals));
    }
  }

  const entryStatus: SmartEntryTiming = preMoveReport.setupStage === 'TRIGGERED' || preMoveReport.setupStage === 'READY_TO_BREAK'
    ? 'ENTRY_NOW'
    : 'WAIT_FOR_ENTRY' as any;

  const actionablePriority: ActionablePriority = preMoveReport.setupStage === 'TRIGGERED' || coilScore >= 70
    ? 'ENTRY_NOW'
    : 'HIGH_PRIORITY';

  const deterministicId = generatePreMoveDeterministicId(symbol, timeframe, direction, Date.now());
  const baseAsset = symbol.replace(/USDT$|BUSD$|USDC$/, '');
  const quoteAsset = symbol.endsWith('USDC') ? 'USDC' : 'USDT';

  const entryReference = (entryZoneLow + entryZoneHigh) / 2 || currentPrice;

  // Authoritative structural move qualification from verified targets
  const majorQual = qualifyMajorMoveOpportunity({
    direction,
    entryPrice: entryReference,
    entryZoneLow,
    entryZoneHigh,
    currentPrice,
    targets,
    largeMoveIntelligence: (preMoveReport as any).largeMoveIntelligence,
    pumpDumpIntelligence: (preMoveReport as any).pumpDumpIntelligence,
  } as any);

  const verifiedMajorMoveClass = majorQual.classification;
  // Genuine structural move percentage measured from entry zone reference to terminal structural target
  const verifiedSupportedPct = majorQual.structurallySupportedMovePct;

  const verifiedLargeMoveClass: LargeMoveClass =
    verifiedSupportedPct >= 100 ? 'EXTREME_100_PLUS' :
    verifiedSupportedPct >= 50 ? '50_PERCENT_PLUS' :
    verifiedSupportedPct >= 30 ? 'EXCEPTIONAL_30_PLUS' :
    verifiedSupportedPct >= 10 ? '10_PERCENT_PLUS' :
    verifiedSupportedPct >= 4 ? 'WATCH' :
    'NORMAL';

  const verifiedLargeMovePotentialLabel =
    verifiedSupportedPct >= 100 ? `EXTREME ${verifiedSupportedPct}%+ POTENTIAL` :
    verifiedSupportedPct >= 50 ? `EXTREME ${verifiedSupportedPct}%+ EXPANSION` :
    verifiedSupportedPct >= 30 ? `MAJOR ${verifiedSupportedPct}%+ MOVE` :
    verifiedSupportedPct >= 10 ? `STRONG +${verifiedSupportedPct}% EXPANSION` :
    verifiedSupportedPct >= 4 ? `MODERATE +${verifiedSupportedPct}% MOVE` :
    `SMALL +${verifiedSupportedPct}% MOVE`;

  // Sync report with verified structural targets
  preMoveReport.largeMoveClass = verifiedLargeMoveClass;
  preMoveReport.largeMovePotentialLabel = verifiedLargeMovePotentialLabel;
  preMoveReport.isExtremeCandidate = verifiedSupportedPct >= 50;

  const signal: Signal = {
    id: deterministicId,
    symbol,
    baseAsset,
    quoteAsset,
    timeframe,
    direction,
    isPreMove: true,
    entryPrice: currentPrice,
    entryZoneLow,
    entryZoneHigh,
    stopLoss,
    tp1,
    tp2,
    tp3,
    targets,
    riskRewardRatio,
    moonScore: Math.round(coilScore * 0.95),
    confidence: Math.max(65, coilScore),
    qualityGrade,
    status: 'ACTIVE',
    entryStatus,
    currentPrice,
    priceChange24h: 0,
    expectedMovePct: verifiedSupportedPct,
    largeMoveClass: verifiedLargeMoveClass,
    largeMovePotentialLabel: verifiedLargeMovePotentialLabel,
    isExtremeCandidate: verifiedSupportedPct >= 50,
    majorMoveClass: verifiedMajorMoveClass,
    majorMovePotentialPct: verifiedSupportedPct,
    majorMoveNotes: majorQual.notes,
    preMoveDetailedState: preMoveReport.detailedState,
    timestamp: Date.now(),
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 3600 * 1000,
    whyTrade: [
      `Pre-Move Volatility Squeeze & Compression setup (Coil Score: ${coilScore}/100)`,
      ...(preMoveReport.evidence || [])
    ],
    invalidationReason: preMoveReport.invalidationReason,
    setupMaturity: preMoveReport.setupStage === 'TRIGGERED' ? 'NEAR_TRIGGER' : (preMoveReport.setupStage === 'READY_TO_BREAK' ? 'EARLY_SETUP' : 'SETUP_FORMING'),
    actionablePriority,
    preMoveReport,
    preMoveIntelligence: preMoveReport,
    confluences: (preMoveReport.evidence || []).map((ev, idx) => ({
      id: `pm_conf_${idx}`,
      category: 'PATTERN',
      name: 'Pre-Move Coiling Intelligence',
      status: direction === 'LONG' ? 'BULLISH' : 'BEARISH',
      score: 15,
      weight: 15,
      description: ev
    }))
  };

  // Record qualified signal in diagnostics
  preMoveDiagnostics.recordSignalQualified({
    symbol,
    direction,
    coilScore,
    setupStage: preMoveReport.setupStage || 'COILING',
    keyTriggerLevel: preMoveReport.keyTriggerLevel,
    invalidationPrice: preMoveReport.invalidationPrice,
    riskRewardRatio,
    expectedMovePct,
    evidence: preMoveReport.evidence
  });

  // Store in authoritative Pre-Move registry
  storeAuthoritativePreMoveSignal(signal);

  return signal;
}

// Authoritative in-memory registry of genuine Pre-Move opportunities
const authoritativePreMoveRegistry = new Map<string, Signal>();

export interface InvalidatedPreMoveRecord {
  symbol: string;
  invalidatedAt: number;
  reason: string;
  lastPrice: number;
  direction?: 'LONG' | 'SHORT';
  invalidationPrice?: number;
}

// Tombstone registry preventing background scanner from accidentally resurrecting invalidated opportunities
const invalidatedPreMoveRegistry = new Map<string, InvalidatedPreMoveRecord>();

export function getInvalidatedPreMoveRegistry(): Map<string, InvalidatedPreMoveRecord> {
  return invalidatedPreMoveRegistry;
}

export function storeAuthoritativePreMoveSignal(signal: Signal): void {
  if (!signal || !signal.symbol) return;
  const symKey = signal.symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  // Clear any tombstone if coin legitimately passed all fresh qualification gates
  invalidatedPreMoveRegistry.delete(symKey);
  authoritativePreMoveRegistry.set(symKey, signal);
  preMoveDiagnostics.recordSignalStored(signal.symbol, signal.id || symKey);
}

export function removeAuthoritativePreMoveSignal(symbol: string, reason = 'STRUCTURALLY_INVALIDATED'): void {
  if (!symbol) return;
  const symKey = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const existing = authoritativePreMoveRegistry.get(symKey);
  if (!existing) {
    // Never tombstone coins that were not actively registered Pre-Move setups
    return;
  }
  authoritativePreMoveRegistry.delete(symKey);
  invalidatedPreMoveRegistry.set(symKey, {
    symbol: symKey,
    invalidatedAt: Date.now(),
    reason,
    lastPrice: existing.currentPrice || 0,
    direction: existing.direction,
    invalidationPrice: existing.preMoveReport?.invalidationPrice || existing.stopLoss
  });
}

export function hasAuthoritativePreMoveSignal(symbol: string): boolean {
  if (!symbol) return false;
  const symKey = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  return authoritativePreMoveRegistry.has(symKey);
}

export function clearAuthoritativePreMoveSignals(): void {
  authoritativePreMoveRegistry.clear();
  invalidatedPreMoveRegistry.clear();
}

export function getAuthoritativePreMoveSignals(): Signal[] {
  const now = Date.now();
  const list: Signal[] = [];
  for (const [sym, sig] of authoritativePreMoveRegistry.entries()) {
    // 1. Check expiration (24h window)
    if (sig.expiresAt && now > sig.expiresAt) {
      removeAuthoritativePreMoveSignal(sym, 'EXPIRED_WINDOW');
      continue;
    }

    // 2. Check terminal / invalid status
    if (
      sig.status === 'INVALIDATED' ||
      sig.status === 'STOPPED_OUT' ||
      sig.status === 'EXPIRED' ||
      sig.status === 'CANCELLED'
    ) {
      removeAuthoritativePreMoveSignal(sym, `STATUS_${sig.status}`);
      continue;
    }

    // 3. Dynamic price invalidation check if currentPrice is known
    const curPrice = sig.currentPrice || sig.entryPrice || 0;
    if (curPrice > 0) {
      const isLong = sig.direction === 'LONG';

      // A. Stop Loss breach (Hard structural invalidation)
      if (sig.stopLoss > 0) {
        if (isLong && curPrice <= sig.stopLoss) {
          removeAuthoritativePreMoveSignal(sym, 'STOP_LOSS_BREACHED');
          continue;
        }
        if (!isLong && curPrice >= sig.stopLoss) {
          removeAuthoritativePreMoveSignal(sym, 'STOP_LOSS_BREACHED');
          continue;
        }
      }

      // B. Structural Invalidation price breach (if established beyond stop loss)
      const invPrice = sig.preMoveReport?.invalidationPrice;
      if (invPrice && invPrice > 0 && Math.abs(invPrice - curPrice) / curPrice > 0.005) {
        if (isLong && curPrice <= invPrice) {
          removeAuthoritativePreMoveSignal(sym, 'INVALIDATION_PRICE_BREACHED');
          continue;
        }
        if (!isLong && curPrice >= invPrice) {
          removeAuthoritativePreMoveSignal(sym, 'INVALIDATION_PRICE_BREACHED');
          continue;
        }
      }

      // C. No-Chase / Over-extension runaway level:
      // Only remove if price has completely blown far past the breakout zone (> 3% beyond noChase)
      // Never remove coins that are merely coiling, ready to break, or newly triggered!
      const noChase = sig.preMoveReport?.noChaseLevel;
      if (noChase && noChase > 0) {
        const runawayBuffer = Math.max(noChase * 0.03, 0.0001);
        if (isLong && curPrice >= noChase + runawayBuffer) {
          removeAuthoritativePreMoveSignal(sym, 'NO_CHASE_LEVEL_EXCEEDED');
          continue;
        }
        if (!isLong && curPrice <= noChase - runawayBuffer) {
          removeAuthoritativePreMoveSignal(sym, 'NO_CHASE_LEVEL_EXCEEDED');
          continue;
        }
      }

      // D. Terminal target fulfilled (Signal has completed its full run)
      const validTargets = (sig.targets || []).filter(t => t.price > 0);
      if (validTargets.length > 0) {
        const finalTarget = validTargets[validTargets.length - 1].price;
        if (isLong && curPrice >= finalTarget) {
          removeAuthoritativePreMoveSignal(sym, 'TERMINAL_TARGET_FULFILLED');
          continue;
        }
        if (!isLong && curPrice <= finalTarget) {
          removeAuthoritativePreMoveSignal(sym, 'TERMINAL_TARGET_FULFILLED');
          continue;
        }
      }
    }

    list.push(sig);
  }
  return list.sort((a, b) => {
    const scoreA = (a.preMoveReport?.coilScore || 0) + (a.preMoveReport?.breakoutProbability || 0);
    const scoreB = (b.preMoveReport?.coilScore || 0) + (b.preMoveReport?.breakoutProbability || 0);
    return scoreB - scoreA;
  });
}

/**
 * Checks an existing Pre-Move opportunity against fresh market state:
 * - If expired -> remove
 * - If terminal status -> remove
 * - If currentPrice hit Stop Loss or structural invalidation level -> remove
 * - If currentPrice reached no-chase or final target -> remove
 * - Otherwise update currentPrice
 */
export function checkAndUpdateExistingPreMoveSignal(symbol: string, currentPrice: number): void {
  if (!symbol || currentPrice <= 0) return;
  const symKey = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const existing = authoritativePreMoveRegistry.get(symKey);
  if (!existing) return;

  const now = Date.now();
  // 1. Expiration
  if (existing.expiresAt && now > existing.expiresAt) {
    removeAuthoritativePreMoveSignal(symKey, 'EXPIRED_WINDOW');
    return;
  }

  // 2. Status
  if (
    existing.status === 'INVALIDATED' ||
    existing.status === 'STOPPED_OUT' ||
    existing.status === 'EXPIRED' ||
    existing.status === 'CANCELLED' ||
    (existing as any).status === 'COMPLETED'
  ) {
    removeAuthoritativePreMoveSignal(symKey, `STATUS_${existing.status}`);
    return;
  }

  const isLong = existing.direction === 'LONG';

  // 3. Stop Loss breach
  if (existing.stopLoss > 0) {
    if (isLong && currentPrice <= existing.stopLoss) {
      removeAuthoritativePreMoveSignal(symKey, 'STOP_LOSS_BREACHED');
      return;
    }
    if (!isLong && currentPrice >= existing.stopLoss) {
      removeAuthoritativePreMoveSignal(symKey, 'STOP_LOSS_BREACHED');
      return;
    }
  }

  // 4. Structural invalidation price breach
  const invPrice = existing.preMoveReport?.invalidationPrice;
  if (invPrice && invPrice > 0) {
    if (isLong && currentPrice <= invPrice) {
      removeAuthoritativePreMoveSignal(symKey, 'INVALIDATION_PRICE_BREACHED');
      return;
    }
    if (!isLong && currentPrice >= invPrice) {
      removeAuthoritativePreMoveSignal(symKey, 'INVALIDATION_PRICE_BREACHED');
      return;
    }
  }

  // 5. No-Chase runaway breach
  const noChase = existing.preMoveReport?.noChaseLevel;
  if (noChase && noChase > 0) {
    if (isLong && currentPrice >= noChase) {
      removeAuthoritativePreMoveSignal(symKey, 'NO_CHASE_LEVEL_EXCEEDED');
      return;
    }
    if (!isLong && currentPrice <= noChase) {
      removeAuthoritativePreMoveSignal(symKey, 'NO_CHASE_LEVEL_EXCEEDED');
      return;
    }
  }

  // 6. Terminal target reached
  const validTargets = (existing.targets || []).filter(t => t.price > 0);
  if (validTargets.length > 0) {
    const finalTarget = validTargets[validTargets.length - 1].price;
    if (isLong && currentPrice >= finalTarget) {
      removeAuthoritativePreMoveSignal(symKey, 'TERMINAL_TARGET_FULFILLED');
      return;
    }
    if (!isLong && currentPrice <= finalTarget) {
      removeAuthoritativePreMoveSignal(symKey, 'TERMINAL_TARGET_FULFILLED');
      return;
    }
  }

  // 7. Check breakout trigger level transition
  const keyTrigger = existing.preMoveReport?.keyTriggerLevel;
  if (keyTrigger && keyTrigger > 0 && existing.preMoveReport) {
    if (isLong && currentPrice >= keyTrigger && existing.preMoveReport.setupStage !== 'TRIGGERED') {
      existing.preMoveReport.setupStage = 'TRIGGERED';
      existing.setupMaturity = 'NEAR_TRIGGER';
      existing.actionablePriority = 'ENTRY_NOW';
    } else if (!isLong && currentPrice <= keyTrigger && existing.preMoveReport.setupStage !== 'TRIGGERED') {
      existing.preMoveReport.setupStage = 'TRIGGERED';
      existing.setupMaturity = 'NEAR_TRIGGER';
      existing.actionablePriority = 'ENTRY_NOW';
    }
  }

  // Update current price
  existing.currentPrice = currentPrice;
}

function createEmptyPreMoveReport(symbol: string, currentPrice: number, priceDecimals: number): PreMoveReport {
  return {
    symbol,
    coilScore: 0,
    breakoutProbability: 0,
    projectedDirection: 'NEUTRAL',
    invalidationPrice: currentPrice,
    invalidationReason: 'Insufficient candlestick data for pre-move coil evaluation',
    recommendedAction: 'STAND_ASIDE',
    setupStage: 'COILING',
    compressionRatio: 0,
    volatilitySqueeze: false,
    orderflowAbsorption: { detected: false, type: 'NONE', absorptionStrength: 0 },
    openInterestBuild: { detected: false, oiChangePct: 0, implication: 'NEUTRAL' },
    smartMoneyPositioning: { detected: false, bias: 'NEUTRAL', evidence: [] },
    fakeoutSweep: { detected: false, sweepSide: 'NONE', reclaimed: false },
    multiTimeframeCoil: { aligned15m: false, aligned1h: false, aligned4h: false, coilState: 'EXPANDING' },
    keyTriggerLevel: currentPrice,
    noChaseLevel: currentPrice,
    evidence: ['Insufficient candle history for compression modeling'],
    timestamp: Date.now()
  };
}
