import { ResourceError } from '../masters/masters.service.js';
import { friendlyImportError, parseImportDate, sanitizeRow } from './import.transforms.js';
import { companyCodesOf, scopeFor, type Actor } from './employees.service.js';

/**
 * The employee bulk import — POST /employee/import.
 *
 * Ported from UserController::import. The parts that look incidental but are
 * not:
 *
 *  - Duplicate detection is per (emp_code, company_code) PAIR. The same code
 *    in a different company is a different person and must import.
 *  - Codes and emails accepted during the run are tracked in memory, so a file
 *    that repeats a row catches itself rather than relying on the database.
 *  - Passwords are hashed through a cache keyed on the plaintext. With one
 *    default password across 300 rows that is one bcrypt call instead of 300,
 *    which is the difference between seconds and minutes.
 */

export const DEFAULT_IMPORT_PASSWORD = '12345678';
export const DEFAULT_IMPORT_COMPANY = 'nidhi-impex';

/** The employee role every imported row is given. */
const IMPORTED_ROLE = 3;

const DATE_FIELDS = ['dob', 'joining_date', 'resignation_date'] as const;

export interface RowReport {
  row_number: number;
  status: 'passed' | 'failed';
  reason: string | null;
  row_data: Record<string, unknown>;
}

export interface ImportResult {
  imported: number;
  skipped: string[];
  rowReports: RowReport[];
  batchId: number | null;
}

export interface ImportRepository {
  /** emp_code -> the companies that already hold it. */
  existingEmpCodes(codes: string[]): Promise<Map<string, string[]>>;
  /** Lower-cased emails already in use. */
  existingEmails(emails: string[]): Promise<Set<string>>;
  createEmployee(data: Record<string, unknown>): Promise<void>;
  recordBatch(input: {
    batchId: number | null;
    type: string;
    companyCode: string | null;
    unit: string | null;
    fileName: string;
    imported: number;
    failed: number;
    rows: RowReport[];
    uploadedBy: number | null;
  }): Promise<number | null>;
  /** Bank details, scoped to the companies the caller manages. */
  updateBankDetails(
    empCode: string,
    data: { bank_name: unknown; bank_account_no: unknown; bank_ifsc_code: unknown },
    companyCodes: string[] | null,
  ): Promise<number>;
}

export interface PasswordHasher {
  make(plain: string): Promise<string>;
}

export interface ImportInput {
  rows: Record<string, unknown>[];
  fileName: string;
  companyCode: string | null;
  unit: string | null;
  batchId: number | null;
}

