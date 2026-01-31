
import React from 'react';

interface ProgressBarProps {
  progress: number;
  label: string;
  subLabel?: string;
  color?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, label, subLabel, color = 'bg-blue-600' }) => {
  const isFinished = progress >= 100;

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-end">
        <div>
            <span className="text-sm font-medium text-zinc-200 block">{label}</span>
            {subLabel && <span className="text-xs text-zinc-500">{subLabel}</span>}
        </div>
        <span className="text-sm font-bold text-zinc-300">{Math.round(progress)}%</span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden ring-1 ring-white/5">
        <div 
          className={`h-2.5 rounded-full transition-all duration-300 ease-out relative overflow-hidden ${color} ${!isFinished ? 'animate-pulse' : ''}`} 
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        >
          {/* Shine effect for active progress */}
          {!isFinished && (
            <div className="absolute inset-0 bg-white/20 w-full -translate-x-full animate-[shimmer_2s_infinite]"></div>
          )}
        </div>
      </div>
    </div>
  );
};
