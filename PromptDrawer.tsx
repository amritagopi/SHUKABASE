import React, { useState, useEffect } from 'react';
import { X, ChevronDown, Sparkles, ArrowRight, ChevronLeft, Send } from 'lucide-react';
import { PROMPT_TEMPLATES, PromptTemplate } from './promptTemplates';

interface PromptDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectDevice: (prompt: string, templateTitle: string) => void;
    initialTemplateId?: string | null;
    initialData?: Record<string, any> | null;
    t: (key: string) => string;
    language: 'en' | 'ru';
}

const PromptDrawer: React.FC<PromptDrawerProps> = ({ isOpen, onClose, onSelectDevice, initialTemplateId, initialData, t, language }) => {
    const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [isAnimating, setIsAnimating] = useState(false);

    // Helper to get localized text
    const txt = (obj: { en: any; ru: any } | string | undefined) => {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        return obj[language] || obj['en'];
    };

    // Flatten all templates for the grid view since we removed categories UI
    const allTemplates = Object.values(PROMPT_TEMPLATES).flat();

    useEffect(() => {
        if (isOpen) {
            setIsAnimating(true);
            if (initialTemplateId) {
                const found = allTemplates.find(t => t.id === initialTemplateId);
                if (found) {
                    setSelectedTemplate(found);
                    if (initialData) setInputValues(initialData);
                }
            }
        } else {
            const timer = setTimeout(() => {
                setIsAnimating(false);
                if (!initialTemplateId) {
                    setSelectedTemplate(null);
                    setInputValues({});
                }
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen, initialTemplateId, initialData]);

    if (!isOpen && !isAnimating) return null;

    const handleGenerate = () => {
        if (!selectedTemplate) return;
        let finalPrompt = selectedTemplate.systemPrompt;

        // Simple mustache replacement
        Object.entries(inputValues).forEach(([key, value]) => {
            finalPrompt = finalPrompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
        });

        // Inject Language Instruction based on UI setting
        const langInstruction = language === 'ru'
            ? "\n\n[IMPORTANT SYSTEM INSTRUCTION: The user's interface language is RUSSIAN. Please output your response entirely in RUSSIAN.]"
            : "\n\n[IMPORTANT SYSTEM INSTRUCTION: The user's interface language is ENGLISH. Please output your response entirely in ENGLISH.]";

        finalPrompt += langInstruction;

        // Create Display Content (User Friendly Summary)
        const displayLines = Object.entries(inputValues).map(([key, value]) => {
            const field = selectedTemplate.inputs.find(f => f.key === key);
            const label = field ? txt(field.label) : key;
            return `**${label}**: ${value}`;
        });
        const displayContent = `**${txt(selectedTemplate.title)}**\n\n${displayLines.join('\n')}`;

        onSelectDevice(finalPrompt, displayContent);
    };

    // --- COLOR SYSTEM HELPER ---
    const getTemplateStyles = (colorClass: string) => {
        // Extract base color name from 'text-blue-400', etc.
        const match = colorClass.match(/text-([a-z]+)-\d+/);
        const color = match ? match[1] : 'cyan';

        const COLOR_STYLES: Record<string, any> = {
            blue: {
                border: 'border-blue-500/30',
                hoverBorder: 'hover:border-blue-400',
                hoverShadow: 'hover:shadow-[0_0_25px_rgba(59,130,246,0.3)]',
                iconBg: 'bg-blue-950/30',
                iconBorder: 'border-blue-500/20',
                iconColor: 'text-blue-400',
                glowText: 'glow-text-blue',
                btnGradient: 'from-blue-600 to-indigo-600',
                btnShadow: 'shadow-blue-900/20',
                btnHoverShadow: 'hover:shadow-blue-500/20',
                btnBorder: 'border-blue-400/20',
                inputFocus: 'focus:border-blue-500 focus:ring-blue-500/50',
                backBtn: 'text-blue-500 hover:text-blue-300',
                backBtnBorder: 'border-blue-500/30 group-hover:bg-blue-500/20'
            },
            amber: {
                border: 'border-amber-500/30',
                hoverBorder: 'hover:border-amber-400',
                hoverShadow: 'hover:shadow-[0_0_25px_rgba(245,158,11,0.3)]',
                iconBg: 'bg-amber-950/30',
                iconBorder: 'border-amber-500/20',
                iconColor: 'text-amber-400',
                glowText: 'glow-text-amber',
                btnGradient: 'from-amber-600 to-orange-600',
                btnShadow: 'shadow-amber-900/20',
                btnHoverShadow: 'hover:shadow-amber-500/20',
                btnBorder: 'border-amber-400/20',
                inputFocus: 'focus:border-amber-500 focus:ring-amber-500/50',
                backBtn: 'text-amber-500 hover:text-amber-300',
                backBtnBorder: 'border-amber-500/30 group-hover:bg-amber-500/20'
            },
            emerald: {
                border: 'border-emerald-500/30',
                hoverBorder: 'hover:border-emerald-400',
                hoverShadow: 'hover:shadow-[0_0_25px_rgba(16,185,129,0.3)]',
                iconBg: 'bg-emerald-950/30',
                iconBorder: 'border-emerald-500/20',
                iconColor: 'text-emerald-400',
                glowText: 'glow-text-emerald',
                btnGradient: 'from-emerald-600 to-teal-600',
                btnShadow: 'shadow-emerald-900/20',
                btnHoverShadow: 'hover:shadow-emerald-500/20',
                btnBorder: 'border-emerald-400/20',
                inputFocus: 'focus:border-emerald-500 focus:ring-emerald-500/50',
                backBtn: 'text-emerald-500 hover:text-emerald-300',
                backBtnBorder: 'border-emerald-500/30 group-hover:bg-emerald-500/20'
            },
            violet: {
                border: 'border-violet-500/30',
                hoverBorder: 'hover:border-violet-400',
                hoverShadow: 'hover:shadow-[0_0_25px_rgba(139,92,246,0.3)]',
                iconBg: 'bg-violet-950/30',
                iconBorder: 'border-violet-500/20',
                iconColor: 'text-violet-400',
                glowText: 'glow-text-violet',
                btnGradient: 'from-violet-600 to-purple-600',
                btnShadow: 'shadow-violet-900/20',
                btnHoverShadow: 'hover:shadow-violet-500/20',
                btnBorder: 'border-violet-400/20',
                inputFocus: 'focus:border-violet-500 focus:ring-violet-500/50',
                backBtn: 'text-violet-500 hover:text-violet-300',
                backBtnBorder: 'border-violet-500/30 group-hover:bg-violet-500/20'
            },
            orange: {
                border: 'border-orange-500/30',
                hoverBorder: 'hover:border-orange-400',
                hoverShadow: 'hover:shadow-[0_0_25px_rgba(249,115,22,0.3)]',
                iconBg: 'bg-orange-950/30',
                iconBorder: 'border-orange-500/20',
                iconColor: 'text-orange-400',
                glowText: 'glow-text-orange',
                btnGradient: 'from-orange-600 to-red-600',
                btnShadow: 'shadow-orange-900/20',
                btnHoverShadow: 'hover:shadow-orange-500/20',
                btnBorder: 'border-orange-400/20',
                inputFocus: 'focus:border-orange-500 focus:ring-orange-500/50',
                backBtn: 'text-orange-500 hover:text-orange-300',
                backBtnBorder: 'border-orange-500/30 group-hover:bg-orange-500/20'
            },
            red: {
                border: 'border-red-500/30',
                hoverBorder: 'hover:border-red-400',
                hoverShadow: 'hover:shadow-[0_0_25px_rgba(239,68,68,0.3)]',
                iconBg: 'bg-red-950/30',
                iconBorder: 'border-red-500/20',
                iconColor: 'text-red-400',
                glowText: 'glow-text-red',
                btnGradient: 'from-red-600 to-rose-600',
                btnShadow: 'shadow-red-900/20',
                btnHoverShadow: 'hover:shadow-red-500/20',
                btnBorder: 'border-red-400/20',
                inputFocus: 'focus:border-red-500 focus:ring-red-500/50',
                backBtn: 'text-red-500 hover:text-red-300',
                backBtnBorder: 'border-red-500/30 group-hover:bg-red-500/20'
            },
            pink: {
                border: 'border-pink-500/30',
                hoverBorder: 'hover:border-pink-400',
                hoverShadow: 'hover:shadow-[0_0_25px_rgba(236,72,153,0.3)]',
                iconBg: 'bg-pink-950/30',
                iconBorder: 'border-pink-500/20',
                iconColor: 'text-pink-400',
                glowText: 'glow-text-pink',
                btnGradient: 'from-pink-600 to-rose-600',
                btnShadow: 'shadow-pink-900/20',
                btnHoverShadow: 'hover:shadow-pink-500/20',
                btnBorder: 'border-pink-400/20',
                inputFocus: 'focus:border-pink-500 focus:ring-pink-500/50',
                backBtn: 'text-pink-500 hover:text-pink-300',
                backBtnBorder: 'border-pink-500/30 group-hover:bg-pink-500/20'
            },
            yellow: {
                border: 'border-yellow-500/30',
                hoverBorder: 'hover:border-yellow-400',
                hoverShadow: 'hover:shadow-[0_0_25px_rgba(234,179,8,0.3)]',
                iconBg: 'bg-yellow-950/30',
                iconBorder: 'border-yellow-500/20',
                iconColor: 'text-yellow-400',
                glowText: 'glow-text-yellow',
                btnGradient: 'from-yellow-600 to-amber-600',
                btnShadow: 'shadow-yellow-900/20',
                btnHoverShadow: 'hover:shadow-yellow-500/20',
                btnBorder: 'border-yellow-400/20',
                inputFocus: 'focus:border-yellow-500 focus:ring-yellow-500/50',
                backBtn: 'text-yellow-500 hover:text-yellow-300',
                backBtnBorder: 'border-yellow-500/30 group-hover:bg-yellow-500/20'
            },
            purple: {
                border: 'border-purple-500/30',
                hoverBorder: 'hover:border-purple-400',
                hoverShadow: 'hover:shadow-[0_0_25px_rgba(168,85,247,0.3)]',
                iconBg: 'bg-purple-950/30',
                iconBorder: 'border-purple-500/20',
                iconColor: 'text-purple-400',
                glowText: 'glow-text-purple',
                btnGradient: 'from-purple-600 to-violet-600',
                btnShadow: 'shadow-purple-900/20',
                btnHoverShadow: 'hover:shadow-purple-500/20',
                btnBorder: 'border-purple-400/20',
                inputFocus: 'focus:border-purple-500 focus:ring-purple-500/50',
                backBtn: 'text-purple-500 hover:text-purple-300',
                backBtnBorder: 'border-purple-500/30 group-hover:bg-purple-500/20'
            },
            rose: {
                border: 'border-rose-500/30',
                hoverBorder: 'hover:border-rose-400',
                hoverShadow: 'hover:shadow-[0_0_25px_rgba(244,63,94,0.3)]',
                iconBg: 'bg-rose-950/30',
                iconBorder: 'border-rose-500/20',
                iconColor: 'text-rose-400',
                glowText: 'glow-text-rose',
                btnGradient: 'from-rose-600 to-pink-600',
                btnShadow: 'shadow-rose-900/20',
                btnHoverShadow: 'hover:shadow-rose-500/20',
                btnBorder: 'border-rose-400/20',
                inputFocus: 'focus:border-rose-500 focus:ring-rose-500/50',
                backBtn: 'text-rose-500 hover:text-rose-300',
                backBtnBorder: 'border-rose-500/30 group-hover:bg-rose-500/20'
            },
            teal: {
                border: 'border-teal-500/30',
                hoverBorder: 'hover:border-teal-400',
                hoverShadow: 'hover:shadow-[0_0_25px_rgba(20,184,166,0.3)]',
                iconBg: 'bg-teal-950/30',
                iconBorder: 'border-teal-500/20',
                iconColor: 'text-teal-400',
                glowText: 'glow-text-teal',
                btnGradient: 'from-teal-600 to-emerald-600',
                btnShadow: 'shadow-teal-900/20',
                btnHoverShadow: 'hover:shadow-teal-500/20',
                btnBorder: 'border-teal-400/20',
                inputFocus: 'focus:border-teal-500 focus:ring-teal-500/50',
                backBtn: 'text-teal-500 hover:text-teal-300',
                backBtnBorder: 'border-teal-500/30 group-hover:bg-teal-500/20'
            },
            indigo: {
                border: 'border-indigo-500/30',
                hoverBorder: 'hover:border-indigo-400',
                hoverShadow: 'hover:shadow-[0_0_25px_rgba(99,102,241,0.3)]',
                iconBg: 'bg-indigo-950/30',
                iconBorder: 'border-indigo-500/20',
                iconColor: 'text-indigo-400',
                glowText: 'glow-text-indigo',
                btnGradient: 'from-indigo-600 to-blue-600',
                btnShadow: 'shadow-indigo-900/20',
                btnHoverShadow: 'hover:shadow-indigo-500/20',
                btnBorder: 'border-indigo-400/20',
                inputFocus: 'focus:border-indigo-500 focus:ring-indigo-500/50',
                backBtn: 'text-indigo-500 hover:text-indigo-300',
                backBtnBorder: 'border-indigo-500/30 group-hover:bg-indigo-500/20'
            },
            slate: {
                border: 'border-slate-500/30',
                hoverBorder: 'hover:border-slate-400',
                hoverShadow: 'hover:shadow-[0_0_25px_rgba(100,116,139,0.3)]',
                iconBg: 'bg-slate-950/30',
                iconBorder: 'border-slate-500/20',
                iconColor: 'text-slate-400',
                glowText: 'glow-text-slate',
                btnGradient: 'from-slate-600 to-gray-600',
                btnShadow: 'shadow-slate-900/20',
                btnHoverShadow: 'hover:shadow-slate-500/20',
                btnBorder: 'border-slate-400/20',
                inputFocus: 'focus:border-slate-500 focus:ring-slate-500/50',
                backBtn: 'text-slate-500 hover:text-slate-300',
                backBtnBorder: 'border-slate-500/30 group-hover:bg-slate-500/20'
            },
            cyan: {
                border: 'border-cyan-500/30',
                hoverBorder: 'hover:border-cyan-400',
                hoverShadow: 'hover:shadow-[0_0_25px_rgba(34,211,238,0.3)]',
                iconBg: 'bg-cyan-950/30',
                iconBorder: 'border-cyan-500/20',
                iconColor: 'text-cyan-400',
                glowText: 'glow-text-cyan',
                btnGradient: 'from-cyan-600 to-teal-600',
                btnShadow: 'shadow-cyan-900/20',
                btnHoverShadow: 'hover:shadow-cyan-500/20',
                btnBorder: 'border-cyan-400/20',
                inputFocus: 'focus:border-cyan-500 focus:ring-cyan-500/50',
                backBtn: 'text-cyan-500 hover:text-cyan-300',
                backBtnBorder: 'border-cyan-500/30 group-hover:bg-cyan-500/20'
            }
        };

        return COLOR_STYLES[color] || COLOR_STYLES['cyan'];
    };

    // Calculate selected styles if a template is selected
    const selectedStyles = selectedTemplate ? getTemplateStyles(selectedTemplate.color) : null;

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />

            {/* Sliding Panel (Left to Right) */}
            <div
                className={`fixed top-0 left-0 h-full w-full max-w-5xl z-50 transform transition-transform duration-500 cubic-bezier(0.25, 1, 0.5, 1) ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                {/* Main Container */}
                <div className="h-full w-full bg-[#050B14]/30 backdrop-blur-2xl border-r border-cyan-500/30 shadow-[0_0_50px_rgba(34,211,238,0.15)] flex overflow-hidden relative">

                    {/* Content Area */}
                    <div className="relative z-10 w-full h-full flex flex-col p-8 md:p-12">

                        {/* Close Button top-right (absolute) */}
                        <button
                            onClick={onClose}
                            className="absolute top-6 right-6 p-2 rounded-full text-slate-500 hover:text-white hover:bg-white/10 transition-colors z-50"
                        >
                            <X size={24} />
                        </button>

                        {!selectedTemplate ? (
                            // --- GRID VIEW ---
                            <div className="flex-1 flex flex-col animate-fade-in">
                                <div className="mb-8 text-center pt-8">
                                    <h2 className="text-3xl font-bold text-white tracking-wider glow-text-cyan uppercase">
                                        {t('commandDeck')}
                                    </h2>
                                    <p className="text-cyan-400/60 font-mono text-sm tracking-widest mt-2 uppercase">{t('selectProtocol')}</p>
                                </div>

                                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto pb-24">
                                        {allTemplates.map((template) => {
                                            const styles = getTemplateStyles(template.color);
                                            return (
                                                <button
                                                    key={template.id}
                                                    onClick={() => setSelectedTemplate(template)}
                                                    className={`group relative h-20 flex items-center px-6
                                                    bg-[#0B1221]/80 backdrop-blur-md
                                                    border rounded-lg
                                                    hover:bg-[#11192E]
                                                    transition-all duration-300
                                                    ${styles.border} ${styles.hoverBorder} ${styles.hoverShadow}
                                                `}
                                                >
                                                    {/* Left Icon/Image Thumbnail */}
                                                    <div className={`w-12 h-12 flex items-center justify-center mr-6 rounded ${styles.iconBg} ${styles.iconBorder} border group-hover:scale-110 transition-transform`}>
                                                        {template.icon && <template.icon size={24} className={styles.iconColor} />}
                                                    </div>

                                                    {/* Text Info */}
                                                    <div className="text-left flex-1">
                                                        <h3 className={`text-lg font-semibold text-slate-100 mb-0.5 transition-colors group-hover:${styles.iconColor.replace('text-', 'text-').replace('400', '300')}`}>
                                                            <span className="group-hover:text-white transition-colors">{txt(template.title)}</span>
                                                        </h3>
                                                        <p className="text-xs text-slate-500 group-hover:text-slate-400 line-clamp-1">
                                                            {txt(template.description)}
                                                        </p>
                                                    </div>

                                                    {/* Hover Arrow */}
                                                    <ArrowRight className={`w-5 h-5 opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all duration-300 ${styles.iconColor}`} />
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // --- DETAIL VIEW (Split Layout) ---
                            <div className="flex-1 flex flex-col md:flex-row gap-8 items-stretch animate-slide-in-right h-full">

                                {/* Left Column: Hero Image */}
                                <div className="hidden md:flex flex-1 relative items-center justify-start -ml-12">
                                    <div className="relative w-full h-full flex items-center justify-start">
                                        {selectedTemplate.image ? (
                                            <img
                                                src={selectedTemplate.image}
                                                alt={txt(selectedTemplate.title)}
                                                className="relative z-10 h-[90%] w-auto object-contain object-left drop-shadow-2xl opacity-90 hover:opacity-100 transition-opacity duration-500"
                                            />
                                        ) : (
                                            <div className="relative z-10 w-full h-full flex items-center justify-center">
                                                <div className={`w-64 h-64 rounded-full bg-slate-900 border-2 flex items-center justify-center ${selectedStyles?.border}`}>
                                                    <selectedTemplate.icon size={80} className={`${selectedStyles?.iconColor} drop-shadow-lg`} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Column: Controls */}
                                <div className="flex-1 flex flex-col max-w-xl mx-auto md:mx-0 w-full overflow-y-auto custom-scrollbar px-2 py-4">

                                    {/* Header & Back */}
                                    <div className="mb-8">
                                        <button
                                            onClick={() => setSelectedTemplate(null)}
                                            className={`flex items-center gap-2 transition-colors mb-6 group text-sm font-bold uppercase tracking-wide ${selectedStyles?.backBtn}`}
                                        >
                                            <div className={`p-1.5 rounded-full border transition-colors ${selectedStyles?.backBtnBorder}`}>
                                                <ChevronLeft size={16} />
                                            </div>
                                            {t('backToList')}
                                        </button>

                                        <h2 className={`text-3xl md:text-4xl font-bold text-white mb-2 ${selectedStyles?.glowText}`}>
                                            {txt(selectedTemplate.title)}
                                        </h2>
                                        <p className={`text-lg text-slate-400 leading-relaxed border-l-2 pl-4 py-1 ${selectedStyles?.border ? selectedStyles.border.replace('/30', '/50') : ''}`}>
                                            {txt(selectedTemplate.description)}
                                        </p>
                                    </div>

                                    {/* Inputs */}
                                    <div className="space-y-6 bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-white/5 shadow-inner">
                                        {selectedTemplate.inputs.map(input => (
                                            <div key={input.key} className="space-y-2">
                                                <label className={`text-sm font-medium ml-1 ${selectedStyles?.iconColor?.replace('400', '100')}/80`}>
                                                    {txt(input.label)}
                                                </label>
                                                {input.type === 'textarea' ? (
                                                    <textarea
                                                        value={inputValues[input.key] || ''}
                                                        onChange={(e) => setInputValues(prev => ({ ...prev, [input.key]: e.target.value }))}
                                                        placeholder={txt(input.placeholder)}
                                                        rows={4}
                                                        className={`w-full bg-[#0B1221] border border-cyan-900/50 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:ring-1 transition-all outline-none resize-none shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] ${selectedStyles?.inputFocus}`}
                                                    />
                                                ) : input.type === 'select' ? (
                                                    <div className="relative">
                                                        <select
                                                            value={inputValues[input.key] || ''}
                                                            onChange={(e) => setInputValues(prev => ({ ...prev, [input.key]: e.target.value }))}
                                                            className={`w-full bg-[#0B1221] border border-cyan-900/50 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:ring-1 transition-all outline-none appearance-none shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] ${selectedStyles?.inputFocus}`}
                                                        >
                                                            <option value="" disabled selected>{txt(input.placeholder)}</option>
                                                            {(input.options ? txt(input.options) as string[] : []).map(opt => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown className={`absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${selectedStyles?.iconColor}`} />
                                                    </div>
                                                ) : (
                                                    <input
                                                        type={input.type}
                                                        value={inputValues[input.key] || ''}
                                                        onChange={(e) => setInputValues(prev => ({ ...prev, [input.key]: e.target.value }))}
                                                        placeholder={txt(input.placeholder)}
                                                        className={`w-full bg-[#0B1221] border border-cyan-900/50 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:ring-1 transition-all outline-none shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] ${selectedStyles?.inputFocus}`}
                                                    />
                                                )}
                                            </div>
                                        ))}

                                        <button
                                            onClick={handleGenerate}
                                            className={`w-full py-6 bg-gradient-to-r rounded-xl text-white shadow-lg transition-all flex items-center justify-center gap-3 group mt-4 border ${selectedStyles?.btnGradient} ${selectedStyles?.btnShadow} ${selectedStyles?.btnHoverShadow} ${selectedStyles?.btnBorder} hover:scale-[1.02] active:scale-[0.98]`}
                                        >
                                            <span className="text-lg font-bold tracking-wide">{t('sendRequest')}</span>
                                            <Send className="w-6 h-6 group-hover:scale-110 transition-transform" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default PromptDrawer;
