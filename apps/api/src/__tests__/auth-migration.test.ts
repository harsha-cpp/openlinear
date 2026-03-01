import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '@openlinear/db';
import * as githubService from '../services/github';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

vi.mock('../services/github', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/github')>();
  return {
    ...actual,
    exchangeCodeForToken: vi.fn(),
    getGitHubUser: vi.fn(),
  };
});

describe('Auth Migration', () => {
  const app = createApp();

  beforeEach(async () => {
    await prisma.user.deleteMany();
    vi.clearAllMocks();
  });

  it('API auth flow proves secret is not newly persisted', async () => {
    const mockToken = 'gho_mock_token_123';
    const mockGithubUser = {
      id: 12345,
      login: 'testuser',
      email: 'test@example.com',
      avatar_url: 'https://example.com/avatar.png',
    };

    vi.mocked(githubService.exchangeCodeForToken).mockResolvedValue(mockToken);
    vi.mocked(githubService.getGitHubUser).mockResolvedValue(mockGithubUser);

    const res = await request(app)
      .get('/api/auth/github/callback?code=mock_code')
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('token=');

    // Verify user was created
    const user = await prisma.user.findUnique({
      where: { githubId: mockGithubUser.id },
    });

    expect(user).toBeDefined();
    expect(user?.username).toBe(mockGithubUser.login);
    
    // Prove secret is not persisted
    expect(user?.accessToken).toBeNull();
  });

  it('negative test proves forced legacy write attempt is blocked/fails', async () => {
    // Attempt to create a user with an accessToken
    await expect(
      prisma.user.create({
        data: {
          username: 'legacy_writer',
          accessToken: 'gho_legacy_token',
        },
      })
    ).rejects.toThrow('Writing accessToken to database is deprecated and blocked.');

    // Attempt to update a user with an accessToken
    const user = await prisma.user.create({
      data: {
        username: 'valid_user',
      },
    });

    await expect(
      prisma.user.update({
        where: { id: user.id },
        data: {
          accessToken: 'gho_legacy_token',
        },
      })
    ).rejects.toThrow('Writing accessToken to database is deprecated and blocked.');
    
    await new Promise(r => setTimeout(r, 500));
  });
});
