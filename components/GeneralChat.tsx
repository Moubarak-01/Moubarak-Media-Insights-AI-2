import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, File as GeminiFile, Part as GeminiPart, GenerateContentResponse } from '@google/genai';
import heic2any from 'heic2any';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
// FIX: Import `JSZipObject` to provide a type for zip file entries.
import JSZip, { JSZipObject } from 'jszip';
import * as mammoth from 'mammoth';

import { ChatMessage, GeneralChatHistoryItem, MessagePart, FilePreviewPart, TextPart, InlineDataPart, ChatMode, TtsVoiceState, Language } from '../types';
import { SendIcon, BotIcon, PlusIcon, XIcon, StopCircleIcon, MicIcon, FileTextIcon, ImageIcon, VideoIcon, SpinnerIcon, PresentationIcon, ArchiveIcon, EyeIcon, BrainCircuitIcon, StopIcon, CodeIcon } from './icons';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { AiLoadingIndicator } from './AiLoadingIndicator';
import { generateImageFromPrompt, generateVideoFromPrompt, uploadAndPollFile, generateChatStream, summarizeFileStream } from '../services/geminiService';
import { systemPrompts } from '../prompts';
import { SummarizerInterface } from './SummarizerInterface';


// Configure the PDF.js worker. It's crucial for performance and to avoid issues.
// The worker is loaded from the same CDN path defined in index.html's importmap.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';


// FIX: Moved the AIStudio interface inside `declare global` to make it a truly global type,
// resolving the "Subsequent property declarations must have the same type" error.
// This ensures a consistent type for `window.aistudio` across the application.
// Augment the Window interface for the aistudio API key selection helper.
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}


interface GeneralChatProps {
  chatSession: GeneralChatHistoryItem | null;
  onSave: (messages: ChatMessage[]) => Promise<void>;
  ttsVoice: TtsVoiceState;
  activeMode: ChatMode;
}

// --- Component Types & Components ---

type FileSubType = 'pdf' | 'docx' | 'xlsx' | 'txt' | 'pptx' | 'archive' | 'code' | 'unknown' | 'other';
type StagedFileItem = {
    file: File;
    name: string;
    type: 'image' | 'video' | 'audio' | 'document' | 'other';
    subType: FileSubType;
    previewSrc: string; // Data URL for displayable media, empty for others
};


// --- Client-Side File Processing Utilities ---

const MAX_FILE_SIZE_MB = 2000; // Gemini File API has a 2GB limit
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const fileToDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

const extractTextFromDocx = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
};

const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const numPages = pdf.numPages;
    let fullText = '';
    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => ('str' in item ? item.str : '')).join(' ');
        fullText += pageText + '\n\n';
    }
    return fullText.trim();
};

const extractTextFromTxt = (file: File): Promise<string> => {
    return file.text();
};

const extractTextFromXlsx = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                if (!event.target?.result) {
                    throw new Error("File could not be read.");
                }
                const data = new Uint8Array(event.target.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                let fullText = '';
                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const sheetText = XLSX.utils.sheet_to_txt(worksheet, {
                        strip: true, // remove trailing commas
                        FS: '\t', // field separator
                        RS: '\n', // row separator
                    });
                    fullText += `--- Sheet: ${sheetName} ---\n${sheetText}\n\n`;
                });
                resolve(fullText.trim());
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};


const generatePdfThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve) => { // Does not reject, resolves with '' on failure for fallback
        const fileReader = new FileReader();
        fileReader.onload = async (event) => {
            if (!event.target?.result) {
                console.error("Failed to read file for PDF thumbnail generation.");
                return resolve('');
            }
            try {
                const typedarray = new Uint8Array(event.target.result as ArrayBuffer);
                const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
                const page = await pdf.getPage(1); // Get the first page

                const desiredWidth = 112; // w-28 is 7rem = 112px
                const viewport = page.getViewport({ scale: 1 });
                const scale = desiredWidth / viewport.width;
                const scaledViewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) {
                    console.error("Could not get canvas context for PDF thumbnail.");
                    return resolve('');
                }
                canvas.height = scaledViewport.height;
                canvas.width = scaledViewport.width;

                const renderContext = {
                    canvas, // FIX: The type definitions require the canvas object itself.
                    canvasContext: context,
                    viewport: scaledViewport,
                };

                await page.render(renderContext).promise;
                resolve(canvas.toDataURL('image/jpeg'));
            } catch (error) {
                console.error('Error generating PDF thumbnail:', error);
                resolve('');
            }
        };
        fileReader.onerror = (error) => {
             console.error('FileReader error during PDF thumbnail generation:', error);
             resolve('');
        };
        fileReader.readAsArrayBuffer(file);
    });
};

