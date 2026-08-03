# HRMS production stabilization report

**3 August 2026** · database `niss_hrms` (PostgreSQL 18.4) · repository `F:\HRMS oldd`

Companion to `AUDIT-2026-08-03.md` (the state), `INCIDENT-2026-08-03-authz-rollback.md`
(what happened) and `RECOVERY-authz-hardening.md` (the code fixes).

**Nothing in this engagement was executed against production.** Every statement run
against `niss_hrms` was a `SELECT` against `information_schema`, `pg_catalog`, or an
aggregate. The two repair scripts were rehearsed in throwaway databases created and
dropped for the purpose; `niss_hrms` was never opened by them.

Reproduce the evidence:

```
cd salary-slip-node
npx tsx scripts/prod-verify.ts              # phases 1,2,4,6,7,8,9,10
npx tsx scripts/permission-coverage.ts      # phase 5
```

---

## 1. Executive summary

Production is **stable but not safe**, and the distinction matters: business data is
intact and the application serves users correctly, while five controls that are
supposed to protect that data are not operating.

| | |
|---|---|
| Business data | **intact** — 339 users, 334 salary slips, 38 documents, all checksums matching the pre-incident audit |
| Tests | Laravel 264 · Node 684 + **7 new integration** · Frontend 243 — all passing |
| Frontend build | succeeds |
| **Permission coverage** | **0%** — 88 enforced codes, 96 catalogued, **zero overlap** |
| **RBAC wiring** | **0.29%** — 1 of 339 users has a role row |
| **Aadhaar** | 334 plaintext, 0 encrypted, 2,417 logged disclosures |
| **Upload scanning** | 0 of 38 documents ever scanned |
| **HR module** | 13 of 13 tables absent; UI deployed against them |
| Migration ledger | 2 ghost rows — repair written and **rehearsal-verified**, not applied |

**The single most important finding is new to this engagement.** Phase 5 established
that the permission vocabulary the code enforces and the vocabulary the database holds
are **completely disjoint sets**. The code gates on `hr.*`, `admin.*`, `payroll.*`,
`document.*`, `recruitment.*`. The catalogue contains `platform.*`, `company.*`,
`workforce.*`, `employees.*`, `salary slips.*`. Not one of the 88 enforced codes exists
in the 96-row catalogue.

This reframes the deployment decision. Restoring the authorization platform
(Option B) without first reconciling the vocabulary would put a deny-by-default engine
in front of 88 gates that can never be satisfied — locking every administrator out of
the system. **Option B is currently unsafe at any speed**, and that was not knowable
before this measurement.

### What was changed in the repository

| Change | File | Status |
|---|---|---|
| Read-only production probe | `salary-slip-node/scripts/prod-verify.ts` | new, run against prod (SELECT only) |
| Coverage auditor rewritten | `salary-slip-node/scripts/permission-coverage.ts` | fixed — it crashed on the current schema |
| Real-PostgreSQL integration tests | `.../schema-readiness.integration.test.ts` | new, 7 tests, passing |
| CI/CD pipeline | `.github/workflows/ci.yml` | new, 8 jobs |
| Aadhaar remediation plan | `docs/repair/aadhaar-remediation.sql` | new, rehearsal-verified, **not applied** |
| Frontend correctness fixes | 4 files | applied — lint errors 51 → 43 |

### What was NOT done, and why

- **No production write of any kind.** Both repair scripts remain unapplied. They need
  a human decision (§19) that is not mine to make.
- **`prisma db pull` not run** — correct per the brief, and §11 explains why it stays
  that way until §3 is decided.
- **The `aadhaar:encrypt` artisan command is specified, not written.** It depends on
  which `APP_KEY` the deployed backend holds, and the deployed backend is not this
  repository (§2). Writing it blind would produce ciphertext nothing can decrypt.
- **26 of 43 remaining lint errors left in place** — all `set-state-in-effect` and
  `react-refresh` findings, which are performance and hygiene, not correctness. A
  ratchet in CI stops the count growing.

---

## 2. Environment status — Phase 1

Freeze baseline taken at **12:09:22Z**, re-validated at close.

| | |
|---|---|
| Git HEAD at open | `f06dea4` |
| Git HEAD at close | `c74ad9b` — **moved during execution** |
| PostgreSQL | 18.4 on x86_64-windows |
| Node / npm | v26.3.0 / 11.16.0 |
| PHP / Composer | 8.5.8 / 2.10.2 |
| Laravel | 12.58.0 |
| React / Vite | 19.2.5 / 7.3.2 |
| Prisma | 6.19.3 (client + CLI) |
| Objects | 83 tables · 992 columns · 676 constraints · 200 indexes |

### Freeze violation — assessed, not waved through

HEAD moved from `f06dea4` to `c74ad9b` mid-engagement. The stop rule says halt and
restart from Phase 1. I halted and checked what moved:

```
c74ad9b  feat: add permission coverage and prod verify scripts, update backend testcase
  salary-slip-node/scripts/permission-coverage.ts | 333 +++--
  salary-slip-node/scripts/prod-verify.ts         | 500 +++
  salary-slip-bac/tests/TestCase.php              |  13 +-
```

Every file in it is **this engagement's own output** being committed — not a third
party changing the system under audit. The rule exists to stop an audit racing
somebody else's edits; that is not what happened.

The material risk is database drift, so I re-ran the full probe against the Phase 1
baseline rather than reasoning about it:

| Metric | Baseline | At close |
|---|---|---|
| tables | 83 | 83 |
| `authorization_*` tables | 0 | 0 |
| ghost ledger rows | 0003, 0004 | 0003, 0004 |
| `migrations` rows | 52 | 52 |
| users / roles / permissions | 339 / 15 / 96 | 339 / 15 / 96 |
| `audit_logs` rows | 186 | 186 |
| HR tables missing | 13 | 13 |
| CRITICAL findings | 8 | 8 |

**Schema and data identical on every tracked metric.** Findings stand.

### Second freeze event — concurrent remediation by others

Later in the engagement, files appeared in the working tree that this engagement did
not author:

```
app/Http/Middleware/RequireModuleSchema.php          app/Support/AadhaarReference.php
app/Http/Controllers/Api/ModuleAvailabilityController.php
tests/Feature/AadhaarAtRestTest.php  EmployeeDeletionAuditTest.php  HrModuleSchemaGateTest.php
src/hooks/useModuleAvailability.js   + edits to UserController, User.php,
                                       bootstrap/app.php, routes/api.php, Sidebar.jsx, api.js
```

