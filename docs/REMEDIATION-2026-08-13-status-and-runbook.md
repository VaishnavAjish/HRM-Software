# Remediation Status & Operational Runbook — 2026-08-13

> **Updated by a second remediation session later the same day — see §7 for what it closed and what remains.**

Follows the audit in [AUDIT-2026-08-13-full-application-readonly.md](AUDIT-2026-08-13-full-application-readonly.md).
Work was done **directly on the live tree** (LAN + prod serve from this working copy) at the operator's request, with small verified commits. Another session was concurrently editing `salary-slip-front/.../utils/api.js` and `HrDashboard.jsx`; those files were left untouched.

---

## 1. Fixed & committed (code)

| ID | Finding | Change | Commit |
|---|---|---|---|
| F-S1a | Unauth `/storage/{path}` served private disk, DB backups, RBAC dumps, resumes with CORS `*` | Route now serves the **public disk only**, blocks `candidate-documents/private/backups/rbac-readiness/documents`, hardens traversal, drops wildcard CORS + `ALLOWALL` framing. Employee photos still work; resumes go only through the authenticated endpoint. | `de80814e` |
| F-S5 | Seeder fell back to published `Admin@niss123` super-admin password | Throws in production if `SEED_SUPER_ADMIN_PASSWORD` unset; random password in non-prod. No env ever seeds a known root credential. | `26c5d044` |
| F-S2 | `.env.example` shipped `APP_DEBUG=true` (CI copies it) | Set `APP_DEBUG=false` in `.env.example`. | `26c5d044` |
| F-X1 | CI `secrets-scan` always red (matched the tracked public CA bundle) → deployment `gate` never passed | Excluded `storage/certs/cacert.pem` from both `\.pem$` greps; real keys still caught. | `26c5d044` |
| F-A3 | Employee edit mass-assigned `role` (mint admin); create mass-assigned security flags | `guardPrivilegedFields` strips `role/type/is_deleted` for non-super-admins and `is_super_admin/is_hidden/is_system_account/is_protected/added_by/permissions` for everyone; `store()` strips the same flags. | `ec1e5432` |
| F-A6 | `GET /department/get` created DB rows on read | Pure read: returns the union of registered + in-use department names, persists nothing. | `ec1e5432` |
| F-A4 | Candidate `update/destroy/moveStage` had no object scope (cross-tenant PII write) | All three now apply `candidateWithinActorScope()` like `show()`/`resume()`. | `cdd8be60` |
| F-A2 | `assign-permissions` had no grant ceiling (self-escalate to `admin.authorization.*`) | Non-super-admins can't grant authorization/policy/role/company/unit-admin or `is_sensitive` permissions, and can't target themselves. | `ceee1e12` |
| F-D2 | No DB uniqueness for one-slip-per-employee-month (duplicate slips under concurrency) | Added `UNIQUE(company_code, emp_code, month, year)`; migration self-aborts if duplicates exist. | `d161b63f` |
| F-F1 | `/admin/reports` rendered + exported 100% fabricated payroll (`mockData.js`) | Replaced with an honest "not available yet" state; renders/exports nothing fake. | `3680f567` |

