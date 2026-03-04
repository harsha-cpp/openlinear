import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import labelRoutes from './routes/labels';
import tasksRouter from './routes/tasks';
import settingsRouter from './routes/settings';
import batchesRouter from './routes/batches';
import authRouter from './routes/auth';
import reposRouter from './routes/repos';
import teamsRouter from './routes/teams';
import projectsRouter from './routes/projects';
import inboxRouter from './routes/inbox';
import opencodeRouter from './routes/opencode';
import executionRouter from './routes/execution';
import brainstormRouter from './routes/brainstorm';
import transcribeRouter from './routes/transcribe';
import { clients, SSEClient } from './sse';

export function createApp(): Application {
  const app: Application = express();

  const allowedOrigins = [
    process.env.CORS_ORIGIN || 'http://localhost:3000',
    'http://tauri.localhost',
    'https://tauri.localhost',
    'tauri://localhost',
    'http://localhost:3001', // API itself for OAuth redirects
    'https://rixie.in',
    'https://dashboard.rixie.in',
  ];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc)
      if (!origin) {
        callback(null, true);
        return;
      }
      // Check allowed origins
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      // Allow any localhost origin for development
      if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) {
        callback(null, true);
        return;
      }
      console.warn(`[CORS] Blocked request from origin: ${origin}`);
      callback(new Error(`CORS: ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-openlinear-client'],
  }));
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/auth', authRouter);
  app.use('/api/repos', reposRouter);
  app.use('/api/labels', labelRoutes);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/batches', batchesRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/inbox', inboxRouter);
  app.use('/api/opencode', opencodeRouter);
  app.use('/api/execution', executionRouter);
  app.use('/api/brainstorm', brainstormRouter);
  app.use('/api/transcribe', transcribeRouter);

  app.get('/api/install', (_req: Request, res: Response) => {
    res.redirect(302, 'https://raw.githubusercontent.com/kaizen403/openlinear/main/apps/landing/public/install.sh');
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      clients: clients.size
    });
  });

  app.get('/api/events', (req: Request, res: Response) => {
    const clientId = req.query.clientId as string || crypto.randomUUID();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const client: SSEClient = { id: clientId, res };
    clients.set(clientId, client);

    console.log(`[SSE] Client connected: ${clientId} (total: ${clients.size})`);

    res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

    const heartbeatInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(`: heartbeat\n\n`);
      }
    }, 30000);

    const cleanup = () => {
      clearInterval(heartbeatInterval);
      clients.delete(clientId);
      console.log(`[SSE] Client disconnected: ${clientId} (total: ${clients.size})`);
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
  });

  return app;
}
