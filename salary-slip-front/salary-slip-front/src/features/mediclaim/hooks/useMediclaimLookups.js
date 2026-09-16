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
  const requestKey = `${token ?? ""}|${tokenType}`;

  const [reloading, setReloading] = useState(false);
  const [state, setState] = useState({
    key: null,
    hospitals: [],
    ruleBooks: [],
    members: [],
    // Undefined (not yet known) vs null (checked, no waiting-period rule
    // applies) vs an object — the workspace shell treats "undefined" as
    // "still loading, don't flash the lock screen or the tabs yet."
    eligibility: undefined,
    // Same undefined-while-loading / null-on-failure fail-open convention
    // as `eligibility` — see `EmployeeMediclaimWorkspace.jsx`'s onboarding
    // gate, which only locks once this resolves to an explicit "not done."
    onboarding: undefined,
    error: null,
  });

  const fetchLookups = useCallback(async () => {
    const [hospitalsResult, ruleBooksResult, membersResult, coverageResult] = await Promise.allSettled([
      mediclaimApi.hospitals({}, token, tokenType),
      mediclaimApi.ruleBooks({}, token, tokenType),
      mediclaimApi.myMembers(token, tokenType),
      mediclaimApi.myCoverage(token, tokenType),
    ]);

    const firstRejection = [hospitalsResult, ruleBooksResult, membersResult]
      .find((result) => result.status === "rejected");

    const coverage = coverageResult.status === "fulfilled" ? coverageResult.value?.data : null;

    return {
      hospitals: unwrapList(hospitalsResult),
      ruleBooks: unwrapList(ruleBooksResult),
      members: unwrapList(membersResult),
      eligibility: coverage?.eligibility ?? null,
      onboarding: coverage?.onboarding ?? null,
      error: firstRejection ? (firstRejection.reason?.message || "Some Mediclaim data could not be loaded.") : null,
    };
  }, [token, tokenType]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    fetchLookups().then((next) => {
      if (!cancelled) setState({ key: requestKey, ...next });
    });
    return () => { cancelled = true; };
  }, [token, requestKey, fetchLookups]);

  const reload = useCallback(async () => {
    if (!token) return;
    setReloading(true);
    try {
      const next = await fetchLookups();
      setState({ key: requestKey, ...next });
    } finally {
      setReloading(false);
    }
  }, [token, requestKey, fetchLookups]);

  const loading = reloading || state.key !== requestKey;

  return {
    hospitals: state.hospitals,
    ruleBooks: state.ruleBooks,
    members: state.members,
    eligibility: state.eligibility,
    onboarding: state.onboarding,
    loading,
    error: loading ? null : state.error,
    reload,
  };
}

export default useMediclaimLookups;
