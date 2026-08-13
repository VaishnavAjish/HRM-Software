# Full Application Read-Only Audit — NISS HRMS

**Repository:** `F:\HRMS oldd` · **Audited commit:** `2921f5be` · **Date:** 2026-08-13 · **Mode:** STRICT READ-ONLY
**Method:** 10 parallel evidence-gathering passes + 1 secondary-backend pass, followed by a coordinator second-pass cross-check with targeted primary-source verification of every CRITICAL/HIGH claim.

> Every finding cites `path:line`. Severity is on the security model (CRITICAL/HIGH/MEDIUM/LOW/INFO); Priority is engineering urgency (P0–P3); Confidence is CONFIRMED / HIGH / POTENTIAL / NOT VERIFIED. No file, database row, or config was modified during this audit. No test suite was run (the PHPUnit suite auto-targets the protected `niss_hrms_test` DB). Secrets were never printed.

---

## 1. Executive Summary

NISS HRMS is a feature-rich, multi-tenant HR/payroll platform (Laravel 12 API + React 19 SPA, PostgreSQL) serving three tenants (nidhi-impex, silver-star, master) on `niss.pro` and on a LAN, both from this working copy. It is **already in production**, and in parts it is genuinely well-engineered: ~1,557 automated tests, a thoughtful Aadhaar-at-rest design (AES-256 + `$hidden` + masked accessors), a sophisticated snapshot-driven permission UI, and disciplined regression tests around prior incidents. **No SQL injection was found in either backend.**

However, the audit confirms defects that make the current deployment **NOT PRODUCTION READY** by security and data-protection standards:

- **Biggest security / data-leak risk (CONFIRMED CRITICAL):** an **unauthenticated file streamer** (`routes/web.php:14`) plus **135 identity documents sitting in the public webroot** (`public/uploads/`) expose employee resumes, Aadhaar/PAN/bank PDFs, and photos to anyone by direct URL, from any origin — bypassing the very resume-auth fix that was shipped for exactly this.
- **Biggest authorization risk (CONFIRMED HIGH):** permission enforcement runs in **global shadow mode** (`config/authorization.php:7`), so the granular Permission Matrix is *advisory*; the numeric `users.role` tier is the true authority, and two paths let an admin **escalate to super-tier / authorization-admin**.
- **Biggest database risk (CONFIRMED HIGH):** payroll rows link to people by **unconstrained strings** with **no unique key and float money columns**; orphaning is already live (17/17 attendance rows, 2 slips detached), and the schema has **four contradictory definitions** across the repo.
- **Biggest functional risk (CONFIRMED HIGH):** the **Admin Reports page is 100% mock data** with working "export to Excel/PDF" — an admin can export fabricated payroll believing it real; four HR-Onboarding tabs likewise render fiction against endpoints that don't exist.
- **Biggest configuration risk (CONFIRMED HIGH):** the live `.env` runs `APP_DEBUG=true`/`APP_ENV=local`, leaking stack traces + SQL (with PII) to clients and into a 48 MB `laravel.log`; real secrets and a PII SQLite snapshot are bundled in `deploy_clean.zip`; the AWS EC2 private key `HRM.pem` sits at the repo root.

**QA state:** strong unit/feature coverage on auth, RBAC, tenancy, and Aadhaar; **critical gaps** in login-OTP, payroll math, and the `/storage` route. **CI is permanently red** (the secrets-scan job matches a deliberately-tracked CA bundle), so the deployment "gate" gates nothing.

**Verdict: NOT PRODUCTION READY** — the system is live but carries a confirmed unauthenticated-PII exposure (P0) and systemic authorization/data-integrity gaps. See §16 for the prioritized remediation roadmap. Overall readiness: **40 / 100**.

---

## 2. Audit Scope

**Fully reviewed (active apps):** `salary-slip-bac` (Laravel 12 API, 203 PHP files in `app/`) and `salary-slip-front/salary-slip-front` (React 19 SPA, 238 source files). Routes, controllers, middleware, models, migrations, seeders, configs, the React router/auth/permission layer, the API client, and the live `niss_hrms` Postgres schema (read-only queries) were examined.

**Reviewed as secondary:** `salary-slip-node` (Fastify+Prisma, CI-gated, dormant), `server/` (Express+MongoDB "HRFlow Pro", dormant), `client/`, `enterprise-rbac/`, `hrms-mobile-app/` (all dormant per `docs/`).

