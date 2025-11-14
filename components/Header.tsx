import React from 'react';
import { MenuIcon, XIcon } from './icons';

interface HeaderProps {
  onToggleHistory: () => void;
  isHistoryVisible: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onToggleHistory, isHistoryVisible }) => {
  return (
    <header className="bg-slate-900/50 backdrop-blur-sm border-b border-slate-700/50 sticky top-0 z-10">
      <div className="container mx-auto p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
            <button onClick={onToggleHistory} className="p-2 rounded-md hover:bg-slate-700 transition-colors">
            {isHistoryVisible ? <XIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
            </button>
            <div className="flex items-center gap-3">
                <img src="./download.png" alt="Moubarak Media Insights AI Logo" className="h-8 w-8 rounded-lg" />
                <div>
                  <h1 className="text-xl font-bold text-slate-100 tracking-tight">
                    Moubarak Media Insights
                  </h1>
                  <p className="text-xs font-semibold text-yellow-400 -mt-1">AI Edition</p>
                </div>
            </div>
        </div>
      </div>
    </header>
  );
};