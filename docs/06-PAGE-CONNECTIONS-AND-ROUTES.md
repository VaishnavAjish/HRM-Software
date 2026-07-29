# Page Connections, Route Maps, and Cross-Project Links

## 1. Complete Route Map: HRFlow Pro Frontend (`client/`)

### Entry Point
```
main.tsx
  +-- QueryClientProvider (TanStack React Query)
  +-- BrowserRouter (React Router v6)
  +-- AuthProvider (Context)
  +-- UIProvider (Context)
  +-- App (Route definitions)
  +-- Toaster (react-hot-toast)
```

### Public Routes
```
/login          -> Login.tsx          (Login form, mock credentials: admin@hrflowpro.com/admin123)
/register       -> Register.tsx       (Registration form)
/forgot-password -> ForgotPassword.tsx (Email-based password reset)
*               -> NotFound.tsx       (404 page)
```

### Protected Routes (wrapped in ProtectedRoute > Layout > Sidebar + Header + Outlet)
```
/               -> Navigate to /dashboard
/dashboard      -> Dashboard.tsx       (GET /api/v1/reports/dashboard)
/employees      -> Employees.tsx       (GET /api/v1/employees)
/employees/:id  -> EmployeeDetail.tsx  (GET /api/v1/employees/:id)
/departments    -> Departments.tsx     (GET /api/v1/departments)
/attendance     -> Attendance.tsx      (GET /api/v1/attendance, POST check-in/out)
/leave          -> Leave.tsx           (GET /api/v1/leaves, POST approve/reject)
/payroll        -> Payroll.tsx         (GET /api/v1/payroll)
/recruitment    -> Recruitment.tsx     (GET /api/v1/recruitment/jobs)
/performance    -> Performance.tsx     (GET /api/v1/performance/reviews)
/settings       -> Settings.tsx        (Company info, notification prefs)
/profile        -> Profile.tsx         (PUT /api/v1/auth/me)
```

### Guard Logic
```
ProtectedRoute:
  if isLoading -> render spinner
  if isAuthenticated -> render children
  else -> Navigate to /login

PublicRoute:
  if isLoading -> render spinner
  if isAuthenticated -> Navigate to /dashboard
  else -> render children
```

### Sidebar Navigation (10 items)
```
1.  /dashboard      - Dashboard (LayoutDashboard icon)
2.  /employees      - Employees (Users icon)
3.  /departments    - Departments (Building2 icon)
4.  /attendance     - Attendance (CalendarCheck icon)
5.  /leave          - Leaves (CalendarDays icon)
6.  /payroll        - Payroll (Wallet icon)
7.  /recruitment    - Recruitment (UserPlus icon)
8.  /performance    - Performance (TrendingUp icon)
9.  /settings       - Settings (Settings icon)
10. /profile        - Profile (UserCircle icon)
```

---

## 2. Complete Route Map: Salary Slip Frontend (`salary-slip-front/`)

### Entry Point
```
main.jsx
  +-- ThemeProvider
  +-- AuthProvider
  +-- CompanyProvider
  +-- AppRoutes
  +-- Toaster
```

### Auth Routes
```
/login          -> Login.jsx (Email/password login)
/               -> Redirect based on role:
                   admin -> /admin
                   agent -> /agent
                   employee -> /employee
*               -> Navigate to /login
```

### Admin Routes (AppLayout sidebar, role=admin required)
```
/admin                      -> Dashboard.jsx         (GET /api/admin-dashboard)
/admin/employees            -> EmployeeManagement.jsx (GET /api/employee/get) AG Grid
/admin/employees/add        -> AddEmployeePage.jsx    (POST /api/employee/store) 5-step wizard
/admin/salary               -> SalaryManagement.jsx   (GET /api/salary-slip/get)
/admin/salary/upload        -> SalaryUploadPage.jsx   (POST /api/admin/salary-slip/store) Excel bulk import
/admin/appointments         -> Appointments.jsx       (GET /api/appointment) AG Grid
/admin/admins               -> Settings.jsx
/admin/rbac                 -> RbacDashboard.jsx      (GET /api/rbac/dashboard)
/admin/rbac/users           -> RbacUsers.jsx          (GET /api/rbac/user-roles)
/admin/rbac/permission-matrix -> PermissionMatrix.jsx (GET /api/roles/matrix, PUT /api/roles/matrix)
/admin/rbac/audit-logs      -> AuditLogs.jsx          (GET /api/rbac/audit-logs)
/admin/trial-form           -> TrialForm.jsx          (GET/POST /api/trial-form/*)
/admin/form16               -> Form16.jsx             (GET /api/reports)
/admin/reports              -> Reports.jsx            (Excel/PDF export)
/admin/profile              -> AdminProfile.jsx       (POST /api/profile-update)
```

