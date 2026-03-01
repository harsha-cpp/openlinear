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

describe('Privacy Contract Tests', () => {
  const app = createApp();
  let user: any;
  let team: any;
  let project: any;
  let task: any;
  let token: string;

  beforeAll(async () => {
    await prisma.task.deleteMany({ where: { title: 'Privacy Contract Task' } });
    await prisma.project.deleteMany({ where: { name: 'Privacy Contract Project' } });
    await prisma.team.deleteMany({ where: { name: 'Privacy Contract Team' } });
    await prisma.user.deleteMany({ where: { email: 'privacy-test@example.com' } });

    user = await prisma.user.create({
      data: {
        email: 'privacy-test@example.com',
        githubId: 999999999,
        username: 'privacy-test-user',
      },
    });

    team = await prisma.team.create({
      data: {
        name: 'Privacy Contract Team',
        key: 'PRIV',
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
        name: 'Privacy Contract Project',
        projectTeams: {
          create: {
            teamId: team.id,
          },
        },
      },
    });

    task = await prisma.task.create({
      data: {
        title: 'Privacy Contract Task',
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

  const endpoints = [
    { method: 'POST', url: '/api/execution/metadata/start' },
    { method: 'PUT', url: '/api/execution/metadata/progress' },
    { method: 'POST', url: '/api/execution/metadata/finish' },
  ];

  describe('Allowed payload pass cases', () => {
    endpoints.forEach(({ method, url }) => {
      it(`should accept allowed metadata payload for ${method} ${url}`, async () => {
        const payload = {
          taskId: task.id,
          runId: 'run_privacy_123',
          status: 'running',
          durationMs: 1000,
        };

        const timestamp = Date.now().toString();
        const nonce = crypto.randomUUID();
        const signature = generateSignature(method, url, timestamp, nonce, payload, token);

        const req = request(app)[method.toLowerCase() as 'post' | 'put'](url)
          .set('Authorization', `Bearer ${token}`)
          .set('x-device-id', 'test-device')
          .set('x-timestamp', timestamp)
          .set('x-nonce', nonce)
          .set('x-signature', signature)
          .send(payload);

        const response = await req;
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Forbidden field rejection', () => {
    const forbiddenPayloads = [
      { field: 'prompt', value: 'Fix the bug in src/auth.ts' },
      { field: 'toolLogs', value: [{ command: 'cat src/auth.ts', output: 'import { jwt }' }] },
      { field: 'repoPath', value: '/Users/dev/projects/myrepo' },
      { field: 'accessToken', value: 'gho_abc123secret' },
      { field: 'apiKey', value: 'sk-1234567890' },
      { field: 'env', value: { DATABASE_URL: 'postgres://user:pass@localhost:5432/db' } },
      { field: 'localPath', value: '/home/user/.config/openlinear' },
    ];

    endpoints.forEach(({ method, url }) => {
      forbiddenPayloads.forEach(({ field, value }) => {
        it(`should reject payload with forbidden field '${field}' for ${method} ${url}`, async () => {
          const payload = {
            taskId: task.id,
            runId: 'run_privacy_123',
            status: 'running',
            [field]: value,
          };

          const timestamp = Date.now().toString();
          const nonce = crypto.randomUUID();
          const signature = generateSignature(method, url, timestamp, nonce, payload, token);

          const req = request(app)[method.toLowerCase() as 'post' | 'put'](url)
            .set('Authorization', `Bearer ${token}`)
            .set('x-device-id', 'test-device')
            .set('x-timestamp', timestamp)
            .set('x-nonce', nonce)
            .set('x-signature', signature)
            .send(payload);

          const response = await req;
          expect(response.status).toBe(400);
          expect(response.body.code).toBe('FORBIDDEN_FIELDS');
        });
      });
    });
  });
});
