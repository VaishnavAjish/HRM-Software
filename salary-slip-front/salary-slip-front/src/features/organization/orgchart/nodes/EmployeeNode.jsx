import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Plus } from "lucide-react";
import { CARD_BASE, initials, statusDotClass } from "./nodeStyles";

/**
 * Renders both plain employees and managers — the reference design treats
 * "manager" as just an employee with visible direct reports, not a
 * separate entity, so one component covers both.
 */
function EmployeeNode({ data, selected, sourcePosition, targetPosition }) {
  const reportCount = data.reportCount || 0;
  const isManager = reportCount > 0;

  return (
    <div
      className={`${CARD_BASE} w-[240px] ${selected ? "border-brand-500 ring-2 ring-brand-200 dark:ring-brand-900" : "border-gray-200 dark:border-gray-700"}`}
    >
      <Handle type="target" position={targetPosition || Position.Top} className="!bg-gray-400" />
      <div className="flex items-start gap-2.5">
        <div className="relative flex-shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            {initials(data.name)}
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-gray-800 ${statusDotClass(data.isActive)}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{data.name}</p>
            {data.code && <span className="flex-shrink-0 text-[10px] text-gray-400">#{data.code}</span>}
          </div>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{data.title || "Employee"}</p>
          {data.metadata?.department && (
            <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">{data.metadata.department}</p>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        {isManager && (
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {reportCount} direct report{reportCount === 1 ? "" : "s"}
          </span>
        )}
        {data.onQuickAdd && (
          <button
            type="button"
            title="Add a direct report"
            onClick={(e) => { e.stopPropagation(); data.onQuickAdd(data); }}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-brand-600 dark:hover:bg-gray-700"
          >
            <Plus size={13} />
          </button>
        )}
      </div>

      <Handle type="source" position={sourcePosition || Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}

export default memo(EmployeeNode);
