import React from 'react';
import { HistoryItem, GeneralChatHistoryItem, User, ChatMode } from '../types';
import { HistoryIcon, PlusIcon, TrashIcon, ChatBubbleIcon, LogOutIcon, FileTextIcon, UserIcon } from './icons';
import { SectionSelector } from './SectionSelector';

interface HistorySidebarProps {
  generalChatHistory: GeneralChatHistoryItem[];
  onSelectChatSession: (session: GeneralChatHistoryItem) => void;
  onDeleteChatSession: (id: string) => void;
  onNewChatSession: () => void;
  isVisible: boolean;
  onToggleVisibility: () => void;
  user: User | null;
  onLogout: () => void;
  activeSection: ChatMode;
  onSectionChange: (mode: ChatMode) => void;
}

const HistoryListItem: React.FC<{
    title: string;
    timestamp: string;
    onClick: () => void;
    onDelete: (e: React.MouseEvent) => void;
}> = ({ title, timestamp, onClick, onDelete }) => (
    <div 
        onClick={onClick}
        className="group flex items-center justify-between p-2 rounded-md hover:bg-slate-700 cursor-pointer transition-colors"
    >
        <div className="flex-1 truncate pr-2">
            <p className="font-semibold text-sm text-slate-200 truncate">{title}</p>
            <p className="text-xs text-slate-400">{new Date(timestamp).toLocaleString()}</p>
        </div>
        <button 
            onClick={onDelete} 
            className="p-1 rounded-md text-slate-500 hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
            title="Delete item"
        >
            <TrashIcon className="w-4 h-4" />
        </button>
    </div>
);


export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  generalChatHistory,
  onSelectChatSession,
  onDeleteChatSession,
  onNewChatSession,
  isVisible,
  user,
  onLogout,
  activeSection,
  onSectionChange
}) => {
  if (!isVisible) return null;

  return (
    <aside className="fixed top-0 left-0 h-full w-80 bg-slate-800/80 backdrop-blur-md border-r border-slate-700 flex flex-col z-20 shadow-xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
             <div className="flex items-center gap-3">
                <img src="./download.png" alt="Logo" className="h-8 w-8 rounded-lg" />
                <div>
                  <h1 className="text-lg font-bold text-slate-100 tracking-tight">
                    AI Sections
                  </h1>
                </div>
            </div>
        </div>
        
        {/* Section Selector */}
        <div className="border-b border-slate-700">
            <SectionSelector activeSection={activeSection} onSectionChange={onSectionChange} />
        </div>


        <div className="flex-1 overflow-y-auto p-2 space-y-4">
            {/* General Chat Section */}
            <div>
                <div className="px-2 py-1 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">{activeSection} Chats</h3>
                     <button onClick={onNewChatSession} title="New Chat Session" className="p-1 rounded-md text-slate-400 hover:bg-slate-700 hover:text-yellow-400">
                        <PlusIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="mt-2 space-y-1">
                     {generalChatHistory.length > 0 ? generalChatHistory.map(session => (
                        <HistoryListItem 
                            key={session.id}
                            title={session.title}
                            timestamp={session.timestamp}
                            onClick={() => onSelectChatSession(session)}
                            onDelete={(e) => { e.stopPropagation(); onDeleteChatSession(session.id); }}
                        />
                    )) : <p className="p-2 text-sm text-slate-500 italic">No history for this section yet.</p>}
                </div>
            </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 mt-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-slate-300"/>
                    </div>
                    <div className="flex-1 truncate">
                        <p className="text-sm font-semibold text-slate-200 truncate" title={user?.displayName || 'User'}>{user?.displayName || 'User'}</p>
                        <p className="text-xs text-slate-400 truncate" title={user?.email || ''}>{user?.email}</p>
                    </div>
                </div>
                <button onClick={onLogout} className="p-2 rounded-md text-slate-400 hover:bg-slate-700 hover:text-red-400 transition-colors" title="Logout">
                    <LogOutIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
    </aside>
  );
};