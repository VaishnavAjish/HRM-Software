/**
 * Data migration: legacy RBAC -> the authorization platform.
 *
 * 0001/0002 created the schema. This moves the *data*:
 *
 *   1. role metadata      name -> canonical code, role_type, scope, is_system
 *   2. missing roles      unit_administrator / employee / agent do not exist
 *   3. users.role         the numeric column that actually authorizes
 *                          production today -> scoped role assignments
 *   4. permission_dimensions  24 page grants -> role_permissions, with
 *                          view_only expanded into allow-read + deny-write
 *   5. per-user roles     User_<id>_Permissions -> user_permissions
 *   6. hygiene            orphaned user_roles rows reported (never silently
 *                          deleted — an orphan may be a restore waiting to
 *                          happen)
 *
 * Dry run by default. `--apply` is required to write anything, because this
 * touches every one of the 341 user records.
 *
 *   npx tsx scripts/authz-data-migrate.ts            # report only
 *   npx tsx scripts/authz-data-migrate.ts --apply
 *
 * Idempotent: every write is a conditional upsert, so a second run is a
 * no-op. Reversible: see authz-data-rollback below and the `_pre_authz_*`
 * snapshots taken before 0001.
 */

import { db } from '../src/db/client.js';
import {
  PAGE_DIMENSION_MAP,
  ROLE_MAP,
  dimensionEffect,
  mapLegacyRole,
  mapPermission,
  mutatingSiblings,
  perUserRoleTarget,
} from '../src/modules/authorization/migration/legacy-mapping.js';

const APPLY = process.argv.includes('--apply');

const q = <T>(sql: string, ...params: unknown[]) => db.$queryRawUnsafe<T[]>(sql, ...params);
const exec = (sql: string, ...params: unknown[]) => db.$executeRawUnsafe(sql, ...params);

const report: string[] = [];
const warn: string[] = [];
const log = (line: string) => report.push(line);

/** Roles the new model needs that the legacy data has no equivalent for. */
const REQUIRED_ROLES = [
  { code: 'super_administrator', name: 'Super Admin', type: 'SYSTEM', scope: 'GLOBAL', system: true },
  { code: 'tenant_administrator', name: 'Admin', type: 'SYSTEM', scope: 'TENANT', system: true },
  { code: 'master_administrator', name: 'Master', type: 'SYSTEM', scope: 'TENANT', system: true },
  { code: 'unit_administrator', name: 'Unit Admin', type: 'BUSINESS', scope: 'BUSINESS_UNIT', system: false },
  { code: 'hr_manager', name: 'HR Manager', type: 'BUSINESS', scope: 'COMPANY', system: false },
  { code: 'viewer', name: 'Viewer', type: 'BUSINESS', scope: 'TENANT', system: false },
  { code: 'agent', name: 'Agent', type: 'BUSINESS', scope: 'TENANT', system: false },
  { code: 'employee', name: 'Employee', type: 'BUSINESS', scope: 'SELF', system: false },
];

async function step1_roleMetadata(): Promise<void> {
  log('\n== 1. Role metadata ==');

  const roles = await q<{ id: bigint; name: string; code: string }>('SELECT id, name, code FROM roles ORDER BY id');

  for (const role of roles) {
    const mapping = ROLE_MAP[role.name];
    if (!mapping) {
      if (perUserRoleTarget(role.name) === null) {
        warn.push(`role "${role.name}" (id ${role.id}) has no canonical mapping — left as a custom role`);
      }
      continue;
    }

    log(`  ${role.name}: code ${role.code} -> ${mapping.code}, ${mapping.roleType}, ${mapping.defaultScopeType}`);

    if (APPLY) {
      await exec(
        `UPDATE roles
            SET code = $2, role_type = $3, default_scope_type = $4,
                is_system = $5, is_sensitive = $5, type = $6, status = 'ACTIVE'
          WHERE id = $1`,
        role.id,
        mapping.code,
        mapping.roleType,
        mapping.defaultScopeType,
        mapping.isSystem,
        mapping.isSystem ? 'System' : 'Custom',
      );
    }
  }
}

