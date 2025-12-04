import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Copy, Check } from 'lucide-react';
import { CitationClickHandler, SourceChunk } from '../types';

interface ParsedContentProps {
  content: string;
  onCitationClick: CitationClickHandler;
  sources?: SourceChunk[];
  onReadFull?: (chunk: SourceChunk) => void;
  t: (key: string) => string;
}

const MarkdownRenderer: React.FC<{
  content: string;
  t: (key: string) => string;
  onCitationClick: (id: string) => void;
  isBlock?: boolean;
}> = ({ content, t, onCitationClick, isBlock }) => {
  const parts = content.split(/(\[\[.*?\]\])/g);

  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/^\[\[(.*?)\]\]$/);
        if (match) {
          const id = match[1];
          return (
            <button
              key={index}
              onClick={() => onCitationClick(id)}
              className="citation-link inline-flex items-center mx-1 px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/30 text-xs align-baseline transition-all hover:scale-105"
              title={t('jumpToSource')}
            >
              <BookOpen size={10} className="mr-1" />
              {t('citation')}
            </button>
          );
        }

        return (
          <ReactMarkdown
            key={index}
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className={`mb-2 ${isBlock ? 'text-inherit' : ''}`}>{children}</p>,
              ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
              li: ({ children }) => <li className="ml-2">{children}</li>,
              strong: ({ children }) => <strong className={`font-bold ${isBlock ? 'text-inherit' : 'text-slate-100'}`}>{children}</strong>,
              em: ({ children }) => <em className={`italic ${isBlock ? 'text-inherit opacity-90' : 'text-slate-300'}`}>{children}</em>,
              code: ({ children }) => <code className="bg-slate-800 px-1.5 py-0.5 rounded text-xs font-mono text-amber-400">{children}</code>,
              pre: ({ children }) => <pre className="bg-slate-950 p-3 rounded-lg overflow-x-auto mb-2 border border-slate-700">{children}</pre>,
              blockquote: ({ children }) => <div className="pl-0">{children}</div>
            }}
          >
            {part}
          </ReactMarkdown>
        );
      })}
    </>
  );
};

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // Clean up text for copying (remove > markers)
    const cleanText = text.split('\n').map(l => l.replace(/^>\s?/, '')).join('\n').trim();
    navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-lg hover:bg-black/10 transition-colors text-current opacity-70 hover:opacity-100"
      title="Copy text"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
};

export const ParsedContent: React.FC<ParsedContentProps> = ({
  content,
  onCitationClick,
  sources = [],
  onReadFull,
  t
}) => {

  const handleCitationClick = (id: string) => {
    onCitationClick(id);
    if (onReadFull && sources.length > 0) {
      const source = sources.find(s => s.id === id);
      if (source) {
        setTimeout(() => onReadFull(source), 300);
      } else {
        const normalizedId = id.replace(/\\/g, '/');
        const sourceNormalized = sources.find(s => s.id.replace(/\\/g, '/') === normalizedId);
        if (sourceNormalized) {
          setTimeout(() => onReadFull(sourceNormalized), 300);
        }
      }
    }
  };

  const parseBlocks = (text: string) => {
    const lines = text.split('\n');
    const blocks: { type: 'verse' | 'purport' | 'markdown'; title?: string; content: string }[] = [];
    let currentBlock: { type: 'verse' | 'purport' | 'markdown'; title?: string; content: string } | null = null;

    const finalizeBlock = () => {
      if (currentBlock) {
        if (currentBlock.content.trim()) {
          blocks.push(currentBlock);
        }
        currentBlock = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('**📖')) {
        finalizeBlock();
        const title = trimmed.replace(/\*\*/g, '').replace('📖', '').trim();
        currentBlock = { type: 'verse', title, content: '' };
      } else if (trimmed.startsWith('**💬')) {
        finalizeBlock();
        const title = trimmed.replace(/\*\*/g, '').replace('💬', '').trim();
        currentBlock = { type: 'purport', title, content: '' };
      } else {
        if (currentBlock && (currentBlock.type === 'verse' || currentBlock.type === 'purport')) {
          if (trimmed.startsWith('>')) {
            currentBlock.content += line + '\n';
          } else if (trimmed === '') {
            currentBlock.content += line + '\n';
          } else {
            finalizeBlock();
            currentBlock = { type: 'markdown', content: line + '\n' };
          }
        } else {
          if (!currentBlock) {
            currentBlock = { type: 'markdown', content: '' };
          }
          currentBlock.content += line + '\n';
        }
      }
    }
    finalizeBlock();
    return blocks;
  };

  const blocks = parseBlocks(content);

  return (
    <div className="markdown-body prose prose-invert prose-slate max-w-none text-slate-300 leading-relaxed text-sm md:text-base">
      {blocks.map((block, idx) => {
        if (block.type === 'verse') {
          return (
            <div key={idx} className="my-4 rounded-lg overflow-hidden border-l-4 border-amber-500 bg-gradient-to-br from-[#fff7ed] to-[#ffedd5] text-[#78350f] shadow-sm">
              <div className="flex items-center justify-between px-4 py-2 border-b border-amber-500/10 bg-amber-500/5">
                <div className="font-bold flex items-center gap-2">
                  <span>📖</span>
                  {block.title}
                </div>
                <CopyButton text={block.content} />
              </div>
              <div className="p-4 font-serif text-lg leading-relaxed">
                <MarkdownRenderer
                  content={block.content}
                  t={t}
                  onCitationClick={handleCitationClick}
                  isBlock={true}
                />
              </div>
            </div>
          );
        } else if (block.type === 'purport') {
          return (
            <div key={idx} className="my-4 rounded-lg overflow-hidden border-l-4 border-violet-500 bg-gradient-to-br from-[#f5f3ff] to-[#ede9fe] text-[#4c1d95] shadow-sm">
              <div className="flex items-center justify-between px-4 py-2 border-b border-violet-500/10 bg-violet-500/5">
                <div className="font-bold flex items-center gap-2">
                  <span>💬</span>
                  {block.title}
                </div>
                <CopyButton text={block.content} />
              </div>
              <div className="p-4">
                <MarkdownRenderer
                  content={block.content}
                  t={t}
                  onCitationClick={handleCitationClick}
                  isBlock={true}
                />
              </div>
            </div>
          );
        } else {
          return (
            <div key={idx}>
              <MarkdownRenderer
                content={block.content}
                t={t}
                onCitationClick={handleCitationClick}
                isBlock={false}
              />
            </div>
          );
        }
      })}
    </div>
  );
};
