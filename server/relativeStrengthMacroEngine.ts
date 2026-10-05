import { Candle } from './cryptoService';
import { RelativeStrengthMacroReport } from '../src/types/crypto';

export interface MacroDominanceData {
  btcD?: number; // e.g. 56.4
  btcDChange24h?: number;
  usdtD?: number; // e.g. 5.8
  usdtDChange24h?: number;
}

/**
 * Relative Strength & Macro Capital Flow Engine
 * Quantifies asset strength against BTC across 1h, 4h, and 24h horizons,
 * and frames setups within BTC.D and USDT.D macro regimes.
 */
export function evaluateRelativeStrengthAndMacro(
  symbol: string,
  candles: Candle[],
  btcCandles?: Candle[],
  macroData?: MacroDominanceData
): RelativeStrengthMacroReport {
  const isBtc = symbol.toUpperCase().includes('BTC');

  // Compute Alt / BTC return comparison
  let rsVsBtc24h = 0;
  let rsVsBtc4h = 0;
  let rsVsBtc1h = 0;

  if (!isBtc && candles && candles.length >= 24 && btcCandles && btcCandles.length >= 24) {
    const altCurrent = candles[candles.length - 1].close;
    const alt24hAgo = candles[candles.length - 24].close;
    const alt4hAgo = candles[candles.length - 4].close;
    const alt1hAgo = candles[candles.length - 2].close;

    const btcCurrent = btcCandles[btcCandles.length - 1].close;
    const btc24hAgo = btcCandles[btcCandles.length - 24].close;
    const btc4hAgo = btcCandles[btcCandles.length - 4].close;
    const btc1hAgo = btcCandles[btcCandles.length - 2].close;

    const altPct24 = ((altCurrent - alt24hAgo) / alt24hAgo) * 100;
    const btcPct24 = ((btcCurrent - btc24hAgo) / btc24hAgo) * 100;
    rsVsBtc24h = Number((altPct24 - btcPct24).toFixed(2));

    const altPct4 = ((altCurrent - alt4hAgo) / alt4hAgo) * 100;
    const btcPct4 = ((btcCurrent - btc4hAgo) / btc4hAgo) * 100;
    rsVsBtc4h = Number((altPct4 - btcPct4).toFixed(2));

    const altPct1 = ((altCurrent - alt1hAgo) / alt1hAgo) * 100;
    const btcPct1 = ((btcCurrent - btc1hAgo) / btc1hAgo) * 100;
    rsVsBtc1h = Number((altPct1 - btcPct1).toFixed(2));
  }

  let relativeStrengthCategory: 'LEADER' | 'OUTPERFORMER' | 'NEUTRAL' | 'LAGGARD' = 'NEUTRAL';
  if (rsVsBtc24h >= 5.0 || (rsVsBtc4h >= 3.0 && rsVsBtc1h >= 1.0)) {
    relativeStrengthCategory = 'LEADER';
  } else if (rsVsBtc24h >= 1.5 || rsVsBtc4h >= 1.5) {
    relativeStrengthCategory = 'OUTPERFORMER';
  } else if (rsVsBtc24h <= -3.0) {
    relativeStrengthCategory = 'LAGGARD';
  }

  // BTC Dominance Context
  const btcD = macroData?.btcD ?? 56.5;
  const btcDChange = macroData?.btcDChange24h ?? 0;
  const btcDTrend: 'RISING' | 'FALLING' | 'STABLE' =
    btcDChange >= 0.3 ? 'RISING' : btcDChange <= -0.3 ? 'FALLING' : 'STABLE';

  let altImpact: 'FAVORABLE' | 'NEUTRAL' | 'ADVERSE' = 'NEUTRAL';
  if (btcDTrend === 'FALLING') {
    altImpact = 'FAVORABLE'; // Capital rotating into alts
  } else if (btcDTrend === 'RISING') {
    altImpact = 'ADVERSE'; // BTC sucking liquidity
  }

  // USDT Dominance Context
  const usdtD = macroData?.usdtD ?? 5.5;
  const usdtDChange = macroData?.usdtDChange24h ?? 0;
  const usdtDTrend: 'RISING' | 'FALLING' | 'STABLE' =
    usdtDChange >= 0.2 ? 'RISING' : usdtDChange <= -0.2 ? 'FALLING' : 'STABLE';

  let macroCapitalFlow: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' = 'NEUTRAL';
  if (usdtDTrend === 'FALLING') {
    macroCapitalFlow = 'RISK_ON'; // Stablecoins deploying into crypto assets
  } else if (usdtDTrend === 'RISING') {
    macroCapitalFlow = 'RISK_OFF'; // Capital fleeing to cash/stables
  }

  const summary = `RS vs BTC (24h: ${rsVsBtc24h >= 0 ? '+' : ''}${rsVsBtc24h}%, 4h: ${rsVsBtc4h >= 0 ? '+' : ''}${rsVsBtc4h}%) -> [${relativeStrengthCategory}] | Macro: BTC.D ${btcD.toFixed(1)}% (${btcDTrend}) | USDT.D ${usdtD.toFixed(1)}% (${macroCapitalFlow})`;

  return {
    rsVsBtc24h,
    rsVsBtc4h,
    rsVsBtc1h,
    relativeStrengthCategory,
    btcDominanceContext: {
      btcD,
      trend: btcDTrend,
      impactOnAlts: altImpact
    },
    usdtDominanceContext: {
      usdtD,
      trend: usdtDTrend,
      macroCapitalFlow
    },
    summary
  };
}
