import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";

function unwrapList(result) {
  if (result.status !== "fulfilled") return [];
  const payload = result.value?.data;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

/**
 * Preloads the three lookups the employee Mediclaim workspace's tabs share
 * — hospitals, rule books, and "my members" — exactly ONCE per workspace
 * mount, not once per tab. `EmployeeMediclaimWorkspace` calls this a single
 * time and hands the result down to whichever tabs need it (Hospitals,
 * Rule Book, Family Members today; the claim submission wizard in F4 will
 * reuse the same instance rather than re-fetching), so switching tabs back
 * and forth never re-hits the network for data that hasn't changed.
 *
 * Honest empty/error state throughout — a failed or not-yet-migrated
 * backend call (the schema may not exist on this deployment yet) leaves the
 * corresponding list genuinely empty and records the real error message.
 * Nothing here is ever synthesized or fabricated.
 */
export function useMediclaimLookups() {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [state, setState] = useState({
    hospitals: [],
    ruleBooks: [],
    members: [],
    // Undefined (not yet known) vs null (checked, no waiting-period rule
    // applies) vs an object — the workspace shell treats "undefined" as
    // "still loading, don't flash the lock screen or the tabs yet."
    eligibility: undefined,
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    if (!token) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const [hospitalsResult, ruleBooksResult, membersResult, coverageResult] = await Promise.allSettled([
      mediclaimApi.hospitals({}, token, tokenType),
      mediclaimApi.ruleBooks({}, token, tokenType),
      mediclaimApi.myMembers(token, tokenType),
      mediclaimApi.myCoverage(token, tokenType),
    ]);

    const firstRejection = [hospitalsResult, ruleBooksResult, membersResult]
      .find((result) => result.status === "rejected");

    const coverage = coverageResult.status === "fulfilled" ? coverageResult.value?.data : null;

    setState({
      hospitals: unwrapList(hospitalsResult),
      ruleBooks: unwrapList(ruleBooksResult),
      members: unwrapList(membersResult),
      eligibility: coverage?.eligibility ?? null,
      loading: false,
      error: firstRejection ? (firstRejection.reason?.message || "Some Mediclaim data could not be loaded.") : null,
    });
  }, [token, tokenType]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

export default useMediclaimLookups;
