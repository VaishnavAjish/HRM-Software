# Salary Slip Backend (`salary-slip-bac/`)

Last verified against source: 2026-08-03.

## Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | Laravel | 11+ |
| Language | PHP | ^8.2 |
| Database | PostgreSQL (only supported engine) | - |
| Auth | JWT (tymon/jwt-auth) + Laravel Sanctum | 2.3 + 4.3 |
| Excel | Maatwebsite/Laravel Excel | 3.1 |
| Email | Laravel Mail | - |
| File Storage | League Flysystem (local + S3) | 3.x |
| Testing | PHPUnit | 11.x |
| Tooling | Laravel Sail, Pail, Pint | - |

---

## Architecture

Laravel MVC with a service layer for authorization, documents and Aadhaar
handling.

- **Controllers** — 26 files, grouped `Admin/`, `Admin/Hr/`, `Api/V1/`,
  `Api/V1/Authorization/`
- **Models** — 37 Eloquent models
- **Middleware** — 4, aliased in `bootstrap/app.php`
- **Services** — 19 classes under `app/Services/`
- **Migrations** — 56
- **Seeders** — 4
- **Routes** — `routes/api.php`, 413 lines

`bootstrap/app.php` also forces JSON rendering for exceptions on any `api/*`
request, so API errors never return an HTML error page.

---

## Directory Structure

```
salary-slip-bac/
+-- app/
|   +-- Http/
|   |   +-- Controllers/
|   |   |   +-- AuthController.php              (467)
|   |   |   +-- UserController.php              (1976)
|   |   |   +-- SalariesSlipController.php      (111)
|   |   |   +-- SettingsController.php
|   |   |   +-- DocumentController.php          (245, legacy local disk)
|   |   |   +-- Admin/
|   |   |   |   +-- AdminController.php         (643)
|   |   |   |   +-- AttendanceController.php    (246)
|   |   |   |   +-- ShiftController.php         (108)
|   |   |   |   +-- UserRoleController.php
|   |   |   |   +-- PermissionDimensionController.php
|   |   |   |   +-- UploadBatchController.php   (148)
|   |   |   |   +-- Hr/
|   |   |   |       +-- HrDashboardController.php     (139)
|   |   |   |       +-- JobRequisitionController.php  (145)
|   |   |   |       +-- CandidateController.php       (173)
|   |   |   |       +-- InterviewController.php       (165)
|   |   |   |       +-- OfferController.php           (157)
|   |   |   |       +-- AssetController.php           (220)
|   |   |   |       +-- PerformanceController.php     (276)
|   |   |   |       +-- HrReportController.php        (196)
|   |   |   |       +-- Concerns/ScopesCompany.php
|   |   |   +-- Api/
|   |   |       +-- ModuleAvailabilityController.php
|   |   |       +-- V1/
|   |   |           +-- DocumentController.php        (450, S3)
|   |   |           +-- AppointmentController.php     (430)
|   |   |           +-- AadhaarExportController.php   (517)
|   |   |           +-- Authorization/
|   |   |               +-- AuthorizationController.php     (187)
|   |   +-- Middleware/
|   |       +-- JwtMiddleware.php           # jwt.auth
|   |       +-- RoleMiddleware.php          # role:admin,agent,employee
|   |       +-- RequirePermission.php       # permission:<code>
|   |       +-- RequireModuleSchema.php     # module.schema:<module>
|   +-- Services/
|   |   +-- Authorization/
|   |   |   +-- AuthorizationEngine.php     (612)
|   |   |   +-- ConditionEvaluator.php      (144)
|   |   |   +-- ScopeMatcher.php            (84)
|   |   |   +-- SchemaSupport.php           (63)
|   |   |   +-- FieldSecurity.php
|   |   |   +-- AuthorizedUserQuery.php
|   |   |   +-- AuthorizationCache.php
|   |   |   +-- AuthorizationDecision.php
|   |   |   +-- FeatureFlags.php
|   |   |   +-- SeparationOfDuties.php
|   |   +-- Documents/
|   |   |   +-- DocumentService.php         (387)
|   |   |   +-- S3StorageProvider.php       (231)
|   |   |   +-- LocalStorageProvider.php
|   |   |   +-- StorageProvider.php         (interface)
|   |   |   +-- DocumentAuthorizer.php      (139)
|   |   |   +-- FileValidator.php           (132)
|   |   |   +-- DocumentAudit.php
|   |   +-- Aadhaar/AadhaarExportAuthorizer.php
|   |   +-- DocumentStorageService.php
|   +-- Models/                             # 40 models
|   +-- Mail/PortalOtpMail.php
|   +-- Support/                            # AuditLogger, AadhaarExportAccess
|   +-- Console/, Exceptions/, Providers/
+-- routes/api.php                          (413)
+-- database/migrations/                    # 56
+-- database/seeders/                       # 4
+-- config/, storage/, tests/, public/
```

