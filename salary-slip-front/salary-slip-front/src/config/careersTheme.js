import { getCompanyConfig, normalizeCompanyId } from "./companyConfig";

/**
 * Resolves the real, non-fabricated branding for a job's employer: which of
 * the group's two operating companies posted it (logo, name, theme) and the
 * real city pulled from that company's own registered address. Falls back to
 * the group identity (NISS — Nidhi Impex Silver Star) when a job has no
 * company_code, which happens on multi-company ("all") builds before a job
 * is assigned, or when nothing more specific is known.
 */
export function resolveJobBranding(job) {
  const company = job?.company_code ? getCompanyConfig(job.company_code) : null;

  if (!company) {
    return {
      id: "niss",
      name: "Nidhi Impex Silver Star",
      shortName: "NISS",
      logo: null,
      theme: "indigo",
      city: "Surat, Gujarat",
    };
  }

  return {
    id: normalizeCompanyId(job.company_code),
    name: company.name,
    shortName: company.label,
    logo: company.logo,
    theme: company.theme,
    city: cityFromAddress(company.addressLines),
  };
}

function cityFromAddress(addressLines) {
  const joined = (addressLines || []).join(" ");
  const match = joined.match(/([A-Za-z\s]+)-\s*\d{6}[,\s]+GUJARAT/i);
  return match ? `${titleCase(match[1].trim())}, Gujarat` : "Surat, Gujarat";
}

function titleCase(value) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const EMPLOYMENT_TYPE_LABELS = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  intern: "Internship",
};

export function formatEmploymentType(value) {
  return EMPLOYMENT_TYPE_LABELS[value] || (value ? value.replace(/_/g, " ") : "Full Time");
}

export function formatExperience(job) {
  if (!job?.min_experience && !job?.max_experience) return "Open to freshers";
  if (job.min_experience && job.max_experience) {
    return `${job.min_experience}–${job.max_experience} yrs experience`;
  }
  return `${job.min_experience || job.max_experience}+ yrs experience`;
}

export function formatPostedAgo(dateString) {
  if (!dateString) return null;
  const posted = new Date(dateString);
  if (Number.isNaN(posted.getTime())) return null;

  const days = Math.floor((Date.now() - posted.getTime()) / 86400000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 7) return `Posted ${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `Posted ${weeks} week${weeks > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `Posted ${months} month${months > 1 ? "s" : ""} ago`;
}
