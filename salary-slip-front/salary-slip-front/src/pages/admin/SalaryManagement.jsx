import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Download,
  DollarSign,
  Loader2,
  Trash2,
  Upload,
  CloudUpload,
  Table2,
  ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import { StatCard } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Dropdown from "../../components/ui/Dropdown";
import Badge from "../../components/ui/Badge";
import Pagination from "../../components/ui/Pagination";
import Modal from "../../components/ui/Modal";
import GridHeaderContextMenu from "../../components/ui/GridHeaderContextMenu";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { downloadCSV } from "../../utils/exportUtils";
import { formatCurrency } from "../../utils/payslipUtils";
import { exportNodeToPdf } from "../../utils/pdfUtils";
import { getCompanyConfig } from "../../config/companyConfig";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { useTheme } from "../../context/ThemeContext";
import useGridHeaderContextMenu from "../../hooks/useGridHeaderContextMenu";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import PayslipPreviewModal from "./AdminModals/PayslipPreviewModal";
import UploadSalarySlipModal from "./AdminModals/UploadSalarySlipModal";
import DeleteSalarySlipModal from "./AdminModals/DeleteSalarySlipModal";

ModuleRegistry.registerModules([AllCommunityModule]);

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function firstPresent(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  );
}

const FILTER_KEY_MAP = {
  empCode: "emp_code",
  name: "emp_name",
  resignationDate: "resignation_date",
  workingDays: "working_days",
  presentDays: "present_days",
  leave: "leave",
  salary: "salary",
  basic: "basic",
  hra: "hra",
  da: "da",
  conAl: "con_al",
  comm: "comm",
  other: "other",
  grossSalary: "gross_salary",
  pf: "pf",
  esi: "esi",
  pt: "pt",
  tds: "tds",
  advance: "advance",
  totalDeduct: "total_deduct",
  netSalary: "net_payable",
};

function mapRecord(item) {
  const monthName = MONTHS[parseInt(item.month, 10) - 1] ?? "";

  return {
    id: item.id,
    empCode: String(item.emp_code ?? ""),
    companyCode: item.company_code ?? "",
    name: item.emp_name ?? "",
    month: `${monthName} ${item.year}`,
    resignationDate: item.resignation_date ?? "",
    workingDays: Number(item.working_days ?? item.paid_day ?? 0),
    presentDays: Number(item.present_days ?? 0),
    leave: Number(item.leave ?? 0),
    salary: Number(item.salary ?? item.book_salary ?? 0),
    basic: Number(item.basic_salary ?? item.basic ?? 0),
    hra: Number(item.hra ?? 0),
    da: Number(item.da ?? 0),
    conAl: Number(item.con_al ?? item.conv_a ?? 0),
    comm: Number(item.comm ?? 0),
    other: Number(item.other ?? 0),
    grossSalary: Number(item.gross_salary ?? 0),
    pf: Number(item.pf ?? 0),
    esi: Number(item.esi ?? 0),
    pt: Number(item.pt ?? 0),
    tds: Number(item.tds ?? 0),
    advance: Number(item.advance ?? 0),
    totalDeduct: Number(item.total_deduction ?? item.total_deduct ?? 0),
    netSalary: Number(item.net_salary ?? item.net_payable ?? 0),
    status: item.status ?? "Paid",

    // kept for payslip modal back-compat
    basicSalary: Number(item.basic_salary ?? item.basic ?? 0),
    conveyance: Number(item.con_al ?? item.conv_a ?? 0),
    deductions: Number(item.total_deduction ?? item.total_deduct ?? 0),
    netPayable: Number(item.net_salary ?? item.net_payable ?? 0),
    payDate: item.pay_date ?? "",
    unit: item.unit ?? "",
    department: item.department ?? "",
    designation: item.designation ?? "",
  };
}