const processSingleFile = async (file: File): Promise<StagedFileItem | null> => {
    if (!(file instanceof File)) return null;
    if (file.size > MAX_FILE_SIZE_BYTES) {
        alert(`File "${file.name}" is too large. The maximum size is ${MAX_FILE_SIZE_MB}MB.`);
        return null;
    }

    let fileToProcess = file;
    if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
         try {
            const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
            fileToProcess = new File([convertedBlob as Blob], file.name.replace(/\.[^/.]+$/, ".jpeg"), { type: 'image/jpeg' });
        } catch (error) {
            console.error("Error converting HEIC file:", error);
            alert(`Conversion failed for "${file.name}".`);
            return null;
        }
    }
    
    try {
        let type: StagedFileItem['type'] = 'other';
        let subType: StagedFileItem['subType'] = 'unknown';
        let previewSrc = '';
        const mimeType = fileToProcess.type || 'application/octet-stream';
        
        if (mimeType.startsWith('image/')) {
            type = 'image';
            previewSrc = await fileToDataURL(fileToProcess);
        } else if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
            type = mimeType.startsWith('video/') ? 'video' : 'audio';
            previewSrc = await fileToDataURL(fileToProcess);
        } else {
             const ext = '.' + fileToProcess.name.split('.').pop()?.toLowerCase();
             switch(ext) {
                case '.pdf': type = 'document'; subType = 'pdf'; previewSrc = await generatePdfThumbnail(fileToProcess); break;
                case '.docx': type = 'document'; subType = 'docx'; break;
                case '.xlsx': case '.xls': type = 'document'; subType = 'xlsx'; break;
                case '.txt': case '.csv': type = 'document'; subType = 'txt'; break;
                case '.ts': case '.tsx': case '.js': case '.jsx': case '.json': case '.html': case '.md': case '.css': case '.scss': case '.env': case '.config': case '.tsconfig': case '.gitignore':
                    type = 'document';
                    subType = 'code';
                    break;
                case '.pptx': case '.ppt': type = 'other'; subType = 'pptx'; break;
                case '.zip': case '.rar': case '.7z': type = 'other'; subType = 'archive'; break;
                default: type = 'other'; subType = 'unknown'; break;
             }
        }
        return { file: fileToProcess, name: fileToProcess.name, type, subType, previewSrc };
    } catch (error) {
        console.error(`Error processing "${file.name}":`, error);
        return null;
    }
};


const formatTime = (isoString: string | undefined) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};


const StagedMediaPreviews: React.FC<{
    mediaItems: StagedFileItem[];
    onRemove: (index: number) => void;
}> = ({ mediaItems, onRemove }) => {
    if (mediaItems.length === 0) return null;
    
    const getFileIcon = (subType: FileSubType) => {
        switch (subType) {
            case 'pdf':
            case 'docx':
            case 'xlsx':
            case 'txt':
                return <FileTextIcon className="w-8 h-8 mx-auto mb-2 text-slate-300" />;
            case 'code':
                return <CodeIcon className="w-8 h-8 mx-auto mb-2 text-slate-300" />;
            case 'pptx':
                return <PresentationIcon className="w-8 h-8 mx-auto mb-2 text-slate-300" />;
            case 'archive':
                return <ArchiveIcon className="w-8 h-8 mx-auto mb-2 text-slate-300" />;
            default:
                return <FileTextIcon className="w-8 h-8 mx-auto mb-2 text-slate-300" />;
        }
    };
    
    return (
        <div className="mb-2 p-3 border border-slate-600 bg-slate-900/50 rounded-lg">
            <div className="flex flex-wrap gap-4">
                {mediaItems.map((media, index) => {
                     const src = media.previewSrc;
                     return (
                        <div key={index} className="relative w-28 h-28 bg-slate-700 rounded-lg flex items-center justify-center overflow-hidden shadow-md">
                            {media.type === 'image' && <img src={src} alt={media.name} className="w-full h-full object-cover" title={media.name} />}
                            {media.type === 'video' && <video src={src} muted className="w-full h-full object-cover" title={media.name} />}
                            {media.type === 'audio' && (
                                <div className="p-2 text-center text-white">
                                    <MicIcon className="w-8 h-8 mx-auto mb-2 text-slate-300"/>
                                    <p className="text-xs break-words">{media.name}</p>
                                </div>
                             )}
                            {media.type === 'document' && (
                                <>
                                    {media.previewSrc ? ( // PDF with thumbnail
                                        <img src={media.previewSrc} alt={`Preview of ${media.name}`} className="w-full h-full object-contain bg-white p-1" title={media.name} />
                                    ) : ( // DOCX, XLSX, TXT, Code
                                        <div className="p-2 text-center text-white">
                                            {getFileIcon(media.subType)}
                                            <p className="text-xs break-words">{media.name}</p>
                                        </div>
                                    )}
                                </>
                            )}
                             {media.type === 'other' && ( // PPTX, ZIP, etc.
                                <div className="p-2 text-center text-white">
                                    {getFileIcon(media.subType)}
                                    <p className="text-xs break-words">{media.name}</p>
                                </div>
                            )}
                            <button onClick={() => onRemove(index)} className="absolute top-1 right-1 bg-black/60 hover:bg-red-500 rounded-full p-0.5 text-white transition-colors" title="Remove file">
                                <XIcon className="w-4 h-4"/>
                            </button>
                        </div>
                     )
                })}
            </div>
        </div>
    );
};

const ImagePlaceholder: React.FC = () => (
  <div className="w-64 h-64 bg-slate-700/50 rounded-md flex flex-col items-center justify-center animate-pulse p-4 border border-slate-600">
    <ImageIcon className="w-16 h-16 text-slate-500" />
    <p className="text-sm text-slate-400 font-semibold mt-3 text-center">Generating Image...</p>
  </div>
);

