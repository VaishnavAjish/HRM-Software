<?php

namespace App\Services\Mediclaim;

use App\Models\Company;
use App\Models\Document;
use App\Models\Mediclaim\MediclaimCard;
use App\Models\Mediclaim\MediclaimDocumentLink;
use App\Models\Mediclaim\MediclaimHospitalContact;
use App\Models\Mediclaim\MediclaimMember;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use App\Models\User;
use App\Services\Mediclaim\Support\GeneratedPdfUploader;
use App\Services\Mediclaim\Support\IndianCurrencyFormatter;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Card issuance/lifecycle and the public QR-verify lookup.
 *
 * PDF rendering (B6): generate() renders `resources/views/mediclaim/card.blade.php`
 * via dompdf and attaches it through the existing DocumentService exactly the
 * way ClaimDocumentController (B4) attaches a claim document — upload +
 * MediclaimDocumentLink row (`linkable_type` => MediclaimCard::class) — then
 * sets `document_id` on the card. verifyByToken() is unaffected by any of
 * this: it is a pure read against fields that existed before B6 and never
 * touches `document_id` or any PDF, so its public response shape needed no
 * change (re-confirmed while implementing B6 — see class-level note below).
 *
 * dompdf (barryvdh/laravel-dompdf) is NOT installed in this environment as of
 * B6 — `composer require` was attempted and reverted (unrelated side effects
 * on this shared network drive), and installing it is a separate, already
 * tracked operational follow-up (see the plan's "Operational follow-ups").
 * `Pdf::loadView(...)` below is written against that package's real,
 * documented facade API and will resolve once it lands; until then a card's
 * PDF-rendering step will throw a "class not found" error. That failure is
 * deliberately NOT swallowed here (contrast with the best-effort guard added
 * to `ClaimWorkflowService::directorFinalApproval()` for the final claim-form
 * PDF) — see renderAndAttachCardPdf()'s docblock for why.
 */
class MediclaimCardService
{
    /**
     * Issues a new active card for a member. The plaintext token is returned
     * alongside the model — the ONLY time it is ever available; only
     * `hash('sha256', $token)` is persisted.
     *
     * @return array{card: MediclaimCard, token: string}
     */
    public function generate(MediclaimMember $member, User $actor, ?Carbon $validFrom = null, ?Carbon $validTo = null): array
    {
        return DB::transaction(function () use ($member, $actor, $validFrom, $validTo) {
            $token = Str::random(48);

            $card = MediclaimCard::create([
                'member_id' => $member->id,
                'enrollment_id' => $member->enrollment_id,
                'card_number' => $this->nextCardNumber($member),
                'qr_token_hash' => hash('sha256', $token),
                'status' => 'active',
                'valid_from' => ($validFrom ?? now())->toDateString(),
                'valid_to' => $validTo?->toDateString(),
                'issued_at' => now(),
            ]);

            $document = $this->renderAndAttachCardPdf($card, $member, $actor, $token);
            $card->document_id = $document->id;
            $card->save();

            return ['card' => $card->fresh(), 'token' => $token];
        });
    }

    /**
     * Regenerates a member's card (member or policy change makes the current
     * one stale): creates a fresh row, points the old active card's
     * `superseded_by_card_id` at it, and never deletes the old row.
     *
     * Delegates to generate() for the new row, which (B6) already renders
     * and attaches a fresh card PDF — so a regenerated card gets a
     * regenerated PDF for free, with no separate wiring needed here.
     *
     * @return array{card: MediclaimCard, token: string}
     */
    public function regenerateIfStale(MediclaimMember $member, User $actor): array
    {
        return DB::transaction(function () use ($member, $actor) {
            $current = MediclaimCard::query()
                ->where('member_id', $member->id)
                ->where('status', 'active')
                ->lockForUpdate()
                ->first();

            $result = $this->generate($member, $actor);

            if ($current) {
                $current->status = 'superseded';
                $current->superseded_by_card_id = $result['card']->id;
                $current->save();
            }

            return $result;
        });
    }

    /**
     * Revokes a card. The hash is nulled (not just the status flipped) so a
     * revoked token stops matching even under a status-check bug elsewhere —
     * the unique index on `qr_token_hash` tolerates this since it is nullable.
     */
    public function revoke(MediclaimCard $card, User $actor): MediclaimCard
    {
        return DB::transaction(function () use ($card, $actor) {
            $locked = MediclaimCard::query()->lockForUpdate()->findOrFail($card->id);

            if ($locked->status === 'revoked') {
                return $locked;
            }

            $locked->status = 'revoked';
            $locked->qr_token_hash = null;
            $locked->revoked_at = now();
            $locked->revoked_by = $actor->id;
            $locked->save();

            return $locked;
        });
    }

    /**
     * Public-safe verification payload for the unauthenticated QR verify
     * endpoint (`GET /cards/verify/{token}`, B4/B6). Returns null for both
     * "no card ever had this token" and "the matching card is not active" —
     * an unauthenticated caller must never be able to tell "never existed"
     * apart from "revoked" (B6's identical-404 requirement); the caller is
     * responsible for rendering that null as a generic 404 and for logging
     * the attempt via MediclaimActivityLogSupport.
     *
     * Field whitelist matches the plan's B6 shape exactly. Never included:
     * DOB, diagnosis, claim history, documents, address, payment data,
     * employee code, or the raw (unmasked) member/policy number.
     *
     * @return array{valid:bool, member_name:?string, member_number_masked:string,
     *   policy_number_masked:string, company:?string, insurer_name:?string,
     *   valid_from:?string, valid_to:?string,
     *   approved_hospitals:list<array{name:string,city:?string}>,
     *   emergency_contact:?array{designation:?string,phone:?string}}|null
     */
    public function verifyByToken(string $plaintextToken): ?array
    {
        $hash = hash('sha256', $plaintextToken);

        $card = MediclaimCard::query()
            ->where('qr_token_hash', $hash)
            ->where('status', 'active')
            ->with(['member', 'enrollment.policyVersion.policy', 'enrollment.policyVersion.hospitals'])
            ->first();

        if (! $card || ! $card->member || ! $card->enrollment) {
            return null;
        }

        $member = $card->member;
        $policyVersion = $card->enrollment->policyVersion;
        $policy = $policyVersion?->policy;

        $hospitals = $policyVersion
            ? $policyVersion->hospitals->map(fn ($hospital) => ['name' => $hospital->name, 'city' => $hospital->city])->values()->all()
            : [];

        $contact = $this->resolvePrimaryContact($policyVersion);

        $companyName = $policy?->company_code
            ? Company::query()->where('code', $policy->company_code)->value('name')
            : null;

        return [
            'valid' => true,
            'member_name' => $member->full_name,
            'member_number_masked' => $this->maskTail((string) $card->card_number),
            'policy_number_masked' => $this->maskTail((string) $policy?->policy_code),
            'company' => $companyName ?? $policy?->company_code,
            'insurer_name' => $policy?->insurer_name,
            'valid_from' => optional($card->valid_from)->toDateString(),
            'valid_to' => optional($card->valid_to)->toDateString(),
            'approved_hospitals' => $hospitals,
            'emergency_contact' => $contact ? [
                'designation' => $contact->designation,
                'phone' => $contact->phone,
            ] : null,
        ];
    }

    /**
     * The network's primary escalation contact for a policy version — shared
     * by verifyByToken() (unchanged behaviour, just de-duplicated here) and
     * the card PDF's "Coordinator / Office Contact" field.
     */
    private function resolvePrimaryContact(?MediclaimPolicyVersion $policyVersion): ?MediclaimHospitalContact
    {
        if (! $policyVersion) {
            return null;
        }

        $hospitalIds = $policyVersion->hospitals->pluck('id')->all();

        if ($hospitalIds === []) {
            return null;
        }

        return MediclaimHospitalContact::query()
            ->whereIn('hospital_id', $hospitalIds)
            ->where('is_active', true)
            ->orderBy('escalation_priority')
            ->first();
    }

    /**
     * Renders `resources/views/mediclaim/card.blade.php` via dompdf and
     * uploads it through the existing DocumentService, linking the result to
     * `$card` via a MediclaimDocumentLink row exactly the way
     * `ClaimDocumentController` (B4) links a claim document — the only
     * difference is `linkable_type` => MediclaimCard::class instead of
     * MediclaimClaim::class. Uses the INSURANCE_CARD document type slug
     * (pre-existing in DocumentType's catalogue) since that is what this
     * artifact fundamentally is.
     *
     * JUDGMENT CALL: unlike the final claim-form PDF hook added to
     * `ClaimWorkflowService::directorFinalApproval()`, this method is
     * deliberately NOT wrapped in a best-effort try/catch and is NOT
     * deferred to run after the enclosing transaction commits. A card's
     * entire purpose per the plan is to BE the printable/scannable artifact
     * — `generate()` returning an "active" card whose `document_id` silently
     * stayed null because rendering failed would be worse than generate()
     * failing outright and rolling back, because nothing downstream
     * (the issuance endpoint, the employee's card list) would ever know to
     * retry. `directorFinalApproval()` is different: there the record being
     * created (the decision itself) is the deliverable, and the PDF is only
     * a paper trail of a decision that has already legitimately happened —
     * see that method's docblock for the reasoning in full.
     *
     * @throws RuntimeException if the member has no resolvable employee to
     *   own the document under (should not happen — `employee_user_id` is a
     *   required FK on `mediclaim_members` — but this is a document-ownership
     *   precondition worth failing loudly on rather than silently skipping).
     */
    private function renderAndAttachCardPdf(MediclaimCard $card, MediclaimMember $member, User $actor, string $plaintextToken): Document
    {
        $member->loadMissing(['employee', 'enrollment.policyVersion.policy', 'enrollment.policyVersion.hospitals']);

        $employee = $member->employee;

        if (! $employee) {
            throw new RuntimeException("Cannot render a Mediclaim card PDF: member #{$member->id} has no resolvable employee.");
        }

        $enrollment = $member->enrollment;
        $policyVersion = $enrollment?->policyVersion;
        $policy = $policyVersion?->policy;

        $hospitals = $policyVersion
            ? $policyVersion->hospitals->map(fn ($hospital) => ['name' => $hospital->name, 'city' => $hospital->city])->values()->all()
            : [];

        $contact = $this->resolvePrimaryContact($policyVersion);

        $companyName = $policy?->company_code
            ? Company::query()->where('code', $policy->company_code)->value('name')
            : null;

        $frontendUrl = rtrim((string) config('services.frontend_url'), '/');
        $verifyUrl = $frontendUrl !== ''
            ? $frontendUrl . '/mediclaim/verify/' . urlencode($plaintextToken)
            : null;

        $rules = (array) ($policyVersion?->rules ?? []);

        $pdfBytes = Pdf::loadView('mediclaim.card', [
            'card' => $card,
            'member' => $member,
            'employee' => $employee,
            'companyName' => $companyName ?? $policy?->company_code,
            'memberNumberMasked' => $this->maskTail((string) $card->card_number),
            'policyNumberMasked' => $this->maskTail((string) $policy?->policy_code),
            'floaterLimitFormatted' => IndianCurrencyFormatter::format($rules['floater_limit_amount'] ?? null),
            'hospitals' => $hospitals,
            'contact' => $contact,
            'verifyUrl' => $verifyUrl,
        ])->setPaper('a6', 'landscape')->output();

        $version = GeneratedPdfUploader::upload(
            $pdfBytes,
            sprintf('mediclaim-card-%s.pdf', $card->card_number ?: $card->id),
            $employee,
            'INSURANCE_CARD',
            $actor->id,
            // Scoped per covered MEMBER (not per card): regenerating the SAME
            // member's card correctly versions the SAME Document, while a
            // DIFFERENT member's card — same employee, same INSURANCE_CARD
            // type — gets its own Document instead of silently becoming a
            // new version of the first member's card (see DocumentService's
            // reserveVersion()/upload() docblocks for why this is needed).
            sprintf('mediclaim_card:%d', $member->id)
        );

        MediclaimDocumentLink::create([
            'document_id' => $version->document_id,
            'linkable_type' => MediclaimCard::class,
            'linkable_id' => $card->id,
            'document_role' => 'INSURANCE_CARD',
            'created_by' => $actor->id,
        ]);

        return $version->document()->firstOrFail();
    }

    private function maskTail(string $value): string
    {
        $value = trim($value);

        if ($value === '') {
            return '';
        }

        return 'XXXX-' . mb_substr($value, -4);
    }

    private function nextCardNumber(MediclaimMember $member): string
    {
        return sprintf('MCC-%d-%s', $member->id, strtoupper(Str::random(6)));
    }
}
