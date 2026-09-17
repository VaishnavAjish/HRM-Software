import { useMemo } from "react";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { REVIEW_STAGE_META, STAGE_DECIDE_PERMISSIONS } from "../models/reviewStages";

/**
 * The full authoritative Mediclaim permission-code list from the
 * implementation plan's reconciliation #6 (and the B5 seed list) — named
 * here once so every call site reads a constant instead of re-typing a
 * string that's easy to typo.
 */
export const MEDICLAIM_PERMISSIONS = {
  VIEW_ADMIN: "ui.admin.mediclaim.view",

  COVERAGE_READ: "self.mediclaim.coverage.read",
  MEMBER_READ: "self.mediclaim.member.read",
  MEMBER_CHANGE_REQUEST_CREATE: "self.mediclaim.member_change_request.create",
  MEMBER_CHANGE_REQUEST_READ: "self.mediclaim.member_change_request.read",
  CARD_READ: "self.mediclaim.card.read",
  CARD_DOWNLOAD: "self.mediclaim.card.download",
  INTIMATION_CREATE: "self.mediclaim.intimation.create",
  INTIMATION_READ: "self.mediclaim.intimation.read",
  CLAIM_CREATE: "self.mediclaim.claim.create",
  CLAIM_READ: "self.mediclaim.claim.read",
  CLAIM_UPDATE: "self.mediclaim.claim.update",
  CLAIM_SUBMIT: "self.mediclaim.claim.submit",
  CLAIM_WITHDRAW: "self.mediclaim.claim.withdraw",
  DOCUMENT_UPLOAD: "self.mediclaim.document.upload",
  DOCUMENT_DOWNLOAD: "self.mediclaim.document.download",

  TEAM_CLAIM_READ: "mediclaim.team_claim.read",
  MANAGER_DECIDE: "mediclaim.claim.manager.decide",
  CLAIM_REASSIGN: "mediclaim.claim.reassign",
  CLAIM_READ_ADMIN: "mediclaim.claim.read",
  CLAIM_DELETE: "mediclaim.claim.delete",

  POLICY_READ: "mediclaim.policy.read",
  HOSPITAL_READ: "mediclaim.hospital.read",
  RULE_BOOK_READ: "mediclaim.rule_book.read",
  REVIEWER_ASSIGNMENT_READ: "mediclaim.reviewer_assignment.read",
  SETTLEMENT_READ: "mediclaim.settlement.read",
  SETTLEMENT_CREATE: "mediclaim.settlement.create",
  REPORT_READ: "mediclaim.report.read",
  AUDIT_READ: "mediclaim.audit.read",
  INTIMATION_READ_ADMIN: "mediclaim.intimation.read",
  INTIMATION_CLOSE: "mediclaim.intimation.close",
  DOCUMENT_REQUIREMENT_READ: "mediclaim.document_requirement.read",
  DOCUMENT_REQUIREMENT_CREATE: "mediclaim.document_requirement.create",
  DOCUMENT_REQUIREMENT_UPDATE: "mediclaim.document_requirement.update",
  DOCUMENT_REQUIREMENT_DELETE: "mediclaim.document_requirement.delete",
};

/**
 * Thin, feature-specific wrapper over the app's own `useAuthorization()` —
 * every check here still resolves through that hook's `can()`, which reads
 * the server-issued permission snapshot. This file adds NO authorization
 * logic of its own: it only names the Mediclaim permission codes so call
 * sites read `canViewTeamClaims` instead of a bare string, gated on the
 * exact same server-verified decision as every other permission check in
 * the app.
 *
 * Deliberately NOT here: any client-side "is this user a manager" guess.
 * There is no such field on the user object anywhere in this codebase —
 * team-claims and pending-approval visibility for Mediclaim are driven
 * entirely by whether the backend has granted `mediclaim.team_claim.read` /
 * `mediclaim.claim.manager.decide`, exactly like every other
 * permission-gated feature here. Adding a heuristic here would let the UI
 * show controls the server would reject, which is exactly what
 * `useAuthorization()`'s own doc comments call out as the failure mode to
 * avoid.
 */
