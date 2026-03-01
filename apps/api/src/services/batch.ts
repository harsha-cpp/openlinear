import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@openlinear/db';
import { broadcast } from '../sse';
import { ensureMainRepo, cleanupBatch, mergeBranch, createBatchBranch, pushBranch } from './worktree';
import type { BatchState, BatchTask, BatchSettings, CreateBatchParams, BatchEventType } from '../types/batch';

const execAsync = promisify(exec);

const activeBatches = new Map<string, BatchState>();
const sessionToBatch = new Map<string, { batchId: string; taskId: string }>();

interface BatchLogEntry {
  timestamp: string;
  type: 'info' | 'agent' | 'tool' | 'error' | 'success';
  message: string;
  details?: string;
}
const batchTaskLogs = new Map<string, BatchLogEntry[]>();

function broadcastBatchEvent(type: BatchEventType, batchId: string, data: Record<string, unknown> = {}): void {
  broadcast(type, { batchId, ...data, timestamp: new Date().toISOString() });
}

export async function createBatch(params: CreateBatchParams): Promise<BatchState> {
  const batchId = randomUUID();

  const settings = await prisma.settings.findFirst({ where: { id: 'default' } }) as Record<string, unknown> | null;
  const batchSettings: BatchSettings = {
    maxConcurrent: (settings?.maxBatchSize as number) ?? 3,
    autoApprove: (settings?.queueAutoApprove as boolean) ?? false,
    stopOnFailure: (settings?.stopOnFailure as boolean) ?? false,
    conflictBehavior: (settings?.conflictBehavior as 'skip' | 'fail') ?? 'skip',
  };

  // Try to get repository from tasks' project first
  const firstTask = await prisma.task.findFirst({
    where: { id: { in: params.taskIds } },
    include: { project: { include: { repository: true } } },
  });

  let project: { id: string; name: string; fullName: string; cloneUrl: string; defaultBranch: string } | null = null;

  if (firstTask?.project?.repository) {
    project = firstTask.project.repository;
  } else {
    // Fallback: global active repository
    project = await prisma.repository.findFirst({
      where: params.userId
        ? { userId: params.userId, isActive: true }
        : { userId: null, isActive: true },
    });
  }

  if (!project) {
    throw new Error('No active project selected');
  }

  const mainRepoPath = await ensureMainRepo(project.id, project.cloneUrl, params.accessToken);

  const taskRecords = await prisma.task.findMany({
    where: { id: { in: params.taskIds } },
    select: { id: true, title: true },
  });
  const titleMap = new Map(taskRecords.map(t => [t.id, t.title]));

  const tasks: BatchTask[] = params.taskIds.map(taskId => ({
    taskId,
    title: titleMap.get(taskId) || 'Untitled task',
    status: 'queued',
    worktreePath: null,
    branch: `openlinear/${taskId}`,
    sessionId: null,
    error: null,
    startedAt: null,
    completedAt: null,
  }));

  const batch: BatchState = {
    id: batchId,
    projectId: project.id,
    mode: params.mode,
    status: 'pending',
    tasks,
    settings: batchSettings,
    mainRepoPath,
    batchBranch: `openlinear/batch-${batchId.slice(0, 8)}`,
    prUrl: null,
    accessToken: params.accessToken,
    userId: params.userId,
    createdAt: new Date(),
    completedAt: null,
  };

  activeBatches.set(batchId, batch);

  await prisma.task.updateMany({
    where: { id: { in: params.taskIds } },
    data: { batchId },
  });

  broadcastBatchEvent('batch:created', batchId, {
    mode: params.mode,
    status: 'running',
    tasks: tasks.map(t => ({ taskId: t.taskId, title: t.title, status: t.status })),
  });

  return batch;
}

export async function startBatch(batchId: string): Promise<void> {
  const batch = activeBatches.get(batchId);
  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  batch.status = 'running';
  broadcastBatchEvent('batch:started', batchId, {
    mode: batch.mode,
    status: 'running',
    tasks: batch.tasks.map(t => ({ taskId: t.taskId, title: t.title, status: t.status })),
  });

  if (batch.mode === 'parallel') {
    const count = Math.min(batch.settings.maxConcurrent, batch.tasks.length);
    for (let i = 0; i < count; i++) {
      startTask(batch, i);
    }
  } else {
    startTask(batch, 0);
  }
}

