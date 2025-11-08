/**
 * Unified HTTP Client with Retry Logic, Circuit Breaker, and Request Deduplication
 * Lean, professional implementation for enterprise-grade API communication
 */

import {logError, logInfo, logWarning} from "./errorHandler";

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
  idempotencyKey?: string;
  streaming?: boolean;
  onStreamEvent?: (event: StreamEvent) => void;
}

export interface StreamEvent {
  type: string;
  data: any;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

const DEFAULT_TIMEOUT = 30000;
const HISTORY_TTL_MS = 60000;

class CircuitBreaker {
  private failureCount = 0;
  private successCount = 0;
  private state: "closed" | "open" | "half-open" = "closed";
  private lastFailureTime = 0;

  isOpen(): boolean {
    if (this.state === "open" && Date.now() - this.lastFailureTime > 30000) {
      this.state = "half-open";
      this.successCount = 0;
      return false;
    }
    return this.state === "open";
  }

  recordSuccess(): void {
    this.failureCount = 0;
    if (this.state === "half-open" && ++this.successCount >= 2) {
      this.state = "closed";
    }
  }

  recordFailure(): void {
    this.lastFailureTime = Date.now();
    if (++this.failureCount >= 5) {
      this.state = "open";
    }
  }
}

const circuitBreakers = new Map<string, CircuitBreaker>();
const inFlightRequests = new Map<string, Promise<any>>();
const requestHistory = new Map<string, { result: any; timestamp: number }>();

function getCircuitBreaker(url: string): CircuitBreaker {
  const domain = new URL(url).hostname;
  if (!circuitBreakers.has(domain)) {
    circuitBreakers.set(domain, new CircuitBreaker());
  }
  return circuitBreakers.get(domain)!;
}

function generateRequestIdempotencyKey(url: string, options: RequestOptions): string {
  const key = `${options.method || "GET"}:${url}:${JSON.stringify(options.body || "")}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
  }
  return `${Math.abs(hash)}`;
}

function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const {initialDelayMs = 1000, maxDelayMs = 10000, backoffMultiplier = 2, jitterFactor = 0.1} = config;
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  const jitter = cappedDelay * jitterFactor * Math.random();
  return cappedDelay + jitter;
}

async function fetchWithTimeout(url: string, options: RequestOptions): Promise<Response> {
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {...options, signal: controller.signal});
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function httpClient<T = any>(url: string, options: RequestOptions = {}): Promise<T> {
  const circuitBreaker = getCircuitBreaker(url);

  if (circuitBreaker.isOpen()) {
    throw new Error("Service temporarily unavailable. Please try again later.");
  }

  const idempotencyKey = options.idempotencyKey || generateRequestIdempotencyKey(url, options);

  if (inFlightRequests.has(idempotencyKey)) {
    logInfo(`Deduplicating request: ${idempotencyKey}`);
    return inFlightRequests.get(idempotencyKey)!;
  }

  const cached = requestHistory.get(idempotencyKey);
  if (cached && Date.now() - cached.timestamp < HISTORY_TTL_MS) {
    logInfo(`Returning cached result for: ${idempotencyKey}`);
    return cached.result;
  }

  const retryConfig = {...DEFAULT_RETRY_CONFIG, ...options.retryConfig};
  const maxAttempts = retryConfig.maxAttempts || 3;
  let lastError: Error | null = null;

  const promise = (async () => {
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
            logWarning(`Retrying after ${delay}ms...`, lastError);
            options.onRetry?.(attempt + 1, lastError);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        }

        circuitBreaker.recordSuccess();

        if (options.streaming && response.body) {
          return await parseSSEStream(response, options);
        }

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
  })();

  inFlightRequests.set(idempotencyKey, promise);

  try {
    const result = await promise;
    requestHistory.set(idempotencyKey, { result, timestamp: Date.now() });
    return result;
  } finally {
    inFlightRequests.delete(idempotencyKey);
  }
}

async function parseSSEStream(response: Response, options: RequestOptions): Promise<StreamEvent[]> {
  const timeout = options.timeout || 120000;
  const maxBufferSize = 1024 * 1024;
  const events: StreamEvent[] = [];
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let bufferSize = 0;
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    reader.cancel();
  }, timeout);

  try {
    while (true) {
      if (timedOut) throw new Error(`Stream timeout after ${timeout}ms`);

      const {value, done} = await reader.read();
      if (done) break;

      const text = decoder.decode(value, {stream: true});
      buffer += text;
      bufferSize += value.length;

      if (bufferSize > maxBufferSize) {
        throw new Error(`Stream buffer exceeded ${maxBufferSize} bytes`);
      }

      const parts = buffer.split("\n\n");
      buffer = parts[parts.length - 1];

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i].trim();
        if (!part || !part.startsWith("data:")) continue;

        try {
          const jsonStr = part.slice(5).trim();
          if (!jsonStr) continue;

          const event: StreamEvent = {
            type: "unknown",
            data: JSON.parse(jsonStr),
          };

          if (event.data.type) event.type = event.data.type;
          events.push(event);
          options.onStreamEvent?.(event);
        } catch (parseError) {
          logWarning("Failed to parse SSE event", parseError as Error);
        }
      }
    }

    if (buffer.trim()) {
      try {
        const jsonStr = buffer.replace(/^data:\s*/, "").trim();
        if (jsonStr) {
          const event: StreamEvent = {
            type: "unknown",
            data: JSON.parse(jsonStr),
          };
          if (event.data.type) event.type = event.data.type;
          events.push(event);
          options.onStreamEvent?.(event);
        }
      } catch (parseError) {
        logWarning("Failed to parse final SSE event", parseError as Error);
      }
    }

    return events;
  } finally {
    clearTimeout(timeoutId);
    reader.cancel();
  }
}

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

  stream: <T = any>(url: string, body?: any, options?: RequestOptions) =>
    httpClient<T>(url, {
      ...options,
      method: "POST",
      streaming: true,
      headers: {"Content-Type": "application/json", ...options?.headers},
      body: JSON.stringify(body),
    }),
};

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: {idempotencyKey?: string; timeout?: number; retryConfig?: Partial<RetryConfig>} = {}
): Promise<T> {
  const idempotencyKey = options.idempotencyKey || `${Date.now()}-${Math.random()}`;

  if (inFlightRequests.has(idempotencyKey)) {
    return inFlightRequests.get(idempotencyKey)!;
  }

  const cached = requestHistory.get(idempotencyKey);
  if (cached && Date.now() - cached.timestamp < HISTORY_TTL_MS) {
    return cached.result;
  }

  const promise = fn();
  inFlightRequests.set(idempotencyKey, promise);

  try {
    const result = await promise;
    requestHistory.set(idempotencyKey, { result, timestamp: Date.now() });
    return result;
  } finally {
    inFlightRequests.delete(idempotencyKey);
  }
}

export function clearRequestCache(): void {
  requestHistory.clear();
  inFlightRequests.clear();
}

export function getRequestStats() {
  return {
    inFlightCount: inFlightRequests.size,
    cachedCount: requestHistory.size,
  };
}

export function generateIdempotencyKeyPublic(data: any): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
  }
  return `${Date.now()}-${Math.abs(hash)}`;
}

// Alias for backward compatibility
export const generateIdempotencyKey = generateIdempotencyKeyPublic;

