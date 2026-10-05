import React from 'react';
import { NewsItem } from '../types/crypto';
import { formatBangladeshTime, formatRelativeTime } from '../utils/formatters';
import {
  X,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Activity,
  Layers,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

interface Props {
  news: NewsItem | null;
  onClose: () => void;
}

export const NewsModal: React.FC<Props> = ({ news, onClose }) => {
  if (!news) return null;

  const isBull = news.sentiment === 'BULLISH';
  const isBear = news.sentiment === 'BEARISH';
  const isMixed = news.sentiment === 'MIXED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg bg-slate-800/80 text-slate-400 hover:text-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Badges */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Sentiment & Impact */}
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 ${
              isBull
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : isBear
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                : isMixed
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            {isBull ? <TrendingUp className="w-3.5 h-3.5" /> : isBear ? <TrendingDown className="w-3.5 h-3.5" /> : null}
            {news.sentiment} IMPACT ({news.impactScore}/100)
          </span>

          {/* Source Tier Badge */}
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-mono font-semibold flex items-center gap-1 ${
              news.sourceTier === 'TIER_1'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : news.sourceTier === 'TIER_2'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : news.sourceTier === 'TIER_4' || news.isVerified === false
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            {news.sourceTier === 'TIER_1' ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            ) : news.isVerified === false ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            ) : null}
            {news.sourceTier === 'TIER_1' ? 'Tier 1 (Official Foundation / Regulatory)' : news.sourceTier === 'TIER_2' ? 'Tier 2 (Verified Media)' : news.sourceTier === 'TIER_4' || !news.isVerified ? 'Unverified Rumor / Leak' : 'Tier 3 (Aggregator)'}
          </span>

          {news.eventType && (
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
              {news.eventType}
            </span>
          )}

          {/* Phase 13: Catalyst Type Badge */}
          {news.catalystType && news.catalystType !== 'UNKNOWN' && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              {news.catalystType.replace(/_/g, ' ')}
            </span>
          )}

          {/* Phase 13: Impact Classification Badge */}
          {news.impactClassification && (
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-black tracking-wide ${
              news.impactClassification === 'PUMP_CATALYST'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : news.impactClassification === 'DUMP_RISK'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : news.impactClassification === 'HIGH_IMPACT'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {news.impactClassification.replace(/_/g, ' ')}
            </span>
          )}

          {/* Phase 13: Rumor / Fake Warning Badge */}
          {news.isFake ? (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-red-950/80 text-red-300 border border-red-500/60 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              DISPUTED / FAKE
            </span>
          ) : news.isRumor ? (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-500/60 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              UNVERIFIED RUMOR
            </span>
          ) : null}
        </div>

        {/* Phase 13: Rumor / Fake Banner */}
        {news.isFake ? (
          <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-xs font-mono text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span><strong>Misleading/Debunked Report:</strong> News intelligence has stripped impact score to 0. Cannot influence technical setups.</span>
          </div>
        ) : news.isRumor ? (
          <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs font-mono text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span><strong>Unverified Rumor Alert:</strong> High fade risk. News is treated as low-confidence confluence only and cannot independently validate signals.</span>
          </div>
        ) : null}

        {/* Title */}
        <h3 className="text-lg font-bold text-slate-100 leading-snug">
          {news.title}
        </h3>

        {/* Meta Info */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400 py-1 border-y border-slate-800/80">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatBangladeshTime(news.publishedAt)} BST ({formatRelativeTime(news.publishedAt)})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-300 font-semibold">{news.source}</span>
            {news.sourceCount && news.sourceCount > 1 && (
              <span className="px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 text-[11px]">
                Merged from {news.sourceCount} sources
              </span>
            )}
          </div>
        </div>

        {/* Supporting sources if multiple */}
        {news.supportingSources && news.supportingSources.length > 1 && (
          <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800 text-xs font-mono">
            <span className="text-slate-500 font-semibold block mb-1">Cross-Referenced Supporting Sources:</span>
            <div className="flex flex-wrap gap-1.5">
              {news.supportingSources.map((s, idx) => (
                <span key={idx} className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 text-[11px]">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Summary Content */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 text-sm text-slate-300 leading-relaxed">
          {news.summary}
        </div>

        {/* Pre-Pump Catalyst Setup Intelligence */}
        {news.prePumpSetup?.isPrePumpCatalyst && (
          <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs font-mono text-emerald-300 space-y-2">
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5 text-sm">
                <Zap className="w-4 h-4 text-emerald-400 animate-pulse" />
                PRE-PUMP CATALYST SETUP DETECTED
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px]">
                Conviction: {news.prePumpSetup.conviction}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-emerald-200/90 pt-1">
              <div>• Compression Score: <strong>{news.prePumpSetup.compressionScore}/100</strong></div>
              <div>• Volume Acceleration: <strong>{news.prePumpSetup.volumeAcceleration ? 'Active' : 'Moderate'}</strong></div>
              {news.prePumpSetup.readinessScore !== undefined && (
                <div>• Setup Readiness: <strong>{news.prePumpSetup.readinessScore}/100</strong></div>
              )}
            </div>
            {news.prePumpSetup.details && news.prePumpSetup.details.length > 0 && (
              <p className="text-[11px] text-emerald-400/90 pt-1 border-t border-emerald-500/20">
                {news.prePumpSetup.details.join(' • ')}
              </p>
            )}
          </div>
        )}

        {/* Post-Pump Exhaustion / Dump Risk Intelligence */}
        {news.exhaustionDumpRisk && (news.exhaustionDumpRisk.status === 'PUMP_EXHAUSTION' || news.exhaustionDumpRisk.status === 'DUMP_RISK') && (
          <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs font-mono text-rose-300 space-y-2">
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5 text-sm">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                {news.exhaustionDumpRisk.status === 'PUMP_EXHAUSTION' ? 'PUMP EXHAUSTION DETECTED' : 'DUMP RISK WARNING'}
              </span>
              {news.exhaustionDumpRisk.exhaustionScore !== undefined && (
                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px]">
                  Exhaustion: {news.exhaustionDumpRisk.exhaustionScore}/100
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-rose-200/90 pt-1">
              <div>• Recent Move: <strong>+{news.exhaustionDumpRisk.abnormalMovePercent}%</strong></div>
              <div>• Climax Volume: <strong>{news.exhaustionDumpRisk.isClimaxVolume ? 'Extreme' : 'Normal'}</strong></div>
              <div>• RSI Climax: <strong>{news.exhaustionDumpRisk.rsiClimax ? 'Overbought Rejection' : 'Normal'}</strong></div>
              <div>• EMA20 Gap: <strong>{typeof news.exhaustionDumpRisk.distanceFromEma20Pct === 'number' ? news.exhaustionDumpRisk.distanceFromEma20Pct.toFixed(1) : '0.0'}%</strong></div>
            </div>
            {news.exhaustionDumpRisk.details && news.exhaustionDumpRisk.details.length > 0 && (
              <p className="text-[11px] text-rose-400/90 pt-1 border-t border-rose-500/20">
                {news.exhaustionDumpRisk.details.join(' • ')}
              </p>
            )}
          </div>
        )}

        {/* Phase 13: Reaction Windows (5m, 15m, 30m, 1h, 4h) */}
        {news.reactionWindows && (
          <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                Reaction Windows (Deterministic Tracking)
              </span>
              <span className="text-[10px] text-slate-400">Zero Data Fabrication</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5 pt-1">
              {(['5m', '15m', '30m', '1h', '4h'] as const).map(period => {
                const win = news.reactionWindows?.[period];
                if (!win) return null;
                const isPositive = typeof win.priceChangePct === 'number' && win.priceChangePct > 0;
                const isNegative = typeof win.priceChangePct === 'number' && win.priceChangePct < 0;
                return (
                  <div key={period} className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-center font-mono">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">{period}</div>
                    <div className={`text-xs font-black mt-0.5 ${
                      win.status === 'PENDING_TIME'
                        ? 'text-slate-500'
                        : isPositive
                        ? 'text-emerald-400'
                        : isNegative
                        ? 'text-rose-400'
                        : 'text-slate-300'
                    }`}>
                      {win.status === 'PENDING_TIME'
                        ? 'Pending'
                        : win.priceChangePct !== null
                        ? `${win.priceChangePct > 0 ? '+' : ''}${win.priceChangePct.toFixed(1)}%`
                        : 'N/A'}
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5">
                      {win.volumeRatio !== null ? `${win.volumeRatio.toFixed(1)}x Vol` : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Phase 13: Reaction Conflict & Technical Alignment */}
        {news.reactionConflict && news.reactionConflict !== 'NONE' && (
          <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs font-mono text-amber-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Conflict Warning: {news.reactionConflict.replace(/_/g, ' ')}
            </div>
            {news.conflictWarning && (
              <p className="text-[11px] text-amber-200/90">{news.conflictWarning}</p>
            )}
          </div>
        )}

        {news.technicalAlignment && news.technicalAlignment !== 'NEUTRAL' && (
          <div className={`p-2.5 rounded-xl text-xs font-mono font-bold flex items-center justify-between ${
            news.technicalAlignment === 'SUPPORTS_LONG'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : news.technicalAlignment === 'SUPPORTS_SHORT'
              ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
              : news.technicalAlignment === 'CONTRADICTS_SETUP'
              ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
              : 'bg-slate-800/80 border border-slate-700 text-slate-300'
          }`}>
            <span>Technical Confluence: {news.technicalAlignment.replace(/_/g, ' ')}</span>
            <span className="text-[10px] opacity-80">Confluence Factor (Not Signal Generator)</span>
          </div>
        )}

        {/* Market Reaction Correlation Intelligence */}
        {news.marketReaction && news.marketReaction.state !== 'UNKNOWN' && (
          <div className={`p-3.5 rounded-xl text-xs font-mono space-y-1.5 ${
            news.marketReaction.state === 'CONFIRMED'
              ? 'bg-emerald-950/40 border border-emerald-500/20 text-emerald-300'
              : news.marketReaction.state === 'REJECTED' || news.marketReaction.isContradicted
              ? 'bg-rose-950/40 border border-rose-500/20 text-rose-300'
              : 'bg-slate-950/60 border border-slate-800 text-slate-300'
          }`}>
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5">
                <Activity className="w-4 h-4" />
                MARKET REACTION: {news.marketReaction.state.replace(/_/g, ' ')}
              </span>
              <span className="text-[11px]">
                RVOL: {news.marketReaction.rvolPostNews}x | Δ {news.marketReaction.priceChangePostNewsPct > 0 ? '+' : ''}{news.marketReaction.priceChangePostNewsPct}%
              </span>
            </div>
            <p className="text-[11px] opacity-90">{news.marketReaction.details}</p>
            {news.marketReaction.contradictionWarning && (
              <div className="text-[11px] font-bold text-rose-400 bg-rose-950/60 p-2 rounded-lg border border-rose-800/60 mt-1">
                ⚠️ {news.marketReaction.contradictionWarning}
              </div>
            )}
          </div>
        )}

        {/* Related Coins */}
        <div className="flex flex-wrap gap-1.5">
          {(news.relatedCoins || []).map((coin) => (
            <span
              key={coin}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                coin === news.primaryCoin
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              #{coin}
            </span>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Verified Catalyst Intelligence Network</span>
          </div>

          {news.url && (
            <a
              href={news.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors"
            >
              <span>Original Source</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

