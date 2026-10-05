/**
 * Phase 4.9 Comprehensive News, Catalyst & Market-Reaction Intelligence Test Suite
 * Validates all 30+ capabilities required by Phase 4.9.
 */

import {
  mapNewsToCoins,
  classifySourceQuality,
  classifyNewsEvent,
  calculateNewsFreshness,
  calculateNewsImpactScore,
  generateDeterministicNewsId,
  deduplicateAndMergeNews,
  correlateNewsWithMarketReaction,
  evaluatePrePumpCatalyst,
  evaluatePostPumpExhaustion,
  evaluateNewListing,
  ProcessedNews,
  RawNewsArticle
} from './newsIntelligenceEngine';
import { Candle } from './cryptoService';
import { buildNewsEvidence } from './multiTimeframeEngine';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

function createMockCandleSeries(
  count: number,
  startPrice: number,
  trend: 'UP' | 'DOWN' | 'FLAT' | 'PUMP_EXHAUSTION' = 'FLAT',
  baseVolume: number = 1000
): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  const now = Date.now();
  const stepMs = 3600 * 1000; // 1h bars

  for (let i = 0; i < count; i++) {
    const timestamp = now - (count - i) * stepMs;
    let open = price;
    let close = price;
    let high = price;
    let low = price;
    let volume = baseVolume;

    if (trend === 'UP') {
      price = price * 1.015;
      open = price * 0.99;
      close = price;
      high = price * 1.005;
      low = open * 0.995;
      volume = baseVolume * (1 + (i / count) * 2);
    } else if (trend === 'DOWN') {
      price = price * 0.985;
      open = price * 1.01;
      close = price;
      high = open * 1.005;
      low = price * 0.995;
      volume = baseVolume * (1 + (i / count) * 2);
    } else if (trend === 'PUMP_EXHAUSTION') {
      if (i < count - 3) {
        price = price * 1.04; // parabolic pump
        open = price * 0.98;
        close = price;
        high = price * 1.02;
        low = open;
        volume = baseVolume * (1 + i);
      } else {
        // blow-off top / wick
        open = price;
        close = price * 0.96;
        high = price * 1.05;
        low = close * 0.99;
        volume = baseVolume * 5;
      }
    } else {
      // FLAT
      const delta = (Math.sin(i) * 0.002) * price;
      open = price;
      close = price + delta;
      high = Math.max(open, close) * 1.002;
      low = Math.min(open, close) * 0.998;
      price = close;
    }

    candles.push({
      timestamp,
      open: Number(open.toFixed(4)),
      high: Number(high.toFixed(4)),
      low: Number(low.toFixed(4)),
      close: Number(close.toFixed(4)),
      volume: Number(volume.toFixed(2))
    });
  }

  return candles;
}

