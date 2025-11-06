/**
 * Type definitions for VoiceGPT application
 */

export type MemoStatus = "pending" | "transcribing" | "transcribed" | "embedding" | "indexed" | "error";
export type AudioQuality = "low" | "medium" | "high";
export type SortOrder = "asc" | "desc";
export type Theme = "light" | "dark" | "auto";

export interface Memo {
  id: string;
  memoId: string;
  userId: string;
  userName: string;
  transcript: string;
  summary?: string;
  tags: string[];
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  audioSize: number;
  storagePath: string;
  contentType: string;
  status: MemoStatus;
  indexed: boolean;
  wordCount: number;
  duration?: number;
  language?: string;
  quality?: AudioQuality;
  // New fields for enterprise features
  category?: string;
  sentiment?: "positive" | "neutral" | "negative";
  keyPhrases?: string[];
  entities?: string[];
  confidence?: number;
  processingTime?: number;
}

export interface TextChunk {
  id: string;
  memoId: string;
  userId: string;
  uid: string; // Denormalized for efficient queries
  chunkIndex: number;
  text: string;
  embedding: number[];
  createdAt: Date;
  startTime?: number;
  endTime?: number;
  wordCount?: number;
  language?: string;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: Date;
  citations?: Citation[];
  tokens?: number;
}

export interface Citation {
  memoId: string;
  chunkIndex: number;
  text: string;
  confidence?: number;
  timestamp?: number;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  totalTokens?: number;
}

export interface UserProfile {
  userId: string;
  userName: string;
  createdAt: Date;
  updatedAt: Date;
  totalMemos: number;
  totalChunks: number;
  totalChats: number;
  storageUsed: number;
  preferences?: UserPreferences;
  stats?: UserStats;
}

export interface UserPreferences {
  theme: Theme;
  language: string;
  autoTranscribe: boolean;
  notificationsEnabled: boolean;
  privacyMode?: boolean;
}

export interface UserStats {
  totalRecordingTime: number;
  averageMemoLength: number;
  totalChatsCount: number;
  lastActiveAt: Date;
  mostUsedTags: string[];
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  changes?: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  status: "success" | "failure";
}

export interface Analytics {
  userId: string;
  date: Date;
  memosCreated: number;
  chatsInitiated: number;
  totalTokensUsed: number;
  averageResponseTime: number;
  errorCount: number;
}

