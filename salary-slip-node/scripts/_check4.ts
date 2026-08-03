import { PrismaClient } from '../src/generated/prisma/index.js';
const db = new PrismaClient();
const q=(s:string)=>db.$queryRawUnsafe<any[]>(s);
console.table(await q(`select 'roles' t, count(*) c from roles
 union all select 'permissions', count(*) from permissions
 union all select '_pre_authz_roles', count(*) from _pre_authz_roles
 union all select 'users', count(*) from users
 union all select 'documents', count(*) from documents
 union all select 'authorization_feature_flags', count(*) from authorization_feature_flags`));
console.log('roles created_at spread:');
console.table(await q(`select id,name,created_at from roles order by created_at desc limit 5`));
await db.$disconnect();
