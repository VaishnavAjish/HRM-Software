/** Read-only: does the ported predicate select the same rows PHP's does? */
import { db } from '../src/db/client.js';
import { PrismaEmployeeRepository } from '../src/modules/employees/employees.repository.js';

const repo = new PrismaEmployeeRepository();
const asSuperAdmin = await repo.list({ companyCodes: null, unit: null }, { page: 1, perPage: 15 });

// The same predicate expressed as raw SQL, straight from UserController::index.
const [{ n }] = await db.$queryRawUnsafe<{ n: bigint }[]>(`
  select count(*)::bigint as n from users
  where is_deleted = '0'
    and role not in (0,1,2)
    and emp_code is not null and emp_code <> ''
    and (type is null or type not in ('appointment','agent','pending_employee'))`);

console.log(`  ported repository total : ${asSuperAdmin.total}`);
console.log(`  raw SQL equivalent      : ${n}`);
console.log(`  ${asSuperAdmin.total === Number(n) ? 'MATCH' : 'MISMATCH'}`);
console.log(`  first page rows         : ${asSuperAdmin.rows.length} (per_page ${asSuperAdmin.perPage}, last_page ${asSuperAdmin.lastPage})`);
console.log(`  active                  : ${asSuperAdmin.activeCount}`);

const scoped = await repo.list({ companyCodes: ['silver-star'], unit: null }, { page: 1, perPage: 15 });
console.log(`  scoped to silver-star   : ${scoped.total}`);
await db.$disconnect();
