/**
 * Integration tests — real PostgreSQL, not fakes.
 *
 * Why this file exists
 * --------------------
 * On 2026-08-03 fifteen authorization tables were dropped from production and
 * not one of the 684 unit tests noticed, because every one of them runs against
 * an in-memory fake. A fake cannot tell you the schema is gone; only a database
 * can. These tests provision a scratch database, shape it like the two schema
 * generations this codebase has to survive, and assert the readiness probe
 * reports the truth in both.
 *
 * They never touch niss_hrms. Each test creates and drops its own database.
 *
 * Skipped automatically when INTEGRATION_DATABASE_URL is unset, so the default
 * `npm test` stays hermetic and CI opts in explicitly.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../generated/prisma/index.js';

const ADMIN_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = ADMIN_URL ? describe : describe.skip;

/** Unique per run so parallel CI jobs cannot collide. */
const dbName = `hrms_it_${process.pid}_${Math.abs(hashOf(String(process.hrtime.bigint())))}`;

function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function urlFor(name: string): string {
  return ADMIN_URL!.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
}

suite('authorization schema readiness — against a real database', () => {
  let admin: PrismaClient;
  let scratch: PrismaClient;

  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: urlFor('postgres') } } });
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.$executeRawUnsafe(`CREATE DATABASE ${dbName}`);
    scratch = new PrismaClient({ datasources: { db: { url: urlFor(dbName) } } });
  }, 60_000);

  afterAll(async () => {
    await scratch?.$disconnect();
    await admin?.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin?.$disconnect();
  }, 60_000);

  /**
   * The probe, reimplemented against an injectable client. The production
   * version in schema-readiness.ts is bound to the app singleton; the SQL is
   * identical and is the thing under test.
   */
  async function probe(client: PrismaClient): Promise<boolean> {
    const [row] = await client.$queryRawUnsafe<Array<{ tables: bigint; columns: bigint }>>(`
      select
        (select count(*) from information_schema.tables
          where table_schema = 'public'
            and table_name in ('authorization_feature_flags',
                               'authorization_role_assignments',
                               'authorization_policies')) as tables,
        (select count(*) from information_schema.columns
          where table_schema = 'public'
            and (table_name, column_name) in (
              ('permissions', 'code'), ('permissions', 'is_active'),
              ('roles', 'code'), ('roles', 'status'),
              ('role_permissions', 'effect'), ('user_permissions', 'valid_until')
            )) as columns
    `);
    return Number(row?.tables ?? 0) === 3 && Number(row?.columns ?? 0) === 6;
  }

  async function reset() {
    await scratch.$executeRawUnsafe(`DROP SCHEMA public CASCADE`);
    await scratch.$executeRawUnsafe(`CREATE SCHEMA public`);
  }

  /** The schema production is on today. */
  async function buildLegacySchema() {
    await scratch.$executeRawUnsafe(
      `CREATE TABLE permissions (id BIGSERIAL PRIMARY KEY, name VARCHAR(190), level VARCHAR(20) NOT NULL DEFAULT 'ACTION')`
    );
    await scratch.$executeRawUnsafe(
      `CREATE TABLE roles (id BIGSERIAL PRIMARY KEY, name VARCHAR(190), type VARCHAR(50), is_active BOOLEAN NOT NULL DEFAULT TRUE)`
    );
    await scratch.$executeRawUnsafe(`CREATE TABLE role_permissions (role_id BIGINT, permission_id BIGINT)`);
    await scratch.$executeRawUnsafe(
      `CREATE TABLE user_permissions (user_id BIGINT, permission_id BIGINT, is_denied BOOLEAN NOT NULL DEFAULT FALSE)`
    );
  }

  /** What migration 0001 turns it into. */
  async function upgradeToEnterprise() {
    await scratch.$executeRawUnsafe(`ALTER TABLE permissions ADD COLUMN code VARCHAR(190), ADD COLUMN is_active BOOLEAN DEFAULT TRUE`);
    await scratch.$executeRawUnsafe(`ALTER TABLE roles ADD COLUMN code VARCHAR(190), ADD COLUMN status VARCHAR(20)`);
    await scratch.$executeRawUnsafe(`ALTER TABLE role_permissions ADD COLUMN effect VARCHAR(10)`);
    await scratch.$executeRawUnsafe(`ALTER TABLE user_permissions ADD COLUMN valid_until TIMESTAMPTZ`);
    for (const t of ['authorization_feature_flags', 'authorization_role_assignments', 'authorization_policies']) {
      await scratch.$executeRawUnsafe(`CREATE TABLE ${t} (id BIGSERIAL PRIMARY KEY)`);
    }
  }

  it('reports NOT ready on the pre-enterprise schema', async () => {
    await reset();
    await buildLegacySchema();
    await expect(probe(scratch)).resolves.toBe(false);
  }, 30_000);

  it('reports ready once the enterprise migration has run', async () => {
    await reset();
    await buildLegacySchema();
    await upgradeToEnterprise();
    await expect(probe(scratch)).resolves.toBe(true);
  }, 30_000);

  it('reports NOT ready when the tables exist but the columns do not', async () => {
    // The exact half-applied state a dependency-violating rollback produces,
    // and the one state neither the Laravel nor the Node code path handles.
    await reset();
    await buildLegacySchema();
    for (const t of ['authorization_feature_flags', 'authorization_role_assignments', 'authorization_policies']) {
      await scratch.$executeRawUnsafe(`CREATE TABLE ${t} (id BIGSERIAL PRIMARY KEY)`);
    }
    await expect(probe(scratch)).resolves.toBe(false);
  }, 30_000);

  it('reports NOT ready when one single required column is dropped', async () => {
    await reset();
    await buildLegacySchema();
    await upgradeToEnterprise();
    await expect(probe(scratch)).resolves.toBe(true);

    await scratch.$executeRawUnsafe(`ALTER TABLE permissions DROP COLUMN code`);
    await expect(probe(scratch)).resolves.toBe(false);
  }, 30_000);

  it('survives the rollback that caused the incident, and says so', async () => {
    await reset();
    await buildLegacySchema();
    await upgradeToEnterprise();
    expect(await probe(scratch)).toBe(true);

    // 0001 down(): drop the tables and the added columns.
    for (const t of ['authorization_policies', 'authorization_role_assignments', 'authorization_feature_flags']) {
      await scratch.$executeRawUnsafe(`DROP TABLE ${t}`);
    }
    await scratch.$executeRawUnsafe(`ALTER TABLE permissions DROP COLUMN code, DROP COLUMN is_active`);
    await scratch.$executeRawUnsafe(`ALTER TABLE roles DROP COLUMN code, DROP COLUMN status`);
    await scratch.$executeRawUnsafe(`ALTER TABLE role_permissions DROP COLUMN effect`);
    await scratch.$executeRawUnsafe(`ALTER TABLE user_permissions DROP COLUMN valid_until`);

    expect(await probe(scratch)).toBe(false);

    // permissions.level is 0003's, which 0001's down() never knew about. Its
    // survival alongside a missing permissions.code is the fingerprint of the
    // dependency violation, and the doctor command keys on exactly this.
    const [orphan] = await scratch.$queryRawUnsafe<Array<{ n: bigint }>>(
      `select count(*) as n from information_schema.columns
        where table_schema='public' and table_name='permissions' and column_name='level'`
    );
    expect(Number(orphan.n)).toBe(1);
  }, 30_000);
});

