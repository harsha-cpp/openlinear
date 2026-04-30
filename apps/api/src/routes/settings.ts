import { Router, Response, NextFunction } from 'express';
import { prisma } from '@openlinear/db';
import { z } from 'zod';
import { broadcast } from '../sse';
import { requireAuth, AuthRequest } from '../middleware/auth';

const UpdateSettingsSchema = z.object({
  parallelLimit: z.number().int().min(1).max(5).optional(),
  maxBatchSize: z.number().int().min(1).max(10).optional(),
  queueAutoApprove: z.boolean().optional(),
  stopOnFailure: z.boolean().optional(),
  conflictBehavior: z.enum(['skip', 'fail']).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field required' });

const router: Router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    let settings = await prisma.settings.findUnique({ where: { userId } });

    if (!settings) {
      settings = await prisma.settings.create({ data: { userId } });
    }

    res.json(settings);
  } catch (error) {
    next(error);
  }
});

router.patch('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const parsed = UpdateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const userId = req.userId!;
    const settings = await prisma.settings.upsert({
      where: { userId },
      update: parsed.data,
      create: { userId, ...parsed.data },
    });

    broadcast('settings:updated', settings);
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

export default router;
