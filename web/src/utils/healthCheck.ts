/**
 * Health Check and Circuit Breaker Service
 * Monitors external services and implements circuit breaker pattern
 */

import {logInfo, logWarning, logError} from "./errorHandler";

export enum ServiceStatus {
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  UNHEALTHY = "unhealthy",
}

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  lastCheck: number;
  responseTime: number;
  failureCount: number;
  successCount: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
}

class CircuitBreaker {
  private status: ServiceStatus = ServiceStatus.HEALTHY;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      successThreshold: config.successThreshold || 2,
      timeout: config.timeout || 60000,
    };
  }

  /**
   * Record success
   */
  recordSuccess(): void {
    this.successCount++;
    if (this.status === ServiceStatus.DEGRADED && this.successCount >= this.config.successThreshold) {
      this.status = ServiceStatus.HEALTHY;
      this.failureCount = 0;
      this.successCount = 0;
      logInfo("Circuit breaker recovered to HEALTHY");
    }
  }

  /**
   * Record failure
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.config.failureThreshold) {
      this.status = ServiceStatus.DEGRADED;
      logWarning(`Circuit breaker opened after ${this.failureCount} failures`);
    }
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    if (this.status === ServiceStatus.DEGRADED) {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure > this.config.timeout) {
        this.status = ServiceStatus.HEALTHY;
        this.failureCount = 0;
        this.successCount = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Get status
   */
  getStatus(): ServiceStatus {
    return this.status;
  }
}

class HealthChecker {
  private services = new Map<string, {breaker: CircuitBreaker; health: ServiceHealth}>();

  /**
   * Register service
   */
  registerService(name: string, config?: Partial<CircuitBreakerConfig>): void {
    this.services.set(name, {
      breaker: new CircuitBreaker(config),
      health: {
        name,
        status: ServiceStatus.HEALTHY,
        lastCheck: 0,
        responseTime: 0,
        failureCount: 0,
        successCount: 0,
      },
    });
  }

  /**
   * Check service health
   */
  async checkHealth(name: string, checkFn: () => Promise<void>): Promise<ServiceHealth> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not registered`);
    }

    const startTime = Date.now();

    try {
      if (service.breaker.isOpen()) {
        service.health.status = ServiceStatus.DEGRADED;
        throw new Error("Circuit breaker is open");
      }

      await checkFn();
      service.breaker.recordSuccess();
      service.health.status = ServiceStatus.HEALTHY;
      service.health.successCount++;
    } catch (error) {
      service.breaker.recordFailure();
      service.health.status = service.breaker.getStatus();
      service.health.failureCount++;
      logError(`Health check failed for ${name}`, error as Error);
    }

    service.health.responseTime = Date.now() - startTime;
    service.health.lastCheck = Date.now();

    return {...service.health};
  }

  /**
   * Get all service health
   */
  getAllHealth(): ServiceHealth[] {
    return Array.from(this.services.values()).map((s) => ({...s.health}));
  }

  /**
   * Get service health
   */
  getHealth(name: string): ServiceHealth | null {
    return this.services.get(name)?.health || null;
  }
}

export const healthChecker = new HealthChecker();

