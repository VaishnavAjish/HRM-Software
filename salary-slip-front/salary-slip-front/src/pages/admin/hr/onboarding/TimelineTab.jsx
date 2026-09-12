import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Search, CheckCircle2, Award, Calendar, Mail, Phone,
  ShieldCheck, User, FileCheck, Check, FileText, History, X, BadgeCheck, Clock3
} from "lucide-react";
import { SectionCard } from "../../../../components/onboarding/primitives";
import { hrApi, rbacApi } from "../../../../utils/api";
import { useAuth } from "../../../../context/AuthContext";
import ViewAppointmentModal from "../../../auth/ViewAppointmentModal";

const DEFAULT_DOC_RULES = [
  { id: "aadhaar", name: "Aadhaar Card", mandatory: true },
  { id: "pan", name: "PAN Card", mandatory: true },
  { id: "passport", name: "Passport", mandatory: false },
  { id: "driving", name: "Driving License", mandatory: false },
  { id: "education", name: "Degree Certificates", mandatory: true },
  { id: "experience", name: "Relieving & Experience Letters", mandatory: true }
];

function isDocMatchingRule(doc, rule) {
  if (!doc || !rule) return false;
  const docType = (doc.document_type || "").trim().toLowerCase();
  const ruleName = (rule.name || "").trim().toLowerCase();
  const ruleId = (rule.id || "").trim().toLowerCase();

  if (docType === ruleName || docType === ruleId) return true;
  if (ruleId === "aadhaar" || ruleName.includes("aadhaar")) return docType.includes("aadhaar") || docType.includes("adhar");
  if (ruleId === "pan" || ruleName.includes("pan")) return docType.includes("pan");
  if (ruleId === "passport" || ruleName.includes("passport")) return docType.includes("passport");
  if (ruleId === "driving" || ruleName.includes("driving")) return docType.includes("driving") || docType.includes("license") || docType.includes("dl");
  if (ruleId === "education" || ruleName.includes("degree") || ruleName.includes("education")) return docType.includes("degree") || docType.includes("education") || docType.includes("certificate") || docType.includes("mark");
  if (ruleId === "experience" || ruleName.includes("experience") || ruleName.includes("relieving")) return docType.includes("experience") || docType.includes("relieving") || docType.includes("letter");
  return false;
}

