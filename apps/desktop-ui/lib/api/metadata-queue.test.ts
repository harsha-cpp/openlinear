import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import nodeCrypto from 'node:crypto';
import { MetadataQueue, ExecutionMetadataSync } from './metadata-queue';

describe('MetadataQueue', () => {
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
  });

  it('offline flush with exponential backoff', async () => {
    let fetchCalls = 0;
    let fetchSucceeds = false;

    global.fetch = vi.fn(async () => {
      fetchCalls++;
      if (!fetchSucceeds) {
        throw new Error('Network error');
      }
      return { ok: true, status: 200, text: async () => '' } as any;
    });

    const queue = new MetadataQueue();
    queue.clearQueue();

    const payload: ExecutionMetadataSync = {
      taskId: 'task-1',
      runId: 'run-1',
      status: 'starting'
    };

    queue.enqueue(payload);

    vi.advanceTimersByTime(100);
    await new Promise(resolve => setImmediate(resolve));

    expect(fetchCalls).toBe(1);
    expect(queue.getQueue().length).toBe(1);
    expect(queue.getQueue()[0].retryCount).toBe(1);

    vi.advanceTimersByTime(2000);
    await new Promise(resolve => setImmediate(resolve));

    expect(fetchCalls).toBe(2);
    expect(queue.getQueue().length).toBe(1);
    expect(queue.getQueue()[0].retryCount).toBe(2);

    fetchSucceeds = true;

    vi.advanceTimersByTime(4000);
    await new Promise(resolve => setImmediate(resolve));

    expect(fetchCalls).toBe(3);
    expect(queue.getQueue().length).toBe(0);
  });

  it('deduplicates events with same task/run/status key', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('Network error');
    });

    const queue = new MetadataQueue();
    queue.clearQueue();

    const payload1: ExecutionMetadataSync = {
      taskId: 'task-1',
      runId: 'run-1',
      status: 'starting'
    };

    queue.enqueue(payload1);
    queue.enqueue(payload1);

    expect(queue.getQueue().length).toBe(1);

    const payload2: ExecutionMetadataSync = {
      taskId: 'task-1',
      runId: 'run-1',
      status: 'running'
    };
    queue.enqueue(payload2);

    expect(queue.getQueue().length).toBe(2);
    expect(queue.getQueue()[1].payload.status).toBe('running');

    queue.enqueue(payload1);
    expect(queue.getQueue().length).toBe(2);
    expect(queue.getQueue()[0].payload.status).toBe('starting');
  });

  it('starting status maps to running and uses start endpoint', async () => {
    let receivedUrl = '';
    let receivedMethod = '';
    let receivedBody: Record<string, unknown> = {};

    global.fetch = vi.fn(async (_url, options: any) => {
      receivedUrl = String(_url);
      receivedMethod = String(options?.method || '');
      receivedBody = JSON.parse(String(options?.body || '{}')) as Record<string, unknown>;
      return { ok: true, status: 200, text: async () => '' } as any;
    });

    const queue = new MetadataQueue();
    queue.clearQueue();

    queue.enqueue({
      taskId: 'task-start',
      runId: 'run-start',
      status: 'starting',
    });

    vi.advanceTimersByTime(100);
    await new Promise(resolve => setImmediate(resolve));

    expect(receivedUrl.endsWith('/api/execution/metadata/start')).toBe(true);
    expect(receivedMethod).toBe('POST');
    expect(receivedBody.taskId).toBe('task-start');
    expect(receivedBody.runId).toBe('run-start');
    expect(receivedBody.status).toBe('running');
  });

  it('signs sync requests with provenance headers when auth token exists', async () => {
    const token = 'metadata-test-token';
    const storage = new Map<string, string>([['token', token]]);
    (globalThis as any).window = {
      location: { hostname: 'localhost', protocol: 'http:' },
      navigator: { userAgent: 'vitest' },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    };

    let receivedUrl = '';
    let receivedMethod = '';
    let receivedHeaders: Record<string, string> = {};
    let receivedBody = '';

    global.fetch = vi.fn(async (_url, options: any) => {
      receivedUrl = String(_url);
      receivedMethod = String(options?.method || '');
      receivedHeaders = options?.headers as Record<string, string>;
      receivedBody = String(options?.body || '');
      return { ok: true, status: 200, text: async () => '' } as any;
    });

    const queue = new MetadataQueue();
    queue.clearQueue();

    queue.enqueue({
      taskId: 'task-signed',
      runId: 'run-signed',
      status: 'starting',
    });

    await queue.processQueue();

    expect(receivedUrl.endsWith('/api/execution/metadata/start')).toBe(true);
    expect(receivedMethod).toBe('POST');
    expect(receivedHeaders.Authorization).toBe(`Bearer ${token}`);
    expect(receivedHeaders['x-device-id']).toBeTruthy();
    expect(receivedHeaders['x-timestamp']).toBeTruthy();
    expect(receivedHeaders['x-nonce']).toBeTruthy();

    const expectedSignature = nodeCrypto
      .createHmac('sha256', token)
      .update(`POST:/api/execution/metadata/start:${receivedHeaders['x-timestamp']}:${receivedHeaders['x-nonce']}:${receivedBody}`)
      .digest('hex');

    expect(receivedHeaders['x-signature']).toBe(expectedSignature);
  });

  it('strips forbidden fields from sync payload', async () => {
    let receivedBody: Record<string, unknown> = {};

    global.fetch = vi.fn(async (_url, options: any) => {
      receivedBody = JSON.parse(String(options?.body || '{}')) as Record<string, unknown>;
      return { ok: true, status: 200, text: async () => '' } as any;
    });

    const queue = new MetadataQueue();
    queue.clearQueue();

    queue.enqueue({
      taskId: 'task-privacy',
      runId: 'run-privacy',
      status: 'running',
      outcome: 'ok',
      prompt: 'do not sync',
      logs: 'do not sync',
      apiKey: 'do not sync',
    } as ExecutionMetadataSync);

    vi.advanceTimersByTime(100);
    await new Promise(resolve => setImmediate(resolve));

    expect(receivedBody.taskId).toBe('task-privacy');
    expect(receivedBody.runId).toBe('run-privacy');
    expect(receivedBody.status).toBe('running');
    expect(receivedBody.outcome).toBe('ok');
    expect('prompt' in receivedBody).toBe(false);
    expect('logs' in receivedBody).toBe(false);
    expect('apiKey' in receivedBody).toBe(false);
  });

  it('drops invalid metadata without task/run identifiers', async () => {
    global.fetch = vi.fn(async () => {
      return { ok: true, status: 200, text: async () => '' } as any;
    });

    const queue = new MetadataQueue();
    queue.clearQueue();

    queue.enqueue({ taskId: '', runId: 'run-1', status: 'running' } as ExecutionMetadataSync);
    queue.enqueue({ taskId: 'task-1', runId: '', status: 'running' } as ExecutionMetadataSync);

    expect(queue.getQueue().length).toBe(0);
  });

  it('soak: repeated offline/reconnect cycles without duplicates', async () => {
    let fetchCalls = 0;
    let isOnline = false;
    const receivedPayloads: any[] = [];

    global.fetch = vi.fn(async (_url, options: any) => {
      fetchCalls++;
      if (!isOnline) {
        throw new Error('Network error');
      }
      receivedPayloads.push(JSON.parse(options.body));
      return { ok: true, status: 200, text: async () => '' } as any;
    });

    const queue = new MetadataQueue();
    queue.clearQueue();

    isOnline = false;
    for (let i = 1; i <= 5; i++) {
      queue.enqueue({
        taskId: 'task-soak',
        runId: 'run-1',
        status: 'running'
      });
      vi.advanceTimersByTime(100);
      await new Promise(resolve => setImmediate(resolve));
    }

    expect(queue.getQueue().length).toBe(1);
    expect(queue.getQueue()[0].payload.status).toBe('running');

    isOnline = true;
    vi.advanceTimersByTime(10000);
    await new Promise(resolve => setImmediate(resolve));

    expect(queue.getQueue().length).toBe(0);
    expect(receivedPayloads.length).toBe(1);
    expect(receivedPayloads[0].status).toBe('running');

    isOnline = false;
    queue.enqueue({
      taskId: 'task-soak',
      runId: 'run-1',
      status: 'completed'
    });
    vi.advanceTimersByTime(100);
    await new Promise(resolve => setImmediate(resolve));

    expect(queue.getQueue().length).toBe(1);

    isOnline = true;
    vi.advanceTimersByTime(10000);
    await new Promise(resolve => setImmediate(resolve));

    expect(queue.getQueue().length).toBe(0);
    expect(receivedPayloads.length).toBe(2);
    expect(receivedPayloads[1].status).toBe('completed');
  });

  it('outage: API outage causes retries then eventual success without duplicates', async () => {
    let fetchCalls = 0;
    let consecutiveFailures = 0;
    const targetFailures = 3;
    const receivedPayloads: any[] = [];

    global.fetch = vi.fn(async (_url, options: any) => {
      fetchCalls++;
      if (consecutiveFailures < targetFailures) {
        consecutiveFailures++;
        return { ok: false, status: 503, text: async () => 'Service Unavailable' } as any;
      }
      receivedPayloads.push(JSON.parse(options.body));
      return { ok: true, status: 200, text: async () => '' } as any;
    });

    const queue = new MetadataQueue();
    queue.clearQueue();

    queue.enqueue({
      taskId: 'task-outage',
      runId: 'run-1',
      status: 'running'
    });

    vi.advanceTimersByTime(100);
    await new Promise(resolve => setImmediate(resolve));
    expect(fetchCalls).toBe(1);
    expect(queue.getQueue().length).toBe(1);
    expect(queue.getQueue()[0].retryCount).toBe(1);

    vi.advanceTimersByTime(2000);
    await new Promise(resolve => setImmediate(resolve));
    expect(fetchCalls).toBe(2);
    expect(queue.getQueue().length).toBe(1);
    expect(queue.getQueue()[0].retryCount).toBe(2);

    vi.advanceTimersByTime(4000);
    await new Promise(resolve => setImmediate(resolve));
    expect(fetchCalls).toBe(3);
    expect(queue.getQueue().length).toBe(1);
    expect(queue.getQueue()[0].retryCount).toBe(3);

    vi.advanceTimersByTime(8000);
    await new Promise(resolve => setImmediate(resolve));
    expect(fetchCalls).toBe(4);
    expect(queue.getQueue().length).toBe(0);

    expect(receivedPayloads.length).toBe(1);
    expect(receivedPayloads[0].taskId).toBe('task-outage');
  });
});
