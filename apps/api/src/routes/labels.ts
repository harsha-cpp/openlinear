import { Router, Response, NextFunction } from 'express';
import { prisma } from '@openlinear/db';
import { z } from 'zod';
import { broadcast } from '../sse';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getUserTeamIds } from '../services/team-scope';
import {
  assertTaskOwned,
  assertTeamRole,
  OwnershipError,
} from '../services/ownership';

const router: Router = Router();

const createLabelSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color'),
  priority: z.number().int().min(0).default(0),
  teamId: z.string().uuid().optional(),
});

const updateLabelSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color').optional(),
  priority: z.number().int().min(0).optional(),
});

const assignLabelSchema = z.object({
  labelId: z.string().uuid(),
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const teamIdParam = req.query.teamId as string | undefined;
    const userTeamIds = await getUserTeamIds(req.userId!);

    const teamFilter = teamIdParam
      ? userTeamIds.includes(teamIdParam) ? [teamIdParam] : []
      : userTeamIds;

    const labels = await prisma.label.findMany({
      where: {
        OR: [
          { teamId: { in: teamFilter } },
          { teamId: null },
        ],
      },
      orderBy: { priority: 'desc' },
    });
    res.json(labels);
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const parsed = createLabelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const { teamId, ...rest } = parsed.data;
    if (teamId) {
      await assertTeamRole(teamId, req.userId!, ['owner', 'admin', 'member']);
    }

    const label = await prisma.label.create({
      data: { ...rest, teamId: teamId ?? null },
    });

    broadcast('label:created', label);
    res.status(201).json(label);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      res.status(409).json({ error: 'Label with this name already exists' });
      return;
    }
    next(error);
  }
});

async function assertLabelAccess(labelId: string, userId: string): Promise<void> {
  const label = await prisma.label.findUnique({
    where: { id: labelId },
    select: { teamId: true },
  });
  if (!label) {
    throw new OwnershipError('label', labelId, 'not_found');
  }
  if (label.teamId) {
    await assertTeamRole(label.teamId, userId, ['owner', 'admin', 'member']);
  }
}

router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const parsed = updateLabelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
      return;
    }

    await assertLabelAccess(id, req.userId!);

    const label = await prisma.label.update({
      where: { id },
      data: parsed.data,
    });

    broadcast('label:updated', label);
    res.json(label);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      res.status(409).json({ error: 'Label with this name already exists' });
      return;
    }
    next(error);
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await assertLabelAccess(id, req.userId!);

    await prisma.label.delete({ where: { id } });

    broadcast('label:deleted', { id });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/tasks/:id/labels', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.id as string;
    const parsed = assignLabelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const { labelId } = parsed.data;

    await assertTaskOwned(taskId, req.userId!);
    await assertLabelAccess(labelId, req.userId!);

    const taskLabel = await prisma.taskLabel.create({
      data: { taskId, labelId },
      include: { label: true },
    });

    broadcast('task:label:assigned', { taskId, label: taskLabel.label });
    res.status(201).json(taskLabel);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      res.status(409).json({ error: 'Label already assigned to this task' });
      return;
    }
    next(error);
  }
});

router.delete('/tasks/:id/labels/:labelId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.id as string;
    const labelId = req.params.labelId as string;

    await assertTaskOwned(taskId, req.userId!);

    await prisma.taskLabel.delete({
      where: {
        taskId_labelId: { taskId, labelId },
      },
    });

    broadcast('task:label:removed', { taskId, labelId });
    res.status(204).send();
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      res.status(404).json({ error: 'Label assignment not found' });
      return;
    }
    next(error);
  }
});

export default router;
