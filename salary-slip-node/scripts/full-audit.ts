import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '../src/generated/prisma/index.js';

/**
 * Phase 1-3 fact gathering: repository migration inventory vs the production
 * catalog. Writes a single JSON dump so the analysis is done against captured
 * facts rather than a dozen ad-hoc queries.
 *
 * Read-only. Every statement here is a SELECT.
 */

const db = new PrismaClient();
const q = <T>(sql: string) => db.$queryRawUnsafe<T[]>(sql);

const MIG_DIR = '../salary-slip-bac/database/migrations';

// ---------------------------------------------------------------- repository
const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.php'));
const repoMigrations = files.map((f) => {
  const body = readFileSync(`${MIG_DIR}/${f}`, 'utf8');
  const creates = [...body.matchAll(/Schema::create\(\s*'([^']+)'/g)].map((m) => m[1]);
  const tableMods = [...body.matchAll(/Schema::table\(\s*'([^']+)'/g)].map((m) => m[1]);
  const drops = [...body.matchAll(/Schema::drop(?:IfExists)?\(\s*'([^']+)'/g)].map((m) => m[1]);
  return {
    name: f.replace(/\.php$/, ''),
    creates,
    modifies: [...new Set(tableMods)],
    drops,
    hasRawSql: /DB::(statement|unprepared|raw)/.test(body),
    lines: body.split('\n').length,
  };
});

// ---------------------------------------------------------------- production
const applied = await q<{ id: number; migration: string; batch: number }>(
  'select id, migration, batch from migrations order by id',
);

const tables = await q<{ table_name: string }>(
  `select table_name from information_schema.tables
   where table_schema='public' and table_type='BASE TABLE' order by table_name`,
);

const columns = await q<{
  table_name: string; column_name: string; data_type: string;
  is_nullable: string; column_default: string | null; character_maximum_length: number | null;
  numeric_precision: number | null; numeric_scale: number | null;
}>(
  `select table_name, column_name, data_type, is_nullable, column_default,
          character_maximum_length, numeric_precision, numeric_scale
   from information_schema.columns where table_schema='public'
   order by table_name, ordinal_position`,
);

const constraints = await q<{
  table_name: string; constraint_name: string; constraint_type: string; definition: string;
}>(
  `select rel.relname as table_name, con.conname as constraint_name,
          case con.contype when 'p' then 'PRIMARY KEY' when 'f' then 'FOREIGN KEY'
               when 'u' then 'UNIQUE' when 'c' then 'CHECK' else con.contype::text end
            as constraint_type,
          pg_get_constraintdef(con.oid) as definition
   from pg_constraint con
   join pg_class rel on rel.oid = con.conrelid
   join pg_namespace ns on ns.oid = rel.relnamespace
   where ns.nspname='public' order by rel.relname, con.conname`,
);

const indexes = await q<{ tablename: string; indexname: string; indexdef: string }>(
  `select tablename, indexname, indexdef from pg_indexes
   where schemaname='public' order by tablename, indexname`,
);

const triggers = await q<{ event_object_table: string; trigger_name: string; action_statement: string }>(
  `select event_object_table, trigger_name, action_statement
   from information_schema.triggers where trigger_schema='public'`,
);

const views = await q<{ table_name: string }>(
  `select table_name from information_schema.views where table_schema='public'`,
);

const routines = await q<{ routine_name: string; routine_type: string }>(
  `select routine_name, routine_type from information_schema.routines
   where routine_schema='public'`,
);

const sequences = await q<{ sequence_name: string }>(
  `select sequence_name from information_schema.sequences where sequence_schema='public'`,
);

const enums = await q<{ typname: string; labels: string }>(
  `select t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder) as labels
   from pg_type t join pg_enum e on e.enumtypid = t.oid
   join pg_namespace n on n.oid = t.typnamespace
   where n.nspname='public' group by t.typname`,
);

// row counts, one query per table (exact, not the planner estimate)
const counts: Record<string, number> = {};
for (const t of tables) {
  const r = await q<{ c: bigint }>(`select count(*)::bigint as c from "${t.table_name}"`);
  counts[t.table_name] = Number(r[0]?.c ?? 0);
}

const dump = {
  repoMigrations,
  applied: applied.map((a) => ({ ...a, id: Number(a.id), batch: Number(a.batch) })),
  tables: tables.map((t) => t.table_name),
  columns,
  constraints,
  indexes,
  triggers,
  views: views.map((v) => v.table_name),
  routines,
  sequences: sequences.map((s) => s.sequence_name),
  enums,
  counts,
};

const out = process.argv[2] ?? 'audit-dump.json';
writeFileSync(out, JSON.stringify(dump, null, 2));

console.log(`repo migrations : ${repoMigrations.length}`);
console.log(`applied rows    : ${applied.length}`);
console.log(`tables          : ${tables.length}`);
console.log(`columns         : ${columns.length}`);
console.log(`constraints     : ${constraints.length}`);
console.log(`indexes         : ${indexes.length}`);
console.log(`triggers        : ${triggers.length}`);
console.log(`views           : ${views.length}`);
console.log(`routines        : ${routines.length}`);
console.log(`enums           : ${enums.length}`);
console.log(`-> ${out}`);

await db.$disconnect();