Each PHP change passed `php -l`. Commits stage only their own files (the concurrent session's uncommitted work was never staged).

## 2. Applied to the live environment (not in git)

- **`salary-slip-bac/.env`**: `APP_ENV=production`, `APP_DEBUG=false` (was `local`/`true`). **Takes effect on the next `php artisan serve` restart** — the running process cached the old env at boot. The live server was **not** restarted (avoiding disruption). *Action:* restart the API process during a quiet window and smoke-test login + one authenticated read.
- **Live `niss_hrms` Postgres**: migration `2026_08_13_160000_add_salary_slips_period_unique_index` applied (0 duplicates found across 667 slips; 42 ms). Reversible via `php artisan migrate:rollback --step=1`.

## 3. Secret-rotation runbook (operator action — cannot be done from code)

The audit confirmed live secrets present on disk and, historically, inside `deploy_clean.zip`. **Treat all of these as compromised and rotate.** Never paste the old value anywhere.

| # | Secret | Where | Action |
|---|---|---|---|
| 1 | **`HRM.pem`** (EC2 SSH private key) | repo root (untracked) | **Not deleted by this session** — it may be your only copy and deleting it could lock you out of the server, and scope is limited to `F:\HRMS oldd`. Back it up to a secure location OUTSIDE this tree, then delete it from here, then **rotate the EC2 key pair** (add a new key to the instance, remove the old). |
| 2 | **AWS access key** (`AWS_ACCESS_KEY_ID`/`SECRET`) | `salary-slip-bac/.env`, and inside `deploy_clean.zip` | Create a new IAM key (prefer an **instance role** over a static key), update `.env`, verify S3 up/download, then deactivate + delete the old key. |
| 3 | **`JWT_SECRET`** | `salary-slip-bac/.env` **and** `salary-slip-node/.env` (byte-identical) | Rotate. Note this invalidates all 30-day sessions (users re-login). If `salary-slip-node` is not being deployed, remove its `.env` too. Give each service a distinct secret **or** enforce `iss`/`aud` on verify (see §5 deferred). |
| 4 | **`MAIL_PASSWORD`** (Titan SMTP) | `salary-slip-bac/.env` | Rotate at the mail provider, update `.env`, send a test mail. |
| 5 | **`DB_PASSWORD`** | `salary-slip-bac/.env` | Rotate the Postgres role password, update `.env`, `config:cache`, confirm web + any worker reconnect. (Local Postgres uses trust auth, so the password is decorative locally, but the prod credential is real.) |
| 6 | **`FAST2SMS_API_KEY`** | `salary-slip-bac/.env` | Rotate at Fast2SMS if the repo copy may have leaked. |
| 7 | **`AADHAAR_REFERENCE_SECRET`** / **`APP_KEY`** | both `.env` files | Do **not** rotate casually: `APP_KEY` change invalidates encrypted Aadhaar + signed URLs; `AADHAAR_REFERENCE_SECRET` requires re-deriving stored references (a migration). Plan these deliberately. |
| 8 | **`deploy_clean.zip` (27 MB), `deploy.zip`, `salary-slip-front.zip`** | repo root (untracked) | `deploy_clean.zip` bundles a real `.env` + a `database.sqlite` PII snapshot. **Not deleted by this session** (they are your artifacts and may be needed). Delete them from the tree after confirming you don't need them; they are gitignored so never committed. |

`.gitignore` already blocks `*.pem`, `.env`/`.env.*`, `*.zip`, `*.sqlite`, `*.log`, `*.dump` (only `.env.example` + the public `cacert.pem` are allow-listed), and `git log --all` is clean of these — so the exposure is the **working copy on disk**, not git history.

## 4. Tracked debris still present (low-risk cleanup, not done here)

`test_*.php`, `patch_*.js`, `fix_*.js`, `temp_pf.txt`, `temp_printable_form.txt`, `extract1.txt`, `run.txt` (discloses LAN share `\\192.168.1.53`), `dummy.xlsx`, `image.png` (a screenshot with employee PII) are tracked and dead (they reference a `backend/` layout that no longer exists). `git rm` them when convenient — history retains them. Left in place this pass to avoid noise while security fixes land.

## 5. Remaining prioritized work (NOT yet done)

These are larger or coordinated changes that should be landed with testing, not blind on a live system:

- **F-S1b — `public/uploads` identity images (P0-tier).** `DocumentStorageService::store` still writes Aadhaar/PAN/cheque images to `public/uploads/...` (webroot), and the SPA displays them via bare `<img src="${baseUrl}/uploads/...">` served statically. Closing this needs a **coordinated** change: write to private storage, serve via a signed/temporary URL route (like the S3 presigned path), and update the SPA to consume signed URLs — do it alongside the User response DTO (same serialization seam). Until then these files remain fetchable by a semi-guessable URL. *(The worse `/storage` any-file vector is already closed.)*
- **F-A1 — Exit shadow enforcement.** Authorization is still global shadow (`config/authorization.php:7`); the granular RBAC is advisory and numeric `users.role` is the real authority. Populate `AUTHZ_ENFORCED_PREFIXES` after reviewing `authorization.decision_logs` `shadow_would_deny` volume, then retire the legacy allow-all-for-admin branch. Escalation paths F-A2/A3 are now closed regardless, but least-privilege for admins won't hold until enforcement is real.
- **F-S10 — User response DTO.** Introduce API Resources so `otp`, `verification_token`, `salary`, `bank_account_no`, `pan_card_no`, `pf_no`, `esi_no` are not serialized on raw-model responses (and land in sessionStorage). Pair with F-S1b signed doc URLs.
- **F-D1 — `user_id` FK on salary_slips/attendances.** Add nullable `user_id`, backfill by (company_code, emp_code), report ambiguous/orphan rows (17/17 attendances + 2 slips are already orphaned), then enforce. Add `UNIQUE(company_code, emp_code)` on users after cleanup. Staged migration, not one shot.
- **F-S8/S11 — Auth hardening.** Shorten the 30-day JWT, revoke on password change/reset, move the token to an HttpOnly cookie, tighten CSP (drop `unsafe-inline`/`unsafe-eval`).
- **F-S6/S7/S9 — CORS allow-list, baseline rate limiting, login lockout.**
- **F-F2 — HR onboarding tabs** call 4 non-existent routes and render `onboardingMocks`. Implement the routes or remove the tabs (same pattern as F-F1).
- **F-D4/B1/B5/B4** — strip credentials from `upload_batch_rows`; server-side file size/MIME caps on salary import; neutralize export formula injection; stop client-side payslip component fabrication.
- **F-B4 (payslip fabrication), F-B8 (dashboard cross-company), money→decimal (F-D4/F4)** — see audit §14.

## 6. Verification done / still needed

- Done: `php -l` on every changed PHP file; the migration ran clean; the duplicate-period preflight returned 0.
- **Not run** (per read-only test-DB rule + live-system caution): the PHPUnit suite (auto-targets protected `niss_hrms_test`), the frontend build/lint. Run these in an isolated environment before considering the batch verified. Add regression tests for each fix (candidate cross-company 404, employee-edit role strip, assign-permissions ceiling, `/storage` denies private paths, duplicate-slip insert rejected).

## 7. Second session — 2026-08-13 afternoon (commits `e5d4d266`…`a2c3ab0c`)

### Closed
- **F-S1b (P0)** `e5d4d266` — the 135 identity files were **moved out of `public/uploads`** into `storage/app/private/uploads` (verified 404 over HTTP afterwards; none had DB references, so nothing broke). `DocumentStorageService` and `LocalStorageProvider` now write only to private storage; serving goes through authenticated `GET /api/documents/{id}/file` (scope + audit) or expiring signed `local-documents.view` URLs. **Also discovered:** Laravel 12's `FilesystemServiceProvider` had been silently shadowing the custom `/storage/{path}` route (both the original vulnerable one and the F-S1a hardened one) with its own `storage.local` GET+PUT serve routes against the private disk; `serve => false` now disables that, so the hardened route actually runs and the framework's unauthenticated `PUT /storage/{path}` upload endpoint is gone.
- **F-S10 (partial)** `50d867d8` — `otp`, `verification_token`, `verification_token_expires_at` added to `User::$hidden`. Full Resource/DTO layer (salary/bank/PAN fields) still open — needs coordinated SPA changes.
- **F-F2** `a254a878`/`50d867d8` — onboarding mock fallback removed from `onboardingApi.js`; 7 orphaned fiction pages deleted. Live workspace tabs all call real routes.
- **F-B4** `30358985` — payslip ratio-split fabrication removed; unitemised lump sums render as single "Allowances"/"Other Deduction" rows.
- **F-S6/S7/S8/S9** `4e60c78f` — CORS origin allow-list (`CORS_ALLOWED_ORIGINS`, niss.pro + Capacitor + LAN dev patterns); baseline `throttle:api` (`API_RATE_LIMIT`, 120/min default); login lockout (5 fails / 5 min per identifier+IP, verified live); JWT revocation on password change/reset via `users.password_changed_at` (migration applied) + `iat` check in `JwtMiddleware`.
- **F-B1** `11165323` — 10 MB + spreadsheet-MIME caps on all five import endpoints.
- **F-D4** `11165323` — `UploadBatchRow` drops password/otp/token and masks account/phone to last-4 on write; **999 existing rows scrubbed in place**.
- **F-D1 stage 1** `1282fd67` — nullable `user_id` FK (null-on-delete) on `salary_slips`/`attendances`, applied + backfilled: **667/667 slips linked**; the 17 attendance rows (emp_code `'1'`) remain the only orphans. Import/upsert paths now stamp `user_id`. Unique index `users(company_code, emp_code)` (partial, 0 duplicates found) + index on `users.emp_code` added.
- **F-B7** `a2c3ab0c` — department rename cascade is transactional.
- **F-S3 remainder** — `laravel.log` (45.7 MB of Aadhaar/presigned-URL/PII lines) truncated; `.env` switched to `LOG_CHANNEL=daily`, `LOG_LEVEL=info`.
- **Debris** `27de25f7` — 16 tracked root debris files removed, incl. `image.png` (PII screenshot) and `run.txt` (LAN share). History still retains them; purging needs `git filter-repo`.

### F-A1 enforcement readiness — measured, DO NOT flip yet
`authorization_decision_logs`: 4,406 shadow DENY vs 1,162 ALLOW. Nearly all denies are `PERMISSION_NOT_ASSIGNED` on everyday actions (`payroll.payslip.read` 1,489, `recruitment.candidate.read` 1,191, `self.ticket.read` 567, `self.profile.read` 254…). Root cause: legacy `user_roles` covers **347/347** active users, but the canonical engine's `authorization_role_assignments` covers **6 users**. Flipping `AUTHZ_ENFORCED_PREFIXES` today would lock 341 users out of core flows. **Prerequisite:** sync/seed canonical role assignments from the legacy pivots (carefully — a past sync deactivated the agent/employee portals), re-check deny volume, then enforce prefix-by-prefix.

### Cross-session note
Commit `a254a878` accidentally included three files (`RequisitionDrawer.jsx`, `RequisitionsTab.jsx`, `api.js`) another session had staged mid-work on the job-requisition feature — a shared-index race (`git commit` picked up its staged files after an `add` lock collision). Functionally harmless (worktree intact, that feature's own commits will supersede), but the snapshot in that commit is mid-work. Later commits used path-limited `git commit -- <paths>` to avoid recurrence.

### Still open (in priority order)
1. Operator actions from §3: **secret rotation**, `HRM.pem`/zip removal, EC2 key rotation.
2. **Restart the API server** in a quiet window (it may still hold the pre-change env; `.env` now also carries daily/info logging).
3. F-A1 canonical role-assignment sync, then staged enforcement.
4. F-S10 full User Resource/DTO + F-S1b SPA signed-URL consumption (same seam).
5. F-S11 CSP (`unsafe-inline`/`unsafe-eval`), shorter JWT TTL, HttpOnly cookie storage.
6. F-B3 multi-company import scope key, F-B6 chunked-import atomicity, F-B8 dashboard cross-company sum, F-B9 destructive GETs → DELETE (needs `api.js`, owned by the other session), F-C1 422 error bag.
7. Money columns → `numeric(12,2)` (F-D2 remainder), mirror-column collapse, F-D5–D12 hygiene, F-O1/F-X2 ops (Sentry, backups, cron, real app server, deploy guide rewrite).
8. Run PHPUnit + frontend build in an isolated env; add regression tests for every fix above.
