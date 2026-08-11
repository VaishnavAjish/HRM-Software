import { describe, it, expect, beforeEach } from 'vitest';

import {
  TrialFormService,
  trialFormScopeFor,
  stripProtectedFields,
  TRIAL_FORM_PROTECTED_FIELDS,
  type TrialFormRepository,
  type TrialFormScope,
} from './trialforms.service.js';
import type { Actor, EmployeeRow, EmployeeScope } from '../employees/employees.service.js';

/**
 * Trial forms.
 *
 * The protected-field list is the security-relevant part: User::$fillable is
 * shared with employee creation, so an unfiltered update on a route agents can
 * reach would let one set role, password or company_code on any row they can
 * see. That was a live privilege-escalation path before it was fixed in PHP,
 * and these tests keep the port from reintroducing it.
 */

const AADHAAR = '715115981345';

const form = (over: Partial<EmployeeRow> = {}): EmployeeRow =>
  ({
    id: 20,
    name: 'Trial Candidate',
    email: 'trial@test.local',
    company_code: 'nidhi-impex',
    unit: 'Ichapur',
    type: 'trial',
    role: 3,
    processed: false,
    added_by: 10,
    status: '0',
    is_deleted: '0',
    aadhar_card_no: AADHAAR,
    ...over,
  }) as EmployeeRow;

class FakeRepo implements TrialFormRepository {
  created: Record<string, unknown>[] = [];
  updated: { id: number; data: Record<string, unknown> }[] = [];
  removed: number[] = [];
  lastScope: TrialFormScope | null = null;

  constructor(public rows: EmployeeRow[] = [form()]) {}

  async list(scope: EmployeeScope, requested: string[] | null, unit: string | null) {
    let rows = this.rows;
    if (scope.companyCodes !== null) {
      rows = rows.filter((r) => scope.companyCodes!.includes(String(r.company_code)));
    }
    if (scope.unit) rows = rows.filter((r) => r.unit === scope.unit);
    if (requested) rows = rows.filter((r) => requested.includes(String(r.company_code)));
    if (unit) rows = rows.filter((r) => r.unit === unit);
    return rows;
  }
  async findForActor(id: number, scope: TrialFormScope) {
    this.lastScope = scope;
    const row = this.rows.find((r) => r.id === id);
    if (!row) return null;
    if (scope.addedBy !== null && row.added_by !== scope.addedBy) return null;
    if (scope.companyCodes !== null && !scope.companyCodes.includes(String(row.company_code))) {
      return null;
    }
    if (scope.unit && row.unit !== scope.unit) return null;
    return row;
  }
  async create(data: Record<string, unknown>) {
    this.created.push(data);
    return { ...form(), id: 99, ...data } as EmployeeRow;
  }
  async update(id: number, data: Record<string, unknown>) {
    this.updated.push({ id, data });
    return { ...this.rows.find((r) => r.id === id)!, ...data } as EmployeeRow;
  }
  async remove(id: number) {
    this.removed.push(id);
  }
}

const superAdmin: Actor = { id: 900, role: 0, company_code: 'nidhi-impex' };
const admin1: Actor = { id: 901, role: 1, company_code: 'nidhi-impex' };
const admin2: Actor = { id: 902, role: 2, company_code: 'nidhi-impex', unit: 'Ichapur' };
const agent: Actor = { id: 10, role: 4, type: 'agent', company_code: 'nidhi-impex' };
const otherAgent: Actor = { id: 11, role: 4, type: 'agent', company_code: 'nidhi-impex' };

let repo: FakeRepo;
let service: TrialFormService;
/*
 * Provisioning is stubbed, not mocked away.
 *
 * These tests run against a fake repository with no database behind it, so the
 * real provisioner would fail on a foreign key for a user that was never
 * inserted. Recording the calls keeps the assertion that matters — a trial form
 * gets the employee tier, and gets it from the server rather than the payload.
 */
const provisioned: Array<{ userId: number; tier: number; companyCode: string | null }> = [];

beforeEach(() => {
  repo = new FakeRepo();
  provisioned.length = 0;
  service = new TrialFormService(repo, {
    async provision(userId, tier, companyCode) {
      provisioned.push({ userId, tier, companyCode });
    },
  });
});

describe('stripProtectedFields', () => {
  it.each(TRIAL_FORM_PROTECTED_FIELDS)('drops %s', (field) => {
    expect(stripProtectedFields({ [field]: 'x', name: 'keep' })).toEqual({ name: 'keep' });
  });

  it('keeps the fields the form actually submits', () => {
    // The UI sends the form body, {print: 1} and {checkbox: 0|1}.
    expect(stripProtectedFields({ name: 'A', print: 1, checkbox: 1 })).toEqual({
      name: 'A',
      print: 1,
      checkbox: 1,
    });
  });
});

