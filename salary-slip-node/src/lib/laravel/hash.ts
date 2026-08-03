import bcrypt from 'bcryptjs';

/**
 * Password hashing compatible with Laravel's default bcrypt driver.
 *
 * PHP's password_hash(..., PASSWORD_BCRYPT) emits the `$2y$` prefix, while
 * most Node libraries emit `$2b$`. The two are the same algorithm — `$2y$` was
 * PHP's marker after the 2011 crypt_blowfish sign-extension fix — but a
 * verifier that pattern-matches the prefix will reject perfectly valid stored
 * hashes. bcryptjs accepts both, and this module keeps that guarantee
 * explicit and tested rather than incidental.
 *
 * Every password in the users table was written by PHP, so verification has to
 * work on day one; only newly set passwords are written by this code.
 */

/** Laravel's default cost. Changing it does not invalidate existing hashes. */
export const DEFAULT_ROUNDS = 12;

const BCRYPT_PREFIX = /^\$2[aby]\$/;

export function isBcryptHash(value: string | null | undefined): boolean {
  return typeof value === 'string' && BCRYPT_PREFIX.test(value);
}

export async function make(
  plain: string,
  rounds: number = DEFAULT_ROUNDS,
): Promise<string> {
  return bcrypt.hash(plain, rounds);
}

/**
 * Verify a plaintext against a stored hash.
 *
 * Returns false rather than throwing on a malformed or non-bcrypt hash: some
 * legacy rows in this database hold plaintext or empty passwords, and a throw
 * here would turn "this user cannot log in" into "the login endpoint 500s".
 */
export async function check(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!isBcryptHash(hash)) return false;

  try {
    return await bcrypt.compare(plain, hash as string);
  } catch {
    return false;
  }
}

/** Whether a hash predates the current cost and should be re-hashed on login. */
export function needsRehash(
  hash: string | null | undefined,
  rounds: number = DEFAULT_ROUNDS,
): boolean {
  if (!isBcryptHash(hash)) return true;

  const cost = Number.parseInt((hash as string).split('$')[2] ?? '', 10);
  return Number.isNaN(cost) || cost !== rounds;
}
