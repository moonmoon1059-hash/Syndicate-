import {
  calculateOpportunityFingerprint,
  validateTelegramSignalActionability,
  classifyOpportunityState,
  formatTelegramAlertMessage,
  generateOpportunityChartBuffer,
  dispatchEventAlert,
  silentlySeedTelegramLedger
} from '../server/telegramAlertEngine';
import { fetchFreshTelegramLiveMarketData, assessMarketDataQuality } from '../server/liveDataProvider';
import { Candle } from '../server/cryptoService';

async function runVerification() {
  console.log('================================================================');
  console.log('MOONSCANNER PRODUCTION VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(title: string, condition: boolean, details?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${title}${details ? ` -> ${details}` : ''}`);
    } else {
      console.error(`❌ [FAIL] ${title}${details ? ` -> ${details}` : ''}`);
    }
  }

  // TEST A: Symbol Match & Validation
  console.log('\n--- TEST A: Symbol Matching ---');
  const actionabilityMismatch = validateTelegramSignalActionability(
    {
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryLow: 60000,
      entryHigh: 61000,
      stopLoss: 58000,
      targets: [{ price: 80000 }]
    },
    { symbol: 'ETHUSDT', lastPrice: 3000 }
  );
  assert(
    'Reject Symbol Mismatch',
    !actionabilityMismatch.isValid && !!actionabilityMismatch.rejectReason?.includes('SYMBOL_MISMATCH'),
    actionabilityMismatch.rejectReason
  );

  // TEST B & C: Fresh Market Data Fetch & Chronology from Real Exchange
  console.log('\n--- TEST B & C: Live Exchange Freshness & Chronology ---');
  const freshData = await fetchFreshTelegramLiveMarketData('BTCUSDT');
  assert('Exchange Provider Online', freshData.isFresh, `Source: ${freshData.source}`);
  assert('Fresh Ticker Price Available', freshData.ticker !== null && (freshData.ticker?.lastPrice || 0) > 0, `Price: $${freshData.ticker?.lastPrice}`);
  assert('Fresh 1H Candles Available (>=20)', (freshData.candles?.length || 0) >= 20, `Candle count: ${freshData.candles?.length}`);

  if (freshData.candles && freshData.candles.length >= 20) {
    let chronological = true;
    for (let i = 1; i < freshData.candles.length; i++) {
      if (freshData.candles[i].timestamp <= freshData.candles[i - 1].timestamp) {
        chronological = false;
        break;
      }
    }
    assert('Candles Strictly Chronological', chronological);

    const latestCandle = freshData.candles[freshData.candles.length - 1];
    const ageMinutes = (Date.now() - latestCandle.timestamp) / 60000;
    assert('Latest Candle Fresh (< 150m)', ageMinutes < 150, `Age: ${ageMinutes.toFixed(1)} mins`);
  }

  // TEST D: Direction Accuracy (LONG vs SHORT)
  console.log('\n--- TEST D: Direction Accuracy & SL/TP Rules ---');
  const invalidLongSL = validateTelegramSignalActionability(
    {
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryLow: 60000,
      entryHigh: 61000,
      stopLoss: 62000, // Invalid: SL above entry
      targets: [{ price: 80000 }]
    },
    { symbol: 'BTCUSDT', lastPrice: 60500 }
  );
  assert('Reject Inverted SL for LONG', !invalidLongSL.isValid && !!invalidLongSL.rejectReason?.includes('INVALID_SL_DIRECTION_LONG'));

  const invalidShortSL = validateTelegramSignalActionability(
    {
      symbol: 'BTCUSDT',
      direction: 'SHORT',
      entryLow: 60000,
      entryHigh: 61000,
      stopLoss: 58000, // Invalid: SL below entry
      targets: [{ price: 40000 }]
    },
    { symbol: 'BTCUSDT', lastPrice: 60500 }
  );
  assert('Reject Inverted SL for SHORT', !invalidShortSL.isValid && !!invalidShortSL.rejectReason?.includes('INVALID_SL_DIRECTION_SHORT'));

  // TEST E: Anti-Chase & Actionability Protection
  console.log('\n--- TEST E: Anti-Chase & Actionability Checks ---');
  const alreadySurged = validateTelegramSignalActionability(
    {
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryLow: 60000,
      entryHigh: 61000,
      stopLoss: 58000,
      targets: [{ price: 85000 }]
    },
    { symbol: 'BTCUSDT', lastPrice: 65000 } // Surged way above entry
  );
  assert('Reject Setup if Price Already Surged Past Entry Zone', !alreadySurged.isValid && !!alreadySurged.rejectReason?.includes('STALE_SETUP_PRICE_ALREADY_SURGED'));

  const alreadyHitTP1 = validateTelegramSignalActionability(
    {
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryLow: 60000,
      entryHigh: 61000,
      stopLoss: 58000,
      targets: [{ price: 62000 }, { price: 85000 }]
    },
    { symbol: 'BTCUSDT', lastPrice: 62500 } // Past TP1
  );
  assert('Reject Setup if TP1 Already Hit', !alreadyHitTP1.isValid && !!alreadyHitTP1.rejectReason?.includes('STALE_SETUP_TP1_ALREADY_HIT'));

  // TEST F: TP Reachability & Minimum Remaining Potential
  console.log('\n--- TEST F: TP Expansion Potential ---');
  const lowPotential = validateTelegramSignalActionability(
    {
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryLow: 60000,
      entryHigh: 61000,
      stopLoss: 58000,
      targets: [{ price: 65000 }] // Only ~7.4% move
    },
    { symbol: 'BTCUSDT', lastPrice: 60500 }
  );
  assert('Reject Signals with Remaining Expansion < 25%', !lowPotential.isValid && !!lowPotential.rejectReason?.includes('INSUFFICIENT_REMAINING_EXPANSION'));

  // Valid actionable candidate
  const validActionable = validateTelegramSignalActionability(
    {
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryLow: 60000,
      entryHigh: 61000,
      stopLoss: 58000,
      targets: [{ price: 66000 }, { price: 72000 }, { price: 80000 }] // 32.2% move
    },
    { symbol: 'BTCUSDT', lastPrice: 60500 }
  );
  assert('Accept High-Conviction Actionable Candidate', validActionable.isValid, `Remaining: +${validActionable.remainingMovePct.toFixed(1)}%`);

  // TEST G & H: Chart Generation Buffer & Fresh Real Data
  console.log('\n--- TEST G & H: Professional Chart Buffer Generation ---');
  try {
    const chartBuffer = await generateOpportunityChartBuffer({
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryLow: 60000,
      entryHigh: 61000,
      currentPrice: freshData.ticker?.lastPrice || 60500,
      stopLoss: 58000,
      targets: [{ price: 66000 }, { price: 72000 }, { price: 80000 }],
      candles: freshData.candles
    });
    assert('Chart Buffer Rendered Successfully', chartBuffer !== null && chartBuffer.length > 5000, `Buffer size: ${chartBuffer?.length} bytes`);
  } catch (err: any) {
    assert('Chart Buffer Rendered Successfully', false, err?.message);
  }

  // TEST I: Telegram Format Message (Max 4 TPs & Clean HTML)
  console.log('\n--- TEST I: Telegram Message Formatting ---');
  const msg = formatTelegramAlertMessage({
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entryLow: 60000,
    entryHigh: 61000,
    currentPrice: 60500,
    stopLoss: 58000,
    targets: [
      { label: 'TP1', price: 66000, percentage: 9.1 },
      { label: 'TP2', price: 72000, percentage: 19.0 },
      { label: 'TP3', price: 80000, percentage: 32.2 },
      { label: 'TP4', price: 90000, percentage: 48.7 },
      { label: 'TP5', price: 100000, percentage: 65.3 } // 5th target should be truncated to 4
    ],
    qualityGrade: 'A+',
    confidence: 94,
    sourceType: 'COMPRESSION_BREAKOUT'
  });
  assert('Message Contains Symbol', msg.includes('BTCUSDT'));
  assert('Message Contains TP4', msg.includes('TP4'));
  assert('Message Limits TP ladder to max 4', !msg.includes('TP5'));
  assert('Message Contains No Leaked Markdown', !msg.includes('**') && !msg.includes('##'));

  // TEST J & K: Canonical Deduplication Fingerprint & Idempotency
  console.log('\n--- TEST J & K: Canonical Deduplication & Multi-Run Idempotency ---');
  const fp1 = calculateOpportunityFingerprint({
    symbol: 'SOLUSDT',
    direction: 'LONG',
    entryPrice: 150.00,
    entryLow: 149.50,
    entryHigh: 150.50,
    stopLoss: 140.00,
    targets: [{ price: 180 }, { price: 210 }],
    qualityGrade: 'A'
  });
  const fp2 = calculateOpportunityFingerprint({
    symbol: 'SOLUSDT',
    direction: 'LONG',
    entryPrice: 150.0049, // Minor sub-cent float jitter
    entryLow: 149.50,
    entryHigh: 150.50,
    stopLoss: 140.0001,
    targets: [{ price: 180.00 }, { price: 210.00 }],
    qualityGrade: 'A'
  });
  assert('Fingerprint Quantization Immune to Float Jitter', fp1 === fp2, `FP: ${fp1}`);

  console.log('\n================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed}/${total} TESTS PASSED (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
