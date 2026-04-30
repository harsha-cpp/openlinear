import { Router, Response, NextFunction } from 'express';
import { prisma } from '@openlinear/db';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  assertTaskOwned,
  assertProjectOwned,
  assertTeamRole,
} from '../services/ownership';

const router: Router = Router();

const querySchema = z
  .object({
    taskId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((v) => Boolean(v.taskId || v.projectId || v.teamId), {
    message: 'one of taskId, projectId, teamId is required',
  });

router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
      return;
    }
    const { taskId, projectId, teamId, page, pageSize } = parsed.data;

    if (taskId) await assertTaskOwned(taskId, req.userId!);
    if (projectId) await assertProjectOwned(projectId, req.userId!);
    if (teamId) await assertTeamRole(teamId, req.userId!, ['owner', 'admin', 'member']);

    const where = {
      ...(taskId ? { taskId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(teamId ? { teamId } : {}),
    };

    const [activities, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, username: true, avatarUrl: true } },
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    res.json({ activities, page, pageSize, total });
  } catch (error) {
    next(error);
  }
});

export default router;
