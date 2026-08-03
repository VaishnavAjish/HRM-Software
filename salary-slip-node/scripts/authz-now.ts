import { db } from '../src/db/client.js';
const t = await db.$queryRawUnsafe<{ table_name: string }[]>(
  `select table_name from information_schema.tables
   where table_schema='public' and table_name like 'authorization%' order by 1`);
console.log(`  authorization* tables: ${t.length}`);
for (const r of t) {
  const [{ n }] = await db.$queryRawUnsafe<{ n: bigint }[]>(`select count(*)::bigint as n from "${r.table_name}"`);
  console.log(`    ${r.table_name.padEnd(38)} ${n}`);
}
const [{ n: total }] = await db.$queryRawUnsafe<{ n: bigint }[]>(
  `select count(*)::bigint as n from information_schema.tables where table_schema='public'`);
console.log(`\n  total public tables: ${total}  (was 75)`);
const mig = await db.$queryRawUnsafe<{ migration: string }[]>(
  `select migration from migrations where migration like '%authorization%' order by 1`);
console.log(`  authorization migrations applied: ${mig.map((m) => m.migration).join(', ') || '(none)'}`);
await db.$disconnect();