export function useMediclaimAuthorization() {
  const { can, canRoute, accessState, routeState, check, snapshot } = useAuthorization();

  return useMemo(() => {
    const canDecideStage = (stage) => {
      const meta = REVIEW_STAGE_META[stage];
      return meta ? can(meta.decidePermission) : false;
    };

    // Per-stage decide access, shaped so a review panel (F5) can read
    // `mediclaimActionAccess(stage).canDecide` without knowing the
    // underlying permission code itself.
    const mediclaimActionAccess = (stage) => ({
      stage,
      permission: REVIEW_STAGE_META[stage]?.decidePermission ?? null,
      canDecide: canDecideStage(stage),
    });

    return {
      can,
      canRoute,
      accessState,
      routeState,
      check,
      snapshot,

      canViewAdminWorkspace: can(MEDICLAIM_PERMISSIONS.VIEW_ADMIN),

      canViewCoverage: can(MEDICLAIM_PERMISSIONS.COVERAGE_READ),
      canViewMembers: can(MEDICLAIM_PERMISSIONS.MEMBER_READ),
      canRequestMemberChange: can(MEDICLAIM_PERMISSIONS.MEMBER_CHANGE_REQUEST_CREATE),
      canViewMemberChangeRequests: can(MEDICLAIM_PERMISSIONS.MEMBER_CHANGE_REQUEST_READ),
      canViewCards: can(MEDICLAIM_PERMISSIONS.CARD_READ),
      canDownloadCard: can(MEDICLAIM_PERMISSIONS.CARD_DOWNLOAD),
      canCreateIntimation: can(MEDICLAIM_PERMISSIONS.INTIMATION_CREATE),
      canViewIntimations: can(MEDICLAIM_PERMISSIONS.INTIMATION_READ),
      canCreateClaim: can(MEDICLAIM_PERMISSIONS.CLAIM_CREATE),
      canViewOwnClaims: can(MEDICLAIM_PERMISSIONS.CLAIM_READ),
      canUpdateOwnClaim: can(MEDICLAIM_PERMISSIONS.CLAIM_UPDATE),
      canSubmitClaim: can(MEDICLAIM_PERMISSIONS.CLAIM_SUBMIT),
      canWithdrawClaim: can(MEDICLAIM_PERMISSIONS.CLAIM_WITHDRAW),
      canUploadDocument: can(MEDICLAIM_PERMISSIONS.DOCUMENT_UPLOAD),
      canDownloadDocument: can(MEDICLAIM_PERMISSIONS.DOCUMENT_DOWNLOAD),

      // Team/pending visibility — permission-code-driven only, see the note
      // above. Not consumed by any tab yet (F3 wires only the 6
      // unconditional read-only tabs) but exposed now so F5's `team`/
      // `pending` tabs need only import this hook, not invent their own
      // gating.
      canViewTeamClaims: can(MEDICLAIM_PERMISSIONS.TEAM_CLAIM_READ),
      canReviewPendingApprovals: can(MEDICLAIM_PERMISSIONS.MANAGER_DECIDE),
      canReassignReviewer: can(MEDICLAIM_PERMISSIONS.CLAIM_REASSIGN),
      canDeleteClaim: can(MEDICLAIM_PERMISSIONS.CLAIM_DELETE),
      canRecordSettlement: can(MEDICLAIM_PERMISSIONS.SETTLEMENT_CREATE),

      canDecideStage,
      mediclaimActionAccess,
      stageDecidePermissions: STAGE_DECIDE_PERMISSIONS,
      canReviewAnyStage: STAGE_DECIDE_PERMISSIONS.some((code) => can(code)),

      // Admin-workspace-only checks (F6), exposed here too so that phase
      // doesn't need a second wrapper hook.
      canViewPolicies: can(MEDICLAIM_PERMISSIONS.POLICY_READ),
      canViewHospitalsAdmin: can(MEDICLAIM_PERMISSIONS.HOSPITAL_READ),
      canViewRuleBooksAdmin: can(MEDICLAIM_PERMISSIONS.RULE_BOOK_READ),
      canViewReviewerAssignments: can(MEDICLAIM_PERMISSIONS.REVIEWER_ASSIGNMENT_READ),
      canViewReports: can(MEDICLAIM_PERMISSIONS.REPORT_READ),
      canViewAudit: can(MEDICLAIM_PERMISSIONS.AUDIT_READ),
      canViewIntimationsAdmin: can(MEDICLAIM_PERMISSIONS.INTIMATION_READ_ADMIN),
      canCloseIntimation: can(MEDICLAIM_PERMISSIONS.INTIMATION_CLOSE),
      canViewDocumentRequirements: can(MEDICLAIM_PERMISSIONS.DOCUMENT_REQUIREMENT_READ),
    };
  }, [can, canRoute, accessState, routeState, check, snapshot]);
}

export default useMediclaimAuthorization;
