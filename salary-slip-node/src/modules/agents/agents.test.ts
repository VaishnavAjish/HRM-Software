import { describe, it, expect, beforeEach } from 'vitest';

import { AgentService, type AgentRepository } from './agents.service.js';
import type { Actor, EmployeeRow, EmployeeScope } from '../employees/employees.service.js';

/**
 * Agents.
 *
 * The divergence pinned here is scope on update and delete: PHP resolves the
 * target with `User::where('type','agent')->find($id)` and no company check,
 * so an admin of one company can rename, re-password or delete another
 * company's agent.
 */

const AADHAAR = '715115981345';

const agent = (over: Partial<EmployeeRow> = {}): EmployeeRow =>
  ({
    id: 10,
    name: 'Asha Agent',
    email: 'asha@test.local',
    emp_code: 'AG1',
    mobile_number: '9876543210',
    company_code: 'nidhi-impex',
    unit: 'Ichapur',
    type: 'agent',
    role: 4,
    status: '0',
    is_deleted: '0',
    ...over,
  }) as EmployeeRow;

const candidate = (over: Partial<EmployeeRow> = {}): EmployeeRow =>
  ({
    id: 50,
    name: 'Candidate One',
    email: 'cand@test.local',
    company_code: 'nidhi-impex',
    unit: 'Ichapur',
    type: 'trial',
    role: 3,
    status: '0',
    is_deleted: '0',
    aadhar_card_no: AADHAAR,
    ...over,
  }) as EmployeeRow;

class FakeRepo implements AgentRepository {
  updated: { id: number; data: Record<string, unknown> }[] = [];
  removed: number[] = [];
  listArgs: { scope: EmployeeScope; requested: string[] | null } | null = null;

  constructor(
    public agents: EmployeeRow[] = [agent()],
    public cands: EmployeeRow[] = [candidate()],
    public takenEmails: string[] = [],
    public takenMobiles: string[] = [],
  ) {}

  async list(scope: EmployeeScope, requested: string[] | null) {
    this.listArgs = { scope, requested };
    let rows = this.agents;
    if (scope.companyCodes !== null) {
      rows = rows.filter((r) => scope.companyCodes!.includes(String(r.company_code)));
    }
    if (scope.unit) rows = rows.filter((r) => r.unit === scope.unit);
    if (requested) rows = rows.filter((r) => requested.includes(String(r.company_code)));
    return rows;
  }
  async candidatesFor() {
    return this.cands;
  }
  async findAgent(id: number) {
    return this.agents.find((a) => a.id === id) ?? null;
  }
  async update(id: number, data: Record<string, unknown>) {
    this.updated.push({ id, data });
    return { ...this.agents.find((a) => a.id === id)!, ...data } as EmployeeRow;
  }
  async remove(id: number) {
    this.removed.push(id);
  }
  async emailTaken(email: string) {
    return this.takenEmails.includes(email);
  }
  async mobileTaken(mobile: string) {
    return this.takenMobiles.includes(mobile);
  }
}

const hasher = { make: async (p: string) => `hashed:${p}` };

const superAdmin: Actor = { id: 900, role: 0, company_code: 'nidhi-impex' };
const admin1: Actor = { id: 901, role: 1, company_code: 'nidhi-impex' };
const admin2: Actor = { id: 902, role: 2, company_code: 'nidhi-impex', unit: 'Ichapur' };
const theAgent: Actor = { id: 10, role: 4, type: 'agent', company_code: 'nidhi-impex' };

let repo: FakeRepo;
let service: AgentService;

beforeEach(() => {
  repo = new FakeRepo();
  service = new AgentService(repo, hasher);
});

const valid = {
  name: 'Asha Renamed',
  email: 'asha@test.local',
  mobile_number: '9876543210',
  company_code: 'nidhi-impex',
};

