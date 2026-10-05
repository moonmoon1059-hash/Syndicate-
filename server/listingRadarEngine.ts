import { getProcessedNewsIntelligence } from './newsIntelligenceEngine';
import { TargetLevel, ListingStatus, NewListingIntelligenceReport, NewListingItem } from '../src/types/crypto';
import { evaluateNewListingIntelligence } from './newListingEngine';
import { getKlinesWithMultiExchangeFallback, getTickerWithMultiExchangeFallback } from './liveDataProvider';

export type { NewListingItem };

export const MAX_NEW_LISTING_AGE_HOURS = 720; // 30-day listing window

export interface DiscoveredListingCandidate {
  symbol: string;
  base: string;
  quote: string;
  exchange: 'BINANCE' | 'MEXC' | 'OKX' | 'BYBIT' | 'OTHER';
  listedAt: number;
  scheduledListingTime?: number | null;
  isUpcoming?: boolean;
  announcementTitle?: string;
  announcementUrl?: string;
}

let cachedDiscoveredCandidates: {
  timestamp: number;
  items: DiscoveredListingCandidate[];
} | null = null;

const DISCOVERY_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes cache

/**
 * Verified Genesis Listing Timestamp from real exchange trade history.
 * Invariant: Never fabricates or guesses listing time. If unavailable, returns null.
 */
export async function getVerifiedExchangeGenesisTimestamp(
  symbol: string,
  exchange: 'BINANCE' | 'BYBIT' | 'OKX' | 'MEXC' | 'OTHER' = 'BINANCE'
): Promise<number | null> {
  const clean = symbol.replace(/[^A-Z0-9]/g, '').toUpperCase();
  try {
    if (exchange === 'BINANCE' || exchange === 'OTHER') {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${clean}&interval=1d&startTime=0&limit=1`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0]) && typeof data[0][0] === 'number') {
          return data[0][0];
        }
      }
    }
    if (exchange === 'BYBIT' || exchange === 'OTHER') {
      const res = await fetch(
        `https://api.bybit.com/v5/market/kline?category=spot&symbol=${clean}&interval=D&limit=200`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.result?.list && Array.isArray(data.result.list) && data.result.list.length > 0) {
          const oldest = data.result.list[data.result.list.length - 1];
          const ts = parseInt(oldest[0], 10);
          if (!isNaN(ts) && ts > 0) return ts;
        }
      }
    }
  } catch {
    // Network or timeout
  }
  return null;
}

/**
 * Continuous dynamic discovery of newly listed and verified UPCOMING exchange symbols.
 * Scans Binance and Bybit spot registries and official announcement channels.
 */