const ContentViewerModal: React.FC<{
    title: string;
    content: string;
    onClose: () => void;
}> = ({ title, content, onClose }) => (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div 
            className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
        >
            <div className="flex justify-between items-center p-4 border-b border-slate-700">
                <h3 className="font-semibold text-lg text-slate-200 truncate">{title}</h3>
                <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-700">
                    <XIcon className="w-5 h-5" />
                </button>
            </div>
            <div className="p-6 overflow-y-auto">
                <pre className="text-slate-300 whitespace-pre-wrap font-sans text-sm">{content}</pre>
            </div>
        </div>
    </div>
);




const IMAGE_LOADER_PLACEHOLDER = '[[LOADING_IMAGE]]';

const parseErrorMessage = (error: unknown): string => {
    let message = 'An unknown error occurred.';
    if (error instanceof Error) {
        message = error.message;
    } else if (typeof error === 'string') {
        message = error;
    }

    if (message.includes('503') || message.toLowerCase().includes('model is overloaded')) {
        return "The AI model is currently overloaded. Please try again in a few moments.";
    }
    if (message.toLowerCase().includes('api key not valid')) {
        return "Your API key is not valid. Please check your credentials.";
    }
    if (message.includes('||RESET_API_KEY_STATE')) {
        return message.replace("||RESET_API_KEY_STATE", "");
    }
    
    // Return a generic but cleaner message for other cases
    return `An error occurred: ${message.split('||')[0]}`;
};


