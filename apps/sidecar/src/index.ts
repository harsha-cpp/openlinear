import express from 'express';
import { prisma } from '@openlinear/db';
import { logger } from '@openlinear/api/logger';
import { createSidecarApp } from './app';
import { initOpenCode, registerShutdownHandlers } from './services/opencode';

const PORT = Number(process.env.API_PORT ?? 3001);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const OAUTH_INTERCEPTOR_PORT = Number(process.env.OAUTH_INTERCEPTOR_PORT ?? 1455);
const BIND_HOST = process.env.SIDECAR_BIND_HOST || '127.0.0.1';

async function loadDotenvIfPresent() {
  if (process.env.OPENLINEAR_SKIP_DOTENV === '1') return;
  try {
    const dotenv = await import('dotenv');
    const { resolve } = await import('node:path');
    const dirname = (import.meta as { dirname?: string }).dirname;
    const cwd = dirname ?? process.cwd();
    dotenv.config({ path: resolve(cwd, '../../../.env'), quiet: true });
  } catch {
    // dotenv missing or path unresolvable (e.g. inside pkg snapshot) — skip silently.
  }
}

async function start() {
  await loadDotenvIfPresent();

  const app = createSidecarApp();
  registerShutdownHandlers();

  try {
    await initOpenCode();
    logger.info('[Sidecar] OpenCode agent ready');
  } catch (error) {
    logger.error({ err: error }, '[Sidecar] Failed to initialize OpenCode');
    logger.warn('[Sidecar] Continuing without OpenCode — task execution will fail until restart');
  }

  const server = app.listen(PORT, BIND_HOST, () => {
    logger.info({ host: BIND_HOST, port: PORT }, '[Sidecar] server listening');
  });

  const interceptApp = express();
  interceptApp.get('/auth/callback', (req, res) => {
    const searchParams = new URLSearchParams(req.query as Record<string, string>);
    res.redirect(`${FRONTEND_URL}/auth/callback?${searchParams.toString()}`);
  });

  const interceptServer = interceptApp
    .listen(OAUTH_INTERCEPTOR_PORT, BIND_HOST, () => {
      logger.info(
        { host: BIND_HOST, port: OAUTH_INTERCEPTOR_PORT },
        '[Sidecar] OAuth Interceptor listening',
      );
    })
    .on('error', (err) => {
      logger.warn(
        { err: err.message, port: OAUTH_INTERCEPTOR_PORT },
        '[Sidecar] could not start OAuth Interceptor',
      );
    });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, '[Sidecar] SIGTERM received, draining...');

    const forceExit = setTimeout(() => {
      logger.fatal('[Sidecar] graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    interceptServer.close();
    server.close(async (err) => {
      if (err) logger.error({ err }, '[Sidecar] server.close error');
      try {
        await prisma.$disconnect();
        logger.info('[Sidecar] prisma disconnected');
      } catch (disconnectErr) {
        logger.error({ err: disconnectErr }, '[Sidecar] prisma disconnect failed');
      }
      clearTimeout(forceExit);
      process.exit(err ? 1 : 0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, '[Sidecar] unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, '[Sidecar] uncaughtException');
    shutdown('SIGTERM');
  });
}

start().catch((err) => {
  logger.fatal({ err }, '[Sidecar] Fatal startup error');
  process.exit(1);
});

export { createSidecarApp };
