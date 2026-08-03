import { readFileSync } from 'node:fs';

/** Phase 3: pure analysis over the captured dump. No database access. */

const d = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));

const appliedNames = new Set<string>(d.applied.map((a: any) => a.migration));
const repoNames = new Set<string>(d.repoMigrations.map((m: any) => m.name));
const tableSet = new Set<string>(d.tables);

const pending = d.repoMigrations.filter((m: any) => !appliedNames.has(m.name));
const foreign = [...appliedNames].filter((n) => !repoNames.has(n));

console.log('=== PENDING (in repo, not in migrations table) ===');
for (const m of pending) {
  const created = m.creates as string[];
  const exist = created.filter((t) => tableSet.has(t));
  const missing = created.filter((t) => !tableSet.has(t));
  const mod = (m.modifies as string[]).filter((t) => !created.includes(t));
  console.log(
    `${m.name}\n   creates=${created.length} present=${exist.length} absent=${missing.length}` +
      (mod.length ? ` modifies=[${mod.join(',')}]` : ''),
  );
  if (exist.length) console.log(`   ALREADY EXIST: ${exist.join(', ')}`);
  if (missing.length) console.log(`   absent: ${missing.join(', ')}`);
}

console.log('\n=== APPLIED but file not in repo ===');
foreign.forEach((f) => console.log(`  ${f}`));

console.log('\n=== migrations that create a table which does NOT exist ===');
for (const m of d.repoMigrations) {
  if (!appliedNames.has(m.name)) continue;
  const missing = (m.creates as string[]).filter((t: string) => !tableSet.has(t));
  if (missing.length) console.log(`  ${m.name} -> ${missing.join(', ')}`);
}

// tables with no migration anywhere in the repo claiming to create them
const createdByRepo = new Set<string>(d.repoMigrations.flatMap((m: any) => m.creates));
console.log('\n=== tables in production with no create-migration in repo ===');
const orphans = d.tables.filter((t: string) => !createdByRepo.has(t) && t !== 'migrations');
orphans.forEach((t: string) => console.log(`  ${t}  (rows=${d.counts[t]})`));

// duplicate timestamps
const stamps = new Map<string, string[]>();
for (const m of d.repoMigrations) {
  const k = m.name.slice(0, 17);
  stamps.set(k, [...(stamps.get(k) ?? []), m.name]);
}
console.log('\n=== duplicate migration timestamps ===');
[...stamps].filter(([, v]) => v.length > 1).forEach(([k, v]) => console.log(`  ${k}: ${v.join(', ')}`));

console.log('\n=== batch summary ===');
const batches = new Map<number, number>();
d.applied.forEach((a: any) => batches.set(a.batch, (batches.get(a.batch) ?? 0) + 1));
[...batches].sort((a, b) => a[0] - b[0]).forEach(([b, c]) => console.log(`  batch ${b}: ${c}`));
console.log(`  max batch = ${Math.max(...d.applied.map((a: any) => a.batch))}`);
console.log(`  max id    = ${Math.max(...d.applied.map((a: any) => a.id))}`);

console.log('\n=== authorization_* tables ===');
d.tables
  .filter((t: string) => t.startsWith('authorization_'))
  .forEach((t: string) => {
    const cols = d.columns.filter((c: any) => c.table_name === t).length;
    const fks = d.constraints.filter(
      (c: any) => c.table_name === t && c.constraint_type === 'FOREIGN KEY',
    ).length;
    const uq = d.constraints.filter(
      (c: any) => c.table_name === t && c.constraint_type === 'UNIQUE',
    ).length;
    const ix = d.indexes.filter((i: any) => i.tablename === t).length;
    console.log(`  ${t.padEnd(42)} rows=${String(d.counts[t]).padStart(5)} cols=${String(cols).padStart(3)} fk=${fks} uq=${uq} idx=${ix}`);
  });

console.log('\n=== non-empty tables ===');
Object.entries(d.counts as Record<string, number>)
  .filter(([, c]) => c > 0)
  .sort((a, b) => b[1] - a[1])
  .forEach(([t, c]) => console.log(`  ${t.padEnd(42)} ${c}`));
