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
