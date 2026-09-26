import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw, Cpu, ChevronLeft, ChevronRight, CircleCheck, CircleX, CircleAlert, CircleSlash } from "lucide-react";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig, COMPANY_OPTIONS } from "../../config/companyConfig";
import AttendanceRuleManagement from "./AttendanceRuleManagement";

/**
 * Attendance Engine Rebuild -- Raw Punches page (spec S27) + a lightweight
 * Device Health panel (spec S24, S62) as a second tab, and Rule Management
 * (spec S32) as a third -- all three read from small, closely-related new
 * endpoints (/v1/attendance/punches, /v1/attendance/devices,
 * /v1/attendance/rules) and previously had separate nav entries; merged
 * into one screen so "raw punching" and "rules" aren't split across the menu.
 * Read-only for punches/devices (raw biometric history has no delete
 * affordance anywhere in this UI, per spec S27/S66); Rules keeps its own
 * create/retire actions since that's its whole purpose.
 */
const PUNCH_STATUS_CONFIG = {
  VALID: { label: "Valid", icon: CircleCheck, cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  DUPLICATE: { label: "Duplicate", icon: CircleSlash, cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  UNMAPPED: { label: "Unmapped", icon: CircleAlert, cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  INVALID: { label: "Invalid", icon: CircleX, cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

function PunchStatusBadge({ status }) {
  const cfg = PUNCH_STATUS_CONFIG[status] || { label: status || "—", icon: CircleAlert, cls: "bg-gray-100 text-gray-600" };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.cls}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

function DeviceHealthPanel({ selectedCompanyId, accessToken, tokenType }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    salaryApi
      .getAttendanceDevices({ company_code: selectedCompanyId === "all-companies" ? "" : selectedCompanyId }, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const data = res?.data?.data || res?.data || [];
        setDevices(Array.isArray(data) ? data : []);
      })
      .catch((err) => !cancelled && toast.error(err.message || "Failed to load devices"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [selectedCompanyId, accessToken, tokenType]);

  function staleness(lastSyncAt) {
    if (!lastSyncAt) return { label: "Never synced", cls: "text-red-600 dark:text-red-400" };
    const hours = (Date.now() - new Date(lastSyncAt).getTime()) / 3.6e6;
    if (hours < 6) return { label: "Fresh", cls: "text-emerald-600 dark:text-emerald-400" };
    if (hours < 24) return { label: "Stale (>6h)", cls: "text-amber-600 dark:text-amber-400" };
    return { label: "Stale (>24h)", cls: "text-red-600 dark:text-red-400" };
  }

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading devices…</div>;
  if (!devices.length) return <div className="py-12 text-center text-gray-400 text-sm">No devices registered.</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
      {devices.map((d) => {
        const st = staleness(d.last_sync_at);
        return (
          <div key={d.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-sm text-gray-800 dark:text-gray-100">
                <Cpu className="h-3.5 w-3.5 text-gray-400" /> {d.name || d.serial_number}
              </span>
              <span className={`text-[10px] font-bold uppercase ${d.is_active ? "text-emerald-600" : "text-gray-400"}`}>{d.is_active ? "Active" : "Inactive"}</span>
            </div>
            <div className="text-[11px] text-gray-400">Serial: {d.serial_number} · {d.ip_address || "no IP"}</div>
            <div className="text-[11px] text-gray-400">{d.location || d.unit || "—"}</div>
            <div className={`text-[11px] font-semibold ${st.cls}`}>{st.label}{d.last_sync_at ? ` · last sync ${new Date(d.last_sync_at).toLocaleString()}` : ""}</div>
            <div className="text-[11px] text-gray-400">Last run: {d.last_sync_punch_count ?? 0} punch(es) · status: {d.status || "unknown"}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function AttendanceRawPunches() {
  const { user } = useAuth();
  const { companyId, isAllCompanies } = useCompany();

  const [tab, setTab] = useState("punches");
  const [selectedCompanyId, setSelectedCompanyId] = useState(companyId && companyId !== "all" ? companyId : "all-companies");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [empCode, setEmpCode] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);

  const activeCompanyConfig = getCompanyConfig(selectedCompanyId);
  const unitOptions = activeCompanyConfig ? activeCompanyConfig.units : [];

  async function load() {
    setLoading(true);
    try {
      const res = await salaryApi.getAttendancePunches(
        {
          company_code: selectedCompanyId === "all-companies" ? "" : selectedCompanyId,
          unit: selectedUnit,
          emp_code: empCode,
          status: statusFilter,
          date_from: dateFrom,
          date_to: dateTo,
          page,
          per_page: 100,
        },
        user?.accessToken,
        user?.tokenType
      );
      const payload = res?.data?.data || res?.data || {};
      setRows(Array.isArray(payload) ? payload : payload.data || []);
      setMeta(Array.isArray(payload) ? null : { current_page: payload.current_page, last_page: payload.last_page, total: payload.total });
    } catch (err) {
      toast.error(err.message || "Failed to load raw punches.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "punches") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedCompanyId, selectedUnit, empCode, statusFilter, dateFrom, dateTo, page]);

  const counts = useMemo(() => {
    const c = { VALID: 0, DUPLICATE: 0, UNMAPPED: 0, INVALID: 0 };
    rows.forEach((r) => { if (c[r.status] != null) c[r.status]++; });
    return c;
  }, [rows]);

  return (
    <div className="flex flex-col gap-5 min-h-screen pb-12 bg-gray-50/50 dark:bg-gray-950/50 text-gray-900 dark:text-gray-100">
      <div className="flex items-center gap-4 border-b border-gray-200/80 dark:border-gray-800 pb-3">
        <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-0.5">
          <button onClick={() => setTab("punches")} className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${tab === "punches" ? "bg-indigo-600 text-white" : "text-gray-500"}`}>Punch Ledger</button>
          <button onClick={() => setTab("devices")} className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${tab === "devices" ? "bg-indigo-600 text-white" : "text-gray-500"}`}>Device Health</button>
          <button onClick={() => setTab("rules")} className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${tab === "rules" ? "bg-indigo-600 text-white" : "text-gray-500"}`}>Rules</button>
        </div>
      </div>

      {tab === "punches" ? (
        <>
          <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 p-3 shadow-sm flex flex-wrap items-end gap-2.5">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Company</label>
              <select value={selectedCompanyId} onChange={(e) => { setSelectedCompanyId(e.target.value); setSelectedUnit(""); setPage(1); }} disabled={!isAllCompanies} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs disabled:opacity-50">
                <option value="all-companies">Both Companies</option>
                {COMPANY_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Branch/Unit</label>
              <select value={selectedUnit} onChange={(e) => { setSelectedUnit(e.target.value); setPage(1); }} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs">
                <option value="">All Branches</option>
                {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Emp Code (raw)</label>
              <input value={empCode} onChange={(e) => { setEmpCode(e.target.value); setPage(1); }} placeholder="Device emp code" className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs w-32" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Status</label>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs">
                <option value="">All</option>
                {Object.keys(PUNCH_STATUS_CONFIG).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">From</label>
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">To</label>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
            </div>
            <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-semibold ml-auto">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
            {Object.entries(counts).map(([k, v]) => <span key={k}>{k}: <b>{v}</b></span>)}
            <span className="ml-auto">Page {meta?.current_page ?? page}{meta?.last_page ? ` of ${meta.last_page}` : ""} · {meta?.total ?? rows.length} total</span>
          </div>

          <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-950">
                <tr>
                  <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Punch Time</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Employee</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Raw Emp Code</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Device</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Type</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Status</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Source</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="py-12 text-center text-gray-400">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-gray-400">No punches found for this filter.</td></tr>
                ) : (
                  rows.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 font-mono">{p.punch_datetime ? new Date(p.punch_datetime).toLocaleString() : "—"}</td>
                      <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">{p.user ? `${p.user.name} (${p.user.emp_code})` : <span className="text-amber-600">Unmapped</span>}</td>
                      <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 font-mono text-gray-500">{p.emp_code_raw}</td>
                      <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">{p.device?.name || p.device_serial}</td>
                      <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">{p.punch_type || "—"}</td>
                      <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800"><PunchStatusBadge status={p.status} /></td>
                      <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 text-gray-400">{p.source || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {meta?.last_page > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-gray-200 dark:border-gray-800 p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-xs text-gray-500">Page {page} of {meta.last_page}</span>
              <button disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-gray-200 dark:border-gray-800 p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
        </>
      ) : tab === "devices" ? (
        <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <DeviceHealthPanel selectedCompanyId={selectedCompanyId} accessToken={user?.accessToken} tokenType={user?.tokenType} />
        </div>
      ) : (
        <AttendanceRuleManagement />
      )}
    </div>
  );
}
