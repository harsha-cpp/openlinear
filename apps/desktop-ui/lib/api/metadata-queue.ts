import { API_URL, getAuthHeader } from './client';

export interface ExecutionMetadataSync {
  version?: string;
  taskId: string;
  runId: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  branch?: string;
  commitSha?: string;
  prUrl?: string;
  prNumber?: number;
  outcome?: string;
  errorCategory?: string;
}

export interface QueuedMetadataEvent {
  id: string;
  timestamp: number;
  retryCount: number;
  payload: ExecutionMetadataSync;
}

const QUEUE_STORAGE_KEY = 'openlinear-metadata-queue';
const MAX_RETRIES = 10;
const BASE_BACKOFF_MS = 1000;

export type SyncStatus = 'idle' | 'pending' | 'syncing' | 'synced' | 'error';

export interface TaskSyncState {
  status: SyncStatus;
  lastError?: string;
  pendingCount: number;
}

export class MetadataQueue {
  private queue: QueuedMetadataEvent[] = [];
  private isProcessing = false;
  private syncTimeout: NodeJS.Timeout | null = null;
  private listeners: Set<(state: Record<string, TaskSyncState>) => void> = new Set();
  private taskStates: Record<string, TaskSyncState> = {};
  
  // For testing
  public fetchFn: typeof fetch = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch;
  public localStorageMock: Record<string, string> = {};

  constructor() {
    this.loadQueue();
    if (this.queue.length > 0) {
      this.updateTaskStates();
      this.scheduleSync(1000);
    }
  }

  private getStorageItem(key: string): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(key);
    }
    return this.localStorageMock[key] || null;
  }

  private setStorageItem(key: string, value: string) {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, value);
    } else {
      this.localStorageMock[key] = value;
    }
  }

  private loadQueue() {
    try {
      const stored = this.getStorageItem(QUEUE_STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (err) {
      console.error('Failed to load metadata queue', err);
    }
  }

  private saveQueue() {
    try {
      this.setStorageItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch (err) {
      console.error('Failed to save metadata queue', err);
    }
  }

  public subscribe(listener: (state: Record<string, TaskSyncState>) => void) {
    this.listeners.add(listener);
    listener(this.taskStates);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.taskStates));
  }

  private updateTaskStates(errorTaskId?: string, errorMessage?: string) {
    const newStates: Record<string, TaskSyncState> = {};
    
    // Count pending items per task
    for (const event of this.queue) {
      const taskId = event.payload.taskId;
      if (!newStates[taskId]) {
        newStates[taskId] = { status: 'pending', pendingCount: 0 };
      }
      newStates[taskId].pendingCount++;
    }

    // Apply errors or syncing status
    for (const taskId in newStates) {
      if (taskId === errorTaskId) {
        newStates[taskId].status = 'error';
        newStates[taskId].lastError = errorMessage || 'Sync failed. Retrying...';
      } else if (this.isProcessing && this.queue[0]?.payload.taskId === taskId) {
        newStates[taskId].status = 'syncing';
      }
    }

    this.taskStates = newStates;
    this.notifyListeners();
  }

  private generateDedupeKey(payload: ExecutionMetadataSync): string {
    // Dedupe based on taskId, runId, and status/phase
    return `${payload.taskId}:${payload.runId}:${payload.status}`;
  }

  public enqueue(payload: ExecutionMetadataSync) {
    const dedupeKey = this.generateDedupeKey(payload);
    
    // Check if we already have this exact event in the queue
    const existingIndex = this.queue.findIndex(e => this.generateDedupeKey(e.payload) === dedupeKey);
    
    if (existingIndex >= 0) {
      // Update existing event with latest payload (in case other fields changed)
      this.queue[existingIndex].payload = payload;
      this.queue[existingIndex].timestamp = Date.now();
      this.queue[existingIndex].retryCount = 0;
    } else {
      // Add new event
      this.queue.push({
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        timestamp: Date.now(),
        retryCount: 0,
        payload
      });
    }
    
    this.saveQueue();
    this.updateTaskStates();
    this.scheduleSync(100); // Try to sync almost immediately
  }

  private scheduleSync(delayMs: number) {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    this.syncTimeout = setTimeout(() => this.processQueue(), delayMs);
  }

  public async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    this.updateTaskStates();
    
    try {
      // Process one item at a time to maintain order and handle errors cleanly
      const event = this.queue[0];
      
      if (event.retryCount >= MAX_RETRIES) {
        console.warn(`Dropping metadata event after ${MAX_RETRIES} retries:`, event);
        this.queue.shift();
        this.saveQueue();
        this.isProcessing = false;
        this.updateTaskStates();
        this.scheduleSync(100);
        return;
      }

      const success = await this.syncEvent(event.payload);
      
      if (success) {
        // Remove from queue on success
        this.queue.shift();
        this.saveQueue();
        this.isProcessing = false;
        this.updateTaskStates();
        // Process next item immediately
        this.scheduleSync(100);
      } else {
        // Handle failure with exponential backoff
        event.retryCount++;
        this.saveQueue();
        this.isProcessing = false;
        this.updateTaskStates(event.payload.taskId, 'Network error. Retrying...');
        
        const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, event.retryCount), 60000);
        this.scheduleSync(backoffMs);
      }
    } catch (err) {
      console.error('Error processing metadata queue', err);
      this.isProcessing = false;
      this.updateTaskStates(this.queue[0]?.payload.taskId, 'Unexpected error. Retrying...');
      this.scheduleSync(5000);
    }
  }

  private async syncEvent(payload: ExecutionMetadataSync): Promise<boolean> {
    try {
      let endpoint = '/api/execution/metadata/progress';
      const serverPayload = { ...payload };
      
      if (payload.status === 'starting') {
        endpoint = '/api/execution/metadata/start';
        serverPayload.status = 'running';
      } else if (['completed', 'failed', 'cancelled'].includes(payload.status)) {
        endpoint = '/api/execution/metadata/finish';
      }

      const res = await this.fetchFn(`${API_URL}${endpoint}`, {
        method: endpoint === '/api/execution/metadata/progress' ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify(serverPayload),
      });

      // If 400 or 401, we might want to drop it or handle it differently, 
      // but for now we'll consider 4xx as non-retryable (except 429)
      if (!res.ok && res.status >= 400 && res.status < 500 && res.status !== 429) {
        console.error(`Non-retryable error syncing metadata (${res.status}):`, await res.text().catch(() => ''));
        return true; // Return true to remove from queue
      }

      return res.ok;
    } catch (err) {
      // Network error, return false to retry
      return false;
    }
  }
  
  // For testing
  public getQueue() {
    return this.queue;
  }
  
  public clearQueue() {
    this.queue = [];
    this.saveQueue();
    this.updateTaskStates();
  }

  public destroy() {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
  }
}

if (typeof window !== 'undefined') {
  setTimeout(() => { (window as any).metadataQueue = metadataQueue; }, 0);
}

export const metadataQueue = new MetadataQueue();

// Helper to listen to a specific task's metadata events from Tauri
export async function listenToTaskMetadata(taskId: string) {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return () => {};
  }
  
  try {
    const { listen } = await import('@tauri-apps/api/event');
    
    const unlisten = await listen<ExecutionMetadataSync>(`opencode:metadata:${taskId}`, (event) => {
      metadataQueue.enqueue(event.payload);
    });
    
    return unlisten;
  } catch (err) {
    console.error('Failed to setup metadata listener for task', taskId, err);
    return () => {};
  }
}
