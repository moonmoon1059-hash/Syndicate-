import { MarketRegime, MarketRegimeAnalysis } from '../src/types/crypto';
import { Candle } from './cryptoService';

/**
 * PHASE 8: MARKET REGIME ENGINE
 * 
 * Classifies macroeconomic crypto market regime:
 * BULL / BEAR / RANGE / HIGH_VOLATILITY / TRANSITION
 * 
 * Utilizes BTC trend, BTC Dominance proxy, USDT Dominance proxy, volatility expansion/compression,
 * and market breadth as contextual confirmation.
 * 
 * CORE INVARIANT: Never creates a trade signal from regime alone. Regime provides macro contextual risk gating.
 */
export function analyzeMarketRegime(
  btcCandles: Candle[],
  marketBreadthInput?: { symbol: string; candles: Candle[]; currentPrice: number }[] | number,
  derivativesContext?: { fundingRate?: number; openInterestChange24h?: number }
): MarketRegimeAnalysis {
  const details: string[] = [];

  // Default neutral state if candles are insufficient
  if (!btcCandles || btcCandles.length < 20) {
    return {
      regime: 'TRANSITION',
      btcTrend: 'RANGING',
      btcDominanceTrend: 'STABLE',
      usdtDominanceTrend: 'STABLE',
      volatilityState: 'NORMAL',
      marketBreadthPct: 50,
      regimeConfidence: 45,
      contextualImpactOnAlts: 'SELECTIVE_NARRATIVE',
      summary: 'Insufficient macro market history to compute definitive market regime. Operating in transitional mode.',
      details: ['BTC data history insufficient for multi-candle EMA calculations']
    };
  }

  const closes = btcCandles.map(c => c.close);
  const currentBtcPrice = closes[closes.length - 1];

  // 1. Calculate BTC EMAs (20, 50, and 100/200 if length permits)
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, Math.min(50, closes.length - 1));

  let btcTrend: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
  if (currentBtcPrice > ema20 && ema20 >= ema50 * 0.998) {
    btcTrend = 'BULLISH';
    details.push(`BTC in confirmed uptrend (Price ${currentBtcPrice.toFixed(0)} > EMA20 > EMA50)`);
  } else if (currentBtcPrice < ema20 && ema20 <= ema50 * 1.002) {
    btcTrend = 'BEARISH';
    details.push(`BTC in confirmed downtrend (Price ${currentBtcPrice.toFixed(0)} < EMA20 < EMA50)`);
  } else {
    btcTrend = 'RANGING';
    details.push(`BTC consolidating / range-bound between EMA20 and EMA50`);
  }

  // 2. Volatility State (ATR & Bollinger Band Width calculation on BTC)
  const atr = calculateATR(btcCandles, 14);
  const atrPct = (atr / currentBtcPrice) * 100;
  const recentBars = btcCandles.slice(-20);
  const barRanges = recentBars.map(c => (c.high - c.low) / c.close);
  const avgRange = barRanges.reduce((a, b) => a + b, 0) / barRanges.length;
  const currentRange = (btcCandles[btcCandles.length - 1].high - btcCandles[btcCandles.length - 1].low) / currentBtcPrice;

  let volatilityState: 'EXPANDING' | 'COMPRESSING' | 'NORMAL' | 'EXTREME' = 'NORMAL';
  if (atrPct > 4.5 || currentRange > avgRange * 2.2) {
    volatilityState = 'EXTREME';
    details.push(`Extreme volatility spike detected (ATR ${atrPct.toFixed(1)}%)`);
  } else if (currentRange > avgRange * 1.4) {
    volatilityState = 'EXPANDING';
    details.push(`Volatility expanding out of recent compression`);
  } else if (currentRange < avgRange * 0.6) {
    volatilityState = 'COMPRESSING';
    details.push(`Volatility compressing (coiling energy setup)`);
  } else {
    volatilityState = 'NORMAL';
  }

  // 3. Market Breadth Calculation (% of monitored assets trading above their EMA20)
  let marketBreadthPct = 50;
  if (typeof marketBreadthInput === 'number') {
    marketBreadthPct = Math.max(0, Math.min(100, marketBreadthInput));
    details.push(`Market Breadth: ${marketBreadthPct}% of universe assets trading above EMA20`);
  } else if (Array.isArray(marketBreadthInput) && marketBreadthInput.length > 0) {
    let aboveEmaCount = 0;
    for (const item of marketBreadthInput) {
      if (item.candles && item.candles.length >= 20) {
        const itemCloses = item.candles.map(c => c.close);
        const itemEma20 = calculateEMA(itemCloses, 20);
        if (item.currentPrice >= itemEma20) {
          aboveEmaCount++;
        }
      }
    }
    marketBreadthPct = Math.round((aboveEmaCount / marketBreadthInput.length) * 100);
    details.push(`Market Breadth: ${marketBreadthPct}% of universe assets trading above EMA20`);
  }

  // 4. Macro Dominance Proxies (BTC.D & USDT.D inferred from market breadth & BTC vs Alts performance)
  let btcDominanceTrend: 'RISING' | 'FALLING' | 'STABLE' = 'STABLE';
  let usdtDominanceTrend: 'RISING' | 'FALLING' | 'STABLE' = 'STABLE';

  const btcChange24h = btcCandles.length >= 24 
    ? ((currentBtcPrice - btcCandles[btcCandles.length - 24].close) / btcCandles[btcCandles.length - 24].close) * 100 
    : 0;

  if (marketBreadthPct < 35 && btcTrend === 'BULLISH') {
    btcDominanceTrend = 'RISING'; // BTC pumping alone while alts bleed
    details.push('BTC Dominance rising (capital concentrating in BTC)');
  } else if (marketBreadthPct > 65 && btcChange24h >= -1) {
    btcDominanceTrend = 'FALLING'; // Broad altcoin strength
    details.push('BTC Dominance falling (broad altcoin participation)');
  }

  if (marketBreadthPct < 30 && btcTrend === 'BEARISH') {
    usdtDominanceTrend = 'RISING'; // Broad flight to stablecoins
    details.push('USDT Dominance rising (risk-off liquidity withdrawal to stablecoins)');
  } else if (marketBreadthPct > 60 && btcTrend !== 'BEARISH') {
    usdtDominanceTrend = 'FALLING'; // Stablecoins deploying into risk assets
    details.push('USDT Dominance falling (active capital deployment into risk assets)');
  }

  // 5. Derive Core Market Regime
  let regime: MarketRegime = 'TRANSITION';
  let regimeConfidence = 70;
  let contextualImpactOnAlts: MarketRegimeAnalysis['contextualImpactOnAlts'] = 'SELECTIVE_NARRATIVE';

  if (volatilityState === 'EXTREME') {
    regime = 'HIGH_VOLATILITY';
    regimeConfidence = 85;
    contextualImpactOnAlts = 'DEFENSIVE_CASH';
    details.push('Macro high-volatility regime active: wide stop losses and strict sizing mandated');
  } else if (btcTrend === 'BULLISH' && marketBreadthPct >= 55) {
    regime = 'BULL';
    regimeConfidence = Math.min(95, 75 + Math.round((marketBreadthPct - 50) * 0.4));
    contextualImpactOnAlts = btcDominanceTrend === 'FALLING' ? 'FAVORABLE_ALTS' : 'FAVORABLE_MAJORS';
    details.push('Confirmed Bull Market regime with broad structural participation');
  } else if (btcTrend === 'BEARISH' && marketBreadthPct <= 40) {
    regime = 'BEAR';
    regimeConfidence = Math.min(95, 75 + Math.round((50 - marketBreadthPct) * 0.4));
    contextualImpactOnAlts = 'DEFENSIVE_CASH';
    details.push('Confirmed Bear Market / Defensive regime: Longs require exceptional idiosyncratic confluences');
  } else if (btcTrend === 'RANGING' && volatilityState === 'COMPRESSING') {
    regime = 'RANGE';
    regimeConfidence = 80;
    contextualImpactOnAlts = 'SELECTIVE_NARRATIVE';
    details.push('Range-bound consolidation regime: mean-reversion and breakout retests favored');
  } else {
    regime = 'TRANSITION';
    regimeConfidence = 65;
    contextualImpactOnAlts = 'SELECTIVE_NARRATIVE';
    details.push('Transitional market regime: rotation between sectors active');
  }

  // Summary Construction
  const summary = `Market Regime is ${regime} (Confidence: ${regimeConfidence}%). BTC trend is ${btcTrend} with market breadth at ${marketBreadthPct}%. Contextual environment is ${contextualImpactOnAlts.replace(/_/g, ' ')}.`;

  return {
    regime,
    btcTrend,
    btcDominanceTrend,
    usdtDominanceTrend,
    volatilityState,
    marketBreadthPct,
    regimeConfidence,
    contextualImpactOnAlts,
    summary,
    details
  };
}

/**
 * Helper EMA calculation
 */
function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices[prices.length - 1];
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Helper ATR calculation
 */
function calculateATR(candles: Candle[], period: number = 14): number {
  if (candles.length < 2) return 0;
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }
  const slice = trueRanges.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}
