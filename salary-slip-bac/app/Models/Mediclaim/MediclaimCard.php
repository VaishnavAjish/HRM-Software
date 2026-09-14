<?php

namespace App\Models\Mediclaim;

use App\Models\Document;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_cards — one card per approved member. Only
 * `hash('sha256', $token)` is ever persisted in `qr_token_hash`; the
 * plaintext token is returned once at generation and never stored.
 * Regeneration creates a new row and points `superseded_by_card_id` at the
 * old one (never deletes); revoke() nulls the hash so a revoked token
 * stops matching even under a status-check bug.
 *
 * `document_id` (B6, added by migration 2026_09_15_000029 — see that file's
 * docblock for why it's a separate migration rather than part of B1) points
 * at the rendered card PDF, uploaded through the existing DocumentService
 * and linked via a MediclaimDocumentLink row exactly like a claim document.
 */
class MediclaimCard extends Model
{
    public const STATUSES = ['active', 'revoked', 'superseded', 'expired'];

    protected $fillable = [
        'member_id',
        'enrollment_id',
        'card_number',
        'document_id',
        'qr_token_hash',
        'status',
        'valid_from',
        'valid_to',
        'superseded_by_card_id',
        'issued_at',
        'revoked_at',
        'revoked_by',
    ];

    protected function casts(): array
    {
        return [
            'valid_from' => 'date',
            'valid_to' => 'date',
            'issued_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function member()
    {
        return $this->belongsTo(MediclaimMember::class, 'member_id');
    }

    public function enrollment()
    {
        return $this->belongsTo(MediclaimEnrollment::class, 'enrollment_id');
    }

    /** The rendered card PDF (B6), or null until MediclaimCardService::generate()
     *  has successfully attached one. */
    public function document()
    {
        return $this->belongsTo(Document::class, 'document_id');
    }

    /** The newer card that replaced this one, if any. */
    public function supersededByCard()
    {
        return $this->belongsTo(MediclaimCard::class, 'superseded_by_card_id');
    }

    /** The older card this one replaced, if any. */
    public function replacedCard()
    {
        return $this->hasOne(MediclaimCard::class, 'superseded_by_card_id');
    }

    public function revokedBy()
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }
}
