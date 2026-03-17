import { join } from 'path';
import { prisma } from '@openlinear/db';
import { getClientForUser } from '../opencode';
import { getOrCreateBuffer } from '../delta-buffer';
import {
  parseModelReference,
  resolveOpenCodeModelSelection,
} from '../opencode-catalog';

import { cloneRepository, createBranch } from './git';
import { subscribeToSessionEvents } from './events';
import {
  activeExecutions,
  startingExecutions,
  sessionToTask,
  broadcastProgress,
  addLogEntry,
  estimateProgress,
  persistLogs,
  cleanupExecution,
  updateTaskStatus,
  ExecutionState,
  ExecuteTaskParams,
  TaskLabelRelation,
  REPOS_DIR,
  TASK_TIMEOUT_MS,
} from './state';

function normalizeExecutionStartupError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error';
  const message = raw.trim();
  const lower = message.toLowerCase();

  if (!message) {
    return 'OpenCode could not start a session';
  }

  if (lower.includes('the string did not match the expected pattern')) {
    return 'OpenCode rejected the session request';
  }

  if (lower.includes('fetch failed')) {
    return 'Could not reach the local OpenCode service';
  }

  if (lower.includes('opencode server is not running')) {
    return 'The local OpenCode service is not running';
  }

  return message;
}

function isExecutionAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.name === 'AbortError' ||
    message.includes('abort') ||
    message.includes('operation was aborted')
  );
}

