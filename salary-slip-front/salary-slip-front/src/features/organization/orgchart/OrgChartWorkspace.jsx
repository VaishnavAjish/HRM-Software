import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import Button from "../../../components/ui/Button";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { organizationApi } from "../services/organizationApi";
import { useOrgChartData, assignmentsToEmployeeTree } from "./useOrgChartData";
import { useChartHistory } from "./useChartHistory";
import KpiRow from "./KpiRow";
import OrgTreePanel from "./OrgTreePanel";
import ChartCanvas from "./ChartCanvas";
import InsightsPanel from "./InsightsPanel";
import NodeDetailDrawer from "./NodeDetailDrawer";
import ConfirmDialog from "./ConfirmDialog";
import FilterDrawer from "./FilterDrawer";
import AddItemDialog from "./dialogs/AddItemDialog";
import MoveDialog from "./dialogs/MoveDialog";
import ConnectRelationshipDialog from "./dialogs/ConnectRelationshipDialog";
import SetManagerDialog from "./dialogs/SetManagerDialog";
import { parseNodeId } from "./nodeId";

const DEFAULT_FILTERS = { companyIds: [], asOf: "", includeInactive: false, includeVacant: true, search: "" };

function permissionForKind(kind) {
  return {
    department: "org.unit.create", team: "org.unit.create", sub_department: "org.unit.create",
    position: "org.unit_position.create", assignment: "org.unit_assignment.create",
    reporting: "org.reporting.create",
  }[kind];
}

function canManageNode(can, node, locked) {
  if (!node || locked) return false;
  if (node.type === "department") {
    return can("org.unit.update") || can("org.unit.delete") || can("org.unit_position.create") || can("org.reporting.create");
  }
  if (node.type === "position") return can("org.unit_position.update") || can("org.unit_position.delete");
  if (node.type === "employee") return can("org.reporting.update") || can("org.reporting.create");
  return false;
}

function canEditAnything(can) {
  return can("org.unit.create") || can("org.unit.update") || can("org.unit.delete")
    || can("org.unit_position.create") || can("org.unit_assignment.create") || can("org.reporting.create");
}

