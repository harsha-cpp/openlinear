import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@openlinear/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody, ValidatedRequest } from '../middleware/validate';
import { HttpError } from '../errors';
import {
  repoUrlBodySchema,
  importRepoBodySchema,
  updateBaseBranchBodySchema,
  RepoUrlBody,
  ImportRepoBody,
  UpdateBaseBranchBody,
} from '../schemas/repos';
import {
  getGitHubRepos,
  addRepository,
  setActiveRepository,
  getActiveRepository,
  getUserRepositories,
  GitHubRepo,
  addRepositoryByUrl,
} from '../services/github';

const router: Router = Router();

router.post(
  '/url',
  validateBody(repoUrlBodySchema),
  async (req: ValidatedRequest<RepoUrlBody>, res: Response, next: NextFunction) => {
    try {
      const project = await addRepositoryByUrl(req.validBody!.url);
      res.status(201).json(project);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add repository';
      return next(new HttpError(400, 'REPOSITORY_CONNECT_FAILED', message));
    }
  },
);

router.get('/active/public', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.repository.findFirst({
      where: { userId: null, isActive: true },
    });
    res.json(project);
  } catch (err) {
    next(err);
  }
});

router.get('/public', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const projects = await prisma.repository.findMany({
      where: { userId: null },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/activate/public', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.repository.updateMany({
      where: { userId: null },
      data: { isActive: false },
    });

    const id = req.params.id as string;
    const project = await prisma.repository.update({
      where: { id },
      data: { isActive: true },
    });
    res.json(project);
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const projects = await getUserRepositories(req.userId!);
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

router.get('/github', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { accessToken: true },
    });

    if (!user?.accessToken) {
      return next(
        new HttpError(403, 'GITHUB_NOT_LINKED', 'GitHub account not linked. Please sign in with GitHub first.'),
      );
    }

    const repos = await getGitHubRepos(user.accessToken);
    res.json(repos);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/import',
  requireAuth,
  validateBody(importRepoBodySchema),
  async (req: AuthRequest & ValidatedRequest<ImportRepoBody>, res: Response, next: NextFunction) => {
    try {
      const repo = req.validBody!.repo as unknown as GitHubRepo;
      const project = await addRepository(req.userId!, repo, true);
      res.status(201).json(project);
    } catch (err) {
      next(err);
    }
  },
);

router.post('/:id/activate', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const project = await setActiveRepository(req.userId!, id);
    res.json(project);
  } catch (err) {
    next(err);
  }
});

router.get('/active', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const project = await getActiveRepository(req.userId!);
    res.json(project);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/active/base-branch',
  requireAuth,
  validateBody(updateBaseBranchBodySchema),
  async (req: AuthRequest & ValidatedRequest<UpdateBaseBranchBody>, res: Response, next: NextFunction) => {
    try {
      const activeRepository = await prisma.repository.findFirst({
        where: { userId: req.userId!, isActive: true },
        select: { id: true },
      });

      if (!activeRepository) {
        return next(new HttpError(404, 'NO_ACTIVE_REPO', 'No active repository selected'));
      }

      const updated = await prisma.repository.update({
        where: { id: activeRepository.id },
        data: { defaultBranch: req.validBody!.baseBranch },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
