# DOMAIN 08 — Recruitment & Candidate Experience: Codebase Audit

**Date:** 2026-08-14 (evening; verified against the working tree as of ~18:00 IST)
**Scope:** the mandated pre-implementation audit for the Domain 08 master prompt. No code or tables were created for this audit.
**Method:** two parallel full-codebase sweeps (backend `salary-slip-bac/`, frontend `salary-slip-front/salary-slip-front/src/`), git-history reconstruction of the last 48 hours, and hand-verification of every P0 claim (file:line cited).
**Context that changes everything:** Domain 08 is *not* greenfield. Commits `2026-08-13 → 2026-08-14` (esp. `aab2c4bc` "Implement Job Portal and Candidate Recruitment Workflow") delivered a large slice of this domain: a 3-stage requisition approval workflow, a public careers portal with candidate accounts, and job-portal publishing. Another session was still editing `routes/api.php` at 17:44 today — coordinate before touching shared files.

---

## 1. EXISTING (working, wired end-to-end)

| Area | What exists | Where |
|---|---|---|
| Requisition CRUD + 2-step create | Department → Department Manager (derived from `reporting_relationships`) → full form; company-scoped by-id actions; backend re-validates manager-leads-department | `hiring/RequisitionsTab.jsx`, `JobRequisitionController`, `Services/Hr/DepartmentManagers.php` |
| Requisition approval workflow | Dept Head submit → HR Manager (forward/return) → Director (approve/return); cycles + steps + JSON snapshots + audit log + in-app notifications; queue UIs; withdraw | `Services/Hr/JobRequisitionApprovalService.php` (603 lines), `ApprovalReviewTab.jsx`, tables `job_requisition_approval_cycles/steps` |
| Job portal publishing | Approved requisitions published/unpublished to public careers portal; queue tab with counts | `JobPortalTab.jsx`, `@portalPublish/@portalUnpublish`, `/api/public/jobs` |
| Public careers portal | Job list/detail (sanitized JD), candidate register/verify/login (Sanctum tokens — guard IS valid, Sanctum self-registers it), apply with resume, application tracking dashboard | `pages/careers/*`, `Candidate\CandidateAuthController`, `CandidateApplicationController`, `candidate_accounts` table |
| Candidate pipeline | 10-stage master with history, Kanban + list, stage moves w/ rejection reasons, docs upload/review, authenticated resume streaming | `CandidatePipeline.jsx`, `CandidateController`, `candidate_stage_history` |
| Assessments | Internal quiz engine: bank CRUD, assignment, 64-char token links, proctored public runner (violations, autosave, termination), scoring | `AssessmentTab.jsx`, `pages/public/CandidateQuiz.jsx`, `TrainingQuizController`, `QuizAttemptController` |
| Interviews | Schedule/reschedule/cancel, panelists, feedback (rating + recommendation), invite mail | `InterviewManagement.jsx`, `InterviewController` |
| Offers | Draft → approve → release, versioned revisions, CTC breakup, offer mail, HR-recorded response | `OfferManagement.jsx`, `OfferController`, `offer_revisions` |
| Onboarding (post-offer) | Real dashboard/journeys/documents (fabricated data removed per controller header) | `onboarding/OnboardingWorkspace.jsx`, `OnboardingController` |
| Indeed | Settings tab (client id/secret/employer id), publish action, public XML feed | `HrSettings.jsx`, `IndeedJobService`, `IndeedFeedController` |

## 2. REUSABLE (exists elsewhere; Domain 08 must consume, not duplicate)

- **Authorization**: `permission:` middleware + `PermissionRegistry` `ui.*` tree; 08-14 migrations already seeded `hr.requisition.{submit,withdraw,hr_manager.*,director.*,job_portal.*,department.override}`. Enforcement is still shadow-mode globally.
- **Company scope**: `ScopesCompany` trait; **manager truth**: `reporting_relationships` via `Services/Hr/DepartmentManagers` + `ReportingHierarchy::isEligibleManager`.
- **Domain 02 (built today)**: `legal_entities`, `locations`, `calendars` + services — postings/requisitions should reference these instead of free-text location.
- **Domain 03**: workforce masters (job families/levels/grades/designations) under `/admin/workforce` — requisition `designation` is currently a free string that ignores them.
- **Notifications** (`Notification` rows — already used by the approval service), **AuditLogger**, **document storage** (`candidate_documents`), **mail** (interview/offer/assessment mails exist).

