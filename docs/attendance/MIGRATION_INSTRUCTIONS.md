# Attendance Engine Rebuild — Migration Instructions

Run these on the real server (this sandbox's `php artisan migrate` does not
reach the real Postgres DB — you confirmed you'll run this step yourself).

## 1. Pre-flight

```bash
cd /path/to/salary-slip-bac
git pull                      # or however these files reach the server
php artisan migrate:status    # sanity check — confirms DB connectivity first
```

All 10 new migrations are **additive only**: new tables, or new nullable/
defaulted columns on `shifts`. None of them drop, rename, or alter an
existing column's type. Every migration also guards with
`Schema::hasTable()`/`hasColumn()` where it touches an existing table, so a
second accidental run is a no-op, not an error.

## 2. Run the migrations

They're timestamped so a plain `php artisan migrate` picks them up in the
right order automatically. For clarity, the order is:

1. `2026_09_22_000001_create_attendance_devices_table.php`
   — creates `attendance_devices`, then seeds it idempotently from
   `EsslBiometricService::DEVICE_SERIALS` (all 28 configured machines).
2. `2026_09_22_000002_create_attendance_punches_table.php`
   — creates `attendance_punches` (the raw, append-only ledger). Includes the
   unique index `att_punches_idempotent_unique` on
   `(device_serial, emp_code_raw, punch_datetime)` — this is what makes sync
   re-runs safe.
3. `2026_09_22_000003_add_engine_fields_to_shifts_table.php`
   — adds columns to the **existing** `shifts` table (`shift_code`,
   `grace_out_minutes`, `minimum_work_minutes`, `full_day_minutes`,
   `half_day_minutes`, `overtime_enabled`, `overtime_after_minutes`,
   `break_policy`, `is_overnight`, `overnight_offset_minutes`,
   `weekly_off_days`, `is_active`). All nullable or defaulted — no existing
   shift row needs backfilling, and every existing read of `shifts` keeps
   working unchanged.
4. `2026_09_22_000004_create_attendance_rules_table.php`
   — creates `attendance_rules` (the unified, versioned rule hierarchy).
5. `2026_09_22_000005_create_attendance_employee_code_map_table.php`
   — creates `attendance_employee_code_map` (multi-device biometric code
   mapping). Includes a partial unique index for the `device_id IS NULL`
   case (Postgres/SQLite `CREATE UNIQUE INDEX ... WHERE ...` syntax, same
   pattern already used by `users_company_emp_code_unique`).
6. `2026_09_22_000006_create_attendance_daily_table.php`
   — creates `attendance_daily` (the calculated layer everything reads from).
   Unique on `(user_id, attendance_date)`.
7. `2026_09_22_000007_create_attendance_regularizations_table.php`
   — creates `attendance_regularizations`, then adds the
   `attendance_daily.regularization_id` foreign key (deferred to this step
   because the target table didn't exist yet at step 6).
8. `2026_09_22_000008_create_attendance_audit_logs_table.php`
   — creates `attendance_audit_logs` (generic append-only audit trail).
9. `2026_09_22_000009_create_attendance_sync_logs_table.php`
   — creates `attendance_sync_logs` (per-device, per-run sync history).
10. `2026_09_22_000010_seed_attendance_engine_permissions.php`
    — seeds 12 `attendance.*` permission codes and grants them **only** to
    roles that already hold `hr.attendance.read`, `hr.attendance.update`, or
    `hr.shift.read` — not a blanket grant to every role.
11. `2026_09_23_000001_create_attendance_recalculation_jobs_table.php`
    — creates `attendance_recalculation_jobs` (Phase 5's queue-wiring
    tracking table — one row per recalculation request, sync or queued).
12. `2026_09_23_000002_seed_attendance_report_permissions.php`
    — seeds `attendance.report.read`/`attendance.report.export`, same grant
    logic as step 10.

```bash
php artisan migrate
```

Expect all 12 to run in under a few seconds — none of them touch existing
data rows (steps 1, 10 and 12 insert new reference/permission rows;
everything else is pure schema).

**Queue worker**: recalculation requests broader than a single employee /
3 days are now dispatched onto the `database` queue connection (already
configured in `.env`) rather than running inline. Start a worker so those
actually process:
```bash
php artisan queue:work --queue=default --tries=2
```
Run it under a process supervisor (systemd, Supervisor, pm2, etc.) in
production — without a worker, queued recalculation jobs simply accumulate
in the `jobs` table until one is started; they are never silently dropped,
but they also never silently run.

## 3. Seed example rules (optional but recommended)

Without this, `attendance_rules` starts empty and every employee falls back
to `AttendanceRuleResolver::HARD_DEFAULTS` until you add real rules through
the UI/API. To have some starting data to look at:

```bash
php artisan db:seed --class="Database\Seeders\AttendanceRuleExampleSeeder"
```

This is `firstOrCreate`-based — safe to run more than once, won't duplicate
rows.

## 4. Rollback plan, if needed

Every migration implements `down()` and can be reversed with:

```bash
php artisan migrate:rollback --step=10
```

Rolling back is safe up through step 7→1 (they only drop tables/columns this
work created). **Caution**: rolling back step 3
(`add_engine_fields_to_shifts_table`) after you've started creating shifts
through the new engine fields will lose that data — check for non-null
values in those columns before rolling that one back specifically.

## 5. Post-migration smoke test

```bash
php artisan route:list --path=v1/attendance
```
Should list all 21 new routes. Then confirm the legacy routes are still
present and unaffected:
```bash
php artisan route:list --path=attendance
php artisan route:list --path=shifts
```

Finally, populate the calculated layer for a recent range so the new
frontend page (`/admin/attendance/control-center`) has something to show —
it only reads `attendance_daily`, which starts empty:

```bash
curl -X POST https://<host>/api/v1/attendance/recalculate \
  -H "Authorization: Bearer <admin token>" \
  -H "Content-Type: application/json" \
  -d '{"date_from":"2026-09-01","date_to":"2026-09-22"}'
```
(Bounded to ≤92 days per call — split a longer backfill into multiple
requests.)

## 6. What is deliberately NOT part of this migration set

- No changes to any existing table's existing columns' types or existing
  data.
- No changes to the legacy `attendance` table, `AttendanceController.php`,
  or `AttendanceView.jsx` — they are completely untouched and keep working
  exactly as before, side-by-side with the new engine.
- No destructive `truncate`/`drop` of anything pre-existing.

If anything in `php artisan migrate` errors on the real server, stop and
send the exact error back — don't force through it. Given the additive
design, the most likely real-world friction point is step 5's partial unique
index if Postgres syntax differs subtly from what was verified against
SQLite; that's the one line worth double-checking in the migration file
before running if you want to eyeball it first.
