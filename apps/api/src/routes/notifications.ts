import { Router, Response, NextFunction } from 'express';
import { prisma } from '@openlinear/db';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { broadcastToUser } from '../sse';

const router: Router = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  unreadOnly: z
    .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
      return;
    }
    const { page, pageSize, unreadOnly } = parsed.data;

    const where = {
      userId: req.userId!,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          actor: { select: { id: true, username: true, avatarUrl: true } },
        },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.userId!, readAt: null } }),
    ]);

    res.json({ notifications, page, pageSize, total, unreadCount });
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/:id/read',
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const existing = await prisma.notification.findUnique({
        where: { id },
        select: { id: true, userId: true, readAt: true },
      });
      if (!existing || existing.userId !== req.userId) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const updated = await prisma.notification.update({
        where: { id },
        data: { readAt: existing.readAt ?? new Date() },
      });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/read-all',
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await prisma.notification.updateMany({
        where: { userId: req.userId!, readAt: null },
        data: { readAt: new Date() },
      });
      res.json({ updated: result.count });
    } catch (error) {
      next(error);
    }
  },
);

export default router;

export interface CreateNotificationInput {
  recipientUserId: string;
  actorUserId: string;
  type: 'mention' | 'assignment' | 'status_change' | 'comment';
  taskId?: string | null;
  commentId?: string | null;
  body: string;
}

export async function createNotification(
  input: CreateNotificationInput,
): Promise<void> {
  if (input.recipientUserId === input.actorUserId) return;
  try {
    const row = await prisma.notification.create({
      data: {
        userId: input.recipientUserId,
        actorUserId: input.actorUserId,
        type: input.type,
        taskId: input.taskId ?? null,
        commentId: input.commentId ?? null,
        body: input.body,
      },
      include: {
        actor: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
    broadcastToUser(input.recipientUserId, 'notification:created', row);
  } catch {
    // best-effort: never break the calling mutation
  }
}
