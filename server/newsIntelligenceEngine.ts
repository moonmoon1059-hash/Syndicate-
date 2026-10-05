import { fetchCryptoNews, RawNewsArticle } from './newsService';
import { Candle } from './cryptoService';
import {
  NewsSourceTier,
  NewsSentiment,
  NewsEventType,
  NewsImpactLevel,
  NewsFreshness,
  MarketReactionState,
  ListingStatus,
  ListingRadarAssessment,
  PostListingClassification,
  PrePumpCatalystSetup,
  ExhaustionDumpRisk,
  NewListingInfo,
  MarketReactionAnalysis,
  NewsItem,
  NewsCatalystType,
  NewsImpactClassification,
  SourceCredibilityTier,
  NewsVerificationStatus,
  NewsReactionWindowPeriod,
  ReactionWindowStatus,
  ReactionWindowMetric,
  NewsReactionConflictType,
  NewsTechnicalAlignment,
  NewsMarketImpactReport
} from '../src/types/crypto';

export type { RawNewsArticle };
export type ProcessedNews = NewsItem;

// ============================================================================
// 1. ALL-COIN DICTIONARY & DISAMBIGUATION RULES
// ============================================================================

export interface CoinMetadata {
  symbol: string;
  name: string;
  aliases: string[];
  requiresStrictBoundary?: boolean;
  ecosystem?: string;
}

const EXTENDED_COIN_MAP: Record<string, CoinMetadata> = {
  BTC: { symbol: 'BTC', name: 'bitcoin', aliases: ['btc', 'satoshi', 'xbt'], ecosystem: 'BITCOIN' },
  ETH: { symbol: 'ETH', name: 'ethereum', aliases: ['eth', 'vitalik', 'erc20', 'ether'], ecosystem: 'ETHEREUM' },
  SOL: { symbol: 'SOL', name: 'solana', aliases: ['sol', 'solana', 'spl'], ecosystem: 'SOLANA' },
  BNB: { symbol: 'BNB', name: 'binance coin', aliases: ['bnb', 'binance chain', 'bsc'], ecosystem: 'BINANCE' },
  XRP: { symbol: 'XRP', name: 'ripple', aliases: ['xrp', 'ripple labs'], ecosystem: 'RIPPLE' },
  ADA: { symbol: 'ADA', name: 'cardano', aliases: ['ada', 'hoskinson', 'cardano'], ecosystem: 'CARDANO' },
  DOGE: { symbol: 'DOGE', name: 'dogecoin', aliases: ['doge', 'shiba inu doge', 'elon doge'], ecosystem: 'MEME' },
  AVAX: { symbol: 'AVAX', name: 'avalanche', aliases: ['avax', 'avalanche c-chain', 'ava labs'], ecosystem: 'AVALANCHE' },
  LINK: { symbol: 'LINK', name: 'chainlink', aliases: ['chainlink', '$link'], requiresStrictBoundary: true, ecosystem: 'CHAINLINK' },
  NEAR: { symbol: 'NEAR', name: 'near protocol', aliases: ['near protocol', '$near'], requiresStrictBoundary: true, ecosystem: 'NEAR' },
  SUI: { symbol: 'SUI', name: 'sui network', aliases: ['sui network', 'mysten labs', '$sui'], ecosystem: 'SUI' },
  APT: { symbol: 'APT', name: 'aptos', aliases: ['aptos', 'aptos labs', '$apt'], ecosystem: 'APTOS' },
  PEPE: { symbol: 'PEPE', name: 'pepe', aliases: ['pepe memecoin', 'pepe coin', '$pepe'], ecosystem: 'MEME' },
  RENDER: { symbol: 'RENDER', name: 'render network', aliases: ['render network', 'rndr', '$render'], ecosystem: 'AI' },
  FET: { symbol: 'FET', name: 'artificial superintelligence alliance', aliases: ['fetch.ai', 'fet', 'asi token', 'ocean protocol', 'singularitynet'], ecosystem: 'AI' },
  DOT: { symbol: 'DOT', name: 'polkadot', aliases: ['polkadot', 'parachain', '$dot'], ecosystem: 'POLKADOT' },
  ATOM: { symbol: 'ATOM', name: 'cosmos', aliases: ['cosmos hub', 'tendermint', '$atom'], ecosystem: 'COSMOS' },
  ARB: { symbol: 'ARB', name: 'arbitrum', aliases: ['arbitrum', 'offchain labs', '$arb'], ecosystem: 'ETHEREUM' },
  OP: { symbol: 'OP', name: 'optimism', aliases: ['optimism l2', 'op stack', '$op'], requiresStrictBoundary: true, ecosystem: 'ETHEREUM' },
  TIA: { symbol: 'TIA', name: 'celestia', aliases: ['celestia', 'modular blockchain', '$tia'], ecosystem: 'MODULAR' },
  INJ: { symbol: 'INJ', name: 'injective', aliases: ['injective protocol', '$inj'], ecosystem: 'COSMOS' },
  SEI: { symbol: 'SEI', name: 'sei network', aliases: ['sei network', '$sei'], ecosystem: 'SEI' },
  KAS: { symbol: 'KAS', name: 'kaspa', aliases: ['kaspa', 'ghostdag', '$kas'], ecosystem: 'POW' },
  TON: { symbol: 'TON', name: 'the open network', aliases: ['toncoin', 'telegram ton', '$ton'], ecosystem: 'TON' },
  SHIB: { symbol: 'SHIB', name: 'shiba inu', aliases: ['shiba inu', 'shibarium', '$shib'], ecosystem: 'MEME' },
  MATIC: { symbol: 'MATIC', name: 'polygon', aliases: ['polygon', 'matic network', 'pol token', '$pol'], ecosystem: 'POLYGON' },
  UNI: { symbol: 'UNI', name: 'uniswap', aliases: ['uniswap', 'hayden adams', '$uni'], ecosystem: 'DEFI' },
  AAVE: { symbol: 'AAVE', name: 'aave', aliases: ['aave protocol', '$aave'], ecosystem: 'DEFI' },
  FTM: { symbol: 'FTM', name: 'fantom', aliases: ['fantom', 'sonic network', '$ftm', '$s'], ecosystem: 'FANTOM' },
  ICP: { symbol: 'ICP', name: 'internet computer', aliases: ['dfinity', 'internet computer', '$icp'], ecosystem: 'ICP' },
  STX: { symbol: 'STX', name: 'stacks', aliases: ['stacks bitcoin', '$stx'], ecosystem: 'BITCOIN' },
  BONK: { symbol: 'BONK', name: 'bonk', aliases: ['bonk solana', '$bonk'], ecosystem: 'SOLANA' },
  WIF: { symbol: 'WIF', name: 'dogwifhat', aliases: ['dogwifhat', 'wif token', '$wif'], ecosystem: 'SOLANA' },
  FLOKI: { symbol: 'FLOKI', name: 'floki', aliases: ['floki inu', 'valhalla', '$floki'], ecosystem: 'MEME' },
  NOT: { symbol: 'NOT', name: 'notcoin', aliases: ['notcoin', '$not'], requiresStrictBoundary: true, ecosystem: 'TON' },
  STRK: { symbol: 'STRK', name: 'starknet', aliases: ['starknet', 'starkware', '$strk'], ecosystem: 'ETHEREUM' },
  JUP: { symbol: 'JUP', name: 'jupiter', aliases: ['jupiter exchange', 'jupiter dex', '$jup'], ecosystem: 'SOLANA' },
  PYTH: { symbol: 'PYTH', name: 'pyth network', aliases: ['pyth network', 'pyth oracle', '$pyth'], ecosystem: 'ORACLE' },
  ENA: { symbol: 'ENA', name: 'ethena', aliases: ['ethena', 'usde', '$ena'], ecosystem: 'DEFI' },
  ONDO: { symbol: 'ONDO', name: 'ondo finance', aliases: ['ondo finance', 'rwa ondo', '$ondo'], ecosystem: 'RWA' },
  W: { symbol: 'W', name: 'wormhole', aliases: ['wormhole bridge', 'wormhole token', '$w'], requiresStrictBoundary: true, ecosystem: 'INTEROP' },
  PENDLE: { symbol: 'PENDLE', name: 'pendle', aliases: ['pendle finance', 'yield tokenization', '$pendle'], ecosystem: 'DEFI' },
  TAO: { symbol: 'TAO', name: 'bittensor', aliases: ['bittensor', 'subnets', '$tao'], ecosystem: 'AI' },
  BLUR: { symbol: 'BLUR', name: 'blur', aliases: ['blur nft', 'blur marketplace', '$blur'], requiresStrictBoundary: true, ecosystem: 'NFT' },
  GALA: { symbol: 'GALA', name: 'gala games', aliases: ['gala games', '$gala'], ecosystem: 'GAMING' },
  DYDX: { symbol: 'DYDX', name: 'dydx', aliases: ['dydx chain', '$dydx'], ecosystem: 'DEFI' },
  IMX: { symbol: 'IMX', name: 'immutable x', aliases: ['immutable x', 'immutable zk', '$imx'], ecosystem: 'GAMING' },
  LDO: { symbol: 'LDO', name: 'lido dao', aliases: ['lido dao', 'steth', '$ldo'], ecosystem: 'DEFI' },
  MKR: { symbol: 'MKR', name: 'maker', aliases: ['makerdao', 'sky protocol', '$mkr'], ecosystem: 'DEFI' },
  CRV: { symbol: 'CRV', name: 'curve dao', aliases: ['curve finance', '$crv'], ecosystem: 'DEFI' },
  SNX: { symbol: 'SNX', name: 'synthetix', aliases: ['synthetix', '$snx'], ecosystem: 'DEFI' },
  LTC: { symbol: 'LTC', name: 'litecoin', aliases: ['litecoin', '$ltc'], ecosystem: 'POW' },
  BCH: { symbol: 'BCH', name: 'bitcoin cash', aliases: ['bitcoin cash', '$bch'], ecosystem: 'POW' },
  ETC: { symbol: 'ETC', name: 'ethereum classic', aliases: ['ethereum classic', '$etc'], ecosystem: 'POW' },
  FIL: { symbol: 'FIL', name: 'filecoin', aliases: ['filecoin', '$fil'], ecosystem: 'STORAGE' },
  HBAR: { symbol: 'HBAR', name: 'hedera', aliases: ['hedera hashgraph', '$hbar'], ecosystem: 'ENTERPRISE' },
  ALGO: { symbol: 'ALGO', name: 'algorand', aliases: ['algorand', '$algo'], ecosystem: 'L1' },
  QNT: { symbol: 'QNT', name: 'quant', aliases: ['quant network', 'overledger', '$qnt'], ecosystem: 'INTEROP' },
  VET: { symbol: 'VET', name: 'vechain', aliases: ['vechain', 'vechainthor', '$vet'], ecosystem: 'SUPPLY_CHAIN' },
  SAND: { symbol: 'SAND', name: 'the sandbox', aliases: ['the sandbox', '$sand'], requiresStrictBoundary: true, ecosystem: 'METAVERSE' },
  MANA: { symbol: 'MANA', name: 'decentraland', aliases: ['decentraland', '$mana'], ecosystem: 'METAVERSE' },
  AXS: { symbol: 'AXS', name: 'axie infinity', aliases: ['axie infinity', 'ronin axs', '$axs'], ecosystem: 'GAMING' },
  RUNE: { symbol: 'RUNE', name: 'thorchain', aliases: ['thorchain', '$rune'], ecosystem: 'CROSSCHAIN' },
  KAVA: { symbol: 'KAVA', name: 'kava', aliases: ['kava chain', '$kava'], ecosystem: 'COSMOS' },
  APE: { symbol: 'APE', name: 'apecoin', aliases: ['apecoin', 'yuga labs', '$ape'], ecosystem: 'NFT' },
  CHZ: { symbol: 'CHZ', name: 'chiliz', aliases: ['chiliz', 'socios', '$chz'], ecosystem: 'FAN_TOKEN' },
  ROSE: { symbol: 'ROSE', name: 'oasis network', aliases: ['oasis network', '$rose'], requiresStrictBoundary: true, ecosystem: 'PRIVACY' },
  ENS: { symbol: 'ENS', name: 'ethereum name service', aliases: ['ethereum name service', '.eth domain', '$ens'], ecosystem: 'INFRA' },
  GMX: { symbol: 'GMX', name: 'gmx', aliases: ['gmx exchange', '$gmx'], ecosystem: 'DEFI' },
  WLD: { symbol: 'WLD', name: 'worldcoin', aliases: ['worldcoin', 'sam altman orb', '$wld'], ecosystem: 'AI' },
  AEVO: { symbol: 'AEVO', name: 'aevo', aliases: ['aevo options', '$aevo'], ecosystem: 'DEFI' },
  ETHFI: { symbol: 'ETHFI', name: 'ether.fi', aliases: ['ether.fi', 'restaking', '$ethfi'], ecosystem: 'RESTAKING' },
  BOME: { symbol: 'BOME', name: 'book of meme', aliases: ['book of meme', '$bome'], ecosystem: 'MEME' },
  MEW: { symbol: 'MEW', name: 'cat in a dogs world', aliases: ['cat in a dogs world', '$mew'], ecosystem: 'MEME' }
};

