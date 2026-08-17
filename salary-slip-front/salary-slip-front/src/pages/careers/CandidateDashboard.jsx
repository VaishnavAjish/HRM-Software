import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Calendar, Briefcase, AlertCircle, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";
import { resolveJobBranding } from "../../config/careersTheme";
import ResendVerificationButton from "../../components/careers/ResendVerificationButton";

const STATUS_STYLES = {
  Submitted: "bg-blue-50 text-blue-700 border-blue-200",
  "Under Review": "bg-amber-50 text-amber-700 border-amber-200",
  Assessment: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Interview: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Offer: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Hired: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Closed: "bg-nx-paper text-nx-muted border-nx-line",
};

export default function CandidateDashboard() {
  const { candidate, token } = useCandidateAuth();
  const [applications, setApplications] = useState([]);
  const [savedJobsCount, setSavedJobsCount] = useState(null);
  const [upcomingInterviewsCount, setUpcomingInterviewsCount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    candidateApi
      .getApplications(token)
      .then((res) => {
        if (res.status) setApplications(res.data || []);
      })
      .catch((err) => toast.error(err.message || "Failed to load applications"))
      .finally(() => setLoading(false));

    candidateApi.getSavedJobs(token)
      .then((res) => { if (res.status) setSavedJobsCount((res.data || []).length); })
      .catch(() => {});

    candidateApi.getInterviews(token)
      .then((res) => {
        if (!res.status) return;
        const upcoming = (res.data || []).filter((i) => ["scheduled", "rescheduled"].includes(i.status));
        setUpcomingInterviewsCount(upcoming.length);
      })
      .catch(() => {});
  }, [token]);

  const activeCount = applications.filter((a) => !["Closed", "Hired"].includes(a.status_label)).length;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-nx-paper">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-black tracking-[-0.01em] text-nx-ink">
          {getGreeting()}, {candidate?.name?.split(" ")[0] || "there"}
        </h1>
        <p className="mt-1 text-sm text-nx-muted">Track the roles you've applied to.</p>

        {!candidate?.email_verified_at && (
          <div className="mt-5 flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2.5">
              <AlertCircle size={16} className="flex-shrink-0 text-amber-600" />
              Verify your email to apply for jobs — check your inbox for the link.
            </span>
            <ResendVerificationButton email={candidate?.email} />
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Applications" value={applications.length} />
          <StatTile label="In progress" value={activeCount} />
          <StatTile
            as={Link}
            to="/careers/account/interviews"
            label="Interviews"
            value={upcomingInterviewsCount === null ? "—" : upcomingInterviewsCount}
          />
          <StatTile as={Link} to="/careers/account/saved-jobs" label="Saved Jobs" value={savedJobsCount === null ? "—" : savedJobsCount} />
          <StatTile
            label="Account"
            value={candidate?.email_verified_at ? "Verified" : "Pending"}
            tone={candidate?.email_verified_at ? "good" : "warn"}
          />
        </div>

        <div className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-nx-ink">My Applications</h2>
            <Link to="/careers" className="text-xs font-bold text-brand-700 hover:underline">
              Browse more openings
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              [1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg border border-nx-line bg-nx-surface" />)
            ) : applications.length === 0 ? (
              <div className="rounded-lg border border-dashed border-nx-line2 bg-nx-surface px-6 py-16 text-center">
                <Briefcase size={28} className="mx-auto text-nx-faint" />
                <h3 className="mt-3 text-sm font-bold text-nx-ink">You haven't applied to any jobs yet</h3>
                <p className="mt-1.5 text-sm text-nx-muted">Explore opportunities and find your next role.</p>
                <Link
                  to="/careers"
                  className="mt-5 inline-flex rounded-md bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
                >
                  Browse Jobs
                </Link>
              </div>
            ) : (
              applications.map((app) => {
                const branding = resolveJobBranding(app);
                return (
                  <Link
                    key={app.id}
                    to={`/careers/account/applications/${app.id}`}
                    data-theme={branding.theme}
                    className="flex flex-col gap-3 rounded-lg border border-nx-line border-l-[3px] border-l-brand-500 bg-nx-surface p-5 transition-colors hover:border-nx-line2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-nx-muted">
                        {app.department_name || "General"} · {branding.shortName}
                      </p>
                      <h3 className="mt-1 truncate text-base font-bold text-nx-ink">{app.job_title}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-nx-muted">
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={13} /> Applied {new Date(app.applied_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        {app.resume_name && (
                          <span className="inline-flex items-center gap-1 text-nx-body">
                            <FileText size={13} /> {app.resume_name}
                          </span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`inline-flex w-fit flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                        STATUS_STYLES[app.status_label] || STATUS_STYLES.Submitted
                      }`}
                    >
                      {["Offer", "Hired"].includes(app.status_label) && <CheckCircle2 size={12} />}
                      {app.status_label}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, tone, as: Component = "div", ...linkProps }) {
  const toneClass = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-nx-ink";
  const interactive = Component !== "div";
  return (
    <Component
      {...linkProps}
      className={`rounded-lg border border-nx-line bg-nx-surface px-4 py-4 ${interactive ? "transition-colors hover:border-nx-line2" : ""}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-nx-muted">{label}</p>
      <p className={`mt-1.5 text-2xl font-black ${toneClass}`}>{value}</p>
    </Component>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
