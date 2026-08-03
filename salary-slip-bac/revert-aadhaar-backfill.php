<?php
/**
 * Undo the Aadhaar backfill.
 *
 *   cd "f:\HRMS oldd\salary-slip-bac"
 *   php artisan tinker revert-aadhaar-backfill.php
 *
 * Clears the three derived columns and nothing else. `aadhar_card_no` was never
 * modified by the backfill, so this restores the exact pre-backfill state — no
 * Aadhaar number is lost. The backfill is re-runnable afterwards.
 */

use Illuminate\Support\Facades\DB;

echo "database: " . DB::connection()->getDatabaseName() . "\n\n";

echo "=== BEFORE ===\n";
$b = DB::selectOne("select
    count(*) total,
    count(aadhar_card_no) plaintext,
    count(encrypted_aadhaar_number) encrypted,
    count(aadhaar_last_four) last_four,
    count(aadhaar_secure_reference) secure_ref
  from users");
foreach ((array) $b as $k => $v) { echo '  ' . str_pad($k, 12) . $v . "\n"; }

// Only the three derived columns. aadhaar_verification_status is NOT NULL, so
// it is left as the backfill set it — it carries no Aadhaar data, only a status
// word, and clearing it is what made the first attempt fail. Scoped to rows the
// backfill actually touched rather than the whole table.
$n = DB::table('users')
    ->whereNotNull('encrypted_aadhaar_number')
    ->update([
        'encrypted_aadhaar_number' => null,
        'aadhaar_last_four'        => null,
        'aadhaar_secure_reference' => null,
    ]);

echo "\n=== REVERTED $n rows ===\n";

echo "\n=== AFTER (expect encrypted/last_four/secure_ref = 0, plaintext unchanged) ===\n";
$a = DB::selectOne("select
    count(*) total,
    count(aadhar_card_no) plaintext,
    count(encrypted_aadhaar_number) encrypted,
    count(aadhaar_last_four) last_four,
    count(aadhaar_secure_reference) secure_ref
  from users");
foreach ((array) $a as $k => $v) { echo '  ' . str_pad($k, 12) . $v . "\n"; }

if ($a->plaintext !== $b->plaintext) {
    echo "\nWARNING: plaintext count changed. It should not have.\n";
}
