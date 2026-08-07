# 3. Navigation Structure

> Source of truth: `src/components/layout/useNavItems.js` (the single hook both the desktop `EnterpriseNav` icon rail and the mobile `Sidebar` drawer read from, per an explicit code comment guaranteeing they can't drift apart — although `Sidebar.jsx` also carries its own near-duplicate copy of the same logic rather than importing the hook; see [Bug & Issue Report](19-bugs-issues.md)). The tree below is the **superset** of everything that can appear; each item is conditionally shown per the gate noted.

## 3.1 How gating works

Every nav item (and every route, independently, via `ProtectedRoute` in `App.jsx`) is gated by some combination of:
- **Role** (`admin` / `employee` / `agent`, derived from `AuthContext`'s `rawRole`/`user.role`)
- **Permission** (a `permission.code` string checked via `useAuthorization().can()`)
- **Module availability** (`useModuleAvailability()` — asks the backend whether the `hr`, `tickets`, or `authorization` schema is actually migrated in this environment; unknown modules fail **open**, i.e. are treated as available)
- **Company scope** (a small number of items are restricted to a specific `company_code`, e.g. Trial Form is Nidhi Impex–only)

`rawRole === 0` (Super Admin) bypasses every nav gate.

## 3.2 Full Navigation Tree

```
Login (/login) — public, unauthenticated entry point
│
├── Admin (role: admin) — mounted inside AppLayout
│   ├── Dashboard                         → /admin
│   ├── Forms                             (parent shown only if a child qualifies)
│   │   ├── Appointment Form              → /admin/appointments
│   │   └── Trial Form                    → /admin/trial-form            [Nidhi Impex company-scoped]
│   ├── Employees
│   │   ├── Employee Master               → /admin/employees/add
│   │   └── View Employees                → /admin/employees
│   ├── Salary
│   │   ├── Month & Batch Details         → /admin/salary
│   │   └── Salary Upload                 → /admin/salary/upload
│   ├── Attendance
│   │   ├── View Attendance               → /admin/attendance
│   │   └── Shift                         → /admin/attendance/shift
│   ├── TDS                               (parent shown only if a child qualifies)
│   │   ├── TDS Calculation               → /admin/tds/calculation       [placeholder page, not implemented]
│   │   └── Form 16                       → /admin/form16
│   ├── HR                                [requires "hr" module migrated]
│   │   ├── HR Dashboard                  → /admin/hr
│   │   ├── Hiring                        → /admin/hr/hiring
│   │   ├── Onboarding                    → /admin/hr/onboarding
│   │   ├── Asset Allocation              → /admin/hr/assets
│   │   ├── Performance Matrix            → /admin/hr/performance
│   │   ├── Exit Management               → /admin/hr/exit
│   │   ├── HR Reports                    → /admin/hr/reports
│   │   └── HR Settings                   → /admin/hr/settings
│   ├── Tickets / Ticket Control Center   → /admin/tickets  (staff)  or  /admin/tickets/control-center  (rawRole===0/super_admin/owner) [requires "tickets" module]
│   └── Access Control                    [requires "authorization" module + (admin.role.read OR admin.user.read)]
│       ├── Users                         → /admin/access-control/users
│       ├── Roles                         → /admin/access-control/roles
│       ├── Permission Matrix             → /admin/access-control/permission-matrix   ["Coming Soon" placeholder — see 1.11]
│       ├── Policies                      → /admin/access-control/policies
│       ├── Access Requests               → /admin/access-control/access-requests
│       ├── Delegations                   → /admin/access-control/delegations
│       └── Emergency Access              → /admin/access-control/emergency-access
│   Profile                               → /admin/profile   (always appended, unconditional)
│
│   [Not in any nav tree, reachable only by direct URL — see Gap below]
│   Manage Admins                         → /admin/admins   (component: Settings.jsx)
│
├── Employee (role: employee) — mounted inside AppLayout
│   ├── Dashboard                         → /employee
│   ├── Payslips                          → /employee/payslips
│   ├── Form 16                           → /employee/form16
│   ├── Tickets                           [requires "tickets" module]
│   │   ├── Raise Ticket                  → /employee/tickets/new
│   │   └── My Tickets                    → /employee/tickets
│   ├── Profile                           → /employee/profile
│   └── Appointment Form                  → /employee/appointment
│   ⚠ Profile-completeness override: if any of 17 required profile fields is blank, every item above
│     collapses away except Profile, and the user is force-redirected to /employee/profile.
│
├── Agent (role: agent) — mounted inside AppLayout
│   ├── Dashboard                         → /agent
│   ├── Trial Form                        → /agent/trial-forms   [company_code includes "nidhi-impex" or "all-companies"]
│   └── Appointment Form                  → /agent/appointments
│
└── Public / unauthenticated
    ├── /quiz/:token                      → Candidate proctored quiz (no AppLayout, standalone; token in URL is the credential)
    └── * (catch-all)                     → redirect to /login
```

## 3.3 Header-level controls (not sidebar, but part of overall navigation UX)

Rendered by `Header.jsx` on every authenticated screen, left to right:
1. Mobile menu toggle (opens the `Sidebar` drawer)
2. Page title — looked up from a static `pageTitles` route map in `AppLayout.jsx`. **Gap:** this map has no entries for several newer routes (all the Access Control sub-pages except the base, and several onboarding sub-routes), so those pages incorrectly show the literal header title "Dashboard" — see [Bug & Issue Report](19-bugs-issues.md).
3. `CompanyScopeDropdown` — switches active company/branch scope (Super Admin/Master only)
4. "Install App" PWA button (conditional on browser installability)
5. Light/dark theme toggle
6. `NotificationBell` — opens the `NotificationDrawer` slide-over
7. Profile avatar dropdown, with "Log out"

## 3.4 Known navigation gaps and redirects

- **`/admin/admins` has no sidebar entry at all** (see tree above) — it is fully functional (manages other admin accounts) but only reachable by typing the URL directly. Not guessed at further — documented as-is in the source.
- **Six onboarding sub-routes are pure redirects**, not real destinations: `/admin/hr/onboarding/journeys`, `/welcome`, `/documents`, `/training`, `/assets`, `/checklists`, `/policies` all redirect into the single `OnboardingWorkspace` at various `?tab=` values (or with no tab at all) — these appear to be legacy deep-links kept for backward compatibility with old bookmarks/links.
- **`/admin/hr/interviews` also redirects** — to `/admin/hr/hiring?tab=interview` — for the same reason (interviews used to be a standalone page, now a tab).
- The **Access Control** section is explicitly documented in-code as intentionally partial — new sub-pages (Policies, Access Requests, Delegations, Emergency Access) were added incrementally as their backend endpoints landed, rather than being shipped as dead-end links ahead of time.
