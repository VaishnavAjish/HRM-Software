<?php

use App\Http\Controllers\Api\V1\Mediclaim\Admin\AuditController as AdminAuditController;
use App\Http\Controllers\Api\V1\Mediclaim\Admin\ClaimController as AdminClaimController;
use App\Http\Controllers\Api\V1\Mediclaim\Admin\EmployeeController as AdminEmployeeController;
use App\Http\Controllers\Api\V1\Mediclaim\Admin\EnrollmentController as AdminEnrollmentController;
use App\Http\Controllers\Api\V1\Mediclaim\Admin\HospitalController as AdminHospitalController;
use App\Http\Controllers\Api\V1\Mediclaim\Admin\DocumentRequirementController as AdminDocumentRequirementController;
use App\Http\Controllers\Api\V1\Mediclaim\Admin\HospitalContactController as AdminHospitalContactController;
use App\Http\Controllers\Api\V1\Mediclaim\Admin\IntimationController as AdminIntimationController;
use App\Http\Controllers\Api\V1\Mediclaim\Admin\MemberChangeRequestController as AdminMemberChangeRequestController;
use App\Http\Controllers\Api\V1\Mediclaim\Admin\PolicyController as AdminPolicyController;
use App\Http\Controllers\Api\V1\Mediclaim\Admin\ReportController as AdminReportController;
use App\Http\Controllers\Api\V1\Mediclaim\Admin\ReviewerAssignmentController as AdminReviewerAssignmentController;
use App\Http\Controllers\Api\V1\Mediclaim\Admin\RuleBookController as AdminRuleBookController;
use App\Http\Controllers\Api\V1\Mediclaim\Admin\RuleBookLanguageController as AdminRuleBookLanguageController;
use App\Http\Controllers\Api\V1\Mediclaim\Admin\SettlementController as AdminSettlementController;
use App\Http\Controllers\Api\V1\Mediclaim\CardVerificationController;
use App\Http\Controllers\Api\V1\Mediclaim\ClaimController;
use App\Http\Controllers\Api\V1\Mediclaim\ClaimDocumentController;
use App\Http\Controllers\Api\V1\Mediclaim\ClaimReviewController;
use App\Http\Controllers\Api\V1\Mediclaim\IntimationController;
use App\Http\Controllers\Api\V1\Mediclaim\MemberChangeRequestController;
use App\Http\Controllers\Api\V1\Mediclaim\MyCardController;
use App\Http\Controllers\Api\V1\Mediclaim\MyClaimController;
use App\Http\Controllers\Api\V1\Mediclaim\MyCoverageController;
use App\Http\Controllers\Api\V1\Mediclaim\MyMembersController;
use App\Http\Controllers\Api\V1\Mediclaim\ReviewQueueController;
use App\Http\Controllers\Api\V1\Mediclaim\TeamClaimController;
use Illuminate\Support\Facades\Route;

/*
 * Mediclaim module — every route lives in this file (B4's "route isolation"
 * requirement). routes/api.php's only edit is the single appended
 * `require __DIR__.'/mediclaim.php';` line — that file currently carries
 * unrelated uncommitted local changes and must not be touched further.
 *
 * Permission codes below are the granular `mediclaim.*`/`self.mediclaim.*`
 * business codes from the plan's reconciliation #6 authoritative list (never
 * `ui.admin.mediclaim.view` — that legacy page-level gate is a B5 frontend
 * registry/nav concern, not an API concern, per reconciliation #1's fix).
 * The underlying `permissions` rows are NOT seeded yet (that's B5) — the
 * `permission:` middleware itself falls back to shadow/legacy behavior via
 * `RequirePermission::schemaReady()`/`AUTHORIZATION_SCHEMA_NOT_READY`
 * exactly as it does for every other not-yet-live business code in this
 * codebase, so referencing these strings now is safe and expected.
 *
 * Two permission codes below — `mediclaim.member_change_request.read` and
 * `mediclaim.member_change_request.decide` — are NOT in the plan's
 * reconciliation #6 list (which only names the self-service
 * `self.mediclaim.member_change_request.create/.read` pair). The HR-side
 * `Mediclaim\Admin\MemberChangeRequestController@index,decide` controller IS
 * explicitly required by this phase's task, but the plan's endpoint table
 * gives it no route/permission of its own — these two codes are added here,
 * following the codebase's exact `mediclaim.<resource>.<verb>` convention, so
 * that controller is actually reachable. Flagged in the B4 handoff report;
 * B5 will need to seed these two alongside the rest.
 */

