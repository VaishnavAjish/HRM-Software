<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Candidate extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'requisition_id', 'name', 'email', 'phone', 'experience_years',
        'current_company', 'current_designation', 'skills', 'resume_path',
        'resume_original_name', 'source', 'recruiter_id', 'priority', 'stage',
        'rating', 'notes', 'rejection_reason', 'company_code', 'unit', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'skills' => 'array',
        ];
    }

    public function requisition()
    {
        return $this->belongsTo(JobRequisition::class, 'requisition_id');
    }

    public function recruiter()
    {
        return $this->belongsTo(User::class, 'recruiter_id');
    }

    public function stageHistory()
    {
        return $this->hasMany(CandidateStageHistory::class, 'candidate_id')->orderBy('created_at');
    }

    public function interviews()
    {
        return $this->hasMany(Interview::class, 'candidate_id');
    }

    public function offers()
    {
        return $this->hasMany(Offer::class, 'candidate_id');
    }
}
