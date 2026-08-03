# Salary Slip Frontend (`salary-slip-front/salary-slip-front/`)

Last verified against source: 2026-08-03.

The top-level `salary-slip-front/` holds only build output and config. All
source, commands and env files live in the nested `salary-slip-front/`.

## Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | React | 19.2 |
| Build Tool | Vite | 7.x |
| Styling | Tailwind CSS | 3.4 |
| Routing | React Router | 7.14 |
| Data Grid | AG Grid Community | 35.2 |
| Charts | Recharts | 3.8 |
| PDF Generation | html2canvas + jsPDF 4 + jspdf-autotable | - |
| Print | react-to-print | 3.3 |
| Excel | xlsx (SheetJS) | 0.18 |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable | 6.3 / 10.0 |
| Camera | @capacitor/camera | 8.2 |
| QR Codes | qrcode.react | 4.2 |
| Date Picker | react-tailwindcss-datepicker | 2.0 |
| Icons | Lucide React | 1.14 |
| Notifications | react-hot-toast | 2.6 |
| UI Components | Headless UI React | 2.2 |
| Mobile | Capacitor 8 (Android) | 8.4 |
| PWA | vite-plugin-pwa | 1.2 |
| Testing | Vitest | - |

---

## Multi-Company Architecture

`vite.config.js` runs `git rev-parse --abbrev-ref HEAD` at build time and
injects four build constants.

| Branch | `__COMPANY_MODE__` | Company | Theme | App title | Output dir |
|--------|--------------------|---------|-------|-----------|------------|
| `nidhi-impex` | `nidhi-impex` | Nidhi Impex | amber | Nidhi Impex – HRMS | `nidhi-impex/` |
| `silver-star` | `silver-star` | Silver Star Diam | sky | Silver Star – HRMS | `silver-star/` |
| `master` / other | `all` | Both | indigo | NISS HRMS | `master/` |

`config/companyConfig.js` holds each company's display name, initials, logo,
payslip variant, address lines (with per-unit overrides), units and Excel
salary-template headers. Units: Nidhi Impex = Shreeji, Ichapur; Silver Star =
Daduk, Ichapur.

Scope is expressed as `companyId::unit` (`buildCompanyScopeKey`). `api.js`
merges `company_code` and `unit` into request queries automatically;
`all-companies` is sent as `company_code=all`. Writes never send `all` —
`resolveWriteCompanyId()` picks a concrete company.

---

## Directory Structure

