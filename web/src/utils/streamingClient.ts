/**
 * Streaming Response Optimization
 * Handles SSE streaming with proper buffering, error recovery, and connection management
 */

import {logInfo, logError, logWarning} from "./errorHandler";

export interface StreamEvent {
  type: string;
  data: any;
}

export interface StreamConfig {
  timeout?: number;
  maxBufferSize?: number;
  onEvent?: (event: StreamEvent) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

/**
 * Parse SSE stream with proper buffering
 */
export async function parseSSEStream(
  response: Response,
  config: StreamConfig = {}
): Promise<StreamEvent[]> {
  const {
    timeout = 120000,
    maxBufferSize = 1024 * 1024,
    onEvent,
    onError,
    onComplete,
  } = config;

  const events: StreamEvent[] = [];
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let bufferSize = 0;
  let lastActivityTime = Date.now();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    reader.cancel();
  }, timeout);

  try {
    while (true) {
      if (timedOut) {
        throw new Error(`Stream timeout after ${timeout}ms`);
      }

      const {value, done} = await reader.read();
      if (done) break;

      lastActivityTime = Date.now();
      const text = decoder.decode(value, {stream: true});
      buffer += text;
      bufferSize += value.length;

      // Check buffer size
      if (bufferSize > maxBufferSize) {
        throw new Error(`Stream buffer exceeded ${maxBufferSize} bytes`);
      }

      // Process complete SSE events (separated by \n\n)
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

          // Infer type from data
          if (event.data.type) {
            event.type = event.data.type;
          }

          events.push(event);
          onEvent?.(event);
        } catch (parseError) {
          logWarning("Failed to parse SSE event", parseError as Error);
        }
      }
    }

    // Process remaining buffer
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
          onEvent?.(event);
        }
      } catch (parseError) {
        logWarning("Failed to parse final SSE event", parseError as Error);
      }
    }

    onComplete?.();
    logInfo("Stream completed successfully", {
      component: "StreamingClient",
      metadata: {eventCount: events.length},
    });

    return events;
  } catch (error) {
    logError("Stream error", error as Error, {
      component: "StreamingClient",
      metadata: {bufferSize, eventCount: events.length},
    });
    onError?.(error as Error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    reader.cancel();
  }
}

/**
 * Stream with automatic reconnection
 */
export async function streamWithRetry(
  url: string,
  options: RequestInit & StreamConfig = {},
  maxRetries = 3
): Promise<StreamEvent[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await parseSSEStream(response, options);
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        logWarning(`Stream attempt ${attempt + 1} failed, retrying in ${delay}ms`, lastError);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Stream failed after all retries");
}

