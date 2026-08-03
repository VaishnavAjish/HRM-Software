import { db } from '../src/db/client.js';
const rows = await db.$queryRawUnsafe<{ company_code: string; n: bigint }[]>(`
  select company_code, count(*)::bigint as n from users
  where is_deleted='0' and role not in (0,1,2)
    and emp_code is not null and emp_code <> ''
    and (type is null or type not in ('appointment','agent','pending_employee'))
  group by 1 order by 2 desc`);
rows.forEach((r) => console.log(`  ${String(r.company_code).padEnd(20)} ${r.n}`));
await db.$disconnect();
