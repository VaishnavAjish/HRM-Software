import { CLAIM_STATUS, CLAIM_STATUS_LIST } from "./claimStatus";

/**
 * The five sequential review stages a submitted claim passes through
 * (Sections H-K of the paper claim form, plus the Manager stage that
 * precedes them) and the metadata every review panel (F5) and the admin
 * Pending Reviews tab (F6) need to render and gate against.
 *
 * `pendingStatus` is the `mediclaim_claims.status` value the claim carries
 * while it is awaiting *this* stage's decision. The backend infers the
 * current stage from that status server-side and never trusts a
 * client-supplied stage (see reconciliation #5 in the implementation plan);
 * the frontend uses this same mapping only to decide which review panel to
 * render, never to authorize the decision itself — that is always the
 * matching `decidePermission` code, checked via `can()`.
 */

export const REVIEW_STAGE = {
  // The simplified workflow's single approval step — a claim at SUBMITTED
  // or MANAGER_REVIEW, decided in one action by whoever holds
  // `mediclaim.claim.approve` (see ClaimWorkflowService::approveDirect()'s
  // docblock on the backend). Replaces MANAGER as the stage
  // `getStageByPendingStatus()` resolves those two statuses to below — the
  // MANAGER stage/panel itself is left registered for backward
  // compatibility but is no longer reachable from a fresh claim.
  APPROVAL: "APPROVAL",
  MANAGER: "MANAGER",
  COORDINATOR: "COORDINATOR",
  COMMITTEE: "COMMITTEE",
  HR_ELIGIBILITY: "HR_ELIGIBILITY",
  DIRECTOR: "DIRECTOR",
  SETTLEMENT: "SETTLEMENT",
};

// Values are lowercase because they are sent verbatim as the `decision`
// field of `POST /reviews/{claim}/decision`, and every
// `ClaimWorkflowService` stage method validates against an exact lowercase
// `in_array` (e.g. managerDecision(): `['approve', 'reject', 'return']`) —
// there is no case-insensitive matching on the backend. This previously
// held uppercase values ("APPROVE", "VERIFIED", ...), which every review
// panel sent unchanged, so `ClaimWorkflowService` threw "Unknown manager/
// coordinator/committee/... decision" on literally every decision, at every
// stage — the same class of bug as the reviewer-role-slug mismatch found
// earlier in this module (see ReviewersTab.jsx's ROLE_OPTIONS docblock).
export const REVIEW_DECISION = {
  APPROVE: "approve",
  REJECT: "reject",
  RETURN: "return",
  VERIFIED: "verified",
  RECOMMENDED: "recommended",
  NOT_RECOMMENDED: "not_recommended",
  APPROVED: "approved",
  PARTIALLY_APPROVED: "partially_approved",
  REJECTED: "rejected",
};

