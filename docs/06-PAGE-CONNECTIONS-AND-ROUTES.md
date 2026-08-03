# Page Connections, Route Maps, and Cross-Project Links

Last verified against source: 2026-08-03.

Covers the live product first (`salary-slip-front` + `salary-slip-bac` +
`salary-slip-node`). The dormant projects are documented afterwards.

---

## 1. Salary Slip Frontend — Entry Point

```
main.jsx
  +-- App
        +-- BrowserRouter
              +-- ThemeProvider          (dark mode)
                    +-- AuthProvider     (session, permission snapshot)
                          +-- CompanyProvider  (company + unit scope)
                                +-- AppRoutes  (Suspense + lazy pages)
                                +-- Toaster
```

All pages are `React.lazy` except `Login` and `AppLayout`.

---

## 2. Route Map: Salary Slip Frontend

### Auth
| Path | Behaviour |
|------|-----------|
| `/login` | `Login`; redirects to the role home when already authenticated |
| `/` | Redirect: admin → `/admin`, agent → `/agent`, employee → `/employee`, otherwise `/login` |
| `*` | Redirect to `/login` |

### Admin — `/admin` (`requiredRole="admin"`, wrapped in `AppLayout`)

| Path | Page | API |
|------|------|-----|
| `/admin` | Dashboard | `GET /api/admin-dashboard` |
| `/admin/employees` | EmployeeManagement | `GET /api/employee/get` |
| `/admin/employees/add` | AddEmployeePage | `POST /api/employee/store`, `/import` |
| `/admin/salary` | SalaryManagement | `GET /api/salary-slip/get` |
| `/admin/salary/upload` | SalaryUploadPage | `POST /api/admin/salary-slip/store` |
| `/admin/attendance` | AttendanceView | `GET /api/attendance/grid`, `POST /api/attendance/cell`, `/import` |
| `/admin/attendance/shift` | ShiftManagement | `GET /api/shifts/get`, `POST /api/shifts/store`, `/assign` |
| `/admin/appointments` | Appointments | `GET /api/appointment`, `POST /api/appointment/update` |
| `/admin/trial-form` | TrialForm | `GET /api/trial-form/list`, `POST /api/trial-form/store` |
| `/admin/tds/calculation` | TdsCalculation | `GET /api/salary-slip/get` |
| `/admin/form16` | Form16 | `GET /api/salary-slip/get` |
| `/admin/reports` | Reports | Client-side Excel/PDF export |
| `/admin/admins` | Settings | `GET /api/rbac/settings` |
| `/admin/profile` | AdminProfile | `POST /api/profile-update` |

### Admin — HR module

Every route is gated on a permission code, and the menu entry additionally
requires `useModuleAvailability("hr")` to report the schema present.

| Path | Page | Permission | API |
|------|------|-----------|-----|
| `/admin/hr` | HrDashboard | `hr.dashboard.read` | `GET /api/hr/dashboard` |
| `/admin/hr/hiring` | HiringProcess | `hr.requisition.read` | `GET /api/hr/requisitions/get`, `/candidates/pipeline` |
| `/admin/hr/assets` | AssetAllocation | `hr.asset.read` | `GET /api/hr/assets/get`, `/dashboard` |
| `/admin/hr/performance` | PerformanceMatrix | `hr.performance.read` | `GET /api/hr/performance/dashboard`, `/cycles/get`, `/goals/get`, `/reviews/get` |
| `/admin/hr/reports` | HrReports | `hr.report.read` | `GET /api/hr/reports/generate` |
| `/admin/hr/exit` | ExitManagement | - | - |
| `/admin/hr/settings` | HrSettings | - | - |

`InterviewManagement`, `OfferManagement`, `CandidatePipeline` and
`EmployeeOnboarding` exist as components with backing API routes
(`/api/hr/interviews/*`, `/api/hr/offers/*`, `/api/hr/candidates/*`) but are not
routed yet.

### Admin — Access Control (removed)

The `Access Control` menu group and all ten of its routes were removed, along
with `pages/admin/rbac/`, `pages/admin/access-control/` and `components/rbac/`:

`/admin/rbac`, `/admin/rbac/users`, `/admin/rbac/permission-matrix`,
`/admin/rbac/audit-logs`, `/admin/access-control/permission-matrix`,
`/admin/authorization` and its `roles`, `policies`, `requests`, `audit` and
`simulator` sub-views.

Their backend counterparts went too — `/api/roles/*`, most of `/api/rbac/*`,
`/api/v1/{roles,permissions,policies,access-requests}` and the management half
of `/api/v1/authorization/*`.

