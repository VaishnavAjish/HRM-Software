/**
 * The full Mediclaim claim lifecycle (`mediclaim_claims.status`) — 16
 * values, a plain string column on the backend (see the implementation
 * plan's B1/B3 sections), never a DB/PHP enum.
 *
 * Mirrors the `STATE_META` shape in
 * `src/features/permissionMatrix/models/permissionStates.js` so every
 * status badge in the app reads the same way — a label, a Tailwind badge
 * class, and a dot color, kept in one place so two pages can't render the
 * same status two different ways.
 */

export const CLAIM_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  MANAGER_REVIEW: "MANAGER_REVIEW",
  COORDINATOR_VERIFICATION: "COORDINATOR_VERIFICATION",
  COMMITTEE_RECOMMENDATION: "COMMITTEE_RECOMMENDATION",
  HR_ELIGIBILITY_VERIFICATION: "HR_ELIGIBILITY_VERIFICATION",
  DIRECTOR_FINAL_APPROVAL: "DIRECTOR_FINAL_APPROVAL",
  APPROVED: "APPROVED",
  PARTIALLY_APPROVED: "PARTIALLY_APPROVED",
  REJECTED: "REJECTED",
  SETTLEMENT_PENDING: "SETTLEMENT_PENDING",
  SETTLED: "SETTLED",
  CLOSED: "CLOSED",
  RETURNED_FOR_CORRECTION: "RETURNED_FOR_CORRECTION",
  WITHDRAWN: "WITHDRAWN",
  CANCELLED: "CANCELLED",
};

const PENDING_REVIEW_BADGE = "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30";
const NEUTRAL_BADGE = "bg-gray-100 text-gray-600 ring-gray-500/20 dark:bg-gray-700/60 dark:text-gray-300 dark:ring-gray-500/30";

export const CLAIM_STATUS_META = {
  [CLAIM_STATUS.DRAFT]: {
    label: "Draft",
    description: "Not yet submitted. Editable only by the employee.",
    badge: NEUTRAL_BADGE,
    dot: "bg-gray-400",
    isTerminal: false,
  },
  [CLAIM_STATUS.SUBMITTED]: {
    label: "Submitted",
    description: "Submitted and awaiting assignment to the manager review stage.",
    badge: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30",
    dot: "bg-sky-500",
    isTerminal: false,
  },
  [CLAIM_STATUS.MANAGER_REVIEW]: {
    label: "Manager Review",
    description: "Awaiting the employee's assigned manager's decision.",
    badge: PENDING_REVIEW_BADGE,
    dot: "bg-amber-500",
    isTerminal: false,
  },
  [CLAIM_STATUS.COORDINATOR_VERIFICATION]: {
    label: "Coordinator Verification",
    description: "Awaiting Mediclaim Coordinator verification (Section H).",
    badge: PENDING_REVIEW_BADGE,
    dot: "bg-amber-500",
    isTerminal: false,
  },
  [CLAIM_STATUS.COMMITTEE_RECOMMENDATION]: {
    label: "Committee Recommendation",
    description: "Awaiting Mediclaim Committee recommendation (Section I).",
    badge: PENDING_REVIEW_BADGE,
    dot: "bg-amber-500",
    isTerminal: false,
  },
  [CLAIM_STATUS.HR_ELIGIBILITY_VERIFICATION]: {
    label: "HR Eligibility Verification",
    description: "Awaiting HR eligibility and policy applicability verification (Section J).",
    badge: PENDING_REVIEW_BADGE,
    dot: "bg-amber-500",
    isTerminal: false,
  },
  [CLAIM_STATUS.DIRECTOR_FINAL_APPROVAL]: {
    label: "Director Final Approval",
    description: "Awaiting the Director's final approval decision (Section K).",
    badge: PENDING_REVIEW_BADGE,
    dot: "bg-amber-500",
    isTerminal: false,
  },
  [CLAIM_STATUS.APPROVED]: {
    label: "Approved",
    description: "Fully approved by the Director for the claimed amount.",
    badge: "bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/30",
    dot: "bg-green-500",
    isTerminal: false,
  },
  [CLAIM_STATUS.PARTIALLY_APPROVED]: {
    label: "Partially Approved",
    description: "Approved for less than the total claimed amount.",
    badge: "bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/30",
    dot: "bg-teal-500",
    isTerminal: false,
  },
  [CLAIM_STATUS.REJECTED]: {
    label: "Rejected",
    description: "Rejected at the Director's final approval stage.",
    badge: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30",
    dot: "bg-red-500",
    isTerminal: true,
  },
  [CLAIM_STATUS.SETTLEMENT_PENDING]: {
    label: "Pending for Document Approval",
    description: "Documents uploaded by employee; awaiting Admin document approval and final claim settlement.",
    badge: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/30",
    dot: "bg-indigo-500",
    isTerminal: false,
  },
  [CLAIM_STATUS.SETTLED]: {
    label: "Settled",
    description: "Settlement recorded in full.",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
    dot: "bg-emerald-500",
    isTerminal: false,
  },
  [CLAIM_STATUS.CLOSED]: {
    label: "Closed",
    description: "Fully settled and closed out.",
    badge: "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-700/60 dark:text-slate-300 dark:ring-slate-500/30",
    dot: "bg-slate-400",
    isTerminal: true,
  },
  [CLAIM_STATUS.RETURNED_FOR_CORRECTION]: {
    label: "Returned for Correction",
    description: "Sent back to the employee for correction. Resubmitting restarts at Manager Review.",
    badge: "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/30",
    dot: "bg-orange-500",
    isTerminal: false,
  },
  [CLAIM_STATUS.WITHDRAWN]: {
    label: "Withdrawn",
    description: "Withdrawn by the employee before manager approval.",
    badge: NEUTRAL_BADGE,
    dot: "bg-gray-400",
    isTerminal: true,
  },
  [CLAIM_STATUS.CANCELLED]: {
    label: "Cancelled",
    description: "Cancelled by an administrator.",
    badge: NEUTRAL_BADGE,
    dot: "bg-gray-400",
    isTerminal: true,
  },
};

export const CLAIM_STATUS_LIST = Object.keys(CLAIM_STATUS_META);

export function getClaimStatusMeta(status) {
  return CLAIM_STATUS_META[status] || null;
}

export function isTerminalClaimStatus(status) {
  return Boolean(CLAIM_STATUS_META[status]?.isTerminal);
}
