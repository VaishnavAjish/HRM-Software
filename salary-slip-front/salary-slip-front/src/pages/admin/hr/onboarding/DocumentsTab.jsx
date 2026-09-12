import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  CheckCircle2, Circle, Download, FileText, Search, Sparkles, ThumbsDown, ThumbsUp, Trash2,
  ShieldCheck, Settings, Clock, AlertTriangle, Eye, User, Mail, Phone, MapPin, Users,
  CreditCard, Building, Briefcase, Calendar, FileCheck, UserCheck, AlertCircle, CheckCheck, XCircle
} from "lucide-react";
import Button from "../../../../components/ui/Button";
import {
  Eyebrow,
  Person,
  ProgressBar,
  SectionCard,
  StatusPill,
} from "../../../../components/onboarding/primitives";
import { hrApi, rbacApi } from "../../../../utils/api";
import { useAuth } from "../../../../context/AuthContext";

const STATUS_TONE = { VERIFIED: "ok", PENDING: "warn", REJECTED: "bad" };
const STATUS_LABEL = { VERIFIED: "Verified", PENDING: "Awaiting review", REJECTED: "Rejected" };

const DEFAULT_DOC_RULES = [
  { id: "aadhaar", name: "Aadhaar Card", mandatory: true, expiryTracked: false, allowed: "PDF, JPG, PNG", maxSize: "5 MB" },
  { id: "pan", name: "PAN Card", mandatory: true, expiryTracked: false, allowed: "PDF, JPG, PNG", maxSize: "5 MB" },
  { id: "passport", name: "Passport", mandatory: false, expiryTracked: true, allowed: "PDF", maxSize: "10 MB" },
  { id: "driving", name: "Driving License", mandatory: false, expiryTracked: true, allowed: "PDF, JPG", maxSize: "5 MB" },
  { id: "education", name: "Degree Certificates", mandatory: true, expiryTracked: false, allowed: "PDF", maxSize: "10 MB" },
  { id: "experience", name: "Relieving & Experience Letters", mandatory: true, expiryTracked: false, allowed: "PDF", maxSize: "10 MB" }
];

function isDocMatchingRule(doc, rule) {
  if (!doc || !rule) return false;
  const docType = (doc.document_type || "").trim().toLowerCase();
  const ruleName = (rule.name || "").trim().toLowerCase();
  const ruleId = (rule.id || "").trim().toLowerCase();

  if (docType === ruleName || docType === ruleId) return true;

  if (ruleId === "aadhaar" || ruleName.includes("aadhaar")) {
    return docType.includes("aadhaar") || docType.includes("adhar");
  }
  if (ruleId === "pan" || ruleName.includes("pan")) {
    return docType.includes("pan");
  }
  if (ruleId === "passport" || ruleName.includes("passport")) {
    return docType.includes("passport");
  }
  if (ruleId === "driving" || ruleName.includes("driving")) {
    return docType.includes("driving") || docType.includes("license") || docType.includes("dl");
  }
  if (ruleId === "education" || ruleName.includes("degree") || ruleName.includes("education")) {
    return docType.includes("degree") || docType.includes("education") || docType.includes("certificate") || docType.includes("mark");
  }
  if (ruleId === "experience" || ruleName.includes("experience") || ruleName.includes("relieving")) {
    return docType.includes("experience") || docType.includes("relieving") || docType.includes("letter");
  }

  return false;
}

// Small read-only label/value tile used throughout the "Careers Portal
// Onboarding Details" tab below â€” keeps every field's presentation
// (missing-value dash, mono for numbers, etc.) consistent in one place.
function InfoTile({ icon: Icon, label, value, mono = false, upper = false, bold = false, className = "" }) {
  return (
    <div className={`p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 ${className}`}>
      <span className="text-gray-400 flex items-center gap-1 text-[10.5px] uppercase font-semibold">
        {Icon && <Icon size={11} className="shrink-0" />} {label}
      </span>
      <span
        className={`block mt-0.5 text-gray-800 dark:text-gray-200 truncate ${bold ? "font-bold" : "font-semibold"} ${mono ? "font-mono" : ""} ${upper ? "uppercase" : ""}`}
      >
        {value || "â€”"}
      </span>
    </div>
  );
}

