import React from 'react';

interface Props {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const MoonScoreGauge: React.FC<Props> = React.memo(({ score, size = 'md', showLabel = true }) => {
  const safeScore = Math.max(0, Math.min(100, score || 0));
  
  const radius = size === 'sm' ? 18 : size === 'lg' ? 36 : 24;
  const stroke = size === 'sm' ? 3.5 : size === 'lg' ? 6 : 4.5;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (safeScore / 100) * circumference;

  let colorClass = 'text-amber-400 stroke-amber-400';
  let bgGlow = 'rgba(251, 191, 36, 0.15)';
  if (safeScore >= 85) {
    colorClass = 'text-emerald-400 stroke-emerald-400';
    bgGlow = 'rgba(52, 211, 153, 0.2)';
  } else if (safeScore < 70) {
    colorClass = 'text-slate-400 stroke-slate-400';
    bgGlow = 'rgba(148, 163, 184, 0.1)';
  }

  const dimension = radius * 2;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative flex items-center justify-center" style={{ width: dimension, height: dimension }}>
        <svg height={dimension} width={dimension} className="transform -rotate-90">
          <circle
            stroke="rgba(255,255,255,0.08)"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          <circle
            className={`transition-all duration-700 ease-out ${colorClass}`}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={circumference + ' ' + circumference}
            style={{ strokeDashoffset }}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className={`font-mono font-bold ${size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-sm'} text-slate-100`}>
            {safeScore}
          </span>
        </div>
      </div>
      {showLabel && (
        <span className="text-[10px] font-mono tracking-wider text-slate-400 mt-1 uppercase">
          MoonScore
        </span>
      )}
    </div>
  );
});
