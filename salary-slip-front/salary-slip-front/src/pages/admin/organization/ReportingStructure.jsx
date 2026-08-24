import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Users, Plus, RefreshCw, Search, Loader2, Pencil, Trash2, Power, PowerOff, Shield,
  Building2, Mail, Flag, Calendar,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { organizationApi } from "../../../features/organization/services/organizationApi";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

const REL_TYPES = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "functional", label: "Functional" },
  { value: "project", label: "Project" },
  { value: "matrix", label: "Matrix" },
];

const LEADERSHIP_TYPES = [
  { value: "head", label: "Head" },
  { value: "manager", label: "Manager" },
  { value: "lead", label: "Lead" },
  { value: "coordinator", label: "Coordinator" },
];

function Th({ children, className = "" }) {
  return <th scope="col" className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</th>;
}

export default function ReportingStructurePage() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [relationships, setRelationships] = useState([]);
  const [leadershipAssignments, setLeadershipAssignments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [relType, setRelType] = useState("ALL");
  const [dialog, setDialog] = useState(null);
  const [chainEmployeeId, setChainEmployeeId] = useState("");

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    Promise.all([
      organizationApi.reportingRelationships({ search, status, relationship_type: setRelType === "ALL" ? undefined : setRelType }, token, tokenType),
      organizationApi.legalEntityProfileCompanies(token, tokenType).catch(() => ({ data: [] })),
    ]).then(([rels, companiesRes]) => {
      if (!active) return;
      setRelationships(rels?.data ?? []);
      setCompanies(companiesRes?.data ?? []);
    }).catch((err) => toast.error(err.message || "Could not load reporting relationships")).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, tokenType, search, status, setRelType, refreshKey]);

  const changeFilter = (setter) => (value) => { setLoading(true); setter(value); };

  const run = async (work, message, after = () => {}) => {
    setBusy(true);
    try { await work(); toast.success(message); after(); reload(); } catch (err) { toast.error(err.message || "That did not work"); } finally { setBusy(false); }
  };

  const saveRelationship = (payload) => run(
    () => dialog?.id
      ? organizationApi.updateReportingRelationship(dialog.id, payload, token, tokenType)
      : organizationApi.createReportingRelationship(payload, token, tokenType),
    dialog?.id ? "Relationship updated" : "Relationship created",
  );

  const companyOptions = useMemo(() => companies.map((c) => ({ id: c.id, name: c.name })), [companies]);
  const canManage = can("org.reporting.create") || can("org.reporting.update");

  // Chain loading
  const fetchChain = useCallback(async () => {
    if (!chainEmployeeId) return;
    setBusy(true);
    try {
      const res = await organizationApi.reportingChain(chainEmployeeId, undefined, token, tokenType);
      toast.info(res?.data ? `Chain loaded: ${res.data.length} relationships` : "No chain data");
    } catch (err) {
      toast.error(err.message || "Could not load reporting chain");
    } finally { setBusy(false); }
  }, [chainEmployeeId, token, tokenType]);

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Users size={20} /> Reporting Structure
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Primary and secondary reporting relationships, upward reporting chains, and leadership assignments across the organization.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              aria-label="Search relationships"
              className={`${inputClass} w-64 pl-8`}
              placeholder="Search employee name or emp code…"
              value={search}
              onChange={(e) => changeFilter(setSearch)(e.target.value)}
            />
          </div>

          <select
            aria-label="Filter by status"
            className={`${inputClass} w-36`}
            value={status}
            onChange={(e) => changeFilter(setStatus)(e.target.value)}
          >
            {STATUS_FILTERS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>

          <select
            aria-label="Filter by relationship type"
            className={`${inputClass} w-40`}
            value={relType === "ALL" ? "" : relType}
            onChange={(e) => setRelType(e.target.value)}
          >
            <option value="ALL">All Types</option>
            {REL_TYPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={reload}><RefreshCw size={16} /> Refresh</Button>
            {can("org.reporting.create") && (
              <Button onClick={() => setDialog({})}><Plus size={16} /> Add Relationship</Button>
            )}
          </div>
        </div>
      </Card>

      <Card padding={false}>
        {loading && <div className="p-4"><SkeletonTable rows={5} /></div>}
        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <tr>
                  <Th>Employee</Th>
                  <Th>Emp Code</Th>
                  <Th>Manager</Th>
                  <Th>Rel Type</Th>
                  <Th>Effective From</Th>
                  <Th>Is Active</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {relationships.length === 0 && (
                  <tr><td colSpan={7} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    No reporting relationships match these filters.
                  </td></tr>
                )}

                {relationships.map((rel) => (
                  <tr key={rel.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{rel.employeeName}</td>
                    <td className="px-4 py-3 font-mono text-gray-500 dark:text-gray-300">{rel.employeeEmpCode || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{rel.managerName || "—"}</td>
                    <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{rel.relationshipType || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{rel.effectiveFrom || "—"}</td>
                    <td className="px-4 py-3">
                      {rel.isActive === undefined ? (
                        <span className="text-gray-500">—</span>
                      ) : rel.isActive === true ? (
                        <Badge variant="green">Active</Badge>
                      ) : (
                        <Badge variant="red">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {can("org.reporting.update") && (
                          <Button size="sm" variant="ghost" onClick={() => setDialog(rel)}><Pencil size={14} /></Button>
                        )}
                        {can("org.reporting.status") && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => run(() => organizationApi.setLegalEntityProfileStatus(rel.id, !rel.isActive, token, tokenType), rel.isActive ? "Relationship deactivated" : "Relationship activated")}
                          >
                            {rel.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!canManage && !loading && (
        <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Shield size={13} className="text-gray-400" />
          Reporting structure management is restricted to administrators.
        </p>
      )}

      {/* Chain section */}
      <Card>
        <div className="p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Reporting Chain</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400">Employee *</label>
              <select
                className={inputClass}
                onChange={(e) => { setChainEmployeeId(e.target.value); fetchChain(); }}
              >
                <option value="">Select employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} ({e.empCode || ""})</option>
                ))}
              </select>
            </div>
            <div>
              <Button onClick={fetchChain} disabled={busy}>
                {busy && <Loader2 size={16} className="animate-spin" />}
                {busy ? "Loading…" : "Load Chain"}
              </Button>
            </div>
          </div>
          {chainEmployeeId && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Loading chain for employee ID: {chainEmployeeId}
            </p>
          )}
        </div>
      </Card>

      {/* Leadership Assignments subsection */}
      <Card>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Leadership Assignments</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              <tr>
                <Th>User</Th>
                <Th>Leadership Type</Th>
                <Th>Scope</Th>
                <Th>Effective From</Th>
                <Th>Is Active</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {leadershipAssignments.length === 0 && (
                <tr><td colSpan={6} className="p-10 text-center text-gray-500 dark:text-gray-400">
                  No leadership assignments found.
                </td></tr>
              )}
              {leadershipAssignments.map((la) => (
                <tr key={la.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{la.userName}</td>
                  <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{la.leadershipType || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{la.scopeType || "—"} #{la.scopeId || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{la.effectiveFrom || "—"}</td>
                  <td className="px-4 py-3">
                    {la.isActive === undefined ? (
                      <span className="text-gray-500">—</span>
                    ) : la.isActive === true ? (
                      <Badge variant="green">Active</Badge>
                    ) : (
                      <Badge variant="red">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {can("org.reporting_leadership.update") && (
                        <Button size="sm" variant="ghost" onClick={() => setDialog(la)}><Pencil size={14} /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}