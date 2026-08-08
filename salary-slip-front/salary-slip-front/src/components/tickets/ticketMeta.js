/**
 * Labels and tones for ticket status, priority and SLA.
 *
 * Every key here is a value the API can actually return —
 * App\Models\Ticket::STATUSES / ::PRIORITIES and the sla_status accessor. The
 * previous version carried extra states (draft, accepted, rejected), a fifth
 * "critical" priority and a per-department SLA table that no endpoint served, so
 * the UI offered filters that could only ever come back empty and printed
 * deadlines nobody had configured. Anything not backed by the API is gone.
 */

export const STATUS_META = {
  open:             { label: "Open",             tone: "blue",   badgeBg: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  assigned:         { label: "Assigned",         tone: "purple", badgeBg: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  in_progress:      { label: "In Progress",      tone: "indigo", badgeBg: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  waiting_employee: { label: "Waiting Employee", tone: "sky",    badgeBg: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  pending_approval: { label: "Pending Approval", tone: "amber",  badgeBg: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  escalated:        { label: "Escalated",        tone: "red",    badgeBg: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-semibold" },
  resolved:         { label: "Resolved",         tone: "green",  badgeBg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-bold" },
  closed:           { label: "Closed",           tone: "gray",   badgeBg: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  reopened:         { label: "Reopened",         tone: "amber",  badgeBg: "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
};

export const PRIORITY_META = {
  low:    { label: "Low",    tone: "gray",   colorCls: "text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300" },
  medium: { label: "Medium", tone: "blue",   colorCls: "text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400" },
  high:   { label: "High",   tone: "amber",  colorCls: "text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 font-semibold" },
  urgent: { label: "Urgent", tone: "orange", colorCls: "text-orange-700 bg-orange-100 dark:bg-orange-900/40 dark:text-orange-300 font-bold" },
};

/** Mirrors Ticket::getSlaStatusAttribute — including "none" for no target set. */
export const SLA_META = {
  on_track: { label: "On Track", cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400" },
  at_risk:  { label: "At Risk",  cls: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 font-semibold" },
  breached: { label: "Breached", cls: "text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-400 font-bold" },
  none:     { label: "No target", cls: "text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400" },
};

/** Lifecycle order, used for filter chips. */
export const STATUS_ORDER = [
  "open",
  "assigned",
  "in_progress",
  "waiting_employee",
  "pending_approval",
  "escalated",
  "resolved",
  "reopened",
  "closed",
];

export const PRIORITY_ORDER = ["low", "medium", "high", "urgent"];

export function statusMeta(status) {
  const key = (status || "").toLowerCase().replace(/\s+/g, "_");
  return STATUS_META[key] || { label: status || "Unknown", tone: "gray", badgeBg: "bg-gray-100 text-gray-700" };
}

export function priorityMeta(priority) {
  const key = (priority || "").toLowerCase();
  return PRIORITY_META[key] || { label: priority || "—", tone: "gray", colorCls: "text-gray-500" };
}

export function slaMeta(slaStatus) {
  const key = (slaStatus || "none").toLowerCase().replace(/\s+/g, "_");
  return SLA_META[key] || SLA_META.none;
}

/**
 * The countdown a ticket row shows.
 *
 * Reads the server's `sla_remaining` (already formatted) and falls back to a
 * dash — never to an invented duration, which is what the queue used to print
 * for every row that had no SLA data.
 */
export function slaLabel(ticket) {
  if (!ticket?.sla_due_at) return "—";
  return ticket.sla_remaining || "—";
}

/** Options for a department filter, taken from the tickets actually loaded. */
export function departmentsFrom(tickets = []) {
  return [...new Set(tickets.map((t) => t.department).filter(Boolean))].sort();
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a count the API may not have sent yet.
 *
 * Returns "—" for null/undefined instead of coercing to 0: "no data loaded" and
 * "genuinely zero" are different things, and showing 0 for the former is how the
 * dashboard came to display numbers nobody had measured.
 */
export function metric(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "—";
  return `${value}${suffix}`;
}
