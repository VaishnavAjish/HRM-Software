import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { registerEmployeeRoutes } from './employees.routes.js';
import { AuthService, type AuthRepository, type AuthUserRow } from '../auth/auth.service.js';
import { TokenBlacklist, type CacheStore } from '../auth/token-blacklist.js';
import { AuditLogger, InMemoryAuditSink } from '../../lib/audit/audit-logger.js';
import { make as hashPassword } from '../../lib/laravel/hash.js';
import {
  AuthorizationEngine,
  type AuthorizationRepository,
  type GrantRow,
  type PolicyRow,
  type RoleContext,
  type TemporaryGrantRow,
} from '../authorization/authorization.engine.js';
import type { Obligations } from '../authorization/authorization.types.js';

/**
 * The authorization contract of the employee routes.
 *
 * These assert the things that are only true if the enforcement helpers are
 * actually wired: that a caller without the permission is refused, that
 * protected fields never reach the response body, and that a write naming a
 * field the caller may not change is rejected rather than silently applied.
 *
 * Deliberately at the HTTP layer. Unit-testing the helpers proves they work;
 * only a request proves the route uses them.
 */

const ADMIN: AuthUserRow = {
  id: 1,
  name: 'Admin',
  email: 'admin@example.test',
  emp_code: 'A1',
  role: 1,
  type: null,
  company_code: 'nidhi-impex',
  unit: 'Shreeji',
  status: '0',
  is_deleted: false,
  // Filled in by build(); `make` is async so it cannot be called here.
  password: '',
} as unknown as AuthUserRow;

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
  constructor(private readonly row: AuthUserRow) {}
  async findByLoginField() {
    return this.row;
  }
  async findById() {
    return this.row;
  }
  async markActivated() {}
}

/** Grants whatever codes it is given, with optional obligations. */
class FakeAuthzRepo implements AuthorizationRepository {
  constructor(
    private readonly allow: string[],
    private readonly obligations: Obligations | null = null,
  ) {}

  async directGrants(_userId: number, code: string): Promise<GrantRow[]> {
    if (!this.allow.includes(code)) return [];
    return [{ id: 1, effect: 'ALLOW', conditions: null, obligations: this.obligations }];
  }
  async roleContexts(): Promise<RoleContext[]> {
    return [];
  }
  async rolePermissions(): Promise<GrantRow[]> {
    return [];
  }
  async policies(): Promise<PolicyRow[]> {
    return [];
  }
  async temporaryGrants(): Promise<TemporaryGrantRow[]> {
    return [];
  }
  async relationships(): Promise<string[]> {
    return [];
  }
  async hasGlobalAssignment(): Promise<boolean> {
    return false;
  }
  async writeDecision(): Promise<void> {}
}

const EMPLOYEE = {
  id: 42,
  name: 'Asha',
  designation: 'Clerk',
  salary: 50000,
  aadhar_card_no: '123456789012',
  bank_account_no: '9876543210',
  company_code: 'nidhi-impex',
};

/** Minimal EmployeeService stand-in; only what the routes call. */
function fakeEmployees(updated: Record<string, unknown>[]) {
  return {
    async list() {
      return {
        result: {
          rows: [{ ...EMPLOYEE }],
          total: 1,
          perPage: 15,
          currentPage: 1,
          lastPage: 1,
          activeCount: 1,
        },
        disclosed: 0,
      };
    },
    async show() {
      return { ...EMPLOYEE };
    },
    async create(_actor: unknown, body: Record<string, unknown>) {
      updated.push(body);
      return { id: 99, ...body };
    },
    async update(_actor: unknown, _id: number, body: Record<string, unknown>) {
      updated.push(body);
      return { ...EMPLOYEE, ...body };
    },
    async remove() {},
    async removeMany() {
      return 0;
    },
  } as never;
}

