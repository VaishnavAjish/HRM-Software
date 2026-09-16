<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_rule_book_items — one row of rule text, ordered within its
 * parent (language) rule book via sort_order.
 */
class MediclaimRuleBookItem extends Model
{
    protected $table = 'mediclaim_rule_book_items';

    protected $fillable = [
        'rule_book_id',
        'rule_text',
        'sort_order',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
        ];
    }

    public function ruleBook()
    {
        return $this->belongsTo(MediclaimRuleBook::class, 'rule_book_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
