import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Briefcase, ChevronDown, AlertCircle, FileText, Send, CalendarClock, Bookmark, ShieldCheck } from "lucide-react";
import { publicJobApi, candidateApi } from "../../utils/api";
import { COMPANY_OPTIONS } from "../../config/companyConfig";
import JobCard from "../../components/careers/JobCard";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

const EMPLOYMENT_TYPES = [
  { value: "", label: "All types" },
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Internship" },
];

function SelectField({ value, onChange, options, label }) {
  return (
    <label className="relative flex w-full items-center sm:w-auto">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-md border border-nx-line bg-nx-surface py-3 pl-4 pr-9 text-sm font-medium text-nx-body outline-none transition-colors focus:border-brand-500 sm:w-auto"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 text-nx-faint" />
    </label>
  );
}

export default function CareersList() {
  const { isAuthenticated, token, candidate } = useCandidateAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [savedJobIds, setSavedJobIds] = useState(() => new Set());
  const [myStats, setMyStats] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    candidateApi.getSavedJobs(token)
      .then((res) => {
        if (res.status) setSavedJobIds(new Set((res.data || []).map((row) => row.job.id)));
      })
      .catch(() => {});
  }, [isAuthenticated, token]);

  useEffect(() => {
    if (!isAuthenticated) return;
    Promise.all([
      candidateApi.getApplications(token).catch(() => null),
      candidateApi.getInterviews(token).catch(() => null),
    ]).then(([applicationsRes, interviewsRes]) => {
      const applications = applicationsRes?.status ? applicationsRes.data || [] : [];
      const interviews = interviewsRes?.status ? interviewsRes.data || [] : [];
      setMyStats({
        applications: applications.length,
        inProgress: applications.filter((a) => !["Closed", "Hired"].includes(a.status_label)).length,
        interviews: interviews.filter((i) => ["scheduled", "rescheduled"].includes(i.status)).length,
      });
    });
  }, [isAuthenticated, token]);

  const loadJobs = () => {
    setLoading(true);
    setLoadError(false);
    publicJobApi
      .getJobs({
        search: search.trim() || undefined,
        employment_type: employmentType || undefined,
        company_code: companyCode || undefined,
      })
      .then((res) => {
        if (res.status) {
          setJobs(res.data?.data || res.data || []);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(loadJobs, [employmentType, companyCode]);

  const departmentOptions = useMemo(() => {
    const seen = new Map();
    jobs.forEach((job) => {
      if (job.department?.id && !seen.has(job.department.id)) {
        seen.set(job.department.id, job.department.name);
      }
    });
    return [
      { value: "", label: "All departments" },
      ...Array.from(seen, ([value, label]) => ({ value: String(value), label })),
    ];
  }, [jobs]);

  const visibleJobs = departmentId
    ? jobs.filter((job) => String(job.department?.id) === departmentId)
    : jobs;

  const hasActiveFilters = Boolean(search.trim() || employmentType || companyCode || departmentId);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadJobs();
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-nx-paper pb-20">
      <section
        className="relative overflow-hidden px-4 pb-16 pt-16 sm:px-6 sm:pt-20 lg:px-8"
        style={{ background: "linear-gradient(135deg, rgb(var(--brand-900)) 0%, rgb(var(--brand-700)) 55%, rgb(var(--brand-600)) 100%)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "18px 18px" }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/70">
            Nidhi Impex Silver Star
          </p>
          <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl">
            Build your future <br className="hidden sm:block" />
            in Surat's manufacturing floor
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/80">
            Open roles across textile manufacturing and diamond processing —
            find where your skills fit.
          </p>

          <form
            onSubmit={handleSearchSubmit}
            className="mx-auto mt-9 flex max-w-2xl flex-col gap-2.5 rounded-xl bg-white/10 p-2 backdrop-blur-sm sm:flex-row"
          >
            <div className="relative flex-1">
              <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-nx-faint" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Job title, skills, keywords…"
                className="w-full rounded-lg border-none bg-white py-3 pl-11 pr-4 text-sm text-nx-ink placeholder-nx-faint outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-nx-ink px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-black"
            >
              Search Jobs
            </button>
          </form>
        </div>
      </section>

      {isAuthenticated && (
        <section className="mx-auto -mt-6 max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-nx-line bg-nx-surface p-4 shadow-[0_12px_28px_-18px_rgba(33,29,23,0.25)] sm:grid-cols-5">
            <MyStatTile as={Link} to="/careers/account/applications" icon={<FileText size={15} />} label="Applications" value={myStats?.applications} />
            <MyStatTile as={Link} to="/careers/account/applications" icon={<Send size={15} />} label="In Progress" value={myStats?.inProgress} />
            <MyStatTile as={Link} to="/careers/account/interviews" icon={<CalendarClock size={15} />} label="Interviews" value={myStats?.interviews} />
            <MyStatTile as={Link} to="/careers/account/saved-jobs" icon={<Bookmark size={15} />} label="Saved Jobs" value={savedJobIds.size} />
            <MyStatTile
              icon={<ShieldCheck size={15} />}
              label="Account"
              value={candidate?.email_verified_at ? "Verified" : "Pending"}
              tone={candidate?.email_verified_at ? "good" : "warn"}
            />
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 border-b border-nx-line pb-6 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-nx-ink">
            {loading
              ? "Loading open positions…"
              : loadError
              ? "Couldn't load positions"
              : `${visibleJobs.length} open position${visibleJobs.length === 1 ? "" : "s"}`}
          </h2>
          <div className="flex flex-wrap gap-2.5">
            <SelectField
              label="Company"
              value={companyCode}
              onChange={setCompanyCode}
              options={[
                { value: "", label: "All companies" },
                ...COMPANY_OPTIONS.map((c) => ({ value: c.id, label: c.label })),
              ]}
            />
            <SelectField label="Department" value={departmentId} onChange={setDepartmentId} options={departmentOptions} />
            <SelectField label="Employment type" value={employmentType} onChange={setEmploymentType} options={EMPLOYMENT_TYPES} />
          </div>
        </div>

        <div className="mt-8">
          {loading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-lg border border-nx-line bg-nx-surface" />
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-lg border border-dashed border-red-200 bg-red-50 px-6 py-20 text-center">
              <AlertCircle size={30} className="mx-auto text-red-400" />
              <h3 className="mt-4 text-base font-bold text-nx-ink">Unable to load open positions</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-nx-muted">Something went wrong on our end. Please try again.</p>
              <button
                onClick={loadJobs}
                className="mt-5 inline-flex rounded-md bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
              >
                Try Again
              </button>
            </div>
          ) : visibleJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-nx-line2 bg-nx-surface px-6 py-20 text-center">
              <Briefcase size={30} className="mx-auto text-nx-faint" />
              <h3 className="mt-4 text-base font-bold text-nx-ink">
                {hasActiveFilters ? "No open positions match your search" : "No open positions are currently available"}
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-nx-muted">
                {hasActiveFilters
                  ? "Try clearing a filter, or check back soon — new roles are posted regularly."
                  : "Check back soon — new roles are posted regularly."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {visibleJobs.map((job) => (
                <JobCard key={job.id} job={job} initiallySaved={savedJobIds.has(job.id)} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MyStatTile({ icon, label, value, tone, as: Component = "div", ...linkProps }) {
  const toneClass = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-nx-ink";
  const interactive = Component !== "div";
  return (
    <Component
      {...linkProps}
      className={`rounded-md px-3 py-2.5 text-center sm:text-left ${interactive ? "transition-colors hover:bg-nx-paper" : ""}`}
    >
      <div className="flex items-center justify-center gap-1.5 text-nx-muted sm:justify-start">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-[0.06em]">{label}</span>
      </div>
      <p className={`mt-1 text-xl font-black ${toneClass}`}>{value ?? "—"}</p>
    </Component>
  );
}
