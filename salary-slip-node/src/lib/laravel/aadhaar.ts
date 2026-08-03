import crypto from 'node:crypto';

/**
 * Port of App\Support\AadhaarReference.
 *
 * The reference is a storage prefix that reaches bucket listings, S3 access
 * logs and presigned URLs, so it must stay byte-identical to what PHP produced
 * — a different value orphans every existing document folder. The keying
 * secret is therefore permanent data, not a rotatable credential.
 */

const DIGITS_ONLY = /\D+/g;
const TWELVE_DIGITS = /^\d{12}$/;

/** Digits only, no spaces or hyphens. Returns '' when nothing usable. */
export function normalise(value: string | null | undefined): string {
  return String(value ?? '').replace(DIGITS_ONLY, '');
}

export function isValid(value: string | null | undefined): boolean {
  return TWELVE_DIGITS.test(normalise(value));
}

export function lastFour(value: string | null | undefined): string {
  const digits = normalise(value);
  return digits.length >= 4 ? digits.slice(-4) : '';
}

/** Display form: "XXXX XXXX 9012". Never show more than this. */
export function mask(value: string | null | undefined): string {
  const last = lastFour(value);
  return last === '' ? '' : `XXXX XXXX ${last}`;
}

/**
 * 'AADHAAR_' + the first 16 hex characters of HMAC-SHA256(digits, secret).
 *
 * Note this deliberately excludes the last four digits, despite what the
 * PHP class's own header example suggests — the code below it is the
 * authority, and it hashes only.
 */
export function secureReference(
  value: string | null | undefined,
  secret: string,
): string {
  const digits = normalise(value);

  if (!TWELVE_DIGITS.test(digits)) {
    throw new Error('Invalid Aadhaar number.');
  }
  if (secret === '') {
    // Failing loudly beats silently deriving references from an empty key,
    // which would be trivially reproducible by anyone.
    throw new Error('AADHAAR_REFERENCE_SECRET is not configured.');
  }

  const digest = crypto
    .createHmac('sha256', secret)
    .update(digits, 'utf8')
    .digest('hex');

  return `AADHAAR_${digest.slice(0, 16)}`;
}

/**
 * Replace any 12-digit run that looks like an Aadhaar number with its masked
 * form. Used to keep the number out of log lines and error text.
 *
 * PHP's \b behaves the same as JavaScript's here because every character
 * involved is ASCII.
 */
export function redact(text: string | null | undefined): string {
  return String(text ?? '').replace(
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    (match) => mask(match),
  );
}
