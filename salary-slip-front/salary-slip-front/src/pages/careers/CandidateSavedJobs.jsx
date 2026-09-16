import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, MapPin, Briefcase, Trash2, ArrowRight, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/candidate-auth-context";
import { resolveJobBranding, formatEmploymentType, formatExperience } from "../../config/careersTheme";

export default function CandidateSavedJobs() {
  const { candidate, token } = useCandidateAuth();
  const [savedJobs, setSavedJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    candidateApi.getSavedJobs(token)
      .then((res) => {
        if (res.status) setSavedJobs(res.data || []);
      })
      .catch((err) => toast.error(err.message || "Failed to load saved jobs"))
      .finally(() => setLoading(false));
  }, [token]);

  const removeSavedJob = async (row) => {
    try {
      await candidateApi.unsaveJob(row.job.id, token);
      setSavedJobs((prev) => prev.filter((r) => r.saved_job_id !== row.saved_job_id));
      toast.success("Job removed from saved list");
    } catch (err) {
      toast.error(err.message || "Could not remove saved job");
    }
  };

  if (!candidate) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50/50 px-4 py-16 text-center sm:px-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Bookmark size={26} />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">Sign in to view saved jobs</h1>
          <p className="mt-2 text-sm text-slate-500">Access your bookmarked roles across any device.</p>
          <Link
            to="/careers/login?redirect=/careers/account/saved-jobs"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700"
          >
            Sign In to Continue
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/50 py-10 sm:py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                <Sparkles size={13} className="text-blue-600" />
                Bookmarks
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Saved Opportunities</h1>
            <p className="mt-1 text-sm text-slate-500">Roles you have bookmarked to review or apply to later.</p>
          </div>
          <Link
            to="/careers"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800"
          >
            Explore More Jobs
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="mt-8 space-y-4">
          {loading ? (
            [1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />)
          ) : savedJobs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
                <Bookmark size={26} />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">No saved jobs yet</h3>
              <p className="mt-1 text-sm text-slate-500">Bookmark open roles to keep track and apply at your convenience.</p>
              <Link
                to="/careers"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
              >
                Browse All Openings
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            savedJobs.map((row) => {
              const branding = resolveJobBranding(row.job);
              return (
                <div
                  key={row.saved_job_id}
                  data-theme={branding.theme}
                  className="group flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        {row.job.department?.name || "General"}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400">·</span>
                      <span className="text-xs font-bold text-blue-600">{branding.shortName}</span>
                    </div>

                    {row.is_open ? (
                      <Link
                        to={`/careers/jobs/${row.job.id}`}
                        className="mt-1.5 block truncate text-base font-bold text-slate-900 transition-colors group-hover:text-blue-600"
                      >
                        {row.job.title}
                      </Link>
                    ) : (
                      <p className="mt-1.5 truncate text-base font-bold text-slate-400">{row.job.title}</p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin size={13} className="text-slate-400" /> {branding.city}{row.job.unit ? ` · ${row.job.unit}` : ""}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Briefcase size={13} className="text-slate-400" /> {formatEmploymentType(row.job.employment_type)} · {formatExperience(row.job)}
                      </span>
                    </div>

                    {!row.is_open && (
                      <span className="mt-2 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                        Position Closed
                      </span>
                    )}
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-2 border-t border-slate-100 pt-3 sm:border-0 sm:pt-0">
                    {row.is_open && (
                      <Link
                        to={`/careers/jobs/${row.job.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
                      >
                        View & Apply
                        <ArrowRight size={13} />
                      </Link>
                    )}
                    <button
                      onClick={() => removeSavedJob(row)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      title="Remove from saved"
                    >
                      <Trash2 size={13} />
                      <span className="hidden sm:inline">Remove</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

