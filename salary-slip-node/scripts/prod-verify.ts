/**
 * prod-verify.ts — read-only production state verification.
 *
 * Every statement in this file is a SELECT against information_schema,
 * pg_catalog, or an aggregate over a business table. It writes nothing, locks
 * nothing, and creates nothing. It is safe to run against production at any
 * time, including mid-incident.
 *
 * PII rule: this script reports counts, lengths and shapes. It never prints an
 * Aadhaar number, a document key, an email or a name. Where a pattern must be
 * demonstrated (S3 key layout), the value is reduced to a character class
 * skeleton before it is printed.
 *
 *   npx tsx scripts/prod-verify.ts            # human-readable
 *   npx tsx scripts/prod-verify.ts --json     # machine-readable, for CI
 *
 * Exit code is 0 unless --strict is passed, in which case any CRITICAL finding
 * exits 1 so a pipeline can gate on it.
 */

import { db } from '../src/db/client.js';

const asJson = process.argv.includes('--json');
const strict = process.argv.includes('--strict');

type Severity = 'OK' | 'INFO' | 'WARN' | 'CRITICAL';

interface Finding {
  phase: string;
  check: string;
  severity: Severity;
  detail: string;
}

const findings: Finding[] = [];
const facts: Record<string, unknown> = {};

function record(phase: string, check: string, severity: Severity, detail: string) {
  findings.push({ phase, check, severity, detail });
}

/** BigInt-safe scalar coercion — Postgres count() comes back as BigInt. */
function num(v: unknown): number {
  return typeof v === 'bigint' ? Number(v) : Number(v ?? 0);
}

async function rows<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  return db.$queryRawUnsafe<T[]>(sql);
}

/** A query that is allowed to fail because the object may not exist. */
async function tryRows<T = Record<string, unknown>>(sql: string): Promise<T[] | null> {
  try {
    return await db.$queryRawUnsafe<T[]>(sql);
  } catch {
    return null;
  }
}

async function tableExists(name: string): Promise<boolean> {
  const [r] = await rows<{ n: bigint }>(
    `select count(*) as n from information_schema.tables
      where table_schema='public' and table_name='${name}'`
  );
  return num(r?.n) > 0;
}

