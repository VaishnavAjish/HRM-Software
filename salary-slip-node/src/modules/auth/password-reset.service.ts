import { AuthError } from './auth.service.js';
import type { Mailer } from '../../lib/mail/mailer.js';

/**
 * The email-OTP password reset — POST /new{data}, types 1 → 2 → 3.
 *
 * One PHP route multiplexes four flows on a `type` field. Types 1–3 are the
 * reset itself and are ported here; type 0 is the identity-claim step and
 * carries a file upload, so it lives separately.
 *
 * DELIBERATE DIVERGENCE FROM PHP — step 3 verifies the OTP.
 *
 * setNewPasswordAfterVerification() checks only that an OTP exists on the row
 * and never compares the submitted value, so anyone knowing a registered email
 * could trigger step 1 and then set the password at step 3 without ever seeing
 * the code. Proven in salary-slip-bac/tests/Feature/PasswordResetOtpTest.php.
 *
 * The decision was to fix this in Node and leave Laravel unchanged, so the two
 * backends intentionally disagree: Node refuses resets that PHP would accept,
 * never the reverse. The React client now forwards the code it already
 * collected at step 2, which PHP ignores.
 */

export interface ResetUserRow {
  id: number;
  email: string | null;
  name: string | null;
  otp: string | null;
  status: number | string | null;
  is_deleted: number | string | null;
}

export interface PasswordResetRepository {
  findByEmail(email: string): Promise<ResetUserRow | null>;
  setOtp(id: number, otp: string): Promise<void>;
  /** Writes the new password (hashed) and clears the OTP in one step. */
  completeReset(id: number, hashedPassword: string, activate: boolean): Promise<void>;
}

export interface PasswordHasher {
  make(plain: string): Promise<string>;
}

const toInt = (v: unknown): number => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isNaN(n) ? 0 : n;
};

/** Matches PHP's random_int(1000, 9999) — a four-digit code. */
export function generateOtp(random: () => number = Math.random): string {
  return String(1000 + Math.floor(random() * 9000));
}

/**
 * Constant-time comparison of two short codes.
 *
 * A `===` on a 4-digit code is not a practical timing oracle, but the
 * comparison is the whole security boundary of this flow, so it should not be
 * the thing anyone has to reason about.
 */
function codesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export class PasswordResetService {
  constructor(
    private readonly users: PasswordResetRepository,
    private readonly mailer: Mailer,
    private readonly hasher: PasswordHasher,
    private readonly randomOtp: () => string = generateOtp,
  ) {}

  /** type 1 — issue and email a code. */
  async sendOtp(email: string): Promise<{ message: string }> {
    const user = await this.users.findByEmail(email);

    // PHP answers 404 here, which tells an anonymous caller whether an address
    // is registered. Preserved: the frontend shows this message, and changing
    // it would alter a user-visible flow for a disclosure the login endpoint
    // makes anyway.
    if (!user) {
      throw new AuthError('Email not found in our records.', 404);
    }

    const otp = this.randomOtp();

    try {
      await this.mailer.sendOtp(user.email ?? email, otp, user.name ?? 'there');
    } catch {
      // The code is stored only after the mail is away: storing first would
      // leave an account resettable via a code nobody received.
      throw new AuthError('Could not send OTP email. Please try again later.', 500);
    }

    await this.users.setOtp(user.id, otp);

    return { message: 'OTP sent to email' };
  }

  /** type 2 — check a code without consuming it. */
  async verifyOtp(email: string, otp: string): Promise<{ message: string }> {
    const user = await this.users.findByEmail(email);

    if (!user?.otp || !codesMatch(String(user.otp), String(otp))) {
      throw new AuthError('Invalid OTP', 422);
    }

    return { message: 'OTP verified' };
  }

  /**
   * type 3 — set the new password.
   *
   * Unlike PHP, this re-checks the code. Step 2 verifying it is not enough:
   * step 2 is a separate unauthenticated request that leaves no server-side
   * record of having succeeded, so nothing stops a caller from skipping it.
   */
  async setPassword(email: string, password: string, otp: string): Promise<{ message: string }> {
    const user = await this.users.findByEmail(email);

    if (!user?.otp) {
      throw new AuthError('Verification expired. Please request a new OTP.', 422);
    }

    if (!codesMatch(String(user.otp), String(otp))) {
      throw new AuthError('Invalid OTP', 422);
    }

    if (toInt(user.is_deleted) === 1) {
      throw new AuthError('Account is deactivated', 403);
    }

    const hashed = await this.hasher.make(password);

    // Clearing the OTP in the same write makes the code single-use: leaving it
    // set would allow unlimited resets from one delivered code.
    await this.users.completeReset(user.id, hashed, toInt(user.status) === 2);

    return { message: 'Password reset successfully' };
  }
}
