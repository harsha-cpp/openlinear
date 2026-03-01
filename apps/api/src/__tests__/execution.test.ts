import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '@openlinear/db';
import { sign } from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = 'openlinear-dev-secret-change-in-production';

function generateSignature(method: string, url: string, timestamp: string, nonce: string, body: any, token: string) {
  const payloadToSign = `${method}:${url}:${timestamp}:${nonce}:${JSON.stringify(body)}`;
  return crypto.createHmac('sha256', token).update(payloadToSign).digest('hex');
}

describe('Execution Metadata Endpoints', () => {
  const app = createApp();
  let user: any;
  let team: any;
  let project: any;
  let task: any;
  let unstartedTask: any;
  let token: string;

  beforeAll(async () => {
    // Clean up previous test runs if they failed
    await prisma.task.deleteMany({ where: { title: { in: ['Execution Test Task', 'Unstarted Task'] } } });
    await prisma.project.deleteMany({ where: { name: 'Execution Test Project' } });
    await prisma.team.deleteMany({ where: { name: 'Execution Test Team' } });
    await prisma.user.deleteMany({ where: { email: 'execution-test@example.com' } });

    user = await prisma.user.create({
      data: {
        email: 'execution-test@example.com',
        githubId: 123456789,
        username: 'exec-test-user',
      },
    });

    team = await prisma.team.create({
      data: {
        name: 'Execution Test Team',
        key: 'EXEC',
        members: {
          create: {
            userId: user.id,
            role: 'owner',
          },
        },
      },
    });

    project = await prisma.project.create({
      data: {
        name: 'Execution Test Project',
        projectTeams: {
          create: {
            teamId: team.id,
          },
        },
      },
    });

    task = await prisma.task.create({
      data: {
        title: 'Execution Test Task',
        status: 'todo',
        projectId: project.id,
      },
    });

    unstartedTask = await prisma.task.create({
      data: {
        title: 'Unstarted Task',
        status: 'todo',
        projectId: project.id,
      },
    });

    token = sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    if (project) await prisma.task.deleteMany({ where: { projectId: project.id } });
    if (project) await prisma.projectTeam.deleteMany({ where: { projectId: project.id } });
    if (project) await prisma.project.deleteMany({ where: { id: project.id } });
    if (team) await prisma.teamMember.deleteMany({ where: { teamId: team.id } });
    if (team) await prisma.team.deleteMany({ where: { id: team.id } });
    if (user) await prisma.user.deleteMany({ where: { id: user.id } });
  });

  describe('POST /api/execution/metadata/start', () => {
    it('should start execution and update task status', async () => {
      const payload = {
        taskId: task.id,
        runId: 'run_123',
        status: 'running',
        startedAt: new Date().toISOString(),
      };

      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const signature = generateSignature('POST', '/api/execution/metadata/start', timestamp, nonce, payload, token);

      const response = await request(app)
        .post('/api/execution/metadata/start')
        .set('Authorization', `Bearer ${token}`)
        .set('x-device-id', 'test-device')
        .set('x-timestamp', timestamp)
        .set('x-nonce', nonce)
        .set('x-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.task.status).toBe('in_progress');
      expect(response.body.task.sessionId).toBe('run_123');
    });

    it('should reject replay of the same nonce', async () => {
      const payload = {
        taskId: task.id,
        runId: 'run_123',
        status: 'running',
        startedAt: new Date().toISOString(),
      };

      const timestamp = Date.now().toString();
      const nonce = 'reused-nonce-123';
      const signature = generateSignature('POST', '/api/execution/metadata/start', timestamp, nonce, payload, token);

      // First request should succeed
      await request(app)
        .post('/api/execution/metadata/start')
        .set('Authorization', `Bearer ${token}`)
        .set('x-device-id', 'test-device')
        .set('x-timestamp', timestamp)
        .set('x-nonce', nonce)
        .set('x-signature', signature)
        .send(payload);

      // Second request with same nonce should fail
      const response = await request(app)
        .post('/api/execution/metadata/start')
        .set('Authorization', `Bearer ${token}`)
        .set('x-device-id', 'test-device')
        .set('x-timestamp', timestamp)
        .set('x-nonce', nonce)
        .set('x-signature', signature)
        .send(payload);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Replay detected');
    });

    it('should reject payload with forbidden fields', async () => {
      const payload = {
        taskId: task.id,
        runId: 'run_123',
        status: 'running',
        prompt: 'do something bad', // forbidden field
      };

      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const signature = generateSignature('POST', '/api/execution/metadata/start', timestamp, nonce, payload, token);

      const response = await request(app)
        .post('/api/execution/metadata/start')
        .set('Authorization', `Bearer ${token}`)
        .set('x-device-id', 'test-device')
        .set('x-timestamp', timestamp)
        .set('x-nonce', nonce)
        .set('x-signature', signature)
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('FORBIDDEN_FIELDS');
    });
  });

  describe('PUT /api/execution/metadata/progress', () => {
    it('should update execution progress', async () => {
      const payload = {
        taskId: task.id,
        runId: 'run_123',
        status: 'running',
      };

      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const signature = generateSignature('PUT', '/api/execution/metadata/progress', timestamp, nonce, payload, token);

      const response = await request(app)
        .put('/api/execution/metadata/progress')
        .set('Authorization', `Bearer ${token}`)
        .set('x-device-id', 'test-device')
        .set('x-timestamp', timestamp)
        .set('x-nonce', nonce)
        .set('x-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/execution/metadata/finish', () => {
    it('should finish execution and update task status', async () => {
      const payload = {
        taskId: task.id,
        runId: 'run_123',
        status: 'completed',
        durationMs: 10000,
        outcome: 'Success',
      };

      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const signature = generateSignature('POST', '/api/execution/metadata/finish', timestamp, nonce, payload, token);

      const response = await request(app)
        .post('/api/execution/metadata/finish')
        .set('Authorization', `Bearer ${token}`)
        .set('x-device-id', 'test-device')
        .set('x-timestamp', timestamp)
        .set('x-nonce', nonce)
        .set('x-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.task.status).toBe('done');
      expect(response.body.task.executionElapsedMs).toBe(10000);
      expect(response.body.task.outcome).toBe('Success');
    });
  });
});
