import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { verifyDeviceSignature } from '../middleware/provenance';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'openlinear-dev-secret-change-in-production';

function generateSignature(method: string, url: string, timestamp: string, nonce: string, body: any, token: string) {
  const payloadToSign = `${method}:${url}:${timestamp}:${nonce}:${JSON.stringify(body)}`;
  return crypto.createHmac('sha256', token).update(payloadToSign).digest('hex');
}

function createTestApp() {
  const app = express();
  app.use(express.json());

  app.post('/api/execution/metadata/start', verifyDeviceSignature, (req, res) => {
    res.json({ success: true, validated: true });
  });

  return app;
}

describe('Provenance Middleware', () => {
  const app = createTestApp();
  const token = jwt.sign({ userId: 'user-1' }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 400 when headers are missing', async () => {
    const res = await request(app)
      .post('/api/execution/metadata/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ taskId: 'tsk_123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing provenance headers');
  });

  it('returns 400 when request is too old', async () => {
    const timestamp = (Date.now() - 10 * 60 * 1000).toString();
    const nonce = crypto.randomUUID();
    const signature = generateSignature('POST', '/api/execution/metadata/start', timestamp, nonce, { taskId: 'tsk_123' }, token);

    const res = await request(app)
      .post('/api/execution/metadata/start')
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-id', 'test-device')
      .set('x-timestamp', timestamp)
      .set('x-nonce', nonce)
      .set('x-signature', signature)
      .send({ taskId: 'tsk_123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Request expired');
  });

  it('returns 409 when nonce is reused (replay detection)', async () => {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const signature = generateSignature('POST', '/api/execution/metadata/start', timestamp, nonce, { taskId: 'tsk_123' }, token);

    const first = await request(app)
      .post('/api/execution/metadata/start')
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-id', 'test-device')
      .set('x-timestamp', timestamp)
      .set('x-nonce', nonce)
      .set('x-signature', signature)
      .send({ taskId: 'tsk_123' });

    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/execution/metadata/start')
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-id', 'test-device')
      .set('x-timestamp', timestamp)
      .set('x-nonce', nonce)
      .set('x-signature', signature)
      .send({ taskId: 'tsk_123' });

    expect(second.status).toBe(409);
    expect(second.body.error).toBe('Replay detected');
  });

  it('returns 401 when signature is invalid', async () => {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();

    const res = await request(app)
      .post('/api/execution/metadata/start')
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-id', 'test-device')
      .set('x-timestamp', timestamp)
      .set('x-nonce', nonce)
      .set('x-signature', 'invalid-signature')
      .send({ taskId: 'tsk_123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('returns 200 for valid signed request', async () => {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const body = { taskId: 'tsk_123', runId: 'run_456', status: 'running' };
    const signature = generateSignature('POST', '/api/execution/metadata/start', timestamp, nonce, body, token);

    const res = await request(app)
      .post('/api/execution/metadata/start')
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-id', 'test-device')
      .set('x-timestamp', timestamp)
      .set('x-nonce', nonce)
      .set('x-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('clears nonces when set exceeds 10000', async () => {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const body = { taskId: 'tsk_123' };
    const signature = generateSignature('POST', '/api/execution/metadata/start', timestamp, nonce, body, token);

    const res = await request(app)
      .post('/api/execution/metadata/start')
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-id', 'test-device')
      .set('x-timestamp', timestamp)
      .set('x-nonce', nonce)
      .set('x-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
  });
});
