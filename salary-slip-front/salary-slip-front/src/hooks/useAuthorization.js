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
  /*
   * A grant only counts when its whole chain holds.
   *
   * This was a flat lookup, so a role holding hr.appointment.create while the
   * Forms module was denied rendered the button — the Permission Matrix showed
   * that action as effectively denied, and the API would have refused it. A
   * child must never bypass a denied parent, and the UI offering an action the
   * server rejects is the worst version of that: it looks like a broken page
   * rather than a permission boundary.
   *
   * `requires` comes from the server's own registry, so the client applies the
   * same rule rather than re-deriving a hierarchy it cannot see. The middleware
   * still decides every request; this only stops us offering what it refuses.
   */
  const can = useCallback((permissionCode) => {
    if (!permissionCode) return true;
    if (Number(user?.rawRole) === 0) return true;
    if (user?.permissions?.["*"] === "read_write") return true;

    const holds = (code) => {
      const decision = user?.authorization?.permissions?.[code];
      if (decision) return Boolean(decision.allowed);
      return user?.permissions?.[code] === "read_write";
    };

    if (!holds(permissionCode)) return false;

    const required = user?.authorization?.requires?.[permissionCode] ?? [];

    return required.every(holds);
  }, [user]);

  const check = useCallback(async (permissionCode, resource = {}) => {
    if (!user?.accessToken) return { allowed: false, reasonCode: "AUTHENTICATION_REQUIRED" };
    const response = await authorizationApi.check(permissionCode, resource, user.accessToken, user.tokenType);
    return response?.data ?? { allowed: false, reasonCode: "DECISION_UNAVAILABLE" };
  }, [user]);

  return { can, check, snapshot: user?.authorization ?? null };
}
