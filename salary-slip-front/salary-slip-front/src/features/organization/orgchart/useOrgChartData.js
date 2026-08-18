import { useCallback, useEffect, useRef, useState } from "react";
import { organizationApi } from "../services/organizationApi";

const EMPTY_CHART = { nodes: [], edges: [], meta: {} };

function mergeCharts(a, b) {
  const nodes = [];
  const seenNodes = new Set();
  [...(a?.nodes || []), ...(b?.nodes || [])].forEach((node) => {
    if (!seenNodes.has(node.id)) {
      seenNodes.add(node.id);
      nodes.push(node);
    }
  });

  const edges = [];
  const seenEdges = new Set();
  [...(a?.edges || []), ...(b?.edges || [])].forEach((edge) => {
    if (!seenEdges.has(edge.id)) {
      seenEdges.add(edge.id);
      edges.push(edge);
    }
  });

  return { nodes, edges, meta: { ...(a?.meta || {}), ...(b?.meta || {}) } };
}

const SYNC_POLL_MS = 60000;

/**
 * The department/position chart types carry headcount, but not the actual
 * employee list — there's no unit -> employee edge anywhere in
 * OrganizationChartService. Assignments (EmployeeOrganizationAssignment)
 * are the real link, so this turns each employee's *primary, active*
 * assignment into one employee node plus one unit -> employee edge, giving
 * a real tree instead of a bare headcount number. Non-primary/inactive
 * assignments are skipped so every employee has exactly one parent (a tree,
 * not a DAG) and a duplicate primary row can't produce two parents.
 *
 * Deliberately NOT called for the whole org up front — with real headcount
 * in the thousands that means thousands of DOM nodes and a dagre layout
 * pass that can take the browser down with it. ChartCanvas calls this
 * per-department, only for a department someone actually expands, via
 * organizationApi.orgUnitAssignments({ organizationUnitId }).
 */
export function assignmentsToEmployeeTree(assignments) {
  const nodes = [];
  const edges = [];
  const seenUsers = new Set();

  assignments.forEach((a) => {
    if (!a.isPrimary || !a.isActive || seenUsers.has(a.userId)) return;
    seenUsers.add(a.userId);

    nodes.push({
      id: `user_${a.userId}`,
      type: "employee",
      code: a.userEmpCode,
      name: a.userName,
      title: a.designationTitle || a.positionTitle || "Employee",
      employeeCount: 1,
      approvedHeadcount: 0,
      vacancy: 0,
      isActive: true,
      metadata: { department: a.organizationUnitName },
    });

    edges.push({
      id: `edge_assignment_${a.id}`,
      source: `org_unit_${a.organizationUnitId}`,
      target: `user_${a.userId}`,
      type: "primary",
    });
  });

  return { nodes, edges };
}

/**
 * Fetch orchestration for the Org Chart workspace: chart nodes/edges (via
 * the existing OrganizationChartService), the org-unit tree for the left
 * panel, headcount totals and recent activity for the insights panel, and
 * the company list for the selector. All existing endpoints — see the plan
 * for why no new chart-shaped backend work was needed here.
 */