---

## Middleware

| Alias | Class | Purpose |
|-------|-------|---------|
| `jwt.auth` | JwtMiddleware | Validates the bearer token |
| `role` | RoleMiddleware | `role:admin`, `role:admin,agent`, etc. |
| `permission` | RequirePermission | `permission:hr.employee.read` — enterprise permission code |
| `module.schema` | RequireModuleSchema | `module.schema:hr` — refuses the route when the module's tables are absent |

Chain: `Request -> jwt.auth -> role -> permission -> module.schema -> Controller`.

### RequireModuleSchema

Declares the tables a module cannot serve a single route without. `hr` requires
all 13 of: `job_requisitions`, `candidates`, `candidate_stage_history`,
`interviews`, `interview_panelists`, `interview_feedback`, `offers`,
`offer_revisions`, `assets`, `asset_allocations`, `performance_cycles`,
`performance_goals`, `performance_reviews`.

When they are missing the route returns `MODULE_SCHEMA_NOT_READY` rather than a
500. `GET /api/modules` reports readiness per module so the client can omit the
navigation entry entirely. That endpoint probes only for tables, so it answers
correctly regardless of the state of the RBAC tables.

### Role Resolution

| DB `users.role` | Type | Resolved |
|-----------------|------|----------|
| 0 | Super Admin | admin |
| 1 | Admin | admin |
| 2 | Manager | admin |
| 4 or `type='agent'` | Agent | agent |
| 3 / other | Employee | employee |

---

## Authentication

| Endpoint | Description |
|----------|-------------|
| `POST /api/login` | Email + password, returns JWT + user |
| `GET /api/profile` | Authenticated user |
| `POST /api/logout` | Blacklists the presented token |
| `POST /api/change-password` | Verify current, set new |
| `GET /api/check-emp-code/{code}` | Employee-code lookup for the login screen |

`logout` sits **outside** `jwt.auth` deliberately: the middleware rejects an
expired or malformed token with a 401 before the controller runs, so exactly the
requests that most need to end a session could never reach the code that revokes
one. It authenticates nothing, blacklists whatever it can, and always answers
"logged out". Throttled 30/min.

`check-emp-code` is throttled 10/min — it confirms whether an employee code
exists and returns the company and unit behind it, which is an enumeration
oracle over a small sequential code space.

### Multi-Step Onboarding (`POST /api/new{data}`, throttled 15/min)

| Step | Route suffix | Action |
|------|--------------|--------|
| 0 | `new-emp_code` | Verify identity (emp_code + mobile/Aadhaar + DOB); issues a 15-minute `verification_token` |
| 1 | `new-email` | Claim/confirm email, send 4-digit OTP via `PortalOtpMail` |
| 2 | `new-email-otp` | Verify OTP |
| 3 | `new-password` | Set password, clear OTP/token, flip status Pending(2) → Active(0) |

---

## API Endpoints (all under `/api`)

### Public
| Method | Path | Notes |
|--------|------|-------|
| POST | `/login` | |
| POST | `/new{data}` | throttle 15/min |
| GET | `/check-emp-code/{code}` | throttle 10/min |
| POST | `/logout` | throttle 30/min |

### Any authenticated role
| Method | Path |
|--------|------|
| GET | `/profile` |
| POST | `/change-password`, `/profile-update` |
| GET | `/my-permissions` |
| GET | `/department/get` |

