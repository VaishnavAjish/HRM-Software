import type { Obligations } from './authorization.types.js';

/**
 * Field-level security.
 *
 * Applied on the server, to the payload, before it is serialised — never in
 * the client. Sending a full Aadhaar number and hiding it with CSS is not
 * field security, it is field *decoration*: the value is in the response body,
 * in the browser's memory, in any proxy cache, and in the network tab.
 *
 * Two directions, and both matter:
 *
 *   read   `apply()` removes hidden fields and masks protected ones
 *   write  `assertWritable()` rejects an update that touches a field the
 *          caller may see but not change
 *
 * Only enforcing the read direction is the classic hole — a user who cannot
 * see `salary` can still POST it, because the check only ever ran on the way
 * out.
 */

export class FieldAccessError extends Error {
  readonly statusCode = 403;
  readonly code = 'FIELD_ACCESS_DENIED';

  constructor(readonly fields: string[]) {
    super(
      fields.length === 1
        ? `You are not permitted to change "${fields[0]}".`
        : `You are not permitted to change: ${fields.join(', ')}.`,
    );
    this.name = 'FieldAccessError';
  }
}

/**
 * Mask a value while leaving it recognisable.
 *
 * Keeps the last four characters of anything long enough to have them, which
 * is the convention the rest of this system already uses for Aadhaar
 * ("XXXX XXXX 9012") and what makes a masked bank account still checkable
 * against a paying-in slip. Short values are replaced outright: revealing
 * three of four characters is not masking.
 */
export function maskValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  const text = String(value);
  if (text.length === 0) return text;
  if (text.length <= 4) return '•'.repeat(text.length);

  return `${'•'.repeat(Math.min(text.length - 4, 12))}${text.slice(-4)}`;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);

/**
 * Apply read obligations to one record or an array of them.
 *
 * `allowedFields`, when present, is an allow-list and wins over everything
 * else — a field not on it is removed even if nothing named it explicitly.
 * That ordering matters: an allow-list that could be widened by forgetting to
 * add a field to `hiddenFields` would not be an allow-list.
 */
export function applyFieldSecurity<T>(payload: T, obligations: Obligations | null | undefined): T {
  if (!obligations) return payload;

  const { allowedFields, hiddenFields, maskedFields } = obligations;
  if (!allowedFields?.length && !hiddenFields?.length && !maskedFields?.length) return payload;

  const hidden = new Set(hiddenFields ?? []);
  const masked = new Set(maskedFields ?? []);
  const allowed = allowedFields?.length ? new Set(allowedFields) : null;

  const transform = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(transform);
    if (!isPlainObject(value)) return value;

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (allowed && !allowed.has(key)) continue;
      if (hidden.has(key)) continue;

      // Masking applies to the leaf, not to a nested object: masking an
      // object would stringify it to "[object Object]" and lose the shape the
      // client parses.
      out[key] = masked.has(key) && !isPlainObject(item) && !Array.isArray(item) ? maskValue(item) : transform(item);
    }
    return out;
  };

  return transform(payload) as T;
}

/**
 * Reject a write that touches a field the caller may not change.
 *
 * Read-only and hidden both block a write. Hidden is the important one: a
 * field the caller cannot even see is a field they cannot have legitimately
 * intended to set, so accepting it would be mass assignment through an
 * omission rather than a grant.
 */
export function assertWritable(
  changedFields: string[],
  obligations: Obligations | null | undefined,
): void {
  if (!obligations || changedFields.length === 0) return;

  const blocked = new Set([...(obligations.readOnlyFields ?? []), ...(obligations.hiddenFields ?? [])]);
  const allowed = obligations.allowedFields?.length ? new Set(obligations.allowedFields) : null;

  const violations = changedFields.filter((field) => blocked.has(field) || (allowed !== null && !allowed.has(field)));

  if (violations.length > 0) throw new FieldAccessError(violations);
}

/**
 * The fields a payload is actually trying to change.
 *
 * Compared against the current record rather than taken from the request
 * body: a client that echoes back every field it was given would otherwise
 * appear to be changing all of them, and a legitimate update would be
 * rejected for touching a read-only field it merely round-tripped.
 */
export function changedFields(
  body: Record<string, unknown>,
  current: Record<string, unknown> | null | undefined,
): string[] {
  if (!current) return Object.keys(body);

  return Object.keys(body).filter((key) => {
    const next = body[key];
    const previous = current[key];

    if (next === previous) return false;
    // Dates and numbers arrive as strings over JSON; compare stringified so a
    // no-op round trip is not reported as a change.
    if (next !== null && previous !== null && next !== undefined && previous !== undefined) {
      return String(next) !== String(previous);
    }
    return true;
  });
}
