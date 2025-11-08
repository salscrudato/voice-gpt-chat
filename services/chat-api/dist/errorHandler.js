"use strict";
/**
 * Error Handler - Comprehensive error handling and logging
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCode = void 0;
exports.createErrorResponse = createErrorResponse;
exports.handleError = handleError;
exports.logError = logError;
exports.isRetryable = isRetryable;
exports.getRetryDelay = getRetryDelay;
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["INVALID_REQUEST"] = "INVALID_REQUEST";
    ErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
    ErrorCode["RATE_LIMITED"] = "RATE_LIMITED";
    ErrorCode["NOT_FOUND"] = "NOT_FOUND";
    ErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    ErrorCode["SERVICE_UNAVAILABLE"] = "SERVICE_UNAVAILABLE";
    ErrorCode["TIMEOUT"] = "TIMEOUT";
    ErrorCode["CIRCUIT_BREAKER_OPEN"] = "CIRCUIT_BREAKER_OPEN";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
/**
 * Create error response
 */
function createErrorResponse(code, message, status, requestId, details) {
    return {
        error: message,
        code,
        status,
        timestamp: new Date().toISOString(),
        requestId,
        details,
    };
}
/**
 * Handle different error types
 */
function handleError(error, requestId) {
    // Timeout errors
    if (error.message?.includes("timeout")) {
        return createErrorResponse(ErrorCode.TIMEOUT, "Request timed out. Please try again.", 504, requestId, { originalMessage: error.message });
    }
    // Circuit breaker errors
    if (error.message?.includes("Circuit breaker")) {
        return createErrorResponse(ErrorCode.CIRCUIT_BREAKER_OPEN, "Service temporarily unavailable. Please try again later.", 503, requestId);
    }
    // Rate limit errors
    if (error.message?.includes("Rate limit")) {
        return createErrorResponse(ErrorCode.RATE_LIMITED, "Too many requests. Please try again later.", 429, requestId);
    }
    // Validation errors
    if (error.message?.includes("Invalid")) {
        return createErrorResponse(ErrorCode.INVALID_REQUEST, error.message, 400, requestId);
    }
    // Authentication errors
    if (error.message?.includes("Unauthorized") || error.message?.includes("token")) {
        return createErrorResponse(ErrorCode.UNAUTHORIZED, "Authentication failed", 401, requestId);
    }
    // Not found errors
    if (error.message?.includes("not found") || error.status === 404) {
        return createErrorResponse(ErrorCode.NOT_FOUND, "Resource not found", 404, requestId);
    }
    // Service unavailable
    if (error.status === 503 || error.message?.includes("unavailable")) {
        return createErrorResponse(ErrorCode.SERVICE_UNAVAILABLE, "Service temporarily unavailable", 503, requestId);
    }
    // Default internal error
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, "An unexpected error occurred", 500, requestId, { originalMessage: error.message });
}
/**
 * Log error with structured format
 */
function logError(level, message, error, context = {}) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        error: {
            message: error?.message,
            code: error?.code,
            stack: error?.stack?.split("\n").slice(0, 3),
        },
        ...context,
    };
    console.log(JSON.stringify(logEntry));
}
/**
 * Determine if error is retryable
 */
function isRetryable(error) {
    if (!error)
        return false;
    const retryableMessages = [
        "timeout",
        "ECONNREFUSED",
        "ECONNRESET",
        "ETIMEDOUT",
        "temporarily unavailable",
        "service unavailable",
    ];
    const message = error.message?.toLowerCase() || "";
    return retryableMessages.some(msg => message.includes(msg));
}
/**
 * Get retry delay in milliseconds
 */
function getRetryDelay(attempt, maxDelay = 30000) {
    const exponentialDelay = Math.pow(2, attempt) * 1000;
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, maxDelay);
}
//# sourceMappingURL=errorHandler.js.map