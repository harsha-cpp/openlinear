import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeTask } from '../services/execution/lifecycle';
import { getFeatureFlags } from '../config/feature-flags';

vi.mock('../config/feature-flags', () => ({
  getFeatureFlags: vi.fn(),
  isLocalExecutionEnabled: vi.fn((userId, flags) => {
    if (flags.FORCE_LOCAL_EXECUTION) return true;
    if (flags.KILL_SWITCH_LOCAL_EXECUTION) return false;
    return flags.LOCAL_EXECUTION_ENABLED;
  }),
  isServerExecutionEnabled: vi.fn((flags) => flags.SERVER_EXECUTION_ENABLED),
}));

vi.mock('../services/execution/state', () => ({
  activeExecutions: new Map(),
  sessionToTask: new Map(),
  broadcastProgress: vi.fn(),
  addLogEntry: vi.fn(),
  estimateProgress: vi.fn(),
  persistLogs: vi.fn(),
  cleanupExecution: vi.fn(),
  updateTaskStatus: vi.fn(),
  REPOS_DIR: '/tmp/repos',
  TASK_TIMEOUT_MS: 1000,
}));

describe('executeTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes execution to local metadata mode when local mode enabled', async () => {
    vi.mocked(getFeatureFlags).mockReturnValue({
      LOCAL_EXECUTION_ENABLED: true,
      SERVER_EXECUTION_ENABLED: true,
      CANARY_PERCENTAGE: 100,
      FORCE_LOCAL_EXECUTION: true,
      KILL_SWITCH_LOCAL_EXECUTION: false,
    } as any);

    const result = await executeTask({ taskId: 'task-1', userId: 'user-1' });

    expect(result.success).toBe(false);
    expect(result.code).toBe('LOCAL_EXECUTION_REQUIRED');
  });

  it('returns controlled error when server execution is disabled', async () => {
    vi.mocked(getFeatureFlags).mockReturnValue({
      LOCAL_EXECUTION_ENABLED: false,
      SERVER_EXECUTION_ENABLED: false,
      CANARY_PERCENTAGE: 0,
      FORCE_LOCAL_EXECUTION: false,
      KILL_SWITCH_LOCAL_EXECUTION: false,
    } as any);

    const result = await executeTask({ taskId: 'task-1', userId: 'user-1' });

    expect(result.success).toBe(false);
    expect(result.code).toBe('SERVER_EXECUTION_DISABLED');
  });
});
