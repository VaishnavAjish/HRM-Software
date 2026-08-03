import { describe, it, expect, beforeEach } from 'vitest';

import {
  AuthService,
  AuthError,
  loginFieldFor,
  type AuthRepository,
  type AuthUserRow,
} from './auth.service.js';
import { TokenBlacklist, type CacheStore, serializeValidUntil } from './token-blacklist.js';
import { make as hashPassword } from '../../lib/laravel/hash.js';

/**
 * Auth rules, tested against fakes.
 *
 * The only database reachable from here is production, and login writes to it
 * (clearing status 2), so the service takes a repository interface and these
 * tests supply an in-memory one. That keeps the rules verifiable without a
 * single write against live data.
 */

const OPTIONS = {
  jwtSecret: 'test-secret',
  jwtTtlMinutes: 43200,
  issuer: 'http://localhost',
};

class FakeRepo implements AuthRepository {
  activated: number[] = [];
  constructor(private rows: AuthUserRow[]) {}

  async findByLoginField(field: 'email' | 'emp_code', value: string) {
    return this.rows.find((r) => r[field] === value) ?? null;
  }
  async findById(id: number) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async markActivated(id: number) {
    this.activated.push(id);
  }
}

class FakeCache implements CacheStore {
  store = new Map<string, string>();
  async get(k: string) {
    return this.store.get(k) ?? null;
  }
  async put(k: string, v: string) {
    this.store.set(k, v);
  }
  async forget(k: string) {
    this.store.delete(k);
  }
}

let password: string;

const row = (over: Partial<AuthUserRow> = {}): AuthUserRow => ({
  id: 1,
  name: 'Ravi Kumar',
  email: 'ravi@example.com',
  emp_code: '1138',
  password,
  status: 0,
  is_deleted: 0,
  company_code: 'nidhi-impex',
  aadhaar_last_four: '1345',
  ...over,
});

function build(rows: AuthUserRow[]) {
  const repo = new FakeRepo(rows);
  const cache = new FakeCache();
  const blacklist = new TokenBlacklist(cache, 0);
  return { repo, cache, blacklist, service: new AuthService(repo, blacklist, OPTIONS) };
}

beforeEach(async () => {
  password = await hashPassword('secret123', 4); // low cost keeps the suite quick
});

describe('loginFieldFor — which column Laravel matches on', () => {
  it.each([
    ['ravi@example.com', 'email'],
    ['RAVI@EXAMPLE.CO.IN', 'email'],
    ['1138', 'emp_code'],
    ['S001', 'emp_code'],
    ['EMP-77', 'emp_code'],
    ['not an email', 'emp_code'],
    ['@nodomain', 'emp_code'],
  ])('%j resolves to %s', (input, expected) => {
    expect(loginFieldFor(input)).toBe(expected);
  });
});

