import React, { useState, useEffect, useRef } from 'react';
import { Send, Settings, BookOpen, Database, AlertCircle, Scroll, Globe, Sparkles, Server, X, Search, Download } from 'lucide-react';
import { Message, SourceChunk, AppSettings, Conversation, ConversationHeader } from './types';
import { generateRAGResponse, getConversations, getConversation, saveConversation, searchScriptures } from './services/geminiService';
import { ParsedContent } from './utils/citationParser';
import ConversationHistory from './ConversationHistory';
import { TRANSLATIONS } from './translations';

const DEFAULT_SETTINGS: AppSettings = {
    apiKey: localStorage.getItem('shukabase_api_key') || '',
    backendUrl: 'http://localhost:5000/api/search',
    useMockData: false,
    model: 'gemini-2.5-flash-lite',
    language: localStorage.getItem('shukabase_language') === 'ru' ? 'ru' : 'en',
};

// --- Setup Wizard Component ---
const SetupScreen = ({ onComplete }: { onComplete: () => void }) => {
    const [step, setStep] = useState<'lang' | 'download'>('lang');
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (step === 'download') {
            const interval = setInterval(async () => {
                try {
                    const res = await fetch('http://localhost:5000/api/setup/status');
                    const data = await res.json();
                    if (data.setup_state) {
                        setProgress(data.setup_state.progress);
                        setStatus(data.setup_state.status);
                        if (data.setup_state.status === 'completed') {
                            clearInterval(interval);
                            setTimeout(onComplete, 1000);
                        } else if (data.setup_state.status === 'error') {
                            setError(data.setup_state.error);
                            clearInterval(interval);
                        }
                    }
                } catch (e) {
                    console.error("Polling error", e);
                }
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [step, onComplete]);

    const startDownload = async (lang: string) => {
        try {
            setStep('download');
            await fetch('http://localhost:5000/api/setup/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language: lang })
            });
        } catch (e) {
            setError("Failed to start download");
        }
    };

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#0f1117] text-white p-8 relative overflow-hidden">
            <div className="absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full animate-pulse"
                    style={{ background: 'radial-gradient(circle, rgba(88, 28, 135, 0.2) 0%, rgba(88, 28, 135, 0) 60%)' }}></div>
                <div className="absolute bottom-[-500px] right-[-500px] w-[1200px] h-[1200px] animate-pulse"
                    style={{ background: 'radial-gradient(circle, rgba(180, 83, 9, 0.15) 0%, rgba(180, 83, 9, 0) 60%)', animationDelay: '2s' }}></div>
            </div>

            <div className="max-w-md w-full glass-panel rounded-xl p-8 shadow-2xl border border-slate-700/50 relative z-10">
                <div className="text-center mb-8">
                    <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-amber-500/20 to-purple-600/20 rounded-full flex items-center justify-center border border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                        <img src="/parrot.png" alt="Shuka" className="w-16 h-16 object-contain" />
                    </div>
                    <h1 className="text-3xl font-bold glow-text-amber mb-2">
                        Shukabase AI
                    </h1>
                    <p className="text-slate-400 text-sm">First Run Setup</p>
                </div>

                {step === 'lang' ? (
                    <div className="space-y-4">
                        <p className="text-center text-slate-300 mb-6 text-sm">
                            Please select your preferred language pack to download the knowledge base.
                        </p>

                        <div className="grid grid-cols-1 gap-3">
                            <button
                                onClick={() => startDownload('all')}
                                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/50 rounded-lg font-medium text-slate-200 transition-all flex items-center justify-center gap-3 group"
                            >
                                <Globe className="w-5 h-5 text-amber-500 group-hover:scale-110 transition-transform" />
                                <span>Multilingual (RU + EN)</span>
                            </button>
                        </div>

                        <p className="text-[10px] text-center text-slate-500 mt-4">
                            Size: ~500MB. Requires internet connection.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="text-center">
                            <h3 className="text-lg font-semibold mb-2 text-slate-200">
                                {status === 'extracting' ? 'Extracting Files...' :
                                    status === 'initializing' ? 'Initializing Engine...' :
                                        'Downloading Knowledge Base...'}
                            </h3>
                            <p className="text-slate-500 text-xs">Please wait, this may take a few minutes.</p>
                        </div>

                        <div className="relative pt-1">
                            <div className="flex mb-2 items-center justify-between">
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                                        Progress
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-bold text-amber-500">
                                        {progress}%
                                    </span>
                                </div>
                            </div>
                            <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-slate-800">
                                <div
                                    style={{ width: `${progress}%` }}
                                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-amber-500 to-orange-600 transition-all duration-500"
                                ></div>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-900/20 border border-red-500/30 text-red-200 p-4 rounded-lg text-sm text-center">
                                <p className="mb-2">Error: {error}</p>
                                <button
                                    onClick={() => setStep('lang')}
                                    className="text-xs text-red-400 hover:text-red-300 underline"
                                >
                                    Try Again
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const App: React.FC = () => {
    const [appMode, setAppMode] = useState<'loading' | 'setup' | 'chat'>('loading');
    const [conversations, setConversations] = useState<ConversationHeader[]>([]);
    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState<AppSettings>(() => {
        const savedLang = localStorage.getItem('shukabase_language');
        return { ...DEFAULT_SETTINGS, language: savedLang === 'ru' ? 'ru' : 'en' };
    });

    // Auto-save language settings
    // Auto-save settings
    useEffect(() => {
        if (settings.language) {
            localStorage.setItem('shukabase_language', settings.language);
        }
        if (settings.apiKey) {
            localStorage.setItem('shukabase_api_key', settings.apiKey);
        }
    }, [settings]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [currentSources, setCurrentSources] = useState<SourceChunk[]>([]);
    const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [fullTextModalOpen, setFullTextModalOpen] = useState(false);
    const [fullTextContent, setFullTextContent] = useState('');
    const [fullTextTitle, setFullTextTitle] = useState('');
    const [currentHtmlPath, setCurrentHtmlPath] = useState<string>('');

    // Manual Search State
    const [sidebarMode, setSidebarMode] = useState<'context' | 'search'>('context');
    const [manualSearchQuery, setManualSearchQuery] = useState('');
    const [manualSearchResults, setManualSearchResults] = useState<SourceChunk[]>([]);
    const [manualSearchLoading, setManualSearchLoading] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);

    // Initial Check for Setup
    useEffect(() => {
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds timeout

        const checkStatus = async () => {
            try {
                const res = await fetch('http://localhost:5000/api/setup/status');
                const data = await res.json();
                if (data.installed) {
                    setAppMode('chat');
                } else {
                    setAppMode('setup');
                }
            } catch (e) {
                attempts++;
                if (attempts >= maxAttempts) {
                    setConnectionError("Backend failed to start. Please check logs.");
                    return;
                }
                setTimeout(checkStatus, 1000);
            }
        };
        checkStatus();
    }, []);

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
        if (appMode === 'chat') {
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
        }
    }, [appMode]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [activeConversation?.messages, loading]);

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
        setInput('');
        setCurrentSources([]);
        setManualSearchResults([]);
        setManualSearchQuery('');
    };

    const isSendingRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setLoading(false);
        isSendingRef.current = false;

        // Remove the loading message or show it as cancelled?
        // For now, we will leave the last added message as is, 
        // effectively user will see where it stopped. 
        // We might want to add a system message saying "Generation stopped."
        if (activeConversation) {
            const stoppedMsg: Message = { role: 'model', content: "🛑 Generation stopped by user.", parts: [{ text: "🛑 Generation stopped by user." }], timestamp: Date.now() };
            setActiveConversation({
                ...activeConversation,
                messages: [...activeConversation.messages, stoppedMsg]
            });
        }
    };

    const handleSend = async () => {
        if (!input.trim() || loading || isSendingRef.current) return;
        if (!settings.apiKey) {
            setIsSettingsOpen(true);
            return;
        }

        const userMsgContent = input;
        setInput('');
        setLoading(true);
        isSendingRef.current = true;

        const newUserMsg: Message = { role: 'user', content: userMsgContent, parts: [{ text: userMsgContent }], timestamp: Date.now() };

        const updatedConversation: Conversation = activeConversation
            ? { ...activeConversation, messages: [...activeConversation.messages, newUserMsg], lastModified: Date.now() }
            : { id: Date.now().toString(), title: userMsgContent.slice(0, 30) + '...', messages: [newUserMsg], createdAt: new Date().toISOString(), lastModified: Date.now() };

        setActiveConversation(updatedConversation);

        try {
            let collectedSources: SourceChunk[] = [];

            // Setup AbortController
            const abortController = new AbortController();
            abortControllerRef.current = abortController;

            const answer = await generateRAGResponse(
                userMsgContent,
                [],
                settings,
                updatedConversation.messages,
                undefined,
                (chunks) => {
                    collectedSources = [...collectedSources, ...chunks];
                },
                abortController.signal
            );

            const uniqueSources = Array.from(new Map(collectedSources.map(s => [s.id, s])).values());

            const newModelMsg: Message = {
                role: 'model',
                content: answer,
                parts: [{ text: answer }],
                sources: uniqueSources,
                timestamp: Date.now()
            };

            const finalConversation = {
                ...updatedConversation,
                messages: [...updatedConversation.messages, newModelMsg],
                lastModified: Date.now()
            };

            setActiveConversation(finalConversation);
            if (uniqueSources.length > 0) {
                setCurrentSources(uniqueSources);
                if (!sidebarOpen) setSidebarOpen(true);
            }

            await saveConversation(finalConversation);
            const convos = await getConversations();
            setConversations(convos);

        } catch (error: any) {
            if (error.message === "Aborted by user") {
                console.log("Generation aborted");
                // Already handled in handleStop
                return;
            }
            console.error("Error generating response:", error);
            const errorMsg: Message = { role: 'model', content: "Sorry, I encountered an error. Please check your API key and settings.", parts: [{ text: "Sorry, I encountered an error. Please check your API key and settings." }], timestamp: Date.now() };
            setActiveConversation({
                ...updatedConversation,
                messages: [...updatedConversation.messages, errorMsg]
            });
        } finally {
            setLoading(false);
            isSendingRef.current = false;
            abortControllerRef.current = null;
        }
    };

    const handleManualSearch = async () => {
        if (!manualSearchQuery.trim() || manualSearchLoading) return;
        setManualSearchLoading(true);
        try {
            const results = await searchScriptures(manualSearchQuery, settings);
            setManualSearchResults(results);
        } catch (error) {
            console.error("Error during manual search:", error);
            setManualSearchResults([]);
        } finally {
            setManualSearchLoading(false);
        }
    };

    const loadFullText = async (path: string, title?: string) => {
        try {
            let response = await fetch(path);
            if (!response.ok) {
                let fallbackPath = '';
                if (path.includes('/books/en/')) {
                    fallbackPath = path.replace('/books/en/', '/books/ru/');
                } else if (path.includes('/books/ru/')) {
                    fallbackPath = path.replace('/books/ru/', '/books/en/');
                }

                if (fallbackPath) {
                    const fallbackResponse = await fetch(fallbackPath);
                    if (fallbackResponse.ok) {
                        response = fallbackResponse;
                        path = fallbackPath;
                    }
                }
            }

            if (!response.ok) throw new Error(`Failed to load: ${response.statusText}`);

            const htmlContent = await response.text();
            let contentToDisplay = htmlContent;
            const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch) contentToDisplay = bodyMatch[1];
            else {
                const mainMatch = htmlContent.match(/<main[^>]*>([\s\S]*)<\/main>/i);
                if (mainMatch) contentToDisplay = mainMatch[1];
            }
            contentToDisplay = contentToDisplay.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");

            let displayTitle = title || '';
            if (!displayTitle) {
                const titleMatch = htmlContent.match(/<h1[^>]*>(.*?)<\/h1>/i);
                if (titleMatch) displayTitle = titleMatch[1].replace(/<[^>]+>/g, '');
            }

            setFullTextContent(contentToDisplay);
            setFullTextTitle(displayTitle || 'Text View');
            setCurrentHtmlPath(path);
            setFullTextModalOpen(true);
        } catch (error) {
            setFullTextContent("Could not load full chapter text. Here is the excerpt: " + (title || ""));
            setFullTextTitle("Error Loading Full Text");
            setFullTextModalOpen(true);
        }
    };

    const handleReadFull = async (chunk: SourceChunk) => {
        const lang = settings.language || 'en';
        const bookMap: Record<string, string> = {
            'Srimad-Bhagavatam': 'sb', 'Bhagavad-gita As It Is': 'bg', 'Sri Caitanya-caritamrta': 'cc',
            'Nectar of Devotion': 'nod', 'Nectar of Instruction': 'noi', 'Teachings of Lord Caitanya': 'tqk',
            'Sri Isopanisad': 'iso', 'Light of the Bhagavata': 'lob', 'Perfect Questions, Perfect Answers': 'pop',
            'Path of Perfection': 'pop', 'Science of Self Realization': 'sc', 'Life Comes from Life': 'lcfl',
            'Krishna Book': 'kb', 'Raja-Vidya': 'rv', 'Beyond Birth and Death': 'bbd',
            'Civilization and Transcendence': 'ct', 'Krsna Consciousness The Matchless Gift': 'mg',
            'Easy Journey to Other Planets': 'ej', 'On the Way to Krsna': 'owk', 'Perfection of Yoga': 'poy',
            'Spiritual Yoga': 'sy', 'Transcendental Teachings of Prahlad Maharaja': 'ttpm',
            'sb': 'sb', 'bg': 'bg', 'cc': 'cc', 'nod': 'nod', 'noi': 'noi', 'tqk': 'tqk', 'iso': 'iso',
            'lob': 'lob', 'pop': 'pop', 'sc': 'sc', 'rv': 'rv', 'bbd': 'bbd', 'owk': 'owk', 'poy': 'poy', 'spl': 'spl'
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
                setFullTextContent(chunk.content);
                setFullTextTitle(chunk.bookTitle);
                setFullTextModalOpen(true);
                return;
            }
        }

        const niceBookTitle = getBookTitle(chunk.bookTitle);
        let niceChapter = chunk.chapter;
        let niceVerse = chunk.verse;

        if (typeof chunk.chapter === 'string' && (chunk.chapter.includes('/') || chunk.chapter.includes('\\'))) {
            const parts = chunk.chapter.replace(/\\/g, '/').split('/');
            if (parts.length >= 2) {
                const numbers = parts.filter(p => /^\d+$/.test(p));
                if (numbers.length >= 2) {
                    niceChapter = numbers[numbers.length - 2];
                    niceVerse = numbers[numbers.length - 1];
                }
            }
        }

        const titleSuffix = niceVerse ? `${niceChapter ? niceChapter + '.' : ''}${niceVerse}` : (niceChapter ? `Chapter ${niceChapter}` : '');
        await loadFullText(chapterPath, `${niceBookTitle} ${titleSuffix}`);
    };

    const handleModalClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
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
                    if (part === '..') parts.pop();
                    else parts.push(part);
                }
                loadFullText(parts.join('/'));
            }
        }
    };

    const toggleLanguage = () => {
        setSettings(prev => ({ ...prev, language: prev.language === 'en' ? 'ru' : 'en' }));
    };

    const handleCitationClick = (citation: string) => {
        setHighlightedSourceId(citation);
        if (sidebarMode !== 'context') setSidebarMode('context');
        if (!sidebarOpen) setSidebarOpen(true);
        setTimeout(() => {
            const element = document.getElementById(`source-${citation}`);
            if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    };

    if (appMode === 'loading') {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#0f1117] text-white p-4 text-center">
                {connectionError ? (
                    <div className="max-w-md bg-red-900/20 border border-red-500/50 p-6 rounded-xl animate-fade-in">
                        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-red-200 mb-2">Connection Error</h2>
                        <p className="text-slate-400 mb-6">{connectionError}</p>
                        <p className="text-xs text-slate-500 mb-6">
                            The backend server is not responding. This might be due to missing dependencies or a crash on startup.
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white font-medium transition-colors shadow-lg shadow-red-900/20"
                        >
                            Retry Connection
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500 mb-4"></div>
                        <p className="text-slate-400 animate-pulse">Starting Shukabase Server...</p>
                    </>
                )}
            </div>
        );
    }

    if (appMode === 'setup') {
        return <SetupScreen onComplete={() => setAppMode('chat')} />;
    }

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gradient-to-br from-purple-900/10 via-transparent to-orange-900/10">
            <div className="absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full animate-pulse"
                    style={{ background: 'radial-gradient(circle, rgba(88, 28, 135, 0.2) 0%, rgba(88, 28, 135, 0) 60%)' }}></div>
                <div className="absolute bottom-[-500px] right-[-500px] w-[1200px] h-[1200px] animate-pulse"
                    style={{ background: 'radial-gradient(circle, rgba(180, 83, 9, 0.15) 0%, rgba(180, 83, 9, 0) 60%)', animationDelay: '2s' }}></div>

            </div>

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
                        <div key={`${activeConversation?.id}-${index}`}>
                            <ParsedContent content={msg.content} onCitationClick={handleCitationClick} t={t} />
                        </div>
                    ))}
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
                            <div className="relative w-24 h-24 mb-6">
                                <div className="absolute inset-0 bg-amber-500/20 rounded-full animate-ping"></div>
                                <img
                                    src="/parrot.png"
                                    alt="Shukabase Logo"
                                    className="w-24 h-24 relative z-10 object-contain drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]"
                                />
                            </div>
                            <div className="flex items-center gap-3 text-amber-500 font-medium">
                                <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                                <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                <span className="ml-2 tracking-widest uppercase text-xs opacity-80">{t('agentThinking')}</span>
                            </div>
                        </div>
                    )}
                    {!activeConversation && !loading && (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-0 animate-fade-in" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
                            <div className="w-32 h-32 mb-8 relative group">
                                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-purple-600/20 rounded-full blur-xl group-hover:blur-2xl transition-all duration-700"></div>
                                <img
                                    src="/parrot.png"
                                    alt="Shukabase Logo"
                                    className="w-full h-full relative z-10 object-contain drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]"
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
                            onKeyDown={(e) => e.key === 'Enter' && !loading && handleSend()}
                            placeholder={t('inputPlaceholder')}
                            className="relative w-full bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-500 rounded-xl pl-4 pr-12 py-3.5 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all shadow-lg"
                            disabled={loading}
                        />

                        {loading ? (
                            <button
                                onClick={handleStop}
                                className="absolute right-2 top-2 p-1.5 bg-red-600/80 hover:bg-red-500 text-white rounded-lg transition-all shadow-lg shadow-red-900/20"
                                title="Stop generation"
                            >
                                <X size={18} />
                            </button>
                        ) : (
                            <button
                                onClick={handleSend}
                                disabled={!input.trim()}
                                className="absolute right-2 top-2 p-1.5 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-orange-900/20"
                            >
                                <Send size={18} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div
                className={`fixed inset-y-0 right-0 z-40 w-full sm:w-96 glass-panel border-l border-slate-800/50 shadow-2xl transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:w-96 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'} `}
            >
                <div className="h-full flex flex-col">
                    <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800/50 bg-slate-950/30">
                        <div className="flex gap-4 w-full">
                            <button
                                onClick={() => setSidebarMode('context')}
                                className={`relative flex-1 py-4 text-sm font-medium transition-colors ${sidebarMode === 'context' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                {t('context')}
                                {sidebarMode === 'context' && (
                                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></span>
                                )}
                            </button>
                            <button
                                onClick={() => setSidebarMode('search')}
                                className={`relative flex-1 py-4 text-sm font-medium transition-colors ${sidebarMode === 'search' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                {t('manualSearch')}
                                {sidebarMode === 'search' && (
                                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></span>
                                )}
                            </button>
                        </div>
                    </div>

                    {sidebarMode === 'context' ? (
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
                    ) : (
                        <div className="flex-1 flex flex-col h-full">
                            <div className="p-4 border-b border-slate-800/50">
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={manualSearchQuery}
                                        onChange={(e) => setManualSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                                        placeholder={t('searchPlaceholder')}
                                        className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-4 pr-10 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                    />
                                    <button
                                        onClick={handleManualSearch}
                                        disabled={manualSearchLoading}
                                        className="absolute right-2 top-1.5 text-slate-400 hover:text-amber-400 transition-colors"
                                    >
                                        {manualSearchLoading ? <div className="animate-spin h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full"></div> : <Search size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {manualSearchResults.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-600 p-8 text-center">
                                        <Search size={48} className="mb-4 opacity-20" />
                                        <p className="text-sm">{t('searchPlaceholder')}</p>
                                    </div>
                                ) : (
                                    manualSearchResults.map((chunk) => (
                                        <div
                                            key={chunk.id}
                                            className="p-4 rounded-xl border bg-slate-900/40 border-slate-800 hover:border-amber-500/50 hover:shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-all cursor-pointer group"
                                            onClick={() => handleReadFull(chunk)}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-500/20 truncate max-w-[240px]">
                                                    {getBookTitle(chunk.bookTitle)}
                                                </span>
                                                <span className="text-[10px] text-slate-500 font-mono">
                                                    {Math.round(chunk.score * 100)}%
                                                </span>
                                            </div>
                                            <h4 className="text-xs font-semibold text-slate-300 mb-2 font-mono">
                                                {chunk.chapter && chunk.verse
                                                    ? `Chapter ${chunk.chapter}, Verse ${chunk.verse}`
                                                    : (chunk.pageNumber ? `Page ${chunk.pageNumber}` : '')}
                                            </h4>
                                            <p className="text-sm text-slate-400 leading-relaxed font-serif line-clamp-4 group-hover:line-clamp-none transition-all">
                                                "{chunk.content}"
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {fullTextModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setFullTextModalOpen(false)}>
                    <div className="glass-panel rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col border border-slate-700/50" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-900/30">
                            <h3 className="font-bold text-lg text-slate-100 glow-text-amber">{fullTextTitle}</h3>
                            <div className="flex items-center gap-2">

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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setIsSettingsOpen(false)}>
                    <div className="glass-panel border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
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

                            <div className="pt-4 flex justify-end">
                                <button
                                    onClick={() => setIsSettingsOpen(false)}
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors shadow-lg shadow-amber-900/20"
                                >
                                    {t('save')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;