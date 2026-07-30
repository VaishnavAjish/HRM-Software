/**
 * Single source of truth for the appointment workflow's URL state.
 *
 * The step lives in the URL so a refresh mid-flow recovers instead of dropping
 * the user onto an empty create form — which is how duplicate appointment
 * records get made. Both the Appointments page (to reopen the modal) and
 * AppointmentModal (to restore its step) read through here rather than parsing
 * query strings in two places that can drift apart.
 *
 * replaceState is used throughout: these are steps within one task, not
 * separate destinations, so they should not each add a history entry.
 */

const APPOINTMENT_ID_PARAM = "appointmentId";
const STEP_PARAM = "step";

export const STEP_DETAILS = "details";
export const STEP_DOCUMENTS = "documents";

/** @returns {{appointmentId: string|null, step: "details"|"documents"}} */
export function readAppointmentRouteState() {
  if (typeof window === "undefined") {
    return { appointmentId: null, step: STEP_DETAILS };
  }

  const params = new URLSearchParams(window.location.search);
  const appointmentId = params.get(APPOINTMENT_ID_PARAM);

  return {
    appointmentId: appointmentId?.trim() || null,
    // Anything other than "documents" resolves to details, so a hand-edited
    // URL cannot put the form into an unknown state.
    step: params.get(STEP_PARAM) === STEP_DOCUMENTS ? STEP_DOCUMENTS : STEP_DETAILS,
  };
}

export function writeAppointmentRouteState({ appointmentId, step } = {}) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);

  if (appointmentId) {
    url.searchParams.set(APPOINTMENT_ID_PARAM, String(appointmentId));
  } else {
    url.searchParams.delete(APPOINTMENT_ID_PARAM);
  }

  if (step) {
    url.searchParams.set(STEP_PARAM, step);
  } else {
    url.searchParams.delete(STEP_PARAM);
  }

  window.history.replaceState({}, "", url.toString());
}

export function clearAppointmentRouteState() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.searchParams.delete(APPOINTMENT_ID_PARAM);
  url.searchParams.delete(STEP_PARAM);
  window.history.replaceState({}, "", url.toString());
}
