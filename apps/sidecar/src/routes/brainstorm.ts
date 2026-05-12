import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@openlinear/db';
import { requireAuth, AuthRequest } from '@openlinear/api/middleware';
import { checkBrainstormAvailability, generateQuestions, generateTasks } from '../services/brainstorm';
import { gatherCodebaseContext } from '../services/codebase-context';

const QuestionsSchema = z.object({
  prompt: z.string().min(1).max(5000),
  webSearch: z.boolean().optional().default(false),
  projectId: z.string().optional(),
});

const GenerateSchema = z.object({
  prompt: z.string().min(1).max(5000),
  answers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })).optional().default([]),
  webSearch: z.boolean().optional().default(false),
  mode: z.enum(['basic', 'pro']).optional().default('basic'),
  taskCount: z.number().int().min(1).max(20).optional().default(5),
  projectId: z.string().optional(),
});

const router: Router = Router();

async function resolveRepoPath(projectId: string | undefined): Promise<string | null> {
  if (!projectId) return null;
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { repository: true },
    });
    return project?.localPath || null;
  } catch {
    return null;
  }
}

router.get('/availability', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const result = checkBrainstormAvailability();
    res.json(result);
  } catch (error) {
    console.error('[Brainstorm] Error checking availability:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

router.post('/questions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = QuestionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { available } = checkBrainstormAvailability();
    if (!available) {
      res.status(503).json({ error: 'No AI provider configured' });
      return;
    }

    const { prompt, webSearch, projectId } = parsed.data;
    const repoPath = await resolveRepoPath(projectId);
    const codebaseContext = repoPath
      ? await gatherCodebaseContext(repoPath, prompt, { maxFiles: 8, maxLinesPerFile: 100 })
      : { files: [], totalTokenEstimate: 0 };

    const questions = await generateQuestions(prompt, webSearch, codebaseContext);
    res.json({ questions });
  } catch (error) {
    console.error('[Brainstorm] Error generating questions:', error);
    res.status(500).json({ error: 'Failed to generate questions' });
  }
});

router.post('/generate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = GenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { available } = checkBrainstormAvailability();
    if (!available) {
      res.status(503).json({ error: 'No AI provider configured' });
      return;
    }

    const { prompt, answers, webSearch, mode, taskCount, projectId } = parsed.data;

    const repoPath = await resolveRepoPath(projectId);
    const limits = mode === 'pro'
      ? { maxFiles: 8, maxLinesPerFile: 100 }
      : { maxFiles: 5, maxLinesPerFile: 60 };
    const codebaseContext = repoPath
      ? await gatherCodebaseContext(repoPath, prompt, limits)
      : { files: [], totalTokenEstimate: 0 };

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      for await (const task of generateTasks(prompt, answers, webSearch, mode, taskCount, codebaseContext)) {
        res.write(JSON.stringify(task) + '\n');
      }
      res.end();
    } catch (streamError) {
      console.error('[Brainstorm] Error during task generation stream:', streamError);
      const message = streamError instanceof Error ? streamError.message : 'Stream error';
      res.write(JSON.stringify({ error: message }) + '\n');
      res.end();
    }
  } catch (error) {
    console.error('[Brainstorm] Error generating tasks:', error);
    res.status(500).json({ error: 'Failed to generate tasks' });
  }
});

export default router;
