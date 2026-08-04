import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import PermissionStateIcon from "./PermissionStateIcon";
import { stateMeta } from "./permissionStates";

function Cell({ cell, state, changed, selected, readOnly, onSelect, onCycle }) {
  if (!cell) {
    return <td className="border-l border-gray-100 px-2 py-2 text-center dark:border-gray-700/60" />;
  }

  const meta = stateMeta(state);
  const locked = readOnly || state === "INHERITED_DENY";

  return (
    <td className="border-l border-gray-100 p-0 dark:border-gray-700/60">
      <button
        type="button"
        aria-label={`${cell.permissionCode}: ${meta.label}`}
        aria-pressed={selected}
        title={`${cell.permissionCode} — ${meta.label}`}
        onClick={() => {
          onSelect(cell);
          if (!locked) onCycle(cell, state);
        }}
        className={`flex h-9 w-full items-center justify-center transition-colors ${meta.surface} ${
          selected ? "ring-2 ring-inset ring-brand-500" : ""
        } ${locked ? "cursor-not-allowed opacity-70" : "hover:bg-gray-100 dark:hover:bg-gray-700"}`}
      >
        <span className="relative flex items-center">
          <PermissionStateIcon state={state} size={16} />
          {changed && (
            <span
              aria-hidden="true"
              className="absolute -right-2 -top-1 h-1.5 w-1.5 rounded-full bg-amber-500"
            />
          )}
          {locked && !readOnly && <Lock size={10} className="ml-1 text-gray-400" />}
        </span>
      </button>
    </td>
  );
}

export default function MatrixGrid({
  matrix,
  expanded,
  onToggleModule,
  selectedCell,
  onSelectCell,
  onCycleCell,
  pendingChanges,
  readOnly = false,
}) {
  const actions = matrix.actions ?? [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-white dark:bg-gray-800">
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th scope="col" className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">
              Resource
            </th>
            {actions.map((action) => (
              <th
                key={action.code}
                scope="col"
                title={action.category}
                className="border-l border-gray-100 px-2 py-3 text-center text-xs font-semibold text-gray-600 dark:border-gray-700/60 dark:text-gray-300"
              >
                {action.name}
                {action.isSensitive && <span className="ml-0.5 text-amber-500">*</span>}
              </th>
            ))}
          </tr>
        </thead>

        {matrix.modules.map((module) => {
          const open = expanded.has(module.code);

          return (
            <tbody key={module.code}>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
                <th
                  scope="colgroup"
                  colSpan={actions.length + 1}
                  className="px-2 py-2 text-left"
                >
                  <button
                    type="button"
                    onClick={() => onToggleModule(module.code)}
                    aria-expanded={open}
                    className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100"
                  >
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {module.name}
                    <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                      {module.resources.length} resource(s)
                    </span>
                  </button>
                </th>
              </tr>

              {open && module.resources.map((resource) => (
                <tr key={resource.code} className="border-b border-gray-100 dark:border-gray-700/60">
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <span className={`text-gray-900 dark:text-gray-100 ${resource.parentCode ? "pl-4" : ""}`}>
                      {resource.name}
                    </span>
                    {resource.isSensitive && (
                      <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">sensitive</span>
                    )}
                    <span className="block text-xs text-gray-400">{resource.code}</span>
                  </th>

                  {actions.map((action) => {
                    const cell = resource.cells?.[action.code];
                    const enriched = cell ? { ...cell, resource, action } : null;
                    const state = cell
                      ? pendingChanges.get(cell.permissionCode) ?? cell.state
                      : "NOT_ASSIGNED";

                    return (
                      <Cell
                        key={`${resource.code}-${action.code}`}
                        cell={enriched}
                        state={state}
                        changed={Boolean(cell && pendingChanges.has(cell.permissionCode))}
                        selected={Boolean(cell && selectedCell?.permissionCode === cell.permissionCode)}
                        readOnly={readOnly}
                        onSelect={onSelectCell}
                        onCycle={onCycleCell}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
