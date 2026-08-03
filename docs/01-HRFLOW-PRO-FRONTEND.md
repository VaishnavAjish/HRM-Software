# HRFlow Pro Frontend (`client/`)

> **Status: dormant.** Added 2026-07-27 in a single drop (2 commits) and
> unchanged since. Not part of the running product and not wired to the
> salary-slip stack. The live frontend is `salary-slip-front/salary-slip-front/`
> — see `04-SALARY-SLIP-FRONTEND.md`. This document still describes `client/`
> accurately because the code has not moved.

## Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | React | 18.3 |
| Language | TypeScript | 5.3 |
| Build Tool | Vite | 5.x |
| Styling | Tailwind CSS | 3.4 |
| Routing | React Router | v6 |
| State (Client) | Zustand | 4.4 |
| State (Server) | TanStack React Query | 5.x |
| HTTP Client | Axios | 1.6 |
| Charts | Recharts | 2.10 |
| Forms | react-hook-form + Zod | 7.48 + 3.22 |
| Icons | Lucide React | 0.294 |
| Notifications | react-hot-toast | 2.4 |
| Utilities | clsx + tailwind-merge | 2.x |

## Directory Structure

```
client/src/
|
+-- api/                         # API client modules (9 files)
|   +-- axios.ts                 # Custom ApiClient class (142 lines)
|   +-- auth.api.ts              # Auth endpoints
|   +-- employees.api.ts         # Employee endpoints
|   +-- attendance.api.ts        # Attendance endpoints
|   +-- leave.api.ts             # Leave endpoints
|   +-- payroll.api.ts           # Payroll endpoints
|   +-- recruitment.api.ts       # Recruitment endpoints
|   +-- performance.api.ts       # Performance endpoints
|   +-- reports.api.ts           # Reports endpoints
|   +-- index.ts                 # Barrel exports
|
+-- components/
|   +-- layout/                  # 3 layout components
|   |   +-- Layout.tsx           # Main layout shell (Sidebar + Header + Outlet)
|   |   +-- Sidebar.tsx          # Collapsible sidebar (10 nav items)
|   |   +-- Header.tsx           # Top bar (search, theme toggle, notifications)
|   +-- ui/                      # 10 reusable UI components
|       +-- Button.tsx           # Variants (primary/secondary/outline/ghost/danger/success)
|       +-- Input.tsx            # Labeled input with icons
|       +-- Select.tsx           # Searchable, clearable, multi-select (278 lines)
|       +-- Textarea.tsx         # Labeled textarea
|       +-- Card.tsx             # Composable card (Card, CardHeader, CardTitle, CardContent)
|       +-- Badge.tsx            # Status badges (6 variants, 2 sizes)
|       +-- Modal.tsx            # Modal dialog with backdrop blur
|       +-- Table.tsx            # Generic table (loading, empty states)
|       +-- Tabs.tsx             # Tab navigation with icon/count badges
|       +-- StatCard.tsx         # Statistics card with trend indicator
|
+-- contexts/                    # React context providers
|   +-- AuthContext.tsx           # Auth state (209 lines)
|   +-- UIContext.tsx             # UI state (116 lines)
|   +-- index.ts
|
+-- hooks/                       # Custom hooks
|   +-- useAuth.ts               # Auth convenience wrapper (32 lines)
|   +-- useApi.ts                # Generic API hooks (useGet, usePost, etc.) (245 lines)
|   +-- index.ts
|
+-- lib/
|   +-- utils.ts                 # cn() utility for Tailwind class merging
|
+-- pages/                       # 15 page components
|   +-- auth/
|   |   +-- Login.tsx            # Login form (111 lines)
|   |   +-- Register.tsx         # Registration form (132 lines)
|   |   +-- ForgotPassword.tsx   # Password reset (90 lines)
|   +-- dashboard/
|   |   +-- Dashboard.tsx        # Welcome, StatCards, charts (253 lines)
|   +-- employees/
|   |   +-- Employees.tsx        # Employee directory (287 lines)
|   |   +-- EmployeeDetail.tsx   # Employee detail (182 lines)
|   +-- departments/
|   |   +-- Departments.tsx      # Department management (152 lines)
|   +-- attendance/
|   |   +-- Attendance.tsx       # Clock in/out, logs (193 lines)
|   +-- leave/
|   |   +-- Leave.tsx            # Leave management (247 lines)
|   +-- payroll/
|   |   +-- Payroll.tsx          # Payroll summary (253 lines)
|   +-- recruitment/
|   |   +-- Recruitment.tsx      # Jobs/candidates (259 lines)
|   +-- performance/
|   |   +-- Performance.tsx      # Reviews/scores (173 lines)
|   +-- profile/
|   |   +-- Profile.tsx          # Personal info (61 lines)
|   +-- settings/
|   |   +-- Settings.tsx         # Company info, notifications (72 lines)
|   +-- NotFound.tsx             # 404 page (25 lines)
|
+-- store/                       # Zustand state stores
|   +-- authStore.ts             # Auth state (203 lines, persisted)
|   +-- uiStore.ts               # UI state (264 lines, persisted)
|   +-- index.ts
|
+-- types/                       # TypeScript type definitions
|   +-- models.ts                # Domain models (341 lines, 50+ interfaces)
|   +-- api.ts                   # API response types (39 lines)
|   +-- index.ts
|
+-- App.tsx                      # Route definitions (101 lines)
+-- main.tsx                     # Entry point
+-- index.css                    # Tailwind directives + custom properties
```

