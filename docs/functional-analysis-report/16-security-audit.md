# 17. Security Audit

> This is a code-level review of security-relevant patterns actually present in the repository. It is not a penetration test and does not assess the live production environment (which, per project records, is a different deployment from this repository). Findings are graded by what the code itself documents or what is structurally observable, not by exploitation.

## 17.1 Authentication

- **Primary mechanism:** JWT (`tymon/jwt-auth`), TTL 30 days by default (`JWT_TTL`) — a long-lived token with no refresh-token flow visibly used in the frontend, meaning a stolen token remains valid for up to 30 days.
- **Inconsistent guard usage:** one route (`GET /user`) uses Sanctum (`auth:sanctum`) while every other protected route uses the custom `jwt.auth` middleware. This is flagged repeatedly in the code inventory as an inconsistency, not a designed dual-strategy — worth resolving so there is exactly one session-auth mechanism.
- **Logout placed outside `jwt.auth` deliberately** — so an already-expired/invalid token can still successfully log out client-side. Documented in-code, a reasonable UX tradeoff.
- **Login throttled** 30/min; forgot-password flow throttled 15/min; emp-code lookup throttled 10/min specifically because it's a public enumeration surface (documented in a route comment).
- **No MFA/2FA** of any kind was found.
- **No account lockout after repeated failed logins** was found at the login endpoint itself (lock/unlock exists as an *admin action*, not an automatic brute-force response) — `login_events` records every attempt but nothing in this pass triggers an automatic lock from repeated failures.
- **The forgot-password flow's final step does not re-validate the OTP.** A deeper read done for the Trial Form/Login page documentation found that the step that sets the new password does not re-check the OTP value submitted earlier in the same flow — weakening the intended "OTP proves you still hold the verified channel" guarantee. See [Bug & Issue Report](19-bugs-issues.md).

## 17.2 Authorization

Covered in full in [Roles & Permissions](05-roles-permissions.md). Security-relevant highlights:
- **Explicit-deny-wins** model in the ABAC engine — a DENY policy or grant always overrides an ALLOW, a safe default.
- **Super Admin bypass is audited, not silent** — every bypass is still logged via the decision-log table.
- **Shadow-mode soft rollout**: the new ABAC engine's denials are only "real" for a configured allow-list of enforced permission codes until the rollout completes; everything else falls back to a simpler legacy check if it would have allowed. This is a reasonable migration strategy but means a real bug in the new engine could currently go unnoticed for non-enforced permissions — recommend proactively completing the enforcement list before removing this repo's remaining scaffolding.
- **`module.schema:authorization` is a no-op** — the `RequireModuleSchema` middleware treats any module name not in its hardcoded list (currently only `hr` and `tickets`) as "always ready," so the `module.schema:authorization` gate on `v1/admin/users` currently does nothing. If the authorization schema were ever absent in an environment, this route would not gracefully 503 like the HR/Tickets routes do — it would likely 500 or error deeper in the stack. **Recommend adding `authorization` to the `RequireModuleSchema::MODULES` list** or removing the misleading gate.
- **`RoleHierarchy` deliberately decouples role-management authority from the permission system itself** — a sound design choice preventing the permission system from being used to grant itself broader permissions.
- **Two independently-maintained copies of role-resolution logic** (frontend `AuthContext.getUserRole()` and backend `RoleMiddleware::resolveRole()`) are documented as intentionally mirrored — a maintainability/consistency risk if one is changed without the other (see [Bug & Issue Report](19-bugs-issues.md)).
- **No server-side enforcement of the Hiring pipeline's stage-adjacency rules** — the frontend's tab-ownership model (which stage each Hiring tab may act on) is not mirrored server-side; `CandidateController::moveStage` accepts any of the 10 valid stage values as a transition target regardless of the candidate's current stage. This is a business-process integrity gap rather than a permission bypass (the usual permission checks still apply).
- **Trial Form's "Nidhi Impex only" company restriction is frontend-only** — no matching server-side check was found in `UserController`'s trial-form methods, so a direct API call could act on trial forms for a company the UI would never expose to that user.

