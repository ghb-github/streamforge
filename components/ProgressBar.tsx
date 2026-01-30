import React from 'react';

interface ProgressBarProps {
  progress: number;
  label: string;
  subLabel?: string;
  color?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, label, subLabel, color = 'bg-blue-600' }) => {
  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-end">
        <div>
            <span className="text-sm font-medium text-zinc-200 block">{label}</span>
            {subLabel && <span className="text-xs text-zinc-500">{subLabel}</span>}
        </div>
        <span className="text-sm font-bold text-zinc-300">{Math.round(progress)}%</span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
        <div 
          className={`h-2.5 rounded-full transition-all duration-300 ease-out ${color}`} 
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        ></div>
      </div>
    </div>
  );
};