import { PrismaClient } from '../src/generated/prisma/index.js';
const db = new PrismaClient();
const r = await db.$queryRawUnsafe<any[]>(`select indexname, indexdef from pg_indexes
 where schemaname='public' and (tablename like 'authorization_%' or tablename in ('permissions','roles'))
 order by indexname`);
r.forEach(x=>console.log(x.indexdef.replace(/CREATE (UNIQUE )?INDEX /,'$1').replace(' USING btree','')));
await db.$disconnect();
