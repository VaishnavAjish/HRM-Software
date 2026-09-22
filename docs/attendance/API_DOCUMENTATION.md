# Attendance Engine — API Documentation

Base path: `/api/v1/attendance/...` (distinct from the legacy `/api/attendance/...`
and `/api/shifts/...` routes, which are untouched and keep working). Route file:
`salary-slip-bac/routes/attendance_engine.php`.

All routes require:
- `jwt.auth` middleware (a valid bearer token)
- `role:admin`
- a specific `permission:attendance.*` code (listed per-route below), seeded by
  `2026_09_22_000010_seed_attendance_engine_permissions.php` and granted only to
  roles that already held the equivalent legacy `hr.attendance.*` / `hr.shift.*`
  permission — not a blanket grant to every admin-role.

## Response envelope

Every endpoint responds through `Concerns/RespondsWithEnvelope`:

```json
// success
{ "success": true, "data": { ... } }

// 404 (RespondsWithEnvelope::missing)
{ "success": false, "error": { "message": "..." } }
```

Laravel's default validation-error shape (`422`, `{"message": "...", "errors": {...}}`)
applies wherever a route calls `$request->validate()`.

---

## Daily / monthly / profile / detail reads

These four endpoints read **only** from `attendance_daily` (the calculated
layer) — they never compute on the fly. A day has no row until
`POST /recalculate` (or a future scheduled job) has produced one for it.

### `GET /v1/attendance/daily`
Permission: `attendance.daily.read`. Data source for the redesigned daily table.

| Param | Required | Notes |
|---|---|---|
| `date` | yes | `Y-m-d` |
| `company_code` | no | exact match |
| `unit` | no | exact match |
| `department` | no | exact match |
| `status` | no | comma list of `primary_status` values, e.g. `PRESENT,LATE` |
| `search` | no | matches employee name or `emp_code`, max 190 chars |
| `per_page` | no | 1–200, default 25 |

Returns a paginated list of `AttendanceDaily` rows with `user` (id, name,
emp_code, department, unit, company_code) and `shift` (id, name, shift_code)
eager-loaded.

### `GET /v1/attendance/monthly`
Permission: `attendance.daily.read`. One row per employee, days spread across
the month, for the monthly grid view (spec §34).

| Param | Required | Notes |
|---|---|---|
| `month` | yes | 1–12 |
| `year` | yes | ≥2000 |
| `company_code` / `unit` / `department` | no | exact match filters |

Returns `{ month, year, employees: [{ user, days: { "1": {...}, "2": {...}, ... }, totals: {...} }] }`.
`days` is keyed by day-of-month (`"j"` format, no leading zero). `totals`
includes `present`, `absent`, `half_day`, `leave`, `weekly_off`, `holiday`,
`late`, `early_exit`, `overtime_minutes`, `worked_minutes`.

### `GET /v1/attendance/employee/{id}`
Permission: `attendance.daily.read`. Employee attendance profile (spec §35).

| Param | Required | Notes |
|---|---|---|
| `from` | no | default: 30 days ago |
| `to` | no | default: today |

Returns `{ user, days: [AttendanceDaily, ...] }`. 404 via the envelope if the
employee id doesn't exist.

### `GET /v1/attendance/{id}/details`
Permission: `attendance.daily.read`. Backs the detail drawer (spec §30–§31).
`{id}` is an `attendance_daily.id`, not a user id.

Returns `{ attendance: AttendanceDaily (with user, shift, leaveRequest,
regularization.requestedBy, regularization.approvedBy), punch_timeline: [AttendancePunch, ...] }`.
The punch timeline includes punches on the attendance date **and** the next
calendar date, to capture overnight-shift tail punches.

---

## Raw punches

### `GET /v1/attendance/punches`
Permission: `attendance.punch.read`. Spec §27's dedicated Raw Punches page.
**Read-only** — there is deliberately no delete endpoint; raw biometric
history is never removable from the UI (spec §27, §66).

