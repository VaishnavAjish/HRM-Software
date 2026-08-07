# 24. Component Inventory

> Source: `src/components/**` (63 files) + `src/features/permissionMatrix/**` (11 files, uncommitted). "Reusable" = imported by 2+ distinct pages/components, confirmed by grep, not assumed from folder location.

## 24.1 Shared design-system primitives (`components/ui/`)

| Component | Location | Reusable | Purpose | Dependencies |
|---|---|---|---|---|
| Badge | `ui/Badge.jsx` | Yes (32 files) | Colored status pill | — |
| Button | `ui/Button.jsx` | Yes (58 files — most-used component) | Base button, variants/sizes | — |
| Card / StatCard | `ui/Card.jsx` | Yes (15 files) | Bordered container / KPI tile | — |
| Modal | `ui/Modal.jsx` | Yes (39 files) | Base centered dialog | — |
| Drawer / CollapsibleSection | `ui/Drawer.jsx` | Yes (3 files) | Slide-in panel | — |
| DatePicker | `ui/DatePicker.jsx` | Yes (7 files) | Custom calendar+time popover | — |
| MonthYearPicker | `ui/MonthYearPicker.jsx` | No (1 file: SalaryManagement) | Month/year-only picker | — |
| Pagination | `ui/Pagination.jsx` | Yes (7 files) | Page controls | — |
| RichTextEditor | `ui/RichTextEditor.jsx` | Yes (2 files) | `contentEditable` rich text field | — |
| SearchBar | `ui/SearchBar.jsx` | Yes (2 files) | Icon+input search | — |
| Skeleton (Line/Card/Table) | `ui/Skeleton.jsx` | Yes (~30 files) | Loading placeholders | — |
| GridHeaderContextMenu | `ui/GridHeaderContextMenu.jsx` | Yes, via hook (4 grid pages) | AG-Grid column header right-click menu | `hooks/useGridHeaderContextMenu.js` |
| CameraCaptureModal | `ui/CameraCaptureModal.jsx` | Yes, via hook (12 consumers) | Live camera capture | `hooks/usePhotoCapture.jsx` |
| Dropdown | `ui/Dropdown.jsx` | **Dead code — 0 importers** | Generic dropdown menu | — |
| ModernDatePicker | `components/ModernDatePicker.jsx` (top-level, distinct from ui/DatePicker) | Yes (6 files) | Calendar popover + typed-entry mode | — |

## 24.2 Admin-specific (`components/admin/`)

| Component | Reusable | Purpose |
|---|---|---|
| BulkAttendanceValidation | No (2 pages, same family) | Attendance bulk-upload review grid |
| BulkEmployeeValidation | No (1 page) | Employee bulk-upload review grid |
| BulkSalaryValidation | No (1 page) | Salary bulk-upload review grid |
| EmployeeMasterTable | No (1 page, but a large internal orchestrator) | Unified 4-lifecycle-stage employee grid |
| PendingEmployeesTab | No (1 page) | Pending-employee card grid |
| UploadBatchPanel | Yes (4 upload pages) | Upload batch history panel |
| UploadReportModal | Indirect (via UploadBatchPanel) | Per-batch pass/fail detail modal |

## 24.3 Authorization (`components/authorization/`)

| Component | Reusable | Purpose |
|---|---|---|
| Can | **Dead code — 0 importers** | Permission-gate wrapper |
| StatusBadge / ApprovalChain | Yes (5 Access Control pages) | Workflow status pill / approval sequence |
| UserPicker | Yes (4 places) | Debounced user search/select |

## 24.4 Documents (`components/documents/`)

| Component | Reusable | Purpose |
|---|---|---|
| DocumentUploadForm | **No confirmed importer — likely orphaned** | Standalone document upload form |
| DocumentViewerModal | Yes (3 places) | Presigned-URL document preview |
| EmployeeDocuments | No (1 page) | Full employee document panel |

## 24.5 Form16 / Forms / Payslip

| Component | Reusable | Purpose |
|---|---|---|
| Form16Document | No (1 page) | Full statutory Form 16 print layout |
| PrintableForm | Yes (4 pages) | Appointment Form print layout |
| PrintableTrialForm | No (1 page) | Trial Form print layout |
| trial-form-helpers.js | Yes (utility, 2 consumers) | Trial form normalization/date helpers |
| PayslipDocument | Yes (2 pages) | Printable payslip (2 company variants) |

## 24.6 Layout (`components/layout/`)

| Component | Reusable | Purpose |
|---|---|---|
| AppLayout | Single consumer (App.jsx) but renders app-wide | App shell |
| EnterpriseNav | Single consumer (AppLayout) | Desktop icon-rail nav |
| Sidebar | Single consumer (AppLayout) | Mobile drawer nav — **duplicates `useNavItems` logic rather than importing it** |
| Header | Single consumer (AppLayout) | Top app bar |
| CompanyScopeDropdown | Single consumer (Header) | Company/branch scope switch |
| useNavItems.js | Single consumer (EnterpriseNav) | Canonical nav-tree hook |

## 24.7 Notifications (`components/notifications/`, uncommitted)

NotificationBell, NotificationDrawer, AnnouncementsModal, AnnouncementReadReceiptsModal, EmployeeGroupsModal, NotificationPreferencesModal — each single-consumer within this feature family; see [Notification System](12-notifications.md).

## 24.8 Onboarding design kit (`components/onboarding/`)

DataTable, PageHeader/PreviewBanner, primitives.jsx (Avatar/Person/StatusPill/ProgressBar/Sparkline/BarList/KpiTile/SectionCard/Eyebrow/EmptyState/FilterChips), SlideOver, Stepper, Timeline, format.js — all reusable across 4–14 onboarding pages each; this is the most internally-consistent shared design kit in the app.

## 24.9 Tickets (`components/tickets/`)

| Component | Reusable | Purpose |
|---|---|---|
| ticketMeta.js | Yes (utility, 6+ consumers) | Departments, escalation hierarchy, SLA metadata, role-based capability matrix |
| TicketDetailDrawer | Yes (2 pages: employee + admin) | Real, API-backed ticket detail |
| SuperAdminTicketDashboard/Drawer/Table, TicketReportsView, TicketSlaManagementView | No (single consumer: Control Center) | Super-admin-only ticket console pieces — **reports/export and SLA-save are simulated (`setTimeout`), not wired to real persistence/export** |

## 24.10 Permission Matrix feature module (`features/permissionMatrix/`, uncommitted, non-standard location)

ComingSoon, EmptyState, PermissionMatrixHeader, PermissionMatrixLayout, PermissionMatrixToolbar, SecurityIllustration, usePageActions — all internal to this single not-yet-rebuilt feature; see [Bug & Issue Report](19-bugs-issues.md).

## 24.11 Confirmed dead/orphaned components

| Component | Evidence |
|---|---|
| `authorization/Can.jsx` | Zero importers anywhere in `src` |
| `ui/Dropdown.jsx` | Zero importers anywhere in `src` |
| `documents/DocumentUploadForm.jsx` | No importer found in `src/pages` or `src/components` |

## 24.12 Most heavily reused components (by confirmed distinct-file import count)

1. `ui/Button.jsx` — 58 files
2. `ui/Modal.jsx` — 39 files
3. `ui/Skeleton.jsx` (SkeletonTable/Card) — ~30 files
4. `ui/Badge.jsx` — 32 files
5. `onboarding/primitives.jsx` — 14 files
6. `ui/Card.jsx` — 15 files
7. `onboarding/PageHeader.jsx` — 8+ files