async function build(allow: string[], obligations: Obligations | null = null) {
  const app: FastifyInstance = Fastify();
  const written: Record<string, unknown>[] = [];

  const admin = { ...ADMIN, password: await hashPassword('secret123') } as AuthUserRow;

  const authService = new AuthService(new FakeAuthRepo(admin), new TokenBlacklist(new FakeCache(), 0), {
    jwtSecret: 'test-secret-value-for-signing',
    jwtTtlMinutes: 60,
    issuer: 'test',
  });

  await registerEmployeeRoutes(app, {
    authService,
    audit: new AuditLogger(new InMemoryAuditSink()),
    employees: fakeEmployees(written),
    engine: new AuthorizationEngine(new FakeAuthzRepo(allow, obligations)),
  });

  // Minted the same way a real caller gets one, so the guard exercises the
  // actual verification path rather than a hand-built token.
  const { token } = await authService.login(admin.email!, 'secret123');
  return { app, token, written };
}

let ctx: Awaited<ReturnType<typeof build>>;

describe('employee routes — permission gate', () => {
  it('refuses a caller holding neither vocabulary', async () => {
    ctx = await build([]);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/employee/get',
      headers: { authorization: `Bearer ${ctx.token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('PERMISSION_DENIED');
  });

  it('admits a caller holding the canonical code', async () => {
    ctx = await build(['hr.employee.read']);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/employee/get',
      headers: { authorization: `Bearer ${ctx.token}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it('admits a caller holding only the legacy code', async () => {
    // This is the case production is actually in.
    ctx = await build(['employees.view']);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/employee/get',
      headers: { authorization: `Bearer ${ctx.token}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it('gates writes on the write permission, not the read one', async () => {
    ctx = await build(['employees.view']);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/employee/store',
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { name: 'New' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('still requires authentication', async () => {
    ctx = await build(['employees.view']);
    const res = await ctx.app.inject({ method: 'GET', url: '/api/employee/get' });

    expect(res.statusCode).toBe(401);
  });
});

describe('employee routes — field security', () => {
  it('removes hidden fields from the list response', async () => {
    ctx = await build(['employees.view'], { hiddenFields: ['aadhar_card_no', 'salary'] });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/employee/get',
      headers: { authorization: `Bearer ${ctx.token}` },
    });

    const [row] = res.json().data.users.data;
    expect(row).not.toHaveProperty('aadhar_card_no');
    expect(row).not.toHaveProperty('salary');
    expect(row.name).toBe('Asha');
  });

  it('masks rather than removes where told to', async () => {
    ctx = await build(['employees.view'], { maskedFields: ['bank_account_no'] });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/employee/get',
      headers: { authorization: `Bearer ${ctx.token}` },
    });

    expect(res.json().data.users.data[0].bank_account_no).toBe('••••••3210');
  });

  it('applies field security to the detail response too', async () => {
    ctx = await build(['employees.view'], { hiddenFields: ['aadhar_card_no'] });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/employee/show/42',
      headers: { authorization: `Bearer ${ctx.token}` },
    });

    expect(res.json().data).not.toHaveProperty('aadhar_card_no');
  });

  it('rejects a write touching a read-only field, naming it', async () => {
    ctx = await build(['employees.edit'], { readOnlyFields: ['salary'] });
    const res = await ctx.app.inject({
      method: 'PUT',
      url: '/api/employee/edit/42',
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { salary: 99999 },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().fields).toEqual(['salary']);
    // Nothing reached the service.
    expect(ctx.written).toHaveLength(0);
  });

  it('accepts a write that echoes a read-only field back unchanged', async () => {
    ctx = await build(['employees.edit'], { readOnlyFields: ['salary'] });
    const res = await ctx.app.inject({
      method: 'PUT',
      url: '/api/employee/edit/42',
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { salary: 50000, designation: 'Senior Clerk' },
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.written[0]).toMatchObject({ designation: 'Senior Clerk' });
  });

  it('rejects a create that sets a field the caller cannot see', async () => {
    ctx = await build(['employees.create'], { hiddenFields: ['salary'] });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/employee/store',
      headers: { authorization: `Bearer ${ctx.token}` },
      payload: { name: 'New', salary: 1 },
    });

    expect(res.statusCode).toBe(403);
    expect(ctx.written).toHaveLength(0);
  });
});

beforeEach(() => {
  ctx = undefined as never;
});
