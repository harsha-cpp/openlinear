import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';
import { prisma } from '@openlinear/db';

const JWT_SECRET = 'openlinear-dev-secret-change-in-production';

function generateToken(userId: string, username: string = 'testuser') {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '1h' });
}

describe('Inbox API', () => {
  const app = createApp();
  let testUserId: string;
  let authToken: string;
  let testTeamId: string;

  beforeAll(async () => {
    await prisma.taskLabel.deleteMany({});
    await prisma.task.updateMany({ where: { teamId: { not: null } }, data: { teamId: null, projectId: null } });
    await prisma.task.deleteMany({});
    await prisma.teamMember.deleteMany({});
    await prisma.team.deleteMany({});

    const user = await prisma.user.upsert({
      where: { githubId: 555555 },
      update: {},
      create: {
        githubId: 555555,
        username: 'inboxtester',
        email: 'inboxtest@example.com',
        accessToken: null,
      },
    });
    testUserId = user.id;
    authToken = generateToken(user.id, user.username);

    const team = await prisma.team.create({
      data: { name: 'Inbox Test Team', key: 'INB' },
    });
    testTeamId = team.id;

    await prisma.teamMember.create({
      data: { teamId: team.id, userId: testUserId, role: 'owner' },
    });
  }, 30000);

  afterAll(async () => {
    await prisma.taskLabel.deleteMany({});
    await prisma.task.updateMany({ where: { teamId: { not: null } }, data: { teamId: null, projectId: null } });
    await prisma.task.deleteMany({});
    await prisma.teamMember.deleteMany({});
    await prisma.team.deleteMany({});
  }, 30000);

  describe('GET /api/inbox', () => {
    it('returns empty array without auth', async () => {
      const res = await request(app).get('/api/inbox');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns inbox tasks for authenticated user', async () => {
      await prisma.task.create({
        data: {
          title: 'Done Task',
          status: 'done',
          teamId: testTeamId,
        },
      });

      const res = await request(app)
        .get('/api/inbox')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].title).toBe('Done Task');
      expect(res.body[0].status).toBe('done');
    });

    it('excludes todo and in_progress tasks', async () => {
      await prisma.task.create({
        data: {
          title: 'Todo Task',
          status: 'todo',
          teamId: testTeamId,
        },
      });
      await prisma.task.create({
        data: {
          title: 'In Progress Task',
          status: 'in_progress',
          teamId: testTeamId,
        },
      });

      const res = await request(app)
        .get('/api/inbox')
        .set('Authorization', `Bearer ${authToken}`);

      const titles = res.body.map((t: { title: string }) => t.title);
      expect(titles).not.toContain('Todo Task');
      expect(titles).not.toContain('In Progress Task');
    });

    it('excludes archived tasks', async () => {
      await prisma.task.create({
        data: {
          title: 'Archived Done Task',
          status: 'done',
          archived: true,
          teamId: testTeamId,
        },
      });

      const res = await request(app)
        .get('/api/inbox')
        .set('Authorization', `Bearer ${authToken}`);

      const titles = res.body.map((t: { title: string }) => t.title);
      expect(titles).not.toContain('Archived Done Task');
    });
  });

  describe('GET /api/inbox/count', () => {
    it('returns zero counts without auth', async () => {
      const res = await request(app).get('/api/inbox/count');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ total: 0, unread: 0 });
    });

    it('returns correct counts for authenticated user', async () => {
      await prisma.task.updateMany({ where: { teamId: testTeamId }, data: { inboxRead: false } });

      const res = await request(app)
        .get('/api/inbox/count')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.total).toBe('number');
      expect(typeof res.body.unread).toBe('number');
      expect(res.body.unread).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PATCH /api/inbox/read/:id', () => {
    it('marks task as read', async () => {
      const task = await prisma.task.create({
        data: {
          title: 'Read Me',
          status: 'done',
          teamId: testTeamId,
          inboxRead: false,
        },
      });

      const res = await request(app)
        .patch(`/api/inbox/read/${task.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updated = await prisma.task.findUnique({ where: { id: task.id } });
      expect(updated?.inboxRead).toBe(true);
    });

    it('returns 404 for non-existent task', async () => {
      const res = await request(app)
        .patch('/api/inbox/read/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });
  });

  describe('PATCH /api/inbox/read-all', () => {
    it('marks all inbox items as read for user', async () => {
      await prisma.task.updateMany({ where: { teamId: testTeamId }, data: { inboxRead: false } });

      const res = await request(app)
        .patch('/api/inbox/read-all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const unread = await prisma.task.count({
        where: {
          teamId: testTeamId,
          inboxRead: false,
          OR: [{ status: 'done' }, { status: 'cancelled' }],
          archived: false,
        },
      });
      expect(unread).toBe(0);
    });

    it('returns success without auth', async () => {
      const res = await request(app).patch('/api/inbox/read-all');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
