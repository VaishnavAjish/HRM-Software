# Repository Overview: HRMS (Human Resource Management System)

## Repository: F:\HRMS oldd

This repository contains **5 sub-projects** that together form a complete Human Resource Management System ecosystem. Each project can run independently or be integrated with the others.

---

## Project Summary Table

| # | Project | Directory | Tech Stack | Port | Database | Purpose |
|---|---------|-----------|------------|------|----------|---------|
| 1 | HRFlow Pro Frontend | `client/` | React 18, TypeScript, Vite 5 | 5173 | - | Modern HR management dashboard |
| 2 | HRFlow Pro Backend | `server/` | Express 4, TypeScript, Mongoose 8 | 5000 | MongoDB | Complete HRMS REST API |
| 3 | Enterprise RBAC Backend | `enterprise-rbac/backend/` | Express 5, TypeScript, Prisma 7 | 5000 | PostgreSQL | Enterprise RBAC API |
| 4 | Enterprise RBAC Frontend | `enterprise-rbac/frontend/` | React 19, TypeScript, Vite 8 | - | - | RBAC management UI |
| 5 | Salary Slip Frontend | `salary-slip-front/` | React 19, Vite 7, Capacitor 8, PWA | 5175 | - | Employee salary slip portal |
| 6 | Salary Slip Backend | `salary-slip-bac/` | Laravel 11+, PHP 8.2, SQLite | 8000 | SQLite | Salary management API |

---

## Project 1: HRFlow Pro Frontend (`client/`)

### Technology Stack
- **Frontend**: React 18, TypeScript, Vite 5, Tailwind CSS 3
- **State Management**: Zustand 4 (with persist middleware)
- **Server State**: TanStack React Query 5
- **Routing**: React Router v6
- **HTTP Client**: Axios (custom ApiClient with token refresh interceptor)
- **Charts**: Recharts
- **Forms**: react-hook-form + Zod
- **Icons**: Lucide React
- **Notifications**: react-hot-toast
- **Utilities**: clsx, tailwind-merge

### Pages (15 pages)
- **Auth**: Login, Register, ForgotPassword
- **Core**: Dashboard, Employees, EmployeeDetail, Departments, Attendance, Leave, Payroll, Recruitment, Performance
- **Settings**: Settings, Profile
- **Fallback**: NotFound

### Architecture Highlights
- JWT-based authentication with mock fallback for demo
- ProtectedRoute/PublicRoute guard pattern
- 10 UI components (Button, Input, Select, Modal, Table, Tabs, Card, Badge, StatCard, Textarea)
- 3 layout components (Header, Sidebar, Layout)
- 9 API modules (auth, employees, attendance, leave, payroll, recruitment, performance, reports)
- All pages use mock data fallback when API calls fail

---

## Project 2: HRFlow Pro Backend (`server/`)

### Technology Stack
- **Runtime**: Node.js >=20
- **Framework**: Express 4
- **Language**: TypeScript 5
- **Database**: MongoDB (via Mongoose 8)
- **Validation**: Zod
- **Authentication**: JWT + bcryptjs, 2FA (speakeasy), email verification
- **Documentation**: Swagger UI (at /api-docs)
- **Logging**: Winston + Morgan
- **Email**: Nodemailer
- **Testing**: Vitest + Supertest

### API Endpoints (12 resource groups, all under `/api/v1`)
| Group | Key Endpoints |
|-------|---------------|
| /auth | register, login, refresh, logout, forgot-password, reset-password, verify-email, me, 2FA enable/verify/disable |
| /employees | CRUD with pagination and search |
| /branches | CRUD |
| /departments | CRUD |
| /attendance | CRUD, check-in, check-out, today-status, stats |
| /leaves | CRUD, types, approve, reject, balances |
| /payroll | CRUD, generate, process, mark-paid, form16 |
| /recruitment | Jobs CRUD, Candidates CRUD, update-status |
| /performance | Reviews CRUD |
| /training | CRUD (stub) |
| /appointments | CRUD (stub) |
| /reports | Dashboard metrics, export |

### Models (16 Mongoose models)
User, Employee, Department, Branch, Attendance, Leave, LeaveType, LeaveBalance, Payroll, SalaryStructure, SalaryComponent, Recruitment, Candidate, Shift, CompensatoryOff, Designation

### Security Features
- Helmet (CSP, HSTS, etc.)
- CORS with configurable origin
- Rate limiting (100/min general, 10/min auth)
- Request IDs
- Account lockout after 5 failed attempts
- 2FA support (TOTP)
- Password history enforcement
- Soft-delete on all models

---

## Project 3: Enterprise RBAC (`enterprise-rbac/`)

### Backend (`enterprise-rbac/backend/`)
- **Framework**: Express 5 with TypeScript 7
- **ORM**: Prisma 7 with PostgreSQL (PGlite adapter)
- **Auth**: JWT + bcryptjs, session management with refresh tokens
- **Authorization**: Fine-grained permission resolver (resource + action)

### API Groups
- `/api/v1/auth` - Login (with account lockout), refresh, logout, me
- `/api/v1/users` - User CRUD, permission overrides, unlock
- `/api/v1/roles` - Role CRUD with system-role protection
- `/api/v1/permissions` - Permission + group CRUD
- `/api/v1/organization` - Companies, Branches, Locations, Departments, Teams, Designations
- `/api/v1/audit` - Audit logs, login history, sessions
- `/api/v1/dashboard` - Stats

