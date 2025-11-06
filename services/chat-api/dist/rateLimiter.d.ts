/**
 * Rate Limiter - Prevents abuse of the chat API
 * Uses in-memory store with TTL for rate limiting
 */
declare class RateLimiter {
    private store;
    private readonly windowMs;
    private readonly maxRequests;
    constructor(windowMs?: number, maxRequests?: number);
    /**
     * Check if request is allowed
     */
    isAllowed(key: string): boolean;
    /**
     * Get remaining requests
     */
    getRemaining(key: string): number;
    /**
     * Get reset time
     */
    getResetTime(key: string): number;
    /**
     * Cleanup old entries
     */
    private cleanup;
    /**
     * Reset for a specific key
     */
    reset(key: string): void;
}
export default RateLimiter;
//# sourceMappingURL=rateLimiter.d.ts.map