export const GeneralChat: React.FC<GeneralChatProps> = ({ chatSession, onSave, ttsVoice, activeMode }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFileItem[]>([]);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [modalContent, setModalContent] = useState<{title: string, content: string} | null>(null);
  const [mode, setMode] = useState<'text' | 'image' | 'video' | 'search'>('text');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const isCancelledRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechStartValueRef = useRef('');

  // A map to associate message parts with the original File objects
  const fileMapRef = useRef(new Map<FilePreviewPart, File>());

  const { isListening, transcript, startListening, stopListening, isSupported } = useSpeechToText();

  // Load available TTS voices from the browser
  useEffect(() => {
    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
        return () => {
            window.speechSynthesis.onvoiceschanged = null;
        };
    }
  }, []);

  // Check for API key when component mounts or becomes visible
  useEffect(() => {
      if (window.aistudio) {
          window.aistudio.hasSelectedApiKey().then(setHasApiKey);
      }
  }, []);

  useEffect(() => {
    setMessages(chatSession?.messages ?? []);
    setStagedFiles([]);
    setMode('text');
    userScrolledUpRef.current = false; // Reset scroll lock on new session
  }, [chatSession]);

  useEffect(() => {
    // This effect handles auto-scrolling during AI response streaming.
    // It only scrolls if the user hasn't manually scrolled up.
    if (!userScrolledUpRef.current) {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Effect to handle clipboard paste events
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
        if (!event.clipboardData || event.clipboardData.items.length === 0 || isLoading) {
            return;
        }

        const files: File[] = [];
        for (let i = 0; i < event.clipboardData.items.length; i++) {
            const item = event.clipboardData.items[i];
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    files.push(file);
                }
            }
        }

        if (files.length > 0) {
            event.preventDefault(); // Prevent default paste behavior (e.g., into textarea)
            setProcessingStatus("Processing pasted files...");

            const processFilePromises = files.map(processSingleFile);
            try {
                const results = await Promise.all(processFilePromises);
                const successfullyProcessed = results.filter((item): item is StagedFileItem => item !== null);
                setStagedFiles(prev => [...prev, ...successfullyProcessed]);
            } finally {
                setProcessingStatus(null);
            }
        }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
        window.removeEventListener('paste', handlePaste);
    };
  }, [isLoading]); // Rerun if isLoading changes, to avoid processing paste during generation


  // Cleanup Object URLs for generated videos to prevent memory leaks
  useEffect(() => {
    return () => {
        messages.forEach(msg => {
            msg.parts.forEach(part => {
                if ('videoData' in part && part.videoData.uri.startsWith('blob:')) {
                    URL.revokeObjectURL(part.videoData.uri);
                }
            });
        });
    };
  }, [messages]);

  useEffect(() => {
    if (isListening && !isLoading) {
      const newText = speechStartValueRef.current + (speechStartValueRef.current ? ' ' : '') + transcript;
      setInput(newText);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    }
  }, [transcript, isListening, isLoading]);

  const handleScroll = () => {
    const container = chatContainerRef.current;
    if (container) {
        const scrollThreshold = 100;
        const isAtBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + scrollThreshold;
        userScrolledUpRef.current = !isAtBottom;
    }
  };
  
  const handleCancel = () => {
    isCancelledRef.current = true;
    setIsLoading(false);
    setProcessingStatus(null);
  }
  
  const handleGenerateImage = async () => {
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    isCancelledRef.current = false;
    userScrolledUpRef.current = false; // Force scroll for new message

    const userMessage: ChatMessage = { role: 'user', parts: [{ text: `Generate an image of: ${input.trim()}` }], timestamp: new Date().toISOString() };
    const messagesForHistory = [...messages, userMessage];
    
    setMessages(prev => [...prev, userMessage, { role: 'ai' as const, parts: [{ text: IMAGE_LOADER_PLACEHOLDER }], timestamp: new Date().toISOString() }]);
    const prompt = input;
    setInput('');
    setMode('text');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    
    try {
        if (!process.env.API_KEY) throw new Error("API_KEY environment variable not set.");
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const base64Image = await generateImageFromPrompt(ai, prompt);

        if (isCancelledRef.current) throw new Error("Operation cancelled");

        const aiImageMessage: ChatMessage = {
            role: 'ai',
            parts: [{ inlineData: { mimeType: 'image/png', data: base64Image } }],
            timestamp: new Date().toISOString()
        };

        setMessages(prev => {
            const updatedMessages = [...prev];
            updatedMessages[updatedMessages.length - 1] = aiImageMessage;
            return updatedMessages;
        });

        await onSave([...messagesForHistory, aiImageMessage]);

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage.toLowerCase().includes('cancelled')) {
            console.log("Image generation cancelled by user.");
            setMessages(messagesForHistory);
            return;
        }
        const parsedMessage = parseErrorMessage(err);
        const errorAiMessage: ChatMessage = { role: 'ai', parts: [{ text: `⚠️ Sorry, I couldn't generate the image: ${parsedMessage}` }], timestamp: new Date().toISOString() };
        setMessages([...messagesForHistory, errorAiMessage]);
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleSummarizeFile = async (part: FilePreviewPart) => {
    const originalFile = fileMapRef.current.get(part);
    if (isLoading || !originalFile) {
        console.warn("Could not summarize: File not found in map or already processing.");
        return;
    }

    setIsLoading(true);
    isCancelledRef.current = false;
    userScrolledUpRef.current = false; // Force scroll for new message

    const userMessage: ChatMessage = { role: 'user', parts: [{ text: `Please summarize the document: "${originalFile.name}"` }], timestamp: new Date().toISOString() };
    const currentMessages = [...messages, userMessage];
    setMessages([...currentMessages, { role: 'ai', parts: [], timestamp: new Date().toISOString() }]);

    try {
      if (!process.env.API_KEY) throw new Error("API key not set");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let finalSummary = '';
      await summarizeFileStream(ai, originalFile, 'English', { // Default to english for this internal call
        onChunk: (chunk) => {
          if (isCancelledRef.current) return;
          finalSummary += chunk;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1].parts = [{ text: finalSummary }];
            return updated;
          });
        },
        onProgress: (status) => {
          if (isCancelledRef.current) return;
          setProcessingStatus(status);
        },
        isCancelledRef,
      });
      
      if (isCancelledRef.current) {
          setMessages(currentMessages); // Revert
          return;
      }
      
      const aiMessage: ChatMessage = { role: 'ai', parts: [{ text: finalSummary }], timestamp: new Date().toISOString() };
      const finalMessages = [...currentMessages, aiMessage];
      setMessages(finalMessages);
      await onSave(finalMessages);

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage.toLowerCase().includes('cancelled')) {
            console.log("Summarization cancelled by user.");
            setMessages(currentMessages);
            return;
        }
        const parsedMessage = parseErrorMessage(err);
        const errorAiMessage: ChatMessage = { role: 'ai', parts: [{ text: `⚠️ Sorry, I couldn't summarize the file: ${parsedMessage}` }], timestamp: new Date().toISOString() };
        setMessages([...currentMessages, errorAiMessage]);
    } finally {
      setIsLoading(false);
      setProcessingStatus(null);
    }
  };

  const handleGenerateVideo = async () => {
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    isCancelledRef.current = false;
    userScrolledUpRef.current = false; // Force scroll for new message
    const prompt = input;

    if (window.aistudio && !hasApiKey) {
        try {
            await window.aistudio.openSelectKey();
            setHasApiKey(true); 
        } catch (e) {
            const errorMsg = "You must select an API key associated with a billing-enabled project to generate videos.";
            const errorAiMessage: ChatMessage = { role: 'ai', parts: [{ text: `⚠️ ${errorMsg}` }], timestamp: new Date().toISOString() };
            setMessages(prev => [...prev, errorAiMessage]);
            setIsLoading(false);
            return;
        }
    }

    const userMessage: ChatMessage = { role: 'user', parts: [{ text: `Generate a video of: ${prompt}` }], timestamp: new Date().toISOString() };
    const currentMessages = [...messages, userMessage];
    
    setMessages(prev => [...prev, userMessage, { role: 'ai' as const, parts: [{ text: 'Initializing video generation...' }], timestamp: new Date().toISOString() }]);
    setInput('');
    setMode('text');

    try {
        if (isCancelledRef.current) throw new Error("Operation cancelled");

        const videoUri = await generateVideoFromPrompt(prompt, (progressMessage) => {
            if (isCancelledRef.current) return;
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].parts = [{ text: progressMessage }];
                return updated;
            });
        });

        if (isCancelledRef.current) throw new Error("Operation cancelled");
        
        const response = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
        if (!response.ok) throw new Error(`Failed to download generated video (status: ${response.status})`);
        const videoBlob = await response.blob();
        const objectUrl = URL.createObjectURL(videoBlob);

        const aiVideoMessage: ChatMessage = {
            role: 'ai',
            parts: [{ videoData: { mimeType: 'video/mp4', uri: objectUrl } }],
            timestamp: new Date().toISOString()
        };
        const finalMessages = [...currentMessages, aiVideoMessage];
        setMessages(finalMessages);
        await onSave(finalMessages);

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage.toLowerCase().includes('cancelled')) {
            console.log("Video generation cancelled by user.");
            setMessages(currentMessages);
            return;
        }
        const parsedMessage = parseErrorMessage(err);
        const errorAiMessage: ChatMessage = { role: 'ai', parts: [{ text: `⚠️ Video generation failed: ${parsedMessage}` }], timestamp: new Date().toISOString() };
        if (parsedMessage.includes("API key is invalid")) {
            setHasApiKey(false);
        }
        setMessages([...currentMessages, errorAiMessage]);
    } finally {
        setIsLoading(false);
    }
  };
  

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && stagedFiles.length === 0) || isLoading) return;

    if (mode === 'image') return handleGenerateImage();
    if (mode === 'video') return handleGenerateVideo();

    setIsLoading(true);
    isCancelledRef.current = false;
    userScrolledUpRef.current = false;
    if (isListening) stopListening();

    const currentInput = input;
    const currentStagedFiles = stagedFiles;
    setInput('');
    setStagedFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // 1. Construct user message for display (common for all flows)
    const userDisplayParts: MessagePart[] = [];
    const filesForApi: File[] = [];

    for (const sf of currentStagedFiles) {
        filesForApi.push(sf.file);
        if (sf.type === 'document' || sf.subType === 'code' || sf.subType === 'archive') {
             let extractedText = '';
             let filePreviewPart: FilePreviewPart;
             try {
                // For non-archive documents, extract text to enable "View Content" button
                if (sf.subType !== 'archive') {
                    switch (sf.subType) {
                        case 'pdf': extractedText = await extractTextFromPdf(sf.file); break;
                        case 'docx': extractedText = await extractTextFromDocx(sf.file); break;
                        case 'xlsx': extractedText = await extractTextFromXlsx(sf.file); break;
                        case 'txt': case 'code': extractedText = await extractTextFromTxt(sf.file); break;
                    }
                }
                filePreviewPart = { filePreview: { name: sf.name, type: sf.subType, fullText: extractedText } };
             } catch (error) {
                console.error(`Failed to extract text from ${sf.name}:`, error);
                filePreviewPart = { filePreview: { name: sf.name, type: sf.subType, fullText: `Error: Could not extract text.` } };
             }
             userDisplayParts.push(filePreviewPart);
             fileMapRef.current.set(filePreviewPart, sf.file);
        } else if (sf.type === 'other') {
             userDisplayParts.push({ filePreview: { name: sf.name, type: sf.subType } });
        } else {
             const base64 = await fileToDataURL(sf.file).then(dataUrl => dataUrl.split(',')[1]);
             userDisplayParts.push({ inlineData: { mimeType: sf.file.type, data: base64 }});
        }
    }

    if (currentInput.trim()) {
        userDisplayParts.push({ text: currentInput });
    }
    
    const userMessage: ChatMessage = { role: 'user', parts: userDisplayParts, timestamp: new Date().toISOString() };
    const currentMessages = [...messages, userMessage];
    setMessages([...currentMessages, { role: 'ai', parts: [], timestamp: new Date().toISOString() }]);

    try {
      if (!process.env.API_KEY) throw new Error("API_KEY environment variable not set.");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const isSearchMode = mode === 'search' && stagedFiles.length === 0;
      let apiParts: GeminiPart[];

      if (activeMode === 'File Analyzer') {
        setProcessingStatus("Analyzing project files...");

        const fileContextPartsPromises = currentStagedFiles.map(async (sf): Promise<string[]> => {
            if (sf.subType === 'archive') {
                try {
                    const jszip = new JSZip();
                    const zip = await jszip.loadAsync(sf.file);
                    // FIX: Add `JSZipObject` type to `zipEntry` to resolve property access errors.
                    const contentPromises = Object.values(zip.files).map(async (zipEntry: JSZipObject) => {
                        if (zipEntry.dir) return null;
                        
                        const textExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.md', '.css', '.scss', '.env', '.config', '.tsconfig', '.gitignore', '.txt', '.csv'];
                        const isTextFile = textExtensions.some(ext => zipEntry.name.toLowerCase().endsWith(ext));

                        if (isTextFile) {
                            const content = await zipEntry.async('string');
                            return `File: ${zipEntry.name}\n\n${content}`;
                        }
                        return null;
                    });
                    return (await Promise.all(contentPromises)).filter((c): c is string => c !== null);
                } catch (error) {
                    console.error(`Error unpacking zip file ${sf.name}`, error);
                    return [`File: ${sf.name}\n\n[Error: Could not read contents of this archive]`];
                }
            } else if (sf.type === 'document' || sf.subType === 'code') {
                 try {
                    let text = '';
                    switch (sf.subType) {
                        case 'pdf': text = await extractTextFromPdf(sf.file); break;
                        case 'docx': text = await extractTextFromDocx(sf.file); break;
                        case 'xlsx': text = await extractTextFromXlsx(sf.file); break;
                        case 'txt': case 'code': text = await extractTextFromTxt(sf.file); break;
                    }
                    return [`File: ${sf.name}\n\n${text}`];
                 } catch (error) {
                    return [`File: ${sf.name}\n\n[Error: Could not extract text from this file]`];
                 }
            }
            return [];
        });

        const fileContextPartsNested = await Promise.all(fileContextPartsPromises);
        const fileContextParts = fileContextPartsNested.flat();

        const fileContext = fileContextParts.join('\n\n---\n\n');
        const userQuestion = userDisplayParts.find((p): p is TextPart => 'text' in p)?.text || "Please provide a detailed analysis of the uploaded files.";
        const fullPrompt = `The user has uploaded a project with the following files and has a question. Provide a detailed analysis based on the file contents.\n\n${fileContext}\n\n---\n\nUser Question: ${userQuestion}`;
        apiParts = [{ text: fullPrompt }];
      } else {
        // --- ORIGINAL FILE API FLOW: Upload files and send URIs ---
        const fileUploadPromises = filesForApi.map((file, i) => 
            uploadAndPollFile(ai, file, (status) => {
              setProcessingStatus(`${status} (${i + 1}/${filesForApi.length})`);
            }, isCancelledRef)
        );
        const uploadedFiles = await Promise.all(fileUploadPromises);

        if (isCancelledRef.current) throw new Error("Operation cancelled.");
        
        const uriParts: GeminiPart[] = uploadedFiles.map(uploadedFile => ({
            fileData: { mimeType: uploadedFile.mimeType, fileUri: uploadedFile.uri },
        }));
        const textPart = currentInput.trim() ? [{ text: currentInput.trim() }] : [];
        apiParts = [...uriParts, ...textPart];
      }

      setProcessingStatus("Generating response...");
      
      let finalAnswer = '';
      const groundingSources = new Map<string, { title: string }>();

      // FIXED: Updated onChunk signature to (text, rawChunk)
      await generateChatStream(ai, apiParts as (TextPart | InlineDataPart)[], messages, systemPrompts[activeMode], {
        onChunk: (text, chunk) => {
            if (isCancelledRef.current) return;
            // FIXED: Use 'text' directly instead of 'chunk.text' (which is undefined on string 'chunk')
            finalAnswer += text;

            if (isSearchMode && chunk) {
              const newChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
              if (newChunks) {
                newChunks.forEach((c: any) => {
                  if (c.web && c.web.uri) {
                    groundingSources.set(c.web.uri, { title: c.web.title || c.web.uri });
                  }
                });
              }
            }

            setMessages(prev => {
                const updated = [...prev];
                if (updated.length > 0) {
                  updated[updated.length - 1].parts = [{ text: finalAnswer }];
                }
                return updated;
            });
        },
        isCancelledRef
      }, isSearchMode ? [{googleSearch: {}}] : undefined);
      
      if (isCancelledRef.current) {
        setMessages(currentMessages); // Revert
        return;
      }
      
      let finalAiText = finalAnswer;
      if (groundingSources.size > 0) {
        let sourcesMarkdown = '\n\n---\n\n**Sources from the web:**\n';
        let i = 1;
        groundingSources.forEach((source, uri) => {
          sourcesMarkdown += `${i}. [${source.title}](${uri})\n`;
          i++;
        });
        finalAiText += sourcesMarkdown;
      }
      
      if (ttsVoice !== 'off') {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(finalAiText);
          if (ttsVoice === 'female') {
              const femaleVoice = voices.find(v => v.lang.startsWith('en') && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman')));
              if (femaleVoice) utterance.voice = femaleVoice;
          }
          window.speechSynthesis.speak(utterance);
      }
      
      const finalAiMessage: ChatMessage = { role: 'ai', parts: [{ text: finalAiText }], timestamp: new Date().toISOString() };
      const finalMessagesForSave = [...currentMessages, finalAiMessage];
      setMessages(finalMessagesForSave);
      await onSave(finalMessagesForSave);

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage.toLowerCase().includes('cancelled')) {
            console.log("Operation cancelled by user.");
            setMessages(currentMessages);
            return;
        }
        const parsedMessage = parseErrorMessage(err);
        const errorAiMessage: ChatMessage = { role: 'ai', parts: [{ text: `Sorry, I encountered an error: ${parsedMessage}` }], timestamp: new Date().toISOString() };
        setMessages([...currentMessages, errorAiMessage]);
    } finally {
      setIsLoading(false);
      setProcessingStatus(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isListening) stopListening();
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleMicToggle = () => {
    if (!isSupported) return alert("Speech recognition is not supported in your browser.");
    if (isListening) {
        stopListening();
    } else {
        speechStartValueRef.current = input;
        setInput(q => q + (q ? ' ' : ''));
        startListening();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setProcessingStatus("Preparing files for upload...");

    // Simplified logic: Let processSingleFile handle everything, including identifying ZIPs.
    const processFilePromises = Array.from(files).map(processSingleFile);

    try {
        const results = await Promise.all(processFilePromises);
        const successfullyProcessed = results.filter((item): item is StagedFileItem => item !== null);
        setStagedFiles(prev => [...prev, ...successfullyProcessed]);
    } finally {
        setProcessingStatus(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

 const handleSummarizerSubmit = async (file: File, language: Language) => {
    if (isLoading) return;

    setIsLoading(true);
    isCancelledRef.current = false;
    userScrolledUpRef.current = false;

    const userMessage: ChatMessage = { role: 'user', parts: [{ text: `Please summarize the following file in ${language}:` }, { filePreview: { name: file.name, type: 'unknown' } }], timestamp: new Date().toISOString() };
    const currentMessages = [...messages, userMessage];
    setMessages([...currentMessages, { role: 'ai', parts: [], timestamp: new Date().toISOString() }]);

    try {
      if (!process.env.API_KEY) throw new Error("API key not set");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let finalSummary = '';
      await summarizeFileStream(ai, file, language, {
        onChunk: (chunk) => {
          if (isCancelledRef.current) return;
          finalSummary += chunk;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1].parts = [{ text: finalSummary }];
            return updated;
          });
        },
        onProgress: (status) => {
          if (isCancelledRef.current) return;
          setProcessingStatus(status);
        },
        isCancelledRef,
      });
      
      if (isCancelledRef.current) {
          setMessages(currentMessages);
          return;
      }
      
      const aiMessage: ChatMessage = { role: 'ai', parts: [{ text: finalSummary }], timestamp: new Date().toISOString() };
      const finalMessages = [...currentMessages, aiMessage];
      setMessages(finalMessages);
      await onSave(finalMessages);

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage.toLowerCase().includes('cancelled')) {
            console.log("Summarization cancelled by user.");
            setMessages(currentMessages);
            return;
        }
        const parsedMessage = parseErrorMessage(err);
        const errorAiMessage: ChatMessage = { role: 'ai', parts: [{ text: `⚠️ Sorry, I couldn't summarize the file: ${parsedMessage}` }], timestamp: new Date().toISOString() };
        setMessages([...currentMessages, errorAiMessage]);
    } finally {
      setIsLoading(false);
      setProcessingStatus(null);
    }
  };


  const placeholderText = isListening ? "Listening..." : 
    mode === 'text' ? `Ask anything in ${activeMode} mode...` : 
    mode === 'image' ? 'Describe the image to generate...' : 
    mode === 'video' ? 'Describe the video to generate...' :
    'Search the web...';
  const currentModeInfo = systemPrompts[activeMode].split('\n')[1]; // Get the title from the prompt

  return (
    <>
      {modalContent && (
          <ContentViewerModal 
              title={modalContent.title}
              content={modalContent.content}
              onClose={() => setModalContent(null)}
          />
      )}
      <div className="absolute inset-0 bg-slate-800 flex flex-col shadow-2xl">
        <div className="mx-auto max-w-3xl w-full h-full flex flex-col">
          <div ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.length === 0 && activeMode !== 'Summarizer' && (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                    <BrainCircuitIcon className="w-16 h-16 mb-4 text-slate-500" />
                    <h2 className="text-2xl font-bold text-slate-200">{currentModeInfo}</h2>
                    <p className="max-w-md mt-2">
                        You are now in {activeMode} mode.
                        {chatSession ? ` Continuing conversation: "${chatSession.title}"` : ' Start a new conversation by typing below.'}
                    </p>
                </div>
            )}
            {messages.length === 0 && activeMode === 'Summarizer' && (
                <SummarizerInterface onFileSubmit={handleSummarizerSubmit} isProcessing={isLoading || !!processingStatus} />
            )}
            {messages.map((msg, index) => {
              if (msg.role === 'user') {
                  const sortedParts = [...msg.parts].sort((a, b) => ('text' in a ? 1 : -1));

                  return (
                      <div key={index} className="flex justify-end message-enter">
                          <div className="flex flex-col items-end max-w-[85%]">
                              <div className="chat-bubble chat-bubble-user flex flex-col gap-3">
                                  {sortedParts.map((part, pIndex) => {
                                      if ('text' in part) {
                                          const wordCount = part.text.trim().split(/\s+/).filter(Boolean).length;
                                          const hasNewlines = part.text.includes('\n');
                                          const customClassName = wordCount <= 10 && !hasNewlines ? 'force-no-wrap' : '';
                                          return <MarkdownRenderer key={pIndex} content={part.text} className={customClassName} />;
                                      }
                                      if ('inlineData' in part) {
                                          const src = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                                          if (part.inlineData.mimeType.startsWith('image/')) return <img key={pIndex} src={src} alt="user upload" className="max-w-xs rounded-lg" />;
                                          if (part.inlineData.mimeType.startsWith('video/')) return <video key={pIndex} src={src} controls className="max-w-xs rounded-lg" />;
                                          if (part.inlineData.mimeType.startsWith('audio/')) return <audio key={pIndex} src={src} controls className="w-full" />;
                                      }
                                      if ('filePreview' in part) {
                                          const hasFullText = !!part.filePreview.fullText && part.filePreview.fullText.startsWith('Error:') === false;
                                          const FileIcon = part.filePreview.type === 'archive' ? ArchiveIcon : FileTextIcon;
                                          return (
                                              <div key={pIndex} className="bg-indigo-500 p-3 rounded-lg flex flex-col gap-2">
                                                  <div className="flex items-center gap-3">
                                                    <FileIcon className="w-6 h-6 text-indigo-100 flex-shrink-0" />
                                                    <span className="font-semibold text-sm text-white truncate flex-1">{part.filePreview.name}</span>
                                                    {hasFullText && (
                                                        <button 
                                                          onClick={() => setModalContent({ title: part.filePreview.name, content: part.filePreview.fullText! })}
                                                          className="p-1 rounded-full text-indigo-100 hover:bg-indigo-400 hover:text-white transition-colors"
                                                          title="View extracted content"
                                                        >
                                                            <EyeIcon className="w-5 h-5" />
                                                        </button>
                                                    )}
                                                  </div>
                                                  {part.filePreview.type !== 'archive' && hasFullText && (
                                                    <div className="mt-2">
                                                        <button 
                                                            onClick={() => handleSummarizeFile(part as FilePreviewPart)}
                                                            disabled={isLoading}
                                                            className="w-full text-center bg-indigo-400/80 hover:bg-indigo-400 text-white text-xs font-bold py-1.5 px-2 rounded-md transition-colors disabled:opacity-50"
                                                        >
                                                            Summarize
                                                        </button>
                                                    </div>
                                                  )}
                                              </div>
                                          );
                                      }
                                      return null;
                                  })}
                              </div>
                              <div className="text-xs text-slate-500 mt-1 px-2">{formatTime(msg.timestamp)}</div>
                          </div>
                      </div>
                  );
              }
              // AI Role
              return (
                   <div key={index} className="flex justify-start w-full message-enter">
                      <div className="max-w-full">
                           {msg.parts.map((part, pIndex) => {
                              if ('text' in part) {
                                  if (part.text === IMAGE_LOADER_PLACEHOLDER) return <ImagePlaceholder key={pIndex} />;
                                  return isLoading && part.text === '' && index === messages.length -1 ? null : <MarkdownRenderer key={pIndex} content={part.text} />;
                              }
                              if ('inlineData' in part) return <img key={pIndex} src={`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`} className="max-w-md rounded-lg" />;
                              if ('videoData' in part) return <video key={pIndex} src={part.videoData.uri} controls className="max-w-md rounded-lg" />;
                              return null;
                          })}
                      </div>
                  </div>
              )
            })}
            {isLoading && !processingStatus && <AiLoadingIndicator />}
            <div ref={chatEndRef} />
          </div>

          <div className="p-3 border-t border-slate-700 mt-auto">
              <div className="flex items-center gap-2 mb-2 px-1">
                  <button onClick={() => setMode('text')} className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors ${mode === 'text' ? 'bg-yellow-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-slate-300'}`}>Text Chat</button>
                  <button onClick={() => setMode('search')} className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors ${mode === 'search' ? 'bg-yellow-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-slate-300'}`}>Web Search</button>
                  <button onClick={() => setMode('image')} className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors ${mode === 'image' ? 'bg-yellow-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-slate-300'}`}>Generate Image</button>
                  <button onClick={() => setMode('video')} className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors ${mode === 'video' ? 'bg-yellow-600 text-white' : 'bg-slate-600 hover:bg-slate-500 text-slate-300'}`}>Generate Video (Premium)</button>
              </div>
              <StagedMediaPreviews mediaItems={stagedFiles} onRemove={(index) => setStagedFiles(prev => prev.filter((_, i) => i !== index))} />
              <form onSubmit={handleSend} className="bg-slate-700/80 border border-slate-600 rounded-xl flex items-end p-2 gap-2 w-full">
                  <div className="flex-shrink-0">
                      <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple className="hidden" />
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading} title="Attach files" className="p-2 rounded-full hover:bg-slate-600/50 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50">
                          { !!processingStatus ? <SpinnerIcon className="w-5 h-5"/> : <PlusIcon className="w-5 h-5" /> }
                      </button>
                  </div>
                  
                  <textarea ref={textareaRef} rows={1} value={input} onInput={handleInput} onKeyDown={handleKeyDown} placeholder={placeholderText} disabled={isLoading} className="chat-textarea flex-1 bg-transparent p-1 focus:ring-0 outline-none disabled:opacity-50" />
                  
                  <div className="flex items-center gap-1 flex-shrink-0">
                      {isSupported && (
                          <button type="button" onClick={handleMicToggle} title={isListening ? "Stop listening" : "Start listening"} disabled={isLoading} className={`p-2 rounded-full transition-colors disabled:opacity-50 ${isListening ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:bg-slate-600/50 hover:text-slate-200'}`}>
                              <MicIcon className="w-5 h-5" />
                          </button>
                      )}
                      {isLoading ? (
                           <button type="button" onClick={handleCancel} title="Stop Generation" className="p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-colors flex items-center justify-center">
                              <StopIcon className="w-5 h-5" />
                          </button>
                      ) : (
                          <button type="submit" disabled={isLoading || (!input.trim() && stagedFiles.length === 0)} className="p-2 rounded-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                              <SendIcon className="w-5 h-5" />
                          </button>
                      )}
                  </div>
              </form>
          </div>
        </div>
        </div>
    </>
  );
};