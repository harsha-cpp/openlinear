import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { createOpencodeClient } from '@opencode-ai/sdk';
import type { OpencodeClient } from '@opencode-ai/sdk';
import { broadcast } from '@openlinear/api/sse';

const OPENCODE_PORT = parseInt(process.env.OPENCODE_PORT || '4096', 10);
const OPENCODE_HOST = process.env.OPENCODE_HOST || '127.0.0.1';
const OPENCODE_TIMEOUT = parseInt(process.env.OPENCODE_TIMEOUT || '10000', 10);
const OPENCODE_PROBE_TIMEOUT = parseInt(process.env.OPENCODE_PROBE_TIMEOUT || '1500', 10);

let serverHandle: { url: string; close(): void } | null = null;

// Resolves the opencode binary path:
// 1. OPENCODE_BIN env var override
// 2. Bundled sidecar next to this binary (Tauri target-triple naming)
// 3. Fallback to system PATH (dev mode)
function resolveOpencodeBinary(): string {
  if (process.env.OPENCODE_BIN) {
    return process.env.OPENCODE_BIN;
  }

  const binDir = dirname(process.execPath);
  const platform = process.platform;
  const arch = process.arch;

  let triple: string;
  if (platform === 'darwin') {
    triple = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  } else {
    triple = arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
  }

  const bundled = join(binDir, `opencode-${triple}`);
  if (existsSync(bundled)) {
    return bundled;
  }

  return 'opencode';
}

// Replaces the SDK's createOpencodeServer() which hardcodes spawn("opencode").
// This version uses the resolved binary path so it works with bundled sidecars.
function spawnOpencodeServer(
  bin: string,
  hostname: string,
  port: number,
  timeout: number,
): Promise<{ url: string; close(): void }> {
  const args = ['serve', `--hostname=${hostname}`, `--port=${port}`];
  const proc = spawn(bin, args, {
    env: { ...process.env },
  });

  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      proc.kill();
      reject(new Error(`opencode server did not start within ${timeout}ms`));
    }, timeout);

    let output = '';

    proc.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      for (const line of output.split('\n')) {
        if (line.startsWith('opencode server listening')) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
          if (!match) {
            clearTimeout(id);
            proc.kill();
            reject(new Error(`Failed to parse server URL from: ${line}`));
            return;
          }
          clearTimeout(id);
          resolve({ url: match[1], close: () => proc.kill() });
          return;
        }
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    proc.on('exit', (code) => {
      clearTimeout(id);
      reject(new Error(`opencode exited with code ${code}\n${output}`));
    });

    proc.on('error', (err) => {
      clearTimeout(id);
      reject(err);
    });
  });
}

async function canConnectToOpencodeServer(
  url: string,
  timeout: number,
): Promise<boolean> {
  const client = createOpencodeClient({ baseUrl: url });

  return Promise.race<boolean>([
    client.config
      .get()
      .then(() => true)
      .catch(() => false),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), timeout);
    }),
  ]);
}

async function resolveOpenCodeServerHandle(
  bin: string,
  hostname: string,
  preferredPort: number,
  timeout: number,
): Promise<{ url: string; close(): void }> {
  const preferredUrl = `http://${hostname}:${preferredPort}`;

  if (preferredPort > 0 && await canConnectToOpencodeServer(preferredUrl, OPENCODE_PROBE_TIMEOUT)) {
    console.log(`[OpenCode] Reusing existing server at ${preferredUrl}`);
    return {
      url: preferredUrl,
      close: () => {},
    };
  }

  try {
    return await spawnOpencodeServer(bin, hostname, preferredPort, timeout);
  } catch (error) {
    if (preferredPort > 0 && await canConnectToOpencodeServer(preferredUrl, OPENCODE_PROBE_TIMEOUT)) {
      console.log(`[OpenCode] Reusing existing server at ${preferredUrl} after startup failure`);
      return {
        url: preferredUrl,
        close: () => {},
      };
    }

    if (preferredPort !== 0) {
      console.warn(
        `[OpenCode] Preferred port ${preferredPort} unavailable, retrying with a dynamic port...`,
      );
      return spawnOpencodeServer(bin, hostname, 0, timeout);
    }

    throw error;
  }
}

export async function getClientForUser(_userId: string, directory?: string): Promise<OpencodeClient> {
  if (!serverHandle) {
    throw new Error('OpenCode server is not running. Call initOpenCode() first.');
  }

  return createOpencodeClient({
    baseUrl: serverHandle.url,
    ...(directory ? { directory } : {}),
  });
}

export interface OpenCodeStatus {
  mode: 'host';
  serverUrl: string | null;
  running: boolean;
}

export function getOpenCodeStatus(): OpenCodeStatus {
  return {
    mode: 'host',
    serverUrl: serverHandle?.url ?? null,
    running: serverHandle !== null,
  };
}

export async function initOpenCode(): Promise<void> {
  const bin = resolveOpencodeBinary();
  console.log(`[OpenCode] Using binary: ${bin}`);

  try {
    serverHandle = await resolveOpenCodeServerHandle(
      bin,
      OPENCODE_HOST,
      OPENCODE_PORT,
      OPENCODE_TIMEOUT,
    );
    broadcast('opencode:status', { status: 'ready', mode: 'host' });
    console.log(`[OpenCode] Server running at ${serverHandle.url}`);
  } catch (err) {
    console.error('[OpenCode] Failed to start server:', err);
    broadcast('opencode:status', { status: 'error', error: String(err) });
    throw err;
  }
}

export async function shutdownOpenCode(): Promise<void> {
  if (serverHandle) {
    serverHandle.close();
    serverHandle = null;
  }
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
