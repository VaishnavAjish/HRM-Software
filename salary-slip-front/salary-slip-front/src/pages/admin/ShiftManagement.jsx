import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Users,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Moon,
  RotateCw,
  Sliders,
  Search,
  Calendar,
  ShieldAlert,
  UserPlus,
  Eye,
  CheckSquare,
  Square,
  Sparkles,
  SlidersHorizontal,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig, COMPANY_OPTIONS } from "../../config/companyConfig";

const emptyForm = {
  name: "",
  code: "",
  start_time: "09:00",
  end_time: "18:00",
  grace_minutes: "15",
  break_start: "13:00",
  break_end: "14:00",
  break_duration: "60",
  working_hours: "8.0",
  weekly_off: "Sunday",
  auto_attendance: true,
  overtime_allowed: true,
  late_policy: "Grace Period",
  early_exit_policy: "Deduct Half Day",
  status: "Active",
  description: "",
};

function formatTime(t) {
  if (!t) return "-";
  const [h, m] = String(t).split(":");
  const hour = parseInt(h, 10);
  if (isNaN(hour)) return String(t);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
}

export default function ShiftManagement() {
  const { user } = useAuth();
  const { companyId, activeUnit, isAllCompanies } = useCompany();

  const [selectedCompanyId, setSelectedCompanyId] = useState(
    companyId && companyId !== "all" ? companyId : (COMPANY_OPTIONS[0]?.id || "")
  );
  const [selectedUnit, setSelectedUnit] = useState(activeUnit || "");

  useEffect(() => {
    if (companyId && companyId !== "all") {
      setSelectedCompanyId(companyId);
    } else if (!selectedCompanyId && COMPANY_OPTIONS.length > 0) {
      setSelectedCompanyId(COMPANY_OPTIONS[0].id);
    }
  }, [companyId]);

  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [viewingShift, setViewingShift] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [assignShift, setAssignShift] = useState(null);
  const [assignEmployees, setAssignEmployees] = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSelected, setAssignSelected] = useState(new Set());
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");

  const activeCompanyConfig = getCompanyConfig(selectedCompanyId);
  const unitOptions = activeCompanyConfig ? activeCompanyConfig.units : [];

  useEffect(() => {
    if (!selectedCompanyId) return undefined;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await salaryApi.getShifts(user?.accessToken, user?.tokenType, {
          companyId: selectedCompanyId,
          unit: selectedUnit,
        });
        if (!cancelled) setShifts(res?.data || []);
      } catch (err) {
        if (!cancelled) toast.error(err.message || "Failed to load shifts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId, selectedUnit, reloadCounter, user?.accessToken, user?.tokenType]);

  // Derived shift summary metrics
  const shiftMetrics = useMemo(() => {
    const total = shifts.length;
    let active = 0;
    let night = 0;
    let rotational = 0;

    shifts.forEach((s) => {
      const name = (s.name || "").toLowerCase();
      const isInactive = s.status === "Inactive" || s.is_active === 0;
      if (!isInactive) active++;

      if (name.includes("night") || name.includes("graveyard")) night++;
      if (name.includes("rotation") || name.includes("flexi") || name.includes("shift")) rotational++;
    });

    return { total, active, night, rotational: Math.max(rotational, total > 0 ? 1 : 0) };
  }, [shifts]);

  const openAdd = () => {
    if (!selectedCompanyId) {
      toast.error("Select a company first.");
      return;
    }
    setEditingShift(null);
    setForm({
      ...emptyForm,
      code: `SFT-00${shifts.length + 1}`,
    });
    setModalOpen(true);
  };

  const openEdit = (shift) => {
    setEditingShift(shift);
    let descMeta = {};
    try {
      if (shift.description && shift.description.startsWith("{")) {
        descMeta = JSON.parse(shift.description);
      }
    } catch {
      descMeta = {};
    }

    setForm({
      name: shift.name || "",
      code: descMeta.code || `SFT-00${shift.id}`,
      start_time: (shift.start_time || "09:00").slice(0, 5),
      end_time: (shift.end_time || "18:00").slice(0, 5),
      grace_minutes: String(shift.grace_minutes ?? "15"),
      break_start: descMeta.break_start || "13:00",
      break_end: descMeta.break_end || "14:00",
      break_duration: descMeta.break_duration || "60",
      working_hours: descMeta.working_hours || "8.0",
      weekly_off: descMeta.weekly_off || "Sunday",
      auto_attendance: descMeta.auto_attendance !== false,
      overtime_allowed: descMeta.overtime_allowed !== false,
      late_policy: descMeta.late_policy || "Grace Period",
      early_exit_policy: descMeta.early_exit_policy || "Deduct Half Day",
      status: shift.status || "Active",
      description: typeof descMeta.note === "string" ? descMeta.note : shift.description || "",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Shift name is required");
      return;
    }
    setSaving(true);
    try {
      const meta = JSON.stringify({
        code: form.code,
        break_start: form.break_start,
        break_end: form.break_end,
        break_duration: form.break_duration,
        working_hours: form.working_hours,
        weekly_off: form.weekly_off,
        auto_attendance: form.auto_attendance,
        overtime_allowed: form.overtime_allowed,
        late_policy: form.late_policy,
        early_exit_policy: form.early_exit_policy,
        note: form.description,
      });

      const payload = {
        name: form.name.trim(),
        company_code: selectedCompanyId,
        unit: selectedUnit || null,
        start_time: form.start_time,
        end_time: form.end_time,
        grace_minutes: form.grace_minutes || 0,
        status: form.status,
        description: meta,
      };

      if (editingShift) {
        await salaryApi.updateShift(editingShift.id, payload, user?.accessToken, user?.tokenType);
        toast.success("Shift updated successfully");
      } else {
        await salaryApi.createShift(payload, user?.accessToken, user?.tokenType);
        toast.success("Shift created successfully");
      }
      setModalOpen(false);
      setReloadCounter((c) => c + 1);
    } catch (err) {
      toast.error(err.message || "Failed to save shift");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (shift) => {
    if (!window.confirm(`Delete shift "${shift.name}"? Assigned employees will become unassigned.`)) return;
    try {
      await salaryApi.deleteShift(shift.id, user?.accessToken, user?.tokenType);
      toast.success("Shift deleted");
      setReloadCounter((c) => c + 1);
    } catch (err) {
      toast.error(err.message || "Failed to delete shift");
    }
  };

  const openAssign = async (shift) => {
    setAssignShift(shift);
    setAssignSearch("");
    setAssignLoading(true);
    try {
      const res = await salaryApi.getAllEmployees(
        user?.accessToken,
        user?.tokenType,
        // Without an explicit limit the backend paginates at 15
        // (UserController::index), silently dropping employees past the
        // first page from the assignment list.
        { limit: 1000 },
        { companyId: selectedCompanyId, unit: selectedUnit },
      );
      const list = res?.data?.users?.data ?? res?.data?.users ?? [];
      setAssignEmployees(list);
      setAssignSelected(new Set(list.filter((e) => e.shift_id === shift.id).map((e) => e.id)));
    } catch (err) {
      toast.error(err.message || "Failed to load employees");
    } finally {
      setAssignLoading(false);
    }
  };

  const toggleAssignEmployee = (id) => {
    setAssignSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (assignSelected.size === filteredAssignEmployees.length) {
      setAssignSelected(new Set());
    } else {
      setAssignSelected(new Set(filteredAssignEmployees.map((e) => e.id)));
    }
  };

  const filteredAssignEmployees = useMemo(() => {
    if (!assignSearch.trim()) return assignEmployees;
    const q = assignSearch.toLowerCase();
    return assignEmployees.filter(
      (e) => (e.name || "").toLowerCase().includes(q) || (e.emp_code || "").toLowerCase().includes(q)
    );
  }, [assignEmployees, assignSearch]);

  const handleAssignSave = async () => {
    if (!assignShift) return;
    setAssignSaving(true);
    try {
      const wasAssigned = assignEmployees.filter((e) => e.shift_id === assignShift.id).map((e) => e.id);
      const nowAssigned = Array.from(assignSelected);
      const toAssign = nowAssigned;
      const toUnassign = wasAssigned.filter((id) => !assignSelected.has(id));

      if (toAssign.length > 0) {
        await salaryApi.assignShift(
          { shift_id: assignShift.id, employee_ids: toAssign, company_code: selectedCompanyId },
          user?.accessToken,
          user?.tokenType,
        );
      }
      if (toUnassign.length > 0) {
        await salaryApi.assignShift(
          { shift_id: null, employee_ids: toUnassign, company_code: selectedCompanyId },
          user?.accessToken,
          user?.tokenType,
        );
      }
      toast.success("Shift assignments updated successfully!");
      setAssignShift(null);
      setReloadCounter((c) => c + 1);
    } catch (err) {
      toast.error(err.message || "Failed to update assignments");
    } finally {
      setAssignSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 min-h-screen pb-12 bg-gray-50/50 dark:bg-gray-950/50 text-gray-900 dark:text-gray-100">
      {/* Dashboard Header: KPI Cards & Actions */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-gray-200/80 dark:border-gray-800 pb-3">
        {/* 4 KPI Dashboard Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 xl:max-w-4xl">
          {[
            { label: "Total Shifts", value: shiftMetrics.total, icon: Clock, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/50", border: "border-l-blue-500" },
            { label: "Active Shifts", value: shiftMetrics.active, icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/50", border: "border-l-emerald-500" },
            { label: "Night Shifts", value: shiftMetrics.night, icon: Moon, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/50", border: "border-l-purple-500" },
            { label: "Rotational Shifts", value: shiftMetrics.rotational, icon: RotateCw, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950/50", border: "border-l-indigo-500" },
          ].map((card, idx) => (
            <div
              key={idx}
              className={`flex flex-col justify-between rounded-xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border-l-4 ${card.border}`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 truncate">
                  {card.label}
                </span>
                <div className={`p-1.5 rounded-lg ${card.bg}`}>
                  <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-extrabold text-gray-900 dark:text-white tracking-tight">
                  {card.value}
                </span>
                <span className="text-[10px] text-emerald-600 font-medium flex items-center">
                  <TrendingUp className="h-2.5 w-2.5 mr-0.5" /> Live
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Top Actions Bar */}
        <div className="flex items-center gap-2 justify-end">
          <Button icon={<Plus size={14} />} onClick={openAdd} disabled={!selectedCompanyId}>
            Create New Shift
          </Button>
        </div>
      </div>

      {/* Compact Filters & Controls Toolbar */}
      <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md p-3 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <SlidersHorizontal className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <span>Filters & Search</span>
          </div>
          <button
            onClick={() => {
              if (isAllCompanies) setSelectedCompanyId(COMPANY_OPTIONS[0]?.id || "");
              setSelectedUnit("");
            }}
            className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Company */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
              Company <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedCompanyId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedCompanyId(nextId);
                const nextConf = getCompanyConfig(nextId);
                if (nextConf && !nextConf.units.includes(selectedUnit)) setSelectedUnit("");
              }}
              disabled={!isAllCompanies}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
            >
              <option value="">Select Company</option>
              {COMPANY_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Branch / Unit */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
              Branch / Unit
            </label>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">All Branches</option>
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Shifts Enterprise Table Container */}
      <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden flex flex-col">
        {!selectedCompanyId ? (
          <div className="py-20 text-center text-sm text-gray-400 flex flex-col items-center justify-center gap-2">
            <Building2 className="h-8 w-8 text-gray-300 dark:text-gray-700" />
            <span>Select a company to view shift management.</span>
          </div>
        ) : loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            <span className="text-xs font-medium">Loading shifts...</span>
          </div>
        ) : shifts.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-500 dark:text-gray-400 flex flex-col items-center justify-center gap-2">
            <Clock className="h-8 w-8 text-gray-300 dark:text-gray-700" />
            <span>No shifts created yet. Click "Create New Shift" above to add one.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 uppercase tracking-wider font-bold text-[11px]">
                  <th className="py-3.5 px-4">Shift Name</th>
                  <th className="py-3.5 px-3">Start Time</th>
                  <th className="py-3.5 px-3">End Time</th>
                  <th className="py-3.5 px-3">Grace Time</th>
                  <th className="py-3.5 px-3">Break Duration</th>
                  <th className="py-3.5 px-3">Work Hours</th>
                  <th className="py-3.5 px-3">Weekly Off</th>
                  <th className="py-3.5 px-3">Assigned Employees</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                {shifts.map((shift, idx) => {
                  let meta = {};
                  try {
                    if (shift.description && shift.description.startsWith("{")) {
                      meta = JSON.parse(shift.description);
                    }
                  } catch {
                    meta = {};
                  }

                  const isInactive = shift.status === "Inactive" || shift.is_active === 0;

                  return (
                    <tr
                      key={shift.id}
                      className={`hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors ${
                        idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/30 dark:bg-gray-900/40"
                      }`}
                    >
                      <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
                          <div>
                            <div>{shift.name}</div>
                            <div className="text-[10px] text-gray-400 font-normal">{meta.code || `SFT-00${shift.id}`}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatTime(shift.start_time)}
                      </td>

                      <td className="py-3 px-3 font-mono font-semibold text-indigo-700 dark:text-indigo-400">
                        {formatTime(shift.end_time)}
                      </td>

                      <td className="py-3 px-3 text-gray-600 dark:text-gray-300">
                        {shift.grace_minutes || 0} mins
                      </td>

                      <td className="py-3 px-3 text-gray-600 dark:text-gray-300">
                        {meta.break_duration || "60"} mins
                      </td>

                      <td className="py-3 px-3 font-semibold text-gray-800 dark:text-gray-200">
                        {meta.working_hours || "8.0"} hrs
                      </td>

                      <td className="py-3 px-3 text-gray-600 dark:text-gray-300">
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 px-2 py-0.5 text-[10px] font-semibold">
                          <Calendar className="h-3 w-3" />
                          {meta.weekly_off || "Sunday"}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <button
                          onClick={() => openAssign(shift)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-100 transition"
                        >
                          <Users className="h-3.5 w-3.5" />
                          {shift.assigned_count ?? 0} Employees
                        </button>
                      </td>

                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          !isInactive
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}>
                          {!isInactive ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {!isInactive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setViewingShift(shift)}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                            title="View Shift Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => openEdit(shift)}
                            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition"
                            title="Edit Shift"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(shift)}
                            className="p-1.5 rounded-lg border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                            title="Delete Shift"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Two-Column Shift Form Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingShift ? "Edit Shift Configuration" : "Create New Shift"}
        maxWidth="max-w-3xl"
      >
        <div className="flex flex-col gap-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Shift Name */}
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                Shift Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. General Morning Shift"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {/* Shift Code */}
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                Shift Code
              </label>
              <input
                type="text"
                placeholder="e.g. SFT-001"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {/* Start Time */}
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                Start Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {/* End Time */}
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                End Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {/* Grace Time */}
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                Grace Time (Minutes)
              </label>
              <input
                type="number"
                placeholder="15"
                value={form.grace_minutes}
                onChange={(e) => setForm((p) => ({ ...p, grace_minutes: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {/* Working Hours */}
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                Total Working Hours
              </label>
              <input
                type="text"
                placeholder="8.0"
                value={form.working_hours}
                onChange={(e) => setForm((p) => ({ ...p, working_hours: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {/* Break Start */}
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                Break Start Time
              </label>
              <input
                type="time"
                value={form.break_start}
                onChange={(e) => setForm((p) => ({ ...p, break_start: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {/* Break End */}
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                Break End Time
              </label>
              <input
                type="time"
                value={form.break_end}
                onChange={(e) => setForm((p) => ({ ...p, break_end: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {/* Weekly Off */}
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                Weekly Off Day
              </label>
              <select
                value={form.weekly_off}
                onChange={(e) => setForm((p) => ({ ...p, weekly_off: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="Sunday">Sunday</option>
                <option value="Saturday & Sunday">Saturday & Sunday</option>
                <option value="Friday">Friday</option>
                <option value="Rotational">Rotational Off</option>
              </select>
            </div>

            {/* Late Policy */}
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                Late Arrival Policy
              </label>
              <select
                value={form.late_policy}
                onChange={(e) => setForm((p) => ({ ...p, late_policy: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="Grace Period">Grace Period (15 Mins)</option>
                <option value="Strict Deduction">Strict Salary Deduction</option>
                <option value="Mark Half Day">Mark Half Day on 3rd Late</option>
              </select>
            </div>

            {/* Early Exit Policy */}
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                Early Exit Policy
              </label>
              <select
                value={form.early_exit_policy}
                onChange={(e) => setForm((p) => ({ ...p, early_exit_policy: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="Deduct Half Day">Deduct Half Day</option>
                <option value="Manager Approval">Require Manager Approval</option>
                <option value="Allowed">Allowed without deduction</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                Shift Status
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/20 font-semibold"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Toggles Row */}
          <div className="flex flex-wrap items-center gap-6 border-t border-b border-gray-200 dark:border-gray-800 py-3 my-1">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.auto_attendance}
                onChange={(e) => setForm((p) => ({ ...p, auto_attendance: e.target.checked }))}
                className="rounded text-brand-600 h-4 w-4"
              />
              Enable Auto Attendance Calculation
            </label>

            <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.overtime_allowed}
                onChange={(e) => setForm((p) => ({ ...p, overtime_allowed: e.target.checked }))}
                className="rounded text-brand-600 h-4 w-4"
              />
              Allow Overtime Logging
            </label>
          </div>

          {/* Description / Notes */}
          <div>
            <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
              Description / Internal Notes
            </label>
            <textarea
              rows={2}
              placeholder="Optional notes for HR or department managers..."
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-800 font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              Cancel
            </button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              {editingShift ? "Update Shift" : "Save Shift"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* View Shift Details Modal */}
      <Modal
        isOpen={Boolean(viewingShift)}
        onClose={() => setViewingShift(null)}
        title={viewingShift ? `Shift Details — ${viewingShift.name}` : "Shift Details"}
        maxWidth="max-w-lg"
      >
        {viewingShift && (
          <div className="flex flex-col gap-4 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
              <div>
                <span className="text-gray-400 block font-medium">Start Time</span>
                <span className="font-bold text-emerald-600 text-sm">{formatTime(viewingShift.start_time)}</span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">End Time</span>
                <span className="font-bold text-indigo-600 text-sm">{formatTime(viewingShift.end_time)}</span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Grace Minutes</span>
                <span className="font-bold text-gray-800 dark:text-gray-200">{viewingShift.grace_minutes || 0} mins</span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Assigned Employees</span>
                <span className="font-bold text-brand-600">{viewingShift.assigned_count || 0} Employees</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewingShift(null)}
                className="px-4 py-1.5 rounded-xl bg-gray-200 dark:bg-gray-800 font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Assign Employees Modal */}
      <Modal
        isOpen={Boolean(assignShift)}
        onClose={() => setAssignShift(null)}
        title={assignShift ? `Assign Employees — ${assignShift.name}` : "Assign Employees"}
        maxWidth="max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search filter */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search employee name or code..."
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 pl-9 pr-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <button
              onClick={toggleSelectAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-800 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              {assignSelected.size === filteredAssignEmployees.length && filteredAssignEmployees.length > 0 ? (
                <CheckSquare className="h-4 w-4 text-brand-600" />
              ) : (
                <Square className="h-4 w-4 text-gray-400" />
              )}
              Select All ({assignSelected.size})
            </button>
          </div>

          {assignLoading ? (
            <div className="py-16 flex items-center justify-center text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-xl">
              {filteredAssignEmployees.map((emp) => {
                const checked = assignSelected.has(emp.id);
                return (
                  <label
                    key={emp.id}
                    className={`flex items-center justify-between px-4 py-2.5 text-xs cursor-pointer transition ${
                      checked ? "bg-brand-50/50 dark:bg-brand-950/30" : "hover:bg-gray-50 dark:hover:bg-gray-900"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAssignEmployee(emp.id)}
                        className="rounded text-brand-600 h-4 w-4"
                      />
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">{emp.name}</div>
                        <div className="text-[10px] text-gray-400">{emp.emp_code} · {emp.department || "No Dept"}</div>
                      </div>
                    </div>

                    <span className="text-[11px] font-mono text-gray-500">
                      {emp.shift_id === assignShift?.id ? "Assigned" : "Unassigned"}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-800">
            <span className="text-xs text-gray-500">{assignSelected.size} employee(s) selected</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAssignShift(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                Cancel
              </button>
              <Button onClick={handleAssignSave} disabled={assignSaving}>
                {assignSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                Save Assignment
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
