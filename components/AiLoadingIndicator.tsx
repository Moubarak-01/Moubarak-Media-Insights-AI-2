import React from 'react';
import { SpinnerIcon } from './icons';

export const AiLoadingIndicator: React.FC = () => {
  return (
    <div className="flex items-center gap-2 p-2 text-slate-400">
      <SpinnerIcon className="w-5 h-5" />
      <span className="font-semibold text-sm animate-pulse">Processing...</span>
    </div>
  );
};