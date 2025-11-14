import React from 'react';

interface ResultsDisplayProps {
  transcript: string;
  summary: string;
}

const ResultCard: React.FC<{ title: string; content: string }> = ({ title, content }) => (
    <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 shadow-lg flex-1 min-h-[200px]">
        <h3 className="text-lg font-semibold text-cyan-400 mb-3">{title}</h3>
        {content ? (
            <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{content}</p>
        ) : (
            <div className="flex items-center justify-center h-full">
                <p className="text-slate-500 italic">Waiting for audio to be processed...</p>
            </div>
        )}
    </div>
);


export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ transcript, summary }) => {
  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-xl font-semibold text-slate-200">2. Review Insights</h2>
      <div className="flex flex-col gap-6">
        <ResultCard title="Transcript" content={transcript} />
        <ResultCard title="Summary" content={summary} />
      </div>
    </div>
  );
};
