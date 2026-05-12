import { Router, Response } from 'express';
import { prisma } from '@openlinear/db';
import { broadcast } from '../sse';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { verifyDeviceSignature } from '../middleware/provenance';
import {
  ExecutionMetadataSync,
  safeValidateExecutionMetadataSync,
} from '../types/execution-metadata';

const router: Router = Router();

const taskInclude = {
  labels: { include: { label: true } },
  team: { select: { id: true, name: true, key: true, color: true } },
  project: { select: { id: true, name: true, status: true, color: true } },
};

type MetadataPhase = 'start' | 'progress' | 'finish';

function flattenLabels(task: any) {
  const { labels, ...rest } = task;
  return {
    ...rest,
    labels: (labels as Array<{ label: unknown }>).map((tl) => tl.label),
  };
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function validationError(error: { errors: Array<{ code: string; path: Array<string | number>; message: string }> }) {
  const hasUnknownKeys = error.errors.some((issue) => issue.code === 'unrecognized_keys');
  return {
    error: 'Invalid sync payload',
    code: hasUnknownKeys ? 'FORBIDDEN_FIELDS' : 'VALIDATION_ERROR',
    details: error.errors.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

async function canUpdateTask(taskId: string, userId: string): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, teamId: true },
  });

  if (!task) return false;
  if (!task.teamId) return true;

  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: task.teamId, userId } },
    select: { id: true },
  });

  return Boolean(membership);
}

function buildUpdateData(phase: MetadataPhase, metadata: ExecutionMetadataSync) {
  const data: Record<string, unknown> = {
    sessionId: metadata.runId,
  };

  if (metadata.prUrl !== undefined) data.prUrl = metadata.prUrl;
  if (metadata.outcome !== undefined) data.outcome = metadata.outcome;
  if (metadata.durationMs !== undefined) data.executionElapsedMs = metadata.durationMs;

  if (phase === 'start') {
    data.status = 'in_progress';
    data.executionStartedAt = parseDate(metadata.startedAt) ?? new Date();
    data.executionPausedAt = null;
    data.executionProgress = 0;
    return data;
  }

  if (phase === 'progress') {
    data.status = metadata.status === 'pending' ? 'todo' : 'in_progress';
    return data;
  }

  if (metadata.status === 'completed') {
    data.status = 'done';
    data.executionProgress = 100;
  } else if (metadata.status === 'cancelled') {
    data.status = 'cancelled';
  } else if (metadata.status === 'failed') {
    data.status = 'todo';
  }

  return data;
}

async function handleMetadataSync(phase: MetadataPhase, req: AuthRequest, res: Response) {
  const parsed = safeValidateExecutionMetadataSync(req.body);
  if (!parsed.success) {
    res.status(400).json(validationError(parsed.error));
    return;
  }

  const metadata = parsed.data;
  const allowed = await canUpdateTask(metadata.taskId, req.userId!);
  if (!allowed) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  try {
    const task = await prisma.task.update({
      where: { id: metadata.taskId },
      data: buildUpdateData(phase, metadata),
      include: taskInclude,
    });

    const flatTask = flattenLabels(task);
    broadcast('task:updated', flatTask);
    res.json({ success: true, task: flatTask });
  } catch (error) {
    console.error('[ExecutionMetadata] Failed to sync execution metadata:', error);
    res.status(500).json({ error: 'Failed to sync execution metadata' });
  }
}

router.post('/start', requireAuth, verifyDeviceSignature, (req: AuthRequest, res: Response) => {
  void handleMetadataSync('start', req, res);
});

router.put('/progress', requireAuth, verifyDeviceSignature, (req: AuthRequest, res: Response) => {
  void handleMetadataSync('progress', req, res);
});

router.post('/finish', requireAuth, verifyDeviceSignature, (req: AuthRequest, res: Response) => {
  void handleMetadataSync('finish', req, res);
});

export default router;
