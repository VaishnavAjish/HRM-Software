import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { registerAuthRoutes } from './auth.routes.js';
import { AuthService, type AuthRepository, type AuthUserRow } from './auth.service.js';
import { AccountService, type AccountRepository } from './account.service.js';
import { TokenBlacklist, type CacheStore } from './token-blacklist.js';
import { resolveRole } from './guards.js';
import { make as hashPassword } from '../../lib/laravel/hash.js';

/**
 * HTTP contract for change-password, check-emp-code and register, plus the
 * role guard those routes depend on.
 */

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

class FakeAuthRepo implements AuthRepository {
  constructor(public rows: AuthUserRow[]) {}
  async findByLoginField(field: 'email' | 'emp_code', value: string) {
    return this.rows.find((r) => r[field] === value) ?? null;
  }
  async findById(id: number) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async markActivated() {}
}

class FakeAccountRepo implements AccountRepository {
  passwords: { id: number; hashed: string }[] = [];
  created: Parameters<AccountRepository['createUser']>[0][] = [];
  async updatePassword(id: number, hashed: string) {
    this.passwords.push({ id, hashed });
  }
  async findByEmpCode(code: string) {
    return code === '1138' ? { company_code: 'nidhi-impex', unit: 'Ichapur' } : null;
  }
  async emailExists(email: string) {
    return email === 'taken@test.local';
  }
  async createUser(data: Parameters<AccountRepository['createUser']>[0]) {
    this.created.push(data);
    // Shaped like a real Prisma row: the column is `password`. Spreading the
    // input instead would smuggle in a `hashedPassword` key that no database
    // row has, and the serializer's denylist would pass it straight through.
    return {
      id: 99,
      name: data.name,
      email: data.email,
      emp_code: data.empCode,
      role: data.role,
      type: data.type,
      company_code: data.companyCode,
      password: data.hashedPassword,
      status: '0',
      is_deleted: '0',
    } as unknown as AuthUserRow;
  }
}

let app: FastifyInstance;
let accountRepo: FakeAccountRepo;
let authRepo: FakeAuthRepo;

const OPTIONS = { jwtSecret: 'test-secret', jwtTtlMinutes: 60, issuer: 'http://test' };

async function tokenFor(id: number) {
  const service = new AuthService(authRepo, new TokenBlacklist(new FakeCache(), 0), OPTIONS);
  const row = authRepo.rows.find((r) => r.id === id)!;
  const { token } = await service.login(row.email!, 'secret123');
  return token;
}

beforeEach(async () => {
  const password = await hashPassword('secret123', 4);

  authRepo = new FakeAuthRepo([
    { id: 1, email: 'admin@test.local', emp_code: 'A1', password, role: 1, status: '0', is_deleted: '0' } as AuthUserRow,
    { id: 2, email: 'worker@test.local', emp_code: 'E1', password, role: 3, status: '0', is_deleted: '0' } as AuthUserRow,
    { id: 3, email: 'agent@test.local', emp_code: 'G1', password, role: 4, type: 'agent', status: '0', is_deleted: '0' } as AuthUserRow,
  ]);
  accountRepo = new FakeAccountRepo();

  app = Fastify();
  await app.register(rateLimit, { global: false });
  await registerAuthRoutes(app, {
    service: new AuthService(authRepo, new TokenBlacklist(new FakeCache(), 0), OPTIONS),
    account: new AccountService(accountRepo, { make: async (p) => `hashed:${p}` }, (n) =>
      Buffer.alloc(n, 1),
    ),
    decryptAadhaar: () => null,
  });
  await app.ready();
});

describe('resolveRole — mirrors RoleMiddleware', () => {
  it.each([
    [{ role: 0 }, 'admin'],
    [{ role: 1 }, 'admin'],
    [{ role: 2 }, 'admin'],
    [{ role: 3 }, 'employee'],
    [{ role: 4 }, 'agent'],
    [{ type: 'agent', role: 1 }, 'agent'],
    [{ role: 'admin' }, 'admin'],
    [{ role: 99 }, 'employee'],
  ])('%j resolves to %s', (user, expected) => {
    // Role 3 is an employee and 4 an agent, so a numeric comparison would be
    // wrong here — this is a lookup, not an ordering.
    expect(resolveRole(user as Record<string, unknown>)).toBe(expected);
  });
});

