import { getClaimStatusMeta } from "../models/claimStatus";

/**
 * A single status pill for a Mediclaim claim, reused everywhere a claim's
 * status is shown — `ClaimsTable`, `ClaimSummaryCard`, `ClaimDetailDrawer`
 * today, and every review panel / admin tab that lands in later phases.
 * Label/tone metadata lives in exactly one place (`models/claimStatus.js`)
 * so two screens can never render the same status two different ways.
 */
export default function ClaimStatusBadge({ status, className = "" }) {
  const meta = getClaimStatusMeta(status);

  if (!meta) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset bg-gray-100 text-gray-600 ring-gray-500/20 dark:bg-gray-700/60 dark:text-gray-300 dark:ring-gray-500/30 ${className}`}
      >
        {status || "Unknown"}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.badge} ${className}`}
      title={meta.description}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
