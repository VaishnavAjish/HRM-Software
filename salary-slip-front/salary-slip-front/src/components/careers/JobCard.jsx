import { Link } from "react-router-dom";
import { MapPin, ArrowRight, Clock, Briefcase, Sparkles, Building } from "lucide-react";
import {
  resolveJobBranding,
  formatEmploymentType,
  formatExperience,
  formatPostedAgo,
} from "../../config/careersTheme";
import SaveJobButton from "./SaveJobButton";

export default function JobCard({ job, initiallySaved = false }) {
  const branding = resolveJobBranding(job);
  const postedAgo = formatPostedAgo(job.posted_at);

  const isRecent = job.posted_at && (Date.now() - new Date(job.posted_at).getTime()) < (7 * 86400000);

  return (
    <div
      data-theme={branding.theme}
      className="group relative flex flex-col justify-between rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-400 hover:shadow-xl hover:shadow-brand-500/10"
    >
      <div>
        {/* Header Badges & Action */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-700 border border-brand-200/60">
              <Building size={12} className="text-brand-600" />
              {branding.shortName}
            </span>
            {job.department?.name && (
              <span className="inline-flex items-center rounded-lg bg-gray-100/80 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                {job.department.name}
              </span>
            )}
            {isRecent && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/60 animate-pulse">
                <Sparkles size={10} /> New
              </span>
            )}
          </div>

          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <SaveJobButton jobId={job.id} initialSaved={initiallySaved} />
          </div>
        </div>

        {/* Job Title */}
        <Link to={`/careers/jobs/${job.id}`} className="block focus:outline-none">
          <h3 className="mt-3.5 text-lg font-bold text-gray-900 group-hover:text-brand-600 transition-colors line-clamp-2">
            {job.title}
          </h3>
        </Link>

        {/* Metadata Chips */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs font-medium text-gray-600">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-1">
            <MapPin size={13} className="text-gray-400" />
            {branding.city}{job.unit ? ` · ${job.unit}` : ""}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-1">
            <Briefcase size={13} className="text-gray-400" />
            {formatEmploymentType(job.employment_type)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-1">
            {formatExperience(job)}
          </span>
        </div>
      </div>

      {/* Card Footer with Link */}
      <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4 text-xs font-semibold">
        <div className="flex items-center gap-1 text-gray-400">
          <Clock size={13} />
          <span>{postedAgo || "Recently posted"}</span>
        </div>

        <Link
          to={`/careers/jobs/${job.id}`}
          className="inline-flex items-center gap-1.5 font-bold text-brand-600 group-hover:text-brand-700 transition-all"
        >
          <span>View Details</span>
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}

