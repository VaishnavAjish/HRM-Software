import { describe, it, expect, beforeEach } from "vitest";
import {
  readAppointmentRouteState,
  writeAppointmentRouteState,
  clearAppointmentRouteState,
  STEP_DETAILS,
  STEP_DOCUMENTS,
} from "./appointmentRouteState";

const setUrl = (search) =>
  window.history.replaceState({}, "", `/appointments${search}`);

describe("appointmentRouteState", () => {
  beforeEach(() => setUrl(""));

  it("returns no appointment and the details step by default", () => {
    expect(readAppointmentRouteState()).toEqual({
      appointmentId: null,
      step: STEP_DETAILS,
    });
  });

  it("reads appointmentId and the documents step", () => {
    setUrl("?appointmentId=104&step=documents");

    expect(readAppointmentRouteState()).toEqual({
      appointmentId: "104",
      step: STEP_DOCUMENTS,
    });
  });

  it("falls back to details for an unknown step", () => {
    setUrl("?appointmentId=104&step=nonsense");

    // A hand-edited URL must not put the form into an unknown state.
    expect(readAppointmentRouteState().step).toBe(STEP_DETAILS);
  });

  it("treats a blank appointmentId as absent", () => {
    setUrl("?appointmentId=%20%20&step=documents");

    expect(readAppointmentRouteState().appointmentId).toBeNull();
  });

  it("writes both parameters without discarding existing ones", () => {
    setUrl("?tab=pending");

    writeAppointmentRouteState({ appointmentId: 104, step: STEP_DOCUMENTS });

    const params = new URLSearchParams(window.location.search);
    expect(params.get("appointmentId")).toBe("104");
    expect(params.get("step")).toBe("documents");
    expect(params.get("tab")).toBe("pending");
  });

  it("removes the appointmentId when passed a falsy value", () => {
    setUrl("?appointmentId=104&step=documents");

    writeAppointmentRouteState({ appointmentId: null, step: null });

    expect(readAppointmentRouteState()).toEqual({
      appointmentId: null,
      step: STEP_DETAILS,
    });
  });

  it("clears only its own parameters", () => {
    setUrl("?appointmentId=104&step=documents&tab=pending");

    clearAppointmentRouteState();

    const params = new URLSearchParams(window.location.search);
    expect(params.get("appointmentId")).toBeNull();
    expect(params.get("step")).toBeNull();
    expect(params.get("tab")).toBe("pending");
  });

  it("does not add history entries", () => {
    const before = window.history.length;

    writeAppointmentRouteState({ appointmentId: 1, step: STEP_DETAILS });
    writeAppointmentRouteState({ appointmentId: 2, step: STEP_DOCUMENTS });
    clearAppointmentRouteState();

    // Steps within one task should not each become a back-button stop.
    expect(window.history.length).toBe(before);
  });
});
