"use strict";
/**
 * Metrics collection for Chat API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsCollector = void 0;
class MetricsCollector {
    constructor() {
        this.metrics = [];
        this.maxMetrics = 10000;
        this.counters = new Map();
        this.histograms = new Map();
    }
    /**
     * Increment a counter
     */
    incrementCounter(name, value = 1, labels) {
        const key = this.getKey(name, labels);
        this.counters.set(key, (this.counters.get(key) || 0) + value);
    }
    /**
     * Record a histogram value
     */
    recordHistogram(name, value, labels) {
        const key = this.getKey(name, labels);
        if (!this.histograms.has(key)) {
            this.histograms.set(key, []);
        }
        this.histograms.get(key).push(value);
    }
    /**
     * Record a metric
     */
    recordMetric(name, value, labels) {
        const metric = {
            name,
            value,
            timestamp: new Date(),
            labels,
        };
        this.metrics.push(metric);
        if (this.metrics.length > this.maxMetrics) {
            this.metrics = this.metrics.slice(-this.maxMetrics);
        }
    }
    /**
     * Get counter value
     */
    getCounter(name, labels) {
        const key = this.getKey(name, labels);
        return this.counters.get(key) || 0;
    }
    /**
     * Get histogram statistics
     */
    getHistogramStats(name, labels) {
        const key = this.getKey(name, labels);
        const values = this.histograms.get(key);
        if (!values || values.length === 0) {
            return null;
        }
        const sorted = [...values].sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        return {
            count: sorted.length,
            sum,
            avg: sum / sorted.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)],
        };
    }
    /**
     * Get all metrics
     */
    getMetrics() {
        return [...this.metrics];
    }
    /**
     * Clear all metrics
     */
    clear() {
        this.metrics = [];
        this.counters.clear();
        this.histograms.clear();
    }
    getKey(name, labels) {
        if (!labels || Object.keys(labels).length === 0) {
            return name;
        }
        const labelStr = Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(",");
        return `${name}{${labelStr}}`;
    }
}
exports.metricsCollector = new MetricsCollector();
//# sourceMappingURL=metrics.js.map