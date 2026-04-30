import { Router, Response, NextFunction } from 'express';
import { prisma } from '@openlinear/db';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';
import { getUserTeamIds } from '../services/team-scope';
import { assertTaskOwned } from '../services/ownership';

const router: Router = Router();

function completedOrCancelled() {
  return { OR: [{ status: 'done' as const }, { status: 'cancelled' as const }] };
}

async function teamScope(userId?: string): Promise<Record<string, unknown> | null> {
  if (!userId) return null;
  const teamIds = await getUserTeamIds(userId);
  return { teamId: { in: teamIds } };
}

router.get('/count', optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const scope = await teamScope(req.userId);
    if (!scope) {
      res.json({ total: 0, unread: 0 });
      return;
    }

    const baseWhere = { ...completedOrCancelled(), archived: false, ...scope };

    const total = await prisma.task.count({ where: baseWhere });
    const unread = await prisma.task.count({
      where: { ...baseWhere, inboxRead: false },
    });
    res.json({ total, unread });
  } catch (error) {
    next(error);
  }
});

router.get('/', optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const scope = await teamScope(req.userId);
    if (!scope) {
      res.json([]);
      return;
    }

    const tasks = await prisma.task.findMany({
      where: {
        ...completedOrCancelled(),
        archived: false,
        ...scope,
      },
      include: {
        labels: { include: { label: true } },
        team: { select: { id: true, name: true, key: true, color: true } },
        project: { select: { id: true, name: true, status: true, color: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const flatTasks = tasks.map(task => ({
      ...task,
      labels: task.labels.map((tl: { label: { id: string; name: string; color: string; priority: number } }) => tl.label),
    }));

    res.json(flatTasks);
  } catch (error) {
    next(error);
  }
});

router.patch('/read/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await assertTaskOwned(id, req.userId!);
    await prisma.task.update({
      where: { id },
      data: { inboxRead: true },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.patch('/read-all', optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const scope = await teamScope(req.userId);
    if (!scope) {
      res.json({ success: true });
      return;
    }

    await prisma.task.updateMany({
      where: {
        ...completedOrCancelled(),
        inboxRead: false,
        archived: false,
        ...scope,
      },
      data: { inboxRead: true },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
