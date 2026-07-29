# Enterprise RBAC (`enterprise-rbac/`)

## Overview

A complete, standalone Role-Based Access Control system with a backend API and frontend management UI. Designed for enterprise-grade authorization with fine-grained permission control, organization hierarchy, and complete audit trail.

---

## Backend (`enterprise-rbac/backend/`)

### Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Runtime | Node.js | Latest |
| Framework | Express | 5.2 |
| Language | TypeScript | 7.x |
| ORM | Prisma | 7.9 |
| Database | PostgreSQL (PGlite adapter for dev) | - |
| Auth | JWT + bcryptjs | 9.0 + 3.0 |
| Validation | express-validator | 7.3 |
| Security | Helmet, CORS, Rate Limiting | Latest |

### Directory Structure

```
backend/
+-- .env                           # Environment variables
+-- package.json                   # Dependencies
+-- tsconfig.json                  # TypeScript config
+-- prisma/
|   +-- schema.prisma              # Database schema (all models)
|   +-- seed.ts                    # Database seed script
+-- src/
    +-- server.ts                  # Entry point (port 5000)
    +-- app.ts                     # Express app setup
    +-- config/
    |   +-- db.ts                  # Prisma client singleton
    +-- controllers/               # 7 controllers
    |   +-- authController.ts      # Login (with lockout), refresh, logout, me
    |   +-- userController.ts      # User CRUD + permission overrides + unlock
    |   +-- roleController.ts      # Role CRUD with system-role protection
    |   +-- permissionController.ts# Permission + group CRUD
    |   +-- organizationController.ts # Generic CRUD factory for 6 org entities
    |   +-- dashboardController.ts # Stats/recent activity
    |   +-- auditController.ts     # Audit logs, login history, sessions
    +-- middlewares/                # 4 middleware files
    |   +-- auth.ts                # JWT authentication
    |   +-- rbac.ts                # Permission resolver (Super Admin bypass)
    |   +-- rateLimiter.ts         # Auth (10/15min) + API (300/min) limits
    |   +-- validate.ts            # express-validator error handler
    +-- routes/                    # 7 route files
    |   +-- auth.ts                # POST login, refresh, logout; GET me
    |   +-- users.ts               # CRUD + overrides + unlock
    |   +-- roles.ts               # CRUD
    |   +-- permissions.ts         # Permissions + groups CRUD
    |   +-- organization.ts        # 6 entity CRUD routes
    |   +-- audit.ts               # Logs, history, sessions
    |   +-- dashboard.ts           # Stats
    +-- services/                  # 5 service files
    |   +-- crudFactory.ts         # Generic CRUD factory
    |   +-- userService.ts         # User business logic
    |   +-- roleService.ts         # Role business logic
    |   +-- permissionService.ts   # Permission business logic
    |   +-- organizationService.ts # Entity services via factory
    +-- utils/
    |   +-- apiError.ts            # Custom error classes
    |   +-- asyncHandler.ts        # Async error wrapper
    |   +-- audit.ts               # Audit logging utility
    |   +-- tokens.ts              # JWT token generation
    +-- validators/                # 5 validator files
        +-- auth.validators.ts
        +-- user.validators.ts
        +-- role.validators.ts
        +-- permission.validators.ts
        +-- organization.validators.ts
```

---

### API Endpoints

#### Health Check
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/health | No | Health check |

#### Authentication (`/api/v1/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /login | No | Login (username/email + password) |
| POST | /refresh | Cookie | Refresh access token |
| POST | /logout | Cookie | Logout (revoke session) |
| GET | /me | JWT | Get current user with roles/permissions |

#### Users (`/api/v1/users`)
| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | / | users:read | List users (paginated, searchable) |
| GET | /:id | users:read | Get user by ID |
| POST | / | users:create | Create user |
| PUT | /:id | users:edit | Update user |
| DELETE | /:id | users:delete | Delete user |
| PUT | /:id/permissions | users:edit | Set permission overrides |
| POST | /:id/unlock | users:edit | Unlock user account |

