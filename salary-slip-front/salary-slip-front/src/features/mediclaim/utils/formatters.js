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
