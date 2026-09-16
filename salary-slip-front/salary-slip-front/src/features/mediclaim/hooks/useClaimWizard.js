import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { WIZARD_STEP, DEFAULT_WIZARD_STEP, isValidWizardStep } from "../models/wizardSteps";
import { readClaimWizardRouteState, writeClaimWizardRouteState } from "../utils/claimRouteState";

// Steps that can only be reached once a real, server-issued claim id exists
// — Documents (uploads are claim-scoped) and Declaration/Submit. Mirrors
// `AppointmentModal.jsx`'s belt-and-braces guard
// (`if (step === 2 && !savedAppointmentId) setStep(1)`), except here the
// step lives in the URL (via `?claimId=&wizardStep=`) rather than local
// component state, so the correction is made directly against the URL —
// matching `EmployeeMediclaimWorkspace.jsx`'s own "derive from the URL, fix
// the URL if it's wrong" pattern for `?tab=`.
const STEPS_REQUIRING_CLAIM_ID = [WIZARD_STEP.DOCUMENTS, WIZARD_STEP.DECLARATION];

/**
 * Owns the claim submission wizard's step + claim-id state, mirrored into
 * the tab's `?claimId=&wizardStep=` URL params (via `claimRouteState.js`,
 * F1) for refresh-safe resume — never localStorage.
 *
 * On mount, if a `claimId` is present in the URL this fetches the claim via
 * `mediclaimApi.getClaim` so the caller can rehydrate step state before
 * rendering the resumed step. This hook never creates a claim on its own —
 * `saveStep` is the only thing that calls `createClaim`/`updateClaim`, and
 * only ever in response to an explicit "Save & Continue".
 */