suite('permission vocabulary — the catalogue must satisfy what the code enforces', () => {
  let admin: PrismaClient;
  let scratch: PrismaClient;
  const vocabDb = `${dbName}_vocab`;

  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: urlFor('postgres') } } });
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${vocabDb}`);
    await admin.$executeRawUnsafe(`CREATE DATABASE ${vocabDb}`);
    scratch = new PrismaClient({ datasources: { db: { url: urlFor(vocabDb) } } });
    await scratch.$executeRawUnsafe(`CREATE TABLE permissions (id BIGSERIAL PRIMARY KEY, name VARCHAR(190))`);
  }, 60_000);

  afterAll(async () => {
    await scratch?.$disconnect();
    await admin?.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${vocabDb}`);
    await admin?.$disconnect();
  }, 60_000);

  it('detects a catalogue that shares no vocabulary with the enforced codes', async () => {
    // Production's actual situation on 2026-08-03: two disjoint vocabularies.
    await scratch.$executeRawUnsafe(
      `INSERT INTO permissions (name) VALUES ('employees.view'), ('salary slips.create'), ('platform.flags.manage')`
    );
    const enforced = ['hr.employee.read', 'admin.role.read', 'payroll.payslip.read'];

    const found = await scratch.$queryRawUnsafe<Array<{ name: string }>>(`select name from permissions`);
    const catalogue = new Set(found.map((r) => r.name));
    const missing = enforced.filter((c) => !catalogue.has(c));

    expect(missing).toEqual(enforced);
    expect(missing.length / enforced.length).toBe(1); // 0% coverage
  }, 30_000);

  it('confirms coverage once the enforced vocabulary is seeded', async () => {
    await scratch.$executeRawUnsafe(
      `INSERT INTO permissions (name) VALUES ('hr.employee.read'), ('admin.role.read'), ('payroll.payslip.read')`
    );
    const enforced = ['hr.employee.read', 'admin.role.read', 'payroll.payslip.read'];

    const found = await scratch.$queryRawUnsafe<Array<{ name: string }>>(`select name from permissions`);
    const catalogue = new Set(found.map((r) => r.name));

    expect(enforced.filter((c) => !catalogue.has(c))).toEqual([]);
  }, 30_000);
});
