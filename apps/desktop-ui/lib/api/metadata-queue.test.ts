import test from 'node:test';
import assert from 'node:assert';
import { MetadataQueue, ExecutionMetadataSync } from './metadata-queue';

test('offline flush', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  
  let fetchCalls = 0;
  let fetchSucceeds = false;
  
  global.fetch = async () => {
    fetchCalls++;
    if (!fetchSucceeds) {
      throw new Error('Network error');
    }
    return { ok: true, status: 200, text: async () => '' } as any;
  };

  const queue = new MetadataQueue();
  queue.clearQueue();
  
  const payload: ExecutionMetadataSync = {
    taskId: 'task-1',
    runId: 'run-1',
    status: 'starting'
  };

  queue.enqueue(payload);
  
  // Initial sync is scheduled for 100ms
  t.mock.timers.tick(100);
  
  // Wait for async processQueue to finish
  await new Promise(resolve => setImmediate(resolve));
  
  assert.strictEqual(fetchCalls, 1);
  assert.strictEqual(queue.getQueue().length, 1);
  assert.strictEqual(queue.getQueue()[0].retryCount, 1);
  
  // Next sync is scheduled for BASE_BACKOFF_MS * 2^1 = 2000ms
  t.mock.timers.tick(2000);
  await new Promise(resolve => setImmediate(resolve));
  
  assert.strictEqual(fetchCalls, 2);
  assert.strictEqual(queue.getQueue().length, 1);
  assert.strictEqual(queue.getQueue()[0].retryCount, 2);
  
  // Now let it succeed
  fetchSucceeds = true;
  
  // Next sync is scheduled for BASE_BACKOFF_MS * 2^2 = 4000ms
  t.mock.timers.tick(4000);
  await new Promise(resolve => setImmediate(resolve));
  
  assert.strictEqual(fetchCalls, 3);
  assert.strictEqual(queue.getQueue().length, 0);
});

test('dedupe', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  
  global.fetch = async () => {
    throw new Error('Network error'); // Keep them in queue
  };

  const queue = new MetadataQueue();
  queue.clearQueue();
  
  const payload1: ExecutionMetadataSync = {
    taskId: 'task-1',
    runId: 'run-1',
    status: 'starting'
  };

  queue.enqueue(payload1);
  
  // Enqueue same payload again
  queue.enqueue(payload1);
  
  assert.strictEqual(queue.getQueue().length, 1);
  
  // Enqueue with different status
  const payload2: ExecutionMetadataSync = {
    taskId: 'task-1',
    runId: 'run-1',
    status: 'running'
  };
  queue.enqueue(payload2);
  
  assert.strictEqual(queue.getQueue().length, 2);
  assert.strictEqual(queue.getQueue()[1].payload.status, 'running');
  
  // Enqueue payload1 again, should update the first one
  queue.enqueue(payload1);
  assert.strictEqual(queue.getQueue().length, 2);
  assert.strictEqual(queue.getQueue()[0].payload.status, 'starting');
});

test('soak: repeated offline/reconnect cycles', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  
  let fetchCalls = 0;
  let isOnline = false;
  const receivedPayloads: any[] = [];
  
  global.fetch = async (url, options: any) => {
    fetchCalls++;
    if (!isOnline) {
      throw new Error('Network error');
    }
    receivedPayloads.push(JSON.parse(options.body));
    return { ok: true, status: 200, text: async () => '' } as any;
  };

  const queue = new MetadataQueue();
  queue.clearQueue();
  
  isOnline = false;
  for (let i = 1; i <= 5; i++) {
    queue.enqueue({
      taskId: 'task-soak',
      runId: 'run-1',
      status: 'running'
    });
    t.mock.timers.tick(100);
    await new Promise(resolve => setImmediate(resolve));
  }
  
  assert.strictEqual(queue.getQueue().length, 1);
  assert.strictEqual(queue.getQueue()[0].payload.status, 'running');
  
  isOnline = true;
  t.mock.timers.tick(10000);
  await new Promise(resolve => setImmediate(resolve));
  
  assert.strictEqual(queue.getQueue().length, 0);
  assert.strictEqual(receivedPayloads.length, 1);
  assert.strictEqual(receivedPayloads[0].status, 'running');
  
  isOnline = false;
  queue.enqueue({
    taskId: 'task-soak',
    runId: 'run-1',
    status: 'completed'
  });
  t.mock.timers.tick(100);
  await new Promise(resolve => setImmediate(resolve));
  
  assert.strictEqual(queue.getQueue().length, 1);
  
  isOnline = true;
  t.mock.timers.tick(10000);
  await new Promise(resolve => setImmediate(resolve));
  
  assert.strictEqual(queue.getQueue().length, 0);
  assert.strictEqual(receivedPayloads.length, 2);
  assert.strictEqual(receivedPayloads[1].status, 'completed');
});

test('outage: API outage causes retries then eventual success without duplicates', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  
  let fetchCalls = 0;
  let consecutiveFailures = 0;
  const targetFailures = 3;
  const receivedPayloads: any[] = [];
  
  global.fetch = async (url, options: any) => {
    fetchCalls++;
    if (consecutiveFailures < targetFailures) {
      consecutiveFailures++;
      return { ok: false, status: 503, text: async () => 'Service Unavailable' } as any;
    }
    receivedPayloads.push(JSON.parse(options.body));
    return { ok: true, status: 200, text: async () => '' } as any;
  };

  const queue = new MetadataQueue();
  queue.clearQueue();
  
  queue.enqueue({
    taskId: 'task-outage',
    runId: 'run-1',
    status: 'running'
  });
  
  t.mock.timers.tick(100);
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(fetchCalls, 1);
  assert.strictEqual(queue.getQueue().length, 1);
  assert.strictEqual(queue.getQueue()[0].retryCount, 1);
  
  t.mock.timers.tick(2000);
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(fetchCalls, 2);
  assert.strictEqual(queue.getQueue().length, 1);
  assert.strictEqual(queue.getQueue()[0].retryCount, 2);
  
  t.mock.timers.tick(4000);
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(fetchCalls, 3);
  assert.strictEqual(queue.getQueue().length, 1);
  assert.strictEqual(queue.getQueue()[0].retryCount, 3);
  
  t.mock.timers.tick(8000);
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(fetchCalls, 4);
  assert.strictEqual(queue.getQueue().length, 0);
  
  assert.strictEqual(receivedPayloads.length, 1);
  assert.strictEqual(receivedPayloads[0].taskId, 'task-outage');
});
