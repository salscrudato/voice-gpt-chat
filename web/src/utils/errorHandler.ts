/**
 * Unified Error Handler and Logger
 * Comprehensive error handling, logging, classification, and recovery strategies
 */

export enum ErrorSeverity {
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  CRITICAL = "critical",
}

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
  code?: string;
  message?: string;
  severity?: ErrorSeverity;
  recoverable?: boolean;
  retryAction?: "retry" | "wait" | "queue" | "refresh";
}

export interface LogEntry {
  timestamp: string;
  severity: ErrorSeverity;
  message: string;
  error?: Error;
  context?: ErrorContext;
  stack?: string;
}

class ErrorHandler {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  /**
   * Log a message with context
   */
  log(
    message: string,
    severity: ErrorSeverity = ErrorSeverity.INFO,
    error?: Error,
    context?: ErrorContext
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      severity,
      message,
      error,
      context,
      stack: error?.stack,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    const consoleMethod = severity === ErrorSeverity.CRITICAL ? "error" : severity;
    const method = consoleMethod as keyof typeof console;
    if (method in console) {
      (console[method] as any)(`[${severity.toUpperCase()}] ${message}`, {
        error,
        context,
      });
    }
  }

  /**
   * Classify error and determine recovery strategy
   */
  classifyError(error: any): ErrorContext {
    const message = error?.message || String(error);
    const code = error?.code || "UNKNOWN_ERROR";

    // Network errors
    if (message.includes("Network") || message.includes("fetch")) {
      return {
        code: "NETWORK_ERROR",
        message: "Network connection failed. Please check your internet connection.",
        severity: ErrorSeverity.ERROR,
        recoverable: true,
        retryAction: "retry",
      };
    }

    // Timeout errors
    if (message.includes("timeout") || message.includes("Timeout")) {
      return {
        code: "TIMEOUT_ERROR",
        message: "Request timed out. Please try again.",
        severity: ErrorSeverity.WARNING,
        recoverable: true,
        retryAction: "retry",
      };
    }

    // Authentication errors
    if (message.includes("401") || message.includes("Unauthorized")) {
      return {
        code: "AUTH_ERROR",
        message: "Authentication failed. Please refresh and try again.",
        severity: ErrorSeverity.ERROR,
        recoverable: true,
        retryAction: "refresh",
      };
    }

    // Rate limit errors
    if (message.includes("429") || message.includes("Rate limit")) {
      return {
        code: "RATE_LIMIT_ERROR",
        message: "Too many requests. Please wait a moment and try again.",
        severity: ErrorSeverity.WARNING,
        recoverable: true,
        retryAction: "wait",
      };
    }

    // Validation errors
    if (message.includes("400") || message.includes("Invalid")) {
      return {
        code: "VALIDATION_ERROR",
        message: "Invalid request. Please check your input.",
        severity: ErrorSeverity.WARNING,
        recoverable: false,
      };
    }

    // Server errors
    if (message.includes("500") || message.includes("Internal")) {
      return {
        code: "SERVER_ERROR",
        message: "Server error. Please try again later.",
        severity: ErrorSeverity.ERROR,
        recoverable: true,
        retryAction: "retry",
      };
    }

    // Service unavailable
    if (message.includes("503") || message.includes("unavailable")) {
      return {
        code: "SERVICE_UNAVAILABLE",
        message: "Service temporarily unavailable. Please try again later.",
        severity: ErrorSeverity.ERROR,
        recoverable: true,
        retryAction: "queue",
      };
    }

    return {
      code,
      message: "An unexpected error occurred. Please try again.",
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      retryAction: "retry",
    };
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(error: any): string {
    const context = this.classifyError(error);
    return context.message || "An unexpected error occurred";
  }

  /**
   * Determine if error should be retried
   */
  shouldRetry(error: any): boolean {
    const context = this.classifyError(error);
    return (context.recoverable ?? false) && context.retryAction === "retry";
  }

  /**
   * Get retry delay based on error type
   */
  getRetryDelay(error: any, attempt: number): number {
    const context = this.classifyError(error);

    if (context.code === "RATE_LIMIT_ERROR") {
      return Math.min(1000 * Math.pow(2, attempt), 30000);
    }

    if (context.code === "TIMEOUT_ERROR") {
      return Math.min(500 * Math.pow(1.5, attempt), 10000);
    }

    return Math.min(1000 * Math.pow(2, attempt), 30000);
  }

  /**
   * Get all logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Export logs for debugging
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const errorHandler = new ErrorHandler();

/**
 * Convenience functions
 */
export const logInfo = (msg: string, ctx?: ErrorContext) =>
  errorHandler.log(msg, ErrorSeverity.INFO, undefined, ctx);

export const logWarning = (msg: string, error?: Error, ctx?: ErrorContext) =>
  errorHandler.log(msg, ErrorSeverity.WARNING, error, ctx);

export const logError = (msg: string, error?: Error, ctx?: ErrorContext) =>
  errorHandler.log(msg, ErrorSeverity.ERROR, error, ctx);

export const logCritical = (msg: string, error?: Error, ctx?: ErrorContext) =>
  errorHandler.log(msg, ErrorSeverity.CRITICAL, error, ctx);

export const classifyError = (error: any) => errorHandler.classifyError(error);
export const shouldRetry = (error: any) => errorHandler.shouldRetry(error);
export const getRetryDelay = (error: any, attempt: number) => errorHandler.getRetryDelay(error, attempt);

