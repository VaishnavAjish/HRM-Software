<?php
/**
 * One-shot runner for docs/repair/fix-authz-migration-ledger.sql.
 *
 * Same SQL as that file's section 2, verbatim, with the pre-check and
 * post-check printed either side so the whole run is one auditable transcript.
 * Exists because psql is not on PATH on this machine while PHP is.
 *
 *   cd "f:\HRMS oldd\salary-slip-bac"
 *   php artisan tinker repair-ledger.php
 *
 * Safe to delete afterwards. It changes six columns on two bookkeeping rows and
 * touches no business data and no schema.
 */

use Illuminate\Support\Facades\DB;

echo "database: " . DB::connection()->getDatabaseName() . "\n\n";

echo "=== PRE-CHECK ===\n";
foreach (DB::select("select * from _authz_migrations order by id") as $r) {
    echo '  ' . json_encode($r) . "\n";
}

$pre = DB::selectOne("select
    (select count(*) from information_schema.tables
      where table_schema='public' and table_name like 'authorization_%') authz_tables,
    (select count(*) from information_schema.columns
      where table_schema='public' and table_name='permissions' and column_name='code') permissions_code,
    (select count(*) from information_schema.columns
      where table_schema='public' and table_name='permissions' and column_name='level') orphan_level");

echo '  authz_tables     = ' . $pre->authz_tables     . "  (expect 0)\n";
echo '  permissions_code = ' . $pre->permissions_code . "  (expect 0)\n";
echo '  orphan_level     = ' . $pre->orphan_level     . "  (expect 1)\n";

if ($pre->authz_tables != 0 || $pre->permissions_code != 0 || $pre->orphan_level != 1) {
    echo "\nABORT: production is not in the state this repair was written for.\n";
    echo "Nothing was written. Send this output back before doing anything else.\n";
    return;
}

echo "\n=== REPAIR ===\n";

try {
    DB::unprepared(<<<'SQL'
BEGIN;

ALTER TABLE _authz_migrations
  ADD COLUMN IF NOT EXISTS status         VARCHAR(20) NOT NULL DEFAULT 'APPLIED',
  ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rolled_back_by VARCHAR(190),
  ADD COLUMN IF NOT EXISTS reason         TEXT,
  ADD COLUMN IF NOT EXISTS host           VARCHAR(190),
  ADD COLUMN IF NOT EXISTS git_commit     VARCHAR(80);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_name = 'authorization_feature_flags') THEN
    RAISE EXCEPTION
      'authorization_feature_flags exists — the ledger may be correct. Do not run this.';
  END IF;
END $$;

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
SQL);

    echo "  committed\n";
} catch (\Throwable $e) {
    echo "  FAILED, rolled back: " . $e->getMessage() . "\n";
    echo "  Nothing was changed. Send this output back.\n";
    return;
}

echo "\n=== POST-CHECK (expect both ROLLED_BACK) ===\n";
foreach (DB::select("select id, status, rolled_back_at, rolled_back_by
                       from _authz_migrations order by id") as $r) {
    echo '  ' . json_encode($r) . "\n";
}
