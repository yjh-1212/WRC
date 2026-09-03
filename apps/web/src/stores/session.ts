import { defineStore } from 'pinia';
import { api } from '../api';
import type { AuthUser, MenuItem } from '../types';

const ACCESS_KEY = 'wrc-access-token';
const REFRESH_KEY = 'wrc-refresh-token';
export const useSessionStore = defineStore('session', {
  state: () => ({
    accessToken: sessionStorage.getItem(ACCESS_KEY) ?? '',
    refreshToken: localStorage.getItem(REFRESH_KEY) ?? '',
    user: null as AuthUser | null,
    menus: [] as MenuItem[],
  }),
  actions: {
    persist(accessToken: string, refreshToken: string) {
      this.accessToken = accessToken; this.refreshToken = refreshToken;
      sessionStorage.setItem(ACCESS_KEY, accessToken); localStorage.setItem(REFRESH_KEY, refreshToken);
    },
    clear() {
      this.accessToken = ''; this.refreshToken = ''; this.user = null; this.menus = [];
      sessionStorage.removeItem(ACCESS_KEY); localStorage.removeItem(REFRESH_KEY);
    },
    async login(username: string, password: string) {
      const tokens = await api<{ accessToken: string; refreshToken: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }, false);
      this.persist(tokens.accessToken, tokens.refreshToken); await this.loadContext();
    },
    async refresh() {
      try {
        const tokens = await api<{ accessToken: string; refreshToken: string }>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: this.refreshToken }) }, false);
        this.persist(tokens.accessToken, tokens.refreshToken); return true;
      } catch { this.clear(); return false; }
    },
    async loadContext() {
      const [user, menus] = await Promise.all([api<AuthUser>('/auth/me'), api<MenuItem[]>('/auth/menus')]);
      this.user = user; this.menus = menus;
    },
    async logout() {
      try { await api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: this.refreshToken }) }); } finally { this.clear(); }
    },
  },
});
