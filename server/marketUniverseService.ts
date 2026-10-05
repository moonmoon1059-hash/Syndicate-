import { MarketCategory, MarketCoverageTelemetry } from '../src/types/crypto';
import { getProviderHealthStatus, liveStreamManager } from './liveDataProvider';

// Comprehensive Fallback Registry of Known Assets across Categories
export const CANONICAL_MARKET_REGISTRY: Record<string, { category: MarketCategory; baseAsset: string; name: string }> = {
  // Majors
  BTCUSDT: { category: 'MAJOR', baseAsset: 'BTC', name: 'Bitcoin' },
  ETHUSDT: { category: 'MAJOR', baseAsset: 'ETH', name: 'Ethereum' },
  SOLUSDT: { category: 'MAJOR', baseAsset: 'SOL', name: 'Solana' },
  BNBUSDT: { category: 'MAJOR', baseAsset: 'BNB', name: 'BNB' },
  XRPUSDT: { category: 'MAJOR', baseAsset: 'XRP', name: 'Ripple' },
  ADAUSDT: { category: 'MAJOR', baseAsset: 'ADA', name: 'Cardano' },
  AVAXUSDT: { category: 'MAJOR', baseAsset: 'AVAX', name: 'Avalanche' },
  LINKUSDT: { category: 'MAJOR', baseAsset: 'LINK', name: 'Chainlink' },
  DOTUSDT: { category: 'MAJOR', baseAsset: 'DOT', name: 'Polkadot' },
  NEARUSDT: { category: 'MAJOR', baseAsset: 'NEAR', name: 'Near Protocol' },
  SUIUSDT: { category: 'MAJOR', baseAsset: 'SUI', name: 'Sui' },
  TRXUSDT: { category: 'MAJOR', baseAsset: 'TRX', name: 'Tron' },
  TONUSDT: { category: 'MAJOR', baseAsset: 'TON', name: 'Toncoin' },
  LTCUSDT: { category: 'MAJOR', baseAsset: 'LTC', name: 'Litecoin' },
  BCHUSDT: { category: 'MAJOR', baseAsset: 'BCH', name: 'Bitcoin Cash' },

  // Altcoins
  APTUSDT: { category: 'ALTCOIN', baseAsset: 'APT', name: 'Aptos' },
  RENDERUSDT: { category: 'ALTCOIN', baseAsset: 'RENDER', name: 'Render' },
  FETUSDT: { category: 'ALTCOIN', baseAsset: 'FET', name: 'Artificial Superintelligence Alliance' },
  TIAUSDT: { category: 'ALTCOIN', baseAsset: 'TIA', name: 'Celestia' },
  INJUSDT: { category: 'ALTCOIN', baseAsset: 'INJ', name: 'Injective' },
  KASUSDT: { category: 'ALTCOIN', baseAsset: 'KAS', name: 'Kaspa' },
  TAOUSDT: { category: 'ALTCOIN', baseAsset: 'TAO', name: 'Bittensor' },
  SEIUSDT: { category: 'ALTCOIN', baseAsset: 'SEI', name: 'Sei' },
  JUPUSDT: { category: 'ALTCOIN', baseAsset: 'JUP', name: 'Jupiter' },
  PYTHUSDT: { category: 'ALTCOIN', baseAsset: 'PYTH', name: 'Pyth Network' },
  ONDOUSDT: { category: 'ALTCOIN', baseAsset: 'ONDO', name: 'Ondo Finance' },
  ENAUSDT: { category: 'ALTCOIN', baseAsset: 'ENA', name: 'Ethena' },
  STRKUSDT: { category: 'ALTCOIN', baseAsset: 'STRK', name: 'Starknet' },
  WLDUSDT: { category: 'ALTCOIN', baseAsset: 'WLD', name: 'Worldcoin' },
  ARBUSDT: { category: 'ALTCOIN', baseAsset: 'ARB', name: 'Arbitrum' },
  OPUSDT: { category: 'ALTCOIN', baseAsset: 'OP', name: 'Optimism' },
  MATICUSDT: { category: 'ALTCOIN', baseAsset: 'POL', name: 'Polygon Ecosystem' },
  FTMUSDT: { category: 'ALTCOIN', baseAsset: 'S', name: 'Sonic (Fantom)' },
  ALGOUSDT: { category: 'ALTCOIN', baseAsset: 'ALGO', name: 'Algorand' },
  HBARUSDT: { category: 'ALTCOIN', baseAsset: 'HBAR', name: 'Hedera' },
  ICPUSDT: { category: 'ALTCOIN', baseAsset: 'ICP', name: 'Internet Computer' },
  STXUSDT: { category: 'ALTCOIN', baseAsset: 'STX', name: 'Stacks' },
  AAVEUSDT: { category: 'ALTCOIN', baseAsset: 'AAVE', name: 'Aave' },
  UNIUSDT: { category: 'ALTCOIN', baseAsset: 'UNI', name: 'Uniswap' },
  PENDLEUSDT: { category: 'ALTCOIN', baseAsset: 'PENDLE', name: 'Pendle' },
  RUNEUSDT: { category: 'ALTCOIN', baseAsset: 'RUNE', name: 'THORChain' },

  // Memes & High-Beta
  DOGEUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'DOGE', name: 'Dogecoin' },
  SHIBUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'SHIB', name: 'Shiba Inu' },
  PEPEUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'PEPE', name: 'Pepe' },
  WIFUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'WIF', name: 'dogwifhat' },
  BONKUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'BONK', name: 'Bonk' },
  FLOKIUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'FLOKI', name: 'Floki' },
  BOMEUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'BOME', name: 'Book of Meme' },
  MEWUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'MEW', name: 'cat in a dogs world' },
  POPCATUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'POPCAT', name: 'Popcat' },
  PENGUUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'PENGU', name: 'Pudgy Penguins Token' },
  ACTUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'ACT', name: 'Act I : The AI Prophecy' },
  PNUTUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'PNUT', name: 'Peanut the Squirrel' },
  MOODENGUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'MOODENG', name: 'Moo Deng' },
  FARTCOINUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'FARTCOIN', name: 'Fartcoin' },
  TURBOUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'TURBO', name: 'Turbo' },
  NEIROUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'NEIRO', name: 'First Neiro on Ethereum' },
  BRETTUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'BRETT', name: 'Brett' },
  GOATUSDT: { category: 'MEME_HIGH_BETA', baseAsset: 'GOAT', name: 'Goatseus Maximus' },

  // New / Recently Listed Projects
  NYLOUSDT: { category: 'NEW_LISTING', baseAsset: 'NYLO', name: 'Nylo Protocol' },
  SKYAIUSDT: { category: 'NEW_LISTING', baseAsset: 'SKYAI', name: 'SkyNet AI' },
  VIRTUALUSDT: { category: 'NEW_LISTING', baseAsset: 'VIRTUAL', name: 'Virtuals Protocol' },
  AI16ZUSDT: { category: 'NEW_LISTING', baseAsset: 'AI16Z', name: 'ai16z DAO' },
  MAJORUSDT: { category: 'NEW_LISTING', baseAsset: 'MAJOR', name: 'Major' },
  THEUSDT: { category: 'NEW_LISTING', baseAsset: 'THE', name: 'THENA' },
  USUALUSDT: { category: 'NEW_LISTING', baseAsset: 'USUAL', name: 'Usual Money' },
  MOVEUSDT: { category: 'NEW_LISTING', baseAsset: 'MOVE', name: 'Movement' },
  ACXUSDT: { category: 'NEW_LISTING', baseAsset: 'ACX', name: 'Across Protocol' },
  ORCAUSDT: { category: 'NEW_LISTING', baseAsset: 'ORCA', name: 'Orca' },
  COWUSDT: { category: 'NEW_LISTING', baseAsset: 'COW', name: 'CoW Protocol' },
  CETUSUSDT: { category: 'NEW_LISTING', baseAsset: 'CETUS', name: 'Cetus Protocol' },
  GRASSUSDT: { category: 'NEW_LISTING', baseAsset: 'GRASS', name: 'Grass Network' },
  DRIFTUSDT: { category: 'NEW_LISTING', baseAsset: 'DRIFT', name: 'Drift Protocol' },
  IOUSDT: { category: 'NEW_LISTING', baseAsset: 'IO', name: 'io.net' },
  NOTUSDT: { category: 'NEW_LISTING', baseAsset: 'NOT', name: 'Notcoin' },
  ZKUSDT: { category: 'NEW_LISTING', baseAsset: 'ZK', name: 'ZKsync' },
  BLASTUSDT: { category: 'NEW_LISTING', baseAsset: 'BLAST', name: 'Blast' },
  LISTAUSDT: { category: 'NEW_LISTING', baseAsset: 'LISTA', name: 'Lista DAO' },
  BBUSDT: { category: 'NEW_LISTING', baseAsset: 'BB', name: 'BounceBit' },
  REZUSDT: { category: 'NEW_LISTING', baseAsset: 'REZ', name: 'Renzo Protocol' }
};