export const REVIEW_STAGE_META = {
  [REVIEW_STAGE.APPROVAL]: {
    label: "Approval",
    sectionLabel: null,
    pendingStatus: null, // resolved from two statuses (SUBMITTED, MANAGER_REVIEW) — see getStageByPendingStatus()
    decidePermission: "mediclaim.claim.approve",
    decisions: [
      { value: REVIEW_DECISION.APPROVED, label: "Approved" },
      { value: REVIEW_DECISION.PARTIALLY_APPROVED, label: "Partially Approved" },
      { value: REVIEW_DECISION.REJECTED, label: "Rejected" },
    ],
    cleanApproveDecision: REVIEW_DECISION.APPROVED,
    // Approved Amount is required for every Approval decision except a
    // clean Rejected — same rule as DIRECTOR, see claimValidation.js.
    requiresApprovedAmountUnless: REVIEW_DECISION.REJECTED,
  },
  [REVIEW_STAGE.MANAGER]: {
    label: "Manager Review",
    sectionLabel: null,
    pendingStatus: CLAIM_STATUS.MANAGER_REVIEW,
    decidePermission: "mediclaim.claim.manager.decide",
    decisions: [
      { value: REVIEW_DECISION.APPROVE, label: "Approve" },
      { value: REVIEW_DECISION.REJECT, label: "Reject" },
      { value: REVIEW_DECISION.RETURN, label: "Return for Correction" },
    ],
    cleanApproveDecision: REVIEW_DECISION.APPROVE,
  },
  [REVIEW_STAGE.COORDINATOR]: {
    label: "Coordinator Verification",
    sectionLabel: "Section H",
    pendingStatus: CLAIM_STATUS.COORDINATOR_VERIFICATION,
    decidePermission: "mediclaim.claim.coordinator.decide",
    decisions: [
      { value: REVIEW_DECISION.VERIFIED, label: "Verified" },
      { value: REVIEW_DECISION.RETURN, label: "Return for Correction" },
    ],
    cleanApproveDecision: REVIEW_DECISION.VERIFIED,
  },
  [REVIEW_STAGE.COMMITTEE]: {
    label: "Committee Recommendation",
    sectionLabel: "Section I",
    pendingStatus: CLAIM_STATUS.COMMITTEE_RECOMMENDATION,
    decidePermission: "mediclaim.claim.committee.decide",
    decisions: [
      { value: REVIEW_DECISION.RECOMMENDED, label: "Recommended" },
      { value: REVIEW_DECISION.NOT_RECOMMENDED, label: "Not Recommended" },
    ],
    cleanApproveDecision: REVIEW_DECISION.RECOMMENDED,
  },
  [REVIEW_STAGE.HR_ELIGIBILITY]: {
    label: "HR Eligibility Verification",
    sectionLabel: "Section J",
    pendingStatus: CLAIM_STATUS.HR_ELIGIBILITY_VERIFICATION,
    decidePermission: "mediclaim.claim.hr_verification.decide",
    decisions: [
      { value: REVIEW_DECISION.VERIFIED, label: "Verified" },
      { value: REVIEW_DECISION.RETURN, label: "Return for Correction" },
    ],
    cleanApproveDecision: REVIEW_DECISION.VERIFIED,
  },
  [REVIEW_STAGE.DIRECTOR]: {
    label: "Director Final Approval",
    sectionLabel: "Section K",
    pendingStatus: CLAIM_STATUS.DIRECTOR_FINAL_APPROVAL,
    decidePermission: "mediclaim.claim.director.decide",
    decisions: [
      { value: REVIEW_DECISION.APPROVED, label: "Approved" },
      { value: REVIEW_DECISION.PARTIALLY_APPROVED, label: "Partially Approved" },
      { value: REVIEW_DECISION.REJECTED, label: "Rejected" },
    ],
    cleanApproveDecision: REVIEW_DECISION.APPROVED,
    // Approved Amount is required for every Director decision except a
    // clean Rejected, and (validated separately) can never exceed the
    // claim's total claimed amount.
    requiresApprovedAmountUnless: REVIEW_DECISION.REJECTED,
  },
  [REVIEW_STAGE.SETTLEMENT]: {
    label: "Settlement",
    sectionLabel: null,
    pendingStatus: CLAIM_STATUS.SETTLEMENT_PENDING,
    decidePermission: "mediclaim.settlement.create",
    // No `decisions`/`cleanApproveDecision` vocabulary — `SettlementPanel.jsx`
    // is a standalone form (amount/mode/reference), not built on
    // `ReviewPanelShell`'s decision-buttons-plus-remarks shape, so those
    // fields are left unset here rather than populated with values nothing
    // reads.
  },
};

export const REVIEW_STAGES_IN_ORDER = [
  REVIEW_STAGE.MANAGER,
  REVIEW_STAGE.COORDINATOR,
  REVIEW_STAGE.COMMITTEE,
  REVIEW_STAGE.HR_ELIGIBILITY,
  REVIEW_STAGE.DIRECTOR,
];

/**
 * The stage `.decide`/`.create` permission codes checked by the admin
 * Pending Reviews tab's any-of gate (`AdminMediclaimWorkspace.jsx`'s
 * `pending-reviews` tab `permissions` array). Manager decisions can ALSO be
 * made from the employee workspace's Pending My Approval tab, but
 * `PendingReviewsTab.jsx` renders `ManagerReviewPanel` too (via
 * `STAGE_PANEL[REVIEW_STAGE.MANAGER]`) so a company-wide reviewer/admin has
 * one single place to work every stage — Manager is included here for that
 * reason, not excluded.
 */
export const STAGE_DECIDE_PERMISSIONS = [
  REVIEW_STAGE.APPROVAL,
  REVIEW_STAGE.MANAGER,
  REVIEW_STAGE.COORDINATOR,
  REVIEW_STAGE.COMMITTEE,
  REVIEW_STAGE.HR_ELIGIBILITY,
  REVIEW_STAGE.DIRECTOR,
  REVIEW_STAGE.SETTLEMENT,
].map((stage) => REVIEW_STAGE_META[stage].decidePermission);

