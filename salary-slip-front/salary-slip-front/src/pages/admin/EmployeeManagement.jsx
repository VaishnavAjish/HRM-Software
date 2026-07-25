import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Download,
  Crown,
  Mail,
  Hash,
  Upload,
  FileSpreadsheet,
  X,
  CloudUpload,
  CheckCircle,
  TableProperties,
  HardDrive,
  Phone,
  Calendar,
  CalendarOff,
  MapPin,
  MapPinned,
  Globe,
  Loader2,
  Building2,
  Table2,
  User,
  Briefcase,
  IdCard,
  Scan,
  Landmark,
  KeyRound,
  Wallet,
  ShieldCheck,
  HeartPulse,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig } from "../../config/companyConfig";
import { useTheme } from "../../context/ThemeContext";
import useGridHeaderContextMenu from "../../hooks/useGridHeaderContextMenu";
import useIsMobile from "../../hooks/useIsMobile";

import { SkeletonTable } from "../../components/ui/Skeleton";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Dropdown from "../../components/ui/Dropdown";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import GridHeaderContextMenu from "../../components/ui/GridHeaderContextMenu";
import toast from "react-hot-toast";
import { downloadExcel } from "../../utils/exportUtils";
import { salaryApi, authApi } from "../../utils/api";
import { baseUrl } from "../../utils/url";
import * as XLSX from "xlsx";

import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import AddEditEmployeeModal from "./AdminModals/AddEditEmployeeModal";
import DeleteEmployeeModal from "./AdminModals/DeleteEmployeeModal";
import AddNewDepartment from "./AdminModals/AddNewDepartment";
import EmployeeDetailsModal from "./AdminModals/EmployeeDetailsModal";
import EmployeeImportModal from "./AdminModals/EmployeeImportModal";
import AccountMasterUploadModal from "./AdminModals/AccountMasterUploadModal";
import {
  EmployeeAvatar,
  formatDisplayDate,
  isPasswordValid,
} from "./AdminModals/EmployeeHelpers";

ModuleRegistry.registerModules([AllCommunityModule]);

const emptyForm = {
  name: "",
  empCode: "",
  email: "",
  password: "",
  companyId: "",
  unit: "",
  status: "Active",
  loginRole: "employee",
  department: "",
  designation: "",
  accountName: "",
  accountNo: "",
  mobileNo: "",
  dob: "",
  address: "",
  gender: "",
  city: "",
  pin: "",
  district: "",
  state: "",
  pfNo: "",
  esiNo: "",
  bankName: "",
  bankIfscCode: "",
  bankAccountNo: "",
  aadharCardNo: "",
  panCardNo: "",
  joiningDate: "",
  resignationDate: "",
};

const FILTER_KEY_MAP = {
  empCode: "emp_code",
  accountNo: "account_no",
  accountName: "account_name",
  mobileNo: "mobile_no",
  loginRole: "role",
  unit: "unit",
};

const selectCls =
  "w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500";

const inputCls =
  "w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500";

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

    if (!key || !label || seenKeys.has(key)) {
      return acc;
    }

    seenKeys.add(key);
    acc.push({
      key,
      label,
      required: Boolean(column?.required),
      aliases: Array.isArray(column?.aliases)
        ? column.aliases
            .map((alias) => String(alias || "").trim())
            .filter(Boolean)
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

    if (matchedAlias) {
      return field.key;
    }
  }

  return "";
}

