import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  User, MapPin, Briefcase, CreditCard, Lock, LockKeyhole, Shield, Eye, EyeOff, Plus, Check,
  Building2, CloudUpload, Upload, FileSpreadsheet, X, Hash,
  Layers, TableProperties, HardDrive, Download, ChevronLeft, ChevronRight,
} from "lucide-react";
import Button from "../../components/ui/Button";
import { salaryApi, authApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { COMPANY_OPTIONS, getCompanyConfig } from "../../config/companyConfig";
import {
  PasswordStrength, isPasswordValid,
} from "./AdminModals/EmployeeHelpers";
import {
  validateEmployeeForm, validateEmail, validateMobile, validatePan,
  validateAadhaar, validateIfsc, validateBankAccount, validateEsi, validatePf,
} from "../../utils/validation";
import { buildSafeAadhaarUpdate } from "../../utils/aadhaar";
import AddNewDepartment from "./AdminModals/AddNewDepartment";
import UploadBatchPanel from "../../components/admin/UploadBatchPanel";
import BulkEmployeeValidation from "../../components/admin/BulkEmployeeValidation";
import ModernDatePicker from "../../components/ModernDatePicker";
import PendingEmployeesTab from "../../components/admin/PendingEmployeesTab";
import EmployeeMasterTable from "../../components/admin/EmployeeMasterTable";

// ─── Bulk-import helpers (column auto-matching) ───
function normalizeImportToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sanitizeEmployeeImportColumns(columns = []) {
  const seenKeys = new Set();
  return columns.reduce((acc, column) => {
    const key = String(column?.key || "").trim();
    const label = String(column?.label || "").trim();
    if (!key || !label || seenKeys.has(key)) return acc;
    seenKeys.add(key);
    acc.push({
      key,
      label,
      required: Boolean(column?.required),
      aliases: Array.isArray(column?.aliases)
        ? column.aliases.map((alias) => String(alias || "").trim()).filter(Boolean)
        : [],
    });
    return acc;
  }, []);
}

function getEmployeeImportMatchTokens(field) {
  return [field?.key, field?.label, ...(field?.aliases || [])]
    .map((token) => normalizeImportToken(token))
    .filter(Boolean);
}

function suggestEmployeeImportField(header, importFields = []) {
  const normalized = normalizeImportToken(header);
  if (!normalized) return "";
  for (const field of importFields) {
    const matchedAlias = getEmployeeImportMatchTokens(field).find(
      (normalizedAlias) =>
        normalized === normalizedAlias ||
        normalized.includes(normalizedAlias) ||
        normalizedAlias.includes(normalized),
    );
    if (matchedAlias) return field.key;
  }
  return "";
}

function buildEmployeeImportMappings(headers = [], importFields = []) {
  if (!Array.isArray(headers) || importFields.length === 0) return {};
  const usedFields = new Set();
  return headers.reduce((acc, header, index) => {
    const suggested = suggestEmployeeImportField(header, importFields);
    const mappingKey = String(index);
    if (suggested && !usedFields.has(suggested)) {
      acc[mappingKey] = suggested;
      usedFields.add(suggested);
      return acc;
    }
    acc[mappingKey] = "";
    return acc;
  }, {});
}

function parseExcelPreview(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const allRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        const [headerRow = [], ...dataRows] = allRows;
        resolve({
          sheetName,
          headers: headerRow.map(String),
          rows: dataRows, // full data — callers slice for display; validation needs every row
          totalRows: dataRows.length,
        });
      } catch {
        reject(new Error("Could not read file. Make sure it is a valid Excel file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsArrayBuffer(file);
  });
}

// The only thing the backend actually requires per row (see
// UserController::import) — mirrors that check here so problems show up
// before upload instead of only in the after-the-fact report.
function fmtFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SECTIONS = [
  { key: "basic", label: "Basic Info", subtitle: "Personal particulars", icon: User },
  { key: "address", label: "Address Details", subtitle: "Location records", icon: MapPin },
  { key: "employment", label: "Employment Info", subtitle: "Role & placement", icon: Briefcase },
  { key: "identity", label: "Identity & Bank", subtitle: "Direct deposits", icon: CreditCard },
  { key: "security", label: "Account Security", subtitle: "Portal credentialing", icon: Lock },
];

function getSectionErrors(key, form) {
  const errors = [];
  if (key === "basic") {
    if (!form.empCode.trim()) errors.push("Employee Code is required");
    if (!form.name.trim()) errors.push("Full Name is required");
    if (!form.email.trim()) errors.push("Email Address is required");
    else if (!validateEmail(form.email)) errors.push("Invalid Email format");
    if (form.mobileNo && !validateMobile(form.mobileNo)) errors.push("Mobile number must be exactly 10 digits");
  }
  if (key === "employment") {
    if (form.loginRole !== "agent" && !form.companyId) errors.push("Company is required");
  }
  if (key === "identity") {
    if (form.panCardNo && !validatePan(form.panCardNo)) errors.push("Invalid PAN Card format (e.g. ABCDE1234F)");
    if (form.aadharCardNo && !validateAadhaar(form.aadharCardNo)) errors.push("Aadhaar must be exactly 12 digits");
    if (form.bankIfscCode && !validateIfsc(form.bankIfscCode)) errors.push("Invalid IFSC Code format (e.g. SBIN0001234)");
    if (form.bankAccountNo && !validateBankAccount(form.bankAccountNo)) errors.push("Bank Account Number must be between 9 and 18 digits");
    if (form.esiNo && !validateEsi(form.esiNo)) errors.push("ESI Number must be exactly 17 digits");
    if (form.pfNo && !validatePf(form.pfNo)) errors.push("PF Number should be alphanumeric and up to 22 characters");
  }
  if (key === "security") {
    if (!form.password.trim()) errors.push("Password is required");
    else if (!isPasswordValid(form.password)) errors.push("Password must be 6+ chars with uppercase, lowercase, digit & special character");
  }
  return errors;
}

const fieldCls = "w-full rounded-xl border border-gray-200 bg-gray-100 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white";

// Used only if the database column list hasn't loaded yet when Download
// Template is clicked — keep in sync with UserController::importColumns().
const FALLBACK_EMPLOYEE_COLUMNS = [
  { key: "emp_code", label: "Employee Code" },
  { key: "name", label: "Full Name" },
  { key: "email", label: "Email" },
  { key: "mobile_number", label: "Mobile Number" },
  { key: "department", label: "Department" },
  { key: "designation", label: "Designation" },
  { key: "company_code", label: "Company" },
  { key: "unit", label: "Branch/Unit" },
];

function Label({ children, required }) {
  return (
    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  );
}

function SectionCard({ icon: Icon, title, index, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/[0.03] mb-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
          <Icon size={13} />
          {title}
        </div>
        <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
          Section {index} of {SECTIONS.length}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function DropZone({ dragOver, setDragOver, onDrop, onClick, fileInputRef, onFileChange }) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={onClick}
      className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition ${
        dragOver
          ? "border-brand-500 bg-brand-50/20 dark:bg-brand-950/10"
          : "border-gray-300 dark:border-white/10 hover:border-brand-400 hover:bg-gray-50/50 dark:hover:bg-white/[0.01]"
      }`}
    >
      <input ref={fileInputRef} type="file" onChange={onFileChange} accept=".xlsx,.xls" className="hidden" />
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400 mb-4">
        <Upload size={20} />
      </div>
      <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">
        Drag and drop your Excel file here, or <span className="text-brand-600">browse</span>
      </p>
      <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
        Only Excel files (.xlsx, .xls) under 10MB are supported
      </p>
    </div>
  );
}

function FilePreviewCard({ file, preview, onClear, uploading }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 font-bold shrink-0">
            <FileSpreadsheet size={18} />
          </div>
          <div className="min-w-0">
            <h5 className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-md">{file.name}</h5>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {fmtFileSize(file.size)} · {preview?.totalRows ?? 0} rows found
            </p>
          </div>
        </div>
        <button
          onClick={onClear} aria-label="Remove selected file"
          disabled={uploading}
          className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 transition flex-shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {preview && (
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {[
            { icon: <Hash size={13} />, label: "Rows", value: preview.totalRows },
            { icon: <TableProperties size={13} />, label: "Columns", value: preview.headers.length },
            { icon: <HardDrive size={13} />, label: "Size", value: fmtFileSize(file.size) },
          ].map(({ icon, label, value }) => (
            <div key={label} className="rounded-xl border border-brand-100 dark:border-brand-900/40 bg-brand-50 dark:bg-brand-900/15 px-3 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1 mb-1 text-brand-500 dark:text-brand-400">
                {icon}
                <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
              </div>
              <p className="text-base font-bold text-gray-800 dark:text-white leading-none">{value}</p>
            </div>
          ))}
        </div>
      )}

      {preview && preview.headers.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 dark:border-white/5 rounded-xl max-h-[30vh]">
          <table className="min-w-full text-left text-xs divide-y divide-gray-200 dark:divide-white/5">
            <thead className="bg-gray-100 dark:bg-[#121824] text-gray-500 dark:text-gray-400 font-bold sticky top-0">
              <tr>
                {preview.headers.slice(0, 8).map((header, idx) => (
                  <th key={idx} className="px-4 py-2 truncate">{header || `col ${idx + 1}`}</th>
                ))}
                {preview.headers.length > 8 && <th className="px-4 py-2">...</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/5 bg-white dark:bg-[#0b0f1a] text-gray-600 dark:text-slate-300">
              {preview.rows.slice(0, 5).map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.slice(0, 8).map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-4 py-2 truncate max-w-[120px]">{String(cell)}</td>
                  ))}
                  {row.length > 8 && <td className="px-4 py-2 text-gray-400">...</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AddEmployeePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { companyId, activeUnit, isAllCompanies } = useCompany();

  // Employee Master is the default mode. "single" and "pending" stay
  // unreachable (no trigger wired to them), but "bulk" is reachable again via
  // the "Bulk Employee Upload" button below.
  const [mode, setMode] = useState("master"); // "master" | "single" | "pending" | "bulk"

  // ─── Single-employee wizard state ───
  const [form, setForm] = useState({
    empCode: "", name: "", email: "", mobileNo: "", gender: "", dob: "",
    address: "", city: "", district: "", state: "", pin: "",
    department: "", designation: "", companyId: companyId !== "all" ? companyId : "", unit: "",
    loginRole: "employee", status: "Active", joiningDate: "", resignationDate: "",
    aadharCardNo: "", panCardNo: "", bankName: "", bankIfscCode: "", bankAccountNo: "",
    pfNo: "", esiNo: "", password: "",
  });
  const [saveLoading, setSaveLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [departmentsList, setDepartmentsList] = useState([]);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [maxReached, setMaxReached] = useState(0);

  const activeCompanyConfig = getCompanyConfig(form.companyId || companyId);
  const unitOptions = activeCompanyConfig ? activeCompanyConfig.units : [];
  const currentSection = SECTIONS[stepIndex];

  // ─── Bulk: new employees ───
  const [bulkCompanyId, setBulkCompanyId] = useState(companyId !== "all" ? companyId : "");
  const [bulkUnit, setBulkUnit] = useState(activeUnit || "");
  const bulkCompanyConfig = getCompanyConfig(bulkCompanyId);
  const bulkUnitOptions = bulkCompanyConfig ? bulkCompanyConfig.units : [];
  const [bulkReloadCounter, setBulkReloadCounter] = useState(0);
  const [justUploadedBatchId, setJustUploadedBatchId] = useState(null);

  const [empFile, setEmpFile] = useState(null);
  const [empDragOver, setEmpDragOver] = useState(false);
  const [empUploading, setEmpUploading] = useState(false);
  const [empPreview, setEmpPreview] = useState(null);
  const [empColumnMappings, setEmpColumnMappings] = useState({});
  const [importColumns, setImportColumns] = useState([]);
  const [importColumnsLoading, setImportColumnsLoading] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const empFileInputRef = useRef(null);

  const hasEmpCodeMapping = Object.values(empColumnMappings).includes("emp_code");

  useEffect(() => {
    salaryApi.getDepartments(user?.accessToken, user?.tokenType)
      .then((res) => setDepartmentsList(res?.data?.map((d) => d.name) || []))
      .catch((error) => console.error("Failed to fetch departments:", error));
  }, [user]);

  useEffect(() => {
    if (mode !== "bulk" || importColumns.length > 0 || importColumnsLoading) return;
    setImportColumnsLoading(true);
    salaryApi.getEmployeeImportColumns(user?.accessToken, user?.tokenType)
      .then((res) => setImportColumns(sanitizeEmployeeImportColumns(res?.data || [])))
      .catch((err) => toast.error(err.message || "Failed to load database columns"))
      .finally(() => setImportColumnsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const update = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: key === "mobileNo" ? e.target.value.replace(/\D/g, "") : e.target.value }));

  const updateCompany = (e) => setForm((prev) => ({ ...prev, companyId: e.target.value, unit: "" }));

  const input = ({ label, key, placeholder, type = "text", required }) => (
    <div key={key}>
      <Label required={required}>{label}</Label>
      {type === "date" ? (
        <ModernDatePicker
          name={key}
          value={form[key] || ""}
          onChange={update(key)}
          placeholder={placeholder}
          className={fieldCls}
        />
      ) : (
        <input
          type={type}
          inputMode={key === "mobileNo" ? "numeric" : undefined}
          maxLength={key === "mobileNo" ? 10 : undefined}
          value={form[key] || ""}
          onChange={update(key)}
          placeholder={placeholder}
          className={fieldCls}
        />
      )}
    </div>
  );

  const goToStep = (index) => {
    if (index <= maxReached) setStepIndex(index);
  };

  const goNext = () => {
    const errs = getSectionErrors(currentSection.key, form);
    if (errs.length) {
      toast.error(errs[0]);
      return;
    }
    if (stepIndex < SECTIONS.length - 1) {
      const next = stepIndex + 1;
      setStepIndex(next);
      setMaxReached((m) => Math.max(m, next));
    }
  };

  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

  const handleSave = async () => {
    const errs = getSectionErrors("security", form);
    if (errs.length) {
      toast.error(errs[0]);
      return;
    }
    const validationErrors = validateEmployeeForm(form);
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    const aadhaar = buildSafeAadhaarUpdate({
      enteredValue: form.aadharCardNo,
      isCreateMode: true,
    });

    if (aadhaar.error) {
      toast.error(aadhaar.error);
      return;
    }

    setSaveLoading(true);
    try {
      const payload = {
        emp_code: form.empCode,
        name: form.name,
        email: form.email,
        password: form.password,
        mobile_number: form.mobileNo || "",
        dob: form.dob || "",
        address: form.address || "",
        role:
          form.loginRole === "superadmin" ? "0"
            : form.loginRole === "master" ? "1"
              : form.loginRole === "manager" ? "2"
                : form.loginRole === "agent" ? "4"
                  : "3",
        type: form.loginRole === "agent" ? "agent" : null,
        status: form.status === "Active" ? "0" : "1",
        unit: form.loginRole === "master" || form.loginRole === "superadmin" || form.loginRole === "agent" ? null : (form.unit || null),
        company_code: form.companyId || companyId || undefined,
        department: form.department || null,
        designation: form.designation || null,
        gender: form.gender || null,
        city: form.city || null,
        pin: form.pin || null,
        district: form.district || null,
        state: form.state || null,
        pf_no: form.pfNo || null,
        esi_no: form.esiNo || null,
        bank_name: form.bankName || null,
        bank_ifsc_code: form.bankIfscCode || null,
        bank_account_no: form.bankAccountNo || null,
        // Always a create here — this page has no edit mode — so an entered
        // value is normalised to digits and a blank one is simply omitted. It
        // is never inherited from a candidate/appointment row.
        ...(aadhaar.include && { aadhar_card_no: aadhaar.value }),
        pan_card_no: form.panCardNo || null,
        joining_date: form.joiningDate || null,
        resignation_date: form.resignationDate || null,
      };

      await salaryApi.storeEmployee(payload, user?.accessToken, user?.tokenType, companyId);
      toast.success("Employee added successfully");
      navigate("/admin/employees");
    } catch (error) {
      toast.error(error.message || "Error creating employee");
    } finally {
      setSaveLoading(false);
    }
  };

  // ─── Bulk: new employees handlers ───
  const validateAndSetEmpFile = async (file) => {
    if (!file) return;
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (!allowed.includes(file.type) && !/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("Only Excel files (.xlsx, .xls) are allowed.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File is too large. Please upload a file under 10 MB.");
      return;
    }
    setEmpFile(file);
    try {
      const data = await parseExcelPreview(file);
      setEmpPreview(data);
      const mappings = buildEmployeeImportMappings(data.headers, importColumns);
      setEmpColumnMappings(mappings);
      if (Object.values(mappings).includes("emp_code")) {
        setShowValidation(true);
      }
    } catch (err) {
      toast.error(err.message);
      setEmpFile(null);
      setEmpPreview(null);
    }
  };

  const handleValidationConfirm = async (validRows) => {
    if (validRows.length === 0 || empUploading) return;
    setEmpUploading(true);
    try {
      const res = await authApi.importEmployeeRows(
        validRows, user?.accessToken, user?.tokenType,
        { companyId: bulkCompanyId, unit: bulkUnit }, bulkUnit,
      );
      const importedCount = res?.imported ?? 0;
      const skippedCount = res?.skipped?.length ?? 0;
      if (importedCount > 0) {
        toast.success(`${importedCount} employee(s) imported successfully` + (skippedCount > 0 ? `, ${skippedCount} row(s) skipped` : ""));
      } else {
        toast.error(res?.message || "Import completed but no records were added");
      }
      clearEmpFile();
      setBulkReloadCounter((prev) => prev + 1);
      if (res?.batch_id) setJustUploadedBatchId(res.batch_id);
    } catch (err) {
      toast.error(err.message || "Import failed. Please try again.");
    } finally {
      setEmpUploading(false);
    }
  };

  const handleValidationCancel = () => {
    clearEmpFile();
  };

  const clearEmpFile = (e) => {
    e?.stopPropagation();
    setEmpFile(null);
    setEmpPreview(null);
    setEmpColumnMappings({});
    setShowValidation(false);
    if (empFileInputRef.current) empFileInputRef.current.value = "";
  };

  const downloadEmployeeTemplate = () => {
    const cols = importColumns.length > 0 ? importColumns : FALLBACK_EMPLOYEE_COLUMNS;
    const headers = cols.map((f) => f.label);
    // Pre-fill the Company/Unit columns with what's selected above so a
    // single-company sheet doesn't need those typed on every row.
    const sampleValues = { company_code: bulkCompanyId, unit: bulkUnit };
    const sampleRow = cols.map((f) => sampleValues[f.key] || "");
    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, "employee_bulk_upload_template.xlsx");
  };

  return (
    <div className="flex flex-col gap-4 p-2 lg:p-6 min-h-[calc(100vh-80px)] bg-transparent">
      <div className="flex flex-1 flex-col xl:flex-row gap-6">
        {mode === "bulk" && (
          <div className="w-full xl:w-96 flex-shrink-0 flex flex-col gap-4">
            <UploadBatchPanel
              type="employee"
              icon={CloudUpload}
              title="Upload History"
              refreshKey={bulkReloadCounter}
              companyId={bulkCompanyId}
              autoOpenBatchId={justUploadedBatchId}
            />
          </div>
        )}

        {/* Right Column */}
        {mode === "master" ? (
          <EmployeeMasterTable onBulkUpload={() => setMode("bulk")} />
        ) : mode === "pending" ? (
          <PendingEmployeesTab />
        ) : mode === "single" ? (
          <div className="flex-1 flex flex-col bg-white dark:bg-[#0b0f1a] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden min-h-[70vh]">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/10 shrink-0">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
                  <Plus size={17} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add New Employee</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Register a new employee into the system</p>
                </div>
              </div>
            </div>

            <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden relative">
              <div className="w-full md:w-56 flex-shrink-0 overflow-x-auto scrollbar-hide border-b md:border-b-0 md:border-r border-gray-200 p-4 dark:border-white/10 flex flex-row md:flex-col gap-2 bg-gray-50/50 dark:bg-white/[0.01]">
                {SECTIONS.map(({ key, label, icon: Icon }, index) => {
                  const active = stepIndex === index;
                  const unlocked = index <= maxReached;
                  const done = index < maxReached;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!unlocked}
                      onClick={() => goToStep(index)}
                      className={`flex w-auto md:w-full flex-shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        active
                          ? "bg-brand-600 text-white shadow-md shadow-brand-600/20"
                          : unlocked
                            ? "text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-white/5"
                            : "text-gray-300 dark:text-slate-600 cursor-not-allowed"
                      }`}
                    >
                      {unlocked ? (
                        <Icon size={16} className={active ? "text-white" : "text-gray-400 dark:text-slate-500"} />
                      ) : (
                        <LockKeyhole size={16} className="text-gray-300 dark:text-slate-600" />
                      )}
                      <span className="text-sm font-medium">{label}</span>
                      {done && <Check size={13} className="ml-auto text-brand-600 dark:text-brand-400" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-hide">
                {currentSection.key === "basic" && (
                  <SectionCard icon={User} title="Basic Info" index={1}>
                    {input({ label: "Employee Code", key: "empCode", placeholder: "EMP001", required: true })}
                    {input({ label: "Full Name", key: "name", placeholder: "Rahul Sharma", required: true })}
                    <div>
                      <Label>Gender</Label>
                      <select value={form.gender || ""} onChange={update("gender")} className={fieldCls}>
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    {input({ label: "Email Address", key: "email", placeholder: "emp@gmail.com", type: "email", required: true })}
                    {input({ label: "Mobile Number", key: "mobileNo", placeholder: "9876543210", type: "tel" })}
                    {input({ label: "Date of Birth", key: "dob", type: "date" })}
                  </SectionCard>
                )}

                {currentSection.key === "address" && (
                  <SectionCard icon={MapPin} title="Address Details" index={2}>
                    <div className="sm:col-span-2">
                      <Label>Street Address</Label>
                      <input value={form.address || ""} onChange={update("address")} placeholder="Employee residential address" className={fieldCls} />
                    </div>
                    {input({ label: "City", key: "city", placeholder: "City" })}
                    {input({ label: "District", key: "district", placeholder: "District" })}
                    {input({ label: "State", key: "state", placeholder: "State" })}
                    {input({ label: "PIN Code", key: "pin", placeholder: "PIN Code" })}
                  </SectionCard>
                )}

                {currentSection.key === "employment" && (
                  <SectionCard icon={Briefcase} title="Employment Information" index={3}>
                    <div>
                      <Label>Department</Label>
                      <div className="flex gap-2">
                        <select value={form.department || ""} onChange={update("department")} className={fieldCls}>
                          <option value="">Select Department</option>
                          {departmentsList.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                        </select>
                        <button
                          type="button"
                          title="Add New Department"
                          onClick={() => setIsDeptModalOpen(true)}
                          className="flex-shrink-0 rounded-xl bg-brand-600 p-2.5 text-white transition hover:bg-brand-700"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>

                    {input({ label: "Designation", key: "designation", placeholder: "e.g. Senior Executive" })}

                    {form.loginRole !== "agent" && (
                      <div>
                        <Label required>Company</Label>
                        <select
                          value={form.companyId || ""}
                          onChange={updateCompany}
                          disabled={isAllCompanies === false}
                          className={fieldCls}
                        >
                          <option value="">Select Company</option>
                          {COMPANY_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </div>
                    )}

                    <div>
                      <Label>Working Unit</Label>
                      <select
                        value={form.unit || ""}
                        onChange={update("unit")}
                        disabled={form.loginRole === "master" || form.loginRole === "superadmin" || form.loginRole === "agent"}
                        className={`${fieldCls} ${(form.loginRole === "master" || form.loginRole === "superadmin" || form.loginRole === "agent") ? "opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800" : ""}`}
                      >
                        <option value="">Select Unit</option>
                        {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                    </div>

                    <div>
                      <Label>System Role</Label>
                      <select value={form.loginRole || "employee"} onChange={update("loginRole")} className={fieldCls}>
                        <option value="employee">Employee</option>
                        <option value="manager">Manager</option>
                        <option value="master">Master</option>
                        {user?.rawRole === 0 && <option value="superadmin">Super Admin</option>}
                        <option value="agent">Agent</option>
                      </select>
                    </div>

                    {form.loginRole === "agent" && user?.rawRole === 0 && (
                      <div>
                        <Label>Assign Company</Label>
                        <select value={form.agentCompany || ""} onChange={update("agentCompany")} className={fieldCls}>
                          <option value="">Both Companies (All)</option>
                          <option value="nidhi-impex">Nidhi Impex</option>
                          <option value="silverstar">Silver Star</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <Label>Active Status</Label>
                      <select value={form.status} onChange={update("status")} className={fieldCls}>
                        <option>Active</option>
                        <option>Inactive</option>
                      </select>
                    </div>

                    {input({ label: "Joining Date", key: "joiningDate", type: "date" })}

                    <div className="sm:col-span-2">
                      {input({ label: "Resignation Date (leave blank if active)", key: "resignationDate", type: "date" })}
                    </div>
                  </SectionCard>
                )}

                {currentSection.key === "identity" && (
                  <SectionCard icon={CreditCard} title="Identity & Bank Details" index={4}>
                    {input({ label: "Aadhaar Card No", key: "aadharCardNo", placeholder: "1234 5678 9012" })}
                    {input({ label: "PAN Card No", key: "panCardNo", placeholder: "ABCDE1234F" })}
                    {input({ label: "Bank Name", key: "bankName", placeholder: "Bank Name" })}
                    {input({ label: "Bank IFSC Code", key: "bankIfscCode", placeholder: "IFSC Code" })}
                    {input({ label: "Bank Account No", key: "bankAccountNo", placeholder: "Bank Account Number" })}
                    {input({ label: "PF Account No", key: "pfNo", placeholder: "PF Number" })}
                    {input({ label: "ESI ID No", key: "esiNo", placeholder: "ESI Number" })}
                  </SectionCard>
                )}

                {currentSection.key === "security" && (
                  <SectionCard icon={Lock} title="Account Security" index={5}>
                    <div className="sm:col-span-2">
                      <Label>Password</Label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={form.password || ""}
                          onChange={update("password")}
                          placeholder="••••••••"
                          className={`${fieldCls} pr-10`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          tabIndex={-1}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 transition hover:text-gray-700 dark:hover:text-slate-200"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <PasswordStrength password={form.password || ""} isEdit={false} />
                    </div>
                  </SectionCard>
                )}

                <div className="h-10"></div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02] shrink-0">
              <div className="hidden items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500 sm:flex">
                <Shield size={13} />
                System records are saved securely inside decentralized directory services.
              </div>

              <div className="ml-auto flex flex-wrap justify-end gap-3">
                <Button variant="secondary" onClick={() => (stepIndex === 0 ? navigate("/admin/employees") : goBack())} disabled={saveLoading}>
                  {stepIndex === 0 ? "Cancel" : (<><ChevronLeft size={14} /> Back</>)}
                </Button>
                {stepIndex < SECTIONS.length - 1 ? (
                  <Button icon={<ChevronRight size={14} />} onClick={goNext}>
                    Next
                  </Button>
                ) : (
                  <Button icon={<Check size={14} />} onClick={handleSave} disabled={saveLoading}>
                    {saveLoading ? "Saving..." : "Save Employee"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col bg-white dark:bg-[#0b0f1a] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden min-h-[70vh]">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/10 shrink-0">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => setMode("master")}
                  className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200 transition"
                  aria-label="Back to Employee Master"
                  title="Back to Employee Master"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
                  <CloudUpload size={17} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Bulk Employee Upload</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Add new employees to Employee Master from an Excel file
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              {/* Selection options */}
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
                <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400 mb-4">
                  <Building2 size={13} /> Selection Options
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label required={!isAllCompanies}>Company</Label>
                    <select
                      value={bulkCompanyId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setBulkCompanyId(nextId);
                        const nextConf = getCompanyConfig(nextId);
                        if (!nextConf || !nextConf.units.includes(bulkUnit)) setBulkUnit("");
                      }}
                      disabled={!isAllCompanies}
                      className={`${fieldCls} disabled:opacity-50`}
                    >
                      <option value="">
                        {isAllCompanies ? "Mixed — use Company column from file" : "Select Company"}
                      </option>
                      {COMPANY_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    {isAllCompanies && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        Uploading both companies in one sheet? Leave this blank and map a "Company" column when matching headers below — each row uses its own value.
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Branch/Unit</Label>
                    <select value={bulkUnit} onChange={(e) => setBulkUnit(e.target.value)} className={fieldCls}>
                      <option value="">All Branches</option>
                      {bulkUnitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button variant="secondary" icon={<Download size={14} />} onClick={downloadEmployeeTemplate}>
                    Download Excel Template
                  </Button>
                </div>
              </div>

              {showValidation && empPreview ? (
                <BulkEmployeeValidation
                  headers={empPreview.headers}
                  rawRows={empPreview.rows}
                  columnMappings={empColumnMappings}
                  onConfirm={handleValidationConfirm}
                  onCancel={handleValidationCancel}
                  uploading={empUploading}
                />
              ) : !empFile ? (
                <DropZone
                  dragOver={empDragOver}
                  setDragOver={setEmpDragOver}
                  onDrop={(e) => { e.preventDefault(); setEmpDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) validateAndSetEmpFile(f); }}
                  onClick={() => empFileInputRef.current?.click()}
                  fileInputRef={empFileInputRef}
                  onFileChange={(e) => { const f = e.target.files?.[0]; if (f) validateAndSetEmpFile(f); }}
                />
              ) : (
                <FilePreviewCard file={empFile} preview={empPreview} onClear={clearEmpFile} uploading={empUploading} />
              )}

              {!showValidation && empPreview && empPreview.headers.length > 0 && (
                importColumnsLoading ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">Checking file...</p>
                ) : !hasEmpCodeMapping ? (
                  <div className="rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-4">
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                      Couldn't detect an Employee Code column in this file
                    </p>
                    <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                      Make sure the sheet has a column like "Employee Code" or "Code" — download the template above for the expected format.
                    </p>
                  </div>
                ) : null
              )}
            </div>

            {!showValidation && (
              <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02] shrink-0">
                <div className="hidden items-center gap-2 text-xs text-gray-400 dark:text-slate-500 sm:flex">
                  {empPreview && (
                    <>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 font-medium">
                        <Hash size={10} /> {empPreview.totalRows} rows
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium">
                        <Layers size={10} /> {empPreview.sheetName}
                      </span>
                    </>
                  )}
                </div>

                <div className="ml-auto flex flex-wrap justify-end gap-3">
                  <Button variant="secondary" onClick={() => setMode("master")} disabled={empUploading}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <AddNewDepartment
        isDeptModalOpen={isDeptModalOpen}
        setIsDeptModalOpen={setIsDeptModalOpen}
        newDeptName={newDeptName}
        setNewDeptName={setNewDeptName}
        setDepartmentsList={setDepartmentsList}
        setForm={setForm}
        inputCls={fieldCls}
      />
    </div>
  );
}