async function columnsOf(table: string): Promise<string[]> {
  const r = await rows<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='${table}'
      order by ordinal_position`
  );
  return r.map((c) => c.column_name);
}

// ---------------------------------------------------------------------------
// PHASE 1 — environment
// ---------------------------------------------------------------------------
async function phase1() {
  const [ver] = await rows<{ version: string }>(`select version() as version`);
  const [db_] = await rows<{ name: string }>(`select current_database() as name`);
  const [counts] = await rows<{
    tables: bigint; columns: bigint; constraints: bigint; indexes: bigint;
  }>(`
    select
      (select count(*) from information_schema.tables      where table_schema='public' and table_type='BASE TABLE') as tables,
      (select count(*) from information_schema.columns     where table_schema='public') as columns,
      (select count(*) from information_schema.table_constraints where table_schema='public') as constraints,
      (select count(*) from pg_indexes                     where schemaname='public') as indexes
  `);
  const [logging] = await rows<{ log_statement: string; log_min_duration: string }>(`
    select
      (select setting from pg_settings where name='log_statement') as log_statement,
      (select setting from pg_settings where name='log_min_duration_statement') as log_min_duration
  `);

  facts.database = db_?.name;
  facts.postgres = ver?.version?.split(',')[0];
  facts.tables = num(counts?.tables);
  facts.columns = num(counts?.columns);
  facts.constraints = num(counts?.constraints);
  facts.indexes = num(counts?.indexes);
  facts.log_statement = logging?.log_statement;

  record('1', 'database reachable', 'OK', `${db_?.name} — ${ver?.version?.split(',')[0]}`);
  record('1', 'object inventory', 'INFO',
    `${num(counts?.tables)} tables, ${num(counts?.columns)} columns, ${num(counts?.constraints)} constraints, ${num(counts?.indexes)} indexes`);

  if (logging?.log_statement === 'none') {
    record('1', 'DDL audit trail', 'WARN',
      `log_statement='none', log_min_duration_statement='${logging.log_min_duration}' — DDL against this database is not recorded anywhere. A schema change cannot be attributed after the fact.`);
  } else {
    record('1', 'DDL audit trail', 'OK', `log_statement='${logging?.log_statement}'`);
  }
}

// ---------------------------------------------------------------------------
// PHASE 2 — migration ledger
// ---------------------------------------------------------------------------
async function phase2() {
  if (!(await tableExists('_authz_migrations'))) {
    record('2', 'authz ledger', 'INFO', '_authz_migrations does not exist — the Node migrator has never run here.');
    return;
  }

  const cols = await columnsOf('_authz_migrations');
  const hasStatus = cols.includes('status');
  facts.ledger_columns = cols;

  record('2', 'ledger shape', hasStatus ? 'OK' : 'WARN',
    hasStatus
      ? `append-only shape present: ${cols.join(', ')}`
      : `legacy 3-column shape (${cols.join(', ')}) — no status/rolled_back_at/reason. The current migrator adds these via ADD COLUMN IF NOT EXISTS on first run.`);

  const ledger = await rows<Record<string, unknown>>(
    `select ${hasStatus ? 'id, status, applied_at, applied_by, rolled_back_at, rolled_back_by' : 'id, applied_at, applied_by'}
       from _authz_migrations order by id`
  );
  facts.ledger = ledger.map((r) => ({ ...r }));

  // A ghost = ledger claims APPLIED, but the objects that migration creates are gone.
  const authzTables = num(
    (await rows<{ n: bigint }>(
      `select count(*) as n from information_schema.tables
        where table_schema='public' and table_name like 'authorization%'`
    ))[0]?.n
  );
  const permissionsCode = num(
    (await rows<{ n: bigint }>(
      `select count(*) as n from information_schema.columns
        where table_schema='public' and table_name='permissions' and column_name='code'`
    ))[0]?.n
  );

  facts.authz_tables = authzTables;
  facts.permissions_code_present = permissionsCode > 0;

  const applied = ledger.filter((r) => !hasStatus || r.status === 'APPLIED');
  const ghosts = authzTables === 0 ? applied.map((r) => String(r.id)) : [];

  if (ghosts.length) {
    record('2', 'ghost migrations', 'CRITICAL',
      `${ghosts.join(', ')} recorded APPLIED but 0 authorization_* tables exist and permissions.code is ${permissionsCode ? 'present' : 'absent'}. The ledger claims work that is not in the database.`);
  } else if (applied.length) {
    record('2', 'ghost migrations', 'OK', `${applied.length} applied, objects present.`);
  } else {
    record('2', 'ghost migrations', 'OK', 'ledger empty or fully rolled back — consistent.');
  }
  facts.ghosts = ghosts;

  // Laravel's own ledger.
  const lar = await tryRows<{ n: bigint }>(`select count(*) as n from migrations`);
  if (lar) {
    facts.laravel_migrations = num(lar[0]?.n);
    record('2', 'laravel ledger', 'INFO', `${num(lar[0]?.n)} rows in migrations`);
  }
}

// ---------------------------------------------------------------------------
// PHASE 4 — authorization schema
// ---------------------------------------------------------------------------

/** The fifteen tables 0001 creates. */
const AUTHZ_TABLES = [
  'authorization_role_assignments', 'authorization_policies', 'authorization_feature_flags',
  'authorization_decision_logs', 'authorization_access_requests', 'authorization_access_request_approvals',
  'authorization_access_reviews', 'authorization_access_review_items', 'authorization_delegations',
  'authorization_sod_rules', 'authorization_sod_violations', 'authorization_role_inheritances',
  'authorization_field_rules', 'authorization_row_rules', 'authorization_emergency_grants',
];

/** Columns 0001 adds to the base RBAC tables. */
const AUTHZ_COLUMNS: Array<[string, string]> = [
  ['permissions', 'code'], ['permissions', 'is_active'], ['permissions', 'resource'],
  ['permissions', 'action'], ['permissions', 'is_sensitive'],
  ['roles', 'code'], ['roles', 'status'], ['roles', 'role_type'], ['roles', 'is_active'],
  ['role_permissions', 'effect'], ['role_permissions', 'conditions'],
  ['role_permissions', 'obligations'], ['role_permissions', 'inherit_to_children'],
  ['role_permissions', 'valid_from'], ['role_permissions', 'valid_until'],
  ['user_permissions', 'is_denied'], ['user_permissions', 'conditions'],
  ['user_permissions', 'obligations'], ['user_permissions', 'valid_from'],
  ['user_permissions', 'valid_until'],
];

async function phase4() {
  const present = await rows<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema='public' and table_name = any(array[${AUTHZ_TABLES.map((t) => `'${t}'`).join(',')}])`
  );
  const have = new Set(present.map((r) => r.table_name));
  const missingTables = AUTHZ_TABLES.filter((t) => !have.has(t));

  const colRows = await rows<{ table_name: string; column_name: string }>(
    `select table_name, column_name from information_schema.columns
      where table_schema='public'
        and (table_name, column_name) in (${AUTHZ_COLUMNS.map(([t, c]) => `('${t}','${c}')`).join(',')})`
  );
  const haveCol = new Set(colRows.map((r) => `${r.table_name}.${r.column_name}`));
  const missingColumns = AUTHZ_COLUMNS.filter(([t, c]) => !haveCol.has(`${t}.${c}`)).map(([t, c]) => `${t}.${c}`);

  facts.authz_missing_tables = missingTables;
  facts.authz_missing_columns = missingColumns;

  if (missingTables.length === AUTHZ_TABLES.length && missingColumns.length === AUTHZ_COLUMNS.length) {
    record('4', 'authorization platform', 'CRITICAL',
      `absent in full — 0/${AUTHZ_TABLES.length} tables, 0/${AUTHZ_COLUMNS.length} added columns. Production is on the pre-enterprise schema.`);
  } else if (missingTables.length || missingColumns.length) {
    record('4', 'authorization platform', 'CRITICAL',
      `PARTIAL — ${AUTHZ_TABLES.length - missingTables.length}/${AUTHZ_TABLES.length} tables, ${AUTHZ_COLUMNS.length - missingColumns.length}/${AUTHZ_COLUMNS.length} columns. A partial platform is the one state neither code path handles.`);
  } else {
    record('4', 'authorization platform', 'OK', 'complete — all tables and columns present.');
  }

  // Orphans: columns a later migration added that survived the rollback of an earlier one.
  const orphan = await rows<{ table_name: string; column_name: string }>(
    `select table_name, column_name from information_schema.columns
      where table_schema='public' and table_name='permissions' and column_name='level'`
  );
  if (orphan.length && missingColumns.includes('permissions.code')) {
    record('4', 'orphan objects', 'WARN',
      `permissions.level exists while permissions.code does not. level was added by 0003; 0001's down() had no reason to know about it. Harmless, but it is the fingerprint of a dependency-violating rollback.`);
    facts.orphan_columns = ['permissions.level'];
  }

  // Legacy RBAC tables must still be intact for Option A to be viable.
  for (const t of ['roles', 'permissions', 'role_permissions', 'user_roles', 'user_permissions']) {
    const ok = await tableExists(t);
    if (!ok) record('4', `legacy table ${t}`, 'CRITICAL', 'missing — legacy authorization cannot function.');
  }
}

