import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Copy, Download, Loader2, RotateCcw, Save, ShieldCheck } from "lucide-react";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { ADMIN_COMPANY_OPTIONS } from "../../../config/companyConfig";
import { downloadCSV } from "../../../utils/exportUtils";
import ApiPermissionsTab from "../components/ApiPermissionsTab";
import EmptyState from "../components/EmptyState";
import LegacyPermissionsTab from "../components/LegacyPermissionsTab";
import MatrixToolbar from "../components/MatrixToolbar";
import PermissionDetailsPanel from "../components/PermissionDetailsPanel";
import PermissionMatrixHeader from "../components/PermissionMatrixHeader";
import PermissionMatrixLayout from "../components/PermissionMatrixLayout";
import PermissionSimulator from "../components/PermissionSimulator";
import PermissionTreeTable from "../components/PermissionTreeTable";
import RoleHeaderCard from "../components/RoleHeaderCard";
import { InheritanceTreeCard, RecentChangesCard, RoleSummaryCard } from "../components/RolePanels";
import ValidationBanner from "../components/ValidationBanner";
import { StateLegend } from "../components/badges";
import usePermissionMatrix from "../hooks/usePermissionMatrix";
import permissionMatrixApi from "../services/permissionMatrixApi";
import { filterTree, findNode, flattenVisible } from "../utils/tree";
import { copyText } from "../utils/clipboard";

const TABS = [
  { id: "navigation", label: "Navigation Permissions" },
  { id: "legacy", label: "Legacy Resource Permissions" },
  { id: "api", label: "API Permissions" },
];

const DEFAULT_FILTERS = { search: "", state: "ALL", type: "ALL", sensitivity: "ALL" };

