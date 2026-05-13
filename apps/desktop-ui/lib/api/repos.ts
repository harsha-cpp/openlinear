import { apiFetch, AuthExpiredError } from './fetch';
import type { GitHubRepo, PublicRepository, Repository } from './types';

export async function fetchUserRepositories(): Promise<Repository[]> {
  return apiFetch<Repository[]>('/api/repos');
}

export async function fetchGitHubRepos(): Promise<GitHubRepo[]> {
  return apiFetch<GitHubRepo[]>('/api/repos/github');
}

export async function importRepo(repo: GitHubRepo): Promise<Repository> {
  return apiFetch<Repository>('/api/repos/import', {
    method: 'POST',
    body: JSON.stringify({ repo }),
  });
}

export async function activateRepository(projectId: string): Promise<Repository> {
  return apiFetch<Repository>(`/api/repos/${projectId}/activate`, { method: 'POST' });
}

export async function getActiveRepository(): Promise<Repository | null> {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    return await apiFetch<Repository>('/api/repos/active');
  } catch (err) {
    if (err instanceof AuthExpiredError) return null;
    return null;
  }
}

export async function setActiveRepositoryBaseBranch(baseBranch: string): Promise<Repository> {
  return apiFetch<Repository>('/api/repos/active/base-branch', {
    method: 'PATCH',
    body: JSON.stringify({ baseBranch }),
  });
}

export async function addRepoByUrl(url: string): Promise<PublicRepository> {
  return apiFetch<PublicRepository>('/api/repos/url', {
    method: 'POST',
    body: JSON.stringify({ url }),
    allowUnauthenticated: true,
  });
}

export async function getActivePublicRepository(): Promise<PublicRepository | null> {
  try {
    return await apiFetch<PublicRepository>('/api/repos/active/public', {
      allowUnauthenticated: true,
    });
  } catch {
    return null;
  }
}

export async function activatePublicRepository(projectId: string): Promise<PublicRepository> {
  return apiFetch<PublicRepository>(`/api/repos/${projectId}/activate/public`, {
    method: 'POST',
    allowUnauthenticated: true,
  });
}
