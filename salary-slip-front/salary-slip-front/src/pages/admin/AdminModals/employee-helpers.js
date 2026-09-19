import { baseUrl } from "../../../utils/url";

/**
 * Pure helpers shared by the employee screens.
 *
 * Kept apart from EmployeeHelpers.jsx so that file exports nothing but
 * components: fast refresh can only preserve state for a module whose exports
 * are all components, and mixing these in meant editing a date formatter
 * remounted every employee modal and threw away half-filled forms.
 */
export function getEmployeePhotoUrl(photo) {
  if (!photo) return "";

  let raw = photo;
  if (typeof photo === "object" && photo !== null) {
    raw = photo.url || photo.path || photo.src || "";
  }

  let photoValue = String(raw).trim();

  if (!photoValue || photoValue === "null" || photoValue === "undefined") return "";

  // A server-local filesystem path is never servable to the browser.
  if (/^[a-z]:[\\/]/i.test(photoValue) || photoValue.startsWith("\\\\") || /^file:/i.test(photoValue)) {
    return "";
  }

  // If the photo URL contains localhost or 127.0.0.1 (e.g. from backend APP_URL=http://localhost:8000),
  // rewrite localhost to baseUrl so network clients can load the photo without ERR_CONNECTION_REFUSED.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(photoValue)) {
    const rel = photoValue.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, "");
    const cleanRel = rel.replace(/^[\\/]+/, "");
    return `${baseUrl}/${cleanRel}`;
  }

  if (/^(https?:)?\/\//i.test(photoValue) || photoValue.startsWith("data:") || photoValue.startsWith("blob:")) {
    return photoValue;
  }

  const cleanPath = photoValue.replace(/^[\\/]+/, "");
  if (cleanPath.startsWith("storage/")) {
    return `${baseUrl}/${cleanPath}`;
  }
  if (cleanPath.startsWith("local-documents/") || cleanPath.startsWith("api/")) {
    return `${baseUrl}/${cleanPath}`;
  }

  return `${baseUrl}/storage/${cleanPath}`;
}

export function validatePassword(pwd) {
  return {
    length: pwd.length >= 6,
    upper: /[A-Z]/.test(pwd),
    lower: /[a-z]/.test(pwd),
    digit: /[0-9]/.test(pwd),
    special: /[^A-Za-z0-9]/.test(pwd),
  };
}

export function isPasswordValid(pwd) {
  const v = validatePassword(pwd);
  return v.length && v.upper && v.lower && v.digit && v.special;
}

export function formatDateInputValue(value) {
  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
