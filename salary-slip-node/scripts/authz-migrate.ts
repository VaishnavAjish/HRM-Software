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
 *   npx tsx scripts/authz-migrate.ts doctor
 *   npx tsx scripts/authz-migrate.ts up [--dry-run]
 *   npx tsx scripts/authz-migrate.ts down 0001 --confirm --reason "why"
 *
 * ---------------------------------------------------------------------------
 * Why this is more careful than it used to be
 * ---------------------------------------------------------------------------
 * On 2026-08-03 `down 0001 --confirm` was run while 0003 and 0004 — both built
 * on top of 0001 — were applied. The rollback dropped their objects and left
 * their ledger rows behind, so the runner then believed work was done that no
 * longer existed. A later `up` would have re-applied 0001/0002, SKIPPED
 * 0003/0004, and rebuilt a schema missing eighteen columns the PHP controllers
 * write to — silently, because from the ledger's point of view there was
 * nothing left to do.
 *
 * The old `down` also did `DELETE FROM _authz_migrations`, erasing the only
 * record of who had applied what. Afterwards there was no way to establish who
 * rolled back, or when, or why.
 *
 * Three changes follow:
 *
 *   1. DEPENDENCIES ARE ENFORCED. `down` refuses while a dependent is applied;
 *      `up` refuses when a dependency is neither applied nor pending.
 *   2. THE LEDGER IS APPEND-ONLY. A rollback marks the row ROLLED_BACK with
 *      who, when, why, host and commit. Nothing is deleted, ever.
 *   3. `doctor` CROSS-CHECKS the ledger against the database, and `up` runs it
 *      first and refuses on a mismatch. The failure above is now caught before
 *      it can do damage rather than discovered afterwards.
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { hostname, userInfo } from 'node:os';
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

/**
 * Per-migration metadata that cannot be read off the filesystem.
 *
 * `sentinel` is SQL returning one boolean column `ok`, answering: is this
 * migration's work actually present? It is what makes a claimed APPLIED
 * verifiable rather than merely asserted. A migration with no distinguishing
 * object of its own — 0002 only updates rows — leaves it unset and is reported
 * as unverifiable rather than quietly passed.
 *
 * `dependsOn` defaults to the immediately preceding id, since these migrations
 * are a linear chain, so a new file needs an entry only to override that.
 */
interface Spec {
  dependsOn?: string[];
  sentinel?: string;
}

const MANIFEST: Record<string, Spec> = {
  '0001': {
    dependsOn: [],
    sentinel: `select exists (
       select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'authorization_feature_flags'
     ) as ok`,
  },
  '0002': {
    dependsOn: ['0001'],
    // Row updates only. permissions.is_sensitive belongs to 0001, so no object
    // proves 0002 specifically ran.
  },
  '0003': {
    dependsOn: ['0001'],
    sentinel: `select exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'permissions' and column_name = 'level'
     ) as ok`,
  },
  '0004': {
    dependsOn: ['0003'],
    sentinel: `select coalesce((
       select count(*) >= 7 from authorization_feature_flags where coalesce(tenant_id, '*') = '*'
     ), false) as ok`,
  },
};

function discover(): Migration[] {
  const files = readdirSync(SQL_DIR).filter((name) => name.endsWith('.sql'));
  const ids = [
    ...new Set(files.map((name) => name.split('_')[0]).filter((id): id is string => Boolean(id))),
  ].sort();

  return ids.map((id) => {
    const up = files.find((name) => name.startsWith(id) && name.endsWith('.up.sql'));
    const down = files.find((name) => name.startsWith(id) && name.endsWith('.down.sql'));
    if (!up) throw new Error(`Migration ${id} has no .up.sql`);

    return { id, upFile: join(SQL_DIR, up), downFile: down ? join(SQL_DIR, down) : null };
  });
}

/** Declared dependencies, defaulting to the preceding migration in the chain. */
export function dependenciesOf(id: string, all: string[]): string[] {
  const declared = MANIFEST[id]?.dependsOn;
  if (declared) return declared;

  const index = all.indexOf(id);
  return index > 0 ? [all[index - 1]!] : [];
}

