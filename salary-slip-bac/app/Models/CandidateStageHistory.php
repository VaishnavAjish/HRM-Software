<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CandidateStageHistory extends Model
{
    public $timestamps = false;

    protected $fillable = ['candidate_id', 'from_stage', 'to_stage', 'changed_by', 'notes', 'created_at'];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function candidate()
    {
        return $this->belongsTo(Candidate::class, 'candidate_id');
    }

    public function changedBy()
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
