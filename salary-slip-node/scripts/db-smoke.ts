import { PrismaClient } from '../src/generated/prisma/index.js';
const db = new PrismaClient();
const [users, slips, docs] = await Promise.all([
  db.users.count(), db.salary_slips.count(), db.documents.count(),
]);
const empCodeType = await db.$queryRawUnsafe<{ data_type: string; character_maximum_length: number | null }[]>(
  `select data_type, character_maximum_length from information_schema.columns
   where table_name='salary_slips' and column_name='emp_code'`,
);
console.log(`  users        : ${users}`);
console.log(`  salary_slips : ${slips}`);
console.log(`  documents    : ${docs}`);
console.log(`  salary_slips.emp_code : ${empCodeType[0]?.data_type}(${empCodeType[0]?.character_maximum_length})`);
await db.$disconnect();
