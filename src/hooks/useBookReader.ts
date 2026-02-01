
import { useState } from 'react';
import { getBookTitle, getBookFolder } from '../utils/bookUtils';

export interface BookReaderState {
    fullTextModalOpen: boolean;
    fullTextContent: string;
    fullTextTitle: string;
    currentHtmlPath: string;
}

export const useBookReader = (language: 'en' | 'ru', backendUrl: string = 'http://localhost:5000') => {
    const [state, setState] = useState<BookReaderState>({
        fullTextModalOpen: false,
        fullTextContent: '',
        fullTextTitle: '',
        currentHtmlPath: ''
    });

    const setFullTextModalOpen = (open: boolean) => setState(prev => ({ ...prev, fullTextModalOpen: open }));

    const loadFullText = async (path: string, title?: string) => {
        try {
            // Construct full URL if path is relative (starts with /books)
            const fetchUrl = path.startsWith('/books/') && !path.startsWith('http')
                ? `${backendUrl}${path}`
                : path;

            let response = await fetch(fetchUrl);
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

            setState({
                fullTextContent: contentToDisplay,
                fullTextTitle: displayTitle || 'Text View',
                currentHtmlPath: path,
                fullTextModalOpen: true
            });
        } catch (error) {
            setState(prev => ({
                ...prev,
                fullTextContent: "Could not load full chapter text. Please try checking the source manually.",
                fullTextTitle: "Error Loading Text",
                fullTextModalOpen: true
            }));
            console.error("Error loading full text:", error);
        }
    };

    const handleReadFull = async (chunk: any) => {
        let chapterPath = '';
        const lang = language;

        try {
            // Restore robust logic from historical commit 581c599
            // 1. Try to identify the book folder
            const bookFolder = getBookFolder(chunk.bookTitle);

            // 2. Determine the path
            // PRIORITY 1: If chapter looks like a path (has slashes), assume it's a relative path from books root
            // This handles cases where RAG returns 'sb/1/2' or full matching paths
            if (chunk.chapter && typeof chunk.chapter === 'string' && (chunk.chapter.includes('/') || chunk.chapter.includes('\\'))) {
                const normalizedPath = String(chunk.chapter).replace(/\\/g, '/');
                // Clean leading slashes just in case
                const cleanPath = normalizedPath.replace(/^\/+/, '');

                // Fix: Ensure we include the book folder if the path is just "1/index.html"
                if (bookFolder && !cleanPath.startsWith(bookFolder)) {
                    chapterPath = `/books/${lang}/${bookFolder}/${cleanPath}`;
                } else {
                    chapterPath = `/books/${lang}/${cleanPath}`;
                }

                // Add index.html if missing
                if (!chapterPath.endsWith('.html')) {
                    chapterPath = `${chapterPath}/index.html`;
                }
            }
            // PRIORITY 2: Construct path from components if book folder is known
            else if (bookFolder) {
                const chapterPart = chunk.chapter || '1';
                // Handle "1.2" style notation -> "1/2"
                const chapterPathSegment = String(chapterPart).split('.').join('/');

                if (chunk.verse) {
                    chapterPath = `/books/${lang}/${bookFolder}/${chapterPathSegment}/${chunk.verse}/index.html`;
                } else {
                    chapterPath = `/books/${lang}/${bookFolder}/${chapterPathSegment}/index.html`;
                }
            }
            // PRIORITY 3: Fallback or fuzzy search (handled partly by getBookFolder)
            else {
                // Final fallback: try to use chapter as path if nothing else worked
                if (chunk.sourceUrl && chunk.sourceUrl.includes('/books/')) {
                    // Extract relative path from sourceUrl if available
                    // e.g. http://localhost.../books/en/sb/1/1/index.html -> sb/1/1/index.html
                    const parts = chunk.sourceUrl.split('/books/');
                    if (parts[1]) {
                        const relPath = parts[1].split('/').slice(1).join('/'); // remove the lang part
                        chapterPath = `/books/${lang}/${relPath}`;
                    }
                } else {
                    console.warn("Could not determine path for chunk:", chunk);
                    // Fallback to displaying content content directly handled in catch block
                    throw new Error("Path construction failed");
                }
            }

            // Better title formatting
            const niceBookTitle = getBookTitle(chunk.bookTitle, language);
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
            console.log("DEBUG: Loading full text from:", chapterPath);
            await loadFullText(chapterPath, `${niceBookTitle} ${titleSuffix}`);

        } catch (e) {
            console.error("Path construction error", e);
            // Fallback
            setState(prev => ({
                ...prev,
                fullTextContent: chunk.content,
                fullTextTitle: chunk.bookTitle,
                fullTextModalOpen: true
            }));
        }
    };

    const handleModalClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const anchor = target.closest('a');
        if (anchor && anchor.href) {
            const href = anchor.getAttribute('href');
            if (href && !href.startsWith('http') && !href.startsWith('#')) {
                e.preventDefault();
                e.stopPropagation();

                const currentDir = state.currentHtmlPath.substring(0, state.currentHtmlPath.lastIndexOf('/'));
                const parts = currentDir.split('/');
                const relativeParts = href.split('/');

                const newParts = [...parts];

                for (const part of relativeParts) {
                    if (part === '.') continue;
                    if (part === '..') newParts.pop();
                    else newParts.push(part);
                }

                const newPath = newParts.join('/');
                loadFullText(newPath);
            }
        }
    };

    return {
        ...state,
        setFullTextModalOpen,
        handleReadFull,
        handleModalClick,
        loadFullText
    };
};
