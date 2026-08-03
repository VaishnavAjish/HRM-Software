import { check as checkPassword } from '../../lib/laravel/hash.js';
import {
  issueToken,
  verifyToken,
  decodeUnsafe,
  subjectOf,
  TokenExpiredException,
  TokenInvalidException,
  type LaravelJwtClaims,
} from '../../lib/laravel/jwt.js';
import { serializeUser, type SerializedUser, type UserRowLike } from '../users/user.serializer.js';
import type { TokenBlacklist } from './token-blacklist.js';

/**
 * Auth behaviour, ported from App\Http\Controllers\AuthController.
 *
 * Depends on a repository interface rather than Prisma so the rules below can
 * be tested without touching the production database — the only database
 * available here is the live one, and login writes (it clears status 2).
 */

export interface AuthUserRow extends UserRowLike {
  id: number;
  email: string | null;
  emp_code: string | null;
  password: string | null;
  status: number | string | null;
  is_deleted: number | string | null;
}

export interface AuthRepository {
  /** Laravel's retrieveByCredentials: a single `where(field, value)->first()`. */
  findByLoginField(field: 'email' | 'emp_code', value: string): Promise<AuthUserRow | null>;
  findById(id: number): Promise<AuthUserRow | null>;
  /** Used only to clear status 2 on first successful login. */
  markActivated(id: number): Promise<void>;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthServiceOptions {
  jwtSecret: string;
  jwtTtlMinutes: number;
  issuer: string;
}

export interface LoginResult {
  token: string;
  tokenType: 'Bearer';
  user: SerializedUser;
}

/**
 * Laravel decides which column to match on with filter_var(FILTER_VALIDATE_EMAIL).
 * Anything that is not a valid email is treated as an employee code, which is
 * what lets staff sign in with "1138".
 */
export function loginFieldFor(input: string): 'email' | 'emp_code' {
  // Deliberately close to PHP's filter_var rather than a permissive regex:
  // classifying "1138" as an email would look up the wrong column and fail
  // every code-based login.
  const looksLikeEmail = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(input);
  return looksLikeEmail ? 'email' : 'emp_code';
}

const toInt = (v: unknown): number => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isNaN(n) ? 0 : n;
};

export class AuthService {
  constructor(
    private readonly users: AuthRepository,
    private readonly blacklist: TokenBlacklist,
    private readonly options: AuthServiceOptions,
  ) {}

  /**
   * POST /api/login
   *
   * Order of checks matches PHP exactly, and the order is observable: wrong
   * credentials give 401 "Invalid credentials", while correct credentials for a
   * deactivated account give 403 "Account is deactivated". Swapping them would
   * turn the endpoint into an oracle for which accounts exist.
   */
  async login(rawInput: string, password: string): Promise<LoginResult> {
    const input = rawInput.trim();
    const field = loginFieldFor(input);

    const user = await this.users.findByLoginField(field, input);

    // One message and one status for "no such user" and "wrong password".
    if (!user || !(await checkPassword(password, user.password))) {
      throw new AuthError('Invalid credentials', 401);
    }

    if (toInt(user.is_deleted) === 1) {
      throw new AuthError('Account is deactivated', 403);
    }

    // status 2 means "invited, never signed in". First successful login
    // promotes the account to active.
    if (toInt(user.status) === 2) {
      await this.users.markActivated(user.id);
      user.status = 0;
    }

    return {
      token: issueToken(user.id, {
        secret: this.options.jwtSecret,
        issuer: this.options.issuer,
        ttlMinutes: this.options.jwtTtlMinutes,
      }),
      tokenType: 'Bearer',
      user: serializeUser(user),
    };
  }

  /**
   * Resolve the caller from a bearer token.
   *
   * Rejects blacklisted tokens, which is what makes logout mean anything: the
   * signature stays valid for up to 30 days after signing out.
   */
  async authenticate(token: string): Promise<{ user: AuthUserRow; claims: LaravelJwtClaims }> {
    const claims = verifyToken(token, { secret: this.options.jwtSecret });

    if (await this.blacklist.has(claims.jti)) {
      throw new AuthError('Token has been blacklisted', 401);
    }

    const user = await this.users.findById(subjectOf(claims));
    if (!user) {
      throw new AuthError('User not found', 404);
    }
    if (toInt(user.is_deleted) === 1) {
      throw new AuthError('Account is deactivated', 403);
    }

    return { user, claims };
  }

  /** GET /api/profile — the caller's own record, including the full Aadhaar. */
  async me(user: AuthUserRow, full: string | null): Promise<SerializedUser> {
    // You own this identity document, so the complete number is disclosed
    // without needing a separate grant.
    return serializeUser(user, { full });
  }

  /**
   * POST /api/logout — idempotent and unconditionally successful.
   *
   * A logout arriving with an expired, malformed or absent token must still
   * report success and still blacklist whatever it can. The PHP version was
   * changed to work this way after the previous one threw a 500 and left the
   * token valid for up to a month on a machine whose user believed they had
   * signed out. There is no state in which "you are still signed in" is the
   * safer answer.
   */
  async logout(token: string | null): Promise<{ revoked: boolean }> {
    if (!token) return { revoked: false };

    // decodeUnsafe, not verifyToken: an expired token still needs blacklisting,
    // and verification would throw before the jti could be read.
    const claims = decodeUnsafe(token);
    if (!claims?.jti) return { revoked: false };

    try {
      const exp = typeof claims.exp === 'number' ? claims.exp : Math.floor(Date.now() / 1000);
      await this.blacklist.add(claims.jti, exp);
      return { revoked: true };
    } catch {
      // A blacklist refusing writes must not keep the user signed in; the
      // caller reports success regardless and logs this.
      return { revoked: false };
    }
  }
}

export { TokenExpiredException, TokenInvalidException };
