import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  commitAndPush,
  createPullRequest,
  createBranch,
  cloneRepository,
} from '../services/execution/git';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  accessSync: vi.fn(),
  constants: { W_OK: 2 },
}));

vi.mock('../services/git-identity', () => ({
  getGitIdentityEnv: vi.fn(() => ({
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  })),
}));

import { exec } from 'child_process';
import { existsSync, mkdirSync, rmSync, accessSync } from 'fs';
import { getGitIdentityEnv } from '../services/git-identity';

describe('Git Service', () => {
  const mockedExec = vi.mocked(exec);
  const mockedExistsSync = vi.mocked(existsSync);
  const mockedMkdirSync = vi.mocked(mkdirSync);
  const mockedRmSync = vi.mocked(rmSync);
  const mockedAccessSync = vi.mocked(accessSync);

  function mockExecAsync(stdout = '', stderr = '', error: Error | null = null) {
    mockedExec.mockImplementation((cmd, _opts, callback) => {
      (callback as any)?.(error, { stdout, stderr });
      return {} as any;
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cloneRepository', () => {
    it('creates repos dir if missing', async () => {
      mockedExistsSync.mockReturnValue(false);
      mockedAccessSync.mockImplementation(() => {});
      mockExecAsync();

      await cloneRepository('https://github.com/acme/repo.git', '/tmp/repos/repo', null, 'main');

      expect(mockedMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('removes existing directory before clone', async () => {
      mockedExistsSync
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true);
      mockedAccessSync.mockImplementation(() => {});
      mockExecAsync();

      await cloneRepository('https://github.com/acme/repo.git', '/tmp/repos/repo', null, 'main');

      expect(mockedRmSync).toHaveBeenCalledWith('/tmp/repos/repo', { recursive: true, force: true });
    });

    it('uses access token in clone URL', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedAccessSync.mockImplementation(() => {});
      mockExecAsync();

      await cloneRepository('https://github.com/acme/repo.git', '/tmp/repos/repo', 'gho_token', 'main');

      expect(mockedExec).toHaveBeenCalledWith(
        expect.stringContaining('https://oauth2:gho_token@github.com/acme/repo.git'),
        expect.anything(),
        expect.any(Function),
      );
    });

    it('throws when no write access', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedAccessSync.mockImplementation(() => { throw new Error('EACCES'); });

      await expect(cloneRepository('https://github.com/acme/repo.git', '/tmp/repos/repo', null, 'main'))
        .rejects.toThrow('No write access');
    });
  });

  describe('createBranch', () => {
    it('runs git checkout', async () => {
      mockExecAsync();

      await createBranch('/tmp/repos/repo', 'feature/test');

      expect(mockedExec).toHaveBeenCalledWith(
        'git checkout -B feature/test',
        { cwd: '/tmp/repos/repo', signal: undefined },
        expect.any(Function),
      );
    });
  });

  describe('commitAndPush', () => {
    it('returns no_changes when git status is empty', async () => {
      mockExecAsync('');

      const result = await commitAndPush('/tmp/repos/repo', 'feature/test', 'Fix bug');

      expect(result.status).toBe('no_changes');
    });

    it('stages, commits, and pushes when changes exist', async () => {
      mockedExec
        .mockImplementationOnce((cmd, opts, cb) => { (cb as any)?.(null, { stdout: 'M src/index.ts\n', stderr: '' }); return {} as any; })
        .mockImplementationOnce((cmd, opts, cb) => { (cb as any)?.(null, { stdout: '', stderr: '' }); return {} as any; })
        .mockImplementationOnce((cmd, opts, cb) => { (cb as any)?.(null, { stdout: '', stderr: '' }); return {} as any; })
        .mockImplementationOnce((cmd, opts, cb) => { (cb as any)?.(null, { stdout: '', stderr: '' }); return {} as any; });

      const result = await commitAndPush('/tmp/repos/repo', 'feature/test', 'Fix bug!');

      expect(result.status).toBe('pushed');
    });

    it('returns failed when git command fails', async () => {
      mockedExec
        .mockImplementationOnce((cmd, opts, cb) => { (cb as any)?.(null, { stdout: 'M src/index.ts\n', stderr: '' }); return {} as any; })
        .mockImplementationOnce((cmd, opts, cb) => { (cb as any)?.(null, { stdout: '', stderr: '' }); return {} as any; })
        .mockImplementationOnce((cmd, opts, cb) => { (cb as any)?.(new Error('commit failed'), { stdout: '', stderr: 'commit failed' }); return {} as any; });

      const result = await commitAndPush('/tmp/repos/repo', 'feature/test', 'Fix bug');

      expect(result.status).toBe('failed');
      expect(result).toHaveProperty('reason');
    });

    it('sanitizes commit message', async () => {
      mockedExec
        .mockImplementationOnce((cmd, opts, cb) => { (cb as any)?.(null, { stdout: 'M src/index.ts\n', stderr: '' }); return {} as any; })
        .mockImplementationOnce((cmd, opts, cb) => { (cb as any)?.(null, { stdout: '', stderr: '' }); return {} as any; })
        .mockImplementationOnce((cmd, opts, cb) => { (cb as any)?.(null, { stdout: '', stderr: '' }); return {} as any; })
        .mockImplementationOnce((cmd, opts, cb) => { (cb as any)?.(null, { stdout: '', stderr: '' }); return {} as any; });

      await commitAndPush('/tmp/repos/repo', 'feature/test', 'Fix bug! [URGENT] #123');

      const commitCall = mockedExec.mock.calls.find(c => String(c[0]).startsWith('git commit'));
      expect(commitCall?.[0]).toContain('feat: fix bug urgent 123');
    });
  });

  describe('createPullRequest', () => {
    it('returns compare URL when no access token', async () => {
      const result = await createPullRequest('acme/repo', 'feature/test', 'main', 'Fix bug', null, null);

      expect(result.type).toBe('compare');
      expect(result.url).toContain('/compare/main...feature/test');
    });

    it('creates PR via GitHub API', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ html_url: 'https://github.com/acme/repo/pull/42' }),
      });

      const result = await createPullRequest('acme/repo', 'feature/test', 'main', 'Fix bug', 'Description', 'gho_token');

      expect(result.type).toBe('pr');
      expect(result.url).toBe('https://github.com/acme/repo/pull/42');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/acme/repo/pulls',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer gho_token',
          }),
        }),
      );
    });

    it('falls back to compare URL on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        text: async () => 'Validation failed',
      });

      const result = await createPullRequest('acme/repo', 'feature/test', 'main', 'Fix bug', null, 'gho_token');

      expect(result.type).toBe('compare');
    });

    it('falls back to compare URL on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await createPullRequest('acme/repo', 'feature/test', 'main', 'Fix bug', null, 'gho_token');

      expect(result.type).toBe('compare');
    });
  });
});
