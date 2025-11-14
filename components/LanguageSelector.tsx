import React from 'react';
import { Language } from '../types';

interface LanguageSelectorProps {
  selectedLanguage: Language;
  onSelectLanguage: (language: Language) => void;
}

const languages: Language[] = ['English', 'French', 'Chinese', 'Japanese'];

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ selectedLanguage, onSelectLanguage }) => {
  return (
    <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 shadow-lg">
      <label htmlFor="language-select" className="block text-xl font-semibold mb-3 text-slate-200">
        Choose Summary Language
      </label>
      <select
        id="language-select"
        value={selectedLanguage}
        onChange={(e) => onSelectLanguage(e.target.value as Language)}
        className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-lg text-white focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none"
      >
        {languages.map(lang => (
          <option key={lang} value={lang}>{lang}</option>
        ))}
      </select>
    </div>
  );
};
