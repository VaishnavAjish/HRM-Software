# Enterprise-RBAC — `enterprise-rbac/` (Node/Express + React, standalone)

## Verdict up front

**Standalone, dormant demo/scaffold app. Not wired into the main HRMS in any way.** No shared JWT secret, no shared database, no cross-service API calls, no shared code with `salary-slip-bac`/`salary-slip-front`/`salary-slip-node`.

## Evidence it's dormant, not live

- `git log` shows exactly **one commit** touching this directory (2026-07-29, "feat: add enterprise RBAC module..."), no follow-ups since, despite the rest of the repo being actively developed through 2026-08-16.
- Different JWT secret (`dev-only-change-me...`), different database (a local **PGlite** embedded Postgres on port 55432, not the real `niss_hrms` Postgres), different port/CORS (backend :5000, expects frontend on :5173) — none of this overlaps with the real stack, which runs via `npm run dev` from the repo root against Laravel on :8000.
- Zero cross-references: grepping both `backend/src` and `frontend/src` for `salary-slip`, `niss_hrms`, `niss.pro`, or `8000` returns nothing.
- `frontend/README.md` is the unedited Vite/React default template — never customized.
- `.pglite-data/` confirms a local dev DB was spun up at least once, consistent with a one-time trial run.

## What it contains (for reference, in case it's ever revived or cannibalized for parts)

**Backend** (`backend/src`): controllers/routes/services for Users, Roles, Permissions (+Permission Groups), Organization hierarchy (Company/Branch/Location/Department/Team/Designation, all via a generic CRUD factory), Audit (logs/login-history/sessions), Dashboard stats, Auth (JWT access + refresh cookie). Middleware: `authenticateJWT`, `requirePermission`/`requireRole` (Super Admin bypasses all checks; per-user grant/revoke overrides take precedence over role-derived permissions), rate limiting.

Prisma schema additionally defines a fine-grained-access-control (FGAC) layer — `PagePermission`, `ActionPermission`, `TablePermission`, `ColumnPermission`, `RowSecurityPolicy`, `ReportPermission`, `ApiPermission` — plus an Approval Matrix (`ApprovalLevel`, `ApprovalMatrix`). **None of these have any backing controller, route, service, or frontend page** — dead/aspirational schema, never implemented even within this standalone subproject.

**Frontend** (`frontend/src`): pages for Dashboard, Login, Users (list/detail/form drawer, permission overrides, unlock), Roles (list/detail/form drawer), Permission Groups, 6 org-hierarchy pages (all built on a shared `EntityCrudPage` generator), Audit Logs / Login History / Sessions. Single `AdminLayout`. Zustand-style `authStore`/`themeStore`.

## Relationship to the real permission system

Structurally similar in spirit (resource+action permission codes, role/permission matrix, FGAC concepts) to the real `PermissionRegistry`/Permission Matrix described in `01-laravel-backend.md`, but it is a **separate, parallel implementation** built from scratch with its own naming convention and no code sharing — not the canonical registry.
