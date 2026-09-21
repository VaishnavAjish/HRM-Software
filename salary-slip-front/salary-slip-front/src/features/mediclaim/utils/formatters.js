import { baseUrl } from "../../../utils/url";

/**
 * Formatting helpers for Mediclaim views, matching the codebase's existing
 * date/currency conventions (see `src/components/tickets/ticketMeta.js`'s
 * `formatDate` and `src/utils/payslipUtils.js`'s `formatMoneyValue`) rather
 * than inventing new ones.
 */

export function formatCurrencyINR(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatClaimDate(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Masks a card/member/policy number down to its last 4 characters, e.g.
 * "XXXX-4821" — matching the shape used in the public card-verify payload's
 * `member_number_masked` / `policy_number_masked` fields (backend plan B6),
 * so the authenticated card UI and the public verify page display numbers
 * the same way.
 */
export function formatMaskedCardNumber(cardNumber) {
  const raw = String(cardNumber || "").replace(/\s+/g, "");
  if (!raw) return "—";
  return `XXXX-${raw.slice(-4)}`;
}

/**
 * "2026-27" label for the Indian financial year (April 1 – March 31)
 * containing `value` — mirrors `PolicyEligibilityService`'s FY math
 * server-side exactly (the floater renews on the same boundary), so a claim
 * grouped under "FY 2026-27" here is always the same claim counted against
 * FY 2026-27's floater on the backend. Returns `null` for an unparseable/
 * missing date so callers can bucket those separately rather than showing a
 * nonsense label.
 */
export function getFinancialYearLabel(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const month = date.getMonth() + 1; // JS months are 0-indexed
  const startYear = month >= 4 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * Hospital contact photos are stored the same way employee photos are — a
 * server-relative path under the `public` disk — so this mirrors
 * `src/pages/admin/AdminModals/employee-helpers.js`'s `getEmployeePhotoUrl`
 * exactly rather than importing an employee-specific helper into this
 * feature.
 */
export function getHospitalContactPhotoUrl(photo) {
  if (!photo) return "";
  const value = String(photo).trim();
  if (!value) return "";
  if (/^(https?:)?\/\//i.test(value) || value.startsWith("data:")) return value;
  return `${baseUrl}/storage/${value.replace(/^\/+/, "")}`;
}

/**
 * Formats claim numbers according to the company + branch naming specification:
 * - Nidhi Impex + Shreeji -> NS-EMP_CODE-YYYY-MM-DD
 * - Nidhi Impex + Ichapur -> NI-EMP_CODE-YYYY-MM-DD
 * - Silver Star + Daduk   -> SD-EMP_CODE-YYYY-MM-DD
 * - Silver Star + Ichapur -> SI-EMP_CODE-YYYY-MM-DD
 * Date format is strictly YYYY-MM-DD.
 */
export function formatClaimNumber(claim) {
  if (!claim) return "-";

  if (typeof claim === "string") {
    return claim.trim() || "-";
  }

  const raw = String(claim.claimNumber || claim.claim_number || "").trim();

  const company = String(
    claim.employee?.company_code ||
    claim.employee_snapshot?.company_code ||
    claim.company_code ||
    claim.companyCode ||
    claim.companyId ||
    ""
  ).trim();

  const branch = String(
    claim.employee?.unit ||
    claim.employee?.branch ||
    claim.unit ||
    claim.branch ||
    claim.patient_snapshot?.unit ||
    claim.employee_snapshot?.unit ||
    claim.employee_snapshot?.branch ||
    ""
  ).trim();

  const compLower = company.toLowerCase();
  const branchLower = branch.toLowerCase();

  const isNidhi = compLower.includes("nidhi") || compLower.startsWith("n");
  const isSilver = compLower.includes("silver") || compLower.startsWith("s");

  const isShreeji = branchLower.includes("shreeji") || branchLower.startsWith("s");
  const isIchapur = branchLower.includes("ichapur") || branchLower.includes("ichhapore") || branchLower.includes("ichhapor") || branchLower.startsWith("i");
  const isDaduk = branchLower.includes("daduk") || branchLower.includes("dhaduk") || branchLower.startsWith("d");

  let expectedPrefix;
  if (isNidhi && isShreeji) {
    expectedPrefix = "NS";
  } else if (isNidhi && isIchapur) {
    expectedPrefix = "NI";
  } else if (isSilver && isDaduk) {
    expectedPrefix = "SD";
  } else if (isSilver && isIchapur) {
    expectedPrefix = "SI";
  } else {
    // First alphabet of company + First alphabet of unit
    const cClean = company.replace(/[^a-zA-Z]/g, "");
    const cInitial = isNidhi ? "N" : (isSilver ? "S" : (cClean[0] ? cClean[0].toUpperCase() : "M"));

    const bClean = branch.replace(/[^a-zA-Z]/g, "");
    let bInitial;
    if (isShreeji) {
      bInitial = "S";
    } else if (isIchapur) {
      bInitial = "I";
    } else if (isDaduk) {
      bInitial = "D";
    } else if (bClean[0]) {
      bInitial = bClean[0].toUpperCase();
    } else {
      bInitial = cInitial === "N" ? "S" : (cInitial === "S" ? "D" : "C");
    }
    expectedPrefix = `${cInitial}${bInitial}`;
  }

  // If raw is already formatted as {PREFIX}-{EMP_CODE}-{YYYY-MM-DD}[-{SEQ}]
  const match = raw.match(/^([A-Za-z]{2})-(.+)-(\d{4}-\d{2}-\d{2}(?:-\d+)?)$/);
  if (match) {
    const currentPrefix = match[1].toUpperCase();
    const rest = `${match[2]}-${match[3]}`;

    // If expectedPrefix was resolved and differs from currentPrefix, rewrite with the accurate prefix
    if (expectedPrefix && currentPrefix !== expectedPrefix) {
      return `${expectedPrefix}-${rest}`;
    }
    return `${currentPrefix}-${rest}`;
  }

  const empCode = String(
    claim.employee?.emp_code ||
    claim.employee_snapshot?.emp_code ||
    claim.emp_code ||
    claim.empCode ||
    "0001"
  );

  let dateStr = "";
  const dateVal =
    claim.submittedAt ||
    claim.submitted_at ||
    claim.admissionDate ||
    claim.admission_at ||
    claim.createdAt ||
    claim.created_at;

  if (dateVal) {
    try {
      const d = new Date(dateVal);
      if (!Number.isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        dateStr = `${year}-${month}-${day}`;
      }
    } catch {
      // fallback
    }
  }

  if (!dateStr) {
    const rawDateMatch = raw.match(/(\d{4}-\d{2}-\d{2})/);
    if (rawDateMatch) {
      dateStr = rawDateMatch[1];
    } else {
      dateStr = new Date().toISOString().slice(0, 10);
    }
  }

  return `${expectedPrefix || "MC"}-${empCode}-${dateStr}`;
}
