import { Router, Response } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { getOpenCodeStatus } from '../services/opencode';

const router: Router = Router();

router.get('/status', (_req, res: Response) => {
  res.json(getOpenCodeStatus());
});

router.get('/setup-status', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    res.json({
      providers: [],
      ready: false,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get setup status' });
  }
});

export default router;
