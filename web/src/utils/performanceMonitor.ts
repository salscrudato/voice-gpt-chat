/**
 * Performance Monitor - Tracks application performance metrics
 */

export interface PerformanceMetrics {
  recordingDuration: number;
  uploadDuration: number;
  transcriptionDuration: number;
  chatResponseDuration: number;
  networkLatency: number;
  audioQualityScore: number;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private readonly MAX_METRICS = 100;
  private timers: Map<string, number> = new Map();
  private listeners: Set<(metrics: PerformanceMetrics) => void> = new Set();

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

    this.recordMetric(metric);
    return duration;
  }

  /**
   * Record a metric
   */
  recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift();
    }

    this.notifyListeners(metric);
  }

  /**
   * Get average duration for a metric
   */
  getAverageDuration(key: keyof PerformanceMetrics): number {
    if (this.metrics.length === 0) return 0;

    const sum = this.metrics.reduce((acc, m) => acc + (m[key] as number || 0), 0);
    return sum / this.metrics.length;
  }

  /**
   * Get all metrics
   */
  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Get metrics summary
   */
  getSummary(): Record<string, number> {
    return {
      avgRecordingDuration: this.getAverageDuration("recordingDuration"),
      avgUploadDuration: this.getAverageDuration("uploadDuration"),
      avgTranscriptionDuration: this.getAverageDuration("transcriptionDuration"),
      avgChatResponseDuration: this.getAverageDuration("chatResponseDuration"),
      avgNetworkLatency: this.getAverageDuration("networkLatency"),
      avgAudioQualityScore: this.getAverageDuration("audioQualityScore"),
      totalMetrics: this.metrics.length,
    };
  }

  /**
   * Subscribe to metric updates
   */
  subscribe(listener: (metric: PerformanceMetrics) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.timers.clear();
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

// Singleton instance
let instance: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!instance) {
    instance = new PerformanceMonitor();
  }
  return instance;
}

export default PerformanceMonitor;

