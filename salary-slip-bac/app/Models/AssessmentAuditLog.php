<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AssessmentAuditLog extends Model
{
    protected $fillable = [
        'quiz_attempt_id', 'candidate_id', 'quiz_id', 'company_code', 'actor_user_id',
        'action', 'ip_address', 'user_agent', 'request_id', 'metadata',
    ];

    protected function casts(): array
    {
        return ['metadata' => 'array'];
    }

    public function attempt()
    {
        return $this->belongsTo(QuizAttempt::class, 'quiz_attempt_id');
    }

    public function candidate()
    {
        return $this->belongsTo(Candidate::class);
    }

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
