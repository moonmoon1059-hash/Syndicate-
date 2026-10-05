import React from 'react';
import { ExternalLink, TrendingUp, TrendingDown, Zap, Shield, Eye, Flame, ShieldAlert, Rocket, Clock, CheckCircle2, Target } from 'lucide-react';

export type SyndicateTier = 'VALID' | 'CONFLUENCE' | 'OBSERVE';
export type SyndicateDirection = 'LONG' | 'SHORT';
export type SyndicateExecutionMode =
  | '🚀 IMPULSE EXECUTION (NO RETEST)'
  | '⚡ ENTRY NOW'
  | '⏳ WAIT FOR RETEST'
  | '⏳ WAIT FOR RETEST / PULLBACK'
  | '✅ RETEST CONFIRMED'
  | '⏳ PULLBACK RELIEF (WAIT FOR REJECTION WICK)'
  | '🎯 BUY THE RETEST DIP'
  | '🔥 SFP RECLAIM (LIQUIDITY HUNT COMPLETED)';

export interface SyndicateCandidate {
  id: string;
  symbol: string;
  baseAsset: string;
  direction: SyndicateDirection;
  markPrice: number;
  score: number;
  tier: SyndicateTier;
  executionMode?: SyndicateExecutionMode;
  executionLabel?: string;
  executionGuidance?: string;
  entryZone?: string;
  pullbackShelfPrice?: number;
  volMultiplier: number;
  change15m: number;
  change1h: number;
  change24h: number;
  fundingFeePct: number;
  supportDistPct: number;
  resistDistPct: number;
  oiDeltaPct?: number;
  takerBuyRatio?: number;
  slPrice?: number;
  slPercent?: number;
  recLeverage?: string;
  leverageBadge?: string;
  swingBase?: number;
  atrBuffer?: number;
  target1?: { price: number; percent: number };
  target2?: { price: number; percent: number };
  target1Price?: number;
  target1Percent?: number;
  target2Price?: number;
  target2Percent?: number;
  btcMacroSafe?: boolean;
  btcRsi15m?: number;
  high24h?: number;
  low24h?: number;
  quoteVolume24h?: number;
  reasons: string[];
  timestamp: number;
  scanTimeFormatted: string;
  binanceUrl: string;
}

interface SyndicateCardProps {
  candidate: SyndicateCandidate;
  onSelect?: (candidate: SyndicateCandidate) => void;
}

