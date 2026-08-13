<?php

/**
 * Safe bootstrap for the disposable-database test config (phpunit.disposable.xml).
 *
 * It is the single source of truth for the test database name: it forces
 * DB_DATABASE to a validated, clearly-disposable value BEFORE Laravel's dotenv
 * loads (dotenv will not override an already-set variable), and fails closed if
 * the name is not disposable. This is why the 2026-08 incidents happened — a
 * suite pointed at niss_hrms / niss_hrms_test and RefreshDatabase wiped real
 * data. The name must contain a scratch marker AND the substring "test" (so
 * ProductionSafetyServiceProvider still permits migrate:fresh for this DB).
 */

require __DIR__ . '/../vendor/autoload.php';

$dbName = getenv('CI_TEST_DB') ?: 'niss_hrms_ci_test_scratch';
$name = strtolower(trim((string) $dbName));

$protected = ['niss_hrms', 'niss_hrms_test', 'production', 'live', 'postgres', ''];
$disposable = str_contains($name, 'ci_test') || str_ends_with($name, '_scratch');

if (in_array($name, $protected, true) || ! $disposable) {
    fwrite(STDERR, PHP_EOL
        . '  [TEST DB SAFETY] Refusing to run.' . PHP_EOL
        . "  DB '{$dbName}' is not a disposable test database." . PHP_EOL
        . '  Set CI_TEST_DB to a name containing "ci_test" or ending "_scratch"' . PHP_EOL
        . '  (and never niss_hrms / niss_hrms_test).' . PHP_EOL . PHP_EOL);
    exit(1);
}

putenv("DB_DATABASE={$dbName}");
$_ENV['DB_DATABASE'] = $dbName;
$_SERVER['DB_DATABASE'] = $dbName;