async function startTask(batch: BatchState, taskIndex: number): Promise<void> {
  const task = batch.tasks[taskIndex];
  if (!task) return;

  task.status = 'running';
  task.startedAt = new Date();

  try {
    broadcastBatchEvent('batch:task:started', batch.id, { taskId: task.taskId, title: task.title });

    await updateTaskInDb(task.taskId, 'in_progress', {
      executionStartedAt: task.startedAt!,
      executionProgress: 0,
    });

    emitBatchLog(task.taskId, 'info', `Batch task started in ${batch.mode} mode (waiting for local execution)`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Batch] Failed to start task ${task.taskId.slice(0, 8)}:`, errorMsg);
    task.status = 'failed';
    task.error = errorMsg;
    task.completedAt = new Date();
    broadcastBatchEvent('batch:task:failed', batch.id, { taskId: task.taskId, error: errorMsg });
    emitBatchLog(task.taskId, 'error', `Failed to start task: ${errorMsg}`);

    if (batch.settings.stopOnFailure) {
      await cancelBatch(batch.id);
      return;
    }

    await advanceQueue(batch);
  }
}

function emitBatchLog(taskId: string, type: 'info' | 'agent' | 'tool' | 'error' | 'success', message: string, details?: string): void {
  const entry: BatchLogEntry = { timestamp: new Date().toISOString(), type, message, ...(details ? { details } : {}) };

  if (!batchTaskLogs.has(taskId)) {
    batchTaskLogs.set(taskId, []);
  }
  batchTaskLogs.get(taskId)!.push(entry);

  broadcast('execution:log', { taskId, entry });
}

async function updateTaskInDb(
  taskId: string,
  status: 'todo' | 'in_progress' | 'done' | 'cancelled',
  executionData?: {
    executionStartedAt?: Date;
    executionElapsedMs?: number;
    executionProgress?: number | null;
    prUrl?: string | null;
    outcome?: string | null;
  }
): Promise<void> {
  try {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: { status, ...executionData },
      include: { labels: { include: { label: true } } },
    });

    const flatTask = {
      ...task,
      labels: (task.labels as Array<{ label: { id: string; name: string; color: string } }>).map(tl => tl.label),
    };

    broadcast('task:updated', flatTask);
  } catch (err) {
    console.error(`[Batch] Failed to update task ${taskId} in DB:`, err);
  }
}

export async function handleTaskComplete(
  batchId: string,
  taskId: string,
  success: boolean,
  error?: string
): Promise<void> {
  const batch = activeBatches.get(batchId);
  if (!batch) return;

  const task = batch.tasks.find(t => t.taskId === taskId);
  if (!task || task.status === 'completed' || task.status === 'failed') return;

  const elapsedMs = task.startedAt ? Date.now() - task.startedAt.getTime() : 0;

  if (success) {
    task.status = 'completed';
    broadcastBatchEvent('batch:task:completed', batchId, { taskId });
    emitBatchLog(taskId, 'success', 'Batch task completed');
  } else {
    task.status = 'failed';
    task.error = error || 'Unknown error';
    broadcastBatchEvent('batch:task:failed', batchId, { taskId, error: task.error });
    emitBatchLog(taskId, 'error', `Batch task failed: ${task.error}`);
  }

  task.completedAt = new Date();

  const logs = batchTaskLogs.get(taskId) || [];
  if (logs.length > 0) {
    // We no longer persist raw execution logs for privacy/compliance reasons.
    batchTaskLogs.delete(taskId);
  }

  if (task.sessionId) {
    sessionToBatch.delete(task.sessionId);
  }

  if (!success && batch.settings.stopOnFailure) {
    await cancelBatch(batchId);
    return;
  }

  await advanceQueue(batch);
}

async function advanceQueue(batch: BatchState): Promise<void> {
  const hasRemaining = batch.tasks.some(t => t.status === 'queued' || t.status === 'running');
  if (!hasRemaining) {
    await finalizeBatch(batch.id);
    return;
  }

  const nextIndex = batch.tasks.findIndex(t => t.status === 'queued');
  if (nextIndex === -1) return;

  if (batch.mode === 'parallel') {
    startTask(batch, nextIndex);
  } else if (batch.settings.autoApprove) {
    startTask(batch, nextIndex);
  }
}

async function finalizeBatch(batchId: string): Promise<void> {
  const batch = activeBatches.get(batchId);
  if (!batch) return;

  batch.status = 'merging';
  broadcastBatchEvent('batch:merging', batchId);

  const project = await prisma.repository.findUnique({ where: { id: batch.projectId } });
  const targetBranch = project?.defaultBranch || 'main';

  if (project) {
    try {
      const mainRepoPath = batch.mainRepoPath;
      console.log(`[Batch] Fetching latest from origin before merging batch ${batchId}`);
      await execAsync(`git -C ${mainRepoPath} fetch origin`);
    } catch (err) {
      console.error(`[Batch] Failed to fetch origin before merging:`, err);
    }
  }

  await createBatchBranch(batch.projectId, batch.batchBranch, targetBranch);

  let hasFatalFailure = false;

  for (const task of batch.tasks) {
    if (task.status !== 'completed') continue;

    try {
      const merged = await mergeBranch(batch.projectId, task.branch, batch.batchBranch);

      if (!merged) {
        if (batch.settings.conflictBehavior === 'fail') {
          task.status = 'failed';
          task.error = 'Merge conflict';
          hasFatalFailure = true;
          broadcastBatchEvent('batch:task:failed', batchId, { taskId: task.taskId, error: 'Merge conflict' });
          break;
        } else {
          task.status = 'skipped';
          task.error = 'Merge conflict (skipped)';
          broadcastBatchEvent('batch:task:skipped', batchId, { taskId: task.taskId });
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Merge error';
      console.error(`[Batch] Merge failed for task ${task.taskId.slice(0, 8)}:`, errorMsg);

      if (batch.settings.conflictBehavior === 'fail') {
        task.status = 'failed';
        task.error = errorMsg;
        hasFatalFailure = true;
        broadcastBatchEvent('batch:task:failed', batchId, { taskId: task.taskId, error: errorMsg });
        break;
      } else {
        task.status = 'skipped';
        task.error = errorMsg;
        broadcastBatchEvent('batch:task:skipped', batchId, { taskId: task.taskId });
      }
    }
  }

  if (hasFatalFailure) {
    batch.status = 'failed';
    batch.completedAt = new Date();
    broadcastBatchEvent('batch:failed', batchId);
  } else {
    try {
      const proj = await prisma.repository.findUnique({ where: { id: batch.projectId } });
      if (proj) {
        await pushBranch(batch.projectId, batch.batchBranch, proj.cloneUrl, batch.accessToken);

        const completedTasks = batch.tasks.filter(t => t.status === 'completed');
        const taskTitles = completedTasks.map(t => `- ${t.title}`).join('\n');
        const prTitle = `Batch: ${completedTasks.length} tasks`;
        const prBody = `Automated batch PR by OpenLinear\n\n## Tasks\n${taskTitles}`;

        const [owner, repo] = proj.fullName.split('/');
        const compareUrl = `https://github.com/${owner}/${repo}/compare/${targetBranch}...${batch.batchBranch}`;

        if (batch.accessToken) {
          try {
            const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${batch.accessToken}`,
                Accept: 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                title: prTitle,
                head: batch.batchBranch,
                base: targetBranch,
                body: prBody,
              }),
            });
            if (response.ok) {
              const pr = await response.json() as { html_url: string };
              batch.prUrl = pr.html_url;
            } else {
              batch.prUrl = compareUrl;
            }
          } catch {
            batch.prUrl = compareUrl;
          }
        } else {
          batch.prUrl = compareUrl;
        }
      }
    } catch (pushError) {
      console.error(`[Batch] Push/PR creation failed:`, pushError);
    }

    batch.status = 'completed';
    batch.completedAt = new Date();

    if (batch.prUrl) {
      const completedTaskIds = batch.tasks
        .filter(t => t.status === 'completed')
        .map(t => t.taskId);
      for (const taskId of completedTaskIds) {
        await updateTaskInDb(taskId, 'done', { prUrl: batch.prUrl });
      }
    }

    broadcastBatchEvent('batch:completed', batchId, { prUrl: batch.prUrl });
  }

  try {
    await cleanupBatch(batch.projectId, batchId);
  } catch (error) {
    console.error(`[Batch] Cleanup failed for batch ${batchId.slice(0, 8)}:`, error);
  }
}

export async function cancelBatch(batchId: string): Promise<void> {
  const batch = activeBatches.get(batchId);
  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  batch.status = 'cancelled';

  for (const task of batch.tasks) {
    if (task.status === 'running' || task.status === 'queued') {
      task.status = 'cancelled';
      task.completedAt = new Date();
      if (task.sessionId) {
        sessionToBatch.delete(task.sessionId);
      }
    }
  }

  broadcastBatchEvent('batch:cancelled', batchId);

  try {
    await cleanupBatch(batch.projectId, batchId);
  } catch (error) {
    console.error(`[Batch] Cleanup failed for cancelled batch ${batchId.slice(0, 8)}:`, error);
  }
}

export async function cancelTask(batchId: string, taskId: string): Promise<void> {
  const batch = activeBatches.get(batchId);
  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  const task = batch.tasks.find(t => t.taskId === taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found in batch ${batchId}`);
  }

  task.status = 'cancelled';
  task.completedAt = new Date();

  if (task.sessionId) {
    sessionToBatch.delete(task.sessionId);
  }

  broadcastBatchEvent('batch:task:cancelled', batchId, { taskId });
}

export function getBatch(batchId: string): BatchState | undefined {
  return activeBatches.get(batchId);
}

export function getActiveBatches(): BatchState[] {
  return Array.from(activeBatches.values());
}

export async function approveNextTask(batchId: string): Promise<void> {
  const batch = activeBatches.get(batchId);
  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  const nextIndex = batch.tasks.findIndex(t => t.status === 'queued');
  if (nextIndex === -1) {
    throw new Error('No queued tasks to approve');
  }

  await startTask(batch, nextIndex);
}
