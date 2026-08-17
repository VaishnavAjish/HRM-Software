<?php

require __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\CandidateAccount;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;

echo "==================================================\n";
echo "SEEDING 10,000 LOAD TEST CANDIDATE ACCOUNTS\n";
echo "==================================================\n";

$targetCount = 10000;
$hashedPassword = Hash::make('SecretPassword123!');
$batchSize = 1000;
$now = now();

$existingCount = DB::table('candidate_accounts')->where('email', 'like', 'loadtest_candidate_%@niss.pro')->count();
echo "[+] Existing load test accounts: $existingCount\n";

if ($existingCount < $targetCount) {
    $toCreate = $targetCount - $existingCount;
    echo "[+] Creating $toCreate candidate accounts...\n";

    $startTime = microtime(true);
    $batch = [];
    for ($i = $existingCount + 1; $i <= $targetCount; $i++) {
        $batch[] = [
            'name' => "LoadTest Candidate $i",
            'email' => "loadtest_candidate_{$i}@niss.pro",
            'password' => $hashedPassword,
            'email_verified_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ];

        if (count($batch) >= $batchSize) {
            DB::table('candidate_accounts')->insert($batch);
            echo "  - Inserted batch up to $i accounts...\n";
            $batch = [];
        }
    }

    if (count($batch) > 0) {
        DB::table('candidate_accounts')->insert($batch);
        echo "  - Inserted final batch up to $targetCount accounts.\n";
    }

    $duration = (microtime(true) - $startTime);
    echo sprintf("[+] Successfully seeded 10,000 candidates in %.2f seconds.\n", $duration);
} else {
    echo "[+] 10,000 candidate accounts already seeded.\n";
}
