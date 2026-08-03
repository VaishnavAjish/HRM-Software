# Salary Slip Node API (`salary-slip-node/`)

Last verified against source: 2026-08-03.

An incremental replacement for the Laravel backend (`salary-slip-bac/`).
Modules are ported one at a time; `src/app.ts` is the single place a ported
module becomes reachable.

## Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Runtime | Node.js | >= 20 |
| Framework | Fastify | 5.2 |
| Language | TypeScript | 5.9 (ESM) |
| ORM | Prisma | 6.19 |
| Database | PostgreSQL | - |
| Validation | Zod | 3.24 |
| Auth | jsonwebtoken + bcryptjs | - |
| Excel | xlsx (SheetJS) | 0.20 |
| Email | nodemailer | 9 |
| Logging | pino | 9 |
| Security | @fastify/helmet, cors, rate-limit, multipart | - |
| Testing | Vitest | 3 |
| Dev runner | tsx | 4 |

Default port 8001 (`PORT`), host `0.0.0.0`.

---

## Why It Exists

The Laravel app is being replaced route by route rather than in one cut. Both
backends must therefore accept the same tokens, produce the same hashes and read
the same encrypted columns. `src/lib/laravel/` reimplements those semantics:

| File | Reimplements |
|------|--------------|
| `hash.ts` | Laravel bcrypt hashing/verification |
| `jwt.ts` | tymon/jwt-auth token issuance and verification |
| `crypt.ts` | Laravel `Crypt` (AES-256-CBC with the app key) |
| `aadhaar.ts` | Aadhaar reference derivation and log redaction |
| `time.ts` | Laravel date/time coercion |
| `compat.test.ts` | Cross-checks the above against PHP-generated fixtures |

---

## Configuration (`src/config/env.ts`)

Zod-validated at boot; the process refuses to start on a bad value rather than
failing deep inside a request.

| Key | Constraint |
|-----|-----------|
| `APP_KEY` | Must decode to 32 bytes. Must match Laravel's, or every `encrypted_aadhaar_number` becomes unreadable — per row, not at boot |
| `JWT_SECRET` | Must match Laravel's, or issued tokens stop verifying |
| `JWT_TTL` | Minutes, default 43200 (30 days) |
| `AADHAAR_REFERENCE_SECRET` | Permanent data, not a rotatable credential — changing it orphans every existing document folder |
| `DATABASE_URL` | Required |
| `MAIL_MAILER` | `smtp` \| `log`; defaults to `log` so a dev machine cannot email real employees |
| `CORS_ORIGINS`, `PORT`, `HOST`, `LOG_LEVEL`, `NODE_ENV` | |

---

## Directory Structure

```
salary-slip-node/
+-- src/
|   +-- server.ts                   # Binds the port
|   +-- app.ts                      # App factory; mounts modules
|   +-- config/env.ts               # Zod-validated configuration
|   +-- db/client.ts                # Prisma client
|   +-- lib/
|   |   +-- laravel/                # hash, jwt, crypt, aadhaar, time, compat
|   |   +-- audit/                  # audit-logger, audit.repository
|   |   +-- excel/sheet-reader.ts
|   |   +-- mail/                   # mailer, otp-template
|   |   +-- storage/public-disk.ts
|   +-- modules/
|   |   +-- auth/                   # auth, account, identity, password reset,
|   |   |                           # guards, token blacklist
|   |   +-- employees/              # routes, service, repository,
|   |   |                           # import service/transforms/repository
|   |   +-- authorization/          # engine, condition evaluator,
|   |   |                           # scope matcher, row/field security,
|   |   |                           # matrix service, enforcement,
|   |   |                           # schema readiness, legacy mapping
|   |   +-- agents/ masters/ shifts/ trialforms/ profile/ settings/ users/
|   +-- generated/prisma/           # Generated client (committed)
+-- prisma/
|   +-- schema.prisma
|   +-- sql/                        # Hand-written migrations, up + down
+-- scripts/                        # 27 operational scripts
+-- tests/fixtures/                 # PHP-generated parity fixtures
```

---

## Mounted Modules

`src/app.ts` registers, in order: auth, masters, shifts, employees,
authorization, agents, trial forms, profile.

| Module | Routes |
|--------|--------|
| auth | `POST /api/new-emp_code`, `/api/new-email`, `/api/new-email-otp`, `/api/new-password` |
| profile | `GET /api/profile` |
| employees | `GET /api/employee/get`, `/show/:id`, `/import-columns`; `POST /api/employee/store`, `/import`, `/import-account-detail`, `/delete-multiple`; `PUT /api/employee/edit/:id`; `GET /api/employee/delete/:id` |
| agents | `GET /api/agents`, `/api/agent/candidates`; `PUT/DELETE /api/agents/:id`; `GET /api/appointment/check-emp-code`; `POST /api/appointment/create-account` |
| trialforms | `GET /api/trial-form/list`, `POST /api/trial-form/store` |
| shifts | `GET /api/shifts/get`, `POST /api/shifts/store`, `PUT /api/shifts/update/:id`, `POST /api/shifts/assign` |
| authorization | `POST /api/v1/authorization/check`, `/check-batch` |
| settings | `GET/PUT /api/rbac/settings` |

