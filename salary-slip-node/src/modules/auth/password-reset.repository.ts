import { db } from '../../db/client.js';
import type { PasswordResetRepository, ResetUserRow } from './password-reset.service.js';

/**
 * Prisma implementation of the reset flow's storage.
 *
 * Mirrors Laravel's findUserByEmail(): a plain `where('email', $email)->first()`
 * with no company scoping and no is_deleted filter. Preserved as-is — email is
 * uniquely indexed on this table, so the lack of scoping does not actually
 * widen the match.
 */
export class PrismaPasswordResetRepository implements PasswordResetRepository {
  async findByEmail(email: string): Promise<ResetUserRow | null> {
    const row = await db.users.findFirst({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        otp: true,
        status: true,
        is_deleted: true,
      },
    });

    if (!row) return null;

    return { ...row, id: Number(row.id) } as ResetUserRow;
  }

  async setOtp(id: number, otp: string): Promise<void> {
    await db.users.update({ where: { id: BigInt(id) }, data: { otp } });
  }

  /**
   * Write the new password and clear the code in a single statement.
   *
   * One write, not two: clearing the OTP separately leaves a window in which
   * the password is already changed but the code is still live, so a second
   * request could reset it again.
   */
  async completeReset(id: number, hashedPassword: string, activate: boolean): Promise<void> {
    await db.users.update({
      where: { id: BigInt(id) },
      data: {
        password: hashedPassword,
        otp: null,
        // status is VarChar in this schema, not an integer.
        ...(activate ? { status: '0' } : {}),
      },
    });
  }
}
