-- =====================================================================
-- Repair: `_authz_migrations` is claiming two migrations that are gone
--
-- State as found (2026-08-03, after the rollback of 0001):
--
--   _authz_migrations  : 0003, 0004        <- claimed applied
--   0001, 0002 rows    : removed by their own rollback
--   authorization_*    : 0 tables (were 15)
--   permissions.code   : gone, along with resource/action/is_sensitive/is_active
--   roles.code         : gone, along with the other twelve 0001 columns
--   permissions.level  : STILL PRESENT — the one column 0003 added that
--                        0001's down() did not know to remove
--
-- 0003 and 0004 were applied on top of 0001. Rolling back 0001 without
-- first rolling back 0003/0004 took their objects with it but left their
-- ledger rows behind, so the runner's view of the world is now wrong in
-- the most dangerous direction: it believes work is done that is not.
--
-- Concretely, `npx tsx scripts/authz-migrate.ts up` would today:
--   * re-apply 0001 and 0002   (they are no longer recorded)
--   * SKIP 0003 and 0004       (they still are)
--
-- which rebuilds the eleven tables and lands exactly back in the state
-- the audit opened with: eighteen columns missing, the PHP controllers
-- raising 42703, and the decision log silently discarding every record.
--
-- This script removes the two false rows. It touches no schema and no
-- business data. After it runs, the ledger honestly reports nothing
-- applied, and `up` will replay 0001 -> 0004 in order.
--
-- Business data was NOT affected by the rollback: users 339,
-- salary_slips 334, documents 38, and the legacy RBAC tables are back to
-- exactly their pre-0001 counts (roles 15, permissions 96,
-- role_permissions 30, user_roles 5 — matching the _pre_authz_*
-- snapshots row for row). All fifteen authorization_* tables were empty
-- when they were dropped.
-- =====================================================================

BEGIN;

-- Guard: refuse if the tables are actually present, which would mean the
-- ledger is right and this script is being run against the wrong state.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_name = 'authorization_feature_flags') THEN
    RAISE EXCEPTION
      'authorization_feature_flags exists — the ledger may be correct. Do not run this.';
  END IF;
END $$;

DELETE FROM _authz_migrations WHERE id IN ('0003', '0004');

COMMIT;


-- =====================================================================
-- OPTIONAL, and only if you intend to stay reverted
-- =====================================================================
--
-- `permissions.level` survives as an orphan: a NOT NULL DEFAULT 'ACTION'
-- column on 96 rows, from a migration whose other seventeen columns are
-- gone. It is harmless — nothing reads it while the platform is off, and
-- App\Models\Permission lists it in $fillable so a write would still
-- succeed. Drop it only if you want the schema to match the pre-0001
-- state exactly:
--
--   ALTER TABLE permissions DROP COLUMN IF EXISTS level;
--
-- Do NOT drop it if you intend to roll forward again — 0003 adds it back
-- with IF NOT EXISTS either way, so leaving it costs nothing.
--
-- =====================================================================
-- ROLLBACK of this script
-- =====================================================================
--
--   INSERT INTO _authz_migrations (id, applied_by) VALUES
--     ('0003', 'restored'), ('0004', 'restored');
--
-- Restoring these rows re-creates the inconsistency deliberately. There
-- is no reason to do it except to undo a mistake in running this file.
-- =====================================================================
