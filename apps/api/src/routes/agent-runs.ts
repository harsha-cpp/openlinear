import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@openlinear/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { assertTaskOwned } from '../services/ownership';
import { getUserTeamIds } from '../services/team-scope';

const router: Router = Router();

const listQuerySchema = z.object({
  taskId: z.string().uuid().optional(),
  userId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

router.get(
  '/',
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
        return;
      }
      const { taskId, userId, page, pageSize } = parsed.data;

      if (!taskId && !userId) {
        res.status(400).json({ error: 'taskId or userId is required' });
        return;
      }

      const where: { taskId?: string; userId?: string; task?: { teamId: { in: string[] } } } = {};

      if (taskId) {
        await assertTaskOwned(taskId, req.userId!);
        where.taskId = taskId;
      } else if (userId) {
        const resolvedUserId = userId === 'me' ? req.userId! : userId;
        if (resolvedUserId !== req.userId!) {
          res.status(403).json({ error: 'forbidden' });
          return;
        }
        where.userId = resolvedUserId;
        const teamIds = await getUserTeamIds(req.userId!);
        if (teamIds.length === 0) {
          res.json({ runs: [], page, pageSize, total: 0 });
          return;
        }
        where.task = { teamId: { in: teamIds } };
      }

      const [runs, total] = await Promise.all([
        prisma.agentRun.findMany({
          where,
          orderBy: { startedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            taskId: true,
            userId: true,
            agent: true,
            model: true,
            startedAt: true,
            endedAt: true,
            costUsd: true,
            inputTokens: true,
            outputTokens: true,
            status: true,
            prUrl: true,
            errorMessage: true,
          },
        }),
        prisma.agentRun.count({ where }),
      ]);

      res.json({ runs, page, pageSize, total });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