### Appointments (`role:admin,agent`)
`POST /appointment`, `GET /appointment`, `GET /appointment/check-emp-code`,
`POST /appointment/update`.

These three were previously unauthenticated. `getAppointment()` scopes from
`auth('api')->user()`, so an anonymous caller matched no role branch and fell
through to an attacker-controlled `company_code` parameter — omitting it, or
passing `company_code=all`, returned every appointment in every company with
full PII.

### Enterprise Authorization (`/api/v1`)
| Method | Path | Permission |
|--------|------|-----------|
| GET | `/v1/authorization/me` | authenticated |
| POST | `/v1/authorization/check` | throttle 120/min |
| POST | `/v1/authorization/check-batch` | throttle 60/min |

These three are decision endpoints, not administration: `me` builds the snapshot
the client stores at login, `check` and `check-batch` answer questions about
specific records.

The management surface — `/v1/permissions`, `/v1/roles` (including the matrix,
clone, assignments and inheritance), `/v1/policies`, `/v1/access-requests`,
and `/v1/authorization/{simulate,flags,audit,analytics,delegations,
emergency-grants}` — was **removed** with the Access Control console that was
its only caller, along with six controllers under
`app/Http/Controllers/Api/V1/Authorization/`.

The engine, its tables and the `permission:` middleware are untouched; there is
simply no HTTP surface for editing roles, policies or grants any more.

### Documents

Legacy, local disk, flat `document_uploads` table — kept only until clients
migrate:
`GET /documents/types`, `POST /documents/preview-name`, `POST /documents`,
`GET /documents`, `DELETE /documents/{id}` (admin).

S3-backed `/v1/documents`, each endpoint enforcing RBAC and record scope
internally:

| Method | Path | Permission | Throttle |
|--------|------|-----------|----------|
| GET | `/v1/documents/types` | `document.file.read` | |
| GET | `/v1/documents/health` | authenticated | |
| GET | `/v1/documents` | `document.file.read` | |
| GET | `/v1/documents/{id}`, `/versions` | `document.file.read` | |
| POST | `/v1/documents/upload` | `document.file.upload` | 30/min |
| POST | `/v1/documents/{id}/replace` | `document.file.update` | 30/min |
| POST | `/v1/documents/{id}/view-url` | `document.file.read` | 60/min |
| POST | `/v1/documents/{id}/download-url` | `document.file.download` | 60/min |
| DELETE | `/v1/documents/{id}` | `document.file.delete` | |
| POST | `/v1/documents/{id}/restore` | `document.file.restore` | |

URL issuance is rate limited because each call mints a presigned credential.

### Appointments v1 (`/api/v1/appointments`)

Save-first: the record is created before any document can be attached, so the
upload step always has a real database id.

| Method | Path | Permission |
|--------|------|-----------|
| POST | `/v1/appointments` | `hr.appointment.create`, throttle 30/min |
| GET | `/v1/appointments/{id}` | `hr.appointment.read` |
| PUT/PATCH | `/v1/appointments/{id}` | `hr.appointment.update` |
| POST | `/v1/appointments/{id}/complete` | `hr.appointment.approve` |
| POST | `/v1/appointments/{id}/aadhaar/reveal` | in-controller gate, throttle 10/min |
| GET/POST | `/v1/appointments/{id}/documents` | throttle 30/min on POST |

### Aadhaar Confidential Export

Registered for both `v1/appointments` and `v1/employees` from one loop, with the
surface passed as a route default (appointments and employees are rows in the
same table).

| Method | Path | Throttle |
|--------|------|----------|
| POST | `/v1/{surface}/{id}/aadhaar/export-authorization` | 10/min |
| POST | `/v1/{surface}/{id}/confidential-pdf` | 10/min |
| POST | `/v1/{surface}/{id}/confidential-print-payload` | 10/min |

Reading a number on screen and putting it on paper are separate decisions with
separate grants and separate audit entries. The PDF is generated and watermarked
server-side so its bytes cannot be altered through the DOM.

### Admin (`role:admin`)