#### Roles (`/api/v1/roles`)
| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | / | roles:read | List roles (paginated) |
| GET | /:id | roles:read | Get role with permissions |
| POST | / | roles:create | Create role with permissions |
| PUT | /:id | roles:edit | Update role (system roles protected) |
| DELETE | /:id | roles:delete | Delete role (if no users assigned) |

#### Permissions (`/api/v1/permissions`)
| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | / | permissions:read | List permissions (filterable) |
| GET | /:id | permissions:read | Get permission |
| POST | / | permissions:create | Create permission |
| PUT | /:id | permissions:edit | Update permission |
| DELETE | /:id | permissions:delete | Delete permission |
| GET | /groups | permission_groups:read | List permission groups |
| POST | /groups | permission_groups:create | Create permission group |
| PUT | /groups/:id | permission_groups:edit | Update permission group |
| DELETE | /groups/:id | permission_groups:delete | Delete permission group |

#### Organization (`/api/v1/organization`)
Six sub-resources, each with full CRUD:
- `/companies` - Read/create/edit/delete
- `/branches` - Read/create/edit/delete
- `/locations` - Read/create/edit/delete
- `/departments` - Read/create/edit/delete
- `/teams` - Read/create/edit/delete
- `/designations` - Read/create/edit/delete

All require corresponding `resource:read/create/edit/delete` permissions.

#### Audit (`/api/v1/audit`)
| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | /logs | audit_logs:read | List audit logs (filterable) |
| GET | /login-history | audit_logs:read | List login history |
| GET | /sessions | sessions:read | List active sessions |
| DELETE | /sessions/:id | sessions:delete | Revoke session |

#### Dashboard (`/api/v1/dashboard`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /stats | JWT | Total users, active users, roles, groups, companies, branches, recent activity |

---

### Prisma Schema (Database Models)

#### User
- id (UUID), username (unique), email (unique), passwordHash, fullName, empCode, status (ACTIVE/INACTIVE/SUSPENDED/PENDING)
- failedAttempts, lockedUntil, lastLogin, mfaSecret
- Relations: roles (UserRole[]), permissions (UserPermission[]), designation, department, team, company, branch, location, manager
- Indexes: email, username, empCode, status

#### Role
- id (UUID), name (unique), description, isSystem (boolean), type (System/Custom)
- Relations: permissions (RolePermission[]), users (UserRole[]), pagePermissions[], rowPolicies[]
- System roles protected from rename/delete

