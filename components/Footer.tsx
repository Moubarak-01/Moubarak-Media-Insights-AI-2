import React from 'react';
import { TtsVoiceState } from '../types';
import { UserIcon, UserFemaleIcon } from './icons';

// A simple speaker icon for the TTS toggle
const SpeakerIcon: React.FC<React.SVGProps<SVGSVGElement> & { muted: boolean }> = ({ muted, ...props }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        {muted ? (
            <line x1="23" y1="9" x2="17" y2="15" />
        ) : (
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        )}
    </svg>
);


interface FooterProps {
    ttsVoice: TtsVoiceState;
    onTtsToggle: () => void;
}

export const Footer: React.FC<FooterProps> = ({ ttsVoice, onTtsToggle }) => {
  const currentYear = new Date().getFullYear();

  const handleToggleClick = () => {
    // Always cancel any ongoing speech when the button is clicked.
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    // Then call the passed handler to cycle the state.
    onTtsToggle();
  };

  const getTtsState = () => {
    switch (ttsVoice) {
      case 'off':
        return {
          title: 'Enable Text-to-Speech (Male Voice)',
          icon: <SpeakerIcon muted={true} className="w-5 h-5" />,
        };
      case 'default':
        return {
          title: 'Switch to Female Voice',
          icon: <UserIcon className="w-5 h-5" />,
        };
      case 'female':
        return {
          title: 'Disable Text-to-Speech',
          icon: <UserFemaleIcon className="w-5 h-5" />,
        };
    }
  };

  const { title, icon } = getTtsState();

  return (
    <footer className="relative text-center p-4 mt-auto text-sm text-slate-500">
      <p>
        © {currentYear} Moubarak Media Insights. Unlock insights, empower decisions. By{' '}
        <span className="font-semibold bg-gradient-to-r from-blue-400 via-purple-500 to-red-500 text-transparent bg-clip-text animate-gradient">
          Moubarak
        </span>
      </p>
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        <button 
            onClick={handleToggleClick}
            title={title}
            className={`p-2 rounded-full transition-colors ${
                ttsVoice !== 'off' ? 'bg-yellow-600/20 text-yellow-400' : 'text-slate-500 hover:bg-slate-700 hover:text-slate-200'
            }`}
        >
            {icon}
        </button>
      </div>
    </footer>
  );
};