# Remediation report — authorization platform rolled back in production

**3 August 2026, ~16:45 local. Audit halted at Phase 6.**

The brief requires stopping on a critical finding rather than continuing. This
is that report. Phases 6–20 are not complete; §6 below says exactly where the
work stopped.

---

## 1. What happened

Between 16:41 (all checks green) and 16:45, `prisma/sql/0001` — and with it
`0002` — was rolled back against production. The rollback did what it is written
to do: `0001_authorization_platform.down.sql` drops the eleven tables it created
and the columns it added to `roles`, `permissions`, `role_permissions` and
`user_permissions`.

I did not run it and I do not know who did. `_authz_migrations` records the
applier of an *apply*, not of a rollback, so there is no attribution in the
database.

### Before / after

| | Before (16:41) | Now |
|---|---|---|
| Tables | 98 | **83** |
| `authorization_*` tables | 15 | **0** |
| `permissions` columns | id, name, group_id, description, code, resource, action, level, is_sensitive, is_active, timestamps | id, name, group_id, description, timestamps, **level** |
| `roles` columns | + code, tenant_id, description, role_type, is_system, is_assignable, is_sensitive, requires_approval, default_scope_type, status, version, created_by, updated_by | id, name, type, is_active, timestamps |
| `_authz_migrations` | 0001, 0002, 0003, 0004 | **0003, 0004** |

---

## 2. What was lost, and what was not

**No business data was lost.** Verified directly:

| Table | Rows |
|---|---|
| `users` | 339 |
| `salary_slips` | 334 |
| `documents` / `document_versions` | 38 / 38 |
| `document_audit_logs` | 2,528 |

**No authorization data was lost.** All fifteen `authorization_*` tables held
**0 rows** at every point in this audit, including when they were dropped.

**The legacy RBAC tables are intact and back to their pre-0001 state** — row for
row identical to the `_pre_authz_*` snapshots taken before 0001 ran:

| Table | Now | `_pre_authz_*` snapshot |
|---|---|---|
| `roles` | 15 | 15 |
| `permissions` | 96 | 96 |
| `role_permissions` | 30 | 30 |
| `user_roles` | 5 | 5 |
| `user_permissions` | 0 | 0 |

All seven backup tables survive.

**One thing did disappear that is not in a snapshot.** `roles` held 18 rows at
16:24 — `Unit Admin`, `Agent` and `Employee` had been inserted mid-audit by a
process other than this session (noted in the audit report §2.5). It now holds
15. Those three rows are gone, and because they post-date the `_pre_authz_roles`
snapshot they are not recoverable from it. If they mattered, whoever created
them needs to know.

**The derived values are gone**: `permissions.code`/`resource`/`action` for 96
rows, and the curated `roles.code` mapping (`Super Admin` →
`super_administrator`, `Admin` → `tenant_administrator`, `Master` →
`master_administrator`). These were computed, not authored, so they can be
regenerated — but the curated role mapping was not a plain slug and whoever
authored it should confirm the values rather than let a regex re-derive them.

---

## 3. Is production broken right now?

**No. It is running on legacy authorization, which is a coherent state.**

`RequirePermission::schemaReady()` probes for `authorization_feature_flags`,
`authorization_role_assignments`, `authorization_policies`, `permissions.code`,
`permissions.is_active`, `roles.code`, `roles.status`, `role_permissions.effect`
and `user_permissions.valid_until`. Every one is now absent, so it returns
**false**, and the middleware takes the compatibility branch:

- `admin.*` routes → **503** `AUTHORIZATION_SCHEMA_NOT_READY`
- everything else → `legacyAllows()`, the pre-existing role check

This is precisely the case the guard added in commit `4807a91` at 16:32 was
written for, and it works. The Authorization Center UI will show 503s; the rest
of the application authorizes exactly as it did before any of this began.

Worth stating plainly: the authorization *bypass* reported in the audit (§3.3 —
`admin.*` gates falling through to `'admin' => true`) is **no longer reachable**,
because those routes now 503 before reaching the engine. The rollback closed it
by removing the surface, not by fixing it. It returns the moment the platform is
re-applied.

---

## 4. The real problem: the ledger is lying

`_authz_migrations` still claims **0003 and 0004 are applied**. Their objects
are gone. 0003 and 0004 were applied *on top of* 0001, and rolling back 0001
without rolling them back first took their columns and indexes with it while
leaving their ledger rows behind.

