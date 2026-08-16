# Laravel Backend — `salary-slip-bac`

Primary production API. Schema owner (via migrations). ~140 controllers, ~150 models read in full for this report.

## Directory shape

```
app/Http/Controllers/
  AuthController.php, UserController.php, TicketController.php, DocumentController.php (legacy),
  DepartmentController.php, SettingsController.php, NotificationController.php,
  ReportingHierarchyController.php, IndeedFeedController.php, SalariesSlipController.php, Controller.php (empty base)
  Admin/
    AdminController.php, AttendanceController.php, ShiftController.php, UploadBatchController.php,
    UserRoleController.php, PermissionDimensionController.php
    Hr/                          — recruitment/ATS + broader HR domain (18 controllers, see below)
      Concerns/ScopesCompany.php, Concerns/AuthorizesEmployeeTarget.php
    Leave/                       — 7 controllers: leave requests/policies/types/balances/delegation/comp-off/WFH
  Api/
    ModuleAvailabilityController.php
    V1/
      AadhaarExportController.php, AppointmentController.php, DocumentController.php (v1, S3-based)
      Admin/CompanyUnitController.php, Admin/UserController.php
      Admin/Organization/*            — 15 controllers, Domain 02 (org structure)
      Admin/Workforce/*               — 12 controllers, Domain 03 (job architecture)
      Authorization/*                 — 13 controllers, the RBAC/ABAC platform
  Candidate/
    CandidateApplicationController.php, CandidateAuthController.php
  Public/PublicJobController.php
  PublicCandidateIntakeController.php, PublicQuizController.php
```

## Domain: Core HR / Recruitment (`Admin/Hr/*`)

| Controller | Purpose |
|---|---|
| `CandidateController` | Admin CRUD + kanban pipeline for candidates, ATS auto-scoring, resume streaming. |
| `CandidateCrmController` | Recruiter CRM layer: tags, private notes, talent pools, outbound comms log. |
| `CandidateDocumentController` | Per-candidate document upload/verify. **No `ScopesCompany` at all — unscoped.** |
| `InterviewController` | Scheduling + Google Meet sync (best-effort) + panelist feedback. |
| `JobRequisitionController` | Full requisition lifecycle: draft → submit → dept-manager/HR-manager/director approval → publish to job portal / Indeed / multi-channel (LinkedIn, Glassdoor, Google, JazzHR, BambooHR). |
| `OfferController` | Offer creation, versioned revisions, approve/release/respond lifecycle. |
| `PerformanceController` | Performance cycles, goals (KPI/KRA/OKR), reviews, analytics dashboard (bell curve, 9-box, skill matrix). |
| `RecruitmentDashboardController` | Recruitment KPI/funnel/trend/recruiter-performance mega-dashboard. Scoping applied to KPI cards only — most charts/alerts unscoped (see file 06). |
| `HrDashboardController` | Employee-side HR dashboard: headcount, birthdays/anniversaries, growth/attrition, diversity. Two fields (`upcoming_confirmations`, `employees_on_leave`) are hardcoded `0`. |
| `HrReportController` | 8 ad-hoc tabular report types; 3 of 8 unscoped by company (see file 06). |
| `ExitManagementController` | Resignation/exit workflow. Most rigorously scoped controller in the codebase (`ScopesCompany` + `AuthorizesEmployeeTarget` on every write, with inline rationale comments). |
| `OnboardingController` | Onboarding dashboard/journeys/documents. Docblock confirms this **used to** fabricate Aadhaar/PAN/Degree documents and hardcode metrics — now replaced with real queries (historical, remediated). `showJourney()` still unscoped. |
| `QuizAttemptController` | HR-facing candidate-assessment management (assign, review, proctoring log). `show`/`destroy` unscoped. |
| `TrainingQuizController` | Quiz/question-bank CRUD. `show`/`update`/`destroy` unscoped. |
| `AssetController` | Asset inventory + allocate/return/transfer. Comment documents a prior PII leak (used to embed full salary/bank/PAN via User relation) now fixed. `show`/`update`/`destroy` unscoped despite `allocate`/`return`/`transfer` being well-scoped. |
| `Concerns/ScopesCompany` | The dominant tenant-scoping trait — used across nearly all HR controllers. Role 0/1 (or `company_code` containing `all`/`all-companies`) = global scope; role 2 additionally restricted to `unit`. Uses `LIKE`-based matching against a comma-separated `company_code` string column rather than a normalized join table. |
| `Concerns/AuthorizesEmployeeTarget` | Second-layer guard for writes that touch *another* user's record (`denyUnlessEmployeeInScope`, `denyUnlessRecordInScope`). Denials return 404, not 403, and are audit-logged. |

