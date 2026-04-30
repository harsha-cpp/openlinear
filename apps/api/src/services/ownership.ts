import { prisma } from '@openlinear/db';
import { getUserTeamIds } from './team-scope';

export type OwnershipResourceType =
  | 'task'
  | 'project'
  | 'team'
  | 'comment'
  | 'label';

export type OwnershipReason =
  | 'not_found'
  | 'forbidden'
  | 'role_required';

/**
 * Single typed error raised by every ownership assertion. The global error
 * middleware in app.ts maps this to a 403 response shaped as
 * `{ error:'forbidden', code:'OWNERSHIP_REQUIRED', resourceType, resourceId }`.
 *
 * `reason` is internal-only (logged but not echoed to clients) so we don't
 * leak which resource exists vs which one a user lacks access to.
 */
export class OwnershipError extends Error {
  readonly code = 'OWNERSHIP_REQUIRED' as const;
  constructor(
    public readonly resourceType: OwnershipResourceType,
    public readonly resourceId: string,
    public readonly reason: OwnershipReason,
    public readonly requiredRoles?: ReadonlyArray<string>,
  ) {
    super(
      `OwnershipError: ${reason} on ${resourceType} ${resourceId}` +
        (requiredRoles?.length ? ` (required: ${requiredRoles.join(',')})` : ''),
    );
    this.name = 'OwnershipError';
  }
}

export function isOwnershipError(err: unknown): err is OwnershipError {
  return err instanceof OwnershipError;
}

export interface OwnedTask {
  id: string;
  teamId: string | null;
  projectId: string | null;
  archived: boolean;
  status: string;
}

/**
 * Tasks with no `teamId` are legacy/personal tasks accessible to any
 * authenticated user (backward compat). Tasks with a `teamId` require team
 * membership. Returns the task so callers don't refetch.
 */
export async function assertTaskOwned(
  taskId: string,
  userId: string,
): Promise<OwnedTask> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      teamId: true,
      projectId: true,
      archived: true,
      status: true,
    },
  });

  if (!task) {
    throw new OwnershipError('task', taskId, 'not_found');
  }

  if (task.teamId) {
    const teamIds = await getUserTeamIds(userId);
    if (!teamIds.includes(task.teamId)) {
      throw new OwnershipError('task', taskId, 'forbidden');
    }
  }

  return task;
}

export interface OwnedProject {
  id: string;
  teamIds: string[];
}

export async function assertProjectOwned(
  projectId: string,
  userId: string,
): Promise<OwnedProject> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      projectTeams: { select: { teamId: true } },
    },
  });

  if (!project) {
    throw new OwnershipError('project', projectId, 'not_found');
  }

  const projectTeamIds = project.projectTeams.map((pt) => pt.teamId);

  if (projectTeamIds.length === 0) {
    throw new OwnershipError('project', projectId, 'forbidden');
  }

  const userTeamIds = await getUserTeamIds(userId);
  const overlap = projectTeamIds.some((tid) => userTeamIds.includes(tid));
  if (!overlap) {
    throw new OwnershipError('project', projectId, 'forbidden');
  }

  return { id: project.id, teamIds: projectTeamIds };
}

export type TeamRole = 'owner' | 'admin' | 'member';

/**
 * Throws OwnershipError('team', teamId, 'not_found') when the team doesn't
 * exist OR the user has no membership (collapsed to avoid existence-leaks).
 * Throws 'role_required' when membership exists but role is insufficient.
 */
export async function assertTeamRole(
  teamId: string,
  userId: string,
  roles: ReadonlyArray<TeamRole>,
): Promise<{ teamId: string; userId: string; role: TeamRole }> {
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { role: true },
  });

  if (!membership) {
    throw new OwnershipError('team', teamId, 'not_found');
  }

  if (!roles.includes(membership.role as TeamRole)) {
    throw new OwnershipError('team', teamId, 'role_required', roles);
  }

  return { teamId, userId, role: membership.role as TeamRole };
}

export interface OwnedComment {
  id: string;
  taskId: string;
  userId: string;
}

/**
 * Author OR a member of the comment's task team is allowed.
 * Consumed by T10 (comment edit/delete).
 */
export async function assertCommentOwned(
  commentId: string,
  userId: string,
): Promise<OwnedComment> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      taskId: true,
      userId: true,
      task: { select: { teamId: true } },
    },
  });

  if (!comment) {
    throw new OwnershipError('comment', commentId, 'not_found');
  }

  if (comment.userId === userId) {
    return { id: comment.id, taskId: comment.taskId, userId: comment.userId };
  }

  if (comment.task?.teamId) {
    const teamIds = await getUserTeamIds(userId);
    if (teamIds.includes(comment.task.teamId)) {
      return { id: comment.id, taskId: comment.taskId, userId: comment.userId };
    }
  }

  throw new OwnershipError('comment', commentId, 'forbidden');
}
