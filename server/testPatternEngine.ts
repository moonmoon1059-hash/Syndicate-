import { Candle } from './cryptoService';
import {
  findSwingPoints,
  runComprehensivePatternEngine,
  detectDoubleBottom,
  detectDoubleTop,
  detectHeadAndShoulders,
  detectInverseHeadAndShoulders,
  detectAscendingTriangle,
  detectDescendingTriangle,
  detectSymmetricalTriangle,
  detectRisingWedge,
  detectFallingWedge,
  detectBullFlag,
  detectBearFlag,
  detectBullPennant,
  detectBearPennant,
  detectCupAndHandle,
  detectInverseCupAndHandle,
  detectRoundingBottom,
  detectRoundingTop,
  detectBroadeningFormation,
  detectDiamondTop,
  detectDiamondBottom,
  detectRectangle,
  detectRisingChannel,
  detectFallingChannel,
  detectTripleTop,
  detectTripleBottom
} from './patternEngine';
import { calculateATR } from './technicalAnalysis';

function makeCandles(prices: number[], baseVol: number = 1000, breakoutVol: number = 1000): Candle[] {
  const baseTime = 1700000000000;
  return prices.map((price, i) => {
    const isBreakout = i === prices.length - 1;
    const vol = isBreakout ? breakoutVol : baseVol;
    const prev = i > 0 ? prices[i - 1] : price;
    const open = prev;
    const close = price;
    const high = Math.max(open, close) + Math.abs(close - open) * 0.2 + 0.5;
    const low = Math.min(open, close) - Math.abs(close - open) * 0.2 - 0.5;
    return {
      timestamp: baseTime + i * 3600000,
      open,
      high,
      low,
      close,
      volume: vol
    };
  });
}

