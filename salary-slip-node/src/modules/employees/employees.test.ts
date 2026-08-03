import { describe, it, expect, beforeEach } from 'vitest';

import {
  EmployeeService,
  scopeFor,
  inManagedScope,
  guardPrivilegedFields,
  withSafeAadhaar,
  mayDiscloseAadhaar,
  companyCodesOf,
  type Actor,
  type EmployeeRepository,
  type EmployeeRow,
  type ListQuery,
  type EmployeeScope,
} from './employees.service.js';

/**
 * Employees.
 *
 * The PHP side is characterised in
 * salary-slip-bac/tests/Feature/EmployeeListScopeTest.php. These assert the
 * port, including the one place it deliberately differs: role 1 is scoped on
 * the list here, because Laravel currently returns rows a role 1 admin cannot
 * then open.
 */

const AADHAAR = '715115981345';

const employee = (over: Partial<EmployeeRow> = {}): EmployeeRow =>
  ({
    id: 1,
    name: 'Ravi Kumar',
    emp_code: '1138',
    email: 'ravi@test.local',
    company_code: 'nidhi-impex',
    unit: 'Ichapur',
    status: '0',
    is_deleted: '0',
    role: 3,
    type: null,
    aadhar_card_no: AADHAAR,
    ...over,
  }) as EmployeeRow;

class FakeRepo implements EmployeeRepository {
  created: Record<string, unknown>[] = [];
  updated: { id: number; data: Record<string, unknown> }[] = [];
  removed: number[] = [];
  constructor(public rows: EmployeeRow[] = [employee()]) {}

  async list(scope: EmployeeScope, query: ListQuery) {
    let rows = this.rows;
    if (scope.companyCodes !== null) {
      rows = rows.filter((r) => scope.companyCodes!.includes(String(r.company_code)));
    }
    if (scope.unit) rows = rows.filter((r) => r.unit === scope.unit);

    return {
      rows,
      total: rows.length,
      activeCount: rows.filter((r) => String(r.status) === '0').length,
      perPage: query.perPage,
      currentPage: query.page,
      lastPage: 1,
    };
  }
  async find(id: number) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async create(data: Record<string, unknown>) {
    this.created.push(data);
    return { ...employee(), id: 99, ...data } as EmployeeRow;
  }
  async update(id: number, data: Record<string, unknown>) {
    this.updated.push({ id, data });
    return { ...this.rows.find((r) => r.id === id)!, ...data } as EmployeeRow;
  }
  async remove(id: number) {
    this.removed.push(id);
  }
  async removeMany(ids: number[]) {
    this.removed.push(...ids);
    return ids.length;
  }
  async findByAadhaar(digits: string, exceptId?: number) {
    return this.rows.find((r) => r.aadhar_card_no === digits && r.id !== exceptId) ?? null;
  }
  async emailTaken(email: string) {
    return this.rows.some((r) => r.email === email);
  }
  async empCodeTaken(code: string) {
    return this.rows.some((r) => r.emp_code === code);
  }
}

const superAdmin: Actor = { id: 900, role: 0, company_code: 'nidhi-impex' };
const admin1: Actor = { id: 901, role: 1, company_code: 'nidhi-impex' };
const admin2: Actor = { id: 902, role: 2, company_code: 'nidhi-impex', unit: 'Ichapur' };
const multi: Actor = { id: 903, role: 1, company_code: 'nidhi-impex, silver-star' };

const QUERY: ListQuery = { page: 1, perPage: 15 };

describe('companyCodesOf', () => {
  it('splits a comma-separated list and drops blanks', () => {
    expect(companyCodesOf('nidhi-impex, silver-star')).toEqual(['nidhi-impex', 'silver-star']);
    expect(companyCodesOf('')).toEqual([]);
    expect(companyCodesOf(null)).toEqual([]);
  });
});

describe('scopeFor', () => {
  it('leaves a super admin unscoped', () => {
    expect(scopeFor(superAdmin)).toEqual({ companyCodes: null, unit: null });
  });

  /** The divergence: Laravel exempts role 1 entirely. */
  it('scopes role 1 to their own companies', () => {
    expect(scopeFor(admin1)).toEqual({ companyCodes: ['nidhi-impex'], unit: null });
  });

  it('scopes role 2 to company and unit', () => {
    expect(scopeFor(admin2)).toEqual({ companyCodes: ['nidhi-impex'], unit: 'Ichapur' });
  });

  it('honours a multi-company grant', () => {
    expect(scopeFor(multi).companyCodes).toEqual(['nidhi-impex', 'silver-star']);
  });

  it.each(['all', 'all-companies'])('treats %j as unscoped', (code) => {
    expect(scopeFor({ id: 1, role: 1, company_code: code }).companyCodes).toBeNull();
  });

  it('gives an admin with no company an empty scope, not a full one', () => {
    // Matches AuthorizedUserQuery's whereRaw('1 = 0') — failing closed.
    expect(scopeFor({ id: 1, role: 2, company_code: '' }).companyCodes).toEqual([]);
  });
});

