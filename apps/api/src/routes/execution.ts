import { Router } from 'express';
import { prisma } from '@openlinear/db';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { verifyDeviceSignature } from '../middleware/provenance';
import {
  validateExecutionMetadataMiddleware,
  type ExecutionMetadataSync,
} from '../types/execution-metadata';
import { broadcast } from '../sse';
import { handleTaskComplete } from '../services/batch';

const router: import('express').Router = Router();

function mapExecutionStatusToTaskStatus(status: ExecutionMetadataSync['status']) {
  switch (status) {
    case 'completed':
      return 'done';
    case 'failed':
      return 'cancelled';
    case 'cancelled':
      return 'cancelled';
    case 'running':
      return 'in_progress';
    case 'pending':
    default:
      return 'todo';
  }
}

/**
 * POST /api/execution/metadata/start
 * 
 * Signal that execution has started on desktop.
 */
router.post('/metadata/start', requireAuth, verifyDeviceSignature, validateExecutionMetadataMiddleware(), async (req, res) => {
  try {
    const metadata = (req as any).validatedMetadata as ExecutionMetadataSync;
    const userId = (req as AuthRequest).userId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const task = await prisma.task.findFirst({
      where: { id: metadata.taskId },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updatedTask = await prisma.task.update({
      where: { id: metadata.taskId },
      data: {
        status: 'in_progress',
        executionStartedAt: metadata.startedAt ? new Date(metadata.startedAt) : new Date(),
        sessionId: metadata.runId,
      },
    });

    broadcast('execution:started', {
      taskId: metadata.taskId,
      runId: metadata.runId,
    });

    return res.status(200).json({
      success: true,
      task: updatedTask,
    });
  } catch (error) {
    console.error('Execution start error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/execution/metadata/progress
 * 
 * Update execution progress from desktop.
 */
router.put('/metadata/progress', requireAuth, verifyDeviceSignature, validateExecutionMetadataMiddleware(), async (req, res) => {
  try {
    const metadata = (req as any).validatedMetadata as ExecutionMetadataSync;
    const userId = (req as AuthRequest).userId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const task = await prisma.task.findFirst({
      where: { id: metadata.taskId },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!task.executionStartedAt) {
      return res.status(409).json({ error: 'Cannot update progress before starting execution' });
    }

    const updatedTask = await prisma.task.update({
      where: { id: metadata.taskId },
      data: {
      },
    });

    broadcast('execution:progress', {
      taskId: metadata.taskId,
    });

    return res.status(200).json({
      success: true,
      task: updatedTask,
    });
  } catch (error) {
    console.error('Execution progress error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/execution/metadata/finish
 * 
 * Signal that execution has completed/failed on desktop.
 */
router.post('/metadata/finish', requireAuth, verifyDeviceSignature, validateExecutionMetadataMiddleware(), async (req, res) => {
  try {
    const metadata = (req as any).validatedMetadata as ExecutionMetadataSync;
    const userId = (req as AuthRequest).userId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const task = await prisma.task.findFirst({
      where: { id: metadata.taskId },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!task.executionStartedAt) {
      return res.status(409).json({ error: 'Cannot finish execution before starting it' });
    }

    const updatedTask = await prisma.task.update({
      where: { id: metadata.taskId },
      data: {
        status: mapExecutionStatusToTaskStatus(metadata.status),
        executionElapsedMs: metadata.durationMs ?? 0,
        executionProgress: 100,
        prUrl: metadata.prUrl,
        outcome: metadata.outcome,
      },
    });

    broadcast('execution:finished', {
      taskId: metadata.taskId,
      status: metadata.status,
      prUrl: metadata.prUrl,
    });

    if (task.batchId) {
      await handleTaskComplete(
        task.batchId,
        metadata.taskId,
        metadata.status === 'completed',
        metadata.outcome || (metadata.status === 'failed' ? 'Task failed' : undefined)
      );
    }

    return res.status(200).json({
      success: true,
      task: updatedTask,
    });
  } catch (error) {
    console.error('Execution finish error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
