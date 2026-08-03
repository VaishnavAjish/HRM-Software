<?php

/**
 * Capture what UserController's private import helpers actually do.
 *
 * sanitizeRowData() and parseImportDate() are private, so they are reached by
 * reflection rather than reimplemented here — the point is to record the real
 * behaviour, not a second reading of it.
 *
 *   php salary-slip-node/scripts/generate-import-vectors.php
 */

$laravel = __DIR__ . '/../../salary-slip-bac';
require $laravel . '/vendor/autoload.php';
$app = require $laravel . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$controller = new App\Http\Controllers\UserController;
$reflection = new ReflectionClass($controller);

$sanitize = $reflection->getMethod('sanitizeRowData');
$sanitize->setAccessible(true);
$parseDate = $reflection->getMethod('parseImportDate');
$parseDate->setAccessible(true);

// ---- sanitizeRowData ------------------------------------------------------

$rows = [
    ['emp_code' => '1138.0'],
    ['emp_code' => 'S001'],
    ['emp_code' => '  EMP-77  '],
    ['mobile_number' => '9876543210.0'],
    ['mobile_number' => '+91 98765-43210'],
    ['email' => '  Ravi@Example.COM '],
    ['email' => '0'],
    ['email' => '0.0'],
    ['email' => 'not-an-email'],
    ['aadhar_card_no' => '7151 1598 1345'],
    ['aadhar_card_no' => '715115981345.0'],
    ['pan_card_no' => ' abcde 1234e '],
    ['bank_account_no' => '00112233445566.0'],
    ['bank_ifsc_code' => 'sbin 000 1234'],
    ['gender' => 'm'],
    ['gender' => 'MALE'],
    ['gender' => 'f'],
    ['gender' => 'other'],
    ['gender' => '  '],
    ['company_code' => 'silver'],
    ['company_code' => 'SilverStar'],
    ['company_code' => 'Silver Star'],
    ['company_code' => 'nidhi'],
    ['company_code' => 'Nidhi Impex Pvt Ltd'],
    ['company_code' => 'Acme Ltd'],
    ['unit' => 'daduk'],
    ['unit' => 'DHADUK'],
    ['unit' => 'shreeji building'],
    ['unit' => 'ichhapore'],
    ['unit' => 'Somewhere'],
    ['unit' => 'Ichapur'],
    ['company_code' => 'nidhi', 'unit' => 'Daduk'],
    ['emp_code' => null, 'mobile_number' => null],
    ['emp_code' => '1138'],
    [],
];

$sanitized = [];
foreach ($rows as $row) {
    $sanitized[] = ['in' => $row, 'out' => $sanitize->invoke($controller, $row)];
}

// ---- parseImportDate ------------------------------------------------------

$dates = [
    44197, 5000, 10001, 59999,
    '09-03-1985', '09/03/1985', '9-3-1985', '1985-03-09', '1985/03/09',
    '00-01-1900', '01-01-1900', '00-00-0000',
    'not a date', '', '   ', null, 0, '31-02-2020',
];

$parsed = [];
foreach ($dates as $value) {
    $parsed[] = ['in' => $value, 'out' => $parseDate->invoke($controller, $value)];
}

$target = __DIR__ . '/../tests/fixtures/import-vectors.json';
@mkdir(dirname($target), 0777, true);
file_put_contents(
    $target,
    json_encode(
        ['_comment' => 'Captured from UserController via reflection.', 'sanitize' => $sanitized, 'dates' => $parsed],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    ) . "\n"
);

printf("wrote %s\n  sanitize vectors: %d\n  date vectors    : %d\n", realpath($target) ?: $target, count($sanitized), count($parsed));
