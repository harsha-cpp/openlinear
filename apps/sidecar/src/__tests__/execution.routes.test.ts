import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createSidecarApp } from '../app';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'openlinear-dev-secret-change-in-production';

function generateToken(userId: string, username: string = 'testuser') {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '1h' });
}

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  task: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));

vi.mock('@openlinear/db', () => ({
  prisma: prismaMock,
}));

vi.mock('../services/execution', () => ({
  executeTask: vi.fn(),
  cancelTask: vi.fn(),
  isTaskRunning: vi.fn(),
  getExecutionLogs: vi.fn(),
  getPendingPermissions: vi.fn(),
}));

vi.mock('../services/execution/state', async () => {
  const actual = await vi.importActual<typeof import('../services/execution/state')>('../services/execution/state');
  return {
    ...actual,
    activeExecutions: new Map(),
  };
});

import { executeTask, cancelTask, isTaskRunning, getExecutionLogs, getPendingPermissions } from '../services/execution';

describe('Execution Routes', () => {
  const app = createSidecarApp();
  let authToken: string;
  const testUserId = 'user-execution-test';
  const testTaskId = 'task-execution-test';

  beforeEach(() => {
    authToken = generateToken(testUserId, 'executiontester');
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ accessToken: null });
    prismaMock.task.findUnique.mockResolvedValue({ prUrl: null, batchId: null });
    prismaMock.task.update.mockResolvedValue({});
    prismaMock.task.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  describe('POST /api/tasks/:id/execute', () => {
    it('returns 400 when executeTask fails', async () => {
      vi.mocked(executeTask).mockResolvedValue({ success: false, error: 'Already running' });

      const res = await request(app)
        .post(`/api/tasks/${testTaskId}/execute`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Already running');
    });

    it('returns 200 when executeTask succeeds', async () => {
      vi.mocked(executeTask).mockResolvedValue({ success: true });

      const res = await request(app)
        .post(`/api/tasks/${testTaskId}/execute`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Task execution started');
    });

    it('returns 500 on unexpected error', async () => {
      vi.mocked(executeTask).mockRejectedValue(new Error('Boom'));

      const res = await request(app)
        .post(`/api/tasks/${testTaskId}/execute`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to execute task');
    });
  });

  describe('POST /api/tasks/:id/cancel', () => {
    it('returns 400 when task is not running', async () => {
      vi.mocked(isTaskRunning).mockReturnValue(false);

      const res = await request(app)
        .post(`/api/tasks/${testTaskId}/cancel`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Task is not running');
    });

    it('returns 200 when cancel succeeds', async () => {
      vi.mocked(isTaskRunning).mockReturnValue(true);
      vi.mocked(cancelTask).mockResolvedValue({ success: true });

      const res = await request(app)
        .post(`/api/tasks/${testTaskId}/cancel`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Task cancelled');
    });

    it('returns 400 when cancel fails', async () => {
      vi.mocked(isTaskRunning).mockReturnValue(true);
      vi.mocked(cancelTask).mockResolvedValue({ success: false, error: 'Not found' });

      const res = await request(app)
        .post(`/api/tasks/${testTaskId}/cancel`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Not found');
    });
  });

  describe('GET /api/tasks/:id/running', () => {
    it('returns running status', async () => {
      vi.mocked(isTaskRunning).mockReturnValue(true);

      const res = await request(app)
        .get(`/api/tasks/${testTaskId}/running`);

      expect(res.status).toBe(200);
      expect(res.body.running).toBe(true);
    });

    it('returns not running status', async () => {
      vi.mocked(isTaskRunning).mockReturnValue(false);

      const res = await request(app)
        .get(`/api/tasks/${testTaskId}/running`);

      expect(res.status).toBe(200);
      expect(res.body.running).toBe(false);
    });
  });

  describe('GET /api/tasks/:id/logs', () => {
    it('returns execution logs from memory', async () => {
      vi.mocked(getExecutionLogs).mockReturnValue([
        { timestamp: '2026-01-01T00:00:00Z', type: 'info', message: 'Started' },
      ]);

      const res = await request(app)
        .get(`/api/tasks/${testTaskId}/logs`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(1);
      expect(res.body.logs[0].message).toBe('Started');
    });

    it('returns empty logs when no execution exists', async () => {
      vi.mocked(getExecutionLogs).mockReturnValue([]);

      const res = await request(app)
        .get(`/api/tasks/${testTaskId}/logs`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toEqual([]);
    });
  });

  describe('GET /api/tasks/:id/permissions', () => {
    it('returns pending permissions', async () => {
      vi.mocked(getPendingPermissions).mockReturnValue([
        { id: 'perm-1', type: 'file', title: 'Read file', pattern: '*.ts', createdAt: '2026-01-01T00:00:00Z' },
      ]);

      const res = await request(app)
        .get(`/api/tasks/${testTaskId}/permissions`);

      expect(res.status).toBe(200);
      expect(res.body.permissions).toHaveLength(1);
      expect(res.body.permissions[0].title).toBe('Read file');
    });
  });

  describe('POST /api/tasks/:id/permissions/:permissionId/respond', () => {
    it('returns 400 for invalid response', async () => {
      const res = await request(app)
        .post(`/api/tasks/${testTaskId}/permissions/perm-1/respond`)
        .send({ response: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('once, always, or reject');
    });

    it('returns 404 when execution not found', async () => {
      const res = await request(app)
        .post(`/api/tasks/${testTaskId}/permissions/perm-1/respond`)
        .send({ response: 'once' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task execution not found');
    });
  });

  describe('POST /api/tasks/:id/refresh-pr', () => {
    it('returns 404 for non-existent task', async () => {
      prismaMock.task.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/tasks/00000000-0000-0000-0000-000000000000/refresh-pr')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });

    it('returns not refreshed when prUrl is null', async () => {
      prismaMock.task.findUnique.mockResolvedValueOnce({ prUrl: null, batchId: null });

      const res = await request(app)
        .post(`/api/tasks/${testTaskId}/refresh-pr`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.refreshed).toBe(false);
    });

    it('returns not refreshed when prUrl is not a compare URL', async () => {
      prismaMock.task.findUnique.mockResolvedValueOnce({
        prUrl: 'https://github.com/acme/repo/pull/42',
        batchId: null,
      });

      const res = await request(app)
        .post(`/api/tasks/${testTaskId}/refresh-pr`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.refreshed).toBe(false);
    });

    it('returns 400 when no GitHub token available', async () => {
      prismaMock.task.findUnique.mockResolvedValueOnce({
        prUrl: 'https://github.com/acme/repo/compare/main...branch',
        batchId: null,
      });
      prismaMock.user.findUnique.mockResolvedValueOnce({ accessToken: null });

      const res = await request(app)
        .post(`/api/tasks/${testTaskId}/refresh-pr`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('GitHub authentication required');
    });
  });
});
