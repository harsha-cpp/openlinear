import { ExecuteTaskParams } from './state';

export async function executeTask({ taskId }: ExecuteTaskParams): Promise<{ success: boolean; error?: string; code?: string }> {
  console.log(`[Execution] server execution is no longer supported for task ${taskId.slice(0, 8)}`);
  return { 
    success: false, 
    error: 'Server execution is no longer supported. Please execute the task from the desktop app.',
    code: 'SERVER_EXECUTION_DISABLED'
  };
}

export async function cancelTask(taskId: string): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'Task is not running' };
}
