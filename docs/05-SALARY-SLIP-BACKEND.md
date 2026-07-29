# Salary Slip Backend (`salary-slip-bac/`)

## Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | Laravel | 11+ |
| Language | PHP | ^8.2 |
| Database | SQLite (dev) / MySQL, MariaDB, PostgreSQL, SQLServer (prod) | - |
| Auth | JWT (tymon/jwt-auth) + Laravel Sanctum | 2.3 + 4.3 |
| Excel | Maatwebsite/Laravel Excel | 3.1 |
| Email | Laravel Mail (Nodemailer driver) | - |
| File Storage | League Flysystem (local + S3) | 3.x |
| Testing | PHPUnit | 11.x |
| Development | Laravel Sail, Laravel Pail, Laravel Pint | Latest |

---

## Architecture

Standard Laravel MVC with:
- **Controllers** handle HTTP requests and responses
- **Models** handle Eloquent ORM and business logic
- **Middleware** handles authentication (JWT) and authorization (roles)
- **Migrations** handle database schema (28 migration files)
- **Seeders** handle initial data (admin users, system roles)
- **Routes** define API endpoints (50+ endpoints)

Database: SQLite for local development, with migration support for production databases.

---

## Directory Structure

```
salary-slip-bac/
|
+-- .env                            # Environment configuration
+-- composer.json                   # PHP dependencies
+-- vite.config.js                  # Laravel Vite integration
+-- artisan                         # Laravel CLI
+-- index.php                       # HTTP entry point
|
+-- app/
|   +-- Http/
|   |   +-- Controllers/
|   |   |   +-- Controller.php              # Base controller
|   |   |   +-- AuthController.php          # Authentication (361 lines)
|   |   |   +-- SalariesSlipController.php  # Salary slip CRUD (95 lines)
|   |   |   +-- SettingsController.php      # RBAC settings (74 lines)
|   |   |   +-- UserController.php          # Employee management (911 lines)
|   |   |   +-- Admin/
|   |   |       +-- AdminController.php         # Dashboard + imports (586 lines)
|   |   |       +-- BaseResourceController.php  # Abstract CRUD base (72 lines)
|   |   |       +-- RoleController.php          # Role management (161 lines)
|   |   |       +-- RbacDashboardController.php # RBAC stats (52 lines)
|   |   |       +-- LocationController.php      # Location CRUD (18 lines)
|   |   |       +-- BranchController.php        # Branch CRUD (21 lines)
|   |   |       +-- TeamController.php          # Team CRUD (20 lines)
|   |   |       +-- ApprovalLevelController.php # Approval CRUD (17 lines)
|   |   |       +-- PermissionDimensionController.php # Dimension perms (85 lines)
|   |   |       +-- UserRoleController.php      # User-role assignment (52 lines)
|   |   |       +-- AuditLogController.php      # Audit log viewer (32 lines)
|   |   |       +-- UploadBatchController.php   # Upload history (85 lines)
|   |   +-- Middleware/
|   |       +-- JwtMiddleware.php           # JWT validation (28 lines)
|   |       +-- RoleMiddleware.php          # Role-based access (40 lines)
|   +-- Mail/
|   |   +-- PortalOtpMail.php              # OTP email mailable
|   +-- Models/
|   |   +-- User.php                       # User (JWT auth)
|   |   +-- SalarySlip.php                 # Salary records
|   |   +-- Role.php                       # Roles
|   |   +-- Permission.php                 # Permissions
|   |   +-- PermissionGroup.php            # Permission groups
|   |   +-- PermissionDimension.php        # Dimension permissions
|   |   +-- Department.php                 # Departments
|   |   +-- Location.php                   # Locations
|   |   +-- Branch.php                     # Branches
|   |   +-- Team.php                       # Teams
|   |   +-- ApprovalLevel.php              # Approval levels
|   |   +-- Setting.php                    # Settings
|   |   +-- AuditLog.php                   # Audit logs
|   |   +-- UploadBatch.php                # Upload batches
|   |   +-- UploadBatchRow.php             # Upload batch rows
|   +-- Providers/
|   |   +-- AppServiceProvider.php
|   +-- Support/
|       +-- AuditLogger.php               # Audit logging helper
|
+-- routes/
|   +-- api.php           # API route definitions (167 lines, 50+ endpoints)
|   +-- web.php           # Web routes (welcome, phpinfo)
|   +-- console.php       # Artisan commands
|
+-- config/
|   +-- app.php           # App configuration
|   +-- auth.php          # Auth guards (jwt provider)
|   +-- cors.php          # CORS settings
|   +-- database.php      # Database connections
|   +-- sanctum.php       # Sanctum configuration
|
+-- database/
|   +-- migrations/       # 28 migration files
|   +-- seeders/
|       +-- DatabaseSeeder.php  # Seed admin users
|       +-- RbacSeeder.php      # Seed system roles
|
+-- tests/                # PHPUnit tests
+-- storage/              # Logs, cache, uploads
+-- vendor/               # Composer dependencies
+-- public/               # Public assets
+-- resources/            # Views, language files
+-- bootstrap/            # Framework bootstrap
+-- bin/                  # Binary scripts
```

