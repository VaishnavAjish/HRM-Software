<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CandidateEducation extends Model
{
    protected $fillable = [
        'candidate_account_id', 'institution', 'degree', 'field_of_study',
        'start_year', 'end_year', 'grade', 'description',
    ];

    public function candidateAccount()
    {
        return $this->belongsTo(CandidateAccount::class, 'candidate_account_id');
    }
}
