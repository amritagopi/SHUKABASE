export interface SourceChunk {
  id: string;
  bookTitle: string;
  chapter?: string | number;
  verse?: string | number;
  pageNumber?: number; // Keep for backward compatibility
  content: string;
  score: number;
  sourceUrl?: string;
  lang?: string; // New field for Phase 4
  translation?: {
    text: string;
    book: string;
    chapter: string;
    lang: string;
  }; // New field for Phase 4
}

export interface AgentStep {
  type: 'thought' | 'action' | 'observation';
  content: string;
  timestamp: number;
}

export interface Message {
  role: 'user' | 'model';
  content: string; // UI friendly content
  parts: { text: string }[]; // Gemini API friendly content
  timestamp?: number;
  relatedChunkIds?: string[];
  // Добавляем это поле, чтобы хранить полные данные о стихах
  sources?: SourceChunk[];
  isThinking?: boolean;
  agentSteps?: AgentStep[];
  toolCall?: {
    id: string; // The specific tool ID (e.g., 'lecture_architect')
    name: string; // Display name
    args: Record<string, any>; // Pre-filled arguments
  };
}

export interface AppSettings {
  apiKey: string; // Google API Key
  backendUrl: string;
  useMockData: boolean;
  model: string; // Google Model
  language: 'ru' | 'en' | 'all';
  multilingualSearch: boolean; // New flag for Phase 4
  // New Multi-provider settings
  provider: 'google' | 'openrouter';
  openrouterApiKey: string;
  openrouterModel: string;
  telemetryEnabled: boolean;
}

export interface ConversationHeader {
  id: string;
  title: string;
  createdAt: string;
  lastModified?: number;
}

export interface Conversation extends ConversationHeader {
  messages: Message[];
}

export type CitationClickHandler = (chunkId: string) => void;