```
salary-slip-front/salary-slip-front/
+-- src/
|   +-- main.jsx                    # Entry point (applies theme color)
|   +-- App.jsx                     # Routes + guards (297 lines)
|   +-- index.css                   # Tailwind + brand themes + AG Grid theming
|   +-- config/
|   |   +-- companyConfig.js        # Company/unit resolution & scope keys
|   +-- context/
|   |   +-- AuthContext.jsx         # Auth state, permission snapshot
|   |   +-- CompanyContext.jsx      # Company scope switching
|   |   +-- ThemeContext.jsx        # Dark mode toggling
|   |   +-- theme-context.js
|   +-- hooks/
|   |   +-- useAuthorization.js     # can() / check() against permission codes
|   |   +-- useModuleAvailability.js# GET /api/modules gate for optional modules
|   |   +-- useInstallPWA.js        # PWA install prompt + iOS guide
|   |   +-- useGridHeaderContextMenu.js
|   |   +-- useIsMobile.js
|   |   +-- usePhotoCapture.jsx
|   +-- utils/
|   |   +-- api.js                  # API client (1777 lines)
|   |   +-- exportUtils.js          # Excel/CSV/PDF export (2047 lines)
|   |   +-- payslipUtils.js         # Payslip data utilities (531 lines)
|   |   +-- form16Utils.js          # Form 16 calculations
|   |   +-- pdfUtils.js             # PDF generation helpers
|   |   +-- aadhaar.js              # Masking / stored-reference helpers
|   |   +-- authSession.js          # Cross-tab sign-out, session clearing
|   |   +-- photoCapture.js
|   |   +-- validation.js
|   |   +-- url.js                  # Base URL resolution by VITE_ENV
|   +-- components/
|   |   +-- layout/
|   |   |   +-- AppLayout.jsx       # Sidebar + header shell
|   |   |   +-- Sidebar.jsx         # Permission-driven nav (479 lines)
|   |   |   +-- Header.jsx
|   |   |   +-- CompanyScopeDropdown.jsx
|   |   +-- admin/
|   |   |   +-- EmployeeMasterTable.jsx        (945 lines)
|   |   |   +-- PendingEmployeesTab.jsx        (530 lines)
|   |   |   +-- BulkEmployeeValidation.jsx
|   |   |   +-- BulkSalaryValidation.jsx
|   |   |   +-- BulkAttendanceValidation.jsx
|   |   |   +-- UploadBatchPanel.jsx
|   |   |   +-- UploadReportModal.jsx
|   |   +-- authorization/
|   |   |   +-- Can.jsx             # Declarative permission gate
|   |   +-- documents/
|   |   |   +-- EmployeeDocuments.jsx
|   |   |   +-- DocumentUploadForm.jsx
|   |   |   +-- DocumentViewerModal.jsx
|   |   +-- forms/
|   |   |   +-- PrintableForm.jsx              (530 lines)
|   |   |   +-- PrintableTrialForm.jsx
|   |   |   +-- trial-form-helpers.js
|   |   +-- form16/Form16Document.jsx          (1120 lines)
|   |   +-- payslip/PayslipDocument.jsx        (556 lines)
|   |   +-- rbac/SimpleCrudPage.jsx
|   |   +-- ui/                     # Badge, Button, Card, Dropdown, Modal,
|   |   |                           # Pagination, SearchBar, Skeleton,
|   |   |                           # MonthYearPicker, CameraCaptureModal,
|   |   |                           # GridHeaderContextMenu
|   |   +-- ModernDatePicker.jsx               (505 lines)
|   +-- pages/
|   |   +-- auth/                   # Login, AppointmentModal,
|   |   |                           # AppointmentDocumentsStep, TrialFormModal,
|   |   |                           # WelcomePopup, documentTypes,
|   |   |                           # appointmentRouteState
|   |   +-- admin/                  # Core admin pages + AdminModals/
|   |   |   +-- hr/                 # HrDashboard, HiringProcess,
|   |   |                           # InterviewManagement, OfferManagement,
|   |   |                           # CandidatePipeline, AssetAllocation,
|   |   |                           # PerformanceMatrix, EmployeeOnboarding,
|   |   |                           # ExitManagement, HrReports, HrSettings,
|   |   |                           # ComingSoon
|   |   +-- employee/               # Dashboard, Payslips, Form16, Profile,
|   |   |                           # EmployeeAppointment
|   |   +-- agent/AgentDashboard.jsx           (691 lines)
|   +-- data/mockData.js
|   +-- test/setup.js
+-- .env / .env.production
+-- vite.config.js
+-- tailwind.config.js
+-- capacitor.config.json (top level)
```

**148 source files, ~43,500 lines. 3 contexts, 6 hooks, 22 tests.**

---

## Code Splitting

Every page is `React.lazy`. Only `Login` and `AppLayout` are eager: the shell
renders on every authenticated route, and Login is the first paint for a
signed-out visitor. Before splitting, the entry chunk was ~2.5 MB because
opening any screen pulled in charts, grids, spreadsheet and PDF writers.
A `Suspense` boundary renders `RouteLoader` during route fetch.
`ag-grid` is a separate manual chunk in the Rollup config.

---

## Route Map

### Auth (Public)
| Path | Page | Description |
|------|------|-------------|
| `/login` | Login | Email/password login, forgot-password OTP flow |
| `/` | Redirect | By role: `/admin`, `/agent`, or `/employee` |
| `*` | Redirect | `/login` |

### Admin Routes (`requiredRole="admin"`, under `/admin` with `AppLayout`)