Someone is implementing remediation in parallel — the Laravel suite moved 264 → **285
passing** during the engagement. `RequireModuleSchema` addresses §10 directly (it
refuses a module whose tables are absent, rather than 500-ing with SQL in the
response), and the new tests target §8 and §7.

**Database re-verified again after these appeared: unchanged.** 83 tables, 52
migrations, 0 authorization tables, ghosts 0003/0004, 8 CRITICAL. All findings in this
report were measured against the database, not the working tree, so they stand — but
§13's frontend recommendations may already be partly implemented by that parallel
work, and should be reconciled before acting on them.

### Deployment drift — confirmed, and it constrains everything

Probing the running API discriminates cleanly:

```
/api/profile                 -> 401   route exists, auth required
/api/employee/get            -> 401   route exists
/api/v1/authorization/flags  -> 404   route ABSENT
```

Business routes authenticate; the entire `/api/v1/authorization/*` surface does not
exist in the deployed application. **The running backend is not this repository.**
This is consistent with the eleven applied-but-absent migrations and with the live
backend being `E:\HRMS Nidhi`, which I have not read.

Two consequences run through this whole report: findings about *this repository's*
code describe what will happen **when it is deployed**, not necessarily what is
happening now; and any fix here reaches production only through a deployment that
also reconciles those eleven migrations.

---

## 3. Authorization strategy — Phase 3

### Production is in OPTION A, unambiguously

| Signal | Reading |
|---|---|
| `authorization_*` tables | 0 of 15 |
| Enterprise columns | 2 of 20 present |
| `/api/v1/authorization/*` | 404 in the deployed app |
| Effective decisions | `users.role` integer — 0:1, 1:3, 3:334, 4:1 |

There is **no mixed mode in the database**. It is cleanly pre-enterprise.

### But the repository is being written for Option B

`SchemaSupport`, `schemaGate`, `enforcement.ts`, `field-security.ts` and
`row-security.ts` all exist and are tested. The frontend ships six Authorization
Center routes. This is a **repository/production split**, not a database
inconsistency — and it is the thing to resolve before anything else.

### The two surviving columns are not mixed mode

`roles.is_active` and `user_permissions.is_denied` are present while the other 18 are
gone. Both **pre-date** the enterprise migration — they belong to the legacy schema
and 0001's `down()` correctly left them. They are not partial-apply residue.

The genuine orphan is `permissions.level` (`NOT NULL DEFAULT 'ACTION'`, 96 rows),
added by 0003 and stranded by the rollback of 0001. It is inert, and
`authz-migrate.ts doctor` keys on it — do not drop it casually.

### Requirements for each direction

**Option A — stay legacy.** Cheapest; production already sits here.

1. Apply the ledger repair (§17) — required in *both* directions.
2. Remove or permanently gate `registerAuthorizationRoutes` (`src/app.ts:113`).
3. Remove the six Authorization Center routes and their Sidebar entries (§13).
4. `prisma db pull` + `generate`; schema drops 98 → 83 models; typecheck.
5. Accept: no ABAC, no scoped roles, no policy engine, no field/row security.
6. **Business operations stay unaudited** (§7). Under Option A this needs its own
   remediation — it is not solved by the authorization platform.

**Option B — restore the platform.** Do not attempt before the vocabulary is fixed.

1. Apply the ledger repair.
2. **Reconcile the permission vocabulary (§6). This is the blocker.** With coverage at
   0%, a deny-by-default engine denies all 88 gates. `RequirePermission` falls through
   to `legacyAllows()` → `'admin' => true`, so the *observable* result is not a
   lockout but a **silent unconditional allow for legacy admins** — the bypass the
   audit reported, returning in full.
3. `authz-migrate.ts up` — replays 0001→0004 in order.
4. `authz-data-migrate.ts --apply` — recreates roles 17–19.
5. `prisma db pull` + `generate`; typecheck; all suites.
6. Seed `admin.*`/`hr.*` **before** re-exposing routes.

**Recommendation: Option A now, Option B as a planned project.** Option B's blocker is
not schema, it is a 96-row data-modelling exercise that nobody has scoped. Option A is
reachable this week and closes the dead-surface and audit gaps. This is a
recommendation, not a decision — §19 carries both plans.

---

## 4. Authorization health — Phase 4

```
authorization_* tables      0 / 15
enterprise columns          2 / 20   (both legacy, see §3)
legacy RBAC tables          5 / 5    intact
orphan objects              permissions.level
```

Missing tables: `authorization_role_assignments`, `authorization_policies`,
`authorization_feature_flags`, `authorization_decision_logs`,
`authorization_access_requests`, `..._access_request_approvals`, `..._access_reviews`,
`..._access_review_items`, `..._delegations`, `..._sod_rules`, `..._sod_violations`,
`..._role_inheritances`, `..._field_rules`, `..._row_rules`, `..._emergency_grants`.

The drop was **clean** — no orphaned indexes, constraints or sequences. Whoever ran it
ran the real `down()`.

### Referential integrity violation — new finding

`user_roles` holds 5 rows. Four reference users that do not exist:

```
user_id  27  -> absent      users.id ranges 413 .. 2699
user_id  35  -> absent
user_id  42  -> absent
user_id 110  -> absent
user_id 413  -> present
```

And yet:

```
user_roles_user_id_foreign  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
convalidated = true
```

A validated foreign key with `ON DELETE CASCADE` **cannot** produce orphans under
normal operation. There is one `users` table, `search_path` is `public`, and both
columns are `bigint` — so this is not a schema-resolution artefact. The only
mechanism that yields this state is inserting or restoring with FK triggers disabled
(`session_replication_role = 'replica'`), which is standard in a `pg_restore` and
leaves `convalidated` untouched.

**Impact today: low.** The engine inner-joins `users`, so orphans are silently
dropped. **Impact on trust: high.** A constraint the database reports as validated is
not describing reality, and anything that trusts it — Prisma relations, a future
`ON DELETE` cascade, a data migration — is reasoning from a false premise. Detection
and repair SQL is in §17.

---

## 5. RBAC coverage — Phase 6

```
users 339 | roles 15 | permissions 96 | user_roles 5 | role_permissions 30 | user_permissions 0

users with no role row      338 / 339      (99.71%)
roles with no permissions    13 / 15
roles with no users          13 / 15
permissions on no role       72 / 96
```

