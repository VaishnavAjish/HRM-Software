<?php

namespace App\Models\Mediclaim;

use App\Models\Document;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_document_links — polymorphic join between the existing
 * `documents` table and whichever Mediclaim record a document belongs to
 * (claim, rule book, card, intimation, member change request). Deliberately
 * not a bespoke claim-only document table: DocumentService/DocumentViewerModal
 * stay reusable unmodified, and DocumentAuthorizer gets one new branch that
 * resolves access through this link.
 */
class MediclaimDocumentLink extends Model
{
    protected $fillable = [
        'document_id',
        'linkable_type',
        'linkable_id',
        'document_role',
        'created_by',
    ];

    public function document()
    {
        return $this->belongsTo(Document::class, 'document_id');
    }

    public function linkable()
    {
        return $this->morphTo();
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
