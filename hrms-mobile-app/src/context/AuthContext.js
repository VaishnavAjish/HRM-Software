import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, persistSession, loadPersistedSession, clearPersistedSession } from '../services/api';
import { resolveRole } from '../utils/role';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  // Restore a saved session on cold start, then re-validate it against the
  // server — a token could have expired or been revoked while the app was closed.
  useEffect(() => {
    (async () => {
      try {
        const saved = await loadPersistedSession();
        if (saved?.token) {
          api.setToken(saved.token, saved.tokenType);
          const res = await api.getProfile();
          if (res?.status && res.user) {
            setUser(res.user);
            setIsAuthenticated(true);
          } else {
            await clearPersistedSession();
          }
        }
      } catch (e) {
        api.clearToken();
        await clearPersistedSession();
      } finally {
        setBootstrapping(false);
      }
    })();
  }, []);

  const login = useCallback(async (identifier, password) => {
    const res = await api.login(identifier, password);
    if (res?.status && res.token) {
      api.setToken(res.token, res.token_type);
      await persistSession({ token: res.token, tokenType: res.token_type || 'Bearer' });
      setUser(res.user);
      setIsAuthenticated(true);
      return { success: true, user: res.user };
    }
    return { success: false, message: res?.message || 'Invalid credentials' };
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      api.clearToken();
      await clearPersistedSession();
      setUser(null);
      setIsAuthenticated(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const res = await api.getProfile();
    if (res?.status && res.user) {
      setUser(res.user);
    }
    return res;
  }, []);

  const updateUser = useCallback((partial) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  const role = resolveRole(user);

  return (
    <AuthContext.Provider
      value={{ user, role, isAuthenticated, bootstrapping, login, logout, refreshProfile, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
