/**
 * Offline Queue Manager - Handles queuing operations when offline
 * Automatically retries when connection is restored
 */

export interface QueuedOperation {
  id: string;
  type: "upload" | "chat" | "delete";
  timestamp: number;
  data: any;
  retries: number;
  maxRetries: number;
}

class OfflineQueueManager {
  private queue: Map<string, QueuedOperation> = new Map();
  private readonly STORAGE_KEY = "voicegpt_offline_queue";
  private readonly MAX_QUEUE_SIZE = 100;
  private listeners: Set<(queue: QueuedOperation[]) => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Add operation to queue
   */
  enqueue(operation: Omit<QueuedOperation, "id" | "timestamp" | "retries">): string {
    if (this.queue.size >= this.MAX_QUEUE_SIZE) {
      throw new Error("Queue is full");
    }

    const id = `${operation.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const queuedOp: QueuedOperation = {
      id,
      timestamp: Date.now(),
      retries: 0,
      ...operation,
    };

    this.queue.set(id, queuedOp);
    this.saveToStorage();
    this.notifyListeners();

    return id;
  }

  /**
   * Remove operation from queue
   */
  dequeue(id: string): void {
    this.queue.delete(id);
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Get all queued operations
   */
  getAll(): QueuedOperation[] {
    return Array.from(this.queue.values());
  }

  /**
   * Get operations by type
   */
  getByType(type: QueuedOperation["type"]): QueuedOperation[] {
    return Array.from(this.queue.values()).filter(op => op.type === type);
  }

  /**
   * Increment retry count
   */
  incrementRetry(id: string): void {
    const op = this.queue.get(id);
    if (op) {
      op.retries++;
      if (op.retries > op.maxRetries) {
        this.dequeue(id);
      } else {
        this.saveToStorage();
      }
    }
  }

  /**
   * Clear all queued operations
   */
  clear(): void {
    this.queue.clear();
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(listener: (queue: QueuedOperation[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Save queue to localStorage
   */
  private saveToStorage(): void {
    try {
      const data = Array.from(this.queue.values());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error("Failed to save offline queue:", error);
    }
  }

  /**
   * Load queue from localStorage
   */
  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const operations: QueuedOperation[] = JSON.parse(data);
        operations.forEach(op => this.queue.set(op.id, op));
      }
    } catch (error) {
      console.error("Failed to load offline queue:", error);
    }
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    const queue = this.getAll();
    this.listeners.forEach(listener => listener(queue));
  }

  /**
   * Get queue size
   */
  getSize(): number {
    return this.queue.size;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.size === 0;
  }
}

// Singleton instance
let instance: OfflineQueueManager | null = null;

export function getOfflineQueueManager(): OfflineQueueManager {
  if (!instance) {
    instance = new OfflineQueueManager();
  }
  return instance;
}

export default OfflineQueueManager;

