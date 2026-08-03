import { db } from '../src/db/client.js';
const rows = await db.$queryRawUnsafe<{ col: string; val: string | null; n: bigint }[]>(`
  select 'is_deleted' as col, is_deleted::text as val, count(*)::bigint as n from users group by 1,2
  union all
  select 'status', status::text, count(*)::bigint from users group by 1,2
  union all
  select 'role', role::text, count(*)::bigint from users group by 1,2
  union all
  select 'type', coalesce(type,'<null>'), count(*)::bigint from users group by 1,2
  order by 1,2`);
let col = '';
for (const r of rows) {
  if (r.col !== col) { col = r.col; console.log(`  ${col}:`); }
  console.log(`     ${String(r.val).padEnd(18)} ${r.n}`);
}
await db.$disconnect();
