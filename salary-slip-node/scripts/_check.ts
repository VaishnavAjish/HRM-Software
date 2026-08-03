/** Post-migration reconciliation. Temporary. */
import { db } from '../src/db/client.js';

const q = <T>(sql: string, ...p: unknown[]) => db.$queryRawUnsafe<T[]>(sql, ...p);

console.log('=== users by legacy role (live) ===');
console.log(
  await q(
    `SELECT role::text AS role, type, COALESCE(is_deleted::text,'0') AS deleted, count(*)::int AS n
       FROM users GROUP BY 1,2,3 ORDER BY 4 DESC`,
  ),
);

console.log('=== assignments written ===');
console.log(
  await q(
    `SELECT r.code, a.scope_type, count(*)::int AS n
       FROM authorization_role_assignments a JOIN roles r ON r.id = a.role_id
      GROUP BY 1,2 ORDER BY 3 DESC`,
  ),
);

console.log('=== users with NO active assignment ===');
console.log(
  await q(
    `SELECT u.id::int, u.name, u.role::text AS role, u.type,
            COALESCE(u.is_deleted::text,'0') AS deleted, u.company_code
       FROM users u
      WHERE NOT EXISTS (
              SELECT 1 FROM authorization_role_assignments a
               WHERE a.user_id = u.id AND a.status = 'ACTIVE')
      ORDER BY u.role::int, u.id`,
  ),
);

console.log('=== role_permissions after dimension migration ===');
console.log(
  await q(
    `SELECT r.name, rp.effect, count(*)::int AS n
       FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
      GROUP BY 1,2 ORDER BY 1,2`,
  ),
);

await db.$disconnect();
