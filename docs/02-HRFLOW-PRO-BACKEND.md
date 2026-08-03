# HRFlow Pro Backend (`server/`)

> **Status: dormant.** Added 2026-07-27 in a single drop (2 commits) and
> unchanged since. Its MongoDB database is separate from everything else in the
> repository. The live API is `salary-slip-bac/` — see
> `05-SALARY-SLIP-BACKEND.md`. This document still describes `server/`
> accurately because the code has not moved.

## Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Runtime | Node.js | >=20.0 |
| Framework | Express | 4.19 |
| Language | TypeScript | 5.5 |
| Database | MongoDB (via Mongoose) | 8.5 |
| Validation | Zod | 3.23 |
| Auth | JWT (jsonwebtoken) + bcryptjs | 9.0 + 2.4 |
| 2FA | speakeasy | 2.0 |
| Documentation | Swagger (swagger-jsdoc + swagger-ui-express) | 6.x |
| Logging | Winston + Morgan | 3.x |
| Email | Nodemailer | 6.9 |
| File Upload | Multer + Sharp | 1.4 + 0.33 |
| Testing | Vitest + Supertest | 2.x |
| Rate Limiting | express-rate-limit | 7.4 |

---

## Directory Structure

```
server/src/
|
+-- app.ts                         # Express application setup (293 lines)
|   - Middleware pipeline (helmet, cors, compression, cookie-parser, morgan)
|   - Rate limiting (100/min general, 10/min auth)
|   - Swagger UI setup at /api-docs
|   - Route mounting (12 resource groups)
|   - Error handlers (404 + global)
|   - Database connection initialization
|
+-- index.ts                       # Server entry point
+-- seed.ts                        # Database seed script
|
+-- config/
|   +-- environment.ts             # Zod-validated environment config (183 lines, 70+ vars)
|   +-- database.ts                # MongoDB connection with retry logic
|
+-- routes/                        # 13 route files
|   +-- index.ts                   # Route aggregator
|   +-- auth.routes.ts             # 12 endpoints (register, login, refresh, logout, 2FA, etc.)
|   +-- employee.routes.ts         # Employee CRUD
|   +-- branch.routes.ts           # Branch CRUD
|   +-- department.routes.ts       # Department CRUD
|   +-- attendance.routes.ts       # Attendance tracking
|   +-- leave.routes.ts            # Leave management
|   +-- payroll.routes.ts          # Payroll processing
|   +-- recruitment.routes.ts      # Recruitment
|   +-- performance.routes.ts      # Performance reviews
|   +-- training.routes.ts         # Training (stub)
|   +-- appointment.routes.ts      # Appointments (stub)
|   +-- report.routes.ts           # Reports & analytics
|
+-- controllers/                   # 12 controller files
|   +-- auth.controller.ts         # Full auth implementation (real logic)
|   +-- employee.controller.ts     # Employee CRUD (real logic)
|   +-- branch.controller.ts       # Branch CRUD (real logic)
|   +-- department.controller.ts   # Department CRUD (real logic)
|   +-- attendance.controller.ts   # Attendance tracking (real logic)
|   +-- leave.controller.ts        # Leave management (real logic)
|   +-- payroll.controller.ts      # Payroll processing (real logic)
|   +-- recruitment.controller.ts  # Stub implementation
|   +-- performance.controller.ts  # Stub implementation
|   +-- training.controller.ts     # Stub implementation
|   +-- appointment.controller.ts  # Stub implementation
|   +-- report.controller.ts       # Stub implementation
|
+-- models/                        # 16 Mongoose models
|   +-- User.ts                    # User with profile, address, preferences, security (304 lines)
|   +-- Employee.ts                # Employee details
|   +-- Department.ts              # Department
|   +-- Branch.ts                  # Branch/office locations
|   +-- Attendance.ts              # Attendance records
|   +-- Leave.ts                   # Leave applications
|   +-- LeaveType.ts               # Leave types/categories
|   +-- LeaveBalance.ts            # Leave balances per employee
|   +-- Payroll.ts                 # Payroll records
|   +-- SalaryStructure.ts         # Salary structures
|   +-- SalaryComponent.ts         # Salary components
|   +-- Recruitment.ts             # Job postings
|   +-- Candidate.ts               # Job candidates
|   +-- Shift.ts                   # Work shifts
|   +-- CompensatoryOff.ts         # Compensatory off tracking
|   +-- Designation.ts             # Job designations
|
+-- middleware/                    # 4 middleware files
|   +-- auth.middleware.ts         # JWT verification + session validation
|   +-- role.middleware.ts         # Role-based access control
|   +-- error.middleware.ts        # Global error handler + 404 handler
|   +-- validation.middleware.ts   # Zod schema validation middleware
|
+-- validators/                    # 11 validator files
|   +-- auth.validator.ts         # Auth validation schemas
|   +-- employee.validator.ts     # Employee validation schemas
|   +-- branch.validator.ts       # Branch validation schemas
|   +-- attendance.validator.ts   # Attendance validation schemas
|   +-- leave.validator.ts        # Leave validation schemas
|   +-- payroll.validator.ts      # Payroll validation schemas
|   +-- performance.validator.ts  # Performance validation schemas
|   +-- recruitment.validator.ts  # Recruitment validation schemas
|   +-- report.validator.ts       # Report validation schemas
|   +-- training.validator.ts     # Training validation schemas
|   +-- appointment.validator.ts  # Appointment validation schemas
|
+-- types/
|   +-- api.ts                    # API response types
|   +-- express.d.ts              # Express Request type extensions
|
+-- utils/
|   +-- jwt.ts                    # JWT sign/verify helpers
|   +-- password.ts               # Password validation rules
|   +-- email.ts                  # Email service (Nodemailer)
|   +-- logger.ts                 # Winston logger with daily rotation
|   +-- helpers.ts                # General utility functions
|
+-- plugins/
|   +-- softDelete.ts             # Mongoose soft-delete plugin
```

