<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_rule_book_languages — a language HR has added for the Mediclaim
 * rule book. `native_name` is the language's own name written in itself
 * (e.g. "हिन्दी"), shown wherever the language is displayed; `name` is a
 * plain reference label (e.g. "Hindi").
 */
class MediclaimRuleBookLanguage extends Model
{
    protected $table = 'mediclaim_rule_book_languages';

    protected $fillable = [
        'company_code',
        'name',
        'native_name',
        'created_by',
        'updated_by',
    ];

    public function ruleBooks()
    {
        return $this->hasMany(MediclaimRuleBook::class, 'language_id');
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
