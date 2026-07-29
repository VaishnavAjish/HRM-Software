import { createContext, useContext, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { authApi } from "../utils/api";
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
        const restoredUser = buildAuthUser(apiUser, storedUser);

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

  const login = async (email, password, company_code) => {
    setLoading(true);
    try {
      const data = await authApi.login(email.trim(), password, company_code);
      const apiUser =
        data?.login || data?.data || data?.user || data?.employee || data;
      const loggedInUser = buildAuthUser(apiUser, {}, data);

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
  };

  const lookupUser = (empCode) => {
    return null;
  };

  const logout = async () => {
    const accessToken = user?.accessToken;
    const tokenType = user?.tokenType || "bearer";

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
  };

  const updateUserRole = (empCode, newRole) => {
    setUsers((prev) => ({
      ...prev,
      [empCode]: { ...prev[empCode], role: newRole },
    }));
    if (user?.empCode === empCode) {
      const updated = { ...user, role: newRole };
      setUser(updated);
      saveUserToStorage(updated);
    }
  };

  const updateCurrentUser = (updates) => {
    if (user) {
      const updated = { ...user, ...updates };
      setUser(updated);
      saveUserToStorage(updated);
    }
  };

  const addUser = (userData) => {
    setUsers((prev) => ({ ...prev, [userData.empCode]: { ...userData } }));
  };

  const removeUser = (empCode) => {
    setUsers((prev) => {
      const next = { ...prev };
      delete next[empCode];
      return next;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        users,
        login,
        logout,
        loading,
        initializing,
        isAuthenticated: Boolean(user?.accessToken),
        updateUserRole,
        updateCurrentUser,
        addUser,
        removeUser,
        lookupUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
