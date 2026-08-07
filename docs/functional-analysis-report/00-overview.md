# 1. Project Overview

> **Methodology note (applies to this entire documentation set):** every statement below is derived from reading the actual source code of this repository (`salary-slip-bac` for the backend, `salary-slip-front/salary-slip-front` for the frontend) as of **2026-08-07**. No feature, workflow, or integration has been invented. Where the code did not make something unambiguous, this is stated explicitly as *"Unable to determine from source code"* rather than guessed. Per project memory, this working copy (`HRMS oldd`) is a separate codebase from the "Salary-Management-Portal" system that is understood to be the live production deployment elsewhere — this report documents **only what is in this repository**, not live production behavior, uptime, or real user data.

## 1.1 Product Name

The codebase has no single formal product name embedded in it. It is referred to internally as:
- **"Salary Slip" system** — the two deployable folder names are `salary-slip-bac` (backend) and `salary-slip-front` (frontend), and the oldest and most complete data model in the database (`salary_slips`) reflects this origin.
- The application has since grown far beyond payslips into a general **Human Resource Management System (HRMS)** with hiring/recruitment (ATS), onboarding, performance management, asset management, attendance/shift management, a support-ticket helpdesk, and an enterprise-grade authorization platform.
- The root `README.md` is stale boilerplate from an unrelated abandoned scaffold ("HRFlow Pro", Node/Express/MongoDB) and does not describe this application — it should not be treated as documentation.

**Recommendation for registration purposes:** the product should be named for what it now is — an integrated HRMS with payroll, hiring, onboarding, performance, asset, attendance, and support-desk modules — rather than "Salary Slip," which undersells its current scope. Final naming is a business decision, not something inferable from code.

## 1.2 Product Purpose

The system is a multi-tenant (multi-company) employee lifecycle and payroll administration platform. It digitizes and centralizes:
- Pre-employment intake (Appointment forms, Trial forms, candidate recruitment pipeline)
- Employee master data and document management (identity documents, Aadhaar handling, bank details)
- Monthly payroll slip generation/import/distribution and Form 16 tax certificates
- Attendance and shift tracking
- A structured hiring pipeline (requisitions → candidates → interviews → offers → onboarding)
- Employee performance management (cycles, goals, reviews)
- IT/physical asset allocation tracking
- Employee exit/resignation workflow
- An internal support-ticket helpdesk
- Fine-grained, auditable role/permission administration (three coexisting authorization layers, see [System Architecture](01-architecture.md))

## 1.3 Business Problem Solved