// ---------------------------------------------------------------------------
// PHASE 6 — RBAC coverage
// ---------------------------------------------------------------------------
async function phase6() {
  const [c] = await rows<Record<string, bigint>>(`
    select
      (select count(*) from users) as users,
      (select count(*) from roles) as roles,
      (select count(*) from permissions) as permissions,
      (select count(*) from user_roles) as user_roles,
      (select count(*) from role_permissions) as role_permissions,
      (select count(*) from user_permissions) as user_permissions
  `);
  const counts = Object.fromEntries(Object.entries(c ?? {}).map(([k, v]) => [k, num(v)]));
  facts.rbac_counts = counts;
  record('6', 'rbac inventory', 'INFO', JSON.stringify(counts));

  const [orphans] = await rows<Record<string, bigint>>(`
    select
      (select count(*) from permissions p where not exists (select 1 from role_permissions rp where rp.permission_id = p.id)) as permissions_without_role,
      (select count(*) from roles r       where not exists (select 1 from role_permissions rp where rp.role_id = r.id))       as roles_without_permission,
      (select count(*) from roles r       where not exists (select 1 from user_roles ur where ur.role_id = r.id))             as roles_without_user,
      (select count(*) from users u       where not exists (select 1 from user_roles ur where ur.user_id = u.id))             as users_without_role
  `);
  const o = Object.fromEntries(Object.entries(orphans ?? {}).map(([k, v]) => [k, num(v)]));
  facts.rbac_orphans = o;

  const usersWithoutRole = o.users_without_role ?? 0;
  const totalUsers = counts.users ?? 1;
  const wiredPct = totalUsers ? (((totalUsers - usersWithoutRole) / totalUsers) * 100) : 0;
  facts.rbac_user_coverage_pct = Number(wiredPct.toFixed(2));

  record('6', 'rbac wiring', wiredPct < 100 ? 'CRITICAL' : 'OK',
    `${(totalUsers - usersWithoutRole)}/${totalUsers} users have a user_roles row (${wiredPct.toFixed(2)}%). ` +
    `${o.permissions_without_role} permissions attached to no role; ${o.roles_without_permission} roles with no permission; ${o.roles_without_user} roles with no user.`);

  // The column that actually decides access today.
  const legacy = await rows<{ role: number; n: bigint }>(
    `select role, count(*) as n from users group by role order by role`
  );
  facts.users_by_legacy_role = legacy.map((r) => ({ role: Number(r.role), n: num(r.n) }));
  record('6', 'effective control', 'INFO',
    `users.role distribution: ${legacy.map((r) => `${r.role}:${num(r.n)}`).join(', ')} — this integer, not the RBAC tables, is what production authorizes on.`);
}

