import { db, toNumber } from '../../db/client.js';
import type { AuthRepository, AuthUserRow } from './auth.service.js';
import type { CacheStore } from './token-blacklist.js';

/**
 * Prisma-backed implementations of the interfaces the auth service depends on.
 *
 * All the decision-making lives in the service; this file only translates
 * between Prisma rows and plain objects. That split is what lets the rules be
 * tested without a database — which matters here because the only database
 * available is production, and login writes to it.
 */

/** Prisma hands back BigInt for id; the rest of the app works in numbers. */
function normalise(row: Record<string, unknown> | null): AuthUserRow | null {
  if (!row) return null;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'bigint' ? Number(value) : value;
  }
  return out as unknown as AuthUserRow;
}

export class PrismaAuthRepository implements AuthRepository {
  /**
   * Mirrors Laravel's retrieveByCredentials: a single `where(field, value)`
   * taking the first match.
   *
   * Note emp_code is not unique — the same code can exist in more than one
   * company — so a code-based login resolves to whichever row comes first.
   * That ambiguity is inherited from the PHP implementation and preserved
   * deliberately; changing it here would change who can sign in.
   */
  async findByLoginField(field: 'email' | 'emp_code', value: string): Promise<AuthUserRow | null> {
    const row = await db.users.findFirst({ where: { [field]: value } });
    return normalise(row as Record<string, unknown> | null);
  }

  async findById(id: number): Promise<AuthUserRow | null> {
    const row = await db.users.findUnique({ where: { id: BigInt(id) } });
    return normalise(row as Record<string, unknown> | null);
  }

  /**
   * Clear the "invited, never signed in" state.
   *
   * status is a VarChar in this schema, not an integer, so the value written
   * is the string "0" — writing a number would store "0" anyway via coercion
   * but makes the column's real type easy to forget.
   */
  async markActivated(id: number): Promise<void> {
    await db.users.update({ where: { id: BigInt(id) }, data: { status: '0' } });
  }
}

/**
 * Laravel's database cache store, as far as the JWT blacklist needs it.
 *
 * Deliberately the same rows PHP reads and writes: signing out through Node
 * must invalidate the token for the Laravel endpoints still in service, and
 * vice versa.
 */
export class PrismaCacheStore implements CacheStore {
  async get(key: string): Promise<string | null> {
    const row = await db.cache.findUnique({ where: { key } });
    if (!row) return null;

    // Laravel treats a past expiration as a miss and prunes lazily; an expired
    // blacklist entry must not keep a token revoked beyond its own lifetime.
    if (row.expiration <= Math.floor(Date.now() / 1000)) return null;

    return row.value;
  }

  async put(key: string, value: string, expiresAtUnix: number): Promise<void> {
    await db.cache.upsert({
      where: { key },
      create: { key, value, expiration: Math.trunc(expiresAtUnix) },
      update: { value, expiration: Math.trunc(expiresAtUnix) },
    });
  }

  async forget(key: string): Promise<void> {
    await db.cache.deleteMany({ where: { key } });
  }
}

export { toNumber };
