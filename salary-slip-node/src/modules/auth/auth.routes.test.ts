import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { registerAuthRoutes } from './auth.routes.js';
import { AuthService, type AuthRepository, type AuthUserRow } from './auth.service.js';
import { TokenBlacklist, type CacheStore } from './token-blacklist.js';
import { make as hashPassword } from '../../lib/laravel/hash.js';

/**
 * HTTP contract for the auth routes.
 *
 * The React client is unchanged by this migration, so these assert the exact
 * envelope src/utils/api.js already parses — status codes included. A response
 * that is "more correct" but differently shaped is a regression here.
 *
 * Built against fakes: login writes (it clears status 2) and the only database
 * available is production.
 */

const OPTIONS = { jwtSecret: 'test-secret', jwtTtlMinutes: 43200, issuer: 'http://test' };

class FakeRepo implements AuthRepository {
  activated: number[] = [];
  constructor(public rows: AuthUserRow[]) {}
  async findByLoginField(field: 'email' | 'emp_code', value: string) {
    return this.rows.find((r) => r[field] === value) ?? null;
  }
  async findById(id: number) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async markActivated(id: number) {
    this.activated.push(id);
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
let repo: FakeRepo;
let password: string;

beforeEach(async () => {
  password = await hashPassword('secret123', 4);

  repo = new FakeRepo([
    {
      id: 1,
      name: 'Ravi Kumar',
      email: 'ravi@example.com',
      emp_code: '1138',
      password,
      status: '0',
      is_deleted: '0',
      company_code: 'nidhi-impex',
      aadhaar_last_four: '1345',
      encrypted_aadhaar_number: 'ENCRYPTED',
      aadhar_card_no: '715115981345',
    } as AuthUserRow,
  ]);

  const service = new AuthService(repo, new TokenBlacklist(new FakeCache(), 0), OPTIONS);

  app = Fastify();
  await app.register(rateLimit, { global: false });
  await registerAuthRoutes(app, {
    service,
    // Stands in for the APP_KEY-backed decrypt so the route can be exercised
    // without real ciphertext.
    decryptAadhaar: (payload) => (payload === 'ENCRYPTED' ? '715115981345' : null),
  });
  await app.ready();
});

const login = (body: unknown) => app.inject({ method: 'POST', url: '/api/login', payload: body });

describe('POST /api/login', () => {
  it('returns the envelope the React client parses', async () => {
    const res = await login({ email: 'ravi@example.com', password: 'secret123' });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.status).toBe(true);
    expect(body.message).toBe('Login successful');
    expect(body.token_type).toBe('Bearer');
    expect(typeof body.token).toBe('string');
    expect(body.user.id).toBe(1);
  });

  it('signs in by employee code', async () => {
    const res = await login({ email: '1138', password: 'secret123' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects bad credentials with 401 and Laravel\'s message', async () => {
    const res = await login({ email: 'ravi@example.com', password: 'nope' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ status: false, message: 'Invalid credentials' });
  });

  it('returns 403 for a deactivated account', async () => {
    repo.rows[0]!.is_deleted = '1';
    const res = await login({ email: 'ravi@example.com', password: 'secret123' });

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toBe('Account is deactivated');
  });

  it('returns 422 with a single string message, not a Zod issue array', async () => {
    const res = await login({ email: '' });

    expect(res.statusCode).toBe(422);
    // extractErrorMessage() renders an object as "[object Object]".
    expect(typeof res.json().message).toBe('string');
    expect(res.json().message).toMatch(/required/i);
  });

  it('reports the first error only, as Laravel does', async () => {
    const res = await login({});
    expect(res.statusCode).toBe(422);
    expect(res.json().message).toMatch(/email/i);
  });

  it('marks the response uncacheable', async () => {
    const res = await login({ email: 'ravi@example.com', password: 'secret123' });
    // A shared cache replaying this hands one user another user's session.
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('never puts the password hash or raw Aadhaar on the wire', async () => {
    const res = await login({ email: 'ravi@example.com', password: 'secret123' });

    expect(res.body).not.toContain(password);
    expect(res.json().user).not.toHaveProperty('password');
    expect(res.json().user).not.toHaveProperty('aadhar_card_no');
    expect(res.json().user).not.toHaveProperty('encrypted_aadhaar_number');
  });

  it('does not disclose the full Aadhaar at login, only the mask', async () => {
    const res = await login({ email: 'ravi@example.com', password: 'secret123' });

    expect(res.json().user.aadhaar_masked).toBe('XXXX XXXX 1345');
    expect(res.body).not.toContain('715115981345');
  });
});

describe('GET /api/profile', () => {
  const profile = (token?: string) =>
    app.inject({
      method: 'GET',
      url: '/api/profile',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  it('returns the caller', async () => {
    const { token } = (await login({ email: 'ravi@example.com', password: 'secret123' })).json();
    const res = await profile(token);

    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe(1);
  });

  it('discloses the full Aadhaar for your own record', async () => {
    const { token } = (await login({ email: 'ravi@example.com', password: 'secret123' })).json();
    const res = await profile(token);

    // You own this identity document, so no separate grant is required.
    expect(res.json().user.aadhaar_full).toBe('715115981345');
    expect(res.json().user.aadhaar_masked).toBe('XXXX XXXX 1345');
  });

  it('still hides the stored columns themselves', async () => {
    const { token } = (await login({ email: 'ravi@example.com', password: 'secret123' })).json();
    const res = await profile(token);

    expect(res.json().user).not.toHaveProperty('encrypted_aadhaar_number');
    expect(res.json().user).not.toHaveProperty('aadhar_card_no');
  });

  it('rejects a missing token with 401', async () => {
    expect((await profile()).statusCode).toBe(401);
  });

  it('rejects a garbage token with 401', async () => {
    expect((await profile('nonsense')).statusCode).toBe(401);
  });

  it('marks the response uncacheable', async () => {
    const { token } = (await login({ email: 'ravi@example.com', password: 'secret123' })).json();
    expect((await profile(token)).headers['cache-control']).toMatch(/no-store/);
  });
});

describe('POST /api/logout', () => {
  const logout = (token?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/logout',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  it('reports success and revokes the token', async () => {
    const { token } = (await login({ email: 'ravi@example.com', password: 'secret123' })).json();

    const res = await logout(token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: true, message: 'Logged out successfully' });

    // The token must stop working immediately, not in 30 days.
    const after = await app.inject({
      method: 'GET',
      url: '/api/profile',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.statusCode).toBe(401);
  });

  it('succeeds with no token', async () => {
    // Reaching the handler at all is the point: guarding this route is what
    // previously left tokens live for a month after a "successful" sign-out.
    const res = await logout();
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe(true);
  });

  it('succeeds with a malformed token', async () => {
    expect((await logout('garbage')).statusCode).toBe(200);
  });

  it('is idempotent', async () => {
    const { token } = (await login({ email: 'ravi@example.com', password: 'secret123' })).json();
    await logout(token);
    expect((await logout(token)).statusCode).toBe(200);
  });
});
