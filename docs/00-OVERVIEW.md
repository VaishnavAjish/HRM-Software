# Repository Overview: HRMS (Human Resource Management System)

## Repository: F:\HRMS oldd

Last verified against source: 2026-08-03.

This repository contains **7 sub-projects**. Three form the live product; the
rest are standalone drops that have not been developed since they were added.

---

## Project Summary Table

| # | Project | Directory | Tech Stack | Port | Database | Status |
|---|---------|-----------|------------|------|----------|--------|
| 1 | Salary Slip Frontend | `salary-slip-front/salary-slip-front/` | React 19, Vite 7, Capacitor 8, PWA | 5175 | - | **Active** |
| 2 | Salary Slip Backend | `salary-slip-bac/` | Laravel 11, PHP 8.2 | 8000 | PostgreSQL | **Active** |
| 3 | Salary Slip Node API | `salary-slip-node/` | Fastify 5, Prisma 6, TypeScript | 8001 | PostgreSQL | **Active (in migration)** |
| 4 | HRFlow Pro Frontend | `client/` | React 18, TypeScript, Vite 5 | 5173 | - | Dormant |
| 5 | HRFlow Pro Backend | `server/` | Express 4, TypeScript, Mongoose 8 | 5000 | MongoDB | Dormant |
| 6 | Enterprise RBAC Backend | `enterprise-rbac/backend/` | Express 5, TypeScript, Prisma 7 | 5000 | PostgreSQL | Dormant |
| 7 | Enterprise RBAC Frontend | `enterprise-rbac/frontend/` | React 19, TypeScript, Vite 8 | - | - | Dormant |

### Activity

| Directory | Commits | Last commit |
|-----------|---------|-------------|
| `salary-slip-front/` | 55 | 2026-08-03 |
| `salary-slip-bac/` | 53 | 2026-08-03 |
| `salary-slip-node/` | 8 | 2026-08-03 |
| `enterprise-rbac/` | 1 | 2026-07-29 |
| `client/` | 2 | 2026-07-27 |
| `server/` | 2 | 2026-07-27 |

The root `README.md` describes HRFlow Pro (`client/` + `server/`), which is not
the product. The root `package.json` describes the product: its `dev` script
runs `salary-slip-front/salary-slip-front` and `salary-slip-bac` together.

### Directory nesting

`salary-slip-front/` at the top level contains only build output (`master/`,
`nidhi-impex/`, `silver-star/`, `android/`, `dist/`, `dev-dist/`) and config.
The application source is one level deeper, at
`salary-slip-front/salary-slip-front/`. All frontend commands must be run from
the nested directory.

---

## Project 1: Salary Slip Frontend

### Technology Stack
- **Core**: React 19.2, Vite 7, Tailwind CSS 3.4
- **Routing**: React Router 7.14 (all pages lazy-loaded except Login + AppLayout)
- **Data Grid**: AG Grid Community 35.2
- **Charts**: Recharts 3.8
- **PDF/Print**: html2canvas, jsPDF 4, jspdf-autotable, react-to-print
- **Excel**: xlsx (SheetJS)
- **Drag & drop**: @dnd-kit/core, @dnd-kit/sortable
- **Camera**: @capacitor/camera (employee photo capture)
- **QR**: qrcode.react
- **Mobile**: Capacitor 8 Android
- **PWA**: vite-plugin-pwa with Workbox service worker
- **Testing**: Vitest

### Modules (148 source files)

| Module | Pages |
|--------|-------|
| Auth | Login, AppointmentModal, AppointmentDocumentsStep, TrialFormModal, WelcomePopup |
| Admin core | Dashboard, EmployeeManagement, AddEmployeePage, SalaryManagement, SalaryUploadPage, Appointments, TrialForm, Reports, AdminProfile, Settings |
| Attendance | AttendanceView, AttendanceUpload, DailyAttendance, ShiftManagement |
| TDS | TdsCalculation, Form16 |
| HR | HrDashboard, HiringProcess, InterviewManagement, OfferManagement, CandidatePipeline, AssetAllocation, PerformanceMatrix, EmployeeOnboarding, ExitManagement, HrReports, HrSettings |
| ~~Access Control~~ | Removed — the whole menu group, its ten routes and all six page components are gone. Permissions are still enforced; only the screens for editing them were withdrawn |
| Documents | EmployeeDocuments, DocumentUploadForm, DocumentViewerModal |
| Employee | Dashboard, Payslips, Form16, Profile, EmployeeAppointment |
| Agent | AgentDashboard |

