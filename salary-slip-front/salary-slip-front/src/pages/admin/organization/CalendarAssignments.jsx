import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus, RefreshCw, Search, Loader2, Pencil, Trash2, Power, PowerOff, Shield,
  Calendar, Users, Building2, MapPin, CalendarDays, CalendarCheck,
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

const CALENDAR_KINDS = [
  { value: "working_day", label: "Working Day" },
  { value: "financial", label: "Financial" },
  { value: "payroll", label: "Payroll" },
];

const CALENDAR_SCOPES = [
  { value: "enterprise", label: "Enterprise" },
  { value: "company", label: "Company" },
  { value: "country", label: "Country" },
  { value: "location", label: "Location" },
  { value: "department", label: "Department" },
];

function Th({ children, className = "" }) {
  return <th scope="col" className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</th>;
}

export default function CalendarAssignmentsPage() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [assignments, setAssignments] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [scopeType, setScopeType] = useState("ALL");
  const [calendarKind, setCalendarKind] = useState("ALL");
  const [status, setStatus] = useState("ALL");

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    organizationApi.calendarAssignments(
      { search, scope_type: setScopeType === "ALL" ? undefined : setScopeType, calendar_kind: setCalendarKind === "ALL" ? undefined : setCalendarKind, status },
      token, tokenType,
    ).then((res) => {
      if (!active) return;
      setAssignments(res?.data ?? []);
    }).catch((err) => toast.error(err.message || "Could not load calendar assignments")).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, tokenType, search, scopeType, calendarKind, status, refreshKey]);

  const changeFilter = (setter) => (value) => { setLoading(true); setter(value); };

  const run = async (work, message, after = () => {}) => {
    setBusy(true);
    try { await work(); toast.success(message); after(); reload(); } catch (err) { toast.error(err.message || "That did not work"); } finally { setBusy(false); }
  };

  const saveAssignment = (payload) => run(
    () => dialog?.id
      ? organizationApi.updateCalendarAssignment(dialog.id, payload, token, tokenType)
      : organizationApi.createCalendarAssignment(payload, token, tokenType),
    dialog?.id ? "Assignment updated" : "Assignment created",
  );

  const companyOptions = useMemo(() => [], []);
  const canManage = can("org.calendar_assignment.create") || can("org.calendar_assignment.update");

  // Resolve and Preview
  const resolveCalendar = useCallback(async (payload = {}) => {
    setBusy(true);
    try {
      const res = await organizationApi.resolveCalendarAssignment(payload, token, tokenType);
      toast.info(res?.data ? `Resolution: ${res.data.calendarName}` : "No resolution found");
    } catch (err) {
      toast.error(err.message || "Could not resolve calendar");
    } finally { setBusy(false); }
  }, [token, tokenType]);

  const previewCalendar = useCallback(async (payload = {}) => {
    setBusy(true);
    try {
      const res = await organizationApi.previewCalendarAssignment(payload, token, tokenType);
      toast.info(res?.data ? `Preview: ${res.data.length} calendars found` : "No preview data");
    } catch (err) {
      toast.error(err.message || "Could not preview calendar");
    } finally { setBusy(false); }
  }, [token, tokenType]);

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Calendar days={20} /> Calendar Assignments
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Assigns calendars to scopes (enterprise → company → country → location → department) with priority and effective dating.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              aria-label="Search assignments"
              className={`${inputClass} w-64 pl-8`}
              placeholder="Search scope or kind…"
              value={search}
              onChange={(e) => changeFilter(setSearch)(e.target.value)}
            />
          </div>

          <select
            aria-label="Filter by scope"
            className={`${inputClass} w-36`}
            value={setScopeType === "ALL" ? "" : setScopeType}
            onChange={(e) => setScopeType(e.target.value)}
          >
            <option value="ALL">All Scopes</option>
            {CALENDAR_SCOPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>

          <select
            aria-label="Filter by kind"
            className={`${inputClass} w-36`}
            value={setCalendarKind === "ALL" ? "" : setCalendarKind}
            onChange={(e) => setCalendarKind(e.target.value)}
          >
            <option value="ALL">All Kinds</option>
            {CALENDAR_KINDS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
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
            {can("org.calendar_assignment.create") && (
              <Button onClick={() => setDialog({})}><Plus size={16} /> Add Assignment</Button>
            )}
            <Button onClick={previewCalendar} disabled={busy}>
              {busy && <Loader2 size={16} className="animate-spin" />}
              Preview
            </Button>
            <Button onClick={() => resolveCalendar({ employeeId: "" })} disabled={busy}>
              Resolve
            </Button>
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
                  <Th>Calendar</Th>
                  <Th>Kind</Th>
                  <Th>Scope</Th>
                  <Th>Scope ID</Th>
                  <Th>Priority</Th>
                  <Th>Effective From</Th>
                  <Th>Effective To</Th>
                  <Th>Is Active</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {assignments.length === 0 && (
                  <tr><td colSpan={9} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    No calendar assignments match these filters.
                  </td></tr>
                )}

                {assignments.map((assign) => (
                  <tr key={assign.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{assign.calendarName}</td>
                    <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{assign.calendarKind || "—"}</td>
                    <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{assign.scopeType || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{assign.scopeId || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{assign.priority || 0}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{assign.effectiveFrom || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{assign.effectiveTo || "—"}</td>
                    <td className="px-4 py-3">
                      {assign.isActive === undefined ? (
                        <span className="text-gray-500">—</span>
                      ) : assign.isActive === true ? (
                        <Badge variant="green">Active</Badge>
                      ) : (
                        <Badge variant="red">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {can("org.calendar_assignment.update") && (
                          <Button size="sm" variant="ghost" onClick={() => setActiveAssignment(assign)}><Pencil size={14} /></Button>
                        )}
                        {can("org.calendar_assignment.status") && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => run(() => organizationApi.setCalendarAssignmentStatus(assign.id, !assign.isActive, token, tokenType), assign.isActive ? "Assignment deactivated" : "Assignment activated")}
                          >
                            {assign.isActive ? <PowerOff size={14} /> : <Power size={14} />}
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
          Calendar assignment management is restricted to administrators.
        </p>
      )}

      {activeAssignment && (
        <Modal isOpen onClose={() => setActiveAssignment(null)} title={`Calendar Assignment: ${activeAssignment.calendarName}`} size="lg">
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Calendar</span>
                <p className="mt-1 text-gray-900 dark:text-white">{activeAssignment.calendarName}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Kind</span>
                <p className="mt-1 capitalize text-gray-600 dark:text-gray-300">{activeAssignment.calendarKind}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Scope</span>
                <p className="mt-1 text-gray-600 dark:text-gray-300">{activeAssignment.scopeType} #{activeAssignment.scopeId}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Priority</span>
                <p className="mt-1 text-gray-600 dark:text-gray-300">{activeAssignment.priority || 0}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Effective From</span>
                <p className="mt-1 text-gray-600 dark:text-gray-300">{activeAssignment.effectiveFrom || "—"}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Effective To</span>
                <p className="mt-1 text-gray-600 dark:text-gray-300">{activeAssignment.effectiveTo || "—"}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Is Active</span>
                <p className="mt-1">
                  <Badge variant={activeAssignment.isActive === true ? "green" : "red"}>
                    {activeAssignment.isActive === true ? "Yes" : "No"}
                  </Badge>
                </p>
              </div>
            </div>
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex gap-2">
                <Button onClick={() => resolveCalendar({ employeeId: "" })}>Resolve Calendar</Button>
                <Button onClick={() => previewCalendar({})}>Preview Calendars</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}