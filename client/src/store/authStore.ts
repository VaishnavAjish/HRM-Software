import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User, UserRole, AuthTokens } from '@/types/models';
import { apiClient } from '@/api/axios';

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitializing: boolean;
  error: string | null;

  setAuth: (user: User, tokens: AuthTokens) => void;
  setUser: (user: User | null) => void;
  setTokens: (tokens: AuthTokens) => void;
  setLoading: (loading: boolean) => void;
  setInitializing: (initializing: boolean) => void;
  setError: (error: string | null) => void;
  clearAuth: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  isAdmin: () => boolean;
  isHR: () => boolean;
  isManager: () => boolean;
  isEmployee: () => boolean;
  getToken: () => string | null;
  initializeAuth: () => Promise<void>;
}

const AUTH_STORAGE_KEY = 'hrflow_auth';

const getStoredAuth = (): Partial<AuthState> | null => {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const setStoredAuth = (auth: Partial<AuthState>) => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
};

const clearStoredAuth = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      isInitializing: true,
      error: null,

      setAuth: (user, tokens) => {
        apiClient.setAuthToken(tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);
        set({
          user,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        setStoredAuth({
          user,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isAuthenticated: true,
        });
      },

      setUser: (user) => {
        set({ user, isAuthenticated: !!user });
        if (user) {
          setStoredAuth({ ...getStoredAuth(), user });
        }
      },

      setTokens: (tokens) => {
        apiClient.setAuthToken(tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isAuthenticated: true,
        });
        setStoredAuth({ ...getStoredAuth(), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      },

      setLoading: (isLoading) => set({ isLoading }),
      setInitializing: (isInitializing) => set({ isInitializing }),
      setError: (error) => set({ error }),

      clearAuth: () => {
        apiClient.clearAuth();
        clearStoredAuth();
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await apiClient.post('/auth/logout');
        } catch {
          // Ignore logout API errors
        } finally {
          get().clearAuth();
        }
      },

      refreshUser: async () => {
        const token = apiClient.getAuthToken();
        if (!token) {
          get().clearAuth();
          return;
        }

        set({ isLoading: true });
        try {
          const response = await apiClient.get<{ success: boolean; data: User }>('/auth/me');
          if (response.success && response.data) {
            set({ user: response.data, isAuthenticated: true, isLoading: false, error: null });
            setStoredAuth({ ...getStoredAuth(), user: response.data });
          } else {
            get().clearAuth();
          }
        } catch {
          get().clearAuth();
        }
      },

      hasRole: (roles) => {
        const user = get().user;
        if (!user) return false;
        const rolesArray = Array.isArray(roles) ? roles : [roles];
        return rolesArray.includes(user.role);
      },

      isAdmin: () => get().hasRole('admin'),
      isHR: () => get().hasRole(['admin', 'hr']),
      isManager: () => get().hasRole(['admin', 'hr', 'manager']),
      isEmployee: () => get().hasRole('employee'),

      getToken: () => get().accessToken,

      initializeAuth: async () => {
        set({ isInitializing: true });
        const stored = getStoredAuth();
        const token = apiClient.getAuthToken();

        if (stored?.accessToken && token) {
          apiClient.setAuthToken(stored.accessToken);
          set({
            user: stored.user || null,
            accessToken: stored.accessToken,
            refreshToken: stored.refreshToken,
            isAuthenticated: true,
            isInitializing: true,
          });
          await get().refreshUser();
        } else {
          set({ isInitializing: false, isLoading: false });
        }
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) {
          apiClient.setAuthToken(state.accessToken);
        }
      },
    }
  )
);

export default useAuthStore;