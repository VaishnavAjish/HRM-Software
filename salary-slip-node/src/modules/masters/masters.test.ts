import { describe, it, expect, beforeEach } from 'vitest';

import {
  ResourceService,
  ResourceError,
  branchDefinition,
  locationDefinition,
  approvalLevelDefinition,
  type ResourceRepository,
  type ResourceRow,
} from './masters.service.js';
import { ShiftService, scopeFor, type ShiftRepository, type ShiftRow } from '../shifts/shifts.service.js';
import { SettingsService, SETTING_DEFAULTS, type SettingsRepository } from '../settings/settings.service.js';
import { formatTime, parseTime, isValidTimeOfDay } from '../../lib/laravel/time.js';
import { clientIp } from '../../lib/audit/audit-logger.js';
import type { FastifyRequest } from 'fastify';

/**
 * Module 2 — the RBAC lookup resources, shifts and settings.
 *
 * Characterisation tests for the PHP side live in
 * salary-slip-bac/tests/Feature/MasterResourceTest.php; these assert the port
 * against what those recorded.
 */

// ---- time compatibility ---------------------------------------------------

describe('Postgres time columns', () => {
  it('formats a Prisma Date back to the string PHP returns', () => {
    // Postgres ::text gives "09:00:00"; Prisma gives a Date at 1970-01-01.
    expect(formatTime(new Date(Date.UTC(1970, 0, 1, 9, 0, 0)))).toBe('09:00:00');
  });

  it('reads the clock in UTC, not local time', () => {
    // getHours() would shift every displayed shift by the server's offset.
    const d = new Date(Date.UTC(1970, 0, 1, 23, 30, 0));
    expect(formatTime(d)).toBe('23:30:00');
  });

  it('passes a string through untouched', () => {
    expect(formatTime('09:00:00')).toBe('09:00:00');
  });

  it('handles null', () => {
    expect(formatTime(null)).toBeNull();
  });

  it('parses both H:i and H:i:s, as the validator allows', () => {
    expect(formatTime(parseTime('09:00'))).toBe('09:00:00');
    expect(formatTime(parseTime('9:05'))).toBe('09:05:00');
    expect(formatTime(parseTime('18:30:45'))).toBe('18:30:45');
  });

  it.each(['', '25:00', '09:60', 'noon', '09', '09:0'])('rejects %j', (bad) => {
    expect(isValidTimeOfDay(bad)).toBe(false);
  });
});

// ---- audit ---------------------------------------------------------------

describe('clientIp', () => {
  const req = (headers: Record<string, string>, ip = '10.0.0.1') =>
    ({ headers, ip }) as unknown as FastifyRequest;

  it('prefers the left-most X-Forwarded-For entry', () => {
    // Behind nginx every request would otherwise be logged as the proxy.
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.9, 10.0.0.5' }))).toBe('203.0.113.9');
  });

  it('falls back to X-Real-IP, then the socket', () => {
    expect(clientIp(req({ 'x-real-ip': '203.0.113.7' }))).toBe('203.0.113.7');
    expect(clientIp(req({}))).toBe('10.0.0.1');
  });
});

// ---- master resources -----------------------------------------------------

class FakeResourceRepo implements ResourceRepository {
  constructor(public rows: ResourceRow[] = []) {}
  private nextId = 100;

