# Executive summary

**Verdict: NOT PRODUCTION READY** — the code is much safer, but a live database permission problem and a deleted mobile app folder need an owner decision first.

## What changed

| Gate | Before | After |
|---|---|---|
| Web ESLint | 775 errors, 21 warnings | **0 / 0** |
| Web build | — | passes |
| Web tests | hung | run in 26 s; 100 failures, all pre-existing where comparable |
| Laravel PHPUnit | 83 failing of 1,143 (brief said 13) | **1 failing of 1,145** (deferred) |
| Node service | tsc 0, 6 test failures | tsc 0, **0 test failures** |
| Mobile | 1 failure (insecure HTTP default) | fixed, 12/12 — then folder deleted from disk |

## Most important fixes

- Company admins could list every company's employees, trial-form applicants (with Aadhaar) and salary slips. Fixed.
- Password reset could send the OTP to a number chosen by the requester and revealed which accounts exist. Fixed.
- A requester holding both review permissions could approve their own job requisition. Fixed.
- Custom roles got 403 on the permission snapshot the browser needs to render the app. Fixed.
- Workforce and Recruitment Dashboard pages crashed on load; 272 of the ESLint errors were real crashes. Fixed.
- Promotions/transfers failed and ended reporting lines kept receiving escalations. Fixed.

## Needs the owner

1. **Every role, including employees and agents, holds all 55 Mediclaim permissions in the live database** (from a committed "local testing" migration). The migration is now disabled outside local/testing, but the existing grants must be removed deliberately.
2. **`NISS HRMS` and `AppIcons` were deleted from disk at about 14:43** by something other than this work. Restore with `git checkout` if unintended and re-apply the mobile fix.
3. Decide whether role 1 is company-scoped or global in HR/Mediclaim/Organization, and whether approved requisitions may be edited without re-approval.
4. Nothing is committed or deployed; the fixed exposures are still live on AWS until this is released.

Details: `final-report.md`, `backend-test-failures.md`, `remaining-risks.md`.
