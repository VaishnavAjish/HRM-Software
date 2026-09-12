import {
  FileCheck2, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FileText,
  Calendar,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Clock,
  Sparkles,
  Award,
} from "lucide-react";
import toast from "react-hot-toast";
import { candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";
import { resolveJobBranding } from "../../config/careersTheme";
import ResendVerificationButton from "../../components/careers/ResendVerificationButton";

const STATUS_STYLES = {
  Submitted: "bg-blue-50 text-blue-700 border-blue-200/80",
  "Under Review": "bg-amber-50 text-amber-700 border-amber-200/80",
  Assessment: "bg-purple-50 text-purple-700 border-purple-200/80",
  Interview: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
  Offer: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  "Pending Onboarding": "bg-teal-50 text-teal-800 border-teal-300",
  Onboarding: "bg-teal-50 text-teal-800 border-teal-300",
  Hired: "bg-emerald-50 text-emerald-800 border-emerald-300",
  Closed: "bg-slate-100 text-slate-500 border-slate-200",
};

export default function CandidateDashboard() {
  const { candidate, token } = useCandidateAuth();
  const [applications, setApplications] = useState([]);
  const [savedJobsCount, setSavedJobsCount] = useState(null);
  const [upcomingInterviewsCount, setUpcomingInterviewsCount] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) return;
    candidateApi
      .getApplications(token)
      .then((res) => {
        if (res.status) setApplications(res.data || []);
      })
      .catch((err) => toast.error(err.message || "Failed to load applications"))
      .finally(() => setLoading(false));

    candidateApi
      .getSavedJobs(token)
      .then((res) => {
        if (res.status) setSavedJobsCount((res.data || []).length);
      })
      .catch(() => {});

    candidateApi
      .getInterviews(token)
      .then((res) => {
        if (!res.status) return;
        const upcoming = (res.data || []).filter((i) => ["scheduled", "rescheduled"].includes(i.status));
        setUpcomingInterviewsCount(upcoming.length);
      })
      .catch(() => {});
  }, [token]);

  const activeCount = applications.filter((a) => !["Closed", "Hired"].includes(a.status_label)).length;
  const pendingOfferApp = applications.find((a) => a.has_pending_offer);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/50 py-10 sm:py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Welcome Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                <Sparkles size={13} className="text-blue-600" />
                Candidate Portal
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
              {getGreeting()}, {candidate?.name?.split(" ")[0] || "there"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage your job applications, interviews, and official offer letters in one place.
            </p>
          </div>
          <Link
            to="/careers"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800"
          >
            Browse Openings
            <ArrowRight size={14} />
          </Link>
        </div>

        {/* Action Required Offer Banner */}
        {pendingOfferApp && (
          <div className="mt-6 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 p-5 text-white shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm animate-pulse">
                  <Award size={24} className="text-amber-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-200">Formal Job Offer Ready</span>
                    <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-slate-900">
                      ACTION REQUIRED
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    You have received an employment offer for <span className="underline">{pendingOfferApp.job_title}</span>!
                  </h3>
                </div>
              </div>
              <Link
                to={`/careers/account/applications/${pendingOfferApp.id}`}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-blue-900 shadow transition hover:bg-blue-50"
              >
                Review & Accept Offer
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}

        {!candidate?.email_verified_at && (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm font-medium text-amber-900 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2.5">
              <AlertCircle size={18} className="flex-shrink-0 text-amber-600" />
              Please verify your email to apply for jobs — check your inbox for the link.
            </span>
            <ResendVerificationButton email={candidate?.email} />
          </div>
        )}

        {/* Pending Offer Action Alert Banner */}
        {(() => {
          const pendingOfferApp = applications.find((app) => app.has_pending_offer);
          if (!pendingOfferApp) return null;
          return (
            <div className="mt-6 rounded-2xl border border-emerald-500/80 bg-slate-900 p-6 text-white shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    <FileCheck2 size={26} />
                  </div>
                  <div>
                    <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-400/30">
                      Action Required &bull; Official Job Offer
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-white mt-1">
                      Formal Job Offer Ready for {pendingOfferApp.job_title}
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Congratulations! Your official employment offer letter is ready for review. Please inspect the compensation package and submit your decision.
                    </p>
                  </div>
                </div>
                <Link
                  to={`/careers/account/applications/${pendingOfferApp.id}?tab=offer`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-xs font-bold text-white shadow-md transition whitespace-nowrap self-start sm:self-auto"
                >
                  <FileText size={15} />
                  Review &amp; Decide Offer
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          );
        })()}

        {/* Stats Grid */}
        <div className="mt-8 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Total Applications" value={applications.length} icon={<Briefcase size={16} className="text-blue-600" />} />
          <StatTile label="In Progress" value={activeCount} icon={<Clock size={16} className="text-amber-600" />} />
          <StatTile
            as={Link}
            to="/careers/account/interviews"
            label="Interviews"
            value={upcomingInterviewsCount === null ? "—" : upcomingInterviewsCount}
            icon={<Calendar size={16} className="text-indigo-600" />}
          />
          <StatTile
            as={Link}
            to="/careers/account/saved-jobs"
            label="Saved Roles"
            value={savedJobsCount === null ? "—" : savedJobsCount}
            icon={<FileText size={16} className="text-purple-600" />}
          />
          <StatTile
            label="Account Status"
            value={candidate?.email_verified_at ? "Verified" : "Pending"}
            tone={candidate?.email_verified_at ? "good" : "warn"}
            icon={<CheckCircle2 size={16} className={candidate?.email_verified_at ? "text-emerald-600" : "text-amber-600"} />}
          />
        </div>

        {/* Applications List */}
        <div className="mt-12">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Application History & Status</h2>
              <p className="text-xs text-slate-500">Real-time status updates, interview schedules, and offer letters</p>
            </div>
            <Link to="/careers" className="text-xs font-semibold text-blue-600 transition hover:text-blue-700 hover:underline">
              Explore More Roles →
            </Link>
          </div>

          <div className="mt-5 space-y-3.5">
            {loading ? (
              [1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />)
            ) : applications.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
                  <Briefcase size={26} />
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">You haven't applied to any jobs yet</h3>
                <p className="mt-1 text-sm text-slate-500">Find the right position and take the next step in your career.</p>
                <Link
                  to="/careers"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Browse Open Positions
                  <ArrowRight size={14} />
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
                    className="group flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                          {app.department_name || "General"}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">·</span>
                        <span className="text-xs font-bold text-blue-600">{branding.shortName}</span>
                        {app.has_pending_offer && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-800 animate-pulse border border-amber-300/80">
                            Offer Ready
                          </span>
                        )}
                        {app.is_offer_accepted && (
                          <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-extrabold text-teal-800 border border-teal-300/80">
                            Pending Onboarding
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1.5 truncate text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {app.job_title}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar size={13} className="text-slate-400" />
                          Applied {new Date(app.applied_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        {app.resume_name && (
                          <span className="inline-flex items-center gap-1.5 text-slate-600">
                            <FileText size={13} className="text-slate-400" />
                            {app.resume_name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 sm:border-0 sm:pt-0">
                      {app.has_pending_offer ? (
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white px-3.5 py-1.5 text-xs font-bold shadow-xs">
                          <CheckCircle2 size={13} />
                          Review &amp; Decide Offer
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                            STATUS_STYLES[app.status_label] || STATUS_STYLES.Submitted
                          }`}
                        >
                          {["Offer", "Hired"].includes(app.status_label) && <CheckCircle2 size={12} />}
                          {app.status_label}
                        </span>
                      )}
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition">
                        <ArrowRight size={14} />
                      </span>
                    </div>
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

function StatTile({ label, value, tone, icon, as: Component = "div", ...linkProps }) {
  const toneClass = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-slate-900";
  const interactive = Component !== "div";
  return (
    <Component
      {...linkProps}
      className={`relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm ${
        interactive ? "transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md cursor-pointer" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        {icon && <div className="rounded-lg bg-slate-50 p-1.5">{icon}</div>}
      </div>
      <p className={`mt-2 text-2xl font-black ${toneClass}`}>{value}</p>
    </Component>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