### Employee Routes (AppLayout sidebar, role=employee required)
```
/employee               -> EmployeeDashboard.jsx     (GET /api/dashboard)
/employee/payslips      -> Payslips.jsx              (GET /api/salary-slip/get)
/employee/form16        -> EmployeeForm16.jsx
/employee/profile       -> Profile.jsx               (POST /api/profile-update)
/employee/appointment   -> EmployeeAppointment.jsx   (GET /api/appointment)
```

### Agent Routes (AppLayout sidebar, role=agent required)
```
/agent              -> AgentDashboard.jsx
/agent/trial-forms  -> TrialForm.jsx        (shared with admin, GET /api/trial-form/list)
/agent/appointments -> Appointments.jsx     (shared with admin, GET /api/appointment)
```

### Guard Logic
```
ProtectedRoute:
  if initializing -> render "Checking session..." loader
  if not authenticated -> Navigate to /login (preserve location state)
  if requiredRole AND user.role !== requiredRole -> Navigate to role fallback
  else -> render children
```

---

## 3. Enterprise RBAC Frontend Routes (Expected)

Based on backend API structure:

| Path | Expected Page | Backend API |
|------|---------------|-------------|
| / | RBAC Dashboard | GET /api/v1/dashboard/stats |
| /users | User Management | GET/POST /api/v1/users |
| /users/:id | User Detail | GET/PUT/DELETE /api/v1/users/:id |
| /roles | Role Management | GET/POST /api/v1/roles |
| /roles/:id | Role Detail | GET/PUT/DELETE /api/v1/roles/:id |
| /permissions | Permission Management | GET/POST /api/v1/permissions |
| /permissions/groups | Permission Groups | GET/POST /api/v1/permissions/groups |
| /organization/companies | Company Management | GET/POST /api/v1/organization/companies |
| /organization/branches | Branch Management | GET/POST /api/v1/organization/branches |
| /organization/locations | Location Management | GET/POST /api/v1/organization/locations |
| /organization/departments | Department Management | GET/POST /api/v1/organization/departments |
| /organization/teams | Team Management | GET/POST /api/v1/organization/teams |
| /organization/designations | Designation Management | GET/POST /api/v1/organization/designations |
| /audit | Audit Logs | GET /api/v1/audit/logs |
| /audit/login-history | Login History | GET /api/v1/audit/login-history |
| /audit/sessions | Active Sessions | GET/DELETE /api/v1/audit/sessions |

---

## 4. Cross-Project API Connections

### Connection 1: HRFlow Pro (client/ -> server/)
```
client/ (React, port 5173)
  |
  | HTTP (Axios)
  | Base URL: http://localhost:5000/api/v1 (configurable via VITE_API_BASE_URL)
  |
  v
server/ (Express, port 5000)
  |
  | Mongoose
  |
  v
MongoDB Database
```

**API Prefix**: `/api/v1`  
**Auth Mechanism**: JWT Bearer token (auto-refreshed on 401)  
**Frontend Fallback**: All pages have mock data if backend is unreachable

### Connection 2: Salary Slip (salary-slip-front/ -> salary-slip-bac/)
```
salary-slip-front/ (React, port 5175)
  |
  | HTTP (fetch)
  | Base URL: http://192.168.1.53:8000/api (configurable via .env)
  | Multi-company: URL changes based on git branch
  |
  v
salary-slip-bac/ (Laravel, port 8000)
  |
  | Eloquent ORM
  |
  v
SQLite Database (dev) / PostgreSQL (prod)
```

