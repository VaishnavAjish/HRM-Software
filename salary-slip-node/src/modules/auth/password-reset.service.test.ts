import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  PasswordResetService,
  generateOtp,
  type PasswordResetRepository,
  type ResetUserRow,
  type PasswordHasher,
} from './password-reset.service.js';
import type { Mailer } from '../../lib/mail/mailer.js';

/**
 * The reset flow, including the divergence from PHP.
 *
 * The Laravel implementation lets anyone who knows a registered email address
 * set that account's password: step 3 checks only that an OTP exists, never
 * that the caller knows it. That is proven against the real endpoint in
 * salary-slip-bac/tests/Feature/PasswordResetOtpTest.php. These tests pin the
 * corrected behaviour here.
 */

class FakeRepo implements PasswordResetRepository {
  completed: { id: number; hashed: string; activate: boolean }[] = [];
  otps: { id: number; otp: string }[] = [];
  constructor(public rows: ResetUserRow[]) {}

  async findByEmail(email: string) {
    return this.rows.find((r) => r.email === email) ?? null;
  }
  async setOtp(id: number, otp: string) {
    this.otps.push({ id, otp });
    const row = this.rows.find((r) => r.id === id);
    if (row) row.otp = otp;
  }
  async completeReset(id: number, hashed: string, activate: boolean) {
    this.completed.push({ id, hashed, activate });
    const row = this.rows.find((r) => r.id === id);
    if (row) row.otp = null;
  }
}

class FakeMailer implements Mailer {
  sent: { to: string; otp: string; name: string }[] = [];
  shouldFail = false;
  async sendOtp(to: string, otp: string, name: string) {
    if (this.shouldFail) throw new Error('smtp down');
    this.sent.push({ to, otp, name });
  }
}

const hasher: PasswordHasher = { make: async (p) => `hashed:${p}` };

let repo: FakeRepo;
let mailer: FakeMailer;
let service: PasswordResetService;

const EMAIL = 'victim@test.local';

beforeEach(() => {
  repo = new FakeRepo([
    { id: 1, email: EMAIL, name: 'Victim', otp: null, status: '0', is_deleted: '0' },
  ]);
  mailer = new FakeMailer();
  service = new PasswordResetService(repo, mailer, hasher, () => '4821');
});

describe('generateOtp', () => {
  it('produces a four-digit code, like random_int(1000, 9999)', () => {
    expect(generateOtp(() => 0)).toBe('1000');
    expect(generateOtp(() => 0.9999999)).toBe('9999');
    expect(generateOtp()).toMatch(/^\d{4}$/);
  });
});

describe('step 1 — send', () => {
  it('emails the code and stores it', async () => {
    await expect(service.sendOtp(EMAIL)).resolves.toEqual({ message: 'OTP sent to email' });

    expect(mailer.sent).toEqual([{ to: EMAIL, otp: '4821', name: 'Victim' }]);
    expect(repo.otps).toEqual([{ id: 1, otp: '4821' }]);
  });

  it('reports an unknown address as PHP does', async () => {
    await expect(service.sendOtp('nobody@test.local')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Email not found in our records.',
    });
  });

  it('does not store a code it failed to send', async () => {
    mailer.shouldFail = true;

    await expect(service.sendOtp(EMAIL)).rejects.toMatchObject({ statusCode: 500 });
    // Storing first would leave the account resettable with a code nobody got.
    expect(repo.otps).toEqual([]);
    expect(repo.rows[0]!.otp).toBeNull();
  });
});

describe('step 2 — verify', () => {
  it('accepts the right code', async () => {
    await service.sendOtp(EMAIL);
    await expect(service.verifyOtp(EMAIL, '4821')).resolves.toEqual({ message: 'OTP verified' });
  });

  it('rejects the wrong code', async () => {
    await service.sendOtp(EMAIL);
    await expect(service.verifyOtp(EMAIL, '0000')).rejects.toMatchObject({
      statusCode: 422,
      message: 'Invalid OTP',
    });
  });

  it('rejects when no code is outstanding', async () => {
    await expect(service.verifyOtp(EMAIL, '4821')).rejects.toMatchObject({ statusCode: 422 });
  });

  it('does not consume the code', async () => {
    await service.sendOtp(EMAIL);
    await service.verifyOtp(EMAIL, '4821');
    // Verifying twice is legitimate; only step 3 clears it.
    await expect(service.verifyOtp(EMAIL, '4821')).resolves.toBeDefined();
  });
});

describe('step 3 — set password', () => {
  it('accepts the correct code', async () => {
    await service.sendOtp(EMAIL);

    await expect(service.setPassword(EMAIL, 'chosen-by-owner', '4821')).resolves.toEqual({
      message: 'Password reset successfully',
    });
    expect(repo.completed).toEqual([{ id: 1, hashed: 'hashed:chosen-by-owner', activate: false }]);
  });

  // --- the divergence from PHP ------------------------------------------

  it('REFUSES a reset with the wrong code', async () => {
    await service.sendOtp(EMAIL);

    // PHP accepts this: it never compares the value.
    await expect(service.setPassword(EMAIL, 'attacker-chosen', '0000')).rejects.toMatchObject({
      statusCode: 422,
      message: 'Invalid OTP',
    });
    expect(repo.completed).toEqual([]);
  });

  it('REFUSES a reset with no code at all', async () => {
    await service.sendOtp(EMAIL);

    // The exact attack: trigger step 1 for someone else's address, then skip
    // straight to step 3. PHP returns 200 and changes the password.
    await expect(service.setPassword(EMAIL, 'attacker-chosen', '')).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(repo.completed).toEqual([]);
  });

  it('still refuses when no reset was requested', async () => {
    await expect(service.setPassword(EMAIL, 'attacker-chosen', '4821')).rejects.toMatchObject({
      statusCode: 422,
      message: 'Verification expired. Please request a new OTP.',
    });
  });

  // ----------------------------------------------------------------------

  it('makes the code single-use', async () => {
    await service.sendOtp(EMAIL);
    await service.setPassword(EMAIL, 'first', '4821');

    // Leaving it set would allow unlimited resets from one delivered code.
    await expect(service.setPassword(EMAIL, 'second', '4821')).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('clears status 2 as PHP does', async () => {
    repo.rows[0]!.status = '2';
    await service.sendOtp(EMAIL);
    await service.setPassword(EMAIL, 'chosen', '4821');

    expect(repo.completed[0]!.activate).toBe(true);
  });

  it('refuses a deactivated account', async () => {
    repo.rows[0]!.is_deleted = '1';
    await service.sendOtp(EMAIL);

    await expect(service.setPassword(EMAIL, 'chosen', '4821')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('hashes the password rather than storing it raw', async () => {
    const spy = vi.spyOn(hasher, 'make');
    await service.sendOtp(EMAIL);
    await service.setPassword(EMAIL, 'plaintext-here', '4821');

    expect(spy).toHaveBeenCalledWith('plaintext-here');
    expect(repo.completed[0]!.hashed).not.toBe('plaintext-here');
  });
});
