export type InteractionMode = 'reflection' | 'brainstorm' | 'summary' | 'chat' | 'technical-mentor';

export type EntryCategory = 'reflection' | 'brainstorm' | 'gratitude' | 'problem-solving' | 'work' | 'creative';

export type SentimentScore = 'Positive' | 'Neutral' | 'Challenging';

export interface MoodMetadata {
  primary_mood: string;
  sentiment_score: SentimentScore;
  emotion_color: string;
}

export interface Turn {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  mode?: InteractionMode;
  modelUsed?: string;
}

export interface JournalEntry {
  id: string;
  userId: string;
  title: string;
  category: EntryCategory;
  summary?: string;
  mood?: MoodMetadata;
  turns: Turn[];
  createdAt: string;
  updatedAt: string;
}

export interface UserInteraction {
  id: string;
  userId: string;
  entryId?: string;
  prompt: string;
  response: string;
  mode: InteractionMode;
  modelUsed?: string;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: string;
  lastLoginAt: string;
}

export interface SemanticSearchResult {
  query: string;
  answer: string;
  relevantEntryIds: string[];
  keyThemes?: string[];
  modelUsed?: string;
  searchedAt: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