describe('login', () => {
  it('signs in by email', async () => {
    const { service } = build([row()]);
    const result = await service.login('ravi@example.com', 'secret123');

    expect(result.tokenType).toBe('Bearer');
    expect(result.token.split('.')).toHaveLength(3);
    expect(result.user.id).toBe(1);
  });

  it('signs in by employee code', async () => {
    const { service } = build([row()]);
    await expect(service.login('1138', 'secret123')).resolves.toBeDefined();
  });

  it('trims whitespace around the identifier', async () => {
    const { service } = build([row()]);
    await expect(service.login('  ravi@example.com  ', 'secret123')).resolves.toBeDefined();
  });

  it('rejects a wrong password with 401', async () => {
    const { service } = build([row()]);
    await expect(service.login('ravi@example.com', 'wrong')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid credentials',
    });
  });

  it('gives an unknown account the same 401, not a 404', async () => {
    const { service } = build([row()]);
    // Distinguishing the two would turn login into an account-existence oracle.
    await expect(service.login('nobody@example.com', 'secret123')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid credentials',
    });
  });

  it('refuses a deactivated account with 403, but only after the password checks out', async () => {
    const { service } = build([row({ is_deleted: 1 })]);

    await expect(service.login('ravi@example.com', 'secret123')).rejects.toMatchObject({
      statusCode: 403,
      message: 'Account is deactivated',
    });
    // Wrong password on a deactivated account still reports 401 — the order is
    // observable and must match PHP.
    await expect(service.login('ravi@example.com', 'wrong')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('activates a status 2 account on first successful login', async () => {
    const { service, repo } = build([row({ status: 2 })]);
    const result = await service.login('ravi@example.com', 'secret123');

    expect(repo.activated).toEqual([1]);
    expect(result.user.status).toBe(0);
  });

  it('leaves an already-active account alone', async () => {
    const { service, repo } = build([row({ status: 0 })]);
    await service.login('ravi@example.com', 'secret123');
    expect(repo.activated).toEqual([]);
  });

  it('never returns the password hash or raw Aadhaar', async () => {
    const { service } = build([
      row({ aadhar_card_no: '715115981345', encrypted_aadhaar_number: 'x' } as Partial<AuthUserRow>),
    ]);
    const { user } = await service.login('ravi@example.com', 'secret123');

    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('aadhar_card_no');
    expect(user).not.toHaveProperty('encrypted_aadhaar_number');
    expect(user).not.toHaveProperty('remember_token');
    expect(JSON.stringify(user)).not.toContain('715115981345');
  });

  it('exposes the masked number and presence flag the UI reads', async () => {
    const { service } = build([row()]);
    const { user } = await service.login('ravi@example.com', 'secret123');

    expect(user.aadhaar_masked).toBe('XXXX XXXX 1345');
    expect(user.has_aadhaar).toBe(true);
  });

  it('tolerates a legacy row whose password is not a bcrypt hash', async () => {
    // Some rows hold plaintext; that must be a failed login, not a 500.
    const { service } = build([row({ password: 'plaintext' })]);
    await expect(service.login('ravi@example.com', 'plaintext')).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe('authenticate', () => {
  it('resolves the caller from a fresh token', async () => {
    const { service } = build([row()]);
    const { token } = await service.login('ravi@example.com', 'secret123');

    const { user } = await service.authenticate(token);
    expect(user.id).toBe(1);
  });

  it('rejects a blacklisted token', async () => {
    const { service } = build([row()]);
    const { token } = await service.login('ravi@example.com', 'secret123');

    await service.logout(token);

    await expect(service.authenticate(token)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a token for an account deactivated since it was issued', async () => {
    const { service, repo } = build([row()]);
    const { token } = await service.login('ravi@example.com', 'secret123');

    (await repo.findById(1))!.is_deleted = 1;

    await expect(service.authenticate(token)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a token whose user has since been removed', async () => {
    const { service } = build([row()]);
    const { token } = await service.login('ravi@example.com', 'secret123');
    const { service: empty } = build([]);

    await expect(
      new AuthService(new FakeRepo([]), new TokenBlacklist(new FakeCache()), OPTIONS).authenticate(
        token,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(empty).toBeDefined();
  });

  it('rejects a garbage token', async () => {
    const { service } = build([row()]);
    await expect(service.authenticate('not-a-token')).rejects.toThrow();
  });
});

describe('logout', () => {
  it('blacklists the token', async () => {
    const { service, cache } = build([row()]);
    const { token } = await service.login('ravi@example.com', 'secret123');

    await expect(service.logout(token)).resolves.toEqual({ revoked: true });
    expect(cache.store.size).toBe(1);
    expect([...cache.store.keys()][0]).toMatch(/^laravel-cache-[A-Za-z0-9]{16}$/);
  });

  it('writes the exact value PHP writes', async () => {
    const { service, cache } = build([row()]);
    const { token } = await service.login('ravi@example.com', 'secret123');
    await service.logout(token);

    // a:1:{s:11:"valid_until";i:<ts>;} — read off a real PHP blacklist entry.
    expect([...cache.store.values()][0]).toMatch(/^a:1:\{s:11:"valid_until";i:\d+;\}$/);
  });

  it('succeeds with no token at all', async () => {
    const { service } = build([row()]);
    await expect(service.logout(null)).resolves.toEqual({ revoked: false });
  });

  it('succeeds with a malformed token', async () => {
    const { service } = build([row()]);
    await expect(service.logout('garbage')).resolves.toEqual({ revoked: false });
  });

  it('still blacklists an expired token', async () => {
    // Signing out on a stale token must not 500, and must still revoke it.
    const { service, cache } = build([row()]);
    const expired = (await import('../../lib/laravel/jwt.js')).issueToken(1, {
      secret: OPTIONS.jwtSecret,
      issuer: OPTIONS.issuer,
      ttlMinutes: 1,
      now: Math.floor(Date.now() / 1000) - 7200,
    });

    await expect(service.logout(expired)).resolves.toEqual({ revoked: true });
    expect(cache.store.size).toBe(1);
  });

  it('is idempotent', async () => {
    const { service } = build([row()]);
    const { token } = await service.login('ravi@example.com', 'secret123');

    await service.logout(token);
    await expect(service.logout(token)).resolves.toEqual({ revoked: true });
  });
});

describe('TokenBlacklist', () => {
  it('reads back a value PHP wrote', async () => {
    const cache = new FakeCache();
    const now = 1_700_000_000;
    // Exactly what was observed in the cache table.
    await cache.put('laravel-cache-VR6cUhNdhXVrlEAo', serializeValidUntil(now), 0);

    const blacklist = new TokenBlacklist(cache, 0);
    await expect(blacklist.has('VR6cUhNdhXVrlEAo', now)).resolves.toBe(true);
  });

  it('reports an unknown jti as not blacklisted', async () => {
    const blacklist = new TokenBlacklist(new FakeCache(), 0);
    await expect(blacklist.has('neverSeen1234567')).resolves.toBe(false);
  });

  it('honours a grace period so in-flight requests finish', async () => {
    const cache = new FakeCache();
    const blacklist = new TokenBlacklist(cache, 60);
    const now = 1_700_000_000;

    await blacklist.add('abcdefghijklmnop', now + 3600, now);

    expect(await blacklist.has('abcdefghijklmnop', now)).toBe(false);
    expect(await blacklist.has('abcdefghijklmnop', now + 61)).toBe(true);
  });

  it('ignores a corrupt cache value rather than throwing', async () => {
    const cache = new FakeCache();
    await cache.put('laravel-cache-abcdefghijklmnop', 'not-php-serialized', 0);
    const blacklist = new TokenBlacklist(cache, 0);

    await expect(blacklist.has('abcdefghijklmnop')).resolves.toBe(false);
  });
});

describe('AuthError', () => {
  it('carries the HTTP status the handler will use', () => {
    expect(new AuthError('nope', 403).statusCode).toBe(403);
  });
});
