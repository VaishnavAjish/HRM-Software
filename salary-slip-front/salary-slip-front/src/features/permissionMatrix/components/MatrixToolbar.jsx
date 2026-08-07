import { useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Search, SlidersHorizontal, Wand2 } from "lucide-react";
import Button from "../../../components/ui/Button";
import {
  SENSITIVITY_FILTERS, SETTABLE_STATES, STATE_FILTERS, STATE_META, TYPE_FILTERS,
} from "../models/permissionStates";
import useDismissable from "../hooks/useDismissable";

const selectClass =
  "rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200";

export default function MatrixToolbar({
  filters, onFilterChange, onExpandAll, onCollapseAll, onBulkApply,
  selectedNodes, activeFilterCount, onClearFilters, editable,
}) {
  const [showFilters, setShowFilters] = useState(false);
  const { open: bulkOpen, setOpen: setBulkOpen, ref: bulkRef, toggle: toggleBulk } = useDismissable();

  // Bulk edits act on the rows the administrator checked, never on everything
  // that happens to be visible — a filter change must not silently widen the
  // blast radius of the next bulk action.
  const affected = selectedNodes.length;

  const applyBulk = (state) => {
    setBulkOpen(false);

    if (affected === 0) return;

    const critical = selectedNodes.filter((node) => node.sensitivity === "CRITICAL").length;

    const message = state === "ALLOW" && critical > 0
      ? `You are about to ALLOW ${affected} permission(s) for this role, including ${critical} critical one(s). Continue?`
      : `You are about to set ${affected} permission(s) to ${STATE_META[state].label}. Continue?`;

    if (!window.confirm(message)) return;

    onBulkApply(state);
  };

  return (
    <div className="space-y-3 border-b border-gray-200 p-4 dark:border-gray-700">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[240px] flex-1">
          <span className="sr-only">Search modules, pages, features, actions, filters, columns</span>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Search modules, pages, features, actions, filters, columns…"
            value={filters.search}
            onChange={(event) => onFilterChange({ search: event.target.value })}
          />
        </label>

        <Button variant="secondary" size="sm" onClick={onExpandAll}>
          <ChevronsUpDown size={15} className="mr-1.5" /> Expand All
        </Button>
        <Button variant="secondary" size="sm" onClick={onCollapseAll}>
          <ChevronsDownUp size={15} className="mr-1.5" /> Collapse All
        </Button>

        <Button
          variant={showFilters ? "primary" : "secondary"}
          size="sm"
          onClick={() => setShowFilters((open) => !open)}
        >
          <SlidersHorizontal size={15} className="mr-1.5" /> Filters
          {activeFilterCount > 0 && (
            <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </Button>

        <div className="relative" ref={bulkRef}>
          <Button
            variant="secondary"
            size="sm"
            disabled={!editable || affected === 0}
            onClick={toggleBulk}
          >
            <Wand2 size={15} className="mr-1.5" />
            Bulk Actions{affected > 0 ? ` (${affected})` : ""}
          </Button>

          {bulkOpen && editable && affected > 0 && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
            >
              <p className="border-b border-gray-100 px-3 py-2 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
                Applies to {affected} selected permission{affected === 1 ? "" : "s"}
              </p>
              {SETTABLE_STATES.map((state) => (
                <button
                  key={state}
                  type="button"
                  role="menuitem"
                  onClick={() => applyBulk(state)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${STATE_META[state].dot}`} />
                  Set selected to {STATE_META[state].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            State
            <select
              className={selectClass}
              value={filters.state}
              onChange={(event) => onFilterChange({ state: event.target.value })}
            >
              {STATE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            Type
            <select
              className={selectClass}
              value={filters.type}
              onChange={(event) => onFilterChange({ type: event.target.value })}
            >
              {TYPE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            Sensitivity
            <select
              className={selectClass}
              value={filters.sensitivity}
              onChange={(event) => onFilterChange({ sensitivity: event.target.value })}
            >
              {SENSITIVITY_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-40 dark:text-brand-400"
            disabled={activeFilterCount === 0}
            onClick={onClearFilters}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
