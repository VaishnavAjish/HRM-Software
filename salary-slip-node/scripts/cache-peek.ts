import { PrismaClient } from '../src/generated/prisma/index.js';
const db = new PrismaClient();
const rows = await db.$queryRawUnsafe<{ key: string; expiration: number }[]>(
  `select key, expiration from cache order by expiration desc limit 8`,
);
console.log(`  rows in cache: ${await db.cache.count()}`);
rows.forEach((r) => console.log(`   ${r.key}`));
await db.$disconnect();
