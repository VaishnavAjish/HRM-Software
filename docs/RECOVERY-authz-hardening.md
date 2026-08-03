# Authorization recovery — hardening and deployment plan

**3 August 2026, 17:20 local.** Companion to
`docs/INCIDENT-2026-08-03-authz-rollback.md` (what happened) and
`docs/AUDIT-2026-08-03.md` (the state it happened to).

Nothing in this document has been executed against production.

---

## 1. Executive summary

The recovery work is code, not database changes. Three defects made the incident
possible, and all three are now fixed in the repository:

| Defect | Fix | Where |
|---|---|---|
| Rollback ignored dependencies | `down` refuses while a dependent is applied | `scripts/authz-migrate.ts` |
| Rollback deleted its own ledger row | Append-only: marked `ROLLED_BACK` with who/when/why/host/commit | same |
| Node would 42P01 on a missing schema | `schemaGate` preHandler → 503, mirroring Laravel | `src/modules/authorization/` |

**684 tests pass, typecheck clean.** Nine of those tests are new and assert the
exact rollback that caused this must now fail.

Production still needs one change — the ledger repair in §5 — and one decision
(§7). Neither has been made.

---

## 2. Environment freeze — one change detected

Repo `13731bc`, unchanged through this work. Database schema unchanged: 83
tables, 0 `authorization_*`, ledger `0003,0004`.

**`users` moved 339 → 338 during Phase 1.** One `role = 1` admin account was
deleted (admins 3 → 2). `document_audit_logs` grew 2,543 → 2,656 across the same
window, so the application is in active use — this is almost certainly someone
removing a test admin through the UI, not incident-related.

It surfaces a real gap, which is why it is recorded here rather than waved
through: **no `audit_logs` row was written for the deletion.** The last entry is
id 186 from 09:08 UTC. A user account disappeared from production and the audit
trail does not mention it.

I did not halt indefinitely on this. A live HRMS with people clicking around will
never be byte-static, and the freeze rule is there to stop an audit racing
*schema* changes. The schema has not moved. Row-level business activity is noted
and worked around, not treated as a reason to stop.

---

## 3. Migration ledger and dependency graph

```
0001 ──┬── 0002   (row updates; no distinguishing object)
       └── 0003 ── 0004
```

0003 is declared against **0001**, not its file-order predecessor 0002 — it
repairs the schema 0001 built and does not need 0002's row updates. That is why
the graph is declared rather than inferred from filenames.

Current integrity:

| Migration | Ledger | Objects | Finding |
|---|---|---|---|
| 0001 | absent | absent | consistent |
| 0002 | absent | n/a | consistent (unverifiable by design) |
| 0003 | **APPLIED** | absent | **GHOST** |
| 0004 | **APPLIED** | absent | **GHOST** |

Two GHOSTs. Under the old runner this was silent; the new one refuses to apply
anything until it is resolved.

---

## 4. What changed in the tooling

### `scripts/authz-migrate.ts`

**Dependency enforcement.** `down 0001` now exits non-zero while 0002/0003/0004
are applied, and prints the reverse-order commands to unwind them properly.
Dependents resolve transitively, so rolling back 0001 sees 0004 as blocking even
though 0004 depends on 0001 only through 0003 — the specific gap that let this
happen.

**Append-only ledger.** `down` no longer deletes. It sets `status =
'ROLLED_BACK'` with `rolled_back_at`, `rolled_back_by`, `reason`, `host` and
`git_commit`, and `--reason "why"` is now required alongside `--confirm`. Had
this existed, §3 of the incident report would name someone instead of explaining
why it cannot.

**`doctor`.** Cross-checks every ledger row against a per-migration SQL sentinel:

- `GHOST` — claims APPLIED, objects absent. **Blocks `up`.**
- `DEPENDENCY` — applied over something that is not. **Blocks `up`.**
- `ORPHAN` — objects present, ledger silent. **Warns only.**

The severity split is deliberate. A GHOST causes work to be silently skipped. An
ORPHAN causes an idempotent re-apply, which is a no-op — and blocking on it would
deadlock the one case most likely to occur: after this rollback, 0003's orphaned
`permissions.level` column is exactly an ORPHAN, and refusing to proceed would
mean dropping a production column to satisfy bookkeeping.

`up` runs `doctor` before doing anything.

### `src/modules/authorization/schema-readiness.ts` (new)

Probes the same nine objects as `RequirePermission::schemaReady()`. Deliberately
identical: if the two backends disagreed about whether the platform exists, the
same request could be authorized or refused depending on which server took it.

Cached process-wide, not time-based — a TTL would only create a window of wrong
answers, and any migration comes with a deploy or restart. A failing probe reads
as *not ready*; treating "unknown" as ready is how you get a 42P01 inside a
handler instead of a clean 503.