  async list() {
    return this.rows;
  }
  async find(id: number) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async create(data: Record<string, unknown>) {
    const row = { id: this.nextId++, ...data };
    this.rows.push(row);
    return row;
  }
  async update(id: number, data: Record<string, unknown>) {
    const row = this.rows.find((r) => r.id === id)!;
    Object.assign(row, data);
    return row;
  }
  async remove(id: number) {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
  async existsWith(field: string, value: unknown, exceptId?: number) {
    return this.rows.some((r) => r[field] === value && r.id !== exceptId);
  }
}

describe('master resources', () => {
  let repo: FakeResourceRepo;
  let branches: ResourceService;

  beforeEach(() => {
    repo = new FakeResourceRepo([{ id: 1, name: 'Head Office', code: 'HO', location_id: null }]);
    branches = new ResourceService(repo, branchDefinition);
  });

  it('creates a branch', async () => {
    const created = await branches.create({ name: 'Depot', code: 'DP' });
    expect(created.code).toBe('DP');
  });

  it('refuses a duplicate code with 422', async () => {
    await expect(branches.create({ name: 'Another', code: 'HO' })).rejects.toMatchObject({
      statusCode: 422,
      message: 'The code has already been taken.',
    });
  });

  /**
   * The divergence from Laravel.
   *
   * BaseResourceController reuses one $rules array for store and update, so
   * BranchController's 'unique:branches,code' has no ->ignore($id) and an edit
   * that keeps the record's own code is compared against itself. Renaming a
   * branch is therefore impossible unless its code changes too — confirmed
   * against the real endpoint in MasterResourceTest.
   */
  it('allows a rename that keeps the branch its own code', async () => {
    const { after } = await branches.update(1, { name: 'Head Office (Renamed)', code: 'HO' });
    expect(after.name).toBe('Head Office (Renamed)');
  });

  it('still refuses taking another branch\'s code', async () => {
    repo.rows.push({ id: 2, name: 'Depot', code: 'DP' });

    await expect(branches.update(1, { name: 'Head Office', code: 'DP' })).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('returns before and after so the change can be audited', async () => {
    const { before, after } = await branches.update(1, { name: 'Renamed', code: 'HO' });
    expect(before.name).toBe('Head Office');
    expect(after.name).toBe('Renamed');
  });

  it('404s an unknown id on update and delete', async () => {
    await expect(branches.update(999, { name: 'X', code: 'X1' })).rejects.toMatchObject({
      statusCode: 404,
      message: 'Branch not found',
    });
    await expect(branches.remove(999)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('reports the first validation message as a string', async () => {
    await expect(branches.create({ code: 'X' })).rejects.toMatchObject({
      statusCode: 422,
      message: 'The name field is required.',
    });
  });

  it('accepts a location with optional fields omitted', async () => {
    const locations = new ResourceService(new FakeResourceRepo(), locationDefinition);
    const created = await locations.create({ name: 'Rajkot' });

    expect(created).toMatchObject({ name: 'Rajkot', type: null, city: null });
  });

  it('restricts an approval level type', async () => {
    const levels = new ResourceService(new FakeResourceRepo(), approvalLevelDefinition);

    // The column also carries a CHECK constraint Prisma cannot see, so an
    // unvalidated value would reach Postgres and surface as a raw 500.
    await expect(
      levels.create({ name: 'Bad', level: 1, type: 'Something Else' }),
    ).rejects.toMatchObject({ statusCode: 422 });

    await expect(levels.create({ name: 'Good', level: 1, type: 'Auto Approval' })).resolves
      .toBeDefined();
  });

  it('requires a level of at least 1', async () => {
    const levels = new ResourceService(new FakeResourceRepo(), approvalLevelDefinition);
    await expect(
      levels.create({ name: 'X', level: 0, type: 'Auto Approval' }),
    ).rejects.toBeInstanceOf(ResourceError);
  });
});

// ---- shifts ---------------------------------------------------------------

class FakeShiftRepo implements ShiftRepository {
  assigned: { ids: number[]; shiftId: number | null; company: string | null }[] = [];
  removed: number[] = [];
  constructor(public rows: ShiftRow[] = []) {}

  async list(scope: { companyCode: string | null; unit: string | null }) {
    return this.rows.filter(
      (r) =>
        (!scope.companyCode || r.company_code === scope.companyCode) &&
        (!scope.unit || r.unit === scope.unit),
    );
  }
  async find(id: number) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async create(data: Record<string, unknown>) {
    const row = { id: 50, employees_count: 0, ...data } as unknown as ShiftRow;
    this.rows.push(row);
    return row;
  }
  async update(id: number, data: Record<string, unknown>) {
    const row = this.rows.find((r) => r.id === id)!;
    Object.assign(row, data);
    return row;
  }
  async remove(id: number) {
    this.removed.push(id);
    this.rows = this.rows.filter((r) => r.id !== id);
  }
  async shiftExists(id: number) {
    return this.rows.some((r) => r.id === id);
  }
  async assign(ids: number[], shiftId: number | null, company: string | null) {
    this.assigned.push({ ids, shiftId, company });
    return ids.length;
  }
}

const shiftRow = (over: Partial<ShiftRow> = {}): ShiftRow =>
  ({
    id: 1,
    name: 'General',
    company_code: 'nidhi-impex',
    unit: 'Ichapur',
    start_time: '09:00:00',
    end_time: '18:00:00',
    grace_minutes: 10,
    description: null,
    employees_count: 0,
    ...over,
  }) as ShiftRow;

describe('scopeFor — company scoping', () => {
  it('pins role 1 to their company but lets them filter by unit', () => {
    expect(
      scopeFor({ role: 1, company_code: 'nidhi-impex' }, { companyCode: 'other', unit: 'Daduk' }),
    ).toEqual({ companyCode: 'nidhi-impex', unit: 'Daduk' });
  });

  it('pins role 2 to both company and unit', () => {
    expect(
      scopeFor(
        { role: 2, company_code: 'nidhi-impex', unit: 'Ichapur' },
        { companyCode: 'other', unit: 'Daduk' },
      ),
    ).toEqual({ companyCode: 'nidhi-impex', unit: 'Ichapur' });
  });

  it('lets a super admin ask for anything', () => {
    expect(scopeFor({ role: 0 }, { companyCode: 'silver-star', unit: null })).toEqual({
      companyCode: 'silver-star',
      unit: null,
    });
  });

  it('treats an anonymous caller as unscoped, as PHP does', () => {
    expect(scopeFor(null, { companyCode: null, unit: null })).toEqual({
      companyCode: null,
      unit: null,
    });
  });
});

describe('shifts', () => {
  let repo: FakeShiftRepo;
  let service: ShiftService;

  beforeEach(() => {
    repo = new FakeShiftRepo([shiftRow()]);
    service = new ShiftService(repo);
  });

  const valid = {
    name: 'Night',
    company_code: 'nidhi-impex',
    start_time: '22:00',
    end_time: '06:00',
  };

  it('creates a shift', async () => {
    await expect(service.create(valid)).resolves.toMatchObject({ name: 'Night' });
  });

  it('rejects a malformed time', async () => {
    await expect(service.create({ ...valid, start_time: '25:00' })).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('rejects a grace period outside 0..180', async () => {
    await expect(service.create({ ...valid, grace_minutes: 999 })).rejects.toBeInstanceOf(
      ResourceError,
    );
  });

  it('defaults grace_minutes to 0', async () => {
    const created = await service.create(valid);
    expect(created.grace_minutes).toBe(0);
  });

  it('404s an unknown shift on update and delete', async () => {
    await expect(service.update(999, valid)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.remove(999)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deletes, which unassigns its employees', async () => {
    await service.remove(1);
    // The repository detaches employees in the same transaction; a removed
    // shift must not strand people on an id that no longer resolves.
    expect(repo.removed).toEqual([1]);
  });

  it('assigns a shift to employees', async () => {
    const message = await service.assign({ shift_id: 1, employee_ids: [7, 8] }, { role: 0 }, {
      companyCode: null,
      unit: null,
    });

    expect(message).toBe('2 employee(s) updated');
    expect(repo.assigned[0]).toMatchObject({ ids: [7, 8], shiftId: 1 });
  });

  it('clears the shift when shift_id is null', async () => {
    await service.assign({ shift_id: null, employee_ids: [7] }, { role: 0 }, {
      companyCode: null,
      unit: null,
    });

    expect(repo.assigned[0]!.shiftId).toBeNull();
  });

  it('refuses an unknown shift_id rather than writing a dangling reference', async () => {
    await expect(
      service.assign({ shift_id: 999, employee_ids: [7] }, { role: 0 }, {
        companyCode: null,
        unit: null,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('requires at least one employee', async () => {
    await expect(
      service.assign({ shift_id: 1, employee_ids: [] }, { role: 0 }, {
        companyCode: null,
        unit: null,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('confines a role 1 assignment to their own company', async () => {
    await service.assign(
      { shift_id: 1, employee_ids: [7] },
      { role: 1, company_code: 'nidhi-impex' },
      { companyCode: 'silver-star', unit: null },
    );

    // The requested company is ignored in favour of the caller's own.
    expect(repo.assigned[0]!.company).toBe('nidhi-impex');
  });
});

// ---- settings -------------------------------------------------------------

class FakeSettingsRepo implements SettingsRepository {
  constructor(public stored: Record<string, string> = {}) {}
  async valuesFor() {
    return this.stored;
  }
  async upsert(key: string, value: string) {
    this.stored[key] = value;
  }
}

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    const service = new SettingsService(new FakeSettingsRepo());
    const rows = await service.list('rbac');

    expect(rows.find((r) => r.key === 'rbac.require_2fa')?.value).toBe('false');
    expect(rows.every((r) => r.group === 'rbac')).toBe(true);
  });

  it('overlays stored values on the defaults', async () => {
    const service = new SettingsService(new FakeSettingsRepo({ 'rbac.require_2fa': 'true' }));
    const rows = await service.list('rbac');

    expect(rows.find((r) => r.key === 'rbac.require_2fa')?.value).toBe('true');
    // Untouched settings still come back at their default.
    expect(rows.find((r) => r.key === 'rbac.session_timeout_minutes')?.value).toBe('60');
  });

  it('filters by group prefix', async () => {
    const service = new SettingsService(new FakeSettingsRepo());

    const rbac = await service.list('rbac');
    const dashboard = await service.list('dashboard');

    expect(rbac.every((r) => r.key.startsWith('rbac.'))).toBe(true);
    expect(dashboard.every((r) => r.key.startsWith('dashboard.'))).toBe(true);
    expect(rbac.length + dashboard.length).toBe(Object.keys(SETTING_DEFAULTS).length);
  });

  it('values are strings, not booleans', async () => {
    // The column is text and the client compares against "true"/"false".
    const rows = await new SettingsService(new FakeSettingsRepo()).list('rbac');
    expect(rows.every((r) => typeof r.value === 'string')).toBe(true);
  });

  it('persists a batch and reports before and after', async () => {
    const repo = new FakeSettingsRepo({ 'rbac.require_2fa': 'false' });
    const service = new SettingsService(repo);

    const { before, after } = await service.update('rbac', {
      settings: [{ key: 'rbac.require_2fa', value: 'true' }],
    });

    expect(before['rbac.require_2fa']).toBe('false');
    expect(after['rbac.require_2fa']).toBe('true');
    expect(repo.stored['rbac.require_2fa']).toBe('true');
  });

  it('treats a null value as an empty string, as Laravel does', async () => {
    const repo = new FakeSettingsRepo();
    await new SettingsService(repo).update('rbac', {
      settings: [{ key: 'rbac.require_2fa', value: null }],
    });

    expect(repo.stored['rbac.require_2fa']).toBe('');
  });

  it('rejects a malformed payload', async () => {
    const service = new SettingsService(new FakeSettingsRepo());
    await expect(service.update('rbac', {})).rejects.toMatchObject({ statusCode: 422 });
    await expect(service.update('rbac', { settings: [] })).rejects.toMatchObject({
      statusCode: 422,
    });
  });
});
