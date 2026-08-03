import { PrismaClient } from '../src/generated/prisma/index.js';
const db = new PrismaClient();
const q = (s:string)=>db.$queryRawUnsafe<any[]>(s);
console.log('--- roles ---');
console.table(await q('select id,name,code,type,is_system,status from roles order by id'));
console.log('--- index names on affected tables ---');
console.table(await q(`select tablename,indexname from pg_indexes where schemaname='public'
 and tablename in ('permissions','roles','authorization_role_assignments','authorization_policies',
 'authorization_relationships','authorization_decision_logs') order by tablename,indexname`));
await db.$disconnect();
