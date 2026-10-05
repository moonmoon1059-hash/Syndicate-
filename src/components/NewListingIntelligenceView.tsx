import React from 'react';
import { NewListingIntelligenceReport } from '../types/crypto';
import { formatPrice } from '../utils/formatters';
import {
  Layers,
  Clock,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Activity,
  Zap,
  DollarSign,
  Compass
} from 'lucide-react';

interface Props {
  report?: NewListingIntelligenceReport;
}

export const NewListingIntelligenceView: React.FC<Props> = ({ report }) => {
  if (!report || !report.isNewListing) return null;

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'LISTING_LIVE':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'POST_LISTING':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'PRE_LISTING':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const getViabilityBadgeStyle = (viability: string) => {
    switch (viability) {
      case 'ACTIONABLE_BASE':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'DO_NOT_TRADE':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'WAIT_LIQUIDITY':
      case 'WAIT_STABILIZATION':
      case 'PRE_LISTING_WAIT':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getAlignmentStyle = (alignment: string) => {
    switch (alignment) {
      case 'SUPPORTS_LONG':
        return 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
      case 'SUPPORTS_SHORT':
        return 'text-rose-300 border-rose-500/40 bg-rose-500/10';
      case 'CONTRADICTS_SETUP':
      case 'HIGH_RISK_WARNING':
        return 'text-rose-400 border-rose-500/40 bg-rose-500/15 font-bold';
      default:
        return 'text-slate-300 border-slate-700 bg-slate-800/40';
    }
  };

  const ref = report.referenceLevels;

  return (
    <div className="mb-6 p-4 rounded-xl bg-slate-950/80 border border-teal-500/30 space-y-3 font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-teal-400 font-bold flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-teal-400" />
          <span>NEW LISTING INTELLIGENCE</span>
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusBadgeStyle(report.launchStatus)}`}>
            {report.launchStatus}
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getViabilityBadgeStyle(report.setupViability)}`}>
            {report.setupViability.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Anti-Chase Alert Banner */}
      {report.antiChaseWarning && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/50 text-rose-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <strong className="text-rose-400 block text-[11px]">ANTI-CHASE PROTOCOL ACTIVE:</strong>
            <span className="text-[11px]">
              Parabolic post-listing expansion detected ({report.overextensionRisk.replace(/_/g, ' ')}). Chasing market buys without structural base consolidation is prohibited.
            </span>
          </div>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Listing Time & Age */}
        <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800">
          <div className="text-slate-400 text-[10px] flex items-center gap-1 mb-0.5">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>Listing Time</span>
          </div>
          <div className="text-slate-200 font-bold text-[11px]">
            {report.listingTimeAvailable && report.listingTime
              ? new Date(report.listingTime).toLocaleDateString()
              : 'Unavailable'}
          </div>
          <div className="text-[10px] text-slate-400">
            {report.listingAgeHours !== null ? `${report.listingAgeHours}h age` : 'Zero data fabrication'}
          </div>
        </div>

        {/* Discovery Stage */}
        <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800">
          <div className="text-slate-400 text-[10px] flex items-center gap-1 mb-0.5">
            <Compass className="w-3 h-3 text-amber-400" />
            <span>Discovery Stage</span>
          </div>
          <div className="text-amber-300 font-bold text-[11px]">
            {report.discoveryStage.replace(/_/g, ' ')}
          </div>
          <div className="text-[10px] text-slate-400">
            Vol: {report.volatilityState}
          </div>
        </div>

        {/* Liquidity Availability */}
        <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800">
          <div className="text-slate-400 text-[10px] flex items-center gap-1 mb-0.5">
            <DollarSign className="w-3 h-3 text-teal-400" />
            <span>Liquidity Status</span>
          </div>
          <div className={`font-bold text-[11px] ${
            report.liquidityStatus === 'LIQUIDITY_AVAILABLE'
              ? 'text-teal-300'
              : report.liquidityStatus === 'LIQUIDITY_THIN'
              ? 'text-amber-300'
              : 'text-rose-400'
          }`}>
            {report.liquidityStatus.replace(/_/g, ' ')}
          </div>
          <div className="text-[10px] text-slate-400">
            {report.volumeAvailable && report.volume24hUsd
              ? `$${(report.volume24hUsd / 1e6).toFixed(1)}M 24h`
              : 'Volume missing (WAIT)'}
          </div>
        </div>

        {/* Structure & Action */}
        <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800">
          <div className="text-slate-400 text-[10px] flex items-center gap-1 mb-0.5">
            <Activity className="w-3 h-3 text-indigo-400" />
            <span>Market Structure</span>
          </div>
          <div className="text-indigo-300 font-bold text-[11px]">
            {report.marketStructure.replace(/_/g, ' ')}
          </div>
          <div className="text-[10px] text-slate-400">
            Action: {report.structureAction}
          </div>
        </div>
      </div>

      {/* Reference Levels (Listing Open / High / Low) */}
      {ref.listingOpenPrice !== null && (
        <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1.5">
          <div className="text-slate-400 text-[10px] uppercase font-bold flex items-center justify-between">
            <span>First Market Reference Levels</span>
            <span className="text-slate-500 font-normal">Range: {ref.initialRangePct ? `${ref.initialRangePct}%` : 'N/A'}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
              <span className="text-slate-500 block text-[9px]">Listing Open</span>
              <span className="text-slate-200 font-bold">{formatPrice(ref.listingOpenPrice)}</span>
              {ref.currentVsListingOpenPct !== null && (
                <span className={`text-[9px] block ${ref.currentVsListingOpenPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {ref.currentVsListingOpenPct >= 0 ? '+' : ''}{ref.currentVsListingOpenPct}%
                </span>
              )}
            </div>
            <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
              <span className="text-slate-500 block text-[9px]">Initial High (Day-1)</span>
              <span className="text-slate-200 font-bold">{ref.listingHigh !== null ? formatPrice(ref.listingHigh) : 'N/A'}</span>
              {ref.currentVsListingHighPct !== null && (
                <span className="text-[9px] block text-slate-400">
                  {ref.currentVsListingHighPct >= 0 ? '+' : ''}{ref.currentVsListingHighPct}%
                </span>
              )}
            </div>
            <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800">
              <span className="text-slate-500 block text-[9px]">Initial Low (Day-1)</span>
              <span className="text-slate-200 font-bold">{ref.listingLow !== null ? formatPrice(ref.listingLow) : 'N/A'}</span>
              {ref.currentVsListingLowPct !== null && (
                <span className="text-[9px] block text-slate-400">
                  {ref.currentVsListingLowPct >= 0 ? '+' : ''}{ref.currentVsListingLowPct}%
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confluence & Technical Alignment (Confluence Only Principle) */}
      <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-[10px] uppercase font-bold">Unified Confluence Context</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getAlignmentStyle(report.technicalAlignment)}`}>
            {report.technicalAlignment.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="text-slate-300 text-[11px]">
          {report.confluenceReason}
        </div>
        <div className="text-[10px] text-slate-400 pt-0.5">
          <strong className="text-slate-500">Rule:</strong> New listing intelligence provides confluence and timing context only; the unified engine remains the sole decision authority.
        </div>
        {report.invalidation && (
          <div className="text-[10px] text-amber-400/90 pt-0.5">
            <strong>Invalidation:</strong> {report.invalidation}
          </div>
        )}
      </div>
    </div>
  );
};
