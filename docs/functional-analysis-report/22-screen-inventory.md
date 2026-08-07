# 23. Screen Inventory

> Every file under `src/pages/**` (102 total) is accounted for. Test files (`*.test.jsx`, 13 files) and pure-utility/non-JSX modules (9 files: `appointmentRouteState.js`, `documentTypes.js`, `testUtils/appointmentFixtures.js`, `bulkActions.js`, `stageMeta.js`, `useHrFilters.js`, `onboardingCsv.js`, `employee-helpers.js` counted under AdminModals) are listed separately in §23.4 rather than as screens, since they render no UI. "Status" reflects what the source code itself shows (Live / Placeholder / Redirect-only / Unrouted-on-disk) — not a judgment about production readiness beyond what's observable.

## 23.1 Routed top-level screens

| Screen | Route | Module | Roles | Status | Purpose |
|---|---|---|---|---|---|
| Login | `/login` | Auth | Public | Live | Sign-in + forgot-password flow |
| (root redirect) | `/` | Auth | Public | Live | Redirects to `/login` or role home |
| Candidate Quiz | `/quiz/:token` | Hiring (public) | Candidate (token) | Live | Proctored assessment, no login |
| Admin Dashboard | `/admin` | Admin Core | Admin | Live | KPI cards + charts |
| Employee Management | `/admin/employees` | Employees | Admin | Live | Employee roster grid |
| Add Employee | `/admin/employees/add` | Employees | Admin | Live | 4-mode employee workspace (master/single/pending/bulk) |
| Salary Management | `/admin/salary` | Payroll | Admin | Live | Salary slip grid |
| Salary Upload | `/admin/salary/upload` | Payroll | Admin | Live | Bulk salary import |
| Attendance View | `/admin/attendance` | Attendance | Admin | Live, **read-only** | Calendar + list attendance viewer — no marking capability reachable from here |
| Shift Management | `/admin/attendance/shift` | Attendance | Admin | Live | Shift CRUD + assignment |
| Appointments | `/admin/appointments` | Appointments | Admin | Live | Appointment form submissions grid |
| Manage Admins | `/admin/admins` | Admin Core | Super Admin (rawRole 0) | Live, **no sidebar link** | Add/edit company-admin accounts |
| Trial Form (admin) | `/admin/trial-form` | Recruitment (legacy) | Admin | Live, company-scoped | Trial-form submissions grid |
| TDS Calculation | `/admin/tds/calculation` | Payroll | Admin | **Placeholder** | "Under development," no real functionality (16-line file) |
| Form 16 (admin) | `/admin/form16` | Payroll | Admin | Live | Tax certificate generator |
| Reports | `/admin/reports` | Reporting | Admin | Live (demo data) | Static/mock salary/attendance/employee reports |
| Admin Profile | `/admin/profile` | Admin Core | Admin | Live | Own profile view/edit |
| Tickets (staff) | `/admin/tickets` | Support | Admin (staff) | Live | Staff ticket queue |
| Ticket Control Center | `/admin/tickets/control-center` | Support | Super Admin | Live | Full helpdesk console |
| HR Dashboard | `/admin/hr` | HR | Admin | Live | HR landing dashboard |
| Hiring Workspace | `/admin/hr/hiring` | Hiring | Admin | Live | Tab shell: Requisitions/Candidates/Assessment/Interview/Offer — all 5 tabs confirmed live, see §23.3 |
| Onboarding Workspace | `/admin/hr/onboarding` | Onboarding | Admin | Live | Tab shell: Overview/Employees/Documents/Timeline |
| Asset Allocation | `/admin/hr/assets` | HR Assets | Admin | Live | Asset inventory + allocation |
| Performance Matrix | `/admin/hr/performance` | Performance | Admin | Live | Cycles/goals/reviews/9-box/PIP |
| Exit Management | `/admin/hr/exit` | HR Exit | Admin | Live | Resignation workflow |
| HR Reports | `/admin/hr/reports` | HR Reporting | Admin | Live | 8 canned HR report types |
| HR Settings | `/admin/hr/settings` | HR Admin | Admin | Live (persistence model unconfirmed) | Tabbed HR configuration |
| Training Quiz Page | `/admin/hr/training` | Hiring | Admin | Live, **duplicates** the Assessment tab's Quiz Library | Quiz bank builder/manager |
| Access Control Users | `/admin/access-control/users` | Access Control | Admin | Live | User directory/administration |
| Roles | `/admin/access-control/roles` | Access Control | Admin | Live | Role CRUD + summary |
| Permission Matrix | `/admin/access-control/permission-matrix` | Access Control | Admin | **Placeholder** ("Coming Soon") | Rebuild in progress, uncommitted |
| Policies | `/admin/access-control/policies` | Access Control | Admin | Live | ABAC policy CRUD + publish/rollback |
| Access Requests | `/admin/access-control/access-requests` | Access Control | Admin (+ any user to raise) | Live | Time-boxed access request/approval |
| Delegations | `/admin/access-control/delegations` | Access Control | Admin | Live | Permission hand-off |
| Emergency Access | `/admin/access-control/emergency-access` | Access Control | Admin | Live | Break-glass grants |
| Employee Dashboard | `/employee` | Employee Self-Service | Employee | Live | Salary stat cards + chart |
| Payslips | `/employee/payslips` | Employee Self-Service | Employee | Live | Payslip history/viewer |
| Form 16 (employee) | `/employee/form16` | Employee Self-Service | Employee | Live | Self-service tax certificate |
| Profile (employee) | `/employee/profile` | Employee Self-Service | Employee | Live | Multi-step profile edit; profile-completeness gate target |
| Employee Appointment (view) | `/employee/appointment` | Employee Self-Service | Employee | Live | Read-only view of own appointment |
| Raise Ticket | `/employee/tickets/new` | Support | Employee | Live | Ticket creation form |
| My Tickets | `/employee/tickets` | Support | Employee | Live | Own ticket list |
| Agent Dashboard | `/agent` | Agent | Agent | Live | Submitted candidates/appointments/trial-forms |
| Trial Form (agent) | `/agent/trial-forms` | Recruitment (legacy) | Agent | Live, company-scoped | Same component as admin Trial Form |
| Appointments (agent) | `/agent/appointments` | Appointments | Agent | Live | Same component as admin Appointments |

