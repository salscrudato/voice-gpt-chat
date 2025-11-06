/**
 * Insight Service - Generate AI-powered insights from memos
 */

import {Memo} from "../types";

export interface MemoInsight {
  memoId: string;
  summary: string;
  keyTopics: string[];
  sentiment: "positive" | "neutral" | "negative";
  wordCount: number;
  readingTime: number;
  qualityScore: number;
}

export interface CollectionInsights {
  totalMemos: number;
  totalWords: number;
  averageLength: number;
  topTopics: string[];
  sentimentDistribution: Record<string, number>;
  averageQualityScore: number;
}

/**
 * Generate smart summary from text
 */
export function generateSmartSummary(text: string, maxLength: number = 200): string {
  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  
  if (sentences.length === 0) return text.substring(0, maxLength);

  // Score sentences by importance (first and last are usually important)
  const scoredSentences = sentences.map((sentence, index) => ({
    text: sentence.trim(),
    score: (index === 0 || index === sentences.length - 1) ? 2 : 1,
  }));

  // Select top sentences
  let summary = "";
  for (const {text} of scoredSentences) {
    if ((summary + text).length <= maxLength) {
      summary += text + " ";
    }
  }

  return summary.trim() || text.substring(0, maxLength);
}

/**
 * Extract key topics from text
 */
export function extractKeyTopics(text: string, maxTopics: number = 5): string[] {
  // Simple keyword extraction - look for capitalized words and common phrases
  const words = text.split(/\s+/);
  const topics: Record<string, number> = {};

  for (const word of words) {
    // Look for capitalized words (likely proper nouns)
    if (/^[A-Z]/.test(word)) {
      const clean = word.replace(/[^a-zA-Z]/g, "").toLowerCase();
      if (clean.length > 3) {
        topics[clean] = (topics[clean] || 0) + 1;
      }
    }
  }

  return Object.entries(topics)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTopics)
    .map(([topic]) => topic);
}

/**
 * Analyze sentiment of text
 */
export function analyzeSentiment(text: string): "positive" | "neutral" | "negative" {
  const positiveWords = ["good", "great", "excellent", "happy", "love", "amazing", "wonderful"];
  const negativeWords = ["bad", "terrible", "hate", "awful", "poor", "sad", "angry"];

  const lowerText = text.toLowerCase();
  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of positiveWords) {
    positiveCount += (lowerText.match(new RegExp(word, "g")) || []).length;
  }

  for (const word of negativeWords) {
    negativeCount += (lowerText.match(new RegExp(word, "g")) || []).length;
  }

  if (positiveCount > negativeCount) return "positive";
  if (negativeCount > positiveCount) return "negative";
  return "neutral";
}

/**
 * Calculate transcription quality score (0-100)
 */
export function calculateQualityScore(text: string): number {
  let score = 50; // Base score

  // Bonus for length
  if (text.length > 500) score += 10;
  if (text.length > 1000) score += 10;

  // Bonus for punctuation (indicates clear speech)
  const punctuation = (text.match(/[.!?]/g) || []).length;
  if (punctuation > text.length / 100) score += 10;

  // Bonus for variety (different words)
  const words = text.split(/\s+/);
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const diversity = uniqueWords.size / words.length;
  if (diversity > 0.7) score += 10;

  return Math.min(100, score);
}

/**
 * Generate memo insight
 */
export function generateMemoInsight(memo: {memoId: string; transcript: string; [key: string]: any}): MemoInsight {
  const words = memo.transcript.split(/\s+/).length;
  const readingTime = Math.ceil(words / 200); // Average 200 words per minute

  return {
    memoId: memo.memoId,
    summary: generateSmartSummary(memo.transcript),
    keyTopics: extractKeyTopics(memo.transcript),
    sentiment: analyzeSentiment(memo.transcript),
    wordCount: words,
    readingTime,
    qualityScore: calculateQualityScore(memo.transcript),
  };
}

/**
 * Generate collection insights
 */
export function generateCollectionInsights(memos: Memo[]): CollectionInsights {
  const insights = memos.map(generateMemoInsight);

  const totalWords = insights.reduce((sum, i) => sum + i.wordCount, 0);
  const topicCounts: Record<string, number> = {};
  const sentiments: Record<string, number> = {positive: 0, neutral: 0, negative: 0};

  for (const insight of insights) {
    for (const topic of insight.keyTopics) {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    }
    sentiments[insight.sentiment]++;
  }

  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  const avgQuality = insights.reduce((sum, i) => sum + i.qualityScore, 0) / insights.length;

  return {
    totalMemos: memos.length,
    totalWords,
    averageLength: Math.round(totalWords / memos.length),
    topTopics,
    sentimentDistribution: sentiments,
    averageQualityScore: Math.round(avgQuality),
  };
}

