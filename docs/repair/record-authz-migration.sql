-- =====================================================================
-- Repair: record 2026_08_03_000001_create_enterprise_authorization_platform
--
-- RUN THIS ONLY AFTER prisma/sql/0003 AND 0004 HAVE BEEN APPLIED.
--
-- Why it is needed
-- ----------------
-- The eleven authorization_* tables that migration creates already exist
-- in production. They were built by salary-slip-node/prisma/sql/0001,
-- which is tracked in `_authz_migrations`, not in Laravel's `migrations`.
-- Laravel therefore still considers the migration pending.
--
-- `php artisan migrate` runs pending migrations in filename order, and
-- 2026_08_03_000001 sorts first. Its Schema::create hits an existing
-- table, raises SQLSTATE 42P07, and aborts the run — taking the thirteen
-- HR migrations behind it (job_requisitions, candidates, interviews,
-- offers, assets, performance cycles) with it. Those thirteen tables do
-- not exist, while the HR controllers, routes and React pages that need
-- them are all deployed. Recording this one row is what unblocks them.
--
-- Why only after 0003
-- -------------------
-- Marking a migration applied means it will never run. That is only
-- honest once the database actually holds what the migration would have
-- produced. Before 0003 it does not: eighteen columns the PHP models and
-- controllers reference are missing. 0003 adds exactly those. 0004 seeds
-- the seven feature-flag rows this migration's own up() would have
-- inserted.
--
-- Residual differences after 0003/0004 (deliberate, all benign)
-- ------------------------------------------------------------
--   * Production carries extra columns 0001 added that the PHP migration
--     does not declare (is_temporary, request_type, left_codes, ...).
--     A superset. Nothing in PHP reads them.
--   * Several columns are nullable where the PHP migration declares NOT
--     NULL (actions, resources, business_reason, permission_codes,
--     scope_type, reason_code, duration_ms). Production is the more
--     permissive of the two, so every write PHP makes still succeeds.
--     Tightening them would add risk without adding compatibility.
--   * description/change_summary/reason are VARCHAR(500) where the PHP
--     migration says TEXT. No PHP path writes more than 1000 characters
--     except AuthorizationPolicy.description, which PolicyController
--     validates at max:1000 — see the note below.
--   * Six indexes exist under different names (roles_tenant_status_idx
--     vs roles_tenant_status_index, and similar). Equivalent columns.
--     The names only matter to this migration's down(), which is
--     addressed in the rollback section.
--
-- KNOWN GAP, not fixed here: PolicyController validates description at
-- max:1000 but the column is VARCHAR(500). A 501-1000 character policy
-- description passes validation and then fails at the database. Widening
-- it is a one-line ALTER but it is a behaviour change, not drift repair,
-- so it is left for a deliberate decision.
--
-- Reversibility
-- -------------
-- One DELETE, at the bottom of this file. Removing the row returns
-- Laravel to considering the migration pending — i.e. exactly the state
-- before this script ran.
--
-- After running, `php artisan migrate:status` should show this migration
-- as [Ran] and the thirteen HR migrations as [Pending].
-- =====================================================================

BEGIN;

-- Guard 1: refuse if the parity repair has not been applied. Any one of
-- the eighteen columns proves it; permissions.level is the cheapest.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'permissions' AND column_name = 'level'
  ) THEN
    RAISE EXCEPTION
      'prisma/sql/0003 has not been applied. Run it before recording this migration.';
  END IF;
END $$;

-- Guard 2: refuse if the tables are not actually there, which would mean
-- the migration genuinely does still need to run.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public'
                    AND table_name = 'authorization_role_assignments') THEN
    RAISE EXCEPTION
      'authorization_role_assignments does not exist — do NOT record this migration; run it.';
  END IF;
END $$;

-- The insert itself. A new batch, so `php artisan migrate:rollback` will
-- not sweep it up together with an unrelated deployment.
INSERT INTO migrations (migration, batch)
SELECT '2026_08_03_000001_create_enterprise_authorization_platform',
       (SELECT COALESCE(MAX(batch), 0) + 1 FROM migrations)
 WHERE NOT EXISTS (
   SELECT 1 FROM migrations
    WHERE migration = '2026_08_03_000001_create_enterprise_authorization_platform'
 );

COMMIT;


-- =====================================================================
-- ROLLBACK
-- =====================================================================
--
-- DELETE FROM migrations
--  WHERE migration = '2026_08_03_000001_create_enterprise_authorization_platform';
--
-- Note on `php artisan migrate:rollback`: with the row recorded, a
-- rollback of its batch will invoke the migration's down(), which drops
-- all eleven tables and the added columns. down() also calls
-- dropUnique('roles_code_unique') and dropIndex('roles_tenant_status_index');
-- the second name does not exist in production (it is
-- roles_tenant_status_idx), so the rollback will fail partway, after the
-- eleven tables are already gone. Do not use migrate:rollback on this
-- batch. To undo, use the DELETE above, and if the schema itself must go,
-- use prisma/sql/0003_php_authz_parity.down.sql followed by
-- prisma/sql/0001_authorization_platform.down.sql, which were written
-- against the shape production actually has.
-- =====================================================================
