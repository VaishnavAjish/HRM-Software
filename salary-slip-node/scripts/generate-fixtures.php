<?php

/**
 * Produce cross-language test vectors from the real PHP implementations.
 *
 * The Node compatibility layer is asserted against this file's output, so the
 * proof of interoperability is "PHP wrote it, Node read it" rather than "both
 * agree with my reading of the docs".
 *
 * Every secret here is a FIXED TEST VALUE. Nothing derived from the real
 * APP_KEY, JWT_SECRET or AADHAAR_REFERENCE_SECRET is written to disk — those
 * are exercised separately by scripts/parity-check.ts, which prints only
 * PASS/FAIL.
 *
 * Run from the repo root:  php salary-slip-node/scripts/generate-fixtures.php
 */

$laravel = __DIR__ . '/../../salary-slip-bac';
require $laravel . '/vendor/autoload.php';

// ---- fixed test secrets ---------------------------------------------------

$appKeyRaw = str_repeat("\x01\x02\x03\x04\x05\x06\x07\x08", 4); // 32 bytes
$appKey = 'base64:' . base64_encode($appKeyRaw);
$aadhaarSecret = 'test-aadhaar-reference-secret-do-not-use-in-production';

// ---- encryption -----------------------------------------------------------

$encrypter = new Illuminate\Encryption\Encrypter($appKeyRaw, 'AES-256-CBC');

$plaintexts = [
    '715115981345',            // a 12-digit Aadhaar, the real use case
    '',                        // empty string
    'a',                       // single byte, exercises PKCS#7 padding
    str_repeat('x', 16),       // exactly one AES block
    str_repeat('y', 17),       // one block + 1
    'ünïcödé ✓ 日本語',         // multi-byte UTF-8
];

$encrypted = [];
foreach ($plaintexts as $p) {
    $encrypted[] = ['plain' => $p, 'payload' => $encrypter->encryptString($p)];
}

// ---- password hashing -----------------------------------------------------

// Laravel's default driver. Node's bcryptjs must verify the $2y$ prefix PHP
// emits; a hash produced by Node must equally verify in PHP.
$passwords = [];
foreach (['secret123', 'p@ssw0rd with spaces', 'ünïcödé-pass'] as $pw) {
    $passwords[] = ['plain' => $pw, 'hash' => password_hash($pw, PASSWORD_BCRYPT, ['cost' => 12])];
}

// ---- Aadhaar secure reference --------------------------------------------

// Booted so the real App\Support\AadhaarReference runs, rather than this file
// re-deriving the formula and both sides agreeing on the same mistake. The
// reference is 'AADHAAR_' + the first 16 hex chars of the HMAC — not the raw
// digest, and deliberately without the last four digits.
$app = require $laravel . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['documents.aadhaar_reference_secret' => $aadhaarSecret]);

$references = [];
foreach (['715115981345', '123456789012', '7151 1598 1345'] as $aadhaar) {
    $references[] = [
        'aadhaar' => $aadhaar,
        'reference' => App\Support\AadhaarReference::secureReference($aadhaar),
        'masked' => App\Support\AadhaarReference::mask($aadhaar),
        'lastFour' => App\Support\AadhaarReference::lastFour($aadhaar),
        'normalised' => App\Support\AadhaarReference::normalise($aadhaar),
    ];
}

// Log redaction has to behave identically or an Aadhaar reaches a log line.
$redactions = [];
foreach ([
    'employee 7151 1598 1345 updated',
    'id=715115981345',
    'hyphenated 7151-1598-1345 here',
    'not an aadhaar: 12345',
] as $text) {
    $redactions[] = ['text' => $text, 'redacted' => App\Support\AadhaarReference::redact($text)];
}

// ---- JWT ------------------------------------------------------------------

$jwtSecret = 'test-jwt-secret-for-fixtures-only';
$issuer = 'http://localhost';
config(['jwt.secret' => $jwtSecret, 'jwt.ttl' => 43200]);

$subject = new App\Models\User;
$subject->setAttribute('id', 4242);
$validToken = Tymon\JWTAuth\Facades\JWTAuth::fromUser($subject);

/** Re-sign an altered claim set. tymon refuses to *issue* an expired token,
 *  so one is built here directly rather than by fighting the factory. */
$resign = static function (array $claims) use ($jwtSecret): string {
    $b64 = static fn ($d) => rtrim(strtr(base64_encode($d), '+/', '-_'), '=');
    $h = $b64(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
    $p = $b64(json_encode($claims));
    $s = $b64(hash_hmac('sha256', "$h.$p", $jwtSecret, true));

    return "$h.$p.$s";
};

$decode = static fn ($t) => json_decode(base64_decode(strtr(explode('.', $t)[1], '-_', '+/')), true);
$base = $decode($validToken);

$expiredClaims = $base;
$expiredClaims['iat'] = time() - 7200;
$expiredClaims['nbf'] = time() - 7200;
$expiredClaims['exp'] = time() - 3600;

$missingClaims = $base;
unset($missingClaims['jti']); // jti is in required_claims

$tokens = [
    'secret' => $jwtSecret,
    'issuer' => $base['iss'],
    'prv' => $base['prv'],
    'valid' => $validToken,
    'claims' => $base,
    'expired' => $resign($expiredClaims),
    'missingRequiredClaim' => $resign($missingClaims),
    'wrongSignature' => substr($validToken, 0, -4) . 'AAAA',
];

// ---- output ---------------------------------------------------------------

$out = [
    '_comment' => 'Generated by scripts/generate-fixtures.php. Test secrets only — never production values.',
    'appKey' => $appKey,
    'aadhaarSecret' => $aadhaarSecret,
    'encrypted' => $encrypted,
    'passwords' => $passwords,
    'aadhaarReferences' => $references,
    'aadhaarRedactions' => $redactions,
    'jwt' => $tokens,
];

$target = __DIR__ . '/../tests/fixtures/laravel-vectors.json';
@mkdir(dirname($target), 0777, true);
file_put_contents($target, json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");

printf("wrote %s\n", realpath($target) ?: $target);
printf("  encrypted vectors : %d\n", count($encrypted));
printf("  password vectors  : %d\n", count($passwords));
printf("  reference vectors : %d\n", count($references));
