export interface TextPart {
  text: string;
}

export interface InlineDataPart {
  inlineData: {
    mimeType: string;
    data: string; // base64 encoded data
  };
}

export interface VideoPart {
  videoData: {
    mimeType: 'video/mp4';
    uri: string; // Object URL for the generated video blob
  };
}

export interface FilePreviewPart {
  filePreview: {
    name: string;
    type: 'pdf' | 'docx' | 'xlsx' | 'txt' | 'pptx' | 'archive' | 'code' | 'unknown' | 'other';
    fullText?: string; // To hold the extracted raw text for on-demand viewing
  };
}

export type MessagePart = TextPart | InlineDataPart | VideoPart | FilePreviewPart;

export interface ChatMessage {
  role: 'user' | 'ai';
  parts: MessagePart[];
  timestamp: string;
}

export type Language = 'English' | 'French' | 'Chinese' | 'Japanese';
export type ChatMode = 'General' | 'Summarizer' | 'File Analyzer';
export type TtsVoiceState = 'off' | 'default' | 'female';

export interface HistoryItem {
  id: string; // Changed to string to accommodate Firestore document IDs
  timestamp: string;
  title: string;
  transcript?: string; // Made optional to avoid saving large transcripts to localStorage
  summary: string;
  qaHistory: ChatMessage[];
  language: Language;
}

export interface GeneralChatHistoryItem {
  id: string; // Changed to string to accommodate Firestore document IDs
  timestamp: string;
  title: string;
  messages: ChatMessage[];
  mode: ChatMode;
}

export interface AppState {
  id: string | null; // Changed to string
  transcript: string;
  summary: string;
  qaHistory: ChatMessage[];
  error: string;
  isAnswering: boolean;
}

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
}