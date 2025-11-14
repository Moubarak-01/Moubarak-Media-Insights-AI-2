import React, { useState, useEffect } from 'react';
import { SpinnerIcon } from './icons';

interface ProcessingOverlayProps {
  message: string;
}

const DYNAMIC_MESSAGES = [
    "Analyzing details...",
    "Just a moment...",
    "Putting it all together...",
    "Running calculations...",
    "Thanks for your patience...",
];

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({ message }) => {
  const [dynamicMessage, setDynamicMessage] = useState(DYNAMIC_MESSAGES[0]);

  useEffect(() => {
    // Cycle through the dynamic messages every 3 seconds
    const intervalId = setInterval(() => {
      setDynamicMessage(prev => {
        const currentIndex = DYNAMIC_MESSAGES.indexOf(prev);
        const nextIndex = (currentIndex + 1) % DYNAMIC_MESSAGES.length;
        return DYNAMIC_MESSAGES[nextIndex];
      });
    }, 3000);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="absolute inset-0 bg-slate-800/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-lg p-4">
      <SpinnerIcon className="w-8 h-8" />
      <p className="mt-3 text-sm font-semibold text-slate-300 text-center">
          {message}
      </p>
      <p className="mt-1 text-xs text-slate-400 text-center h-4">
          {dynamicMessage}
      </p>
    </div>
  );
};