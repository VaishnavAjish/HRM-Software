import { serializeUser, type SerializedUser } from '../users/user.serializer.js';
import { companyCodesOf, type Actor, type EmployeeRow } from '../employees/employees.service.js';

/**
 * The employee dashboard — GET /api/dashboard.
 *
 * A count of the caller's salary slips plus the five most recent, and their
 * own user record.
 *
 * DELIBERATE DIVERGENCE — scoped to the caller's company.
 *
 * PHP matches on the employee code alone,
 * `SalarySlip::where('emp_code', $user->emp_code)`, and emp_code is not unique
 * across companies. An employee sharing a code with someone at another company
 * would see that person's salary slips — gross pay, deductions, bank details.
 * Every production employee currently sits in one company so nothing leaks
 * today, but the code is what makes it safe, not the data.
 */

export interface SalarySlipRow {
  id: number;
  emp_code: string | null;
  company_code: string | null;
  [key: string]: unknown;
}

export interface DashboardRepository {
  countSlips(empCode: string, companyCodes: string[] | null): Promise<number>;
  recentSlips(empCode: string, companyCodes: string[] | null, limit: number): Promise<SalarySlipRow[]>;
}

export interface DashboardResult {
  total_slips: number;
  recent_slips: SalarySlipRow[];
  user: SerializedUser;
}

/** PHP takes five. */
const RECENT_LIMIT = 5;

export class DashboardService {
  constructor(private readonly repo: DashboardRepository) {}

  async forActor(actor: Actor, requestedCompanyCode: string | null): Promise<DashboardResult> {
    const empCode = String(actor.emp_code ?? '').trim();

    // No code, no slips — and no unscoped query either, which is what a blank
    // emp_code would otherwise produce.
    if (empCode === '') {
      return {
        total_slips: 0,
        recent_slips: [],
        user: serializeUser(actor as unknown as EmployeeRow),
      };
    }

    // The caller's own company is the ceiling; the request parameter may only
    // narrow within it, matching how the employee list treats 'all'.
    const own = companyCodesOf(actor.company_code);
    let companies: string[] | null = own.length > 0 ? own : null;

    if (requestedCompanyCode) {
      const requested = companyCodesOf(requestedCompanyCode);
      if (!requested.includes('all') && !requested.includes('all-companies')) {
        companies =
          companies === null ? requested : companies.filter((c) => requested.includes(c));
      }
    }

    const [total, recent] = await Promise.all([
      this.repo.countSlips(empCode, companies),
      this.repo.recentSlips(empCode, companies, RECENT_LIMIT),
    ]);

    return {
      total_slips: total,
      recent_slips: recent,
      user: serializeUser(actor as unknown as EmployeeRow),
    };
  }
}