// Known Memecoin heuristics by ticker keywords
const MEME_KEYWORDS = ['DOGE', 'SHIB', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'BOME', 'MEW', 'POPCAT', 'PENGU', 'ACT', 'PNUT', 'MOODENG', 'FART', 'TURBO', 'NEIRO', 'BRETT', 'GOAT', 'CHEEMS', 'CAT', 'PUP', 'MEME', 'INU', 'ELON', 'WOJAK', 'CHILLGUY'];

// Known Majors
const MAJOR_SYMBOLS = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT', 'NEARUSDT', 'SUIUSDT', 'TRXUSDT', 'TONUSDT', 'LTCUSDT', 'BCHUSDT']);

// Global Dynamic Discovered Universe
let discoveredUniverseCache: string[] = Object.keys(CANONICAL_MARKET_REGISTRY);
let lastDiscoveryTime = 0;
const DISCOVERY_CACHE_TTL_MS = 60000; // 1 min

// Live Telemetry Storage
let globalTelemetry: MarketCoverageTelemetry = {
  totalEligibleDiscovered: Object.keys(CANONICAL_MARKET_REGISTRY).length,
  totalAssetsScanned: 0,
  successfulScans: 0,
  failedOrUnavailableScans: 0,
  waitCount: 0,
  actionableCount: 0,
  categoryDistribution: {
    major: 15,
    altcoin: 26,
    memeHighBeta: 18,
    newListing: 21
  },
  lastScanTimestamp: Date.now(),
  providerStatus: {
    binance: 'OPERATIONAL'
  }
};