## 17.3 Sensitive Data — Aadhaar (Indian National ID) handling

**Correction note:** an earlier pass of this audit (based on route/controller-level comments alone) described Aadhaar as "masked by default with a narrow reveal flow." A deeper, file-level read of `app\Support\AadhaarAccess.php` and `AadhaarDisclosure.php` (performed for the Appointments module documentation) found the actual behavior is more permissive than that description — corrected below.

- **Disclosure is record-access-only, with no masking in the reachable UI at all.** `AadhaarAccess::allowsFor($actor, $target)` is the single gate: if the actor can access the record at all (self-view, or `DocumentAuthorizer::canAccessOwner` scope match — ordinary company/unit-scoped read access), the full, unmasked number is attached as `aadhaar_full` by `AadhaarDisclosure::attach()`. This is a **deliberate reversal of an earlier two-gate design**, per the class's own doc comment. The frontend's `getAadhaarDisplayValue()` was confirmed to never fall back to a masked value — it renders `"-"` if the field is absent, specifically so a withheld field can't be confused with a masked-but-authorized one. **Net effect: any admin/agent with ordinary read access to an appointment or employee record sees the full Aadhaar number, not a masked one, in normal usage.**
- **The confidential export/print flow (`AadhaarExportController`, one-time tokens, watermarked server-rendered PDF) is fully built, tested, and audited on the backend — but has zero live callers in the current frontend.** `utils/api.js` contains its own comment stating this explicitly: the client-side function was kept "if export ever needs its own gate again," but nothing currently calls it. The Appointments page's print/PDF buttons instead simply rasterize/print the Aadhaar number that's already disclosed on-screen, with no additional authorization step. **This means the "one-time token, 60-second, audited" export control described in earlier research is not actually in the live disclosure path today** — it is dead-but-available code, not a defense currently in effect.
- **AES-256 field encryption** (`encrypted_aadhaar_number`) is implemented in `User::setAadharCardNoAttribute` but, per the model's own comment, "written, shipped, and never once reached" — confirmed **334 production-representative rows plaintext, 0 encrypted**, because every actual write path uses plain mass-assignment rather than the dedicated `setAadhaarNumber()` method that would trigger encryption. A dedicated Artisan command (`documents:backfill-aadhaar`) exists to remediate this and is idempotent/resumable, but **whether it has been run against any live dataset is not knowable from source code.**
- `users.aadhar_card_no` remains in `User::$hidden` at all times; `aadhaar_full` is only ever added per-response by the dedicated support class, never as a model accessor — so it cannot leak through incidental/generic model serialization elsewhere in the app. This is a genuine, narrow positive control even though the broader disclosure model above is more permissive than originally described.
- **A relaxed uniqueness constraint** intentionally allows Aadhaar-number collisions at the DB level (9 legitimate real-world duplicate cases cited in a migration comment) — collision prevention was moved to the S3 object-key layer instead (embedding the appointment ID).
- **Revised priority finding:** given the above, the Aadhaar system's real residual risk is not "who can trigger the reveal flow" (that flow is unused) but simply **the breadth of "ordinary record access"** — i.e., whoever can read an appointment/employee record at all sees the full national ID number. Whether that breadth is appropriate is a product/compliance decision, not a code defect, but it should be evaluated explicitly rather than assumed narrow.

## 17.4 Input Validation

