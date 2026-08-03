import { db } from '../../db/client.js';
import type {
  EmployeeRepository,
  EmployeeRow,
  EmployeeScope,
  ListQuery,
  ListResult,
} from './employees.service.js';

/**
 * Prisma storage for employees.
 *
 * Column types are not what the names suggest: `is_deleted` and `status` are
 * VarChar (every production row holds the string '0'), while `role` is Int.
 * PHP compares them with loose ==, which hides the difference; here each has
 * to be matched in its own type or the filter silently returns nothing.
 */

/** Rows that are not employees: admins and super admins. */
const NON_EMPLOYEE_ROLES = [0, 1, 2];

/** Row kinds that live in `users` but belong to other screens. */
const NON_EMPLOYEE_TYPES = ['appointment', 'agent', 'pending_employee'];

function normalise(row: Record<string, unknown> | null): EmployeeRow | null {
  if (!row) return null;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'bigint' ? Number(value) : value;
  }
  return out as unknown as EmployeeRow;
}

export class PrismaEmployeeRepository implements EmployeeRepository {
  /**
   * The employee-list predicate, matching UserController::index.
   *
   * Two mutually exclusive shapes: status=2 asks for pending employees
   * specifically, anything else asks for real ones — which means a non-empty
   * emp_code and a `type` that is null or not one of the other screens'.
   */
  private whereFor(scope: EmployeeScope, query: ListQuery): Record<string, unknown> {
    const where: Record<string, unknown> = {
      is_deleted: '0',
      role: { notIn: NON_EMPLOYEE_ROLES },
    };

    const status = query.status === null || query.status === undefined ? null : String(query.status);

    if (status === '2') {
      where.type = 'pending_employee';
      where.status = '2';
    } else {
      where.AND = [
        { emp_code: { not: null } },
        { emp_code: { not: '' } },
        { OR: [{ type: null }, { type: { notIn: NON_EMPLOYEE_TYPES } }] },
      ];
      if (status !== null) where.status = status;
    }

    if (scope.companyCodes !== null) where.company_code = { in: scope.companyCodes };
    if (scope.unit) where.unit = scope.unit;

    // The caller may narrow further, never widen: this is applied on top of
    // the scope above, so 'all' only skips the caller's own filter.
    if (query.companyCode) {
      const codes = query.companyCode.split(',').map((c) => c.trim()).filter(Boolean);
      if (!codes.includes('all') && !codes.includes('all-companies')) {
        where.company_code =
          scope.companyCodes === null
            ? { in: codes }
            : { in: codes.filter((c) => scope.companyCodes!.includes(c)) };
      }
    }
    if (query.unit) where.unit = query.unit;

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { emp_code: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  async list(scope: EmployeeScope, query: ListQuery): Promise<ListResult> {
    // An empty company scope means "nothing", not "everything" —
    // AuthorizedUserQuery's whereRaw('1 = 0').
    if (scope.companyCodes !== null && scope.companyCodes.length === 0) {
      return {
        rows: [],
        total: 0,
        activeCount: 0,
        perPage: query.perPage,
        currentPage: query.page,
        lastPage: 1,
      };
    }

    const where = this.whereFor(scope, query);

    const [total, activeCount, rows] = await Promise.all([
      db.users.count({ where }),
      db.users.count({ where: { ...where, status: '0' } }),
      db.users.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
    ]);

    return {
      rows: rows.map((r) => normalise(r as Record<string, unknown>)!),
      total,
      activeCount,
      perPage: query.perPage,
      currentPage: query.page,
      lastPage: Math.max(1, Math.ceil(total / query.perPage)),
    };
  }

  async find(id: number): Promise<EmployeeRow | null> {
    return normalise(
      (await db.users.findUnique({ where: { id: BigInt(id) } })) as Record<string, unknown> | null,
    );
  }

  async create(data: Record<string, unknown>): Promise<EmployeeRow> {
    return normalise(
      (await db.users.create({ data: this.toPrisma(data) as never })) as Record<string, unknown>,
    )!;
  }

  async update(id: number, data: Record<string, unknown>): Promise<EmployeeRow> {
    return normalise(
      (await db.users.update({
        where: { id: BigInt(id) },
        data: this.toPrisma(data) as never,
      })) as Record<string, unknown>,
    )!;
  }

  /**
   * A soft delete, matching Eloquent.
   *
   * The User model has no SoftDeletes trait, so `$employee->delete()` is a
   * hard delete — but the whole application filters on is_deleted, and a hard
   * delete would break every foreign key pointing at the row. Flagged in the
   * module notes; this reproduces PHP exactly for now.
   */
  async remove(id: number): Promise<void> {
    await db.users.delete({ where: { id: BigInt(id) } });
  }

  async removeMany(ids: number[]): Promise<number> {
    const result = await db.users.deleteMany({
      where: { id: { in: ids.map((id) => BigInt(id)) } },
    });
    return result.count;
  }

  async findByAadhaar(digits: string, exceptId?: number): Promise<EmployeeRow | null> {
    return normalise(
      (await db.users.findFirst({
        where: {
          aadhar_card_no: digits,
          is_deleted: '0',
          ...(exceptId === undefined ? {} : { id: { not: BigInt(exceptId) } }),
        },
      })) as Record<string, unknown> | null,
    );
  }

  async findAnyByEmpCode(code: string, exceptId?: number): Promise<EmployeeRow | null> {
    return normalise(
      (await db.users.findFirst({
        where: {
          emp_code: code,
          ...(exceptId === undefined ? {} : { id: { not: BigInt(exceptId) } }),
        },
      })) as Record<string, unknown> | null,
    );
  }

  async emailTaken(email: string, exceptId?: number): Promise<boolean> {
    return (
      (await db.users.count({
        where: {
          email,
          ...(exceptId === undefined ? {} : { id: { not: BigInt(exceptId) } }),
        },
      })) > 0
    );
  }

  async empCodeTaken(code: string, exceptId?: number): Promise<boolean> {
    return (
      (await db.users.count({
        where: {
          emp_code: code,
          ...(exceptId === undefined ? {} : { id: { not: BigInt(exceptId) } }),
        },
      })) > 0
    );
  }

  /** role is Int; status, is_deleted and the rest are strings. */
  private toPrisma(data: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (key === 'role') {
        out[key] = Number.parseInt(String(value), 10);
      } else if (key.endsWith('_id') && typeof value === 'number') {
        out[key] = BigInt(value);
      } else if (['status', 'is_deleted'].includes(key)) {
        out[key] = String(value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }
}
