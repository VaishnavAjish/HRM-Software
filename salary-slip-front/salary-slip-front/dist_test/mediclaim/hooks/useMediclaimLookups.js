import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { saveStoredCardSettings, getStoredCardSettings } from "../../idCards/config/idCardThemes";
function unwrapList(result) {
  if (result.status !== "fulfilled") return [];
  const payload = result.value?.data;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}
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
    documentRequirements: [],
    // Undefined (not yet known) vs null (checked, no waiting-period rule
    // applies) vs an object — the workspace shell treats "undefined" as
    // "still loading, don't flash the lock screen or the tabs yet."
    eligibility: void 0,
    // Same undefined-while-loading / null-on-failure fail-open convention
    // as `eligibility` — see `EmployeeMediclaimWorkspace.jsx`'s onboarding
    // gate, which only locks once this resolves to an explicit "not done."
    onboarding: void 0,
    error: null
  });
  const fetchLookups = useCallback(async () => {
    const [hospitalsResult, ruleBooksResult, membersResult, coverageResult, documentRequirementsResult, cardSettingsResult] = await Promise.allSettled([
      mediclaimApi.hospitals({}, token, tokenType),
      mediclaimApi.ruleBooks({}, token, tokenType),
      mediclaimApi.myMembers(token, tokenType),
      mediclaimApi.myCoverage(token, tokenType),
      mediclaimApi.documentRequirements({}, token, tokenType),
      mediclaimApi.cardSettings("", token, tokenType)
    ]);
    const firstRejection = [hospitalsResult, ruleBooksResult, membersResult].find((result) => result.status === "rejected");
    const coverage = coverageResult.status === "fulfilled" ? coverageResult.value?.data : null;
    if (cardSettingsResult.status === "fulfilled" && cardSettingsResult.value?.data) {
      const apiSettings = cardSettingsResult.value.data;
      if (apiSettings && typeof apiSettings === "object") {
        const current = getStoredCardSettings();
        saveStoredCardSettings({ ...current, ...apiSettings });
      }
    }
    return {
      hospitals: unwrapList(hospitalsResult),
      ruleBooks: unwrapList(ruleBooksResult),
      members: unwrapList(membersResult),
      documentRequirements: unwrapList(documentRequirementsResult),
      eligibility: coverage?.eligibility ?? null,
      onboarding: coverage?.onboarding ?? null,
      error: firstRejection ? firstRejection.reason?.message || "Some Mediclaim data could not be loaded." : null
    };
  }, [token, tokenType]);
  useEffect(() => {
    if (!token) return void 0;
    let cancelled = false;
    fetchLookups().then((next) => {
      if (!cancelled) setState({ key: requestKey, ...next });
    });
    return () => {
      cancelled = true;
    };
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
    documentRequirements: state.documentRequirements,
    eligibility: state.eligibility,
    onboarding: state.onboarding,
    loading,
    error: loading ? null : state.error,
    reload
  };
}
export default useMediclaimLookups;
