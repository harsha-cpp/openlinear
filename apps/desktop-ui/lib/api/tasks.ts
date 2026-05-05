import { apiFetch } from './fetch';
import type { InboxCount, InboxTask, MyIssueTask } from './types';

export async function fetchMyIssues(
  filter: 'assigned' | 'created' | 'all' = 'assigned',
): Promise<MyIssueTask[]> {
  const qs =
    filter === 'assigned'
      ? '?assignee=me'
      : filter === 'created'
      ? '?creator=me'
      : '';
  return apiFetch<MyIssueTask[]>(`/api/tasks${qs}`);
}

export async function executeTaskPublic(taskId: string): Promise<void> {
  await apiFetch<void>(`/api/tasks/${taskId}/execute`, {
    method: 'POST',
    sidecar: true,
  });
}

export async function fetchInboxTasks(): Promise<InboxTask[]> {
  return apiFetch<InboxTask[]>('/api/inbox');
}

export async function fetchInboxCount(): Promise<InboxCount> {
  try {
    return await apiFetch<InboxCount>('/api/inbox/count');
  } catch {
    return { total: 0, unread: 0 };
  }
}

export async function markInboxRead(taskId: string): Promise<void> {
  await apiFetch<void>(`/api/inbox/read/${taskId}`, { method: 'PATCH' });
}

export async function markAllInboxRead(): Promise<void> {
  await apiFetch<void>('/api/inbox/read-all', { method: 'PATCH' });
}

export async function refreshTaskPr(
  taskId: string,
): Promise<{ prUrl: string | null; refreshed: boolean; message?: string }> {
  return apiFetch<{ prUrl: string | null; refreshed: boolean; message?: string }>(
    `/api/tasks/${taskId}/refresh-pr`,
    { method: 'POST', sidecar: true },
  );
}
