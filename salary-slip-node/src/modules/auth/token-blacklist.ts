/**
 * tymon/jwt-auth's token blacklist, stored where Laravel actually keeps it.
 *
 * This has to be the *same* store as PHP's, not a parallel one. During the
 * migration both backends are live: signing out through Node must invalidate
 * the token for the Laravel endpoints too, and vice versa. A separate Redis or
 * in-memory blacklist would leave a "logged out" token working on half the API.
 *
 * Format, read off a real entry the PHP blacklist wrote:
 *
 *   table   cache
 *   key     laravel-cache-<jti>        (prefix from config('cache.prefix'))
 *   value   a:1:{s:11:"valid_until";i:1785745570;}     PHP serialize()
 *
 * Worth noting how the driver is resolved: .env sets CACHE_DRIVER=file, but
 * Laravel 11 renamed that variable to CACHE_STORE, so it is ignored and the
 * config default ('database') wins. The blacklist therefore lives in Postgres,
 * not on disk — which is the only reason this is shareable at all.
 */

export interface CacheStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, expiresAtUnix: number): Promise<void>;
  forget(key: string): Promise<void>;
}

/** config('cache.prefix') for this application. */
export const CACHE_PREFIX = 'laravel-cache-';

/**
 * Emit the one PHP-serialized shape tymon stores. A general-purpose serializer
 * would be more code and more risk for a structure that never varies.
 */
export function serializeValidUntil(validUntil: number): string {
  return `a:1:{s:11:"valid_until";i:${Math.trunc(validUntil)};}`;
}

/** Read `valid_until` back out, tolerating anything unexpected. */
export function parseValidUntil(value: string | null): number | null {
  if (!value) return null;
  const match = /"valid_until";i:(\d+);/.exec(value);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

export class TokenBlacklist {
  constructor(
    private readonly cache: CacheStore,
    /** config('jwt.blacklist_grace_period'), default 0 seconds. */
    private readonly gracePeriodSeconds = 0,
  ) {}

  private keyFor(jti: string): string {
    return `${CACHE_PREFIX}${jti}`;
  }

  /**
   * Blacklist a token until its own expiry.
   *
   * The cache entry is set to expire when the token does: past that point the
   * token is invalid on its own merits, so keeping the row would only grow the
   * table. `exp` comes from the token, so a caller cannot use this to write an
   * unbounded entry.
   */
  async add(jti: string, tokenExpUnix: number, now = Math.floor(Date.now() / 1000)): Promise<void> {
    const validUntil = now + this.gracePeriodSeconds;
    await this.cache.put(this.keyFor(jti), serializeValidUntil(validUntil), tokenExpUnix);
  }

  /**
   * Whether a token is blacklisted.
   *
   * The grace period lets requests already in flight finish: an entry exists
   * from the moment of logout, but only bites once `valid_until` has passed.
   * With the configured grace period of 0 that is immediate.
   */
  async has(jti: string, now = Math.floor(Date.now() / 1000)): Promise<boolean> {
    const validUntil = parseValidUntil(await this.cache.get(this.keyFor(jti)));
    if (validUntil === null) return false;
    return now >= validUntil;
  }

  async remove(jti: string): Promise<void> {
    await this.cache.forget(this.keyFor(jti));
  }
}
