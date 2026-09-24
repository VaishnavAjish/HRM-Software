# Full Website Security + Bug Audit Report — NISS HRMS

**Repository:** `F:\HRMS oldd` · **Date:** 2026-09-24 · **Mode:** STRICT READ-ONLY / LOCAL-ONLY / NO-GIT / NO-AWS / NO-SSH

**Method:** This is a *delta audit*. The codebase already carries an extensive read-only audit trail (`AUDIT-2026-08-03.md`, `AUDIT-2026-08-10.md`, `AUDIT-2026-08-13-full-application-readonly.md`, `2026-08-16-full-codebase-map/`, `2026-08-16-hr-module-deep-audit/`, `functional-analysis-report/16-security-audit.md`). Re-running that full ~60-section exercise from zero would just duplicate work already on disk. Instead, this pass:

1. Re-verified, via fresh source reads (not memory of the old report), whether the 9 previously CONFIRMED Critical/High findings from the 2026-08-13 audit are still present in the current working tree.
2. Did new, from-scratch static analysis of the modules that have changed **since** the last deep pass — Mediclaim, the biometric attendance engine, and hiring-approval logic — including the one file with uncommitted local changes, `app/Services/Mediclaim/PolicyEligibilityService.php`.

Two independent read-only subagents performed the work; no git/AWS/SSH command was executed, no file was modified, `.env` was never opened, and no destructive/state-changing request was made.

---

## 1. Executive Summary

- **9 previously-CONFIRMED findings re-checked: 6 fixed, 2 still present (1 by design), 1 partially fixed.**
- **3 new High-severity findings** in code added/changed since the last audit (Mediclaim employee lookup, a tenant-scope bypass flag, and biometric→employee resolution).
- **No new Critical finding.** The prior Critical (unauthenticated `/storage/{path}` PII streamer) is now fixed.
- Hiring-approval workflow (`JobRequisitionApprovalService`) and the Mediclaim claims review workflow were both examined fresh and found soundly scoped — no bypass found in either.
- Two items remain genuinely open: authorization is still running in global **shadow mode** (advisory-only granular permissions — a documented, intentional staged rollout, not a regression), and **CORS is still wildcard** on origins/methods/headers (mitigated by `supports_credentials=false`).
- Root-level debris changed composition but did not disappear: the previously-flagged `deploy_clean.zip`/`HRM.pem`/`test_*.php` are gone, but `AppIcons.zip`, `certificates.zip`, `patch.py`, `update.py`, and multi-MB log files are now sitting in the repo root.

| Severity | New this pass | Still open from prior audits (re-verified) | Carried forward, not re-verified this pass |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 3 | 2 (shadow-mode authz — by design; CORS wildcard) | see §22 (prior docs) |
| Medium | 1 | 1 (root debris, partial) | see §22 |
| Low/Info | 4 | — | — |

## 2. Environment & Scope

- **Project inspected:** `salary-slip-bac` (Laravel 12 API) — Mediclaim module, biometric attendance engine, hiring-approval service, plus targeted re-checks of `routes/web.php`, `config/authorization.php`, `config/cors.php`, `UserController`, `CandidateAuthController`, `CandidateDocumentController`, `AssetController`, `DatabaseSeeder.php`.
- **Local URL / ports tested:** none — this was a static-only pass (no local server was started or confirmed running); all findings are source-level.
- **Application technology:** PHP 8 / Laravel 12, PostgreSQL.
- **Testing limitations:** static analysis only, no dynamic requests were made this pass (see §28).
- `AWS NOT ACCESSED` · `SSH NOT USED` · `GIT NOT USED` · `PRODUCTION NOT ACCESSED`

## 3. Application Architecture

```text
React SPA (salary-slip-front)
   ↓ fetch/JWT
Laravel 12 API (salary-slip-bac)
   ↓
jwt.auth → permission:<code> (shadow-mode enforcement) → Controller
   ↓
Services (Mediclaim/PolicyEligibilityService, Biometric/BiometricUserResolver, Hr/JobRequisitionApprovalService, ScopesCompany trait)
   ↓
Eloquent → PostgreSQL (niss_hrms)
   ↓
External: EssI biometric devices (sync-essl), S3-backed document storage
```