export class EmployeeImportService {
  constructor(
    private readonly repo: ImportRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async import(actor: Actor, input: ImportInput): Promise<ImportResult> {
    const rows = input.rows.map((row) => sanitizeRow(row));

    // 'all' is the UI's "no filter", not a company.
    const requestCompany = input.companyCode === 'all' ? null : input.companyCode;

    const codes = rows
      .map((r) => String(r.emp_code ?? '').trim())
      .filter(Boolean);
    const emails = rows
      .map((r) => String(r.email ?? '').trim())
      .filter(Boolean);

    const existingCodes = await this.repo.existingEmpCodes(codes);
    const existingEmails = await this.repo.existingEmails(emails);

    const hashes = new Map<string, string>();
    const skipped: string[] = [];
    const rowReports: RowReport[] = [];
    let imported = 0;

    for (const [index, row] of rows.entries()) {
      // Row 1 is the header, and spreadsheets are 1-based.
      const rowNumber = index + 2;

      const data: Record<string, unknown> = { ...row };
      data.role = IMPORTED_ROLE;
      data.company_code = data.company_code ?? requestCompany ?? DEFAULT_IMPORT_COMPANY;
      if (input.unit && !data.unit) data.unit = input.unit;

      for (const field of DATE_FIELDS) {
        if (field in data) data[field] = parseImportDate(data[field]);
      }

      const fail = (reason: string): void => {
        skipped.push(`Row ${rowNumber}: ${reason}`);
        rowReports.push({ row_number: rowNumber, status: 'failed', reason, row_data: data });
      };

      const empCode = String(data.emp_code ?? '').trim();
      if (empCode === '') {
        fail('Missing employee code');
        continue;
      }
      data.emp_code = empCode;

      const company = String(data.company_code);

      // Per company, not per code: the same code in another company is a
      // different person.
      if (existingCodes.get(empCode)?.includes(company)) {
        fail(`Employee code '${empCode}' already exists in the system`);
        continue;
      }

      const email = String(data.email ?? '').trim();
      if (email !== '' && existingEmails.has(email.toLowerCase())) {
        fail(`Email '${email}' is already used by another employee`);
        continue;
      }

      const raw = String(data.password ?? '') || DEFAULT_IMPORT_PASSWORD;
      if (!hashes.has(raw)) hashes.set(raw, await this.hasher.make(raw));
      data.password = hashes.get(raw);
      data.status = '0';

      try {
        await this.repo.createEmployee(data);
        imported++;
        rowReports.push({ row_number: rowNumber, status: 'passed', reason: null, row_data: data });

        // Track what this run has accepted so a file that repeats a row
        // catches itself.
        existingCodes.set(empCode, [...(existingCodes.get(empCode) ?? []), company]);
        if (email !== '') existingEmails.add(email.toLowerCase());
      } catch (error) {
        // Never the raw driver message: it carries the statement and its bound
        // parameters, which for this table means PII in a downloadable report.
        fail(friendlyImportError(error));
      }
    }

    let batchId = input.batchId;
    try {
      batchId = await this.repo.recordBatch({
        batchId: input.batchId,
        type: 'employee',
        companyCode: requestCompany,
        unit: input.unit,
        fileName: input.fileName,
        imported,
        failed: skipped.length,
        rows: rowReports,
        uploadedBy: Number(actor.id),
      });
    } catch {
      // A batch that cannot be recorded must not fail an import that already
      // wrote its rows; PHP logs and carries on, and so does this.
      batchId = input.batchId;
    }

    return { imported, skipped, rowReports, batchId };
  }

  /**
   * POST /employee/import-account-detail.
   *
   * DELIBERATE DIVERGENCE — scoped to the caller's companies.
   *
   * PHP matches on the employee code alone,
   * `User::where('emp_code', $code)->update([...])`, with no company filter and
   * no ->first(). emp_code is not unique, so an admin of one company rewrites
   * the bank details of every employee sharing that code in every other
   * company. Proven in ImportAccountDetailScopeTest.
   */
  async importAccountDetails(
    actor: Actor,
    rows: Record<string, unknown>[],
  ): Promise<{ imported: number; skipped: number }> {
    const scope = scopeFor(actor);
    const companies = scope.companyCodes;

    if (companies !== null && companies.length === 0) {
      throw new ResourceError('No company is assigned to your account', 403);
    }

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const empCode = String(row.emp_code ?? '').trim();
      if (empCode === '') {
        skipped++;
        continue;
      }

      const updated = await this.repo.updateBankDetails(
        empCode,
        {
          bank_name: row.bank_name ?? null,
          bank_account_no: row.bank_account_no ?? null,
          bank_ifsc_code: row.bank_ifsc_code ?? null,
        },
        companies,
      );

      // PHP counts every row carrying a code, whether or not it matched
      // anyone. Counting actual updates is the more useful number and is what
      // the message now reports.
      if (updated > 0) imported++;
      else skipped++;
    }

    return { imported, skipped };
  }
}

/** The column contract the upload UI reads for its auto-suggest. */
export const IMPORT_COLUMNS = [
  { key: 'emp_code', label: 'Employee Code', required: true, aliases: ['code', 'employee code', 'emp code'] },
  { key: 'name', label: 'Full Name', required: false, aliases: ['employee name', 'full name'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email address'] },
  { key: 'mobile_number', label: 'Mobile Number', required: false, aliases: ['mobile', 'phone'] },
  { key: 'dob', label: 'Date of Birth', required: false, aliases: ['date of birth', 'birth date'] },
  { key: 'department', label: 'Department', required: false, aliases: [] },
  { key: 'designation', label: 'Designation', required: false, aliases: [] },
  { key: 'salary', label: 'Salary', required: false, aliases: [] },
  { key: 'joining_date', label: 'Joining Date', required: false, aliases: ['date of joining'] },
  { key: 'gender', label: 'Gender', required: false, aliases: [] },
  { key: 'bank_name', label: 'Bank Name', required: false, aliases: [] },
  { key: 'bank_account_no', label: 'Bank Account No', required: false, aliases: ['account number', 'a/c number'] },
  { key: 'bank_ifsc_code', label: 'Bank IFSC Code', required: false, aliases: ['ifsc'] },
  { key: 'aadhar_card_no', label: 'Aadhar Card No', required: false, aliases: ['aadhar', 'aadhar number'] },
  { key: 'pan_card_no', label: 'PAN Card No', required: false, aliases: ['pan'] },
  { key: 'pf_no', label: 'PF Number', required: false, aliases: ['pf no.'] },
  { key: 'esi_no', label: 'ESI Number', required: false, aliases: ['esi no.'] },
  { key: 'unit', label: 'Branch/Unit', required: false, aliases: ['branch'] },
  { key: 'company_code', label: 'Company', required: false, aliases: ['company', 'company name', 'company code'] },
] as const;

export { companyCodesOf };
