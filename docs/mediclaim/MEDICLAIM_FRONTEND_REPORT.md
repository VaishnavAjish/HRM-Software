# HRMS Mediclaim Module — Frontend Report

**Source:** `salary-slip-front/salary-slip-front/src/` (the nested, git-tracked copy — not the outer `salary-slip-front/` folder), working tree as of 2026-09-21.
**Purpose:** explain how the current React UI uses the Mediclaim API so a new application can reproduce the same screens, flows and rules. Produced by reading source; the app was **not** run and the frontend tests were **not** executed.
**Companion:** `MEDICLAIM_BACKEND_REPORT.md` (route-by-route API specification).

| Part | Content |
|---|---|
| 0 (this page) | Summary, rules to carry over, contract mismatches |
| F1 | Architecture, HTTP client, URL map & guards, **all 65 API-client functions**, client-side authorization, models/lookups, **every screen/tab**, user journeys, backend mismatches |
| F2 | **Every component**: props, state, API calls, form fields with validation, conditional rendering, business rules encoded in the UI, dependency map, backend contract gaps |

---

## 0.1 Summary

- **Stack:** React 19, react-router 7 (`BrowserRouter`), Tailwind, lucide icons. **No** data-fetching/state library — a `fetch` wrapper (`utils/api.js`) plus local `useState`; GET responses are cached for 30 s.
- **Transport:** every call goes to `<origin>/api/v1/mediclaim/...` with a bearer JWT read from `sessionStorage`. There is **no token refresh**; a 401 logs out only on explicit token-expiry codes. Errors are reduced to a single message string.
- **Case convention:** the UI sends **camelCase** bodies and query strings; the backend middleware `mediclaim.normalize_case` converts them to snake_case. Some claim submit/decision payloads deliberately send both spellings (e.g. `approvedAmount` and `approved_amount`). Responses are a mix of camelCase and snake_case — a new client should normalise once at the API boundary.
- **Three URLs only:** `/employee/tds/mediclaim` (employee workspace, no permission gate because `ProtectedRoute` returns early for `/employee*`), `/admin/tds/mediclaim` (needs `ui.admin.mediclaim.view`), public `/mediclaim/verify/:token`.
- **Module availability gate:** nav entries depend on `/api/modules`, which reports mediclaim as available only once a rule book is published and four reviewer roles are staffed.
- **Mounted admin tabs:** Dashboard, Employees, Claims (`PendingReviewsTab`), Settings (holds Rule Books, Hospitals, Document Requirements, Reviewers) and Reports. `ClaimsTab` and `AuditHistoryTab` exist but are **not mounted** anywhere.
- **19 of the 65 API-client functions are unused**, including withdraw, return-by-employee and employee intimations.

## 0.2 UI business rules to carry over (from F2)

- New claim is a **single popup form**, not a wizard. Treatment type is lowercase. Admission/discharge dates are required only for hospitalization, surgery and emergency; discharge may not be before admission (day precision). Expense total is display-only (backend recomputes). Declaration version sent is `v1`. Documents are uploaded **after** the claim exists, not in the modal.
- Decisions are lowercase strings; remarks are required (min 5 characters) for every non-clean decision; approved amount is required unless rejecting and must not exceed the claimed total.
- Settlement panel is blocked until required documents are on file, then sends `final_approve` with amount, mode and reference.
- Document requirements: 8 seeded types; discharge summary required only for hospitalization/surgery (not emergency); FIR/MLC conditional. **No** client-side file type/size limits — enforce them server-side. Ongoing-treatment "finalize" gives a 7-day upload window.
- The **live** review path is the single approval stage; the coordinator/committee/HR/director panels are legacy.

## 0.3 Frontend ↔ backend mismatches to resolve in the new build

Collected from F1 §8 and F2 "Backend contract gaps" (each is described in detail there):