### Key Features
- Super Admin role bypasses all permission checks
- Organization hierarchy: Company > Branch > Location > Department > Team > Designation
- Audit logging on all CRUD operations
- Session tracking with IP and user agent
- Account lockout after 5 failed attempts (15 min)

### Frontend (`enterprise-rbac/frontend/`)
- React 19, TypeScript 6, Vite 8
- Tailwind CSS 4
- Zustand 5, TanStack React Query 5, React Table 8
- Manages RBAC entities through UI

---

## Project 4: Salary Slip Frontend (`salary-slip-front/`)

### Technology Stack
- **Core**: React 19, Vite 7, Tailwind CSS 3
- **Routing**: React Router v7
- **Data Grid**: AG Grid Community 35
- **Charts**: Recharts 3
- **PDF/Print**: html2canvas, jsPDF, jspdf-autotable, react-to-print
- **Excel**: xlsx (SheetJS)
- **Mobile**: Capacitor 8 Android app
- **PWA**: vite-plugin-pwa with service worker
- **Notifications**: react-hot-toast
- **Icons**: Lucide React
- **Components**: Headless UI React

### Pages (20+ pages)

**Auth**: Login, AppointmentModal, TrialFormModal, WelcomePopup

**Admin (12)**:
- Dashboard, EmployeeManagement, AddEmployeePage (5-step wizard)
- SalaryManagement, SalaryUploadPage
- Appointments, TrialForm, Reports, Form16
- AdminProfile, Settings
- RBAC: RbacDashboard, RbacUsers, PermissionMatrix, AuditLogs

**Employee (5)**: Dashboard, Payslips, Form16, Profile, EmployeeAppointment

**Agent (1)**: AgentDashboard

### Multi-Company Architecture
The app auto-detects the Git branch and configures itself:
- `nidhi-impex` branch -> Nidhi Impex theme (amber), specific API URL
- `silver-star` branch -> Silver Star theme (sky), specific API URL
- `master` branch -> Master Admin theme (indigo), all companies

### Mobile Support
- Capacitor 8 Android build
- PWA with install prompt and offline cache
- Mobile-responsive layouts

---

## Project 5: Salary Slip Backend (`salary-slip-bac/`)

### Technology Stack
- **Framework**: Laravel 11+ (PHP 8.2)
- **Database**: SQLite (dev), supports MySQL/MariaDB/PostgreSQL/SQLServer
- **Auth**: JWT (tymon/jwt-auth) + Laravel Sanctum
- **Excel**: Maatwebsite/Laravel Excel
- **Testing**: PHPUnit 11

### Key Features
- **Salary Slip Management**: Bulk import from Excel with auto-column detection, month/year parsing, component-summed calculations
- **Employee Management**: CRUD, bulk import from Excel, bank account import
- **RBAC**: Roles, Permissions, Permission Groups, Permission Dimensions (menu/page/module/action/row/field/location/warehouse/branch)
- **User Onboarding**: Multi-step flow (identity verification -> email OTP -> password set)
- **Appointment Forms**: Public job application submissions
- **Trial Forms**: Evaluation form management
- **Agent Management**: Agent CRUD with candidate tracking
- **Upload Tracking**: Batch uploads with per-row pass/fail reporting
- **Audit Logging**: All operations audited

### API Routes
50+ API endpoints across auth, admin, employee, and RBAC operations.

### Seed Data
- `admin@niss.pro` / `1000000002` (Super Admin) — credentials are set by
  `DatabaseSeeder` on first seed and should be changed after first login.

The legacy `admin@superadmin.com` and `devlopertest@gmail.com` super-admin
accounts were removed (shared hardcoded passwords). They are deleted by the
`2026_07_29_000001_remove_legacy_super_admin_accounts` migration.

---

## Cross-Project Integration

```
                    +-----------------------+          +---------------------------+
                    |   HRFlow Pro Client   |          |  Salary Slip Frontend     |
                    |   (React, port 5173)  |          |  (React, port 5175)       |
                    +----------+------------+          +------------+--------------+
                               |                                   |
                               | HTTP                              | HTTP
                               v                                   v
                    +----------+------------+          +------------+--------------+
                    |   HRFlow Pro Server   |          |  Salary Slip Backend      |
                    |   (Express, port 5000)|          |  (Laravel, port 8000)     |
                    +----------+------------+          +------------+--------------+
                               |                                   |
                               | MongoDB                          | SQLite
                               v                                   v
                    +-----------------------+          +---------------------------+
                    |      MongoDB          |          |       SQLite DB           |
                    +-----------------------+          +---------------------------+

                    +-----------------------+          
                    | Enterprise RBAC       |          
                    | (Backend, port 5000)  |          
                    +----------+------------+          
                               |                      
                               | PostgreSQL            
                               v                      
                    +-----------------------+         
                    |      PostgreSQL       |         
                    +-----------------------+         
```

- HRFlow Pro frontend connects to HRFlow Pro backend
- Salary Slip frontend connects to Salary Slip backend
- Enterprise RBAC is a standalone system with its own database
- The root package.json manages salary-slip frontend + backend together
- Each project can be run independently

---

## Running the Projects

### HRFlow Pro (client + server)
```bash
cd client && npm run dev    # Frontend on port 5173
cd server && npm run dev    # Backend on port 5000
```

### Salary Slip (frontend + backend)
```bash
# From root
npm run dev:client  # Frontend on port 5175
npm run dev:server  # Backend on port 8000
# Or together:
npm run dev
```

### Enterprise RBAC
```bash
cd enterprise-rbac/backend && npm run dev    # Backend on port 5000
cd enterprise-rbac/frontend && npm run dev   # Frontend
```
