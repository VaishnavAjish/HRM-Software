import { describe, it, expect, beforeEach } from 'vitest';

import {
  EmployeeImportService,
  IMPORT_COLUMNS,
  DEFAULT_IMPORT_COMPANY,
  type ImportRepository,
  type RowReport,
} from './import.service.js';
import { toKeyedRows, type Sheet } from '../../lib/excel/sheet-reader.js';
import type { Actor } from './employees.service.js';

/**
 * The import loop.
 *
 * The row transformations are verified against real PHP output in
 * import.parity.test.ts; this covers the orchestration around them — dedup,
 * in-file duplicates, the password cache, batch reporting, and the company
 * scoping added to the bank-details import.
 */

class FakeImportRepo implements ImportRepository {
  created: Record<string, unknown>[] = [];
  batches: unknown[] = [];
  bankUpdates: { empCode: string; companies: string[] | null }[] = [];
  failOn = new Set<string>();
  bankMatches = 1;

  constructor(
    public codes = new Map<string, string[]>(),
    public emails = new Set<string>(),
  ) {}

  async existingEmpCodes() {
    return new Map(this.codes);
  }
  async existingEmails() {
    return new Set(this.emails);
  }
  async createEmployee(data: Record<string, unknown>) {
    const code = String(data.emp_code);
    if (this.failOn.has(code)) {
      throw new Error('duplicate key value violates unique constraint "users_email_unique"');
    }
    this.created.push(data);
  }
  async recordBatch(input: { batchId: number | null; rows: RowReport[] }) {
    this.batches.push(input);
    return input.batchId ?? 77;
  }
  async updateBankDetails(empCode: string, _data: unknown, companies: string[] | null) {
    this.bankUpdates.push({ empCode, companies });
    return this.bankMatches;
  }
}

const hasher = {
  calls: 0,
  async make(plain: string) {
    this.calls++;
    return `hashed:${plain}`;
  },
};

const admin: Actor = { id: 900, role: 1, company_code: 'nidhi-impex' };
const superAdmin: Actor = { id: 901, role: 0, company_code: 'nidhi-impex' };

let repo: FakeImportRepo;
let service: EmployeeImportService;

beforeEach(() => {
  repo = new FakeImportRepo();
  hasher.calls = 0;
  service = new EmployeeImportService(repo, hasher);
});

const run = (rows: Record<string, unknown>[], over: Partial<Parameters<EmployeeImportService['import']>[1]> = {}) =>
  service.import(admin, {
    rows,
    fileName: 'staff.xlsx',
    companyCode: null,
    unit: null,
    batchId: null,
    ...over,
  });

describe('import', () => {
  it('imports a clean row', async () => {
    const result = await run([{ emp_code: '1138', name: 'Ravi' }]);

    expect(result.imported).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(repo.created[0]).toMatchObject({ emp_code: '1138', role: 3, status: '0' });
  });

  it('imports an alphanumeric code', async () => {
    // The S001 case: the importer used to refuse anything non-numeric.
    const result = await run([{ emp_code: 'S001', name: 'ghn hdg' }]);

    expect(result.imported).toBe(1);
    expect(repo.created[0]!.emp_code).toBe('S001');
  });

  it('strips the Excel float suffix before matching', async () => {
    await run([{ emp_code: '1138.0' }]);
    expect(repo.created[0]!.emp_code).toBe('1138');
  });

  it('numbers rows from 2, allowing for the header', async () => {
    const result = await run([{ emp_code: '' }, { emp_code: '' }]);
    expect(result.skipped).toEqual([
      'Row 2: Missing employee code',
      'Row 3: Missing employee code',
    ]);
  });

  it('skips a row with no employee code', async () => {
    const result = await run([{ emp_code: '   ', name: 'Nobody' }]);

    expect(result.imported).toBe(0);
    expect(result.skipped[0]).toContain('Missing employee code');
    expect(repo.created).toEqual([]);
  });

  it('defaults the company when none is given anywhere', async () => {
    await run([{ emp_code: '1138' }]);
    expect(repo.created[0]!.company_code).toBe(DEFAULT_IMPORT_COMPANY);
  });

  it('prefers the row company, then the request company', async () => {
    await run([{ emp_code: '1', company_code: 'silver' }], { companyCode: 'nidhi-impex' });
    expect(repo.created[0]!.company_code).toBe('silver-star');

    repo.created = [];
    await run([{ emp_code: '2' }], { companyCode: 'silver-star' });
    expect(repo.created[0]!.company_code).toBe('silver-star');
  });

  it("treats a company of 'all' as no filter", async () => {
    await run([{ emp_code: '1138' }], { companyCode: 'all' });
    expect(repo.created[0]!.company_code).toBe(DEFAULT_IMPORT_COMPANY);
  });

  it('fills a missing unit from the request', async () => {
    await run([{ emp_code: '1138' }], { unit: 'Ichapur' });
    expect(repo.created[0]!.unit).toBe('Ichapur');
  });

  it('does not overwrite a unit the row supplied', async () => {
    await run([{ emp_code: '1138', unit: 'daduk' }], { unit: 'Ichapur' });
    expect(repo.created[0]!.unit).toBe('Daduk');
  });

  it('parses the date columns', async () => {
    await run([{ emp_code: '1138', dob: '09-03-1985', joining_date: 44197 }]);

    expect(repo.created[0]!.dob).toBe('1985-03-09');
    expect(repo.created[0]!.joining_date).toBe('2021-01-01');
  });
});