| Param | Notes |
|---|---|
| `company_code`, `unit` | exact match |
| `employee_id` | numeric user id |
| `emp_code` | matches `emp_code_raw` (the device's own code, pre-mapping) |
| `device_id` | numeric |
| `status` | comma list: `VALID,DUPLICATE,UNMAPPED,INVALID` |
| `date_from`, `date_to` | filters on `punch_date` |
| `per_page` | 1–500, default 100 |

Ordered newest-first (`punch_datetime desc`).

---

## Recalculation

### `POST /v1/attendance/recalculate`
Permission: `attendance.recalculate`. Throttle: `10` requests/minute.
Spec §59. Always scoped and always a bounded date range — never an unscoped,
unbounded recompute (spec §42, §60).

Body — provide either `date` alone, or `date_from`+`date_to`:

| Field | Required | Notes |
|---|---|---|
| `company_code`, `unit`, `department` | no | narrows scope; omit all three + `employee_id` to mean "everyone" |
| `employee_id` | no | single-employee recalc |
| `date` | required if no `date_from`/`date_to` | |
| `date_from`, `date_to` | required together | `date_to >= date_from` |
| `async` | no | boolean; overrides the automatic sync/queue choice below either way |

`422 RANGE_TOO_LARGE` if the range exceeds 92 days — split into smaller
requests.

**Sync vs. queued (spec §60):** a request spanning ≤3 days for a single
`employee_id` runs **synchronously** — the response's `data.result` carries
the fresh numbers immediately. Anything broader (a wider date range, or no
single-employee scope) is **dispatched onto the queue**
(`RecalculateAttendanceJob`, `QUEUE_CONNECTION=database`) and the endpoint
returns `202` with `data.mode: "queued"` and `data.job` (an
`attendance_recalculation_jobs` row) — poll it via the endpoints below. This
needs a running `php artisan queue:work` worker on the server; without one,
queued jobs simply wait in the `jobs` table rather than silently running
inline.

Response (`200`, sync): `{ mode: "sync", job, result: {processed, days, employees} }`.
Response (`202`, queued): `{ mode: "queued", job, message }`.

### `GET /v1/attendance/recalculation-jobs`
Permission: `attendance.daily.read`. Recent recalculation runs, sync and
queued alike.

| Param | Notes |
|---|---|
| `status` | `RUNNING\|SUCCESS\|FAILED` |
| `per_page` | 1–100, default 25 |

### `GET /v1/attendance/recalculation-jobs/{id}`
Permission: `attendance.daily.read`. Poll a single run (typically a queued
one) until `status` leaves `RUNNING`.

---

## Rule Simulator

### `POST /v1/attendance/simulate`
Permission: `attendance.rule.read`. Throttle: `30`/minute. Spec §33 — explicitly
called out in the spec as "critical for testing rules before production."

Runs the **exact same** `AttendanceRuleResolver` + `AttendanceStatusEngine`
that production uses, against hypothetical punch times. Never writes to
`attendance_punches` or `attendance_daily`.

Body:

| Field | Required | Notes |
|---|---|---|
| `employee_id` | yes | must exist |
| `date` | yes | |
| `punches` | yes | array of `"H:i"` strings, e.g. `["09:12","13:00","13:45","18:05"]`; may be empty |
| `is_holiday_override` | no | force holiday=true/false for the dry run |
| `is_weekly_off_override` | no | force weekly-off=true/false; defaults to the resolved shift's `weekly_off_days` |

Returns `{ employee, date, shift, rule_breakdown: { values, sources }, result }`
— `result` is the same shape `AttendanceStatusEngine::compute()` produces for
a real day (status, flags, worked_minutes, late/early/OT minutes, etc.).
`rule_breakdown.sources` shows exactly which scope (employee/department/
branch/company/global/default) each resolved field came from — the
explainability the spec asks for.

---

## Rule management

Rules are **versioned, never mutated in place** once past `effective_from`
(spec §45) — there is deliberately no `PUT`/`PATCH`; a change is always a new
row with its own `effective_from`.

### `GET /v1/attendance/rules`
Permission: `attendance.rule.read`.

| Param | Notes |
|---|---|
| `scope_type` | `global\|company\|branch\|department\|employee` |
| `company_code` | exact match |
| `include_inactive` | boolean; default false (retired rules hidden) |
| `per_page` | 1–200, default 50 |

Ordered `effective_from desc, id desc`. Eager-loads `shift` (id, name) and
`employee` (id, name, emp_code).

### `POST /v1/attendance/rules`
Permission: `attendance.rule.create`. Throttle: `20`/minute.

| Field | Required | Notes |
|---|---|---|
| `scope_type` | yes | one of `AttendanceRule::SCOPE_PRECEDENCE` |
| `company_code` | required unless `scope_type=global` | |
| `unit` | required if `scope_type=branch` | |
| `department` | required if `scope_type=department` | |
| `employee_user_id` | required if `scope_type=employee` | must exist in `users` |
| `shift_id` | no | must exist in `shifts` |
| `name` | no | display label |
| `grace_in_minutes`, `grace_out_minutes` | no | 0–600 |
| `late_threshold_minutes`, `early_exit_threshold_minutes`, `half_day_threshold_minutes`, `minimum_work_minutes`, `full_day_minutes`, `overtime_after_minutes` | no | ≥0 |
| `overtime_enabled`, `biometric_required`, `manual_attendance_allowed`, `attendance_exempt` | no | boolean |
| `break_policy` | no | `first_last\|multi_punch` |
| `weekly_off_days` | no | array of ints 0–6 |
| `effective_from` | yes | date |
| `effective_to` | no | date, ≥ `effective_from` |
| `change_reason` | no | free text, max 2000 — recorded to the audit log |

On success: creates the rule, writes an `AttendanceAuditLog` entry
(`RULE_CREATED`), returns `201` with the rule (fresh, with `shift`/`employee`
loaded).

### `DELETE /v1/attendance/rules/{rule}`
Permission: `attendance.rule.update`. **Soft-retire only** — sets
`is_active=false` and `effective_to=today()` (if not already set); the row is
never hard-deleted, and historical `attendance_daily` rows that already froze
this rule into their `applied_rule_snapshot` are unaffected. Writes an
`AttendanceAuditLog` entry (`RULE_RETIRED`) with before/after diff.

---

## Regularizations

### `GET /v1/attendance/regularizations`
Permission: `attendance.regularization.read`.

| Param | Notes |
|---|---|
| `status` | filters `approval_status` |
| `user_id` | numeric |
| `per_page` | 1–100, default 25 |

Eager-loads `user`, `requestedBy`, `approvedBy` (id, name [, emp_code]).

### `POST /v1/attendance/regularizations`
Permission: `attendance.regularization.create`. Throttle: `30`/minute.

| Field | Required | Notes |
|---|---|---|
| `user_id` | yes | must exist |
| `date` | yes | |
| `field` | yes | `check_in\|check_out\|status\|both` |
| `new_check_in`, `new_check_out` | no | datetime |
| `new_status` | no | string, max 40 |
| `reason` | yes | min 5, max 2000 chars — mandatory justification, spec §19 |

Delegates to `AttendanceRegularizationService::request()`. Creates a
`PENDING` regularization; raw punches are never touched — only the
recalculation inputs change once approved.

### `POST /v1/attendance/regularizations/{regularization}/decision`
Permission: `attendance.regularization.decide`. Throttle: `30`/minute.

| Field | Required | Notes |
|---|---|---|
| `decision` | yes | `approve\|reject` |
| `remarks` | no | max 2000 |

On approval, `AttendanceRegularizationService::decide()` auto-triggers a
recalculation of that employee/date so `attendance_daily` reflects the
override immediately.

---

## Devices

### `GET /v1/attendance/devices`
Permission: `attendance.device.read`. Optional `company_code` filter.
Returns all `AttendanceDevice` rows ordered by `serial_number` — the eSSL
device registry (28 machines), including `last_sync_at`,
`last_sync_punch_count`, and `status`, which `EsslBiometricService` updates
after every sync run.

### `PUT /v1/attendance/devices/{device}`
Permission: `attendance.device.update`.

| Field | Notes |
|---|---|
| `name`, `location` | string, max 190 |
| `ip_address` | valid IP |
| `company_code` | max 60 |
| `unit` | max 120 |
| `is_active` | boolean |

---

## Sync history

### `GET /v1/attendance/sync-history`
Permission: `attendance.sync_history.read`. Spec §26.

| Param | Notes |
|---|---|
| `status` | `RUNNING\|SUCCESS\|PARTIAL\|FAILED` |
| `device_id` | numeric |
| `from`, `to` | date range on `started_at` |
| `per_page` | 1–200, default 50 |

Ordered `started_at desc`. Eager-loads `device` (id, serial_number, name) and
`triggeredBy` (id, name). Each row carries `fetched_count`, `inserted_count`,
`duplicate_count`, `unmapped_count`, `failed_count`.

**Known limitation**: `EsslBiometricService::fetchDeviceLogs()` currently
cannot distinguish "device unreachable" from "device returned zero punches"
— both currently surface as `fetched_count: 0`. Not fixed in this phase;
flagged here so it isn't mistaken for a working failure-detection path.

---

## Reports (spec §71's "12 report types")

### `GET /v1/attendance/reports/{type}`
Permission: `attendance.report.read`. JSON preview: `{ reportType, columns: {key:label}, rows: [...], meta }`.

`{type}` is one of: `daily`, `monthly_summary`, `late_comers`, `early_leavers`,
`absentees`, `overtime`, `missing_punch`, `regularizations`,
`leave_vs_attendance`, `department_summary`, `employee_register`,
`reconciliation`. `422 INVALID_REPORT_TYPE` for anything else.

Common filters (every type accepts what's relevant to it): `date_from`,
`date_to` (or `date` alone for a single day), `company_code`, `unit`,
`department`, `employee_id` (**required** for `employee_register` — returns
an empty row set without it, by design, rather than dumping every
employee), `status` (for `regularizations`: `pending|approved|rejected`).

All 12 read only from the calculated layer (`attendance_daily`,
`attendance_regularizations`, `attendance_sync_logs`) — never recompute.

### `GET /v1/attendance/reports/{type}/export`
Permission: `attendance.report.read` **and** `attendance.report.export`
(two separate middleware entries — both required). Throttle: `10`/minute.

| Param | Notes |
|---|---|
| `format` | `csv` (default) or `pdf` |
| *(same filters as the preview endpoint)* | |

CSV: `text/csv; charset=UTF-8`, UTF-8 BOM, `CsvSanitizer`-neutralized cells
(formula-injection guard). PDF: one shared `resources/views/attendance/report.blade.php`
table template for all 12 types, A4 landscape, via `barryvdh/laravel-dompdf`.
Filename convention: `attendance-{type}-{Ymd-His}.{csv|pdf}`.

## Dashboard

### `GET /v1/attendance/dashboard`
Permission: `attendance.daily.read`. Aggregate KPIs + chart-ready series for
the given range/scope (`date_from`/`date_to`/`company_code`/`unit`/`department`,
same convention as the reports above).

Returns `{ range, kpis: {totalRecords, activeEmployees, present, absent,
late, earlyExit, overtimeHours, onLeave, missingPunch,
pendingRegularizations}, statusBreakdown: {STATUS: count}, trend: [{date,
present, absent, late}, ...], topLateEmployees: [{user, count}, ...] }`.

## Permission code reference

| Code | Routes |
|---|---|
| `attendance.daily.read` | `GET daily`, `GET monthly`, `GET employee/{id}`, `GET {id}/details` |
| `attendance.punch.read` | `GET punches` |
| `attendance.recalculate` | `POST recalculate` |
| `attendance.rule.read` | `GET rules`, `POST simulate` |
| `attendance.rule.create` | `POST rules` |
| `attendance.rule.update` | `DELETE rules/{rule}` |
| `attendance.regularization.read` | `GET regularizations` |
| `attendance.regularization.create` | `POST regularizations` |
| `attendance.regularization.decide` | `POST regularizations/{id}/decision` |
| `attendance.device.read` | `GET devices` |
| `attendance.device.update` | `PUT devices/{device}` |
| `attendance.sync_history.read` | `GET sync-history` |
| `attendance.report.read` | `GET reports/{type}`, `GET reports/{type}/export`, `GET dashboard` (via `attendance.daily.read`) |
| `attendance.report.export` | `GET reports/{type}/export` (required alongside `.read`) |

`attendance.daily.read` through `attendance.sync_history.read` are seeded by
`2026_09_22_000010_seed_attendance_engine_permissions.php`; `attendance.report.read`/
`.export` are seeded separately by
`2026_09_23_000002_seed_attendance_report_permissions.php` (added after the
first migration was already written — never edited in place, same
versioning discipline as `attendance_rules` itself). Both mirror the same
grant logic: only roles that already held `hr.attendance.read`/
`hr.attendance.update`/`hr.shift.read` — never a blanket grant.