// ---------------------------------------------------------------------------
// PHASE 7 — audit logging
// ---------------------------------------------------------------------------
async function phase7() {
  for (const t of ['audit_logs', 'document_audit_logs']) {
    if (!(await tableExists(t))) {
      record('7', t, 'WARN', 'table absent');
      continue;
    }
    const cols = await columnsOf(t);
    const tsCol = ['created_at', 'occurred_at', 'logged_at'].find((c) => cols.includes(c));
    const [r] = await rows<{ n: bigint; max_id: bigint | null; latest: Date | null }>(
      `select count(*) as n, max(id) as max_id${tsCol ? `, max(${tsCol}) as latest` : ', null as latest'} from ${t}`
    );
    const latest = r?.latest ? new Date(r.latest as unknown as string) : null;
    const ageHours = latest ? (Date.now() - latest.getTime()) / 3_600_000 : null;
    facts[`${t}_rows`] = num(r?.n);
    facts[`${t}_latest`] = latest?.toISOString() ?? null;

    const stale = ageHours !== null && ageHours > 4;
    record('7', t, stale ? 'CRITICAL' : 'OK',
      `${num(r?.n)} rows, max id ${num(r?.max_id)}, latest ${latest?.toISOString() ?? 'n/a'}` +
      (ageHours !== null ? ` (${ageHours.toFixed(1)}h ago)` : ''));
  }

  // Cross-check: is the application actually active? If the document trail moves
  // and the general trail does not, the general trail is broken rather than idle.
  const docActive = num(facts.document_audit_logs_rows as number);
  const genRows = num(facts.audit_logs_rows as number);
  if (docActive > genRows * 5) {
    record('7', 'trail divergence', 'CRITICAL',
      `document_audit_logs holds ${docActive} rows against audit_logs' ${genRows}. The application is demonstrably active; the general audit trail is not recording it.`);
  }
}

