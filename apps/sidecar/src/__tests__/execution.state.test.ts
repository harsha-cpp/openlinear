import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  activeExecutions,
  startingExecutions,
  sessionToTask,
  isTaskRunning,
  getRunningTaskCount,
  getExecutionStatus,
  getExecutionLogs,
  findTaskBySessionId,
  addPendingPermission,
  removePendingPermission,
  getPendingPermissions,
  estimateProgress,
} from '../services/execution/state';

describe('Execution State', () => {
  beforeEach(() => {
    activeExecutions.clear();
    startingExecutions.clear();
    sessionToTask.clear();
  });

  describe('estimateProgress', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns 0 for fresh execution', () => {
      const execution = {
        startedAt: new Date('2026-01-01T00:00:00Z'),
        toolsExecuted: 0,
        filesChanged: 0,
      } as any;
      expect(estimateProgress(execution)).toBe(0);
    });

    it('caps tool progress at 40%', () => {
      const execution = {
        startedAt: new Date('2026-01-01T00:00:00Z'),
        toolsExecuted: 20,
        filesChanged: 0,
      } as any;
      expect(estimateProgress(execution)).toBe(40);
    });

    it('caps file progress at 30%', () => {
      const execution = {
        startedAt: new Date('2026-01-01T00:00:00Z'),
        toolsExecuted: 0,
        filesChanged: 10,
      } as any;
      expect(estimateProgress(execution)).toBe(30);
    });

    it('caps time progress at 20%', () => {
      const execution = {
        startedAt: new Date('2025-12-31T23:30:00Z'),
        toolsExecuted: 0,
        filesChanged: 0,
      } as any;
      expect(estimateProgress(execution)).toBe(20);
    });

    it('never exceeds 90% (max achievable)', () => {
      const execution = {
        startedAt: new Date('2025-12-31T23:00:00Z'),
        toolsExecuted: 100,
        filesChanged: 100,
      } as any;
      expect(estimateProgress(execution)).toBe(90);
    });

    it('combines all progress factors', () => {
      const execution = {
        startedAt: new Date('2026-01-01T00:00:00Z'),
        toolsExecuted: 4,
        filesChanged: 2,
      } as any;
      expect(estimateProgress(execution)).toBe(40);
    });
  });

  describe('isTaskRunning', () => {
    it('returns false when no execution exists', () => {
      expect(isTaskRunning('task-1')).toBe(false);
    });

    it('returns true for active execution', () => {
      activeExecutions.set('task-1', { taskId: 'task-1' } as any);
      expect(isTaskRunning('task-1')).toBe(true);
    });

    it('returns true for starting execution', () => {
      startingExecutions.set('task-1', { taskId: 'task-1' } as any);
      expect(isTaskRunning('task-1')).toBe(true);
    });

    it('returns false after execution is removed', () => {
      activeExecutions.set('task-1', { taskId: 'task-1' } as any);
      activeExecutions.delete('task-1');
      expect(isTaskRunning('task-1')).toBe(false);
    });
  });

  describe('getRunningTaskCount', () => {
    it('returns 0 when empty', () => {
      expect(getRunningTaskCount()).toBe(0);
    });

    it('counts active and starting executions', () => {
      activeExecutions.set('task-1', { taskId: 'task-1' } as any);
      activeExecutions.set('task-2', { taskId: 'task-2' } as any);
      startingExecutions.set('task-3', { taskId: 'task-3' } as any);
      expect(getRunningTaskCount()).toBe(3);
    });
  });

  describe('getExecutionStatus', () => {
    it('returns undefined for non-existent task', () => {
      expect(getExecutionStatus('task-1')).toBeUndefined();
    });

    it('returns execution state for active task', () => {
      const state = { taskId: 'task-1', status: 'executing' } as any;
      activeExecutions.set('task-1', state);
      expect(getExecutionStatus('task-1')).toBe(state);
    });
  });

  describe('getExecutionLogs', () => {
    it('returns empty array for non-existent task', () => {
      expect(getExecutionLogs('task-1')).toEqual([]);
    });

    it('returns logs for active execution', () => {
      const logs = [{ timestamp: '2026-01-01T00:00:00Z', type: 'info', message: 'test' }];
      activeExecutions.set('task-1', { taskId: 'task-1', logs } as any);
      expect(getExecutionLogs('task-1')).toEqual(logs);
    });
  });

  describe('findTaskBySessionId', () => {
    it('finds task via sessionToTask lookup map', () => {
      sessionToTask.set('ses_123', 'task-1');
      expect(findTaskBySessionId('ses_123')).toBe('task-1');
    });

    it('falls back to scanning activeExecutions', () => {
      activeExecutions.set('task-1', { taskId: 'task-1', sessionId: 'ses_456' } as any);
      expect(findTaskBySessionId('ses_456')).toBe('task-1');
      expect(sessionToTask.get('ses_456')).toBe('task-1');
    });

    it('returns undefined for unknown session', () => {
      expect(findTaskBySessionId('ses_unknown')).toBeUndefined();
    });
  });

  describe('pending permissions', () => {
    it('adds, gets, and removes pending permissions', () => {
      activeExecutions.set('task-1', { taskId: 'task-1', pendingPermissions: [] } as any);

      const perm = { id: 'perm-1', type: 'file', title: 'Read file', pattern: '*.ts', metadata: {}, createdAt: '2026-01-01T00:00:00Z' };

      expect(getPendingPermissions('task-1')).toEqual([]);

      addPendingPermission('task-1', perm);
      expect(getPendingPermissions('task-1')).toEqual([perm]);

      addPendingPermission('task-1', { ...perm, id: 'perm-2' });
      expect(getPendingPermissions('task-1')).toHaveLength(2);

      removePendingPermission('task-1', 'perm-1');
      expect(getPendingPermissions('task-1')).toHaveLength(1);
      expect(getPendingPermissions('task-1')[0].id).toBe('perm-2');
    });

    it('handles non-existent task gracefully', () => {
      const perm = { id: 'perm-1', type: 'file', title: 'Read', pattern: '*', metadata: {}, createdAt: '2026-01-01T00:00:00Z' };
      expect(() => addPendingPermission('non-existent', perm)).not.toThrow();
      expect(getPendingPermissions('non-existent')).toEqual([]);
      expect(() => removePendingPermission('non-existent', 'perm-1')).not.toThrow();
    });
  });
});
