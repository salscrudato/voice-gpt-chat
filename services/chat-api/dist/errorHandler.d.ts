/**
 * Error Handler - Comprehensive error handling and logging
 */
export interface ErrorResponse {
    error: string;
    code: string;
    status: number;
    timestamp: string;
    requestId?: string;
    details?: any;
}
export declare enum ErrorCode {
    INVALID_REQUEST = "INVALID_REQUEST",
    UNAUTHORIZED = "UNAUTHORIZED",
    RATE_LIMITED = "RATE_LIMITED",
    NOT_FOUND = "NOT_FOUND",
    INTERNAL_ERROR = "INTERNAL_ERROR",
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
    TIMEOUT = "TIMEOUT",
    CIRCUIT_BREAKER_OPEN = "CIRCUIT_BREAKER_OPEN"
}
/**
 * Create error response
 */
export declare function createErrorResponse(code: ErrorCode, message: string, status: number, requestId?: string, details?: any): ErrorResponse;
/**
 * Handle different error types
 */
export declare function handleError(error: any, requestId?: string): ErrorResponse;
/**
 * Log error with structured format
 */
export declare function logError(level: "error" | "warn", message: string, error: any, context?: Record<string, any>): void;
/**
 * Determine if error is retryable
 */
export declare function isRetryable(error: any): boolean;
/**
 * Get retry delay in milliseconds
 */
export declare function getRetryDelay(attempt: number, maxDelay?: number): number;
//# sourceMappingURL=errorHandler.d.ts.map