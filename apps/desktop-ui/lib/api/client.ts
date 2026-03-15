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
