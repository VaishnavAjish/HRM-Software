import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Download,
  DollarSign,
  Loader2,
  Trash2,
  Search,
  TableProperties,
  CheckCircle,
  Eye,
} from "lucide-react";

const YEARS = ["2024", "2025", "2026", "2027", "2028", "2029", "2030"];
import toast from "react-hot-toast";
import { StatCard } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Pagination from "../../components/ui/Pagination";
import Modal from "../../components/ui/Modal";
import GridHeaderContextMenu from "../../components/ui/GridHeaderContextMenu";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { downloadCSV } from "../../utils/exportUtils";
import { formatCurrency } from "../../utils/payslipUtils";
import { exportNodeToPdf } from "../../utils/pdfUtils";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { useTheme } from "../../context/ThemeContext";
import useGridHeaderContextMenu from "../../hooks/useGridHeaderContextMenu";
import useIsMobile from "../../hooks/useIsMobile";

import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import PayslipPreviewModal from "./AdminModals/PayslipPreviewModal";
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

const ALL_SALARY_COLUMNS = [
  { field: "month", label: "Month" },
  { field: "empCode", label: "Employee Code" },
  { field: "name", label: "Employee Name" },
  { field: "resignationDate", label: "Resignation Date" },
  { field: "workingDays", label: "Working Days" },
  { field: "presentDays", label: "Present Days" },
  { field: "leave", label: "Leave" },
  { field: "salary", label: "Salary" },
  { field: "basic", label: "Basic Salary" },
  { field: "da", label: "DA" },
  { field: "hra", label: "HRA" },
  { field: "wa", label: "Wa.al" },
  { field: "conAl", label: "CON.AL" },
  { field: "comm", label: "Perfo" },
  { field: "other", label: "OTHER" },
  { field: "grossSalary", label: "Gross Salary" },
  { field: "pf", label: "PF" },
  { field: "esi", label: "ESI" },
  { field: "pt", label: "PT" },
  { field: "tds", label: "TDS" },
  { field: "advance", label: "Advance" },
  { field: "totalDeduct", label: "Total Deduction" },
  { field: "netSalary", label: "Net Salary" },
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
  wa: "wa",
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
    wa: Number(item.wa ?? 0),
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
    companyId,
    companyScope,
    scopeKey,
    scopeLabel,
  } = useCompany();
  const { dark } = useTheme();

  const gridRef = useRef(null);
  const gridContainerRef = useRef(null);
  const payslipRef = useRef(null);
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

  const [visibleColumns, setVisibleColumns] = useState([
    "month",
    "empCode",
    "name",
    "workingDays",
    "presentDays",
    "leave",
    "salary",
    "totalDeduct",
  ]);
  const [showColModal, setShowColModal] = useState(false);

  const toggleColumnVisibility = (field) => {
    setVisibleColumns((prev) =>
      prev.includes(field)
        ? prev.filter((f) => f !== field)
        : [...prev, field]
    );
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [departments, setDepartments] = useState([]);

  const mergedFilters = useMemo(() => {
    const filters = { ...apiFilter };
    if (searchQuery.trim()) {
      filters.search = searchQuery.trim();
    }
    if (selectedMonth) {
      filters.month = selectedMonth;
    }
    if (selectedYear) {
      filters.year = selectedYear;
    }
    if (selectedDepartment) {
      filters.department = selectedDepartment;
    }
    return filters;
  }, [apiFilter, searchQuery, selectedMonth, selectedYear, selectedDepartment]);

  const [exportLoading, setExportLoading] = useState(false);
  const [viewModal, setViewModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [deleteRecord, setDeleteRecord] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  const refetchSalarySlips = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadDepts() {
      try {
        const res = await salaryApi.getDepartments(user?.accessToken, user?.tokenType, companyScope.companyId);
        if (!cancelled && res?.data) {
          setDepartments(res.data);
        }
      } catch {
        // ignore
      }
    }
    loadDepts();

    return () => {
      cancelled = true;
    };
  }, [user?.accessToken, user?.tokenType, companyScope.companyId]);

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
          mergedFilters,
          companyScope,
        );

        if (cancelled) return;

        const rows = res?.data ?? [];
        const pagination = res?.pagination;
        const mapped = rows.map(mapRecord);

        setRecords(mapped);
        setTotalRecords(pagination?.total ?? mapped.length);
        setPerPage(pagination?.per_page ?? 15);
        setTotalNetPayable(
          mapped.reduce((sum, r) => sum + (Number(r.netSalary) || 0), 0),
        );
        setTotalDepartments(
          new Set(mapped.map((r) => r.department).filter(Boolean)).size,
        );
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
    mergedFilters,
    refreshKey,
    companyScope,
    user?.accessToken,
    user?.tokenType,
    scopeKey,
  ]);

  useEffect(() => {
    let active = true;
    setTimeout(() => {
      if (active) {
        setApiPage(1);
        setViewModal(null);
        setDetail(null);
      }
    }, 0);
    return () => {
      active = false;
    };
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
          wa: Number(item.wa ?? 0),
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

  const isMobile = useIsMobile();

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
        mergedFilters,
        companyScope,
      );

      const all = (res?.data ?? []).map(mapRecord);

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
        DA: record.da,
        HRA: record.hra,
        "Wa.al": record.wa,
        "CON.AL": record.conAl,
        Perfo: record.comm,
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
  }, [companyScope, user, mergedFilters]);



  const defaultColDef = useMemo(
    () => ({
      flex: 1,
      minWidth: 130,
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

  const columnDefs = useMemo(() => {
    if (isMobile) {
      return [
        {
          headerName: "Salary Record",
          field: "mobileDetails",
          flex: 1,
          cellRenderer: ({ data: record }) => {
            if (!record) return null;
            return (
              <div className="flex flex-col justify-center py-2 gap-2.5 h-full w-full">
                <div className="flex justify-between items-center w-full pr-2 gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-gray-900 dark:text-white truncate text-sm block">
                      {record.name}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 w-full pr-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <button
                      onClick={() => setViewModal(record)}
                      className="flex min-w-0 flex-1 justify-center items-center gap-1.5 rounded-lg bg-brand-50 px-2 py-2 text-xs font-semibold text-brand-600 transition hover:bg-brand-100 min-h-[36px]"
                    >
                      <Eye size={13} />
                      View
                    </button>
                    {record.status === "Pending" && (
                      <button
                        onClick={() => markPaid(record.id)}
                        className="flex min-w-0 flex-1 justify-center items-center gap-1.5 rounded-lg bg-green-50 px-2 py-2 text-xs font-semibold text-green-600 transition hover:bg-green-100 min-h-[36px]"
                      >
                        Mark Paid
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteRecord(record)}
                      className="flex min-w-0 flex-1 justify-center items-center gap-1.5 rounded-lg bg-red-50 px-2 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 min-h-[36px]"
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  </div>
                  <Badge variant="gray" className="shrink-0 font-mono text-xs">{record.month}</Badge>
                </div>
              </div>
            );
          },
        },
      ];
    }

    return [
      {
        headerName: "Month",
        field: "month",
        minWidth: isMobile ? 110 : 140,
        cellRenderer: ({ value }) => <Badge variant="gray">{value}</Badge>,
        filter: "agTextColumnFilter",
        hide: isMobile || !visibleColumns.includes("month"),
      },
      {
        headerName: "Employee Code",
        field: "empCode",
        hide: isMobile || !visibleColumns.includes("empCode"),
        valueFormatter: ({ value }) => `${value ?? ""}`,
        cellClass: "salary-ag-cell font-mono text-gray-500 dark:text-gray-400",
        filter: "agTextColumnFilter",
      },
      {
        headerName: "Employee Name",
        field: "name",
        minWidth: isMobile ? 120 : 160,
        cellClass: "salary-ag-cell font-medium text-gray-900 dark:text-white",
        cellStyle: {
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        },
        filter: "agTextColumnFilter",
        hide: isMobile || !visibleColumns.includes("name"),
      },
      {
        headerName: "Resignation Date",
        field: "resignationDate",
        hide: isMobile || !visibleColumns.includes("resignationDate"),
        filter: "agTextColumnFilter",
        valueFormatter: ({ value }) => value || "-",
        cellClass: "salary-ag-cell text-gray-600 dark:text-gray-300",
      },
      {
        headerName: "Working Days",
        field: "workingDays",
        hide: isMobile || !visibleColumns.includes("workingDays"),
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
        hide: isMobile || !visibleColumns.includes("presentDays"),
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
        hide: isMobile || !visibleColumns.includes("leave"),
        filter: "agNumberColumnFilter",
        cellRenderer: ({ value }) => (
          <Badge
            variant={value === 0 ? "green" : value <= 3 ? "yellow" : "red"}
          >
            {value}
          </Badge>
        ),
      },
      currencyColumn("salary", "Salary", { hide: isMobile || !visibleColumns.includes("salary") }),
      currencyColumn("basic", "Basic Salary", { hide: isMobile || !visibleColumns.includes("basic") }),
      currencyColumn("da", "DA", { hide: isMobile || !visibleColumns.includes("da") }),
      currencyColumn("hra", "HRA", { hide: isMobile || !visibleColumns.includes("hra") }),
      currencyColumn("wa", "Wa.al", { hide: isMobile || !visibleColumns.includes("wa") }),
      currencyColumn("conAl", "CON.AL", { hide: isMobile || !visibleColumns.includes("conAl") }),
      currencyColumn("comm", "Perfo", { hide: isMobile || !visibleColumns.includes("comm") }),
      currencyColumn("other", "OTHER", { hide: isMobile || !visibleColumns.includes("other") }),
      {
        headerName: "Gross Salary",
        field: "grossSalary",
        hide: isMobile || !visibleColumns.includes("grossSalary"),
        filter: "agNumberColumnFilter",
        valueFormatter: ({ value }) => formatCurrency(Number(value ?? 0)),
        cellRenderer: ({ value }) => (
          <Badge variant="blue">{formatCurrency(Number(value ?? 0))}</Badge>
        ),
      },
      currencyColumn("pf", "PF", {
        hide: isMobile || !visibleColumns.includes("pf"),
        cellClass: "salary-ag-cell text-red-500",
      }),
      currencyColumn("esi", "ESI", {
        hide: isMobile || !visibleColumns.includes("esi"),
        cellClass: "salary-ag-cell text-red-500",
      }),
      currencyColumn("pt", "PT", {
        hide: isMobile || !visibleColumns.includes("pt"),
        cellClass: "salary-ag-cell text-red-500",
      }),
      currencyColumn("tds", "TDS", {
        hide: isMobile || !visibleColumns.includes("tds"),
        cellClass: "salary-ag-cell text-red-500",
      }),
      currencyColumn("advance", "Advance", {
        hide: isMobile || !visibleColumns.includes("advance"),
        cellClass: "salary-ag-cell text-red-500",
      }),
      {
        headerName: "Total Deduction",
        field: "totalDeduct",
        hide: isMobile || !visibleColumns.includes("totalDeduct"),
        filter: "agNumberColumnFilter",
        valueFormatter: ({ value }) => formatCurrency(Number(value ?? 0)),
        cellRenderer: ({ value }) => (
          <Badge variant="red">{formatCurrency(Number(value ?? 0))}</Badge>
        ),
      },
      {
        headerName: "Net Salary",
        field: "netSalary",
        hide: isMobile || !visibleColumns.includes("netSalary"),
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
        minWidth: isMobile ? 90 : 100,
        maxWidth: isMobile ? 90 : 120,
        sortable: false,
        filter: false,
        suppressHeaderFilterButton: true,
        cellRenderer: ({ data: record }) => {
          if (!record) return null;

          return (
            <div className="flex h-full items-center gap-1.5">
              <button
                onClick={() => setViewModal(record)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-600 transition hover:bg-brand-100 dark:bg-brand-900/20 dark:hover:bg-brand-900/40"
                title="View"
              >
                <Eye size={14} />
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
                className="flex items-center justify-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 dark:bg-red-900/20"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        },
      },
    ];
  }, [currencyColumn, markPaid, isMobile, visibleColumns]);

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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
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
    <div className="flex h-full flex-col gap-5 overflow-hidden">
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center w-full">
        {/* Left Side: Search & dropdown filters */}
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

          {/* Department Selector */}
          <select
            value={selectedDepartment}
            onChange={(e) => {
              setSelectedDepartment(e.target.value);
              setApiPage(1);
            }}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none dark:border-white/10 dark:bg-[#0b0f1a] dark:text-white"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>

          {/* Month Selector */}
          <select
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              setApiPage(1);
            }}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none dark:border-white/10 dark:bg-[#0b0f1a] dark:text-white"
          >
            <option value="">All Months</option>
            {MONTHS.map((m, idx) => (
              <option key={idx} value={String(idx + 1)}>{m}</option>
            ))}
          </select>

          {/* Year Selector */}
          <select
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(e.target.value);
              setApiPage(1);
            }}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none dark:border-white/10 dark:bg-[#0b0f1a] dark:text-white"
          >
            <option value="">All Years</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Right Side: Actions */}
        <div className="ml-auto flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
          <Button
            variant="secondary"
            onClick={() => setShowColModal(true)}
            icon={<TableProperties size={16} />}
          >
            Columns
          </Button>

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

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div
          ref={gridContainerRef}
          className={`salary-ag-grid w-full flex-1 min-h-0 ${
            dark ? "ag-theme-alpine-dark" : "ag-theme-alpine"
          } ${headerFrozen ? "grid-header-frozen" : ""}`}
        >
          <AgGridReact
            key={isMobile ? "mobile" : "desktop"}
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
            domLayout="normal"
            rowHeight={isMobile ? 84 : 44}
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
            onPageSizeChange={(size) => {
              setPerPage(size);
              setApiPage(1);
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



      <DeleteSalarySlipModal
        isOpen={!!deleteRecord}
        onClose={() => setDeleteRecord(null)}
        record={deleteRecord}
        handleDelete={handleDeleteSlip}
        deleteLoading={deleteLoading}
      />

      <Modal
        isOpen={showColModal}
        onClose={() => setShowColModal(false)}
        title="Select Visible Columns"
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {ALL_SALARY_COLUMNS.map((col) => (
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
