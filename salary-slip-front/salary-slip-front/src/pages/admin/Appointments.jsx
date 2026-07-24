import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import GridHeaderContextMenu from "../../components/ui/GridHeaderContextMenu";
import useGridHeaderContextMenu from "../../hooks/useGridHeaderContextMenu";
import { useTheme } from "../../context/ThemeContext";

ModuleRegistry.registerModules([AllCommunityModule]);
import {
  Calendar,
  ClipboardList,
  Download,
  Eye,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Printer,
  CheckCircle2,
  XCircle,
  Clock,
  ZoomIn,
  X,
  FileText,
  Image as ImageIcon,
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
import AppointmentModal from "../auth/AppointmentModal";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white";

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? "";
}

function normalizeAppointment(item, index) {
  let displayStatus;
  if (Number(item.checkbox) === 1) {
    displayStatus = "Approved";
  } else {
    const rawStatus = String(firstPresent(item.status, item.form_status, "0"));
    if (rawStatus === "2") displayStatus = "Rejected";
    else displayStatus = "Pending";
  }

  const name = item.name || {};
  const fullName = firstPresent(
    item.full_name,
    item.fullName,
    item.emp_name,
    item.employee_name,
    typeof item.name === "string" ? item.name : "",
    [name.first, name.mid, name.surname].filter(Boolean).join(" "),
  );

  return {
    id: firstPresent(item.id, item.appointment_id, item._id, index),
    empCode: firstPresent(item.empCode, item.emp_code),
    fullName: fullName || "-",
    department: firstPresent(item.department, item.dept),
    managerName: firstPresent(item.managerName, item.manager_name),
    joiningDate: firstPresent(item.joiningDate, item.joining_date),
    empMobile: firstPresent(
      item.empMobile,
      item.mobile_number,
      item.emp_mobile,
      item.mobile_no,
    ),
    empWhatsapp: firstPresent(
      item.empWhatsapp,
      item.emp_whatsapp_no,
      item.emp_whatsapp,
    ),
    refName: firstPresent(item.refName, item.reference_name, item.ref_name),
    refMobile: firstPresent(
      item.refMobile,
      item.reference_mobile_no,
      item.ref_mobile,
    ),
    aadharNo: firstPresent(item.aadharNo, item.aadhar_card_no, item.aadhar_no),
    panNo: firstPresent(item.panNo, item.pan_card_no, item.pan_no),
    bankName: firstPresent(item.bankName, item.bank_name),
    accountNo: firstPresent(
      item.accountNo,
      item.bank_account_no,
      item.account_no,
    ),
    ifscCode: firstPresent(
      item.ifscCode,
      item.bank_ifsc_code,
      item.ifsc_code,
      item.bank_ifsc,
    ),
    unitName: firstPresent(item.unitName, item.unit_name, item.unit),
    status: displayStatus,
    salary: item.salary || "-",
    designation: item.designation || "-",
    email: item.email || "-",
    education: item.education || "-",
    punchingNo: item.punching_no || "-",
    address: item.address || "-",
    village: item.village || "-",
    taluka: item.taluka || "-",
    district: item.district || "-",
    dob: item.dob || "-",
    birthPlace: item.birth_place || "-",
    gender: item.gender || "-",
    cast: item.cast || "-",
    maritalStatus: item.marital_status || "-",
    bloodGroup: item.blood_group || "-",
    photo: item.photo || null,
    signature: item.emp_signature || "-",
    documents: {
      adhar_image: item.adhar_image || null,
      pan_image: item.pan_image || null,
      check_image: item.check_image || null,
    },
    members: (() => {
      try {
        let m = item.members;
        if (typeof m === "string" && m.trim() !== "") {
          let firstParse = JSON.parse(m);
          m =
            typeof firstParse === "string"
              ? JSON.parse(firstParse)
              : firstParse;
        }
        if (Array.isArray(m)) {
          return [...m, ...Array(Math.max(0, 4 - m.length)).fill({})].slice(
            0,
            4,
          );
        }
      } catch (e) {}
      return Array(4).fill({});
    })(),
    isPrinted: Number(item.print ?? 0) === 1,
    submittedAt: firstPresent(
      item.created_at,
      item.createdAt,
      item.submitted_at,
    ),
    raw: item,
  };
}

