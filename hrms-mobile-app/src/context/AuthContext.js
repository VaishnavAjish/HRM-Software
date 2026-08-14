import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, persistSession, loadPersistedSession, clearPersistedSession } from '../services/api';
import { resolveRole } from '../utils/role';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  // Read-only permission snapshot (GET v1/authorization/me) — used only to
  // show/hide in-screen admin actions (e.g. a "Delete" button). Never
  // persisted, same as `user`; re-fetched fresh every cold start/login. A
  // failure here must never block sign-in — it just means per-action gating
  // falls back to plain role checks, same as before this existed.
  const [permissions, setPermissions] = useState(null);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await api.getMyPermissions();
      if (res?.success && res.data) {
        setPermissions(res.data);
      }
    } catch (e) {
      // Swallow — see comment above. Whole-screen gating never depends on this.
    }
  }, []);

  // Cold start: load the secure token, then confirm it against the protected
  // profile endpoint BEFORE marking the session authenticated. The user object
  // is never persisted, so there is no offline "already logged in" shortcut — an
  // expired/revoked token or a denied account is caught here and its credentials
  // and user-scoped caches are cleared.
  useEffect(() => {
    (async () => {
      try {
        const saved = await loadPersistedSession();
        if (!saved?.token) {
          setBootstrapping(false);
          return;
        }

        api.setToken(saved.token, saved.tokenType);

        try {
          const res = await api.getProfile();
          if (res?.status && res.user) {
            setUser(res.user);
            setIsAuthenticated(true);
            fetchPermissions();
          } else {
            api.clearToken();
            await clearPersistedSession();
          }
        } catch (err) {
          if (err.status === 401 || err.status === 403) {
            api.clearToken();
            await clearPersistedSession();
          }
          // Other errors (e.g. offline): stay unauthenticated rather than trust a
          // cached identity. A later login/retry re-establishes the session.
        } finally {
          setBootstrapping(false);
        }
      } catch (e) {
        api.clearToken();
        await clearPersistedSession();
        setBootstrapping(false);
      }
    })();
  }, []);

  const login = useCallback(async (identifier, password) => {
    const res = await api.login(identifier, password);
    if (res?.status && res.token) {
      api.setToken(res.token, res.token_type);
      // Persist only the credential — never the user object.
      await persistSession({ token: res.token, tokenType: res.token_type || 'Bearer' });
      setUser(res.user);
      setIsAuthenticated(true);
      fetchPermissions();
      return { success: true, user: res.user };
    }
    return { success: false, message: res?.message || 'Invalid credentials' };
  }, [fetchPermissions]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      api.clearToken();
      await clearPersistedSession();
      setUser(null);
      setIsAuthenticated(false);
      setPermissions(null);
    }
  }, []);

  // Whole-screen/tab visibility should keep using the plain role string
  // (ADMIN_TABS, hub tiles) so nothing flashes-then-hides while this loads —
  // this is only for gating an individual action inside an already-shown
  // screen. No snapshot yet (still loading, or the endpoint failed) means
  // "don't hide anything extra" — only an explicit denial in a loaded
  // snapshot returns false, matching the graceful-degradation design above.
  const can = useCallback((code) => {
    if (!permissions?.permissions) return true;
    return Boolean(permissions.permissions[code]?.allowed);
  }, [permissions]);

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
      value={{ user, role, isAuthenticated, bootstrapping, login, logout, refreshProfile, updateUser, can }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
