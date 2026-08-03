import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Edit2,
  Trash2,
  Eye,
  Download,
  Crown,
  CheckCircle,
  TableProperties,
  Loader2,
  Search,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import {
  buildSafeAadhaarUpdate,
  getAadhaarDisplayValue,
  hasStoredAadhaar,
} from "../../utils/aadhaar";
import { useSearchParams } from "react-router-dom";
import { getCompanyConfig } from "../../config/companyConfig";
import { useTheme } from "../../context/theme-context";
import { validateEmployeeForm } from "../../utils/validation";
import useGridHeaderContextMenu from "../../hooks/useGridHeaderContextMenu";
import useIsMobile from "../../hooks/useIsMobile";

import { SkeletonTable } from "../../components/ui/Skeleton";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import GridHeaderContextMenu from "../../components/ui/GridHeaderContextMenu";
import toast from "react-hot-toast";
import { downloadExcel } from "../../utils/exportUtils";
import { salaryApi } from "../../utils/api";

import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import AddEditEmployeeModal from "./AdminModals/AddEditEmployeeModal";
import DeleteEmployeeModal from "./AdminModals/DeleteEmployeeModal";
import AddNewDepartment from "./AdminModals/AddNewDepartment";
import EmployeeDetailsModal from "./AdminModals/EmployeeDetailsModal";
import {
  formatDisplayDate,
  isPasswordValid,
} from "./AdminModals/employee-helpers";

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

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? "";
}

