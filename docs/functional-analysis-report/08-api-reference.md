# 9. API Documentation

> Source: `routes/api.php` (666 lines) + `routes/web.php` (68 lines), `salary-slip-bac`. All API routes are prefixed `/api`. Auth column: `jwt.auth` unless noted. Every endpoint additionally requires the listed `permission:` code unless marked "no permission gate". Super Admin bypasses all permission checks. Full narrative on the authorization engine itself: [Roles & Permissions](05-roles-permissions.md).

## 9.1 Authentication

| Method | Endpoint | Auth | Purpose | Used by |
|---|---|---|---|---|
| POST | `/login` | none (throttle 30/min) | Email+password login, issues JWT | Login.jsx |
| POST | `/new{data}` | none (throttle 15/min) | Multi-step forgot-credentials flow (identity verify → email/password change) | Login.jsx forgot-password flow |
| GET | `/check-emp-code/{code}` | none (throttle 10/min) | Public emp-code existence lookup (enumeration-risk, deliberately throttled) | Appointment/Trial Form emp-code check |
| POST | `/logout` | none (deliberately outside jwt.auth so an expired token can still log out) | Revoke current token | Header logout |
| POST | `/register` | jwt.auth, role:admin, `hr.employee.create` | Create a new user account | Admin-only account creation |
| GET | `/profile` | jwt.auth | Get authenticated user's profile (full Aadhaar attached for self-view) | AuthContext bootstrap |
| POST | `/change-password` | jwt.auth (throttle 10/min) | Change own password | Profile pages |
| GET | `/user` | **auth:sanctum** (inconsistent guard) | Returns `$request->user()` | Unclear — orphaned/legacy, not confirmed consumed |

## 9.2 Employees

| Method | Endpoint | Permission | Purpose |
|---|---|---|---|
| GET | `employee/get` | `hr.employee.read` | List employees (excludes super admin/admin/agent roles) |
| GET | `employee/show/{id}` | `hr.employee.read` | Show one employee |
| GET | `employee/import-columns` | `hr.employee.import` | Column schema for bulk import template |
| POST | `employee/store` | `hr.employee.create` | Create employee |
| PUT | `employee/edit/{id}` | `hr.employee.update` | Update employee |
| GET | `employee/delete/{id}` | `hr.employee.delete` | Delete employee (⚠ GET-based delete, see [Bug Report](19-bugs-issues.md)) |
| POST | `employee/delete-multiple` | `hr.employee.delete` | Bulk delete |
| POST | `employee/import` | `hr.employee.import` (throttle 20/min) | Bulk Excel import |
| POST | `employee/import-account-detail` | `hr.employee.import` (throttle 20/min) | Bulk bank-detail import |
| GET | `dashboard` | role:employee, `self.payslip.read` | Employee's own dashboard/salary data |

