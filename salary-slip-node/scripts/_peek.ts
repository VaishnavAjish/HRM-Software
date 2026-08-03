import { PrismaClient } from '../src/generated/prisma/index.js';
const db = new PrismaClient();
const q = (s:string)=>db.$queryRawUnsafe<any[]>(s);
console.log('--- _authz_migrations ---');
console.table(await q('select * from _authz_migrations'));
console.log('--- migrations tail ---');
console.table(await q('select id,batch,migration from migrations order by id desc limit 12'));
await db.$disconnect();
