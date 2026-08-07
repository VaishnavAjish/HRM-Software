import {
  ChevronDown, ChevronRight, Columns3, Filter as FilterIcon, Folder,
  FileText, Layers, MoreVertical, Zap,
} from "lucide-react";
import { EffectiveBadge, SensitivityMark, StateBadge, TypeBadge } from "./badges";
import { collectAssignable } from "../utils/tree";
import useDismissable from "../hooks/useDismissable";
import PermissionStateSelect from "./PermissionStateSelect";

const ICONS = {
  module: Folder,
  page: FileText,
  section: Layers,
  feature: Layers,
  action: Zap,
  filter: FilterIcon,
  column: Columns3,
  field: Columns3,
  api: Zap,
};

const GRID = "grid grid-cols-[32px_minmax(240px,1fr)_minmax(190px,1.1fr)_150px_140px_110px_44px] items-center gap-3";

function StateControl({ node, value, pending, editable, onChange }) {
  if (!node.assignable) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">—</span>;
  }

  if (!editable) {
    return <StateBadge state={value} pending={pending} />;
  }

  return (
    <span className="flex items-center gap-1.5">
      <PermissionStateSelect
        value={value}
        label={node.label}
        onChange={onChange}
      />
      {pending && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
          title="Unsaved change"
          aria-label="Unsaved change"
        />
      )}
    </span>
  );
}

function RowMenu({ node, editable, onApplyToDescendants, onCopy }) {
  const { open, setOpen, ref, toggle } = useDismissable();
  const descendants = collectAssignable(node).filter((entry) => entry.key !== node.key);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`Options for ${node.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
      >
        <MoreVertical size={15} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:text-gray-200 dark:hover:bg-gray-700"
            disabled={!editable || descendants.length === 0}
            onClick={() => { setOpen(false); onApplyToDescendants(node, descendants); }}
          >
            Apply this state to {descendants.length} descendant{descendants.length === 1 ? "" : "s"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
            onClick={() => { setOpen(false); onCopy(node.permissionCode ?? node.key); }}
          >
            Copy permission code
          </button>
        </div>
      )}
    </div>
  );
}

export default function PermissionTreeTable({
  rows, expanded, onToggleExpand, configuredOf, draft, editable,
  selectedKey, onSelect, onSetState, onApplyToDescendants, onCopy,
  checked, onToggleChecked, onToggleAll,
}) {
  const selectable = rows.filter((row) => row.assignable);
  const allSelected = selectable.length > 0 && selectable.every((row) => checked.has(row.key));
  const someSelected = selectable.some((row) => checked.has(row.key));

  return (
    <div role="treegrid" aria-label="Permission tree" className="min-w-[900px]">
      <div
        className={`${GRID} sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-400`}
        role="row"
      >
        <span role="columnheader" className="flex items-center">
          <input
            type="checkbox"
            aria-label="Select all visible permissions"
            className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            checked={allSelected}
            ref={(node) => { if (node) node.indeterminate = someSelected && !allSelected; }}
            onChange={onToggleAll}
          />
        </span>
        <span role="columnheader">Name</span>
        <span role="columnheader">Permission Code</span>
        <span role="columnheader">Configured State</span>
        <span role="columnheader">Effective Result</span>
        <span role="columnheader">Type</span>
        <span role="columnheader" className="sr-only">Options</span>
      </div>

      <div>
        {rows.map((node) => {
          const Icon = ICONS[node.type] ?? Zap;
          const hasChildren = (node.children ?? []).length > 0;
          const isOpen = expanded.has(node.key);
          const pending = draft.has(node.key);
          const state = configuredOf(node);
          const selected = selectedKey === node.key;

          return (
            <div
              key={node.key}
              role="row"
              aria-level={node.depth + 1}
              aria-expanded={hasChildren ? isOpen : undefined}
              aria-selected={selected}
              tabIndex={0}
              onClick={() => onSelect(node.key)}
              onKeyDown={(event) => {
                // Only handle keys aimed at the row itself. Without this the row
                // intercepts the state dropdown's own keyboard: Enter and Space
                // were preventDefault-ed so the highlighted option never
                // committed, and Arrow keys toggled the node while the user was
                // moving through the options.
                if (event.target !== event.currentTarget) return;

                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(node.key);
                }
                if (event.key === "ArrowRight" && hasChildren && !isOpen) onToggleExpand(node.key);
                if (event.key === "ArrowLeft" && hasChildren && isOpen) onToggleExpand(node.key);
              }}
              className={`${GRID} cursor-pointer border-b border-gray-100 px-4 py-1.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-inset focus:ring-brand-500 dark:border-gray-700/60 ${
                selected
                  ? "bg-brand-50 dark:bg-brand-500/10"
                  : node.type === "module"
                    ? "bg-gray-50/70 hover:bg-gray-100 dark:bg-gray-900/30 dark:hover:bg-gray-700/40"
                    : "hover:bg-gray-50 dark:hover:bg-gray-700/40"
              }`}
            >
              <div role="gridcell" onClick={(event) => event.stopPropagation()}>
                {node.assignable && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${node.label}`}
                    className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    checked={checked.has(node.key)}
                    onChange={() => onToggleChecked(node.key)}
                  />
                )}
              </div>

              <div role="gridcell" className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: node.depth * 18 }}>
                {hasChildren ? (
                  <button
                    type="button"
                    aria-label={isOpen ? `Collapse ${node.label}` : `Expand ${node.label}`}
                    onClick={(event) => { event.stopPropagation(); onToggleExpand(node.key); }}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-600"
                  >
                    {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                  </button>
                ) : (
                  <span className="w-[22px]" aria-hidden="true" />
                )}

                <Icon
                  size={14}
                  className={node.type === "module" ? "text-brand-500" : "text-gray-400 dark:text-gray-500"}
                  aria-hidden="true"
                />

                <span
                  className={`truncate ${
                    node.type === "module"
                      ? "font-semibold text-gray-900 dark:text-white"
                      : node.type === "page"
                        ? "font-medium text-gray-800 dark:text-gray-100"
                        : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {node.label}
                </span>

                <SensitivityMark sensitivity={node.sensitivity} />
              </div>

              <code role="gridcell" className="truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">
                {node.permissionCode ?? "—"}
              </code>

              <div role="gridcell" onClick={(event) => event.stopPropagation()}>
                <StateControl
                  node={node}
                  value={state}
                  pending={pending}
                  editable={editable}
                  onChange={(next) => onSetState([node], next)}
                />
              </div>

              <div role="gridcell">
                {node.assignable
                  ? <EffectiveBadge result={node.effectiveResult} pending={pending} />
                  : <span className="text-xs text-gray-400 dark:text-gray-500">—</span>}
              </div>

              <div role="gridcell"><TypeBadge type={node.type} /></div>

              <div role="gridcell" onClick={(event) => event.stopPropagation()}>
                <RowMenu
                  node={node}
                  editable={editable}
                  onApplyToDescendants={onApplyToDescendants}
                  onCopy={onCopy}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
