const TONES = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  APPROVED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  REVOKED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  EXPIRED: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  SKIPPED: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

export default function StatusBadge({ status }) {
  const tone = TONES[status] ?? TONES.EXPIRED;
  const label = String(status ?? "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

export function ApprovalChain({ approvals = [] }) {
  if (!approvals.length) return <span className="text-xs text-gray-400">—</span>;

  return (
    <ol className="flex flex-wrap items-center gap-1">
      {approvals.map((step, index) => (
        <li key={step.step} className="flex items-center gap-1">
          {index > 0 && <span aria-hidden="true" className="text-gray-300">›</span>}
          <span
            className="text-xs text-gray-600 dark:text-gray-400"
            title={step.decisionReason || undefined}
          >
            {step.approverType.replace(/_/g, " ").toLowerCase()}
          </span>
          <StatusBadge status={step.status} />
        </li>
      ))}
    </ol>
  );
}