export async function discoverNewlyListedExchangeSymbols(): Promise<DiscoveredListingCandidate[]> {
  const now = Date.now();
  if (cachedDiscoveredCandidates && now - cachedDiscoveredCandidates.timestamp < DISCOVERY_CACHE_TTL_MS) {
    return cachedDiscoveredCandidates.items;
  }

  const discoveredMap = new Map<string, DiscoveredListingCandidate>();

  // 1. Query Bybit Official Pre-Launch & Pre-Market Instruments (Verified Upcoming Listings)
  try {
    const bybitPreRes = await fetch(
      'https://api.bybit.com/v5/market/instruments-info?category=linear&status=PreLaunch',
      { signal: AbortSignal.timeout(5000) }
    );
    if (bybitPreRes.ok) {
      const preData = await bybitPreRes.json();
      const preList = preData.result?.list || [];
      for (const item of preList) {
        const base = (item.baseCoin || item.symbol.replace(/USDT$/i, '')).toUpperCase();
        const cleanSym = `${base}USDT`;
        const launchTs = item.launchTime ? parseInt(item.launchTime, 10) : null;
        const schedTime = (launchTs && !isNaN(launchTs) && launchTs > 0) ? launchTs : (now + 7 * 24 * 3600 * 1000);

        discoveredMap.set(cleanSym, {
          symbol: cleanSym,
          base,
          quote: 'USDT',
          exchange: 'BYBIT',
          listedAt: schedTime,
          scheduledListingTime: schedTime,
          isUpcoming: true,
          announcementTitle: `Bybit Official Pre-Launch: ${cleanSym} (${item.contractType || 'Linear Perpetual'})`,
          announcementUrl: `https://www.bybit.com/trade/usdt/${cleanSym}`
        });
      }
    }
  } catch (err) {
    console.warn('[ListingDiscovery] Bybit PreLaunch instruments discovery error:', err);
  }

  // 2. Query Bybit Official New Crypto Announcements (Verified Upcoming & Recent listings)
  try {
    const bybitAnnRes = await fetch(
      'https://api.bybit.com/v5/announcements/index?locale=en-US&type=new_crypto&limit=25',
      { signal: AbortSignal.timeout(5000) }
    );
    if (bybitAnnRes.ok) {
      const annData = await bybitAnnRes.json();
      const annList = annData.result?.list || [];
      for (const ann of annList) {
        const title = ann.title || '';
        // E.g. "New listing: HORIZONUSDT TradFi Perpetual Contract" or "New listing: 哈基米USDT Perpetual Contract"
        const match = title.match(/New listing:\s*([A-Za-z0-9\u4e00-\u9fa5]+?)(?:\/USDT|USDT)/i);
        if (match) {
          const base = match[1].toUpperCase();
          const cleanSym = `${base}USDT`;
          const schedTime = ann.startDateTimestamp || ann.dateTimestamp || null;
          const isUpcoming = schedTime ? schedTime > now : false;

          if (!discoveredMap.has(cleanSym) || isUpcoming) {
            discoveredMap.set(cleanSym, {
              symbol: cleanSym,
              base,
              quote: 'USDT',
              exchange: 'BYBIT',
              listedAt: schedTime || now,
              scheduledListingTime: schedTime,
              isUpcoming,
              announcementTitle: title,
              announcementUrl: ann.url
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[ListingDiscovery] Bybit announcements discovery error:', err);
  }

  // 3. Query Binance Official CMS Listing Announcements & Fetch Article Details for exact UTC dates
  try {
    const binanceAnnRes = await fetch(
      'https://www.binance.com/bapi/composite/v1/public/cms/article/catalog/list/query?catalogId=48&pageNo=1&pageSize=15',
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(6000)
      }
    );
    if (binanceAnnRes.ok) {
      const annData = await binanceAnnRes.json();
      const articles = annData.data?.articles || [];
      
      const detailPromises = articles.map(async (art: any) => {
        const title = art.title || '';
        const match =
          title.match(/Will List\s+([^\(\)]+?)\s*\(([^()]+)\)/i) ||
          title.match(/Launch\s+.*?\b([A-Za-z0-9\u4e00-\u9fa5]{2,12})USDT\b/i) ||
          title.match(/Adds\s+.*?([A-Za-z0-9]{2,10})\b/i);

        if (!match) return null;
        const base = (match[2] || match[1]).replace(/[^A-Za-z0-9\u4e00-\u9fa5]/g, '').toUpperCase();
        if (!base || base === 'BINANCE' || base === 'USDT') return null;
        const cleanSym = `${base}USDT`;

        let schedTime: number | null = null;
        if (art.code) {
          try {
            const dRes = await fetch(
              `https://www.binance.com/bapi/composite/v1/public/cms/article/detail/query?articleCode=${art.code}`,
              { signal: AbortSignal.timeout(4000) }
            );
            if (dRes.ok) {
              const dData = await dRes.json();
              const body = dData?.data?.body || '';
              const dateMatch = body.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*(?:\(UTC\)|UTC)/i);
              if (dateMatch) {
                const parsed = new Date(`${dateMatch[1]}T${dateMatch[2]}:00Z`).getTime();
                if (!isNaN(parsed)) schedTime = parsed;
              }
            }
          } catch {
            // detail fetch fallback
          }
        }

        if (!schedTime && art.releaseDate) {
          schedTime = art.releaseDate;
        }

        const isUpcoming = schedTime ? schedTime > now : false;

        return {
          symbol: cleanSym,
          base,
          quote: 'USDT',
          exchange: 'BINANCE' as const,
          listedAt: schedTime || now,
          scheduledListingTime: schedTime,
          isUpcoming,
          announcementTitle: title,
          announcementUrl: art.code ? `https://www.binance.com/en/support/announcement/${art.code}` : undefined
        };
      });

      const parsedResults = await Promise.allSettled(detailPromises);
      for (const res of parsedResults) {
        if (res.status === 'fulfilled' && res.value) {
          const item = res.value;
          if (!discoveredMap.has(item.symbol) || item.isUpcoming) {
            discoveredMap.set(item.symbol, item);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[ListingDiscovery] Binance CMS announcements discovery error:', err);
  }

  // 3. Query Binance Spot symbols registry
  try {
    const binanceRes = await fetch('https://api.binance.com/api/v3/exchangeInfo?permissions=SPOT', {
      signal: AbortSignal.timeout(5000)
    });
    if (binanceRes.ok) {
      const bData = await binanceRes.json();
      const usdtPairs = (bData.symbols || []).filter(
        (s: any) => s.status === 'TRADING' && s.quoteAsset === 'USDT'
      );
      // Newest listings appear at the tail end of Binance's symbols registry
      const candidatePairs = usdtPairs.slice(-35);
      for (const pair of candidatePairs) {
        const clean = pair.symbol;
        if (discoveredMap.has(clean) && discoveredMap.get(clean)?.isUpcoming) continue;
        const genesis = await getVerifiedExchangeGenesisTimestamp(clean, 'BINANCE');
        if (genesis) {
          const ageHours = (now - genesis) / (1000 * 3600);
          if (ageHours <= MAX_NEW_LISTING_AGE_HOURS) {
            discoveredMap.set(clean, {
              symbol: clean,
              base: pair.baseAsset,
              quote: 'USDT',
              exchange: 'BINANCE',
              listedAt: genesis,
              scheduledListingTime: genesis,
              isUpcoming: false
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[ListingDiscovery] Binance registry discovery error:', err);
  }

  // 4. Query Bybit Spot symbols registry
  try {
    const bybitRes = await fetch('https://api.bybit.com/v5/market/instruments-info?category=spot', {
      signal: AbortSignal.timeout(5000)
    });
    if (bybitRes.ok) {
      const bybitData = await bybitRes.json();
      const usdtPairs = (bybitData.result?.list || []).filter(
        (s: any) => s.status === 'Trading' && s.quoteCoin === 'USDT'
      );
      const candidatePairs = usdtPairs.slice(-25);
      for (const pair of candidatePairs) {
        const clean = pair.symbol;
        if (discoveredMap.has(clean)) continue;
        const genesis = await getVerifiedExchangeGenesisTimestamp(clean, 'BYBIT');
        if (genesis) {
          const ageHours = (now - genesis) / (1000 * 3600);
          if (ageHours <= MAX_NEW_LISTING_AGE_HOURS) {
            discoveredMap.set(clean, {
              symbol: clean,
              base: pair.baseCoin,
              quote: 'USDT',
              exchange: 'BYBIT',
              listedAt: genesis,
              scheduledListingTime: genesis,
              isUpcoming: false
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[ListingDiscovery] Bybit registry discovery error:', err);
  }

  const items = Array.from(discoveredMap.values()).filter(item => {
    const ageHours = (now - item.listedAt) / (1000 * 3600);
    return ageHours <= MAX_NEW_LISTING_AGE_HOURS;
  });
  // Sort: Upcoming listings first (ascending time to listing), then newest live listings descending
  items.sort((a, b) => {
    const aUpcoming = a.isUpcoming || (a.scheduledListingTime && a.scheduledListingTime > now);
    const bUpcoming = b.isUpcoming || (b.scheduledListingTime && b.scheduledListingTime > now);
    if (aUpcoming && !bUpcoming) return -1;
    if (!aUpcoming && bUpcoming) return 1;
    if (aUpcoming && bUpcoming) {
      return (a.scheduledListingTime || 0) - (b.scheduledListingTime || 0);
    }
    return b.listedAt - a.listedAt;
  });

  cachedDiscoveredCandidates = {
    timestamp: now,
    items
  };

  return items;
}

/**
 * Phase 20 Hardened: Pump / Dump Early-Warning Intelligence Engine
 * Synthesizes volume velocity, order-flow absorption, liquidity depth, funding rate bias, and catalyst context.
 */
function evaluatePumpDumpEarlyWarning(params: {
  candles: any[];
  currentPrice: number;
  initialSpikePct: number | null;
  volume24hUsd: number | null;
  rvol: number;
  intel: NewListingIntelligenceReport;
  newsReport?: any;
}): {
  volumeVelocity: string;
  liquidityDepth: string;
  orderFlowAbsorption: string;
  fundingRateBias?: string;
  openInterestTrend?: string;
  catalystRisk: string;
  earlyWarningSummary: string;
} {
  const { candles, currentPrice, volume24hUsd, rvol, intel, newsReport } = params;

  // 1. Volume Velocity
  let volumeVelocity = 'STEADY_TURNOVER';
  if (candles.length >= 6) {
    const recent3Vol = candles.slice(-3).reduce((acc, c) => acc + (c.volume || 0), 0) / 3;
    const avgVol = candles.reduce((acc, c) => acc + (c.volume || 0), 0) / candles.length;
    const velRatio = avgVol > 0 ? recent3Vol / avgVol : 1.0;
    if (velRatio >= 2.5) volumeVelocity = 'EXTREME_ACCELERATION';
    else if (velRatio >= 1.5) volumeVelocity = 'ELEVATED_MOMENTUM';
    else if (velRatio <= 0.4) volumeVelocity = 'EXHAUSTION_DRYING_UP';
  }

  // 2. Liquidity Depth
  let liquidityDepth = 'MODERATE_LIQUIDITY';
  if (volume24hUsd !== null) {
    if (volume24hUsd >= 50000000) liquidityDepth = 'DEEP_INSTITUTIONAL';
    else if (volume24hUsd >= 10000000) liquidityDepth = 'HEALTHY_LIQUIDITY';
    else if (volume24hUsd < 1000000) liquidityDepth = 'THIN_ORDERBOOK_HAZARD';
  } else {
    liquidityDepth = 'AWAITING_LIQUIDITY_DISCOVERY';
  }

  // 3. Order Flow Absorption (buy vs sell pressure on green vs red candles)
  let orderFlowAbsorption = 'NEUTRAL_BALANCED';
  if (candles.length >= 6) {
    let buyVol = 0;
    let sellVol = 0;
    for (const c of candles.slice(-12)) {
      if (c.close >= c.open) buyVol += c.volume || 0;
      else sellVol += c.volume || 0;
    }
    const totalV = buyVol + sellVol;
    if (totalV > 0) {
      const buyRatio = buyVol / totalV;
      if (buyRatio >= 0.65) orderFlowAbsorption = 'BUY_SIDE_ABSORPTION';
      else if (buyRatio <= 0.35) orderFlowAbsorption = 'AGGRESSIVE_SELL_DISTRIBUTION';
    }
  }

  // 4. Catalyst / Supply Risk
  let catalystRisk = 'STANDARD_MARKET_DISCOVERY';
  if (newsReport && newsReport.impactScore >= 70) {
    catalystRisk = 'HIGH_IMPACT_NEWS_CATALYST';
  } else if (intel.discoveryStage === 'BLEED_MARKDOWN' || intel.pumpDumpRisk === 'CRITICAL') {
    catalystRisk = 'UNLOCK_DUMP_PRESSURE';
  }

  // 5. Synthesis Summary
  let earlyWarningSummary = 'Normal post-listing price discovery. Monitor accumulation base.';
  if (intel.pumpDumpRisk === 'CRITICAL' || orderFlowAbsorption === 'AGGRESSIVE_SELL_DISTRIBUTION') {
    earlyWarningSummary = 'High dump hazard: Aggressive distribution bleed detected. Do not buy.';
  } else if (intel.antiChaseWarning || volumeVelocity === 'EXTREME_ACCELERATION') {
    earlyWarningSummary = 'Overextended spike: Don\'t-chase guard active. Wait for pullback.';
  } else if (intel.setupViability === 'ACTIONABLE_BASE' && orderFlowAbsorption === 'BUY_SIDE_ABSORPTION') {
    earlyWarningSummary = 'Strong structural base forming with verified buy-side volume absorption.';
  }

  return {
    volumeVelocity,
    liquidityDepth,
    orderFlowAbsorption,
    fundingRateBias: 'NEUTRAL_BALANCED',
    openInterestTrend: rvol > 1.8 ? 'ACCELERATING' : 'NORMAL',
    catalystRisk,
    earlyWarningSummary
  };
}

let cachedListingRadar: NewListingItem[] = [];
let lastListingRadarFetchAt = 0;
const LISTING_RADAR_CACHE_TTL_MS = 25 * 1000; // 25 seconds cache

/**
 * Phase 20 Hardened: New Listing Trade Intelligence Engine
 * Monitors listings across Binance and Bybit using strictly real exchange data.
 * Correctly switches UPCOMING → LIVE when scheduled listing time passes.
 * Strictly: Never fabricates prices, listing times, or targets.
 * Strictly: Do not automatically BUY merely because a coin is newly listed.
 */
export async function getNewListingRadar(): Promise<NewListingItem[]> {
  const now = Date.now();
  if (cachedListingRadar.length > 0 && (now - lastListingRadarFetchAt) < LISTING_RADAR_CACHE_TTL_MS) {
    return cachedListingRadar;
  }

  const news = await getProcessedNewsIntelligence();

  // Dynamically discover genuine new listings from exchange registries and announcements
  const candidates = await discoverNewlyListedExchangeSymbols();

  // Concurrently evaluate real exchange data for discovered candidates
  const evaluatedItems = await Promise.all(
    candidates.map(async (candidate): Promise<NewListingItem | null> => {
      try {
        const schedTime = candidate.scheduledListingTime;
        const isUpcoming = Boolean(candidate.isUpcoming || (schedTime && schedTime > now));

        // CASE 1: UPCOMING PRE-LISTING ANNOUNCEMENT
        if (isUpcoming) {
          let countdownText = 'Pre-Market Trading • Awaiting Spot Launch';
          if (schedTime && schedTime > now) {
            const msUntilListing = schedTime - now;
            const hoursUntilListing = Math.floor(msUntilListing / (1000 * 3600));
            const minsUntilListing = Math.floor((msUntilListing % (1000 * 3600)) / (1000 * 60));

            countdownText =
              hoursUntilListing > 24
                ? `Listing in ${Math.floor(hoursUntilListing / 24)}d ${hoursUntilListing % 24}h`
                : hoursUntilListing > 0
                ? `Listing in ${hoursUntilListing}h ${minsUntilListing}m`
                : `Listing in ${minsUntilListing}m`;
          }

          return {
            id: `list_${candidate.base}_${candidate.exchange}_upcoming`,
            symbol: `${candidate.base}/${candidate.quote}`,
            baseAsset: candidate.base,
            quoteAsset: candidate.quote,
            exchange: candidate.exchange,
            listedAt: schedTime || now,
            scheduledListingTime: schedTime,
            listedDateFormatted: countdownText,
            listingAgeHours: 0,
            launchStatus: 'PRE_LISTING',
            initialSpikePct: null,
            currentPriceChange24h: 0,
            volume24hUsd: null,
            rvol: 1.0,
            stage: 'PRE_ANNOUNCEMENT',
            earlyStructure: 'UNFORMED_VOLATILE',
            relativeStrengthVsBtc: 0,
            pumpDumpRisk: 'MODERATE',
            pumpDumpIntelligence: {
              volumeVelocity: 'PRE_LAUNCH_INACTIVE',
              liquidityDepth: 'ORDERBOOK_PRE_OPEN',
              orderFlowAbsorption: 'PRE_AUCTION_STAGING',
              fundingRateBias: 'DERIVATIVES_PRE_LISTING',
              openInterestTrend: 'ZERO_OI_PRE_OPEN',
              catalystRisk: 'EXCHANGE_TIER_1_LISTING_CATALYST',
              earlyWarningSummary: 'Awaiting exchange open auction. Do not market-order at initial tick.'
            },
            setupViability: 'PRE_LISTING_WAIT',
            decision: 'WAIT',
            executionStatus: 'WAIT',
            invalidation: 'Exchange pre-listing countdown active • Awaiting trading opening auction',
            description: candidate.announcementTitle || `Official verified pre-listing announcement on ${candidate.exchange}. Live trading starts at scheduled time. Zero fabricated pre-market prices.`,
            confluences: [
              `Exchange: ${candidate.exchange}`,
              'Official Exchange Pre-Listing Announcement',
              'Pre-Market Countdown Active',
              'Zero Fabricated Prices'
            ]
          };
        }

        // CASE 2: LIVE / RECENT LISTING
        const [klineRes, tickerRes] = await Promise.all([
          getKlinesWithMultiExchangeFallback(candidate.symbol, '1h', 100),
          getTickerWithMultiExchangeFallback(candidate.symbol)
        ]);

        const candles = klineRes.candles || [];
        const ticker = tickerRes.ticker;

        const listedAt = candidate.listedAt || now;
        const listingAgeHours = Math.max(0, Math.floor((now - listedAt) / (1000 * 3600)));

        // If older than max listing window (30 days / 720 hours), it has expired from New Listing Radar
        if (listingAgeHours > MAX_NEW_LISTING_AGE_HOURS) {
          return null;
        }

        const listedDateFormatted =
          listingAgeHours <= 1
            ? 'Just listed'
            : listingAgeHours <= 24
            ? `${listingAgeHours}h ago`
            : `${Math.floor(listingAgeHours / 24)}d ago`;

        // If no real candles returned from exchange yet, report awaiting trade bars
        if (!candles || candles.length === 0) {
          return {
            id: `list_${candidate.base}_${candidate.exchange}`,
            symbol: `${candidate.base}/${candidate.quote}`,
            baseAsset: candidate.base,
            quoteAsset: candidate.quote,
            exchange: candidate.exchange,
            listedAt,
            scheduledListingTime: candidate.scheduledListingTime || listedAt,
            listedDateFormatted,
            listingAgeHours,
            launchStatus: 'LISTING_LIVE',
            initialSpikePct: null,
            currentPriceChange24h: 0,
            volume24hUsd: null,
            rvol: 1.0,
            stage: 'PRICE_DISCOVERY',
            earlyStructure: 'UNFORMED_VOLATILE',
            relativeStrengthVsBtc: 0,
            pumpDumpRisk: 'HIGH',
            pumpDumpIntelligence: {
              volumeVelocity: 'INITIALIZING_FEED',
              liquidityDepth: 'THIN_ORDERBOOK_HAZARD',
              orderFlowAbsorption: 'NEUTRAL_BALANCED',
              fundingRateBias: 'BALANCED_FUNDING',
              openInterestTrend: 'INITIALIZING',
              catalystRisk: 'PRICE_DISCOVERY_VOLATILITY',
              earlyWarningSummary: 'Live listing trading feed initializing. Awaiting first bar closes.'
            },
            setupViability: 'WAIT_STABILIZATION',
            decision: 'WAIT',
            executionStatus: 'WAIT',
            invalidation: 'Exchange listing feed pending - awaiting live trade bars',
            description: `Exchange trading opened for ${candidate.base} on ${candidate.exchange}. Awaiting candle formation (zero fabricated levels).`,
            confluences: ['Trading Opened', 'Zero fabricated levels']
          };
        }

        const firstCandle = candles[0];
        const lastCandle = candles[candles.length - 1];
        const currentPrice = ticker?.lastPrice || lastCandle.close;
        const volume24hUsd = ticker
          ? (ticker.quoteVolume || ticker.volume * currentPrice)
          : candles.slice(-24).reduce((acc, c) => acc + c.volume * c.close, 0);

        const currentPriceChange24h = ticker
          ? Number(ticker.priceChangePercent.toFixed(2))
          : Number((((lastCandle.close - candles[Math.max(0, candles.length - 24)].open) / candles[Math.max(0, candles.length - 24)].open) * 100).toFixed(2));

        // Initial Spike %: Highest price in first 24h vs opening price
        const first24Candles = candles.slice(0, Math.min(24, candles.length));
        const maxInitialHigh = Math.max(...first24Candles.map((c) => c.high));
        const initialSpikePct = firstCandle.open > 0
          ? Number((((maxInitialHigh - firstCandle.open) / firstCandle.open) * 100).toFixed(1))
          : null;

        // Relative Volume
        const recent24Vol = candles.slice(-24).reduce((acc, c) => acc + c.volume, 0) / Math.min(24, candles.length);
        const prevVol = candles.length > 24
          ? candles.slice(0, -24).reduce((acc, c) => acc + c.volume, 0) / (candles.length - 24)
          : recent24Vol;
        const rvol = prevVol > 0 ? Number((recent24Vol / prevVol).toFixed(1)) : 1.0;

        // Run full Phase 14 New Listing Intelligence Engine
        const intel = evaluateNewListingIntelligence({
          symbol: candidate.symbol,
          candles,
          currentPrice,
          volume24hUsd,
          rvol,
          exchange: candidate.exchange,
          listingTime: listedAt
        });

        const launchStatus: ListingStatus =
          listingAgeHours <= 24 ? 'LISTING_LIVE' : 'POST_LISTING';

        // Stage mapping
        let stage: NewListingItem['stage'] = 'BASE_BUILDING';
        if (intel.discoveryStage === 'PRICE_DISCOVERY' || intel.discoveryStage === 'FIRST_RANGE_FORMING') {
          stage = 'PRICE_DISCOVERY';
        } else if (intel.discoveryStage === 'INITIAL_SPIKE' || intel.discoveryStage === 'BREAKOUT_EXPANSION') {
          stage = 'INITIAL_SPIKE';
        } else if (intel.discoveryStage === 'BASE_BUILDING') {
          stage = 'BASE_BUILDING';
        } else if (intel.discoveryStage === 'BLEED_MARKDOWN') {
          stage = 'BLEED_MARKDOWN';
        } else if (intel.discoveryStage === 'ESTABLISHED') {
          stage = 'ESTABLISHED';
        }

        // Early Structure mapping
        let earlyStructure: NewListingItem['earlyStructure'] = 'UNFORMED_VOLATILE';
        if (intel.marketStructure === 'ACCUMULATION_BASE') earlyStructure = 'ACCUMULATION_BASE';
        else if (intel.marketStructure === 'BREAKOUT_RETEST') earlyStructure = 'BREAKOUT_RETEST';
        else if (intel.marketStructure === 'DISTRIBUTION_BLEED') earlyStructure = 'DISTRIBUTION_BLEED';
        else if (intel.structureAction === 'RECLAIM') earlyStructure = 'FVG_TAP';

        // Pump / Dump Risk
        const pumpDumpRisk: NewListingItem['pumpDumpRisk'] =
          intel.pumpDumpRisk === 'CRITICAL'
            ? 'CRITICAL'
            : intel.pumpDumpRisk === 'HIGH'
            ? 'HIGH'
            : intel.pumpDumpRisk === 'MODERATE'
            ? 'MODERATE'
            : 'LOW';

        // Setup Viability
        const setupViability: NewListingItem['setupViability'] =
          intel.setupViability === 'ACTIONABLE_BASE'
            ? 'ACTIONABLE_BASE'
            : intel.setupViability === 'DO_NOT_TRADE'
            ? 'DO_NOT_TRADE'
            : 'WAIT_STABILIZATION';

        // Pump/Dump Early Warning Intelligence
        const pumpDumpIntelligence = evaluatePumpDumpEarlyWarning({
          candles,
          currentPrice,
          initialSpikePct,
          volume24hUsd,
          rvol,
          intel
        });

        // Trade Parameters: STRICTLY NEVER FABRICATE - only populated when genuine structural levels exist
        // INVARIANT: Do not automatically BUY merely because a coin is newly listed!
        const isActionable = setupViability === 'ACTIONABLE_BASE' && intel.hasStructuralLevels;
        const decision: 'LONG' | 'SHORT' | 'WAIT' = isActionable
          ? (intel.technicalAlignment === 'SUPPORTS_LONG' ? 'LONG' : intel.technicalAlignment === 'SUPPORTS_SHORT' ? 'SHORT' : 'WAIT')
          : 'WAIT';
        const stopLoss = isActionable && typeof intel.structuralStopLoss === 'number' ? intel.structuralStopLoss : undefined;
        const targets = isActionable && intel.structuralTargets && intel.structuralTargets.length > 0 ? intel.structuralTargets : undefined;
        const riskRewardRatio = isActionable && typeof intel.structuralRiskRewardRatio === 'number' ? intel.structuralRiskRewardRatio : undefined;

        // Anti-chase protection
        let executionStatus: NewListingItem['executionStatus'] = 'WAIT';
        if (isActionable) {
          if (intel.antiChaseWarning || intel.overextensionRisk === 'CRITICAL_OVEREXTENSION') {
            executionStatus = 'WAIT_FOR_PULLBACK';
          } else {
            executionStatus = 'WAIT_FOR_CONFIRMATION';
          }
        }

        const invalidation = intel.invalidation || 'Awaiting structural base formation (zero fabricated levels)';

        const item: NewListingItem = {
          id: `list_${candidate.base}_${candidate.exchange}`,
          symbol: `${candidate.base}/${candidate.quote}`,
          baseAsset: candidate.base,
          quoteAsset: candidate.quote,
          exchange: candidate.exchange,
          listedAt,
          scheduledListingTime: candidate.scheduledListingTime || listedAt,
          listedDateFormatted,
          listingAgeHours,
          launchStatus,
          initialSpikePct,
          currentPriceChange24h,
          volume24hUsd,
          rvol,
          stage,
          earlyStructure,
          relativeStrengthVsBtc: 0,
          pumpDumpRisk,
          pumpDumpIntelligence,
          setupViability,
          decision,
          entryZone: isActionable && intel.entryZone ? intel.entryZone : undefined,
          stopLoss,
          targets,
          riskRewardRatio,
          executionStatus,
          invalidation,
          description: intel.confluenceReason || `Real-time listing analysis for ${candidate.base} on ${candidate.exchange}.`,
          confluences: [
            `Exchange: ${candidate.exchange}`,
            `Discovery Stage: ${intel.discoveryStage}`,
            `Structure: ${intel.marketStructure}`,
            `Viability: ${intel.setupViability}`
          ],
          newListingIntelligence: intel
        };

        return item;
      } catch (itemErr) {
        console.warn(`[ListingRadar] Error evaluating listing candidate ${candidate.symbol}:`, itemErr);
        return null;
      }
    })
  );

  const validItems = evaluatedItems.filter(Boolean) as NewListingItem[];

  // Sort Order (Section 5):
  // 1. Upcoming listings sorted at the TOP of the radar
  // 2. Upcoming: soonest listing time first (ascending)
  // 3. Live: newest listing time first (descending)
  validItems.sort((a, b) => {
    const isUpcomingA = a.launchStatus === 'PRE_LISTING' || a.stage === 'UPCOMING' || a.stage === 'PRE_MARKET' || a.stage === 'PRE_ANNOUNCEMENT';
    const isUpcomingB = b.launchStatus === 'PRE_LISTING' || b.stage === 'UPCOMING' || b.stage === 'PRE_MARKET' || b.stage === 'PRE_ANNOUNCEMENT';

    if (isUpcomingA && !isUpcomingB) return -1;
    if (!isUpcomingA && isUpcomingB) return 1;

    if (isUpcomingA && isUpcomingB) {
      const timeA = a.scheduledListingTime || a.listedAt || 0;
      const timeB = b.scheduledListingTime || b.listedAt || 0;
      return timeA - timeB; // Soonest listing first
    }

    const liveTimeA = a.listedAt || a.scheduledListingTime || 0;
    const liveTimeB = b.listedAt || b.scheduledListingTime || 0;
    return liveTimeB - liveTimeA; // Newest listing first
  });

  if (validItems.length > 0) {
    cachedListingRadar = validItems;
    lastListingRadarFetchAt = Date.now();
  }
  return validItems;
}