**API Prefix**: `/api`  
**Auth Mechanism**: JWT Bearer token (tymon/jwt-auth)  
**Company Scope**: company_code + unit params auto-appended to requests

### Connection 3: Enterprise RBAC (frontend/ -> backend/)
```
enterprise-rbac/frontend/ (React, Vite)
  |
  | HTTP (Axios)
  | Base URL: http://localhost:5000/api/v1
  |
  v
enterprise-rbac/backend/ (Express, port 5000)
  |
  | Prisma ORM
  |
  v
PostgreSQL Database (PGlite for dev)
```

**API Prefix**: `/api/v1`  
**Auth Mechanism**: JWT Bearer token + httpOnly refresh cookie  
**Authorization**: Fine-grained permission resolver (resource + action)

---

## 5. Data Flows

### Flow 1: Employee Salary Slip Viewing
```
Employee logs in -> POST /api/login (returns JWT)
  -> Redirects to /employee
  -> Clicks "Payslips"
  -> GET /api/salary-slip/get
    -> SalariesSlipController::index()
      -> User role = employee
      -> Scopes query to own records (emp_code)
      -> Returns paginated salary slip list
  -> AG Grid renders table with month/year, earnings, deductions, net
  -> Employee clicks a payslip
  -> GET /api/salary-slip/show/:id
  -> Payslip detail modal with all components
  -> Can print/PDF via react-to-print / jsPDF
```

### Flow 2: Salary Slip Bulk Import (Admin)
```
Admin navigates to /admin/salary/upload
  -> Uploads Excel file
  -> POST /api/admin/salary-slip/store (multipart/form-data)
    -> AdminController::salarySlipImport()
      -> Reads Excel via Maatwebsite/Laravel Excel
      -> Auto-detects columns (matches headers to DB columns)
      -> Normalizes month names, numbers, dates
      -> Calculates gross/net from components
      -> Creates/updates salary_slips records
      -> Creates UploadBatch + UploadBatchRows
      -> Returns batch summary
  -> UploadBatchPanel.jsx shows success/failure counts
  -> User can view per-row details in UploadReportModal
```

### Flow 3: Employee Onboarding (Public)
```
New employee visits login page
  -> Clicks "First Time Login" (or similar)
  -> Step 0: Enter emp_code, mobile, DOB
    -> POST /api/new{data} (step=0)
    -> AuthController::newData()
      -> findEmployeeForReset() - finds by emp_code + company_code + unit
      -> verifyEmployeeIdentity() - cross-checks mobile + DOB
      -> Issues verification_token (valid 15 min)
  -> Step 1: OTP sent to email
    -> POST /api/new{data} (step=1)
    -> sendPasswordResetOtp() - generates 4-digit OTP
    -> PortalOtpMail - sends email with OTP
  -> Step 2: Enter OTP
    -> POST /api/new{data} (step=2)
    -> verifyPasswordResetOtp() - validates OTP
  -> Step 3: Set new password
    -> POST /api/new{data} (step=3)
    -> setNewPasswordAfterVerification()
      -> Hashes and saves password
      -> Clears OTP, verification_token
      -> Flips status from Pending(2) to Active(0)
  -> Can now login via POST /api/login
```

### Flow 4: RBAC Permission Check (Enterprise)
```
Request with JWT arrives
  -> authenticateJWT middleware
    -> Verifies JWT signature and expiry
    -> Loads user from DB with roles + permissions + overrides
    -> Attaches user to req.user
  -> requirePermission('users', 'create') middleware
    -> resolvePermission(user, 'users', 'create'):
      -> Is user "Super Admin"? -> ALLOW (bypass all)
      -> Check user_permission overrides:
        -> Any override matching resource='users', action='create'?
          -> If isRevoked=true -> DENY
          -> If isRevoked=false -> ALLOW
      -> Check role_permissions:
        -> For each user role:
          -> For each role permission:
            -> resource='users' AND (action='create' OR action='*')? -> ALLOW
      -> DENY (403 Forbidden)
```