// ---------------------------------------------------------------------------
// PHASE 8 — Aadhaar exposure (counts and shapes only, never values)
// ---------------------------------------------------------------------------
async function phase8() {
  const userCols = await columnsOf('users');
  const has = (c: string) => userCols.includes(c);
  facts.aadhaar_columns = {
    legacy_plaintext: has('aadhar_card_no'),
    encrypted: has('encrypted_aadhaar_number'),
    last_four: has('aadhaar_last_four'),
    secure_reference: has('aadhaar_secure_reference'),
  };

  const parts: string[] = [`count(*) as total`];
  if (has('aadhar_card_no')) parts.push(`count(aadhar_card_no) as plaintext`);
  if (has('encrypted_aadhaar_number')) parts.push(`count(encrypted_aadhaar_number) as encrypted`);
  if (has('aadhaar_last_four')) parts.push(`count(aadhaar_last_four) as last_four`);
  if (has('aadhaar_secure_reference')) parts.push(`count(aadhaar_secure_reference) as secure_reference`);
  const [a] = await rows<Record<string, bigint>>(`select ${parts.join(', ')} from users`);
  const agg = Object.fromEntries(Object.entries(a ?? {}).map(([k, v]) => [k, num(v)]));
  facts.aadhaar_counts = agg;

  const plaintext = agg.plaintext ?? 0;
  if (plaintext > 0 && (agg.encrypted ?? 0) === 0) {
    record('8', 'aadhaar at rest', 'CRITICAL',
      `${plaintext}/${agg.total} users hold a plaintext Aadhaar in users.aadhar_card_no; encrypted=0, last_four=0, secure_reference=0. No encryption, no tokenisation, no masking column populated.`);
  } else if (plaintext > 0) {
    record('8', 'aadhaar at rest', 'WARN', `${plaintext} plaintext rows remain alongside ${agg.encrypted} encrypted.`);
  } else {
    record('8', 'aadhaar at rest', 'OK', 'no plaintext Aadhaar column populated.');
  }

  // S3 key shape. Reduce to a character-class skeleton so nothing identifying prints.
  if (await tableExists('document_versions')) {
    const dvCols = await columnsOf('document_versions');
    const keyCol = ['storage_key', 'object_key', 's3_key', 'path', 'storage_path'].find((c) => dvCols.includes(c));
    if (keyCol) {
      const [k] = await rows<{ total: bigint; twelve_digit_prefix: bigint }>(
        `select count(*) as total,
                count(*) filter (where split_part(${keyCol}, '/', 1) ~ '^[0-9]{12}$') as twelve_digit_prefix
           from document_versions`
      );
      facts.s3_keys = { total: num(k?.total), twelve_digit_prefix: num(k?.twelve_digit_prefix), column: keyCol };

      // Confirm the prefix really is an Aadhaar, without selecting either value.
      const [m] = await rows<{ matched: bigint }>(
        `select count(*) as matched
           from document_versions dv
           join documents d on d.id = dv.document_id
           join users u on u.id = d.user_id
          where split_part(dv.${keyCol}, '/', 1) = u.aadhar_card_no`
      ).catch(() => [{ matched: BigInt(0) }] as never);
      facts.s3_keys_confirmed_aadhaar = num(m?.matched);

      if (num(k?.twelve_digit_prefix) > 0) {
        record('8', 'aadhaar in object keys', 'CRITICAL',
          `${num(k?.twelve_digit_prefix)}/${num(k?.total)} document_versions have a 12-digit first path segment in ${keyCol}; ${num(m?.matched)} are confirmed equal to that owner's users.aadhar_card_no. Aadhaar numbers are embedded in S3 object keys, which appear in access logs, CDN logs and presigned URLs.`);
      }
    }
  }

  // Disclosure counters already written by the application.
  const disc = await tryRows<{ action: string; n: bigint }>(
    `select action, count(*) as n from document_audit_logs
      where action like '%AADHAAR%' group by action order by count(*) desc`
  );
  if (disc?.length) {
    const total = disc.reduce((s, r) => s + num(r.n), 0);
    facts.aadhaar_disclosures = disc.map((r) => ({ action: r.action, n: num(r.n) }));
    record('8', 'aadhaar disclosure log', 'CRITICAL',
      `${total} recorded full-Aadhaar disclosures: ${disc.map((r) => `${r.action}=${num(r.n)}`).join(', ')}. The application logs that it disclosed them, which is evidence of exposure, not mitigation.`);
  }
}