function buildEmployeeImportMappings(headers = [], importFields = []) {
  if (!Array.isArray(headers) || importFields.length === 0) {
    return {};
  }

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

function formatEmployeeImportFieldLabel(field) {
  return `${field.label} (${field.key})`;
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? "";
}

function mapEmployee(item) {
  const displayName = item.name || item.email?.split("@")[0] || "-";

  const avatar = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isActive = String(item.status) === "0";
  const roleValue = String(item.role);
  const loginRole =
    roleValue === "0"
      ? "superadmin"
      : roleValue === "1"
        ? "master"
        : roleValue === "2"
          ? "manager"
          : roleValue === "4" || item.type === "agent"
            ? "agent"
            : "employee";

  return {
    id: item.id,
    name: item.name ?? "",
    displayName,
    empCode: String(item.emp_code ?? ""),
    email: item.email ?? "",
    companyId: item.company_code ?? "",
    companyLabel: getCompanyConfig(item.company_code)?.label || "-",
    unit: item.unit ?? "",
    department: item.department ?? "",
    status: isActive ? "Active" : "Inactive",
    loginRole,
    agentCompany: item.company_code === "nidhi-impex,silverstar" || item.company_code === "all" ? "" : item.company_code,
    avatar,
    accountName: item.account_name ?? "",
    accountNo: item.account_no ?? "",
    mobileNo: firstPresent(item.mobile_no, item.mobile_number, item.mob_num),
    dob: firstPresent(item.dob, item.date_of_birth, item.birth_date),
    address: firstPresent(
      item.address,
      item.residential_address,
      item.current_address,
    ),
    gender: item.gender ?? "",
    city: item.city ?? "",
    pin: item.pin ?? "",
    district: item.district ?? "",
    state: item.state ?? "",
    pfNo: item.pf_no ?? "",
    esiNo: item.esi_no ?? "",
    bankName: item.bank_name ?? "",
    bankIfscCode: item.bank_ifsc_code ?? "",
    bankAccountNo: item.bank_account_no ?? "",
    aadharCardNo: item.aadhar_card_no ?? "",
    panCardNo: item.pan_card_no ?? "",
    designation: item.designation ?? "",
    joiningDate: firstPresent(item.joining_date, item.date_of_joining),
    resignationDate: item.resignation_date ?? "",
    photo: firstPresent(
      item.photo,
      item.image,
      item.profile_photo,
      item.profile_image,
      item.avatar,
    ),
  };
}

export default function EmployeeManagement() {
  const { user: currentUser } = useAuth();
  const { activeUnit, companyId, companyScope, isAllCompanies, scopeKey } =
    useCompany();
  const { dark } = useTheme();
  const isMobile = useIsMobile();

  const gridRef = useRef(null);
  const gridContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const { headerMenu, headerFrozen, closeHeaderMenu, toggleHeaderFrozen } =
    useGridHeaderContextMenu(gridRef, gridContainerRef);

  const [initialLoading, setInitialLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [apiPage, setApiPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [perPage, setPerPage] = useState(15);

  const [activeCount, setActiveCount] = useState(0);
  const [inactiveCount, setInactiveCount] = useState(0);

  const [apiFilter, setApiFilter] = useState({});
  const [gridFilterModel, setGridFilterModel] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);

  const [exportLoading, setExportLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [viewLoading, setViewLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [departmentsList, setDepartmentsList] = useState([]);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [columnMappings, setColumnMappings] = useState({});
  const [employeeImportColumns, setEmployeeImportColumns] = useState([]);
  const [importColumnsLoading, setImportColumnsLoading] = useState(false);

  const amFileInputRef = useRef(null);
  const [amUploadOpen, setAmUploadOpen] = useState(false);
  const [amSelectedFile, setAmSelectedFile] = useState(null);
  const [amUploading, setAmUploading] = useState(false);
  const [amPreview, setAmPreview] = useState(null);

  // The company a new/edited employee belongs to is now chosen right in the
  // form (see the Company field in AddEditEmployeeModal) rather than only
  // coming from the sidebar's company scope, so unit options must follow
  // whatever is currently selected in the form, not just the outer scope.
  const formCompanyId = form.companyId || companyId;
  const unitOptions = useMemo(
    () => getCompanyConfig(formCompanyId)?.units || [],
    [formCompanyId],
  );
  const fileHeaders = useMemo(
    () =>
      (preview?.headers || []).map((header, index) => ({
        id: String(index),
        index,
        label: String(header || "").trim() || `Column ${index + 1}`,
      })),
    [preview],
  );
  const mappedFieldCount = useMemo(
    () => Object.values(columnMappings).filter(Boolean).length,
    [columnMappings],
  );
  const requiredEmployeeImportFields = useMemo(
    () => employeeImportColumns.filter((field) => field.required),
    [employeeImportColumns],
  );
  const missingRequiredImportFields = useMemo(
    () =>
      requiredEmployeeImportFields.filter(
        (field) => !Object.values(columnMappings).includes(field.key),
      ),
    [columnMappings, requiredEmployeeImportFields],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setTableLoading(true);

      try {
        const res = await salaryApi.getEmployees(
          currentUser?.accessToken,
          currentUser?.tokenType,
          apiPage,
          perPage,
          apiFilter,
          companyScope,
        );

        if (cancelled) return;

        const responseData = res?.data;
        const pagination = responseData?.users;
        const list = (pagination?.data ?? []).map(mapEmployee);

        setEmployees(list);
        setTotalRecords(pagination?.total ?? list.length);
        setPerPage(pagination?.per_page ?? 15);
        setActiveCount(responseData?.active_users ?? 0);
        setInactiveCount(responseData?.inactive_users ?? 0);
      } catch (err) {
        if (!cancelled) {
          toast.error(err.message || "Failed to load employees");
        }
      } finally {
        if (!cancelled) {
          setTableLoading(false);
          setInitialLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [
    apiPage,
    perPage,
    apiFilter,
    refreshKey,
    companyScope,
    currentUser?.accessToken,
    currentUser?.tokenType,
    scopeKey,
  ]);

  useEffect(() => {
    setApiPage(1);
    setModal(null);
  }, [scopeKey]);

  useEffect(() => {
    if (!preview?.headers?.length || employeeImportColumns.length === 0) {
      return;
    }

    setColumnMappings((prev) => {
      if (Object.keys(prev).length > 0) {
        return prev;
      }

      return buildEmployeeImportMappings(
        preview.headers,
        employeeImportColumns,
      );
    });
  }, [employeeImportColumns, preview]);

  const refetchEmployees = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const openImportModal = useCallback(async () => {
    if (isAllCompanies) {
      toast.error("Select one company before importing employees.");
      return;
    }

    setUploadOpen(true);

    if (employeeImportColumns.length > 0 || importColumnsLoading) {
      return;
    }

    setImportColumnsLoading(true);

    try {
      const res = await salaryApi.getEmployeeImportColumns(
        currentUser?.accessToken,
        currentUser?.tokenType,
      );
      setEmployeeImportColumns(
        sanitizeEmployeeImportColumns(res?.data?.columns || []),
      );
    } catch (err) {
      toast.error(err.message || "Failed to load database columns");
    } finally {
      setImportColumnsLoading(false);
    }
  }, [
    currentUser?.accessToken,
    currentUser?.tokenType,
    employeeImportColumns.length,
    importColumnsLoading,
    isAllCompanies,
  ]);

  const openAdd = useCallback(() => {
    setForm({
      ...emptyForm,
      companyId: isAllCompanies ? "" : companyId,
      unit: activeUnit || "",
    });
    setSelected(null);
    setShowPassword(false);
    setModal("add");
  }, [activeUnit, companyId, isAllCompanies]);

  const openEdit = useCallback(
    async (emp) => {
      setForm({ ...emp, password: "" });
      setSelected(emp);
      setShowPassword(false);
      setModal("edit");
      setViewLoading(true);

      try {
        const res = await salaryApi.getEmployee(
          emp.id,
          currentUser?.accessToken,
          currentUser?.tokenType,
          companyScope,
        );

        const full = mapEmployee(res?.data ?? res);

        setSelected(full);
        setForm((prev) => ({
          ...prev,
          ...full,
          password: "",
        }));
      } catch {
        // partial row data already available
      } finally {
        setViewLoading(false);
      }
    },
    [companyScope, currentUser?.accessToken, currentUser?.tokenType],
  );

  const openView = useCallback(
    async (emp) => {
      setSelected(emp);
      setModal("view");
      setViewLoading(true);

      try {
        const res = await salaryApi.getEmployee(
          emp.id,
          currentUser?.accessToken,
          currentUser?.tokenType,
          companyScope,
        );

        setSelected(mapEmployee(res?.data ?? res));
      } catch (err) {
        toast.error(err.message || "Failed to load employee");
      } finally {
        setViewLoading(false);
      }
    },
    [companyScope, currentUser?.accessToken, currentUser?.tokenType],
  );

  const openDelete = useCallback((emp) => {
    setSelected(emp);
    setModal("delete");
  }, []);

  const handleFilterChanged = useCallback((params) => {
    const filterModel = params.api.getFilterModel();

    setGridFilterModel(filterModel);

    const newFilters = {};

    Object.keys(filterModel).forEach((field) => {
      const backendKey = FILTER_KEY_MAP[field] || field;
      const filterItem = filterModel[field];

      let value = "";

      if (filterItem?.filter !== undefined && filterItem?.filter !== null) {
        value = filterItem.filter;
      } else if (
        filterItem?.condition1?.filter !== undefined &&
        filterItem?.condition1?.filter !== null
      ) {
        value = filterItem.condition1.filter;
      }

      if (value !== "") {
        newFilters[backendKey] = value;
      }
    });

    setApiFilter((prev) => {
      const prevString = JSON.stringify(prev);
      const nextString = JSON.stringify(newFilters);

      if (prevString === nextString) {
        return prev;
      }

      return newFilters;
    });

    setApiPage((prev) => (prev === 1 ? prev : 1));
  }, []);

  const handleSave = async () => {
    if (form.loginRole !== "agent" && !form.companyId) {
      toast.error("Select a company");
      return;
    }

    if (unitOptions.length > 0 && !form.unit && form.loginRole !== "master" && form.loginRole !== "superadmin" && form.loginRole !== "agent") {
      toast.error("Select unit");
      return;
    }

    const mobileNo = (form.mobileNo || "").trim();
    const address = (form.address || "").trim();

    if (mobileNo && !/^\d{10}$/.test(mobileNo)) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }

    if (modal === "add") {
      if (!form.empCode.trim() || !form.email.trim() || !form.password.trim()) {
        toast.error("Emp Code, Email and Password are required");
        return;
      }

      if (!isPasswordValid(form.password)) {
        toast.error(
          "Password must be 6+ chars with uppercase, lowercase, digit & special character",
        );
        return;
      }

      setSaveLoading(true);

      try {
        const payload = {
          emp_code: form.empCode,
          name: form.name,
          email: form.email,
          password: form.password,
          mobile_number: mobileNo || "",
          dob: form.dob || "",
          address: address || "",
          role:
            form.loginRole === "superadmin"
              ? "0"
              : form.loginRole === "master"
                ? "1"
                : form.loginRole === "manager"
                  ? "2"
                  : form.loginRole === "agent"
                    ? "4"
                    : "3",
          type: form.loginRole === "agent" ? "agent" : null,
          status: form.status === "Active" ? "0" : "1",
          unit: form.loginRole === "master" || form.loginRole === "superadmin" || form.loginRole === "agent" ? null : (form.unit || null),
          company_code: form.loginRole === "agent" && currentUser?.rawRole === 0
            ? (form.agentCompany || "all")
            : (form.companyId || undefined),
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
          aadhar_card_no: form.aadharCardNo || null,
          pan_card_no: form.panCardNo || null,
          joining_date: form.joiningDate || null,
          resignation_date: form.resignationDate || null,
        };

        await salaryApi.storeEmployee(
          payload,
          currentUser?.accessToken,
          currentUser?.tokenType,
          companyScope,
        );

        toast.success("Employee added successfully");
        setModal(null);
        setApiPage(1);
        refetchEmployees();
      } catch (err) {
        toast.error(err.message || "Failed to add employee");
      } finally {
        setSaveLoading(false);
      }

      return;
    }

    if (form.password.trim() && !isPasswordValid(form.password)) {
      toast.error(
        "Password must be 6+ chars with uppercase, lowercase, digit & special character",
      );
      return;
    }

    setSaveLoading(true);

    try {
      const payload = {
        emp_code: form.empCode,
        name: form.name,
        email: form.email,
        mobile_number: mobileNo || "",
        dob: form.dob || "",
        address: address || "",
        role:
          form.loginRole === "superadmin"
            ? "0"
            : form.loginRole === "master"
              ? "1"
              : form.loginRole === "manager"
                ? "2"
                : form.loginRole === "agent"
                  ? "4"
                  : "3",
        type: form.loginRole === "agent" ? "agent" : null,
        status: form.status === "Active" ? "0" : "1",
        unit: form.loginRole === "master" || form.loginRole === "superadmin" || form.loginRole === "agent" ? null : (form.unit || null),
        company_code: form.loginRole === "agent" && currentUser?.rawRole === 0 
          ? (form.agentCompany || "all")
          : undefined,
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
        aadhar_card_no: form.aadharCardNo || null,
        pan_card_no: form.panCardNo || null,
        joining_date: form.joiningDate || null,
        resignation_date: form.resignationDate || null,
      };

      if (form.password.trim()) {
        payload.password = form.password;
      }

      await salaryApi.editEmployee(
        selected.id,
        payload,
        currentUser?.accessToken,
        currentUser?.tokenType,
        {
          companyId: selected?.companyId || companyId,
          unit: form.unit || null,
        },
      );

      toast.success("Employee updated");
      setModal(null);
      refetchEmployees();
    } catch (err) {
      toast.error(err.message || "Failed to update employee");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selected?.id) return;

    setDeleteLoading(true);

    try {
      const res = await salaryApi.deleteEmployee(
        selected.id,
        currentUser?.accessToken,
        currentUser?.tokenType,
        {
          companyId: selected?.companyId || companyId,
          unit: selected?.unit || activeUnit || null,
        },
      );

      toast.success(res?.message || "Employee deleted");
      setModal(null);
      refetchEmployees();
    } catch (err) {
      toast.error(err.message || "Failed to delete employee");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleExport = async () => {
    setExportLoading(true);

    try {
      const res = await salaryApi.getAllEmployees(
        currentUser?.accessToken,
        currentUser?.tokenType,
        apiFilter,
        companyScope,
      );

      const all = (res?.data?.users?.data ?? res?.data?.users ?? []).map(
        mapEmployee,
      );

      if (all.length === 0) {
        toast.error("No employees found");
        //setExportLoading(false);
        return;
      }

      const data = all.map((e) => ({
        Company: e.companyLabel || "N.A.",
        Unit: e.unit || "N.A.",
        "Emp Code": e.empCode,
        Name: e.name || "N.A.",
        Gender: e.gender || "N.A.",
        Email: e.email || "N.A.",
        "Mobile Number": e.mobileNo || "N.A.",
        "Date of Birth": formatDisplayDate(e.dob) || "N.A.",
        Address: e.address || "N.A.",
        City: e.city || "N.A.",
        District: e.district || "N.A.",
        State: e.state || "N.A.",
        PIN: e.pin || "N.A.",
        Department: e.department || "N.A.",
        Designation: e.designation || "N.A.",
        "Aadhar Card No": e.aadharCardNo || "N.A.",
        "PAN Card No": e.panCardNo || "N.A.",
        "Bank Name": e.bankName || "N.A.",
        "Bank IFSC Code": e.bankIfscCode || "N.A.",
        "Bank Account No": e.bankAccountNo || "N.A.",
        "PF No": e.pfNo || "N.A.",
        "ESI No": e.esiNo || "N.A.",
        "Joining Date": formatDisplayDate(e.joiningDate) || "N.A.",
        "Resignation Date": formatDisplayDate(e.resignationDate) || "N.A.",
        Role: e.loginRole === "superadmin" ? "Super Admin" : "Employee",
        Status: e.status,
      }));

      downloadExcel(data, "employees");
      toast.success("Employee list exported to Excel");
    } catch (err) {
      toast.error(err.message || "Failed to export employees");
    } finally {
      setExportLoading(false);
    }
  };

  function parseExcelPreview(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target.result), {
            type: "array",
          });

          const sheetName = wb.SheetNames[0];

          const allRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
            header: 1,
            defval: "",
          });

          const [headerRow = [], ...dataRows] = allRows;

          resolve({
            sheetName,
            headers: headerRow.map(String),
            rows: dataRows.slice(0, 6),
            totalRows: dataRows.length,
          });
        } catch {
          reject(
            new Error(
              "Could not read file. Make sure it is a valid Excel file.",
            ),
          );
        }
      };

      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsArrayBuffer(file);
    });
  }

  async function validateAndSet(file) {
    if (!file) return;

    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];

    if (!allowed.includes(file.type) && !/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("Only Excel files (.xlsx, .xls) are allowed.");
      return;
    }

    // The xlsx parser has a known ReDoS/prototype-pollution advisory with no
    // upstream fix (only mitigation is limiting what it's asked to parse) —
    // capping the input size keeps a crafted file from hanging the tab.
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File is too large. Please upload a file under 10 MB.");
      return;
    }

    setSelectedFile(file);

    try {
      const data = await parseExcelPreview(file);
      setPreview(data);
      setColumnMappings(
        buildEmployeeImportMappings(data.headers, employeeImportColumns),
      );
    } catch (err) {
      toast.error(err.message);
      setSelectedFile(null);
      setPreview(null);
      setColumnMappings({});
    }
  }

  function updateColumnMapping(columnId, nextValue) {
    setColumnMappings((prev) => {
      const next = { ...prev };

      if (nextValue) {
        Object.keys(next).forEach((key) => {
          if (key !== columnId && next[key] === nextValue) {
            next[key] = "";
          }
        });
      }

      next[columnId] = nextValue;
      return next;
    });
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) validateAndSet(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSet(file);
  }

  function resetUpload() {
    setSelectedFile(null);
    setPreview(null);
    setColumnMappings({});
    setUploadOpen(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearFile(e) {
    e?.stopPropagation();

    setSelectedFile(null);
    setPreview(null);
    setColumnMappings({});

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleUpload() {
    if (!selectedFile) return;
    if (importColumnsLoading || employeeImportColumns.length === 0) {
      toast.error("Database columns are still loading. Please wait a moment.");
      return;
    }
    if (missingRequiredImportFields.length > 0) {
      toast.error(
        `Map required columns: ${missingRequiredImportFields.map((field) => field.label).join(", ")}`,
      );
      return;
    }

    setUploading(true);

    try {
      await authApi.importEmployees(
        selectedFile,
        currentUser?.accessToken,
        currentUser?.tokenType,
        companyScope,
        columnMappings,
      );

      toast.success("Employees imported successfully!");
      resetUpload();
      setApiPage(1);
      refetchEmployees();
    } catch (err) {
      toast.error(err.message || "Import failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function fmtFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function amParseExcelPreview(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target.result), {
            type: "array",
          });
          const sheetName = wb.SheetNames[0];
          const allRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
            header: 1,
            defval: "",
          });
          const [headerRow = [], ...dataRows] = allRows;
          resolve({
            sheetName,
            headers: headerRow.map(String),
            rows: dataRows,
            totalRows: dataRows.length,
          });
        } catch {
          reject(
            new Error(
              "Could not read file. Make sure it is a valid Excel file.",
            ),
          );
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsArrayBuffer(file);
    });
  }

  async function amValidateAndSet(file) {
    if (!file) return;
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (!allowed.includes(file.type) && !/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("Only Excel files (.xlsx, .xls) are allowed.");
      return;
    }
    setAmSelectedFile(file);
    try {
      const data = await amParseExcelPreview(file);
      setAmPreview(data);
    } catch (err) {
      toast.error(err.message);
      setAmSelectedFile(null);
      setAmPreview(null);
    }
  }

  function amHandleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) amValidateAndSet(file);
  }

  function amResetUpload() {
    setAmSelectedFile(null);
    setAmPreview(null);
    setAmUploadOpen(false);
    if (amFileInputRef.current) amFileInputRef.current.value = "";
  }

  function amClearFile(e) {
    e?.stopPropagation();
    setAmSelectedFile(null);
    setAmPreview(null);
    if (amFileInputRef.current) amFileInputRef.current.value = "";
  }

  function openAmUpload() {
    if (isAllCompanies) {
      toast.error("Select one company before uploading account master.");
      return;
    }
    if (unitOptions.length > 0 && !activeUnit) {
      toast.error("Select a branch from the sidebar before uploading account master.");
      return;
    }
    setAmUploadOpen(true);
  }

  async function amHandleUpload() {
    if (!amSelectedFile) return;

    setAmUploading(true);
    try {
      await salaryApi.uploadAccountMaster(
        amSelectedFile,
        currentUser?.accessToken,
        currentUser?.tokenType,
        { companyId, unit: activeUnit },
      );
      toast.success("Account master uploaded successfully!");
      amResetUpload();
    } catch (err) {
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setAmUploading(false);
    }
  }

  function downloadAccountMasterTemplate() {
    const headers = [
      "Code",
      "Employee Name",
      "Gender",
      "PAN",
      "Address",
      "City",
      "PIN",
      "District",
      "State",
      "Mobile",
      "PF No.",
      "ESI No.",
      "Bank Name",
      "IFSC",
      "A/c Number",
      "Aadhar Number",
      "Branch",
      "Department",
      "Designation",
      "Date of Joining",
      "DOB",
      "Resignation Date",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Account Master");
    XLSX.writeFile(wb, "account_master_template.xlsx");
  }

  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      filter: "agTextColumnFilter",
      resizable: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      suppressHeaderFilterButton: false,
      cellClass: "employee-ag-cell",
      cellStyle: { overflow: "hidden" },
      filterParams: {
        buttons: ["apply", "reset"],
        closeOnApply: false,
        trimInput: true,
        debounceMs: 200,
      },
    }),
    [],
  );

  const columnDefs = useMemo(() => {
    if (isMobile) {
      return [
        {
          headerName: "Employee Record",
          field: "mobileDetails",
          flex: 1,
          cellRenderer: ({ data: emp }) => {
            if (!emp) return null;
            return (
              <div className="flex flex-col justify-center py-2 gap-2 h-full w-full">
                <div className="flex justify-between items-center w-full pr-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-semibold text-gray-900 dark:text-white truncate text-sm block">
                      {emp.name}
                    </span>
                    {emp.loginRole === "superadmin" && <Crown size={12} className="text-purple-600 shrink-0" />}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 w-full pr-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <button
                      onClick={() => openView(emp)}
                      className="flex min-w-0 flex-1 justify-center items-center gap-1.5 rounded-lg bg-brand-50 px-2 py-2 text-xs font-semibold text-brand-600 transition hover:bg-brand-100 min-h-[36px]"
                    >
                      <Eye size={13} />
                      View
                    </button>
                    <button
                      onClick={() => openEdit(emp)}
                      className="flex min-w-0 flex-1 justify-center items-center gap-1.5 rounded-lg bg-yellow-50 px-2 py-2 text-xs font-semibold text-yellow-600 transition hover:bg-yellow-100 min-h-[36px]"
                    >
                      <Edit2 size={13} />
                      Edit
                    </button>
                    <button
                      onClick={() => openDelete(emp)}
                      className="flex min-w-0 flex-1 justify-center items-center gap-1.5 rounded-lg bg-red-50 px-2 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 min-h-[36px]"
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          },
        },
      ];
    }

    return [
      {
        headerName: "Emp Code",
        field: "empCode",
        minWidth: 140,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellClass:
          "employee-ag-cell font-mono text-gray-600 dark:text-gray-300",
      },
      {
        headerName: "Name",
        field: "name",
        minWidth: 160,
        flex: 1,
        cellStyle: { overflow: "hidden" },
        valueGetter: ({ data }) => data?.name || data?.displayName || "-",
        filter: "agTextColumnFilter",
        cellRenderer: ({ data: emp }) => {
          if (!emp) return null;

          return (
            <div className="flex h-full w-full items-center gap-3 overflow-hidden">
              <EmployeeAvatar employee={emp} size="sm" />

              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {emp.name || "-"}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "Gender",
        field: "gender",
        minWidth: 130,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <User size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Email",
        field: "email",
        minWidth: 160,
        flex: 1,
        hide: isMobile,
        cellStyle: { overflow: "hidden" },
        valueGetter: ({ data }) => data?.email || "-",
        filter: "agTextColumnFilter",
        cellRenderer: ({ data: emp }) => {
          if (!emp) return null;

          return (
            <div className="flex h-full w-full items-center gap-2 overflow-hidden">
              <Mail size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
                {emp.email || "-"}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "Mobile",
        field: "mobileNo",
        minWidth: 150,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ data: emp }) => {
          if (!emp) return null;

          return (
            <div className="flex h-full w-full items-center gap-2 overflow-hidden">
              <Phone size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
              <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
                {emp.mobileNo || "-"}
              </span>
            </div>
          );
        },
      },
      {
        headerName: "DOB",
        field: "dob",
        minWidth: 130,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        valueFormatter: ({ value }) => formatDisplayDate(value) || "-",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <Calendar size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {formatDisplayDate(value) || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Address",
        field: "address",
        minWidth: 220,
        flex: 1.2,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellStyle: { overflow: "hidden" },
        cellRenderer: ({ value }) => (
          <div
            className="flex h-full w-full items-center gap-2 overflow-hidden"
            title={value || ""}
          >
            <MapPin size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Department",
        field: "department",
        minWidth: 150,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <Building2 size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Designation",
        field: "designation",
        minWidth: 150,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <Briefcase size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "City",
        field: "city",
        minWidth: 130,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <MapPin size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "District",
        field: "district",
        minWidth: 130,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <MapPinned size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "State",
        field: "state",
        minWidth: 130,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <Globe size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "PIN",
        field: "pin",
        minWidth: 110,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellClass:
          "employee-ag-cell font-mono text-gray-600 dark:text-gray-300",
      },
      {
        headerName: "Aadhar Card No",
        field: "aadharCardNo",
        minWidth: 160,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <Scan size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "PAN Card No",
        field: "panCardNo",
        minWidth: 150,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <IdCard size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Bank Name",
        field: "bankName",
        minWidth: 150,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <Landmark size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Bank IFSC Code",
        field: "bankIfscCode",
        minWidth: 150,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <KeyRound size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Bank Account No",
        field: "bankAccountNo",
        minWidth: 160,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <Wallet size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "PF No",
        field: "pfNo",
        minWidth: 130,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <ShieldCheck size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "ESI No",
        field: "esiNo",
        minWidth: 130,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <HeartPulse size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Joining Date",
        field: "joiningDate",
        minWidth: 140,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        valueFormatter: ({ value }) => formatDisplayDate(value) || "-",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <Calendar size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {formatDisplayDate(value) || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Resignation Date",
        field: "resignationDate",
        minWidth: 150,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        valueFormatter: ({ value }) => formatDisplayDate(value) || "-",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center gap-2 overflow-hidden">
            <CalendarOff size={14} className="text-gray-900 dark:text-white flex-shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {formatDisplayDate(value) || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Company",
        field: "companyLabel",
        minWidth: 150,
        flex: 1,
        hide: isMobile,
        filter: false,
        cellRenderer: ({ data: emp }) =>
          emp ? <Badge variant="blue">{emp.companyLabel}</Badge> : null,
      },
      {
        headerName: "Unit",
        field: "unit",
        minWidth: 140,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <Badge variant="gray">{value || "-"}</Badge>
        ),
      },
      {
        headerName: "Role",
        field: "loginRole",
        minWidth: 160,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        filterValueGetter: ({ data }) =>
          data?.loginRole === "superadmin" ? "Super Admin" : "Employee",
        valueFormatter: ({ value }) =>
          value === "superadmin" ? "Super Admin" : "Employee",
        cellRenderer: ({ data: emp }) => {
          if (!emp) return null;

          return (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                emp.loginRole === "superadmin"
                  ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                  : "bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300"
              }`}
            >
              {emp.loginRole === "superadmin" && <Crown size={10} />}
              {emp.loginRole === "superadmin" ? "Super Admin" : "Employee"}
            </span>
          );
        },
      },
      {
        headerName: "Status",
        field: "status",
        minWidth: 160,
        flex: 1,
        hide: isMobile,
        filter: "agTextColumnFilter",
        cellRenderer: ({ data: emp }) =>
          emp ? (
            <Badge variant={emp.status === "Active" ? "green" : "gray"}>
              {emp.status}
            </Badge>
          ) : null,
      },
      {
        headerName: "Actions",
        field: "actions",
        pinned: "right",
        minWidth: 120,
        maxWidth: 170,
        sortable: false,
        filter: false,
        suppressHeaderFilterButton: true,
        cellRenderer: ({ data: emp }) => {
          if (!emp) return null;

          return (
            <div className="flex h-full items-center gap-1.5">
              <button
                onClick={() => openView(emp)}
                className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-600 transition hover:bg-brand-100 dark:bg-brand-900/20 dark:hover:bg-brand-900/40"
                title="View"
              >
                <Eye size={12} />
              </button>

              <button
                onClick={() => openEdit(emp)}
                className="flex items-center gap-1.5 rounded-lg bg-yellow-50 px-2.5 py-1.5 text-xs font-medium text-yellow-600 transition hover:bg-yellow-100 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/40"
                title="Edit"
              >
                <Edit2 size={12} />
              </button>

              <button
                onClick={() => openDelete(emp)}
                className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 dark:bg-red-900/20"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        },
      },
    ];
  }, [openDelete, openEdit, openView, isMobile]);

  if (initialLoading) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="ml-auto flex gap-2">
            <div className="skeleton h-10 w-32 rounded-xl" />
            <div className="skeleton h-10 w-32 rounded-xl" />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-4 w-20 rounded" />
          <div className="skeleton h-4 w-24 rounded" />
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-100 p-5 dark:border-gray-700">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {[...Array(6)].map((_, index) => (
                <div key={index} className="skeleton h-4 rounded" />
              ))}
            </div>
          </div>
          <div className="p-5">
            <SkeletonTable rows={9} />
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-gray-700">
            <div className="skeleton h-4 w-36 rounded" />
            <div className="flex gap-2">
              <div className="skeleton h-8 w-8 rounded-lg" />
              <div className="skeleton h-8 w-8 rounded-lg" />
              <div className="skeleton h-8 w-8 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex flex-wrap gap-2 ml-auto items-center">
          <Dropdown
            items={[
              {
                label: "Download CSV Template",
                icon: <Table2 size={15} />,
                iconBg: "bg-brand-50 dark:bg-brand-900/20",
                iconColor: "text-brand-600 dark:text-brand-400",
                onClick: downloadAccountMasterTemplate,
              },
              {
                label: "Upload Account Master",
                icon: <CloudUpload size={15} />,
                iconBg: "bg-amber-50 dark:bg-amber-900/20",
                iconColor: "text-amber-600 dark:text-amber-400",
                labelColor: "text-amber-700 dark:text-amber-400",
                onClick: openAmUpload,
              },
            ]}
            trigger={({ open, toggle }) => (
              <Button variant="secondary" onClick={toggle} icon={<Upload size={16} />}>
                Import Data
                <ChevronDown
                  size={14}
                  className={`transition-transform ${open ? "rotate-180" : ""}`}
                />
              </Button>
            )}
          />

          <Button onClick={openAdd} icon={<Plus size={16} />}>
            Add Employee
          </Button>

          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={exportLoading || tableLoading}
            icon={
              exportLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )
            }
          >
            {exportLoading ? "Exporting..." : "Export CSV"}
          </Button>

          <Button
            variant="secondary"
            onClick={refetchEmployees}
            disabled={tableLoading}
            icon={
              tableLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : null
            }
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400">
        <span>
          <strong className="text-gray-900 dark:text-white">
            {totalRecords}
          </strong>{" "}
          total employees
        </span>

        <span className="text-green-600">
          <strong>{activeCount}</strong> active
        </span>

        <span className="text-gray-400">
          <strong>{inactiveCount}</strong> inactive
        </span>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        <div
          ref={gridContainerRef}
          className={`employee-ag-grid w-full ${
            dark ? "ag-theme-alpine-dark" : "ag-theme-alpine"
          } ${headerFrozen ? "grid-header-frozen" : ""}`}
        >
          <AgGridReact
            key={isMobile ? "mobile" : "desktop"}
            ref={gridRef}
            rowData={employees}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            loading={tableLoading}
            getRowId={(params) => String(params.data.id)}
            maintainColumnOrder={true}
            domLayout="autoHeight"
            rowHeight={isMobile ? 84 : 64}
            headerHeight={48}
            popupParent={document.body}
            suppressCellFocus
            enableCellTextSelection
            animateRows
            overlayNoRowsTemplate="<span class='text-gray-400'>No employees found</span>"
            onGridReady={(params) => {
              if (Object.keys(gridFilterModel).length) {
                params.api.setFilterModel(gridFilterModel);
              }
            }}
            onFilterChanged={handleFilterChanged}
          />
          <GridHeaderContextMenu
            menu={headerMenu}
            frozen={headerFrozen}
            onClose={closeHeaderMenu}
            onToggleFrozen={toggleHeaderFrozen}
          />
        </div>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700">
          <Pagination
            current={apiPage}
            total={totalRecords}
            pageSize={perPage}
            onChange={(page) => {
              setApiPage(page);
            }}
          />
        </div>
      </div>

      <AddEditEmployeeModal
        modal={modal}
        setModal={setModal}
        form={form}
        setForm={setForm}
        handleSave={handleSave}
        saveLoading={saveLoading}
        viewLoading={viewLoading}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        inputCls={inputCls}
        selectCls={selectCls}
        unitOptions={unitOptions}
        departmentsList={departmentsList}
        setDepartmentsList={setDepartmentsList}
        setIsDeptModalOpen={setIsDeptModalOpen}
      />

      <EmployeeDetailsModal
        isOpen={modal === "view"}
        onClose={() => setModal(null)}
        selected={selected}
        viewLoading={viewLoading}
        openEdit={openEdit}
      />

      <DeleteEmployeeModal
        modal={modal}
        setModal={setModal}
        selected={selected}
        handleDelete={handleDelete}
        deleteLoading={deleteLoading}
      />

      <AddNewDepartment
        isDeptModalOpen={isDeptModalOpen}
        setIsDeptModalOpen={setIsDeptModalOpen}
        newDeptName={newDeptName}
        setNewDeptName={setNewDeptName}
        setDepartmentsList={setDepartmentsList}
        setForm={setForm}
        inputCls={inputCls}
      />

      <EmployeeImportModal
        uploadOpen={uploadOpen}
        resetUpload={resetUpload}
        preview={preview}
        uploading={uploading}
        selectedFile={selectedFile}
        importColumnsLoading={importColumnsLoading}
        employeeImportColumns={employeeImportColumns}
        missingRequiredImportFields={missingRequiredImportFields}
        handleUpload={handleUpload}
        dragOver={dragOver}
        setDragOver={setDragOver}
        handleDrop={handleDrop}
        fileInputRef={fileInputRef}
        handleFileChange={handleFileChange}
        fmtFileSize={fmtFileSize}
        clearFile={clearFile}
        fileHeaders={fileHeaders}
        mappedFieldCount={mappedFieldCount}
        requiredEmployeeImportFields={requiredEmployeeImportFields}
        columnMappings={columnMappings}
        updateColumnMapping={updateColumnMapping}
        selectCls={selectCls}
        formatEmployeeImportFieldLabel={formatEmployeeImportFieldLabel}
      />

      <AccountMasterUploadModal
        uploadOpen={amUploadOpen}
        resetUpload={amResetUpload}
        uploading={amUploading}
        selectedFile={amSelectedFile}
        preview={amPreview}
        uploadCompany={getCompanyConfig(companyId)}
        uploadUnit={activeUnit}
        fileInputRef={amFileInputRef}
        handleFileChange={amHandleFileChange}
        clearFile={amClearFile}
        fmtFileSize={fmtFileSize}
        handleUpload={amHandleUpload}
      />
    </div>
  );
}
