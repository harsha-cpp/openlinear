import { API_URL, getAuthHeader, isDesktopRuntime } from './client';
import type { User } from './types';

// Helper to get client header for desktop detection
function getClientHeader(): Record<string, string> {
  return isDesktopRuntime() ? { 'x-openlinear-client': 'desktop' } : {};
}

export async function fetchCurrentUser(): Promise<User | null> {
  const token = localStorage.getItem('token');
  if (!token) return null;

  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: getAuthHeader(),
  });

  if (!res.ok) {
    localStorage.removeItem('token');
    return null;
  }

  return res.json();
}

export function getLoginUrl(): string {
  return `${API_URL}/api/auth/github${isDesktopRuntime() ? '?source=desktop' : ''}`;
}

export async function getGitHubConnectUrl(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/github/connect`, {
    headers: getAuthHeader(),
  });

  if (!res.ok) throw new Error('Failed to get GitHub connect URL');
  const data = await res.json();
  return data.url;
}

export async function confirmGitHubConnect(githubConnectToken: string): Promise<{ token: string; githubAccessToken?: string }> {
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
}

export function logout(): void {
  localStorage.removeItem('token');
  window.location.href = '/';
}

export async function loginUser(username: string, password: string): Promise<{ token: string; user: { id: string; username: string } }> {
  try {
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
      if (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed to fetch')) {
        throw new Error('Cannot connect to server. Please check your internet connection and try again.');
      }
      throw err;
    }
    throw new Error('Login failed. Please try again.');
  }
}

export async function registerUser(username: string, password: string, email?: string): Promise<{ token: string; user: { id: string; username: string } }> {
  try {
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
      if (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed to fetch')) {
        throw new Error('Cannot connect to server. Please check your internet connection and try again.');
      }
      throw err;
    }
    throw new Error('Registration failed. Please try again.');
  }
}