/**
 * Categorize any asset symbol logically without introducing quality bias.
 * Category is metadata ONLY and never alters quality scoring.
 */
export function getAssetCategory(symbol: string): MarketCategory {
  const cleanSym = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  
  if (CANONICAL_MARKET_REGISTRY[cleanSym]) {
    return CANONICAL_MARKET_REGISTRY[cleanSym].category;
  }

  if (MAJOR_SYMBOLS.has(cleanSym)) {
    return 'MAJOR';
  }

  for (const keyword of MEME_KEYWORDS) {
    if (cleanSym.includes(keyword)) {
      return 'MEME_HIGH_BETA';
    }
  }

  // If newly discovered without classification, check if it's recent launch
  return 'ALTCOIN';
}

export interface ResolvedAsset {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  name: string;
  category: MarketCategory;
}

/**
 * Universal Symbol / Asset Resolver (Phase 6.1)
 * Resolves user search input (symbol, pair, or asset name) across the entire universe.
 * Supports "Bitcoin", "BTC", "BTC/USDT", "solana", "PEPE", "nylo", "virtual", "dogecoin", etc.
 */
export function resolveSymbolFromQuery(rawQuery: string): ResolvedAsset {
  const trimmed = (rawQuery || '').trim();
  if (!trimmed) {
    return {
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      name: 'Bitcoin',
      category: 'MAJOR'
    };
  }

  const queryLower = trimmed.toLowerCase();
  const alphanumeric = trimmed.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  // 1. Direct symbol match in registry
  if (CANONICAL_MARKET_REGISTRY[alphanumeric]) {
    const entry = CANONICAL_MARKET_REGISTRY[alphanumeric];
    return {
      symbol: alphanumeric,
      baseAsset: entry.baseAsset,
      quoteAsset: 'USDT',
      name: entry.name,
      category: entry.category
    };
  }

  // 2. Base asset match in registry (e.g. "BTC" -> "BTCUSDT")
  for (const [sym, entry] of Object.entries(CANONICAL_MARKET_REGISTRY)) {
    if (entry.baseAsset.toLowerCase() === queryLower || entry.baseAsset.toUpperCase() === alphanumeric) {
      return {
        symbol: sym,
        baseAsset: entry.baseAsset,
        quoteAsset: 'USDT',
        name: entry.name,
        category: entry.category
      };
    }
  }

  // 3. Exact or prefix match on asset name (e.g. "Bitcoin", "Ethereum", "Pepe", "Solana")
  for (const [sym, entry] of Object.entries(CANONICAL_MARKET_REGISTRY)) {
    if (
      entry.name.toLowerCase() === queryLower ||
      entry.name.toLowerCase().startsWith(queryLower) ||
      queryLower.startsWith(entry.name.toLowerCase())
    ) {
      return {
        symbol: sym,
        baseAsset: entry.baseAsset,
        quoteAsset: 'USDT',
        name: entry.name,
        category: entry.category
      };
    }
  }

  // 4. Substring search in name
  for (const [sym, entry] of Object.entries(CANONICAL_MARKET_REGISTRY)) {
    if (entry.name.toLowerCase().includes(queryLower)) {
      return {
        symbol: sym,
        baseAsset: entry.baseAsset,
        quoteAsset: 'USDT',
        name: entry.name,
        category: entry.category
      };
    }
  }

  // 5. If query is a custom ticker or dynamically discovered token
  let cleanSym = alphanumeric;
  if (!cleanSym.endsWith('USDT') && !cleanSym.endsWith('BUSD') && !cleanSym.endsWith('USDC')) {
    cleanSym = `${cleanSym}USDT`;
  }
  const baseAsset = cleanSym.replace(/(USDT|BUSD|USDC)$/, '');
  const category = getAssetCategory(cleanSym);

  return {
    symbol: cleanSym,
    baseAsset: baseAsset || cleanSym,
    quoteAsset: 'USDT',
    name: baseAsset || cleanSym,
    category
  };
}

