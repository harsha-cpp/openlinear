import { getFeatureFlags, isLocalExecutionEnabled } from '../../config/feature-flags';
import { activeExecutions, ExecuteTaskParams } from './state';

export async function executeTask({ taskId, userId }: ExecuteTaskParams): Promise<{ success: boolean; error?: string; code?: string }> {
  const flags = getFeatureFlags();

  if (userId && isLocalExecutionEnabled(userId, flags)) {
    console.log(`[Execution] Task ${taskId.slice(0, 8)} should be executed locally (canary/local mode)`);
    return { 
      success: false, 
      error: 'Local execution is enabled for this user. Please execute the task from the desktop app.',
      code: 'LOCAL_EXECUTION_REQUIRED'
    };
  }

  console.log(`[Execution] Server execution is disabled globally`);
  return { 
    success: false, 
    error: 'Server execution is disabled. Please execute the task from the desktop app.',
    code: 'SERVER_EXECUTION_DISABLED'
  };
}

export async function cancelTask(taskId: string): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'Task is not running' };
}
