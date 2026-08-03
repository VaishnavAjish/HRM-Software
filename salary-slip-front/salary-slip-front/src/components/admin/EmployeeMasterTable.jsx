import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  Search, Eye, Pencil, Trash2, Lock, Unlock, X,
  Users, Loader2, Filter, RotateCcw, Download, CloudUpload,
} from "lucide-react";
import Badge from "../ui/Badge";
import Modal from "../ui/Modal";
import Pagination from "../ui/Pagination";
import { salaryApi, authApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig } from "../../config/companyConfig";
// These two are the same production forms used on the Appointments and Trial
// Form admin pages — reused here rather than rebuilt so "view/edit like the
// appointment form" is literally that form, not a lookalike.
import AppointmentModal from "../../pages/auth/AppointmentModal";
import TrialFormModal from "../../pages/auth/TrialFormModal";
import {
  buildSafeAadhaarUpdate,
  getAadhaarDisplayValue,
  hasStoredAadhaar,
} from "../../utils/aadhaar";
import { getEmployeePhotoUrl } from "../../pages/admin/AdminModals/employee-helpers";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const YEARS = ["2023", "2024", "2025", "2026", "2027", "2028"];

// Every row shown here started life in a different table/endpoint. __stage
// records which one so the badge, the reference date used for the month
// filter, and the available actions can all key off it without re-deriving
// the same type/status logic the backend already applied once.
const STAGE_META = {
  trial:       { label: "Trial",       tone: "gray" },
  appointment: { label: "Appointment", tone: "blue" },
  pending:     { label: "Pending",     tone: "yellow" },
  employee:    { label: "Employee",    tone: "green" },
};

function referenceDate(row) {
  return row.__stage === "trial" ? row.trial_date : row.joining_date;
}

function isActive(row) {
  return row.status === 0 || row.status === "0";
}

