/**
 * Enterprise Helpdesk Labels, Hierarchy Levels, SLA Metadata, and RBAC matrix.
 */

export const DEPARTMENTS = [
  "HR",
  "Payroll",
  "IT",
  "Administration",
  "Finance",
  "Accounts",
  "Legal",
  "Facilities",
  "Operations",
];

export const HIERARCHY_LEVELS = [
  { level: 1, name: "Level 1: Executive / Desk Agent", desc: "First responder for newly created tickets" },
  { level: 2, name: "Level 2: Senior Executive", desc: "Escalated for unresolved L1 operational issues" },
  { level: 3, name: "Level 3: Team Lead", desc: "Technical lead & team supervisor oversight" },
  { level: 4, name: "Level 4: Department Manager", desc: "Managerial intervention & resource allocation" },
  { level: 5, name: "Level 5: Department Head", desc: "Head of Department authorization" },
  { level: 6, name: "Level 6: HR Admin", desc: "Company-wide HR monitoring & policy override" },
  { level: 7, name: "Level 7: Super Admin", desc: "Unrestricted system control & final authority" },
];

export const STATUS_META = {
  draft:                { label: "Draft",                tone: "gray",   badgeBg: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  open:                 { label: "Open",                 tone: "blue",   badgeBg: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  assigned:             { label: "Assigned",             tone: "purple", badgeBg: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  accepted:             { label: "Accepted",             tone: "cyan",   badgeBg: "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  in_progress:          { label: "In Progress",          tone: "indigo", badgeBg: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  waiting_for_employee: { label: "Waiting Employee",     tone: "sky",    badgeBg: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  pending_approval:     { label: "Pending Approval",     tone: "amber",  badgeBg: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  escalated:            { label: "Escalated",            tone: "red",    badgeBg: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-semibold animate-pulse" },
  resolved:             { label: "Resolved",             tone: "green",  badgeBg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-bold" },
  closed:               { label: "Closed",               tone: "gray",   badgeBg: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  rejected:             { label: "Rejected",             tone: "rose",   badgeBg: "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
  reopened:             { label: "Reopened",             tone: "amber",  badgeBg: "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
};

export const PRIORITY_META = {
  low:      { label: "Low",      tone: "gray",   colorCls: "text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300" },
  medium:   { label: "Medium",   tone: "blue",   colorCls: "text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400" },
  high:     { label: "High",     tone: "amber",  colorCls: "text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 font-semibold" },
  urgent:   { label: "Urgent",   tone: "orange", colorCls: "text-orange-700 bg-orange-100 dark:bg-orange-900/40 dark:text-orange-300 font-bold" },
  critical: { label: "Critical", tone: "red",    colorCls: "text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-300 font-extrabold animate-pulse" },
};

export const SLA_META = {
  on_track: { label: "On Track", tone: "green", cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400" },
  at_risk:  { label: "At Risk",  tone: "yellow", cls: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 font-semibold" },
  breached: { label: "Breached", tone: "red",    cls: "text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-400 font-bold animate-pulse" },
};

export const DEFAULT_DEPARTMENT_SLAS = {
  IT: { low: "48 Hours", medium: "24 Hours", high: "8 Hours", urgent: "4 Hours", critical: "1 Hour" },
  Payroll: { low: "72 Hours", medium: "36 Hours", high: "12 Hours", urgent: "6 Hours", critical: "2 Hours" },
  HR: { low: "48 Hours", medium: "24 Hours", high: "12 Hours", urgent: "6 Hours", critical: "2 Hours" },
  Finance: { low: "72 Hours", medium: "48 Hours", high: "18 Hours", urgent: "8 Hours", critical: "3 Hours" },
  Accounts: { low: "72 Hours", medium: "48 Hours", high: "18 Hours", urgent: "8 Hours", critical: "3 Hours" },
  Administration: { low: "48 Hours", medium: "24 Hours", high: "12 Hours", urgent: "6 Hours", critical: "2 Hours" },
  Legal: { low: "96 Hours", medium: "48 Hours", high: "24 Hours", urgent: "12 Hours", critical: "4 Hours" },
  Facilities: { low: "48 Hours", medium: "24 Hours", high: "8 Hours", urgent: "4 Hours", critical: "1 Hour" },
  Operations: { low: "48 Hours", medium: "24 Hours", high: "12 Hours", urgent: "6 Hours", critical: "2 Hours" },
};

export const STATUS_ORDER = [
  "draft",
  "open",
  "assigned",
  "accepted",
  "in_progress",
  "waiting_for_employee",
  "pending_approval",
  "escalated",
  "resolved",
  "closed",
  "rejected",
  "reopened",
];

export const PRIORITY_ORDER = ["low", "medium", "high", "urgent", "critical"];

export function statusMeta(status) {
  const key = (status || "").toLowerCase().replace(/\s+/g, "_");
  return STATUS_META[key] || { label: status || "Unknown", tone: "gray", badgeBg: "bg-gray-100 text-gray-700" };
}

export function priorityMeta(priority) {
  const key = (priority || "").toLowerCase();
  return PRIORITY_META[key] || { label: priority || "—", tone: "gray", colorCls: "text-gray-500" };
}

export function slaMeta(slaStatus) {
  const key = (slaStatus || "").toLowerCase().replace(/\s+/g, "_");
  return SLA_META[key] || { label: slaStatus || "On Track", tone: "green", cls: "text-emerald-600 bg-emerald-50" };
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

/** Permissions matrix check for ticket controls */
export function getPermissions(role) {
  const r = (role || "").toLowerCase();
  const isSuperAdmin = r.includes("super_admin") || r.includes("superadmin") || r === "owner";
  const isHr = r.includes("hr");
  const isAdmin = isSuperAdmin || isHr || r.includes("admin");

  return {
    canRaiseTicket: true,
    canViewOwnTickets: true,
    canViewCompanyTickets: isAdmin,
    canViewAllCompanies: isSuperAdmin,
    canApproveTickets: isAdmin,
    canRejectTickets: isAdmin,
    canAssignReassign: isAdmin,
    canEscalateManual: true,
    canOverrideHierarchy: isSuperAdmin || isHr,
    canSkipApprovalLevels: isSuperAdmin,
    canBulkAction: isSuperAdmin || isHr,
    canConfigureCategories: isSuperAdmin || isHr,
    canConfigureSLA: isSuperAdmin || isHr,
    canViewAuditLogs: isSuperAdmin || isHr,
    canGenerateAllReports: isSuperAdmin || isHr,
    isSuperAdmin,
    isHr,
    isAdmin,
  };
}
