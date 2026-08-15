<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class CandidateNote extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'candidate_id', 'note', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'candidate_id' => 'integer',
        ];
    }

    public function candidate()
    {
        return $this->belongsTo(Candidate::class, 'candidate_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}