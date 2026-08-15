<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class TalentPool extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name', 'description', 'color', 'company_code', 'unit', 'created_by',
    ];

    public function candidates()
    {
        return $this->belongsToMany(Candidate::class, 'candidate_talent_pool')
            ->withPivot('added_by')
            ->withTimestamps();
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}