So today:

```
npx tsx scripts/authz-migrate.ts up
  -> re-applies 0001, 0002   (no longer recorded)
  -> SKIPS      0003, 0004   (still recorded)
```

That rebuilds the eleven tables and lands back in **exactly the broken state
this audit opened with**: eighteen columns missing, `SeparationOfDuties` and the
policy write paths raising 42703, and `authorization_decision_logs` silently
discarding every record.

**This trap is mine.** I wrote 0003 and 0004 as independent migrations with no
declared dependency on 0001, and the runner has no notion of ordering on
rollback — it will happily reverse a migration that later ones were built on.
That is a real defect in the tooling, not just in how it was used.

One artefact survives the rollback: `permissions.level`, added by 0003, which
0001's `down()` had no reason to know about. It is a `NOT NULL DEFAULT 'ACTION'`
column on 96 rows — harmless, but it is drift.

---

## 5. Remediation

**Step 0, required before anything else** — make the ledger honest:

```
docs/repair/fix-authz-migration-ledger.sql
```

Deletes the two false rows. Touches no schema, no data. Guarded: it refuses to
run if `authorization_feature_flags` exists. Then choose a direction.

### Option A — stay reverted

Do nothing further. Production continues on legacy authorization; `admin.*`
returns 503. Optionally `ALTER TABLE permissions DROP COLUMN IF EXISTS level` to
match the pre-0001 schema exactly.

Before the Node backend is deployed, `registerAuthorizationRoutes` must be
removed from `src/app.ts:113` — `src/modules/authorization/authorization.repository.ts`
queries the dropped tables through raw SQL and would raise 42P01 on every call.
It is registered today; the Node app is not yet in production, so this is a
pre-deploy blocker rather than a live fault.

### Option B — roll forward

After step 0, `npx tsx scripts/authz-migrate.ts up` replays 0001 → 0004 in
order and returns to the verified state of 16:41: 15 tables, 0 missing columns,
7 feature flags, 1,127 tests green.

Then re-run `prisma db pull` and `prisma generate` — the schema is stale again
(98 models against an 83-table database).

**Neither option is mine to choose.** The rollback looks deliberate, and if it
was, Option A is the correct reading of it.

### Tooling fix, either way

`authz-migrate.ts` should refuse to roll back a migration while any later one is
recorded as applied. It currently permits the exact sequence that produced this
state. I have not changed it — the audit is halted, and changing the tool
mid-incident would alter the thing being diagnosed.

---

## 6. Where the audit stopped

Complete before the halt:

- Phases 1–3 — repository and database inventory, drift detection
  (`docs/AUDIT-2026-08-03.md`)
- Phase 5 — authorization platform audit
- Phases 11–12 — Prisma and storage
- Phase 14 — frontend (builds; 239 tests)
- Phase 17 — Laravel 264, Node 624, frontend 239 all green at 16:41

Incomplete, halted at Phase 6:

- **Phase 6 — permission coverage.** The script
  (`scripts/permission-coverage.ts`) is written and was mid-run when it failed
  on `permissions.code`; that failure is how the rollback was detected. It
  cannot complete until the platform is re-applied, because the catalogue column
  it compares against no longer exists. Partial result already known: **87
  distinct codes are enforced by Laravel route middleware, and zero `admin.*` or
  `hr.*` codes existed in the 96-row catalogue.**
- **Phase 4 — migration verification by checksum.** Cannot be completed from
  this repository. The eleven applied-but-absent migrations have no file here to
  checksum against (audit §2.2). Verifying them requires the codebase that
  actually deploys this database.
- Phases 7–10, 13, 15, 16, 18 — not started.

Node's 624 tests still pass, because they run against fakes rather than the
database. That is by design, and it is also why they did not detect any of this.

---

## 7. What I did not do

- Did not re-apply anything. Restoring the platform re-opens the §3.3 bypass.
- Did not delete the false ledger rows — the script is written, not run.
- Did not drop `permissions.level`.
- Did not modify `authz-migrate.ts`.
- Did not attempt to recover the three deleted roles.

Nothing in this report has been executed against production. The only artefacts
are this file and `docs/repair/fix-authz-migration-ledger.sql`.
