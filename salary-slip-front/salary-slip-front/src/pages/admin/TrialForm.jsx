import { useEffect, useMemo, useRef, useState } from "react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import GridHeaderContextMenu from "../../components/ui/GridHeaderContextMenu";
import useGridHeaderContextMenu from "../../hooks/useGridHeaderContextMenu";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";

ModuleRegistry.registerModules([AllCommunityModule]);
import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Printer,
  Trash2,
  Building2,
  XCircle,
  TableProperties,
  CheckCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { authApi } from "../../utils/api";
import { exportNodeToPdf } from "../../utils/pdfUtils";
import TrialFormModal from "../auth/TrialFormModal";
import AppointmentModal from "../auth/AppointmentModal";

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? "";
}

function normalizeTrialForm(item, index) {
  let displayStatus;
  if (Number(item.checkbox) === 1) {
    displayStatus = "Approved";
  } else {
    const rawStatus = String(firstPresent(item.status, item.form_status, "0"));
    if (rawStatus === "2") displayStatus = "Rejected";
    else displayStatus = "Pending";
  }

  return {
    id: firstPresent(item.id, item.trial_form_id, item._id, index),
    status: displayStatus,
    processed: Number(item.processed ?? 0) === 1,
    isPrinted: Number(item.print ?? 0) === 1,
    fromNo: firstPresent(item.form_no, item.fromNo),
    date: firstPresent(item.trial_date, item.date, item.created_at),
    department: firstPresent(item.department, item.dept),
    name: firstPresent(item.name, item.employee_name),
    address: item.address || "-",
    mobileNo1: firstPresent(item.mobile_number, item.mobileNo1),
    mobileNo2: firstPresent(item.mobile_no_2, item.mobileNo2),
    gender: item.gender || "-",
    email: item.email || "-",
    unit: firstPresent(item.unit, item.unit_name),
    lastCompanyName: firstPresent(item.last_company_name, item.lastCompanyName),
    lastCompanyAddress: firstPresent(
      item.last_company_address,
      item.lastCompanyAddress,
    ),
    experience: item.experience || "-",
    reasonForLeaving: firstPresent(
      item.reason_for_leaving,
      item.reasonForLeaving,
    ),
    hastakName: firstPresent(item.hastak_name, item.hastakName),
    hastakCode: firstPresent(item.hastak_code, item.hastakCode),
    hastakMobileNo: firstPresent(item.hastak_mobile, item.hastakMobileNo),
    hastakDepartment: item.hastak_department || "-",
    contractor: item.contractor || "-",
    managerName: firstPresent(item.manager_name, item.managerName),
    akar: item.akar || "-",
    aadharCardNo: item.aadhaar_full || item.aadhaar_masked || "-",
    empSignature: item.emp_signature || "",
    managerSignature: item.manager_signature || "",
    hastakSignature: item.hastak_signature || "",
    hrSignature: item.hr_signature || "",
    submittedAt: firstPresent(
      item.created_at,
      item.createdAt,
      item.submitted_at,
    ),
    photo: item.photo || "",
    adharImage: item.adhar_image || "",
    raw: item,
  };
}

function getTrialFormRows(response) {
  const data = response?.data ?? response ?? [];
  const rows = data?.trialForms ?? data?.trial_forms ?? data?.data ?? data;
  return Array.isArray(rows) ? rows.map(normalizeTrialForm) : [];
}

function formatDate(value) {
  if (!value || value === "-") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const TextCell = ({ value }) => (
  <span className="text-sm text-gray-600 dark:text-gray-300">
    {value || "—"}
  </span>
);

function StatusBadge({ status }) {
  if (status === "Approved")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 dark:bg-green-900/20 dark:text-green-400">
        <CheckCircle2 size={11} /> Approved
      </span>
    );
  if (status === "Rejected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 dark:bg-red-900/20 dark:text-red-400">
        <XCircle size={11} /> Rejected
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
      <Clock size={11} /> Pending
    </span>
  );
}

const Row = ({ label, value, full }) => (
  <tr>
    <td
      className={`border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black ${
        full ? "w-1/4" : "w-1/6"
      }`}
    >
      {label}
    </td>
    <td
      className={`border border-black px-3 py-2 text-[13px] font-medium uppercase text-black ${
        full ? "" : "w-1/3"
      }`}
      colSpan={full ? 3 : 1}
    >
      {value || ""}
    </td>
  </tr>
);

