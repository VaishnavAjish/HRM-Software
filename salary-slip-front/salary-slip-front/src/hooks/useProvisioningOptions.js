import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { provisioningLookupApi } from "../utils/api";
import { getCompanyUnits } from "../config/companyConfig";

let inFlight = { token: null, promise: null };

/**
 * Companies and units the signed-in actor may file a record into.
 *
 * The employee-lifecycle forms used to read a build-time constant in
 * config/companyConfig.js. Two problems with that, and the second is the worse
 * one: a company created in Company & Unit Management never appeared until the
 * app was rebuilt, and the Trial form's unit list was pinned to
 * getCompanyUnits("nidhi-impex") — so it offered Nidhi units no matter which
 * company the submitter was actually scoped to.
 *
 * The server returns only active records inside the actor's own scope, which is
 * also what it enforces on write, so the form cannot offer a tenant the API
 * would refuse.
 *
 * Lookups are exposed by code as well as by id because these forms have always
 * worked in company codes ("nidhi-impex"), and rewriting their internal state
 * to ids is a larger change than reading the right list.
 */
export function useProvisioningOptions() {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  // One state object holding the resolved result. `loading` is derived rather
  // than set, so the effect never calls setState synchronously — doing that
  // cascades an extra render on every mount, including the signed-out one.
  const [result, setResult] = useState({ companies: [], units: [], loaded: false, error: null });

  useEffect(() => {
    if (!token) return undefined;

    let active = true;

    if (inFlight.token !== token) {
      inFlight = {
        token,
        promise: provisioningLookupApi.companyOptions(token, tokenType),
      };
    }

    const pending = inFlight.promise;

    pending
      .then((res) => {
        if (!active) return;
        setResult({
          companies: res?.data?.companies ?? [],
          units: res?.data?.units ?? [],
          loaded: true,
          error: null,
        });
      })
      .catch((err) => {
        if (inFlight.promise === pending) inFlight = { token: null, promise: null };
        if (!active) return;
        // Reported, never silently replaced with a hardcoded list: a form that
        // invents companies when the lookup fails is how the constant got
        // there in the first place.
        setResult({
          companies: [],
          units: [],
          loaded: true,
          error: err.message || "Could not load companies",
        });
      });

    return () => { active = false; };
  }, [token, tokenType]);

  const { companies, units, error } = result;
  const loading = Boolean(token) && !result.loaded;

  const byCode = useMemo(
    () => new Map(companies.map((company) => [company.code, company])),
    [companies],
  );

  /** Units belonging to one company, addressed by code or by id. */
  const unitsForCompany = useCallback((companyCodeOrId) => {
    if (!companyCodeOrId) return [];

    const company = byCode.get(companyCodeOrId)
      ?? companies.find((item) => String(item.id) === String(companyCodeOrId));

    const apiUnits = company ? units.filter((unit) => unit.companyId === company.id) : [];
    const staticUnitNames = getCompanyUnits(companyCodeOrId);

    const combinedNames = new Set();
    apiUnits.forEach((u) => u?.name && combinedNames.add(u.name));
    staticUnitNames.forEach((u) => u && combinedNames.add(u));

    return Array.from(combinedNames).map((name) => {
      const existing = apiUnits.find((u) => u.name === name);
      return existing || { id: name, name, companyId: company?.id ?? null };
    });
  }, [byCode, companies, units]);

  const companyIdFor = useCallback(
    (code) => byCode.get(code)?.id ?? null,
    [byCode],
  );

  return { companies, units, unitsForCompany, companyIdFor, loading, error };
}
