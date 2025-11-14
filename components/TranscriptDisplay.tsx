import React, { useState } from 'react';

interface TranscriptDisplayProps {
  transcript: string;
}

export const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({ transcript }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 shadow-lg">
      <div className="p-4 flex justify-between items-center cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <h2 className="text-xl font-semibold text-slate-200">Transcription</h2>
        <button className="text-sm font-semibold text-yellow-400 hover:text-yellow-300">
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {isExpanded && (
        <div className="p-4 border-t border-slate-700">
          <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">
            {transcript}
          </p>
        </div>
      )}
    </div>
  );
};
