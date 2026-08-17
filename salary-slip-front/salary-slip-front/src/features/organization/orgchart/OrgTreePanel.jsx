import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Plus, Network, GitBranch } from "lucide-react";
import Button from "../../../components/ui/Button";

function buildTree(units) {
  const byId = new Map(units.map((u) => [u.id, { ...u, children: [] }]));
  const roots = [];
  byId.forEach((unit) => {
    if (unit.parentId != null && byId.has(unit.parentId)) {
      byId.get(unit.parentId).children.push(unit);
    } else {
      roots.push(unit);
    }
  });
  return roots;
}

function matchesSearch(unit, term) {
  if (!term) return true;
  const haystack = `${unit.name || ""} ${unit.code || ""}`.toLowerCase();
  return haystack.includes(term);
}

function collectMatchIds(nodes, term, matches) {
  let any = false;
  nodes.forEach((node) => {
    const childMatch = collectMatchIds(node.children, term, matches);
    const selfMatch = matchesSearch(node, term);
    if (childMatch || selfMatch) {
      matches.add(node.id);
      any = true;
    }
  });
  return any;
}

function TreeNode({ node, depth, expanded, onToggle, selectedId, onSelect, term, visible }) {
  if (!visible.has(node.id)) return null;
  const isOpen = expanded.has(node.id) || Boolean(term);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node)}
        className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
          selectedId === node.id ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300" : "text-gray-700 dark:text-gray-200"
        }`}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {hasChildren ? (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
            className="flex-shrink-0 text-gray-400"
          >
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        ) : (
          <span className="w-[13px] flex-shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
        {node.type && <span className="ml-auto flex-shrink-0 text-[10px] uppercase text-gray-400">{node.type}</span>}
      </button>
      {hasChildren && isOpen && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
              term={term}
              visible={visible}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgTreePanel({
  orgUnits,
  companies,
  companyId,
  onCompanyChange,
  view,
  onViewChange,
  selectedId,
  onSelect,
  onAddUnit,
  canAdd,
  onImportLegacy,
  canImportLegacy,
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());

  const tree = useMemo(() => buildTree(orgUnits), [orgUnits]);

  useEffect(() => {
    let active = true;
    // Expand the top two levels by default so the tree isn't a wall of
    // collapsed roots on first load. Deferred past a microtask so the
    // setState runs as an async continuation, not synchronously in the
    // effect body.
    Promise.resolve().then(() => {
      if (!active) return;
      const initial = new Set();
      tree.forEach((root) => {
        initial.add(root.id);
        root.children.forEach((child) => initial.add(child.id));
      });
      setExpanded(initial);
    });
    return () => { active = false; };
  }, [tree]);

  const term = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!term) return new Set(orgUnits.map((u) => u.id));
    const matches = new Set();
    collectMatchIds(tree, term, matches);
    return matches;
  }, [tree, term, orgUnits]);

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
        <button
          type="button"
          onClick={() => onViewChange("organization")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold ${
            view === "organization" ? "bg-brand-600 text-white" : "text-gray-500 dark:text-gray-400"
          }`}
        >
          <Network size={13} /> Organization
        </button>
        <button
          type="button"
          onClick={() => onViewChange("reporting")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold ${
            view === "reporting" ? "bg-brand-600 text-white" : "text-gray-500 dark:text-gray-400"
          }`}
        >
          <GitBranch size={13} /> Reporting
        </button>
      </div>

      <select
        aria-label="Company"
        className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        value={companyId || ""}
        onChange={(e) => onCompanyChange(e.target.value)}
      >
        <option value="">All Companies</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      <div className="relative mt-2">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          aria-label="Search department, team, employee"
          placeholder="Search department, team, employee…"
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mt-2 flex-1 overflow-y-auto">
        {tree.length === 0 ? (
          <p className="p-4 text-center text-xs text-gray-400">No organization units yet.</p>
        ) : (
          tree.map((root) => (
            <TreeNode
              key={root.id}
              node={root}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              selectedId={selectedId}
              onSelect={onSelect}
              term={term}
              visible={visible}
            />
          ))
        )}
      </div>

      {canAdd && (
        <Button variant="secondary" className="mt-2 w-full justify-center" onClick={onAddUnit}>
          <Plus size={15} /> Add Department / Team
        </Button>
      )}
      {canImportLegacy && (
        <button
          type="button"
          onClick={onImportLegacy}
          className="mt-1.5 w-full text-center text-xs text-gray-400 hover:text-brand-600 dark:hover:text-brand-400"
        >
          Sync from Company &amp; Unit
        </button>
      )}
    </div>
  );
}
