# HRMS Code Quality Remediation — Final Report

2026-09-15 · branch `main` · HEAD `ec8d26e5` · nothing committed or deployed

## 1. Executive verdict

**NOT PRODUCTION READY**

The code in the working tree is substantially safer and the quality gates moved from red to near-green, but three things block release:

1. The live database (`niss_hrms`) currently grants every role, including employees and agents, all 55 Mediclaim permissions — claim decisions, settlement, medical reports. This came from a committed "local testing" migration and needs an owner-approved revocation.
2. The mobile app folder `NISS HRMS` and `AppIcons` were deleted from disk during the session by an action outside this remediation, taking the mobile fix with them.
3. Several fixed defects are data exposures that are live in the deployed builds until this work is reviewed, committed and deployed; one Laravel test stays red because 157 permission codes have no Permission Matrix owner.

## 2. Original baseline

| Gate | Brief | Reproduced |
|---|---|---|
| Frontend ESLint | 792 errors / 21 warnings | 775 errors / 21 warnings (3 unparseable files) |
| Frontend Vitest | — | hung, never completed |
| Mobile `node --test` | 1 failed | 1 failed at HEAD; passing only on another session's invented `api.niss.pro` host |
| Laravel PHPUnit | 13 failed / 1,143 | **79 failures + 4 errors / 1,143**; 77 fail at clean HEAD, 6 from uncommitted work |
| Node `tsc` | 0 | 0 |
| Node Vitest | — | 6 failed / 643 passed |

The brief's explanations for the Laravel failures ("seed timing, fixture mismatches, table mocks") were not supported by evidence. See `backend-test-failures.md`.

A second session was applying this same brief concurrently at session start and had introduced lint workarounds and a breaking rename; the owner stopped it and those edits were replaced.

## 3. Root causes (P0/P1)

| # | Finding | Root cause | Why it existed | Impact | Fix | Evidence | Remaining risk |
|---|---|---|---|---|---|---|---|
| 1 | Company admins (role 1) see all companies' employees, trial-form applicants (with Aadhaar) and salary slips | `6abc168b` (08-20) moved `UserController`/`SalariesSlipController` onto `ScopesCompany`, whose global roles are `[0,1]`; `bbde458f` made its match a substring `LIKE` | Unifying scoping for HR Manager accounts without checking the old role-1 rule | Cross-tenant PII and payroll exposure | Role-0-only override for employee, salary-slip and asset controllers; exact CSV membership with escaped `LIKE` | `TrialFormAuthorizationTest`, `EmployeeListScopeTest`, `AssetCrossCompanyApiTest`, new prefix-collision test | Role 1 still global in HR/Mediclaim lists and Organization services (decision needed) |
| 2 | Password reset sends OTP to a caller-supplied number; account enumeration | `cd6de2d7` (08-12) switched to SMS with `mobile_number ?? $request->mobile` and an explicit "not found" reply | Channel change dropped the email flow's safety properties | Account takeover for employees without a mobile on file; address oracle; mobile numbers in logs | OTP only to number on file, identical generic reply, 500 on failed send, no mobile in logs | 27 reset/OTP tests incl. 3 new | None known |
| 3 | Mediclaim grants to every role | Migration `…000031_grant_mediclaim_permissions_to_all_roles_for_local_testing` committed and run | Testing convenience shipped as a migration | Employees/agents can administer other employees' medical claims | Migration no-ops outside local/testing | Read-only grant count on `niss_hrms` | **Live grants remain — owner action** |
| 4 | Requisition self-approval | Pool-mode (no named reviewer) HR forward and Director decision checked only the permission | Redesign kept SoD checks only for named reviewers | Requester holding both review permissions approves own headcount | `assertIndependentReviewer()` on every step; review-state edit lock | Rewritten workflow test (all SoD assertions kept) | Approved/posted still editable (decision needed) |
| 5 | Snapshot/self-service endpoints return 403 | `bbde458f`/`dfbd625c` added `self.profile.read` to documented-ungated routes | "Audit missing permission gates" applied mechanically | Custom roles without that code cannot load their permission snapshot, request access or pick companies | Gates removed where documented ungated; kept where the registry requires them | 31 authorization tests | — |
| 6 | Employee detail 500s; list endpoint writes on GET | Uncommitted dept-head code compared bigint ids with emp-code strings and bulk-updated designations on every list read | In-flight feature | Employee view broken for alphanumeric codes; silent master-data mutation | Id-only comparisons; GET write removed | Aadhaar/employee tests (185) | Title-based manager access (P1 risk) |
| 7 | Promotions/transfers fail | Undefined `code` key (6 services); `PositionHistory` table name; reporting mirror never propagated `is_active` to `status` | Parallel column families added without update sync | Org changes 500; ended managers still receive escalations | Null-safe key, `$table`, dirty-side mirror propagation | 119 org/reporting/ticket tests | — |
| 8 | Frontend pages crash | Workforce factory calling hooks, undefined `form`/`useNavigate`/icons, parse errors; Recruitment dashboard missing 29 imports | Scaffolding merged without running | Workforce and Recruitment Dashboard unusable | Real component, controlled forms, imports | ESLint 0; build passes; Designations test | Workforce create still blocked by empty selects |
| 9 | Frontend tests hang | `setupFiles` removed in `8f962d0f`; `[user]` deps re-fetching under mocked auth; Node 26 shadows jsdom storage | Unrelated commit edited test config | No frontend test signal at all | Config restored, primitive deps, storage polyfill | Suite runs in 26 s | 100 pre-existing failures |

