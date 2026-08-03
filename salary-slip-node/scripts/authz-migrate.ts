/**
 * Migration runner for the authorization platform.
 *
 * `prisma migrate` must never touch this database — the schema is owned
 * elsewhere and Prisma would try to reconcile it against schema.prisma (see
 * src/db/client.ts). So the DDL lives in prisma/sql/*.sql and this runner
 * applies it through `prisma db execute`, which runs a script against the
 * datasource without reading or writing any migration state.
 *
 * Usage:
 *   npx tsx scripts/authz-migrate.ts status
 *   npx tsx scripts/authz-migrate.ts up
 *   npx tsx scripts/authz-migrate.ts up --dry-run
 *   npx tsx scripts/authz-migrate.ts down 0001 --confirm
 *
 * `down` refuses to run without --confirm: it drops tables.
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { db } from '../src/db/client.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const SQL_DIR = resolve(here, '../prisma/sql');
const SCHEMA = resolve(here, '../prisma/schema.prisma');

interface Migration {
  id: string;
  upFile: string;
  downFile: string | null;
}

function discover(): Migration[] {
  const files = readdirSync(SQL_DIR).filter((name) => name.endsWith('.sql'));
  const ids = [...new Set(files.map((name) => name.split('_')[0]).filter((id): id is string => Boolean(id)))].sort();

  return ids.map((id) => {
    const up = files.find((name) => name.startsWith(id) && name.endsWith('.up.sql'));
    const down = files.find((name) => name.startsWith(id) && name.endsWith('.down.sql'));
    if (!up) throw new Error(`Migration ${id} has no .up.sql`);

    return { id, upFile: join(SQL_DIR, up), downFile: down ? join(SQL_DIR, down) : null };
  });
}

/**
 * Tracking table. Deliberately separate from Laravel's `migrations` table:
 * writing into that would make `php artisan migrate:status` report rows whose
 * files do not exist in the PHP tree, which is the exact drift problem this
 * repo already has.
 */
async function ensureTrackingTable(): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS _authz_migrations (
      id          VARCHAR(40) PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_by  VARCHAR(190)
    )
  `);
}

async function applied(): Promise<Set<string>> {
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM _authz_migrations');
  return new Set(rows.map((row) => row.id));
}

/**
 * Prisma's CLI entry point, resolved from node_modules.
 *
 * Invoked through `node` rather than `npx` so the child process runs without a
 * shell. This repository lives at a path containing a space ("F:\HRMS oldd"),
 * and `execFileSync` with `shell: true` concatenates arguments *unescaped* —
 * so `--file F:\HRMS oldd\...` reached Prisma as `--file F:\HRMS`, which it
 * reported as "EISDIR: illegal operation on a directory". Dropping the shell
 * passes each argument as one argv entry regardless of what is in it, and also
 * silences the DEP0190 warning that flag emits.
 */
const require = createRequire(import.meta.url);

function prismaCli(): string {
  try {
    return require.resolve('prisma/build/index.js');
  } catch {
    // Older layouts expose the bin directly.
    return require.resolve('prisma');
  }
}

function runSqlFile(file: string): void {
  execFileSync(
    process.execPath,
    [prismaCli(), 'db', 'execute', '--file', file, '--schema', SCHEMA],
    { stdio: 'inherit' },
  );
}

async function up(dryRun: boolean): Promise<void> {
  await ensureTrackingTable();
  const done = await applied();
  const pending = discover().filter((migration) => !done.has(migration.id));

  if (pending.length === 0) {
    console.log('Nothing to apply. Schema is up to date.');
    return;
  }

  for (const migration of pending) {
    console.log(`${dryRun ? '[dry-run] would apply' : 'applying'} ${migration.id}`);
    if (dryRun) continue;

    runSqlFile(migration.upFile);
    await db.$executeRawUnsafe(
      'INSERT INTO _authz_migrations (id, applied_by) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
      migration.id,
      process.env.USERNAME ?? process.env.USER ?? 'unknown',
    );
    console.log(`applied ${migration.id}`);
  }
}

async function down(id: string, confirmed: boolean): Promise<void> {
  const migration = discover().find((candidate) => candidate.id === id);
  if (!migration) throw new Error(`Unknown migration ${id}`);
  if (!migration.downFile) throw new Error(`Migration ${id} has no .down.sql`);

  if (!confirmed) {
    console.error(
      `Refusing to roll back ${id} without --confirm.\n` +
        `This DROPS tables and destroys authorization data created since it was applied.\n` +
        `Take a dump first:  pg_dump -Fc -f authz-backup.dump "$DATABASE_URL"`,
    );
    process.exitCode = 1;
    return;
  }

  await ensureTrackingTable();
  runSqlFile(migration.downFile);
  await db.$executeRawUnsafe('DELETE FROM _authz_migrations WHERE id = $1', id);
  console.log(`rolled back ${id}`);
}

async function status(): Promise<void> {
  await ensureTrackingTable();
  const done = await applied();

  for (const migration of discover()) {
    console.log(`${done.has(migration.id) ? 'applied ' : 'PENDING '} ${migration.id}`);
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((arg) => arg.startsWith('--')));
  const positional = rest.filter((arg) => !arg.startsWith('--'));

  switch (command) {
    case 'up':
      await up(flags.has('--dry-run'));
      break;
    case 'down': {
      const id = positional[0];
      if (!id) throw new Error('Usage: authz-migrate.ts down <id> --confirm');
      await down(id, flags.has('--confirm'));
      break;
    }
    case 'status':
    case undefined:
      await status();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