**Not reviewed / out of reach:** the AWS production host and its SQLite DB (out of `F:` scope); `niss_hrms_test` (off-limits); built asset bundles except for secret/exposure scanning; exhaustive line-by-line reads of the two 2,400-line god-controllers (spot-checked); dependency CVE status (requires an advisory scanner). Anything runtime-only is marked *Requires runtime validation*.

## 3. Read-Only Compliance

Fully compliant. Operations skipped for read-only/safety reasons: (a) no `php artisan test` / phpunit (targets protected `niss_hrms_test`); (b) no `route:list`/artisan (static route parsing used instead); (c) no DB writes — only `SELECT`/`information_schema` against `niss_hrms`; (d) no SMS/OTP/webhook/email calls; (e) no `composer/npm audit` (network + advisory data). Zip archives were listed, never extracted. Secrets were reported by type/location only.

## 4. Repository Inventory

8 top-level project trees; **8,255 files** (excl. `.git`, `node_modules`, `vendor`). Only two are live.

| Dir | Files (tracked) | Role | Verdict |
|---|---|---|---|
| `salary-slip-bac` | 452 | Laravel 12 API (`artisan serve :8000`) | **ACTIVE** |
| `salary-slip-front/salary-slip-front` | 999 | React 19 SPA (real source in `src/`) | **ACTIVE** |
| `salary-slip-node` | 154 | Fastify+Prisma, CI-gated, shares JWT/DB with Laravel | **DORMANT (latent prod risk)** |
| `server/` | 75 | Express+MongoDB "HRFlow Pro" | **LEGACY/orphan** |
| `client/` | 61 | React 18 "HRFlow Pro" | **LEGACY/orphan** |
| `enterprise-rbac/` | 1,703 | Express5+Prisma7 RBAC reference; **1,397 tracked files are a live PGlite data dir** | **LEGACY/orphan** |
| `hrms-mobile-app/` | 143 | Expo/RN app; duplicates the Capacitor channel | **DORMANT** |
| `dev/` | 0 | empty node_modules husk | **DEBRIS** |
| Root loose files | 29 (23 tracked) | test_*.php / patch_*.js / temp_*.txt / zips / HRM.pem / image.png | **DEBRIS** (see §14) |

Root README documents the *wrong* app ("HRFlow Pro" = the dormant `client/`+`server/`). Docs `docs/00-08` + `functional-analysis-report/` are current and accurately label the dormant stacks.

## 5. Technology Stack

| Layer | Component | Evidence |
|---|---|---|
| Backend | PHP `^8.2` (CI 8.5, guide 8.3), Laravel **12.64.0**, tymon/jwt-auth 2.3 (real auth), Sanctum 4.3 (only a dead `/user` route), PhpSpreadsheet 2.4.7, flysystem-s3 3.35 | `salary-slip-bac/composer.json`, `.lock` |
| Frontend | React **19.2.5**, Vite 7.3, react-router-dom 7, **no Redux/axios** (Context + hand-rolled `fetch`), ag-grid 35, recharts 3.8, exceljs 4.4, jspdf 4.2, dompurify 3.4, vite-plugin-pwa, Capacitor 8 | `.../salary-slip-front/package.json` |
| DB | PostgreSQL `niss_hrms` (dev+LAN, trust auth); **prod = SQLite** per project record; docs claim MySQL (3-way divergence) | `config/database.php:26`, `phpunit.xml:33` |
| Secondary | Fastify 5 + Prisma 6.19 (node), Express4 + Mongoose8 (server), Prisma7/PGlite (enterprise-rbac) | respective `package.json` |
| CI | GitHub Actions, Node 22, PHP 8.5, postgres:18 | `.github/workflows/ci.yml` |

## 6. Architecture Overview

```
React SPA (sessionStorage JWT) ──fetch──▶ /api (Laravel 12)
        │  Context: Auth/Company/Notification        │
        │  useAuthorization(snapshot)                jwt.auth ▶ [module.schema] ▶ [role|role.manager|super.admin] ▶ permission:<code> (SHADOW) ▶ Controller ▶ (object-scope) ▶ Eloquent ▶ Postgres niss_hrms
        │                                            └ files: S3 (v1/documents, presigned) AND public/uploads (unauth) AND /storage/{path} (unauth)
        └ PWA SW registered then unregistered each boot
Dormant & NOT in the running stack: salary-slip-node (:8001, shares JWT_SECRET+DB), server (:5000, Mongo), enterprise-rbac (PGlite)
Prod deploy (documented): nginx ▶ php artisan serve (dev server) under PM2; no queue worker; no scheduler cron
```

