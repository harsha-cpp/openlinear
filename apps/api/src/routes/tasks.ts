import { Router, Response, NextFunction } from 'express';
import { prisma } from '@openlinear/db';
import { broadcastToTask, broadcastToTeam, broadcastToUser } from '../sse';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody, validateQuery, ValidatedRequest } from '../middleware/validate';
import { getUserTeamIds } from '../services/team-scope';
import {
  assertTaskOwned,
  assertProjectOwned,
  assertTeamRole,
  OwnershipError,
} from '../services/ownership';
import { ValidationError } from '../errors';
import { logActivity } from '../services/activity';
import { createNotification } from './notifications';
import {
  createTaskBodySchema,
  updateTaskBodySchema,
  listTasksQuerySchema,
  CreateTaskBody,
  UpdateTaskBody,
  ListTasksQuery,
} from '../schemas/tasks';

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

async function resolveProjectTeamId(projectId: string): Promise<{ teamId: string }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { projectTeams: { select: { teamId: true } } },
  });

  if (!project) {
    throw new OwnershipError('project', projectId, 'not_found');
  }

  if (project.projectTeams.length === 0) {
    throw new ValidationError('Project must have a team');
  }

  if (project.projectTeams.length > 1) {
    throw new ValidationError('Project must have exactly one team');
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

router.get(
  '/',
  requireAuth,
  validateQuery(listTasksQuerySchema),
  async (req: AuthRequest & ValidatedRequest<unknown, ListTasksQuery>, res: Response, next: NextFunction) => {
    try {
      const { teamId, projectId } = req.validQuery!;

      const userTeamIds = await getUserTeamIds(req.userId!);
      const where: Record<string, unknown> = { archived: false };

      if (teamId) {
        if (!userTeamIds.includes(teamId)) {
          throw new OwnershipError('team', teamId, 'forbidden');
        }
        where.teamId = teamId;
      } else {
        where.teamId = { in: userTeamIds };
      }
      if (projectId) where.projectId = projectId;

      const tasks = await prisma.task.findMany({
        where,
        include: taskInclude,
        orderBy: { createdAt: 'desc' },
      });

      res.json(tasks.map(flattenLabels));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/',
  requireAuth,
  validateBody(createTaskBodySchema),
  async (req: AuthRequest & ValidatedRequest<CreateTaskBody>, res: Response, next: NextFunction) => {
    try {
      const { title, description, priority, status, labelIds, teamId, projectId, dueDate } =
        req.validBody!;

      let resolvedTeamId = teamId;

      if (projectId) {
        await assertProjectOwned(projectId, req.userId!);
        const projectTeam = await resolveProjectTeamId(projectId);
        resolvedTeamId = projectTeam.teamId;
      }

      if (!resolvedTeamId) {
        throw new ValidationError('Task must belong to a team or a project');
      }

      await assertTeamRole(resolvedTeamId, req.userId!, ['owner', 'admin', 'member']);

      const task: TaskWithLabels = await prisma.$transaction(async (tx) => {
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

      const transformedTask = flattenLabels(task);
      broadcastToTask('task:created', transformedTask);

      await logActivity({
        taskId: task.id,
        projectId: task.projectId,
        teamId: task.teamId,
        userId: req.userId!,
        action: 'task_created',
        payload: {
          title: task.title,
          status: task.status,
          priority: task.priority,
          identifier: task.identifier,
        },
      });

      const taskAssigneeId = (task as { assigneeId?: string | null }).assigneeId;
      if (taskAssigneeId && taskAssigneeId !== req.userId) {
        await createNotification({
          recipientUserId: taskAssigneeId,
          actorUserId: req.userId!,
          type: 'assignment',
          taskId: task.id,
          body: `Assigned to you: ${task.title}`,
        });
      }

      res.status(201).json(transformedTask);
    } catch (error) {
      next(error);
    }
  },
);

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

router.patch(
  '/:id',
  requireAuth,
  validateBody(updateTaskBodySchema),
  async (req: AuthRequest & ValidatedRequest<UpdateTaskBody>, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const existing = await assertTaskOwned(id, req.userId!);
      const previousTaskMeta = await prisma.task.findUnique({
        where: { id },
        select: { assigneeId: true, creatorId: true, title: true },
      });

      const { labelIds, teamId, projectId, dueDate, ...updateData } = req.validBody!;

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
      broadcastToTask('task:updated', transformedTask);

      const statusChanged =
        updateData.status !== undefined && updateData.status !== existing.status;
      const newAssigneeId = (updateData as { assigneeId?: string | null }).assigneeId;
      const previousAssigneeId = previousTaskMeta?.assigneeId ?? null;
      const assigneeChanged =
        newAssigneeId !== undefined && newAssigneeId !== previousAssigneeId;

      if (statusChanged) {
        await logActivity({
          taskId: task.id,
          projectId: task.projectId,
          teamId: task.teamId,
          userId: req.userId!,
          action: 'task_status_changed',
          payload: {
            from: existing.status,
            to: task.status,
            title: task.title,
          },
        });
        const creatorId = previousTaskMeta?.creatorId ?? null;
        if (creatorId && creatorId !== req.userId) {
          await createNotification({
            recipientUserId: creatorId,
            actorUserId: req.userId!,
            type: 'status_change',
            taskId: task.id,
            body: `Status changed: ${task.title} → ${task.status}`,
          });
        }
      } else {
        await logActivity({
          taskId: task.id,
          projectId: task.projectId,
          teamId: task.teamId,
          userId: req.userId!,
          action: 'task_updated',
          payload: { fields: Object.keys(updateData) },
        });
      }

      if (assigneeChanged && newAssigneeId && newAssigneeId !== req.userId) {
        await createNotification({
          recipientUserId: newAssigneeId,
          actorUserId: req.userId!,
          type: 'assignment',
          taskId: task.id,
          body: `Assigned to you: ${task.title}`,
        });
        await logActivity({
          taskId: task.id,
          projectId: task.projectId,
          teamId: task.teamId,
          userId: req.userId!,
          action: 'task_assigned',
          payload: { from: previousAssigneeId, to: newAssigneeId },
        });
      }

      res.json(transformedTask);
    } catch (error) {
      next(error);
    }
  },
);

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const owned = await assertTaskOwned(id, req.userId!);

    const fullTask = await prisma.task.findUnique({
      where: { id },
      select: { teamId: true, creatorId: true },
    });

    await prisma.task.update({
      where: { id },
      data: { archived: true },
    });

    const teamId = fullTask?.teamId ?? owned.teamId ?? null;
    const creatorId = fullTask?.creatorId ?? null;
    if (teamId) {
      broadcastToTeam(teamId, 'task:deleted', { id });
    } else if (creatorId) {
      broadcastToUser(creatorId, 'task:deleted', { id });
    } else {
      broadcastToUser(req.userId!, 'task:deleted', { id });
    }

    await logActivity({
      taskId: id,
      projectId: owned.projectId,
      teamId,
      userId: req.userId!,
      action: 'task_archived',
      payload: { id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
