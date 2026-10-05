import React, { useEffect, useState } from 'react';
import { Signal, CryptoCandle } from '../types/crypto';
import { StatusBadge } from '../components/StatusBadge';
import { MoonScoreGauge } from '../components/MoonScoreGauge';
import { CandlestickChart } from '../components/CandlestickChart';
import { IntelligencePipeline } from '../components/IntelligencePipeline';
import { CatalystTradePipeline } from '../components/CatalystTradePipeline';
import { SmartRiskManagementView } from '../components/SmartRiskManagementView';
import { EarlySetupTimingView } from '../components/EarlySetupTimingView';
import { CategoryIntelligenceView } from '../components/CategoryIntelligenceView';
import { NewListingIntelligenceView } from '../components/NewListingIntelligenceView';
import { LargeMoveOpportunityView } from '../components/LargeMoveOpportunityView';
import { UnifiedFusionView } from '../components/UnifiedFusionView';
import { formatPrice, formatPercent, formatBangladeshTime, getCanonicalTargets } from '../utils/formatters';
import { getRankingTierBadge } from '../utils/priorityRanking';
import { fetchCandles } from '../services/api';
import { X, ArrowUpRight, ArrowDownRight, Target, ShieldAlert, Clock, Layers, Copy, Check, Activity, Zap, Compass, AlertTriangle, Sparkles, Shield, BarChart2, TrendingUp, Award, CheckCircle2 } from 'lucide-react';

interface Props {
  signal: Signal | null;
  onClose: () => void;
}