export default function SalaryManagement() {
  const { user } = useAuth();
  const {
    activeUnit,
    companyId,
    companyScope,
    isAllCompanies,
    scopeKey,
    scopeLabel,
  } = useCompany();
  const { dark } = useTheme();

  const gridRef = useRef(null);
  const gridContainerRef = useRef(null);
  const payslipRef = useRef(null);
  const uploadFileInputRef = useRef(null);
  const { headerMenu, headerFrozen, closeHeaderMenu, toggleHeaderFrozen } =
    useGridHeaderContextMenu(gridRef, gridContainerRef);

  const [initialLoading, setInitialLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);

  const [records, setRecords] = useState([]);
  const [apiPage, setApiPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [perPage, setPerPage] = useState(15);

  const [totalNetPayable, setTotalNetPayable] = useState(0);
  const [totalDepartments, setTotalDepartments] = useState(0);

  const [apiFilter, setApiFilter] = useState({});
  const [gridFilterModel, setGridFilterModel] = useState({});

  const [exportLoading, setExportLoading] = useState(false);
  const [viewModal, setViewModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [deleteRecord, setDeleteRecord] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadSelectedFile, setUploadSelectedFile] = useState(null);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetchSalarySlips = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const uploadUnitOptions = useMemo(
    () => getCompanyConfig(companyId)?.units || [],
    [companyId],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setTableLoading(true);

      try {
        const res = await salaryApi.getSlips(
          user?.accessToken,
          user?.tokenType,
          apiPage,
          perPage,
          apiFilter,
          companyScope,
        );

        if (cancelled) return;

        const pagination = res?.data?.salarySlipData;

        setRecords((pagination?.data ?? []).map(mapRecord));
        setTotalRecords(pagination?.total ?? 0);
        setPerPage(pagination?.per_page ?? 15);
        setTotalNetPayable(Number(res?.data?.net_payable ?? 0));

        const dept = res?.data?.department;
        setTotalDepartments(Array.isArray(dept) ? dept.length : 0);
      } catch (err) {
        if (!cancelled) {
          toast.error(err.message || "Failed to load salary records");
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
    user?.accessToken,
    user?.tokenType,
    scopeKey,
  ]);

  useEffect(() => {
    setApiPage(1);
    setViewModal(null);
    setDetail(null);
  }, [scopeKey]);

  useEffect(() => {
    if (!viewModal) return;

    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);

      try {
        const res = await salaryApi.getSlipDetail(
          viewModal.id,
          user?.accessToken,
          user?.tokenType,
          companyScope,
        );

        if (cancelled) return;

        const item = res?.data ?? res;
        const empUser = item.user ?? {};
        const monthName = MONTHS[parseInt(item.month, 10) - 1] ?? "";

        setDetail({
          id: item.id,
          company_code: item.company_code,
          unit: firstPresent(item.unit, empUser.unit),
          department: firstPresent(item.department, empUser.department),
          designation: firstPresent(item.designation, empUser.designation),
          month: `${monthName} ${item.year}`,
          empCode: String(item.emp_code ?? ""),
          name: item.emp_name,
          mobile_no: firstPresent(item.mobile_no, empUser.mobile_number),
          resignation_date: firstPresent(
            item.resignation_date,
            empUser.resignation_date,
          ),
          account_no: firstPresent(item.account_no, empUser.bank_account_no),
          account_name: firstPresent(item.account_name, empUser.bank_name),
          bank_ifsc: firstPresent(item.bank_ifsc, empUser.bank_ifsc_code),
          esi_no: firstPresent(item.esi_no, empUser.esi_no),
          pf_uan: firstPresent(item.pf_uan, empUser.pf_no),
          working_days: Number(item.working_days ?? item.paid_day ?? 0),
          present_days: Number(item.present_days ?? 0),
          leave: Number(item.leave ?? 0),
          salary: Number(item.salary ?? item.book_salary ?? 0),
          basicSalary: Number(item.basic_salary ?? item.basic ?? 0),
          hra: Number(item.hra ?? 0),
          da: Number(item.da ?? 0),
          con_al: Number(item.con_al ?? item.conv_a ?? 0),
          comm: Number(item.comm ?? 0),
          other: Number(item.other ?? 0),
          grossSalary: Number(item.gross_salary ?? 0),
          pf: Number(item.pf ?? 0),
          esi: Number(item.esi ?? 0),
          pt: Number(item.pt ?? 0),
          tds: Number(item.tds ?? 0),
          advance: Number(item.advance ?? 0),
          totalDeductions: Number(
            item.total_deduction ?? item.total_deduct ?? 0,
          ),
          amount: Number(item.net_salary ?? item.net_payable ?? 0),
        });
      } catch (err) {
        if (!cancelled) {
          toast.error(err.message || "Failed to load payslip");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    loadDetail();

    return () => {
      cancelled = true;
    };
  }, [companyScope, scopeKey, viewModal, user?.accessToken, user?.tokenType]);

  const markPaid = useCallback((id) => {
    setRecords((current) =>
      current.map((record) =>
        record.id === id ? { ...record, status: "Paid" } : record,
      ),
    );

    toast.success("Marked as paid");
  }, []);

  const handleDeleteSlip = useCallback(async () => {
    if (!deleteRecord?.id) return;

    setDeleteLoading(true);

    try {
      const res = await salaryApi.deleteSlip(
        deleteRecord.id,
        user?.accessToken,
        user?.tokenType,
        {
          companyId: deleteRecord.companyCode || companyId,
          unit: deleteRecord.unit || null,
        },
      );

      toast.success(res?.message || "Salary slip deleted");
      setDeleteRecord(null);
      refetchSalarySlips();
    } catch (err) {
      toast.error(err.message || "Failed to delete salary slip");
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteRecord, user, companyId, refetchSalarySlips]);

  const closeViewModal = useCallback(() => {
    setViewModal(null);
    setDetail(null);
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

    setApiPage(1);
  }, []);

  const handleDownloadPDF = useCallback(async () => {
    if (!detail || !payslipRef.current) return;

    setPdfLoading(true);

    try {
      const el =
        payslipRef.current.querySelector("article") ?? payslipRef.current;

      const safeCode = String(detail?.empCode || "EMP").replace(/\s+/g, "-");
      const safeMon = String(detail?.month || "payslip").replace(/\s+/g, "-");
      await exportNodeToPdf(el, `payslip-${safeCode}-${safeMon}.pdf`);
    } catch (err) {
      toast.error("Failed to generate PDF");
      console.error(err);
    } finally {
      setPdfLoading(false);
    }
  }, [detail]);

  const handleExportCSV = useCallback(async () => {
    setExportLoading(true);

    try {
      const res = await salaryApi.getAllSlips(
        user?.accessToken,
        user?.tokenType,
        apiFilter,
        companyScope,
      );

      const all = (
        res?.data?.salarySlipData?.data ??
        res?.data?.salarySlipData ??
        []
      ).map(mapRecord);

      if (all.length === 0) {
        toast.error("No records to export");
        return;
      }

      const data = all.map((record) => ({
        Month: record.month,
        "Employee Code": record.empCode,
        "Employee Name": record.name,
        "Resignation Date": record.resignationDate || "-",
        "Working Days": record.workingDays,
        "Present Days": record.presentDays,
        Leave: record.leave,
        Salary: record.salary,
        "Basic Salary": record.basic,
        HRA: record.hra,
        DA: record.da,
        "CON.AL": record.conAl,
        COMM: record.comm,
        OTHER: record.other,
        "Gross Salary": record.grossSalary,
        PF: record.pf,
        ESI: record.esi,
        PT: record.pt,
        TDS: record.tds,
        Advance: record.advance,
        "Total Deduction": record.totalDeduct,
        "Net Salary": record.netSalary,
      }));

      downloadCSV(data, "salary-records");
      toast.success(`Exported ${data.length} records to CSV`);
    } catch (err) {
      toast.error(err.message || "Export failed");
    } finally {
      setExportLoading(false);
    }
  }, [companyScope, scopeKey, user?.accessToken, user?.tokenType, apiFilter]);

  function uploadParseExcelPreview(file) {
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

  async function uploadValidateAndSet(file) {
    if (!file) return;
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (!allowed.includes(file.type) && !/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("Only Excel files (.xlsx, .xls) are allowed.");
      return;
    }
    setUploadSelectedFile(file);
    try {
      const data = await uploadParseExcelPreview(file);
      setUploadPreview(data);
    } catch (err) {
      toast.error(err.message);
      setUploadSelectedFile(null);
      setUploadPreview(null);
    }
  }

  function handleUploadFileChange(e) {
    const file = e.target.files?.[0];
    if (file) uploadValidateAndSet(file);
  }

  function handleUploadDrop(e) {
    e.preventDefault();
    setUploadDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadValidateAndSet(file);
  }

  function resetUpload() {
    setUploadSelectedFile(null);
    setUploadPreview(null);
    setUploadOpen(false);
    if (uploadFileInputRef.current) uploadFileInputRef.current.value = "";
  }

  function clearUploadFile(e) {
    e?.stopPropagation();
    setUploadSelectedFile(null);
    setUploadPreview(null);
    if (uploadFileInputRef.current) uploadFileInputRef.current.value = "";
  }

  function openUploadModal() {
    if (isAllCompanies) {
      toast.error("Select one company before uploading a salary slip.");
      return;
    }
    if (uploadUnitOptions.length > 0 && !activeUnit) {
      toast.error("Select a branch from the sidebar before uploading a salary slip.");
      return;
    }
    setUploadOpen(true);
  }

  async function handleSalarySlipUpload() {
    if (!uploadSelectedFile) return;

    setUploading(true);
    try {
      await salaryApi.uploadSalarySlip(
        uploadSelectedFile,
        user?.accessToken,
        user?.tokenType,
        companyId,
        activeUnit,
      );
      toast.success("Salary slip uploaded successfully!");
      resetUpload();
    } catch (err) {
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function downloadSalarySlipTemplate() {
    if (isAllCompanies) {
      toast.error("Select one company before downloading a template.");
      return;
    }

    const template = getCompanyConfig(companyId)?.salaryUploadTemplate;
    const headers = template?.headers ?? [];
    const codeCol = headers.indexOf("Employee Code");
    const nameCol = headers.indexOf("Employee Name");

    let rows = [];
    if (codeCol !== -1 || nameCol !== -1) {
      setTemplateLoading(true);
      try {
        const res = await salaryApi.getAllEmployees(
          user?.accessToken,
          user?.tokenType,
          {},
          { companyId, unit: companyScope?.unit },
        );
        const employees = res?.data?.users?.data ?? res?.data?.users ?? [];
        rows = employees.map((emp) => {
          const row = Array(headers.length).fill("");
          if (codeCol !== -1) row[codeCol] = emp.emp_code ?? "";
          if (nameCol !== -1) row[nameCol] = emp.name ?? "";
          return row;
        });
      } catch (err) {
        toast.error(err.message || "Failed to load employees for template");
      } finally {
        setTemplateLoading(false);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, template?.sheetName || "Salary Slip");
    XLSX.writeFile(wb, template?.fileName || "salary_slip_template.xlsx");
  }

  function fmtUploadFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      filter: "agTextColumnFilter",
      resizable: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      suppressHeaderFilterButton: false,
      cellClass: "salary-ag-cell",
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

  const currencyColumn = useCallback(
    (field, headerName, extra = {}) => ({
      headerName,
      field,
      filter: "agNumberColumnFilter",
      valueFormatter: ({ value }) => formatCurrency(Number(value ?? 0)),
      cellClass:
        extra.cellClass ?? "salary-ag-cell text-gray-700 dark:text-gray-300",
      ...extra,
    }),
    [],
  );

  const columnDefs = useMemo(
    () => [
      {
        headerName: "Month",
        field: "month",
        cellRenderer: ({ value }) => <Badge variant="gray">{value}</Badge>,
        filter: "agTextColumnFilter",
      },
      {
        headerName: "Employee Code",
        field: "empCode",
        valueFormatter: ({ value }) => `${value ?? ""}`,
        cellClass: "salary-ag-cell font-mono text-gray-500 dark:text-gray-400",
        filter: "agTextColumnFilter",
      },
      {
        headerName: "Employee Name",
        field: "name",
        minWidth: 160,
        flex: 1.2,
        cellClass: "salary-ag-cell font-medium text-gray-900 dark:text-white",
        cellStyle: {
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        },
        filter: "agTextColumnFilter",
      },
      {
        headerName: "Resignation Date",
        field: "resignationDate",
        filter: "agTextColumnFilter",
        valueFormatter: ({ value }) => value || "-",
        cellClass: "salary-ag-cell text-gray-600 dark:text-gray-300",
      },
      {
        headerName: "Working Days",
        field: "workingDays",
        filter: "agNumberColumnFilter",
        cellRenderer: ({ value }) => (
          <Badge
            variant={value >= 26 ? "green" : value >= 20 ? "yellow" : "red"}
          >
            {value}
          </Badge>
        ),
      },
      {
        headerName: "Present Days",
        field: "presentDays",
        filter: "agNumberColumnFilter",
        cellRenderer: ({ value }) => (
          <Badge
            variant={value >= 26 ? "green" : value >= 20 ? "yellow" : "red"}
          >
            {value}
          </Badge>
        ),
      },
      {
        headerName: "Leave",
        field: "leave",
        filter: "agNumberColumnFilter",
        cellRenderer: ({ value }) => (
          <Badge
            variant={value === 0 ? "green" : value <= 3 ? "yellow" : "red"}
          >
            {value}
          </Badge>
        ),
      },
      currencyColumn("salary", "Salary"),
      currencyColumn("basic", "Basic Salary"),
      currencyColumn("hra", "HRA"),
      currencyColumn("da", "DA"),
      currencyColumn("conAl", "CON.AL"),
      currencyColumn("comm", "COMM"),
      currencyColumn("other", "OTHER"),
      {
        headerName: "Gross Salary",
        field: "grossSalary",
        filter: "agNumberColumnFilter",
        valueFormatter: ({ value }) => formatCurrency(Number(value ?? 0)),
        cellRenderer: ({ value }) => (
          <Badge variant="blue">{formatCurrency(Number(value ?? 0))}</Badge>
        ),
      },
      currencyColumn("pf", "PF", {
        cellClass: "salary-ag-cell text-red-500",
      }),
      currencyColumn("esi", "ESI", {
        cellClass: "salary-ag-cell text-red-500",
      }),
      currencyColumn("pt", "PT", {
        cellClass: "salary-ag-cell text-red-500",
      }),
      currencyColumn("tds", "TDS", {
        cellClass: "salary-ag-cell text-red-500",
      }),
      currencyColumn("advance", "Advance", {
        cellClass: "salary-ag-cell text-red-500",
      }),
      {
        headerName: "Total Deduction",
        field: "totalDeduct",
        filter: "agNumberColumnFilter",
        valueFormatter: ({ value }) => formatCurrency(Number(value ?? 0)),
        cellRenderer: ({ value }) => (
          <Badge variant="red">{formatCurrency(Number(value ?? 0))}</Badge>
        ),
      },
      {
        headerName: "Net Salary",
        field: "netSalary",
        filter: "agNumberColumnFilter",
        valueFormatter: ({ value }) => formatCurrency(Number(value ?? 0)),
        cellRenderer: ({ value }) => (
          <Badge variant="green">{formatCurrency(Number(value ?? 0))}</Badge>
        ),
      },
      {
        headerName: "Actions",
        field: "actions",
        pinned: "right",
        sortable: false,
        filter: false,
        suppressHeaderFilterButton: true,
        cellRenderer: ({ data: record }) => {
          if (!record) return null;

          return (
            <div className="flex h-full items-center gap-1.5">
              <button
                onClick={() => setViewModal(record)}
                className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-600 transition hover:bg-brand-100 dark:bg-brand-900/20 dark:hover:bg-brand-900/40"
              >
                <Download size={12} />
                View
              </button>

              {record.status === "Pending" && (
                <button
                  onClick={() => markPaid(record.id)}
                  className="whitespace-nowrap rounded-lg bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-600 transition hover:bg-green-100 dark:bg-green-900/20"
                >
                  Mark Paid
                </button>
              )}

              <button
                onClick={() => setDeleteRecord(record)}
                className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 dark:bg-red-900/20"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        },
      },
    ],
    [currencyColumn, markPaid],
  );

  if (initialLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[...Array(2)].map((_, index) => (
            <div
              key={index}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="skeleton h-3.5 w-28 rounded" />
                  <div className="skeleton h-7 w-40 rounded" />
                  <div className="skeleton h-3 w-48 max-w-full rounded" />
                </div>
                <div className="skeleton h-11 w-11 rounded-xl" />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <div className="skeleton h-10 w-32 rounded-xl" />
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-100 p-5 dark:border-gray-700">
            <div className="grid grid-cols-5 gap-4">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="skeleton h-4 rounded" />
              ))}
            </div>
          </div>
          <div className="p-5">
            <SkeletonTable rows={8} />
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-gray-700">
            <div className="skeleton h-4 w-32 rounded" />
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          title="Total Payroll"
          value={formatCurrency(totalNetPayable)}
          icon={<DollarSign size={22} />}
          color="blue"
          subtitle={`${scopeLabel} · ${totalRecords} total records`}
        />

        <StatCard
          title="Total Departments"
          value={totalDepartments}
          icon={<Building2 size={22} />}
          color="green"
          subtitle={`Across ${totalRecords} records`}
        />
      </div>

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Dropdown
            items={[
              {
                label: templateLoading
                  ? "Preparing..."
                  : "Download CSV Template",
                icon: templateLoading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Table2 size={15} />
                ),
                iconBg: "bg-brand-50 dark:bg-brand-900/20",
                iconColor: "text-brand-600 dark:text-brand-400",
                onClick: downloadSalarySlipTemplate,
              },
              {
                label: "Upload Salary Slip",
                icon: <CloudUpload size={15} />,
                iconBg: "bg-amber-50 dark:bg-amber-900/20",
                iconColor: "text-amber-600 dark:text-amber-400",
                labelColor: "text-amber-700 dark:text-amber-400",
                onClick: openUploadModal,
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

          <Button
            variant="secondary"
            onClick={handleExportCSV}
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
            onClick={refetchSalarySlips}
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

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div
          ref={gridContainerRef}
          className={`salary-ag-grid ${
            dark ? "ag-theme-alpine-dark" : "ag-theme-alpine"
          } ${headerFrozen ? "grid-header-frozen" : ""}`}
        >
          <AgGridReact
            ref={gridRef}
            rowData={records}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            loading={tableLoading}
            getRowId={(params) => String(params.data.id)}
            maintainColumnOrder={true}
            onGridReady={(params) => {
              if (Object.keys(gridFilterModel).length) {
                params.api.setFilterModel(gridFilterModel);
              }
            }}
            onFilterChanged={handleFilterChanged}
            autoSizeStrategy={{
              type: "fitCellContents",
            }}
            domLayout="autoHeight"
            rowHeight={58}
            headerHeight={48}
            popupParent={document.body}
            suppressCellFocus
            enableCellTextSelection
            animateRows
            overlayNoRowsTemplate="<span class='text-gray-400'>No records found</span>"
          />
          <GridHeaderContextMenu
            menu={headerMenu}
            frozen={headerFrozen}
            onClose={closeHeaderMenu}
            onToggleFrozen={toggleHeaderFrozen}
          />
        </div>

        <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
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

      <PayslipPreviewModal
        viewModal={viewModal}
        closeViewModal={closeViewModal}
        handleDownloadPDF={handleDownloadPDF}
        detailLoading={detailLoading}
        detail={detail}
        pdfLoading={pdfLoading}
        formatCurrency={formatCurrency}
        payslipRef={payslipRef}
        companyId={companyId}
      />

      <UploadSalarySlipModal
        uploadOpen={uploadOpen}
        resetUpload={resetUpload}
        preview={uploadPreview}
        uploading={uploading}
        selectedFile={uploadSelectedFile}
        uploadCompany={getCompanyConfig(companyId)}
        dragOver={uploadDragOver}
        setDragOver={setUploadDragOver}
        handleDrop={handleUploadDrop}
        fileInputRef={uploadFileInputRef}
        handleFileChange={handleUploadFileChange}
        clearFile={clearUploadFile}
        fmtFileSize={fmtUploadFileSize}
        handleUpload={handleSalarySlipUpload}
      />

      <DeleteSalarySlipModal
        isOpen={!!deleteRecord}
        onClose={() => setDeleteRecord(null)}
        record={deleteRecord}
        handleDelete={handleDeleteSlip}
        deleteLoading={deleteLoading}
      />
    </div>
  );
}