// Common English words that might clash with crypto tickers
const AMBIGUOUS_WORDS: Record<string, string[]> = {
  NEAR: ['near the', 'near support', 'near resistance', 'near high', 'near low', 'near term', 'drawing near'],
  LINK: ['click the link', 'link below', 'hyperlink', 'linked to', 'link in bio'],
  OP: ['op-ed', 'photo op', 'co-op'],
  NOT: ['not only', 'is not', 'did not', 'will not', 'could not', 'not a'],
  W: ['w/o', 'w/'],
  BLUR: ['blurred', 'blurring', 'blur the line'],
  SAND: ['sand dune', 'grains of sand', 'sand box testing'],
  ROSE: ['prices rose', 'rose sharply', 'rose by', 'rose over', 'rose above']
};

/**
 * Maps news text to coin symbols with strict boundary & context disambiguation
 */
export function mapNewsToCoins(
  text: string,
  tags?: string[]
): { matchedCoins: string[]; relatedCoins: string[]; primaryCoin?: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN' } {
  if (!text || text.trim().length === 0) {
    return { matchedCoins: [], relatedCoins: [], confidence: 'UNKNOWN' };
  }

  const lowerText = text.toLowerCase();
  const matchedSet = new Set<string>();
  let primaryCoin: string | undefined = undefined;
  let highestDirectScore = 0;

  // 1. Check explicit tags if present
  if (tags && Array.isArray(tags)) {
    for (const tag of tags) {
      const cleanTag = tag.trim().toUpperCase();
      if (EXTENDED_COIN_MAP[cleanTag]) {
        matchedSet.add(cleanTag);
        if (!primaryCoin) primaryCoin = cleanTag;
      }
    }
  }

  // 2. Scan text for coin references with contextual filtering
  for (const [symbol, meta] of Object.entries(EXTENDED_COIN_MAP)) {
    let matchScore = 0;

    // Direct Cashtag match like $BTC or $SOL
    const cashTag = `$${symbol.toLowerCase()}`;
    if (lowerText.includes(cashTag)) {
      matchScore += 10;
      matchedSet.add(symbol);
    }

    // Full name match (e.g., "ethereum", "solana", "arbitrum")
    if (lowerText.includes(meta.name)) {
      matchScore += 8;
      matchedSet.add(symbol);
    }

    // Alias matches
    for (const alias of meta.aliases) {
      if (alias.startsWith('$')) continue; // already checked cashtag
      const regex = new RegExp(`\\b${alias.replace('.', '\\.')}\\b`, 'i');
      if (regex.test(text)) {
        // Disambiguate if ambiguous word
        if (AMBIGUOUS_WORDS[symbol]) {
          const isFalsePositive = AMBIGUOUS_WORDS[symbol].some(phrase => lowerText.includes(phrase));
          const hasCryptoContext = /\b(token|coin|crypto|protocol|chain|dex|price|rally|dump|surge|listing|mainnet|defi|staking)\b/i.test(text);
          if (isFalsePositive && !hasCryptoContext) {
            continue;
          }
        }
        matchScore += 5;
        matchedSet.add(symbol);
      }
    }

    // Direct uppercase Symbol check with word boundary (e.g. \bBTC\b)
    const symbolRegex = new RegExp(`\\b${symbol}\\b`);
    if (symbolRegex.test(text)) {
      if (meta.requiresStrictBoundary) {
        // Require explicit crypto context for short/ambiguous tickers like OP, NOT, W
        const hasCryptoContext = /\b(token|coin|crypto|protocol|chain|dex|price|rally|dump|surge|listing|mainnet|defi|staking|usd|usdt)\b/i.test(text);
        if (hasCryptoContext) {
          matchScore += 4;
          matchedSet.add(symbol);
        }
      } else {
        matchScore += 5;
        matchedSet.add(symbol);
      }
    }

    if (matchScore > highestDirectScore) {
      highestDirectScore = matchScore;
      primaryCoin = symbol;
    }
  }

  const matchedCoins = Array.from(matchedSet);
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN' = 'UNKNOWN';

  if (matchedCoins.length > 0) {
    if (highestDirectScore >= 8) confidence = 'HIGH';
    else if (highestDirectScore >= 4) confidence = 'MEDIUM';
    else confidence = 'LOW';
  } else {
    // If macro, geopolitical or general market news (broad benchmark)
    const isMacro = /\b(crypto market|crypto industry|bitcoin|btc|etf|sec approval|fed rate|interest rate|cpi|stablecoins)\b/i.test(text);
    const isGeopolitical = /\b(war|conflict|sanctions|geopolitical|tariff|military|embargo|trade war)\b/i.test(text);
    if (isMacro || isGeopolitical) {
      matchedCoins.push('BTC', 'ETH'); // Broad crypto benchmarks
      primaryCoin = 'BTC';
      confidence = 'MEDIUM';
    }
  }

  return {
    matchedCoins,
    relatedCoins: matchedCoins,
    primaryCoin: primaryCoin || matchedCoins[0],
    confidence
  };
}

// ============================================================================
// 2. SOURCE QUALITY & RELIABILITY CLASSIFIER
// ============================================================================

const TIER_1_SOURCES = [
  'binance', 'coinbase', 'okx', 'bybit', 'kraken', 'mexc', 'kucoin',
  'ethereum foundation', 'solana foundation', 'sec.gov', 'cftc', 'federal reserve',
  'pr newswire', 'businesswire', 'official blog', 'announcements.binance.com'
];

const TIER_2_SOURCES = [
  'bloomberg', 'reuters', 'coindesk', 'cointelegraph', 'decrypt', 'the block',
  'blockworks', 'dl news', 'wsj', 'cnbc', 'financial times', 'forbes crypto', 'barron\'s'
];

const TIER_3_SOURCES = [
  'cryptoslate', 'beincrypto', 'cryptobriefing', 'ambcrypto', 'cryptodaily',
  'coinmarketcap', 'coingecko', 'newsbtc', 'fxstreet', 'dailyhodl', 'u.today', 'bitcoinist'
];

const TIER_4_SOURCES = [
  'twitter', 'x.com', 'telegram', 'reddit', '4chan', 'medium', 'youtube',
  'unverified rumor', 'anonymous leak', 'forum'
];

export function classifySourceQuality(source: string, url: string = ''): { tier: NewsSourceTier; isVerified: boolean } {
  if (!source || source.trim() === '') {
    return { tier: 'UNKNOWN', isVerified: false };
  }

  const s = source.toLowerCase();
  const u = url.toLowerCase();

  // Tier 1: Official Announcements & Government/Regulatory
  if (TIER_1_SOURCES.some(t => s.includes(t) || u.includes(t))) {
    return { tier: 'TIER_1', isVerified: true };
  }

  // Tier 2: Established Tier 1 Media
  if (TIER_2_SOURCES.some(t => s.includes(t) || u.includes(t))) {
    return { tier: 'TIER_2', isVerified: true };
  }

  // Tier 3: Secondary / Aggregators
  if (TIER_3_SOURCES.some(t => s.includes(t) || u.includes(t))) {
    return { tier: 'TIER_3', isVerified: true };
  }

  // Tier 4: Social / Rumors / Unverified
  if (TIER_4_SOURCES.some(t => s.includes(t) || u.includes(t)) || s.includes('rumor') || s.includes('unconfirmed')) {
    return { tier: 'TIER_4', isVerified: false };
  }

  // Default to Tier 3 if recognized as general crypto publication, otherwise Tier 4
  return { tier: 'TIER_3', isVerified: true };
}

export function classifySourceCredibilityTier(source: string, url: string = ''): {
  credibilityTier: SourceCredibilityTier;
  credibilityScore: number;
  verificationStatus: NewsVerificationStatus;
  isRumor: boolean;
  isFake: boolean;
} {
  if (!source || source.trim() === '') {
    return {
      credibilityTier: 'UNKNOWN',
      credibilityScore: 0,
      verificationStatus: 'UNKNOWN',
      isRumor: false,
      isFake: false
    };
  }

  const s = source.toLowerCase();
  const u = url.toLowerCase();

  // Explicit check for fake / parody / scam / retracted warnings
  if (s.includes('fake') || s.includes('parody') || s.includes('satire') || s.includes('hoax') || s.includes('phish') || s.includes('debunked')) {
    return {
      credibilityTier: 'TIER_4_SOCIAL_UNVERIFIED',
      credibilityScore: 0,
      verificationStatus: 'DISPUTED_FAKE',
      isRumor: true,
      isFake: true
    };
  }

  // Tier 1: Official Announcements & Government/Regulatory
  if (TIER_1_SOURCES.some(t => s.includes(t) || u.includes(t))) {
    return {
      credibilityTier: 'TIER_1_OFFICIAL',
      credibilityScore: 95,
      verificationStatus: 'VERIFIED',
      isRumor: false,
      isFake: false
    };
  }

  // Tier 2: Established Tier 1 Financial / Crypto Media
  if (TIER_2_SOURCES.some(t => s.includes(t) || u.includes(t))) {
    return {
      credibilityTier: 'TIER_2_TIER1_MEDIA',
      credibilityScore: 85,
      verificationStatus: 'VERIFIED',
      isRumor: false,
      isFake: false
    };
  }

  // Tier 3: Secondary Crypto Aggregators & Outlets
  if (TIER_3_SOURCES.some(t => s.includes(t) || u.includes(t))) {
    return {
      credibilityTier: 'TIER_3_SECONDARY',
      credibilityScore: 65,
      verificationStatus: 'VERIFIED',
      isRumor: false,
      isFake: false
    };
  }

  // Tier 4: Social / Rumors / Unverified
  if (TIER_4_SOURCES.some(t => s.includes(t) || u.includes(t)) || s.includes('rumor') || s.includes('unconfirmed') || s.includes('leak') || s.includes('whisper')) {
    return {
      credibilityTier: 'TIER_4_SOCIAL_UNVERIFIED',
      credibilityScore: 30,
      verificationStatus: 'UNVERIFIED_RUMOR',
      isRumor: true,
      isFake: false
    };
  }

  // Default to secondary publication
  return {
    credibilityTier: 'TIER_3_SECONDARY',
    credibilityScore: 60,
    verificationStatus: 'VERIFIED',
    isRumor: false,
    isFake: false
  };
}

