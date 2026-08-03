import { db } from '../../db/client.js';
import type { AccountRepository } from './account.service.js';
import type { AuthUserRow } from './auth.service.js';
import type { IdentityRepository, IdentityUserRow } from './identity.service.js';
import { LaravelEncrypter } from '../../lib/laravel/crypt.js';
import { normalise } from '../../lib/laravel/aadhaar.js';

/** Prisma-backed storage for change-password, check-emp-code and register. */
export class PrismaAccountRepository implements AccountRepository {
  async updatePassword(id: number, hashedPassword: string): Promise<void> {
    await db.users.update({ where: { id: BigInt(id) }, data: { password: hashedPassword } });
  }

  /**
   * Unscoped, matching AuthController::checkEmpCode.
   *
   * emp_code is not unique across companies, so two employees can share one.
   * PHP takes the first match and so does this; the login screen then prefills
   * whichever company that row belongs to. Preserved rather than corrected —
   * the caller has not chosen a company yet, which is the whole point of the
   * lookup.
   */
  async findByEmpCode(code: string) {
    return db.users.findFirst({
      where: { emp_code: code },
      select: { company_code: true, unit: true },
    });
  }

  async emailExists(email: string): Promise<boolean> {
    return (await db.users.count({ where: { email } })) > 0;
  }

  async createUser(data: {
    name: string;
    email: string;
    hashedPassword: string;
    role: number;
    companyCode: string | null;
    empCode: string;
    type: string | null;
  }): Promise<AuthUserRow> {
    const created = await db.users.create({
      data: {
        name: data.name,
        email: data.email,
        password: data.hashedPassword,
        // role is Int here, unlike status and is_deleted which are VarChar.
        role: data.role,
        emp_code: data.empCode,
        type: data.type,
        ...(data.companyCode ? { company_code: data.companyCode } : {}),
      },
    });

    return { ...created, id: Number(created.id) } as unknown as AuthUserRow;
  }
}

/**
 * Storage for the identity claim.
 *
 * The Aadhaar on file is decrypted here rather than in the service, so the
 * service never handles the encrypted column and cannot accidentally compare
 * against ciphertext.
 */
export class PrismaIdentityRepository implements IdentityRepository {
  constructor(private readonly encrypter: LaravelEncrypter) {}

  async findForClaim(
    empCode: string,
    companyCode: string,
    unit?: string | null,
  ): Promise<IdentityUserRow | null> {
    const row = await db.users.findFirst({
      where: {
        emp_code: empCode,
        company_code: companyCode,
        ...(unit ? { unit } : {}),
      },
    });

    if (!row) return null;

    // Prefer the encrypted column; fall back to the legacy plaintext one for
    // rows written before the cast existed.
    const onFile =
      this.encrypter.tryDecryptString(row.encrypted_aadhaar_number) ??
      (normalise(row.aadhar_card_no) || null);

    return {
      id: Number(row.id),
      name: row.name,
      email: row.email,
      emp_code: row.emp_code,
      company_code: row.company_code,
      unit: row.unit,
      address: row.address,
      photo: row.photo,
      is_deleted: row.is_deleted,
      aadhaarOnFile: onFile,
    };
  }

  async recordVerification(
    id: number,
    data: {
      verificationTokenHash: string;
      expiresAt: Date;
      aadhaar?: string;
      address?: string;
      photo?: string;
    },
  ): Promise<void> {
    await db.users.update({
      where: { id: BigInt(id) },
      data: {
        verification_token: data.verificationTokenHash,
        verification_token_expires_at: data.expiresAt,
        /*
         * Only the plaintext column, matching PHP.
         *
         * There is no mutator on the model, so `$emp->aadhar_card_no = ...`
         * writes this column alone. The derived set — encrypted_aadhaar_number,
         * aadhaar_last_four, aadhaar_secure_reference, the extraction fields —
         * is filled atomically by setAadhaarNumber(), which this flow does not
         * call. Populating some of them here would leave a row with an
         * encrypted value but no secure reference, and that reference is what
         * resolves the employee's document folder.
         */
        ...(data.aadhaar ? { aadhar_card_no: data.aadhaar } : {}),
        ...(data.address ? { address: data.address } : {}),
        ...(data.photo ? { photo: data.photo } : {}),
      },
    });
  }
}