export function useClaimWizard() {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [searchParams, setSearchParams] = useSearchParams();
  const routeState = readClaimWizardRouteState(searchParams);
  const routeClaimId = routeState.claimId;

  // Belt-and-braces guard, evaluated every render (not just on navigation)
  // so a hand-edited or stale URL can never park the wizard on a
  // claim-id-gated step without a real claim id.
  const step = STEPS_REQUIRING_CLAIM_ID.includes(routeState.step) && !routeClaimId
    ? DEFAULT_WIZARD_STEP
    : routeState.step;

  const [claim, setClaim] = useState(null);
  const [settledFor, setSettledFor] = useState(null);
  const [reloading, setReloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const loadedFor = useRef(null);
  const [loadInputs, setLoadInputs] = useState({ routeClaimId, token });

  if (loadInputs.routeClaimId !== routeClaimId || loadInputs.token !== token) {
    setLoadInputs({ routeClaimId, token });
    if (!routeClaimId || !token) {
      setSettledFor(null);
      if (!routeClaimId) setClaim(null);
    } else if (settledFor !== String(routeClaimId)) {
      setError(null);
    }
  }

  const loading = reloading || (Boolean(routeClaimId) && settledFor !== String(routeClaimId));

  // Correct the URL itself when the guard above overrode the requested step,
  // so the address bar never lies about which step is actually showing.
  useEffect(() => {
    if (step !== routeState.step) {
      writeClaimWizardRouteState(setSearchParams, { claimId: routeClaimId, step });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, routeState.step, routeClaimId]);

  // Rehydrate from ?claimId= — on mount, and whenever the URL's claim id
  // changes (Back/Forward, or MyClaimsTab routing here to continue a draft).
  // Never creates a record, only loads an existing one.
  useEffect(() => {
    if (!routeClaimId || !token) {
      loadedFor.current = null;
      return undefined;
    }
    if (loadedFor.current === String(routeClaimId)) return undefined;

    let cancelled = false;
    const requestedClaimId = String(routeClaimId);

    mediclaimApi.getClaim(routeClaimId, token, tokenType)
      .then((res) => {
        if (cancelled) return;
        const record = res?.data ?? null;
        if (!record) throw new Error("Claim not found.");
        loadedFor.current = requestedClaimId;
        setClaim(record);
        setError(null);
        setSettledFor(requestedClaimId);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "This claim could not be loaded.");
        setSettledFor(requestedClaimId);
      });

    return () => { cancelled = true; };
  }, [routeClaimId, token, tokenType]);

  const goToStep = useCallback((nextStep) => {
    if (!isValidWizardStep(nextStep)) return;
    if (STEPS_REQUIRING_CLAIM_ID.includes(nextStep) && !routeClaimId) return;
    writeClaimWizardRouteState(setSearchParams, { claimId: routeClaimId, step: nextStep });
  }, [routeClaimId, setSearchParams]);

  // Step 1's first save creates the claim (gets a real id); every later
  // step's save PATCHes it via `updateClaim`. Always sends the full
  // accumulated wizard payload rather than only the current step's fields —
  // simpler and safer than trying to guess which PUT semantics the
  // not-yet-built backend controller uses for partial updates.
  //
  // `nextStep` (optional): when the caller is about to advance immediately
  // after saving (the common "Save & Continue" flow), pass the target step
  // here instead of calling `goToStep` right after `saveStep` resolves.
  // `goToStep` closes over `routeClaimId` from the render that *called*
  // saveStep, which is still null on the very first save (the claim didn't
  // exist yet when that render happened) — calling it immediately after
  // would overwrite the `claimId` this save just wrote to the URL with that
  // stale null, silently erasing the newly-created claim's id. Folding the
  // step advance into this same URL write sidesteps the stale closure
  // entirely, since `newId` here is always fresh.
  const saveStep = useCallback(async (payload, nextStep) => {
    if (!token) throw new Error("Not authenticated.");
    setSaving(true);
    setError(null);
    try {
      const res = routeClaimId
        ? await mediclaimApi.updateClaim(routeClaimId, payload, token, tokenType)
        : await mediclaimApi.createClaim(payload, token, tokenType);
      const record = res?.data ?? null;
      const newId = record?.id ?? record?.claimId ?? routeClaimId;
      setClaim(record);
      if (newId) {
        loadedFor.current = String(newId);
        setSettledFor(String(newId));
      }
      const targetStep = nextStep && isValidWizardStep(nextStep) ? nextStep : step;
      writeClaimWizardRouteState(setSearchParams, { claimId: newId, step: targetStep });
      return record;
    } catch (err) {
      setError(err?.message || "Failed to save this step.");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [routeClaimId, token, tokenType, step, setSearchParams]);

  const submitClaim = useCallback(async () => {
    if (!routeClaimId) throw new Error("Save the claim before submitting.");
    setSaving(true);
    setError(null);
    try {
      await mediclaimApi.submitClaim(routeClaimId, token, tokenType);
      // The submit endpoint's own response shape isn't pinned down yet —
      // refetch so `claim` always reflects the server's authoritative
      // post-submit state (status, recalculated totals) rather than
      // guessing at what `submitClaim` returned.
      const res = await mediclaimApi.getClaim(routeClaimId, token, tokenType);
      const record = res?.data ?? null;
      setClaim(record);
      return record;
    } catch (err) {
      setError(err?.message || "Failed to submit this claim.");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [routeClaimId, token, tokenType]);

  const reload = useCallback(async () => {
    if (!routeClaimId || !token) return null;
    setReloading(true);
    setError(null);
    try {
      const res = await mediclaimApi.getClaim(routeClaimId, token, tokenType);
      const record = res?.data ?? null;
      setClaim(record);
      return record;
    } catch (err) {
      setError(err?.message || "Failed to reload this claim.");
      return null;
    } finally {
      setReloading(false);
    }
  }, [routeClaimId, token, tokenType]);

  const startNewClaim = useCallback(() => {
    loadedFor.current = null;
    setSettledFor(null);
    setClaim(null);
    setError(null);
    writeClaimWizardRouteState(setSearchParams, { claimId: null, step: null });
  }, [setSearchParams]);

  return {
    step,
    goToStep,
    claim,
    claimId: routeClaimId,
    saveStep,
    submitClaim,
    reload,
    startNewClaim,
    loading,
    saving,
    error,
  };
}

export default useClaimWizard;
