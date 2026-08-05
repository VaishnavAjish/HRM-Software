/**
 * load-test.ts — scale behaviour of the hot query paths.
 *
 * Runs in a throwaway database. niss_hrms is never opened.
 *
 *   npx tsx scripts/load-test.ts               # 2,000,000 rows
 *   npx tsx scripts/load-test.ts --rows 500000
 *   npx tsx scripts/load-test.ts --keep        # leave the scratch db for inspection
 *
 * Why not 2 billion: at ~250 bytes/row with indexes that is 300-500 GB. The
 * Postgres volume has 25 GB free, so it cannot be materialised here. It does not
 * need to be. A sequential scan costs O(n) — measuring it at 2e6 and at 2e9 tells
 * you the same thing about whether an index exists, and the ratio extrapolates
 * linearly. What changes past a few hundred million rows is planner choice,
 * autovacuum, and partition pressure, which are called out in the report rather
 * than guessed at.
 *
 * The schema below mirrors production's real shape for the four tables that
 * actually grow: employees, their payslips, attendance and the audit trail.
 * Indexes are created in two passes so the same query can be timed with the
 * production index set and then with the proposed one.
 */

import { PrismaClient } from '../src/generated/prisma/index.js';

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const ROWS = arg('rows', 2_000_000);
const KEEP = process.argv.includes('--keep');

const base = process.env.DATABASE_URL!;
const SCRATCH = 'hrms_loadtest';
const adminUrl = base.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
const scratchUrl = base.replace(/\/[^/?]+(\?|$)/, `/${SCRATCH}$1`);

const ms = (n: bigint) => Number(n) / 1e6;

