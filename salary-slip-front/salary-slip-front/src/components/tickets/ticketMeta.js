/**
 * Labels and tones for ticket status and priority.
 *
 * Kept in one module because the same ticket is rendered on the employee list,
 * the admin queue and the detail drawer — three places that must not disagree
 * about what "in_progress" is called or which colour "urgent" is.
 *
 * The keys are the server's values (App\Models\Ticket::STATUSES / PRIORITIES);
 * nothing here invents a state the API cannot return.
 */

export const STATUS_META = {
  open:        { label: "Open",        tone: "blue" },
  assigned:    { label: "Assigned",    tone: "purple" },
  in_progress: { label: "In Progress", tone: "yellow" },
  resolved:    { label: "Resolved",    tone: "green" },
  closed:      { label: "Closed",      tone: "gray" },
  reopened:    { label: "Reopened",    tone: "red" },
};

export const PRIORITY_META = {
  low:    { label: "Low",    tone: "gray" },
  medium: { label: "Medium", tone: "blue" },
  high:   { label: "High",   tone: "yellow" },
  urgent: { label: "Urgent", tone: "red" },
};

/** Order used by the status filter chips, matching the lifecycle. */
export const STATUS_ORDER = ["open", "assigned", "in_progress", "resolved", "reopened", "closed"];

export const PRIORITY_ORDER = ["low", "medium", "high", "urgent"];

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || "Unknown", tone: "gray" };
}

export function priorityMeta(priority) {
  return PRIORITY_META[priority] || { label: priority || "—", tone: "gray" };
}

/**
 * Short, human date for list rows and message headers.
 *
 * Returns "" rather than "Invalid Date" for a null//unparseable value, so an
 * absent timestamp renders as nothing instead of shouting at the user.
 */
export function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
