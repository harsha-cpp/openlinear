import { broadcast } from '../sse';

export interface OpenCodeStatus {
  mode: 'local-only';
}

export function getOpenCodeStatus(): OpenCodeStatus {
  return { mode: 'local-only' };
}

export async function initOpenCode(): Promise<void> {
  console.log('[OpenCode] Running in local-only mode.');
  broadcast('opencode:status', { status: 'ready', mode: 'local-only' });
}

export async function shutdownOpenCode(): Promise<void> {
  broadcast('opencode:status', { status: 'stopped' });
}

export function registerShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    console.log(`[OpenCode] Received ${signal}, shutting down...`);
    await shutdownOpenCode();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('beforeExit', () => shutdownOpenCode());
}
