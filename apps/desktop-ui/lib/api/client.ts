const LOCAL_API_URL = 'http://localhost:3001';
const DESKTOP_API_URL = process.env.NEXT_PUBLIC_DESKTOP_API_URL || LOCAL_API_URL;

export function isDesktopRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname;
  const userAgent = navigator.userAgent.toLowerCase();
  
  // Check for Tauri-specific globals
  const hasTauriGlobal = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  // Check for Tauri-specific hostnames
  const isTauriHostname = hostname === 'tauri.localhost' || hostname.endsWith('.tauri.localhost');
  // Check for Tauri in user agent (for external OAuth windows)
  const isTauriUA = userAgent.includes('tauri');
  // Check for desktop app file protocol (Tauri can run on file://)
  const isFileProtocol = window.location.protocol === 'file:';
  
  return hasTauriGlobal || isTauriHostname || isTauriUA || isFileProtocol;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getDefaultApiUrl(): string {
  if (typeof window === 'undefined') {
    return LOCAL_API_URL;
  }

  const hostname = window.location.hostname;

  if (isDesktopRuntime()) {
    return DESKTOP_API_URL;
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return LOCAL_API_URL;
  }

  return window.location.origin;
}

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || getDefaultApiUrl()).replace(/\/$/, '');

function getClientHeader(): HeadersInit {
  return isDesktopRuntime() ? { 'x-openlinear-client': 'desktop' } : {};
}

export function getAuthHeader(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    ...getClientHeader(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function getApiUnavailableMessage(): string {
  return isDesktopRuntime()
    ? 'Cannot reach the local OpenLinear service. Restart the app and try again.'
    : 'Cannot connect to the OpenLinear service. Please try again.';
}

export function isLikelyApiConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('load failed') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('network error')
  );
}

export function toApiConnectionError(error: unknown, fallback = getApiUnavailableMessage()): Error {
  if (isLikelyApiConnectionError(error)) {
    return new Error(fallback);
  }

  return error instanceof Error ? error : new Error(fallback);
}

export async function waitForApiReady(options?: { attempts?: number; delayMs?: number }): Promise<void> {
  if (!isDesktopRuntime()) {
    return;
  }

  const attempts = options?.attempts ?? 40;
  const delayMs = options?.delayMs ?? 250;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(`${API_URL}/health`, {
        cache: 'no-store',
        headers: getClientHeader(),
      });

      if (response.ok) {
        return;
      }
    } catch {}

    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  throw new Error(getApiUnavailableMessage());
}