export default function DocumentsTab() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const [docRules, setDocRules] = useState(DEFAULT_DOC_RULES);
  const [filterStatus, setFilterStatus] = useState("all");
  const [activeTab, setActiveTab] = useState("onboarding_details"); // "onboarding_details" first, then "docs"

  const [candidateDetails, setCandidateDetails] = useState(null);
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [activeDoc, setActiveDoc] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [rejectingOnboarding, setRejectingOnboarding] = useState(false);
  const [approvingOnboarding, setApprovingOnboarding] = useState(false);

  // Load HR Settings rules
  useEffect(() => {
    if (!user?.accessToken) return;
    rbacApi.getSettings(user.accessToken, user.tokenType, "hr")
      .then((res) => {
        const data = res.data || [];
        try {
          const docsStr = data.find((s) => s.key === "hr.doc_types")?.value;
          if (docsStr) {
            const parsed = JSON.parse(docsStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setDocRules(parsed);
            }
          }
        } catch (e) {
          console.error("Error parsing HR settings document rules JSON", e);
        }
      })
      .catch(() => {});
  }, [user]);

  // Load candidates across all onboarding stages
  useEffect(() => {
    let ignore = false;
    if (!user?.accessToken) return;
    Promise.resolve().then(() => {
      if (!ignore) setEmployeesLoading(true);
    });
    hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 100, stage: "offer_accepted,onboarding,hired" })
      .then((res) => {
        let rows = [];
        if (res.status) {
          rows = res.data?.data || res.data || [];
        }
        if (rows.length === 0) {
          return hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 100 });
        }
        return { status: true, data: rows };
      })
      .then((res) => {
        if (res && res.status) {
          const rows = res.data?.data || res.data || [];
          setEmployees(rows);
          if (rows.length && !selectedId) setSelectedId(rows[0].id);
        }
      })
      .catch((err) => {
        console.error("Failed to load candidates for documents", err);
      })
      .finally(() => setEmployeesLoading(false));
  }, [user]);

  // Load selected candidate details & documents
  useEffect(() => {
    let ignore = false;
    if (!selectedId || !user?.accessToken) return;
    Promise.resolve().then(() => {
      if (!ignore) setDocsLoading(true);
    });

    Promise.all([
      hrApi.getCandidate(selectedId, user.accessToken, user.tokenType),
      hrApi.getCandidateDocuments(selectedId, user.accessToken, user.tokenType)
    ])
      .then(([candRes, docsRes]) => {
        if (ignore) return;
        if (candRes?.status) setCandidateDetails(candRes.data || null);
        if (docsRes?.status) setDocs(docsRes.data || []);
      })
      .catch((err) => {
        if (!ignore) toast.error(err.message || "Failed to load candidate documents");
      })
      .finally(() => {
        if (!ignore) setDocsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [selectedId, user]);

  const loadDocs = () => {
    if (!selectedId || !user?.accessToken) return;
    setDocsLoading(true);
    hrApi.getCandidateDocuments(selectedId, user.accessToken, user.tokenType)
      .then((res) => { if (res.status) setDocs(res.data || []); })
      .catch((err) => toast.error(err.message || "Failed to load documents"))
      .finally(() => setDocsLoading(false));
  };

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [e.name, e.email, e.phone, e.role].some((v) => (v || "").toLowerCase().includes(q))
    );
  }, [employees, search]);

  const selectedEmployee = employees.find((e) => String(e.id) === String(selectedId)) || candidateDetails;
  const candidate = candidateDetails || selectedEmployee;
  // Once HR rejects, the old details/documents are stale â€” nothing to
  // review until the candidate re-submits via the Careers Portal.
  const isWaitingForResubmission = candidate?.onboarding_status === "REJECTED";

  // Extract parsed onboarding details from Careers Portal submission
  const onboardingDetails = useMemo(() => {
    if (!candidate) return null;
    let details = candidate.onboarding_details;
    if (typeof details === "string") {
      try {
        details = JSON.parse(details);
      } catch {
        details = null;
      }
    }
    return details || null;
  }, [candidate]);

  const docsByType = useMemo(() => {
    const map = {};
    for (const d of docs) {
      const matchedRule = docRules.find((rule) => isDocMatchingRule(d, rule));
      const key = matchedRule ? matchedRule.name : d.document_type;
      (map[key] ||= []).push(d);
    }
    Object.values(map).forEach((list) => list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    return map;
  }, [docs, docRules]);

  const extraDocs = useMemo(() => {
    return docs.filter((d) => !docRules.some((rule) => isDocMatchingRule(d, rule)));
  }, [docs, docRules]);

  const compliance = useMemo(() => {
    const mandatoryRules = docRules.filter((r) => r.mandatory);
    const verifiedMandatory = mandatoryRules.filter((r) => {
      const list = docsByType[r.name] || [];
      return list.some((d) => d.status === "VERIFIED");
    });

    const isCompliant = mandatoryRules.length > 0 && verifiedMandatory.length === mandatoryRules.length;
    const progress = mandatoryRules.length > 0 ? Math.round((verifiedMandatory.length / mandatoryRules.length) * 100) : 100;

    return {
      mandatoryCount: mandatoryRules.length,
      verifiedMandatoryCount: verifiedMandatory.length,
      isCompliant,
      progress,
    };
  }, [docRules, docsByType]);

  const removeDoc = async (id) => {
    if (!window.confirm("Delete this document?")) return;
    try {
      const res = await hrApi.deleteCandidateDocument(id, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Document deleted");
        if (activeDoc?.id === id) setActiveDoc(null);
        loadDocs();
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const reviewDoc = async (docId, decision, customRemarks = "") => {
    try {
      const res = await hrApi.reviewCandidateDocument(docId, decision, customRemarks || undefined, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success(decision === "approve" ? "Document approved & verified" : "Document rejected");
        setRemarks("");
        loadDocs();
      }
    } catch (err) {
      toast.error(err.message || "Failed to update document status");
    }
  };

  const handleRejectOnboarding = async () => {
    if (!candidate || !selectedId) return;
    const reason = window.prompt(
      `Reject ${candidate.name}'s onboarding submission?\n\nThis PERMANENTLY DELETES their submitted details and every uploaded document â€” the candidate will re-submit the Careers Portal form from scratch. Enter a rejection reason to continue (they will see it):`,
      "Onboarding details or uploaded documents require corrections."
    );
    if (reason === null) return; // User cancelled prompt
    if (!reason.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }

    setRejectingOnboarding(true);
    try {
      let res;
      if (hrApi.rejectOnboarding) {
        res = await hrApi.rejectOnboarding(selectedId, reason.trim(), user.accessToken, user.tokenType);
      } else {
        // Fallback update candidate if api helper not present
        res = await hrApi.updateCandidate(selectedId, { onboarding_status: "REJECTED" }, user.accessToken, user.tokenType);
      }

      if (res && res.status !== false) {
        toast.success("Onboarding rejected. Previous details & documents were deleted â€” candidate will re-submit from scratch.");
        loadDocs();
        hrApi.getCandidate(selectedId, user.accessToken, user.tokenType).then((r) => {
          if (r.status) setCandidateDetails(r.data);
        });
      }
    } catch (err) {
      toast.error(err.message || "Failed to reject onboarding");
    } finally {
      setRejectingOnboarding(false);
    }
  };

  // Final HR sign-off on the whole submission (details + documents) â€” the
  // counterpart to handleRejectOnboarding. Backend refuses if any mandatory
  // document isn't VERIFIED yet, so the error surfaces via the toast below.
  const handleApproveOnboarding = async () => {
    if (!candidate || !selectedId) return;
    if (!window.confirm(`Approve ${candidate.name}'s onboarding submission? This locks their Careers Portal form and documents, sends their details and documents to a new Appointment, and marks them Hired — from there they're processed exactly like any other new hire's Appointment.`)) return;

    setApprovingOnboarding(true);
    try {
      const res = await hrApi.approveOnboarding(selectedId, user.accessToken, user.tokenType);
      if (res && res.status !== false) {
        toast.success("Candidate approved, sent to Appointment, and marked Hired.");
        loadDocs();
        hrApi.getCandidate(selectedId, user.accessToken, user.tokenType).then((r) => {
          if (r.status) setCandidateDetails(r.data);
        });
      } else {
        toast.error(res?.message || "Failed to approve candidate onboarding");
      }
    } catch (err) {
      toast.error(err.message || "Failed to approve candidate onboarding");
    } finally {
      setApprovingOnboarding(false);
    }
  };

  const handleRejectClick = (doc) => {
    setActiveDoc(doc);
    const reason = window.prompt(`Enter rejection reason for ${doc.document_type}:`, "");
    if (reason !== null) {
      if (!reason.trim()) {
        toast.error("Rejection reason is required.");
        return;
      }
      reviewDoc(doc.id, "reject", reason.trim());
    }
  };

  const review = async (decision) => {
    if (!activeDoc) return;
    if (decision === "reject" && !remarks.trim()) {
      toast.error("Please add a remark explaining why this document is rejected.");
      return;
    }
    await reviewDoc(activeDoc.id, decision, remarks);
  };

  const filteredRules = useMemo(() => {
    if (filterStatus === "mandatory") return docRules.filter((r) => r.mandatory);
    if (filterStatus === "pending") {
      return docRules.filter((r) => {
        const list = docsByType[r.name] || [];
        return list.some((d) => d.status === "PENDING");
      });
    }
    if (filterStatus === "verified") {
      return docRules.filter((r) => {
        const list = docsByType[r.name] || [];
        return list.some((d) => d.status === "VERIFIED");
      });
    }
    if (filterStatus === "missing") {
      return docRules.filter((r) => !docsByType[r.name]?.length);
    }
    return docRules;
  }, [docRules, filterStatus, docsByType]);

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      {/* Top Banner */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              Onboarding Document Verification & Careers Portal Review
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300">
                {docRules.length} HR Rules Active
              </span>
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Review documents and onboarding details submitted by candidates from the Careers Portal
            </p>
          </div>
        </div>

        <Link to="/admin/hr/settings">
          <Button variant="outline" size="sm" icon={<Settings size={14} />}>
            Manage Document Rules
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Left Column: New Joiners / Candidates in Onboarding (Internal Scroll Only) */}
        <div className="col-span-12 lg:col-span-3 lg:min-h-0">
          <SectionCard title="New Joiners" className="h-full flex flex-col">
            <div className="p-2.5 flex-1 min-h-0 flex flex-col">
              <div className="relative mb-2.5">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search candidatesâ€¦"
                  className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2.5 text-[12.5px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div className="flex flex-1 min-h-0 flex-col gap-1 overflow-y-auto pr-1 scrollbar-thin">
                {employeesLoading ? (
                  <p className="p-2 text-[12.5px] text-gray-400">Loadingâ€¦</p>
                ) : filteredEmployees.length === 0 ? (
                  <p className="p-2 text-[12.5px] text-gray-400">No candidates found in onboarding.</p>
                ) : (
                  filteredEmployees.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => { setSelectedId(e.id); setActiveDoc(null); setRemarks(""); }}
                      className={`flex items-center gap-2.5 rounded-xl p-2.5 text-left transition ${
                        String(e.id) === String(selectedId)
                          ? "bg-brand-500/10 ring-1 ring-brand-400/40 shadow-xs"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
                      }`}
                    >
                      <Person name={e.name} meta={e.email || e.phone || e.role || ""} />
                    </button>
                  ))
                )}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Middle Column: Careers Portal Onboarding Details (1st) & Document Review (2nd) */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-4 lg:min-h-0">
          {/* Main Candidate Card & Navigation Tabs */}
          {candidate && (
            <div className="shrink-0 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700 pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-brand-500 text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                    {candidate.name ? candidate.name.charAt(0).toUpperCase() : "C"}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      {candidate.name}
                      {candidate.stage === "hired" ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          Hired &bull; Sent to Appointment
                        </span>
                      ) : candidate.onboarding_status === "SUBMITTED" ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          Submitted via Careers Portal
                        </span>
                      ) : candidate.onboarding_status === "REJECTED" ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                          Onboarding Unlocked / Rejected
                        </span>
                      ) : null}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {candidate.role || candidate.requisition?.designation || "Candidate"} &bull; {candidate.email || "No email"} &bull; {candidate.phone || "No phone"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                    Stage: {candidate.stage ? candidate.stage.replace("_", " ").toUpperCase() : "ONBOARDING"}
                  </span>
                </div>
              </div>

              {/* Sub-navigation tabs: 1st: Careers Portal Details, 2nd: Document Review â€”
                  hidden while waiting on a re-submission, since there's nothing to switch between. */}
              <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                {!isWaitingForResubmission && (
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-gray-100 dark:bg-gray-900 w-full sm:w-auto">
                  {/* 1st Tab: Careers Portal Details */}
                  <button
                    type="button"
                    onClick={() => setActiveTab("onboarding_details")}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeTab === "onboarding_details"
                        ? "bg-white dark:bg-gray-800 text-brand-600 dark:text-brand-400 shadow-xs"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    <UserCheck size={14} /> Careers Portal Details
                  </button>

                  {/* 2nd Tab: Document Review */}
                  <button
                    type="button"
                    onClick={() => setActiveTab("docs")}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeTab === "docs"
                        ? "bg-white dark:bg-gray-800 text-brand-600 dark:text-brand-400 shadow-xs"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    <FileCheck size={14} /> Document Review ({docs.length})
                  </button>
                </div>
                )}

                {/* Header Action Buttons: shown on BOTH sub-tabs â€” these are the
                    two terminal, candidate-level actions (approve the whole
                    submission vs. reject & unlock it), not per-document review.
                    Once rejected, the candidate must re-submit before HR can
                    act again â€” showing the buttons here would just invite
                    HR to re-reject an already-unlocked, still-empty form. */}
                {candidate && candidate.onboarding_status === "REJECTED" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                    <Clock size={14} /> Waiting for candidate to re-submit details
                  </span>
                ) : candidate && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleApproveOnboarding}
                      disabled={approvingOnboarding || candidate.stage === "hired" || !compliance.isCompliant}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                        candidate.stage === "hired"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 cursor-not-allowed opacity-80"
                          : !compliance.isCompliant
                            ? "bg-gray-200 text-gray-400 dark:bg-gray-800 dark:text-gray-500 cursor-not-allowed"
                            : "bg-emerald-600 hover:bg-emerald-700 text-white"
                      }`}
                      title={
                        candidate.stage === "hired"
                          ? "Hired — already sent to Appointment"
                          : !compliance.isCompliant
                            ? `All mandatory documents must be verified first (${compliance.verifiedMandatoryCount}/${compliance.mandatoryCount} verified) â€” rejected, pending or missing documents block approval`
                            : candidate.onboarding_status === "VERIFIED"
                              ? "Approved earlier but not yet sent to Appointment — click to finish sending it and mark Hired"
                              : "Approve, send this form and its documents to a new Appointment, and mark the candidate Hired"
                      }
                    >
                      <CheckCheck size={14} />
                      {approvingOnboarding
                        ? "Approving..."
                        : candidate.stage === "hired"
                          ? "Hired"
                          : candidate.onboarding_status === "VERIFIED"
                            ? "Finish Sending to Appointment"
                            : "Approve & Send to Appointment"}
                    </button>

                    <button
                      type="button"
                      onClick={handleRejectOnboarding}
                      disabled={rejectingOnboarding}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs bg-rose-600 hover:bg-rose-700 text-white"
                      title="Reject and permanently delete the candidate's submitted details & documents â€” they re-submit from scratch"
                    >
                      <XCircle size={14} />
                      {rejectingOnboarding ? "Rejecting..." : "Reject"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* While waiting on a re-submission, the old details/documents are
              stale â€” show one waiting message instead of either tab's content. */}
          {isWaitingForResubmission ? (
            <SectionCard title="Onboarding Details & Documents" className="flex-1 min-h-0 flex flex-col">
              <div className="p-10 text-center space-y-2 m-auto">
                <Clock size={30} className="mx-auto text-amber-500" />
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">
                  Waiting for candidate to re-submit details
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                  {candidate?.name || "This candidate"}'s previous onboarding details and documents were rejected and
                  cleared for re-submission. This section will show their new submission once they re-submit via the Careers Portal.
                </p>
              </div>
            </SectionCard>
          ) : (
          <>
          {/* TAB 1 (Default): Careers Portal Submitted Onboarding Details */}
          {activeTab === "onboarding_details" && (
            <SectionCard title={candidate ? `${candidate.name}'s Careers Portal Onboarding Details` : "Onboarding Details"} className="flex-1 min-h-0 flex flex-col">
              <div className="p-5 space-y-6 flex-1 min-h-0 overflow-y-auto pr-1 scrollbar-thin">
                {onboardingDetails ? (
                  <div className="space-y-6">
                    {/* Personal Information â€” mirrors the Careers Portal form's "Personal Information" section */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-3 flex items-center gap-1.5">
                        <User size={15} /> Personal Information
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <InfoTile
                          label="Full Name"
                          value={[onboardingDetails.first_name, onboardingDetails.middle_name, onboardingDetails.surname].filter(Boolean).join(" ") || candidate?.name}
                          bold
                          className="sm:col-span-3"
                        />
                        <InfoTile icon={Mail} label="Email ID" value={onboardingDetails.email || candidate?.email} />
                        <InfoTile icon={Phone} label="Mobile Number" value={onboardingDetails.mobile_number || candidate?.phone} mono />
                        <InfoTile icon={Phone} label="WhatsApp Number" value={onboardingDetails.emp_whatsapp_no} mono />
                        <InfoTile icon={Calendar} label="Date of Birth" value={onboardingDetails.dob} />
                        <InfoTile label="Place of Birth" value={onboardingDetails.birth_place} />
                        <InfoTile label="Gender" value={onboardingDetails.gender} />
                        <InfoTile label="Caste / Category" value={onboardingDetails.cast} />
                        <InfoTile label="Marital Status" value={onboardingDetails.marital_status} />
                        <InfoTile label="Blood Group" value={onboardingDetails.blood_group} />
                      </div>
                    </div>

                    {/* Present & Permanent Address â€” mirrors the "Address Details" section */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-3 flex items-center gap-1.5">
                        <MapPin size={15} /> Present Address
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <InfoTile label="Address Line" value={onboardingDetails.present_address} className="sm:col-span-2" />
                        <InfoTile label="Village" value={onboardingDetails.present_village} />
                        <InfoTile label="Taluka" value={onboardingDetails.present_taluka} />
                        <InfoTile label="City / District" value={onboardingDetails.present_district} />
                        <InfoTile label="State" value={onboardingDetails.present_state} />
                        <InfoTile label="Pincode" value={onboardingDetails.present_pincode} mono className="sm:col-span-2" />
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-3 flex items-center gap-1.5">
                        <MapPin size={15} /> Permanent Address
                      </h4>
                      {onboardingDetails.same_as_present ? (
                        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                          <CheckCircle2 size={13} className="text-emerald-500" /> Same as present address
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <InfoTile label="Address Line" value={onboardingDetails.permanent_address} className="sm:col-span-2" />
                          <InfoTile label="Village" value={onboardingDetails.permanent_village} />
                          <InfoTile label="Taluka" value={onboardingDetails.permanent_taluka} />
                          <InfoTile label="City / District" value={onboardingDetails.permanent_district} />
                          <InfoTile label="State" value={onboardingDetails.permanent_state} />
                          <InfoTile label="Pincode" value={onboardingDetails.permanent_pincode} mono className="sm:col-span-2" />
                        </div>
                      )}
                    </div>

                    {/* Bank & Financial â€” mirrors the "Bank & Financial" section */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-3 flex items-center gap-1.5">
                        <Building size={15} /> Bank & Financial
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <InfoTile label="Bank Name" value={onboardingDetails.bank_name} bold />
                        <InfoTile label="Branch Name" value={onboardingDetails.branch_name} />
                        <InfoTile label="Account Number" value={onboardingDetails.account_number} mono />
                        <InfoTile label="IFSC Code" value={onboardingDetails.ifsc_code} mono upper />
                      </div>
                    </div>

                    {/* Statutory & KYC â€” mirrors the "Statutory & KYC" section */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-3 flex items-center gap-1.5">
                        <CreditCard size={15} /> Statutory & KYC
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <InfoTile label="Aadhaar Card Number" value={onboardingDetails.aadhaar_number} mono />
                        <InfoTile label="PAN Card Number" value={onboardingDetails.pan_number} mono upper />
                      </div>
                    </div>

                    {/* Family Members / Nominees â€” mirrors the "Family / Nominees" section */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-3 flex items-center gap-1.5">
                        <Users size={15} /> Family Members & Nominees
                      </h4>
                      {Array.isArray(onboardingDetails.family_members) && onboardingDetails.family_members.length > 0 ? (
                        <div className="space-y-2">
                          {onboardingDetails.family_members.map((m, idx) => (
                            <div
                              key={idx}
                              className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 text-xs"
                            >
                              <InfoTile label="Full Name" value={m.name} bold />
                              <InfoTile label="Relation" value={m.relation} />
                              <InfoTile icon={Calendar} label="Date of Birth" value={m.dob} />
                              <InfoTile icon={Phone} label="Mobile" value={m.mobile} mono />
                              <InfoTile icon={Briefcase} label="Occupation" value={m.occupation} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-dashed border-gray-200 dark:border-gray-800 text-xs text-gray-400 font-medium">
                          No family members added.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl bg-gray-50/50 dark:bg-gray-800/20 space-y-2">
                    <AlertCircle size={28} className="mx-auto text-amber-500" />
                    <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">
                      Careers Portal Onboarding Form Not Submitted Yet
                    </h4>
                    <p className="text-xs text-gray-500 max-w-md mx-auto">
                      {candidate?.name || "The selected candidate"} has not filled in their detailed onboarding information via the Careers Portal yet.
                    </p>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* TAB 2: Document Review & Verification Checklist */}
          {activeTab === "docs" && (
            <SectionCard
              title={candidate ? `${candidate.name}'s Uploaded Documents` : "Document Review"}
              action={
                <div className="flex items-center gap-1 overflow-x-auto">
                  {[
                    { id: "all", label: "All" },
                    { id: "mandatory", label: "Mandatory" },
                    { id: "pending", label: "Pending" },
                    { id: "verified", label: "Verified" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFilterStatus(f.id)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                        filterStatus === f.id
                          ? "bg-brand-500 text-white shadow-xs"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              }
              className="flex-1 min-h-0 flex flex-col"
            >
              <div className="p-4 space-y-4 flex-1 min-h-0 overflow-y-auto pr-1 scrollbar-thin">
                {candidate && (
                  <div className="p-3.5 rounded-xl bg-gradient-to-r from-gray-50 to-brand-50/30 dark:from-gray-800 dark:to-brand-900/20 border border-gray-200 dark:border-gray-700 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-900 dark:text-white">
                          Mandatory Compliance: {compliance.verifiedMandatoryCount} / {compliance.mandatoryCount} Verified
                        </span>
                        {compliance.isCompliant ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <CheckCircle2 size={11} /> 100% Compliant
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            <AlertTriangle size={11} /> Incomplete
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-extrabold text-brand-600 dark:text-brand-400">
                        {compliance.progress}%
                      </span>
                    </div>
                    <ProgressBar value={compliance.progress} tone={compliance.isCompliant ? "ok" : "brand"} />
                  </div>
                )}

                {docsLoading ? (
                  <div className="py-12 text-center text-sm text-gray-400">Loading candidate documentsâ€¦</div>
                ) : (
                  <div className="space-y-3.5">
                    {filteredRules.map((rule) => {
                      const uploadedList = docsByType[rule.name] || [];
                      const isVerified = uploadedList.some((d) => d.status === "VERIFIED");
                      const isPending = uploadedList.some((d) => d.status === "PENDING");

                      return (
                        <div
                          key={rule.id || rule.name}
                          className={`rounded-2xl border p-4 transition-all ${
                            isVerified
                              ? "border-emerald-200/80 bg-emerald-50/20 dark:border-emerald-900/40 dark:bg-emerald-950/10"
                              : isPending
                              ? "border-amber-200/80 bg-amber-50/20 dark:border-amber-900/40 dark:bg-amber-950/10"
                              : rule.mandatory
                              ? "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                              : "border-gray-100 bg-gray-50/40 dark:border-gray-800 dark:bg-gray-800/30"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-bold text-gray-900 dark:text-white">
                                {rule.name}
                              </span>
                              {rule.mandatory ? (
                                <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900">
                                  Mandatory *
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                                  Optional
                                </span>
                              )}
                              {rule.expiryTracked && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-900">
                                  <Clock size={10} /> Expiry Tracked
                                </span>
                              )}
                            </div>

                            <div className="text-[10px] text-gray-400 font-medium">
                              Allowed: <span className="font-semibold text-gray-600 dark:text-gray-300">{rule.allowed || "PDF, JPG"}</span> &bull; Max <span className="font-semibold text-gray-600 dark:text-gray-300">{rule.maxSize || "10 MB"}</span>
                            </div>
                          </div>

                          {uploadedList.length > 0 ? (
                            <div className="space-y-2">
                              {uploadedList.map((d) => (
                                <div
                                  key={d.id}
                                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border transition ${
                                    activeDoc?.id === d.id
                                      ? "border-brand-500 bg-brand-50/50 dark:bg-brand-900/20"
                                      : "border-gray-200/70 bg-white/70 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800/80"
                                  }`}
                                >
                                  <div
                                    className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                                    onClick={() => setActiveDoc(d)}
                                  >
                                    <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0">
                                      <FileText size={18} />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                                        {d.original_filename || `${d.document_type}.pdf`}
                                      </p>
                                      <p className="text-[10.5px] text-gray-400 truncate">
                                        Uploaded {d.created_at ? new Date(d.created_at).toLocaleDateString() : "recently"}
                                        {d.uploaded_by?.name ? ` by ${d.uploaded_by.name}` : " from Careers Portal"}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                    <StatusPill tone={STATUS_TONE[d.status]}>
                                      {STATUS_LABEL[d.status]}
                                    </StatusPill>

                                    {/* Hide Reject button when status is VERIFIED; Hide Approve button when status is REJECTED */}
                                    {d.status !== "REJECTED" && (
                                      <button
                                        type="button"
                                        onClick={() => reviewDoc(d.id, "approve")}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-xs ${
                                          d.status === "VERIFIED"
                                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 cursor-default"
                                            : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                        }`}
                                        title="Approve Document"
                                      >
                                        <ThumbsUp size={12} /> {d.status === "VERIFIED" ? "Approved" : "Approve"}
                                      </button>
                                    )}

                                    {d.status !== "VERIFIED" && (
                                      <button
                                        type="button"
                                        onClick={() => handleRejectClick(d)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-xs ${
                                          d.status === "REJECTED"
                                            ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 cursor-default"
                                            : "bg-rose-600 hover:bg-rose-700 text-white"
                                        }`}
                                        title="Reject Document"
                                      >
                                        <ThumbsDown size={12} /> {d.status === "REJECTED" ? "Rejected" : "Reject"}
                                      </button>
                                    )}

                                    {d.url && (
                                      <a
                                        href={d.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                                        title="View / Download"
                                      >
                                        <Eye size={14} />
                                      </a>
                                    )}
                                    <button
                                      onClick={() => removeDoc(d.id)}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                                      title="Delete document"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/20 text-center">
                              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                Awaiting candidate upload from Careers Portal
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Section for Extra Uploaded Candidate Documents */}
                    {extraDocs.length > 0 && (
                      <div className="rounded-2xl border border-brand-200/80 bg-brand-50/20 dark:border-brand-900/40 dark:bg-brand-950/10 p-4 transition-all space-y-3 mt-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-[13px] font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            Additional Candidate Uploads ({extraDocs.length})
                          </h3>
                          <span className="text-[10px] font-medium text-gray-400">
                            Uploaded from Careers Portal
                          </span>
                        </div>
                        <div className="space-y-2">
                          {extraDocs.map((d) => (
                            <div key={d.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-gray-200/70 bg-white/70 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800/80">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer" onClick={() => setActiveDoc(d)}>
                                <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0">
                                  <FileText size={18} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                                    {d.document_type || "Document"} â€” {d.original_filename || "file"}
                                  </p>
                                  <p className="text-[10.5px] text-gray-400 truncate">
                                    Uploaded {d.created_at ? new Date(d.created_at).toLocaleDateString() : "recently"} from Careers Portal
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                <StatusPill tone={STATUS_TONE[d.status]}>
                                  {STATUS_LABEL[d.status]}
                                </StatusPill>

                                {d.status !== "REJECTED" && (
                                  <button
                                    type="button"
                                    onClick={() => reviewDoc(d.id, "approve")}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-xs ${
                                      d.status === "VERIFIED"
                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 cursor-default"
                                        : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                    }`}
                                  >
                                    <ThumbsUp size={12} /> {d.status === "VERIFIED" ? "Approved" : "Approve"}
                                  </button>
                                )}

                                {d.status !== "VERIFIED" && (
                                  <button
                                    type="button"
                                    onClick={() => handleRejectClick(d)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-xs ${
                                      d.status === "REJECTED"
                                        ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 cursor-default"
                                        : "bg-rose-600 hover:bg-rose-700 text-white"
                                    }`}
                                  >
                                    <ThumbsDown size={12} /> {d.status === "REJECTED" ? "Rejected" : "Reject"}
                                  </button>
                                )}

                                {d.url && (
                                  <a href={d.url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-gray-500 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-gray-700" title="View / Download">
                                    <Eye size={14} />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </SectionCard>
          )}
          </>
          )}
        </div>

        {/* Right Column: Compliance Checklist & Active Document Detailed Review (Internal Scroll Only) */}
        <div className="col-span-12 lg:col-span-3 lg:min-h-0">
          <SectionCard title={isWaitingForResubmission ? "Compliance Checklist" : activeDoc ? "Review Document" : "Compliance Checklist"} className="h-full flex flex-col">
            <div className="p-4 space-y-4 flex-1 min-h-0 overflow-y-auto pr-1 scrollbar-thin">
              {isWaitingForResubmission ? (
                <div className="py-10 text-center space-y-2">
                  <Clock size={26} className="mx-auto text-amber-500" />
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                    Waiting for candidate to re-submit details
                  </p>
                </div>
              ) : activeDoc ? (
                <div className="space-y-3.5">
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        {activeDoc.document_type}
                      </span>
                      <StatusPill tone={STATUS_TONE[activeDoc.status]}>
                        {STATUS_LABEL[activeDoc.status]}
                      </StatusPill>
                    </div>
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {activeDoc.original_filename}
                    </p>
                    {activeDoc.url && (
                      <a
                        href={activeDoc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline"
                      >
                        <Download size={13} /> Open full file
                      </a>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Add review notes or rejection reasonâ€¦"
                      rows={3}
                      className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    />
                    <div className="flex gap-2">
                      {activeDoc.status !== "VERIFIED" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<ThumbsDown size={13} />}
                          onClick={() => review("reject")}
                          className="flex-1 justify-center !text-rose-600 hover:!bg-rose-50 dark:hover:!bg-rose-950/30"
                        >
                          Reject
                        </Button>
                      )}
                      {activeDoc.status !== "REJECTED" && (
                        <Button
                          size="sm"
                          icon={<ThumbsUp size={13} />}
                          onClick={() => review("approve")}
                          className="flex-1 justify-center !bg-emerald-600 hover:!bg-emerald-700 !text-white"
                        >
                          Approve
                        </Button>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveDoc(null)}
                    className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1"
                  >
                    Back to checklist view
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Eyebrow>HR Settings Rules Checklist</Eyebrow>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Verification state for {candidate?.name || "joiner"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {docRules.map((r) => {
                      const list = docsByType[r.name] || [];
                      const isVerified = list.some((d) => d.status === "VERIFIED");
                      const isPending = list.some((d) => d.status === "PENDING");
                      const isUploaded = list.length > 0;

                      return (
                        <div
                          key={r.id || r.name}
                          className="flex items-center justify-between text-xs py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-none"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isVerified ? (
                              <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                            ) : isPending ? (
                              <Clock size={15} className="text-amber-500 shrink-0" />
                            ) : (
                              <Circle size={15} className="text-gray-300 dark:text-gray-600 shrink-0" />
                            )}
                            <span className={`truncate font-medium ${isVerified ? "text-gray-800 dark:text-gray-200" : "text-gray-500"}`}>
                              {r.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {r.mandatory && (
                              <span className="text-[10px] text-rose-500 font-bold">*</span>
                            )}
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              isVerified
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : isPending
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : isUploaded
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                            }`}>
                              {isVerified ? "Verified" : isPending ? "Pending" : isUploaded ? "Rejected" : "Missing"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-3 rounded-xl bg-brand-50/60 dark:bg-brand-950/30 border border-brand-100 dark:border-brand-900/50 flex items-start gap-2 text-[11.5px] text-brand-700 dark:text-brand-300">
                    <Sparkles size={15} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
                    <span>
                      Rules are live-synced from HR Settings. Updates made by HR admins apply instantly across candidate document verification lists.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}