## 4. Files changed

See `changes-made.md` for the per-file table (≈30 backend files, ≈100 frontend files, 1 Node test, 3 mobile files now deleted).

## 5. Frontend remediation

| | Before | After |
|---|---:|---:|
| ESLint errors | 775 | 0 |
| ESLint warnings | 21 | 0 |
| Parse errors | 3 | 0 |
| `no-undef` | 253 | 0 |
| `rules-of-hooks` | 16 | 0 |
| `set-state-in-effect` | 59 | 0 |
| `exhaustive-deps` | 21 | 0 |
| `no-unused-vars` | 434 | 0 |
| `eslint-disable` comments added | — | 0 (23 removed) |

Hook fixes use: request-key derived loading with cancellation; state set only in async callbacks; adjust-during-render resets; lazy `useState` initialisers. Patterns were verified against the repo's lint rules before the batch started; the other session's `setTimeout`/`Promise.resolve` dodges were removed. `payslipUtils` dead-assignment removal proven output-identical over 5,000 generated inputs. `pdfUtils` empty catches replaced by an explicit fallback chain with no logging.

## 6. Mobile remediation

- Insecure LAN default replaced by the documented `https://niss.pro/api`; `__DEV__` now reaches the resolver so development HTTP LAN overrides keep working; production refuses `http://` and malformed overrides with a console warning.
- 5 new tests; 12/12 passed at 13:31.
- `"type": "module"` not added: CommonJS Metro/Babel configs would break.
- **The `NISS HRMS` folder was deleted from disk at ~14:43 by an external action.** Restore with `git checkout -- "NISS HRMS" AppIcons` if unintended, then re-apply the code in `changes-made.md`.

## 7. Laravel remediation

All 83 baseline failures are classified individually in `backend-test-failures.md` (27 classes). Summary by resolution:

| Resolution | Tests |
|---|---:|
| Product defect fixed (authorization gates, scoping, reset security, SoD, org services, models, audit transaction, legacy schema, schema gate, seeder); includes 16 tests in three classes whose tests were also updated to the current contract | 67 |
| Test or fixture only, brought to current contract, no assertion weakened | 15 |
| Deferred (157 unowned permission codes) | 1 |

Final: **1,145 tests, 1 failure, 0 errors.**

## 8. Node service

| Gate | Found | Result |
|---|---|---|
| `tsc --noEmit` | configured | 0 errors |
| `prisma validate` | available | valid |
| `vitest run` | configured, not run by the audit | 6 failures fixed (expired fixture pinned to issue time + boundary test; "6-digit OTP" copy) → 650 pass, 7 skipped |
| lint | not configured | — |

## 9. Regression tests

See `regression-results.md` for every command and exit code. Key points: no frontend test that passes at HEAD fails now (outside the Mediclaim folder, whose HEAD suite hangs); every Laravel fix group was re-run by class before the full suite; Node suite green.

## 10. Final gate matrix

| Module | Gate | Before | After | Status |
|---|---|---:|---:|---|
| Web | ESLint errors | 775 | 0 | PASS |
| Web | ESLint warnings | 21 | 0 | PASS |
| Web | Production build | — | built | PASS |
| Web | Vitest | hung | 542 pass / 100 fail | FAIL (pre-existing) |
| Mobile | `node --test` | 1 fail | 12/12 at 13:31; folder deleted | BLOCKED |
| Backend | PHPUnit failures + errors | 83 | 1 | FAIL (1 deferred) |
| Node | TypeScript | 0 | 0 | PASS |
| Node | Prisma validate | — | valid | PASS |
| Node | Vitest failures | 6 | 0 | PASS |

## 11. Remaining risks

Full list with owners in `remaining-risks.md`. Highest:

1. Live Mediclaim grants to every role (P0, owner action).
2. Mobile and AppIcons folders deleted (owner action).
3. Fixed data exposures still deployed until release (P0).
4. 157 permission codes without Permission Matrix owners (P1).
5. Inconsistent role-1 company scope across modules (P1 decision).
6. Approved/posted requisitions editable without re-approval (P1 decision).
7. Title-based Manager Section access (P1).
8. 100 pre-existing frontend test failures (P2).

## 12. Release recommendation

**Do not release yet.** In order:

1. Revoke the Mediclaim grants on `niss_hrms` for roles that should not hold them (review the 55 codes per role).
2. Decide whether `NISS HRMS` and `AppIcons` were meant to be removed; if not, restore them and re-apply the mobile fix.
3. Review this diff (it sits on top of uncommitted Mediclaim/department-head work that was preserved and partially fixed), commit, restart `php artisan serve` for LAN, and deploy to AWS.
4. Decide the role-1 scope rule and post-approval requisition editing.
5. Schedule the Permission Matrix nodes for Workforce, Organization and Mediclaim so the last Laravel test can pass.
