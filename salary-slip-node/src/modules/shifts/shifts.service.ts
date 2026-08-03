import { z } from 'zod';

import { ResourceError } from '../../lib/errors.js';
import { isValidTimeOfDay } from '../../lib/laravel/time.js';

/**
 * Shifts — App\Http\Controllers\Admin\ShiftController.
 *
 * Not a BaseResourceController: it scopes by company, counts assigned
 * employees, and adds a bulk-assign action.
 */

export interface ShiftRow {
  id: number;
  name: string;
  company_code: string;
  unit: string | null;
  start_time: string | null;
  end_time: string | null;
  grace_minutes: number;
  description: string | null;
  employees_count: number;
  [key: string]: unknown;
}

export interface ShiftScope {
  companyCode: string | null;
  unit: string | null;
}

export interface ShiftRepository {
  list(scope: ShiftScope): Promise<ShiftRow[]>;
  find(id: number): Promise<ShiftRow | null>;
  create(data: Record<string, unknown>): Promise<ShiftRow>;
  update(id: number, data: Record<string, unknown>): Promise<ShiftRow>;
  /** Deletes the shift after detaching its employees. */
  remove(id: number): Promise<void>;
  shiftExists(id: number): Promise<boolean>;
  assign(employeeIds: number[], shiftId: number | null, companyCode: string | null): Promise<number>;
}

/**
 * Actor shape the scoping rules need.
 *
 * An index signature rather than three optional properties: a type whose
 * members are all optional shares nothing with a concrete row type, and
 * TypeScript rejects the assignment outright.
 */
export type ShiftActor = Record<string, unknown>;

const timeField = (label: string) =>
  z.string({ required_error: `The ${label} field is required.` }).refine(isValidTimeOfDay, {
    message: `The ${label} does not match the format H:i.`,
  });

const shiftSchema = z.object({
  name: z.string({ required_error: 'The name field is required.' })
    .min(1, 'The name field is required.')
    .max(100, 'The name may not be greater than 100 characters.'),
  company_code: z.string({ required_error: 'The company code field is required.' })
    .min(1, 'The company code field is required.'),
  unit: z.string().nullish().transform((v) => v ?? null),
  start_time: timeField('start time'),
  end_time: timeField('end time'),
  grace_minutes: z.coerce.number().int().min(0).max(180).nullish().transform((v) => v ?? 0),
  description: z.string().nullish().transform((v) => v ?? null),
});

const assignSchema = z.object({
  shift_id: z.coerce.number().int().nullish().transform((v) => v ?? null),
  employee_ids: z
    .array(z.coerce.number().int(), { required_error: 'The employee ids field is required.' })
    .min(1, 'The employee ids field is required.'),
});

const toInt = (v: unknown): number => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isNaN(n) ? -1 : n;
};

/**
 * Which company and unit a caller may see.
 *
 * Role 1 is pinned to their own company but may filter by unit; role 2 is
 * pinned to both. Anyone else — role 0, super admin — uses whatever the
 * request asks for. Copied from ShiftController::scopedCompany.
 */
export function scopeFor(actor: ShiftActor | null | undefined, requested: ShiftScope): ShiftScope {
  if (actor && toInt(actor.role) === 1) {
    return { companyCode: String(actor.company_code ?? ''), unit: requested.unit };
  }
  if (actor && toInt(actor.role) === 2) {
    return {
      companyCode: String(actor.company_code ?? ''),
      unit: actor.unit === null || actor.unit === undefined ? null : String(actor.unit),
    };
  }
  return requested;
}

export class ShiftService {
  constructor(private readonly repo: ShiftRepository) {}

  async list(scope: ShiftScope): Promise<ShiftRow[]> {
    return this.repo.list(scope);
  }

  async create(input: unknown): Promise<ShiftRow> {
    return this.repo.create(this.validate(input));
  }

  async update(id: number, input: unknown): Promise<ShiftRow> {
    if (!(await this.repo.find(id))) {
      throw new ResourceError('Shift not found', 404);
    }

    return this.repo.update(id, this.validate(input));
  }

  /**
   * Delete, unassigning employees first.
   *
   * The employees are detached rather than the delete being blocked — a
   * removed shift should not strand people on a foreign key that no longer
   * resolves.
   */
  async remove(id: number): Promise<void> {
    if (!(await this.repo.find(id))) {
      throw new ResourceError('Shift not found', 404);
    }

    await this.repo.remove(id);
  }

  /** Bulk-assign, or clear when shift_id is null. */
  async assign(input: unknown, actor: ShiftActor | null, requested: ShiftScope): Promise<string> {
    const parsed = assignSchema.safeParse(input ?? {});
    if (!parsed.success) {
      throw new ResourceError(
        parsed.error.issues[0]?.message ?? 'The given data was invalid.',
        422,
      );
    }

    const { shift_id: shiftId, employee_ids: employeeIds } = parsed.data;

    // Laravel's 'nullable|exists:shifts,id'. Without it a bad id would be
    // written straight onto the employees as a dangling reference.
    if (shiftId !== null && !(await this.repo.shiftExists(shiftId))) {
      throw new ResourceError('The selected shift id is invalid.', 422);
    }

    const { companyCode } = scopeFor(actor, requested);
    const updated = await this.repo.assign(employeeIds, shiftId, companyCode || null);

    return `${updated} employee(s) updated`;
  }

  private validate(input: unknown): Record<string, unknown> {
    const parsed = shiftSchema.safeParse(input ?? {});

    if (!parsed.success) {
      throw new ResourceError(
        parsed.error.issues[0]?.message ?? 'The given data was invalid.',
        422,
      );
    }

    return parsed.data as Record<string, unknown>;
  }
}