## 7. System Connection Map & Coverage

The frontend calls the Laravel API exclusively (no calls to node/server; socket.io inert without `VITE_SOCKET_URL`). **264 distinct frontend call templates** vs **~287 backend endpoints**: 259 matched, **5 broken** (onboarding), 0 method mismatches, 3 semantic mismatches, 25 orphan backend routes.

## 8. Repository Coverage Report

| Metric | Value |
|---|---|
| Files discovered (excl. git/node_modules/vendor) | 8,255 |
| Backend endpoints (api.php + web.php + /up) | **287** |
| Frontend routes / page components | 59 routes / **44 unique pages** |
| Frontend pages deep-opened | 15 / 44 (~34%) + 100% of routing/auth/permission infra |
| Live DB tables / migrations run | **83** / 97 rows (all 96 files ran; 1 ran-file-deleted) |
| Automated tests (not executed) | **~1,557** (backend 790 methods/69 files, node 449, frontend 318) |
| Security-sensitive flows traced | auth (pw+OTP+reset), authz pipeline, tenancy, object-level authz, file storage, exports, payroll, Aadhaar |

Excluded from line-by-line: vendor/build artifacts, `hrms-mobile-app`, `enterprise-rbac` internals, ~2,000 unread lines of `UserController.php`.

## 9–13. Page / Route / API Inventories (condensed)

**Portals:** `/admin` (26 routes), `/employee` (7), `/agent` (3), 2 public (`/quiz/:token`, `/about-niss`). Portal is chosen by the permission snapshot's `/admin` route grant, **not** `users.role` (`AuthContext.jsx:119-133`). Guards: role guard + implicit registry `canRoute()` on every protected path; `canRoute` **fails open** for routes absent from the snapshot (`useAuthorization.js:66`). No 404 page (`*`→`/login`). All 44 page components exist; no missing imports.

**Backend middleware:** `jwt.auth` (JWT) → optional `module.schema:*` → `role`/`role.manager`/`super.admin` → `permission:<code>` (shadow). Only 2 truly public app routes beyond auth/quiz/health, plus **1 unauthenticated file route** (the CRITICAL). `super.admin` alias defined but wired to **no route**.

### Page ↔ API ↔ Database Matrix (key flows) — *mandatory deliverable*

| Page | Route | API | Controller | Table | Status |
|---|---|---|---|---|---|
| Login | `/login` | POST `/login`, `/login/otp/*` | AuthController | users, login_otps, login_events | OK (over-exposes `otp`,`verification_token`) |
| Employee mgmt | `/admin/employees` | GET `/employee/get`, POST `/employee/store`, PUT `/employee/edit/{id}` | UserController | users | **edit mass-assigns `role`** (F-A3) |
| Salary upload | `/admin/salary/upload` | POST `/admin/salary-slip/preview`,`/store` | AdminController | salary_slips, upload_batches | **no size cap; no period unique** (F-B1/2) |
| Payslips (emp) | `/employee/payslips` | GET `/salary-slip/get`,`/show/{id}` | SalariesSlipController | salary_slips | OK scope; **client fabricates breakdown** (F-B4) |
| Reports | `/admin/reports` | *(none)* | *(none)* | *(none — mockData.js)* | **100% FAKE** (F-F1) |
| HR Onboarding | `/admin/hr/onboarding` | GET `/hr/onboarding/{training,assets,checklists,policies}` | *(routes absent)* | *(mock)* | **BROKEN → fiction** (F-F2) |
| Access control | `/admin/access-control/*` | `/v1/roles`, `/v1/admin/users/*` | V1 controllers | roles, permissions, user_* | OK (hard `role.manager`+RoleHierarchy) |
| Documents | (employee/appointment) | `/v1/documents/*` | V1DocumentController | documents (S3) | OK (presigned, scoped) |
| Resume | HR hiring | GET `/v1/candidates/{id}/resume` | CandidateController | candidate_documents | endpoint OK **but /storage bypass** (F-S1) |
| Departments | multiple | GET `/department/get` | AdminController | departments | **no perm + writes on GET** (F-A6) |

### Broken Connection Matrix — *mandatory deliverable*

