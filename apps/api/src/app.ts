import express, {
  Application,
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import labelRoutes from './routes/labels';
import tasksRouter from './routes/tasks';
import settingsRouter from './routes/settings';
import authRouter from './routes/auth';
import reposRouter from './routes/repos';
import teamsRouter from './routes/teams';
import projectsRouter from './routes/projects';
import inboxRouter from './routes/inbox';
import { clients, SSEClient } from './sse';
import { logger } from './logger';
import { isOwnershipError } from './services/ownership';

function buildCorsOrigin(): cors.CorsOptions['origin'] {
  const raw = process.env.CORS_ORIGIN || 'http://localhost:3000';
  const allowed = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  allowed.add('tauri://localhost');
  allowed.add('https://tauri.localhost');

  return (origin, callback) => {
    if (!origin || allowed.has(origin)) {
      callback(null, true);
      return;
    }
    // Bug fix (T4): never throw inside the CORS origin callback — that escapes
    // the Express middleware error-handling chain on some versions and crashes
    // the request. Returning false produces a clean CORS rejection.
    callback(null, false);
  };
}

function makeRateLimiter(windowMs: number, max: number, name: string): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Skip Server-Sent Events — long-lived connections must never be rate-limited
    skip: (req) => req.path === '/api/events' || req.path.startsWith('/api/events'),
    handler: (req, res) => {
      res.status(429).json({
        error: 'rate_limited',
        scope: name,
        retryAfterSeconds: Math.ceil(windowMs / 1000),
      });
    },
  });
}

export function createApp(): Application {
  const app: Application = express();

  // Security headers — CSP disabled because Tauri owns CSP in the desktop UI
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          (typeof incoming === 'string' && incoming) || randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // Rate limiters mount BEFORE body parsing so floods are cheap to reject
  const defaultLimiter = makeRateLimiter(60_000, 100, 'default');
  const authLimiter = makeRateLimiter(60_000, 5, 'auth');
  const reposUrlLimiter = makeRateLimiter(60_000, 10, 'repos-url');

  app.use((req, res, next) => {
    if (req.path === '/api/events' || req.path.startsWith('/api/events')) {
      return next();
    }
    return defaultLimiter(req, res, next);
  });
  app.use('/api/auth', authLimiter);
  app.use('/api/repos/url', reposUrlLimiter);

  app.use(
    cors({
      origin: buildCorsOrigin(),
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.use('/api/auth', authRouter);
  app.use('/api/repos', reposRouter);
  app.use('/api/labels', labelRoutes);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/inbox', inboxRouter);

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      clients: clients.size,
    });
  });

  app.get('/api/events', (req: Request, res: Response) => {
    const clientId = (req.query.clientId as string) || randomUUID();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const client: SSEClient = { id: clientId, res };
    clients.set(clientId, client);

    req.log?.info({ clientId, total: clients.size }, '[SSE] client connected');

    res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

    const heartbeatInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(`: heartbeat\n\n`);
      }
    }, 30000);

    const cleanup = () => {
      clearInterval(heartbeatInterval);
      clients.delete(clientId);
      req.log?.info(
        { clientId, total: clients.size },
        '[SSE] client disconnected',
      );
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
  });

  // 7. Global error middleware — MUST be last
  // 7. Global error middleware — MUST be last
  const errorHandler: ErrorRequestHandler = (
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    const requestId =
      (res.getHeader('x-request-id') as string | undefined) ??
      (typeof (req as Request & { id?: unknown }).id === 'string'
        ? ((req as Request & { id?: string }).id as string)
        : undefined) ??
      randomUUID();

    const logFn = (req as Request & { log?: typeof logger }).log ?? logger;
    logFn.error({ err, requestId, path: req.path, method: req.method }, 'unhandled error');

    if (res.headersSent) {
      return;
    }

    if (isOwnershipError(err)) {
      const status = err.reason === 'not_found' ? 404 : 403;
      res.status(status).json({
        error: status === 404 ? 'not_found' : 'forbidden',
        code: err.code,
        resourceType: err.resourceType,
        resourceId: err.resourceId,
        ...(err.requiredRoles ? { requiredRoles: err.requiredRoles } : {}),
        requestId,
      });
      return;
    }

    const status =
      typeof (err as { statusCode?: unknown })?.statusCode === 'number'
        ? ((err as { statusCode: number }).statusCode)
        : typeof (err as { status?: unknown })?.status === 'number'
          ? ((err as { status: number }).status)
          : 500;

    res.status(status).json({
      error: status >= 500 ? 'internal_error' : 'request_failed',
      requestId,
    });
  };
  app.use(errorHandler);

  return app;
}
