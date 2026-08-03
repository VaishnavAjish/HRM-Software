import { z } from 'zod';

import { ResourceError } from '../../lib/errors.js';
import { isValid, normalise } from '../../lib/laravel/aadhaar.js';
import { serializeUser, type SerializedUser } from '../users/user.serializer.js';
import {
  companyCodesOf,
  inManagedScope,
  mayDiscloseAadhaar,
  scopeFor,
  type Actor,
  type EmployeeRow,
  type EmployeeScope,
} from '../employees/employees.service.js';

/**
 * Agents — the four /agents routes on UserController.
 *
 * An agent is a `users` row with type = 'agent'. They submit trial forms and
 * appointments, and each one belongs to a company like any other record.
 *
 * DELIBERATE DIVERGENCE — update and delete are scoped.
 *
 * PHP resolves the target with `User::where('type','agent')->find($id)` and
 * nothing else, so an admin of one company can rename, re-password or delete
 * another company's agent. Every other write path in this controller checks
 * inManagedScope; these two do not. Scoped here to match, and an out-of-scope
 * id returns the same 404 a missing one does.
 */

export interface AgentRepository {
  create(data: Record<string, unknown>): Promise<EmployeeRow>;
  list(scope: EmployeeScope, requestedCompanies: string[] | null): Promise<EmployeeRow[]>;
  /** Candidates this agent created. */
  candidatesFor(agentId: number): Promise<EmployeeRow[]>;
  findAgent(id: number): Promise<EmployeeRow | null>;
  update(id: number, data: Record<string, unknown>): Promise<EmployeeRow>;
  remove(id: number): Promise<void>;
  emailTaken(email: string, exceptId: number): Promise<boolean>;
  mobileTaken(mobile: string, exceptId: number): Promise<boolean>;
}

export interface PasswordHasher {
  make(plain: string): Promise<string>;
}

const agentSchema = z.object({
  name: z.string({ required_error: 'The name field is required.' })
    .min(1, 'The name field is required.'),
  email: z.string({ required_error: 'The email field is required.' })
    .email('The email must be a valid email address.'),
  mobile_number: z.union([z.string(), z.number()], {
    required_error: 'The mobile number field is required.',
  }),
  company_code: z.string({ required_error: 'The company code field is required.' })
    .min(1, 'The company code field is required.'),
  unit: z.string().nullish().transform((v) => v ?? null),
  password: z.string().optional(),
});

export class AgentService {
  constructor(
    private readonly repo: AgentRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  /**
   * GET /api/agents.
   *
   * Role 1 sees their company, role 2 their company and unit; anyone else may
   * filter by company_code, where 'all' means no filter.
   */
  async list(actor: Actor, requestedCompanyCode: string | null): Promise<SerializedUser[]> {
    const scope = scopeFor(actor);

    let requested: string[] | null = null;
    if (scope.companyCodes === null && requestedCompanyCode) {
      const codes = companyCodesOf(requestedCompanyCode);
      if (!codes.includes('all') && !codes.includes('all-companies')) requested = codes;
    }

    const rows = await this.repo.list(scope, requested);
    return rows.map((row) => serializeUser(row));
  }

  /**
   * GET /api/agent/candidates — what this agent submitted.
   *
   * The scope is the narrowest in the application: rows this agent created.
   * The complete Aadhaar is therefore disclosed, with one counted audit entry
   * for the request rather than one per row.
   */
  async candidates(actor: Actor): Promise<{ rows: SerializedUser[]; disclosed: number }> {
    const candidates = await this.repo.candidatesFor(Number(actor.id));

    let disclosed = 0;
    const rows = candidates.map((candidate) => {
      const digits = normalise(candidate.aadhar_card_no ?? null);
      const full = mayDiscloseAadhaar(actor, candidate) && isValid(digits) ? digits : null;

      if (full) disclosed++;
      return serializeUser(candidate, { full });
    });

    return { rows, disclosed };
  }

  /**
   * POST /api/appointment/create-account — onboard an agent.
   *
   * PHP takes company_code straight from the request, so an admin of one
   * company can create an agent belonging to another. Confined here to the
   * caller's own companies; a super admin may still name any.
   */
  async create(actor: Actor, input: unknown): Promise<SerializedUser> {
    const parsed = agentSchema
      .extend({ password: z.string({ required_error: 'The password field is required.' })
        .min(6, 'The password must be at least 6 characters.') })
      .safeParse(input ?? {});

    if (!parsed.success) {
      throw new ResourceError(
        parsed.error.issues[0]?.message ?? 'The given data was invalid.',
        422,
      );
    }

    const data = parsed.data;
    const mobile = String(data.mobile_number);

    const allowed = scopeFor(actor).companyCodes;
    if (allowed !== null && !allowed.includes(data.company_code)) {
      throw new ResourceError('You may not create an agent for that company.', 403);
    }

    if (await this.repo.emailTaken(data.email, 0)) {
      throw new ResourceError('The email has already been taken.', 422);
    }
    if (await this.repo.mobileTaken(mobile, 0)) {
      throw new ResourceError('The mobile number has already been taken.', 422);
    }

    return serializeUser(
      await this.repo.create({
        name: data.name,
        email: data.email,
        mobile_number: mobile,
        company_code: data.company_code,
        unit: data.unit,
        password: await this.hasher.make(data.password!),
        // Forced, never taken from the request.
        type: 'agent',
        role: 4,
      }),
    );
  }

  async update(actor: Actor, id: number, input: unknown): Promise<SerializedUser> {
    const agent = await this.requireAgent(actor, id);

    const parsed = agentSchema.safeParse(input ?? {});
    if (!parsed.success) {
      throw new ResourceError(
        parsed.error.issues[0]?.message ?? 'The given data was invalid.',
        422,
      );
    }

    const data = parsed.data;
    const mobile = String(data.mobile_number);

    // Laravel's unique:users,email,{id} — unique across the table, excluding
    // this row.
    if (await this.repo.emailTaken(data.email, id)) {
      throw new ResourceError('The email has already been taken.', 422);
    }
    if (await this.repo.mobileTaken(mobile, id)) {
      throw new ResourceError('The mobile number has already been taken.', 422);
    }

    const patch: Record<string, unknown> = {
      name: data.name,
      email: data.email,
      mobile_number: mobile,
      company_code: data.company_code,
      unit: data.unit,
    };

    // Only when supplied: an empty field must not blank an agent's password.
    if (data.password !== undefined && data.password !== '') {
      patch.password = await this.hasher.make(data.password);
    }

    return serializeUser(await this.repo.update(agent.id, patch));
  }

  async remove(actor: Actor, id: number): Promise<void> {
    const agent = await this.requireAgent(actor, id);
    await this.repo.remove(agent.id);
  }

  /** 404 for both "no such agent" and "not yours" — the latter must not confirm existence. */
  private async requireAgent(actor: Actor, id: number): Promise<EmployeeRow> {
    const agent = await this.repo.findAgent(id);

    if (!agent || !inManagedScope(actor, agent)) {
      throw new ResourceError('Agent not found', 404);
    }
    return agent;
  }
}
