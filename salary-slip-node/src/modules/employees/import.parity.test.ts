import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { sanitizeRow, parseImportDate } from './import.transforms.js';

/**
 * Parity with the real PHP helpers.
 *
 * The vectors in tests/fixtures/import-vectors.json were captured by calling
 * UserController::sanitizeRowData() and ::parseImportDate() directly through
 * reflection — so this compares the port against what production actually
 * does, not against a second reading of the source. The import decides which
 * rows enter the employee table, so "close enough" is not a useful standard.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(
  readFileSync(path.join(here, '../../../tests/fixtures/import-vectors.json'), 'utf8'),
) as {
  sanitize: { in: Record<string, unknown>; out: Record<string, unknown> }[];
  dates: { in: unknown; out: string | null }[];
};

/** PHP emits an empty associative array as [] in JSON; normalise for compare. */
const asObject = (value: unknown): Record<string, unknown> =>
  Array.isArray(value) ? {} : (value as Record<string, unknown>);

describe('sanitizeRow matches PHP', () => {
  it('has vectors to compare', () => {
    expect(vectors.sanitize.length).toBeGreaterThanOrEqual(30);
  });

  it.each(vectors.sanitize.map((v, i) => [i, v] as const))(
    'vector %i: %o',
    (_i, vector) => {
      expect(sanitizeRow(asObject(vector.in))).toEqual(asObject(vector.out));
    },
  );
});

/**
 * The one input where the port deliberately differs.
 *
 * For a bare four-digit number PHP reaches Carbon::parse, which fills the
 * missing parts from the current date — '1985' becomes 1985 plus today's month
 * and day, and '2020' becomes today outright because it is read as the time
 * 20:20. The captured vector is therefore only correct on the day it was
 * captured, which is itself the argument that this cannot be a contract.
 */
const DATE_DIVERGENCES = new Set(['5000']);

describe('parseImportDate matches PHP', () => {
  const comparable = vectors.dates.filter((v) => !DATE_DIVERGENCES.has(String(v.in)));

  it.each(comparable.map((v) => [v.in, v.out] as const))(
    'parses %j to %j',
    (input, expected) => {
      expect(parseImportDate(input)).toBe(expected);
    },
  );

  it('still covers the cases that must keep working', () => {
    // A compact date and an Excel serial are both legitimate and unaffected.
    expect(parseImportDate('19850309')).toBe('1985-03-09');
    expect(parseImportDate('44197')).toBe('2021-01-01');
  });

  it.each(['1985', '2020', '5000', '0090'])('returns null for the bare year %j', (year) => {
    // PHP would fabricate a date here, differently on every run date.
    expect(parseImportDate(year)).toBeNull();
  });
});
