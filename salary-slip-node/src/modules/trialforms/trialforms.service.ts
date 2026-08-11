import { ResourceError } from '../../lib/errors.js';
import { isValid, normalise } from '../../lib/laravel/aadhaar.js';
import { serializeUser, type SerializedUser } from '../users/user.serializer.js';
import {
  PROVISIONING_SOURCE,
  prismaProvisioner,
  type Provisioner,
} from '../provisioning/provisioning.service.js';
import {
  companyCodesOf,
  mayDiscloseAadhaar,
  scopeFor,
  type Actor,
  type EmployeeRow,
  type EmployeeScope,
} from '../employees/employees.service.js';

/**
 * Trial forms — rows in `users` with type = 'trial'.
 *
 * A trial form is a candidate an agent has walked through the shop floor. Once
 * it is processed it becomes an appointment and drops off this list.
 *
 * The scoping helper mirrors findTrialFormFor(): role 1 their company, role 2
 * their company and unit, an agent their own submissions, role 0 everything —
 * so the list and the operations on it agree. The protected-field list is the
 * same one: User::$fillable is shared with employee creation, so an unfiltered
 * update here would let an agent set role, password or company_code.
 */

/** Fields a trial-form edit may never set. */
export const TRIAL_FORM_PROTECTED_FIELDS = [
  'id',
  'role',
  'password',
  'company_code',
  'is_deleted',
  'emp_code',
  'added_by',
  'type',
  'trial_form_id',
] as const;

export interface TrialFormRepository {
  list(scope: EmployeeScope, requested: string[] | null, unit: string | null): Promise<EmployeeRow[]>;
  /** type='trial' and within the caller's scope, or null. */
  findForActor(id: number, scope: TrialFormScope): Promise<EmployeeRow | null>;
  create(data: Record<string, unknown>): Promise<EmployeeRow>;
  update(id: number, data: Record<string, unknown>): Promise<EmployeeRow>;
  remove(id: number): Promise<void>;
}

export interface TrialFormScope {
  /** An agent is limited to what they submitted. */
  addedBy: number | null;
  companyCodes: string[] | null;
  unit: string | null;
}

const toInt = (v: unknown): number => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isNaN(n) ? -1 : n;
};

const isAgent = (actor: Actor): boolean =>
  actor.type === 'agent' || toInt(actor.role) === 4;

/** findTrialFormFor(), as a value rather than a query mutation. */
export function trialFormScopeFor(actor: Actor): TrialFormScope {
  if (isAgent(actor)) {
    return { addedBy: Number(actor.id), companyCodes: null, unit: null };
  }

  const scope = scopeFor(actor);
  return { addedBy: null, companyCodes: scope.companyCodes, unit: scope.unit };
}

/** Strip anything a trial-form edit must not set. */
export function stripProtectedFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if ((TRIAL_FORM_PROTECTED_FIELDS as readonly string[]).includes(key)) continue;
    out[key] = value;
  }
  return out;
}

export class TrialFormService {
  constructor(
    private readonly repo: TrialFormRepository,
    private readonly provisioner: Provisioner = prismaProvisioner,
  ) {}

  /** GET /api/trial-form/list — unprocessed forms only. */
  async list(
    actor: Actor,
    requestedCompanyCode: string | null,
    unit: string | null,
  ): Promise<{ rows: SerializedUser[]; disclosed: number }> {
    const scope = scopeFor(actor);

    let requested: string[] | null = null;
    if (scope.companyCodes === null && requestedCompanyCode) {
      const codes = companyCodesOf(requestedCompanyCode);
      if (!codes.includes('all') && !codes.includes('all-companies')) requested = codes;
    }

    const found = await this.repo.list(scope, requested, unit);

    let disclosed = 0;
    const rows = found.map((form) => {
      const digits = normalise(form.aadhar_card_no ?? null);
      const full = mayDiscloseAadhaar(actor, form) && isValid(digits) ? digits : null;

      if (full) disclosed++;
      return serializeUser(form, { full });
    });

    return { rows, disclosed };
  }

  async create(actor: Actor, input: Record<string, unknown>): Promise<SerializedUser> {
    const data = stripProtectedFields({ ...input });

    data.type = 'trial';
    data.role = 3;
    data.processed = false;

    // An agent's submissions are stamped so the list can scope to them.
    if (isAgent(actor)) data.added_by = Number(actor.id);

    // company_code is protected on edit but must be settable on create;
    // it falls back to the submitter's own.
    data.company_code = input.company_code ?? actor.company_code ?? null;
    if (!data.company_code) {
      throw new ResourceError('The company code field is required.', 422);
    }

    const created = await this.repo.create(data);

    // Same rule as the Laravel path: the Employee role is resolved by the
    // server from its canonical code, never taken from the submission.
    await this.provisioner.provision(
      Number(created.id),
      3,
      (data.company_code as string | null) ?? null,
      PROVISIONING_SOURCE.TRIAL,
    );

    return serializeUser(created);
  }

  async update(actor: Actor, id: number, input: Record<string, unknown>): Promise<void> {
    const form = await this.require(actor, id);
    await this.repo.update(form.id, stripProtectedFields({ ...input }));
  }

  async remove(actor: Actor, id: number): Promise<void> {
    const form = await this.require(actor, id);

    // User has no SoftDeletes trait, so this is permanent — all the more
    // reason the row has to be one this caller owns.
    await this.repo.remove(form.id);
  }

  private async require(actor: Actor, id: number): Promise<EmployeeRow> {
    const form = await this.repo.findForActor(id, trialFormScopeFor(actor));
    if (!form) {
      throw new ResourceError('Not found', 404);
    }
    return form;
  }
}
