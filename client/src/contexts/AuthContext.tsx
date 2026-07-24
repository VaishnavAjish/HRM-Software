import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, AuthTokens, LoginCredentials, RegisterData, AuthState, UserRole } from '@/types/models';
import { apiClient } from '@/api/axios';
import { ApiResponse } from '@/types/api';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<ApiResponse<{ user: User; tokens: AuthTokens }>>;
  register: (data: RegisterData) => Promise<ApiResponse<{ user: User; tokens: AuthTokens }>>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  setAuthTokens: (tokens: AuthTokens) => void;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const updateState = (updates: Partial<AuthState>) => {
    setState((prev) => {
      const newState = { ...prev, ...updates };
      setStoredAuth(newState);
      return newState;
    });
  };

  const setAuthTokens = (tokens: AuthTokens) => {
    apiClient.setAuthToken(tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    updateState({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      isAuthenticated: true,
    });
  };

  const clearAuth = () => {
    apiClient.clearAuth();
    clearStoredAuth();
    setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  };

  const login = async (credentials: LoginCredentials) => {
    updateState({ isLoading: true });
    try {
      const response = await apiClient.post<ApiResponse<{ user: User; tokens: AuthTokens }>>('/auth/login', credentials);
      if (response.success && response.data) {
        setAuthTokens(response.data.tokens);
        updateState({ user: response.data.user, isLoading: false });
        return response;
      }
      updateState({ isLoading: false });
      return response;
    } catch (error) {
      updateState({ isLoading: false });
      throw error;
    }
  };

  const register = async (data: RegisterData) => {
    updateState({ isLoading: true });
    try {
      const response = await apiClient.post<ApiResponse<{ user: User; tokens: AuthTokens }>>('/auth/register', data);
      if (response.success && response.data) {
        setAuthTokens(response.data.tokens);
        updateState({ user: response.data.user, isLoading: false });
        return response;
      }
      updateState({ isLoading: false });
      return response;
    } catch (error) {
      updateState({ isLoading: false });
      throw error;
    }
  };

  const logout = async () => {
    updateState({ isLoading: true });
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore logout API errors
    } finally {
      clearAuth();
    }
  };

  const refreshUser = async () => {
    const token = apiClient.getAuthToken();
    if (!token) {
      updateState({ isLoading: false });
      return;
    }

    try {
      const response = await apiClient.get<ApiResponse<User>>('/auth/me');
      if (response.success && response.data) {
        updateState({ user: response.data, isAuthenticated: true, isLoading: false });
      } else {
        clearAuth();
      }
    } catch {
      clearAuth();
    }
  };

  const hasRole = (roles: UserRole | UserRole[]): boolean => {
    if (!state.user) return false;
    const rolesArray = Array.isArray(roles) ? roles : [roles];
    return rolesArray.includes(state.user.role);
  };

  useEffect(() => {
    const stored = getStoredAuth();
    const token = apiClient.getAuthToken();

    if (stored?.accessToken && token) {
      apiClient.setAuthToken(stored.accessToken);
      setState({
        user: stored.user || null,
        accessToken: stored.accessToken || null,
        refreshToken: stored.refreshToken || null,
        isAuthenticated: true,
        isLoading: true,
      });
      refreshUser();
    } else {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        refreshUser,
        hasRole,
        setAuthTokens,
        clearAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;