## 3. INCOMPLETE (started, gaps or defects — file:line verified)

**P0 — broken in main today (all hand-verified):**
1. `POST /api/hr/requisitions/approve/{id}` → guaranteed 500: `JobRequisitionController.php:449` calls `$approvals->decideLegacy(...)` — no such method on `JobRequisitionApprovalService` (also `:589` calls nonexistent `->decide()`, currently unreachable).
2. Non-privileged requisition **submit crashes**: `JobRequisitionApprovalService.php:507` calls `DepartmentManagers::isManagerOf($actor->id, $department)` — signature (`DepartmentManagers.php:49`) requires a 3rd `callable $applyScope`. `ArgumentCountError` for any submitter who is not super-admin and lacks `hr.requisition.department.override`.
3. **Careers-portal apply fails on insert**: `CandidateApplicationController.php:84-87` writes `['stage' => 'applied']` to `candidate_stage_history` — no `stage` column, and `to_stage` is NOT NULL.
4. `candidates.ats_score` validated (`CandidateController:86,128`) but absent from `Candidate::$fillable` → silently dropped.
5. Candidate portal **returns raw `verification_token` / `reset_token` in the JSON response** (`CandidateAuthController.php:39,143`) — no email is sent; anyone registering with someone else's address could verify it.
6. Status vocabulary drift: workflow writes `pending_hr_review/pending_director_review/returned_to_hr/revision_requested/published`; `HrDashboardController:41,125-126` still counts `pending_approval` → those counters are structurally zero.
7. `RequireModuleSchema::MODULES['hr']` lists only the 13 original tables — `training_quizzes`, `quiz_attempts`, `candidate_documents`, `candidate_accounts`, and both approval tables are missing, so a partially-migrated deploy passes the gate then 500s.
8. `IndeedFeedController.php:17-19,31` publishes the shared candidate-intake write token inside an unauthenticated XML feed; `PublicCandidateIntakeController.php:55-66` logs full applicant payloads at INFO ("temporary diagnostic").
9. `IndeedJobService.php:76-89` fallback **fabricates success** (`IND-XXXXXXXXXX`) with no HTTP call → UI shows "Published on Indeed ✓" untruthfully; payload reads nonexistent columns so salary/type always use hardcoded defaults.
10. `directorDecision` "rejected" is silently treated as "returned" (service has no rejected branch); `OfferController::approve` has no state precondition (re-approve released/rejected offers); `InterviewController::feedback` accepts caller-supplied `panelist_id` unverified.

**Structural gaps in started areas:** interviews/offers/candidate-documents have **no company scope** (and `interviews`/`offers` lack `company_code` columns); offer flow has no candidate-facing acceptance, no PDF letter, no expiry enforcement, no signature; candidate portal lacks profile-edit UI, password-reset pages (APIs exist), post-application document upload; no duplicate-application check; analytics: `candidate_stage_history` holds all timestamps needed for time-to-hire/conversion, but nothing computes them; report `interview`/`hr_kpi` types leak cross-company counts; `hr.{candidate,offer,report}.export` permissions have no endpoints; in-page permission gating (`can()`) exists only in the 4 newest hiring files.

## 4. MISSING (no trace: zero routes, tables, components)

Manpower/headcount requests & budget validation (08.2) · job-posting entity/channels/expiry/localization (08.5 — publishing is a status flip; public slug is faked from title) · screening/resume parsing/scoring (08.10) · assessment provider adapters/retake policy (08.11 partial) · interviewer/candidate availability & auto-scheduling & calendar integration (08.12-13) · configurable per-round scorecards & panel consensus (08.14) · candidate comparison/comp-fit/reference checks (08.15) · digital signature (08.16) · **BGV** (08.17) · **referrals** as a feature (08.18 — only a `source` enum value) · **agencies/vendors** (08.19) · **internal job applications** (08.20) · talent pools/tags/consent/retention (08.7) · saved jobs/alerts (08.8).

## 5. DUPLICATE (parallel systems to reconcile, not multiply)

