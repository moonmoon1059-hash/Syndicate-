import { Candle } from './cryptoService';
import { DerivativesData } from './advancedMarketData';
import { analyzeSMCStructure } from './smcStructureEngine';
import { analyzeOrderflow, OrderBookData } from './orderflowVolumeEngine';
import { calculateFibonacciConfluence } from './fibonacciConfluenceEngine';
import { evaluateDivergenceMatrix } from './divergenceMatrixEngine';
import { evaluateRelativeStrengthAndMacro, MacroDominanceData } from './relativeStrengthMacroEngine';
import { evaluateDerivativesIntelligence } from './derivativesIntelligenceEngine';
import { InstitutionalIntelligenceReport } from '../src/types/crypto';

export interface InstitutionalIntelligenceParams {
  symbol: string;
  timeframe?: string;
  candles: Candle[];
  btcCandles?: Candle[];
  multiTimeframeCandles?: { [tf: string]: Candle[] };
  orderBook?: OrderBookData | null;
  derivatives?: DerivativesData | null;
  macroData?: MacroDominanceData;
}

/**
 * Phase 6 Institutional-Grade Market Intelligence Orchestrator
 * Fuses SMC Structure, Orderflow/CVD, Fibonacci Golden Pocket/Extensions,
 * Multi-Timeframe Divergence Matrix, Relative Strength vs BTC, and Derivatives Intelligence.
 */
