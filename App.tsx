import React, { useState, useEffect, useRef } from 'react';
import { Send, Settings, BookOpen, Database, AlertCircle, Scroll, Globe, Sparkles, Server, X } from 'lucide-react';
import { Message, SourceChunk, AppSettings, Conversation, ConversationHeader } from './types';
import { generateRAGResponse, getConversations, getConversation, saveConversation } from './services/geminiService';
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
  const [fullTextModalOpen, setFullTextModalOpen] = useState(false);
  const [fullTextContent, setFullTextContent] = useState('');
  const [fullTextTitle, setFullTextTitle] = useState('');
  const [currentHtmlPath, setCurrentHtmlPath] = useState<string>('');

  // Helper for translations
  const t = (key: keyof typeof TRANSLATIONS.en) => {
    const lang = settings.language || 'en';
    // @ts-ignore
    const value = TRANSLATIONS[lang][key] || TRANSLATIONS['en'][key];
    if (typeof value === 'string') return value;
    return '';
  };

  const getBookTitle = (code: string) => {
    const lang = settings.language || 'en';
    // @ts-ignore
    const books = TRANSLATIONS[lang].books || TRANSLATIONS['en'].books;
    const normalizedCode = code.toLowerCase();
    return books[normalizedCode] || code.toUpperCase();
  };

  useEffect(() => {
    const loadConversations = async () => {
      try {
        const convos = await getConversations();
        setConversations(convos);
      } catch (error) {
        console.error("Failed to load conversations", error);
        setConversations([]);
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
    setCurrentSources([]);

    // We need a local variable to track sources because state updates are asynchronous
    let gatheredSources: SourceChunk[] = [];

    try {
      const history = conversationToUpdate.messages
        .filter(m => !m.isThinking)
        .slice(-50)
        .map(m => ({ role: m.role, parts: m.parts }));

      const responseText = await generateRAGResponse(
        userMsgContent,
        [],
        settings,
        history,
        (step) => {
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
          // Update local variable
          gatheredSources = [...gatheredSources, ...foundChunks];

          // Update UI state
          setCurrentSources(prev => {
            const existingIds = new Set(prev.map(c => c.id));
            const newUnique = foundChunks.filter(c => !existingIds.has(c.id));
            return [...prev, ...newUnique];
          });
        }
      );

      setActiveConversation(prev => {
        if (!prev) return null;
        const msgs = [...prev.messages];
        const thinkingMsg = msgs[msgs.length - 1];
        const finalSteps = thinkingMsg.agentSteps || [];

        // Deduplicate gathered sources for the message record
        const uniqueSources = Array.from(new Map(gatheredSources.map(item => [item.id, item])).values());

        const finalMsg: Message = {
          role: 'model',
          parts: [{ text: responseText }],
          agentSteps: finalSteps,
          sources: uniqueSources
        };

        const finalConversation = { ...prev, messages: msgs.slice(0, -1).concat(finalMsg) };
        saveConversation(finalConversation);

        // Update list: remove old entry if exists, add new to top
        setConversations(old => {
          const filtered = old.filter(c => c.id !== finalConversation.id);
          return [{
            id: finalConversation.id,
            title: finalConversation.title,
            createdAt: finalConversation.createdAt
          }, ...filtered];
        });

        return finalConversation;
      });

    } catch (error: any) {
      console.error("Agent Error:", error);
      let errorMsg = error.message;

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
      if (convo) {
        setActiveConversation(convo);

        const lastModelMessage = [...convo.messages].reverse().find(m => m.role === 'model' && m.sources && m.sources.length > 0);
        if (lastModelMessage && lastModelMessage.sources) {
          setCurrentSources(lastModelMessage.sources);
        } else {
          setCurrentSources([]);
        }
      }
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

  const loadFullText = async (path: string, title?: string) => {
    try {
      console.log("Loading full text from:", path);
      let response = await fetch(path);
      console.log("Fetch response status:", response.status);

      if (!response.ok) {
        let fallbackPath = '';
        if (path.includes('/books/en/')) {
          fallbackPath = path.replace('/books/en/', '/books/ru/');
        } else if (path.includes('/books/ru/')) {
          fallbackPath = path.replace('/books/ru/', '/books/en/');
        }

        if (fallbackPath) {
          console.log("Primary path failed. Trying fallback path:", fallbackPath);
          const fallbackResponse = await fetch(fallbackPath);
          if (fallbackResponse.ok) {
            response = fallbackResponse;
            path = fallbackPath;
          }
        }
      }

      if (!response.ok) {
        throw new Error(`Failed to load: ${response.statusText}`);
      }

      const htmlContent = await response.text();
      console.log("Loaded content length:", htmlContent.length);

      let contentToDisplay = htmlContent;

      const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      if (bodyMatch) {
        contentToDisplay = bodyMatch[1];
      } else {
        const mainMatch = htmlContent.match(/<main[^>]*>([\s\S]*)<\/main>/i);
        if (mainMatch) {
          contentToDisplay = mainMatch[1];
        }
      }

      contentToDisplay = contentToDisplay.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");

      let displayTitle = title || '';
      if (!displayTitle) {
        const titleMatch = htmlContent.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (titleMatch) {
          displayTitle = titleMatch[1].replace(/<[^>]+>/g, '');
        }
      }

      setFullTextContent(contentToDisplay);
      setFullTextTitle(displayTitle || 'Text View');
      setCurrentHtmlPath(path);
      setFullTextModalOpen(true);
    } catch (error) {
      console.error('Error loading full text:', error);
      alert('Could not load full text. The file may not exist.');
    }
  };

  const handleReadFull = async (chunk: SourceChunk) => {
    console.log("handleReadFull called with chunk:", chunk);
    const lang = settings.language || 'en';
    const bookMap: Record<string, string> = {
      'Srimad-Bhagavatam': 'sb',
      'Bhagavad-gita As It Is': 'bg',
      'Sri Caitanya-caritamrta': 'cc',
      'Nectar of Devotion': 'nod',
      'Nectar of Instruction': 'noi',
      'Teachings of Lord Caitanya': 'tqk',
      'Sri Isopanisad': 'iso',
      'Light of the Bhagavata': 'lob',
      'Perfect Questions, Perfect Answers': 'pop',
      'Path of Perfection': 'pop',
      'Science of Self Realization': 'sc',
      'Life Comes from Life': 'lcfl',
      'Krishna Book': 'kb',
      'Raja-Vidya': 'rv',
      'Beyond Birth and Death': 'bbd',
      'Civilization and Transcendence': 'ct',
      'Krsna Consciousness The Matchless Gift': 'mg',
      'Easy Journey to Other Planets': 'ej',
      'On the Way to Krsna': 'owk',
      'Perfection of Yoga': 'poy',
      'Spiritual Yoga': 'sy',
      'Transcendental Teachings of Prahlad Maharaja': 'ttpm',
      'sb': 'sb',
      'bg': 'bg',
      'cc': 'cc',
      'nod': 'nod',
      'noi': 'noi',
      'tqk': 'tqk',
      'iso': 'iso',
      'lob': 'lob',
      'pop': 'pop',
      'sc': 'sc',
      'rv': 'rv',
      'bbd': 'bbd',
      'owk': 'owk',
      'poy': 'poy',
      'spl': 'spl'
    };

    let bookFolder = bookMap[chunk.bookTitle] || null;
    let chapterPath = '';

    if (chunk.chapter && typeof chunk.chapter === 'string' && (chunk.chapter.includes('/') || chunk.chapter.includes('\\'))) {
      const normalizedPath = chunk.chapter.replace(/\\/g, '/');
      chapterPath = `/books/${lang}/${normalizedPath}`;
    } else if (bookFolder) {
      if (chunk.verse) {
        chapterPath = `/books/${lang}/${bookFolder}/${chunk.chapter}/${chunk.verse}/index.html`;
      } else {
        chapterPath = `/books/${lang}/${bookFolder}/${chunk.chapter || 1}/index.html`;
      }
    } else {
      if (!bookFolder) {
        for (const [title, folder] of Object.entries(bookMap)) {
          if (chunk.bookTitle.includes(title) || title.includes(chunk.bookTitle)) {
            bookFolder = folder;
            break;
          }
        }
      }

      if (bookFolder) {
        if (chunk.verse) {
          chapterPath = `/books/${lang}/${bookFolder}/${chunk.chapter}/${chunk.verse}/index.html`;
        } else {
          chapterPath = `/books/${lang}/${bookFolder}/${chunk.chapter || 1}/index.html`;
        }
      } else {
        alert('Book folder not found for: ' + chunk.bookTitle);
        return;
      }
    }

    console.log("Constructed chapterPath:", chapterPath);
    await loadFullText(chapterPath, `${chunk.bookTitle} - ${chunk.chapter ? 'Chapter ' + chunk.chapter : ''} ${chunk.verse ? 'Verse ' + chunk.verse : ''}`);
  };

  const handleModalClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');

    if (anchor && anchor.href) {
      const href = anchor.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#')) {
        e.preventDefault();

        const currentDir = currentHtmlPath.substring(0, currentHtmlPath.lastIndexOf('/'));
        const parts = currentDir.split('/');
        const relativeParts = href.split('/');

        for (const part of relativeParts) {
          if (part === '.') continue;
          if (part === '..') {
            parts.pop();
          } else {
            parts.push(part);
          }
        }

        const newPath = parts.join('/');
        loadFullText(newPath);
      }
    }
  };

  return (
    <div className="flex h-screen bg-[#020617] text-slate-100 overflow-hidden font-sans relative selection:bg-amber-500/30">
      {/* Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        {/* Top Left Purple Glow */}
        <div className="absolute top-[-500px] left-[-500px] w-[1200px] h-[1200px] animate-pulse"
          style={{ background: 'radial-gradient(circle, rgba(88, 28, 135, 0.2) 0%, rgba(88, 28, 135, 0) 60%)' }}></div>

        {/* Bottom Right Amber Glow */}
        <div className="absolute bottom-[-500px] right-[-500px] w-[1200px] h-[1200px] animate-pulse"
          style={{ background: 'radial-gradient(circle, rgba(180, 83, 9, 0.15) 0%, rgba(180, 83, 9, 0) 60%)', animationDelay: '2s' }}></div>

        {/* Shuka Parrot */}
        <div className="absolute top-[12%] right-[25%] w-[350px] h-[350px] opacity-90 animate-float z-0 pointer-events-none">
          <img
            src="/parrot.png"
            alt="Shuka"
            className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(0,0,0,0.4)]"
            style={{ transform: 'rotate(-5deg)' }}
          />
        </div>
      </div>

      <div className="relative z-10 flex w-full h-full">
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

        <div className="flex-1 flex flex-col h-full min-w-0 relative">
          <header className="h-16 glass-header flex items-center justify-between px-6 z-20">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                <Scroll className="text-white" size={18} />
              </div>
              <div>
                <h1 className="font-bold text-lg tracking-tight text-slate-100 glow-text-amber">{t('appTitle')}</h1>
                <p className="text-xs text-slate-500">{t('appSubtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleLanguage}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors border border-slate-700 hover:border-amber-500/30"
              >
                <Globe size={14} className="text-amber-500" />
                {settings.language === 'en' ? 'EN' : 'RU'}
              </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-slate-400 hover:text-white transition-colors hover:bg-slate-800/50 rounded-lg"
              >
                <Settings size={20} />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scroll-smooth">
            {(activeConversation?.messages || []).map((msg, index) => (
              <div
                key={`${activeConversation?.id}-${index}`}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} `}
              >
                <div
                  className={`max-w-[95%] md:max-w-[80%] rounded-2xl px-5 py-4 shadow-xl backdrop-blur-sm ${msg.role === 'user'
                    ? 'bg-gradient-to-r from-amber-900/40 to-orange-900/40 border border-amber-500/20 text-white rounded-tr-none shadow-[0_0_15px_rgba(245,158,11,0.05)]'
                    : 'glass-panel text-slate-200 rounded-tl-none'
                    } `}
                >
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
                      <ParsedContent
                        content={msg.parts[0].text}
                        onCitationClick={handleCitationClick}
                        sources={msg.sources || currentSources}
                        onReadFull={handleReadFull}
                        t={t}
                      />
                    )
                  )}

                  <div className="mt-2 flex items-center justify-between opacity-50 text-[10px] uppercase tracking-wider">
                    <span>{new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.role === 'model' && (
                      <span className="flex items-center gap-1"><Sparkles size={10} className="text-amber-400" />Gemini Agent</span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {!activeConversation && (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <div className="relative mb-6">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] animate-pulse pointer-events-none"
                    style={{ background: 'radial-gradient(circle, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0) 70%)' }}></div>
                  <img
                    src="/logo192.png"
                    alt="Shukabase Logo"
                    className="w-24 h-24 relative z-10 object-contain drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]"
                  />
                </div>
                <h2 className="text-3xl font-bold mb-3 glow-text-amber tracking-tight">{t('welcomeTitle')}</h2>
                <p className="text-lg text-slate-400">{t('welcomeText')}</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-slate-800/50 bg-slate-900/60 backdrop-blur-md z-20">
            <div className="max-w-4xl mx-auto relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 to-purple-600 rounded-xl opacity-20 group-hover:opacity-40 transition duration-500 blur"></div>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={t('inputPlaceholder')}
                className="relative w-full bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-500 rounded-xl pl-4 pr-12 py-3.5 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all shadow-lg"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="absolute right-2 top-2 p-1.5 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-orange-900/20"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>

        <div
          className={`fixed inset-y-0 right-0 z-40 w-full sm:w-96 glass-panel border-l border-slate-800/50 shadow-2xl transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:w-96 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'} `}
        >
          <div className="h-full flex flex-col">
            <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800/50 bg-slate-950/30">
              <h2 className="font-semibold text-slate-200 flex items-center gap-2 glow-text-blue">
                <Database size={18} className="text-blue-500" />
                {t('retrievedVerses')}
              </h2>
              <div className="text-xs font-mono text-blue-300 bg-blue-900/20 border border-blue-500/20 px-2 py-1 rounded">
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
                    className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer group relative backdrop-blur-sm ${highlightedSourceId === chunk.id
                      ? 'bg-amber-900/20 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                      : 'bg-slate-900/40 border-slate-800 hover:border-blue-500/50 hover:shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                      }`}
                    onClick={() => setHighlightedSourceId(chunk.id)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span
                        className="text-[11px] font-bold uppercase tracking-wider text-amber-500 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-500/20 truncate max-w-[240px]"
                        title={getBookTitle(chunk.bookTitle)}
                      >
                        {getBookTitle(chunk.bookTitle)}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono group-hover:text-slate-400">
                        {Math.round(chunk.score * 100)}%
                      </span>
                    </div>

                    <h4 className="text-xs font-semibold text-slate-300 mb-2 font-mono flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                      {chunk.chapter && chunk.verse
                        ? `Chapter ${chunk.chapter}, Verse ${chunk.verse} `
                        : (chunk.pageNumber ? `Page ${chunk.pageNumber} ` : '')}
                    </h4>

                    <p className="text-sm text-slate-400 leading-relaxed font-serif border-l-2 border-slate-700 pl-3 line-clamp-6 group-hover:line-clamp-none transition-all">
                      "{chunk.content}"
                    </p>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReadFull(chunk);
                      }}
                      className="mt-3 w-full text-xs py-2 px-3 bg-slate-800/80 hover:bg-slate-700 text-amber-400 rounded-lg transition-colors border border-slate-700 hover:border-amber-500/50 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100"
                    >
                      <BookOpen size={12} />
                      {t('readFull')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {fullTextModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setFullTextModalOpen(false)}>
            <div className="glass-panel rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col border border-slate-700/50" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-900/30">
                <h3 className="font-bold text-lg text-slate-100 glow-text-amber">{fullTextTitle}</h3>
                <div className="flex items-center gap-2">
                  <a
                    href={currentHtmlPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-slate-400 hover:text-amber-500 transition-colors"
                    title="Open in new tab"
                  >
                    <Globe size={20} />
                  </a>
                  <button onClick={() => setFullTextModalOpen(false)} className="text-slate-400 hover:text-white transition-colors hover:rotate-90 duration-200">
                    <X size={24} />
                  </button>
                </div>
              </div>
              <div
                className="flex-1 overflow-y-auto p-8 prose prose-invert prose-slate max-w-none custom-scrollbar"
                onClick={handleModalClick}
              >
                {fullTextContent ? (
                  <div dangerouslySetInnerHTML={{ __html: fullTextContent }} />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500">
                    <div className="animate-pulse flex flex-col items-center">
                      <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                      <p>Loading ancient wisdom...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="glass-panel border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
              <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                <h3 className="font-bold text-lg text-slate-100 glow-text-amber">{t('settings')}</h3>
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
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Model</label>
                  <select
                    value={settings.model}
                    onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-amber-500 focus:outline-none appearance-none"
                  >
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    <option value="gemini-2.0-flash-lite-preview-02-05">Gemini 2.0 Flash Lite Preview</option>
                  </select>
                  <p className="text-xs text-slate-500">Select a different model if you hit rate limits.</p>
                </div>
              </div>

              <div className="p-6 border-t border-slate-800 bg-slate-900/50 rounded-b-2xl">
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-700 to-orange-700 hover:from-amber-600 hover:to-orange-600 text-white font-medium rounded-lg transition-all shadow-lg shadow-orange-900/20"
                >
                  {t('save')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;