describe('duplicate detection', () => {
  it('rejects a code that already exists in the same company', async () => {
    repo.codes.set('1138', ['nidhi-impex']);

    const result = await run([{ emp_code: '1138' }]);

    expect(result.imported).toBe(0);
    expect(result.skipped[0]).toContain("already exists");
  });

  it('accepts the same code in a different company', async () => {
    // The dedup key is the pair, not the code — the same number in another
    // company is a different person.
    repo.codes.set('1138', ['silver-star']);

    const result = await run([{ emp_code: '1138' }], { companyCode: 'nidhi-impex' });

    expect(result.imported).toBe(1);
  });

  it('catches a file that repeats a row against itself', async () => {
    const result = await run([{ emp_code: '1138' }, { emp_code: '1138' }]);

    expect(result.imported).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toContain('Row 3');
  });

  it('rejects an email already in use', async () => {
    repo.emails.add('taken@test.local');

    const result = await run([{ emp_code: '1138', email: 'Taken@Test.local' }]);

    // Compared case-insensitively; sanitizeRow lowercases first.
    expect(result.imported).toBe(0);
    expect(result.skipped[0]).toContain('already used');
  });

  it('catches a repeated email within the file', async () => {
    const result = await run([
      { emp_code: '1', email: 'a@b.co' },
      { emp_code: '2', email: 'a@b.co' },
    ]);

    expect(result.imported).toBe(1);
    expect(result.skipped).toHaveLength(1);
  });

  it('allows many rows with no email at all', async () => {
    const result = await run([
      { emp_code: '1', email: '' },
      { emp_code: '2', email: '' },
    ]);

    expect(result.imported).toBe(2);
  });
});

describe('passwords', () => {
  it('defaults the password', async () => {
    await run([{ emp_code: '1138' }]);
    expect(repo.created[0]!.password).toBe('hashed:12345678');
  });

  it('hashes each distinct password once', async () => {
    await run([
      { emp_code: '1' },
      { emp_code: '2' },
      { emp_code: '3' },
      { emp_code: '4', password: 'other' },
    ]);

    // Four rows, two distinct passwords: bcrypt is slow enough that this is
    // the difference between seconds and minutes on a real file.
    expect(hasher.calls).toBe(2);
  });

  it('never stores the plaintext', async () => {
    await run([{ emp_code: '1138', password: 'secret123' }]);
    expect(repo.created[0]!.password).toBe('hashed:secret123');
  });
});

