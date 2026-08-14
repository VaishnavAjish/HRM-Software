import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Upload, AlertCircle, Lock } from "lucide-react";
import toast from "react-hot-toast";
import DOMPurify from "dompurify";
import { publicJobApi, candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

export default function JobDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { candidate, token, isAuthenticated } = useCandidateAuth();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applyModalOpen, setApplyModalOpen] = useState(false);

  // Application form state
  const [resumeFile, setResumeFile] = useState(null);
  const [phone, setPhone] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [currentDesignation, setCurrentDesignation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    publicJobApi.getJob(slug)
      .then((res) => {
        if (res.status) {
          setJob(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

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
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="h-64 rounded-2xl bg-slate-800/50 animate-pulse border border-slate-800" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Job Listing Not Found</h2>
        <p className="text-slate-400 mb-6">This job posting may have expired or been closed.</p>
        <Link to="/careers" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white font-semibold">
          <ArrowLeft size={16} /> Back to Openings
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <Link to="/careers" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors">
        <ArrowLeft size={16} /> Back to Open Positions
      </Link>

      {/* Main Job Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-400">
              {job.department?.name || "General"}
            </span>
            <h1 className="text-3xl font-extrabold text-white mt-1">{job.title}</h1>
            <p className="text-sm text-slate-400 mt-2">
              {job.designation ? `Designation: ${job.designation}` : ""} · {job.employment_type?.replace("_", " ")}
            </p>
          </div>

          <button
            onClick={() => setApplyModalOpen(true)}
            className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold shadow-lg transition-all text-center whitespace-nowrap"
          >
            Apply for this Position
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-800 text-xs">
          <div>
            <span className="text-slate-500 block">Experience</span>
            <span className="font-semibold text-slate-200 mt-0.5 block">{job.min_experience ? `${job.min_experience}+ years` : "Freshers"}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Openings</span>
            <span className="font-semibold text-slate-200 mt-0.5 block">{job.openings || 1}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Salary Range</span>
            <span className="font-semibold text-slate-200 mt-0.5 block">
              {job.salary_min ? `₹${Number(job.salary_min).toLocaleString("en-IN")} - ₹${Number(job.salary_max || 0).toLocaleString("en-IN")}` : "As per industry"}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Closing Date</span>
            <span className="font-semibold text-slate-200 mt-0.5 block">
              {job.target_closing_date ? new Date(job.target_closing_date).toLocaleDateString() : "Open until filled"}
            </span>
          </div>
        </div>
      </div>

      {appliedSuccess && (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-green-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} className="text-green-400" />
            <div>
              <p className="font-semibold">Application Submitted!</p>
              <p className="text-xs text-green-400/80">You can track your application status under your Candidate Account dashboard.</p>
            </div>
          </div>
          <Link to="/careers/account/applications" className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold">
            View Applications
          </Link>
        </div>
      )}

      {/* Description & Requirements */}
      <div className="space-y-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
        {job.description && (
          <div>
            <h2 className="text-lg font-bold text-white mb-3">About the Role</h2>
            <div
              className="prose prose-invert max-w-none text-sm text-slate-300 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-2"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.description) }}
            />
          </div>
        )}

        {job.requirements && (
          <div>
            <h2 className="text-lg font-bold text-white mb-3">Requirements & Skills</h2>
            <div
              className="prose prose-invert max-w-none text-sm text-slate-300 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-2"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.requirements) }}
            />
          </div>
        )}
      </div>

      {/* Application Modal */}
      {applyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">Apply for {job.title}</h3>
              <button onClick={() => setApplyModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {!isAuthenticated ? (
              <div className="text-center py-6 space-y-4">
                <Lock size={36} className="mx-auto text-brand-400" />
                <h4 className="text-base font-semibold text-white">Candidate Account Required</h4>
                <p className="text-xs text-slate-400">Please sign in or create a candidate account to apply and upload your resume.</p>
                <div className="flex justify-center gap-3 pt-2">
                  <button
                    onClick={() => navigate(`/careers/login?redirect=/careers/jobs/${job.id}`)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-sm font-semibold border border-slate-700"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => navigate(`/careers/register?redirect=/careers/jobs/${job.id}`)}
                    className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold"
                  >
                    Create Account
                  </button>
                </div>
              </div>
            ) : !candidate?.email_verified_at ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <AlertCircle size={18} /> Email Verification Pending
                </div>
                <p className="text-xs text-amber-300/80">
                  Please verify your email address (sent to {candidate?.email}) before submitting job applications.
                </p>
              </div>
            ) : (
              <form onSubmit={handleApplySubmit} className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Applicant Name</label>
                  <input type="text" disabled value={candidate.name} className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-slate-300 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Applicant Email</label>
                  <input type="text" disabled value={candidate.email} className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-slate-300 text-xs" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Phone Number</label>
                    <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-white text-xs" placeholder="+91..." />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Experience (Years)</label>
                    <input type="number" step="0.5" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-white text-xs" placeholder="e.g. 3.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Upload Resume (PDF, DOC, DOCX up to 10MB) *</label>
                  <div className="relative border-2 border-dashed border-slate-700 hover:border-brand-500 rounded-xl p-4 text-center cursor-pointer bg-slate-950/40">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => setResumeFile(e.target.files[0] || null)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Upload size={20} className="mx-auto text-slate-400 mb-1" />
                    <p className="text-xs text-slate-300 font-medium">
                      {resumeFile ? resumeFile.name : "Click to select resume file"}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Maximum file size: 10 MB</p>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setApplyModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold">
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting || !resumeFile} className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold disabled:opacity-50">
                    {submitting ? "Submitting..." : "Submit Application"}
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
