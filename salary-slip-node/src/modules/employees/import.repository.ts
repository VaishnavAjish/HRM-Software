import { db } from '../../db/client.js';
import type { ImportRepository, RowReport } from './import.service.js';

/**
 * Prisma storage for the bulk import.
 *
 * The two lookups are deliberately batched: PHP gathers every existing code
 * and email up front rather than querying inside the row loop, which is what
 * keeps a 300-row file to two queries instead of six hundred.
 */
export class PrismaImportRepository implements ImportRepository {
  async existingEmpCodes(codes: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (codes.length === 0) return out;

    const rows = await db.users.findMany({
      where: { emp_code: { in: codes }, is_deleted: '0' },
      select: { emp_code: true, company_code: true },
    });

    for (const row of rows) {
      if (!row.emp_code) continue;
      out.set(row.emp_code, [...(out.get(row.emp_code) ?? []), row.company_code]);
    }
    return out;
  }

  async existingEmails(emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) return new Set();

    const rows = await db.users.findMany({
      where: { email: { in: emails }, is_deleted: '0' },
      select: { email: true },
    });

    return new Set(rows.map((r) => (r.email ?? '').trim().toLowerCase()).filter(Boolean));
  }

  /**
   * Only columns the model declares fillable are written.
   *
   * Eloquent silently drops anything outside $fillable, so a spreadsheet with
   * a stray "role" or "is_deleted" column cannot set it. Prisma would instead
   * reject the whole insert on an unknown key, so the allowlist is applied
   * here — and it is an allowlist rather than a denylist for the same reason
   * $fillable is.
   */
  async createEmployee(data: Record<string, unknown>): Promise<void> {
    await db.users.create({ data: this.fillable(data) as never });
  }

  async recordBatch(input: {
    batchId: number | null;
    type: string;
    companyCode: string | null;
    unit: string | null;
    fileName: string;
    imported: number;
    failed: number;
    rows: RowReport[];
    uploadedBy: number | null;
  }): Promise<number | null> {
    const now = new Date();

    const rowsFor = (batchId: bigint) =>
      input.rows.map((r) => ({
        batch_id: batchId,
        row_number: r.row_number,
        status: r.status,
        // The column is VarChar(255); a long constraint message would
        // otherwise fail the insert and lose the whole batch report.
        reason: r.reason === null ? null : r.reason.slice(0, 255),
        row_data: r.row_data as never,
        created_at: now,
        updated_at: now,
      }));

    if (input.batchId !== null) {
      const existing = await db.upload_batches.findUnique({
        where: { id: BigInt(input.batchId) },
      });

      if (existing) {
        await db.$transaction([
          db.upload_batches.update({
            where: { id: existing.id },
            data: {
              total_rows: existing.total_rows + input.rows.length,
              success_count: existing.success_count + input.imported,
              failed_count: existing.failed_count + input.failed,
              updated_at: now,
            },
          }),
          db.upload_batch_rows.createMany({ data: rowsFor(existing.id) }),
        ]);

        return Number(existing.id);
      }
    }

    const batch = await db.upload_batches.create({
      data: {
        type: input.type,
        company_code: input.companyCode,
        unit: input.unit,
        file_name: input.fileName,
        total_rows: input.rows.length,
        success_count: input.imported,
        failed_count: input.failed,
        uploaded_by: input.uploadedBy === null ? null : BigInt(input.uploadedBy),
        created_at: now,
        updated_at: now,
      },
    });

    await db.upload_batch_rows.createMany({ data: rowsFor(batch.id) });

    return Number(batch.id);
  }

  async updateBankDetails(
    empCode: string,
    data: { bank_name: unknown; bank_account_no: unknown; bank_ifsc_code: unknown },
    companyCodes: string[] | null,
  ): Promise<number> {
    const result = await db.users.updateMany({
      where: {
        emp_code: empCode,
        is_deleted: '0',
        ...(companyCodes === null ? {} : { company_code: { in: companyCodes } }),
      },
      data: {
        bank_name: data.bank_name === null ? null : String(data.bank_name),
        bank_account_no: data.bank_account_no === null ? null : String(data.bank_account_no),
        bank_ifsc_code: data.bank_ifsc_code === null ? null : String(data.bank_ifsc_code),
      },
    });

    return result.count;
  }

  /** User::$fillable, verbatim. */
  private static readonly FILLABLE = new Set([
    'name', 'email', 'password', 'otp', 'status', 'role', 'emp_code', 'company_code', 'unit',
    'mobile_number', 'dob', 'photo', 'address', 'is_deleted',
    'members', 'joining_date', 'department', 'manager_name', 'salary',
    'emp_whatsapp_no', 'punching_no', 'village', 'taluka', 'district',
    'birth_place', 'gender', 'cast', 'marital_status', 'blood_group',
    'reference_name', 'reference_mobile_no', 'aadhar_card_no', 'pan_card_no',
    'bank_name', 'bank_ifsc_code', 'bank_account_no', 'education', 'emp_signature',
    'resignation_date', 'city', 'pin', 'state', 'pf_no', 'esi_no', 'branch',
    'print', 'checkbox', 'processed', 'check_image', 'pan_image', 'adhar_image',
    'account_book', 'type', 'designation', 'form_no', 'trial_date', 'mobile_no_2',
    'last_company_name', 'added_by', 'trial_form_id', 'last_company_address',
    'experience', 'reason_for_leaving', 'hastak_name', 'hastak_code', 'hastak_mobile',
    'hastak_department', 'contractor', 'manager_signature', 'hastak_signature',
    'hr_signature', 'akar', 'shift_id',
  ]);

  /** Integer columns; everything else is text in this schema. */
  private static readonly INTEGER_COLUMNS = new Set(['role', 'shift_id', 'added_by', 'trial_form_id']);

  private fillable(data: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (!PrismaImportRepository.FILLABLE.has(key)) continue;
      if (value === undefined) continue;

      if (PrismaImportRepository.INTEGER_COLUMNS.has(key)) {
        if (value === null || value === '') continue;
        const n = Number.parseInt(String(value), 10);
        if (Number.isNaN(n)) continue;
        out[key] = key === 'role' ? n : BigInt(n);
        continue;
      }

      // Everything else is a string column; a spreadsheet number would
      // otherwise be rejected by Prisma's type check.
      out[key] = value === null ? null : String(value);
    }

    return out;
  }
}
