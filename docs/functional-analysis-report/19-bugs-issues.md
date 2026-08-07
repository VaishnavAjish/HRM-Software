# 20. Bug & Issue Report

> Consolidated from code-level evidence gathered across the whole codebase. Each item cites where it was observed.

## 20.1 Broken links / navigation gaps

| Issue | Evidence | Severity |
|---|---|---|
| `/admin/admins` has no sidebar entry | `useNavItems.js` has no entry for this route despite it being fully functional | Medium — usability |
| Header page-title map missing entries for newer routes | `AppLayout.jsx`'s `pageTitles` map lacks Access Control sub-pages (Policies, Permission Matrix, etc.) and several onboarding sub-routes — they incorrectly show "Dashboard" as the header title | Low — cosmetic but confusing |
| Six onboarding routes are redirect-only stubs | `/admin/hr/onboarding/journeys`, `/welcome`, `/documents`, `/training`, `/assets`, `/checklists`, `/policies` all just redirect into the workspace | Low — likely intentional backward-compat, but worth confirming they're not dead bookmarks nobody remembers |

## 20.2 Unused / dead pages and components

| Item | Evidence | Severity |
|---|---|---|
| `authorization/Can.jsx` | Zero importers anywhere in `src` | Low |
| `ui/Dropdown.jsx` | Zero importers anywhere in `src` | Low |
| `documents/DocumentUploadForm.jsx` | No confirmed importer | Low |
| `Api/V1/Authorization/PermissionMatrixController.php` and its `Matrix/*` services | Not referenced by any route in `routes/api.php`, yet marked `deleted` in a stale `git status` snapshot while still present on disk — an unresolved discrepancy between git state and working tree | Medium — indicates either an incomplete removal or an incomplete restore; should be resolved deliberately, not left ambiguous |
| `Api/V1/Authorization/AuthorizationController@simulate/flags/updateFlags` | Methods exist, no route wired | Low-Medium — blocks any feature-flag admin UI from being built on top of existing code |

**Correction:** an earlier pass of this research flagged `InterviewManagement.jsx` and `OfferManagement.jsx` as possibly dead/orphaned code because neither has its own top-level route. A direct read of `HiringWorkspace.jsx` confirmed both are **live** — they are imported and mounted directly as the Hiring Workspace's "Interview" and "Offer" tabs. They are not dead code; they simply aren't independently routable outside that tab shell.

## 20.3 Missing APIs / incomplete backend coverage

| Issue | Evidence | Severity |
|---|---|---|
| Frontend permission-matrix UI removed, backend partially remains orphaned | See 20.2 — a rebuild is visibly in progress (`features/permissionMatrix/` uncommitted, "Coming Soon" placeholder) | Medium |
| `module.schema:authorization` gate is a no-op | `RequireModuleSchema::MODULES` only defines `hr` and `tickets`; an unknown module name always resolves "ready" | Medium — security/reliability gap, not just cosmetic (see [Security Audit](16-security-audit.md)) |
| No leave-management feature | No `leaves` table, no leave-request/approval routes, despite `Attendance::STATUSES` including `leave` | Informational — flag if the business expects this to exist |
| No payroll computation engine | `payroll.run.execute`/`.approve` permissions exist with no corresponding feature; `salary_slips` is purely import-populated | Informational |

## 20.4 Missing validation / inconsistent patterns

