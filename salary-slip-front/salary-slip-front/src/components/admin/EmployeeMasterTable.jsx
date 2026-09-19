import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import {
  Search, Eye, Pencil, Trash2, Lock, Unlock, X, X as CloseIcon,
  Users, Loader2, Filter, RotateCcw, Download, CloudUpload,
} from "lucide-react";
import Badge from "../ui/Badge";
import Modal from "../ui/Modal";
import Pagination from "../ui/Pagination";
import { salaryApi, authApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { useAuthorization } from "../../hooks/useAuthorization";
import { getCompanyConfig } from "../../config/companyConfig";
import { saveJsonToXlsx } from "../../utils/excel";
// These two are the same production forms used on the Appointments and Trial
// Form admin pages — reused here rather than rebuilt so "view/edit like the
// appointment form" is literally that form, not a lookalike.
import AppointmentModal from "../../pages/auth/AppointmentModal";
import TrialFormModal from "../../pages/auth/TrialFormModal";
import EmployeeDetailsModal from "../../pages/admin/AdminModals/EmployeeDetailsModal";
import AddEditEmployeeModal from "../../pages/admin/AdminModals/AddEditEmployeeModal";
import {
  buildSafeAadhaarUpdate,
  getAadhaarDisplayValue,
  hasStoredAadhaar,
} from "../../utils/aadhaar";
import { getEmployeePhotoUrl } from "../../pages/admin/AdminModals/employee-helpers";
import { getProfileCompletionPercentage } from "../../utils/profileCompletion";
import { isPhotoDeletedOrDummy, markPhotoAsDeleted, getPhotoDeletionReason } from "../../utils/photoStatus";
import { AlertCircle } from "lucide-react";

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

// resignation_date is the employee's last working day (see ExitManagementController::store).
// Once it has passed, they've actually left, so the badge should read "Resigned"
// regardless of the raw status code, which HR may not have updated yet.
function isResigned(row) {
  return Boolean(row.resignation_date) && String(row.resignation_date).slice(0, 10) <= new Date().toISOString().slice(0, 10);
}

// Rows come from four different endpoints (trial, appointment, pending,
// employee) but all of them carry the same raw `photo` field, so one
// resolver/fallback works across every stage.
function EmployeePhoto({ row, size = 40, onClick }) {
  const isDummy = row ? isPhotoDeletedOrDummy(row) : false;
  const pct = row ? getProfileCompletionPercentage(row) : 0;
  const barColorText =
    isDummy ? "text-red-600" : pct === 100 ? "text-emerald-500" : pct >= 75 ? "text-brand-500" : pct >= 50 ? "text-amber-500" : "text-red-500";
  const badgeBg =
    isDummy
      ? "bg-red-600 text-white border-white dark:border-gray-800"
      : pct === 100
      ? "bg-emerald-600 text-white border-white dark:border-gray-800"
      : pct >= 75
      ? "bg-brand-600 text-white border-white dark:border-gray-800"
      : pct >= 50
      ? "bg-amber-500 text-white border-white dark:border-gray-800"
      : "bg-red-500 text-white border-white dark:border-gray-800";

  const strokeDasharray = 106.81;
  const strokeDashoffset = strokeDasharray - (pct / 100) * strokeDasharray;
  const src = !isDummy ? getEmployeePhotoUrl(row?.photo || row?.user?.photo || row?.employee?.photo || row?.userPhoto || row?.userAvatar) : "";
  const initial = (row?.name || "?").trim().charAt(0).toUpperCase() || "?";
  const Wrapper = onClick ? "button" : "div";

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ height: size, width: size }} title={row ? (isDummy ? "Dummy photo detected (Profile Locked)" : `Profile ${pct}% complete`) : undefined}>
      {Boolean(row) && (
        <svg className="absolute inset-0 h-full w-full -rotate-90 transform" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" className="text-gray-200 dark:text-gray-700" strokeWidth="2.5" stroke="currentColor" fill="transparent" />
          <circle cx="20" cy="20" r="17" className={`${barColorText} transition-all duration-500`} strokeWidth="2.5" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} strokeLinecap="round" stroke="currentColor" fill="transparent" />
        </svg>
      )}
      <Wrapper
        {...(onClick ? { type: "button", onClick } : {})}
        className={`group relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full ${
          isDummy ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300" : "bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"
        } text-xs font-bold transition-all duration-200 ${
          onClick ? "cursor-pointer hover:scale-110 active:scale-95" : ""
        }`}
        style={{ height: size - 12, width: size - 12 }}
      >
        <span>{isDummy ? "!" : initial}</span>
        {src && (
          <img
            src={src}
            alt={row?.name ? `${row.name} photo` : "Employee photo"}
            className="absolute inset-0 h-full w-full rounded-full object-cover transition-transform duration-200 group-hover:scale-105"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        )}
      </Wrapper>
      {Boolean(row) && (
        <span
          className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded-full text-[9px] font-extrabold leading-none border shadow-md whitespace-nowrap z-10 ${badgeBg}`}
        >
          {isDummy ? "Locked" : `${pct}%`}
        </span>
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
  const { can } = useAuthorization();
  const { companyScope, companyId } = useCompany();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [completionFilter, setCompletionFilter] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const departmentOptions = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      if (r.department && String(r.department).trim()) {
        set.add(String(r.department).trim());
      }
    });
    return Array.from(set).sort();
  }, [rows]);

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
  const [photoModalRow, setPhotoModalRow] = useState(null);
  const modalPhotoUrl = getEmployeePhotoUrl(
    photoModalRow?.photo || photoModalRow?.user?.photo || photoModalRow?.employee?.photo || photoModalRow?.userPhoto || photoModalRow?.userAvatar
  );
  const [deleteReasonModal, setDeleteReasonModal] = useState({ open: false, row: null });
  const [deleteReasonText, setDeleteReasonText] = useState("");
  const [deleteReasonError, setDeleteReasonError] = useState("");

  const handleOpenDeleteReasonModal = (row) => {
    if (!row) return;
    const currentReason = getPhotoDeletionReason(row) || "Dummy photo detected / Invalid profile picture";
    setDeleteReasonText(currentReason);
    setDeleteReasonError("");
    setDeleteReasonModal({ open: true, row });
  };

  const handleConfirmPhotoDelete = async () => {
    const row = deleteReasonModal.row;
    const reason = deleteReasonText.trim();
    if (!reason) {
      setDeleteReasonError("Please enter a reason for photo deletion.");
      return;
    }
    if (!row) return;

    try {
      markPhotoAsDeleted(row, reason);

      if (row.id) {
        await salaryApi.editEmployee(
          row.id,
          {
            photo: null,
            photo_rejected: true,
            photo_deleted: true,
            is_photo_dummy: true,
            photo_deletion_reason: reason,
          },
          user?.accessToken,
          user?.tokenType
        ).catch((err) => {
          console.warn("Photo delete API warning:", err);
        });
      }

      if (photoModalRow && (photoModalRow.id === row.id || (row.emp_code && photoModalRow.emp_code === row.emp_code))) {
        setPhotoModalRow({
          ...photoModalRow,
          photo: null,
          photo_rejected: true,
          photo_deleted: true,
          is_photo_dummy: true,
          photo_deletion_reason: reason,
        });
      }

      if (onUpdateEmployee) {
        onUpdateEmployee(row.id || row.emp_code, {
          photo: null,
          photo_rejected: true,
          photo_deleted: true,
          is_photo_dummy: true,
          photo_deletion_reason: reason,
        });
      }

      toast.success("Employee photo deleted and reason recorded.");
      setDeleteReasonModal({ open: false, row: null });
      await fetchAll();
    } catch (err) {
      toast.error(err.message || "Failed to delete employee photo");
    }
  };
  const [appointmentModalRow, setAppointmentModalRow] = useState(null);
  const [trialModalRow, setTrialModalRow] = useState(null);
  const [trialModalMode, setTrialModalMode] = useState(null); // 'view' or 'edit'
  const [editEmployeeRow, setEditEmployeeRow] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  const handleDeletePhoto = async (targetRow) => {
    if (!targetRow) return;
    const empName = targetRow.name || targetRow.displayName || "this employee";
    if (!window.confirm(`Are you sure you want to delete the profile picture for ${empName}?\n\nThis will mark dummy photo detected and lock their profile until an original photo is uploaded.`)) {
      return;
    }

    try {
      markPhotoAsDeleted(targetRow);
      if (targetRow.id) {
        await salaryApi.editEmployee(targetRow.id, { photo: null, photo_rejected: true, is_photo_dummy: true }).catch(() => {});
      }
      toast.success("Profile photo deleted. Employee profile is now locked.");
      setRows((prev) =>
        prev.map((r) =>
          r.id === targetRow.id || (targetRow.emp_code && r.emp_code === targetRow.emp_code)
            ? { ...r, photo: null, photo_rejected: true, is_photo_dummy: true }
            : r
        )
      );
      setPhotoModalRow(null);
    } catch (err) {
      toast.error("Failed to delete profile photo.");
    }
  };

  // UserController::index() paginates (`limit` query param, defaulting to
  // 15, becomes the page size — it does not raise or remove the cap). A
  // single request for "the first 100" silently drops everyone past that,
  // ordered newest-first, so it's the OLDEST employees that vanish first —
  // exactly what made this look like random records going missing. Paging
  // through with `last_page` until exhausted is the only way to actually
  // get everyone, matching the fix already applied to this same endpoint's
  // CSV export path elsewhere in this app.
  const fetchAllEmployeePages = async (extraFilters) => {
    const perPage = 500;
    const collected = [];
    let page = 1;
    for (;;) {
      const res = await salaryApi.getAllEmployees(
        user?.accessToken, user?.tokenType, { ...extraFilters, limit: perPage, page }, companyScope,
      );
      const users = res?.data?.users;
      collected.push(...(users?.data ?? []));
      if (page >= (users?.last_page ?? 1)) break;
      page += 1;
    }
    return collected;
  };

  const requestAll = async () => {
    try {
      // Appointments are deliberately NOT fetched here. An appointment only
      // becomes this page's business once it's approved on the Appointments
      // page — and approval (checkbox=1, see UserController::updateUser)
      // immediately flips its type to 'pending_employee' / status 2, which is
      // exactly the pendingRes query below. So "approved" and "shows up here
      // as Pending" are the same event; nothing unapproved should ever appear.
      //
      // Fetched sequentially, not via Promise.all: each individual query is
      // cheap (sub-second), but firing all 4 at once means one page load
      // claims 4 PHP-FPM workers simultaneously. Under real concurrent HR
      // usage — several staff loading admin pages at the same moment — that
      // peak demand is what has twice exhausted the worker pool (see
      // AWS_DEPLOYMENT_GUIDE.md §3.5), not any single query being slow.
      // Sequential trades a small amount of total load time for never
      // needing more than 1 worker from this page at a time.
      const [trialResult, appointmentResult, pendingResult, employeeResult] = await Promise.allSettled([
        can("recruitment.trial_form.read") ? authApi.getTrialForms(user?.accessToken, user?.tokenType, companyScope) : Promise.resolve(null),
        can("hr.appointment.read") ? authApi.getAppointmentForms(user?.accessToken, user?.tokenType, companyScope) : Promise.resolve(null),
        fetchAllEmployeePages({ status: "2" }),
        fetchAllEmployeePages({}),
      ]);

      const trialRes = trialResult.status === "fulfilled" ? trialResult.value : null;
      const appointmentRes = appointmentResult.status === "fulfilled" ? appointmentResult.value : null;
      const pendingUsers = pendingResult.status === "fulfilled" ? pendingResult.value : [];
      const employeeUsers = employeeResult.status === "fulfilled" ? employeeResult.value : [];

      const trialRows = (trialRes?.data || []).map((r) => ({ ...r, __stage: "trial" }));
      // Appointments that are NOT yet approved (checkbox !== 1, no emp_code, status !== 1)
      const apptData = appointmentRes?.data ?? appointmentRes ?? {};
      const allAppointments = apptData?.appointments ?? apptData?.appointmentData ?? apptData?.appoinments ?? apptData?.data ?? apptData;
      const appointmentList = Array.isArray(allAppointments) ? allAppointments : [];
      const appointmentRows = appointmentList
        .filter((a) => !a.emp_code && Number(a.checkbox) !== 1 && String(a.status) !== '1' && a.status !== 'Approved')
        .map((r) => ({ ...r, __stage: "appointment" }));
      const pendingRows = pendingUsers.map((r) => ({ ...r, __stage: "pending" }));
      const employeeRows = employeeUsers.map((r) => ({ ...r, __stage: "employee" }));

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

      if (departmentFilter && String(r.department || "").trim() !== departmentFilter) {
        return false;
      }

      if (genderFilter) {
        const g = String(r.gender || "").trim();
        const gLower = g.toLowerCase();
        if (genderFilter === "blank") {
          if (g !== "" && g !== "-" && gLower !== "unspecified" && gLower !== "null" && gLower !== "undefined") return false;
        } else if (genderFilter === "Male") {
          if (gLower !== "male" && gLower !== "m") return false;
        } else if (genderFilter === "Female") {
          if (gLower !== "female" && gLower !== "f") return false;
        } else if (g !== genderFilter) {
          return false;
        }
      }

      if (completionFilter) {
        const pct = getProfileCompletionPercentage(r);
        if (completionFilter === "complete" && pct !== 100) return false;
        if (completionFilter === "incomplete" && pct >= 100) return false;
      }

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
  }, [rows, search, stageFilter, departmentFilter, genderFilter, completionFilter, month, year]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);


  const clearFilters = () => {
    setSearch(""); setStageFilter("all"); setDepartmentFilter(""); setGenderFilter(""); setMonth(""); setYear(""); setPage(1);
  };

  const draftValue = (row, field) => {
    if (drafts[row.id]?.[field] !== undefined) return drafts[row.id][field];
    if (field === "punching_no") return row.punching_no || row.form_no || "";
    return row[field] ?? "";
  };

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
    if (row.__stage === "trial") {
      setTrialModalRow(row);
      setTrialModalMode("view");
    }
    // A "pending" row is an already-approved appointment awaiting emp_code
    // assignment — same underlying record, so the original Appointment Form
    // is still the useful thing to show here, not the bare-bones employee
    // fields (which are mostly unset until the record is fully onboarded).
    else if (row.__stage === "appointment" || row.__stage === "pending") setAppointmentModalRow(row);
    else setViewRow(row);
  };

  const openEdit = (row) => {
    if (row.__stage === "trial") {
      setTrialModalRow(row);
      setTrialModalMode("edit");
    } else if (row.__stage === "appointment") {
      setAppointmentModalRow(row);
    } else {
      const isAct = String(row.status) === "0" || row.status === 0;
      const isPend = String(row.status) === "2" || row.status === 2;
      const roleVal = String(row.role);
      const loginRole =
        roleVal === "0"
          ? "superadmin"
          : roleVal === "1"
          ? "master"
          : roleVal === "2"
          ? "manager"
          : roleVal === "4" || row.type === "agent"
          ? "agent"
          : "employee";

      setEditForm({
        id: row.id,
        name: row.name || "",
        empCode: String(row.emp_code || ""),
        email: row.email || "",
        companyId: row.company_code || "",
        unit: row.unit || "",
        status: isAct ? "Active" : isPend ? "Pending" : "Inactive",
        loginRole: loginRole,
        department: row.department || "",
        designation: row.designation || "",
        accountName: row.account_name || "",
        accountNo: row.account_no || "",
        mobileNo: row.mobile_number || row.mobileNo || "",
        dob: row.dob || "",
        address: row.address || "",
        gender: row.gender || "",
        city: row.city || "",
        pin: row.pin || "",
        district: row.district || "",
        state: row.state || "",
        pfNo: row.pf_no || row.pfNo || "",
        esiNo: row.esi_no || row.esiNo || "",
        bankName: row.bank_name || row.bankName || "",
        bankIfscCode: row.bank_ifsc_code || row.bankIfscCode || "",
        bankAccountNo: row.bank_account_no || row.bankAccountNo || "",
        aadharCardNo: getAadhaarDisplayValue(row),
        panCardNo: row.pan_card_no || row.panCardNo || "",
        joiningDate: row.joining_date || row.joiningDate || "",
        resignationDate: row.resignation_date || row.resignationDate || "",
        salary: row.salary || "",
        password: "",
        familyMembers: row.family_members || [],
      });
      setEditEmployeeRow(row);
      setEditModal("edit");
    }
  };

  const updateEditForm = (field) => (e) =>
    setEditForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleEditSave = async () => {
    if (!editEmployeeRow && !editForm.id) return;
    const targetId = editForm.id || editEmployeeRow?.id;

    const aadhaar = buildSafeAadhaarUpdate({
      enteredValue: editForm.aadharCardNo || editForm.aadhar_card_no,
      hasStored: hasStoredAadhaar(editEmployeeRow || editForm),
    });

    if (aadhaar.error) {
      toast.error(aadhaar.error);
      return;
    }

    const payload = {
      name: editForm.name,
      emp_code: editForm.empCode,
      email: editForm.email,
      company_code: editForm.companyId,
      unit: editForm.unit,
      status: editForm.status === "Active" ? "0" : editForm.status === "Pending" ? "2" : "1",
      role: editForm.loginRole === "superadmin" ? "0" : editForm.loginRole === "master" ? "1" : editForm.loginRole === "manager" ? "2" : "3",
      department: editForm.department,
      designation: editForm.designation,
      mobile_number: editForm.mobileNo,
      dob: editForm.dob,
      address: editForm.address,
      city: editForm.city,
      district: editForm.district,
      state: editForm.state,
      pin: editForm.pin,
      pf_no: editForm.pfNo,
      esi_no: editForm.esiNo,
      bank_name: editForm.bankName,
      bank_ifsc_code: editForm.bankIfscCode,
      bank_account_no: editForm.bankAccountNo,
      pan_card_no: editForm.panCardNo,
      joining_date: editForm.joiningDate,
      resignation_date: editForm.resignationDate,
      salary: editForm.salary,
      family_members: editForm.familyMembers || [],
      ...(aadhaar.include && { aadhar_card_no: aadhaar.value }),
    };

    if (editForm.password) {
      payload.password = editForm.password;
    }

    setEditSaving(true);
    try {
      await salaryApi.editEmployee(
        targetId,
        payload,
        user?.accessToken,
        user?.tokenType,
        { companyId: editForm.companyId || companyId }
      );
      toast.success("Employee updated successfully");
      setEditEmployeeRow(null);
      setEditModal(null);
      await fetchAll();
    } catch (err) {
      toast.error(err.message || "Failed to update employee");
    } finally {
      setEditSaving(false);
    }
  };

  // Exports exactly what's on screen — same search/stage/month/year filters
  // already applied to `filtered` — not the full unfiltered dataset.
  const exportToExcel = async () => {
    if (filtered.length === 0) {
      toast.error("No rows to export with the current filters");
      return;
    }
    const sheetRows = filtered.map((r) => ({
      "Emp Code": r.emp_code || "",
      "Punching No": r.punching_no || "",
      "Name": r.name || "",
      "Gender": r.gender && r.gender !== "-" ? r.gender : "",
      "Email": r.email || "",
      "Mobile": r.mobile_number || "",
      "Stage": (STAGE_META[r.__stage] || STAGE_META.appointment).label,
      "Department": r.department || "",
      "Designation": r.designation || "",
      "Company": getCompanyConfig(r.company_code)?.label || r.company_code || "",
      "Unit": r.unit || "",
      "Status": isResigned(r) ? "Resigned" : isActive(r) ? "Active" : r.status === 2 || r.status === "2" ? "Pending" : "Inactive",
      "Joining Date": r.joining_date || "",
      "Trial Date": r.trial_date || "",
    }));
    try {
      await saveJsonToXlsx(`employee_master_${new Date().toISOString().slice(0, 10)}.xlsx`, "Employee Master", sheetRows);
    } catch (err) {
      toast.error(err.message || "Failed to export Excel file");
    }
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
            <select
              value={departmentFilter}
              onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-200"
            >
              <option value="">All Departments</option>
              {departmentOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              value={genderFilter}
              onChange={(e) => { setGenderFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-200"
            >
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="blank">Blank</option>
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

            {(search || stageFilter !== "all" || departmentFilter || genderFilter || month || year) && (
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
                        <EmployeePhoto row={row} size={40} onClick={() => setPhotoModalRow(row)} />
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
                      {row.__stage !== "trial" && row.__stage !== "appointment" && (
                        <Badge variant={
                          isResigned(row) ? "red"
                          : active ? "green"
                          : (row.status === 2 || row.status === "2") ? "yellow"
                          : "red"
                        }>
                          {isResigned(row) ? "Resigned"
                          : active ? "Active"
                          : (row.status === 2 || row.status === "2") ? "Pending"
                          : "Inactive"}
                        </Badge>
                      )}
                    </div>

                    {row.__stage !== "trial" && row.__stage !== "appointment" && (
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
                          disabled={savingCell === `${row.id}:emp_code`}
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
                          disabled={savingCell === `${row.id}:punching_no`}
                          placeholder="Assign no."
                          className={cellInputCls}
                        />
                      </div>
                    </div>
                    )}

                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">Department</dt>
                        <dd className="text-gray-700 dark:text-gray-200 break-words">
                          {row.department || "—"}
                          {row.designation ? ` · ${row.designation}` : ""}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">Gender</dt>
                        <dd className="text-gray-700 dark:text-gray-200 break-words">
                          {row.gender && row.gender !== "-" ? row.gender : ""}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">Company / Unit</dt>
                        <dd className="text-gray-700 dark:text-gray-200 break-words">
                          {getCompanyConfig(row.company_code)?.label || row.company_code || "—"}
                          {row.unit ? ` · ${row.unit}` : ""}
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
                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 font-bold w-20">Profile</th>
                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 font-bold w-32">Emp Code</th>
                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 font-bold w-32">Punching No</th>
                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 font-bold w-48">Name</th>
                    <th className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 font-bold w-24">Gender</th>
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
                          <EmployeePhoto row={row} onClick={() => setPhotoModalRow(row)} />
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
                        <td className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                          {row.gender && row.gender !== "-" ? row.gender : ""}
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
                            : isResigned(row) ? "red"
                            : active ? "green"
                            : (row.status === 2 || row.status === "2") ? "yellow"
                            : "red"
                          }>
                            {row.__stage === "trial" ? "Trial"
                            : row.__stage === "appointment" ? "Appointment"
                            : isResigned(row) ? "Resigned"
                            : active ? "Active"
                            : (row.status === 2 || row.status === "2") ? "Pending"
                            : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-4 py-1.5 border-b border-gray-100 dark:border-gray-700">
                          <div className="flex justify-end items-center gap-1.5">
                            <button
                              onClick={() => openView(row)}
                              className="flex items-center justify-center rounded-lg bg-brand-50 p-2 text-brand-600 transition hover:bg-brand-100 dark:bg-brand-900/20 dark:hover:bg-brand-900/40"
                              title="View details"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={() => openEdit(row)}
                              className="flex items-center justify-center rounded-lg bg-yellow-50 p-2 text-yellow-600 transition hover:bg-yellow-100 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/40"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => toggleActive(row)}
                              disabled={busy}
                              className="flex items-center justify-center rounded-lg bg-gray-100 p-2 text-gray-600 transition hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 disabled:opacity-50"
                              title={active ? "Mark inactive" : "Mark active"}
                            >
                              {busy ? <Loader2 size={14} className="animate-spin" /> : active ? <Lock size={14} /> : <Unlock size={14} />}
                            </button>
                            <button
                              onClick={() => setDeleteRow(row)}
                              className="flex items-center justify-center rounded-lg bg-red-50 p-2 text-red-600 transition hover:bg-red-100 dark:bg-red-900/20"
                              title="Delete"
                            >
                              <Trash2 size={14} />
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
        <EmployeeDetailsModal
          isOpen={Boolean(viewRow)}
          onClose={() => setViewRow(null)}
          selected={viewRow}
          viewLoading={false}
          openEdit={(emp) => {
            const target = emp || viewRow;
            setViewRow(null);
            openEdit(target);
          }}
        />
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
        onClose={() => { setTrialModalRow(null); setTrialModalMode(null); }}
        initialData={
          trialModalRow
            ? { id: trialModalRow.id, raw: trialModalRow, addedBy: trialModalRow.added_by }
            : null
        }
        isViewMode={trialModalMode === "view"}
        onSuccess={() => { setTrialModalRow(null); setTrialModalMode(null); fetchAll(); }}
      />

      <AddEditEmployeeModal
        modal={editModal}
        setModal={(val) => {
          setEditModal(val);
          if (!val) setEditEmployeeRow(null);
        }}
        form={editForm}
        setForm={setEditForm}
        handleSave={handleEditSave}
        saveLoading={editSaving}
        viewLoading={false}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        unitOptions={[]}
        departmentsList={departmentOptions}
        setDepartmentsList={() => {}}
        setIsDeptModalOpen={() => {}}
      />

      {/* Photo Popup Modal */}
      {photoModalRow && (
        <div
          onClick={() => setPhotoModalRow(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white dark:bg-gray-800 w-full max-w-md flex flex-col rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                <span>Employee Photo</span>
                {isPhotoDeletedOrDummy(photoModalRow) && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-full border border-red-200 dark:border-red-800">
                    Dummy Photo Detected (Locked)
                  </span>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setPhotoModalRow(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200/60 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-200 transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 flex flex-col items-center text-center">
              {/* Photo Display Box */}
              <div className="relative group flex items-center justify-center w-56 h-56 sm:w-64 sm:h-64 rounded-2xl bg-gradient-to-br from-brand-500/10 via-gray-100 to-brand-500/5 dark:from-brand-900/30 dark:via-gray-800 dark:to-gray-900 border-2 border-brand-500/20 shadow-inner overflow-hidden mb-4">
                {modalPhotoUrl && !isPhotoDeletedOrDummy(photoModalRow) ? (
                  <img
                    src={modalPhotoUrl}
                    alt={photoModalRow.name || "Employee"}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-4">
                    <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center font-black text-3xl mb-2">
                      !
                    </div>
                    <p className="text-xs font-bold text-red-600 dark:text-red-400">
                      {isPhotoDeletedOrDummy(photoModalRow) ? "Dummy Photo Detected / Deleted" : "No Profile Photo"}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">Profile locked until photo uploaded</p>
                  </div>
                )}
              </div>

              {isPhotoDeletedOrDummy(photoModalRow) && (
                <div className="w-full mb-4 px-4 py-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-left flex items-start gap-2 text-xs text-red-700 dark:text-red-300 font-medium">
                  <AlertCircle size={16} className="shrink-0 text-red-500 mt-0.5" />
                  <span>
                    <strong>Dummy Photo Detected:</strong> Employee profile is currently locked. The employee will see a prompt to upload their original photo.
                  </span>
                </div>
              )}

              {/* Employee Info Details */}
              <h4 className="text-xl font-black tracking-tight text-gray-900 dark:text-white mb-1">
                {photoModalRow.name || "Unnamed Employee"}
              </h4>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3">
                {photoModalRow.email || "No email"}
              </p>

              {/* Stage & Status Badges */}
              <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                <Badge variant={(STAGE_META[photoModalRow.__stage] || STAGE_META.appointment).tone}>
                  {(STAGE_META[photoModalRow.__stage] || STAGE_META.appointment).label}
                </Badge>
                <Badge variant={
                  photoModalRow.__stage === "trial" ? "gray"
                  : photoModalRow.__stage === "appointment" ? "blue"
                  : isResigned(photoModalRow) ? "red"
                  : isActive(photoModalRow) ? "green"
                  : (photoModalRow.status === 2 || photoModalRow.status === "2") ? "yellow"
                  : "red"
                }>
                  {photoModalRow.__stage === "trial" ? "Trial"
                  : photoModalRow.__stage === "appointment" ? "Appointment"
                  : isResigned(photoModalRow) ? "Resigned"
                  : isActive(photoModalRow) ? "Active"
                  : (photoModalRow.status === 2 || photoModalRow.status === "2") ? "Pending"
                  : "Inactive"}
                </Badge>
              </div>

              {/* Metadata Grid */}
              <div className="w-full grid grid-cols-2 gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 text-left text-xs">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Emp Code</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{photoModalRow.emp_code || "—"}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Punching No</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{photoModalRow.punching_no || "—"}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Department</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{photoModalRow.department || "—"}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Company</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {getCompanyConfig(photoModalRow.company_code)?.label || photoModalRow.company_code || "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex flex-wrap gap-2">
              {modalPhotoUrl && !isPhotoDeletedOrDummy(photoModalRow) && (
                <a
                  href={modalPhotoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 dark:hover:bg-brand-900/40 text-brand-600 dark:text-brand-300 text-xs font-bold rounded-xl transition-colors"
                >
                  <Eye size={14} /> Full Image
                </a>
              )}
              <button
                type="button"
                onClick={() => handleOpenDeleteReasonModal(photoModalRow)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
                title="Delete profile picture & lock employee profile"
              >
                <Trash2 size={14} /> Delete Photo
              </button>
              <button
                type="button"
                onClick={() => setPhotoModalRow(null)}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 text-white text-xs font-bold rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
