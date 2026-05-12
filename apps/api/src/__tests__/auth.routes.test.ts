import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '@openlinear/db';

const JWT_SECRET = 'openlinear-dev-secret-change-in-production';

function unique(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

describe('Auth Routes', () => {
  const app = createApp();

  beforeEach(async () => {
    await prisma.taskLabel.deleteMany({});
    await prisma.task.updateMany({ where: { teamId: { not: null } }, data: { teamId: null, projectId: null } });
    await prisma.task.deleteMany({});
    await prisma.teamMember.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.user.deleteMany({ where: { username: { startsWith: 'authtest' } } });
  });

  afterEach(async () => {
    await prisma.taskLabel.deleteMany({});
    await prisma.task.updateMany({ where: { teamId: { not: null } }, data: { teamId: null, projectId: null } });
    await prisma.task.deleteMany({});
    await prisma.teamMember.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.user.deleteMany({ where: { username: { startsWith: 'authtest' } } });
  });

  describe('POST /api/auth/register', () => {
    it('registers a new user with 201', async () => {
      const username = unique('authtestuser');
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username, password: 'secret123', email: 'authtest@example.com' });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.username).toBe(username);
      expect(res.body.user.email).toBe('authtest@example.com');
    });

    it('validates username format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'a', password: 'secret123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('validates password minimum length', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: unique('authtestuser2'), password: 'ab' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 409 for duplicate username', async () => {
      const username = unique('authtestdup');
      await request(app)
        .post('/api/auth/register')
        .send({ username, password: 'secret123' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ username, password: 'secret123' });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already taken');
    });

    it('creates a default team for the user', async () => {
      const username = unique('authtestteam');
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username, password: 'secret123' });

      expect(res.status).toBe(201);
      expect(res.body.user.username).toBe(username);

      const user = await prisma.user.findUnique({ where: { username }, include: { teamMemberships: true } });
      expect(user?.teamMemberships.length).toBeGreaterThan(0);
      expect(user?.teamMemberships[0].role).toBe('owner');
    });
  });

  describe('POST /api/auth/login', () => {
    let loginUsername: string;

    beforeEach(async () => {
      loginUsername = unique('authtestlogin');
      await request(app)
        .post('/api/auth/register')
        .send({ username: loginUsername, password: 'secret123', email: 'login@example.com' });
    });

    it('logs in with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: loginUsername, password: 'secret123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.username).toBe(loginUsername);
    });

    it('returns 401 for wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: loginUsername, password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid username or password');
    });

    it('returns 401 for non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistentuser12345', password: 'secret123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid username or password');
    });

    it('returns 400 for missing username', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'secret123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 for missing password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: loginUsername });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/auth/local/session', () => {
    it('rejects non-desktop clients', async () => {
      const res = await request(app)
        .post('/api/auth/local/session');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('desktop');
    });

    it('creates a local desktop session', async () => {
      const res = await request(app)
        .post('/api/auth/local/session')
        .set('x-openlinear-client', 'desktop');

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.id).toBeDefined();
      expect(res.body.user.username).toBeDefined();
      expect(res.body.user.githubId).toBeNull();
    });

    it('returns same local user on repeated calls', async () => {
      const first = await request(app)
        .post('/api/auth/local/session')
        .set('x-openlinear-client', 'desktop');

      const second = await request(app)
        .post('/api/auth/local/session')
        .set('x-openlinear-client', 'desktop');

      expect(first.body.user.id).toBe(second.body.user.id);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('returns success', async () => {
      const res = await request(app)
        .post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
