import React, { useState, useEffect } from 'react';
import { X, ChevronDown, Sparkles, ArrowRight, ChevronLeft } from 'lucide-react'; // Ensure ArrowRight/ChevronLeft are imported
import { PROMPT_TEMPLATES, PromptTemplate } from './promptTemplates';

interface PromptDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectDevice: (prompt: string, templateTitle: string) => void;
    initialTemplateId?: string | null;
    initialData?: Record<string, any> | null;
    t: (key: string) => string;
}

const PromptDrawer: React.FC<PromptDrawerProps> = ({ isOpen, onClose, onSelectDevice, initialTemplateId, initialData, t }) => {
    const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const [isAnimating, setIsAnimating] = useState(false);

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
        selectedTemplate.inputs.forEach(input => {
            const val = inputValues[input.key] || '';
            finalPrompt = finalPrompt.replace(new RegExp(`{{${input.key}}}`, 'g'), val);
        });
        onSelectDevice(finalPrompt, selectedTemplate.title);
        // State cleanup happens in parent onClose -> useEffect
    };

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
                <div className="h-full w-full bg-[#050B14] border-r border-cyan-500/30 shadow-[0_0_50px_rgba(34,211,238,0.15)] flex overflow-hidden relative">

                    {/* Cyber Grid Background */}
                    <div className="absolute inset-0 pointer-events-none opacity-20"
                        style={{
                            backgroundImage: 'linear-gradient(rgba(34, 211, 238, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 211, 238, 0.1) 1px, transparent 1px)',
                            backgroundSize: '40px 40px',
                            perspective: '1000px',
                            transform: 'rotateX(10deg) scale(1.1)'
                        }}>
                    </div>

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
                                <div className="mb-8 text-center">
                                    <h2 className="text-3xl font-bold text-white tracking-wider glow-text-cyan uppercase">
                                        Command Deck
                                    </h2>
                                    <p className="text-cyan-400/60 font-mono text-sm tracking-widest mt-2">SELECT PROTOCOL</p>
                                </div>

                                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto pb-10">
                                        {allTemplates.map((template) => (
                                            <button
                                                key={template.id}
                                                onClick={() => setSelectedTemplate(template)}
                                                className="group relative h-24 flex items-center px-8 
                                                    bg-[#0B1221]/80 backdrop-blur-md 
                                                    border border-cyan-500/30 rounded-lg 
                                                    hover:bg-[#11192E] hover:border-cyan-400 
                                                    hover:shadow-[0_0_25px_rgba(34,211,238,0.2)]
                                                    transition-all duration-300"
                                            >
                                                {/* Left Icon/Image Thumbnail */}
                                                <div className="w-12 h-12 flex items-center justify-center mr-6 rounded bg-cyan-950/30 border border-cyan-500/20 group-hover:scale-110 transition-transform">
                                                    {template.icon && <template.icon size={24} className="text-cyan-400" />}
                                                </div>

                                                {/* Text Info */}
                                                <div className="text-left flex-1">
                                                    <h3 className="text-lg font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors mb-0.5">
                                                        {template.title}
                                                    </h3>
                                                    <p className="text-xs text-slate-500 group-hover:text-slate-400 line-clamp-1">
                                                        {template.description}
                                                    </p>
                                                </div>

                                                {/* Hover Arrow */}
                                                <ArrowRight className="w-5 h-5 text-cyan-500/50 opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all duration-300" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // --- DETAIL VIEW (Split Layout) ---
                            <div className="flex-1 flex flex-col md:flex-row gap-8 items-stretch animate-slide-in-right h-full">

                                {/* Left Column: Hero Image */}
                                <div className="hidden md:flex flex-1 relative items-center justify-start -ml-12">
                                    <div className="relative w-full h-full flex items-center justify-start">
                                        {/* Glow effect */}
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-cyan-500/10 blur-[120px] rounded-full mix-blend-screen"></div>

                                        {selectedTemplate.image ? (
                                            <img
                                                src={selectedTemplate.image}
                                                alt={selectedTemplate.title}
                                                className="relative z-10 h-[90%] w-auto object-contain object-left drop-shadow-2xl opacity-90 hover:opacity-100 transition-opacity duration-500"
                                            />
                                        ) : (
                                            <div className="relative z-10 w-full h-full flex items-center justify-center">
                                                <div className="w-64 h-64 rounded-full bg-slate-900 border-2 border-cyan-500/30 flex items-center justify-center">
                                                    <selectedTemplate.icon size={80} className="text-cyan-400 drop-shadow-lg" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Column: Controls */}
                                <div className="flex-1 flex flex-col justify-center max-w-xl mx-auto md:mx-0 w-full">

                                    {/* Header & Back */}
                                    <div className="mb-8">
                                        <button
                                            onClick={() => setSelectedTemplate(null)}
                                            className="flex items-center gap-2 text-cyan-500 hover:text-cyan-300 transition-colors mb-6 group text-sm font-bold uppercase tracking-wide"
                                        >
                                            <div className="p-1.5 rounded-full border border-cyan-500/30 group-hover:bg-cyan-500/20 transition-colors">
                                                <ChevronLeft size={16} />
                                            </div>
                                            {t('backToList')}
                                        </button>

                                        <h2 className="text-3xl md:text-4xl font-bold text-white glow-text-cyan mb-2">
                                            {selectedTemplate.title}
                                        </h2>
                                        <p className="text-lg text-slate-400 leading-relaxed border-l-2 border-cyan-500/50 pl-4 py-1">
                                            {selectedTemplate.description}
                                        </p>
                                    </div>

                                    {/* Inputs */}
                                    <div className="space-y-6 bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-white/5 shadow-inner">
                                        {selectedTemplate.inputs.map(input => (
                                            <div key={input.key} className="space-y-2">
                                                <label className="text-sm font-medium text-cyan-100/80 ml-1">
                                                    {input.label}
                                                </label>
                                                {input.type === 'textarea' ? (
                                                    <textarea
                                                        value={inputValues[input.key] || ''}
                                                        onChange={(e) => setInputValues(prev => ({ ...prev, [input.key]: e.target.value }))}
                                                        placeholder={input.placeholder}
                                                        rows={4}
                                                        className="w-full bg-[#0B1221] border border-cyan-900/50 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all outline-none resize-none shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]"
                                                    />
                                                ) : input.type === 'select' ? (
                                                    <div className="relative">
                                                        <select
                                                            value={inputValues[input.key] || ''}
                                                            onChange={(e) => setInputValues(prev => ({ ...prev, [input.key]: e.target.value }))}
                                                            className="w-full bg-[#0B1221] border border-cyan-900/50 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all outline-none appearance-none shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]"
                                                        >
                                                            <option value="" disabled selected>{input.placeholder}</option>
                                                            {input.options?.map(opt => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500 pointer-events-none" />
                                                    </div>
                                                ) : (
                                                    <input
                                                        type={input.type}
                                                        value={inputValues[input.key] || ''}
                                                        onChange={(e) => setInputValues(prev => ({ ...prev, [input.key]: e.target.value }))}
                                                        placeholder={input.placeholder}
                                                        className="w-full bg-[#0B1221] border border-cyan-900/50 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all outline-none shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]"
                                                    />
                                                )}
                                            </div>
                                        ))}

                                        <button
                                            onClick={handleGenerate}
                                            className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white font-bold rounded-xl shadow-[0_0_30px_rgba(34,211,238,0.2)] hover:shadow-[0_0_50px_rgba(34,211,238,0.4)] transition-all transform active:scale-[0.98] mt-4 uppercase tracking-widest flex items-center justify-center gap-3 border border-cyan-400/20"
                                        >
                                            <Sparkles className="w-5 h-5 animate-pulse" />
                                            Activate Protocol
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
