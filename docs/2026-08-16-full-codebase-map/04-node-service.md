# Node Service — `salary-slip-node` (Fastify + Prisma + TypeScript)

## Executive summary

`salary-slip-node` is an **actively-developed, test-covered "strangler-fig" rewrite of `salary-slip-bac`**, built to replace Laravel's endpoints one module at a time. It connects to **the same production Postgres database** (`niss_hrms`) that Laravel uses — it is not a proxy, does not make HTTP calls to Laravel, and is not a separate/syncing database. `src/lib/laravel/**` is a set of byte-compatible reimplementations of Laravel's own crypto/hash/JWT primitives (so each backend can read tokens and encrypted columns the other wrote), not an API client.

- Last commit touching this directory: **2026-08-11** — actively developed, most recent of a run of commits from 2026-08-03 onward.
- Schema is explicitly **Laravel-owned**: `src/db/client.ts` states `prisma migrate`/`db push` must never run against this database; Node is read/write only.
- **Whether this service currently receives live production traffic could not be confirmed from this repo** — code comments describe an intended reverse-proxy routing setup ("Migrated modules mount here... anything not listed reaches Laravel through the reverse proxy"), but no nginx/proxy config exists in this checkout. If it is live anywhere, it can only affect the F: drive dev/LAN Postgres deployment — the separate AWS `niss.pro` SQLite deployment is unrelated (per prior project memory) and this service is hardcoded to Postgres.

## Modules (`src/modules/**`)

| Module | Routes / role | Notes |
|---|---|---|
| `auth` | `/api/login`, `/api/profile`, `/api/logout`, password-reset OTP flow, `/api/new-emp_code`, `/api/change-password`, `/api/check-emp-code/:code`, `/api/register` | **Deliberate fix vs. PHP**: password-reset step 3 re-verifies the OTP; Laravel's equivalent doesn't (a proven vulnerability per `PasswordResetOtpTest.php`). |
| `authorization` | `/api/v1/authorization/check`, `/check-batch` | Reimplements the ABAC/RBAC decision engine (tenant isolation → direct/role/temporary grants → ABAC policies → explicit-deny-wins → default-deny), decision-logged. The admin-facing management surface (simulate, roles, matrix) was explicitly **not** ported — decision-only here. |
| `employees` | Full CRUD, import, path-for-path with Laravel's `UserController` | **Fixes a real production bug**: PHP's list-scoping exempts role 1 from company scoping while `show()` still 404s cross-company — documented here as "treated as a bug rather than reproduced." Import scoping also fixed vs. PHP's unscoped bank-detail update. |
| `profile` | `/api/dashboard` | **Fixes**: scopes salary-slip lookups to the caller's company; PHP's equivalent is unscoped (a latent cross-company leak if `emp_code` is ever reused). |
| `agents` | Agent CRUD | **Fixes**: update/delete scoped by company; PHP's equivalent has no scoping at all (cross-company agent takeover in production). |
| `trialforms` | Trial-form CRUD | Protected-field allowlist (blocks edits to role/password/company_code/etc.), same as Laravel's. |
| `provisioning` | shared service, not a route module | Resolves numeric tier → canonical role code, replaces identity role, links company. Code explicitly notes a schema-drift workaround (raw SQL because the generated Prisma client describes a richer `companies` table than actually exists). |
| `shifts` | Shift CRUD + assignment, `/api/rbac/settings` | Permission gates default to `whenUnknown: 'defer'` because `hr.shift.*` codes don't exist in the catalogue yet. |
| `settings` | mounted under `shifts.routes.ts` | Sparse key/value store — only overridden settings exist as rows, merged with `SETTING_DEFAULTS`. |
| `users` | not a route module | Shared serializer reproducing Laravel's `User::toArray()` exactly, including its **denylist** (not allowlist) of sensitive fields — explicitly flagged in-code as a maintenance risk: a newly added sensitive column is exposed by default until added to the denylist. |

## Compatibility layer (`src/lib/laravel/**`)

Wire-compatible reimplementations, not an HTTP client: `crypt.ts` (AES-256-CBC + HMAC, matches `Illuminate\Encryption\Encrypter`, verified against PHP-generated fixtures), `hash.ts` (bcrypt, `$2y$`-compatible), `jwt.ts` (tymon/jwt-auth compatible, explicitly bidirectional — Node must accept PHP-issued tokens up to 30 days old and vice versa), `aadhaar.ts` (must stay byte-identical to Laravel's `AadhaarReference` or S3 document folders orphan), `time.ts` (Postgres `time` column string formatting to match PDO's behavior).

## Shared infra (`src/lib/{audit,excel,mail,storage}`)

`audit/` writes to the **same `audit_logs` table Laravel writes to**, so the RBAC audit screen shows one continuous history across both backends. `storage/public-disk.ts` writes into Laravel's `storage/app/public` disk layout with matching filename conventions so uploads from either backend are interchangeable.

## Relationship to the rest of the system

- Shares the `niss_hrms` Postgres database with Laravel — same rows, same source of truth, no sync job.
- The React frontend calls relative `/api/*` paths and is unaware of which backend answers.
- **Laravel and Node currently give different (and inconsistent) authorization answers for the same actions** in several modules, because Node has independently fixed cross-tenant/cross-company scoping bugs that Laravel's equivalent endpoints still have. This matters if both backends can serve live traffic simultaneously — see file 06.

## Follow-up recommended

Confirm with the user or check infra outside this repo (reverse-proxy/nginx config on the LAN host) whether this service is actually receiving any live traffic today — this determines whether the Node-vs-Laravel authorization divergence is a real, currently-exploitable inconsistency or a dormant one.
