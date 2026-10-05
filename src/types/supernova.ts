export type SupernovaPhase = 'PRE_IGNITION' | 'ROCKET_PUMP' | 'PRE_COLLAPSE' | 'CLIMAX_COLLAPSE';

export interface SupernovaCandidate {
  id: string;
  symbol: string;
  baseAsset: string;
  phase: SupernovaPhase;
  direction: 'LONG' | 'SHORT';
  isSupernova: boolean;
  rvol: number;
  oiSurgePct: number;
  fundingRatePct: number;
  liquidityVacuum: boolean;
  maxPotentialPct: number;
  reasons: string[];
  badge: string;
  badgeStyle: 'GOLD' | 'CRIMSON' | 'CYAN';
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp4?: number;
  currentPrice: number;
  score: number;
  timestamp: number;
  rsi?: number;
  change24h?: number;
  peakWick?: number;
  executionLabel: string;
}