export async function executeTask({ taskId, userId }: ExecuteTaskParams): Promise<{ success: boolean; error?: string }> {
  if (activeExecutions.has(taskId) || startingExecutions.has(taskId)) {
    return { success: false, error: 'Task is already running' };
  }

  const settings = await prisma.settings.findFirst({ where: { id: 'default' } });
  const parallelLimit = settings?.parallelLimit ?? 3;

  if (activeExecutions.size + startingExecutions.size >= parallelLimit) {
    return { success: false, error: `Parallel limit reached (${parallelLimit} tasks max)` };
  }

  const branchName = `openlinear/${taskId.slice(0, 8)}`;
  const startupAbortController = new AbortController();
  const startupState = {
    taskId,
    branchName,
    repoPath: null as string | null,
    startedAt: new Date(),
    cancelRequested: false,
    abortController: startupAbortController,
  };
  startingExecutions.set(taskId, startupState);

  const clearStartupExecution = () => {
    if (startingExecutions.get(taskId) === startupState) {
      startingExecutions.delete(taskId);
    }
  };

  let accessToken: string | null = null;
  let useLocalPath: string | null = null;
  let project: { id: string; name: string; fullName: string; cloneUrl: string; defaultBranch: string } | null = null;

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { accessToken: true },
    });
    accessToken = user?.accessToken ?? null;
  }

  const taskWithProject = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { include: { repository: true } },
      labels: { include: { label: true } },
    },
  });

  if (!taskWithProject) {
    clearStartupExecution();
    return { success: false, error: 'Task not found' };
  }

  if (taskWithProject.project?.localPath) {
    useLocalPath = taskWithProject.project.localPath;
  } else if (taskWithProject.project?.repository) {
    project = taskWithProject.project.repository;
  } else if (userId) {
    project = await prisma.repository.findFirst({
      where: { userId, isActive: true },
    });
  } else {
    project = await prisma.repository.findFirst({
      where: { userId: null, isActive: true },
    });
  }

  if (!project && !useLocalPath) {
    return { success: false, error: 'No active project selected' };
  }

  let repoPath: string;

  if (useLocalPath) {
    repoPath = useLocalPath;
  } else if (project) {
    repoPath = join(REPOS_DIR, project.name, taskId.slice(0, 8));
  } else {
    clearStartupExecution();
    return { success: false, error: 'No active project selected' };
  }

  startupState.repoPath = repoPath;

  try {
    // Step 1: Clone
    if (useLocalPath) {
      broadcastProgress(taskId, 'cloning', 'Preparing local repository...');
      await createBranch(repoPath, branchName, startupAbortController.signal);
    } else if (project) {
      broadcastProgress(taskId, 'cloning', 'Cloning repository...');
      await cloneRepository(project.cloneUrl, repoPath, accessToken, project.defaultBranch, startupAbortController.signal);
      await createBranch(repoPath, branchName, startupAbortController.signal);
    }

    if (startupState.cancelRequested || startupAbortController.signal.aborted) {
      clearStartupExecution();
      console.log(`[Execution] Startup cancelled for task ${taskId.slice(0, 8)} before session creation`);
      return { success: true };
    }

    broadcastProgress(taskId, 'executing', 'Starting OpenCode agent...');

    if (!userId) {
      clearStartupExecution();
      return { success: false, error: 'userId is required for execution' };
    }

    const client = await getClientForUser(userId, repoPath);
    
    const sessionResponse = await client.session.create({
      body: { 
        title: taskWithProject.title,
      },
      signal: startupAbortController.signal,
    });

    const sessionId = sessionResponse.data?.id;
    if (!sessionId) {
      console.error(`[Execution] Failed to create session for task ${taskId.slice(0, 8)}`);
      clearStartupExecution();
      return { success: false, error: 'Failed to create OpenCode session' };
    }

    if (startupState.cancelRequested || startupAbortController.signal.aborted) {
      try {
        await client.session.abort({ path: { id: sessionId } });
      } catch (abortError) {
        console.error(`[Execution] Failed to abort just-created session ${sessionId} for task ${taskId.slice(0, 8)}:`, abortError);
      }
      clearStartupExecution();
      console.log(`[Execution] Startup cancelled for task ${taskId.slice(0, 8)} after session creation`);
      return { success: true };
    }

    console.log(`[Execution] Session ${sessionId} created for task ${taskId.slice(0, 8)}`);

    // Set up timeout
    const timeoutId = setTimeout(async () => {
      console.log(`[Execution] Task ${taskId} timed out`);
      await cancelTask(taskId);
    }, TASK_TIMEOUT_MS);

    // Register in both maps
    const executionState: ExecutionState = {
      taskId,
      projectId: project?.id || taskWithProject?.project?.id || 'local',
      sessionId,
      repoPath,
      branchName,
      userId: userId ?? null,
      accessToken,
      timeoutId,
      status: 'executing',
      logs: [],
      client,
      startedAt: startupState.startedAt,
      filesChanged: 0,
      toolsExecuted: 0,
      promptSent: false,
      cancelled: false,
      promptAbortController: null,
      pendingPermissions: [],
    };

    activeExecutions.set(taskId, executionState);
    sessionToTask.set(sessionId, taskId);
    clearStartupExecution();
    getOrCreateBuffer(taskId, (msg) => addLogEntry(taskId, 'agent', msg));

    // Add initial log entries
    if (useLocalPath) {
      addLogEntry(taskId, 'info', `Using local repository: ${repoPath}`);
      addLogEntry(taskId, 'info', `Branch created: ${branchName}`);
    } else {
      addLogEntry(taskId, 'info', 'Repository cloned successfully');
      addLogEntry(taskId, 'info', `Branch created: ${branchName}`);
    }
    addLogEntry(taskId, 'info', 'OpenCode agent started');

    await updateTaskStatus(taskId, 'in_progress', sessionId, {
      executionStartedAt: executionState.startedAt,
      executionPausedAt: null,
      executionProgress: 0,
    });

    await prisma.task.update({
      where: { id: taskId },
      data: { batchId: null },
    });

    // Build prompt
    let prompt = taskWithProject.title;
    if (taskWithProject.description) {
      prompt += `\n\n${taskWithProject.description}`;
    }
    if (taskWithProject.labels.length > 0) {
      const labelNames = taskWithProject.labels.map((tl: TaskLabelRelation) => tl.label.name).join(', ');
      prompt += `\n\nLabels: ${labelNames}`;
    }

    subscribeToSessionEvents(taskId, client, sessionId);

    let modelOverride: { providerID: string; modelID: string } | undefined;
    try {
      const selection = await resolveOpenCodeModelSelection(userId, client);
      const parsedModel = parseModelReference(selection.model);
      if (parsedModel) {
        modelOverride = parsedModel;
        const labelPrefix = selection.source === 'legacy-openlinear'
          ? 'Using legacy OpenLinear model'
          : 'Using OpenCode model';
        addLogEntry(taskId, 'info', `${labelPrefix}: ${selection.model}`);
      }
    } catch (err) {
      console.debug(`[Execution] Could not read model config for task ${taskId.slice(0, 8)}:`, err);
    }

    const promptAbortController = new AbortController();
    executionState.promptAbortController = promptAbortController;

    client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: 'text', text: prompt }],
        ...(modelOverride ? { model: modelOverride } : {}),
      },
      signal: promptAbortController.signal,
    }).then(() => {
      executionState.promptAbortController = null;
      if (executionState.cancelled || !activeExecutions.has(taskId)) {
        console.log(`[Execution] Prompt resolved after cancellation for task ${taskId.slice(0, 8)}, ignoring`);
        return;
      }
      console.log(`[Execution] Prompt sent to session ${sessionId}`);
      executionState.promptSent = true;
      addLogEntry(taskId, 'info', 'Task prompt sent to agent');
    }).catch(async (err: Error) => {
      executionState.promptAbortController = null;
      if (executionState.cancelled || promptAbortController.signal.aborted || err.name === 'AbortError') {
        console.log(`[Execution] Prompt aborted for task ${taskId.slice(0, 8)}`);
        return;
      }
      console.error(`[Execution] Prompt error for task ${taskId}:`, err);
      const msg = err.message || 'Unknown error';
      const isAuth = msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('401');
      const headline = isAuth
        ? 'Invalid API key — update it in Settings → AI Providers'
        : 'Failed to send prompt to agent';
      addLogEntry(taskId, 'error', headline, msg);
      broadcastProgress(taskId, 'error', headline);
      await updateTaskStatus(taskId, 'cancelled', null);
      await persistLogs(taskId);
      await cleanupExecution(taskId);
    });

    console.log(`[Execution] Started for task ${taskId} in ${repoPath}`);
    return { success: true };
  } catch (error) {
    clearStartupExecution();
    if (startupState.cancelRequested || startupAbortController.signal.aborted || isExecutionAbortError(error)) {
      console.log(`[Execution] Startup cancelled for task ${taskId.slice(0, 8)}`);
      return { success: true };
    }
    const normalizedError = normalizeExecutionStartupError(error);
    console.error(`[Execution] Failed to execute task ${taskId}:`, error);
    broadcastProgress(taskId, 'error', normalizedError);
    return { success: false, error: normalizedError };
  }
}

