import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, Upload, AlertCircle, Lock, MapPin, Briefcase,
  Users, Calendar, Share2, Sparkles, Building, Gem, ShieldCheck,
  Award, HeartHandshake, Check, Clock, ChevronRight, X
} from "lucide-react";
import toast from "react-hot-toast";
import { copyToClipboard } from "../../utils/clipboard";
import DOMPurify from "dompurify";
import { publicJobApi, candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/candidate-auth-context";
import { resolveJobBranding, formatEmploymentType, formatExperience } from "../../config/careersTheme";
import SaveJobButton from "../../components/careers/SaveJobButton";
import ResendVerificationButton from "../../components/careers/ResendVerificationButton";
import { profileCompletion } from "../../utils/candidateProfile";

function isJobClosed(job) {
  if (!job?.target_closing_date) return false;
  const closing = new Date(job.target_closing_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return closing < today;
}

export default function JobDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { candidate, token, isAuthenticated } = useCandidateAuth();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [applyModalOpen, setApplyModalOpen] = useState(false);

  const [resumeFile, setResumeFile] = useState(null);
  const [phone, setPhone] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [currentDesignation, setCurrentDesignation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);
  const [initiallySaved, setInitiallySaved] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setNotFound(false);
    publicJobApi
      .getJob(slug)
      .then((res) => {
        if (res.status) setJob(res.data);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!isAuthenticated || !job) return;
    candidateApi.getSavedJobs(token)
      .then((res) => {
        if (res.status) setInitiallySaved((res.data || []).some((row) => row.job.id === job.id));
      })
      .catch(() => {});
  }, [isAuthenticated, token, job]);

  useEffect(() => {
    if (candidate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhone(candidate.phone || "");
      setExperienceYears(candidate.experience_years || "");
      setCurrentCompany(candidate.current_company || "");
      setCurrentDesignation(candidate.current_designation || "");
    }
  }, [candidate]);

  const handleShare = async () => {
    const ok = await copyToClipboard(window.location.href); if (ok) toast.success("Job link copied to clipboard!"); else toast.error("Failed to copy link");
  };

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    if (!resumeFile) {
      toast.error("Please upload your resume file.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("resume", resumeFile);
      if (phone) formData.append("phone", phone);
      if (experienceYears) formData.append("experience_years", experienceYears);
      if (currentCompany) formData.append("current_company", currentCompany);
      if (currentDesignation) formData.append("current_designation", currentDesignation);

      const res = await candidateApi.apply(slug, formData, token);
      if (res.status) {
        toast.success("Application submitted successfully!");
        setAppliedSuccess(true);
        setApplyModalOpen(false);
      }
    } catch (err) {
      toast.error(err.message || "Failed to submit application");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="h-96 animate-pulse rounded-3xl border border-gray-200 bg-white p-8" />
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-red-50 text-red-500 mb-4 shadow-inner">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Job Listing Not Found</h2>
        <p className="mt-1.5 text-xs text-gray-500">This posting may have closed, expired, or been removed.</p>
        <Link
          to="/careers"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-700 shadow-md shadow-brand-500/20"
        >
          <ArrowLeft size={14} /> Back to Open Positions
        </Link>
      </div>
    );
  }

  const branding = resolveJobBranding(job);
  const closed = isJobClosed(job);
  const profileIncomplete = isAuthenticated && candidate?.email_verified_at && profileCompletion(candidate) < 100;

  const handleApplyClick = () => {
    if (profileIncomplete) {
      toast.error("Please complete your profile before applying.");
    }
    setApplyModalOpen(true);
  };

  return (
    <div data-theme={branding.theme} className="min-h-[calc(100vh-4rem)] bg-[#fafafc] pb-28 sm:pb-20">
      {/* ────────────────── 1. Top Breadcrumb & Hero Header ────────────────── */}
      <section className="border-b border-gray-200/80 bg-white pt-8 pb-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center justify-between gap-4">
            <Link
              to="/careers"
              className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-brand-600 transition-colors"
            >
              <ArrowLeft size={14} /> Back to Open Positions
            </Link>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
              >
                <Share2 size={13} /> Share Role
              </button>
              <SaveJobButton jobId={job.id} initialSaved={initiallySaved} />
            </div>
          </div>

          {/* Job Title & Badges */}
          <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-700 border border-brand-200/60">
                  <Building size={13} /> {branding.shortName}
                </span>
                {job.department?.name && (
                  <span className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
                    {job.department.name}
                  </span>
                )}
                {closed ? (
                  <span className="inline-flex items-center rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">
                    Closed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200/60">
                    <Sparkles size={11} /> Actively Hiring
                  </span>
                )}
              </div>

              <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight leading-tight">
                {job.title}
              </h1>
              {job.designation && (
                <p className="mt-1.5 text-sm font-medium text-gray-500">{job.designation}</p>
              )}

              {/* Metadata Quick Chips */}
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-gray-600">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={14} className="text-gray-400" />
                  {branding.city}{job.unit ? ` · ${job.unit}` : ""}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase size={14} className="text-gray-400" />
                  {formatEmploymentType(job.employment_type)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users size={14} className="text-gray-400" />
                  {formatExperience(job)}
                </span>
                {job.target_closing_date && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar size={14} className="text-gray-400" />
                    {closed ? "Closed" : "Closes"} {new Date(job.target_closing_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                )}
              </div>
            </div>

            {/* Desktop Apply Button CTA in Header */}
            <div className="hidden md:flex flex-col items-end gap-2 flex-shrink-0">
              {closed ? (
                <button disabled className="cursor-not-allowed rounded-xl bg-gray-200 px-6 py-3 text-xs font-bold text-gray-500">
                  Position Closed
                </button>
              ) : (
                <button
                  onClick={handleApplyClick}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-7 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/25 hover:from-brand-500 hover:to-indigo-500 active:scale-95 transition-all"
                >
                  <span>Apply For This Role</span>
                  <ChevronRight size={16} />
                </button>
              )}
              {profileIncomplete && (
                <p className="text-[11px] font-semibold text-amber-700">Complete profile to apply</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────── 2. Content & Sidebar Grid ────────────────── */}
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
          {/* Main content column */}
          <div className="min-w-0 space-y-8">
            {appliedSuccess && (
              <div className="flex flex-col items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between animate-in fade-in">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 flex-shrink-0">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-900 text-base">Application Submitted Successfully!</h4>
                    <p className="mt-0.5 text-xs text-emerald-700 leading-relaxed">
                      Our talent acquisition team has received your resume and details. You can track progress in real-time.
                    </p>
                  </div>
                </div>
                <Link
                  to="/careers/account/applications"
                  className="whitespace-nowrap rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm"
                >
                  View My Applications
                </Link>
              </div>
            )}

            {/* About the Role */}
            {job.description && (
              <div className="rounded-3xl border border-gray-200/80 bg-white p-7 sm:p-9 shadow-sm">
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-4">
                  <Briefcase size={18} className="text-brand-600" />
                  About the Role
                </h3>
                <div
                  className="prose prose-sm mt-5 max-w-none text-gray-700 leading-relaxed prose-headings:text-gray-900 prose-headings:font-bold prose-a:text-brand-600 prose-strong:text-gray-900 marker:text-brand-500"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.description) }}
                />
              </div>
            )}

            {/* What you'll bring */}
            {job.requirements && (
              <div className="rounded-3xl border border-gray-200/80 bg-white p-7 sm:p-9 shadow-sm">
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-4">
                  <Award size={18} className="text-indigo-600" />
                  What You'll Bring
                </h3>
                <div
                  className="prose prose-sm mt-5 max-w-none text-gray-700 leading-relaxed prose-headings:text-gray-900 prose-headings:font-bold prose-a:text-brand-600 prose-strong:text-gray-900 marker:text-brand-500"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.requirements) }}
                />
              </div>
            )}

            {/* What We Offer (Perks & Benefits) */}
            <div className="rounded-3xl border border-gray-200/80 bg-white p-7 sm:p-9 shadow-sm">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-4">
                <HeartHandshake size={18} className="text-emerald-600" />
                Perks & Benefits at NISS
              </h3>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <PerkCard
                  icon={<Gem size={18} className="text-brand-600" />}
                  title="Competitive Compensation"
                  desc="Timely payroll, industry-standard remuneration, and performance rewards."
                />
                <PerkCard
                  icon={<ShieldCheck size={18} className="text-emerald-600" />}
                  title="Health & Safety Coverage"
                  desc="Comprehensive medical coverage, safe air-conditioned floor, and accident cover."
                />
                <PerkCard
                  icon={<Sparkles size={18} className="text-purple-600" />}
                  title="Continuous Learning"
                  desc="Hands-on training with modern precision laser cutting and textile machinery."
                />
                <PerkCard
                  icon={<Users size={18} className="text-amber-600" />}
                  title="Collaborative Culture"
                  desc="Supportive peer environment, mentorship, and equal growth opportunities."
                />
              </div>
            </div>

            {/* Hiring Process Roadmap */}
            <div className="rounded-3xl border border-gray-200/80 bg-white p-7 sm:p-9 shadow-sm">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-4">
                <Clock size={18} className="text-purple-600" />
                Our Hiring Process
              </h3>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-4 relative">
                <StepItem step="1" title="Apply Online" desc="Submit your resume & profile" />
                <StepItem step="2" title="Screening" desc="Recruiter review within 48h" />
                <StepItem step="3" title="Assessment" desc="Skills test or online quiz" />
                <StepItem step="4" title="Final Offer" desc="Interview & onboarding" />
              </div>
            </div>
          </div>

          {/* Sticky Desktop Application Sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-3xl border border-gray-200/80 bg-white p-6 shadow-xl shadow-gray-200/40 space-y-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">{branding.name}</p>
                <h3 className="mt-1 text-lg font-bold text-gray-900">{job.title}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{branding.city}</p>
              </div>

              {/* Action Button */}
              <div>
                {closed ? (
                  <button disabled className="w-full cursor-not-allowed rounded-2xl bg-gray-100 py-3.5 text-xs font-bold text-gray-400">
                    Position Closed
                  </button>
                ) : (
                  <button
                    onClick={handleApplyClick}
                    className={`w-full rounded-2xl py-3.5 text-xs font-bold shadow-md transition-all active:scale-95 ${
                      profileIncomplete
                        ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                        : "bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-brand-500/25 hover:from-brand-500 hover:to-indigo-500"
                    }`}
                  >
                    Apply For This Position
                  </button>
                )}
                {profileIncomplete && (
                  <p className="mt-2 text-center text-[11px] font-semibold text-amber-700">Profile incomplete &bull; complete profile to apply</p>
                )}
              </div>

              {/* Specs Summary Table */}
              <div className="rounded-2xl bg-gray-50/70 p-4 border border-gray-100 divide-y divide-gray-100 text-xs">
                <div className="py-2 flex items-center justify-between">
                  <span className="text-gray-500">Department</span>
                  <span className="font-bold text-gray-900">{job.department?.name || "General"}</span>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <span className="text-gray-500">Employment Type</span>
                  <span className="font-bold text-gray-900">{formatEmploymentType(job.employment_type)}</span>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <span className="text-gray-500">Experience</span>
                  <span className="font-bold text-gray-900">{formatExperience(job)}</span>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <span className="text-gray-500">Location</span>
                  <span className="font-bold text-gray-900">{branding.city}</span>
                </div>
              </div>

              {/* Fast-Track Hiring Tip */}
              <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-xs text-brand-900">
                <p className="font-bold flex items-center gap-1.5 text-brand-700">
                  <Sparkles size={13} /> Applicant Tip:
                </p>
                <p className="mt-1 text-gray-600 leading-relaxed text-[11px]">
                  Ensure your resume highlights relevant experience in manufacturing, machinery handling, or technical skills for fast-track processing.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ────────────────── Mobile Sticky Bottom Apply Bar ────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-gray-200 bg-white/95 p-4 backdrop-blur-md lg:hidden shadow-2xl">
        {closed ? (
          <button disabled className="w-full cursor-not-allowed rounded-xl bg-gray-100 py-3 text-xs font-bold text-gray-400">
            Position Closed
          </button>
        ) : (
          <>
            <button
              onClick={handleApplyClick}
              className={`flex-1 rounded-xl py-3 text-xs font-bold shadow-md ${
                profileIncomplete ? "border border-amber-300 bg-amber-50 text-amber-800" : "bg-gradient-to-r from-brand-600 to-indigo-600 text-white"
              }`}
            >
              Apply Now
            </button>
            <SaveJobButton
              jobId={job.id}
              initialSaved={initiallySaved}
              className="h-11 w-11 flex-shrink-0 rounded-xl border border-gray-200"
            />
          </>
        )}
      </div>

      {/* ────────────────── 3. Application Modal ────────────────── */}
      {applyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-gray-100 bg-white p-6 sm:p-8 shadow-2xl sm:rounded-3xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600">{branding.shortName}</span>
                <h3 className="text-lg font-black text-gray-900 mt-0.5">Apply for {job.title}</h3>
              </div>
              <button
                onClick={() => setApplyModalOpen(false)}
                aria-label="Close"
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Auth check */}
            {!isAuthenticated ? (
              <div className="space-y-4 py-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 shadow-sm">
                  <Lock size={24} />
                </div>
                <h4 className="text-base font-bold text-gray-900">Sign in to Submit Application</h4>
                <p className="mx-auto max-w-xs text-xs text-gray-500 leading-relaxed">
                  Create a candidate profile or log in to submit your resume and track application status.
                </p>
                <div className="flex justify-center gap-3 pt-2">
                  <button
                    onClick={() => navigate(`/careers/login?redirect=/careers/jobs/${job.id}`)}
                    className="rounded-xl border border-gray-200 px-5 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                  >
                    Candidate Sign In
                  </button>
                  <button
                    onClick={() => navigate(`/careers/register?redirect=/careers/jobs/${job.id}`)}
                    className="rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:from-brand-500 hover:to-indigo-500 shadow-md shadow-brand-500/20"
                  >
                    Create Account
                  </button>
                </div>
              </div>
            ) : !candidate?.email_verified_at ? (
              <div className="mt-6 space-y-2 rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                  <AlertCircle size={18} className="text-amber-600" /> Verify Your Email Address
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  We sent a confirmation link to <strong>{candidate?.email}</strong>. Please verify your email to unlock applications.
                </p>
                <ResendVerificationButton email={candidate?.email} className="pt-2" />
              </div>
            ) : profileIncomplete ? (
              <div className="mt-6 space-y-2 rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                  <AlertCircle size={18} className="text-amber-600" /> Complete Profile Details
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Please provide your experience and contact details in your profile so recruiters can evaluate your application.
                </p>
                <Link
                  to="/careers/account/profile"
                  className="mt-2 inline-flex rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 shadow-sm"
                >
                  Complete Candidate Profile
                </Link>
              </div>
            ) : (
              <form onSubmit={handleApplySubmit} className="mt-6 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-bold text-gray-700">Full Name</label>
                    <input disabled value={candidate.name} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-gray-500 font-medium" />
                  </div>
                  <div>
                    <label className="mb-1 block font-bold text-gray-700">Email Address</label>
                    <input disabled value={candidate.email} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-gray-500 font-medium" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-bold text-gray-700">Phone Number</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-gray-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-bold text-gray-700">Experience (years)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={experienceYears}
                      onChange={(e) => setExperienceYears(e.target.value)}
                      placeholder="e.g. 2.5"
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-gray-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-bold text-gray-700">Current Employer (optional)</label>
                    <input
                      type="text"
                      value={currentCompany}
                      onChange={(e) => setCurrentCompany(e.target.value)}
                      placeholder="Company name"
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-gray-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-bold text-gray-700">Current Designation (optional)</label>
                    <input
                      type="text"
                      value={currentDesignation}
                      onChange={(e) => setCurrentDesignation(e.target.value)}
                      placeholder="e.g. Quality Inspector"
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-gray-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>

                {/* Resume Upload Drag Zone */}
                <div className="pt-1">
                  <label className="mb-1.5 block font-bold text-gray-700">
                    Resume Document <span className="text-red-500">*</span>
                    <span className="text-[10px] font-normal text-gray-400 ml-1">(PDF, DOC, DOCX up to 10MB)</span>
                  </label>

                  {resumeFile ? (
                    <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 flex-shrink-0">
                          <Check size={16} />
                        </div>
                        <div className="min-w-0">
                          <span className="truncate block text-xs font-bold text-emerald-900">{resumeFile.name}</span>
                          <span className="text-[10px] text-emerald-700">{(resumeFile.size / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                      </div>
                      <label className="flex-shrink-0 cursor-pointer text-xs font-bold text-brand-700 hover:underline">
                        Change
                        <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResumeFile(e.target.files[0])} className="hidden" />
                      </label>
                    </div>
                  ) : (
                    <div className="relative rounded-2xl border-2 border-dashed border-gray-200 p-6 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/30">
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={(e) => setResumeFile(e.target.files[0])}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                      <div className="pointer-events-none flex flex-col items-center gap-1.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 mb-1">
                          <Upload size={18} />
                        </div>
                        <span className="text-xs font-bold text-brand-700">Upload your resume file</span>
                        <span className="text-[10px] text-gray-400">Click to browse or drag & drop</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit Action */}
                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={submitting || !resumeFile}
                    className="w-full rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-600 py-3.5 text-xs font-bold text-white shadow-lg shadow-brand-500/25 transition-all hover:from-brand-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Submitting Application..." : "Submit Application"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PerkCard({ icon, title, desc }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm border border-gray-100 flex-shrink-0">
        {icon}
      </div>
      <div>
        <h4 className="font-bold text-gray-900 text-xs">{title}</h4>
        <p className="mt-0.5 text-[11px] text-gray-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function StepItem({ step, title, desc }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 text-center">
      <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-700 font-black text-xs mb-2 border border-brand-200">
        {step}
      </div>
      <h4 className="font-bold text-gray-900 text-xs">{title}</h4>
      <p className="mt-0.5 text-[10px] text-gray-500">{desc}</p>
    </div>
  );
}