- **File upload validation is content-based, not extension-based**: `FileValidator` checks every dot-segment of a filename (catching `invoice.pdf.php`-style disguises), a blocked-extension list, a MIME allow-list per document type, **and** verifies the file's magic-byte signature actually matches its claimed MIME type — rejecting on mismatch even if the extension and MIME both looked fine. This is a strong, above-average control.
- **Legacy local-storage path (`DocumentStorageService`) has its own equivalent blocklist** (php/phtml/exe/js/svg/html, etc.) — the control exists in both storage backends, not just the newer one.
- Standard Laravel `validate()`/`FormRequest` patterns are used across controllers for field-level validation (types, required/nullable, enum constraints like Candidate stage, Offer status, Goal `type` in {KPI,KRA,OKR}, Review `review_type` in {self,manager,peer,360}).
- **Role/employee creation has explicit privilege-escalation guards**: `UserController@store` requires the actor to already be Super Admin to create a role-0/1 account; `postTrialForm` forces `role=3` server-side regardless of client input specifically because the DB column's default (1/Admin) would otherwise silently grant Admin to a public/agent-submitted trial form.

## 17.5 XSS

- No server-rendered views exist beyond the default Laravel welcome page, removing the classic Blade-templating XSS surface almost entirely on the backend.
- The frontend is React, which escapes interpolated content by default. **One notable exception:** `components/ui/RichTextEditor.jsx` uses `contentEditable` + `execCommand`, and its output (used in Job Requisition descriptions) is presumably rendered back as HTML elsewhere in the Hiring module — **whether that render path uses `dangerouslySetInnerHTML` without sanitization was not confirmed in this pass** and should be checked directly, since a rich-text field is a classic stored-XSS vector if its output isn't sanitized on render.

## 17.6 CSRF

- The API is a pure JSON/JWT API (no cookie-based session auth for the SPA, aside from the underused Sanctum route), which structurally avoids classic CSRF risk for the authenticated surface — CSRF requires ambient cookie-based credentials, which this app's primary auth path doesn't use.
- Laravel's default CSRF middleware (`VerifyCsrfToken`) protection for `web.php` was not independently re-confirmed in this pass, but only two routes exist there (a static welcome page and an unauthenticated file streamer), so exposure is minimal regardless.

## 17.7 SQL Injection Prevention

- Eloquent ORM and query builder are used throughout; no raw string-concatenated SQL was found in the reviewed controllers/services. A few services use `DB::table()` (`DelegationController`, `EmergencyAccessController`) but via the parameterized query builder, not raw SQL strings.
- `ConditionEvaluator` (the ABAC condition engine) explicitly documents that its `matches` operator is "a safe glob-to-regex translator, not a real regex from user input" — a deliberate design choice to avoid a ReDoS/injection vector from letting policy authors supply arbitrary regex.

## 17.8 Rate Limiting

Extensive and endpoint-appropriate use of Laravel's `throttle:N,1` middleware is present throughout `routes/api.php` — login (30/min), forgot-password (15/min), emp-code enumeration lookup (10/min), Aadhaar export/reveal (10/min), bulk imports (20/min), document upload (30/min), presigned URL generation (60/min), quiz proctoring events (240/min). This is a genuinely well-considered, endpoint-by-endpoint rate-limit posture rather than a single blanket limit.

## 17.9 File Upload Validation

Covered in 17.4. Additionally: `DOCUMENT_MAX_FILE_SIZE_BYTES` defaults to 10MB; multipart upload thresholds are configurable; **no malware/AV scanning is implemented** despite the schema and config flag existing for it (`DOCUMENT_MALWARE_SCAN_ENABLED=false` by default, `scan_status` column never populated) — this is the single most significant upload-security gap found, since content-based validation stops disguised-extension attacks but not a genuinely malicious payload inside a permitted file type (e.g. a booby-trapped PDF).

## 17.10 Logging

