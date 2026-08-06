<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class QuizAttempt extends Model
{
    protected $fillable = [
        'quiz_id', 'candidate_id', 'interview_id', 'access_token', 'status',
        'started_at', 'submitted_at', 'link_expires_at', 'scheduled_start_at',
        'duration_minutes', 'answers', 'total_questions', 'correct_count',
        'score', 'passed', 'violation_count', 'proctor_events', 'ip_address',
        'user_agent', 'company_code', 'unit', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'answers' => 'array',
            'proctor_events' => 'array',
            'passed' => 'boolean',
            'started_at' => 'datetime',
            'submitted_at' => 'datetime',
            'link_expires_at' => 'datetime',
            'scheduled_start_at' => 'datetime',
        ];
    }

    /** True while a scheduled start gate exists and hasn't opened yet. */
    public function notYetOpen(): bool
    {
        return $this->scheduled_start_at !== null && now()->lessThan($this->scheduled_start_at);
    }

    public function quiz()
    {
        return $this->belongsTo(TrainingQuiz::class, 'quiz_id');
    }

    public function candidate()
    {
        return $this->belongsTo(Candidate::class, 'candidate_id');
    }

    public function interview()
    {
        return $this->belongsTo(Interview::class, 'interview_id');
    }

    /** Wall-clock deadline for an in-progress attempt, or null before it starts. */
    public function deadline(): ?Carbon
    {
        return $this->started_at
            ? $this->started_at->copy()->addMinutes($this->duration_minutes)
            : null;
    }

    public function isTimedOut(): bool
    {
        $deadline = $this->deadline();

        return $deadline !== null && now()->greaterThan($deadline);
    }

    /** Terminal states can never be reopened — one attempt per assignment. */
    public function isFinished(): bool
    {
        return in_array($this->status, ['submitted', 'terminated', 'expired'], true);
    }
}
