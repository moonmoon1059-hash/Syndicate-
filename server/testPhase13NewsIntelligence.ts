import {
  classifyCatalystType,
  classifySourceCredibilityTier,
  classifyNewsImpact,
  trackNewsReactionWindows,
  detectReactionConflict,
  evaluateNewsTechnicalAlignment,
  evaluateNewsMarketImpact,
  deduplicateAndMergeNews
} from './newsIntelligenceEngine';
import {
  Candle,
  NewsCatalystType,
  NewsImpactClassification,
  SourceCredibilityTier,
  NewsReactionConflictType,
  NewsTechnicalAlignment,
  Signal
} from '../src/types/crypto';
import { upsertSignals, getAllStoredSignals, resetSignalStoreForTesting } from './signalTracker';

function generateCandles(count: number, basePrice: number = 100): Candle[] {
  const candles: Candle[] = [];
  const now = 1700000000000;
  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * 60000;
    const open = basePrice + Math.sin(i / 3) * 1.5;
    const close = open + (i % 2 === 0 ? 0.3 : -0.2);
    const high = Math.max(open, close) + 0.4;
    const low = Math.min(open, close) - 0.4;
    candles.push({
      timestamp: time,
      time,
      open,
      high,
      low,
      close,
      volume: 1000 + (i % 5) * 200
    });
  }
  return candles;
}