export function useOrgChartData({ token, tokenType, view, filters }) {
  const [chart, setChart] = useState(EMPTY_CHART);
  const [orgUnits, setOrgUnits] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [summary, setSummary] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // organization_units is a synced copy of the real Company & Unit data
  // (departments/department_managers/users.department), not read live — so
  // the chart auto-syncs once per mount before its first fetch, rather than
  // requiring someone to remember to click "Import from Company & Unit"
  // every time a department or assignment changes over there. Best-effort:
  // a viewer without org.unit.create (e.g. read-only chart access) just
  // sees whatever was last synced, same as before this existed.
  const [readyToFetch, setReadyToFetch] = useState(false);
  // Only the very first load shows the full canvas spinner — the 60s
  // background poll (below) refreshes data in place without one, so it
  // doesn't flash the whole chart blank every minute.
  const hasLoadedOnceRef = useRef(false);

  const refetch = useCallback(() => setRefreshKey((v) => v + 1), []);
  const companyIdsKey = JSON.stringify(filters.companyIds || []);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    organizationApi.legalEntityProfileCompanies(token, tokenType)
      .then((res) => { if (active) setCompanies(res?.data ?? []); })
      .catch(() => {});
    return () => { active = false; };
  }, [token, tokenType]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    organizationApi.syncLegacyDepartments(token, tokenType)
      .catch(() => {})
      .finally(() => { if (active) setReadyToFetch(true); });
    return () => { active = false; };
  }, [token, tokenType]);

  // "All time sync": re-run the legacy sync and refetch in the background
  // for as long as the chart stays mounted, so a department/manager/user
  // added over in Company & Unit shows up here without anyone navigating
  // away and back. Best-effort — the same silent-catch as the initial sync.
  useEffect(() => {
    if (!token) return undefined;
    const id = setInterval(() => {
      organizationApi.syncLegacyDepartments(token, tokenType)
        .catch(() => {})
        .finally(() => refetch());
    }, SYNC_POLL_MS);
    return () => clearInterval(id);
  }, [token, tokenType, refetch]);

  useEffect(() => {
    if (!token || !readyToFetch) return undefined;
    let active = true;

    // Setting loading/error happens inside this async runner rather than
    // synchronously at the top of the effect, matching the rest of this
    // codebase's data-fetching effects (see Positions.jsx/Assignments.jsx) —
    // the lint rule here specifically targets synchronous setState calls at
    // effect-execution time, not ones inside an async continuation.
    const run = async () => {
      if (!active) return;
      if (!hasLoadedOnceRef.current) setLoading(true);
      setError(null);

      const companyIds = filters.companyIds?.length ? filters.companyIds : undefined;
      const baseFilters = {
        asOf: filters.asOf || undefined,
        rootId: filters.rootId || undefined,
        maxDepth: filters.maxDepth || 8,
        includeInactive: filters.includeInactive || false,
        includeVacant: filters.includeVacant ?? true,
        search: filters.search || undefined,
        companyIds,
      };

      // Organization View only ever fetches structural nodes (department,
      // team, position) — never the employee list. At real scale (this org
      // alone is heading past 10,000 employees) building every employee as
      // a node up front is the one thing guaranteed to eventually hang the
      // tab, no matter how aggressively collapse defaults are tuned. Each
      // department's employees are loaded lazily by ChartCanvas only when
      // that specific department is expanded.
      const chartPromise = view === "reporting"
        ? organizationApi.orgChart({ ...baseFilters, chartType: "manager_hierarchy" }, token, tokenType)
          .then((res) => res?.data)
        : Promise.all([
          organizationApi.orgChart({ ...baseFilters, chartType: "department" }, token, tokenType),
          organizationApi.orgChart({ ...baseFilters, chartType: "team" }, token, tokenType),
          organizationApi.orgChart({ ...baseFilters, chartType: "position" }, token, tokenType),
        ]).then(([deptRes, teamRes, posRes]) => mergeCharts(mergeCharts(deptRes?.data, teamRes?.data), posRes?.data));

      try {
        const [chartData, unitsRes, summaryRes, activityRes] = await Promise.all([
          chartPromise,
          organizationApi.orgUnits({ companyIds, search: filters.search || undefined }, token, tokenType),
          organizationApi.headcountSummary(companyIds ? { companyIds } : {}, token, tokenType),
          organizationApi.recentActivity({ perPage: 8 }, token, tokenType).catch(() => ({ data: { items: [] } })),
        ]);
        if (!active) return;
        setChart(chartData ?? EMPTY_CHART);
        setOrgUnits(unitsRes?.data ?? []);
        setSummary(summaryRes?.data?.totals ?? null);
        setActivity(activityRes?.data?.items ?? []);
        hasLoadedOnceRef.current = true;
      } catch (err) {
        if (active) setError(err);
      } finally {
        if (active) setLoading(false);
      }
    };

    run();

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    token, tokenType, view, refreshKey, readyToFetch,
    filters.asOf, filters.rootId, filters.maxDepth, filters.includeInactive,
    filters.includeVacant, filters.search, companyIdsKey,
  ]);

  return { chart, orgUnits, companies, summary, activity, loading, error, refetch };
}