### Multi-Company Architecture
`vite.config.js` reads the active Git branch at build time and injects
`__COMPANY_MODE__`, `__APP_LABEL__`, `__APP_COLOR__`, `__PROD_API_URL__`:

| Branch | Company | Theme | Output dir |
|--------|---------|-------|------------|
| `nidhi-impex` | Nidhi Impex (units: Shreeji, Ichapur) | amber | `nidhi-impex/` |
| `silver-star` | Silver Star Diam (units: Daduk, Ichapur) | sky | `silver-star/` |
| `master` / other | NISS HRMS (both companies) | indigo | `master/` |

At runtime, `company_code` and `unit` are appended to nearly every request.

---

## Project 2: Salary Slip Backend

### Technology Stack
- **Framework**: Laravel 11+ (PHP 8.2)
- **Database**: PostgreSQL (only supported engine — see "SQLite removal" below)
- **Auth**: JWT (tymon/jwt-auth) + Laravel Sanctum
- **Excel**: Maatwebsite/Laravel Excel
- **Storage**: League Flysystem (local + S3)
- **Testing**: PHPUnit 11

### Feature Areas
- **Salary slips**: Excel bulk import with auto-column detection, month/year
  parsing, component-summed gross/net calculation
- **Employees**: CRUD, Excel import, bank account master import
- **Attendance**: month grid, per-cell upsert, bulk import
- **Shifts**: CRUD and assignment
- **HR / Talent**: job requisitions, candidates and stage history, interviews
  with panelists and feedback, offers with revisions, assets and allocations,
  performance cycles/goals/reviews, HR reports
- **Documents**: legacy local-disk API plus an S3-backed `/v1/documents` API
  with versioning, presigned view/download URLs, soft delete and restore
- **Aadhaar handling**: encrypted storage with secure references, gated reveal,
  authorised confidential PDF/print export with audit
- **Enterprise authorization**: 11 `authorization_*` tables, policy engine,
  scope matching, field/row security, separation of duties, delegations,
  emergency grants, access requests, decision audit and simulation
- **Legacy RBAC**: roles, permissions, permission groups, permission dimensions
- **Upload tracking**: batches with per-row pass/fail reporting
- **Module availability**: `GET /api/modules` reports which optional module
  schemas exist so the client can omit unbuilt navigation

### Counts
- 26 controllers, 37 models, 4 middleware, 19 service classes
- 56 migrations, 4 seeders
- `routes/api.php`: 413 lines

---

## Project 3: Salary Slip Node API

An incremental replacement for the Laravel backend. Modules are ported one at a
time and mounted in `src/app.ts`.

- **Framework**: Fastify 5 with @fastify/helmet, cors, rate-limit, multipart
- **ORM**: Prisma 6 against PostgreSQL
- **Compatibility**: `src/lib/laravel/` reimplements Laravel's hash, JWT, crypt
  and time semantics so both backends accept the same tokens
- **Ported modules**: auth, account, password reset, employees (+ import),
  shifts, agents, trial forms, profile/dashboard, authorization
- **Authorization**: engine, condition evaluator, scope matcher, row/field
  security, schema readiness probing. Decision endpoints only — the management
  surface and the `masters` module went with the Access Control removal
- **Schema ownership**: `prisma/sql/0001`–`0004` own the production
  `authorization_*` schema, tracked in `_authz_migrations` (not Laravel's
  `migrations` table)
- **Testing**: Vitest, plus a `parity-check` script against PHP fixtures

---

## Projects 4-5: HRFlow Pro (`client/` + `server/`)

Standalone React + Express/MongoDB HRMS. Added 2026-07-27 and unchanged since.
Not wired to the salary-slip stack and not part of the running product.
See `01-HRFLOW-PRO-FRONTEND.md` and `02-HRFLOW-PRO-BACKEND.md`.

---

## Projects 6-7: Enterprise RBAC (`enterprise-rbac/`)

Standalone Express 5 + Prisma RBAC reference implementation with its own React
frontend. Added 2026-07-29 and unchanged since. The authorization concepts were
reimplemented inside `salary-slip-bac` and `salary-slip-node` rather than
consumed from here. See `03-ENTERPRISE-RBAC.md`.

---

## Live Product Architecture

