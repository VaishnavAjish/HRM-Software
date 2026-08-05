import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Download, Copy, Save, Search, ChevronsDownUp, ChevronsUpDown,
  ShieldCheck, History, PlayCircle, Info, Loader2,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { SkeletonTable } from "../../components/ui/Skeleton";
import MatrixGrid from "../../components/authorization/MatrixGrid";
import PermissionTree from "../../components/authorization/PermissionTree";
import {
  TYPE_LABEL, collectKeys, stateOf,
} from "../../components/authorization/permissionTreeUtils";
import PermissionStateIcon, {
  PermissionStateLegend,
} from "../../components/authorization/PermissionStateIcon";
import {
  PERMISSION_STATES, NEXT_STATE,
} from "../../components/authorization/permissionStates";
import { useAuth } from "../../context/AuthContext";
import { authorizationAdminApi } from "../../utils/api";
import { downloadCSV } from "../../utils/exportUtils";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export default function PermissionMatrix() {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [roles, setRoles] = useState([]);
  const [roleId, setRoleId] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(new Set());
  const [selectedCell, setSelectedCell] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [pending, setPending] = useState(new Map());
  const [recentChanges, setRecentChanges] = useState([]);

  const dirty = pending.size > 0;

  // ---- data ---------------------------------------------------------------

  useEffect(() => {
    if (!token) return;
    authorizationAdminApi
      .getRoles(token, tokenType)
      .then((res) => {
        const list = res?.data ?? [];
        setRoles(list);
        setRoleId((current) => current ?? list[0]?.id ?? null);
        // With no role there is nothing for the matrix effect to fetch, so it
        // returns before its finally() and the skeleton would never clear.
        if (!list.length) setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        toast.error(err.message || "Could not load roles");
      });
  }, [token, tokenType]);

  useEffect(() => {
    if (!token || !roleId) return undefined;

    // `active` guards against a slow response for a role the administrator has
    // already navigated away from overwriting the newer one.
    let active = true;
    authorizationAdminApi
      .getMatrix(roleId, token, tokenType)
      .then((res) => {
        if (!active) return;
        const data = res?.data;
        setMatrix(data);
        setExpanded(new Set([
          ...(data?.modules ?? []).map((m) => m.code),
          ...(data?.tree ?? []).map((n) => n.key),
          ...(data?.tree ?? []).flatMap((n) => (n.children ?? []).map((c) => c.key)),
        ]));
        setPending(new Map());
        setSelectedCell(null);
        setSelectedNode(null);
      })
      .catch((err) => {
        if (active) toast.error(err.message || "Could not load the permission matrix");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [roleId, token, tokenType]);

  const loadRecentChanges = useCallback(() => {
    if (!token) return;
    authorizationAdminApi
      .getAudit(token, tokenType, 6)
      .then((res) => setRecentChanges(res?.data ?? []))
      .catch(() => setRecentChanges([]));
  }, [token, tokenType]);

  useEffect(() => { loadRecentChanges(); }, [loadRecentChanges]);

  // Leaving with unsaved permission edits loses them silently otherwise.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ---- derived ------------------------------------------------------------

  const filtered = useMemo(() => {
    if (!matrix) return null;
    const term = search.trim().toLowerCase();
    if (!term) return matrix;

    const modules = matrix.modules
      .map((module) => ({
        ...module,
        resources: module.resources.filter((resource) =>
          resource.name.toLowerCase().includes(term) ||
          resource.code.toLowerCase().includes(term) ||
          Object.values(resource.cells).some((cell) =>
            cell.permissionCode.toLowerCase().includes(term))
        ),
      }))
      .filter((module) =>
        module.resources.length > 0 || module.name.toLowerCase().includes(term));

    return { ...matrix, modules };
  }, [matrix, search]);

  /** Summary recomputed so the cards reflect unsaved edits, not just the server. */
  const summary = useMemo(() => {
    if (!matrix) return null;
    const counts = {
      total: 0, ALLOW: 0, DENY: 0, CONDITIONAL: 0,
      NOT_ASSIGNED: 0, INHERITED_ALLOW: 0, INHERITED_DENY: 0,
    };
    matrix.modules.forEach((module) =>
      module.resources.forEach((resource) =>
        Object.values(resource.cells).forEach((cell) => {
          counts.total += 1;
          counts[pending.get(cell.permissionCode) ?? cell.state] += 1;
        })));
    return counts;
  }, [matrix, pending]);

  // ---- actions ------------------------------------------------------------

  const cycleCell = (cell, currentState) => {
    if (currentState === "INHERITED_DENY") {
      toast("Denied by a parent role. Clear it on that role instead.", { icon: "🔒" });
      return;
    }

    const next = NEXT_STATE[currentState] ?? "ALLOW";
    setPending((previous) => {
      const updated = new Map(previous);
      const original = cell.state;
      // Cycling back to where it started is not a change.
      if (next === original) updated.delete(cell.permissionCode);
      else updated.set(cell.permissionCode, next);
      return updated;
    });
  };

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const changes = Array.from(pending, ([permissionCode, state]) => ({ permissionCode, state }));
      const res = await authorizationAdminApi.saveMatrix(roleId, changes, null, token, tokenType);
      setMatrix(res?.data?.matrix ?? matrix);
      setPending(new Map());
      toast.success(`Saved ${res?.data?.applied ?? changes.length} permission change(s)`);
      loadRecentChanges();
    } catch (err) {
      toast.error(err.message || "Could not save the changes");
    } finally {
      setSaving(false);
    }
  };

  const cloneRole = async () => {
    const name = window.prompt("Name for the cloned role");
    if (!name) return;
    try {
      const res = await authorizationAdminApi.cloneRole(roleId, { name }, token, tokenType);
      toast.success(`Created "${res?.data?.name}"`);
      const list = await authorizationAdminApi.getRoles(token, tokenType);
      setRoles(list?.data ?? []);
      setRoleId(res?.data?.id ?? roleId);
    } catch (err) {
      toast.error(err.message || "Could not clone the role");
    }
  };

  const exportMatrix = () => {
    if (!filtered) return;
    const rows = [];
    filtered.modules.forEach((module) =>
      module.resources.forEach((resource) =>
        Object.entries(resource.cells).forEach(([action, cell]) => {
          rows.push({
            Module: module.name,
            Resource: resource.name,
            Action: action,
            Permission: cell.permissionCode,
            State: pending.get(cell.permissionCode) ?? cell.state,
            Sensitive: cell.isSensitive ? "yes" : "no",
          });
        })));
    downloadCSV(rows, `permission-matrix-${matrix?.role?.code ?? roleId}`);
  };

  /**
   * Codes owned by the tree are dropped from the legacy grid so Employees and
   * Attendance are not editable in two places with two different states.
   */
  const legacyModules = useMemo(() => {
    if (!filtered) return [];
    const owned = new Set(matrix?.treePermissionCodes ?? []);
    if (owned.size === 0) return filtered.modules;

    return filtered.modules
      .map((module) => ({
        ...module,
        resources: module.resources
          .map((resource) => ({
            ...resource,
            cells: Object.fromEntries(
              Object.entries(resource.cells).filter(([, cell]) => !owned.has(cell.permissionCode)),
            ),
          }))
          .filter((resource) => Object.keys(resource.cells).length > 0),
      }))
      .filter((module) => module.resources.length > 0);
  }, [filtered, matrix]);

  /** One pending entry per real permission; reverting removes the diff. */
  const setNodes = useCallback((nodes, enabled) => {
    setPending((previous) => {
      const updated = new Map(previous);
      nodes.forEach((node) => {
        if (!node.permissionKey) return;
        const next = enabled ? "ALLOW" : "NOT_ASSIGNED";
        const original = node.state === "enabled" ? "ALLOW" : "NOT_ASSIGNED";
        if (next === original) updated.delete(node.permissionKey);
        else updated.set(node.permissionKey, next);
      });
      return updated;
    });
  }, []);

  const toggleModule = (code) =>
    setExpanded((previous) => {
      const updated = new Set(previous);
      updated.has(code) ? updated.delete(code) : updated.add(code);
      return updated;
    });

  const selectedRole = roles.find((role) => role.id === roleId);

  const catalogEmpty = Boolean(matrix) && (matrix.modules?.length ?? 0) === 0;

  if (!loading && catalogEmpty) {
    return <CatalogNotInitialised roleCount={roles.length} />;
  }

  // ---- render -------------------------------------------------------------

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Permission Matrix</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Define permissions for the selected role across modules, actions, and scopes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={exportMatrix} disabled={!matrix}>
            <Download size={16} className="mr-2" /> Export
          </Button>
          <Button variant="secondary" onClick={cloneRole} disabled={!roleId}>
            <Copy size={16} className="mr-2" /> Clone Role
          </Button>
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
            Save Changes{dirty ? ` (${pending.size})` : ""}
          </Button>
        </div>
      </header>

      <Card padding={false} className="p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Role</span>
            <select
              className={inputClass}
              value={roleId ?? ""}
              onChange={(event) => {
                if (dirty && !window.confirm("Discard unsaved permission changes?")) return;
                setLoading(true);
                setRoleId(Number(event.target.value));
              }}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}{role.isSystem ? " (system)" : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Role type</span>
            <p className={`${inputClass} !border-transparent !bg-gray-50 dark:!bg-gray-700/50`}>
              {selectedRole?.roleType ?? "—"}
            </p>
          </div>

          <div className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Assigned users</span>
            <p className={`${inputClass} !border-transparent !bg-gray-50 dark:!bg-gray-700/50`}>
              {selectedRole?.assignedUserCount ?? 0}
            </p>
          </div>

          <div className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Inherits from</span>
            <p className={`${inputClass} !border-transparent !bg-gray-50 dark:!bg-gray-700/50`}>
              {matrix?.role?.parentRoleIds?.length
                ? `${matrix.role.parentRoleIds.length} parent role(s)`
                : "No parent roles"}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-5">
          <Card padding={false}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
              <label className="relative flex-1 min-w-[220px]">
                <span className="sr-only">Search modules or permissions</span>
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  className={`${inputClass} pl-9`}
                  placeholder="Search modules or permissions…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setExpanded(
                      new Set([
                        ...(matrix?.modules ?? []).map((m) => m.code),
                        ...collectKeys(matrix?.tree ?? []),
                      ]),
                    )
                  }
                >
                  <ChevronsUpDown size={16} className="mr-2" /> Expand All
                </Button>
                <Button variant="secondary" onClick={() => setExpanded(new Set())}>
                  <ChevronsDownUp size={16} className="mr-2" /> Collapse All
                </Button>
              </div>
            </div>

            {loading && <div className="p-4"><SkeletonTable /></div>}

            {!loading && filtered && filtered.modules.length === 0 && (
              <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No modules or permissions match “{search}”.
              </p>
            )}

            {!loading && (matrix?.tree?.length ?? 0) > 0 && (
              <div className="border-b border-gray-200 dark:border-gray-700">
                <div className="px-4 pt-4">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Navigation permissions
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Modules, pages, actions and table columns as they appear in the application.
                  </p>
                </div>
                <div className="mt-3 max-h-[540px] overflow-auto">
                  <PermissionTree
                    tree={matrix.tree}
                    search={search}
                    expanded={expanded}
                    onToggleExpand={toggleModule}
                    pending={pending}
                    onSet={setNodes}
                    onSelect={setSelectedNode}
                    selectedKey={selectedNode?.key}
                  />
                </div>
              </div>
            )}

            {!loading && filtered && legacyModules.length > 0 && (
              <div>
                <div className="px-4 pt-4">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Legacy permissions
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Modules not yet mapped to the navigation tree.
                  </p>
                </div>
                <MatrixGrid
                  matrix={{ ...filtered, modules: legacyModules }}
                  expanded={expanded}
                  onToggleModule={toggleModule}
                  selectedCell={selectedCell}
                  onSelectCell={setSelectedCell}
                  onCycleCell={cycleCell}
                  pendingChanges={pending}
                  readOnly={Boolean(selectedRole?.isSystem) && Number(user?.rawRole) !== 0}
                />
              </div>
            )}

            <div className="border-t border-gray-200 p-4 dark:border-gray-700">
              <PermissionStateLegend />
            </div>
          </Card>

          <PermissionSimulator token={token} tokenType={tokenType} />
        </div>

        <div className="space-y-5">
          {selectedNode ? (
            <NodeDetails node={selectedNode} pending={pending} />
          ) : (
            <PermissionDetails cell={selectedCell} pending={pending} matrix={matrix} />
          )}
          <RoleSummary summary={summary} dirty={dirty} />
          <RecentChanges changes={recentChanges} />
        </div>
      </div>
    </div>
  );
}

