# Running the test suite against a disposable database

The default `phpunit.xml` points `DB_DATABASE` at `niss_hrms_test`, and every
Feature test uses `RefreshDatabase` (which runs `migrate:fresh`). On this machine
the same PostgreSQL server also holds the live/LAN `niss_hrms` database, and
`niss_hrms_test` is protected — so **never run the default suite here**. Two
incidents in 2026-08 came from a suite pointed at real data.

`phpunit.disposable.xml` + `tests/bootstrap_safe.php` provide a safe path: the
bootstrap forces `DB_DATABASE` to a validated, clearly-disposable name and
**fails closed** if the name is not disposable (must contain `ci_test` or end
`_scratch`, and never `niss_hrms` / `niss_hrms_test`). The name also contains
`test`, so `ProductionSafetyServiceProvider` still permits `migrate:fresh` on it.

## Local use

```bash
# 1. Create a throwaway database (once).
createdb niss_hrms_ci_test_scratch

# 2. Run the suite against it — never touches niss_hrms or niss_hrms_test.
cd salary-slip-bac
vendor/bin/phpunit -c phpunit.disposable.xml
#   or a subset:
vendor/bin/phpunit -c phpunit.disposable.xml --filter CandidateResumeAuthTest

# 3. Drop it when done.
dropdb niss_hrms_ci_test_scratch
```

## CI use

Give each run its own database and export the name; the bootstrap validates it:

```bash
export CI_TEST_DB="niss_hrms_ci_test_${GITHUB_RUN_ID:-local}"
createdb "$CI_TEST_DB"
vendor/bin/phpunit -c phpunit.disposable.xml
dropdb "$CI_TEST_DB"
```

Host / port / credentials still come from `.env` (or the CI DB service). Mail is
`array`, queue is `sync`, cache/session are `array`, so no external side effects.

## Recommended follow-up (not done — would edit shared config)

To protect the **default** `phpunit.xml` path too, point its `bootstrap` at
`tests/bootstrap_safe.php` and drop its hardcoded `DB_DATABASE=niss_hrms_test`
line. That is a one-line change to a shared file; apply it when no other session
is editing test configuration, and update `.github/workflows/ci.yml` to export
`CI_TEST_DB` for the `laravel` job.
