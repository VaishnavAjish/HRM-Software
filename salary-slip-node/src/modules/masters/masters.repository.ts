import { db } from '../../db/client.js';
import type { ResourceRepository, ResourceRow } from './masters.service.js';

/**
 * Prisma-backed storage for the RBAC lookup resources.
 *
 * Each resource differs only in its Prisma delegate, its eager-loaded
 * relation and its ordering column, so one class covers all four rather than
 * four near-identical files.
 */

/** BigInt ids and nested relations, flattened to what the client already reads. */
function normalise(row: Record<string, unknown> | null): ResourceRow | null {
  if (!row) return null;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'bigint') {
      out[key] = Number(value);
    } else if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
      out[key] = normalise(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

interface PrismaDelegate {
  findMany(args?: unknown): Promise<unknown[]>;
  findUnique(args: unknown): Promise<unknown>;
  findFirst(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  delete(args: unknown): Promise<unknown>;
}

export class PrismaResourceRepository implements ResourceRepository {
  constructor(
    private readonly delegate: PrismaDelegate,
    private readonly orderBy: string,
    /**
     * Relation to eager-load, matching BaseResourceController::with(). The
     * introspected names are plural (`locations`, `departments`) because
     * Prisma derives them from the table, while Eloquent exposes the singular
     * `location` / `department` the client reads — see aliasRelation.
     */
    private readonly include?: { field: string; alias: string },
  ) {}

  private includeArg(): Record<string, boolean> | undefined {
    return this.include ? { [this.include.field]: true } : undefined;
  }

  /** Expose the relation under the name Eloquent used. */
  private aliasRelation(row: ResourceRow | null): ResourceRow | null {
    if (!row || !this.include) return row;

    const { field, alias } = this.include;
    if (field === alias || !(field in row)) return row;

    const { [field]: related, ...rest } = row;
    return { ...rest, [alias]: related ?? null };
  }

  async list(): Promise<ResourceRow[]> {
    const rows = await this.delegate.findMany({
      orderBy: { [this.orderBy]: 'asc' },
      ...(this.includeArg() ? { include: this.includeArg() } : {}),
    });

    return rows.map((r) => this.aliasRelation(normalise(r as Record<string, unknown>))!);
  }

  async find(id: number): Promise<ResourceRow | null> {
    const row = await this.delegate.findUnique({
      where: { id: BigInt(id) },
      ...(this.includeArg() ? { include: this.includeArg() } : {}),
    });

    return this.aliasRelation(normalise(row as Record<string, unknown> | null));
  }

  async create(data: Record<string, unknown>): Promise<ResourceRow> {
    const row = await this.delegate.create({
      data: this.toPrisma(data),
      ...(this.includeArg() ? { include: this.includeArg() } : {}),
    });

    return this.aliasRelation(normalise(row as Record<string, unknown>))!;
  }

  async update(id: number, data: Record<string, unknown>): Promise<ResourceRow> {
    const row = await this.delegate.update({
      where: { id: BigInt(id) },
      data: this.toPrisma(data),
      ...(this.includeArg() ? { include: this.includeArg() } : {}),
    });

    return this.aliasRelation(normalise(row as Record<string, unknown>))!;
  }

  async remove(id: number): Promise<void> {
    await this.delegate.delete({ where: { id: BigInt(id) } });
  }

  async existsWith(field: string, value: unknown, exceptId?: number): Promise<boolean> {
    const found = (await this.delegate.findFirst({
      where: {
        [field]: value,
        ...(exceptId !== undefined ? { id: { not: BigInt(exceptId) } } : {}),
      },
      select: { id: true },
    })) as { id: bigint } | null;

    return found !== null;
  }

  /** Foreign keys are BigInt columns; a plain number is rejected. */
  private toPrisma(data: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      out[key] = key.endsWith('_id') && typeof value === 'number' ? BigInt(value) : value;
    }
    return out;
  }
}

export const locationRepository = () =>
  new PrismaResourceRepository(db.locations as unknown as PrismaDelegate, 'name');

export const branchRepository = () =>
  new PrismaResourceRepository(db.branches as unknown as PrismaDelegate, 'name', {
    field: 'locations',
    alias: 'location',
  });

export const teamRepository = () =>
  new PrismaResourceRepository(db.teams as unknown as PrismaDelegate, 'name', {
    field: 'departments',
    alias: 'department',
  });

export const approvalLevelRepository = () =>
  new PrismaResourceRepository(db.approval_levels as unknown as PrismaDelegate, 'level');