**Core**
| Path | Page | Lines |
|------|------|-------|
| `/admin` | Dashboard | 460 |
| `/admin/employees` | EmployeeManagement | 1688 |
| `/admin/employees/add` | AddEmployeePage | 1006 |
| `/admin/salary` | SalaryManagement | 1158 |
| `/admin/salary/upload` | SalaryUploadPage | - |
| `/admin/attendance` | AttendanceView | 895 |
| `/admin/attendance/shift` | ShiftManagement | 960 |
| `/admin/appointments` | Appointments | 2341 |
| `/admin/trial-form` | TrialForm | 1452 |
| `/admin/tds/calculation` | TdsCalculation | - |
| `/admin/form16` | Form16 | - |
| `/admin/reports` | Reports | - |
| `/admin/admins` | Settings | - |
| `/admin/profile` | AdminProfile | 491 |

**HR module** (each gated on a permission code; menu also gated on
`useModuleAvailability("hr")`)
| Path | Page | Permission |
|------|------|-----------|
| `/admin/hr` | HrDashboard | `hr.dashboard.read` |
| `/admin/hr/hiring` | HiringProcess | `hr.requisition.read` |
| `/admin/hr/assets` | AssetAllocation | `hr.asset.read` |
| `/admin/hr/performance` | PerformanceMatrix | `hr.performance.read` |
| `/admin/hr/reports` | HrReports | `hr.report.read` |
| `/admin/hr/exit` | ExitManagement | - |
| `/admin/hr/settings` | HrSettings | - |

`InterviewManagement`, `OfferManagement`, `CandidatePipeline` and
`EmployeeOnboarding` exist as components but have no route yet.

**Access Control — removed**

The `Access Control` menu group and all ten of its routes were removed:
`/admin/rbac`, `/admin/rbac/users`, `/admin/rbac/permission-matrix`,
`/admin/rbac/audit-logs`, `/admin/access-control/permission-matrix`,
`/admin/authorization` and its five sub-views. `pages/admin/rbac/`,
`pages/admin/access-control/` and `components/rbac/` are deleted.

Permissions are still resolved and enforced — only the screens for editing them
are gone. Grants are now made by seeder or by writing `permission_dimensions`
directly. See "Authorization Model" below for what still runs.

### Employee Routes (`requiredRole="employee"`)
| Path | Page |
|------|------|
| `/employee` | Dashboard |
| `/employee/payslips` | Payslips (499 lines) |
| `/employee/form16` | Form16 |
| `/employee/profile` | Profile (1098 lines) |
| `/employee/appointment` | EmployeeAppointment |

### Agent Routes (`requiredRole="agent"`)
| Path | Page |
|------|------|
| `/agent` | AgentDashboard |
| `/agent/trial-forms` | TrialForm (shared with admin) |
| `/agent/appointments` | Appointments (shared with admin) |

---

## Route Guards

`ProtectedRoute` accepts both `requiredRole` and `requiredPermission`, and
applies them in order:

```
if initializing               -> RouteLoader ("Checking session...")
if !isAuthenticated           -> /login (preserving location state)
if requiredRole mismatch      -> role fallback (/admin | /agent | /employee)
if !can(requiredPermission)   -> role fallback
if role === "employee" && profile incomplete && path !== /employee/profile
                              -> /employee/profile
```

The profile-completeness gate checks 18 fields (name, email, phone, dob,
address, city, district, state, pin, aadhar, pan, bank name/IFSC/account,
gender, department, designation, joining date). Aadhaar is tested for presence
via `hasStoredAadhaar()`, not value. While incomplete, `Sidebar` also hides
every employee nav item except Profile.

---

## Authorization Model

Two permission systems are layered. `AuthContext` resolves them on login and on
session restore:

1. `GET /api/v1/authorization/me` — the enterprise snapshot. Stored as
   `user.authorization.permissions[code] = { allowed, ... }`.
2. `GET /api/my-permissions` — the legacy map. Stored as
   `user.permissions[key] = "no_access" | "read" | "read_write"`.
3. Failure of both leaves `permissions: {}` and an empty snapshot.

`rawRole === 0` (Super Admin) short-circuits to `permissions: { "*": "read_write" }`.

