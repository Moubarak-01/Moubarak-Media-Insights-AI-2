import React, { useState, useCallback, useRef } from 'react';
import { Language } from '../types';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { UploadIcon, MicIcon, StopCircleIcon, SpinnerIcon } from './icons';

interface SummarizerInterfaceProps {
  onFileSubmit: (file: File, language: Language) => void;
  isProcessing: boolean;
}

const languages: Language[] = ['English', 'French', 'Chinese', 'Japanese'];

const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const SummarizerInterface: React.FC<SummarizerInterfaceProps> = ({ onFileSubmit, isProcessing }) => {
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('English');
  const [mode, setMode] = useState<'upload' | 'record'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAudioProcessed = (file: File) => {
    onFileSubmit(file, selectedLanguage);
  };
  
  const { isRecording, startRecording, stopRecording, recordingTime, micVolume } = useAudioRecorder(handleAudioProcessed);

  const handleFile = (file: File | undefined) => {
    if (!file || isProcessing) return;

    const MAX_SIZE_MB = 2 * 1024; // 2GB
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
    
    if (file.size > MAX_SIZE_BYTES) {
      alert(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). The limit is 2GB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    
    onFileSubmit(file, selectedLanguage);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
  };
  
  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (isProcessing) return;
    handleFile(event.dataTransfer.files?.[0]);
  }, [onFileSubmit, isProcessing, selectedLanguage]);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => event.preventDefault();
  const handleDragEnter = () => !isProcessing && setIsDragging(true);
  const handleDragLeave = () => setIsDragging(false);
  const handleUploadClick = () => fileInputRef.current?.click();

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 md:p-8 animate-fade-in">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        {/* Language Selector */}
        <div>
          <label htmlFor="language-select" className="block text-sm font-medium text-slate-300 mb-2">Choose Summary Language</label>
          <div className="relative">
            <select
              id="language-select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value as Language)}
              disabled={isProcessing}
              className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-white focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none appearance-none pr-8"
              style={{border: selectedLanguage ? '1px solid #facc15' : ''}}
            >
              {languages.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
             <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-300">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M5.516 7.548c.436-.446 1.144-.446 1.58 0L10 10.404l2.904-2.856c.436-.446 1.144-.446 1.58 0 .436.446.436 1.168 0 1.614l-3.694 3.63c-.436.446-1.144.446-1.58 0L5.516 9.162c-.436-.446-.436-1.168 0-1.614z"/></svg>
            </div>
          </div>
        </div>

        {/* Media Input Section */}
        <div className="bg-slate-800/50 rounded-lg border border-slate-700">
          <div className="flex border-b border-slate-700">
            <button 
              onClick={() => setMode('upload')}
              disabled={isProcessing}
              className={`px-4 py-2 font-semibold text-sm ${mode === 'upload' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-slate-400 hover:text-slate-200'} disabled:opacity-50 transition-colors`}
            >
              Upload File
            </button>
            <button 
              onClick={() => setMode('record')}
              disabled={isProcessing}
              className={`px-4 py-2 font-semibold text-sm ${mode === 'record' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-slate-400 hover:text-slate-200'} disabled:opacity-50 transition-colors`}
            >
              Record Audio
            </button>
          </div>

          {mode === 'upload' && (
            <div 
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onClick={handleUploadClick}
                className={`p-8 m-4 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
                    isDragging ? 'border-yellow-400 bg-slate-700/50' : 'border-slate-600 hover:border-slate-500'
                } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" disabled={isProcessing} />
                <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                    {isProcessing ? (
                        <>
                            <SpinnerIcon className="w-10 h-10 text-yellow-400" />
                            <p className="font-semibold mt-2">Processing file...</p>
                        </>
                    ) : (
                        <>
                            <UploadIcon className="w-10 h-10" />
                            <p className="font-semibold">Drag & drop a media file here, or click to select</p>
                            <p className="text-xs">Supported: MP3, WAV, MP4, MOV, PDF, DOCX, TXT, etc.</p>
                            <p className="text-xs">Max size: Up to 2GB</p>
                        </>
                    )}
                </div>
            </div>
          )}

          {mode === 'record' && (
            <div className="flex flex-col items-center justify-center gap-6 p-8 m-4">
              {isRecording ? (
                <>
                  <div className="text-3xl font-mono text-slate-200">{formatTime(recordingTime)}</div>
                   <div className="w-full max-w-xs h-2 bg-slate-700 rounded-full overflow-hidden my-1">
                    <div className="h-full bg-yellow-400 transition-all duration-75" style={{ width: `${micVolume * 100}%` }}></div>
                  </div>
                  <button onClick={stopRecording} className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-full text-md transition-colors">
                    <StopCircleIcon className="w-5 h-5" />
                    <span>Stop Recording</span>
                  </button>
                </>
              ) : (
                 <>
                  {isProcessing ? (
                     <>
                        <SpinnerIcon className="w-10 h-10 text-yellow-400" />
                        <p className="font-semibold mt-2 text-slate-400">Processing audio...</p>
                    </>
                  ) : (
                     <>
                        <p className="text-slate-400 text-sm">Click the button to start recording from your microphone.</p>
                        <button onClick={startRecording} disabled={isProcessing} className="flex items-center gap-2 px-6 py-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded-full text-md transition-colors disabled:opacity-50">
                            <MicIcon className="w-5 h-5" />
                            <span>Start Recording</span>
                        </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
