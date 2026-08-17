# HR Module Deep Audit — Full Submodule Detail (2026-08-16)

Companion to `00-critical-findings.md` (read that first for the ranked summary). This file is the complete file-by-file record every finding there was drawn from.

---

## 1. HR Dashboard

**Route:** `/admin/hr/dashboard` → `HrDashboard.jsx` → `GET /hr/dashboard` → `HrDashboardController::index` (its only method).

**Frontend** (`HrDashboard.jsx`, 524 lines, all sub-components defined inline): loads in two waves — `hrApi.getDashboard` + `getAssetDashboard` + `getPerformanceDashboard` in parallel, then `getOnboardingDashboard` + `getPerformanceReviews` + `getInterviews` + `salaryApi.getAttendanceGrid`. All secondary calls `.catch(() => null)` — failures silently degrade a widget with no toast, no console log, invisible except for the primary call. "Leave Overview" (lines 353-359) is a permanent static placeholder, no API call. Roughly 40% of the backend's JSON payload (`upcoming_birthdays`, `upcoming_anniversaries`, `gender_diversity`, `age_distribution`, `pending_resignations`, `upcoming_confirmations`, `upcoming_work_anniversaries`) is computed server-side but never read by this component — wasted DB work on every load.

**Backend** (`HrDashboardController.php`, 147 lines, single `index()` method): `$userQuery` (employee cards) is correctly scoped via `ScopesCompany`. `upcoming_confirmations`/`employees_on_leave` cards are hardcoded `0`. From the hiring-funnel block onward, `Candidate`/`JobRequisition`/`Offer`/`Interview`/`Asset` are queried with **zero company scoping** — cross-tenant leak, see critical findings #6. No N+1 patterns (everything loops over an already-fetched collection). No missing imports/undefined vars.

**Database:** `Candidate`/`JobRequisition`/`Asset` carry `company_code`/`unit` directly (indexed) — built for scoping the controller doesn't apply. `Interview`/`Offer` have no own tenant column, scoped only transitively via FK to `Candidate`/`JobRequisition`. `JobRequisition::hiringManager()` points at `hr_manager_id`, the same column as `hrManager()` — see the dedicated write-up under Hiring/Database below for why (intentional rename, stale trap).

---

## 2. Onboarding

**Frontend** (`salary-slip-front/salary-slip-front/src/pages/admin/hr/onboarding/`): `OnboardingWorkspace.jsx` (tab router) → `OverviewTab.jsx`, `EmployeesTab.jsx`, `DocumentsTab.jsx`, `TimelineTab.jsx`, `EmployeeDrawer.jsx`.

- `OverviewTab.jsx::jobRowToEmployee()` hardcodes `slaBreached: false` for every candidate opened from this tab — real SLA status is only computed in the backend's `journeys()` method, which `OverviewTab` doesn't call, so SLA breach never shows correctly from this entry point.
- `DocumentsTab.jsx` and `TimelineTab.jsx` each independently re-fetch candidates (`hrApi.getCandidates(..., {stage: "offer_accepted"})`) instead of reusing `EmployeesTab`'s source — duplicate fetches, inconsistent source of truth. `TimelineTab.jsx` also near-verbatim duplicates `EmployeeDrawer.jsx`'s `buildTimeline()` logic rather than sharing it.
- `DocumentsTab.jsx` line 326-329 has an explicit "AI verification (OCR, mismatch alerts, face match) — coming soon" banner — an honest, disabled-feature notice, not deceptive mock data.
- **`WelcomePortal.jsx` is entirely mock and orphaned** — not imported/routed anywhere. Hardcoded `PEOPLE`/`TASKS` arrays, a fixed "Day 1 · 04 August 2026 · Shailesh, NI-24817" banner, a static 5-day itinerary, and 6 "portal section" cards whose buttons have no `onClick` handlers at all.
- `onboardingApi.js` defines 4 functions; only `getDashboard`/`getJourneys` are ever called — `getDocuments`/`reviewDocument` are dead, superseded by the `hrApi.*CandidateDocument*` family the UI actually uses.

