import { CLAIM_STATUS } from "./claimStatus";

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
  MANAGER: "MANAGER",
  COORDINATOR: "COORDINATOR",
  COMMITTEE: "COMMITTEE",
  HR_ELIGIBILITY: "HR_ELIGIBILITY",
  DIRECTOR: "DIRECTOR",
};

export const REVIEW_DECISION = {
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  RETURN: "RETURN",
  VERIFIED: "VERIFIED",
  RECOMMENDED: "RECOMMENDED",
  NOT_RECOMMENDED: "NOT_RECOMMENDED",
  APPROVED: "APPROVED",
  PARTIALLY_APPROVED: "PARTIALLY_APPROVED",
  REJECTED: "REJECTED",
};

export const REVIEW_STAGE_META = {
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
};

export const REVIEW_STAGES_IN_ORDER = [
  REVIEW_STAGE.MANAGER,
  REVIEW_STAGE.COORDINATOR,
  REVIEW_STAGE.COMMITTEE,
  REVIEW_STAGE.HR_ELIGIBILITY,
  REVIEW_STAGE.DIRECTOR,
];

/**
 * The four stage `.decide` permission codes checked by the admin Pending
 * Reviews tab's any-of gate (reconciliation #6). Manager decisions are made
 * from the employee workspace's Team/Pending tabs, not this admin tab, so
 * the Manager stage is intentionally excluded here.
 */
export const STAGE_DECIDE_PERMISSIONS = [
  REVIEW_STAGE.COORDINATOR,
  REVIEW_STAGE.COMMITTEE,
  REVIEW_STAGE.HR_ELIGIBILITY,
  REVIEW_STAGE.DIRECTOR,
].map((stage) => REVIEW_STAGE_META[stage].decidePermission);

export function getReviewStageMeta(stage) {
  return REVIEW_STAGE_META[stage] || null;
}

/** Resolves which stage a claim is currently pending at, from its status. */
export function getStageByPendingStatus(status) {
  const entry = Object.entries(REVIEW_STAGE_META).find(([, meta]) => meta.pendingStatus === status);
  return entry ? entry[0] : null;
}
