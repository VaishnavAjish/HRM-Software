import { ResourceError } from '../../lib/errors.js';
import { isValid, normalise } from '../../lib/laravel/aadhaar.js';
import { serializeUser, type SerializedUser } from '../users/user.serializer.js';
import {
  PROVISIONING_SOURCE,
  prismaProvisioner,
  type Provisioner,
} from '../provisioning/provisioning.service.js';

/**
 * Employees — the read/write half of UserController.
 *
 * Ported against the *legacy* decision path, which is what production actually
 * executes: the enterprise authorization platform's 11 tables do not exist
 * there, and every one of its entry points is guarded by Schema::hasTable and
 * falls back to the legacy role check. AuthorizedUserQuery, FieldSecurity and
 * RequirePermission are therefore inert in production and are not reproduced.
 *
 * ONE DELIBERATE DIVERGENCE — role 1 is scoped on the list.
 *
 * AuthorizedUserQuery exempts role 0 *and role 1* from scoping, so a role 1
 * admin's employee list currently includes every company, while show() still
 * 404s the same records. Confirmed in EmployeeListScopeTest. Treated as a bug
 * rather than reproduced: the list here applies the same company scoping show()
 * applies, so the two agree and cross-company names, emails and mobile numbers
 * stop appearing in a list the caller cannot open.
 */

export interface EmployeeRow {
  id: number;
  name: string | null;
  emp_code: string | null;
  email: string | null;
  company_code: string | null;
  unit: string | null;
  status: number | string | null;
  is_deleted: number | string | null;
  role: number | string | null;
  type: string | null;
  aadhar_card_no?: string | null;
  [key: string]: unknown;
}

export interface Actor {
  id: number;
  role?: unknown;
  company_code?: unknown;
  unit?: unknown;
  [key: string]: unknown;
}

export interface EmployeeScope {
  /** null means unscoped. */
  companyCodes: string[] | null;
  unit: string | null;
}

export interface ListQuery {
  status?: string | number | null;
  companyCode?: string | null;
  unit?: string | null;
  search?: string | null;
  page: number;
  perPage: number;
}

export interface ListResult {
  rows: EmployeeRow[];
  total: number;
  activeCount: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
}

export interface EmployeeRepository {
  list(scope: EmployeeScope, query: ListQuery): Promise<ListResult>;
  find(id: number): Promise<EmployeeRow | null>;
  create(data: Record<string, unknown>): Promise<EmployeeRow>;
  update(id: number, data: Record<string, unknown>): Promise<EmployeeRow>;
  remove(id: number): Promise<void>;
  removeMany(ids: number[]): Promise<number>;
  /** Availability check for the appointment form; unscoped by design. */
  findAnyByEmpCode(code: string, exceptId?: number): Promise<EmployeeRow | null>;
  /** Aadhaar uniqueness across live records. */
  findByAadhaar(digits: string, exceptId?: number): Promise<EmployeeRow | null>;
  emailTaken(email: string, exceptId?: number): Promise<boolean>;
  empCodeTaken(code: string, exceptId?: number): Promise<boolean>;
}

const toInt = (v: unknown): number => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isNaN(n) ? -1 : n;
};

