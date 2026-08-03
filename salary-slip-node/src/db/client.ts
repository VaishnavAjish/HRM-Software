import { PrismaClient } from '../generated/prisma/index.js';
import { env, isProduction } from '../config/env.js';

/**
 * Prisma singleton.
 *
 * The schema is owned by Laravel's migrations. This client only ever reads and
 * writes rows — `prisma migrate` and `prisma db push` must never be run
 * against this database, or Prisma will try to reconcile it to a schema file
 * that is not the source of truth.
 */

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const db =
  globalThis.__prisma ??
  new PrismaClient({
    log: isProduction ? ['warn', 'error'] : ['warn', 'error'],
    datasources: { db: { url: env.DATABASE_URL } },
  });

// Reuse across hot reloads in dev; otherwise every restart leaks a pool.
if (!isProduction) globalThis.__prisma = db;

/**
 * users.id is BigInt in Postgres. JSON.stringify throws on BigInt, so it is
 * normalised at the boundary rather than left to surface as an opaque 500
 * somewhere in a response serializer.
 */
export const toNumber = (value: bigint | number | null | undefined): number =>
  typeof value === 'bigint' ? Number(value) : (value ?? 0);
