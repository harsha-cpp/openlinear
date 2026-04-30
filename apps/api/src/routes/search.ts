import { Router, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '@openlinear/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getUserTeamIds } from '../services/team-scope';
import { SearchQuerySchema } from '../schemas/search';

const router: Router = Router();

// Per-user rate limit: 30 req/min, keyed off authenticated userId
const searchLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as AuthRequest).userId;
    return userId ?? req.ip ?? 'anonymous';
  },
  handler: (_req, res) => {
    res.status(429).json({
      error: 'rate_limited',
      scope: 'search',
      retryAfterSeconds: 60,
    });
  },
});

interface TaskHit {
  id: string;
  title: string;
  identifier: string | null;
  type: 'task';
}

interface ProjectHit {
  id: string;
  name: string;
  type: 'project';
}

interface TeamHit {
  id: string;
  name: string;
  key: string;
  type: 'team';
}

router.get(
  '/',
  requireAuth,
  searchLimiter,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = SearchQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten(),
        });
        return;
      }

      const { q, types, limit } = parsed.data;
      const userTeamIds = await getUserTeamIds(req.userId!);

      // Distribute the limit across requested types (e.g. 20 / 3 ≈ 7,7,6)
      const perType = Math.max(1, Math.floor(limit / types.length));
      const wantTasks = types.includes('tasks');
      const wantProjects = types.includes('projects');
      const wantTeams = types.includes('teams');

      // Short-circuit when user has no team memberships:
      // tasks + projects scoped via teams will be empty, but team search
      // (scoped via TeamMember) is also vacuously empty.
      const hasTeams = userTeamIds.length > 0;

      const [taskRows, projectRows, teamRows] = await Promise.all([
        wantTasks && hasTeams
          ? prisma.task.findMany({
              where: {
                archived: false,
                teamId: { in: userTeamIds },
                OR: [
                  { title: { contains: q, mode: 'insensitive' } },
                  { description: { contains: q, mode: 'insensitive' } },
                  { identifier: { contains: q, mode: 'insensitive' } },
                ],
              },
              select: {
                id: true,
                title: true,
                identifier: true,
              },
              orderBy: { updatedAt: 'desc' },
              take: perType,
            })
          : Promise.resolve([]),
        wantProjects && hasTeams
          ? prisma.project.findMany({
              where: {
                projectTeams: {
                  some: { teamId: { in: userTeamIds } },
                },
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { description: { contains: q, mode: 'insensitive' } },
                ],
              },
              select: {
                id: true,
                name: true,
              },
              orderBy: { updatedAt: 'desc' },
              take: perType,
            })
          : Promise.resolve([]),
        wantTeams
          ? prisma.team.findMany({
              where: {
                members: { some: { userId: req.userId! } },
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { key: { contains: q, mode: 'insensitive' } },
                  { description: { contains: q, mode: 'insensitive' } },
                ],
              },
              select: {
                id: true,
                name: true,
                key: true,
              },
              orderBy: { name: 'asc' },
              take: perType,
            })
          : Promise.resolve([]),
      ]);

      const tasks: TaskHit[] = taskRows.map((t) => ({
        id: t.id,
        title: t.title,
        identifier: t.identifier,
        type: 'task',
      }));
      const projects: ProjectHit[] = projectRows.map((p) => ({
        id: p.id,
        name: p.name,
        type: 'project',
      }));
      const teams: TeamHit[] = teamRows.map((t) => ({
        id: t.id,
        name: t.name,
        key: t.key,
        type: 'team',
      }));

      res.json({ tasks, projects, teams });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
