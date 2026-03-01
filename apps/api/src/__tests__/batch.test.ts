import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBatch, startBatch, handleTaskComplete, getBatch } from '../services/batch';
import { prisma } from '@openlinear/db';
import * as worktree from '../services/worktree';

vi.mock('@openlinear/db', () => ({
  prisma: {
    settings: { findFirst: vi.fn() },
    task: { 
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn().mockResolvedValue({ labels: [] }),
      findUnique: vi.fn()
    },
    repository: { findFirst: vi.fn(), findUnique: vi.fn() },
  }
}));

vi.mock('../services/worktree', () => ({
  ensureMainRepo: vi.fn().mockResolvedValue('/tmp/repo'),
  createWorktree: vi.fn().mockResolvedValue('/tmp/repo/wt'),
  cleanupBatch: vi.fn().mockResolvedValue(undefined),
  mergeBranch: vi.fn().mockResolvedValue(true),
  createBatchBranch: vi.fn().mockResolvedValue(undefined),
  pushBranch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../sse', () => ({
  broadcast: vi.fn(),
}));

describe('Batch Execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create and start a batch', async () => {
    vi.mocked(prisma.settings.findFirst).mockResolvedValue({ maxBatchSize: 3, queueAutoApprove: true, stopOnFailure: false, conflictBehavior: 'skip' } as any);
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ project: { repository: { id: 'repo1', cloneUrl: 'url', defaultBranch: 'main' } } } as any);
    vi.mocked(prisma.task.findMany).mockResolvedValue([{ id: 'task1', title: 'Task 1' }, { id: 'task2', title: 'Task 2' }] as any);
    vi.mocked(prisma.repository.findUnique).mockResolvedValue({ id: 'repo1', cloneUrl: 'url', defaultBranch: 'main', fullName: 'owner/repo' } as any);

    const batch = await createBatch({
      taskIds: ['task1', 'task2'],
      mode: 'queue',
      projectId: 'proj1',
      userId: 'user1',
      accessToken: 'token',
    });

    expect(batch.tasks.length).toBe(2);
    expect(batch.status).toBe('pending');

    await startBatch(batch.id);

    const updatedBatch = getBatch(batch.id);
    expect(updatedBatch?.status).toBe('running');
    expect(updatedBatch?.tasks[0].status).toBe('running');
    expect(updatedBatch?.tasks[1].status).toBe('queued');
  });

  it('should handle task completion and advance queue', async () => {
    vi.mocked(prisma.settings.findFirst).mockResolvedValue({ maxBatchSize: 3, queueAutoApprove: true, stopOnFailure: false, conflictBehavior: 'skip' } as any);
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ project: { repository: { id: 'repo1', cloneUrl: 'url', defaultBranch: 'main' } } } as any);
    vi.mocked(prisma.task.findMany).mockResolvedValue([{ id: 'task1', title: 'Task 1' }, { id: 'task2', title: 'Task 2' }] as any);
    vi.mocked(prisma.repository.findUnique).mockResolvedValue({ id: 'repo1', cloneUrl: 'url', defaultBranch: 'main', fullName: 'owner/repo' } as any);

    const batch = await createBatch({
      taskIds: ['task1', 'task2'],
      mode: 'queue',
      projectId: 'proj1',
      userId: 'user1',
      accessToken: 'token',
    });

    await startBatch(batch.id);

    // Complete first task
    await handleTaskComplete(batch.id, 'task1', true);

    const updatedBatch = getBatch(batch.id);
    expect(updatedBatch?.tasks[0].status).toBe('completed');
    expect(updatedBatch?.tasks[1].status).toBe('running'); // Auto-approved
  });

  it('should handle task failure and stop if stopOnFailure is true', async () => {
    vi.mocked(prisma.settings.findFirst).mockResolvedValue({ maxBatchSize: 3, queueAutoApprove: true, stopOnFailure: true, conflictBehavior: 'skip' } as any);
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ project: { repository: { id: 'repo1', cloneUrl: 'url', defaultBranch: 'main' } } } as any);
    vi.mocked(prisma.task.findMany).mockResolvedValue([{ id: 'task1', title: 'Task 1' }, { id: 'task2', title: 'Task 2' }] as any);
    vi.mocked(prisma.repository.findUnique).mockResolvedValue({ id: 'repo1', cloneUrl: 'url', defaultBranch: 'main', fullName: 'owner/repo' } as any);

    const batch = await createBatch({
      taskIds: ['task1', 'task2'],
      mode: 'queue',
      projectId: 'proj1',
      userId: 'user1',
      accessToken: 'token',
    });

    await startBatch(batch.id);

    // Fail first task
    await handleTaskComplete(batch.id, 'task1', false, 'Test error');

    const updatedBatch = getBatch(batch.id);
    expect(updatedBatch?.tasks[0].status).toBe('failed');
    expect(updatedBatch?.status).toBe('cancelled'); // Batch cancelled due to stopOnFailure
    expect(updatedBatch?.tasks[1].status).toBe('cancelled');
  });
});
