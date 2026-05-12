import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createApp } from '../app';
import { prisma } from '@openlinear/db';

const JWT_SECRET = 'openlinear-dev-secret-change-in-production';

function generateToken(userId: string, username = 'metadata-user') {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '1h' });
}

function generateSignature(method: string, url: string, timestamp: string, nonce: string, body: Record<string, unknown>, token: string) {
  const payloadToSign = `${method}:${url}:${timestamp}:${nonce}:${JSON.stringify(body)}`;
  return crypto.createHmac('sha256', token).update(payloadToSign).digest('hex');
}

describe('Execution Metadata Routes', () => {
  const app = createApp();
  let authToken: string;
  let taskId: string;

  function signedRequest(method: 'post' | 'put', url: string, token: string, body: Record<string, unknown>) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const signature = generateSignature(method.toUpperCase(), url, timestamp, nonce, body, token);

    return request(app)
      [method](url)
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-id', 'metadata-test-device')
      .set('x-timestamp', timestamp)
      .set('x-nonce', nonce)
      .set('x-signature', signature)
      .send(body);
  }

  beforeEach(async () => {
    await prisma.task.deleteMany({ where: { title: { startsWith: 'Metadata Route' } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: 'metadatatest' } } });

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const user = await prisma.user.create({
      data: {
        githubId: Math.floor(Math.random() * 1_000_000_000),
        username: `metadatatest_${suffix}`,
        email: `metadata_${suffix}@example.com`,
      },
    });
    authToken = generateToken(user.id, user.username);

    const task = await prisma.task.create({
      data: {
        title: `Metadata Route Task ${suffix}`,
        priority: 'medium',
      },
    });
    taskId = task.id;
  });

  afterEach(async () => {
    await prisma.task.deleteMany({ where: { title: { startsWith: 'Metadata Route' } } });
    await prisma.user.deleteMany({ where: { username: { startsWith: 'metadatatest' } } });
  });

  it('starts execution metadata and updates the task', async () => {
    const startedAt = '2026-01-01T00:00:00Z';
    const body = { taskId, runId: 'run-start', status: 'running', startedAt };

    const res = await signedRequest('post', '/api/execution/metadata/start', authToken, body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.task.status).toBe('in_progress');

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    expect(task?.sessionId).toBe('run-start');
    expect(task?.status).toBe('in_progress');
    expect(task?.executionStartedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects forbidden metadata fields', async () => {
    const body = {
      taskId,
      runId: 'run-progress',
      status: 'running',
      prompt: 'do not accept prompt text',
    };

    const res = await signedRequest('put', '/api/execution/metadata/progress', authToken, body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FORBIDDEN_FIELDS');
  });

  it('finishes execution metadata and persists completion fields', async () => {
    const body = {
      taskId,
      runId: 'run-finish',
      status: 'completed',
      durationMs: 1234,
      prUrl: 'https://github.com/acme/repo/pull/42',
      outcome: 'Completed from metadata sync',
    };

    const res = await signedRequest('post', '/api/execution/metadata/finish', authToken, body);

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('done');
    expect(res.body.task.prUrl).toBe('https://github.com/acme/repo/pull/42');

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    expect(task?.status).toBe('done');
    expect(task?.executionElapsedMs).toBe(1234);
    expect(task?.executionProgress).toBe(100);
    expect(task?.outcome).toBe('Completed from metadata sync');
  });

  it('requires provenance headers', async () => {
    const res = await request(app)
      .post('/api/execution/metadata/start')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ taskId, runId: 'run-start', status: 'running' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing provenance headers');
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/execution/metadata/start')
      .send({ taskId, runId: 'run-start', status: 'running' });

    expect(res.status).toBe(401);
  });
});