export async function runPhase13NewsIntelligenceTests(): Promise<{ passed: number; failed: number; total: number }> {
  console.log('================================================================');
  console.log('🧪 MOONSCANNER PHASE 13: NEWS INTELLIGENCE 2.0 TEST SUITE');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, details?: string) {
    if (condition) {
      passed++;
      console.log(`✅ ${name}${details ? ': ' + details : ''}`);
    } else {
      failed++;
      console.error(`❌ ${name} FAILED${details ? ': ' + details : ''}`);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Deterministic Catalyst Type Classification (17 Types)
  // --------------------------------------------------------------------------
  try {
    const listing = classifyCatalystType('Binance will list Optimism (OP) spot trading pair', '', 'Binance');
    assert('T1.1: EXCHANGE_LISTING classified accurately', listing.catalystType === 'EXCHANGE_LISTING' && !listing.isRumor && !listing.isFake);

    const delisting = classifyCatalystType('Coinbase to delist BarnBridge (BOND) trading pairs next week', '', 'Coinbase');
    assert('T1.2: DELISTING classified accurately', delisting.catalystType === 'DELISTING' && !delisting.isRumor);

    const etf = classifyCatalystType('SEC approves BlackRock spot Ethereum ETF 19b-4 filings', '', 'Bloomberg');
    assert('T1.3: ETF classified accurately', etf.catalystType === 'ETF');

    const hack = classifyCatalystType('DeFi Protocol hacked for $35M in reentrancy attack, funds drained', '', 'PeckShield');
    assert('T1.4: HACK_EXPLOIT classified accurately', hack.catalystType === 'HACK_EXPLOIT');

    const reg = classifyCatalystType('SEC issues Wells Notice to decentralized exchange in regulatory enforcement action', '', 'Reuters');
    assert('T1.5: REGULATION classified accurately', reg.catalystType === 'REGULATION');

    const unlock = classifyCatalystType('Arbitrum prepares for $1.2B scheduled token unlock event tomorrow', '', 'TokenUnlocks');
    assert('T1.6: TOKEN_UNLOCK classified accurately', unlock.catalystType === 'TOKEN_UNLOCK');

    const partnership = classifyCatalystType('Google Cloud announces strategic partnership with Polygon Labs for validator nodes', '', 'Google Cloud');
    assert('T1.7: PARTNERSHIP classified accurately', partnership.catalystType === 'PARTNERSHIP');

    const funding = classifyCatalystType('Monad Labs raised $225M in funding round led by Paradigm', '', 'TechCrunch');
    assert('T1.8: FUNDING_INVESTMENT classified accurately', funding.catalystType === 'FUNDING_INVESTMENT');

    const mainnet = classifyCatalystType('Berachain genesis block live on mainnet launch', '', 'Official Blog');
    assert('T1.9: MAINNET classified accurately', mainnet.catalystType === 'MAINNET');

    const upgrade = classifyCatalystType('Ethereum core developers schedule Dencun network upgrade hard fork', '', 'Ethereum Foundation');
    assert('T1.10: UPGRADE classified accurately', upgrade.catalystType === 'UPGRADE');

    const airdrop = classifyCatalystType('LayerZero Foundation confirms snapshot date for token airdrop claim', '', 'Official Twitter');
    assert('T1.11: AIRDROP classified accurately', airdrop.catalystType === 'AIRDROP');

    const burn = classifyCatalystType('BNB Foundation completes quarterly token burn of 1.9M coins burned', '', 'Binance');
    assert('T1.12: BURN classified accurately', burn.catalystType === 'BURN');

    const whale = classifyCatalystType('Whale Alert: Dormant wallet moved 10,000 BTC to Coinbase exchange', '', 'Whale Alert');
    assert('T1.13: WHALE_ONCHAIN classified accurately', whale.catalystType === 'WHALE_ONCHAIN');

    const macro = classifyCatalystType('US CPI inflation drops to 2.9%, Federal Reserve signals potential FOMC rate cut', '', 'Bloomberg');
    assert('T1.14: MACRO classified accurately', macro.catalystType === 'MACRO');

    const rumor = classifyCatalystType('Rumor: Insiders claim Apple preparing Bitcoin wallet integration', '', 'RumorMill');
    assert('T1.15: RUMOR isolated accurately', rumor.catalystType === 'RUMOR' && rumor.isRumor === true && rumor.isFake === false);

    const fake = classifyCatalystType('Fake news announcement: SEC debunked false report of ETF approval after X account compromised', '', 'SEC.gov');
    assert('T1.16: FAKE_MISLEADING isolated accurately', fake.catalystType === 'FAKE_MISLEADING' && fake.isFake === true && fake.isRumor === true);

    const unknown = classifyCatalystType('Random daily routine text with no market catalyst', '', 'RandomBlog');
    assert('T1.17: UNKNOWN fallback works without guessing', unknown.catalystType === 'UNKNOWN' && unknown.confidence === 0);
  } catch (e: any) {
    assert('T1: Exception', false, e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Source Credibility Tiers & Misinformation Isolation
  // --------------------------------------------------------------------------
  try {
    const tier1 = classifySourceCredibilityTier('Binance Announcement', 'https://binance.com/en/support/announcement');
    assert('T2.1: Official exchange classified as TIER_1_OFFICIAL', tier1.credibilityTier === 'TIER_1_OFFICIAL' && tier1.credibilityScore >= 95);
    assert('T2.2: Tier 1 marked as VERIFIED', tier1.verificationStatus === 'VERIFIED');

    const tier2 = classifySourceCredibilityTier('Bloomberg Terminal', 'https://bloomberg.com/crypto');
    assert('T2.3: Major wire classified as TIER_2_TIER1_MEDIA', tier2.credibilityTier === 'TIER_2_TIER1_MEDIA' && tier2.credibilityScore >= 80);

    const tier3 = classifySourceCredibilityTier('CoinMarketCap Feed', 'https://coinmarketcap.com');
    assert('T2.4: Aggregator classified as TIER_3_SECONDARY', tier3.credibilityTier === 'TIER_3_SECONDARY' && tier3.credibilityScore >= 60);

    const tier4 = classifySourceCredibilityTier('Random Twitter User @crypto_gem_moon', 'https://x.com/anon');
    assert('T2.5: Social post classified as TIER_4_SOCIAL_UNVERIFIED', tier4.credibilityTier === 'TIER_4_SOCIAL_UNVERIFIED' && tier4.credibilityScore <= 40);

    const parodySource = classifySourceCredibilityTier('The Onion Crypto Parody', 'https://onion.com');
    assert('T2.6: Satire/parody detected and isolated', parodySource.isFake === true && parodySource.credibilityScore === 0);
  } catch (e: any) {
    assert('T2: Exception', false, e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: News Impact Classification & Rumor/Fake Dampening
  // --------------------------------------------------------------------------
  try {
    const pumpListing = classifyNewsImpact({
      catalystType: 'EXCHANGE_LISTING',
      sentiment: 'BULLISH',
      severity: 85,
      sourceTier: 'TIER_1',
      isVerified: true,
      isRumor: false,
      isFake: false,
      freshnessDecay: 1.0,
      sourceCount: 2
    });
    assert('T3.1: Bullish listing classified as PUMP_CATALYST', pumpListing.impactClassification === 'PUMP_CATALYST');
    assert('T3.2: High impact score for Tier 1 verified listing', pumpListing.impactScore >= 80 && pumpListing.isConfirmedCatalyst === true);

    const dumpHack = classifyNewsImpact({
      catalystType: 'HACK_EXPLOIT',
      sentiment: 'BEARISH',
      severity: 90,
      sourceTier: 'TIER_1',
      isVerified: true,
      isRumor: false,
      isFake: false,
      freshnessDecay: 0.95,
      sourceCount: 3
    });
    assert('T3.3: Major hack classified as DUMP_RISK', dumpHack.impactClassification === 'DUMP_RISK' && dumpHack.impactScore >= 85);

    const fakeImpact = classifyNewsImpact({
      catalystType: 'FAKE_MISLEADING',
      sentiment: 'BULLISH',
      severity: 95,
      sourceTier: 'TIER_4',
      isVerified: false,
      isRumor: true,
      isFake: true,
      freshnessDecay: 1.0,
      sourceCount: 1
    });
    assert('T3.4: Fake news completely stripped to NEUTRAL and 0 impact', fakeImpact.impactClassification === 'NEUTRAL' && fakeImpact.impactScore === 0 && fakeImpact.isConfirmedCatalyst === false);

    const rumorImpact = classifyNewsImpact({
      catalystType: 'RUMOR',
      sentiment: 'BULLISH',
      severity: 80,
      sourceTier: 'TIER_4',
      isVerified: false,
      isRumor: true,
      isFake: false,
      freshnessDecay: 1.0,
      sourceCount: 1
    });
    assert('T3.5: Rumor is dampened and cannot be a confirmed catalyst', rumorImpact.isConfirmedCatalyst === false && rumorImpact.impactScore <= 40);
  } catch (e: any) {
    assert('T3: Exception', false, e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Reaction Windows Tracking (5m, 15m, 30m, 1h, 4h) & Anti-Fabrication
  // --------------------------------------------------------------------------
  try {
    const candles = generateCandles(60, 100);
    const publishedAt = candles[20].timestamp;
    const now = candles[candles.length - 1].timestamp;

    const windows = trackNewsReactionWindows({
      publishedAt,
      currentPrice: 105,
      candles,
      now
    });

    assert('T4.1: Reaction windows contains all 5 periods', Boolean(windows['5m'] && windows['15m'] && windows['30m'] && windows['1h'] && windows['4h']));
    assert('T4.2: 5m window has valid non-null price change', windows['5m'].priceChangePct !== null && typeof windows['5m'].priceChangePct === 'number');
    assert('T4.3: 5m window has valid volume ratio', windows['5m'].volumeRatio !== null && typeof windows['5m'].volumeRatio === 'number');

    // Anti-fabrication check: If news just broke (1 minute ago), longer windows MUST be PENDING_TIME with null values
    const freshPublishedAt = now - 60000; // 1 minute ago
    const pendingWindows = trackNewsReactionWindows({
      publishedAt: freshPublishedAt,
      currentPrice: 100,
      candles,
      now
    });

    assert('T4.4: 1h window is PENDING_TIME when only 1 minute elapsed', pendingWindows['1h'].status === 'PENDING_TIME');
    assert('T4.5: Anti-fabrication: priceChangePct is null for pending 1h window', pendingWindows['1h'].priceChangePct === null);
    assert('T4.6: Anti-fabrication: volumeRatio is null for pending 4h window', pendingWindows['4h'].volumeRatio === null);

    // Missing candles check
    const emptyWindows = trackNewsReactionWindows({
      publishedAt: now - 3600000,
      currentPrice: 100,
      candles: [],
      now
    });
    assert('T4.7: Missing candles gracefully return UNAVAILABLE with null metrics', emptyWindows['15m'].status === 'UNAVAILABLE' && emptyWindows['15m'].priceChangePct === null);
  } catch (e: any) {
    assert('T4: Exception', false, e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Reaction Conflict Detection (Sell-The-News & Absorption)
  // --------------------------------------------------------------------------
  try {
    // 5A: Bullish News + Bearish Price Dump (Sell The News)
    const sellTheNews = detectReactionConflict({
      catalystType: 'EXCHANGE_LISTING',
      impactClassification: 'PUMP_CATALYST',
      sentiment: 'BULLISH',
      priceChangePostNewsPct: -2.5,
      rvolPostNews: 1.8,
      isRumor: false,
      isFake: false
    });
    assert('T5.1: BULLISH_NEWS_BEARISH_PRICE conflict detected', sellTheNews.conflict === 'BULLISH_NEWS_BEARISH_PRICE');
    assert('T5.2: Warning issued for sell-the-news trap', Boolean(sellTheNews.warning && sellTheNews.warning.includes('sell-the-news')));

    // 5B: Bearish News + Bullish Price Rally (Absorption)
    const absorption = detectReactionConflict({
      catalystType: 'REGULATION',
      impactClassification: 'DUMP_RISK',
      sentiment: 'BEARISH',
      priceChangePostNewsPct: +3.2,
      rvolPostNews: 2.1,
      isRumor: false,
      isFake: false
    });
    assert('T5.3: BEARISH_NEWS_BULLISH_PRICE conflict detected', absorption.conflict === 'BEARISH_NEWS_BULLISH_PRICE');
    assert('T5.4: Warning issued for smart money absorption', Boolean(absorption.warning && absorption.warning.includes('absorption')));

    // 5C: High impact catalyst with dead volume
    const lowVol = detectReactionConflict({
      catalystType: 'PARTNERSHIP',
      impactClassification: 'PUMP_CATALYST',
      sentiment: 'BULLISH',
      priceChangePostNewsPct: 0.2,
      rvolPostNews: 0.5,
      isRumor: false,
      isFake: false
    });
    assert('T5.5: HIGH_IMPACT_NO_VOLUME conflict detected', lowVol.conflict === 'HIGH_IMPACT_NO_VOLUME');

    // 5D: Rumor fade risk
    const rumorConflict = detectReactionConflict({
      catalystType: 'RUMOR',
      impactClassification: 'MEDIUM_LOW',
      sentiment: 'BULLISH',
      priceChangePostNewsPct: 0.5,
      rvolPostNews: 1.1,
      isRumor: true,
      isFake: false
    });
    assert('T5.6: RUMOR_FADE_RISK detected for rumor catalyst', rumorConflict.conflict === 'RUMOR_FADE_RISK');
  } catch (e: any) {
    assert('T5: Exception', false, e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Technical Alignment & INVARIANT: News NEVER creates LONG/SHORT
  // --------------------------------------------------------------------------
  try {
    // CRITICAL INVARIANT TEST: Decision is WAIT -> News CANNOT create LONG or SHORT!
    const waitDecisionAlignment = evaluateNewsTechnicalAlignment({
      decision: 'WAIT',
      catalystType: 'EXCHANGE_LISTING',
      impactClassification: 'PUMP_CATALYST',
      reactionConflict: 'NONE',
      marketReactionState: 'CONFIRMED',
      isRumor: false,
      isFake: false
    });
    assert('T6.1: INVARIANT ENFORCED: Decision WAIT remains NEUTRAL alignment', waitDecisionAlignment.technicalAlignment === 'NEUTRAL');
    assert('T6.2: Explanation explicitly notes news NEVER independently creates signals', waitDecisionAlignment.explanation.includes('NEVER independently generates'));

    // Technical LONG + Confirmed Bullish Catalyst -> SUPPORTS_LONG
    const longSupport = evaluateNewsTechnicalAlignment({
      decision: 'LONG',
      catalystType: 'EXCHANGE_LISTING',
      impactClassification: 'PUMP_CATALYST',
      reactionConflict: 'NONE',
      marketReactionState: 'CONFIRMED',
      isRumor: false,
      isFake: false
    });
    assert('T6.3: Bullish catalyst SUPPORTS_LONG technical setup', longSupport.technicalAlignment === 'SUPPORTS_LONG');
    assert('T6.4: Confluence notes populated for LONG setup', longSupport.confluenceNotes.length > 0);

    // Technical LONG + Sell-The-News dumping -> CONTRADICTS_SETUP
    const longContradicted = evaluateNewsTechnicalAlignment({
      decision: 'LONG',
      catalystType: 'EXCHANGE_LISTING',
      impactClassification: 'PUMP_CATALYST',
      reactionConflict: 'BULLISH_NEWS_BEARISH_PRICE',
      marketReactionState: 'REJECTED',
      isRumor: false,
      isFake: false
    });
    assert('T6.5: Sell-the-news trap CONTRADICTS_SETUP for LONG', longContradicted.technicalAlignment === 'CONTRADICTS_SETUP');
    assert('T6.6: Contradiction note recorded', longContradicted.contradictionNotes.length > 0);

    // Technical SHORT + Confirmed Dump Catalyst -> SUPPORTS_SHORT
    const shortSupport = evaluateNewsTechnicalAlignment({
      decision: 'SHORT',
      catalystType: 'HACK_EXPLOIT',
      impactClassification: 'DUMP_RISK',
      reactionConflict: 'NONE',
      marketReactionState: 'CONFIRMED',
      isRumor: false,
      isFake: false
    });
    assert('T6.7: Dump risk catalyst SUPPORTS_SHORT technical setup', shortSupport.technicalAlignment === 'SUPPORTS_SHORT');

    // Technical LONG + Unconfirmed Rumor -> WEAKENS_SETUP
    const rumorWeakens = evaluateNewsTechnicalAlignment({
      decision: 'LONG',
      catalystType: 'RUMOR',
      impactClassification: 'MEDIUM_LOW',
      reactionConflict: 'RUMOR_FADE_RISK',
      marketReactionState: 'UNKNOWN',
      isRumor: true,
      isFake: false
    });
    assert('T6.8: Rumor WEAKENS_SETUP conviction', rumorWeakens.technicalAlignment === 'WEAKENS_SETUP');
  } catch (e: any) {
    assert('T6: Exception', false, e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Full Pipeline evaluateNewsMarketImpact & Integration
  // --------------------------------------------------------------------------
  try {
    const candles = generateCandles(60, 100);
    const publishedAt = candles[25].timestamp;

    const mockNews = [
      {
        id: 'news_apt_listing',
        title: 'Coinbase announces spot listing for Aptos (APT)',
        summary: 'Aptos token APT will commence trading on Coinbase spot markets tomorrow with USD and USDT pairs.',
        source: 'Coinbase Blog',
        url: 'https://coinbase.com/blog/apt-listing',
        publishedAt
      }
    ];

    const report = evaluateNewsMarketImpact({
      symbol: 'APTUSDT',
      newsList: mockNews,
      candles,
      currentPrice: 103,
      decision: 'LONG',
      now: candles[candles.length - 1].timestamp
    });

    assert('T7.1: Status is AVAILABLE when matched news exists', report.status === 'AVAILABLE');
    assert('T7.2: Symbol clean match to APT', report.symbol === 'APT');
    assert('T7.3: Catalyst classified as EXCHANGE_LISTING', report.catalystType === 'EXCHANGE_LISTING');
    assert('T7.4: Impact classified as PUMP_CATALYST', report.impactClassification === 'PUMP_CATALYST');
    assert('T7.5: Credibility tier classified as TIER_1_OFFICIAL', report.sourceCredibilityTier === 'TIER_1_OFFICIAL');
    assert('T7.6: Verification status is VERIFIED', report.verificationStatus === 'VERIFIED');
    assert('T7.7: Is not rumor or fake', !report.isRumorOrUnverified && !report.isFakeOrMisleading);
    assert('T7.8: Is confirmed catalyst', report.isConfirmedCatalyst === true);
    assert('T7.9: Technical alignment supports LONG', report.technicalAlignment === 'SUPPORTS_LONG');
    assert('T7.10: Zero fabricated data flag true to spec', report.isFabricated === false);

    // Test with unmapped asset: returns UNAVAILABLE without fabricating news
    const noNewsReport = evaluateNewsMarketImpact({
      symbol: 'DOGEUSDT',
      newsList: mockNews,
      candles,
      currentPrice: 0.12,
      decision: 'WAIT'
    });
    assert('T7.11: Unmapped asset returns UNAVAILABLE status', noNewsReport.status === 'UNAVAILABLE');
    assert('T7.12: Unmapped asset catalyst is UNKNOWN', noNewsReport.catalystType === 'UNKNOWN');
    assert('T7.13: Zero fabricated data for unmapped asset', noNewsReport.isFabricated === false);
  } catch (e: any) {
    assert('T7: Exception', false, e.message);
  }

  // --------------------------------------------------------------------------
  // TEST 8: ONE COIN = ONE CURRENT UNIFIED SIGNAL Invariant Preservation
  // --------------------------------------------------------------------------
  try {
    resetSignalStoreForTesting();

    const signal1: Signal = {
      id: 'sig_eth_1',
      symbol: 'ETHUSDT',
      baseAsset: 'ETH',
      quoteAsset: 'USDT',
      direction: 'LONG',
      entryPrice: 3200,
      currentPrice: 3200,
      priceChange24h: 2.5,
      stopLoss: 3100,
      targets: [
        { id: 'tp1', label: 'TP1', price: 3350, percentage: 4.6, hit: false },
        { id: 'tp2', label: 'TP2', price: 3500, percentage: 9.3, hit: false }
      ],
      tp1: 3350,
      tp2: 3500,
      tp3: 3650,
      riskRewardRatio: 2.5,
      qualityGrade: 'A',
      actionablePriority: 'HIGH_PRIORITY',
      confidence: 85,
      timestamp: Date.now() - 10000,
      createdAt: Date.now() - 10000,
      expiresAt: Date.now() + 86400000,
      timeframe: '1h',
      status: 'ACTIVE',
      entryStatus: 'WAIT_FOR_CONFIRMATION',
      moonScore: 82,
      confluences: [],
      newsImpactReport: {
        status: 'AVAILABLE',
        symbol: 'ETH',
        catalystType: 'UPGRADE',
        impactClassification: 'HIGH_IMPACT',
        impactScore: 80,
        catalystConfidence: 85,
        sourceCredibilityTier: 'TIER_1_OFFICIAL',
        sourceCredibilityScore: 95,
        verificationStatus: 'VERIFIED',
        isRumorOrUnverified: false,
        isFakeOrMisleading: false,
        isConfirmedCatalyst: true,
        matchedCoins: ['ETH'],
        mappingConfidence: 'HIGH',
        headline: 'Ethereum Dencun Upgrade successful',
        summary: 'Upgrade deployed successfully on mainnet',
        source: 'Ethereum Foundation',
        supportingSources: ['Ethereum Foundation'],
        sourceCount: 1,
        freshness: 'FRESH',
        reactionWindows: {} as any,
        marketReactionState: 'CONFIRMED',
        reactionConflict: 'NONE',
        technicalAlignment: 'SUPPORTS_LONG',
        alignmentExplanation: 'Upgrade supports long continuation',
        confluenceNotes: ['Upgrade supports long continuation'],
        contradictionNotes: [],
        isFabricated: false
      }
    };

    upsertSignals([signal1]);
    const storedAfter1 = getAllStoredSignals();
    assert('T8.1: Exactly 1 signal in store for ETHUSDT', storedAfter1.length === 1 && storedAfter1[0].symbol === 'ETHUSDT');
    assert('T8.2: News impact report attached to stored signal', storedAfter1[0].newsImpactReport?.catalystType === 'UPGRADE');

    // Update signal with later news report
    const signal2: Signal = {
      ...signal1,
      id: 'sig_eth_2',
      qualityGrade: 'A+',
      newsImpactReport: {
        ...signal1.newsImpactReport!,
        impactScore: 90
      }
    };

    upsertSignals([signal2]);
    const storedAfter2 = getAllStoredSignals();
    assert('T8.3: Still exactly 1 signal in store after update (no duplicate ETHUSDT)', storedAfter2.length === 1);
    assert('T8.4: Signal correctly updated to A+ grade and new impact score', storedAfter2[0].qualityGrade === 'A+' && storedAfter2[0].newsImpactReport?.impactScore === 90);
  } catch (e: any) {
    assert('T8: Exception', false, e.message);
  }

  console.log('================================================================');
  console.log(`📊 PHASE 13 TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================');

  return { passed, failed, total: passed + failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPhase13NewsIntelligenceTests().then((res) => {
    if (res.failed > 0) {
      process.exit(1);
    }
  });
}
