import { GoogleGenAI } from "@google/genai";
import { SourceChunk, AppSettings, Conversation, ConversationHeader, AgentStep } from '../types';
import { INITIAL_SYSTEM_INSTRUCTION, DEMO_CHUNKS } from '../constants';

const createClient = (apiKey: string) => new GoogleGenAI({ apiKey });

// Base URL for the Python Backend API
const API_BASE_URL = 'http://localhost:5000/api';

// Helper to perform search against the Python RAG backend
const searchChunks = async (query: string, settings: AppSettings): Promise<SourceChunk[]> => {
  if (settings.useMockData) {
    return DEMO_CHUNKS;
  }

  const searchEndpoint = `${API_BASE_URL}/search`;

  try {
    const response = await fetch(searchEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        language: settings.language || 'en',
        top_k: 5
      })
    });

    if (!response.ok) {
      console.warn(`Backend search failed: ${response.status} ${response.statusText}`);
      return [];
    }
    const data = await response.json();

    if (data.results && Array.isArray(data.results)) {
      return data.results.map((r: any) => ({
        id: `${(r.book || 'unknown').replace(/\s+/g, "").toLowerCase()}.${r.chapter}.${r.verse}`,
        bookTitle: r.book || 'Unknown',
        chapter: r.chapter,
        verse: r.verse,
        content: r.text,
        score: r.final_score || r.score || 0
      }));
    }

    return [];
  } catch (e) {
    console.warn("Search failed (network or parsing error), returning empty array:", e);
    return [];
  }
}

export const generateRAGResponse = async (
  query: string,
  initialChunks: SourceChunk[],
  settings: AppSettings,
  chatHistory: { role: string; parts: { text: string }[] }[] = [],
  onStep?: (step: AgentStep) => void,
  onSourcesFound?: (chunks: SourceChunk[]) => void
) => {
  if (!settings.apiKey) {
    throw new Error("API Key is missing. Please check settings.");
  }

  if (onStep) onStep({ type: 'thought', content: 'Searching scriptures for context...', timestamp: Date.now() });

  let chunks = initialChunks;
  if (chunks.length === 0) {
    chunks = await searchChunks(query, settings);
  }

  if (onSourcesFound) onSourcesFound(chunks);

  if (onStep) onStep({ type: 'observation', content: `Found ${chunks.length} relevant verses.`, timestamp: Date.now() });

  const client = createClient(settings.apiKey);

  const contextString = chunks.map(chunk => {
    const loc = chunk.chapter && chunk.verse
      ? `Chapter ${chunk.chapter}, Verse ${chunk.verse}`
      : `Page ${chunk.pageNumber}`;

    return `
---
ID: ${chunk.id}
SOURCE: ${chunk.bookTitle} (${loc})
TEXT: ${chunk.content}
---
`;
  }).join('\n');

  const finalPrompt = `
RETRIEVED SCRIPTURAL CONTEXT:
${contextString}

USER QUESTION:
${query}

Please answer the question based strictly on the context above. 
Use citation format [[ID]] for every claim.
`;

  if (onStep) onStep({ type: 'thought', content: 'Generating response based on context...', timestamp: Date.now() });

  try {
    const response = await client.models.generateContent({
      model: settings.model,
      contents: [
        ...chatHistory.map(msg => ({
          role: msg.role,
          parts: msg.parts
        })),
        {
          role: 'user',
          parts: [{ text: finalPrompt }]
        }
      ],
      config: {
        systemInstruction: INITIAL_SYSTEM_INSTRUCTION,
        temperature: 0.3,
      }
    });

    return response.text || "I could not generate a response.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

// --- Conversation persistence ---

export const getConversations = async (): Promise<ConversationHeader[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/conversations`);
    if (!response.ok) return [];
    return await response.json();
  } catch (e) {
    console.error("Failed to fetch conversations:", e);
    return [];
  }
};

export const getConversation = async (id: string): Promise<Conversation | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/conversations/${id}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error(`Failed to fetch conversation ${id}:`, e);
    return null;
  }
};

export const saveConversation = async (conversation: Conversation): Promise<void> => {
  try {
    await fetch(`${API_BASE_URL}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conversation)
    });
  } catch (e) {
    console.error("Failed to save conversation:", e);
  }
};

export const deleteConversation = async (id: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/conversations/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error(`Failed to delete: ${response.status}`);
  } catch (e) {
    console.error("Failed to delete conversation:", e);
    throw e;
  }
};