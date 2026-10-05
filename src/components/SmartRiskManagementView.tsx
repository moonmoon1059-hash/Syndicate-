import React, { useState } from 'react';
import { Signal, PositionSizingParams } from '../types/crypto';
import { calculatePositionSizing, MANDATORY_LEVERAGE_WARNING } from '../../server/smartRiskEngine';
import { formatPrice } from '../utils/formatters';
import {
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Scale,
  DollarSign,
  Layers,
  ArrowRight,
  Activity,
  Compass,
  CheckCircle2,
  Info
} from 'lucide-react';

interface Props {
  signal: Signal;
}

export const SmartRiskManagementView: React.FC<Props> = ({ signal }) => {
  const [accountEquity, setAccountEquity] = useState<number>(10000);
  const [riskPercentage, setRiskPercentage] = useState<number>(1.0);
  const [leverage, setLeverage] = useState<number>(1);

  const smartRisk = signal.smartRiskReport;
  const isLong = signal.direction === 'LONG';
  const entryPrice = signal.entryPrice || signal.currentPrice;
  const stopLossPrice =
    smartRisk?.structuralStopLoss?.price && typeof smartRisk.structuralStopLoss.price === 'number'
      ? smartRisk.structuralStopLoss.price
      : signal.stopLoss;

  // Interactive deterministic position sizing calculation
  const sizingResult = calculatePositionSizing({
    accountEquity,
    riskPercentage,
    entryPrice,
    stopLossPrice,
    leverage
  });

  const leverageRisk = smartRisk?.leverageRisk;
  const derivativesRisk = smartRisk?.derivativesRisk;
  const lifecycle = smartRisk?.lifecycle;
  const structuralSL = smartRisk?.structuralStopLoss;
  const riskReward = smartRisk?.riskReward;

  const getLeverageBadgeClass = (riskLevel?: string) => {
    switch (riskLevel) {
      case 'LOW_RISK_CONTEXT':
        return 'bg-emerald-950 text-emerald-300 border-emerald-800';
      case 'MODERATE_RISK_CONTEXT':
        return 'bg-cyan-950 text-cyan-300 border-cyan-800';
      case 'HIGH_RISK_CONTEXT':
        return 'bg-amber-950 text-amber-300 border-amber-800';
      case 'EXTREME_RISK_CONTEXT':
        return 'bg-rose-950 text-rose-300 border-rose-800 animate-pulse';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const getLifecycleStateBadgeClass = (state?: string) => {
    switch (state) {
      case 'PROFIT_LOCKED':
        return 'bg-emerald-950 text-emerald-300 border-emerald-700';
      case 'STRUCTURAL_TRAILING':
        return 'bg-cyan-950 text-cyan-300 border-cyan-700';
      case 'BREAK_EVEN':
        return 'bg-blue-950 text-blue-300 border-blue-700';
      case 'ORIGINAL_SL':
        return 'bg-indigo-950 text-indigo-300 border-indigo-700';
      case 'CLOSED':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      case 'INVALIDATED':
        return 'bg-rose-950 text-rose-300 border-rose-700';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="p-4 rounded-xl bg-slate-950/80 border border-indigo-500/30 space-y-4 font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-indigo-400" />
          <span className="text-slate-100 font-black tracking-tight text-sm">
            SMART RISK & TRADE MANAGEMENT SYSTEM
          </span>
          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold">
            PHASE 9
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {leverageRisk && (
            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getLeverageBadgeClass(leverageRisk.riskLevel)}`}>
              LEVERAGE CONTEXT: {leverageRisk.riskLevel.replace(/_/g, ' ')}
            </span>
          )}
          {lifecycle && (
            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getLifecycleStateBadgeClass(lifecycle.state)}`}>
              LIFECYCLE: {lifecycle.state.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </div>

      {/* Grid: Structural SL + R:R Ladder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Structural Stop Loss Card */}
        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-cyan-400 font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              Structural Stop Loss Anchor
            </span>
            <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-bold">
              {structuralSL?.basis ? structuralSL.basis.replace(/_/g, ' ') : 'SWING STRUCTURE'}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <div>
              <span className="text-slate-500 text-[10px] block">Invalidation Price</span>
              <span className="text-lg font-bold text-rose-400 font-mono">
                {stopLossPrice ? formatPrice(stopLossPrice) : 'UNKNOWN'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 text-[10px] block">Risk Distance</span>
              <span className="text-sm font-bold text-amber-300 font-mono">
                {structuralSL?.distancePct !== 'UNKNOWN' && structuralSL?.distancePct !== undefined
                  ? `${structuralSL.distancePct}%`
                  : 'STRUCTURAL'}
              </span>
            </div>
          </div>

          {structuralSL?.invalidationAnchor !== 'UNKNOWN' && structuralSL?.invalidationAnchor !== undefined && (
            <div className="text-[11px] text-slate-300 bg-slate-950/60 p-2 rounded border border-slate-800/60">
              <div className="text-slate-400 text-[10px]">
                Anchor Level: <strong className="text-slate-200">${Number(structuralSL.invalidationAnchor).toFixed(4)}</strong> (ATR buffer: +${Number(structuralSL.atrBufferUsed).toFixed(4)})
              </div>
              <div className="text-slate-400 text-[10px] mt-0.5">
                {smartRisk?.invalidationCriteria || 'Valid as long as key market structure holds.'}
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Risk-Reward Ladder */}
        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              Dynamic R:R Ladder & Asymmetry
            </span>
            {riskReward?.isAsymmetric && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-black animate-pulse">
                ⚡ ASYMMETRIC SETUP (1:{riskReward.maxStructuralRR})
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
            <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
              <span className="text-slate-500 text-[10px] block">TP1 R:R</span>
              <span className="text-slate-200 font-bold text-xs">
                1:{riskReward?.tp1RR !== 'UNKNOWN' && riskReward?.tp1RR !== undefined ? riskReward.tp1RR : '2.0'}
              </span>
            </div>
            <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
              <span className="text-slate-500 text-[10px] block">TP2 R:R</span>
              <span className="text-emerald-300 font-bold text-xs">
                1:{riskReward?.tp2RR !== 'UNKNOWN' && riskReward?.tp2RR !== undefined ? riskReward.tp2RR : '4.5'}
              </span>
            </div>
            <div className="p-1.5 rounded bg-slate-950/80 border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Max Structural</span>
              <span className="text-amber-300 font-bold text-xs">
                1:{riskReward?.maxStructuralRR !== 'UNKNOWN' && riskReward?.maxStructuralRR !== undefined ? riskReward.maxStructuralRR : '10.0+'}
              </span>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 bg-slate-950/60 p-1.5 rounded border border-slate-800/60">
            Multi-target preservation protects capital at TP1 and locks exponential runner gains at TP2/TP3.
          </div>
        </div>
      </div>

      {/* Interactive Deterministic Position Sizing Engine */}
      <div className="p-3 rounded-lg bg-slate-900/80 border border-indigo-500/20 space-y-3">
        <div className="flex items-center justify-between text-slate-300 flex-wrap gap-2">
          <span className="text-indigo-300 font-bold flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-indigo-400" />
            Deterministic Position Sizing & Margin Simulator
          </span>
          <span className="text-[10px] text-slate-400">
            Strict Dollar Risk Governing Math
          </span>
        </div>

        {/* Input Parameters Form */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Account Equity ($)</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500">$</span>
              <input
                type="number"
                value={accountEquity}
                onChange={(e) => setAccountEquity(Math.max(10, Number(e.target.value)))}
                className="w-full pl-6 pr-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs focus:border-indigo-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Risk per Trade (%)</label>
            <div className="relative">
              <input
                type="number"
                step="0.25"
                value={riskPercentage}
                onChange={(e) => setRiskPercentage(Math.max(0.1, Number(e.target.value)))}
                className="w-full px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs focus:border-indigo-500 focus:outline-hidden"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500">%</span>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Leverage (x)</label>
            <select
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs focus:border-indigo-500 focus:outline-hidden"
            >
              <option value={1}>1x (Spot / No Leverage)</option>
              <option value={2}>2x Leverage (Conservative)</option>
              <option value={3}>3x Leverage</option>
              <option value={5}>5x Leverage</option>
              <option value={10}>10x Leverage (High Risk)</option>
            </select>
          </div>
        </div>

        {/* Real-Time Sizing Outputs */}
        {sizingResult.status === 'CALCULATED' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono">
            <div className="p-2 rounded bg-slate-950/90 border border-slate-800">
              <span className="text-slate-500 text-[10px] block uppercase">Max $ Risk</span>
              <span className="text-rose-400 font-bold text-xs">
                ${sizingResult.riskAmountUsd?.toFixed(2)}
              </span>
            </div>
            <div className="p-2 rounded bg-slate-950/90 border border-slate-800">
              <span className="text-slate-500 text-[10px] block uppercase">Position Units</span>
              <span className="text-slate-100 font-bold text-xs">
                {sizingResult.positionUnits?.toFixed(4)}
              </span>
            </div>
            <div className="p-2 rounded bg-slate-950/90 border border-slate-800">
              <span className="text-slate-500 text-[10px] block uppercase">Notional Value</span>
              <span className="text-indigo-300 font-bold text-xs">
                ${sizingResult.notionalValueUsd?.toFixed(2)}
              </span>
            </div>
            <div className="p-2 rounded bg-slate-950/90 border border-slate-800">
              <span className="text-slate-500 text-[10px] block uppercase">Margin Required</span>
              <span className="text-emerald-400 font-bold text-xs">
                ${sizingResult.estimatedMarginUsd?.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Trade Lifecycle Progression & History */}
      {lifecycle && (
        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-cyan-400 font-bold flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              Trade Lifecycle Progression & Protection Engine
            </span>
            <span className="text-slate-400 text-[10px]">
              Current Price: ${formatPrice(lifecycle.currentPrice)} (Unrealized: {lifecycle.unrealizedPnLPct >= 0 ? '+' : ''}{lifecycle.unrealizedPnLPct}%)
            </span>
          </div>

          {/* Stepper visualization */}
          <div className="grid grid-cols-4 gap-1.5 pt-1 text-center text-[10px] font-mono">
            <div className={`p-1.5 rounded border ${
              lifecycle.state === 'ORIGINAL_SL'
                ? 'bg-indigo-950/80 text-indigo-300 border-indigo-600 font-bold'
                : 'bg-slate-950/40 text-slate-500 border-slate-800'
            }`}>
              1. Original SL
            </div>
            <div className={`p-1.5 rounded border ${
              lifecycle.state === 'BREAK_EVEN'
                ? 'bg-blue-950/80 text-blue-300 border-blue-600 font-bold'
                : lifecycle.tp1Hit
                ? 'bg-slate-900 text-slate-300 border-slate-700'
                : 'bg-slate-950/40 text-slate-500 border-slate-800'
            }`}>
              2. Break-Even
            </div>
            <div className={`p-1.5 rounded border ${
              lifecycle.state === 'STRUCTURAL_TRAILING'
                ? 'bg-cyan-950/80 text-cyan-300 border-cyan-600 font-bold'
                : 'bg-slate-950/40 text-slate-500 border-slate-800'
            }`}>
              3. Trailing SL
            </div>
            <div className={`p-1.5 rounded border ${
              lifecycle.state === 'PROFIT_LOCKED'
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600 font-bold'
                : 'bg-slate-950/40 text-slate-500 border-slate-800'
            }`}>
              4. Profit Locked
            </div>
          </div>

          {/* Transition History log */}
          {lifecycle.stateHistory && lifecycle.stateHistory.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80 space-y-1">
              <span className="text-[10px] text-slate-500 block uppercase">Lifecycle Event Audit:</span>
              <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                {lifecycle.stateHistory.map((h, i) => (
                  <div key={i} className="text-[10px] text-slate-300 flex items-start gap-1.5 bg-slate-950/50 p-1.5 rounded">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-100">{h.toState.replace(/_/g, ' ')}:</strong> {h.reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Derivatives Risk & Squeeze Context */}
      {derivativesRisk && derivativesRisk.riskContext !== 'UNKNOWN' && (
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] space-y-1.5">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-purple-400 font-bold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              Derivatives Crowding & Squeeze Risk
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
              derivativesRisk.riskContext === 'NORMAL'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                : 'bg-amber-950 text-amber-300 border-amber-800'
            }`}>
              {derivativesRisk.riskContext.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="text-slate-400 text-[10px]">
            {derivativesRisk.summary}
          </div>
          {derivativesRisk.riskWarnings.length > 0 && (
            <div className="text-rose-400 text-[10px] font-bold">
              ⚠️ {derivativesRisk.riskWarnings[0]}
            </div>
          )}
        </div>
      )}

      {/* Mandatory Risk Warning Invariant */}
      <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-900/50 flex items-start gap-2 text-rose-300/90 text-[10px]">
        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-rose-400 block uppercase font-bold">Mandatory Risk Notice:</strong>
          <span>{MANDATORY_LEVERAGE_WARNING}</span>
        </div>
      </div>
    </div>
  );
};
