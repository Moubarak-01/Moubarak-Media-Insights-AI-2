import React from 'react';

interface LoaderProps {
  message: string;
  onCancel?: () => void;
}

export const Loader: React.FC<LoaderProps> = ({ message, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-50">
      <div className="w-16 h-16 border-4 border-slate-500 border-t-yellow-400 rounded-full animate-spinner"></div>
      <p className="mt-4 text-lg font-semibold text-slate-200">{message}</p>
      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-md transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  );
};