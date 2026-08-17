import { useEffect, useMemo, useState } from "react";
import { Search, Briefcase, ChevronDown, AlertCircle } from "lucide-react";
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
  const { isAuthenticated, token } = useCandidateAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [savedJobIds, setSavedJobIds] = useState(() => new Set());

  useEffect(() => {
    if (!isAuthenticated) return;
    candidateApi.getSavedJobs(token)
      .then((res) => {
        if (res.status) setSavedJobIds(new Set((res.data || []).map((row) => row.job.id)));
      })
      .catch(() => {});
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
        className="relative border-b border-nx-line px-4 pb-14 pt-16 sm:px-6 sm:pt-20 lg:px-8"
        style={{
          backgroundImage:
            "radial-gradient(rgb(33 29 23 / 0.05) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-700">
            Nidhi Impex Silver Star
          </p>
          <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-[-0.02em] text-nx-ink sm:text-5xl">
            Build your future <br className="hidden sm:block" />
            in Surat's manufacturing floor
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-nx-body">
            Open roles across textile manufacturing and diamond processing —
            find where your skills fit.
          </p>

          <form
            onSubmit={handleSearchSubmit}
            className="mx-auto mt-9 flex max-w-2xl flex-col gap-2.5 sm:flex-row"
          >
            <div className="relative flex-1">
              <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-nx-faint" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Job title, skills, keywords…"
                className="w-full rounded-md border border-nx-line bg-nx-surface py-3 pl-11 pr-4 text-sm text-nx-ink placeholder-nx-faint outline-none transition-colors focus:border-brand-500"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-nx-ink px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700"
            >
              Search Jobs
            </button>
          </form>
        </div>
      </section>

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
