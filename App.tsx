import React, { useState, useEffect, useRef } from 'react';
import { Send, Settings, BookOpen, Database, AlertCircle, Menu, X, Search, Sparkles, Server, Scroll, Globe } from 'lucide-react';
import { Message, SourceChunk, AppSettings, Conversation, ConversationHeader } from './types';
import { generateRAGResponse, getConversations, getConversation, saveConversation } from './services/geminiService';
import { DEMO_CHUNKS } from './constants';
import { ParsedContent } from './utils/citationParser';
import ConversationHistory from './ConversationHistory';
import { TRANSLATIONS } from './translations';

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: process.env.API_KEY || '',
  backendUrl: 'http://localhost:5000/api/search',
  useMockData: false,
  model: 'gemini-2.5-flash-lite',
  language: 'en',
};

const App: React.FC = () => {
  const [conversations, setConversations] = useState<ConversationHeader[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentSources, setCurrentSources] = useState<SourceChunk[]>([]);
  const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Helper for translations
  const t = (key: keyof typeof TRANSLATIONS.en) => {
    const lang = settings.language || 'en';
    return TRANSLATIONS[lang][key] || TRANSLATIONS['en'][key];
  };

  useEffect(() => {
    const loadConversations = async () => {
      try {
        const convos = await getConversations();
        setConversations(convos);
      } catch (error) {
        console.error("Failed to load conversations", error);
      }
    };
    loadConversations();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages]);



  const handleSend = async () => {
    if (!input.trim() || loading) return;
    if (!settings.apiKey) {
      setIsSettingsOpen(true);
      return;
    }

    const userMsgContent = input;
    setInput('');
    setLoading(true);

    const userMessage: Message = { role: 'user', parts: [{ text: userMsgContent }] };
    // Initial thinking message with empty steps
    const thinkingMessage: Message = {
      role: 'model',
      parts: [{ text: '' }],
      isThinking: true,
      agentSteps: []
    };

    let conversationToUpdate: Conversation;
    if (activeConversation) {
      conversationToUpdate = { ...activeConversation, messages: [...activeConversation.messages, userMessage, thinkingMessage] };
    } else {
      const newId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      conversationToUpdate = {
        id: newId,
        title: userMsgContent.substring(0, 50),
        createdAt: new Date().toISOString(),
        messages: [userMessage, thinkingMessage],
      };
    }

    setActiveConversation(conversationToUpdate);
    // Clear previous sources for a new query
    setCurrentSources([]);

    try {
      // We no longer pre-fetch chunks. The agent does it.
      // const chunks = await retrieveRelevantChunks(userMsgContent);
      // setCurrentSources(chunks);

      const history = conversationToUpdate.messages
        .filter(m => !m.isThinking)
        .slice(-50)
        .map(m => ({ role: m.role, parts: m.parts }));

      const responseText = await generateRAGResponse(
        userMsgContent,
        [], // No initial chunks
        settings,
        history,
        (step) => {
          // onStep callback: Update the thinking message with new steps
          setActiveConversation(prev => {
            if (!prev) return null;
            const newMessages = [...prev.messages];
            const lastMsg = newMessages[newMessages.length - 1];
            if (lastMsg.isThinking) {
              lastMsg.agentSteps = [...(lastMsg.agentSteps || []), step];
            }
            return { ...prev, messages: newMessages };
          });
        },
        (foundChunks) => {
          // onSourcesFound callback: Add new sources to the sidebar
          setCurrentSources(prev => {
            // Avoid duplicates
            const existingIds = new Set(prev.map(c => c.id));
            const newUnique = foundChunks.filter(c => !existingIds.has(c.id));
            return [...prev, ...newUnique];
          });
        }
      );

      const finalBotMessage: Message = {
        role: 'model',
        parts: [{ text: responseText }],
        // We can keep the steps in the final message too if we want to show the history of reasoning
        agentSteps: conversationToUpdate.messages[conversationToUpdate.messages.length - 1].agentSteps,
        relatedChunkIds: currentSources.map(c => c.id), // This might need to be updated with the latest currentSources
      };

      // Replace the "thinking" message with the final response
      // Note: We need to get the latest state of agentSteps from the activeConversation/thinkingMessage
      // But since we are inside the async function, we can't rely on state variable 'activeConversation' being perfectly up to date if we just used it.
      // However, we updated it via setActiveConversation callback.
      // A cleaner way is to just use the steps we collected?
      // Actually, let's just grab the steps from the last update or trust the state update flow.
      // For simplicity, we will just use the steps we have.

      // Wait, we need to access the *latest* steps.
      // Let's use a functional update for the final save to ensure we don't lose steps.

      setActiveConversation(prev => {
        if (!prev) return null;
        const msgs = [...prev.messages];
        const thinkingMsg = msgs[msgs.length - 1];
        const finalSteps = thinkingMsg.agentSteps || [];

        const finalMsg: Message = {
          role: 'model',
          parts: [{ text: responseText }],
          agentSteps: finalSteps,
          relatedChunkIds: currentSources.map(c => c.id) // This might be slightly stale if currentSources update hasn't processed, but usually fine.
        };

        const finalConversation = { ...prev, messages: msgs.slice(0, -1).concat(finalMsg) };
        saveConversation(finalConversation); // Fire and forget save

        // Update list if new
        if (!conversations.some(c => c.id === finalConversation.id)) {
          setConversations(old => [{ id: finalConversation.id, title: finalConversation.title, createdAt: finalConversation.createdAt }, ...old]);
        }

        return finalConversation;
      });

    } catch (error: any) {
      console.error("Agent Error:", error);
      let errorMsg = error.message;

      // Check for quota exceeded error
      if (
        errorMsg.includes("429") ||
        errorMsg.includes("RESOURCE_EXHAUSTED") ||
        errorMsg.includes("quota")
      ) {
        errorMsg = t('quotaExceeded');
      } else {
        errorMsg = `❌ **${t('error')}**: ${errorMsg}`;
      }

      const errorMessage: Message = {
        role: 'model',
        parts: [{ text: errorMsg }],
      };
      setActiveConversation(prev => prev ? ({ ...prev, messages: prev.messages.slice(0, -1).concat(errorMessage) }) : null);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectConversation = async (id: string) => {
    try {
      const convo = await getConversation(id);
      setActiveConversation(convo);
      // We should probably load sources for the active conversation if we saved them,
      // but currently we don't save sources list in conversation, only IDs.
      // For now, we clear sources on load or we could re-fetch them if we had a bulk fetch endpoint.
      setCurrentSources([]);
    } catch (error) {
      console.error("Failed to load conversation", error);
    }
  };

  const handleNewChat = () => {
    setActiveConversation(null);
    setCurrentSources([]);
  };

  const handleCitationClick = (id: string) => {
    setHighlightedSourceId(id);
    if (!sidebarOpen) setSidebarOpen(true);
    setTimeout(() => {
      const el = document.getElementById(`source-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-amber-500');
        setTimeout(() => el.classList.remove('ring-2', 'ring-amber-500'), 2000);
      }
    }, 100);
  };

  const toggleLanguage = () => {
    setSettings(prev => ({
      ...prev,
      language: prev.language === 'en' ? 'ru' : 'en'
    }));
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">

      {/* LEFT PANEL: Conversation History */}
      <ConversationHistory
        conversations={conversations}
        activeConversationId={activeConversation?.id || null}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        t={t}
        onConversationsUpdate={async () => {
          try {
            const convos = await getConversations();
            setConversations(convos);
          } catch (e) { console.error("Failed to refresh conversations", e); }
        }}
      />

      {/* MIDDLE PANEL: Chat Interface */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-600 to-orange-700 flex items-center justify-center shadow-lg shadow-orange-900/50">
              <Scroll className="text-white" size={18} />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-slate-100">{t('appTitle')}</h1>
              <p className="text-xs text-slate-500">{t('appSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors border border-slate-700"
            >
              <Globe size={14} className="text-amber-500" />
              {settings.language === 'en' ? 'EN' : 'RU'}
            </button>
            <div className={`hidden md:flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded border ${settings.useMockData ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
              {settings.useMockData ? t('demoMode') : t('connected')}
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-slate-400 hover:text-white transition-colors hover:bg-slate-800 rounded-lg"
            >
              <Settings size={20} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {(activeConversation?.messages || []).map((msg, index) => (
            <div
              key={`${activeConversation?.id}-${index}`}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[95%] md:max-w-[80%] rounded-2xl px-5 py-4 shadow-xl ${msg.role === 'user'
                  ? 'bg-gradient-to-r from-amber-700 to-orange-800 text-white rounded-tr-none'
                  : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-none'
                  }`}
              >
                {/* Render Agent Steps (Thoughts/Actions) */}
                {msg.agentSteps && msg.agentSteps.length > 0 && (
                  <div className="mb-4 space-y-2 border-b border-slate-700/50 pb-3">
                    {msg.agentSteps.map((step, idx) => (
                      <div key={idx} className="text-xs font-mono flex gap-2 items-start animate-fadeIn">
                        {step.type === 'thought' && (
                          <>
                            <span className="text-amber-500/50 shrink-0">{t('agentThinking')}</span>
                            <span className="text-slate-400 italic">{step.content}</span>
                          </>
                        )}
                        {step.type === 'action' && (
                          <>
                            <span className="text-emerald-500/50 shrink-0">{t('agentExecuting')}</span>
                            <span className="text-emerald-400">{step.content}</span>
                          </>
                        )}
                        {step.type === 'observation' && (
                          <>
                            <span className="text-blue-500/50 shrink-0">{t('agentResult')}</span>
                            <span className="text-blue-400">{step.content}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {msg.isThinking && msg.parts[0].text === '' ? (
                  <div className="flex items-center gap-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce"></div>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">{t('agentWorking')}</span>
                  </div>
                ) : (
                  msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.parts[0].text}</p>
                  ) : (
                    <ParsedContent content={msg.parts[0].text} onCitationClick={handleCitationClick} />
                  )
                )}

                <div className="mt-2 flex items-center justify-between opacity-50 text-[10px] uppercase tracking-wider">
                  <span>{new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {msg.role === 'model' && (
                    <span className="flex items-center gap-1"><Sparkles size={10} />Gemini Agent</span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {!activeConversation && (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <Sparkles size={48} className="mb-4" />
              <h2 className="text-2xl font-bold mb-2">{t('welcomeTitle')}</h2>
              <p>{t('welcomeText')}</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={t('inputPlaceholder')}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-xl pl-4 pr-12 py-3.5 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all shadow-lg"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="absolute right-2 top-2 p-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Sources Sidebar */}
      <div
        className={`fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-slate-950 border-l border-slate-800 shadow-2xl transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:w-96 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="h-full flex flex-col">
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 bg-slate-950">
            <h2 className="font-semibold text-slate-200 flex items-center gap-2">
              <Database size={18} className="text-amber-500" />
              {t('retrievedVerses')}
            </h2>
            <div className="text-xs font-mono text-slate-500 bg-slate-900 px-2 py-1 rounded">
              {currentSources.length} {t('found')}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {currentSources.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 p-8 text-center">
                <BookOpen size={48} className="mb-4 opacity-20" />
                <p className="text-sm">{t('noVerses')}</p>
                <p className="text-xs mt-2 opacity-50">{t('searchPlaceholder')}</p>
              </div>
            ) : (
              currentSources.map((chunk) => (
                <div
                  key={chunk.id}
                  id={`source-${chunk.id}`}
                  className={`
                    p-4 rounded-xl border transition-all duration-300 cursor-pointer group
                    ${highlightedSourceId === chunk.id
                      ? 'bg-amber-900/20 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }
                  `}
                  onClick={() => setHighlightedSourceId(chunk.id)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-500/20 truncate max-w-[180px]">
                      {chunk.bookTitle}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono group-hover:text-slate-400">
                      {Math.round(chunk.score * 100)}%
                    </span>
                  </div>

                  <h4 className="text-xs font-semibold text-slate-300 mb-2 font-mono flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                    {chunk.chapter && chunk.verse
                      ? `Chapter ${chunk.chapter}, Verse ${chunk.verse}`
                      : `Page ${chunk.pageNumber}`}
                  </h4>

                  <p className="text-sm text-slate-400 leading-relaxed font-serif border-l-2 border-slate-700 pl-3 line-clamp-6 group-hover:line-clamp-none transition-all">
                    "{chunk.content}"
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-100">{t('settings')}</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">{t('geminiApiKey')}</label>
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="space-y-4">
                <label className="text-sm font-medium text-slate-300">{t('dataConnection')}</label>
                <div className="flex gap-4">
                  <label className={`
                    flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border cursor-pointer transition-all
                    ${settings.useMockData
                      ? 'bg-amber-900/20 border-amber-500 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                    }
                  `}>
                    <input type="radio" className="hidden" checked={settings.useMockData} onChange={() => setSettings({ ...settings, useMockData: true })} />
                    <BookOpen size={24} />
                    <span className="text-xs font-semibold">{t('demoMode')}</span>
                  </label>

                  <label className={`
                    flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border cursor-pointer transition-all
                    ${!settings.useMockData
                      ? 'bg-amber-900/20 border-amber-500 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                    }
                  `}>
                    <input type="radio" className="hidden" checked={!settings.useMockData} onChange={() => setSettings({ ...settings, useMockData: false })} />
                    <Server size={24} />
                    <span className="text-xs font-semibold">{t('bridge')}</span>
                  </label>
                </div>
              </div>

              {!settings.useMockData && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">{t('backendUrl')}</label>
                  <input
                    type="text"
                    value={settings.backendUrl}
                    onChange={(e) => setSettings({ ...settings, backendUrl: e.target.value })}
                    placeholder="http://localhost:8000/search"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                  <div className="flex items-start gap-2 text-xs text-amber-500/80 bg-amber-950/20 p-2 rounded border border-amber-900/30">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{t('bridgeHint')}</span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Model</label>
                <select
                  value={settings.model}
                  onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-amber-500 focus:outline-none appearance-none"
                >
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-2.0-flash-lite-preview-02-05">Gemini 2.0 Flash Lite Preview</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  <option value="gemini-1.0-pro">Gemini 1.0 Pro</option>
                  <option value="gemma-2-27b-it">Gemma 2 27B</option>
                  <option value="gemma-3-27b-it">Gemma 3 27B (Experimental)</option>
                </select>
                <p className="text-xs text-slate-500">Select a different model if you hit rate limits.</p>
              </div>

            </div>

            <div className="p-6 border-t border-slate-800 bg-slate-900/50 rounded-b-2xl">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-full py-2.5 bg-amber-700 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors"
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
