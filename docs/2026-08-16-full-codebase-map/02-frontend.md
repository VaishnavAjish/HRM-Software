# Web Frontend — `salary-slip-front/salary-slip-front` (React + Vite)

Real source lives at `salary-slip-front/salary-slip-front/src` — the outer `salary-slip-front/` folder also contains build artifacts (`main/`, `master/`, `dist/`, `android/`) which are not source.

## Routing (`src/App.jsx`)

Single `BrowserRouter`, all non-shell pages `React.lazy`-loaded. `ProtectedRoute` chain: authenticated → optional `requiredRole` → optional `requiredPermission` → **registry-driven `canRoute(path)`** check (resolves the URL through the server-issued permission-matrix route map, so every registered page is guarded even without an explicit `requiredPermission` prop) → mandatory employee-profile-completion redirect.

Top-level areas: `/login` (public), `/quiz/:token` (public, token-authed candidate assessment, no login), `/about-niss` (public marketing), `/careers/*` (public job board + candidate account portal), `/admin/*` (admin, role=admin), `/workforce/*` (admin, separate top-level prefix, gated on `workforce.job.read`), `/employee/*` (role=employee), `/agent/*` (role=agent).

Admin sub-areas: core (dashboard, employees, salary, attendance, appointments, trial-form, TDS, Form16, reports, profile, tickets), **HR** (dashboard, organization, recruitment-dashboard, hiring, assets, onboarding, performance, reports, exit, training, settings — each gated by its own `hr.*.read` permission), **Access Control** (users, roles, company-units, permission-matrix, policies, access-requests, delegations, emergency-access), **Organization** (8 consolidated tabbed workspaces: structure, org-chart, entities, positions, teams, job-architecture, analytics, governance — the underlying per-resource pages from earlier iterations are now reused as tabs inside these, with their old standalone routes retired to redirects).

## Global state (`src/context/**`)

- `AuthContext.jsx` — session in `sessionStorage`; portal (admin/agent/employee) resolved from the server's `ui.portals.*` snapshot with a legacy numeric-role fallback; super admin (`rawRole===0`) short-circuits the permission network call entirely and grants wildcard access; listens for an `auth:unauthorized` event but only force-logs-out on an **explicit** token-expired/invalid/blacklisted signal (permission-denied 401/403s are deliberately ignored — matches the documented anti-auto-logout fix in prior project memory).
- `CompanyContext.jsx` — multi-tenant scope switcher; Super Admin defaults to "All Companies," Master is locked to their own company, everyone else forced to their own company.
- `NotificationContext.jsx` — real server-backed feed (Socket.IO push + 30s poll fallback), **but still ships hardcoded seed data**: `INITIAL_GROUPS` (8 fabricated employee groups) and `SEED_ANNOUNCEMENTS` (one fabricated "Q3 Executive Town Hall" announcement) are live in code, unlike the notifications array itself (which a code comment says was deliberately emptied of 3 previously-fabricated events).
- `CandidateAuthContext.jsx` — separate identity space (token in `localStorage`) for the public `/careers` candidate portal.

## `src/hooks/useAuthorization.js`

`can(code)` (honors parent-permission chains via `requires` so the UI never offers an action whose parent permission is denied), `canRoute(path)`, `accessState`/`routeState` (3-state allow/deny/unassigned for UI messaging), `check(code, resource)` (live server call for resource-level decisions). `useModuleAvailability.js` fails open (unknown module defaults to "available").

## Pages by portal (grep-verified, all live-API-backed unless noted)

**Admin** (`pages/admin/**`, 69 pages): employee/salary/attendance/shift management, appointments, trial forms, TDS/Form16, Access Control (users/roles/company-units/policies/access-requests/delegations/emergency-access), full HR suite (dashboard, hiring workspace with requisitions/approval/assessment/job-portal/talent-pool tabs, onboarding workspace, assets, performance matrix, HR reports, exit management, training quizzes, interview/offer management, candidate pipeline), Organization (21 individual resource pages, now wrapped by 8 tabbed workspaces), Workforce Foundation (job taxonomy CRUD pages under `/workforce`, separate route prefix from `/admin`).