describe('failures and reporting', () => {
  it('maps a driver error to a safe message', async () => {
    repo.failOn.add('1138');

    const result = await run([{ emp_code: '1138', aadhar_card_no: '715115981345' }]);

    expect(result.skipped[0]).toContain('Email address is already used');
    // The raw statement would carry PII into a downloadable report.
    expect(result.skipped[0]).not.toContain('715115981345');
    expect(result.skipped[0]).not.toContain('unique constraint');
  });

  it('keeps importing after a failed row', async () => {
    repo.failOn.add('1');

    const result = await run([{ emp_code: '1' }, { emp_code: '2' }]);

    expect(result.imported).toBe(1);
    expect(result.skipped).toHaveLength(1);
  });

  it('reports every row, passed and failed', async () => {
    repo.failOn.add('2');
    const result = await run([{ emp_code: '1' }, { emp_code: '2' }, { emp_code: '' }]);

    expect(result.rowReports).toHaveLength(3);
    expect(result.rowReports.map((r) => r.status)).toEqual(['passed', 'failed', 'failed']);
    expect(result.rowReports.map((r) => r.row_number)).toEqual([2, 3, 4]);
  });

  it('records a batch and returns its id', async () => {
    const result = await run([{ emp_code: '1138' }]);
    expect(result.batchId).toBe(77);
    expect(repo.batches).toHaveLength(1);
  });

  it('still succeeds when the batch cannot be recorded', async () => {
    repo.recordBatch = async () => {
      throw new Error('batch table unavailable');
    };

    // The rows are already written; failing here would report a successful
    // import as an error and invite a retry that duplicates everything.
    const result = await run([{ emp_code: '1138' }]);
    expect(result.imported).toBe(1);
  });
});

describe('bank-details import', () => {
  it('scopes the update to the caller\'s companies', async () => {
    await service.importAccountDetails(admin, [{ emp_code: '1138', bank_name: 'New Bank' }]);

    // PHP updates every company's row sharing that code.
    expect(repo.bankUpdates[0]).toEqual({ empCode: '1138', companies: ['nidhi-impex'] });
  });

  it('leaves a super admin unscoped', async () => {
    await service.importAccountDetails(superAdmin, [{ emp_code: '1138' }]);
    expect(repo.bankUpdates[0]!.companies).toBeNull();
  });

  it('refuses an admin with no company', async () => {
    await expect(
      service.importAccountDetails({ id: 1, role: 1, company_code: '' }, [{ emp_code: '1' }]),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('skips a row with no employee code', async () => {
    const result = await service.importAccountDetails(admin, [{ emp_code: '' }]);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(repo.bankUpdates).toEqual([]);
  });

  it('counts rows that matched nobody as skipped', async () => {
    repo.bankMatches = 0;
    const result = await service.importAccountDetails(admin, [{ emp_code: '9999' }]);

    // PHP counts every row carrying a code as imported, matched or not.
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

describe('toKeyedRows', () => {
  const sheet: Sheet = {
    header: ['Emp Code', 'Name'],
    rows: [
      ['1138', 'Ravi'],
      [null, null],
      ['1139'],
      ['1140', 'Extra', 'ignored'],
    ],
  };

  it('keys rows by header and drops empty ones', () => {
    const rows = toKeyedRows(sheet);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ 'Emp Code': '1138', Name: 'Ravi' });
  });

  it('pads a short row rather than misaligning it', () => {
    expect(toKeyedRows(sheet)[1]).toEqual({ 'Emp Code': '1139', Name: null });
  });

  it('truncates a row wider than the header', () => {
    expect(Object.keys(toKeyedRows(sheet)[2]!)).toEqual(['Emp Code', 'Name']);
  });

  it('applies a column mapping', () => {
    const rows = toKeyedRows(sheet, { emp_code: 'Emp Code', name: 'Name' });
    expect(rows[0]).toEqual({ emp_code: '1138', name: 'Ravi' });
  });

  it('nulls a mapped column the sheet does not have', () => {
    const rows = toKeyedRows(sheet, { emp_code: 'Emp Code', email: 'Missing Column' });
    expect(rows[0]).toEqual({ emp_code: '1138', email: null });
  });
});

describe('import columns', () => {
  it('exposes the contract the upload UI reads', () => {
    expect(IMPORT_COLUMNS).toHaveLength(19);
    expect(IMPORT_COLUMNS[0]).toMatchObject({ key: 'emp_code', required: true });
    // Exactly one required column, matching PHP.
    expect(IMPORT_COLUMNS.filter((c) => c.required)).toHaveLength(1);
  });
});
