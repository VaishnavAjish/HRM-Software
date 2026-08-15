import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Briefcase, Calendar, ChevronRight, Sparkles } from "lucide-react";
import { publicJobApi } from "../../utils/api";

export default function CareersList() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [employmentType, setEmploymentType] = useState("");

  const loadJobs = () => {
    setLoading(true);
    publicJobApi.getJobs({
      search: search.trim() || undefined,
      employment_type: employmentType || undefined,
    })
      .then((res) => {
        if (res.status) {
          setJobs(res.data?.data || res.data || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(loadJobs, [employmentType]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadJobs();
  };

  return (
    <div className="space-y-12 pb-16 bg-slate-50 min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-indigo-50 border-b border-slate-200/60 py-20 px-4 text-center shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.03)]">
        {/* Decorative ambient blobs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-200/40 rounded-full mix-blend-multiply filter blur-3xl opacity-60 animate-blob"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-200/40 rounded-full mix-blend-multiply filter blur-3xl opacity-60 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-32 left-1/2 w-96 h-96 bg-pink-100/40 rounded-full mix-blend-multiply filter blur-3xl opacity-60 animate-blob animation-delay-4000"></div>

        <div className="relative max-w-4xl mx-auto space-y-6 z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-brand-100 shadow-sm text-brand-600 text-xs font-bold uppercase tracking-wider">
            <Sparkles size={14} className="text-brand-500" /> Join Our Team
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Build the Future <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-indigo-600">With Us</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto font-medium">
            Discover exciting career opportunities across technology, operations, and management.
          </p>

          {/* Search Filter Bar */}
          <form onSubmit={handleSearchSubmit} className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-3 pt-6">
            <div className="relative flex-1 group">
              <Search size={18} className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search job title, skills, keywords..."
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 shadow-sm transition-all"
              />
            </div>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 shadow-sm transition-all cursor-pointer"
            >
              <option value="">All Employment Types</option>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="contract">Contract</option>
              <option value="intern">Intern</option>
            </select>
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm transition-all shadow-md shadow-brand-500/20 hover:-translate-y-0.5"
            >
              Search Jobs
            </button>
          </form>
        </div>
      </section>

      {/* Jobs Listing Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-extrabold text-slate-900">Open Positions <span className="text-brand-600 font-bold bg-brand-50 px-2.5 py-0.5 rounded-full text-sm ml-2">{jobs.length}</span></h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-44 rounded-2xl bg-white shadow-sm border border-slate-100 animate-pulse" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-16 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Briefcase size={32} className="text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">No Open Job Listings</h3>
            <p className="text-slate-500 mt-2 max-w-sm mx-auto">Check back later or adjust your search filters to find the perfect role.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {jobs.map((job) => (
              <Link
                key={job.id}
                to={`/careers/jobs/${job.id}`}
                className="group rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-300 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-500/5 hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="inline-block text-xs font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded-md uppercase tracking-wider mb-2">
                        {job.department?.name || "General"}
                      </span>
                      <h3 className="text-xl font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                        {job.title}
                      </h3>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-slate-50 text-slate-600 text-xs font-semibold border border-slate-200 capitalize whitespace-nowrap">
                      {job.employment_type?.replace("_", " ")}
                    </span>
                  </div>

                  <p className="text-sm text-slate-500 mt-3 line-clamp-2 font-medium">
                    {job.designation ? `Designation: ${job.designation}` : "Explore this opportunity."}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <Briefcase size={14} className="text-slate-400" />
                      {job.min_experience ? `${job.min_experience}+ yrs exp` : "Freshers welcome"}
                    </span>
                    {job.target_closing_date && (
                      <span className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-slate-400" />
                        Closes {new Date(job.target_closing_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <span className="flex items-center gap-1 font-bold text-brand-600 group-hover:translate-x-1 transition-transform">
                    Apply <ChevronRight size={14} strokeWidth={3} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
