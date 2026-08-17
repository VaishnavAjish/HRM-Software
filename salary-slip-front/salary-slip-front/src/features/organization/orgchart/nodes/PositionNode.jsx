import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Briefcase } from "lucide-react";
import { CARD_BASE } from "./nodeStyles";

function PositionNode({ data, selected, sourcePosition, targetPosition }) {
  const approved = data.approvedHeadcount ?? 0;
  const filled = data.employeeCount ?? 0;
  const vacant = data.vacancy ?? Math.max(0, approved - filled);
  const isVacant = vacant > 0 && filled === 0;

  return (
    <div
      className={`${CARD_BASE} w-[240px] border-dashed ${selected ? "border-brand-500 ring-2 ring-brand-200 dark:ring-brand-900" : isVacant ? "border-amber-300 dark:border-amber-700" : "border-gray-200 dark:border-gray-700"}`}
    >
      <Handle type="target" position={targetPosition || Position.Top} className="!bg-gray-400" />
      <div className="flex items-start gap-2">
        <Briefcase size={15} className={isVacant ? "text-amber-500" : "text-gray-400"} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{data.name}</p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{data.metadata?.organizationUnitName || "Position"}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={isVacant ? "font-semibold text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"}>
          {isVacant ? "Vacant" : `Filled ${filled} / ${approved}`}
        </span>
        {vacant > 0 && !isVacant && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {vacant} open
          </span>
        )}
      </div>
      <Handle type="source" position={sourcePosition || Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}

export default memo(PositionNode);