| # | Source | Expected | Actual | Sev | Fix |
|---|---|---|---|---|---|
| 1 | Onboarding Training/Assets/Checklists/Policy tabs | 4 backend routes | **404 → silent mock render** | HIGH | implement routes or remove tabs |
| 2 | `onboardingApi.js:103` accept-policy | backend route + UI caller | neither exists (dead pair) | MED | add or delete |
| 3 | `salaryApi.getDepartments(?company_code=)` | tenant-filtered read | param ignored; **writes rows on GET** | MED | honor filter; move auto-seed off GET |
| 4 | Admin Reports charts/exports | real payroll API | `mockData.js` fixtures | HIGH | wire real endpoints/remove |
| 5 | Attendance "Refresh" | re-fetch | 400 ms `setTimeout` toast, no fetch | HIGH(UX) | real refetch |
| 6 | `/quiz/{token}` 64-char constraint | applied on routes | `->where` on group return = **dead** | LOW | move constraint onto routes |

## 14. Findings Register (deduplicated, ranked)

Convergence noted where multiple independent passes found the same issue. ✅ = personally verified against primary source by the coordinator.

### CRITICAL

**F-S1 · Unauthenticated access to PII documents (P0, CONFIRMED ✅, 4 passes).**
`routes/web.php:14-68` registers `GET /storage/{path}` (`->where('path','.*')`) with **no auth**; its second branch calls `Storage::exists()/::path()` on the **default disk = `local` = `storage/app/private`** (`config/filesystems.php:16,35`), returning any private-disk file (resumes, Aadhaar/PAN/bank docs, avatars) with `Access-Control-Allow-Origin: *` and `X-Frame-Options: ALLOWALL`. Separately, `DocumentStorageService::store:188` writes 135 identity files (132 PDFs + 3 PNGs, verified) into `public/uploads/users/{empCode}/{type}/...` — **served directly by the web server** (`.htaccess` only disables directory listing, not file GETs). Together these are a second, unauthenticated path to the same files the `/candidates/{id}/resume` fix (2026-08-11) was meant to protect. **Impact:** national-ID and financial PII of all employees downloadable by guessable/leaked URL from any origin. **Fix:** delete/authenticate the `/storage` route; move legacy uploads to the private disk and serve via the scoped `v1/documents` presigned path; purge public copies. *(Exploitability on the nginx prod depends on whether `/storage/*` is proxied to Laravel; on the LAN `artisan serve` it is fully exposed.)*

### HIGH

**F-A1 · Authorization enforcement is global SHADOW; granular RBAC is advisory (P1, CONFIRMED ✅, 3 passes).** `config/authorization.php:7` `default_mode='shadow'`; `AUTHZ_ENFORCED_*` unset (empty lists); only `admin.authorization.`/`admin.policy.` always-enforced. `RequirePermission.php:79-105`: on a permission deny, if shadow AND the *legacy* check (numeric `users.role`) would allow, the request **proceeds**. `AuthorizationEngine.php:580-600`: role ∈{0,1,2} ⇒ allow-all (except authorization/policy). **Impact:** the Permission Matrix cannot reduce a tier-1/2 admin below "everything"; least-privilege for admins is non-functional; the real authority is the numeric tier. **Fix:** populate `AUTHZ_ENFORCED_PREFIXES` for migrated business prefixes (validate `shadow_would_deny` log volume first), retire/scope the legacy allow-all branch.

**F-A2 · Privilege escalation via `assign-permissions` (P1, HIGH).** `POST /v1/admin/users/{id}/assign-permissions` (`routes/api.php:296`) applies only scope (`guardTarget`) with **no per-permission tier allow-list** (`V1AdminUserController.php:403-427`); `UserAccountService.php:272-278` inserts `user_permissions` rows the engine reads. A tier-1/2 admin can grant themselves `admin.authorization.*` — the one surface shadow leaves enforced. **Fix:** allow-list grantable codes to the actor's tier; forbid self-target; hard super/security-admin middleware.

**F-A3 · Privilege escalation via employee edit (P1, CONFIRMED ✅).** `UserController::guardPrivilegedFields` (`:453-470`) strips `role` **only when `=== 0`**, so a tier-1/2 admin editing an in-company employee can set `role` to 1 or 2 — minting an admin-tier account (the real authority under shadow). Also mass-assignable here: `salary, status, is_deleted, type`. **Fix:** route through the guarded provisioning service; strip privileged fields.

