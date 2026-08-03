import { useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { authorizationApi } from "../utils/api";

export function useAuthorization() {
  const { user } = useAuth();
  const can = useCallback((permissionCode) => {
    if (!permissionCode) return true;
    if (user?.permissions?.["*"] === "read_write") return true;
    return Boolean(user?.authorization?.permissions?.[permissionCode]?.allowed);
  }, [user]);

  const check = useCallback(async (permissionCode, resource = {}) => {
    if (!user?.accessToken) return { allowed: false, reasonCode: "AUTHENTICATION_REQUIRED" };
    const response = await authorizationApi.check(permissionCode, resource, user.accessToken, user.tokenType);
    return response?.data ?? { allowed: false, reasonCode: "DECISION_UNAVAILABLE" };
  }, [user]);

  return { can, check, snapshot: user?.authorization ?? null };
}