// ============================================================================
// 3. NEWS CLASSIFICATION & EVENT TYPE ENGINE
// ============================================================================

export interface EventClassificationResult {
  eventType: NewsEventType;
  sentiment: NewsSentiment;
  severity: number; // 0 - 100
  isContradictoryOrMixed: boolean;
  bullScore: number;
  bearScore: number;
}

export function classifyNewsEvent(title: string, summary: string = ''): EventClassificationResult {
  const text = `${title} ${summary}`.toLowerCase();

  // Keyword rules for Event Types
  let eventType: NewsEventType = 'OTHER';
  let severity = 50;

  if (/\b(delist|delisting|remove trading pair|delisted)\b/i.test(text)) {
    eventType = 'DELISTING';
    severity = 80;
  } else if (/\b(launchpad|launchpool|listing|list on|listed on|will list|spot listing|futures listing)\b/i.test(text)) {
    eventType = 'LISTING';
    severity = 85;
  } else if (/\b(hack|hacked|exploit|exploited|drained|rug pull|stolen|breached|vulnerability exploit)\b/i.test(text)) {
    eventType = 'HACK';
    severity = 95;
  } else if (/\b(token unlock|vesting cliff|unlocking|cliff unlock|unlock schedule)\b/i.test(text)) {
    eventType = 'UNLOCK';
    severity = 75;
  } else if (/\b(token burn|burned|buyback and burn|burning|supply destruction)\b/i.test(text)) {
    eventType = 'BURN';
    severity = 75;
  } else if (/\b(airdrop|snapshot|claim tokens|airdrop claim|token distribution)\b/i.test(text)) {
    eventType = 'AIRDROP';
    severity = 70;
  } else if (/\b(mainnet launch|mainnet live|mainnet release|mainnet migration|mainnet)\b/i.test(text)) {
    eventType = 'MAINNET';
    severity = 80;
  } else if (/\b(testnet launch|testnet live|incentivized testnet|devnet)\b/i.test(text)) {
    eventType = 'TESTNET';
    severity = 60;
  } else if (/\b(etf|spot etf|etf inflow|etf outflow|s-1|19b-4|blackrock etf|fidelity etf)\b/i.test(text)) {
    eventType = 'ETF';
    severity = 90;
  } else if (/\b(sec|cftc|lawsuit|investigation|subpoena|regulatory|compliance|court ruling|settlement|gensler)\b/i.test(text)) {
    eventType = 'REGULATION';
    severity = 85;
  } else if (/\b(partnership|partnered|collaborat|teamed up|strategic alliance|integration with)\b/i.test(text)) {
    eventType = 'PARTNERSHIP';
    severity = 70;
  } else if (/\b(upgrade|hard fork|hardfork|v2 launch|v3 launch|dencun|network upgrade|improvement proposal|eip-|bip-)\b/i.test(text)) {
    eventType = 'UPGRADE';
    severity = 75;
  } else if (/\b(funding round|raised|series a|series b|seed round|venture capital|valuation)\b/i.test(text)) {
    eventType = 'FUNDING';
    severity = 70;
  } else if (/\b(institutional|microstrategy|treasury reserve|custody|fidelity digital|asset manager)\b/i.test(text)) {
    eventType = 'INSTITUTIONAL';
    severity = 80;
  } else if (/\b(security audit|patch|audit passed|whitehat|fund recovered)\b/i.test(text)) {
    eventType = 'SECURITY';
    severity = 65;
  } else if (/\b(outage|downtime|network halt|paused network|chain halt|congestion)\b/i.test(text)) {
    eventType = 'OUTAGE';
    severity = 85;
  } else if (/\b(dao vote|governance proposal|passed vote|voted to|community approval)\b/i.test(text)) {
    eventType = 'GOVERNANCE';
    severity = 55;
  } else if (/\b(cpi|fomc|interest rate|federal reserve|inflation|powell|gdp|rate cut|macro)\b/i.test(text)) {
    eventType = 'MACRO';
    severity = 75;
  } else if (/\b(war|conflict|sanctions|geopolitical|tariff|military|missile|trade war|embargo)\b/i.test(text)) {
    eventType = 'GEOPOLITICAL';
    severity = 80;
  } else if (/\b(grant|ecosystem fund|accelerator|developer incentive)\b/i.test(text)) {
    eventType = 'ECOSYSTEM';
    severity = 60;
  }

  // Sentiment Lexicon
  const BULLISH_SIGNALS = [
    'surge', 'soar', 'rally', 'jump', 'inflow', 'gain', 'breakout', 'record high',
    'all-time high', 'ath', 'approval', 'approved', 'partnership', 'accumulat', 'bullish',
    'upgrade', 'burn', 'airdrop', 'listing', 'mainnet', 'etf inflow', 'expansion', 'adoption',
    'record volume', 'milestone', 'raised', 'funded', 'buyback', 'institutional purchase'
  ];

  const BEARISH_SIGNALS = [
    'crash', 'drop', 'dump', 'plummet', 'hack', 'outflow', 'lawsuit', 'sec', 'ban',
    'liquidation', 'bearish', 'exploit', 'breach', 'delist', 'outage', 'downtime',
    'unlock', 'mass sell', 'investigation', 'subpoena', 'fine', 'penalty', 'insolvency',
    'halt', 'stolen', 'rug pull', 'vulnerability', 'deficit', 'fall', 'slump', 'loss'
  ];

  let bullScore = 0;
  let bearScore = 0;

  BULLISH_SIGNALS.forEach(term => {
    if (text.includes(term)) bullScore += 1;
  });

  BEARISH_SIGNALS.forEach(term => {
    if (text.includes(term)) bearScore += 1;
  });

  // Event type default sentiment bias
  if (eventType === 'LISTING' || eventType === 'BURN' || eventType === 'MAINNET' || eventType === 'FUNDING' || eventType === 'PARTNERSHIP') {
    bullScore += 2;
  } else if (eventType === 'HACK' || eventType === 'DELISTING' || eventType === 'OUTAGE') {
    bearScore += 3;
  } else if (eventType === 'UNLOCK') {
    bearScore += 1.5;
  }

  let sentiment: NewsSentiment = 'NEUTRAL';
  let isContradictoryOrMixed = false;

  if (bullScore > 0 && bearScore > 0 && Math.abs(bullScore - bearScore) <= 1) {
    sentiment = 'MIXED';
    isContradictoryOrMixed = true;
  } else if (bullScore > bearScore + 1) {
    sentiment = 'BULLISH';
  } else if (bearScore > bullScore + 1) {
    sentiment = 'BEARISH';
  } else if (bullScore > bearScore) {
    sentiment = 'BULLISH';
  } else if (bearScore > bullScore) {
    sentiment = 'BEARISH';
  } else {
    sentiment = text.length > 0 ? 'NEUTRAL' : 'UNKNOWN';
  }

  return {
    eventType,
    sentiment,
    severity,
    isContradictoryOrMixed,
    bullScore,
    bearScore
  };
}

// ============================================================================
// 4. NEWS FRESHNESS & DECAY ENGINE
// ============================================================================

export function calculateNewsFreshness(
  publishedAt: number,
  now: number = Date.now()
): { freshness: NewsFreshness; ageMinutes: number; decayMultiplier: number; isActive: boolean } {
  const ageMs = Math.max(0, now - publishedAt);
  const ageMinutes = Math.round(ageMs / (60 * 1000));
  const ageHours = ageMinutes / 60;

  let freshness: NewsFreshness = 'HISTORICAL';
  let decayMultiplier = 0.20;
  let isActive = false;

  if (ageHours < 2) {
    freshness = 'BREAKING';
    decayMultiplier = 1.0;
    isActive = true;
  } else if (ageHours < 8) {
    freshness = 'FRESH';
    decayMultiplier = 0.85;
    isActive = true;
  } else if (ageHours < 24) {
    freshness = 'RECENT';
    decayMultiplier = 0.70;
    isActive = true;
  } else if (ageHours < 72) {
    freshness = 'AGING';
    decayMultiplier = 0.45;
    isActive = true;
  } else {
    freshness = 'HISTORICAL';
    decayMultiplier = 0.20;
    isActive = false;
  }

  return {
    freshness,
    ageMinutes,
    decayMultiplier,
    isActive
  };
}

// ============================================================================
// 5. DETERMINISTIC NEWS IMPACT SCORING
// ============================================================================

export function calculateNewsImpactScore(params: {
  eventType: NewsEventType;
  sentiment: NewsSentiment;
  sourceTier: NewsSourceTier;
  isVerified: boolean;
  sourceCount: number;
  isDirectTarget: boolean;
  freshnessDecay: number;
  severity: number;
}): { score: number; level: NewsImpactLevel } {
  const {
    eventType,
    sentiment,
    sourceTier,
    isVerified,
    sourceCount,
    isDirectTarget,
    freshnessDecay,
    severity
  } = params;

  if (sentiment === 'UNKNOWN') {
    return { score: 0, level: 'UNKNOWN' };
  }

  // Base score from severity & event
  let baseScore = severity || 50;

  // Source Tier Weight
  let tierMultiplier = 1.0;
  if (sourceTier === 'TIER_1') tierMultiplier = 1.25;
  else if (sourceTier === 'TIER_2') tierMultiplier = 1.05;
  else if (sourceTier === 'TIER_3') tierMultiplier = 0.85;
  else if (sourceTier === 'TIER_4') tierMultiplier = 0.50; // Rumor penalty

  if (!isVerified) {
    tierMultiplier = Math.min(tierMultiplier, 0.55);
  }

  // Multi-source confirmation boost (e.g. 12 websites report the same story)
  const confirmationBoost = Math.min(1.25, 1.0 + Math.max(0, sourceCount - 1) * 0.04);

  // Direct token mention vs generic basket mention
  const directnessMultiplier = isDirectTarget ? 1.15 : 0.85;

  // Raw impact before decay
  const rawScore = baseScore * tierMultiplier * confirmationBoost * directnessMultiplier;

  // Apply freshness decay (so old news does not dominate)
  const finalScore = Math.min(100, Math.max(10, Math.round(rawScore * freshnessDecay)));

  let level: NewsImpactLevel = 'LOW';
  if (finalScore >= 80) level = 'VERY_HIGH';
  else if (finalScore >= 65) level = 'HIGH';
  else if (finalScore >= 45) level = 'MEDIUM';
  else level = 'LOW';

  return { score: finalScore, level };
}

