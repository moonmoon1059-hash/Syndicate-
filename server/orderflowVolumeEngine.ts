import { Candle } from './cryptoService';
import {
  OrderflowReport,
  CumulativeVolumeDeltaReport,
  VolumeProfileReport,
  OrderBookImbalanceReport
} from '../src/types/crypto';

export interface OrderBookData {
  bids: [number, number][]; // [price, size]
  asks: [number, number][];
  timestamp?: number;
}

/**
 * Orderflow & Volume Intelligence Engine
 * Computes deterministic Cumulative Volume Delta (CVD), CVD Divergences,
 * Volume Profile (POC, VAH, VAL, LVN), and Order-Book Imbalance with Spoofing Protection.
 */
export function analyzeOrderflow(
  candles: Candle[],
  orderBook?: OrderBookData | null
): OrderflowReport {
  if (!candles || candles.length < 10) {
    return {
      cvd: {
        cumulativeDelta: 0,
        deltaTrend: 'FLAT',
        divergence: { detected: false, type: 'NONE', description: 'Insufficient candle data.' },
        status: 'UNAVAILABLE'
      },
      volumeProfile: {
        poc: 0,
        vah: 0,
        val: 0,
        lvn: [],
        valueAreaVolumePct: 70,
        currentVsPoc: 'AT_POC',
        profileRangeLow: 0,
        profileRangeHigh: 0
      },
      orderBookImbalance: {
        obiPercent: 0,
        bidDepthPressure: 'UNKNOWN',
        spoofingRisk: 'UNKNOWN',
        status: 'UNAVAILABLE',
        details: 'No live order book feed provided.'
      },
      status: 'UNAVAILABLE',
      summary: 'Orderflow data unavailable.'
    };
  }

  const currentPrice = candles[candles.length - 1].close;

  // 1. Calculate Cumulative Volume Delta (CVD)
  const cvdSeries: number[] = [];
  let runningCvd = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const range = c.high - c.low || 1;
    // Fractional buying pressure based on candle close location within range
    const buyingRatio = (c.close - c.low) / range;
    const sellingRatio = (c.high - c.close) / range;
    const barDelta = c.volume * (buyingRatio - sellingRatio);
    runningCvd += barDelta;
    cvdSeries.push(runningCvd);
  }

  const cvdLookback = Math.min(20, candles.length);
  const recentCvd = cvdSeries.slice(-cvdLookback);
  const cvdStart = recentCvd[0];
  const cvdEnd = recentCvd[recentCvd.length - 1];
  const deltaTrend: 'RISING' | 'FALLING' | 'FLAT' =
    cvdEnd > cvdStart * 1.05 ? 'RISING' : cvdEnd < cvdStart * 0.95 ? 'FALLING' : 'FLAT';

  // Check Price / CVD Divergence over the lookback window
  const priceStart = candles[candles.length - cvdLookback].close;
  const priceEnd = currentPrice;
  const priceChangePct = (priceEnd - priceStart) / priceStart;
  const cvdChangePct = cvdStart !== 0 ? (cvdEnd - cvdStart) / Math.abs(cvdStart) : 0;

  let divergence: { detected: boolean; type: 'BULLISH_CVD_DIVERGENCE' | 'BEARISH_CVD_DIVERGENCE' | 'NONE'; description: string } = {
    detected: false,
    type: 'NONE',
    description: 'No divergence detected between Price and CVD.'
  };

  // Bullish CVD Divergence: Price making lower or flat move while CVD is aggressively rising (absorption)
  if (priceChangePct <= -0.01 && cvdChangePct >= 0.08) {
    divergence = {
      detected: true,
      type: 'BULLISH_CVD_DIVERGENCE',
      description: 'Bullish CVD Divergence: Aggressive spot/limit absorption detected while price is depressed.'
    };
  } else if (priceChangePct >= 0.02 && cvdChangePct <= -0.08) {
    divergence = {
      detected: true,
      type: 'BEARISH_CVD_DIVERGENCE',
      description: 'Bearish CVD Divergence: Price pushed higher on decaying volume delta (exhaustion buying).'
    };
  }

  const cvdReport: CumulativeVolumeDeltaReport = {
    cumulativeDelta: Math.round(runningCvd),
    deltaTrend,
    divergence,
    status: 'AVAILABLE'
  };

  // 2. Compute Volume Profile (POC, VAH, VAL, LVN)
  const profileLookback = Math.min(50, candles.length);
  const profileCandles = candles.slice(-profileLookback);

  const minPrice = Math.min(...profileCandles.map(c => c.low));
  const maxPrice = Math.max(...profileCandles.map(c => c.high));
  const priceSpan = maxPrice - minPrice;

  const numBins = 40;
  const binSize = priceSpan > 0 ? priceSpan / numBins : 1;
  const bins: { price: number; volume: number }[] = [];

  for (let b = 0; b < numBins; b++) {
    bins.push({ price: minPrice + b * binSize + binSize / 2, volume: 0 });
  }

  let totalProfileVolume = 0;
  for (const c of profileCandles) {
    const cLow = c.low;
    const cHigh = c.high;
    const cVol = c.volume;
    totalProfileVolume += cVol;

    // Distribute candle volume across intersecting bins
    let intersectedBins = 0;
    for (let b = 0; b < numBins; b++) {
      const bMin = minPrice + b * binSize;
      const bMax = bMin + binSize;
      if (cHigh >= bMin && cLow <= bMax) intersectedBins++;
    }

    if (intersectedBins > 0) {
      const volPerBin = cVol / intersectedBins;
      for (let b = 0; b < numBins; b++) {
        const bMin = minPrice + b * binSize;
        const bMax = bMin + binSize;
        if (cHigh >= bMin && cLow <= bMax) {
          bins[b].volume += volPerBin;
        }
      }
    }
  }

  // Find POC (Point of Control)
  let maxBinIndex = 0;
  let maxBinVolume = 0;
  for (let b = 0; b < bins.length; b++) {
    if (bins[b].volume > maxBinVolume) {
      maxBinVolume = bins[b].volume;
      maxBinIndex = b;
    }
  }
  const poc = bins[maxBinIndex]?.price || currentPrice;

  // Calculate Value Area (70% total volume around POC)
  const targetVaVolume = totalProfileVolume * 0.7;
  let accumulatedVolume = maxBinVolume;
  let lowerIndex = maxBinIndex;
  let upperIndex = maxBinIndex;

  while (accumulatedVolume < targetVaVolume && (lowerIndex > 0 || upperIndex < numBins - 1)) {
    const nextLowerVol = lowerIndex > 0 ? bins[lowerIndex - 1].volume : 0;
    const nextUpperVol = upperIndex < numBins - 1 ? bins[upperIndex + 1].volume : 0;

    if (nextLowerVol >= nextUpperVol && lowerIndex > 0) {
      lowerIndex--;
      accumulatedVolume += bins[lowerIndex].volume;
    } else if (upperIndex < numBins - 1) {
      upperIndex++;
      accumulatedVolume += bins[upperIndex].volume;
    } else if (lowerIndex > 0) {
      lowerIndex--;
      accumulatedVolume += bins[lowerIndex].volume;
    } else {
      break;
    }
  }

  const val = bins[lowerIndex]?.price || minPrice;
  const vah = bins[upperIndex]?.price || maxPrice;

  // Low Volume Nodes (LVN): Bins with volume < 30% of average bin volume
  const avgBinVolume = totalProfileVolume / numBins;
  const lvn: number[] = [];
  for (let b = 1; b < numBins - 1; b++) {
    if (bins[b].volume < avgBinVolume * 0.35) {
      lvn.push(Number(bins[b].price.toFixed(4)));
    }
  }

  const currentVsPoc: 'ABOVE_POC' | 'BELOW_POC' | 'AT_POC' =
    currentPrice > poc * 1.005 ? 'ABOVE_POC' : currentPrice < poc * 0.995 ? 'BELOW_POC' : 'AT_POC';

  const volumeProfileReport: VolumeProfileReport = {
    poc,
    vah,
    val,
    lvn: lvn.slice(0, 5),
    valueAreaVolumePct: 70,
    currentVsPoc,
    profileRangeLow: minPrice,
    profileRangeHigh: maxPrice
  };

  // 3. Order Book Imbalance & Spoofing Guard (Only when orderBook exists)
  let orderBookReport: OrderBookImbalanceReport = {
    obiPercent: 0,
    bidDepthPressure: 'UNKNOWN',
    spoofingRisk: 'UNKNOWN',
    status: 'UNAVAILABLE',
    details: 'Order book depth feed unavailable.'
  };

  if (orderBook && Array.isArray(orderBook.bids) && Array.isArray(orderBook.asks) && orderBook.bids.length > 0) {
    const totalBidDepth = orderBook.bids.reduce((sum, [, size]) => sum + size, 0);
    const totalAskDepth = orderBook.asks.reduce((sum, [, size]) => sum + size, 0);
    const totalDepth = totalBidDepth + totalAskDepth;

    if (totalDepth > 0) {
      const obiPercent = Math.round(((totalBidDepth - totalAskDepth) / totalDepth) * 100);
      const bidDepthPressure: 'BIDS_DOMINANT' | 'ASKS_DOMINANT' | 'BALANCED' =
        obiPercent >= 20 ? 'BIDS_DOMINANT' : obiPercent <= -20 ? 'ASKS_DOMINANT' : 'BALANCED';

      // Check for spoofing / wall-traps: single order > 40% of total side depth
      let spoofingRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      let bidWallPrice: number | undefined;
      let askWallPrice: number | undefined;

      const maxBid = orderBook.bids.reduce((max, curr) => curr[1] > max[1] ? curr : max, [0, 0]);
      const maxAsk = orderBook.asks.reduce((max, curr) => curr[1] > max[1] ? curr : max, [0, 0]);

      if (maxBid[1] > totalBidDepth * 0.45) {
        spoofingRisk = 'HIGH';
        bidWallPrice = maxBid[0];
      }
      if (maxAsk[1] > totalAskDepth * 0.45) {
        spoofingRisk = 'HIGH';
        askWallPrice = maxAsk[0];
      }

      orderBookReport = {
        obiPercent,
        bidDepthPressure,
        spoofingRisk,
        bidWallPrice,
        askWallPrice,
        status: 'AVAILABLE',
        details: `OBI: ${obiPercent >= 0 ? '+' : ''}${obiPercent}% (${bidDepthPressure})${spoofingRisk === 'HIGH' ? ' | Wall-trap / spoofing risk detected' : ''}`
      };
    }
  }

  // Summary
  const summary = `CVD: ${deltaTrend} (${divergence.detected ? divergence.type : 'No divergence'}) | VP: POC @ $${poc.toFixed(2)} [VAL: $${val.toFixed(2)} - VAH: $${vah.toFixed(2)}]`;

  return {
    cvd: cvdReport,
    volumeProfile: volumeProfileReport,
    orderBookImbalance: orderBookReport,
    status: 'AVAILABLE',
    summary
  };
}
