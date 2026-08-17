import { Link } from "react-router-dom";
import { MapPin, ArrowUpRight } from "lucide-react";
import {
  resolveJobBranding,
  formatEmploymentType,
  formatExperience,
  formatPostedAgo,
} from "../../config/careersTheme";
import SaveJobButton from "./SaveJobButton";

/**
 * The portal's one recurring card shape: a solid left "spine" in the
 * employer's brand color, standing in for a full border on every side. It
 * reads like a ledger tab or a fabric selvage rather than a generic
 * rounded-card-with-shadow, and it's the one place brand color shows up in
 * the otherwise-neutral listing grid.
 */
export default function JobCard({ job, initiallySaved = false }) {
  const branding = resolveJobBranding(job);
  const postedAgo = formatPostedAgo(job.posted_at);

  return (
    <Link
      to={`/careers/jobs/${job.id}`}
      data-theme={branding.theme}
      className="group relative flex flex-col justify-between overflow-hidden rounded-lg border border-nx-line border-l-[3px] border-l-brand-500 bg-nx-surface p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-nx-line2 hover:shadow-[0_12px_28px_-16px_rgba(33,29,23,0.25)]"
    >
      <div>
        <div className="flex items-start justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700">
            {job.department?.name || "General"}
          </span>
          <div className="flex flex-shrink-0 items-center gap-1">
            <SaveJobButton jobId={job.id} initialSaved={initiallySaved} />
            <ArrowUpRight
              size={18}
              className="text-nx-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600"
            />
          </div>
        </div>

        <h3 className="mt-2.5 text-lg font-bold leading-snug text-nx-ink">
          {job.title}
        </h3>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium text-nx-muted">
          <span className="inline-flex items-center gap-1">
            <MapPin size={13} className="text-nx-faint" />
            {branding.city}
            {job.unit ? ` · ${job.unit}` : ""}
          </span>
          <span className="text-nx-faint">·</span>
          <span>{formatEmploymentType(job.employment_type)}</span>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-nx-line pt-4 text-[13px] font-medium text-nx-muted">
        <span>{formatExperience(job)}</span>
        {postedAgo && <span className="text-nx-faint">{postedAgo}</span>}
      </div>
    </Link>
  );
}