// ============================================================================
// PHASE 13: NEWS INTELLIGENCE 2.0 (DETERMINISTIC PIPELINE)
// ============================================================================

export function classifyCatalystType(
  title: string,
  summary: string = '',
  source: string = ''
): {
  catalystType: NewsCatalystType;
  confidence: number;
  isRumor: boolean;
  isFake: boolean;
  notes?: string;
} {
  const text = `${title} ${summary}`.toLowerCase();
  const src = source.toLowerCase();

  // 1. FAKE / MISLEADING (highest priority check to isolate fake news)
  if (
    /\b(fake news|falsified|debunked|hoax|retracted|false report|spoofed|fake announcement|scam alert|phishing attack|phish|impersonating|disputed announcement)\b/i.test(text) ||
    src.includes('parody') ||
    src.includes('satire') ||
    src.includes('fake')
  ) {
    return {
      catalystType: 'FAKE_MISLEADING',
      confidence: 90,
      isRumor: true,
      isFake: true,
      notes: 'Flagged as fake, retracted, or debunked reporting'
    };
  }

  // 2. RUMOR / UNCONFIRMED (isolate rumors from confirmed catalysts)
  if (
    /\b(rumor|rumours|unconfirmed|sources claim|insider claims|speculation|whispers|allegedly|unverified report|purported|reportedly|market chatter)\b/i.test(text) ||
    src.includes('rumor') ||
    src.includes('leak') ||
    src.includes('unconfirmed')
  ) {
    return {
      catalystType: 'RUMOR',
      confidence: 75,
      isRumor: true,
      isFake: false,
      notes: 'Unverified source report or market speculation'
    };
  }

  // 3. EXCHANGE_LISTING
  if (
    /\b(listing|list on|listed on|will list|spot listing|futures listing|launchpool|launchpad|opens trading|trading pair added|listed by|bithumb listing|upbit listing|binance lists|coinbase lists|kraken lists|bybit lists|okx lists)\b/i.test(text) &&
    !/\b(delist|delisting)\b/i.test(text)
  ) {
    return {
      catalystType: 'EXCHANGE_LISTING',
      confidence: 88,
      isRumor: false,
      isFake: false,
      notes: 'New exchange or trading pair listing announcement'
    };
  }

  // 4. DELISTING
  if (/\b(delist|delisting|delisted|remove trading pair|trading halt|cessation of trading|removing \w+ pairs|cease trading|terminated trading)\b/i.test(text)) {
    return {
      catalystType: 'DELISTING',
      confidence: 90,
      isRumor: false,
      isFake: false,
      notes: 'Exchange delisting or cessation of trading pairs'
    };
  }

  // 5. ETF
  if (/\b(spot etf|etf approval|etf filing|etf inflow|etf outflow|19b-4|s-1|blackrock etf|fidelity etf|grayscale etf|etf volume|etf application|bitcoin etf|ethereum etf|solana etf)\b/i.test(text)) {
    return {
      catalystType: 'ETF',
      confidence: 92,
      isRumor: false,
      isFake: false,
      notes: 'Spot/Futures ETF application, filing, approval, or flow metrics'
    };
  }

  // 6. HACK_EXPLOIT
  if (/\b(hack\b|hacked|exploit|drained|rug pull|stolen funds|vulnerability exploit|private key compromised|bridge exploit|security breach|reentrancy attack)\b/i.test(text)) {
    return {
      catalystType: 'HACK_EXPLOIT',
      confidence: 95,
      isRumor: false,
      isFake: false,
      notes: 'Security breach, protocol exploit, or drained funds'
    };
  }

  // 7. REGULATION
  if (/\b(sec\b|cftc\b|lawsuit|regulatory|subpoena|court ruling|settlement|legal action|compliance|sanctions|gensler|doj\b|banned|enforcement action|indictment)\b/i.test(text)) {
    return {
      catalystType: 'REGULATION',
      confidence: 85,
      isRumor: false,
      isFake: false,
      notes: 'Regulatory ruling, lawsuit, enforcement, or legal proceedings'
    };
  }

  // 8. TOKEN_UNLOCK
  if (/\b(token unlock|cliff unlock|vesting cliff|unlock event|circulating supply unlock|tokens unlocked|vesting release|scheduled unlock)\b/i.test(text)) {
    return {
      catalystType: 'TOKEN_UNLOCK',
      confidence: 85,
      isRumor: false,
      isFake: false,
      notes: 'Token supply vesting cliff or circulating unlock event'
    };
  }

  // 9. PARTNERSHIP
  if (/\b(partnership|partnered|collaboration|teamed up|strategic alliance|joined forces|corporate partner|integrated with|strategic pact)\b/i.test(text)) {
    return {
      catalystType: 'PARTNERSHIP',
      confidence: 80,
      isRumor: false,
      isFake: false,
      notes: 'Strategic institutional or cross-ecosystem partnership'
    };
  }

  // 10. FUNDING_INVESTMENT
  if (/\b(seed round|series a|series b|raised \$|raised \$\d+|venture capital|valuation of|funding round|invested \$|backed by a16z|backed by paradigm|capital raise)\b/i.test(text)) {
    return {
      catalystType: 'FUNDING_INVESTMENT',
      confidence: 85,
      isRumor: false,
      isFake: false,
      notes: 'Venture funding, investment round, or strategic capital injection'
    };
  }

  // 11. MAINNET
  if (/\b(mainnet launch|mainnet live|mainnet release|mainnet migration|genesis block|live on mainnet|mainnet rollout|mainnet deployment)\b/i.test(text)) {
    return {
      catalystType: 'MAINNET',
      confidence: 88,
      isRumor: false,
      isFake: false,
      notes: 'Mainnet genesis or protocol launch'
    };
  }

  // 12. UPGRADE
  if (/\b(network upgrade|hard fork|hardfork|protocol upgrade|improvement proposal|eip-|bip-|v2 launch|v3 launch|dencun|pectra|cancun|shanghai upgrade|testnet upgrade)\b/i.test(text)) {
    return {
      catalystType: 'UPGRADE',
      confidence: 82,
      isRumor: false,
      isFake: false,
      notes: 'Core protocol upgrade or hard fork'
    };
  }

  // 13. AIRDROP
  if (/\b(airdrop|airdrop claim|snapshot date|community distribution|claim tokens|token airdrop|retroactive airdrop)\b/i.test(text)) {
    return {
      catalystType: 'AIRDROP',
      confidence: 80,
      isRumor: false,
      isFake: false,
      notes: 'Community token airdrop or snapshot distribution'
    };
  }

  // 14. BURN
  if (/\b(token burn|buyback and burn|burning|supply destruction|burned \d+|burn mechanism|coins burned|quarterly burn)\b/i.test(text)) {
    return {
      catalystType: 'BURN',
      confidence: 85,
      isRumor: false,
      isFake: false,
      notes: 'Token burn or permanent circulating supply destruction'
    };
  }

  // 15. WHALE_ONCHAIN
  if (/\b(whale alert|whale moved|whale transfer|dormant wallet|large exchange inflow|large exchange outflow|whale bought|whale accumulated|whale dump|massive onchain|on-chain flow)\b/i.test(text)) {
    return {
      catalystType: 'WHALE_ONCHAIN',
      confidence: 78,
      isRumor: false,
      isFake: false,
      notes: 'Significant on-chain movement or whale accumulation/distribution'
    };
  }

  // 16. MACRO
  if (/\b(cpi\b|fomc\b|interest rate|federal reserve|inflation\b|powell\b|rate cut|rate hike|treasury yields|non-farm payroll|macro liquidity|us gdp|central bank)\b/i.test(text)) {
    return {
      catalystType: 'MACRO',
      confidence: 85,
      isRumor: false,
      isFake: false,
      notes: 'Macroeconomic liquidity, inflation, or central bank policy decision'
    };
  }

  // 16.5 GEOPOLITICAL
  if (/\b(war\b|conflict|sanctions\b|geopolitical|tariff\b|trade war|embargo|military action|treaty)\b/i.test(text)) {
    return {
      catalystType: 'GEOPOLITICAL',
      confidence: 85,
      isRumor: false,
      isFake: false,
      notes: 'Geopolitical conflict, international sanctions, tariffs or global risk-off event'
    };
  }

  // 17. UNKNOWN fallback
  return {
    catalystType: 'UNKNOWN',
    confidence: 0,
    isRumor: false,
    isFake: false,
    notes: 'No specific catalyst classification matched'
  };
}

export function classifyNewsImpact(params: {
  catalystType: NewsCatalystType;
  sentiment: NewsSentiment;
  severity: number;
  sourceTier: NewsSourceTier;
  isVerified: boolean;
  isRumor: boolean;
  isFake: boolean;
  freshnessDecay: number;
  sourceCount: number;
}): {
  impactClassification: NewsImpactClassification;
  impactScore: number;
  catalystConfidence: number;
  isConfirmedCatalyst: boolean;
} {
  const {
    catalystType,
    sentiment,
    severity,
    sourceTier,
    isVerified,
    isRumor,
    isFake,
    freshnessDecay,
    sourceCount
  } = params;

  // Fake or misleading news: completely stripped of impact
  if (isFake) {
    return {
      impactClassification: 'NEUTRAL',
      impactScore: 0,
      catalystConfidence: 0,
      isConfirmedCatalyst: false
    };
  }

  // Rumors cannot be confirmed catalysts
  if (isRumor) {
    const rumorScore = Math.min(40, Math.round(severity * 0.45 * freshnessDecay));
    return {
      impactClassification: rumorScore >= 30 ? 'MEDIUM_LOW' : 'NEUTRAL',
      impactScore: rumorScore,
      catalystConfidence: 30,
      isConfirmedCatalyst: false
    };
  }

  if (catalystType === 'UNKNOWN') {
    return {
      impactClassification: 'UNKNOWN',
      impactScore: 0,
      catalystConfidence: 0,
      isConfirmedCatalyst: false
    };
  }

  // Verified / credible catalyst scoring
  let tierWeight = 1.0;
  if (sourceTier === 'TIER_1') tierWeight = 1.30;
  else if (sourceTier === 'TIER_2') tierWeight = 1.10;
  else if (sourceTier === 'TIER_3') tierWeight = 0.90;
  else tierWeight = 0.60;

  const multiSourceBoost = Math.min(1.25, 1.0 + Math.max(0, sourceCount - 1) * 0.05);
  const rawScore = severity * tierWeight * multiSourceBoost;
  const impactScore = Math.min(100, Math.max(10, Math.round(rawScore * freshnessDecay)));
  const catalystConfidence = Math.min(95, Math.round(severity * (isVerified ? 0.95 : 0.70)));

  // Determine Impact Classification
  let impactClassification: NewsImpactClassification = 'MEDIUM_LOW';

  if (sentiment === 'BULLISH') {
    if (
      ['EXCHANGE_LISTING', 'ETF', 'PARTNERSHIP', 'MAINNET', 'FUNDING_INVESTMENT', 'BURN', 'AIRDROP'].includes(catalystType) &&
      severity >= 60 &&
      freshnessDecay >= 0.70
    ) {
      impactClassification = 'PUMP_CATALYST';
    } else if (['MACRO', 'GEOPOLITICAL', 'UPGRADE', 'WHALE_ONCHAIN'].includes(catalystType) && impactScore >= 75) {
      impactClassification = 'HIGH_IMPACT';
    } else {
      impactClassification = 'MEDIUM_LOW';
    }
  } else if (sentiment === 'BEARISH') {
    if (
      ['HACK_EXPLOIT', 'DELISTING', 'REGULATION', 'TOKEN_UNLOCK', 'GEOPOLITICAL'].includes(catalystType) &&
      severity >= 60
    ) {
      impactClassification = 'DUMP_RISK';
    } else if (['MACRO', 'GEOPOLITICAL', 'WHALE_ONCHAIN'].includes(catalystType) && impactScore >= 75) {
      impactClassification = 'HIGH_IMPACT';
    } else {
      impactClassification = 'MEDIUM_LOW';
    }
  } else if (sentiment === 'MIXED') {
    impactClassification = impactScore >= 75 ? 'HIGH_IMPACT' : 'MEDIUM_LOW';
  } else if (sentiment === 'NEUTRAL') {
    impactClassification = 'NEUTRAL';
  }

  return {
    impactClassification,
    impactScore,
    catalystConfidence,
    isConfirmedCatalyst: true
  };
}

