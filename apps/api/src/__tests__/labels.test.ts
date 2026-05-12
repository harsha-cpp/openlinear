import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';
import { prisma } from '@openlinear/db';

const JWT_SECRET = 'openlinear-dev-secret-change-in-production';

function generateToken(userId: string, username: string = 'testuser') {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '1h' });
}

describe('Labels API', () => {
  const app = createApp();
  let testUserId: string;
  let authToken: string;

  beforeAll(async () => {
    await prisma.taskLabel.deleteMany({});
    await prisma.task.updateMany({ where: { teamId: { not: null } }, data: { teamId: null, projectId: null } });
    await prisma.task.deleteMany({});
    await prisma.label.deleteMany({});
    await prisma.teamMember.deleteMany({});
    await prisma.team.deleteMany({});

    const user = await prisma.user.upsert({
      where: { githubId: 444444 },
      update: {},
      create: {
        githubId: 444444,
        username: 'labeltester',
        email: 'labeltest@example.com',
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
    await prisma.label.deleteMany({});
    await prisma.teamMember.deleteMany({});
    await prisma.team.deleteMany({});
  }, 30000);

  describe('GET /api/labels', () => {
    it('returns empty array when no labels exist', async () => {
      const res = await request(app).get('/api/labels');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all labels ordered by priority desc', async () => {
      await prisma.label.create({
        data: { name: 'Low Priority', color: '#FF0000', priority: 1 },
      });
      await prisma.label.create({
        data: { name: 'High Priority', color: '#00FF00', priority: 10 },
      });

      const res = await request(app).get('/api/labels');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('High Priority');
      expect(res.body[1].name).toBe('Low Priority');
    });
  });

  describe('POST /api/labels', () => {
    it('creates a label with 201', async () => {
      const res = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Bug', color: '#FF0000', priority: 5 });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Bug');
      expect(res.body.color).toBe('#FF0000');
      expect(res.body.priority).toBe(5);
    });

    it('validates hex color format', async () => {
      const res = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Bad Color', color: 'red', priority: 5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/labels')
        .send({ name: 'No Auth', color: '#FF0000' });

      expect(res.status).toBe(401);
    });

    it('returns 409 for duplicate name', async () => {
      await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Duplicate', color: '#FF0000' });

      const res = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Duplicate', color: '#00FF00' });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
    });
  });

  describe('PATCH /api/labels/:id', () => {
    it('updates a label', async () => {
      const label = await prisma.label.create({
        data: { name: 'To Update', color: '#FF0000', priority: 1 },
      });

      const res = await request(app)
        .patch(`/api/labels/${label.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated', color: '#00FF00', priority: 2 });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
      expect(res.body.color).toBe('#00FF00');
      expect(res.body.priority).toBe(2);
    });

    it('returns 404 for non-existent label', async () => {
      const res = await request(app)
        .patch('/api/labels/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Nope' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Label not found');
    });
  });

  describe('DELETE /api/labels/:id', () => {
    it('deletes a label', async () => {
      const label = await prisma.label.create({
        data: { name: 'To Delete', color: '#FF0000' },
      });

      const res = await request(app)
        .delete(`/api/labels/${label.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(204);

      const found = await prisma.label.findUnique({ where: { id: label.id } });
      expect(found).toBeNull();
    });

    it('returns 404 for non-existent label', async () => {
      const res = await request(app)
        .delete('/api/labels/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Label not found');
    });
  });

  describe('POST /api/labels/tasks/:id/labels', () => {
    it('assigns a label to a task', async () => {
      const label = await prisma.label.create({
        data: { name: 'Task Label', color: '#FF0000' },
      });
      const task = await prisma.task.create({
        data: { title: 'Task with Label', priority: 'medium' },
      });

      const res = await request(app)
        .post(`/api/labels/tasks/${task.id}/labels`)
        .send({ labelId: label.id });

      expect(res.status).toBe(201);
      expect(res.body.label.name).toBe('Task Label');
    });

    it('returns 404 for non-existent task', async () => {
      const label = await prisma.label.create({
        data: { name: 'Orphan', color: '#FF0000' },
      });

      const res = await request(app)
        .post('/api/labels/tasks/00000000-0000-0000-0000-000000000000/labels')
        .send({ labelId: label.id });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });

    it('returns 404 for non-existent label', async () => {
      const task = await prisma.task.create({
        data: { title: 'No Label Task', priority: 'medium' },
      });

      const res = await request(app)
        .post(`/api/labels/tasks/${task.id}/labels`)
        .send({ labelId: '00000000-0000-0000-0000-000000000000' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Label not found');
    });

    it('returns 409 for duplicate assignment', async () => {
      const label = await prisma.label.create({
        data: { name: 'Duplicate Assign', color: '#FF0000' },
      });
      const task = await prisma.task.create({
        data: { title: 'Duplicate Task', priority: 'medium' },
      });

      await request(app)
        .post(`/api/labels/tasks/${task.id}/labels`)
        .send({ labelId: label.id });

      const res = await request(app)
        .post(`/api/labels/tasks/${task.id}/labels`)
        .send({ labelId: label.id });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already assigned');
    });
  });

  describe('DELETE /api/labels/tasks/:id/labels/:labelId', () => {
    it('removes a label from a task', async () => {
      const label = await prisma.label.create({
        data: { name: 'Remove Me', color: '#FF0000' },
      });
      const task = await prisma.task.create({
        data: { title: 'Task with Removable Label', priority: 'medium' },
      });

      await prisma.taskLabel.create({
        data: { taskId: task.id, labelId: label.id },
      });

      const res = await request(app)
        .delete(`/api/labels/tasks/${task.id}/labels/${label.id}`);

      expect(res.status).toBe(204);

      const found = await prisma.taskLabel.findUnique({
        where: { taskId_labelId: { taskId: task.id, labelId: label.id } },
      });
      expect(found).toBeNull();
    });

    it('returns 404 for non-existent assignment', async () => {
      const task = await prisma.task.create({
        data: { title: 'No Label Task', priority: 'medium' },
      });
      const label = await prisma.label.create({
        data: { name: 'Not Assigned', color: '#FF0000' },
      });

      const res = await request(app)
        .delete(`/api/labels/tasks/${task.id}/labels/${label.id}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Label assignment not found');
    });
  });
});
