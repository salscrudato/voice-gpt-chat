/**
 * Firestore Query Optimization and Caching Layer
 * Reduces Firestore reads and improves performance with intelligent caching
 */

import {logInfo} from "./errorHandler";

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
}

class FirestoreCache {
  private cache = new Map<string, CacheEntry<any>>();
  private stats: CacheStats = {hits: 0, misses: 0, evictions: 0};
  private maxSize = 1000;
  private defaultTTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate cache key from query parameters
   */
  private generateKey(collection: string, filters?: Record<string, any>): string {
    const filterStr = filters ? JSON.stringify(filters) : "";
    return `${collection}:${filterStr}`;
  }

  /**
   * Check if cache entry is still valid
   */
  private isValid(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  /**
   * Get from cache
   */
  get<T>(collection: string, filters?: Record<string, any>): T | null {
    const key = this.generateKey(collection, filters);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (!this.isValid(entry)) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.data;
  }

  /**
   * Set cache entry
   */
  set<T>(collection: string, data: T, filters?: Record<string, any>, ttl?: number): void {
    const key = this.generateKey(collection, filters);

    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = Array.from(this.cache.entries()).sort(
        ([, a], [, b]) => a.timestamp - b.timestamp
      )[0][0];
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });

    logInfo(`Cached ${collection}`, {
      component: "FirestoreCache",
      metadata: {size: this.cache.size},
    });
  }

  /**
   * Invalidate cache entry
   */
  invalidate(collection: string, filters?: Record<string, any>): void {
    const key = this.generateKey(collection, filters);
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {...this.stats};
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {hits: 0, misses: 0, evictions: 0};
  }
}

export const firestoreCache = new FirestoreCache();

/**
 * Wrapper for cached Firestore queries
 */
export async function cachedQuery<T>(
  collection: string,
  queryFn: () => Promise<T>,
  filters?: Record<string, any>,
  ttl?: number
): Promise<T> {
  // Try cache first
  const cached = firestoreCache.get<T>(collection, filters);
  if (cached !== null) {
    return cached;
  }

  // Execute query
  const result = await queryFn();

  // Cache result
  firestoreCache.set(collection, result, filters, ttl);

  return result;
}

