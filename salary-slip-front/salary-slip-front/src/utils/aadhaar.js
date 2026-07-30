/**
 * Aadhaar display helpers.
 *
 * The full number is sensitive personal data: the backend hides
 * `aadhar_card_no` from every API response and appends `aadhaar_masked`
 * instead, so the UI only ever has the last four digits to work with. These
 * helpers exist so masking is not re-implemented per screen — one of those
 * copies would inevitably render the whole number.
 *
 * Values stay strings throughout. An Aadhaar is an identifier, not a quantity:
 * Number()/parseInt would drop leading zeros and lose precision past 15 digits.
 */

/** Digits only, so "1234 5678 9012" and "1234-5678-9012" compare equal. */
export function normaliseAadhaar(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** Exactly 12 digits — the only shape worth storing or sending. */
export function isCompleteAadhaar(value) {
  return normaliseAadhaar(value).length === 12;
}

/**
 * "XXXX XXXX 9012", or "" when there is no complete number to mask. Callers
 * decide how to render the empty case ("—", "Not provided"), so this never
 * invents display text that could be mistaken for a stored value.
 */
export function maskAadhaar(value) {
  const digits = normaliseAadhaar(value);

  return digits.length === 12 ? `XXXX XXXX ${digits.slice(-4)}` : "";
}

/**
 * Whether an Aadhaar is stored for a record, from whatever the API returned.
 *
 * Prefers the explicit `has_aadhaar` boolean: a legacy row holding a malformed
 * value masks to "", which would otherwise read as "nothing stored" and let the
 * UI demand a number it already has.
 */
export function hasStoredAadhaar(record) {
  if (!record) return false;
  if (typeof record.has_aadhaar === "boolean") return record.has_aadhaar;

  return Boolean(record.aadhaar_masked);
}

/**
 * What an edit/create form should send for `aadhar_card_no`.
 *
 * Editing: the stored number is never sent to the browser, so a blank input
 * means "unchanged" and the field must be omitted entirely — sending "" or null
 * is what erased stored Aadhaars and detached records from their S3 documents.
 *
 * @returns {{include: boolean, value?: string, error?: string}}
 */
export function buildSafeAadhaarUpdate({
  enteredValue,
  hasStored = false,
  isCreateMode = false,
  required = false,
}) {
  const entered = String(enteredValue ?? "").trim();

  if (!entered) {
    if (isCreateMode) {
      return required
        ? { include: false, error: "Enter the complete 12-digit Aadhaar number." }
        : { include: false };
    }

    // Editing with nothing typed: keep whatever is stored.
    return hasStored
      ? { include: false }
      : { include: false, ...(required && { error: "Enter the complete 12-digit Aadhaar number." }) };
  }

  const digits = normaliseAadhaar(entered);

  if (digits.length !== 12) {
    // Covers a partial entry and a pasted "XXXX XXXX 9012", which normalises to
    // four digits and must never be stored as a replacement.
    return { include: false, error: "Enter the complete 12-digit Aadhaar number." };
  }

  return { include: true, value: digits };
}
