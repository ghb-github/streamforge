import React, { useEffect, useRef } from 'react';
import { LogMessage, LogType } from '../types';
import { Terminal as TerminalIcon, XCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

interface TerminalProps {
  logs: LogMessage[];
}

export const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getIcon = (type: LogMessage['type']) => {
    switch (type) {
      case LogType.ERROR: return <XCircle className="w-4 h-4 text-red-500" />;
      case LogType.SUCCESS: return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case LogType.WARNING: return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default: return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  const getColor = (type: LogMessage['type']) => {
    switch (type) {
      case LogType.ERROR: return 'text-red-400';
      case LogType.SUCCESS: return 'text-green-400';
      case LogType.WARNING: return 'text-yellow-400';
      default: return 'text-zinc-300';
    }
  };

  return (
    <div className="w-full bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden shadow-xl flex flex-col h-64 md:h-80">
      <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
        <TerminalIcon className="w-4 h-4 text-zinc-400" />
        <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">System Log</span>
      </div>
      <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto font-mono text-sm space-y-1.5 scrollbar-hide">
        {logs.length === 0 ? (
            <div className="text-zinc-600 italic text-xs">Waiting for input...</div>
        ) : (
            logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                <span className="text-zinc-600 text-[10px] mt-0.5 whitespace-nowrap">
                {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second:'2-digit' })}
                </span>
                <div className="mt-0.5">{getIcon(log.type)}</div>
                <span className={`break-all ${getColor(log.type)}`}>{log.message}</span>
            </div>
            ))
        )}
      </div>
    </div>
  );
};