const PrintableTrialForm = ({ data, formRef }) => {
  const allFields = [
    { label: "Branch / Unit", value: data.unit },
    { label: "Gender", value: data.gender },
    { label: "Department", value: data.department, full: true },
    { label: "Name of Employee", value: data.name, full: true },
    { label: "Address", value: data.address, full: true },
    { label: "Mobile No 1", value: data.mobileNo1 },
    { label: "Mobile No 2", value: data.mobileNo2 },
    { label: "Email Id", value: data.email, full: true },
    { label: "Last Company Name", value: data.lastCompanyName, full: true },
    { label: "Last Company Address", value: data.lastCompanyAddress, full: true },
    { label: "Experience", value: data.experience },
    { label: "Reason for Leaving", value: data.reasonForLeaving },
    { label: "Hastak Name & Code", value: [data.hastakName, data.hastakCode ? `- ${data.hastakCode}` : ""].filter(Boolean).join(" ") },
    { label: "Hastak Mobile No", value: data.hastakMobileNo },
    { label: "Hastak Department", value: data.hastakDepartment, full: true },
    { label: "Contractor", value: data.contractor, full: true },
    { label: "Manager Name", value: data.managerName },
    { label: "Akar", value: data.akar },
  ];

  return (
    <div
      ref={formRef}
      data-trial-print-form
      className="mx-auto w-full max-w-[850px] print:max-w-none"
    >
      {/* ── Main white card ── */}
      <div className="rounded-xl border border-dashed border-gray-400 bg-white p-4 sm:p-6 shadow-sm text-black h-full flex flex-col print:h-[277mm] print:overflow-hidden print:border-none print:shadow-none print:rounded-none">

        {/* Header — centred logo + right-aligned date/form no */}
        <div className="flex items-start justify-between mb-1">
          <div className="flex-1">
            <div className="w-24 h-32 border border-black flex items-center justify-center bg-gray-50 overflow-hidden print:w-[30mm] print:h-[40mm]">
              {data.photo ? (
                <img src={data.photo} alt="Photo" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-gray-400">Photo</span>
              )}
            </div>
          </div>
          <div className="flex-1 text-center">
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-widest text-black">
              Nidhi Impex
            </h1>
            <div className="mt-2">
              <span className="inline-block rounded-full bg-gray-900 px-4 py-1 text-xs font-bold uppercase tracking-widest text-white">
                Trial Form
              </span>
            </div>
          </div>
          <div className="flex-1 text-right space-y-1 text-[13px] font-semibold text-black">
            <p>Date : <span className="font-bold">{formatDate(data.date)}</span></p>
            <p>Form No : <span className="font-bold">{data.fromNo}</span></p>
          </div>
        </div>

        <div className="border-t-2 border-black mt-3 mb-4" />

        {/* ── Candidate Details section header ── */}
        <div className="rounded-md bg-brand-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white mb-3">
          Candidate Details
        </div>

        {/* ── Fields grid — screen view ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 print:hidden">
          {allFields.map(({ label, value, full }) => (
            <div key={label} className={`flex flex-col gap-0.5 ${full ? "sm:col-span-2" : ""}`}>
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                {label}
              </span>
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] font-semibold uppercase text-black min-h-[34px]">
                {value || "-"}
              </div>
            </div>
          ))}
        </div>

        {/* ── Print table — always shown when printing ── */}
        <div className="hidden print:block overflow-x-auto rounded-lg border border-black flex-1">
          <table className="w-full h-full min-w-[600px] border-collapse text-[13px] [&_td]:h-8">
            <tbody>
              <Row label="Department" value={data.department} full />
              <Row label="Name of Employee" value={data.name} full />
              <Row label="Address" value={data.address} full />
              <Row label="Aadhaar Number" value={data.aadharCardNo} full />
              <tr>
                <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">Mobile No 1</td>
                <td className="border border-black px-3 py-2 text-[13px] font-medium text-black">{data.mobileNo1}</td>
                <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">Gender</td>
                <td className="border border-black px-3 py-2 text-[13px] font-medium uppercase text-black">{data.gender}</td>
              </tr>
              <tr>
                <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">Mobile No 2</td>
                <td className="border border-black px-3 py-2 text-[13px] font-medium text-black">{data.mobileNo2}</td>
                <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">Email Id</td>
                <td className="border border-black px-3 py-2 text-[13px] font-medium lowercase text-black">{data.email}</td>
              </tr>
              <Row label="Last Company Name" value={data.lastCompanyName} full />
              <Row label="Last Company Address" value={data.lastCompanyAddress} full />
              <tr>
                <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">Experience</td>
                <td className="border border-black px-3 py-2 text-[13px] font-medium uppercase text-black">{data.experience}</td>
                <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">Reason for Leaving</td>
                <td className="border border-black px-3 py-2 text-[13px] font-medium uppercase text-black">{data.reasonForLeaving}</td>
              </tr>
              <tr>
                <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">Hastak Name &amp; Code</td>
                <td className="border border-black px-3 py-2 text-[13px] font-medium uppercase text-black">{data.hastakName} {data.hastakCode ? `- ${data.hastakCode}` : ""}</td>
                <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">Hastak Mobile No</td>
                <td className="border border-black px-3 py-2 text-[13px] font-medium text-black">{data.hastakMobileNo}</td>
              </tr>
              <Row label="Hastak Department" value={data.hastakDepartment} full />
              <Row label="Contractor" value={data.contractor} full />
              <tr>
                <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">Manager Name</td>
                <td className="border border-black px-3 py-2 text-[13px] font-medium uppercase text-black">{data.managerName}</td>
                <td className="border border-black bg-gray-50 px-3 py-2 text-[12px] font-bold uppercase text-black">Akar</td>
                <td className="border border-black px-3 py-2 text-[13px] font-medium uppercase text-black">{data.akar}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Signatures ── */}
        <div className="mt-auto pt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-16 gap-y-8 text-[13px] font-bold text-black">
          <div className="text-center">
            <div className="mb-1 h-8 border-b border-black px-1 text-[13px] font-semibold uppercase">{data.empSignature}</div>
            <p>Emp - Signature</p>
          </div>
          <div className="text-center">
            <div className="mb-1 h-8 border-b border-black px-1 text-[13px] font-semibold uppercase">{data.managerSignature}</div>
            <p>Manager</p>
          </div>
          <div className="text-center">
            <div className="mb-1 h-8 border-b border-black px-1 text-[13px] font-semibold uppercase">{data.hastakSignature}</div>
            <p>Hastak Signature</p>
          </div>
          <div className="text-center">
            <div className="mb-1 h-8 border-b border-black px-1 text-[13px] font-semibold uppercase">{data.hrSignature}</div>
            <p>H R</p>
          </div>
        </div>
      </div>

      {/* ── Aadhaar Card Print Page (New Page) ── */}
      {data.adharImage && (
        <div className="hidden print:flex w-full h-[277mm] flex-col items-center justify-center break-before-page pt-4 relative">
          {data.adharImage.toLowerCase().includes('.pdf') ? (
            <div className="text-center font-bold text-gray-700 mt-10">
              [Aadhaar Card is a PDF document and cannot be printed directly as an image. Please print the PDF separately.]
            </div>
          ) : (
            <img src={data.adharImage} alt="Aadhaar Card" className="max-w-[190mm] max-h-[270mm] object-contain" />
          )}
        </div>
      )}
    </div>
  );
};

