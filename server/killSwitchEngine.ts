import { Candle } from './cryptoService';
import { calculateATR } from './technicalAnalysis';
import { KillSwitchEvaluation, DataQualityRating, AdversarialAudit } from '../src/types/crypto';

export interface KillSwitchInput {
  candles: Candle[];
  dataQualityRating?: DataQualityRating;
  adversarialAudit?: AdversarialAudit;
  conflicts?: string[];
  spreadBps?: number;
  marketRegime?: string;
}

/**
 * Deterministic No-Trade / Kill Switch Engine
 * Enforces risk circuit breaker under extreme market danger, severe data degradation,
 * or fatal adversarial conflict.
 * Ensures that if triggered, trade recommendation is locked to NO_TRADE / WAIT.
 * Does NOT trip for harmless missing optional layers (like UNKNOWN whale data).
 */
export function evaluateKillSwitch(input: KillSwitchInput): KillSwitchEvaluation {
  const {
    candles,
    dataQualityRating = 'GOOD',
    adversarialAudit,
    conflicts = [],
    spreadBps = 5,
    marketRegime
  } = input;

  const reasons: string[] = [];
  let volatilityTooHigh = false;
  let liquidityUnstable = false;
  let severeConflict = false;
  let structureBroken = false;
  let adversarialRejection = false;
  let dataUnreliable = false;

  // 1. Data Quality Gate
  if (!candles || candles.length < 20 || dataQualityRating === 'LOW') {
    dataUnreliable = true;
    reasons.push('Unreliable critical candle feed or data quality below execution threshold');
  }

  // 2. Volatility Check
  if (candles && candles.length >= 14) {
    const currentPrice = candles[candles.length - 1].close;
    const atrArr = calculateATR(candles, 14);
    const atr = atrArr[atrArr.length - 1] || 0;
    const atrPct = (atr / currentPrice) * 100;

    if (atrPct > 8.0 || marketRegime === 'EXTREME_VOLATILITY') {
      volatilityTooHigh = true;
      reasons.push(`Extreme volatility spike (ATR ${atrPct.toFixed(1)}% > 8.0% threshold); risk of excessive slippage`);
    }
  }

  // 3. Liquidity Instability / Extreme Spread
  if (spreadBps > 40) {
    liquidityUnstable = true;
    reasons.push(`Abnormal execution spread (${spreadBps} bps > 40 bps limit) indicating orderbook vacuum`);
  }

  // 4. Adversarial Audit Fatal Rejection
  if (adversarialAudit && (adversarialAudit.verdict === 'REJECTED' || adversarialAudit.auditScore < 30)) {
    adversarialRejection = true;
    reasons.push(`Adversarial risk audit failed with score ${adversarialAudit.auditScore}/100: ${adversarialAudit.fatalFlaw || 'Critical counter-thesis verified'}`);
  }

  // 5. Severe Conflicts
  const criticalConflictKeywords = ['opposing macro trend', 'severe multi-timeframe divergence', 'imminent high-impact event dump'];
  const hasSevereConflict = conflicts.some(c => 
    criticalConflictKeywords.some(k => c.toLowerCase().includes(k))
  );
  if (hasSevereConflict || conflicts.length >= 4) {
    severeConflict = true;
    reasons.push(`Major contradictory evidence across market layers (${conflicts.length} active conflicts)`);
  }

  // 6. Broken Market Structure (erratic wicks)
  if (candles && candles.length >= 10) {
    let largeWickCount = 0;
    const recent = candles.slice(-10);
    for (const c of recent) {
      const body = Math.abs(c.close - c.open);
      const totalRange = c.high - c.low;
      if (totalRange > 0 && body / totalRange < 0.20 && (totalRange / c.close) * 100 > 2.5) {
        largeWickCount++;
      }
    }
    if (largeWickCount >= 4) {
      structureBroken = true;
      reasons.push('Broken market structure: repetitive high-range long wicks indicating aggressive whipsaw chop');
    }
  }

  const triggered = volatilityTooHigh || liquidityUnstable || severeConflict || structureBroken || adversarialRejection || dataUnreliable;

  const action: 'TRADE_ALLOWED' | 'NO_TRADE_WAIT' = triggered ? 'NO_TRADE_WAIT' : 'TRADE_ALLOWED';
  const severity: 'CRITICAL' | 'WARNING' | 'NONE' = triggered 
    ? (volatilityTooHigh || adversarialRejection || dataUnreliable ? 'CRITICAL' : 'WARNING')
    : 'NONE';

  const killSwitchMessage = triggered
    ? `KILL SWITCH ACTIVE: System locked into NO_TRADE / WAIT. Trigger reasons: ${reasons.join(' | ')}`
    : 'Safety gates clear: Normal risk parameters verified';

  return {
    triggered,
    action,
    reasons,
    severity,
    metrics: {
      volatilityTooHigh,
      liquidityUnstable,
      severeConflict,
      structureBroken,
      adversarialRejection,
      dataUnreliable
    },
    killSwitchMessage
  };
}
