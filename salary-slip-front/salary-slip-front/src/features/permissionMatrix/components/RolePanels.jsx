import { GitBranch, History, ShieldCheck } from "lucide-react";
import Card from "../../../components/ui/Card";

const SEGMENTS = [
  { key: "allow", label: "Allowed", color: "#16a34a" },
  { key: "deny", label: "Denied", color: "#dc2626" },
  { key: "conditional", label: "Conditional", color: "#f59e0b" },
  { key: "inheritedAllow", label: "Inherited Allow", color: "#2563eb" },
  { key: "inheritedDeny", label: "Inherited Deny", color: "#7c3aed" },
  { key: "notAssigned", label: "Not Assigned", color: "#9ca3af" },
];

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function RoleSummaryCard({ summary, dirty }) {
  if (!summary) return null;

  const total = summary.total || 1;

  const arcs = SEGMENTS.reduce((acc, segment) => {
    const value = summary[segment.key] ?? 0;
    const length = (value / total) * CIRCUMFERENCE;
    const offset = acc.length === 0 ? 0 : acc[acc.length - 1].offset + acc[acc.length - 1].length;

    return [...acc, { ...segment, value, length, offset }];
  }, []);

  const percent = (value) => Math.round((value / total) * 100);

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
        <ShieldCheck size={16} className="text-brand-500" aria-hidden="true" /> Role Summary
        {dirty && (
          <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            includes unsaved
          </span>
        )}
      </h2>

      <div className="mt-4 flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`${summary.total} permissions in this matrix`}>
            <circle cx="66" cy="66" r={RADIUS} fill="none" strokeWidth="14" className="stroke-gray-100 dark:stroke-gray-700" />
            {arcs.filter((arc) => arc.value > 0).map((arc) => (
              <circle
                key={arc.key}
                cx="66" cy="66" r={RADIUS} fill="none" strokeWidth="14"
                stroke={arc.color}
                strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                strokeDashoffset={-arc.offset}
                transform="rotate(-90 66 66)"
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-gray-900 dark:text-white">{summary.total}</span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400">Total</span>
          </div>
        </div>

        <dl className="min-w-0 flex-1 space-y-1">
          {arcs.map((arc) => (
            <div key={arc.key} className="flex items-center gap-2 text-xs">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: arc.color }} />
              <dt className="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-400">{arc.label}</dt>
              <dd className="font-semibold text-gray-900 dark:text-gray-100">{arc.value}</dd>
              <dd className="w-10 text-right text-[11px] text-gray-400">{percent(arc.value)}%</dd>
            </div>
          ))}
        </dl>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
        {[
          ["Effective allow", summary.effectiveAllow, "text-green-600 dark:text-green-400"],
          ["Effective deny", summary.effectiveDeny, "text-red-600 dark:text-red-400"],
          ["Sensitive allowed", summary.sensitiveAllowed, "text-amber-600 dark:text-amber-400"],
          ["Critical allowed", summary.criticalAllowed, "text-red-600 dark:text-red-400"],
          ["Suppressed by parent", summary.suppressedByParent, "text-violet-600 dark:text-violet-400"],
          ["Direct denies", summary.directDeny, "text-gray-600 dark:text-gray-300"],
        ].map(([label, value, tone]) => (
          <div key={label}>
            <dt className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
            <dd className={`text-sm font-semibold ${tone}`}>{value ?? 0}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function InheritanceTreeCard({ chain, roleName }) {
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
        <GitBranch size={16} className="text-brand-500" aria-hidden="true" /> Inheritance Tree
      </h2>

      {(!chain || chain.length === 0) ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          No parent roles.<br />This role does not inherit from any parent role.
        </p>
      ) : (
        <ol className="mt-3 space-y-1">
          {[...chain].reverse().map((parent, index) => (
            <li key={parent.id} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <span aria-hidden="true" style={{ paddingLeft: index * 12 }} className="text-gray-300 dark:text-gray-600">
                {index > 0 ? "↳" : ""}
              </span>
              <span className="font-medium">{parent.name}</span>
              <span className="text-[10px] text-gray-400">{parent.roleType}</span>
            </li>
          ))}
          <li className="flex items-center gap-2 text-xs text-brand-700 dark:text-brand-300">
            <span aria-hidden="true" style={{ paddingLeft: chain.length * 12 }} className="text-gray-300 dark:text-gray-600">↳</span>
            <span className="font-semibold">{roleName}</span>
          </li>
        </ol>
      )}
    </Card>
  );
}

export function RecentChangesCard({ changes }) {
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
        <History size={16} className="text-brand-500" aria-hidden="true" /> Recent Changes
      </h2>

      {(!changes || changes.length === 0) ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">No permission changes recorded yet.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {changes.map((change) => {
            const allowed = change.newState === "ALLOW";
            const removed = change.newState === "NOT_ASSIGNED";

            return (
              <li key={change.eventId} className="flex gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 shrink-0 ${
                    allowed ? "text-green-600" : removed ? "text-gray-400" : "text-red-600"
                  }`}
                >
                  {allowed ? "✓" : removed ? "–" : "✕"}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-gray-900 dark:text-gray-100">
                    <span className="font-medium">
                      {allowed ? "Allowed" : removed ? "Unassigned" : "Denied"}
                    </span>{" "}
                    <code className="font-mono text-[11px] text-gray-600 dark:text-gray-400">
                      {change.permissionCode ?? change.subjectLabel}
                    </code>
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {change.actorName || "System"} · {new Date(change.changedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
