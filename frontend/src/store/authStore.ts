import { create } from 'zustand';

export interface CurrentUser {
  _id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'TEAM_LEAD' | 'EMPLOYEE';
  isActive: boolean;
}

interface AuthState {
  user: CurrentUser | null;
  accessToken: string | null;
  /** True while the initial "who am I" check (via the refresh cookie) is in flight. */
  isInitializing: boolean;
  setSession: (user: CurrentUser, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  clearSession: () => void;
  setInitializing: (value: boolean) => void;
}

/**
 * Deliberately in-memory only — never persisted to localStorage/sessionStorage.
 * The access token is short-lived, so losing it on a hard refresh is expected
 * and handled by silently calling POST /api/auth/refresh on app load (the
 * httpOnly refresh-token cookie survives a refresh even though this store
 * does not).
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isInitializing: true,
  setSession: (user, accessToken) => set({ user, accessToken }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clearSession: () => set({ user: null, accessToken: null }),
  setInitializing: (value) => set({ isInitializing: value }),
}));