---

## Authentication System

### JWT Authentication (tymon/jwt-auth)
- **Login**: `POST /api/login` - email + password -> returns JWT token + user data
- **Profile**: `GET /api/profile` - return authenticated user data
- **Logout**: `POST /api/logout` - invalidate JWT token
- **Change Password**: `POST /api/change-password` - verify current password + set new

### Multi-Step Employee Onboarding (`POST /api/new{data}`)
A rate-limited (15/min) multi-step flow for new employees:

| Step | Action | Description |
|------|--------|-------------|
| 0 | Verify Identity | Cross-checks mobile number + date of birth against DB; issues verification_token (valid for 15 min) |
| 1 | Send OTP | Sends 4-digit OTP via email using PortalOtpMail |
| 2 | Verify OTP | Validates the OTP against stored value |
| 3 | Set Password | Sets new password; flips user status from Pending(2) to Active(0); clears OTP/verification tokens |

### Role Resolution (RoleMiddleware)
The `RoleMiddleware` resolves the user role dynamically:

| DB Role Value | User Type | Resolved Role |
|---------------|-----------|---------------|
| 0 | Super Admin | admin |
| 1 | Admin | admin |
| 2 | Manager | admin |
| 0-2 or 'admin' | - | admin |
| 4 or type='agent' | Agent | agent |
| 3 (default) | Employee | employee |

### Middleware Chain
```
Request -> JwtMiddleware (validate JWT) -> RoleMiddleware (check role) -> Controller
```

---

## API Endpoints (all under `/api`)

### Public Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /login | Login with email + password |
| POST | /new{data} | Employee onboarding (rate-limited: 15/min) |
| POST | /appointment | Submit appointment form (public) |
| GET | /appointment | Get appointment forms |

### Any Authenticated User
| Method | Path | Description |
|--------|------|-------------|
| GET | /profile | Get user profile |
| POST | /logout | Logout |
| POST | /change-password | Change password |
| POST | /profile-update | Self-service profile update |

