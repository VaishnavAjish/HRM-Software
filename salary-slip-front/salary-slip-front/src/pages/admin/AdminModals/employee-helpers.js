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
  const str = String(value).trim();
  if (str.startsWith("1899") || str.startsWith("1900") || str.startsWith("0000")) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime()) || date.getFullYear() <= 1900) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(value) {
  if (!value) return "";
  const str = String(value).trim();
  if (str.startsWith("1899") || str.startsWith("1900") || str.startsWith("0000")) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime()) || date.getFullYear() <= 1900) {
    return "";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

import { getCompanyConfig } from "../../../config/companyConfig";
import { getAadhaarDisplayValue, hasStoredAadhaar } from "../../../utils/aadhaar";

export function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? "";
}

export function mapEmployee(item) {
  const displayName = item.name || item.email?.split("@")[0] || "-";

  const avatar = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isActive = String(item.status) === "0";
  const isPending = String(item.status) === "2";
  const isResigned = Boolean(item.resignation_date) && String(item.resignation_date).slice(0, 10) <= new Date().toISOString().slice(0, 10);
  const roleValue = String(item.role);
  const loginRole =
    roleValue === "0"
      ? "superadmin"
      : roleValue === "1"
        ? "master"
        : roleValue === "2"
          ? "manager"
          : roleValue === "4" || item.type === "agent"
            ? "agent"
            : "employee";

  return {
    id: item.id,
    name: item.name ?? "",
    displayName,
    empCode: String(item.emp_code ?? item.empCode ?? ""),
    email: item.email ?? "",
    companyId: item.company_code ?? "",
    companyLabel: getCompanyConfig(item.company_code)?.label || "-",
    unit: item.unit ?? "",
    department: item.department ?? "",
    positionTitle: item.position_title ?? item.position ?? item.designation ?? "",
    managerName: item.manager_name ?? item.manager ?? "",
    status: isResigned ? "Resigned" : isPending ? "Pending" : isActive ? "Active" : "Inactive",
    loginRole,
    agentCompany: item.company_code === "nidhi-impex,silverstar" || item.company_code === "all" ? "" : item.company_code,
    avatar,
    accountName: item.account_name ?? "",
    accountNo: item.account_no ?? "",
    mobileNo: firstPresent(item.mobileNo, item.mobile_no, item.mobile_number, item.mob_num),
    dob: firstPresent(item.dob, item.date_of_birth, item.birth_date),
    address: firstPresent(
      item.address,
      item.residential_address,
      item.current_address,
    ),
    gender: item.gender ?? "",
    city: item.city ?? "",
    pin: item.pin ?? "",
    district: item.district ?? "",
    state: item.state ?? "",
    pfNo: firstPresent(item.pfNo, item.pf_no),
    esiNo: firstPresent(item.esiNo, item.esi_no),
    bankName: firstPresent(item.bankName, item.bank_name),
    bankIfscCode: firstPresent(item.bankIfscCode, item.bank_ifsc_code),
    bankAccountNo: firstPresent(item.bankAccountNo, item.bank_account_no),
    aadharCardNo: getAadhaarDisplayValue(item),
    aadhaarOnFile: getAadhaarDisplayValue(item),
    aadhaarMasked: item.aadhaar_masked ?? "",
    hasAadhaar: hasStoredAadhaar(item),
    panCardNo: firstPresent(item.panCardNo, item.pan_card_no, item.pan_no),
    designation: item.designation ?? "",
    joiningDate: firstPresent(item.joiningDate, item.joining_date, item.date_of_joining),
    resignationDate: firstPresent(item.resignationDate, item.resignation_date),
    photo: firstPresent(
      item.photo,
      item.image,
      item.profile_photo,
      item.profile_image,
      item.avatar,
    ),
    familyDetails: Array.isArray(item.family_members)
      ? item.family_members.map((m) => ({
          id: m.id,
          name: m.name ?? "",
          relation: m.relation ?? "",
          mobileNumber: m.mobile_number ?? "",
        }))
      : undefined,
  };
}
