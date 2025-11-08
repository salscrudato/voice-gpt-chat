/**
 * Unified Monitoring Service
 * Enterprise-grade performance metrics, error tracking, and system monitoring
 */

import {logInfo} from "./errorHandler";

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface ErrorMetric {
  code: string;
  message: string;
  count: number;
  lastOccurrence: number;
}

export interface SystemMetrics {
  uptime: number;
  memoryUsage?: number;
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
}

export interface PerformanceMetrics {
  recordingDuration: number;
  uploadDuration: number;
  transcriptionDuration: number;
  chatResponseDuration: number;
  networkLatency: number;
  audioQualityScore: number;
  timestamp: number;
}

class MonitoringService {
  private metrics: PerformanceMetric[] = [];
  private errors: Map<string, ErrorMetric> = new Map();
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private maxMetricsSize = 1000;
  private timers: Map<string, number> = new Map();
  private listeners: Set<(metrics: PerformanceMetrics) => void> = new Set();

  /**
   * Record performance metric
   */
  recordMetric(name: string, duration: number, tags?: Record<string, string>): void {
    const metric: PerformanceMetric = {
      name,
      duration,
      timestamp: Date.now(),
      tags,
    };

    this.metrics.push(metric);

    if (this.metrics.length > this.maxMetricsSize) {
      this.metrics = this.metrics.slice(-this.maxMetricsSize);
    }

    logInfo(`Metric recorded: ${name}`, {
      component: "MonitoringService",
      metadata: {duration, tags},
    });
  }

  /**
   * Record error metric
   */
  recordError(code: string, message: string): void {
    this.errorCount++;
    const existing = this.errors.get(code);

    if (existing) {
      existing.count++;
      existing.lastOccurrence = Date.now();
    } else {
      this.errors.set(code, {
        code,
        message,
        count: 1,
        lastOccurrence: Date.now(),
      });
    }
  }

  /**
   * Record API call
   */
  recordAPICall(endpoint: string, method: string, statusCode: number, duration: number): void {
    this.requestCount++;
    if (statusCode >= 400) {
      this.errorCount++;
    }

    this.recordMetric(`api_${method}_${endpoint}`, duration, {
      endpoint,
      method,
      statusCode: String(statusCode),
    });
  }

  /**
   * Start timing an operation
   */
  startTimer(label: string): void {
    this.timers.set(label, performance.now());
  }

  /**
   * End timing and record metric
   */
  endTimer(label: string, metadata: Partial<PerformanceMetrics> = {}): number {
    const startTime = this.timers.get(label);
    if (!startTime) {
      console.warn(`Timer "${label}" not started`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(label);

    const metric: PerformanceMetrics = {
      recordingDuration: 0,
      uploadDuration: 0,
      transcriptionDuration: 0,
      chatResponseDuration: 0,
      networkLatency: 0,
      audioQualityScore: 0,
      timestamp: Date.now(),
      ...metadata,
      [this.getLabelKey(label)]: duration,
    };

    this.notifyListeners(metric);
    return duration;
  }

  /**
   * Get system metrics
   */
  getSystemMetrics(): SystemMetrics {
    const uptime = Date.now() - this.startTime;
    const avgResponseTime = this.metrics.length > 0
      ? this.metrics.reduce((sum, m) => sum + m.duration, 0) / this.metrics.length
      : 0;

    return {
      uptime,
      memoryUsage: (performance as any).memory?.usedJSHeapSize,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      averageResponseTime: avgResponseTime,
    };
  }

  /**
   * Get error metrics
   */
  getErrorMetrics(): ErrorMetric[] {
    return Array.from(this.errors.values());
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(limit = 100): PerformanceMetric[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Get metrics by name
   */
  getMetricsByName(name: string): PerformanceMetric[] {
    return this.metrics.filter((m) => m.name === name);
  }

  /**
   * Get average duration for a metric
   */
  getAverageDuration(key: keyof PerformanceMetrics): number {
    if (this.metrics.length === 0) return 0;
    const sum = this.metrics.reduce((acc, m) => acc + ((m as any)[key] as number || 0), 0);
    return sum / this.metrics.length;
  }

  /**
   * Subscribe to metric updates
   */
  subscribe(listener: (metric: PerformanceMetrics) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Export metrics as JSON
   */
  exportMetrics(): {
    system: SystemMetrics;
    errors: ErrorMetric[];
    performance: PerformanceMetric[];
  } {
    return {
      system: this.getSystemMetrics(),
      errors: this.getErrorMetrics(),
      performance: this.getPerformanceMetrics(),
    };
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.errors.clear();
    this.requestCount = 0;
    this.errorCount = 0;
    this.timers.clear();
  }

  /**
   * Reset start time
   */
  resetUptime(): void {
    this.startTime = Date.now();
  }

  /**
   * Convert label to metric key
   */
  private getLabelKey(label: string): keyof PerformanceMetrics {
    const keyMap: Record<string, keyof PerformanceMetrics> = {
      recording: "recordingDuration",
      upload: "uploadDuration",
      transcription: "transcriptionDuration",
      chat: "chatResponseDuration",
      network: "networkLatency",
      quality: "audioQualityScore",
    };

    return keyMap[label] || ("recordingDuration" as keyof PerformanceMetrics);
  }

  /**
   * Notify listeners
   */
  private notifyListeners(metric: PerformanceMetrics): void {
    this.listeners.forEach(listener => listener(metric));
  }
}

export const monitoring = new MonitoringService();

/**
 * Measure async function execution time
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  tags?: Record<string, string>
): Promise<T> {
  const startTime = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - startTime;
    monitoring.recordMetric(name, duration, tags);
  }
}

/**
 * Measure sync function execution time
 */
export function measureSync<T>(
  name: string,
  fn: () => T,
  tags?: Record<string, string>
): T {
  const startTime = performance.now();
  try {
    return fn();
  } finally {
    const duration = performance.now() - startTime;
    monitoring.recordMetric(name, duration, tags);
  }
}

