<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class CandidateTag extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name', 'color', 'company_code', 'unit', 'created_by',
    ];

    public function candidates()
    {
        return $this->belongsToMany(Candidate::class, 'candidate_candidate_tag')
            ->withTimestamps();
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}