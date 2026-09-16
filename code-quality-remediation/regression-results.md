# Regression results

All commands run on Windows 11, Node 26.3.0, PHP 8.5.8, PostgreSQL on 127.0.0.1.

## Frontend — `salary-slip-front/salary-slip-front`

| Command | Exit | Result |
|---|---:|---|
| `npx eslint .` | 0 | 467 files, 0 errors, 0 warnings |
| `VITE_ENV=PROD npx vite build --outDir <scratchpad>` | 0 | Built in 13 s (chunk-size advisory only) |
| `npx vitest run` (current tree) | 1 | 642 tests: 542 pass, 100 fail; completes in 26 s (baseline hung indefinitely) |
| `npx vitest run --exclude "src/features/mediclaim/**"` on a clean `git archive HEAD` copy with the same config and setup file | 1 | 465 tests: 371 pass, 94 fail |
| Test-by-test comparison, outside Mediclaim | — | **0 regressions** (no test passing at HEAD fails now), 0 newly fixed, 1 new passing test (Designations view modal) |
| `npx vitest run src/utils/payslipUtils.test.js` | 0 | 4/4 |
| Temporary differential test HEAD vs current `buildPayslipData`, 5,000 generated inputs | 0 | identical output; mutation check detected a planted formula change |
| Targeted suites run by agents with setup loaded | 0 | CardViewer 5/5, AdminMediclaimWorkspace all, CandidateCrmSections 8/8, CandidatePipeline 4/4, DesignationsPage 4/4 |

The Mediclaim folder at HEAD hangs, so its 6 current failures have no HEAD baseline (see remaining-risks #9).

## Node service — `salary-slip-node`

| Command | Exit | Result |
|---|---:|---|
| `npx tsc -p tsconfig.json --noEmit` | 0 | 0 errors |
| `npx prisma validate` | 0 | schema valid |
| `npx vitest run` | 0 | 23 files passed, 1 skipped; 650 passed, 7 skipped (integration tests require `INTEGRATION_DATABASE_URL`, unset) |

## Mobile — `NISS HRMS`

| Command | Exit | Result |
|---|---:|---|
| `node --test` (after fix, 13:31) | 0 | 12/12 pass (5 new) |
| `node --test` (final, 14:5x) | — | **Not runnable: folder deleted from disk at ~14:43 by an external action** |

## Backend — `salary-slip-bac`

Targeted class runs after each fix group (all against `niss_hrms_test`):

| Group | Tests | Result |
|---|---:|---|
| Company scoping (`Scope`, `CrossCompany`, `TrialForm`, `Salary`, `Appointment`, `Agent`, `EmployeeList`) | 138 | pass after test updates |
| Authorization snapshot / access requests / registry / shell | 118 → 62 | pass except registry coverage |
| Password reset and OTP | 27 | pass |
| Requisition / organization / recruitment | 88 | pass |
| Promotion / reporting / tickets / escalation | 119 | pass |
| Employee, department, Aadhaar, appointments, documents | 185 | pass |
| Mediclaim | 88 | pass |
| Schema gate, modules, tickets, notifications, hierarchy | 148 | pass |
| Legacy schema, portal capability, shell matrix | 32 | pass |

Full-suite result: see `quality-gates-final.json`.
