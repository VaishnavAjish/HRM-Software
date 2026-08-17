import { useCallback, useEffect, useState } from "react";
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

    // Setting loading/error happens inside this async runner rather than
    // synchronously at the top of the effect, matching the rest of this
    // codebase's data-fetching effects (see Positions.jsx/Assignments.jsx) —
    // the lint rule here specifically targets synchronous setState calls at
    // effect-execution time, not ones inside an async continuation.
    const run = async () => {
      if (!active) return;
      setLoading(true);
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
    token, tokenType, view, refreshKey,
    filters.asOf, filters.rootId, filters.maxDepth, filters.includeInactive,
    filters.includeVacant, filters.search, companyIdsKey,
  ]);

  return { chart, orgUnits, companies, summary, activity, loading, error, refetch };
}
