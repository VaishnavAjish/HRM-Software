import { Check, X, CircleSlash, Clock, CornerDownRight, Minus } from "lucide-react";
import { PERMISSION_STATES, stateMeta } from "./permissionStates";

const ICONS = {
  ALLOW: Check,
  DENY: X,
  CONDITIONAL: Clock,
  INHERITED_ALLOW: CornerDownRight,
  INHERITED_DENY: CircleSlash,
  NOT_ASSIGNED: Minus,
};

export default function PermissionStateIcon({ state, size = 14, className = "" }) {
  const Icon = ICONS[state] ?? ICONS.NOT_ASSIGNED;
  const meta = stateMeta(state);

  return (
    <Icon
      size={size}
      aria-label={meta.label}
      role="img"
      className={`${meta.tone} ${className}`}
    />
  );
}

export function PermissionStateLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {Object.entries(PERMISSION_STATES).map(([state, meta]) => (
        <li key={state} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <PermissionStateIcon state={state} size={14} />
          {meta.label}
        </li>
      ))}
    </ul>
  );
}
