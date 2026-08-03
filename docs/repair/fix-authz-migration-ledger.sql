-- =====================================================================
-- Repair: `_authz_migrations` claims two migrations whose objects are gone
--
-- State as found (2026-08-03, after the rollback of 0001):
--
--   _authz_migrations  : 0003, 0004        <- claimed applied
--   0001, 0002 rows    : deleted by the old rollback path
--   authorization_*    : 0 tables (were 15)
--   permissions.code   : gone, with resource/action/is_sensitive/is_active
--   roles.code         : gone, with the other twelve 0001 columns
--   permissions.level  : STILL PRESENT — the one column 0003 added that
--                        0001's down() had no reason to know about
--
-- 0003 and 0004 were applied on top of 0001. Rolling back 0001 without
-- reversing them first took their objects and left their ledger rows, so
-- the runner's view of the world is wrong in the most dangerous
-- direction: it believes work is done that is not.
--
-- Against the OLD runner, `up` would have re-applied 0001 and 0002 and
-- SKIPPED 0003 and 0004 — rebuilding a schema missing eighteen columns
-- the PHP controllers write to. The current runner refuses to apply at
-- all while this inconsistency stands (`authz-migrate.ts doctor` reports
-- both as GHOST), so the trap is now closed. This script is what clears
-- the block.
--
-- ---------------------------------------------------------------------
-- Why this MARKS rather than DELETES
-- ---------------------------------------------------------------------
-- An earlier draft deleted the two rows. That would have repeated the
-- mistake being repaired: deleting ledger rows is precisely why nobody
-- can say who rolled back 0001, or when, or why. The ledger is now
-- append-only, and a rollback records ROLLED_BACK with attribution. This
-- script follows the same rule — the rows stay, marked, with a reason.
--
-- Business data is untouched. Schema is untouched. This changes six
-- columns on two bookkeeping rows.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PRE-CHECK — run first, on its own. Expect two rows, both APPLIED.
-- ---------------------------------------------------------------------
-- SELECT id, status, applied_at, applied_by FROM _authz_migrations ORDER BY id;
--
-- SELECT
--   (SELECT count(*) FROM information_schema.tables
--     WHERE table_schema='public' AND table_name LIKE 'authorization_%')  AS authz_tables,   -- expect 0
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='permissions'
--       AND column_name='code')                                          AS permissions_code, -- expect 0
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='permissions'
--       AND column_name='level')                                         AS orphan_level;     -- expect 1


-- ---------------------------------------------------------------------
-- 2. REPAIR
-- ---------------------------------------------------------------------

BEGIN;

-- Bring the ledger up to the shape the current runner expects. Additive
-- and idempotent; existing rows default to APPLIED, which is what they
-- meant when they were written.
ALTER TABLE _authz_migrations
  ADD COLUMN IF NOT EXISTS status         VARCHAR(20) NOT NULL DEFAULT 'APPLIED',
  ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rolled_back_by VARCHAR(190),
  ADD COLUMN IF NOT EXISTS reason         TEXT,
  ADD COLUMN IF NOT EXISTS host           VARCHAR(190),
  ADD COLUMN IF NOT EXISTS git_commit     VARCHAR(80);

-- Guard: refuse if the tables are actually present, which would mean the
-- ledger is right and this script is aimed at the wrong state.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_name = 'authorization_feature_flags') THEN
    RAISE EXCEPTION
      'authorization_feature_flags exists — the ledger may be correct. Do not run this.';
  END IF;
END $$;

-- Guard: refuse if the rows are not in the state this repairs.
DO $$
DECLARE stale INT;
BEGIN
  SELECT count(*) INTO stale FROM _authz_migrations
   WHERE id IN ('0003', '0004') AND status = 'APPLIED';
  IF stale <> 2 THEN
    RAISE EXCEPTION
      'Expected 0003 and 0004 to be APPLIED, found % such row(s). Re-run the pre-check.', stale;
  END IF;
END $$;

UPDATE _authz_migrations
   SET status         = 'ROLLED_BACK',
       rolled_back_at = now(),
       rolled_back_by = 'ledger-repair',
       reason         = 'Objects removed as collateral of the 0001 rollback on 2026-08-03; '
                        'never independently rolled back. Marked to restore ledger accuracy. '
                        'See docs/INCIDENT-2026-08-03-authz-rollback.md'
 WHERE id IN ('0003', '0004')
   AND status = 'APPLIED';

COMMIT;


-- ---------------------------------------------------------------------
-- 3. POST-CHECK — both rows ROLLED_BACK, and the runner agrees.
-- ---------------------------------------------------------------------
-- SELECT id, status, rolled_back_at, rolled_back_by FROM _authz_migrations ORDER BY id;
--   expect: 0003 ROLLED_BACK, 0004 ROLLED_BACK
--
-- Then, from salary-slip-node:
--   npx tsx scripts/authz-migrate.ts status
--     expect: 0001 PENDING, 0002 PENDING, 0003 ROLLED_BACK, 0004 ROLLED_BACK
--   npx tsx scripts/authz-migrate.ts doctor
--     expect: exactly ONE finding — [ORPHAN] 0003, because permissions.level
--     survives the rollback and is 0003's sentinel. That is accurate, not a
--     failure: the column really is present and the ledger really does not
--     claim it. No GHOST and no DEPENDENCY finding must remain.
--   npx tsx scripts/authz-migrate.ts up --dry-run
--     expect: a [warn] line for the 0003 orphan, then
--     "would apply 0001, 0002, 0003, 0004" — in that order, none skipped.
--     ORPHAN warns rather than blocks because every up.sql is idempotent.


-- ---------------------------------------------------------------------
-- 4. ROLLBACK of this script
-- ---------------------------------------------------------------------
-- UPDATE _authz_migrations
--    SET status = 'APPLIED', rolled_back_at = NULL,
--        rolled_back_by = NULL, reason = NULL
--  WHERE id IN ('0003', '0004');
--
-- This restores the inconsistency deliberately. There is no reason to run
-- it except to undo a mistake in running this file.
--
-- The ALTER TABLE additions are not reversed — dropping them would
-- destroy rollback attribution, which is the thing this whole change
-- exists to preserve. They are additive and harmless if unused.
-- =====================================================================


-- ---------------------------------------------------------------------
-- NOTE on `permissions.level`
-- ---------------------------------------------------------------------
-- It survives as an orphan: NOT NULL DEFAULT 'ACTION' on 96 rows, from a
-- migration whose other seventeen columns are gone. Harmless — nothing
-- reads it while the platform is off, and App\Models\Permission lists it
-- in $fillable so a write still succeeds.
--
-- Leave it. `authz-migrate.ts doctor` uses that column as 0003's sentinel,
-- so dropping it is not cosmetic: it changes what the runner reports. If
-- you are staying reverted and want the pre-0001 schema exactly, drop it
-- AFTER this repair has marked 0003 ROLLED_BACK, never before:
--
--   ALTER TABLE permissions DROP COLUMN IF EXISTS level;
-- =====================================================================
