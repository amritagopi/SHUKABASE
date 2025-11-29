export interface SourceChunk {
  id: string;
  bookTitle: string;
  chapter?: string | number;
  verse?: string | number;
  pageNumber?: number; // Keep for backward compatibility
  content: string;
  score: number;
}

export interface MessagePart {
  text: string;
}

export interface AgentStep {
  type: 'thought' | 'action' | 'observation';
  content: string;
  timestamp: number;
}

export interface Message {
  role: 'user' | 'model';
  parts: MessagePart[];
  timestamp?: number;
  relatedChunkIds?: string[];
  isThinking?: boolean;
  agentSteps?: AgentStep[];
}

export interface AppSettings {
  apiKey: string;
  backendUrl: string;
  useMockData: boolean;
  model: string;
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