export function trackNewsReactionWindows(params: {
  publishedAt: number;
  currentPrice: number;
  candles: Candle[];
  timeframeCandles?: {
    '5m'?: Candle[];
    '15m'?: Candle[];
    '1h'?: Candle[];
    '4h'?: Candle[];
  };
  now?: number;
}): Record<NewsReactionWindowPeriod, ReactionWindowMetric> {
  const { publishedAt, currentPrice, candles } = params;
  const now = params.now || Date.now();

  const periods: NewsReactionWindowPeriod[] = ['5m', '15m', '30m', '1h', '4h'];
  const periodDurationMs: Record<NewsReactionWindowPeriod, number> = {
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000
  };

  const result: Record<NewsReactionWindowPeriod, ReactionWindowMetric> = {} as any;

  if (!candles || candles.length < 3 || publishedAt <= 0) {
    for (const p of periods) {
      result[p] = {
        window: p,
        priceChangePct: null,
        volumeRatio: null,
        status: 'UNAVAILABLE',
        barCount: 0
      };
    }
    return result;
  }

  const baselineSlice = candles.slice(Math.max(0, candles.length - 24));
  const baselineVol = baselineSlice.reduce((sum, c) => sum + c.volume, 0) / (baselineSlice.length || 1);

  // Find index of candle at or closest after publishedAt
  let startIdx = -1;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].timestamp >= publishedAt) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    startIdx = Math.max(0, candles.length - 3);
  }

  const startPrice = candles[startIdx].open || candles[startIdx].close;
  const elapsedMs = Math.max(0, now - publishedAt);

  for (const p of periods) {
    const durationMs = periodDurationMs[p];

    // Anti-fabrication check: if time hasn't elapsed, mark PENDING_TIME with null values
    if (elapsedMs < durationMs * 0.4) {
      result[p] = {
        window: p,
        priceChangePct: null,
        volumeRatio: null,
        status: 'PENDING_TIME',
        barCount: 0
      };
      continue;
    }

    // Collect candles in the [publishedAt, publishedAt + durationMs] slice
    const windowEndTs = publishedAt + durationMs;
    const windowCandles = candles.filter(c => c.timestamp >= publishedAt && c.timestamp <= windowEndTs);

    if (windowCandles.length === 0) {
      // Fallback to post-news candles available up to now
      const fallbackCandles = candles.slice(startIdx);
      if (fallbackCandles.length === 0) {
        result[p] = {
          window: p,
          priceChangePct: null,
          volumeRatio: null,
          status: 'UNAVAILABLE',
          barCount: 0
        };
        continue;
      }

      const endBar = fallbackCandles[fallbackCandles.length - 1];
      const endPrice = endBar.close;
      const priceChangePct = startPrice > 0 ? Number((((endPrice - startPrice) / startPrice) * 100).toFixed(2)) : 0;
      const avgVol = fallbackCandles.reduce((s, c) => s + c.volume, 0) / fallbackCandles.length;
      const volumeRatio = baselineVol > 0 ? Number((avgVol / baselineVol).toFixed(2)) : 1.0;

      let status: ReactionWindowStatus = 'NO_REACTION';
      if (priceChangePct >= 0.8 && volumeRatio >= 1.05) status = 'BULLISH_EXPANSION';
      else if (priceChangePct <= -0.8 && volumeRatio >= 1.05) status = 'BEARISH_DUMP';
      else if (Math.abs(priceChangePct) < 0.4) status = 'NO_REACTION';
      else status = priceChangePct > 0 ? 'BULLISH_EXPANSION' : 'BEARISH_DUMP';

      result[p] = {
        window: p,
        priceChangePct,
        volumeRatio,
        status,
        barCount: fallbackCandles.length
      };
      continue;
    }

    const endBar = windowCandles[windowCandles.length - 1];
    const endPrice = endBar.close;
    const priceChangePct = startPrice > 0 ? Number((((endPrice - startPrice) / startPrice) * 100).toFixed(2)) : 0;
    const windowAvgVol = windowCandles.reduce((s, c) => s + c.volume, 0) / windowCandles.length;
    const volumeRatio = baselineVol > 0 ? Number((windowAvgVol / baselineVol).toFixed(2)) : 1.0;

    const windowHigh = Math.max(...windowCandles.map(c => c.high));

    let status: ReactionWindowStatus = 'NO_REACTION';
    if (windowHigh >= startPrice * 1.012 && priceChangePct <= -0.2) {
      status = 'ABSORPTION_FADE';
    } else if (priceChangePct >= 0.8 && volumeRatio >= 1.05) {
      status = 'BULLISH_EXPANSION';
    } else if (priceChangePct <= -0.8 && volumeRatio >= 1.05) {
      status = 'BEARISH_DUMP';
    } else if (Math.abs(priceChangePct) < 0.4) {
      status = 'NO_REACTION';
    } else {
      status = priceChangePct > 0 ? 'BULLISH_EXPANSION' : 'BEARISH_DUMP';
    }

    result[p] = {
      window: p,
      priceChangePct,
      volumeRatio,
      status,
      barCount: windowCandles.length
    };
  }

  return result;
}

export function detectReactionConflict(params: {
  catalystType: NewsCatalystType;
  impactClassification: NewsImpactClassification;
  sentiment: NewsSentiment;
  priceChangePostNewsPct: number;
  rvolPostNews: number;
  isRumor: boolean;
  isFake: boolean;
}): {
  conflict: NewsReactionConflictType;
  warning?: string;
} {
  const {
    catalystType,
    impactClassification,
    sentiment,
    priceChangePostNewsPct,
    rvolPostNews,
    isRumor,
    isFake
  } = params;

  if (isFake) {
    return { conflict: 'NONE' };
  }

  if (isRumor) {
    return {
      conflict: 'RUMOR_FADE_RISK',
      warning: `Unverified rumor catalyst (${catalystType}): High risk of rumor fade or narrative rejection.`
    };
  }

  // Bullish news vs Bearish price dump (sell-the-news trap)
  if (
    (sentiment === 'BULLISH' || impactClassification === 'PUMP_CATALYST') &&
    priceChangePostNewsPct <= -1.0
  ) {
    return {
      conflict: 'BULLISH_NEWS_BEARISH_PRICE',
      warning: `Bullish catalyst CONTRADICTED by price: Dumped ${priceChangePostNewsPct}% post-headline. Institutional distribution / sell-the-news trap detected.`
    };
  }

  // Bearish news vs Bullish price rally (market absorption)
  if (
    (sentiment === 'BEARISH' || impactClassification === 'DUMP_RISK') &&
    priceChangePostNewsPct >= 1.0
  ) {
    return {
      conflict: 'BEARISH_NEWS_BULLISH_PRICE',
      warning: `Bearish catalyst CONTRADICTED by price: Rallied +${priceChangePostNewsPct}% despite negative headline. Smart money absorption detected.`
    };
  }

  // High impact headline with muted volume participation
  if (
    (impactClassification === 'PUMP_CATALYST' || impactClassification === 'HIGH_IMPACT') &&
    rvolPostNews < 0.85
  ) {
    return {
      conflict: 'HIGH_IMPACT_NO_VOLUME',
      warning: `Muted volume reaction: Catalyst failed to generate institutional expansion (${rvolPostNews}x RVOL).`
    };
  }

  return { conflict: 'NONE' };
}