// ---------------------------------------------------------------------------
// PHASE 9 — upload security
// ---------------------------------------------------------------------------
async function phase9() {
  if (!(await tableExists('document_versions'))) {
    record('9', 'document_versions', 'WARN', 'table absent');
    return;
  }
  const cols = await columnsOf('document_versions');
  facts.document_version_columns = cols;

  if (cols.includes('scan_status')) {
    const s = await rows<{ scan_status: string; n: bigint }>(
      `select scan_status, count(*) as n from document_versions group by scan_status order by count(*) desc`
    );
    facts.scan_status = s.map((r) => ({ status: r.scan_status, n: num(r.n) }));
    const unscanned = s.filter((r) => r.scan_status !== 'CLEAN').reduce((t, r) => t + num(r.n), 0);
    const total = s.reduce((t, r) => t + num(r.n), 0);
    record('9', 'malware scanning', unscanned === total && total > 0 ? 'CRITICAL' : unscanned ? 'WARN' : 'OK',
      `${s.map((r) => `${r.scan_status}=${num(r.n)}`).join(', ')} — ${unscanned}/${total} versions have never been scanned. No upload has been cleared as safe.`);
  }

  const checks: Array<[string, string]> = [
    ['checksum', 'content integrity'],
    ['mime_type', 'declared mime'],
    ['size_bytes', 'size recorded'],
    ['quarantined_at', 'quarantine support'],
  ];
  for (const [col, label] of checks) {
    const found = cols.some((c) => c === col || c.includes(col.split('_')[0]));
    if (!found) record('9', label, 'WARN', `no ${col}-like column on document_versions`);
  }
}

// ---------------------------------------------------------------------------
// PHASE 10 — HR module tables
// ---------------------------------------------------------------------------
const HR_TABLES = [
  'job_requisitions', 'candidates', 'candidate_stage_history', 'interviews',
  'interview_panelists', 'interview_feedback', 'offers', 'offer_revisions',
  'assets', 'asset_allocations', 'performance_cycles', 'performance_goals',
  'performance_reviews',
];

async function phase10() {
  const present = await rows<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema='public' and table_name = any(array[${HR_TABLES.map((t) => `'${t}'`).join(',')}])`
  );
  const have = new Set(present.map((r) => r.table_name));
  const missing = HR_TABLES.filter((t) => !have.has(t));
  facts.hr_tables_present = [...have];
  facts.hr_tables_missing = missing;

  record('10', 'hr module tables', missing.length ? 'CRITICAL' : 'OK',
    missing.length
      ? `${missing.length}/${HR_TABLES.length} absent: ${missing.join(', ')}. Any deployed UI or route touching these fails at runtime, not at build.`
      : 'all present.');
}

// ---------------------------------------------------------------------------
async function main() {
  await phase1();
  await phase2();
  await phase4();
  await phase6();
  await phase7();
  await phase8();
  await phase9();
  await phase10();

  if (asJson) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), facts, findings }, null, 2));
  } else {
    const order: Severity[] = ['CRITICAL', 'WARN', 'INFO', 'OK'];
    const icon: Record<Severity, string> = { CRITICAL: 'XX', WARN: '!!', INFO: '..', OK: 'ok' };
    console.log(`\nPRODUCTION VERIFICATION — ${new Date().toISOString()}`);
    console.log(`database ${facts.database} · ${facts.tables} tables · ${facts.postgres}\n`);
    for (const sev of order) {
      const group = findings.filter((f) => f.severity === sev);
      if (!group.length) continue;
      console.log(`--- ${sev} (${group.length}) ---`);
      for (const f of group) console.log(`  [${icon[sev]}] P${f.phase} ${f.check}\n        ${f.detail}`);
      console.log('');
    }
    const crit = findings.filter((f) => f.severity === 'CRITICAL').length;
    console.log(`${crit} critical, ${findings.filter((f) => f.severity === 'WARN').length} warnings.\n`);
  }

  await db.$disconnect();
  if (strict && findings.some((f) => f.severity === 'CRITICAL')) process.exit(1);
}

await main();
