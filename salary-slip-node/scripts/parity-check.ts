/**
 * Prove the compatibility layer against real production data and the real
 * secrets — the thing the fixture tests cannot do, because they deliberately
 * use fixed test keys.
 *
 * Prints PASS/FAIL and masked values only. No Aadhaar, no key, no token, no
 * password hash ever reaches stdout.
 *
 *   npx tsx scripts/parity-check.ts
 */
import { env } from '../src/config/env.js';
import { db } from '../src/db/client.js';
import { LaravelEncrypter } from '../src/lib/laravel/crypt.js';
import { isValid, mask, secureReference } from '../src/lib/laravel/aadhaar.js';
import { issueToken, verifyToken, subjectOf } from '../src/lib/laravel/jwt.js';
import { isBcryptHash } from '../src/lib/laravel/hash.js';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};

console.log('\nLaravel compatibility, against production data and real secrets\n');

// ---- encryption -----------------------------------------------------------

const encrypter = new LaravelEncrypter(env.APP_KEY);

const encrypted = await db.users.findMany({
  where: { encrypted_aadhaar_number: { not: null } },
  select: { id: true, encrypted_aadhaar_number: true, aadhaar_last_four: true },
  take: 25,
});

console.log(`encrypted_aadhaar_number rows sampled: ${encrypted.length}`);

let decrypted = 0;
let lastFourMatched = 0;
for (const row of encrypted) {
  const plain = encrypter.tryDecryptString(row.encrypted_aadhaar_number);
  if (plain && isValid(plain)) {
    decrypted++;
    if (!row.aadhaar_last_four || plain.slice(-4) === row.aadhaar_last_four) lastFourMatched++;
  }
}

if (encrypted.length > 0) {
  check('every sampled row decrypts to a valid Aadhaar', decrypted === encrypted.length,
    `(${decrypted}/${encrypted.length})`);
  check('decrypted value agrees with the stored last four', lastFourMatched === decrypted,
    `(${lastFourMatched}/${decrypted})`);

  const sample = encrypter.tryDecryptString(encrypted[0]!.encrypted_aadhaar_number);
  if (sample) console.log(`        sample renders as: ${mask(sample)}`);
} else {
  console.log('  SKIP  no encrypted rows to sample');
}

// ---- secure reference -----------------------------------------------------

const withReference = await db.users.findFirst({
  where: { aadhaar_secure_reference: { not: null }, encrypted_aadhaar_number: { not: null } },
  select: { encrypted_aadhaar_number: true, aadhaar_secure_reference: true },
});

if (withReference) {
  const plain = encrypter.tryDecryptString(withReference.encrypted_aadhaar_number);
  const recomputed = plain ? secureReference(plain, env.AADHAAR_REFERENCE_SECRET) : null;

  // If this differs, every existing document folder is orphaned.
  check('recomputed reference matches the stored one',
    recomputed === withReference.aadhaar_secure_reference);
} else {
  console.log('  SKIP  no row carries both a reference and ciphertext');
}

// ---- password hashes ------------------------------------------------------

const hashes = await db.users.findMany({
  where: { password: { not: null } },
  select: { password: true },
  take: 50,
});
const bcryptCount = hashes.filter((h) => isBcryptHash(h.password)).length;
check('stored password hashes are bcrypt-shaped', bcryptCount > 0,
  `(${bcryptCount}/${hashes.length} bcrypt; the rest are legacy and simply cannot log in)`);

// ---- JWT ------------------------------------------------------------------

const token = issueToken(4242, {
  secret: env.JWT_SECRET,
  issuer: 'http://parity-check',
  ttlMinutes: env.JWT_TTL,
});
check('a token signed with the real secret verifies',
  subjectOf(verifyToken(token, { secret: env.JWT_SECRET })) === 4242);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);

await db.$disconnect();
process.exit(failures === 0 ? 0 : 1);
