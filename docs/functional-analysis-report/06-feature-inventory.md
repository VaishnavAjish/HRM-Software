# 7. Complete Feature Inventory

> Status legend: **Live** (functional, wired to a real backend), **Demo/Mock** (renders real UI but data/actions are simulated or fixture-based), **Placeholder** (UI stub only), **Orphaned** (code exists, not reachable via any current route/nav).

| Feature | Description | Status | Module | Priority (inferred from centrality) | Complexity |
|---|---|---|---|---|---|
| JWT Login/Logout | Email+password auth, token issuance/revocation | Live | Auth | Critical | Low |
| Forgot Password (multi-step) | Identity verify → email verify → set password | Live | Auth | High | Medium |
| Employee Master CRUD | Create/read/update/delete employee records | Live | Employee Mgmt | Critical | High |
| Bulk Employee Import | Excel import with column mapping | Live | Employee Mgmt | High | Medium |
| Bulk Account-Master Import | Bank detail bulk upload | Live | Employee Mgmt | Medium | Medium |
| Department Management | CRUD departments | Live | Employee Mgmt | Medium | Low |
| Salary Slip Management | View/filter/delete payslip records | Live | Payroll | Critical | Medium |
| Bulk Salary Slip Import | Per-company templated Excel import | Live | Payroll | Critical | Medium |
| Form 16 Generation (Admin) | Tax certificate PDF per employee/FY | Live | Payroll | High | Medium |
| Form 16 Self-Service | Employee downloads own Form 16 | Live | Employee Self-Service | High | Low |
| TDS Calculation | — | **Placeholder** | Payroll | — | — |
| Reports (Salary/Attendance/Employee) | Charts + export | **Demo/Mock** (mockData-backed) | Reporting | Medium | Low |
| Attendance Grid (view) | Monthly present/absent/half-day/leave viewer | Live, **read-only** | Attendance | High | Medium |
| Attendance Marking / Bulk Upload | Click-to-cycle cell edit + Excel import | **Confirmed dead/unrouted** — `AttendanceUpload.jsx`/`DailyAttendance.jsx` exist and the backend endpoints work, but neither screen is reachable from any route in `App.jsx`; there is currently no way to mark attendance through the live UI | Attendance | Critical (currently broken) | Medium |
| Shift Management | Shift definitions + employee assignment | Live | Attendance | Medium | Medium |
| Appointment Form (Intake) | Pre-employment candidate intake, 2-step wizard | Live | Appointments | Critical | High |
| Aadhaar Masking | Default-masked display of national ID | **Corrected — not actually the default.** A direct read of `AadhaarAccess`/`AadhaarDisclosure` found disclosure is gated on ordinary record access alone, with no masked fallback in the reachable UI — see [Security Audit](16-security-audit.md) §17.3 | Appointments/Security | Critical | Medium |
| Aadhaar Confidential Export | One-time-token full-number PDF/print | Built and audited on the backend, but **confirmed zero live callers** in the frontend — dormant, not active | Appointments/Security | High (when wired) | High |
| Trial Form Intake | Pre-appointment trial submission (company-scoped) | Live | Recruitment (legacy) | Medium | Medium |
| Agent Portal | Agent's own submissions view | Live | Agent | Medium | Medium |
| Document Upload/Versioning (S3) | Versioned, audited document storage | Live | Documents | Critical | High |
| Document Upload (Legacy/Local) | Superseded local-disk document storage | Live but deprecated | Documents | Low | Medium |
| Job Requisitions | Create/approve/publish job openings | Live | HR Hiring | High | Medium |
| Candidate Pipeline | Kanban/list candidate sourcing | Live | HR Hiring | High | High |
| Interview Scheduling & Feedback | Schedule, reschedule, panelist feedback | Live (confirmed wired as the Hiring Workspace's "Interview" tab) | HR Hiring | High | Medium |
| Candidate Assessment/Quiz Assignment | Assign quiz, generate shareable link | Live | HR Hiring | Medium | Medium |
| Public Candidate Quiz (Proctored) | Token-auth quiz with violation tracking | Live | HR Hiring (public) | Medium | High |
| Offer Management | Draft/approve/release/respond to offers | Live (confirmed wired as the Hiring Workspace's "Offer" tab) | HR Hiring | High | Medium |
| Quiz Bank Management | Standalone quiz builder page | Live, but **duplicates** the Assessment tab's embedded Quiz Library — two independent UIs over the same table | HR Hiring | Medium | Medium |
| Onboarding Workspace (Overview/Employees/Documents/Timeline) | New-hire tracking derived from candidate records | Live (fabricated from Candidate data, no dedicated table) | HR Onboarding | Medium | Medium |
| Onboarding legacy/alternate screens (Dashboard, Journeys, Training, Checklists, IT Assets, Policy Acceptance, Welcome Portal) | Various onboarding sub-views | **Demo/Mock** (PreviewBanner-flagged in UI) — verify per-page findings in module docs | HR Onboarding | Low-Medium | Medium |
| Performance Cycles/Goals/Reviews | Full performance-management suite incl. 9-box, PIP | Live | HR Performance | High | High |
| Asset Allocation/Tracking | IT/physical asset lifecycle + QR codes | Live | HR Assets | Medium | Medium |
| Exit Management | Resignation workflow with status progression | Live | HR Exit | Medium | Low |
| HR Settings | General/Notifications/Documents/Templates config | Persistence model (server vs. localStorage) flagged for confirmation — see module docs | HR Admin | Low | Low |
| HR Reports | 8 canned report types, Excel/CSV/PDF export | Live | HR Reporting | Medium | Medium |
| Support Ticketing (Employee) | Raise/track own tickets | Live | Tickets | High | Medium |
| Support Ticketing (Staff Queue) | Assign/status/reply | Live | Tickets | High | Medium |
| Super Admin Ticket Control Center | Full helpdesk console, SLA/reports | **Partially Demo** — SLA save and report export are simulated (`setTimeout`) | Tickets | Medium | High |
| Access Control: Users | Full user administration (lock/unlock/reset/assign) | Live | Access Control | Critical | High |
| Access Control: Roles | Role CRUD/archive/clone | Live | Access Control | Critical | Medium |
| Access Control: Permission Matrix | Editable permission grid per role | **Placeholder** ("Coming Soon") — backend exists but is unrouted | Access Control | High (when complete) | High |
| Access Control: Policies | ABAC policy CRUD, publish/rollback | Live | Access Control | High | High |
| Access Control: Access Requests | Self-service, approval-chain access requests | Live | Access Control | Medium | Medium |
| Access Control: Delegations | Time-boxed permission hand-off | Live | Access Control | Low-Medium | Medium |
| Access Control: Emergency Access | Break-glass grants | Live | Access Control | Medium | Medium |
| In-app Notifications | Bell + drawer, announcements | **Demo/Mock** data, real Socket.IO transport | Notifications | Low (currently) | Medium |
| Multi-Company Scope Switching | Super Admin/Master company/branch filter | Live | Cross-cutting | High | Medium |
| Module Availability Probing | Hides nav for unmigrated backend modules | Live | Cross-cutting | Medium | Low |
| PWA Install | Installable web app | Live | Cross-cutting | Low | Low |
| Native Mobile (Capacitor) | Android/iOS packaging of the same SPA | Live | Cross-cutting | Medium | Medium |
| Employee Profile-Completeness Gate | Forces profile completion before other access | Live | Cross-cutting | High | Low |
| Ticket "AI categorization" suggestion | Subject-text-based category suggestion in RaiseTicket | Confirmed **mock/heuristic**, not a real AI/model call | Tickets | Low | Low |

## Dependency notes

- Onboarding depends on Hiring (reads candidates in `offer_accepted` stage — no dedicated onboarding data model).
- Aadhaar Confidential Export depends on the Documents/S3 subsystem and the base Appointment/Employee record, but currently has no live caller.
- Access Control's Permission Matrix depends on `PermissionRegistry` + the (currently orphaned) `RoleMatrixBuilder`/`RoleMatrixWriter` services.
- Module Availability Probing gates the visibility of HR, Tickets, and (nominally) Access Control nav sections — a hard dependency for those three modules being usable at all in a given environment.
