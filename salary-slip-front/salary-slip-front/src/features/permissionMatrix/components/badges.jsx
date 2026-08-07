import { ShieldAlert } from "lucide-react";
import { SENSITIVITY_META, STATE_META, TYPE_META } from "../models/permissionStates";

export function StateBadge({ state, pending = false, className = "" }) {
  const meta = STATE_META[state];

  if (!meta) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.badge} ${className}`}
      title={meta.description}
    >
      <span aria-hidden="true" className="font-semibold leading-none">{meta.glyph}</span>
      {meta.label}
      {pending && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-label="unsaved" />}
    </span>
  );
}

export function EffectiveBadge({ result, pending }) {
  if (pending) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30"
        title="Recalculated by the server when you save. The engine is the only thing that decides effective access."
      >
        <span aria-hidden="true">⋯</span> Pending
      </span>
    );
  }

  return <StateBadge state={result} />;
}

export function TypeBadge({ type }) {
  const meta = TYPE_META[type] ?? TYPE_META.action;

  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${meta.tone}`}>
      {meta.label}
    </span>
  );
}

export function SensitivityMark({ sensitivity }) {
  const meta = SENSITIVITY_META[sensitivity];

  if (!meta?.show) return null;

  return (
    <span title={`${meta.label} permission — changes are audited`} className={meta.tone}>
      <ShieldAlert size={13} aria-label={`${meta.label} permission`} />
    </span>
  );
}

export function StateLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {Object.entries(STATE_META).map(([key, meta]) => (
        <li key={key} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
          <span className="font-medium text-gray-700 dark:text-gray-300">{meta.label}</span>
          <span className="hidden sm:inline">— {meta.description}</span>
        </li>
      ))}
    </ul>
  );
}