function CatalogNotInitialised({ roleCount }) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Permission Matrix</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Define permissions for the selected role across modules, actions, and scopes.
        </p>
      </header>

      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck size={22} className="mt-0.5 shrink-0 text-amber-500" />
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Enterprise RBAC catalog has not been initialized.
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              The matrix is a grid of resources against actions. Until the canonical catalog is
              seeded there are no axes to draw, so editing is disabled rather than showing an
              empty grid that looks broken.
            </p>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex gap-3">
                <dt className="w-44 shrink-0 text-gray-500 dark:text-gray-400">Legacy authorization</dt>
                <dd className="font-medium text-green-600 dark:text-green-400">Active — access is being enforced</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-44 shrink-0 text-gray-500 dark:text-gray-400">Shadow mode</dt>
                <dd className="font-medium text-blue-600 dark:text-blue-400">
                  Enabled — the new engine decides, legacy backstops it
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-44 shrink-0 text-gray-500 dark:text-gray-400">Canonical catalog</dt>
                <dd className="font-medium text-amber-600 dark:text-amber-400">Not initialized</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-44 shrink-0 text-gray-500 dark:text-gray-400">Roles defined</dt>
                <dd className="text-gray-900 dark:text-gray-100">{roleCount}</dd>
              </div>
            </dl>

            <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">
              Initialization is a security change, not a display fix: it creates the canonical
              permissions and a role assignment for every active user. It runs only after an
              impact review has been approved.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ panels */

