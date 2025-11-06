"use strict";
/**
 * Rate Limiter - Prevents abuse of the chat API
 * Uses in-memory store with TTL for rate limiting
 */
Object.defineProperty(exports, "__esModule", { value: true });
class RateLimiter {
    constructor(windowMs = 60000, maxRequests = 30) {
        this.store = new Map();
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        // Cleanup old entries every minute
        setInterval(() => this.cleanup(), 60000);
    }
    /**
     * Check if request is allowed
     */
    isAllowed(key) {
        const now = Date.now();
        const entry = this.store.get(key);
        if (!entry || now > entry.resetTime) {
            // Create new entry
            this.store.set(key, {
                count: 1,
                resetTime: now + this.windowMs,
            });
            return true;
        }
        if (entry.count < this.maxRequests) {
            entry.count++;
            return true;
        }
        return false;
    }
    /**
     * Get remaining requests
     */
    getRemaining(key) {
        const entry = this.store.get(key);
        if (!entry || Date.now() > entry.resetTime) {
            return this.maxRequests;
        }
        return Math.max(0, this.maxRequests - entry.count);
    }
    /**
     * Get reset time
     */
    getResetTime(key) {
        const entry = this.store.get(key);
        return entry?.resetTime || Date.now();
    }
    /**
     * Cleanup old entries
     */
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (now > entry.resetTime) {
                this.store.delete(key);
            }
        }
    }
    /**
     * Reset for a specific key
     */
    reset(key) {
        this.store.delete(key);
    }
}
exports.default = RateLimiter;
//# sourceMappingURL=rateLimiter.js.map