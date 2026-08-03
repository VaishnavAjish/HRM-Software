import { db } from '../../db/client.js';
import { formatTime, parseTime } from '../../lib/laravel/time.js';
import type { ShiftRepository, ShiftRow, ShiftScope } from './shifts.service.js';
import type { SettingsRepository } from '../settings/settings.service.js';

/**
 * Prisma storage for shifts and settings.
 *
 * The important detail is the time columns: Postgres `time` reaches PHP as the
 * string "09:00:00", while Prisma maps it to a Date. Every row leaving here is
 * formatted back to a string so the client sees what it has always seen.
 */

type ShiftRecord = {
  id: bigint;
  start_time: Date | string | null;
  end_time: Date | string | null;
  [key: string]: unknown;
};

/**
 * @param employeesCount omitted for store/update, which is what PHP does —
 *        only ShiftController::index calls withCount('employees'), so the
 *        create and update responses carry no employees_count at all.
 */
function toShiftRow(row: ShiftRecord, employeesCount?: number): ShiftRow {
  return {
    ...row,
    id: Number(row.id),
    start_time: formatTime(row.start_time),
    end_time: formatTime(row.end_time),
    ...(employeesCount === undefined ? {} : { employees_count: employeesCount }),
  } as ShiftRow;
}

export class PrismaShiftRepository implements ShiftRepository {
  private where(scope: ShiftScope): Record<string, unknown> {
    return {
      ...(scope.companyCode ? { company_code: scope.companyCode } : {}),
      ...(scope.unit ? { unit: scope.unit } : {}),
    };
  }

  /**
   * Employee counts, gathered separately.
   *
   * users.shift_id has no foreign key, so Prisma models no relation between
   * the two tables and `_count` is unavailable — Eloquent's
   * hasMany(User::class, 'shift_id') needs no constraint to work, Prisma does.
   * One grouped query covers the whole page rather than a count per shift.
   */
  private async countsFor(ids: bigint[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();

    const grouped = await db.users.groupBy({
      by: ['shift_id'],
      where: { shift_id: { in: ids } },
      _count: { _all: true },
    });

    const counts = new Map<string, number>();
    for (const row of grouped) {
      if (row.shift_id !== null) counts.set(String(row.shift_id), row._count._all);
    }
    return counts;
  }

  async list(scope: ShiftScope): Promise<ShiftRow[]> {
    const rows = await db.shifts.findMany({
      where: this.where(scope),
      orderBy: { start_time: 'asc' },
    });

    const counts = await this.countsFor(rows.map((r) => r.id));

    return rows.map((r) =>
      toShiftRow(r as unknown as ShiftRecord, counts.get(String(r.id)) ?? 0),
    );
  }

  async find(id: number): Promise<ShiftRow | null> {
    const row = await db.shifts.findUnique({ where: { id: BigInt(id) } });
    if (!row) return null;

    const counts = await this.countsFor([row.id]);
    return toShiftRow(row as unknown as ShiftRecord, counts.get(String(row.id)) ?? 0);
  }

  async create(data: Record<string, unknown>): Promise<ShiftRow> {
    const row = await db.shifts.create({ data: this.toPrisma(data) as never });
    return toShiftRow(row as unknown as ShiftRecord);
  }

  async update(id: number, data: Record<string, unknown>): Promise<ShiftRow> {
    const row = await db.shifts.update({
      where: { id: BigInt(id) },
      data: this.toPrisma(data) as never,
    });

    return toShiftRow(row as unknown as ShiftRecord);
  }

  /**
   * Detach employees, then delete — in a transaction.
   *
   * PHP does these as two statements. Wrapping them means a failure between
   * the two cannot leave every employee unassigned from a shift that still
   * exists.
   */
  async remove(id: number): Promise<void> {
    await db.$transaction([
      db.users.updateMany({ where: { shift_id: BigInt(id) }, data: { shift_id: null } }),
      db.shifts.delete({ where: { id: BigInt(id) } }),
    ]);
  }

  async shiftExists(id: number): Promise<boolean> {
    return (await db.shifts.count({ where: { id: BigInt(id) } })) > 0;
  }

  async assign(
    employeeIds: number[],
    shiftId: number | null,
    companyCode: string | null,
  ): Promise<number> {
    const result = await db.users.updateMany({
      where: {
        id: { in: employeeIds.map((id) => BigInt(id)) },
        ...(companyCode ? { company_code: companyCode } : {}),
      },
      data: { shift_id: shiftId === null ? null : BigInt(shiftId) },
    });

    return result.count;
  }

  /** Times arrive as "09:00"; the column needs a Date. */
  private toPrisma(data: Record<string, unknown>): Record<string, unknown> {
    const out = { ...data };

    for (const field of ['start_time', 'end_time'] as const) {
      if (typeof out[field] === 'string') out[field] = parseTime(out[field]);
    }
    return out;
  }
}

export class PrismaSettingsRepository implements SettingsRepository {
  async valuesFor(group: string): Promise<Record<string, string>> {
    const rows = await db.settings.findMany({
      where: { group },
      select: { key: true, value: true },
    });

    const out: Record<string, string> = {};
    for (const row of rows) {
      if (row.key !== null) out[row.key] = row.value ?? '';
    }
    return out;
  }

  /**
   * Matched on key alone, as Laravel's updateOrCreate does here.
   *
   * settings.key carries no unique index, so this is a read-then-write rather
   * than a real upsert — two concurrent writes to the same key can both insert.
   * That is the existing behaviour and is left as it is; the screen saves the
   * whole group from one admin at a time.
   */
  async upsert(key: string, value: string, group: string): Promise<void> {
    const existing = await db.settings.findFirst({ where: { key }, select: { id: true } });

    if (existing) {
      await db.settings.update({ where: { id: existing.id }, data: { value, group } });
      return;
    }

    await db.settings.create({ data: { key, value, group } });
  }
}
