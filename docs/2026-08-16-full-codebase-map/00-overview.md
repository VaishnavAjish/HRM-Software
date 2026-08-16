# HRMS — Full Codebase Map (2026-08-16)

> Produced by direct source-code reading of every sub-project in this monorepo, current as of 2026-08-16. This supersedes the module/page inventory portions of `docs/functional-analysis-report/` (dated 2026-08-07) — treat that older report's security/bug findings as historical unless re-confirmed here, but its narrative sections (workflows, SRS-style descriptions) are still a useful supplement. This report focuses on: what exists, where it lives, how the five sub-projects relate, and what is broken, mocked, or a live security gap right now.

## The five sub-projects

| # | Path | Stack | Role |
|---|---|---|---|
| 1 | `salary-slip-bac` | Laravel/PHP | **Primary production backend.** Owns the database schema (migrations), serves the web frontend and mobile app. |
| 2 | `salary-slip-front/salary-slip-front` | React (Vite) | **Primary production frontend.** Admin / HR / Employee / Agent / public-careers portals. (Note: real source is nested one level inside `salary-slip-front/` — the outer folder also holds build artifacts `main/`, `master/`, `dist/`, `android/`.) |
| 3 | `hrms-mobile-app` | React Native / Expo | Native mobile client, talks to the **same** Laravel backend (`https://niss.pro/api` in prod) as the web frontend — not a separate system. |
| 4 | `salary-slip-node` | Node/Fastify/Prisma | **Active, test-covered "strangler-fig" rewrite** of `salary-slip-bac`, module-by-module. Shares the **same Postgres database** (`niss_hrms`) as Laravel — not a separate DB, not an HTTP proxy. Whether it currently receives live traffic could not be confirmed from this repo (would need the reverse-proxy/nginx config, which lives outside this checkout). |
| 5 | `enterprise-rbac` | Node/Express + React, separate repo-in-repo | **Standalone, dormant scaffold.** Single commit (2026-07-29), never touched again. Own DB, own JWT secret, own port — zero code or data overlap with the rest of the system. Not part of the live product. |

See per-subsystem files in this folder for full detail:
- [01-laravel-backend.md](01-laravel-backend.md)
- [02-frontend.md](02-frontend.md)
- [03-mobile-app.md](03-mobile-app.md)
- [04-node-service.md](04-node-service.md)
- [05-enterprise-rbac.md](05-enterprise-rbac.md)
- [06-findings-bugs-security.md](06-findings-bugs-security.md) — **read this one first if you only read one file.**

## System shape, one paragraph

A Laravel API (`salary-slip-bac`) is the schema owner and system of record, backed by Postgres (`niss_hrms` — dev/LAN; a separate SQLite deployment on AWS `niss.pro` is a distinct, out-of-sync production target, per prior project memory). Two first-party clients — a React web app and a React Native mobile app — talk to it. A large, actively-maintained Node/Fastify service (`salary-slip-node`) is being built to gradually replace Laravel's endpoints one module at a time, sharing the same database rather than syncing a copy; several modules there have already independently fixed cross-tenant scoping bugs that still exist unpatched in the Laravel code they're replacing, meaning the two backends currently disagree on some authorization decisions. A second, unrelated RBAC scaffold (`enterprise-rbac`) exists in the repo but is not wired into any of this.

## Headline risk items (see file 06 for full detail and file references)

1. Two live security bugs in `CandidateAuthController` (email-verification and password-reset tokens returned directly in API responses instead of only being emailed).
2. A fatal-error bug in `CompensatoryOffController` (missing `Auth` facade import — `approve()`/`reject()` will crash at runtime).
3. A dead authorization branch in `PrivilegedAccessController` (`$user->role === 'admin'` string compare against an integer field — never true).
4. Inconsistent tenant/company scoping across several HR read endpoints (`show`/`update`/`destroy` unscoped while sibling `index` methods are scoped) in `QuizAttemptController`, `TrainingQuizController`, `AssetController`, `OnboardingController::showJourney`, `CandidateDocumentController` (entire file), and 3 of 8 report types in `HrReportController`.
5. Laravel and Node currently give **different answers** for some authorization checks on the same underlying data (Node has fixed bugs Laravel still has) — a real correctness risk if both can serve traffic.
6. Mobile app: two broken API calls in `AdminEmployeesScreen.js` (`api.bulkDeleteEmployees`/`api.deleteAdminEmployee` don't exist), a fully mock `AdminTdsScreen.js`, and a fabricated per-user permission matrix in `AdminAccountsScreen.js`.
7. Frontend: `Reports.jsx` is intentionally disabled (used to show fabricated payroll data) — this is a documented, deliberate gap, not a bug. `NotificationContext.jsx` still ships hardcoded seed groups/announcements alongside real server-backed notifications.

## Method

Five parallel research agents each read one sub-project's source in full (controllers/models/routes/pages/screens — not summaries of summaries); the Laravel backend agent further fanned out into per-domain sub-agents to keep within context limits, covering all ~140 controllers and ~150 models. No claim in the per-subsystem files was taken from prior documentation without being re-verified against current code.