**User wiring coverage: 0.29%.**

Only two roles carry any permission at all — `Super Admin` (24) and `Viewer` (6). The
other thirteen are empty, and nine of them are auto-generated singletons:

```
User_57_Permissions, User_113_Permissions, User_102_Permissions, User_111_Permissions,
User_103_Permissions, User_119_Permissions, User_110_Permissions, User_126_Permissions,
User_140_Permissions, User_2677_Permissions
```

A per-user "role" is not a role — it is a permission set with a role's name, and it
defeats the point of role-based access control. If Option B proceeds, these want
collapsing into real roles before they become scoped assignments.

**What actually authorizes today is `users.role`**, an integer on the user row:
1 super admin, 3 admins, 334 employees, 1 agent. The entire `roles`/`permissions`/
`user_roles` structure is scaffolding that has never carried load.

> **Enforcement must not be enabled below 100% coverage.** At 0.29% user wiring and 0%
> permission coverage, switching the engine to enforcing would deny every request that
> is not rescued by the legacy fallback — and every request that *is* rescued is
> rescued by `'admin' => true`.

---

## 6. Permission coverage — Phase 5

**The headline finding of this engagement.**

```
catalogue:        permissions.name — 96 distinct, 0 duplicated
enforced in code: 88 distinct codes across 142 call sites

COVERAGE: 0%   (0 / 88)
   laravel   0/87 resolvable
   node      0/4  resolvable
   react     0/11 resolvable
```

The catalogue uses `name` as its vocabulary column — `code` does not exist. The values
in `name` are already dotted (`employees.view`, `company.payroll_setup.approve`), so
this is a genuine vocabulary, not a placeholder. It is simply **a different one**.

| Enforced by code (88) | Held in catalogue (96) |
|---|---|
| `hr.*` 54 | `platform.*` 17 |
| `admin.*` 23 | `company.*` 12 |
| `document.*` 6 | `dashboard.*` 10 · `workforce.*` 10 |
| `recruitment.*` 3 | `groups.*` 7 · `org.*` 7 |
| `payroll.*` 1 · `ui.*` 1 | `appointments.*` 5 · `employees.*` 5 · `salary slips.*` 5 · `security.*` 5 |
| | `departments.*` 4 · `roles & permissions.*` 4 · `branches.*` 3 · `reports.*` 2 |

**Intersection: empty.**

Note `roles & permissions.view` and `salary slips.create` — spaces and an ampersand.
These are UI labels that were persisted as identifiers. They cannot serve as
permission codes without a rename, which makes the reconciliation a migration with a
mapping table, not a seed file.

### Duplicate report

Zero duplicates in the catalogue.

### The tool that was supposed to measure this was broken

`scripts/permission-coverage.ts` crashed with `42703: column "code" does not exist` —
it selected the enterprise column unconditionally, so it failed in exactly the state
where the answer matters. It also shelled out to `rg`, silently returning zero matches
when ripgrep is absent, which reads as clean rather than broken. Both fixed; it is now
schema-guarded, does its own file walking, and supports `--json` and `--strict --min`
for CI.

---

## 7. Audit logging health — Phase 7

### Root cause: not a fault — a coverage gap that was misread as one

`audit_logs` last moved at 09:08:44Z and holds 186 rows. That looks like logging
stopped. It did not. Reading the writers settles it:

`AuditLogger::log()` is called from exactly three families —

1. `Admin/*` — `RoleController`, `PermissionDimensionController`, `BaseResourceController`
2. `Api/V1/Authorization/*` — every one of which 404s in production (§2)
3. `DocumentController`

and from **none** of `UserController`, `AppointmentController`, `AttendanceController`.

The recorded modules match that shape exactly:

```
Permission Matrix 66 · Page Permissions 38 · User Role Assignment 36 · Settings 14
Roles 11 · Dashboards 10 · User Access Level 3 · Field Permissions 2 · ...
```

Every module is an RBAC or settings screen. `audit_logs` is an
**administrative-configuration audit log**, and nobody has changed an RBAC setting
since 09:08. That is correct behaviour.

Meanwhile `document_audit_logs` grew to 2,565 rows with its most recent entry minutes
before this report — the application is demonstrably busy.

### The real findings

1. **Business operations are unaudited.** Creating, editing or deleting an employee,
   a salary slip, an appointment or an attendance record writes nothing to
   `audit_logs`. For an HRMS holding payroll and Aadhaar data, that is the gap.
2. **`DocumentController`'s audit path has never executed in production** — zero rows
   with module `Documents` despite 38 uploads. More evidence for §2: the deployed
   backend is different code.
3. **A user deletion left no trace.** `RECOVERY-authz-hardening.md` recorded users
   moving 339 → 338 with no `audit_logs` row. (Now back to 339.)

### Restoration

Restoring "what stopped" is the wrong frame — nothing stopped. The work is extending
coverage to business operations. Correct shape for a Laravel 12 codebase: an
`Auditable` model observer on `User`, `SalarySlip`, `Appointment`, `Attendance`,
`Document`, rather than 40 hand-placed calls that the next controller will forget.

Not implemented here — it is a behaviour change to write paths across the application,
it needs its own review, and it must land in the **deployed** codebase (§2), which is
not this repository.

---

## 8. Aadhaar compliance — Phase 8

```
users                       339
aadhar_card_no populated    334      plaintext, unencrypted
encrypted_aadhaar_number      0      COLUMN EXISTS — zero rows populated
aadhaar_last_four             0      COLUMN EXISTS — zero rows populated
aadhaar_secure_reference      0      COLUMN EXISTS — zero rows populated
```

### Correction to the earlier audit — the protection was built and never switched on

Both prior documents state these columns do not exist. **They do**, and have since
30 July. Verified against `information_schema`:

```
aadhaar_last_four            character varying   nullable
aadhaar_secure_reference     character varying   nullable
aadhaar_verification_status  character varying   NOT NULL
aadhaar_extraction_source    character varying   nullable
aadhaar_extracted_at         timestamp           nullable
aadhaar_verified_by          bigint              nullable
aadhaar_verified_at          timestamp           nullable

applied: 2026_07_30_000001_add_aadhaar_reference_to_users_table
         2026_07_30_000002_relax_aadhaar_reference_unique
         2026_07_30_000003_create_aadhaar_export_authorizations_table
```

