# Incident report — authorization platform rolled back during audit

**Database:** `niss_hrms`, PostgreSQL 18.4 (`D:/postgresSQL/data`)
**Repo:** `F:\HRMS oldd`, branch `main`
**Investigated:** 3 August 2026, 16:45–17:10 local
**Status:** contained. No business data lost. Production functioning on legacy authorization.

---

## 1. Executive summary

The enterprise authorization platform was removed from production between
**16:41:13 and 16:45**, while an audit was running against the same database.

Nothing was lost that matters. Every business table is byte-identical to before,
all fifteen `authorization_*` tables were empty when dropped, and the legacy RBAC
tables are row-for-row identical to the pre-migration snapshots. The application
continues to authorize correctly, because a compatibility branch added to
`RequirePermission` nine minutes earlier does exactly what it was written for.

Two things need attention:

1. **The migration ledger is lying.** `_authz_migrations` still records 0003 and
   0004 as applied. Their objects are gone. Re-running the migrator would
   rebuild 0001/0002 and *skip* 0003/0004, landing straight back in the broken
   state this audit opened with. Repair script written, not run.
2. **`registerAuthorizationRoutes` is still wired into the Node app**
   (`src/app.ts:113`) and its repository queries the dropped tables by raw SQL.
   Harmless today — the Node backend is not deployed — and a guaranteed 42P01 on
   the day it is.

**This was almost certainly deliberate developer action, not a fault.** Section 3
explains why. It is written up as an incident because it happened without
coordination against a live database mid-audit, which is the part worth changing.

---

## 2. Timeline

Times are local (IST). Sources: `_authz_migrations.applied_at`, git reflog,
filesystem mtimes, and this session's own command output.

| Time | Event | Evidence |
|---|---|---|
| 15:12 | Laravel authorization platform + Authorization Center UI committed | reflog `aa40395` |
| 16:04–16:08 | `prisma/sql/0001`, `0002` authored | file mtimes |
| ~16:06 | 0001, 0002 applied to production | `_authz_migrations` (rows since removed) |
| 16:15 | HR management UI + node scripts committed | reflog `0bcfed8` |
| 16:24:40 | Audit catalog snapshot taken — 98 tables, roles 15 | this session |
| 16:24:41 | Roles 17–19 (`Unit Admin`, `Agent`, `Employee`) inserted → roles 18 | `roles.created_at` |
| 16:32:07 | `schemaReady()` compatibility branch committed | reflog `4807a91` |
| 16:32:16–16:32:56 | `0003`, `0004` authored (this session) | file mtimes |
| **16:40:04–05** | **0003, 0004 applied** | `_authz_migrations.applied_at` |
| 16:41:13 | Verification green: 0 missing columns, 7 flags, 624 + 264 tests | this session |
| 16:41:57 | Commit "authorization middleware updates & **data migration scripts**" | reflog `4c63061` |
| **16:41–16:45** | **Rollback window** | bounded by the two rows either side |
| ~16:45 | Audit Phase 6 fails: `column "code" does not exist` | this session |
| 16:49:43 | Remediation doc + repair script committed | reflog `13731bc` |
| 17:00–17:03 | `field-security.ts`, `row-security.ts`, `security.test.ts`, `enforcement.ts` created | file mtimes |

The rollback window is bounded on both sides by hard evidence: the ledger shows
0003/0004 applied at 16:40:04, this session's test run at 16:41:13 proved the
schema intact, and the first failing query was ~16:45.

---

## 3. Root cause and rollback analysis

### What was run

`scripts/authz-migrate.ts down 0001 --confirm`, and the same for `0002`.

Three independent lines of evidence, none of which requires assuming anything:

1. **The ledger rows for 0001 and 0002 are gone.** Only the migrator's `down`
   path deletes from `_authz_migrations`. A hand-written `DROP TABLE` would have
   left them behind.
2. **The set of dropped objects matches `0001_authorization_platform.down.sql`
   exactly** — all fifteen tables including the four the PHP migration never
   declared (`authorization_access_reviews`, `..._access_review_items`,
   `..._access_request_approvals`, `..._sod_violations`), plus precisely the
   columns that file names on `roles`, `permissions`, `role_permissions` and
   `user_permissions`.
3. **`permissions.level` survived.** It was added by 0003, and 0001's `down` has
   no reason to know about it. Only a 0001-scoped rollback leaves that exact
   fingerprint.

