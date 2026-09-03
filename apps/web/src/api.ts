import { useSessionStore } from './stores/session';
import type { ApiEnvelope } from './types';

let refreshing: Promise<boolean> | null = null;
export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const session = useSessionStore();
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (session.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`);
  const response = await fetch(`/api${path}`, { ...init, headers });
  if (response.status === 401 && retry && session.refreshToken && path !== '/auth/refresh') {
    refreshing ??= session.refresh().finally(() => { refreshing = null; });
    if (await refreshing) return api<T>(path, init, false);
  }
  if (response.status === 401 && path !== '/auth/login') {
    session.clear();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
  }
  const body = await response.json() as ApiEnvelope<T>;
  if (!response.ok) throw new Error(body.message || '请求失败');
  return body.data;
}