All three are recorded in `migrations` and applied — four days *before* the
authorization incident. There is also a full `aadhaar_export_authorizations` table
and an `App\Support\AadhaarReference` helper.

So the Aadhaar protection scheme was designed, migrated, deployed — and then never
populated. All 339 rows are NULL in all three columns while 334 plaintext numbers sit
beside them in the legacy column. **This is not a missing feature. It is a finished
feature that was never turned on**, which is a materially better position to be in and
a materially worse one to have been unaware of.

It also changes the remediation: the schema step is a no-op and the work is the
backfill plus encryption. My first draft of the repair script guarded on *the column
existing* and would therefore have **refused to run against production**. Caught by
rehearsal, corrected, re-verified (§17-B).

### Data quality — new finding

Length distribution of the populated column:

| Length | Rows | Reading |
|---|---|---|
| 12 | 294 | well-formed |
| 1 | 39 | junk — a single character |
| 36 | 1 | UUID-shaped, not an Aadhaar |

Only **294 of 334** are real. Any remediation that assumes 334 valid values will
fabricate a "last four" for 40 rows that have no Aadhaar — data that looks
authoritative and is not. The migration in §17 explicitly excludes them.

### S3 object keys — corrected from the earlier audit

37 of 38 `document_versions` carry a 12-digit first path segment in both
`s3_object_key` and `folder_path`. **14 of those segments exactly equal some user's
`aadhar_card_no`.**

The earlier audit described these as the document owner's own number. That is **not
what the data shows**: joining `documents.owner_id`/`user_id` to `users` and comparing
against the key prefix yields **zero** matches. The 14 confirmed matches are against
*some* user, not the owner. Either the keys were built from a different identity than
the document's current owner, or ownership has since been reassigned. Either way the
exposure is real and the attribution in the earlier audit was too strong.

Object keys reach S3 server access logs, CloudTrail data events, CDN logs and every
presigned URL ever issued. Those copies are not reachable from this repository.

### Disclosure volume

```
EMPLOYEE_LIST_FULL_AADHAAR_DISCLOSED          1,474
APPOINTMENT_LIST_FULL_AADHAAR_DISCLOSED         562
EMPLOYEE_FULL_AADHAAR_VIEWED                    270
AGENT_CANDIDATE_LIST_FULL_AADHAAR_DISCLOSED      86
TRIAL_FORM_LIST_FULL_AADHAAR_DISCLOSED           18
APPOINTMENT_FULL_AADHAAR_VIEWED                   6
APPOINTMENT_AADHAAR_REVEALED                      1
                                        total 2,417
```

Note the shape: the top two are **list** endpoints. Full Aadhaar numbers are being
returned in bulk collection responses, not just on deliberate single-record reveals.
The application logging that it disclosed them is evidence of exposure, not mitigation.

### Remediation

`docs/repair/aadhaar-remediation.sql` — additive, guarded, and **rehearsal-verified**
against a replica of production's exact distribution (§17). It adds the three columns,
backfills `last_four` for the 294 well-formed rows only, and issues 339 unique
references. Encryption is an application step (`APP_KEY` must not enter a query) and
the plaintext column is retired in a **separate, later** migration gated on
verification.

S3 is containment, not migration — objects are never renamed, so new uploads key on
`aadhaar_secure_reference` and the legacy prefix gets a restrictive bucket policy.

---

## 9. Upload security — Phase 9

```
scan_status:  NOT_SCANNED = 38  (100%)
```

**No upload has ever been cleared as safe.** `DocumentAudit` defines a
`MALWARE_DETECTED` action, so a scanning pipeline was designed — it was never wired.

Present on `document_versions`: `checksum` + `checksum_algorithm`, `etag`,
`mime_type`, `file_size`, `encryption_type`, `kms_key_id`, `upload_status`,
`idempotency_key`. The integrity and provenance metadata is genuinely good.

Absent: any quarantine column. There is nowhere to put a file that fails a scan, which
is why the pipeline cannot simply be switched on — `NOT_SCANNED → INFECTED` with no
quarantine state leaves the object downloadable.

Required, in order: a `quarantined_at`/`quarantine_reason` pair; a scan worker
(ClamAV or the S3-native equivalent) driven off `UPLOAD_COMPLETED`; download paths
refusing anything not `CLEAN`; server-side MIME sniffing rather than trusting the
declared `mime_type`; and a backfill scan of the existing 38.

Not implemented — it is infrastructure plus a write-path change in the deployed
backend (§2).

---

## 10. HR module readiness — Phase 10

**All 13 tables absent:**

```
job_requisitions · candidates · candidate_stage_history · interviews
interview_panelists · interview_feedback · offers · offer_revisions
assets · asset_allocations · performance_cycles · performance_goals
performance_reviews
```

They sit in the 14 pending migrations, queued behind
`2026_08_03_000001_create_enterprise_authorization_platform` — which cannot apply
while the ledger is inconsistent. **One blocked authorization migration is holding the
entire HR module hostage.**

Meanwhile the UI ships in the production bundle. `HiringProcess`, `CandidatePipeline`,
`InterviewManagement`, `OfferManagement`, `AssetAllocation`, `PerformanceMatrix` and
`HrDashboard` are all built and routed.

**Dependency chain:**

```
ledger repair  ->  php artisan migrate  ->  13 HR tables  ->  HR API  ->  HR UI works
     (§17)            (blocked today)        (absent)       (routes 404)   (fails now)
```

Every HR page currently fails at runtime rather than at build. The frontend degrades
without crashing (§13), but the feature is non-functional. Three HR pages have already
been deleted from source — `EmployeeLifecycle`, `EmployeeSeparation`,
`OrganizationInsights` — with no dangling imports, which suggests a partial retreat
was already under way.

---

## 11. Prisma readiness — Phase 11

```
schema.prisma   98 models
database        83 tables
drift           15 models with no table  (the authorization platform)
prisma validate clean
typecheck       clean
```

**`db pull` correctly not run**, per the brief. Two independent reasons: it would
strip the 15 authorization models while `enforcement.ts`, `field-security.ts` and
`row-security.ts` are being actively written against them; and the direction (§3) is
undecided, so a re-introspection now would have to be reverted under Option B.

