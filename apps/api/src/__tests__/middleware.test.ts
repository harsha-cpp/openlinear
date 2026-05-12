import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import jwt, { type SignOptions } from 'jsonwebtoken';
import express from 'express';
import { optionalAuth, requireAuth, AuthRequest } from '../middleware/auth';

const JWT_SECRET = 'openlinear-dev-secret-change-in-production';

function generateToken(userId: string, username: string = 'testuser', expiresIn: SignOptions['expiresIn'] = '1h') {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn, algorithm: 'HS256' });
}

function createTestApp() {
  const app = express();
  app.use(express.json());

  app.get('/optional', optionalAuth, (req: AuthRequest, res) => {
    res.json({ userId: req.userId || null, username: req.username || null });
  });

  app.get('/required', requireAuth, (req: AuthRequest, res) => {
    res.json({ userId: req.userId, username: req.username });
  });

  return app;
}

describe('Auth Middleware', () => {
  const app = createTestApp();
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('optionalAuth', () => {
    it('allows unauthenticated requests', async () => {
      const res = await request(app).get('/optional');
      expect(res.status).toBe(200);
      expect(res.body.userId).toBeNull();
      expect(res.body.username).toBeNull();
    });

    it('decodes valid token and attaches user info', async () => {
      const token = generateToken('user-123', 'testuser');
      const res = await request(app)
        .get('/optional')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('user-123');
      expect(res.body.username).toBe('testuser');
    });

    it('continues without user info for invalid token', async () => {
      const res = await request(app)
        .get('/optional')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(200);
      expect(res.body.userId).toBeNull();
    });

    it('continues without user info for malformed header', async () => {
      const res = await request(app)
        .get('/optional')
        .set('Authorization', 'NotBearer some-token');

      expect(res.status).toBe(200);
      expect(res.body.userId).toBeNull();
    });

    it('rejects expired tokens silently (optional)', async () => {
      const token = generateToken('user-123', 'testuser', '-1s');
      const res = await request(app)
        .get('/optional')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBeNull();
    });

    it('rejects wrong algorithm tokens silently', async () => {
      const token = jwt.sign({ userId: 'user-123', username: 'testuser' }, JWT_SECRET, { algorithm: 'HS512' });
      const res = await request(app)
        .get('/optional')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBeNull();
    });
  });

  describe('requireAuth', () => {
    it('rejects requests without Authorization header', async () => {
      const res = await request(app).get('/required');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('rejects malformed Authorization header', async () => {
      const res = await request(app)
        .get('/required')
        .set('Authorization', 'NotBearer some-token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('rejects invalid token', async () => {
      const res = await request(app)
        .get('/required')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('allows valid token', async () => {
      const token = generateToken('user-123', 'testuser');
      const res = await request(app)
        .get('/required')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('user-123');
      expect(res.body.username).toBe('testuser');
    });

    it('rejects expired token', async () => {
      const token = generateToken('user-123', 'testuser', '-1s');
      const res = await request(app)
        .get('/required')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('rejects token with wrong algorithm', async () => {
      const token = jwt.sign({ userId: 'user-123', username: 'testuser' }, JWT_SECRET, { algorithm: 'HS512' });
      const res = await request(app)
        .get('/required')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('rejects token signed with wrong secret', async () => {
      const token = jwt.sign({ userId: 'user-123', username: 'testuser' }, 'wrong-secret', { algorithm: 'HS256' });
      const res = await request(app)
        .get('/required')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('rejects token with tampered payload', async () => {
      const token = jwt.sign({ userId: 'user-123', username: 'testuser' }, JWT_SECRET, { algorithm: 'HS256' });
      const parts = token.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({ userId: 'hacker', username: 'hacker' })).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const res = await request(app)
        .get('/required')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });
  });

  describe('JWT_SECRET handling', () => {
    it('uses process.env.JWT_SECRET when available', async () => {
      const customSecret = 'custom-test-secret-for-jwt';
      process.env.JWT_SECRET = customSecret;

      const token = jwt.sign({ userId: 'user-123', username: 'testuser' }, customSecret, { algorithm: 'HS256' });
      const res = await request(app)
        .get('/required')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('user-123');

      delete process.env.JWT_SECRET;
    });

    it('falls back to default secret when env is not set', async () => {
      delete process.env.JWT_SECRET;

      const token = generateToken('user-123', 'testuser');
      const res = await request(app)
        .get('/required')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('user-123');
    });
  });
});
