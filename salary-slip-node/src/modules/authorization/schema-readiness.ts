import { db } from '../../db/client.js';

/**
 * Is the authorization schema actually present?
 *
 * Laravel has had this since RequirePermission gained schemaReady(); Node did
 * not, and the difference stopped being theoretical on 2026-08-03 when the
 * authorization platform was rolled back out of production. Laravel degraded to
 * its legacy branch and kept serving. Node, had it been deployed, would have
 * raised `42P01 relation "authorization_role_assignments" does not exist` on
 * every authorization call — because authorization.repository.ts reaches those
 * tables through raw SQL, so neither the compiler nor the generated Prisma
 * client can tell you the tables are gone. Only the database can, at runtime.
 *
 * The probe mirrors Laravel's exactly, so the two backends agree on whether the
 * platform is available. Disagreeing would be worse than either answer: a
 * request could be authorized by one and rejected by the other depending on
 * which server it landed on.
 */

/** The same nine objects RequirePermission::schemaReady() checks. */
const REQUIRED_TABLES = [
  'authorization_feature_flags',
  'authorization_role_assignments',
  'authorization_policies',
] as const;

const REQUIRED_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ['permissions', 'code'],
  ['permissions', 'is_active'],
  ['roles', 'code'],
  ['roles', 'status'],
  ['role_permissions', 'effect'],
  ['user_permissions', 'valid_until'],
];

/**
 * Cached, because this runs ahead of every authorization request and the answer
 * changes only when someone migrates. Laravel caches it in a static for the
 * same reason.
 *
 * The cache is deliberately *not* time-based. A TTL would mean a window in
 * which the process serves 503s after the schema is back, or 42P01s after it
 * goes away — and a migration is always accompanied by a deploy or a restart,
 * which clears it anyway. `resetSchemaReadinessCache()` exists for tests and
 * for the migration runner.
 */
let cached: boolean | null = null;

export function resetSchemaReadinessCache(): void {
  cached = null;
}

export async function isAuthorizationSchemaReady(): Promise<boolean> {
  if (cached !== null) return cached;

  try {
    const [row] = await db.$queryRaw<Array<{ tables: bigint; columns: bigint }>>`
      select
        (select count(*) from information_schema.tables
          where table_schema = 'public'
            and table_name in ('authorization_feature_flags',
                               'authorization_role_assignments',
                               'authorization_policies')) as tables,
        (select count(*) from information_schema.columns
          where table_schema = 'public'
            and (table_name, column_name) in (
              ('permissions', 'code'), ('permissions', 'is_active'),
              ('roles', 'code'), ('roles', 'status'),
              ('role_permissions', 'effect'), ('user_permissions', 'valid_until')
            )) as columns
    `;

    cached =
      Number(row?.tables ?? 0) === REQUIRED_TABLES.length &&
      Number(row?.columns ?? 0) === REQUIRED_COLUMNS.length;
  } catch {
    // The probe itself failing — no connection, no permission on
    // information_schema — must read as "not ready". Treating an unknown as
    // ready is how you get 42P01 in a request handler instead of a clean 503.
    cached = false;
  }

  return cached;
}

/** The body Laravel returns, so the React client's handling is identical. */
export const SCHEMA_NOT_READY_BODY = {
  success: false,
  error: {
    code: 'AUTHORIZATION_SCHEMA_NOT_READY',
    message: 'Authorization services are being upgraded. Please retry shortly.',
  },
} as const;
