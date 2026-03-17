import { useState, useEffect, useCallback, useRef } from "react";
import { DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { SSEEventType, SSEEventData } from "@/hooks/use-sse";
import { useSSESubscription } from "@/providers/sse-provider";
import { useAuth } from "@/hooks/use-auth";
import { Project } from "@/lib/api";
import type { Repository } from "@/lib/api";
import { Task, ExecutionProgress, ExecutionLogEntry, PendingPermission } from "@/types/task";
import {
  API_URL,
  getAuthHeader,
  toApiConnectionError,
} from "@/lib/api/client";
import { getSetupStatus } from "@/lib/api/opencode";
import {
  metadataQueue,
  TaskSyncState,
  listenToTaskMetadata,
} from "@/lib/api/metadata-queue";

export const COLUMNS = [
  { id: "todo", title: "All Issues", status: "todo" as const },
  { id: "in_progress", title: "In Progress", status: "in_progress" as const },
  { id: "done", title: "Done", status: "done" as const },
  { id: "cancelled", title: "Cancelled", status: "cancelled" as const },
];

export interface ActiveBatch {
  id: string;
  status: string;
  mode: string;
  tasks: Array<{
    taskId: string;
    title: string;
    status:
      | "queued"
      | "running"
      | "completed"
      | "failed"
      | "skipped"
      | "cancelled";
  }>;
  prUrl: string | null;
}

export const API_BASE_URL = API_URL;
const SIDECAR_URL = process.env.NEXT_PUBLIC_SIDECAR_URL || "http://localhost:3001";
const EXECUTION_POLL_INTERVAL_MS = 2500;

function normalizeExecutionMessage(message: string): string {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();

  if (!normalized) {
    return "OpenCode could not start the task.";
  }

  if (lower.includes("no active project selected")) {
    return "Select a project or connect a repository before running tasks.";
  }

  if (lower.includes("task is already running")) {
    return "This task is already running.";
  }

  if (
    lower.includes("opencode server is not running") ||
    lower.includes("call initopencode() first")
  ) {
    return "The local OpenCode service is not running. Restart the app and try again.";
  }

  if (lower.includes("the string did not match the expected pattern")) {
    return "OpenCode rejected the session request.";
  }

  if (
    lower.includes("failed to start opencode session") ||
    lower.includes("failed to create opencode session")
  ) {
    return "OpenCode could not start a session.";
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("failed to connect to the local opencode service")
  ) {
    return "Could not reach the local OpenCode service.";
  }

  if (
    lower.includes("cannot post /api/tasks/") &&
    lower.includes("/execute")
  ) {
    return "The local execution service is not available on the configured port.";
  }

  return normalized;
}

async function readResponseErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = await response.text().catch(() => "");
  const message = body.trim();

  if (!message) {
    return fallback;
  }

  try {
    const payload = JSON.parse(message) as {
      error?: unknown;
      message?: unknown;
    };

    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }

    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }
  } catch {}

  const htmlRouteError = message.match(/<pre>([^<]+)<\/pre>/i)?.[1]?.trim();
  if (htmlRouteError) {
    return htmlRouteError;
  }

  return message;
}

function getLogEntryKey(entry: ExecutionLogEntry): string {
  return [
    entry.timestamp,
    entry.type,
    entry.message,
    entry.details ?? "",
  ].join("|");
}