**Total: 46 source files across 14 directories.**

---

## Route Map

### Public Routes (no authentication required)
| Path | Component | Description |
|------|-----------|-------------|
| `/login` | Login | Email/password login form |
| `/register` | Register | New user registration |
| `/forgot-password` | ForgotPassword | Password reset flow |
| `*` | NotFound | 404 page |

### Protected Routes (require authentication)
| Path | Component | Description |
|------|-----------|-------------|
| `/` | Layout (redirects to /dashboard) | Main app shell |
| `/dashboard` | Dashboard | Welcome banner, StatCards, charts |
| `/employees` | Employees | Employee directory with search/filter |
| `/employees/:id` | EmployeeDetail | Single employee detail view |
| `/departments` | Departments | Department grid management |
| `/attendance` | Attendance | Clock in/out, attendance logs |
| `/leave` | Leave | Leave balance, applications, approval |
| `/payroll` | Payroll | Payroll summary, payslip modal |
| `/recruitment` | Recruitment | Job openings, candidate pipeline |
| `/performance` | Performance | Performance reviews, company scores |
| `/settings` | Settings | Company info, notification preferences |
| `/profile` | Profile | Personal information form |

### Route Guard Logic

**ProtectedRoute**:
```
if isLoading -> show loading spinner
if isAuthenticated -> render children (Layout with Outlet)
else -> redirect to /login
```

**PublicRoute**:
```
if isLoading -> show loading spinner
if isAuthenticated -> redirect to /dashboard
else -> render children (Login/Register/ForgotPassword)
```

---

## Authentication Flow

### Login
1. User submits email + password on Login page
2. `AuthContext.login()` calls `POST /api/v1/auth/login`
3. On success: receives accessToken + refreshToken + user data
4. Tokens stored in Zustand `authStore` (persisted to localStorage key `hrflow_auth`)
5. ApiClient configured with Bearer token
6. User redirected to `/dashboard`
7. If API fails, mock fallback creates demo admin user for testing

### Session Restore
1. On app mount, `AuthProvider` calls `initializeAuth()`
2. Reads stored auth from localStorage
3. If tokens exist, calls `GET /api/v1/auth/me` to refresh user data
4. If refresh fails (token expired), clears auth and redirects to `/login`

### Token Refresh
1. ApiClient response interceptor catches 401 errors
2. Queues concurrent requests to avoid multiple refresh calls
3. Calls `POST /api/v1/auth/refresh`
4. On success: updates accessToken, retries original request
5. On failure: clears tokens, redirects to `/login`

---

## API Client Architecture

The `ApiClient` class in `axios.ts` wraps Axios with:
- Base URL from `VITE_API_BASE_URL` env var (default: `http://localhost:5000/api/v1`)
- Request interceptor: adds Bearer token from localStorage
- Response interceptor: automatic 401 handling with token refresh queue
- Methods: `get<T>`, `post<T>`, `put<T>`, `patch<T>`, `delete<T>` (all unwrap `res.data`)
- Token management: `setAuthToken`, `getAuthToken`, `clearAuth`