export async function cancelTask(taskId: string): Promise<{ success: boolean; error?: string }> {
  const execution = activeExecutions.get(taskId);

  if (!execution) {
    const startupExecution = startingExecutions.get(taskId);

    if (!startupExecution) {
      return { success: false, error: 'Task is not running' };
    }

    if (startupExecution.cancelRequested) {
      return { success: true };
    }

    startupExecution.cancelRequested = true;
    startupExecution.abortController.abort();

    const now = new Date();
    const elapsedMs = now.getTime() - startupExecution.startedAt.getTime();

    broadcastProgress(taskId, 'cancelled', 'Execution cancelled', {
      elapsedMs,
      estimatedProgress: 0,
    });

    await updateTaskStatus(taskId, 'cancelled', null, {
      executionStartedAt: startupExecution.startedAt,
      executionPausedAt: now,
      executionElapsedMs: elapsedMs,
      executionProgress: 0,
    });

    return { success: true };
  }

  execution.cancelled = true;
  execution.promptAbortController?.abort();
  execution.promptAbortController = null;

  const now = new Date();
  const elapsedMs = now.getTime() - execution.startedAt.getTime();
  const estimatedProgress = estimateProgress(execution);

  addLogEntry(taskId, 'info', 'Execution cancelled by user');
  broadcastProgress(taskId, 'cancelled', 'Execution cancelled', {
    elapsedMs,
    estimatedProgress,
  });

  await updateTaskStatus(taskId, 'cancelled', null, {
    executionPausedAt: now,
    executionElapsedMs: elapsedMs,
    executionProgress: estimatedProgress,
  });

  try {
    await execution.client.session.abort({ path: { id: execution.sessionId } });
  } catch (error) {
    console.error(`[Execution] Abort call failed for task ${taskId}:`, error);
  }

  await persistLogs(taskId);
  await cleanupExecution(taskId);
  return { success: true };
}