async function step2_missingRoles(): Promise<Map<string, number>> {
  log('\n== 2. Roles required by the new model ==');
  const byCode = new Map<string, number>();

  for (const spec of REQUIRED_ROLES) {
    const [existing] = await q<{ id: bigint }>('SELECT id FROM roles WHERE code = $1', spec.code);

    if (existing) {
      byCode.set(spec.code, Number(existing.id));
      log(`  ${spec.code}: exists (id ${existing.id})`);
      continue;
    }

    log(`  ${spec.code}: CREATE`);
    if (!APPLY) {
      // Placeholder so the dry run can still tally step 3 instead of
      // reporting 341 "no role id" warnings for roles it has not created yet.
      byCode.set(spec.code, -1);
      continue;
    }

    const [created] = await q<{ id: bigint }>(
      `INSERT INTO roles (name, code, type, description, role_type, is_active, is_system,
                          is_assignable, is_sensitive, requires_approval, default_scope_type,
                          status, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6, TRUE, $6, FALSE, $7, 'ACTIVE', 1, now(), now())
       ON CONFLICT (code) DO UPDATE SET updated_at = now()
       RETURNING id`,
      spec.name,
      spec.code,
      spec.system ? 'System' : 'Custom',
      `${spec.name} authorization role`,
      spec.type,
      spec.system,
      spec.scope,
    );
    if (created) byCode.set(spec.code, Number(created.id));
  }

  return byCode;
}

async function step3_userAssignments(roleIds: Map<string, number>): Promise<void> {
  log('\n== 3. users.role -> scoped assignments ==');

  const users = await q<{
    id: bigint;
    role: string | null;
    type: string | null;
    company_code: string | null;
    unit: string | null;
  }>(`SELECT id, role::text AS role, type, company_code, unit
       FROM users
      WHERE COALESCE(is_deleted::text, '0') NOT IN ('1', 'true', 't')`);

  const tally = new Map<string, number>();
  let written = 0;

  for (const user of users) {
    const mapping = mapLegacyRole(user.role, user.type);
    const roleId = roleIds.get(mapping.roleCode);

    if (!roleId) {
      warn.push(`no role id for ${mapping.roleCode} — user ${user.id} not assigned`);
      continue;
    }

    const scopeId =
      mapping.scopeFrom === 'company_code' ? user.company_code : mapping.scopeFrom === 'unit' ? user.unit : null;

    tally.set(mapping.roleCode, (tally.get(mapping.roleCode) ?? 0) + 1);
    if (!APPLY) continue;

    // The partial unique index covers (user, role, scope) WHERE status='ACTIVE',
    // so a re-run collides with itself rather than duplicating.
    await exec(
      `INSERT INTO authorization_role_assignments
         (user_id, role_id, scope_type, scope_id, tenant_id, status, reason, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'Migrated from users.role', now(), now())
       ON CONFLICT DO NOTHING`,
      user.id,
      roleId,
      mapping.scopeType,
      scopeId,
      user.company_code,
    );
    written += 1;
  }

  for (const [code, count] of [...tally].sort((a, b) => b[1] - a[1])) {
    log(`  ${code.padEnd(22)} ${count} user(s)`);
  }
  log(`  total ${APPLY ? `${written} written` : `${users.length} would be written`}`);
}

async function step4_dimensions(): Promise<void> {
  log('\n== 4. permission_dimensions -> role_permissions ==');

  const dims = await q<{ role_id: bigint; key_name: string; value: string }>(
    "SELECT role_id, key_name, value FROM permission_dimensions WHERE dimension = 'page'",
  );

  let mapped = 0;
  let denies = 0;
  const unmappedDimensions = new Set<string>();

  for (const dim of dims) {
    // Per-user override roles are handled in step 5, not here.
    const [role] = await q<{ name: string }>('SELECT name FROM roles WHERE id = $1', dim.role_id);
    if (role && perUserRoleTarget(role.name) !== null) continue;

    if (!(dim.key_name in PAGE_DIMENSION_MAP)) {
      warn.push(`page dimension "${dim.key_name}" is unknown to the mapping — NOT migrated`);
      continue;
    }

    const code = PAGE_DIMENSION_MAP[dim.key_name];
    if (!code) {
      // Deliberately unmapped: no equivalent permission exists in this
      // catalogue. Access is carried by the SELF-scoped assignment instead.
      unmappedDimensions.add(dim.key_name);
      continue;
    }

    const { effect, readOnly } = dimensionEffect(dim.value);
    const targets: Array<{ code: string; effect: 'ALLOW' | 'DENY' }> = [{ code, effect }];

    // view_only must not migrate as a bare allow: it would silently widen the
    // role from "may look" to "may change".
    if (readOnly) {
      for (const sibling of mutatingSiblings(code)) targets.push({ code: sibling, effect: 'DENY' });
    }

    for (const target of targets) {
      const [permission] = await q<{ id: bigint }>(
        'SELECT id FROM permissions WHERE code = $1 OR name = $1',
        target.code,
      );
      if (!permission) continue;

      mapped += 1;
      if (target.effect === 'DENY') denies += 1;
      if (!APPLY) continue;

      await exec(
        `INSERT INTO role_permissions (role_id, permission_id, effect, inherit_to_children)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (role_id, permission_id) DO UPDATE SET effect = EXCLUDED.effect`,
        dim.role_id,
        permission.id,
        target.effect,
      );
    }
  }

  log(`  ${dims.length} dimension rows -> ${mapped} grants (${denies} explicit denies from view_only)`);
  if (unmappedDimensions.size > 0) {
    log(`  ${unmappedDimensions.size} key(s) have no equivalent permission: ${[...unmappedDimensions].join(', ')}`);
    log('    (self-service/agent pages — access comes from the SELF-scoped assignment)');
  }
}

