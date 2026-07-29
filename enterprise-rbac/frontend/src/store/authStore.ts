import { create } from 'zustand';
import type { AuthUser } from '../types';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isHydrated: boolean;
  setSession: (user: AuthUser, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  setHydrated: (value: boolean) => void;
  clear: () => void;
  hasPermission: (resource: string, action: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isHydrated: false,

  setSession: (user, accessToken) => set({ user, accessToken }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setHydrated: (value) => set({ isHydrated: value }),
  clear: () => set({ user: null, accessToken: null }),

  hasPermission: (resource, action) => {
    const { user } = get();
    if (!user) return false;
    if (user.roles.includes('Super Admin')) return true;
    return user.permissions.includes(`${resource}.${action}`);
  },
}));