export async function runPhase4_9Tests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PHASE 4.9 NEWS & CATALYST INTELLIGENCE TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`  ❌ [FAIL] ${name}:`, e.message);
    }
  }

  // --------------------------------------------------------------------------
  // 1. EXTENDED COIN MAPPING & DISAMBIGUATION
  // --------------------------------------------------------------------------
  console.log('📌 Test Suite 1: Extended Coin Mapping & Disambiguation Rules');

  test('Maps explicit Bitcoin mentions to BTC with HIGH confidence', () => {
    const res = mapNewsToCoins('Bitcoin surpasses $90k milestone amid heavy spot ETF inflows');
    assert(res.primaryCoin === 'BTC', `Expected BTC, got ${res.primaryCoin}`);
    assert(res.confidence === 'HIGH', `Expected HIGH confidence, got ${res.confidence}`);
  });

  test('Maps Solana and SUI ecosystem mentions accurately', () => {
    const res = mapNewsToCoins('Solana DeFi TVL hits new high as SUI network transaction volume doubles');
    assert(res.primaryCoin === 'SOL' || res.primaryCoin === 'SUI', `Expected SOL or SUI, got ${res.primaryCoin}`);
    assert(res.matchedCoins.includes('SOL'), 'Expected matchedCoins to include SOL');
    assert(res.matchedCoins.includes('SUI'), 'Expected matchedCoins to include SUI');
  });

  test('Disambiguates false positives (NEAR adverb vs NEAR protocol)', () => {
    const falsePositive = mapNewsToCoins('Bitcoin price trades near the key resistance level of 95k');
    assert(!falsePositive.matchedCoins.includes('NEAR'), 'Should NOT map "near the key" to NEAR protocol');
    assert(falsePositive.primaryCoin === 'BTC', 'Should identify BTC as primary');

    const truePositive = mapNewsToCoins('Near Protocol announces revolutionary AI infrastructure sharding update');
    assert(truePositive.matchedCoins.includes('NEAR'), 'Should map "Near Protocol" to NEAR token');
    assert(truePositive.primaryCoin === 'NEAR', 'Primary coin should be NEAR');
  });

  test('Disambiguates DOT (punctuation/dot vs Polkadot) and LINK (hyperlink vs Chainlink)', () => {
    const dotFalse = mapNewsToCoins('Markets rally. Crypto investors celebrate gains.');
    assert(!dotFalse.matchedCoins.includes('DOT'), 'Should NOT map sentence dot to Polkadot');

    const dotTrue = mapNewsToCoins('Polkadot DOT staking reward mechanism overhauled in latest governance vote');
    assert(dotTrue.matchedCoins.includes('DOT'), 'Should map Polkadot DOT to DOT');

    const linkFalse = mapNewsToCoins('Click the link below to read our weekly market outlook');
    assert(!linkFalse.matchedCoins.includes('LINK'), 'Should NOT map standard url link to Chainlink');

    const linkTrue = mapNewsToCoins('Chainlink CCIP expanded to three major layer-1 blockchains');
    assert(linkTrue.matchedCoins.includes('LINK'), 'Should map Chainlink CCIP to LINK');
  });

  test('Maps long-tail assets (PEPE, RENDER, FET, AVAX, APT)', () => {
    const res = mapNewsToCoins('Fetch.ai Artificial Superintelligence Alliance FET and Render RENDER lead AI token rally');
    assert(res.matchedCoins.includes('FET') && res.matchedCoins.includes('RENDER'), 'Should map FET and RENDER');
  });

  test('Gracefully returns UNKNOWN for generic non-crypto news with no specific coin', () => {
    const res = mapNewsToCoins('Global automotive manufacturing report shows steady quarterly auto shipments');
    assert(res.primaryCoin === undefined, 'Primary coin should be undefined');
    assert(res.confidence === 'UNKNOWN', 'Confidence should be UNKNOWN');
    assert(res.matchedCoins.length === 0, 'No specific coins should be matched');
  });

  // --------------------------------------------------------------------------
  // 2. SOURCE QUALITY TIERING & VERIFICATION AUDIT
  // --------------------------------------------------------------------------
  console.log('\n📌 Test Suite 2: Source Quality Tiering & Verification Classification');

  test('Classifies Official Foundation & SEC releases as TIER 1', () => {
    const sec = classifySourceQuality('SEC Official Release', 'https://sec.gov/news/press-release');
    assert(sec.tier === 'TIER_1', `Expected TIER_1, got ${sec.tier}`);
    assert(sec.isVerified === true, 'TIER_1 must be verified');

    const binance = classifySourceQuality('Binance Announcement', 'https://binance.com/en/support/announcement');
    assert(binance.tier === 'TIER_1', `Expected TIER_1, got ${binance.tier}`);
  });

  test('Classifies Established Crypto News (CoinDesk, Cointelegraph) as TIER 2', () => {
    const coindesk = classifySourceQuality('CoinDesk', 'https://coindesk.com/markets/2025/01/btc-rally');
    assert(coindesk.tier === 'TIER_2', `Expected TIER_2, got ${coindesk.tier}`);
    assert(coindesk.isVerified === true, 'TIER_2 should be verified');
  });

  test('Classifies Unverified Rumors / Leaks as TIER 4 with isVerified=false', () => {
    const leak = classifySourceQuality('Crypto Rumors Telegram', 'https://t.me/cryptoleaks/1234');
    assert(leak.tier === 'TIER_4', `Expected TIER_4, got ${leak.tier}`);
    assert(leak.isVerified === false, 'TIER_4 rumor must NOT be verified');
  });

  // --------------------------------------------------------------------------
  // 3. DETERMINISTIC EVENT CLASSIFICATION & SEVERITY
  // --------------------------------------------------------------------------
  console.log('\n📌 Test Suite 3: Deterministic Event Classification & Severity');

  test('Classifies Security Hacks / Exploits as strongly BEARISH with HIGH severity', () => {
    const res = classifyNewsEvent('Protocol suffers $45M flash loan exploit and smart contract vulnerability');
    assert(res.eventType === 'HACK', `Expected HACK, got ${res.eventType}`);
    assert(res.sentiment === 'BEARISH', `Expected BEARISH, got ${res.sentiment}`);
    assert(res.severity >= 80, `Expected severity >= 80, got ${res.severity}`);
  });

  test('Classifies Exchange Listings as BULLISH with appropriate severity', () => {
    const res = classifyNewsEvent('Binance will list Sui SUI with new spot trading pairs');
    assert(res.eventType === 'LISTING', `Expected LISTING, got ${res.eventType}`);
    assert(res.sentiment === 'BULLISH', `Expected BULLISH, got ${res.sentiment}`);
  });

  test('Classifies Mainnet / Hardfork Upgrades accurately', () => {
    const res = classifyNewsEvent('Ethereum developers confirm Dencun hard fork upgrade activation date');
    assert(res.eventType === 'UPGRADE' || res.eventType === 'MAINNET' || res.eventType === 'HARD_FORK', `Expected upgrade event, got ${res.eventType}`);
    assert(res.sentiment === 'BULLISH', `Expected BULLISH, got ${res.sentiment}`);
  });

  test('Classifies Token Unlocks as BEARISH supply dilution', () => {
    const res = classifyNewsEvent('Massive 150M token cliff unlock scheduled for team and seed investors tomorrow');
    assert(res.eventType === 'UNLOCK', `Expected UNLOCK, got ${res.eventType}`);
    assert(res.sentiment === 'BEARISH', `Expected BEARISH, got ${res.sentiment}`);
  });

  // --------------------------------------------------------------------------
  // 4. FRESHNESS DECAY & IMPACT SCORING
  // --------------------------------------------------------------------------
  console.log('\n📌 Test Suite 4: Freshness Decay & Impact Scoring Calculation');

  test('Calculates BREAKING (<1h) freshness with zero decay (1.0x)', () => {
    const now = Date.now();
    const fresh = calculateNewsFreshness(now - 15 * 60 * 1000); // 15 mins ago
    assert(fresh.freshness === 'BREAKING', `Expected BREAKING, got ${fresh.freshness}`);
    assert(fresh.decayMultiplier === 1.0, `Expected 1.0 multiplier, got ${fresh.decayMultiplier}`);
  });

  test('Calculates AGING (>24h) freshness with heavy decay (<0.5x)', () => {
    const now = Date.now();
    const old = calculateNewsFreshness(now - 36 * 3600 * 1000); // 36 hours ago
    assert(old.freshness === 'AGING', `Expected AGING, got ${old.freshness}`);
    assert(old.decayMultiplier <= 0.5, `Expected <= 0.5 multiplier, got ${old.decayMultiplier}`);
  });

  test('Calculates Impact Score with source tier weighting & rumor penalty', () => {
    const officialImpact = calculateNewsImpactScore({
      eventType: 'REGULATION',
      sentiment: 'BULLISH',
      sourceTier: 'TIER_1',
      isVerified: true,
      sourceCount: 3,
      isDirectTarget: true,
      freshnessDecay: 1.0,
      severity: 85
    });

    const rumorImpact = calculateNewsImpactScore({
      eventType: 'REGULATION',
      sentiment: 'BULLISH',
      sourceTier: 'TIER_4',
      isVerified: false,
      sourceCount: 1,
      isDirectTarget: true,
      freshnessDecay: 1.0,
      severity: 85
    });

    assert(officialImpact.score > rumorImpact.score, 'Official TIER_1 news must have higher impact than TIER_4 rumor');
    assert(officialImpact.level === 'VERY_HIGH' || officialImpact.level === 'HIGH', 'Official high-severity impact level');
    assert(rumorImpact.level === 'LOW' || rumorImpact.level === 'MEDIUM', 'Rumor impact level should be dampened');
  });

  // --------------------------------------------------------------------------
  // 5. DETERMINISTIC NEWS ID & MERGE DEDUPLICATION
  // --------------------------------------------------------------------------
  console.log('\n📌 Test Suite 5: Deterministic News ID & Deduplication Engine');

  test('Generates deterministic and reproducible news ID', () => {
    const id1 = generateDeterministicNewsId('Bitcoin Spot ETF approved', 1700000000, 'BTC');
    const id2 = generateDeterministicNewsId('Bitcoin Spot ETF approved', 1700000000, 'BTC');
    const id3 = generateDeterministicNewsId('Ethereum Staking Update', 1700000000, 'ETH');

    assert(id1 === id2, 'Identical news parameters must generate identical deterministic ID');
    assert(id1 !== id3, 'Different news parameters must generate different IDs');
  });

  test('Deduplicates duplicate feeds and merges source counts', () => {
    const rawArticles: RawNewsArticle[] = [
      {
        id: '1',
        title: 'SEC approves first US Spot Bitcoin ETF in landmark regulatory decision',
        summary: 'The Securities and Exchange Commission has approved spot Bitcoin ETFs.',
        source: 'CoinDesk',
        url: 'https://coindesk.com/article1',
        publishedAt: Date.now() - 60000
      },
      {
        id: '2',
        title: 'SEC approves first US Spot Bitcoin ETF in landmark regulatory decision',
        summary: 'In a historic ruling, the SEC greenlights spot Bitcoin exchange traded funds.',
        source: 'Bloomberg Crypto',
        url: 'https://bloomberg.com/article2',
        publishedAt: Date.now() - 50000
      },
      {
        id: '3',
        title: 'Solana Mobile unveils second generation Web3 smartphone Chapter 2',
        summary: 'Solana mobile preorders cross 100,000 units.',
        source: 'Decrypt',
        url: 'https://decrypt.co/article3',
        publishedAt: Date.now() - 30000
      }
    ];

    const processed = deduplicateAndMergeNews(rawArticles);
    assert(processed.length === 2, `Expected 2 deduplicated canonical articles, got ${processed.length}`);

    const btcArticle = processed.find(p => p.primaryCoin === 'BTC');
    assert(btcArticle !== undefined, 'BTC article should exist');
    assert((btcArticle?.sourceCount || 1) >= 2, `Expected merged sourceCount >= 2, got ${btcArticle?.sourceCount}`);
    assert((btcArticle?.supportingSources || []).length >= 2, 'Should include both supporting sources');
  });

  // --------------------------------------------------------------------------
  // 6. MARKET REACTION CORRELATION & CONTRADICTION DETECTION
  // --------------------------------------------------------------------------
  console.log('\n📌 Test Suite 6: Market Reaction Correlation & Contradiction Intelligence');

  test('Correlates CONFIRMED market reaction when price pumps on bullish news', () => {
    const now = Date.now();
    const news: ProcessedNews = {
      id: 'news_test_bull',
      title: 'Major protocol upgrade goes live with 10x throughput',
      summary: 'Network capacity enhanced.',
      source: 'Official Blog',
      publishedAt: now - 3 * 3600 * 1000,
      sentiment: 'BULLISH',
      sentimentScore: 0.8,
      impactScore: 85,
      impactLevel: 'HIGH',
      eventType: 'UPGRADE',
      sourceTier: 'TIER_1',
      isVerified: true,
      sourceCount: 1,
      primaryCoin: 'SOL',
      relatedCoins: ['SOL'],
      freshness: 'FRESH'
    };

    const candles = createMockCandleSeries(20, 150, 'UP', 2000);
    const reaction = correlateNewsWithMarketReaction({
      news,
      candles,
      currentPrice: candles[candles.length - 1].close
    });

    assert(reaction.state === 'CONFIRMED', `Expected CONFIRMED, got ${reaction.state}`);
    assert(reaction.isContradicted === false, 'Should NOT be contradicted');
    assert(reaction.priceChangePostNewsPct > 0, 'Price change should be positive');
  });

  test('Flags CONTRADICTION when price violently dumps on bullish news ("Sell the News")', () => {
    const now = Date.now();
    const news: ProcessedNews = {
      id: 'news_test_sell_news',
      title: 'Long-awaited ETF officially begins trading today',
      summary: 'Trading begins across major stock exchanges.',
      source: 'Bloomberg',
      publishedAt: now - 4 * 3600 * 1000,
      sentiment: 'BULLISH',
      sentimentScore: 0.9,
      impactScore: 90,
      impactLevel: 'VERY_HIGH',
      eventType: 'ETF_FLOW',
      sourceTier: 'TIER_1',
      isVerified: true,
      sourceCount: 5,
      primaryCoin: 'BTC',
      relatedCoins: ['BTC'],
      freshness: 'FRESH'
    };

    // Market dumps hard post-announcement
    const candles = createMockCandleSeries(20, 95000, 'DOWN', 3000);
    const reaction = correlateNewsWithMarketReaction({
      news,
      candles,
      currentPrice: candles[candles.length - 1].close
    });

    assert(reaction.state === 'REJECTED', `Expected REJECTED state, got ${reaction.state}`);
    assert(reaction.isContradicted === true, 'Contradiction flag must be TRUE');
    assert(reaction.contradictionWarning !== undefined, 'Contradiction warning must be present');
    assert(reaction.fadeOpportunity === true, 'Fade opportunity should be flagged');
  });

  test('Gracefully returns UNKNOWN when candle history is unavailable', () => {
    const news: ProcessedNews = {
      id: 'news_test_unknown',
      title: 'Random crypto headline',
      summary: 'Summary text',
      source: 'Source',
      publishedAt: Date.now(),
      sentiment: 'BULLISH',
      sentimentScore: 0.5,
      impactScore: 50,
      impactLevel: 'MEDIUM',
      eventType: 'OTHER',
      sourceTier: 'TIER_3',
      isVerified: true,
      sourceCount: 1,
      relatedCoins: []
    };

    const reaction = correlateNewsWithMarketReaction({ news, candles: [] });
    assert(reaction.state === 'UNKNOWN', `Expected UNKNOWN state, got ${reaction.state}`);
    assert(reaction.confidence === 'UNKNOWN', 'Confidence should be UNKNOWN');
  });

  // --------------------------------------------------------------------------
  // 7. PRE-PUMP CATALYST SETUP INTELLIGENCE
  // --------------------------------------------------------------------------
  console.log('\n📌 Test Suite 7: Pre-Pump Catalyst Setup Intelligence');

  test('Detects Pre-Pump compression + volume acceleration setup before breakout', () => {
    const candles = createMockCandleSeries(30, 20, 'FLAT', 1000);
    const highTierNews: ProcessedNews[] = [
      {
        id: 'news_pre_pump',
        title: 'Binance announces upcoming launchpool staking for SUI ecosystem',
        summary: 'Staking pool opens tomorrow.',
        source: 'Binance Official',
        publishedAt: Date.now() - 30 * 60 * 1000,
        sentiment: 'BULLISH',
        sentimentScore: 0.85,
        impactScore: 88,
        impactLevel: 'VERY_HIGH',
        eventType: 'LISTING',
        sourceTier: 'TIER_1',
        isVerified: true,
        sourceCount: 2,
        primaryCoin: 'SUI',
        relatedCoins: ['SUI'],
        freshness: 'BREAKING'
      }
    ];

    const setup = evaluatePrePumpCatalyst({
      news: highTierNews,
      candles,
      atr: 0.2, // low ATR compression
      rvol: 1.6 // volume starting to accelerate
    });

    assert(setup.isPrePumpCatalyst === true, 'Should detect pre-pump catalyst setup');
    assert(setup.setupType === 'COMPRESSION_BREAKOUT_CATALYST', `Expected COMPRESSION_BREAKOUT_CATALYST, got ${setup.setupType}`);
    assert((setup.readinessScore || 0) >= 70, `Expected readiness >= 70, got ${setup.readinessScore}`);
  });

  // --------------------------------------------------------------------------
  // 8. POST-PUMP EXHAUSTION / DUMP RISK INTELLIGENCE
  // --------------------------------------------------------------------------
  console.log('\n📌 Test Suite 8: Post-Pump Exhaustion & Dump Risk Intelligence');

  test('Detects pump exhaustion when parabolic expansion meets late retail hype', () => {
    const parabolicCandles = createMockCandleSeries(25, 10, 'PUMP_EXHAUSTION', 5000);
    const lateHypeNews: ProcessedNews[] = [
      {
        id: 'news_late_hype',
        title: 'Meme token surges 400% in 2 days as retail frenzy reaches fever pitch',
        summary: 'Influencers call for 100x gains.',
        source: 'Secondary Media',
        publishedAt: Date.now() - 20 * 60 * 1000,
        sentiment: 'BULLISH',
        sentimentScore: 0.9,
        impactScore: 60,
        impactLevel: 'MEDIUM',
        eventType: 'OTHER',
        sourceTier: 'TIER_3',
        isVerified: false,
        sourceCount: 1,
        primaryCoin: 'PEPE',
        relatedCoins: ['PEPE'],
        freshness: 'BREAKING'
      }
    ];

    const exhaustion = evaluatePostPumpExhaustion({
      candles: parabolicCandles,
      news: lateHypeNews,
      rsi: 82, // heavily overbought
      rvol: 3.5, // climax volume
      atr: 1.5,
      ema20: 16,
      ema50: 12
    });

    assert(exhaustion.status === 'PUMP_EXHAUSTION' || exhaustion.status === 'DUMP_RISK', `Expected exhaustion, got ${exhaustion.status}`);
    assert((exhaustion.exhaustionScore || 0) >= 70, `Expected exhaustion score >= 70, got ${exhaustion.exhaustionScore}`);
    assert(exhaustion.isClimaxVolume === true, 'Should detect climax volume');
  });

  // --------------------------------------------------------------------------
  // 9. NEW LISTING RADAR & POST-LISTING ANALYSIS
  // --------------------------------------------------------------------------
  console.log('\n📌 Test Suite 9: New Listing Radar & Discovery Engine');

  test('Evaluates Pre-listing radar with launchpad details and risk assessment', () => {
    const listingNews: ProcessedNews = {
      id: 'news_listing',
      title: 'Binance introduces new Launchpool staking project XYZ token',
      summary: 'Users can stake BNB and FDUSD to farm XYZ.',
      source: 'Binance Announcements',
      publishedAt: Date.now() - 3600 * 1000,
      sentiment: 'BULLISH',
      sentimentScore: 0.8,
      impactScore: 85,
      impactLevel: 'HIGH',
      eventType: 'LISTING',
      sourceTier: 'TIER_1',
      isVerified: true,
      sourceCount: 1,
      primaryCoin: 'XYZ',
      relatedCoins: ['XYZ']
    };

    const listing = evaluateNewListing({ news: listingNews });
    assert(listing !== null, 'Listing info should be generated');
    assert(listing?.exchange === 'Binance', `Expected Binance, got ${listing?.exchange}`);
    assert(listing?.launchStatus === 'PRE_LISTING', `Expected PRE_LISTING, got ${listing?.launchStatus}`);
    assert(listing?.preListingRadar.assessment === 'BULLISH_POTENTIAL', 'Launchpool should have BULLISH_POTENTIAL assessment');
  });

  // --------------------------------------------------------------------------
  // 10. MULTI-TIMEFRAME EVIDENCE FUSION PRESERVATION
  // --------------------------------------------------------------------------
  console.log('\n📌 Test Suite 10: Multi-Timeframe Evidence Fusion & Absolute Non-Destructive Rules');

  test('buildNewsEvidence outputs structured UNKNOWN when news is missing or unaligned', () => {
    const emptyEvidence = buildNewsEvidence([], 'BTC');
    assert(emptyEvidence.isMissing === true, 'isMissing must be true for empty news');
    assert(emptyEvidence.bias === 'UNKNOWN', 'bias must be UNKNOWN');

    const unalignedEvidence = buildNewsEvidence([
      {
        id: '1',
        title: 'Dogecoin rally',
        summary: '',
        source: 'News',
        url: '',
        publishedAt: Date.now(),
        sentiment: 'BULLISH',
        impactScore: 50,
        impactLevel: 'MEDIUM',
        eventType: 'OTHER',
        sourceTier: 'TIER_3',
        isVerified: true,
        sourceCount: 1,
        primaryCoin: 'DOGE',
        relatedCoins: ['DOGE']
      }
    ], 'AVAX');

    assert(unalignedEvidence.isMissing === true, 'isMissing must be true when coin not in news list');
    assert(unalignedEvidence.bias === 'UNKNOWN', 'bias must be UNKNOWN');
  });

  test('buildNewsEvidence incorporates contradiction warnings into evidenceList without breaking fusion', () => {
    const contradictedNews: ProcessedNews[] = [
      {
        id: 'news_contra',
        title: 'Huge ETF inflow headline',
        summary: 'Summary',
        source: 'Bloomberg',
        url: '',
        publishedAt: Date.now(),
        sentiment: 'BULLISH',
        impactScore: 80,
        impactLevel: 'HIGH',
        eventType: 'ETF_FLOW',
        sourceTier: 'TIER_1',
        isVerified: true,
        sourceCount: 1,
        primaryCoin: 'BTC',
        relatedCoins: ['BTC'],
        marketReaction: {
          state: 'REJECTED',
          priceChangePostNewsPct: -3.5,
          rvolPostNews: 1.8,
          volumeSurgePostNews: true,
          reactionDelayBars: 1,
          isContradicted: true,
          fadeOpportunity: true,
          confidence: 'HIGH',
          evidence: ['Bearish price reaction'],
          contradictionWarning: 'Price dumped 3.5% post-headline',
          details: 'Price dumped 3.5% post-headline'
        }
      }
    ];

    const evidence = buildNewsEvidence(contradictedNews, 'BTC');
    assert(evidence.isMissing === false, 'Evidence is present');
    assert(evidence.evidenceList.some(e => e.includes('Contradiction warning')), 'Evidence list should contain contradiction warning');
  });

  console.log('\n================================================================');
  console.log(`🎉 TEST SUITE COMPLETED: ${passed} / ${total} TESTS PASSED`);
  console.log('================================================================\n');

  if (passed !== total) {
    throw new Error(`Test suite failure: ${total - passed} tests failed.`);
  }
}

// Auto-run when executed directly via tsx
if (process.argv[1]?.includes('testPhase4_9NewsIntelligence')) {
  runPhase4_9Tests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}