Candidate-facing / public:
- `Candidate/CandidateApplicationController` — authenticated-candidate job application flow (Sanctum), resume upload, own-applications list.
- `Candidate/CandidateAuthController` — candidate register/verify/login/profile/password-reset. **Two live security issues — see file 06.**
- `Public/PublicJobController` — fully public job board, no auth.
- `PublicCandidateIntakeController` — unauthenticated Google-Forms-via-Apps-Script webhook, guarded by one shared static token (self-documented in code as password-equivalent risk). Contains a live temporary debug-logging block explicitly flagged in comments for removal once a payload-loss bug is confirmed fixed.
- `PublicQuizController` — unauthenticated candidate quiz-taking, authenticated solely by a per-attempt URL token; the most carefully hardened public endpoint in the codebase (server-recomputed scores, never serializes the answer key, one-way terminal states).

## Domain: Leave & Attendance (`Admin/Leave/*`, `Admin/AttendanceController`)

Leave: `LeaveRequestController`, `LeavePolicyController`, `LeaveTypeController`, `LeaveBalanceController`, `LeaveDelegationController`, `CompensatoryOffController`, `WorkFromHomeController`. Full draft→submit→multi-stage-approval lifecycle, delegation-aware approval routing, balance accrual/carry-forward. **Notably, these controllers (except `LeaveRequestController`'s approval-stage endpoints) have no in-controller authorization logic at all** — a real asymmetry vs. the heavily-guarded Authorization namespace. `request_number` generation via `Model::count()+1` in both `LeaveRequestController` and `WorkFromHomeController` is non-atomic (race-condition-prone under concurrent submissions). `CompensatoryOffController::approve/reject` reference `Auth::id()` with no `Auth` import — **fatal error at runtime** (file 06).

Attendance: `Admin/AttendanceController` — month/year grid view + cell upsert (uses atomic `upsert()`, comment explains this replaced a race-prone `updateOrCreate`) + bulk import (capped 500 rows).

## Domain: Authorization / RBAC platform (`Api/V1/Authorization/*`)

This is a full enterprise ABAC/RBAC engine, separate from (and much more sophisticated than) the simple numeric-role checks used elsewhere in the codebase:

| Controller | Purpose |
|---|---|
| `AuthorizationController` | Core decision API: `check`, `checkBatch`, `simulate`, and `me` (the permission "snapshot" the frontend caches and drives its nav/gating from). Heavily commented with historical bug-fix rationale (portal misrouting, missing super-admin role rows). |
| `PermissionMatrixController` | Backs the Permission Matrix admin UI: edit role→permission grants, clone roles, simulate decisions, validation, audit trail, optimistic locking via role version. |
| `RoleController` | Role CRUD/archive/restore, protects the hidden `SYSTEM_SUPER_ADMIN` role, FK-violation-safe delete (409 not 500). |
| `PolicyController` | ABAC policy CRUD with DRAFT/PUBLISHED/ARCHIVED versioning; editing a published policy silently reverts it to DRAFT so live enforcement isn't changed without republishing. |
| `AccessRequestController` | 3-step (MANAGER → RESOURCE_OWNER → SECURITY) access-request approval chain. |
| `DelegationController` | Temporary permission delegation between users, max 90 days, verifies delegator actually holds what they're delegating. |
| `EmergencyAccessController` | Break-glass grants, hard 24h cap. |
| `PrivilegedAccessController` | Break-glass / JIT / impersonation lifecycle. **Contains a dead authorization branch — see file 06.** |
| `MfaController` | TOTP/SMS/email MFA + backup codes. **SMS enrollment has an explicit TODO — no verification-before-enroll (file 06).** |
| `DeviceController`, `SessionController` | Device trust/block and session list/revoke, self-scoped. |
| `UserLookupController` | Typeahead user search for pickers, tenant-scoped, excludes hidden accounts, capped at 20 results. |

Recurring patterns across this namespace: `RoleHierarchy` static helpers as the dominant authorization primitive; hidden/protected accounts always return 404 (never 403); every denial is written to `authorization_permission_audit_logs` via `RoleAudit::denied()`; `AuthorizationCache::invalidate()` after every mutation; a documented "shadow mode" fallback for an in-flight permission migration.

## Domain: Admin user/company management

- `Api/V1/Admin/UserController` — the richest authorization file in the codebase: hidden/protected-account concealment, tier/scope guards (`guardTarget`, `guardTargetRole`, `guardCompany`, `guardSensitiveRoles`, `guardTargetUserRoles`), CSV/Excel export with CSV-formula-injection sanitization, bulk actions (up to 500 users) — comments document three previously-real privilege-escalation bugs now fixed (role-change bypassing role-assignment guards, bulk-assign-role missing a guard, a hardcoded deny-list gap that omitted `tenant_administrator`).
- `Api/V1/Admin/CompanyUnitController` — Company/Unit master-data CRUD plus a legacy-unit adoption flow (maps free-text unit strings into real `Unit` records).
- `Admin/UserRoleController`, `Admin/PermissionDimensionController` (read-only self-view of page-level grants; empty result means "unrestricted" — permissive-by-default, documented in code).

## Domain: Organization structure (`Api/V1/Admin/Organization/*`, Domain 02)

15 controllers, all "thin" — every controller delegates business rules to a matching `App\Services\Organization\*` service and follows an identical `guarded()`/`missing()` error-handling pattern (catches `ProvisioningException`, uniform 404 JSON envelope). Covers: Calendars + holidays, Enterprises (group structure), Enterprise Master (statutory/contact fields on Company), Financial Organizations (cost/profit centers + GL mappings + allocation rules with ≤100% validation), Legal Entities, Legal Entity Profiles (+ registrations/addresses/representatives/bank accounts), Locations, Calendar Assignments (priority-resolved by scope), Change Management (draft→submit→approve/reject→schedule→apply workflow for org restructures), Org Chart (read-only tree builder, 6 chart types), Hierarchies (nodes/edges with cycle validation), Org Locations (+ location types + work-location mappings), Org Units (+ positions with freeze/release + employee assignments + headcount), Reporting Structure (primary/secondary/functional/matrix relationships + leadership assignments).

Authorization: route-level `permission:org.<resource>.*` middleware (not visible in controller bodies); actor passed into every service call so tenancy scoping happens in the service layer, not verified from these files.

## Domain: Job architecture / Workforce (`Api/V1/Admin/Workforce/*`, Domain 03)

12 controllers, same thin/service-delegating pattern as Organization, catching `JobArchitectureException` instead: Job (core job master), Job Category/Family/Function/Level/Grade (classification hierarchy), Designation (formal titles), Job Description (versioned, publish/archive), Job Requirement, Job Responsibility, Job Evaluation (factor-scored, submit/approve/reject), Job Classification (1:1 per job, compliance fields).

**Known bug**: `JobDescriptionController` references `JobService::REMOTE_ELIGIBILITY_TYPES` but never imports `JobService` — undefined-class fatal error the first time that validator path is hit.

## Models — high-level groupings (full detail was read; representative summary here)

- **Job architecture**: `Job`, `JobCategory`, `JobClassification`, `JobDescription`, `JobEvaluation`, `JobFamily`, `JobFunction`, `JobGrade`, `JobLevel`, `JobRequirement`, `JobResponsibility`, `Designation`. `JobRequisition` (+ `JobRequisitionApprovalCycle`/`Step`) drives the approval workflow; `hiringManager()` relation is noted as likely mis-mapped to `hr_manager_id`.
- **Recruitment**: `Candidate` (+`CandidateAccount`, `CandidateStageHistory`, `CandidateDocument`, `CandidateNote`, `CandidateCommunication`, `CandidateTag`, `TalentPool`), `Interview` (+`InterviewPanelist`, `InterviewFeedback`), `Offer` (+`OfferRevision`).
- **Organization structure**: `OrganizationUnit`, `OrganizationLocation`(+Type/WorkLocationMapping), `OrganizationHierarchy`(+Node/Edge), `OrganizationLeadershipAssignment`, `OrganizationPosition`(+`PositionHistory`), `OrganizationChangeRequest`(+Item/Approval), `ReportingRelationship` (has legacy-column-sync hooks), `EmployeeOrganizationAssignment`, `FinancialOrganization`(+GlMapping/AllocationRule/AllocationLine), `Department`(+`DepartmentManager`), `Unit`, `Location`, `Calendar`(+`CalendarHoliday`).
- **Company/tenant**: `Company`(+`Branding`/`Configuration`/`Subscription`), `Enterprise`(+`CompanyMembership`), `LegalEntity`, `LegalEntityProfile`(+Registration/Address/Representative/BankAccount — bank account numbers AES-256-CBC encrypted at rest, only masked/last-four exposed).
- **Authorization/access**: `Role` (self-referencing parent-role inheritance), `Permission`(+`PermissionGroup`), `AuthorizationPolicy`(+Version), `AuthorizationRoleAssignment`, `AccessReview`(+Item), `AuthorizationAccessRequest`, `PrivilegedAccessRequest`, `SecurityPolicy`, `MfaMethod`, `UserDevice`, `UserSession`, `FeatureFlag`, `AadhaarExportAuthorization`, `AuditLog`, `AuthorizationDecisionLog`.
- **Leave/Attendance**: `LeaveRequest`, `LeaveApproval`, `LeaveBalance`, `LeaveDelegation`, `LeavePolicy`(+`LeavePolicyType`), `LeaveType`, `CompensatoryOff`, `Attendance`, `Shift`, `WorkFromHomeRequest`(+`WfhCheckIn`). Most have rich `scope*` methods (active/pending/forUser/etc.) and `SoftDeletes`.
- **Tickets**: `Ticket` (has a `scopeVisibleTo($user)` that is the single authorization chokepoint for the whole ticket system, plus computed SLA-status appends), `TicketMessage`, `TicketCategory`, `TicketAttachment`, `TicketActivityLog`/`AssignmentHistory`/`EscalationHistory` (append-only, `UPDATED_AT=null`), `TicketSlaRule`.
- **Documents**: `Document`(+`DocumentVersion`, versioned), `DocumentUpload`, `DocumentAuditLog`. `DocumentVersion` hides raw S3 storage internals (`s3_object_key`, `bucket_name`, `kms_key_id`).
- **Performance/Onboarding/Misc**: `PerformanceCycle`/`Goal`/`Review`, `EmployeeResignation`, `TrainingQuiz`/`QuizAttempt` (proctoring events, answer key never trusted from client), `Asset`/`AssetAllocation`, `SalarySlip` (no relationships/casts defined at all), `UploadBatch`/`UploadBatchRow` (custom mutator scrubs PII — passwords/OTP/verification tokens dropped, account/mobile/Aadhaar/PAN masked — before persisting raw import rows).
- **User**: `User` (extends `Authenticatable`, implements `JWTSubject`; `encrypted_aadhaar_number` cast to Laravel's `encrypted`; hides `password`/`remember_token`/`encrypted_aadhaar_number`/`aadhar_card_no`/`otp`/several protection flags; `booted()` hooks enforce a protected-account guard on update/delete).

## Route file

`routes/api.php` is 1631 lines. Route-level middleware (`permission:<domain>.<resource>.*`) is the primary enforcement point referenced throughout controller docblocks but not read line-by-line for this report — see file 06 for the specific scoping gaps found by reading the controller bodies directly.

## Service layer (`app/Services/**`, 82 files read in full)

The service layer is where most business logic actually lives (controllers are mostly thin). Highlights:

**The authorization system runs two parallel implementations concurrently, by design, mid-migration:**
1. **Legacy numeric-role system** — `users.role` (0=super admin/1=company admin/2=unit manager/4=agent/else=employee) + CSV `company_code` + `unit`. Still the live enforcement path in many services (`DocumentAuthorizer`, `Matrix/EmployeeScopeGuard`, `UserDirectory`).
2. **Canonical ABAC/RBAC system** — `Authorization/AuthorizationEngine::decide()` is the single decision entry point: direct grants → role grants (with inheritance) → ABAC policies (`ConditionEvaluator` + `ScopeMatcher`) → temporary grants (delegation/emergency) → deny-wins → ancestor-suppression check. `Authorization/PermissionEnforcementPolicy` decides per-permission whether the engine's verdict is actually **enforced** or only **logged** (`SHADOW` vs `ENFORCED` mode) — this is the live "shadow enforcement" rollout referenced in prior project notes.
3. Bridging classes keep the two in sync during migration: `SchemaSupport` (tolerates partial schema), `Authorization/AuthorizationCache` (version-stamped invalidation — its own docblock documents and fixes a real historical bug where `Cache::increment()` on an absent key was silently a no-op, making invalidation inert), `Matrix/PermissionCatalogSync`/`PermissionMigrationReport`/`PermissionValidator` (keep the code-defined permission registry and the DB `permissions` table in sync, measure migration completeness, and CI-gate on integrity issues without ever silently deleting/reassigning ownership across surfaces).
4. **Permission Matrix subsystem** (`Authorization/Matrix/*`): `RoleMatrixBuilder`/`EffectiveStateResolver` (read path, computes effective ALLOW/DENY/CONDITIONAL/NOT_ASSIGNED with ancestor-suppression), `RoleMatrixWriter` (write path, transactional per-cell edits; refuses saves that would contradict an ancestor's explicit DENY; auto-grants required ancestor permissions; projects canonical edits back onto the legacy permission codes routes still actually check).
5. **Domain-specific scope gates** on top of both systems: `Organization/Concerns/VerifiesCompanyAccess` (Organization/JobArchitecture domains), `Authorization/Matrix/EmployeeScopeGuard` (explicitly marked `MODE = 'COMPAT'` — a deliberate stopgap, not canonical — used by HR write endpoints; its own docblock says it exists because several HR endpoints previously only validated `exists:users,id` and let a company-A admin touch company-B employees).

**Other notable services:**
- `Recruitment/AtsScoringService` — deterministic, explainable, non-LLM resume-to-requisition scoring (skills-overlap % + experience-range fit % + resume-keyword-overlap %); explicitly has no "education" category because `Candidate` has no structured education field, rather than fabricating one.
- `Recruitment/GoogleMeetService` — real Google Calendar API integration, explicitly fails closed (throws rather than fabricating a fake meeting link) if unconfigured or the API call fails.
- `Aadhaar/AadhaarExportAuthorizer` — single-use, hash-only-persisted export tokens for full-Aadhaar PDF exports; audit-write and token-issue happen in one transaction so an export can never be approved without a traceable record; consumption uses a conditional `UPDATE ... WHERE used_at IS NULL` to be race-safe against concurrent use.
- `Documents/DocumentService` — S3 upload/replace/delete/restore orchestration with idempotency-key support and malware-scan-pending versions held unservable until cleared.
- `Provisioning/UserProvisioningService` — the one place all 5 account-creation entry points (admin dialog, employee form/import, trial form, appointment form) funnel through so role/company/unit resolution can't diverge between flows again.
- `Hr/JobRequisitionApprovalService` — implements the two-step (HR Manager → Director) requisition approval workflow described in prior project memory, gating each transition through `AuthorizationEngine::decide()` directly rather than route middleware.

**Confirmed stub/mock/bug findings in the service layer** (folded into file 06's master list):
- `IndeedJobService.php` — when Indeed credentials are absent or the real API call fails, **fabricates** a fake `IND-{random}` job ID and returns `success: true`, indistinguishable from a genuine publish to the caller/UI. (Contrast with `GoogleMeetService`, which fails closed instead.)
- `Authorization/AccessReviewService::getLastRoleUsage()` / `getLastPermissionUsage()` — explicit stubs, hardcoded to return `null` ("For now, return null" per comment) — access-review items never show real last-used data.
- `Authorization/IdentityLifecycleService::recalculateAccess()` — explicit no-op placeholder, called from mover/rehire flows but does nothing.
- `Authorization/IdentityLifecycleService::revokeSessionsOnMover()` — effectively empty; declares intent but never revokes sessions on a significant job change.
- `Authorization/MfaService::verifyOtpCode()` and `verifySecurityKey()` — hardcoded `return false;` placeholders. SMS/Email OTP verification and WebAuthn security-key verification are not implemented despite being enrollable elsewhere in the same service.
- `JobArchitecture/JobArchitectureException.php` — likely bug: `?Throwable $previous` used without importing/qualifying `\Throwable`, which resolves to a nonexistent `App\Services\JobArchitecture\Throwable` in that namespace.
- `JobArchitecture/JobDescriptionService::update()` — likely bug: calls `Str::studly()` with no `use Illuminate\Support\Str;` import — will fatal on first real invocation.

## Config / integrations (`config/services.php`, `.env.example`)

External integrations referenced in code across the controllers above: Google Meet (interview scheduling), Fast2SMS (login OTP), Indeed + multi-channel job posting (LinkedIn/Glassdoor/Google/JazzHR/BambooHR), SMTP mail, S3-compatible object storage (documents), Aadhaar encryption/masking (AES-256-CBC via Laravel's `Crypt`).
