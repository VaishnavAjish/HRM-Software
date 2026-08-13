/**
 * Canonical permission checks for the active Forms controls.
 *
 * Keeping the mapping outside the page components makes it testable and stops
 * role names from creeping back into button visibility. Appointment deletion
 * still uses the employee deletion endpoint, so it deliberately follows that
 * endpoint's canonical permission until a dedicated appointment-delete API
 * exists.
 */
export function appointmentActionAccess(can) {
  return {
    create: can("ui.forms.appointment.create"),
    update: can("ui.forms.appointment.update"),
    deleteRecord: can("ui.employees.master.delete"),
    createEmployee: can("ui.employees.master.create"),
    print: can("ui.forms.appointment.print"),
    export: can("ui.forms.appointment.export"),
  };
}

export function trialActionAccess(can) {
  return {
    create: can("ui.forms.trial.create"),
    update: can("ui.forms.trial.update"),
    deleteRecord: can("ui.forms.trial.delete"),
    processIntoAppointment: can("ui.forms.appointment.create"),
  };
}