// Mirrors mapEmployee()'s reverse: Active -> 0, Pending -> 2, else Inactive -> 1.
// A plain "Active"-vs-else ternary here would silently collapse a Pending
// employee into Inactive on every unrelated edit, since the status dropdown
// previously had no way to represent "Pending" at all.
function statusToCode(status) {
  if (status === "Active") return "0";
  if (status === "Pending") return "2";
  return "1";
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
  const isPending = String(item.status) === "2";
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
    status: isPending ? "Pending" : isActive ? "Active" : "Inactive",
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
    // The complete number. The employee list returns aadhaar_full for every row
    // inside the caller's company and unit scope, so the grid, the details modal,
    // the edit form and the exports all show the same value.
    aadharCardNo: getAadhaarDisplayValue(item),
    aadhaarOnFile: getAadhaarDisplayValue(item),
    // Kept because the API still returns it; no longer rendered anywhere.
    aadhaarMasked: item.aadhaar_masked ?? "",
    hasAadhaar: hasStoredAadhaar(item),
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
  const { activeUnit, companyId, companyScope, scopeKey } =
    useCompany();
  const { dark } = useTheme();
  const isMobile = useIsMobile();

  const gridRef = useRef(null);
  const gridContainerRef = useRef(null);
  const { headerMenu, headerFrozen, closeHeaderMenu, toggleHeaderFrozen } =
    useGridHeaderContextMenu(gridRef, gridContainerRef);

  const [initialLoading, setInitialLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);

  const allColumns = useMemo(() => [
    { field: "empCode", label: "Emp Code" },
    { field: "name", label: "Name" },
    { field: "gender", label: "Gender" },
    { field: "email", label: "Email" },
    { field: "mobileNo", label: "Mobile" },
    { field: "dob", label: "DOB" },
    { field: "address", label: "Address" },
    { field: "department", label: "Department" },
    { field: "designation", label: "Designation" },
    { field: "city", label: "City" },
    { field: "district", label: "District" },
    { field: "state", label: "State" },
    { field: "pin", label: "PIN" },
    { field: "aadharCardNo", label: "Aadhar Card No" },
    { field: "panCardNo", label: "PAN Card No" },
    { field: "bankName", label: "Bank Name" },
    { field: "bankIfscCode", label: "Bank IFSC Code" },
    { field: "bankAccountNo", label: "Bank Account No" },
    { field: "pfNo", label: "PF No" },
    { field: "esiNo", label: "ESI No" },
    { field: "joiningDate", label: "Joining Date" },
    { field: "resignationDate", label: "Resignation Date" },
    { field: "companyLabel", label: "Company" },
    { field: "unit", label: "Unit" },
    { field: "loginRole", label: "Role" },
    { field: "status", label: "Status" },
  ], []);

  const [visibleColumns, setVisibleColumns] = useState([
    "empCode", "name", "department", "designation", "companyLabel", "unit", "loginRole", "status"
  ]);
  const [showColModal, setShowColModal] = useState(false);

  const toggleColumnVisibility = (field) => {
    setVisibleColumns(prev => {
      const newVisible = prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field];
      return newVisible;
    });
  };

  const [employees, setEmployees] = useState([]);
  const [apiPage, setApiPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [perPage, setPerPage] = useState(15);

  const [activeCount, setActiveCount] = useState(0);
  const [inactiveCount, setInactiveCount] = useState(0);

  const [apiFilter, setApiFilter] = useState({});
  const [gridFilterModel, setGridFilterModel] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const mergedFilters = useMemo(() => {
    const filters = { ...apiFilter };
    if (searchQuery.trim()) {
      filters.search = searchQuery.trim();
    }
    if (selectedStatus) {
      filters.status = selectedStatus;
    }
    return filters;
  }, [apiFilter, searchQuery, selectedStatus]);

  const [exportLoading, setExportLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [modal, setModal] = useState(searchParams.get("modal") || null);

  /*
   * `?modal=add` opens the add form once, then the parameter is consumed so a
   * refresh or a back-navigation does not reopen it.
   *
   * Opening is assigned during render — the supported way to react to an input
   * change — while clearing the URL stays in an effect, because that is a write
   * to an external system (the history entry) rather than component state.
   */
  const urlModal = searchParams.get("modal");
  const [urlModalSeen, setUrlModalSeen] = useState(urlModal);
  if (urlModalSeen !== urlModal) {
    setUrlModalSeen(urlModal);
    if (urlModal === "add") setModal("add");
  }

  useEffect(() => {
    if (searchParams.get("modal") !== "add") return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("modal");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [viewLoading, setViewLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [selectedRows, setSelectedRows] = useState([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  const [departmentsList, setDepartmentsList] = useState([]);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");

  // The company a new/edited employee belongs to is now chosen right in the
  // form (see the Company field in AddEditEmployeeModal) rather than only
  // coming from the sidebar's company scope, so unit options must follow
  // whatever is currently selected in the form, not just the outer scope.
  const formCompanyId = form.companyId || companyId;
  const unitOptions = useMemo(
    () => getCompanyConfig(formCompanyId)?.units || [],
    [formCompanyId],
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
          mergedFilters,
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
    mergedFilters,
    refreshKey,
    companyScope,
    currentUser?.accessToken,
    currentUser?.tokenType,
    scopeKey,
  ]);

  const isFirstScopeRender = useRef(true);
  useEffect(() => {
    if (isFirstScopeRender.current) {
      isFirstScopeRender.current = false;
      return;
    }
    setApiPage(1);
    setModal(null);
  }, [scopeKey]);

  const refetchEmployees = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const openEdit = useCallback(
    (emp) => {
      // The input is prefilled with the complete stored number, so an editor can
      // check it against a document without retyping it. It is safe to post back
      // because it is the real value, not a mask — and buildSafeAadhaarUpdate
      // still refuses anything that is not exactly 12 digits, so a half-deleted
      // field cannot overwrite what is stored.
      setForm({ ...emp, password: "" });
      setSelected(emp);
      setShowPassword(false);
      setModal("edit");
      setViewLoading(true);

      // The fetch runs in its own async scope rather than making the callback
      // itself async: memoization cannot be preserved across an async
      // useCallback, and the caller does not await this anyway.
      salaryApi
        .getEmployee(emp.id, currentUser?.accessToken, currentUser?.tokenType, companyScope)
        .then((res) => {
          const full = mapEmployee(res?.data ?? res);

          setSelected(full);
          setForm((prev) => ({
            ...prev,
            ...full,
            // Keep whatever the editor has already typed rather than replacing
            // it when the fuller record arrives.
            aadharCardNo: prev.aadharCardNo || full.aadharCardNo,
            password: "",
          }));
        })
        .catch(() => {
          // partial row data already available
        })
        .finally(() => setViewLoading(false));
    },
    [companyScope, currentUser?.accessToken, currentUser?.tokenType],
  );

  const openView = useCallback(
    (emp) => {
      setSelected(emp);
      setModal("view");
      setViewLoading(true);

      // As with openEdit: memoization cannot be preserved across an async
      // useCallback, and nothing awaits this.
      salaryApi
        .getEmployee(emp.id, currentUser?.accessToken, currentUser?.tokenType, companyScope)
        .then((res) => setSelected(mapEmployee(res?.data ?? res)))
        .catch((err) => toast.error(err.message || "Failed to load employee"))
        .finally(() => setViewLoading(false));
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

    const validationErrors = validateEmployeeForm(form);
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    const mobileNo = (form.mobileNo || "").trim();
    const address = (form.address || "").trim();

    if (mobileNo && !/^\d{10}$/.test(mobileNo)) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }

    // Decided once for both branches: a blank input on edit omits the field so
    // the stored number survives, and a partial or masked entry is refused
    // rather than written.
    const aadhaar = buildSafeAadhaarUpdate({
      enteredValue: form.aadharCardNo,
      hasStored: Boolean(form.hasAadhaar),
      isCreateMode: modal === "add",
    });

    if (aadhaar.error) {
      toast.error(aadhaar.error);
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
          status: statusToCode(form.status),
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
          ...(aadhaar.include && { aadhar_card_no: aadhaar.value }),
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
        status: statusToCode(form.status),
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
        ...(aadhaar.include && { aadhar_card_no: aadhaar.value }),
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

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) return;
    setBulkDeleteLoading(true);
    try {
      const ids = selectedRows.map((r) => r.id);
      await salaryApi.deleteEmployees(ids, currentUser?.accessToken, currentUser?.tokenType);
      toast.success(`${ids.length} employees deleted successfully`);
      setSelectedRows([]);
      setShowBulkDeleteConfirm(false);
      refetchEmployees();
    } catch (err) {
      toast.error(err.message || "Failed to delete employees");
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  const onSelectionChanged = useCallback(() => {
    if (gridRef.current?.api) {
      setSelectedRows(gridRef.current.api.getSelectedRows());
    }
  }, []);

  // A new set of rows invalidates the old selection. Assigned during render —
  // the supported way to reset state when an input changes — rather than from
  // an effect, which briefly reported the previous page's selection count
  // against the new page.
  const [rowsSeen, setRowsSeen] = useState(employees);
  if (rowsSeen !== employees) {
    setRowsSeen(employees);
    setSelectedRows([]);
  }

  const handleExport = async () => {
    setExportLoading(true);

    try {
      const res = await salaryApi.getAllEmployees(
        currentUser?.accessToken,
        currentUser?.tokenType,
        // Without an explicit limit the backend paginates at 15
        // (UserController::index), so the export silently dropped every
        // employee past the first page.
        { ...apiFilter, limit: 1000 },
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
          headerName: "",
          checkboxSelection: true,
          headerCheckboxSelection: true,
          width: 45,
          minWidth: 45,
          maxWidth: 45,
          pinned: "left",
          lockPosition: true,
          suppressMenu: true,
          filter: false,
          sortable: false,
          resizable: false,
          suppressMovable: true,
        },
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
        headerName: "",
        checkboxSelection: true,
        headerCheckboxSelection: true,
        width: 45,
        minWidth: 45,
        maxWidth: 45,
        pinned: "left",
        lockPosition: true,
        suppressMenu: true,
        filter: false,
        sortable: false,
        resizable: false,
        suppressMovable: true,
      },
      {
        headerName: "Emp Code",
        field: "empCode",
        flex: 1,
        minWidth: 120,
        hide: isMobile || !visibleColumns.includes("empCode"),
        filter: "agTextColumnFilter",
        cellClass:
          "employee-ag-cell font-mono text-gray-600 dark:text-gray-300",
      },
      {
        headerName: "Name",
        field: "name", hide: isMobile || !visibleColumns.includes("name"),
        flex: 1,
        minWidth: 200,
        cellStyle: { overflow: "hidden" },
        valueGetter: ({ data }) => data?.name || data?.displayName || "-",
        filter: "agTextColumnFilter",
        cellRenderer: ({ data: emp }) => {
          if (!emp) return null;

          return (
            <div className="flex h-full w-full items-center overflow-hidden">
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
        flex: 1,
        minWidth: 120,
        hide: isMobile || !visibleColumns.includes("gender"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Email",
        field: "email",
        flex: 1,
        minWidth: 200,
        hide: isMobile || !visibleColumns.includes("email"),
        cellStyle: { overflow: "hidden" },
        valueGetter: ({ data }) => data?.email || "-",
        filter: "agTextColumnFilter",
        cellRenderer: ({ data: emp }) => {
          if (!emp) return null;

          return (
            <div className="flex h-full w-full items-center overflow-hidden">
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
        flex: 1,
        minWidth: 140,
        hide: isMobile || !visibleColumns.includes("mobileNo"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ data: emp }) => {
          if (!emp) return null;

          return (
            <div className="flex h-full w-full items-center overflow-hidden">
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
        flex: 1,
        minWidth: 130,
        hide: isMobile || !visibleColumns.includes("dob"),
        filter: "agTextColumnFilter",
        valueFormatter: ({ value }) => formatDisplayDate(value) || "-",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {formatDisplayDate(value) || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Address",
        field: "address",
        flex: 1,
        minWidth: 220,
        hide: isMobile || !visibleColumns.includes("address"),
        filter: "agTextColumnFilter",
        cellStyle: { overflow: "hidden" },
        cellRenderer: ({ value }) => (
          <div
            className="flex h-full w-full items-center overflow-hidden"
            title={value || ""}
          >
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Department",
        field: "department",
        flex: 1,
        minWidth: 150,
        hide: isMobile || !visibleColumns.includes("department"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Designation",
        field: "designation",
        flex: 1,
        minWidth: 150,
        hide: isMobile || !visibleColumns.includes("designation"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "City",
        field: "city",
        flex: 1,
        minWidth: 130,
        hide: isMobile || !visibleColumns.includes("city"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "District",
        field: "district",
        flex: 1,
        minWidth: 130,
        hide: isMobile || !visibleColumns.includes("district"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "State",
        field: "state",
        flex: 1,
        minWidth: 130,
        hide: isMobile || !visibleColumns.includes("state"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "PIN",
        field: "pin",
        flex: 1,
        minWidth: 110,
        hide: isMobile || !visibleColumns.includes("pin"),
        filter: "agTextColumnFilter",
        cellClass:
          "employee-ag-cell font-mono text-gray-600 dark:text-gray-300",
      },
      {
        headerName: "Aadhar Card No",
        field: "aadharCardNo",
        flex: 1,
        minWidth: 170,
        hide: isMobile || !visibleColumns.includes("aadharCardNo"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "PAN Card No",
        field: "panCardNo",
        flex: 1,
        minWidth: 150,
        hide: isMobile || !visibleColumns.includes("panCardNo"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Bank Name",
        field: "bankName",
        flex: 1,
        minWidth: 150,
        hide: isMobile || !visibleColumns.includes("bankName"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Bank IFSC Code",
        field: "bankIfscCode",
        flex: 1,
        minWidth: 150,
        hide: isMobile || !visibleColumns.includes("bankIfscCode"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Bank Account No",
        field: "bankAccountNo",
        flex: 1,
        minWidth: 170,
        hide: isMobile || !visibleColumns.includes("bankAccountNo"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "PF No",
        field: "pfNo",
        flex: 1,
        minWidth: 140,
        hide: isMobile || !visibleColumns.includes("pfNo"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "ESI No",
        field: "esiNo",
        flex: 1,
        minWidth: 140,
        hide: isMobile || !visibleColumns.includes("esiNo"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 truncate">
              {value || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Joining Date",
        field: "joiningDate",
        flex: 1,
        minWidth: 140,
        hide: isMobile || !visibleColumns.includes("joiningDate"),
        filter: "agTextColumnFilter",
        valueFormatter: ({ value }) => formatDisplayDate(value) || "-",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {formatDisplayDate(value) || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Resignation Date",
        field: "resignationDate",
        flex: 1,
        minWidth: 160,
        hide: isMobile || !visibleColumns.includes("resignationDate"),
        filter: "agTextColumnFilter",
        valueFormatter: ({ value }) => formatDisplayDate(value) || "-",
        cellRenderer: ({ value }) => (
          <div className="flex h-full w-full items-center overflow-hidden">
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {formatDisplayDate(value) || "-"}
            </span>
          </div>
        ),
      },
      {
        headerName: "Company",
        field: "companyLabel",
        flex: 1,
        minWidth: 150,
        hide: isMobile || !visibleColumns.includes("companyLabel"),
        filter: false,
        cellRenderer: ({ data: emp }) =>
          emp ? (
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {emp.companyLabel || "-"}
            </span>
          ) : null,
      },
      {
        headerName: "Unit",
        field: "unit",
        flex: 1,
        minWidth: 140,
        hide: isMobile || !visibleColumns.includes("unit"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ value }) => (
          <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
            {value || "-"}
          </span>
        ),
      },
      {
        headerName: "Role",
        field: "loginRole",
        flex: 1,
        minWidth: 130,
        hide: isMobile || !visibleColumns.includes("loginRole"),
        filter: "agTextColumnFilter",
        filterValueGetter: ({ data }) =>
          data?.loginRole === "superadmin" ? "Super Admin" : "Employee",
        valueFormatter: ({ value }) =>
          value === "superadmin" ? "Super Admin" : "Employee",
        cellRenderer: ({ data: emp }) => {
          if (!emp) return null;

          return (
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {emp.loginRole === "superadmin" ? "Super Admin" : "Employee"}
            </span>
          );
        },
      },
      {
        headerName: "Status",
        field: "status",
        flex: 1,
        minWidth: 140,
        hide: isMobile || !visibleColumns.includes("status"),
        filter: "agTextColumnFilter",
        cellRenderer: ({ data: emp }) =>
          emp ? (
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {emp.status}
            </span>
          ) : null,
      },
      {
        headerName: "Actions",
        width: 160,
        pinned: "right",
        sortable: false,
        filter: false,
        suppressHeaderFilterButton: true,
        cellRenderer: ({ data: emp }) => {
          if (!emp) return null;
          return (
            <div className="flex h-full w-full items-center gap-1.5 overflow-hidden justify-end">

              <button
                onClick={() => openView(emp)}
                className="flex items-center justify-center rounded-lg bg-brand-50 p-2 text-brand-600 transition hover:bg-brand-100 dark:bg-brand-900/20 dark:hover:bg-brand-900/40"
                title="View"
              >
                <Eye size={14} />
              </button>

              <button
                onClick={() => openEdit(emp)}
                className="flex items-center justify-center rounded-lg bg-yellow-50 p-2 text-yellow-600 transition hover:bg-yellow-100 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/40"
                title="Edit"
              >
                <Edit2 size={14} />
              </button>

              <button
                onClick={() => openDelete(emp)}
                className="flex items-center justify-center rounded-lg bg-red-50 p-2 text-red-600 transition hover:bg-red-100 dark:bg-red-900/20"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        },
      },
    ];
  }, [openDelete, openEdit, openView, isMobile, visibleColumns]);

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
    <div className="flex h-full flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between w-full">
        {/* Left Side: Search & Filter */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Search Bar */}
          <div className="relative w-full sm:w-60">
            <input
              type="text"
              placeholder="Search employee..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setApiPage(1);
              }}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 pl-9 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-[#0b0f1a] dark:text-white"
            />
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
          </div>

          {/* Status Tabs */}
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            {["All", "Active", "Inactive"].map((tab) => {
              const val = tab === "All" ? "" : tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setSelectedStatus(val);
                    setApiPage(1);
                  }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    selectedStatus === val
                      ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Employee Counts */}
          <div className="flex flex-wrap gap-3 text-sm text-gray-500 dark:text-gray-400">
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
        </div>

        {/* Right Side: Actions */}
        <div className="ml-auto flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
          {selectedRows.length > 0 && (
            <Button
              variant="danger"
              onClick={() => setShowBulkDeleteConfirm(true)}
              icon={<Trash2 size={16} />}
              disabled={tableLoading}
            >
              Delete Selected ({selectedRows.length})
            </Button>
          )}

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
            onClick={() => setShowColModal(true)}
            icon={<TableProperties size={16} />}
          >
            Columns
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

      <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        <div
          ref={gridContainerRef}
          className={`employee-ag-grid w-full flex-1 min-h-0 ${
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
            domLayout="normal"
            rowHeight={isMobile ? 84 : 44}
            headerHeight={48}
            popupParent={document.body}
            suppressCellFocus
            enableCellTextSelection
            animateRows
            rowSelection="multiple"
            suppressRowClickSelection={true}
            onSelectionChanged={onSelectionChanged}
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

        <div className="shrink-0 px-5 py-3 border-t border-gray-100 dark:border-gray-700">
          <Pagination
            current={apiPage}
            total={totalRecords}
            pageSize={perPage}
            onChange={(page) => {
              setApiPage(page);
            }}
            onPageSizeChange={(size) => {
              setPerPage(size);
              setApiPage(1);
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


      <Modal
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        title="Delete Selected Employees"
        size="sm"
      >
        <div className="text-center py-2">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <Trash2 size={22} className="text-red-600" />
          </div>
          <p className="text-gray-700 dark:text-gray-300 text-sm">
            Are you sure you want to delete{" "}
            <strong>{selectedRows.length} selected employee(s)</strong>? This action is permanent and cannot be undone.
          </p>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button
            variant="secondary"
            onClick={() => setShowBulkDeleteConfirm(false)}
            disabled={bulkDeleteLoading}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleBulkDelete}
            disabled={bulkDeleteLoading}
          >
            {bulkDeleteLoading ? "Deleting..." : "Delete All"}
          </Button>
        </div>
      </Modal>

      <AddNewDepartment
        isDeptModalOpen={isDeptModalOpen}
        setIsDeptModalOpen={setIsDeptModalOpen}
        newDeptName={newDeptName}
        setNewDeptName={setNewDeptName}
        setDepartmentsList={setDepartmentsList}
        setForm={setForm}
        inputCls={inputCls}
      />


      <Modal
        isOpen={showColModal}
        onClose={() => setShowColModal(false)}
        title="Select Visible Columns"
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {allColumns.map((col) => (
            <button
              key={col.field}
              onClick={() => toggleColumnVisibility(col.field)}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                visibleColumns.includes(col.field)
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-transparent"
              }`}
            >
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  visibleColumns.includes(col.field)
                    ? "border-brand-600 bg-brand-600 text-white dark:border-brand-500 dark:bg-brand-500"
                    : "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800"
                }`}
              >
                {visibleColumns.includes(col.field) && <CheckCircle size={14} />}
              </div>
              <span className={`text-sm font-medium ${
                  visibleColumns.includes(col.field)
                    ? "text-brand-700 dark:text-brand-300"
                    : "text-gray-700 dark:text-gray-300"
              }`}>
                {col.label}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Button variant="primary" onClick={() => setShowColModal(false)}>
            Apply & Close
          </Button>
        </div>
      </Modal>
    </div>
  );
}
