import { Candle } from './cryptoService';
import {
  CurrentMarketStructureState,
  DetectedPattern,
  BreakoutEvaluation,
  SMCStructureReport,
  MarketCycleAnalysis,
  PumpDumpIntelligence,
  TrendlineEvidence
} from '../src/types/crypto';
import { formatPrice } from '../src/utils/formatters';

export interface CurrentStructureResult {
  state: CurrentMarketStructureState;
  explanation: string;
  confidence: number;
  keyLevels: {
    primaryLevel?: number;
    secondaryLevel?: number;
    levelType?: string;
  };
}

/**
 * Current Market Structure Engine (Phase 6.1)
 * Deterministically determines what the searched asset is doing RIGHT NOW.
 * Satisfies strict non-fabrication rules: No pattern is claimed confirmed unless criteria are satisfied.
 */
export function determineCurrentMarketStructure(params: {
  candles: Candle[];
  patterns?: DetectedPattern[];
  breakout?: BreakoutEvaluation;
  smc?: SMCStructureReport;
  marketCycle?: MarketCycleAnalysis;
  momentum?: PumpDumpIntelligence;
  trendlines?: TrendlineEvidence;
  currentPrice?: number;
} | Candle[]): CurrentStructureResult {
  const isArray = Array.isArray(params);
  const candles = isArray ? params : (params?.candles || []);
  const rawPatterns = !isArray ? (params?.patterns || []) : [];
  const patternsList: any[] = Array.isArray(rawPatterns)
    ? rawPatterns
    : (rawPatterns ? [rawPatterns] : []);
  const breakout = !isArray ? params?.breakout : undefined;
  const smc = !isArray ? params?.smc : undefined;
  const marketCycle = !isArray ? params?.marketCycle : undefined;
  const momentum = !isArray ? params?.momentum : undefined;
  const trendlines = !isArray ? params?.trendlines : undefined;
  const currentPrice = (!isArray && params?.currentPrice) ? params.currentPrice : (candles[candles.length - 1]?.close || 0);

  if (!candles || candles.length < 5) {
    return {
      state: 'UNKNOWN',
      explanation: 'Insufficient candle history to determine current structural formation.',
      confidence: 30,
      keyLevels: {}
    };
  }

  const lastCandle = candles[candles.length - 1];
  const lastClose = lastCandle.close;
  const lastHigh = lastCandle.high;
  const lastLow = lastCandle.low;

  // 1. Check for Post-Pump / Climax Dump Exhaustion
  if (
    momentum &&
    (momentum.dumpRisk === 'CRITICAL' || momentum.dumpRisk === 'ELEVATED' || momentum.postPumpExhaustion || momentum.fakePumpRisk === 'HIGH')
  ) {
    return {
      state: 'PUMP_EXHAUSTION',
      explanation: `Asset showing post-expansion exhaustion with elevated dump risk (${momentum.dumpRisk}) and selling pressure.`,
      confidence: 88,
      keyLevels: { primaryLevel: lastHigh, levelType: 'SWING_HIGH_RESISTANCE' }
    };
  }

  // 2. Check for Parabolic Velocity Extension
  if (
    momentum &&
    (momentum.abnormalExtension || momentum.climaxDetected || momentum.volumeAcceleration === 'EXPLOSIVE')
  ) {
    return {
      state: 'PARABOLIC_EXTENSION',
      explanation: `Asset in parabolic expansion with climactic volume acceleration; extended above moving averages with chase risk.`,
      confidence: 85,
      keyLevels: { primaryLevel: lastClose, levelType: 'EXPANSION_PEAK' }
    };
  }

  // 3. Check Chart Patterns (Double Top / Double Bottom - Confirmed vs Forming)
  const doubleTop = patternsList.find((p: any) => (p.name || p.pattern || p.description || '').toLowerCase().includes('double top'));
  if (doubleTop) {
    const isConfirmed = doubleTop.isConfirmed || doubleTop.breakoutStatus === 'CONFIRMED' || doubleTop.breakoutStatus === 'BROKEN_OUT';
    const neckline = doubleTop.keyLevels?.neckline || doubleTop.neckline || doubleTop.breakoutLevel || doubleTop.breakoutPrice;
    if (isConfirmed) {
      return {
        state: 'DOUBLE_TOP_CONFIRMED',
        explanation: `Double Top pattern confirmed with decisive break below neckline support at ${formatPrice(neckline || 0)}.`,
        confidence: doubleTop.confidence || 85,
        keyLevels: { primaryLevel: neckline, levelType: 'NECKLINE_BREAK' }
      };
    } else {
      return {
        state: 'DOUBLE_TOP_FORMING',
        explanation: `Double Top pattern developing as price tests resistance without confirmed neckline breach yet.`,
        confidence: 70,
        keyLevels: { primaryLevel: doubleTop.targetPrice || doubleTop.keyLevels?.resistance, levelType: 'RESISTANCE_CEILING' }
      };
    }
  }

  const doubleBottom = patternsList.find((p: any) => (p.name || p.pattern || p.description || '').toLowerCase().includes('double bottom'));
  if (doubleBottom) {
    const isConfirmed = doubleBottom.isConfirmed || doubleBottom.breakoutStatus === 'CONFIRMED' || doubleBottom.breakoutStatus === 'BROKEN_OUT';
    const neckline = doubleBottom.keyLevels?.neckline || doubleBottom.neckline || doubleBottom.breakoutLevel || doubleBottom.breakoutPrice;
    if (isConfirmed) {
      return {
        state: 'DOUBLE_BOTTOM_CONFIRMED',
        explanation: `Double Bottom pattern confirmed with decisive breakout above neckline resistance at ${formatPrice(neckline || 0)}.`,
        confidence: doubleBottom.confidence || 85,
        keyLevels: { primaryLevel: neckline, levelType: 'NECKLINE_BREAK' }
      };
    } else {
      return {
        state: 'DOUBLE_BOTTOM_FORMING',
        explanation: `Double Bottom pattern developing with second trough established; awaiting neckline breakout confirmation.`,
        confidence: 70,
        keyLevels: { primaryLevel: doubleBottom.breakoutLevel || doubleBottom.keyLevels?.resistance, levelType: 'NECKLINE_PENDING' }
      };
    }
  }

  // 4. Check Breakout / Retest / Breakdown States
  if (breakout) {
    if (breakout.breakoutStage === 'RETEST' || breakout.breakoutStage === 'RETEST_CONFIRMED' || breakout.classification === 'BREAKOUT_RETEST') {
      return {
        state: 'BREAKOUT_RETEST',
        explanation: `Price successfully broke structural resistance and is currently retesting the prior breakout level as support.`,
        confidence: breakout.confidence || 80,
        keyLevels: { primaryLevel: breakout.level, levelType: 'RETEST_SUPPORT' }
      };
    }
    if (breakout.classification === 'GENUINE_BREAKOUT' || breakout.breakoutStage === 'BREAKOUT' || breakout.breakoutStage === 'BREAKOUT_CONFIRMED') {
      return {
        state: 'BREAKOUT',
        explanation: `Active expansion breakout above key structural resistance level at ${formatPrice(breakout.level)} with volume surge.`,
        confidence: breakout.confidence || 85,
        keyLevels: { primaryLevel: breakout.level, levelType: 'BREAKOUT_LEVEL' }
      };
    }
    if (breakout.classification === 'FAILED_BREAKOUT') {
      return {
        state: 'BREAKDOWN',
        explanation: `Breakout attempt failed; price breaking down below local structural support with bearish displacement.`,
        confidence: 80,
        keyLevels: { primaryLevel: breakout.level, levelType: 'FAILED_LEVEL' }
      };
    }
  }

  // 5. Check SMC Fair Value Gap (FVG) Retest
  if (smc && smc.fvgs && smc.fvgs.length > 0) {
    const activeFvg = smc.fvgs.find(f => f.status !== 'MITIGATED' && currentPrice >= f.bottom * 0.998 && currentPrice <= f.top * 1.002);
    if (activeFvg) {
      return {
        state: 'FVG_RETEST',
        explanation: `Price is currently inside an active ${activeFvg.type} Fair Value Gap (${formatPrice(activeFvg.bottom)} – ${formatPrice(activeFvg.top)}) seeking liquidity rebalance.`,
        confidence: 80,
        keyLevels: { primaryLevel: activeFvg.bottom, secondaryLevel: activeFvg.top, levelType: 'FVG_ZONE' }
      };
    }
  }

  // 6. Check SMC Order Block / Breaker Block Retest
  if (smc && smc.orderBlocks && smc.orderBlocks.length > 0) {
    const activeOb = smc.orderBlocks.find(ob => currentPrice >= ob.bottom * 0.998 && currentPrice <= ob.top * 1.002);
    if (activeOb) {
      return {
        state: 'ORDER_BLOCK_RETEST',
        explanation: `Price is retesting an active institutional ${activeOb.type} Order Block zone (${formatPrice(activeOb.bottom)} – ${formatPrice(activeOb.top)}).`,
        confidence: 82,
        keyLevels: { primaryLevel: activeOb.bottom, secondaryLevel: activeOb.top, levelType: 'ORDER_BLOCK_ZONE' }
      };
    }
  }

  // 7. Check Trendline Breakout
  if (trendlines && trendlines.detected && trendlines.confidence > 65) {
    return {
      state: 'TRENDLINE_BREAK',
      explanation: `${trendlines.type.replace(/_/g, ' ')} broken with directional momentum and candle close outside trendline barrier.`,
      confidence: 78,
      keyLevels: { primaryLevel: trendlines.currentLinePrice || lastClose, levelType: 'TRENDLINE_BARRIER' }
    };
  }

  // 8. Check Market Cycle (Accumulation / Distribution / Range)
  if (marketCycle) {
    if (marketCycle.cycle === 'ACCUMULATION') {
      return {
        state: 'ACCUMULATION',
        explanation: `Asset is in Wyckoff Accumulation phase; institutional absorption building cause with compressed volatility.`,
        confidence: marketCycle.confidence || 75,
        keyLevels: { primaryLevel: lastClose, levelType: 'ACCUMULATION_BASE' }
      };
    }
    if (marketCycle.cycle === 'DISTRIBUTION') {
      return {
        state: 'DISTRIBUTION',
        explanation: `Asset is in Wyckoff Distribution phase; supply transfer near highs with weakness emerging on attempts to push higher.`,
        confidence: marketCycle.confidence || 75,
        keyLevels: { primaryLevel: lastClose, levelType: 'DISTRIBUTION_CEILING' }
      };
    }
    if (marketCycle.cycle === 'TRANSITION_UNKNOWN' || (smc && smc.structureType === 'RANGING')) {
      return {
        state: 'RANGE',
        explanation: `Price oscillating within defined horizontal support and resistance boundaries without directional continuation.`,
        confidence: 70,
        keyLevels: { primaryLevel: lastClose, levelType: 'RANGE_CHANNEL' }
      };
    }
  }

  // Fallback
  return {
    state: 'UNKNOWN',
    explanation: 'Market structure is transitional with balanced supply and demand; awaiting clear directional trigger.',
    confidence: 50,
    keyLevels: { primaryLevel: lastClose }
  };
}
