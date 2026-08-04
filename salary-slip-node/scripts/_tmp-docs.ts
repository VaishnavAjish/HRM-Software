import { db } from '../src/db/client.js';
const q = async (l: string, s: string) => {
  const r = await db.$queryRawUnsafe<any[]>(s);
  console.log(`\n## ${l}`);
  for (const x of r) console.log('   ' + JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
  if (!r.length) console.log('   (none)');
};
await q('do ANY documents link to a real user?', `
  select count(*)::int total,
         count(*) filter (where exists (select 1 from users u where u.id = d.user_id))::int user_id_resolves,
         count(*) filter (where exists (select 1 from users u where u.id = d.owner_id))::int owner_id_resolves,
         min(owner_id)::int min_owner, max(owner_id)::int max_owner
    from documents d`);
await q('users id range', `select min(id)::int lo, max(id)::int hi from users`);
await q('legacy inline image columns on users', `
  select count(*)::int users,
         count(adhar_image)::int adhar_image,
         count(pan_image)::int pan_image,
         count(check_image)::int check_image,
         count(account_book)::int account_book
    from users`);
await q('owner_ref sample (non-PII shape)', `
  select owner_type, count(*)::int n, count(owner_ref)::int with_ref from documents group by owner_type`);
await db.$disconnect();
