<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_rule_books — one row per (company, language) rule-book version,
 * draft/published/archived. The actual rule text lives in child
 * `mediclaim_rule_book_items` rows (items(), hasMany, ordered by
 * sort_order), not as an uploaded PDF. `language_id` points at
 * `mediclaim_rule_book_languages`, a full CRUD resource HR manages
 * separately (not a fixed EN/HI/GU triplet).
 */
class MediclaimRuleBook extends Model
{
    public const STATUSES = ['draft', 'published', 'archived'];

    protected $fillable = [
        'company_code',
        'language_id',
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

    public function language()
    {
        return $this->belongsTo(MediclaimRuleBookLanguage::class, 'language_id');
    }

    public function items()
    {
        return $this->hasMany(MediclaimRuleBookItem::class, 'rule_book_id')->orderBy('sort_order');
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