---

## API Endpoints (all under `/api/v1`)

### Authentication
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/register | No | Register new user |
| POST | /auth/login | No | Login with email/username + password |
| POST | /auth/refresh | No | Refresh access token |
| POST | /auth/logout | JWT | Logout (invalidate session) |
| POST | /auth/forgot-password | No | Request password reset email |
| POST | /auth/reset-password | No | Reset password with token |
| POST | /auth/verify-email | No | Verify email with token |
| GET | /auth/me | JWT | Get current user profile |
| PUT | /auth/me | JWT | Update profile |
| PUT | /auth/me/password | JWT | Change password |
| POST | /auth/me/2fa/enable | JWT | Enable two-factor auth |
| POST | /auth/me/2fa/verify | JWT | Verify 2FA token |
| POST | /auth/me/2fa/disable | JWT | Disable two-factor auth |

### Employees
| Method | Path | Description |
|--------|------|-------------|
| GET | /employees | List employees (paginated, searchable) |
| GET | /employees/:id | Get employee by ID |
| POST | /employees | Create new employee |
| PUT | /employees/:id | Update employee |
| DELETE | /employees/:id | Soft-delete employee |

### Departments
| Method | Path | Description |
|--------|------|-------------|
| GET | /departments | List departments |
| GET | /departments/:id | Get department |
| POST | /departments | Create department |
| PUT | /departments/:id | Update department |
| DELETE | /departments/:id | Delete department |

### Branches
| Method | Path | Description |
|--------|------|-------------|
| GET | /branches | List branches |
| GET | /branches/:id | Get branch |
| POST | /branches | Create branch |
| PUT | /branches/:id | Update branch |
| DELETE | /branches/:id | Delete branch |

### Attendance
| Method | Path | Description |
|--------|------|-------------|
| GET | /attendance | List attendance records |
| GET | /attendance/today | Get today's attendance status |
| POST | /attendance/check-in | Check in |
| POST | /attendance/check-out | Check out |
| GET | /attendance/stats | Get attendance statistics |

### Leaves
| Method | Path | Description |
|--------|------|-------------|
| GET | /leaves | List leave applications |
| GET | /leaves/types | Get leave types |
| POST | /leaves | Apply for leave |
| POST | /leaves/:id/approve | Approve leave |
| POST | /leaves/:id/reject | Reject leave |
| GET | /leaves/balances | Get leave balances |

### Payroll
| Method | Path | Description |
|--------|------|-------------|
| GET | /payroll | List payroll records |
| GET | /payroll/:id | Get payroll detail |
| POST | /payroll/generate | Generate payroll |
| POST | /payroll/:id/process | Process payroll |
| POST | /payroll/:id/pay | Mark as paid |
| GET | /payroll/form16/:employeeId | Get Form16 for employee |

### Recruitment
| Method | Path | Description |
|--------|------|-------------|
| GET | /recruitment/jobs | List job openings |
| POST | /recruitment/jobs | Create job posting |
| GET | /recruitment/candidates | List candidates |
| POST | /recruitment/candidates | Add candidate |
| PATCH | /recruitment/candidates/:id/status | Update candidate status |

### Performance
| Method | Path | Description |
|--------|------|-------------|
| GET | /performance/reviews | List performance reviews |
| POST | /performance/reviews | Create review |
| PUT | /performance/reviews/:id | Update review |

### Reports
| Method | Path | Description |
|--------|------|-------------|
| GET | /reports/dashboard | Get dashboard metrics |
| GET | /reports/export | Export report (Excel/PDF) |

---

## User Model (Most Complex Model)

