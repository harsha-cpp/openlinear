import { API_URL, getAuthHeader, toApiConnectionError, waitForApiReady } from './client';
import type { GitHubRepo, PublicRepository, Repository } from './types';

async function getDesktopGitHubToken(): Promise<string | null> {
  if (typeof window === 'undefined' || !("__TAURI_INTERNALS__" in window)) {
    return null;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const token = await invoke<string>('retrieve_secret', { key: 'github_token' });
    return token || null;
  } catch {
    return null;
  }
}

export async function fetchUserRepositories(): Promise<Repository[]> {
  try {
    await waitForApiReady();
    const res = await fetch(`${API_URL}/api/repos`, {
      headers: getAuthHeader(),
    });

    if (!res.ok) throw new Error('Failed to fetch projects');
    return res.json();
  } catch (error) {
    throw toApiConnectionError(error);
  }
}

export async function fetchGitHubRepos(): Promise<GitHubRepo[]> {
  try {
    await waitForApiReady();
    const githubToken = await getDesktopGitHubToken();
    const res = await fetch(`${API_URL}/api/repos/github`, {
      headers: {
        ...getAuthHeader(),
        ...(githubToken ? { 'x-github-token': githubToken } : {}),
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to fetch GitHub repos');
    }

    return res.json();
  } catch (error) {
    throw toApiConnectionError(error);
  }
}

export async function importRepo(repo: GitHubRepo): Promise<Repository> {
  try {
    await waitForApiReady();
    const res = await fetch(`${API_URL}/api/repos/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ repo }),
    });

    if (!res.ok) throw new Error('Failed to import repository');
    return res.json();
  } catch (error) {
    throw toApiConnectionError(error);
  }
}

export async function activateRepository(projectId: string): Promise<Repository> {
  try {
    await waitForApiReady();
    const res = await fetch(`${API_URL}/api/repos/${projectId}/activate`, {
      method: 'POST',
      headers: getAuthHeader(),
    });

    if (!res.ok) throw new Error('Failed to activate project');
    return res.json();
  } catch (error) {
    throw toApiConnectionError(error);
  }
}

export async function getActiveRepository(): Promise<Repository | null> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token) return null;

  try {
    await waitForApiReady();
    const res = await fetch(`${API_URL}/api/repos/active`, {
      headers: getAuthHeader(),
    });

    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    throw toApiConnectionError(error);
  }
}

export async function setActiveRepositoryBaseBranch(baseBranch: string): Promise<Repository> {
  try {
    await waitForApiReady();
    const res = await fetch(`${API_URL}/api/repos/active/base-branch`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ baseBranch }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update base branch');
    }

    return res.json();
  } catch (error) {
    throw toApiConnectionError(error);
  }
}

// Public repo functions (no auth required)

export async function addRepoByUrl(url: string): Promise<PublicRepository> {
  const res = await fetch(`${API_URL}/api/repos/url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to add repository' }));
    throw new Error(error.error || 'Failed to add repository');
  }
  return res.json();
}

export async function getActivePublicRepository(): Promise<PublicRepository | null> {
  const res = await fetch(`${API_URL}/api/repos/active/public`);
  if (!res.ok) return null;
  return res.json();
}

export async function activatePublicRepository(projectId: string): Promise<PublicRepository> {
  const res = await fetch(`${API_URL}/api/repos/${projectId}/activate/public`, {
    method: 'POST',
  });

  if (!res.ok) throw new Error('Failed to activate project');
  return res.json();
}
