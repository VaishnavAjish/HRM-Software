import { LEGEND_ORDER, STATES } from "./permissionStates";

/**
 * One cell of the permission matrix.
 *
 * Five states, not a checkbox. A boolean cannot express the difference
 * between "nobody granted this" and "somebody explicitly refused it", and
 * that difference is the whole point of an inheritance-aware matrix: only the
 * second survives a new grant arriving from a parent role.
 *
 * Accessibility notes, because this control is the screen:
 *  - the cell is a real <button>, so it is reachable and operable by keyboard;
 *  - its label names the permission, the action and the state, because a
 *    screen reader user has no column header in view when they land here;
 *  - state is carried by glyph as well as colour (see permissionStates.js).
 */
export default function PermissionCell({
  state = "NOT_ASSIGNED",
  permission,
  action,
  selected = false,
  dirty = false,
  disabled = false,
  onSelect,
  onToggle,
}) {
  const config = STATES[state] ?? STATES.NOT_ASSIGNED;
  const { Icon } = config;

  const describe = `${permission?.label ?? permission?.code ?? "permission"}, ${action}: ${config.label}`;
  const inherited = permission?.inheritedFrom?.length
    ? `\nInherited from: ${permission.inheritedFrom.join(", ")}`
    : "";

  return (
    <td className="px-1 py-0.5 text-center">
      <button
        type="button"
        disabled={disabled}
        aria-label={describe}
        title={
          disabled
            ? `${describe} — not applicable for this resource`
            : `${describe}\n${permission?.code ?? ""}${inherited}`
        }
        onClick={(event) => {
          onSelect?.();
          // Alt-click inspects without editing, so the matrix can be explored
          // safely; a plain click both selects and advances the state.
          if (!event.altKey) onToggle?.();
        }}
        className={[
          "relative inline-flex h-6 w-6 items-center justify-center rounded-full border transition",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1",
          "dark:focus-visible:ring-offset-gray-900",
          disabled ? "cursor-not-allowed opacity-30" : "hover:scale-110",
          config.className,
          selected ? "ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-gray-900" : "",
        ].join(" ")}
      >
        <Icon size={13} strokeWidth={3} aria-hidden="true" />
        {dirty && (
          <span
            aria-hidden="true"
            title="Unsaved"
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand-600 ring-2 ring-white dark:ring-gray-900"
          />
        )}
      </button>
    </td>
  );
}

/** Shared legend, so the matrix and the tree view describe states identically. */
export function StateLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-gray-200 px-4 py-3 text-xs dark:border-gray-700">
      {LEGEND_ORDER.map((key) => {
        const { Icon, label, className, legend } = STATES[key];

        return (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${className}`}>
              <Icon size={9} strokeWidth={3} aria-hidden="true" />
            </span>
            <span className={legend}>{label}</span>
          </span>
        );
      })}
    </div>
  );
}
