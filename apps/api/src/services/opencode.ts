import { broadcast } from '../sse';
import { getFeatureFlags, validateFlagConfiguration } from '../config/feature-flags';

export interface OpenCodeStatus {
  mode: 'local-only';
  activeContainers: number;
  containers: Array<any>;
}

export function getOpenCodeStatus(): OpenCodeStatus {
  return {
    mode: 'local-only',
    activeContainers: 0,
    containers: [],
  };
}

export async function initOpenCode(): Promise<void> {
  const flags = getFeatureFlags();
  const validation = validateFlagConfiguration(flags);
  
  if (!validation.valid) {
    console.error('[OpenCode] Invalid feature flag configuration:', validation.errors);
    throw new Error(`Invalid feature flag configuration: ${validation.errors.join(', ')}`);
  }

  console.log('[OpenCode] Server execution is disabled. Running in local-only mode.');
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

// Dummy implementations for removed container manager
export function getContainerStatus(userId: string): null {
  return null;
}

export async function ensureContainer(userId: string): Promise<any> {
  throw new Error('Server execution is disabled. Please execute the task from the desktop app.');
}

export async function destroyContainer(userId: string): Promise<void> {
  // No-op
}

export async function getClientForUser(userId: string, directory?: string): Promise<any> {
  throw new Error('Server execution is disabled. Please execute the task from the desktop app.');
}

export function toContainerPath(hostPath: string): string {
  return hostPath;
}