`useAuthorization().can(code)` returns true when `permissions["*"] ===
"read_write"` or the snapshot marks the code allowed. `check(code, resource)`
calls `POST /api/v1/authorization/check` for a server-side decision on a
specific record. `<Can>` wraps `can()` declaratively.

`Sidebar.getAdminNav()` maps legacy page keys to permission codes
(`dashboard` → `ui.admin.dashboard.view`, `salary` → `ui.admin.salary.view`,
`tds`/`form16` → `payroll.payslip.read`, and so on) and falls back to the legacy
map when no snapshot is present.

---

## API Client (`utils/api.js`, 1777 lines)

Fetch-based, with `CapacitorHttp` substituted on Android/iOS to bypass CORS.

- Base URL from `utils/url.js`: `VITE_ENV=DEV` → `VITE_API_BASE_URL`,
  `STAG` → `VITE_STAGING_URL`, otherwise the branch-injected `__PROD_API_URL__`
- `cache: "no-store"` on every request
- Handles both error shapes: `{ message }` / `{ error: "string" }` and the v1
  `{ error: { code, message, details } }`
- `parseApiJsonResponse()` recovers from a response carrying two concatenated
  JSON documents, returning the last one rather than throwing a SyntaxError
- 401 on a request that carried an `Authorization` header dispatches
  `auth:unauthorized`; a failed login (no header) does not
- FormData support for uploads

### Exported API objects

| Object | Covers |
|--------|--------|
| `authApi` | login, logout, register, profile, change password, onboarding steps (`new-emp_code`, `new-email`, `new-email-otp`, `new-password`), employee import, agents, candidate accounts |
| `salaryApi` | slips, employees, departments, dashboards, upload batches, attendance grid/cell/import, shifts CRUD + assign, salary upload, account master |
| `rbacApi` | `my-permissions` (AuthContext, every login), `rbac/settings` (admin Dashboard), `rbac/user-roles` (admin Settings). `roleApi` and the rest of `rbacApi` were removed with the Access Control screens |
| `authorizationApi` | `/v1/authorization/me` and `/check` only — the login-path snapshot and per-record decisions. The management calls (roles, matrix, clone, scopes, policies, access requests, audit, analytics, simulate) went with the Access Control screens |
| `documentApi` | legacy `/documents` (types, preview-name, upload, search, delete) |
| `documentV1Api` | S3-backed `/v1/documents` (types, health, list, versions, upload, replace, view-url, download-url, delete, restore) |
| `appointmentV1Api` | `/v1/appointments` create, update, get, complete, documents, reveal Aadhaar |
| `confidentialExportApi` | Aadhaar export authorization, print payload, watermarked PDF blob |

Presigned URLs are requested fresh at the moment of use and never persisted.

---

## Context Providers

### AuthContext.jsx
- Session in `sessionStorage` under `auth_user`; sign-out also clears the
  localStorage company/branch scope via `clearStoredSession()`
- Cross-tab sign-out through `broadcastSignOut` / `subscribeToSignOut`
- Role resolution: `type='agent'` or `role=4` → `agent`; `role` 0/1/2 or
  `'admin'` → `admin`; otherwise `employee`. `rawRole` keeps the integer
- `buildAuthUser()` normalizes the varying API user shapes
- Session restore on load via `GET /api/profile`, then permission resolution
- Auto-logout on the `auth:unauthorized` window event

### CompanyContext.jsx
Company + unit scope switching; exposes `company`, `companyId`, `scopeLabel`,
`isAllCompanies` to the sidebar, header dropdown and API layer.

### ThemeContext.jsx
Dark/light toggle, persisted to `localStorage.theme`, applied as a `dark` class
on `<html>`.

---

## Design System

### Color
`tailwind.config.js` defines a fixed `primary` blue plus `brand-50…900` bound to
CSS custom properties as raw RGB channels
(`rgb(var(--brand-600) / <alpha-value>)`), so opacity modifiers still work.
`index.css` defines four themes as `[data-theme]` blocks — indigo (default),
amber, rose, sky — each also setting structural `--sidebar-bg` and `--page-bg`.
Dark mode is class-based and overrides only the structural variables.

### Typography
Inter (Google Fonts), `-webkit-font-smoothing: antialiased`.