Two endpoints in the `rbac/` group survive because ordinary admin screens read
them: `GET/PUT /api/rbac/settings` (admin Dashboard) and
`GET /api/rbac/user-roles` (`/admin/admins`). `GET /api/my-permissions` and
`GET /api/v1/authorization/me` also survive — both are login-path calls.

Permissions are still stored, resolved and enforced. What is gone is the UI and
the API for editing them: a grant is now made by seeder or by writing
`permission_dimensions` directly.

### Employee — `/employee` (`requiredRole="employee"`)
| Path | Page | API |
|------|------|-----|
| `/employee` | Dashboard | `GET /api/dashboard` |
| `/employee/payslips` | Payslips | `GET /api/salary-slip/get`, `/show/{id}` |
| `/employee/form16` | Form16 | `GET /api/salary-slip/get` |
| `/employee/profile` | Profile | `GET /api/profile`, `POST /api/profile-update` |
| `/employee/appointment` | EmployeeAppointment | `GET /api/appointment` |

### Agent — `/agent` (`requiredRole="agent"`)
| Path | Page | API |
|------|------|-----|
| `/agent` | AgentDashboard | `GET /api/agent/candidates` |
| `/agent/trial-forms` | TrialForm (shared) | `GET /api/trial-form/list` |
| `/agent/appointments` | Appointments (shared) | `GET /api/appointment` |

---

## 3. Guard Logic

```
ProtectedRoute({ requiredRole, requiredPermission }):
  if initializing                      -> RouteLoader "Checking session..."
  if !isAuthenticated                  -> /login (state: { from: location })
  if requiredRole && role !== required -> role fallback
  if requiredPermission && !can(code)  -> role fallback
  if role === "employee"
     && profile incomplete
     && path !== /employee/profile     -> /employee/profile
  else                                 -> children
```

Role fallback: `admin` → `/admin`, `agent` → `/agent`, otherwise `/employee`.

Profile completeness checks 18 fields; Aadhaar counts as present via
`hasStoredAadhaar()` rather than by value. While incomplete, the sidebar shows
only the Profile item.

---

## 4. Navigation Construction

`Sidebar.getAdminNav()` builds the admin tree from permissions, not from a
static list.

```
hasAccess(key):
  rawRole === 0                              -> true
  user.authorization.permissions[key]        -> .allowed
  no legacy permissions map                  -> false
  otherwise                                  -> permissions[key] !== "no_access"
```

Legacy page keys map to permission codes:

| Menu | Legacy key | Permission code |
|------|-----------|-----------------|
| Dashboard | `dashboard` | `ui.admin.dashboard.view` |
| Forms → Appointment | `appointments` | `ui.admin.appointments.view` |
| Forms → Trial Form | `trial_form` | `recruitment.trial_form.read` |
| Employees | `employees` | `ui.admin.employees.view` |
| Salary | `salary` | `ui.admin.salary.view` |
| Attendance | `attendance` | `ui.admin.attendance.view` |
| TDS / Form 16 | `tds`, `form16` | `payroll.payslip.read` |
| HR | - | `hr.dashboard.read` **and** module availability |

Menu groups:
`Dashboard`, `Forms`, `Employees`, `Salary`, `Attendance`, `TDS`, `HR`,
`Profile`.

The Trial Form entry additionally requires the scope to be Nidhi Impex or
All Companies.

Employee and agent navs are static lists filtered by the legacy permission map
(`employee_dashboard`, `employee_payslips`, `agent_trial_form`, and so on).

---

## 5. Cross-Project API Connections

### Live product
```
salary-slip-front (React, :5175, PWA + Capacitor Android)
  |
  | fetch, or CapacitorHttp on android/ios (CORS bypass)
  | Base URL: VITE_ENV=DEV -> VITE_API_BASE_URL
  |           STAG        -> VITE_STAGING_URL
  |           otherwise   -> __PROD_API_URL__ (chosen by git branch at build)
  | company_code + unit appended to nearly every request
  v
salary-slip-bac (Laravel, :8000)          salary-slip-node (Fastify, :8001)
  |   Eloquent                              |   Prisma
  v                                         v
PostgreSQL niss_hrms
```

Prefix `/api`. Auth is a JWT bearer token (tymon/jwt-auth). The Node API issues
and verifies the same tokens through `src/lib/laravel/jwt.ts`, so a module can
be switched over without touching the frontend.

### Dormant projects
```
client/  (React, :5173)  -> server/ (Express, :5000)  -> MongoDB
enterprise-rbac/frontend -> enterprise-rbac/backend (:5000) -> PostgreSQL
```