## 9.3 Departments

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/department/get` | any authenticated (jwt.auth only) |
| POST | `department/store` | `hr.department.create` |
| PUT | `department/update/{id}` | `hr.department.update` |
| DELETE | `department/delete/{id}` | `hr.department.delete` |

## 9.4 Payroll / Salary Slips

| Method | Endpoint | Permission | Purpose |
|---|---|---|---|
| GET | `admin/salary-slip/import-columns` | `payroll.payslip.create` | Import template columns |
| POST | `admin/salary-slip/store` | `payroll.payslip.create` | Bulk salary-slip import |
| GET | `admin/salary-slip/delete` | `payroll.payslip.delete` | Delete a slip (⚠ GET-based, query-param id) |
| GET | `salary-slip/get` | `payroll.payslip.read` | List slips (role admin,employee) |
| GET | `salary-slip/show/{id}` | `payroll.payslip.read` | Show one slip |
| GET | `admin/form16/employees` | `payroll.form16.read` | Employee list for Form16 admin screen |
| GET | `upload-batches/{type}` | `payroll.payslip.read` | List upload batches (salary/employee/account-master) |
| GET | `upload-batches/{type}/{id}` | `payroll.payslip.read` | Show one batch + rows |
| DELETE | `upload-batches/{type}/{id}` | `payroll.payslip.delete` | Delete a batch |
| POST | `/account-master` | `hr.employee.import` (throttle 20/min) | Bulk account-master import |

## 9.5 Attendance & Shifts

| Method | Endpoint | Permission | Purpose |
|---|---|---|---|
| GET | `attendance/grid` | `hr.attendance.read` | Monthly attendance grid |
| POST | `attendance/cell` | `hr.attendance.update` | Upsert one attendance cell |
| POST | `attendance/import` | `hr.attendance.import` (throttle 20/min) | Bulk import |
| GET | `shifts/get` | `hr.shift.read` | List shifts |
| POST | `shifts/store` | `hr.shift.create` | Create shift |
| PUT | `shifts/update/{id}` | `hr.shift.update` | Update shift |
| DELETE | `shifts/delete/{id}` | `hr.shift.delete` | Delete shift |
| POST | `shifts/assign` | `hr.shift.assign` | Bulk-assign/clear shift for employees |

## 9.6 Appointments & Trial Forms

| Method | Endpoint | Permission | Purpose |
|---|---|---|---|
| POST | `/appointment` | `hr.appointment.create` | Create appointment (legacy) |
| GET | `/appointment` | `hr.appointment.read` | List appointments (legacy) |
| GET | `/appointment/check-emp-code` | `hr.appointment.read` | Check emp-code availability |
| POST | `/appointment/create-account` | `hr.employee.create` | Convert appointment → login account |
| POST | `/appointment/update` | `hr.appointment.update` | Update appointment |
| POST | `v1/appointments/` | `hr.appointment.create` (throttle 30/min) | Create appointment (v1) |
| GET | `v1/appointments/{id}` | `hr.appointment.read` | Show |
| PUT/PATCH | `v1/appointments/{id}` | `hr.appointment.update` | Update |
| POST | `v1/appointments/{id}/complete` | `hr.appointment.approve` | Mark complete |
| POST | `v1/appointments/{id}/aadhaar/reveal` | none beyond record access (throttle 10/min) | Reveal full Aadhaar — deliberately not permission-gated separately, see [Security Audit](16-security-audit.md) |
| GET | `v1/appointments/{id}/documents` | `document.file.read` | List documents |
| POST | `v1/appointments/{id}/documents` | `document.file.upload` (throttle 30/min) | Upload document |
| POST | `/trial-form/store` | `recruitment.trial_form.create` | Create trial form |
| GET | `/trial-form/list` | `recruitment.trial_form.read` | List trial forms |
| POST | `/trial-form/update/{id}` | `recruitment.trial_form.update` | Update |
| DELETE | `/trial-form/delete/{id}` | `recruitment.trial_form.delete` (role:admin) | Delete |
| GET | `candidates/{id}/resume` / `v1/candidates/{id}/resume` | **none — public** | Unauthenticated resume streaming for iframe embed |
| GET | `/agent/candidates` | role:agent, `recruitment.candidate.read` | Agent's own submitted candidates |
| GET/PUT/DELETE | `/agents`, `/agents/{id}` | `hr.employee.{read,update,delete}` | Manage agent accounts |

## 9.7 Aadhaar Confidential Export (shared: appointments + employees)

| Method | Endpoint | Notes |
|---|---|---|
| POST | `{surface}/{id}/aadhaar/export-authorization` | Issues a one-time, 60s-default token (throttle 10/min) |
| POST | `{surface}/{id}/confidential-pdf` | Consumes the token, generates full-Aadhaar PDF (throttle 10/min) |
| POST | `{surface}/{id}/confidential-print-payload` | Verifies (doesn't consume) the token, for print (throttle 10/min) |

`{surface}` = `appointments` or `employees` (looped over both). Feature is off by default (`CONFIDENTIAL_AADHAAR_EXPORT_ENABLED=false` → 503). **Note:** page-level research confirmed this entire flow currently has no live frontend caller — see [Security Audit](16-security-audit.md) §17.3.

## 9.8 Documents (dual system)

**Legacy, local-only (`documents`, deprecated):**
| Method | Endpoint | Permission |
|---|---|---|
| GET | `documents/types` | `document.file.read` |
| POST | `documents/preview-name` | `document.file.read` |
| POST | `documents/` | `document.file.upload` |
| GET | `documents/` | `document.file.read` |
| DELETE | `documents/{id}` | role:admin, `document.file.delete` |

**Current, S3-backed (`v1/documents`):**
| Method | Endpoint | Permission |
|---|---|---|
| GET | `v1/documents/types` | `document.file.read` |
| GET | `v1/documents/health` | none |
| GET | `v1/documents/` | `document.file.read` |
| GET | `v1/documents/{id}` | `document.file.read` |
| GET | `v1/documents/{id}/versions` | `document.file.read` |
| POST | `v1/documents/upload` | `document.file.upload` (throttle 30/min) |
| POST | `v1/documents/{id}/replace` | `document.file.update` (throttle 30/min) |
| POST | `v1/documents/{id}/view-url` | `document.file.read` (throttle 60/min) |
| POST | `v1/documents/{id}/download-url` | `document.file.download` (throttle 60/min) |
| DELETE | `v1/documents/{id}` | `document.file.delete` |
| POST | `v1/documents/{id}/restore` | `document.file.restore` |

## 9.9 HR Module (all under `module.schema:hr` gate)

| Sub-module | Base path | Permission prefix |
|---|---|---|
| Job Requisitions | `hr/requisitions` (get/show/store/update/delete/approve/publish) | `hr.requisition.*` |
| Candidates | `hr/candidates` (get/pipeline/show/store/update/delete/move-stage) | `hr.candidate.*` |
| Candidate Documents | `hr/candidates/documents/*` | `hr.candidate.*` |
| Interviews | `hr/interviews` (get/show/store/update/delete/reschedule/feedback) | `hr.interview.*` |
| Offers | `hr/offers` (get/show/store/update/delete/approve/release/respond) | `hr.offer.*` |
| Training Quizzes | `hr/quizzes` (get/show/store/update/delete) | `hr.training.*` |
| Quiz Attempts | `hr/quiz-attempts` (get/show/candidates/store/delete) | `hr.training.*` |
| Onboarding | `hr/onboarding` (dashboard/journeys/documents/review) | `hr.onboarding.*` |
| Assets | `hr/assets` (get/dashboard/show/store/update/delete/allocate/return/transfer) | `hr.asset.*` |
| Performance | `hr/performance` (dashboard/cycles/goals/reviews) | `hr.performance.*` |
| Reports | `hr/reports/generate` | `hr.report.read` |
| Exit | `hr/exit` (get/store/status) | `hr.exit.*` |
| Dashboard | `hr/dashboard` | `hr.dashboard.read` |

## 9.10 Public Candidate Surfaces (unauthenticated by design)

| Method | Endpoint | Auth model |
|---|---|---|
| GET | `quiz/{token}` | Token (64-char) in URL is the credential |
| POST | `quiz/{token}/start` | Token |
| POST | `quiz/{token}/progress` | Token |
| POST | `quiz/{token}/event` | Token |
| POST | `quiz/{token}/submit` | Token |
| POST | `candidate-intake/{token}` | Shared secret via `hash_equals`, module.schema:hr gate |

## 9.11 Tickets (`module.schema:tickets`)

| Method | Endpoint | Permission |
|---|---|---|
| GET | `tickets/categories` | none beyond module gate |
| GET | `tickets/dashboard` | `self.ticket.read` |
| GET | `tickets/get` | `self.ticket.read` |
| GET | `tickets/show/{id}` | `self.ticket.read` |
| POST | `tickets/store` | `self.ticket.create` (throttle 20/min) |
| POST | `tickets/{id}/reply` | `self.ticket.create` (throttle 60/min) |
| POST | `tickets/{id}/reopen` | `self.ticket.create` (throttle 20/min) |
| GET | `tickets/assignees` | role:admin, `support.ticket.assign` |
| PUT | `tickets/{id}/assign` | role:admin, `support.ticket.assign` |
| PUT | `tickets/{id}/status` | role:admin, `support.ticket.update` |

## 9.12 Access Control / Authorization Administration

| Sub-area | Base path | Notes |
|---|---|---|
| Self-service | `my-permissions`, `v1/authorization/me`, `v1/authorization/check`, `v1/authorization/check-batch` | jwt.auth only |
| Roles | `v1/roles/*` (summary/manage/CRUD/archive/restore/activate/deactivate) | `admin.role.*`, `role.manager` |
| Users (admin) | `v1/admin/users/*` (index/summary/filter-options/export/bulk/show/audit-logs/store/update/destroy/lock/unlock/activate/deactivate/reset-password/assign-role/assign-permissions) | `admin.user.*`, `module.schema:authorization` (currently a no-op, see [Bug Report](19-bugs-issues.md)) |
| User lookup | `v1/user-lookup` | `admin.role.read` (throttle 60/min) |
| Delegations | `v1/delegations` (index/store/revoke) | `admin.delegation.manage` |
| Policies | `v1/policies` (index/show/store/update/publish/rollback) | `admin.policy.*` |
| Access Requests | `v1/access-requests` (index/store/approve/reject/revoke) | `store` has **no permission gate** — any authenticated user may request access |
| Emergency Access | `v1/emergency-access` (index/store/revoke) | `admin.emergency_access.approve` |
| RBAC settings survivors | `rbac/settings` (GET/PUT), `rbac/user-roles` (GET) | `admin.configuration.*`, `admin.role.read` |

**Orphaned/unrouted controller methods** (exist in code, no route in current `api.php` — see [Bug & Issue Report](19-bugs-issues.md)): `Api/V1/Authorization/AuthorizationController@simulate/flags/updateFlags`, the entirety of `Api/V1/Authorization/PermissionMatrixController` (roles/show/update/clone/simulate/audit/validation).

## 9.13 Admin / Dashboard / Misc

| Method | Endpoint | Permission | Purpose |
|---|---|---|---|
| GET | `admin-dashboard` | `hr.dashboard.read` | Admin dashboard stats |
| GET | `modules` | `admin.configuration.read` | Module availability probe (frontend hides nav for unmigrated modules) |
| GET | `/user-data` | `admin.configuration.update` (role:admin) | Dev utility: clears optimize/config/cache/route/view caches |
| GET | `/fix-units` | `admin.configuration.update` (role:admin) | One-off data-fix backfilling `unit` for two company codes |

## 9.14 `routes/web.php`

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/` | Default Laravel welcome view |
| GET | `/storage/{path}` | Universal public file streamer (tries public disk → default disk → two storage paths); **no auth/permission gate at all** — any existing storage file is publicly readable by path. Permissive by design for resume/document iframe embedding. See [Security Audit](16-security-audit.md). |

## 9.15 Error response conventions observed

- 401 for unauthenticated (distinct messages for expired vs. invalid vs. missing JWT).
- 403 `PERMISSION_DENIED` for a denied authorization decision.
- 503 `AUTHORIZATION_SCHEMA_NOT_READY` / `MODULE_SCHEMA_NOT_READY` when the relevant schema hasn't been migrated in an environment — a deliberate graceful-degradation pattern rather than a 500.
- 422 for validation failures (Laravel default `FormRequest`/`validate()` behavior) and for unknown report types in `HrReportController@generate`.
- A frontend-documented quirk (`utils/api.js`): some error responses concatenate two JSON documents in one body due to a backend error-handler chain bug; the client defensively splits and takes the last one. **This is a backend bug surfaced by frontend defensive code** — see [Bug & Issue Report](19-bugs-issues.md).
