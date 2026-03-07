import { createApp } from '@openlinear/api/app';
import executionRouter from './routes/execution';
import opencodeRouter from './routes/opencode';
import batchesRouter from './routes/batches';
import brainstormRouter from './routes/brainstorm';
import transcribeRouter from './routes/transcribe';

export function createSidecarApp() {
  const app = createApp();

  // Execution routes (mounted on tasks, override CRUD-only routes with execute/cancel/running/logs/refresh-pr)
  app.use('/api/tasks', executionRouter);
  app.use('/api/opencode', opencodeRouter);
  app.use('/api/batches', batchesRouter);
  app.use('/api/brainstorm', brainstormRouter);
  app.use('/api/transcribe', transcribeRouter);

  return app;
}
