import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { SendIcon, UserIcon, BotIcon, ExpandIcon, CompressIcon, StopCircleIcon, MicIcon } from './icons';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { AiLoadingIndicator } from './AiLoadingIndicator';

interface QaSectionProps {
  summary: string;
  qaHistory: ChatMessage[];
  onAskQuestion: (question: string) => void;
  isLoading: boolean;
  onCancel: () => void;
}

const formatTime = (isoString: string | undefined) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

export const QaSection: React.FC<QaSectionProps> = ({ summary, qaHistory, onAskQuestion, isLoading, onCancel }) => {
  const [question, setQuestion] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speechStartValueRef = useRef('');

  const { isListening, transcript, startListening, stopListening, isSupported } = useSpeechToText();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [qaHistory, summary, isFullscreen]);

  // Add ESC key listener to exit fullscreen
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
       if (event.key === 'Escape') {
          setIsFullscreen(false);
       }
    };
    if (isFullscreen) {
      window.addEventListener('keydown', handleEsc);
    }

    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isFullscreen]);

  // Effect to update question from speech transcript
  useEffect(() => {
    if (isListening && !isLoading) {
      const newText = speechStartValueRef.current + (speechStartValueRef.current ? ' ' : '') + transcript;
      setQuestion(newText);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    }
  }, [transcript, isListening, isLoading]);


  const handleAsk = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (question.trim() && !isLoading) {
      if (isListening) stopListening();
      onAskQuestion(question);
      setQuestion('');
       if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };
  
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isListening) stopListening();
    setQuestion(e.target.value);
    // Auto-grow
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleMicToggle = () => {
    if (!isSupported) {
        alert("Speech recognition is not supported in your browser.");
        return;
    }
    if (isListening) {
        stopListening();
    } else {
        speechStartValueRef.current = question;
        setQuestion(q => q + (q ? ' ' : ''));
        startListening();
    }
  };

  const isChatDisabled = !summary;
  const placeholderText = isChatDisabled ? "Waiting for summary..." : isListening ? "Listening..." : "Ask about the summary...";

  const qaContent = (
    <>
      <div className="p-4 border-b border-slate-700 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-200">Insights &amp; Q&amp;A</h2>
        <button 
          onClick={() => setIsFullscreen(!isFullscreen)} 
          className="p-2 rounded-md hover:bg-slate-700 transition-colors"
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
            {isFullscreen ? <CompressIcon className="w-5 h-5"/> : <ExpandIcon className="w-5 h-5"/>}
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {!summary && (
          <div className="flex items-center justify-center h-full text-center">
            <p className="text-slate-500">
              Process an audio file to see the summary and start a Q&amp;A session.
            </p>
          </div>
        )}

        {summary && (
           <div className="w-full message-enter">
              <h3 className="font-bold text-lg text-yellow-400 mb-2">Summary</h3>
              <MarkdownRenderer content={summary} />
           </div>
        )}
        
        {qaHistory.map((msg, index) => {
            const textContent = msg.parts.map(p => 'text' in p ? p.text : '').join('');

            if (msg.role === 'user') {
                return (
                    <div key={index} className="flex justify-end message-enter">
                        <div className="flex flex-col items-end">
                            <div className="chat-bubble chat-bubble-user">
                                <p className="whitespace-pre-wrap">{textContent}</p>
                            </div>
                            <div className="text-xs text-slate-500 mt-1 px-2">
                                {formatTime(msg.timestamp)}
                            </div>
                        </div>
                    </div>
                );
            }

            // AI Role
            return (
                <div key={index} className="w-full message-enter">
                    {isLoading && textContent === '' && index === qaHistory.length - 1 ? (
                        <AiLoadingIndicator />
                    ) : (
                        <MarkdownRenderer content={textContent} />
                    )}
                </div>
            );
        })}
        <div ref={chatEndRef} />
      </div>

      <div className="p-3 border-t border-slate-700 mt-auto">
        <form onSubmit={handleAsk} className="bg-slate-700/80 border border-slate-600 rounded-xl flex items-end p-2 gap-2 w-full">
            <textarea
                ref={textareaRef}
                rows={1}
                value={question}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={placeholderText}
                disabled={isChatDisabled || isLoading}
                className="chat-textarea flex-1 bg-transparent p-1 focus:ring-0 outline-none disabled:opacity-50"
            />
            <div className="flex items-center gap-1 flex-shrink-0">
                {isSupported && (
                    <button
                        type="button"
                        onClick={handleMicToggle}
                        title={isListening ? "Stop listening" : "Start listening"}
                        disabled={isLoading}
                        className={`p-2 rounded-full transition-colors disabled:opacity-50 ${isListening ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:bg-slate-600/50 hover:text-slate-200'}`}
                    >
                        <MicIcon className="w-5 h-5" />
                    </button>
                )}
                {isLoading ? (
                    <button
                        type="button"
                        onClick={onCancel}
                        title="Cancel Request"
                        className="p-2 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold transition-colors"
                    >
                        <StopCircleIcon className="w-5 h-5" />
                    </button>
                ) : (
                    <button
                        type="submit"
                        disabled={isChatDisabled || isLoading || !question.trim()}
                        className="p-2 rounded-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <SendIcon className="w-5 h-5" />
                    </button>
                )}
            </div>
        </form>
      </div>
    </>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-40 p-4 md:p-8 flex items-center justify-center" onClick={() => setIsFullscreen(false)}>
        <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-4xl h-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
          {qaContent}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 shadow-lg flex flex-col h-full max-h-[80vh]">
      {qaContent}
    </div>
  );
};