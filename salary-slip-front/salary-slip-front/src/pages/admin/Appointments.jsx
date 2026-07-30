import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import GridHeaderContextMenu from "../../components/ui/GridHeaderContextMenu";
import useGridHeaderContextMenu from "../../hooks/useGridHeaderContextMenu";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";
import { getEmployeePhotoUrl } from "./AdminModals/EmployeeHelpers";
import { getAadhaarDisplayValue, isCompleteAadhaar } from "../../utils/aadhaar";

ModuleRegistry.registerModules([AllCommunityModule]);
import {
  Calendar,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
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
  Trash2,
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
import PrintableForm from "../../components/forms/PrintableForm";
import { exportNodeToPdf } from "../../utils/pdfUtils";
import AppointmentModal from "../auth/AppointmentModal";
import {
  readAppointmentRouteState,
  clearAppointmentRouteState,
} from "../auth/appointmentRouteState";
import { getCompanyUnits } from "../../config/companyConfig";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white";

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? "";
}

function normalizeAppointment(item, index) {
  let displayStatus;
  const isApproved = Boolean(item.emp_code) || Number(item.checkbox) === 1 || String(item.status) === '1' || item.status === 'Approved';
  
  if (isApproved) {
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
    // The complete number, grouped in fours. The list endpoint returns
    // aadhaar_full for every row inside the caller's company and unit scope, so
    // this column shows the same value the details page does — one rule, no
    // screen-by-screen divergence.
    aadharNo: getAadhaarDisplayValue(item),
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
    agentName: firstPresent(item.agent?.name, item.agent?.email, "Admin"),
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
      account_book: item.account_book || null,
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
      } catch {
        // Legacy rows store members in inconsistent shapes; fall through to
        // the blank set below rather than failing the whole list.
      }
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
  // Documents are stored as relative paths like "uploads/documents/x.jpg", so
  // they need the same base-URL resolution as photos. Rendering the raw value
  // resolved it against the current route instead, and a legacy temp path
  // ("C:\…\phpXXXX.tmp") became a blocked file:/// request.
  const src = getEmployeePhotoUrl(url);

  return (
    <button
      type="button"
      onClick={() => src && onPreview({ url: src, label })}
      disabled={!src}
      className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border transition ${
        src
          ? "cursor-pointer border-gray-200 hover:border-brand-400 dark:border-gray-600"
          : "cursor-default border-dashed border-gray-200 dark:border-gray-700"
      }`}
    >
      {src ? (
        <img src={src} alt={label} className="h-full w-full object-cover" />
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

const DOC_LABELS = {
  adhar_image: "Aadhar Card",
  pan_image: "PAN Card",
  check_image: "Cheque",
  account_book: "Bank Passbook",
};

/**
 * Documents may be PDFs as well as images. The extension has to be read from
 * the URL path, not the whole string — a presigned URL carries a query string
 * after it.
 */
function isPdfUrl(url) {
  if (!url) return false;
  const path = String(url).split("?")[0].split("#")[0];
  return path.toLowerCase().endsWith(".pdf");
}

function DocLightbox({ doc, onClose }) {
  if (!doc) return null;
  return createPortal(
    <div
      className="modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
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
          {isPdfUrl(doc.url) ? (
            <iframe
              src={doc.url}
              title={doc.label}
              className="w-full h-[80vh] border-0 rounded-lg bg-white"
            />
          ) : (
            <img
              src={doc.url}
              alt={doc.label}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DocumentsSection({ documents }) {
  const [lightbox, setLightbox] = useState(null);

  // Stored values are S3 object keys (or legacy uploads/… paths); resolve them
  // to a usable URL up front so both the thumbnail and the lightbox get the
  // same one, and a server-local path renders as "not uploaded" rather than a
  // broken image.
  const resolved = Object.fromEntries(
    Object.keys(DOC_LABELS).map((key) => [key, getEmployeePhotoUrl(documents[key])]),
  );
  const hasAny = Object.values(resolved).some(Boolean);

  return (
    <>
      <DocLightbox doc={lightbox} onClose={() => setLightbox(null)} />
      <div className="mt-6 border-t border-gray-200 pt-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 mb-4">
          <FileText size={15} className="text-brand-600" />
          <h3 className="text-sm font-bold text-gray-800">
            Uploaded Documents
          </h3>
        </div>
        {hasAny ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Object.entries(DOC_LABELS).map(([key, label]) => {
              const url = resolved[key];
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
                        {isPdfUrl(url) ? (
                          // A PDF cannot render in an <img>; show a document
                          // tile that still opens in the viewer on click.
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-red-50 text-red-600">
                            <FileText size={22} />
                            <span className="text-[10px] font-bold">PDF</span>
                          </div>
                        ) : (
                          <img
                            src={url}
                            alt={label}
                            className="w-full h-full object-cover"
                          />
                        )}
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

const DetailItem = ({ label, value }) => (
  <div className="flex flex-col gap-1 px-4 py-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-100/50 dark:border-gray-700/30">
    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{label}</span>
    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{value || "—"}</span>
  </div>
);

const FamilyCard = ({ member, index }) => (
  <div className="flex flex-col gap-2.5 p-4 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-100 dark:border-gray-700/50">
    <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-1.5">
      <span className="text-[10px] font-bold text-gray-400 uppercase">Member #{index + 1}</span>
      {member.relation && <Badge variant="gray" className="capitalize">{member.relation}</Badge>}
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <p className="text-[9px] text-gray-400 font-bold uppercase">Name</p>
        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 capitalize">{member.name?.toLowerCase() || "—"}</p>
      </div>
      <div>
        <p className="text-[9px] text-gray-400 font-bold uppercase">Occupation</p>
        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 capitalize">{member.occupation || "—"}</p>
      </div>
      <div>
        <p className="text-[9px] text-gray-400 font-bold uppercase">D.O.B.</p>
        <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{formatDate(member.dob)}</p>
      </div>
      <div>
        <p className="text-[9px] text-gray-400 font-bold uppercase">Mobile</p>
        <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{member.mobile || "—"}</p>
      </div>
    </div>
  </div>
);

const ResponsiveDetailsForm = ({ data }) => {
  const activeMembers = Array.isArray(data.members) ? data.members.filter(m => m.name) : [];
  
  return (
    <div className="space-y-6">
      {/* Top Profile Card */}
      <div className="flex flex-col sm:flex-row items-center gap-5 p-5 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-gray-800">
        <div className="w-24 h-32 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-100 dark:bg-gray-800 overflow-hidden flex-shrink-0">
          {data.photo ? (
            <img src={data.photo} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-gray-400">NO PHOTO</span>
          )}
        </div>
        <div className="text-center sm:text-left min-w-0 flex-1">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white capitalize">{data.fullName?.toLowerCase()}</h2>
          <p className="text-sm font-semibold text-brand-600 dark:text-brand-400 mt-1">{data.designation} · {data.department}</p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
            <Badge variant="gray">Code: {data.empCode || "N/A"}</Badge>
            <Badge variant="gray">Punching: {data.punchingNo || "N/A"}</Badge>
            <Badge variant="gray">Unit: {data.unitName || "N/A"}</Badge>
            <Badge variant={data.agentName === "Admin" ? "gray" : "blue"}>
              Added By: {data.agentName || "N/A"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Grid of details */}
      <div>
        <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Employment & Personal Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <DetailItem label="Joining Date" value={formatDate(data.joiningDate)} />
          <DetailItem label="Manager Name" value={data.managerName} />
          <DetailItem label="Salary" value={data.salary} />
          <DetailItem label="Emp. Mobile" value={data.empMobile} />
          <DetailItem label="Emp. Whatsapp" value={data.empWhatsapp} />
          <DetailItem label="Email" value={data.email} />
          <DetailItem label="Birth Date" value={formatDate(data.dob)} />
          <DetailItem label="Birth Place" value={data.birthPlace} />
          <DetailItem label="Gender" value={data.gender} />
          <DetailItem label="Cast" value={data.cast} />
          <DetailItem label="Marital Status" value={data.maritalStatus} />
          <DetailItem label="Blood Group" value={data.bloodGroup} />
          <DetailItem label="Reference Name" value={data.refName} />
          <DetailItem label="Reference Mobile" value={data.refMobile} />
          <DetailItem label="Aadhaar Card No" value={data.aadharNo} />
          <DetailItem label="PAN Card No" value={data.panNo} />
          <DetailItem label="Bank Name" value={data.bankName} />
          <DetailItem label="Bank Account No" value={data.accountNo} />
          <DetailItem label="Bank IFSC Code" value={data.ifscCode} />
          <DetailItem label="Education" value={data.education} />
        </div>
      </div>

      {/* Address */}
      <div>
        <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Residential Address</h3>
        <div className="p-4 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-100 dark:border-gray-850">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{data.address || "N/A"}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2.5 text-xs text-gray-400 font-medium">
            <span>Village: {data.village || "—"}</span>
            <span>Taluka: {data.taluka || "—"}</span>
            <span>District: {data.district || "—"}</span>
          </div>
        </div>
      </div>

      {/* Family Members */}
      <div>
        <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Family Members</h3>
        {activeMembers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {activeMembers.map((m, i) => (
              <FamilyCard key={i} member={m} index={i} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No family members registered.</p>
        )}
      </div>
    </div>
  );
};

function CreateCandidateModal({ isOpen, onClose, onSuccess }) {
  const { user } = useAuth();
  const { companyOptions } = useCompany();
  const [formData, setFormData] = useState({ name: "", email: "", mobile_number: "", password: "", company_code: "", unit: "" });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState(null);

  // Depend on the credentials rather than the `user` object: AuthProvider passes
  // an inline object literal as its context value, so `user` is a new reference
  // on every provider render and would re-fetch the agent list each time.
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  const loadAgents = useCallback(async () => {
    try {
      const res = await authApi.getAgents(accessToken, tokenType);
      setAgents(res.data || []);
    } catch {
      toast.error("Failed to load agents");
    } finally {
      setAgentsLoading(false);
    }
  }, [accessToken, tokenType]);

  /** Reload after a create/update/delete, with the spinner. */
  const fetchAgents = useCallback(() => {
    setAgentsLoading(true);
    loadAgents();
  }, [loadAgents]);

  // Reset the form when the modal opens. Assigning state during render is the
  // supported way to reset on a prop change; from an effect body it renders the
  // previous values first and only then replaces them.
  const [wasOpen, setWasOpen] = useState(false);

  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setEditingAgentId(null);
      setFormData({ name: "", email: "", mobile_number: "", password: "", company_code: "", unit: "" });
      setAgentsLoading(true);
    }
  }

  useEffect(() => {
    if (!isOpen) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const res = await authApi.getAgents(accessToken, tokenType);
        if (cancelled) return;
        setAgents(res.data || []);
      } catch {
        if (!cancelled) toast.error("Failed to load agents");
      } finally {
        if (!cancelled) setAgentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, accessToken, tokenType]);

  const availableUnits = formData.company_code ? getCompanyUnits(formData.company_code) : [];

  const handleEditAgent = (agent) => {
    setEditingAgentId(agent.id);
    setFormData({
      name: agent.name || "",
      email: agent.email || "",
      mobile_number: agent.mobile_number || "",
      password: "",
      company_code: agent.company_code || "",
      unit: agent.unit || "",
    });
  };

  const handleDeleteAgent = async (id) => {
    if (!window.confirm("Are you sure you want to delete this agent?")) return;
    try {
      await authApi.deleteAgent(id, user?.accessToken, user?.tokenType);
      toast.success("Agent deleted successfully");
      fetchAgents();
      if (editingAgentId === id) {
        setEditingAgentId(null);
        setFormData({ name: "", email: "", mobile_number: "", password: "", company_code: "", unit: "" });
      }
    } catch (error) {
      toast.error(error.message || "Failed to delete agent");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.mobile_number || (!editingAgentId && !formData.password) || !formData.company_code) {
      return toast.error("All required fields must be filled");
    }

    const exists = agents.some(a => 
      a.id !== editingAgentId && 
      (a.email === formData.email || a.mobile_number === formData.mobile_number)
    );
    if (exists) {
        return toast.error("An agent with this email or mobile number already exists.");
    }

    setLoading(true);
    try {
      if (editingAgentId) {
        await authApi.updateAgent(editingAgentId, formData, user?.accessToken, user?.tokenType);
        toast.success("Agent account updated successfully");
      } else {
        await authApi.createCandidateAccount(formData, user?.accessToken, user?.tokenType);
        toast.success("Candidate account created successfully");
      }
      
      setFormData({ name: "", email: "", mobile_number: "", password: "", company_code: "", unit: "" });
      setEditingAgentId(null);
      fetchAgents();
      
      onSuccess();
    } catch (error) {
      toast.error(error.message || "Failed to save account");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingAgentId ? "Edit Candidate Account" : "Create Candidate Account"} size="xl">
      <div className="flex flex-col md:flex-row gap-6">
        <form onSubmit={handleSubmit} className="flex-1 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className={inputCls}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              className={inputCls}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Mobile Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className={inputCls}
              value={formData.mobile_number}
              onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              placeholder="9876543210"
              maxLength={10}
              inputMode="numeric"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password {editingAgentId ? "" : <span className="text-red-500">*</span>}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className={inputCls}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={editingAgentId ? "Leave blank to keep unchanged" : "Min. 6 characters"}
                required={!editingAgentId}
                minLength={6}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Company <span className="text-red-500">*</span>
            </label>
            <select
              className={inputCls}
              value={formData.company_code}
              onChange={(e) => setFormData({ ...formData, company_code: e.target.value, unit: "" })}
              required
            >
              <option value="">Select Company</option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>{company.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Branch (leave blank for all branches)
            </label>
            <select
              className={inputCls}
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              disabled={!formData.company_code}
            >
              <option value="">Select Branch</option>
              {availableUnits.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
            {editingAgentId && (
              <Button variant="outline" onClick={() => {
                setEditingAgentId(null);
                setFormData({ name: "", email: "", mobile_number: "", password: "", company_code: "", unit: "" });
              }} type="button">Cancel Edit</Button>
            )}
            <Button variant="secondary" onClick={onClose} type="button">Close</Button>
            <Button variant="primary" type="submit" disabled={loading} icon={loading ? <Loader2 className="animate-spin" size={16} /> : null}>
              {loading ? "Saving..." : (editingAgentId ? "Update Account" : "Create Account")}
            </Button>
          </div>
        </form>

        <div className="w-full md:w-72 border-t md:border-t-0 md:border-l border-gray-100 dark:border-gray-700 pt-4 md:pt-0 md:pl-6 flex flex-col">
          <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200 mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">Existing Agents</h4>
          <div className="flex-1 overflow-y-auto max-h-[50vh] pr-2 space-y-3">
            {agentsLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="animate-spin text-gray-400" size={20} /></div>
            ) : agents.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No agents found</p>
            ) : (
              agents.map(agent => (
                <div key={agent.id} className={`p-3 rounded-xl border relative group transition-colors ${editingAgentId === agent.id ? "bg-blue-50/50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800" : "bg-gray-50 dark:bg-gray-700/40 border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500"}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{agent.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{agent.email}</p>
                      <p className="text-xs text-gray-500">{agent.mobile_number}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button type="button" onClick={() => handleEditAgent(agent)} className="p-1.5 text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-lg" title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => handleDeleteAgent(agent.id)} className="p-1.5 text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/50 rounded-lg" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {agent.company_code && (
                    <Badge variant="gray" className="mt-2 text-[10px] block w-fit">
                      {agent.company_code === 'all-companies' 
                        ? 'All Companies' 
                        : `${agent.company_code}${agent.unit ? ` - ${agent.unit}` : ''}`}
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function Appointments() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState({});
  const [appointments, setAppointments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [gridLightbox, setGridLightbox] = useState(null);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  /**
   * Reopen the appointment modal when the URL carries ?appointmentId=.
   *
   * AppointmentModal already restores its own step from the URL, but that code
   * cannot run unless the modal is mounted — so after a refresh the recovery
   * never happened and the user landed back on the list. Only the id is passed;
   * the modal fetches the record itself.
   *
   * Reuses editTarget rather than adding parallel modal state, so there is only
   * ever one modal instance.
   */
  useEffect(() => {
    const restoreFromUrl = () => {
      const { appointmentId } = readAppointmentRouteState();

      if (!appointmentId) return;

      setEditTarget((current) =>
        // Already showing this appointment — don't remount and refetch, which
        // is what would turn an invalid id into a reopen loop.
        String(current?.id ?? "") === String(appointmentId)
          ? current
          : { id: Number(appointmentId) || appointmentId },
      );
    };

    restoreFromUrl();
    window.addEventListener("popstate", restoreFromUrl);

    return () => window.removeEventListener("popstate", restoreFromUrl);
  }, []);
  // No search box or status dropdown exists on this page, so these are fixed.
  // Re-introduce state here if those controls are added back.
  const search = "";
  const statusFilter = "All";
  const [visibleColumns, setVisibleColumns] = useState([
    "fullName", "designation", "department", "joiningDate",
    "managerName", "unitName", "agentName", "status", "isPrinted",
  ]);
  const [showColModal, setShowColModal] = useState(false);

  /*
   * There is no separate "revealed Aadhaar" state any more.
   *
   * The list response carries aadhaar_full for every row the caller may see, so
   * the number arrives with the row and lives in `appointments` alongside every
   * other field. Nothing is fetched on demand, nothing is timed out, and nothing
   * is written to localStorage, sessionStorage, IndexedDB, the URL or any
   * analytics payload — it exists only in component state for as long as the page
   * is mounted.
   */
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

  /**
   * The one view model behind Appointment Details, Print and PDF.
   *
   * `selected.aadharNo` already holds the formatted complete number from the list
   * row, so screen, paper and PDF cannot disagree and none of them is assembled
   * from whatever text happens to be in the DOM.
   */
  const detailsView = useMemo(() => {
    if (!selected) return null;

    return {
      ...selected,
      // Marks output that carries a complete identity number. Not a permission
      // check — anyone reading this page is already authorised — but a sheet found
      // on a desk should say what it is.
      containsFullAadhaar: isCompleteAadhaar(selected.aadharNo),
      printedBy: user?.name || "",
    };
  }, [selected, user?.name]);

  /**
   * The appointment PDF, rendered from the same view model as the screen.
   *
   * The record reference is the filename — never the Aadhaar, which would put an
   * identity number into download histories, chat messages and backup indexes.
   */
  const handleDownloadPDF = async () => {
    if (!selected || !formRef.current) return;

    setPdfLoading(true);
    try {
      const reference =
        selected.appointmentNumber || `APT-${String(selected.id).padStart(6, "0")}`;

      await exportNodeToPdf(formRef.current, `Appointment_${reference}.pdf`, {
        fitToOnePage: true,
      });
      toast.success("Form downloaded successfully");
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const openPrintWindow = (node) => {
    if (!node) return;

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
      // Enumerating stylesheets can throw on cross-origin sheets; the print
      // view degrades to unstyled rather than not opening at all.
    }
    const appStyles = `<style>${cssText}</style>`;

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
              /* 0.84 still overflowed a single A4 page for most real
                 submissions (longer address/family-member rows push it
                 past one sheet), stranding the unit/signature line alone
                 on a second, otherwise-blank page. 0.72 leaves enough
                 headroom to fit reliably on one page. */
              zoom: 0.72;
              width: 850px !important;
              max-width: none !important;
              box-shadow: none !important;
              border: 1px dotted #555 !important;
            }
            .doc-page { padding: 8mm 10mm; }
            .doc-page-body img { max-height: 240mm; }
          }
        </style>
      </head><body>${node.outerHTML}${docPages}</body></html>`,
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

  /**
   * Print the appointment form.
   *
   * One path. The hidden form renders the same view model as the screen, so the
   * printed sheet carries the complete number exactly as the details page shows
   * it — there is no masked variant to choose between and no separate
   * authorisation, because opening this record was the authorisation.
   */
  const handlePrint = () => {
    if (!selected) return;

    openPrintWindow(formRef.current);
  };

  // Memoised because the grid's column definitions close over it: as a plain
  // function it was a new reference every render, so the useMemo that builds the
  // columns re-ran on every render and rebuilt the whole grid definition.
  const handleStatusUpdate = useCallback(async (id, approve) => {
    const label = approve ? "Approved" : "Rejected";
    setStatusLoading((prev) => ({ ...prev, [id]: label }));
    try {
      const target = appointments.find((a) => a.id === id) || selected;
      await authApi.updateAppointment(
        { id, checkbox: approve ? 1 : 0, emp_code: target?.empCode },
        user?.accessToken,
        user?.tokenType,
      );
      if (approve) {
        setAppointments((prev) => prev.filter((a) => a.id !== id));
        if (selected?.id === id) setSelected(null);
      } else {
        setAppointments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: label } : a)),
        );
        if (selected?.id === id) setSelected((prev) => ({ ...prev, status: label }));
      }
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
  }, [appointments, selected, user]);

  const allColumns = useMemo(() => [
    { field: "fullName", label: "Employee" },
    { field: "designation", label: "Designation" },
    { field: "department", label: "Department" },
    { field: "salary", label: "Salary" },
    { field: "joiningDate", label: "Joining Date" },
    { field: "empMobile", label: "Contact" },
    { field: "empWhatsapp", label: "Whatsapp" },
    { field: "email", label: "Email" },
    { field: "unitName", label: "Branch" },
    { field: "agentName", label: "Added By" },
    { field: "managerName", label: "Manager" },
    { field: "punchingNo", label: "Punching No" },
    { field: "address", label: "Address" },
    { field: "village", label: "Village" },
    { field: "taluka", label: "Taluka" },
    { field: "district", label: "District" },
    { field: "dob", label: "Birth Date" },
    { field: "birthPlace", label: "Birth Place" },
    { field: "gender", label: "Gender" },
    { field: "cast", label: "Cast" },
    { field: "maritalStatus", label: "Marital Status" },
    { field: "bloodGroup", label: "Blood Group" },
    { field: "refName", label: "Reference Name" },
    { field: "refMobile", label: "Reference Mobile" },
    { field: "aadharNo", label: "Aadhar No" },
    { field: "panNo", label: "PAN No" },
    { field: "bankName", label: "Bank Name" },
    { field: "accountNo", label: "Account No" },
    { field: "ifscCode", label: "IFSC Code" },
    { field: "education", label: "Education" },
    { field: "signature", label: "Signature" },
    { field: "members", label: "Family Members" },
    { field: "adharImage", label: "Aadhar Image" },
    { field: "panImage", label: "PAN Image" },
    { field: "chequeImage", label: "Cheque Image" },
    { field: "status", label: "Status" },
    { field: "isPrinted", label: "Print" },
  ], []);

  const toggleColumnVisibility = (field) => {
    setVisibleColumns((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const columnDefs = useMemo(() => {
    if (isMobile) {
      return [
        {
          headerName: "Appointment Record",
          field: "mobileDetails",
          flex: 1,
          cellRenderer: ({ data }) => {
            if (!data) return null;
            return (
              <div className="flex flex-col justify-center py-2 gap-2 h-full w-full">
                <div className="flex justify-between items-center w-full pr-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="h-7 w-7 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 dark:border-gray-600 flex-shrink-0">
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
                </div>
                <div className="flex items-center justify-between gap-2 w-full pr-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <button
                      onClick={() => setSelected(data)}
                      className="flex min-w-0 flex-1 justify-center items-center gap-1.5 rounded-lg bg-brand-50 px-2 py-2 text-xs font-semibold text-brand-600 transition hover:bg-brand-100 min-h-[36px]"
                    >
                      <Eye size={13} />
                      View
                    </button>
                    {user?.role !== 'agent' && (
                      <>
                        <button
                          onClick={() => handleStatusUpdate(data.id, true)}
                          disabled={
                            Boolean(statusLoading[data.id]) || data.status === "Approved"
                          }
                          className={`flex min-w-0 flex-1 justify-center items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition min-h-[36px] ${
                            data.status === "Approved"
                              ? "bg-green-600 text-white cursor-default"
                              : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 disabled:opacity-50"
                          }`}
                        >
                          {statusLoading[data.id] === "Approved" ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={13} />
                          )}
                          Approve
                        </button>
                        <button
                          onClick={() => handleStatusUpdate(data.id, false)}
                          disabled={
                            Boolean(statusLoading[data.id]) || data.status === "Rejected"
                          }
                          className={`flex min-w-0 flex-1 justify-center items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition min-h-[36px] ${
                            data.status === "Rejected"
                              ? "bg-red-600 text-white cursor-default"
                              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 disabled:opacity-50"
                          }`}
                        >
                          {statusLoading[data.id] === "Rejected" ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <XCircle size={13} />
                          )}
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                  <StatusBadge status={data.status} />
                </div>
              </div>
            );
          },
        },
      ];
    }

    return [
      {
        headerName: "Employee",
        field: "fullName",
        minWidth: 200,
        flex: 1.3,
        hide: !visibleColumns.includes("fullName"),
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
        headerName: "Designation",
        field: "designation",
        minWidth: 130,
        hide: !visibleColumns.includes("designation"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Department",
        field: "department",
        minWidth: 120,
        hide: !visibleColumns.includes("department"),
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
        hide: !visibleColumns.includes("salary"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Joining",
        field: "joiningDate",
        width: 140,
        hide: !visibleColumns.includes("joiningDate"),
        cellRenderer: ({ value }) => (
          <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
            <Calendar size={12} className="text-amber-500 flex-shrink-0" />
            {formatDate(value)}
          </span>
        ),
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
        headerName: "Contact",
        field: "empMobile",
        width: 140,
        hide: !visibleColumns.includes("empMobile"),
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
        hide: !visibleColumns.includes("empWhatsapp"),
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
        headerName: "Unit",
        field: "unitName",
        width: 110,
        hide: !visibleColumns.includes("unitName"),
        cellRenderer: ({ value }) => (
          <Badge variant="gray">{value || "—"}</Badge>
        ),
      },
      {
        headerName: "Added By",
        field: "agentName",
        minWidth: 140,
        hide: !visibleColumns.includes("agentName"),
        cellRenderer: ({ value }) => (
          <Badge variant={value === "Admin" ? "gray" : "blue"}>
            {value || "—"}
          </Badge>
        ),
      },
      {
        headerName: "Punching No",
        field: "punchingNo",
        width: 120,
        hide: !visibleColumns.includes("punchingNo"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Address",
        field: "address",
        minWidth: 180,
        hide: !visibleColumns.includes("address"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Village",
        field: "village",
        minWidth: 120,
        hide: !visibleColumns.includes("village"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Taluka",
        field: "taluka",
        minWidth: 120,
        hide: !visibleColumns.includes("taluka"),
        cellRenderer: TextCell,
      },
      {
        headerName: "District",
        field: "district",
        minWidth: 120,
        hide: !visibleColumns.includes("district"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Birth Date",
        field: "dob",
        width: 130,
        hide: !visibleColumns.includes("dob"),
        cellRenderer: DateCell,
      },
      {
        headerName: "Birth Place",
        field: "birthPlace",
        minWidth: 130,
        hide: !visibleColumns.includes("birthPlace"),
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
        headerName: "Cast",
        field: "cast",
        width: 110,
        hide: !visibleColumns.includes("cast"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Marital Status",
        field: "maritalStatus",
        width: 130,
        hide: !visibleColumns.includes("maritalStatus"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Blood Group",
        field: "bloodGroup",
        width: 110,
        hide: !visibleColumns.includes("bloodGroup"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Reference Name",
        field: "refName",
        minWidth: 140,
        hide: !visibleColumns.includes("refName"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Reference Mobile",
        field: "refMobile",
        width: 140,
        hide: !visibleColumns.includes("refMobile"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Aadhar No",
        field: "aadharNo",
        width: 140,
        hide: !visibleColumns.includes("aadharNo"),
        cellRenderer: TextCell,
      },
      {
        headerName: "PAN No",
        field: "panNo",
        width: 120,
        hide: !visibleColumns.includes("panNo"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Bank Name",
        field: "bankName",
        minWidth: 140,
        hide: !visibleColumns.includes("bankName"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Account No",
        field: "accountNo",
        width: 150,
        hide: !visibleColumns.includes("accountNo"),
        cellRenderer: TextCell,
      },
      {
        headerName: "IFSC Code",
        field: "ifscCode",
        width: 120,
        hide: !visibleColumns.includes("ifscCode"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Education",
        field: "education",
        minWidth: 130,
        hide: !visibleColumns.includes("education"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Signature",
        field: "signature",
        minWidth: 130,
        hide: !visibleColumns.includes("signature"),
        cellRenderer: TextCell,
      },
      {
        headerName: "Family Members",
        field: "members", valueFormatter: () => "Data",
        minWidth: 320,
        autoHeight: true,
        wrapText: true,
        hide: !visibleColumns.includes("members"),
        cellStyle: { whiteSpace: "normal", overflow: "visible" },
        cellRenderer: FamilyMembersCell,
      },
      {
        headerName: "Aadhar Image",
        colId: "adharImage",
        valueGetter: () => "",
        width: 110,
        sortable: false,
        filter: false,
        hide: !visibleColumns.includes("adharImage"),
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
        colId: "panImage",
        valueGetter: () => "",
        width: 110,
        sortable: false,
        filter: false,
        hide: !visibleColumns.includes("panImage"),
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
        colId: "chequeImage",
        valueGetter: () => "",
        width: 110,
        sortable: false,
        filter: false,
        hide: !visibleColumns.includes("chequeImage"),
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
        width: user?.role === 'agent' ? 100 : 270,
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
            {user?.role !== 'agent' && (
              <>
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
              </>
            )}
          </div>
        ),
      },
    ];
  }, [statusLoading, handleStatusUpdate, setGridLightbox, isMobile, user?.role, visibleColumns]);

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
              {user?.role === 'agent' 
                ? "View and create appointment forms" 
                : "Review, approve or reject submitted appointment forms"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user?.role !== 'agent' && (
            <Button
              variant="outline"
              onClick={() => setCreateAccountOpen(true)}
              icon={<Plus size={14} />}
            >
              Create Account
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => setAddFormOpen(true)}
            icon={<Plus size={14} />}
          >
            New Appointment
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
              key={isMobile ? "mobile" : "desktop"}
              ref={gridRef}
              rowData={filtered}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              getRowId={(params) => String(params.data.id)}
              domLayout="autoHeight"
              rowHeight={isMobile ? 84 : 58}
              headerHeight={48}
              popupParent={document.body}
              enableCellTextSelection
              animateRows
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
          <div className="flex flex-wrap items-center gap-2">
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
            <div className="flex flex-wrap justify-between items-center gap-3 w-full">
              {/* Status actions — left side */}
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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
              </div>
              {/* Document actions — right side */}
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
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
            {/* Print and PDF both copy from here, and it renders the same view
                model as the visible form below — so paper, PDF and screen always
                agree, and all three carry the complete number. */}
            <div className="hidden" aria-hidden="true">
              <PrintableForm data={detailsView} formRef={formRef} />
            </div>

            <div className="hidden md:flex justify-center overflow-x-auto bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
              <div className="scale-[0.85] sm:scale-[0.95] md:scale-100 origin-top flex items-center justify-center min-w-[max-content] pb-4">
                <PrintableForm data={detailsView} />
              </div>
            </div>

            {/* Mobile View: Beautiful, responsive dashboard layout details form */}
            <div className="block md:hidden">
              <ResponsiveDetailsForm data={detailsView} />
            </div>

            <DocumentsSection documents={selected.documents} />
          </>
        )}
      </Modal>

      <CreateCandidateModal
        isOpen={createAccountOpen}
        onClose={() => setCreateAccountOpen(false)}
        onSuccess={() => {
          setCreateAccountOpen(false);
          loadAppointments();
        }}
      />

      <AppointmentModal
        isOpen={addFormOpen}
        onClose={() => {
          // A new appointment must not inherit a previous id from the URL.
          clearAppointmentRouteState();
          setAddFormOpen(false);
          loadAppointments();
        }}
      />

      <AppointmentModal
        isOpen={Boolean(editTarget)}
        onClose={() => {
          clearAppointmentRouteState();
          setEditTarget(null);
        }}
        initialData={editTarget}
        onSuccess={() => {
          clearAppointmentRouteState();
          setEditTarget(null);
          loadAppointments();
        }}
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
