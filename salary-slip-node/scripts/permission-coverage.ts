import { execFileSync } from 'node:child_process';
import { PrismaClient } from '../src/generated/prisma/index.js';

/**
 * Phase 6/7: permission coverage and role mapping.
 *
 * Every code the application *enforces* is compared against the codes the
 * database actually holds. A code enforced but absent is not a missing row —
 * it is a gate that cannot be satisfied, and therefore falls through to
 * whatever the fallback does.
 *
 * Read-only.
 */

const db = new PrismaClient();
const q = <T>(s: string) => db.$queryRawUnsafe<T[]>(s);

const rg = (pattern: string, path: string, flags: string[] = []): string[] => {
  try {
    return execFileSync('rg', ['-ohI', ...flags, pattern, path], { encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
};

const BAC = '../salary-slip-bac';
const FRONT = '../salary-slip-front/salary-slip-front/src';

// ---- enforced by Laravel route middleware -------------------------------
const laravel = new Set(
  rg('permission:[a-zA-Z0-9_.\\-]+', `${BAC}/routes`).map((s) => s.replace('permission:', '')),
);
const laravelApp = new Set(
  rg('permission:[a-zA-Z0-9_.\\-]+', `${BAC}/app`).map((s) => s.replace('permission:', '')),
);
laravelApp.forEach((c) => laravel.add(c));

// ---- referenced by the React client -------------------------------------
const frontend = new Set(
  rg(`["'][a-z_]+\\.[a-z_.]+["']`, FRONT)
    .map((s) => s.replace(/["']/g, ''))
    .filter((s) =>
      /^(admin|hr|employees|appointments|dashboard|platform|company|workforce|org|groups|branches|departments|security|reports|salary)\./.test(
        s,
      ),
    ),
);

// ---- held by the database -----------------------------------------------
const rows = await q<{ code: string; name: string; is_active: boolean; is_sensitive: boolean }>(
  'select code, name, is_active, is_sensitive from permissions order by code',
);
const held = new Set(rows.map((r) => r.code));

const enforced = new Set([...laravel, ...frontend]);

const missing = [...enforced].filter((c) => !held.has(c)).sort();
const unused = [...held].filter((c) => !enforced.has(c)).sort();

// duplicates: distinct rows that normalise to the same code
const norm = (c: string) => c.toLowerCase().replace(/[^a-z0-9.]+/g, '.');
const byNorm = new Map<string, string[]>();
rows.forEach((r) => byNorm.set(norm(r.code), [...(byNorm.get(norm(r.code)) ?? []), r.code]));
const dupes = [...byNorm].filter(([, v]) => v.length > 1);

console.log(`enforced by Laravel routes : ${laravel.size}`);
console.log(`referenced by React        : ${frontend.size}`);
console.log(`held in permissions table  : ${held.size}`);

console.log(`\n=== MISSING: enforced but not in the catalogue (${missing.length}) ===`);
const byArea = new Map<string, string[]>();
missing.forEach((c) => {
  const a = c.split('.')[0]!;
  byArea.set(a, [...(byArea.get(a) ?? []), c]);
});
[...byArea].sort().forEach(([a, cs]) => console.log(`  ${a} (${cs.length}): ${cs.join(', ')}`));

console.log(`\n=== UNUSED: in the catalogue, never enforced (${unused.length}) ===`);
unused.forEach((c) => console.log(`  ${c}`));

console.log(`\n=== DUPLICATE (normalised) (${dupes.length}) ===`);
dupes.forEach(([n, v]) => console.log(`  ${n} <- ${v.join(' | ')}`));

console.log('\n=== codes containing whitespace ===');
rows.filter((r) => /\s/.test(r.code)).forEach((r) => console.log(`  "${r.code}"`));

// ---- Phase 7: role coverage ---------------------------------------------
console.log('\n=== ROLE COVERAGE ===');
console.table(
  await q(`select r.id, r.code, r.status, r.is_system,
             (select count(*)::int from role_permissions rp where rp.role_id = r.id) as perms,
             (select count(*)::int from user_roles ur where ur.role_id = r.id) as users
           from roles r order by r.id`),
);

const [{ c: usersTotal }] = await q<{ c: number }>('select count(*)::int c from users');
const [{ c: usersWithRole }] = await q<{ c: number }>(
  'select count(distinct user_id)::int c from user_roles',
);
console.log(`users: ${usersTotal}, with a row in user_roles: ${usersWithRole}, without: ${usersTotal - usersWithRole}`);

console.log('\nlegacy users.role distribution (what actually decides access today):');
console.table(await q('select role, count(*)::int c from users group by role order by role'));

const [{ c: orphanPerms }] = await q<{ c: number }>(
  'select count(*)::int c from permissions p where not exists (select 1 from role_permissions rp where rp.permission_id = p.id)',
);
console.log(`\npermissions attached to no role: ${orphanPerms} / ${held.size}`);

console.log('\nauthorization_role_assignments (the NEW mechanism):');
console.table(await q('select count(*)::int total from authorization_role_assignments'));

await db.$disconnect();
