# Custom Role Permission Propagation — Fix Record (2026-08-13, evening)

Companion to [REMEDIATION-2026-08-13-status-and-runbook.md](REMEDIATION-2026-08-13-status-and-runbook.md).
Two sessions worked this defect concurrently; this file records the combined state so neither re-does or undoes the other's work.

## Confirmed root causes

1. **ROOT CAUSE 1 — no baseline on custom role creation** (`b8f778ac`, extended in `95bead26`).
   `RoleManagementService::create()` built roles with zero permissions; a user holding only a
   custom role could not load their own profile/portal. Creation now grants the `self.*`
   baseline plus the `ui.portals`/`ui.portals.business` management-shell containers, atomically,
   never anything privileged. `authz:sync-legacy-roles --apply` repaired the five existing roles
   (admin, hr_manager, agent, account, director — 20 grants, applied to `niss_hrms`).

2. **ROOT CAUSE 2 — matrix saves produced dead grants** (`f39e248e` + `95bead26`).
   The engine's `deniedAncestor()` gate refuses any code whose registry ancestors are not held,
   but `RoleMatrixWriter` saved only the clicked cells. The live `director` role held
   `ui.portals.employee` ALLOW with no `ui.portals` → every check `PARENT_DENIED` (verified with
   `authz:trace-user D2 ui.portals.employee`). The writer now grants missing required ancestors
   with the save (audited as `ANCESTOR`, included in implied-code projection) and refuses saves
   whose required ancestor is explicitly denied (`PARENT_EXPLICIT_DENY`, 422). Historical roles
   repaired via `authz:normalize-role-ancestors --apply` (emp +`ui.employees`, director
   +`ui.portals`) and `authz:repair-custom-business-shells` (`2e165470`).

3. **NOT root causes (verified healthy):** role assignment (`UserAccountService::assignRoles`
   writes `user_roles` + `authorization_role_assignments`, audits, invalidates); snapshot cache
   invalidation (`AuthorizationCache` version stamping); role-id consistency (one `roles.id`
   flows end to end); tenant scope CSV handling (`ScopeMatcher::tenantMatches` is comma-aware).

## Separate live incident fixed en route

`8be3ea1b` defaulted `AUTHZ_ENFORCED_PREFIXES` to every business prefix in
`config/authorization.php`. `PermissionEnforcementPolicy` enforces those prefixes **regardless
of `AUTHZ_MODE`**, so the live LAN server was hard-enforcing while `.env` said shadow — users
without canonical grants (e.g. D2) were 403'd off their own profile. The live `.env` now sets
`AUTHZ_ENFORCED_PREFIXES=` (empty) explicitly, with a comment explaining why `AUTHZ_MODE=shadow`
alone is not a safety net. Staged enforcement = set that variable deliberately, prefix by prefix.

## Current verified state (live `niss_hrms`)

- `authz:audit-role-migration`: **"No cohort loses self-service/portal access"** — first green run.
- E2E acceptance (master-prompt §81) executed against the running API with a disposable role
  ("Recruitment Operator (E2E)") and user, both deleted afterwards:
  - grant page+create → one save wrote 2 cells + 1 auto-ancestor (`ui.hr`) + 3 implied business
    codes (`hr.requisition.read/create`, `hr.dashboard.read`)
  - snapshot: `portal=admin` (derived from shell container, not tier), granted codes true,
    ungranted pages false
  - `GET /api/hr/requisitions/get` → 200 · `POST store` → passes authz (422 field validation)
    · `DELETE` (never granted) → 403
  - revoke create → POST 403, GET still 200 · revoke page → GET 403, snapshot false
  - identical under enforced mode for this user: legacy denies tier-3 `hr.*`, so shadow rescue
    never applied — the allows above are pure canonical grants.
- Disposable-DB tests: `RoleMatrixAncestorNormalizationTest` 4/4; 54-test authorization
  regression sweep green (the one prior failure was a test asserting the old dead-grant
  behaviour, updated to the normalized contract).

## Notes for future sessions

- Use a **private** scratch DB (`CI_TEST_DB=niss_hrms_ci_test_<name>`) — two sessions sharing
  `niss_hrms_ci_test_scratch` raced each other's `migrate:fresh` mid-drop.
- `roles.role_class` is `CUSTOM` even for the seeded built-ins; do not key protection off it —
  `SystemRoles::isProtected` / `is_system` are the guards.
- The `account` role carries ~30 deliberate explicit-DENY contradictions (children ALLOW under
  `ui.hr`/`ui.tickets`/`ui.access_control` DENY). Both repair commands skip explicit denies by
  design; an administrator must resolve these in the matrix (the new `PARENT_EXPLICIT_DENY`
  error now prevents creating more).
- Remaining before flipping enforcement: `recruitment.candidate.read` denies for hiring-facing
  cohorts (visible in the audit), and the frontend nav/form-action work in flight in the other
  session.
