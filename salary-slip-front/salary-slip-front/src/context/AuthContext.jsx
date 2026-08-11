import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { authApi, authorizationApi, rbacApi } from "../utils/api";
import { resolveCompanyId } from "../config/companyConfig";
import {
  broadcastSignOut,
  clearStoredSession,
  subscribeToSignOut,
} from "../utils/authSession";

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
    return;
  }

  // Ending a session means more than dropping the token: the company and branch
  // scope lives in localStorage and would otherwise be inherited by whoever
  // signs in next. clearStoredSession owns that whole list.
  clearStoredSession();
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

/**
 * Which shell to render.
 *
 * The server resolves this from the ui.portals.* capabilities, so the Permission
 * Matrix decides it rather than the legacy numeric tier. That tier is a poor
 * proxy: every role whose code the tier map does not recognise — HR Manager,
 * Account, any custom role — reports the employee tier, so the shell was chosen
 * by a value that says nothing about the role.
 *
 * The previous rule survives as the fallback, both here and on the server: it
 * upgraded a non-admin tier only when the account held whatever permission
 * governs the /admin route, which is ui.dashboard. That made the dashboard a
 * hidden prerequisite for every other business page.
 *
 * A shell is not authority. Landing in the management frame grants nothing;
 * ui.access_control is still resolved independently.
 */
function portalRoleFor(builtUser, snapshot) {
  const resolved = snapshot?.portal;

  if (resolved === "admin" || resolved === "agent" || resolved === "employee") {
    return resolved;
  }

  if (builtUser.role === "agent" || builtUser.role === "admin") {
    return builtUser.role;
  }

  const code = snapshot?.routes?.["/admin"];

  return code && snapshot?.permissions?.[code]?.allowed ? "admin" : builtUser.role;
}

/*
 * Why the snapshot is empty matters as much as that it is empty.
 *
 * Every failure here used to end at the same place — an empty permissions map —
 * so a 500 from the authorization service, an expired token and an account that
 * genuinely holds nothing were indistinguishable downstream. The UI then told a
 * user whose backend was simply unreachable that they had no permissions
 * assigned, which sends them to an administrator to fix something that is not
 * broken.
 *
 * authorizationStatus records which of those happened so the screen can say the
 * true thing. It never widens access: an unavailable snapshot still denies.
 */
async function loadPermissionsForUser(builtUser) {
  if (!builtUser?.accessToken) return builtUser;

  // Super admin (rawRole === 0) holds wildcard access — skip permissions network call for instant login
  if (builtUser.rawRole === 0) {
    return {
      ...builtUser,
      authorizationStatus: "loaded",
      permissions: { "*": "read_write" },
      authorization: { permissions: {}, featureFlags: {}, roles: [] },
    };
  }

  try {
    const enterprise = await authorizationApi.me(builtUser.accessToken, builtUser.tokenType);
    if (enterprise?.success && enterprise?.data?.permissions) {
      const decisions = enterprise.data.permissions;
      return {
        ...builtUser,
        role: portalRoleFor(builtUser, enterprise.data),
        authorizationStatus: "loaded",
        authorization: enterprise.data,
        permissions: Object.fromEntries(
          Object.entries(decisions).map(([code, decision]) => [code, decision.allowed ? "read_write" : "no_access"]),
        ),
      };
    }
  } catch (err) {
    console.warn("Enterprise authorization snapshot unavailable; using compatibility permissions.", err);
  }

  try {
    const res = await rbacApi.getMyPermissions(builtUser.accessToken, builtUser.tokenType);
    if (res?.status) {
      const perms = {};
      (res.data || []).forEach((row) => {
        perms[row.key_name] = row.value;
      });
      return { ...builtUser, authorizationStatus: "loaded", permissions: perms };
    }
  } catch (err) {
    console.error("Failed to load user permissions", err);
  }
  return {
    ...builtUser,
    authorizationStatus: "unavailable",
    permissions: {},
    authorization: { permissions: {}, featureFlags: {}, roles: [] },
  };
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

  /*
   * Another tab signed out.
   *
   * The token lives in sessionStorage, so every tab holds its own copy and this
   * one would otherwise keep showing a signed-in UI until one of its own
   * requests happened to come back 401. Clear immediately instead.
   */
  useEffect(
    () =>
      subscribeToSignOut(() => {
        setUser((prev) => (prev ? null : prev));
        saveUserToStorage(null);
      }),
    [],
  );

  const login = useCallback(async (email, password, company_code) => {
    setLoading(true);
    try {
      // Drop whatever the previous user left behind *before* the new identity is
      // hydrated. Without this a sign-in inherits their stored company and branch
      // scope, and every list the new user opens is filtered by it.
      setUser(null);
      clearStoredSession();

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

  // Collapses duplicate sign-outs — a double click, or a 401 arriving while the
  // request is still in flight — onto a single backend call.
  const logoutInFlight = useRef(null);

  const logout = useCallback(async () => {
    if (logoutInFlight.current) return logoutInFlight.current;

    const run = async () => {
      try {
        if (accessToken) {
          // Revokes the token server-side. That endpoint is deliberately
          // idempotent and answers 200 even for an expired or malformed token,
          // so this can never leave the client unable to sign out.
          await authApi.logout(accessToken, tokenType);
        }

        return { success: true, message: "Logged out successfully" };
      } catch (error) {
        // The local session is still cleared below. A network failure must not
        // leave someone signed in on a shared machine.
        return {
          success: false,
          message: error.message || "Logout failed",
        };
      } finally {
        setUser(null);
        saveUserToStorage(null);
        broadcastSignOut();
        logoutInFlight.current = null;
      }
    };

    logoutInFlight.current = run();

    return logoutInFlight.current;
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