export default function TrialForm() {
  const { user } = useAuth();
  const { companyId, companyScope, scopeKey } = useCompany();
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [prefillTrialData, setPrefillTrialData] = useState(null);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [forms, setForms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [statusLoading, setStatusLoading] = useState({});
  const [visibleColumns, setVisibleColumns] = useState([
    "fromNo", "name", "department", "unit", "experience", "managerName", "status", "isPrinted",
  ]);
  const [showColModal, setShowColModal] = useState(false);
  const formRef = useRef(null);
  const gridRef = useRef(null);
  const gridContainerRef = useRef(null);
  const { dark } = useTheme();
  const isMobile = useIsMobile(768);
  const { headerMenu, headerFrozen, closeHeaderMenu, toggleHeaderFrozen } =
    useGridHeaderContextMenu(gridRef, gridContainerRef);

  const [activeTab, setActiveTab] = useState("nidhi-impex");
  const isNidhiScope = companyId === "nidhi-impex" || (companyId === "all-companies" && activeTab === "nidhi-impex");

  const loadForms = async () => {
    if (!isNidhiScope) return;
    setLoading(true);
    try {
      const res = await authApi.getTrialForms(
        user?.accessToken,
        user?.tokenType,
        companyScope,
      );
      setForms(getTrialFormRows(res));
    } catch (error) {
      setForms([]);
      toast.error(error.message || "Failed to load trial forms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.accessToken || !isNidhiScope) return undefined;
    const timer = window.setTimeout(() => {
      loadForms();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, scopeKey, isNidhiScope]);

  const counts = useMemo(
    () => ({
      total: forms.length,
      pending: forms.filter((f) => f.status === "Pending").length,
      approved: forms.filter((f) => f.status === "Approved").length,
      rejected: forms.filter((f) => f.status === "Rejected").length,
    }),
    [forms],
  );

  const handleDownloadPDF = async () => {
    if (!selected || !formRef.current) return;
    setPdfLoading(true);
    try {
      const fileName = `Trial_Form_${(selected.name || "form").replace(/\s+/g, "_")}.pdf`;
      await exportNodeToPdf(formRef.current, fileName, { fitToOnePage: true });
      toast.success("Form downloaded successfully");
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePrint = () => {
    if (!formRef.current) return;
    const win = window.open("", "_blank", "width=1000,height=750");
    if (!win) {
      toast.error("Please allow pop-ups to print the trial form");
      return;
    }

    let cssText = "";
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            cssText += rule.cssText + "\n";
          }
        } catch {
          // Ignore stylesheet access errors (e.g. CORS)
        }
      }
    } catch {
      // ignore
    }
    const appStyles = `<style>${cssText}</style>`;

    win.document.write(
      `<!DOCTYPE html><html><head>
        <base href="${document.baseURI}">
        ${appStyles}
        <title>Trial Form – ${selected?.name || ""}</title>
        <style>
          *, *::before, *::after { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: white; font-family: sans-serif; }
          [data-trial-print-form] { box-shadow: none !important; }
          @media print {
            @page { size: A4 portrait; margin: 0; }
            html, body {
              width: 210mm;
              margin: 0 !important;
              padding: 0 !important;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            [data-trial-print-form] {
              width: 100% !important;
              max-width: none !important;
              box-shadow: none !important;
              border: none !important;
              padding: 10mm !important;
              zoom: 1;
            }
          }
        </style>
      </head><body>${formRef.current.outerHTML}</body></html>`,
    );
    win.document.close();

    const printWhenReady = async () => {
      await win.document.fonts?.ready;
      win.focus();
      win.print();

      // Mark as printed in API
      try {
        await authApi.updateTrialForm(
          selected.id,
          { print: 1 },
          user?.accessToken,
          user?.tokenType,
        );
        loadForms();
      } catch {
        // silent — print already happened
      }
    };

    if (win.document.readyState === "complete") {
      printWhenReady();
    } else {
      win.addEventListener("load", printWhenReady, { once: true });
    }
  };

  const handleStatusUpdate = async (id, approve) => {
    const label = approve ? "Approved" : "Rejected";
    setStatusLoading((prev) => ({ ...prev, [id]: label }));
    try {
      await authApi.updateTrialForm(
        id,
        { checkbox: approve ? 1 : 0 },
        user?.accessToken,
        user?.tokenType,
      );
      setForms((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: label } : f)),
      );
      if (selected?.id === id)
        setSelected((prev) => ({ ...prev, status: label }));
      toast.success(`Trial form ${label.toLowerCase()} successfully`);
    } catch (err) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setStatusLoading((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await authApi.deleteTrialForm(
        deleteTarget.id,
        user?.accessToken,
        user?.tokenType,
      );
      toast.success("Trial form deleted");
      setDeleteTarget(null);
      setSelected(null);
      loadForms();
    } catch (error) {
      toast.error(error.message || "Failed to delete trial form");
    } finally {
      setDeleting(false);
    }
  };

  const allColumns = useMemo(() => [
    { field: "fromNo", label: "Form No" },
    { field: "name", label: "Name" },
    { field: "department", label: "Department" },
    { field: "unit", label: "Branch" },
    { field: "experience", label: "Experience" },
    { field: "managerName", label: "Manager" },
    { field: "address", label: "Address" },
    { field: "mobileNo1", label: "Contact" },
    { field: "mobileNo2", label: "Mobile No 2" },
    { field: "email", label: "Email" },
    { field: "gender", label: "Gender" },
    { field: "date", label: "Date" },
    { field: "lastCompanyName", label: "Last Company Name" },
    { field: "lastCompanyAddress", label: "Last Company Address" },
    { field: "reasonForLeaving", label: "Reason for Leaving" },
    { field: "hastakName", label: "Hastak Name" },
    { field: "hastakCode", label: "Hastak Code" },
    { field: "hastakMobileNo", label: "Hastak Mobile" },
    { field: "contractor", label: "Contractor" },
    { field: "akar", label: "Akar" },
    { field: "empSignature", label: "Emp Signature" },
    { field: "managerSignature", label: "Manager Signature" },
    { field: "hastakSignature", label: "Hastak Signature" },
    { field: "hrSignature", label: "HR Signature" },
    { field: "status", label: "Status" },
    { field: "isPrinted", label: "Print" },
  ], []);

  const toggleColumnVisibility = (field) => {
    setVisibleColumns((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const columnDefs = useMemo(
    () => [
      {
        headerName: "Form No",
        field: "fromNo",
        width: 130,
        hide: !visibleColumns.includes("fromNo"),
        cellRenderer: ({ value }) => (
          <span className="font-mono text-sm font-semibold text-brand-700 dark:text-brand-300">
            {value || "—"}
          </span>
        ),
      },
      {
        headerName: "Name",
        field: "name",
        minWidth: 200,
        flex: 1.2,
        hide: !visibleColumns.includes("name"),
        cellRenderer: ({ value }) => (
          <span className="font-semibold text-sm text-gray-900 dark:text-white capitalize">
            {value?.toLowerCase()}
          </span>
        ),
      },
      {
        headerName: "Department",
        field: "department",
        minWidth: 140,
        hide: !visibleColumns.includes("department"),
        cellRenderer: ({ value }) => (
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {value || "—"}
          </span>
        ),
      },
      {
        headerName: "Branch",
        field: "unit",
        width: 120,
        hide: !visibleColumns.includes("unit"),
        cellRenderer: ({ value }) => (
          <Badge variant="gray">{value || "—"}</Badge>
        ),
      },
      {
        headerName: "Experience",
        field: "experience",
        width: 120,
        hide: !visibleColumns.includes("experience"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Manager",
        field: "managerName",
        minWidth: 130,
        hide: !visibleColumns.includes("managerName"),
        cellRenderer: ({ value }) => (
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {value || "—"}
          </span>
        ),
      },
      {
        headerName: "Address",
        field: "address",
        minWidth: 180,
        hide: !visibleColumns.includes("address"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Contact",
        field: "mobileNo1",
        width: 140,
        hide: !visibleColumns.includes("mobileNo1"),
        cellRenderer: ({ value }) => (
          <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
            <Phone size={12} className="text-green-500 flex-shrink-0" />
            {value || "—"}
          </span>
        ),
      },
      {
        headerName: "Mobile No 2",
        field: "mobileNo2",
        width: 130,
        hide: !visibleColumns.includes("mobileNo2"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Email",
        field: "email",
        minWidth: 170,
        hide: !visibleColumns.includes("email"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Gender",
        field: "gender",
        width: 100,
        hide: !visibleColumns.includes("gender"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Date",
        field: "date",
        width: 120,
        hide: !visibleColumns.includes("date"),
        cellRenderer: ({ value }) => (
          <span className="text-sm text-gray-700 dark:text-gray-200">
            {formatDate(value)}
          </span>
        ),
      },
      {
        headerName: "Last Company Name",
        field: "lastCompanyName",
        minWidth: 160,
        hide: !visibleColumns.includes("lastCompanyName"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Last Company Address",
        field: "lastCompanyAddress",
        minWidth: 180,
        hide: !visibleColumns.includes("lastCompanyAddress"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Reason for Leaving",
        field: "reasonForLeaving",
        minWidth: 160,
        hide: !visibleColumns.includes("reasonForLeaving"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Hastak Name",
        field: "hastakName",
        minWidth: 140,
        hide: !visibleColumns.includes("hastakName"),
        cellRenderer: ({ value }) => (
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {value || "—"}
          </span>
        ),
      },
      {
        headerName: "Hastak Code",
        field: "hastakCode",
        width: 120,
        hide: !visibleColumns.includes("hastakCode"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Hastak Mobile",
        field: "hastakMobileNo",
        width: 140,
        hide: !visibleColumns.includes("hastakMobileNo"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Contractor",
        field: "contractor",
        minWidth: 130,
        hide: !visibleColumns.includes("contractor"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Akar",
        field: "akar",
        width: 110,
        hide: !visibleColumns.includes("akar"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Emp Signature",
        field: "empSignature",
        minWidth: 140,
        hide: !visibleColumns.includes("empSignature"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Manager Signature",
        field: "managerSignature",
        minWidth: 150,
        hide: !visibleColumns.includes("managerSignature"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Hastak Signature",
        field: "hastakSignature",
        minWidth: 150,
        hide: !visibleColumns.includes("hastakSignature"),
        cellRenderer: TextCell,
      },
      {
        headerName: "HR Signature",
        field: "hrSignature",
        minWidth: 140,
        hide: !visibleColumns.includes("hrSignature"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Status",
        field: "status",
        width: 120,
        hide: !visibleColumns.includes("status"),
        cellRenderer: ({ value }) => <StatusBadge status={value} />,
      },
      {
        headerName: "Print",
        field: "isPrinted",
        width: 130,
        hide: !visibleColumns.includes("isPrinted"),
        cellRenderer: ({ value }) =>
          value ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 dark:bg-green-900/20 dark:text-green-400">
              <Printer size={11} /> Printed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              <Printer size={11} /> Not Printed
            </span>
          ),
      },
      {
        headerName: "Actions",
        field: "id",
        pinned: "right",
        width: user?.role === 'agent' ? 200 : 380,
        sortable: false,
        filter: false,
        cellRenderer: ({ data }) => (
          <div className="flex h-full items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              icon={<Eye size={13} />}
              onClick={() => setSelected(data)}
            >
              View
            </Button>
            {user?.role !== 'agent' && (
              <>
                {data.status !== "Rejected" && (
                  <button
                    onClick={() => handleStatusUpdate(data.id, true)}
                    disabled={
                      Boolean(statusLoading[data.id]) || data.status === "Approved"
                    }
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                      data.status === "Approved"
                        ? "bg-green-600 text-white cursor-default"
                        : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 disabled:opacity-50"
                    }`}
                  >
                    {statusLoading[data.id] === "Approved" ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={11} />
                    )}
                    Approve
                  </button>
                )}
                {data.status !== "Approved" && (
                  <button
                    onClick={() => handleStatusUpdate(data.id, false)}
                    disabled={
                      Boolean(statusLoading[data.id]) || data.status === "Rejected"
                    }
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                      data.status === "Rejected"
                        ? "bg-red-600 text-white cursor-default"
                        : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 disabled:opacity-50"
                    }`}
                  >
                    {statusLoading[data.id] === "Rejected" ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <XCircle size={11} />
                    )}
                    Reject
                  </button>
                )}
                <button
                  onClick={() => setDeleteTarget(data)}
                  className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
                >
                  <Trash2 size={11} />
                </button>
              </>
            )}
            {(data.status === "Approved" || data.status === "1") && (user?.role === 'agent' || ["0", "1", "2", "admin", "superadmin"].includes(String(user?.role).toLowerCase())) && (
              data.processed ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400 whitespace-nowrap">
                  <CheckCircle2 size={11} /> Processed
                </span>
              ) : (
                <button
                  onClick={() => {
                    setPrefillTrialData(data);
                    setShowAppointmentModal(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 whitespace-nowrap"
                >
                  <Plus size={11} /> Process
                </button>
              )
            )}
          </div>
        ),
      },
    ],
    [statusLoading, handleStatusUpdate, visibleColumns, user?.role],
  );

  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      suppressHeaderMenuButton: false,
      cellStyle: { display: "flex", alignItems: "center", overflow: "hidden" },
    }),
    [],
  );

  const renderContent = () => {
    if (companyId === "all-companies" && activeTab === "silverstar") {
      return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800 mt-5">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-900/20">
            <Clock size={26} />
          </div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">
            Coming Soon
          </h2>
          <p className="mt-1 max-w-sm text-sm text-gray-400">
            Trial Forms for Silverstar are currently under development.
          </p>
        </div>
      );
    }

    if (!isNidhiScope) {
      return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800 mt-5">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 dark:bg-amber-900/20">
            <Building2 size={26} />
          </div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">
            Trial Form is available for Nidhi Impex only
          </h2>
          <p className="mt-1 max-w-sm text-sm text-gray-400">
            Switch your company scope to Nidhi Impex from the sidebar to view and
            submit trial forms.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-5 mt-5">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/30">
            <FileSpreadsheet size={18} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Trial Forms
            </h1>
            <p className="text-xs text-gray-400">
              Candidate trial / interview forms — Nidhi Impex
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={() => setAddFormOpen(true)}
            icon={<Plus size={14} />}
          >
            New Trial Form
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowColModal(true)}
            icon={<TableProperties size={14} />}
          >
            Columns
          </Button>
          <Button
            variant="secondary"
            onClick={loadForms}
            disabled={loading}
            icon={
              loading ? <Loader2 size={14} className="animate-spin" /> : null
            }
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Total",
            value: counts.total,
            color: "text-gray-900 dark:text-white",
            bg: "bg-white dark:bg-gray-800",
            border: "border-gray-200 dark:border-gray-700",
            labelCls: "text-gray-500 dark:text-gray-400",
          },
          {
            label: "Pending",
            value: counts.pending,
            color: "text-amber-600 dark:text-amber-400",
            bg: "bg-white dark:bg-gray-800",
            border:
              "border-l-4 border-l-amber-400 border-gray-200 dark:border-gray-700",
            labelCls: "text-amber-600 dark:text-amber-400",
          },
          {
            label: "Approved",
            value: counts.approved,
            color: "text-green-600 dark:text-green-400",
            bg: "bg-white dark:bg-gray-800",
            border:
              "border-l-4 border-l-green-400 border-gray-200 dark:border-gray-700",
            labelCls: "text-green-600 dark:text-green-400",
          },
          {
            label: "Rejected",
            value: counts.rejected,
            color: "text-red-600 dark:text-red-400",
            bg: "bg-white dark:bg-gray-800",
            border:
              "border-l-4 border-l-red-400 border-gray-200 dark:border-gray-700",
            labelCls: "text-red-600 dark:text-red-400",
          },
        ].map(({ label, value, color, bg, border, labelCls }) => (
          <div
            key={label}
            className={`rounded-xl border ${border} ${bg} px-4 py-3 shadow-sm`}
          >
            <p className={`text-xs font-semibold ${labelCls}`}>{label}</p>
            <p className={`mt-1 text-2xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table — desktop only */}
      {isMobile ? (
        /* ── Mobile card list ────────────────────────────────────────────── */
        <div className="space-y-3">
          {loading ? (
            <div className="p-4">
              <SkeletonTable rows={4} cols={2} />
            </div>
          ) : forms.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-12 text-center dark:border-gray-700 dark:bg-gray-800">
              <FileSpreadsheet size={32} className="mb-3 text-gray-300" />
              <p className="text-sm text-gray-400">No trial forms found</p>
            </div>
          ) : (
            forms.map((form) => (
              <div
                key={form.id}
                className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                {/* Top row: name + status */}
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-gray-900 capitalize dark:text-white">
                    {form.name?.toLowerCase() || "—"}
                  </p>
                  <StatusBadge status={form.status} />
                </div>

                {/* Detail chips */}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                  {form.fromNo && (
                    <span>
                      <span className="font-semibold text-gray-700 dark:text-gray-300">Form #</span>{" "}
                      {form.fromNo}
                    </span>
                  )}
                  {form.date && (
                    <span>
                      <span className="font-semibold text-gray-700 dark:text-gray-300">Date:</span>{" "}
                      {formatDate(form.date)}
                    </span>
                  )}
                  {form.department && (
                    <span>
                      <span className="font-semibold text-gray-700 dark:text-gray-300">Dept:</span>{" "}
                      {form.department}
                    </span>
                  )}
                  {form.mobileNo1 && (
                    <span className="flex items-center gap-1">
                      <Phone size={11} className="text-green-500" />
                      {form.mobileNo1}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setSelected(form)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
                  >
                    <Eye size={13} />
                    View Full Application
                  </button>
                  <button
                    onClick={() => setEditTarget(form)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-400"
                  >
                    <Pencil size={13} />
                    Edit
                  </button>
                  {user?.role !== 'agent' && (
                    <>
                      <button
                        onClick={() => handleStatusUpdate(form.id, true)}
                        disabled={
                          Boolean(statusLoading[form.id]) || form.status === "Approved"
                        }
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                          form.status === "Approved"
                            ? "bg-green-600 text-white cursor-default"
                            : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 disabled:opacity-50"
                        }`}
                      >
                        {statusLoading[form.id] === "Approved" ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={13} />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() => handleStatusUpdate(form.id, false)}
                        disabled={
                          Boolean(statusLoading[form.id]) || form.status === "Rejected"
                        }
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                          form.status === "Rejected"
                            ? "bg-red-600 text-white cursor-default"
                            : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 disabled:opacity-50"
                        }`}
                      >
                        {statusLoading[form.id] === "Rejected" ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <XCircle size={13} />
                        )}
                        Reject
                      </button>
                      <button
                        onClick={() => setDeleteTarget(form)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                  {(form.status === "Approved" || form.status === "1") && (user?.role === 'agent' || ["0", "1", "2", "admin", "superadmin"].includes(String(user?.role).toLowerCase())) && (
                    form.processed ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                        <CheckCircle2 size={13} /> Processed
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setPrefillTrialData(form);
                          setShowAppointmentModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400"
                      >
                        <Plus size={13} /> Process
                      </button>
                    )
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* ── Desktop AG Grid ────────────────────────────────────────────── */
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {loading ? (
            <div className="p-4">
              <SkeletonTable rows={6} cols={7} />
            </div>
          ) : (
            <div
              ref={gridContainerRef}
              className={`salary-ag-grid ${dark ? "ag-theme-alpine-dark" : "ag-theme-alpine"} ${headerFrozen ? "grid-header-frozen" : ""}`}
            >
              <AgGridReact
                ref={gridRef}
                rowData={forms}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                getRowId={(params) => String(params.data.id)}
                domLayout="autoHeight"
                rowHeight={58}
                headerHeight={48}
                popupParent={document.body}
                enableCellTextSelection
                animateRows
                overlayNoRowsTemplate="<span class='text-gray-400 text-sm'>No trial forms found</span>"
              />
              <GridHeaderContextMenu
                menu={headerMenu}
                frozen={headerFrozen}
                onClose={closeHeaderMenu}
                onToggleFrozen={toggleHeaderFrozen}
              />
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span>Trial Form Details</span>
            {selected && <StatusBadge status={selected.status} />}
            {selected &&
              (selected.isPrinted ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">
                  <Printer size={11} /> Printed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">
                  <Printer size={11} /> Not Printed
                </span>
              ))}
          </div>
        }
        size="xl"
        footer={
          selected && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Status actions — left side */}
              <div className="flex flex-wrap items-center gap-2">
                {user?.role !== 'agent' && (
                  <>
                    <button
                      onClick={() => handleStatusUpdate(selected.id, true)}
                      disabled={
                        Boolean(statusLoading[selected.id]) ||
                        selected.status === "Approved"
                      }
                      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition shadow-sm ${
                        selected.status === "Approved"
                          ? "bg-green-600 text-white cursor-default"
                          : "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      }`}
                    >
                      {statusLoading[selected.id] === "Approved" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      Approve
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(selected.id, false)}
                      disabled={
                        Boolean(statusLoading[selected.id]) ||
                        selected.status === "Rejected"
                      }
                      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition shadow-sm ${
                        selected.status === "Rejected"
                          ? "bg-red-600 text-white cursor-default"
                          : "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      }`}
                    >
                      {statusLoading[selected.id] === "Rejected" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <XCircle size={14} />
                      )}
                      Reject
                    </button>
                  </>
                )}
                {(selected.status === "Approved" || selected.status === "1") && (user?.role === 'agent' || ["0", "1", "2", "admin", "superadmin"].includes(String(user?.role).toLowerCase())) && (
                  selected.processed ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      <CheckCircle2 size={14} /> Processed
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setPrefillTrialData(selected);
                        setShowAppointmentModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                    >
                      <Plus size={14} /> Process
                    </button>
                  )
                )}
              </div>
              {/* Document actions — right side */}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => setSelected(null)}>
                  Close
                </Button>
                <button
                  onClick={() => {
                    setSelected(null);
                    setEditTarget(selected);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-400 dark:hover:bg-brand-900/40"
                >
                  <Pencil size={14} />
                  Edit
                </button>
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  <Printer size={14} />
                  Print
                </button>
                <button
                  onClick={handleDownloadPDF}
                  disabled={pdfLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-600 dark:hover:bg-gray-500"
                >
                  {pdfLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  {pdfLoading ? "Generating…" : "Download PDF"}
                </button>
              </div>
            </div>
          )
        }
      >
        {selected && <PrintableTrialForm data={selected} formRef={formRef} />}
      </Modal>

      {/* Delete confirm */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Trial Form"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Are you sure you want to delete the trial form for{" "}
          <span className="font-semibold">{deleteTarget?.name}</span>? This
          cannot be undone.
        </p>
      </Modal>

      <TrialFormModal
        isOpen={addFormOpen || Boolean(editTarget)}
        onClose={() => {
          setAddFormOpen(false);
          setEditTarget(null);
        }}
        initialData={editTarget}
        onSuccess={() => {
          setAddFormOpen(false);
          setEditTarget(null);
          loadForms();
        }}
      />
      <AppointmentModal
        isOpen={showAppointmentModal}
        onClose={() => {
          setShowAppointmentModal(false);
          setPrefillTrialData(null);
        }}
        onSuccess={() => {
          setShowAppointmentModal(false);
          setPrefillTrialData(null);
          setSelected(null);
          loadForms();
        }}
        initialData={prefillTrialData}
        isPrefillFromTrial={true}
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
  };

  return (
    <div>
      {companyId === "all-companies" && (
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800 shadow-sm mb-4">
          <button
            onClick={() => setActiveTab("nidhi-impex")}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
              activeTab === "nidhi-impex"
                ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            Nidhi Impex
          </button>
          <button
            onClick={() => setActiveTab("silverstar")}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
              activeTab === "silverstar"
                ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            Silverstar
          </button>
        </div>
      )}
      {renderContent()}
    </div>
  );
}