**Backend** (`OnboardingController.php`, 292 lines): class docblock confirms this used to fabricate documents/metrics and has since been rewritten to be data-driven — verified true for `dashboard()` (well-built, batches queries, no N+1) and `journeys()` (scoped, but has a real N+1: per-candidate `Offer::where(...)->first()` and `CandidateDocument::where(...)->get()` inside the loop instead of batching like `dashboard()` does). **`showJourney($id)` is not scoped at all** — cross-tenant IDOR, live-routed, not called by the current frontend. `documents()`/`reviewDocument()` are routed and functional but never called by the frontend either — dead from the SPA's perspective but directly callable. `reviewDocument`'s route is gated by a **read** permission (`document.file.read`) despite performing a state-changing POST — verb/permission mismatch.

**`CandidateDocumentController.php` (the controller the live UI actually uses) has zero scoping in any of its 4 methods** — doesn't even import `ScopesCompany`. This is the highest-severity finding in the whole audit; see critical findings #1.

**Database:** `Candidate` (soft-deletes), `Offer`, `CandidateDocument` — all FKs correctly cascade/null-on-delete, no orphan risk at the schema level. `candidate_documents.status` is a free string column with no DB-level enum, validity enforced only in the controller's `in_array` check.

---

## 3. Organization / Promotion-Transfer (built this session)

**Frontend:** `Organization.jsx` is a pure composition shell — of its 8 tabs, only Promotions & Transfers and Governance have HR-specific code; the other six are verbatim re-imports of the Domain-02/03 Organization/Workforce pages, per the file's own header comment (intentional, not duplication). `OverviewTab.jsx`, `PromotionTransferTab.jsx`, `GovernanceTab.jsx` — no mock data, no TODOs found. `PromotionTransferTab.jsx` client-side validation doesn't check `positionId` actually belongs to `organizationUnitId` (trusts the unit-scoped dropdown, which does filter correctly in normal UI flow — a directly-crafted API call could still send a mismatched pair).

**Backend:**
- `OrganizationChangeManagementService::createPromotionTransfer()` only checks the **target unit's** company visibility — never the employee's, the manager's, or either approver's. If the target unit has no `company_id` (enterprise-level), the check is skipped entirely. Consistent with the class's general "only check what's non-null" pattern elsewhere, so not a new hole, but the promotion-transfer path inherits an existing scoping weakness.
- Position/unit mismatch is only caught at `apply()` time via `OrganizationUnitService::createAssignment()`'s existing guard — not at request creation, so a bad request can pass full approval before failing.
- `apply()` sets `status='applied'` **before** running the item loop, then rolls back the whole `DB::transaction` on failure (correct, but confusing to read — looks like success is recorded before the work happens).
- `revalidateRequest()` only re-checks `update_unit`/`delete_unit` targets before `apply()`, not `update_assignment` targets.
- `OrganizationUnitController::index()` is the one method in that controller not wrapped in the shared `guarded()` exception handler — would 500 instead of returning clean JSON if `units()` ever started throwing.
- Nested `DB::transaction` in `applyPromotionTransfer()` (inside the already-transactional `apply()`) is redundant (Laravel handles it via savepoints) but harmless.

**Database:** `organization_change_requests.change_type`/`status` are plain strings with no DB-level enum, relying entirely on app-level `Rule::in()`. `employee_organization_assignments`'s unique constraint doesn't include `is_primary`, so nothing at the DB layer stops two "primary" rows from both being active if application logic ever fails to close the old one (currently prevented only by app code, not the schema).

---

## 4. Hiring/Recruitment — Backend controllers & services

18 controllers/services read in full. Scoping-consistency table (methods on the same controller that scope differently):

