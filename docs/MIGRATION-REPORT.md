# PHP → Node.js Migration Report

**Scope:** `F:\HRMS oldd` (per standing instruction, this directory only)
**First audit:** 2026-08-03 · **Refreshed:** 2026-08-03, after the repo changed mid-migration
**Status:** Modules 0–2 delivered. Module 3 blocked pending a scope decision — see §1.

---

## 0. Executive summary

| | First audit | Now |
|---|---:|---:|
| API routes | 121 | **150** |
| Controllers | 23 | **29** |
| Models | 22 | **28** |
| Services | 9 | **17** |
| Middleware | 2 | **3** |
| Migrations | 41 | **42** |
| Backend tests | 19 files | 21 files |

Unchanged: Laravel 12 on PHP 8.5.8 · React 19.2.5 / Vite 7.3.2, **JavaScript only** (0 `.ts` files) · Node v26.3.0 · PostgreSQL `niss_hrms`, 75 tables.

**Still true, and still the reason this is lower-risk than most:** no queue, no scheduler, no event listeners, no server-side session dependence.

---

## 1. Blocking decision: the enterprise authorization platform

A new module landed **during** this migration:

```
6  controllers   app/Http/Controllers/Api/V1/Authorization/
8  services      app/Services/Authorization/   (AuthorizationEngine, ScopeMatcher,
                 ConditionEvaluator, FieldSecurity, AuthorizationCache, FeatureFlags, …)
6  models        AuthorizationPolicy, AuthorizationDecisionLog, AuthorizationFeatureFlag,
                 AuthorizationAccessRequest, AuthorizationRoleAssignment, …
1  middleware    RequirePermission  (the `permission:` route middleware)
1  migration     2026_08_03_000001_create_enterprise_authorization_platform
29 routes        /api/v1/authorization/*, /api/v1/permissions/*, /api/v1/policies/* …
```

It also modified `User`, `Role`, `Permission`, `DocumentAuthorizer`, `bootstrap/app.php` and four controllers.

### It is not deployed

```
authorization* tables in production : (none)
total public tables                 : 75  (unchanged)
pending migrations                  : 1 — create_enterprise_authorization_platform
```

The migration creates **11 tables** and none exist. The 29 routes are registered and resolve, but any request touching the database would fail. This is code-complete and un-deployed, not live behaviour.

**Why this blocks Module 3.** My plan had Module 3 as RBAC — `RoleController` (8), `PermissionDimensionController` (5), `UserRoleController` (1), `RbacDashboardController` (1). The new platform appears to be that subsystem's replacement. Porting the old controllers now risks migrating something about to be retired; porting the new ones means migrating code that has never run against a real database.

Three ways forward:

- **(a) Skip both, take Module 4 (Users & employees, 25 routes) next.** Highest-value work, no ambiguity, lets the authorization question settle. **Recommended.**
- **(b) Port the legacy RBAC controllers only** — they are live and in use today; treat the new platform as a later phase.
- **(c) Port the new platform** — deploy its migration first so it can be tested, which is a production schema change and a much larger decision.

### Migration drift, which is the sharper operational risk

```
migration files in this repo    : 42
rows in production migrations   : 52

PENDING  (in repo, not applied) : 1
  2026_08_03_000001_create_enterprise_authorization_platform

APPLIED  (not in this repo)     : 11
  2026_08_01_100001_create_dashboard_preferences_table
  2026_08_01_100002_create_dashboard_saved_views_table
  2026_08_01_110001_create_platform_registry_tables
  2026_08_01_110002_create_platform_config_tables
  2026_08_01_120001_create_group_management_tables
  2026_08_01_130001_create_company_management_tables
  2026_08_01_140001_create_branch_location_tables
  2026_08_01_150001_add_weekly_off_days_to_company_units
  2026_08_01_160001_create_organization_structure_tables
  2026_08_01_170001_create_workforce_planning_tables
  2026_08_03_100001_create_users_security_tables
```

Production's schema is this repo's migrations **plus** 11 from the other tree. Consequences worth acting on regardless of the migration:

- Running `php artisan migrate` from this repo against production **applies the authorization platform** — 11 new tables — whether or not anyone intended to deploy it.
- `migrate:status` from here is misleading, and `migrate:rollback` would attempt to roll back migrations whose files are absent.

---

## 2. API analysis (Step 4, refreshed)

**150 routes / 28 controllers.** Still a clean REST API — the frontend's 89 distinct paths all resolve, so **`src/utils/api.js` needs no changes**; Step 7 remains a base-URL switch.