Paths mirror the Laravel routes exactly so the frontend needs no change when a
module is switched over.

The authorization module previously also served `/v1/authorization/simulate`,
`/v1/roles`, the permission matrix, role cloning, `/v1/scopes/:type/options` and
`/v1/users/:id/effective-permissions`. Those were removed with the Access
Control console, together with `matrix.service.ts`, so a cutover cannot restore
the feature. `/v1/scopes/:type/options` also read `branches`, `locations` and
`teams`, which no longer exist.

---

## Authorization

A second implementation of the same engine as `salary-slip-bac`:

| File | Role |
|------|------|
| `authorization.engine.ts` | Decision resolution |
| `condition.evaluator.ts` | Policy condition evaluation |
| `scope.matcher.ts` | Company / unit / branch scope matching |
| `row-security.ts`, `field-security.ts` | Row and field filtering |
| `enforcement.ts` | Route-level enforcement helpers |
| `schema-readiness.ts` | Probes tables and columns before enabling the engine |
| `migration/legacy-mapping.ts` | Maps legacy permission keys to canonical codes |

---

## Schema Ownership

`prisma/sql/` holds hand-written up/down migrations that own the production
`authorization_*` schema:

| Migration | Contents |
|-----------|----------|
| `0001_authorization_platform` | The 11 `authorization_*` tables |
| `0002_sensitive_permissions` | Sensitive permission catalogue entries |
| `0003_php_authz_parity` | 18 columns the PHP code referenced that production lacked |
| `0004_authorization_feature_flag_defaults` | Feature flag defaults |

They are tracked in the `_authz_migrations` table, **not** Laravel's
`migrations` table, and are applied and rolled back with
`scripts/authz-migrate.ts`. `_pre_authz_*` snapshot tables serve as backup.

The same 11 tables are also defined by
`salary-slip-bac/database/migrations/2026_08_03_000001_create_enterprise_authorization_platform.php`,
which the PHP models and controllers were written against. 23 differences remain
deliberately (nullability, `VARCHAR(500)` vs `TEXT`, four index names).

Do not run `php artisan migrate:rollback` on that batch: its `down()` drops
`roles_tenant_status_index`, which production has as `roles_tenant_status_idx`,
so it fails *after* dropping all eleven tables. Use
`scripts/authz-migrate.ts down <id> --confirm`.

See `INCIDENT-2026-08-03-authz-rollback.md` and
`REMEDIATION-authz-rollback.md`.

---

## Scripts (`scripts/`, 27 files)

| Group | Scripts |
|-------|---------|
| Migration | `authz-migrate`, `authz-backup`, `authz-check`, `authz-data-migrate`, `authz-emergency-rollback`, `authz-structure-diff`, `authz-now`, `migration-drift`, `migration-graph.test` |
| Parity | `parity-check`, `employee-list-parity`, `generate-fixtures.php`, `generate-import-vectors.php` |
| Inspection | `db-smoke`, `cache-peek`, `dv-columns`, `folder-shape`, `folder-origin`, `module2-peek`, `company-dist`, `employee-values` |
| Audit | `full-audit`, `drift-analyse`, `permission-coverage`, `prod-verify`, `aadhaar-state`, `documents-state` |
| Utility | `emit-token` |

`npm run parity` runs `parity-check.ts`, which proves the Laravel compatibility
layer against real data rather than fixtures alone.

---

## Security

| Concern | Handling |
|---------|----------|
| Headers | `@fastify/helmet` |
| CORS | `@fastify/cors` from `CORS_ORIGINS` |
| Rate limiting | `@fastify/rate-limit` |
| Uploads | `@fastify/multipart` |
| Token revocation | `token-blacklist.ts` |
| Log redaction | pino `redact` on `req.headers.authorization`, `req.headers.cookie`, `req.body.password`, `req.body.aadhar_card_no`; the error serializer runs `redact()` over messages and drops stacks in production |
| Audit | `AuditLogger` with a Prisma sink |

---

## Testing

23 Vitest suites covering auth routes and services, account and password reset,
employees and the import pipeline (`import.parity`, `import.transforms`,
`import.service`), the authorization engine, condition evaluator, scope matcher,
schema readiness (integration), security, agents, masters, trial forms,
dashboard, mailer, and the Laravel compatibility layer (`compat`, `jwt`).

```bash
npm run dev         # tsx watch
npm run build       # tsc
npm start           # node dist/server.js
npm test            # vitest run
npm run typecheck
npm run parity      # parity-check against the PHP implementation
```