| Controller | Scoped | Not scoped |
|---|---|---|
| `CandidateController` | All methods (consistent) | — |
| `CandidateCrmController` | `tags/storeTag/pools/storePool` + candidate-relationship endpoints | `updateTag/destroyTag/updatePool/destroyPool/poolCandidates` — raw `find()`, cross-tenant tag/pool takeover |
| `CandidateDocumentController` | **none** | **all 4 methods** — see critical finding #1 |
| `InterviewController` | All methods (consistent) | — |
| `JobRequisitionController` | Everything through `scopedRequisition()` | `applyTemplate()` — unscoped **and** references a nonexistent `JobRequisitionTemplate` class (fatal 500, live-routed) |
| `OfferController` | All methods (consistent) | — |
| `RecruitmentDashboardController` | KPI cards only | Everything else in `index()` — see critical finding #5. `applyCompanyScopeQuery()` is dead code (empty body). |
| `QuizAttemptController` | `index/store/assignableCandidates` | `show/destroy` |
| `TrainingQuizController` | `index/store` | `show/update/destroy` |
| `Candidate\CandidateApplicationController` | Implicitly correct (all queries derive from the authenticated candidate's own account) | — |
| `Candidate\CandidateAuthController` | N/A (public auth endpoints) | See critical finding #2 — token leak confirmed worse than previously known, no email-sending code exists in the file at all |
| `Public\PublicJobController` | N/A, intentionally public, correctly restricts to `status=published` | — |
| `PublicCandidateIntakeController` | Shared-token auth (documented, intentional trade-off) | Debug PII logging still present, see critical findings #10 |
| `PublicQuizController` | Token-per-attempt (documented, intentional) | Best-written file in the set — server-recomputes scores, strips answer key, enforces timeouts server-side, no bugs found |

**Other confirmed findings:**
- `JobRequisitionController::destroy()` — the previous safeguard against deleting non-draft/linked requisitions is commented out ("Soft deletion is allowed for all stages per user request") — an intentional product decision per the comment, but means an approved/published requisition with linked candidates can now be hard-deleted.
- Resume-path sanitization (`CandidateController::resume()` and `ResumeTextExtractor::resolvePath()`, duplicated logic in both) strips `..` only once, not recursively — a value like `....//` collapses to `../` after one pass. Fragile, not a proven full traversal exploit, worth hardening.
- `ScopesCompany::whereCompanyCodeMatches()` (used by every controller through the trait) and `JobRequisitionApprovalService::eligibleApprovers()` both use raw SQL `||` string concatenation — Postgres/SQLite syntax, **not** MySQL's default (`CONCAT()` required unless `PIPES_AS_CONCAT` is set). Same class of driver-portability bug as the `EXTRACT(EPOCH...)` issue fixed earlier this session — not currently firing since deployments are Postgres/SQLite, but latent.
- `JobRequisitionApprovalService` is the most rigorously authorization-checked file in the whole set — row-locking (`lockForUpdate`) inside `DB::transaction` on every one of its 8 mutating methods, layered actor/permission checks via `AuthorizationEngine::decide()`.

---

## 5. Hiring/Recruitment — Database & models

18 models read in full against their migrations — no fillable/column mismatches found anywhere. Architectural summary: **no Eloquent global scope exists on any model in this codebase.** Tenant-root entities (`Candidate`, `JobRequisition`, `TrainingQuiz`, `QuizAttempt`, `CandidateTag`, `TalentPool`) carry `company_code`/`unit` directly and are scoped by controllers calling `ScopesCompany::applyCompanyScope()`. Child entities (`CandidateDocument`, `CandidateNote`, `Interview`, `Offer`, etc.) carry no tenant columns and are scoped only transitively via `whereHas('parent', ...)` — meaning there is no model-level or framework-level safety net; a missed `whereHas` anywhere silently leaks cross-tenant data, which is exactly the pattern responsible for most of the security findings above.

**Specific finding — `JobRequisition::hiringManager()`:** the schema was intentionally renamed mid-project (`hiring_manager_id` → `hr_manager_id`, migration `2026_08_14_010200_migrate_hiring_manager_to_hr_manager.php`, which also renamed the approval-step type constant). Both columns still physically exist and are both `$fillable`. The model's relation methods:
```php
public function hrManager() { return $this->belongsTo(User::class, 'hr_manager_id'); }
public function hiringManager() { return $this->belongsTo(User::class, 'hr_manager_id'); } // same column
```
`hiring_manager_id` is now a frozen/dead legacy column still writable via mass assignment and still populated by `JobRequisitionApprovalService.php:131` — any code path that writes only to the old column and expects `hiringManager()` to reflect it will get stale data.

`CandidateAccount` has no `company_code`/`unit` at all — deliberate, since it's the candidate's own portal login shared across whatever companies they apply to, not a bug.

---

## 6. Hiring/Recruitment — Frontend: Candidates, Interview, Offer tabs

**`CandidatePipeline.jsx` (866 lines, the master Candidates roster):**
- **Line 553: `<Lock>` used, never imported — live crash, see critical finding #3.**
- Correctly threads `companyScope`/`scopeKey` through every fetch (the one file in the whole Hiring frontend that does this consistently).
- No `useAuthorization()`/`can()` anywhere — Add/Delete/stage-move/bulk-export all unguarded client-side.
- Pagination/total mismatch: priority/recruiter filters apply client-side after the server page loads, but the pager still shows the server's unfiltered total; page doesn't reset on those filter changes, so a filtered view can land on an out-of-range empty page.
- Bulk stage-move dropdown allows jumping straight to "interview" (skipping "assessment"), while the single-row advance button always goes through the ordered `MAIN_STAGES` sequence — same starting stage, two different resulting paths depending on which control was used.

**`InterviewManagement.jsx` (395 lines):**
- **No company scoping at all** — never imports `useCompany`, neither `getInterviews` nor `getCandidates` sends `companyScope`, and the load effect doesn't re-fetch when the active company context changes (`[user]` only, no `scopeKey`).
- Hardcoded `per_page: 100` for both interviews and roster, no pagination UI — rows silently drop past 100.
- `currentRoundInterview()` picks the highest-`id` interview, not the most recent by time, despite a comment implying otherwise (low risk under normal auto-increment IDs).
- No `window.confirm` guard before Select/Reject in the Proceed modal, unlike delete/cancel actions elsewhere in the codebase.
- No `useAuthorization()`/`can()` anywhere.

**`OfferManagement.jsx` (317 lines, handles CTC/salary data):**
- **No company scoping at all**, same pattern as InterviewManagement — no `useCompany`, no `companyScope` on `getOffers`/`getCandidates`, no re-fetch on company switch.
- Hardcoded `per_page: 100` — concretely dangerous here: an offer that falls outside the fetched 100 makes the UI think a candidate has no offer yet, risking a **duplicate offer being created**.
- `EMPTY_BREAKUP` hardcodes a static Basic/HRA/Allowances template disconnected from any real company salary-structure config.
- No validation that the itemized salary breakup sums to the declared CTC.
- Two breakup rows with the same label silently collapse via `Object.fromEntries`, dropping one with no warning.
- Approve/Release/Respond/Withdraw have no loading-state guard (only Hold/Reject do) — rapid double-clicks can fire duplicate lifecycle-transition requests.
- `pending_approval` offer status has a badge color defined but no button anywhere transitions an offer into or out of it — a dead-end status in the UI if the backend ever uses it.
- **No `useAuthorization()`/`can()` anywhere** — the most sensitive PII/compensation surface of the three tabs has zero client-side permission gating.

---

## 7. Hiring/Recruitment — Frontend: Approval, Assessment, Job Portal, Talent Pool tabs

**Cross-cutting note:** `apiRequest` already throws on any `success: false`/`status: false` response before `.then()` runs, so every `if (res.status) {...}` guard seen across these four files is unreachable dead code in practice — harmless, just noise, not repeated per-occurrence below.

**`ApprovalReviewTab.jsx`:**
- **"Forward to Director" is non-functional**: `handleForwardToDirector` always sends `director_id: null`, hardcoded, regardless of the `eligibleDirectors` list fetched into state — there is no `<select>` anywhere bound to it. See critical findings.
- Dead: `Edit2` import, `openRequisitionForm`/`people` props, `directorId`/`eligibleDirectors`/`directorsLoading` state, `requisitionData` variable, `money()` helper.
- `openDetails(step)` opens the modal before checking whether `step.cycle.requisition` exists — on missing data, the modal silently falls into "New Requisition / create mode" instead of showing an error.
- `job_description`/`requirements` correctly sanitized with `DOMPurify` before `dangerouslySetInnerHTML` — no XSS.

**`AssessmentTab.jsx`:**
- **Answer-index corruption bug on quiz save** — see critical findings, data-integrity section.
- **No `useAuthorization()`/`can()` at all** — the only one of these four tabs with zero permission gating (create/edit/delete quiz, assign, revoke, skip/reject/hold candidate all unguarded).
- **No company scoping on any call** (`getCandidates`, `getQuizzes`, `getQuizAttempts`, `assignQuiz`, `updateQuiz`/`storeQuiz`, `deleteQuiz`).
- `TAB_STAGE_KEYS.assessment` includes `rejected`/`on_hold`, so the roster keeps showing already-terminal candidates with "Assign Quiz"/"Process" actions still offered, and the "waiting" stat count is inflated by them.
- `quizForm.interview_id` is round-tripped and sent on save but has no form field anywhere to actually set it.
- `skipAssessment`/`proceedToInterview` are functionally identical, just reached via different UI paths — duplicated logic.

**`JobPortalTab.jsx`:**
- **`handleClose` has no permission check at all** while `handlePublish`/`handleUnpublish` right next to it correctly check `canPublish` — any viewer of the tab can close a live public job listing, gated only by a `window.confirm`.
- Search only fires on Enter (deliberately excluded from the auto-load effect's deps) with no visible search button — easy to miss, inconsistent with `ApprovalReviewTab`'s debounced auto-search for the same conceptual feature.
- The rest of the file (queue loading, publish/unpublish/close API wiring) is correctly company-scoped.

**`TalentPoolTab.jsx`:**
- **No company scoping** — candidate search for adding to a pool could surface cross-company candidates if the backend doesn't independently enforce it.
- `canManage = can("hr.candidate.pool")` uses a bare legacy code, inconsistent with the `ui.hr.hiring.*` convention the other three tabs use — worth confirming this legacy code still has a live mapping.
- Hand-rolls its own modal overlay instead of reusing the shared `Modal` component (only file among the four that doesn't).
- Debounced candidate search has no in-flight-request cancellation — an earlier, slower response can overwrite a later one's results (out-of-order race), and the debounce timer isn't cleared on unmount.
- `savePool`/`addCandidate`/`removeCandidate` don't re-check `canManage` internally (rely on the UI not exposing the controls) while `openEdit`/`deletePool` do guard explicitly — inconsistent even within this one file.

**Also confirmed unused / architecture-vs-reality gap:** `useHrFilters.js` and `bulkActions.js` are shared helpers whose own doc comments claim "one filter state shared by every Hiring tab" — but none of these four tabs actually use them (only `RequisitionsTab.jsx`/`HRManagerTab.jsx` do). Each of the four reimplements its own ad hoc local filter state instead.

---

## 8. Hiring/Recruitment — Frontend: drawers & modals

**`CandidateDrawer.jsx`:** resume handling is done correctly and defensively (rejects `file:`/UNC paths, fetches the authenticated API endpoint as a blob with a bearer token rather than a bare unauthenticated `<iframe>`/`<a href>`). No `useAuthorization()` at all — Delete, Advance, and ATS Recompute buttons render unconditionally. If a candidate's `stage` value isn't recognized, `currentIdx` is `undefined` and the UI silently defaults to offering "advance to the first stage."

**`RequisitionDrawer.jsx`:** pure read-only, no API calls of its own (relies on caller pre-loading `requisition`). A candidate with a null/undefined `stage` buckets under the literal string key `"undefined"` in the analytics breakdown, rendering a nonsense row. `RichText` correctly DOMPurify-sanitized. The header Edit button is gated only by requisition status, not by any `can()` check.

**`RequisitionFormModal.jsx`:** JD preview bakes in a hardcoded fake apply-link (see critical findings). `getRequisition()` (edit-load path) passes no company scope — relies entirely on backend enforcement of the single-record `show` endpoint. Numeric fields (`min_experience`, `max_experience`, `salary_min`, `salary_max`) are sent as raw strings with no `Number()` coercion, unlike `openings` which is parsed. No permission check for create-vs-edit.

**`CandidateCrmSections.jsx`:** **the nine missing `hrApi.*` functions — see critical finding #2.** The one working section (Documents) has its download link ungated while upload/verify/reject/delete are properly gated — see critical finding #11. `canDocs` checks only the legacy permission code while `canTags`/`canNotes`/`canComm` check both legacy and `ui.*` forms — inconsistent, code-drift-prone.

**`HiringFilterBar.jsx`:** clean, purely presentational, no findings.

**`HRManagerTab.jsx`:**
- **`<HrManagerReviewModal>` doesn't exist — see critical finding #1.**
- **The entire "Forward to Director"/"Return to Dept Head" review flow is unreachable**: buttons set modal-open/comment/director state, but no modal in the render tree ever reads that state, and the handler functions (`handleForwardToDirector`/`handleReturnToDeptHead`) are never wired to any `onClick`.
- **~150+ lines of fully dead leftover code**: an entire second copy of the requisition create/edit form (state, JD-template builder, step-1/step-2 logic, `Field`/`FormSection` components, `modalOpen` state that's set to `false` once and never to `true`) — superseded by `RequisitionFormModal.jsx` but never removed.
- "Assign specific HR Manager" is non-functional the same way as "Forward to Director" — `submitForApproval` always sends `hr_manager_id: null` regardless of the fetched eligible-managers list.
- Delete/Edit/Duplicate/Archive/Review buttons have **no `can()` check** while Submit/Withdraw/Publish/New-Requisition on the same table correctly check `ui.hr.hiring.*` permissions.
- `viewDrawer`'s `getRequisition()` call passes no company scope, same gap as `RequisitionFormModal.jsx`.
- Unused imports: `Link2`, `Check`, `ClipboardCopy`, `RichTextEditor`, `DatePicker`.

---

## 9. Public Careers Portal & Candidate Quiz

**Cross-cutting, highest-severity item here:** a shared, unscoped `window` `"auth:unauthorized"` event fires on any 401 from any bearer-token request, regardless of which auth domain (admin vs. candidate) issued the token. `AuthContext.jsx` (admin/employee session) listens for it and force-logs-out on a matching message; `CandidateAuthContext.jsx` never listens for it at all. Net effect: an expired/invalid candidate token (e.g. a stale `candidate_token` in `localStorage` from browsing the careers site in another tab) can force-log-out an unrelated admin/HR session with a misleading "Your session has expired" toast. `publicQuizApi` sends no `Authorization` header at all, so quiz 401s are safe by construction — the bug is specific to the authenticated candidate-portal endpoints (`me`, `logout`, `updateProfile`, `apply`, `getApplications`, `getApplication`).

**`CareersList.jsx`:** no request-ordering guard on the search/filter effect — a slower earlier response can overwrite a faster later one (race).

**`JobDetail.jsx`:** `job.description`/`requirements` correctly DOMPurify-sanitized before `dangerouslySetInnerHTML` — positive control, no XSS. `{job.openings || 1}` should be `??` — a legitimately-zero `openings` value (fully staffed, still visible) incorrectly displays "1". No client-side file-size/type enforcement on resume upload beyond the picker hint (backend-only). Route param is named `:slug` but every caller actually passes the numeric `id` — cosmetic/naming inconsistency, not exploitable.

**`CandidateRegister.jsx` / `CandidateLogin.jsx`:** `redirect` query param taken verbatim into React Router's `navigate()` with no path validation — low exploitability since SPA `navigate()` can't leave the app's origin, but still unvalidated input into a navigation primitive. **No "Forgot password?" link exists anywhere in the UI** despite `candidateApi.forgotPassword`/`resetPassword` and the matching backend routes being fully implemented — a genuine, simple functional gap.

**`CandidateVerifyEmail.jsx`:** no resend-verification mechanism in the UI if a link expires, even though this is otherwise a reasonable, standard email-verification flow. Styled dark (`bg-slate-900`) while every sibling careers page is light-themed — visual inconsistency.

**`CandidateDashboard.jsx`:** `/careers/account/applications` has no auth guard at the router level — an unauthenticated visitor sees an infinite loading skeleton (the load effect no-ops silently when there's no token, `loading` never flips to `false`) rather than being redirected to login. No null-guard on `app.applied_at` before date-formatting — renders literal "Invalid Date" if missing. `candidateApi.getApplication(id, token)` exists and has a live backend route but is never called anywhere — no drill-down from the applications list to a detail view.

**`CandidateQuiz.jsx`:** well-engineered overall — server-recomputes scores, strips the answer key before serialization, enforces timing server-side. One real bug: **fullscreen-trap** — fullscreen is requested before calling the `start()` API; if `start()` fails, the code shows a warning but never calls `document.exitFullscreen()`, leaving the candidate stuck in fullscreen with no way out via the UI. No defensive fallback on `q.options` — a malformed question with a missing options array crashes the in-progress quiz view mid-attempt with no error boundary. Question/option text rendered as plain React children (not HTML) — no XSS risk from quiz content.

---

## 10. Asset Allocation

**Frontend** (`AssetAllocation.jsx`, 440 lines): fully real, no mock data, no dead code. QR-code deep link (`?asset=<id>`) is a genuine working feature (auto-opens the detail drawer), not decorative.

**Backend** (`AssetController.php`, 261 lines): `index`/`dashboard`/`allocate`/`returnAsset`/`transfer` are correctly scoped (with comments documenting a prior PII-leak fix on `index`). **`show`/`update`/`destroy` are not scoped at all** — see critical finding #3. This is the sharpest, most concrete asset-specific security gap in the audit: it was clearly fixed for some actions on this exact controller and not others.

**Database:** `Asset` (soft-deletes) and `AssetAllocation` (no soft-deletes) — all FKs correctly cascade/null-on-delete, no schema-level issues.

---

## 11. Performance Matrix

**Frontend** (`PerformanceMatrix.jsx`, 1582 lines): the core roster/goals/reviews/9-box/bell-curve/skill-matrix data is genuinely wired to the real backend — a real improvement over what a prior audit found here. But a meaningful chunk of the page's surface area is still fabricated — see critical findings' mock/fake section (PIP tab, KPI Templates, Export/Notes/Promotion buttons all fake). `manager_comments` is collected in the review form's state but has no corresponding input field in the modal, and the backend doesn't have a column for it either — a fully dead field on both ends. Roughly half of 49 imported `lucide-react` icons are unused (dead imports); `LineChart`/`Line`/`Cell`/`PieChart`/`Pie` are imported but no line or pie chart is actually rendered.

**Backend** (`PerformanceController.php`, 322 lines): scoping is consistent across every method (`cycleWithinActorScope()` or `applyCompanyScope()` throughout) — no gaps found, unlike Asset/Onboarding/Hiring. `storeReview()` correctly `updateOrCreate`s keyed on `[cycle_id, user_id, reviewer_id, review_type]`, matching the DB unique constraint. No PIP-related backend code exists anywhere (confirmed by repo-wide search) — the PIP tab has nothing behind it at all, by design or omission.

**Database:** `PerformanceCycle`/`PerformanceGoal`/`PerformanceReview` — FKs correct. `performance_cycles` has no index on `company_code` (unlike `assets`/`candidates`), meaning scoped cycle listing does a full-table scan as it grows — not a bug yet, a scaling concern. `PerformanceReview` genuinely has no `manager_comments` column, confirming the frontend field is dead on both sides.

---

## 12. Exit Management

The cleanest of the three (Asset/Performance/Exit) submodules. **Frontend** (`ExitManagement.jsx`, 351 lines): real data end-to-end, no mock/fake UI, `selectableEmployees` correctly mirrors the backend's duplicate-resignation check. Minor: `Mail`/`FileCheck` icons imported but never used — likely leftovers from a planned notify-by-email feature that was never built. Stat cards are computed client-side from the already-loaded (capped at 100) resignation list rather than a dedicated dashboard endpoint — silently under-counts once a company passes 100 resignation records.

**Backend** (`ExitManagementController.php`, 123 lines): every method is correctly scoped, and `updateStatus()` double-checks both the record's own scope and the target employee's scope with an inline comment explaining why the two can theoretically diverge — the most rigorously and clearly documented authorization pattern of the three sibling modules.

**Database:** `EmployeeResignation` — FKs correct, compound index on `[company_code, unit, status]`.

---

## 13. HR Reports

**Frontend** (`HrReports.jsx`, 131 lines): tight, fully wired to the backend, no mock data. Export buttons (Excel/CSV/PDF) are entirely client-side — no server export endpoint exists, despite an `hr.report.export` permission code being seeded for exactly this (dead/decorative permission, see below).

**Backend** (`HrReportController.php`, 196 lines): confirmed, unchanged from a prior audit — `interview`, `asset_allocation`, `performance` report types have zero company scoping while sibling controllers for the same three entities (`InterviewController`, `AssetController`, `PerformanceController`) scope correctly. `hr_kpi` report additionally leaks 4 of its 5 metrics the same way (only the base employee-count line is scoped). This is a real omission, not a limitation — the scoping call is sitting right there in the same class for other methods.

---

## 14. HR Settings

**Frontend** (`HrSettings.jsx`, 876 lines): **~80% of this page is a `localStorage`-only mock with no backend at all.** Only the "Job Boards (Indeed)" tab is real (`rbacApi.getSettings/updateSettings` against `/rbac/settings?group=hr`). "Document Verification Rules" and "Letter Templates" tabs are fully client-state CRUD with hardcoded default data, no API call anywhere in their handlers. "Notifications" and "General Config" sections are tracked in state and included in Save/Export/Import/Reset — but **no tab in the UI renders either one**; the only way to reach them is by hand-editing an exported JSON backup file. `handleSaveAll()` writes everything to `localStorage["hr_settings_config_v1"]` and shows a success toast claiming everything was saved — misleading, since nothing reaches the server for 3 of the 4 feature areas on this page.

**Backend:** no dedicated HR-settings controller exists. The one real endpoint, `SettingsController.php` (`/rbac/settings?group=hr`), is a generic key/value store shared with the RBAC dashboard and app-wide config. Two structural problems: (1) the `settings` table has **no tenant/company column at all** — the Indeed API credentials this page saves are global across every company in the system, not per-tenant; (2) the route is gated by `permission:admin.configuration.read/update`, while the canonical permission registry documents `hr.hr_settings.read` for this exact page — two disjoint permission grants for the same screen.

**Database:** `settings` table — no company_code column (confirmed via migration). No `document_types`/`letter_templates`/`hr_notification_settings` tables exist anywhere — the fake tabs above were never even partially built server-side.

---

## 15. Shared HR Infrastructure & Permission Audit

**`ScopesCompany` trait** (`app/Http/Controllers/Admin/Hr/Concerns/ScopesCompany.php`, 100 lines): `applyCompanyScope()` intersects the requested company codes against the actor's own authorized codes; empty intersection forces `whereRaw('1=0')` rather than silently ignoring scope (fail-closed, good). `hasGlobalCompanyScope()` = role `0`/`1`, or a `company_code` string containing the literal token `all`/`all-companies`. Role-2 actors get an *additional* `unit` filter layered on top. Two methods in this trait — `companyCodeWithinActorScope()` and `defaultCompanyContext()` — have **zero call sites anywhere in `app/`**, confirmed dead despite being exported for use.

**`AuthorizesEmployeeTarget` trait**: `denyUnlessEmployeeInScope()`/`denyUnlessRecordInScope()` both deliberately return **404** (not 403) on denial, specifically so a cross-company probe can't confirm a record's existence — documented, intentional design, used by 14 HR controllers.

**Permission-seeding is split across three separate mechanisms**, not just the obvious seeder: `HrTalentRbacSeeder.php` (40 codes), the legacy `RbacSeeder.php` (department/employee/attendance/shift/profile codes), and **direct-insert migrations** that bypass `database/seeders/` entirely (`2026_08_15_010400_seed_candidate_crm_permissions.php`, `2026_08_14_010400_seed_hr_manager_permissions.php`, and the training-quiz permissions embedded in `2026_08_05_000000_create_training_quizzes_table.php`). A reviewer checking only the obvious seeder would wrongly flag several real, route-wired permission codes as unseeded/dangling — they aren't, they're just seeded somewhere less obvious.

**Genuine discrepancies found by cross-referencing all 79 route-wired `hr.*` codes against every seed source:**
- Seeded but never checked by any route (dead): `hr.candidate.export`, `hr.offer.export`, `hr.asset.export`, `hr.performance.export`, `hr.report.export` (matches the frontend finding that report/CRUD exports are all client-side with no server route to protect).
- Seeded placeholder codes for sections that were never built or wired: `hr.lifecycle.read`, `hr.separation.read`, `hr.org_insights.read`, `hr.hr_settings.read` (the actual settings route uses `admin.configuration.*` instead, per the HR Settings section above).