| Group | Endpoints |
|-------|-----------|
| Dashboard | `GET /admin-dashboard` |
| Salary slips | `GET /admin/salary-slip/import-columns`, `POST /admin/salary-slip/store`, `GET /admin/salary-slip/delete` |
| Employees | `GET /employee/get`, `/show/{id}`, `/import-columns`; `POST /employee/store`, `/import`, `/import-account-detail`, `/delete-multiple`; `PUT /employee/edit/{id}`; `GET /employee/delete/{id}` — each gated on `hr.employee.*` |
| Departments | `POST /department/store`, `PUT /department/update/{id}`, `DELETE /department/delete/{id}` — `hr.department.*` |
| Attendance | `GET /attendance/grid` (`hr.attendance.read`), `POST /attendance/cell` (`.update`), `POST /attendance/import` (`.import`) |
| Shifts | `GET /shifts/get`, `POST /shifts/store`, `PUT /shifts/update/{id}`, `DELETE /shifts/delete/{id}`, `POST /shifts/assign` — `hr.shift.*` |
| Modules | `GET /modules` |
| RBAC (survivors) | `GET/PUT /rbac/settings` (admin Dashboard reads the `main_dashboard` group), `GET /rbac/user-roles` (`/admin/admins` lists admin users). The `/roles/*` group and the rest of `/rbac/*` — dashboard, audit-logs, permission-dimension CRUD, and the `locations`, `branches`, `teams`, `approval-levels` resources — were removed with the Access Control console |
| Upload batches | `GET /upload-batches/{type}`, `/{type}/{id}`; `DELETE /upload-batches/{type}/{id}` |
| Accounts | `POST /account-master`, `POST /register`, `POST /appointment/create-account` |
| Agents | `GET /agents`, `PUT /agents/{id}`, `DELETE /agents/{id}` |
| Utilities | `GET /user-data` (clear caches), `GET /fix-units` — admin-only, destructive |

### HR / Talent (`role:admin` + `module.schema:hr`)

All under `/api/hr`.

| Group | Endpoints | Permissions |
|-------|-----------|-------------|
| Dashboard | `GET /hr/dashboard` | `hr.dashboard.read` |
| Requisitions | `get`, `show/{id}`, `store`, `update/{id}`, `delete/{id}`, `approve/{id}`, `publish/{id}` | `hr.requisition.*` |
| Candidates | `get`, `pipeline`, `show/{id}`, `store`, `update/{id}`, `delete/{id}`, `move-stage/{id}` | `hr.candidate.*` |
| Interviews | `get`, `show/{id}`, `store`, `update/{id}`, `delete/{id}`, `reschedule/{id}`, `feedback/{id}` | `hr.interview.*` |
| Offers | `get`, `show/{id}`, `store`, `update/{id}`, `delete/{id}`, `approve/{id}`, `release/{id}`, `respond/{id}` | `hr.offer.*` |
| Assets | `get`, `dashboard`, `show/{id}`, `store`, `update/{id}`, `delete/{id}`, `allocate/{id}`, `return/{id}`, `transfer/{id}` | `hr.asset.*` |
| Performance | `dashboard`; `cycles/*`, `goals/*`, `reviews/*` | `hr.performance.*` |
| Reports | `GET /hr/reports/generate` | `hr.report.read` |

### Admin + Agent
`POST /trial-form/store` (`recruitment.trial_form.create`),
`GET /trial-form/list` (`.read`),
`POST /trial-form/update/{id}` (`.update`),
`DELETE /trial-form/delete/{id}` (admin only).

### Admin + Employee
`GET /salary-slip/get`, `GET /salary-slip/show/{id}` — both
`permission:payroll.payslip.read`. `SalariesSlipController` scopes to the
caller's own `emp_code` when the role is employee.

### Employee / Agent only
`GET /dashboard` (employee), `GET /agent/candidates` (agent).

---

## Key Controller Logic

### AdminController::salarySlipImport() (643 lines total)
1. Reads the uploaded Excel file
2. Auto-detects columns by matching headers to database columns, with aliases
3. Normalizes month names (full, abbreviated and numeric forms)
4. Normalizes numbers (commas, decimals, Indian grouping)
5. Sums components into gross, sums deductions, computes net
6. Creates or updates `salary_slips`
7. Writes an `UploadBatch` with per-row pass/fail rows
8. Returns the batch summary

