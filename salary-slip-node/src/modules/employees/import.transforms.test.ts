import { describe, it, expect } from 'vitest';

import {
  sanitizeRow,
  parseImportDate,
  resolveCompanyFromUnit,
  friendlyImportError,
} from './import.transforms.js';

/**
 * The import's row transformations.
 *
 * These encode the quirks of the spreadsheets people actually upload, so they
 * are asserted case by case rather than trusted to a tidier reimplementation.
 * The `.0` cases are the ones that matter most: Excel stores a numeric-looking
 * employee code as a float, so "1138" arrives as 1138.0 and would otherwise be
 * written as "1138.0" and match no employee.
 */

describe('the Excel float suffix', () => {
  it.each([
    ['emp_code', '1138.0', '1138'],
    ['mobile_number', '9876543210.0', '9876543210'],
    ['aadhar_card_no', '715115981345.0', '715115981345'],
    ['bank_account_no', '00112233445566.0', '00112233445566'],
  ])('%s: %j becomes %j', (field, input, expected) => {
    expect(sanitizeRow({ [field]: input })[field]).toBe(expected);
  });

  it('leaves a code that genuinely ends in .0 alone once stripped', () => {
    // "S001" has no suffix to strip and must survive untouched — this is the
    // alphanumeric case that used to be rejected outright.
    expect(sanitizeRow({ emp_code: 'S001' }).emp_code).toBe('S001');
    expect(sanitizeRow({ emp_code: '  EMP-77  ' }).emp_code).toBe('EMP-77');
  });
});

describe('sanitizeRow', () => {
  it('strips non-digits from a mobile number', () => {
    expect(sanitizeRow({ mobile_number: '+91 98765-43210' }).mobile_number).toBe('919876543210');
  });

  it('normalises Aadhaar to digits', () => {
    expect(sanitizeRow({ aadhar_card_no: '7151 1598 1345' }).aadhar_card_no).toBe('715115981345');
  });

  it.each(['0', '0.0', '', 'not-an-email'])('nulls the unusable email %j', (value) => {
    // '0' and '0.0' are what an empty numeric-formatted cell becomes.
    expect(sanitizeRow({ email: value }).email).toBeNull();
  });

  it('lowercases a real email', () => {
    expect(sanitizeRow({ email: '  Ravi@Example.COM ' }).email).toBe('ravi@example.com');
  });

  it('upper-cases and de-spaces PAN and IFSC', () => {
    expect(sanitizeRow({ pan_card_no: ' abcde 1234e ' }).pan_card_no).toBe('ABCDE1234E');
    expect(sanitizeRow({ bank_ifsc_code: 'sbin 000 1234' }).bank_ifsc_code).toBe('SBIN0001234');
  });

  it.each([
    ['m', 'Male'],
    ['MALE', 'Male'],
    ['f', 'Female'],
    ['Female', 'Female'],
    ['other', 'Other'],
  ])('normalises gender %j to %j', (input, expected) => {
    expect(sanitizeRow({ gender: input }).gender).toBe(expected);
  });

  it('nulls a blank gender', () => {
    expect(sanitizeRow({ gender: '  ' }).gender).toBeNull();
  });

  it.each([
    ['silver', 'silver-star'],
    ['SilverStar', 'silver-star'],
    ['Silver Star', 'silver-star'],
    ['nidhi', 'nidhi-impex'],
    ['Nidhi Impex Pvt Ltd', 'nidhi-impex'],
  ])('resolves company %j to %j', (input, expected) => {
    expect(sanitizeRow({ company_code: input }).company_code).toBe(expected);
  });

  it('nulls an unrecognised company rather than writing it through', () => {
    // A typo must not silently create a new company.
    expect(sanitizeRow({ company_code: 'Acme Ltd' }).company_code).toBeNull();
  });

  it.each([
    ['daduk', 'Daduk'],
    ['DHADUK', 'Daduk'],
    ['shreeji building', 'Shreeji'],
    ['ichhapore', 'Ichapur'],
  ])('canonicalises unit %j to %j', (input, expected) => {
    expect(sanitizeRow({ unit: input }).unit).toBe(expected);
  });

  it('keeps an unknown unit as typed', () => {
    expect(sanitizeRow({ unit: 'Somewhere' }).unit).toBe('Somewhere');
  });

  it('infers the company from a unit that belongs to only one', () => {
    expect(sanitizeRow({ unit: 'Daduk' }).company_code).toBe('silver-star');
    expect(sanitizeRow({ unit: 'Shreeji' }).company_code).toBe('nidhi-impex');
  });

  it('prefers an explicit company over the inferred one', () => {
    expect(sanitizeRow({ company_code: 'nidhi', unit: 'Daduk' }).company_code).toBe('nidhi-impex');
  });

  it('leaves company null when neither resolves', () => {
    // Ichapur exists in both companies, so it infers nothing.
    expect(sanitizeRow({ unit: 'Ichapur' }).company_code).toBeNull();
    expect(sanitizeRow({}).company_code).toBeNull();
  });

  it('leaves a null cell alone rather than coercing it to a string', () => {
    // PHP guards each field with isset(), which is false for null.
    const row = sanitizeRow({ emp_code: null, mobile_number: null });
    expect(row.emp_code).toBeNull();
    expect(row.mobile_number).toBeNull();
  });

  it('does not invent fields the sheet did not supply', () => {
    const row = sanitizeRow({ emp_code: '1138' });
    expect(row).not.toHaveProperty('email');
    expect(row).not.toHaveProperty('gender');
  });
});