function mergeLogEntries(
  existing: ExecutionLogEntry[],
  incoming: ExecutionLogEntry[],
): ExecutionLogEntry[] {
  if (incoming.length === 0) return existing;

  const merged = [...existing];
  const seen = new Set(existing.map(getLogEntryKey));

  for (const entry of incoming) {
    const key = getLogEntryKey(entry);
    if (!seen.has(key)) {
      merged.push(entry);
      seen.add(key);
    }
  }

  return merged.sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

export interface KanbanBoardConfigState {
  tasks: Task[];
  selectedTaskIds: Set<string>;
  activeBatch: ActiveBatch | null;
  selectedProject: Project | undefined;
  activeRepository: Repository | null;
}

export interface KanbanBoardProps {
  projectId?: string | null;
  teamId?: string | null;
  projects?: Project[];
  onConfigState?: (state: KanbanBoardConfigState) => void;
}

export interface UseKanbanBoardReturn {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  syncStates: Record<string, TaskSyncState>;
  executionProgress: Record<string, ExecutionProgress>;
  isTaskFormOpen: boolean;
  setIsTaskFormOpen: (open: boolean) => void;
  defaultStatus: Task["status"];
  selectedTaskId: string | null;
  taskLogs: Record<string, ExecutionLogEntry[]>;
  selectedTaskIds: Set<string>;
  selectingColumns: Set<string>;
  activeBatch: ActiveBatch | null;
  setActiveBatch: (batch: ActiveBatch | null) => void;
  completedBatch: {
    taskIds: string[];
    prUrl: string | null;
    mode: string;
  } | null;
  canExecute: boolean;
  activeRepository: Repository | null;
  selectedProject: Project | undefined;
  batchTaskIds: string[];
  completedBatchTaskIds: string[];
  selectedTask: Task | null;
  getTasksByStatus: (status: Task["status"]) => Task[];
  handleAddTask: (status: Task["status"]) => void;
  handleDragEnd: (result: DropResult) => void;
  handleExecute: (taskId: string) => Promise<void>;
  handleCancel: (taskId: string) => Promise<void>;
  handleTaskClick: (taskId: string) => Promise<void>;
  handleDrawerClose: () => void;
  handleDelete: (taskId: string) => Promise<void>;
  handleUpdateTask: (
    taskId: string,
    data: { title?: string; description?: string | null },
  ) => Promise<void>;
  handleMoveToInProgress: (taskId: string) => Promise<void>;
  handleBatchMoveToInProgress: () => Promise<void>;
  handleBatchExecute: (mode: "parallel" | "queue") => Promise<void>;
  handleCancelBatch: (batchId: string) => Promise<void>;
  pendingPermissions: Record<string, PendingPermission[]>;
  handlePermissionRespond: (taskId: string, permissionId: string, response: 'once' | 'always' | 'reject') => Promise<void>;
  toggleTaskSelect: (taskId: string) => void;
  toggleColumnSelection: (columnId: string) => void;
  toggleColumnSelectAll: (status: Task["status"]) => void;
  clearSelection: () => void;
  fetchTasks: (options?: {
    showLoading?: boolean;
    allowRetry?: boolean;
    clearError?: boolean;
    resetRetry?: boolean;
    silent?: boolean;
  }) => Promise<void>;
  showProviderSetup: boolean;
  setShowProviderSetup: (show: boolean) => void;
  handleProviderSetupComplete: () => void;
}

export function useKanbanBoard({
  projectId,
  teamId,
  projects = [],
}: KanbanBoardProps): UseKanbanBoardReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStates, setSyncStates] = useState<Record<string, TaskSyncState>>(
    {},
  );
  const [executionProgress, setExecutionProgress] = useState<
    Record<string, ExecutionProgress>
  >({});
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<Task["status"]>("todo");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskLogs, setTaskLogs] = useState<Record<string, ExecutionLogEntry[]>>(
    {},
  );
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectingColumns, setSelectingColumns] = useState<Set<string>>(
    new Set(),
  );
  const [activeBatch, setActiveBatch] = useState<ActiveBatch | null>(null);
  const [completedBatch, setCompletedBatch] = useState<{
    taskIds: string[];
    prUrl: string | null;
    mode: string;
  } | null>(null);
  const [showProviderSetup, setShowProviderSetup] = useState(false);
  const [pendingExecuteTaskId, setPendingExecuteTaskId] = useState<string | null>(null);
  const [pendingPermissions, setPendingPermissions] = useState<Record<string, PendingPermission[]>>({});
  const { isAuthenticated, activeRepository, refreshActiveRepository } =
    useAuth();
  const metadataUnsubscribersRef = useRef<Map<string, () => void>>(new Map());
  const taskLogsRef = useRef(taskLogs);
  const executionProgressRef = useRef(executionProgress);

  const batchTaskIds = activeBatch?.tasks.map((t) => t.taskId) ?? [];
  const completedBatchTaskIds = completedBatch?.taskIds ?? [];

  const clearColumnSelection = useCallback(
    (status: Task["status"]) => {
      setSelectedTaskIds((prev) => {
        const next = new Set(prev);
        tasks
          .filter((task) => task.status === status)
          .forEach((task) => {
            next.delete(task.id);
          });
        return next;
      });
    },
    [tasks],
  );

  const toggleColumnSelection = useCallback(
    (columnId: string) => {
      setSelectingColumns((prev) => {
        const next = new Set(prev);
        if (next.has(columnId)) {
          next.delete(columnId);
          const columnStatus = COLUMNS.find((c) => c.id === columnId)?.status;
          if (columnStatus) {
            clearColumnSelection(columnStatus);
          }
        } else {
          next.add(columnId);
        }
        return next;
      });
    },
    [clearColumnSelection],
  );

  const toggleTaskSelect = (taskId: string) => {
    if (batchTaskIds.includes(taskId)) return;
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleColumnSelectAll = useCallback(
    (status: Task["status"]) => {
      const columnTasks = tasks.filter((task) => task.status === status);
      const columnTaskIds = columnTasks.map((task) => task.id);
      const allSelected = columnTaskIds.every((id) => selectedTaskIds.has(id));

      setSelectedTaskIds((prev) => {
        const next = new Set(prev);
        if (allSelected) {
          columnTaskIds.forEach((id) => {
            next.delete(id);
          });
        } else {
          columnTaskIds.forEach((id) => {
            if (!batchTaskIds.includes(id)) {
              next.add(id);
            }
          });
        }
        return next;
      });
    },
    [tasks, selectedTaskIds, batchTaskIds],
  );

  const clearSelection = () => {
    setSelectedTaskIds(new Set());
    setSelectingColumns(new Set());
  };

  useEffect(() => {
    const unsubscribe = metadataQueue.subscribe(setSyncStates);
    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => {
      metadataUnsubscribersRef.current.forEach((unsubscribe) => {
        unsubscribe();
      });
      metadataUnsubscribersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    taskLogsRef.current = taskLogs;
  }, [taskLogs]);

  useEffect(() => {
    executionProgressRef.current = executionProgress;
  }, [executionProgress]);

  useEffect(() => {
    setSelectingColumns((prev) => {
      const next = new Set(prev);
      let changed = false;
      if (batchTaskIds.length > 0 && next.has("in_progress")) {
        next.delete("in_progress");
        clearColumnSelection("in_progress");
        changed = true;
      }
      if (completedBatchTaskIds.length > 0 && next.has("done")) {
        next.delete("done");
        clearColumnSelection("done");
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [batchTaskIds.length, completedBatchTaskIds.length, clearColumnSelection]);

  const handleBatchExecute = async (mode: "parallel" | "queue") => {
    try {
      const token = localStorage.getItem("token");
      const nonDoneTaskIds = Array.from(selectedTaskIds).filter(
        (id) => tasks.find((t) => t.id === id)?.status !== "done",
      );
      if (nonDoneTaskIds.length === 0) return;
      const response = await fetch(`${SIDECAR_URL}/api/batches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          taskIds: nonDoneTaskIds,
          mode,
        }),
      });
      if (!response.ok) throw new Error("Failed to create batch");
      clearSelection();
    } catch (err) {
      console.error("Error creating batch:", err);
    }
  };

  const handleCancelBatch = async (batchId: string) => {
    try {
      const token = localStorage.getItem("token");
      await fetch(`${SIDECAR_URL}/api/batches/${batchId}/cancel`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (err) {
      console.error("Error cancelling batch:", err);
    }
  };

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (isAuthenticated) {
        refreshActiveRepository();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [isAuthenticated, refreshActiveRepository]);

  const selectedProject = projects.find((p) => p.id === projectId);
  const canExecute = !!(
    selectedProject?.repositoryId ||
    selectedProject?.repoUrl ||
    selectedProject?.localPath ||
    activeRepository
  );

  const handleAddTask = (status: Task["status"]) => {
    setDefaultStatus(status);
    setIsTaskFormOpen(true);
  };

  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryAttemptRef = useRef(0);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTasks = useCallback(
    async (options?: {
      showLoading?: boolean;
      allowRetry?: boolean;
      clearError?: boolean;
      resetRetry?: boolean;
      silent?: boolean;
    }) => {
      const {
        showLoading = false,
        allowRetry = false,
        clearError = false,
        resetRetry = false,
        silent = false,
      } = options || {};

      if (clearError) {
        setError(null);
      }

      if (resetRetry) {
        retryAttemptRef.current = 0;
      }

      if (showLoading) {
        setLoading(true);
      }

      let shouldStopLoading = showLoading;

      try {
        const params = new URLSearchParams();
        if (projectId) params.set("projectId", projectId);
        if (teamId) params.set("teamId", teamId);
        const qs = params.toString();
        const url = qs
          ? `${API_BASE_URL}/api/tasks?${qs}`
          : `${API_BASE_URL}/api/tasks`;
        const response = await fetch(url, { headers: getAuthHeader() });
        if (!response.ok) {
          throw new Error(`Failed to fetch tasks: ${response.statusText}`);
        }
        const data = await response.json();
        setTasks(data);
        setError(null);
        retryAttemptRef.current = 0;

        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
      } catch (err) {
        if (allowRetry && retryAttemptRef.current < 5) {
          retryAttemptRef.current += 1;
          if (showLoading) {
            shouldStopLoading = false;
          }
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }
          retryTimeoutRef.current = setTimeout(() => {
            fetchTasks({ showLoading, allowRetry, silent: true });
          }, 1500);
          return;
        }

        if (!silent) {
          setError(
            err instanceof Error ? err.message : "Failed to fetch tasks",
          );
        }
      } finally {
        if (shouldStopLoading) {
          setLoading(false);
        }
      }
    },
    [projectId, teamId],
  );

  const handleSSEEvent = useCallback(
    (eventType: SSEEventType, data: SSEEventData) => {
      switch (eventType) {
        case "task:created":
          if (data.id && data.title && data.status) {
            const taskProjectId = (data as unknown as { projectId?: string })
              .projectId;
            const taskTeamId = (data as unknown as { teamId?: string }).teamId;
            if (projectId && taskProjectId !== projectId) {
              break;
            }
            if (teamId && taskTeamId !== teamId) {
              break;
            }
            const newTask: Task = {
              id: data.id,
              title: data.title,
              description: data.description ?? null,
              priority: data.priority ?? "medium",
              status: data.status,
              sessionId: data.sessionId ?? null,
              createdAt: data.createdAt ?? new Date().toISOString(),
              updatedAt: data.updatedAt ?? new Date().toISOString(),
              labels: data.labels ?? [],
              executionStartedAt: data.executionStartedAt ?? null,
              executionPausedAt: data.executionPausedAt ?? null,
              executionElapsedMs: data.executionElapsedMs ?? 0,
              executionProgress: data.executionProgress ?? null,
              prUrl: data.prUrl ?? null,
              outcome: data.outcome ?? null,
              batchId: data.batchId ?? null,
              inboxRead: data.inboxRead ?? false,
              identifier: data.identifier ?? null,
              number: data.number ?? null,
              dueDate: data.dueDate ?? null,
            };
            setTasks((prev) => [...prev, newTask]);
          }
          break;

        case "task:updated":
          if (data.id) {
            setTasks((prev) =>
              prev.map((task) =>
                task.id === data.id
                  ? {
                      ...task,
                      ...(data.title && { title: data.title }),
                      ...(data.description !== undefined && {
                        description: data.description,
                      }),
                      ...(data.priority && { priority: data.priority }),
                      ...(data.status && { status: data.status }),
                      ...(data.sessionId !== undefined && {
                        sessionId: data.sessionId,
                      }),
                      ...(data.updatedAt && { updatedAt: data.updatedAt }),
                      ...(data.labels && { labels: data.labels }),
                      ...(data.executionStartedAt !== undefined && {
                        executionStartedAt: data.executionStartedAt,
                      }),
                      ...(data.executionPausedAt !== undefined && {
                        executionPausedAt: data.executionPausedAt,
                      }),
                      ...(data.executionElapsedMs !== undefined && {
                        executionElapsedMs: data.executionElapsedMs,
                      }),
                      ...(data.executionProgress !== undefined && {
                        executionProgress: data.executionProgress,
                      }),
                      ...(data.prUrl !== undefined && { prUrl: data.prUrl }),
                      ...(data.outcome !== undefined && {
                        outcome: data.outcome,
                      }),
                      ...(data.batchId !== undefined && {
                        batchId: data.batchId,
                      }),
                      ...(data.dueDate !== undefined && {
                        dueDate: data.dueDate,
                      }),
                    }
                  : task,
              ),
            );
          }
          break;

        case "task:deleted":
          if (data.id) {
            setTasks((prev) => prev.filter((task) => task.id !== data.id));
          }
          break;

        case "execution:progress": {
          const progressData = data as unknown as ExecutionProgress;
          if (progressData.taskId) {
            setExecutionProgress((prev) => ({
              ...prev,
              [progressData.taskId]: progressData,
            }));
          }
          break;
        }

        case "execution:log": {
          const logData = data as unknown as {
            taskId: string;
            entry: ExecutionLogEntry;
          };
          if (logData.taskId && logData.entry) {
            setTaskLogs((prev) => ({
              ...prev,
              [logData.taskId]: mergeLogEntries(
                prev[logData.taskId] || [],
                [logData.entry],
              ),
            }));
          }
          break;
        }

        case "permission:requested": {
          const taskId = data.taskId || data.id;
          const permission = data.permission;
          if (taskId && permission) {
            setPendingPermissions((prev) => ({
              ...prev,
              [taskId]: [...(prev[taskId] || []), permission as PendingPermission],
            }));
            const perm = permission as PendingPermission;
            toast.warning("Permission Required", {
              description: perm.title || "A task needs your approval to continue",
              duration: 10000,
            });
          }
          break;
        }

        case "permission:resolved": {
          const taskId = data.taskId || data.id;
          const permissionId = data.permissionId;
          if (taskId && permissionId) {
            setPendingPermissions((prev) => ({
              ...prev,
              [taskId]: (prev[taskId] || []).filter((p) => p.id !== permissionId),
            }));
            toast.success("Permission resolved", { duration: 3000 });
          }
          break;
        }

        case "connected":
          console.log("[SSE] Connected with clientId:", data.clientId);
          fetchTasks({ silent: true });
          if (isAuthenticated) {
            refreshActiveRepository();
          }
          break;

        case "batch:created":
        case "batch:started":
          if (data.batchId) {
            setActiveBatch({
              id: data.batchId as string,
              status: (data.status as string) || "running",
              mode: (data.mode as string) || "parallel",
              tasks: (data.tasks as ActiveBatch["tasks"]) || [],
              prUrl: null,
            });
          }
          break;

        case "batch:task:started":
          setActiveBatch((prev) => {
            if (!prev || prev.id !== data.batchId) return prev;
            return {
              ...prev,
              tasks: prev.tasks.map((t) =>
                t.taskId === data.taskId ? { ...t, status: "running" } : t,
              ),
            };
          });
          break;

        case "batch:task:completed":
          setActiveBatch((prev) => {
            if (!prev || prev.id !== data.batchId) return prev;
            return {
              ...prev,
              tasks: prev.tasks.map((t) =>
                t.taskId === data.taskId ? { ...t, status: "completed" } : t,
              ),
            };
          });
          break;

        case "batch:task:failed":
          setActiveBatch((prev) => {
            if (!prev || prev.id !== data.batchId) return prev;
            return {
              ...prev,
              tasks: prev.tasks.map((t) =>
                t.taskId === data.taskId ? { ...t, status: "failed" } : t,
              ),
            };
          });
          break;

        case "batch:task:skipped":
          setActiveBatch((prev) => {
            if (!prev || prev.id !== data.batchId) return prev;
            return {
              ...prev,
              tasks: prev.tasks.map((t) =>
                t.taskId === data.taskId ? { ...t, status: "skipped" } : t,
              ),
            };
          });
          break;

        case "batch:task:cancelled":
          setActiveBatch((prev) => {
            if (!prev || prev.id !== data.batchId) return prev;
            return {
              ...prev,
              tasks: prev.tasks.map((t) =>
                t.taskId === data.taskId ? { ...t, status: "cancelled" } : t,
              ),
            };
          });
          break;

        case "batch:merging":
          setActiveBatch((prev) => {
            if (prev?.id === data.batchId) {
              return { ...prev, status: "merging" } as ActiveBatch;
            }
            return prev;
          });
          break;

        case "batch:completed":
          if (data.batchId && data.prUrl) {
            setTasks((prev) =>
              prev.map((task) =>
                task.batchId === data.batchId
                  ? { ...task, prUrl: data.prUrl as string }
                  : task,
              ),
            );
          }
          setActiveBatch((prev) => {
            if (prev && prev.id === data.batchId) {
              const prUrl = (data.prUrl as string) || prev.prUrl || null;
              const taskIds = prev.tasks.map((t) => t.taskId);
              setCompletedBatch({ taskIds, prUrl, mode: prev.mode });
              return { ...prev, status: "completed", prUrl } as ActiveBatch;
            }
            return prev;
          });
          break;
        case "batch:failed":
        case "batch:cancelled":
          setActiveBatch((prev) => {
            if (prev && prev.id === data.batchId) {
              setTimeout(() => setActiveBatch(null), 5000);
              return {
                ...prev,
                status: eventType.split(":")[1]!,
              } as ActiveBatch;
            }
            return prev;
          });
          break;

        default:
          break;
      }
    },
    [fetchTasks, isAuthenticated, refreshActiveRepository, projectId, teamId],
  );

  useSSESubscription(handleSSEEvent);

  useEffect(() => {
    fetchTasks({
      showLoading: true,
      allowRetry: true,
      clearError: true,
      resetRetry: true,
    });

    // Safety timeout: force loading to false after 10s no matter what
    safetyTimeoutRef.current = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn(
            "[KanbanBoard] Safety timeout triggered - forcing loading to false",
          );
          return false;
        }
        return prev;
      });
    }, 3000);

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    };
  }, [fetchTasks]);

  const updateTaskStatus = async (
    taskId: string,
    newStatus: Task["status"],
  ) => {
    try {
      const token = localStorage.getItem("token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) {
        throw new Error(`Failed to update task: ${response.statusText}`);
      }
    } catch (err) {
      console.error("Error updating task:", err);
      fetchTasks({ silent: true });
    }
  };

  const handleMoveToInProgress = async (taskId: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, status: "in_progress" as const } : task,
      ),
    );
    await updateTaskStatus(taskId, "in_progress");
  };

  const handleBatchMoveToInProgress = async () => {
    const todoIds = Array.from(selectedTaskIds).filter(
      (id) => tasks.find((t) => t.id === id)?.status === "todo",
    );
    if (todoIds.length === 0) return;
    for (const id of todoIds) {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === id ? { ...task, status: "in_progress" as const } : task,
        ),
      );
    }
    clearSelection();
    await Promise.all(todoIds.map((id) => updateTaskStatus(id, "in_progress")));
  };

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    )
      return;

    const newStatus = destination.droppableId as Task["status"];

    if (draggableId.startsWith("batch-group-")) {
      const batchId = draggableId.replace("batch-group-", "");
      const batchTaskIds = tasks
        .filter((task) => task.batchId === batchId)
        .map((task) => task.id);

      if (batchTaskIds.length === 0) return;

      setTasks((prev) =>
        prev.map((task) =>
          batchTaskIds.includes(task.id)
            ? { ...task, status: newStatus }
            : task,
        ),
      );

      await Promise.all(
        batchTaskIds.map((id) => updateTaskStatus(id, newStatus)),
      );
      return;
    }

    setTasks((prev) =>
      prev.map((task) =>
        task.id === draggableId ? { ...task, status: newStatus } : task,
      ),
    );

    await updateTaskStatus(draggableId, newStatus);
  };

  const appendTaskLog = useCallback(
    (taskId: string, entry: ExecutionLogEntry) => {
      setTaskLogs((prev) => ({
        ...prev,
        [taskId]: mergeLogEntries(prev[taskId] || [], [entry]),
      }));
    },
    [],
  );

  const fetchTaskLogs = useCallback(
    async (taskId: string, force = false) => {
      if (!force && taskLogsRef.current[taskId] !== undefined) {
        return;
      }

      try {
        const response = await fetch(`${SIDECAR_URL}/api/tasks/${taskId}/logs`, {
          headers: getAuthHeader(),
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const incomingLogs = Array.isArray(data.logs) ? data.logs : [];

        setTaskLogs((prev) => {
          const currentLogs = prev[taskId] || [];
          const nextLogs = mergeLogEntries(currentLogs, incomingLogs);

          if (
            currentLogs.length === nextLogs.length &&
            currentLogs.every(
              (entry, index) =>
                getLogEntryKey(entry) === getLogEntryKey(nextLogs[index]!),
            )
          ) {
            return prev;
          }

          return { ...prev, [taskId]: nextLogs };
        });
      } catch (err) {
        console.error("Error fetching task logs:", err);
      }
    },
    [],
  );

  const handleExecute = async (taskId: string) => {
    if (!canExecute) {
      console.error("No active project - connect a repo first");
      return;
    }

    try {
      const status = await getSetupStatus().catch(() => null);
      if (status && !status.ready) {
        setPendingExecuteTaskId(taskId);
        setShowProviderSetup(true);
        return;
      }

      const startedAt = new Date().toISOString();
      setSelectedTaskId(taskId);
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status:
                  task.status === "todo" ? ("in_progress" as const) : task.status,
                executionStartedAt: task.executionStartedAt ?? startedAt,
                executionPausedAt: null,
              }
            : task,
        ),
      );
      setExecutionProgress((prev) => ({
        ...prev,
        [taskId]:
          prev[taskId] &&
          ["cloning", "executing", "committing", "creating_pr"].includes(
            prev[taskId].status,
          )
            ? prev[taskId]
            : {
                taskId,
                status: "executing",
                message: "Starting task...",
              },
      }));
      void fetchTaskLogs(taskId, true);

      const response = await fetch(
        `${SIDECAR_URL}/api/tasks/${taskId}/execute`,
        {
          method: "POST",
          headers: getAuthHeader(),
        },
      );
      if (!response.ok) {
        const message = await readResponseErrorMessage(
          response,
          `Failed to execute task: ${response.statusText}`,
        );
        throw new Error(message);
      }
    } catch (err) {
      const error = toApiConnectionError(err, "Failed to execute task");
      const message = normalizeExecutionMessage(error.message);
      setExecutionProgress((prev) => ({
        ...prev,
        [taskId]: {
          taskId,
          status: "error",
          message,
        },
      }));
      appendTaskLog(taskId, {
        timestamp: new Date().toISOString(),
        type: "error",
        message,
      });
      toast.error(message);
      console.error("Error executing task:", error);
      void fetchTasks({ silent: true });
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${SIDECAR_URL}/api/tasks/${taskId}/cancel`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!response.ok) {
        throw new Error(`Failed to cancel task: ${response.statusText}`);
      }

      const cancelledAt = new Date().toISOString();
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: "cancelled",
                sessionId: null,
                executionPausedAt: cancelledAt,
              }
            : task,
        ),
      );
      setExecutionProgress((prev) => ({
        ...prev,
        [taskId]: {
          taskId,
          status: "cancelled",
          message: "Execution cancelled",
        },
      }));
      appendTaskLog(taskId, {
        timestamp: cancelledAt,
        type: "info",
        message: "Execution cancelled by user",
      });
      void fetchTasks({ silent: true });
    } catch (err) {
      console.error("Error cancelling task:", err);
      toast.error("Failed to cancel task");
      throw err;
    }
  };

  const handleTaskClick = async (taskId: string) => {
    setSelectedTaskId(taskId);
    const task = tasks.find((item) => item.id === taskId);
    void fetchTaskLogs(
      taskId,
      task?.status === "in_progress" || (taskLogsRef.current[taskId] || []).length === 0,
    );
  };

  useEffect(() => {
    if (!selectedTaskId) return;

    const selectedTask = tasks.find((task) => task.id === selectedTaskId);
    if (!selectedTask || selectedTask.status !== "in_progress") return;

    if (!executionProgressRef.current[selectedTaskId]) {
      setExecutionProgress((prev) => ({
        ...prev,
        [selectedTaskId]: {
          taskId: selectedTaskId,
          status: "executing",
          message: "Task is running...",
        },
      }));
    }

    void fetchTaskLogs(selectedTaskId, true);

    const intervalId = window.setInterval(() => {
      void fetchTaskLogs(selectedTaskId, true);
      void fetchTasks({ silent: true });
    }, EXECUTION_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [selectedTaskId, tasks, fetchTaskLogs, fetchTasks]);

  const handleDrawerClose = () => {
    setSelectedTaskId(null);
  };

  const handleDelete = async (taskId: string) => {
    const previousTasks = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedTaskId(null);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        setTasks(previousTasks);
      }
    } catch {
      setTasks(previousTasks);
    }
  };

  const handleUpdateTask = async (
    taskId: string,
    data: { title?: string; description?: string | null },
  ) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`Failed to update task: ${response.statusText}`);
      }
    } catch (err) {
      console.error("Error updating task:", err);
    }
  };

  const selectedTask = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId) || null
    : null;

  const getTasksByStatus = (status: Task["status"]) => {
    return tasks.filter((task) => task.status === status);
  };

  const handleProviderSetupComplete = useCallback(async () => {
    setShowProviderSetup(false);
    if (pendingExecuteTaskId) {
      const taskId = pendingExecuteTaskId;
      setPendingExecuteTaskId(null);
      try {
        await handleExecute(taskId);
      } catch (err) {
        console.error("Error executing task after provider setup:", err);
      }
    }
  }, [handleExecute, pendingExecuteTaskId]);

  const handlePermissionRespond = useCallback(async (
    taskId: string,
    permissionId: string,
    response: 'once' | 'always' | 'reject',
  ) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${SIDECAR_URL}/api/tasks/${taskId}/permissions/${permissionId}/respond`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ response }),
        },
      );
      if (!res.ok) {
        throw new Error(`Failed to respond to permission: ${res.statusText}`);
      }
      // Optimistically remove the permission
      setPendingPermissions((prev) => ({
        ...prev,
        [taskId]: (prev[taskId] || []).filter((p) => p.id !== permissionId),
      }));
    } catch (err) {
      console.error("Error responding to permission:", err);
    }
  }, []);

  return {
    tasks,
    loading,
    error,
    syncStates,
    executionProgress,
    isTaskFormOpen,
    setIsTaskFormOpen,
    defaultStatus,
    selectedTaskId,
    taskLogs,
    selectedTaskIds,
    selectingColumns,
    activeBatch,
    setActiveBatch,
    completedBatch,
    canExecute,
    activeRepository,
    selectedProject,
    batchTaskIds,
    completedBatchTaskIds,
    selectedTask,
    getTasksByStatus,
    handleAddTask,
    handleDragEnd,
    handleExecute,
    handleCancel,
    handleTaskClick,
    handleDrawerClose,
    handleDelete,
    handleUpdateTask,
    handleMoveToInProgress,
    handleBatchMoveToInProgress,
    handleBatchExecute,
    handleCancelBatch,
    pendingPermissions,
    handlePermissionRespond,
    toggleTaskSelect,
    toggleColumnSelection,
    toggleColumnSelectAll,
    clearSelection,
    fetchTasks,
    showProviderSetup,
    setShowProviderSetup,
    handleProviderSetupComplete,
  };
}