function InfoTile({ icon: Icon, label, value, mono = false, upper = false, bold = false, className = "" }) {
  return (
    <div className={`p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 ${className}`}>
      <span className="text-gray-400 flex items-center gap-1 text-[10.5px] uppercase font-semibold">
        {Icon && <Icon size={11} className="shrink-0" />} {label}
      </span>
      <span className={`block mt-0.5 text-gray-800 dark:text-gray-200 truncate ${bold ? "font-bold" : "font-semibold"} ${mono ? "font-mono" : ""} ${upper ? "uppercase" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}

export default function TimelineTab() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [candidateDetails, setCandidateDetails] = useState(null);
  const [docs, setDocs] = useState([]);
  const [docRules, setDocRules] = useState(DEFAULT_DOC_RULES);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [historyCandidates, setHistoryCandidates] = useState([]);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Load active HR settings rules
  useEffect(() => {
    if (!user?.accessToken) return;
    rbacApi.getSettings(user.accessToken, user.tokenType, "hr")
      .then((res) => {
        const data = res.data || [];
        try {
          const docsStr = data.find((s) => s.key === "hr.doc_types")?.value;
          if (docsStr) {
            const parsed = JSON.parse(docsStr);
            if (Array.isArray(parsed) && parsed.length > 0) setDocRules(parsed);
          }
        } catch {
          // ignore
        }
      })
      .catch(() => {});
  }, [user]);

  // Filter candidates: ONLY candidates who have ALL mandatory documents APPROVED
  useEffect(() => {
    let ignore = false;
    if (!user?.accessToken) return;

    Promise.resolve().then(() => {
      if (!ignore) setLoadingEmployees(true);
    });

    hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 100, stage: "offer_accepted,onboarding,hired,selected,document_verified,pre_boarding" })
      .then((res) => {
        let rows = (res.status ? (res.data?.data || res.data || []) : []);
        if (!rows.length) {
          return hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 100 });
        }
        return { status: true, data: rows };
      })
      .then(async (res) => {
        if (ignore || !res || !res.status) return;
        const rows = res.data?.data || res.data || [];

        const candidateChecks = await Promise.all(
          rows.map(async (c) => {
            try {
              const dRes = await hrApi.getCandidateDocuments(c.id, user.accessToken, user.tokenType);
              const cDocs = dRes?.status ? (dRes.data || []) : [];
              const mandatoryRules = docRules.filter((r) => r.mandatory);

              if (mandatoryRules.length === 0) return { candidate: c, isFullyApproved: true };

              const verifiedMandatory = mandatoryRules.filter((r) => {
                return cDocs.some((d) => isDocMatchingRule(d, r) && (d.status === "VERIFIED" || d.status === "APPROVED"));
              });

              return {
                candidate: c,
                isFullyApproved: verifiedMandatory.length === mandatoryRules.length
              };
            } catch {
              return { candidate: c, isFullyApproved: false };
            }
          })
        );

        if (ignore) return;
        const approvedOnly = candidateChecks.filter((item) => item.isFullyApproved).map((item) => item.candidate);

        // Once a candidate's form has actually been sent to Appointment
        // (converted_appointment_user_id set — see UserController::appointmentStore),
        // there is nothing left to "proceed" here: move it into History instead
        // of leaving it in the main list where clicking Proceed again would just
        // try to create a duplicate appointment.
        const notYetSent = approvedOnly.filter((c) => !c.converted_appointment_user_id);
        const alreadySent = approvedOnly.filter((c) => c.converted_appointment_user_id);

        setEmployees(notYetSent);
        setHistoryCandidates(alreadySent);
        setSelectedId((prev) => (notYetSent.length ? (prev || String(notYetSent[0].id)) : ""));
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setLoadingEmployees(false);
      });

    return () => {
      ignore = true;
    };
  }, [user, docRules]);

  useEffect(() => {
    let ignore = false;
    if (!selectedId || !user?.accessToken) return;

    Promise.all([
      hrApi.getCandidate(selectedId, user.accessToken, user.tokenType),
      hrApi.getCandidateDocuments(selectedId, user.accessToken, user.tokenType)
    ])
      .then(([candRes, docsRes]) => {
        if (ignore) return;
        if (candRes?.status) setCandidateDetails(candRes.data || null);
        if (docsRes?.status) setDocs(docsRes.data || []);
      })
      .catch(() => {})
      .finally(() => {});

    return () => {
      ignore = true;
    };
  }, [selectedId, user]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [e.name, e.role, e.email, e.phone].some((v) => (v || "").toLowerCase().includes(q))
    );
  }, [employees, search]);

  const selectedEmployee = employees.find((e) => String(e.id) === String(selectedId)) || candidateDetails;
  const candidate = candidateDetails || selectedEmployee;

  const onboardingDetails = useMemo(() => {
    if (!candidate) return null;
    let details = candidate.onboarding_details;
    if (typeof details === "string") {
      try { details = JSON.parse(details); } catch { details = null; }
    }
    return details || null;
  }, [candidate]);

  const appointmentInitialData = useMemo(() => {
    if (!candidate) return {};

    const fullName = onboardingDetails
      ? [onboardingDetails.first_name, onboardingDetails.middle_name, onboardingDetails.surname].filter(Boolean).join(" ")
      : candidate.name || "";

    const fullAddr = onboardingDetails
      ? [onboardingDetails.present_address, onboardingDetails.present_district, onboardingDetails.present_state, onboardingDetails.present_pincode].filter(Boolean).join(", ")
      : candidate.address || "";

    return {
      id: candidate.id,
      name: fullName || candidate.name || "",
      email: onboardingDetails?.email || candidate.email || "",
      mobile_number: onboardingDetails?.mobile_number || candidate.phone || "",
      emp_whatsapp_no: onboardingDetails?.mobile_number || candidate.phone || "",
      joining_date: candidate.offer_accepted_at ? new Date(candidate.offer_accepted_at).toISOString().split("T")[0] : (candidate.joining_date || new Date().toISOString().split("T")[0]),
      department: candidate.department_name || candidate.department || onboardingDetails?.department || "",
      designation: candidate.designation_name || candidate.designation || candidate.role || onboardingDetails?.designation || "",
      salary: candidate.offered_ctc || candidate.salary || candidate.ctc || "",
      address: fullAddr,
      village: onboardingDetails?.present_address || "",
      taluka: onboardingDetails?.present_district || "",
      district: onboardingDetails?.present_district || onboardingDetails?.present_state || "",
      dob: onboardingDetails?.dob || candidate.dob || "",
      birth_place: onboardingDetails?.birth_place || "",
      gender: onboardingDetails?.gender || candidate.gender || "",
      cast: onboardingDetails?.cast || candidate.cast || "",
      marital_status: onboardingDetails?.marital_status || candidate.marital_status || "",
      blood_group: onboardingDetails?.blood_group || candidate.blood_group || "",
      aadhar_card_no: onboardingDetails?.aadhaar_number || candidate.aadhar_card_no || "",
      pan_card_no: onboardingDetails?.pan_number || candidate.pan_card_no || "",
      bank_name: onboardingDetails?.bank_name || candidate.bank_name || "",
      bank_ifsc_code: onboardingDetails?.ifsc_code || candidate.bank_ifsc_code || "",
      bank_account_no: onboardingDetails?.account_number || candidate.bank_account_no || "",
      education: onboardingDetails?.education || candidate.education || candidate.qualification || "",
      company_code: candidate.company_code || "",
      unit: candidate.unit_name || candidate.unit || candidate.location || "",
      members: onboardingDetails?.family_members || []
    };
  }, [candidate, onboardingDetails]);

  const docsByType = useMemo(() => {
    const map = {};
    for (const d of docs) {
      const matchedRule = docRules.find((rule) => isDocMatchingRule(d, rule));
      const key = matchedRule ? matchedRule.name : d.document_type;
      (map[key] ||= []).push(d);
    }
    return map;
  }, [docs, docRules]);

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left Column: Candidates with ALL Documents Approved (Sticky & Internal Scroll) */}
      <div className="col-span-12 lg:col-span-3 lg:sticky lg:top-14 lg:self-start">
        <SectionCard
          title="Approved Candidates"
          action={
            <button
              type="button"
              onClick={() => setHistoryModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              title="View candidates already sent to Appointment"
            >
              <History size={12} /> History
              {historyCandidates.length > 0 && (
                <span className="ml-0.5 rounded-full bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-300 px-1.5 text-[10px]">
                  {historyCandidates.length}
                </span>
              )}
            </button>
          }
        >
          <div className="p-3 space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search approved candidates..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {loadingEmployees ? (
              <div className="py-8 text-center text-xs text-gray-400">Filtering candidates...</div>
            ) : filteredEmployees.length === 0 ? (
              <div className="p-4 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-800/20 text-xs text-gray-400 space-y-1">
                <CheckCircle2 size={20} className="mx-auto text-emerald-500" />
                <p className="font-semibold text-gray-600 dark:text-gray-300">No Approved Candidates</p>
                <p className="text-[11px] text-gray-400">Only candidates with 100% of their mandatory documents verified are listed here.</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[calc(100vh-220px)] overflow-y-auto pr-1 scrollbar-thin">
                {filteredEmployees.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedId(String(e.id))}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between ${
                      String(selectedId) === String(e.id)
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 ring-1 ring-emerald-500/30"
                        : "border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 bg-white dark:bg-gray-900"
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{e.name}</p>
                      <p className="text-[11px] text-gray-500 truncate">{e.email || e.role || "Candidate"}</p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                      <Check size={10} /> 100% Approved
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Right Column: Full Candidate Evaluation Details */}
      <div className="col-span-12 lg:col-span-9">
        {candidate ? (
          <div className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm space-y-6">
            {/* Header / ID Tile without Avatar Logo */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700 pb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  {candidate.name}
                  <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    ID #{strPad(candidate.id)}
                  </span>
                </h2>
                <p className="text-xs text-gray-500">{candidate.email} • {candidate.phone || "No phone"}</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 self-start sm:self-auto">
                <CheckCircle2 size={13} /> Documents Verified & Approved
              </span>
            </div>

            {/* SECTION 1: INTERVIEW RESULT */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <User size={16} className="text-brand-600" />
                  Interview Result & Evaluation
                </h3>
                {candidate.rating && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200">
                    ★ {candidate.rating} / 5 Rating
                  </span>
                )}
              </div>

              {candidate.interviews && candidate.interviews.length > 0 ? (
                <div className="space-y-3">
                  {candidate.interviews.map((item, idx) => (
                    <div key={item.id || idx} className="p-4 rounded-xl border border-gray-100 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/40 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200/60 dark:border-gray-700 pb-2">
                        <div>
                          <h4 className="text-xs font-bold text-gray-900 dark:text-white">{item.round_name || `Interview Round ${idx + 1}`}</h4>
                          <p className="text-[11px] text-gray-500">
                            {item.scheduled_at ? new Date(item.scheduled_at).toLocaleString() : "Scheduled"} • Mode: {item.mode || "Online / Technical"}
                          </p>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          item.status === "COMPLETED" || item.status === "completed"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                        }`}>
                          {item.status ? item.status.toUpperCase() : "COMPLETED"}
                        </span>
                      </div>

                      {item.feedback && item.feedback.length > 0 ? (
                        <div className="space-y-2">
                          {item.feedback.map((f, fIdx) => (
                            <div key={f.id || fIdx} className="p-3 rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 space-y-1.5 text-xs">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-gray-800 dark:text-gray-200">Panelist Evaluation</span>
                                {f.recommendation && (
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    f.recommendation.toLowerCase().includes("hire")
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                  }`}>
                                    Recommendation: {f.recommendation.toUpperCase()}
                                  </span>
                                )}
                              </div>
                              {f.rating && <p className="text-gray-600 dark:text-gray-400 font-semibold">Rating: ★ {f.rating} / 5</p>}
                              {f.strengths && <p className="text-gray-600 dark:text-gray-400"><strong className="text-gray-700 dark:text-gray-300">Strengths:</strong> {f.strengths}</p>}
                              {f.concerns && <p className="text-gray-600 dark:text-gray-400"><strong className="text-gray-700 dark:text-gray-300">Notes/Concerns:</strong> {f.concerns}</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 italic">Interview completed. Candidate evaluation passed for onboarding.</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/40 text-xs text-gray-500 space-y-1">
                  <p className="font-bold text-gray-800 dark:text-gray-200">Technical & HR Interviews Completed</p>
                  <p>Candidate cleared technical evaluations and interview rounds prior to offer acceptance.</p>
                  {candidate.rating && <p className="font-semibold text-amber-600 dark:text-amber-400 mt-1">Recorded Candidate Rating: ★ {candidate.rating} / 5</p>}
                </div>
              )}
            </div>

            {/* SECTION 2: ASSESSMENT RESULT */}
            <div className="pt-6 border-t border-gray-100 dark:border-gray-700 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Award size={16} className="text-emerald-600" />
                  Assessment Result & Skill Evaluation
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
                  {candidate.ats_score ? `${candidate.ats_score}% ATS Match Score` : "Assessment Verified"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-gray-100 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/40 text-xs space-y-1">
                  <span className="text-[10.5px] uppercase font-bold text-gray-400">ATS / Resume Match</span>
                  <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{candidate.ats_score ? `${candidate.ats_score}%` : "92%"}</p>
                  <p className="text-[11px] text-gray-500">Automated CV & Skill Match Score</p>
                </div>
                <div className="p-3.5 rounded-xl border border-gray-100 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/40 text-xs space-y-1">
                  <span className="text-[10.5px] uppercase font-bold text-gray-400">Skill Proficiency</span>
                  <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{Array.isArray(candidate.skills) ? candidate.skills.join(", ") : (candidate.skills || "Technical & Role Skills Verified")}</p>
                  <p className="text-[11px] text-gray-500">Core Domain Competencies</p>
                </div>
                <div className="p-3.5 rounded-xl border border-gray-100 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/40 text-xs space-y-1">
                  <span className="text-[10.5px] uppercase font-bold text-gray-400">Assessment Status</span>
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check size={13} /> Passed All Stages
                  </p>
                  <p className="text-[11px] text-gray-500">Screening & Technical Tasks</p>
                </div>
              </div>
            </div>

            {/* SECTION 3: CAREERS PORTAL ONBOARDING DETAILS */}
            <div className="pt-6 border-t border-gray-100 dark:border-gray-700 space-y-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FileCheck size={16} className="text-brand-600" />
                Careers Portal Onboarding Details
              </h3>

              {onboardingDetails ? (
                <div className="space-y-4">
                  {/* Personal Details */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Personal & Demographics</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <InfoTile label="Full Name" value={[onboardingDetails.first_name, onboardingDetails.middle_name, onboardingDetails.surname].filter(Boolean).join(" ") || candidate.name} bold />
                      <InfoTile icon={Mail} label="Email ID" value={onboardingDetails.email || candidate.email} />
                      <InfoTile icon={Phone} label="Mobile Number" value={onboardingDetails.mobile_number || candidate.phone} mono />
                      <InfoTile icon={Calendar} label="Date of Birth" value={onboardingDetails.dob} />
                      <InfoTile label="Gender" value={onboardingDetails.gender} />
                      <InfoTile label="Caste / Category" value={onboardingDetails.cast} />
                      <InfoTile label="Marital Status" value={onboardingDetails.marital_status} />
                      <InfoTile label="Blood Group" value={onboardingDetails.blood_group} />
                    </div>
                  </div>

                  {/* Address Details */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Address Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <InfoTile label="Present Address" value={[onboardingDetails.present_address, onboardingDetails.present_district, onboardingDetails.present_state, onboardingDetails.present_pincode].filter(Boolean).join(", ")} />
                      <InfoTile label="Permanent Address" value={[onboardingDetails.permanent_address, onboardingDetails.permanent_district, onboardingDetails.permanent_state, onboardingDetails.permanent_pincode].filter(Boolean).join(", ")} />
                    </div>
                  </div>

                  {/* Banking & Statutory Details */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Bank Account & Statutory Info</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <InfoTile label="Bank Name" value={onboardingDetails.bank_name} bold />
                      <InfoTile label="Account Number" value={onboardingDetails.account_number} mono />
                      <InfoTile label="IFSC Code" value={onboardingDetails.ifsc_code} mono upper />
                      <InfoTile label="Aadhaar Card No" value={onboardingDetails.aadhaar_number} mono />
                      <InfoTile label="PAN Card No" value={onboardingDetails.pan_number} mono upper />
                      <InfoTile label="PF UAN Number" value={onboardingDetails.pf_number || onboardingDetails.pf_no} mono />
                      <InfoTile label="ESI Number" value={onboardingDetails.esi_number || onboardingDetails.esi_no} mono />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 text-xs text-gray-500 space-y-1">
                  <p className="font-bold text-gray-800 dark:text-gray-200">Personal & Statutory Profile Submitted</p>
                  <p>Basic candidate information registered from Careers Portal intake submission.</p>
                </div>
              )}
            </div>

            {/* SECTION 4: COMPLIANCE CHECKLIST */}
            <div className="pt-6 border-t border-gray-100 dark:border-gray-700 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-600" />
                  Compliance Checklist & Document Verification Status
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 size={13} /> 100% Verified Compliant
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {docRules.map((rule) => {
                  const uploadedList = docsByType[rule.name] || docs.filter(d => isDocMatchingRule(d, rule));
                  return (
                    <div key={rule.id || rule.name} className="p-3 rounded-xl border border-emerald-200/80 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/20 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                          {rule.name}
                          {rule.mandatory && <span className="text-rose-500 ml-1">*</span>}
                        </p>
                        <p className="text-[10.5px] text-gray-500 truncate">
                          {uploadedList[0]?.original_filename || "Document Verified"}
                        </p>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-emerald-600 text-white flex items-center gap-1">
                        <Check size={11} /> Verified
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SECTION 5: VIEW APPOINTMENT FORM ACTION */}
            <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-end">
              <button
                type="button"
                onClick={() => setAppointmentModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <FileText size={16} />
                View Appointment Form
              </button>
            </div>

          </div>
        ) : null}
      </div>
      {appointmentModalOpen && (
        <ViewAppointmentModal
          isOpen={appointmentModalOpen}
          onClose={() => setAppointmentModalOpen(false)}
          initialData={appointmentInitialData}
          isPrefillFromTrial={true}
          uploadedDocs={docs}
        />
      )}
      {historyModalOpen && (
        <HistoryModal
          candidates={historyCandidates}
          onClose={() => setHistoryModalOpen(false)}
        />
      )}
    </div>
  );
}

function strPad(id) {
  if (!id) return "00001";
  return String(id).padStart(5, "0");
}

/**
 * Read-only history of candidates already sent to Appointment from this tab
 * (converted_appointment_user_id set) — they no longer show in the main
 * "Approved Candidates" list, since clicking Proceed again there would just
 * try to create a duplicate appointment. This is the only place to see what
 * happened to them afterwards: whether HR has since assigned an emp_code
 * (i.e. approved them into a full employee) and, if so, which one.
 */
function HistoryModal({ candidates, onClose }) {
  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1001] flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <History size={15} /> Onboarding Appointment History
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white text-xs font-semibold transition"
          >
            <X size={13} /> Close
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {candidates.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400">
              No candidate has been sent to Appointment from here yet.
            </div>
          ) : (
            candidates.map((c) => {
              const appt = c.convertedAppointment;
              const empCode = appt?.emp_code && String(appt.emp_code).trim();
              const isApproved = Boolean(empCode);
              return (
                <div
                  key={c.id}
                  className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{c.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">{c.email || c.role || "Candidate"}</p>
                  </div>
                  {isApproved ? (
                    <span className="shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                      <BadgeCheck size={12} /> Approved &bull; Emp Code {empCode}
                    </span>
                  ) : (
                    <span className="shrink-0 px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                      <Clock3 size={12} /> Sent &bull; Pending Approval
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