Wired into `authorization.routes.ts` as `schemaGate`, ahead of authentication on
all nine routes. Whether a feature exists is not a fact about the caller, and
answering it first keeps an unavailable subsystem from looking like an auth
failure. Response body matches Laravel's, so the React client's existing handling
works unchanged.

### `scripts/migration-graph.test.ts` (new, 9 tests)

Asserts the graph directly, including:

- `dependentsOf('0001')` returns all three transitively
- a sibling is not a dependent (0003 must not block rolling back 0002)
- **"would have refused the rollback that caused the incident"** — the exact
  applied-set from 16:41, asserting non-empty blocking
- no cycles, which is a guard on the manifest as much as the algorithm

---

## 5. Ledger repair — `docs/repair/fix-authz-migration-ledger.sql`

Four labelled sections: pre-check, repair, post-check, rollback. **Not executed.**

It now *marks* rather than deletes. The earlier draft deleted the two rows, which
would have repeated the exact mistake under repair — deleting ledger rows is why
nobody can say who rolled back 0001.

Two guards: it aborts if `authorization_feature_flags` exists (ledger might be
right), and if 0003/0004 are not both `APPLIED` (wrong starting state).

Expected after running: `status` shows `0001 PENDING, 0002 PENDING, 0003
ROLLED_BACK, 0004 ROLLED_BACK`; `doctor` reports exactly one ORPHAN for 0003
(accurate — `permissions.level` really is present and unclaimed); `up --dry-run`
warns on the orphan then plans all four in order with none skipped.

**One caveat before you run it.** The script's `ALTER TABLE _authz_migrations ADD
COLUMN IF NOT EXISTS ...` must land before the new runner can read the ledger at
all — `doctor` and `status` select `status`, which does not exist yet. Running
any new runner command against production would perform that ALTER via
`ensureTrackingTable()`. It is additive, idempotent and confined to an internal
bookkeeping table, but it *is* a write, so I have not run it.

---

## 6. Permission coverage — still blocked, and the number that matters

`scripts/permission-coverage.ts` cannot run: it compares against
`permissions.code`, which the rollback removed. What is already established:

- **87 distinct permission codes** are enforced by Laravel route middleware
- **0** `admin.*` and **0** `hr.*` codes existed in the 96-row catalogue
- 72/96 permissions attach to no role; 13/15 roles have no users
- **338/339 users have no `user_roles` row**

Access in production is decided by the integer `users.role` — 1 super admin, 2
admins, 334 employees, 1 agent. The RBAC tables are scaffolding.

**Do not re-enable enforcement until the `admin.*`/`hr.*` codes are seeded and
assigned.** Restoring the platform without that restores the bypass exactly as
the audit found it: engine denies → shadow mode rescues → `'admin' => true`.

---

## 7. Deployment decision — still yours

Both paths start with §5.

### Option A — remain on legacy authorization

1. Ledger repair.
2. `prisma db pull` + `generate` (98 → 83 models); typecheck.
3. Optionally drop `permissions.level` — **after** the repair, never before, as
   it is 0003's sentinel.

The Node authorization routes can now stay registered: `schemaGate` returns 503
rather than failing. That was the blocker for this option and it is gone.

### Option B — restore the platform

1. Ledger repair.
2. `authz-migrate.ts up` — replays 0001 → 0004 in order, dependency-checked.
3. `authz-data-migrate.ts --apply` — recreates roles 17–19 and role metadata.
4. `prisma db pull` + `generate`; typecheck; all three suites.
5. **Seed `admin.*` and `hr.*` before re-exposing the routes** (§6).

I am not recommending either. The rollback appears deliberate, and what was
intended by it is not something I can read off the database.

---

## 8. Remaining gaps

1. **Laravel has no dependency-aware runner.** This hardening covers
   `prisma/sql` only. `php artisan migrate` is still blocked by the unrecorded
   authorization migration — see `docs/repair/record-authz-migration.sql`, whose
   precondition now fails by design since the tables are gone.
2. **`log_statement = 'none'`.** DDL against this database is invisible. This
   incident would have been a two-minute lookup. One setting change.
3. **No integration tests against a real PostgreSQL.** All 684 pass against
   fakes, which is why none noticed fifteen tables vanishing. `doctor` closes
   this for schema state; behavioural coverage would need a disposable database
   in CI.
4. **User deletion is not audited** (§2).
5. **CI does not gate on ledger consistency.** `authz-migrate.ts doctor` exits
   non-zero on GHOST/DEPENDENCY and is ready to be a pipeline step; it is not
   wired into one.

---

## 9. Verification

| Check | Result |
|---|---|
| Node typecheck | clean |
| Node tests | **684 passed** (23 files) |
| Laravel tests | 264 passed |
| Frontend build / tests | succeeds / 239 passed |
| Production writes this session | **none** |
