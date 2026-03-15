import { config } from 'dotenv';
import { resolve } from 'path';
import express from 'express';

config({ path: resolve(import.meta.dirname, '../.env') });
config({ path: resolve(import.meta.dirname, '../../../.env') });

import { createSidecarApp } from './app';
import { initOpenCode, registerShutdownHandlers } from './services/opencode';

const app = createSidecarApp();
const PORT = Number(process.env.API_PORT ?? 3001);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const DESKTOP_CALLBACK_URL = process.env.OPENLINEAR_DESKTOP_CALLBACK_URL || 'openlinear://callback';

registerShutdownHandlers();

async function start() {
  try {
    await initOpenCode();
    console.log('[Sidecar] OpenCode agent ready');
  } catch (error) {
    console.error('[Sidecar] Failed to initialize OpenCode:', error);
    console.warn('[Sidecar] Continuing without OpenCode - task execution will fail');
  }

  app.listen(PORT, () => {
    console.log(`[Sidecar] Server running on http://localhost:${PORT}`);
    console.log(`[Sidecar] Health: http://localhost:${PORT}/health`);
    console.log(`[Sidecar] SSE: http://localhost:${PORT}/api/events`);
  });

  const interceptApp = express();
  interceptApp.get('/callback', (req, res) => {
    const searchParams = new URLSearchParams(req.query as Record<string, string>);
    res.redirect(`${DESKTOP_CALLBACK_URL}?${searchParams.toString()}`);
  });
  interceptApp.get('/auth/callback', (req, res) => {
    const searchParams = new URLSearchParams(req.query as Record<string, string>);
    res.redirect(`${FRONTEND_URL}/auth/callback?${searchParams.toString()}`);
  });
  
  interceptApp.listen(1455, () => {
    console.log(`[Sidecar] OAuth Interceptor running on http://localhost:1455`);
  }).on('error', (err) => {
    console.warn(`[Sidecar] Could not start OAuth Interceptor on port 1455: ${err.message}`);
  });
}

start();

export { app };
