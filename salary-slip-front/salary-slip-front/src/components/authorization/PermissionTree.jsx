import { useMemo } from "react";
import {
  TYPE_LABEL, stateOf, collectAssignable, aggregateOf, filterTree,
} from "./permissionTreeUtils";
import { ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";

function TriStateBox({ aggregate, disabled, onChange, label }) {
  const checked = aggregate === "checked";
  const mixed = aggregate === "indeterminate";

  if (aggregate === "not_applicable") {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center text-gray-400"
        aria-label={`${label}: Not applicable`}
        title="Not applicable"
      >
        —
      </span>
    );
  }

  return (
    <input
      type="checkbox"
      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-brand-600 focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600"
      checked={checked}
      disabled={disabled}
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      ref={(el) => {
        if (el) el.indeterminate = mixed;
      }}
      onChange={() => onChange(!checked && !mixed ? true : !checked)}
    />
  );
}

function TreeNode({ node, depth, expanded, onToggleExpand, pending, onSet, onSelect, selectedKey }) {
  const hasChildren = (node.children ?? []).length > 0;
  const isOpen = expanded.has(node.key);
  const aggregate = aggregateOf(node, pending);
  const own = stateOf(node, pending);
  const changed = node.permissionKey && pending.has(node.permissionKey);

  const setSubtree = (value) => {
    const targets = [];
    if (node.permissionKey) targets.push(node);
    collectAssignable(node).forEach((d) => targets.push(d));
    onSet(targets, value);
  };

  return (
    <>
      <tr
        className={`border-b border-gray-100 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5 ${
          selectedKey === node.key ? "bg-brand-50 dark:bg-brand-500/10" : ""
        } ${changed ? "ring-1 ring-inset ring-amber-300/60" : ""}`}
        onClick={() => onSelect(node)}
      >
        <td className="sticky left-0 z-10 bg-inherit py-2 pr-3">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 18}px` }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(node.key);
                }}
                aria-expanded={isOpen}
                aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.label}`}
                className="rounded p-0.5 text-gray-500 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:hover:bg-white/10"
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="inline-block w-[22px]" />
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={`truncate text-sm ${
                    node.type === "module"
                      ? "font-semibold text-gray-900 dark:text-white"
                      : node.type === "page"
                        ? "font-medium text-gray-800 dark:text-gray-100"
                        : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {node.label}
                </span>
                {node.sensitive && (
                  <ShieldAlert size={12} className="shrink-0 text-amber-500" aria-label="Sensitive" />
                )}
                {hasChildren && (
                  <span className="text-[11px] text-gray-400">
                    · {(node.children ?? []).length}
                  </span>
                )}
              </div>
              {node.permissionKey && (
                <div className="truncate font-mono text-[10px] text-gray-400">{node.permissionKey}</div>
              )}
            </div>
          </div>
        </td>

        <td className="px-3 py-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {TYPE_LABEL[node.type] ?? node.type}
          </span>
        </td>

        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
          <TriStateBox
            aggregate={hasChildren ? aggregate : node.permissionKey ? (own === "ALLOW" ? "checked" : "unchecked") : "not_applicable"}
            onChange={setSubtree}
            label={`${node.label}${node.permissionKey ? ` (${node.permissionKey})` : ""}`}
          />
        </td>

        <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          {!node.permissionKey
            ? "Grouping"
            : own === "ALLOW"
              ? "Enabled"
              : own === "DENY"
                ? "Denied"
                : "Not assigned"}
        </td>
      </tr>

      {isOpen &&
        (node.children ?? []).map((child) => (
          <TreeNode
            key={child.key}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            pending={pending}
            onSet={onSet}
            onSelect={onSelect}
            selectedKey={selectedKey}
          />
        ))}
    </>
  );
}

export default function PermissionTree({
  tree,
  search,
  expanded,
  onToggleExpand,
  pending,
  onSet,
  onSelect,
  selectedKey,
}) {
  const term = (search ?? "").trim().toLowerCase();
  const visible = useMemo(() => filterTree(tree ?? [], term), [tree, term]);

  if (!visible.length) {
    return (
      <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
        No navigation permissions match “{search}”.
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-left" data-testid="permission-tree">
      <thead className="sticky top-0 z-20 bg-gray-50 dark:bg-slate-800">
        <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
          <th className="sticky left-0 z-30 bg-gray-50 py-2 pr-3 dark:bg-slate-800">Permission</th>
          <th className="px-3 py-2">Type</th>
          <th className="px-3 py-2 text-center">Enabled</th>
          <th className="px-3 py-2">State</th>
        </tr>
      </thead>
      <tbody>
        {visible.map((node) => (
          <TreeNode
            key={node.key}
            node={node}
            depth={0}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            pending={pending}
            onSet={onSet}
            onSelect={onSelect}
            selectedKey={selectedKey}
          />
        ))}
      </tbody>
    </table>
  );
}
