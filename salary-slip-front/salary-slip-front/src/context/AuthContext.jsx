import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { authApi, rbacApi } from "../utils/api";
import { resolveCompanyId } from "../config/companyConfig";

const AuthContext = createContext(null);
const STORAGE_KEY = "auth_user";

function getUserRole(value, type) {
  if (type === "agent" || Number(value) === 4) {
    return "agent";
  }
  if (Number(value) === 0 || Number(value) === 1 || Number(value) === 2 || String(value).toLowerCase() === "admin") {
    return "admin";
  }
  return "employee";
}

function loadUserFromStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveUserToStorage(user) {
  if (user) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

function buildAuthUser(apiUser, fallbackUser = {}, loginData = {}) {
  const rawRole =
    apiUser?.role ??
    apiUser?.loginRole ??
    apiUser?.user_type ??
    apiUser?.type ??
    fallbackUser?.role ??
    "employee";

  const rawType = apiUser?.type ?? fallbackUser?.type;

  const companyId = resolveCompanyId(
    apiUser?.companyId,
    apiUser?.company_code,
    apiUser?.company,
    fallbackUser?.companyId,
    fallbackUser?.company_code,
    fallbackUser?.company,
  );

  return {
    ...fallbackUser,
    ...(apiUser && typeof apiUser === "object" ? apiUser : {}),
    id: apiUser?.id || fallbackUser?.id || fallbackUser?.email || "user",
    role: getUserRole(rawRole, rawType),
    name: apiUser?.name || fallbackUser?.name || fallbackUser?.email || "User",
    email: apiUser?.email || fallbackUser?.email || "",
    accessToken:
      loginData?.access_token || loginData?.token || fallbackUser?.accessToken || fallbackUser?.token,
    tokenType:
      loginData?.token_type || fallbackUser?.tokenType || "bearer",
    expiresIn: loginData?.expires_in || fallbackUser?.expiresIn,
    empCode:
      apiUser?.empCode ||
      apiUser?.emp_code ||
      apiUser?.employee_code ||
      fallbackUser?.empCode ||
      fallbackUser?.email ||
      "",
    companyId,
    company_code: companyId,
    companyName:
      apiUser?.company_name ||
      fallbackUser?.companyName ||
      fallbackUser?.company_name ||
      "",
    rawRole: Number(rawRole),
  };
}

async function loadPermissionsForUser(builtUser) {
  if (!builtUser?.accessToken) return builtUser;
  if (builtUser.rawRole === 0) {
    // Super Admin gets all access
    return { ...builtUser, permissions: null }; 
  }

  try {
    const res = await rbacApi.getMyPermissions(builtUser.accessToken, builtUser.tokenType);
    if (res.status) {
      const perms = {};
      (res.data || []).forEach((row) => {
        perms[row.key_name] = row.value; // e.g. "view_only", "no_access", "read_write"
      });
      return { ...builtUser, permissions: perms };
    }
  } catch (err) {
    console.error("Failed to load user permissions", err);
  }
  return { ...builtUser, permissions: {} }; // Empty object means default permissions
}

export function AuthProvider({ children }) {
  const [users, setUsers] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function restoreSession() {
      const storedUser = loadUserFromStorage();

      if (!storedUser?.accessToken) {
        saveUserToStorage(null);
        if (!ignore) setInitializing(false);
        return;
      }

      try {
        const data = await authApi.getProfile(
          storedUser.accessToken,
          storedUser.tokenType || "bearer",
        );
        const apiUser =
          data?.data || data?.user || data?.employee || data?.profile || data;
        let restoredUser = buildAuthUser(apiUser, storedUser);
        restoredUser = await loadPermissionsForUser(restoredUser);

        if (!ignore) {
          setUser(restoredUser);
          saveUserToStorage(restoredUser);
        }
      } catch {
        if (!ignore) {
          setUser(null);
          saveUserToStorage(null);
        }
      } finally {
        if (!ignore) setInitializing(false);
      }
    }

    restoreSession();

    return () => {
      ignore = true;
    };
  }, []);

  // apiRequest (utils/api.js) dispatches this whenever an authenticated
  // request comes back 401 — the token expired or was revoked server-side.
  // Nothing else was clearing the stale session, so the app just kept
  // showing generic error toasts forever instead of returning to /login.
  useEffect(() => {
    function handleUnauthorized() {
      setUser((prev) => {
        if (!prev) return prev;
        toast.error("Your session has expired. Please log in again.");
        return null;
      });
      saveUserToStorage(null);
    }

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  const login = useCallback(async (email, password, company_code) => {
    setLoading(true);
    try {
      const data = await authApi.login(email.trim(), password, company_code);
      const apiUser =
        data?.login || data?.data || data?.user || data?.employee || data;
      let loggedInUser = buildAuthUser(apiUser, {}, data);
      loggedInUser = await loadPermissionsForUser(loggedInUser);

      setUser(loggedInUser);
      saveUserToStorage(loggedInUser);
      return { success: true, role: loggedInUser.role };
    } catch (error) {
      return {
        success: false,
        message: error.message || "Invalid email or password",
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const lookupUser = useCallback(() => {
    return null;
  }, []);

  // Depends on the credentials rather than the whole user object, so editing a
  // profile field does not hand every consumer a new logout reference.
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType || "bearer";

  const logout = useCallback(async () => {
    try {
      if (accessToken) {
        const data = await authApi.logout(accessToken, tokenType);
        return {
          success: true,
          message: data?.message || "Logged out successfully",
        };
      }
      return { success: true, message: "Logged out successfully" };
    } catch (error) {
      return {
        success: false,
        message: error.message || "Logout failed",
      };
    } finally {
      setUser(null);
      saveUserToStorage(null);
    }
  }, [accessToken, tokenType]);

  // These two genuinely depend on the current user, so they change identity when
  // it does. That is fine: `user` is part of the context value anyway, so the
  // value was going to change with it regardless. Persisting stays outside the
  // state updater — updaters must be pure, and React double-invokes them in
  // development.
  const updateUserRole = useCallback(
    (empCode, newRole) => {
      setUsers((prev) => ({
        ...prev,
        [empCode]: { ...prev[empCode], role: newRole },
      }));
      if (user?.empCode === empCode) {
        const updated = { ...user, role: newRole };
        setUser(updated);
        saveUserToStorage(updated);
      }
    },
    [user],
  );

  const updateCurrentUser = useCallback(
    (updates) => {
      if (user) {
        const updated = { ...user, ...updates };
        setUser(updated);
        saveUserToStorage(updated);
      }
    },
    [user],
  );

  const addUser = useCallback((userData) => {
    setUsers((prev) => ({ ...prev, [userData.empCode]: { ...userData } }));
  }, []);

  const removeUser = useCallback((empCode) => {
    setUsers((prev) => {
      const next = { ...prev };
      delete next[empCode];
      return next;
    });
  }, []);

  const isAuthenticated = Boolean(accessToken);

  /**
   * One memoised object, so a re-render of whatever renders AuthProvider does
   * not hand every consumer a brand new context value. An inline literal here
   * invalidated every effect that depended on `user`, which is how the
   * appointment modal ended up re-fetching in a loop.
   */
  const value = useMemo(
    () => ({
      user,
      users,
      login,
      logout,
      loading,
      initializing,
      isAuthenticated,
      updateUserRole,
      updateCurrentUser,
      addUser,
      removeUser,
      lookupUser,
    }),
    [
      user,
      users,
      login,
      logout,
      loading,
      initializing,
      isAuthenticated,
      updateUserRole,
      updateCurrentUser,
      addUser,
      removeUser,
      lookupUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
