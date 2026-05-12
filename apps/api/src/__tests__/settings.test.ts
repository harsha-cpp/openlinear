import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';
import { prisma } from '@openlinear/db';

const JWT_SECRET = 'openlinear-dev-secret-change-in-production';

function generateToken(userId: string, username: string = 'testuser') {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '1h' });
}

describe('Settings API', () => {
  const app = createApp();
  let testUserId: string;
  let authToken: string;

  beforeAll(async () => {
    await prisma.taskLabel.deleteMany({});
    await prisma.task.updateMany({ where: { teamId: { not: null } }, data: { teamId: null, projectId: null } });
    await prisma.task.deleteMany({});
    await prisma.teamMember.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.settings.deleteMany({});

    const user = await prisma.user.upsert({
      where: { githubId: 333333 },
      update: {},
      create: {
        githubId: 333333,
        username: 'settingstester',
        email: 'settingstest@example.com',
        accessToken: null,
      },
    });
    testUserId = user.id;
    authToken = generateToken(user.id, user.username);
  }, 30000);

  afterAll(async () => {
    await prisma.taskLabel.deleteMany({});
    await prisma.task.updateMany({ where: { teamId: { not: null } }, data: { teamId: null, projectId: null } });
    await prisma.task.deleteMany({});
    await prisma.teamMember.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.settings.deleteMany({});
  }, 30000);

  describe('GET /api/settings', () => {
    it('creates default settings if none exist', async () => {
      await prisma.settings.deleteMany({});

      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('default');
      expect(res.body).toHaveProperty('parallelLimit');
      expect(res.body).toHaveProperty('maxBatchSize');
      expect(res.body).toHaveProperty('queueAutoApprove');
      expect(res.body).toHaveProperty('stopOnFailure');
      expect(res.body).toHaveProperty('conflictBehavior');
    });

    it('returns existing settings', async () => {
      await prisma.settings.upsert({
        where: { id: 'default' },
        update: { parallelLimit: 5 },
        create: { id: 'default', parallelLimit: 5 },
      });

      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(200);
      expect(res.body.parallelLimit).toBe(5);
    });
  });

  describe('PATCH /api/settings', () => {
    it('updates settings fields', async () => {
      await prisma.settings.upsert({
        where: { id: 'default' },
        update: {},
        create: { id: 'default' },
      });

      const res = await request(app)
        .patch('/api/settings')
        .send({ parallelLimit: 2, maxBatchSize: 5, stopOnFailure: true });

      expect(res.status).toBe(200);
      expect(res.body.parallelLimit).toBe(2);
      expect(res.body.maxBatchSize).toBe(5);
      expect(res.body.stopOnFailure).toBe(true);
    });

    it('validates parallelLimit range', async () => {
      const res = await request(app)
        .patch('/api/settings')
        .send({ parallelLimit: 10 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('validates maxBatchSize range', async () => {
      const res = await request(app)
        .patch('/api/settings')
        .send({ maxBatchSize: 20 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('validates conflictBehavior enum', async () => {
      const res = await request(app)
        .patch('/api/settings')
        .send({ conflictBehavior: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('rejects empty body', async () => {
      const res = await request(app)
        .patch('/api/settings')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('accepts valid conflictBehavior values', async () => {
      await prisma.settings.upsert({
        where: { id: 'default' },
        update: {},
        create: { id: 'default' },
      });

      const resSkip = await request(app)
        .patch('/api/settings')
        .send({ conflictBehavior: 'skip' });

      expect(resSkip.status).toBe(200);
      expect(resSkip.body.conflictBehavior).toBe('skip');

      const resFail = await request(app)
        .patch('/api/settings')
        .send({ conflictBehavior: 'fail' });

      expect(resFail.status).toBe(200);
      expect(resFail.body.conflictBehavior).toBe('fail');
    });
  });
});
