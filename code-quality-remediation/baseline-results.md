# Baseline results — 2026-09-15

## Repository state at start

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `ec8d26e5 fix(migration): make positions migration driver-agnostic for sqlite and mysql` |
| Working tree | 428 changed paths before any remediation: uncommitted Mediclaim/department-head feature work in `salary-slip-bac` and `salary-slip-front`, ~370 deleted `dist/assets` files, untracked migrations `2026_09_15_000032…000037`, untracked `patch.py` / `update.py` |
| Concurrent activity | A second session was applying this same brief at 13:17–13:21 (edited `apiUrl.js`, `CandidateQuiz.jsx`, `MediclaimCardVerify.jsx`, `ManagerSection.jsx`, `payslipUtils.js`, `pdfUtils.js`, `WorkforceListPage.jsx`, started `eslint` and `phpunit`). Work paused; the owner chose to stop that session and assign ownership here. |

The pre-existing working tree, including the other session's partial edits, is the baseline below. The audit brief's own figures are listed alongside.

## Gates

| Module | Command | Brief reported | Reproduced baseline | Notes |
|---|---|---|---|---|
| `salary-slip-front` | `npx eslint . -f json` | 792 errors / 21 warnings | **775 errors / 21 warnings** (464 files, 26 s) | The other session had already altered a handful of files. 3 files did not parse. |
| `salary-slip-front` | `npx vitest run` | not run | **Hangs** (never completes; a leftover run from 12:54 was also hung) | Root causes: `setupFiles` removed from `vitest.config.js` in `8f962d0f`; `[user]` effect dependencies re-fetching forever under mocked `useAuth`. |
| `NISS HRMS` | `node --test` | 1 failed | 7/7 pass **on the other session's edit**; at HEAD `the production fallback is https` fails | The passing state depended on an invented host `https://api.niss.pro/api`. |
| `salary-slip-bac` | `php vendor/bin/phpunit` | 1,143 tests / 13 failures | **1,143 tests / 79 failures + 4 errors** (8 m 39 s, database `niss_hrms_test`, no cached config) | Failing classes re-run on a clean `git archive HEAD` copy: 77 fail at HEAD, 6 introduced by uncommitted work. |
| `salary-slip-node` | `npx tsc --noEmit` | 0 errors | **0 errors** | |
| `salary-slip-node` | `npx prisma validate` | not run | **valid** | |
| `salary-slip-node` | `npx vitest run` | not run | **6 failed / 643 passed / 7 skipped** | Expired JWT fixture (5), hard-coded "6-digit OTP" copy (1). |

## Test database safety

`phpunit.xml` forces `DB_CONNECTION=pgsql`, `DB_DATABASE=niss_hrms_test`, `DB_URL=""`; no `.env.testing`; no `bootstrap/cache/config.php`. `.env` points at `niss_hrms`, which PHPUnit therefore never touched. The standing rule that the automated suite may use `niss_hrms_test` was followed; no manual connection to it was made. Read-only queries (`migrate:status`, grant counts) were run against `niss_hrms`.