export function getReviewStageMeta(stage) {
  return REVIEW_STAGE_META[stage] || null;
}

/** Resolves which stage a claim is currently pending at, from its status. */
/**
 * The three-stage workflow bucket a claim belongs in — shared by the admin
 * "Pending Reviews" tab and the employee "My Claims" tab so both present the
 * exact same three-tab structure (Pending Approval / Pending Document /
 * Approved Claim) over the exact same status boundaries, rather than two
 * independently-drifting definitions of "which stage is this claim really
 * at". `FINALIZED_CLAIM_STATUSES` also replaces `ClaimsTab.jsx`'s
 * previously-local `FINALIZED_STATUSES` constant — same list, one source.
 */
export const CLAIM_WORKFLOW_BUCKET = {
  PENDING_APPROVAL: "PENDING_APPROVAL",
  PENDING_DOCUMENT: "PENDING_DOCUMENT",
  FINALIZED: "FINALIZED",
};

// APPROVED/PARTIALLY_APPROVED (the simplified workflow's single-approval
// resting state — see ClaimWorkflowService::approveDirect()'s docblock) and
// SETTLEMENT_PENDING (the legacy flow's post-Director state) both mean the
// same thing from this bucket's point of view: the claim has cleared
// approval and is waiting on the employee's documents (then, for
// SETTLEMENT_PENDING claims only, HR's manual final settlement approve —
// a claim newly approved via approveDirect() settles automatically instead,
// see autoSettleIfDocumentsComplete()). Neither is "finished" yet, so
// neither belongs in the finalized bucket below.
export const PENDING_DOCUMENT_STATUSES = [
  CLAIM_STATUS.APPROVED,
  CLAIM_STATUS.PARTIALLY_APPROVED,
  CLAIM_STATUS.SETTLEMENT_PENDING,
];

// The genuine end of the pipeline — matches ClaimsTab.jsx's original
// FINALIZED_STATUSES exactly (kept broad, not just the success path, so a
// rejected/withdrawn/cancelled claim still lands somewhere instead of
// disappearing from every tab). APPROVED/PARTIALLY_APPROVED are
// deliberately NOT here — see PENDING_DOCUMENT_STATUSES above.
export const FINALIZED_CLAIM_STATUSES = [
  CLAIM_STATUS.REJECTED,
  CLAIM_STATUS.SETTLED,
  CLAIM_STATUS.CLOSED,
  CLAIM_STATUS.WITHDRAWN,
  CLAIM_STATUS.CANCELLED,
];

// DRAFT, SUBMITTED, every review stage, RETURNED_FOR_CORRECTION — computed
// as "everything else" rather than hand-enumerated, so it can never drift
// out of sync with the other two lists above. Used by the employee's "My
// Claims" tab, which (unlike the admin Pending Reviews tab) filters
// server-side via `GET /me/claims?status=...` and so needs an explicit
// status list rather than relying on `getClaimWorkflowBucket()`'s fallback.
export const PENDING_APPROVAL_STATUSES = CLAIM_STATUS_LIST.filter(
  (status) => !PENDING_DOCUMENT_STATUSES.includes(status) && !FINALIZED_CLAIM_STATUSES.includes(status),
);

export function getClaimWorkflowBucket(status) {
  if (PENDING_DOCUMENT_STATUSES.includes(status)) return CLAIM_WORKFLOW_BUCKET.PENDING_DOCUMENT;
  if (FINALIZED_CLAIM_STATUSES.includes(status)) return CLAIM_WORKFLOW_BUCKET.FINALIZED;
  return CLAIM_WORKFLOW_BUCKET.PENDING_APPROVAL;
}

/** Resolves which stage a claim is currently pending at, from its status. */
export function getStageByPendingStatus(status) {
  // Simplified workflow: SUBMITTED and MANAGER_REVIEW both resolve to the
  // single APPROVAL stage/panel — see ClaimWorkflowService::approveDirect()'s
  // docblock. This supersedes the old MANAGER mapping for both statuses;
  // that panel stays registered (STAGE_PANEL still has a MANAGER entry) only
  // so the legacy managerDecision() codepath remains directly testable, but
  // it is no longer reached through this resolver.
  if (status === CLAIM_STATUS.SUBMITTED || status === CLAIM_STATUS.MANAGER_REVIEW) return REVIEW_STAGE.APPROVAL;

  const entry = Object.entries(REVIEW_STAGE_META).find(([, meta]) => meta.pendingStatus === status);
  return entry ? entry[0] : null;
}
