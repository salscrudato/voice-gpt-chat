/**
 * Error Recovery - Comprehensive error handling and recovery strategies
 */

export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export interface ErrorContext {
  message: string;
  code?: string;
  severity: ErrorSeverity;
  recoverable: boolean;
  action?: string;
  timestamp: number;
  context?: Record<string, any>;
}

/**
 * Classify error and determine recovery strategy
 */
export function classifyError(error: any): ErrorContext {
  const message = error?.message || String(error);
  const timestamp = Date.now();

  // Network errors
  if (message.includes("Network") || message.includes("fetch")) {
    return {
      message: "Network connection failed. Please check your internet connection.",
      code: "NETWORK_ERROR",
      severity: ErrorSeverity.HIGH,
      recoverable: true,
      action: "retry",
      timestamp,
    };
  }

  // Timeout errors
  if (message.includes("timeout") || message.includes("Timeout")) {
    return {
      message: "Request timed out. Please try again.",
      code: "TIMEOUT_ERROR",
      severity: ErrorSeverity.MEDIUM,
      recoverable: true,
      action: "retry",
      timestamp,
    };
  }

  // Authentication errors
  if (message.includes("401") || message.includes("Unauthorized")) {
    return {
      message: "Authentication failed. Please refresh and try again.",
      code: "AUTH_ERROR",
      severity: ErrorSeverity.HIGH,
      recoverable: true,
      action: "refresh",
      timestamp,
    };
  }

  // Rate limit errors
  if (message.includes("429") || message.includes("Rate limit")) {
    return {
      message: "Too many requests. Please wait a moment and try again.",
      code: "RATE_LIMIT_ERROR",
      severity: ErrorSeverity.MEDIUM,
      recoverable: true,
      action: "wait",
      timestamp,
    };
  }

  // Validation errors
  if (message.includes("400") || message.includes("Invalid")) {
    return {
      message: "Invalid request. Please check your input.",
      code: "VALIDATION_ERROR",
      severity: ErrorSeverity.LOW,
      recoverable: false,
      timestamp,
    };
  }

  // Server errors
  if (message.includes("500") || message.includes("Internal")) {
    return {
      message: "Server error. Please try again later.",
      code: "SERVER_ERROR",
      severity: ErrorSeverity.HIGH,
      recoverable: true,
      action: "retry",
      timestamp,
    };
  }

  // Service unavailable
  if (message.includes("503") || message.includes("unavailable")) {
    return {
      message: "Service temporarily unavailable. Please try again later.",
      code: "SERVICE_UNAVAILABLE",
      severity: ErrorSeverity.HIGH,
      recoverable: true,
      action: "queue",
      timestamp,
    };
  }

  // Default error
  return {
    message: "An unexpected error occurred. Please try again.",
    code: "UNKNOWN_ERROR",
    severity: ErrorSeverity.MEDIUM,
    recoverable: true,
    action: "retry",
    timestamp,
  };
}

/**
 * Get user-friendly error message
 */
export function getUserMessage(error: any): string {
  const context = classifyError(error);
  return context.message;
}

/**
 * Determine if error should be retried
 */
export function shouldRetry(error: any): boolean {
  const context = classifyError(error);
  return context.recoverable && context.action === "retry";
}

/**
 * Get retry delay based on error type
 */
export function getRetryDelay(error: any, attempt: number): number {
  const context = classifyError(error);

  if (context.code === "RATE_LIMIT_ERROR") {
    // Exponential backoff for rate limits
    return Math.min(1000 * Math.pow(2, attempt), 30000);
  }

  if (context.code === "TIMEOUT_ERROR") {
    // Shorter backoff for timeouts
    return Math.min(500 * Math.pow(1.5, attempt), 10000);
  }

  // Default backoff
  return Math.min(1000 * Math.pow(2, attempt), 30000);
}

/**
 * Log error with context
 */
export function logError(error: any, context: Record<string, any> = {}): void {
  const errorContext = classifyError(error);
  const logEntry = {
    timestamp: new Date().toISOString(),
    severity: errorContext.severity,
    code: errorContext.code,
    message: errorContext.message,
    recoverable: errorContext.recoverable,
    action: errorContext.action,
    context,
    originalError: error?.message,
  };

  console.error(JSON.stringify(logEntry));
}

/**
 * Create error recovery handler
 */
export function createErrorHandler(onError: (context: ErrorContext) => void) {
  return (error: any) => {
    const context = classifyError(error);
    logError(error, { handler: "errorHandler" });
    onError(context);
  };
}

