import React from 'react';
import { Zap, Github } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
                <Zap className="w-5 h-5 text-white fill-white" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                StreamForge
            </h1>
        </div>
        <div className="flex items-center gap-4">
            <a href="#" className="text-zinc-400 hover:text-white transition-colors">
                <Github className="w-5 h-5" />
            </a>
        </div>
      </div>
    </header>
  );
};