# HRMS — Complete Website Documentation & Functional Analysis Report

> Generated 2026-08-07 by direct source-code analysis of this repository (`salary-slip-bac` + `salary-slip-front/salary-slip-front`). No feature has been invented — anything not determinable from the code is stated as such inline. This index follows the 25-section structure requested for the master documentation report.

## How this report is organized

Because this is a large, multi-module application (~185 API routes, 41 controllers, 44 DB models, 76 migrations, ~102 frontend page files across 10 business modules), the report is split into focused files rather than one monolithic document.

| # | Section | File |
|---|---|---|
| 1–2 | Project Overview & System Architecture | [00-overview.md](00-overview.md), [01-architecture.md](01-architecture.md) |
| 3 | Navigation Structure | [02-navigation.md](02-navigation.md) |
| 4–5 | Module & Page-by-Page Documentation | [03-modules/](03-modules/) (one file per module) + [04-pages/](04-pages/) (one file per screen, grouped by module) |
| 6 | Role & Permission Matrix | [05-roles-permissions.md](05-roles-permissions.md) |
| 7 | Complete Feature Inventory | [06-feature-inventory.md](06-feature-inventory.md) |
| 8 | Complete Workflow Documentation | [07-workflows.md](07-workflows.md) |
| 9 | API Documentation | [08-api-reference.md](08-api-reference.md) |
| 10 | Database Documentation | [09-database.md](09-database.md) |
| 11 | Validation Rules | [10-validation-rules.md](10-validation-rules.md) |
| 12 | Reports & Analytics | [11-reports-analytics.md](11-reports-analytics.md) |
| 13 | Notification System | [12-notifications.md](12-notifications.md) |
| 14 | Settings Documentation | [13-settings.md](13-settings.md) |
| 15 | AI Features | [14-ai-features.md](14-ai-features.md) |
| 16 | Third-Party Integrations | [15-integrations.md](15-integrations.md) |
| 17 | Security Audit | [16-security-audit.md](16-security-audit.md) |
| 18 | UI/UX Audit | [17-ui-ux-audit.md](17-ui-ux-audit.md) |
| 19 | Performance Audit | [18-performance-audit.md](18-performance-audit.md) |
| 20 | Bug & Issue Report | [19-bugs-issues.md](19-bugs-issues.md) |
| 21 | Improvement Recommendations | [20-recommendations.md](20-recommendations.md) |
| 22 | User Journey Documentation | [21-user-journeys.md](21-user-journeys.md) |
| 23 | Screen Inventory | [22-screen-inventory.md](22-screen-inventory.md) |
| 24 | Component Inventory | [23-component-inventory.md](23-component-inventory.md) |
| 25 | Final Product Summary | [24-final-summary.md](24-final-summary.md) |

## Module documentation index (sections 4–5)

| Module | Module doc | Page docs |
|---|---|---|
| Access Control | [access-control.md](03-modules/access-control.md) | [04-pages/admin-access-control/](04-pages/admin-access-control/) |
| Employee Management | [employee-management.md](03-modules/employee-management.md) | [04-pages/admin-employee-management/](04-pages/admin-employee-management/) |
| Payroll / Salary | [payroll.md](03-modules/payroll.md) | [04-pages/admin-payroll/](04-pages/admin-payroll/) |
| Attendance & Shift | [attendance.md](03-modules/attendance.md) | [04-pages/admin-attendance/](04-pages/admin-attendance/) |
| Admin Core & Tickets | [admin-core-and-tickets.md](03-modules/admin-core-and-tickets.md) | [04-pages/admin-dashboard-settings-tickets/](04-pages/admin-dashboard-settings-tickets/) |
| Appointments Intake | [appointments-intake.md](03-modules/appointments-intake.md) | [04-pages/admin-appointments-trialform-agent/](04-pages/admin-appointments-trialform-agent/) |
| Trial Form & Agent Portal | [trial-form-and-agent-portal.md](03-modules/trial-form-and-agent-portal.md) | [04-pages/admin-appointments-trialform-agent/](04-pages/admin-appointments-trialform-agent/) |
| HR Hiring (ATS) | [hr-hiring.md](03-modules/hr-hiring.md) | [04-pages/hr-hiring/](04-pages/hr-hiring/) |
| HR Onboarding | [hr-onboarding.md](03-modules/hr-onboarding.md) | [04-pages/hr-onboarding/](04-pages/hr-onboarding/) |
| HR Performance / Assets / Exit | [hr-performance-assets-exit.md](03-modules/hr-performance-assets-exit.md) | [04-pages/hr-performance-assets-exit/](04-pages/hr-performance-assets-exit/) |
| Employee Self-Service | [employee-self-service.md](03-modules/employee-self-service.md) | [04-pages/employee-self-service/](04-pages/employee-self-service/) |

## Methodology & honesty notice

Every claim in this report is grounded in a direct reading of the source code as it exists in this repository on 2026-08-07. Where the code was ambiguous or a live-runtime fact could not be verified from static source alone (e.g., whether a particular Artisan command actually runs on a schedule in production, or whether a data migration has been executed against live data), this is stated explicitly rather than assumed. Several features that render complete, polished UI are backed by mock/demo data or simulated actions rather than live persistence — these are flagged prominently in [Bug & Issue Report](19-bugs-issues.md) and the relevant page docs, and should not be represented as fully functional in any external filing without first confirming their status with the engineering team.

This repository (`HRMS oldd`) is understood, per prior project research, to be a separate codebase from the system believed to be in live production elsewhere — this report describes what this repository's code does, not live production behavior or real user data.

## Note on `docs/` folder location

This report lives in `docs/functional-analysis-report/` rather than loose in `docs/`, because the top-level `docs/` folder already contains substantial unrelated prior work (a repo-wide audit of this monorepo's other sub-projects, dated 2026-08-03). Keep this report's files together in this subfolder to avoid path collisions with that other material.
