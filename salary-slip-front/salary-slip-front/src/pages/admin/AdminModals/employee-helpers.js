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

  const photoValue = String(photo).trim();

  if (!photoValue) return "";

  if (/^(https?:)?\/\//i.test(photoValue) || photoValue.startsWith("data:")) {
    return photoValue;
  }

  // A server-local filesystem path is never servable to the browser. Chrome
  // parses a leading drive letter as a URL scheme and rewrites "C:\…" to
  // file:///C:/…, then refuses to load it ("Not allowed to load local
  // resource"). Older rows hold PHP temp upload paths like
  // C:\…\Temp\phpXXXX.tmp; render them as "no image" rather than a broken one.
  if (/^[a-z]:[\\/]/i.test(photoValue) || photoValue.startsWith("\\\\") || /^file:/i.test(photoValue)) {
    return "";
  }

  return `${baseUrl}/storage/${photoValue.replace(/^\/+/, "")}`;
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