### Who — not determinable, and here is why

- `log_statement = none` and `log_min_duration_statement = -1`. **PostgreSQL did
  not record the DDL.** Even with the log directory in hand, it would not be
  there.
- The log directory is `D:/postgresSQL/data/log` — outside `F:\HRMS oldd`, which
  your standing instruction puts off limits. Given the setting above, reading it
  would not answer the question anyway.
- `_authz_migrations` stores `applied_by` on apply. Its `down` path **deletes the
  row rather than annotating it**, so the rollback erased the only record that
  could have carried attribution. That is a defect in the tool, and it is why
  this question has no answer.

Shell history would likely answer it. It lives outside `F:` and I have not read
it. Say the word if you want that checked.

### Why it was probably deliberate

Commit `4c63061` lands at 16:41:57 — inside the rollback window — and its message
names "data migration scripts". `scripts/authz-data-migrate.ts` (untracked, and
whose step 2 is *"missing roles unit_administrator / employee / agent do not
exist"*) is what created roles 17–19 at 16:24:41. Those three roles are now gone,
and `roles` is back to exactly the 15-row snapshot.

**That last part is a separate action from the rollback.**
`0001_...down.sql` contains no `DELETE`, `INSERT` or `UPDATE` — verified by
reading it. It drops tables and columns and nothing else. So something *also*
reverted the data migration. It was not `authz-backup.ts`, which offers only
`create`, `verify` and `drop` — there is no restore command in this repository.

**Open question, stated rather than guessed:** the mechanism that removed roles
17–19 and their `role_permissions` rows is not identifiable from any tool in this
repo. Candidates are a manual statement or a script held elsewhere.

### Contributing cause, which is mine

I wrote 0003 and 0004 as independent migrations with no declared dependency on
0001, and `authz-migrate.ts` has no ordering check on rollback. It will happily
reverse a migration that later ones were built on top of, leaving their ledger
rows behind. The trap in §5 exists because of that.

---

## 4. Business data verification — PASS

Row counts and content checksums taken after the rollback:

| Table | Rows | `md5` |
|---|---|---|
| `users` | 339 | `824e5fe337a6af0f800a704380cf1c9d` |
| `salary_slips` | 334 | `51ec98b7479fc5860d6156b6eb5d6b0a` |
| `documents` | 38 | `5e4f1e95b8adb108e323c9aa434b7629` |
| `document_versions` | 38 | `e4279b4c9fd8b89e2d3ebd0d8cad71ea` |
| `document_audit_logs` | 2,543 | `3f21ae9de904049fc6235d62775f5344` |
| `upload_batch_rows` | 668 | `2c19ac3842e2976c17b53b0738075b7c` |
| `audit_logs` | 186 | `2425f936f1767be345d095185b47711a` |
| `attendances` | 17 | `c86392e4078c9a9eaf1de4cb0ae6d2a8` |
| `settings` | 22 | `333cef53bd1b3453729bb3f8856a205d` |

All counts match the pre-incident audit. **No business data was lost.**

(`document_audit_logs` moved 2,528 → 2,543 — normal application activity, not
incident-related.)

Legacy RBAC against the `_pre_authz_*` snapshots — identical on every table, and
the id sets match exactly in both directions:

| Table | Live | Snapshot |
|---|---|---|
| `roles` | 15 | 15 |
| `permissions` | 96 | 96 |
| `role_permissions` | 30 | 30 |
| `user_roles` | 5 | 5 |
| `user_permissions` | 0 | 0 |
| `permission_groups` | 14 | 14 |
| `permission_dimensions` | 24 | 24 |

**Unrecoverable:** roles 17–19 and their `role_permissions` rows. They post-date
the snapshot, so no backup contains them. They are reproducible by re-running
`authz-data-migrate.ts --apply`, but only after the platform is restored.

---

## 5. Migration ledger and dependency graph

### Dependency violation

```
0001  (tables + columns)          REMOVED   ledger row gone
 └── 0002  (is_sensitive rules)   REMOVED   ledger row gone
      └── 0003  (PHP parity)      OBJECTS GONE   ledger row PRESENT  <-- violation
           └── 0004 (flag seed)   OBJECTS GONE   ledger row PRESENT  <-- violation
```

0003 and 0004 were applied on top of 0001. Rolling back 0001 without reversing
them first destroyed their objects and left their ledger rows.

### Consequence

```
npx tsx scripts/authz-migrate.ts up
  -> re-applies 0001, 0002    (no longer recorded)
  -> SKIPS      0003, 0004    (still recorded)
```

That rebuilds the eleven tables and returns production to **exactly** the state
the audit opened with: eighteen columns missing, `SeparationOfDuties` and the
policy write paths raising 42703, and `authorization_decision_logs` silently
discarding every record.

### Repair — written, not run

`docs/repair/fix-authz-migration-ledger.sql` deletes the two false rows.
Precondition guard: refuses to run if `authorization_feature_flags` exists.
Touches no schema and no data. Rollback is a two-row `INSERT`, in the file.

**This must run before any other authorization action, in either direction.**

Residual drift: `permissions.level` — `NOT NULL DEFAULT 'ACTION'` on 96 rows,
orphaned from 0003. Harmless. Drop it only if staying reverted; 0003 re-adds it
with `IF NOT EXISTS` either way.

---

## 6. Authorization consistency

All fifteen `authorization_*` tables: **absent**. Not partially restored — the
drop was clean, with no orphaned indexes, constraints or sequences.

The more interesting finding is what the legacy tables actually contain:

| Check | Count |
|---|---|
| Permissions attached to no role | **72 / 96** |
| Roles with no permissions | **13 / 15** |
| Roles with no users | **13 / 15** |
| Users with no `user_roles` row | **338 / 339** |

And the column that actually decides access:

| `users.role` | Users |
|---|---|
| 0 (super admin) | 1 |
| 1 (admin) | 3 |
| 3 (employee) | 334 |
| 4 (agent) | 1 |

**The `roles` / `permissions` / `user_roles` structure is scaffolding, not a
control.** One user out of 339 has a role row. Every authorization decision in
production today is made from the integer `users.role`. That was true before this
incident and is unchanged by it — but it reframes the platform's purpose: it was
never enforcing, it was waiting to.

---

## 7. Legacy compatibility — verified working

`RequirePermission::schemaReady()` probes nine objects. All nine are now absent,
so it returns **false** and the compatibility branch runs:

- `admin.*` → **503** `AUTHORIZATION_SCHEMA_NOT_READY`
- everything else → `legacyAllows()`, the pre-existing role check

This is exactly the case the 16:32 commit anticipated. It works.

**Observed behaviour differs from that prediction, and the difference matters.**
Your browser console shows `/api/v1/authorization/me` returning **404 "The route
could not be found"**, not 503. A 404 means the route is not registered in the
running application at all — the request never reaches the middleware.

There is no route cache (`bootstrap/cache/routes-*.php` is absent), so staleness
is ruled out. The remaining explanation is that **the backend serving
`192.168.1.53:8000` is not this repository's code.** That is consistent with the
eleven applied migrations whose files do not exist here, and with the live
backend being `E:\HRMS Nidhi` — which I have not read and will not.

Discriminating test, if you want certainty:
`curl http://192.168.1.53:8000/api/v1/authorization/flags` — 404 confirms the
routes are absent from the deployed code; 503 or 401 confirms they are present.

The React client degrades correctly either way: `AuthContext` logs *"Enterprise
authorization snapshot unavailable; using compatibility permissions"* and
proceeds. Every business call in your console (`/profile`, `/employee/get`,
`/department/get`, `/salary-slip/get`, `/appointment`, `/trial-form/list`)
succeeded.

### Security consequence

The `admin.*` bypass reported in the audit — gates falling through to
`'admin' => true` — is **currently unreachable**, because those routes 404 or 503
before the engine is consulted. The rollback closed it by removing the surface,
not by fixing it. **It returns in full the moment the platform is re-applied.**

---

## 8. Prisma, frontend, backend

**Prisma — drift present, deliberately not corrected.** `schema.prisma` holds 98
models; the database has 83. I have **not** run `db pull`, because it would strip
the fifteen authorization models from the schema while a developer is actively
writing `enforcement.ts`, `field-security.ts` and `row-security.ts` against that
area, and because the direction (§9) is undecided. Re-pull after choosing.

Typecheck is clean at 98 models — the Node authorization module reaches those
tables through `$queryRawUnsafe`, never through Prisma model accessors, so the
generated client and the live schema disagreeing does not surface at compile
time. It surfaces at runtime.

**Frontend — builds, 239 tests pass.** No page or route references a dropped
table directly. `AuthContext.loadPermissionsForUser` calls
`/api/v1/authorization/me` on every session restore and handles failure
gracefully; the cost is two console errors per page load.

**Backend — the one live landmine.** `src/app.ts:113` registers
`registerAuthorizationRoutes`, and `authorization.repository.ts` issues raw SQL
against `authorization_role_assignments`, `authorization_policies` and the rest.
There is no `schemaReady()` equivalent on the Node side. **Deploying the Node
backend today would 42P01 on every authorization call.** Laravel has the guard;
Node does not.

---

## 9. Deployment options

No recommendation, per the brief — verification is complete but the *intent*
behind the rollback is not mine to infer.

Both options require `fix-authz-migration-ledger.sql` first.

### Option A — remain on legacy authorization

1. Run the ledger repair.
2. Remove `registerAuthorizationRoutes` from `src/app.ts:113` before any Node
   deploy.
3. Optionally `ALTER TABLE permissions DROP COLUMN IF EXISTS level`.
4. `prisma db pull` + `generate` (schema drops to 83 models); typecheck.
5. Accept that `/api/v1/authorization/*` 404s and the Authorization Center UI is
   unavailable.

Production already sits in this state. It needs no database change.

### Option B — restore the platform

1. Run the ledger repair.
2. `npx tsx scripts/authz-migrate.ts up` — replays 0001 → 0004 in order.
3. `npx tsx scripts/authz-data-migrate.ts --apply` — recreates roles 17–19 and
   the role metadata.
4. `prisma db pull` + `generate`; typecheck; all three suites.
5. **Seed the `admin.*` and `hr.*` permission codes before re-exposing the
   routes** — otherwise the bypass in §7 returns exactly as it was.

---

## 10. Fixes required regardless of direction

1. **`authz-migrate.ts` must refuse to roll back a migration while a later one is
   recorded.** It permitted the precise sequence that caused this.
2. **`down` must annotate rather than delete.** Erasing the ledger row destroys
   the attribution trail — which is why §3 cannot name anyone.
3. **Enable `log_statement = 'ddl'` on this database.** DDL against production is
   currently invisible. This incident would have been a two-minute lookup.
4. **Node needs a `schemaReady()` equivalent** before its authorization routes
   are deployable.
5. **Stop working against production from two directions at once.** The database
   and the repository both changed three times during a four-hour audit.

---

## 11. Test and build status

| Suite | Result |
|---|---|
| Node (`vitest`) | **664 passed** (21 files — up from 624, the new `security.test.ts` adds 40) |
| Node typecheck | clean |
| Laravel (`php artisan test`) | **264 passed**, 769 assertions |
| Frontend tests | 239 passed |
| Frontend build | succeeds |

The Node suite passes against fakes rather than the database. That is by design —
and it is also why none of these 664 tests noticed that fifteen production tables
had disappeared.

---

## 12. Audit status

The Phase 1–20 production audit requested earlier is **halted**, per its own stop
rule. Completed before the halt and still valid: repository and database
inventory, drift detection, authorization platform audit, storage, frontend,
backend, and the full test sweep — `docs/AUDIT-2026-08-03.md`.

Not completed:

- **Phase 6, permission coverage.** `scripts/permission-coverage.ts` is written
  and cannot run: it compares against `permissions.code`, which no longer exists.
  The partial result is already the headline finding — **87 distinct codes are
  enforced by Laravel route middleware; zero `admin.*` or `hr.*` codes existed in
  the 96-row catalogue.**
- **Phase 4, checksum verification of the eleven applied-but-absent migrations.**
  Impossible from this repository — the files are not here.
- Phases 7, 9, 13, 16, 18 — not started.

Restarting requires a stable environment. It has not been stable at any point
today: the repo advanced through five commits and the database changed three
times while the audit ran.

---

## 13. What was executed against production

**Nothing, during this investigation.** Every statement run was a `SELECT`
against `information_schema`, `pg_catalog`, or a row count.

The only production writes I have made all day are `0003` and `0004`, applied at
16:40 at your explicit instruction, and both verified green at 16:41 before the
rollback removed them.

Repair scripts written and **not** run:

- `docs/repair/fix-authz-migration-ledger.sql`
- `docs/repair/record-authz-migration.sql` (from the earlier audit; its
  precondition guard now fails by design, since the tables it checks for are
  gone)