No changes to this architecture were found; it matches the prior audits.

## 4–5. Route Inventory & API Security Audit — Delta Only

Full route/API inventories already exist in `docs/AUDIT-2026-08-13-full-application-readonly.md` §9–13 and `functional-analysis-report/08-api-reference.md`; not re-enumerated here. New/changed surfaces examined this pass:

- `routes/mediclaim.php` — every route requires `jwt.auth` + a `permission:` gate; claim routes' broad OR-permission lists are intentional and backed by real per-row scopes in `MediclaimClaim::scopeVisibleTo()`/`scopeDecidableBy()`. **No issue found.**
- `POST .../attendance/sync-essl` (`routes/api.php:1389`) — gated by `permission:hr.attendance.update`. Not reachable unauthenticated, but see DF-3 (cross-company data corruption risk for legitimate users of either tenant).
- `GET /admin/employees` and `POST /admin/employees/bulk-issue-cards` under the Mediclaim admin group — see DF-2 (tenant-scope bypass via request flag).
- `routes/web.php` `/storage/{path}` — reworked since the last audit; see §7 item 1 (fixed).

## 6. Unauthenticated Endpoint Findings

No new unauthenticated-access finding. The previously Critical unauthenticated `/storage/{path}` PII streamer is fixed (see §7, item 1). No other unauthenticated route was newly discovered granting sensitive data.

## 7. Authorization / IDOR / BOLA Findings

### Re-verified from the 2026-08-13 audit

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | `routes/web.php` unauthenticated `/storage/{path}` PII streamer + `public/uploads/` served identity docs | **FIXED** | `routes/web.php:26-89` now rejects traversal/absolute/UNC paths, blocklists `candidate-documents/`, `documents/`, `private/`, `backups/`, `rbac-readiness/`, and only serves from the `public` disk/`users` photo subtree; `config/filesystems.php:75-83` `'links' => []` (no public symlink); `public/uploads/` no longer exists on disk. New `/local-documents/{path}` route requires a signed URL unless the path is a photo asset. |
| 2 | `config/authorization.php` global shadow mode — granular permissions advisory, numeric role is real authority | **STILL PRESENT — by design** | `config/authorization.php:22` `default_mode` still defaults to `shadow`; `enforced_permissions`/`enforced_prefixes` (L24-30) still default empty; only `admin.authorization.`/`admin.policy.` always enforced. This is documented staged-rollout config, not a regression — but the underlying risk (legacy numeric-role fallback authority) is unchanged since 2026-08-13. Middleware internals (`RequirePermission`) were not re-walked this pass — config alone was checked. |
| 3 | Privilege escalation via `assign-permissions` (no tier allow-list) and via `guardPrivilegedFields` (stripped `role` only when `===0`) | **FIXED** | `Api/V1/Admin/UserController::assignPermissions` now blocks non-super-admins from touching their own permissions and from granting `is_sensitive`/`admin.authorization.`/`admin.policy.`/`admin.role.`/`admin.company.`/`admin.unit.`/`admin.user.assign_permission`-prefixed codes. `guardPrivilegedFields` now always strips `is_super_admin/is_hidden/is_system_account/is_protected/added_by/permissions`, and for any non-super-admin actor unconditionally strips `role/type/is_deleted` (not just when the incoming value is `0`). |
| 4 | `CandidateDocumentController` — zero company scoping across all 4 methods (worst IDOR in the 08-16 audit: cross-tenant Aadhaar/PAN/bank document access) | **FIXED** | Now imports/uses `ScopesCompany`; every method funnels through `loadScopedCandidate`/`loadScopedDocument`, which call `companyCodeWithinActorScope()` before returning a record. |
| 5 | `AssetController::show/update/destroy` unscoped while siblings were scoped | **FIXED** | All six mutating/read methods now call `denyUnlessRecordInScope()`/`denyUnlessEmployeeInScope()`, matching `index()`. |
| 6 | `CandidateAuthController::register()`/`forgotPassword()` returning raw verification/reset tokens in the JSON response (account takeover without email access) | **FIXED** | Both now send real emails (`sendVerificationEmail()`, `sendResetPasswordEmail()` via `Mail::to()->send()`); no token appears in the response body; `forgotPassword()` returns a generic enumeration-safe message. |
| 7 | `DatabaseSeeder.php` hardcoded default super-admin password (`Admin@niss123`) fallback | **FIXED** | No literal fallback remains; production throws `RuntimeException` if `SEED_SUPER_ADMIN_PASSWORD` is unset, non-production generates a random 24-char password. |

