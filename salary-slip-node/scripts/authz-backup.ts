/**
 * Pre-migration snapshot of the legacy RBAC tables.
 *
 * pg_dump is not installed on this host (the PostgreSQL directory ships lib
 * and share only), so the safety net is in-database: a plain copy of every
 * table migration 0001 touches, taken before it runs.
 *
 * This is not a substitute for a real dump — it lives in the same database it
 * is protecting. It exists so the legacy rows can be restored if the ALTERs
 * have to be reversed, which together with 0001_...down.sql is enough to get
 * back to the pre-migration shape.
 *
 *   npx tsx scripts/authz-backup.ts create
 *   npx tsx scripts/authz-backup.ts verify
 *   npx tsx scripts/authz-backup.ts drop --confirm
 */

import { db } from '../src/db/client.js';

/** Every table 0001 alters, plus the two it reads for the data migration. */
const TABLES = [
  'roles',
  'permissions',
  'permission_groups',
  'role_permissions',
  'user_permissions',
  'user_roles',
  'permission_dimensions',
] as const;

const backupName = (table: string) => `_pre_authz_${table}`;

async function create(): Promise<void> {
  for (const table of TABLES) {
    const target = backupName(table);

    const [existing] = await db.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1`,
      target,
    );

    if ((existing?.n ?? 0) > 0) {
      console.log(`skip   ${target} (already exists — not overwriting an earlier snapshot)`);
      continue;
    }

    // CREATE TABLE AS copies rows and column types but no constraints, which
    // is what is wanted: this is a data snapshot, not a schema clone.
    await db.$executeRawUnsafe(`CREATE TABLE ${target} AS SELECT * FROM ${table}`);

    const [count] = await db.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM ${target}`,
    );
    console.log(`create ${target}  (${count?.n ?? 0} rows)`);
  }
}

async function verify(): Promise<void> {
  for (const table of TABLES) {
    const target = backupName(table);

    const rows = await db.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1`,
      target,
    );

    if ((rows[0]?.n ?? 0) === 0) {
      console.log(`MISSING ${target}`);
      continue;
    }

    const [live] = await db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM ${table}`);
    const [snap] = await db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM ${target}`);
    const match = live?.n === snap?.n ? 'same' : 'DIFFERS';

    console.log(`${target}: snapshot=${snap?.n ?? 0} live=${live?.n ?? 0} (${match})`);
  }
}

async function drop(confirmed: boolean): Promise<void> {
  if (!confirmed) {
    console.error('Refusing to drop snapshots without --confirm.');
    process.exitCode = 1;
    return;
  }

  for (const table of TABLES) {
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS ${backupName(table)}`);
    console.log(`dropped ${backupName(table)}`);
  }
}

const [command, ...rest] = process.argv.slice(2);
const confirmed = rest.includes('--confirm');

try {
  if (command === 'create') await create();
  else if (command === 'drop') await drop(confirmed);
  else await verify();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
