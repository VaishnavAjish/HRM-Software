import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { registerAuthRoutes } from './auth.routes.js';
import { AuthService, type AuthRepository } from './auth.service.js';
import { TokenBlacklist, type CacheStore } from './token-blacklist.js';
import {
  PasswordResetService,
  type PasswordResetRepository,
  type ResetUserRow,
} from './password-reset.service.js';
import type { Mailer } from '../../lib/mail/mailer.js';

/**
 * HTTP contract for the email reset — POST /api/new-email, /api/new-email-otp,
 * /api/new-password.
 *
 * Laravel serves these from one `Route::post('new{data}')` dispatching on a
 * `type` field; they are separate routes here so the proxy can move them
 * individually rather than all four at once.
 */

const EMAIL = 'victim@test.local';

class NullAuthRepo implements AuthRepository {
  async findByLoginField() {
    return null;
  }
  async findById() {
    return null;
  }
  async markActivated() {}
}

class FakeResetRepo implements PasswordResetRepository {
  completed: { id: number; hashed: string }[] = [];
  constructor(public rows: ResetUserRow[]) {}
  async findByEmail(email: string) {
    return this.rows.find((r) => r.email === email) ?? null;
  }
  async setOtp(id: number, otp: string) {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.otp = otp;
  }
  async completeReset(id: number, hashed: string) {
    this.completed.push({ id, hashed });
    const row = this.rows.find((r) => r.id === id);
    if (row) row.otp = null;
  }
}

class FakeMailer implements Mailer {
  sent: { to: string; otp: string }[] = [];
  async sendOtp(to: string, otp: string) {
    this.sent.push({ to, otp });
  }
}

class FakeCache implements CacheStore {
  store = new Map<string, string>();
  async get(k: string) {
    return this.store.get(k) ?? null;
  }
  async put(k: string, v: string) {
    this.store.set(k, v);
  }
  async forget(k: string) {
    this.store.delete(k);
  }
}

let app: FastifyInstance;
let repo: FakeResetRepo;
let mailer: FakeMailer;

beforeEach(async () => {
  repo = new FakeResetRepo([
    { id: 1, email: EMAIL, name: 'Victim', otp: null, status: '0', is_deleted: '0' },
  ]);
  mailer = new FakeMailer();

  app = Fastify();
  await app.register(rateLimit, { global: false });
  await registerAuthRoutes(app, {
    service: new AuthService(new NullAuthRepo(), new TokenBlacklist(new FakeCache(), 0), {
      jwtSecret: 's',
      jwtTtlMinutes: 60,
      issuer: 'http://test',
    }),
    passwordReset: new PasswordResetService(
      repo,
      mailer,
      { make: async (p) => `hashed:${p}` },
      () => '4821',
    ),
  });
  await app.ready();
});

const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload });

describe('POST /api/new-email', () => {
  it('sends the code', async () => {
    const res = await post('/api/new-email', { email: EMAIL, type: 1 });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: true, message: 'OTP sent to email' });
    expect(mailer.sent).toEqual([{ to: EMAIL, otp: '4821' }]);
  });

  it('returns 404 for an unknown address, as Laravel does', async () => {
    const res = await post('/api/new-email', { email: 'nobody@test.local', type: 1 });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('Email not found in our records.');
  });

  it('rejects a malformed address with a single string message', async () => {
    const res = await post('/api/new-email', { email: 'not-an-email', type: 1 });

    expect(res.statusCode).toBe(422);
    expect(typeof res.json().message).toBe('string');
  });

  it('never puts the code in the response body', async () => {
    const res = await post('/api/new-email', { email: EMAIL, type: 1 });
    // It belongs in the recipient's inbox and nowhere else.
    expect(res.body).not.toContain('4821');
  });
});

describe('POST /api/new-email-otp', () => {
  it('verifies the code', async () => {
    await post('/api/new-email', { email: EMAIL, type: 1 });
    const res = await post('/api/new-email-otp', { email: EMAIL, otp: '4821', type: 2 });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('OTP verified');
  });

  it('rejects a wrong code with 422', async () => {
    await post('/api/new-email', { email: EMAIL, type: 1 });
    const res = await post('/api/new-email-otp', { email: EMAIL, otp: '0000', type: 2 });

    expect(res.statusCode).toBe(422);
    expect(res.json().message).toBe('Invalid OTP');
  });

  it('accepts a numeric code, which the client may send unquoted', async () => {
    await post('/api/new-email', { email: EMAIL, type: 1 });
    const res = await post('/api/new-email-otp', { email: EMAIL, otp: 4821, type: 2 });

    expect(res.statusCode).toBe(200);
  });
});

describe('POST /api/new-password', () => {
  it('resets with the correct code', async () => {
    await post('/api/new-email', { email: EMAIL, type: 1 });
    const res = await post('/api/new-password', {
      email: EMAIL,
      password: 'chosen-by-owner',
      otp: '4821',
      type: 3,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Password reset successfully');
    expect(repo.completed).toEqual([{ id: 1, hashed: 'hashed:chosen-by-owner' }]);
  });

  // --- the divergence from Laravel ---------------------------------------

  it('REFUSES a reset that omits the code', async () => {
    await post('/api/new-email', { email: EMAIL, type: 1 });

    // Exactly what the PHP endpoint accepts today: trigger step 1 against
    // someone else's address, then post step 3 with no code at all.
    const res = await post('/api/new-password', {
      email: EMAIL,
      password: 'attacker-chosen',
      type: 3,
    });

    expect(res.statusCode).toBe(422);
    expect(repo.completed).toEqual([]);
  });

  it('REFUSES a reset with the wrong code', async () => {
    await post('/api/new-email', { email: EMAIL, type: 1 });
    const res = await post('/api/new-password', {
      email: EMAIL,
      password: 'attacker-chosen',
      otp: '0000',
      type: 3,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().message).toBe('Invalid OTP');
    expect(repo.completed).toEqual([]);
  });

  // -----------------------------------------------------------------------

  it('refuses when no reset is outstanding', async () => {
    const res = await post('/api/new-password', {
      email: EMAIL,
      password: 'whatever',
      otp: '4821',
      type: 3,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().message).toMatch(/Verification expired/);
  });

  it('enforces the six-character minimum Laravel enforces', async () => {
    await post('/api/new-email', { email: EMAIL, type: 1 });
    const res = await post('/api/new-password', {
      email: EMAIL,
      password: 'short',
      otp: '4821',
      type: 3,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().message).toMatch(/6 characters/);
  });

  it('makes the code single-use', async () => {
    await post('/api/new-email', { email: EMAIL, type: 1 });
    await post('/api/new-password', { email: EMAIL, password: 'first-one', otp: '4821', type: 3 });

    const again = await post('/api/new-password', {
      email: EMAIL,
      password: 'second-one',
      otp: '4821',
      type: 3,
    });

    expect(again.statusCode).toBe(422);
    expect(repo.completed).toHaveLength(1);
  });
});

describe('routing', () => {
  it('now serves /api/new-emp_code itself', async () => {
    // Type 0 used to fall through to Laravel; it is ported, so Node answers.
    // A claim with no identity supplied is a 422, not a 404 — which is how
    // this asserts the route exists rather than that it succeeds.
    const res = await post('/api/new-emp_code', { emp_code: '', type: 0 });
    expect(res.statusCode).not.toBe(404);
  });
});