**F-S2 · Debug mode on the live LAN host (P1, CONFIRMED ✅, 4 passes).** `.env`: `APP_ENV=local`, `APP_DEBUG=true`, `APP_URL=http://192.168.1.53:8000`, `LOG_LEVEL=debug`. With `bootstrap/app.php:40` forcing JSON for `api/*`, unhandled 500s return full traces + raw SQL (table/column names, bound PII) to clients; HSTS disabled. `.env.example` *also* ships `APP_DEBUG=true` (CI copies it verbatim). **Fix:** `APP_ENV=production`, `APP_DEBUG=false`, `config:cache`; default the example to false.

**F-S3 · PII and credentials in `laravel.log` (P1, CONFIRMED ✅).** 47.8 MB, actively written. Contains plaintext Aadhaar (`aadhar_card_no = <12 digits>` via APP_DEBUG SQL-binding logs — bypassing the model's `$hidden`), cleartext mobile numbers, **AWS S3 presigned URLs with `X-Amz-Credential=AKIA…&X-Amz-Signature=…`**, and candidate name/email/phone + 2 KB raw bodies (`PublicCandidateIntakeController:55`). **Fix:** APP_DEBUG=false, scrub+rotate the log, add a redacting log processor, stop logging presigned URLs.

**F-S4 · Secret sprawl: keys + PII DB on disk (P1, CONFIRMED ✅).** `deploy_clean.zip` (27 MB) bundles the **real `salary-slip-bac/.env`** (APP_KEY, JWT_SECRET, AWS creds, Fast2SMS key, AADHAAR_REFERENCE_SECRET) **and `database.sqlite`** (PII snapshot). `HRM.pem` (EC2 SSH private key) sits at repo root. `salary-slip-node/.env` holds **byte-identical** `JWT_SECRET`/`APP_KEY`/`AADHAAR_REFERENCE_SECRET` and the same `DATABASE_URL` — one leak forges admin tokens for both apps and decrypts all Aadhaar (`iss` is emitted but never validated). All untracked (good `.gitignore`) but present in the live serving copy; `SECURITY_CHECKLIST.md`'s own CRITICAL items (1,2,3,4,5) are **unremediated**. **Fix:** rotate every bundled secret; delete zips/pem from the tree; give each service a distinct secret or enforce `iss`/`aud`.

**F-S5 · Hardcoded default super-admin password (P1, CONFIRMED ✅, 2 passes).** `DatabaseSeeder.php:35` `env('SEED_SUPER_ADMIN_PASSWORD','Admin@niss123')` for `admin@niss.pro` (role 0). Any deploy/re-seed without the env var creates a root account with a source-published password. **Fix:** fail hard if unset; rotate if ever seeded with the default.

**F-D1 · Payroll linkage unconstrained; orphaning is live (P1, CONFIRMED ✅, 2 passes).** `salary_slips`/`attendances` have **zero FKs**; `users.emp_code` is non-unique, nullable, **unindexed**. Live orphans measured: 2 slips, **17/17 attendances** (emp_code `'1'` matches no user), 5 login_events; 4 users carry CSV `company_code='nidhi-impex,silver-star'` that equality-scoping misses. Hard user deletes leave string-linked children detached. **Fix:** unique `(company_code, emp_code)` after cleanup, or a real `user_id` FK on slips/attendance; cleanup job; never bulk-delete users via query builder.

**F-D2 · No unique key on the salary period + float money (P1, CONFIRMED ✅, 2 passes).** No `UNIQUE(company_code, emp_code, month, year)`; dedupe is only app-level `updateOrCreate` (`AdminController.php:522`) → check-then-act race → duplicate slips under concurrent upload. All 26 money columns are `double precision`; duplicated `total_deduct`/`net_payable` (float) vs `total_deduction`/`net_salary` (varchar) mirrors are hand-synced only on import. **Fix:** add the unique index + `upsert()` (as `attendances` already does); migrate money to `numeric(12,2)`; collapse mirror pairs.

**F-D3 · Batch "undo" hard-deletes without transaction, audit, or guards (P1, CONFIRMED ✅, 2 passes).** `UploadBatchController::destroy:108-144` loops deleting slips/users/attendance; `User::where(...)->delete()` (`:128`) is a query-builder bulk delete that **bypasses `static::deleting`** (the ProtectedAccount guard, `User.php:40`) and writes **no audit row** — the exact failure the code documents as a real prod incident (339→338 users, `UserController.php:910-921`). **Fix:** wrap in `DB::transaction`, iterate models, log via AuditLogger, skip updated-not-created users.

**F-B4 · Client fabricates payslip component breakdowns (P1, CONFIRMED).** `utils/payslipUtils.js:274-320` ratio-splits gross into invented PT/PF/TDS when stored components are absent; totals recomputed client-side. Employees can see a breakdown on their own payslip/PDF that was never stored. **Fix:** render only stored components; blank, never split.

**F-F1 · Admin Reports page is 100% mock data with working exports (P1, CONFIRMED, 2 passes).** `Reports.jsx:5-10` imports from `data/mockData.js`; every chart, the department table, and the hardcoded attendance pie are fixtures; three export buttons download Excel/PDF of fake data and toast success. Routed at `App.jsx:339` **without a permission wrapper**. **Impact:** an admin can export fabricated payroll believing it real. **Fix:** wire real endpoints + gate, or remove.

**F-F2 · HR-Onboarding tabs render fiction (P1, CONFIRMED, 2 passes).** `hr/onboarding` backend group lacks `training/assets/checklists/policies`; `onboardingApi.js:26-35` silently swaps in `onboardingMocks` on 404 (a "preview" banner exists but the data is fake regardless of DB state). **Fix:** implement routes or remove tabs.

**F-X1 · CI deployment gate is permanently red (P1, CONFIRMED ✅).** `ci.yml:346` `git ls-files | grep -iE '\.pem$…'` matches `salary-slip-bac/storage/certs/cacert.pem` (deliberately tracked, verified) → `secrets-scan` always `exit 1` → the `gate` job (needs it) never passes. Every push is red, training the team to ignore CI; the gate's "artifact is deployable" is meaningless. **Fix:** exclude the CA bundle path from both greps.

**F-A4 · IDOR: candidate mutations lack object scope (P1/P2, HIGH).** `CandidateController::update/destroy/moveStage` (`:108-181`) do `find($id)`→mutate with **no `candidateWithinActorScope`** (which `show`/`resume` correctly apply). A non-global holder (tier-2) can edit/delete/re-stage another company's candidates. **Fix:** add the scope check (404 on mismatch) to all three.

### MEDIUM (summary)

| ID | Finding | Evidence |
|---|---|---|
| F-S6 | Wildcard CORS on all paths (`origins/methods/headers=*`); mitigated only by `credentials=false` | `config/cors.php:5-19` |
| F-S7 | No baseline API rate limiting; login 30/min, OTP-verify 12/min; most CRUD unthrottled; enumeration oracle `GET /check-emp-code/{code}` | `routes/api.php`, `AppServiceProvider` empty |
| F-S8 | 30-day JWT (60-day refresh); **no token revocation on password change/reset** | `config/jwt.php:114`; `AuthController.php:504,885` |
| F-S9 | No account lockout on failed logins; `rbac.max_failed_login_attempts=5` never consumed | `AuthController::login`; `SettingsController.php:15` |
| F-S10 | Over-exposed models: `otp` (reset-hash), `verification_token`, `salary`, `bank_account_no`, `pan_card_no`, `pf_no`, `esi_no`, `mobile_number`, `dob` not in `$hidden`; no Resource/DTO layer; lands in sessionStorage | `User.php:108-112` ✅ |
| F-S11 | Permissive CSP (`script-src 'unsafe-inline' 'unsafe-eval'`) + 30-day token in sessionStorage → XSS steals long-lived bearer | `SecurityHeaders.php:17` |
| F-A5 | Company/unit master mutations gated only by shadow perm — any legacy admin can edit/delete the tenant partition key | `V1CompanyUnitController:78-150` |
| F-A6 | `GET /department/get` lost `permission:hr.department.read` this commit **and auto-creates Department rows on GET** | `routes/api.php:494`; `AdminController.php:653-678` ✅ |
| F-A7 | HR Manager over-granted `hr.employee.aadhaar.reveal`+`bank.reveal` (the `hr.*` seed sweep) while the more-privileged Admin is denied | `RbacSeeder.php:122-150` |
| F-A8 | Field-security column nodes (salary/bank/aadhaar) declared but not enforced in list serialization | `PermissionRegistry.php:255-284` |
| F-D4 | `upload_batch_rows.row_data` archives full rows incl. **bcrypt password hash** (employee import) and bank account + mobile (salary), readable via the batch `show` endpoint | `UserController.php:1348`; `AdminController.php:513` |
| F-D5 | Schema has **four contradictory definitions** (Laravel migrations / Eloquent / live DB / Prisma); the generated Prisma client selects a `users.login_disabled_at` column the DB lacks → Node full-row reads 42703 | `salary-slip-node/src/…/auth.repository.ts:36` |
| F-D6 | `users.company_code` holds CSV lists; scoping equality misses those users; proper `user_companies` pivot exists but is under-used | `AdminController.php:33-43` ✅ |
| F-D7 | Engine fork unguarded: config cites `refuseUnsupportedDatabase()` which **does not exist**; LIKE case-sensitivity + float/text math diverge between Postgres dev and SQLite prod | `config/database.php:21` (comment only) |
| F-B1 | Salary preview/import accept any file, **no server-side size/MIME cap** (frontend-only 10 MB) → memory DoS + formula eval | `AdminController.php:590,317` |
| F-B3 | Multi-company (role-1) salary import writes/looks-up a comma-joined `company_code` → wholesale failure or corrupt scope key | `AdminController.php:321,425,474` |
| F-B5 | Frontend CSV/XLSX export does **not** neutralize `= + - @` (formula injection); backend user-directory export *does* sanitize | `utils/excel.js:104` |
| F-B6 | Employee bulk import not atomic across 100-row chunks → partial import on mid-failure | `AddEmployeePage.jsx:539`; `UserController.php:1289` |
| F-B7 | Department rename cascades across `users`+`salary_slips` (no tx) → rewrites historical slips | `AdminController.php:706` |
| F-B8 | Dashboard department distribution double-sources; role-1 `company_code` not intersected with owned → cross-company sum leak | `AdminController.php:31-35,121-148` |
| F-O1 | No error monitoring (no Sentry/APM), no request IDs (Laravel), no backup automation; scheduler `tickets:escalate-overdue` never runs (no cron); queue driver set but no worker + no jobs | `routes/console.php:22`; AWS guide |
| F-X2 | Deploy guide runs `php artisan serve` as prod app server, serves the git-committed build dir, SSH open to "Anywhere", clones the wrong repo, MySQL/pgsql/sqlite 3-way divergence | `AWS_DEPLOYMENT_GUIDE.md` |
| F-C1 | Native-`$request->validate()` 422 `errors` bag discarded by the client → multi-field errors shown one at a time | `utils/api.js:15-20` |

### LOW / INFO (summary)

Destructive operations via **GET** (`/employee/delete/{id}`, `/admin/salary-slip/delete`, closures `/user-data` cache-clear + `/fix-units` mass-UPDATE) (F-B9); PWA registers a service worker then unregisters it every boot (F-F3); 14 orphan React components (~4,600 lines) + the Fast2SMS **OTP-login feature is unreachable** in the UI (F-F4); production error toasts point users at `127.0.0.1:8000` (F-C2); `.env.production` pins the API to `niss.pro` regardless of serving host (F-C3); `employee_family_members.user_id` shipped without an FK (F-D8); `users.unit` free text 99% unreconciled with the `units` master (F-D9); 29 duplicate mobile numbers + unindexable `LIKE '%last4%'` OTP lookup (F-D10); legacy RBAC pivots have no timestamps (F-D11); migration history not reproducible (one ran-file-deleted, duplicate timestamps) (F-D12); god-files (`UserController.php` 2,479 lines, `Appointments.jsx` 2,540); 23 tracked debris files including `run.txt` disclosing LAN share `\\192.168.1.53` and destructive codemods aimed at now-missing paths; a live PGlite data dir (1,397 files) committed under `enterprise-rbac`.

## 15. Second-Pass Cross-Check (incl. a refuted claim)

- **Refuted:** a secondary pass claimed Laravel's password-reset step 3 "never compares the OTP" (account takeover by email alone). **False** — `setNewPasswordAfterVerification` (`AuthController.php:877`) requires `otpData['verified']`, set only after a hashed OTP match in `verifyPasswordResetOtp` (`:823-836`) with 10-min expiry + 5-attempt cap ✅. The claim rested on a stale comment in the dormant Node code. **Not a live vulnerability.**
- **Independently corroborated (high confidence):** `/storage` unauth PII (4 passes + verified); shadow authz (3 passes + config verified); APP_DEBUG (4 passes + verified); no salary-period unique + float money + orphans (2 passes + DB-verified); batch-undo hard delete (2 passes); Reports/Onboarding mock data (2 passes each); seeder password (2 passes + verified); CI gate red (verified).
- **Consistency checks passed:** Pages↔Routes, Routes↔Nav, APIs↔Controllers (all 47 exist), Models↔live-DB (0 fillable columns missing), Permissions↔UI (snapshot-driven), Env↔build-exposure (no secrets in bundles; no source maps).

## 16. Prioritized Remediation Roadmap

**P0 — before anything else (unauthenticated PII):**
1. Remove/authenticate `routes/web.php:14` `/storage/{path}`; move `public/uploads/*` to the private disk + scoped serving; purge public copies. (F-S1)
2. Set `APP_DEBUG=false`/`APP_ENV=production`, `config:cache`; scrub+rotate `laravel.log`. (F-S2, F-S3)
3. Rotate every secret bundled in `deploy_clean.zip` / present on disk (AWS key, JWT_SECRET, APP_KEY, Fast2SMS, DB, mail, Aadhaar); delete the zips and `HRM.pem` from the tree; rotate the EC2 key pair. (F-S4)

**P1 — authorization, payroll integrity, and trust:**
4. Decide shadow→enforce (populate `AUTHZ_ENFORCED_PREFIXES`) and close the two escalation paths (assign-permissions tier allow-list; strip `role` in employee edit). (F-A1/A2/A3)
5. Add candidate object-scope; hard-gate company/unit mutations to super-admin. (F-A4/A5)
6. Add `UNIQUE(company_code, emp_code, month, year)` + `upsert`; migrate money to `numeric`; add `user_id` FK (or unique emp_code) after orphan cleanup; make batch-undo transactional+audited. (F-D1/D2/D3)
7. Replace the mock Reports page and Onboarding tabs with real data or remove them; stop client-side payslip fabrication. (F-F1/F2/B4)
8. Fix the CI secrets-scan exclusion so the gate can pass. (F-X1)

**P2 — hardening:** restrict CORS to known origins; add baseline throttling + login lockout; add `otp`/`verification_token` to `$hidden` and introduce a User Resource/DTO; revoke tokens on password change + shorten TTL; server-side file size/MIME caps; neutralize export formula injection; strip credentials from `upload_batch_rows`. (F-S6–S11, F-A6/A7, F-B1/B5, F-D4)

**P3 — ops & hygiene:** Sentry + request IDs + `LOG_CHANNEL=daily`; pg_dump backups + install `schedule:run` cron + a real queue worker; rewrite the deploy guide around php-fpm/nginx; reconcile the four schema definitions to one owner; remove dead stacks + root debris + the committed PGlite dir; convert destructive GETs to DELETE. (F-O1, F-X2, F-D5–D12, F-B9)

## 17. Production Readiness Scores

| Category | /10 | Category | /10 |
|---|---|---|---|
| Architecture | 4 | Data Leakage Protection | 2 |
| File/Module Organization | 3 | Privacy | 3 |
| Frontend | 6 | UI/UX | 6 |
| Backend | 5 | Accessibility | 5 |
| Database | 3 | Responsive Design | 6 |
| API Integration | 6 | QA Coverage | 6 |
| Route Integrity | 6 | Security Testing | 5 |
| Authentication | 5 | Performance | 5 |
| Authorization | 3 | Reliability | 4 |
| Role/Permission Security | 3 | Error Handling | 5 |
| Tenant/User Isolation | 4 | Observability | 3 |
| Data Security | 2 | Maintainability | 4 |
| Data Leakage Protection | (2) | Configuration | 3 |
| — | | DevOps | 3 |
| — | | Production Readiness | 3 |

**Overall Production Readiness Score: 40 / 100** (weighted down by CONFIRMED critical data-exposure and advisory-only authorization; buoyed by strong test coverage and a thoughtful Aadhaar/permission design).

## 18. Final Verdict

### NOT PRODUCTION READY

The system is already live yet carries a **CONFIRMED unauthenticated exposure of employee PII** (national-ID, financial, and resume documents) reachable by direct URL from any origin, **authorization that is advisory rather than enforced**, **debug mode leaking stack traces and PII on a LAN-served host**, **real secrets plus a PII database snapshot bundled on disk**, and **payroll data integrity resting on unconstrained strings with live orphaning**. Any one of the P0 items is a production blocker on its own; they coexist. The considerable strengths — ~1,557 tests, a sound Aadhaar-at-rest design, a capable permission UI, no SQL injection — mean the path to "ready" is remediation, not a rewrite. Re-audit after the P0/P1 roadmap is complete.

---
*Prepared read-only against commit `2921f5be`. Live-DB figures are point-in-time (2026-08-13); another session may edit this repo concurrently. Production (AWS/SQLite) claims are inferences from code + the Prisma snapshot and are marked accordingly in the detailed passes.*
