import { PrismaClient } from '../src/generated/prisma/index.js';
const db = new PrismaClient();
const applied = await db.$queryRawUnsafe<{ migration: string }[]>(
  `select migration from migrations where migration like '%authorization%' or migration like '%2026_08_03%'`,
);
console.log('  applied migrations matching:', applied.map((r) => r.migration).join(', ') || '(none)');

const present = await db.$queryRawUnsafe<{ table_name: string }[]>(
  `select table_name from information_schema.tables
   where table_schema='public' and table_name like 'authorization%' order by table_name`,
);
console.log('  authorization* tables in DB:', present.map((r) => r.table_name).join(', ') || '(none)');

const total = await db.$queryRawUnsafe<{ n: bigint }[]>(
  `select count(*)::bigint as n from information_schema.tables where table_schema='public'`,
);
console.log('  total public tables now   :', String(total[0]?.n), '(was 75 at introspection)');
await db.$disconnect();
