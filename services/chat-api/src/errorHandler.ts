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

export enum ErrorCode {
  INVALID_REQUEST = "INVALID_REQUEST",
  UNAUTHORIZED = "UNAUTHORIZED",
  RATE_LIMITED = "RATE_LIMITED",
  NOT_FOUND = "NOT_FOUND",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  TIMEOUT = "TIMEOUT",
  CIRCUIT_BREAKER_OPEN = "CIRCUIT_BREAKER_OPEN",
}

/**
 * Create error response
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  requestId?: string,
  details?: any
): ErrorResponse {
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
export function handleError(error: any, requestId?: string): ErrorResponse {
  // Timeout errors
  if (error.message?.includes("timeout")) {
    return createErrorResponse(
      ErrorCode.TIMEOUT,
      "Request timed out. Please try again.",
      504,
      requestId,
      { originalMessage: error.message }
    );
  }

  // Circuit breaker errors
  if (error.message?.includes("Circuit breaker")) {
    return createErrorResponse(
      ErrorCode.CIRCUIT_BREAKER_OPEN,
      "Service temporarily unavailable. Please try again later.",
      503,
      requestId
    );
  }

  // Rate limit errors
  if (error.message?.includes("Rate limit")) {
    return createErrorResponse(
      ErrorCode.RATE_LIMITED,
      "Too many requests. Please try again later.",
      429,
      requestId
    );
  }

  // Validation errors
  if (error.message?.includes("Invalid")) {
    return createErrorResponse(
      ErrorCode.INVALID_REQUEST,
      error.message,
      400,
      requestId
    );
  }

  // Authentication errors
  if (error.message?.includes("Unauthorized") || error.message?.includes("token")) {
    return createErrorResponse(
      ErrorCode.UNAUTHORIZED,
      "Authentication failed",
      401,
      requestId
    );
  }

  // Not found errors
  if (error.message?.includes("not found") || error.status === 404) {
    return createErrorResponse(
      ErrorCode.NOT_FOUND,
      "Resource not found",
      404,
      requestId
    );
  }

  // Service unavailable
  if (error.status === 503 || error.message?.includes("unavailable")) {
    return createErrorResponse(
      ErrorCode.SERVICE_UNAVAILABLE,
      "Service temporarily unavailable",
      503,
      requestId
    );
  }

  // Default internal error
  return createErrorResponse(
    ErrorCode.INTERNAL_ERROR,
    "An unexpected error occurred",
    500,
    requestId,
    { originalMessage: error.message }
  );
}

/**
 * Log error with structured format
 */
export function logError(
  level: "error" | "warn",
  message: string,
  error: any,
  context: Record<string, any> = {}
): void {
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
export function isRetryable(error: any): boolean {
  if (!error) return false;

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
export function getRetryDelay(attempt: number, maxDelay = 30000): number {
  const exponentialDelay = Math.pow(2, attempt) * 1000;
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, maxDelay);
}