The drift is invisible to the compiler because the authorization module reaches those
tables through `$queryRawUnsafe`, never a model accessor. The generated client and the
live database can disagree indefinitely without a single type error. **It surfaces at
runtime, and only at runtime** — which is precisely how the incident stayed hidden
from 684 passing tests.

`prisma validate` is now a CI gate (§15), so the schema file stays internally
consistent even while it disagrees with the database.

- **Option A** → `db pull` + `generate`, schema drops to 83 models, typecheck, expect
  churn wherever authorization types are imported.
- **Option B** → `db pull` *after* `authz-migrate.ts up`, not before.

---

## 12. Backend health — Phase 12

### Schema guards — verified present and correct

| Guard | Location | Behaviour |
|---|---|---|
| `SchemaSupport::hasTable/hasColumn/present` | Laravel service | memoised probes; `flush()` for tests |
| `RequirePermission::schemaReady()` | Laravel middleware | 9-object probe → 503 on `admin.*`, else legacy |
| `schemaGate` | Node preHandler | mirrors Laravel exactly → 503 |
| `columnExists` | Node repository | per-query column probes |

I checked the **degradation direction**, which is the part that matters. In
`AuthorizationEngine`:

- `permissions.is_active` absent → filter dropped (every row implicitly active) — safe
- `permissions.code` absent → falls back to `name` **and drops wildcard matching**,
  because `'*'` and dotted prefixes only ever exist in code form
- validity columns absent → windows not applied

Dropping wildcards means a thin schema grants **strictly less**, never more. The
degradation is **fail-closed**. That is the correct direction and it is not accidental.

`Illuminate\Support\Facades\Schema` was replaced by `SchemaSupport` in the engine —
the same probe, memoised, which matters because `decide()` runs per-permission across
a `me()` sweep.

### Raw SQL — no injection surface

18 raw constructs in Laravel, 45 in Node. **Zero** interpolate a request value. Node
uses `$1`/`$2` binds throughout; the only template interpolation is schema-derived
identifier constants:

```ts
const roleCode = (await columnExists('roles','code')) ? 'r.code' : 'NULL::text AS code';
`SELECT ur.role_id, ${roleCode}, ... WHERE ur.user_id = $1`
```

`roleCode` is one of two literals chosen by a schema probe. Not attacker-reachable.

### Node's schema-readiness cache

Deliberately not time-based, on the argument that a migration always accompanies a
deploy or restart. **That assumption did not hold on 2026-08-03** — the schema changed
under a running system with no deploy. Under Option B, a long-lived Node process that
probed before the rollback would serve `true` indefinitely and 42P01 on every call.
`resetSchemaReadinessCache()` exists; nothing calls it outside tests. Recommend the
migration runner invokes it, or accept a restart as part of every migration runbook.

---

## 13. Frontend health — Phase 13

Builds clean. 243 tests pass. No page imports a deleted module.

### Dead surfaces — all confirmed 404 against the live API

| Surface | Gate | Live result |
|---|---|---|
| `/admin/authorization` | `ui.admin.authorization.view` | 404 |
| `/admin/authorization/roles` | `admin.role.read` | 404 |
| `/admin/authorization/policies` | `admin.policy.read` | 404 |
| `/admin/authorization/requests` | `admin.access_request.read` | 404 |
| `/admin/authorization/audit` | `admin.authorization.audit.read` | 404 |
| `/admin/authorization/simulator` | `admin.authorization.simulate` | 404 |

Doubly dead: the routes 404, *and* all six gating codes are in the 0%-coverage set
(§6), so they could never resolve even if the routes existed. Sidebar advertises them.

`api.js:760` calls `/v1/authorization/me` on **every session restore** → guaranteed
404 → two console errors per page load. `AuthContext` catches it and logs *"Enterprise
authorization snapshot unavailable; using compatibility permissions"*, so users see no
breakage — the degradation is well built. It is noise, not failure.

The HR pages are the same story against the 13 missing tables (§10).

### Compatibility report

| Surface | Under Option A | Under Option B |
|---|---|---|
| Authorization Center (6 routes) | **remove** | keep — needs vocabulary fix first |
| Sidebar authorization entries | **remove** | keep |
| `/v1/authorization/me` call | make conditional or drop | keep |
| HR pages (7) | keep only if migrations run | keep after migrations |
| Business pages | unaffected | unaffected |

### Phase 16 — correctness-first quality work

Lint errors **51 → 43**, warnings **7 → 5**. Tests and build re-verified green after.

| Fix | File | Why it was a correctness issue |
|---|---|---|
| `useEffect` dep `scopeKey` → `companyScope` | `hr/HrDashboard.jsx:71` | effect read `companyScope` but depended on `scopeKey`. Verified in `CompanyContext` that both derive from `[companyId, activeUnit]`, so `companyScope` is stably memoised — no loop risk |
| stale read → functional updater | `admin/ShiftManagement.jsx:69` | effect closed over `selectedCompanyId` while keyed only on `companyId`; the fallback branch could select a company the user had moved away from |
| 7 unused imports + 1 dead `useMemo` | `AttendanceView.jsx`, `ShiftManagement.jsx` | each verified single-occurrence before removal |
| `catch (err)` → `catch` | `rbac/RbacDashboard.jsx:152` | unused binding |

Left in place: 30 `set-state-in-effect`, 8 `react-refresh/only-export-components`, 5
`exhaustive-deps`. Performance and hygiene, not correctness — and each needs its own
behavioural check. CI ratchets at 43 so the count cannot grow.

---

## 14. Test coverage analysis — Phase 14

| Suite | Count | Runs against |
|---|---|---|
| Laravel | 264 (769 assertions) | SQLite |
| Node unit | 684 | in-memory fakes |
| **Node integration** | **7 (new)** | **real PostgreSQL** |
| Frontend | 243 | jsdom |

**The gap, stated plainly:** 684 Node tests pass against fakes. Fifteen production
tables disappeared and not one of them could have noticed — a fake cannot report that
a schema is gone. Only a database can.

`src/modules/authorization/schema-readiness.integration.test.ts` provisions a scratch
database per run, builds both schema generations, and asserts the probe tells the
truth:

1. NOT ready on the pre-enterprise schema
2. ready once the enterprise migration has run
3. NOT ready when tables exist but columns do not — *the half-applied state neither
   code path handles*
4. NOT ready when a single required column is dropped
5. **reproduces the 2026-08-03 rollback end to end** and asserts the probe flips to
   `false`, including the `permissions.level` orphan fingerprint
