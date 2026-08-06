/**
 * Labels, tones, and metadata for ticket status, priority, SLA, and permissions.
 */

export const STATUS_META = {
  open:                 { label: "Open",                 tone: "blue",   badgeBg: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  pending_approval:     { label: "Pending Approval",     tone: "orange", badgeBg: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  assigned:             { label: "Assigned",             tone: "purple", badgeBg: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  escalated:            { label: "Escalated",            tone: "red",    badgeBg: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-semibold animate-pulse" },
  in_progress:          { label: "In Progress",          tone: "indigo", badgeBg: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  waiting_for_employee: { label: "Waiting for Employee", tone: "sky",    badgeBg: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  resolved:             { label: "Resolved",             tone: "green",  badgeBg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  closed:               { label: "Closed",               tone: "gray",   badgeBg: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  rejected:             { label: "Rejected",             tone: "rose",   badgeBg: "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
  reopened:             { label: "Reopened",             tone: "amber",  badgeBg: "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
};

export const PRIORITY_META = {
  low:    { label: "Low",    tone: "gray",   colorCls: "text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300" },
  medium: { label: "Medium", tone: "blue",   colorCls: "text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400" },
  high:   { label: "High",   tone: "yellow", colorCls: "text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 font-semibold" },
  urgent: { label: "Urgent", tone: "red",    colorCls: "text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-300 font-bold animate-pulse" },
};

export const SLA_META = {
  on_track: { label: "On Track", tone: "green", cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400" },
  at_risk:  { label: "At Risk",  tone: "yellow", cls: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 font-semibold" },
  breached: { label: "Breached", tone: "red",    cls: "text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-400 font-bold" },
};

export const STATUS_ORDER = [
  "open",
  "pending_approval",
  "assigned",
  "in_progress",
  "waiting_for_employee",
  "escalated",
  "resolved",
  "closed",
  "rejected",
  "reopened",
];

export const PRIORITY_ORDER = ["low", "medium", "high", "urgent"];

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || "Unknown", tone: "gray", badgeBg: "bg-gray-100 text-gray-700" };
}

export function priorityMeta(priority) {
  return PRIORITY_META[priority] || { label: priority || "—", tone: "gray", colorCls: "text-gray-500" };
}

export function slaMeta(slaStatus) {
  return SLA_META[slaStatus] || { label: slaStatus || "On Track", tone: "green", cls: "text-emerald-600 bg-emerald-50" };
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

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Permissions matrix check for ticket controls */
export function getPermissions(role) {
  const r = (role || "").toLowerCase();
  const isSuperAdmin = r.includes("super_admin") || r.includes("superadmin") || r === "owner";
  const isAdmin = isSuperAdmin || r.includes("admin") || r.includes("hr");

  return {
    canRaiseTicket: true,
    canViewOwnTickets: true,
    canViewCompanyTickets: isAdmin,
    canViewAllCompanies: isSuperAdmin,
    canApproveTickets: isAdmin,
    canRejectTickets: isAdmin,
    canAssignReassign: isAdmin,
    canOverrideHierarchy: isSuperAdmin,
    canSkipApprovalLevels: isSuperAdmin,
    canBulkAction: isSuperAdmin,
    canConfigureCategories: isSuperAdmin,
    canConfigureSLA: isSuperAdmin,
    canViewAuditLogs: isSuperAdmin,
    canGenerateAllReports: isSuperAdmin,
    isSuperAdmin,
    isAdmin,
  };
}
