import { ExecuteTaskParams } from './state';

export async function executeTask({ taskId }: ExecuteTaskParams): Promise<{ success: boolean; error?: string; code?: string }> {
  console.log(`[Execution] Server execution is disabled for task ${taskId.slice(0, 8)}`);
  return { 
    success: false, 
    error: 'Server execution is disabled. Please execute the task from the desktop app.',
    code: 'SERVER_EXECUTION_DISABLED'
  };
}

export async function cancelTask(taskId: string): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'Task is not running' };
}
