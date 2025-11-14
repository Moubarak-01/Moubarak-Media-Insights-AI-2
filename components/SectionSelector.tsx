import React from 'react';
import { ChatMode } from '../types';

interface SectionSelectorProps {
  activeSection: ChatMode;
  onSectionChange: (mode: ChatMode) => void;
}

const sections: { id: ChatMode; label: string; description: string }[] = [
  { id: 'General', label: '🤖 General Chat', description: 'All-purpose assistant for questions, coding, and more.' },
  { id: 'Summarizer', label: '📄 Summarizer', description: 'Generate concise summaries from text or files.' },
  { id: 'File Analyzer', label: '🖼️ File Analyzer', description: 'Analyze images, PDFs, and other documents.' },
];

export const SectionSelector: React.FC<SectionSelectorProps> = ({ activeSection, onSectionChange }) => {
    return (
        <div className="p-2 space-y-2">
            <div className="flex flex-col gap-1">
                {sections.map(section => (
                    <button
                        key={section.id}
                        onClick={() => onSectionChange(section.id)}
                        className={`w-full text-left px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 flex items-center gap-3 ${
                            activeSection === section.id
                                ? 'bg-yellow-600/20 text-yellow-300'
                                : 'text-slate-300 hover:bg-slate-700'
                        }`}
                    >
                        <span className="text-lg">{section.label.split(' ')[0]}</span>
                        <span>{section.label.substring(section.label.indexOf(' ') + 1)}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};