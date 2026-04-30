import { Router, Response, NextFunction } from 'express';
import { prisma } from '@openlinear/db';
import { broadcastToTeam, broadcastToUser, broadcastToTaskById } from '../sse';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody, validateQuery, ValidatedRequest } from '../middleware/validate';
import { getUserTeamIds } from '../services/team-scope';
import {
  assertTaskOwned,
  assertTeamRole,
  OwnershipError,
} from '../services/ownership';
import {
  createLabelBodySchema,
  updateLabelBodySchema,
  assignLabelBodySchema,
  listLabelsQuerySchema,
  CreateLabelBody,
  UpdateLabelBody,
  AssignLabelBody,
  ListLabelsQuery,
} from '../schemas/labels';

const router: Router = Router();

router.get(
  '/',
  requireAuth,
  validateQuery(listLabelsQuerySchema),
  async (req: AuthRequest & ValidatedRequest<unknown, ListLabelsQuery>, res: Response, next: NextFunction) => {
    try {
      const teamIdParam = req.validQuery?.teamId;
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
  },
);

router.post(
  '/',
  requireAuth,
  validateBody(createLabelBodySchema),
  async (req: AuthRequest & ValidatedRequest<CreateLabelBody>, res: Response, next: NextFunction) => {
    try {
      const { teamId, ...rest } = req.validBody!;
      if (teamId) {
        await assertTeamRole(teamId, req.userId!, ['owner', 'admin', 'member']);
      }

      const label = await prisma.label.create({
        data: { ...rest, teamId: teamId ?? null },
      });

      if (label.teamId) {
        broadcastToTeam(label.teamId, 'label:created', label);
      } else {
        broadcastToUser(req.userId!, 'label:created', label);
      }
      res.status(201).json(label);
    } catch (error) {
      next(error);
    }
  },
);

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

router.patch(
  '/:id',
  requireAuth,
  validateBody(updateLabelBodySchema),
  async (req: AuthRequest & ValidatedRequest<UpdateLabelBody>, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      await assertLabelAccess(id, req.userId!);

      const label = await prisma.label.update({
        where: { id },
        data: req.validBody!,
      });

      if (label.teamId) {
        broadcastToTeam(label.teamId, 'label:updated', label);
      } else {
        broadcastToUser(req.userId!, 'label:updated', label);
      }
      res.json(label);
    } catch (error) {
      next(error);
    }
  },
);

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await assertLabelAccess(id, req.userId!);

    const existing = await prisma.label.findUnique({
      where: { id },
      select: { teamId: true },
    });

    await prisma.label.delete({ where: { id } });

    if (existing?.teamId) {
      broadcastToTeam(existing.teamId, 'label:deleted', { id });
    } else {
      broadcastToUser(req.userId!, 'label:deleted', { id });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post(
  '/tasks/:id/labels',
  requireAuth,
  validateBody(assignLabelBodySchema),
  async (req: AuthRequest & ValidatedRequest<AssignLabelBody>, res: Response, next: NextFunction) => {
    try {
      const taskId = req.params.id as string;
      const { labelId } = req.validBody!;

      await assertTaskOwned(taskId, req.userId!);
      await assertLabelAccess(labelId, req.userId!);

      const taskLabel = await prisma.taskLabel.create({
        data: { taskId, labelId },
        include: { label: true },
      });

      broadcastToTaskById(taskId, 'task:label:assigned', { taskId, label: taskLabel.label });
      res.status(201).json(taskLabel);
    } catch (error) {
      next(error);
    }
  },
);

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

    broadcastToTaskById(taskId, 'task:label:removed', { taskId, labelId });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