async function main() {
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${SCRATCH}`);
  await admin.$executeRawUnsafe(`CREATE DATABASE ${SCRATCH}`);
  await admin.$disconnect();
  console.log(`scratch database ${SCRATCH} created`);

  const db = new PrismaClient({ datasources: { db: { url: scratchUrl } } });

  // ---- schema: production's shape, production's index set -----------------
  await db.$executeRawUnsafe(`
    CREATE TABLE users (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(190), emp_code VARCHAR(64), email VARCHAR(190),
      company_code VARCHAR(64), unit VARCHAR(64), department VARCHAR(64),
      role SMALLINT NOT NULL DEFAULT 3,
      status VARCHAR(4) NOT NULL DEFAULT '0',
      is_deleted VARCHAR(4) NOT NULL DEFAULT '0',
      joining_date DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.$executeRawUnsafe(`
    CREATE TABLE salary_slips (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      company_code VARCHAR(64), month SMALLINT, year SMALLINT,
      net_payable NUMERIC(12,2), created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.$executeRawUnsafe(`
    CREATE TABLE attendances (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      marked_by BIGINT, company_code VARCHAR(64),
      attendance_date DATE NOT NULL, status VARCHAR(16))`);
  await db.$executeRawUnsafe(`
    CREATE TABLE audit_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT, action VARCHAR(64), module VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

  console.log(`seeding ~${ROWS.toLocaleString()} rows…`);
  const employees = Math.max(1000, Math.floor(ROWS / 20));
  const t0 = process.hrtime.bigint();

  await db.$executeRawUnsafe(`
    INSERT INTO users (name, emp_code, email, company_code, unit, department, role, joining_date)
    SELECT 'Employee ' || g, 'EMP' || lpad(g::text, 8, '0'), 'e' || g || '@example.test',
           (ARRAY['nidhi-impex','silver-star','niss-labs'])[1 + g % 3],
           (ARRAY['Mumbai HQ','Vapi Plant','Silvassa'])[1 + g % 3],
           (ARRAY['Manufacturing','Finance','IT','Quality','Supply Chain'])[1 + g % 5],
           3, date '2020-01-01' + (g % 1800)
      FROM generate_series(1, ${employees}) g`);

  // Payslips dominate the row count, as they do in production.
  await db.$executeRawUnsafe(`
    INSERT INTO salary_slips (user_id, company_code, month, year, net_payable)
    SELECT u.id, u.company_code, 1 + (g % 12), 2020 + (g % 6), 20000 + (g % 80000)
      FROM users u, generate_series(1, ${Math.max(1, Math.floor(ROWS / employees))}) g`);

  await db.$executeRawUnsafe(`
    INSERT INTO attendances (user_id, marked_by, company_code, attendance_date, status)
    SELECT u.id, 1, u.company_code, date '2024-01-01' + (g % 400),
           (ARRAY['P','A','L','H'])[1 + g % 4]
      FROM users u, generate_series(1, 10) g`);

  await db.$executeRawUnsafe(`
    INSERT INTO audit_logs (user_id, action, module)
    SELECT u.id, 'UPDATE', 'Employee' FROM users u, generate_series(1, 5) g`);

  await db.$executeRawUnsafe(`ANALYZE`);
  console.log(`seeded in ${(ms(process.hrtime.bigint() - t0) / 1000).toFixed(1)}s`);

  const counts = await db.$queryRawUnsafe<any[]>(`
    SELECT (SELECT count(*) FROM users) users,
           (SELECT count(*) FROM salary_slips) salary_slips,
           (SELECT count(*) FROM attendances) attendances,
           (SELECT count(*) FROM audit_logs) audit_logs,
           pg_size_pretty(pg_database_size(current_database())) size`);
  console.log('volume:', JSON.stringify(counts[0], (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));

  // ---- the queries the application actually issues -------------------------
  const QUERIES: Array<[string, string]> = [
    ['employee list — company scope + page 1',
     `SELECT id, name, emp_code, department FROM users
       WHERE is_deleted='0' AND company_code='nidhi-impex'
       ORDER BY id LIMIT 50`],
    ['employee list — deep page (OFFSET 100000)',
     `SELECT id, name, emp_code FROM users
       WHERE is_deleted='0' AND company_code='nidhi-impex'
       ORDER BY id OFFSET 100000 LIMIT 50`],
    ['employee list — keyset page (id > cursor)',
     `SELECT id, name, emp_code FROM users
       WHERE is_deleted='0' AND company_code='nidhi-impex' AND id > 100000
       ORDER BY id LIMIT 50`],
    ['payslips for one employee',
     `SELECT id, month, year, net_payable FROM salary_slips
       WHERE user_id = 5000 ORDER BY year DESC, month DESC LIMIT 24`],
    ['payslip search by period + company',
     `SELECT count(*) FROM salary_slips
       WHERE company_code='nidhi-impex' AND year=2024 AND month=6`],
    ['attendance for one employee in a month',
     `SELECT count(*) FROM attendances
       WHERE user_id = 5000 AND attendance_date BETWEEN '2024-06-01' AND '2024-06-30'`],
    ['audit trail for one user',
     `SELECT id, action FROM audit_logs WHERE user_id = 5000 ORDER BY id DESC LIMIT 50`],
    ['dashboard rollup — headcount by department',
     `SELECT department, count(*) FROM users
       WHERE is_deleted='0' AND company_code='nidhi-impex' GROUP BY department`],
  ];

  async function timeAll(label: string) {
    console.log(`\n=== ${label} ===`);
    const out: Array<{ q: string; ms: number; plan: string }> = [];
    for (const [name, sql] of QUERIES) {
      await db.$queryRawUnsafe(sql); // warm
      const s = process.hrtime.bigint();
      await db.$queryRawUnsafe(sql);
      const took = ms(process.hrtime.bigint() - s);
      const plan = await db.$queryRawUnsafe<any[]>(`EXPLAIN (FORMAT JSON) ${sql}`);
      const txt = JSON.stringify(plan[0]['QUERY PLAN']);
      const scan = /Seq Scan/.test(txt) ? 'SEQ SCAN' : /Index Only Scan/.test(txt) ? 'index-only' : /Index Scan/.test(txt) ? 'index' : 'other';
      out.push({ q: name, ms: took, plan: scan });
      console.log(`  ${took.toFixed(1).padStart(9)} ms  ${scan.padEnd(10)} ${name}`);
    }
    return out;
  }

  const before = await timeAll('BEFORE — production index set (PK only on these columns)');

  // ---- the proposed indexes ----------------------------------------------
  console.log('\napplying proposed indexes…');
  const INDEXES = [
    `CREATE INDEX idx_users_company_active ON users (company_code, id) WHERE is_deleted='0'`,
    `CREATE INDEX idx_users_company_dept ON users (company_code, department) WHERE is_deleted='0'`,
    `CREATE INDEX idx_salary_slips_user ON salary_slips (user_id, year DESC, month DESC)`,
    `CREATE INDEX idx_salary_slips_period ON salary_slips (company_code, year, month)`,
    `CREATE INDEX idx_attendances_user_date ON attendances (user_id, attendance_date)`,
    `CREATE INDEX idx_attendances_marked_by ON attendances (marked_by)`,
    `CREATE INDEX idx_audit_logs_user ON audit_logs (user_id, id DESC)`,
  ];
  const ti = process.hrtime.bigint();
  for (const sql of INDEXES) await db.$executeRawUnsafe(sql);
  await db.$executeRawUnsafe(`ANALYZE`);
  console.log(`built ${INDEXES.length} indexes in ${(ms(process.hrtime.bigint() - ti) / 1000).toFixed(1)}s`);

  const after = await timeAll('AFTER — proposed index set');

  console.log('\n=== SUMMARY ===');
  console.log('  before(ms)   after(ms)   change   query');
  before.forEach((b, i) => {
    const a = after[i];
    const factor = b.ms / Math.max(a.ms, 0.001);
    const verdict = factor >= 2 ? `${factor.toFixed(0)}x faster` : factor <= 0.5 ? `${(1 / factor).toFixed(0)}x SLOWER` : 'no change';
    console.log(`  ${b.ms.toFixed(1).padStart(9)}  ${a.ms.toFixed(1).padStart(9)}   ${verdict.padEnd(12)} ${b.q}`);
  });

  const size = await db.$queryRawUnsafe<any[]>(`SELECT pg_size_pretty(pg_database_size(current_database())) s`);
  console.log(`\nfinal size with indexes: ${size[0].s}`);

  await db.$disconnect();

  if (!KEEP) {
    const a2 = new PrismaClient({ datasources: { db: { url: adminUrl } } });
    await a2.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${SCRATCH}`);
    await a2.$disconnect();
    console.log('scratch database dropped. niss_hrms was never opened.');
  }
}

await main();
