<?php

namespace App\Services\Documents;

use App\Exceptions\DocumentException;
use App\Models\Document;
use App\Models\User;

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
            $actorCodes = array_filter(array_map('trim', explode(',', (string)$actor->company_code)));
            if (in_array('all', $actorCodes) || in_array('all-companies', $actorCodes)) return true;
            return in_array((string)$owner->company_code, $actorCodes, true);
        }

        if ((int) $actor->role === 2) {
            return $actor->company_code === $owner->company_code && $actor->unit === $owner->unit;
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

        return self::canAccessOwner($actor, $document->owner);
    }

    public static function canReplace(?User $actor, Document $document): bool
    {
        return self::canView($actor, $document);
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