export function evaluateNewsTechnicalAlignment(params: {
  decision: 'LONG' | 'SHORT' | 'WAIT';
  catalystType: NewsCatalystType;
  impactClassification: NewsImpactClassification;
  reactionConflict: NewsReactionConflictType;
  marketReactionState: MarketReactionState;
  isRumor: boolean;
  isFake: boolean;
}): {
  technicalAlignment: NewsTechnicalAlignment;
  explanation: string;
  confluenceNotes: string[];
  contradictionNotes: string[];
} {
  const {
    decision,
    catalystType,
    impactClassification,
    reactionConflict,
    marketReactionState,
    isRumor,
    isFake
  } = params;

  // RULE: News NEVER independently creates LONG or SHORT
  if (decision === 'WAIT') {
    return {
      technicalAlignment: 'NEUTRAL',
      explanation: 'News NEVER independently generates trading signals. Unified signal decision remains WAIT pending structural breakout & technical confirmation.',
      confluenceNotes: [],
      contradictionNotes: []
    };
  }

  if (decision === 'LONG') {
    if (reactionConflict === 'BULLISH_NEWS_BEARISH_PRICE') {
      return {
        technicalAlignment: 'CONTRADICTS_SETUP',
        explanation: 'Bullish news met with aggressive selling: Sell-the-news distribution opposes LONG setup.',
        confluenceNotes: [],
        contradictionNotes: ['Sell-the-news price rejection opposes technical LONG entry']
      };
    }

    if (impactClassification === 'DUMP_RISK') {
      return {
        technicalAlignment: 'CONTRADICTS_SETUP',
        explanation: `High-impact dump risk catalyst (${catalystType}) directly opposes LONG direction.`,
        confluenceNotes: [],
        contradictionNotes: [`Negative catalyst (${catalystType}) poses severe dump risk to LONG setup`]
      };
    }

    if (isRumor) {
      return {
        technicalAlignment: 'WEAKENS_SETUP',
        explanation: 'Catalyst is an unverified rumor: Weakens trade conviction due to fakeout risk.',
        confluenceNotes: [],
        contradictionNotes: ['Unconfirmed rumor catalyst cannot support institutional LONG confirmation']
      };
    }

    if (isFake) {
      return {
        technicalAlignment: 'WEAKENS_SETUP',
        explanation: 'Catalyst flagged as fake or disputed: Withheld from setup confirmation.',
        confluenceNotes: [],
        contradictionNotes: ['Disputed or fake report rejected from trade setup']
      };
    }

    if (impactClassification === 'PUMP_CATALYST' && marketReactionState !== 'REJECTED') {
      return {
        technicalAlignment: 'SUPPORTS_LONG',
        explanation: `Verified pump catalyst (${catalystType}) provides strong fundamental demand confluence to technical LONG setup.`,
        confluenceNotes: [`Bullish catalyst (${catalystType}) supports technical LONG continuation`],
        contradictionNotes: []
      };
    }

    return {
      technicalAlignment: 'NEUTRAL',
      explanation: 'News catalyst has neutral or minor alignment with technical setup.',
      confluenceNotes: [],
      contradictionNotes: []
    };
  }

  if (decision === 'SHORT') {
    if (reactionConflict === 'BEARISH_NEWS_BULLISH_PRICE') {
      return {
        technicalAlignment: 'CONTRADICTS_SETUP',
        explanation: 'Bearish news absorbed by aggressive buying: Smart money rally opposes SHORT setup.',
        confluenceNotes: [],
        contradictionNotes: ['Market absorption opposes technical SHORT entry']
      };
    }

    if (impactClassification === 'PUMP_CATALYST') {
      return {
        technicalAlignment: 'CONTRADICTS_SETUP',
        explanation: `Bullish pump catalyst (${catalystType}) directly opposes SHORT direction.`,
        confluenceNotes: [],
        contradictionNotes: [`Bullish catalyst (${catalystType}) opposes SHORT setup`]
      };
    }

    if (impactClassification === 'DUMP_RISK' && marketReactionState !== 'REJECTED') {
      return {
        technicalAlignment: 'SUPPORTS_SHORT',
        explanation: `Verified dump risk catalyst (${catalystType}) accelerates downward momentum for technical SHORT setup.`,
        confluenceNotes: [`Bearish catalyst (${catalystType}) supports technical SHORT breakdown`],
        contradictionNotes: []
      };
    }

    return {
      technicalAlignment: 'NEUTRAL',
      explanation: 'News catalyst has neutral alignment with technical setup.',
      confluenceNotes: [],
      contradictionNotes: []
    };
  }

  return {
    technicalAlignment: 'NEUTRAL',
    explanation: 'No directional bias for current decision.',
    confluenceNotes: [],
    contradictionNotes: []
  };
}

export function evaluateNewsMarketImpact(params: {
  symbol: string;
  newsList?: (RawNewsArticle | ProcessedNews)[];
  candles?: Candle[];
  currentPrice?: number;
  decision?: 'LONG' | 'SHORT' | 'WAIT';
  timeframeCandles?: {
    '5m'?: Candle[];
    '15m'?: Candle[];
    '1h'?: Candle[];
    '4h'?: Candle[];
  };
  now?: number;
}): NewsMarketImpactReport {
  const { symbol, newsList, candles } = params;
  const cleanSym = (symbol || '').toUpperCase().replace(/USDT$|USD$|BUSD$|USDC$/, '').trim();
  const decision = params.decision || 'WAIT';
  const now = params.now || Date.now();

  const emptyReactionWindows: Record<NewsReactionWindowPeriod, ReactionWindowMetric> = {
    '5m': { window: '5m', priceChangePct: null, volumeRatio: null, status: 'UNAVAILABLE', barCount: 0 },
    '15m': { window: '15m', priceChangePct: null, volumeRatio: null, status: 'UNAVAILABLE', barCount: 0 },
    '30m': { window: '30m', priceChangePct: null, volumeRatio: null, status: 'UNAVAILABLE', barCount: 0 },
    '1h': { window: '1h', priceChangePct: null, volumeRatio: null, status: 'UNAVAILABLE', barCount: 0 },
    '4h': { window: '4h', priceChangePct: null, volumeRatio: null, status: 'UNAVAILABLE', barCount: 0 }
  };

  // If no news provided, return UNAVAILABLE deterministic report (NO fabricated data)
  if (!newsList || newsList.length === 0) {
    return {
      status: 'UNAVAILABLE',
      symbol: cleanSym,
      catalystType: 'UNKNOWN',
      impactClassification: 'UNKNOWN',
      impactScore: 0,
      catalystConfidence: 0,
      sourceCredibilityTier: 'UNKNOWN',
      sourceCredibilityScore: 0,
      verificationStatus: 'UNKNOWN',
      isRumorOrUnverified: false,
      isFakeOrMisleading: false,
      isConfirmedCatalyst: false,
      matchedCoins: [],
      mappingConfidence: 'UNKNOWN',
      headline: `No active news catalyst found for ${cleanSym}`,
      summary: 'No verified fundamental news or market catalyst detected in current monitoring window.',
      source: 'UNKNOWN',
      supportingSources: [],
      sourceCount: 0,
      freshness: 'HISTORICAL',
      reactionWindows: emptyReactionWindows,
      marketReactionState: 'UNKNOWN',
      reactionConflict: 'NONE',
      technicalAlignment: 'NEUTRAL',
      alignmentExplanation: 'Technical setup operates independently without news confluence.',
      confluenceNotes: [],
      contradictionNotes: [],
      isFabricated: false
    };
  }

  // Deduplicate and process raw articles
  const deduplicated = deduplicateAndMergeNews(newsList);

  // Filter for matching articles
  const matchingArticles = deduplicated.filter(item => {
    if (item.primaryCoin === cleanSym) return true;
    if (item.relatedCoins && item.relatedCoins.includes(cleanSym)) return true;
    // General macro, geopolitical or ETF news affects BTC and ETH
    if ((cleanSym === 'BTC' || cleanSym === 'ETH') && (item.eventType === 'MACRO' || item.eventType === 'ETF' || item.eventType === 'GEOPOLITICAL' || item.catalystType === 'GEOPOLITICAL')) return true;
    return false;
  });

  if (matchingArticles.length === 0) {
    return {
      status: 'UNAVAILABLE',
      symbol: cleanSym,
      catalystType: 'UNKNOWN',
      impactClassification: 'UNKNOWN',
      impactScore: 0,
      catalystConfidence: 0,
      sourceCredibilityTier: 'UNKNOWN',
      sourceCredibilityScore: 0,
      verificationStatus: 'UNKNOWN',
      isRumorOrUnverified: false,
      isFakeOrMisleading: false,
      isConfirmedCatalyst: false,
      matchedCoins: [],
      mappingConfidence: 'UNKNOWN',
      headline: `No coin-specific news catalyst for ${cleanSym}`,
      summary: 'Monitored universe contains news, but none specifically mapped to this asset.',
      source: 'UNKNOWN',
      supportingSources: [],
      sourceCount: 0,
      freshness: 'HISTORICAL',
      reactionWindows: emptyReactionWindows,
      marketReactionState: 'UNKNOWN',
      reactionConflict: 'NONE',
      technicalAlignment: 'NEUTRAL',
      alignmentExplanation: 'Technical setup operates independently without coin-specific news confluence.',
      confluenceNotes: [],
      contradictionNotes: [],
      isFabricated: false
    };
  }

  // Primary catalyst is the highest impact matching article
  const topArticle = matchingArticles[0];

  const catalystClass = classifyCatalystType(topArticle.title, topArticle.summary, topArticle.source);
  const credibility = classifySourceCredibilityTier(topArticle.source, topArticle.url);
  const freshness = calculateNewsFreshness(topArticle.publishedAt, now);

  const eventClass = classifyNewsEvent(topArticle.title, topArticle.summary);
  const impact = classifyNewsImpact({
    catalystType: catalystClass.catalystType,
    sentiment: topArticle.sentiment || eventClass.sentiment,
    severity: eventClass.severity,
    sourceTier: topArticle.sourceTier,
    isVerified: credibility.verificationStatus === 'VERIFIED',
    isRumor: catalystClass.isRumor || credibility.isRumor,
    isFake: catalystClass.isFake || credibility.isFake,
    freshnessDecay: freshness.decayMultiplier,
    sourceCount: topArticle.sourceCount || 1
  });

  // Track reaction windows
  const reactionWindows = candles && candles.length > 0
    ? trackNewsReactionWindows({
        publishedAt: topArticle.publishedAt,
        currentPrice: params.currentPrice || (candles[candles.length - 1]?.close ?? 0),
        candles,
        timeframeCandles: params.timeframeCandles,
        now
      })
    : emptyReactionWindows;

  // Correlate market reaction
  const reactionAnalysis = candles && candles.length > 0
    ? correlateNewsWithMarketReaction({
        news: topArticle,
        candles,
        currentPrice: params.currentPrice
      })
    : {
        state: 'UNKNOWN' as MarketReactionState,
        priceChangePostNewsPct: 0,
        rvolPostNews: 1.0,
        confidence: 'UNKNOWN' as any,
        details: 'No candles available for market reaction correlation',
        isContradicted: false
      };

  // Detect reaction conflict
  const conflictResult = detectReactionConflict({
    catalystType: catalystClass.catalystType,
    impactClassification: impact.impactClassification,
    sentiment: topArticle.sentiment || eventClass.sentiment,
    priceChangePostNewsPct: reactionAnalysis.priceChangePostNewsPct,
    rvolPostNews: reactionAnalysis.rvolPostNews,
    isRumor: catalystClass.isRumor || credibility.isRumor,
    isFake: catalystClass.isFake || credibility.isFake
  });

  // Evaluate technical alignment (with strict invariant: News NEVER independently creates LONG/SHORT)
  const alignmentResult = evaluateNewsTechnicalAlignment({
    decision,
    catalystType: catalystClass.catalystType,
    impactClassification: impact.impactClassification,
    reactionConflict: conflictResult.conflict,
    marketReactionState: reactionAnalysis.state,
    isRumor: catalystClass.isRumor || credibility.isRumor,
    isFake: catalystClass.isFake || credibility.isFake
  });

  return {
    status: 'AVAILABLE',
    symbol: cleanSym,
    catalystType: catalystClass.catalystType,
    impactClassification: impact.impactClassification,
    impactScore: impact.impactScore,
    catalystConfidence: impact.catalystConfidence,
    sourceCredibilityTier: credibility.credibilityTier,
    sourceCredibilityScore: credibility.credibilityScore,
    verificationStatus: credibility.verificationStatus,
    isRumorOrUnverified: catalystClass.isRumor || credibility.isRumor,
    isFakeOrMisleading: catalystClass.isFake || credibility.isFake,
    isConfirmedCatalyst: impact.isConfirmedCatalyst,
    primaryCoin: topArticle.primaryCoin,
    matchedCoins: topArticle.relatedCoins || [],
    mappingConfidence: topArticle.mappingConfidence || 'HIGH',
    headline: topArticle.title,
    summary: topArticle.summary || topArticle.title,
    source: topArticle.source,
    supportingSources: topArticle.supportingSources || [topArticle.source],
    sourceCount: topArticle.sourceCount || 1,
    publishedAt: topArticle.publishedAt,
    detectedAt: topArticle.detectedAt,
    ageMinutes: freshness.ageMinutes,
    freshness: freshness.freshness,
    reactionWindows,
    marketReactionState: reactionAnalysis.state,
    reactionConflict: conflictResult.conflict,
    conflictWarning: conflictResult.warning,
    technicalAlignment: alignmentResult.technicalAlignment,
    alignmentExplanation: alignmentResult.explanation,
    confluenceNotes: alignmentResult.confluenceNotes,
    contradictionNotes: alignmentResult.contradictionNotes,
    isFabricated: false
  };
}

