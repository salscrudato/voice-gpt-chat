/**
 * Unified HTTP Client with Retry Logic and Circuit Breaker
 * Provides centralized API communication with automatic retries, error handling, and circuit breaking
 */

import {logError, logInfo, shouldRetry, getRetryDelay} from "./errorHandler";

export interface RetryConfig {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitterFactor?: number;
}

export interface RequestOptions extends RequestInit {
  timeout?: number;
  retryConfig?: RetryConfig;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Simple circuit breaker for HTTP endpoints
 */
class CircuitBreaker {
  private failureCount = 0;
  private successCount = 0;
  private state: "closed" | "open" | "half-open" = "closed";
  private lastFailureTime = 0;
  private readonly failureThreshold = 5;
  private readonly successThreshold = 2;
  private readonly resetTimeoutMs = 30000; // 30 seconds

  isOpen(): boolean {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = "half-open";
        this.successCount = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    if (this.state === "half-open") {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = "closed";
      }
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = "open";
    }
  }

  getState(): string {
    return this.state;
  }
}

const circuitBreakers = new Map<string, CircuitBreaker>();

function getCircuitBreaker(url: string): CircuitBreaker {
  const domain = new URL(url).hostname;
  if (!circuitBreakers.has(domain)) {
    circuitBreakers.set(domain, new CircuitBreaker());
  }
  return circuitBreakers.get(domain)!;
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig
): number {
  const {initialDelayMs = 1000, maxDelayMs = 10000, backoffMultiplier = 2, jitterFactor = 0.1} = config;
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  const jitter = cappedDelay * jitterFactor * Math.random();
  return cappedDelay + jitter;
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestOptions
): Promise<Response> {
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * HTTP Client with automatic retries and circuit breaker
 */
export async function httpClient<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const circuitBreaker = getCircuitBreaker(url);

  // Check circuit breaker state
  if (circuitBreaker.isOpen()) {
    throw new Error(`Service temporarily unavailable (circuit breaker open). Please try again later.`);
  }

  const retryConfig = {...DEFAULT_RETRY_CONFIG, ...options.retryConfig};
  const maxAttempts = retryConfig.maxAttempts || 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      logInfo(`HTTP ${options.method || "GET"} ${url} (attempt ${attempt + 1}/${maxAttempts})`);

      const response = await fetchWithTimeout(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        const isRetryable = response.status >= 500 || response.status === 429;

        if (isRetryable && attempt < maxAttempts - 1) {
          lastError = new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
          const delay = calculateBackoffDelay(attempt, retryConfig);
          logInfo(`Retrying after ${delay}ms...`);
          options.onRetry?.(attempt + 1, lastError);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }

      // Success - record in circuit breaker
      circuitBreaker.recordSuccess();

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        return await response.json();
      }
      return (await response.text()) as any;
    } catch (error: any) {
      lastError = error;

      if (error.name === "AbortError") {
        circuitBreaker.recordFailure();
        throw new Error(`Request timeout after ${options.timeout || DEFAULT_TIMEOUT}ms`);
      }

      if (attempt === maxAttempts - 1) {
        circuitBreaker.recordFailure();
        logError(`HTTP request failed after ${maxAttempts} attempts`, error);
        throw error;
      }

      const delay = calculateBackoffDelay(attempt, retryConfig);
      options.onRetry?.(attempt + 1, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  circuitBreaker.recordFailure();
  throw lastError || new Error("HTTP request failed");
}

/**
 * Convenience methods
 */
export const http = {
  get: <T = any>(url: string, options?: RequestOptions) =>
    httpClient<T>(url, {...options, method: "GET"}),

  post: <T = any>(url: string, body?: any, options?: RequestOptions) =>
    httpClient<T>(url, {
      ...options,
      method: "POST",
      headers: {"Content-Type": "application/json", ...options?.headers},
      body: JSON.stringify(body),
    }),

  put: <T = any>(url: string, body?: any, options?: RequestOptions) =>
    httpClient<T>(url, {
      ...options,
      method: "PUT",
      headers: {"Content-Type": "application/json", ...options?.headers},
      body: JSON.stringify(body),
    }),

  delete: <T = any>(url: string, options?: RequestOptions) =>
    httpClient<T>(url, {...options, method: "DELETE"}),
};

