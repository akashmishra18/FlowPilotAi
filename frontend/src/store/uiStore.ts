import { create } from 'zustand';

interface UIState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

/**
 * Phase 1: minimal UI-only store (sidebar open/closed).
 * Phase 2 will add an authStore here for the logged-in user + role.
 */
export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));