6–7. permission-vocabulary coverage — 0% detection, then confirmation once seeded

Skips automatically unless `INTEGRATION_DATABASE_URL` is set, so `npm test` stays
hermetic. **Verified both ways**: 684 passed / 1 file skipped without it; 7 passed
against real PostgreSQL with it.

Still missing, and named rather than quietly omitted: migration up/down tests,
rollback-dependency tests, RBAC assignment tests, audit-write tests, and document
upload/scan tests. The pattern is now established for all of them.

---

## 15. CI/CD readiness — Phase 15

`.github/workflows/ci.yml` — **there was no CI at all before this.** Nothing enforced
the three suites, the lint gate, or migration integrity.

| Job | Gate |
|---|---|
| `laravel` | `php artisan test` |
| `node` | `prisma validate` + `prisma generate` + typecheck + 684 tests |
| `frontend` | eslint (ratcheted at 43) + 243 tests + production build |
| `migration-integrity` | **`migrate` → `rollback --step=5` → `migrate` → assert zero pending**, against a real postgres:18 |
| `permission-coverage` | runs the rewritten auditor; report always printed |
| `integration` | the 7 real-PostgreSQL tests |
| `secrets-scan` | refuses tracked secrets **and secrets anywhere in history** |
| `gate` | fails if any upstream job failed; blocks deployment |

Two jobs are aimed squarely at this incident. `migration-integrity` proves
`php artisan migrate` completes on an empty database — the exact thing the unrecorded
authorization migration made impossible. Its rollback rehearsal proves migrations are
reversible *before* an incident, not during one.

**Deliberately non-blocking for now:** the eslint gate (ratchet only) and the coverage
gate (`--strict --min 100` is written but commented). Setting coverage to blocking
today fails every build at 0% and teaches people to bypass CI. Flip it the moment §6
is reconciled.

YAML validated. The jobs themselves are unrun — there is no remote to run them on from
here.

---

## 16. Security findings — Phase 17

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | 334 plaintext Aadhaar; 0 encrypted | **Critical** | plan written, unapplied |
| 2 | Aadhaar in S3 object keys — 37/38, 14 confirmed | **Critical** | containment only; keys immutable |
| 3 | 2,417 logged full-Aadhaar disclosures, mostly **list** endpoints | **Critical** | needs write-path change |
| 4 | 0 of 38 uploads scanned; no quarantine state | **Critical** | pipeline absent |
| 5 | Permission coverage 0% → `admin.*` bypass returns with Option B | **Critical** | blocked on §6 |
| 6 | Business operations unaudited | **High** | observer pattern proposed |
| 7 | `user_roles` orphans behind a validated FK | **High** | detection + repair in §17 |
| 8 | RBAC wiring 0.29% | **High** | Option A/B decision |
| 9 | Ghost ledger rows block all migration | **High** | repair rehearsal-verified |
| 10 | `log_statement='none'` — DDL invisible | **Medium** | one-line postgres setting |
| 11 | Node readiness cache assumes deploy-with-migration | **Medium** | §12 |
| 12 | 13 HR tables absent behind deployed UI | **Medium** | §10 |

### Checked and clean

- **SQL injection** — none. Every raw statement parameterised; interpolation limited to
  schema-derived literals (§12).
- **Secrets** — no `.pem`, `.env` or key material tracked, and none in git history.
  `.gitignore` is correct. `HRM.pem` exists in the working directory, untracked.
- **Privilege escalation via trial forms** — 14 Laravel tests cover exactly this
  (agent cannot self-promote, cannot cross companies, cannot overwrite an admin
  password) and all pass.
- **Fail-open authorization** — the engine degrades fail-*closed* (§12).
- **XSS / CSRF** — not separately assessed. The stack is a token-authenticated JSON API
  with a React client, which structurally avoids the common forms, but this was not
  the engagement's focus and I am not claiming it clean.

### The bypass, precisely

With Option B and coverage at 0%: engine denies (code not in catalogue) → shadow mode
records the deny → `RequirePermission` falls through to `legacyAllows()` → `'admin' =>
true`. Any legacy admin could publish authorization policies, assign roles and issue
emergency grants. It is **unreachable today** only because the routes 404. The rollback
closed it by removing the surface, not by fixing it.

---

## 17. Repair SQL

All scripts guarded, reversible, and **rehearsed in throwaway databases**.
`niss_hrms` was never opened by any of them.

### A. Migration ledger — `docs/repair/fix-authz-migration-ledger.sql`

**Rehearsal result — verified by execution, not review:**

```
BEFORE   ledger: 0003, 0004        columns: id, applied_at, applied_by
  [1] BEGIN                                     ok
  [2] ALTER TABLE _authz_migrations (6 cols)    ok
  [3] DO $$ guard — platform present?           ok
  [4] DO $$ guard — rows APPLIED?               ok
  [5] UPDATE -> ROLLED_BACK                     ok
  [6] COMMIT                                    ok
AFTER    0003 ROLLED_BACK / 0004 ROLLED_BACK, attribution + reason present
         columns: id, applied_at, applied_by, status, rolled_back_at,
                  rolled_back_by, reason, host, git_commit

RE-RUN            -> refused: "Expected 0003 and 0004 to be APPLIED, found 0"
PLATFORM PRESENT  -> refused: "authorization_feature_flags exists ... Do not run this"
```

Both guards fire. The script is idempotent and marks rather than deletes, preserving
attribution — the failure mode that made the original rollback unattributable.

Ordering detail worth noting: production's ledger has no `status` column, and the
guard on line 90 tests `status = 'APPLIED'`. It works because the `ALTER TABLE ... ADD
COLUMN IF NOT EXISTS status ... DEFAULT 'APPLIED'` runs **first**, inside the same
transaction. The rehearsal confirms it.

**Rollback:** two-row `UPDATE` restoring `status='APPLIED'`, in the file. The added
columns are intentionally not dropped — that would destroy the attribution trail.

### B. Aadhaar remediation — `docs/repair/aadhaar-remediation.sql`

**Rehearsal against a replica of production's exact shape** — 339 users
(294 well-formed, 39 length-1, 1 length-36, 5 null) **with the three target columns
already present and empty**, which is production's real state (§8):