### Admin Only (role:admin)
| Method | Path | Description |
|--------|------|-------------|
| POST | /register | Register new user |
| GET | /admin-dashboard | Dashboard with stats |
| GET | /admin/salary-slip/import-columns | Get import column definitions |
| POST | /admin/salary-slip/store | Bulk import salary slips from Excel |
| GET | /admin/salary-slip/delete | Delete salary slip |
| GET/POST/PUT/DELETE | /department/* | Department CRUD |
| GET/POST/PUT/DELETE | /roles/* | Role CRUD + permission matrix |
| GET/POST/PUT/DELETE | /employee/* | Employee CRUD + imports |
| GET/POST/PUT/DELETE | /rbac/* | RBAC management (locations, branches, teams, approval-levels, permission-dimensions, user-roles, audit-logs, settings) |
| GET/DELETE | /upload-batches/* | Upload batch history |
| POST | /appointment/create-account | Create account from appointment |
| GET/PUT/DELETE | /agents/* | Agent management |
| DELETE | /trial-form/* | Delete trial form |
| GET | /user-data | Clear all caches (dev utility) |
| GET | /fix-units | Fix company units (dev utility) |

### Admin + Agent (role:admin,agent)
| Method | Path | Description |
|--------|------|-------------|
| POST | /trial-form/store | Create trial form |
| GET | /trial-form/list | List trial forms |
| POST | /trial-form/update/:id | Update trial form |
| POST | /appointment/update | Update appointment/employee |

### Admin + Employee (role:admin,employee)
| Method | Path | Description |
|--------|------|-------------|
| GET | /salary-slip/get | List salary slips (role-scoped) |
| GET | /salary-slip/show/:id | Get salary slip detail |

### Employee Only
| Method | Path | Description |
|--------|------|-------------|
| GET | /dashboard | Employee dashboard (slip counts) |

### Agent Only
| Method | Path | Description |
|--------|------|-------------|
| GET | /agent/candidates | Get agent's candidates |

---

## Key Controller Logic

### AdminController::salarySlipImport() (586 lines)
The core salary slip import logic:
1. Reads uploaded Excel file
2. Auto-detects columns by matching headers to database column names (with aliases)
3. Normalizes month names (supports full names, abbreviations, numbers in multiple languages)
4. Parses and normalizes numbers (handles commas, decimals, Indian numbering)
5. Calculates gross total from summed components
6. Calculates deductions total
7. Computes net salary
8. Creates or updates `salary_slips` records
9. Creates `UploadBatch` with per-row success/failure tracking
10. Returns batch summary with counts

### UserController.php (911 lines)
The largest controller with comprehensive employee management:
- **CRUD**: Create, read, update, soft-delete employees
- **Bulk Import**: Excel import with column mapping, creates UploadBatch
- **Account Import**: Bank account details import from Excel
- **Trial Forms**: Create, list, update, delete trial evaluation forms
- **Appointments**: Create, list, update public job applications
- **Agent Management**: List, create, update, delete agents
- **Profile Update**: Self-service with restricted field set
- **Dashboard**: Employee-specific dashboard data
- **Privilege Guarding**: Only Super Admin can create/edit Admin/Super Admin accounts

### AuthController.php (361 lines)
- **login()**: JWT login with account status checks
- **register()**: User registration
- **newData()**: Multi-step employee onboarding
- **changePassword()**: Password change with verification
- **me()**: Get authenticated user

### RoleController.php (161 lines)
- Full CRUD with system-role protection (cannot rename/delete System roles)
- Permission matrix management (get grid, update single role's matrix)
- Permission groups with nested permissions

---

## Database Schema (28 Migrations)

### Core Tables
| Table | Key Fields | Migration |
|-------|-----------|-----------|
| users | id, name, email, password, status (0=Active, 2=Pending), role, emp_code, otp, verification_token, mobile, dob, bank details, aadhar, pan, pf, esi, photo, addresses, trial form fields, added_by, and more | 0001 + 8 additional migrations |
| salary_slips | id, month, year, emp_code, emp_name, department, designation, 20+ salary components, deductions (pf, esi, pt, tds, lwf, advance), net totals, bank info, company_code, unit | 2026_04_30 + 5 additional migrations |
| departments | id, name | 2026_05_15 |

### RBAC Tables (Enterprise)
| Table | Key Fields | Migration |
|-------|-----------|-----------|
| permission_groups | id, name, description | 2026_07_27_102955 |
| permissions | id, name, group_id, description | 2026_07_27_102955 |
| roles | id, name, type (System/Custom), is_active | 2026_07_27_102955 |
| role_permissions | role_id, permission_id | 2026_07_27_102955 |
| user_roles | user_id, role_id | 2026_07_27_102955 |
| user_permissions | user_id, permission_id, is_revoked | 2026_07_27_102955 |

### Extended RBAC Tables
| Table | Key Fields | Migration |
|-------|-----------|-----------|
| locations | id, name, type, country, state, city | 2026_07_27_130000 |
| branches | id, name, code, location_id | 2026_07_27_130000 |
| teams | id, name, department_id | 2026_07_27_130000 |
| approval_levels | id, name, level, type | 2026_07_27_130000 |
| permission_dimensions | id, dimension, role_id, key_name, value, meta | 2026_07_27_130000 |
| audit_logs | id, user_id, action, module, old_value, new_value, ip_address, user_agent | 2026_07_27_130000 |

### Supporting Tables
| Table | Key Fields | Migration |
|-------|-----------|-----------|
| settings | id, key, value, group | 2026_07_27 |
| upload_batches | id, type, company_code, unit, month, year, file_name, totals, uploaded_by | 2026_07_28 |
| upload_batch_rows | id, batch_id, row_number, status, reason, row_data | 2026_07_28 |
| personal_access_tokens | Laravel Sanctum tokens | 2026_04_29 |
| cache, cache_locks | Laravel cache | 0001_01_01 |
| jobs, job_batches, failed_jobs | Laravel queue | 0001_01_01 |
| sessions, password_reset_tokens | Auth | 0001_01_01 |

---

## Seed Data

### DatabaseSeeder.php
Seeds a single super admin and re-asserts its role on every run:

```php
$nissSuperAdmin = User::firstOrCreate(
    ['email' => 'admin@niss.pro'],
    [
        'emp_code'     => 1000000002,
        'name'         => 'NISS Super Admin',
        'password'     => '<set in DatabaseSeeder>',
        'role'         => 0,  // Super Admin
        'company_code' => 'nidhi-impex',
        'status'       => 0,  // Active
    ]
);

// Re-asserted every run so an account edited down to a lower role,
// deactivated or soft-deleted is repaired. `password` is excluded
// because it is cast to `hashed` and would reset a changed password.
$nissSuperAdmin->fill(['role' => 0, 'status' => 0, 'is_deleted' => 0])->save();
$nissSuperAdmin->roles()->syncWithoutDetaching([$superAdminRole->id]);
```

> The former `admin@superadmin.com` and `devlopertest@gmail.com` super admins
> were removed — both shipped with shared hardcoded passwords. The
> `2026_07_29_000001_remove_legacy_super_admin_accounts` migration deletes any
> existing rows, and the seeder no longer recreates them.

### RbacSeeder.php
Seeds 2 System roles:
- "Super Admin" (System type)
- "Admin" (System type)

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| Authentication | JWT (tymon/jwt-auth) with Bearer token |
| Authorization | RoleMiddleware (admin, agent, employee) |
| Account Lockout | Failed attempt tracking via verification_token expiry |
| Rate Limiting | 15 requests/minute on onboarding endpoint |
| Input Validation | Laravel validation rules |
| CORS | Allow all origins, methods, headers |
| Onboarding | 3-step verification (identity check + email OTP + password set) |
| Audit Trail | All RBAC operations logged with old/new values + IP + user agent |
| Field Guarding | Privileged fields protected during self-service updates |
| Soft Delete | Users have is_deleted flag instead of hard delete |

---

## Upload Batch System

The application tracks all bulk imports through an upload batch system:

1. User uploads an Excel file
2. System processes each row
3. Creates `UploadBatch` record (type: salary/employee/account-master)
4. Creates `UploadBatchRow` records per row (status: pass/fail, reason if failed)
5. Returns summary (total, success_count, failed_count)
6. Admin can view batch history and drill into per-row details

Batch types:
- `salary` - Salary slip imports
- `employee` - Employee data imports
- `account-master` - Bank account detail imports
