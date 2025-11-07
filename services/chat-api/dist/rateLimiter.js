"use strict";
/**
 * Rate Limiter - Prevents abuse of the chat API
 * Uses Firestore for persistent, distributed rate limiting
 */
Object.defineProperty(exports, "__esModule", { value: true });
class RateLimiter {
    constructor(db, windowMs = 60000, maxRequests = 30) {
        this.collectionPath = "rateLimits";
        this.localCache = new Map();
        this.db = db;
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        // Cleanup old entries every 5 minutes
        setInterval(() => this.cleanup(), 300000);
    }
    /**
     * Check if request is allowed (async)
     */
    async isAllowed(key) {
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
                this.localCache.set(key, { count: 1, resetTime: entry.resetTime });
                return true;
            }
            const data = doc.data();
            if (now > data.resetTime) {
                // Reset window
                const entry = {
                    count: 1,
                    resetTime: now + this.windowMs,
                    createdAt: new Date(),
                };
                await docRef.set(entry);
                this.localCache.set(key, { count: 1, resetTime: entry.resetTime });
                return true;
            }
            if (data.count < this.maxRequests) {
                // Increment count
                data.count++;
                await docRef.update({ count: data.count });
                this.localCache.set(key, data);
                return true;
            }
            this.localCache.set(key, data);
            return false;
        }
        catch (error) {
            console.error("Rate limiter error:", error);
            // Fail open on error - allow request
            return true;
        }
    }
    /**
     * Get remaining requests
     */
    getRemaining(key) {
        const cached = this.localCache.get(key);
        if (!cached || Date.now() > cached.resetTime) {
            return this.maxRequests;
        }
        return Math.max(0, this.maxRequests - cached.count);
    }
    /**
     * Get reset time
     */
    getResetTime(key) {
        const cached = this.localCache.get(key);
        return cached?.resetTime || Date.now();
    }
    /**
     * Cleanup old entries from Firestore
     */
    async cleanup() {
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
        }
        catch (error) {
            console.error("Rate limiter cleanup error:", error);
        }
    }
    /**
     * Reset for a specific key
     */
    async reset(key) {
        try {
            await this.db.collection(this.collectionPath).doc(key).delete();
            this.localCache.delete(key);
        }
        catch (error) {
            console.error("Rate limiter reset error:", error);
        }
    }
}
exports.default = RateLimiter;
//# sourceMappingURL=rateLimiter.js.map