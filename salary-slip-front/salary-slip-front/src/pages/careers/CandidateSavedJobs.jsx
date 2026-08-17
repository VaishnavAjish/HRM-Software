import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, MapPin, Briefcase } from "lucide-react";
import toast from "react-hot-toast";
import { candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";
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
    } catch (err) {
      toast.error(err.message || "Could not remove saved job");
    }
  };

  if (!candidate) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-nx-paper px-4 py-16 text-center sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-nx-line bg-nx-surface p-8 shadow-[0_12px_28px_-18px_rgba(33,29,23,0.3)] sm:p-10">
          <h1 className="text-xl font-bold text-nx-ink">Sign in to view saved jobs</h1>
          <Link
            to="/careers/login?redirect=/careers/account/saved-jobs"
            className="mt-6 inline-flex rounded-md bg-brand-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-nx-paper">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-black tracking-[-0.01em] text-nx-ink">Saved Jobs</h1>
        <p className="mt-1 text-sm text-nx-muted">Roles you've bookmarked to revisit.</p>

        <div className="mt-8 space-y-3">
          {loading ? (
            [1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg border border-nx-line bg-nx-surface" />)
          ) : savedJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-nx-line2 bg-nx-surface px-6 py-16 text-center">
              <Bookmark size={28} className="mx-auto text-nx-faint" />
              <h3 className="mt-3 text-sm font-bold text-nx-ink">No saved jobs yet</h3>
              <p className="mt-1.5 text-sm text-nx-muted">Save opportunities you'd like to revisit.</p>
              <Link
                to="/careers"
                className="mt-5 inline-flex rounded-md bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
              >
                Browse Jobs
              </Link>
            </div>
          ) : (
            savedJobs.map((row) => {
              const branding = resolveJobBranding(row.job);
              return (
                <div
                  key={row.saved_job_id}
                  data-theme={branding.theme}
                  className="flex flex-col gap-3 rounded-lg border border-nx-line border-l-[3px] border-l-brand-500 bg-nx-surface p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-nx-muted">
                      {row.job.department?.name || "General"} · {branding.shortName}
                    </p>
                    {row.is_open ? (
                      <Link to={`/careers/jobs/${row.job.id}`} className="mt-1 block truncate text-base font-bold text-nx-ink hover:text-brand-700">
                        {row.job.title}
                      </Link>
                    ) : (
                      <p className="mt-1 truncate text-base font-bold text-nx-faint">{row.job.title}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-nx-muted">
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={13} /> {branding.city}{row.job.unit ? ` · ${row.job.unit}` : ""}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Briefcase size={13} /> {formatEmploymentType(row.job.employment_type)} · {formatExperience(row.job)}
                      </span>
                    </div>
                    {!row.is_open && (
                      <span className="mt-2 inline-flex w-fit rounded-full border border-nx-line bg-nx-paper px-2.5 py-0.5 text-[11px] font-bold text-nx-muted">
                        No longer available
                      </span>
                    )}
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-2">
                    {row.is_open && (
                      <Link
                        to={`/careers/jobs/${row.job.id}`}
                        className="rounded-md bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700"
                      >
                        View Job
                      </Link>
                    )}
                    <button
                      onClick={() => removeSavedJob(row)}
                      className="rounded-md border border-nx-line px-4 py-2 text-xs font-bold text-nx-body hover:border-nx-line2"
                    >
                      Remove
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
