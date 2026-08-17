<?php

require __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\CandidateAccount;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;

echo "==================================================\n";
echo "CAREER PORTAL AUTHENTICATION BENCHMARK DIAGNOSTICS\n";
echo "==================================================\n\n";

// 1. Ensure test candidate exists
$email = "loadtest_candidate@niss.pro";
$password = "SecretPassword123!";
$account = CandidateAccount::where('email', $email)->first();

if (!$account) {
    $account = CandidateAccount::create([
        'name' => 'Load Test Candidate',
        'email' => $email,
        'password' => Hash::make($password),
        'email_verified_at' => now(),
    ]);
    echo "[+] Created test candidate account ID: {$account->id}\n";
} else {
    echo "[+] Found existing test candidate account ID: {$account->id}\n";
}

// 2. EXPLAIN Query for Candidate Lookup
echo "\n--- EXPLAIN DB QUERY FOR CANDIDATE LOOKUP ---\n";
try {
    $rawExplain = DB::select("EXPLAIN ANALYZE SELECT * FROM candidate_accounts WHERE email = ?", [$email]);
    foreach ($rawExplain as $row) {
        $line = json_encode($row);
        echo "  $line\n";
    }
} catch (\Throwable $e) {
    echo "  Explain query error: " . $e->getMessage() . "\n";
}

// 3. Benchmark Database Lookup Only (1,000 iterations)
$iterations = 1000;
$startTime = microtime(true);
for ($i = 0; $i < $iterations; $i++) {
    CandidateAccount::where('email', $email)->first();
}
$dbDuration = (microtime(true) - $startTime) * 1000;
$dbAvg = $dbDuration / $iterations;
echo "\n--- BENCHMARK 1: DB Lookup Only ($iterations iterations) ---\n";
echo sprintf("Total Time: %.2f ms | Avg per lookup: %.4f ms | Lookups/sec: %.2f\n", $dbDuration, $dbAvg, ($iterations / ($dbDuration / 1000)));

// 4. Benchmark Bcrypt Hash Verification Only (50 iterations due to heavy CPU)
$bcryptIterations = 50;
$hashedPassword = $account->password;
$startTime = microtime(true);
for ($i = 0; $i < $bcryptIterations; $i++) {
    Hash::check($password, $hashedPassword);
}
$bcryptDuration = (microtime(true) - $startTime) * 1000;
$bcryptAvg = $bcryptDuration / $bcryptIterations;
echo "\n--- BENCHMARK 2: Bcrypt Password Verification Only ($bcryptIterations iterations) ---\n";
echo sprintf("Total Time: %.2f ms | Avg per bcrypt verification: %.2f ms | Verifications/sec per core: %.2f\n", $bcryptDuration, $bcryptAvg, ($bcryptIterations / ($bcryptDuration / 1000)));

// 5. Benchmark Sanctum Token Creation (50 iterations)
$sanctumIterations = 50;
$startTime = microtime(true);
for ($i = 0; $i < $sanctumIterations; $i++) {
    $token = $account->createToken('candidate_auth')->plainTextToken;
}
$sanctumDuration = (microtime(true) - $startTime) * 1000;
$sanctumAvg = $sanctumDuration / $sanctumIterations;
echo "\n--- BENCHMARK 3: Sanctum Token Creation ($sanctumIterations iterations) ---\n";
echo sprintf("Total Time: %.2f ms | Avg per token creation: %.2f ms | Tokens/sec: %.2f\n", $sanctumDuration, $sanctumAvg, ($sanctumIterations / ($sanctumDuration / 1000)));

// Clean up test tokens
DB::table('personal_access_tokens')->where('tokenable_id', $account->id)->where('tokenable_type', CandidateAccount::class)->delete();
echo "\n[+] Cleaned up test Sanctum tokens.\n";
