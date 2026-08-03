import { db } from '../src/db/client.js';
const cols = await db.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
  `select column_name, data_type from information_schema.columns
   where table_schema='public' and table_name='document_versions' order by ordinal_position`);
console.log('  document_versions columns in production:');
cols.forEach((c) => console.log(`    ${c.column_name.padEnd(24)} ${c.data_type}`));
await db.$disconnect();
