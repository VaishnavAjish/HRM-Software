/**
 * EMERGENCY ROLLBACK — restore the pre-migration authorization state.
 *
 * Why this exists: creating the authorization_* tables activated the Laravel
 * app's dormant AuthorizationEngine. Every branch of that engine is gated on
 * Schema::hasTable('authorization_...'), so while the tables were absent it
 * fell through to the legacy role check. Once they existed it began querying
 * them for real, on a schema written for the Node engine rather than for it,
 * and routes carrying the `permission:` middleware started returning 500.
 *
 * Order matters:
 *   1. undo the DATA migration   (rows the schema rollback would not remove)
 *   2. undo the SCHEMA migration (drops the tables, re-dormanting the engine)
 *
 * Step 1 is exact rather than heuristic: it diffs against the `_pre_authz_*`
 * snapshots taken before 0001, so anything the migration added is removed and
 * anything that predates it is untouched.
 *
 *   npx tsx scripts/authz-emergency-rollback.ts            # report
 *   npx tsx scripts/authz-emergency-rollback.ts --apply
 *
 * After this completes, run:
 *   npx tsx scripts/authz-migrate.ts down 0002 --confirm
 *   npx tsx scripts/authz-migrate.ts down 0001 --confirm
 */

import { db } from '../src/db/client.js';

const APPLY = process.argv.includes('--apply');

const q = <T>(sql: string, ...p: unknown[]) => db.$queryRawUnsafe<T[]>(sql, ...p);
const exec = (sql: string, ...p: unknown[]) => db.$executeRawUnsafe(sql, ...p);

async function count(sql: string): Promise<number> {
  const [row] = await q<{ n: number }>(sql);
  return row?.n ?? 0;
}

async function main(): Promise<void> {
  console.log(APPLY ? '=== ROLLING BACK ===' : '=== DRY RUN (pass --apply) ===');

  const snapshotsExist = await count(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '_pre_authz_role_permissions'`,
  );
  if (snapshotsExist === 0) {
    throw new Error('_pre_authz_* snapshots are missing — refusing to guess what to remove.');
  }

  // --- role_permissions rows the data migration inserted -----------------
  const addedGrants = await count(
    `SELECT count(*)::int AS n FROM role_permissions rp
      WHERE NOT EXISTS (SELECT 1 FROM _pre_authz_role_permissions b
                         WHERE b.role_id = rp.role_id AND b.permission_id = rp.permission_id)`,
  );
  console.log(`role_permissions rows added by the migration : ${addedGrants}`);

  // --- user_permissions rows ---------------------------------------------
  const addedUserPerms = await count(
    `SELECT count(*)::int AS n FROM user_permissions up
      WHERE NOT EXISTS (SELECT 1 FROM _pre_authz_user_permissions b
                         WHERE b.user_id = up.user_id AND b.permission_id = up.permission_id)`,
  );
  console.log(`user_permissions rows added by the migration : ${addedUserPerms}`);

  // --- roles created ------------------------------------------------------
  const addedRoles = await q<{ id: bigint; name: string }>(
    `SELECT id, name FROM roles r
      WHERE NOT EXISTS (SELECT 1 FROM _pre_authz_roles b WHERE b.id = r.id)`,
  );
  console.log(`roles created by the migration               : ${addedRoles.length}` +
    (addedRoles.length ? ` (${addedRoles.map((r) => r.name).join(', ')})` : ''));

  const assignments = await count('SELECT count(*)::int AS n FROM authorization_role_assignments');
  console.log(`authorization_role_assignments to be dropped : ${assignments}`);

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply, then run the two schema rollbacks.');
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `DELETE FROM role_permissions rp
        WHERE NOT EXISTS (SELECT 1 FROM _pre_authz_role_permissions b
                           WHERE b.role_id = rp.role_id AND b.permission_id = rp.permission_id)`,
    );

    await tx.$executeRawUnsafe(
      `DELETE FROM user_permissions up
        WHERE NOT EXISTS (SELECT 1 FROM _pre_authz_user_permissions b
                           WHERE b.user_id = up.user_id AND b.permission_id = up.permission_id)`,
    );

    // Restore legacy role identity. `code` and the other added columns are
    // dropped by the 0001 rollback, but `name`/`type`/`is_active` predate it
    // and the data migration rewrote `type`, so those are restored here.
    await tx.$executeRawUnsafe(
      `UPDATE roles r
          SET name = b.name, type = b.type, is_active = b.is_active
         FROM _pre_authz_roles b
        WHERE b.id = r.id`,
    );

    // Roles the migration created. Assignments referencing them cascade.
    await tx.$executeRawUnsafe(
      `DELETE FROM roles r WHERE NOT EXISTS (SELECT 1 FROM _pre_authz_roles b WHERE b.id = r.id)`,
    );
  });

  console.log('\nData rollback complete. Now run:');
  console.log('  npx tsx scripts/authz-migrate.ts down 0002 --confirm');
  console.log('  npx tsx scripts/authz-migrate.ts down 0001 --confirm');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
