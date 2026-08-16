# Cross-Cutting Findings — Bugs, Security Gaps, Mock Data (2026-08-16)

Consolidated from direct code reading across all five sub-projects. Severity is my judgment, not a formal CVSS score. Every item below was directly observed in code, not inferred.

## Security — live issues worth prioritizing

| # | Severity | Location | Issue |
|---|---|---|---|
| 1 | **High** | `salary-slip-bac/app/Http/Controllers/Candidate/CandidateAuthController.php::register()` | Returns the raw email-verification token directly in the API response body (`// Returned for dev/testing ease`), instead of only delivering it by email. Anyone who can call the register endpoint can self-verify without proving email ownership. |
| 2 | **High** | same file, `forgotPassword()` | Same pattern, no comment flagging it this time: returns the raw password-reset token in the response body instead of only emailing it. Anyone who can call this endpoint for an email address can reset that account's password without email access. |
| 3 | **Medium** | `salary-slip-bac/app/Http/Controllers/PublicCandidateIntakeController.php::store()` | Public webhook guarded by a single shared static bearer token in the URL path. Self-documented in the class docblock: "Treat that token like a password: anyone who has it can create candidate rows." Also contains **live temporary diagnostic logging** (headers + truncated raw body) explicitly flagged in a comment for removal once a payload-loss bug is confirmed fixed — currently still logging in what appears to be production code. |
| 4 | **Medium** | `salary-slip-bac/app/Http/Controllers/Api/V1/Authorization/MfaController.php::enrollSms()` | Explicit `// TODO: Send verification SMS and verify code before enrolling` — a phone number can be "enrolled" as an MFA method without proving control of it. |
| 5 | **Medium** | `salary-slip-bac/app/Services/Authorization/MfaService.php` | `verifyOtpCode()` and `verifySecurityKey()` are hardcoded `return false;` stubs — SMS/Email MFA and WebAuthn security keys can be enrolled through the API but can never actually be verified/used, which either silently locks out anyone who enrolls one, or (if callers don't check the return value correctly) could fail open. Needs verification of caller behavior on `false`. |
| 6 | **Low-Medium** | `salary-slip-bac/app/Http/Controllers/Api/V1/Authorization/PrivilegedAccessController.php::canViewAllRequests()` | Compares `$user->role === 'admin'` (string) against a field the rest of the codebase treats as an integer tier — this branch appears to never evaluate true, silently narrowing "who can view all privileged-access requests" down to super admins only via the other check. Not exploitable (fails restrictive, not permissive) but likely not the intended access model. |
| 7 | **Low** | Multiple mobile/frontend | `hrms-mobile-app`'s `AuthContext.can(code)` and web frontend's permission hooks default to permissive/fail-open in a few specific spots (soft check defaults `true` if snapshot hasn't loaded; `useModuleAvailability` fails open) — each is scoped to hiding UI elements only, with the real check enforced server-side per their own code comments, but worth a final confirmation pass that no server endpoint trusts the client-side gate alone. |

## Fatal-error / crash bugs (will throw at runtime when the code path is hit)

| # | Location | Issue |
|---|---|---|
| 1 | `salary-slip-bac/app/Http/Controllers/Api/V1/Admin/Leave/CompensatoryOffController.php::approve()` / `reject()` | Calls `Auth::id()` with **no `use Illuminate\Support\Facades\Auth;` import** in the file — will throw "Class Auth not found" the first time either route is hit. |
| 2 | `salary-slip-bac/app/Services/JobArchitecture/JobDescriptionService.php::update()` | Calls `Str::studly()` with no `use Illuminate\Support\Str;` import — will fatal on first real invocation. |
| 3 | `salary-slip-bac/app/Http/Controllers/Api/V1/Admin/Workforce/JobDescriptionController.php` | References `Rule::in(JobService::REMOTE_ELIGIBILITY_TYPES)` without importing `App\Services\JobArchitecture\JobService` — undefined-class error the first time the validator runs with that field present. |
| 4 | `salary-slip-bac/app/Services/JobArchitecture/JobArchitectureException.php` | Constructor typehints `?Throwable $previous` without `use`/leading `\`, resolving to a nonexistent `App\Services\JobArchitecture\Throwable`. Fragility depends on PHP's lazy type resolution — verify before relying on it. |
| 5 | `salary-slip-bac/app/Http/Controllers/Admin/Hr/JobRequisitionController.php::getTemplates()` / `applyTemplate()` | References `JobRequisitionTemplate` with no `use` import — likely relies on same-namespace resolution; verify it isn't a runtime fatal. |
| 6 | `hrms-mobile-app/src/screens/admin/AdminEmployeesScreen.js` | Calls `api.bulkDeleteEmployees()` and `api.deleteAdminEmployee()`, neither of which exist on `ApiService` (`src/services/api.js` only has `deleteEmployee`/`deleteEmployeesBulk`). Bulk-delete and detail-view delete will throw. |

## Authorization scoping gaps (inconsistent within the same controller/file — sibling methods scope correctly, these don't)

All in `salary-slip-bac/app/Http/Controllers/Admin/Hr/`:
- `CandidateDocumentController.php` — **entire file** has no `ScopesCompany` at all (a class docblock notes it replaced a formerly-mock document review flow, but the scoping gap looks unaddressed).
- `QuizAttemptController.php` — `show()` and `destroy()` use raw `find($id)`, no scope check (sibling `index()`/`assignableCandidates()` are scoped).
- `TrainingQuizController.php` — `show()`, `update()`, `destroy()` unscoped (sibling `index()` is scoped).
- `AssetController.php` — `show()`, `update()`, `destroy()` unscoped, despite `allocate()`/`returnAsset()`/`transfer()` being carefully scoped with 2-3 checks each in the same file.
- `OnboardingController.php::showJourney()` — unscoped, unlike `dashboard()`/`journeys()`/`documents()` in the same file.
- `HrReportController.php` — 3 of 8 report types (`interviewReport`, `assetAllocationReport`, `performanceReport`) apply no company scope; the other 5 do.
- `RecruitmentDashboardController.php` and `HrDashboardController.php` — base KPI-card queries are scoped, but most chart/alert/activity sub-queries run against `Candidate`/`Interview`/`Offer`/`JobRequisition` directly, unscoped. `RecruitmentDashboardController::applyCompanyScopeQuery()` is dead code (comment-only body).

**Why this matters**: given `ScopesCompany` is the dominant multi-tenant boundary in this codebase, any endpoint that skips it can potentially return or mutate another company's data for a non-super-admin caller. None of these were flagged as intentional in code comments — they read as gaps, not documented exceptions (contrast with `ExitManagementController`/`AssetController`'s write paths, which are meticulously scoped with explanatory comments).

## Data-integrity / non-atomic ID generation

- `LeaveRequestController::store()` and `WorkFromHomeController::store()` (`salary-slip-bac/app/Http/Controllers/Api/V1/Admin/Leave/`) generate `request_number` via `Model::count() + 1` — not atomic, can produce duplicate numbers under concurrent submissions.

## Mock / fake / hardcoded data currently live

| Location | What |
|---|---|
| `salary-slip-bac/app/Services/IndeedJobService.php` | When Indeed API credentials are absent or the real call fails, **fabricates** a fake `IND-{random}` job ID and returns `success: true` — indistinguishable from a real publish to the caller/UI. |
| `salary-slip-bac/app/Services/Authorization/AccessReviewService.php` | `getLastRoleUsage()`/`getLastPermissionUsage()` hardcoded to return `null`. |
| `salary-slip-front/.../context/NotificationContext.jsx` | `INITIAL_GROUPS` (8 fabricated groups) and `SEED_ANNOUNCEMENTS` (1 fabricated announcement) still ship as live seed data. |
| `hrms-mobile-app/.../AdminTdsScreen.js` | 100% hardcoded mock TDS data, zero API integration. |
| `hrms-mobile-app/.../AdminAccountsScreen.js` | Per-user permission matrix is **fabricated client-side** by string-matching the *viewing admin's* own permission codes — presented in the UI as if it were the target user's real server-side grants. |
| `salary-slip-bac/app/Http/Controllers/IndeedFeedController.php` | Hardcoded fallback city/state/country/salary-range/company name when a job requisition is missing that data. |
| `salary-slip-bac/app/Http/Controllers/UserController.php` (`sanitizeRowData`/`resolveCompanyFromUnit`) | Hardcoded tenant-name and unit-alias mapping tables (`'nidhi-impex'`, `'silver-star'`, `'daduk'`→`'silver-star'`, etc.) baked directly into generic import code rather than config/DB. |

**Deliberately, correctly disabled (not a bug)**: `salary-slip-front/.../pages/admin/Reports.jsx` — intentionally shows an "unavailable" state; a code comment explains it used to show fabricated payroll numbers and was disabled as a trust risk pending real reporting endpoints.

**Historical, already remediated (kept here for context)**: `OnboardingController.php`'s docblock confirms it *used to* fabricate Aadhaar/PAN/Degree documents and hardcode dashboard metrics — now replaced with real queries.

## Cross-backend inconsistency (Laravel vs. Node)

`salary-slip-node` independently fixed several cross-tenant/cross-company scoping bugs while reimplementing Laravel's endpoints (employee list/show scoping, agent update/delete scoping, bank-detail import scoping, dashboard salary-slip scoping, password-reset OTP-bypass). **Laravel's originals remain unpatched.** If both backends can currently serve live traffic (unconfirmed from this repo — see file 04), the same request could get a different authorization answer depending on which backend handles it. Recommend either (a) confirming Node is not receiving live traffic and treating its fixes as a spec for patching Laravel directly, or (b) if Node is live, porting these same fixes into the Laravel controllers immediately since they represent real, currently-exploitable gaps in the older code.

## Architectural notes worth keeping in mind (not bugs, but easy to misunderstand)

- **Two authorization systems run concurrently by design**: a legacy numeric-role system (`users.role` 0/1/2/4) and a canonical ABAC/RBAC engine (`AuthorizationEngine::decide()`), bridged by a per-permission `SHADOW`/`ENFORCED` mode toggle (`PermissionEnforcementPolicy`). This matches and extends the "Authorization exists twice" note from prior project memory — the shadow-mode mechanism is now fully mapped (`app/Services/Authorization/PermissionEnforcementPolicy.php`).
- **`enterprise-rbac/` is dormant and unrelated** — do not confuse its permission model with the real one when discussing "the RBAC system."
- **`salary-slip-node` shares Laravel's database, does not proxy to it** — a change to Node's Prisma schema definitions would not create schema drift risk in the way a separate database would, but a raw-SQL workaround already exists in `provisioning.service.ts` because the *generated Prisma client* describes a richer `companies` table than the real database has — worth a closer look if anyone touches that file.