describe('inManagedScope', () => {
  it('lets a super admin reach anything', () => {
    expect(inManagedScope(superAdmin, employee({ company_code: 'silver-star' }))).toBe(true);
  });

  it('confines role 1 to their companies', () => {
    expect(inManagedScope(admin1, employee())).toBe(true);
    expect(inManagedScope(admin1, employee({ company_code: 'silver-star' }))).toBe(false);
  });

  it('confines role 2 to company and unit', () => {
    expect(inManagedScope(admin2, employee())).toBe(true);
    expect(inManagedScope(admin2, employee({ unit: 'Daduk' }))).toBe(false);
  });
});

describe('list and show agree on scope', () => {
  let repo: FakeRepo;
  let service: EmployeeService;

  beforeEach(() => {
    repo = new FakeRepo([
      employee({ id: 1, company_code: 'nidhi-impex' }),
      employee({ id: 2, company_code: 'silver-star', name: 'Other Co Worker' }),
    ]);
    service = new EmployeeService(repo);
  });

  it('a role 1 admin does not see another company in the list', async () => {
    const { result } = await service.list(admin1, QUERY);

    // Laravel returns both rows here while show() 404s the second — the
    // inconsistency this port deliberately closes.
    expect(result.rows.map((r) => r.id)).toEqual([1]);
  });

  it('and cannot open it either', async () => {
    await expect(service.show(admin1, 2)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('a super admin sees both', async () => {
    const { result } = await service.list(superAdmin, QUERY);
    expect(result.rows).toHaveLength(2);
  });

  it('404s a missing record the same way as an out-of-scope one', async () => {
    // A 403 would confirm the record exists across a company boundary.
    await expect(service.show(admin1, 404404)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('Aadhaar handling', () => {
  it('normalises a formatted number to digits', () => {
    expect(withSafeAadhaar({ aadhar_card_no: '7151 1598 1345' }).aadhar_card_no).toBe(AADHAAR);
  });

  it.each(['12345', '', 'not a number'])('drops the unusable value %j', (bad) => {
    // Dropped rather than stored, so a half-typed value cannot overwrite a
    // stored one.
    expect(withSafeAadhaar({ aadhar_card_no: bad })).not.toHaveProperty('aadhar_card_no');
  });

  it('drops a non-scalar', () => {
    expect(withSafeAadhaar({ aadhar_card_no: { a: 1 } })).not.toHaveProperty('aadhar_card_no');
  });

  it('leaves the payload untouched when the field is absent', () => {
    expect(withSafeAadhaar({ name: 'X' })).toEqual({ name: 'X' });
  });

  it('discloses your own number, and one you manage', () => {
    expect(mayDiscloseAadhaar({ id: 1, role: 3 }, employee({ id: 1 }))).toBe(true);
    expect(mayDiscloseAadhaar(admin1, employee())).toBe(true);
  });

  it('withholds one you cannot reach', () => {
    expect(mayDiscloseAadhaar(admin1, employee({ company_code: 'silver-star' }))).toBe(false);
    expect(mayDiscloseAadhaar(null, employee())).toBe(false);
  });

  it('never returns the raw column, only the mask and the full value', async () => {
    const service = new EmployeeService(new FakeRepo());
    const { result } = await service.list(superAdmin, QUERY);

    expect(result.rows[0]).not.toHaveProperty('aadhar_card_no');
    expect(result.rows[0]).not.toHaveProperty('password');
    expect(result.rows[0]!.aadhaar_masked).toBe('XXXX XXXX 1345');
    expect(result.rows[0]!.aadhaar_full).toBe(AADHAAR);
  });

  it('counts what it disclosed, for the audit entry', async () => {
    const service = new EmployeeService(new FakeRepo());
    expect((await service.list(superAdmin, QUERY)).disclosed).toBe(1);
  });

  it('discloses nothing to an admin who cannot reach the rows', async () => {
    const repo = new FakeRepo([employee({ company_code: 'silver-star' })]);
    const { disclosed } = await new EmployeeService(repo).list(admin1, QUERY);
    expect(disclosed).toBe(0);
  });
});

describe('guardPrivilegedFields', () => {
  it('lets a super admin set anything', () => {
    expect(guardPrivilegedFields(superAdmin, { role: 0, company_code: 'x' })).toEqual({
      role: 0,
      company_code: 'x',
    });
  });

  it('blocks promotion to super admin', () => {
    expect(guardPrivilegedFields(admin1, { role: 0, name: 'X' })).toEqual({ name: 'X' });
  });

  it('stops role 1 moving a record between companies', () => {
    expect(guardPrivilegedFields(admin1, { company_code: 'silver-star' })).toEqual({});
  });

  it('stops role 2 changing company or unit', () => {
    expect(guardPrivilegedFields(admin2, { company_code: 'x', unit: 'y', name: 'Z' })).toEqual({
      name: 'Z',
    });
  });

  it('leaves an ordinary role change alone', () => {
    expect(guardPrivilegedFields(admin1, { role: 3 })).toEqual({ role: 3 });
  });
});

describe('create', () => {
  let repo: FakeRepo;
  let service: EmployeeService;

  beforeEach(() => {
    repo = new FakeRepo([]);
    service = new EmployeeService(repo);
  });

  const valid = { name: 'New Worker', company_code: 'nidhi-impex', unit: 'Ichapur', role: 3 };

  it('creates an employee', async () => {
    await expect(service.create(admin1, valid)).resolves.toMatchObject({ name: 'New Worker' });
  });

  it('refuses an admin account unless the caller is a super admin', async () => {
    await expect(
      service.create(admin1, { ...valid, role: 1, email: 'a@b.co', password: 'secret123' }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      service.create(superAdmin, { ...valid, role: 1, email: 'a@b.co', password: 'secret123' }),
    ).resolves.toBeDefined();
  });

  it('requires email and password for a privileged account', async () => {
    // Those accounts sign in with email + password directly; there is no
    // emp_code self-claim path for them.
    await expect(service.create(superAdmin, { ...valid, role: 0 })).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('requires a unit for an ordinary employee but not for an agent', async () => {
    await expect(
      service.create(admin1, { name: 'X', company_code: 'c', role: 3 }),
    ).rejects.toMatchObject({ statusCode: 422 });

    await expect(
      service.create(admin1, { name: 'X', company_code: 'c', role: 4 }),
    ).resolves.toBeDefined();
  });

  it('refuses an Aadhaar already assigned to someone else', async () => {
    repo.rows.push(employee({ id: 5, name: 'Existing Person' }));

    await expect(
      service.create(admin1, { ...valid, aadhar_card_no: AADHAAR }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: 'This Aadhaar number is already assigned to Existing Person',
    });
  });

  it('refuses a duplicate email', async () => {
    repo.rows.push(employee({ id: 6, email: 'taken@test.local' }));
    await expect(
      service.create(admin1, { ...valid, email: 'taken@test.local' }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('update', () => {
  let repo: FakeRepo;
  let service: EmployeeService;

  beforeEach(() => {
    // Distinct Aadhaars: two live employees sharing one is a state the app
    // forbids, so a fixture with duplicates tests an impossible database.
    repo = new FakeRepo([
      employee(),
      employee({ id: 2, company_code: 'silver-star', aadhar_card_no: '999988887777' }),
    ]);
    service = new EmployeeService(repo);
  });

  it('updates a record in scope', async () => {
    await service.update(admin1, 1, { name: 'Renamed' });
    expect(repo.updated[0]).toMatchObject({ id: 1, data: { name: 'Renamed' } });
  });

  it('404s a record out of scope', async () => {
    await expect(service.update(admin1, 2, { name: 'Renamed' })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repo.updated).toEqual([]);
  });

  it('strips privileged fields on the way through', async () => {
    await service.update(admin1, 1, { name: 'X', role: 0, company_code: 'silver-star' });

    expect(repo.updated[0]!.data).toEqual({ name: 'X' });
  });

  it('lets an employee keep their own Aadhaar', async () => {
    await service.update(admin1, 1, { aadhar_card_no: '7151 1598 1345' });
    expect(repo.updated[0]!.data.aadhar_card_no).toBe(AADHAAR);
  });

  it('refuses one already held by another employee', async () => {
    repo.rows.push(employee({ id: 7, name: 'Someone Else', aadhar_card_no: '123456789012' }));

    await expect(
      service.update(admin1, 1, { aadhar_card_no: '1234 5678 9012' }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('delete', () => {
  let repo: FakeRepo;
  let service: EmployeeService;

  beforeEach(() => {
    // Distinct Aadhaars: two live employees sharing one is a state the app
    // forbids, so a fixture with duplicates tests an impossible database.
    repo = new FakeRepo([
      employee(),
      employee({ id: 2, company_code: 'silver-star', aadhar_card_no: '999988887777' }),
    ]);
    service = new EmployeeService(repo);
  });

  it('deletes a record in scope', async () => {
    await service.remove(admin1, 1);
    expect(repo.removed).toEqual([1]);
  });

  it('404s a record out of scope', async () => {
    await expect(service.remove(admin1, 2)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.removed).toEqual([]);
  });

  it('bulk-deletes only what the caller may reach', async () => {
    const count = await service.removeMany(admin1, [1, 2]);

    // The out-of-scope id is skipped rather than failing the whole batch.
    expect(count).toBe(1);
    expect(repo.removed).toEqual([1]);
  });

  it('rejects an empty batch', async () => {
    await expect(service.removeMany(admin1, [])).rejects.toMatchObject({ statusCode: 422 });
  });
});