Based on the data model and workflows implemented, the system replaces manual/spreadsheet-based HR and payroll processes with:
- A single system of record for employee master data across multiple legal entities/companies (`company_code`) and sub-units (`unit`) — evidenced throughout the schema and query-scoping logic (`ScopesCompany` trait, `ScopeMatcher`, `AuthorizedUserQuery`).
- Bulk Excel-based import/export for the highest-volume manual tasks (salary slips, employee master data, attendance, bank account details) — each with a dedicated `UploadBatch`/`UploadBatchRow` audit trail so a bad import can be traced row-by-row.
- A single confidential, access-controlled home for sensitive identity data (Aadhaar numbers — India's national ID) — see [Security Audit](16-security-audit.md) for the corrected, evidence-based account of how disclosure actually works today.
- A structured, auditable recruitment pipeline in place of ad hoc spreadsheets/email for hiring.
- A permission system granular enough to restrict access down to individual UI fields/columns (see [Roles & Permissions](05-roles-permissions.md)).

## 1.4 Target Industry

Indian payroll/HR compliance context is evident throughout the code: Aadhaar card handling, PAN card fields, Form 16 (an Indian income-tax salary certificate), PF (Provident Fund) and ESI (Employee State Insurance) fields, TDS (Tax Deducted at Source) calculation, and company codes resembling Indian business names (`nidhi-impex`, `silver-star` / `silverstar`). This is an **India-market HR/payroll product**, likely built for (or by) a company operating multiple branded business units under one HR back-office.

## 1.5 Target Users

Derived from the role model (see [Roles & Permissions](05-roles-permissions.md)) and the three frontend role subtrees (`/admin`, `/employee`, `/agent`):

| User type | Description |
|---|---|
| **Super Admin** | Full unrestricted access across all companies; the only role that can create other Admins; bypasses the authorization engine entirely (audited bypass). |
| **Admin / Tenant Administrator** | Company-scoped HR/payroll administrator — manages employees, payroll, attendance, hiring, tickets, etc. within their assigned `company_code`(s). |
| **Agent** | A limited external/field role that submits Appointment and Trial Form intake on behalf of prospective employees and views only what they themselves submitted. |
| **Employee** | Self-service user: views own payslips/Form 16, manages own profile, raises support tickets, submits own appointment form. |
| **Candidate** (not a login role) | Interacts only through public, token-authenticated surfaces: the public hiring-quiz link and the Google-Form candidate-intake relay — never authenticates into the main app. |

## 1.6 Key Objectives (inferred from the codebase's own priorities)

1. **Data integrity for payroll and identity data** — extensive validation, upload-batch auditing, and (in-progress) Aadhaar encryption hardening.
2. **Multi-tenancy without a formal tenant model** — company/unit scoping is enforced in application code rather than via foreign keys to a `companies` table (a deliberate but noted architectural gap, see [Bug & Issue Report](19-bugs-issues.md)).
3. **Granular, auditable authorization** — an active, in-progress migration from a simple numeric role + basic RBAC model to a full attribute-based access control (ABAC) "Enterprise Authorization Platform," run in parallel/shadow mode for safe rollout.
4. **Progressive modularization** — the HR/ATS and Ticketing modules are explicitly gated behind schema-readiness checks (`module.schema:hr`, `module.schema:tickets`) so they can be deployed to environments where those tables don't yet exist without breaking the core payroll/employee features.

## 1.7 Product Vision

Not explicitly documented in the code (no product roadmap, vision statement, or comparable document exists in the repository). **Unable to determine from source code.** What can be inferred is a direction of travel from "payroll tool" toward "full HRMS," evidenced by the newest migrations (2026-08-03 onward) adding an entire ATS/hiring pipeline, performance management, and asset tracking in a single day's migration batch, followed immediately by the Enterprise Authorization Platform and a support-ticket system — i.e., the product is actively expanding module-by-module.

## 1.8 Major Functional Areas

1. Authentication & Session Management
2. Employee Master Data Management
3. Payroll / Salary Slip Management
4. Form 16 / TDS
5. Attendance & Shift Management
6. Appointment & Trial Form Intake (pre-employment)
7. Hiring / Recruitment (ATS): Requisitions, Candidates, Interviews, Assessments/Quizzes, Offers
8. Onboarding
9. Performance Management
10. Asset Management
11. Exit Management
12. Support Ticketing / Helpdesk
13. Document Management (dual local/S3 storage, versioning, audit)
14. Aadhaar Confidential Data Handling
15. Access Control / Authorization Administration (Users, Roles, Policies, Access Requests, Delegations, Emergency Access)
16. In-app Notifications (in development, see [Notification System](12-notifications.md))
17. Reporting (HR reports, salary/attendance/employee reports)

## 1.9 Technology Stack

### Backend (`salary-slip-bac`)
| Layer | Technology |
|---|---|
| Language/Framework | PHP 8.2, Laravel 11 (no `app/Console/Kernel.php` — Laravel 11's streamlined bootstrap) |
| Database | **PostgreSQL only** — enforced at boot by `AppServiceProvider::refuseUnsupportedDatabase()` |
| Authentication | JWT (`tymon/jwt-auth`), with Laravel Sanctum installed but used on only one route (inconsistency, see [Security Audit](16-security-audit.md)) |
| File storage | Dual-provider: local disk (legacy) or AWS S3 (production), switchable via `DOCUMENT_STORAGE_PROVIDER` |
| Queue/Cache | Configured for the `database` driver, but **no jobs are ever queued** and **no scheduled tasks exist** — see [Performance Audit](18-performance-audit.md) |
| Mail | Laravel `Mailable`s (4 classes), default driver `log` (no real sending in dev); supports SMTP/SES/Postmark/Resend in config |
| PDF/export tooling | Server does not generate PDFs itself for most flows — PDF generation happens client-side (see frontend stack); server does stream files and export CSV/XLS for admin listings |

### Frontend (`salary-slip-front/salary-slip-front`)
| Layer | Technology |
|---|---|
| Framework | React (with `react-router-dom` ^7.14.2, `BrowserRouter`) |
| Build tool | Vite (evidenced by `import.meta.env`, `__PROD_API_URL__` Vite-injected global, `vite.config.js` driving a build-time `__COMPANY_MODE__`) |
| State management | No Redux/Zustand/React Query — plain **React Context** (Auth, Company, Theme, Notification) + local component state + a handful of custom hooks |
| API client | Hand-rolled `fetch`-based wrapper (`utils/api.js`, ~1,933 lines) — no axios; includes a Capacitor-native HTTP path for mobile builds |
| Realtime | Socket.IO client (`socket.io-client`), currently wired to a hardcoded LAN fallback address and only consumed by the (partly mocked) notification system |
| Data grids | `AgGridReact` (heavy grid tables: Employee Management, Appointments, Trial Form, Salary Management) |
| Charts | `recharts` (dashboards, HR reports) |
| Drag-and-drop | `@dnd-kit/core` (Candidate Pipeline Kanban board) |
| PDF export | Client-side PDF generation from DOM nodes (`exportNodeToPdf`, `downloadForm16PDF`, `downloadTablePDF` utilities) |
| Mobile | Capacitor wrapper present (native Android/iOS builds bypass `fetch` for `CapacitorHttp`) — a Progressive Web App (PWA) install flow also exists (`useInstallPWA`) |
| Testing | Vitest (test files co-located with the components/pages they cover, `*.test.jsx`) |

## 1.10 Architecture Summary

Two independently deployable applications communicating only over HTTP:
- **`salary-slip-bac`** — a Laravel REST API (no server-rendered views except the default Laravel welcome page and a universal file-streaming route).
- **`salary-slip-front/salary-slip-front`** — a React single-page application (SPA), built separately, configured with the backend's base URL via `VITE_API_BASE_URL` / `VITE_STAGING_URL` / a production-injected global.

See [System Architecture](01-architecture.md) for the full breakdown of each layer, and [Third-Party Integrations](15-integrations.md) for what actually talks to the outside world.

## 1.11 Notable Repository/Working-Tree State (as of this audit)

Documented here because it materially affects what "the product" currently is:
- An **"Access Control console"** (a permission matrix/tree UI with its own dashboard, audit log, and org-structure — locations/branches/teams/approval levels) was recently **removed**. Its backend controllers (`PermissionMatrixController`, `PermissionTreeBuilder`) and some tests are marked deleted in git status, though `PermissionMatrixController.php` and its supporting `Matrix/*` services are still present on disk and are **not wired into any route** — an unresolved discrepancy, not further guessed at.
- Its frontend replacement, `src/features/permissionMatrix/`, exists **only as an uncommitted, untracked directory** and currently renders a "Coming Soon" placeholder — the Permission Matrix page is not functional in the current codebase.
- A new **in-app notification system** (Socket.IO transport + notification context + 5 modal components) exists but is **largely uncommitted** and its data is seeded from hardcoded fixtures rather than a confirmed live backend endpoint — an in-progress feature, not a finished one.
- Two HR-module files, `InterviewManagement.jsx` and `OfferManagement.jsx`, have no top-level route of their own — but a direct read of `HiringWorkspace.jsx` confirms both are live, actively rendered as the Hiring workspace's "Interview" and "Offer" tabs respectively (imported and mounted directly in the tab switch, not orphaned). An earlier pass of this research, based on route-file analysis alone, had flagged them as possibly dead code; that is corrected here. Separately, the Hiring module does have a genuine duplication: `TrainingQuizPage.jsx` (`/admin/hr/training`) and the Assessment tab's embedded "Quiz Library" view are two independent UI implementations of the same quiz CRUD over the same backend endpoints — see [HR Hiring module doc](03-modules/hr-hiring.md) §2.3.
- The Aadhaar disclosure model is more permissive than an early pass of this research assumed: full, unmasked numbers are shown on ordinary record access rather than behind a masked-by-default view, and the separately-built one-time-token confidential export flow currently has zero live frontend callers. See [Security Audit](16-security-audit.md) §17.3 for the corrected, evidence-based account.

These are flagged prominently because a registration/IP or client-facing document must not present in-flight or removed work as shipped, stable functionality.
