/**
 * Request Manager - Handles deduplication, retry logic, and idempotency
 * Prevents duplicate uploads and API calls, especially for network retries
 */

import {logInfo, logWarning, logError} from "./errorHandler";

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export interface RequestOptions {
  idempotencyKey?: string;
  timeout?: number;
  retryConfig?: Partial<RetryConfig>;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

// Track in-flight requests for deduplication
const inFlightRequests = new Map<string, Promise<any>>();

// Track request history for idempotency
const requestHistory = new Map<string, { result: any; timestamp: number }>();
const HISTORY_TTL_MS = 60000; // 1 minute

// Track request metrics
const requestMetrics = {
  total: 0,
  deduplicated: 0,
  cached: 0,
  retried: 0,
  failed: 0,
};

/**
 * Generate idempotency key from request data
 */
export function generateIdempotencyKey(data: any): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${Date.now()}-${Math.abs(hash)}`;
}

/**
 * Execute request with deduplication and retry logic
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: RequestOptions = {}
): Promise<T> {
  const idempotencyKey = options.idempotencyKey || generateIdempotencyKey({});
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options.retryConfig };

  requestMetrics.total++;

  // Check if request is already in flight
  if (inFlightRequests.has(idempotencyKey)) {
    requestMetrics.deduplicated++;
    logInfo(`Deduplicating request: ${idempotencyKey}`, {
      component: "RequestManager",
      action: "executeWithRetry",
      metadata: {deduplicated: true},
    });
    return inFlightRequests.get(idempotencyKey)!;
  }

  // Check request history for idempotency
  const cached = requestHistory.get(idempotencyKey);
  if (cached && Date.now() - cached.timestamp < HISTORY_TTL_MS) {
    requestMetrics.cached++;
    logInfo(`Returning cached result for: ${idempotencyKey}`, {
      component: "RequestManager",
      action: "executeWithRetry",
      metadata: {cached: true, age: Date.now() - cached.timestamp},
    });
    return cached.result;
  }

  // Execute with retry
  const promise = executeWithRetryInternal(fn, retryConfig, options.timeout, options.onRetry);
  inFlightRequests.set(idempotencyKey, promise);

  try {
    const result = await promise;
    requestHistory.set(idempotencyKey, { result, timestamp: Date.now() });
    return result;
  } catch (error) {
    requestMetrics.failed++;
    throw error;
  } finally {
    inFlightRequests.delete(idempotencyKey);
  }
}

/**
 * Internal retry logic with exponential backoff and jitter
 */
async function executeWithRetryInternal<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  timeout?: number,
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      const result = timeout
        ? await Promise.race([
            fn(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout)
            ),
          ])
        : await fn();

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < config.maxAttempts - 1) {
        requestMetrics.retried++;
        const delayMs = calculateBackoffDelay(attempt, config);
        logWarning(
          `Request attempt ${attempt + 1} failed, retrying in ${delayMs}ms`,
          lastError,
          {
            component: "RequestManager",
            action: "executeWithRetryInternal",
            metadata: {attempt: attempt + 1, maxAttempts: config.maxAttempts, delayMs},
          }
        );
        onRetry?.(attempt + 1, lastError);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  logError(`Request failed after ${config.maxAttempts} attempts`, lastError || undefined, {
    component: "RequestManager",
    action: "executeWithRetryInternal",
  });

  throw lastError || new Error("Max retries exceeded");
}

/**
 * Calculate backoff delay with exponential backoff and jitter
 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = cappedDelay * config.jitterFactor * Math.random();
  return Math.round(cappedDelay + jitter);
}

/**
 * Clear request history (useful for testing or cleanup)
 */
export function clearRequestHistory(): void {
  requestHistory.clear();
  inFlightRequests.clear();
}

/**
 * Get request statistics
 */
export function getRequestStats() {
  return {
    inFlightCount: inFlightRequests.size,
    cachedCount: requestHistory.size,
    metrics: {...requestMetrics},
  };
}

/**
 * Reset request metrics
 */
export function resetRequestMetrics(): void {
  requestMetrics.total = 0;
  requestMetrics.deduplicated = 0;
  requestMetrics.cached = 0;
  requestMetrics.retried = 0;
  requestMetrics.failed = 0;
}

