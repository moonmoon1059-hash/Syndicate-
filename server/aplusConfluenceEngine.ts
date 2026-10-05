import { AplusConfluenceReport, SignalQualityGrade, CoreDecision, EntryReadiness, AdversarialAudit } from '../src/types/crypto';

export interface AplusConfluenceInput {
  decision: CoreDecision;
  confidence: number;
  entryStatus: EntryReadiness;
  riskRewardRatio: number;
  confirmations: string[];
  conflicts: string[];
  unknowns: string[];
  adversarialAudit?: AdversarialAudit;
  dataQualityRating?: string;
  collisionDetected?: boolean;
  marketRegime?: string;
  btcRegime?: string;
}

/**
 * Advanced A+ Confluence & False-A+ Prevention Engine
 * Mathematically evaluates multi-layer confluence, independent evidence density,
 * execution timing, and critical safety gates.
 */
export function evaluateAplusConfluence(input: AplusConfluenceInput): AplusConfluenceReport {
  const {
    decision,
    confidence,
    entryStatus,
    riskRewardRatio,
    confirmations = [],
    conflicts = [],
    unknowns = [],
    adversarialAudit,
    dataQualityRating = 'GOOD',
    collisionDetected = false,
    marketRegime,
    btcRegime
  } = input;

  const failedGates: string[] = [];
  let falseAplusPrevented = false;
  let falseAplusReason: string | undefined;

  // 1. Critical Evidence Gates
  if (decision === 'WAIT') {
    failedGates.push('Decision is WAIT');
  }

  if (confidence < 85) {
    failedGates.push(`Confidence score (${confidence}) is below A+ threshold (85)`);
  }

  if (riskRewardRatio < 2.0) {
    failedGates.push(`Risk/Reward ratio (${riskRewardRatio.toFixed(1)}) is below minimum A+ threshold (2.0)`);
  }

  if (adversarialAudit && (adversarialAudit.adversarialVerdict === 'REJECTED' || (adversarialAudit.auditScore !== undefined && adversarialAudit.auditScore < 70))) {
    failedGates.push(`Adversarial audit failed or rejected (${adversarialAudit.primaryFailureRisk || 'Counter-thesis active'})`);
  }

  if (dataQualityRating === 'LOW') {
    failedGates.push('Data quality rating is LOW');
  }

  if (collisionDetected) {
    failedGates.push('Immediate structural collision with opposing major liquidity pool');
  }

  if (conflicts.length >= 2) {
    failedGates.push(`Too many active conflicts (${conflicts.length}) for Grade A+`);
  }

  // 2. Count Independent Evidence Categories
  // Separate into independent domains: Structure, Momentum, Volume, Liquidity, Trendlines, News
  const categories = new Set<string>();
  for (const c of confirmations) {
    const lower = c.toLowerCase();
    if (lower.includes('structure') || lower.includes('bos') || lower.includes('choch') || lower.includes('highs') || lower.includes('lows')) {
      categories.add('STRUCTURE');
    }
    if (lower.includes('rsi') || lower.includes('macd') || lower.includes('momentum') || lower.includes('divergence')) {
      categories.add('MOMENTUM');
    }
    if (lower.includes('volume') || lower.includes('rvol') || lower.includes('surge') || lower.includes('climax')) {
      categories.add('VOLUME');
    }
    if (lower.includes('liquidity') || lower.includes('sweep') || lower.includes('fvg') || lower.includes('order block')) {
      categories.add('LIQUIDITY');
    }
    if (lower.includes('trendline') || lower.includes('channel') || lower.includes('pattern') || lower.includes('triangle')) {
      categories.add('GEOMETRY');
    }
    if (lower.includes('fibonacci') || lower.includes('golden pocket') || lower.includes('extension')) {
      categories.add('FIBONACCI');
    }
    if (lower.includes('orderflow') || lower.includes('cvd') || lower.includes('volume profile') || lower.includes('poc')) {
      categories.add('ORDERFLOW');
    }
    if (lower.includes('relative strength') || lower.includes('rs vs btc') || lower.includes('outperforming')) {
      categories.add('RELATIVE_STRENGTH');
    }
    if (lower.includes('derivatives') || lower.includes('open interest') || lower.includes('funding') || lower.includes('short squeeze')) {
      categories.add('DERIVATIVES');
    }
    if (lower.includes('catalyst') || lower.includes('news') || lower.includes('listing')) {
      categories.add('CATALYST');
    }
  }

  const independentCount = categories.size;
  if (independentCount < 3) {
    failedGates.push(`Independent evidence domains count (${independentCount}) below minimum required for A+ (3)`);
  }

  // 3. Evidence Correlation Penalty
  // If multiple momentum indicators are confirmed (e.g. RSI + MACD + Stoch), apply a penalty so they don't count as independent confirmations
  let momentumCount = 0;
  for (const c of confirmations) {
    const lower = c.toLowerCase();
    if (lower.includes('rsi') || lower.includes('macd') || lower.includes('stoch')) {
      momentumCount++;
    }
  }
  const evidenceCorrelationPenalty = momentumCount > 1 ? (momentumCount - 1) * 3 : 0;

  // 4. Timing Quality Score
  let timingQualityScore = 70;
  if (entryStatus === 'ENTRY_NOW') {
    timingQualityScore = 95;
  } else if (entryStatus === 'WAIT_FOR_PULLBACK' || entryStatus === 'WAIT_FOR_RETEST') {
    timingQualityScore = 80;
  } else if (entryStatus === 'WAIT_FOR_CONFIRMATION' || entryStatus === 'WAIT_FOR_ENTRY') {
    timingQualityScore = 75;
  } else if (entryStatus === 'ENTRY_MISSED' || entryStatus === 'INVALIDATED' || entryStatus === 'INVALID') {
    timingQualityScore = 20;
    failedGates.push(`Entry readiness state (${entryStatus}) is not actionable`);
  }

  // 5. Expected Move vs Risk Ratio
  const expectedMoveVsRiskRatio = riskRewardRatio;

  // 6. Correlated Market Risk
  let correlatedMarketRisk: 'HIGH' | 'MODERATE' | 'LOW' = 'LOW';
  if (btcRegime === 'VOLATILE' || btcRegime === 'BEARISH' && decision === 'LONG') {
    correlatedMarketRisk = 'HIGH';
    if (confidence < 90) {
      failedGates.push('Adverse correlated market environment (BTC direction opposing trade)');
    }
  } else if (btcRegime === 'NEUTRAL') {
    correlatedMarketRisk = 'MODERATE';
  }

  // 7. Calculate Supporting Score
  const rawSupporting = (confidence * 0.4) + (independentCount * 12) + (timingQualityScore * 0.25) - evidenceCorrelationPenalty - (conflicts.length * 8);
  const supportingScore = Math.max(0, Math.min(100, Math.round(rawSupporting)));

  // Critical Gates verdict
  const criticalGatesPassed = failedGates.length === 0;
  const isAplusQualified = criticalGatesPassed && independentCount >= 3 && supportingScore >= 85;

  if (!isAplusQualified && confidence >= 85) {
    falseAplusPrevented = true;
    falseAplusReason = failedGates.length > 0 ? failedGates.join('; ') : 'Insufficient independent multi-domain confluence';
  }

  const summary = isAplusQualified
    ? `A+ GRADE CONFIRMED: ${independentCount} independent domains, ${timingQualityScore}% timing score, R:R ${riskRewardRatio.toFixed(1)}`
    : `A+ Gated: ${failedGates.length > 0 ? failedGates[0] : 'Standard confluence'}`;

  return {
    isAplusQualified,
    isAPlus: isAplusQualified,
    recommendedGrade: isAplusQualified ? 'A+' : 'A',
    independentConfirmationsCount: independentCount,
    evidenceCorrelationPenalty,
    timingQualityScore,
    expectedMoveVsRiskRatio,
    correlatedMarketRisk,
    criticalGatesPassed,
    failedGates,
    supportingScore,
    falseAplusPrevented,
    falseAplusReason,
    summary
  };
}
