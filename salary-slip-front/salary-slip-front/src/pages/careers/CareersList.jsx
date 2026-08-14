import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, MapPin, Briefcase, Calendar, ChevronRight, Sparkles } from "lucide-react";
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
    <div className="space-y-12 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900 border-b border-slate-800 py-16 px-4 text-center">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles size={14} /> Join Our Team
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Build the Future With Us
          </h1>
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto">
            Discover exciting career opportunities across technology, operations, and management.
          </p>

          {/* Search Filter Bar */}
          <form onSubmit={handleSearchSubmit} className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-3 pt-4">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3.5 top-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search job title, skills, keywords..."
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-400 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className="px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">All Employment Types</option>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="contract">Contract</option>
              <option value="intern">Intern</option>
            </select>
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm transition-colors shadow-lg"
            >
              Search Jobs
            </button>
          </form>
        </div>
      </section>

      {/* Jobs Listing Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Open Positions ({jobs.length})</h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-44 rounded-2xl bg-slate-800/50 animate-pulse border border-slate-800" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center">
            <Briefcase size={40} className="mx-auto text-slate-600 mb-3" />
            <h3 className="text-lg font-semibold text-slate-300">No Open Job Listings</h3>
            <p className="text-sm text-slate-500 mt-1">Check back later or adjust your search filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {jobs.map((job) => (
              <Link
                key={job.id}
                to={`/careers/jobs/${job.id}`}
                className="group rounded-2xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800/80 p-6 transition-all hover:border-slate-700 hover:shadow-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="inline-block text-xs font-semibold text-brand-400 uppercase tracking-wider mb-1">
                        {job.department?.name || "General"}
                      </span>
                      <h3 className="text-xl font-bold text-white group-hover:text-brand-300 transition-colors">
                        {job.title}
                      </h3>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700 capitalize">
                      {job.employment_type?.replace("_", " ")}
                    </span>
                  </div>

                  <p className="text-sm text-slate-400 mt-3 line-clamp-2">
                    {job.designation ? `Designation: ${job.designation}` : "Explore this opportunity."}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <Briefcase size={14} className="text-slate-500" />
                      {job.min_experience ? `${job.min_experience}+ yrs exp` : "Freshers welcome"}
                    </span>
                    {job.target_closing_date && (
                      <span className="flex items-center gap-1">
                        <Calendar size={14} className="text-slate-500" />
                        Closes {new Date(job.target_closing_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <span className="flex items-center gap-1 font-semibold text-brand-400 group-hover:translate-x-1 transition-transform">
                    Apply <ChevronRight size={14} />
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