1. Report **Export CSV** calls `GET /reports` and expects a URL; the backend streams CSV from `GET /reports/export`.
2. The "reveal sensitive" flag is sent as `reveal`; the backend reads `includeSensitive` (and, separately, that key is broken by case normalisation — see the backend report, Part 9 #14).
3. `deleteReviewerAssignment` calls a route that does not exist.
4. Employees need hospital and rule-book **read** permissions that may not be granted to the plain Employee role.
5. Resubmitting a returned claim pre-fills the edit form from the **list row** instead of the full claim.
6. Claim field names are inconsistent across components (`dischargeDate` vs `dischargeAt`, `isMedicoLegal` vs `isMedicoLegalCase`).
7. The "OTHER: detail" symptom encoding is lost on edit; `HospitalPicker` does not filter inactive hospitals.
8. `/me/cards` does not return the QR token the card viewer expects.
9. The Director panel test's payload assertion looks out of date relative to the component.

---


## 0.4 Additions the appendices below do not cover

`MEDICLAIM_BACKEND_REPORT.md` (Parts 3.5, 5.4, 8) documents three backend routes that appeared during this work. The frontend API client **already has functions for all three**, but F1/F2 below were written before this was noticed and do not list them:

| API-client function (`mediclaimApi.js`) | Calls | Used by | Notes |
|---|---|---|---|
| `updateClaimExpenses(claimId, expenses, accessToken)` | `POST /claims/{id}/update-expenses` | `ClaimDetailDrawer.jsx` (expense editing) | sends `expenses[]` as `{category, description, claimed_amount, expense_date}`; backend recomputes the total and, on an approved claim, may raise the approved amount (backend Part 3.5) |
| `approveClaimDocument(claimId, documentId, accessToken)` | `POST /claims/{id}/documents/{documentId}/approve` | `ClaimDetailDrawer.jsx`, `ClaimFullDetail.jsx` | `documentId` is the **document id** from the documents list, not `linkId` |
| `denyClaimDocument(claimId, documentId, accessToken)` | `POST /claims/{id}/documents/{documentId}/deny` | `ClaimDetailDrawer.jsx`, `ClaimFullDetail.jsx` | no reason is sent; denial does not block settlement on the backend (backend Part 5.4, Part 9 #5) |

Treat these three as part of the API contract when rebuilding the client. Also note the frontend and backend working trees were both being edited by others at the time of reading, so re-verify function counts (F1 says 65) against the current `mediclaimApi.js`.

<!-- ======================= F1-frontend-architecture ======================= -->

# F1 — Frontend Architecture, API Client & Screens

Scope: `//192.168.1.53/f/HRMS oldd/salary-slip-front/salary-slip-front/src` (the NESTED, git-tracked frontend). All paths below are relative to that `src/` unless stated. Backend reference: `salary-slip-bac/routes/mediclaim.php`. Everything here was read from source; anything not verifiable is under "Open questions" (section 8).

---------------------------------------------------------------------------------------------------

## 1. Feature folder map & tech stack

### 1.1 Tech stack (package.json, main.jsx, App.jsx)
| Concern | Choice |
|---|---|
| Framework | React 19.2 (`react`, `react-dom`), Vite 7 build, `StrictMode` in `main.jsx`, JavaScript (JSX), no TypeScript in the feature |
| Router | `react-router-dom` 7, `BrowserRouter` (history mode, not hash). Tab state kept in the URL query `?tab=` via `useSearchParams` |
| Data fetching / state | NO react-query / redux / SWR. Plain `fetch` wrapper (`utils/api.js#apiRequest`) called from `useEffect` in each component; component-local `useState`; React Context only for auth/company/theme (`AuthContext`, `CompanyContext`, `ThemeContext`). Request-key pattern (`result.key !== requestKey` => loading) + `cancelled` flag for stale responses. Refetch is manual via a `reloadToken` counter |
| UI | Tailwind CSS 3 (utility classes, `dark:` variants, custom `brand-*` colour ramp; `data-theme` = indigo/amber/sky per git-branch/company), `lucide-react` icons, `react-hot-toast` toasts, `recharts` (admin dashboard charts), `qrcode.react` (card QR), `html2canvas` (card PNG), in-house `components/ui/*` (Button, Badge, Drawer, Modal, Pagination, Skeleton, Card). `window.confirm` used for destructive confirmations |
| Tests | Vitest + Testing Library (`*.test.js(x)` next to sources) |
| Locale | Hard-coded `en-IN`, currency INR (`₹`) |

### 1.2 Feature folder (`features/mediclaim/`)
```
index.js                      barrel: mediclaimApi, all models, utils, components
services/mediclaimApi.js      THE API client (section 3) (+ .test.js: fn-existence, query builder, FormData, public-verify has no Authorization)
hooks/useMediclaimAuthorization.js   permission-flag wrapper over useAuthorization (section 4)
hooks/useMediclaimLookups.js         employee-workspace preload of hospitals/ruleBooks/members/coverage/documentRequirements (section 5.5)
models/claimStatus.js         16 claim statuses -> label/colour/terminal (5.1)
models/reviewStages.js        stages, decisions, permission per stage, workflow buckets (5.2)
models/expenseCategories.js   6 expense categories (5.6)
models/declarationText.js     declaration text EN/HI/GU + version "v1" (5.6)
models/initialSymptoms.js     6 symptoms (5.6)
utils/formatters.js           currency/date/masking/FY/photo URL (5.3)
utils/documentChecklistRules.js  required/optional document resolver (5.4)
utils/claimValidation.js      per-section + review-decision validators (5.7)
utils/expenseCalculations.js  client-side running totals (display only)
pages/EmployeeMediclaimWorkspace.jsx   employee shell (tabs)
pages/AdminMediclaimWorkspace.jsx      admin shell (tabs)
pages/employee/tabs/{MediclaimInfoTab,FamilyMembersTab,MyClaimsTab,RuleBookTab,TeamClaimsTab}.jsx
pages/admin/tabs/{DashboardTab,EmployeesTab,PendingReviewsTab,SettingsTab,ReportsTab, RuleBooksTab,HospitalsTab,DocumentSettingsTab,ReviewersTab, ClaimsTab*,AuditHistoryTab*}.jsx   (* = NOT mounted anywhere, see 6.2)
components/                   reusable pieces (owned by another report slice; the ones that call the API are described in sections 6-7)
```
Thin route wrappers: `pages/admin/TdsMediclaim.jsx` renders `AdminMediclaimWorkspace`; `pages/employee/Mediclaim.jsx` renders `EmployeeMediclaimWorkspace`; `pages/public/MediclaimCardVerify.jsx` is a standalone page.

### 1.3 Conventions a re-implementer must know
* Every API function takes `(…args, accessToken, tokenType = "Bearer")`. Components read `user.accessToken` / `user.tokenType` from `AuthContext`.
* **Dual-casing tolerance everywhere.** Every reader does `row.claimNumber || row.claim_number`, `row.totalClaimedAmount ?? row.total_claimed_amount`, etc. The backend response mixes camelCase and snake_case (see 3.5). A new client must handle both, or normalize once.
* Lists are read defensively: `payload = res.data; rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []; total = payload?.total ?? rows.length`.
* The admin `Employees` tab is the only full-height table; other tabs use page scroll.
* Dead/legacy code exists (unused API functions, unmounted tabs, legacy 5-stage review panels). Flagged where relevant.

---------------------------------------------------------------------------------------------------

## 2. Route / URL map, guards, navigation

### 2.1 Frontend URLs (`App.jsx`)
| URL | Component (lazy-loaded via `React.lazy`, wrapped by one `<Suspense fallback=<RouteLoader/>>`) | Layout | Guard |
|---|---|---|---|
| `/employee/tds/mediclaim?tab=coverage\|family\|rulebook\|claims\|team` | `pages/employee/Mediclaim` -> `EmployeeMediclaimWorkspace` | `AppLayout` (sidebar+header) under `/employee` parent | see 2.2 (authenticated + profile complete; NO permission prop) |
| `/admin/tds/mediclaim?tab=dashboard\|employees\|claims\|settings\|reports` | `pages/admin/TdsMediclaim` -> `AdminMediclaimWorkspace` | `AppLayout` under `/admin` parent | `ProtectedRoute requiredRole="admin" requiredPermission="ui.admin.mediclaim.view"` (parent also `requiredRole="admin"`) |
| `/mediclaim/verify/:token` | `pages/public/MediclaimCardVerify` | none (standalone, no sidebar, no `useAuth`) | none (public) |
No other mediclaim URLs exist. Claim detail, review panels, card viewer, rule book, hospitals etc. are Drawers/Modals inside these pages, not routes. `?tab=` is synced with `replace: true` when invalid/missing; tab click pushes history.

### 2.2 Guard logic (`ProtectedRoute` in `App.jsx`)
1. `initializing` -> full-page loader. Not authenticated -> `Navigate /login` with `state.from`.
2. Path starts with `/employee` -> if `!isEmployeeProfileComplete(user)` and path != `/employee/profile` => silently redirect to `/employee/profile`; otherwise `return children` IMMEDIATELY. Consequence: for `/employee/*` the `requiredRole`/`canRoute` checks are never evaluated (the early return precedes them), so the employee Mediclaim route has no role or permission gate at all — authorization is enforced by the backend permissions (each API call) and by the nav's module-availability flag.
3. Other paths: `requiredRole` mismatch -> refuse; `requiredPermission && !can(code)` -> refuse; `!canRoute(location.pathname)` -> refuse (`user.authorization.routes[path]` gives a permission code the server registered for that page; unknown routes are allowed). "Refuse" = `Navigate` to portal home (`/admin`, `/agent`, `/employee`) or `<AccessDenied/>` if already there.
4. Module availability (`hooks/useModuleAvailability.js`) is NOT part of route guarding — only of the nav (below). A user who types the URL still reaches the page; API calls then fail (backend `module.schema:mediclaim` middleware).

### 2.3 Navigation entries (`components/layout/useNavItems.js`, `AppLayout.jsx`, `utils/routePrefetch.js`)
| Portal | Sidebar group / label | Target | Shown when |
|---|---|---|---|
| Admin | "Statutory & Benefits" > "Mediclaim" | `/admin/tds/mediclaim` | `canPage("mediclaim")` (= permission `ui.admin.mediclaim.view`; super-admin `rawRole===0` always true; snapshot `authorization.permissions[code].allowed`; legacy fallback `permissions[key] !== "no_access"`) **AND** `isModuleAvailable("mediclaim")` |
| Employee | "Statutory & Benefits" > "Mediclaim" | `/employee/tds/mediclaim` | `isModuleAvailable("mediclaim")` only (no permission code) |
Module availability: `GET /api/modules` (`modulesApi.get`) -> `res.data.data.modules.mediclaim`; treated available unless explicitly `false`; cached in module memory for the session; errors => `{}` (available). Backend sets `modules.mediclaim=true` only when the mediclaim tables exist AND at least one published rule book exists AND some company has an active primary (non-backup) reviewer for each of `coordinator, committee, hr_verification, director` (`ModuleAvailabilityController`). Page titles (`AppLayout.jsx pageTitles`): `/admin/tds/mediclaim` = "Mediclaim Administration", `/employee/tds/mediclaim` = "Mediclaim". `routePrefetch` maps both URLs to their lazy chunk and prefetches on nav hover/focus.

---------------------------------------------------------------------------------------------------

## 3. API client (`features/mediclaim/services/mediclaimApi.js` + `utils/api.js`)

### 3.1 Transport (shared `apiRequest`, `utils/api.js`)
* **URL** = `${baseUrl}/api${path}`; every mediclaim path is `/v1/mediclaim/...` so the wire URL is `<origin>/api/v1/mediclaim/...`. `baseUrl` (`utils/url.js`): `VITE_API_BASE_URL` if set; in production builds `window.location.origin` (Nginx routes `/api/` to PHP-FPM); in dev on a Vite port it is `http(s)://<host, localhost->127.0.0.1>:8000` ; any trailing `/api` is stripped. `VITE_PROD_URL_MASTER|NIDHI_IMPEX|SILVER_STAR` (in `.env`, selected by git branch in `vite.config.js` -> `__PROD_API_URL__`) is only a fallback when `window` is undefined. Dev server port 5176.
* **Headers**: `Accept: application/json`; `Content-Type: application/json` unless body is `FormData` (then omitted so the browser writes the multipart boundary); `Authorization: <Type> <token>` built by mediclaimApi's `headers()`: `tokenType` capitalised (`bearer` -> `Bearer`), omitted entirely if no token. `fetch` is called with `cache: "no-store"`.
* **Timeout** 30 s (`AbortController`; `options.timeout` override) -> `Error("Request timed out after 30s. Please check your network connection and try again.")`. Network failure -> `Error("Unable to connect to the HRMS server. Please verify your connection and try again.")`. No retry logic anywhere.
* **Response handling**: body read as text; parsed only if `content-type` contains `application/json` (a helper `parseApiJsonResponse` tolerates a duplicated trailing JSON object — takes the last one). The function returns the WHOLE parsed JSON body (the envelope), NOT `body.data`. Success envelope from mediclaim controllers: `{"success": true, "data": <payload>}`; for lists `data` is a Laravel paginator object `{current_page, data:[…], per_page, total, last_page, …}` (callers read `res.data.data` and `res.data.total`) or sometimes a bare array. Callers unwrap themselves: `res?.data` (payload), then `payload.data`.
* **Error condition**: throws when `!response.ok` OR body `success === false` OR body `status === false` (even on HTTP 200). Message extraction order: `data.message` -> `data.error` (string) -> `data.error.message` -> "Something went wrong. Please try again.". The thrown `Error` carries `.status` and `.data` (full body). Backend error shapes: domain errors `{success:false, error:{code,message}}` (e.g. `NOT_FOUND` 404, `WRONG_CLAIM_OWNER` 403, `WRONG_ASSIGNED_REVIEWER` 403, `CONFIDENTIALITY_ACK_REQUIRED` 409, `INVALID_REPORT_TYPE` 422, `FORBIDDEN`); Laravel validation 422 = `{message, errors:{field:[…]}}` — the client surfaces ONLY `message`, field-level `errors` are never shown/mapped. Components display `err.message` in `toast.error(...)` or inline red text; no error-code branching exists in the mediclaim UI.
* **401 handling** (no refresh-token flow exists): when a request that carried an Authorization header returns 401, `window` gets a `CustomEvent("auth:unauthorized")`. `AuthContext` logs the user out (toast "Your session has expired") ONLY if the body's code is `TOKEN_EXPIRED|TOKEN_INVALID|TOKEN_BLACKLISTED` or the message contains "token is expired/invalid", "token has expired", "token not found", "jwt expired", "signature has expired", "unauthenticated." — other 401/403 (permission errors) never log out. Session is a JWT in `sessionStorage["auth_user"]`; sign-out broadcasts over `BroadcastChannel("auth-session")`.
* **Caching**: in-memory GET cache keyed `path + "::" + Authorization`, TTL 30 s (returns identical parsed body; "stale-while-revalidate" in the comment but implementation is plain TTL); ANY non-GET request (POST/PUT/DELETE/PATCH) clears the WHOLE cache first; `options.bypassCache` exists but mediclaim never passes it. Because of this, list reloads inside 30 s of the last identical GET and with no intervening mutation return cached data (the manual "Refresh" buttons therefore only re-fetch after 30 s or after a mutation).
* **Login (for context)**: `POST /api/login {email,password,company_code?}` -> `access_token|token`, `token_type`, `expires_in`, `user`. Then `GET /api/v1/authorization/me` (fallback `GET /api/my-permissions`) for the permission snapshot; `GET /api/profile` for the profile.

### 3.2 Query-string builder (`query()` in mediclaimApi.js)
Skips `undefined`, `null`, `""` and the literal string `"ALL"`; arrays -> repeated key (`k=a&k=b`); booleans -> `"1"`/`"0"` (Laravel `boolean` rule rejects "true"/"false"); everything else `String(value)` via `URLSearchParams` (so values are URL-encoded).

### 3.3 Case conversion vs backend `mediclaim.normalize_case`
Middleware `NormalizeMediclaimInputCase` (registered as `mediclaim.normalize_case`, applied to the whole authenticated `v1/mediclaim` route group) recursively converts every camelCase KEY to snake_case (`Str::snake`) in BOTH the query string (all methods) and the JSON/POST body (lists' integer keys untouched; already-snake keys round-trip). Values are never altered. The public `cards/verify/{token}` route is outside that group. Consequences visible in the client: the frontend freely sends `perPage`, `includeInactive`, `policyVersionId`, `memberId`, `proposedValues:{dateOfBirth}` etc.; `NewClaimRequestModal` and `finalizeTreatment` send snake_case directly; `submitReviewDecision` intentionally sends BOTH `approvedAmount` and `approved_amount`. Anything the client sends inside `proposedValues` (e.g. `dateOfBirth`) reaches the controller as `date_of_birth`. Response keys are NOT converted — see 3.5. Multipart bodies also pass through the middleware (`isMethod('post')`).

### 3.4 Function table (all 65 functions, `BASE = "/v1/mediclaim"`)
Legend: "perm" = backend route permission (from `routes/mediclaim.php`); "UNUSED" = no caller anywhere in `src/` (only in the API client / its tests). "Reads" = response fields the UI consumes. `P` = payload = `res.data`.

**Self-service: coverage, onboarding, members, cards**
| Function | Method + URL | Sends | Reads | Used by |
|---|---|---|---|---|
| `myCoverage()` | GET `/me/coverage` | – | `P.enrollment{status, enrolledAt, terminatedAt, policyVersion{effectiveFrom,effectiveTo,policy{name}}}`, `P.floater{limit,used,remaining,financialYearStart,financialYearEnd}`, `P.members[]{id,fullName,relationshipType}`, `P.hospitals[]` (count only), `P.eligibility{eligible, days_remaining, eligible_from, waiting_period_months}` (snake_case; camel fallbacks read), `P.onboarding{completed, ruleBookAcknowledged}`. perm `self.mediclaim.coverage.read` | `useMediclaimLookups` (gate) and `MediclaimInfoTab` (hero) - called twice on employee page load |
| `acknowledgeRuleBook()` | POST `/me/rule-book-acknowledge` (no body) | – | ignores body; then `lookups.reload()` | `RuleBookTab` "I have read this rule book" ; perm `self.mediclaim.onboarding.update`, throttle 20/min |
| `completeOnboarding()` | POST `/me/onboarding-complete` (no body) | – | ignores body; `lookups.reload()` | `FamilyMembersTab` "Continue to Mediclaim"; perm `self.mediclaim.onboarding.update` |
| `myMembers()` | GET `/me/members` | – | list: `id, fullName|full_name|name, relationshipType, dateOfBirth, gender, status` (`active`…) | `useMediclaimLookups` -> `FamilyMemberManager`, `MemberPicker`; perm `self.mediclaim.member.read` |
| `memberChangeRequests(filters)` | GET `/me/member-change-requests?…` | filters (none passed) | list rows: `id, requestType, status, createdAt, proposedValues{name…}, member{…}` | `FamilyMemberManager` history; perm `self.mediclaim.member_change_request.read` |
| `createMemberChangeRequest(payload)` | POST `/me/member-change-requests` JSON | `{requestType:"ADD"|"UPDATE"|"REMOVE", memberId?, relationshipType, reason?, proposedValues?:{name, dateOfBirth?, gender?("MALE"|"FEMALE"|"OTHER"), relationshipType}}` (`proposedValues` omitted for REMOVE) | only checks `res.status !== false`; success toast; then reloads history + members | `FamilyMemberManager`; perm `self.mediclaim.member_change_request.create`, throttle 20/min. Comment in code: backend applies immediately (auto-approve) after server-side eligibility validation |
| `myCards()` | GET `/me/cards` | – | list: `id, status(active/expired/revoked/superseded), verifyToken, cardNumber, validFrom, validTo, memberName, relationshipType, member{fullName,relationshipType}, memberId` | `CardViewer`, `MediclaimInfoTab` (count); perm `self.mediclaim.card.read` |

**Self-service: intimations (client exists, no UI)**
| `myIntimations(filters)` | GET `/me/intimations` | filters | – | UNUSED (Notify Office tab was removed); perm `self.mediclaim.intimation.read` |
| `createIntimation(payload)` | POST `/me/intimations` | payload (shape not defined client-side) | – | UNUSED; perm `self.mediclaim.intimation.create`, throttle 20/min |
| `adminIntimations(filters)` | GET `/intimations` | filters | – | UNUSED; perm `mediclaim.intimation.read` |
| `closeIntimation(id, payload)` | POST `/intimations/{id}/close` | payload | – | UNUSED; perm `mediclaim.intimation.close` |

**Claims (self-service, team, admin)**
| `myClaims(filters)` | GET `/me/claims` | `status`, `year` (FY label like `2025-26`), `search`, `page`, `perPage` (10/15/25/50/100 selectable; Info tab uses 100) | rows: `id|claimId, claimNumber, patientName|patient_snapshot.name, totalClaimedAmount, approvedAmount|totalApprovedAmount, status, updatedAt, missingDocumentTypes` ; `payload.total` | `MyClaimsTab`, `MediclaimInfoTab` (banner); perm `self.mediclaim.claim.read` |
| `createClaim(payload)` | POST `/me/claims` JSON | snake_case claim body (see 6.1 "New Claim Request" for full field list) | `res.data.id | claimId` | `NewClaimRequestModal`; perm `self.mediclaim.claim.create`, throttle 30/min |
| `teamClaims(filters)` | GET `/team/claims` | `page, perPage, bucket("in_review"|"finalized"|omitted), status, search` | rows like myClaims + `employeeName|employee_snapshot.name`; `total` | `TeamClaimsTab`; perm `mediclaim.team_claim.read` |
| `teamPendingApprovals(filters)` | GET `/team/pending-approvals` | filters | – | UNUSED (removed "Pending My Approval" tab); perm `mediclaim.claim.manager.decide` |
| `adminClaims(filters)` | GET `/claims` | Dashboard: `page=1,perPage=200`; PendingReviews Approved-Claim sub-tab: `page, perPage, status (comma list), search, financial_year, year` | rows: `id, claimNumber, employeeName, patientName, totalClaimedAmount, approvedAmount|totalApprovedAmount, status, createdAt, updatedAt, submittedAt`; `total` | `DashboardTab`, `PendingReviewsTab` (finalized bucket), `ClaimsTab` (unmounted); perm `mediclaim.claim.read` |
| `deleteClaim(id)` | DELETE `/claims/{id}` | – | ignores body | `PendingReviewsTab` trash icon (after `window.confirm`), `ClaimsTab`; perm `mediclaim.claim.delete` (hard delete) |

**Claim resource (shared employee/reviewer)**
| `getClaim(id)` | GET `/claims/{id}` | – | full claim `P`: `claimNumber, status, patientName|patient_snapshot{name}, relationshipType, totalClaimedAmount, approvedAmount|totalApprovedAmount, submittedAt, treatmentType, isMedicoLegal(Case), natureOfIllness, treatingDoctorName, firstSymptomDate, firstConsultationDate, admissionAt, dischargeAt, isOngoingTreatment, treatmentDescription, isNetworkHospital, hospital{name}|hospitalName, nonNetworkHospitalName, documentsDueAt, expenses[]|expenseLines[]|expense_lines[]{id, category, description, claimed_amount|claimedAmount|amount, approved_amount|approvedAmount, disallowed_reason}` | `ClaimDetailDrawer`, `ClaimFullDetail` (inside every review panel); perm any of `self.mediclaim.claim.read, mediclaim.claim.read, …approve, …manager.decide, …coordinator.decide, …committee.decide, …hr_verification.decide, …director.decide, mediclaim.audit.read` |
| `updateClaim(id, payload)` | PUT `/claims/{id}` | same body as createClaim | `res.data.id` | `NewClaimRequestModal` (edit / retry) ; perm `self.mediclaim.claim.update` |
| `submitClaim(id)` | POST `/claims/{id}/submit` (no body) | – | ignored | `NewClaimRequestModal` (right after create/update); perm `self.mediclaim.claim.submit`, throttle 30/min |
| `returnClaim(id, payload)` | POST `/claims/{id}/return` | payload | – | UNUSED; perm any manager/coordinator/committee/hr/director `.decide` |
| `withdrawClaim(id)` | POST `/claims/{id}/withdraw` (no body) | – | – | UNUSED — there is NO withdraw button in the UI even though status `WITHDRAWN` exists; perm `self.mediclaim.claim.withdraw` |
| `recordClaimDischarge(id, dischargeAt)` | POST `/claims/{id}/discharge` | `{discharge_at}` | – | UNUSED (superseded by finalizeTreatment); perm `self.mediclaim.claim.update` |
| `finalizeTreatment(id, {dischargeAt, expenses})` | POST `/claims/{id}/finalize-treatment` | `{discharge_at, expenses:[{category, description|null, claimed_amount, expense_date|null}]}` (mapper from camel `claimedAmount`/`expenseDate`) | ignored; reloads claim | `ClaimDetailDrawer` "Finalize Treatment" form; perm `self.mediclaim.claim.update` |

**Claim documents, timeline, decisions**
| `claimDocuments(id)` | GET `/claims/{id}/documents` | – | list: `documentId|id, documentType|document_type, currentVersion{fileName,mimeType}, fileName, mimeType` | `ClaimDetailDrawer`, `ClaimFullDetail`, `SettlementPanel`; perm `self.mediclaim.document.download` or `mediclaim.claim_document.download` |
| `uploadClaimDocument(id, {file, documentType, description?, idempotencyKey?})` | POST `/claims/{id}/documents` **multipart/form-data** | FormData fields `file`, `documentType` (sent camel; middleware -> `document_type`), optional `description`; optional header `Idempotency-Key` (no caller passes it) | ignored; toast then reloads | `DocumentChecklist` (one file per type; "Upload"/"Replace" both POST); perm `self.mediclaim.document.upload` or `mediclaim.claim_document.upload`, throttle 30/min |
| `claimTimeline(id)` | GET `/claims/{id}/timeline` | – | events: `label|eventType|event_type, createdAt, actorName|actor.name, description` | `ClaimTimeline`; perm `self.mediclaim.claim.read` or `mediclaim.audit.read` |
| `claimDecisions(id)` | GET `/claims/{id}/decisions` | – | entries: `stage, decision, approvedAmount|fields.approvedAmount, decidedByName|actor.name, decidedAt|createdAt` | `ClaimDecisionsList`; same perm |

**Reviews**
| `acknowledgeConfidentiality(id)` | POST `/claims/{id}/confidentiality-ack` | – | ignored | `ManagerReviewPanel` (called automatically before its decision); perm `mediclaim.claim.manager.decide` |
| `reviewsPending(filters)` | GET `/reviews/pending` | `perPage=100` | rows: `id|claimId, claimNumber, employeeName, patientName, totalClaimedAmount, status, currentStage|current_stage, submittedAt` | `PendingReviewsTab`; perm any of `claim.approve, manager.decide, coordinator.decide, committee.decide, hr_verification.decide, director.decide, settlement.create` |
| `submitReviewDecision(id, payload)` | POST `/reviews/{id}/decision` JSON | payload copied; if `approvedAmount` present and `approved_amount` absent (or vice versa) BOTH are set. Shapes per panel (6.2.4). The client NEVER sends a stage; backend infers it from claim status | `res.data` passed to `onDecided` (not inspected) | Approval/Manager/Coordinator/Committee/HR/Director/Settlement panels; throttle 30/min; same multi-perm as reviewsPending |

**Policies & enrollments (mostly unused)**
| `policies(filters)` | GET `/policies` | `{}` | `policy[]{name|policyCode, versions[]{id|versionId, versionNumber}}` | `EmployeesTab` "Edit Enrollment" drawer (policy-version dropdown); perm `mediclaim.policy.read` |
| `createPolicy`, `updatePolicy(id)`, `publishPolicyVersion(policyId, versionId)` | POST `/policies`; PUT `/policies/{id}`; POST `/policies/{p}/versions/{v}/publish` | JSON | – | UNUSED (Policies tab removed; no UI reaches policy admin). perms `mediclaim.policy.create/update/publish` |
| `enrollments(filters)`, `createEnrollment(payload)` | GET/POST `/enrollments` | – | – | UNUSED (enrolment is auto-provisioned server-side). perms `mediclaim.enrollment.read/create` |
| `updateEnrollment(id, payload)` | PUT `/enrollments/{id}` | `{policyVersionId, status:"ACTIVE"|"INACTIVE", effectiveFrom?, effectiveTo?}` | ignored | `EmployeesTab` Edit Enrollment drawer; perm `mediclaim.enrollment.update` |

**Admin: employees**
| `adminEmployees(filters)` | GET `/admin/employees` | `page, perPage (10/15/25/50/100), status("not_eligible"|"pending"|"completed"|omitted for all), search (debounced 300 ms), department` | `payload.data[]{id, name, empCode, department, mediclaimStatus, eligibility{eligible, eligible_from, days_remaining}, activeMembersCount, enrollment{policyVersion{policy{name}}}}`, `payload.total`, `payload.departments[]`, `payload.statusCounts{all, not_eligible, pending, completed}` | `EmployeesTab`; perm `mediclaim.enrollment.read` |
| `adminEmployeeDetail(employeeId)` | GET `/admin/employees/{id}` | – | `P.employee{id,name,empCode,department,designation,companyCode,joiningDate,mobileNumber,photo,mediclaimStatus,eligibility}`, `P.enrollment{id, status, enrolledAt, policyVersionId, effectiveFrom, effectiveTo, policyVersion{policy{name}}}`, `P.members[]`, `P.cards[]{id,memberId,…}`, `P.changeRequests[]{id, requestType, status, createdAt, proposedValues, member}` | `EmployeesTab` detail drawer; perm `mediclaim.enrollment.read` |
| `bulkIssueEmployeeCards()` | POST `/admin/employees/bulk-issue-cards` (no body) | – | `P{processed, issued, alreadyIssued, notEligible, failed}` used in toast | `EmployeesTab` "Issue Mediclaim to All Eligible Employees"; perm `mediclaim.enrollment.create`, throttle 5/min |

**Admin: hospitals**
| `hospitals(filters)` | GET `/hospitals` | `{}` | `id|hospitalId, name, address, city, state, pincode, latitude, longitude, googleMapsUrl, specialties[]|specialities[], isNetworkHospital, cashlessAvailable, status("active"|"inactive"), contacts[]|hospitalContacts[]{id,name,designation,phone,email,availability,photo}` | `useMediclaimLookups` (employee), `HospitalsTab`; perm `mediclaim.hospital.read` (note: employee lookups need this too) |
| `createHospital(payload)` | POST `/hospitals` JSON | `{name, address?, city?, state?, pincode?, latitude|null, longitude|null, googleMapsUrl|null, companyCode?, specialties[], isNetworkHospital, cashlessAvailable, status}` | ignored | `HospitalsTab`; perm `mediclaim.hospital.create`, throttle 20/min |
| `updateHospital(id, payload)` | PUT `/hospitals/{id}` | same | ignored | `HospitalsTab` (also used to "Restore" a removed hospital by setting status back); perm `mediclaim.hospital.update` |
| `deleteHospital(id)` | DELETE `/hospitals/{id}` | – | – | `HospitalsTab` Delete (backend only status-flips to inactive); perm `mediclaim.hospital.delete` |
| `createHospitalContact(hospitalId, {name, designation?, phone, email?, availability?, photo?})` | POST `/hospitals/{h}/contacts` **multipart** | FormData `name, designation, phone, email, availability, photo(File)` (optional ones only if truthy) | `res.data.contacts[]` replaces drawer list | `HospitalsTab`; perm `mediclaim.hospital.update`, throttle 20/min |
| `updateHospitalContact(hospitalId, contactId, {...})` | POST (not PUT) `/hospitals/{h}/contacts/{c}` **multipart** | only the provided keys; blank strings sent as `""` to clear | `res.data.contacts[]` | `HospitalsTab`; same perm |
| `deleteHospitalContact(hospitalId, contactId)` | DELETE `/hospitals/{h}/contacts/{c}` | – | `res.data.contacts[]` | `HospitalsTab`; perm `mediclaim.hospital.delete` |
Contact photo URL: `formatters.getHospitalContactPhotoUrl(photo)` -> absolute URL passthrough (http/https/protocol-relative/data:) else `${baseUrl}/storage/${photo without leading slashes}`.

**Document requirements (shared read)**
| `documentRequirements(filters)` | GET `/document-requirements` | `includeInactive` (admin "Show retired") | rows: `id, documentType|document_type, label, isRequired|is_required, conditionalRule|conditional_rule ("hospitalized_or_surgery"|"medico_legal"|null), maxFileSizeKb, sortOrder, isActive` | `useMediclaimLookups`, `DocumentChecklist` (via prop), `SettlementPanel`, `ClaimDetailDrawer`, `DocumentSettingsTab`; perm `mediclaim.document_requirement.read` OR `self.mediclaim.document.upload` OR `self.mediclaim.claim.read` |
| `createDocumentRequirement(payload)` | POST | `{documentType (upper-cased, spaces->_), label, isRequired, conditionalRule|null, maxFileSizeKb (=max(64, round(MB*1024))), sortOrder?}` | – | `DocumentSettingsTab`; perm `.create`, throttle 20/min |
| `updateDocumentRequirement(id, payload)` | PUT `/document-requirements/{id}` | same shape; or `{isActive:true}` to restore | – | `DocumentSettingsTab` (documentType field disabled when editing); perm `.update`, 30/min |
| `deleteDocumentRequirement(id)` | DELETE | – | – | `DocumentSettingsTab` "Retire" (soft); perm `.delete` |

**Rule book languages & rule books**
| `ruleBookLanguages(filters)` | GET `/rule-book-languages` | `{}` | `id, name, nativeName` | `RuleBooksTab`; perm `mediclaim.rule_book.read` |
| `createRuleBookLanguage(payload)` | POST | `{companyCode?, name, nativeName}` (picked from 23-language list, 6.2) | `res.data.id` selects it | `RuleBooksTab`; perm `.create` |
| `updateRuleBookLanguage(id, payload)` | PUT `/rule-book-languages/{id}` | – | – | UNUSED |
| `deleteRuleBookLanguage(id)` | DELETE | – | – | `RuleBooksTab` (confirm: "also deletes its rule book and every rule"); perm `.delete` |
| `ruleBooks(filters)` | GET `/rule-books` | `{}` | `id, status("draft"|"published"|"archived"), languageId, language{id,name,nativeName}, items[]{id, ruleText}` | `useMediclaimLookups`, `RuleBooksTab`; perm `mediclaim.rule_book.read` |
| `createRuleBook(payload)` | POST `/rule-books` | `{companyCode?, languageId}` | – | `RuleBooksTab` "create rule book" (one per language); perm `.create` |
| `updateRuleBook(id, payload)` | PUT | – | – | UNUSED |
| `publishRuleBook(id)` | POST `/rule-books/{id}/publish` | – | – | `RuleBooksTab` (only when status `draft` and `.publish`) |
| `addRuleBookItem(bookId, {ruleText})` | POST `/rule-books/{b}/items` | `{ruleText}` | – | `RuleBooksTab`; perm `.update`, 60/min |
| `updateRuleBookItem(bookId, itemId, {ruleText})` | PUT `/rule-books/{b}/items/{i}` | – | – | `RuleBooksTab` |
| `deleteRuleBookItem(bookId, itemId)` | DELETE | – | – | `RuleBooksTab` (confirm) |
| `reorderRuleBookItems(bookId, itemIds)` | PUT `/rule-books/{b}/items-reorder` | `{itemIds:[ids in new order]}` (client swaps two neighbours and sends full order) | – | `RuleBooksTab` up/down arrows |

**Reviewer assignments, settlements, reports, audit, public**
| `reviewerAssignments(filters)` | GET `/reviewer-assignments` | `{}` | rows: `id|assignmentId, role, userId, user/name fields, isBackup, activeFrom, activeTo, status` | `ReviewersTab`; perm `mediclaim.reviewer_assignment.read` |
| `createReviewerAssignment(payload)` | POST | `{role("coordinator"|"committee"|"hr_verification"|"director"|"settlement"), userId, isBackup, activeFrom?, activeTo?, companyCode?}` | – | `ReviewersTab`; perm `.assign` |
| `updateReviewerAssignment(id, payload)` | PUT | same | – | `ReviewersTab` |
| `deleteReviewerAssignment(id)` | DELETE `/reviewer-assignments/{id}` | – | – | `ReviewersTab` (confirm). **Backend has NO route for this** — routes/mediclaim.php defines only GET/POST/PUT for reviewer-assignments, so the delete call will 404/405 (see Open questions) |
| `settlements(filters)` | GET `/settlements` | – | – | UNUSED; perm `mediclaim.settlement.read` (POST `/settlements` exists server-side, no client method) |
| `reports(filters)` | GET `/reports` | `reportType` AND `type` (same value), `from`, `to`, `reveal`(=1 if ticked), and for the "Export" button additionally `export=1&format=csv` | `P{columns:{key:label}, rows:[…], meta{count, generatedAt}}` or (dashboard) key/value object; `P.url|downloadUrl` expected for export | `ReportsTab`; perm `mediclaim.report.read` |
| `audit(filters)` | GET `/audit` | `page, perPage=20, search, from, to` | rows: `actorName, action|activityType|eventType, subjectType, subjectId, description|remarks, createdAt`; `total` | `AuditHistoryTab` (UNMOUNTED); perm `mediclaim.audit.read` |
| `verifyCard(token)` | GET `/cards/verify/{encodeURIComponent(token)}` — **no auth header by design** | – | body `{success, data:{valid, member_name, member_number_masked, policy_number_masked, company, insurer_name, valid_from, valid_to, approved_hospitals[]{name,city}, emergency_contact{designation,phone}}}` (page reads `res.data ?? res`) | `MediclaimCardVerify`; public, throttle 20/min, response header `Cache-Control: no-store`; failure = `404 {success:false,error:{code:"NOT_FOUND",message:"This card could not be verified."}}` |

**Other endpoints used by mediclaim screens but NOT in mediclaimApi**
* `POST /api/v1/documents/{documentId}/view-url` and `/download-url` body `{versionId:null}` -> `res.data.url` (+`expiresAt`) — used by the shared `DocumentViewerModal` to open an uploaded claim document (presigned URL fetched fresh each open, iframe/img preview, `window.location.assign(url)` for download). `documentId` = `doc.documentId ?? doc.id`.
* `GET /api/profile` (`authApi.getProfile`) — `CardViewer` for the employee's own photo/`emp_code`/`company_code`/department/designation shown on the self card.
* `salaryApi.getAllEmployees(...)` (`ReviewersTab` reviewer picker: `status=Active, per_page=200`, company scope).

**Backend routes with NO client function**: `GET member-change-requests` and `POST member-change-requests/{id}/decision` (HR side — the UI has no HR approval screen; changes auto-apply), `POST policies/{policy}/versions`, `POST settlements`, `GET reports/export`.

### 3.5 Response casing reality (important for a non-React client)
The API mixes styles. Evidence in UI code: camelCase (`claimNumber, totalClaimedAmount, policyVersion, ruleBookAcknowledged, statusCounts, mediclaimStatus, activeMembersCount, verifyToken`), snake_case (`eligibility.days_remaining/eligible_from/waiting_period_months`, verify payload `member_name…`, `patient_snapshot`, `missing_document_types`, expense `claimed_amount/approved_amount/disallowed_reason`, `first_symptom_date`, `documents_due_at`), and sometimes both (`fullName || full_name`). Every UI reader carries fallbacks. A new client should read both or normalize after checking the actual JSON.

### 3.6 File upload / download / export handling
* Upload: `FormData` (never manual `Content-Type`), used for `uploadClaimDocument` (`file`, `documentType`, `description`) and hospital contacts (`photo`). Per-type size limit `maxFileSizeKb` comes from document requirements but the client does NOT pre-validate size/type (only server does). Optional `Idempotency-Key` header supported, unused.
* Download: no blob download from the API. Documents open via presigned URLs (above). Claim/admin/team tables export CSV entirely client-side (`utils/exportUtils.downloadCSV(rows, name)` over the rows currently in memory: filtered set for the two client-bucketed pending tabs, current page only for server-paginated tables). Card image = client-side `html2canvas` PNG (scale 3, white background) downloaded via a temporary `<a download>`. Report "Export CSV" calls `GET /reports?…&export=1&format=csv` and expects `data.url|data.downloadUrl` (see Open questions: backend export is `GET /reports/export` streaming CSV, so this path likely does not work).

---------------------------------------------------------------------------------------------------

## 4. Client authorization

### 4.1 How permissions load
`AuthContext` after login/session restore: super admin (`rawRole===0`) and agents (`role==="agent"` or `rawRole===4`) get `permissions {"*":"read_write"}` (no server call). Others: `GET /api/v1/authorization/me` -> `data = {permissions:{<code>:{allowed:bool, state:"NOT_ASSIGNED"|…}}, requires:{<code>:[parentCodes]}, routes:{<path>:<code>}, portal, featureFlags, roles}` stored as `user.authorization`; a flat map `user.permissions[code] = "read_write"|"no_access"` is derived. Fallback: `GET /api/my-permissions` (legacy `key_name/value`). If both fail `authorizationStatus="unavailable"` and everything is denied.

### 4.2 `useAuthorization().can(code)` (`hooks/useAuthorization.js`)
```
if (!code) true
if rawRole == 0 -> true            // super admin
if permissions["*"] == "read_write" -> true
holds(c) = authorization.permissions[c] ? authorization.permissions[c].allowed : permissions[c]=="read_write"
result = holds(code) && every(requires[code]).holds      // a child never bypasses a denied parent
```
Also `canRoute(path)` (`/employee*` always true; else `authorization.routes[path]` -> `can(code)`; unknown route -> true), `accessState/routeState` ("allow"/"deny"/"unassigned"), `check(code, resource)` = `POST /api/v1/authorization/check {permissionCode, resource}` (unused by mediclaim). Server middleware remains the real authority.

### 4.3 `useMediclaimAuthorization()` flags (`hooks/useMediclaimAuthorization.js`, memoised)
Also exposes `can, canRoute, accessState, routeState, check, snapshot`, `canDecideStage(stage)`, `mediclaimActionAccess(stage) -> {stage, permission, canDecide}`, `stageDecidePermissions`.
| Flag | Permission code |
|---|---|
| `canViewAdminWorkspace` | `ui.admin.mediclaim.view` |
| `canViewCoverage` | `self.mediclaim.coverage.read` |
| `canViewMembers` | `self.mediclaim.member.read` |
| `canRequestMemberChange` | `self.mediclaim.member_change_request.create` |
| `canViewMemberChangeRequests` | `self.mediclaim.member_change_request.read` |
| `canViewCards` / `canDownloadCard` | `self.mediclaim.card.read` / `self.mediclaim.card.download` |
| `canCreateIntimation` / `canViewIntimations` | `self.mediclaim.intimation.create` / `.read` |
| `canCreateClaim` / `canViewOwnClaims` / `canUpdateOwnClaim` / `canSubmitClaim` / `canWithdrawClaim` | `self.mediclaim.claim.create` / `.read` / `.update` / `.submit` / `.withdraw` |
| `canUploadDocument` / `canDownloadDocument` | `self.mediclaim.document.upload` / `.download` |
| `canViewTeamClaims` | `mediclaim.team_claim.read` |
| `canReviewPendingApprovals` | `mediclaim.claim.manager.decide` |
| `canReassignReviewer` | `mediclaim.claim.reassign` |
| `canDeleteClaim` | `mediclaim.claim.delete` |
| `canRecordSettlement` | `mediclaim.settlement.create` |
| `canReviewAnyStage` | any of `mediclaim.claim.approve, …manager.decide, …coordinator.decide, …committee.decide, …hr_verification.decide, …director.decide, mediclaim.settlement.create` |
| `canViewPolicies` | `mediclaim.policy.read` |
| `canViewHospitalsAdmin` | `mediclaim.hospital.read` |
| `canViewRuleBooksAdmin` | `mediclaim.rule_book.read` |
| `canViewReviewerAssignments` | `mediclaim.reviewer_assignment.read` |
| `canViewReports` / `canViewAudit` | `mediclaim.report.read` / `mediclaim.audit.read` |
| `canViewIntimationsAdmin` / `canCloseIntimation` | `mediclaim.intimation.read` / `mediclaim.intimation.close` |
| `canViewDocumentRequirements` | `mediclaim.document_requirement.read` |
Constant map `MEDICLAIM_PERMISSIONS` additionally names `MANAGER_DECIDE`, `SETTLEMENT_READ = mediclaim.settlement.read`, `DOCUMENT_REQUIREMENT_CREATE/UPDATE/DELETE`, `CLAIM_READ_ADMIN = mediclaim.claim.read`.

`utils/formActionAccess.js#mediclaimActionAccess(can)` (different function, same name) returns booleans keyed: `claimApprove(mediclaim.claim.approve), managerDecide, coordinatorDecide, committeeDecide, hrVerificationDecide(mediclaim.claim.hr_verification.decide), directorDecide, settlementCreate, claimDelete, teamClaimRead, policyRead/Create/Update/Publish, hospitalRead/Create/Update/Delete, ruleBookRead/Create/Update/Publish, reviewerAssignmentRead/Assign, reportRead/Export/Reveal, auditRead, selfClaimCreate/Update/Submit/Withdraw, selfDocumentUpload/Download, selfIntimationCreate, selfMemberChangeRequestCreate` (codes as `mediclaim.<resource>.<verb>` / `self.mediclaim.<…>`). Only the review-related ones are actually consumed (by `PendingReviewsTab`).

### 4.4 Codes checked directly with `can(...)` (not through the hook flags)
`mediclaim.enrollment.create` (bulk issue button), `mediclaim.enrollment.update` (Edit Enrollment link), `mediclaim.hospital.create/update/delete`, `mediclaim.rule_book.create/update/delete/publish`, `mediclaim.document_requirement.create|update` (Add/Edit/Retire/Restore), `mediclaim.reviewer_assignment.assign`, `mediclaim.report.reveal` (checkbox), `mediclaim.report.export` (button), `mediclaim.claim.delete` (trash icon).

### 4.5 How the UI hides/disables
* Tabs: filtered with `TABS.filter(t => !t.permissions || t.permissions.some(can))` (any-of).
* Buttons/controls: not rendered when the flag is false (no disabled-with-tooltip pattern). Settings sections filtered by `permission`.
* Review panels: `PendingReviewsTab` picks the panel by claim stage and renders it only if `access[STAGE_ACCESS_KEY[stage]]`; otherwise it shows the read-only `ClaimDetailDrawer`.
* The employee self-service flags (`canCreateClaim`, `canSubmitClaim`, `canUploadDocument`, etc.) exist in the hook but are NOT used to hide the employee's buttons — New Claim Request, upload, family changes, etc. always render; the backend rejects if not permitted (error toast).
* Employee `team` tab uses raw string `mediclaim.team_claim.read`.

---------------------------------------------------------------------------------------------------

## 5. Models, utils and lookups (exact rules)

### 5.1 `models/claimStatus.js` — 16 statuses (plain strings, `mediclaim_claims.status`)
| Status | Label | Meaning (tooltip) | Badge tone (Tailwind) | Terminal |
|---|---|---|---|---|
| DRAFT | Draft | Not yet submitted. Editable only by the employee. | gray | no |
| SUBMITTED | Submitted | Submitted and awaiting assignment to the manager review stage. | sky | no |
| MANAGER_REVIEW | Manager Review | Awaiting the employee's assigned manager's decision. | amber | no |
| COORDINATOR_VERIFICATION | Coordinator Verification | Awaiting Mediclaim Coordinator verification (Section H). | amber | no |
| COMMITTEE_RECOMMENDATION | Committee Recommendation | Awaiting Mediclaim Committee recommendation (Section I). | amber | no |
| HR_ELIGIBILITY_VERIFICATION | HR Eligibility Verification | Awaiting HR eligibility and policy applicability verification (Section J). | amber | no |
| DIRECTOR_FINAL_APPROVAL | Director Final Approval | Awaiting the Director's final approval decision (Section K). | amber | no |
| APPROVED | Approved | Fully approved by the Director for the claimed amount. | green | no |
| PARTIALLY_APPROVED | Partially Approved | Approved for less than the total claimed amount. | teal | no |
| REJECTED | Rejected | Rejected at the Director's final approval stage. | red | **yes** |
| SETTLEMENT_PENDING | Settlement Pending | Approved and awaiting settlement/payout. | indigo | no |
| SETTLED | Settled | Settlement recorded in full. | emerald | no |
| CLOSED | Closed | Fully settled and closed out. | slate | **yes** |
| RETURNED_FOR_CORRECTION | Returned for Correction | Sent back to the employee for correction. Resubmitting restarts at Manager Review. | orange | no |
| WITHDRAWN | Withdrawn | Withdrawn by the employee before manager approval. | gray | **yes** |
| CANCELLED | Cancelled | Cancelled by an administrator. | gray | **yes** |
Chart hexes (DashboardTab only): DRAFT/WITHDRAWN/CANCELLED `#9ca3af`, SUBMITTED `#0ea5e9`, all five review statuses `#f59e0b`, APPROVED `#22c55e`, PARTIALLY_APPROVED `#14b8a6`, REJECTED `#ef4444`, SETTLEMENT_PENDING `#6366f1`, SETTLED `#10b981`, CLOSED `#94a3b8`, RETURNED_FOR_CORRECTION `#f97316`. `ClaimStatusBadge` = pill with dot + label, title=description; unknown status renders the raw string in gray. There is no "next actions" table in `claimStatus.js`; the only helpers are `getClaimStatusMeta`, `isTerminalClaimStatus`, `CLAIM_STATUS_LIST`. Actions per status are decided in components: employee "row click" opens the edit modal only for `DRAFT` and `RETURNED_FOR_CORRECTION` (`EDITABLE_STATUSES`), everything else opens the read-only drawer; document upload allowed while status is NOT terminal (`REJECTED, CLOSED, WITHDRAWN, CANCELLED` block it; SETTLED still allows re-upload).

### 5.2 `models/reviewStages.js`
Stage constants: `APPROVAL, MANAGER, COORDINATOR, COMMITTEE, HR_ELIGIBILITY, DIRECTOR, SETTLEMENT`. `REVIEW_STAGES_IN_ORDER = [MANAGER, COORDINATOR, COMMITTEE, HR_ELIGIBILITY, DIRECTOR]` (legacy chain).
Decision values (sent verbatim as `decision`, MUST be lowercase; backend uses exact `in_array`): `approve, reject, return, verified, recommended, not_recommended, approved, partially_approved, rejected`. (Settlement additionally sends the literal `"final_approve"`, not in this map.)
| Stage | Label / section | Pending status(es) | Decide permission | Decision options (value : label) | Clean-approve (no remarks needed) | Approved amount |
|---|---|---|---|---|---|---|
| APPROVAL (current simplified workflow) | Approval | `SUBMITTED` and `MANAGER_REVIEW` (both resolve here) | `mediclaim.claim.approve` | approved: Approved; partially_approved: Partially Approved; rejected: Rejected | approved | required unless `rejected` |
| MANAGER (legacy) | Manager Review | MANAGER_REVIEW | `mediclaim.claim.manager.decide` | approve: Approve; reject: Reject; return: Return for Correction | approve | – |
| COORDINATOR (legacy) | Coordinator Verification / Section H | COORDINATOR_VERIFICATION | `mediclaim.claim.coordinator.decide` | verified: Verified; return: Return for Correction | verified | – |
| COMMITTEE (legacy) | Committee Recommendation / Section I | COMMITTEE_RECOMMENDATION | `mediclaim.claim.committee.decide` | recommended: Recommended; not_recommended: Not Recommended | recommended | – |
| HR_ELIGIBILITY (legacy) | HR Eligibility Verification / Section J | HR_ELIGIBILITY_VERIFICATION | `mediclaim.claim.hr_verification.decide` | verified; return | verified | – |
| DIRECTOR (legacy) | Director Final Approval / Section K | DIRECTOR_FINAL_APPROVAL | `mediclaim.claim.director.decide` | approved; partially_approved; rejected | approved | required unless rejected; <= claimed total |
| SETTLEMENT (legacy) | Settlement | SETTLEMENT_PENDING | `mediclaim.settlement.create` | standalone form (amount, mode, reference) | – | – |
`getStageByPendingStatus(status)`: `SUBMITTED|MANAGER_REVIEW -> APPROVAL`; otherwise first stage whose `pendingStatus === status`; `APPROVED/PARTIALLY_APPROVED/… -> null` (=> read-only drawer). The row's own `currentStage|current_stage` (if a valid `REVIEW_STAGE` key) takes precedence in `PendingReviewsTab.resolveStage`.
Workflow buckets (shared by admin Pending Reviews and employee My Claims):
* `PENDING_DOCUMENT_STATUSES` = `APPROVED, PARTIALLY_APPROVED, SETTLEMENT_PENDING`
* `FINALIZED_CLAIM_STATUSES` = `REJECTED, SETTLED, CLOSED, WITHDRAWN, CANCELLED`
* `PENDING_APPROVAL_STATUSES` = all other statuses (DRAFT, SUBMITTED, the 5 review statuses, RETURNED_FOR_CORRECTION)
* `getClaimWorkflowBucket(status)` -> `PENDING_DOCUMENT | FINALIZED | PENDING_APPROVAL` (default).

### 5.3 `utils/formatters.js`
* `formatCurrencyINR(n)`: non-finite -> `"—"`; else `"₹" + n.toLocaleString("en-IN", {min 2, max 2 fraction digits})`.
* `formatClaimDate(v)`: falsy/invalid -> `"—"`; else `toLocaleDateString("en-IN", {day:"2-digit", month:"short", year:"numeric"})` (e.g. 05 Mar 2026).
* `formatMaskedCardNumber(n)`: strip whitespace; empty -> `"—"`; else `"XXXX-" + last 4 chars`.
* `getFinancialYearLabel(v)`: Indian FY (Apr 1–Mar 31): month>=4 -> startYear = year else year-1; label `${startYear}-${(startYear+1)%100 padded 2}` e.g. `2026-27`; invalid/missing -> `null`.
* `getHospitalContactPhotoUrl(photo)`: see 3.4.

### 5.4 `utils/documentChecklistRules.js`
`REQUIREMENT = {REQUIRED, OPTIONAL}`. For each requirement row (`documentType|document_type`): `rule = conditionalRule ?? conditional_rule ?? null`; if `rule === "hospitalized_or_surgery"` -> REQUIRED iff `treatmentType ∈ {"hospitalization","surgery"}`; if `rule === "medico_legal"` -> REQUIRED iff `isMedicoLegal` truthy; else REQUIRED iff `isRequired ?? is_required`. `resolveRequiredDocuments(rows, {treatmentType, isMedicoLegal}) -> {type: REQUIRED|OPTIONAL}`; `getRequiredDocumentTypes(...)` -> array of REQUIRED type codes. "Missing documents" everywhere = required types not present among the claim's uploaded documents (`d.documentType|document_type`). (Note: `emergency` and `tests_only` treatment types do NOT trigger the hospitalized rule.) Row labels come from the requirement `label`; UI note text: "Required if hospitalized" / "Required if medico-legal". The list of document types itself is server data (HR-configurable; backend self-seeds defaults).

### 5.5 `hooks/useMediclaimLookups.js` (employee workspace)
Runs ONCE per employee workspace mount (and on `reload()`), `Promise.allSettled` of: `hospitals({})`, `ruleBooks({})`, `myMembers()`, `myCoverage()`, `documentRequirements({})`. Returns `{hospitals, ruleBooks, members, documentRequirements, eligibility, onboarding, loading, error, reload}`. `eligibility = coverage.eligibility ?? null`, `onboarding = coverage.onboarding ?? null`. State tri-values: `undefined` = first load still in flight (workspace shows "Loading…"), `null` = call failed or not applicable (fail-open: not locked, onboarding treated complete). `error` = message of the first rejected among hospitals/ruleBooks/members only (document requirements are deliberately excluded so a missing grant there doesn't blank other pickers). Lists tolerate `res.data.data` or `res.data`. Passed down as the `lookups` prop to tabs/pickers.

### 5.6 Static option tables (do not come from the server)
* **Expense categories** (Section E, keys sent as `category`): `CONSULTATION_FEES`=Consultation Fees, `HOSPITAL_CHARGES`=Hospital Charges, `MEDICINES`=Medicines, `DIAGNOSTIC_TESTS`=Diagnostic Tests, `SURGERY_PROCEDURE`=Surgery / Procedure, `OTHER_EXPENSES`=Other Expenses.
* **Initial symptoms** (Section C): `FEVER` Fever, `PAIN` Pain, `INJURY_ACCIDENT` Injury / Accident, `INFECTION` Infection, `BREATHING_PROBLEM` Breathing Problem, `OTHER` Other (requires free-text detail; sent as element `"OTHER: <detail>"` replacing plain `OTHER`).
* **Treatment types** (Section D; lowercase sent): `opd` OPD, `hospitalization` Hospitalization, `surgery` Surgery, `emergency` Emergency, `tests_only` Tests Only.
* **Declaration** (Section G): `DECLARATION_VERSION = "v1"`; three languages en/hi/gu, each two statements — EN: "I hereby declare that the information furnished above is true and correct to the best of my knowledge." / "I understand that false or misleading information may result in rejection of the claim." HI: "मैं यह घोषणा करता/करती हूँ कि उपरोक्त जानकारी सत्य है।" / "गलत जानकारी देने पर क्लेम अस्वीकृत किया जा सकता है।" GU: "હું ખાતરી આપું છું કે ઉપર આપેલી તમામ માહિતી સાચી છે." / "ખોટી માહિતી આપવાથી ક્લેમ રદ થઈ શકે છે." Order `["en","hi","gu"]`. The single acknowledgement checkbox sends `declaration_accepted=true` and `declaration_version="v1"`.
* **Settlement modes** (SettlementPanel): `bank_transfer` Bank Transfer, `cheque` Cheque, `cash` Cash, `online` Online Payment.
* **Member relationships** (family change form): `SPOUSE, CHILD, PARENT` (SELF is server-created, not selectable). Request types `ADD, UPDATE, REMOVE`; genders `MALE, FEMALE, OTHER`. Advisory rules (client warns, server decides): floater Rs 3,00,000 shared; max 2 children (child eligible only up to age 18); parents above age 55 not covered; max 1 active spouse; max 2 active parents (`PARENT|FATHER|MOTHER`); relationship options exclude SPOUSE when a spouse already exists (excluding the member being updated) and PARENT when 2 exist.
* **Reviewer roles** (dropdown, lowercase slugs matching backend): `coordinator`, `committee`, `hr_verification` (label "HR Eligibility"), `director`, `settlement`. Manager is never assigned here (derived from reporting hierarchy).
* **Report types** (`reportType`/`type`): `enrolled_employees, covered_members, claims, amounts, hospital_usage, rejection_reasons, turnaround, pending_overdue, expiring_policies, expiring_cards, member_eligibility_expiry`. (Backend also accepts `dashboard` and alias names; the UI never sends `dashboard`.)
* **Document requirement form "requirement" options**: `required` (isRequired=true, rule=null), `optional` (false, null), `hospitalized_or_surgery`, `medico_legal` (rule set, isRequired=false).
* **Rule-book languages offered**: English, Hindi, Bengali, Telugu, Marathi, Tamil, Urdu, Gujarati, Kannada, Odia, Malayalam, Punjabi, Assamese, Maithili, Sanskrit, Kashmiri, Nepali, Sindhi, Konkani, Dogri, Manipuri, Bodo, Santali (each with hard-coded native script name); the admin adds one at a time; the language list is stored server-side per company.
* **Status filter dropdown** (My Claims / Pending Reviews): Approved, Submitted, Partially Approved, Rejected, Settlement Pending, Settled, Closed, Draft (values = status codes). FY dropdown: `2025-26`, `2024-25` fallbacks (My Claims/Team) or derived from loaded rows plus current FY plus `2025-26, 2024-25, 2023-24` (Pending Reviews).

### 5.7 `utils/claimValidation.js` (client-side UX rules; backend is authoritative)
New-claim form (all run together on Submit; first error shown in a toast, all inline):
* Patient: `memberId` required ("Select the covered family member (or self)…"); `relationshipType` required (auto-filled from the selected member).
* Medical history: `natureOfIllness` non-empty; `symptomsFirstNoticedOn` required; `initialSymptoms` >=1; if it includes `OTHER` then `initialSymptomOtherDetail` non-empty; `firstConsultationDate` required; `treatingDoctorOrHospital` non-empty; `isMedicoLegal` must be boolean (Yes/No toggle, no default); if true then `reportedToPolice` must be boolean.
* Treatment: if `isNonNetworkHospital`: `nonNetworkHospitalName` and `nonNetworkReason` required; else `hospitalId` required. `treatmentType` required; if type ∈ {hospitalization, surgery, emergency}: `admissionDate` required; `dischargeDate` required unless `isOngoing`; if both present discharge day must not be before admission day. `treatmentDescription` non-empty; `isOngoing` must be boolean.
* Expenses: >=1 line and at least one line with amount > 0.
* Declaration: `declarationAccepted` true and `declarationVersion` non-empty.
* (`validateDocumentsStep` exists but is not used — documents are uploaded after submission.)
Review decision (`validateReviewDecision({stage, decision, remarks, approvedAmount, claimedTotal})`): decision required; decision not in the clean-approve set (case-insensitive `APPROVE, APPROVED, VERIFIED, RECOMMENDED`) requires remarks, trimmed length >= 5 ("Remarks must be at least 5 characters."); for stage `DIRECTOR` or `APPROVAL` with decision != `rejected`: approvedAmount required, numeric >= 0, and <= claimed total (`totalClaimedAmount|total_claimed_amount`). Stage-specific extra checks in panels: Coordinator `verified` requires "documents verified" checkbox; HR `verified` requires both "eligibility verified" and "policy applicability verified" checkboxes.
`expenseCalculations`: `sumExpenseLines` sums positive numeric `amount`s (display-only "Your Total"; server recomputes and is authoritative).

---------------------------------------------------------------------------------------------------

## 6. Screen inventory

Common table behaviours (`ClaimsTable`): client-side per-page sorting on header click (asc -> desc -> off), column visibility toggles, sticky header, `Pagination` with page-size options 10/15/25/50/100 ("Show N entries"), skeleton while loading, red inline error text, empty-state message. Drawers (`Drawer`) and modals (`Modal`) are used for details/forms. "Loading" = request-key mismatch; errors are shown as red text or toast; nothing retries.

### 6.1 EMPLOYEE workspace — `/employee/tds/mediclaim` (`EmployeeMediclaimWorkspace`)
**Shell.** Calls `useMediclaimLookups()` once. Behaviour, in order:
1. While `onboarding === undefined` -> header + "Loading…".
2. If `eligibility && eligibility.eligible === false` -> full-screen **Waiting Period Lock**: "Mediclaim isn't available yet — Coverage begins {waiting_period_months|3} month(s) after your joining date"; big countdown `{days_remaining} day(s)` (or "Available now") and "unlocks on <eligible_from>". No tabs shown.
3. Otherwise sticky tab bar. `TABS`: `coverage`="Mediclaim Info", `family`="Family Members", `rulebook`="Rule Book", `claims`="My Claims", `team`="Team Claims" (permission `mediclaim.team_claim.read`).
4. **Onboarding gate**: `onboardingComplete = onboarding === null || onboarding.completed`. Incomplete => ONLY tabs `["rulebook","family"]` in that order (rule book first). Complete => all permitted tabs except `rulebook` (its content lives in Mediclaim Info's drawer). `?tab=` falls back to the first available tab.

**Tab: Mediclaim Info (`coverage`)** — `MediclaimInfoTab`
* On mount: `myCoverage()`, `myCards()` (count), `myClaims({perPage:100})` (banner count of claims with `status==="SUBMITTED"`). `lookups.ruleBooks` gives published-language count.
* Empty: no `coverage.enrollment` -> "You don't have an active Mediclaim enrollment yet. Contact HR…". Error: red text.
* Shows banner "N claim(s) submitted and waiting on document uploads" + button "Go to My Claims"; hero card: policy name (`enrollment.policyVersion.policy.name`), status badge (green when `active`), validity `effectiveFrom – effectiveTo|"Ongoing"`; floater usage bar (`used`/`limit`/`remaining`; bar colour red >=90%, amber >=70%, else brand; caption "For the financial year <start> – <end> · resets every April 1st"); covered members chips.
* Action tiles: Cards (drawer with `CardViewer`), Rule Book (drawer `RuleBookViewer`), Network Hospitals (drawer `HospitalDirectory`, shows `coverage.hospitals` count), Family Members (jumps to tab), Submit a Claim (jumps to My Claims tab). API on user action: opening Cards drawer triggers `myCards()` + `GET /profile` again.
* Permission: none in UI.

**Tab: Family Members (`family`)** — `FamilyMembersTab` + `FamilyMemberManager`
* Gate: if onboarding incomplete and `!ruleBookAcknowledged` -> "Please read the Rule Book tab first…".
* Data: `lookups.members` (table Name / Relationship / DOB / Status badge) and on mount `memberChangeRequests({})` ("Family Member History": `requestType — name`, date, status badge yellow/green/red).
* Actions: "Add Family Member" and per-row Update / Remove icons open a modal (type switch Add/Update/Remove; Aadhaar-name warning; coverage rules box; advisory eligibility warning text). Submit -> `createMemberChangeRequest(...)`; on success toast "Family member added/updated/removed", reload history and `lookups.reload()`. Validation: name required unless REMOVE; existing member required unless ADD.
* Onboarding: while incomplete a "Continue to Mediclaim" button -> `completeOnboarding()` -> `lookups.reload()` (onboarding.completed flips -> all tabs appear). (Server also requires the rule-book acknowledgement and members per its own rules — see backend report.)
* States: skeleton table, error text ("No covered members on file yet." empty).

**Tab: Rule Book (`rulebook`, onboarding only)** — `RuleBookTab` + `RuleBookViewer`
* Data: `lookups.ruleBooks` — only `status==="published"` books; languages derived from published books' `language`. No auto-selected language: user must pick one (grid of native names), then the ordered `items[].ruleText` list shows, with "Change language" link.
* Action: once a language is opened AND `needsAcknowledgement` (`onboarding && !completed && !ruleBookAcknowledged`) the button "I have read this rule book — Continue" -> `acknowledgeRuleBook()` -> `lookups.reload()`.
* Empty: "No Mediclaim rule book has been published yet. Check back once HR publishes it."

**Tab: My Claims (`claims`)** — `MyClaimsTab`
* Load: `myClaims({status, year, search, page, perPage})` on mount and whenever filter/page/size changes. Filters: search box (claim #, patient), status dropdown, financial-year dropdown, page size 10 default.
* Columns: Claim #, Patient, Claimed (`totalClaimedAmount`), Approved, Status badge (`ClaimStatusBadge`), Last Updated. Column-visibility menu, Refresh, Export CSV (current page rows).
* Banner (from loaded rows): claims with status `SUBMITTED` -> "N claim(s) submitted and waiting on you to upload documents" + "Upload Now" opens the drawer of the first such claim.
* Actions: "New Claim Request" button -> `NewClaimRequestModal` (create). Row click: status `DRAFT` or `RETURNED_FOR_CORRECTION` -> same modal in edit/resubmit mode ("Resubmit Claim Request"); any other status -> `ClaimDetailDrawer` (`allowDocumentUpload`, passes `lookups.documentRequirements`). After upload/modal submit -> `loadClaims()`.
* **New Claim Request modal** (single flat form; submit = create + submit, no draft ever visible). Sections: Patient (`MemberPicker`, select-only from `lookups.members`; shows relationship/DOB/age/gender), Medical History (fields in 5.7), Hospitalisation/Treatment (`HospitalPicker` from `lookups.hospitals` + "Other / Non-network hospital" option; treatment type buttons; admission/discharge `datetime-local` (discharge disabled when ongoing, `min`=admission); ongoing toggle; description), Claim Amount (`ExpenseEditor`: fixed 6 category rows with amount+note, running total for reference only), Declaration (3-language text + checkbox). Footer note "Documents are uploaded separately, after discharge."
  * Submit sequence: validate all -> `updateClaim(savedClaimId, payload)` if a claim id already exists (edit mode or retry after a failed submit) else `createClaim(payload)` -> take `res.data.id` -> `submitClaim(id)` -> toast "Claim request submitted", refresh list, close. Payload (snake_case): `member_id, hospital_id (omitted if non-network), nature_of_illness, first_symptom_date, initial_symptoms[], first_consultation_date, treating_doctor_name, is_medico_legal_case (bool), reported_to_police (only if medico-legal), police_station_details, treatment_type, is_network_hospital (= !nonNetwork), non_network_hospital_name, non_network_reason (only when non-network), admission_at, discharge_at, is_ongoing_treatment (bool), treatment_description, expenses:[{category, claimed_amount(number), description?}] (only lines with a non-empty amount), declaration_accepted (bool), declaration_version`. Undefined values are dropped by JSON.
  * Edit prefill maps from the list row using both casings (`mapClaimToFormData`); the declaration must be re-accepted.
* **Claim detail drawer** (`ClaimDetailDrawer`, opened by non-editable rows and everywhere else): on open `getClaim(id)` + `claimDocuments(id)` (documents failure tolerated). Shows `ClaimSummaryCard` (claim #, patient (relationship), status, claimed, approved, submitted), Expense Breakdown (per line + total, "Approved x" per line, disallowed reason), Documents section. With `allowDocumentUpload && status not terminal`: if the claim `isOngoingTreatment` or has no discharge => a "Finalize Treatment" form (discharge datetime `>=` admission, >=1 expense line with category+amount>0, optional per-line description and date) -> `finalizeTreatment(...)` -> toast "Treatment finalized — the document upload window has started." and reload; else a due-date banner from `documentsDueAt` (green "All required documents are on file." / amber "Upload required documents by <date> (within 1 week of discharge)." / red "Overdue — required documents were due by <date>…") and the `DocumentChecklist`: one row per requirement (sorted by `sortOrder`), badge Required/Optional per 5.4, uploaded files as chips that open `DocumentViewerModal` (presigned view/download), and an Upload/Replace file input -> `uploadClaimDocument(claimId,{file,documentType})` -> toast -> reload claim/docs and list. Empty checklist message differentiates "Loading the document checklist…" from "No document types have been configured yet — ask HR…". Also shows `ClaimTimeline` (`claimTimeline`) and `ClaimDecisionsList` (`claimDecisions`) sections (component details are in the components report).
* Empty/loading/error: "No claims in this tab yet." / "No claims in this tab for FY x." ; skeleton; red error.

**Tab: Team Claims (`team`, needs `mediclaim.team_claim.read`)** — `TeamClaimsTab`
* Load: `teamClaims({page, perPage=15, bucket, status, search})`. Pills: All Team Claims (no bucket) / In Review (`in_review`) / Finalized (`finalized`); search; counters (count from `total`, sum claimed/approved of loaded page). Columns Claim #, Employee, Patient, Claimed, Approved, Status, Last Updated. Row click -> read-only `ClaimDetailDrawer` (no upload, no decision). Export CSV of current page. There is no decision UI here anymore (old "Pending My Approval" tab removed).

### 6.2 ADMIN workspace — `/admin/tds/mediclaim` (`AdminMediclaimWorkspace`)
**Shell.** `TABS`: `dashboard`="Dashboard" (no permission), `employees`="Employees" (none), `claims`="Claims" (any-of the 7 decide/settle codes: `mediclaim.claim.approve, .manager.decide, .coordinator.decide, .committee.decide, .hr_verification.decide, .director.decide, mediclaim.settlement.create`), `settings`="Settings" (none), `reports`="Reports" (`mediclaim.report.read`). Tab key `pending-reviews` is also rendered (legacy alias) but is not in `TABS`, so it is never selectable. The `employees` tab switches the page container to fixed-height/overflow-hidden.
**Mapping of the 11 tab names in the brief to reality**: Dashboard = `DashboardTab`; Claims = `PendingReviewsTab` (the mounted "Claims" tab; contains the Pending Approval / Pending Document / Approved Claim sub-views); Employees = `EmployeesTab`; Reports = `ReportsTab`; Settings = `SettingsTab` (left-nav hosting **RuleBooks, Hospitals, Document Requirements (DocumentSettings), Reviewers**); **PendingReviews** = same component as Claims (no separate tab); **standalone ClaimsTab and AuditHistoryTab exist as files but are imported by nothing** (dead code; Audit history has no UI entry point; Policies has no UI at all).

**Dashboard** — `DashboardTab` (no permission gate in UI; backend `mediclaim.claim.read` for its data)
* Load: `adminClaims({page:1, perPage:200})` on mount + "Refresh" (reloadToken). All figures computed client-side from those <=200 rows; `total` from `payload.total`. If `total > rows.length` shows amber "Showing figures for the N most recently loaded of M total claims — open Reports…".
* KPI tiles: Total Claims (`total`), Pending Review (count of `MANAGER_REVIEW, COORDINATOR_VERIFICATION, COMMITTEE_RECOMMENDATION, HR_ELIGIBILITY_VERIFICATION, DIRECTOR_FINAL_APPROVAL`), Approved & Settled (`APPROVED, PARTIALLY_APPROVED, SETTLEMENT_PENDING, SETTLED, CLOSED`), Rejected / Withdrawn (`REJECTED, WITHDRAWN, CANCELLED`), Claimed Amount (sum `totalClaimedAmount`), Approved Amount (sum `approvedAmount|totalApprovedAmount`). Note SUBMITTED is in the "In Review" donut group but NOT in the Pending Review tile.
* Charts (recharts): horizontal bar per status; donut "Status Mix" groups `In Review [SUBMITTED + 5 review statuses]`, `Approved & Settled`, `Needs Correction [RETURNED_FOR_CORRECTION]`, `Rejected / Withdrawn`, `Draft`; area chart "Filing Trend" claims per calendar month for the last 6 months by `createdAt`.
* Empty: "No Mediclaim claims have been filed yet…" with "Open Reports" link; loading skeletons; red error.

**Employees** — `EmployeesTab` (backend perms `mediclaim.enrollment.read/create/update`)
* Load: `adminEmployees({page, perPage, status, search(300 ms debounce), department})`; tabs All / Not Eligible / Pending / Completed with counts from `payload.statusCounts`; department dropdown from `payload.departments`; Reset button when any filter active. Columns: Employee (name, empCode · department), Status badge (`mediclaimStatus`: not_eligible gray / pending yellow / completed green), Eligibility ("Since <date>" or "N day(s) left"), Members (`activeMembersCount`), Policy name.
* Row click -> Drawer "Mediclaim profile": `adminEmployeeDetail(id)`; shows employee info, eligibility notice, Coverage (policy, status, enrolled date; "Edit Enrollment" link if `can("mediclaim.enrollment.update")`), covered members table, Mediclaim Cards (`MediclaimIdCard` per card, self card gets photo/department/designation) and Change Request History.
* Edit Enrollment drawer: loads `policies({})` to build "Policy — vN" options; fields Policy Version (required), Status (ACTIVE/INACTIVE), Effective From/To -> `updateEnrollment(id, {policyVersionId, status, effectiveFrom, effectiveTo})` -> toast, reload list and reopen detail.
* Bulk button (`can("mediclaim.enrollment.create")`): "Issue Mediclaim to All Eligible Employees" -> `bulkIssueEmployeeCards()` -> toast "Processed N: X issued now, Y already had a card[, Z failed (see Audit History)]" -> reload.
* Empty: "No employees match this filter."

**Claims (Pending Reviews)** — `PendingReviewsTab` (tab needs any decide/settle permission)
* Toolbar: search (claim #, employee, patient), status dropdown, FY dropdown, three pill sub-views with counts: **Pending Approval**, **Pending Document**, **Approved Claim**, Refresh, Export CSV, page-size.
* Data: ONE `reviewsPending({perPage:100})` on mount/refresh, split client-side by `getClaimWorkflowBucket(row.status)` into Pending Approval and Pending Document, filtered client-side (search/status/FY via `getFinancialYearLabel(submittedAt||createdAt…)`), paginated client-side. "Approved Claim" sub-view (opened lazily) calls `adminClaims({page, perPage, status: <chosen status or REJECTED,SETTLED,CLOSED,WITHDRAWN,CANCELLED>, search, financial_year, year})` server-paginated. (Row count for Pending is capped by the 100 fetched.)
* Columns — pending views: Claim #, Employee, Patient, Claimed, Awaiting (stage label, "Employee's Documents" for APPROVED/PARTIALLY_APPROVED, else status), Status, Submitted, optional delete; finalized: Claim #, Employee, Patient, Claimed, Approved, Status, Last Updated, optional delete.
* Row click: resolve stage (`currentStage` or status->stage). If a panel exists for that stage AND the user holds its decide permission -> Drawer titled with the stage label containing the panel; else -> read-only `ClaimDetailDrawer`. Panels (all wrap `ClaimSummaryCard` + `ClaimFullDetail` [=getClaim + claimDocuments + decisions + timeline]): see 6.2.4. On success `onDecided` -> close drawer and refetch pending.
* Delete icon (only with `mediclaim.claim.delete`): `window.confirm("Permanently delete <claim #>? This cannot be undone.")` -> `deleteClaim(id)` -> toast, refetch.
* Empty messages per sub-view ("No claims are currently pending approval." / "…pending documents." / "No approved claims yet.") and "No claims match this filter."

**6.2.4 Review panels — what is sent to `POST /reviews/{claim}/decision`**
| Panel (component) | UI | Payload |
|---|---|---|
| Approval (`SingleApprovalPanel`, current) | decision buttons Approved / Partially Approved / Rejected; Approved Amount input (hidden for Rejected); remarks | `{decision, remarks}` plus, when decision != `rejected`, `approvedAmount = approved_amount = Number(input)` (falls back to `totalClaimedAmount` if blank/NaN) |
| Manager (`ManagerReviewPanel`, legacy) | Approve / Reject / Return | first `POST /claims/{id}/confidentiality-ack`, then `{decision, remarks}` |
| Coordinator | Verified / Return; checkbox "claim and documents verified" | `{decision, remarks, documentsVerified}` |
| Committee | Recommended / Not Recommended | `{decision, remarks}` |
| HR Eligibility | Verified / Return; 2 checkboxes | `{decision, remarks, eligibilityVerified, policyApplicabilityVerified}` |
| Director | Approved / Partially Approved / Rejected + amount | same as Approval |
| Settlement (`SettlementPanel`) | shows read-only `DocumentChecklist` of uploaded docs; if any required doc missing shows amber "Waiting on the employee to upload N required document(s)" and NO form; else form Settlement Amount (default = `totalApprovedAmount`, >0), Mode (settlement modes), Reference | `{decision:"final_approve", amount:Number, mode, reference?}`; on load it calls `claimDocuments(id)` + `documentRequirements({})` |
Remarks are required for every decision other than the stage's clean-approve one (min 5 chars). Submit is disabled until valid. Errors show inline under the form (`err.message`).

**Settings** — `SettingsTab` (left nav; not permission-gated except where stated)
* Sections: Rule Books ("Languages & policy rules"), Hospitals ("Network directory & contacts"), Document Requirements (needs `mediclaim.document_requirement.read`), Reviewers ("Who decides claims at each stage", needs `mediclaim.reviewer_assignment.read`). First permitted section is default; state is local (not in URL).

*Rule Books* — `RuleBooksTab`: on mount `ruleBookLanguages({})` and `ruleBooks({})`. Left: language list (radio select, status badge draft/published/archived per language), "Add" drawer listing the 23 predefined languages not yet added -> `createRuleBookLanguage({companyCode?, name, nativeName})`; delete language (confirm) -> `deleteRuleBookLanguage(id)` (+ reload both). Right (per selected language): if no book -> "create rule book" -> `createRuleBook({companyCode?, languageId})`; items list with add (`addRuleBookItem`), inline edit (`updateRuleBookItem`), delete (confirm, `deleteRuleBookItem`), up/down reorder (`reorderRuleBookItems(bookId, orderedIds)`), and Publish button (`publishRuleBook`) shown only when status is `draft` and user has `.publish`. Create/update/delete controls depend on `.create/.update/.delete/.publish` flags. `companyCode` comes from `CompanyContext.companyScope.companyId`.

*Hospitals* — `HospitalsTab`: on mount `hospitals({})`. "New Hospital" (`.create`) -> drawer form: name (required), address, city, state, pincode, latitude, longitude, Google Maps URL, specialties (comma separated -> array), network hospital, cashless, status ACTIVE/INACTIVE -> `createHospital/updateHospital(companyCode from scope)`. Management table (visible with `.update` or `.delete`): Name, City, Active/Removed badge, "Show removed hospitals" toggle, Edit (`.update`; "Edit / Restore" for inactive) and Delete (`.delete`, confirm -> `deleteHospital`, server status-flips to inactive). Edit drawer also manages contacts: form (name*, phone*, designation, email, availability, photo file) -> `createHospitalContact` / `updateHospitalContact` (multipart) / `deleteHospitalContact`; each returns `data.contacts[]` used to refresh the drawer list. Below: the employee-facing `HospitalDirectory` preview (search name/city/state/specialty; "Network only"/"Cashless only" toggles; excludes non-active; per card Google-Maps iframe from lat/lng or address, Directions link = `googleMapsUrl` else `google.com/maps/dir/?api=1&destination=`; copy phone/address).

*Document Requirements* — `DocumentSettingsTab`: `documentRequirements({includeInactive})`; table sorted by `sortOrder` with requirement label (Required / Optional / Conditional — hospitalized/surgery / Conditional — medico-legal), max size in MB (stored KB), status; "Show retired" toggle; Add/Edit drawer (documentType code, label, requirement select, max file size MB default 5, sort order) via `create/updateDocumentRequirement`; Retire (`deleteDocumentRequirement`, soft) and Restore (`updateDocumentRequirement(id,{isActive:true})`) buttons; manage controls need `.create` or `.update`.

*Reviewers* — `ReviewersTab`: `reviewerAssignments({})`; "New Assignment" (`.assign`) drawer: role select (5 roles), reviewer employee select (loaded lazily by `salaryApi.getAllEmployees` active, 200), backup flag, active from/to, `companyCode` -> `createReviewerAssignment/updateReviewerAssignment`; delete (confirm) -> `deleteReviewerAssignment` (see Open questions: no backend delete route). Empty text warns that one primary reviewer per role is needed before the module becomes available.

**Reports** — `ReportsTab` (`mediclaim.report.read`)
* Controls: report type select (11 types), From/To dates, "Include sensitive detail" checkbox (only if `.reveal`), Run Report, Export CSV (only if `.export`). First render auto-runs the default report (`enrolled_employees`) via `reports({reportType, type, from, to, reveal})`; re-runs on Run.
* Rendering: if response has `rows[]` (or array) -> table using `columns` map (keys -> header labels) with client-side pagination (10/15/25/50/100, default 15), "Total records" from `meta.count`; cell formatting: keys containing amount/requested/approved/disallowed/settled -> INR, booleans Yes/No, `status` -> coloured badge, date-like -> `formatClaimDate`; if response is a plain object -> card grid of key/values with special formatters for `claimsByStatus, pendingByStage, amounts, hospitalUsage, enrolledEmployees, coveredMembers, rejectionDisallowanceReasonsTop, turnaround{decidedClaimCount, avgDays}, pendingOverdue{pendingCount, overdueCount}`.
* Export: see 3.6 and Open questions.

*Audit history* — `AuditHistoryTab` (unmounted): `audit({page, perPage:20, search, from, to})`; columns Actor, Action, Subject, Details, When. Documented for completeness; not reachable from the UI today (`mediclaim.audit.read`).

### 6.3 PUBLIC card verify — `/mediclaim/verify/:token` (`MediclaimCardVerify`)
* Mount: `verifyCard(token)` (no Authorization header, throttled 20/min server-side). While in flight -> skeleton card. `payload = res.data ?? res`; `payload.valid` truthy -> valid view; any other outcome (HTTP error, `valid` false, network) -> ONE generic invalid view ("This card could not be verified — This QR code does not correspond to an active Mediclaim card…"; never shows error detail, to avoid revealing revoked-vs-nonexistent).
* Valid view: header "NISS HRMS · Mediclaim Card Verification"; green shield + "Verified Mediclaim Card"; `member_name`; `company`; Member No. (`member_number_masked`), Policy No. (`policy_number_masked`), Insurer (`insurer_name`); "Valid <valid_from> – <valid_to>"; "Approved Hospitals" list (`name · city`); "Emergency Contact" (`designation`, `phone` as `tel:` link) only if either present. No login/AppLayout; designed for phone.
* The QR on cards encodes `${window.location.origin}/mediclaim/verify/${card.verifyToken}`.

---------------------------------------------------------------------------------------------------

## 7. User journeys (screen -> API -> resulting state)

**J1 Onboarding (new employee).** Open `/employee/tds/mediclaim` -> `GET /me/coverage` (+ hospitals, rule-books, members, document-requirements) -> `onboarding.completed=false` => only tabs Rule Book, Family Members. Rule Book tab: pick a language (a published rule book is required) -> button appears -> `POST /me/rule-book-acknowledge` -> `lookups.reload()` (coverage re-read: `onboarding.ruleBookAcknowledged=true`). Family Members tab now unlocked: add members (J2) or none -> "Continue to Mediclaim" -> `POST /me/onboarding-complete` -> reload -> `onboarding.completed=true` -> full tab set (Mediclaim Info, Family Members, My Claims, [Team Claims]). Before all that, if `eligibility.eligible===false` (waiting period) the lock screen replaces everything. Failure of `/me/coverage` = fail-open (tabs shown).

**J2 Add / change family member.** Family Members -> "Add Family Member" (or row Update/Remove) -> modal (client advisory warnings) -> `POST /me/member-change-requests {requestType, memberId?, relationshipType, reason?, proposedValues}` -> success toast (applied immediately; server-side eligibility validation may reject with an error toast: max 2 children, ages, spouse overlap) -> `GET /me/member-change-requests` and `lookups.reload()` (`GET /me/coverage`, `/me/members`, …) -> table and history refreshed; card for a new member is server-generated (Cards tile).

**J3 Raise intimation ("Notify Office").** NOT AVAILABLE in the current UI (tab removed); client functions `myIntimations/createIntimation/adminIntimations/closeIntimation` and backend routes exist but nothing calls them.

**J4 Create claim -> submit -> upload documents.** My Claims -> "New Claim Request" -> fill flat form -> Submit: `POST /me/claims` -> `POST /claims/{id}/submit` (the user never sees DRAFT unless submit fails; on retry the same claim id is `PUT` then submitted) -> status becomes `SUBMITTED` (awaiting approval). List reloads (`GET /me/claims`). If treatment is ongoing, open the claim drawer -> "Finalize Treatment" (`POST /claims/{id}/finalize-treatment`) once discharged, which starts the 7-day document window (`documentsDueAt`). Documents: drawer -> `DocumentChecklist` -> per type file input -> `POST /claims/{id}/documents` (multipart) -> list refresh. Missing documents banner appears on Mediclaim Info and My Claims for claims with status `SUBMITTED`.

**J5 Return & resubmit.** A reviewer returns a claim (server sets `RETURNED_FOR_CORRECTION`); in My Claims the row opens the modal ("Resubmit Claim Request") pre-filled from the list row; user edits, re-ticks the declaration -> `PUT /claims/{id}` -> `POST /claims/{id}/submit` -> restarts approval. (Return is currently only reachable in the legacy stage panels or via API `POST /claims/{id}/return` — the client fn `returnClaim` has no caller; the approval panel offers Approved/Partially/Rejected only.)

**J6 Withdraw.** No UI. Status `WITHDRAWN` and `withdrawClaim` client fn exist; nothing invokes it (see Open questions).

**J7 Manager review.** Simplified workflow removed the manager step. Managers with `mediclaim.team_claim.read` get a read-only Team Claims tab (`GET /team/claims`, drawer via `GET /claims/{id}` etc.). The legacy manager panel (confidentiality-ack then decision) is still coded in the admin panel registry but only reachable for a claim whose status is `MANAGER_REVIEW` when the row's `currentStage` says `MANAGER` (which `getStageByPendingStatus` no longer produces).

**J8 Admin review (current simplified workflow).** Admin -> Claims tab: `GET /reviews/pending?perPage=100` -> Pending Approval list (SUBMITTED / legacy in-flight) -> click row -> drawer with `GET /claims/{id}` + documents + decisions + timeline -> choose Approved/Partially Approved/Rejected, enter approved amount (<= claimed) and remarks (required unless Approved) -> `POST /reviews/{id}/decision {decision, remarks, approvedAmount, approved_amount}` -> drawer closes, list refetches. Result (server-side, see backend report): `APPROVED` or `PARTIALLY_APPROVED` -> claim moves to the "Pending Document" list (awaiting employee documents; nothing to decide, row opens read-only drawer) and settles automatically when required documents complete; `REJECTED` -> finalized. Legacy chain (if a claim sits in COORDINATOR_VERIFICATION, COMMITTEE_RECOMMENDATION, HR_ELIGIBILITY_VERIFICATION or DIRECTOR_FINAL_APPROVAL) uses the same endpoint with that stage's decision vocabulary and permission.

**J9 Settlement.** Claims tab -> Pending Document -> a legacy `SETTLEMENT_PENDING` claim -> Settlement panel (needs `mediclaim.settlement.create`): documents shown read-only; blocked with amber message until all required docs exist; else amount/mode/reference -> `POST /reviews/{id}/decision {decision:"final_approve", amount, mode, reference}` -> per code comments the server records the settlement and closes the claim (`SETTLED`/`CLOSED`) -> claim appears under "Approved Claim". Newly approved claims (APPROVED/PARTIALLY_APPROVED) are settled automatically by the server when documents are complete (no UI step).

**J10 Cards: view and verify.** Mediclaim Info -> Cards tile -> drawer -> `GET /me/cards` (+ `GET /profile`) -> `MediclaimIdCard` per card (QR of `origin/mediclaim/verify/<verifyToken>`, "View Card" enlarged PNG via html2canvas, Download PNG). Scanning the QR opens the public page -> `GET /api/v1/mediclaim/cards/verify/{token}` -> valid/invalid screen (6.3). Admin can view any employee's cards in the Employees detail drawer; "Issue Mediclaim to All Eligible Employees" bulk-provisions coverage and cards.

**J11 Admin configuration flow (needed before the module is "available").** Settings -> Rule Books: add language(s) -> create rule book -> add rules -> Publish; Settings -> Reviewers: create primary assignments for coordinator, committee, hr_verification, director (settlement optional); Document Requirements: adjust list; Hospitals: add hospitals + contacts. Once a published rule book and the four primary reviewers exist the backend `/api/modules` flips `modules.mediclaim=true` and the menu entries appear.

---------------------------------------------------------------------------------------------------

## 8. Open questions / discrepancies to verify (backend or product owner)

1. **Report export is probably broken**: `ReportsTab.exportReport` calls `GET /reports` with `export=1&format=csv` and expects JSON `data.url|downloadUrl`; the backend has a separate `GET /reports/export` (requires read+export permissions, streams CSV) and `reports` index ignores `export/format`. Also the UI sends `reveal=1` whereas the backend reads `includeSensitive` (only honoured for `reportType=claims`, else ignored). So "Export CSV" will toast "The export request did not return a downloadable file." and "Include sensitive detail" has no effect. A new client should call `/reports/export?reportType=…&includeSensitive=1` and handle a blob/stream (not implemented by any current client code).
2. **`deleteReviewerAssignment` has no backend route** (routes/mediclaim.php has GET/POST/PUT for `reviewer-assignments` only) — the Reviewers "delete" would 404/405. Confirm; alternatively the intended way to disable may be `PUT` with status/`activeTo`.
3. **Employee route guard**: because `ProtectedRoute` returns early for `/employee/*`, `requiredRole="employee"` is not enforced for those paths (an admin session can open `/employee/tds/mediclaim`). Unclear if intended. Backend permission still applies.
4. **Employee endpoints that need admin-style permissions**: `useMediclaimLookups` calls `GET /hospitals` (`mediclaim.hospital.read`) and `GET /rule-books` (`mediclaim.rule_book.read`) for every employee; the routes' middleware requires those codes (only `document-requirements` has a `self.*` OR-fallback). If the plain Employee role lacks them, hospitals/rule books arrive empty and `lookups.error` blanks the pickers/rule book. Verify which roles hold these codes (backend seeding report).
5. **Edit/resubmit prefill from the list row**: `MyClaimsTab` passes the `/me/claims` list row (not `GET /claims/{id}`) into `mapClaimToFormData`; if the list row lacks `expenses`, `initialSymptoms`, hospital, dates etc. the resubmission form would be blank/partial and `PUT` could overwrite server data. Confirm what fields `MyClaimController::index` returns.
6. **DRAFT rows** in My Claims open the edit modal too (`EDITABLE_STATUSES = DRAFT, RETURNED_FOR_CORRECTION`) although the UI never intentionally creates drafts (only left over if `submit` fails after create/update).
7. **Withdraw, Return-by-employee, Intimations, Discharge-only, Policies admin, Settlements list, HR-side member-change-request decision, Audit history UI**: backend routes/client fns exist but no screen uses them (see 3.4). Product decision needed for the new app.
8. **Settlement decision literal**: `decision:"final_approve"` is sent by `SettlementPanel` but is not in `REVIEW_DECISION`; confirm `ReviewQueueController::decide` accepts it for `SETTLEMENT_PENDING` (comments say so).
9. **Response casing** (3.5) is inconsistent; confirm authoritative field names per endpoint from the backend resource/serializer reports before generating a typed client.
10. **What `RequireModuleSchema` returns** when mediclaim tables are missing (header comment implies HTTP 503 shaped like `AUTHORIZATION_SCHEMA_NOT_READY`); the mediclaim client has no special handling for it.
11. **`teamClaims` extra `status` param and My Claims `year` filter**: the accepted values/semantics (FY label `2025-26` vs calendar year; `bucket` values) are server-defined; the UI only sends what is listed above. `PendingReviewsTab` also sends both `financial_year` and `year` for the same FY label.
12. **`myClaims` FY dropdown source**: `lookups.policyTypes` is referenced but is never populated by `useMediclaimLookups`, so the FY dropdown always uses the hard-coded `2025-26, 2024-25`.
13. **Idempotency-Key** header is supported by `uploadClaimDocument` but never sent; backend enforcement unknown.
14. **Company scoping**: mediclaim requests carry no `company_code` query param; scope is derived server-side from the token (only some POST bodies include `companyCode` from `CompanyContext`). Multi-company admin behaviour (`companyScope.companyId === "all-companies"`?) is untested here.
15. **`GET` caching (30 s)** can make "Refresh" a no-op within the window when nothing was mutated; a new client should decide its own cache policy.

---

<!-- ======================= F2-frontend-components ======================= -->

# F2 — Frontend Components & Business Rules in the UI

Source: `salary-slip-front/salary-slip-front/src/features/mediclaim/components/*` (nested, git-tracked copy), plus the helpers they import (`models/*`, `utils/*`, `services/mediclaimApi.js`, `hooks/useMediclaimLookups.js`). Everything below was read from source; the four `*.test.jsx` groups were skimmed for pinned rules. Helper components that are not in the requested slice but are embedded by it (ClaimSummaryCard, MemberPicker, ExpenseEditor, DeclarationPanel) are documented briefly because the NewClaimRequestModal and review panels cannot be reproduced without them. `ClaimsTable.jsx` was NOT read (not in slice).

## 0. Conventions common to all components

- **Auth/API calling convention.** Every component reads `const { user } = useAuth()` and passes `user.accessToken`, `user.tokenType` (default "Bearer") as the LAST two args of each `mediclaimApi.*` call. Header sent: `Authorization: <Type> <token>`. Base path `/v1/mediclaim`.
- **Response unwrapping.** `apiRequest` result is `res`; payload is `res.data`. Lists are read defensively as `Array.isArray(res.data.data) ? res.data.data : Array.isArray(res.data) ? res.data : []`. Single resources are `res.data`. So the backend must wrap in `{data: ...}` (or `{data:{data:[...]}}` for paginated lists).
- **camelCase / snake_case dual reading.** Nearly every field is read as `camel ?? snake` (e.g. `claim.claimNumber || claim.claim_number`). The new app should pick one and the backend should guarantee it (see Backend contract gaps).
- **Async-effect pattern.** Each data-fetching component computes a `requestKey` from ids + token, stores `{key, data, error}` in state, and treats `result.key !== requestKey` as "loading"; a `cancelled` flag is set on cleanup to drop stale responses.
- **Toasts** via `react-hot-toast` (`toast.success/error`) for modal/list actions; inline red `<p>` errors for panels.
- **Dark-mode** Tailwind classes everywhere (cosmetic; not documented per component).
- **Money format** `formatCurrencyINR`: `₹` + `toLocaleString("en-IN", 2 decimals)`; non-finite -> "—". **Date format** `formatClaimDate`: `toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})`, invalid/empty -> "—".
- **Indian financial year** helper `getFinancialYearLabel(date)`: April-March, label "2026-27" (used by list tabs, not by the components in this slice).

### 0.1 Claim status vocabulary (`models/claimStatus.js`) — 16 values, plain strings

`DRAFT, SUBMITTED, MANAGER_REVIEW, COORDINATOR_VERIFICATION, COMMITTEE_RECOMMENDATION, HR_ELIGIBILITY_VERIFICATION, DIRECTOR_FINAL_APPROVAL, APPROVED, PARTIALLY_APPROVED, REJECTED, SETTLEMENT_PENDING, SETTLED, CLOSED, RETURNED_FOR_CORRECTION, WITHDRAWN, CANCELLED`.

Badge label / tone (label = title-cased name except where noted):

| status | label | tone | terminal (`isTerminal`) |
|---|---|---|---|
| DRAFT | Draft | grey | no |
| SUBMITTED | Submitted | sky | no |
| MANAGER_REVIEW / COORDINATOR_VERIFICATION / COMMITTEE_RECOMMENDATION / HR_ELIGIBILITY_VERIFICATION / DIRECTOR_FINAL_APPROVAL | Manager Review / Coordinator Verification / Committee Recommendation / HR Eligibility Verification / Director Final Approval | amber (pending review) | no |
| APPROVED | Approved | green | no |
| PARTIALLY_APPROVED | Partially Approved | teal | no |
| REJECTED | Rejected | red | **yes** |
| SETTLEMENT_PENDING | Settlement Pending | indigo | no |
| SETTLED | Settled | emerald | no |
| CLOSED | Closed | slate | **yes** |
| RETURNED_FOR_CORRECTION | Returned for Correction | orange | no |
| WITHDRAWN | Withdrawn | grey | **yes** |
| CANCELLED | Cancelled | grey | **yes** |

Each status also has a tooltip `description` (e.g. RETURNED_FOR_CORRECTION: "Sent back to the employee for correction. Resubmitting restarts at Manager Review."; WITHDRAWN: "Withdrawn by the employee before manager approval."; CANCELLED: "Cancelled by an administrator.").

### 0.2 Workflow bucket rules (`models/reviewStages.js`)

- `PENDING_DOCUMENT_STATUSES` = APPROVED, PARTIALLY_APPROVED, SETTLEMENT_PENDING.
- `FINALIZED_CLAIM_STATUSES` = REJECTED, SETTLED, CLOSED, WITHDRAWN, CANCELLED.
- `PENDING_APPROVAL_STATUSES` = everything else (DRAFT, SUBMITTED, the five review statuses, RETURNED_FOR_CORRECTION).
- Stage resolution `getStageByPendingStatus(status)`: SUBMITTED and MANAGER_REVIEW -> stage `APPROVAL` (the simplified single-approval workflow); COORDINATOR_VERIFICATION -> COORDINATOR; COMMITTEE_RECOMMENDATION -> COMMITTEE; HR_ELIGIBILITY_VERIFICATION -> HR_ELIGIBILITY; DIRECTOR_FINAL_APPROVAL -> DIRECTOR; SETTLEMENT_PENDING -> SETTLEMENT. Admin tab first prefers `row.currentStage || row.current_stage` if it is a key of REVIEW_STAGE.
- `REVIEW_STAGE_META[stage].decidePermission`: APPROVAL `mediclaim.claim.approve`; MANAGER `mediclaim.claim.manager.decide`; COORDINATOR `mediclaim.claim.coordinator.decide`; COMMITTEE `mediclaim.claim.committee.decide`; HR_ELIGIBILITY `mediclaim.claim.hr_verification.decide`; DIRECTOR `mediclaim.claim.director.decide`; SETTLEMENT `mediclaim.settlement.create`. The panel components themselves do NOT check permission; the host tab gates rendering (PendingReviewsTab `access[STAGE_ACCESS_KEY[stage]]`).
- Section labels: Coordinator = "Section H", Committee = "Section I", HR Eligibility = "Section J", Director = "Section K" (paper claim form sections).

### 0.3 Review decision vocabulary (lowercase, sent verbatim in `decision`)

`approve, reject, return, verified, recommended, not_recommended, approved, partially_approved, rejected`, plus the settlement-only literal `final_approve`. The source comment states the backend does exact lowercase `in_array` matching per stage (historic bug when uppercase was sent).

| stage | decision buttons (value = label) | clean-approve decision (remarks optional) |
|---|---|---|
| APPROVAL | approved="Approved", partially_approved="Partially Approved", rejected="Rejected" | approved |
| MANAGER (legacy) | approve="Approve", reject="Reject", return="Return for Correction" | approve |
| COORDINATOR | verified="Verified", return="Return for Correction" | verified |
| COMMITTEE | recommended="Recommended", not_recommended="Not Recommended" | recommended |
| HR_ELIGIBILITY | verified="Verified", return="Return for Correction" | verified |
| DIRECTOR | approved="Approved", partially_approved="Partially Approved", rejected="Rejected" | approved |

### 0.4 Shared validator `validateReviewDecision({stage, decision, remarks, approvedAmount, claimedTotal})`

1. `decision` empty -> `{decision: "Select a decision."}` (returns immediately).
2. Decision uppercased; "clean approve" set = `APPROVE, APPROVED, VERIFIED, RECOMMENDED`. If NOT clean: remarks (trimmed) required -> "Remarks are required for this decision."; min length **5** -> "Remarks must be at least 5 characters."
3. If stage is `DIRECTOR` or `APPROVAL` and decision != `REJECTED`: `approvedAmount` required ("Approved amount is required unless the claim is rejected."); must be a number >= 0 (message says "positive number", but 0 passes); must be <= `claimedTotal` when `claimedTotal` is defined ("Approved amount cannot exceed the total claimed amount."). Note Partially Approved is NOT required to be strictly less than claimed; nothing in UI enforces < claimed.

---

## 1. NewClaimRequestModal (+ embedded MemberPicker, HospitalPicker, ExpenseEditor, DeclarationPanel)

**Purpose.** Single popup "New Claim Request" (or "Resubmit Claim Request" when `editClaim` is set). Collects Sections A/B (patient), C (medical history), D (treatment), E (expenses), G (declaration) in one pass; one Submit creates the claim AND submits it (no visible draft). Documents (Section F) are NOT here; uploaded later from ClaimDetailDrawer within a 7-day window (`documents_due_at`, set server-side on submit). Footer hint: "Documents are uploaded separately, after discharge."

**Props.**
| prop | type | req | meaning |
|---|---|---|---|
| `onClose` | fn | yes | close popup (Cancel, or after success). Overlay/X close is blocked while `submitting`. |
| `lookups` | object from `useMediclaimLookups()` | yes | uses `lookups.members[]`, `lookups.hospitals[]`, `lookups.loading`, `lookups.error` |
| `onSubmitted` | fn | no | called (no args) after successful create/update + submit; host reloads its claim list |
| `editClaim` | claim object | no | a RETURNED_FOR_CORRECTION claim; prefills the form and resubmits the SAME claim (PUT then submit) |

Host contract: mount only while open, with `key = editClaim.id ?? editClaim.claimId ?? "new"` so form state resets (MyClaimsTab does this).

**Internal state.** `formData` (flat, see field table), `errors` (field-keyed map), `submitting`, `savedClaimId` (init `editClaim.id ?? editClaim.claimId ?? null`; kept so a retry after a failed `submitClaim` re-uses the saved claim id via update+submit instead of creating an orphan).

**API calls (on Submit only).**
1. Full client validation (all five section validators merged). If invalid: sets `errors`, toasts the FIRST error message (or "Please fix the highlighted fields before submitting."), aborts.
2. `savedClaimId ? updateClaim(savedClaimId, payload) : createClaim(payload)` -> `PUT /v1/mediclaim/claims/{id}` or `POST /v1/mediclaim/me/claims`. Saved id = `res.data.id ?? res.data.claimId ?? savedClaimId`; if none -> throws "Could not save the claim."
3. `submitClaim(savedId)` -> `POST /v1/mediclaim/claims/{id}/submit` (no body).
4. Success: toast "Claim request submitted", `onSubmitted()`, `onClose()`. Failure: toast `err.message || "Failed to submit the claim request."`; modal stays open.

Lookups used are loaded by the workspace via `myMembers` (`GET /me/members`) and `hospitals` (`GET /hospitals`, no filter args), `ruleBooks`, `myCoverage`, `documentRequirements` (all Promise.allSettled; failures of members/hospitals/ruleBooks surface as a shared `lookups.error`).

**Field-by-field table.** (client validation = `utils/claimValidation.js`; payload keys are snake_case, sent as JSON to create AND update; `undefined` values are omitted by JSON.stringify.)

| Section | field (form key) | UI type | required | client rule / default | payload key |
|---|---|---|---|---|---|
| Patient | `memberId` | `<select>` (MemberPicker) of `lookups.members`, option text `fullName\|full_name\|name (relationshipType)`; select-only, no free text | yes | "Select the covered family member (or self) this claim is for." Default "". Stored as String(member.id). | `member_id` (`memberId \|\| undefined`) |
| Patient | `relationshipType` | derived from selected member (`relationshipType \|\| relationship_type`), not user-editable | yes | "Relationship with employee is required." (fires if the chosen member lacks a relationship) | NOT sent as its own key (backend derives snapshot from member_id) |
| Patient (read-only) | relationship, DOB, computed age ("N yrs"), gender | display | - | age computed client-side from `dateOfBirth\|date_of_birth` | - |
| Medical | `natureOfIllness` | textarea 2 rows | yes | non-blank after trim; "Nature of illness / disease diagnosed is required." | `nature_of_illness` |
| Medical | `symptomsFirstNoticedOn` | `date` | yes | non-empty; "Date symptoms were first noticed is required." No max/min/future/ordering rule. | `first_symptom_date` |
| Medical | `firstConsultationDate` | `date` | yes | non-empty. No ordering vs symptom date enforced. | `first_consultation_date` |
| Medical | `initialSymptoms` | checkbox group: FEVER, PAIN, INJURY_ACCIDENT, INFECTION, BREATHING_PROBLEM, OTHER (labels Fever, Pain, Injury / Accident, Infection, Breathing Problem, Other) | yes (>=1) | "Select at least one initial symptom." | `initial_symptoms` (array of the keys; see OTHER rule) |
| Medical | `initialSymptomOtherDetail` | text, only visible when OTHER checked | yes if OTHER checked | non-blank; "Describe the other symptom." Payload transform: if detail non-blank, remove `"OTHER"` from array and append the single string `"OTHER: <detail>"` | inside `initial_symptoms` |
| Medical | `treatingDoctorOrHospital` | text | yes | non-blank; "Name of treating doctor / hospital / clinic is required." | `treating_doctor_name` |
| Medical | `isMedicoLegal` | Yes/No toggle (default undefined = unset) | yes | must be boolean; "Indicate whether the case is medico-legal." Toggling to No clears `reportedToPolice`. | `is_medico_legal_case` (`Boolean(...)`, always sent) |
| Medical | `reportedToPolice` | Yes/No toggle, visible only if medico-legal = Yes | yes when medico-legal | must be boolean; "Indicate whether the case was reported to the police." | `reported_to_police` (only when medico-legal else omitted) |
| Medical | `policeStationDetails` | textarea, visible only if reportedToPolice = Yes | no | placeholder "Police station details (optional)" | `police_station_details` (sent whenever non-empty in state) |
| Treatment | hospital selection (`hospitalId`, `isNonNetworkHospital`) | `<select>` of hospitals `name[, city]` + final option "Other / Non-network hospital" (value `__OTHER__`) | yes | if non-network: see next two rows; else `hospitalId` required: "Select the hospital where treatment was received." Selecting a listed hospital clears the non-network name/reason. | `hospital_id` (omitted when non-network); `is_network_hospital` = `!isNonNetworkHospital` |
| Treatment | `nonNetworkHospitalName` | text, only when Other selected (amber box) | yes if non-network | "Hospital name is required." | `non_network_hospital_name` (only when non-network) |
| Treatment | `nonNetworkReason` | textarea 2 rows, only when non-network | yes if non-network | "Explain why a non-network hospital was used." | `non_network_reason` (only when non-network) |
| Treatment | `treatmentType` | 5 pill buttons: `opd` OPD, `hospitalization` Hospitalization, `surgery` Surgery, `emergency` Emergency, `tests_only` Tests Only | yes | "Type of treatment is required." Values are lowercase and must match backend `MediclaimClaim::TREATMENT_TYPES` | `treatment_type` |
| Treatment | `admissionDate` | `datetime-local` | conditional | REQUIRED only when treatmentType in {hospitalization, surgery, emergency}: "Date of admission is required for this treatment type." Optional (and unvalidated) for opd / tests_only; field always shown. | `admission_at` |
| Treatment | `dischargeDate` | `datetime-local`; `min` = admissionDate; disabled and cleared when isOngoing = Yes | conditional | For hospitalization/surgery/emergency: required unless `isOngoing` ("Date of discharge is required unless treatment is ongoing."); if both dates present, discharge DAY may not be before admission DAY ("Discharge date cannot be before the admission date."). Day-level compare (time ignored). No future-date rule (a computed `today` in the validator is unused). | `discharge_at` |
| Treatment | `isOngoing` | Yes/No toggle | yes (always, any treatment type) | must be boolean; "Indicate whether treatment is ongoing." Setting Yes clears dischargeDate. | `is_ongoing_treatment` (`Boolean`, always sent) |
| Treatment | `treatmentDescription` | textarea 3 rows | yes | non-blank; "Brief description of treatment / procedure is required." | `treatment_description` |
| Expenses | `expenseLines[]` | fixed 6-row table (category + amount + description) | at least one amount > 0 | lines array must be non-empty ("Add at least one expense line item.") and `some(Number(amount) > 0)` ("At least one expense line must have an amount greater than zero."). Input `type=number min=0 step=0.01`. | `expenses` = `[{category, claimed_amount: Number(amount)\|\|0, description?}]`, only lines with amount != "" / not null (note: a "0" line IS sent) |
| Expenses | categories (fixed keys) | - | - | `CONSULTATION_FEES` "Consultation Fees", `HOSPITAL_CHARGES` "Hospital Charges", `MEDICINES` "Medicines", `DIAGNOSTIC_TESTS` "Diagnostic Tests", `SURGERY_PROCEDURE` "Surgery / Procedure", `OTHER_EXPENSES` "Other Expenses" | `category` |
| Expenses | running total "Your Total" | computed | - | `sumExpenseLines` = sum of `Number(amount)` for finite, >0 values. **Reference only; never sent**; footer text: "This total is for your reference only — the office calculates and approves the final amount." Server recomputes totals ("never trusts client totals"). | - |
| Declaration | `declarationAccepted` | checkbox (DeclarationPanel; declaration shown in English, Hindi, Gujarati, all three stacked) | yes | "You must accept the declaration before submitting." Ticking sets `declarationVersion = "v1"` (`DECLARATION_VERSION`); unticking clears it. Validator also fails "Declaration version is missing." if version blank. | `declaration_accepted` (bool), `declaration_version` |

Declaration text (`models/declarationText.js`, version `v1`): EN: "I hereby declare that the information furnished above is true and correct to the best of my knowledge." / "I understand that false or misleading information may result in rejection of the claim." Hindi and Gujarati equivalents (verbatim strings in the model file). Checkbox label: "I have read and understood the declaration above in all three languages, and I confirm the information given in this claim is true and correct to the best of my knowledge."

**Edit / resubmit mode (`mapClaimToFormData`).** Prefills from claim with camel/snake fallback: `memberId`, `relationshipType` (claim.relationshipType -> relationship_type -> patientSnapshot.relationshipType -> patient_snapshot.relationship_type -> matching member's), `natureOfIllness`, `symptomsFirstNoticedOn` (`first_symptom_date`), `initialSymptoms`, `initialSymptomOtherDetail`, `firstConsultationDate`, `treatingDoctorOrHospital` (`treating_doctor_name`), `isMedicoLegal` (`is_medico_legal_case`), `reportedToPolice`, `policeStationDetails`, `hospitalId`, non-network resolution (`isNonNetworkHospital` -> `isNetworkHospital` inverse -> `is_network_hospital` inverse -> presence of non-network name), `nonNetworkHospitalName/Reason`, `treatmentType` (lowercased), `admissionDate` (`admission_at`), `dischargeDate` (`discharge_at`), `isOngoing` (`is_ongoing_treatment`), `treatmentDescription`, expenses from `claim.expenses | claim.expenseLines` mapped by category using `claimedAmount ?? claimed_amount ?? amount`. Declaration is ALWAYS reset (`false`/"") — employee must re-accept. Known quirks: (a) `initial_symptoms` stored as `"OTHER: detail"` is not re-parsed, so the OTHER checkbox will not show ticked and the detail is lost on edit; (b) `datetime-local` inputs require `YYYY-MM-DDTHH:mm`, so if backend returns ISO with seconds/timezone the prefill may render blank (not verified against backend format).

**Conditional rendering.** Police-related fields depend on medico-legal / reported answers; other-symptom text input depends on OTHER ticked; non-network box depends on "Other" hospital; discharge input disabled while ongoing; MemberPicker shows loading / error / "No covered members on file yet. Use the Family Members tab to request one before filing a claim." states instead of the select; HospitalPicker shows loading / error states.

**Business rules encoded.** No eligibility-amount preview exists in this modal (no policy limit / floater balance is shown or checked); no file upload; no deadline logic here (the 7-day document window is only described in later UI).

---

## 2. Helper components used by the modal / review flows

### 2.1 MemberPicker
Props: `members[]`, `loading`, `error`, `value` (string id), `onChange(memberObjectOrNull)`, `disabled`, `errorMessage`. Stateless. Reads member fields `id, fullName|full_name|name, relationshipType|relationship_type, dateOfBirth|date_of_birth, gender`. No API calls.

### 2.2 HospitalPicker
Props: `hospitals[]`, `loading`, `error`, `hospitalId`, `isNonNetworkHospital`, `nonNetworkHospitalName`, `nonNetworkReason`, `onChange(patch)`, `disabled`, `errors`. Fully controlled. Options use `h.id ?? h.hospitalId`, `h.name`, `h.city`. **Note: it does NOT filter by status/network** — it shows exactly the list given (the doc comment says "active/approved" but no filter exists), while `HospitalDirectory` does filter inactive.

### 2.3 ExpenseEditor
Props `lines`, `onChange(newLinesArray)`, `readOnly`, `error`. Always renders the 6 fixed categories (missing categories default to `{amount:"", description:""}`); `onChange` receives all 6 rows. Tests pin: shows `₹0.00` at start, updates total as parent feeds new lines, `readOnly` disables inputs and suppresses onChange, shows disclaimer text.

### 2.4 DeclarationPanel
Props `accepted`, `onAcceptedChange(bool)`, `readOnly`. Renders the three-language statements plus one checkbox and "Declaration version v1".

### 2.5 ClaimSummaryCard
Prop `claim`, `className`. Returns null if no claim. Shows: Claim Number (`claimNumber|claim_number`, fallback "Draft"), `ClaimStatusBadge(claim.status)`, Patient = `patientName | patient_snapshot.name | patient.name | "—"` plus ` (relationshipType)` when present, Claimed Amount = `totalClaimedAmount ?? total_claimed_amount`, Approved Amount = `approvedAmount ?? approved_amount ?? totalApprovedAmount ?? total_approved_amount` ("—" if null), Submitted On = `submittedAt|submitted_at`.

---

## 3. ClaimStatusBadge
Purpose: pill with dot + label for a status. Props: `status` (string, req), `className`. Known status -> label/tone/dot/tooltip from section 0.1; unknown -> neutral grey pill showing raw status (or "Unknown"). No state, no API.

## 4. ClaimTimeline
Purpose: vertical append-only workflow event log. Props: `claimId` (req). State: `{key, events, error}`. API: `claimTimeline(claimId)` -> `GET /v1/mediclaim/claims/{id}/timeline` on mount / id change (skipped without claimId or token). States: "Loading timeline…", error message, "No timeline events yet.". Per event reads: `id`, `label || eventType || event_type || "Update"`, `createdAt|created_at` (date only), `actorName|actor_name|actor.name` ("by X"), `description`. Order = as returned (no client sort).

## 5. ClaimDecisionsList
Purpose: stage-by-stage decision records (distinct from timeline). Props: `claimId`. API: `claimDecisions(claimId)` -> `GET /v1/mediclaim/claims/{id}/decisions`. Per entry reads: `id`, `stage` (matched to REVIEW_STAGE_META for label + "(Section X)"; raw stage shown if unknown), `decidedAt|decided_at|createdAt|created_at`, `decision` (raw string shown), `decidedByName|decided_by_name|actorName|actor.name`, `approvedAmount|approved_amount|fields.approvedAmount` (shown "Approved Amount: ₹…" when != null), `remarks`. Empty: "No stage decisions recorded yet."

## 6. ClaimFullDetail
Purpose: read-only everything-an-approver-needs body (embedded in every review panel). Props: `claimId`. State: `{key, claim, documents, error}`, `viewerDoc`. API (parallel on mount): `getClaim(claimId)` -> `GET /claims/{id}`; `claimDocuments(claimId)` -> `GET /claims/{id}/documents` (failure tolerated -> empty list). Renders (collapsible sections): 
- **Claim Information** (open by default): Treatment Type, Hospital (network -> `claim.hospital.name || claim.hospitalName`; non-network -> `nonNetworkHospitalName|non_network_hospital_name`; network decided by `isNetworkHospital ?? is_network_hospital`), Medico-Legal Case (`isMedicoLegalCase ?? is_medico_legal_case` -> Yes/No), Nature of Illness, Treating Doctor (`treatingDoctorName|treating_doctor_name`), First Symptom Date, First Consultation, Admission (`admissionAt|admission_at`), Discharge ("Ongoing" if `isOngoingTreatment ?? is_ongoing_treatment`, else `dischargeAt|discharge_at`), Treatment Description.
- **Expense Breakdown** (count = lines): each line `getExpenseCategoryLabel(category)`, description, claimed amount (`claimed_amount ?? claimedAmount ?? amount`), "Approved ₹x" if `approved_amount ?? approvedAmount` != null, red `disallowed_reason|disallowedReason`. Lines from `claim.expenses || claim.expenseLines || claim.expense_lines`. Total = sum of line claimed amounts; if no lines but `totalClaimedAmount` > 0, shows that as Total. Approved total = sum of line approved amounts if any line has one, else claim-level `approvedAmount|totalApprovedAmount` (only shown when > 0).
- **Documents**: list of buttons `documentLabel || documentType` + `status || "View"`; click opens `DocumentViewerModal` (shared app component, not documented here).
- **Prior Decisions**: `ClaimDecisionsList`. **Timeline**: `ClaimTimeline`.
Returns null without claimId; loading text "Loading claim details…"; error text `err.message || "Failed to load claim details."`.

## 7. ClaimDetailDrawer
Purpose: click-a-row read-only claim detail drawer reused by My Claims, Team Claims, admin Claims, Pending Reviews (non-actionable claims), and — with `allowDocumentUpload` — the employee's document-upload + treatment-finalization surface.

**Props.**
| prop | type | req | meaning |
|---|---|---|---|
| `isOpen` | bool | yes | drawer open |
| `onClose` | fn | yes | |
| `claimId` | string/number | yes | fetched when open |
| `footer` | node | no | forwarded to Drawer footer slot (no current caller passes it) |
| `title` | string | no | overrides title (default `claimNumber|claim_number|"Claim Details"`); subtitle = `patientName | patient_snapshot.name` |
| `allowDocumentUpload` | bool (default false) | no | only MyClaimsTab passes true; swaps plain document list for `DocumentChecklist` + due-date banner / Finalize Treatment form |
| `documentRequirements` | array | no | from `lookups.documentRequirements` |
| `documentRequirementsLoading` | bool | no | passes `lookups.loading` |
| `onDocumentsChanged` | fn | no | called after upload/finalize so the host reloads its list |

**State.** `reloadToken`, `result {key, claim, documents, error}`, `viewerDoc`, `wasOpen` (render-time reset: on close clears result/viewer/dischargeInput), `now` (frozen at mount for overdue check), `dischargeInput`, `dischargeSaving`, `finalizeExpenses` (array, initial one blank row `{category:"", description:"", claimedAmount:"", expenseDate:""}`).

**API calls.** On open / reload: `getClaim(claimId)` -> `GET /claims/{id}` and `claimDocuments(claimId)` -> `GET /claims/{id}/documents` (documents failure tolerated -> []). Plus children: ClaimDecisionsList (`GET /claims/{id}/decisions`), ClaimTimeline (`GET /claims/{id}/timeline`). Finalize: `finalizeTreatment(claimId, {dischargeAt, expenses})` -> `POST /claims/{id}/finalize-treatment`. Upload (via DocumentChecklist): `POST /claims/{id}/documents`.

**Sections.** Summary card; Expense Breakdown (same rendering rules as ClaimFullDetail); Documents; Decisions; Timeline.

**Documents section logic.**
- `canUploadNow = allowDocumentUpload && !isTerminalClaimStatus(claim.status)`. Terminal = REJECTED, CLOSED, WITHDRAWN, CANCELLED (SETTLED still allows re-upload). If false: plain read-only list of documents (button per doc, opens viewer; "No documents uploaded yet." when empty).
- `isOngoing = claim.isOngoingTreatment ?? claim.is_ongoing_treatment`; `dischargeAt = claim.dischargeDate || claim.discharge_at`; `admissionAt = claim.admissionDate || claim.admission_at`; `isDischargeMissing = isOngoing || !dischargeAt`.
- If `isDischargeMissing`: amber "Finalize Treatment" form, text: treatment was ongoing at submission so the document upload window has not started; record discharge date and final bill, then "you'll have 7 days to upload the required documents."
  - Fields: Discharge (`datetime-local`, `min` = admission formatted `YYYY-MM-DDTHH:mm`), repeating "Final Charges" rows (Category select from the 6 categories, Amount number min 0 step 0.01, Expense Date `date`), "+ Add another line", "Remove" (only when >1 row).
  - `validExpenseLines` = rows with category set AND `Number(claimedAmount) > 0`. Submit button "Finalize Treatment" enabled only when discharge input set AND >=1 valid line AND not saving.
  - Extra check on submit: discharge DAY < admission DAY -> toast "Discharge date cannot be before the admission date." and abort.
  - Payload (built by `mediclaimApi.finalizeTreatment`): `{discharge_at: <"YYYY-MM-DDTHH:mm" local string, no timezone>, expenses:[{category, description|null, claimed_amount, expense_date|null}]}`. Note the drawer's rows have no description input, so description is always null.
  - Success: toast "Treatment finalized — the document upload window has started.", clears form, reloads claim + docs, calls `onDocumentsChanged`. Failure: toast `err.message || "Failed to finalize the treatment."`.
- If `documentsDueAt` (`documentsDueAt|documents_due_at`) and discharge present: status banner. `missingTypes` = required document types (via `getRequiredDocumentTypes(documentRequirements, {treatmentType, isMedicoLegal})`) with no uploaded doc of that `documentType|document_type`. Banner: none missing -> green "All required documents are on file."; missing and `documentsDueAt` < now -> red "Overdue — required documents were due by <date>. Upload them as soon as possible."; missing and not overdue -> amber "Upload required documents by <date> (within 1 week of discharge)."
- Then `DocumentChecklist` (upload enabled) with `dischargeDateMissing={isDischargeMissing}` (prop is accepted but not used inside DocumentChecklist).
- Section is open by default only when `canUploadNow`.

## 8. DocumentChecklist
Purpose: per-document-type upload / view checklist driven by HR-managed requirement rows.

**Props.** `claimId` (upload disabled + amber banner "Document upload unlocks once this claim has a claim number." when falsy), `requirements[]` (rows from `GET /document-requirements`), `requirementsLoading` bool, `claimSnapshot {treatmentType, isMedicoLegal}`, `uploadedDocs[]`, `onUploaded()`, `readOnly` (no upload controls at all), `dischargeDateMissing` (accepted, unused).

**State.** `uploadingType` (type currently uploading -> spinner + disabled input), `viewerDoc`.

**Row model (requirement row).** `id`, `documentType|document_type`, `label`, `isRequired|is_required`, `conditionalRule|conditional_rule`, `sortOrder|sort_order` (ascending sort). Seeded defaults (backend migration `2026_09_16_000003_create_mediclaim_document_requirements_table`, also the test fixture): 

| documentType | label | isRequired | conditionalRule | sort |
|---|---|---|---|---|
| MEDICLAIM_CLAIM_FORM | Duly Filled Claim Form | true | - | 1 |
| PRESCRIPTION | Doctor Prescription | true | - | 2 |
| MEDICAL_REPORT | Medical Reports | true | - | 3 |
| HOSPITAL_BILL | Hospital Main Bill & Break-up | true | - | 4 |
| MEDICINE_BILL | Medicine Bills | true | - | 5 |
| DISCHARGE_SUMMARY | Discharge Summary | false | `hospitalized_or_surgery` | 6 |
| FIR_MLC | FIR / MLC | false | `medico_legal` | 7 |
| OTHER | Any Other Supporting Documents | false | - | 8 |

**Required/optional resolution (`documentChecklistRules.resolveRequiredDocuments`).**
- `conditionalRule === "hospitalized_or_surgery"` -> REQUIRED iff `treatmentType` is `hospitalization` or `surgery` (NOTE: `emergency` is not included, even though the claim form requires an admission date for emergency).
- `conditionalRule === "medico_legal"` -> REQUIRED iff `isMedicoLegal` truthy.
- otherwise -> `isRequired` flag unconditionally.
Badge "Required" (red) / "Optional" (grey); sub-note "Required if hospitalized" / "Required if medico-legal" for the two rules.

**Upload behavior.** One hidden `<input type=file>` per row (no `accept`, no size or type check in the client — constraints, if any, are server-side and unknown to the UI). On file chosen: `uploadClaimDocument(claimId, {file, documentType}, token, type)` -> `POST /claims/{claimId}/documents` as `multipart/form-data` with fields `file`, `documentType` (and optional `description`; header `Idempotency-Key` is supported by the API client but this component never passes one). Button text "Replace" if any doc already exists for that type else "Upload". Success: toast "Document uploaded", `onUploaded()`. Failure: toast `err.message || "Upload failed"`. Input value reset after selection so the same file can be re-picked.

**Viewing.** Uploaded docs per type shown as green chips: label = `doc.currentVersion?.fileName || doc.fileName || "View"`; click opens `DocumentViewerModal`. Doc match by `documentType|document_type`; key `documentId ?? id`.

**Empty states.** `rows.length === 0`: `requirementsLoading` -> "Loading the document checklist…" else "No document types have been configured yet — ask HR to set these up under Mediclaim Settings."

## 9. ReviewPanelShell
Purpose: shared chrome for all review panels. Composes `ClaimSummaryCard` + `ClaimFullDetail(claimId = claim.id ?? claim.claimId)` + decision card. Performs no network calls.

**Props.** `claim`, `stage` (REVIEW_STAGE), `decisionOptions [{value,label}]`, `initialFields` (object, initial state of stage-specific fields), `renderExtraFields({decision, fields, setFieldValue, errors})`, `extraValidate(decision, fields) -> errors map`, `onSubmit(decision, remarksTrimmed, fields)`, `submitting`, `error`.

**State.** `decision` (null), `remarks` (""), `fields` (initialFields).

**Behavior.** Decision buttons (toggle style, `aria-pressed`, disabled while submitting). `claimedTotal = claim.totalClaimedAmount ?? claim.total_claimed_amount`. Remarks label shows a red asterisk and placeholder "Required — explain the reason for this decision." iff a decision is selected and it is not the stage's `cleanApproveDecision`; otherwise placeholder "Optional remarks". Errors = `validateReviewDecision(...)` merged with `extraValidate` output; "Submit Decision" enabled only when a decision is chosen, no errors, not submitting. Submit label "Submit Decision" / "Submitting…". Server error shown as red text under remarks. Field-level error text for remarks shown inline; other field errors are rendered by each panel's `renderExtraFields`.

## 10. SingleApprovalPanel (stage APPROVAL — the live simplified workflow)
Purpose: one-shot decision for claims in SUBMITTED or MANAGER_REVIEW, by whoever holds `mediclaim.claim.approve`.
Props: `claim` (req; needs `id|claimId`, `totalClaimedAmount|total_claimed_amount`), `onDecided(resData|null)`.
State: `submitting`, `error`.
API: `submitReviewDecision(claimId, payload)` -> `POST /v1/mediclaim/reviews/{claimId}/decision`. Success: `onDecided(res.data ?? null)`. Failure: inline `err.message || "Failed to submit the approval decision."`.

| field | type | required | rule | payload key |
|---|---|---|---|---|
| decision | 3 buttons: Approved / Partially Approved / Rejected | yes | "Select a decision." | `decision` = `approved` \| `partially_approved` \| `rejected` |
| approvedAmount | number, min 0, step 0.01; label "Approved Amount (₹) *"; hidden when Rejected | yes unless Rejected | >= 0, <= claimed total ("cannot exceed the total claimed amount") | `approvedAmount` AND `approved_amount` (both keys sent, same number). If the field is blank/NaN at submit the code would fall back to claimed total, but the validator prevents submitting blank, so the fallback is unreachable. Omitted entirely for `rejected`. |
| remarks | textarea (min 5 chars once required) | required for partially_approved and rejected; optional for approved | trimmed, >= 5 chars | `remarks` (trimmed, "" allowed) |

(The API client also mirrors camel<->snake for `approvedAmount`/`approved_amount`.)

## 11. DirectorDecisionPanel (stage DIRECTOR, Section K — legacy five-stage chain, still registered)
Identical UI, validation and payload to SingleApprovalPanel except stage = DIRECTOR, error text "Failed to submit the director decision." Shown for claims in DIRECTOR_FINAL_APPROVAL. Payload: `{decision: approved|partially_approved|rejected, remarks, approvedAmount, approved_amount}` (amount omitted for rejected). Tests pin: Approved needs amount, submit disabled until filled; Partially Approved also needs amount and remarks; Rejected hides the number input and sends no amount; amount above claimed total shows "cannot exceed the total claimed amount" and disables submit; clean-approve with empty remarks is allowed. (Test-vs-code drift: the test asserts the payload equals `{decision:"approved", remarks:"", approvedAmount:9500}` but the panel also sends `approved_amount`, so that assertion likely fails as written — the code, not the test, is the behavior to copy.)

## 12. ManagerReviewPanel (stage MANAGER, legacy)
Props: `claim`, `onDecided`. Decisions: Approve / Reject / Return for Correction (values `approve|reject|return`). No extra fields. Remarks required (>=5 chars) for Reject and Return; optional for Approve.
API on submit, in order: (1) `acknowledgeConfidentiality(claimId)` -> `POST /claims/{id}/confidentiality-ack` (backend returns 409 `CONFIDENTIALITY_ACK_REQUIRED` on any manager decision until this has been called once; UI calls it automatically before every decision; idempotent); (2) `submitReviewDecision(claimId, {decision, remarks})` -> `POST /reviews/{id}/decision`. If step 1 fails, step 2 is not attempted and the error is shown. Error fallback "Failed to submit the manager decision." Tests pin: ack is called with `(55, token, "Bearer")`; payload exactly `{decision:"approve", remarks:""}`; Reject/Return blocked until remarks; asterisk on Remarks appears only after a non-clean decision; server error text shown and `onDecided` not called.

## 13. CoordinatorReviewPanel (stage COORDINATOR, Section H, legacy)
Decisions: Verified / Return for Correction (`verified|return`).

| field | type | required | rule | payload key |
|---|---|---|---|---|
| decision | buttons | yes | - | `decision` |
| documentsVerified | checkbox "Claim and documents verified" (default false) | required only when decision = `verified` | "Confirm the claim and documents are verified before submitting." | `documentsVerified` (bool, always sent, even for return) |
| remarks | textarea | required (>=5) for `return`; optional for `verified` | | `remarks` |

API: `submitReviewDecision` -> `POST /reviews/{id}/decision`. Error fallback "Failed to submit the coordinator verification."

## 14. CommitteeReviewPanel (stage COMMITTEE, Section I, legacy)
Decisions: Recommended / Not Recommended (`recommended|not_recommended`). No extra fields. Remarks optional for recommended, required (>=5) for not_recommended. Payload `{decision, remarks}`. Error fallback "Failed to submit the committee recommendation."

## 15. HrEligibilityReviewPanel (stage HR_ELIGIBILITY, Section J, legacy)
Decisions: Verified / Return for Correction (`verified|return`).

| field | type | required | rule | payload key |
|---|---|---|---|---|
| decision | buttons | yes | | `decision` |
| eligibilityVerified | checkbox "Employee eligibility verified" (default false) | when decision = verified | "Confirm employee eligibility is verified before submitting." | `eligibilityVerified` |
| policyApplicabilityVerified | checkbox "Policy applicability verified" (default false) | when decision = verified | "Confirm policy applicability is verified before submitting." | `policyApplicabilityVerified` |
| remarks | textarea | required (>=5) for `return` | | `remarks` |

Error fallback "Failed to submit the HR eligibility verification." Both booleans are always sent.

## 16. SettlementPanel (stage SETTLEMENT, status SETTLEMENT_PENDING)
Purpose: "Final Approve" — record settlement and (per source comment) close the claim in the same request (`ReviewQueueController::decide()` chains `closeClaim()` after a fully-settling `recordSettlement()`). Does not use ReviewPanelShell.
Props: `claim` (needs `id|claimId`, `totalApprovedAmount|total_approved_amount`, `treatmentType|treatment_type`, `isMedicoLegal|is_medico_legal_case`), `onDecided(resData|null)`.
State: `checkResult {key, missing[], docs[], requirements[], error}`, `amount` (init `String(approvedAmount)` if > 0 else ""), `mode` (init `bank_transfer`), `reference`, `submitting`, `error`.
API on mount / claimId change: `claimDocuments(claimId)` (`GET /claims/{id}/documents`) and `documentRequirements({})` (`GET /document-requirements`) in parallel. `missing` = required types (per `getRequiredDocumentTypes` with the claim's treatment type + medico-legal flag) with no document of that `documentType|document_type`. Any failure -> red "Failed to check document completeness." (no form).
States: checking -> "Checking document completeness…"; error -> red text; else renders read-only `DocumentChecklist` (viewer only) then either:
- **Blocked** (missing.length > 0): amber "Waiting on the employee to upload N required document(s) — this claim cannot be settled until they're all on file. It stays in Pending Reviews until then." No form.
- **Ready**: green "All required documents are on file — ready to finalize." plus form.

| field | type | required | rule | payload key |
|---|---|---|---|---|
| Settlement Amount (₹) | number min 0.01 step 0.01, prefilled with approved amount; shows "Approved amount: ₹x" hint | yes | client: must be > 0 ("Enter a settlement amount greater than zero."). No client check that it equals/does not exceed the approved amount. | `amount` (number) |
| Mode | select: `bank_transfer` "Bank Transfer", `cheque` "Cheque", `cash` "Cash", `online` "Online Payment" | yes (default bank_transfer) | | `mode` |
| Reference Number | text, placeholder "Transaction / cheque number" | no | trimmed; omitted if empty | `reference` |
| (fixed) | - | - | - | `decision: "final_approve"` |

Submit button "Final Approve" / "Finalizing…" -> `submitReviewDecision(claimId, {decision:"final_approve", amount, mode, reference})` -> `POST /reviews/{id}/decision`. Failure: inline `err.message || "Failed to record the settlement."`. Success: `onDecided(res.data ?? null)`.

## 17. FamilyMemberManager
Purpose: list covered members and let the employee add / update / remove them via change requests (applied immediately by the backend; no HR wait), with advisory eligibility warnings and a history list.

**Props.** `members[]` (from lookups `GET /me/members`), `loading`, `error`, `onChanged()` (called after successful save; host passes `lookups.reload`). Does not fetch members itself.

**State.** `reloadToken`, `requestsResult {key,requests,error}` (history), `modalOpen`, `form`, `saving`.

**API.** On mount: `memberChangeRequests({})` -> `GET /me/member-change-requests` (history; displayed newest as returned). On Save: `createMemberChangeRequest(payload)` -> `POST /me/member-change-requests`.

**Members table columns.** Name (`fullName|full_name|name`), Relationship, Date of Birth (formatted), Status badge (green if `status === "active"` else grey; shows raw status), Actions: "Update details" (opens modal in UPDATE mode), "Remove from coverage" (REMOVE mode). Header button "Add Family Member" (ADD mode). Empty: "No covered members on file yet."

**History rows.** `requestType|request_type` + " — " + name (from `proposedValues|proposed_values` name/fullName/full_name, else `memberName|member_name`, else `member.fullName|full_name|name`), created date, status badge (pending yellow / approved green / rejected red / else grey). Empty: "No changes made yet."

**Modal form.**

| field | UI | required | rule | payload key |
|---|---|---|---|---|
| Request type | tab toggle ADD / UPDATE / REMOVE | yes | default ADD | `requestType` ("ADD"/"UPDATE"/"REMOVE") |
| Existing Member | select of members; shown for UPDATE and REMOVE; selecting prefills name/relationship/DOB/gender | required for UPDATE/REMOVE ("Select which member this is about") | | `memberId` (omitted for ADD) |
| Relationship | select from `SPOUSE, CHILD, PARENT`, filtered (see below); hidden for REMOVE | yes (default first available; fallback "CHILD") | | `relationshipType` (also inside proposedValues); sent for REMOVE too |
| Full Name | text, warning "Enter the name exactly as it appears on the member's Aadhaar card…" ; hidden for REMOVE | required for ADD/UPDATE ("Member name is required") | trimmed | `proposedValues.name` |
| Date of Birth | date | no | | `proposedValues.dateOfBirth` |
| Gender | select `MALE`/`FEMALE`/`OTHER` | no | | `proposedValues.gender` |
| Notes (optional) | textarea | no | trimmed | `reason` |
| (REMOVE) | - | - | `proposedValues` omitted entirely | |

Success (when `res.status !== false`): toast "Family member added" / "updated" / "removed", close modal, reload history, `onChanged()`. Failure: toast `err.message || "Failed to save this change"`.

**Policy rules encoded (client-side, from the policy rule book).**
- Family floater Rs 3,00,000 for employee + family (text only: "Family floater limit is ₹3,00,000, shared across all covered members.").
- Max 2 children per employee (`MAX_COVERED_CHILDREN`), eligible only up to age 18 (`CHILD_MAX_AGE_YEARS`; warns when age > 18).
- Parents above 55 not covered (`PARENT_MAX_AGE_YEARS`; warns when age > 55).
- Hard UI filtering of Relationship options: SPOUSE hidden if an active/pending spouse already exists (excluding the member being updated); PARENT hidden if >= 2 active/pending parents (relationship SPOUSE/PARENT/FATHER/MOTHER accepted when counting; CHILD not filtered). "Active" count = status blank, `active` or `pending`.
- Advisory-only warning (amber box, never blocks submit): child age > 18; ADD child when >= 2 active/pending children already on file; parent age > 55. Message ends "HR is likely to reject this request." Age computed from DOB client-side. Backend re-validates (`PolicyEligibilityService`/`MediclaimMemberService`).
- SELF is never offered as a selectable relationship here.

## 18. HospitalDirectory
Purpose: employee-facing searchable list of network hospitals (also embedded read-only inside the admin Hospitals and Rule Books tabs / MediclaimInfoTab).
Props: `hospitals[]`, `loading`, `error` (data from `GET /hospitals` via lookups; component does no fetching).
State: `search`, `networkOnly`, `cashlessOnly`.
Filtering: always drops hospitals whose lowercased `status` is non-empty and != "active" (hospitals are soft-retired via `status: inactive`, never hard-deleted); `networkOnly` requires `isNetworkHospital|is_network_hospital`; `cashlessOnly` requires `cashlessAvailable|cashless_available`; search matches (case-insensitive substring) over `name, city, state, specialties|specialities[]`.
Empty states: no hospitals at all -> "No hospitals have been added yet."; filtered to zero -> "No hospitals match these filters."; loading -> skeleton; error -> red text.
Card fields: `name`; address = join of `address, city, state, pincode|pinCode` with ", "; badges "Network", "Cashless"; specialty chips; contacts (`contacts|hospitalContacts` each `{id, name, designation, phone, email, photo}`) with tel: link, copy-phone button (clipboard; toasts "Phone number copied" / "Could not copy phone number"), mailto: link; photo URL via `getHospitalContactPhotoUrl(photo)`: absolute/data URLs as-is else `${baseUrl}/storage/<path>`; fallback initial avatar; "No contact on file yet." when none. Map: iframe `https://www.google.com/maps?q=<lat,lng or address>&z=16&output=embed` (coordinates `latitude|lat`, `longitude|lng` preferred; else address). Directions link = `googleMapsUrl|google_maps_url` if present else `https://www.google.com/maps/dir/?api=1&destination=<query>`; label "Directions" or "Directions (approximate)" when no admin link/coordinates.

## 19. RuleBookViewer
Purpose: two-step read-only rule book viewer (pick a language, then read numbered rules).
Props: `ruleBooks[]` (from `GET /rule-books`), `loading`, `error`, `onLanguageSelected()` (fires once when a language's content is displayed; the onboarding gate uses it to allow "acknowledge").
State: `languageId`.
Rules: only rule books with `status` (lowercased) === "published" are considered; one language card per distinct language (`languageId|language_id|language.id`), label `language.nativeName|native_name|name` with English name as subtitle when different; nothing is shown until the employee picks a language, even when only one language exists; the first published rule book for that language is shown. Header: "Mediclaim Rule Book — <label>" + " (<versionLabel|version_label>)" and "Effective from <date>" (`effectiveFrom|effective_from`). Rules are an ordered list of `items[].ruleText|rule_text` (order as returned). Empty states: "No Mediclaim rule book has been published yet. Check back once HR publishes it." (no published languages); "The rule book has no rules published yet in <label>." (published but zero items); "Change language" button returns to picker. Acknowledgement itself is done by the host (`POST /me/rule-book-acknowledge`, then `POST /me/onboarding-complete`), not by this component.

## 20. CardViewer
Purpose: the employee's own Mediclaim cards (one per approved covered member).
Props: `onLoaded(cardsArray)` (optional; fires after a successful fetch; used to drive a dashboard count).
State: `result {key, cards, error}`, `employeeProfile`.
API: `myCards()` -> `GET /me/cards`; and `authApi.getProfile()` -> the app's `/profile` endpoint (NOT under /mediclaim) for the employee's own photo and codes; profile failure is silent (initials fallback).
States: loading skeleton (2 grey boxes); error text; empty: "No Mediclaim cards issued yet. A card is generated for each approved covered member."
Per card (fields read): `id|cardId`; relationship = `relationshipType|relationship_type|member.relationshipType|member.relationship_type`; `isSelf` = relationship lowercased === "self"; name = `memberName|member_name|member.fullName|member.full_name|(self ? profile.name : "")|"—"`; photo only for self card (`getEmployeePhotoUrl(profile.photo)`); employeeCode (shown as ID No. on EVERY card) = `profile.emp_code || punching_no || punching_code || employee_code`; company from `profile.company_code`; department/designation (self only). Passes `card` through to MediclaimIdCard.

## 21. MediclaimIdCard
Purpose: renders one card as a company ID card (also used in the admin Employees drawer).
Props: `card` (fields: `status`, `verifyToken|verify_token`, `validFrom|valid_from`, `validTo|valid_to`, `cardNumber|card_number`), `name`, `relationship`, `photoUrl`, `employeeCode`, `companyCode`, `department`, `designation`.
State: `qrOpen`, `imagePreview {open, src, loading}`, `downloading`, `photoFailed`.
Display: header band with company logo/label ("Mediclaim ID Card") from `getCompanyConfig(companyCode)` (`label`, `logo`, `initials`, `name`); status badge (`active` green, `expired` grey, `revoked` red, `superseded` grey, else grey); photo or initials avatar (photo load error -> initials); name; subtitle "designation · department"; relationship chip; **ID No. = employeeCode, else masked card number "XXXX-<last4>"**; Valid Till; Valid from footer; "Company-Sponsored Health Cover".
QR: encodes `${window.location.origin}/mediclaim/verify/{verifyToken}`; if no `verifyToken`, the QR button is disabled with a placeholder icon; tapping opens a 200px QR popup ("Scan to verify this card"). The public verify page uses `verifyCard(token)` -> `GET /v1/mediclaim/cards/verify/{token}` with NO Authorization header (unauthenticated, own throttle). Verify-page payload names referenced: `member_number_masked`, `policy_number_masked` (from formatter docs).
Actions: "View Card" and "Download" both rasterize the card face with `html2canvas(node,{scale:3, backgroundColor:"#fff", useCORS:true})`; View shows PNG in popup with Download; Download saves `mediclaim-card-<slug(employeeCode||name)>.png`. Images use `crossOrigin="anonymous"` so canvas capture works (photo/logo server must send CORS headers). Failure toasts: "Failed to generate the card image." / "Failed to download the card image." Company-specific branding (`companyConfig`) is a build-time mode (`nidhi-impex` | `silver-star` | all).

---

## Component dependency map

```
NewClaimRequestModal
 ├─ Modal, Button (shared ui)
 ├─ MemberPicker            (formatClaimDate)
 ├─ HospitalPicker
 ├─ ExpenseEditor           (expenseCategories, sumExpenseLines, formatCurrencyINR)
 ├─ DeclarationPanel        (declarationText, DECLARATION_VERSION)
 ├─ utils/claimValidation   (validatePatientStep / MedicalHistory / Treatment / Expenses / Declaration)
 └─ services/mediclaimApi   (createClaim, updateClaim, submitClaim)
    host: MyClaimsTab (passes useMediclaimLookups() result)

ClaimDetailDrawer
 ├─ Drawer + CollapsibleSection (shared ui), DocumentViewerModal (shared)
 ├─ ClaimSummaryCard ── ClaimStatusBadge
 ├─ DocumentChecklist ── DocumentViewerModal, documentChecklistRules
 ├─ ClaimDecisionsList
 ├─ ClaimTimeline
 └─ mediclaimApi (getClaim, claimDocuments, finalizeTreatment)
    hosts: MyClaimsTab (allowDocumentUpload), TeamClaimsTab, admin ClaimsTab, admin PendingReviewsTab (non-actionable claims)

ReviewPanelShell
 ├─ ClaimSummaryCard ── ClaimStatusBadge
 ├─ ClaimFullDetail ── DocumentViewerModal, ClaimDecisionsList, ClaimTimeline, mediclaimApi (getClaim, claimDocuments)
 └─ utils/claimValidation.validateReviewDecision, reviewStages.getReviewStageMeta

SingleApprovalPanel / DirectorDecisionPanel / ManagerReviewPanel / CoordinatorReviewPanel /
CommitteeReviewPanel / HrEligibilityReviewPanel ── each wraps ReviewPanelShell, calls mediclaimApi.submitReviewDecision
   (ManagerReviewPanel additionally calls acknowledgeConfidentiality)
SettlementPanel ── ClaimSummaryCard, DocumentChecklist(readOnly), mediclaimApi (claimDocuments, documentRequirements, submitReviewDecision)
   host for all 7 panels: admin PendingReviewsTab, STAGE_PANEL map keyed by REVIEW_STAGE, inside a Drawer titled REVIEW_STAGE_META[stage].label;
   panel shown only if a resolved stage exists AND the user holds that stage's decide permission, else ClaimDetailDrawer.

CardViewer ── MediclaimIdCard ── Modal, Badge, qrcode.react (QRCodeCanvas/QRCodeSVG), html2canvas, companyConfig, formatters
   CardViewer also uses authApi.getProfile + getEmployeePhotoUrl. MediclaimIdCard is also used by admin EmployeesTab.
FamilyMemberManager ── Modal, Button, Badge, SkeletonTable; host: employee FamilyMembersTab (onChanged = lookups.reload)
HospitalDirectory  ── host: employee MediclaimInfoTab, admin HospitalsTab
RuleBookViewer     ── host: employee MediclaimInfoTab, employee RuleBookTab (onboarding gate), admin RuleBooksTab preview
ClaimStatusBadge   ── used by ClaimSummaryCard and list tables
```

---

## Backend contract gaps (things the UI assumes about API responses/requests that the backend must guarantee)

1. **Response envelope.** Single resources at `res.data`; lists at `res.data.data` or `res.data` (array). Errors must expose a human `message` (used verbatim in toasts/inline errors: `err.message`). `createMemberChangeRequest` success check is `res.status !== false`.
2. **Key casing.** UI reads camelCase first, snake_case as fallback for every field; the backend should return one consistently. Fields the UI depends on (claim): `id|claimId, claimNumber, status, currentStage, patientName (or patient_snapshot.name), relationshipType, totalClaimedAmount, totalApprovedAmount|approvedAmount, submittedAt, documentsDueAt, treatmentType, isMedicoLegal, isOngoingTreatment, admissionAt, dischargeAt, hospital.name, isNetworkHospital, nonNetworkHospitalName, natureOfIllness, treatingDoctorName, firstSymptomDate, firstConsultationDate, treatmentDescription, expenses[]`.
3. **Inconsistent claim-detail field names between components** (a new client must be told which is real): ClaimDetailDrawer reads `dischargeDate`/`admissionDate` (fallback `discharge_at`/`admission_at`) and `isMedicoLegal`, while ClaimFullDetail reads `dischargeAt`/`admissionAt` and `isMedicoLegalCase`; NewClaimRequestModal edit-mode reads `admissionDate|admission_at`, `isMedicoLegal`, `treatingDoctorOrHospital|treating_doctor_name`, `symptomsFirstNoticedOn|first_symptom_date`. Backend should guarantee one canonical set, ideally snake_case matching the create payload, and include BOTH `is_medico_legal_case` and the boolean the drawer needs for document requirement resolution (drawer/settlement rely on `treatmentType|treatment_type` and `isMedicoLegal|is_medico_legal_case`).
4. **Date formats.** Edit-mode prefill and the drawer's `min` attribute assume `admission_at`/`discharge_at` parse via `new Date()` and can be reformatted to `YYYY-MM-DDTHH:mm`; `first_symptom_date`/`first_consultation_date` must be `YYYY-MM-DD` (or the `<input type=date>` shows blank). `discharge_at` in finalize/discharge endpoints is sent as a local `YYYY-MM-DDTHH:mm` string with no timezone; backend must interpret timezone consistently.
5. **`initial_symptoms` encoding.** Sent as array of enum keys plus a single `"OTHER: <text>"` string; backend must store/return it losslessly and the edit-mode mapper does NOT decode it (returned claims with `OTHER: detail` lose the tick and text on resubmission). Consider returning `initial_symptom_other_detail` separately (edit mapper already looks for it).
6. **Expense lines.** Create/update sends `expenses[{category, claimed_amount, description}]`; finalize sends `{category, description, claimed_amount, expense_date}`. Response lines should include `id, category, claimed_amount|claimedAmount, approved_amount|approvedAmount, description, disallowed_reason|disallowedReason`. Totals `totalClaimedAmount`/`totalApprovedAmount` must be server-computed (client total is display-only).
7. **Decision endpoint contract (`POST /reviews/{claim}/decision`).** Body keys by stage: `decision` (lowercase enum), `remarks`, `approvedAmount` AND `approved_amount` (both sent), `documentsVerified` (coordinator), `eligibilityVerified` + `policyApplicabilityVerified` (HR), and for settlement `decision:"final_approve"`, `amount`, `mode` (`bank_transfer|cheque|cash|online`), `reference`. The backend must infer stage from the claim's status (client sends none). Approved amount for `partially_approved` is only validated `<=` claimed total client-side; the backend should enforce `0 <= approved <= claimed` (and ideally `< claimed` for partial). Response `res.data` is handed to `onDecided`; expected to be the updated claim (test fixtures return `{id, status}`).
8. **Settlement chaining.** UI assumes one `final_approve` call both records the settlement and closes the claim when fully settled; the backend must reject settlement while required documents are missing (UI only pre-checks by comparing `documentType` sets) and should validate settlement amount vs approved amount (no client check beyond > 0).
9. **`current_stage` optional field** on pending-review rows (`currentStage|current_stage`, value must be a REVIEW_STAGE key such as `APPROVAL`, `COORDINATOR`, `SETTLEMENT`); otherwise UI derives stage from `status`.
10. **Documents list rows.** Need `documentId|id`, `documentType|document_type`, `documentLabel`, `status`, `currentVersion.fileName|fileName`, plus whatever the shared `DocumentViewerModal` needs to fetch the file. Upload is multipart with `file`, `documentType`, optional `description`, optional `Idempotency-Key` header; file size/type limits are NOT enforced in the UI, so the backend must enforce and return clear messages. `documents_due_at` must be set server-side on submit (or on finalize-treatment for ongoing claims, recomputing a 7-day window from discharge).
11. **Document requirements rows.** `documentType, label, isRequired, conditionalRule (null | "hospitalized_or_surgery" | "medico_legal"), sortOrder`, seeded on first read; required-ness logic is duplicated client-side (`emergency` is not treated as hospitalized for `hospitalized_or_surgery`), so the backend rule for "document completeness" must match, including for auto-settlement.
12. **Hospitals list.** `GET /hospitals` for employees: UI expects `id, name, city, state, address, pincode, status ("active"/other), isNetworkHospital, cashlessAvailable, specialties[] (strings), contacts[{id,name,designation,phone,email,photo}], latitude, longitude, googleMapsUrl`. HospitalPicker (claim form) does not filter by status, so the backend should return only active hospitals to employees (or the UI must add the filter); HospitalDirectory filters `status != active` itself. Photos served at `${baseUrl}/storage/<photo>` (public disk).
13. **Members.** `GET /me/members` rows: `id, fullName|full_name, relationshipType (SELF|SPOUSE|CHILD|PARENT|FATHER|MOTHER), dateOfBirth, gender, status ("active"|"pending"|...)`. The self member must be present for self-claims (`relationshipType` "SELF"). Member change requests use `requestType` ADD/UPDATE/REMOVE (uppercase), `proposedValues{name,dateOfBirth,gender,relationshipType}`, `reason`, and are applied immediately (history rows still show `status`).
14. **Cards.** `GET /me/cards` rows: `id, memberId, memberName|member.fullName, relationshipType, status (active|expired|revoked|superseded), verifyToken, validFrom, validTo, cardNumber`. The public verify page needs `GET /cards/verify/{token}` unauthenticated. Photo and logo hosts need CORS for html2canvas capture.
15. **Profile call.** CardViewer requires the app's `/profile` payload (`name, photo, emp_code|punching_no|punching_code|employee_code, company_code, department, designation`) — outside the mediclaim API; a new app needs an equivalent employee profile endpoint.
16. **Timeline & decisions rows.** Timeline: `id, label|eventType, createdAt, actorName|actor.name, description`. Decisions: `id, stage (REVIEW_STAGE key), decision, decidedAt|createdAt, decidedByName|actor.name, approvedAmount, remarks`.
17. **Rule books.** `status` must be `published` (exact, case-insensitive) to be visible; rows need `languageId`/`language{id,name,nativeName}`, `versionLabel`, `effectiveFrom`, `items[{id, ruleText}]` already ordered. Only the first published rule book per language is displayed.
18. **Confidentiality ack** must exist for the legacy MANAGER path (`POST /claims/{id}/confidentiality-ack`).

## Open questions

1. Client shows no eligibility/limit preview (no floater balance, waiting-period, or per-claim cap) inside NewClaimRequestModal; `lookups.eligibility` (from `GET /me/coverage`) is fetched but is used only by the workspace shell, not by this modal. Whether the backend blocks submission on limits/waiting period was not examined here (backend out of slice).
2. Server-side file constraints for documents (mime types, max size, allowed extensions) are unknown; the UI imposes none (no `accept`, no size check).
3. The exact time zone / format of `admission_at`, `discharge_at`, `documents_due_at` in responses was not verified; edit-mode `datetime-local` prefill may render blank if ISO with seconds/offset.
4. Whether the backend returns `initial_symptom_other_detail` separately (edit mapper reads it) or only the combined `"OTHER: text"` string.
5. `DocumentViewerModal`, `Drawer`, `Modal`, `Badge`, `apiRequest` behaviors (shared app components) were not read; upload error shapes (`err.message`) depend on `apiRequest`.
6. `ClaimsTable.jsx` (not in slice) not read; its columns/actions are not documented here.
7. Legacy MANAGER/COORDINATOR/COMMITTEE/HR/DIRECTOR panels remain registered, but the live workflow appears to be the simplified APPROVAL + auto-settle path (comments cite `approveDirect()` / `autoSettleIfDocumentsComplete()`). Whether the backend still actually drives claims into COORDINATOR_VERIFICATION etc. is not confirmed from the frontend alone.
8. `DirectorDecisionPanel.test.jsx` asserts a payload without `approved_amount`, but the panel sends both `approvedAmount` and `approved_amount`; this test likely fails as written (not executed).
9. `dischargeDateMissing` is passed to DocumentChecklist but not consumed there; `Idempotency-Key` support in `uploadClaimDocument` is unused by the component — intent unknown.
10. `recordClaimDischarge` (`POST /claims/{id}/discharge`), `returnClaim`, `withdrawClaim` exist in the API client but no component in this slice calls them (withdraw/return UI, if any, lives in pages outside this slice).

---