/**
 * Search Market Universe Autocomplete (Phase 6.1)
 * Returns matching assets across all categories without Top-N restriction.
 */
export function searchMarketUniverse(query: string, limit: number = 8): ResolvedAsset[] {
  const trimmed = (query || '').trim().toLowerCase();
  if (!trimmed) {
    // Return sample assets across all 4 categories
    const sample = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'RENDERUSDT', 'PEPEUSDT', 'DOGEUSDT', 'VIRTUALUSDT', 'NYLOUSDT'];
    return sample.map(s => {
      const reg = CANONICAL_MARKET_REGISTRY[s];
      return {
        symbol: s,
        baseAsset: reg?.baseAsset || s.replace('USDT', ''),
        quoteAsset: 'USDT',
        name: reg?.name || s,
        category: reg?.category || 'ALTCOIN'
      };
    }).slice(0, limit);
  }

  const results: ResolvedAsset[] = [];
  const seen = new Set<string>();

  // Check canonical registry
  for (const [sym, entry] of Object.entries(CANONICAL_MARKET_REGISTRY)) {
    if (
      sym.toLowerCase().includes(trimmed) ||
      entry.baseAsset.toLowerCase().includes(trimmed) ||
      entry.name.toLowerCase().includes(trimmed)
    ) {
      results.push({
        symbol: sym,
        baseAsset: entry.baseAsset,
        quoteAsset: 'USDT',
        name: entry.name,
        category: entry.category
      });
      seen.add(sym);
      if (results.length >= limit) return results;
    }
  }

  // Check dynamically discovered symbols
  for (const sym of discoveredUniverseCache) {
    if (!seen.has(sym) && sym.toLowerCase().includes(trimmed)) {
      const base = sym.replace(/(USDT|BUSD|USDC)$/, '');
      results.push({
        symbol: sym,
        baseAsset: base,
        quoteAsset: 'USDT',
        name: base,
        category: getAssetCategory(sym)
      });
      seen.add(sym);
      if (results.length >= limit) return results;
    }
  }

  // If no match found yet, provide query fallback as a candidate
  if (results.length === 0) {
    const resolved = resolveSymbolFromQuery(query);
    results.push(resolved);
  }

  return results;
}