#### Permission
- id (UUID), name (unique), resource, action (create/read/edit/delete/*), description
- Relations: group (PermissionGroup), roles (RolePermission[])

#### PermissionGroup
- id (UUID), name (unique), description
- Relations: permissions (Permission[])

#### Organization Entities
- **Company**: id, name, code, currency, address
- **Branch**: id, name, code, companyId (FK)
- **Location**: id, name, type, branchId (FK), city, state, country
- **Department**: id, name, code
- **Team**: id, name, departmentId (FK)
- **Designation**: id, title, level

#### Session
- id (UUID), userId (FK), refreshToken (unique), ipAddress, userAgent, expiresAt, isRevoked, createdAt

#### AuditLog
- id (UUID), userId (FK), action, resource, resourceId, oldValues (JSON), newValues (JSON), timestamp

#### LoginHistory
- id (UUID), userId (FK), ipAddress, userAgent, status (SUCCESS/FAILED/LOCKED), timestamp

#### UserPermission (permission overrides)
- userId (FK), permissionId (FK), isRevoked (boolean)

---

### Authentication Flow

1. **Login**: `POST /api/v1/auth/login`
   - Accepts `username` (username or email) and `password`
   - Looks up user by username or email
   - Checks account status (must be ACTIVE)
   - Checks lockout (max 5 failed attempts in 15 min)
   - Validates password with bcrypt
   - On success: resets failed attempts, creates Session, issues access token (JWT) + refresh token (httpOnly cookie)
   - On failure: increments failed attempts, locks account if >= 5
   - Records login history

2. **Token Refresh**: `POST /api/v1/auth/refresh`
   - Validates refresh token from httpOnly cookie
   - Checks session is not revoked or expired
   - Issues new access token + rotates refresh token

3. **Logout**: `POST /api/v1/auth/logout`
   - Revokes session
   - Clears refresh cookie

4. **Authenticated Requests**:
   - `Authorization: Bearer <accessToken>` header required
   - `authenticateJWT` middleware verifies token, loads user with roles/permissions
   - User attached to `req.user`

### Authorization Flow

1. `requirePermission(resource, action)` middleware
2. Checks `req.user` exists
3. Calls `resolvePermission(user, resource, action)`:
   - If user has "Super Admin" role -> ALLOW (bypass all checks)
   - Check user-level permission overrides:
     - If an override exists with `isRevoked: true` -> DENY
     - If an override exists with matching resource+action -> ALLOW
   - Check role-level permissions:
     - Iterate user's roles and their associated permissions
     - If any role has the matching resource+action -> ALLOW
   - Otherwise -> DENY (403 Forbidden)

---

### CRUD Factory Pattern

The organization controllers use a generic factory pattern (`crudFactory.ts`) to avoid repetitive code:

```typescript
createCrudService({ delegate, entityName, searchFields, include, orderBy })
// Returns: { list, getById, create, update, remove }
```

This generates standardized CRUD services with:
- Paginated list with search and filters
- Entity existence checks before update/delete
- Consistent error handling
- Audit logging integration

---

## Frontend (`enterprise-rbac/frontend/`)

### Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | React | 19.2 |
| Language | TypeScript | 6.x |
| Build Tool | Vite | 8.1 |
| Styling | Tailwind CSS | 4.3 |
| Routing | React Router | 7.18 |
| Server State | TanStack React Query | 5.101 |
| Table | TanStack React Table | 8.21 |
| State Management | Zustand | 5.x |
| Icons | Lucide React | 1.27 |
| Utilities | clsx + tailwind-merge | 2.x |

### Directory Structure
```
frontend/src/
+-- main.tsx
+-- App.tsx
+-- index.css
+-- api/              # API client
+-- components/       # Reusable components
+-- pages/            # Page components
+-- store/            # Zap state management
+-- types/            # TypeScript types
+-- utils/            # Utilities
```

### Expected Pages
Based on the API structure, the frontend likely provides:

- **RBAC Dashboard** - Stats overview (users, roles, permissions, recent activity)
- **User Management** - List, create, edit, delete users; assign roles; set permission overrides; unlock accounts
- **Role Management** - List, create, edit, delete roles; assign permissions; view assigned users
- **Permission Management** - List, create, edit, delete permissions and groups
- **Organization Management** - Manage companies, branches, locations, departments, teams, designations
- **Audit Log Viewer** - Browse audit logs with filtering by resource/action/user
- **Login History** - View login attempts with SUCCESS/FAILED/LOCKED status
- **Session Management** - View and revoke active sessions

---

## Key Design Decisions

1. **Super Admin Bypass**: The "Super Admin" role bypasses all permission checks, ensuring administrative access is never accidentally restricted.

2. **Generic CRUD Factory**: Reduces boilerplate for organization entity controllers/services, ensuring consistent patterns across all 6 entity types.

3. **Token Rotation**: Refresh tokens are single-use. Each refresh operation issues a new token and invalidates the old one, reducing the window for token theft.

4. **Session Tracking**: Every login creates a Session record with IP and user agent, enabling administrators to monitor and revoke individual sessions.

5. **Comprehensive Audit Trail**: All CRUD operations and authentication events are logged with before/after values for complete traceability.

6. **express-validator**: Used instead of Zod for request validation, providing built-in error formatting compatible with the `validate` middleware.