function PermissionDetails({ cell, pending, matrix }) {
  if (!cell) {
    return (
      <Card>
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <Info size={18} className="text-brand-500" /> Permission Details
        </h2>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Select a cell in the matrix to see what grants it, where it is inherited from, and any conditions attached.
        </p>
      </Card>
    );
  }

  const state = pending.get(cell.permissionCode) ?? cell.state;
  const meta = PERMISSION_STATES[state];
  const parent = cell.inheritedFromRoleId;

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
        <Info size={18} className="text-brand-500" /> Permission Details
      </h2>

      <dl className="mt-4 space-y-3 text-sm">
        <Detail label="Resource" value={cell.resource?.name} />
        <Detail label="Action" value={cell.action?.name} />
        <Detail label="Permission" value={<code className="text-xs">{cell.permissionCode}</code>} />
        <Detail
          label="State"
          value={
            <span className="inline-flex items-center gap-2">
              <PermissionStateIcon state={state} size={16} />
              {meta.label}
              {pending.has(cell.permissionCode) && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  unsaved
                </span>
              )}
            </span>
          }
        />
        <Detail label="Meaning" value={meta.description} />
        {parent && <Detail label="Inherited from" value={`Role #${parent}`} />}
        {cell.conditionCount > 0 && (
          <Detail label="Conditions" value={`${cell.conditionCount} condition(s) must hold`} />
        )}
        {cell.isSensitive && (
          <Detail
            label="Sensitivity"
            value={<span className="text-amber-600 dark:text-amber-400">Sensitive — changes are audited.</span>}
          />
        )}
      </dl>

      {parent && state !== "INHERITED_ALLOW" && state !== "INHERITED_DENY" && (
        <p className="mt-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          This overrides a grant inherited from role #{parent}. The parent keeps its own setting;
          only this role changes.
        </p>
      )}

      {matrix?.role?.isSystem && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          This is a system role. Only a global administrator can change it.
        </p>
      )}
    </Card>
  );
}