**Employee** (`pages/employee/**`, 8 pages): Dashboard, Payslips, Form16, Profile (incl. Aadhaar), Appointment, Raise/My Tickets, Security Center (password/session/MFA — heaviest employee page).

**Agent** (`pages/agent/**`): `AgentDashboard.jsx` is the only agent-specific page; agents also reuse the admin `TrialForm.jsx` and `Appointments.jsx` components directly via `/agent/trial-forms` and `/agent/appointments`.

**Public / candidate**: `Login`, `AppointmentModal` (extensively tested — 5+ dedicated test files for Aadhaar/photo/workflow edge cases), `TrialFormModal`, `CandidateQuiz` (rendered outside the app shell, no nav chrome during an assessment), `AboutNiss`, `CareersList`/`JobDetail`/`CandidateRegister`/`CandidateLogin`/`CandidateVerifyEmail`/`CandidateDashboard`.

## Features (`src/features/**`)

- `organization/` — generic `OrgResourceManager` (CRUD table/drawer) + `OrgWorkspaceTabs` shell driving the 8 organization workspaces, config-driven per resource type.
- `permissionMatrix/` — the full Permission Matrix admin UI (tree table, role panels, permission details panel, a **simulator** for dry-running a role's effective access, API-permissions tab, validation banner), backed by its own test suite.
- `workforce/` — CRUD-factory API services only (no dedicated components folder; UI lives under `pages/admin/workforce/`).

## Components (`src/components/**`, subfolder purposes)

`admin/` (bulk-upload validation UI for attendance/employee/salary), `authorization/` (`Can.jsx` gate component, `UserPicker`), `common/` (SEO manager), `documents/`, `form16/`, `forms/` (printable form templates, incl. Aadhaar-specific tests), `layout/` (`AppLayout`, `Sidebar`, `EnterpriseNav`, `CompanyScopeDropdown`), `notifications/`, `onboarding/` (generic DataTable/Stepper/Timeline primitives reused by the HR onboarding workspace), `payslip/`, `tickets/` (full support-ticket admin surface), `ui/` (design-system primitives).

## Confirmed mock/dead-code findings (verified in code)

1. **`src/data/mockData.js`** — fabricated employee/salary data. Confirmed **dead**: the only remaining reference anywhere is a code comment in `Reports.jsx` explaining its removal.
2. **`pages/admin/Reports.jsx`** — deliberately renders an "unavailable" empty state. Code comment states it previously rendered fabricated payroll figures from `mockData.js` and let an admin "export" invented numbers with a success toast; this was disabled as a data-integrity/trust risk pending real reporting endpoints. **Documented, intentional gap — not a bug.**
3. **`context/NotificationContext.jsx`** — `INITIAL_GROUPS` and `SEED_ANNOUNCEMENTS` still ship as live hardcoded seed state alongside the now-real notification feed (see above).
4. **`pages/admin/hr/ComingSoon.jsx`** — generic placeholder component, built but unused (not wired into any route).
5. **`utils/onboardingMocks.js`** — exists only as a test fixture (imported by one `.test.jsx` file), not by any production page.
6. A comment in `utils/api.js` (`hrApi`, candidate-documents section) contrasts real candidate-document uploads against what it calls the Onboarding module's "fabricated/stubbed document records" — flagged for verification against current `onboarding/DocumentsTab.jsx` behavior; no literal mock array was found in that file itself, so the underlying gap (if any) may be server-side rather than a frontend mock.

## Not found

No other mock/demo-data patterns were found across the 69 admin pages, 8 employee pages, or feature modules beyond the six items above — the frontend agent explicitly grepped for mock/dummy/hardcoded/stub/fabricated/synthetic markers across all page files.
