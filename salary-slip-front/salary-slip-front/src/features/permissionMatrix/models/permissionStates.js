export const STATE = {
  ALLOW: "ALLOW",
  DENY: "DENY",
  CONDITIONAL: "CONDITIONAL",
  NOT_ASSIGNED: "NOT_ASSIGNED",
};

export const SETTABLE_STATES = [STATE.ALLOW, STATE.DENY, STATE.CONDITIONAL, STATE.NOT_ASSIGNED];

/**
 * States that cannot be set until something else exists.
 *
 * CONDITIONAL needs a condition, and there is no condition editor yet. The
 * backend now refuses a conditionless CONDITIONAL — before that it stored one
 * and read it back as ALLOW, silently widening access — so offering the option
 * here would only produce a draft that can never be saved. It is shown and
 * disabled with the reason rather than hidden, so the capability is visibly
 * pending rather than apparently absent.
 */
export const BLOCKED_STATES = {
  [STATE.CONDITIONAL]: "Condition editor is not available yet.",
};

/**
 * How each state is offered in the picker.
 *
 * `summary` is the short line under the label in the open menu; `help` is the
 * fuller sentence used for tooltips and screen-reader description. Kept here so
 * the trigger, the menu and the legend cannot drift apart — a permission screen
 * that labels the same state two ways is a screen people misread.
 *
 * `unavailableReason` states an application capability that does not exist yet,
 * deliberately not "contact your administrator": no permission grant would make
 * Conditional selectable, so that phrasing would send people to ask for
 * something nobody can give them.
 */
export const STATE_OPTIONS = [
  {
    value: STATE.ALLOW,
    summary: "Grant access",
    help: "Grant this permission directly on this role.",
    tone: "success",
  },
  {
    value: STATE.DENY,
    summary: "Block access",
    help: "Block this permission directly. Deny wins over any allow.",
    tone: "danger",
  },
  {
    value: STATE.CONDITIONAL,
    summary: "Rules-based access",
    help: "Granted only while its conditions hold.",
    tone: "warning",
    unavailableReason: "Conditional access requires a condition. The condition editor will be available in a later authorization phase.",
  },
  {
    value: STATE.NOT_ASSIGNED,
    summary: "No direct decision",
    help: "No direct decision on this role. Inherited or system rules may still apply.",
    tone: "neutral",
  },
];

/** Tone → classes, so the picker never hardcodes a colour of its own. */
export const STATE_TONE = {
  success: {
    icon: "text-green-600 dark:text-green-400",
    selected: "bg-green-50 dark:bg-green-500/10",
  },
  danger: {
    icon: "text-red-600 dark:text-red-400",
    selected: "bg-red-50 dark:bg-red-500/10",
  },
  warning: {
    icon: "text-amber-600 dark:text-amber-400",
    selected: "bg-amber-50 dark:bg-amber-500/10",
  },
  neutral: {
    icon: "text-gray-400 dark:text-gray-500",
    selected: "bg-gray-100 dark:bg-gray-700/60",
  },
};

/**
 * Every state carries a glyph as well as a colour. Colour alone fails for
 * colour-blind administrators and in printed exports, and this screen is the one
 * place where misreading a status changes who can reach payroll.
 */
export const STATE_META = {
  ALLOW: {
    label: "Allow",
    glyph: "✓",
    description: "Explicitly granted on this role.",
    badge: "bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/30",
    dot: "bg-green-500",
  },
  DENY: {
    label: "Deny",
    glyph: "✕",
    description: "Explicitly denied. Deny wins over any allow.",
    badge: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30",
    dot: "bg-red-500",
  },
  CONDITIONAL: {
    label: "Conditional",
    glyph: "◐",
    description: "Granted only while its conditions hold.",
    badge: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
    dot: "bg-amber-500",
  },
  NOT_ASSIGNED: {
    label: "Not Assigned",
    glyph: "–",
    description: "Nothing grants it. The system denies by default.",
    badge: "bg-gray-100 text-gray-600 ring-gray-500/20 dark:bg-gray-700/60 dark:text-gray-300 dark:ring-gray-500/30",
    dot: "bg-gray-400",
  },
};

export const EFFECTIVE_META = {
  ALLOW: STATE_META.ALLOW,
  DENY: STATE_META.DENY,
  CONDITIONAL: STATE_META.CONDITIONAL,
};

export const SOURCE_LABEL = {
  DIRECT: "Direct role assignment",
  INHERITED: "Inherited from a parent role",
  PARENT: "Suppressed by an ancestor",
  DEFAULT: "Default deny",
};

export const REASON_LABEL = {
  EXPLICIT_DENY: "Explicit deny on this role.",
  INHERITED_DENY: "Denied by a parent role.",
  PARENT_DENIED: "A required parent permission is denied.",
  EXPLICIT_ALLOW: "Granted directly on this role.",
  INHERITED_ALLOW: "Granted by a parent role.",
  CONDITIONAL_ALLOW: "Granted while its conditions hold.",
  DEFAULT_DENY: "Nothing grants it, and the system denies by default.",
};

export const TYPE_META = {
  module: { label: "Module", tone: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" },
  page: { label: "Page", tone: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300" },
  section: { label: "Section", tone: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300" },
  feature: { label: "Feature", tone: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300" },
  action: { label: "Action", tone: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200" },
  filter: { label: "Filter", tone: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300" },
  column: { label: "Column", tone: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300" },
  field: { label: "Field", tone: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300" },
  api: { label: "API", tone: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
};

export const SENSITIVITY_META = {
  NORMAL: { label: "Normal", tone: "text-gray-400 dark:text-gray-500", show: false },
  SENSITIVE: { label: "Sensitive", tone: "text-amber-600 dark:text-amber-400", show: true },
  PRIVILEGED: { label: "Privileged", tone: "text-orange-600 dark:text-orange-400", show: true },
  CRITICAL: { label: "Critical", tone: "text-red-600 dark:text-red-400", show: true },
};

export const STATE_FILTERS = [
  { value: "ALL", label: "All states" },
  { value: "ALLOW", label: "Allowed" },
  { value: "DENY", label: "Denied" },
  { value: "CONDITIONAL", label: "Conditional" },
  { value: "INHERITED", label: "Inherited" },
  { value: "NOT_ASSIGNED", label: "Not assigned" },
];

export const TYPE_FILTERS = [
  { value: "ALL", label: "All types" },
  ...Object.entries(TYPE_META).map(([value, meta]) => ({ value, label: meta.label })),
];

export const SENSITIVITY_FILTERS = [
  { value: "ALL", label: "All sensitivity" },
  { value: "NORMAL", label: "Normal" },
  { value: "SENSITIVE", label: "Sensitive" },
  { value: "PRIVILEGED", label: "Privileged" },
  { value: "CRITICAL", label: "Critical" },
];