### UserController.php (1976 lines)
Employee CRUD and soft delete, Excel import with column mapping, bank account
master import, trial forms, appointments, agent management, self-service profile
update with a restricted field set, employee dashboard. Only a Super Admin may
create or edit Admin / Super Admin accounts.

### AttendanceController.php (246 lines)
Month grid assembly, per-cell upsert, bulk import.

### AadhaarExportController.php (517 lines)
Issues single-purpose export authorizations, builds the trusted print view
model, and renders the watermarked confidential PDF. Every attempt is audited
whether or not it is permitted.

### Api/V1/DocumentController.php (450 lines)
S3-backed upload with idempotency keys, version history, presigned view and
download URLs, soft delete and restore.

---

## Authorization Engine (`app/Services/Authorization/`)

| Class | Role |
|-------|------|
| `AuthorizationEngine` (612) | Resolves a decision from roles, inheritance, policies, delegations and emergency grants |
| `ConditionEvaluator` (144) | Evaluates policy conditions against the request context |
| `ScopeMatcher` (84) | Matches company/unit/branch scope on a record |
| `FieldSecurity` | Field-level read/write masking |
| `AuthorizedUserQuery` | Applies row security to a query builder |
| `SeparationOfDuties` | SoD rule checks |
| `FeatureFlags` | Reads `authorization_feature_flags` |
| `AuthorizationCache` | Per-request decision memoisation |
| `SchemaSupport` (63) | Probes tables **and columns**, memoised per process |

`SchemaSupport` exists because `Schema::hasTable` alone is not sufficient: the
enterprise migration also adds columns to the pre-existing `permissions`,
`roles` and `role_permissions` tables. A deployment can have every table present
and still fail on `permissions.is_active`. It caches for the life of the
process, so a test that migrates up or down mid-process must call
`SchemaSupport::flush()` (`Tests\TestCase::setUp` already does).

---

## Database Schema (55 migrations)

### Core
| Table | Notes |
|-------|-------|
| `users` | Auth, employee master and appointment record in one table. Status 0=Active, 2=Pending. Bank, Aadhaar, PAN, PF, ESI, photo, addresses, trial-form fields, `company_code`, `unit`, `shift_id`, `account_book`, `hastak_department`, `aadhaar_reference`, `is_deleted` |
| `salary_slips` | month, year, `emp_code` (string since 2026-08-01), 20+ components, deductions (pf, esi, pt, tds, lwf, advance), totals, bank info, `company_code`, `unit` |
| `departments` | |

### RBAC (legacy)

Retained — the Access Control screens were not their only reader:

| Table | Still read by |
|-------|---------------|
| `roles`, `user_roles` | `User::roles()`; the super-admin grant `DatabaseSeeder` re-asserts every run |
| `permissions`, `permission_groups`, `role_permissions` | `GET /v1/authorization/me` enumerates them to build the client's login snapshot; `AuthorizationEngine` resolves against them |
| `permission_dimensions` | `GET /my-permissions`, plus the `AadhaarAccess` and `AadhaarExportAccess` gates deciding who may see, print or export a full Aadhaar |
| `audit_logs` | `AuditLogger`, called from `UserController` and `DocumentController` for non-RBAC operations |
| `settings` | The admin Dashboard's `main_dashboard` group |
| `user_permissions` | `AuthorizationEngine` overrides |

Dropped by `2026_08_03_120000_drop_access_control_org_structure_tables` — these
four were reachable only through the removed `/api/rbac/*` resources and nothing
else read them (`users.unit` and `users.branch` are plain strings and never
referenced `branches.id`):

`locations`, `branches`, `teams`, `approval_levels`.

### Enterprise Authorization (11 tables)
`authorization_role_assignments`, `authorization_role_inheritances`,
`authorization_policies`, `authorization_policy_versions`,
`authorization_relationships`, `authorization_access_requests`,
`authorization_delegations`, `authorization_emergency_grants`,
`authorization_sod_rules`, `authorization_decision_logs`,
`authorization_feature_flags`.

The same 11 tables are also defined by `salary-slip-node/prisma/sql/0001`, which
owns the production schema. See `08-SALARY-SLIP-NODE.md` and
`INCIDENT-2026-08-03-authz-rollback.md`.