### Fields
- **Core**: email (unique), username (unique), password (hashed, select: false)
- **Role**: UserRole enum (ADMIN, HR_MANAGER, DEPT_HEAD, EMPLOYEE)
- **Status**: UserStatus enum (ACTIVE, INACTIVE, SUSPENDED, PENDING_VERIFICATION)
- **Profile**: firstName, lastName, middleName, displayName, avatar, phone, alternatePhone, dateOfBirth, gender, maritalStatus, nationality
- **Address**: line1, line2, city, state, postalCode, country
- **Preferences**: theme (LIGHT/DARK/SYSTEM), language, timezone, dateFormat, timeFormat, notifications (email/push/sms/inApp), dashboardLayout
- **Security**: passwordLastChanged, passwordResetToken, emailVerificationToken, emailVerified, phoneVerified, twoFactorEnabled, twoFactorSecret, backupCodes, lastLoginAt, lastLoginIp, failedLoginAttempts, lockedUntil, sessionTokens
- **Relations**: employeeId (ref Employee), branchId (ref Branch), departmentId (ref Department), reportingManagerId (ref User)

### Virtuals
- fullName (computed from profile fields)
- employee (populated from employeeId)
- branch, department, reportingManager
- directReports (users reporting to this user)

### Indexes
- email, username (unique)
- role + status (compound)
- branchId + departmentId (compound)
- Text index on email, username, profile.firstName, profile.lastName

### Pre-save Hooks
- Auto-hash password on modification
- Auto-generate displayName
- Account lockout after 5 failed attempts (30 min lock)

### Methods
- `comparePassword(candidatePassword)` - bcrypt comparison
- `generatePasswordResetToken()` - crypto token + SHA256 hash
- `generateEmailVerificationToken()` - crypto token
- `generateTwoFactorSecret()` - speakeasy TOTP secret
- `verifyTwoFactorToken(token)` - TOTP verification with 2-step window
- `generateBackupCodes()` - 10 backup codes (SHA256 hashed)

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| CSP | Helmet with strict directives |
| HSTS | 1 year, includeSubDomains, preload |
| CORS | Configurable origin, credentials support |
| Rate Limiting | 100 req/min general, 10 req/min auth |
| Request IDs | UUID on every request |
| Password Hashing | bcrypt with 12 salt rounds |
| Password Policy | 12-128 chars, uppercase, lowercase, numbers, special, no 3+ repeating |
| Password History | Last 5 passwords tracked |
| Account Lockout | After 5 failed attempts, 30 min lock |
| 2FA | TOTP via speakeasy with backup codes |
| Email Verification | Token-based verification |
| File Upload | MIME type + size restrictions (10MB) |
| Soft Delete | All models have deletedAt + deletedBy |
| Input Validation | Zod schemas on all inputs |
| Cookie Signing | Signed cookies with secret |
| Logging | Winston with daily rotation |

---

## Configuration (environment.ts)

The environment config uses Zod for validation with 70+ configuration variables:

| Category | Key Variables |
|----------|--------------|
| Server | NODE_ENV, PORT (5000), HOST, API_PREFIX (/api/v1), CLIENT_URL |
| MongoDB | MONGODB_URI, maxPoolSize (10), minPoolSize (2), timeouts |
| JWT | Access/Refresh secrets (min 32 chars), expiry (15m/7d), issuer, audience |
| Password | minLength (12), maxLength (128), complexity requirements |
| CORS | Origin, credentials |
| Rate Limit | windowMs (15min), maxRequests (100), authMaxRequests (10) |
| SMTP | Host, port, secure, user, pass, from |
| Upload | maxFileSize (10MB), allowedMIME types, directory |
| Swagger | enabled (true), path (/api-docs) |
| Redis | URL, enabled |
| Encryption | Key (32 chars), IV (16 chars) |

---

## CORS Configuration

```typescript
{
  origin: config.cors.origin,       // Configurable URL
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Requested-With'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400,
}
```

---

## Swagger API Documentation

Available at `/api/v1/docs` (redirects to `/api-docs`) when enabled.

- OpenAPI 3.0.3 spec
- Auto-generated from JSDoc comments in route files
- Bearer JWT + cookie auth
- 12 API tag groups
- Persistent authorization, request duration display, filtering

---

## All Models (16 total)

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| User | email, username, password, role, status, profile, preferences, security | System users |
| Employee | employeeId, department, position, joiningDate, salary | Employee records |
| Department | name, code, description, manager, parent | Department hierarchy |
| Branch | name, code, address, phone, status | Office locations |
| Attendance | employeeId, date, checkIn, checkOut, status, overtime | Daily attendance |
| Leave | employeeId, type, startDate, endDate, status, reason | Leave applications |
| LeaveType | name, code, days, gender, carryForward | Leave categories |
| LeaveBalance | employeeId, leaveType, total, used, remaining | Leave balances |
| Payroll | employeeId, period, earnings, deductions, netPay, status | Payroll records |
| SalaryStructure | name, components, total, effectiveDate | Salary templates |
| SalaryComponent | name, type (earning/deduction), amount, formula | Salary components |
| Recruitment | title, department, openings, status, description | Job postings |
| Candidate | jobId, name, email, phone, resume, status, stage | Job candidates |
| Shift | name, startTime, endTime, gracePeriod | Work shifts |
| CompensatoryOff | employeeId, date, reason, status, expiryDate | Comp off tracking |
| Designation | title, level, department, description | Job designations |
