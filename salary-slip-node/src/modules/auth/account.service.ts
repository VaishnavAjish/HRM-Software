import { AuthError, type AuthUserRow } from './auth.service.js';
import { check as checkPassword } from '../../lib/laravel/hash.js';
import { serializeUser, type SerializedUser } from '../users/user.serializer.js';

/**
 * The remaining auth endpoints: change-password, check-emp-code, register.
 */

export interface AccountRepository {
  updatePassword(id: number, hashedPassword: string): Promise<void>;
  /** AuthController::checkEmpCode — an unscoped `where('emp_code', $code)->first()`. */
  findByEmpCode(code: string): Promise<{ company_code: string | null; unit: string | null } | null>;
  emailExists(email: string): Promise<boolean>;
  createUser(data: {
    name: string;
    email: string;
    hashedPassword: string;
    role: number;
    companyCode: string | null;
    empCode: string;
    type: string | null;
  }): Promise<AuthUserRow>;
}

export interface PasswordHasher {
  make(plain: string): Promise<string>;
}

/** Str::random(8) upper-cased, matching the PHP register() path. */
export function generateEmpCode(random: (n: number) => Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = random(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out.toUpperCase();
}

export class AccountService {
  constructor(
    private readonly repo: AccountRepository,
    private readonly hasher: PasswordHasher,
    private readonly randomBytes: (n: number) => Buffer,
  ) {}

  /**
   * POST /api/change-password — authenticated.
   *
   * The current password is re-checked even though the caller holds a valid
   * token: a token can be a borrowed laptop, and this is the control that
   * stops a walk-up from locking the owner out of their own account.
   */
  async changePassword(
    user: AuthUserRow,
    current: string,
    next: string,
  ): Promise<{ message: string }> {
    if (!(await checkPassword(current, user.password))) {
      throw new AuthError('Current password is incorrect', 422);
    }

    await this.repo.updatePassword(user.id, await this.hasher.make(next));

    return { message: 'Password changed successfully' };
  }

  /**
   * GET /api/check-emp-code/{code} — public.
   *
   * Called by the login screen before anyone holds a token, to prefill the
   * company and unit. It therefore confirms whether a code exists, over a
   * short and largely sequential code space; the route's rate limit is what
   * bounds that. The response is kept to exactly the two fields the screen
   * consumes, as PHP does.
   */
  async checkEmpCode(code: string): Promise<{ company_code: string | null; unit: string | null }> {
    const found = await this.repo.findByEmpCode(code);

    if (!found) {
      throw new AuthError('Not found', 404);
    }

    return { company_code: found.company_code, unit: found.unit };
  }

  /**
   * POST /api/register — admin only.
   *
   * The only creation path for RBAC admin and agent accounts. Two values are
   * forced rather than left to the caller, and both matter:
   *
   *   emp_code  a null code plus a null type is precisely what
   *             UserController::getAppointment treats as a pending
   *             appointment, so every admin created here would surface in the
   *             Appointments list.
   *   type      role 4 is an agent; 'agent' is the value the rest of the app
   *             keys off, and without it fixing emp_code would instead have
   *             leaked agents into View Employees.
   */
  async register(input: {
    name: string;
    email: string;
    password: string;
    role?: number | string | null;
    companyCode?: string | null;
  }): Promise<{ user: SerializedUser }> {
    if (await this.repo.emailExists(input.email)) {
      throw new AuthError('The email has already been taken.', 422);
    }

    const role = Number.parseInt(String(input.role ?? 1), 10) || 1;

    const created = await this.repo.createUser({
      name: input.name,
      email: input.email,
      hashedPassword: await this.hasher.make(input.password),
      role,
      companyCode: input.companyCode ?? null,
      empCode: generateEmpCode(this.randomBytes),
      type: role === 4 ? 'agent' : null,
    });

    return { user: serializeUser(created) };
  }
}
