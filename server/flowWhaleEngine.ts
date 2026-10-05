import { FlowWhaleIntelligence } from '../src/types/crypto';
import { DerivativesData } from './advancedMarketData';

/**
 * Flow & Whale Intelligence Engine
 * Evaluates verified institutional order flow and on-chain metrics when available.
 * CRITICAL RULE: If telemetry is unavailable or unverified, outputs status UNKNOWN / UNAVAILABLE.
 * NEVER fabricates simulated whale wallets.
 * Whale/flow data is supporting evidence only and CANNOT independently create a trade signal.
 */
export function evaluateFlowWhaleIntelligence(
  symbol: string,
  derivatives?: DerivativesData | null
): FlowWhaleIntelligence {
  const cleanSym = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  // If no live derivatives/orderflow telemetry provided
  if (!derivatives) {
    return {
      status: 'UNKNOWN',
      inflowOutflowBias: 'UNKNOWN',
      abnormalTransfers: false,
      largeVolumeFlow: 'UNKNOWN',
      liquidityChange24hPct: undefined,
      exchangeNetFlowStatus: 'No direct exchange flow telemetry stream available',
      confidence: 'UNKNOWN',
      details: 'Flow and whale telemetry data is UNAVAILABLE for this asset pair; preserving strict UNKNOWN integrity without simulation.',
      evidence: []
    };
  }

  const openInterest = derivatives.openInterest;
  const openInterestChange24h = derivatives.openInterestChange24h;
  const fundingRate = derivatives.fundingRate;
  const longShortRatio = derivatives.longShortRatio;
  const takerBuySellRatio = (derivatives as any).takerBuySellRatio ?? (derivatives as any).takerBuyRatio;
  const evidence: string[] = [];

  // Check if we have meaningful numbers
  const hasOI = typeof openInterestChange24h === 'number';
  const hasLSRatio = typeof longShortRatio === 'number';
  const hasTakerRatio = typeof takerBuySellRatio === 'number';

  if (!hasOI && !hasLSRatio && !hasTakerRatio) {
    return {
      status: 'UNKNOWN',
      inflowOutflowBias: 'UNKNOWN',
      abnormalTransfers: false,
      largeVolumeFlow: 'UNKNOWN',
      exchangeNetFlowStatus: 'Telemetry fields unpopulated',
      confidence: 'UNKNOWN',
      details: 'Institutional flow fields absent from data feed; treated as UNKNOWN.',
      evidence: []
    };
  }

  // Taker buy/sell ratio evaluation
  let largeVolumeFlow: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' | 'UNKNOWN' = 'NEUTRAL';
  let inflowOutflowBias: 'INFLOW_DOMINANT' | 'OUTFLOW_DOMINANT' | 'BALANCED' | 'UNKNOWN' = 'BALANCED';
  let abnormalTransfers = false;

  if (takerBuySellRatio && takerBuySellRatio > 1.25) {
    largeVolumeFlow = 'ACCUMULATION';
    inflowOutflowBias = 'INFLOW_DOMINANT';
    evidence.push(`Aggressive taker market buy dominance (ratio: ${takerBuySellRatio.toFixed(2)})`);
  } else if (takerBuySellRatio && takerBuySellRatio < 0.80) {
    largeVolumeFlow = 'DISTRIBUTION';
    inflowOutflowBias = 'OUTFLOW_DOMINANT';
    evidence.push(`Aggressive taker market sell pressure (ratio: ${takerBuySellRatio.toFixed(2)})`);
  }

  if (openInterestChange24h && Math.abs(openInterestChange24h) > 15.0) {
    abnormalTransfers = true;
    evidence.push(`Abnormal open interest displacement (${openInterestChange24h > 0 ? '+' : ''}${openInterestChange24h.toFixed(1)}% in 24h)`);
  }

  let details = `Flow status: ${largeVolumeFlow} | Inflow/Outflow: ${inflowOutflowBias}`;
  if (evidence.length > 0) {
    details += ` | Evidence: ${evidence.join('; ')}`;
  }

  return {
    status: 'AVAILABLE',
    inflowOutflowBias,
    abnormalTransfers,
    largeVolumeFlow,
    liquidityChange24hPct: openInterestChange24h,
    exchangeNetFlowStatus: `${inflowOutflowBias} with ${largeVolumeFlow} taker flow`,
    confidence: 'MEDIUM',
    details,
    evidence
  };
}
