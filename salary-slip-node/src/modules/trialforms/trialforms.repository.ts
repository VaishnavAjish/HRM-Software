import { db } from '../../db/client.js';
import type { TrialFormRepository, TrialFormScope } from './trialforms.service.js';
import type { EmployeeRow, EmployeeScope } from '../employees/employees.service.js';

function normalise(row: Record<string, unknown> | null): EmployeeRow | null {
  if (!row) return null;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'bigint' ? Number(value) : value;
  }
  return out as unknown as EmployeeRow;
}

/** Integer/boolean columns; everything else in this table is text. */
const INTEGER_COLUMNS = new Set(['role', 'shift_id', 'added_by', 'trial_form_id']);
const BOOLEAN_COLUMNS = new Set(['processed']);

export class PrismaTrialFormRepository implements TrialFormRepository {
  /** Unprocessed trial forms only — a processed one has become an appointment. */
  async list(
    scope: EmployeeScope,
    requested: string[] | null,
    unit: string | null,
  ): Promise<EmployeeRow[]> {
    if (scope.companyCodes !== null && scope.companyCodes.length === 0) return [];

    const rows = await db.users.findMany({
      where: {
        type: 'trial',
        processed: false,
        ...(scope.companyCodes === null ? {} : { company_code: { in: scope.companyCodes } }),
        ...(scope.unit ? { unit: scope.unit } : {}),
        ...(requested ? { company_code: { in: requested } } : {}),
        ...(unit ? { unit } : {}),
      },
      orderBy: { id: 'desc' },
    });

    return rows.map((r) => normalise(r as Record<string, unknown>)!);
  }

  async findForActor(id: number, scope: TrialFormScope): Promise<EmployeeRow | null> {
    if (scope.companyCodes !== null && scope.companyCodes.length === 0) return null;

    return normalise(
      (await db.users.findFirst({
        where: {
          id: BigInt(id),
          type: 'trial',
          ...(scope.addedBy === null ? {} : { added_by: BigInt(scope.addedBy) }),
          ...(scope.companyCodes === null ? {} : { company_code: { in: scope.companyCodes } }),
          ...(scope.unit ? { unit: scope.unit } : {}),
        },
      })) as Record<string, unknown> | null,
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

  async remove(id: number): Promise<void> {
    await db.users.delete({ where: { id: BigInt(id) } });
  }

  private toPrisma(data: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;

      if (BOOLEAN_COLUMNS.has(key)) {
        out[key] = value === true || value === 1 || value === '1';
      } else if (INTEGER_COLUMNS.has(key)) {
        if (value === null || value === '') continue;
        const n = Number.parseInt(String(value), 10);
        if (Number.isNaN(n)) continue;
        out[key] = key === 'role' ? n : BigInt(n);
      } else {
        out[key] = value === null ? null : String(value);
      }
    }
    return out;
  }
}