export const SignalDetailModal: React.FC<Props> = ({ signal, onClose }) => {
  const [candles, setCandles] = useState<CryptoCandle[]>([]);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'OVERVIEW' | 'CHART' | 'RISK' | 'INTELLIGENCE'>('ALL');

  const getExecutionStateDetails = (state?: string) => {
    switch (state) {
      case 'ENTRY_NOW':
        return {
          title: 'ENTRY NOW',
          color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          desc: 'Price is within the validated entry zone. Optimal risk-to-reward execution window is currently active.'
        };
      case 'WAIT_FOR_PULLBACK':
        return {
          title: 'WAIT FOR PULLBACK',
          color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          desc: 'Price has pushed beyond ideal entry point. Do not chase market momentum; wait for healthy pullback to structural support.'
        };
      case 'WAIT_FOR_RETEST':
        return {
          title: 'WAIT FOR RETEST',
          color: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
          desc: 'Key structural level broken. Awaiting pullback retest to confirm previous resistance flipped to support.'
        };
      case 'WAIT_FOR_CONFIRMATION':
        return {
          title: 'WAIT FOR CONFIRMATION',
          color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
          desc: 'Higher timeframe setup identified. Lower timeframe trigger confirmation (e.g. candle close or volume expansion) pending.'
        };
      case 'ENTRY_MISSED':
        return {
          title: 'ENTRY MISSED',
          color: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
          desc: 'Price has accelerated toward early targets without retracing to entry zone. Do not enter late; preserve capital.'
        };
      case 'INVALIDATED':
        return {
          title: 'INVALIDATED',
          color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          desc: 'Structural invalidation level breached or opposing order flow detected. Setup thesis is cancelled.'
        };
      case 'EXPIRED':
        return {
          title: 'EXPIRED',
          color: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40',
          desc: 'Setup valid window duration elapsed without triggering entry criteria.'
        };
      default:
        return {
          title: state ? state.replace(/_/g, ' ') : 'AWAITING SETUP',
          color: 'bg-slate-800 text-slate-300 border-slate-700',
          desc: 'Monitoring structural parameters and market condition alignment.'
        };
    }
  };

  useEffect(() => {
    if (!signal) return;
    let isMounted = true;
    
    fetchCandles(signal.symbol, signal.timeframe, 60).then((data) => {
      if (isMounted) {
        setCandles(data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [signal?.id, signal?.symbol, signal?.timeframe]);

  if (!signal) return null;

  const isLong = signal.direction === 'LONG';
  
  // Single Source of Truth for Targets
  const canonicalTargets = getCanonicalTargets(signal);
  const ci = signal.coreIntelligence;

  const handleCopyOrder = () => {
    const text = `[MoonScanner Signal]
Pair: ${signal.symbol}
Direction: ${signal.direction} (${signal.timeframe?.toUpperCase() || '1H'})
Entry: ${formatPrice(signal.entryPrice)}
Stop Loss: ${formatPrice(signal.stopLoss)}
Targets:
${canonicalTargets.map(t => `• ${t.label}: ${formatPrice(t.price)} (${typeof t.percentage === 'number' && !isNaN(t.percentage) ? '+' + t.percentage.toFixed(1) + '%' : ''})`).join('\n')}
MoonScore: ${signal.moonScore}/100`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl my-8 overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl animate-fade-in max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3.5">
            <div
              className={`flex items-center justify-center w-12 h-12 rounded-xl ${
                isLong ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
              }`}
            >
              {isLong ? <ArrowUpRight className="w-7 h-7" /> : <ArrowDownRight className="w-7 h-7" />}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                {signal.priorityRank !== undefined && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 border border-amber-500/40 text-xs font-mono font-black shadow-xs">
                    RANK #{signal.priorityRank}
                  </span>
                )}
                <h2 className="text-2xl font-black text-slate-100 tracking-tight">{signal.symbol}</h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
                    isLong ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {signal.direction}
                </span>
                {signal.primaryCategory && signal.primaryCategory !== 'UNKNOWN' && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                    signal.primaryCategory.endsWith('_LONG')
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : signal.primaryCategory.endsWith('_SHORT')
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}>
                    {signal.primaryCategory.replace(/_/g, ' ')}
                  </span>
                )}
                {signal.qualityGrade && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-amber-400/20 text-amber-300 border border-amber-400/50">
                    GRADE {signal.qualityGrade}
                  </span>
                )}
                {(() => {
                  const tb = getRankingTierBadge(signal.rankingTier || signal.opportunityPriority?.rankingTier);
                  return (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${tb.bg} ${tb.color} ${tb.border}`}>
                      {tb.badgeText}
                    </span>
                  );
                })()}
                {signal.actionablePriority && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                    {signal.actionablePriority.replace(/_/g, ' ')}
                  </span>
                )}
                {ci?.marketBehavior && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                    {ci.marketBehavior.replace(/_/g, ' ')}
                  </span>
                )}
                <StatusBadge status={signal.status} />
              </div>
              <div className="flex items-center gap-3 text-xs font-mono text-slate-400 mt-1 flex-wrap">
                <span>Current: <strong className="text-slate-200">{formatPrice(signal.currentPrice)}</strong></span>
                <span className={signal.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  ({formatPercent(signal.priceChange24h)})
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatBangladeshTime(signal.createdAt)} BST
                </span>
              </div>
              
              {/* Multi-Timeframe Evidence Layer in Modal Header */}
              <div className="flex items-center gap-1.5 mt-2 text-[11px] font-mono text-slate-400">
                <span className="text-slate-500 font-semibold">Evidence:</span>
                {(['4h', '1h', '15m', '5m'] as const).map((tf) => {
                  const tfEv = signal.unifiedEvidence?.timeframes?.[tf];
                  const isAligned = tfEv ? (signal.direction === 'LONG' ? tfEv.bias === 'BULLISH' : tfEv.bias === 'BEARISH') : true;
                  return (
                    <span
                      key={tf}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isAligned
                          ? 'bg-slate-800 text-cyan-300 border border-cyan-500/30'
                          : 'bg-slate-950 text-slate-500 border border-slate-800'
                      }`}
                    >
                      {tf.toUpperCase()} {isAligned ? '✓' : '—'}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <MoonScoreGauge score={signal.moonScore} size="lg" />
          </div>
        </div>

        {/* Fast Tab Navigation for Mobile UX (Capacitor 6+ Android) */}
        <div className="sticky top-0 z-20 -mx-6 px-6 py-2.5 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar font-mono text-xs">
          {[
            { id: 'ALL', label: 'All Details' },
            { id: 'OVERVIEW', label: 'Decision & Overview' },
            { id: 'CHART', label: 'Live Chart' },
            { id: 'RISK', label: 'Risk & Targets' },
            { id: 'INTELLIGENCE', label: 'Institutional Intel' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Decision & Execution Lifecycle Inspector */}
        {(activeTab === 'ALL' || activeTab === 'OVERVIEW') && (
          <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800 font-mono space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>DECISION & REASONING MODEL</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 uppercase">Signal Decision:</span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${
                  isLong ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                  signal.direction === 'SHORT' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' :
                  'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {signal.direction} ({signal.qualityGrade || 'A'})
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-300 leading-relaxed">
              <strong className="text-cyan-400 block mb-1">
                WHY {signal.direction}:
              </strong>
              <span>
                {signal.notes || (signal.whyTrade && signal.whyTrade.length > 0 ? signal.whyTrade.join(' ') : 'Confluence of multi-timeframe structural alignment, orderflow absorption, and favorable risk-to-reward parameters.')}
              </span>
            </div>

            {/* Execution / Lifecycle State */}
            {(() => {
              const entryHigh = signal.entryZoneHigh || signal.entryPrice;
              const entryLow = signal.entryZoneLow || signal.entryPrice;
              const curPrice = signal.currentPrice || 0;
              const isEntryMissed = curPrice > 0 && (
                (isLong && curPrice > entryHigh) ||
                (!isLong && curPrice < entryLow)
              );
              const computedState = isEntryMissed ? 'ENTRY_MISSED' : (signal.entryStatus || signal.lifecycleStatus || signal.actionablePriority);
              const execDetails = getExecutionStateDetails(computedState);
              return (
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Execution & Timing State:</span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${execDetails.color}`}>
                      {execDetails.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    {execDetails.desc}
                  </p>
                </div>
              );
            })()}
          </div>
        )}

        {/* Live TradingView-Grade Candlestick Chart View */}
        {(activeTab === 'ALL' || activeTab === 'CHART') && (
          <div className="mt-5">
            <CandlestickChart
              candles={candles}
              signal={signal}
              height={320}
              selectedTimeframe={signal.timeframe || '1h'}
            />
          </div>
        )}

        {/* Order Matrix: Entry, SL, R:R */}
        {(activeTab === 'ALL' || activeTab === 'OVERVIEW') && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-5">
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="text-[11px] font-mono text-slate-400 uppercase">Entry Price Zone</div>
              <div className="text-lg font-mono font-bold text-cyan-300 mt-0.5">
                {formatPrice(signal.entryPrice)}
              </div>
              {signal.entryZoneLow && signal.entryZoneHigh && (
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                  Range: {formatPrice(signal.entryZoneLow)} - {formatPrice(signal.entryZoneHigh)}
                </div>
              )}
              {ci?.entryQualityRating && (
                <div className="mt-1">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                    ci.entryQualityRating === 'OPTIMAL_ENTRY' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                    ci.entryQualityRating === 'GOOD_ENTRY' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' :
                    ci.entryQualityRating === 'CHASE_RISK' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                    'bg-slate-800 text-slate-300'
                  }`}>
                    {ci.entryQualityRating.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="text-[11px] font-mono text-slate-400 uppercase">Invalidation / Stop Loss</div>
              <div className="text-lg font-mono font-bold text-rose-400 mt-0.5 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                {formatPrice(signal.stopLoss)}
              </div>
              <div className="text-[10px] font-mono text-rose-400/80 mt-0.5">
                Risk: {signal.entryPrice > 0 ? ((Math.abs(signal.entryPrice - signal.stopLoss) / signal.entryPrice) * 100).toFixed(2) : '1.5'}%
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="text-[11px] font-mono text-slate-400 uppercase">Risk to Reward</div>
              <div className="text-lg font-mono font-bold text-amber-300 mt-0.5">
                1 : {signal.riskRewardRatio}
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                Optimized for Multi-Target Exit
              </div>
            </div>
          </div>
        )}

        {/* CANONICAL TAKE PROFIT LEVELS & RISK MANAGEMENT */}
        {(activeTab === 'ALL' || activeTab === 'RISK') && (
          <>
            <div className="mb-6 p-4 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-3">
                <span className="flex items-center gap-1.5 text-slate-200 font-bold">
                  <Target className="w-4 h-4 text-emerald-400" />
                  <span>TAKE PROFIT TARGET EXECUTION LEVELS</span>
                </span>
                <span className="text-emerald-400 font-semibold">
                  {canonicalTargets.filter(t => t.hit).length} / {canonicalTargets.length} TARGETS HIT
                </span>
              </div>

              <div className={`grid ${
                canonicalTargets.length <= 3 
                  ? 'grid-cols-1 md:grid-cols-3' 
                  : canonicalTargets.length <= 4 
                  ? 'grid-cols-2 md:grid-cols-4' 
                  : canonicalTargets.length <= 6
                  ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'
                  : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'
              } gap-3`}>
                {canonicalTargets.map((target) => (
                  <div
                    key={target.id || target.label}
                    className={`p-3 rounded-xl border transition-all ${
                      target.hit
                        ? 'bg-emerald-500/20 border-emerald-500/60 shadow-lg shadow-emerald-950/30 text-emerald-100'
                        : target.status === 'INVALIDATED'
                        ? 'bg-rose-950/20 border-rose-900/40 text-rose-300 opacity-60'
                        : 'bg-slate-900/80 border-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1">
                        <span>{target.label}</span>
                        {target.isClustered && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {target.confluentCount || 2}x Confluent
                          </span>
                        )}
                      </span>
                      {target.hit ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-mono text-[10px] font-bold">
                          HIT ✓
                        </span>
                      ) : target.status === 'INVALIDATED' ? (
                        <span className="px-1.5 py-0.5 rounded bg-rose-900/40 text-rose-300 font-mono text-[9px] font-bold">
                          INVALIDATED
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-500">
                          {target.rMultiple ? `${target.rMultiple}R` : 'PENDING'}
                        </span>
                      )}
                    </div>

                    <div className="text-base font-mono font-black mt-1 text-slate-100">
                      {formatPrice(target.price)}
                    </div>

                    {typeof target.percentage === 'number' && !isNaN(target.percentage) && (
                      <div className="text-xs font-mono text-emerald-400 mt-0.5 font-semibold">
                        +{target.percentage.toFixed(2)}%
                      </div>
                    )}

                    {target.evidenceLevel && (
                      <div className="text-[10px] font-mono text-slate-400 mt-1 line-clamp-1 border-t border-slate-800/80 pt-1" title={target.evidenceLevel}>
                        {target.evidenceLevel}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Trade Management & Protection Status Bar */}
              {signal.tradeManagement && (
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs font-mono text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Protection Mode:</span>
                    <span className={`px-2 py-0.5 rounded font-bold ${
                      signal.tradeManagement.protectionMode === 'PROFIT_LOCKED'
                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/60'
                        : signal.tradeManagement.protectionMode === 'STRUCTURAL_TRAILING' || signal.tradeManagement.protectionMode === 'BREAK_EVEN'
                        ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-700/60'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}>
                      {signal.tradeManagement.protectionMode.replace(/_/g, ' ')}
                    </span>
                    {signal.tradeManagement.trailingAnchor && (
                      <span className="text-slate-400 text-[11px]">
                        ({signal.tradeManagement.trailingAnchor})
                      </span>
                    )}
                  </div>
                  {signal.tradeManagement.parabolicProtection?.detected && (
                    <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 font-bold border border-amber-700/60">
                      ⚡ Parabolic Move Defense Active
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Phase 9: Smart Risk & Trade Management Inspector */}
            <div className="mb-6">
              <SmartRiskManagementView signal={signal} />
            </div>
          </>
        )}

        {/* Phase 11 & Institutional Intelligence Sections */}
        {(activeTab === 'ALL' || activeTab === 'INTELLIGENCE') && (
          <>

        {/* Phase 11: Early Setup & Timing Intelligence Inspector */}
        <div className="mb-6">
          <EarlySetupTimingView signal={signal} />
        </div>

        {/* Phase 12: Primary Setup Category Intelligence Inspector */}
        <div className="mb-6">
          <CategoryIntelligenceView signal={signal} />
        </div>

        {/* Deterministic Opportunity Priority Audit & Breakdown */}
        {signal.opportunityPriority && (
          <div className="mb-6 p-4 rounded-xl bg-slate-950/80 border border-amber-500/30 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
              <span className="text-amber-400 font-bold flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400" />
                <span>OPPORTUNITY PRIORITY & ASYMMETRY BREAKDOWN</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Total Score:</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black border border-amber-500/40">
                  {signal.opportunityPriority.priorityScore} PTS
                </span>
                <span className="text-slate-400">Realistic Upside:</span>
                <span className="text-emerald-400 font-bold">
                  +{signal.opportunityPriority.realisticUpsidePct.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Score Factor Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
              <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Quality Grade</span>
                <span className="text-amber-300 font-bold">
                  +{signal.opportunityPriority.scoreBreakdown.gradeScore} pts
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Realistic Upside</span>
                <span className="text-emerald-400 font-bold">
                  +{signal.opportunityPriority.scoreBreakdown.upsideScore} pts
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Risk / Reward</span>
                <span className="text-cyan-300 font-bold">
                  +{signal.opportunityPriority.scoreBreakdown.rrScore} pts
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Readiness / Entry</span>
                <span className="text-indigo-300 font-bold">
                  +{signal.opportunityPriority.scoreBreakdown.readinessScore} pts
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">MTF Confluence</span>
                <span className="text-sky-300 font-bold">
                  +{signal.opportunityPriority.scoreBreakdown.mtfScore} pts
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Volume & RVOL</span>
                <span className="text-teal-300 font-bold">
                  +{signal.opportunityPriority.scoreBreakdown.volumeScore} pts
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">SMC / Structure</span>
                <span className="text-purple-300 font-bold">
                  +{signal.opportunityPriority.scoreBreakdown.smcScore} pts
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Dump Risk Penalty</span>
                <span className={`font-bold ${signal.opportunityPriority.scoreBreakdown.dumpRiskPenalty > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  -{signal.opportunityPriority.scoreBreakdown.dumpRiskPenalty} pts
                </span>
              </div>
            </div>

            {/* Key Ranking Factors */}
            {signal.opportunityPriority.keyRankReasons && signal.opportunityPriority.keyRankReasons.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-400 uppercase block mb-1">Key Ranking Factors:</span>
                <div className="flex flex-wrap gap-1.5">
                  {signal.opportunityPriority.keyRankReasons.map((reason, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 text-[10px] font-mono flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-2.5 h-2.5 text-amber-400" />
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Phase 14: New Listing Intelligence View */}
        {signal.newListingIntelligence?.isNewListing && (
          <NewListingIntelligenceView report={signal.newListingIntelligence} />
        )}

        {/* Phase 15: Large Move + Asymmetric Opportunity Intelligence View */}
        {signal.largeMoveIntelligence && (
          <LargeMoveOpportunityView report={signal.largeMoveIntelligence} />
        )}

        {/* Phase 16: Unified Intelligence Fusion View */}
        {signal.unifiedFusion && (
          <div className="mb-6">
            <UnifiedFusionView fusion={signal.unifiedFusion} />
          </div>
        )}

        {/* Catalyst-to-Trade Execution Pipeline */}
        <div className="mb-6">
          <CatalystTradePipeline signal={signal} pipeline={signal.catalystTradePipeline} />
        </div>

        {/* Confluence Pipeline */}
        {signal.confluences && signal.confluences.length > 0 && (
          <div className="mb-6">
            <IntelligencePipeline confluences={signal.confluences} moonScore={signal.moonScore} />
          </div>
        )}

        {/* Phase 4.6 Core Intelligence Insights */}
        {(signal.marketRegime || signal.tradeWindow || signal.confirmations?.length || ci || signal.marketCycle || signal.pumpDump || signal.flowWhale || signal.killSwitch) && (
          <div className="mb-6 p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
              <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>CORE INTELLIGENCE & MULTI-LAYER AUDIT</span>
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {signal.marketRegime && (
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 font-mono border border-slate-700">
                    Regime: {signal.marketRegime}
                  </span>
                )}
                {ci?.marketBehavior && (
                  <span className="px-2 py-0.5 rounded bg-cyan-950/50 text-[10px] text-cyan-300 font-mono border border-cyan-800/60">
                    Behavior: {ci.marketBehavior}
                  </span>
                )}
                {signal.dataQuality && (
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-emerald-300 font-mono border border-slate-700">
                    Quality: {signal.dataQuality}
                  </span>
                )}
              </div>
            </div>

            {/* Trade Window */}
            {signal.tradeWindow && (
              <div className="text-[11px] font-mono text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-slate-500">Entry Window:</span>{' '}
                  <span className="text-slate-200">{formatBangladeshTime(signal.tradeWindow.entryWindowStart)} – {formatBangladeshTime(signal.tradeWindow.entryWindowEnd)} BST</span>
                </div>
                <div>
                  <span className="text-slate-500">Expiration:</span>{' '}
                  <span className="text-slate-200">{formatBangladeshTime(signal.tradeWindow.expiresAt)} BST</span>
                </div>
              </div>
            )}

            {/* Universal Opportunity Discovery & Universe Intelligence */}
            {signal.opportunityReport && (
              <div className="p-3 rounded-xl bg-slate-900/90 border border-cyan-500/30 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    Universal Opportunity Discovery & Momentum
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-bold">
                      SCORE: {signal.opportunityReport.opportunityScore ?? signal.moonScore ?? 0}/100
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                      {signal.category || signal.opportunityReport.category || 'ALTCOIN'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block uppercase">Early Setup</span>
                    <span className="text-slate-200 font-bold text-[11px]">
                      {String(signal.opportunityReport.earlySetupType || 'NONE').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block uppercase">RVOL Acceleration</span>
                    <span className="text-cyan-300 font-bold text-[11px]">
                      {typeof signal.opportunityReport.rvol === 'number' ? signal.opportunityReport.rvol.toFixed(1) : '1.0'}x Volume
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block uppercase">Velocity / RS</span>
                    <span className="text-emerald-300 font-bold text-[11px]">
                      V: {signal.opportunityReport.priceVelocityScore ?? 50} | RS: {signal.opportunityReport.rsScoreVsBtc !== undefined ? ((signal.opportunityReport.rsScoreVsBtc >= 0 ? '+' : '') + signal.opportunityReport.rsScoreVsBtc) : 'N/A'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block uppercase">Post-Pump Guard</span>
                    <span className={`font-bold text-[11px] ${
                      signal.opportunityReport.postPumpDumpRisk === 'LOW' ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {signal.opportunityReport.postPumpDumpRisk || 'LOW'} RISK
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-300 bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
                  {signal.opportunityReport.summary || 'Universal market opportunity analysis computed.'}
                </div>
              </div>
            )}

            {/* Phase 6: Market Cycle & Momentum Climax Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {signal.marketCycle && (
                <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 text-xs font-mono">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-cyan-400 font-bold flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" /> Market Cycle
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 text-[10px] font-bold border border-cyan-800">
                      {signal.marketCycle.cycle || (signal.marketCycle as any).phase || 'CYCLE'}
                    </span>
                  </div>
                  <div className="text-slate-300 text-[11px]">
                    Stage: <strong>{signal.marketCycle.stage || (signal.marketCycle as any).cycleStage || 'ANALYZED'}</strong> ({(signal.marketCycle.confidence || signal.marketCycle.cycleConfidence) !== undefined ? `${signal.marketCycle.confidence || signal.marketCycle.cycleConfidence}% Conf` : 'N/A'})
                  </div>
                  <div className="text-slate-400 text-[10px] mt-0.5">
                    {signal.marketCycle.description || signal.marketCycle.summary || (signal.marketCycle as any).rationale || 'Multi-timeframe cycle baseline'}
                  </div>
                </div>
              )}

              {signal.pumpDump && (
                <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 text-xs font-mono">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-amber-400 font-bold flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" /> Momentum & Dump Risk
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                      signal.pumpDump.dumpRisk === 'HIGH' || signal.pumpDump.dumpRisk === 'CRITICAL'
                        ? 'bg-rose-950 text-rose-300 border-rose-800'
                        : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    }`}>
                      {signal.pumpDump.dumpRisk}
                    </span>
                  </div>
                  <div className="text-slate-300 text-[11px]">
                    State: <strong>{signal.pumpDump.momentumState}</strong> | Fake: <strong>{signal.pumpDump.fakePumpWarning ? 'YES' : 'NO'}</strong>
                  </div>
                  <div className="text-slate-400 text-[10px] mt-0.5">
                    {signal.pumpDump.rationale}
                  </div>
                </div>
              )}
            </div>

            {/* Whale Flow & Kill Switch Status */}
            {(signal.flowWhale || signal.killSwitch) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {signal.flowWhale && (
                  <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] font-mono">
                    <div className="text-slate-400 font-bold flex items-center justify-between">
                      <span>Whale Flow Intelligence:</span>
                      <span className="text-indigo-300">{signal.flowWhale.netFlowStatus}</span>
                    </div>
                    <div className="text-slate-400 text-[10px] mt-0.5">{signal.flowWhale.rationale}</div>
                  </div>
                )}
                {signal.killSwitch && (
                  <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] font-mono">
                    <div className="text-slate-400 font-bold flex items-center justify-between">
                      <span>Kill Switch Circuit:</span>
                      <span className={signal.killSwitch.triggered ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                        {signal.killSwitch.triggered ? 'TRIGGERED' : 'CLEAR'}
                      </span>
                    </div>
                    <div className="text-slate-400 text-[10px] mt-0.5">
                      {signal.killSwitch.triggered ? signal.killSwitch.triggerReason : 'All volatility and integrity metrics within safe bands.'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Institutional-Grade Market Intelligence */}
            {(signal.institutionalIntelligence || signal.smcStructureReport || signal.orderflowReport || signal.fibonacciReport || signal.divergenceMatrixReport || signal.relativeStrengthReport || signal.derivativesIntelligenceReport || signal.derivativesReport) && (
              <div className="p-3 rounded-xl bg-slate-900/90 border border-indigo-500/30 space-y-3 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-indigo-400 font-bold flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-indigo-400" />
                    Institutional Orderflow & Market Structure
                  </span>
                  <div className="flex items-center gap-2">
                    {signal.institutionalIntelligence && (
                      <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-bold">
                        VERDICT: {signal.institutionalIntelligence.overallInstitutionalVerdict.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* SMC & Orderflow Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* SMC Structure */}
                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                      <span className="text-cyan-400 font-bold flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5" /> SMC / ICT Structure
                      </span>
                      <span className="text-[10px] text-cyan-300 font-bold">
                        {signal.smcStructureReport?.structureType || 'STRUCTURAL'} ({signal.smcStructureReport?.structureBias || 'NEUTRAL'})
                      </span>
                    </div>
                    <div className="text-slate-300 text-[11px]">
                      {signal.smcStructureReport?.confluenceSummary || 'SMC order blocks & FVG imbalances mapped.'}
                    </div>
                  </div>

                  {/* Orderflow & Volume Profile */}
                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <BarChart2 className="w-3.5 h-3.5" /> Orderflow & Volume Profile
                      </span>
                      <span className="text-[10px] text-emerald-300 font-bold">
                        {signal.orderflowReport?.cvd.deltaTrend || 'CVD BALANCED'}
                      </span>
                    </div>
                    <div className="text-slate-300 text-[11px]">
                      {signal.orderflowReport?.summary || 'Volume profile POC & depth pressure calculated.'}
                    </div>
                  </div>
                </div>

                {/* Fibonacci, Divergence & Macro Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Fibonacci */}
                  <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block uppercase">Fibonacci Pocket</span>
                    <span className="text-amber-300 font-bold text-[11px]">
                      {signal.fibonacciReport?.goldenPocket?.inZone ? 'IN GOLDEN POCKET' : (signal.fibonacciReport?.goldenPocket ? `$${signal.fibonacciReport.goldenPocket.min.toFixed(2)} - $${signal.fibonacciReport.goldenPocket.max.toFixed(2)}` : 'N/A')}
                    </span>
                  </div>

                  {/* Divergence Matrix */}
                  <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block uppercase">Divergence Matrix</span>
                    <span className="text-indigo-300 font-bold text-[11px] truncate block">
                      {signal.divergenceMatrixReport?.rsiDivergence?.detected ? signal.divergenceMatrixReport.rsiDivergence.type.replace(/_/g, ' ') : 'NO DIVERGENCE'}
                    </span>
                  </div>

                  {/* Relative Strength vs BTC */}
                  <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block uppercase">RS vs BTC / Macro</span>
                    <span className="text-cyan-300 font-bold text-[11px]">
                      {signal.relativeStrengthReport ? `[${signal.relativeStrengthReport.relativeStrengthCategory}] (${signal.relativeStrengthReport.rsVsBtc24h >= 0 ? '+' : ''}${signal.relativeStrengthReport.rsVsBtc24h}%)` : 'COMPUTING'}
                    </span>
                  </div>
                </div>

                {/* Derivatives Telemetry */}
                {(signal.derivativesIntelligenceReport || signal.derivativesReport) && (
                  <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-300">
                    <span className="text-purple-400 font-bold mr-1.5">PERP DERIVATIVES:</span>
                    <span>{(signal.derivativesIntelligenceReport || signal.derivativesReport)?.summary || 'Derivatives telemetry integrated.'}</span>
                  </div>
                )}
              </div>
            )}

            {/* Liquidity Structure & Asymmetry */}
            {ci?.liquidityReason && (
              <div className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800 text-xs font-mono text-slate-300">
                <span className="text-cyan-400 font-bold block mb-0.5">LIQUIDITY INTELLIGENCE:</span>
                <span>{ci.liquidityReason}</span>
              </div>
            )}

            {/* Confirmations List */}
            {signal.confirmations && signal.confirmations.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-mono text-slate-400 uppercase">Primary Confirmations:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs font-mono text-slate-300">
                  {signal.confirmations.slice(0, 6).map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-slate-300">
                      <span className="text-emerald-400">✓</span>
                      <span className="truncate">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key Adversarial Risk */}
            {ci?.keyRisk && (
              <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-900/40 text-xs font-mono text-rose-300/90 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-rose-400 block">ADVERSARIAL RISK CHECK:</strong>
                  <span>{ci.keyRisk}</span>
                </div>
              </div>
            )}

            {/* News & Catalyst Evidence Layer */}
            {signal.unifiedEvidence?.news && !signal.unifiedEvidence.news.isMissing && (
              <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs font-mono space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    CATALYST & VERIFIED NEWS INTELLIGENCE
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    signal.unifiedEvidence.news.bias === 'BULLISH'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : signal.unifiedEvidence.news.bias === 'BEARISH'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {signal.unifiedEvidence.news.bias} (Impact: {signal.unifiedEvidence.news.impactScore}/100)
                  </span>
                </div>
                {signal.unifiedEvidence.news.primaryHeadlines?.length > 0 && (
                  <div className="text-slate-300 text-[11px] pt-0.5">
                    <strong>Headline:</strong> {signal.unifiedEvidence.news.primaryHeadlines[0]}
                  </div>
                )}
                {signal.unifiedEvidence.news.evidenceList?.length > 0 && (
                  <div className="text-slate-400 text-[10px]">
                    {signal.unifiedEvidence.news.evidenceList.join(' • ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
          </>
        )}

        {/* Strategy Rationale */}
        {signal.notes && (
          <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 text-xs text-slate-300 mb-5">
            <strong className="text-cyan-400 font-mono block mb-1">STRATEGY RATIONALE:</strong>
            {signal.notes}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <button
            onClick={handleCopyOrder}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Signal Copied!' : 'Copy Trade Setup'}</span>
          </button>

          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