export default function OrgChartWorkspace() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [view, setView] = useState("organization");
  // Defaults locked: this chart drives real department/manager/reporting
  // data, and a single stray drag-to-move on a shared live chart can
  // silently reassign someone's manager or department. Unlocking is a
  // deliberate, visible action (toolbar button), not the default state.
  const [locked, setLocked] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [chartSearch, setChartSearch] = useState("");
  const [selectedNode, setSelectedNode] = useState(null);
  const [employeesState, setEmployeesState] = useState(null);
  const [addDialog, setAddDialog] = useState({ open: false });
  const [moveDialog, setMoveDialog] = useState({ open: false });
  const [connectDialog, setConnectDialog] = useState({ open: false });
  const [setManagerDialog, setSetManagerDialog] = useState({ open: false });
  const [employeeRefreshSignal, setEmployeeRefreshSignal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({ open: false });
  const [deleteBusy, setDeleteBusy] = useState(false);

  const history = useChartHistory();
  const chartData = useOrgChartData({ token, tokenType, view, filters });

  const nodesById = useMemo(
    () => new Map((chartData.chart.nodes || []).map((n) => [n.id, n])),
    [chartData.chart],
  );
  const positions = useMemo(
    () => (chartData.chart.nodes || []).filter((n) => n.type === "position"),
    [chartData.chart],
  );

  const activeFilterCount = [
    filters.companyIds.length > 0, Boolean(filters.asOf), filters.includeInactive, !filters.includeVacant,
  ].filter(Boolean).length;

  const closeDrawer = () => { setSelectedNode(null); setEmployeesState(null); };

  const handleQuickAdd = (nodeData) => {
    if (locked) { toast.error("Unlock the chart to make changes"); return; }
    if (!nodeData) { setAddDialog({ open: true, initialKind: "department", key: "root" }); return; }
    if (nodeData.type === "employee") {
      setAddDialog({ open: true, initialKind: "reporting", initialManagerId: nodeData.rawId, key: `mgr-${nodeData.rawId}` });
    } else {
      // A department's own "+" only ever makes sense for things that live
      // inside it — sub-department, team, or designation — not the full
      // toolbar picker (which also lists Employee Assignment/Reporting
      // Relationship, neither of which take a unit as their subject).
      setAddDialog({
        open: true, initialUnitId: nodeData.rawId, contextKinds: ["sub_department", "team", "position"],
        key: `unit-${nodeData.rawId}`,
      });
    }
  };

  const handleAddSubDepartment = (node) => {
    closeDrawer();
    setAddDialog({ open: true, initialKind: "sub_department", initialUnitId: node.data.rawId, key: `subdept-${node.data.rawId}` });
  };
  const handleAddPosition = (node) => {
    closeDrawer();
    setAddDialog({ open: true, initialKind: "position", initialUnitId: node.data.rawId, key: `pos-${node.data.rawId}` });
  };
  const handleAddTeam = (node) => {
    closeDrawer();
    setAddDialog({ open: true, initialKind: "team", initialUnitId: node.data.rawId, key: `team-${node.data.rawId}` });
  };
  const handleEdit = (node) => {
    closeDrawer();
    setAddDialog({ open: true, editNode: node, key: `edit-${node.id}` });
  };
  const handleMove = (node) => {
    closeDrawer();
    setMoveDialog({ open: true, node, key: `move-${node.id}` });
  };
  const handleDragMove = (draggedNode, targetNode) => {
    if (locked) return;
    if (draggedNode.type !== "department" && draggedNode.type !== "employee") return;
    setMoveDialog({ open: true, node: draggedNode, initialTargetId: targetNode.data.rawId, key: `drag-${draggedNode.id}-${targetNode.id}` });
  };
  const handleAssignEmployee = (nodeData) => {
    if (locked) { toast.error("Unlock the chart to make changes"); return; }
    setAddDialog({
      open: true,
      initialKind: "assignment",
      initialUnitId: nodeData.metadata?.organizationUnitId,
      initialPositionId: nodeData.rawId,
      key: `assign-position-${nodeData.rawId}`,
    });
  };

  const handleSetManager = (nodeData) => {
    if (locked) { toast.error("Unlock the chart to make changes"); return; }
    if (!can("org.unit_assignment.update")) { toast.error("You don't have permission to change reporting lines"); return; }
    setSetManagerDialog({ open: true, node: nodeData, key: `set-manager-${nodeData.rawId}` });
  };

  const handleConnectNodes = (sourceId, targetId) => {
    if (locked) return;
    const sourceApi = nodesById.get(sourceId);
    const targetApi = nodesById.get(targetId);
    if (!sourceApi || !targetApi) return;
    setConnectDialog({
      open: true,
      sourceNode: { id: sourceId, data: sourceApi },
      targetNode: { id: targetId, data: targetApi },
      key: `${sourceId}-${targetId}`,
    });
  };

  const [importBusy, setImportBusy] = useState(false);
  const handleImportLegacy = async () => {
    setImportBusy(true);
    try {
      const res = await organizationApi.syncLegacyDepartments(token, tokenType);
      const {
        created = 0, updated = 0, skipped = [], departmentsDiscovered = 0, duplicatesRemoved = 0,
        assignmentsCreated = 0, assignmentsSkipped = 0, positionsCreated = 0, positionsUpdated = 0,
        assignmentsLinkedToPositions = 0, positionsDebug = null,
      } = res?.data || {};
      toast.success(
        `Imported: ${departmentsDiscovered} new department${departmentsDiscovered === 1 ? "" : "s"} discovered from employee records, `
        + `${created} created, ${updated} updated`
        + `${duplicatesRemoved ? `, ${duplicatesRemoved} duplicate${duplicatesRemoved === 1 ? "" : "s"} cleaned up` : ""}, `
        + `${assignmentsCreated} employee assignment${assignmentsCreated === 1 ? "" : "s"} linked`
        + `${assignmentsSkipped ? ` (${assignmentsSkipped} employees had no matching department)` : ""}`
        + `${skipped.length ? `, ${skipped.length} department(s) skipped` : ""}`
        + `, ${positionsCreated} designation${positionsCreated === 1 ? "" : "s"} discovered, ${positionsUpdated} updated`
        + `, ${assignmentsLinkedToPositions} employee${assignmentsLinkedToPositions === 1 ? "" : "s"} linked to a designation`
        + `${positionsDebug && positionsDebug.usersMatched === 0 ? " — see browser console for why" : ""}`,
        { duration: 8000 },
      );
      if (positionsDebug && positionsDebug.usersMatched === 0) {
        console.log("[Org Chart] Designation sync found 0 matching users — debug info:", positionsDebug);
      }
      chartData.refetch();
    } catch (err) {
      toast.error(err.message || "Could not import from Company & Unit");
    } finally {
      setImportBusy(false);
    }
  };

  // Fetches one department's employees on demand — see ChartCanvas, which
  // only calls this the moment a specific department is expanded, never for
  // the whole org at once.
  const loadDepartmentEmployees = async (unitId) => {
    const res = await organizationApi.orgUnitAssignments({ organizationUnitId: unitId }, token, tokenType);
    return assignmentsToEmployeeTree(res?.data || []);
  };

  const handleViewEmployees = async (node) => {
    setEmployeesState({ unitId: node.data.rawId, loading: true, items: [] });
    try {
      const res = await organizationApi.orgUnitAssignments({ organizationUnitId: node.data.rawId }, token, tokenType);
      setEmployeesState({ unitId: node.data.rawId, loading: false, items: res?.data || [] });
    } catch {
      setEmployeesState({ unitId: node.data.rawId, loading: false, items: [] });
    }
  };

  const handleDeleteRequest = (node) => {
    const impact = node.type === "department" ? [
      `${node.data.employeeCount ?? 0} employees`,
      `${node.data.metadata?.positionCount ?? 0} positions`,
      node.data.hasChildren ? "Has sub-units" : null,
    ].filter(Boolean) : node.type === "position" ? [
      `${node.data.employeeCount ?? 0} employees currently filling this position`,
    ] : [];
    setConfirmDelete({ open: true, node, impact });
    closeDrawer();
  };

  const confirmDeleteNow = async () => {
    const node = confirmDelete.node;
    setDeleteBusy(true);
    try {
      const { rawId } = parseNodeId(node.id);
      if (node.type === "department") {
        const before = { name: node.data.name, code: node.data.code, type: node.data.type, parentId: node.data.metadata?.parentId || null };
        await history.run({
          label: `Delete ${before.name}`,
          do: () => organizationApi.deleteOrgUnit(rawId, token, tokenType),
          undo: () => organizationApi.createOrgUnit(before, token, tokenType),
        });
      } else if (node.type === "position") {
        const unitId = node.data.metadata?.organizationUnitId;
        const before = { title: node.data.name, code: node.data.code, approvedHeadcount: node.data.approvedHeadcount };
        await history.run({
          label: `Delete ${before.title}`,
          do: () => organizationApi.deleteOrgUnitPosition(unitId, rawId, token, tokenType),
          undo: () => organizationApi.createOrgUnitPosition(unitId, before, token, tokenType),
        });
      }
      toast.success("Deleted");
      setConfirmDelete({ open: false });
      chartData.refetch();
    } catch (err) {
      toast.error(err.message || "Could not delete — resolve dependencies first");
    } finally {
      setDeleteBusy(false);
    }
  };

  const onDoneMutating = () => chartData.refetch();

  return (
    <div className="min-w-0 max-w-full space-y-4">
      {can("org.unit.create") && !locked && (
        <div className="flex justify-end">
          <Button onClick={() => setAddDialog({ open: true, key: "toolbar" })}>
            <Plus size={16} /> Add
          </Button>
        </div>
      )}

      <KpiRow orgUnits={chartData.orgUnits} companies={chartData.companies} summary={chartData.summary} chart={chartData.chart} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_1fr_300px]">
        <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 xl:h-[720px]">
          <OrgTreePanel
            orgUnits={chartData.orgUnits}
            companies={chartData.companies}
            companyId={filters.companyIds[0] || ""}
            onCompanyChange={(id) => setFilters((f) => ({ ...f, companyIds: id ? [id] : [] }))}
            view={view}
            onViewChange={setView}
            selectedId={selectedNode?.id}
            onSelect={(unit) => setSelectedNode({ id: `org_unit_${unit.id}`, type: "department", data: nodesById.get(`org_unit_${unit.id}`) || { name: unit.name, rawId: unit.id, metadata: {} } })}
            onAddUnit={() => setAddDialog({ open: true, initialKind: "department", key: "tree-add" })}
            canAdd={can("org.unit.create") && !locked}
            onImportLegacy={handleImportLegacy}
            canImportLegacy={can("org.unit.create") && !importBusy}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 xl:h-[720px]">
          <ChartCanvas
            chart={chartData.chart}
            orgUnits={chartData.orgUnits}
            companies={chartData.companies}
            units={chartData.units}
            branchSummary={chartData.branchSummary}
            selectedNodeId={selectedNode?.id}
            onSelectNode={setSelectedNode}
            onQuickAdd={handleQuickAdd}
            onSetManager={handleSetManager}
            onAssignEmployee={handleAssignEmployee}
            employeeRefreshSignal={employeeRefreshSignal}
            onOpenFilters={() => setFilterOpen(true)}
            activeFilterCount={activeFilterCount}
            searchValue={chartSearch}
            onSearchChange={(v) => { setChartSearch(v); setFilters((f) => ({ ...f, search: v })); }}
            history={history}
            onConnectNodes={handleConnectNodes}
            onDragMove={handleDragMove}
            onLoadDepartmentEmployees={loadDepartmentEmployees}
            loading={chartData.loading}
            onImportLegacy={handleImportLegacy}
            canImportLegacy={can("org.unit.create") && !importBusy}
            locked={locked}
            onToggleLock={() => setLocked((l) => !l)}
            canUnlock={canEditAnything(can)}
          />
        </div>

        <div className="xl:h-[720px] xl:overflow-y-auto">
          <InsightsPanel
            chart={chartData.chart}
            summary={chartData.summary}
            activity={chartData.activity}
            loading={chartData.loading}
          />
        </div>
      </div>

      <NodeDetailDrawer
        node={selectedNode}
        canManage={canManageNode(can, selectedNode, locked)}
        employees={selectedNode?.type === "department" && employeesState?.unitId === selectedNode?.data?.rawId ? employeesState : null}
        actions={{
          onEdit: handleEdit,
          onAddSubDepartment: handleAddSubDepartment,
          onAddPosition: handleAddPosition,
          onAddTeam: handleAddTeam,
          onViewEmployees: handleViewEmployees,
          onAssignEmployee: (node) => handleAssignEmployee(node.data),
          onMove: handleMove,
          onDelete: handleDeleteRequest,
        }}
        onClose={closeDrawer}
      />

      {addDialog.open && (
        <AddItemDialog
          key={addDialog.key}
          open={addDialog.open}
          initialKind={addDialog.initialKind}
          initialUnitId={addDialog.initialUnitId}
          initialManagerId={addDialog.initialManagerId}
          initialPositionId={addDialog.initialPositionId}
          contextKinds={addDialog.contextKinds}
          editNode={addDialog.editNode}
          orgUnits={chartData.orgUnits}
          companies={chartData.companies}
          positions={positions}
          token={token}
          tokenType={tokenType}
          canCreate={(kind) => can(permissionForKind(kind))}
          run={history.run}
          onClose={() => setAddDialog({ open: false })}
          onDone={onDoneMutating}
        />
      )}

      {moveDialog.open && (
        <MoveDialog
          key={moveDialog.key}
          open={moveDialog.open}
          node={moveDialog.node}
          orgUnits={chartData.orgUnits}
          token={token}
          tokenType={tokenType}
          run={history.run}
          onClose={() => setMoveDialog({ open: false })}
          onDone={onDoneMutating}
        />
      )}

      {connectDialog.open && (
        <ConnectRelationshipDialog
          key={connectDialog.key}
          open={connectDialog.open}
          sourceNode={connectDialog.sourceNode}
          targetNode={connectDialog.targetNode}
          token={token}
          tokenType={tokenType}
          run={history.run}
          onClose={() => setConnectDialog({ open: false })}
          onDone={onDoneMutating}
        />
      )}

      {setManagerDialog.open && (
        <SetManagerDialog
          key={setManagerDialog.key}
          open={setManagerDialog.open}
          node={setManagerDialog.node}
          token={token}
          tokenType={tokenType}
          run={history.run}
          onClose={() => setSetManagerDialog({ open: false })}
          onDone={(unitId) => setEmployeeRefreshSignal({ unitId, ts: Date.now() })}
        />
      )}

      <FilterDrawer
        open={filterOpen}
        filters={filters}
        companies={chartData.companies}
        onChange={setFilters}
        onClose={() => setFilterOpen(false)}
        onClear={() => setFilters(DEFAULT_FILTERS)}
      />

      <ConfirmDialog
        open={confirmDelete.open}
        title={`Delete ${confirmDelete.node?.data?.name || ""}?`}
        body={confirmDelete.impact?.length ? "This will fail if any of the below still depend on it — resolve them first." : "This cannot be undone from here, but the chart's Undo button can restore it immediately after."}
        impact={confirmDelete.impact}
        danger
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDeleteNow}
        onCancel={() => setConfirmDelete({ open: false })}
      />
    </div>
  );
}
