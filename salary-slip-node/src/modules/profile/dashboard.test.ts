import { describe, it, expect, beforeEach } from 'vitest';

import {
  DashboardService,
  type DashboardRepository,
  type SalarySlipRow,
} from './dashboard.service.js';
import type { Actor } from '../employees/employees.service.js';

/**
 * The employee dashboard.
 *
 * The scoping is the point: PHP matches salary slips on emp_code alone, and
 * emp_code is not unique across companies, so an employee sharing a code with
 * someone at another company would see their pay.
 */

const slip = (over: Partial<SalarySlipRow> = {}): SalarySlipRow =>
  ({ id: 1, emp_code: '1138', company_code: 'nidhi-impex', ...over }) as SalarySlipRow;

class FakeRepo implements DashboardRepository {
  calls: { empCode: string; companies: string[] | null }[] = [];
  constructor(public slips: SalarySlipRow[] = [slip()]) {}

  private matching(empCode: string, companies: string[] | null) {
    this.calls.push({ empCode, companies });
    return this.slips.filter(
      (s) =>
        s.emp_code === empCode &&
        (companies === null || companies.includes(String(s.company_code))),
    );
  }
  async countSlips(empCode: string, companies: string[] | null) {
    return this.matching(empCode, companies).length;
  }
  async recentSlips(empCode: string, companies: string[] | null, limit: number) {
    return this.matching(empCode, companies).slice(0, limit);
  }
}

const employee: Actor = {
  id: 5,
  role: 3,
  emp_code: '1138',
  company_code: 'nidhi-impex',
  name: 'Ravi',
};

let repo: FakeRepo;
let service: DashboardService;

beforeEach(() => {
  repo = new FakeRepo();
  service = new DashboardService(repo);
});

describe('dashboard', () => {
  it('returns the caller\'s slip count and their record', async () => {
    const result = await service.forActor(employee, null);

    expect(result.total_slips).toBe(1);
    expect(result.recent_slips).toHaveLength(1);
    expect(result.user.name).toBe('Ravi');
  });

  /** The divergence: PHP applies no company filter at all. */
  it('does not return another company\'s slips for the same code', async () => {
    repo.slips = [slip(), slip({ id: 2, company_code: 'silver-star' })];

    const result = await service.forActor(employee, null);

    expect(result.total_slips).toBe(1);
    expect(result.recent_slips.map((s) => s.id)).toEqual([1]);
  });

  it('scopes to every company the employee belongs to', async () => {
    repo.slips = [slip(), slip({ id: 2, company_code: 'silver-star' })];

    const result = await service.forActor(
      { ...employee, company_code: 'nidhi-impex,silver-star' },
      null,
    );

    expect(result.total_slips).toBe(2);
  });

  it('lets the request narrow within that scope', async () => {
    repo.slips = [slip(), slip({ id: 2, company_code: 'silver-star' })];

    const result = await service.forActor(
      { ...employee, company_code: 'nidhi-impex,silver-star' },
      'silver-star',
    );

    expect(result.recent_slips.map((s) => s.id)).toEqual([2]);
  });

  it('does not let the request widen it', async () => {
    repo.slips = [slip(), slip({ id: 2, company_code: 'silver-star' })];

    // Asking for another company yields the intersection, which is empty.
    const result = await service.forActor(employee, 'silver-star');

    expect(result.total_slips).toBe(0);
  });

  it("treats 'all' as no extra filter, not as no scope", async () => {
    repo.slips = [slip(), slip({ id: 2, company_code: 'silver-star' })];

    const result = await service.forActor(employee, 'all');

    // Still confined to the employee's own company.
    expect(result.total_slips).toBe(1);
  });

  it('takes at most five recent slips', async () => {
    repo.slips = Array.from({ length: 9 }, (_, i) => slip({ id: i + 1 }));

    expect((await service.forActor(employee, null)).recent_slips).toHaveLength(5);
  });

  it('returns nothing rather than querying unscoped when the caller has no code', async () => {
    const result = await service.forActor({ ...employee, emp_code: '' }, null);

    expect(result.total_slips).toBe(0);
    // A blank emp_code must not become a query that matches every blank row.
    expect(repo.calls).toEqual([]);
  });

  it('never exposes the password hash on the embedded user', async () => {
    const result = await service.forActor({ ...employee, password: 'hashed' }, null);
    expect(result.user).not.toHaveProperty('password');
  });
});
