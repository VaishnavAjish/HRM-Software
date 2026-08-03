import { isValid, mask } from '../../lib/laravel/aadhaar.js';

/**
 * Reproduces what Eloquent's User::toArray() emits.
 *
 * The React client reads this shape directly, so it is a contract, not an
 * implementation detail. Three Eloquent mechanisms combine to produce it and
 * all three have to be reproduced by hand here:
 *
 *   $hidden    password, remember_token, encrypted_aadhaar_number,
 *              aadhar_card_no  — removed from every array/JSON form
 *   $appends   aadhaar_masked, has_aadhaar — computed, not columns
 *   casts      encrypted_aadhaar_number is decrypted on read
 *
 * Getting $hidden wrong is the failure that matters: returning a Prisma row
 * straight from a handler would put the password hash and the raw Aadhaar on
 * the wire.
 *
 * Note this is a DENYLIST, exactly as Eloquent's $hidden is: every column not
 * named below is emitted. That is required for fidelity — the React client
 * reads a wide spread of columns and an allowlist would silently drop the ones
 * nobody remembered — but it means a newly added sensitive column is exposed
 * by default until it is listed here. Anything secret added to `users` must be
 * added to HIDDEN in the same change.
 */

/** Never leaves the server, whatever else changes. */
const HIDDEN = new Set([
  'password',
  'remember_token',
  'encrypted_aadhaar_number',
  'aadhar_card_no',
]);

/** The subset of columns the auth responses expose, mirroring $hidden. */
export interface SerializedUser {
  [key: string]: unknown;
  aadhaar_masked: string;
  has_aadhaar: boolean;
}

export interface UserRowLike {
  aadhaar_last_four?: string | null;
  aadhar_card_no?: string | null;
  [key: string]: unknown;
}

/**
 * getHasAadhaarAttribute().
 *
 * An edit form needs to tell "no number stored" from "stored but not sent to
 * you", so this cannot be inferred from a non-empty mask — a partial legacy
 * value masks to "" while still being present.
 */
export function hasAadhaar(row: UserRowLike): boolean {
  if (row.aadhaar_last_four) return true;
  return isValid(row.aadhar_card_no ?? null);
}

/** getAadhaarMaskedAttribute() — "XXXX XXXX 9012". */
export function aadhaarMasked(row: UserRowLike): string {
  if (row.aadhaar_last_four) return `XXXX XXXX ${row.aadhaar_last_four}`;
  return mask(row.aadhar_card_no ?? null);
}

/**
 * Serialize a user row for an API response.
 *
 * `full` is the complete Aadhaar, supplied only when the caller is authorised
 * to see it (owning the record, or holding record access). It is passed in
 * rather than derived here so the authorization decision stays in one place
 * and can never be made accidentally by a serializer.
 */
export function serializeUser(
  row: UserRowLike,
  options: { full?: string | null } = {},
): SerializedUser {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (HIDDEN.has(key)) continue;
    // Prisma returns BigInt for some integer columns; JSON.stringify throws on
    // it, which would surface as an opaque 500 rather than a serialization bug.
    out[key] = typeof value === 'bigint' ? Number(value) : value;
  }

  out.aadhaar_masked = aadhaarMasked(row);
  out.has_aadhaar = hasAadhaar(row);

  if (options.full != null && options.full !== '') {
    out.aadhaar_full = options.full;
  }

  return out as SerializedUser;
}

/** Guard for tests and handlers: nothing secret may appear in a response. */
export function assertNoSecrets(payload: Record<string, unknown>): void {
  for (const key of HIDDEN) {
    if (key in payload) {
      throw new Error(`Serialized user leaked a hidden attribute: ${key}`);
    }
  }
}
