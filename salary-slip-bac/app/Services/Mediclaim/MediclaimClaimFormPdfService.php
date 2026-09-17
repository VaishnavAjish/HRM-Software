<?php

namespace App\Services\Mediclaim;

use App\Models\Document;
use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimClaimAssignment;
use App\Models\Mediclaim\MediclaimClaimExpense;
use App\Models\Mediclaim\MediclaimClaimDecision;
use App\Models\Mediclaim\MediclaimDocumentLink;
use App\Models\User;
use App\Services\Mediclaim\Support\GeneratedPdfUploader;
use App\Services\Mediclaim\Support\IndianCurrencyFormatter;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Renders the Section A-K final claim-form PDF — mirroring the actual
 * `EMPLOYEE MEDICAL CLAIM.pdf` form's layout — once a claim reaches a
 * terminal director decision, and attaches it exactly like any other
 * Mediclaim document: DocumentService::upload() + a MediclaimDocumentLink
 * row (`linkable_type` => MediclaimClaim::class), with
 * `MediclaimClaim.final_form_document_id` set to the result.
 *
 * Kept as its own class rather than a `generateFinalFormPdf()` method bolted
 * onto `ClaimWorkflowService` (the plan explicitly leaves this choice open)
 * — PDF layout/formatting is a different concern from workflow-transition
 * locking, and folding several judgment calls' worth of view-data assembly
 * into an already-large state-machine class would make that class harder to
 * scan. All formatting/display-string decisions are made HERE, not in the
 * Blade view, so `resources/views/mediclaim/claim-form.blade.php` stays a
 * dumb template — same discipline `MediclaimCardService::renderAndAttachCardPdf()`
 * follows for the card PDF, and the same shape `App\Support\ConfidentialPdf`
 * (an existing dependency-free PDF writer elsewhere in this codebase) uses
 * for its `sections: [{heading, fields: [[label, value], ...]}]` spec.
 *
 * Deliberately does NOT open its own DB::transaction() / lockForUpdate() the
 * way ClaimWorkflowService's methods do: it is only ever invoked from
 * `ClaimWorkflowService::directorFinalApproval()`'s `DB::afterCommit()` hook
 * — i.e. strictly AFTER that claim's terminal transition has already
 * committed — and the caller wraps this call in a best-effort try/catch so a
 * failure here can never appear to threaten, or actually roll back, that
 * transition. See directorFinalApproval()'s docblock for the full reasoning.
 *
 * dompdf (barryvdh/laravel-dompdf) is NOT installed in this environment as of
 * B6 (see MediclaimCardService's class docblock for the full story) —
 * `Pdf::loadView(...)` below is written against its real, documented facade
 * API and will resolve once the dependency lands; until then this throws a
 * "class not found" error, which is expected and, per the caller's
 * best-effort guard, non-fatal to the director decision that triggered it.
 */
class MediclaimClaimFormPdfService
{
    /**
     * Section G's declaration — English only, verbatim from the same source
     * text `salary-slip-front/.../features/mediclaim/models/declarationText.js`
     * (F1) renders in the app UI. Per the plan's explicit instruction, the
     * Hindi/Gujarati statements are NOT reproduced here: dompdf's default
     * font support for Devanagari/Gujarati glyphs is unreliable without
     * extra font configuration this phase is not scoped to solve, so those
     * languages stay in the app UI/rule-book only. Bump alongside
     * DECLARATION_VERSION on the frontend if this wording ever changes —
     * kept as a literal copy rather than a shared source-of-truth file
     * because the two codebases don't share a build step that could import
     * one from the other.
     */
    private const DECLARATION_STATEMENTS_EN = [
        'I hereby declare that the information furnished above is true and correct to the best of my knowledge.',
        'I understand that false or misleading information may result in rejection of the claim.',
    ];

    public function generate(MediclaimClaim $claim, User $actor): Document
    {
        $claim->loadMissing([
            'employee', 'member', 'hospital',
            'expenses', 'documentLinks.document.currentVersionRecord',
            'decisions.decidedBy',
        ]);

        $decisionsByStage = $claim->decisions
            ->sortBy('id')
            ->groupBy('stage')
            // A returned/resubmitted claim can carry more than one decision
            // per stage across cycles (e.g. RETURNED then later VERIFIED) —
            // the form reports the latest (current-cycle) decision for each.
            ->map(fn (Collection $rows) => $rows->last());

        $pdfBytes = Pdf::loadView('mediclaim.claim-form', [
            'claim' => $claim,
            'sections' => $this->buildSections($claim),
            'expenseRows' => $this->buildExpenseRows($claim),
            'documentRows' => $this->buildDocumentRows($claim),
            'declarationStatements' => self::DECLARATION_STATEMENTS_EN,
            'declarationFields' => $this->buildDeclarationFields($claim),
            'decisionBlocks' => $this->buildDecisionBlocks($decisionsByStage),
        ])->setPaper('a4', 'portrait')->output();

        $owner = $claim->employee ?: $actor;

        $version = GeneratedPdfUploader::upload(
            $pdfBytes,
            sprintf('mediclaim-claim-form-%s.pdf', $claim->claim_number ?: $claim->id),
            $owner,
            'MEDICLAIM_CLAIM_FORM',
            $actor->id,
            // Scoped per CLAIM: a resubmission of the SAME claim correctly
            // versions the same final-form Document if regenerated, while a
            // DIFFERENT claim for the same employee — same
            // MEDICLAIM_CLAIM_FORM type — gets its own Document instead of
            // silently becoming a new version of the first claim's form (see
            // DocumentService's reserveVersion()/upload() docblocks).
            sprintf('mediclaim_claim_form:%d', $claim->id)
        );

        MediclaimDocumentLink::create([
            'document_id' => $version->document_id,
            'linkable_type' => MediclaimClaim::class,
            'linkable_id' => $claim->id,
            'document_role' => 'MEDICLAIM_CLAIM_FORM',
            'created_by' => $actor->id,
        ]);

        $document = $version->document()->firstOrFail();

        $claim->final_form_document_id = $document->id;
        $claim->save();

        return $document;
    }

    /** @return list<array{heading: string, fields: list<array{0: string, 1: ?string}>}> */
    private function buildSections(MediclaimClaim $claim): array
    {
        $employee = $claim->employee;
        $member = $claim->member;

        return [
            [
                // Section A — the claim doesn't reliably carry a populated
                // `employee_snapshot` JSON as of this phase (no code path in
                // ClaimWorkflowService::submit() writes it yet, despite the
                // column existing since B1), so the CURRENT employee record
                // is used instead of a frozen snapshot. Flagged as a known
                // limitation: if a later phase starts populating
                // `employee_snapshot`, this should prefer it over the live
                // relation the same way `patient_snapshot` should for
                // Section B below.
                'heading' => 'Section A - Employee Details',
                'fields' => [
                    ['Employee Name', $employee?->name],
                    ['Employee Code', $employee?->emp_code],
                    ['Designation', $employee?->designation],
                    ['Company', $employee?->company_code],
                    ['Email', $employee?->email],
                ],
            ],
            [
                'heading' => 'Section B - Patient (Covered Member) Details',
                'fields' => [
                    ['Member Name', $member?->full_name],
                    ['Relationship to Employee', $member ? ucfirst((string) $member->relationship_type) : null],
                    ['Date of Birth', $this->formatDate($member?->date_of_birth)],
                    ['Gender', $member?->gender],
                ],
            ],
            [
                'heading' => 'Section C - Nature of Illness / Medical History',
                'fields' => [
                    ['Nature of Illness', $claim->nature_of_illness],
                    ['Date of First Symptom', $this->formatDate($claim->first_symptom_date)],
                    ['Initial Symptoms', $this->formatList($claim->initial_symptoms)],
                    ['Date of First Consultation', $this->formatDate($claim->first_consultation_date)],
                    ['Treating Doctor', $claim->treating_doctor_name],
                    ['Medico-Legal Case', $this->yesNo($claim->is_medico_legal_case)],
                    ['Reported to Police', $claim->is_medico_legal_case ? $this->yesNo($claim->reported_to_police) : 'N/A'],
                    ['Police Station Details', $claim->is_medico_legal_case ? ($claim->police_station_details ?: 'Not provided') : 'N/A'],
                ],
            ],
            [
                'heading' => 'Section D - Treatment Details',
                'fields' => [
                    ['Treatment Type', $this->treatmentTypeLabel($claim->treatment_type)],
                    ['Network Hospital', $this->yesNo($claim->is_network_hospital)],
                    ['Hospital', $this->hospitalDisplay($claim)],
                    ['Admission Date/Time', $this->formatDateTime($claim->admission_at)],
                    ['Discharge Date/Time', $this->formatDateTime($claim->discharge_at)],
                    ['Treatment Ongoing', $this->yesNo($claim->is_ongoing_treatment)],
                    ['Treatment Description', $claim->treatment_description],
                ],
            ],
        ];
    }

    /** @return list<array{category: string, description: ?string, claimed: string, approved: string, disallowed: string, reason: ?string, date: ?string}> */
    private function buildExpenseRows(MediclaimClaim $claim): array
    {
        return $claim->expenses->map(fn ($expense) => [
            'category' => MediclaimClaimExpense::CATEGORY_LABELS[$expense->category] ?? ucfirst((string) $expense->category),
            'description' => $expense->description,
            'claimed' => IndianCurrencyFormatter::format($expense->claimed_amount),
            'approved' => IndianCurrencyFormatter::format($expense->approved_amount),
            'disallowed' => IndianCurrencyFormatter::format($expense->disallowed_amount),
            'reason' => $expense->disallowed_reason,
            'date' => $this->formatDate($expense->expense_date),
        ])->values()->all();
    }

    /** @return list<array{label: string, status: ?string, version: ?int, uploadedAt: ?string}> */
    private function buildDocumentRows(MediclaimClaim $claim): array
    {
        return $claim->documentLinks->map(function ($link) {
            $document = $link->document;
            $current = $document?->currentVersionRecord;

            return [
                'label' => $document?->document_label ?: $link->document_role,
                'status' => $document?->status,
                'version' => $document?->current_version,
                'uploadedAt' => $current ? $this->formatDateTime($current->uploaded_at) : null,
            ];
        })->values()->all();
    }

    /** @return list<array{0: string, 1: ?string}> */
    private function buildDeclarationFields(MediclaimClaim $claim): array
    {
        return [
            ['Declaration Accepted', $this->yesNo($claim->declaration_accepted)],
            ['Declaration Version', $claim->declaration_version],
            ['Accepted At', $this->formatDateTime($claim->declaration_accepted_at)],
            ['Accepted From IP', $claim->declaration_ip],
        ];
    }

    /**
     * @param  Collection<string, MediclaimClaimDecision>  $decisionsByStage
     * @return list<array{heading: string, decision: ?string, remarks: ?string, decidedBy: ?string, decidedAt: ?string, extra: list<array{0:string,1:string}>}>
     */
    private function buildDecisionBlocks(Collection $decisionsByStage): array
    {
        $stages = [
            MediclaimClaimAssignment::STAGE_MANAGER_REVIEW => 'Manager Review (Endorsement)',
            MediclaimClaimAssignment::STAGE_COORDINATOR_VERIFICATION => 'Section H - Coordinator Verification',
            MediclaimClaimAssignment::STAGE_COMMITTEE_RECOMMENDATION => 'Section I - Committee Recommendation',
            MediclaimClaimAssignment::STAGE_HR_ELIGIBILITY_VERIFICATION => 'Section J - HR Eligibility Verification',
            MediclaimClaimAssignment::STAGE_DIRECTOR_FINAL_APPROVAL => 'Section K - Director Final Approval',
        ];

        $blocks = [];

        foreach ($stages as $stage => $heading) {
            /** @var MediclaimClaimDecision|null $decision */
            $decision = $decisionsByStage->get($stage);

            $blocks[] = [
                'heading' => $heading,
                'decision' => $decision ? $this->decisionLabel($decision->decision) : null,
                'remarks' => $decision?->remarks,
                'decidedBy' => $decision?->decidedBy?->name,
                'decidedAt' => $decision ? $this->formatDateTime($decision->decided_at) : null,
                'extra' => $decision ? $this->extraFieldsFor($stage, (array) $decision->fields) : [],
            ];
        }

        return $blocks;
    }

    /** @param array<string, mixed> $fields
     * @return list<array{0:string,1:string}> */
    private function extraFieldsFor(string $stage, array $fields): array
    {
        return match ($stage) {
            MediclaimClaimAssignment::STAGE_COORDINATOR_VERIFICATION => array_values(array_filter([
                isset($fields['verified_claim_and_documents'])
                    ? ['Claim & Documents Verified', $this->yesNo((bool) $fields['verified_claim_and_documents'])]
                    : null,
            ])),
            MediclaimClaimAssignment::STAGE_HR_ELIGIBILITY_VERIFICATION => array_values(array_filter([
                isset($fields['eligibility_verified'])
                    ? ['Eligibility Verified', $this->yesNo((bool) $fields['eligibility_verified'])]
                    : null,
                isset($fields['policy_applicability_verified'])
                    ? ['Policy Applicability Verified', $this->yesNo((bool) $fields['policy_applicability_verified'])]
                    : null,
            ])),
            MediclaimClaimAssignment::STAGE_DIRECTOR_FINAL_APPROVAL => array_values(array_filter([
                array_key_exists('approved_amount', $fields)
                    ? ['Approved Amount', IndianCurrencyFormatter::format($fields['approved_amount'])]
                    : null,
            ])),
            default => [],
        };
    }

    private function decisionLabel(?string $decision): ?string
    {
        if ($decision === null) {
            return null;
        }

        return ucwords(str_replace('_', ' ', $decision));
    }

    private function treatmentTypeLabel(?string $type): ?string
    {
        return match ($type) {
            MediclaimClaim::TREATMENT_OPD => 'OPD (Out-Patient)',
            MediclaimClaim::TREATMENT_HOSPITALIZATION => 'Hospitalization',
            MediclaimClaim::TREATMENT_SURGERY => 'Surgery',
            MediclaimClaim::TREATMENT_EMERGENCY => 'Emergency',
            MediclaimClaim::TREATMENT_TESTS_ONLY => 'Tests Only',
            default => $type,
        };
    }

    private function hospitalDisplay(MediclaimClaim $claim): ?string
    {
        if ($claim->hospital) {
            return $claim->hospital->city
                ? "{$claim->hospital->name}, {$claim->hospital->city}"
                : $claim->hospital->name;
        }

        if ($claim->non_network_hospital_name) {
            $reason = $claim->non_network_reason ? " (reason: {$claim->non_network_reason})" : '';

            return "{$claim->non_network_hospital_name} - non-network{$reason}";
        }

        return null;
    }

    private function formatList(mixed $value): ?string
    {
        if (! is_array($value) || $value === []) {
            return null;
        }

        return implode(', ', array_map(
            fn ($item) => is_string($item) ? ucfirst(str_replace('_', ' ', $item)) : (string) $item,
            $value
        ));
    }

    private function yesNo(?bool $value): string
    {
        return $value === null ? 'N/A' : ($value ? 'Yes' : 'No');
    }

    private function formatDate(mixed $value): ?string
    {
        return $value ? Carbon::parse($value)->format('d-M-Y') : null;
    }

    private function formatDateTime(mixed $value): ?string
    {
        return $value ? Carbon::parse($value)->format('d-M-Y H:i') : null;
    }
}