async function step5_perUserRoles(): Promise<void> {
  log('\n== 5. User_<id>_Permissions roles -> user_permissions ==');

  const roles = await q<{ id: bigint; name: string }>("SELECT id, name FROM roles WHERE name LIKE 'User\\_%\\_Permissions'");
  let moved = 0;

  for (const role of roles) {
    const userId = perUserRoleTarget(role.name);
    if (userId === null) continue;

    const [user] = await q<{ id: bigint }>('SELECT id FROM users WHERE id = $1', userId);
    if (!user) {
      warn.push(`${role.name} targets user ${userId}, which does not exist — role left in place, not migrated`);
      continue;
    }

    const dims = await q<{ key_name: string; value: string }>(
      "SELECT key_name, value FROM permission_dimensions WHERE dimension = 'page' AND role_id = $1",
      role.id,
    );

    for (const dim of dims) {
      const code = PAGE_DIMENSION_MAP[dim.key_name];
      if (!code) continue;

      const [permission] = await q<{ id: bigint }>('SELECT id FROM permissions WHERE code = $1 OR name = $1', code);
      if (!permission) continue;

      const { effect } = dimensionEffect(dim.value);
      moved += 1;
      if (!APPLY) continue;

      await exec(
        `INSERT INTO user_permissions (user_id, permission_id, is_denied)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, permission_id) DO UPDATE SET is_denied = EXCLUDED.is_denied`,
        userId,
        permission.id,
        effect === 'DENY',
      );
    }
  }

  log(`  ${roles.length} per-user role(s) -> ${moved} direct grant(s)`);
}

async function step6_hygiene(): Promise<void> {
  log('\n== 6. Hygiene ==');

  const orphans = await q<{ user_id: bigint; role_id: bigint }>(
    'SELECT user_id, role_id FROM user_roles ur WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ur.user_id)',
  );

  for (const orphan of orphans) {
    warn.push(`user_roles row (user ${orphan.user_id}, role ${orphan.role_id}) references a user that no longer exists`);
  }
  log(`  ${orphans.length} orphaned user_roles row(s) — reported, not deleted`);

  const [unmapped] = await q<{ n: number }>('SELECT count(*)::int AS n FROM permissions WHERE code IS NULL');
  log(`  ${unmapped?.n ?? 0} permission(s) without a code`);
}

async function permissionMappingReport(): Promise<void> {
  log('\n== Permission code mapping ==');

  const permissions = await q<{ name: string }>('SELECT name FROM permissions ORDER BY name');
  const explicit: string[] = [];
  const derived: string[] = [];

  for (const { name } of permissions) {
    const { code, explicit: wasExplicit } = mapPermission(name);
    (wasExplicit ? explicit : derived).push(`${name} -> ${code}`);
  }

  log(`  ${explicit.length} explicitly mapped, ${derived.length} carried across by rule`);
  log('  (no permission is discarded; see legacy-mapping.ts)');
}

async function main(): Promise<void> {
  console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN (pass --apply to write) ===');

  await step1_roleMetadata();
  const roleIds = await step2_missingRoles();
  await step3_userAssignments(roleIds);
  await step4_dimensions();
  await step5_perUserRoles();
  await step6_hygiene();
  await permissionMappingReport();

  console.log(report.join('\n'));

  if (warn.length > 0) {
    console.log(`\n== Warnings (${warn.length}) ==`);
    for (const line of warn) console.log(`  ! ${line}`);
  }

  if (!APPLY) console.log('\nNothing was written. Re-run with --apply.');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
