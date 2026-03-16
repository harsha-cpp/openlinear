import {
  API_URL,
  getAuthHeader,
  getApiUnavailableMessage,
  isDesktopRuntime,
  toApiConnectionError,
  waitForApiReady,
} from './client';
import type { User } from './types';

// Helper to get client header for desktop detection
function getClientHeader(): Record<string, string> {
  return isDesktopRuntime() ? { 'x-openlinear-client': 'desktop' } : {};
}

export interface GitHubDeviceStartResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

export interface GitHubDevicePollPendingResponse {
  status: 'pending';
  retryAfterSeconds?: number;
}

export interface GitHubDevicePollSuccessResponse {
  status: 'complete';
  token: string;
  githubAccessToken?: string;
  user: User;
}

export interface DesktopGitHubLoginResponse {
  token: string;
  githubAccessToken?: string;
  source: 'gh' | 'env';
  user: User;
}

export type GitHubDevicePollResponse =
  | GitHubDevicePollPendingResponse
  | GitHubDevicePollSuccessResponse;

export async function fetchCurrentUser(): Promise<User | null> {
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    await waitForApiReady();
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: getAuthHeader(),
    });

    if (!res.ok) {
      localStorage.removeItem('token');
      return null;
    }

    return res.json();
  } catch (error) {
    throw toApiConnectionError(error);
  }
}

export function getLoginUrl(): string {
  return `${API_URL}/api/auth/github${isDesktopRuntime() ? '?source=desktop' : ''}`;
}

export async function startGitHubDeviceLogin(): Promise<GitHubDeviceStartResponse> {
  try {
    await waitForApiReady();
    const res = await fetch(`${API_URL}/api/auth/github/device/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getClientHeader(),
      },
    });

    if (!res.ok) {
      let errorMessage = 'Failed to start GitHub device login';
      try {
        const errorData = await res.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }

    return res.json();
  } catch (error) {
    throw toApiConnectionError(error);
  }
}

export async function pollGitHubDeviceLogin(deviceCode: string): Promise<GitHubDevicePollResponse> {
  try {
    await waitForApiReady();
    const res = await fetch(`${API_URL}/api/auth/github/device/poll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getClientHeader(),
      },
      body: JSON.stringify({ deviceCode }),
    });

    if (res.status === 202) {
      return res.json();
    }

    if (!res.ok) {
      let errorMessage = 'GitHub device login failed';
      try {
        const errorData = await res.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }

    return res.json();
  } catch (error) {
    throw toApiConnectionError(error);
  }
}

export interface DesktopGitHubCheckResponse {
  available: boolean;
  source: 'gh' | 'env' | null;
}

export async function checkDesktopGitHubAuth(): Promise<DesktopGitHubCheckResponse> {
  try {
    await waitForApiReady();
    const res = await fetch(`${API_URL}/api/auth/github/desktop/check`, {
      headers: { ...getClientHeader() },
    });

    if (!res.ok) {
      return { available: false, source: null };
    }

    return res.json();
  } catch {
    return { available: false, source: null };
  }
}

export async function loginWithDesktopGitHubAuth(): Promise<DesktopGitHubLoginResponse> {
  try {
    await waitForApiReady();
    const res = await fetch(`${API_URL}/api/auth/github/desktop/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getClientHeader(),
      },
    });

    if (!res.ok) {
      let errorMessage = 'Desktop GitHub login failed';
      try {
        const errorData = await res.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }

    return res.json();
  } catch (error) {
    throw toApiConnectionError(error);
  }
}

export async function createLocalSession(): Promise<{ token: string; user: User }> {
  try {
    await waitForApiReady();
    const res = await fetch(`${API_URL}/api/auth/local/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getClientHeader(),
      },
    });

    if (!res.ok) {
      let errorMessage = 'Failed to create a local session';
      try {
        const errorData = await res.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }

    return res.json();
  } catch (error) {
    throw toApiConnectionError(error, getApiUnavailableMessage());
  }
}

export async function getGitHubConnectUrl(): Promise<string> {
  await waitForApiReady();
  const res = await fetch(`${API_URL}/api/auth/github/connect`, {
    headers: getAuthHeader(),
  });

  if (!res.ok) throw new Error('Failed to get GitHub connect URL');
  const data = await res.json();
  return data.url;
}

export async function confirmGitHubConnect(githubConnectToken: string): Promise<{ token: string; githubAccessToken?: string }> {
  try {
    await waitForApiReady();
    const res = await fetch(`${API_URL}/api/auth/github/connect/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
        ...getClientHeader(),
      },
      body: JSON.stringify({ github_connect_token: githubConnectToken }),
    });

    if (!res.ok) {
      let errorMessage = 'Failed to confirm GitHub connection';
      try {
        const errorData = await res.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }
    return res.json();
  } catch (error) {
    throw toApiConnectionError(error);
  }
}

export function logout(): void {
  localStorage.removeItem('token');
  window.location.href = '/';
}

export async function loginUser(username: string, password: string): Promise<{ token: string; user: { id: string; username: string } }> {
  try {
    await waitForApiReady();
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getClientHeader(),
      },
      body: JSON.stringify({ username, password }),
    });
    
    if (!res.ok) {
      let errorMessage = 'Login failed';
      try {
        const errorData = await res.json();
        errorMessage = errorData.error || errorData.message || `Login failed (${res.status})`;
      } catch {
        errorMessage = `Login failed (${res.status}): ${res.statusText}`;
      }
      throw new Error(errorMessage);
    }
    return res.json();
  } catch (err) {
    if (err instanceof Error) {
      throw toApiConnectionError(err);
    }
    throw new Error('Login failed. Please try again.');
  }
}

export async function registerUser(username: string, password: string, email?: string): Promise<{ token: string; user: { id: string; username: string } }> {
  try {
    await waitForApiReady();
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getClientHeader(),
      },
      body: JSON.stringify({ username, password, email }),
    });
    
    if (!res.ok) {
      let errorMessage = 'Registration failed';
      try {
        const errorData = await res.json();
        errorMessage = errorData.error || errorData.message || `Registration failed (${res.status})`;
      } catch {
        errorMessage = `Registration failed (${res.status}): ${res.statusText}`;
      }
      throw new Error(errorMessage);
    }
    return res.json();
  } catch (err) {
    if (err instanceof Error) {
      throw toApiConnectionError(err);
    }
    throw new Error('Registration failed. Please try again.');
  }
}
