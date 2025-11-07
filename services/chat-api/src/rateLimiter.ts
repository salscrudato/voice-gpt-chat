/**
 * Rate Limiter - Prevents abuse of the chat API
 * Uses Firestore for persistent, distributed rate limiting
 */

import {Firestore} from "@google-cloud/firestore";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private db: Firestore;
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly collectionPath = "rateLimits";
  private localCache: Map<string, RateLimitEntry> = new Map();

  constructor(db: Firestore, windowMs: number = 60000, maxRequests: number = 30) {
    this.db = db;
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanup(), 300000);
  }

  /**
   * Check if request is allowed (async)
   */
  async isAllowed(key: string): Promise<boolean> {
    const now = Date.now();

    // Check local cache first
    const cached = this.localCache.get(key);
    if (cached && now < cached.resetTime) {
      if (cached.count < this.maxRequests) {
        cached.count++;
        return true;
      }
      return false;
    }

    try {
      const docRef = this.db.collection(this.collectionPath).doc(key);
      const doc = await docRef.get();

      if (!doc.exists) {
        // Create new entry
        const entry = {
          count: 1,
          resetTime: now + this.windowMs,
          createdAt: new Date(),
        };
        await docRef.set(entry);
        this.localCache.set(key, {count: 1, resetTime: entry.resetTime});
        return true;
      }

      const data = doc.data() as RateLimitEntry;

      if (now > data.resetTime) {
        // Reset window
        const entry = {
          count: 1,
          resetTime: now + this.windowMs,
          createdAt: new Date(),
        };
        await docRef.set(entry);
        this.localCache.set(key, {count: 1, resetTime: entry.resetTime});
        return true;
      }

      if (data.count < this.maxRequests) {
        // Increment count
        data.count++;
        await docRef.update({count: data.count});
        this.localCache.set(key, data);
        return true;
      }

      this.localCache.set(key, data);
      return false;
    } catch (error) {
      console.error("Rate limiter error:", error);
      // Fail open on error - allow request
      return true;
    }
  }

  /**
   * Get remaining requests
   */
  getRemaining(key: string): number {
    const cached = this.localCache.get(key);
    if (!cached || Date.now() > cached.resetTime) {
      return this.maxRequests;
    }
    return Math.max(0, this.maxRequests - cached.count);
  }

  /**
   * Get reset time
   */
  getResetTime(key: string): number {
    const cached = this.localCache.get(key);
    return cached?.resetTime || Date.now();
  }

  /**
   * Cleanup old entries from Firestore
   */
  private async cleanup(): Promise<void> {
    try {
      const now = Date.now();
      const cutoff = new Date(now - this.windowMs * 2); // Keep 2 windows of history

      const snapshot = await this.db
        .collection(this.collectionPath)
        .where("createdAt", "<", cutoff)
        .limit(100)
        .get();

      const batch = this.db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      if (snapshot.size > 0) {
        await batch.commit();
        console.log(`Cleaned up ${snapshot.size} rate limit entries`);
      }
    } catch (error) {
      console.error("Rate limiter cleanup error:", error);
    }
  }

  /**
   * Reset for a specific key
   */
  async reset(key: string): Promise<void> {
    try {
      await this.db.collection(this.collectionPath).doc(key).delete();
      this.localCache.delete(key);
    } catch (error) {
      console.error("Rate limiter reset error:", error);
    }
  }
}

export default RateLimiter;

