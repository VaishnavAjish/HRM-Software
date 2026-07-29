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
} from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig, COMPANY_OPTIONS } from "../../config/companyConfig";

const emptyForm = { name: "", start_time: "09:00", end_time: "18:00", grace_minutes: "0", description: "" };

function formatTime(t) {
  if (!t) return "-";
  const [h, m] = String(t).split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
}

export default function ShiftManagement() {
  const { user } = useAuth();
  const { companyId, activeUnit, isAllCompanies } = useCompany();

  const [selectedCompanyId, setSelectedCompanyId] = useState(companyId !== "all" ? companyId : "");
  const [selectedUnit, setSelectedUnit] = useState(activeUnit || "");

  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const [assignShift, setAssignShift] = useState(null);
  const [assignEmployees, setAssignEmployees] = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSelected, setAssignSelected] = useState(new Set());
  const [assignSaving, setAssignSaving] = useState(false);

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

  const openAdd = () => {
    if (!selectedCompanyId) {
      toast.error("Select a company first.");
      return;
    }
    setEditingShift(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (shift) => {
    setEditingShift(shift);
    setForm({
      name: shift.name || "",
      start_time: (shift.start_time || "09:00").slice(0, 5),
      end_time: (shift.end_time || "18:00").slice(0, 5),
      grace_minutes: String(shift.grace_minutes ?? "0"),
      description: shift.description || "",
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
      const payload = {
        name: form.name.trim(),
        company_code: selectedCompanyId,
        unit: selectedUnit || null,
        start_time: form.start_time,
        end_time: form.end_time,
        grace_minutes: form.grace_minutes || 0,
        description: form.description || null,
      };
      if (editingShift) {
        await salaryApi.updateShift(editingShift.id, payload, user?.accessToken, user?.tokenType);
        toast.success("Shift updated");
      } else {
        await salaryApi.createShift(payload, user?.accessToken, user?.tokenType);
        toast.success("Shift created");
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
    if (!window.confirm(`Delete shift "${shift.name}"? Employees on it will become unassigned.`)) return;
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
    setAssignLoading(true);
    try {
      const res = await salaryApi.getAllEmployees(
        user?.accessToken,
        user?.tokenType,
        {},
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
      toast.success("Shift assignments updated");
      setAssignShift(null);
      setReloadCounter((c) => c + 1);
    } catch (err) {
      toast.error(err.message || "Failed to update assignments");
    } finally {
      setAssignSaving(false);
    }
  };

  const canSubmitAssign = useMemo(() => Boolean(assignShift), [assignShift]);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
        <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400 mb-4">
          <Building2 size={13} /> Selection Options
        </h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
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
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white disabled:opacity-50"
            >
              <option value="">Select Company</option>
              {COMPANY_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
              Branch/Unit
            </label>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white"
            >
              <option value="">All Branches</option>
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button icon={<Plus size={14} />} onClick={openAdd} disabled={!selectedCompanyId}>
            New Shift
          </Button>
        </div>
      </div>

      {!selectedCompanyId ? (
        <div className="py-16 text-center text-sm text-gray-400">Select a company to manage shifts.</div>
      ) : loading ? (
        <div className="py-16 flex items-center justify-center text-gray-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : shifts.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">No shifts found. Create one to get started.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shifts.map((shift) => (
            <div key={shift.id} className="rounded-2xl border border-gray-200 bg-white dark:bg-[#0b0f1a] dark:border-white/10 shadow-sm p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">{shift.name}</h3>
                  <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <Clock size={12} /> {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(shift)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200" title="Edit">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(shift)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {shift.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{shift.description}</p>
              )}

              <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100 dark:border-white/10">
                <span className="text-xs text-gray-400">
                  Grace: {shift.grace_minutes || 0} min
                </span>
                <button
                  onClick={() => openAssign(shift)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-3 py-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition"
                >
                  <Users size={13} /> {shift.employees_count ?? 0} Assigned
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingShift ? "Edit Shift" : "New Shift"}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingShift ? "Update Shift" : "Create Shift"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Shift Name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Morning Shift"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Start Time</label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">End Time</label>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Grace Period (minutes)</label>
            <input
              type="number"
              min="0"
              max="180"
              value={form.grace_minutes}
              onChange={(e) => setForm((f) => ({ ...f, grace_minutes: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(assignShift)}
        onClose={() => setAssignShift(null)}
        title={`Assign Employees — ${assignShift?.name || ""}`}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-gray-500">{assignSelected.size} selected</span>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setAssignShift(null)} disabled={assignSaving}>Cancel</Button>
              <Button onClick={handleAssignSave} disabled={assignSaving || !canSubmitAssign}>
                {assignSaving ? "Saving..." : "Save Assignments"}
              </Button>
            </div>
          </div>
        }
      >
        {assignLoading ? (
          <div className="py-10 flex items-center justify-center text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : assignEmployees.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">No employees found for this company/branch.</p>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto space-y-1.5">
            {assignEmployees.map((emp) => (
              <label
                key={emp.id}
                className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-white/10 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              >
                <input
                  type="checkbox"
                  checked={assignSelected.has(emp.id)}
                  onChange={() => toggleAssignEmployee(emp.id)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{emp.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{emp.emp_code}</p>
                </div>
                {emp.shift_id && emp.shift_id !== assignShift?.id && (
                  <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                    On another shift
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