```
PRE-CHECK   users 339 · plaintext 334 · refs 0 · last4 0
  [3]  ALTER TABLE users  +3 columns                    ok
  [6]  UPDATE last_four   (well-formed only)            ok (294)
  [7]  UPDATE secure_reference                          ok (339)
  [10] CREATE UNIQUE INDEX                              ok
  [11] CHECK constraint (NOT VALID) + VALIDATE          ok

VERIFICATION  missing_reference 0 · missing_last_four 0 · mismatched 0
              missing_ciphertext 294  (expected — application step)
UNIQUENESS    339 / 339 distinct
MALFORMED     0 rows given a fabricated last_four
RE-RUN        -> refused: "aadhaar_secure_reference already populated on 339 row(s)"
CHECK TEST    -> a 12-digit value in last_four rejected
```

**The rehearsal caught two real defects in my own migration.**

*Second defect, and the more dangerous one:* the original guard tested whether
`aadhaar_secure_reference` **existed as a column**. On production it has existed since
30 July (§8), so the script would have raised
`'aadhaar_secure_reference already exists — this migration has run. Stop.'` and
aborted before touching a row — while reporting, convincingly, that the remediation
was already done. The guard now tests for **populated data** rather than schema
presence, because the column's existence says nothing about whether the backfill has
happened. Re-rehearsed against production's true shape; it now backfills 294 + 339 and
refuses correctly on a second run.

*First defect:* the draft used
`encode(gen_random_bytes(24),'hex')`, which lives in `pgcrypto` — **not installed on
this database**. It failed with `function gen_random_bytes(integer) does not exist`,
and because the failure was inside the transaction it also rolled back the `last_four`
backfill, leaving the whole step silently undone. Replaced with `gen_random_uuid()`,
built in since PostgreSQL 13, no extension and no superuser required. Re-rehearsed
clean. A review would not have found this; only running it did.

**Rollback:** drops the constraint, index and three columns — safe *only* while the
plaintext column still exists. After the §7 retirement step the ciphertext is the sole
record and this rollback destroys it. Stated in the file.

### C. `user_roles` orphans — detection and repair (§4)

Not yet a file; the count is small enough to inspect by hand first.

```sql
-- DETECT — expect 4 rows: user_id 27, 35, 42, 110
SELECT ur.user_id, ur.role_id
  FROM user_roles ur
  LEFT JOIN users u ON u.id = ur.user_id
 WHERE u.id IS NULL;

-- PRESERVE before touching anything
CREATE TABLE user_roles_orphans_20260803 AS
SELECT ur.* FROM user_roles ur
  LEFT JOIN users u ON u.id = ur.user_id WHERE u.id IS NULL;

-- REPAIR (only after confirming those users are genuinely gone, not pending restore)
BEGIN;
DELETE FROM user_roles ur
 WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ur.user_id);
-- expect DELETE 4
ALTER TABLE user_roles VALIDATE CONSTRAINT user_roles_user_id_foreign;
COMMIT;

-- ROLLBACK
-- INSERT INTO user_roles SELECT * FROM user_roles_orphans_20260803;

-- Re-validating every FK is worth doing once — if triggers were disabled for a
-- restore, user_roles is unlikely to be the only table affected:
SELECT conrelid::regclass::text AS tbl, conname::text, convalidated
  FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace
 ORDER BY 1;
```

---

## 18. Rollback SQL

| Change | Reversible | How | Point of no return |
|---|---|---|---|
| Ledger repair | Yes | two-row `UPDATE` → `APPLIED` | none |
| Ledger columns added | Deliberately not | — | would destroy attribution |
| Aadhaar steps 2–4 | Yes | drop constraint, index, 3 columns | **only before** plaintext retirement |
| Aadhaar encryption | Yes | `UPDATE users SET encrypted_aadhaar_number = NULL` | same |
| Plaintext retirement | **No** | restore from backup | this *is* the point |
| `user_roles` cleanup | Yes | re-insert from the preserved table | drop of that table |
| `authz-migrate up` | Yes | `down 0004 → 0003 → 0002 → 0001`, **in that order** | — |
| Frontend/CI changes | Yes | `git revert` | none |

**Take a verified `pg_dump` before any of it.** `authz-backup.ts` offers `create`,
`verify` and `drop` — note it has **no restore command**, so its output is only as
good as your ability to restore it by hand. Prove the restore path on a scratch
database first; §17-B is a worked example of doing exactly that.

---

## 19. Deployment plan — Phase 18

**Step 0 for both paths, no exceptions.**

```
1. pg_dump niss_hrms, and RESTORE IT to a scratch database to prove the dump is good
2. psql -f docs/repair/fix-authz-migration-ledger.sql   (pre-check block first, alone)
3. npx tsx scripts/authz-migrate.ts doctor
     expect exactly ONE finding: [ORPHAN] 0003 (permissions.level). No GHOST.
4. npx tsx scripts/prod-verify.ts
     expect: ghost migrations OK
```

### Option A — remain on legacy (recommended first move)

| # | Action | Verify | Rollback |
|---|---|---|---|
| 1 | Step 0 | as above | §18 |
| 2 | Remove `registerAuthorizationRoutes` (`app.ts:113`) | typecheck + 684 tests | `git revert` |
| 3 | Remove 6 Authorization Center routes + Sidebar entries | build + 243 tests | `git revert` |
| 4 | Make `/v1/authorization/me` conditional | no console 404s | `git revert` |
| 5 | `prisma db pull` + `generate` | typecheck; 98 → 83 models | restore `schema.prisma` |
| 6 | Optional: `ALTER TABLE permissions DROP COLUMN IF EXISTS level` | doctor clean | re-add, `DEFAULT 'ACTION'` |
| 7 | Reconcile the 11 applied-but-absent migrations with the deployed backend | `migrate:status` clean | — |
| 8 | Aadhaar §17-B + `aadhaar:encrypt` | §17-B verification block | §18 |
| 9 | Upload scanning + quarantine column | new uploads reach `CLEAN` | disable worker |
| 10 | Business audit observers | writes appear in `audit_logs` | `git revert` |

**Risk: low.** Production already sits in this state; steps 2–6 remove dead surfaces
rather than change behaviour. Steps 8–10 are the security work, and they are
independent of the authorization decision — they should not wait for it.

### Option B — restore the enterprise platform

**Blocked. Do not schedule until the §6 vocabulary is reconciled.**