Route::get('v1/mediclaim/cards/verify/{token}', [CardVerificationController::class, 'show'])
    ->middleware('throttle:20,1');

Route::middleware('jwt.auth')->prefix('v1/mediclaim')->middleware(['module.schema:mediclaim', 'mediclaim.normalize_case'])->group(function () {
    /* ------------------------------------------------------------ Self-service */

    Route::get('me/coverage', [MyCoverageController::class, 'show'])
        ->middleware('permission:self.mediclaim.coverage.read');
    Route::post('me/rule-book-acknowledge', [MyCoverageController::class, 'acknowledgeRuleBook'])
        ->middleware(['throttle:20,1', 'permission:self.mediclaim.onboarding.update']);
    Route::post('me/onboarding-complete', [MyCoverageController::class, 'completeOnboarding'])
        ->middleware(['throttle:20,1', 'permission:self.mediclaim.onboarding.update']);

    Route::get('me/members', [MyMembersController::class, 'index'])
        ->middleware('permission:self.mediclaim.member.read');

    Route::get('me/member-change-requests', [MemberChangeRequestController::class, 'index'])
        ->middleware('permission:self.mediclaim.member_change_request.read');
    Route::post('me/member-change-requests', [MemberChangeRequestController::class, 'store'])
        ->middleware(['throttle:20,1', 'permission:self.mediclaim.member_change_request.create']);

    Route::get('me/cards', [MyCardController::class, 'index'])
        ->middleware('permission:self.mediclaim.card.read');

    Route::get('me/intimations', [IntimationController::class, 'index'])
        ->middleware('permission:self.mediclaim.intimation.read');
    Route::post('me/intimations', [IntimationController::class, 'store'])
        ->middleware(['throttle:20,1', 'permission:self.mediclaim.intimation.create']);

    Route::get('me/claims', [MyClaimController::class, 'index'])
        ->middleware('permission:self.mediclaim.claim.read');
    Route::post('me/claims', [MyClaimController::class, 'store'])
        ->middleware(['throttle:30,1', 'permission:self.mediclaim.claim.create']);

    /* --------------------------------------------------------- Manager (team) */

    Route::get('team/claims', [TeamClaimController::class, 'index'])
        ->middleware('permission:mediclaim.team_claim.read');
    Route::get('team/pending-approvals', [TeamClaimController::class, 'pending'])
        ->middleware('permission:mediclaim.claim.manager.decide');

    /* --------------------------------------------------- Admin claim list (#3) */

    Route::get('claims', [AdminClaimController::class, 'index'])
        ->middleware('permission:mediclaim.claim.read');

    Route::delete('claims/{claim}', [AdminClaimController::class, 'destroy'])
        ->whereNumber('claim')
        ->middleware('permission:mediclaim.claim.delete');

    /* --------------------------------------- Shared claim detail/workflow */

    // Read is intentionally broad-OR'd across every legitimate reader of a
    // single claim: the owning employee, staff with the company-scoped
    // read code, and every per-stage reviewer/manager .decide holder (a
    // reviewer necessarily needs to read a claim before deciding it — see
    // MediclaimClaim::scopeVisibleTo()'s docblock for why the plan's
    // literal "self.mediclaim.claim.read" shorthand alone would otherwise
    // leave a coordinator/committee/HR/director/manager unable to open the
    // very claim their review queue points them at). MediclaimClaim::visibleTo()
    // still does the actual per-row 404-concealment underneath this.
    Route::get('claims/{claim}', [ClaimController::class, 'show'])
        ->whereNumber('claim')
        ->middleware('permission:self.mediclaim.claim.read,mediclaim.claim.read,mediclaim.claim.approve,mediclaim.claim.manager.decide,mediclaim.claim.coordinator.decide,mediclaim.claim.committee.decide,mediclaim.claim.hr_verification.decide,mediclaim.claim.director.decide,mediclaim.audit.read');

    Route::put('claims/{claim}', [ClaimController::class, 'update'])
        ->whereNumber('claim')
        ->middleware('permission:self.mediclaim.claim.update');

    Route::post('claims/{claim}/submit', [ClaimController::class, 'submit'])
        ->whereNumber('claim')
        ->middleware(['throttle:30,1', 'permission:self.mediclaim.claim.submit']);

    Route::post('claims/{claim}/withdraw', [ClaimController::class, 'withdraw'])
        ->whereNumber('claim')
        ->middleware('permission:self.mediclaim.claim.withdraw');

    // Not in the plan's literal B4 endpoint table — see ClaimController::
    // discharge()'s / ClaimWorkflowService::recordDischarge()'s docblocks:
    // without this route a claim submitted while still hospitalized has no
    // way to ever get a correct `documents_due_at`. Reuses the existing
    // self-update permission rather than minting a new one.
    Route::post('claims/{claim}/discharge', [ClaimController::class, 'discharge'])
        ->whereNumber('claim')
        ->middleware('permission:self.mediclaim.claim.update');

    // Simplified workflow's ongoing-treatment follow-up — see
    // ClaimController::finalizeTreatment()'s / ClaimWorkflowService::
    // finalizeTreatment()'s docblocks: records the real discharge date AND
    // appends the final expense line items in one call, once the actual
    // bill is known. Reuses the existing self-update permission, same as
    // the plain `discharge` route above.
    Route::post('claims/{claim}/finalize-treatment', [ClaimController::class, 'finalizeTreatment'])
        ->whereNumber('claim')
        ->middleware('permission:self.mediclaim.claim.update');

    // Not in the plan's literal B4 endpoint table — see ClaimController::
    // confidentialityAck()'s docblock: without this route managerDecision()'s
    // CONFIDENTIALITY_ACK_REQUIRED gate could never be satisfied.
    Route::post('claims/{claim}/confidentiality-ack', [ClaimController::class, 'confidentialityAck'])
        ->whereNumber('claim')
        ->middleware('permission:mediclaim.claim.manager.decide');

    Route::post('claims/{claim}/return', [ClaimReviewController::class, 'return'])
        ->whereNumber('claim')
        ->middleware('permission:mediclaim.claim.manager.decide,mediclaim.claim.coordinator.decide,mediclaim.claim.committee.decide,mediclaim.claim.hr_verification.decide,mediclaim.claim.director.decide');

    Route::get('claims/{claim}/documents', [ClaimDocumentController::class, 'index'])
        ->whereNumber('claim')
        ->middleware('permission:self.mediclaim.document.download,mediclaim.claim_document.download');
    Route::post('claims/{claim}/documents', [ClaimDocumentController::class, 'store'])
        ->whereNumber('claim')
        ->middleware(['throttle:30,1', 'permission:self.mediclaim.document.upload,mediclaim.claim_document.upload']);

    Route::get('claims/{claim}/timeline', [ClaimController::class, 'timeline'])
        ->whereNumber('claim')
        ->middleware('permission:self.mediclaim.claim.read,mediclaim.audit.read');
    Route::get('claims/{claim}/decisions', [ClaimController::class, 'decisions'])
        ->whereNumber('claim')
        ->middleware('permission:self.mediclaim.claim.read,mediclaim.audit.read');

    /* ------------------------------------------------------------- Reviews */

    // Both routes below must accept every stage code the shared pending
    // queue/decide machinery actually dispatches to (ReviewQueueController::
    // STAGE_METHODS / PendingReviewsTab.jsx's STAGE_PANEL) — this previously
    // omitted `mediclaim.claim.manager.decide` and `mediclaim.settlement.create`,
    // so a reviewer holding only one of those two codes would 403 before
    // ever reaching the controller, even though the manager/settlement
    // panels were already wired to call them.
    Route::get('reviews/pending', [ReviewQueueController::class, 'index'])
        ->middleware('permission:mediclaim.claim.approve,mediclaim.claim.manager.decide,mediclaim.claim.coordinator.decide,mediclaim.claim.committee.decide,mediclaim.claim.hr_verification.decide,mediclaim.claim.director.decide,mediclaim.settlement.create');

    Route::post('reviews/{claim}/decision', [ReviewQueueController::class, 'decide'])
        ->whereNumber('claim')
        ->middleware(['throttle:30,1', 'permission:mediclaim.claim.approve,mediclaim.claim.manager.decide,mediclaim.claim.coordinator.decide,mediclaim.claim.committee.decide,mediclaim.claim.hr_verification.decide,mediclaim.claim.director.decide,mediclaim.settlement.create']);

    /* ------------------------------------------------------------ Admin/HR */

    // Admin/HR-visible list of every employee's office intimations, company-
    // scoped — the natural admin counterpart to self-service `me/intimations`
    // (see Admin\IntimationController's own docblock for why this was
    // missing entirely until now).
    Route::get('intimations', [AdminIntimationController::class, 'index'])
        ->middleware('permission:mediclaim.intimation.read');
    Route::post('intimations/{intimation}/close', [AdminIntimationController::class, 'close'])
        ->whereNumber('intimation')
        ->middleware(['throttle:30,1', 'permission:mediclaim.intimation.close']);

    Route::get('member-change-requests', [AdminMemberChangeRequestController::class, 'index'])
        ->middleware('permission:mediclaim.member_change_request.read');
    Route::post('member-change-requests/{changeRequest}/decision', [AdminMemberChangeRequestController::class, 'decide'])
        ->whereNumber('changeRequest')
        ->middleware(['throttle:30,1', 'permission:mediclaim.member_change_request.decide']);

    Route::get('policies', [AdminPolicyController::class, 'index'])
        ->middleware('permission:mediclaim.policy.read');
    Route::post('policies', [AdminPolicyController::class, 'store'])
        ->middleware(['throttle:20,1', 'permission:mediclaim.policy.create']);
    Route::put('policies/{policy}', [AdminPolicyController::class, 'update'])
        ->whereNumber('policy')
        ->middleware('permission:mediclaim.policy.update');
    Route::post('policies/{policy}/versions', [AdminPolicyController::class, 'storeVersion'])
        ->whereNumber('policy')
        ->middleware(['throttle:20,1', 'permission:mediclaim.policy.create']);
    Route::post('policies/{policy}/versions/{version}/publish', [AdminPolicyController::class, 'publishVersion'])
        ->whereNumber('policy')->whereNumber('version')
        ->middleware('permission:mediclaim.policy.publish');

    // Company-wide employee Mediclaim status (all active employees, not just
    // the ones with an existing enrollment row — see EmployeeController's
    // docblock). Reuses the enrollment read permission: this is the "who's
    // enrolled/eligible" screen, same audience as the raw enrollments list.
    Route::get('admin/employees', [AdminEmployeeController::class, 'index'])
        ->middleware('permission:mediclaim.enrollment.read');
    // Provisions every eligible employee's coverage + own card in one pass
    // — "give the ₹3,00,000 floater to everyone" without waiting for each
    // employee to individually open the module.
    Route::post('admin/employees/bulk-issue-cards', [AdminEmployeeController::class, 'bulkIssue'])
        ->middleware(['throttle:5,1', 'permission:mediclaim.enrollment.create']);
    Route::get('admin/employees/{employee}', [AdminEmployeeController::class, 'show'])
        ->whereNumber('employee')
        ->middleware('permission:mediclaim.enrollment.read');

    Route::get('enrollments', [AdminEnrollmentController::class, 'index'])
        ->middleware('permission:mediclaim.enrollment.read');
    Route::post('enrollments', [AdminEnrollmentController::class, 'store'])
        ->middleware(['throttle:30,1', 'permission:mediclaim.enrollment.create']);
    Route::put('enrollments/{enrollment}', [AdminEnrollmentController::class, 'update'])
        ->whereNumber('enrollment')
        ->middleware('permission:mediclaim.enrollment.update');

    Route::get('hospitals', [AdminHospitalController::class, 'index'])
        ->middleware('permission:mediclaim.hospital.read');
    Route::post('hospitals', [AdminHospitalController::class, 'store'])
        ->middleware(['throttle:20,1', 'permission:mediclaim.hospital.create']);
    Route::put('hospitals/{hospital}', [AdminHospitalController::class, 'update'])
        ->whereNumber('hospital')
        ->middleware('permission:mediclaim.hospital.update');
    Route::delete('hospitals/{hospital}', [AdminHospitalController::class, 'destroy'])
        ->whereNumber('hospital')
        ->middleware('permission:mediclaim.hospital.delete');

    // POST (not PUT) for update too, so an optional photo replacement can
    // ride along as a normal multipart request — see HospitalContactController's
    // own docblock.
    Route::post('hospitals/{hospital}/contacts', [AdminHospitalContactController::class, 'store'])
        ->whereNumber('hospital')
        ->middleware(['throttle:20,1', 'permission:mediclaim.hospital.update']);
    Route::post('hospitals/{hospital}/contacts/{contact}', [AdminHospitalContactController::class, 'update'])
        ->whereNumber(['hospital', 'contact'])
        ->middleware(['throttle:20,1', 'permission:mediclaim.hospital.update']);
    Route::delete('hospitals/{hospital}/contacts/{contact}', [AdminHospitalContactController::class, 'destroy'])
        ->whereNumber(['hospital', 'contact'])
        ->middleware('permission:mediclaim.hospital.delete');

    // Employee-facing document checklist (`DocumentChecklist.jsx`) and this
    // admin settings screen share `.read` — see the controller's own
    // docblock for why that's intentional, not an oversight.
    //
    // Also accepts `self.mediclaim.document.upload`/`self.mediclaim.claim.read`
    // — every employee who can even open a claim already has one of those
    // two (they're what let the employee submit a claim and upload its
    // documents at all), whereas `mediclaim.document_requirement.read` is a
    // separate, easy-to-forget business-side grant that was never actually
    // given to the plain Employee role. Without this OR-fallback, every
    // regular employee's own `GET /document-requirements` call 403s and
    // `DocumentChecklist` silently renders as if HR had configured nothing
    // — indistinguishable from "no option to upload documents", even
    // though the exact same data is visibly populated for a super admin
    // (who bypasses permission checks entirely). Nothing here needed a
    // business-side grant that only admin tooling could hand out; a plain
    // employee reading a label/required-flag list is not a sensitive
    // action, so this is fixed at the route, not by asking someone to grant
    // a permission that will just as easily be missed for the next
    // employee role too.
    Route::get('document-requirements', [AdminDocumentRequirementController::class, 'index'])
        ->middleware('permission:mediclaim.document_requirement.read,self.mediclaim.document.upload,self.mediclaim.claim.read');
    Route::post('document-requirements', [AdminDocumentRequirementController::class, 'store'])
        ->middleware(['throttle:20,1', 'permission:mediclaim.document_requirement.create']);
    Route::put('document-requirements/{requirement}', [AdminDocumentRequirementController::class, 'update'])
        ->whereNumber('requirement')
        ->middleware(['throttle:30,1', 'permission:mediclaim.document_requirement.update']);
    Route::delete('document-requirements/{requirement}', [AdminDocumentRequirementController::class, 'destroy'])
        ->whereNumber('requirement')
        ->middleware(['throttle:20,1', 'permission:mediclaim.document_requirement.delete']);

    Route::get('rule-book-languages', [AdminRuleBookLanguageController::class, 'index'])
        ->middleware('permission:mediclaim.rule_book.read');
    Route::post('rule-book-languages', [AdminRuleBookLanguageController::class, 'store'])
        ->middleware(['throttle:20,1', 'permission:mediclaim.rule_book.create']);
    Route::put('rule-book-languages/{language}', [AdminRuleBookLanguageController::class, 'update'])
        ->whereNumber('language')
        ->middleware(['throttle:30,1', 'permission:mediclaim.rule_book.update']);
    Route::delete('rule-book-languages/{language}', [AdminRuleBookLanguageController::class, 'destroy'])
        ->whereNumber('language')
        ->middleware(['throttle:20,1', 'permission:mediclaim.rule_book.delete']);

    Route::get('rule-books', [AdminRuleBookController::class, 'index'])
        ->middleware('permission:mediclaim.rule_book.read');
    Route::post('rule-books', [AdminRuleBookController::class, 'store'])
        ->middleware(['throttle:20,1', 'permission:mediclaim.rule_book.create']);
    Route::put('rule-books/{ruleBook}', [AdminRuleBookController::class, 'update'])
        ->whereNumber('ruleBook')
        ->middleware(['throttle:30,1', 'permission:mediclaim.rule_book.update']);
    Route::post('rule-books/{ruleBook}/publish', [AdminRuleBookController::class, 'publish'])
        ->whereNumber('ruleBook')
        ->middleware('permission:mediclaim.rule_book.publish');
    Route::post('rule-books/{ruleBook}/items', [AdminRuleBookController::class, 'addItem'])
        ->whereNumber('ruleBook')
        ->middleware(['throttle:60,1', 'permission:mediclaim.rule_book.update']);
    Route::put('rule-books/{ruleBook}/items/{item}', [AdminRuleBookController::class, 'updateItem'])
        ->whereNumber('ruleBook')->whereNumber('item')
        ->middleware(['throttle:60,1', 'permission:mediclaim.rule_book.update']);
    Route::delete('rule-books/{ruleBook}/items/{item}', [AdminRuleBookController::class, 'deleteItem'])
        ->whereNumber('ruleBook')->whereNumber('item')
        ->middleware(['throttle:60,1', 'permission:mediclaim.rule_book.update']);
    Route::put('rule-books/{ruleBook}/items-reorder', [AdminRuleBookController::class, 'reorderItems'])
        ->whereNumber('ruleBook')
        ->middleware(['throttle:30,1', 'permission:mediclaim.rule_book.update']);

    Route::get('reviewer-assignments', [AdminReviewerAssignmentController::class, 'index'])
        ->middleware('permission:mediclaim.reviewer_assignment.read');
    Route::post('reviewer-assignments', [AdminReviewerAssignmentController::class, 'store'])
        ->middleware(['throttle:30,1', 'permission:mediclaim.reviewer_assignment.assign']);
    Route::put('reviewer-assignments/{assignment}', [AdminReviewerAssignmentController::class, 'update'])
        ->whereNumber('assignment')
        ->middleware('permission:mediclaim.reviewer_assignment.assign');

    Route::get('settlements', [AdminSettlementController::class, 'index'])
        ->middleware('permission:mediclaim.settlement.read');
    Route::post('settlements', [AdminSettlementController::class, 'store'])
        ->middleware(['throttle:20,1', 'permission:mediclaim.settlement.create']);

    Route::get('reports', [AdminReportController::class, 'index'])
        ->middleware('permission:mediclaim.report.read');

    // Two separate `permission:` middleware entries (rather than one
    // comma-list, which the RequirePermission middleware treats as
    // any-of/OR — see routes/mediclaim.php's other comma-separated
    // examples) so BOTH .read and .export are required, matching the
    // plan's B8 wording ("export adds .export"). `?includeSensitive=1`
    // additionally requires `.reveal`, checked in-controller since it's a
    // conditional per-request elevation rather than a blanket route gate.
    Route::get('reports/export', [AdminReportController::class, 'export'])
        ->middleware(['throttle:10,1', 'permission:mediclaim.report.read', 'permission:mediclaim.report.export']);

    Route::get('audit', [AdminAuditController::class, 'index'])
        ->middleware('permission:mediclaim.audit.read');
});
