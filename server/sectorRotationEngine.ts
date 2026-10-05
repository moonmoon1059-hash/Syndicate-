import { MarketSectorId, SectorPerformanceItem, SectorRotationAnalysis } from '../src/types/crypto';

// Mapping of assets to sectors (Non-exclusive where appropriate)
const SECTOR_MAPPINGS: Record<MarketSectorId, string[]> = {
  MAJORS: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT', 'NEARUSDT', 'SUIUSDT', 'TRXUSDT', 'TONUSDT', 'LTCUSDT', 'BCHUSDT'],
  ALTCOINS: ['UNIUSDT', 'AAVEUSDT', 'PENDLEUSDT', 'ARBUSDT', 'OPUSDT', 'MATICUSDT', 'FTMUSDT', 'ALGOUSDT', 'HBARUSDT', 'ICPUSDT', 'STXUSDT', 'INJUSDT', 'TIAUSDT', 'FETUSDT', 'RENDERUSDT', 'TAOUSDT', 'SEIUSDT', 'JUPUSDT', 'PYTHUSDT', 'ONDOUSDT', 'ENAUSDT', 'STRKUSDT', 'WLDUSDT', 'APTUSDT'],
  MEMES: ['DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'WIFUSDT', 'BONKUSDT', 'FLOKIUSDT', 'BOMEUSDT', 'MEWUSDT', 'POPCATUSDT', 'PENGUUSDT', 'ACTUSDT', 'PNUTUSDT', 'MOODENGUSDT', 'FARTCOINUSDT', 'TURBOUSDT', 'NEIROUSDT', 'BRETTUSDT', 'GOATUSDT'],
  HIGH_BETA: ['AI16ZUSDT', 'VIRTUALUSDT', 'SKYAIUSDT', 'TAOUSDT', 'RENDERUSDT', 'FETUSDT', 'WIFUSDT', 'POPCATUSDT', 'PEPEUSDT', 'PNUTUSDT'],
  NEW_LISTINGS: ['MOVEUSDT', 'ACXUSDT', 'ORCAUSDT', 'COWUSDT', 'CETUSUSDT', 'GRASSUSDT', 'DRIFTUSDT', 'IOUSDT', 'NOTUSDT', 'ZKUSDT', 'BLASTUSDT', 'LISTAUSDT', 'BBUSDT', 'REZUSDT', 'MAJORUSDT', 'THEUSDT', 'USUALUSDT'],
  DEFI: ['UNIUSDT', 'AAVEUSDT', 'PENDLEUSDT', 'JUPUSDT', 'ONDOUSDT', 'ENAUSDT', 'ORCAUSDT', 'COWUSDT', 'CETUSUSDT', 'INJUSDT', 'RUNEUSDT'],
  AI_DATA: ['RENDERUSDT', 'FETUSDT', 'TAOUSDT', 'NEARUSDT', 'WLDUSDT', 'VIRTUALUSDT', 'AI16ZUSDT', 'SKYAIUSDT', 'GRASSUSDT', 'IOUSDT'],
  L1_L2: ['SOLUSDT', 'ETHUSDT', 'BNBUSDT', 'AVAXUSDT', 'SUIUSDT', 'NEARUSDT', 'TONUSDT', 'APTUSDT', 'SEIUSDT', 'ARBUSDT', 'OPUSDT', 'MATICUSDT', 'STRKUSDT', 'ZKUSDT', 'BLASTUSDT']
};

export interface AssetMarketSnapshot {
  symbol: string;
  priceChange24h: number;
  volume24h: number;
  rvol?: number;
}

/**
 * PHASE 8: SECTOR ROTATION & CAPITAL FLOW ENGINE
 * 
 * Analyzes relative strength and capital flow migration across sectors.
 * Zero-bias invariant: small-caps, meme coins, and new listings are scored
 * purely by mathematical performance without artificial penalties or inflation.
 */
export function analyzeSectorRotation(
  assets: AssetMarketSnapshot[]
): SectorRotationAnalysis {
  const assetMap = new Map<string, AssetMarketSnapshot>();
  let totalMarketVolume = 0;

  for (const a of assets) {
    const cleanSym = a.symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    assetMap.set(cleanSym, a);
    totalMarketVolume += a.volume24h || 0;
  }

  const sectors: SectorPerformanceItem[] = [];
  const sectorIds: MarketSectorId[] = ['MAJORS', 'ALTCOINS', 'MEMES', 'HIGH_BETA', 'NEW_LISTINGS', 'DEFI', 'AI_DATA', 'L1_L2'];

  for (const sectorId of sectorIds) {
    const symbols = SECTOR_MAPPINGS[sectorId] || [];
    let matchedCount = 0;
    let sumChange = 0;
    let sumVolume = 0;
    let sumRvol = 0;
    const matchedAssets: { symbol: string; change: number; volume: number; rvol: number }[] = [];

    for (const sym of symbols) {
      const data = assetMap.get(sym);
      if (data) {
        matchedCount++;
        sumChange += data.priceChange24h || 0;
        sumVolume += data.volume24h || 0;
        sumRvol += data.rvol || 1.0;
        matchedAssets.push({
          symbol: sym,
          change: data.priceChange24h || 0,
          volume: data.volume24h || 0,
          rvol: data.rvol || 1.0
        });
      }
    }

    const avgChange = matchedCount > 0 ? sumChange / matchedCount : 0;
    const avgRvol = matchedCount > 0 ? sumRvol / matchedCount : 1.0;
    const volumeSharePct = totalMarketVolume > 0 ? (sumVolume / totalMarketVolume) * 100 : 0;

    // Relative strength calculation (Normalized 0-100)
    // Combines 24h momentum (50%) + RVOL surge (30%) + volume concentration (20%)
    const changeComponent = Math.min(100, Math.max(0, (avgChange + 10) * 3.5));
    const rvolComponent = Math.min(100, Math.max(0, avgRvol * 35));
    const volumeComponent = Math.min(100, volumeSharePct * 3);

    const relativeStrengthScore = Math.round(
      changeComponent * 0.5 + rvolComponent * 0.3 + volumeComponent * 0.2
    );

    // Inflow direction classification
    let flowDirection: SectorPerformanceItem['flowDirection'] = 'NEUTRAL';
    if (avgChange > 4 && avgRvol > 1.4) {
      flowDirection = 'INFLOW_ACCELERATING';
    } else if (avgChange > 1) {
      flowDirection = 'INFLOW_STABLE';
    } else if (avgChange < -4) {
      flowDirection = 'OUTFLOW_HEAVY';
    } else if (avgChange < -1) {
      flowDirection = 'OUTFLOW';
    }

    // Top leading assets in this sector
    matchedAssets.sort((a, b) => b.change - a.change);
    const leadingAssets = matchedAssets.slice(0, 3).map(a => a.symbol);

    sectors.push({
      sector: sectorId,
      name: formatSectorName(sectorId),
      relativeStrengthScore,
      flowDirection,
      volumeSharePct: parseFloat(volumeSharePct.toFixed(1)),
      avg24hChange: parseFloat(avgChange.toFixed(2)),
      leadingAssets,
      isLeadingRotation: false
    });
  }

  // Identify leading sector
  sectors.sort((a, b) => b.relativeStrengthScore - a.relativeStrengthScore);
  if (sectors.length > 0) {
    sectors[0].isLeadingRotation = true;
  }

  const activeLeader = sectors.length > 0 ? sectors[0].sector : 'MAJORS';

  // Rotation stage classification
  const leaderRS = sectors[0]?.relativeStrengthScore || 50;
  let rotationStage: SectorRotationAnalysis['rotationStage'] = 'EARLY_ACCUMULATION';
  if (leaderRS > 85 && sectors[0]?.avg24hChange > 12) {
    rotationStage = 'PARABOLIC_MATURE';
  } else if (leaderRS > 70) {
    rotationStage = 'ACCELERATING';
  } else if (leaderRS < 40) {
    rotationStage = 'DISTRIBUTION_ROTATING_OUT';
  } else {
    rotationStage = 'EARLY_ACCUMULATION';
  }

  // BTC to Alt Flow state determination
  const majorsSector = sectors.find(s => s.sector === 'MAJORS');
  const memeSector = sectors.find(s => s.sector === 'MEMES');
  const altSector = sectors.find(s => s.sector === 'ALTCOINS');

  let btcToAltFlowState: SectorRotationAnalysis['btcToAltFlowState'] = 'BTC_ACCUMULATION';
  if (memeSector && memeSector.relativeStrengthScore > 75 && memeSector.flowDirection === 'INFLOW_ACCELERATING') {
    btcToAltFlowState = 'MEME_MANIA';
  } else if (altSector && altSector.relativeStrengthScore > (majorsSector?.relativeStrengthScore || 50)) {
    btcToAltFlowState = 'ALT_SEASON_EARLY';
  } else if (majorsSector && majorsSector.flowDirection.startsWith('OUTFLOW')) {
    btcToAltFlowState = 'RISK_OFF_USDT';
  } else {
    btcToAltFlowState = 'BTC_ACCUMULATION';
  }

  const summary = `Capital flow rotation is currently led by ${formatSectorName(activeLeader)} (${sectors[0]?.avg24hChange > 0 ? '+' : ''}${sectors[0]?.avg24hChange}% avg change). Market flow state: ${btcToAltFlowState.replace(/_/g, ' ')}.`;

  return {
    activeRotationLeader: activeLeader,
    rotationStage,
    sectors,
    btcToAltFlowState,
    summary
  };
}

function formatSectorName(id: MarketSectorId): string {
  switch (id) {
    case 'MAJORS': return 'Layer-1 Majors';
    case 'ALTCOINS': return 'Mid-Cap Alts';
    case 'MEMES': return 'Meme & High-Beta';
    case 'HIGH_BETA': return 'AI & High-Beta';
    case 'NEW_LISTINGS': return 'Recent Listings';
    case 'DEFI': return 'DeFi Bluechips';
    case 'AI_DATA': return 'AI & DePIN';
    case 'L1_L2': return 'L1 & L2 Ecosystem';
    default: return id;
  }
}
