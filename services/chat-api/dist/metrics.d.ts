/**
 * Metrics collection for Chat API
 */
export interface Metric {
    name: string;
    value: number;
    timestamp: Date;
    labels?: Record<string, string>;
}
declare class MetricsCollector {
    private metrics;
    private readonly maxMetrics;
    private counters;
    private histograms;
    /**
     * Increment a counter
     */
    incrementCounter(name: string, value?: number, labels?: Record<string, string>): void;
    /**
     * Record a histogram value
     */
    recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
    /**
     * Record a metric
     */
    recordMetric(name: string, value: number, labels?: Record<string, string>): void;
    /**
     * Get counter value
     */
    getCounter(name: string, labels?: Record<string, string>): number;
    /**
     * Get histogram statistics
     */
    getHistogramStats(name: string, labels?: Record<string, string>): {
        count: number;
        sum: number;
        avg: number;
        min: number;
        max: number;
        p50: number;
        p95: number;
        p99: number;
    } | null;
    /**
     * Get all metrics
     */
    getMetrics(): Metric[];
    /**
     * Clear all metrics
     */
    clear(): void;
    private getKey;
}
export declare const metricsCollector: MetricsCollector;
export {};
//# sourceMappingURL=metrics.d.ts.map