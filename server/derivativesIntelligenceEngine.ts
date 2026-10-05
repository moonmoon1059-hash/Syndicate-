import { Candle } from './cryptoService';
import { DerivativesData } from './advancedMarketData';
import { DerivativesIntelligenceReport } from '../src/types/crypto';

/**
 * Derivatives Intelligence Engine
 * Quantifies Funding Rate dynamics, Open Interest (OI) price correlation matrix,
 * Liquidation cascade risk, and estimated liquidation clusters.
 * Gracefully marks missing feeds as UNKNOWN (Zero fabrication).
 */
export function evaluateDerivativesIntelligence(
  candles: Candle[],
  derivatives?: DerivativesData | null
): DerivativesIntelligenceReport {
  if (!derivatives || derivatives.status === 'UNAVAILABLE' || derivatives.openInterest === undefined || derivatives.openInterest === 0) {
    return {
      fundingRate: 0,
      fundingSentiment: 'UNKNOWN',
      openInterest: 0,
      oiChange24h: 0,
      priceOiCorrelation: 'UNKNOWN',
      fundingOiDisconnect: false,
      liquidationCascadeRisk: 'UNKNOWN',
      estimatedLiquidationPools: {
        longLiqZone: 0,
        shortLiqZone: 0,
        proximity: 'UNKNOWN'
      },
      status: 'UNAVAILABLE',
      summary: 'Derivatives data unavailable (Spot-only asset or unmonitored perp).'
    };
  }

  const fundingRate = derivatives.fundingRate || 0;
  const openInterest = derivatives.openInterest || 0;
  const oiChange24h = derivatives.openInterestChange24h || 0;

  // 1. Funding Sentiment
  let fundingSentiment: 'OVERHEATED_LONGS' | 'EXTREME_SHORTS' | 'NEUTRAL' = 'NEUTRAL';
  if (fundingRate >= 0.0003) { // >= +0.03% / 8h
    fundingSentiment = 'OVERHEATED_LONGS';
  } else if (fundingRate <= -0.0002) { // <= -0.02% / 8h
    fundingSentiment = 'EXTREME_SHORTS';
  }

  // 2. Price / OI Correlation Matrix
  let priceChange24h = 0;
  if (candles && candles.length >= 24) {
    const pCurrent = candles[candles.length - 1].close;
    const p24hAgo = candles[candles.length - 24].close;
    priceChange24h = ((pCurrent - p24hAgo) / p24hAgo) * 100;
  }

  let priceOiCorrelation: 'LONG_ACCUMULATION' | 'SHORT_ACCUMULATION' | 'SHORT_SQUEEZE' | 'LONG_LIQUIDATION' | 'NEUTRAL' = 'NEUTRAL';
  if (priceChange24h > 1.5 && oiChange24h > 3.0) {
    priceOiCorrelation = 'LONG_ACCUMULATION';
  } else if (priceChange24h < -1.5 && oiChange24h > 3.0) {
    priceOiCorrelation = 'SHORT_ACCUMULATION';
  } else if (priceChange24h > 1.5 && oiChange24h < -3.0) {
    priceOiCorrelation = 'SHORT_SQUEEZE';
  } else if (priceChange24h < -1.5 && oiChange24h < -3.0) {
    priceOiCorrelation = 'LONG_LIQUIDATION';
  }

  // 3. Funding / OI Disconnect
  // e.g. Negative funding but price and OI aggressively climbing (massively trapped shorts)
  const fundingOiDisconnect = (fundingRate < -0.0001 && priceChange24h > 3.0) || (fundingRate > 0.0004 && oiChange24h < -5.0);

  // 4. Liquidation Cascade Risk
  let liquidationCascadeRisk: 'HIGH' | 'ELEVATED' | 'LOW' = 'LOW';
  if (Math.abs(oiChange24h) >= 15.0 || Math.abs(fundingRate) >= 0.0006) {
    liquidationCascadeRisk = 'HIGH';
  } else if (Math.abs(oiChange24h) >= 8.0 || Math.abs(fundingRate) >= 0.0003) {
    liquidationCascadeRisk = 'ELEVATED';
  }

  // 5. Estimated Liquidation Pools
  let longLiqZone = 0;
  let shortLiqZone = 0;
  let proximity: 'NEAR' | 'FAR' | 'UNKNOWN' = 'UNKNOWN';

  if (candles && candles.length >= 20) {
    const recentLow = Math.min(...candles.slice(-20).map(c => c.low));
    const recentHigh = Math.max(...candles.slice(-20).map(c => c.high));
    const currentPrice = candles[candles.length - 1].close;

    // Approximate 25x-50x liquidation clusters
    longLiqZone = recentLow * 0.975;
    shortLiqZone = recentHigh * 1.025;

    const distToLongLiq = Math.abs(currentPrice - longLiqZone) / currentPrice;
    const distToShortLiq = Math.abs(currentPrice - shortLiqZone) / currentPrice;

    proximity = (distToLongLiq < 0.02 || distToShortLiq < 0.02) ? 'NEAR' : 'FAR';
  }

  const summary = `Perp OI: $${(openInterest / 1e6).toFixed(1)}M (${oiChange24h >= 0 ? '+' : ''}${oiChange24h.toFixed(1)}% 24h) | Funding: ${(fundingRate * 100).toFixed(4)}% (${fundingSentiment}) -> [${priceOiCorrelation}] | Liq Cascade Risk: ${liquidationCascadeRisk}`;

  return {
    fundingRate,
    fundingSentiment,
    openInterest,
    oiChange24h,
    priceOiCorrelation,
    fundingOiDisconnect,
    liquidationCascadeRisk,
    estimatedLiquidationPools: {
      longLiqZone,
      shortLiqZone,
      proximity
    },
    status: 'AVAILABLE',
    summary
  };
}
