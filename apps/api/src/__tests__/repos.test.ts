import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../services/auth-migration', () => ({
  getLegacyTokenForOperation: vi.fn(),
}));

vi.mock('../services/github', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/github')>();
  return {
    ...actual,
    getGitHubRepos: vi.fn(),
  };
});

import { createApp } from '../app';
import { getLegacyTokenForOperation } from '../services/auth-migration';
import { getGitHubRepos } from '../services/github';

const JWT_SECRET = 'openlinear-dev-secret-change-in-production';

function generateToken(userId: string, username = 'repo-user') {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '1h' });
}

describe('Repos API', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when no legacy token exists for GitHub repo listing', async () => {
    vi.mocked(getLegacyTokenForOperation).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/repos/github')
      .set('Authorization', `Bearer ${generateToken('user-1')}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GitHub account not linked. Please sign in with GitHub first.');
    expect(getGitHubRepos).not.toHaveBeenCalled();
  });

  it('uses migration helper token for GitHub repo listing', async () => {
    const repos = [
      {
        id: 1,
        name: 'example',
        full_name: 'acme/example',
        clone_url: 'https://github.com/acme/example.git',
        default_branch: 'main',
        private: false,
        description: null,
      },
    ];

    vi.mocked(getLegacyTokenForOperation).mockResolvedValue('gho_legacy_token');
    vi.mocked(getGitHubRepos).mockResolvedValue(repos);

    const res = await request(app)
      .get('/api/repos/github')
      .set('Authorization', `Bearer ${generateToken('user-1')}`);

    expect(res.status).toBe(200);
    expect(getLegacyTokenForOperation).toHaveBeenCalledWith('user-1', 'repos.list-github');
    expect(getGitHubRepos).toHaveBeenCalledWith('gho_legacy_token');
    expect(res.body).toEqual(repos);
  });
});
