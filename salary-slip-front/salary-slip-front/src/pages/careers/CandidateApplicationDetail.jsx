import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import {
  FileText,
  Calendar,
  Clock,
  MapPin,
  Video,
  PhoneCall,
  Download,
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Sparkles,
  ExternalLink,
  BookOpen,
  CheckCircle2,
  Mail,
  ShieldCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import { candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";
import { copyToClipboard } from "../../utils/clipboard";
import OfferLetterCard from "../../components/careers/OfferLetterCard";
import OnboardingDetailsForm from "../../components/careers/OnboardingDetailsForm";

const PIPELINE_STEPS = [
  { key: "applied", label: "Applied" },
  { key: "screening", label: "Screening" },
  { key: "assessment", label: "Assessment" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer & Decision" },
  { key: "onboarding", label: "Onboarding" },
];

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatCompany(code) {
  const map = {
    NISS: "NISS Security",
    NBS: "NBS Business",
    NMS: "NMS Services",
    APS: "APS Protective",
  };
  return map[code] || code || "NISS Group";
}

const INTERVIEW_MODES = {
  video: { label: "Virtual Video Call", icon: Video, color: "text-blue-600 bg-blue-50 border-blue-200" },
  in_person: { label: "In-Person Interview", icon: MapPin, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  phone: { label: "Telephonic Round", icon: PhoneCall, color: "text-amber-600 bg-amber-50 border-amber-200" },
};

export default function CandidateApplicationDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { token } = useCandidateAuth();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resumeObjectUrl, setResumeObjectUrl] = useState(null);
  const [copiedLinkIndex, setCopiedLinkIndex] = useState(null);
  const [copiedQuizIndex, setCopiedQuizIndex] = useState(null);

  const initialTab = searchParams.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(initialTab);

  const loadData = useCallback(async () => {
    if (!token || !id) return;
    try {
      setLoading(true);
      const res = await candidateApi.getApplication(id, token);
      if (res && res.status) {
        setApplication(res.data);
      } else {
        setError(res?.message || "Failed to load application details.");
      }
    } catch (err) {
      console.error("Load error:", err);
      setError(err?.response?.data?.message || err?.message || "Unable to load details.");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    let active = true;
    if (token && id) {
      candidateApi.getApplication(id, token).then((res) => {
        if (!active) return;
        if (res && res.status) {
          setApplication(res.data);
        } else {
          setError(res?.message || "Failed to load application details.");
        }
      }).catch((err) => {
        if (!active) return;
        setError(err?.response?.data?.message || err?.message || "Unable to load details.");
      }).finally(() => {
        if (active) setLoading(false);
      });
    }
    return () => { active = false; };
  }, [id, token]);

  // Load resume blob for inline preview/download if candidate has a resume
  useEffect(() => {
    let active = true;
    let url = null;
    if (token && id && application?.resume_path) {
      candidateApi
        .downloadResume(id, token)
        .then((blob) => {
          if (active && blob && blob.size > 0) {
            url = URL.createObjectURL(blob);
            setResumeObjectUrl(url);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, token, application?.resume_path]);

  const handleCopyLink = async (link, index) => {
    const ok = await copyToClipboard(link);
    if (ok) {
      setCopiedLinkIndex(index);
      toast.success("Meeting link copied to clipboard");
      setTimeout(() => setCopiedLinkIndex(null), 2500);
    } else {
      toast.error("Failed to copy link");
    }
  };

  const handleCopyQuizLink = async (link, index) => {
    const ok = await copyToClipboard(link);
    if (ok) {
      setCopiedQuizIndex(index);
      toast.success("Assessment link copied to clipboard");
      setTimeout(() => setCopiedQuizIndex(null), 2500);
    } else {
      toast.error("Failed to copy link");
    }
  };

  if (loading && !application) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50/50 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-6">
          <div className="h-6 w-32 bg-slate-200 animate-pulse rounded-md" />
          <div className="h-44 bg-white border border-slate-200 animate-pulse rounded-2xl" />
          <div className="h-64 bg-white border border-slate-200 animate-pulse rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50/50 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <AlertCircle size={28} className="mx-auto text-slate-400" />
            <h3 className="mt-3 text-base font-semibold text-slate-900">Application Not Found</h3>
            <p className="mt-1 text-xs text-slate-500">{error || "Unable to retrieve this record."}</p>
            <Link
              to="/careers/account/applications"
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 hover:underline"
            >
              <ArrowLeft size={14} /> Back to My Applications
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const latestOffer = application.latest_offer || application.offers?.[0] || null;
  const isOfferAccepted = application.stage === "offer_accepted" || latestOffer?.status === "accepted";
  const isOfferPending = Boolean(latestOffer && ["released", "approved", "draft"].includes(latestOffer.status));
  const interviews = application.interviews || [];
  const communications = application.communications || [];
  const assessments = application.assessments || [];
  const currentStage = application.stage || "applied";

  // Sequential Stage Gating - Only show tabs when their step is reached in the pipeline
  const hasAssessmentTab =
    assessments.length > 0 ||
    ["assessment", "interview", "selected", "offer_sent", "offer_accepted", "onboarding", "hired"].includes(currentStage);

  const hasInterviewTab =
    interviews.length > 0 ||
    ["interview", "selected", "offer_sent", "offer_accepted", "onboarding", "hired"].includes(currentStage);

  const hasMessagesTab = communications.length > 0;

  const hasOfferTab = Boolean(
    latestOffer || ["selected", "offer_sent", "offer_accepted", "onboarding", "hired"].includes(currentStage)
  );

  // Onboarding only appears once HR has actually clicked "Process" for this
  // candidate (is_onboarding_available reflects onboarding_initiated_at on
  // the backend) — do NOT fall back to onboarding_status/stage here, since
  // onboarding_status defaults to the truthy string "NOT_STARTED" and stage
  // reaches "offer_accepted" long before HR processes onboarding.
  const hasOnboardingTab = Boolean(application.is_onboarding_available);

  // Fallback activeTab if the currently selected tab is hidden
  const validTabs = ["overview"];
  if (hasAssessmentTab) validTabs.push("assessment");
  if (hasInterviewTab) validTabs.push("interviews");
  if (hasMessagesTab) validTabs.push("messages");
  if (hasOfferTab) validTabs.push("offer");
  if (hasOnboardingTab) validTabs.push("onboarding");

  const currentTab = validTabs.includes(activeTab) ? activeTab : "overview";

  // Compute stage index for stepper
  const getStepStatus = (idx) => {
    // idx: 0=applied, 1=screening, 2=assessment, 3=interview, 4=offer, 5=onboarding
    if (idx === 0) return "completed";

    if (idx === 1) {
      if (["screening", "shortlisted"].includes(currentStage)) return "current";
      if (["assessment", "interview", "selected", "offer_sent", "offer_accepted", "onboarding", "hired"].includes(currentStage)) return "completed";
      return "upcoming";
    }

    if (idx === 2) {
      if (currentStage === "assessment") return "current";
      if (["interview", "selected", "offer_sent", "offer_accepted", "onboarding", "hired"].includes(currentStage)) return "completed";
      return "upcoming";
    }

    if (idx === 3) {
      if (currentStage === "interview") return "current";
      if (["selected", "offer_sent", "offer_accepted", "onboarding", "hired"].includes(currentStage)) return "completed";
      return "upcoming";
    }

    if (idx === 4) {
      if (isOfferAccepted || ["onboarding", "hired"].includes(currentStage)) return "completed";
      if (["selected", "offer_sent"].includes(currentStage) || isOfferPending) return "current";
      return "upcoming";
    }

    if (idx === 5) {
      if (currentStage === "hired") return "completed";
      if (["onboarding", "offer_accepted"].includes(currentStage) || hasOnboardingTab) return "current";
      return "upcoming";
    }

    return "upcoming";
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/60 py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-6">
        
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <Link
            to="/careers/account/applications"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-900 transition"
          >
            <ArrowLeft size={15} />
            <span>Back to Applications</span>
          </Link>
          <span className="text-xs font-mono font-medium text-slate-400 bg-white border border-slate-200/80 px-2.5 py-1 rounded-md">
            ID: #{String(application.id).padStart(4, "0")}
          </span>
        </div>

        {/* Master Header Card */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-7 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>{application.department || "General"}</span>
                <span className="text-slate-300">•</span>
                <span>{formatCompany(application.company_code)}</span>
              </div>
              <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                {application.job_title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Calendar size={13} className="text-slate-400" />
                  Applied {formatDate(application.applied_at)}
                </span>
                {application.resume_name && (
                  <span className="flex items-center gap-1.5">
                    <FileText size={13} className="text-slate-400" />
                    <span>{application.resume_name}</span>
                    {resumeObjectUrl && (
                      <a
                        href={resumeObjectUrl}
                        download={application.resume_name}
                        className="ml-0.5 inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-900 hover:underline"
                      >
                        <Download size={12} /> Download
                      </a>
                    )}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {currentStage === "offer_accepted" ? "Pending Onboarding" : (application.status_label || currentStage)}
              </span>

              {isOfferAccepted ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                  <Check size={13} /> Offer Accepted
                </span>
              ) : isOfferPending ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  <Sparkles size={12} className="text-amber-600" /> Action Required
                </span>
              ) : null}
            </div>
          </div>

          {/* Pipeline Progress Stepper */}
          <div className="mt-8 border-t border-slate-100 pt-8 pb-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-6">
              Application Pipeline Progress
            </p>

            <div className="relative">
              <div className="absolute top-3 left-0 w-full h-0.5 bg-slate-100 rounded-full" />
              
              <div className="relative flex justify-between">
                {PIPELINE_STEPS.map((step, idx) => {
                  const status = getStepStatus(idx);
                  const isCompleted = status === "completed";
                  const isCurrent = status === "current";
                  
                  return (
                    <div key={step.key} className="flex flex-col items-center relative z-10 w-16 sm:w-24">
                      {isCompleted ? (
                        <div className="h-6 w-6 rounded-full bg-emerald-500 text-white flex items-center justify-center ring-4 ring-white shadow-sm transition-transform duration-300 hover:scale-110">
                          <Check size={12} strokeWidth={3} />
                        </div>
                      ) : isCurrent ? (
                        <div className="h-6 w-6 rounded-full bg-blue-600 border-2 border-white text-white flex items-center justify-center ring-4 ring-blue-50 shadow-sm">
                          <div className="h-2 w-2 bg-white rounded-full animate-pulse" />
                        </div>
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-slate-100 border-2 border-white text-slate-400 flex items-center justify-center ring-4 ring-white">
                          <span className="text-[10px] font-bold">{idx + 1}</span>
                        </div>
                      )}
                      <p className={`mt-3 text-[11px] text-center ${
                        isCompleted ? "font-semibold text-slate-800" 
                        : isCurrent ? "font-bold text-blue-600" 
                        : "font-medium text-slate-400"
                      }`}>
                        {step.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Clean Segmented Tabs (Rendered Line-by-line / Step-by-step) */}
          <div className="mt-8 border-b border-slate-200 flex flex-wrap items-center gap-1 text-xs font-medium">
            <button
              onClick={() => setActiveTab("overview")}
              className={`pb-3 px-3 transition-colors border-b-2 font-semibold ${
                currentTab === "overview"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Overview
            </button>

            {hasAssessmentTab && (
              <button
                onClick={() => setActiveTab("assessment")}
                className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 font-semibold ${
                  currentTab === "assessment"
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>Assessment</span>
                {assessments.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                    {assessments.length}
                  </span>
                )}
              </button>
            )}

            {hasInterviewTab && (
              <button
                onClick={() => setActiveTab("interviews")}
                className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 font-semibold ${
                  currentTab === "interviews"
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>Interviews</span>
                {interviews.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                    {interviews.length}
                  </span>
                )}
              </button>
            )}

            {hasMessagesTab && (
              <button
                onClick={() => setActiveTab("messages")}
                className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 font-semibold ${
                  currentTab === "messages"
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>Messages</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                  {communications.length}
                </span>
              </button>
            )}

            {hasOfferTab && (
              <button
                onClick={() => setActiveTab("offer")}
                className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 font-semibold ${
                  currentTab === "offer"
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>Offer Letter</span>
                {isOfferPending && !isOfferAccepted && (
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                )}
              </button>
            )}

            {hasOnboardingTab && (
              <button
                onClick={() => setActiveTab("onboarding")}
                className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 font-semibold ${
                  currentTab === "onboarding"
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <ShieldCheck size={14} className="text-blue-600" />
                <span>Onboarding Details</span>
              </button>
            )}
          </div>

          {/* Tab Content Container */}
          <div className="mt-6">
            
            {/* 1. OVERVIEW TAB */}
            {currentTab === "overview" && (
              <div className="space-y-6">
                {/* Official Offer Quick Callout on Overview */}
                {latestOffer && (
                  <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                        <FileText size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-emerald-200/80 px-2 py-0.5 text-[10px] font-mono font-bold uppercase text-emerald-900">
                            {latestOffer.status === "accepted" ? "Offer Accepted" : latestOffer.status === "rejected" ? "Offer Declined" : "Action Required • Offer Ready"}
                          </span>
                          <span className="text-xs font-bold text-emerald-900">
                            ₹{Number(latestOffer.ctc_annual || 0).toLocaleString("en-IN")} Annual CTC
                          </span>
                        </div>
                        <h4 className="mt-1 text-sm font-bold text-slate-900">
                          Formal Offer Letter: {latestOffer.designation || application.job_title}
                        </h4>
                        <p className="mt-0.5 text-xs text-slate-600">
                          {latestOffer.status === "accepted"
                            ? "You have accepted the offer letter. Proceed to Onboarding Details."
                            : latestOffer.status === "rejected"
                            ? "You have declined this offer."
                            : "Please review the formal terms, compensation structure, and confirm your decision."}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab(isOfferAccepted && hasOnboardingTab ? "onboarding" : "offer")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-black transition active:scale-95 shrink-0"
                    >
                      {latestOffer.status === "accepted" ? (hasOnboardingTab ? "Open Onboarding Details" : "View Offer Letter") : "Review & Decide Offer"} &rarr;
                    </button>
                  </div>
                )}

                {/* Grid details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-200/80 bg-white p-4 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Application Info</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Position</span>
                        <span className="font-semibold text-slate-900">{application.job_title}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Department</span>
                        <span className="font-semibold text-slate-900">{application.department || "General"}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Company Unit</span>
                        <span className="font-semibold text-slate-900">{formatCompany(application.company_code)}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-500">Current Pipeline Stage</span>
                        <span className="font-semibold text-blue-600 capitalize">
                          {currentStage === "offer_accepted" ? "Pending Onboarding" : currentStage}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/80 bg-white p-4 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Candidate Details</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Full Name</span>
                        <span className="font-semibold text-slate-900">{application.candidate?.name || "—"}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Email Address</span>
                        <span className="font-semibold text-slate-900">{application.candidate?.email || "—"}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Mobile Number</span>
                        <span className="font-semibold text-slate-900">{application.candidate?.phone || "—"}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-500">Applied On</span>
                        <span className="font-semibold text-slate-900">{formatDate(application.applied_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. ASSESSMENT TAB (Placed before Interviews) */}
            {currentTab === "assessment" && hasAssessmentTab && (
              <div className="space-y-4">
                {assessments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
                    <BookOpen size={26} className="mx-auto text-slate-300" />
                    <h3 className="mt-3 text-sm font-bold text-slate-900">No Assessments Assigned Yet</h3>
                    <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                      If an assessment or aptitude test is scheduled for your application, the link and details will appear here.
                    </p>
                  </div>
                ) : (
                  assessments.map((assessment, idx) => {
                    const isCompleted = Boolean(assessment.status === "COMPLETED" || assessment.completed_at || assessment.score !== null);
                    const quizLink = assessment.quiz_url || `${window.location.origin}/candidate-quiz/${assessment.token}`;

                    return (
                      <div
                        key={assessment.id || idx}
                        className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-4"
                      >
                        {/* Assessment Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-md bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-700">
                                Assessment #{idx + 1}
                              </span>
                              {isCompleted ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                  <CheckCircle2 size={12} /> Completed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                                  <Clock size={12} /> Pending Submission
                                </span>
                              )}
                            </div>
                            <h3 className="mt-2 text-base font-bold text-slate-900">{assessment.title}</h3>
                            {assessment.description && (
                              <p className="mt-1 text-xs text-slate-500">{assessment.description}</p>
                            )}
                          </div>

                          {/* Quick Score Badge if Completed */}
                          {isCompleted && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2 text-right">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Score & Marks</p>
                              <p className="text-base font-black text-emerald-900">
                                {assessment.score !== null && assessment.score !== undefined
                                  ? `${assessment.score} Marks`
                                  : `${assessment.percentage || 0}%`}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Meta information row */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/70 text-xs">
                          <div>
                            <p className="text-[10px] font-bold uppercase text-slate-400">Duration</p>
                            <p className="font-semibold text-slate-800">{assessment.duration_minutes || 30} Mins</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase text-slate-400">Total Questions</p>
                            <p className="font-semibold text-slate-800">{assessment.total_questions || "—"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase text-slate-400">Passing Criteria</p>
                            <p className="font-semibold text-slate-800">{assessment.passing_percentage || 60}%</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase text-slate-400">Status</p>
                            <p className="font-semibold text-slate-800 capitalize">
                              {isCompleted ? "Completed" : "Open to Attempt"}
                            </p>
                          </div>
                        </div>

                        {/* Action row */}
                        {!isCompleted ? (
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-blue-50/60 p-4 rounded-xl border border-blue-200/80">
                            <div>
                              <p className="text-xs font-bold text-blue-950">Assessment Link Ready</p>
                              <p className="text-[11px] text-blue-800">
                                Complete this test in one sitting with a stable internet connection.
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleCopyQuizLink(quizLink, idx)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                              >
                                {copiedQuizIndex === idx ? (
                                  <>
                                    <Check size={12} className="text-emerald-600" />
                                    <span className="text-emerald-600 font-bold">Copied Link</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={12} />
                                    <span>Copy Link</span>
                                  </>
                                )}
                              </button>
                              <a
                                href={quizLink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
                              >
                                <span>Start Assessment</span>
                                <ExternalLink size={13} />
                              </a>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                            <span>Completed at: {formatDateTime(assessment.completed_at)}</span>
                            {assessment.passed !== null && (
                              <span
                                className={`font-bold ${
                                  assessment.passed ? "text-emerald-600" : "text-amber-600"
                                }`}
                              >
                                Result: {assessment.passed ? "Passed" : "Completed"}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* 3. INTERVIEWS TAB */}
            {currentTab === "interviews" && hasInterviewTab && (
              <div className="space-y-4">
                {interviews.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
                    <Calendar size={24} className="mx-auto text-slate-300" />
                    <h3 className="mt-3 text-sm font-bold text-slate-900">No Interviews Scheduled</h3>
                    <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                      When an interview round is scheduled with the hiring manager, details will be listed here.
                    </p>
                  </div>
                ) : (
                  interviews.map((interview, index) => {
                    const mode = INTERVIEW_MODES[interview.interview_mode] || INTERVIEW_MODES.video;
                    const ModeIcon = mode.icon;
                    const isVideo = interview.interview_mode === "video";
                    const isOnsite = interview.interview_mode === "in_person";
                    const isPhone = interview.interview_mode === "phone";

                    return (
                      <div
                        key={interview.id || index}
                        className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-5"
                      >
                        {/* Interview Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-700">
                                Round #{index + 1}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${mode.color}`}
                              >
                                <ModeIcon size={12} />
                                {mode.label}
                              </span>
                            </div>
                            <h3 className="mt-2 text-base font-bold text-slate-900">
                              {interview.round_name || "Interview Discussion"}
                            </h3>
                          </div>

                          <span className="rounded-full bg-slate-50 border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700 self-start sm:self-auto capitalize">
                            {interview.status || "Scheduled"}
                          </span>
                        </div>

                        {/* Timing Block */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/70">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600">
                              <Calendar size={16} />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Date</p>
                              <p className="text-xs font-bold text-slate-900">
                                {interview.scheduled_at ? formatDate(interview.scheduled_at) : "TBD"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600">
                              <Clock size={16} />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Time</p>
                              <p className="text-xs font-bold text-slate-900">
                                {interview.scheduled_at
                                  ? new Date(interview.scheduled_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                                  : "TBD"}
                                {interview.duration_minutes ? ` (${interview.duration_minutes} mins)` : ""}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Mode Specific Details */}
                        {isVideo && (
                          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                              <Video size={14} className="text-slate-600" />
                              <span>Meeting Link</span>
                            </div>

                            {interview.meeting_link ? (
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                                <span className="text-xs font-mono text-slate-700 truncate">
                                  {interview.meeting_link}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyLink(interview.meeting_link, index)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition active:scale-95 shrink-0"
                                >
                                  {copiedLinkIndex === index ? (
                                    <>
                                      <Check size={12} className="text-emerald-600" />
                                      <span className="text-emerald-600 font-bold">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={12} />
                                      <span>Copy Link</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 italic">
                                The video call link will be provided prior to the interview.
                              </p>
                            )}
                          </div>
                        )}

                        {isOnsite && (
                          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                              <MapPin size={14} className="text-slate-600" />
                              <span>Venue & Location</span>
                            </div>
                            <p className="text-xs font-semibold text-slate-800">
                              {formatCompany(application.company_code)}
                              {application.unit ? ` — ${application.unit}` : ""}
                            </p>
                            <p className="text-xs text-slate-500">
                              Please report to the main reception 10 minutes before the scheduled time with a valid photo ID.
                            </p>
                          </div>
                        )}

                        {isPhone && (
                          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                              <PhoneCall size={14} className="text-slate-600" />
                              <span>Telephonic Call</span>
                            </div>
                            <p className="text-xs text-slate-600">
                              The interviewer will call your registered phone number directly at the scheduled time.
                            </p>
                          </div>
                        )}

                        {/* Recruiter Notes */}
                        {interview.notes && (
                          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-1.5">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              Recruiter Instructions
                            </p>
                            <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                              {interview.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* 4. MESSAGES TAB */}
            {currentTab === "messages" && hasMessagesTab && (
              <div className="space-y-3">
                {communications.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
                    <Mail size={24} className="mx-auto text-slate-300" />
                    <h3 className="mt-3 text-sm font-bold text-slate-900">No Messages Yet</h3>
                    <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                      Formal updates and recruiter communications will be recorded here.
                    </p>
                  </div>
                ) : (
                  communications.map((comm) => (
                    <div
                      key={comm.id}
                      className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-bold uppercase text-slate-600">
                            {comm.type || "EMAIL"}
                          </span>
                          <h4 className="text-xs font-bold text-slate-900">{comm.subject}</h4>
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {formatDateTime(comm.created_at)}
                        </span>
                      </div>
                      {comm.body && (
                        <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed pt-1">
                          {comm.body}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 5. OFFER LETTER TAB */}
            {currentTab === "offer" && hasOfferTab && (
              latestOffer ? (
                <OfferLetterCard
                  offer={latestOffer}
                  applicationId={application.id}
                  showActions={latestOffer.status !== "accepted" && latestOffer.status !== "rejected"}
                  token={token}
                  onOfferResponded={loadData}
                />
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
                  <FileText size={24} className="mx-auto text-slate-300" />
                  <h3 className="mt-3 text-base font-bold text-slate-900">Offer Package in Preparation</h3>
                  <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                    The HR team is currently drafting your official offer letter and compensation terms. You will receive an update once it is released.
                  </p>
                </div>
              )
            )}

            {/* 6. ONBOARDING DETAILS TAB */}
            {currentTab === "onboarding" && hasOnboardingTab && (
              <OnboardingDetailsForm application={application} onRefresh={loadData} token={token} />
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
