<?php

namespace App\Services\Documents;

use App\Exceptions\DocumentException;
use App\Models\Document;
use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimClaimAssignment;
use App\Models\Mediclaim\MediclaimDocumentLink;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

/**
 * Record-level authorization for documents, layered on the app's existing
 * numeric roles (0 super admin, 1 company admin, 2 unit manager, 4 agent,
 * everything else = employee).
 *
 * Frontend gating is presentation only — every endpoint calls through here.
 */
class DocumentAuthorizer
{
    public const CREATE     = 'documents.create';
    public const READ       = 'documents.read';
    public const READ_OWN   = 'documents.read_own';
    public const REPLACE    = 'documents.replace';
    public const DELETE     = 'documents.delete';
    public const RESTORE    = 'documents.restore';
    public const DOWNLOAD   = 'documents.download';
    public const MANAGE_ALL = 'documents.manage_all';
    public const PERMANENT_DELETE = 'documents.permanent_delete';

    public static function isSuperAdmin(?User $user): bool
    {
        return $user && (int) $user->role === 0;
    }

    public static function isAdmin(?User $user): bool
    {
        return $user && in_array((int) $user->role, [0, 1], true);
    }

    public static function isManager(?User $user): bool
    {
        return $user && (int) $user->role === 2;
    }

    /** Company/unit scoping mirrors how employee listings are already scoped. */
    public static function canAccessOwner(?User $actor, ?User $owner): bool
    {
        if (!$actor || !$owner) {
            return false;
        }

        if (self::isSuperAdmin($actor)) {
            return true;
        }

        if ($actor->id === $owner->id) {
            return true;
        }

        if ((int) $actor->role === 1) {
            return (new \App\Services\Authorization\ScopeMatcher())->tenantMatches($actor->company_code, $owner->company_code, false);
        }

        if ((int) $actor->role === 2) {
            return (new \App\Services\Authorization\ScopeMatcher())->tenantMatches($actor->company_code, $owner->company_code, false)
                && $actor->unit === $owner->unit;
        }

        // Agents see records they created; plain employees see only their own.
        if ($actor->type === 'agent') {
            return (int) $owner->added_by === (int) $actor->id;
        }

        return false;
    }

    public static function canView(?User $actor, Document $document): bool
    {
        if (!$actor) {
            return false;
        }

        if (self::isSuperAdmin($actor)) {
            return true;
        }

        if ($document->user_id && (int) $document->user_id === (int) $actor->id) {
            return true;
        }

        if (self::canViewViaMediclaimClaim($actor, $document)) {
            return true;
        }

        return self::canAccessOwner($actor, $document->owner);
    }

    /**
     * Reconciliation #4: a claim document is a real `Document`/`DocumentVersion`
     * row, joined to its `MediclaimClaim` through the polymorphic
     * `mediclaim_document_links` table rather than a bespoke claim-only
     * document table — precisely so `DocumentViewerModal.jsx` and
     * `documentV1Api.viewUrl`/`downloadUrl` on the frontend keep working
     * completely unmodified. That reuse only holds if THIS authorizer (which
     * both the generic `Api\V1\DocumentController` endpoints and
     * `Mediclaim\ClaimDocumentController` ultimately authorize through) knows
     * how to resolve a claim document's access — so the branch lives here
     * rather than being duplicated as bespoke logic inside
     * `ClaimDocumentController` alone.
     *
     * Access mirrors `MediclaimClaim::scopeVisibleTo()`, with one deliberate
     * narrowing for the employee's own manager: a manager may not view a
     * claim's supporting medical documents (bills, discharge summaries,
     * prescriptions) merely by being `assigned_manager_id` — they must first
     * have recorded the confidentiality acknowledgement
     * `ClaimWorkflowService::acknowledgeConfidentiality()` gates their
     * *decision* on. `scopeVisibleTo()` itself does not enforce that ack (it
     * only gates deciding, via `managerDecision()`), because merely seeing
     * that a claim exists is not the same sensitivity level as reading its
     * medical evidence.
     *
     * Guarded by `Schema::hasTable()` (unlike `MediclaimClaimEventLog`, this
     * class is NOT behind `module.schema:mediclaim` — the generic document
     * endpoints it also serves run on every deployment, migrated or not) so
     * a pre-migration environment degrades to "no Mediclaim documents exist
     * yet", never a 500 on every unrelated document view.
     */
    private static function canViewViaMediclaimClaim(?User $actor, Document $document): bool
    {
        if (!$actor || !Schema::hasTable('mediclaim_document_links')) {
            return false;
        }

        $link = MediclaimDocumentLink::query()
            ->where('document_id', $document->id)
            ->where('linkable_type', MediclaimClaim::class)
            ->first();

        if (!$link) {
            return false;
        }

        $claim = MediclaimClaim::find($link->linkable_id);

        if (!$claim) {
            return false;
        }

        if ((int) $claim->employee_user_id === (int) $actor->id) {
            return true;
        }

        if ((int) $claim->assigned_manager_id === (int) $actor->id) {
            return $claim->assignments()
                ->where('stage', MediclaimClaimAssignment::STAGE_MANAGER_REVIEW)
                ->where('assigned_to', $actor->id)
                ->whereNotNull('confidentiality_ack_at')
                ->exists();
        }

        return MediclaimClaim::query()->whereKey($claim->id)->awaitingReviewBy($actor)->exists();
    }

    /**
     * Deliberately NOT `self::canView()` — a claim document's reviewer
     * branch above (`canViewViaMediclaimClaim()`) grants read access to
     * whoever currently holds the claim for review, but replacing an
     * employee's submitted evidence is not a reviewer action. Replace stays
     * scoped to the same base owner/self check `canView()` starts from,
     * without the Mediclaim reviewer branch.
     */
    public static function canReplace(?User $actor, Document $document): bool
    {
        if (!$actor) {
            return false;
        }

        if (self::isSuperAdmin($actor)) {
            return true;
        }

        if ($document->user_id && (int) $document->user_id === (int) $actor->id) {
            return true;
        }

        return self::canAccessOwner($actor, $document->owner);
    }

    public static function canDelete(?User $actor, Document $document): bool
    {
        // Deletion is not self-service — an employee cannot remove their own
        // compliance documents.
        return self::isAdmin($actor) || self::isManager($actor)
            ? self::canView($actor, $document)
            : false;
    }

    public static function canRestore(?User $actor, Document $document): bool
    {
        return self::isAdmin($actor) && self::canView($actor, $document);
    }

    public static function canPermanentlyDelete(?User $actor): bool
    {
        return self::isSuperAdmin($actor);
    }

    /** Throws (and audits) instead of returning false. */
    public static function authorize(bool $allowed, string $permission, ?Document $document = null): void
    {
        if ($allowed) {
            return;
        }

        DocumentAudit::denied($permission, $document);

        throw DocumentException::accessDenied();
    }

    /** Actions the frontend may render for this actor. */
    public static function actionsFor(?User $actor, Document $document): array
    {
        return [
            'view'     => self::canView($actor, $document),
            'download' => self::canView($actor, $document),
            'replace'  => self::canReplace($actor, $document),
            'delete'   => self::canDelete($actor, $document),
            'restore'  => self::canRestore($actor, $document),
        ];
    }
}
