export const PERMISSION_STATES = {
  ALLOW: {
    label: "Allowed",
    description: "Granted directly on this role.",
    tone: "text-green-600 dark:text-green-400",
    surface: "bg-green-50 dark:bg-green-900/20",
  },
  DENY: {
    label: "Denied",
    description: "Explicitly denied on this role. A deny always beats an allow.",
    tone: "text-red-600 dark:text-red-400",
    surface: "bg-red-50 dark:bg-red-900/20",
  },
  CONDITIONAL: {
    label: "Conditional",
    description: "Granted only while the attached conditions hold.",
    tone: "text-amber-600 dark:text-amber-400",
    surface: "bg-amber-50 dark:bg-amber-900/20",
  },
  INHERITED_ALLOW: {
    label: "Inherited allow",
    description: "Granted by a parent role. Change it there, or override it here.",
    tone: "text-brand-500 dark:text-brand-400",
    surface: "bg-brand-50 dark:bg-brand-900/20",
  },
  INHERITED_DENY: {
    label: "Inherited deny",
    description: "Denied by a parent role and cannot be overridden here.",
    tone: "text-gray-500 dark:text-gray-400",
    surface: "bg-gray-100 dark:bg-gray-700/40",
  },
  NOT_ASSIGNED: {
    label: "Not assigned",
    description: "This role holds no grant for the permission.",
    tone: "text-gray-400 dark:text-gray-500",
    surface: "",
  },
};

/*
 * Clicking a cell walks this cycle. INHERITED_ALLOW enters the cycle as an
 * explicit override; INHERITED_DENY is absent because a parent deny cannot be
 * cleared from a child role.
 */
export const NEXT_STATE = {
  NOT_ASSIGNED: "ALLOW",
  ALLOW: "CONDITIONAL",
  CONDITIONAL: "DENY",
  DENY: "NOT_ASSIGNED",
  INHERITED_ALLOW: "DENY",
};

export const EDITABLE_STATES = Object.keys(NEXT_STATE);

export function stateMeta(state) {
  return PERMISSION_STATES[state] ?? PERMISSION_STATES.NOT_ASSIGNED;
}
