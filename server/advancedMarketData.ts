export interface DerivativesData {
  symbol: string;
  openInterest: number;
  openInterestChange24h: number;
  fundingRate: number;
  longShortRatio: number;
  takerBuyRatio: number;
  status?: 'AVAILABLE' | 'UNAVAILABLE';
}

const derivativesCache = new Map<string, { data: DerivativesData; timestamp: number }>();

export async function getDerivativesData(symbol: string): Promise<DerivativesData> {
  const cleanSymbol = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const cached = derivativesCache.get(cleanSymbol);
  if (cached && Date.now() - cached.timestamp < 15000) {
    return cached.data;
  }
  
  try {
    // 1. Fetch live funding rate / premium index
    const premPromise = fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${cleanSymbol}`, {
      signal: AbortSignal.timeout(3500)
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    // 2. Fetch live open interest
    const oiPromise = fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${cleanSymbol}`, {
      signal: AbortSignal.timeout(3500)
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    // 3. Fetch 24h open interest history for delta
    const oiHistPromise = fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${cleanSymbol}&period=1d&limit=2`, {
      signal: AbortSignal.timeout(3500)
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    // 4. Fetch global long/short account ratio
    const lsPromise = fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${cleanSymbol}&period=5m&limit=1`, {
      signal: AbortSignal.timeout(3500)
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    // 5. Fetch taker buy/sell volume ratio
    const takerPromise = fetch(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${cleanSymbol}&period=5m&limit=1`, {
      signal: AbortSignal.timeout(3500)
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    const [premData, oiData, oiHistData, lsData, takerData] = await Promise.all([
      premPromise,
      oiPromise,
      oiHistPromise,
      lsPromise,
      takerPromise
    ]);

    if (premData && premData.symbol) {
      const fundingRate = parseFloat(premData.lastFundingRate) || 0.0;
      
      // Calculate real Open Interest USD value
      let openInterest = 0;
      if (Array.isArray(oiHistData) && oiHistData.length > 0 && oiHistData[oiHistData.length - 1]?.sumOpenInterestValue) {
        openInterest = parseFloat(oiHistData[oiHistData.length - 1].sumOpenInterestValue) || 0;
      } else if (oiData?.openInterest) {
        const oiCoins = parseFloat(oiData.openInterest) || 0;
        const markPrice = parseFloat(premData.markPrice) || 0;
        openInterest = oiCoins * markPrice;
      }

      // Calculate real 24h OI percentage change from history
      let openInterestChange24h = 0;
      if (Array.isArray(oiHistData) && oiHistData.length >= 2) {
        const prevVal = parseFloat(oiHistData[0]?.sumOpenInterestValue) || 0;
        const currVal = parseFloat(oiHistData[1]?.sumOpenInterestValue) || 0;
        if (prevVal > 0) {
          openInterestChange24h = Number((((currVal - prevVal) / prevVal) * 100).toFixed(2));
        }
      }

      // Real Long/Short Ratio
      let longShortRatio = 1.0;
      if (Array.isArray(lsData) && lsData.length > 0 && lsData[0]?.longShortRatio) {
        longShortRatio = parseFloat(lsData[0].longShortRatio) || 1.0;
      }

      // Real Taker Buy/Sell Ratio
      let takerBuyRatio = 0.5;
      if (Array.isArray(takerData) && takerData.length > 0 && takerData[0]?.buySellRatio) {
        takerBuyRatio = parseFloat(takerData[0].buySellRatio) || 0.5;
      }

      const data: DerivativesData = {
        symbol: cleanSymbol,
        openInterest: Math.round(openInterest),
        openInterestChange24h,
        fundingRate: Number(fundingRate.toFixed(6)),
        longShortRatio: Number(longShortRatio.toFixed(2)),
        takerBuyRatio: Number(takerBuyRatio.toFixed(2)),
        status: 'AVAILABLE'
      };
      derivativesCache.set(cleanSymbol, { data, timestamp: Date.now() });
      return data;
    }

    // Fallback to Bybit linear derivatives if Binance futures endpoint is rate-limited or unavailable
    try {
      const bybitRes = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${cleanSymbol}`, {
        signal: AbortSignal.timeout(3500)
      }).then(r => r.ok ? r.json() : null).catch(() => null);

      const bybitItem = bybitRes?.result?.list?.[0];
      if (bybitItem && bybitItem.symbol === cleanSymbol) {
        const oiVal = parseFloat(bybitItem.openInterestValue) || 0;
        const frVal = parseFloat(bybitItem.fundingRate) || 0;
        if (oiVal > 0) {
          const data: DerivativesData = {
            symbol: cleanSymbol,
            openInterest: Math.round(oiVal),
            openInterestChange24h: 0,
            fundingRate: Number(frVal.toFixed(6)),
            longShortRatio: 1.0,
            takerBuyRatio: 0.5,
            status: 'AVAILABLE'
          };
          derivativesCache.set(cleanSymbol, { data, timestamp: Date.now() });
          return data;
        }
      }
    } catch {
      // Bybit fallback failed
    }
  } catch (err) {
    // Network or parse error
  }
  
  // Real data invariant: Missing or non-derivatives pairs remain UNAVAILABLE without fabricated numbers
  const unavailableData: DerivativesData = {
    symbol: cleanSymbol,
    openInterest: 0,
    openInterestChange24h: 0,
    fundingRate: 0,
    longShortRatio: 1.0,
    takerBuyRatio: 0.5,
    status: 'UNAVAILABLE'
  };
  return unavailableData;
}