/**
 * Discover the entire available market universe from exchange ticker API dynamically,
 * merging with canonical registry without hardcoded Top-N restrictions.
 */
export async function discoverUniversalMarket(): Promise<string[]> {
  const now = Date.now();
  if (discoveredUniverseCache.length > 0 && now - lastDiscoveryTime < DISCOVERY_CACHE_TTL_MS) {
    return discoveredUniverseCache;
  }

  const symbolSet = new Set<string>(Object.keys(CANONICAL_MARKET_REGISTRY));

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    // Dynamic Binance Futures USDT-M Perpetual scanner with >= 5,000,000 USDT volume
    const [infoRes, tickerRes] = await Promise.all([
      fetch('https://fapi.binance.com/fapi/v1/exchangeInfo', { signal: controller.signal }),
      fetch('https://fapi.binance.com/fapi/v1/ticker/24hr', { signal: controller.signal })
    ]);
    clearTimeout(timeout);

    if (infoRes.ok && tickerRes.ok) {
      const info: any = await infoRes.json();
      const tickers: any[] = await tickerRes.json();

      const activePerpSet = new Set<string>();
      if (info && Array.isArray(info.symbols)) {
        for (const s of info.symbols) {
          if (s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT') {
            activePerpSet.add(s.symbol);
          }
        }
      }

      if (Array.isArray(tickers)) {
        for (const t of tickers) {
          if (activePerpSet.has(t.symbol)) {
            const quoteVol = parseFloat(t.quoteVolume);
            // Minimum 24h volume of 5,000,000 USDT to filter out illiquid pairs
            if (!isNaN(quoteVol) && quoteVol >= 5000000) {
              symbolSet.add(t.symbol);
            }
          }
        }
      }
      globalTelemetry.providerStatus.binance = 'OPERATIONAL';
    } else {
      globalTelemetry.providerStatus.binance = 'DEGRADED';
    }
  } catch (err) {
    // Graceful fallback to registered universe
    globalTelemetry.providerStatus.binance = 'DEGRADED';
  }

  discoveredUniverseCache = Array.from(symbolSet);
  lastDiscoveryTime = now;
  globalTelemetry.totalEligibleDiscovered = discoveredUniverseCache.length;

  // Update category distribution counts
  let majorCount = 0;
  let altCount = 0;
  let memeCount = 0;
  let newCount = 0;

  for (const s of discoveredUniverseCache) {
    const cat = getAssetCategory(s);
    if (cat === 'MAJOR') majorCount++;
    else if (cat === 'ALTCOIN') altCount++;
    else if (cat === 'MEME_HIGH_BETA') memeCount++;
    else if (cat === 'NEW_LISTING') newCount++;
  }

  globalTelemetry.categoryDistribution = {
    major: majorCount,
    altcoin: altCount,
    memeHighBeta: memeCount,
    newListing: newCount
  };

  return discoveredUniverseCache;
}

