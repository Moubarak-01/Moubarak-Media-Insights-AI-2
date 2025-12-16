import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';

import { Header } from './components/Header';
import { ErrorDisplay } from './components/ErrorDisplay';
import { HistorySidebar } from './components/HistorySidebar';
import { GeneralChat } from './components/GeneralChat';
import { AuthScreen } from './components/AuthScreen';
import { Footer } from './components/Footer';

import { generateTitle } from './services/geminiService';
import { ChatMessage, HistoryItem, GeneralChatHistoryItem, TextPart, User, ChatMode, TtsVoiceState } from './types';

// --- Local Storage Persistence ---
const USER_DATA_KEY = 'mma_userData_v2'; // Use a new key for the updated structure

const getUserData = (email: string) => {
    try {
        const allUserData = JSON.parse(localStorage.getItem(USER_DATA_KEY) || '{}');
        const userData = allUserData[email] || {};
        // Ensure we always return arrays, even if stored data is corrupted or null
        return {
            generalChatHistory: Array.isArray(userData.generalChatHistory) ? userData.generalChatHistory : [],
        };
    } catch (error) {
        console.error("Failed to parse user data from localStorage:", error);
        return { generalChatHistory: [] };
    }
};

const saveUserData = (email: string, data: { generalChatHistory: GeneralChatHistoryItem[] }) => {
    try {
        // Create a "slim" version of the data to avoid exceeding localStorage quota.
        // This removes large data chunks like full transcripts and base64 image data.
        const slimData = {
            generalChatHistory: data.generalChatHistory.map(session => ({
                ...session,
                messages: session.messages.map(message => ({
                    ...message,
                    // Remove large base64 data, keeping only text and file previews for history
                    parts: message.parts.filter(part => 'text' in part || 'filePreview' in part)
                }))
            }))
        };

        const allUserData = JSON.parse(localStorage.getItem(USER_DATA_KEY) || '{}');
        allUserData[email] = slimData;
        localStorage.setItem(USER_DATA_KEY, JSON.stringify(allUserData));
    } catch (error) {
        console.error("Failed to save user data to localStorage:", error);
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
             console.warn("Storage quota exceeded. Some data may not be saved.");
        }
    }
};


const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'signUp' | 'signIn'>('signUp');
  const [generalChatHistory, setGeneralChatHistory] = useState<GeneralChatHistoryItem[]>([]);
  const [selectedChatSession, setSelectedChatSession] = useState<GeneralChatHistoryItem | null>(null);
  const [isHistoryVisible, setIsHistoryVisible] = useState(true);
  const [ttsVoice, setTtsVoice] = useState<TtsVoiceState>('off');
  const [activeSection, setActiveSection] = useState<ChatMode>('General');
  
  // Effect to save user data to localStorage whenever it changes
  useEffect(() => {
    if (user?.email) {
        saveUserData(user.email, { generalChatHistory });
    }
  }, [generalChatHistory, user]);
  
  const handleLogin = (loggedInUser: { displayName: string; email: string }) => {
    const { generalChatHistory: savedGeneralChatHistory } = getUserData(loggedInUser.email);
    setGeneralChatHistory(savedGeneralChatHistory);

    setUser({
        uid: 'local-user', // Dummy UID for client-side session
        displayName: loggedInUser.displayName,
        email: loggedInUser.email,
    });
  };

  const handleLogout = () => {
    setUser(null);
    setGeneralChatHistory([]);
    setSelectedChatSession(null);
    setAuthMode('signIn');
  };
  
  const handleSaveChatSession = async (messages: ChatMessage[]) => {
      if (messages.length === 0 || !user) return;

      if (selectedChatSession) {
          const updatedSession: GeneralChatHistoryItem = { 
              ...selectedChatSession, 
              messages, 
              mode: activeSection, // Ensure mode is updated if it changed during the session
              timestamp: new Date().toISOString() 
          };
          setGeneralChatHistory(prev => prev.map(s => s.id === selectedChatSession.id ? updatedSession : s).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
          setSelectedChatSession(updatedSession);

      } else {
          if (!process.env.API_KEY) throw new Error("API key not set");
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const firstUserMessageText = messages.find(m => m.role === 'user')?.parts.find((p): p is TextPart => 'text' in p)?.text;
          const newTitle = await generateTitle(ai, firstUserMessageText || `New ${activeSection} Chat`);

          const newSession: GeneralChatHistoryItem = {
              id: Date.now().toString(),
              timestamp: new Date().toISOString(),
              title: newTitle,
              messages: messages,
              mode: activeSection,
          };
          
          setGeneralChatHistory(prev => [newSession, ...prev]);
          setSelectedChatSession(newSession);
      }
  };

  const handleSelectChatSession = (session: GeneralChatHistoryItem) => {
      setSelectedChatSession(session);
      setActiveSection(session.mode); // Sync active section with the selected chat
      setIsHistoryVisible(false);
  };

  const handleDeleteChatSession = async (idToDelete: string) => {
      if (!user) return;
      setGeneralChatHistory(prev => prev.filter(s => s.id !== idToDelete));
      if (selectedChatSession?.id === idToDelete) {
          setSelectedChatSession(null);
      }
  };

  const handleNewChatSession = () => {
      setSelectedChatSession(null);
      // The activeSection remains, so the new chat will start in that section
      setIsHistoryVisible(false);
  };
  
  const handleSectionChange = (newSection: ChatMode) => {
      setActiveSection(newSection);
      // Start a new chat when the user switches sections
      setSelectedChatSession(null);
  };

  const handleTtsToggle = () => {
    setTtsVoice(prev => {
        if (prev === 'off') return 'default';
        if (prev === 'default') return 'female';
        return 'off';
    });
  };


  if (!user) {
    return <AuthScreen onLogin={handleLogin} initialMode={authMode} />;
  }

  const filteredHistory = generalChatHistory.filter(session => session.mode === activeSection);

  return (
    // FIX: Use h-screen and overflow-hidden to prevent the whole page from scrolling
    <div className="h-screen overflow-hidden bg-slate-900 text-slate-200 font-sans flex">
      <HistorySidebar 
        generalChatHistory={filteredHistory}
        onSelectChatSession={handleSelectChatSession}
        onDeleteChatSession={handleDeleteChatSession}
        onNewChatSession={handleNewChatSession}
        isVisible={isHistoryVisible}
        onToggleVisibility={() => setIsHistoryVisible(!isHistoryVisible)}
        user={user}
        onLogout={handleLogout}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />
      <div className="flex-1 flex flex-col transition-all duration-300" style={{ marginLeft: isHistoryVisible ? '320px' : '0' }}>
        <Header 
            onToggleHistory={() => setIsHistoryVisible(!isHistoryVisible)} 
            isHistoryVisible={isHistoryVisible}
        />
        <main className="flex-1 relative">
          <GeneralChat 
            chatSession={selectedChatSession}
            onSave={handleSaveChatSession}
            ttsVoice={ttsVoice}
            activeMode={activeSection}
          />
        </main>
        <Footer ttsVoice={ttsVoice} onTtsToggle={handleTtsToggle} />
      </div>
    </div>
  );
};

export default App;