## 23.2 Redirect-only routes (no distinct screen)

| Route | Redirects to |
|---|---|
| `/admin/hr/interviews` | `/admin/hr/hiring?tab=interview` |
| `/admin/hr/onboarding/journeys` | `/admin/hr/onboarding?tab=employees` |
| `/admin/hr/onboarding/welcome`, `/training`, `/assets`, `/checklists`, `/policies` | `/admin/hr/onboarding` |
| `/admin/hr/onboarding/documents` | `/admin/hr/onboarding?tab=documents` |

## 23.3 Non-routed sub-screens (tabs, drawers, modals — reached only from within a parent screen)

| Screen/Component | Type | Parent screen | Module | Purpose |
|---|---|---|---|---|
| RequisitionsTab | Tab | Hiring Workspace | Hiring | Requisition CRUD + JD editor |
| CandidatePipeline | Tab (candidates) | Hiring Workspace | Hiring | Kanban/list candidate sourcing |
| AssessmentTab | Tab | Hiring Workspace | Hiring | Quiz assignment + attempt reports |
| InterviewManagement | Tab ("Interview") | Hiring Workspace | Hiring | Confirmed live (direct read of `HiringWorkspace.jsx`'s imports/tab switch) — interview scheduling, feedback, Select/Reject/Hold decision. Not independently routed; reachable only as this tab. |
| OfferManagement | Tab ("Offer") | Hiring Workspace | Hiring | Confirmed live, same basis as above — offer draft/approve/release/response tracking, version history, PDF letter. Not independently routed; reachable only as this tab. |
| OverviewTab | Tab | Onboarding Workspace | Onboarding | Pipeline funnel |
| EmployeesTab | Tab | Onboarding Workspace | Onboarding | Onboarding journeys table |
| DocumentsTab | Tab | Onboarding Workspace | Onboarding | Employee document review |
| TimelineTab | Tab | Onboarding Workspace | Onboarding | Per-employee document timeline |
| DocumentCollection | Legacy/alternate screen | — | Onboarding | Document intake (redirect target ambiguity — see routes.md redirects) |
| OnboardingDashboard | Legacy/alternate screen | — | Onboarding | KPI + funnel dashboard |
| OnboardingJourneys | Legacy/alternate screen | — | Onboarding | Alternate journeys table |
| OnboardingTraining | Legacy/alternate screen | — | Onboarding | Training completion tracker |
| OnboardingChecklists | Legacy/alternate screen | — | Onboarding | Kanban checklist board |
| ItAssets | Legacy/alternate screen | — | Onboarding | IT asset provisioning table |
| PolicyAcceptance | Legacy/alternate screen | — | Onboarding | Policy sign-off tracker |
| WelcomePortal | Legacy/alternate screen | — | Onboarding | "Day one" welcome preview (demo content) |
| EmployeeDrawer (onboarding) | Drawer | Employees/Overview tabs | Onboarding | Document timeline + approve/reject |
| AttendanceUpload | Standalone page, **confirmed NOT in App.jsx route list** | — | Attendance | Click-to-cycle attendance grid + bulk upload — **dead code, unrouted**; likely the intended successor to `DailyAttendance.jsx` (has a Monthly/Daily template toggle the latter lacks) |
| DailyAttendance | Standalone page, **confirmed NOT routed** | — | Attendance | Day-level attendance grid, same dead-code status |
| AccessControlUsers create/edit modal | Modal (5-section wizard) | Access Control Users | Access Control | User create/edit |
| AddEditEmployeeModal | Modal | Employee Management, Add Employee | Employees | Employee create/edit |
| DeleteEmployeeModal | Modal | Employee Management | Employees | Delete confirm |
| EmployeeDetailsModal | Modal (tabbed) | Employee Management | Employees | Read-only detail + edit hand-off |
| EmployeeImportModal | Modal | Add Employee | Employees | Bulk import wizard |
| AccountMasterUploadModal | Modal | Employee/Salary | Employees/Payroll | Bank-detail bulk upload |
| ManageDepartmentsModal | Modal | Multiple | Employees | Department inline CRUD |
| AddNewDepartment | Modal | Multiple | Employees | Add one department |
| UploadSalarySlipModal | Modal | Salary Upload | Payroll | Bulk salary upload wizard |
| DeleteSalarySlipModal | Modal | Salary Management | Payroll | Delete confirm |
| PayslipPreviewModal | Modal | Salary Management, Employee Payslips | Payroll | Payslip preview + PDF |
| AppointmentModal | Modal (2-step wizard) | Appointments, Agent Dashboard, Employee Appointment | Appointments | Full appointment create/edit + documents |
| TrialFormModal | Modal | Trial Form, Agent Dashboard | Recruitment | Trial form create/edit |
| WelcomePopup | Modal (2-step carousel) | First admin login | Admin Core | Onboarding tips popup |
| SuperAdminTicketDashboard/Table/Drawer, TicketReportsView, TicketSlaManagementView | Embedded views | Ticket Control Center | Support | See dedicated ticket module docs |
| NotificationDrawer + 4 modals | Drawer/Modals | Global (Header bell) | Notifications | See [Notification System](12-notifications.md) |
| PermissionMatrixPage internals (ComingSoon, etc.) | Placeholder components | Permission Matrix route | Access Control | Not yet functional |

## 23.4 Test files and pure-utility modules (not screens)

`AppointmentAadhaarDisplay.test.jsx`, `EmployeeAadhaarDisplay.test.jsx`, `SalaryUploadResult.test.jsx`, `AppointmentAadhaar.test.jsx`, `appointmentDocumentsApi.test.jsx`, `AppointmentModal.effects.test.jsx`, `AppointmentModal.empCodePhoto.test.jsx`, `AppointmentModal.workflow.test.jsx`, `AppointmentOptionalFields.test.jsx`, `AppointmentPhotoRetry.test.jsx`, `appointmentRouteState.test.js`, `TrialFormModal.test.jsx`, `Profile.aadhaar.test.jsx` (13 Vitest test files) — and `appointmentRouteState.js`, `documentTypes.js`, `testUtils/appointmentFixtures.js`, `bulkActions.js`, `stageMeta.js`, `useHrFilters.js`, `onboardingCsv.js`, `employee-helpers.js`, `EmployeeHelpers.jsx` (9 non-page utility/helper modules). Full detail in [Component Inventory](23-component-inventory.md).
