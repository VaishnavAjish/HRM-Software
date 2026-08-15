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
        <div className="h-64 rounded-2xl bg-white shadow-sm border border-slate-100 animate-pulse" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
           <AlertCircle size={32} className="text-slate-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Job Listing Not Found</h2>
        <p className="text-slate-500 mb-6">This job posting may have expired or been closed.</p>
        <Link to="/careers" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white font-semibold shadow-md hover:bg-slate-800 transition-colors">
          <ArrowLeft size={16} /> Back to Openings
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8 bg-slate-50 min-h-[calc(100vh-4rem)]">
      <Link to="/careers" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand-600 transition-colors group">
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to Open Positions
      </Link>

      {/* Main Job Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-10 shadow-lg shadow-slate-200/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-1 rounded-md">
              {job.department?.name || "General"}
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-4 tracking-tight">{job.title}</h1>
            <p className="text-sm font-medium text-slate-500 mt-2 flex items-center gap-2">
              {job.designation ? <span>Designation: {job.designation}</span> : null} 
              {job.designation && <span className="text-slate-300">•</span>}
              <span className="capitalize">{job.employment_type?.replace("_", " ")}</span>
            </p>
          </div>

          <button
            onClick={() => setApplyModalOpen(true)}
            className="px-8 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold shadow-xl shadow-brand-500/30 hover:-translate-y-0.5 transition-all text-center whitespace-nowrap"
          >
            Apply for this Position
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-10 pt-8 border-t border-slate-100 text-sm">
          <div>
            <span className="text-slate-500 block font-medium mb-1">Experience</span>
            <span className="font-bold text-slate-900 block">{job.min_experience ? `${job.min_experience}+ years` : "Freshers welcome"}</span>
          </div>
          <div>
            <span className="text-slate-500 block font-medium mb-1">Openings</span>
            <span className="font-bold text-slate-900 block">{job.openings || 1}</span>
          </div>
          <div>
            <span className="text-slate-500 block font-medium mb-1">Salary Range</span>
            <span className="font-bold text-slate-900 block">
              {job.salary_min ? `₹${Number(job.salary_min).toLocaleString("en-IN")} - ₹${Number(job.salary_max || 0).toLocaleString("en-IN")}` : "As per industry"}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block font-medium mb-1">Closing Date</span>
            <span className="font-bold text-slate-900 block">
              {job.target_closing_date ? new Date(job.target_closing_date).toLocaleDateString() : "Open until filled"}
            </span>
          </div>
        </div>
      </div>

      {appliedSuccess && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start sm:items-center gap-4">
            <CheckCircle2 size={28} className="text-emerald-500 flex-shrink-0" />
            <div>
              <p className="font-bold text-emerald-900 text-lg">Application Submitted!</p>
              <p className="text-sm text-emerald-700 mt-0.5">You can track your application status under your Candidate Account dashboard.</p>
            </div>
          </div>
          <Link to="/careers/account/applications" className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-md transition-colors whitespace-nowrap">
            View Applications
          </Link>
        </div>
      )}

      {/* Description & Requirements */}
      <div className="space-y-10 rounded-2xl border border-slate-200 bg-white p-8 sm:p-10 shadow-sm">
        {job.description && (
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-brand-500 rounded-full inline-block"></span> About the Role
            </h2>
            <div
              className="prose prose-slate max-w-none text-slate-600 prose-p:leading-relaxed prose-headings:text-slate-900 prose-a:text-brand-600 hover:prose-a:text-brand-500 marker:text-brand-500 prose-li:my-1"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.description) }}
            />
          </div>
        )}

        {job.requirements && (
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-4 flex items-center gap-2">
               <span className="w-1.5 h-6 bg-brand-500 rounded-full inline-block"></span> Requirements & Skills
            </h2>
            <div
              className="prose prose-slate max-w-none text-slate-600 prose-p:leading-relaxed prose-headings:text-slate-900 prose-a:text-brand-600 hover:prose-a:text-brand-500 marker:text-brand-500 prose-li:my-1"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.requirements) }}
            />
          </div>
        )}
      </div>

      {/* Application Modal */}
      {applyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-slate-100 bg-white p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Apply for {job.title}</h3>
              <button onClick={() => setApplyModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-1.5 rounded-full transition-colors">✕</button>
            </div>

            {!isAuthenticated ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Lock size={28} className="text-brand-500" />
                </div>
                <h4 className="text-lg font-bold text-slate-900">Candidate Account Required</h4>
                <p className="text-sm text-slate-500 max-w-xs mx-auto">Please sign in or create a candidate account to apply and upload your resume.</p>
                <div className="flex justify-center gap-3 pt-4">
                  <button
                    onClick={() => navigate(`/careers/login?redirect=/careers/jobs/${job.id}`)}
                    className="px-6 py-2.5 rounded-xl bg-white text-slate-700 text-sm font-bold border border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => navigate(`/careers/register?redirect=/careers/jobs/${job.id}`)}
                    className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold shadow-md shadow-brand-500/20 transition-all hover:-translate-y-0.5"
                  >
                    Create Account
                  </button>
                </div>
              </div>
            ) : !candidate?.email_verified_at ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertCircle size={18} className="text-amber-500" /> Email Verification Pending
                </div>
                <p className="text-xs text-amber-700 mt-1 font-medium">
                  Please verify your email address (sent to <strong>{candidate?.email}</strong>) before submitting job applications.
                </p>
              </div>
            ) : (
              <form onSubmit={handleApplySubmit} className="space-y-5 text-sm">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Applicant Name</label>
                  <input type="text" disabled value={candidate.name} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-slate-500 text-sm font-medium" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Applicant Email</label>
                  <input type="text" disabled value={candidate.email} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-slate-500 text-sm font-medium" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Phone Number</label>
                    <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-slate-900 text-sm focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all" placeholder="+91..." />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Experience (Years)</label>
                    <input type="number" step="0.5" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} className="w-full rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-slate-900 text-sm focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all" placeholder="e.g. 3.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Upload Resume (PDF, DOC, DOCX up to 10MB) *</label>
                  <div className="relative border-2 border-dashed border-slate-200 hover:border-brand-500 hover:bg-brand-50/50 rounded-2xl p-6 text-center cursor-pointer transition-colors">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => setResumeFile(e.target.files[0])}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                      <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400">
                        <Upload size={20} />
                      </div>
                      <span className="text-sm font-semibold text-brand-600">
                        {resumeFile ? resumeFile.name : "Click or drag file to upload"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-xl bg-brand-600 hover:bg-brand-500 disabled:bg-brand-400 text-white py-3 font-bold text-sm shadow-lg shadow-brand-500/20 transition-all hover:-translate-y-0.5"
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