/**
 * Get current market coverage telemetry snapshot
 */
export function getMarketCoverageTelemetry(): MarketCoverageTelemetry {
  const health = getProviderHealthStatus();
  return {
    ...globalTelemetry,
    categoryDistribution: { ...globalTelemetry.categoryDistribution },
    providerStatus: {
      binance: health.binance?.status === 'OPERATIONAL' ? 'OPERATIONAL' : (health.binance?.status === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'DEGRADED'),
      bybit: health.bybit?.status === 'OPERATIONAL' ? 'OPERATIONAL' : (health.bybit?.status === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'DEGRADED'),
      okx: health.okx?.status === 'OPERATIONAL' ? 'OPERATIONAL' : (health.okx?.status === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'DEGRADED'),
      mexc: health.mexc?.status === 'OPERATIONAL' ? 'OPERATIONAL' : 'DEGRADED',
      coingecko: 'OPERATIONAL',
      derivativesProvider: 'OPERATIONAL'
    },
    providerHealth: health,
    wsStreamsActive: liveStreamManager.getActiveStreamCount(),
    staleCount: globalTelemetry.failedOrUnavailableScans
  };
}

/**
 * Record a scan cycle result in market coverage telemetry
 */
export function updateScanCoverageTelemetry(stats: {
  scanned: number;
  successful: number;
  failed: number;
  waitCount: number;
  actionableCount: number;
  staleCount?: number;
  providerStatus?: any;
}) {
  globalTelemetry.totalAssetsScanned = stats.scanned;
  globalTelemetry.successfulScans = stats.successful;
  globalTelemetry.failedOrUnavailableScans = stats.failed;
  globalTelemetry.waitCount = stats.waitCount;
  globalTelemetry.actionableCount = stats.actionableCount;
  globalTelemetry.lastScanTimestamp = Date.now();
  if (stats.providerStatus) {
    globalTelemetry.providerStatus = {
      ...globalTelemetry.providerStatus,
      ...stats.providerStatus
    };
  }
}

/**
 * Bounded Concurrency Executor with Failure Isolation
 * Runs tasks across all symbols safely without crashing if a single coin/provider fails.
 */
export async function runBoundedParallelScan<T>(
  symbols: string[],
  workerFn: (symbol: string) => Promise<T | null>,
  concurrency: number = 6,
  timeoutMs: number = 6500
): Promise<T[]> {
  const results: T[] = [];
  const queue = [...symbols];
  let activeWorkers = 0;

  return new Promise((resolve) => {
    if (queue.length === 0) {
      return resolve([]);
    }

    const next = () => {
      while (activeWorkers < concurrency && queue.length > 0) {
        const symbol = queue.shift();
        if (!symbol) break;

        activeWorkers++;

        // Strict timeout wrapper to guarantee one slow coin/provider never blocks the global scanner
        let timer: any = null;
        const timeoutPromise = new Promise<null>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Worker scan timeout after ${timeoutMs}ms for ${symbol}`));
          }, timeoutMs);
        });

        Promise.race([
          workerFn(symbol).finally(() => {
            if (timer) clearTimeout(timer);
          }),
          timeoutPromise
        ])
          .then((res) => {
            if (res !== null && res !== undefined) {
              results.push(res);
            }
          })
          .catch((err) => {
            // Task 10 & Phase 17: Failure isolation - log and do not crash or block global scanner
            console.warn(`[MarketUniverse] Isolated failure scanning ${symbol}:`, err?.message || err);
          })
          .finally(() => {
            activeWorkers--;
            if (queue.length > 0) {
              next();
            } else if (activeWorkers === 0) {
              resolve(results);
            }
          });
      }
    };

    next();
  });
}
