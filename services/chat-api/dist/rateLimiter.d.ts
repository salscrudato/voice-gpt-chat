/**
 * Rate Limiter - Prevents abuse of the chat API
 * Uses Firestore for persistent, distributed rate limiting
 */
import { Firestore } from "@google-cloud/firestore";
declare class RateLimiter {
    private db;
    private readonly windowMs;
    private readonly maxRequests;
    private readonly collectionPath;
    private localCache;
    constructor(db: Firestore, windowMs?: number, maxRequests?: number);
    /**
     * Check if request is allowed (async)
     */
    isAllowed(key: string): Promise<boolean>;
    /**
     * Get remaining requests
     */
    getRemaining(key: string): number;
    /**
     * Get reset time
     */
    getResetTime(key: string): number;
    /**
     * Cleanup old entries from Firestore
     */
    private cleanup;
    /**
     * Reset for a specific key
     */
    reset(key: string): Promise<void>;
}
export default RateLimiter;
//# sourceMappingURL=rateLimiter.d.ts.map