### Shell
- Sidebar 280px, collapsing to 80px; state persisted to
  `localStorage.salaryms_sidebar_collapsed`
- Sidebar stays near-black in both themes, with a brand accent stripe on top
  and an avatar-initials user card
- Accordion sub-menus; active state resolved against both pathname and a
  `?modal=` query parameter
- Header title comes from the `pageTitles` map in `AppLayout.jsx`, kept in sync
  by hand with the sidebar labels
- Below `lg`, the sidebar becomes an overlay drawer with a backdrop

### Components
`rounded-xl` cards with `border-gray-200` and `shadow-sm`. `Button` has six
variants (primary, secondary, outline, danger, ghost, success) and three sizes.
`StatCard` renders a tinted icon tile in five colors with an optional
percentage-change line. Skeleton shimmer for loading. Toasts are dark-styled
with green/red icon themes.

### AG Grid
Themed through `--ag-*` variables on `.employee-ag-grid` / `.salary-ag-grid`,
with a full dark-mode override, uppercase 12px headers, brand-tinted filter
buttons, sticky headers (`top: 64px`) and centered, scaled-down selection
checkboxes.

### Accessibility
Contrast is checked in places — the sidebar version label uses gray-400 (~7.3:1)
rather than gray-500 (3.95:1, fails AA on that background). `aria-label` on icon
buttons, `aria-hidden` on decorative icons, focus rings on buttons.

---

## Mobile & PWA Support

### Capacitor 8 Android
| Script | Effect |
|--------|--------|
| `npm run mobile:build` | Dev build + `cap sync` |
| `npm run mobile:build:prod` | Production build + `cap sync` |
| `npm run mobile:run:android` | Build + run on device/emulator |
| `npm run mobile:sync` | `cap sync` only |

Native builds route HTTP through `CapacitorHttp` to avoid CORS.

### Safe areas
`--safe-area-inset-*` custom properties are set from `env(safe-area-inset-*)`
as a fallback; Capacitor's SystemBars plugin overwrites them inline on `<html>`
because Android WebView's `env()` is unreliable before Chromium 140. `header`,
`aside`, `main`, `.modal-overlay` and `.safe-top-bar` consume them.

### PWA
Service worker via `vite-plugin-pwa` with `registerType: "autoUpdate"`,
precaching all built assets up to 4 MB, `CacheFirst` runtime caching for Google
Fonts (1 year), SPA navigation fallback to `index.html`, and outdated-cache
cleanup. `devOptions.enabled: false` — the service worker is production-only so
Workbox's cache does not mask fixes during development.

An iOS install guide modal is shown from the sidebar via `useInstallPWA`.

---

## Responsive Behaviour

- `max-width: 768px`: multi-section form modals stack vertically and their
  vertical tab rail becomes a horizontal scroll strip; AG Grid min-height rises
  to 350px and cell padding drops to 12px
- `max-width: 640px`: header action groups go full width and their buttons flex
- `useIsMobile` drives card-vs-grid rendering on list pages
- `touch-action: manipulation` and transparent tap highlight globally

---

## Environment Configuration

`.env` keys:
```
VITE_ENV                     # DEV | STAG | PROD
VITE_API_BASE_URL            # used when VITE_ENV=DEV
VITE_PROD_URL_MASTER
VITE_PROD_URL_NIDHI_IMPEX
VITE_PROD_URL_SILVER_STAR
```

The production URL is selected by branch at build time, not at runtime.
`baseUrl` strips a trailing `/api` so the API layer can append its own.

---

## Testing

Vitest with `src/test/setup.js`. 22 test files, concentrated on Aadhaar masking
and display (`utils/aadhaar.test.js`, `validation.aadhaar.test.js`, and
`.aadhaar.test.jsx` suites for Profile, EmployeeManagement, Appointments and
PermissionMatrix), the appointment workflow (`AppointmentModal.workflow`,
`.effects`, `.empCodePhoto`, `PhotoRetry`, `OptionalFields`,
`appointmentDocumentsApi`), auth/session (`AuthContext`, `AuthSession`), and
API response parsing (`api.response.test.js`).
