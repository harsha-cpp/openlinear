import { createApp } from '@openlinear/api/app';
import executionRouter from './routes/execution';
import opencodeRouter from './routes/opencode';
import batchesRouter from './routes/batches';

export function createSidecarApp() {
  const app = createApp();

  // Execution routes (mounted on tasks, override CRUD-only routes with execute/cancel/running/logs/refresh-pr)
  app.use('/api/tasks', executionRouter);
  app.use('/api/opencode', opencodeRouter);
  app.use('/api/batches', batchesRouter);

  return app;
}