```
  React SPA (:5175)          PWA + Capacitor Android
        |
        | JWT / fetch (CapacitorHttp on native)
        v
  Laravel /api (:8000)  <--- salary-slip-node (Fastify) parity-tested
        |                    replacement, not yet fronting traffic
        | Eloquent / Prisma
        v
  PostgreSQL niss_hrms
```

### Deployments

| | Serves | Database |
|---|---|---|
| `F:\HRMS oldd` | dev / git repo | PostgreSQL `niss_hrms` |
| `E:\HRMS Nidhi` | LAN `192.168.1.53:8000` | PostgreSQL `niss_hrms` (shared) |
| AWS `niss.pro` | public site | PostgreSQL — **cutover pending**, see below |

### SQLite removal

SQLite is no longer a supported engine. The `sqlite` connection is gone from
`config/database.php`, the default connection is `pgsql`, and the test suite
runs against a real PostgreSQL (`niss_hrms_test`) instead of an in-memory
database — SQLite accepted SQL that Postgres rejects, so a green suite proved
nothing about production.

Enforcement does not live in `config/database.php`. Laravel merges its own
vendor config file over the application's, so the `sqlite` connection reappears
in the merged array however thoroughly that file is pruned.
`AppServiceProvider::refuseUnsupportedDatabase()` is what actually stops a
non-`pgsql` connection: the application throws on boot rather than silently
creating an empty SQLite file.

> **Read before the next AWS deploy.** That guard lives in `app/`, which the
> deploy copies. `config/` is *not* copied (see the deploy steps above), so on
> AWS the guard arrives without the config change alongside it. If the AWS
> `.env` is not already `DB_CONNECTION=pgsql`, the deploy takes the site down
> on boot. Check that `.env` on the server *first* — this repo cannot verify it.

Cutting a host over to PostgreSQL means: provision PostgreSQL, point `DB_*` at
it, `php artisan migrate --force`, import the data, and reset every identity
sequence to `max(id)` — a copied table leaves its sequence at 1 and the next
insert collides with an existing row.

A change committed here is not live until deployed. The PostgreSQL database is
shared between the F: and E: deployments, so schema changes made from this repo
take effect for the LAN deployment immediately. AWS shares neither files nor
database.

---

## Running the Projects

### Salary Slip (product)
```bash
# From repo root
npm run dev:client   # Frontend on port 5175
npm run dev:server   # Laravel on port 8000
npm run dev          # Both

# Node API
cd salary-slip-node && npm run dev
```

Frontend commands must run from `salary-slip-front/salary-slip-front`.

### HRFlow Pro
```bash
cd client && npm run dev    # port 5173
cd server && npm run dev    # port 5000
```

### Enterprise RBAC
```bash
cd enterprise-rbac/backend && npm run dev
cd enterprise-rbac/frontend && npm run dev
```

---

## Document Index

| File | Covers |
|------|--------|
| `00-OVERVIEW.md` | This file |
| `01-HRFLOW-PRO-FRONTEND.md` | `client/` (dormant) |
| `02-HRFLOW-PRO-BACKEND.md` | `server/` (dormant) |
| `03-ENTERPRISE-RBAC.md` | `enterprise-rbac/` (dormant) |
| `04-SALARY-SLIP-FRONTEND.md` | React app: routes, authorization, design system, PWA |
| `05-SALARY-SLIP-BACKEND.md` | Laravel API: endpoints, middleware, schema, security |
| `06-PAGE-CONNECTIONS-AND-ROUTES.md` | Route maps, navigation, data flows, data model |
| `07-ANDROID-NATIVE-CLONE-SPEC.md` | Native Android rebuild specification |
| `08-SALARY-SLIP-NODE.md` | Fastify API: modules, schema ownership, scripts |
| `AUDIT-2026-08-03.md` | Security and correctness audit |
| `STABILIZATION-2026-08-03.md` | Stabilization work log |
| `INCIDENT-2026-08-03-authz-rollback.md` | Authorization rollback incident |
| `REMEDIATION-authz-rollback.md`, `RECOVERY-authz-hardening.md` | Follow-up |
| `MIGRATION-REPORT.md` | Migration state |
| `repair/*.sql` | Repair scripts |

---

## Seed Data

`admin@niss.pro` / emp_code `1000000002` (Super Admin), set by `DatabaseSeeder`
on first seed. Change after first login.

The legacy `admin@superadmin.com` and `devlopertest@gmail.com` super-admin
accounts were removed by the
`2026_07_29_000001_remove_legacy_super_admin_accounts` migration.
