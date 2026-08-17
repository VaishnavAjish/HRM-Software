import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Upload, AlertCircle, Lock, MapPin, Briefcase, Users, Calendar } from "lucide-react";
import toast from "react-hot-toast";
import DOMPurify from "dompurify";
import { publicJobApi, candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";
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
      setPhone(candidate.phone || "");
      setExperienceYears(candidate.experience_years || "");
      setCurrentCompany(candidate.current_company || "");
      setCurrentDesignation(candidate.current_designation || "");
    }
  }, [candidate]);

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
        <div className="h-72 animate-pulse rounded-lg border border-nx-line bg-nx-surface" />
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-nx-surface">
          <AlertCircle size={26} className="text-nx-faint" />
        </div>
        <h2 className="mt-5 text-xl font-bold text-nx-ink">Job listing not found</h2>
        <p className="mt-2 text-sm text-nx-muted">This posting may have closed or been removed.</p>
        <Link
          to="/careers"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-nx-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
        >
          <ArrowLeft size={15} /> Back to open positions
        </Link>
      </div>
    );
  }

  const branding = resolveJobBranding(job);
  const closed = isJobClosed(job);

  // Only meaningful once signed in and verified — an incomplete/unauthenticated
  // candidate still opens the modal to see the sign-in/verify gate as before.
  const profileIncomplete = isAuthenticated && candidate?.email_verified_at && profileCompletion(candidate) < 100;

  const handleApplyClick = () => {
    if (profileIncomplete) {
      toast.error("Please complete your profile before applying.");
    }
    setApplyModalOpen(true);
  };

  return (
    <div data-theme={branding.theme} className="min-h-[calc(100vh-4rem)] bg-nx-paper pb-28 sm:pb-16">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Link
          to="/careers"
          className="inline-flex items-center gap-2 text-sm font-semibold text-nx-muted transition-colors hover:text-nx-ink"
        >
          <ArrowLeft size={15} /> Back to open positions
        </Link>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          {/* Main content */}
          <div className="min-w-0 space-y-6">
            <div className="rounded-lg border border-nx-line border-l-[3px] border-l-brand-500 bg-nx-surface p-7 sm:p-9">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-700">
                {job.department?.name || "General"} · {branding.shortName}
              </p>
              <h1 className="mt-3 text-2xl font-black leading-tight tracking-[-0.01em] text-nx-ink sm:text-[32px]">
                {job.title}
              </h1>
              {job.designation && (
                <p className="mt-2 text-sm font-medium text-nx-muted">{job.designation}</p>
              )}

              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-t border-nx-line pt-6 text-sm text-nx-body">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={15} className="text-nx-faint" />
                  {branding.city}{job.unit ? ` · ${job.unit}` : ""}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase size={15} className="text-nx-faint" />
                  {formatEmploymentType(job.employment_type)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users size={15} className="text-nx-faint" />
                  {formatExperience(job)}
                </span>
                {job.target_closing_date && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar size={15} className="text-nx-faint" />
                    {closed ? "Closed" : "Closes"} {new Date(job.target_closing_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                )}
              </div>
            </div>

            {appliedSuccess && (
              <div className="flex flex-col items-start gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={22} className="mt-0.5 flex-shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-bold text-emerald-900">Application submitted</p>
                    <p className="mt-0.5 text-sm text-emerald-700">Track its progress from your candidate account.</p>
                  </div>
                </div>
                <Link
                  to="/careers/account/applications"
                  className="whitespace-nowrap rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  View applications
                </Link>
              </div>
            )}

            {job.description && (
              <div className="rounded-lg border border-nx-line bg-nx-surface p-7 sm:p-9">
                <h2 className="text-base font-bold text-nx-ink">About the role</h2>
                <div
                  className="prose prose-sm mt-4 max-w-none text-nx-body prose-headings:text-nx-ink prose-a:text-brand-700 prose-strong:text-nx-ink marker:text-brand-500"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.description) }}
                />
              </div>
            )}

            {job.requirements && (
              <div className="rounded-lg border border-nx-line bg-nx-surface p-7 sm:p-9">
                <h2 className="text-base font-bold text-nx-ink">What you'll bring</h2>
                <div
                  className="prose prose-sm mt-4 max-w-none text-nx-body prose-headings:text-nx-ink prose-a:text-brand-700 prose-strong:text-nx-ink marker:text-brand-500"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.requirements) }}
                />
              </div>
            )}
          </div>

          {/* Sticky apply card — desktop only, mobile gets a fixed bottom bar */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-lg border border-nx-line bg-nx-surface p-6 shadow-[0_12px_28px_-18px_rgba(33,29,23,0.3)]">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-nx-muted">{branding.shortName}</p>
              <p className="mt-1 text-sm font-bold text-nx-ink">{job.title}</p>
              <p className="mt-1 text-xs text-nx-muted">{branding.city}{job.unit ? ` · ${job.unit}` : ""}</p>
              {closed ? (
                <button disabled className="mt-5 w-full cursor-not-allowed rounded-md bg-nx-line py-3 text-sm font-bold text-nx-muted">
                  Position Closed
                </button>
              ) : (
                <button
                  onClick={handleApplyClick}
                  className={`mt-5 w-full rounded-md py-3 text-sm font-bold shadow-sm transition-colors ${
                    profileIncomplete
                      ? "border border-nx-line2 bg-nx-paper text-nx-muted hover:border-amber-300 hover:text-amber-700"
                      : "bg-brand-600 text-white hover:bg-brand-700"
                  }`}
                >
                  Apply Now
                </button>
              )}
              {profileIncomplete && (
                <p className="mt-2 text-center text-[11px] font-semibold text-amber-700">Complete your profile to apply</p>
              )}
              <SaveJobButton jobId={job.id} initialSaved={initiallySaved} variant="text" className="mt-2.5 w-full justify-center" />
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile sticky apply bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-nx-line bg-nx-surface/95 p-4 backdrop-blur-md lg:hidden">
        {closed ? (
          <button disabled className="w-full cursor-not-allowed rounded-md bg-nx-line py-3 text-sm font-bold text-nx-muted">
            Position Closed
          </button>
        ) : (
          <>
            <button
              onClick={handleApplyClick}
              className={`flex-1 rounded-md py-3 text-sm font-bold shadow-sm ${
                profileIncomplete ? "border border-nx-line2 bg-nx-paper text-nx-muted" : "bg-brand-600 text-white"
              }`}
            >
              Apply Now
            </button>
            <SaveJobButton
              jobId={job.id}
              initialSaved={initiallySaved}
              className="h-[46px] w-[46px] flex-shrink-0 rounded-md border border-nx-line"
            />
          </>
        )}
      </div>

      {applyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-nx-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-nx-line bg-nx-surface p-7 shadow-2xl sm:rounded-lg sm:p-8">
            <div className="flex items-center justify-between border-b border-nx-line pb-4">
              <h3 className="text-lg font-bold text-nx-ink">Apply for {job.title}</h3>
              <button
                onClick={() => setApplyModalOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-nx-muted transition-colors hover:bg-nx-paper hover:text-nx-ink"
              >
                ✕
              </button>
            </div>

            {!isAuthenticated ? (
              <div className="space-y-4 py-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
                  <Lock size={24} className="text-brand-600" />
                </div>
                <h4 className="text-base font-bold text-nx-ink">Sign in to apply</h4>
                <p className="mx-auto max-w-xs text-sm text-nx-muted">
                  Create a candidate account or sign in to apply and upload your resume.
                </p>
                <div className="flex justify-center gap-3 pt-2">
                  <button
                    onClick={() => navigate(`/careers/login?redirect=/careers/jobs/${job.id}`)}
                    className="rounded-md border border-nx-line px-5 py-2.5 text-sm font-bold text-nx-body hover:border-nx-line2"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => navigate(`/careers/register?redirect=/careers/jobs/${job.id}`)}
                    className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
                  >
                    Create Account
                  </button>
                </div>
              </div>
            ) : !candidate?.email_verified_at ? (
              <div className="mt-6 space-y-1.5 rounded-md border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                  <AlertCircle size={17} className="text-amber-600" /> Verify your email to apply
                </div>
                <p className="text-xs font-medium text-amber-800">
                  We sent a verification link to <strong>{candidate?.email}</strong>. Confirm it, then come back to apply.
                </p>
                <ResendVerificationButton email={candidate?.email} className="pt-1" />
              </div>
            ) : profileIncomplete ? (
              <div className="mt-6 space-y-1.5 rounded-md border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                  <AlertCircle size={17} className="text-amber-600" /> Complete your profile to apply
                </div>
                <p className="text-xs font-medium text-amber-800">
                  Add your experience and skills so recruiters have what they need to review your application.
                </p>
                <Link
                  to="/careers/account/profile"
                  className="mt-2 inline-flex rounded-md bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700"
                >
                  Complete Profile
                </Link>
              </div>
            ) : (
              <form onSubmit={handleApplySubmit} className="mt-6 space-y-5 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-nx-body">Name</label>
                    <input disabled value={candidate.name} className="w-full rounded-md border border-nx-line bg-nx-paper px-3.5 py-2.5 text-nx-muted" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-nx-body">Email</label>
                    <input disabled value={candidate.email} className="w-full rounded-md border border-nx-line bg-nx-paper px-3.5 py-2.5 text-nx-muted" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-nx-body">Phone number</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91…"
                      className="w-full rounded-md border border-nx-line px-3.5 py-2.5 text-nx-ink outline-none transition-colors focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-nx-body">Experience (years)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={experienceYears}
                      onChange={(e) => setExperienceYears(e.target.value)}
                      placeholder="e.g. 3.5"
                      className="w-full rounded-md border border-nx-line px-3.5 py-2.5 text-nx-ink outline-none transition-colors focus:border-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-nx-body">Resume — PDF, DOC or DOCX, up to 10MB</label>
                  {resumeFile ? (
                    <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <CheckCircle2 size={17} className="flex-shrink-0 text-emerald-600" />
                        <span className="truncate text-sm font-semibold text-emerald-900">{resumeFile.name}</span>
                      </div>
                      <label className="flex-shrink-0 cursor-pointer text-xs font-bold text-brand-700 hover:underline">
                        Replace
                        <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResumeFile(e.target.files[0])} className="hidden" />
                      </label>
                    </div>
                  ) : (
                    <div className="relative rounded-md border-2 border-dashed border-nx-line2 px-6 py-7 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40">
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={(e) => setResumeFile(e.target.files[0])}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                      <div className="pointer-events-none flex flex-col items-center gap-2">
                        <Upload size={19} className="text-nx-faint" />
                        <span className="text-sm font-semibold text-brand-700">Choose a file or drag it here</span>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-md bg-brand-600 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
                >
                  {submitting ? "Submitting…" : "Submit Application"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
