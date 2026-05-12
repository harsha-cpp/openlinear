import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getOpenCodeStatus } from '../services/opencode';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

import { existsSync } from 'node:fs';

describe('OpenCode Binary Resolution', () => {
  const originalEnv = process.env;
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'arch', { value: originalArch });
  });

  describe('resolveOpencodeBinary', () => {
    it('returns env override when OPENCODE_BIN is set', async () => {
      process.env.OPENCODE_BIN = '/custom/opencode';
      const { resolveOpencodeBinary } = await import('../services/opencode');
      expect(resolveOpencodeBinary()).toBe('/custom/opencode');
    });

    it('resolves darwin arm64 bundled binary', async () => {
      delete process.env.OPENCODE_BIN;
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      Object.defineProperty(process, 'arch', { value: 'arm64' });

      vi.mocked(existsSync).mockReturnValue(true);

      const { resolveOpencodeBinary } = await import('../services/opencode');
      const result = resolveOpencodeBinary();
      expect(result).toContain('aarch64-apple-darwin');
    });

    it('resolves darwin x64 bundled binary', async () => {
      delete process.env.OPENCODE_BIN;
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      Object.defineProperty(process, 'arch', { value: 'x64' });

      vi.mocked(existsSync).mockReturnValue(true);

      const { resolveOpencodeBinary } = await import('../services/opencode');
      const result = resolveOpencodeBinary();
      expect(result).toContain('x86_64-apple-darwin');
    });

    it('resolves linux arm64 bundled binary', async () => {
      delete process.env.OPENCODE_BIN;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Object.defineProperty(process, 'arch', { value: 'arm64' });

      vi.mocked(existsSync).mockReturnValue(true);

      const { resolveOpencodeBinary } = await import('../services/opencode');
      const result = resolveOpencodeBinary();
      expect(result).toContain('aarch64-unknown-linux-gnu');
    });

    it('resolves linux x64 bundled binary', async () => {
      delete process.env.OPENCODE_BIN;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Object.defineProperty(process, 'arch', { value: 'x64' });

      vi.mocked(existsSync).mockReturnValue(true);

      const { resolveOpencodeBinary } = await import('../services/opencode');
      const result = resolveOpencodeBinary();
      expect(result).toContain('x86_64-unknown-linux-gnu');
    });

    it('falls back to system PATH when bundled binary not found', async () => {
      delete process.env.OPENCODE_BIN;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Object.defineProperty(process, 'arch', { value: 'x64' });

      vi.mocked(existsSync).mockReturnValue(false);

      const { resolveOpencodeBinary } = await import('../services/opencode');
      expect(resolveOpencodeBinary()).toBe('opencode');
    });
  });

  describe('getOpenCodeStatus', () => {
    it('reports not running when serverHandle is null', () => {
      const status = getOpenCodeStatus();
      expect(status.mode).toBe('host');
      expect(status.running).toBe(false);
      expect(status.serverUrl).toBeNull();
    });
  });
});
