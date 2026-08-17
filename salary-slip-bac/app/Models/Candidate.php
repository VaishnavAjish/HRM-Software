<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Candidate extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'requisition_id', 'candidate_account_id', 'name', 'email', 'phone', 'experience_years',
        'current_company', 'current_designation', 'skills', 'resume_path',
        'resume_original_name', 'source', 'recruiter_id', 'priority', 'stage',
        'rating', 'notes', 'rejection_reason', 'ats_score', 'ats_score_breakdown', 'ats_scored_at',
        'ats_score_source', 'company_code', 'unit', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'skills' => 'array',
            'ats_score_breakdown' => 'array',
            'ats_scored_at' => 'datetime',
        ];
    }

    public function candidateAccount()
    {
        return $this->belongsTo(CandidateAccount::class, 'candidate_account_id');
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

    public function documents()
    {
        return $this->hasMany(CandidateDocument::class, 'candidate_id');
    }

    public function offers()
    {
        return $this->hasMany(Offer::class, 'candidate_id');
    }

    /** Wave 4 — Candidate CRM relations. */
    public function tags()
    {
        return $this->belongsToMany(CandidateTag::class, 'candidate_candidate_tag')
            ->withTimestamps();
    }

    public function notes()
    {
        return $this->hasMany(CandidateNote::class, 'candidate_id')->orderByDesc('created_at');
    }

    public function communications()
    {
        return $this->hasMany(CandidateCommunication::class, 'candidate_id')->orderByDesc('created_at');
    }
}
