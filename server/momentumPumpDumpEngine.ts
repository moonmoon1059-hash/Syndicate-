import { Candle } from './cryptoService';
import { calculateEMA, calculateRSI, calculateATR, calculateRVOL } from './technicalAnalysis';
import { PumpDumpIntelligence } from '../src/types/crypto';
import { ProcessedNews } from './newsIntelligenceEngine';

/**
 * Momentum, Pump & Dump Intelligence Engine
 * Evaluates real-time momentum acceleration, volume explosion, pump ignition,
 * climax detection, fake-pump traps, dump risks, and sell-the-news behavior.
 */
export function evaluatePumpDumpIntelligence(
  candles: Candle[],
  newsList: ProcessedNews[] = [],
  symbol: string = 'BTCUSDT'
): PumpDumpIntelligence {
  if (!candles || candles.length < 20) {
    return {
      acceleration: 'NEUTRAL',
      volumeAcceleration: 'NORMAL',
      pumpIgnition: false,
      fakePumpRisk: 'LOW',
      climaxDetected: false,
      postPumpExhaustion: false,
      dumpRisk: 'LOW',
      liquidityVacuum: false,
      abnormalExtension: false,
      sellTheNewsRisk: false,
      warningDetails: ['Insufficient candle history for pump/dump analysis'],
      setupValid: false,
      catalystSupportSummary: 'UNKNOWN data'
    };
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const n = candles.length;
  const current = closes[n - 1];

  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const currentEma20 = ema20[ema20.length - 1] || current;
  const currentEma50 = ema50[ema50.length - 1] || current;
  const rsi = calculateRSI(closes, 14);
  const currentRsi = rsi[rsi.length - 1];
  const prevRsi = rsi[rsi.length - 2] || currentRsi;
  const rvol = calculateRVOL(volumes, 20);
  const atrArr = calculateATR(candles, 14);
  const currentAtr = atrArr[atrArr.length - 1] || current * 0.02;

  // Rate of change & acceleration
  const move3BarsPct = ((current - closes[Math.max(0, n - 4)]) / closes[Math.max(0, n - 4)]) * 100;
  const move1BarPct = ((current - closes[n - 2]) / closes[n - 2]) * 100;
  const prev1BarPct = ((closes[n - 2] - closes[n - 3]) / closes[n - 3]) * 100;

  // 1. Acceleration
  let acceleration: 'ACCELERATING' | 'STEADY' | 'DECELERATING' | 'NEUTRAL' = 'NEUTRAL';
  if (Math.abs(move1BarPct) > Math.abs(prev1BarPct) * 1.4 && Math.abs(move1BarPct) > 1.5) {
    acceleration = 'ACCELERATING';
  } else if (Math.abs(move1BarPct) < Math.abs(prev1BarPct) * 0.6 && Math.abs(prev1BarPct) > 2.0) {
    acceleration = 'DECELERATING';
  } else if (Math.abs(move3BarsPct) > 3.0) {
    acceleration = 'STEADY';
  }

  // 2. Volume Acceleration
  let volumeAcceleration: 'EXPLOSIVE' | 'ABOVE_AVERAGE' | 'NORMAL' | 'DRYING_UP' = 'NORMAL';
  if (rvol >= 3.0) {
    volumeAcceleration = 'EXPLOSIVE';
  } else if (rvol >= 1.6) {
    volumeAcceleration = 'ABOVE_AVERAGE';
  } else if (rvol <= 0.65) {
    volumeAcceleration = 'DRYING_UP';
  }

  // 3. Price Extension vs EMA20
  const distanceFromEma20 = current - currentEma20;
  const distanceFromEma20Pct = (distanceFromEma20 / currentEma20) * 100;
  const atrExtensionMultiple = Math.abs(distanceFromEma20) / (currentAtr || 1);

  // 4. Climax Detection (Parabolic blow-off or panic dump)
  const isUpperWickRejection = highs[n - 1] - Math.max(closes[n - 1], candles[n - 1].open) > (highs[n - 1] - lows[n - 1]) * 0.50;
  const isLowerWickRejection = Math.min(closes[n - 1], candles[n - 1].open) - lows[n - 1] > (highs[n - 1] - lows[n - 1]) * 0.50;

  // Protect fresh early-stage breakout velocity from false exhaustion alarms:
  // An asset breaking out with high volume from a tight base is PUMP IGNITION, not exhaustion.
  const isFreshBreakoutCandle = move1BarPct > 2.0 && rvol >= 1.5 && !isUpperWickRejection && currentRsi <= 80;
  const abnormalExtension = (atrExtensionMultiple > 4.2 || Math.abs(distanceFromEma20Pct) > 16.0) && !isFreshBreakoutCandle;

  const climaxDetected = (currentRsi >= 82 || (currentRsi >= 76 && isUpperWickRejection)) && rvol >= 2.5 && !isFreshBreakoutCandle;

  // 5. Post-Pump Exhaustion
  const postPumpExhaustion = (currentRsi > 78 && acceleration === 'DECELERATING') || (abnormalExtension && isUpperWickRejection);

  // 6. Pump Ignition
  // Ignition requires: Price breaking out with volume acceleration, RSI healthy (50 - 80), not yet climactically exhausted
  const pumpIgnition = !climaxDetected && volumeAcceleration !== 'DRYING_UP' && move1BarPct > 1.2 && currentRsi >= 50 && currentRsi <= 80 && !isUpperWickRejection;

  // 7. Fake-Pump Detection
  // Low volume expansion into resistance or immediate wick rejection after break
  const fakePumpRisk: 'HIGH' | 'MODERATE' | 'LOW' = (
    (move1BarPct > 2.5 && rvol < 0.8) || // Price jump with dry volume
    (highs[n - 1] > highs[n - 2] && isUpperWickRejection && rvol > 1.5 && current < candles[n - 1].open) // Wick trap
  ) ? 'HIGH' : (abnormalExtension ? 'MODERATE' : 'LOW');

  // 8. Liquidity Vacuum
  // Fast gaps where volume traded was sparse and bid-ask depth is thin
  const liquidityVacuum = Math.abs(move1BarPct) > 4.0 && rvol < 1.1;

  // 9. Sell-The-News Behavior
  const cleanSym = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const baseSym = cleanSym.replace('USDT', '').replace('BUSD', '').replace('USDC', '');
  const relevantNews = newsList.filter(n => n.relatedCoins.includes(baseSym) || n.relatedCoins.includes(cleanSym));
  
  let sellTheNewsRisk = false;
  if (relevantNews.length > 0) {
    const topNews = relevantNews[0];
    if (topNews.sentiment === 'BULLISH' && (move3BarsPct < -2.0 || isUpperWickRejection) && currentRsi < 50) {
      sellTheNewsRisk = true;
    }
  }

  // 10. Overall Dump Risk
  let dumpRisk: 'CRITICAL' | 'ELEVATED' | 'MODERATE' | 'LOW' = 'LOW';
  if (climaxDetected || (postPumpExhaustion && isUpperWickRejection) || fakePumpRisk === 'HIGH') {
    dumpRisk = 'CRITICAL';
  } else if (abnormalExtension || sellTheNewsRisk || currentRsi > 78) {
    dumpRisk = 'ELEVATED';
  } else if (currentRsi > 68) {
    dumpRisk = 'MODERATE';
  }

  // 11. Move Classification
  let moveClassification: 'EARLY_PUMP_SETUP' | 'CONFIRMED_PUMP' | 'EARLY_DUMP_SETUP' | 'CONFIRMED_DUMP' | 'NORMAL_MOVE' | 'NO_TRADE' = 'NORMAL_MOVE';
  if (dumpRisk === 'CRITICAL' && move1BarPct < -2.0) {
    moveClassification = 'CONFIRMED_DUMP';
  } else if (dumpRisk === 'CRITICAL' || (climaxDetected && isUpperWickRejection)) {
    moveClassification = 'EARLY_DUMP_SETUP';
  } else if (pumpIgnition && (volumeAcceleration === 'EXPLOSIVE' || volumeAcceleration === 'ABOVE_AVERAGE')) {
    moveClassification = 'CONFIRMED_PUMP';
  } else if (pumpIgnition || (acceleration === 'ACCELERATING' && rvol >= 1.3 && currentRsi >= 50 && currentRsi <= 76)) {
    moveClassification = 'EARLY_PUMP_SETUP';
  } else if (fakePumpRisk === 'HIGH' || liquidityVacuum) {
    moveClassification = 'NO_TRADE';
  } else {
    moveClassification = 'NORMAL_MOVE';
  }

  const warningDetails: string[] = [];
  if (climaxDetected) warningDetails.push('Climactic blow-off volume detected near resistance; immediate mean reversion risk');
  if (postPumpExhaustion) warningDetails.push('Post-pump exhaustion: upward velocity slowing after extended run');
  if (abnormalExtension) warningDetails.push(`Abnormal extension (${atrExtensionMultiple.toFixed(1)}x ATR from EMA20)`);
  if (fakePumpRisk === 'HIGH') warningDetails.push('High fake-pump trap risk: price surge lacking authentic institutional volume');
  if (liquidityVacuum) warningDetails.push('Liquidity vacuum detected: sharp displacement on thin volume');
  if (sellTheNewsRisk) warningDetails.push('Sell-the-news distribution behavior: price rejecting despite bullish headline');

  // Setup validity
  const setupValid = !climaxDetected && fakePumpRisk !== 'HIGH' && dumpRisk !== 'CRITICAL';
  const catalystSupportSummary = relevantNews.length > 0
    ? `${relevantNews.length} catalyst(s) mapped: ${relevantNews[0].title.slice(0, 60)}...`
    : 'No active high-impact breaking news catalyst; technical momentum driven';

  return {
    acceleration,
    volumeAcceleration,
    pumpIgnition,
    fakePumpRisk,
    climaxDetected,
    postPumpExhaustion,
    dumpRisk,
    liquidityVacuum,
    abnormalExtension,
    sellTheNewsRisk,
    warningDetails,
    setupValid,
    catalystSupportSummary,
    moveClassification
  };
}