### New findings — Mediclaim & Biometric modules (this pass)

**Finding ID: DF-1**
**Title:** Mediclaim employee lookup has no company/tenant scoping — cross-tenant medical-data IDOR
**Severity:** High **Confidence:** CONFIRMED
**Category:** IDOR / BOLA
**Affected File:** `app/Http/Controllers/Api/V1/Mediclaim/Admin/EmployeeController.php`
**Affected Function:** `show()`, lines 137-183
**Affected Endpoint:** `GET /admin/mediclaim/employees/{employee}` (exact path per `routes/mediclaim.php`)
**Authentication Required:** Yes (JWT) **Authorization Required:** `mediclaim.enrollment.read` permission (company-scoped by design elsewhere in the same controller)
**Affected Role:** Any holder of `mediclaim.enrollment.read` **Affected Tenant/Company:** All — cross-tenant
**Evidence:** `show()` runs `User::query()->where('is_deleted',0)->where('id',$employee)->first()` with **no** `applyCompanyScope()` call, unlike `index()`/`bulkIssue()` in the same file (`baseEmployeeQuery()`). It then returns that employee's Mediclaim enrollment, family-member records (names/DOB/relationship), cards, and pending change-requests.
**Safe Reproduction (static only — not executed):** trace the route to `show($employee)`; compare against `index()`'s `baseEmployeeQuery()` which does call company scoping.
**Security Impact:** A company-scoped HR/Mediclaim admin from Company A can read Company B's employees' medical enrollment and family data by iterating `{employee}` IDs.
**Data at Risk:** Medical enrollment status, dependent family member PII, mediclaim card details.
**Attack Preconditions:** Valid session with `mediclaim.enrollment.read` in any company.
**Recommended Remediation:** Route `show()` through the same `baseEmployeeQuery()`/`applyCompanyScope()` path as `index()`, or add an explicit `companyCodeWithinActorScope()` check before returning.
**Validation Method:** Unit/feature test asserting a non-global-scope user gets 403/404 for an employee ID outside their company.

**Finding ID: DF-2**
**Title:** `bypass_company_scope` request flag disables tenant scoping for any caller, not just global-scope roles
**Severity:** High **Confidence:** CONFIRMED
**Category:** Authorization / Tenant Isolation
**Affected File:** `app/Http/Controllers/Api/V1/Mediclaim/Admin/EmployeeController.php`
**Affected Function:** `baseEmployeeQuery()`, lines 236-238
**Affected Endpoint:** `GET /admin/mediclaim/employees` and `POST /admin/mediclaim/employees/bulk-issue-cards`
**Authentication Required:** Yes **Authorization Required:** `mediclaim.enrollment.read`/`.create` (company-scoped by intent)
**Affected Role:** Any company-scoped holder of those permissions **Affected Tenant/Company:** All
**Evidence:** `if (! $request->boolean('bypass_company_scope')) { $this->applyCompanyScope($query, $request); }` — there is no check that the caller actually `hasGlobalCompanyScope($userAuth)` (the helper that legitimately exists in `ScopesCompany.php:64` for this exact purpose) before honoring the flag.
**Security Impact:** Appending `?bypass_company_scope=1` to either request lets a single-company HR user list, and bulk-issue Mediclaim cards for, every employee company-wide — a straightforward tenant-isolation bypass via a client-controlled parameter.
**Data at Risk:** Full cross-tenant employee directory + ability to trigger bulk card issuance for other companies' employees.
**Attack Preconditions:** Any authenticated session with the two named permissions in one company.
**Recommended Remediation:** Gate the flag behind `hasGlobalCompanyScope($userAuth)` before skipping `applyCompanyScope()`; otherwise ignore the flag for non-global roles.
**Validation Method:** Feature test: company-scoped user + `bypass_company_scope=1` must still only see their own company's employees.