### API Modules
Each domain module exports an object with typed methods:

| Module | Base URL | Key Methods |
|--------|----------|-------------|
| `auth.api` | /auth | login, register, logout, getCurrentUser, updateProfile, forgotPassword |
| `employees.api` | /employees | getAll, getById, create, update, delete |
| `attendance.api` | /attendance | getAll, getTodayStatus, checkIn, checkOut, getEmployeeStats |
| `leave.api` | /leaves | getAll, getLeaveTypes, applyLeave, approveLeave, rejectLeave, getBalances |
| `payroll.api` | /payroll | getAll, getById, generatePayroll, processPayroll, markPaid, getForm16 |
| `recruitment.api` | /recruitment/jobs, /recruitment/candidates | getJobs, createJob, getCandidates, createCandidate, updateCandidateStatus |
| `performance.api` | /performance/reviews | getReviews, createReview, updateReview |
| `reports.api` | /reports | getDashboardMetrics, exportReport |

---

## State Management (Zustand)

### authStore
Persisted to localStorage (`hrflow_auth` key).
- **State**: user, accessToken, refreshToken, isAuthenticated, isLoading, isInitializing, error
- **Actions**: setAuth, setUser, setTokens, clearAuth, logout, refreshUser, initializeAuth
- **Helpers**: hasRole, isAdmin, isHR, isManager, isEmployee, getToken

### uiStore
Partially persisted (theme + sidebar state only, stored in `hrflow_theme`).
- **State**: theme (light/dark/system), sidebar (open/collapsed/closed), modals, toasts, drawers, loading state, online status, command palette
- **Theme**: cycles through light -> dark -> system; applies to `document.documentElement.classList`
- **Sidebar**: cycles through open -> collapsed -> closed
- **Toasts**: auto-remove after configurable duration (default 5000ms)
- **Online tracking**: via `navigator.onLine`

---

## TypeScript Types

### models.ts (341 lines)
Exports 50+ interfaces for all domain entities:
- Role/Status enums: `UserRole`, `UserStatus`
- Auth: `User`, `AuthTokens`, `LoginCredentials`, `RegisterData`, `AuthState`
- Employee: `Employee`, `BankDetails`, `EmergencyContact`, `Document`
- Department: `Department` (with hierarchy)
- Leave: `LeaveType`, `Leave` (statuses: pending/approved/rejected/cancelled)
- Attendance: `Attendance` (statuses: present/absent/late/half-day/on-leave/holiday)
- Payroll: `Payroll`, `Allowance`, `Deduction` (statuses: draft/processed/paid/cancelled)
- Performance: `PerformanceReview`, `Goal`, `Competency`
- Recruitment: `Candidate`, `Job` (with various statuses)
- Notifications: `Notification` (types: info/success/warning/error/leave/payroll/performance/recruitment)
- Settings: `Settings` (categories: general/payroll/leave/attendance/recruitment/performance/notifications)

### api.ts (39 lines)
- `ApiResponse<T>` - Standard API response wrapper
- `PaginationMeta`, `PaginationParams` - Pagination types
- `ApiError` - Error response type
- `PaginatedResponse<T>` - Paginated data wrapper

---

## Mock Data Fallback
All pages have built-in fallback/mock data for cases when the backend API is unavailable. This enables:
- Demo/presentation mode without a running backend
- Development of frontend features independently
- Testing UI layouts and interactions

Mock credentials (hardcoded in Login.tsx): `admin@hrflowpro.com` / `admin123`

---

## UI Components Summary

| Component | Variants/Features |
|-----------|------------------|
| Button | primary/secondary/outline/ghost/danger/success + sm/md/lg/xl/icon sizes + loading state |
| Input | label, error, hint, leftIcon, rightIcon, leftElement, rightElement |
| Select | searchable, clearable, multi-select with max limit, tag chips |
| Textarea | label, error, hint |
| Card | Card + CardHeader + CardTitle + CardContent |
| Badge | success/warning/error/info/neutral/purple + sm/md |
| Modal | backdrop blur, escape close, configurable maxWidth (sm/md/lg/xl/2xl) |
| Table | generic columns, loading spinner, empty state, row click handler |
| Tabs | icon support, count badges, active state |
| StatCard | title, value, icon, trend (up/down), description, badge |
