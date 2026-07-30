/**
 * Aadhaar display helpers.
 *
 * The authenticated internal application shows the complete number wherever an
 * Aadhaar field appears. The gate is entirely server-side and entirely about the
 * record: an authorised request for an employee or appointment receives
 * `aadhaar_full`, and one that is out of the caller's organisation, company or
 * unit scope receives nothing and never learns the record exists. The raw column
 * stays in User::$hidden, so `aadhaar_full` is only ever added deliberately, per
 * response, by AadhaarDisclosure.
 *
 * These helpers exist so formatting is not re-implemented per screen — divergent
 * copies are what previously left the profile page masked while appointment
 * details showed the full number.
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
 * "XXXX XXXX 9012", or "" when there is no complete number to mask.
 *
 * No longer used for display anywhere. The authenticated internal UI shows the
 * complete number to anyone allowed to open the record, so masking a value the
 * same page already displays in full would only be theatre. Kept because
 * `aadhaar_masked` is still returned for API compatibility and because the
 * backend audit trail records last-four.
 */
export function maskAadhaar(value) {
  const digits = normaliseAadhaar(value);

  return digits.length === 12 ? `XXXX XXXX ${digits.slice(-4)}` : "";
}

/**
 * "7151 1598 8793" for display to an authorised viewer, or "-" when there is no
 * complete number. Never derives anything from a mask — a masked string has only
 * four real digits and cannot be turned back into an Aadhaar.
 */
export function formatFullAadhaar(value) {
  const digits = normaliseAadhaar(value);

  if (digits.length !== 12) {
    return "-";
  }

  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
}

/**
 * What every screen renders for an Aadhaar: the complete number, grouped.
 *
 * `aadhaar_full` is present whenever the server decided this request is allowed
 * to see the record at all, so the presence of the field *is* the authorisation
 * result — the client never makes that call itself.
 *
 * Deliberately does NOT fall back to `aadhaar_masked`. That fallback is what made
 * the app inconsistent: a screen whose payload happened to omit `aadhaar_full`
 * silently rendered "XXXX XXXX 1345" and looked like a permission decision rather
 * than a missing field. "-" makes the absence obvious instead.
 */
export function aadhaarDisplayFor(record) {
  // Several legacy row shapes carry the number under different keys; all of them
  // hold a complete value or nothing, so any of them is a valid source.
  return formatFullAadhaar(
    record?.aadhaar_full ??
      record?.aadhar_full ??
      record?.aadhar_card_no ??
      record?.aadhar_no ??
      record?.aadharNo,
  );
}

/**
 * The name used across the app. One helper so no screen invents its own rule —
 * that is how the profile page ended up masked while appointment details showed
 * the full number.
 */
export const getAadhaarDisplayValue = aadhaarDisplayFor;

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
  if (isCompleteAadhaar(record.aadhaar_full ?? record.aadhar_card_no)) return true;

  return Boolean(record.aadhaar_masked);
}

/**
 * What an edit/create form should send for `aadhar_card_no`.
 *
 * Editing: the input is prefilled with the stored number, but a cleared field
 * still means "unchanged" rather than "erase it" — the field is omitted entirely.
 * Sending "" or null is what erased stored Aadhaars and detached records from
 * their S3 document folders, and a half-deleted field must not be able to do that
 * either, which is why anything short of 12 digits is refused outright.
 *
 * @returns {{include: boolean, value?: string, error?: string}}
 */
export function buildSafeAadhaarUpdate({
  enteredValue,
  hasStored = false,
  isCreateMode = false,
  required = false,
}) {
  // A value carrying no digits is not an attempted replacement. This matters
  // because a record with no stored number prefills the input with "-" (what
  // getAadhaarDisplayValue renders for "nothing on file"), and treating that as a
  // malformed entry blocked the save of every employee who had no Aadhaar.
  const entered = normaliseAadhaar(enteredValue) === ""
    ? ""
    : String(enteredValue ?? "").trim();

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