describe('parseImportDate', () => {
  it('reads an Excel serial number', () => {
    // 44197 is 2021-01-01. The offset accounts for Excel's mythical
    // 1900-02-29, which is why it is 25569 and not 25567.
    expect(parseImportDate(44197)).toBe('2021-01-01');
  });

  it('ignores numbers outside the serial range', () => {
    // A bare 5000 is far more likely to be a salary than a date.
    expect(parseImportDate(5000)).not.toBe('1913-09-08');
  });

  it.each([
    ['09-03-1985', '1985-03-09'],
    ['09/03/1985', '1985-03-09'],
    ['9-3-1985', '1985-03-09'],
    ['1985-03-09', '1985-03-09'],
    ['1985/03/09', '1985-03-09'],
  ])('parses %j as %j', (input, expected) => {
    // Day-first, matching the d-m-Y formats PHP lists.
    expect(parseImportDate(input)).toBe(expected);
  });

  it.each([null, undefined, '', '   ', 0])('returns null for %j', (value) => {
    expect(parseImportDate(value)).toBeNull();
  });

  it.each(['00-01-1900', '01-01-1900', '00-00-0000'])('treats %j as no date', (value) => {
    // Spreadsheets emit these for an empty date cell.
    expect(parseImportDate(value)).toBeNull();
  });

  it('returns null for text that is not a date', () => {
    expect(parseImportDate('not a date')).toBeNull();
  });

  it('accepts a real Date object', () => {
    expect(parseImportDate(new Date(Date.UTC(1985, 2, 9)))).toBe('1985-03-09');
  });
});

describe('resolveCompanyFromUnit', () => {
  it.each([
    ['Daduk', 'silver-star'],
    ['dhaduk', 'silver-star'],
    ['Shreeji', 'nidhi-impex'],
    ['shreeji building', 'nidhi-impex'],
  ])('%j belongs to %j', (unit, company) => {
    expect(resolveCompanyFromUnit(unit)).toBe(company);
  });

  it('resolves nothing for a shared or unknown unit', () => {
    expect(resolveCompanyFromUnit('Ichapur')).toBeNull();
    expect(resolveCompanyFromUnit(null)).toBeNull();
  });
});

describe('friendlyImportError', () => {
  it.each([
    ['SQLSTATE[23000]: Integrity constraint violation: 1062 users.email', 'Email address is already used by another employee'],
    ['duplicate key value violates unique constraint "users_email_unique"', 'Email address is already used by another employee'],
    ['UNIQUE constraint failed: users.emp_code', 'Employee code already exists'],
    ['some other integrity constraint violation', 'This row conflicts with an existing record'],
    ['connection reset', 'Could not save this row due to a database error'],
  ])('maps %j', (raw, expected) => {
    expect(friendlyImportError(new Error(raw))).toBe(expected);
  });

  it('never leaks the raw driver message', () => {
    // The statement and its bound parameters would put employee PII into a
    // downloadable upload report.
    const raw = 'insert into users (name, aadhar_card_no) values (Ravi, 715115981345) failed';
    expect(friendlyImportError(new Error(raw))).not.toContain('715115981345');
    expect(friendlyImportError(new Error(raw))).not.toContain('insert into');
  });
});
