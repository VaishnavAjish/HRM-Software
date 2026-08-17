<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CandidateSavedJob extends Model
{
    protected $fillable = ['candidate_account_id', 'job_requisition_id'];

    public function candidateAccount()
    {
        return $this->belongsTo(CandidateAccount::class, 'candidate_account_id');
    }

    public function requisition()
    {
        return $this->belongsTo(JobRequisition::class, 'job_requisition_id');
    }
}
