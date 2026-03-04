function getDefaultApiUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost:3001';
  }

  const hostname = window.location.hostname;
  const isDesktop = '__TAURI_INTERNALS__' in window || hostname === 'tauri.localhost';
  const isProduction = process.env.NODE_ENV === 'production';

  // Production desktop app should use hosted API
  if (isDesktop && isProduction) {
    return 'https://rixie.in';
  }

  // Development desktop app or local web
  if (isDesktop || hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3001';
  }

  return window.location.origin;
}
  if (typeof window === 'undefined') {
    return 'http://localhost:3001';
  }

  const hostname = window.location.hostname;
  const isDesktop = '__TAURI_INTERNALS__' in window || hostname === 'tauri.localhost';

  if (isDesktop || hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3001';
  }

  return window.location.origin;
}

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || getDefaultApiUrl()).replace(/\/$/, '');

function getClientHeader(): HeadersInit {
  const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  return isDesktop ? { 'x-openlinear-client': 'desktop' } : {};
}

export function getAuthHeader(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    ...getClientHeader(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
