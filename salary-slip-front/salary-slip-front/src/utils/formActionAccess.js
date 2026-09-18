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

/**
 * Canonical permission checks for the Mediclaim feature's controls, mirroring
 * `appointmentActionAccess`/`trialActionAccess` above. Codes are the full
 * authoritative list from the Mediclaim implementation plan's reconciliation
 * #6 (business permission codes) — not placeholders, and not re-derived from
 * any other source, so this is the one place a Mediclaim screen should read
 * an action-gating boolean from instead of typing a permission string.
 *
 * Note: `src/features/mediclaim/hooks/useMediclaimAuthorization.js` also
 * exports a function named `mediclaimActionAccess`, but with a different
 * shape — it takes a single `stage` and returns that stage's
 * `{stage, permission, canDecide}` for review-panel gating. The two are
 * unrelated (different modules, different signatures) but share a name by
 * following each file's own local convention (`appointmentActionAccess(can)`
 * here, per-stage helpers there); import with an alias if both are ever
 * needed in the same file.
 */
export function mediclaimActionAccess(can) {
  return {
    // Simplified workflow's single approval step
    claimApprove: can("mediclaim.claim.approve"),

    // Per-stage review decisions
    managerDecide: can("mediclaim.claim.manager.decide"),
    coordinatorDecide: can("mediclaim.claim.coordinator.decide"),
    committeeDecide: can("mediclaim.claim.committee.decide"),
    hrVerificationDecide: can("mediclaim.claim.hr_verification.decide"),
    directorDecide: can("mediclaim.claim.director.decide"),
    settlementCreate: can("mediclaim.settlement.create"),

    // Claim administration
    claimDelete: can("mediclaim.claim.delete"),

    // Team claims (manager, read-only)
    teamClaimRead: can("mediclaim.team_claim.read"),

    // Policy administration
    policyRead: can("mediclaim.policy.read"),
    policyCreate: can("mediclaim.policy.create"),
    policyUpdate: can("mediclaim.policy.update"),
    policyPublish: can("mediclaim.policy.publish"),

    // Hospital administration
    hospitalRead: can("mediclaim.hospital.read"),
    hospitalCreate: can("mediclaim.hospital.create"),
    hospitalUpdate: can("mediclaim.hospital.update"),
    hospitalDelete: can("mediclaim.hospital.delete"),

    // Rule book administration
    ruleBookRead: can("mediclaim.rule_book.read"),
    ruleBookCreate: can("mediclaim.rule_book.create"),
    ruleBookUpdate: can("mediclaim.rule_book.update"),
    ruleBookPublish: can("mediclaim.rule_book.publish"),

    // Reviewer assignment administration
    reviewerAssignmentRead: can("mediclaim.reviewer_assignment.read"),
    reviewerAssignmentAssign: can("mediclaim.reviewer_assignment.assign"),

    // Reports & audit
    reportRead: can("mediclaim.report.read"),
    reportExport: can("mediclaim.report.export"),
    reportReveal: can("mediclaim.report.reveal"),
    auditRead: can("mediclaim.audit.read"),

    // Employee self-service actions
    selfClaimCreate: can("self.mediclaim.claim.create"),
    selfClaimUpdate: can("self.mediclaim.claim.update"),
    selfClaimSubmit: can("self.mediclaim.claim.submit"),
    selfClaimWithdraw: can("self.mediclaim.claim.withdraw"),
    selfDocumentUpload: can("self.mediclaim.document.upload"),
    selfDocumentDownload: can("self.mediclaim.document.download"),
    selfIntimationCreate: can("self.mediclaim.intimation.create"),
    selfMemberChangeRequestCreate: can("self.mediclaim.member_change_request.create"),
  };
}
