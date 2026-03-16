import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';

const prismaMock = vi.hoisted(() => {
  const localUser = {
    id: 'local-user-id',
    username: 'local-test-user',
    email: null,
    avatarUrl: null,
    githubId: null,
    passwordHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(localUser),
    },
  };
});

vi.mock('@openlinear/db', () => ({
  prisma: prismaMock,
}));

import { createApp } from '../app';

describe('Auth API', () => {
  const app = createApp();
  const originalClientId = process.env.GITHUB_CLIENT_ID;
  const originalClientSecret = process.env.GITHUB_CLIENT_SECRET;

  beforeEach(() => {
    process.env.GITHUB_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
  });

  afterEach(() => {
    if (originalClientId === undefined) {
      delete process.env.GITHUB_CLIENT_ID;
    } else {
      process.env.GITHUB_CLIENT_ID = originalClientId;
    }

    if (originalClientSecret === undefined) {
      delete process.env.GITHUB_CLIENT_SECRET;
    } else {
      process.env.GITHUB_CLIENT_SECRET = originalClientSecret;
    }
  });

  describe('GET /api/auth/github', () => {
    it('redirects to GitHub OAuth URL', async () => {
      const res = await request(app).get('/api/auth/github').redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('github.com/login/oauth/authorize');
    });

    it('includes correct scopes in redirect URL', async () => {
      const res = await request(app).get('/api/auth/github').redirects(0);
      const location = res.headers.location;
      expect(location).toContain('scope=');
      expect(location).toContain('read%3Auser');  // read:user URL-encoded
    });

    it('redirects desktop clients back with a config error when OAuth secret is missing', async () => {
      delete process.env.GITHUB_CLIENT_SECRET;

      const res = await request(app).get('/api/auth/github?source=desktop').redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('openlinear://callback?error=');
      expect(res.headers.location).toContain('GITHUB_CLIENT_SECRET');
    });

    it('uses the desktop localhost callback for desktop OAuth requests', async () => {
      const res = await request(app).get('/api/auth/github?source=desktop').redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fcallback');
    });
  });

  describe('GET /api/auth/github/callback', () => {
    it('redirects with error when error param is present', async () => {
      const res = await request(app)
        .get('/api/auth/github/callback?error=access_denied&error_description=User+denied')
        .redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error=');
    });

    it('redirects with error when code is missing', async () => {
      const res = await request(app)
        .get('/api/auth/github/callback')
        .redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error=missing_code');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 without authorization header', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token-here');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('returns 401 with malformed authorization header', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'NotBearer some-token');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('returns success', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/auth/local/session', () => {
    it('rejects non-desktop clients', async () => {
      const res = await request(app).post('/api/auth/local/session');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('desktop clients');
    });

    it('creates a desktop local session', async () => {
      const res = await request(app)
        .post('/api/auth/local/session')
        .set('x-openlinear-client', 'desktop');

      expect(res.status).toBe(201);
      expect(typeof res.body.token).toBe('string');
      expect(typeof res.body.user?.id).toBe('string');
      expect(typeof res.body.user?.username).toBe('string');
      expect(res.body.user?.githubId).toBeNull();
    });
  });
});
