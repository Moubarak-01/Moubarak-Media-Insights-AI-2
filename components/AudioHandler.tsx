import React, { useState, useCallback, useRef } from 'react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { UploadIcon, MicIcon, StopCircleIcon, SpinnerIcon } from './icons';

interface AudioHandlerProps {
  onAudioProcessed: (file: File) => void;
  isProcessing: boolean;
  processingMessage: string;
  onCancel: () => void;
}

const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const AudioHandler: React.FC<AudioHandlerProps> = ({ onAudioProcessed, isProcessing, processingMessage, onCancel }) => {
  const [mode, setMode] = useState<'upload' | 'record'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isRecording, startRecording, stopRecording, recordingTime, micVolume } = useAudioRecorder(onAudioProcessed);

  const handleFile = (file: File | undefined) => {
    if (!file) return;

    // The Google AI File API has a 2GB per-file limit. This is a much safer
    // and more reliable way to handle large files than loading them into browser memory.
    const MAX_SIZE_MB = 2 * 1024; // 2GB
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
    const WARNING_SIZE_MB = 750; // Warn for files over 750MB as upload can still be slow
    const WARNING_SIZE_BYTES = WARNING_SIZE_MB * 1024 * 1024;

    // Check file type
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
      alert('Please select an audio or video file.');
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    
    // Check file size against the API's hard limit
    if (file.size > MAX_SIZE_BYTES) {
      alert(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). The API has a hard limit of 2GB per file. Please select a smaller file.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Warn for very large files about upload time
    if (file.size > WARNING_SIZE_BYTES) {
      if (!window.confirm(`This file is very large (${(file.size / (1024 * 1024)).toFixed(0)}MB). The upload may take several minutes depending on your connection speed. Do you want to continue?`)) {
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }
    
    onAudioProcessed(file);
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
  }, [onAudioProcessed, isProcessing]);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  
  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isProcessing) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleUploadClick = () => {
      fileInputRef.current?.click();
  }

  return (
    <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 shadow-lg">
      <h2 className="text-xl font-semibold text-slate-200 mb-4">1. Provide Media (Audio/Video)</h2>
      
      {isProcessing ? (
          <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
              <SpinnerIcon className="w-10 h-10 text-yellow-400" />
              <p className="font-semibold text-slate-300">{processingMessage}</p>
              <button 
                onClick={onCancel}
                className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-md transition-colors"
              >
                Cancel
              </button>
          </div>
      ) : (
        <>
          <div className="flex border-b border-slate-700 mb-4">
            <button 
              onClick={() => setMode('upload')}
              disabled={isProcessing}
              className={`px-4 py-2 font-semibold ${mode === 'upload' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-slate-400 hover:text-slate-200'} disabled:opacity-50 transition-colors`}
            >
              Upload File
            </button>
            <button 
              onClick={() => setMode('record')}
              disabled={isProcessing}
              className={`px-4 py-2 font-semibold ${mode === 'record' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-slate-400 hover:text-slate-200'} disabled:opacity-50 transition-colors`}
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
                className={`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
                    isDragging ? 'border-yellow-400 bg-slate-700/50' : 'border-slate-600 hover:border-slate-500'
                } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="audio/*,video/*" 
                    className="hidden"
                    disabled={isProcessing}
                />
                <div className="flex flex-col items-center justify-center gap-4 text-slate-400">
                    <UploadIcon className="w-10 h-10" />
                    <p className="font-semibold">
                        {isDragging ? 'Drop the file here' : 'Drag & drop a media file here, or click to select'}
                    </p>
                    <p className="text-sm">MP3, WAV, MP4, MOV, etc. (Up to 2GB)</p>
                </div>
            </div>
          )}

          {mode === 'record' && (
            <div className="flex flex-col items-center justify-center gap-6 p-8">
              {isRecording ? (
                <>
                  <div className="text-4xl font-mono text-slate-200">{formatTime(recordingTime)}</div>
                   <div className="w-full max-w-xs h-2 bg-slate-700 rounded-full overflow-hidden my-2">
                    <div 
                        className="h-full bg-yellow-400 transition-all duration-75" 
                        style={{ width: `${micVolume * 100}%` }}
                    ></div>
                  </div>
                  <button
                    onClick={stopRecording}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-full text-lg transition-colors disabled:opacity-50"
                  >
                    <StopCircleIcon className="w-6 h-6" />
                    <span>Stop Recording</span>
                  </button>
                </>
              ) : (
                <>
                  <p className="text-slate-400">Click the button below to start recording from your microphone.</p>
                  <button
                    onClick={startRecording}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-6 py-3 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded-full text-lg transition-colors disabled:opacity-50"
                  >
                    <MicIcon className="w-6 h-6" />
                    <span>Start Recording</span>
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};