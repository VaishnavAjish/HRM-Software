import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Folder,
  Loader2,
  Play,
  Save,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import { useAuth } from "../../../context/AuthContext";
import { authorizationApi } from "../../../utils/api";
import PermissionCell, { StateLegend } from "./PermissionCell";
import { nextState } from "./permissionStates";

/**
 * Permission Matrix.
 *
 * Modules down, actions across, one editable state per cell, with the
 * selected cell explained in a side panel and the whole configuration
 * previewed through the real authorization engine before it is saved.
 *
 * Two decisions shape the whole screen:
 *
 * The matrix is one request, not one per cell. Roughly 110 permissions across
 * 8 action columns is nearly 900 cells; a check-per-cell design would open the
 * page with a thousand round trips and still be wrong, because the states are
 * not independent — inheritance means a cell's value depends on rows the
 * client would have to reassemble itself.
 *
 * Unsaved edits live in a diff, not in a mutated copy of the matrix. Filtering
 * and searching therefore cannot lose them, and Save sends only what actually
 * changed, so two administrators editing different modules do not overwrite
 * each other.
 */

/**
 * Fallback columns.
 *
 * The server derives the real column set from the permission catalogue — this
 * database uses view/edit where the canonical catalogue uses read/update, and
 * carries an ACCESS column for permissions that are not an action on a
 * resource. Hard-coding the list here would silently hide those, so this is
 * only used before the first response arrives.
 */
const FALLBACK_COLUMNS = [
  { key: "view", label: "View" },
  { key: "create", label: "Create" },
  { key: "update", label: "Update" },
  { key: "delete", label: "Delete" },
  { key: "approve", label: "Approve" },
  { key: "export", label: "Export" },
  { key: "print", label: "Print" },
  { key: "configure", label: "Configure" },
];

const SCOPE_TYPES = [
  "GLOBAL", "TENANT", "GROUP", "COMPANY", "LEGAL_ENTITY", "BRANCH", "LOCATION",
  "BUSINESS_UNIT", "DEPARTMENT", "TEAM", "SELF", "OWN_RECORDS", "DIRECT_REPORTS",
  "INDIRECT_REPORTS", "ASSIGNED_RECORDS", "SELECTED_RECORDS",
];

const cellKey = (permissionCode, action) => `${permissionCode}::${action}`;

