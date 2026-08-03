import { Check, X, Minus, Circle, CircleDot } from "lucide-react";

/**
 * The five permission states and how each one looks.
 *
 * Kept out of the component file so Fast Refresh keeps working: a module that
 * exports both components and constants cannot be hot-replaced cleanly.
 *
 * Every state pairs a distinct glyph with a distinct colour. Colour is never
 * the only channel that distinguishes them (WCAG 1.4.1), which is why Deny is
 * a cross rather than "the red one".
 */
export const STATES = {
  ALLOW: {
    key: "ALLOW",
    label: "Allow",
    Icon: Check,
    className: "bg-green-500 text-white border-green-500",
    legend: "text-green-600 dark:text-green-400",
  },
  DENY: {
    key: "DENY",
    label: "Deny",
    Icon: X,
    className: "bg-red-500 text-white border-red-500",
    legend: "text-red-600 dark:text-red-400",
  },
  INHERITED_ALLOW: {
    key: "INHERITED_ALLOW",
    label: "Inherited allow",
    Icon: Minus,
    className: "bg-blue-500 text-white border-blue-500",
    legend: "text-blue-600 dark:text-blue-400",
  },
  INHERITED_DENY: {
    key: "INHERITED_DENY",
    label: "Inherited deny",
    Icon: Minus,
    className: "bg-blue-400 text-white border-blue-400 ring-1 ring-red-400",
    legend: "text-blue-600 dark:text-blue-400",
  },
  CONDITIONAL: {
    key: "CONDITIONAL",
    label: "Conditional",
    Icon: CircleDot,
    className: "bg-white text-amber-600 border-amber-500 dark:bg-transparent",
    legend: "text-amber-600 dark:text-amber-400",
  },
  NOT_ASSIGNED: {
    key: "NOT_ASSIGNED",
    label: "Not assigned",
    Icon: Circle,
    className:
      "bg-transparent text-gray-300 border-gray-300 dark:text-gray-600 dark:border-gray-600",
    legend: "text-gray-400 dark:text-gray-500",
  },
};

/** Order shown in the legend, and the order a cell cycles through. */
export const LEGEND_ORDER = ["ALLOW", "DENY", "INHERITED_ALLOW", "CONDITIONAL", "NOT_ASSIGNED"];

/**
 * Click order.
 *
 * Deliberately excludes the two inherited states: those are not something an
 * administrator sets, they are something the engine reports. Clicking an
 * inherited cell overrides it with an explicit state, which is why the cycle
 * enters at ALLOW rather than mutating the inheritance.
 */
const CYCLE = ["ALLOW", "DENY", "CONDITIONAL", "NOT_ASSIGNED"];

export function nextState(current) {
  const index = CYCLE.indexOf(current);
  // An inherited cell (index -1) becomes an explicit ALLOW on first click.
  return CYCLE[(index + 1) % CYCLE.length] ?? "ALLOW";
}