function runTests() {
  console.log('=== MOONSCANNER CHART PATTERN ENGINE TEST SUITE ===\n');
  let passed = 0;
  let total = 0;

  function assert(name: string, condition: boolean, details?: string) {
    total++;
    if (condition) {
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${name} - Details: ${details || 'Condition false'}`);
    }
  }

  // 1. Insufficient Candles Test (False Positive Protection)
  {
    const shortCandles = makeCandles([100, 101, 102, 103, 104]);
    const res = runComprehensivePatternEngine(shortCandles);
    assert('Insufficient Candle Rejection', res.detected === false && res.confidence === 0);
  }

  // 2. Double Bottom Synthetic Test
  {
    // W Formation: Start high, drop to L1=100, rise to Peak=115, drop to L2=100.5, breakout past 115 to 118
    const prices: number[] = [];
    for (let i = 0; i < 6; i++) prices.push(115 - i * 2.5); // Down to 100
    prices.push(100); // L1
    for (let i = 1; i <= 5; i++) prices.push(100 + i * 3); // Up to 115 (Peak)
    for (let i = 1; i <= 5; i++) prices.push(115 - i * 2.9); // Down to ~100.5 (L2)
    for (let i = 1; i <= 6; i++) prices.push(100.5 + i * 3.2); // Breakout to 119.7
    const candles = makeCandles(prices, 1000, 3000); // Volume surge on breakout
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const swings = findSwingPoints(candles, 3, 2);
    const db = detectDoubleBottom(candles, swings, atr);
    assert('Double Bottom Detection', db !== null && db.name === 'DOUBLE_BOTTOM' && db.type === 'BULLISH', `Got: ${db?.name}`);
    assert('Double Bottom Breakout Confirmed', db?.breakoutStatus === 'BROKEN_OUT' || db?.breakoutStatus === 'CONFIRMED');
    assert('Double Bottom Dynamic Targets Generated', Array.isArray(db?.keyLevels.targets) && db!.keyLevels.targets!.length >= 3);
  }

  // 3. Double Top Synthetic Test
  {
    // M Formation: Rise to H1=120, drop to Valley=105, rise to H2=119.5, breakdown past 105 to 102
    const prices: number[] = [];
    for (let i = 0; i < 6; i++) prices.push(105 + i * 2.5); // Up to 120
    prices.push(120); // H1
    for (let i = 1; i <= 5; i++) prices.push(120 - i * 3); // Down to 105 (Valley)
    for (let i = 1; i <= 5; i++) prices.push(105 + i * 2.9); // Up to ~119.5 (H2)
    for (let i = 1; i <= 6; i++) prices.push(119.5 - i * 3.2); // Breakdown to 100.3
    const candles = makeCandles(prices, 1000, 2500);
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const swings = findSwingPoints(candles, 3, 2);
    const dt = detectDoubleTop(candles, swings, atr);
    assert('Double Top Detection', dt !== null && dt.name === 'DOUBLE_TOP' && dt.type === 'BEARISH', `Got: ${dt?.name}`);
    assert('Double Top Invalidation Level Defined', dt !== null && dt.invalidationPrice! > 120);
  }

  // 4. Head and Shoulders Synthetic Test
  {
    // LS=115, T1=105, Head=128, T2=105, RS=114, Breakdown below 105
    const prices: number[] = [];
    // Up to LS
    for (let i = 0; i < 5; i++) prices.push(100 + i * 3);
    prices.push(115); // LS
    // Down to T1
    for (let i = 1; i <= 4; i++) prices.push(115 - i * 2.5);
    prices.push(105); // T1
    // Up to Head
    for (let i = 1; i <= 5; i++) prices.push(105 + i * 4.6);
    prices.push(128); // Head
    // Down to T2
    for (let i = 1; i <= 5; i++) prices.push(128 - i * 4.6);
    prices.push(105); // T2
    // Up to RS
    for (let i = 1; i <= 4; i++) prices.push(105 + i * 2.25);
    prices.push(114); // RS
    // Breakdown below neckline 105
    for (let i = 1; i <= 5; i++) prices.push(114 - i * 3);
    const candles = makeCandles(prices, 1000, 3000);
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const swings = findSwingPoints(candles, 3, 2);
    const hs = detectHeadAndShoulders(candles, swings, atr);
    assert('Head & Shoulders Detection', hs !== null && hs.name === 'HEAD_AND_SHOULDERS' && hs.type === 'BEARISH', `Got: ${hs?.name}`);
  }

  // 5. Inverse Head and Shoulders Synthetic Test
  {
    // LS=90, C1=100, Head=78, C2=100, RS=91, Breakout above 100
    const prices: number[] = [];
    for (let i = 0; i < 5; i++) prices.push(105 - i * 3);
    prices.push(90); // LS
    for (let i = 1; i <= 4; i++) prices.push(90 + i * 2.5);
    prices.push(100); // C1
    for (let i = 1; i <= 5; i++) prices.push(100 - i * 4.4);
    prices.push(78); // Head
    for (let i = 1; i <= 5; i++) prices.push(78 + i * 4.4);
    prices.push(100); // C2
    for (let i = 1; i <= 4; i++) prices.push(100 - i * 2.25);
    prices.push(91); // RS
    for (let i = 1; i <= 5; i++) prices.push(91 + i * 3.2);
    const candles = makeCandles(prices, 1000, 3000);
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const swings = findSwingPoints(candles, 3, 2);
    const ihs = detectInverseHeadAndShoulders(candles, swings, atr);
    assert('Inverse Head & Shoulders Detection', ihs !== null && ihs.name === 'INVERSE_HEAD_AND_SHOULDERS' && ihs.type === 'BULLISH', `Got: ${ihs?.name}`);
  }

  // 6. Ascending Triangle Test
  {
    // Flat highs at 120, rising lows 100 -> 106 -> 112 -> 116, breakout to 123
    const prices: number[] = [
      95, 100, 110, 120, // H1
      112, 106, // L1
      114, 120.2, // H2
      115, 112, // L2
      118, 120.1, // H3
      117, 116, // L3
      119, 123 // Breakout
    ];
    const candles = makeCandles(prices, 1000, 3000);
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const swings = findSwingPoints(candles, 2, 1);
    const at = detectAscendingTriangle(candles, swings, atr);
    assert('Ascending Triangle Detection', at !== null && at.name === 'ASCENDING_TRIANGLE' && at.type === 'BULLISH', `Got: ${at?.name}`);
  }

  // 7. Descending Triangle Test
  {
    // Flat lows at 80, falling highs 100 -> 94 -> 88 -> 84, breakdown to 77
    const prices: number[] = [
      105, 100, // H1
      90, 80, // L1
      88, 94, // H2
      87, 80.2, // L2
      85, 88, // H3
      83, 79.9, // L3
      81, 76 // Breakdown
    ];
    const candles = makeCandles(prices, 1000, 3000);
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const swings = findSwingPoints(candles, 2, 1);
    const dt = detectDescendingTriangle(candles, swings, atr);
    assert('Descending Triangle Detection', dt !== null && dt.name === 'DESCENDING_TRIANGLE' && dt.type === 'BEARISH', `Got: ${dt?.name}`);
  }

  // 8. Bull Flag Test
  {
    // Pole from 100 to 130 (Gain=30), followed by 8 bars of gentle downward consolidation 129 -> 126, then breakout to 132
    const prices: number[] = [];
    // Base
    for (let i = 0; i < 5; i++) prices.push(100 + i);
    // Pole
    for (let i = 1; i <= 10; i++) prices.push(104 + i * 2.6); // Reaches 130
    // Flag channel
    prices.push(129, 128, 127.5, 128, 127, 126.5, 127, 133); // Breakout
    const candles = makeCandles(prices, 1000, 3500);
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const bf = detectBullFlag(candles, atr);
    assert('Bull Flag Detection', bf !== null && bf.name === 'BULL_FLAG' && bf.type === 'BULLISH', `Got: ${bf?.name}`);
  }

  // 9. Bear Flag Test
  {
    // Pole from 130 down to 100 (Drop=30), gentle upward consolidation 101 -> 104, breakdown to 96
    const prices: number[] = [];
    for (let i = 0; i < 5; i++) prices.push(130 - i);
    for (let i = 1; i <= 10; i++) prices.push(126 - i * 2.6); // Reaches 100
    prices.push(101, 102, 102.5, 102, 103, 103.5, 103, 95); // Breakdown
    const candles = makeCandles(prices, 1000, 3500);
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const bf = detectBearFlag(candles, atr);
    assert('Bear Flag Detection', bf !== null && bf.name === 'BEAR_FLAG' && bf.type === 'BEARISH', `Got: ${bf?.name}`);
  }

  // 10. Cup and Handle Test
  {
    // Uptrend, left rim=120, rounded bottom down to 100 and back to 120, shallow handle to 116, breakout to 124
    const prices: number[] = [];
    for (let i = 0; i < 6; i++) prices.push(110 + i * 2); // 120 left rim
    for (let i = 1; i <= 10; i++) prices.push(120 - Math.sin((i / 10) * Math.PI) * 20); // U shape
    for (let i = 0; i < 6; i++) prices.push(118 + i * 0.4); // 120 right rim
    prices.push(119, 118, 117, 116.5, 118, 125); // Handle & breakout
    const candles = makeCandles(prices, 1000, 3000);
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const swings = findSwingPoints(candles, 2, 1);
    const ch = detectCupAndHandle(candles, swings, atr);
    assert('Cup & Handle Detection', ch !== null && ch.name === 'CUP_AND_HANDLE' && ch.type === 'BULLISH', `Got: ${ch?.name}`);
  }

  // 11. Falling Wedge Test
  {
    // Descending highs: 130, 122, 115; Descending lows: 110, 105, 102 (converging downward)
    const prices = [
      135, 130, // H1
      120, 110, // L1
      118, 122, // H2
      112, 105, // L2
      110, 115, // H3
      108, 102, // L3
      107, 118 // Breakout above falling wedge
    ];
    const candles = makeCandles(prices, 1000, 3000);
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const swings = findSwingPoints(candles, 2, 1);
    const fw = detectFallingWedge(candles, swings, atr);
    assert('Falling Wedge Detection', fw !== null && fw.name === 'FALLING_WEDGE' && fw.type === 'BULLISH', `Got: ${fw?.name}`);
  }

  // 12. Rising Wedge Test
  {
    // Ascending highs: 100, 106, 110; Steeper ascending lows: 85, 94, 102 (converging upward)
    const prices = [
      80, 82, 85, 90, 95, 100, // L1 -> H1
      96, 93, 91, 94, // L2
      98, 102, 106, // H2
      103, 100, 102, // L3
      105, 108, 110, // H3
      107, 104, 98 // Breakdown below rising wedge
    ];
    const candles = makeCandles(prices, 1000, 3000);
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const swings = findSwingPoints(candles, 2, 1);
    const rw = detectRisingWedge(candles, swings, atr);
    assert('Rising Wedge Detection', rw !== null && rw.name === 'RISING_WEDGE' && rw.type === 'BEARISH', `Got: ${rw?.name}`);
  }

  // 13. Triple Top Test
  {
    const prices = [
      95, 100, 120, // H1
      112, 105, // V1
      115, 120.2, // H2
      112, 104.8, // V2
      115, 119.8, // H3
      110, 101 // Breakdown below 105
    ];
    const candles = makeCandles(prices, 1000, 3000);
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const swings = findSwingPoints(candles, 2, 1);
    const tt = detectTripleTop(candles, swings, atr);
    assert('Triple Top Detection', tt !== null && tt.name === 'TRIPLE_TOP' && tt.type === 'BEARISH', `Got: ${tt?.name}`);
  }

  // 14. Triple Bottom Test
  {
    const prices = [
      125, 115, 95, // L1
      102, 110, // P1
      100, 95.2, // L2
      104, 110.1, // P2
      100, 95.1, // L3
      105, 115 // Breakout above 110
    ];
    const candles = makeCandles(prices, 1000, 3000);
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const swings = findSwingPoints(candles, 2, 1);
    const tb = detectTripleBottom(candles, swings, atr);
    assert('Triple Bottom Detection', tb !== null && tb.name === 'TRIPLE_BOTTOM' && tb.type === 'BULLISH', `Got: ${tb?.name}`);
  }

  // 15. Rounding Bottom Test
  {
    const prices: number[] = [];
    for (let i = 0; i < 7; i++) prices.push(115);
    for (let i = 0; i < 21; i++) prices.push(115 - Math.sin((i / 20) * Math.PI) * 25);
    for (let i = 0; i < 7; i++) prices.push(115 + i * 1.5);
    const candles = makeCandles(prices, 1000, 2500);
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const rb = detectRoundingBottom(candles, atr);
    assert('Rounding Bottom (Saucer) Detection', rb !== null && rb.name === 'ROUNDING_BOTTOM' && rb.type === 'BULLISH', `Got: ${rb?.name}`);
  }

  // 16. Symmetrical Triangle Test
  {
    const prices = [
      100, 130, // H1
      115, 95, // L1
      110, 122, // H2
      112, 102, // L2
      108, 116, // H3
      111, 107, // L3
      112, 125 // Breakout
    ];
    const candles = makeCandles(prices, 1000, 3000);
    const atr = calculateATR(candles, 14)[candles.length - 1];
    const swings = findSwingPoints(candles, 2, 1);
    const st = detectSymmetricalTriangle(candles, swings, atr);
    assert('Symmetrical Triangle Detection', st !== null && st.name === 'SYMMETRICAL_TRIANGLE', `Got: ${st?.name}`);
  }

  console.log(`\n==============================================`);
  console.log(`TEST RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log(`==============================================\n`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
