import ClaimStatusBadge from "./ClaimStatusBadge";
import { formatCurrencyINR, formatClaimDate, formatClaimNumber } from "../utils/formatters";

/**
 * Compact claim header: claim number, patient name, status badge, and
 * claimed/approved amount. Used at the top of `ClaimDetailDrawer` today; F5
 * reuses it unchanged as the "which claim am I deciding on" header inside
 * every review panel.
 */
export default function ClaimSummaryCard({ claim, className = "" }) {
  if (!claim) return null;

  const claimNumber = (claim.status === "DRAFT" && !claim.claimNumber && !claim.claim_number) ? "Draft" : formatClaimNumber(claim);
  const patientName = claim.patientName || claim.patient_snapshot?.name || claim.patient?.name || "—";
  const relationship = claim.relationshipType || claim.relationship_type;
  const claimedAmount = claim.totalClaimedAmount ?? claim.total_claimed_amount;
  const approvedAmount = claim.approvedAmount ?? claim.approved_amount ?? claim.totalApprovedAmount ?? claim.total_approved_amount;
  const submittedOn = claim.submittedAt || claim.submitted_at;

  return (
    <div className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Claim Number</p>
          <p className="text-base font-bold text-gray-900 dark:text-white">{claimNumber}</p>
        </div>
        <ClaimStatusBadge status={claim.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryField label="Patient" value={relationship ? `${patientName} (${relationship})` : patientName} />
        <SummaryField label="Claimed Amount" value={formatCurrencyINR(claimedAmount)} />
        <SummaryField label="Approved Amount" value={approvedAmount != null ? formatCurrencyINR(approvedAmount) : "—"} />
        <SummaryField label="Submitted On" value={formatClaimDate(submittedOn)} />
      </div>
    </div>
  );
}

function SummaryField({ label, value }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{value ?? "—"}</p>
    </div>
  );
}