function NodeDetails({ node, pending }) {
  const grouping = !node.permissionKey;
  const current = stateOf(node, pending);
  const isPending = node.permissionKey && pending.has(node.permissionKey);

  return (
    <Card>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
        <Info size={16} /> Permission Details
      </h2>
      <dl className="space-y-2 text-sm" data-testid="node-details">
        <Detail label="Permission" value={node.label} />
        <Detail label="Type" value={TYPE_LABEL[node.type] ?? node.type} />
        <Detail label="Key" value={node.permissionKey ?? "—"} />
        <Detail label="Parent" value={node.parentKey ?? "—"} />
        <Detail
          label="Requires"
          value={(node.requiredCodes ?? []).join(" + ") || "—"}
        />
        <Detail label="Route" value={node.route ?? "—"} />
        <Detail label="Sensitive" value={node.sensitive ? "Yes" : "No"} />
        <Detail
          label="State"
          value={
            grouping
              ? "Grouping node — no direct permission record."
              : current === "ALLOW"
                ? "Enabled"
                : "Not assigned"
          }
        />
        {isPending && <Detail label="Pending" value="Unsaved change" />}
      </dl>
    </Card>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="flex-1 text-gray-900 dark:text-gray-100">{value ?? "—"}</dd>
    </div>
  );
}

