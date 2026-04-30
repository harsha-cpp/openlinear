import { Router, Response, NextFunction } from 'express';
import { prisma } from '@openlinear/db';
import { z } from 'zod';
import { broadcast } from '../sse';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getUserTeamIds } from '../services/team-scope';
import {
  assertTaskOwned,
  assertProjectOwned,
  assertTeamRole,
  OwnershipError,
} from '../services/ownership';

const PriorityEnum = z.enum(['low', 'medium', 'high']);
const StatusEnum = z.enum(['todo', 'in_progress', 'done', 'cancelled']);

const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: PriorityEnum.optional().default('medium'),
  status: StatusEnum.optional().default('todo'),
  labelIds: z.array(z.string().uuid()).optional().default([]),
  teamId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

const UpdateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: PriorityEnum.optional(),
  status: StatusEnum.optional(),
  labelIds: z.array(z.string().uuid()).optional(),
  teamId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

interface Label {
  id: string;
  name: string;
  color: string;
  priority: number;
}

interface TaskLabel {
  taskId: string;
  labelId: string;
  label: Label;
}

interface TaskWithLabels {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  sessionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  labels: TaskLabel[];
  teamId: string | null;
  projectId: string | null;
  number: number | null;
  identifier: string | null;
  team?: { id: string; name: string; key: string; color: string } | null;
  project?: { id: string; name: string; status: string; color: string } | null;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenLabels(task: any) {
  const { labels, ...rest } = task;
  return {
    ...rest,
    labels: (labels as TaskLabel[]).map((tl: TaskLabel) => tl.label),
  };
}

async function resolveProjectTeamId(projectId: string): Promise<{ teamId: string } | { error: string }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { projectTeams: { select: { teamId: true } } },
  });

  if (!project) {
    return { error: 'Project not found' };
  }

  if (project.projectTeams.length === 0) {
    return { error: 'Project must have a team' };
  }

  if (project.projectTeams.length > 1) {
    return { error: 'Project must have exactly one team' };
  }

  return { teamId: project.projectTeams[0].teamId };
}

const taskInclude = {
  labels: { include: { label: true } },
  team: { select: { id: true, name: true, key: true, color: true } },
  project: { select: { id: true, name: true, status: true, color: true } },
};

const router: Router = Router();

router.get('/archived', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const teamIds = await getUserTeamIds(req.userId!);
    const tasks = await prisma.task.findMany({
      where: { archived: true, teamId: { in: teamIds } },
      include: taskInclude,
      orderBy: { updatedAt: 'desc' },
    });
    res.json(tasks.map(flattenLabels));
  } catch (error) {
    next(error);
  }
});

router.delete('/archived', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const teamIds = await getUserTeamIds(req.userId!);
    await prisma.task.deleteMany({
      where: { archived: true, teamId: { in: teamIds } },
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.delete('/archived/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const owned = await assertTaskOwned(id, req.userId!);
    if (!owned.archived) {
      throw new OwnershipError('task', id, 'not_found');
    }
    await prisma.task.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { teamId, projectId } = req.query;

    const userTeamIds = await getUserTeamIds(req.userId!);
    const where: Record<string, unknown> = { archived: false };

    if (teamId) {
      if (!userTeamIds.includes(teamId as string)) {
        throw new OwnershipError('team', teamId as string, 'forbidden');
      }
      where.teamId = teamId as string;
    } else {
      where.teamId = { in: userTeamIds };
    }
    if (projectId) where.projectId = projectId as string;

    const tasks = await prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    });

    res.json(tasks.map(flattenLabels));
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { title, description, priority, status, labelIds, teamId, projectId, dueDate } = parsed.data;

    let resolvedTeamId = teamId;

    if (projectId) {
      await assertProjectOwned(projectId, req.userId!);
      const projectTeam = await resolveProjectTeamId(projectId);
      if ('error' in projectTeam) {
        res.status(400).json({ error: projectTeam.error });
        return;
      }
      resolvedTeamId = projectTeam.teamId;
    }

    if (resolvedTeamId) {
      await assertTeamRole(resolvedTeamId, req.userId!, ['owner', 'admin', 'member']);
    }

    let task: TaskWithLabels;

    if (resolvedTeamId) {
      task = await prisma.$transaction(async (tx) => {
        const team = await tx.team.update({
          where: { id: resolvedTeamId },
          data: { nextIssueNumber: { increment: 1 } },
          select: { key: true, nextIssueNumber: true },
        });
        const number = team.nextIssueNumber - 1;
        const identifier = `${team.key}-${number}`;

        const created = await tx.task.create({
          data: {
            title,
            description,
            priority,
            status,
            teamId: resolvedTeamId,
            projectId: projectId || undefined,
            number,
            identifier,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            creatorId: req.userId!,
            labels: {
              create: labelIds.map((labelId) => ({ labelId })),
            },
          },
          include: taskInclude,
        });
        return created;
      }, { timeout: 15000, maxWait: 5000 });
    } else {
      task = await prisma.task.create({
        data: {
          title,
          description,
          priority,
          status,
          projectId: projectId || undefined,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          creatorId: req.userId!,
          labels: {
            create: labelIds.map((labelId) => ({ labelId })),
          },
        },
        include: taskInclude,
      });
    }

    const transformedTask = flattenLabels(task);
    broadcast('task:created', transformedTask);
    res.status(201).json(transformedTask);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await assertTaskOwned(id, req.userId!);

    const task = await prisma.task.findUnique({
      where: { id },
      include: taskInclude,
    });

    if (!task) {
      throw new OwnershipError('task', id, 'not_found');
    }

    res.json(flattenLabels(task));
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const parsed = UpdateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const existing = await assertTaskOwned(id, req.userId!);

    const { labelIds, teamId, projectId, dueDate, ...updateData } = parsed.data;

    const data: Record<string, unknown> = { ...updateData };

    if (dueDate !== undefined) {
      data.dueDate = dueDate ? new Date(dueDate) : null;
    }

    if (updateData.status === 'in_progress' && existing.status !== 'in_progress') {
      data.executionStartedAt = null;
      data.executionPausedAt = null;
      data.executionElapsedMs = 0;
    }

    if (projectId !== undefined) {
      if (projectId) {
        await assertProjectOwned(projectId, req.userId!);
        const projectTeam = await resolveProjectTeamId(projectId);
        if ('error' in projectTeam) {
          res.status(400).json({ error: projectTeam.error });
          return;
        }
        data.projectId = projectId;
        data.teamId = projectTeam.teamId;
      } else {
        data.projectId = null;
        data.teamId = null;
      }
    } else if (teamId !== undefined) {
      if (teamId) {
        await assertTeamRole(teamId, req.userId!, ['owner', 'admin', 'member']);
      }
      data.teamId = teamId;
    }
    if (labelIds !== undefined) {
      data.labels = {
        deleteMany: {},
        create: labelIds.map((labelId) => ({ labelId })),
      };
    }

    const task = await prisma.task.update({
      where: { id },
      data,
      include: taskInclude,
    });

    const transformedTask = flattenLabels(task);
    broadcast('task:updated', transformedTask);
    res.json(transformedTask);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await assertTaskOwned(id, req.userId!);

    await prisma.task.update({
      where: { id },
      data: { archived: true },
    });

    broadcast('task:deleted', { id });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