### Flow 5: HRFlow Pro Authentication
```
Login page
  -> POST /api/v1/auth/login (email + password)
  -> auth.controller validates credentials
  -> Checks account status (ACTIVE?)
  -> Checks lockout (failedAttempts >= 5?)
  -> Compares password hash (bcrypt)
  -> On success:
    -> Generates JWT access token (15 min expiry)
    -> Generates JWT refresh token (7 day expiry)
    -> Resets failed attempts
    -> Updates lastLogin
    -> Returns tokens + user data
  -> Frontend stores in Zustand authStore (persisted to localStorage)
  -> Axios interceptor adds Bearer header
  -> If 401, attempts /auth/refresh
  -> If refresh fails, redirects to /login
```

### Flow 6: Appointment Form (Public)
```
Applicant visits appointment page
  -> AppointmentModal.jsx (2-step form)
  -> Step 1: Fill personal info + employment details
  -> Step 2: Upload documents
  -> POST /api/appointment
    -> UserController::appointmentStore()
      -> Creates appointment record
      -> Returns success
  -> Admin reviews in Appointments.jsx (AG Grid)
  -> Admin can:
    -> Approve/reject
    -> Edit emp_code inline
    -> Print appointment document
    -> Download PDF
    -> Create account (POST /api/appointment/create-account)
```

---

## 6. Data Model Relationships

### Salary Slip Domain (salary-slip-bac)
```
User (1) ---- (N) SalarySlip     # emp_code links them
User (1) ---- (N) UploadBatch    # uploaded_by FK
UploadBatch (1) ---- (N) UploadBatchRow
Role (N) ---- (M) Permission     # via role_permissions
User (N) ---- (M) Role           # via user_roles
User (N) ---- (M) Permission     # via user_permissions (overrides)
PermissionGroup (1) ---- (N) Permission
Location (1) ---- (N) Branch
```

### HRFlow Pro Domain (server/)
```
User (1) --- (1) Employee        # employeeId FK
User (N) --- (1) Branch          # branchId FK
User (N) --- (1) Department      # departmentId FK
User (N) --- (1) User            # reportingManagerId FK (self-ref)
Employee (N) --- (1) Department
Employee (N) --- (1) Designation
User has many: Attendance, Leave, Payroll records
```

### Enterprise RBAC Domain
```
User (N) --- (M) Role            # via user_roles
Role (N) --- (M) Permission      # via role_permissions
User (N) --- (M) Permission      # via user_permissions (overrides)
Permission (N) --- (1) PermissionGroup
Company (1) --- (N) Branch
Branch (1) --- (N) Location
Department (1) --- (N) Team
User (N) --- (1) Designation
User (N) --- (1) Department
User (N) --- (1) Company
User (N) --- (1) Branch
User (N) --- (1) Location
User (N) --- (1) User (manager)  # self-ref
Session (N) --- (1) User
AuditLog (N) --- (1) User
LoginHistory (N) --- (1) User
```

---

## 7. Deployment Architecture

```
Production Environment
=============================

[Client Browsers]           [Mobile Apps (Android)]
       |                           |
       | HTTPS                      | HTTPS
       v                           v
+--------------------------+  +--------------------------+
| Nginx / Apache           |  | Nginx / Apache           |
| Reverse Proxy            |  | Reverse Proxy            |
+--------+-----------------+  +--------+-----------------+
         |                             |
         v                             v
+--------+-----------------+  +--------+-----------------+
| PM2 / Node              |  | PHP-FPM                  |
| HRFlow Pro API (server/) |  | Laravel (salary-slip-bac/)|
| Port 5000               |  | Port 8000                |
+--------+-----------------+  +--------+-----------------+
         |                             |
         v                             v
+--------+-----------------+  +--------+-----------------+
| MongoDB                 |  | PostgreSQL / SQLite      |
+--------------------------+  +--------------------------+

[Vite Static Builds]
+--------------------------+
| client/dist/             |
| salary-slip-front/master/|
| enterprise-rbac/dist/    |
+--------------------------+
         |
         v
+--------------------------+
| Nginx Static Serving     |
+--------------------------+
```

The Vite frontend apps build to static files served by Nginx. The Node.js backend runs under PM2 process manager. The Laravel backend runs under PHP-FPM. Each API can be on the same or different servers depending on scale requirements.
