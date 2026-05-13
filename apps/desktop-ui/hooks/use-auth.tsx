"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { User, Repository, fetchCurrentUser, getActiveRepository, logout as apiLogout } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  activeRepository: Repository | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  refreshActiveRepository: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [activeRepository, setActiveRepository] = useState<Repository | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await fetchCurrentUser();
      setUser(userData);
    } catch {
      setUser(null);
    }
  }, []);

  const refreshActiveRepository = useCallback(async () => {
    try {
      const project = await getActiveRepository();
      setActiveRepository(project);
    } catch {
      setActiveRepository(null);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const error = params.get('error');

    if (token) {
      localStorage.setItem('token', token);
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (error) {
      console.error('Auth error:', error);
      window.history.replaceState({}, '', window.location.pathname);
    }

    Promise.all([refreshUser(), refreshActiveRepository()]).finally(() => {
      setIsLoading(false);
    });
  }, [refreshUser, refreshActiveRepository]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('__TAURI_INTERNALS__' in window)) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const dispose = await listen<{
          success: boolean;
          token?: string;
          error?: string;
        }>('auth:callback', (event) => {
          const payload = event.payload;
          if (payload.success && payload.token) {
            localStorage.setItem('token', payload.token);
            void refreshUser();
          } else if (payload.error) {
            console.error('[Auth] Tauri callback error:', payload.error);
          }
        });
        if (cancelled) {
          dispose();
        } else {
          unlisten = dispose;
        }
      } catch (err) {
        console.warn('[Auth] Failed to register Tauri auth:callback listener:', err);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [refreshUser]);

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
    setActiveRepository(null);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleAuthExpired = () => {
      setUser(null);
      setActiveRepository(null);
      toast.error('Session expired. Please sign in again.');
      if (pathname !== '/login' && pathname !== '/') {
        router.push('/login');
      }
    };

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, [router, pathname]);

  return (
    <AuthContext.Provider
      value={{
        user,
        activeRepository,
        isLoading,
        isAuthenticated: !!user,
        refreshUser,
        refreshActiveRepository,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
