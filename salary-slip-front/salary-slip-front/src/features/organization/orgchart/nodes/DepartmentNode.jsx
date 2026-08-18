import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Building2, ChevronDown, ChevronRight, Focus, Loader2, Plus, UserRound } from "lucide-react";
import { CARD_BASE, statusDotClass } from "./nodeStyles";

function DepartmentNode({ data, selected, sourcePosition, targetPosition }) {
  const collapsible = data.hasChildren || data.hasHiddenChildren;

  return (
    <div
      className={`${CARD_BASE} w-[240px] ${selected ? "border-brand-500 ring-2 ring-brand-200 dark:ring-brand-900" : "border-gray-200 dark:border-gray-700"}`}
    >
      <Handle type="target" position={targetPosition || Position.Top} className="!bg-gray-400" />
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
          <Building2 size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{data.name}</p>
            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${statusDotClass(data.isActive)}`} />
          </div>
          <p className="truncate text-xs capitalize text-gray-500 dark:text-gray-400">{data.title || "Department"}</p>
        </div>
        {collapsible && (
          <button
            type="button"
            title={data.loadingChildren ? "Loading…" : data.isCollapsed ? "Load and expand" : "Collapse"}
            disabled={data.loadingChildren}
            onClick={(e) => { e.stopPropagation(); data.onToggleCollapse?.(data.id); }}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-60 dark:hover:bg-gray-700"
          >
            {data.loadingChildren ? (
              <Loader2 size={14} className="animate-spin" />
            ) : data.isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{data.employeeCount ?? 0} employees</span>
        <span>{data.metadata?.positionCount ?? 0} designations</span>
      </div>

      {data.type === "department" && (
        data.metadata?.managerName ? (
          <div className="mt-1.5 flex items-center gap-1 truncate text-xs text-gray-500 dark:text-gray-400">
            <UserRound size={11} className="flex-shrink-0" />
            <span className="truncate">Head: {data.metadata.managerName}</span>
          </div>
        ) : (
          <p className="mt-1.5 text-xs italic text-amber-600 dark:text-amber-400">No department head assigned</p>
        )
      )}

      <div className="mt-2 flex items-center gap-1.5">
        {data.onQuickAdd && (
          <button
            type="button"
            title="Add under this unit"
            onClick={(e) => { e.stopPropagation(); data.onQuickAdd(data); }}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 py-1 text-xs text-gray-500 hover:border-brand-400 hover:text-brand-600 dark:border-gray-600 dark:text-gray-400"
          >
            <Plus size={12} /> Add
          </button>
        )}
        {data.hasChildren && data.onFocus && (
          <button
            type="button"
            title="View sub-chart — focus on just this department"
            onClick={(e) => { e.stopPropagation(); data.onFocus(data.id); }}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 py-1 text-xs text-gray-500 hover:border-brand-400 hover:text-brand-600 dark:border-gray-600 dark:text-gray-400"
          >
            <Focus size={12} /> Sub-chart
          </button>
        )}
      </div>

      <Handle type="source" position={sourcePosition || Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}

export default memo(DepartmentNode);
