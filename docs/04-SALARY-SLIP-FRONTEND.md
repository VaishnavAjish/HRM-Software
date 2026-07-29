# Salary Slip Frontend (`salary-slip-front/`)

## Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | React | 19.2 |
| Build Tool | Vite | 7.x |
| Styling | Tailwind CSS | 3.4 |
| Routing | React Router | 7.14 |
| Data Grid | AG Grid Community | 35.2 |
| Charts | Recharts | 3.8 |
| PDF Generation | html2canvas + jsPDF + jspdf-autotable | Latest |
| Print | react-to-print | 3.3 |
| Excel | xlsx (SheetJS) | 0.18 |
| Icons | Lucide React | 1.14 |
| Notifications | react-hot-toast | 2.6 |
| UI Components | Headless UI React | 2.2 |
| Mobile | Capacitor 8 (Android) | - |
| PWA | vite-plugin-pwa | 1.2 |

---

## Multi-Company Architecture

The application supports 3 company modes determined by the Git branch name:

| Branch | Company | Theme Color | App Title |
|--------|---------|-------------|-----------|
| `nidhi-impex` | Nidhi Impex | Amber | Nidhi Impex - HRMS |
| `silver-star` | Silver Star | Sky | Silver Star - HRMS |
| `master` | Master Admin | Indigo | Master Admin - HRMS |

The Vite config (`vite.config.js`) auto-detects the active branch at build time and configures the app title, color theme, API URL, and build output directory accordingly. Build output goes into a folder named after the branch.

---

## Directory Structure

```
salary-slip-front/
|
+-- salary-slip-front/              # Main source directory
|   +-- src/
|   |   +-- main.jsx                # Entry point (applies theme color)
|   |   +-- App.jsx                 # Route definitions (203 lines)
|   |   +-- index.css               # Tailwind styles
|   |   +-- App.css                 # App-level styles
|   |   +-- config/
|   |   |   +-- companyConfig.js    # Company ID resolution & scope
|   |   +-- context/
|   |   |   +-- AuthContext.jsx     # Auth state (247 lines)
|   |   |   +-- CompanyContext.jsx  # Company scope switching
|   |   |   +-- ThemeContext.jsx    # Dark mode toggling
|   |   +-- hooks/
|   |   |   +-- useInstallPWA.js    # PWA install prompt hook
|   |   |   +-- useGridHeaderContextMenu.js # AG Grid header menu
|   |   |   +-- useIsMobile.js      # Mobile detection hook
|   |   +-- utils/
|   |   |   +-- api.js              # API client (801 lines)
|   |   |   +-- url.js              # Base URL configuration
|   |   |   +-- validation.js       # Form validation helpers
|   |   |   +-- payslipUtils.js     # Payslip data utilities
|   |   |   +-- form16Utils.js      # Form16 calculations
|   |   |   +-- exportUtils.js      # Excel/CSV/PDF export (2041 lines)
|   |   |   +-- pdfUtils.js         # PDF generation helpers
|   |   +-- components/
|   |   |   +-- layout/
|   |   |   |   +-- AppLayout.jsx   # Main app layout with sidebar
|   |   |   +-- admin/
|   |   |   |   +-- UploadBatchPanel.jsx
|   |   |   |   +-- UploadReportModal.jsx
|   |   |   +-- forms/              # Form components
|   |   |   +-- form16/             # Form16 PDF components
|   |   |   +-- payslip/            # Payslip components
|   |   |   +-- rbac/               # RBAC management components
|   |   |   +-- ui/                 # Generic UI components
|   |   |   +-- ModernDatePicker.jsx
|   |   +-- pages/
|   |   |   +-- auth/
|   |   |   |   +-- Login.jsx
|   |   |   |   +-- AppointmentModal.jsx (1595 lines)
|   |   |   |   +-- TrialFormModal.jsx (588 lines)
|   |   |   |   +-- WelcomePopup.jsx
|   |   |   +-- admin/ (12 page directories + 15 routes)
|   |   |   |   +-- Dashboard.jsx
|   |   |   |   +-- EmployeeManagement.jsx (1563 lines)
|   |   |   |   +-- AddEmployeePage.jsx (1157 lines)
|   |   |   |   +-- SalaryManagement.jsx
|   |   |   |   +-- SalaryUploadPage.jsx
|   |   |   |   +-- Appointments.jsx (2011 lines)
|   |   |   |   +-- TrialForm.jsx (1247 lines)
|   |   |   |   +-- Reports.jsx
|   |   |   |   +-- Form16.jsx
|   |   |   |   +-- AdminProfile.jsx
|   |   |   |   +-- Settings.jsx
|   |   |   |   +-- rbac/
|   |   |   |       +-- RbacDashboard.jsx
|   |   |   |       +-- RbacUsers.jsx
|   |   |   |       +-- PermissionMatrix.jsx
|   |   |   |       +-- AuditLogs.jsx
|   |   |   +-- employee/ (5 pages)
|   |   |   |   +-- Dashboard.jsx
|   |   |   |   +-- Payslips.jsx
|   |   |   |   +-- Form16.jsx
|   |   |   |   +-- Profile.jsx
|   |   |   |   +-- EmployeeAppointment.jsx
|   |   |   +-- agent/
|   |   |       +-- AgentDashboard.jsx
|   |   +-- data/
|   |       +-- mockData.js
|   +-- .env                        # Dev environment
|   +-- .env.production             # Production environment
|
+-- android/                        # Capacitor Android project
+-- capacitor.config.json           # Capacitor configuration
+-- vite.config.js                  # Vite config (159 lines)
+-- tailwind.config.js              # Tailwind configuration
+-- postcss.config.js
+-- eslint.config.js
+-- package.json                    # Dependencies
```

