import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search, Briefcase, ChevronDown, AlertCircle, FileText, Send, CalendarClock,
  Bookmark, ShieldCheck, Sparkles, Building2, Gem, Layers,
  HeartHandshake, Trophy, X, LayoutGrid, List
} from "lucide-react";
import { publicJobApi, candidateApi } from "../../utils/api";
import { COMPANY_OPTIONS } from "../../config/companyConfig";
import JobCard from "../../components/careers/JobCard";
import { useCandidateAuth } from "../../context/candidate-auth-context";

const EMPLOYMENT_TYPES = [
  { value: "", label: "All Employment Types" },
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Internship" },
];

const SUGGESTED_TAGS = [
  "All",
  "Engineering",
  "Quality Control",
  "Diamond Processing",
  "Textile Operations",
  "IT & Software",
  "Management",
];

export default function CareersList() {
  const { isAuthenticated, token, candidate } = useCandidateAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [selectedTag, setSelectedTag] = useState("All");
  const [viewMode, setViewMode] = useState("grid"); // grid | list
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

  const jobsRequestSeqRef = useRef(0);

  const fetchJobs = useCallback((params) => {
    const seq = ++jobsRequestSeqRef.current;
    const isLatest = () => seq === jobsRequestSeqRef.current;
    publicJobApi
      .getJobs({
        search: params.search.trim() || undefined,
        employment_type: params.employmentType || undefined,
        company_code: params.companyCode || undefined,
      })
      .then((res) => {
        if (!isLatest()) return;
        if (res.status) {
          setJobs(res.data?.data || res.data || []);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => {
        if (isLatest()) setLoadError(true);
      })
      .finally(() => {
        if (isLatest()) setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchJobs({ search: "", employmentType: "", companyCode: "" });
  }, [fetchJobs]);

  const loadJobs = (overrides = {}) => {
    setLoading(true);
    setLoadError(false);
    fetchJobs({ search, employmentType, companyCode, ...overrides });
  };

  const changeCompanyCode = (value) => {
    setCompanyCode(value);
    loadJobs({ companyCode: value });
  };

  const changeEmploymentType = (value) => {
    setEmploymentType(value);
    loadJobs({ employmentType: value });
  };

  const clearSearch = () => {
    setSearch("");
    loadJobs({ search: "" });
  };

  const departmentOptions = useMemo(() => {
    const seen = new Map();
    jobs.forEach((job) => {
      if (job.department?.id && !seen.has(job.department.id)) {
        seen.set(job.department.id, job.department.name);
      }
    });
    return [
      { value: "", label: "All Departments" },
      ...Array.from(seen, ([value, label]) => ({ value: String(value), label })),
    ];
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    let list = jobs;
    if (departmentId) {
      list = list.filter((job) => String(job.department?.id) === departmentId);
    }
    if (selectedTag && selectedTag !== "All") {
      const q = selectedTag.toLowerCase();
      list = list.filter((job) =>
        job.title?.toLowerCase().includes(q) ||
        job.department?.name?.toLowerCase().includes(q) ||
        job.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [jobs, departmentId, selectedTag]);

  const hasActiveFilters = Boolean(search.trim() || employmentType || companyCode || departmentId || (selectedTag && selectedTag !== "All"));

  const clearAllFilters = () => {
    setSearch("");
    setEmploymentType("");
    setCompanyCode("");
    setDepartmentId("");
    setSelectedTag("All");
    loadJobs({ search: "", employmentType: "", companyCode: "" });
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadJobs();
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#fafafc] pb-24">
      {/* ────────────────── 1. Hero Showcase Section ────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-gray-950 via-[#13112c] to-[#1e1b4b] px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8 text-white">
        {/* Glow & Mesh Accents */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-96 w-full max-w-5xl rounded-full bg-gradient-to-r from-brand-600/30 via-indigo-600/20 to-purple-600/30 blur-3xl opacity-60" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(#fff 1.5px, transparent 1.5px)", backgroundSize: "24px 24px" }}
        />

        <div className="relative mx-auto max-w-4xl text-center">
          {/* Badge Chip */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-md shadow-inner text-xs font-semibold text-brand-300">
            <Sparkles size={13} className="text-amber-400" />
            <span>NISS Careers &bull; We Are Actively Hiring</span>
          </div>

          {/* Main Title */}
          <h1 className="mt-6 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.1]">
            Build Your Future in <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-brand-300 via-indigo-200 to-white bg-clip-text text-transparent">
              Surat's Manufacturing Floor
            </span>
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-sm sm:text-base leading-relaxed text-gray-300 font-normal">
            Discover roles across precision diamond processing and modern textile manufacturing. Join a community where craft, innovation, and career acceleration meet.
          </p>

          {/* Floating Search Hub */}
          <form
            onSubmit={handleSearchSubmit}
            className="mx-auto mt-8 flex max-w-2xl flex-col gap-2 rounded-2xl border border-white/15 bg-white/10 p-2.5 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center"
          >
            <div className="relative flex-1">
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search job title, skills, or department..."
                className="w-full rounded-xl border-0 bg-white px-4 py-3 pl-11 text-xs sm:text-sm text-gray-900 placeholder-gray-400 shadow-inner outline-none focus:ring-2 focus:ring-brand-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-brand-500/30 transition-all hover:from-brand-500 hover:to-indigo-500 active:scale-95"
            >
              <Search size={15} />
              <span>Search Roles</span>
            </button>
          </form>

          {/* Popular Tag Filters */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5 text-xs text-gray-300">
            <span className="font-semibold text-gray-400 mr-1">Trending:</span>
            {SUGGESTED_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(tag)}
                className={`rounded-full px-3 py-1 transition-all ${
                  selectedTag === tag
                    ? "bg-brand-500 text-white font-bold shadow-md shadow-brand-500/20"
                    : "bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Metric Highlights */}
          <div className="mt-12 grid grid-cols-2 gap-4 border-t border-white/10 pt-8 sm:grid-cols-4 max-w-3xl mx-auto text-left">
            <div className="px-3">
              <p className="text-2xl font-black text-white">2 Hubs</p>
              <p className="text-xs text-gray-400 mt-0.5">Surat Facilities</p>
            </div>
            <div className="px-3">
              <p className="text-2xl font-black text-brand-300">100%</p>
              <p className="text-xs text-gray-400 mt-0.5">Merit Based</p>
            </div>
            <div className="px-3">
              <p className="text-2xl font-black text-emerald-400">Fast-Track</p>
              <p className="text-xs text-gray-400 mt-0.5">Application Review</p>
            </div>
            <div className="px-3">
              <p className="text-2xl font-black text-white">500+</p>
              <p className="text-xs text-gray-400 mt-0.5">Team Members</p>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────── 2. Logged-in Candidate Activity Banner ────────────────── */}
      {isAuthenticated && (
        <section className="mx-auto -mt-8 max-w-7xl px-4 sm:px-6 lg:px-8 relative z-20">
          <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xl shadow-gray-200/50">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white font-black text-base shadow-md">
                  {candidate?.name?.[0]?.toUpperCase() || "C"}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    Welcome back, {candidate?.name || "Candidate"}!
                  </h3>
                  <p className="text-xs text-gray-500">Manage your active job applications and track status.</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  to="/careers/account/applications"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-3.5 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100 transition-colors"
                >
                  <FileText size={14} /> My Dashboard
                </Link>
                <Link
                  to="/careers/account/profile"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Edit Profile
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-5">
              <CandidateStatCard
                as={Link}
                to="/careers/account/applications"
                icon={<FileText size={15} className="text-brand-600" />}
                label="Applications"
                value={myStats?.applications ?? 0}
              />
              <CandidateStatCard
                as={Link}
                to="/careers/account/applications"
                icon={<Send size={15} className="text-blue-600" />}
                label="In Review"
                value={myStats?.inProgress ?? 0}
              />
              <CandidateStatCard
                as={Link}
                to="/careers/account/interviews"
                icon={<CalendarClock size={15} className="text-purple-600" />}
                label="Interviews"
                value={myStats?.interviews ?? 0}
              />
              <CandidateStatCard
                as={Link}
                to="/careers/account/saved-jobs"
                icon={<Bookmark size={15} className="text-amber-600" />}
                label="Saved Roles"
                value={savedJobIds.size}
              />
              <CandidateStatCard
                icon={<ShieldCheck size={15} className={candidate?.email_verified_at ? "text-emerald-600" : "text-amber-600"} />}
                label="Account"
                value={candidate?.email_verified_at ? "Verified" : "Pending"}
                tone={candidate?.email_verified_at ? "good" : "warn"}
              />
            </div>
          </div>
        </section>
      )}

      {/* ────────────────── 3. Main Jobs List & Filter Workspace ────────────────── */}
      <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        {/* Header with Title & Filter Controls */}
        <div className="flex flex-col gap-4 border-b border-gray-200 pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              <Briefcase size={22} className="text-brand-600" />
              Open Positions
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {loading
                ? "Loading current openings..."
                : `${visibleJobs.length} role${visibleJobs.length !== 1 ? "s" : ""} currently accepting applications`}
            </p>
          </div>

          {/* Filter Dropdowns & View Mode Toggle */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Company Dropdown */}
            <div className="relative">
              <select
                value={companyCode}
                onChange={(e) => changeCompanyCode(e.target.value)}
                className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-3.5 pr-8 text-xs font-semibold text-gray-700 shadow-sm outline-none transition-colors hover:border-gray-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="">All Companies</option>
                {COMPANY_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>

            {/* Department Dropdown */}
            <div className="relative">
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-3.5 pr-8 text-xs font-semibold text-gray-700 shadow-sm outline-none transition-colors hover:border-gray-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                {departmentOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>

            {/* Employment Type Dropdown */}
            <div className="relative">
              <select
                value={employmentType}
                onChange={(e) => changeEmploymentType(e.target.value)}
                className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-3.5 pr-8 text-xs font-semibold text-gray-700 shadow-sm outline-none transition-colors hover:border-gray-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>

            {/* View Mode Toggle */}
            <div className="hidden sm:flex items-center rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "grid" ? "bg-brand-50 text-brand-700" : "text-gray-400 hover:text-gray-700"}`}
                title="Grid View"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "list" ? "bg-brand-50 text-brand-700" : "text-gray-400 hover:text-gray-700"}`}
                title="List View"
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 font-medium">Active filters:</span>
            {search && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 border border-brand-200">
                Keyword: "{search}"
                <button onClick={clearSearch}><X size={12} /></button>
              </span>
            )}
            {companyCode && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 border border-indigo-200">
                {COMPANY_OPTIONS.find((c) => c.id === companyCode)?.label || companyCode}
                <button onClick={() => changeCompanyCode("")}><X size={12} /></button>
              </span>
            )}
            {departmentId && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700 border border-purple-200">
                {departmentOptions.find((d) => d.value === departmentId)?.label}
                <button onClick={() => setDepartmentId("")}><X size={12} /></button>
              </span>
            )}
            {employmentType && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200">
                {EMPLOYMENT_TYPES.find((t) => t.value === employmentType)?.label}
                <button onClick={() => changeEmploymentType("")}><X size={12} /></button>
              </span>
            )}
            {selectedTag && selectedTag !== "All" && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-200">
                Tag: {selectedTag}
                <button onClick={() => setSelectedTag("All")}><X size={12} /></button>
              </span>
            )}
            <button
              onClick={clearAllFilters}
              className="text-xs font-bold text-red-600 hover:underline ml-1"
            >
              Reset All
            </button>
          </div>
        )}

        {/* ────────────────── Job Listing Grid / List ────────────────── */}
        <div className="mt-8">
          {loading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-56 animate-pulse rounded-2xl border border-gray-200 bg-white p-6" />
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-3xl border border-dashed border-red-200 bg-red-50/50 p-16 text-center">
              <AlertCircle size={36} className="mx-auto text-red-400" />
              <h3 className="mt-4 text-base font-bold text-gray-900">Unable to load job positions</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">There was an issue fetching active positions. Please retry.</p>
              <button
                onClick={() => loadJobs()}
                className="mt-5 inline-flex rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-700 shadow-md shadow-brand-500/20"
              >
                Reload Openings
              </button>
            </div>
          ) : visibleJobs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-16 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 mb-4">
                <Briefcase size={26} />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                {hasActiveFilters ? "No roles match your specific filter criteria" : "No open positions currently available"}
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-xs text-gray-500 leading-relaxed">
                {hasActiveFilters
                  ? "Try adjusting your search keywords, clear one of the filters, or explore all departments."
                  : "We regularly post new openings for skilled craftsmen, technicians, and engineering specialists."}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-700 shadow-md shadow-brand-500/20"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div className={viewMode === "grid" ? "grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3" : "space-y-4"}>
              {visibleJobs.map((job) => (
                <JobCard key={job.id} job={job} initiallySaved={savedJobIds.has(job.id)} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ────────────────── 4. Culture & Why Work With Us Section ────────────────── */}
      <section id="culture-section" className="mx-auto max-w-7xl px-4 pt-24 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-gray-200/90 bg-gradient-to-br from-white via-gray-50/50 to-brand-50/20 p-8 sm:p-12 shadow-sm">
          <div className="text-center max-w-2xl mx-auto">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100/80 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-brand-700">
              <Building2 size={13} /> Work Life at NISS
            </span>
            <h3 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
              Why Join Nidhi Impex & Silver Star?
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-gray-500">
              We provide an empowering workspace designed for craftsmen, technicians, and forward-thinking professionals.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <CultureTile
              icon={<Gem size={22} className="text-brand-600" />}
              title="Modern Facility & Craft"
              description="State-of-the-art machinery and precision laser processing environments in Surat."
            />
            <CultureTile
              icon={<Trophy size={22} className="text-indigo-600" />}
              title="Merit & Recognition"
              description="Clear career trajectories, timely performance bonuses, and advancement paths."
            />
            <CultureTile
              icon={<HeartHandshake size={22} className="text-emerald-600" />}
              title="Health & Safety First"
              description="Prioritized employee safety protocols, wellness support, and comprehensive insurance."
            />
            <CultureTile
              icon={<Layers size={22} className="text-amber-600" />}
              title="Skill Mentorship"
              description="Structured on-job training programs to upskill in cutting-edge manufacturing processes."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function CandidateStatCard({ icon, label, value, tone, as: Component = "div", ...linkProps }) {
  const toneClass = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-gray-900";
  const interactive = Component !== "div";
  return (
    <Component
      {...linkProps}
      className={`rounded-xl border border-gray-100 bg-gray-50/70 p-3 text-center sm:text-left ${
        interactive ? "transition-all hover:bg-brand-50/50 hover:border-brand-200" : ""
      }`}
    >
      <div className="flex items-center justify-center gap-1.5 text-gray-500 sm:justify-start">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`mt-1 text-lg font-black ${toneClass}`}>{value ?? "—"}</p>
    </Component>
  );
}

function CultureTile({ icon, title, description }) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-50 border border-gray-100 mb-4">
        {icon}
      </div>
      <h4 className="font-bold text-gray-900 text-sm">{title}</h4>
      <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}

