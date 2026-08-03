import { db } from '../../db/client.js';
import type { AgentRepository } from './agents.service.js';
import type { EmployeeRow, EmployeeScope } from '../employees/employees.service.js';

function normalise(row: Record<string, unknown> | null): EmployeeRow | null {
  if (!row) return null;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'bigint' ? Number(value) : value;
  }
  return out as unknown as EmployeeRow;
}

export class PrismaAgentRepository implements AgentRepository {
  async list(scope: EmployeeScope, requested: string[] | null): Promise<EmployeeRow[]> {
    // An empty scope means nothing, not everything.
    if (scope.companyCodes !== null && scope.companyCodes.length === 0) return [];

    const rows = await db.users.findMany({
      where: {
        type: 'agent',
        ...(scope.companyCodes === null ? {} : { company_code: { in: scope.companyCodes } }),
        ...(scope.unit ? { unit: scope.unit } : {}),
        ...(requested ? { company_code: { in: requested } } : {}),
      },
      orderBy: { id: 'desc' },
    });

    return rows.map((r) => normalise(r as Record<string, unknown>)!);
  }

  /**
   * Candidates this agent submitted.
   *
   * The PHP predicate is
   *   whereNull(type) OR type='' OR type != 'trial' OR processed = 0
   *
   * A row is excluded only when every branch is false, which reduces to
   * `type = 'trial' AND processed`. Those have graduated into an appointment
   * and should not linger on the agent's list as well.
   *
   * `processed` is a Boolean column, so PHP's comparison against the integer 0
   * works by coercion rather than by type — it means false.
   */
  async candidatesFor(agentId: number): Promise<EmployeeRow[]> {
    const rows = await db.users.findMany({
      where: {
        added_by: BigInt(agentId),
        NOT: { AND: [{ type: 'trial' }, { processed: true }] },
      },
      orderBy: { id: 'desc' },
    });

    return rows.map((r) => normalise(r as Record<string, unknown>)!);
  }

  async create(data: Record<string, unknown>): Promise<EmployeeRow> {
    return normalise(
      (await db.users.create({
        data: { ...data, role: Number(data.role) } as never,
      })) as Record<string, unknown>,
    )!;
  }

  async findAgent(id: number): Promise<EmployeeRow | null> {
    return normalise(
      (await db.users.findFirst({
        where: { id: BigInt(id), type: 'agent' },
      })) as Record<string, unknown> | null,
    );
  }

  async update(id: number, data: Record<string, unknown>): Promise<EmployeeRow> {
    return normalise(
      (await db.users.update({
        where: { id: BigInt(id) },
        data: data as never,
      })) as Record<string, unknown>,
    )!;
  }

  /** Hard delete, matching Eloquent — the model has no SoftDeletes trait. */
  async remove(id: number): Promise<void> {
    await db.users.delete({ where: { id: BigInt(id) } });
  }

  async emailTaken(email: string, exceptId: number): Promise<boolean> {
    return (
      (await db.users.count({ where: { email, id: { not: BigInt(exceptId) } } })) > 0
    );
  }

  async mobileTaken(mobile: string, exceptId: number): Promise<boolean> {
    return (
      (await db.users.count({
        where: { mobile_number: mobile, id: { not: BigInt(exceptId) } },
      })) > 0
    );
  }
}