**Total: 20+ page components, 20+ utility/component files, 3 contexts, 3 hooks.**

---

## Route Map

### Auth (Public)
| Path | Page | Description |
|------|------|-------------|
| `/login` | Login | Email/password login form |
| `/` | Redirect | Auto-redirects based on role: /admin, /employee, or /agent |

### Admin Routes (require admin role) - all under `/admin` with `AppLayout`
| Path | Page | Description |
|------|------|-------------|
| `/admin` | AdminDashboard | Dashboard with stats |
| `/admin/employees` | EmployeeManagement | AG Grid employee list (1563 lines) |
| `/admin/employees/add` | AddEmployeePage | 5-step wizard + bulk upload (1157 lines) |
| `/admin/salary` | SalaryManagement | Salary slip list |
| `/admin/salary/upload` | SalaryUploadPage | Excel bulk import |
| `/admin/appointments` | Appointments | AG Grid with inline editing (2011 lines) |
| `/admin/admins` | Settings | Admin settings |
| `/admin/rbac` | RbacDashboard | RBAC dashboard |
| `/admin/rbac/users` | RbacUsers | User-role management |
| `/admin/rbac/permission-matrix` | PermissionMatrix | Role-permission grid |
| `/admin/rbac/audit-logs` | AuditLogs | Audit log viewer |
| `/admin/trial-form` | TrialForm | Trial form management (1247 lines) |
| `/admin/form16` | AdminForm16 | Form16 generation |
| `/admin/reports` | Reports | Report viewer/exporter |
| `/admin/profile` | AdminProfile | Profile editing |

### Employee Routes (require employee role) - all under `/employee`
| Path | Page | Description |
|------|------|-------------|
| `/employee` | EmployeeDashboard | Employee dashboard |
| `/employee/payslips` | Payslips | View own payslips |
| `/employee/form16` | EmployeeForm16 | View own Form16 |
| `/employee/profile` | Profile | Edit personal profile |
| `/employee/appointment` | EmployeeAppointment | Appointment status |

### Agent Routes (require agent role) - all under `/agent`
| Path | Page | Description |
|------|------|-------------|
| `/agent` | AgentDashboard | Agent dashboard |
| `/agent/trial-forms` | TrialForm | Trial form management (shared component) |
| `/agent/appointments` | Appointments | Appointment management (shared component) |

### Route Guard Logic
```
ProtectedRoute({
  requiredRole
  if initializing -> show loading spinner "Checking session..."
  if not authenticated -> redirect to /login (preserving location state)
  if requiredRole AND user.role !== requiredRole -> redirect to role-appropriate fallback
  else -> render children
})
```

---

## Key Page Details

### EmployeeManagement.jsx (1563 lines)
- Full CRUD employee list with AG Grid
- Column visibility toggling
- Server-side search and pagination
- Export to Excel
- Role-specific data scoping