Both prefix `/api/v1` and are independent of the live product.

---

## 6. Data Flows

### Flow 1 — Employee views a payslip
```
POST /api/login                       -> JWT
  -> redirect /employee
  -> GET /api/salary-slip/get         (permission:payroll.payslip.read)
       SalariesSlipController::index()
         role = employee -> scope to own emp_code
         returns paginated slips
  -> AG Grid renders month/year, earnings, deductions, net
  -> GET /api/salary-slip/show/{id}
  -> PayslipDocument in a modal; company-specific variant from companyConfig
  -> print (react-to-print) or PDF (jsPDF via exportUtils)
```

### Flow 2 — Salary bulk import
```
/admin/salary/upload
  -> POST /api/admin/salary-slip/store  (multipart)
       AdminController::salarySlipImport()
         read Excel (Maatwebsite)
         auto-detect columns against DB names + aliases
         normalize month names and numbers
         sum components -> gross; sum deductions; compute net
         upsert salary_slips
         write UploadBatch + UploadBatchRow per row
  -> BulkSalaryValidation shows per-row issues before commit
  -> UploadBatchPanel shows success/failure counts
  -> UploadReportModal drills into rows (GET /api/upload-batches/salary/{id})
```

### Flow 3 — Employee onboarding (public)
```
Login -> "First time login"
  Step 0  POST /api/new-emp_code    verify emp_code + mobile/Aadhaar + DOB
                                     -> verification_token (15 min)
  Step 1  POST /api/new-email       claim email, send 4-digit OTP (PortalOtpMail)
  Step 2  POST /api/new-email-otp   verify OTP
  Step 3  POST /api/new-password    set password, clear OTP/token,
                                     status Pending(2) -> Active(0)
  -> POST /api/login
```
Throttled 15/min. The OTP screen animates the four digits into an orbiting dial
on success and drops them on failure (`index.css` `otp-*` keyframes, timings
mirrored by `OTP_*_MS` in `Login.jsx`).

### Flow 4 — Appointment with documents
```
/admin/appointments -> AppointmentModal
  Step 1: personal + employment details
    -> POST /api/v1/appointments        (hr.appointment.create, 30/min)
       record saved first, so the upload step has a real id
  Step 2: AppointmentDocumentsStep
    -> POST /api/v1/appointments/{id}/documents  (Idempotency-Key)
       Aadhaar is read server-side from the record; never sent from the client
    -> GET  /api/v1/appointments/{id}/documents
  -> POST /api/v1/appointments/{id}/complete    (hr.appointment.approve)
  -> Admin: approve/reject, inline emp_code edit, print, PDF,
     POST /api/appointment/create-account
```
A refresh mid-flow recovers by reloading the saved record via
`GET /api/v1/appointments/{id}`.

### Flow 5 — Aadhaar disclosure
```
Display        masked by default (utils/aadhaar.js)
On-screen      POST /v1/appointments/{id}/aadhaar/reveal   (10/min, audited)
Print / PDF    POST /v1/{surface}/{id}/aadhaar/export-authorization
                 -> exportToken
               POST /v1/{surface}/{id}/confidential-print-payload
               POST /v1/{surface}/{id}/confidential-pdf  -> watermarked blob
```
Reading on screen and exporting are separate grants with separate audit entries.
`surface` is `appointments` or `employees` — same flow, different permission
keys and audit action names.

### Flow 6 — Authorization decision
```
Request with JWT
  -> jwt.auth        validate bearer token
  -> role            coarse check against users.role
  -> permission:CODE RequirePermission
       SchemaSupport: are the tables AND columns present?
         no  -> legacy decision path
         yes -> AuthorizationEngine:
                  role assignments + inheritance
                  policies (ConditionEvaluator)
                  ScopeMatcher on company/unit/branch
                  delegations, emergency grants
                  SeparationOfDuties
                  -> AuthorizationDecision (logged to
                     authorization_decision_logs)
  -> module.schema   are the module's tables present?
         no  -> MODULE_SCHEMA_NOT_READY
  -> Controller
       AuthorizedUserQuery applies row security
       FieldSecurity masks fields on the way out
```

### Flow 7 — Frontend permission resolution
```
login / session restore
  -> GET /api/v1/authorization/me
       success -> user.authorization.permissions[code] = { allowed }
                  user.permissions derived from it
       failure -> GET /api/my-permissions (legacy map)
       both fail -> permissions {}, empty snapshot
  rawRole === 0 -> permissions { "*": "read_write" }

useAuthorization().can(code)
  permissions["*"] === "read_write"                  -> true
  authorization.permissions[code].allowed            -> that value
  otherwise                                          -> false

useAuthorization().check(code, resource)
  -> POST /api/v1/authorization/check  (server decision on a specific record)
```