export default function PermissionMatrixPage() {
  const matrixState = usePermissionMatrix();
  const {
    token, tokenType, roles, roleId, selectRole, matrix, audit, loading, saving, error, reload,
    draft, dirty, status, configuredOf, setStates, discard, save,
    expanded, toggleExpand, expandAll, collapseAll,
    visibleColumns, toggleColumn,
    selectedKey, setSelectedKey, selectedNode, editable,
  } = matrixState;

  const [tab, setTab] = useState("navigation");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [checked, setChecked] = useState(() => new Set());

  const onFilterChange = (patch) => setFilters((current) => ({ ...current, ...patch }));

  const activeFilterCount = useMemo(
    () => Object.entries(filters).filter(([key, value]) =>
      key === "search" ? value.trim() !== "" : value !== "ALL").length,
    [filters],
  );

  const toggleChecked = (key) => setChecked((previous) => {
    const next = new Set(previous);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const copyCode = async (code) => {
    const copied = await copyText(code);
    copied ? toast.success("Permission code copied") : toast.error("Could not copy to the clipboard");
  };

  const filteredTree = useMemo(
    () => (matrix ? filterTree(matrix.tree, filters, configuredOf) : []),
    [matrix, filters, configuredOf],
  );

  const rows = useMemo(
    () => flattenVisible(filteredTree, expanded),
    [filteredTree, expanded],
  );

  const visibleAssignable = useMemo(
    () => rows.filter((node) => node.assignable),
    [rows],
  );

  const selectedNodes = useMemo(
    () => visibleAssignable.filter((node) => checked.has(node.key)),
    [visibleAssignable, checked],
  );

  const toggleAll = () => setChecked((previous) => {
    const everySelected = visibleAssignable.length > 0
      && visibleAssignable.every((node) => previous.has(node.key));

    if (everySelected) return new Set();

    return new Set(visibleAssignable.map((node) => node.key));
  });

  const applyToDescendants = (node, descendants) => {
    const state = configuredOf(node);

    if (!window.confirm(
      `Apply "${state}" to ${descendants.length} permission(s) under ${node.label}? ` +
      "Existing child configuration will be overwritten.",
    )) return;

    setStates(descendants, state);
  };

  const exportMatrix = () => {
    if (!matrix) return;

    const flat = [];
    const walk = (nodes) => nodes.forEach((node) => {
      if (node.assignable) {
        flat.push({
          Role: matrix.role.name,
          RoleType: matrix.role.roleType ?? "",
          Module: node.key.split(".")[1] ?? "",
          Name: node.label,
          PermissionCode: node.permissionCode,
          Type: node.type,
          ConfiguredState: configuredOf(node),
          EffectiveResult: node.effectiveResult,
          Source: node.source,
          Sensitivity: node.sensitivity,
          Scope: (node.scopes ?? []).join("|"),
          BackendPermissions: (node.impliedCodes ?? []).join("|"),
        });
      }
      walk(node.children ?? []);
    });

    walk(matrix.tree);
    downloadCSV(flat, `permission-matrix-${matrix.role.code ?? roleId}`);
  };

  const cloneRole = async () => {
    const name = window.prompt("Name for the cloned role");
    if (!name) return;

    try {
      const response = await permissionMatrixApi.cloneRole(roleId, { name }, token, tokenType);
      toast.success(`Created "${response?.data?.name}"`);
      window.location.reload();
    } catch (err) {
      toast.error(err.message || "Could not clone the role");
    }
  };

  const onSave = () => {
    // A critical grant is the one change that must not be saved anonymously, so
    // the reason is collected before the request rather than reconstructed from
    // the audit log afterwards.
    const critical = Array.from(draft.entries())
      .filter(([, state]) => state === "ALLOW")
      .map(([key]) => findNode(matrix?.tree ?? [], key))
      .filter((node) => node?.sensitivity === "CRITICAL");

    let reason = null;

    if (critical.length > 0) {
      reason = window.prompt(
        `You are granting ${critical.length} critical permission(s). Give a business reason for the audit log.`,
      );

      if (reason === null) return;
    }

    save(reason);
  };

  const header = (
    <PermissionMatrixHeader
      title="Permission Matrix"
      description="Define and manage role-based access control for modules, pages, features, actions, filters and data."
      breadcrumb={["Access Control", "Permission Matrix"]}
      actions={
        <>
          <Button variant="secondary" onClick={exportMatrix} disabled={!matrix}>
            <Download size={15} className="mr-1.5" /> Export
          </Button>
          <Button variant="secondary" onClick={cloneRole} disabled={!roleId || !editable}>
            <Copy size={15} className="mr-1.5" /> Clone Role
          </Button>
          {dirty && (
            <Button variant="outline" onClick={discard}>
              <RotateCcw size={15} className="mr-1.5" /> Discard
            </Button>
          )}
          <Button onClick={onSave} disabled={!dirty || saving || !editable}>
            {saving ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Save size={15} className="mr-1.5" />}
            Save Changes{dirty ? ` (${draft.size})` : ""}
          </Button>
        </>
      }
    />
  );

  if (error && !matrix) {
    return (
      <div className="space-y-5">
        {header}
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title="Could not load the permission matrix"
            description={<p>{error}</p>}
            action={<Button onClick={reload}>Retry</Button>}
          />
        </Card>
      </div>
    );
  }

  return (
    <PermissionMatrixLayout
      header={header}
      banner={<ValidationBanner issues={matrix?.validation} />}
      roleCard={
        <RoleHeaderCard
          roles={roles}
          roleId={roleId}
          onSelectRole={selectRole}
          role={matrix?.role}
          status={status}
          dirty={dirty}
        />
      }
      main={
        <Card padding={false} className="overflow-hidden">
          <div role="tablist" aria-label="Permission views" className="flex gap-1 border-b border-gray-200 px-4 pt-3 dark:border-gray-700">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                role="tab"
                type="button"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
                className={`rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  tab === entry.id
                    ? "border-brand-600 text-brand-700 dark:text-brand-400"
                    : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {loading && <div className="p-4"><SkeletonTable /></div>}

          {!loading && tab === "navigation" && (
            <>
              <MatrixToolbar
                filters={filters}
                onFilterChange={onFilterChange}
                onExpandAll={expandAll}
                onCollapseAll={collapseAll}
                onBulkApply={(state) => { setStates(selectedNodes, state); setChecked(new Set()); }}
                selectedNodes={selectedNodes}
                activeFilterCount={activeFilterCount}
                onClearFilters={() => setFilters(DEFAULT_FILTERS)}
                editable={editable}
                visibleColumns={visibleColumns}
                onToggleColumn={toggleColumn}
              />

              {rows.length === 0 ? (
                <EmptyState
                  title="No permissions match your filters"
                  description={<p>Adjust the search term or reset the state, type and sensitivity filters.</p>}
                  action={<Button variant="secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</Button>}
                />
              ) : (
                <div className="max-h-[620px] overflow-auto">
                  <PermissionTreeTable
                    rows={rows}
                    expanded={expanded}
                    onToggleExpand={toggleExpand}
                    configuredOf={configuredOf}
                    draft={draft}
                    editable={editable}
                    visibleColumns={visibleColumns}
                    selectedKey={selectedKey}
                    onSelect={setSelectedKey}
                    onSetState={setStates}
                    onApplyToDescendants={applyToDescendants}
                    onCopy={copyCode}
                    checked={checked}
                    onToggleChecked={toggleChecked}
                    onToggleAll={toggleAll}
                  />
                </div>
              )}

              <div className="border-t border-gray-200 p-4 dark:border-gray-700">
                <StateLegend />
              </div>
            </>
          )}

          {!loading && tab === "legacy" && <LegacyPermissionsTab tree={matrix?.tree} />}
          {!loading && tab === "api" && <ApiPermissionsTab surface={matrix?.apiSurface} />}
        </Card>
      }
      side={
        <>
          <PermissionDetailsPanel
            node={selectedNode}
            draftState={selectedKey ? draft.get(selectedKey) : undefined}
            roleName={matrix?.role?.name}
            lastChange={audit.find((entry) => entry.permissionCode === selectedNode?.permissionCode)}
          />
          <RoleSummaryCard summary={matrix?.summary} dirty={dirty} />
          <InheritanceTreeCard chain={matrix?.inheritance} roleName={matrix?.role?.name} />
          <RecentChangesCard changes={audit} />
        </>
      }
      footer={
        <PermissionSimulator
          tree={matrix?.tree}
          token={token}
          tokenType={tokenType}
          companies={ADMIN_COMPANY_OPTIONS}
        />
      }
    />
  );
}
