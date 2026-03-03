export interface ExecutionLogEntry {
  timestamp: string;
  type: 'info' | 'agent' | 'tool' | 'error' | 'success';
  message: string;
  details?: string;
}

export interface ExecuteTaskParams {
  taskId: string;
  userId?: string;
}

export function getRunningTaskCount(): number {
  return 0;
}

export function isTaskRunning(_taskId: string): boolean {
  return false;
}

export function getExecutionStatus(_taskId: string): undefined {
  return undefined;
}

export function getExecutionLogs(_taskId: string): ExecutionLogEntry[] {
  return [];
}