| Module | Routes | State |
|---|---:|---|
| Auth | 7 | **migrated** |
| Masters (locations/branches/teams/approval-levels) | 16 | **migrated** |
| Shifts | 5 | **migrated** |
| Settings | 2 | **migrated** |
| Users & employees (`UserController`) | 25 | pending |
| Documents (v1 + legacy) | 17 | pending |
| Admin / salary | 10 | pending |
| Legacy RBAC (roles, permission-dimensions, user-roles, dashboard) | 15 | pending — see §1 |
| **Enterprise authorization (new)** | **29** | **not deployed** — see §1 |
| Attendance, upload batches, audit logs | 7 | pending |
| Closures (health, maintenance) | 4 | pending |
| Aadhaar export | 6 | pending |

---

## 3. Database (Step 3)

75 tables in production. This repo's 34 in-scope tables all exist there; `users` differs by 2 columns (`login_disabled_at`, `login_disabled_reason`), `salary_slips` matches exactly. Findings from the first audit stand:

- **`users` is an 88-column god table** holding employees, appointments, trial forms, agents and admins, discriminated by `type`/`role`. Most authorization bugs found here trace to it.
- **`salary_slips` has no FK to `users`** — joined by the `emp_code` string.
- **`users.shift_id` has no FK either.** Eloquent's `hasMany` works without one; Prisma cannot model the relation, so employee counts need a separate grouped query.
- **5 CHECK constraints are invisible to Prisma** (`roles_type_check`, `approval_levels_type_check`, `permission_dimensions_dimension_check`, two on `document_versions`). Each must be mirrored in Zod or a bad value returns a raw 500 instead of a 422.
- **Views, stored procedures, triggers:** none found in `information_schema` for the public schema.

---

## 4. Cryptographic compatibility — resolved

The gate for the whole migration, now proven in both directions:

| | Verified |
|---|---|
| `encrypted_aadhaar_number` | AES-256-CBC, `base64(json({iv,value,mac,tag}))`, hex HMAC over `iv‖value`. PHP-written ciphertext decrypts in Node. |
| Passwords | PHP `$2y$` hashes verify in Node. |
| `aadhaar_secure_reference` | `'AADHAAR_' + first 16 hex of HMAC` — byte-identical. |
| JWT | tymon claim set reproduced: `sub` is a **string**, `prv` is `sha1('App\Models\User')`. **PHP accepts Node-issued tokens and vice versa.** |
| JWT blacklist | Shared via the `cache` table: `laravel-cache-<jti>` → `a:1:{s:11:"valid_until";i:…;}`. Logout in either backend logs out of both. |

---

## 5. Progress

| Module | Routes | Tests | State |
|---|---:|---:|---|
| 0 — Foundation (crypto, Fastify, Prisma) | — | 63 | done |
| 1 — Auth | 7 | 210 | done, verified end-to-end |
| 2 — Masters, shifts, settings | 23 | 255 | done, verified end-to-end |
| 3 — **decision required** | — | — | see §1 |

**255 Node tests · typecheck clean** (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) · 29 source files.

### Defects found and fixed in the PHP app during this work

1. **Unauthenticated appointment endpoints** — `GET /appointment` returned every appointment in every company with full PII, on an API with `allowed_origins: ['*']`. Fixed.
2. **Trial-form privilege escalation** — an agent could set `role: 0` on any user or overwrite an admin's password. Fixed.
3. **Password reset does not require the OTP** — anyone knowing a registered email can take over that account. Proven in `tests/Feature/PasswordResetOtpTest.php`. **Fixed in Node only, by decision; still live on Laravel.**
4. **Branches cannot be renamed** — one `$rules` array is reused for store and update, so `unique:branches,code` compares a row against itself. Proven in `tests/Feature/MasterResourceTest.php`. Fixed in Node only.

### Deliberate divergences (Node is stricter; never the reverse)

| | Laravel | Node |
|---|---|---|
| Reset step 3 | accepts without the OTP | verifies it |
| OTP storage | stored before send | stored after send succeeds |
| JWT `required_claims` | not enforced | enforced |
| Branch rename | rejected | allowed |
| CORS | `*` | closed by default |

---

## 6. Open items

1. **§1 scope decision** — (a), (b) or (c).
2. **Production secrets.** `salary-slip-node/.env` holds dev placeholders for `APP_KEY` and `JWT_SECRET`. Until the real values are in, Node-issued tokens will not verify in PHP and `/api/profile` cannot decrypt a stored Aadhaar. **No module can cut over until this is done.**
3. **Refresh tokens.** The brief asks for them and also says never change the authentication flow. Recommendation stands: migrate on the existing single-token scheme, add refresh tokens as an isolated follow-up.
4. **Deployment target.** The documented deploy never runs `composer install`; what will run Node — PM2, systemd, Docker?
5. **The migration drift in §1** is worth resolving independently of this project.

---

## 7. What has not been done

No PHP endpoint has been switched over. No commit, no deploy. Nothing outside this repository was read or written. Production was accessed read-only, except the Module-1 verification requests which used deliberately-failing credentials so no write path executed.