**Finding ID: DF-3**
**Title:** Biometric device→employee resolution is not company-scoped, despite `emp_code` being unique only per company
**Severity:** High **Confidence:** CONFIRMED
**Category:** Business Logic / Multi-Tenant Isolation
**Affected File:** `app/Services/Biometric/BiometricUserResolver.php`
**Affected Function:** `loadUsers()`, lines 136-179 (consumed by `EsslBiometricService::syncAttendance()` line 444)
**Affected Endpoint:** `POST /admin/attendance/sync-essl` (`permission:hr.attendance.update`)
**Authentication Required:** Yes **Authorization Required:** `hr.attendance.update`
**Affected Role:** Any HR user permitted to trigger biometric sync in either of two companies sharing an `emp_code` value **Affected Tenant/Company:** Cross-company data attribution, not unauthenticated access
**Evidence:** `User::where('is_deleted',0)->where(fn($q)=>$q->whereIn('emp_code',$empCodes)->orWhereIn('punching_no',$empCodes)->orWhereIn('form_no',$empCodes)...)` has no `company_code` filter. The codebase's own migration (`2026_09_22_000005_create_attendance_employee_code_map_table.php:49`, referencing `2026_08_13_180000_add_user_id_to_salary_slips_and_attendances.php`) documents `emp_code` as unique only per `(company_code, emp_code)` — i.e., reusable across companies. If two companies share an `emp_code`, `loadUsers()`'s foreach lets the later-fetched user silently overwrite the earlier one in `$this->userLookup`, so a punch/attendance record can be attributed to the wrong employee in a different company.
**Security Impact:** Attendance and (downstream) payroll data can be misattributed across tenants — this is exactly the class of bug the "biometric user resolution, attendance employee mapping" fix commit targeted, and it persists in the current unified resolver. Not remotely exploitable by an unauthenticated attacker (route is permission-gated), but a legitimate HR user's routine sync can corrupt another company's attendance data.
**Data at Risk:** Attendance records, and by extension payroll accuracy, for the misattributed employee(s).
**Recommended Remediation:** Scope the `User::where(...)` lookup by the biometric device's/sync request's `company_code` before matching on `emp_code`/`punching_no`/`form_no`.
**Validation Method:** Test with two seeded users in different companies sharing the same `emp_code`; assert `loadUsers()` resolves each device punch to the correct company's user only.

### Examined and found sound (no issue)

- **`app/Services/Hr/JobRequisitionApprovalService.php`** — every transition (`submit`, `forwardToDirector`, `directorDecision`, `returnToDepartmentHead`, `respondToDirector`, `withdraw`) checks `assigned_to`/`hr_manager_id`/`director_id` against the actor (or requires super-admin), `assertIndependentReviewer()` blocks a requester or same-stage decider from self-approving, and `qualifiedApprover()` cross-checks company membership before an HR Manager/Director assignment. **No bypass found.**
- **Mediclaim claim workflow** (`ClaimController`/`ReviewQueueController`) — access is gated through `MediclaimClaim::scopeVisibleTo()`/`scopeDecidableBy()`, which are 404-concealing, company-scoped-via-`mediclaim_reviewer_assignments` query scopes. `PolicyEligibilityService` itself takes no auth responsibility by design (correctly, since callers already scope), and its only caller for self-service (`MyCoverageController`) always passes `auth('api')->user()` — no IDOR there.

## 8. Data Leakage Findings

- DF-1/DF-2 above are the material new data-leakage risk this pass (cross-tenant medical/family PII, cross-tenant employee directory).
- No new secrets/credential leakage found in the modules examined this pass (see §16 for what carries forward unverified).

## 9–10. Authentication / Session / JWT / Cookie Findings

Not independently re-verified this pass (out of scope of the two delta agents). Prior audit's JWT-TTL (30 days, no revocation on password change), sessionStorage placement, and shadow-mode interaction remain as documented in `AUDIT-2026-08-13-full-application-readonly.md` §14 (F-S8) and `functional-analysis-report/16-security-audit.md` §17.1/17.11 — recommend re-verification in a future pass since neither delta agent touched auth/session code.

## 11. Injection Findings

No new SQL/NoSQL/command/SSRF/path-traversal/template-injection issue found in the Mediclaim, biometric, or hiring-approval code examined this pass. Consistent with prior audits' conclusion of no SQL injection found codebase-wide (Eloquent/parameterized query builder used throughout).

