import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  issueToken,
  verifyToken,
  decodeUnsafe,
  subjectOf,
  TokenInvalidException,
  TokenExpiredException,
  PRV_APP_MODELS_USER,
} from './jwt.js';

/**
 * tymon/jwt-auth interoperability.
 *
 * Read alongside the bidirectional check in scripts/emit-token.ts: this file
 * proves Node reads what PHP issued, and that script proves PHP reads what
 * Node issued. Both directions are live simultaneously during the migration —
 * tokens already in browsers last 30 days, and once /login moves to Node every
 * endpoint still on Laravel must accept Node's tokens.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(
  readFileSync(path.join(here, '../../../tests/fixtures/laravel-vectors.json'), 'utf8'),
) as {
  jwt: {
    secret: string;
    issuer: string;
    prv: string;
    valid: string;
    claims: Record<string, unknown>;
    expired: string;
    missingRequiredClaim: string;
    wrongSignature: string;
  };
};

const { jwt: v } = vectors;

describe('Reading tokens PHP issued', () => {
  it('verifies a real tymon token', () => {
    const claims = verifyToken(v.valid, { secret: v.secret });
    expect(claims.sub).toBe('4242');
    expect(subjectOf(claims)).toBe(4242);
  });

  it('carries every claim tymon emits', () => {
    const claims = verifyToken(v.valid, { secret: v.secret });
    for (const name of ['iss', 'iat', 'exp', 'nbf', 'jti', 'sub', 'prv']) {
      expect(claims[name], `missing ${name}`).toBeDefined();
    }
  });

  it('treats sub as a string, as tymon does', () => {
    // A numeric sub would still verify, but would differ from every token in
    // circulation and break any string comparison against it.
    expect(typeof (v.claims as { sub: unknown }).sub).toBe('string');
    expect(typeof verifyToken(v.valid, { secret: v.secret }).sub).toBe('string');
  });

  it('agrees on the prv provider hash', () => {
    // sha1('App\\Models\\User') — the model class, not the auth provider.
    expect(v.prv).toBe(PRV_APP_MODELS_USER);
    expect(verifyToken(v.valid, { secret: v.secret }).prv).toBe(PRV_APP_MODELS_USER);
  });
});

describe('Rejecting what PHP would reject', () => {
  it('rejects an expired token distinguishably', () => {
    expect(() => verifyToken(v.expired, { secret: v.secret })).toThrow(TokenExpiredException);
  });

  it('rejects a tampered signature', () => {
    expect(() => verifyToken(v.wrongSignature, { secret: v.secret })).toThrow(
      TokenInvalidException,
    );
  });

  it('rejects a token missing a required claim', () => {
    // config/jwt.php required_claims includes jti; the signature here is
    // valid, so only the claim check can catch it.
    expect(() => verifyToken(v.missingRequiredClaim, { secret: v.secret })).toThrow(
      /Missing required claim: jti/,
    );
  });

  it('rejects a token signed with a different secret', () => {
    expect(() => verifyToken(v.valid, { secret: 'some-other-secret' })).toThrow(
      TokenInvalidException,
    );
  });

  it('refuses an unsigned "alg: none" token', () => {
    const b64 = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64({ typ: 'JWT', alg: 'none' })}.${b64(v.claims)}.`;

    // Pinning algorithms is what stops this; without it the token chooses.
    expect(() => verifyToken(forged, { secret: v.secret })).toThrow(TokenInvalidException);
  });

  it.each(['', 'not.a.token', 'a.b'])('rejects malformed input %j', (bad) => {
    expect(() => verifyToken(bad, { secret: v.secret })).toThrow(TokenInvalidException);
  });
});

describe('Issuing tokens PHP will accept', () => {
  const issue = (over: Partial<Parameters<typeof issueToken>[1]> = {}) =>
    issueToken(4242, {
      secret: v.secret,
      issuer: v.issuer,
      ttlMinutes: 43200,
      ...over,
    });

  it('round-trips through its own verifier', () => {
    expect(verifyToken(issue(), { secret: v.secret }).sub).toBe('4242');
  });

  it('emits the same claim set as tymon', () => {
    const mine = decodeUnsafe(issue())!;
    expect(Object.keys(mine).sort()).toEqual(Object.keys(v.claims).sort());
  });

  it('emits sub as a string even for a numeric id', () => {
    expect(decodeUnsafe(issue())!.sub).toBe('4242');
    expect(typeof decodeUnsafe(issue())!.sub).toBe('string');
  });

  it('defaults prv to the App\\Models\\User hash', () => {
    expect(decodeUnsafe(issue())!.prv).toBe(PRV_APP_MODELS_USER);
  });

  it('honours the 30-day TTL', () => {
    const now = 1_700_000_000;
    const claims = decodeUnsafe(issue({ now }))!;
    expect(claims.iat).toBe(now);
    expect(claims.nbf).toBe(now);
    expect(claims.exp).toBe(now + 43200 * 60);
  });

  it('gives every token a distinct jti so logout can blacklist one session', () => {
    const a = decodeUnsafe(issue())!.jti;
    const b = decodeUnsafe(issue())!.jti;
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9]{16}$/);
  });
});

describe('decodeUnsafe', () => {
  it('reads an expired token so logout can still blacklist it', () => {
    // The alternative is that signing out with a stale token 500s.
    expect(decodeUnsafe(v.expired)?.jti).toBeDefined();
  });

  it('returns null rather than throwing on rubbish', () => {
    expect(decodeUnsafe('rubbish')).toBeNull();
  });
});

describe('subjectOf', () => {
  it('rejects a non-numeric subject', () => {
    const token = issueToken('not-a-number', {
      secret: v.secret,
      issuer: v.issuer,
      ttlMinutes: 60,
    });
    expect(() => subjectOf(verifyToken(token, { secret: v.secret }))).toThrow(
      /not a user id/,
    );
  });
});
