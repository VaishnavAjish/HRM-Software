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

  /*
   * May this route be opened?
   *
   * The registry knows which permission governs each page, and until now the
   * browser did not: the sidebar checked one module-wide code and then listed
   * every child under it, so a page denied in the Permission Matrix stayed in
   * the menu and opened on a direct URL. Resolving the route through the same
   * map the matrix edits means a page is governed by exactly one permission,
   * wherever it is reached from.
   *
   * A route the registry does not describe is not silently denied — plenty of
   * pages have no node yet, and hiding them would remove working navigation.
   * Those keep their previous behaviour; the backend remains the boundary.
   */
  const canRoute = useCallback((path) => {
    if (!path) return true;

    const code = user?.authorization?.routes?.[path];

    return code ? can(code) : true;
  }, [user, can]);

  /*
   * Why a resource is unavailable, not just that it is.
   *
   * Deny and Not Assigned both refuse access, but they mean different things to
   * the person looking at the screen. Deny is a decision someone made about them
   * — the page exists and is closed. Not Assigned is the absence of a decision,
   * and showing a permanently dead entry for it is just clutter.
   *
   * "allow"      grant holds, and its whole chain holds
   * "deny"       explicitly denied, or an ancestor is closing it
   * "unassigned" nothing grants it and nothing denies it
   *
   * This never widens access: deny and unassigned are equally refused by
   * can(), by the route guard, and by the API. It only decides how the refusal
   * is presented.
   */
  const accessState = useCallback((permissionCode) => {
    if (!permissionCode) return "allow";
    if (Number(user?.rawRole) === 0) return "allow";
    if (user?.permissions?.["*"] === "read_write") return "allow";

    const decision = user?.authorization?.permissions?.[permissionCode];

    if (!decision) {
      return user?.permissions?.[permissionCode] === "read_write" ? "allow" : "unassigned";
    }

    if (decision.allowed) {
      // A grant an ancestor is suppressing is a denial, not an absence.
      return can(permissionCode) ? "allow" : "deny";
    }

    return decision.state === "NOT_ASSIGNED" ? "unassigned" : "deny";
  }, [user, can]);

  const routeState = useCallback((path) => {
    if (!path) return "allow";

    const code = user?.authorization?.routes?.[path];

    return code ? accessState(code) : "allow";
  }, [user, accessState]);

  const check = useCallback(async (permissionCode, resource = {}) => {
    if (!user?.accessToken) return { allowed: false, reasonCode: "AUTHENTICATION_REQUIRED" };
    const response = await authorizationApi.check(permissionCode, resource, user.accessToken, user.tokenType);
    return response?.data ?? { allowed: false, reasonCode: "DECISION_UNAVAILABLE" };
  }, [user]);

  return { can, canRoute, accessState, routeState, check, snapshot: user?.authorization ?? null };
}