export function evaluateInstitutionalIntelligence(
  params: InstitutionalIntelligenceParams
): InstitutionalIntelligenceReport {
  const {
    symbol,
    timeframe = '1h',
    candles,
    btcCandles,
    multiTimeframeCandles,
    orderBook,
    derivatives,
    macroData
  } = params;

  // 1. Run all sub-engines
  const smc = analyzeSMCStructure(candles, timeframe, multiTimeframeCandles);
  const orderflow = analyzeOrderflow(candles, orderBook);
  const fibonacci = calculateFibonacciConfluence(candles);
  const divergenceMatrix = evaluateDivergenceMatrix(candles, timeframe, multiTimeframeCandles);
  const relativeStrength = evaluateRelativeStrengthAndMacro(symbol, candles, btcCandles, macroData);
  const derivativesReport = evaluateDerivativesIntelligence(candles, derivatives);

  // 2. Synthesize Institutional Confirmations & Contradictions
  const keyConfirmations: string[] = [];
  const keyContradictions: string[] = [];
  let bullishWeight = 0;
  let bearishWeight = 0;

  // SMC Confluences
  if (smc.structureBias === 'BULLISH') {
    keyConfirmations.push(`SMC Structure: ${smc.structureType} Bullish expansion`);
    bullishWeight += 18;
  } else if (smc.structureBias === 'BEARISH') {
    keyContradictions.push(`SMC Structure: ${smc.structureType} Bearish breakdown`);
    bearishWeight += 18;
  }

  if (smc.nearestOrderBlock && smc.nearestOrderBlock.type === 'BULLISH' && smc.nearestOrderBlock.status === 'ACTIVE') {
    keyConfirmations.push(`Bullish Order Block supported at $${smc.nearestOrderBlock.midpoint.toFixed(2)}`);
    bullishWeight += 12;
  } else if (smc.nearestOrderBlock && smc.nearestOrderBlock.type === 'BEARISH' && smc.nearestOrderBlock.status === 'ACTIVE') {
    keyContradictions.push(`Bearish Order Block resistance overhead at $${smc.nearestOrderBlock.midpoint.toFixed(2)}`);
    bearishWeight += 12;
  }

  if (smc.judasSwing.detected && smc.judasSwing.bias === 'BULLISH') {
    keyConfirmations.push(smc.judasSwing.details);
    bullishWeight += 15;
  } else if (smc.judasSwing.detected && smc.judasSwing.bias === 'BEARISH') {
    keyContradictions.push(smc.judasSwing.details);
    bearishWeight += 15;
  }

  // Orderflow & CVD Confluences
  if (orderflow.cvd.divergence.detected) {
    if (orderflow.cvd.divergence.type === 'BULLISH_CVD_DIVERGENCE') {
      keyConfirmations.push(orderflow.cvd.divergence.description);
      bullishWeight += 15;
    } else if (orderflow.cvd.divergence.type === 'BEARISH_CVD_DIVERGENCE') {
      keyContradictions.push(orderflow.cvd.divergence.description);
      bearishWeight += 15;
    }
  }

  if (orderflow.volumeProfile.currentVsPoc === 'ABOVE_POC') {
    keyConfirmations.push(`Price trading above Volume Profile POC ($${orderflow.volumeProfile.poc.toFixed(2)})`);
    bullishWeight += 8;
  } else if (orderflow.volumeProfile.currentVsPoc === 'BELOW_POC') {
    keyContradictions.push(`Price trapped below Volume Profile POC ($${orderflow.volumeProfile.poc.toFixed(2)})`);
    bearishWeight += 8;
  }

  if (orderflow.orderBookImbalance.status === 'AVAILABLE' && orderflow.orderBookImbalance.bidDepthPressure === 'BIDS_DOMINANT') {
    keyConfirmations.push(`Order Book Depth: Strong bid support (+${orderflow.orderBookImbalance.obiPercent}% OBI)`);
    bullishWeight += 10;
  } else if (orderflow.orderBookImbalance.status === 'AVAILABLE' && orderflow.orderBookImbalance.bidDepthPressure === 'ASKS_DOMINANT') {
    keyContradictions.push(`Order Book Depth: Heavy ask resistance (${orderflow.orderBookImbalance.obiPercent}% OBI)`);
    bearishWeight += 10;
  }

  // Fibonacci Confluences
  if (fibonacci.status === 'VALID_SWING') {
    if (fibonacci.goldenPocket.inZone && fibonacci.trendDirection === 'UP') {
      keyConfirmations.push(`Golden Pocket Confluence: Retesting 0.618-0.65 zone [$${fibonacci.goldenPocket.min.toFixed(2)} - $${fibonacci.goldenPocket.max.toFixed(2)}]`);
      bullishWeight += 16;
    }
  }

  // Divergence Matrix Confluences
  if (divergenceMatrix.rsiDivergence.detected) {
    if (divergenceMatrix.rsiDivergence.type === 'REGULAR_BULLISH' || divergenceMatrix.rsiDivergence.type === 'HIDDEN_BULLISH') {
      keyConfirmations.push(divergenceMatrix.rsiDivergence.description);
      bullishWeight += 14;
    } else if (divergenceMatrix.rsiDivergence.type === 'REGULAR_BEARISH' || divergenceMatrix.rsiDivergence.type === 'HIDDEN_BEARISH') {
      keyContradictions.push(divergenceMatrix.rsiDivergence.description);
      bearishWeight += 14;
    }
  }

  if (divergenceMatrix.macdDivergence.detected) {
    if (divergenceMatrix.macdDivergence.type === 'REGULAR_BULLISH' || divergenceMatrix.macdDivergence.type === 'HIDDEN_BULLISH') {
      keyConfirmations.push(divergenceMatrix.macdDivergence.description);
      bullishWeight += 10;
    } else if (divergenceMatrix.macdDivergence.type === 'REGULAR_BEARISH' || divergenceMatrix.macdDivergence.type === 'HIDDEN_BEARISH') {
      keyContradictions.push(divergenceMatrix.macdDivergence.description);
      bearishWeight += 10;
    }
  }

  // Relative Strength Confluences
  if (relativeStrength.relativeStrengthCategory === 'LEADER' || relativeStrength.relativeStrengthCategory === 'OUTPERFORMER') {
    keyConfirmations.push(`Relative Strength vs BTC: Outperforming (+${relativeStrength.rsVsBtc24h}% 24h) -> [${relativeStrength.relativeStrengthCategory}]`);
    bullishWeight += 12;
  } else if (relativeStrength.relativeStrengthCategory === 'LAGGARD') {
    keyContradictions.push(`Relative Strength vs BTC: Underperforming (${relativeStrength.rsVsBtc24h}% 24h) -> [LAGGARD]`);
    bearishWeight += 10;
  }

  if (relativeStrength.btcDominanceContext.impactOnAlts === 'FAVORABLE') {
    keyConfirmations.push(`Macro: Falling BTC Dominance provides favorable alt liquidity expansion`);
    bullishWeight += 6;
  }

  // Derivatives Confluences (if available)
  if (derivativesReport.status === 'AVAILABLE') {
    if (derivativesReport.priceOiCorrelation === 'LONG_ACCUMULATION') {
      keyConfirmations.push(`Derivatives: Healthy long accumulation with expanding open interest`);
      bullishWeight += 12;
    } else if (derivativesReport.priceOiCorrelation === 'SHORT_ACCUMULATION') {
      keyContradictions.push(`Derivatives: Aggressive short accumulation detected`);
      bearishWeight += 12;
    }

    if (derivativesReport.fundingSentiment === 'EXTREME_SHORTS' && derivativesReport.fundingOiDisconnect) {
      keyConfirmations.push(`Derivatives: Negative funding with rising price suggests imminent short squeeze`);
      bullishWeight += 14;
    } else if (derivativesReport.fundingSentiment === 'OVERHEATED_LONGS') {
      keyContradictions.push(`Derivatives: Overheated long funding rate (${(derivativesReport.fundingRate * 100).toFixed(3)}%) signals long-flush risk`);
      bearishWeight += 14;
    }
  }

  // Calculate Unified Institutional Score (0 - 100)
  const netWeight = bullishWeight - bearishWeight;
  let institutionalScore = Math.max(10, Math.min(98, 50 + Math.round(netWeight * 0.6)));

  // Correlation & Contradiction Penalties
  if (bullishWeight > 0 && bearishWeight > 25) {
    // Severe structural contradiction penalty
    institutionalScore = Math.max(10, institutionalScore - 20);
  }

  let overallInstitutionalVerdict: 'STRONGLY_BULLISH' | 'MODERATELY_BULLISH' | 'NEUTRAL' | 'MODERATELY_BEARISH' | 'STRONGLY_BEARISH' = 'NEUTRAL';
  if (institutionalScore >= 80) {
    overallInstitutionalVerdict = 'STRONGLY_BULLISH';
  } else if (institutionalScore >= 62) {
    overallInstitutionalVerdict = 'MODERATELY_BULLISH';
  } else if (institutionalScore <= 30) {
    overallInstitutionalVerdict = 'STRONGLY_BEARISH';
  } else if (institutionalScore <= 42) {
    overallInstitutionalVerdict = 'MODERATELY_BEARISH';
  } else {
    overallInstitutionalVerdict = 'NEUTRAL';
  }

  return {
    smc,
    orderflow,
    fibonacci,
    divergenceMatrix,
    relativeStrength,
    derivatives: derivativesReport,
    institutionalScore,
    overallInstitutionalVerdict,
    keyConfirmations,
    keyContradictions
  };
}
