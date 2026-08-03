/**
 * Row transformation for the employee import.
 *
 * Ported statement-for-statement from UserController's sanitizeRowData(),
 * parseImportDate() and resolveCompanyFromUnit(). This is the highest
 * fidelity risk in the migration: these rules encode years of accumulated
 * quirks in the spreadsheets people actually upload, and a "cleaner"
 * reimplementation silently changes which rows import.
 *
 * The `.0` suffix stripping matters most. Excel stores an employee code typed
 * as a number as a float, so "1138" arrives as 1138.0 and stringifies to
 * "1138.0" — which matches no employee. The same applies to phone numbers,
 * Aadhaar and bank accounts.
 */

/** Excel serial-date range PHP treats as a date rather than a number. */
const EXCEL_SERIAL_MIN = 10000;
const EXCEL_SERIAL_MAX = 60000;

const stripFloatSuffix = (value: string): string =>
  value.endsWith('.0') ? value.slice(0, -2) : value;

const digitsOnly = (value: string): string => value.replace(/\D/g, '');

/**
 * Excel serial number to an ISO date.
 *
 * Day 1 is 1900-01-01, and the serial numbering includes the mythical
 * 1900-02-29 — hence the 25569-day offset to the Unix epoch rather than 25567.
 */
function excelSerialToIso(serial: number): string | null {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

/** Try the explicit formats PHP lists, in order. */
function parseKnownFormat(text: string): string | null {
  // d-m-Y, d/m/Y, j-n-Y, j/n/Y — day first, one or two digits.
  const dayFirst = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text);
  if (dayFirst) {
    const [, d, m, y] = dayFirst;
    return buildIso(Number(y), Number(m), Number(d));
  }

  // Y-m-d, Y/m/d
  const yearFirst = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text);
  if (yearFirst) {
    const [, y, m, d] = yearFirst;
    return buildIso(Number(y), Number(m), Number(d));
  }

  /*
   * Compact YYYYMMDD, which Carbon::parse accepts and `new Date()` does not.
   *
   * The month and day are bounds-checked rather than left to Date's overflow
   * rolling, so '09031985' — month 19, day 85 — falls through and ends up
   * null, exactly as PHP returns for it.
   */
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (compact) {
    const [, y, m, d] = compact;
    const month = Number(m);
    const day = Number(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return buildIso(Number(y), month, day);
    }
  }

  return null;
}

/**
 * Carbon::createFromFormat rolls overflow forward — 31-02-2020 becomes 2 March
 * — rather than rejecting it, so this does the same.
 */
function buildIso(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

/**
 * parseImportDate().
 *
 * Returns null for anything unusable, including the 1900 sentinels that
 * spreadsheets produce for an empty date cell.
 */
export function parseImportDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '' || value === 0) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  // A bare number in the serial range is an Excel date, not a number.
  const numeric = typeof value === 'number' ? value : Number(value);
  if (
    !Number.isNaN(numeric) &&
    String(value).trim() !== '' &&
    numeric > EXCEL_SERIAL_MIN &&
    numeric < EXCEL_SERIAL_MAX
  ) {
    const iso = excelSerialToIso(numeric);
    if (iso) return iso;
  }

  const text = String(value).trim();
  if (text === '') return null;

  // Sentinels for "no date": Excel's zero date and its variants.
  if (text.includes('1900') || text.includes('00-00') || text === '00-01-1900') return null;

  /*
   * DELIBERATE DIVERGENCE — a bare four-digit number is not a date.
   *
   * PHP falls through to Carbon::parse here, which fabricates the missing
   * parts from *the current date*:
   *
   *   '1985' -> 1985-08-03    year, plus today's month and day
   *   '5000' -> 5000-08-03
   *   '2020' -> 2026-08-03    read as the time 20:20, so today entirely
   *
   * A year-only date of birth therefore imports as a different value every
   * day it is run, and "2020" lands as today. Storing nothing is both safer
   * and reproducible. Longer digit strings are left alone: '19850309' is a
   * genuine compact date and '44197' an Excel serial, both handled above.
   */
  if (/^\d{4}$/.test(text)) return null;

  const known = parseKnownFormat(text);
  if (known) return known;

  // Carbon::parse's last resort.
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/** resolveCompanyFromUnit() — a unit that belongs to exactly one company. */
export function resolveCompanyFromUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;

  const lower = unit.trim().toLowerCase();
  if (['daduk', 'dhaduk'].includes(lower)) return 'silver-star';
  if (['shreeji', 'shreeji building'].includes(lower)) return 'nidhi-impex';

  return null;
}