## 12–15. Frontend / Backend / Database / File Upload Findings

Not re-examined this pass beyond the controllers/services listed above. See prior audits (`AUDIT-2026-08-13-full-application-readonly.md` §14 F-D1–F-D12, F-B1–F-B9; `2026-08-16-hr-module-deep-audit/`) for the standing register — these were not re-verified in this session and should not be assumed current without a fresh check.

## 16. Secrets & Credential Findings

- **Root-level debris — re-verified, composition changed:**
  - **Fixed / no longer present:** `deploy_clean.zip` (previously bundled real `.env` + a PII SQLite snapshot), `HRM.pem` (AWS EC2 private key), `test_*.php`/`patch_*.js`/`temp_*.txt`.
  - **Still present, newly/independently flagged:** `AppIcons.zip` (4.3MB), `certificates.zip` (8.5KB), `patch.py`, `update.py`, `dev-client.log`, `dev-stack.log` (1.7MB) at the repo root — existence confirmed via directory listing only; **not opened or extracted** (per read-only/secret-handling rules, since `certificates.zip` in particular could contain key material).
- `.env` was not opened this pass. Whether `APP_DEBUG`/`APP_ENV` and the previously-reported secret sprawl inside `.env`/`.env.example` are still as documented in the 2026-08-13 audit (F-S2, F-S4) was **not re-checked** — carried forward as unverified this session.

## 17. CORS / Security Headers Findings

- **CORS wildcard — STILL PRESENT.** `config/cors.php`: `allowed_methods=['*']`, `allowed_origins=['*']`, `allowed_headers=['*']`, covering `storage/*` and the new `local-documents/*` paths too. Mitigating factor: `supports_credentials=false`, so the wildcard cannot be combined with credentialed cross-origin requests to steal cookies/bearer tokens via CORS reflection — but the origin/method/header wildcard itself is unchanged since 2026-08-13.
- Global `SecurityHeaders` middleware (CSP, X-Frame-Options, HSTS, etc.) was not re-examined this pass; see `functional-analysis-report/16-security-audit.md` §17.13 for its last-known state.

## 18. Dependency Findings

Not in scope of this delta pass — no `composer.lock`/`package.json` review was performed this session.

## 19. Business Logic Findings

Covered under §7 — Hiring approval and Mediclaim claim workflows examined fresh and found sound; the three DF- findings are themselves business-logic/tenant-isolation gaps.

## 20. Functional Bug Report

**Bug ID:** DF-4
**Title:** Hardcoded fallback constants in `PolicyEligibilityService` contradict the class's own "nothing is hardcoded" doc comment
**Severity:** Low **Confidence:** CONFIRMED
**Affected File:** `app/Services/Mediclaim/PolicyEligibilityService.php`, lines 178-181 and 289-290
**Affected Component:** Mediclaim policy eligibility calculation
**Precondition:** A policy version's `rules['floater_limit_amount']` is missing/≤0, or `eligibility_waiting_period_months` is unset.
**Steps to Reproduce:** Read the two code blocks; both fall back to a literal (₹300,000 floater limit; 3-month waiting period) instead of a config value.
**Expected Result:** Per the class's documented design intent, defaults should come from `config/mediclaim.php`.
**Actual Result:** Defaults are inline literals.
**Evidence:** `$limit = 300000.0` / `$months = 3` in the file at the lines above.
**Impact:** Low — these appear to be intentional, reasonable business defaults, not a logic error, but they drift from the class's own documentation and make the defaults harder to find/change in one place.
**Recommended Fix:** Move both constants into `config/mediclaim.php`.
**Validation Method:** Code review only; no behavioral test needed since values are unchanged, just relocated.

## 21. Reliability / Stability Findings

None found this pass in the modules examined.

## 22. Potential Issues Requiring Verification

