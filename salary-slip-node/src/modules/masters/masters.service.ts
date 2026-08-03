import { z } from 'zod';

/**
 * Shared CRUD for the small RBAC lookup resources — Locations, Branches,
 * Teams, Approval Levels.
 *
 * Mirrors App\Http\Controllers\Admin\BaseResourceController: one
 * index/store/update/destroy shape, configured per resource with a model, a
 * validation schema, a display name and an ordering column.
 */

export interface MastersError {
  statusCode: number;
  message: string;
}

export class ResourceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ResourceError';
  }
}

export type ResourceRow = Record<string, unknown>;

export interface ResourceRepository {
  list(): Promise<ResourceRow[]>;
  find(id: number): Promise<ResourceRow | null>;
  create(data: Record<string, unknown>): Promise<ResourceRow>;
  update(id: number, data: Record<string, unknown>): Promise<ResourceRow>;
  remove(id: number): Promise<void>;
  /** For the unique-code rule; `exceptId` supports edit-in-place. */
  existsWith?(field: string, value: unknown, exceptId?: number): Promise<boolean>;
}

export interface ResourceDefinition {
  /** Appears in messages and in the audit log's module column. */
  name: string;
  schema: z.ZodTypeAny;
  /** Fields that must be unique, checked before the insert to give a 422. */
  unique?: string[];
}

export class ResourceService {
  constructor(
    private readonly repo: ResourceRepository,
    private readonly definition: ResourceDefinition,
  ) {}

  get name(): string {
    return this.definition.name;
  }

  async list(): Promise<ResourceRow[]> {
    return this.repo.list();
  }

  async create(input: unknown): Promise<ResourceRow> {
    const data = this.validate(input);
    await this.assertUnique(data);

    return this.repo.create(data);
  }

  /**
   * Update, returning the row before and after so the caller can audit both.
   *
   * The uniqueness check excludes the row being edited. Laravel reuses one
   * $rules array for store and update, so BranchController's
   * 'unique:branches,code' has no ->ignore($id) and rejects an edit that keeps
   * the record's own code — renaming a branch is impossible unless its code
   * changes too. Deliberately not reproduced; see the module notes.
   */
  async update(id: number, input: unknown): Promise<{ before: ResourceRow; after: ResourceRow }> {
    const before = await this.repo.find(id);
    if (!before) {
      throw new ResourceError(`${this.definition.name} not found`, 404);
    }

    const data = this.validate(input);
    await this.assertUnique(data, id);

    // Snapshot before the write. `before` is handed to the audit log, and a
    // repository that returns a live reference to its own state would let the
    // update mutate it — recording the new values as the old ones.
    const snapshot = structuredClone(before);

    return { before: snapshot, after: await this.repo.update(id, data) };
  }

  async remove(id: number): Promise<ResourceRow> {
    const before = await this.repo.find(id);
    if (!before) {
      throw new ResourceError(`${this.definition.name} not found`, 404);
    }

    await this.repo.remove(id);
    return before;
  }

  private validate(input: unknown): Record<string, unknown> {
    const parsed = this.definition.schema.safeParse(input ?? {});

    if (!parsed.success) {
      // Laravel surfaces only the first message, as a plain string.
      throw new ResourceError(
        parsed.error.issues[0]?.message ?? 'The given data was invalid.',
        422,
      );
    }

    return parsed.data as Record<string, unknown>;
  }

  private async assertUnique(data: Record<string, unknown>, exceptId?: number): Promise<void> {
    if (!this.definition.unique || !this.repo.existsWith) return;

    for (const field of this.definition.unique) {
      if (data[field] === undefined) continue;

      if (await this.repo.existsWith(field, data[field], exceptId)) {
        // Laravel's message for the unique rule.
        throw new ResourceError(`The ${field} has already been taken.`, 422);
      }
    }
  }
}

// ---- resource definitions -------------------------------------------------

const optionalString = z.string().nullish().transform((v) => v ?? null);

export const locationDefinition: ResourceDefinition = {
  name: 'Location',
  schema: z.object({
    name: z.string({ required_error: 'The name field is required.' })
      .min(1, 'The name field is required.'),
    type: optionalString,
    country: optionalString,
    state: optionalString,
    city: optionalString,
  }),
};

export const branchDefinition: ResourceDefinition = {
  name: 'Branch',
  schema: z.object({
    name: z.string({ required_error: 'The name field is required.' })
      .min(1, 'The name field is required.'),
    code: z.string({ required_error: 'The code field is required.' })
      .min(1, 'The code field is required.'),
    location_id: z.coerce.number().int().nullish().transform((v) => v ?? null),
  }),
  unique: ['code'],
};

export const teamDefinition: ResourceDefinition = {
  name: 'Team',
  schema: z.object({
    name: z.string({ required_error: 'The name field is required.' })
      .min(1, 'The name field is required.'),
    department_id: z.coerce.number().int().nullish().transform((v) => v ?? null),
  }),
};

export const approvalLevelDefinition: ResourceDefinition = {
  name: 'Approval Level',
  schema: z.object({
    name: z.string({ required_error: 'The name field is required.' })
      .min(1, 'The name field is required.'),
    level: z.coerce.number({ required_error: 'The level field is required.' })
      .int()
      .min(1, 'The level must be at least 1.'),
    // approval_levels also carries a CHECK constraint on this column. Without
    // validation here a bad value reaches Postgres and surfaces as a raw 500
    // rather than a 422 — Prisma cannot see check constraints.
    type: z.enum(['Auto Approval', 'Manual Approval'], {
      errorMap: () => ({ message: 'The selected type is invalid.' }),
    }),
  }),
};