### AddEmployeePage.jsx (1157 lines)
- 5-section stepper wizard:
  1. Personal Information
  2. Employment Details
  3. Bank Details
  4. Documents Upload
  5. Review & Submit
- Bulk upload with column mapping
- Account master support (bulk bank account import)

### Appointments.jsx (2011 lines)
- AG Grid with all appointment data
- Inline emp_code editing
- Approve/reject actions
- Print with document pages
- PDF download
- CreateCandidateAccount modal

### TrialForm.jsx (1247 lines)
- Nidhi Impex-only feature
- AG Grid with mobile card view
- Approve/reject functionality
- Process to appointment flow
- Print/PDF generation

### exportUtils.js (2041 lines)
- Excel export (CSV/XLSX)
- PDF export
- Legacy Form16 PDF
- New Form16 PDF (3-page ITR-style)
- Legacy payslip PDF
- New branded payslip PDF with company logo

### AppointmentModal.jsx (1595 lines)
- 2-step appointment form (form fields + document upload)
- Edit/prefill support for existing records
- Emp code transfer confirmation dialog

---

## API Client (`utils/api.js`)

A custom fetch-based API client (801 lines) with:

- **Base URL resolution** from company config
- **Company scope** automatically appended to requests (company_code, unit)
- **No-store cache** policy (critical for Android WebView)
- **Automatic 401 handling**: dispatches `auth:unauthorized` event to clear session
- **FormData support** for file uploads
- **Error handling**: parses server error messages

### API Modules

The `api.js` file contains all API functions organized by feature:

| Feature | Key API Functions |
|---------|------------------|
| Auth | login, logout, getProfile |
| Dashboard | getAdminDashboard, getEmployeeDashboard |
| Employees | list, show, store, update, destroy, import, importAccountDetail |
| Salary Slips | list, show, importColumns, store, delete |
| Departments | list, store, update, destroy |
| Roles | list, show, store, update, destroy, permissions, matrix, updateMatrix |
| RBAC | dashboard, auditLogs, settings, userRoles, uploadBatches |
| Trial Forms | store, list, update, delete |
| Appointments | store, get, update |
| Reports | reports, export |
| Profile | updateProfile, changePassword |

---

## Context Providers

### AuthContext.jsx (247 lines)
- User state management with sessionStorage persistence
- Role resolution logic:
  - `role=0,1,2` or `type='admin'` -> `admin`
  - `role=4` or `type='agent'` -> `agent`
  - everything else -> `employee`
- Session restore on app load via `GET /api/profile`
- Auto-logout on 401 via `auth:unauthorized` window event
- `buildAuthUser()` normalizes various API response formats into a consistent user object

### CompanyContext.jsx
- Manages company scope switching
- Resolves company ID and unit from user's company_code

### ThemeContext.jsx
- Dark/light mode toggling with persistence

---

## Mobile & PWA Support

### Capacitor 8 Android
- Full Android app via `npx cap run android`
- Build configurations:
  - `npm run mobile:build` - Dev build with 10.0.2.2 API URL
  - `npm run mobile:build:prod` - Production build
  - `npm run mobile:run:android` - Build + run on device/emulator

### PWA (Progressive Web App)
- Service worker via `vite-plugin-pwa`
- Auto-update on new version
- Precache all built assets (up to 4MB per file)
- Runtime cache for Google Fonts (CacheFirst, 1 year)
- SPA navigation fallback to index.html
- Web App Manifest with icons, themes, standalone display
- Offline support

---

## Environment Configuration

### `.env` (Development)
```
VITE_ENV=DEV
VITE_API_BASE_URL=http://192.168.1.53:8000/api
VITE_PROD_URL_MASTER=https://niss.pro/api
VITE_PROD_URL_NIDHI_IMPEX=https://niss.pro/api
VITE_PROD_URL_SILVER_STAR=https://niss.pro/api
```

### `.env.production` (Production)
- Similar structure with production API URLs

---

## Build Configuration

Vite config highlights:
- **Multi-company**: Branch-based app title, color, API URL
- **PWA**: Full service worker with precaching and runtime caching
- **Code splitting**: AG Grid separate chunk to reduce main bundle size
- **Manual chunks**: ag-grid split into separate chunk
- **Server**: host: true, port: 5175
- **Dev tools**: SW enabled in dev mode for testing