describe('POST /api/change-password', () => {
  const change = (token: string | undefined, body: unknown) =>
    app.inject({
      method: 'POST',
      url: '/api/change-password',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: body,
    });

  it('changes the password', async () => {
    const token = await tokenFor(2);
    const res = await change(token, {
      password: 'secret123',
      new_password: 'brand-new-one',
      confirm_password: 'brand-new-one',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Password changed successfully');
    expect(accountRepo.passwords).toEqual([{ id: 2, hashed: 'hashed:brand-new-one' }]);
  });

  it('rejects a wrong current password with 422', async () => {
    const token = await tokenFor(2);
    const res = await change(token, {
      password: 'wrong',
      new_password: 'brand-new-one',
      confirm_password: 'brand-new-one',
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().message).toBe('Current password is incorrect');
    expect(accountRepo.passwords).toEqual([]);
  });

  it('rejects a mismatched confirmation', async () => {
    const token = await tokenFor(2);
    const res = await change(token, {
      password: 'secret123',
      new_password: 'brand-new-one',
      confirm_password: 'something-else',
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().message).toMatch(/match/i);
  });

  it('enforces the six-character minimum', async () => {
    const token = await tokenFor(2);
    const res = await change(token, {
      password: 'secret123',
      new_password: 'short',
      confirm_password: 'short',
    });

    expect(res.statusCode).toBe(422);
  });

  it('requires authentication', async () => {
    const res = await change(undefined, {
      password: 'secret123',
      new_password: 'brand-new-one',
      confirm_password: 'brand-new-one',
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/check-emp-code/:code', () => {
  const check = (code: string) => app.inject({ method: 'GET', url: `/api/check-emp-code/${code}` });

  it('returns the company and unit', async () => {
    const res = await check('1138');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: true, company_code: 'nidhi-impex', unit: 'Ichapur' });
  });

  it('404s an unknown code', async () => {
    const res = await check('9999');

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ status: false, message: 'Not found' });
  });

  it('stays reachable without a token', async () => {
    // The login screen calls this before anyone has signed in; requiring auth
    // here would break the account-claim flow.
    expect((await check('1138')).statusCode).toBe(200);
  });
});

describe('POST /api/register', () => {
  const register = (token: string | undefined, body: unknown) =>
    app.inject({
      method: 'POST',
      url: '/api/register',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: body,
    });

  const body = { name: 'New Admin', email: 'new@test.local', password: 'secret123' };

  it('creates an account for an admin', async () => {
    const res = await register(await tokenFor(1), body);

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('User registered successfully');
  });

  it('refuses an employee with 403', async () => {
    const res = await register(await tokenFor(2), body);

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toMatch(/insufficient permissions/);
  });

  it('refuses an agent with 403', async () => {
    expect((await register(await tokenFor(3), body)).statusCode).toBe(403);
  });

  it('refuses an anonymous caller with 401', async () => {
    expect((await register(undefined, body)).statusCode).toBe(401);
  });

  it('rejects a duplicate email with 422, not a 500', async () => {
    const res = await register(await tokenFor(1), { ...body, email: 'taken@test.local' });

    // users.email is uniquely indexed; without the pre-check the insert throws.
    expect(res.statusCode).toBe(422);
  });

  it('always assigns an emp_code', async () => {
    await register(await tokenFor(1), body);
    // Null emp_code + null type is what getAppointment() reads as a pending
    // appointment, so the account would surface in the Appointments list.
    expect(accountRepo.created[0]!.empCode).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('marks role 4 as an agent', async () => {
    await register(await tokenFor(1), { ...body, role: 4 });
    expect(accountRepo.created[0]!.type).toBe('agent');
  });

  it('never returns the password hash', async () => {
    const res = await register(await tokenFor(1), body);
    expect(res.json().user).not.toHaveProperty('password');
    expect(res.body).not.toContain('hashed:secret123');
  });
});
