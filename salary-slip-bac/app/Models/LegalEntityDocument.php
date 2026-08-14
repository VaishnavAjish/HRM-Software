<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * legal_entity_documents — documents attached to a legal entity (02.02).
 *
 * Incorporation/registration/tax/statutory documents. `document_id` references
 * an uploaded document when one exists; expiry tracking keeps history without
 * hard deletes.
 */
class LegalEntityDocument extends Model
{
    public const KINDS = ['incorporation', 'registration', 'tax', 'statutory', 'board_resolution', 'bank_proof', 'other'];

    protected $fillable = [
        'legal_entity_id',
        'document_kind',
        'title',
        'document_id',
        'reference_number',
        'issued_on',
        'expires_on',
        'is_active',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'issued_on' => 'date',
            'expires_on' => 'date',
            'is_active' => 'boolean',
        ];
    }

    public function legalEntity()
    {
        return $this->belongsTo(LegalEntity::class);
    }

    public function document()
    {
        return $this->belongsTo(Document::class);
    }
}