| Issue | Evidence | Severity |
|---|---|---|
| GET-based delete endpoints | `employee/delete/{id}` and `admin/salary-slip/delete` both use GET for a destructive action (violates HTTP semantics — GET should be safe/idempotent and is cacheable/prefetchable, risking accidental deletion via link prefetching, browser history, proxies, or crawlers) | Medium |
| `OfferController@destroy` wired to `hr.offer.update` permission rather than a delete-specific one | Inconsistent with every other delete action in the codebase, which uses a dedicated `.delete` permission | Low-Medium |
| Duplicated role-resolution logic (frontend `AuthContext.getUserRole()` vs. backend `RoleMiddleware::resolveRole()`) | Explicitly documented as intentionally mirrored in both codebases | Medium — a drift risk if one is updated without the other |
| `Sidebar.jsx` duplicates `useNavItems.js`'s nav-building logic rather than importing it | Confirmed in component inventory | Medium — same drift risk as above, for navigation instead of authorization |
| Numeric role "2" ambiguity | Middleware treats role 2 as part of the `admin` bucket in some checks, but `type === 'agent'` is checked elsewhere for a functionally similar "Agent/Manager" concept — the exact boundary between "role 2" and "type=agent" was not fully disambiguated in this pass | Low-Medium — worth a direct audit if agent/manager permission bugs are ever reported |
| Backend error-handler chain bug | The frontend's `utils/api.js` contains defensive code (`parseApiJsonResponse`) specifically to handle a known backend bug where two JSON documents get concatenated in one error response body | Medium — the root cause lives in the backend's error-handling chain and should be fixed at the source rather than patched around client-side |

## 20.5 UI / functional issues

| Issue | Evidence | Severity |
|---|---|---|
| Ticket report export is simulated | `TicketReportsView.jsx` uses `setTimeout` + toast, no real file generated | Medium — could mislead a staff user into believing an export succeeded |
| Ticket SLA settings save is simulated | `TicketSlaManagementView.jsx`, same pattern | Medium |
| Admin Reports page uses static mock data | Confirmed via `mockData` import | Medium — same "looks live, isn't" risk |
| HR Settings possibly localStorage-only | Confirm against `docs/04-pages/hr-performance-assets-exit/HrSettings.md` | Medium if confirmed — a multi-admin team would not see each other's HR Settings changes |
| **`AttendanceUpload.jsx`/`DailyAttendance.jsx` are both dead code — confirmed unrouted** | Direct check of `src\App.jsx` confirms neither has a `<Route>`, lazy import, or any embed anywhere in `src`. Only `AttendanceView.jsx` (`/admin/attendance`, read-only) and `ShiftManagement.jsx` (`/admin/attendance/shift`) are reachable. **Practical consequence: there is currently no way to mark or bulk-import attendance through the live admin UI at all** — the backend endpoints (`attendance/cell`, `attendance/import`) are fully implemented and unused from the frontend. `AttendanceUpload.jsx` (which has a Monthly/Daily template toggle `DailyAttendance.jsx` lacks) looks like the intended successor. | **High** — a core advertised feature (attendance marking) is not actually reachable in the shipped UI |
| `AttendanceView.jsx`'s Check-In/Check-Out/Work-Hours/Remarks columns are simulated | These are client-side hardcoded-per-status values, not real recorded timestamps | Medium — could be mistaken for real time-tracking data in a demo or client review |
| Permission-string mismatch on Attendance | Frontend gates `/admin/attendance` on `ui.admin.attendance.view`; backend `attendance/grid` requires `hr.attendance.read` — two different strings for what should be the same gate | Low-Medium |
| `ShiftController::store()`/`update()` skip company scoping | Unlike `index()`/`assign()`, these two methods don't call `scopedCompany()` — a tampered request could create/update a shift under an arbitrary `company_code` | Medium — tenancy-isolation gap |
| `lookupUser()` stub in `AuthContext.jsx` always returns `null` | Dead/unfinished code path, confirmed in state/API research | Low |
| **Undefined `Lock` icon reference in `CandidatePipeline.jsx` — confirmed runtime `ReferenceError`** | The compact list view (`CandidateListView`) renders `<Lock size={13} />` for any candidate outside the Candidates tab's owned stages, but `Lock` is not among the `lucide-react` icons imported at the top of the file. This throws the first time a compact-view row needs to show the locked state — a live, reproducible defect, not a hypothetical one. | **High** — crashes a specific view mode of a core Hiring screen |
| Duplicate quiz-management UI | `TrainingQuizPage.jsx` (`/admin/hr/training`) and `AssessmentTab.jsx`'s embedded "Quiz Library" view are two independent React implementations of full CRUD over the identical `training_quizzes` table via the identical backend endpoints — an HR user can create/edit/delete the same quiz from either entry point with no distinction between them | Medium — confusing UX and duplicated maintenance surface for no apparent functional benefit |
| No server-side stage-adjacency enforcement in the Hiring pipeline | The frontend's `TAB_STAGE_KEYS` tab-ownership model (which stage each Hiring tab may act on) is enforced only in React; the backend `CandidateController::moveStage` accepts any of the 10 valid stage values as a transition target from any current stage — nothing stops a direct API call (or a modified frontend) from moving a candidate straight from `applied` to `offer_accepted` | Medium — a business-process integrity gap, not an authz bypass (permission checks still apply), but bypasses the intended pipeline discipline |
| `InterviewController`/`OfferController` skip `ScopesCompany` | Unlike `JobRequisitionController`/`CandidateController`/`QuizAttemptController`, these two controllers' `index()` queries aren't independently company/unit filtered — they rely on already-filtered candidate/requisition relationships rather than their own tenant scope | Medium — narrower tenant-isolation guarantee than sibling Hiring endpoints, worth an explicit review |
| Login's forgot-password Step 3 doesn't re-validate the OTP | `AuthController`'s final password-reset step sets a new password without re-checking the OTP value submitted earlier in the flow, per direct code review during the Trial Form/Login documentation pass | Medium — weakens the intended "OTP proves you still hold the verified channel" guarantee of the 3-step recovery flow |
| "Nidhi Impex only" company gating for Trial Form is frontend-only | The restriction limiting Trial Form visibility/access to the Nidhi Impex company (or "all-companies" scope) is enforced in the nav/route gate on the client but has no matching server-side check found in `UserController`'s trial-form methods | Medium — a direct API call could submit/list trial forms for a company the UI would never expose to that user |
| `AgentDashboard.jsx` references a "New Candidate" action that doesn't exist | The empty-state copy mentions adding a new candidate, but a repo-wide grep found no actual "New Candidate" button anywhere in the reachable source | Low — a copy/functionality mismatch, possibly a removed feature or an unfinished one |
| Two divergent `PrintableTrialForm` implementations | One inline within `TrialForm.jsx` and one standalone in `components/forms/PrintableTrialForm.jsx` — both render the same conceptual document but are separately maintained, risking visual/data drift between the two print paths | Low-Medium |

