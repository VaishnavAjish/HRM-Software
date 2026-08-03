/**
 * permission-coverage.ts — what the code enforces vs. what the database knows.
 *
 * Rewritten 2026-08-03. The previous version selected `permissions.code`
 * unconditionally and died with `42703: column "code" does not exist` the
 * moment the enterprise schema was rolled back — the exact situation in which
 * you most need the answer. It now probes the schema first and reads whichever
 * column carries the vocabulary, so it works on both schema generations. It
 * also no longer shells out to `rg`, which silently returned zero matches when
 * ripgrep was absent and made a broken scan look like a clean one.
 *
 *   npx tsx scripts/permission-coverage.ts
 *   npx tsx scripts/permission-coverage.ts --json
 *   npx tsx scripts/permission-coverage.ts --strict --min 100   # CI gate
 *
 * Read-only. Touches no table other than `permissions`, and only with SELECT.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { db } from '../src/db/client.js';

const asJson = process.argv.includes('--json');
const strict = process.argv.includes('--strict');
const minIdx = process.argv.indexOf('--min');
const minCoverage = minIdx >= 0 ? Number(process.argv[minIdx + 1]) : 100;

const REPO = join(import.meta.dirname, '..', '..');
const LARAVEL_ROUTES = join(REPO, 'salary-slip-bac', 'routes');
const LARAVEL_APP = join(REPO, 'salary-slip-bac', 'app');
const NODE_SRC = join(import.meta.dirname, '..', 'src');
const REACT_SRC = join(REPO, 'salary-slip-front', 'salary-slip-front', 'src');

interface Reference {
  code: string;
  surface: 'laravel' | 'node' | 'react';
  file: string;
  line: number;
}

// ---------------------------------------------------------------------------
// Source scanning
// ---------------------------------------------------------------------------

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'vendor' || entry === '.git' || entry === 'generated') continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

function scan(files: string[], surface: Reference['surface'], patterns: RegExp[]): Reference[] {
  const refs: Reference[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    text.split(/\r?\n/).forEach((line, i) => {
      for (const pattern of patterns) {
        // Patterns are declared /g; reset lastIndex so state does not leak between lines.
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(line)) !== null) {
          // A `permission:a,b,c` middleware string carries several codes at once.
          for (const raw of m[1].split(',')) {
            const code = raw.trim();
            if (!code || !code.includes('.')) continue;
            refs.push({ code, surface, file: relative(REPO, file).split(sep).join('/'), line: i + 1 });
          }
        }
      }
    });
  }
  return refs;
}

function collectReferences(): Reference[] {
  const laravel = scan(
    [...walk(LARAVEL_ROUTES, ['.php']), ...walk(LARAVEL_APP, ['.php'])],
    'laravel',
    [
      /permission:([A-Za-z0-9_.*,& -]+)/g,
      /can\(\s*['"]([A-Za-z0-9_.*& -]+)['"]/g,
      /authorize\(\s*['"]([A-Za-z0-9_.*& -]+)['"]/g,
    ],
  );

  const node = scan(
    walk(NODE_SRC, ['.ts']).filter((f) => !f.endsWith('.test.ts')),
    'node',
    [
      /requirePermission\(\s*['"]([A-Za-z0-9_.*& -]+)['"]/g,
      /guarded\(\s*['"]([A-Za-z0-9_.*& -]+)['"]/g,
      /permissionCode:\s*['"]([A-Za-z0-9_.*& -]+)['"]/g,
    ],
  );

  const react = scan(
    walk(REACT_SRC, ['.jsx', '.js', '.tsx', '.ts']).filter((f) => !/\.test\./.test(f)),
    'react',
    [
      /requiredPermission=["']([A-Za-z0-9_.*& -]+)["']/g,
      /hasPermission\(\s*['"]([A-Za-z0-9_.*& -]+)['"]/g,
      /\bcan\(\s*['"]([A-Za-z0-9_.*& -]+)['"]/g,
    ],
  );

  return [...laravel, ...node, ...react];
}

// ---------------------------------------------------------------------------
// Catalogue — schema-guarded
// ---------------------------------------------------------------------------

async function catalogue(): Promise<{ column: string; codes: string[]; duplicates: string[] }> {
  const cols = await db.$queryRawUnsafe<Array<{ column_name: string }>>(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='permissions'`
  );
  const names = new Set(cols.map((c) => c.column_name));

  // `code` is the enterprise vocabulary column; `name` is what the
  // pre-enterprise schema uses, and it already holds dotted strings.
  const column = names.has('code') ? 'code' : 'name';
  const activeFilter = names.has('is_active') ? 'where is_active = true' : '';

  const found = await db.$queryRawUnsafe<Array<{ v: string }>>(
    `select ${column} as v from permissions ${activeFilter} order by ${column}`
  );
  const all = found.map((r) => r.v).filter(Boolean);

  const seen = new Map<string, number>();
  for (const c of all) seen.set(c, (seen.get(c) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([c]) => c);

  return { column, codes: [...new Set(all)], duplicates };
}

// ---------------------------------------------------------------------------

async function main() {
  const refs = collectReferences();
  const { column, codes, duplicates } = await catalogue();

  const cat = new Set(codes);
  const enforced = new Set(refs.map((r) => r.code));

  const missing = [...enforced].filter((c) => !cat.has(c)).sort();
  const unused = [...cat].filter((c) => !enforced.has(c)).sort();
  const covered = [...enforced].filter((c) => cat.has(c)).sort();

  const coverage = enforced.size ? (covered.length / enforced.size) * 100 : 100;

  const bySurface = (s: Reference['surface']) => {
    const set = new Set(refs.filter((r) => r.surface === s).map((r) => r.code));
    const ok = [...set].filter((c) => cat.has(c)).length;
    return { referenced: set.size, resolvable: ok, pct: set.size ? (ok / set.size) * 100 : 100 };
  };

  const prefixes = (list: string[]) => {
    const m = new Map<string, number>();
    for (const c of list) {
      const p = c.split('.')[0];
      m.set(p, (m.get(p) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const report = {
    generatedAt: new Date().toISOString(),
    catalogueColumn: column,
    catalogueSize: cat.size,
    enforcedCodes: enforced.size,
    callSites: refs.length,
    coveragePct: Number(coverage.toFixed(2)),
    surfaces: { laravel: bySurface('laravel'), node: bySurface('node'), react: bySurface('react') },
    missing,
    unused,
    duplicates,
    missingByPrefix: prefixes(missing),
    unusedByPrefix: prefixes(unused),
  };

  if (asJson) {
    console.log(JSON.stringify({ ...report, references: refs }, null, 2));
  } else {
    console.log(`\nPERMISSION COVERAGE — ${report.generatedAt}`);
    console.log(`catalogue: permissions.${column} (${cat.size} distinct, ${duplicates.length} duplicated)`);
    console.log(`enforced in code: ${enforced.size} distinct codes across ${refs.length} call sites\n`);

    console.log(`COVERAGE: ${report.coveragePct}%  (${covered.length}/${enforced.size} enforced codes exist in the catalogue)`);
    for (const [s, v] of Object.entries(report.surfaces)) {
      console.log(`   ${s.padEnd(8)} ${v.resolvable}/${v.referenced} resolvable (${v.pct.toFixed(1)}%)`);
    }

    console.log(`\nMISSING — enforced by code, absent from the catalogue (${missing.length}):`);
    for (const [p, n] of report.missingByPrefix) console.log(`   ${String(n).padStart(3)}  ${p}.*`);

    console.log(`\nUNUSED — in the catalogue, enforced nowhere (${unused.length}):`);
    for (const [p, n] of report.unusedByPrefix) console.log(`   ${String(n).padStart(3)}  ${p}.*`);

    if (duplicates.length) console.log(`\nDUPLICATE (${duplicates.length}): ${duplicates.join(', ')}`);

    if (missing.length) {
      console.log(`\nEvery MISSING code denies by default under the enterprise engine.`);
      console.log(`Enforcement must not be enabled until this list is empty or explicitly accepted.`);
    }
    console.log('');
  }

  await db.$disconnect();
  if (strict && coverage < minCoverage) process.exit(1);
}

await main();
