import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getLegacyTokenForOperation } from '../services/auth-migration';
import {
  createBatch,
  startBatch,
  cancelBatch,
  cancelTask,
  getBatch,
  getActiveBatches,
  approveNextTask,
} from '../services/batch';
import type { BatchState, BatchTask, BatchStatusResponse } from '../types/batch';

const CreateBatchSchema = z.object({
  taskIds: z.array(z.string()).min(1).max(20),
  mode: z.enum(['parallel', 'queue']),
});

const router: Router = Router();

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = CreateBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { taskIds, mode } = parsed.data;
    const userId = req.userId || null;
    
    console.log(`[Batches] Create batch requested (userId: ${userId})`);

    const accessToken = userId
      ? await getLegacyTokenForOperation(userId, 'batches.create')
      : null;

    const batch = await createBatch({
      taskIds,
      mode,
      projectId: '',
      userId,
      accessToken,
    });

    startBatch(batch.id);

    console.log(`[Batches] Create batch allowed (userId: ${userId}, batchId: ${batch.id})`);
    res.status(201).json({
      id: batch.id,
      status: batch.status,
      mode: batch.mode,
      tasks: batch.tasks.map((t: BatchTask) => ({
        taskId: t.taskId,
        title: t.title,
        status: t.status,
        branch: t.branch,
      })),
      createdAt: batch.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('[Batches] Error creating batch:', error);
    res.status(500).json({ error: 'Failed to create batch' });
  }
});

router.get('/', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const batches = getActiveBatches();
    res.json(
      batches.map((b: BatchState) => ({
        id: b.id,
        status: b.status,
        mode: b.mode,
        taskCount: b.tasks.length,
        createdAt: b.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error('[Batches] Error listing batches:', error);
    res.status(500).json({ error: 'Failed to list batches' });
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const batch = getBatch(id);
    if (!batch) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    const total = batch.tasks.length;
    const completed = batch.tasks.filter((t: BatchTask) => t.status === 'completed').length;
    const failed = batch.tasks.filter((t: BatchTask) => t.status === 'failed').length;
    const running = batch.tasks.filter((t: BatchTask) => t.status === 'running').length;
    const queued = batch.tasks.filter((t: BatchTask) => t.status === 'queued').length;
    const skipped = batch.tasks.filter((t: BatchTask) => t.status === 'skipped').length;
    const cancelled = batch.tasks.filter((t: BatchTask) => t.status === 'cancelled').length;
    const percentage = total > 0 ? Math.round(((completed + failed + skipped + cancelled) / total) * 100) : 0;

    const response: BatchStatusResponse = {
      id: batch.id,
      status: batch.status,
      mode: batch.mode,
      tasks: batch.tasks.map((t: BatchTask) => ({
        taskId: t.taskId,
        title: t.title,
        status: t.status,
        branch: t.branch,
        error: t.error,
        startedAt: t.startedAt?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
      })),
      prUrl: batch.prUrl,
      createdAt: batch.createdAt.toISOString(),
      completedAt: batch.completedAt?.toISOString() ?? null,
      progress: {
        total,
        completed,
        failed,
        running,
        queued,
        skipped,
        cancelled,
        percentage,
      },
    };

    res.json(response);
  } catch (error) {
    console.error('[Batches] Error getting batch:', error);
    res.status(500).json({ error: 'Failed to get batch' });
  }
});

router.post('/:id/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    console.log(`[Batches] Cancel batch requested (userId: ${req.userId}, batchId: ${id})`);
    cancelBatch(id);
    console.log(`[Batches] Cancel batch allowed (userId: ${req.userId}, batchId: ${id})`);
    res.json({ success: true });
  } catch (error) {
    console.error('[Batches] Error cancelling batch:', error);
    res.status(500).json({ error: 'Failed to cancel batch' });
  }
});

router.post('/:id/tasks/:taskId/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const taskId = req.params.taskId as string;
    console.log(`[Batches] Cancel task requested (userId: ${req.userId}, batchId: ${id}, taskId: ${taskId})`);
    cancelTask(id, taskId);
    console.log(`[Batches] Cancel task allowed (userId: ${req.userId}, batchId: ${id}, taskId: ${taskId})`);
    res.json({ success: true });
  } catch (error) {
    console.error('[Batches] Error cancelling task:', error);
    res.status(500).json({ error: 'Failed to cancel task' });
  }
});

router.post('/:id/approve', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    console.log(`[Batches] Approve task requested (userId: ${req.userId}, batchId: ${id})`);
    approveNextTask(id);
    const batch = getBatch(id);
    if (!batch) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }
    console.log(`[Batches] Approve task allowed (userId: ${req.userId}, batchId: ${id})`);
    res.json({
      id: batch.id,
      status: batch.status,
      mode: batch.mode,
      tasks: batch.tasks.map((t: BatchTask) => ({
        taskId: t.taskId,
        title: t.title,
        status: t.status,
        branch: t.branch,
      })),
    });
  } catch (error) {
    console.error('[Batches] Error approving task:', error);
    res.status(500).json({ error: 'Failed to approve task' });
  }
});

export default router;
