/**
 * Network Manager - Handles online/offline detection and network quality monitoring
 */

export interface NetworkState {
  isOnline: boolean;
  effectiveType: "4g" | "3g" | "2g" | "slow-2g" | "unknown";
  downlink: number; // Mbps
  rtt: number; // Round trip time in ms
  saveData: boolean;
  lastChecked: number;
}

export type NetworkStateListener = (state: NetworkState) => void;

class NetworkManager {
  private listeners: Set<NetworkStateListener> = new Set();
  private currentState: NetworkState;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds

  constructor() {
    this.currentState = this.getInitialState();
    this.setupListeners();
  }

  /**
   * Get initial network state
   */
  private getInitialState(): NetworkState {
    const connection = (navigator as any).connection || (navigator as any).mozConnection;
    return {
      isOnline: navigator.onLine,
      effectiveType: connection?.effectiveType || "unknown",
      downlink: connection?.downlink || 0,
      rtt: connection?.rtt || 0,
      saveData: connection?.saveData || false,
      lastChecked: Date.now(),
    };
  }

  /**
   * Setup event listeners for network changes
   */
  private setupListeners(): void {
    window.addEventListener("online", () => this.updateState());
    window.addEventListener("offline", () => this.updateState());

    const connection = (navigator as any).connection || (navigator as any).mozConnection;
    if (connection) {
      connection.addEventListener("change", () => this.updateState());
    }

    // Start periodic health checks
    this.startHealthChecks();
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Perform health check to verify connectivity
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch("/health", {
        method: "HEAD",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok && navigator.onLine) {
        console.warn("[NetworkManager] Health check failed but online status is true");
      }
    } catch (error) {
      if (navigator.onLine) {
        console.warn("[NetworkManager] Health check failed:", error);
      }
    }
  }

  /**
   * Update network state and notify listeners
   */
  private updateState(): void {
    const newState = this.getInitialState();

    if (JSON.stringify(newState) !== JSON.stringify(this.currentState)) {
      this.currentState = newState;
      console.log("[NetworkManager] Network state changed:", newState);
      this.notifyListeners();
    }
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentState);
      } catch (error) {
        console.error("[NetworkManager] Listener error:", error);
      }
    });
  }

  /**
   * Get current network state
   */
  getState(): NetworkState {
    return { ...this.currentState };
  }

  /**
   * Subscribe to network state changes
   */
  subscribe(listener: NetworkStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Check if network is suitable for uploads
   */
  isGoodForUploads(): boolean {
    return (
      this.currentState.isOnline &&
      (this.currentState.effectiveType === "4g" || this.currentState.effectiveType === "3g")
    );
  }

  /**
   * Check if network is suitable for streaming
   */
  isGoodForStreaming(): boolean {
    return this.currentState.isOnline && this.currentState.effectiveType !== "slow-2g";
  }

  /**
   * Get estimated upload time for file size
   */
  estimateUploadTime(fileSizeBytes: number): number {
    if (!this.currentState.isOnline || this.currentState.downlink === 0) {
      return Infinity;
    }
    const fileSizeMbps = (fileSizeBytes * 8) / 1000000;
    return (fileSizeMbps / this.currentState.downlink) * 1000; // ms
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.listeners.clear();
  }
}

// Singleton instance
let instance: NetworkManager | null = null;

export function getNetworkManager(): NetworkManager {
  if (!instance) {
    instance = new NetworkManager();
  }
  return instance;
}

export function destroyNetworkManager(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