function getAppointmentRows(response) {
  const data = response?.data ?? response ?? [];
  const rows =
    data?.appointments ??
    data?.appointmentData ??
    data?.appoinments ??
    data?.data ??
    data;
  return Array.isArray(rows) ? rows.map(normalizeAppointment) : [];
}

function formatDate(value) {
  if (!value || value === "-") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const TextCell = ({ value }) => (
  <span className="text-sm text-gray-600 dark:text-gray-300">
    {value || "—"}
  </span>
);

const DateCell = ({ value }) => (
  <span className="text-sm text-gray-600 dark:text-gray-300">
    {formatDate(value)}
  </span>
);

const FamilyMembersCell = ({ value }) => {
  const list = Array.isArray(value) ? value.filter((m) => m?.name) : [];
  if (list.length === 0) {
    return <span className="text-sm text-gray-400">—</span>;
  }
  return (
    <div className="flex flex-col gap-1 py-2 text-xs leading-snug text-gray-600 dark:text-gray-300">
      {list.map((m, i) => (
        <div key={i}>
          <span className="font-semibold text-gray-800 dark:text-gray-100">
            {m.name}
          </span>
          {m.relation ? ` — ${m.relation}` : ""}
          {m.dob ? ` — DOB ${formatDate(m.dob)}` : ""}
          {m.mobile ? ` — ${m.mobile}` : ""}
          {m.occupation ? ` — ${m.occupation}` : ""}
        </div>
      ))}
    </div>
  );
};

function DocThumb({ url, label, onPreview }) {
  return (
    <button
      type="button"
      onClick={() => url && onPreview({ url, label })}
      disabled={!url}
      className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border transition ${
        url
          ? "cursor-pointer border-gray-200 hover:border-brand-400 dark:border-gray-600"
          : "cursor-default border-dashed border-gray-200 dark:border-gray-700"
      }`}
    >
      {url ? (
        <img src={url} alt={label} className="h-full w-full object-cover" />
      ) : (
        <ImageIcon size={16} className="text-gray-300 dark:text-gray-600" />
      )}
    </button>
  );
}

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

const FormRow = ({ label, value }) => (
  <div className="flex items-end gap-2 py-1">
    <label className="text-[13px] font-bold whitespace-nowrap w-[130px] shrink-0 text-black leading-normal">
      {label}
    </label>
    <span className="font-bold text-black">:</span>
    <span className="border-b border-black flex-grow min-h-[24px] pb-[3px] px-1 text-[13px] font-medium uppercase leading-normal overflow-visible whitespace-nowrap text-black">
      {value || ""}
    </span>
  </div>
);

const FormInline = ({ label, value }) => (
  <div className="flex items-end gap-2 flex-1 py-1">
    <label className="font-bold whitespace-nowrap text-[13px] text-black leading-normal">
      {label}
    </label>
    <span className="font-bold text-black">:</span>
    <span className="border-b border-black flex-1 min-h-[24px] pb-[3px] px-1 text-[13px] font-medium uppercase leading-normal overflow-visible whitespace-nowrap text-black">
      {value || ""}
    </span>
  </div>
);

const DOC_LABELS = {
  adhar_image: "Aadhar Card",
  pan_image: "PAN Card",
  check_image: "Cheque",
};

function DocLightbox({ doc, onClose }) {
  if (!doc) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-3xl w-full max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <span className="font-bold text-sm text-gray-800">{doc.label}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="overflow-auto max-h-[calc(90vh-56px)] flex items-center justify-center bg-gray-50 p-4">
          <img
            src={doc.url}
            alt={doc.label}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DocumentsSection({ documents }) {
  const [lightbox, setLightbox] = useState(null);
  const hasAny = Object.values(documents).some(Boolean);

  return (
    <>
      <DocLightbox doc={lightbox} onClose={() => setLightbox(null)} />
      <div className="mt-6 border-t border-gray-200 pt-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={15} className="text-brand-600" />
          <h3 className="text-sm font-bold text-gray-800">
            Uploaded Documents
          </h3>
        </div>
        {hasAny ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Object.entries(DOC_LABELS).map(([key, label]) => {
              const url = documents[key];
              return (
                <div key={key} className="flex flex-col">
                  <button
                    onClick={() => url && setLightbox({ url, label })}
                    disabled={!url}
                    className={`relative group rounded-xl border-2 overflow-hidden transition ${
                      url
                        ? "border-gray-200 hover:border-brand-400 cursor-pointer"
                        : "border-dashed border-gray-200 cursor-default"
                    }`}
                    style={{ aspectRatio: "4/3" }}
                  >
                    {url ? (
                      <>
                        <img
                          src={url}
                          alt={label}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <div className="bg-white rounded-full p-2 shadow">
                            <ZoomIn size={14} className="text-gray-700" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-300 gap-1 py-6">
                        <FileText size={22} />
                        <span className="text-[10px] font-semibold">
                          Not uploaded
                        </span>
                      </div>
                    )}
                  </button>
                  <span className="mt-1.5 text-center text-[11px] font-semibold text-gray-600">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">
            No documents uploaded with this form.
          </p>
        )}
      </div>
    </>
  );
}

const PrintableForm = ({ data, formRef }) => (
  <div
    ref={formRef}
    data-appointment-print-form
    className="bg-white p-6 text-black border border-dotted border-gray-600 mx-auto w-full max-w-[850px] shadow-sm"
  >
    <div className="text-center mb-0">
      <h1 className="inline-block text-xl font-black tracking-widest uppercase text-black">
        APPOINTMENT FORM
      </h1>
    </div>
    <div className="border-t-2 border-black mt-2 mb-5" />

    <div className="grid grid-cols-12 gap-6 items-start">
      <div className="col-span-5 flex flex-col items-center">
        <div className="w-44 h-56 border border-gray-400 flex items-center justify-center bg-gray-50 overflow-hidden">
          {data.photo ? (
            <img
              src={data.photo}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center text-[10px] text-gray-400 font-bold uppercase">
              NO PHOTO
            </div>
          )}
        </div>
      </div>
      <div className="col-span-7 space-y-3">
        <FormRow label="Emp. Code" value={data.empCode} />
        <FormRow label="Joining Date" value={formatDate(data.joiningDate)} />
        <FormRow label="Department" value={data.department} />
        <FormRow label="Designation" value={data.designation} />
        <FormRow label="Manager Name" value={data.managerName} />
        <FormRow label="Salary" value={data.salary} />
        <FormRow label="Emp. Mobile No" value={data.empMobile} />
        <FormRow label="Emp. Whatsapp No" value={data.empWhatsapp} />
      </div>
    </div>

    <div className="mt-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <label className="font-bold w-[130px] shrink-0 text-[13px] text-black">
          Punching No
        </label>
        <span className="font-bold text-black">:</span>
        <span className="border-b border-black w-48 min-h-[24px] pb-[3px] px-1 text-[13px] font-medium leading-normal text-black">
          {data.punchingNo}
        </span>
      </div>
      <div className="flex items-start gap-2">
        <label className="font-bold w-[130px] shrink-0 pt-1 text-[13px] text-black">
          Name
        </label>
        <span className="font-bold pt-1 text-black">:</span>
        <div className="flex-grow border-b border-black text-[13px] font-bold uppercase py-1 text-black">
          {data.fullName}
        </div>
      </div>
      <FormRow label="Email" value={data.email} />
      <FormRow label="Resident Add" value={data.address} />
      <div className="grid grid-cols-3 gap-6 w-full">
        <FormInline label="Village" value={data.village} />
        <FormInline label="Taluka" value={data.taluka} />
        <FormInline label="District" value={data.district} />
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
        <FormRow label="Birth Date" value={formatDate(data.dob)} />
        <FormRow label="Birth Place" value={data.birthPlace} />
        <FormRow label="Gender" value={data.gender} />
        <FormRow label="Cast" value={data.cast} />
        <FormRow label="Marital Status" value={data.maritalStatus} />
        <FormRow label="Blood Group" value={data.bloodGroup} />
        <FormRow label="Reference Name" value={data.refName} />
        <FormRow label="Reference Mobile" value={data.refMobile} />
        <FormRow label="Aadhar Card No" value={data.aadharNo} />
        <FormRow label="Bank Name" value={data.bankName} />
        <FormRow label="PAN Card No" value={data.panNo} />
        <FormRow label="Bank IFSC Code" value={data.ifscCode} />
        <FormRow label="Education" value={data.education} />
        <FormRow label="Bank Account No" value={data.accountNo} />
      </div>
    </div>

    <div className="mt-4">
      <table className="w-full border-collapse border border-black text-[13px] text-black">
        <thead>
          <tr className="font-bold bg-gray-50">
            <th className="border border-black p-1 w-12 text-center">Sr No</th>
            <th className="border border-black p-1">Family Members Name</th>
            <th className="border border-black p-1">Relation</th>
            <th className="border border-black p-1">D.O.B.</th>
            <th className="border border-black p-1">Mobile No</th>
            <th className="border border-black p-1">Occupation</th>
          </tr>
        </thead>
        <tbody>
          {data.members.map((member, index) => (
            <tr key={index}>
              <td className="border border-black px-1 py-1.5 text-center font-bold">
                {index + 1}
              </td>
              <td className="border border-black px-1 py-1.5 uppercase">
                {member.name || ""}
              </td>
              <td className="border border-black px-1 py-1.5 uppercase">
                {member.relation || ""}
              </td>
              <td className="border border-black px-1 py-1.5 text-center">
                {formatDate(member.dob)}
              </td>
              <td className="border border-black px-1 py-1.5 text-center">
                {member.mobile || ""}
              </td>
              <td className="border border-black px-1 py-1.5 uppercase">
                {member.occupation || ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="mt-6 grid grid-cols-3 gap-8 font-bold text-[13px] text-black">
      <div>
        <p className="mb-1">Check By, Manager</p>
        <div className="border-b border-black w-full h-8" />
      </div>
      <div className="text-center">
        <p className="mb-1">Confirm By,</p>
        <div className="border-b border-black w-full h-8" />
        <p className="mt-1 font-normal">(Ketanbhai)</p>
      </div>
      <div className="text-center">
        <p className="mb-1">Auth. By,</p>
        <div className="border-b border-black w-full h-8" />
        <p className="mt-1 font-normal">HR Dept</p>
      </div>
    </div>

    <div className="mt-6 flex justify-between items-end gap-10">
      <div className="flex gap-2 items-end flex-1">
        <span className="font-bold whitespace-nowrap uppercase text-[12px] text-black">
          UNIT NAME :
        </span>
        <span className="border-b border-black flex-grow min-h-[26px] pb-[3px] text-[13px] font-bold uppercase px-1">
          {data.unitName}
        </span>
      </div>
      <div className="flex gap-2 items-end flex-1">
        <span className="font-bold whitespace-nowrap uppercase text-[12px] text-black">
          Emp. Signature :
        </span>
        <span className="border-b border-black flex-grow min-h-[26px] pb-[3px] text-[13px] font-bold uppercase px-1">
          {data.signature}
        </span>
      </div>
    </div>
  </div>
);

export default function Appointments() {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState({});
  const [appointments, setAppointments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [gridLightbox, setGridLightbox] = useState(null);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const formRef = useRef(null);
  const gridRef = useRef(null);
  const gridContainerRef = useRef(null);
  const { dark } = useTheme();
  const { headerMenu, headerFrozen, closeHeaderMenu, toggleHeaderFrozen } =
    useGridHeaderContextMenu(gridRef, gridContainerRef);

  const loadAppointments = async () => {
    await Promise.resolve();
    setLoading(true);
    try {
      const res = await authApi.getAppointmentForms(
        user?.accessToken,
        user?.tokenType,
        companyScope,
      );
      setAppointments(getAppointmentRows(res));
    } catch (error) {
      setAppointments([]);
      toast.error(error.message || "Failed to load appointment forms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.accessToken) return undefined;
    const timer = window.setTimeout(() => {
      loadAppointments();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, scopeKey]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return appointments.filter((item) => {
      const matchesSearch =
        !query ||
        [
          item.fullName,
          item.empCode,
          item.department,
          item.empMobile,
          item.refMobile,
          item.panNo,
          item.aadharNo,
          item.unitName,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesStatus =
        statusFilter === "All" ||
        item.status.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [appointments, search, statusFilter]);

  const counts = useMemo(
    () => ({
      total: appointments.length,
      pending: appointments.filter((a) => a.status === "Pending").length,
      approved: appointments.filter((a) => a.status === "Approved").length,
      rejected: appointments.filter((a) => a.status === "Rejected").length,
    }),
    [appointments],
  );

  const handleDownloadPDF = async () => {
    if (!selected || !formRef.current) return;
    setPdfLoading(true);
    try {
      const fileName = `Appointment_${selected.fullName.replace(/\s+/g, "_")}.pdf`;
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
      toast.error("Please allow pop-ups to print the appointment form");
      return;
    }

    // Build one page per existing document
    const DOC_PRINT_FIELDS = [
      { key: "adhar_image", label: "Aadhar Card" },
      { key: "pan_image", label: "PAN Card" },
      { key: "check_image", label: "Cheque" },
    ];
    const docPages = DOC_PRINT_FIELDS.filter(
      ({ key }) => selected?.documents?.[key],
    )
      .map(
        ({ key, label }) => `
        <div class="doc-page">
          <div class="doc-page-header">
            <span class="doc-page-title">${label}</span>
            <span class="doc-page-name">${selected?.fullName || ""}</span>
          </div>
          <div class="doc-page-body">
            <img src="${selected.documents[key]}" alt="${label}" />
          </div>
          <div class="doc-page-footer">${label} — ${selected?.fullName || ""}</div>
        </div>
      `,
      )
      .join("");

    const appStyles = Array.from(
      document.querySelectorAll('link[rel="stylesheet"], style'),
    )
      .map((node) => node.outerHTML)
      .join("\n");

    win.document.write(
      `<!DOCTYPE html><html><head>
        <base href="${document.baseURI}">
        ${appStyles}
        <title>Appointment – ${selected?.fullName || ""}</title>
        <style>
          *, *::before, *::after { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: white; font-family: sans-serif; }
          [data-appointment-print-form] { box-shadow: none !important; }

          /* Document pages */
          .doc-page {
            display: flex;
            flex-direction: column;
            width: 100%;
            min-height: 100vh;
            padding: 10mm 12mm;
            page-break-before: always;
          }
          .doc-page-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-bottom: 8px;
            border-bottom: 2px solid #000;
            margin-bottom: 16px;
          }
          .doc-page-title {
            font-size: 16px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #000;
          }
          .doc-page-name {
            font-size: 12px;
            font-weight: 600;
            color: #555;
            text-transform: uppercase;
          }
          .doc-page-body {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .doc-page-body img {
            max-width: 100%;
            max-height: 220mm;
            object-fit: contain;
          }
          .doc-page-footer {
            margin-top: 12px;
            text-align: center;
            font-size: 10px;
            color: #888;
            border-top: 1px solid #ddd;
            padding-top: 6px;
          }

          @media print {
            @page { size: A4 portrait; margin: 4mm; }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            [data-appointment-print-form] {
              zoom: 0.84;
              width: 850px !important;
              max-width: none !important;
              box-shadow: none !important;
              border: 1px dotted #555 !important;
            }
            .doc-page { padding: 8mm 10mm; }
            .doc-page-body img { max-height: 240mm; }
          }
        </style>
      </head><body>${formRef.current.outerHTML}${docPages}</body></html>`,
    );
    win.document.close();

    const printWhenReady = async () => {
      await win.document.fonts?.ready;
      await Promise.all(
        Array.from(win.document.images).map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                image.onload = resolve;
                image.onerror = resolve;
              }),
        ),
      );
      win.focus();
      win.print();

      // Mark as printed in API
      try {
        await authApi.updateAppointment(
          { id: selected.id, print: 1, emp_code: selected.empCode },
          user?.accessToken,
          user?.tokenType,
        );
        loadAppointments();
      } catch (_) {
        // silent — print already happened
      }
    };

    if (win.document.readyState === "complete") {
      printWhenReady();
    } else {
      win.addEventListener("load", printWhenReady, { once: true });
    }
  };

  const handleEmpCodeUpdate = async ({ data, oldValue, newValue }) => {
    const trimmed = String(newValue ?? "").trim();
    if (trimmed === String(oldValue ?? "").trim()) return;

    setAppointments((prev) =>
      prev.map((a) => (a.id === data.id ? { ...a, empCode: trimmed } : a)),
    );

    try {
      const payload = new FormData();
      payload.append("id", data.id);
      payload.append("emp_code", trimmed);
      await authApi.updateAppointment(payload, user?.accessToken, user?.tokenType);
      toast.success("Employee code updated");
    } catch (err) {
      setAppointments((prev) =>
        prev.map((a) => (a.id === data.id ? { ...a, empCode: oldValue } : a)),
      );
      toast.error(err.message || "Failed to update employee code");
    }
  };

  const handleStatusUpdate = async (id, approve) => {
    const label = approve ? "Approved" : "Rejected";
    setStatusLoading((prev) => ({ ...prev, [id]: label }));
    try {
      const target = appointments.find((a) => a.id === id) || selected;
      await authApi.updateAppointment(
        { id, checkbox: approve ? 1 : 0, emp_code: target?.empCode },
        user?.accessToken,
        user?.tokenType,
      );
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: label } : a)),
      );
      if (selected?.id === id)
        setSelected((prev) => ({ ...prev, status: label }));
      toast.success(`Appointment ${label.toLowerCase()} successfully`);
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

  const columnDefs = useMemo(
    () => [
      {
        headerName: "Employee",
        field: "fullName",
        minWidth: 200,
        flex: 1.3,
        cellStyle: { overflow: "hidden" },
        cellRenderer: ({ data }) => (
          <div className="flex h-full min-w-0 items-center gap-3 overflow-hidden">
            <div className="h-9 w-9 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 dark:border-gray-600 flex-shrink-0">
              <img
                src={data.photo}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.target.src =
                    "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100";
                }}
              />
            </div>
            <span className="min-w-0 flex-1 truncate font-semibold text-sm text-gray-900 dark:text-white capitalize">
              {data.fullName?.toLowerCase()}
            </span>
          </div>
        ),
      },
      {
        headerName: "Emp Code",
        field: "empCode",
        minWidth: 110,
        editable: true,
        cellRenderer: ({ value }) =>
          value ? (
            <span className="font-mono text-sm font-semibold text-brand-700 dark:text-brand-300">
              {value}
            </span>
          ) : (
            <span className="text-gray-400 text-sm">—</span>
          ),
      },
      {
        headerName: "Designation",
        field: "designation",
        minWidth: 130,
        cellRenderer: TextCell,
      },
      {
        headerName: "Department",
        field: "department",
        minWidth: 120,
        cellRenderer: ({ value }) => (
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {value || "—"}
          </span>
        ),
      },
      {
        headerName: "Salary",
        field: "salary",
        width: 110,
        cellRenderer: TextCell,
      },
      {
        headerName: "Joining",
        field: "joiningDate",
        width: 140,
        cellRenderer: ({ value }) => (
          <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
            <Calendar size={12} className="text-amber-500 flex-shrink-0" />
            {formatDate(value)}
          </span>
        ),
      },
      {
        headerName: "Contact",
        field: "empMobile",
        width: 140,
        cellRenderer: ({ value }) => (
          <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
            <Phone size={12} className="text-green-500 flex-shrink-0" />
            {value || "—"}
          </span>
        ),
      },
      {
        headerName: "Whatsapp",
        field: "empWhatsapp",
        width: 130,
        cellRenderer: TextCell,
      },
      {
        headerName: "Email",
        field: "email",
        minWidth: 170,
        cellRenderer: TextCell,
      },
      {
        headerName: "Unit",
        field: "unitName",
        width: 110,
        cellRenderer: ({ value }) => (
          <Badge variant="gray">{value || "—"}</Badge>
        ),
      },
      {
        headerName: "Manager",
        field: "managerName",
        minWidth: 130,
        cellRenderer: ({ value }) => (
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {value || "—"}
          </span>
        ),
      },
      {
        headerName: "Punching No",
        field: "punchingNo",
        width: 120,
        cellRenderer: TextCell,
      },
      {
        headerName: "Address",
        field: "address",
        minWidth: 180,
        cellRenderer: TextCell,
      },
      {
        headerName: "Village",
        field: "village",
        minWidth: 120,
        cellRenderer: TextCell,
      },
      {
        headerName: "Taluka",
        field: "taluka",
        minWidth: 120,
        cellRenderer: TextCell,
      },
      {
        headerName: "District",
        field: "district",
        minWidth: 120,
        cellRenderer: TextCell,
      },
      {
        headerName: "Birth Date",
        field: "dob",
        width: 130,
        cellRenderer: DateCell,
      },
      {
        headerName: "Birth Place",
        field: "birthPlace",
        minWidth: 130,
        cellRenderer: TextCell,
      },
      {
        headerName: "Gender",
        field: "gender",
        width: 100,
        cellRenderer: TextCell,
      },
      {
        headerName: "Cast",
        field: "cast",
        width: 110,
        cellRenderer: TextCell,
      },
      {
        headerName: "Marital Status",
        field: "maritalStatus",
        width: 130,
        cellRenderer: TextCell,
      },
      {
        headerName: "Blood Group",
        field: "bloodGroup",
        width: 110,
        cellRenderer: TextCell,
      },
      {
        headerName: "Reference Name",
        field: "refName",
        minWidth: 140,
        cellRenderer: TextCell,
      },
      {
        headerName: "Reference Mobile",
        field: "refMobile",
        width: 140,
        cellRenderer: TextCell,
      },
      {
        headerName: "Aadhar No",
        field: "aadharNo",
        width: 140,
        cellRenderer: TextCell,
      },
      {
        headerName: "PAN No",
        field: "panNo",
        width: 120,
        cellRenderer: TextCell,
      },
      {
        headerName: "Bank Name",
        field: "bankName",
        minWidth: 140,
        cellRenderer: TextCell,
      },
      {
        headerName: "Account No",
        field: "accountNo",
        width: 150,
        cellRenderer: TextCell,
      },
      {
        headerName: "IFSC Code",
        field: "ifscCode",
        width: 120,
        cellRenderer: TextCell,
      },
      {
        headerName: "Education",
        field: "education",
        minWidth: 130,
        cellRenderer: TextCell,
      },
      {
        headerName: "Signature",
        field: "signature",
        minWidth: 130,
        cellRenderer: TextCell,
      },
      {
        headerName: "Family Members",
        field: "members",
        minWidth: 320,
        autoHeight: true,
        wrapText: true,
        cellStyle: { whiteSpace: "normal", overflow: "visible" },
        cellRenderer: FamilyMembersCell,
      },
      {
        headerName: "Aadhar Image",
        field: "documents",
        colId: "adharImage",
        width: 110,
        sortable: false,
        filter: false,
        cellRenderer: ({ data }) => (
          <DocThumb
            url={data.documents?.adhar_image}
            label="Aadhar Card"
            onPreview={setGridLightbox}
          />
        ),
      },
      {
        headerName: "PAN Image",
        field: "documents",
        colId: "panImage",
        width: 110,
        sortable: false,
        filter: false,
        cellRenderer: ({ data }) => (
          <DocThumb
            url={data.documents?.pan_image}
            label="PAN Card"
            onPreview={setGridLightbox}
          />
        ),
      },
      {
        headerName: "Cheque Image",
        field: "documents",
        colId: "chequeImage",
        width: 110,
        sortable: false,
        filter: false,
        cellRenderer: ({ data }) => (
          <DocThumb
            url={data.documents?.check_image}
            label="Cheque"
            onPreview={setGridLightbox}
          />
        ),
      },
      {
        headerName: "Status",
        field: "status",
        width: 120,
        cellRenderer: ({ value }) => <StatusBadge status={value} />,
      },
      {
        headerName: "Print",
        field: "isPrinted",
        width: 130,
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
        width: 270,
        sortable: false,
        filter: false,
        cellRenderer: ({ data }) => (
          <div className="flex items-center gap-1.5 h-full">
            <Button
              size="sm"
              variant="secondary"
              icon={<Eye size={13} />}
              onClick={() => setSelected(data)}
            >
              View
            </Button>
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
          </div>
        ),
      },
    ],
    [statusLoading, handleStatusUpdate, setGridLightbox],
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

  return (
    <div className="space-y-5">
      <DocLightbox doc={gridLightbox} onClose={() => setGridLightbox(null)} />
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/30">
            <ClipboardList size={18} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Appointment Forms
            </h1>
            <p className="text-xs text-gray-400">
              Review, approve or reject submitted appointment forms
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            onClick={() => setAddFormOpen(true)}
            icon={<Plus size={14} />}
          >
            New Appointment
          </Button>
          <Button
            variant="secondary"
            onClick={loadAppointments}
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

      {/* Table */}
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
              rowData={filtered}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              getRowId={(params) => String(params.data.id)}
              domLayout="autoHeight"
              rowHeight={58}
              headerHeight={48}
              popupParent={document.body}
              enableCellTextSelection
              animateRows
              singleClickEdit
              onCellValueChanged={(params) => {
                if (params.colDef.field === "empCode") handleEmpCodeUpdate(params);
              }}
              overlayNoRowsTemplate="<span class='text-gray-400 text-sm'>No appointment forms found</span>"
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

      {/* Detail Modal */}
      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={
          <div className="flex items-center gap-3">
            <span>Appointment Details</span>
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
            <div className="flex flex-wrap justify-between items-center gap-3">
              {/* Status actions — left side */}
              <div className="flex items-center gap-2">
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
              </div>
              {/* Document actions — right side */}
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setSelected(null)}>
                  Close
                </Button>
                <button
                  onClick={() => {
                    setSelected(null);
                    setEditTarget(selected);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-brand-300 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition shadow-sm"
                >
                  <Pencil size={14} />
                  Edit
                </button>
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition shadow-sm"
                >
                  <Printer size={14} />
                  Print
                </button>
                <button
                  onClick={handleDownloadPDF}
                  disabled={pdfLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 dark:bg-gray-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 dark:hover:bg-gray-500 disabled:opacity-50 transition shadow-sm"
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
        {selected && (
          <>
            <PrintableForm data={selected} formRef={formRef} />
            <DocumentsSection documents={selected.documents} />
          </>
        )}
      </Modal>

      <AppointmentModal
        isOpen={addFormOpen}
        onClose={() => {
          setAddFormOpen(false);
          loadAppointments();
        }}
      />

      <AppointmentModal
        isOpen={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        initialData={editTarget}
        onSuccess={() => {
          setEditTarget(null);
          loadAppointments();
        }}
      />
    </div>
  );
}