/** Everything that depends on `id`, transitively. */
export function dependentsOf(id: string, all: string[]): string[] {
  const out = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const candidate of all) {
      if (out.has(candidate) || candidate === id) continue;
      if (dependenciesOf(candidate, all).some((d) => d === id || out.has(d))) {
        out.add(candidate);
        changed = true;
      }
    }
  }
  return [...out].sort();
}

// ---------------------------------------------------------------- the ledger

type Status = 'APPLIED' | 'ROLLED_BACK';

interface LedgerRow {
  id: string;
  status: Status;
  applied_at: Date | null;
  applied_by: string | null;
  rolled_back_at: Date | null;
  rolled_back_by: string | null;
  reason: string | null;
  host: string | null;
  git_commit: string | null;
}

/**
 * Tracking table. Deliberately separate from Laravel's `migrations` table:
 * writing into that would make `php artisan migrate:status` report rows whose
 * files do not exist in the PHP tree, which is the exact drift problem this
 * repo already has.
 *
 * The ALTERs are additive and idempotent, so a ledger written by the earlier
 * version of this script is upgraded in place and its existing rows default to
 * APPLIED — which is what they meant.
 */
async function ensureTrackingTable(): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS _authz_migrations (
      id          VARCHAR(40) PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_by  VARCHAR(190)
    )
  `);
  await db.$executeRawUnsafe(`
    ALTER TABLE _authz_migrations
      ADD COLUMN IF NOT EXISTS status         VARCHAR(20) NOT NULL DEFAULT 'APPLIED',
      ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rolled_back_by VARCHAR(190),
      ADD COLUMN IF NOT EXISTS reason         TEXT,
      ADD COLUMN IF NOT EXISTS host           VARCHAR(190),
      ADD COLUMN IF NOT EXISTS git_commit     VARCHAR(80)
  `);
}

async function ledger(): Promise<Map<string, LedgerRow>> {
  const rows = await db.$queryRawUnsafe<LedgerRow[]>(
    `SELECT id, status, applied_at, applied_by, rolled_back_at, rolled_back_by,
            reason, host, git_commit
       FROM _authz_migrations`,
  );
  return new Map(rows.map((row) => [row.id, row]));
}

const isApplied = (row: LedgerRow | undefined): boolean => row?.status === 'APPLIED';

function gitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().slice(0, 40);
  } catch {
    return 'unknown';
  }
}

function operator(): string {
  if (process.env.USERNAME) return process.env.USERNAME;
  if (process.env.USER) return process.env.USER;
  try {
    return userInfo().username;
  } catch {
    return 'unknown';
  }
}

// -------------------------------------------------------------------- prisma

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

// -------------------------------------------------------------------- doctor

interface Problem {
  id: string;
  kind: 'GHOST' | 'ORPHAN' | 'DEPENDENCY';
  detail: string;
}

/**
 * Cross-check the ledger against the database.
 *
 *   GHOST      the ledger says APPLIED, the objects are gone. This is exactly
 *              what the 2026-08-03 rollback produced, and the state in which
 *              an `up` silently skips work that needs redoing.
 *   ORPHAN     the objects are present but nothing claims them.
 *   DEPENDENCY applied on top of something that is not applied.
 */
export async function diagnose(): Promise<Problem[]> {
  const all = discover().map((m) => m.id);
  const rows = await ledger();
  const problems: Problem[] = [];

  for (const id of all) {
    const row = rows.get(id);
    const sentinel = MANIFEST[id]?.sentinel;

    let present: boolean | null = null;
    if (sentinel) {
      try {
        const [result] = await db.$queryRawUnsafe<Array<{ ok: boolean }>>(sentinel);
        present = result?.ok ?? false;
      } catch {
        // A sentinel that cannot run because the table it reads is gone is a
        // definitive absence, not an error worth surfacing.
        present = false;
      }
    }

    if (isApplied(row) && present === false) {
      problems.push({
        id,
        kind: 'GHOST',
        detail: `ledger says APPLIED but its objects are absent (applied ${
          row?.applied_at ? new Date(row.applied_at).toISOString() : '?'
        })`,
      });
    }
    if (!isApplied(row) && present === true) {
      problems.push({
        id,
        kind: 'ORPHAN',
        detail: 'objects exist but the ledger does not claim them',
      });
    }
    if (isApplied(row)) {
      for (const dep of dependenciesOf(id, all)) {
        if (!isApplied(rows.get(dep))) {
          problems.push({
            id,
            kind: 'DEPENDENCY',
            detail: `applied, but its dependency ${dep} is not`,
          });
        }
      }
    }
  }
  return problems;
}

async function doctor(): Promise<void> {
  await ensureTrackingTable();
  const problems = await diagnose();

  if (problems.length === 0) {
    console.log('Ledger is consistent with the database.');
    return;
  }

  console.error(`Found ${problems.length} inconsistenc${problems.length === 1 ? 'y' : 'ies'}:\n`);
  for (const p of problems) console.error(`  [${p.kind}] ${p.id}: ${p.detail}`);
  console.error(
    '\nA GHOST means a rollback removed objects without clearing the ledger.\n' +
      'Repair the ledger before applying anything — see docs/repair/.',
  );
  process.exitCode = 1;
}

// ------------------------------------------------------------------------ up

async function up(dryRun: boolean): Promise<void> {
  await ensureTrackingTable();

  // Refuse to build on a ledger that does not describe reality — but only for
  // the kinds that can cause harm.
  //
  //   GHOST / DEPENDENCY block. A GHOST is precisely how a partially
  //     rolled-back schema gets rebuilt with the later migrations skipped.
  //   ORPHAN warns. Every up.sql here is idempotent (CREATE/ADD ... IF NOT
  //     EXISTS), so re-applying over an object that already exists is a no-op.
  //     Blocking on it would also deadlock the one case this is most likely to
  //     see: after a rollback, 0003's orphaned permissions.level column is left
  //     behind, and refusing to proceed would mean dropping a production column
  //     just to satisfy the bookkeeping.
  const problems = await diagnose();
  const blocking = problems.filter((p) => p.kind !== 'ORPHAN');

  for (const p of problems.filter((p) => p.kind === 'ORPHAN')) {
    console.warn(`  [warn] ${p.id}: ${p.detail} — will re-apply (idempotent)`);
  }

  if (blocking.length > 0) {
    console.error('Refusing to apply: the ledger is inconsistent with the database.\n');
    for (const p of blocking) console.error(`  [${p.kind}] ${p.id}: ${p.detail}`);
    console.error('\nRun `authz-migrate.ts doctor` for detail. Repair the ledger first.');
    process.exitCode = 1;
    return;
  }

  const all = discover();
  const ids = all.map((m) => m.id);
  const rows = await ledger();
  const pending = all.filter((m) => !isApplied(rows.get(m.id)));

  if (pending.length === 0) {
    console.log('Nothing to apply. Schema is up to date.');
    return;
  }

  for (const migration of pending) {
    const missing = dependenciesOf(migration.id, ids).filter((dep) => !isApplied(rows.get(dep)));
    if (missing.length > 0) {
      console.error(
        `Refusing to apply ${migration.id}: depends on ${missing.join(', ')}, which is not applied.`,
      );
      process.exitCode = 1;
      return;
    }

    console.log(`${dryRun ? '[dry-run] would apply' : 'applying'} ${migration.id}`);
    if (dryRun) {
      // Keep the dry run honest: later migrations must see this one as done,
      // or every dependency check after the first would fail.
      rows.set(migration.id, { id: migration.id, status: 'APPLIED' } as LedgerRow);
      continue;
    }

    runSqlFile(migration.upFile);
    await db.$executeRawUnsafe(
      `INSERT INTO _authz_migrations (id, applied_by, status, host, git_commit)
       VALUES ($1, $2, 'APPLIED', $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         status = 'APPLIED', applied_at = now(), applied_by = EXCLUDED.applied_by,
         host = EXCLUDED.host, git_commit = EXCLUDED.git_commit,
         rolled_back_at = NULL, rolled_back_by = NULL, reason = NULL`,
      migration.id,
      operator(),
      hostname(),
      gitCommit(),
    );
    rows.set(migration.id, { id: migration.id, status: 'APPLIED' } as LedgerRow);
    console.log(`applied ${migration.id}`);
  }
}

// ---------------------------------------------------------------------- down

async function down(id: string, confirmed: boolean, reason: string | null): Promise<void> {
  const all = discover();
  const ids = all.map((m) => m.id);
  const migration = all.find((candidate) => candidate.id === id);

  if (!migration) throw new Error(`Unknown migration ${id}`);
  if (!migration.downFile) throw new Error(`Migration ${id} has no .down.sql`);

  await ensureTrackingTable();
  const rows = await ledger();

  if (!isApplied(rows.get(id))) {
    console.error(
      `${id} is not applied (status ${rows.get(id)?.status ?? 'absent'}). Nothing to roll back.`,
    );
    process.exitCode = 1;
    return;
  }

  // THE GUARD THAT WAS MISSING. Rolling back underneath a dependent removes
  // objects it was built on while leaving its ledger row intact.
  const blocking = dependentsOf(id, ids).filter((dep) => isApplied(rows.get(dep)));
  if (blocking.length > 0) {
    console.error(
      `Refusing to roll back ${id}: ${blocking.join(', ')} ${
        blocking.length === 1 ? 'is' : 'are'
      } applied on top of it.\n` +
        `Roll ${blocking.length === 1 ? 'it' : 'them'} back first, in reverse order:\n` +
        blocking
          .slice()
          .reverse()
          .map((d) => `  npx tsx scripts/authz-migrate.ts down ${d} --confirm --reason "..."`)
          .join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  if (!confirmed || !reason) {
    console.error(
      `Refusing to roll back ${id} without --confirm and --reason "why".\n` +
        'This DROPS tables and destroys authorization data created since it was applied.\n' +
        'The reason is recorded in the ledger — it is what makes the change explicable later.\n' +
        'Take a dump first:  pg_dump -Fc -f authz-backup.dump "$DATABASE_URL"',
    );
    process.exitCode = 1;
    return;
  }

  runSqlFile(migration.downFile);

  // Mark, never delete. The row is the only durable record of who did this,
  // and deleting it is why the 2026-08-03 rollback has no attribution.
  await db.$executeRawUnsafe(
    `UPDATE _authz_migrations
        SET status = 'ROLLED_BACK', rolled_back_at = now(), rolled_back_by = $2,
            reason = $3, host = $4, git_commit = $5
      WHERE id = $1`,
    id,
    operator(),
    reason,
    hostname(),
    gitCommit(),
  );
  console.log(`rolled back ${id} — recorded in the ledger, not deleted`);
}

// -------------------------------------------------------------------- status

async function status(): Promise<void> {
  await ensureTrackingTable();
  const all = discover();
  const ids = all.map((m) => m.id);
  const rows = await ledger();

  for (const migration of all) {
    const row = rows.get(migration.id);
    const state = row ? row.status : 'PENDING';
    const deps = dependenciesOf(migration.id, ids);
    const suffix =
      row?.status === 'ROLLED_BACK'
        ? `  by ${row.rolled_back_by ?? '?'} — ${row.reason ?? 'no reason recorded'}`
        : deps.length
          ? `  (depends on ${deps.join(', ')})`
          : '';
    console.log(`${state.padEnd(12)} ${migration.id}${suffix}`);
  }

  const problems = await diagnose();
  if (problems.length > 0) {
    console.log(`\n${problems.length} inconsistency(ies) — run \`doctor\` for detail.`);
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((arg) => arg.startsWith('--')));

  const reasonAt = rest.indexOf('--reason');
  const reason = reasonAt >= 0 ? (rest[reasonAt + 1] ?? null) : null;
  // The reason's value is not a flag, so exclude it from the positionals or it
  // would be mistaken for a migration id.
  const positional = rest.filter((arg, i) => !arg.startsWith('--') && i !== reasonAt + 1);

  switch (command) {
    case 'up':
      await up(flags.has('--dry-run'));
      break;
    case 'down': {
      const id = positional[0];
      if (!id) throw new Error('Usage: authz-migrate.ts down <id> --confirm --reason "why"');
      await down(id, flags.has('--confirm'), reason);
      break;
    }
    case 'doctor':
      await doctor();
      break;
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