export const SyndicateCard: React.FC<SyndicateCardProps> = ({ candidate, onSelect }) => {
  const isLong = candidate.direction === 'LONG';
  const isValid = candidate.tier === 'VALID';
  const isConfluence = candidate.tier === 'CONFLUENCE';

  // Institutional Dynamic Expansion Targets
  const target1P = candidate.target1?.price ?? candidate.target1Price ?? (
    isLong
      ? candidate.markPrice + Math.max(candidate.markPrice * 0.03, (candidate.markPrice - (candidate.slPrice || candidate.markPrice * 0.94)) * 1.8)
      : candidate.markPrice - Math.max(candidate.markPrice * 0.03, ((candidate.slPrice || candidate.markPrice * 1.06) - candidate.markPrice) * 1.8)
  );
  const target1Pct = candidate.target1?.percent ?? candidate.target1Percent ?? (
    isLong
      ? ((target1P - candidate.markPrice) / candidate.markPrice) * 100
      : ((candidate.markPrice - target1P) / candidate.markPrice) * 100
  );

  const target2P = candidate.target2?.price ?? candidate.target2Price ?? (
    isLong
      ? candidate.markPrice + Math.max(candidate.markPrice * 0.06, (candidate.markPrice - (candidate.slPrice || candidate.markPrice * 0.94)) * 3.5)
      : candidate.markPrice - Math.max(candidate.markPrice * 0.06, ((candidate.slPrice || candidate.markPrice * 1.06) - candidate.markPrice) * 3.5)
  );
  const target2Pct = candidate.target2?.percent ?? candidate.target2Percent ?? (
    isLong
      ? ((target2P - candidate.markPrice) / candidate.markPrice) * 100
      : ((candidate.markPrice - target2P) / candidate.markPrice) * 100
  );

  // Format mark price intelligently
  const formatPrice = (p: number): string => {
    if (!p || isNaN(p)) return '0.00';
    if (p < 0.0001) return p.toFixed(8);
    if (p < 0.01) return p.toFixed(6);
    if (p < 1) return p.toFixed(4);
    if (p < 10) return p.toFixed(3);
    if (p < 1000) return p.toFixed(2);
    return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) return;
    if (onSelect) {
      onSelect(candidate);
    } else {
      window.open(candidate.binanceUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Card theme styling according to tier strictly matching reference image 25225.jpg
  const cardBorder = isValid
    ? 'border-emerald-500/50 hover:border-emerald-400 shadow-lg shadow-emerald-950/20 bg-gradient-to-b from-[#0E131C] to-[#0A1017]'
    : isConfluence
    ? 'border-amber-500/40 hover:border-amber-400 shadow-md shadow-amber-950/10 bg-[#0D1119]'
    : 'border-slate-800/80 hover:border-slate-700 bg-[#0A0E16] opacity-90 hover:opacity-100';

  // Score pill styling
  const scoreBadgeStyle = isValid
    ? 'border-emerald-500/50 bg-emerald-950/80 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
    : isConfluence
    ? 'border-amber-500/50 bg-amber-950/80 text-amber-300'
    : 'border-slate-700 bg-slate-800/80 text-slate-400';

  // Action Badge styling
  const actionBadgeStyle = isValid
    ? 'border-emerald-400/90 bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
    : isConfluence
    ? 'border-amber-400/80 bg-amber-500/20 text-amber-300'
    : 'border-rose-800/60 bg-rose-950/30 text-rose-400';

  // Funding fee text color
  const fundingColor = candidate.fundingFeePct < 0
    ? 'text-emerald-400'
    : candidate.fundingFeePct > 0.02
    ? 'text-rose-400'
    : 'text-slate-300';

  // Execution Mode pill style & icon
  const executionLabel = candidate.executionLabel || (candidate.volMultiplier >= 5.5 ? '🚀 IMPULSE ENTRY' : '⚡ ENTRY NOW');
  const isSFPReclaim = executionLabel.includes('SFP RECLAIM');
  const isImpulse = executionLabel.includes('IMPULSE');
  const isRetestWait = executionLabel.includes('WAIT FOR RETEST');
  const isRetestConfirmed = executionLabel.includes('RETEST CONFIRMED');
  const isPullbackRelief = executionLabel.includes('PULLBACK RELIEF');
  const isRetestDip = executionLabel.includes('RETEST DIP');

  const executionBadgeStyle = isSFPReclaim
    ? 'border-amber-400 bg-gradient-to-r from-amber-950/90 via-orange-950/80 to-rose-950/90 text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.4)] ring-1 ring-amber-400/50 font-black animate-pulse'
    : isImpulse
    ? 'border-cyan-400/80 bg-cyan-950/70 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)] animate-pulse'
    : isRetestDip
    ? 'border-cyan-400 bg-cyan-950/80 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.35)] ring-1 ring-cyan-500/40 font-bold'
    : isPullbackRelief
    ? 'border-amber-500/80 bg-amber-950/80 text-amber-300 ring-1 ring-amber-500/30'
    : isRetestWait
    ? 'border-amber-500/80 bg-amber-950/70 text-amber-300'
    : isRetestConfirmed
    ? 'border-emerald-400/80 bg-emerald-950/70 text-emerald-300'
    : 'border-emerald-500/60 bg-emerald-950/50 text-emerald-300';

  return (
    <div
      onClick={handleCardClick}
      className={`group relative rounded-2xl border p-4 sm:p-5 transition-all duration-200 cursor-pointer flex flex-col justify-between select-none ${cardBorder}`}
    >
      {/* Subtle Glowing Header Ambient Accent on VALID */}
      {isValid && (
        <div className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
      )}

      <div>
        {/* 1) TOP BAR: Funding Fee Badge + Scan Timestamp */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800/60 text-xs">
          <div className="flex items-center gap-1.5 font-mono">
            <span className="text-slate-400">Funding Fee (Current)</span>
            <span className={`font-semibold ${fundingColor}`}>
              {candidate.fundingFeePct >= 0 ? '+' : ''}
              {candidate.fundingFeePct.toFixed(4)}%
            </span>
          </div>

          <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
            <span>{candidate.scanTimeFormatted}</span>
          </div>
        </div>

        {/* 2) COIN HEADER: Icon, Symbol, Mark Price & Score Pill */}
        <div className="flex items-start justify-between gap-3 pt-3.5 pb-3">
          <div className="flex items-center gap-3">
            {/* Clean Monogram Icon */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm select-none border ${
              isLong
                ? 'bg-emerald-950/60 border-emerald-700/40 text-emerald-400'
                : 'bg-rose-950/60 border-rose-700/40 text-rose-400'
            }`}>
              {candidate.baseAsset.slice(0, 3)}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-black text-white tracking-tight group-hover:text-cyan-300 transition-colors">
                  {candidate.symbol}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-0.5 ${
                  isLong ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}>
                  {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {candidate.direction}
                </span>
              </div>
              <div className="text-sm font-mono font-bold text-slate-200 mt-0.5">
                ${formatPrice(candidate.markPrice)}
              </div>
            </div>
          </div>

          {/* 3) SCORE PILL (Top-Right): e.g. 109/100 */}
          <div className={`px-2.5 py-1 rounded-lg border font-mono text-xs font-bold tracking-tight select-none ${scoreBadgeStyle}`}>
            {candidate.score}/100
          </div>
        </div>

        {/* 4) ACTION BADGE & VOLUME MULTIPLIER */}
        <div className="flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl bg-slate-950/70 border border-slate-800/80 my-2">
          {/* Action Badge */}
          <div className={`px-3 py-1 rounded-md border text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${actionBadgeStyle}`}>
            {isValid && <Flame className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />}
            {isConfluence && <Shield className="w-3.5 h-3.5 text-amber-400" />}
            {!isValid && !isConfluence && <Eye className="w-3.5 h-3.5 text-rose-400" />}
            <span>{candidate.tier}</span>
          </div>

          {/* 5) Volume Multiplier: ⚡ Vol 4.12x */}
          <div className="flex items-center gap-1 text-xs font-mono font-black">
            <Zap className={`w-3.5 h-3.5 ${isValid ? 'text-emerald-400 fill-emerald-400' : 'text-amber-400 fill-amber-400'}`} />
            <span className={isValid ? 'text-emerald-300 text-sm' : isConfluence ? 'text-amber-300 text-sm' : 'text-slate-300'}>
              Vol {candidate.volMultiplier.toFixed(2)}x
            </span>
          </div>
        </div>

        {/* 5b) DUAL-MODE SMART ENTRY BADGE & OPTIMAL ENTRY ZONE */}
        <div className="my-2.5 p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Execution Mode</span>
            <div className={`px-2 py-0.5 rounded-md border text-[11px] font-black uppercase tracking-tight flex items-center gap-1 font-mono ${executionBadgeStyle}`}>
              {isSFPReclaim && <Flame className="w-3 h-3 text-amber-400 fill-amber-400 animate-bounce" />}
              {!isSFPReclaim && isImpulse && <Rocket className="w-3 h-3 text-cyan-400" />}
              {!isSFPReclaim && isRetestDip && <Target className="w-3 h-3 text-cyan-400" />}
              {!isSFPReclaim && isPullbackRelief && !isRetestDip && <Clock className="w-3 h-3 text-amber-400" />}
              {!isSFPReclaim && isRetestWait && !isPullbackRelief && !isRetestDip && <Clock className="w-3 h-3 text-amber-400" />}
              {!isSFPReclaim && isRetestConfirmed && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
              {!isSFPReclaim && !isImpulse && !isRetestWait && !isRetestConfirmed && !isPullbackRelief && !isRetestDip && <Zap className="w-3 h-3 text-emerald-400" />}
              <span>{executionLabel}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-slate-800/50">
            <span className="text-slate-400 text-[11px]">Optimal Entry:</span>
            <span className="font-bold text-cyan-300 text-[11px]">
              {candidate.entryZone || (isLong
                ? `$${formatPrice(candidate.markPrice)} - $${formatPrice(candidate.markPrice * 1.01)} (+1.0%)`
                : `$${formatPrice(candidate.markPrice * 0.99)} - $${formatPrice(candidate.markPrice)} (-1.0%)`)}
            </span>
          </div>

          {/* Dynamic Expansion Roadmap Row */}
          <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-slate-800/40 text-[10px]">
            <span className="flex items-center gap-1">
              <span>🎯</span>
              <span className="text-slate-400">Primary:</span>
              <span className="font-bold text-emerald-400">${formatPrice(target1P)}</span>
              <span className={isLong ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>({isLong ? '+' : '-'}{target1Pct.toFixed(1)}%)</span>
            </span>
            <span className="flex items-center gap-1">
              <span>🚀</span>
              <span className="text-slate-400">Macro:</span>
              <span className="font-bold text-amber-300">${formatPrice(target2P)}</span>
              <span className={isLong ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>({isLong ? '+' : '-'}{target2Pct.toFixed(1)}%)</span>
            </span>
          </div>

          {candidate.executionGuidance && (
            <p className={`text-[10px] leading-tight pt-0.5 ${isSFPReclaim ? 'text-amber-300 font-mono font-bold' : isRetestDip ? 'text-cyan-300 font-mono font-medium' : 'text-slate-400 italic'}`}>
              [ {candidate.executionGuidance} ]
            </p>
          )}
        </div>

        {/* 6) MOMENTUM TELEMETRY: Two-Column Grid */}
        <div className="grid grid-cols-2 gap-2 my-2">
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/60 flex flex-col">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">15m Change</span>
            <span className={`text-xs sm:text-sm font-mono font-bold mt-0.5 ${
              candidate.change15m >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {candidate.change15m >= 0 ? '+' : ''}{candidate.change15m.toFixed(2)}%
            </span>
          </div>

          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/60 flex flex-col">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">1h Change</span>
            <span className={`text-xs sm:text-sm font-mono font-bold mt-0.5 ${
              candidate.change1h >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {candidate.change1h >= 0 ? '+' : ''}{candidate.change1h.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* 7) STRUCTURAL PROXIMITY: Support Dist & Resist Dist */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/60 flex flex-col">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Support Dist</span>
            <span className="text-xs sm:text-sm font-mono font-bold text-slate-200 mt-0.5">
              {candidate.supportDistPct.toFixed(2)}%
            </span>
          </div>

          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/60 flex flex-col">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Resist Dist</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-xs sm:text-sm font-mono font-bold ${
                candidate.resistDistPct === 0 ? 'text-emerald-400 font-black' : 'text-slate-200'
              }`}>
                {candidate.resistDistPct.toFixed(2)}%
              </span>
              {candidate.resistDistPct === 0 && (
                <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 uppercase">
                  Cleared
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 8) INSTITUTIONAL CONFLUENCE: Whale OI Delta & Taker CVD Flow */}
        {(candidate.oiDeltaPct !== undefined || candidate.takerBuyRatio !== undefined) && (
          <div className="grid grid-cols-2 gap-2 mb-2 text-[11px] font-mono">
            <div className="bg-slate-950/70 rounded-xl px-2.5 py-1.5 border border-slate-800/60 flex items-center justify-between">
              <span className="text-slate-400 text-[10px]">Whale OI</span>
              <span className={`font-bold ${
                (candidate.oiDeltaPct || 0) >= 10 ? 'text-emerald-400' : (candidate.oiDeltaPct || 0) < 0 ? 'text-rose-400' : 'text-slate-300'
              }`}>
                {(candidate.oiDeltaPct || 0) >= 0 ? '+' : ''}{(candidate.oiDeltaPct || 0).toFixed(1)}%
              </span>
            </div>

            <div className="bg-slate-950/70 rounded-xl px-2.5 py-1.5 border border-slate-800/60 flex items-center justify-between">
              <span className="text-slate-400 text-[10px]">Taker CVD</span>
              <span className={`font-bold ${
                (candidate.takerBuyRatio || 50) >= 58 ? 'text-emerald-400' : (candidate.takerBuyRatio || 50) <= 42 ? 'text-rose-400' : 'text-slate-300'
              }`}>
                {(candidate.takerBuyRatio || 50).toFixed(1)}% {(candidate.takerBuyRatio || 50) >= 50 ? 'Buy' : 'Sell'}
              </span>
            </div>
          </div>
        )}

        {/* 8.5) DYNAMIC STRUCTURAL EXPANSION TARGETS (MINIMUM & MACRO RUNNER PROJECTIONS) */}
        <div className="mb-2 px-3 py-2 rounded-xl bg-slate-950/90 border border-cyan-500/30 flex items-center justify-between gap-2 text-xs font-mono shadow-sm">
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs truncate">
            <span className="shrink-0 text-cyan-400">🎯</span>
            <span className="text-cyan-300 font-bold truncate">Primary Target:</span>
            <span className="font-bold text-emerald-400 font-mono">
              ${formatPrice(target1P)} <span className={isLong ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>({isLong ? '+' : '-'}{target1Pct.toFixed(1)}%)</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs shrink-0">
            <span className="shrink-0 text-purple-400">🚀</span>
            <span className="text-purple-300 font-bold">Macro Target:</span>
            <span className="font-bold text-amber-300 font-mono">
              ${formatPrice(target2P)} <span className={isLong ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>({isLong ? '+' : '-'}{target2Pct.toFixed(1)}%)</span>
            </span>
          </div>
        </div>

        {/* 9) TRUE STRUCTURAL INVALIDATION FLOOR (SL) & RISK-ADAPTIVE LEVERAGE GUIDANCE */}
        {candidate.slPrice && candidate.slPercent !== undefined && (
          <div className="mb-2.5 px-3 py-2 rounded-xl bg-slate-950/90 border border-rose-500/30 flex flex-col gap-1.5 text-xs font-mono shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[11px] sm:text-xs">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Structural Invalidation: ${formatPrice(candidate.slPrice)} (-{candidate.slPercent.toFixed(2)}%)</span>
              </div>
              <div className="shrink-0">
                {candidate.slPercent <= 4.0 ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border border-emerald-500/50 bg-emerald-950/80 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                    ⚡ Lev: 7x-10x
                  </span>
                ) : candidate.slPercent <= 7.5 ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border border-amber-500/50 bg-amber-950/80 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.25)]">
                    🛡️ Lev: 4x-5x
                  </span>
                ) : candidate.slPercent <= 13.0 ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border border-purple-500/50 bg-purple-950/80 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.25)]">
                    ⚠️ Lev: 2x-3x
                  </span>
                ) : candidate.slPercent <= 14.0 ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border border-purple-500/50 bg-purple-950/80 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.25)]">
                    ⚠️ Lev: 1x-2x
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border border-rose-500/50 bg-rose-950/80 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.25)]">
                    🛑 Risk &gt; 14%
                  </span>
                )}
              </div>
            </div>

            <div className="text-[10px] font-mono text-slate-400 border-t border-rose-500/10 pt-1 flex items-center justify-between">
              <span className="truncate">
                Structure Anchor: <strong className="text-slate-200">${formatPrice(candidate.swingBase !== undefined && candidate.swingBase > 0 ? candidate.swingBase : (isLong ? candidate.slPrice * 1.008 : candidate.slPrice * 0.992))}</strong> + Volatility Buffer
              </span>
              <span className="text-[9px] text-cyan-400/90 font-mono shrink-0 pl-1">
                {candidate.recLeverage ? candidate.recLeverage.split('(')[1]?.replace(')', '') : (candidate.slPercent <= 4.0 ? 'Tight Base' : candidate.slPercent <= 7.5 ? 'Altcoin Base' : candidate.slPercent <= 14.0 ? 'Meme Base' : 'Disqualified')}
              </span>
            </div>
          </div>
        )}

        {/* Whale Thesis Reasons */}
        {candidate.reasons && candidate.reasons.length > 0 && (
          <div className="space-y-1 mb-3 pt-1 border-t border-slate-800/40">
            {candidate.reasons.slice(0, 2).map((reason, idx) => (
              <div key={idx} className="text-[11px] text-slate-400 flex items-start gap-1.5 leading-snug">
                <span className="text-emerald-400 mt-0.5 flex-shrink-0">•</span>
                <span className="truncate">{reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FOOTER ACTION: Clean Binance Futures Charting Link */}
      <a
        href={candidate.binanceUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-2 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-bold text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60 transition-colors"
      >
        <span>Open Binance Futures Chart</span>
        <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
      </a>
    </div>
  );
};
