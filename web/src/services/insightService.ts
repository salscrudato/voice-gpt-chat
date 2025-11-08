/**
 * Insight Service - Generate basic insights from memos
 * Simplified to only include what's actually used
 */

export interface MemoInsight {
  memoId: string;
  wordCount: number;
  readingTime: number;
}

/**
 * Generate memo insight - calculates word count and reading time
 */
export function generateMemoInsight(memo: {memoId: string; transcript: string; [key: string]: any}): MemoInsight {
  const words = memo.transcript.split(/\s+/).filter(w => w.length > 0).length;
  const readingTime = Math.ceil(words / 200); // Average 200 words per minute

  return {
    memoId: memo.memoId,
    wordCount: words,
    readingTime,
  };
}