- **Two apply paths**: the Google-Form link embedded in every generated JD (`hr.google_form_url` + `PublicCandidateIntakeController`) vs. the new careers portal. Decide the survivor; today both feed `candidates` with different validation.
- **Three "publish" notions** on requisitions: portal publish, Indeed publish (`status='posted'`), and the dead legacy `approve/{id}`.
- **`hiring_manager_id` vs `hr_manager_id`**: 08-14 migration renamed the concept; both columns live, model maps `hiringManager()` onto `hr_manager_id`, legacy routes alias. Consolidation pending.
- **Legacy agent/trial-form recruitment** (`recruitment.*` permissions, candidates-as-`users` rows) is a separate older system from the `candidates` table — do not merge blindly.
- **Candidate == application**: each portal application creates a *new* `candidates` row linked by `candidate_account_id`. If a true `applications` table is ever introduced, this is a refactor, not an addition.

## 6. CONFLICT

- Departments are linked by **free-text name** (`users.department` string) while requisitions use `department_id` — the manager-derivation depends on exact name matches.
- Requisition `designation` free text ignores Domain 03 job masters (the prompt's JOB ≠ POSITION ≠ REQUISITION rule is currently unmet; there is no position linkage at all).
- `users.joining_date` is varchar — dashboard growth series depends on `LIKE 'YYYY-MM%'`.
- Frontend `bulkActions.js` loops single-record endpoints (documented; no bulk API).

## 7. DEPENDENCY

Domain 01 authz (shadow mode — new `.decide` permissions are only UX until enforcement) · Domain 02 org tables (just built; not yet consumed by recruitment) · Domain 03 job masters (built; not consumed) · Onboarding (Domain 09 hand-off exists via `offer_accepted` journeys) · mailer configuration (candidate portal has none wired) · Fast2SMS/OTP infra (separate; see 2026-08-13 prod note).

## 8. MIGRATION RISK

- Six new HR tables missing from the schema gate (above) — any deploy that ships code before migrations 500s behind a green gate.
- The AWS deploy block **omits `config/` and `storage/` and never edits `.env`** (see `project-aws-deploy` runbook note) — Sanctum config, mailer, intake token, Indeed keys will not reach prod by the usual copy.
- `2026_08_14_000000_ensure_agent_and_recruitment_permissions.php` is a neutralized no-op whose original body already over-granted on ≥1 DB — check grants before trusting role state.
- Approval-cycle FKs cascade from requisitions; requisition delete is guarded (draft/rejected, no cycles/candidates) — keep that guard when extending.

---

## 9. Phased plan (recommendation)

- **Phase 0 — Repair what shipped today** (small, high value): fix P0 items 1-9; align dashboard counters with the new statuses; add the six tables to the schema gate; add feature tests for submit-as-department-head, portal apply, and the legacy approve route (remove or reimplement it). *Blocker: coordinate with the session that owns `JobRequisitionApprovalService` (last edit 14:44 today).*
- **Phase 1 — Close the candidate loop**: mail delivery for verify/reset (stop returning raw tokens); candidate profile + password-reset pages; candidate-facing offer view/accept-decline (tokened, with expiry enforcement); post-application document upload; duplicate-application check; application withdrawal.
- **Phase 2 — Tenancy + analytics**: `company_code/unit` on `interviews`/`offers` + scoping (additive migration + backfill via candidate); time-to-hire/time-to-fill/stage-conversion/source-effectiveness from `candidate_stage_history`; report exports; in-page `can()` gating for the older hiring tabs.
- **Phase 3 — New subdomains by value**: referrals → screening (transparent scoring, fix `ats_score`) → job-posting entity with channels/expiry/slugs (consuming Domain 02 locations) → manpower/headcount requests → BGV case tracking (extending `candidate_documents` review) → internal jobs → agencies → talent pools.

**Not recommended:** building 08.2/08.17/08.19/08.20 before Phase 0-1 — the prompt's own rule (INSPECT → REUSE → EXTEND) points at stabilizing the half-landed workflow and portal first.

*The pasted Domain 08 master prompt was truncated mid-“API architecture” section; if its tail contains sequencing or reporting mandates, fold them in before Phase 1.*
