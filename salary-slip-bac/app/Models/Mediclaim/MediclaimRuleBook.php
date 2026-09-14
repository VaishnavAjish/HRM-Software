<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_rule_books — draft/published/archived rule-book metadata. The
 * actual trilingual (EN/HI/GU) PDF files are uploaded through the existing
 * DocumentService and joined in via `mediclaim_document_links`
 * (documentLinks(), morphMany), never stored directly on this row.
 */
class MediclaimRuleBook extends Model
{
    public const STATUSES = ['draft', 'published', 'archived'];

    protected $fillable = [
        'company_code',
        'version_label',
        'status',
        'effective_from',
        'effective_to',
        'published_at',
        'published_by',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'effective_from' => 'date',
            'effective_to' => 'date',
            'published_at' => 'datetime',
        ];
    }

    public function documentLinks()
    {
        return $this->morphMany(MediclaimDocumentLink::class, 'linkable');
    }

    public function acknowledgedBy()
    {
        return $this->belongsToMany(User::class, 'mediclaim_rule_book_acknowledgements', 'rule_book_id', 'user_id')
            ->withPivot(['acknowledged_at', 'ip_address', 'user_agent'])
            ->withTimestamps();
    }

    public function publishedBy()
    {
        return $this->belongsTo(User::class, 'published_by');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
