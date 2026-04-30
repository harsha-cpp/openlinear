import { prisma, type ActivityAction, type Prisma } from '@openlinear/db';
import { logger } from '../logger';
import { broadcastToTeam, broadcastToUser } from '../sse';

export interface LogActivityInput {
  taskId?: string | null;
  projectId?: string | null;
  teamId?: string | null;
  userId: string;
  action: ActivityAction;
  payload: Prisma.InputJsonValue;
}

/**
 * Best-effort write to ActivityLog. Never throws — failures are logged and
 * swallowed so they cannot break the calling mutation handler. Also emits
 * an `activity:created` SSE event scoped to the most specific recipient
 * (team if known, otherwise the user themselves).
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const row = await prisma.activityLog.create({
      data: {
        taskId: input.taskId ?? null,
        projectId: input.projectId ?? null,
        teamId: input.teamId ?? null,
        userId: input.userId,
        action: input.action,
        payload: input.payload,
      },
    });

    // Emit to the team scope when we know it; fall back to the actor.
    if (input.teamId) {
      broadcastToTeam(input.teamId, 'activity:created', row);
    } else {
      broadcastToUser(input.userId, 'activity:created', row);
    }
  } catch (err) {
    logger.warn(
      {
        err,
        action: input.action,
        taskId: input.taskId,
        projectId: input.projectId,
        teamId: input.teamId,
      },
      '[activity] failed to log — continuing',
    );
  }
}
