import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ClipboardList, FileText, CheckCircle2, Clock, Printer, Eye, ArrowRightCircle, Loader2 } from "lucide-react";
import AppointmentModal from "../auth/AppointmentModal";
import TrialFormModal from "../auth/TrialFormModal";
import { authApi } from "../../utils/api";
import PrintableForm from "../../components/forms/PrintableForm";
import { PrintableTrialForm } from "../../components/forms/PrintableTrialForm";
import { normalizeTrialForm } from "../../components/forms/trial-form-helpers";
import toast from "react-hot-toast";
import { getAadhaarDisplayValue } from "../../utils/aadhaar";
import { escapeHtml, safeImageSrc } from "../../utils/html";

export default function AgentDashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // The query string is the source of truth: `?modal=appointment` opens the
  // form and closing navigates the parameter away. Mirroring that into state
  // and syncing it from an effect meant the URL and the modal could disagree
  // for a render, and a back-button that changed the URL without reopening.
  const formOpen = new URLSearchParams(location.search).get("modal") === "appointment";
  const [viewCandidate, setViewCandidate] = useState(null);
  const [processCandidate, setProcessCandidate] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Printing states
  const [selectedForPrint, setSelectedForPrint] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const formRef = useRef(null);

  const requestCandidates = async () => {
    try {
      const res = await authApi.getAgentCandidates(user?.accessToken, user?.tokenType);
      if (res?.status) {
        setCandidates(res.data || []);
      }
    } finally {
      setLoading(false);
    }
  };

  // Raises no spinner of its own — every state update happens after an await,
  // so calling this from an effect costs no cascading render. `loading` starts
  // true, so the mount fetch needs none; refetchCandidates is for the rest.
  const fetchCandidates = () =>
    requestCandidates().catch(() => toast.error("Failed to load candidates"));

  const refetchCandidates = () => {
    setLoading(true);
    return fetchCandidates();
  };

  useEffect(() => {
    if (user?.accessToken) {
      fetchCandidates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleModalClose = (wasSubmitted) => {
    // Clearing the query string is what closes the modal.
    navigate("/agent", { replace: true });
    if (wasSubmitted) {
      refetchCandidates();
    }
  };

  const isCandidateApproved = (c) => {
    return Boolean(c.emp_code) || Number(c.checkbox) === 1 || String(c.status) === '1' || c.status === 'Approved';
  };

  const isCandidateProcessed = (c) => Number(c.processed) === 1;

  const canProcessAsAppointment = (c) =>
    c.type === 'trial' && isCandidateApproved(c) && !isCandidateProcessed(c);

  function firstPresent(...values) {
    return values.find((value) => value !== undefined && value !== null) ?? "";
  }
  
  function normalizeAppointment(item, index) {
    let displayStatus;
    if (isCandidateApproved(item)) {
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
      status: displayStatus,
      salary: item.salary || "",
      designation: item.designation || "",
      email: item.email || "",
      education: item.education || "",
      punchingNo: item.punching_no || "",
      address: item.address || "",
      village: item.village || "",
      taluka: item.taluka || "",
      district: item.district || "",
      dob: item.dob || "",
      birthPlace: item.birth_place || "",
      gender: item.gender || "",
      cast: item.cast || "",
      maritalStatus: item.marital_status || "",
      bloodGroup: item.blood_group || "",
      photo: item.photo || null,
      signature: item.emp_signature || "",
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
        } catch {
          // ignore
        }
        return Array(4).fill({});
      })(),
      isPrinted: Number(item.print ?? 0) === 1,
      submittedAt: firstPresent(
        item.created_at,
        item.createdAt,
        item.submitted_at,
      ),
    };
  }

  const handleDownloadPDF = async (candidate) => {
    setPdfLoading(candidate.id);
    let normalizedData;
    if (candidate.type === 'trial') {
      normalizedData = { ...normalizeTrialForm(candidate, candidate.id), type: 'trial' };
    } else {
      normalizedData = { ...normalizeAppointment(candidate, candidate.id), type: 'appointment' };
    }
    setSelectedForPrint(normalizedData);
    
    // Give react time to render the PrintableForm in the hidden div
    setTimeout(() => {
      if (!formRef.current) {
        setPdfLoading(false);
        toast.error("Failed to load layout");
        return;
      }

      const win = window.open("", "_blank", "width=1000,height=750");
      if (!win) {
        toast.error("Please allow pop-ups to print the form");
        setPdfLoading(false);
        setSelectedForPrint(null);
        return;
      }

      // Build one page per existing document (same as admin)
      const DOC_PRINT_FIELDS = [
        { key: "adhar_image", label: "Aadhar Card" },
        { key: "pan_image", label: "PAN Card" },
        { key: "check_image", label: "Cheque" },
      ];
      const docPages = DOC_PRINT_FIELDS.filter(
        ({ key }) => normalizedData?.documents?.[key]
      )
        .map(
          ({ key, label }) => `
          <div class="doc-page">
            <div class="doc-page-header">
              <span class="doc-page-title">${label}</span>
              <span class="doc-page-name">${escapeHtml(normalizedData?.fullName || normalizedData?.name)}</span>
            </div>
            <div class="doc-page-body">
              <img src="${safeImageSrc(normalizedData.documents[key])}" alt="${label}" />
            </div>
            <div class="doc-page-footer">${label} — ${escapeHtml(normalizedData?.fullName || normalizedData?.name)}</div>
          </div>
        `
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
        // ignore
      }
      const appStyles = `<style>${cssText}</style>`;

      const pageTitle = normalizedData.type === 'trial' ? 'Trial Form' : 'Appointment';
      const nameString = typeof normalizedData.name === "string" ? normalizedData.name : (typeof normalizedData.fullName === "string" ? normalizedData.fullName : "Unknown");

      win.document.write(
        `<!DOCTYPE html><html><head>
          <base href="${document.baseURI}">
          ${appStyles}
          <title>${pageTitle} – ${escapeHtml(nameString)}</title>
          <style>
            *, *::before, *::after { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; background: white; font-family: sans-serif; }
            [data-appointment-print-form], [data-trial-print-form] { box-shadow: none !important; }

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
              [data-appointment-print-form], [data-trial-print-form] {
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
        </head><body>${formRef.current.outerHTML}${docPages}</body></html>`
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
                })
          )
        );
        win.focus();
        win.print();
        setPdfLoading(false);
        setSelectedForPrint(null);
      };

      if (win.document.readyState === "complete") {
        printWhenReady();
      } else {
        win.addEventListener("load", printWhenReady, { once: true });
      }
    }, 500);
  };

  return (
    <div className="p-3 sm:p-8 flex flex-col items-center">
      <div className="w-full max-w-[1400px] bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8 pb-4 sm:pb-6 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Agent Portal</h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">Manage and track candidate applications</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-brand-50 dark:bg-brand-900/10 p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-brand-100 dark:border-brand-900/30 flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center text-brand-600 dark:text-brand-400 shadow-sm flex-shrink-0">
              <ClipboardList size={18} className="sm:w-5 sm:h-5" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-brand-600/70 dark:text-brand-400/70">Total Submitted</p>
              <h3 className="text-xl sm:text-2xl font-bold text-brand-700 dark:text-brand-300">{candidates.length}</h3>
            </div>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/10 p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-orange-100 dark:border-orange-900/30 flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center text-orange-500 shadow-sm flex-shrink-0">
              <Clock size={18} className="sm:w-5 sm:h-5" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-orange-600/70 dark:text-orange-400/70">Pending</p>
              <h3 className="text-xl sm:text-2xl font-bold text-orange-700 dark:text-orange-300">
                {candidates.filter(c => !isCandidateApproved(c)).length}
              </h3>
            </div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/10 p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-green-100 dark:border-green-900/30 flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center text-green-500 shadow-sm flex-shrink-0">
              <CheckCircle2 size={18} className="sm:w-5 sm:h-5" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-green-600/70 dark:text-green-400/70">Approved (Assigned)</p>
              <h3 className="text-xl sm:text-2xl font-bold text-green-700 dark:text-green-300">
                {candidates.filter(c => isCandidateApproved(c)).length}
              </h3>
            </div>
          </div>
        </div>

        <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">Recent Candidates</h2>
        
        {/* Mobile View: Cards */}
        <div className="block sm:hidden space-y-3">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl">
              <span className="inline-block w-4 h-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin mr-2"></span>
              Loading candidates...
            </div>
          ) : candidates.length === 0 ? (
            <div className="p-8 text-center border border-gray-200 dark:border-gray-700 rounded-xl">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-3">
                <FileText size={20} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">No candidates yet</p>
              <p className="text-xs text-gray-500 mt-1">Tap "New Candidate" to submit an application.</p>
            </div>
          ) : (
            candidates.map((c) => (
              <div key={c.id} className={`border rounded-xl p-4 shadow-sm flex flex-col gap-3 ${
                isCandidateApproved(c) ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' :
                (String(c.status) === "2" || String(c.form_status) === "2" ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' :
                'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700')
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {c.photo ? (
                      <img src={c.photo} alt={c.name} className="w-10 h-10 rounded-full object-cover bg-gray-100 dark:bg-gray-700 flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 flex items-center justify-center text-sm font-bold uppercase flex-shrink-0">
                        {c.name?.charAt(0) || "U"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">{c.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.mobile_number || c.mob_num || "-"}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {isCandidateApproved(c) ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Approved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span> Pending
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex gap-4">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Employee Code</p>
                      <p className={`text-sm font-semibold ${c.emp_code ? "text-gray-900 dark:text-white" : "text-gray-400"}`}>
                        {c.emp_code || "Not Assigned"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Form Type</p>
                      <span className="inline-flex items-center mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                        {c.type === 'trial' ? 'Trial Form' : 'Appointment Form'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setViewCandidate(c)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 rounded-lg text-xs font-semibold text-brand-700 dark:text-brand-300 transition-colors"
                    >
                      <Eye size={12} />
                      View
                    </button>
                    <button
                      onClick={() => handleDownloadPDF(c)}
                      disabled={pdfLoading === c.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-200 transition-colors border border-gray-200 dark:border-gray-600 disabled:opacity-50"
                    >
                      {pdfLoading === c.id ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
                      Print
                    </button>
                    {canProcessAsAppointment(c) && (
                      <button
                        onClick={() => setProcessCandidate(c)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg text-xs font-semibold text-blue-700 dark:text-blue-300 transition-colors"
                      >
                        <ArrowRightCircle size={12} />
                        Process
                      </button>
                    )}
                    {c.type === 'trial' && isCandidateProcessed(c) && (
                      <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-gray-400">
                        <CheckCircle2 size={12} /> Processed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden sm:block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-4 whitespace-nowrap">Name</th>
                  <th className="px-4 py-4 whitespace-nowrap">Email</th>
                  <th className="px-4 py-4 whitespace-nowrap">Mobile Number</th>
                  <th className="px-4 py-4 whitespace-nowrap">Form Type</th>
                  <th className="px-4 py-4 whitespace-nowrap">Status</th>
                  <th className="px-4 py-4 whitespace-nowrap">Employee Code</th>
                  <th className="px-4 py-4 whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      <span className="inline-block w-4 h-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin mr-2"></span>
                      Loading candidates...
                    </td>
                  </tr>
                ) : candidates.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-3">
                        <FileText size={20} className="text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">No candidates yet</p>
                      <p className="text-xs text-gray-500 mt-1">Click "New Candidate" to submit an application.</p>
                    </td>
                  </tr>
                ) : (
                  candidates.map((c) => (
                    <tr key={c.id} className={`transition-colors ${
                      isCandidateApproved(c) ? 'bg-green-50/30 dark:bg-green-900/10 hover:bg-green-50 dark:hover:bg-green-900/20' :
                      (String(c.status) === "2" || String(c.form_status) === "2" ? 'bg-red-50/30 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20' :
                      'hover:bg-gray-50/50 dark:hover:bg-gray-700/20')
                    }`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {c.photo ? (
                            <img src={c.photo} alt={c.name} className="w-8 h-8 rounded-full object-cover bg-gray-100 dark:bg-gray-700 flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold uppercase flex-shrink-0">
                              {c.name?.charAt(0) || "U"}
                            </div>
                          )}
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[150px]">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 truncate max-w-[150px]">{c.email || "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{c.mobile_number || c.mob_num || "-"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                          {c.type === 'trial' ? 'Trial Form' : 'Appointment Form'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isCandidateApproved(c) ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-sm font-semibold ${c.emp_code ? "text-gray-900 dark:text-white" : "text-gray-400"}`}>
                          {c.emp_code || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setViewCandidate(c)}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 dark:bg-brand-900/20 dark:hover:bg-brand-900/40 dark:text-brand-300 rounded-lg text-xs font-semibold transition-colors"
                          >
                            <Eye size={14} />
                            View
                          </button>
                          <button
                            onClick={() => handleDownloadPDF(c)}
                            disabled={pdfLoading === c.id}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            {pdfLoading === c.id ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                            Print
                          </button>
                          {canProcessAsAppointment(c) && (
                            <button
                              onClick={() => setProcessCandidate(c)}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-300 rounded-lg text-xs font-semibold transition-colors"
                            >
                              <ArrowRightCircle size={14} />
                              Process
                            </button>
                          )}
                          {c.type === 'trial' && isCandidateProcessed(c) && (
                            <span className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-bold text-gray-400">
                              <CheckCircle2 size={13} /> Processed
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AppointmentModal 
        isOpen={formOpen || (!!viewCandidate && viewCandidate.type !== 'trial')} 
        onClose={() => {
          if (viewCandidate) {
            setViewCandidate(null);
          } else {
            handleModalClose(false);
          }
        }}
        onSuccess={() => {
          if (viewCandidate) {
            setViewCandidate(null);
          }
          handleModalClose(true);
        }}
        initialData={viewCandidate && viewCandidate.type !== 'trial' ? { id: viewCandidate.id || viewCandidate._id, raw: viewCandidate, addedBy: viewCandidate.addedBy || user?.id } : { addedBy: user?.id }}
      />

      <TrialFormModal
        isOpen={!!viewCandidate && viewCandidate.type === 'trial'}
        onClose={() => setViewCandidate(null)}
        initialData={viewCandidate && viewCandidate.type === 'trial' ? { id: viewCandidate.id || viewCandidate._id, raw: viewCandidate, addedBy: viewCandidate.addedBy || user?.id } : null}
        onSuccess={() => {
          setViewCandidate(null);
          refetchCandidates();
        }}
      />

      {/* Process trial form -> appointment form */}
      <AppointmentModal
        isOpen={!!processCandidate}
        onClose={() => setProcessCandidate(null)}
        onSuccess={() => {
          setProcessCandidate(null);
          refetchCandidates();
        }}
        initialData={
          processCandidate
            ? {
                id: processCandidate.id || processCandidate._id,
                raw: processCandidate,
                addedBy: processCandidate.added_by || user?.id,
              }
            : null
        }
        isPrefillFromTrial={true}
      />

      {/* Hidden Printable Form used purely for PDF/Print generation */}
      {selectedForPrint && (
        <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
          {selectedForPrint.type === 'trial' ? (
            <PrintableTrialForm data={selectedForPrint} formRef={formRef} />
          ) : (
            <PrintableForm data={selectedForPrint} formRef={formRef} />
          )}
        </div>
      )}
    </div>
  );
}
