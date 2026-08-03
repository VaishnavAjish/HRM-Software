<?php
/**
 * Read-only confirmation that the Aadhaar backfill did what it claimed.
 *
 *   cd "f:\HRMS oldd\salary-slip-bac"
 *   php artisan tinker verify-aadhaar.php
 *
 * Writes nothing. Prints counts and shapes only — never an Aadhaar number.
 * Safe to delete afterwards.
 */

use Illuminate\Support\Facades\DB;

echo "database: " . DB::connection()->getDatabaseName() . "\n\n";

echo "=== Coverage ===\n";
$c = DB::selectOne("select
    count(*)                                    total,
    count(aadhar_card_no)                       plaintext,
    count(encrypted_aadhaar_number)             encrypted,
    count(aadhaar_last_four)                    last_four,
    count(aadhaar_secure_reference)             secure_ref
  from users");
foreach ((array) $c as $k => $v) {
    echo '  ' . str_pad($k, 14) . $v . "\n";
}
echo "\n  expect encrypted / last_four / secure_ref = 294\n";

echo "\n=== Anything well-formed still left unencrypted? ===\n";
$missed = DB::selectOne("select count(*) c from users
   where aadhar_card_no ~ '^[0-9]{12}$'
     and encrypted_aadhaar_number is null")->c;
echo "  $missed   (expect 0)\n";

echo "\n=== Ciphertext is not the number ===\n";
$leak = DB::selectOne("select count(*) c from users
   where encrypted_aadhaar_number is not null
     and encrypted_aadhaar_number = aadhar_card_no")->c;
echo "  rows where stored value equals the plaintext: $leak   (expect 0)\n";

echo "\n=== Secure reference shape ===\n";
$bad = DB::selectOne("select count(*) c from users
   where aadhaar_secure_reference is not null
     and aadhaar_secure_reference !~ '^AADHAAR_[0-9a-f]{16}$'")->c;
echo "  malformed references: $bad   (expect 0)\n";

$digits = DB::selectOne("select count(*) c from users
   where aadhaar_secure_reference is not null
     and aadhaar_secure_reference ~ '[0-9]{4}'
     and right(aadhaar_secure_reference, 4) = right(aadhar_card_no, 4)")->c;
echo "  references ending in the real last four: $digits   (expect 0)\n";

echo "\n=== Plaintext column (still populated by design) ===\n";
echo "  " . DB::selectOne("select count(aadhar_card_no) c from users")->c
   . "   retiring this is a separate, later step\n";