- `AdminReportController::export`'s in-controller `.reveal` permission check for `?includeSensitive=1` on Mediclaim reports — **not independently verified this pass** (file not read). Flagged because it gates sensitive medical/financial export fields and the enforcement is described as controller-level rather than route-level by design.
- `AdminClaimController::markPaymentCompleted()` and `MediclaimMemberService::ensureSelfCoverageIssued()` — not read this pass.
- `RequirePermission` middleware internals for the shadow-mode fallback path (item 2 in §7) — only `config/authorization.php` was re-checked this pass, not the middleware logic itself; the 2026-08-13 audit's characterization of the fallback behavior was not re-derived from source this session.
- Everything in the prior audits' registers (`AUDIT-2026-08-13-full-application-readonly.md` §14 Medium/Low/Info items, `2026-08-16-full-codebase-map/06-findings-bugs-security.md`, `2026-08-16-hr-module-deep-audit/00-critical-findings.md`) that was **not** one of the 9 items explicitly re-checked in §7 of this report — treat those as **last confirmed 2026-08-13/2026-08-16**, not current, until re-verified.

## 23. API Coverage

| Metric | Value |
|---|---|
| Endpoints statically re-reviewed this pass | ~8 (Mediclaim employee/admin routes, sync-essl, storage/local-documents, assign-permissions, candidate auth/document routes, asset routes) |
| Endpoints dynamically tested this pass | 0 (static-only pass; no local server confirmed running) |
| Endpoints covered by prior audits, not re-touched this pass | ~280 (see `AUDIT-2026-08-13-full-application-readonly.md` §7-8) |
| New Critical/High findings this pass | 3 (DF-1, DF-2, DF-3) |
| Previously Critical/High findings re-verified fixed | 6 of 9 |
| Previously Critical/High findings re-verified still open | 2 of 9 (1 by design) |

## 24. Security Coverage Matrix

| Security Area | Static Review | Dynamic Local Test | Result | Coverage | Notes |
|---|---|---|---|---|---|
| Authorization (Mediclaim) | Yes | No | 2 High findings (DF-1, DF-2) | New module, full | — |
| Multi-tenant isolation (Biometric) | Yes | No | 1 High finding (DF-3) | New module, full | — |
| Business logic (Hiring approval) | Yes | No | Clean | Full | No bypass found |
| Business logic (Mediclaim claims) | Yes | No | Clean | Full | Scopes verified sound |
| Unauthenticated file access | Yes | No | Fixed since 2026-08-13 | Re-verified | — |
| Privilege escalation (assign-permissions, employee edit) | Yes | No | Fixed since 2026-08-13 | Re-verified | — |
| Seed credentials | Yes | No | Fixed since 2026-08-13 | Re-verified | — |
| Candidate account takeover (token leak) | Yes | No | Fixed since 2026-08-13 | Re-verified | — |
| CORS | Yes | No | Still wildcard (mitigated) | Re-verified | Same as 2026-08-13 |
| Authz shadow-mode | Yes | No | Still shadow (by design) | Re-verified (config only) | Middleware not re-walked |
| Secrets sprawl (root debris) | Yes (listing only) | No | Old debris gone, new debris present | Partial | Zips not opened |
| Auth/session/JWT | No | No | — | Not covered this pass | See prior audits |
| Injection (SQLi/XSS/SSRF) | Yes (scoped to modules touched) | No | Clean in modules touched | Partial | Full codebase not re-swept |
| Dependencies | No | No | — | Not covered this pass | — |

## 25. Complete Findings Summary

| ID | Severity | Category | Finding | Affected Area | Confidence |
|---|---|---|---|---|---|
| DF-1 | High | IDOR | Mediclaim `EmployeeController::show()` unscoped cross-tenant medical data read | Mediclaim | CONFIRMED |
| DF-2 | High | Tenant isolation | `bypass_company_scope` flag skips scoping for any caller | Mediclaim | CONFIRMED |
| DF-3 | High | Multi-tenant/business logic | Biometric resolver not company-scoped on non-unique `emp_code` | Biometric attendance | CONFIRMED |
| DF-4 | Low | Bug/hygiene | Hardcoded eligibility fallback constants | Mediclaim | CONFIRMED |
| — | High(prior) | Authorization | Global shadow-mode authz — advisory permissions | Authorization core | CONFIRMED (still present, by design) |
| — | Medium(prior) | CORS | Wildcard origins/methods/headers | Global | CONFIRMED (still present) |
| — | Medium(prior) | Secrets hygiene | Root debris (zips, patch/update scripts, logs) | Repo root | CONFIRMED (composition changed) |

