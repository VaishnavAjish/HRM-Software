<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One approved full-Aadhaar export.
 *
 * Bound to a single actor, a single target record and a single export type, and
 * spent on first use for a PDF download. Carries no Aadhaar value.
 */
class AadhaarExportAuthorization extends Model
{
    protected $fillable = [
        'uuid', 'token_hash', 'actor_user_id', 'target_user_id', 'surface',
        'export_type', 'permission', 'organization_code', 'unit',
        'expires_at', 'used_at', 'request_id', 'audit_log_id',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'used_at' => 'datetime',
    ];

    /**
     * The token hash is not a secret in the same way the token is, but there is
     * no reason for it to travel in a serialised model either.
     */
    protected $hidden = ['token_hash'];

    /** Hash a raw token for storage or lookup. Never store the raw value. */
    public static function hashToken(string $rawToken): string
    {
        return hash('sha256', $rawToken);
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    public function isUsed(): bool
    {
        return $this->used_at !== null;
    }

    /**
     * Whether this authorization may still authorise $exportType on $target for
     * $actor.
     *
     * Every clause matters independently: an authorization issued for a PRINT of
     * one appointment must not download a PDF, must not reach another record and
     * must not be replayed by another user who somehow obtained the token.
     */
    public function permits(int $actorId, int $targetId, string $exportType): bool
    {
        return (int) $this->actor_user_id === $actorId
            && (int) $this->target_user_id === $targetId
            && $this->export_type === strtoupper($exportType)
            && ! $this->isExpired()
            && ! $this->isUsed();
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }

    public function target(): BelongsTo
    {
        return $this->belongsTo(User::class, 'target_user_id');
    }
}