// ============================================================================
// 6. NEWS DEDUPLICATION & CLUSTERING ENGINE
// ============================================================================

export function generateDeterministicNewsId(title: string, publishedAt: number, primaryCoin?: string): string {
  // Simple deterministic hash
  let hash = 0;
  const str = `${title.toLowerCase().trim()}_${publishedAt}_${primaryCoin || 'GENERAL'}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `news_${Math.abs(hash).toString(16)}`;
}

function normalizeTitleForSimilarity(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateJaccardSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.split(' '));
  const set2 = new Set(str2.split(' '));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

export function deduplicateAndMergeNews(articles: (RawNewsArticle | ProcessedNews)[]): ProcessedNews[] {
  if (!articles || articles.length === 0) return [];

  const canonicalList: ProcessedNews[] = [];

  for (const raw of articles) {
    const normTitle = normalizeTitleForSimilarity(raw.title);
    const publishedAt = raw.publishedAt || Date.now();

    // Map coins
    const coinMapping = mapNewsToCoins(`${raw.title} ${raw.summary || ''}`, (raw as any).tags);
    const sourceClass = classifySourceQuality(raw.source, raw.url);
    const eventClass = classifyNewsEvent(raw.title, raw.summary || '');
    const freshness = calculateNewsFreshness(publishedAt);
    const credClass = classifySourceCredibilityTier(raw.source, raw.url);
    const catalystClass = classifyCatalystType(raw.title, raw.summary || '', raw.source);
    const impactClass = classifyNewsImpact({
      catalystType: catalystClass.catalystType,
      sentiment: eventClass.sentiment,
      severity: eventClass.severity,
      sourceTier: sourceClass.tier,
      isVerified: credClass.verificationStatus === 'VERIFIED',
      isRumor: catalystClass.isRumor || credClass.isRumor,
      isFake: catalystClass.isFake || credClass.isFake,
      freshnessDecay: freshness.decayMultiplier,
      sourceCount: 1
    });
    const impact = calculateNewsImpactScore({
      eventType: eventClass.eventType,
      sentiment: eventClass.sentiment,
      sourceTier: sourceClass.tier,
      isVerified: sourceClass.isVerified,
      sourceCount: 1,
      isDirectTarget: coinMapping.confidence === 'HIGH',
      freshnessDecay: freshness.decayMultiplier,
      severity: eventClass.severity
    });

    const candidate: ProcessedNews = {
      id: raw.id || generateDeterministicNewsId(raw.title, publishedAt, coinMapping.primaryCoin),
      title: raw.title,
      source: raw.source,
      sources: [raw.source],
      supportingSources: [raw.source],
      sourceCount: 1,
      sourceTier: sourceClass.tier,
      isVerified: sourceClass.isVerified,
      url: raw.url || '',
      publishedAt,
      detectedAt: Date.now(),
      ageMinutes: freshness.ageMinutes,
      freshness: freshness.freshness,
      isActive: freshness.isActive,
      sentiment: eventClass.sentiment,
      eventType: eventClass.eventType,
      impactScore: impact.score,
      impactLevel: impact.level,
      relatedCoins: coinMapping.matchedCoins,
      primaryCoin: coinMapping.primaryCoin,
      mappingConfidence: coinMapping.confidence,
      summary: raw.summary || '',
      tradeWindowHours: 4,
      tags: (raw as any).tags || [],

      // Phase 13 News Intelligence 2.0 fields
      catalystType: catalystClass.catalystType,
      impactClassification: impactClass.impactClassification,
      sourceCredibilityTier: credClass.credibilityTier,
      sourceCredibilityScore: credClass.credibilityScore,
      verificationStatus: credClass.verificationStatus,
      isRumorOrUnverified: catalystClass.isRumor || credClass.isRumor,
      isFakeOrMisleading: catalystClass.isFake || credClass.isFake,
      isConfirmedCatalyst: impactClass.isConfirmedCatalyst
    };

    // Check against existing canonical articles for duplicate story
    let merged = false;
    for (let i = 0; i < canonicalList.length; i++) {
      const existing = canonicalList[i];
      const existingNormTitle = normalizeTitleForSimilarity(existing.title);
      const similarity = calculateJaccardSimilarity(normTitle, existingNormTitle);
      const timeDiffHours = Math.abs(publishedAt - existing.publishedAt) / (3600 * 1000);

      // Duplicate match criteria: high similarity and within 48 hours
      if (similarity >= 0.45 && timeDiffHours <= 48) {
        // Merge into existing canonical record
        const mergedSources = Array.from(new Set([...(existing.supportingSources || existing.sources || [existing.source]), raw.source]));
        const mergedCoins = Array.from(new Set([...existing.relatedCoins, ...candidate.relatedCoins]));

        // Recompute impact with boosted source count
        const bestTier: NewsSourceTier = (existing.sourceTier === 'TIER_1' || candidate.sourceTier === 'TIER_1')
          ? 'TIER_1'
          : (existing.sourceTier === 'TIER_2' || candidate.sourceTier === 'TIER_2')
          ? 'TIER_2'
          : existing.sourceTier;

        const updatedImpact = calculateNewsImpactScore({
          eventType: existing.eventType || 'OTHER',
          sentiment: existing.sentiment,
          sourceTier: bestTier,
          isVerified: existing.isVerified || candidate.isVerified || false,
          sourceCount: mergedSources.length,
          isDirectTarget: existing.mappingConfidence === 'HIGH',
          freshnessDecay: freshness.decayMultiplier,
          severity: eventClass.severity
        });

        canonicalList[i] = {
          ...existing,
          sources: mergedSources,
          supportingSources: mergedSources,
          sourceCount: mergedSources.length,
          sourceTier: bestTier,
          isVerified: existing.isVerified || candidate.isVerified,
          relatedCoins: mergedCoins,
          impactScore: updatedImpact.score,
          impactLevel: updatedImpact.level
        };
        merged = true;
        break;
      }
    }

    if (!merged) {
      canonicalList.push(candidate);
    }
  }

  // Sort by impact score descending, then recency
  return canonicalList.sort((a, b) => b.impactScore - a.impactScore || b.publishedAt - a.publishedAt);
}

// ============================================================================
// 7. NEWS → MARKET REACTION CORRELATION ENGINE
// ============================================================================

export function correlateNewsWithMarketReaction(params: {
  news: ProcessedNews;
  candles: Candle[];
  currentPrice?: number;
}): MarketReactionAnalysis {
  const { news, candles } = params;

  if (!candles || candles.length < 5) {
    return {
      state: 'UNKNOWN',
      priceChangePostNewsPct: 0,
      rvolPostNews: 1.0,
      confidence: 'UNKNOWN',
      details: 'Insufficient candle data to correlate market reaction',
      isContradicted: false
    };
  }

  const currentPrice = params.currentPrice !== undefined ? params.currentPrice : candles[candles.length - 1].close;
  const len = candles.length;
  const recentSlice = candles.slice(Math.max(0, len - 24)); // Last 24 bars
  const baselineVol = recentSlice.reduce((sum, c) => sum + c.volume, 0) / recentSlice.length;

  // Find candle closest to news publishedAt
  let newsIdx = -1;
  for (let i = 0; i < len; i++) {
    if (candles[i].timestamp >= news.publishedAt) {
      newsIdx = i;
      break;
    }
  }

  if (newsIdx === -1) {
    // News happened recently or after latest candle
    newsIdx = Math.max(0, len - 3);
  }

  const newsCandle = candles[newsIdx];
  const postNewsCandles = candles.slice(newsIdx);
  const priceAtNews = newsCandle.open;
  const priceChangePostNewsPct = priceAtNews > 0
    ? Number((((currentPrice - priceAtNews) / priceAtNews) * 100).toFixed(2))
    : 0;

  const postNewsVol = postNewsCandles.reduce((sum, c) => sum + c.volume, 0) / (postNewsCandles.length || 1);
  const rvolPostNews = baselineVol > 0 ? Number((postNewsVol / baselineVol).toFixed(2)) : 1.0;

  let state: MarketReactionState = 'UNKNOWN';
  let isContradicted = false;
  let fadeOpportunity = false;
  let contradictionWarning: string | undefined = undefined;
  let details = '';

  if (news.sentiment === 'BULLISH') {
    if (priceChangePostNewsPct >= 1.2 && rvolPostNews >= 1.1) {
      state = 'CONFIRMED';
      details = `Bullish catalyst confirmed by market: price +${priceChangePostNewsPct}% on elevated RVOL (${rvolPostNews}x)`;
    } else if (priceChangePostNewsPct >= 0.4) {
      state = 'PARTIALLY_CONFIRMED';
      details = `Bullish catalyst partially confirmed: price +${priceChangePostNewsPct}% with moderate volume`;
    } else if (priceChangePostNewsPct <= -1.0) {
      state = 'REJECTED';
      isContradicted = true;
      fadeOpportunity = true;
      contradictionWarning = `Bullish catalyst CONTRADICTED by market: price down ${priceChangePostNewsPct}% on heavy selling pressure`;
      details = contradictionWarning;
    } else {
      state = 'NOT_YET_REACTED';
      details = 'Market in consolidation: price has not yet reacted significantly to catalyst';
    }
  } else if (news.sentiment === 'BEARISH') {
    if (priceChangePostNewsPct <= -1.2 && rvolPostNews >= 1.1) {
      state = 'CONFIRMED';
      details = `Bearish catalyst confirmed by market: price ${priceChangePostNewsPct}% on heavy RVOL (${rvolPostNews}x)`;
    } else if (priceChangePostNewsPct <= -0.4) {
      state = 'PARTIALLY_CONFIRMED';
      details = `Bearish catalyst partially confirmed: price ${priceChangePostNewsPct}%`;
    } else if (priceChangePostNewsPct >= 1.0) {
      state = 'REJECTED';
      isContradicted = true;
      fadeOpportunity = true;
      contradictionWarning = `Bearish catalyst CONTRADICTED by market: price rallied +${priceChangePostNewsPct}% despite negative news`;
      details = contradictionWarning;
    } else {
      state = 'NOT_YET_REACTED';
      details = 'Market has not yet reacted to bearish news';
    }
  } else {
    state = 'NOT_YET_REACTED';
    details = 'Neutral news: price moving within normal bounds';
  }

  const confidence: 'HIGH' | 'MEDIUM' | 'LOW' = rvolPostNews > 1.5 ? 'HIGH' : (rvolPostNews > 1.0 ? 'MEDIUM' : 'LOW');

  return {
    state,
    priceChangePostNewsPct,
    rvolPostNews,
    volumeSurgePostNews: rvolPostNews >= 1.4,
    reactionDelayBars: Math.max(0, len - 1 - newsIdx),
    isContradicted,
    fadeOpportunity,
    confidence,
    contradictionWarning,
    evidence: details ? [details] : [],
    details
  };
}

// ============================================================================
// 8. PRE-PUMP CATALYST INTELLIGENCE
// ============================================================================

export function evaluatePrePumpCatalyst(params: {
  news: ProcessedNews[];
  candles: Candle[];
  atr: number;
  rvol: number;
  marketRegime?: string;
}): PrePumpCatalystSetup {
  const { news, candles, atr, rvol } = params;

  if (!news || news.length === 0 || !candles || candles.length < 20) {
    return {
      isPrePumpCatalyst: false,
      setupType: 'NONE',
      catalystName: 'None',
      compressionScore: 0,
      volumeAcceleration: false,
      conviction: 'LOW',
      details: ['No high-impact catalyst detected']
    };
  }

  // Look for high impact bullish catalysts
  const highImpactCatalysts = news.filter(
    n => n.sentiment === 'BULLISH' &&
    (n.impactLevel === 'VERY_HIGH' || n.impactLevel === 'HIGH') &&
    (n.freshness === 'BREAKING' || n.freshness === 'FRESH')
  );

  if (highImpactCatalysts.length === 0) {
    return {
      isPrePumpCatalyst: false,
      setupType: 'NONE',
      catalystName: 'None',
      compressionScore: 0,
      volumeAcceleration: false,
      conviction: 'LOW',
      details: ['No breaking high-impact bullish catalyst in play']
    };
  }

  const primaryCatalyst = highImpactCatalysts[0];
  const recentCandles = candles.slice(-10);
  const currentPrice = recentCandles[recentCandles.length - 1].close;

  // Check Volatility Compression (narrow range before expansion)
  const ranges = recentCandles.map(c => c.high - c.low);
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const isCompressed = avgRange <= atr * 0.85;
  const compressionScore = isCompressed ? 85 : 45;

  // Check volume acceleration
  const volumeAcceleration = rvol >= 1.15 && rvol <= 2.2; // Early uptick without climax exhaustion

  const details: string[] = [
    `High-conviction catalyst: ${primaryCatalyst.title} (${primaryCatalyst.eventType})`,
    isCompressed ? 'Price in tight volatility compression base' : 'Normal volatility range',
    volumeAcceleration ? `Volume expanding early (RVOL ${rvol}x)` : 'Volume baseline normal'
  ];

  const isPrePumpCatalyst = isCompressed && volumeAcceleration && primaryCatalyst.impactScore >= 65;
  const readinessScore = Math.round((compressionScore + (volumeAcceleration ? 85 : 40) + primaryCatalyst.impactScore) / 3);
  const conviction: 'HIGH' | 'MEDIUM' | 'LOW' = (isPrePumpCatalyst && primaryCatalyst.impactScore >= 80) ? 'HIGH' : (isPrePumpCatalyst ? 'MEDIUM' : 'LOW');

  return {
    isPrePumpCatalyst,
    setupType: isPrePumpCatalyst ? 'COMPRESSION_BREAKOUT_CATALYST' : 'NONE',
    catalystName: primaryCatalyst.title,
    compressionScore,
    volumeAcceleration,
    readinessScore,
    conviction,
    details
  };
}

// ============================================================================
// 9. POST-PUMP EXHAUSTION & DUMP RISK INTELLIGENCE
// ============================================================================

export function evaluatePostPumpExhaustion(params: {
  candles: Candle[];
  news?: ProcessedNews[];
  rsi: number;
  rvol: number;
  atr: number;
  ema20: number;
  ema50: number;
}): ExhaustionDumpRisk {
  const { candles, news, rsi, rvol, atr, ema20, ema50 } = params;

  if (!candles || candles.length < 20) {
    return {
      pumpExhaustionDetected: false,
      dumpRiskDetected: false,
      status: 'NONE',
      abnormalMovePercent: 0,
      distanceFromEma20Pct: 0,
      rsiClimax: false,
      isClimaxVolume: false,
      exhaustionScore: 0,
      details: ['Insufficient candle history']
    };
  }

  const currentPrice = candles[candles.length - 1].close;
  const lowestRecent = Math.min(...candles.slice(-20).map(c => c.low));
  const abnormalMovePercent = lowestRecent > 0
    ? Number((((currentPrice - lowestRecent) / lowestRecent) * 100).toFixed(1))
    : 0;

  const distanceFromEma20Pct = ema20 > 0
    ? Number((((currentPrice - ema20) / ema20) * 100).toFixed(2))
    : 0;

  const rsiClimax = rsi >= 78;
  const isSevereExtension = distanceFromEma20Pct >= 8.0 || (ema50 > 0 && ((currentPrice - ema50) / ema50) * 100 >= 16.0);
  const volumeClimax = rvol >= 2.5;

  // Upper shadow rejection check
  const lastBar = candles[candles.length - 1];
  const barRange = lastBar.high - lastBar.low;
  const upperShadow = lastBar.high - Math.max(lastBar.open, lastBar.close);
  const hasUpperRejection = barRange > 0 && (upperShadow / barRange) >= 0.45;

  const details: string[] = [];

  let pumpExhaustionDetected = false;
  let dumpRiskDetected = false;
  let status: 'PUMP_EXHAUSTION' | 'DUMP_RISK' | 'HEALTHY_TREND' | 'NONE' = 'NONE';

  if (abnormalMovePercent >= 30 || isSevereExtension) {
    if (rsiClimax || (volumeClimax && hasUpperRejection)) {
      pumpExhaustionDetected = true;
      details.push(`Post-pump exhaustion detected: +${abnormalMovePercent}% move with extreme RSI (${rsi}) and upper wick rejection`);
    }
  }

  // Dump risk if negative news hits extended top or severe distribution
  const recentBearishNews = news?.find(n => n.sentiment === 'BEARISH' && n.impactScore >= 70 && (n.freshness === 'BREAKING' || n.freshness === 'FRESH'));
  if (recentBearishNews && isSevereExtension) {
    dumpRiskDetected = true;
    status = 'DUMP_RISK';
    details.push(`High dump risk: Negative catalyst (${recentBearishNews.title}) hitting over-extended top (+${distanceFromEma20Pct}% from EMA20)`);
  } else if (pumpExhaustionDetected) {
    status = 'PUMP_EXHAUSTION';
    if (rsi >= 85) dumpRiskDetected = true;
  } else {
    status = abnormalMovePercent > 10 ? 'HEALTHY_TREND' : 'NONE';
  }

  const exhaustionScore = Math.min(
    100,
    Math.round((abnormalMovePercent * 1.2) + (rsi > 70 ? (rsi - 70) * 2.5 : 0) + (volumeClimax ? 25 : 0))
  );

  return {
    pumpExhaustionDetected,
    dumpRiskDetected,
    status,
    abnormalMovePercent,
    distanceFromEma20Pct,
    rsiClimax,
    isClimaxVolume: volumeClimax,
    exhaustionScore,
    details
  };
}

// ============================================================================
// 10. NEW LISTING & LAUNCH INTELLIGENCE
// ============================================================================

export function evaluateNewListing(params: {
  news: ProcessedNews;
  candles?: Candle[];
}): NewListingInfo {
  const { news, candles } = params;
  const text = `${news.title} ${news.summary}`.toLowerCase();

  // Exchange detection
  let exchange = 'Binance';
  if (text.includes('mexc')) exchange = 'MEXC';
  else if (text.includes('okx')) exchange = 'OKX';
  else if (text.includes('bybit')) exchange = 'Bybit';
  else if (text.includes('coinbase')) exchange = 'Coinbase';
  else if (text.includes('kraken')) exchange = 'Kraken';

  const tradingPair = `${news.primaryCoin || 'TOKEN'}/USDT`;
  const listingTime = news.publishedAt + 2 * 3600 * 1000; // estimated listing window
  const now = Date.now();

  let launchStatus: ListingStatus = 'PRE_LISTING';
  if (now > listingTime + 24 * 3600 * 1000) launchStatus = 'POST_LISTING';
  else if (now >= listingTime) launchStatus = 'LISTING_LIVE';
  else launchStatus = 'PRE_LISTING';

  // Pre-listing radar
  let assessment: ListingRadarAssessment = 'BULLISH_POTENTIAL';
  const radarDetails: string[] = [`Announced on Tier 1 Exchange: ${exchange}`];

  if (text.includes('airdrop') && text.includes('unlock')) {
    assessment = 'BEARISH_RISK';
    radarDetails.push('High circulating supply airdrop unlock risk at launch');
  } else if (text.includes('launchpool') || text.includes('launchpad')) {
    assessment = 'BULLISH_POTENTIAL';
    radarDetails.push('Supported by official exchange launchpool staking mechanism');
  } else {
    assessment = 'MIXED';
    radarDetails.push('Standard spot listing without disclosed initial supply locks');
  }

  // Post-listing live analysis if candles exist
  let postListingClassification: PostListingClassification = 'WAIT_FOR_CONFIRMATION';
  const postDetails: string[] = [];

  if (candles && candles.length >= 10) {
    const firstBar = candles[0];
    const latestBar = candles[candles.length - 1];
    const discoveryReturn = firstBar.open > 0 ? ((latestBar.close - firstBar.open) / firstBar.open) * 100 : 0;

    if (discoveryReturn > 50 && latestBar.close > latestBar.open) {
      postListingClassification = 'EARLY_LONG_OPPORTUNITY';
      postDetails.push(`Strong price discovery (+${discoveryReturn.toFixed(1)}%) with buyer absorption`);
    } else if (discoveryReturn < -20) {
      postListingClassification = 'DUMP_RISK';
      postDetails.push(`Initial launch dumping pressure (${discoveryReturn.toFixed(1)}% from open)`);
    } else {
      postListingClassification = 'WAIT_FOR_PULLBACK';
      postDetails.push('High initial launch volatility: waiting for structural pullback base');
    }
  } else {
    postListingClassification = 'WAIT_FOR_CONFIRMATION';
    postDetails.push('Awaiting initial price discovery candles');
  }

  return {
    exchange,
    tradingPair,
    listingTime,
    launchStatus,
    launchpadInfo: text.includes('launchpool') ? `${exchange} Launchpool` : undefined,
    circulatingSupplyPct: text.includes('10%') ? 10 : 20,
    unlockRisk: text.includes('heavy unlock') ? 'HIGH' : 'MEDIUM',
    preListingRadar: {
      assessment,
      details: radarDetails
    },
    postListingAnalysis: {
      classification: postListingClassification,
      details: postDetails
    }
  };
}

// ============================================================================
// 11. COMPLETE PIPELINE WRAPPER
// ============================================================================

export async function getProcessedNewsIntelligence(): Promise<ProcessedNews[]> {
  try {
    const raw = await fetchCryptoNews();
    return deduplicateAndMergeNews(raw);
  } catch (err) {
    console.warn('[News Intelligence] Failed to fetch or process news:', err);
    return [];
  }
}