describe('trialFormScopeFor', () => {
  it('limits an agent to their own submissions', () => {
    expect(trialFormScopeFor(agent)).toEqual({ addedBy: 10, companyCodes: null, unit: null });
  });

  it('limits role 1 to their company', () => {
    expect(trialFormScopeFor(admin1)).toEqual({
      addedBy: null,
      companyCodes: ['nidhi-impex'],
      unit: null,
    });
  });

  it('limits role 2 to company and unit', () => {
    expect(trialFormScopeFor(admin2)).toEqual({
      addedBy: null,
      companyCodes: ['nidhi-impex'],
      unit: 'Ichapur',
    });
  });

  it('leaves a super admin unscoped', () => {
    expect(trialFormScopeFor(superAdmin)).toEqual({
      addedBy: null,
      companyCodes: null,
      unit: null,
    });
  });
});

describe('list', () => {
  it('discloses the full Aadhaar to a caller who may reach the row', async () => {
    const { rows, disclosed } = await service.list(admin1, null, null);

    expect(rows[0]!.aadhaar_full).toBe(AADHAAR);
    expect(disclosed).toBe(1);
  });

  it('never exposes the raw column', async () => {
    const { rows } = await service.list(admin1, null, null);
    expect(rows[0]).not.toHaveProperty('aadhar_card_no');
    expect(rows[0]).not.toHaveProperty('password');
  });

  it('scopes role 1 to their company', async () => {
    repo.rows = [form(), form({ id: 21, company_code: 'silver-star' })];
    const { rows } = await service.list(admin1, null, null);
    expect(rows.map((r) => r.id)).toEqual([20]);
  });

  it('filters by unit when asked', async () => {
    repo.rows = [form(), form({ id: 21, unit: 'Daduk' })];
    const { rows } = await service.list(superAdmin, null, 'Daduk');
    expect(rows.map((r) => r.id)).toEqual([21]);
  });

  it('lets a super admin filter by company', async () => {
    repo.rows = [form(), form({ id: 21, company_code: 'silver-star' })];
    const { rows } = await service.list(superAdmin, 'silver-star', null);
    expect(rows.map((r) => r.id)).toEqual([21]);
  });
});

describe('create', () => {
  it('stamps type, role and processed', async () => {
    await service.create(admin1, { name: 'New Candidate' });

    expect(repo.created[0]).toMatchObject({ type: 'trial', role: 3, processed: false });
  });

  it("stamps an agent's own id so the list can scope to it", async () => {
    await service.create(agent, { name: 'New Candidate' });
    expect(repo.created[0]!.added_by).toBe(10);
  });

  it('does not stamp added_by for an admin', async () => {
    await service.create(admin1, { name: 'New Candidate' });
    expect(repo.created[0]!.added_by).toBeUndefined();
  });

  it('falls back to the submitter\'s company', async () => {
    await service.create(admin1, { name: 'New Candidate' });
    expect(repo.created[0]!.company_code).toBe('nidhi-impex');
  });

  it('accepts an explicit company on create', async () => {
    // company_code is protected on edit but must be settable here.
    await service.create(superAdmin, { name: 'X', company_code: 'silver-star' });
    expect(repo.created[0]!.company_code).toBe('silver-star');
  });

  it('refuses when no company can be resolved', async () => {
    await expect(
      service.create({ id: 1, role: 1, company_code: '' }, { name: 'X' }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('cannot be used to grant a role', async () => {
    await service.create(agent, { name: 'X', role: 0, password: 'x', is_deleted: 1 });

    // role is forced to 3 and the rest are stripped before it is set.
    expect(repo.created[0]!.role).toBe(3);
    expect(repo.created[0]).not.toHaveProperty('password');
    expect(repo.created[0]).not.toHaveProperty('is_deleted');

    // And the canonical assignment follows the server's tier, not the body's.
    expect(provisioned).toHaveLength(1);
    expect(provisioned[0]!.tier).toBe(3);
  });

  it('provisions the canonical employee role with the form’s company', async () => {
    await service.create(admin1, { name: 'Candidate', company_code: 'silver-star' });

    expect(provisioned).toEqual([
      { userId: expect.any(Number), tier: 3, companyCode: 'silver-star' },
    ]);
  });
});

describe('update', () => {
  it('updates a form in scope', async () => {
    await service.update(admin1, 20, { name: 'Corrected' });
    expect(repo.updated[0]).toMatchObject({ id: 20, data: { name: 'Corrected' } });
  });

  it('strips privileged fields', async () => {
    await service.update(admin1, 20, { name: 'X', role: 0, company_code: 'silver-star' });
    expect(repo.updated[0]!.data).toEqual({ name: 'X' });
  });

  it('404s a form another agent submitted', async () => {
    await expect(service.update(otherAgent, 20, { name: 'X' })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repo.updated).toEqual([]);
  });

  it('404s a form in another company', async () => {
    repo.rows = [form({ company_code: 'silver-star' })];
    await expect(service.update(admin1, 20, { name: 'X' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('lets an agent edit their own', async () => {
    await expect(service.update(agent, 20, { name: 'Mine' })).resolves.toBeUndefined();
  });
});

describe('delete', () => {
  it('deletes a form in scope', async () => {
    await service.remove(admin1, 20);
    expect(repo.removed).toEqual([20]);
  });

  it('404s one belonging to another agent', async () => {
    await expect(service.remove(otherAgent, 20)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.removed).toEqual([]);
  });

  it('404s a missing form', async () => {
    await expect(service.remove(admin1, 999)).rejects.toMatchObject({ statusCode: 404 });
  });
});