export default function PermissionMatrix() {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType ?? "Bearer";

  const [roles, setRoles] = useState([]);
  const [roleId, setRoleId] = useState(null);
  const [scopeType, setScopeType] = useState("TENANT");
  const [scopeId, setScopeId] = useState("");
  const [scopeOptions, setScopeOptions] = useState([]);
  const [view, setView] = useState(() => localStorage.getItem("pm_view") || "matrix");

  const [matrix, setMatrix] = useState(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set());
  const [selectedCell, setSelectedCell] = useState(null);

  /** Unsaved edits: cellKey -> next state. Survives filtering by design. */
  const [changes, setChanges] = useState(() => new Map());
  const dirty = changes.size > 0;

  /* ---------------------------------------------------------------- */
  /* Loading                                                           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const response = await authorizationApi.roles(token, tokenType);
        const list = response?.data?.data ?? response?.data ?? [];
        if (cancelled) return;

        setRoles(list);
        setRoleId((current) => current ?? list[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, tokenType]);

  /*
   * The fetch lives in the effect rather than in a callback the effect calls,
   * so no state is set synchronously while the effect runs. `reloadNonce` is
   * how an explicit refresh (after a save) re-enters it.
   */
  useEffect(() => {
    if (!token || !roleId) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");

      try {
        const response = await authorizationApi.matrix(
          roleId,
          { scopeType, scopeId: scopeId || undefined },
          token,
          tokenType,
        );
        if (cancelled) return;

        setMatrix(response?.data ?? null);
        // A fresh load invalidates pending edits — they were computed against
        // the previous role or scope and would be written to the wrong place.
        setChanges(new Map());
        setSelectedCell(null);
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setMatrix(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, tokenType, roleId, scopeType, scopeId, reloadNonce]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token || scopeType === "GLOBAL") {
        if (!cancelled) setScopeOptions([]);
        return;
      }

      try {
        const response = await authorizationApi.scopeOptions(scopeType, token, tokenType);
        if (!cancelled) setScopeOptions(response?.data ?? []);
      } catch {
        // A missing scope catalogue must not block editing permissions; the
        // field falls back to a free-text id.
        if (!cancelled) setScopeOptions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, tokenType, scopeType]);

  useEffect(() => {
    localStorage.setItem("pm_view", view);
  }, [view]);

  /** Browser-level guard. The in-app guard is on the role/scope selectors. */
  useEffect(() => {
    if (!dirty) return undefined;

    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /* ---------------------------------------------------------------- */
  /* Derived state                                                     */
  /* ---------------------------------------------------------------- */

  // Stable identity: `matrix?.modules ?? []` would be a fresh array on every
  // render, invalidating every memo below it.
  const modules = useMemo(() => matrix?.modules ?? [], [matrix]);
  const columns = useMemo(() => matrix?.columns ?? FALLBACK_COLUMNS, [matrix]);

  const stateOf = useCallback(
    (permissionCode, action) => {
      const key = cellKey(permissionCode, action);
      if (changes.has(key)) return changes.get(key);
      return matrix?.states?.[key] ?? "NOT_ASSIGNED";
    },
    [changes, matrix],
  );

  const visibleModules = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return modules
      .filter((module) => moduleFilter === "all" || module.key === moduleFilter)
      .map((module) => {
        if (!needle) return module;

        const permissions = module.permissions.filter((permission) =>
          [permission.label, permission.code, permission.resource, permission.description]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(needle)),
        );

        const moduleMatches = module.label.toLowerCase().includes(needle);
        return { ...module, permissions: moduleMatches ? module.permissions : permissions };
      })
      .filter((module) => module.permissions.length > 0);
  }, [modules, moduleFilter, search]);

  /** Counts come from the live view, so they move as edits are made. */
  const summary = useMemo(() => {
    const counts = {
      ALLOW: 0, DENY: 0, INHERITED_ALLOW: 0, INHERITED_DENY: 0,
      CONDITIONAL: 0, NOT_ASSIGNED: 0,
    };
    let total = 0;
    let sensitive = 0;

    for (const module of modules) {
      for (const permission of module.permissions) {
        for (const action of permission.actions ?? []) {
          total += 1;
          const state = stateOf(permission.code, action);
          counts[state] = (counts[state] ?? 0) + 1;
          if (permission.isSensitive && (state === "ALLOW" || state === "CONDITIONAL")) sensitive += 1;
        }
      }
    }

    return { total, sensitive, ...counts };
  }, [modules, stateOf]);

  const selectedPermission = useMemo(() => {
    const code = selectedCell?.code;
    const owner = code ? modules.find((module) => module.permissions.some((p) => p.code === code)) : undefined;
    const permission = owner?.permissions.find((p) => p.code === code);

    return permission ? { ...permission, module: owner.label } : null;
  }, [modules, selectedCell]);

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  const guardUnsaved = (apply) => {
    if (dirty && !window.confirm("Discard unsaved permission changes?")) return;
    apply();
  };

  const toggleCell = (permission, action) => {
    if (permission.isSensitive) {
      const current = stateOf(permission.code, action);
      // A sensitive permission can always be tightened without ceremony; only
      // granting one asks for confirmation.
      if (current !== "ALLOW" && nextState(current) === "ALLOW") {
        if (!window.confirm(`${permission.code} is a sensitive permission. Grant it to this role?`)) return;
      }
    }

    setChanges((previous) => {
      const key = cellKey(permission.code, action);
      const updated = new Map(previous);
      const next = nextState(stateOf(permission.code, action));

      // Returning a cell to its saved value removes it from the diff, so the
      // Save button correctly goes quiet again.
      if ((matrix?.states?.[key] ?? "NOT_ASSIGNED") === next) updated.delete(key);
      else updated.set(key, next);

      return updated;
    });
  };

  const save = async () => {
    if (!dirty || !roleId) return;

    setSaving(true);
    try {
      const payload = [...changes.entries()].map(([key, state]) => {
        const [code, action] = key.split("::");
        return { permissionCode: code, action, state, scopeType, scopeId: scopeId || null };
      });

      await authorizationApi.saveMatrix(roleId, payload, token, tokenType);
      toast.success(`Saved ${payload.length} permission change${payload.length === 1 ? "" : "s"}`);
      setReloadNonce((nonce) => nonce + 1);
    } catch (err) {
      // 409 is a concurrent edit, which needs a reload rather than a retry.
      toast.error(
        err.message?.includes("conflict")
          ? "Someone else changed this role. Reload to see their changes."
          : err.message,
      );
    } finally {
      setSaving(false);
    }
  };

  const exportMatrix = () => {
    const rows = [["Module", "Permission", "Code", ...columns.map((column) => column.label)]];

    for (const module of visibleModules) {
      for (const permission of module.permissions) {
        rows.push([
          module.label,
          permission.label,
          permission.code,
          ...columns.map((column) =>
            (permission.actions ?? []).includes(column.key) ? stateOf(permission.code, column.key) : "",
          ),
        ]);
      }
    }

    // Exports what is on screen, filters included — an export that silently
    // ignored the active filter would not match what was reviewed.
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `permission-matrix-${matrix?.role?.code ?? roleId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const cloneRole = async () => {
    const name = window.prompt("Name for the cloned role");
    if (!name) return;

    try {
      const response = await authorizationApi.cloneRole(roleId, { name }, token, tokenType);
      const created = response?.data;
      toast.success(`Created "${name}" — permissions copied, assignments not`);

      const list = await authorizationApi.roles(token, tokenType);
      setRoles(list?.data?.data ?? list?.data ?? []);
      if (created?.id) setRoleId(created.id);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleModule = (key) =>
    setExpanded((previous) => {
      const updated = new Set(previous);
      if (updated.has(key)) updated.delete(key);
      else updated.add(key);
      return updated;
    });

  const allExpanded = visibleModules.length > 0 && visibleModules.every((module) => expanded.has(module.key));

  /* ---------------------------------------------------------------- */

  const role = matrix?.role;

  return (
    <div className="space-y-5">
      <Header
        dirty={dirty}
        saving={saving}
        onSave={save}
        onExport={exportMatrix}
        onClone={cloneRole}
        canClone={Boolean(roleId)}
      />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Could not load the permission matrix</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <FilterBar
        roles={roles}
        roleId={roleId}
        onRoleChange={(next) => guardUnsaved(() => setRoleId(next))}
        scopeType={scopeType}
        onScopeTypeChange={(next) => guardUnsaved(() => { setScopeType(next); setScopeId(""); })}
        scopeId={scopeId}
        onScopeIdChange={setScopeId}
        scopeOptions={scopeOptions}
        view={view}
        onViewChange={setView}
        moduleFilter={moduleFilter}
        onModuleFilterChange={setModuleFilter}
        modules={modules}
        inheritance={matrix?.inheritance ?? []}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-5">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <MatrixToolbar
              search={search}
              onSearch={setSearch}
              allExpanded={allExpanded}
              onExpandAll={() =>
                setExpanded(allExpanded ? new Set() : new Set(visibleModules.map((module) => module.key)))
              }
            />

            {loading ? (
              <MatrixSkeleton />
            ) : visibleModules.length === 0 ? (
              <EmptyState search={search} />
            ) : view === "matrix" ? (
              <MatrixTable
                columns={columns}
                modules={visibleModules}
                expanded={expanded}
                onToggleModule={toggleModule}
                stateOf={stateOf}
                changes={changes}
                selectedCell={selectedCell}
                onSelect={setSelectedCell}
                onToggleCell={toggleCell}
                autoExpand={Boolean(search.trim())}
              />
            ) : (
              <TreeView
                modules={visibleModules}
                stateOf={stateOf}
                selectedCell={selectedCell}
                onSelect={setSelectedCell}
              />
            )}

            <StateLegend />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <InheritanceFlow inheritance={matrix?.inheritance ?? []} role={role} scopeId={scopeId} scopeType={scopeType} />
            <Simulator token={token} tokenType={tokenType} />
          </div>
        </section>

        <aside className="space-y-5">
          <PermissionDetails
            permission={selectedPermission}
            action={selectedCell?.action}
            state={selectedCell ? stateOf(selectedCell.code, selectedCell.action) : null}
            scopeLabel={scopeId || scopeType}
            onClose={() => setSelectedCell(null)}
          />
          <RoleSummary summary={summary} onFilter={setModuleFilter} />
          <EffectivePreview token={token} tokenType={tokenType} />
          <RecentChanges changes={matrix?.recentChanges ?? []} />
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function Header({ dirty, saving, onSave, onExport, onClone, canClone }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Permission Matrix</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Define permissions for the selected role across modules, actions, and scopes.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Download size={16} aria-hidden="true" />
          Export
        </button>
        <button
          type="button"
          onClick={onClone}
          disabled={!canClone}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Copy size={16} aria-hidden="true" />
          Clone Role
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

function Field({ label, children }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}

const selectClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";

function FilterBar({
  roles, roleId, onRoleChange,
  scopeType, onScopeTypeChange, scopeId, onScopeIdChange, scopeOptions,
  view, onViewChange, moduleFilter, onModuleFilterChange, modules, inheritance,
}) {
  return (
    <div className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Role">
        <select className={selectClass} value={roleId ?? ""} onChange={(event) => onRoleChange(Number(event.target.value))}>
          {roles.length === 0 && <option value="">No roles available</option>}
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
              {role.is_system ? " · System" : ""}
              {role.is_active === false ? " · Inactive" : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Scope">
        <div className="flex gap-2">
          <select
            className={selectClass}
            value={scopeType}
            onChange={(event) => onScopeTypeChange(event.target.value)}
            aria-label="Scope type"
          >
            {SCOPE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          {scopeType !== "GLOBAL" &&
            (scopeOptions.length > 0 ? (
              <select
                className={selectClass}
                value={scopeId}
                onChange={(event) => onScopeIdChange(event.target.value)}
                aria-label="Scope value"
              >
                <option value="">All</option>
                {scopeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={selectClass}
                value={scopeId}
                onChange={(event) => onScopeIdChange(event.target.value)}
                placeholder="Scope id"
                aria-label="Scope value"
              />
            ))}
        </div>
      </Field>

      <Field label="View">
        <div className="inline-flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-600">
          {["matrix", "tree"].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onViewChange(option)}
              aria-pressed={view === option}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
                view === option
                  ? "bg-brand-600 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Show">
        <select className={selectClass} value={moduleFilter} onChange={(event) => onModuleFilterChange(event.target.value)}>
          <option value="all">All Modules</option>
          {modules.map((module) => (
            <option key={module.key} value={module.key}>
              {module.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Role Inheritance">
        <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600">
          <span className="font-semibold text-gray-900 dark:text-white">{inheritance.length}</span>
          <span className="ml-1 text-gray-500 dark:text-gray-400">
            Parent Role{inheritance.length === 1 ? "" : "s"}
          </span>
        </div>
      </Field>
    </div>
  );
}

function MatrixToolbar({ search, onSearch, allExpanded, onExpandAll }) {
  return (
    <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search modules or permissions…"
          aria-label="Search modules or permissions"
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>

      <button
        type="button"
        onClick={onExpandAll}
        className="self-start rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        {allExpanded ? "Collapse All" : "Expand All"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Matrix                                                              */
/* ------------------------------------------------------------------ */

function MatrixTable({
  columns, modules, expanded, onToggleModule, stateOf, changes,
  selectedCell, onSelect, onToggleCell, autoExpand,
}) {
  return (
    // The table scrolls inside its own container so the page body never
    // scrolls sideways on a narrow screen.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left dark:border-gray-700">
            <th scope="col" className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              Module / Permission
            </th>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="px-2 py-3 text-center font-medium text-gray-600 dark:text-gray-300">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {modules.map((module) => {
            const isOpen = autoExpand || expanded.has(module.key);

            return (
              <ModuleRows
                key={module.key}
                columns={columns}
                module={module}
                isOpen={isOpen}
                onToggle={() => onToggleModule(module.key)}
                stateOf={stateOf}
                changes={changes}
                selectedCell={selectedCell}
                onSelect={onSelect}
                onToggleCell={onToggleCell}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ModuleRows({ columns, module, isOpen, onToggle, stateOf, changes, selectedCell, onSelect, onToggleCell }) {
  return (
    <>
      <tr className="border-b border-gray-100 bg-gray-50/70 dark:border-gray-700 dark:bg-gray-900/40">
        <th scope="rowgroup" colSpan={columns.length + 1} className="px-4 py-2 text-left">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100"
          >
            {isOpen ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
            <Folder size={15} className="text-brand-600" aria-hidden="true" />
            {module.label}
            <span className="ml-1 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {module.permissions.length}
            </span>
          </button>
        </th>
      </tr>

      {isOpen &&
        module.permissions.map((permission) => {
          const isSelectedRow = selectedCell?.code === permission.code;

          return (
            <tr
              key={permission.code}
              className={`border-b border-gray-100 transition dark:border-gray-800 ${
                isSelectedRow ? "bg-brand-50/60 dark:bg-brand-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-900/30"
              }`}
            >
              <th
                scope="row"
                className="sticky left-0 z-10 bg-inherit py-2 pl-11 pr-4 text-left font-normal text-gray-700 dark:text-gray-200"
              >
                <span className="flex items-center gap-2">
                  {permission.label}
                  {permission.isSensitive && (
                    <span
                      title="Sensitive permission"
                      className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    >
                      Sensitive
                    </span>
                  )}
                </span>
              </th>

              {columns.map((column) => {
                const applicable = (permission.actions ?? []).includes(column.key);

                return (
                  <PermissionCell
                    key={column.key}
                    permission={permission}
                    action={column.label}
                    disabled={!applicable}
                    state={applicable ? stateOf(permission.code, column.key) : "NOT_ASSIGNED"}
                    dirty={changes.has(cellKey(permission.code, column.key))}
                    selected={selectedCell?.code === permission.code && selectedCell?.action === column.key}
                    onSelect={() => applicable && onSelect({ code: permission.code, action: column.key })}
                    onToggle={() => applicable && onToggleCell(permission, column.key)}
                  />
                );
              })}
            </tr>
          );
        })}
    </>
  );
}

function TreeView({ modules, stateOf, selectedCell, onSelect }) {
  return (
    <div className="space-y-4 p-4">
      {modules.map((module) => (
        <div key={module.key}>
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <Folder size={15} className="text-brand-600" aria-hidden="true" />
            {module.label}
          </p>

          <ul className="ml-4 space-y-1 border-l border-gray-200 pl-4 dark:border-gray-700">
            {module.permissions.map((permission) => (
              <li key={permission.code}>
                <button
                  type="button"
                  onClick={() => onSelect({ code: permission.code, action: permission.actions?.[0] ?? "view" })}
                  className={`w-full rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-gray-900/40 ${
                    selectedCell?.code === permission.code ? "bg-brand-50 dark:bg-brand-900/20" : ""
                  }`}
                >
                  <span className="font-medium text-gray-800 dark:text-gray-100">{permission.label}</span>
                  <span className="ml-2 font-mono text-[11px] text-gray-400">{permission.code}</span>

                  <span className="mt-1 flex flex-wrap gap-1">
                    {(permission.actions ?? []).map((action) => (
                      <span
                        key={action}
                        className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                      >
                        {action}: {stateOf(permission.code, action).replaceAll("_", " ").toLowerCase()}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Side panels                                                         */
/* ------------------------------------------------------------------ */

function Panel({ title, icon: Icon, children, action }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          {Icon && <Icon size={16} className="text-brand-600" aria-hidden="true" />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PermissionDetails({ permission, action, state, scopeLabel, onClose }) {
  if (!permission) {
    return (
      <Panel title="Permission Details">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select a permission cell to see its code, scope, inheritance and conditions.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Permission Details"
      action={
        <button type="button" onClick={onClose} aria-label="Close permission details" className="text-gray-400 hover:text-gray-600">
          <X size={16} aria-hidden="true" />
        </button>
      }
    >
      <dl className="space-y-2.5 text-sm">
        <div>
          <dt className="sr-only">Name</dt>
          <dd className="font-semibold text-gray-900 dark:text-white">{permission.label}</dd>
        </div>

        <Row label="Module" value={permission.module} />
        <Row label="Action" value={action} />
        <Row label="State" value={state?.replaceAll("_", " ").toLowerCase()} />
        <Row label="Scope" value={scopeLabel} />

        <div>
          <dt className="text-xs text-gray-500 dark:text-gray-400">Permission</dt>
          <dd className="mt-0.5 inline-block rounded bg-brand-50 px-2 py-0.5 font-mono text-[11px] text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
            {permission.code}
          </dd>
        </div>

        {permission.description && <Row label="Description" value={permission.description} />}

        {permission.inheritedFrom?.length > 0 && (
          <Row label="Inherited From" value={permission.inheritedFrom.join(", ")} />
        )}

        {permission.conditions?.length > 0 && (
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">Conditions</dt>
            <dd className="mt-1 rounded-lg bg-amber-50 p-2 dark:bg-amber-900/20">
              <ul className="list-inside list-disc space-y-1 text-xs text-amber-800 dark:text-amber-200">
                {permission.conditions.map((condition) => (
                  <li key={condition}>{condition}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}

        {permission.updatedAt && (
          <Row label="Last Updated" value={`${permission.updatedAt}${permission.updatedBy ? ` · ${permission.updatedBy}` : ""}`} />
        )}
      </dl>
    </Panel>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-right text-xs font-medium capitalize text-gray-800 dark:text-gray-200">{value ?? "—"}</dd>
    </div>
  );
}

function RoleSummary({ summary, onFilter }) {
  const cards = [
    { label: "Total Permissions", value: summary.total, tone: "text-gray-900 dark:text-white" },
    { label: "Allowed", value: summary.ALLOW, tone: "text-green-600 dark:text-green-400" },
    { label: "Denied", value: summary.DENY, tone: "text-red-600 dark:text-red-400" },
    { label: "Conditional", value: summary.CONDITIONAL, tone: "text-amber-600 dark:text-amber-400" },
    { label: "Not Assigned", value: summary.NOT_ASSIGNED, tone: "text-gray-500 dark:text-gray-400" },
    { label: "Inherited", value: summary.INHERITED_ALLOW + summary.INHERITED_DENY, tone: "text-blue-600 dark:text-blue-400" },
    { label: "Sensitive Granted", value: summary.sensitive, tone: "text-amber-700 dark:text-amber-300" },
  ];

  const pct = (value) => (summary.total > 0 ? Math.round((value / summary.total) * 100) : 0);

  return (
    <Panel title="Role Summary">
      <div className="grid grid-cols-2 gap-2">
        {cards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => onFilter("all")}
            className="rounded-xl border border-gray-200 p-2.5 text-left transition hover:border-brand-400 dark:border-gray-700"
          >
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{card.label}</p>
            <p className={`mt-0.5 text-lg font-bold ${card.tone}`}>{card.value}</p>
            {card.label !== "Total Permissions" && (
              <p className="text-[10px] text-gray-400">{pct(card.value)}%</p>
            )}
          </button>
        ))}
      </div>
    </Panel>
  );
}

function EffectivePreview({ token, tokenType }) {
  const [userId, setUserId] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!userId) return;

    setBusy(true);
    try {
      const response = await authorizationApi.effectivePermissions(userId, token, tokenType);
      setResult(response?.data ?? null);
    } catch (err) {
      toast.error(err.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Effective Permissions (Preview)">
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        Resolved by the authorization engine — roles, inheritance, scopes, denies and temporary access.
      </p>

      <div className="flex gap-2">
        <input
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          placeholder="User id"
          aria-label="User id for effective permission preview"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <button
          type="button"
          onClick={run}
          disabled={busy || !userId}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "…" : "Preview"}
        </button>
      </div>

      {result && (
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs">
          {Object.entries(result.permissions ?? {}).map(([code, decision]) => (
            <li key={code} className="flex justify-between gap-2">
              <span className="truncate font-mono text-gray-600 dark:text-gray-300">{code}</span>
              <span className={decision.allowed ? "text-green-600" : "text-red-500"}>
                {decision.allowed ? "allow" : "deny"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentChanges({ changes }) {
  return (
    <Panel title="Recent Changes">
      {changes.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No recent access-control changes.</p>
      ) : (
        <ul className="space-y-2.5">
          {changes.slice(0, 6).map((change) => (
            <li key={change.id} className="text-xs">
              <p className="text-gray-800 dark:text-gray-200">
                <span className="font-medium">{change.actor}</span> {change.summary}
              </p>
              <p className="text-gray-400">{change.at}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function InheritanceFlow({ inheritance, role, scopeType, scopeId }) {
  const nodes = [
    ...inheritance.map((parent) => ({ label: parent.name, caption: "Parent Role" })),
    { label: role?.name ?? "—", caption: "Current Role", current: true },
    { label: scopeId || scopeType, caption: "Current Scope" },
  ];

  return (
    <Panel title="Permission Inheritance">
      <div className="flex flex-wrap items-center gap-2">
        {nodes.map((node, index) => (
          <div key={`${node.label}-${index}`} className="flex items-center gap-2">
            <div
              className={`rounded-lg border px-3 py-2 text-center ${
                node.current
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
                  : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40"
              }`}
            >
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{node.label}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{node.caption}</p>
            </div>
            {index < nodes.length - 1 && <ChevronRight size={14} className="text-gray-400" aria-hidden="true" />}
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
        Permissions flow from parent roles to child roles. Deny overrides allow.
      </p>
    </Panel>
  );
}

function Simulator({ token, tokenType }) {
  const [form, setForm] = useState({ subjectId: "", permissionCode: "hr.employee.update", resourceType: "" });
  const [decision, setDecision] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await authorizationApi.simulate(
        {
          subjectId: Number(form.subjectId),
          permissionCode: form.permissionCode,
          resource: form.resourceType ? { resource_type: form.resourceType } : {},
        },
        token,
        tokenType,
      );
      setDecision(response?.data?.decision ?? response?.data ?? null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const update = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));

  return (
    <Panel title="Permission Simulator" icon={ShieldCheck}>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        Runs the same engine the APIs run — not a separate preview.
      </p>

      <form onSubmit={submit} className="space-y-2">
        <input
          value={form.subjectId}
          onChange={update("subjectId")}
          required
          placeholder="User id"
          aria-label="User id"
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <input
          value={form.permissionCode}
          onChange={update("permissionCode")}
          required
          placeholder="Permission code"
          aria-label="Permission code"
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 font-mono text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Play size={14} aria-hidden="true" />
          {busy ? "Simulating…" : "Simulate"}
        </button>
      </form>

      {decision && (
        <div
          className={`mt-3 rounded-lg border p-3 text-xs ${
            decision.allowed
              ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20"
              : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20"
          }`}
        >
          <p className={`font-semibold ${decision.allowed ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
            {decision.allowed ? "Allowed" : "Denied"}
          </p>
          <p className="mt-1 text-gray-700 dark:text-gray-300">{decision.reason}</p>

          {decision.matchedPolicyIds?.length > 0 && (
            <p className="mt-1 text-gray-500">Matched policies: {decision.matchedPolicyIds.join(", ")}</p>
          )}
          {decision.failedConditions?.length > 0 && (
            <p className="mt-1 text-gray-500">Failed: {decision.failedConditions.join(", ")}</p>
          )}
          <p className="mt-1 text-gray-400">
            {decision.effectiveState} · {decision.evaluationTimeMs}ms · {decision.decisionId?.slice(0, 8)}
          </p>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function MatrixSkeleton() {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading permission matrix">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-8 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      ))}
    </div>
  );
}

function EmptyState({ search }) {
  return (
    <div className="p-10 text-center">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">No permissions match</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {search ? `Nothing matches "${search}".` : "This role has no permissions in the selected module."}
      </p>
    </div>
  );
}
