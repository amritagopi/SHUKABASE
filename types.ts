export interface SourceChunk {
  id: string;
  bookTitle: string;
  chapter?: string | number;
  verse?: string | number;
  pageNumber?: number; // Keep for backward compatibility
  content: string;
  score: number;
}

export interface AgentStep {
  type: 'thought' | 'action' | 'observation';
  content: string;
  timestamp: number;
}

export interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
  timestamp?: number;
  relatedChunkIds?: string[];
  // Добавляем это поле, чтобы хранить полные данные о стихах
  sources?: SourceChunk[];
  isThinking?: boolean;
  agentSteps?: AgentStep[];
}

export interface AppSettings {
  apiKey: string;
  backendUrl: string;
  useMockData: boolean;
  model: string;
  language: 'ru' | 'en';
}

export interface ConversationHeader {
  id: string;
  title: string;
  createdAt: string;
}

export interface Conversation extends ConversationHeader {
  messages: Message[];
}

export type CitationClickHandler = (chunkId: string) => void;