const COMPANY_ALIASES: Record<string, string> = {
  silver: 'silver-star',
  silverstar: 'silver-star',
  'silver-star': 'silver-star',
  'silver-star-jewels': 'silver-star',
  nidhi: 'nidhi-impex',
  nidhiimpex: 'nidhi-impex',
  'nidhi-impex': 'nidhi-impex',
  'nidhi-impex-pvt-ltd': 'nidhi-impex',
};

const UNIT_ALIASES: Record<string, string> = {
  daduk: 'Daduk',
  dhaduk: 'Daduk',
  shreeji: 'Shreeji',
  'shreeji building': 'Shreeji',
  ichapur: 'Ichapur',
  ichhapore: 'Ichapur',
  ichhapor: 'Ichapur',
};

export type ImportRow = Record<string, unknown>;

const has = (row: ImportRow, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined;

/**
 * sanitizeRowData().
 *
 * PHP guards each field with isset(), which is false for null — so a null cell
 * is left untouched rather than coerced to "". `has` reproduces that exactly;
 * using a plain `in` check would turn empty cells into empty strings and
 * change what gets written.
 */
export function sanitizeRow(input: ImportRow): ImportRow {
  const row: ImportRow = { ...input };

  if (has(row, 'emp_code')) {
    row.emp_code = stripFloatSuffix(String(row.emp_code).trim());
  }

  if (has(row, 'mobile_number')) {
    row.mobile_number = digitsOnly(stripFloatSuffix(String(row.mobile_number).trim()));
  }

  if (has(row, 'email')) {
    const email = String(row.email).trim().toLowerCase();
    // '0' and '0.0' are what an empty numeric-formatted cell becomes.
    row.email = email === '0' || email === '0.0' || email === '' || !isEmail(email) ? null : email;
  }

  if (has(row, 'aadhar_card_no')) {
    row.aadhar_card_no = digitsOnly(stripFloatSuffix(String(row.aadhar_card_no).trim()));
  }

  if (has(row, 'pan_card_no')) {
    row.pan_card_no = String(row.pan_card_no).replace(/\s+/g, '').toUpperCase();
  }

  if (has(row, 'bank_account_no')) {
    row.bank_account_no = stripFloatSuffix(String(row.bank_account_no).trim()).replace(/\s+/g, '');
  }

  if (has(row, 'bank_ifsc_code')) {
    row.bank_ifsc_code = String(row.bank_ifsc_code).replace(/\s+/g, '').toUpperCase();
  }

  if (has(row, 'gender')) {
    const gender = String(row.gender).trim().toLowerCase();
    if (gender === 'm' || gender === 'male') row.gender = 'Male';
    else if (gender === 'f' || gender === 'female') row.gender = 'Female';
    else if (gender !== '') row.gender = gender.charAt(0).toUpperCase() + gender.slice(1);
    else row.gender = null;
  }

  let company: string | null = null;
  if (has(row, 'company_code')) {
    const key = String(row.company_code).trim().toLowerCase().replace(/ /g, '-');
    // An unrecognised company becomes null rather than being written through,
    // so a typo cannot create a new company silently.
    company = COMPANY_ALIASES[key] ?? null;
  }

  let unit: string | null = null;
  if (has(row, 'unit')) {
    unit = String(row.unit).trim();
    unit = UNIT_ALIASES[unit.toLowerCase()] ?? unit;
    row.unit = unit;
  }

  if (!company && unit) company = resolveCompanyFromUnit(unit);

  // Always set, even to null — PHP assigns unconditionally at the end.
  row.company_code = company;

  return row;
}

/** PHP's FILTER_VALIDATE_EMAIL, close enough for the cases a sheet produces. */
function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * friendlyImportError().
 *
 * A raw driver message carries the full statement and its bound parameters —
 * which for this table means employee PII in an upload report an admin can
 * download. Only these mapped messages are ever surfaced.
 */
export function friendlyImportError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('users.email') || (lower.includes('email') && lower.includes('unique'))) {
    return 'Email address is already used by another employee';
  }
  if (lower.includes('emp_code')) {
    return 'Employee code already exists';
  }
  if (
    lower.includes('integrity constraint violation') ||
    lower.includes('unique constraint failed') ||
    // Postgres' wording, which the PHP list predates.
    lower.includes('unique constraint')
  ) {
    return 'This row conflicts with an existing record';
  }

  return 'Could not save this row due to a database error';
}