## 26. Recommended Remediation

### Critical Remediation
None outstanding from this pass.

### High-Priority Remediation
1. Add company scoping to `Mediclaim/Admin/EmployeeController::show()` (DF-1).
2. Gate `bypass_company_scope` behind `hasGlobalCompanyScope()` (DF-2).
3. Scope `BiometricUserResolver::loadUsers()` by `company_code` before matching `emp_code`/`punching_no`/`form_no` (DF-3).
4. Decide and execute the shadow→enforced authorization migration plan (carried forward from 2026-08-13; still open).
5. Restrict `config/cors.php` to known origins (carried forward; still open).

### Medium Remediation
- Verify `AdminReportController::export`'s `.reveal` gate for Mediclaim exports (§22).
- Clear/relocate root-level debris (`AppIcons.zip`, `certificates.zip`, `patch.py`, `update.py`, log files) out of the repo working tree.

### Low / Hardening
- Move `PolicyEligibilityService`'s hardcoded fallback constants into `config/mediclaim.php` (DF-4).

## 27. Validation Plan

- DF-1/DF-2: add feature tests asserting a company-A user cannot read/list/bulk-act on company-B employees via Mediclaim endpoints, with and without the `bypass_company_scope` flag.
- DF-3: seed two companies sharing an `emp_code`; assert a biometric sync attributes punches to the correct company's user only.
- Shadow-mode/CORS: re-audit once the team has a target date for enforcing prefixes / restricting origins; not actionable as a "test" until a decision is made.

## 28. Audit Limitations

- This was a **static-only** pass — no local server was confirmed running, so no dynamic HTTP testing (authenticated or unauthenticated) was performed this session.
- `.env` was never opened; `APP_DEBUG`/`APP_ENV`/secret-sprawl status from the 2026-08-13 audit was **not re-verified** this session.
- Auth/session/JWT, frontend, database schema, file-upload, and dependency areas were **not re-examined** this session — treat their last-known state (2026-08-13/2026-08-16 docs) as unconfirmed-current.
- `RequirePermission` middleware internals (shadow-mode fallback logic) were not re-walked; only `config/authorization.php` was re-checked.
- `certificates.zip` and `AppIcons.zip` were not opened/extracted (read-only + secret-handling policy).
- `AdminReportController::export`, `AdminClaimController::markPaymentCompleted()`, `MediclaimMemberService::ensureSelfCoverageIssued()` were not read this pass.

---

## 29. Final Forensic Summary

```text
AUDIT MODE: READ-ONLY
LOCAL-ONLY TESTING: YES (static analysis only; no dynamic requests made)

SOURCE CODE MODIFIED: NO
CONFIGURATION MODIFIED: NO
DATABASE MODIFIED: NO
LIVE DATA MODIFIED: NO

GIT ACCESSED: NO
GIT COMMAND EXECUTED: NO
.GIT ACCESSED: NO

AWS ACCESSED: NO
AWS CLI USED: NO
EC2 ACCESSED: NO
RDS ACCESSED: NO
S3 ACCESSED: NO
CLOUDWATCH ACCESSED: NO

SSH USED: NO
SCP USED: NO
SFTP USED: NO
RDP USED: NO
SSM USED: NO
REMOTE SHELL USED: NO

PRODUCTION ACCESSED: NO
REMOTE SERVER ACCESSED: NO
REMOTE API ACCESSED: NO

DEPLOYMENT EXECUTED: NO
CI/CD TRIGGERED: NO

PACKAGES INSTALLED: NO
PACKAGES UPDATED: NO

DATABASE WRITES: NO
STATE-CHANGING API REQUESTS: NO
DESTRUCTIVE TESTS: NO
BRUTE FORCE: NO
LOAD TESTING: NO
STRESS TESTING: NO

AUTO-FIXES APPLIED: NO
SOURCE FILES CHANGED: NO

LOCAL SECURITY TESTING: NO (dynamic testing not performed this pass)
STATIC ANALYSIS: YES
API ROUTE ANALYSIS: YES (delta only — see §22 for what was not re-covered)
DATA-LEAKAGE ANALYSIS: YES
AUTHORIZATION ANALYSIS: YES
BUG ANALYSIS: YES
```
