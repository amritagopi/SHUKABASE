import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Plus, MoreVertical, Trash2, Edit2, Download, X, Check } from 'lucide-react';
import { ConversationHeader } from './types';
import { saveConversation, getConversation, deleteConversation } from './services/geminiService';

interface ConversationHistoryProps {
  conversations: ConversationHeader[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  t: (key: any) => string;
  onConversationsUpdate?: () => void;
}

const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  t,
  onConversationsUpdate
}) => {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRename = async (id: string) => {
    if (!editTitle.trim()) return;
    try {
      const convo = await getConversation(id);
      if (convo) {
        const updatedConvo = { ...convo, title: editTitle };
        await saveConversation(updatedConvo);
        setEditingId(null);
        setMenuOpenId(null);
        if (onConversationsUpdate) onConversationsUpdate();
      }
    } catch (error) {
      console.error("Failed to rename", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(t('confirmDelete'))) {
      try {
        await deleteConversation(id);
        setMenuOpenId(null);
        if (activeConversationId === id) {
          onNewChat();
        }
        if (onConversationsUpdate) onConversationsUpdate();
      } catch (error) {
        console.error("Failed to delete", error);
      }
    }
  };

  const handleExport = async (id: string) => {
    try {
      const convo = await getConversation(id);
      if (!convo) return;

      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${convo.title} - Shukabase Export</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background-color: #0f172a; color: #f8fafc; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 40px 20px; }
  h1 { border-bottom: 1px solid #334155; padding-bottom: 20px; margin-bottom: 40px; color: #f1f5f9; }
  .message { margin-bottom: 24px; padding: 20px; border-radius: 16px; position: relative; }
  .user { background: linear-gradient(135deg, #b45309 0%, #7c2d12 100%); color: white; margin-left: 15%; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
  .model { background-color: #1e293b; border: 1px solid #334155; color: #e2e8f0; margin-right: 15%; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
  .role { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; margin-bottom: 8px; opacity: 0.8; }
  .content { white-space: pre-wrap; }
  .timestamp { font-size: 0.7rem; opacity: 0.5; margin-top: 12px; text-align: right; }
  a { color: #38bdf8; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .agent-step { font-family: monospace; font-size: 0.8rem; background: rgba(0,0,0,0.2); padding: 8px; margin-bottom: 8px; border-radius: 6px; border-left: 3px solid #64748b; }
  .thought { border-color: #f59e0b; color: #cbd5e1; }
  .action { border-color: #10b981; color: #a7f3d0; }
  .observation { border-color: #3b82f6; color: #bfdbfe; }
</style>
</head>
<body>
  <h1>${convo.title}</h1>
  ${convo.messages.map(msg => {
        const isUser = msg.role === 'user';
        const time = new Date(msg.timestamp || Date.now()).toLocaleString();

        let stepsHtml = '';
        if (msg.agentSteps && msg.agentSteps.length > 0) {
          stepsHtml = msg.agentSteps.map(step => `
        <div class="agent-step ${step.type}">
          <strong>${step.type.toUpperCase()}:</strong> ${step.content}
        </div>
      `).join('');
        }

        let text = msg.parts[0].text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        return `
      <div class="message ${isUser ? 'user' : 'model'}">
        <div class="role">${isUser ? 'User' : 'Shukabase AI'}</div>
        ${stepsHtml}
        <div class="content">${text}</div>
        <div class="timestamp">${time}</div>
      </div>
    `;
      }).join('')}
</body>
</html>
      `;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shukabase-${id}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMenuOpenId(null);
    } catch (error) {
      console.error("Failed to export", error);
    }
  };

  return (
    <div className="w-80 bg-black/40 backdrop-blur-md border-r border-slate-800/50 flex flex-col h-full hidden md:flex">
      <div className="p-4 border-b border-slate-800/50">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 bg-cyan-600/80 hover:bg-cyan-500/80 text-white py-3 rounded-xl transition-all shadow-lg shadow-cyan-900/20 font-medium border border-cyan-500/20 backdrop-blur-sm"
        >
          <Plus size={20} />
          {t('newChat')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-3 mb-2 mt-2">{t('history')}</h3>
        {conversations.map((convo) => (
          <div key={convo.id} className="relative group">
            {editingId === convo.id ? (
              <div className="flex items-center gap-1 p-2 bg-slate-800/80 rounded-lg border border-cyan-500/50">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="bg-transparent border-none text-slate-200 text-sm w-full focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleRename(convo.id)}
                />
                <button onClick={() => handleRename(convo.id)} className="text-emerald-500 hover:text-emerald-400"><Check size={16} /></button>
                <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-400"><X size={16} /></button>
              </div>
            ) : (
              <div
                className={`
                  flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all group relative
                  ${activeConversationId === convo.id
                    ? 'bg-cyan-950/40 text-cyan-100 shadow-md border border-cyan-500/30'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                  }
                `}
                onClick={() => onSelectConversation(convo.id)}
              >
                <MessageSquare size={18} className={activeConversationId === convo.id ? 'text-cyan-400' : 'opacity-50'} />
                <div className="flex-1 truncate text-sm font-medium">
                  {convo.title.replace(/[\*\_\#\[\]]/g, '').trim()}
                </div>

                <button
                  className={`p-1 rounded-md hover:bg-slate-700 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity ${menuOpenId === convo.id ? 'opacity-100 bg-slate-700' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(menuOpenId === convo.id ? null : convo.id);
                  }}
                >
                  <MoreVertical size={16} />
                </button>

                {menuOpenId === convo.id && (
                  <div ref={menuRef} className="absolute right-2 top-10 w-40 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingId(convo.id); setEditTitle(convo.title); setMenuOpenId(null); }}
                      className="w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2"
                    >
                      <Edit2 size={14} /> {t('rename')}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleExport(convo.id); }}
                      className="w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2"
                    >
                      <Download size={14} /> {t('export')}
                    </button>
                    <div className="h-px bg-slate-800 my-0.5"></div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(convo.id); }}
                      className="w-full text-left px-4 py-2.5 text-xs text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                    >
                      <Trash2 size={14} /> {t('delete')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConversationHistory;