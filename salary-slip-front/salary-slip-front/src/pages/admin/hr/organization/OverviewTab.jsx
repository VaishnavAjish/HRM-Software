import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Search, Users, RefreshCw } from "lucide-react";
import Badge from "../../../../components/ui/Badge";
import Button from "../../../../components/ui/Button";
import Card from "../../../../components/ui/Card";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import { useAuth } from "../../../../context/AuthContext";
import { organizationApi } from "../../../../features/organization/services/organizationApi";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

function KpiTile({ label, value }) {
  return (
    <Card padding={false} className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value ?? 0}</p>
    </Card>
  );
}

export default function OverviewTab() {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [units, setUnits] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [positions, setPositions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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
    organizationApi.headcountSummary(
      companyId ? { companyIds: [companyId] } : {},
      token, tokenType,
    )
      .then((res) => { if (active) setSummary(res?.data?.totals ?? null); })
      .catch(() => {});
    return () => { active = false; };
  }, [token, tokenType, companyId, refreshKey]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    organizationApi.orgUnits(
      { companyIds: companyId ? [companyId] : undefined, search: search || undefined },
      token, tokenType,
    )
      .then((res) => { if (active) setUnits(res?.data ?? []); })
      .catch((err) => toast.error(err.message || "Could not load organization units"))
      .finally(() => { if (active) setLoadingUnits(false); });
    return () => { active = false; };
  }, [token, tokenType, companyId, search, refreshKey]);

  useEffect(() => {
    if (!token || !selectedUnitId) return undefined;
    let active = true;
    organizationApi.orgUnitPositions(selectedUnitId, {}, token, tokenType)
      .then((res) => { if (active) setPositions(res?.data ?? []); })
      .catch((err) => toast.error(err.message || "Could not load positions"))
      .finally(() => { if (active) setLoadingPositions(false); });
    return () => { active = false; };
  }, [token, tokenType, selectedUnitId]);

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId) || null,
    [units, selectedUnitId],
  );

  const reload = useCallback(() => { setLoadingUnits(true); setRefreshKey((v) => v + 1); }, []);

  const changeSearch = (event) => { setLoadingUnits(true); setSearch(event.target.value); };

  const changeCompany = (event) => {
    setLoadingUnits(true);
    setCompanyId(event.target.value);
    setSelectedUnitId(null);
    setPositions([]);
  };

  const selectUnit = (unitId) => {
    setSelectedUnitId(unitId);
    setLoadingPositions(true);
    setPositions([]);
  };

  return (
    <div className="min-w-0 max-w-full space-y-5">
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile label="Org Units" value={units.length} />
          <KpiTile label="Positions" value={summary.positionCount} />
          <KpiTile label="Approved HC" value={summary.approvedHeadcount} />
          <KpiTile label="Filled" value={summary.filledHeadcount} />
          <KpiTile label="Vacant" value={summary.vacantHeadcount} />
          <KpiTile label="Frozen" value={summary.frozenCount} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card padding={false} className="lg:col-span-2">
          <div className="border-b border-gray-200 p-4 dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  aria-label="Search organization units"
                  className={`${inputClass} pl-8`}
                  placeholder="Search department or unit…"
                  value={search}
                  onChange={changeSearch}
                />
              </div>
              <select
                aria-label="Filter by company"
                className={`${inputClass} w-40`}
                value={companyId}
                onChange={changeCompany}
              >
                <option value="">All companies</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Button variant="ghost" onClick={reload} title="Refresh"><RefreshCw size={16} /></Button>
            </div>
          </div>

          {loadingUnits && <div className="p-4"><SkeletonTable rows={6} /></div>}

          {!loadingUnits && (
            <div className="max-h-[520px] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700/60">
              {units.length === 0 && (
                <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No organization units match these filters.
                </p>
              )}
              {units.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => selectUnit(unit.id)}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/40 ${
                    selectedUnitId === unit.id ? "bg-brand-50 dark:bg-brand-900/20" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-900 dark:text-white">{unit.name}</span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {unit.companyName || "—"} · {unit.managerName ? `Manager: ${unit.managerName}` : "No manager set"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant={unit.status === "active" ? "green" : "gray"}>
                      <span className="capitalize">{unit.type?.replace(/_/g, " ") || "—"}</span>
                    </Badge>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-3">
          {!selectedUnit && (
            <p className="flex h-full min-h-[200px] items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
              Select an organization unit to see its positions.
            </p>
          )}

          {selectedUnit && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedUnit.name}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedUnit.companyName || "—"} · {selectedUnit.parentName ? `Under ${selectedUnit.parentName}` : "Top level"}
                  </p>
                </div>
                <Badge variant={selectedUnit.status === "active" ? "green" : "gray"}>
                  <span className="capitalize">{selectedUnit.status}</span>
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Manager</p>
                  <p className="text-gray-900 dark:text-white">{selectedUnit.managerName || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Active Assignments</p>
                  <p className="text-gray-900 dark:text-white">{selectedUnit.assignmentCount ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Sub-units</p>
                  <p className="text-gray-900 dark:text-white">{selectedUnit.hasChildren ? "Yes" : "No"}</p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  <Users size={15} /> Positions
                </div>
                {loadingPositions && <SkeletonTable rows={3} />}
                {!loadingPositions && positions.length === 0 && (
                  <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    No positions on this unit yet.
                  </p>
                )}
                {!loadingPositions && positions.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        <tr>
                          <th className="px-3 py-2">Title</th>
                          <th className="px-3 py-2">Approved</th>
                          <th className="px-3 py-2">Filled</th>
                          <th className="px-3 py-2">Vacant</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {positions.map((pos) => (
                          <tr key={pos.id}>
                            <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{pos.title}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{pos.approvedHeadcount ?? 0}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{pos.filledHeadcount ?? pos.currentHeadcount ?? 0}</td>
                            <td className="px-3 py-2">
                              <span className={pos.vacantHeadcount > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : "text-gray-600 dark:text-gray-300"}>
                                {pos.vacantHeadcount ?? pos.vacancy ?? 0}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant={pos.status === "frozen" ? "yellow" : "green"}>
                                <span className="capitalize">{pos.status}</span>
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
