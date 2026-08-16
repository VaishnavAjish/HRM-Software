import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, RefreshCw, Search, Loader2, Pencil, Trash2, Shield, Building2, Snowflake, PlayCircle } from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { organizationApi } from "../../../features/organization/services/organizationApi";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "FROZEN", label: "Frozen" },
];

const POSITION_TYPES = [
  { value: "executive", label: "Executive" },
  { value: "manager", label: "Manager" },
  { value: "staff", label: "Staff" },
  { value: "intern", label: "Intern" },
  { value: "contractor", label: "Contractor" },
];

const POSITION_STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "frozen", label: "Frozen" },
];

function Th({ children, className = "" }) {
  return <th scope="col" className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</th>;
}

export default function PositionsPage() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [unitId, setUnitId] = useState("");
  const [positions, setPositions] = useState([]);
  const [orgUnits, setOrgUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [dialog, setDialog] = useState(null);
  const [summary, setSummary] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    organizationApi.headcountSummary({}, token, tokenType)
      .then((res) => { if (active) setSummary(res?.data?.totals ?? null); })
      .catch(() => {});
    return () => { active = false; };
  }, [token, tokenType, refreshKey]);

  // Org units populate the unit picker itself, so they load independently
  // of whether a unit is already selected — the old code fetched companies
  // only after a unit was picked, which meant the picker could never be
  // populated in the first place.
  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    organizationApi.orgUnits({}, token, tokenType)
      .then((res) => { if (active) setOrgUnits(res?.data ?? []); })
      .finally(() => { if (active) setUnitsLoading(false); });
    return () => { active = false; };
  }, [token, tokenType]);

  useEffect(() => {
    if (!token || !unitId) return undefined;
    let active = true;
    organizationApi.orgUnitPositions(unitId, { search, status }, token, tokenType)
      .then((res) => { if (active) setPositions(res?.data ?? []); })
      .catch((err) => toast.error(err.message || "Could not load positions"))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, tokenType, unitId, search, status, refreshKey]);

  const changeFilter = (setter) => (value) => { setLoading(true); setter(value); };

  const run = async (work, message, after = () => {}) => {
    setBusy(true);
    try { await work(); toast.success(message); after(); reload(); } catch (err) { toast.error(err.message || "That did not work"); } finally { setBusy(false); }
  };

  const save = (payload) => run(
    () => dialog?.id
      ? organizationApi.updateOrgUnitPosition(unitId, dialog.id, payload, token, tokenType)
      : organizationApi.createOrgUnitPosition(unitId, payload, token, tokenType),
    dialog?.id ? "Position updated" : "Position created",
  );

  const freeze = (pos) => {
    const reason = window.prompt("Why is this position being frozen?");
    if (!reason) return;
    run(() => organizationApi.freezeOrgUnitPosition(unitId, pos.id, reason, token, tokenType), "Position frozen");
  };

  const release = (pos) => run(
    () => organizationApi.releaseOrgUnitPosition(unitId, pos.id, token, tokenType),
    "Position released",
  );

  const canManage = can("org.unit_position.create") || can("org.unit_position.update");

  const unitGroups = useMemo(() => {
    const byCompany = new Map();
    const other = [];
    orgUnits.forEach((unit) => {
      if (unit.companyId != null) {
        const key = unit.companyName || `Company ${unit.companyId}`;
        if (!byCompany.has(key)) byCompany.set(key, []);
        byCompany.get(key).push(unit);
      } else {
        other.push(unit);
      }
    });
    const groups = Array.from(byCompany.entries()).map(([label, units]) => ({ label, units }));
    if (other.length > 0) groups.push({ label: "Other", units: other });
    return groups;
  }, [orgUnits]);

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Building2 size={20} /> Positions
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Roles and positions within the selected organization unit, with headcount and reporting.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Positions", value: summary.positionCount },
            { label: "Approved", value: summary.approvedHeadcount },
            { label: "Budgeted", value: summary.budgetedHeadcount },
            { label: "Filled", value: summary.filledHeadcount },
            { label: "Vacant", value: summary.vacantHeadcount },
            { label: "Frozen", value: summary.frozenCount },
          ].map((tile) => (
            <Card key={tile.label} padding={false} className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{tile.label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{tile.value ?? 0}</p>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              aria-label="Search positions"
              className={`${inputClass} w-64 pl-8`}
              placeholder="Search title or code…"
              value={search}
              onChange={(e) => changeFilter(setSearch)(e.target.value)}
            />
          </div>

          <select
            aria-label="Select unit"
            className={`${inputClass} w-48`}
            value={unitId || ""}
            onChange={(e) => { setUnitId(e.target.value); reload(); }}
            disabled={unitsLoading}
          >
            <option value="">{unitsLoading ? "Loading units…" : "Select organization unit"}</option>
            {unitGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </optgroup>
            ))}
          </select>

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

          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={reload}><RefreshCw size={16} /> Refresh</Button>
            {can("org.unit_position.create") && (
              <Button onClick={() => setDialog({})}><Plus size={16} /> Add Position</Button>
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
                  <Th>Title</Th>
                  <Th>Code</Th>
                  <Th>Type</Th>
                  <Th>Reports To</Th>
                  <Th>Approved</Th>
                  <Th>Budgeted</Th>
                  <Th>Filled</Th>
                  <Th>Vacant</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {positions.length === 0 && (
                  <tr><td colSpan={10} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    No positions match these filters.
                  </td></tr>
                )}

                {positions.map((pos) => (
                  <tr key={pos.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{pos.title}</td>
                    <td className="px-4 py-3 font-mono text-gray-500 dark:text-gray-300">{pos.code || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><span className="capitalize">{pos.type || "—"}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{pos.reportsToPositionName || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{pos.approvedHeadcount ?? 0}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{pos.budgetedHeadcount ?? pos.approvedHeadcount ?? 0}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{pos.filledHeadcount ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={pos.vacantHeadcount > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : "text-gray-600 dark:text-gray-300"}>
                        {pos.vacantHeadcount ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={pos.status === "frozen" ? "yellow" : pos.status === "closed" || pos.status === "cancelled" ? "red" : "green"}>
                        <span className="capitalize">{pos.status || "—"}</span>
                      </Badge>
                      {pos.status === "frozen" && pos.freezeReason && (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{pos.freezeReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {can("org.unit_position.update") && pos.status !== "frozen" && (
                          <Button size="sm" variant="ghost" title="Freeze position" onClick={() => freeze(pos)}>
                            <Snowflake size={14} />
                          </Button>
                        )}
                        {can("org.unit_position.update") && pos.status === "frozen" && (
                          <Button size="sm" variant="ghost" title="Release position" onClick={() => release(pos)}>
                            <PlayCircle size={14} className="text-green-600 dark:text-green-400" />
                          </Button>
                        )}
                        {can("org.unit_position.update") && (
                          <Button size="sm" variant="ghost" onClick={() => setDialog(pos)}><Pencil size={14} /></Button>
                        )}
                        {can("org.unit_position.delete") && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => run(() => organizationApi.deleteOrgUnitPosition(unitId, pos.id, token, tokenType), "Position deleted")}
                          >
                            <Trash2 size={14} className="text-red-600 dark:text-red-400" />
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
          Position management is restricted to administrators.
        </p>
      )}

      {dialog && (
        <Modal isOpen onClose={() => setDialog(null)} title={dialog?.id ? "Edit Position" : "Add Position"} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block"><span className={labelClass}>Title *</span><input className={inputClass} value={dialog?.title ?? ""} onChange={(e) => setDialog({...dialog, title: e.target.value})} /></label>
              <label className="block"><span className={labelClass}>Code</span><input className={inputClass} value={dialog?.code ?? ""} onChange={(e) => setDialog({...dialog, code: e.target.value})} /></label>
              <label className="block"><span className={labelClass}>Type</span>
                <select className={inputClass} value={dialog?.type ?? "staff"} onChange={(e) => setDialog({...dialog, type: e.target.value})}>
                  {POSITION_TYPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </label>
              <label className="block"><span className={labelClass}>Approved Headcount</span><input type="number" min="0" className={inputClass} value={dialog?.approvedHeadcount ?? 0} onChange={(e) => setDialog({...dialog, approvedHeadcount: Number(e.target.value)})} /></label>
              <label className="block"><span className={labelClass}>Budgeted Headcount</span><input type="number" min="0" className={inputClass} value={dialog?.budgetedHeadcount ?? dialog?.approvedHeadcount ?? 0} onChange={(e) => setDialog({...dialog, budgetedHeadcount: Number(e.target.value)})} /></label>
              <label className="block"><span className={labelClass}>Reports To</span><input className={inputClass} value={dialog?.reportsToPositionName || ""} readOnly /></label>
            </div>
            <div>
              <label className="block"><span className={labelClass}>Status</span>
                <select className={inputClass} value={dialog?.isActive !== undefined ? (dialog.isActive ? "ACTIVE" : "INACTIVE") : "ALL"} onChange={(e) => setDialog({...dialog, isActive: e.target.value === "ACTIVE"})}>
                  {STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
            </div>
          </div>
          <footer className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button disabled={busy} onClick={() => save({ title: dialog?.title, code: dialog?.code, type: dialog?.type, approvedHeadcount: dialog?.approvedHeadcount, budgetedHeadcount: dialog?.budgetedHeadcount, isActive: dialog?.isActive })}>
              {busy && <Loader2 size={16} className="animate-spin" />}
              Save
            </Button>
          </footer>
        </Modal>
      )}
    </div>
  );
}