/** "a, b" → ["a","b"]; blank entries dropped. */
export function companyCodesOf(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const grantsEveryCompany = (codes: string[]): boolean =>
  codes.includes('all') || codes.includes('all-companies');

/**
 * Which companies and unit this caller may see.
 *
 * Role 0 is unscoped. Role 1 is limited to the companies on their own record —
 * a comma-separated list, with 'all'/'all-companies' meaning no limit. Role 2
 * is additionally pinned to their unit. A role 1/2 admin with no company at all
 * sees nothing, which is the safe direction and matches AuthorizedUserQuery's
 * `whereRaw('1 = 0')`.
 */
export function scopeFor(actor: Actor | null | undefined): EmployeeScope {
  if (!actor || toInt(actor.role) === 0) {
    return { companyCodes: null, unit: null };
  }

  const role = toInt(actor.role);
  if (role !== 1 && role !== 2) {
    return { companyCodes: null, unit: null };
  }

  const codes = companyCodesOf(actor.company_code);
  if (grantsEveryCompany(codes)) {
    return { companyCodes: null, unit: null };
  }

  return {
    companyCodes: codes,
    unit: role === 2 ? (actor.unit === null || actor.unit === undefined ? null : String(actor.unit)) : null,
  };
}

/** Whether this caller may act on this specific record. Mirrors inManagedScope. */
export function inManagedScope(actor: Actor | null | undefined, employee: EmployeeRow): boolean {
  if (!actor) return true;

  const role = toInt(actor.role);

  if (role === 1) {
    const codes = companyCodesOf(actor.company_code);
    if (grantsEveryCompany(codes)) return true;
    return codes.includes(String(employee.company_code));
  }

  if (role === 2) {
    return (
      employee.company_code === actor.company_code && employee.unit === actor.unit
    );
  }

  return true;
}

/**
 * Strip fields a non-super-admin must not be able to grant.
 *
 * Promotion to role 0, and moving a record to a company or unit the acting
 * admin does not manage. Silently dropped rather than rejected, matching PHP —
 * the UI never sends them, so a rejection would only ever be seen by someone
 * crafting the request by hand.
 */
export function guardPrivilegedFields(
  actor: Actor | null | undefined,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (!actor || toInt(actor.role) === 0) return data;

  const out = { ...data };

  if ('role' in out && toInt(out.role) === 0) delete out.role;
  if (toInt(actor.role) === 1 && 'company_code' in out) delete out.company_code;
  if (toInt(actor.role) === 2) {
    delete out.company_code;
    delete out.unit;
  }

  return out;
}

/**
 * Normalise an incoming Aadhaar to digits, dropping anything unusable.
 *
 * A partial or malformed number is removed from the payload rather than
 * stored, so "1234 5678 9012" and "123456789012" resolve to the same folder
 * reference and a half-typed value never overwrites a stored one.
 */
export function withSafeAadhaar(data: Record<string, unknown>): Record<string, unknown> {
  if (!('aadhar_card_no' in data)) return data;

  const incoming = data.aadhar_card_no;
  const scalar =
    incoming === null || typeof incoming === 'object' ? '' : String(incoming);
  const digits = normalise(scalar);

  const out = { ...data };
  if (!isValid(digits)) {
    delete out.aadhar_card_no;
    return out;
  }

  out.aadhar_card_no = digits;
  return out;
}

/** Whether the complete Aadhaar may be disclosed for this record. */
export function mayDiscloseAadhaar(actor: Actor | null | undefined, employee: EmployeeRow): boolean {
  if (!actor) return false;
  if (Number(actor.id) === Number(employee.id)) return true;
  return inManagedScope(actor, employee);
}

export class EmployeeService {
  constructor(
    private readonly repo: EmployeeRepository,
    private readonly provisioner: Provisioner = prismaProvisioner,
  ) {}

  async list(actor: Actor, query: ListQuery): Promise<{ result: ListResult; disclosed: number }> {
    const result = await this.repo.list(scopeFor(actor), query);

    let disclosed = 0;
    const rows = result.rows.map((employee) => {
      const full = mayDiscloseAadhaar(actor, employee)
        ? normalise(employee.aadhar_card_no ?? null) || null
        : null;

      if (full && isValid(full)) disclosed++;

      return serializeUser(employee, { full: full && isValid(full) ? full : null }) as unknown as EmployeeRow;
    });

    return { result: { ...result, rows }, disclosed };
  }

  async show(actor: Actor, id: number): Promise<SerializedUser> {
    const employee = await this.repo.find(id);

    // Out-of-scope reads are a 404, not a 403: a 403 confirms the record
    // exists, which is itself a disclosure across a company boundary.
    if (!employee || !inManagedScope(actor, employee)) {
      throw new ResourceError('Employee not found', 404);
    }

    const full = mayDiscloseAadhaar(actor, employee)
      ? normalise(employee.aadhar_card_no ?? null) || null
      : null;

    return serializeUser(employee, { full: full && isValid(full) ? full : null });
  }

  async create(actor: Actor, input: Record<string, unknown>): Promise<SerializedUser> {
    const requestedRole = toInt(input.role);
    const privileged = requestedRole === 0 || requestedRole === 1;

    // Creating an Admin or Super Admin is a privilege escalation; only an
    // existing Super Admin may do it.
    if (privileged && toInt(actor.role) !== 0) {
      throw new ResourceError('Only a Super Admin can create Admin/Super Admin accounts', 403);
    }

    if (!input.name) throw new ResourceError('The name field is required.', 422);
    if (!input.company_code) throw new ResourceError('The company code field is required.', 422);

    if (privileged) {
      if (!input.email) throw new ResourceError('The email field is required.', 422);
      if (!input.password || String(input.password).length < 6) {
        throw new ResourceError('The password must be at least 6 characters.', 422);
      }
    }

    // unit is required except for admins and agents.
    if (![0, 1, 4].includes(requestedRole) && !input.unit) {
      throw new ResourceError('The unit field is required.', 422);
    }

    if (input.email && (await this.repo.emailTaken(String(input.email)))) {
      throw new ResourceError('The email has already been taken.', 422);
    }
    if (input.emp_code && (await this.repo.empCodeTaken(String(input.emp_code)))) {
      throw new ResourceError('The emp code has already been taken.', 422);
    }

    const data = withSafeAadhaar({ ...input });

    if (typeof data.aadhar_card_no === 'string') {
      const conflict = await this.repo.findByAadhaar(data.aadhar_card_no);
      if (conflict) {
        throw new ResourceError(
          `This Aadhaar number is already assigned to ${conflict.name}`,
          422,
        );
      }
    }

    const created = await this.repo.create(data);

    // This surface posts a numeric tier rather than a role id, so the canonical
    // role is derived from it. Before this, the tier was all that was written
    // and the account held no role at all.
    await this.provisioner.provision(
      Number(created.id),
      requestedRole < 0 ? 3 : requestedRole,
      (data.company_code as string | null) ?? null,
      PROVISIONING_SOURCE.EMPLOYEE_FORM,
    );

    return serializeUser(created);
  }

  async update(
    actor: Actor,
    id: number,
    input: Record<string, unknown>,
  ): Promise<SerializedUser> {
    const employee = await this.repo.find(id);
    if (!employee || !inManagedScope(actor, employee)) {
      throw new ResourceError('Employee not found', 404);
    }

    const data = withSafeAadhaar(guardPrivilegedFields(actor, { ...input }));

    if (typeof data.aadhar_card_no === 'string') {
      const conflict = await this.repo.findByAadhaar(data.aadhar_card_no, id);
      if (conflict) {
        throw new ResourceError(
          `This Aadhaar number is already assigned to ${conflict.name}`,
          422,
        );
      }
    }

    return serializeUser(await this.repo.update(id, data));
  }

  /**
   * Look a code up regardless of company.
   *
   * Deliberately unscoped: the question is whether the code is free anywhere,
   * because emp_code has to be unique wherever the record lands. Only three
   * fields reach the response, which is what bounds the disclosure.
   */
  async findByEmpCode(code: string, exceptId?: number): Promise<EmployeeRow | null> {
    return this.repo.findAnyByEmpCode(code, exceptId);
  }

  async remove(actor: Actor, id: number): Promise<void> {
    const employee = await this.repo.find(id);
    if (!employee || !inManagedScope(actor, employee)) {
      throw new ResourceError('Employee not found', 404);
    }

    await this.repo.remove(id);
  }

  /** Bulk delete, silently skipping anything outside the caller's scope. */
  async removeMany(actor: Actor, ids: number[]): Promise<number> {
    if (ids.length === 0) {
      throw new ResourceError('The ids field is required.', 422);
    }

    const allowed: number[] = [];
    for (const id of ids) {
      const employee = await this.repo.find(id);
      if (employee && inManagedScope(actor, employee)) allowed.push(id);
    }

    return allowed.length === 0 ? 0 : this.repo.removeMany(allowed);
  }
}