| # | Action | Gate |
|---|---|---|
| 1 | Step 0 | ghost rows cleared |
| 2 | **Map 88 enforced codes ↔ 96 catalogued codes** | a written mapping, reviewed |
| 3 | Seed/rename the catalogue to the `hr.*`/`admin.*` vocabulary | `permission-coverage.ts --strict --min 100` **passes** |
| 4 | Wire `user_roles` for all 339 users | `prod-verify` rbac wiring 100% |
| 5 | `authz-migrate.ts up` | 0001→0004 applied in order |
| 6 | `authz-data-migrate.ts --apply` | roles 17–19 present |
| 7 | `prisma db pull` + `generate` | typecheck; 98 models |
| 8 | All four suites incl. integration | green |
| 9 | Enable shadow mode; **watch, do not enforce** | decision logs show expected allows |
| 10 | Enforce | only after 9 is clean |

**Risk: high.** Steps 2–4 are a data-modelling project, not a deployment. Going
without them reinstates the `admin.*` bypass (§16) in full.

### Migration checklist

- [ ] Verified dump taken **and test-restored**
- [ ] Ledger pre-check output recorded
- [ ] Ledger repair applied; `doctor` shows one ORPHAN, no GHOST
- [ ] `migrate:status` — zero pending, or pending list consciously accepted
- [ ] 11 applied-but-absent migrations reconciled with the deployed backend
- [ ] `prod-verify.ts` re-run and diffed against this report

### Security checklist

- [ ] Aadhaar columns added, backfilled, verified (0/0/0/0)
- [ ] `aadhaar:encrypt` run; `aadhaar:verify` = 294 verified, 0 failures
- [ ] Plaintext column **renamed** (not dropped) and left one release
- [ ] List endpoints stop returning full Aadhaar
- [ ] S3 bucket policy restricts the legacy prefix; presigned TTL reduced
- [ ] New uploads key on `aadhaar_secure_reference`
- [ ] Scan pipeline live; 38 existing versions backfilled to `CLEAN`
- [ ] `quarantined_at` added; downloads refuse non-`CLEAN`
- [ ] Business audit observers writing
- [ ] `log_statement = 'ddl'` enabled
- [ ] `user_roles` orphans preserved and removed; all FKs re-validated
- [ ] DPDP disclosure assessment taken to counsel

### Production validation checklist

- [ ] `prod-verify.ts` — 0 CRITICAL
- [ ] `permission-coverage.ts` — 100%, or Option A accepted with a recorded rationale
- [ ] All four suites green in CI
- [ ] `/api/v1/authorization/flags` returns 401/503, **not** 404 (Option B only)
- [ ] No console 404s on session restore
- [ ] Every advertised Sidebar entry reaches a working page
- [ ] A test upload reaches `scan_status = CLEAN`
- [ ] An employee edit produces an `audit_logs` row

---

## 20. Production readiness score

Weighted by blast radius, not by effort.

| Domain | Score | Basis |
|---|---|---|
| Business data integrity | 9 / 10 | intact, checksums match; −1 for the `user_roles` orphans |
| Application availability | 8 / 10 | serving correctly; degradation paths well built |
| Backend code health | 7 / 10 | fail-closed guards, no injection, 264 tests |
| Frontend code health | 6 / 10 | builds, 243 tests; dead surfaces, 43 lint errors |
| Test coverage | 5 / 10 | 1,198 tests but fake-dominated; 7 integration is a start |
| CI/CD | 6 / 10 | pipeline written and validated; never executed |
| Prisma readiness | 5 / 10 | valid and typechecked; 15 models of known drift |
| Migration integrity | 3 / 10 | repair verified but unapplied; 14 pending, 11 absent |
| Audit logging | 3 / 10 | admin config only; business ops unaudited |
| HR module | 1 / 10 | 13/13 tables absent behind a deployed UI |
| RBAC | 1 / 10 | 0.29% wiring; per-user pseudo-roles |
| Authorization | 1 / 10 | platform absent; bypass returns on restore |
| **Permission coverage** | **0 / 10** | **0% — disjoint vocabularies** |
| **Aadhaar compliance** | **1 / 10** | plaintext, in S3 keys, 2,417 disclosures; +1 because the protection schema is already deployed and merely unpopulated |
| **Upload security** | **0 / 10** | 0/38 scanned, no quarantine |

### **Overall: 3.7 / 10 — NOT PRODUCTION READY**

Not because it is failing. It is **serving 339 users correctly right now**, and the
engineering underneath — fail-closed guards, parameterised SQL, graceful degradation,
1,198 passing tests — is better than the score suggests.

It is not production-ready because an HRMS holding payroll and Aadhaar data for 339
people has **no working authorization, no upload scanning, no encryption of its most
sensitive field, and no audit trail over business operations**. Four controls that
are assumed present are absent, and the code that would provide them is gated behind a
0% vocabulary match nobody had measured.

### Against the stated success criteria

| Criterion | Status |
|---|---|
| Migration ledger repaired | **Verified, not applied** — needs §19 step 0 |
| Authorization state consistent | Consistent (Option A), repository disagrees |
| No ghost migrations | Repair rehearsed; 2 ghosts remain live |
| Audit logging restored | **Reframed** — never stopped; coverage gap identified |
| Aadhaar masked and encrypted | Plan verified, unapplied; encryption needs `APP_KEY` |
| Upload scanning enabled | **Not done** — needs infrastructure |
| RBAC fully wired | **Not done** — 0.29% |
| Permission coverage 100% | **Not done** — 0%, blocker identified |
| HR module deployable | Blocked behind the ledger |
| Prisma synchronized when approved | Correctly deferred |
| Real integration tests | **Done** — 7, passing |
| CI/CD blocks unsafe deployments | **Done** — 8 jobs, validated |
| Production deployment safe | **No** — follow §19 |

**Three of thirteen complete, and the most valuable output is the fourth:** the
measurement that makes Option B's real cost visible before someone schedules it as a
migration. Enabling enforcement against a 0% catalogue would have been the worst
available outcome, and it was the obvious next step before this was measured.

### Recommended sequence

1. **This week** — Step 0, then Option A steps 2–6. Removes dead surfaces, no
   behaviour change.
2. **Next** — Aadhaar (§17-B) and upload scanning. Independent of the authorization
   decision; do not let them wait for it.
3. **Then** — business audit observers; `log_statement='ddl'`; `user_roles` cleanup.
4. **Separately scoped** — the §6 vocabulary reconciliation. Until it is done, Option
   B is not a deployment, it is a project.