### Flow 8 — Module availability
```
Sidebar mount
  -> GET /api/modules
       ModuleAvailabilityController probes tables only, so it answers
       correctly even while the RBAC tables are mid-migration
  -> { hr: true|false }
  -> HR menu omitted entirely when false
Route hit anyway
  -> module.schema:hr -> MODULE_SCHEMA_NOT_READY (not a 500)
```

---

## 7. Data Model Relationships

### Salary Slip domain
```
User (1) --- (N) SalarySlip           # linked by emp_code
User (1) --- (N) UploadBatch          # uploaded_by
UploadBatch (1) --- (N) UploadBatchRow
User (N) --- (1) Shift                # users.shift_id
User (1) --- (N) Attendance
User (1) --- (N) Document --- (N) DocumentVersion
Document (1) --- (N) DocumentAuditLog
User (1) --- (N) AadhaarExportAuthorization
Location (1) --- (N) Branch
Department (1) --- (N) Team
```

`users` doubles as the employee master and the appointment record.

### HR / Talent domain
```
JobRequisition (1) --- (N) Candidate
Candidate (1) --- (N) CandidateStageHistory
Candidate (1) --- (N) Interview
Interview (1) --- (N) InterviewPanelist
Interview (1) --- (N) InterviewFeedback
Candidate (1) --- (N) Offer --- (N) OfferRevision
Asset (1) --- (N) AssetAllocation --- (1) User
PerformanceCycle (1) --- (N) PerformanceGoal
PerformanceCycle (1) --- (N) PerformanceReview --- (1) User
```

### Authorization domain
```
Role (N) --- (M) Permission                    # role_permissions
User (N) --- (M) Role                          # user_roles
User (N) --- (M) Permission                    # user_permissions (overrides)
PermissionGroup (1) --- (N) Permission
Role (N) --- (M) Role                          # authorization_role_inheritances
User (N) --- (M) Role                          # authorization_role_assignments
AuthorizationPolicy (1) --- (N) AuthorizationPolicyVersion
AuthorizationAccessRequest (N) --- (1) User
AuthorizationDelegation (N) --- (1) User
AuthorizationEmergencyGrant (N) --- (1) User
AuthorizationDecisionLog (N) --- (1) User
PermissionDimension (N) --- (1) Role
```

---

## 8. Dormant Project Routes

### HRFlow Pro Frontend (`client/`)

Public: `/login`, `/register`, `/forgot-password`, `*` → NotFound.

Protected (ProtectedRoute → Layout → Sidebar + Header + Outlet):
`/dashboard`, `/employees`, `/employees/:id`, `/departments`, `/attendance`,
`/leave`, `/payroll`, `/recruitment`, `/performance`, `/settings`, `/profile`.
Each maps to the matching `/api/v1/*` resource on `server/`. All pages fall back
to mock data when the API is unreachable.

### Enterprise RBAC Frontend (`enterprise-rbac/frontend/`)

Backend groups: `/api/v1/auth`, `/users`, `/roles`, `/permissions`,
`/organization/{companies,branches,locations,departments,teams,designations}`,
`/audit/{logs,login-history,sessions}`, `/dashboard`.
See `03-ENTERPRISE-RBAC.md`.

---

## 9. Deployment Architecture

```
[Browsers]                    [Android app / PWA]
    |                                |
    +----------------+---------------+
                     | HTTPS
                     v
             Nginx / Apache
                     |
        +------------+------------+
        v                         v
  Static build              PHP-FPM / artisan serve
  master/ | nidhi-impex/    salary-slip-bac (:8000)
  silver-star/                    |
                                  v
                          PostgreSQL
```

Each branch build produces its own output directory, served as a separate
static site with its own API URL baked in.

### Deployments

| | Serves | Database |
|---|---|---|
| `F:\HRMS oldd` | dev / git repo | PostgreSQL `niss_hrms` |
| `E:\HRMS Nidhi` | LAN `192.168.1.53:8000` | PostgreSQL `niss_hrms` (shared with F:) |
| AWS `niss.pro` | public site | PostgreSQL — cutover pending (`00-OVERVIEW.md`) |

The F: and E: deployments share one PostgreSQL database, so a schema change made
from the repo reaches the LAN deployment with no file transfer. AWS shares
neither files nor database. A code change committed in the repo is not live
anywhere until deployed.