## 20.6 Security-relevant issues

See [Security Audit](16-security-audit.md) §17.14 for the ranked list; the highest-priority items (no malware scanning on uploads, unauthenticated `/storage/{path}`, the broader-than-expected Aadhaar disclosure model, the `module.schema:authorization` no-op, 30-day JWT TTL with no refresh flow, confirmed plaintext Aadhaar data) are cross-referenced here rather than duplicated.

## 20.7 Data-model / architecture-level issues

| Issue | Evidence | Severity |
|---|---|---|
| No `companies`/`units` tables — tenancy via string parsing | Confirmed across `ScopeMatcher`, `AuthorizedUserQuery`, `Ticket::scopeVisibleTo`, multiple controllers independently reimplementing the same comma-list/`'all'`-sentinel logic before `ScopeMatcher` centralized part of it | Medium-High — a structural scalability/maintainability concern, not a bug per se, but a real architectural debt item |
| Three coexisting authorization mechanisms | By design (documented migration path), but represents ongoing complexity and a larger attack surface / audit burden until the legacy paths are fully retired | Medium (structural, monitored via `authz:coverage`) |
| Two document systems (legacy local `DocumentController` + current S3 `Api/V1/DocumentController`) both remain live simultaneously | Confirmed in both routes and controllers | Low-Medium — increases maintenance surface until the legacy path is fully retired |

## 20.8 Code smells (high level only, per report scope)

- `UserController.php` at 2,137 lines is a "god controller" spanning employees, appointments, trial forms, and agents — a strong candidate for splitting along those four responsibilities.
- Repeated `Model::find($id)` + manual 404 pattern instead of route-model binding/`findOrFail` across most `Admin/Hr/*` and `Api/V1/*` controllers — consistent, but verbose; a shared trait or Laravel's built-in binding would reduce repetition.
- `hr.employee.export`/`.import` permission naming vs. every other module's lack of a distinct `.export` permission — a minor inconsistency in the permission taxonomy.
