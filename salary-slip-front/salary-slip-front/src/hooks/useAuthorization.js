import { useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { authorizationApi } from "../utils/api";

export function useAuthorization() {
  const { user } = useAuth();
  /*
   * Mirrors Sidebar's hasAccess() deliberately. The two disagreed: the sidebar
   * treats rawRole 0 as all-access and falls back to the legacy permission map,
   * while this returned false for any code missing from the enterprise
   * snapshot. A snapshot captured before a permission existed therefore showed
   * a super admin the menu item and then bounced them to the dashboard when
   * they clicked it, with no way to tell the redirect from a broken page.
   */
  const can = useCallback((permissionCode) => {
    if (!permissionCode) return true;
    if (Number(user?.rawRole) === 0) return true;
    if (user?.permissions?.["*"] === "read_write") return true;

    const decision = user?.authorization?.permissions?.[permissionCode];
    if (decision) return Boolean(decision.allowed);

    return user?.permissions?.[permissionCode] === "read_write";
  }, [user]);

  const check = useCallback(async (permissionCode, resource = {}) => {
    if (!user?.accessToken) return { allowed: false, reasonCode: "AUTHENTICATION_REQUIRED" };
    const response = await authorizationApi.check(permissionCode, resource, user.accessToken, user.tokenType);
    return response?.data ?? { allowed: false, reasonCode: "DECISION_UNAVAILABLE" };
  }, [user]);

  return { can, check, snapshot: user?.authorization ?? null };
}