describe('list', () => {
  it('scopes role 1 to their company', async () => {
    repo.agents = [agent(), agent({ id: 11, company_code: 'silver-star' })];

    const rows = await service.list(admin1, null);

    expect(rows.map((r) => r.id)).toEqual([10]);
  });

  it('scopes role 2 to company and unit', async () => {
    repo.agents = [agent(), agent({ id: 11, unit: 'Daduk' })];

    expect((await service.list(admin2, null)).map((r) => r.id)).toEqual([10]);
  });

  it('lets a super admin filter by company', async () => {
    repo.agents = [agent(), agent({ id: 11, company_code: 'silver-star' })];

    expect((await service.list(superAdmin, 'silver-star')).map((r) => r.id)).toEqual([11]);
  });

  it("treats 'all' as no filter", async () => {
    repo.agents = [agent(), agent({ id: 11, company_code: 'silver-star' })];

    expect(await service.list(superAdmin, 'all')).toHaveLength(2);
    expect(repo.listArgs!.requested).toBeNull();
  });

  it('ignores a company filter from a scoped admin', async () => {
    // Their own scope wins; the parameter cannot widen it.
    await service.list(admin1, 'silver-star');
    expect(repo.listArgs!.requested).toBeNull();
    expect(repo.listArgs!.scope.companyCodes).toEqual(['nidhi-impex']);
  });

  it('never exposes the password hash', async () => {
    const rows = await service.list(superAdmin, null);
    expect(rows[0]).not.toHaveProperty('password');
  });
});

describe('candidates', () => {
  it('returns what the agent submitted, with the full Aadhaar', async () => {
    const { rows, disclosed } = await service.candidates(theAgent);

    // Narrowest scope in the app: rows this agent created.
    expect(rows[0]!.aadhaar_full).toBe(AADHAAR);
    expect(rows[0]!.aadhaar_masked).toBe('XXXX XXXX 1345');
    expect(disclosed).toBe(1);
  });

  it('never exposes the raw column', async () => {
    const { rows } = await service.candidates(theAgent);
    expect(rows[0]).not.toHaveProperty('aadhar_card_no');
  });

  it('counts nothing when there is no usable number', async () => {
    repo.cands = [candidate({ aadhar_card_no: '12345' })];

    const { rows, disclosed } = await service.candidates(theAgent);

    expect(disclosed).toBe(0);
    expect(rows[0]).not.toHaveProperty('aadhaar_full');
  });
});

describe('update', () => {
  it('updates an agent in scope', async () => {
    await service.update(admin1, 10, valid);
    expect(repo.updated[0]!.data).toMatchObject({ name: 'Asha Renamed' });
  });

  /** The divergence: PHP has no company check here at all. */
  it('404s an agent belonging to another company', async () => {
    repo.agents = [agent({ company_code: 'silver-star' })];

    await expect(service.update(admin1, 10, valid)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Agent not found',
    });
    expect(repo.updated).toEqual([]);
  });

  it('lets a super admin update any company\'s agent', async () => {
    repo.agents = [agent({ company_code: 'silver-star' })];

    await expect(
      service.update(superAdmin, 10, { ...valid, company_code: 'silver-star' }),
    ).resolves.toBeDefined();
  });

  it('404s a missing agent the same way', async () => {
    await expect(service.update(admin1, 999, valid)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects an email held by someone else', async () => {
    repo.takenEmails = ['asha@test.local'];
    await expect(service.update(admin1, 10, valid)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('rejects a mobile held by someone else', async () => {
    repo.takenMobiles = ['9876543210'];
    await expect(service.update(admin1, 10, valid)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('requires the mandatory fields', async () => {
    await expect(service.update(admin1, 10, { name: 'X' })).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('hashes a supplied password', async () => {
    await service.update(admin1, 10, { ...valid, password: 'secret123' });
    expect(repo.updated[0]!.data.password).toBe('hashed:secret123');
  });

  it.each([undefined, ''])('leaves the password alone when %j', async (password) => {
    // An empty field must not blank an agent's password.
    await service.update(admin1, 10, { ...valid, password });
    expect(repo.updated[0]!.data).not.toHaveProperty('password');
  });

  it('never returns the hash', async () => {
    const updated = await service.update(admin1, 10, { ...valid, password: 'secret123' });
    expect(updated).not.toHaveProperty('password');
  });
});

describe('delete', () => {
  it('deletes an agent in scope', async () => {
    await service.remove(admin1, 10);
    expect(repo.removed).toEqual([10]);
  });

  it('404s an agent belonging to another company', async () => {
    repo.agents = [agent({ company_code: 'silver-star' })];

    await expect(service.remove(admin1, 10)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.removed).toEqual([]);
  });

  it('404s a missing agent', async () => {
    await expect(service.remove(admin1, 999)).rejects.toMatchObject({ statusCode: 404 });
  });
});
