import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

/**
 * Token compatibility with tymon/jwt-auth.
 *
 * This has to work in BOTH directions, which is easy to miss. During the
 * strangler-fig migration some endpoints still run on PHP, so:
 *
 *   PHP-issued token  -> verified by Node   (users already signed in; TTL is
 *                                            30 days, so this matters for a
 *                                            month after cutover)
 *   Node-issued token -> verified by PHP    (once /login moves to Node, every
 *                                            endpoint still on Laravel has to
 *                                            accept what Node handed out)
 *
 * The claim set was read off a real tymon token rather than reconstructed:
 *
 *   header  {"typ":"JWT","alg":"HS256"}
 *   claims  iss, iat, exp, nbf, jti, sub, prv
 *
 * Two details that break naive ports:
 *
 *   sub  is a JSON **string** ("4242"), not a number.
 *   prv  is sha1 of the **model** class name — sha1('App\Models\User') —
 *        not of the auth provider class, which is the intuitive guess.
 */

/** sha1('App\Models\User') — the value tymon puts in `prv` for this app. */
export const PRV_APP_MODELS_USER = '23bd5c8949f600adb39e701c400872db7a5976f7';

/** config/jwt.php required_claims. A token missing any of these is invalid. */
const REQUIRED_CLAIMS = ['iss', 'iat', 'exp', 'nbf', 'sub', 'jti'] as const;

export interface LaravelJwtClaims {
  iss: string;
  iat: number;
  exp: number;
  nbf: number;
  jti: string;
  sub: string;
  prv?: string;
  [key: string]: unknown;
}

export class TokenInvalidException extends Error {
  constructor(message = 'Token is invalid') {
    super(message);
    this.name = 'TokenInvalidException';
  }
}

export class TokenExpiredException extends Error {
  constructor(message = 'Token has expired') {
    super(message);
    this.name = 'TokenExpiredException';
  }
}

/** tymon uses Str::random(16) — alphanumeric, mixed case. */
function randomJti(length = 16): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export interface IssueOptions {
  secret: string;
  /** tymon fills this from the request URL; PHP does not validate its value. */
  issuer: string;
  ttlMinutes: number;
  prv?: string;
  /** Injectable so tests are deterministic. Seconds since epoch. */
  now?: number;
}

export function issueToken(userId: number | string, options: IssueOptions): string {
  const now = options.now ?? Math.floor(Date.now() / 1000);

  const claims: LaravelJwtClaims = {
    iss: options.issuer,
    iat: now,
    exp: now + options.ttlMinutes * 60,
    nbf: now,
    jti: randomJti(),
    // String, matching tymon. A numeric sub here is accepted by PHP but
    // differs from every token already in circulation, and any code that
    // compares claims as strings would quietly stop matching.
    sub: String(userId),
    prv: options.prv ?? PRV_APP_MODELS_USER,
  };

  // Do NOT pass noTimestamp here. It reads as "don't add an iat", but
  // jsonwebtoken implements it as `delete payload.iat` — which strips the one
  // set above and produces a token tymon rejects for a missing required claim.
  // With it omitted the library keeps an iat already present in the payload.
  return jwt.sign(claims, options.secret, { algorithm: 'HS256' });
}

export interface VerifyOptions {
  secret: string;
  /** config/jwt.php 'leeway', default 0. */
  leewaySeconds?: number;
  now?: number;
}

export function verifyToken(token: string, options: VerifyOptions): LaravelJwtClaims {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, options.secret, {
      algorithms: ['HS256'], // pinned: never let the token pick, or `alg: none` walks in
      clockTolerance: options.leewaySeconds ?? 0,
      ...(options.now !== undefined ? { clockTimestamp: options.now } : {}),
    });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredException();
    }
    throw new TokenInvalidException();
  }

  if (typeof decoded !== 'object' || decoded === null) {
    throw new TokenInvalidException();
  }

  const claims = decoded as LaravelJwtClaims;

  for (const claim of REQUIRED_CLAIMS) {
    if (claims[claim] === undefined || claims[claim] === null || claims[claim] === '') {
      throw new TokenInvalidException(`Missing required claim: ${claim}`);
    }
  }

  return claims;
}

/**
 * Decode without verifying — for reading a jti out of an expired token so it
 * can still be blacklisted on logout. Never use this to authenticate.
 */
export function decodeUnsafe(token: string): LaravelJwtClaims | null {
  const decoded = jwt.decode(token);
  return decoded && typeof decoded === 'object' ? (decoded as LaravelJwtClaims) : null;
}

/** The user id a verified token identifies. */
export function subjectOf(claims: LaravelJwtClaims): number {
  const id = Number.parseInt(claims.sub, 10);
  if (Number.isNaN(id)) {
    throw new TokenInvalidException('Subject claim is not a user id');
  }
  return id;
}
