/**
 * Emit a Node-issued token so PHP can be asked to verify it.
 *
 * This is the direction that is easy to forget: during the strangler-fig
 * migration /login moves to Node while other endpoints are still served by
 * Laravel, so every token Node hands out must satisfy tymon's validation.
 *
 *   npx tsx scripts/emit-token.ts <secret> <issuer> [userId] [ttlMinutes]
 */
import { issueToken } from '../src/lib/laravel/jwt.js';

const [secret, issuer, userId = '4242', ttl = '43200'] = process.argv.slice(2);

if (!secret || !issuer) {
  console.error('usage: emit-token.ts <secret> <issuer> [userId] [ttlMinutes]');
  process.exit(2);
}

process.stdout.write(
  issueToken(userId, {
    secret,
    issuer,
    ttlMinutes: Number.parseInt(ttl, 10),
  }),
);
