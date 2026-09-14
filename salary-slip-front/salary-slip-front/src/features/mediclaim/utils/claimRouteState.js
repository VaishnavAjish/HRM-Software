import { DEFAULT_WIZARD_STEP, isValidWizardStep } from "../models/wizardSteps";

/**
 * URL query-param helpers for the claim submission wizard's draft/resume
 * state (`?claimId=&wizardStep=`) — modeled on
 * `src/pages/auth/appointmentRouteState.js`'s `?appointmentId=&step=` pair,
 * which exists for the same reason: a refresh mid-flow should resume the
 * wizard instead of dropping the employee onto an empty create form, which
 * is how duplicate claim drafts get made.
 *
 * Unlike that file — which reads/writes `window.location` directly — these
 * take react-router-dom v7's `useSearchParams()` pair as arguments
 * (`const [searchParams, setSearchParams] = useSearchParams()`), so the
 * wizard stays in sync with react-router's own history entry instead of a
 * second, competing source of truth, and so the read side is trivially
 * testable with a plain URLSearchParams instead of a jsdom `window` mock.
 *
 * `writeClaimWizardRouteState` replaces the current history entry rather
 * than pushing a new one — these are steps within one task, not separate
 * destinations, so they should not each add a back-button stop.
 */

const CLAIM_ID_PARAM = "claimId";
const WIZARD_STEP_PARAM = "wizardStep";

/** @returns {{claimId: string|null, step: string}} */
export function readClaimWizardRouteState(searchParams) {
  const params = searchParams instanceof URLSearchParams
    ? searchParams
    : new URLSearchParams(searchParams || undefined);

  const claimId = params.get(CLAIM_ID_PARAM);
  const step = params.get(WIZARD_STEP_PARAM);

  return {
    claimId: claimId?.trim() || null,
    // A hand-edited or stale URL can't put the wizard into an unknown step.
    step: isValidWizardStep(step) ? step : DEFAULT_WIZARD_STEP,
  };
}

export function writeClaimWizardRouteState(setSearchParams, { claimId, step } = {}) {
  if (typeof setSearchParams !== "function") return;

  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);

    if (claimId) {
      next.set(CLAIM_ID_PARAM, String(claimId));
    } else {
      next.delete(CLAIM_ID_PARAM);
    }

    if (step) {
      next.set(WIZARD_STEP_PARAM, String(step));
    } else {
      next.delete(WIZARD_STEP_PARAM);
    }

    return next;
  }, { replace: true });
}

export function clearClaimWizardRouteState(setSearchParams) {
  if (typeof setSearchParams !== "function") return;

  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.delete(CLAIM_ID_PARAM);
    next.delete(WIZARD_STEP_PARAM);
    return next;
  }, { replace: true });
}
