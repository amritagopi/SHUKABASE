import React, { useState, useEffect, useRef } from 'react';
import { Send, Settings, BookOpen, Database, AlertCircle, Scroll, Globe, Sparkles, Server, X, Search, Download, Heart, ArrowRight } from 'lucide-react';
import { Message, SourceChunk, AppSettings, Conversation, ConversationHeader, AgentStep } from './types';
import { generateRAGResponse, getConversations, getConversation, saveConversation, searchScriptures } from './services/geminiService';
import { ParsedContent } from './utils/citationParser';
import ConversationHistory from './ConversationHistory';
import PromptDrawer from './PromptDrawer';
import ToolCardWidget from './ToolCardWidget';
import { openUrl } from '@tauri-apps/plugin-opener';
import { check } from '@tauri-apps/plugin-updater';
import { TRANSLATIONS } from './translations';

const DEFAULT_SETTINGS: AppSettings = {
    apiKey: localStorage.getItem('shukabase_api_key') || '',
    backendUrl: 'http://localhost:5000/api/search',
    useMockData: false,
    model: 'gemini-2.0-flash-exp',
    language: localStorage.getItem('shukabase_language') === 'ru' ? 'ru' : 'en',
    provider: (localStorage.getItem('shukabase_provider') as 'google' | 'openrouter') || 'google',
    openrouterApiKey: localStorage.getItem('shukabase_openrouter_api_key') || '',
    openrouterModel: localStorage.getItem('shukabase_openrouter_model') || 'z-ai/glm-4.5-air:free',
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
        <div className="flex flex-col items-center justify-center h-screen bg-black/80 backdrop-blur-sm text-white p-8 relative overflow-hidden">
            <div className="absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full animate-pulse"
                    style={{ background: 'radial-gradient(circle, rgba(28, 110, 135, 0.2) 0%, rgba(28, 122, 135, 0) 60%)' }}></div>
                <div className="absolute bottom-[-500px] right-[-500px] w-[1200px] h-[1200px] animate-pulse"
                    style={{ background: 'radial-gradient(circle, rgba(9, 26, 180, 0.15) 0%, rgba(9, 26, 180, 0) 60%)', animationDelay: '2s' }}></div>
            </div>

            <div className="max-w-md w-full glass-panel rounded-xl p-8 shadow-2xl border border-slate-700/50 relative z-10">
                <div className="text-center mb-8">
                    <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 rounded-full flex items-center justify-center border border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                        <img src="/parrot.png" alt="Shuka" className="w-16 h-16 object-contain" />
                    </div>
                    <h1 className="text-3xl font-bold glow-text-cyan mb-2">
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
                            {/* @ts-ignore */}
                            {process.env.SHUKABASE_LANG === 'ru' ? (
                                <button
                                    onClick={() => startDownload('ru')}
                                    className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 rounded-lg font-medium text-slate-200 transition-all flex items-center justify-center gap-3 group"
                                >
                                    <Globe className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
                                    <span>Russian Language Pack</span>
                                </button>
                            ) : /* @ts-ignore */
                                process.env.SHUKABASE_LANG === 'en' ? (
                                    <button
                                        onClick={() => startDownload('en')}
                                        className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 rounded-lg font-medium text-slate-200 transition-all flex items-center justify-center gap-3 group"
                                    >
                                        <Globe className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
                                        <span>English Language Pack</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => startDownload('all')}
                                        className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 rounded-lg font-medium text-slate-200 transition-all flex items-center justify-center gap-3 group"
                                    >
                                        <Globe className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
                                        <span>Multilingual (RU + EN)</span>
                                    </button>
                                )}
                        </div>

                        <p className="text-[10px] text-center text-slate-500 mt-4">
                            Size: ~500MB. Requires internet connection.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="text-center">
                            <h3 className="text-lg font-semibold mb-2 text-slate-200">
                                {/* @ts-ignore */}
                                {process.env.SHUKABASE_LANG === 'ru' ? (
                                    status === 'extracting' ? 'Распаковка файлов...' :
                                        status === 'initializing' ? 'Инициализация движка...' :
                                            'Скачивание базы знаний...'
                                ) : (
                                    status === 'extracting' ? 'Extracting Files...' :
                                        status === 'initializing' ? 'Initializing Engine...' :
                                            'Downloading Knowledge Base...'
                                )}
                            </h3>
                            <p className="text-slate-500 text-xs">
                                {/* @ts-ignore */}
                                {process.env.SHUKABASE_LANG === 'ru' ? 'Пожалуйста, подождите. Это может занять несколько минут.' : 'Please wait, this may take a few minutes.'}
                            </p>
                        </div>

                        <div className="relative pt-1">
                            <div className="flex mb-2 items-center justify-between">
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                                        {/* @ts-ignore */}
                                        {process.env.SHUKABASE_LANG === 'ru' ? 'Прогресс' : 'Progress'}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-bold text-cyan-400">
                                        {progress}%
                                    </span>
                                </div>
                            </div>
                            <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-slate-800">
                                <div
                                    style={{ width: `${progress}%` }}
                                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-500"
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
                                    {/* @ts-ignore */}
                                    {process.env.SHUKABASE_LANG === 'ru' ? 'Попробовать снова' : 'Try Again'}
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
        localStorage.setItem('shukabase_provider', settings.provider);
        localStorage.setItem('shukabase_openrouter_api_key', settings.openrouterApiKey);
        localStorage.setItem('shukabase_openrouter_model', settings.openrouterModel);
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
    const [isPromptDrawerOpen, setIsPromptDrawerOpen] = useState(false);
    const [drawerInitialState, setDrawerInitialState] = useState<{ templateId?: string, data?: any }>({});

    // OpenRouter State
    const [openRouterModels, setOpenRouterModels] = useState<any[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [agentThought, setAgentThought] = useState('');
    const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTo({
                top: chatContainerRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [activeConversation?.messages, loading, agentSteps]);

    useEffect(() => {
        if (!loading) {
            setAgentThought('');
            return;
        }
        // Fallback simple animation if no steps yet
        // ... (can keep or remove, but user asked for REAL logs)
    }, [loading]);

    const fetchOpenRouterModels = async () => {
        setIsLoadingModels(true);
        try {
            const res = await fetch('https://openrouter.ai/api/v1/models?supported_parameters=tools');
            if (res.ok) {
                const data = await res.json();
                // Filter: Free (prompt=0) models
                const models = (data.data || [])
                    .filter((m: any) => m.pricing?.prompt === "0")
                    .sort((a: any, b: any) => (b.context_length || 0) - (a.context_length || 0));
                setOpenRouterModels(models);
            }
        } catch (e) {
            console.error("Failed to fetch models", e);
        } finally {
            setIsLoadingModels(false);
        }
    };


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

    // Check for updates
    useEffect(() => {
        const checkForUpdates = async () => {
            try {
                const update = await check();
                if (update?.available) {
                    const confirmUpdate = window.confirm(
                        settings.language === 'ru'
                            ? `Доступна новая версия ${update.version}! Хотите обновить?`
                            : `A new version ${update.version} is available! Do you want to update?`
                    );
                    if (confirmUpdate) {
                        await update.downloadAndInstall();
                        // Restart is usually automatic or manual restart needed
                        const restart = window.confirm(
                            settings.language === 'ru'
                                ? "Обновление готово. Перезапустить сейчас?"
                                : "Update ready. Restart now?"
                        );
                        if (restart) {
                            // await update.relaunch();
                            window.location.reload();
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to check for updates:", error);
            }
        };
        checkForUpdates();
    }, [settings.language]);

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

    const handleSend = async (manualContent?: string, forceNewChat: boolean = false, displayContent?: string) => {
        const contentToSend = manualContent || input;
        if (!contentToSend.trim() || loading || isSendingRef.current) return;

        // Check API key based on provider
        if (settings.provider === 'openrouter') {
            if (!settings.openrouterApiKey) {
                setIsSettingsOpen(true);
                return;
            }
        } else {
            // Default to google validation
            if (!settings.apiKey) {
                setIsSettingsOpen(true);
                return;
            }
        }

        const userMsgContent = contentToSend;
        setInput('');
        setLoading(true);
        isSendingRef.current = true;

        const visibleContent = displayContent || userMsgContent;
        const newUserMsg: Message = { role: 'user', content: visibleContent, parts: [{ text: userMsgContent }], timestamp: Date.now() };

        setAgentSteps([]); // Clear previous steps

        const shouldStartNew = forceNewChat || !activeConversation;

        const updatedConversation: Conversation = !shouldStartNew
            ? { ...activeConversation!, messages: [...activeConversation!.messages, newUserMsg], lastModified: Date.now() }
            : { id: Date.now().toString(), title: visibleContent.slice(0, 30) + '...', messages: [newUserMsg], createdAt: new Date().toISOString(), lastModified: Date.now() };

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
                (step) => {
                    setAgentSteps(prev => [...prev, step]);
                },
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
            const errorMessage = settings.language === 'ru'
                ? "Прошу прощения, произошла ошибка. Пожалуйста, проверьте ваш API ключ и настройки, или попробуйте позже."
                : "Sorry, I encountered an error. Please check your API key and settings, or try again later.";

            const errorMsg: Message = {
                role: 'model',
                content: errorMessage,
                parts: [{ text: errorMessage }],
                timestamp: Date.now()
            };
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

            // Check if we got the SPA index.html instead of a book file
            if (htmlContent.includes('<div id="root">') || htmlContent.includes('<title>SHUKABASE</title>')) {
                throw new Error("File not found");
            }

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
            setFullTextContent("Could not load full chapter text. Please try checking the source manually.");
            setFullTextTitle("Error Loading Text");
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
            <div className="flex flex-col items-center justify-center h-screen bg-transparent text-white p-4 text-center">
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
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mb-4"></div>
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
        <div className="flex h-screen w-screen overflow-hidden relative">
            {/* Video Background */}
            <div className="absolute inset-0 -z-20">
                <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                >
                    <source src="/background.mp4" type="video/mp4" />
                </video>
                {/* Overlay for tint/glassmorphism base */}
                <div className="absolute inset-0 bg-[#050B14]/40 backdrop-blur-sm" />
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
                        <div className="w-15 h-15 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shadow-lg">
                            <img src="/logo192.png" alt="Logo" className="w-14 h-14 object-contain" />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg tracking-tight text-slate-100 glow-text-cyan">{t('appTitle')}</h1>
                            <p className="text-xs text-slate-500">{t('appSubtitle')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggleLanguage}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors border border-slate-700 hover:border-cyan-500/30"
                        >
                            <Globe size={14} className="text-cyan-400" />
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

                {/* Side Trigger for Prompt Drawer */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 z-30">
                    <button
                        onClick={() => setIsPromptDrawerOpen(true)}
                        className="group flex flex-col items-center justify-center gap-2 w-8 h-32 bg-slate-950/80 backdrop-blur-md border-r border-y border-cyan-500/30 rounded-r-2xl transform transition-all duration-300 hover:w-10 hover:border-cyan-400 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] active:scale-95"
                        title={t('openAiTools')}
                    >
                        <div className="h-full w-0.5 bg-gradient-to-b from-transparent via-cyan-500/50 to-transparent group-hover:via-cyan-400 rounded-full" />
                        <div className="absolute p-2 rounded-full bg-cyan-950/50 border border-cyan-500/50 group-hover:bg-cyan-500/20 transition-all">
                            <ArrowRight size={16} className="text-cyan-400 group-hover:text-cyan-200" />
                        </div>
                    </button>
                </div>



                <div
                    ref={chatContainerRef}
                    className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scroll-smooth"
                >
                    {(activeConversation?.messages || []).map((msg, index) => {
                        const isUser = msg.role === 'user';
                        return (
                            <div
                                key={`${activeConversation?.id}-${index}`}
                                className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`
                                        relative max-w-[85%] md:max-w-[75%] p-6 rounded-3xl backdrop-blur-md shadow-lg border
                                        ${isUser
                                            ? 'bg-black/40 border-slate-700/50 text-slate-100 rounded-tr-sm'
                                            : 'bg-slate-900/30 border-cyan-500/20 text-slate-100 rounded-tl-sm shadow-[0_4px_20px_rgba(0,0,0,0.2)]'
                                        }
                                    `}
                                >
                                    <ParsedContent content={msg.content} onCitationClick={handleCitationClick} t={t} />

                                    {/* Generative UI Tool Widget */}
                                    {msg.toolCall && (
                                        <ToolCardWidget
                                            toolId={msg.toolCall.id}
                                            initialData={msg.toolCall.args}
                                            onOpenTool={(template, data) => {
                                                setDrawerInitialState({ templateId: template.id, data });
                                                setIsPromptDrawerOpen(true);
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
                            <div className="relative w-24 h-24 mb-6">
                                <div className="absolute inset-0 bg-cyan-400/20 rounded-full animate-ping"></div>
                                <img
                                    src="/parrot.png"
                                    alt="Shukabase Logo"
                                    className="w-24 h-24 relative z-10 object-contain drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                                />
                            </div>
                            <div className="flex items-center gap-3 text-cyan-400 font-medium">
                                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                <span className="ml-2 tracking-widest uppercase text-xs opacity-80">{t('agentThinking')}</span>
                            </div>

                            {/* Detailed Agent Steps Visualization */}
                            {agentSteps.length > 0 && (
                                <div className="mt-6 w-full max-w-lg bg-slate-900/40 rounded-xl border border-slate-800 p-4 backdrop-blur-sm animate-fade-in relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent animate-shimmer"></div>
                                    <h4 className="text-[10px] uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2 font-bold">
                                        <Server size={12} />
                                        {t('agentWorking')}
                                    </h4>
                                    <div className="space-y-3 font-mono text-xs max-h-40 overflow-y-auto custom-scrollbar pr-2 flex flex-col-reverse">
                                        {agentSteps.slice().reverse().map((step, idx) => (
                                            <div key={idx} className={`flex gap-3 animate-slide-in ${idx === 0 ? 'opacity-100' : 'opacity-60'}`}>
                                                <div className="shrink-0 mt-0.5">
                                                    {step.type === 'thought' && <div className="w-2 h-2 rounded-full bg-purple-500/50 mt-1"></div>}
                                                    {step.type === 'action' && <div className="w-2 h-2 rounded-full bg-cyan-500/50 mt-1"></div>}
                                                    {step.type === 'observation' && <div className="w-2 h-2 rounded-full bg-green-500/50 mt-1"></div>}
                                                </div>
                                                <div className="flex-1">
                                                    <span className={`uppercase text-[9px] font-bold tracking-wider mb-0.5 block ${step.type === 'thought' ? 'text-purple-400' :
                                                        step.type === 'action' ? 'text-cyan-400' : 'text-green-400'
                                                        }`}>
                                                        {step.type}
                                                    </span>
                                                    <p className="text-slate-300 leading-relaxed">
                                                        {step.content}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {!activeConversation && !loading && (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-0 animate-fade-in" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
                            <div className="w-32 h-32 mb-8 relative group">
                                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 rounded-full blur-xl group-hover:blur-2xl transition-all duration-700"></div>
                                <img
                                    src="/parrot.png"
                                    alt="Shukabase Logo"
                                    className="w-full h-full relative z-10 object-contain drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                                />
                            </div>
                            <h2 className="text-3xl font-bold mb-3 glow-text-cyan tracking-tight">{t('welcomeTitle')}</h2>
                            <p className="text-lg text-slate-400">{t('welcomeText')}</p>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-4 border-t border-slate-800/50 bg-black/40 backdrop-blur-md z-20">
                    <div className="max-w-4xl mx-auto relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-teal-500 rounded-xl opacity-20 group-hover:opacity-40 transition duration-500 blur"></div>
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !loading && handleSend()}
                            placeholder={t('inputPlaceholder')}
                            className="relative w-full bg-slate-950/60 border border-slate-800 text-slate-100 placeholder-slate-500 rounded-xl pl-4 pr-12 py-3.5 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all shadow-lg"
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
                                onClick={() => handleSend()}
                                disabled={!input.trim()}
                                className="absolute right-2 top-2 p-1.5 bg-gradient-to-r from-cyan-600 to-teal-600 text-white rounded-lg hover:from-cyan-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-900/20"
                            >
                                <Send size={18} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div
                className={`fixed inset-y-0 right-0 z-40 w-full sm:w-96 glass-panel border-l border-slate-800/50 shadow-2xl transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:w-96 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'} bg-black/40 backdrop-blur-md`}
            >
                <div className="h-full flex flex-col">
                    <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800/50 bg-black/20">
                        <div className="flex gap-4 w-full">
                            <button
                                onClick={() => setSidebarMode('context')}
                                className={`relative flex-1 py-4 text-sm font-medium transition-colors ${sidebarMode === 'context' ? 'text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                {t('context')}
                                {sidebarMode === 'context' && (
                                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"></span>
                                )}
                            </button>
                            <button
                                onClick={() => setSidebarMode('search')}
                                className={`relative flex-1 py-4 text-sm font-medium transition-colors ${sidebarMode === 'search' ? 'text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                {t('manualSearch')}
                                {sidebarMode === 'search' && (
                                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"></span>
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
                                            ? 'bg-cyan-900/20 border-cyan-500 shadow-[0_0_20px_rgba(34,211,238,0.2)]'
                                            : 'bg-slate-900/40 border-slate-800 hover:border-blue-500/50 hover:shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                                            }`}
                                        onClick={() => setHighlightedSourceId(chunk.id)}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span
                                                className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/30 px-2 py-0.5 rounded border border-cyan-500/20 truncate max-w-[240px]"
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
                                            className="mt-3 w-full text-xs py-2 px-3 bg-slate-800/80 hover:bg-slate-700 text-cyan-300 rounded-lg transition-colors border border-slate-700 hover:border-cyan-500/50 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100"
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
                                        className="w-full bg-slate-900/40 border border-slate-700/50 rounded-lg pl-4 pr-10 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-cyan-500/50 focus:outline-none placeholder-slate-500 backdrop-blur-sm"
                                    />
                                    <button
                                        onClick={handleManualSearch}
                                        disabled={manualSearchLoading}
                                        className="absolute right-2 top-1.5 text-slate-400 hover:text-cyan-300 transition-colors"
                                    >
                                        {manualSearchLoading ? <div className="animate-spin h-4 w-4 border-2 border-cyan-500 border-t-transparent rounded-full"></div> : <Search size={16} />}
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
                                            className="p-4 rounded-xl border bg-slate-900/30 border-slate-800/50 hover:bg-slate-800/40 hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(34,211,238,0.1)] transition-all cursor-pointer group backdrop-blur-md"
                                            onClick={() => handleReadFull(chunk)}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/30 px-2 py-0.5 rounded border border-cyan-500/20 truncate max-w-[240px]">
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

            {
                fullTextModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setFullTextModalOpen(false)}>
                        <div className="glass-panel rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col border border-slate-700/50" onClick={(e) => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-700/30 flex justify-between items-center bg-black/20">
                                <h3 className="font-bold text-lg text-slate-100 glow-text-cyan">{fullTextTitle}</h3>
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
                                            <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                            <p>Loading ancient wisdom...</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {
                isSettingsOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setIsSettingsOpen(false)}>
                        <div className="glass-panel border border-slate-700/50 rounded-2xl w-full max-w-md shadow-2xl bg-black/60 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                                <h3 className="font-bold text-lg text-slate-100 glow-text-cyan">{t('settings')}</h3>
                                <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-6 space-y-6">
                                <div className="space-y-4 border-b border-slate-700/50 pb-6 mb-6">
                                    <label className="text-sm font-medium text-slate-300">{t('aiProvider')}</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => setSettings({ ...settings, provider: 'google' })}
                                            className={`py-2 px-4 rounded-lg text-sm font-medium transition-all ${settings.provider === 'google'
                                                ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-800'
                                                }`}
                                        >
                                            Google Gemini
                                        </button>
                                        <button
                                            onClick={() => setSettings({ ...settings, provider: 'openrouter' })}
                                            className={`py-2 px-4 rounded-lg text-sm font-medium transition-all ${settings.provider === 'openrouter'
                                                ? 'bg-purple-600/20 text-purple-400 border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-800'
                                                }`}
                                        >
                                            OpenRouter
                                        </button>
                                    </div>
                                </div>

                                {settings.provider === 'google' ? (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">{t('geminiApiKey')}</label>
                                            <input
                                                type="password"
                                                value={settings.apiKey}
                                                onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                                                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">Model</label>
                                            <input
                                                type="text"
                                                list="model-options"
                                                value={settings.model}
                                                onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                                                placeholder="Select or type model ID..."
                                                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                                            />
                                            <datalist id="model-options">
                                                <option value="gemini-2.5-flash-preview-09-2025" />
                                                <option value="gemini-2.5-flash-lite" />
                                                <option value="gemini-2.5-flash" />
                                                <option value="gemini-2.0-flash" />
                                            </datalist>
                                            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                                                {settings.language === 'ru' ? (
                                                    <>
                                                        См. <button onClick={() => openUrl('https://ai.google.dev/gemini-api/docs/changelog?hl=ru').catch(() => window.open('https://ai.google.dev/gemini-api/docs/changelog?hl=ru', '_blank'))} className="text-cyan-400 hover:underline cursor-pointer">историю изменений</button>, чтобы узнать о новых и закрытых моделях. На Preview и Experimental версии часто действуют щедрые бесплатные лимиты.
                                                    </>
                                                ) : (
                                                    <>
                                                        Check the <button onClick={() => openUrl('https://ai.google.dev/gemini-api/docs/changelog').catch(() => window.open('https://ai.google.dev/gemini-api/docs/changelog', '_blank'))} className="text-cyan-400 hover:underline cursor-pointer">changelog</button> for new/deprecated models. Preview & Experimental versions often have generous free tier limits.
                                                    </>
                                                )}
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-4 animate-fade-in">
                                        <div className="bg-purple-900/10 border border-purple-500/20 p-3 rounded-lg text-xs text-purple-200">
                                            {t('openRouterDescription')} <button onClick={() => openUrl('https://openrouter.ai/models').catch(() => window.open('https://openrouter.ai/models', '_blank'))} className="text-purple-400 hover:underline">{t('checkAvailableModels')}</button>.
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">{t('openRouterApiKey')}</label>
                                            <input
                                                type="password"
                                                value={settings.openrouterApiKey}
                                                onChange={(e) => setSettings({ ...settings, openrouterApiKey: e.target.value })}
                                                placeholder="sk-or-v1-..."
                                                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                                                onBlur={() => {
                                                    if (settings.openrouterApiKey && openRouterModels.length === 0) fetchOpenRouterModels();
                                                }}
                                            />
                                            <p className="text-[10px] text-slate-500">{t('keySavedLocally')}</p>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <label className="text-sm font-medium text-slate-300">{t('model')}</label>
                                                <button
                                                    onClick={fetchOpenRouterModels}
                                                    disabled={isLoadingModels}
                                                    className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 disabled:opacity-50"
                                                >
                                                    {isLoadingModels ? <span className="animate-spin">↻</span> : <Sparkles size={12} />}
                                                    {t('refreshList')}
                                                </button>
                                            </div>

                                            {openRouterModels.length > 0 ? (
                                                <select
                                                    value={settings.openrouterModel}
                                                    onChange={(e) => setSettings({ ...settings, openrouterModel: e.target.value })}
                                                    className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-purple-500 focus:outline-none appearance-none"
                                                >
                                                    {openRouterModels.map((m: any) => (
                                                        <option key={m.id} value={m.id}>
                                                            {m.name || m.id} ({Math.round((m.context_length || 0) / 1024)}k ctx)
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={settings.openrouterModel}
                                                    onChange={(e) => setSettings({ ...settings, openrouterModel: e.target.value })}
                                                    placeholder="google/gemini-2.0-flash-exp:free"
                                                    className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                                                />
                                            )}
                                            <p className="text-[10px] text-slate-500">
                                                {t('openRouterFooter')}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="pt-6 border-t border-slate-700/50 text-center space-y-3">
                                    <p className="text-sm text-cyan-200/80 font-medium leading-relaxed">
                                        {t('settingsFooterText')}
                                    </p>
                                    <div className="flex flex-col items-center gap-2 text-xs text-slate-400">
                                        <p>{t('createdWithLove')}</p>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await openUrl('https://boosty.to/amritagopi');
                                                } catch (e) {
                                                    console.error('Failed to open link with Tauri, trying window.open:', e);
                                                    window.open('https://boosty.to/amritagopi', '_blank');
                                                }
                                            }}
                                            className="relative group transition-transform hover:scale-110 active:scale-95 p-2 mt-1"
                                            title="Support on Boosty"
                                        >
                                            <div className="absolute inset-0 bg-rose-500/20 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                                            <Heart
                                                className="w-8 h-8 text-rose-400 fill-rose-500/10 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)] group-hover:drop-shadow-[0_0_20px_rgba(251,113,133,0.8)] group-hover:fill-rose-500/30 transition-all duration-300"
                                                strokeWidth={1.5}
                                            />
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-4 flex justify-end">
                                    <button
                                        onClick={() => setIsSettingsOpen(false)}
                                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-400 text-white rounded-lg transition-colors shadow-lg shadow-cyan-900/20"
                                    >
                                        {t('save')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div >
                )
            }

            <PromptDrawer
                isOpen={isPromptDrawerOpen}
                onClose={() => {
                    setIsPromptDrawerOpen(false);
                    setDrawerInitialState({}); // Cleanup on close
                }}
                initialTemplateId={drawerInitialState.templateId}
                initialData={drawerInitialState.data}
                onSelectDevice={(prompt, displayContent) => {
                    setIsPromptDrawerOpen(false); // Close immediately
                    handleSend(prompt, true, displayContent); // Force new chat with display override
                }}
                t={t}
                language={settings.language as 'en' | 'ru'}
            />
        </div >
    );
};

export default App;