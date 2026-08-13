import { describe, expect, it, vi } from "vitest";
import { appointmentActionAccess, trialActionAccess } from "./formActionAccess";

function permissions(...allowed) {
  const held = new Set(allowed);
  return vi.fn((code) => held.has(code));
}

describe("Forms action permission mapping", () => {
  it("shows only appointment actions explicitly permitted by the matrix", () => {
    const can = permissions(
      "ui.forms.appointment.create",
      "ui.forms.appointment.print",
      "ui.employees.master.create",
    );

    expect(appointmentActionAccess(can)).toEqual({
      create: true,
      update: false,
      deleteRecord: false,
      createEmployee: true,
      print: true,
      export: false,
    });
  });

  it("does not infer trial actions from a role name or page access", () => {
    const can = permissions("ui.forms.trial", "ui.forms.trial.update");

    expect(trialActionAccess(can)).toEqual({
      create: false,
      update: true,
      deleteRecord: false,
      processIntoAppointment: false,
    });
  });

  it("uses appointment create permission for the trial-to-appointment action", () => {
    const can = permissions("ui.forms.appointment.create");

    expect(trialActionAccess(can).processIntoAppointment).toBe(true);
  });
});