### Attendance & Shifts
`shifts`, `attendances`, plus `users.shift_id`.

### Documents
`documents`, `document_versions`, `document_audit_logs` (v1, S3) and
`document_uploads` (legacy, local disk).

### Aadhaar
`users.aadhaar_reference` (with a relaxed unique constraint) and
`aadhaar_export_authorizations`.

### HR / Talent (13 tables)
`job_requisitions`, `candidates`, `candidate_stage_history`, `interviews`,
`interview_panelists`, `interview_feedback`, `offers`, `offer_revisions`,
`assets`, `asset_allocations`, `performance_cycles`, `performance_goals`,
`performance_reviews`.

### Upload tracking
`upload_batches`, `upload_batch_rows`.

### Laravel framework
`personal_access_tokens`, `cache`, `cache_locks`, `jobs`, `job_batches`,
`failed_jobs`, `sessions`, `password_reset_tokens`.

---

## Seeders

| Seeder | Seeds |
|--------|-------|
| `DatabaseSeeder` | `admin@niss.pro` / emp_code `1000000002`, role 0. Re-asserts `role`, `status` and `is_deleted` on every run so a downgraded, deactivated or soft-deleted account is repaired. `password` is excluded because it is cast `hashed` and would reset a changed password |
| `RbacSeeder` | System roles: Super Admin, Admin |
| `HrTalentRbacSeeder` | `hr.*` permission catalogue for the HR module |
| `AadhaarRevealPermissionSeeder` | Aadhaar reveal / export permissions |

The former `admin@superadmin.com` and `devlopertest@gmail.com` super admins
shipped with shared hardcoded passwords and are deleted by the
`2026_07_29_000001_remove_legacy_super_admin_accounts` migration.

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| Authentication | JWT bearer, `JwtMiddleware` |
| Coarse authorization | `RoleMiddleware` (admin / agent / employee) |
| Fine authorization | `RequirePermission` + `AuthorizationEngine` (policies, scope, row/field security, SoD) |
| Schema gating | `RequireModuleSchema` returns `MODULE_SCHEMA_NOT_READY` instead of a 500 |
| Rate limiting | 10/min emp-code lookup and Aadhaar export; 15/min onboarding; 30/min logout and uploads; 60/min URL issuance; 120/min permission checks |
| Aadhaar at rest | Encrypted with a secure reference; plaintext column retained for legacy readers |
| Aadhaar disclosure | Separate gates for on-screen reveal and for print/PDF export; every attempt audited |
| Confidential export | Server-rendered watermarked PDF, bytes independent of the DOM |
| Presigned URLs | Short-lived, issued per use, never persisted client-side |
| Upload validation | `FileValidator` on type and size |
| Audit trail | `audit_logs`, `document_audit_logs`, `authorization_decision_logs` |
| CORS | Single source of truth in `config/cors.php` |
| Error rendering | JSON forced for all `api/*` exceptions |
| Soft delete | `users.is_deleted`; documents support restore |

### Known gap

The `permission:admin.*` and `permission:hr.*` middleware does not currently
enforce. The permission catalogue holds no codes with those prefixes, so the
engine denies, shadow mode rescues the request, and `legacyDecision` returns
`'admin' => true`. Effective access is decided by the integer `users.role`.
See `AUDIT-2026-08-03.md`.

---

## Upload Batch System

1. An Excel file is uploaded
2. Each row is processed
3. An `UploadBatch` is created (`type`: `salary`, `employee`, `account-master`)
4. An `UploadBatchRow` is written per row with status pass/fail and a reason
5. The summary (total, success, failed) is returned
6. Batch history and per-row detail are readable through `/upload-batches/{type}`

---

## Deployment Note

The API serving the LAN frontend runs from a separate working copy, and the AWS
production site has its own database. A change committed here is not live until
deployed. See `00-OVERVIEW.md` for the deployment table.

PostgreSQL is now the only supported engine — the `sqlite` connection has been
removed from `config/database.php`. The AWS host must be cut over before it can
run this code; `00-OVERVIEW.md` § "SQLite removal" has the steps.
