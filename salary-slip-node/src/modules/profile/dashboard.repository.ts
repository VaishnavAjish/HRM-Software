import { db } from '../../db/client.js';
import type { DashboardRepository, SalarySlipRow } from './dashboard.service.js';

function normalise(row: Record<string, unknown>): SalarySlipRow {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'bigint' ? Number(value) : value;
  }
  return out as unknown as SalarySlipRow;
}

/**
 * salary_slips has no foreign key to users; slips are joined by the emp_code
 * string. The company filter is therefore the only thing separating one
 * company's slips from another's when a code is shared.
 */
export class PrismaDashboardRepository implements DashboardRepository {
  private where(empCode: string, companyCodes: string[] | null): Record<string, unknown> {
    return {
      emp_code: empCode,
      ...(companyCodes === null ? {} : { company_code: { in: companyCodes } }),
    };
  }

  async countSlips(empCode: string, companyCodes: string[] | null): Promise<number> {
    if (companyCodes !== null && companyCodes.length === 0) return 0;
    return db.salary_slips.count({ where: this.where(empCode, companyCodes) });
  }

  async recentSlips(
    empCode: string,
    companyCodes: string[] | null,
    limit: number,
  ): Promise<SalarySlipRow[]> {
    if (companyCodes !== null && companyCodes.length === 0) return [];

    const rows = await db.salary_slips.findMany({
      where: this.where(empCode, companyCodes),
      orderBy: { id: 'desc' },
      take: limit,
    });

    return rows.map((r) => normalise(r as Record<string, unknown>));
  }
}