function RoleSummary({ summary, dirty }) {
  if (!summary) return null;

  const percent = (n) => (summary.total ? Math.round((n / summary.total) * 100) : 0);
  const tiles = [
    { key: "ALLOW", label: "Allowed", tone: "text-green-600 dark:text-green-400" },
    { key: "DENY", label: "Denied", tone: "text-red-600 dark:text-red-400" },
    { key: "CONDITIONAL", label: "Conditional", tone: "text-amber-600 dark:text-amber-400" },
    { key: "INHERITED_ALLOW", label: "Inherited", tone: "text-blue-600 dark:text-blue-400" },
    { key: "NOT_ASSIGNED", label: "Not assigned", tone: "text-gray-500 dark:text-gray-400" },
  ];

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
        <ShieldCheck size={18} className="text-brand-500" /> Role Summary
        {dirty && (
          <span className="ml-auto rounded bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            includes unsaved
          </span>
        )}
      </h2>

      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
        {summary.total} permission{summary.total === 1 ? "" : "s"} in this matrix
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
          >
            <dt className="text-xs text-gray-500 dark:text-gray-400">{tile.label}</dt>
            <dd className={`mt-1 text-xl font-semibold ${tile.tone}`}>
              {summary[tile.key]}
              <span className="ml-1 text-xs font-normal text-gray-400">{percent(summary[tile.key])}%</span>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function RecentChanges({ changes }) {
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
        <History size={18} className="text-brand-500" /> Recent Changes
      </h2>

      {changes.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          No permission changes recorded yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {changes.map((change) => (
            <li key={change.eventId} className="text-sm">
              <p className="text-gray-900 dark:text-gray-100">
                <span className="font-medium">{change.actorName || "System"}</span>{" "}
                {change.changeType?.toLowerCase()}{" "}
                <code className="text-xs">{change.permissionCode || change.subjectLabel}</code>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {change.oldState && change.newState
                  ? `${change.oldState} → ${change.newState} · `
                  : ""}
                {new Date(change.changedAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Runs a real decision through the production engine.
 *
 * Deliberately not a client-side approximation of the rules: the point of the
 * simulator is to show what the server would actually decide, and a local
 * reimplementation would drift and reassure an administrator wrongly.
 */
function PermissionSimulator({ token, tokenType }) {
  const [userId, setUserId] = useState("");
  const [permissionCode, setPermissionCode] = useState("hr.employee.read");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!userId || !permissionCode) return;
    setRunning(true);
    try {
      const res = await authorizationAdminApi.simulate(
        { userId: Number(userId), permissionCode },
        token, tokenType
      );
      setResult(res?.data ?? null);
    } catch (err) {
      toast.error(err.message || "Simulation failed");
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
        <PlayCircle size={18} className="text-brand-500" /> Permission Simulator
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Asks the live authorization engine what it would decide for a specific user.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">User ID</span>
          <input
            type="number" className={inputClass} value={userId}
            onChange={(event) => setUserId(event.target.value)} placeholder="e.g. 413"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Permission code</span>
          <input
            type="text" className={inputClass} value={permissionCode}
            onChange={(event) => setPermissionCode(event.target.value)}
          />
        </label>
      </div>

      <Button className="mt-3" onClick={run} disabled={running || !userId}>
        {running ? <Loader2 size={16} className="mr-2 animate-spin" /> : <PlayCircle size={16} className="mr-2" />}
        Simulate
      </Button>

      {result && (
        <div
          className={`mt-4 rounded-lg p-4 ${
            result.allowed
              ? "bg-green-50 dark:bg-green-900/20"
              : "bg-red-50 dark:bg-red-900/20"
          }`}
        >
          <p className={`font-semibold ${result.allowed ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
            {result.allowed ? "Allowed" : "Denied"}
          </p>
          <dl className="mt-2 space-y-1 text-xs text-gray-700 dark:text-gray-300">
            <div className="flex gap-2"><dt className="w-32 text-gray-500">Reason</dt><dd>{result.reasonCode}</dd></div>
            <div className="flex gap-2"><dt className="w-32 text-gray-500">Effective state</dt><dd>{result.effectiveState}</dd></div>
            <div className="flex gap-2">
              <dt className="w-32 text-gray-500">Matched policies</dt>
              <dd>{result.matchedPolicyIds?.length ? result.matchedPolicyIds.join(", ") : "none"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 text-gray-500">Failed conditions</dt>
              <dd>{result.failedConditions?.length ? result.failedConditions.join(", ") : "none"}</dd>
            </div>
            <div className="flex gap-2"><dt className="w-32 text-gray-500">Evaluated in</dt><dd>{result.evaluationTimeMs} ms</dd></div>
          </dl>
        </div>
      )}
    </Card>
  );
}