- `AuditLog` (generic), `DocumentAuditLog`/`DocumentAudit` (document-specific, with a deliberate scrub of URL/token/secret keys before writing so a presigned URL can never land in an audit table), `authorization_decision_logs` (every authorization decision, allow or deny), `login_events` (every login attempt) — logging coverage is broad and specifically designed to avoid leaking secrets into logs.
- `DocumentAudit::recordSafely()`/`denied()` swallow write failures so an audit-logging outage cannot itself 500 a read path — **except** the Aadhaar export flow, which deliberately does the opposite (fails closed if the audit write fails), a considered and consistent tradeoff between availability and traceability depending on data sensitivity, though currently dormant given that flow has no live caller (see 17.3).

## 17.11 Session Management

- JWT is stateless server-side; the frontend persists the session to `sessionStorage` (cleared on tab close, unlike `localStorage`) and coordinates logout across tabs via `BroadcastChannel`/`storage`-event fallback.
- A global `"auth:unauthorized"` window event on any 401 forces client-side sign-out — functions as a de facto session-expiry handler despite there being no formal interceptor pattern in the hand-rolled API client.

## 17.12 Permission Checks — additional notes

- Every mutating admin-user action (`lock`, `deactivate`, `resetPassword`, etc.) requires an explicit human-readable `$reason` string, creating an accountable audit trail for sensitive account actions beyond just "who clicked what."
- `User::booted()` refuses to update/delete any account flagged `is_protected` (including super admins) unless the actor is itself a super admin — a model-level guard that holds even if a controller-level check were ever missed.
- `ShiftController::store()`/`update()` do not apply the same company-scoping helper (`scopedCompany()`) that `index()`/`assign()` use — a tampered request could create/update a shift under an arbitrary `company_code`.

## 17.13 Security Headers

`SecurityHeaders` middleware applies globally: CSP (`default-src 'self'`; `script-src`/`style-src` allow `'unsafe-inline' 'unsafe-eval'`, documented as needed for the Vite/React dev toolchain — **this should be tightened for the production build if the dev-only need doesn't apply there**), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, `X-Permitted-Cross-Domain-Policies: none`, HSTS (production + HTTPS only), and stripping of `Server`/`X-Powered-By` headers.

**Direct tension noted:** `routes/web.php`'s `/storage/{path}` streamer explicitly sets `X-Frame-Options: ALLOWALL` on its own responses (overriding the global `DENY`) to permit resume/document iframe embedding — a deliberate, scoped exception, but worth double-checking that this route cannot be used to frame arbitrary other content given it also serves `Access-Control-Allow-Origin: *`.

## 17.14 Highest-priority findings (ranked)

1. **No malware/AV scanning on uploaded documents** — content-type validation is strong, but a valid PDF/image can still carry a malicious payload. (High)
2. **`/storage/{path}` has no auth/permission gate at all** — any file that exists under the public/legacy storage disks is readable by anyone who knows or guesses the path (path traversal itself is stripped, but the route is otherwise open by design). Confirm this only ever serves genuinely public assets. (High)
3. **Aadhaar disclosure is broader than the earlier design intent suggests** — full, unmasked national-ID numbers are shown to anyone with ordinary record access; the intended narrower "confidential export" control is not actually wired into the live UI. (High — data-sensitivity dependent, but the most material correction in this audit)
4. **`module.schema:authorization` no-op gate** — could allow `v1/admin/users` to error ungracefully (rather than 503) if that schema were ever missing in an environment. (Medium)
5. **JWT TTL of 30 days with no refresh/rotation flow observed** — a stolen token has a long usable window. (Medium)
6. **Plaintext Aadhaar numbers confirmed for pre-existing records** (334 rows), pending a backfill command whose execution status against live data cannot be confirmed from source. (Medium — data-sensitivity dependent)
7. **Forgot-password flow doesn't re-validate the OTP in its final step.** (Medium)
8. **Duplicated role-resolution logic** between frontend and backend is a drift risk that could eventually cause an authorization mismatch between what the UI shows and what the API allows. (Low-Medium)
9. **CSP allows `unsafe-inline`/`unsafe-eval`** — acceptable for dev, should be verified/tightened for production builds specifically. (Low-Medium)
