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
}));

vi.mock('@openlinear/db', () => ({
  prisma: prismaMock,
}));

vi.mock('../services/batch', () => ({
  createBatch: vi.fn(),
  startBatch: vi.fn(),
  cancelBatch: vi.fn(),
  cancelTask: vi.fn(),
  getBatch: vi.fn(),
  getActiveBatches: vi.fn(),
  approveNextTask: vi.fn(),
}));

import { createBatch, startBatch, cancelBatch, getBatch, getActiveBatches } from '../services/batch';

describe('Batches Routes', () => {
  const app = createSidecarApp();
  let authToken: string;
  const testUserId = 'user-batch-test';

  beforeEach(() => {
    authToken = generateToken(testUserId, 'batchtester');
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ accessToken: null });
  });

  describe('POST /api/batches', () => {
    it('returns 400 for invalid body', async () => {
      const res = await request(app)
        .post('/api/batches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ mode: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('creates and starts a batch', async () => {
      const mockBatch = {
        id: 'batch-123',
        status: 'pending',
        mode: 'parallel',
        tasks: [
          { taskId: 'task-1', title: 'Task 1', status: 'queued', branch: 'openlinear/task-1' },
        ],
        createdAt: new Date(),
      };

      vi.mocked(createBatch).mockResolvedValue(mockBatch as any);
      vi.mocked(startBatch).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/batches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ taskIds: ['task-1'], mode: 'parallel' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('batch-123');
      expect(res.body.tasks).toHaveLength(1);
      expect(startBatch).toHaveBeenCalledWith('batch-123');
    });

    it('returns 400 when too many taskIds', async () => {
      const res = await request(app)
        .post('/api/batches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ taskIds: Array(21).fill('task-1'), mode: 'parallel' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 when no taskIds', async () => {
      const res = await request(app)
        .post('/api/batches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ taskIds: [], mode: 'parallel' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/batches', () => {
    it('returns active batches', async () => {
      vi.mocked(getActiveBatches).mockReturnValue([
        {
          id: 'batch-1',
          status: 'running',
          mode: 'parallel',
          tasks: [
            { taskId: 'task-1', title: 'Task 1', status: 'running', branch: 'openlinear/task-1' },
          ],
          createdAt: new Date(),
        },
      ] as any);

      const res = await request(app).get('/api/batches');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('batch-1');
      expect(res.body[0].taskCount).toBe(1);
    });

    it('returns empty array when no active batches', async () => {
      vi.mocked(getActiveBatches).mockReturnValue([]);

      const res = await request(app).get('/api/batches');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/batches/:id', () => {
    it('returns batch details', async () => {
      vi.mocked(getBatch).mockReturnValue({
        id: 'batch-1',
        status: 'running',
        mode: 'parallel',
        tasks: [
          { taskId: 'task-1', title: 'Task 1', status: 'completed', branch: 'openlinear/task-1' },
          { taskId: 'task-2', title: 'Task 2', status: 'failed', branch: 'openlinear/task-2' },
          { taskId: 'task-3', title: 'Task 3', status: 'running', branch: 'openlinear/task-3' },
          { taskId: 'task-4', title: 'Task 4', status: 'queued', branch: 'openlinear/task-4' },
          { taskId: 'task-5', title: 'Task 5', status: 'skipped', branch: 'openlinear/task-5' },
        ],
        createdAt: new Date(),
        completedAt: null,
        prUrl: null,
      } as any);

      const res = await request(app).get('/api/batches/batch-1');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('batch-1');
      expect(res.body.progress.total).toBe(5);
      expect(res.body.progress.completed).toBe(1);
      expect(res.body.progress.failed).toBe(1);
      expect(res.body.progress.running).toBe(1);
      expect(res.body.progress.queued).toBe(1);
      expect(res.body.progress.skipped).toBe(1);
      expect(res.body.progress.percentage).toBe(60);
    });

    it('returns 404 for non-existent batch', async () => {
      vi.mocked(getBatch).mockReturnValue(undefined);

      const res = await request(app).get('/api/batches/non-existent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Batch not found');
    });
  });

  describe('POST /api/batches/:id/cancel', () => {
    it('cancels a batch', async () => {
      vi.mocked(cancelBatch).mockResolvedValue(undefined);

      const res = await request(app).post('/api/batches/batch-1/cancel');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