// Rows come from four different endpoints (trial, appointment, pending,
// employee) but all of them carry the same raw `photo` field, so one
// resolver/fallback works across every stage.
function EmployeePhoto({ row, size = 36 }) {
  const src = getEmployeePhotoUrl(row.photo);
  const initial = (row.name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className="relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-xs font-bold text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"
      style={{ height: size, width: size }}
    >
      <span>{initial}</span>
      {src && (
        <img
          src={src}
          alt={row.name ? `${row.name} photo` : "Employee photo"}
          className="absolute inset-0 h-full w-full rounded-full object-cover"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
    </div>
  );
}

// Fields shown in the View modal. Trial-specific fields only render when
// there's actually a value, so a promoted trial row (now __stage "pending"
// or "employee") doesn't show a wall of empty labels.
const DETAIL_FIELDS = [
  ["Emp Code", "emp_code"], ["Punching No", "punching_no"], ["Email", "email"],
  ["Mobile", "mobile_number"], ["Department", "department"], ["Designation", "designation"],
  ["Company", (r) => getCompanyConfig(r.company_code)?.label || r.company_code],
  ["Unit / Branch", "unit"], ["Joining Date", "joining_date"], ["Date of Birth", "dob"],
  ["Gender", "gender"], ["Blood Group", "blood_group"], ["Salary", "salary"],
  // Accessor, not a key: aadhar_card_no is in User::$hidden so it never reaches
  // the client, and reading it directly rendered an empty column. The list
  // endpoints return aadhaar_full for rows the caller may open.
  ["Manager", "manager_name"], ["Aadhaar No", (r) => getAadhaarDisplayValue(r)], ["PAN No", "pan_card_no"],
  ["Bank Name", "bank_name"], ["Bank A/C No", "bank_account_no"], ["IFSC", "bank_ifsc_code"],
  ["Address", "address"],
  ["Trial Date", "trial_date"], ["Last Company", "last_company_name"],
  ["Experience", "experience"], ["Reason for Leaving", "reason_for_leaving"],
  ["Reference Name", "reference_name"], ["Reference Mobile", "reference_mobile_no"],
];

export default function EmployeeMasterTable({ onBulkUpload }) {
  const { user } = useAuth();
  const { companyScope, companyId } = useCompany();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const [drafts, setDrafts] = useState({}); // { [id]: { emp_code?, punching_no? } }
  const [savingCell, setSavingCell] = useState(null); // `${id}:${field}`
  const [rowBusy, setRowBusy] = useState({}); // { [id]: true } — inactivate/delete in flight

  const [viewRow, setViewRow] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Trial and appointment rows open the real production form for both View
  // and Edit — this app has no separate read-only renderer for those forms
  // anywhere else either, so that's the existing convention, not a shortcut.
  // Pending/Employee rows get a purpose-built edit form below instead of the
  // full AddEditEmployeeModal, which is tightly coupled to EmployeeManagement's
  // own page-level state and not designed to be dropped in elsewhere.
  const [appointmentModalRow, setAppointmentModalRow] = useState(null);
  const [trialModalRow, setTrialModalRow] = useState(null);
  const [editEmployeeRow, setEditEmployeeRow] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  const requestAll = async () => {
    try {
      // Appointments are deliberately NOT fetched here. An appointment only
      // becomes this page's business once it's approved on the Appointments
      // page — and approval (checkbox=1, see UserController::updateUser)
      // immediately flips its type to 'pending_employee' / status 2, which is
      // exactly the pendingRes query below. So "approved" and "shows up here
      // as Pending" are the same event; nothing unapproved should ever appear.
      const [trialRes, appointmentRes, pendingRes, employeeRes] = await Promise.all([
        authApi.getTrialForms(user?.accessToken, user?.tokenType, companyScope),
        authApi.getAppointmentForms(user?.accessToken, user?.tokenType, companyScope),
        salaryApi.getAllEmployees(user?.accessToken, user?.tokenType, { status: "2", limit: 1000 }, companyScope),
        salaryApi.getAllEmployees(user?.accessToken, user?.tokenType, { limit: 1000 }, companyScope),
      ]);

      const trialRows = (trialRes?.data || []).map((r) => ({ ...r, __stage: "trial" }));
      // Appointments that are NOT yet approved (checkbox !== 1, no emp_code, status !== 1)
      const apptData = appointmentRes?.data ?? appointmentRes ?? {};
      const allAppointments = apptData?.appointments ?? apptData?.appointmentData ?? apptData?.appoinments ?? apptData?.data ?? apptData;
      const appointmentList = Array.isArray(allAppointments) ? allAppointments : [];
      const appointmentRows = appointmentList
        .filter((a) => !a.emp_code && Number(a.checkbox) !== 1 && String(a.status) !== '1' && a.status !== 'Approved')
        .map((r) => ({ ...r, __stage: "appointment" }));
      const pendingRows = (pendingRes?.data?.users?.data ?? pendingRes?.data?.users ?? []).map((r) => ({ ...r, __stage: "pending" }));
      const employeeRows = (employeeRes?.data?.users?.data ?? employeeRes?.data?.users ?? []).map((r) => ({ ...r, __stage: "employee" }));

      const merged = new Map();
      [...trialRows, ...appointmentRows, ...pendingRows, ...employeeRows].forEach((r) => merged.set(r.id, r));
      setRows(Array.from(merged.values()));
    } finally {
      setLoading(false);
    }
  };

  // Raises no spinner of its own — every state update happens after an await,
  // so calling this from an effect costs no cascading render. `loading` starts
  // true; a scope change turns it back on during render below.
  const fetchAll = () =>
    requestAll().catch((err) => toast.error(err.message || "Failed to load employee master data"));

  const [scopeSeen, setScopeSeen] = useState(companyScope);
  if (scopeSeen !== companyScope) {
    setScopeSeen(companyScope);
    setLoading(true);
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyScope]);

  const stageCounts = useMemo(() => {
    const counts = { all: rows.length, trial: 0, appointment: 0, pending: 0, employee: 0 };
    rows.forEach((r) => { counts[r.__stage] = (counts[r.__stage] || 0) + 1; });
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stageFilter !== "all" && r.__stage !== stageFilter) return false;

      if (month || year) {
        const ref = referenceDate(r);
        const d = ref ? new Date(ref) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        if (month && String(d.getMonth() + 1) !== month) return false;
        if (year && String(d.getFullYear()) !== year) return false;
      }

      if (q) {
        const haystack = [r.name, r.email, r.emp_code, r.mobile_number, r.punching_no]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [rows, search, stageFilter, month, year]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);


  const clearFilters = () => {
    setSearch(""); setStageFilter("all"); setMonth(""); setYear(""); setPage(1);
  };

  const draftValue = (row, field) => drafts[row.id]?.[field] ?? row[field] ?? "";

  const setDraft = (id, field, value) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const clearDraftField = (id, field) =>
    setDrafts((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev[id] };
      delete next[field];
      return { ...prev, [id]: next };
    });

  const commitField = async (row, field) => {
    let value = String(draftValue(row, field) || "").trim();
    if (field === "emp_code") value = value.toUpperCase();
    const original = String(row[field] || "");
    if (value === original) { clearDraftField(row.id, field); return; }

    const cellKey = `${row.id}:${field}`;
    setSavingCell(cellKey);
    try {
      if (field === "emp_code" && value) {
        const check = await authApi.checkEmpCodeAvailability(value, row.id, user?.accessToken, user?.tokenType);
        if (check?.exists) {
          toast.error(`Employee code '${value}' is already assigned to ${check.employee?.name || "another employee"}`);
          clearDraftField(row.id, field);
          return;
        }
      }

      await authApi.updateAppointment({ id: row.id, [field]: value }, user?.accessToken, user?.tokenType);

      if (field === "emp_code") {
        toast.success(
          row.__stage === "employee"
            ? "Employee code updated"
            : "Employee code assigned — employee is now active",
        );
      } else {
        toast.success("Punching number updated");
      }

      clearDraftField(row.id, field);
      await fetchAll();
    } catch (err) {
      toast.error(err.message || "Update failed");
    } finally {
      setSavingCell(null);
    }
  };

  const handleCellKeyDown = (e) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  const toggleActive = async (row) => {
    const nextStatus = isActive(row) ? 1 : 0;
    setRowBusy((prev) => ({ ...prev, [row.id]: true }));
    try {
      await authApi.updateAppointment({ id: row.id, status: nextStatus }, user?.accessToken, user?.tokenType);
      toast.success(nextStatus === 1 ? "Marked inactive" : "Marked active");
      await fetchAll();
    } catch (err) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setRowBusy((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  const handleDelete = async () => {
    if (!deleteRow) return;
    setDeleteLoading(true);
    try {
      await salaryApi.deleteEmployee(
        deleteRow.id, user?.accessToken, user?.tokenType,
        { companyId: deleteRow.company_code || companyId },
      );
      toast.success(`${deleteRow.name || "Record"} deleted`);
      setDeleteRow(null);
      await fetchAll();
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    } finally {
      setDeleteLoading(false);
    }
  };

  // View and Edit both route to the same per-stage surface — see the note by
  // the modal state above for why trial/appointment reuse the real form while
  // pending/employee gets a dedicated (simpler) edit form.
  const openView = (row) => {
    if (row.__stage === "trial") setTrialModalRow(row);
    else if (row.__stage === "appointment") setAppointmentModalRow(row);
    else setViewRow(row);
  };

  const openEdit = (row) => {
    if (row.__stage === "trial") setTrialModalRow(row);
    else if (row.__stage === "appointment") setAppointmentModalRow(row);
    else {
      setEditForm({
        name: row.name || "", email: row.email || "", mobile_number: row.mobile_number || "",
        department: row.department || "", designation: row.designation || "",
        dob: row.dob || "", gender: row.gender || "", address: row.address || "",
        city: row.city || "", district: row.district || "", state: row.state || "", pin: row.pin || "",
        // Prefilled with the complete stored number, grouped. Normalised again on
        // save so the grouping never reaches the column.
        aadhar_card_no: getAadhaarDisplayValue(row), pan_card_no: row.pan_card_no || "",
        bank_name: row.bank_name || "", bank_ifsc_code: row.bank_ifsc_code || "",
        bank_account_no: row.bank_account_no || "",
        joining_date: row.joining_date || "", salary: row.salary || "",
      });
      setEditEmployeeRow(row);
    }
  };

  const updateEditForm = (field) => (e) =>
    setEditForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editEmployeeRow) return;

    // Decide what the Aadhaar field is allowed to do before anything is sent. A
    // cleared or partly-deleted field must not overwrite the stored number — that
    // is what detached records from their S3 document folders — and "-" (what a
    // record with no number renders as) must not be stored either.
    const aadhaar = buildSafeAadhaarUpdate({
      enteredValue: editForm.aadhar_card_no,
      hasStored: hasStoredAadhaar(editEmployeeRow),
    });

    if (aadhaar.error) {
      toast.error(aadhaar.error);
      return;
    }

    const payload = { ...editForm, ...(aadhaar.include && { aadhar_card_no: aadhaar.value }) };

    // Absent, not empty. An empty value would overwrite the stored number.
    if (!aadhaar.include) delete payload.aadhar_card_no;

    setEditSaving(true);
    try {
      await salaryApi.editEmployee(
        editEmployeeRow.id, payload, user?.accessToken, user?.tokenType,
        { companyId: editEmployeeRow.company_code || companyId },
      );
      toast.success("Employee updated");
      setEditEmployeeRow(null);
      await fetchAll();
    } catch (err) {
      toast.error(err.message || "Failed to update employee");
    } finally {
      setEditSaving(false);
    }
  };

  // Exports exactly what's on screen — same search/stage/month/year filters
  // already applied to `filtered` — not the full unfiltered dataset.
  const exportToExcel = () => {
    if (filtered.length === 0) {
      toast.error("No rows to export with the current filters");
      return;
    }
    const sheetRows = filtered.map((r) => ({
      "Emp Code": r.emp_code || "",
      "Punching No": r.punching_no || "",
      "Name": r.name || "",
      "Email": r.email || "",
      "Mobile": r.mobile_number || "",
      "Stage": (STAGE_META[r.__stage] || STAGE_META.appointment).label,
      "Department": r.department || "",
      "Designation": r.designation || "",
      "Company": getCompanyConfig(r.company_code)?.label || r.company_code || "",
      "Unit": r.unit || "",
      "Status": isActive(r) ? "Active" : r.status === 2 || r.status === "2" ? "Pending" : "Inactive",
      "Joining Date": r.joining_date || "",
      "Trial Date": r.trial_date || "",
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employee Master");
    XLSX.writeFile(wb, `employee_master_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const cellInputCls =
    "w-full min-w-[92px] rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-2 py-1.5 text-xs font-mono text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:opacity-50";

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-[#0b0f1a] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/10 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search name, email, code..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 pl-8 text-xs text-gray-900 outline-none transition focus:border-brand-400 focus:bg-white dark:border-white/10 dark:bg-gray-800 dark:text-white dark:focus:bg-[#0b0f1a]"
              />
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
            </div>

            <div className="flex items-center gap-1.5 text-gray-400">
              <Filter size={13} />
            </div>
            <select
              value={month}
              onChange={(e) => { setMonth(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-200"
            >
              <option value="">All Months</option>
              {MONTHS.map((m, idx) => <option key={m} value={String(idx + 1)}>{m}</option>)}
            </select>
            <select
              value={year}
              onChange={(e) => { setYear(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-200"
            >
              <option value="">All Years</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>

            <div className="h-5 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />

            {[
              { key: "all", label: "All" },
              { key: "trial", label: "Trial" },
              { key: "appointment", label: "Appointment" },
              { key: "pending", label: "Pending" },
              { key: "employee", label: "Employee" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setStageFilter(key); setPage(1); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  stageFilter === key
                    ? "bg-brand-600 text-white shadow-sm shadow-brand-600/30"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                }`}
              >
                {label} ({stageCounts[key] || 0})
              </button>
            ))}

            {(search || stageFilter !== "all" || month || year) && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-white/5"
              >
                <RotateCcw size={12} /> Reset
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onBulkUpload && (
              <button
                onClick={onBulkUpload}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors whitespace-nowrap"
              >
                <CloudUpload size={13} /> Bulk Employee Upload
              </button>
            )}

            <button
              onClick={exportToExcel}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors whitespace-nowrap"
              title="Export the rows currently shown (respects filters above)"
            >
              <Download size={13} /> Export to Excel
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-400">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            <p className="text-sm">Loading employee master...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-400 text-center">
            <Users size={40} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
              {rows.length === 0 ? "No records yet" : "No matches for these filters"}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile: stacked cards. The eight-column table (two of them live
                inline-edit inputs, four more an action row) has no honest way
                to fit a phone width — it just clipped everything past Name. */}
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 md:hidden">
              {paginated.map((row) => {
                const meta = STAGE_META[row.__stage] || STAGE_META.appointment;
                const active = isActive(row);
                const busy = rowBusy[row.id];
                return (
                  <li key={row.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <EmployeePhoto row={row} size={40} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 dark:text-white break-words">{row.name || "—"}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 break-all">{row.email || "No email"}</p>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 gap-1">
                        <button
                          onClick={() => openView(row)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                          title="View details"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => openEdit(row)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => toggleActive(row)}
                          disabled={busy}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors disabled:opacity-50"
                          title={active ? "Mark inactive" : "Mark active"}
                        >
                          {busy ? <Loader2 size={16} className="animate-spin" /> : active ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                        <button
                          onClick={() => setDeleteRow(row)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant={meta.tone}>{meta.label}</Badge>
                      <Badge variant={
                        row.__stage === "trial" ? "gray"
                        : row.__stage === "appointment" ? "blue"
                        : active ? "green"
                        : (row.status === 2 || row.status === "2") ? "yellow"
                        : "red"
                      }>
                        {row.__stage === "trial" ? "Trial"
                        : row.__stage === "appointment" ? "Appointment"
                        : active ? "Active"
                        : (row.status === 2 || row.status === "2") ? "Pending"
                        : "Inactive"}
                      </Badge>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500">
                          Emp Code
                        </label>
                        <input
                          value={draftValue(row, "emp_code")}
                          onChange={(e) => setDraft(row.id, "emp_code", e.target.value)}
                          onBlur={() => commitField(row, "emp_code")}
                          onKeyDown={handleCellKeyDown}
                          disabled={savingCell === `${row.id}:emp_code` || row.__stage === "trial" || row.__stage === "appointment"}
                          placeholder="Assign code"
                          className={cellInputCls}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500">
                          Punching No
                        </label>
                        <input
                          value={draftValue(row, "punching_no")}
                          onChange={(e) => setDraft(row.id, "punching_no", e.target.value)}
                          onBlur={() => commitField(row, "punching_no")}
                          onKeyDown={handleCellKeyDown}
                          disabled={savingCell === `${row.id}:punching_no` || row.__stage === "trial" || row.__stage === "appointment"}
                          placeholder="Assign no."
                          className={cellInputCls}
                        />
                      </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">Department</dt>
                        <dd className="text-gray-700 dark:text-gray-200 break-words">
                          {row.department || "—"}
                          {row.designation ? ` Â· ${row.designation}` : ""}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">Company / Unit</dt>
                        <dd className="text-gray-700 dark:text-gray-200 break-words">
                          {getCompanyConfig(row.company_code)?.label || row.company_code || "—"}
                          {row.unit ? ` Â· ${row.unit}` : ""}
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>

            <div className="hidden md:block overflow-x-auto overflow-y-visible">
              <table className="w-full text-sm table-fixed border-separate border-spacing-0">
                <thead className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 font-bold w-14">Photo</th>
                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 font-bold w-32">Emp Code</th>
                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 font-bold w-32">Punching No</th>
                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 font-bold w-48">Name</th>
                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 font-bold w-28">Stage</th>
                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 font-bold w-40">Department</th>
                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 font-bold w-40">Company / Unit</th>
                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 font-bold w-28">Status</th>
                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 font-bold text-right w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((row) => {
                    const meta = STAGE_META[row.__stage] || STAGE_META.appointment;
                    const active = isActive(row);
                    const busy = rowBusy[row.id];
                    return (
                      <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                        <td className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-700">
                          <EmployeePhoto row={row} />
                        </td>
                        <td className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-700">
                          <input
                            value={draftValue(row, "emp_code")}
                            onChange={(e) => setDraft(row.id, "emp_code", e.target.value)}
                            onBlur={() => commitField(row, "emp_code")}
                            onKeyDown={handleCellKeyDown}
                            disabled={savingCell === `${row.id}:emp_code` || row.__stage === "trial" || row.__stage === "appointment"}
                            placeholder="Assign code"
                            className={cellInputCls}
                          />
                        </td>
                        <td className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-700">
                          <input
                            value={draftValue(row, "punching_no")}
                            onChange={(e) => setDraft(row.id, "punching_no", e.target.value)}
                            onBlur={() => commitField(row, "punching_no")}
                            onKeyDown={handleCellKeyDown}
                            disabled={savingCell === `${row.id}:punching_no` || row.__stage === "trial" || row.__stage === "appointment"}
                            placeholder="Assign no."
                            className={cellInputCls}
                          />
                        </td>
                        <td className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-700">
                          <div className="font-medium text-gray-900 dark:text-white">{row.name || "—"}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{row.email || "No email"}</div>
                        </td>
                        <td className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-700">
                          <Badge variant={meta.tone}>{meta.label}</Badge>
                        </td>
                        <td className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                          {row.department || "—"}
                          {row.designation && (
                            <div className="text-xs text-gray-400">{row.designation}</div>
                          )}
                        </td>
                        <td className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                          {getCompanyConfig(row.company_code)?.label || row.company_code || "—"}
                          {row.unit ? <div className="text-xs text-gray-400">{row.unit}</div> : null}
                        </td>
                        <td className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-700">
                          <Badge variant={
                            row.__stage === "trial" ? "gray"
                            : row.__stage === "appointment" ? "blue"
                            : active ? "green"
                            : (row.status === 2 || row.status === "2") ? "yellow"
                            : "red"
                          }>
                            {row.__stage === "trial" ? "Trial"
                            : row.__stage === "appointment" ? "Appointment"
                            : active ? "Active"
                            : (row.status === 2 || row.status === "2") ? "Pending"
                            : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-700">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => openView(row)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                              title="View details"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => openEdit(row)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                              title="Edit"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => toggleActive(row)}
                              disabled={busy}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors disabled:opacity-50"
                              title={active ? "Mark inactive" : "Mark active"}
                            >
                              {busy ? <Loader2 size={16} className="animate-spin" /> : active ? <Lock size={16} /> : <Unlock size={16} />}
                            </button>
                            <button
                              onClick={() => setDeleteRow(row)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="shrink-0 px-5 py-3 border-t border-gray-100 dark:border-gray-700">
        <Pagination
          current={page}
          total={filtered.length}
          pageSize={pageSize}
          onChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      {/* ── View modal ── */}
      {viewRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 shrink-0">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <EmployeePhoto row={viewRow} size={28} />
                {viewRow.name || "Record"} Details
              </h3>
              <button onClick={() => setViewRow(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-5">
                <Badge variant={(STAGE_META[viewRow.__stage] || STAGE_META.appointment).tone}>
                  {(STAGE_META[viewRow.__stage] || STAGE_META.appointment).label}
                </Badge>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                {DETAIL_FIELDS.map(([label, accessor]) => {
                  const value = typeof accessor === "function" ? accessor(viewRow) : viewRow[accessor];
                  if (!value) return null;
                  return (
                    <div key={label}>
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">{label}</dt>
                      <dd className="text-sm text-gray-900 dark:text-white break-words">{value}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3 shrink-0">
              <button
                onClick={() => setViewRow(null)}
                className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => { const r = viewRow; setViewRow(null); openEdit(r); }}
                className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Pencil size={14} /> Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 size={22} className="text-red-600" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">Delete Record</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Delete <strong className="text-gray-900 dark:text-white">{deleteRow.name || "this record"}</strong>?
                This permanently removes the row and cannot be undone.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setDeleteRow(null)}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {deleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Appointment stage: the real Appointment Form, exactly as used on
          the Appointments admin page ── */}
      <AppointmentModal
        isOpen={Boolean(appointmentModalRow)}
        onClose={() => setAppointmentModalRow(null)}
        initialData={
          appointmentModalRow
            ? { id: appointmentModalRow.id, raw: appointmentModalRow, addedBy: appointmentModalRow.added_by }
            : null
        }
        onSuccess={() => { setAppointmentModalRow(null); fetchAll(); }}
      />

      {/* ── Trial stage: the real Trial Form, exactly as used on the Trial
          Form admin page ── */}
      <TrialFormModal
        isOpen={Boolean(trialModalRow)}
        onClose={() => setTrialModalRow(null)}
        initialData={
          trialModalRow
            ? { id: trialModalRow.id, raw: trialModalRow, addedBy: trialModalRow.added_by }
            : null
        }
        onSuccess={() => { setTrialModalRow(null); fetchAll(); }}
      />

      {/* ── Pending/Employee stage: a purpose-built edit form. Not the same
          component as the Employees page's AddEditEmployeeModal — that one is
          tightly bound to EmployeeManagement's own fetch/save state and isn't
          designed to be reused standalone — but it edits the same fields. ── */}
      <Modal
        isOpen={Boolean(editEmployeeRow)}
        onClose={() => setEditEmployeeRow(null)}
        title={`Edit ${editEmployeeRow?.name || "Employee"}`}
        size="lg"
      >
        <form onSubmit={handleEditSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              ["Name", "name"], ["Email", "email"], ["Mobile", "mobile_number"],
              ["Department", "department"], ["Designation", "designation"],
              ["Date of Birth", "dob", "date"], ["Gender", "gender"],
              ["Joining Date", "joining_date", "date"], ["Salary", "salary"],
              ["Aadhar No", "aadhar_card_no"], ["PAN No", "pan_card_no"],
              ["Bank Name", "bank_name"], ["Bank IFSC", "bank_ifsc_code"],
              ["Bank A/C No", "bank_account_no"],
              ["City", "city"], ["District", "district"], ["State", "state"], ["PIN", "pin"],
            ].map(([label, field, type]) => (
              <div key={field}>
                <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  {label}
                </label>
                <input
                  type={type || "text"}
                  value={editForm[field] || ""}
                  onChange={updateEditForm(field)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white outline-none focus:border-brand-500"
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Address
              </label>
              <input
                value={editForm.address || ""}
                onChange={updateEditForm("address")}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setEditEmployeeRow(null)}
              className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={editSaving}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {editSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
