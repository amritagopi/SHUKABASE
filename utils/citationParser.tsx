import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen } from 'lucide-react';
import { CitationClickHandler } from '../types';
import { SourceChunk } from '../types';

interface ParsedContentProps {
  content: string;
  onCitationClick: CitationClickHandler;
  sources?: SourceChunk[];
  onReadFull?: (chunk: SourceChunk) => void;
  t: (key: string) => string;
}

export const ParsedContent: React.FC<ParsedContentProps> = ({
  content,
  onCitationClick,
  sources = [],
  onReadFull,
  t
}) => {
  // Split content by citation markers [[source_id]]
  const parts = content.split(/(\[\[.*?\]\])/g);

  const handleCitationClick = (id: string) => {
    console.log("Citation clicked:", id);
    console.log("Available sources:", sources);

    // First, highlight the source in the sidebar
    onCitationClick(id);

    // If we have onReadFull handler and sources, open the full text
    if (onReadFull && sources.length > 0) {
      const source = sources.find(s => s.id === id);
      console.log("Found source:", source);

      if (source) {
        // Small delay to let the highlight animation start
        setTimeout(() => {
          onReadFull(source);
        }, 300);
      } else {
        console.warn("Source not found for id:", id);
        // Попробуем найти с нормализацией слешей
        const normalizedId = id.replace(/\\/g, '/');
        const sourceNormalized = sources.find(s => s.id.replace(/\\/g, '/') === normalizedId);
        if (sourceNormalized) {
          console.log("Found source with normalized path:", sourceNormalized);
          setTimeout(() => {
            onReadFull(sourceNormalized);
          }, 300);
        }
      }
    }
  };

  return (
    <div className="markdown-body prose prose-invert prose-slate max-w-none text-slate-300 leading-relaxed text-sm md:text-base">
      {parts.map((part, index) => {
        const match = part.match(/^\[\[(.*?)\]\]$/);
        if (match) {
          const id = match[1];
          return (
            <button
              key={index}
              onClick={() => handleCitationClick(id)}
              className="citation-link inline-flex items-center mx-1 px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/30 text-xs align-baseline transition-all hover:scale-105"
              title={t('jumpToSource')}
            >
              <BookOpen size={10} className="mr-1" />
              {t('citation')}
            </button>
          );
        }
        // Render markdown for text parts
        return (
          <ReactMarkdown
            key={index}
            remarkPlugins={[remarkGfm]}
            components={{
              // Customize rendering for specific elements if needed
              p: ({ children }) => <p className="mb-2">{children}</p>,
              ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
              li: ({ children }) => <li className="ml-2">{children}</li>,
              strong: ({ children }) => <strong className="font-bold text-slate-100">{children}</strong>,
              em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
              code: ({ children }) => <code className="bg-slate-800 px-1.5 py-0.5 rounded text-xs font-mono text-amber-400">{children}</code>,
              pre: ({ children }) => <pre className="bg-slate-950 p-3 rounded-lg overflow-x-auto mb-2 border border-slate-700">{children}</pre>,
            }}
          >
            {part}
          </ReactMarkdown>
        );
      })}
    </div>
  );
};
